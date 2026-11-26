/*
 * As Produções (#86, ADR 0006) no SQLite do PROMeiro: o trabalho da arte de uma claquete numa praça, com id próprio.
 * O card do Trello (card_id) e o registro da produção da arte no Teable (teable_registro) são só referências, as duas
 * opcionais; o Roteiro e o filme ligados também.
 *
 * O SQL é o comum ao SQLite e ao Postgres (para a troca futura): texto, inteiro, CHECK, UNIQUE, REFERENCES e
 * INSERT … ON CONFLICT … DO UPDATE; o id é um UUID gerado aqui, as datas são texto ISO, as listas são texto JSON lido
 * aqui (sem json_extract) e o booleano é 0/1.
 *
 * A carga inicial lê a produção da arte INTEIRA (todas as linhas: abertas e arquivadas, com e sem card, filmes
 * incluídos; nada do Trello) e grava uma Produção por linha, pela chave natural (o registro do Teable): rodar de novo
 * atualiza, não duplica, e a Produção guarda o seu id. Roda na subida, quando não há nenhuma Produção, e quando um
 * administrador pede "recarregar". Não há leitura periódica: quem mantém em dia é o aviso do Trello (#87). As
 * Produções carregadas entram com o estado de agora, sem eventos passados.
 *
 * Os eventos (#87) são a memória da Produção: o que o aviso do Trello disse que aconteceu (criada, mudou de etapa,
 * arquivada, desarquivada), com quem e quando (a data da ação no Trello) e o id da ação do Trello, único: o mesmo
 * aviso duas vezes não vira dois eventos. O aviso muda a etapa da Produção, a não ser que chegue atrasado (mais velho
 * que o último evento dela): esse entra no histórico e não volta a etapa. O tipo, o antes e o depois são texto livre
 * (sem CHECK): os próximos tipos (designer, checklist, campos) guardam outros valores.
 */
import { randomUUID } from 'node:crypto';
import { ETAPAS, producaoDaLinha } from '../src/modelo/producao.ts';
import { pracasRegistradas, reconhecerPraca } from '../src/modelo/pracas.ts';

export function criarTabelaDasProducoes(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS producoes (
    id TEXT PRIMARY KEY,
    claquete TEXT NOT NULL,
    praca TEXT NOT NULL DEFAULT '',
    etapa TEXT NOT NULL CHECK (etapa IN (${ETAPAS.map((e) => `'${e}'`).join(', ')})),
    marcador TEXT NOT NULL DEFAULT '',
    designers TEXT NOT NULL DEFAULT '[]',
    artes TEXT NOT NULL DEFAULT '[]',
    artes_quantidade INTEGER,
    entrada_em TEXT,
    entrega_em TEXT,
    exibicao_em TEXT,
    card_id TEXT,
    teable_registro TEXT UNIQUE,
    roteiro_id TEXT REFERENCES roteiros (id) ON DELETE SET NULL,
    filme_id TEXT,
    filme_titulo TEXT,
    arquivada INTEGER NOT NULL DEFAULT 0,
    criada_em TEXT NOT NULL,
    atualizada_em TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS producoes_card ON producoes (card_id)');
  db.exec('CREATE INDEX IF NOT EXISTS producoes_etapa ON producoes (etapa)');
  db.exec(`CREATE TABLE IF NOT EXISTS eventos (
    id TEXT PRIMARY KEY,
    producao_id TEXT NOT NULL REFERENCES producoes (id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    antes TEXT,
    depois TEXT,
    quem_id TEXT,
    quem_nome TEXT,
    quando TEXT NOT NULL,
    trello_acao TEXT UNIQUE,
    anotado_em TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS eventos_producao ON eventos (producao_id, quando)');
}

const COLUNAS = ['claquete', 'praca', 'etapa', 'marcador', 'designers', 'artes', 'artes_quantidade', 'entrada_em', 'entrega_em', 'exibicao_em', 'card_id', 'roteiro_id', 'filme_id', 'filme_titulo', 'arquivada', 'atualizada_em'];

/** O evento como a API mostra. */
const doEvento = (e) => ({ tipo: e.tipo, antes: e.antes ?? null, depois: e.depois ?? null, quem: e.quem_id ? { id: e.quem_id, nome: e.quem_nome ?? '' } : null, quando: e.quando, acao: e.trello_acao ?? null });

/** A Produção como a API mostra. */
const daLinha = (l) => ({
  id: l.id,
  claquete: l.claquete,
  praca: l.praca,
  etapa: l.etapa,
  marcador: l.marcador,
  designers: JSON.parse(l.designers),
  artes: JSON.parse(l.artes),
  artesQuantidade: l.artes_quantidade ?? null,
  entradaEm: l.entrada_em ?? null,
  entregaEm: l.entrega_em ?? null,
  exibicaoEm: l.exibicao_em ?? null,
  cardId: l.card_id ?? null,
  teableRegistro: l.teable_registro ?? null,
  roteiroId: l.roteiro_id ?? null,
  filmeId: l.filme_id ?? null,
  filmeTitulo: l.filme_titulo ?? null,
  arquivada: !!l.arquivada,
  criadaEm: l.criada_em,
  atualizadaEm: l.atualizada_em,
});

/**
 * @param db o SQLite do PROMeiro
 * @returns vazia (nenhuma Produção guardada?), carregar (a carga inicial, uma por vez), contagem (por etapa, para
 *   conferir) e buscar (pelo card ou pelo registro do Teable)
 */
export function criarProducoes(db) {
  criarTabelaDasProducoes(db);
  const q = {
    total: db.prepare('SELECT COUNT(*) AS n FROM producoes'),
    porEtapa: db.prepare('SELECT etapa, COUNT(*) AS n FROM producoes GROUP BY etapa'),
    contas: db.prepare(
      `SELECT SUM(CASE WHEN card_id IS NOT NULL THEN 1 ELSE 0 END) AS com_card, SUM(CASE WHEN roteiro_id IS NOT NULL THEN 1 ELSE 0 END) AS com_roteiro,
              SUM(CASE WHEN filme_id IS NOT NULL THEN 1 ELSE 0 END) AS com_filme FROM producoes`,
    ),
    existe: db.prepare('SELECT 1 FROM producoes WHERE teable_registro = ?'),
    gravar: db.prepare(
      `INSERT INTO producoes (id, teable_registro, criada_em, ${COLUNAS.join(', ')}) VALUES (?, ?, ?, ${COLUNAS.map(() => '?').join(', ')})
       ON CONFLICT (teable_registro) DO UPDATE SET ${COLUNAS.map((c) => (c === 'roteiro_id' ? 'roteiro_id = COALESCE(excluded.roteiro_id, producoes.roteiro_id)' : `${c} = excluded.${c}`)).join(', ')}`,
    ),
    // o envio liga o Roteiro ao card; o mais recente vale (o Roteiro reenviado para o mesmo card)
    envios: db.prepare(`SELECT e.card_id, e.roteiro_id, r.meta FROM envios e JOIN roteiros r ON r.id = e.roteiro_id WHERE e.card_id IS NOT NULL AND e.card_id <> '' ORDER BY e.em`),
    doCard: db.prepare('SELECT * FROM producoes WHERE card_id = ? ORDER BY entrada_em'),
    doRegistro: db.prepare('SELECT * FROM producoes WHERE teable_registro = ?'),
    // a carga adota a Produção que o aviso do Trello criou para o card (ainda sem o registro do Teable): não duplica
    adotar: db.prepare(
      `UPDATE producoes SET teable_registro = ? WHERE id = (SELECT id FROM producoes WHERE card_id = ? AND teable_registro IS NULL ORDER BY criada_em LIMIT 1)`,
    ),
    /* ---------- os eventos (#87) ---------- */
    eventosDe: db.prepare('SELECT * FROM eventos WHERE producao_id = ? ORDER BY quando, anotado_em'),
    temAcao: db.prepare('SELECT 1 FROM eventos WHERE trello_acao = ?'),
    // o card pode ter mais de uma Produção (linhas repetidas na produção da arte): vale a mais recente
    daUltimaDoCard: db.prepare('SELECT id FROM producoes WHERE card_id = ? ORDER BY COALESCE(entrada_em, criada_em) DESC, criada_em DESC LIMIT 1'),
    ultimoQuando: db.prepare('SELECT MAX(quando) AS quando FROM eventos WHERE producao_id = ?'),
    criarDoAviso: db.prepare(
      `INSERT INTO producoes (id, claquete, praca, etapa, card_id, entrada_em, arquivada, criada_em, atualizada_em) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ),
    anotar: db.prepare(
      `INSERT INTO eventos (id, producao_id, tipo, antes, depois, quem_id, quem_nome, quando, trello_acao, anotado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (trello_acao) DO NOTHING`,
    ),
    mudarEtapa: db.prepare(
      `UPDATE producoes SET etapa = ?, arquivada = ?, entrega_em = CASE WHEN ? = 'entregue' AND entrega_em IS NULL THEN ? ELSE entrega_em END, atualizada_em = ? WHERE id = ?`,
    ),
  };

  /** card → { id, exibicao }: o Roteiro guardado que foi enviado para o card, e a data de exibição dele. */
  function roteirosDosCards() {
    const porCard = new Map();
    for (const e of q.envios.all()) {
      let exibicao = null;
      try {
        exibicao = String(JSON.parse(e.meta)?.dataExibicao ?? '').trim() || null;
      } catch {
        // meta ilegível: o Roteiro liga, sem a data
      }
      porCard.set(e.card_id, { id: e.roteiro_id, exibicao });
    }
    return porCard;
  }

  let emCurso = null;
  let ultima = null;

  /**
   * A carga inicial (ou de novo): lê a produção da arte inteira e as exibições dos cards, e grava uma Produção por
   * linha numa transação só. Uma carga por vez: quem pede durante uma recebe o resultado dela.
   * @param trello o módulo de agora (producaoInteira, exibicoesDosCards)
   * @param pracas as praças da configuração de agora
   * @returns { em, linhas, novas, atualizadas } ou null sem a produção da arte configurada; lança com o Teable fora
   */
  function carregar(trello, pracas) {
    emCurso ??= (async () => {
      const linhas = await trello?.producaoInteira?.();
      if (!linhas) return null;
      // as exibições só completam (a data e o filme dos cards de filme): sem elas, a carga segue
      const exibicoes = await Promise.resolve(trello.exibicoesDosCards?.())
        .catch((e) => console.warn(`[producoes] não li as exibições: ${e instanceof Error ? e.message : e}`))
        .then((m) => m ?? new Map());
      const roteiros = roteirosDosCards();
      const em = new Date().toISOString();
      let novas = 0;
      db.exec('BEGIN');
      try {
        for (const l of linhas) {
          const p = producaoDaLinha(l, { roteiro: l.card ? roteiros.get(l.card) : null, exibicao: l.card ? exibicoes.get(l.card) : null }, pracas);
          if (p.cardId && !q.existe.get(p.teableRegistro)) q.adotar.run(p.teableRegistro, p.cardId);
          if (!q.existe.get(p.teableRegistro)) novas++;
          const valores = { claquete: p.claquete, praca: p.praca, etapa: p.etapa, marcador: p.marcador, designers: JSON.stringify(p.designers), artes: JSON.stringify(p.artes), artes_quantidade: p.artesQuantidade, entrada_em: p.entradaEm, entrega_em: p.entregaEm, exibicao_em: p.exibicaoEm, card_id: p.cardId, roteiro_id: p.roteiroId, filme_id: p.filmeId, filme_titulo: p.filmeTitulo, arquivada: p.arquivada ? 1 : 0, atualizada_em: em };
          q.gravar.run(randomUUID(), p.teableRegistro, em, ...COLUNAS.map((c) => valores[c]));
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      ultima = { em, linhas: linhas.length, novas, atualizadas: linhas.length - novas };
      console.log(`[producoes] carga da produção da arte: ${linhas.length} linhas, ${novas} Produções novas`);
      return ultima;
    })().finally(() => (emCurso = null));
    return emCurso;
  }

  /** Quantas Produções há em cada etapa (e com card, Roteiro e filme), para conferir com a produção da arte. */
  function contagem() {
    const porEtapa = Object.fromEntries(ETAPAS.map((e) => [e, 0]));
    for (const l of q.porEtapa.all()) porEtapa[l.etapa] = Number(l.n);
    const total = Number(q.total.get().n);
    const c = q.contas.get();
    const comCard = Number(c.com_card ?? 0);
    return { total, porEtapa, comCard, semCard: total - comCard, comRoteiro: Number(c.com_roteiro ?? 0), comFilme: Number(c.com_filme ?? 0), carregando: !!emCurso, ultimaCarga: ultima };
  }

  /**
   * Anota os eventos do aviso do Trello (src/modelo/avisoDoTrello.ts), numa transação: "criada" faz a Produção do card
   * quando ainda não há nenhuma (a claquete é o nome do card; a praça, a que a claquete indica); os outros só valem
   * para o card que já é Produção (o resto é card fora do domínio e é ignorado). O id da ação do Trello não repete.
   * @returns { anotados, repetidos, ignorados }
   */
  function anotar(eventos, pracas = pracasRegistradas()) {
    const r = { anotados: 0, repetidos: 0, ignorados: 0 };
    if (!eventos?.length) return r;
    const em = new Date().toISOString();
    db.exec('BEGIN');
    try {
      for (const ev of eventos) {
        if (q.temAcao.get(ev.acao)) {
          r.repetidos++;
          continue;
        }
        let id = q.daUltimaDoCard.get(ev.cardId)?.id;
        if (!id && ev.tipo !== 'criada') {
          r.ignorados++;
          continue;
        }
        if (!id) {
          id = randomUUID();
          const claquete = String(ev.claquete ?? '').trim();
          q.criarDoAviso.run(id, claquete, reconhecerPraca(claquete, pracas), ev.depois, ev.cardId, ev.quando, em, em);
        }
        const ultimo = q.ultimoQuando.get(id)?.quando ?? null;
        q.anotar.run(randomUUID(), id, ev.tipo, ev.antes ?? null, ev.depois ?? null, ev.quem?.id ?? null, ev.quem?.nome ?? null, ev.quando, ev.acao, em);
        r.anotados++;
        // "criada" de uma Produção que já existia (a carga chegou antes) não muda nada; o atrasado não volta a etapa
        if (ev.tipo !== 'criada' && (!ultimo || ev.quando >= ultimo)) q.mudarEtapa.run(ev.depois, ev.depois === 'arquivada' ? 1 : 0, ev.depois, ev.quando, em, id);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return r;
  }

  return {
    vazia: () => Number(q.total.get().n) === 0,
    anotar,
    carregar,
    contagem,
    /** As Produções de um card ou de um registro do Teable, com os eventos de cada uma (do mais velho ao mais novo). */
    buscar: ({ card, registro }) => (card ? q.doCard.all(card) : registro ? q.doRegistro.all(registro) : []).map((l) => ({ ...daLinha(l), eventos: q.eventosDe.all(l.id).map(doEvento) })),
  };
}
