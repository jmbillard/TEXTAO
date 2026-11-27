/* A pauta publicada no Teable (#134, ADR 0006): a virada. Com a chave da Configuração ligada (PAUTA_NO_TEABLE, só o
   administrador liga), publicar grava o dia na tabela da pauta da edição (EDICAO_producao) da base do PROMeiro, pela API
   do Teable, no formato que o fluxo do n8n grava (src/modelo/pautaPublicada.ts, registrosDoDia): uma linha por demanda
   e uma por aviso, e o recado do dia, com a caixinha de anotação. Desligada (o padrão), nada vai ao Teable.
   - O Teable é o espelho da publicação que vale: publicar e desfazer chamam `gravar(dia)`, que deixa o dia no Teable
     igual a ela (desfeita a última, a anterior; sem nenhuma, o dia sai). O rascunho nunca vai.
   - pauta_no_teable, no SQLite: o vínculo de cada item publicado (a demanda, o aviso, o recado) com o registro do
     Teable, e os campos como foram gravados. Republicar só mexe no que mudou: cria o item novo, muda o que mudou (o
     alterado_em vai junto, só nele), apaga o que saiu. O registro que alguém apagou no Teable é criado de novo.
   - O dia é do PROMeiro: as linhas do dia que não são de nenhum item (as que o n8n gravou da planilha antes da virada)
     são apagadas, lidas do Postgres do Teable. Sem o Postgres, ficam, e isso é dito no erro.
   - pauta_no_teable_dias: o dia gravado (quando, e o erro, se não deu). O dia que está aqui é o que vale pelo PROMeiro
     na Pauta (juntarAPublicada, `vale`). Com o Teable fora do ar, a publicação fica no PROMeiro e o erro é guardado:
     publicar de novo termina o que faltou, sem duplicar (cada registro criado entra no vínculo na hora).
   - Um dia por vez: duas publicações do mesmo dia esperam uma pela outra. */
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { registrosDoDia } from '../src/modelo/pautaPublicada.ts';

/** A chave da virada: ligada só com '1' (ou sim/true/on); vazia é desligada. */
export const CHAVE_DA_VIRADA = 'PAUTA_NO_TEABLE';
export const viradaLigada = (env) => /^(1|sim|true|on)$/i.test(String(env?.[CHAVE_DA_VIRADA] ?? '').trim());

const limpo = (v) => String(v ?? '').trim();
const POR_POST = 100;

/**
 * @param db o SQLite do PROMeiro (as tabelas são criadas aqui)
 * @param o.escala a escala (a publicação que vale de cada dia)
 * @param o.env () => o env dos módulos de agora (a chave, o endereço, o token e a tabela descoberta na base)
 * @param o.buscar fetch (o Teable de verdade ou um falso)
 * @param o.editores async () => os editores do cadastro ({ id, nome, keys })
 * @param o.idsDoDia async (dia) => os ids dos registros do dia no Teable (do Postgres), ou null sem ele
 */
export function criarPautaNoTeable(db, { escala, env, buscar = fetch, editores, idsDoDia = async () => null }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pauta_no_teable (
      dia TEXT NOT NULL,
      item TEXT NOT NULL,
      registro TEXT NOT NULL,
      campos TEXT NOT NULL,
      em TEXT NOT NULL,
      PRIMARY KEY (dia, item)
    );
    CREATE TABLE IF NOT EXISTS pauta_no_teable_dias (
      dia TEXT PRIMARY KEY,
      em TEXT,
      erro TEXT
    );
  `);
  const q = {
    vinculos: db.prepare('SELECT item, registro, campos FROM pauta_no_teable WHERE dia = ?'),
    ligar: db.prepare('INSERT INTO pauta_no_teable (dia, item, registro, campos, em) VALUES (?, ?, ?, ?, ?) ON CONFLICT (dia, item) DO UPDATE SET registro = excluded.registro, campos = excluded.campos, em = excluded.em'),
    desligar: db.prepare('DELETE FROM pauta_no_teable WHERE dia = ? AND item = ?'),
    dia: db.prepare('SELECT em, erro FROM pauta_no_teable_dias WHERE dia = ?'),
    dias: db.prepare('SELECT dia FROM pauta_no_teable_dias WHERE dia >= ? AND dia <= ?'),
    anotar: db.prepare('INSERT INTO pauta_no_teable_dias (dia, em, erro) VALUES (?, ?, ?) ON CONFLICT (dia) DO UPDATE SET em = COALESCE(excluded.em, pauta_no_teable_dias.em), erro = excluded.erro'),
    esquecer: db.prepare('DELETE FROM pauta_no_teable_dias WHERE dia = ?'),
  };

  /** O Teable da configuração de agora: o endereço, o token e o id da tabela da pauta achada na base (ou ''). */
  function doTeable() {
    const e = env();
    return { url: limpo(e.TEABLE_URL).replace(/\/+$/, ''), token: limpo(e.TEABLE_TOKEN || e.TEABLE_TOKEN_ESCRITA), tabela: limpo(e.tabelas?.EDICAO_producao?.id) };
  }
  async function pedir(metodo, caminho, corpo) {
    const { url, token } = doTeable();
    const r = await buscar(`${url}/api${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'o token do Teable não tem permissão para gravar na pauta da edição' : `o Teable respondeu ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
    return r.json().catch(() => ({}));
  }

  /** Os campos do Teable de cada registro, com o editor ligado ao cadastro pelo nome (ou por uma key dele). */
  async function camposDoDia(publicada) {
    const lista = await editores();
    const porNome = new Map();
    for (const e of lista ?? []) for (const n of [e.nome, ...(e.keys ?? []).map((k) => k.key)]) if (limpo(n) && !porNome.has(nomeComparavel(n))) porNome.set(nomeComparavel(n), e.id);
    return registrosDoDia(publicada).map(({ item, editor, anotacao, ...r }) => {
      const id = editor ? porNome.get(nomeComparavel(editor)) : null;
      return { item, campos: { claquete: r.claquete, editor: id ? { id } : null, data: r.data, expediente_inicio: r.expediente_inicio, expediente_fim: r.expediente_fim, anotacao: anotacao ? true : null } };
    });
  }

  /** Deixa o dia no Teable igual à publicação (null: sem publicação, o dia sai). Lança no primeiro erro do Teable. */
  async function espelhar(dia, publicada) {
    const { tabela } = doTeable();
    if (!tabela) throw new Error('a tabela da pauta da edição (EDICAO_producao) não foi achada na base do Teable');
    const caminho = `/table/${encodeURIComponent(tabela)}/record`;
    const agora = new Date().toISOString();
    const desejados = publicada ? await camposDoDia(publicada) : [];
    const vinculos = new Map(q.vinculos.all(dia).map((v) => [v.item, v]));
    const novos = [];
    for (const { item, campos } of desejados) {
      const v = vinculos.get(item);
      if (v && v.campos === JSON.stringify(campos)) continue;
      // o alterado_em vai só na linha que mudou: a hora da publicação que a mudou
      const fields = { ...campos, alterado_em: publicada.em };
      if (v) {
        const r = await pedir('PATCH', `${caminho}/${encodeURIComponent(v.registro)}`, { fieldKeyType: 'name', typecast: true, record: { fields } });
        if (r) {
          q.ligar.run(dia, item, v.registro, JSON.stringify(campos), agora);
          continue;
        }
      }
      // o item novo, ou o registro que alguém apagou no Teable
      novos.push({ item, campos, fields });
    }
    for (let i = 0; i < novos.length; i += POR_POST) {
      const lote = novos.slice(i, i + POR_POST);
      const r = await pedir('POST', caminho, { fieldKeyType: 'name', typecast: true, records: lote.map((n) => ({ fields: n.fields })) });
      const criados = r?.records ?? [];
      if (criados.length !== lote.length || criados.some((c) => !c?.id)) throw new Error('o Teable não devolveu as linhas criadas na pauta da edição');
      lote.forEach((n, j) => q.ligar.run(dia, n.item, criados[j].id, JSON.stringify(n.campos), agora));
    }
    // o que saiu da publicação
    const ficam = new Set(desejados.map((d) => d.item));
    for (const v of vinculos.values()) {
      if (ficam.has(v.item)) continue;
      await pedir('DELETE', `${caminho}/${encodeURIComponent(v.registro)}`);
      q.desligar.run(dia, v.item);
    }
    // o dia publicado é do PROMeiro: o que o Teable tem nele e não é de nenhum item (o que o n8n gravou da planilha)
    // sai; sem publicação, o dia deixa de ser dele, e só as linhas que ele gravou saem
    if (!publicada) return null;
    const doDia = await idsDoDia(dia).catch(() => null);
    if (!doDia) return 'não li o Postgres do Teable: as linhas do dia que não são do PROMeiro ficaram lá';
    const nossos = new Set(q.vinculos.all(dia).map((v) => v.registro));
    for (const id of doDia) if (!nossos.has(id)) await pedir('DELETE', `${caminho}/${encodeURIComponent(id)}`);
    return null;
  }

  const filas = new Map();
  /** Um dia por vez: a gravação espera a anterior do mesmo dia. */
  function naFila(dia, f) {
    const antes = filas.get(dia) ?? Promise.resolve();
    const agora = antes.then(f, f);
    filas.set(dia, agora);
    void agora.finally(() => filas.get(dia) === agora && filas.delete(dia)).catch(() => {});
    return agora;
  }

  /** O estado do dia no Teable, como a montagem mostra: a chave, quando foi gravado e o erro da última vez. */
  const estado = (dia) => {
    const d = q.dia.get(dia);
    return { ligada: viradaLigada(env()), gravadoEm: d?.em ?? null, erro: d?.erro ?? null };
  };

  return {
    ligada: () => viradaLigada(env()),
    /** A tabela da pauta foi achada na base (sem ela, ligar a chave é recusado). */
    temTabela: () => !!doTeable().tabela,
    estado,
    /** Os dias do período que o PROMeiro gravou no Teable (os que valem por ele na Pauta), com a chave ligada. */
    gravados(primeiro, ultimo) {
      if (!viradaLigada(env())) return new Set();
      return new Set(q.dias.all(primeiro, ultimo).map((l) => l.dia));
    },
    /**
     * Grava o dia no Teable como a publicação que vale agora (depois de publicar ou desfazer). Com a chave desligada,
     * não faz nada. Nunca lança: o erro fica guardado no dia. @returns o estado do dia
     */
    gravar(dia) {
      if (!viradaLigada(env())) return Promise.resolve(estado(dia));
      return naFila(dia, async () => {
        const publicada = escala.publicadas(dia, dia)[0] ?? null;
        try {
          const aviso = await espelhar(dia, publicada);
          if (publicada) q.anotar.run(dia, new Date().toISOString(), aviso);
          else q.esquecer.run(dia);
          if (aviso) console.warn(`[pauta-no-teable] ${dia}: ${aviso}`);
          console.log(`[pauta-no-teable] ${publicada ? 'gravei' : 'tirei'} ${dia} no Teable`);
        } catch (e) {
          const erro = `Não gravei no Teable: ${e instanceof Error ? e.message : e}. Publique de novo para tentar.`;
          q.anotar.run(dia, null, erro);
          console.warn(`[pauta-no-teable] ${dia}: ${erro}`);
        }
        return estado(dia);
      });
    },
  };
}
