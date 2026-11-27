/* A semana lado a lado com a planilha (#133): a foto crua das abas da planilha da edição, que o n8n manda de hora em
   hora (POST /api/publico/edicao/foto, com o EDICAO_FOTO_TOKEN; veja o README). Fica no SQLite do PROMeiro (e por isso
   no backup), numa linha por aba, só quando a aba muda: a aba igual à última foto dela só ganha a hora da confirmação.
   - edicao_fotos: a aba, o dia (lido da grade pelo PROMeiro, ou a pista do n8n), o hash da grade e das mesclas, a hora
     da leitura no n8n (lida_em), a da chegada e a da última confirmação, de onde veio (o fluxo e a execução), a lista
     de todas as abas da planilha naquela leitura e a grade e as mesclas (JSON).
   A limpeza: passados 180 dias da chegada, fica só a última foto de cada aba em cada dia.
   SQL portável (vale também no Postgres): sem INSERT OR REPLACE, sem json_extract. */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { FORMATO_DA_FOTO, diaDaFoto } from '../src/modelo/fotoDaPlanilha.ts';

/** O endereço da foto, embaixo de /api/publico/ (fora do login: o n8n não passa pelo Cloudflare Access). */
export const ROTA_DA_FOTO = '/api/publico/edicao/foto';
/** O corpo de uma rodada: as 7 abas têm uns 50 KB; 1 MB é folga de sobra. */
export const LIMITE_DA_FOTO = 1_048_576;
/** Passado isto, fica só a última foto de cada aba em cada dia. */
export const GUARDAR_TODAS_POR_DIAS = 180;
/** Os limites de uma foto: bem acima de uma aba de verdade (A1:AD80), para um pedido errado não encher o banco. */
const LIMITES = { abas: 40, nome: 60, linhas: 500, colunas: 100, celula: 5000, mesclas: 2000, texto: 200 };

const erro = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });

/** O token do cabeçalho `Authorization: Bearer …` confere com o esperado? Sem o esperado, nunca (a rota fica desligada).
    Vale para as rotas com Bearer: a foto da edição (#133) e a prévia de filmes do e-mail (#157), do n8n, e a API das
    Produções (#185), do dashboard de um produtor. */
export function tokenBearerConfere(cabecalho, esperado) {
  const certo = String(esperado ?? '').trim();
  const veio = /^Bearer\s+(.+)$/i.exec(String(cabecalho ?? '').trim())?.[1]?.trim() ?? '';
  if (!certo || veio.length !== certo.length) return false;
  return timingSafeEqual(Buffer.from(veio), Buffer.from(certo));
}

/** O pacote do n8n conferido (o formato 1): as abas com a grade de textos e as mesclas. Lança (400) o que não é. */
export function fotoDoPedido(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw erro('Falta a foto da planilha.');
  if (corpo.formato !== FORMATO_DA_FOTO) throw erro(`Formato da foto desconhecido (este PROMeiro lê o ${FORMATO_DA_FOTO}).`);
  const lidaEm = typeof corpo.lida_em === 'string' ? Date.parse(corpo.lida_em) : NaN;
  if (Number.isNaN(lidaEm)) throw erro('Falta a hora da leitura (lida_em, ISO).');
  const texto = (v) => (typeof v === 'string' ? v.slice(0, LIMITES.texto) : v == null ? '' : String(v).slice(0, LIMITES.texto));
  if (!Array.isArray(corpo.abas) || !corpo.abas.length || corpo.abas.length > LIMITES.abas) throw erro(`Faltam as abas (de 1 a ${LIMITES.abas}).`);
  const nomes = new Set();
  const abas = corpo.abas.map((a) => {
    const aba = typeof a?.aba === 'string' ? a.aba.trim() : '';
    if (!aba || aba.length > LIMITES.nome || nomes.has(aba)) throw erro('Aba sem nome, com nome longo demais ou repetida.');
    nomes.add(aba);
    const linhas = a.linhas;
    if (!Array.isArray(linhas) || linhas.length > LIMITES.linhas) throw erro(`A grade da aba ${aba} não é uma lista de linhas (até ${LIMITES.linhas}).`);
    for (const l of linhas)
      if (!Array.isArray(l) || l.length > LIMITES.colunas || l.some((c) => typeof c !== 'string' || c.length > LIMITES.celula)) throw erro(`A grade da aba ${aba} tem uma linha que não é de textos (até ${LIMITES.colunas} células).`);
    const mesclas = a.mesclas ?? [];
    if (!Array.isArray(mesclas) || mesclas.length > LIMITES.mesclas || mesclas.some((m) => !Array.isArray(m) || m.length !== 4 || m.some((n) => !Number.isInteger(n) || n < 0))) throw erro(`As mesclas da aba ${aba} não são [linha, coluna, linha, coluna].`);
    return { aba, intervalo: texto(a.intervalo), dia: diaDaFoto(linhas, a.data_da_aba), linhas, mesclas };
  });
  const todas = Array.isArray(corpo.todas_as_abas) ? corpo.todas_as_abas.slice(0, LIMITES.abas * 2).map(texto) : [];
  const origem = { fluxo: texto(corpo.origem?.fluxo), execucao: texto(corpo.origem?.execucao) };
  return { lidaEm: new Date(lidaEm).toISOString(), origem, todas, abas };
}

/**
 * @param db o SQLite do PROMeiro (a tabela é criada aqui)
 * @param o.agora () => Date (os testes mexem no relógio)
 */
export function criarFotosDaEdicao(db, { agora = () => new Date() } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS edicao_fotos (
      id TEXT PRIMARY KEY,
      aba TEXT NOT NULL,
      dia TEXT,
      hash TEXT NOT NULL,
      lida_em TEXT NOT NULL,
      recebida_em TEXT NOT NULL,
      confirmada_em TEXT NOT NULL,
      origem TEXT NOT NULL,
      todas_as_abas TEXT NOT NULL,
      linhas TEXT NOT NULL,
      mesclas TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS edicao_fotos_aba ON edicao_fotos (aba, recebida_em);
    CREATE INDEX IF NOT EXISTS edicao_fotos_dia ON edicao_fotos (dia, lida_em);
  `);
  const q = {
    ultimaDaAba: db.prepare('SELECT id, hash FROM edicao_fotos WHERE aba = ? ORDER BY recebida_em DESC, lida_em DESC LIMIT 1'),
    gravar: db.prepare('INSERT INTO edicao_fotos (id, aba, dia, hash, lida_em, recebida_em, confirmada_em, origem, todas_as_abas, linhas, mesclas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    confirmar: db.prepare('UPDATE edicao_fotos SET confirmada_em = ? WHERE id = ?'),
    doDia: db.prepare('SELECT id, aba, dia, lida_em, recebida_em, confirmada_em, origem, todas_as_abas, linhas, mesclas FROM edicao_fotos WHERE dia = ? ORDER BY lida_em DESC, recebida_em DESC LIMIT 1'),
    antigas: db.prepare('SELECT id, aba, dia, recebida_em FROM edicao_fotos WHERE recebida_em < ?'),
    ultimaDoDia: db.prepare("SELECT id FROM edicao_fotos WHERE aba = ? AND COALESCE(dia, '') = ? ORDER BY recebida_em DESC, lida_em DESC LIMIT 1"),
    apagar: db.prepare('DELETE FROM edicao_fotos WHERE id = ?'),
    quantas: db.prepare('SELECT COUNT(*) AS n FROM edicao_fotos'),
  };
  const hashDa = (a) => createHash('sha256').update(JSON.stringify([a.linhas, a.mesclas])).digest('hex');

  /** Passados 180 dias da chegada, só a última foto de cada aba em cada dia fica. @returns quantas saíram */
  function limpar() {
    const limite = new Date(agora().getTime() - GUARDAR_TODAS_POR_DIAS * 86_400_000).toISOString();
    let n = 0;
    for (const f of q.antigas.all(limite)) {
      if (q.ultimaDoDia.get(f.aba, f.dia ?? '')?.id === f.id) continue;
      q.apagar.run(f.id);
      n++;
    }
    return n;
  }

  return {
    /**
     * Guarda a foto conferida (de `fotoDoPedido`): a aba que mudou desde a última foto dela vira uma linha nova; a
     * igual só ganha a hora da confirmação. Depois, a limpeza. @returns { gravadas, iguais }
     */
    receber(foto) {
      const em = agora().toISOString();
      let gravadas = 0;
      let iguais = 0;
      db.exec('BEGIN');
      try {
        for (const a of foto.abas) {
          const hash = hashDa(a);
          const ultima = q.ultimaDaAba.get(a.aba);
          if (ultima?.hash === hash) {
            q.confirmar.run(em, ultima.id);
            iguais++;
            continue;
          }
          q.gravar.run(randomUUID(), a.aba, a.dia, hash, foto.lidaEm, em, em, JSON.stringify(foto.origem), JSON.stringify(foto.todas), JSON.stringify(a.linhas), JSON.stringify(a.mesclas));
          gravadas++;
        }
        limpar();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return { gravadas, iguais };
    },
    /** A foto mais nova do dia (pela hora da leitura), ou null. */
    doDia(dia) {
      const l = q.doDia.get(dia);
      if (!l) return null;
      return { aba: l.aba, dia: l.dia, lidaEm: l.lida_em, recebidaEm: l.recebida_em, confirmadaEm: l.confirmada_em, origem: JSON.parse(l.origem), todasAsAbas: JSON.parse(l.todas_as_abas), linhas: JSON.parse(l.linhas), mesclas: JSON.parse(l.mesclas) };
    },
    limpar,
    /** Quantas fotos estão guardadas (para o log). */
    quantas: () => q.quantas.get().n,
  };
}
