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
 */
import { randomUUID } from 'node:crypto';
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';

/** O tamanho máximo do nome da campanha. */
export const NOME_DA_CAMPANHA = 80;
export const SEM_PAPEL = 'Só o administrador, a coordenação, os designers e os redatores mexem nas campanhas.';
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
  const q = {
    todas: db.prepare(
      `SELECT c.id, c.nome, c.mexida_em, COUNT(p.id) AS producoes
       FROM campanhas c LEFT JOIN campanhas_producoes l ON l.campanha_id = c.id LEFT JOIN producoes p ON p.id = l.producao_id AND p.arquivada = 0
       GROUP BY c.id, c.nome, c.mexida_em ORDER BY c.mexida_em DESC, c.nome`,
    ),
    uma: db.prepare('SELECT id, nome FROM campanhas WHERE id = ?'),
    daChave: db.prepare('SELECT id, nome FROM campanhas WHERE chave = ?'),
    criar: db.prepare('INSERT INTO campanhas (id, nome, chave, criada_por, criada_em, mexida_por, mexida_em) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    mexer: db.prepare('UPDATE campanhas SET mexida_por = ?, mexida_em = ? WHERE id = ?'),
    // a primeira ligada primeiro: é a que a etiqueta mostra, com o "+N" das outras
    daProducao: db.prepare('SELECT c.id, c.nome FROM campanhas_producoes l JOIN campanhas c ON c.id = l.campanha_id WHERE l.producao_id = ? ORDER BY l.ligada_em, c.nome'),
    todasAsLigacoes: db.prepare('SELECT l.producao_id, c.id, c.nome FROM campanhas_producoes l JOIN campanhas c ON c.id = l.campanha_id ORDER BY l.ligada_em, c.nome'),
    ligar: db.prepare('INSERT INTO campanhas_producoes (campanha_id, producao_id, ligada_por, ligada_em) VALUES (?, ?, ?, ?) ON CONFLICT (campanha_id, producao_id) DO NOTHING'),
    tirar: db.prepare('DELETE FROM campanhas_producoes WHERE campanha_id = ? AND producao_id = ?'),
  };

  /** As campanhas, as mexidas por último primeiro, com quantas Produções (sem as arquivadas); com o termo, só as que
      têm todas as palavras dele no nome (cada uma pelo começo de uma palavra, sem caixa, acento e pontuação). */
  function lista(termo = '') {
    const palavras = nomeComparavel(String(termo ?? '')).split(' ').filter(Boolean);
    return q
      .todas.all()
      .filter((c) => {
        const onde = ` ${nomeComparavel(c.nome)}`;
        return palavras.every((p) => onde.includes(` ${p}`));
      })
      .map((c) => ({ id: c.id, nome: c.nome, producoes: Number(c.producoes), mexidaEm: c.mexida_em }));
  }

  /**
   * Cria a campanha; o nome que já existe (sem caixa, acento e pontuação) devolve a que já existe, sem criar outra.
   * @returns { campanha: { id, nome }, nova } ou { erro }
   */
  function criar(nome, quem) {
    const n = nomeDoPedido(nome);
    if (!nomeComparavel(n)) return { erro: 'Falta o nome da campanha.' };
    if (n.length > NOME_DA_CAMPANHA) return { erro: `O nome da campanha tem no máximo ${NOME_DA_CAMPANHA} letras.` };
    const chave = nomeComparavel(n);
    const ja = q.daChave.get(chave);
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

  return { lista, criar, daProducao, porProducao, naProducao };
}
