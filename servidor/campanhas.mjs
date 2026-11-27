/*
 * As Campanhas (#177, #178): um conjunto de Produções com um nome ("Lançamento Avenida Carona"). Sem tipo, período nem
 * peças previstas: o próprio conjunto já basta. Uma Produção pode estar em várias campanhas.
 *
 * Moram no SQLite do PROMeiro (e por isso no backup), com o SQL comum ao SQLite e ao Postgres (texto, UNIQUE,
 * REFERENCES, ON CONFLICT … DO NOTHING; o id é um UUID gerado aqui e as datas são texto ISO). Nada vai ao Trello nem
 * ao Teable (ADR 0006).
 * - campanhas: o id, o nome (como foi escrito), a chave do nome (sem caixa, acento e pontuação: o mesmo nome não se
 *   repete), quem criou e quando, e quem mexeu por último e quando (criar, ligar, tirar);
 * - campanhas_producoes: a ligação muitos para muitos, com quem ligou e quando.
 *
 * Quem cria, liga e tira: o administrador, a coordenação (o produtor da edição), o designer e o redator. Os outros só
 * leem. A rota confere o papel (`podeMudar`) e diz quem fez (`quem`). Ligar e tirar viram eventos da Produção, com a
 * origem PROMeiro ("ligou à campanha X", "tirou da campanha X"): o campo é o id da campanha, o depois (ligou) ou o
 * antes (tirou) é o nome.
 *
 * A página da campanha (#180): as Produções dela (também as arquivadas, que ficam de fora das contagens), as claquetes
 * na Pauta da edição (pelo cruzamento que já existe, `cruzarComAProducao`) e as sugestões da mesma atração. Renomear e
 * ligar ou tirar várias são dos mesmos papéis; apagar é só do administrador e de quem criou, e com desfazer: a campanha
 * apagada fica marcada (`apagada_em`) e some de tudo, com as ligações guardadas, até o desfazer ou até um dia depois
 * (aí sai de vez). O nome dela fica livre na hora: criar ou renomear com ele tira a apagada de vez.
 */
import { randomUUID } from 'node:crypto';
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { campanhaCombina } from '../src/modelo/campanhas.ts';

/** O tamanho máximo do nome da campanha. */
export const NOME_DA_CAMPANHA = 80;
export const SEM_PAPEL = 'Só o administrador, a coordenação, os designers e os redatores mexem nas campanhas.';
export const SEM_PAPEL_DE_APAGAR = 'Só o administrador ou quem criou a campanha pode apagá-la.';
const NAO_EXISTE = { status: 404, corpo: { erro: 'Essa campanha não existe mais.' } };
/** Quanto tempo a campanha apagada espera o desfazer antes de sair de vez. */
const GUARDA_DA_APAGADA_MS = 86_400_000;
/** Quantas sugestões da mesma atração a página mostra, e quantas Produções se ligam de uma vez. */
export const SUGESTOES_DA_CAMPANHA = 12;
export const LIGAR_DE_UMA_VEZ = 200;
const NAO_ESTA = { status: 404, corpo: { erro: 'Essa Produção não está mais na tela.' } };

/** O nome do pedido, sem as pontas e sem espaços repetidos; '' quando não serve. */
const nomeDoPedido = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/**
 * @param db o SQLite do PROMeiro (as tabelas das Produções já criadas)
 * @param producoes o módulo das Produções (servidor/producoes.mjs): `uma` e `doPROMeiro`
 */
export function criarCampanhas(db, { producoes }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campanhas (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      chave TEXT NOT NULL UNIQUE,
      criada_por TEXT,
      criada_em TEXT NOT NULL,
      mexida_por TEXT,
      mexida_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS campanhas_producoes (
      campanha_id TEXT NOT NULL REFERENCES campanhas (id) ON DELETE CASCADE,
      producao_id TEXT NOT NULL REFERENCES producoes (id) ON DELETE CASCADE,
      ligada_por TEXT,
      ligada_em TEXT NOT NULL,
      PRIMARY KEY (campanha_id, producao_id)
    );
    CREATE INDEX IF NOT EXISTS campanhas_producoes_producao ON campanhas_producoes (producao_id);
  `);
  // apagar com desfazer (#180): a apagada fica marcada até o desfazer
  const colunas = db.prepare('PRAGMA table_info(campanhas)').all().map((c) => c.name);
  if (!colunas.includes('apagada_em')) db.exec('ALTER TABLE campanhas ADD COLUMN apagada_em TEXT; ALTER TABLE campanhas ADD COLUMN apagada_por TEXT');
  const q = {
    // as contagens por etapa (#180), sem as arquivadas
    todas: db.prepare(
      `SELECT c.id, c.nome, c.mexida_em, COUNT(p.id) AS producoes,
         SUM(CASE WHEN p.etapa = 'entrada' THEN 1 ELSE 0 END) AS entrada,
         SUM(CASE WHEN p.etapa = 'produzindo' THEN 1 ELSE 0 END) AS produzindo,
         SUM(CASE WHEN p.etapa = 'entregue' THEN 1 ELSE 0 END) AS entregue
       FROM campanhas c LEFT JOIN campanhas_producoes l ON l.campanha_id = c.id LEFT JOIN producoes p ON p.id = l.producao_id AND p.arquivada = 0 AND p.etapa <> 'arquivada'
       WHERE c.apagada_em IS NULL
       GROUP BY c.id, c.nome, c.mexida_em ORDER BY c.mexida_em DESC, c.nome`,
    ),
    uma: db.prepare('SELECT id, nome FROM campanhas WHERE id = ? AND apagada_em IS NULL'),
    inteira: db.prepare('SELECT id, nome, criada_por, criada_em, mexida_por, mexida_em, apagada_em FROM campanhas WHERE id = ?'),
    daChave: db.prepare('SELECT id, nome, apagada_em FROM campanhas WHERE chave = ?'),
    renomear: db.prepare('UPDATE campanhas SET nome = ?, chave = ?, mexida_por = ?, mexida_em = ? WHERE id = ?'),
    apagar: db.prepare('UPDATE campanhas SET apagada_em = ?, apagada_por = ? WHERE id = ? AND apagada_em IS NULL'),
    voltar: db.prepare('UPDATE campanhas SET apagada_em = NULL, apagada_por = NULL WHERE id = ? AND apagada_em IS NOT NULL'),
    sairDeVez: db.prepare('DELETE FROM campanhas WHERE id = ? AND apagada_em IS NOT NULL'),
    velhas: db.prepare('SELECT id FROM campanhas WHERE apagada_em IS NOT NULL AND apagada_em < ?'),
    tirarLigacoes: db.prepare('DELETE FROM campanhas_producoes WHERE campanha_id = ?'),
    // as Produções da campanha, a primeira ligada primeiro
    idsDe: db.prepare('SELECT producao_id FROM campanhas_producoes WHERE campanha_id = ? ORDER BY ligada_em, producao_id'),
    criar: db.prepare('INSERT INTO campanhas (id, nome, chave, criada_por, criada_em, mexida_por, mexida_em) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    mexer: db.prepare('UPDATE campanhas SET mexida_por = ?, mexida_em = ? WHERE id = ?'),
    // a primeira ligada primeiro: é a que a etiqueta mostra, com o "+N" das outras
    daProducao: db.prepare('SELECT c.id, c.nome FROM campanhas_producoes l JOIN campanhas c ON c.id = l.campanha_id WHERE l.producao_id = ? AND c.apagada_em IS NULL ORDER BY l.ligada_em, c.nome'),
    todasAsLigacoes: db.prepare('SELECT l.producao_id, c.id, c.nome FROM campanhas_producoes l JOIN campanhas c ON c.id = l.campanha_id WHERE c.apagada_em IS NULL ORDER BY l.ligada_em, c.nome'),
    ligar: db.prepare('INSERT INTO campanhas_producoes (campanha_id, producao_id, ligada_por, ligada_em) VALUES (?, ?, ?, ?) ON CONFLICT (campanha_id, producao_id) DO NOTHING'),
    tirar: db.prepare('DELETE FROM campanhas_producoes WHERE campanha_id = ? AND producao_id = ?'),
  };

  /** As campanhas, as mexidas por último primeiro, com quantas Produções (sem as arquivadas); com o termo, só as que
      têm todas as palavras dele no nome (cada uma pelo começo de uma palavra, sem caixa, acento e pontuação). */
  function lista(termo = '') {
    limpar();
    return q
      .todas.all()
      .filter((c) => campanhaCombina(c.nome, termo))
      .map((c) => ({ id: c.id, nome: c.nome, producoes: Number(c.producoes), etapas: { entrada: Number(c.entrada ?? 0), produzindo: Number(c.produzindo ?? 0), entregue: Number(c.entregue ?? 0) }, mexidaEm: c.mexida_em }));
  }

  /** As apagadas há mais de um dia saem de vez (com as ligações). */
  function limpar() {
    const antes = new Date(Date.now() - GUARDA_DA_APAGADA_MS).toISOString();
    for (const { id } of q.velhas.all(antes)) sairDeVez(id);
  }
  function sairDeVez(id) {
    q.tirarLigacoes.run(id);
    q.sairDeVez.run(id);
  }

  /** O nome do pedido, conferido: { n, chave } ou { erro }. */
  function nomeValido(nome) {
    const n = nomeDoPedido(nome);
    if (!nomeComparavel(n)) return { erro: 'Falta o nome da campanha.' };
    if (n.length > NOME_DA_CAMPANHA) return { erro: `O nome da campanha tem no máximo ${NOME_DA_CAMPANHA} letras.` };
    return { n, chave: nomeComparavel(n) };
  }

  /**
   * Cria a campanha; o nome que já existe (sem caixa, acento e pontuação) devolve a que já existe, sem criar outra.
   * @returns { campanha: { id, nome }, nova } ou { erro }
   */
  function criar(nome, quem) {
    const v = nomeValido(nome);
    if (v.erro) return v;
    const { n, chave } = v;
    let ja = q.daChave.get(chave);
    // a apagada com o mesmo nome sai de vez: o nome está livre
    if (ja?.apagada_em) {
      sairDeVez(ja.id);
      ja = null;
    }
    if (ja) return { campanha: { id: ja.id, nome: ja.nome }, nova: false };
    const id = randomUUID();
    const em = new Date().toISOString();
    q.criar.run(id, n, chave, quem.email, em, quem.email, em);
    return { campanha: { id, nome: n }, nova: true };
  }

  /** As campanhas da Produção ([{ id, nome }]), a primeira ligada primeiro. */
  const daProducao = (id) => (typeof id === 'string' && id ? q.daProducao.all(id).map((c) => ({ id: c.id, nome: c.nome })) : []);

  /** As campanhas de todas as Produções: (id) => [{ id, nome }], para a lista inteira de uma vez. */
  function porProducao() {
    const mapa = new Map();
    for (const l of q.todasAsLigacoes.all()) {
      if (!mapa.has(l.producao_id)) mapa.set(l.producao_id, []);
      mapa.get(l.producao_id).push({ id: l.id, nome: l.nome });
    }
    return (id) => mapa.get(id) ?? [];
  }

  /** Liga (`liga`) ou tira a Produção da campanha, com o evento; false quando não mudou nada (já estava, ou não estava). */
  function mudar(campanha, producao, liga, quem) {
    const em = new Date().toISOString();
    const r = liga ? q.ligar.run(campanha.id, producao, quem.email, em) : q.tirar.run(campanha.id, producao);
    if (!Number(r.changes)) return false;
    try {
      producoes.doPROMeiro(producao, [liga ? { tipo: 'campanha-ligada', campo: campanha.id, antes: null, depois: campanha.nome } : { tipo: 'campanha-tirada', campo: campanha.id, antes: campanha.nome, depois: null }], quem);
    } catch (e) {
      // o evento não entrou: a ligação volta a ser o que era
      if (liga) q.tirar.run(campanha.id, producao);
      else q.ligar.run(campanha.id, producao, quem.email, em);
      throw e;
    }
    q.mexer.run(quem.email, em, campanha.id);
    return true;
  }

  /**
   * Pelo card aberto (#178): ligar a Produção a uma campanha (`campanha`, o id, com `liga: true`), tirar (`liga:
   * false`) ou criar uma nova e ligar (`nova`, o nome; o nome que já existe liga a que existe).
   * @param ctx { podeMudar, quem: { email, nome }, aTela: (id) => o card da tela }
   * @returns { status, corpo: { feito: { eventos, trello: [], campanha }, producao } } ou a recusa ({ erro })
   */
  function naProducao({ producao, campanha, liga, nova }, ctx) {
    if (!ctx.podeMudar) return { status: 403, corpo: { erro: SEM_PAPEL } };
    const p = typeof producao === 'string' && producao ? producoes.uma(producao.trim().slice(0, 100)) : null;
    if (!p || p.arquivada) return NAO_ESTA;
    let c;
    let criada = false;
    if (nova !== undefined) {
      const r = criar(nova, ctx.quem);
      if (r.erro) return { status: 400, corpo: { erro: r.erro } };
      c = r.campanha;
      criada = r.nova;
      liga = true;
    } else {
      if (typeof liga !== 'boolean') return { status: 400, corpo: { erro: 'Falta a campanha e se a Produção entra (true) ou sai (false).' } };
      c = typeof campanha === 'string' && campanha ? q.uma.get(campanha.trim().slice(0, 100)) : null;
      if (!c) return { status: 404, corpo: { erro: 'Essa campanha não existe mais.' } };
    }
    const mudou = mudar(c, p.id, liga, ctx.quem);
    const eventos = mudou ? [liga ? 'campanha-ligada' : 'campanha-tirada'] : [];
    return { status: 200, corpo: { feito: { eventos, trello: [], campanha: { id: c.id, nome: c.nome }, criada }, producao: ctx.aTela(p.id) } };
  }

  /** Quem pode apagar a campanha (#180): o administrador e quem a criou. */
  const podeApagar = (c, ctx) => !!ctx.admin || (!!c.criada_por && c.criada_por === ctx.quem.email);

  /**
   * A página da campanha (#180).
   * @param ctx { podeMudar, admin, quem, cardDe: (id) => o card da tela (também a arquivada, com `arquivada`) ou null,
   *   candidatas: () => os cards da tela de Produções (as sugestões saem delas), pautaDe: async (cards) => { linhas,
   *   erro? } (as claquetes da Pauta das Produções não arquivadas) }
   * @returns a página, ou null sem a campanha
   */
  async function pagina(id, ctx) {
    const c = typeof id === 'string' && id ? q.inteira.get(id.slice(0, 100)) : null;
    if (!c || c.apagada_em) return null;
    const cards = q.idsDe.all(c.id).map((l) => ctx.cardDe(l.producao_id)).filter(Boolean);
    const abertas = cards.filter((x) => !x.arquivada);
    const contagens = { entrada: 0, produzindo: 0, entregue: 0 };
    for (const x of abertas) if (x.etapa in contagens) contagens[x.etapa] += 1;
    // as sugestões: as Produções da tela da mesma atração de alguma das da campanha, que ainda não estão nela
    const atracoes = new Set(cards.map((x) => nomeComparavel(x.atracao ?? '')).filter(Boolean));
    const dentro = new Set(cards.map((x) => x.id));
    const sugestoes = atracoes.size ? ctx.candidatas().filter((x) => !dentro.has(x.id) && atracoes.has(nomeComparavel(x.atracao ?? ''))).slice(0, SUGESTOES_DA_CAMPANHA) : [];
    const pauta = abertas.length ? await ctx.pautaDe(abertas) : { linhas: [] };
    return {
      campanha: { id: c.id, nome: c.nome, criadaEm: c.criada_em, mexidaEm: c.mexida_em },
      contagens,
      producoes: cards,
      sugestoes,
      pauta,
      voce: { podeMudar: !!ctx.podeMudar, podeApagar: podeApagar(c, ctx), designer: ctx.designer ?? null },
    };
  }

  /** A campanha que existe (não apagada) e quem pode mexer: { c } ou a recusa. */
  function paraMudar(id, ctx) {
    if (!ctx.podeMudar) return { recusa: { status: 403, corpo: { erro: SEM_PAPEL } } };
    const c = typeof id === 'string' && id ? q.uma.get(id.slice(0, 100)) : null;
    return c ? { c } : { recusa: NAO_EXISTE };
  }

  /** Renomear (#180): o nome de outra campanha é recusado (409); a mesma com outra caixa vale. */
  async function renomear(id, nome, ctx) {
    const { c, recusa } = paraMudar(id, ctx);
    if (recusa) return recusa;
    const v = nomeValido(nome);
    if (v.erro) return { status: 400, corpo: { erro: v.erro } };
    const ja = q.daChave.get(v.chave);
    if (ja && ja.id !== c.id) {
      if (!ja.apagada_em) return { status: 409, corpo: { erro: `Já existe a campanha ${ja.nome}.` } };
      sairDeVez(ja.id);
    }
    q.renomear.run(v.n, v.chave, ctx.quem.email, new Date().toISOString(), c.id);
    return { status: 200, corpo: { pagina: await pagina(c.id, ctx) } };
  }

  /**
   * Ligar (`liga: true`) ou tirar várias Produções de uma vez (#180), cada uma com o evento dela. Ligar só as que estão
   * na tela (não arquivadas); tirar, qualquer uma que está.
   * @returns { feito: { mudadas: [ids] }, pagina }
   */
  async function varias(id, { producoes: ids, liga }, ctx) {
    const { c, recusa } = paraMudar(id, ctx);
    if (recusa) return recusa;
    if (typeof liga !== 'boolean') return { status: 400, corpo: { erro: 'Falta dizer se as Produções entram (true) ou saem (false).' } };
    const lista = Array.isArray(ids) ? [...new Set(ids.filter((x) => typeof x === 'string' && x).map((x) => x.trim().slice(0, 100)))] : [];
    if (!lista.length) return { status: 400, corpo: { erro: 'Falta escolher as Produções.' } };
    if (lista.length > LIGAR_DE_UMA_VEZ) return { status: 400, corpo: { erro: `No máximo ${LIGAR_DE_UMA_VEZ} Produções de uma vez.` } };
    for (const x of lista) {
      const p = producoes.uma(x);
      if (!p || (liga && p.arquivada)) return NAO_ESTA;
    }
    const mudadas = lista.filter((x) => mudar(c, x, liga, ctx.quem));
    return { status: 200, corpo: { feito: { mudadas }, pagina: await pagina(c.id, ctx) } };
  }

  /** Apagar (#180), só o administrador ou quem criou: as Produções ficam; a campanha espera o desfazer. */
  function apagar(id, ctx) {
    const c = typeof id === 'string' && id ? q.inteira.get(id.slice(0, 100)) : null;
    if (!c || c.apagada_em) return NAO_EXISTE;
    if (!podeApagar(c, ctx)) return { status: 403, corpo: { erro: SEM_PAPEL_DE_APAGAR } };
    q.apagar.run(new Date().toISOString(), ctx.quem.email, c.id);
    return { status: 200, corpo: { apagada: { id: c.id, nome: c.nome } } };
  }

  /** O desfazer do apagar (#180): a campanha volta, com as ligações. */
  async function desfazerApagar(id, ctx) {
    const c = typeof id === 'string' && id ? q.inteira.get(id.slice(0, 100)) : null;
    if (!c || !c.apagada_em) return { status: 404, corpo: { erro: 'Não há o que desfazer nessa campanha.' } };
    if (!podeApagar(c, ctx)) return { status: 403, corpo: { erro: SEM_PAPEL_DE_APAGAR } };
    q.voltar.run(c.id);
    return { status: 200, corpo: { pagina: await pagina(c.id, ctx) } };
  }

  return { lista, criar, daProducao, porProducao, naProducao, pagina, renomear, varias, apagar, desfazerApagar };
}
