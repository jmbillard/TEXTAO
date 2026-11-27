// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarAcervo } from '../servidor/acervo.mjs';
// @ts-expect-error módulo JS sem tipos
import { comTabelas } from '../servidor/tabelas-do-teable.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarAnexos } from '../servidor/anexos.mjs';

/* A aba Duplicadas pela API (#65, corrigido): a produção da arte (o Postgres do Teable) e o Trello de mentira, com
   linhas e cards fictícios. A lista, o contador e o caso aberto saem só da produção: nenhum pedido vai ao Trello
   (ADR 0006: por enquanto o PROMeiro só escreve no Trello; lê do Teable). */

const ENV = {
  CADASTRO_ADMINS: 'chefe@empresa.com',
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_LISTA_SP: 'entradaSP',
  TRELLO_LISTA_G5: 'entradaG5',
  TRELLO_SAIDA_SP: 'saidaSP',
  TRELLO_LISTA_ENTREGUES: 'entregues',
  TEABLE_PG_URL: 'postgres://falso',
  TEABLE_PG_ESQUEMA: 'bseFalso',
  ...comTabelas({ ARTE_producao: 'producao', ARTES_acervo: 'acervo' }),
  // apagar liberado (sem o modo só olhar, #67)
  DUPLICADAS_SO_OLHAR: '0',
};
// o acervo grava pela API do Teable (de mentira): religar as artes ao card que fica
const ENV_DO_ACERVO = { TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'token-falso', TEABLE_ACERVO: 'tblAcervo' };

const DIA = 86_400_000;
const PESSOAS: Record<string, string> = { m1: 'Pessoa Um', m2: 'Pessoa Dois' };
let sequencia = 0;
/** Um id de card do Trello criado há `dias` (os 8 primeiros caracteres são o segundo da criação). */
const idCriadoHa = (dias: number) => Math.floor((Date.now() - dias * DIA) / 1000).toString(16).padStart(8, '0') + (++sequencia).toString(16).padStart(16, '0');
const haDias = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();

type CardFalso = { id: string; idShort: number; name: string; closed: boolean; idList: string; idMembers: string[]; due?: string; checkItems?: number; anexos?: string[] };
/** Uma linha da produção da arte como sai do Postgres (status e designers em texto JSON ou lista). */
type LinhaFalsa = { registro: string; card_ID: string | null; claquete: string; praca: string | null; data_entrada: string | null; data_entrega?: string | null; artes_quantidade?: number | null; status: unknown; designers: unknown; arquivado: boolean | null; entregue: boolean | null; filme: unknown; __last_modified_time?: string };
type ArteFalsa = { id: string; arte: string; tipo: string; atracao: unknown; claquete: { id: string; title: string }[]; filme: unknown };
/** Onde o Trello ou o Teable de mentira falham (o passo do apagar que para no meio). */
type Falha = 'religar' | 'comentar' | 'apagar' | 'criar';
/** Um card que o PROMeiro criou no Trello de mentira (recriar da cópia, #68): o que foi escrito nele. */
type CardCriado = { id: string; idList: string; name: string; desc: string; checklists: { nome: string; itens: string[] }[]; campos: Record<string, unknown>; anexos: string[] };

function falsos() {
  const noTrello: CardFalso[] = [];
  const producao: LinhaFalsa[] = [];
  /** Uma linha da produção que entrou há `dias`, com o card dela no Trello (a não ser que `card` diga outra coisa). */
  const linha = (dias: number, claquete: string, o: Partial<LinhaFalsa> = {}, t: Partial<CardFalso> | null = {}) => {
    const id = idCriadoHa(dias + 0.01);
    const l: LinhaFalsa = { registro: `rec${sequencia}`, card_ID: id, claquete, praca: null, data_entrada: haDias(dias), status: '["PRODUZINDO"]', designers: '["Designer Um"]', arquivado: false, entregue: false, filme: null, __last_modified_time: haDias(dias), ...o };
    producao.push(l);
    if (t && l.card_ID) noTrello.push({ id: l.card_ID, idShort: 1000 + sequencia, name: claquete, closed: !!l.arquivado, idList: 'entradaG5', idMembers: ['m1'], checkItems: 4, anexos: ['application/pdf'], ...t });
    return l;
  };
  const linhas = {
    show1: linha(6.2, 'Show da Noite 20/11 SP', { status: '["FINALIZADO"]', designers: '["Designer Um","Designer Dois"]', data_entrega: '2026-11-20T18:00:00.000Z', artes_quantidade: 4 }, { idShort: 4790, idList: 'saidaSP', idMembers: ['m1', 'm2'], due: '2026-11-20T23:00:00.000Z', anexos: ['application/pdf', 'image/png', 'image/jpeg'] }),
    show2: linha(6, 'Show da Noite 20/11', { praca: 'SP', arquivado: true, status: ['ENTRADA'], designers: null }, { idShort: 4795, idList: 'entradaSP', idMembers: [], due: '2026-11-20T23:00:00.000Z' }),
    festa1: linha(4.5, 'Festa na Praça 19/11 REDE'),
    festa2: linha(4, 'FESTA NA PRACA 19/11', { arquivado: true, status: [], designers: [] }, { idMembers: [] }),
    praia1: linha(3.5, 'Praia do Sol 22/11'),
    // o card desta linha não existe mais no Trello
    praia2: linha(3.4, 'PRAIA DO SOL 22/11', {}, null),
    cozinha1: linha(9.5, 'Cozinha de Vó 18/11'),
    cozinha2: linha(9, 'Cozinha de Vo 18/11', { entregue: true }, { idList: 'entregues' }),
    novela1: linha(120, 'Novela Sinfonia 12/11', { arquivado: true }),
    novela2: linha(119, 'Novela Sinfonia 12/11', { arquivado: true }),
    terra: linha(3, 'Terra 20/11'),
    terraV2: linha(2, 'Terra 20/11 V2'),
    sozinho: linha(1, 'Sozinho 25/11'),
    // "DIA 24": só uma das linhas tem card (a outra não conta); os dois cards de filme não contam
    dia24: linha(2.5, 'DIA 24'),
    dia24SemCard: linha(2.4, 'DIA 24', { card_ID: '' }),
    filme1: linha(5, 'Filme da Tarde 21/11', { filme: '[{"id":"recFilme","title":"Filme da Tarde"}]' }),
    filme2: linha(4.9, 'Filme da Tarde 21/11', { filme: [{ id: 'recFilme', title: 'Filme da Tarde' }] }),
  };
  // e, no quadro, cards que não estão na produção (um card qualquer do quadro): a lista não os vê
  for (const closed of [false, true]) noTrello.push({ id: idCriadoHa(2), idShort: 9000 + sequencia, name: 'DIA 24', closed, idList: 'entradaG5', idMembers: [] });
  /** Uma linha nova na produção (o reenvio que chega depois). */
  const novaLinha = (dias: number, claquete: string) => linha(dias, claquete, { designers: [] }, { idMembers: [] });
  const pedidos: string[] = [];
  const falhar = new Set<Falha>();
  const comentarios: { id: string; card: string; texto: string }[] = [];
  const criados: CardCriado[] = [];
  /** O n8n (PROMO: DB) já criou a linha do card novo quando ele apareceu no quadro (o PROMeiro não cria outra). */
  const n8n = { criaLinha: false };
  const erro = (status: number) => ({ ok: false, status, json: async () => ({}), text: async () => 'falha de mentira' });
  const buscar = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const metodo = init.method ?? 'GET';
    // o Teable (a API): só o acervo grava, religando as artes ao card que fica
    if (u.origin === ENV_DO_ACERVO.TEABLE_URL) {
      pedidos.push(`${metodo} teable ${u.pathname}`);
      // a linha da produção do card recriado (#68), como o envio grava; e o desfazer, que a tira
      if (metodo === 'POST' && u.pathname === '/api/table/tblProducao/record') {
        const { records } = JSON.parse(String(init.body)) as { records: { fields: Record<string, unknown> }[] };
        const f = records[0].fields;
        const l = { registro: `recNova${++sequencia}`, status: [], designers: [], arquivado: false, entregue: false, filme: null, praca: null, data_entrada: null, __last_modified_time: new Date().toISOString(), ...f } as LinhaFalsa;
        producao.push(l);
        return { ok: true, status: 200, json: async () => ({ records: [{ id: l.registro, fields: f }] }), text: async () => '' };
      }
      const umaLinha = /^\/api\/table\/tblProducao\/record\/(\w+)$/.exec(u.pathname);
      if (metodo === 'DELETE' && umaLinha) {
        producao.splice(producao.findIndex((l) => l.registro === umaLinha[1]), 1);
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      }
      if (metodo !== 'PATCH' || u.pathname !== `/api/table/${ENV_DO_ACERVO.TEABLE_ACERVO}/record`) throw new Error(`pedido inesperado ao Teable: ${metodo} ${u.pathname}`);
      if (falhar.has('religar')) return erro(500);
      const corpo = JSON.parse(String(init.body)) as { records: { id: string; fields: { claquete: { id: string }[] } }[] };
      for (const r of corpo.records) {
        const a = acervo.find((x) => x.id === r.id)!;
        a.claquete = [{ id: r.fields.claquete[0].id, title: '' }];
      }
      return { ok: true, status: 200, json: async () => ({ records: corpo.records }), text: async () => '' };
    }
    pedidos.push(`${metodo} ${u.pathname}`);
    // as escritas no Trello de apagar uma duplicada (#67): comentar, desfazer o comentário e apagar o card
    const comentar = /^\/1\/cards\/([0-9a-f]{24})\/actions\/comments$/.exec(u.pathname);
    if (metodo === 'POST' && comentar) {
      if (falhar.has('comentar')) return erro(500);
      const c = { id: `acao${comentarios.length + 1}`, card: comentar[1], texto: u.searchParams.get('text') ?? '' };
      comentarios.push(c);
      return { ok: true, status: 200, json: async () => ({ id: c.id }), text: async () => '' };
    }
    // o card recriado da cópia (#68): o card, a checklist, os campos e o anexo, pelo caminho do envio
    if (metodo === 'POST' && u.pathname === '/1/cards') {
      if (falhar.has('criar')) return erro(500);
      const corpo = JSON.parse(String(init.body)) as { idList: string; name: string; desc: string };
      const c: CardCriado = { id: idCriadoHa(0), idList: corpo.idList, name: corpo.name, desc: corpo.desc, checklists: [], campos: {}, anexos: [] };
      criados.push(c);
      noTrello.push({ id: c.id, idShort: 7000 + sequencia, name: c.name, closed: false, idList: c.idList, idMembers: [] });
      if (n8n.criaLinha) producao.push({ registro: `recDoN8n${sequencia}`, card_ID: c.id, claquete: c.name, praca: null, data_entrada: new Date().toISOString(), status: [], designers: [], arquivado: false, entregue: false, filme: null });
      return { ok: true, status: 200, json: async () => ({ id: c.id, shortUrl: `https://trello.com/c/${c.id.slice(-8)}` }), text: async () => '' };
    }
    const doCriado = (id: string) => criados.find((c) => c.id === id)!;
    if (metodo === 'POST' && u.pathname === '/1/checklists') {
      const id = `lista${criados.length}`;
      doCriado(u.searchParams.get('idCard')!).checklists.push({ nome: u.searchParams.get('name') ?? '', itens: [] });
      return { ok: true, status: 200, json: async () => ({ id }), text: async () => '' };
    }
    if (metodo === 'POST' && /^\/1\/checklists\/\w+\/checkItems$/.test(u.pathname)) {
      criados.at(-1)!.checklists.at(-1)!.itens.push(u.searchParams.get('name') ?? '');
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }
    const umCampo = /^\/1\/cards\/([0-9a-f]{24})\/customField\/(\w+)\/item$/.exec(u.pathname);
    if (metodo === 'PUT' && umCampo) {
      doCriado(umCampo[1]).campos[umCampo[2]] = JSON.parse(String(init.body));
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }
    const anexar = /^\/1\/cards\/([0-9a-f]{24})\/attachments$/.exec(u.pathname);
    if (metodo === 'POST' && anexar) {
      doCriado(anexar[1]).anexos.push(String((init.body as FormData).get('name')));
      return { ok: true, status: 200, json: async () => ({ id: 'anexo1' }), text: async () => '' };
    }
    const umaAcao = /^\/1\/actions\/(\w+)$/.exec(u.pathname);
    if (metodo === 'DELETE' && umaAcao) {
      comentarios.splice(comentarios.findIndex((c) => c.id === umaAcao[1]), 1);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }
    const apagar = /^\/1\/cards\/([0-9a-f]{24})$/.exec(u.pathname);
    if (metodo === 'DELETE' && apagar) {
      if (falhar.has('apagar')) return erro(500);
      noTrello.splice(noTrello.findIndex((c) => c.id === apagar[1]), 1);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }
    if (metodo !== 'GET') throw new Error(`pedido inesperado ao Trello: ${metodo} ${u.pathname}`);
    const umCard = /^\/1\/cards\/([0-9a-f]{24})$/.exec(u.pathname);
    if (!umCard) throw new Error(`pedido inesperado ao Trello: ${u.pathname}`);
    const x = noTrello.find((y) => y.id === umCard[1]);
    if (!x) return { ok: false, status: 404, json: async () => ({}), text: async () => 'The requested resource was not found.' };
    const listas: Record<string, string> = { entradaSP: 'ENTRADA SP', entradaG5: 'ENTRADA G5', saidaSP: 'SAÍDA SP', entregues: 'PROJETOS ENTREGUES' };
    const dados = {
      id: x.id,
      idShort: x.idShort,
      name: x.name,
      closed: x.closed,
      idList: x.idList,
      idMembers: x.idMembers,
      due: x.due ?? null,
      shortUrl: `https://trello.com/c/${x.id.slice(-8)}`,
      badges: { checkItems: x.checkItems ?? 0, attachments: x.anexos?.length ?? 0 },
      list: { id: x.idList, name: listas[x.idList] },
      attachments: (x.anexos ?? []).map((mimeType, i) => ({ id: `a${i}`, name: `anexo${i}`, mimeType })),
      members: x.idMembers.map((id) => ({ id, fullName: PESSOAS[id] })),
    };
    return { ok: true, status: 200, json: async () => dados, text: async () => '' };
  };
  // o acervo: três artes ligadas à linha do primeiro show, uma à da novela
  const acervo: ArteFalsa[] = [
    ...['HOJE', 'AMANHÃ', 'SÁBADO'].map((arte, i) => ({ id: `recA${i}`, arte, tipo: 'RDP', atracao: [{ id: 'recShow', title: 'Show da Noite' }], claquete: [{ id: linhas.show1.registro, title: 'SHOW DA NOITE 20/11 SP' }], filme: null })),
    { id: 'recA9', arte: 'ABERTURA', tipo: 'CRT', atracao: [{ id: 'recNov', title: 'Novela Sinfonia' }], claquete: [{ id: linhas.novela1.registro, title: 'NOVELA SINFONIA 12/11' }], filme: null },
  ];
  let leiturasDaProducao = 0;
  const consultar = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('"bseFalso"."acervo"')) return acervo;
    // a produção do período, como o Postgres responde: entrou nos últimos N dias e tem card
    if (sql.includes('"bseFalso"."producao"') && sql.includes('"data_entrada" >=')) {
      leiturasDaProducao++;
      const desde = Date.now() - Number(params[0]) * DIA;
      return producao.filter((l) => l.card_ID && l.data_entrada && Date.parse(l.data_entrada) >= desde);
    }
    // as linhas destes cards, relidas na hora de apagar (#67), com a linha inteira
    if (sql.includes('"bseFalso"."producao"') && sql.includes('= ANY(')) {
      const ids = params[0] as string[];
      return producao.filter((l) => l.card_ID && ids.includes(l.card_ID)).map((l) => ({ ...l, __id: l.registro, inteira: { ...l } }));
    }
    return [];
  };
  /** O n8n (PROMO: DB) tira a linha da produção do card apagado. */
  const tirarDaProducao = (l: LinhaFalsa) => producao.splice(producao.indexOf(l), 1);
  return { linhas, acervo, producao, buscar, consultar, pedidos, falhar, comentarios, noTrello, criados, n8n, tirarDaProducao, novaLinha, leituras: () => leiturasDaProducao };
}

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function comServidor(env: Record<string, string> = ENV) {
  const f = falsos();
  const trello = criarTrello(env, { buscar: f.buscar, consultar: f.consultar });
  const acervo = criarAcervo({ ...env, ...ENV_DO_ACERVO }, { consultar: f.consultar, buscar: f.buscar });
  const db = abrirBanco(':memory:');
  const app = criarApp({ db, env, trello, acervo });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = () => new Promise<void>((ok) => servidor.close(() => ok()));
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  return { ...f, app, db, chefe: como('chefe@empresa.com'), ana: como('ana@empresa.com') };
}

type Resumo = { id: string; claquete: string; praca: string; secao: string; cards: number; abertos: number; arquivados: number; artesNoAcervo: number; dias: number };
type Lista = { ligado: boolean; lidoEm: string; linhasLidas: number; pendentes: number; dias: number; casos: Resumo[] };

describe('a lista das duplicadas (só da produção da arte)', () => {
  it('agrupa as linhas com card e sem filme que entraram no período, sem nenhum pedido ao Trello', async () => {
    const { chefe, pedidos } = await comServidor();
    const r = await chefe('/api/duplicadas');
    expect(r.status).toBe(200);
    const lista = (await r.json()) as Lista;
    // 12 linhas: as 17 menos as duas da novela (fora dos 90 dias), a sem card e as duas de filme
    expect(lista).toMatchObject({ ligado: true, dias: 90, pendentes: 4, linhasLidas: 12 });
    expect(Date.now() - Date.parse(lista.lidoEm)).toBeLessThan(60_000);
    expect(lista.casos.map((c) => [c.claquete, c.praca, c.secao])).toEqual([
      ['Festa na Praça 19/11 REDE', 'G5', 'misto'],
      ['Show da Noite 20/11 SP', 'SP', 'misto'],
      ['Praia do Sol 22/11', 'G5', 'abertos'],
      ['Cozinha de Vó 18/11', 'G5', 'abertos'],
    ]);
    const show = lista.casos[1];
    expect(show).toMatchObject({ cards: 2, abertos: 1, arquivados: 1, artesNoAcervo: 3, dias: 6 });
    expect(lista.casos[0]).toMatchObject({ artesNoAcervo: 0, dias: 4 });
    expect(pedidos).toEqual([]);
  });

  it('o período é o da entrada na produção (1 a 730 dias); a busca filtra pela claquete sem mudar o contador', async () => {
    const { chefe, pedidos } = await comServidor();
    const longe = (await (await chefe('/api/duplicadas?dias=180')).json()) as Lista;
    expect(longe).toMatchObject({ dias: 180, pendentes: 5, linhasLidas: 14 });
    expect(longe.casos.at(-1)).toMatchObject({ claquete: 'Novela Sinfonia 12/11', secao: 'arquivados', artesNoAcervo: 1 });
    const busca = (await (await chefe('/api/duplicadas?busca=cozinha%20de%20vo')).json()) as Lista;
    expect(busca.pendentes).toBe(4);
    expect(busca.casos.map((c) => c.claquete)).toEqual(['Cozinha de Vó 18/11']);
    for (const dias of ['0', '731', 'abc']) expect((await chefe(`/api/duplicadas?dias=${dias}`)).status).toBe(400);
    expect(pedidos).toEqual([]);
  });

  it('a leitura da produção é guardada por alguns minutos; "renovar" lê de novo', async () => {
    const { chefe, leituras } = await comServidor();
    await chefe('/api/duplicadas');
    expect(leituras()).toBe(1);
    const antes = (await (await chefe('/api/duplicadas')).json()) as Lista;
    expect(leituras()).toBe(1);
    await new Promise((ok) => setTimeout(ok, 5));
    const depois = (await (await chefe('/api/duplicadas?renovar=1')).json()) as Lista;
    expect(leituras()).toBe(2);
    expect(Date.parse(depois.lidoEm)).toBeGreaterThan(Date.parse(antes.lidoEm));
  });

  it('só administradores', async () => {
    const { ana, pedidos, leituras } = await comServidor();
    const r = await ana('/api/duplicadas');
    expect(r.status).toBe(403);
    expect((await ana('/api/duplicadas/caso?id=x')).status).toBe(403);
    expect(pedidos).toEqual([]);
    expect(leituras()).toBe(0);
  });

  it('funciona sem o quadro do Trello (TRELLO_QUADRO) e até sem o Trello; sem a produção da arte, não está ligada', async () => {
    const semQuadro = await comServidor({ ...ENV, TRELLO_QUADRO: '' });
    expect(await (await semQuadro.chefe('/api/duplicadas')).json()).toMatchObject({ ligado: true, pendentes: 4 });
    await parar?.();
    const semTrello = await comServidor({ ...ENV, TRELLO_KEY: '', TRELLO_TOKEN: '' });
    expect(await (await semTrello.chefe('/api/duplicadas')).json()).toMatchObject({ ligado: true, pendentes: 4 });
    await parar?.();
    const semProducao = await comServidor({ ...ENV, tabelas: { ...ENV.tabelas, ARTE_producao: { pg: '' } } });
    expect(await (await semProducao.chefe('/api/duplicadas')).json()).toMatchObject({ ligado: false, pendentes: 0, casos: [] });
    expect(semProducao.leituras()).toBe(0);
  });
});

describe('o detalhe de um caso', () => {
  const abrir = async (chefe: (c: string, i?: RequestInit) => Promise<Response>, claquete: string) => {
    const lista = (await (await chefe('/api/duplicadas')).json()) as Lista;
    const r = await chefe(`/api/duplicadas/caso?id=${encodeURIComponent(lista.casos.find((c) => c.claquete === claquete)!.id)}`);
    expect(r.status).toBe(200);
    return r.json();
  };

  it('o caso aberto mostra só o que a produção tem, sem nenhum pedido ao Trello', async () => {
    const { chefe, linhas, pedidos } = await comServidor();
    // o roteiro guardado no PROMeiro que foi para o primeiro show
    await chefe('/api/roteiros/rot-show-1', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'Show da Noite 20/11 SP' }, doc: { type: 'doc', content: [] } }, nArtes: 1 }) });
    await chefe('/api/roteiros/rot-show-1/trello', { method: 'POST', body: JSON.stringify({ jaEsta: { card: linhas.show1.card_ID } }) });
    pedidos.length = 0;
    const caso = await abrir(chefe, 'Show da Noite 20/11 SP');
    expect(pedidos).toEqual([]);
    expect(caso.sugestao).toEqual({ fica: linhas.show1.card_ID, saem: [linhas.show2.card_ID] });
    expect(caso.cards).toHaveLength(2);
    expect(caso.cards[0]).toEqual({
      id: linhas.show1.card_ID,
      claquete: 'Show da Noite 20/11 SP',
      arquivado: false,
      criado: expect.any(String),
      entrada: linhas.show1.data_entrada,
      entrega: '2026-11-20T18:00:00.000Z',
      status: ['FINALIZADO'],
      designers: ['Designer Um', 'Designer Dois'],
      artes: 4,
      acervo: 3,
      roteiro: { id: 'rot-show-1', claquete: 'Show da Noite 20/11 SP', por: 'Chefe' },
      // o link do card é feito do card_ID
      url: `https://trello.com/c/${linhas.show1.card_ID}`,
      motivo: 'Não foi arquivado na entrada.',
      // para apagar (#67): o código que a confirmação pede e a última mudança da linha no Teable
      codigo: linhas.show1.card_ID!.slice(-4),
      modificadoEm: linhas.show1.__last_modified_time,
    });
    expect(caso.cards[1]).toMatchObject({ id: linhas.show2.card_ID, arquivado: true, status: ['ENTRADA'], designers: [], artes: null, entrega: null, acervo: 0, roteiro: null, motivo: 'Arquivado sem sair da entrada.' });
    expect(Date.parse(caso.cards[1].criado) - Date.parse(caso.cards[0].criado)).toBeGreaterThan(0);
  });

  it('a sugestão do caso aberto é a da lista: o card apagado no Trello não muda nada (o PROMeiro não lê o Trello)', async () => {
    const { chefe, linhas, pedidos } = await comServidor();
    const caso = await abrir(chefe, 'Praia do Sol 22/11');
    expect(caso.sugestao).toEqual({ fica: linhas.praia1.card_ID, saem: [linhas.praia2.card_ID] });
    expect(caso.cards[1]).toMatchObject({ id: linhas.praia2.card_ID, claquete: 'PRAIA DO SOL 22/11', arquivado: false, designers: ['Designer Um'], entrada: linhas.praia2.data_entrada, motivo: 'Entrou depois na produção.' });
    expect(pedidos).toEqual([]);
  });

  it('o caso que não existe mais no período responde 404', async () => {
    const { chefe } = await comServidor();
    expect((await chefe('/api/duplicadas/caso?id=NADA%7CG5%7C')).status).toBe(404);
  });
});

type Resolvida = { id: string; claquete: string; praca: string; cards: number; por: string; em: string; motivo: string };
type ListaComResolvidas = Lista & { resolvidas: Resolvida[] };
type Registro = { registro: { acao: string; caso: string; claquete: string; praca: string; cards: string[]; por: string; em: string; motivo: string; podeReabrir: boolean }[] };

describe('ignorar e reabrir (#66)', () => {
  const ignorar = (pedir: (c: string, i?: RequestInit) => Promise<Response>, id: string, motivo?: string) =>
    pedir('/api/duplicadas/ignorar', { method: 'POST', body: JSON.stringify({ id, dias: 90, ...(motivo === undefined ? {} : { motivo }) }) });

  it('ignorar tira o caso da lista e do contador, põe em Resolvidas e no Registro, sem escrever no Trello nem no Teable', async () => {
    const { chefe, linhas, pedidos } = await comServidor();
    const antes = (await (await chefe('/api/duplicadas')).json()) as ListaComResolvidas;
    const cozinha = antes.casos.find((c) => c.claquete === 'Cozinha de Vó 18/11')!;
    expect(antes.resolvidas).toEqual([]);
    const r = await ignorar(chefe, cozinha.id, '  São exibições diferentes  ');
    expect(r.status).toBe(200);
    const depois = (await (await chefe('/api/duplicadas')).json()) as ListaComResolvidas;
    expect(depois.pendentes).toBe(3);
    expect(depois.casos.map((c) => c.claquete)).not.toContain('Cozinha de Vó 18/11');
    expect(depois.resolvidas).toEqual([
      expect.objectContaining({ id: cozinha.id, claquete: 'Cozinha de Vó 18/11', praca: 'G5', cards: 2, por: 'Chefe', motivo: 'São exibições diferentes' }),
    ]);
    expect(Date.now() - Date.parse(depois.resolvidas[0].em)).toBeLessThan(60_000);
    const { registro } = (await (await chefe('/api/duplicadas/registro')).json()) as Registro;
    expect(registro).toEqual([
      expect.objectContaining({ acao: 'ignorar', caso: cozinha.id, claquete: 'Cozinha de Vó 18/11', praca: 'G5', cards: [linhas.cozinha1.card_ID, linhas.cozinha2.card_ID], por: 'Chefe', motivo: 'São exibições diferentes', podeReabrir: true }),
    ]);
    expect(pedidos.filter((p) => !p.startsWith('GET '))).toEqual([]);
  });

  it('reabrir devolve o caso à lista; o registro guarda as duas ações, a mais nova primeiro', async () => {
    const { chefe } = await comServidor();
    const { casos } = (await (await chefe('/api/duplicadas')).json()) as Lista;
    const festa = casos[0];
    expect((await ignorar(chefe, festa.id)).status).toBe(200);
    expect((await ignorar(chefe, festa.id)).status).toBe(409);
    const r = await chefe('/api/duplicadas/reabrir', { method: 'POST', body: JSON.stringify({ id: festa.id }) });
    expect(r.status).toBe(200);
    const lista = (await (await chefe('/api/duplicadas')).json()) as ListaComResolvidas;
    expect(lista).toMatchObject({ pendentes: 4, resolvidas: [], totalResolvidas: 0 });
    expect(lista.casos[0].id).toBe(festa.id);
    const { registro } = (await (await chefe('/api/duplicadas/registro')).json()) as Registro;
    expect(registro.map((l) => [l.acao, l.claquete, l.motivo, l.podeReabrir])).toEqual([
      ['reabrir', 'Festa na Praça 19/11 REDE', '', false],
      ['ignorar', 'Festa na Praça 19/11 REDE', '', false],
    ]);
    // reabrir o que não está ignorado
    expect((await chefe('/api/duplicadas/reabrir', { method: 'POST', body: JSON.stringify({ id: festa.id }) })).status).toBe(404);
  });

  it('o caso ignorado volta sozinho quando entra uma linha (um card) nova no grupo', async () => {
    const { chefe, novaLinha } = await comServidor();
    const { casos } = (await (await chefe('/api/duplicadas')).json()) as Lista;
    const cozinha = casos.find((c) => c.claquete === 'Cozinha de Vó 18/11')!;
    await ignorar(chefe, cozinha.id, 'Exibições diferentes');
    expect(((await (await chefe('/api/duplicadas')).json()) as Lista).pendentes).toBe(3);
    novaLinha(0.5, 'COZINHA DE VÓ 18/11');
    const lista = (await (await chefe('/api/duplicadas?renovar=1')).json()) as ListaComResolvidas;
    expect(lista.pendentes).toBe(4);
    expect(lista.casos.find((c) => c.id === cozinha.id)).toMatchObject({ cards: 3 });
    expect(lista.resolvidas).toEqual([]);
  });

  it('só administradores ignoram e reabrem e veem o registro; o caso que não existe responde 404', async () => {
    const { chefe, ana, pedidos } = await comServidor();
    expect((await ignorar(ana, 'COZINHA DE VO 18 11|G5|')).status).toBe(403);
    expect((await ana('/api/duplicadas/reabrir', { method: 'POST', body: JSON.stringify({ id: 'x' }) })).status).toBe(403);
    expect((await ana('/api/duplicadas/registro')).status).toBe(403);
    expect(pedidos).toEqual([]);
    expect((await ignorar(chefe, 'NADA|G5|')).status).toBe(404);
    expect((await ignorar(chefe, 'NADA|G5|', 'x'.repeat(201))).status).toBe(400);
    expect((await chefe('/api/duplicadas/ignorar')).status).toBe(405);
  });

  it('o registro é do PROMeiro: o ignorado continua ignorado quando a configuração muda', async () => {
    const { chefe, app } = await comServidor();
    const { casos } = (await (await chefe('/api/duplicadas')).json()) as Lista;
    await ignorar(chefe, casos[0].id, 'Pedido de propósito');
    await app.mudarConfiguracao({ TRELLO_LISTA_SP: 'listaNovaSP' }).antigaFechada;
    const lista = (await (await chefe('/api/duplicadas')).json()) as ListaComResolvidas;
    expect(lista.resolvidas.map((r) => [r.id, r.motivo])).toEqual([[casos[0].id, 'Pedido de propósito']]);
  });
});

type CardDoCaso = { id: string; codigo: string; modificadoEm: string | null; arquivado: boolean; status: string[]; acervo: number; roteiro: { id: string } | null };
type Caso = { id: string; sugestao: { fica: string; saem: string[] }; cards: CardDoCaso[] };
type AcaoApagar = Registro['registro'][number] & { id: number; card: string; fica: string; estado: string; apagado: { codigo: string; religadas: number; roteiros: number; erro: string; naoDesfeito: string[] } };

describe('apagar um card do caso (#67)', () => {
  type Pedir = (c: string, i?: RequestInit) => Promise<Response>;
  const casoDe = async (chefe: Pedir, claquete: string) => {
    const lista = (await (await chefe('/api/duplicadas')).json()) as Lista;
    const id = lista.casos.find((c) => c.claquete === claquete)!.id;
    return (await (await chefe(`/api/duplicadas/caso?id=${encodeURIComponent(id)}`)).json()) as Caso;
  };
  /** O pedido da confirmação: o card que sai, o que fica, o código digitado e o que a tela viu de cada card. */
  const apagar = (pedir: Pedir, caso: Caso, sai: string, fica: string, codigo = caso.cards.find((c) => c.id === sai)!.codigo) =>
    pedir('/api/duplicadas/apagar', { method: 'POST', body: JSON.stringify({ caso: caso.id, dias: 90, sai, fica, codigo, vistos: Object.fromEntries(caso.cards.map((c) => [c.id, c])) }) });
  const escritas = (pedidos: string[]) => pedidos.filter((p) => !p.startsWith('GET '));
  /** O roteiro guardado que foi para o primeiro show (o card que vai sair nos testes). */
  const comRoteiro = async (chefe: Pedir, card: string) => {
    await chefe('/api/roteiros/rot-show-1', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'Show da Noite 20/11 SP' }, doc: { type: 'doc', content: [] } }, nArtes: 1 }) });
    await chefe('/api/roteiros/rot-show-1/trello', { method: 'POST', body: JSON.stringify({ jaEsta: { card } }) });
  };
  const urlDoRoteiro = async (chefe: Pedir) => ((await (await chefe('/api/roteiros/rot-show-1/trello')).json()) as { url: string }).url;

  it('na ordem: cópia, religar o acervo, reapontar o roteiro, comentar no que fica e só então o DELETE; o caso sai da lista', async () => {
    const { chefe, linhas, acervo, pedidos, comentarios, noTrello } = await comServidor();
    await comRoteiro(chefe, linhas.show1.card_ID!);
    // a pessoa troca a sugestão: sai o primeiro show (aberto, com as três artes do acervo e o roteiro), fica o segundo
    const caso = await casoDe(chefe, 'Show da Noite 20/11 SP');
    const [sai, fica] = [linhas.show1.card_ID!, linhas.show2.card_ID!];
    expect(caso.cards[0]).toMatchObject({ id: sai, codigo: sai.slice(-4), modificadoEm: linhas.show1.__last_modified_time, arquivado: false, acervo: 3 });
    pedidos.length = 0;
    const r = await apagar(chefe, caso, sai, fica);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ card: sai, codigo: sai.slice(-4), fica, religadas: 3, roteiros: 1, comentou: true });
    // nada lido do Trello; o Teable (o acervo) antes do comentário, o comentário antes do DELETE
    expect(pedidos.filter((p) => p.startsWith('GET /1/'))).toEqual([]);
    expect(escritas(pedidos)).toEqual([`PATCH teable /api/table/tblAcervo/record`, `POST /1/cards/${fica}/actions/comments`, `DELETE /1/cards/${sai}`]);
    expect(noTrello.some((c) => c.id === sai)).toBe(false);
    expect(comentarios).toEqual([{ id: 'acao1', card: fica, texto: `Duplicado …${sai.slice(-4)} (Show da Noite 20/11 SP) apagado por Chefe pelo PROMeiro.` }]);
    // as artes do acervo passaram para a linha do card que fica; o roteiro guardado aponta para ele
    expect(acervo.filter((a) => a.claquete[0].id === linhas.show2.registro).map((a) => a.arte)).toEqual(['HOJE', 'AMANHÃ', 'SÁBADO']);
    expect(await urlDoRoteiro(chefe)).toBe(`https://trello.com/c/${fica}`);
    // o caso sai da lista e o contador cai, mesmo antes de o n8n tirar a linha da produção (e depois, também)
    for (const renovar of ['', '?renovar=1']) {
      const lista = (await (await chefe(`/api/duplicadas${renovar}`)).json()) as Lista;
      expect(lista.pendentes).toBe(3);
      expect(lista.casos.map((c) => c.claquete)).not.toContain('Show da Noite 20/11 SP');
    }
    // o Registro, com a cópia guardada: a linha da produção inteira e o que o PROMeiro tem do card
    const { registro } = (await (await chefe('/api/duplicadas/registro')).json()) as { registro: AcaoApagar[] };
    expect(registro[0]).toMatchObject({ acao: 'apagar', caso: caso.id, card: sai, fica, por: 'Chefe', estado: 'feito', apagado: { codigo: sai.slice(-4), religadas: 3, roteiros: 1, erro: '', naoDesfeito: [] } });
    const { copia } = await (await chefe(`/api/duplicadas/copia?id=${registro[0].id}`)).json();
    expect(copia).toMatchObject({
      codigo: sai.slice(-4),
      card: sai,
      fica,
      claquete: 'Show da Noite 20/11 SP',
      registro: linhas.show1.registro,
      producaoDaArte: { registro: linhas.show1.registro, card_ID: sai, claquete: 'Show da Noite 20/11 SP', status: '["FINALIZADO"]', artes_quantidade: 4 },
      roteiros: [{ id: 'rot-show-1', card: sai, url: `https://trello.com/c/${sai}` }],
      anexos: [],
      feito: { religadas: ['recA0', 'recA1', 'recA2'], roteiros: [{ id: 'rot-show-1' }], comentario: 'acao1' },
    });
    // o n8n tira a linha da produção: nada muda no registro nem na lista
    await apagar(chefe, caso, sai, fica);
    expect((((await (await chefe('/api/duplicadas/registro')).json()) as { registro: AcaoApagar[] }).registro).filter((l) => l.acao === 'apagar')).toHaveLength(1);
  });

  it('o card aberto pode sair; com três cards, o caso fica com os dois que sobraram', async () => {
    const { chefe, novaLinha, pedidos } = await comServidor();
    const nova = novaLinha(0.5, 'COZINHA DE VÓ 18/11');
    const lista = (await (await chefe('/api/duplicadas?renovar=1')).json()) as Lista;
    const caso = (await (await chefe(`/api/duplicadas/caso?id=${encodeURIComponent(lista.casos.find((c) => c.claquete === 'Cozinha de Vó 18/11')!.id)}`)).json()) as Caso;
    expect(caso.cards).toHaveLength(3);
    expect((await apagar(chefe, caso, nova.card_ID!, caso.cards[0].id)).status).toBe(200);
    // sem artes no acervo nem roteiro: só o comentário e o DELETE
    expect(escritas(pedidos)).toEqual([`POST /1/cards/${caso.cards[0].id}/actions/comments`, `DELETE /1/cards/${nova.card_ID}`]);
    const depois = (await (await chefe('/api/duplicadas')).json()) as Lista;
    expect(depois.pendentes).toBe(4);
    expect(depois.casos.find((c) => c.claquete === 'Cozinha de Vó 18/11')).toMatchObject({ cards: 2 });
  });

  it('só administradores; o código errado é recusado; nada é escrito', async () => {
    const { chefe, ana, linhas, pedidos } = await comServidor();
    const caso = await casoDe(chefe, 'Show da Noite 20/11 SP');
    pedidos.length = 0;
    expect((await apagar(ana, caso, linhas.show2.card_ID!, linhas.show1.card_ID!)).status).toBe(403);
    const errado = await apagar(chefe, caso, linhas.show2.card_ID!, linhas.show1.card_ID!, linhas.show1.card_ID!.slice(-4));
    expect(errado.status).toBe(400);
    expect((await errado.json()).erro).toMatch(/código digitado não é o do card que sai/);
    expect((await apagar(chefe, caso, linhas.show2.card_ID!, linhas.show2.card_ID!)).status).toBe(400);
    expect((await apagar(chefe, caso, linhas.show2.card_ID!, linhas.festa1.card_ID!)).status).toBe(400);
    expect((await chefe('/api/duplicadas/apagar')).status).toBe(405);
    expect(pedidos).toEqual([]);
    const { registro } = (await (await chefe('/api/duplicadas/registro')).json()) as Registro;
    expect(registro).toEqual([]);
  });

  it('o card que mudou no Teable desde que a tela abriu para tudo e devolve o que mudou', async () => {
    const { chefe, linhas, pedidos } = await comServidor();
    const caso = await casoDe(chefe, 'Show da Noite 20/11 SP');
    // alguém pegou o card que ia sair: o status e os designers mudaram (e a última mudança da linha)
    Object.assign(linhas.show2, { status: ['PRODUZINDO'], designers: ['Designer Três'], __last_modified_time: new Date().toISOString() });
    pedidos.length = 0;
    const r = await apagar(chefe, caso, linhas.show2.card_ID!, linhas.show1.card_ID!);
    expect(r.status).toBe(409);
    const corpo = await r.json();
    expect(corpo.erro).toMatch(/mudaram desde que o caso abriu\. Nada foi apagado/);
    expect(corpo.mudou).toEqual([
      { card: linhas.show2.card_ID, codigo: linhas.show2.card_ID!.slice(-4), campo: 'Status', antes: 'ENTRADA', depois: 'PRODUZINDO' },
      { card: linhas.show2.card_ID, codigo: linhas.show2.card_ID!.slice(-4), campo: 'Designers', antes: '', depois: 'Designer Três' },
    ]);
    // o caso aberto de novo mostra o que a produção tem agora; só a última mudança da linha (mexeram no que a tela
    // não mostra) também para, e a claquete que virou outra versão não é mais do grupo
    const caso2 = await casoDe(chefe, 'Show da Noite 20/11 SP');
    expect(caso2.cards.find((c) => c.id === linhas.show2.card_ID)).toMatchObject({ status: ['PRODUZINDO'] });
    Object.assign(linhas.show1, { __last_modified_time: new Date(Date.now() + 1000).toISOString() });
    Object.assign(linhas.show2, { claquete: 'Show da Noite 20/11 V2' });
    const r2 = await apagar(chefe, caso2, linhas.show2.card_ID!, linhas.show1.card_ID!);
    expect(r2.status).toBe(409);
    expect((await r2.json()).mudou).toEqual([
      expect.objectContaining({ card: linhas.show1.card_ID, campo: 'Linha da produção' }),
      expect.objectContaining({ card: linhas.show2.card_ID, campo: 'Grupo' }),
    ]);
    expect(escritas(pedidos)).toEqual([]);
  });

  it('o único card do grupo com linha na produção não sai; o que já não está na produção também não', async () => {
    const { chefe, linhas, pedidos, tirarDaProducao } = await comServidor();
    const caso = await casoDe(chefe, 'Show da Noite 20/11 SP');
    pedidos.length = 0;
    // a linha do card que ia ficar sumiu da produção: o que sai é o único com linha
    tirarDaProducao(linhas.show1);
    const r = await apagar(chefe, caso, linhas.show2.card_ID!, linhas.show1.card_ID!);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ bloqueado: true, erro: expect.stringMatching(/único do grupo com linha na produção/) });
    // a do card que ia sair sumiu (o card já foi apagado no Trello, à mão)
    const outro = await casoDe(chefe, 'Festa na Praça 19/11 REDE');
    tirarDaProducao(linhas.festa2);
    const r2 = await apagar(chefe, outro, linhas.festa2.card_ID!, linhas.festa1.card_ID!);
    expect(r2.status).toBe(409);
    expect((await r2.json()).mudou).toEqual([expect.objectContaining({ card: linhas.festa2.card_ID, depois: 'não está mais na produção' })]);
    expect(escritas(pedidos)).toEqual([]);
  });

  it.each([
    ['religar', ['PATCH teable /api/table/tblAcervo/record']],
    ['comentar', ['PATCH teable', 'POST comments', 'PATCH teable']],
    ['apagar', ['PATCH teable', 'POST comments', 'DELETE card', 'DELETE comentário', 'PATCH teable']],
  ] as const)('a falha ao %s para sem apagar: o que foi feito é desfeito e fica no registro', async (falha, esperado) => {
    const { chefe, linhas, acervo, pedidos, falhar, comentarios, noTrello } = await comServidor();
    await comRoteiro(chefe, linhas.show1.card_ID!);
    const caso = await casoDe(chefe, 'Show da Noite 20/11 SP');
    const [sai, fica] = [linhas.show1.card_ID!, linhas.show2.card_ID!];
    falhar.add(falha);
    pedidos.length = 0;
    const r = await apagar(chefe, caso, sai, fica);
    expect(r.status).toBe(502);
    const corpo = await r.json();
    expect(corpo.erro).toMatch(/Nada foi apagado\. O que tinha sido feito foi desfeito\./);
    const curto = (p: string) =>
      p.startsWith('PATCH teable') ? (esperado[0] === 'PATCH teable /api/table/tblAcervo/record' ? p : 'PATCH teable') : p.endsWith('/actions/comments') ? 'POST comments' : p.startsWith('DELETE /1/cards/') ? 'DELETE card' : p.startsWith('DELETE /1/actions/') ? 'DELETE comentário' : p;
    expect(escritas(pedidos).map(curto)).toEqual(esperado);
    // o card continua no Trello, sem comentário; as artes e o roteiro voltaram ao card que ia sair
    expect(noTrello.some((c) => c.id === sai)).toBe(true);
    expect(comentarios).toEqual([]);
    expect(acervo.filter((a) => a.claquete[0].id === linhas.show1.registro)).toHaveLength(3);
    expect(await urlDoRoteiro(chefe)).toBe(`https://trello.com/c/${sai}`);
    // o caso continua na lista; o registro diz que parou e por quê, com a cópia guardada
    expect(((await (await chefe('/api/duplicadas')).json()) as Lista).pendentes).toBe(4);
    const { registro } = (await (await chefe('/api/duplicadas/registro')).json()) as { registro: AcaoApagar[] };
    expect(registro[0]).toMatchObject({ acao: 'apagar', card: sai, estado: 'falhou', apagado: { erro: expect.any(String), naoDesfeito: [] } });
    expect((await (await chefe(`/api/duplicadas/copia?id=${registro[0].id}`)).json()).copia).toMatchObject({ card: sai, producaoDaArte: { card_ID: sai } });
    // e dá para tentar de novo
    falhar.clear();
    expect((await apagar(chefe, caso, sai, fica)).status).toBe(200);
  });

  it('o modo só olhar (sem a chave, ligado): a rota recusa; um administrador libera e volta, na configuração', async () => {
    const { chefe, ana, linhas, pedidos } = await comServidor({ ...ENV, DUPLICADAS_SO_OLHAR: '' });
    expect(((await (await chefe('/api/duplicadas')).json()) as { soOlhar: boolean }).soOlhar).toBe(true);
    const caso = await casoDe(chefe, 'Show da Noite 20/11 SP');
    pedidos.length = 0;
    const r = await apagar(chefe, caso, linhas.show2.card_ID!, linhas.show1.card_ID!);
    expect(r.status).toBe(403);
    expect((await r.json()).erro).toMatch(/modo só olhar/);
    expect(pedidos).toEqual([]);
    // só administradores mudam o modo
    expect((await ana('/api/duplicadas/modo', { method: 'POST', body: JSON.stringify({ soOlhar: false }) })).status).toBe(403);
    expect((await chefe('/api/duplicadas/modo', { method: 'POST', body: JSON.stringify({ soOlhar: 'não' }) })).status).toBe(400);
    expect((await chefe('/api/duplicadas/modo', { method: 'POST', body: JSON.stringify({ soOlhar: false }) })).status).toBe(200);
    expect(((await (await chefe('/api/duplicadas')).json()) as { soOlhar: boolean }).soOlhar).toBe(false);
    expect((await apagar(chefe, await casoDe(chefe, 'Show da Noite 20/11 SP'), linhas.show2.card_ID!, linhas.show1.card_ID!)).status).toBe(200);
    await chefe('/api/duplicadas/modo', { method: 'POST', body: JSON.stringify({ soOlhar: true }) });
    expect(((await (await chefe('/api/duplicadas')).json()) as { soOlhar: boolean }).soOlhar).toBe(true);
  });
});

type AcaoRecriar = AcaoApagar & { recriado: { codigo: string; novo: string; url: string; religadas: number; roteiros: number; pdfs: number; erro: string; naoDesfeito: string[] } };

describe('recriar o card apagado da cópia (#68)', () => {
  type Pedir = (c: string, i?: RequestInit) => Promise<Response>;
  // o envio de verdade grava a linha da produção pela API do Teable e preenche os campos do card
  const ENV_RECRIAR = {
    ...ENV,
    TEABLE_URL: ENV_DO_ACERVO.TEABLE_URL,
    TEABLE_TOKEN: ENV_DO_ACERVO.TEABLE_TOKEN,
    TEABLE_ARTE_PRODUCAO: 'tblProducao',
    TRELLO_CAMPO_BOT: 'cBot',
    TRELLO_CAMPO_PRACA: 'cPraca',
    TRELLO_PRACAS: 'G5=opG5,SP=opSP',
    TRELLO_CAMPO_ENTRADA: 'cEntrada',
    TRELLO_CAMPO_COMPLEXIDADE: 'cComplexidade',
    TRELLO_COMPLEXIDADE_OPCOES: 'opBaixa,opMedia,opAlta',
  };
  const escritas = (pedidos: string[]) => pedidos.filter((p) => !p.startsWith('GET '));
  const registroDe = async (chefe: Pedir) => ((await (await chefe('/api/duplicadas/registro')).json()) as { registro: AcaoRecriar[] }).registro;
  const recriar = (pedir: Pedir, id: number) => pedir('/api/duplicadas/recriar', { method: 'POST', body: JSON.stringify({ id }) });
  /**
   * O cenário: o primeiro show (com o roteiro guardado, o PDF dele no PROMeiro e as três artes do acervo) foi apagado
   * pelo PROMeiro, e ficou o segundo. A linha da produção dele saiu pelo n8n.
   */
  async function comApagado(env: Record<string, string> = ENV_RECRIAR) {
    const s = await comServidor(env);
    const { chefe, linhas, db } = s;
    const [sai, fica] = [linhas.show1.card_ID!, linhas.show2.card_ID!];
    Object.assign(linhas.show1, { artes: 'HOJE | AMANHÃ | SÁBADO | DOMINGO', key: 'SHOWDANOITE2011SP', texto: 'O texto do roteiro', complexidade: 2, redator: 'Redator Um', workflow: 'PROMeiro' });
    await chefe('/api/roteiros/rot-show-1', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'Show da Noite 20/11 SP' }, doc: { type: 'doc', content: [] } }, nArtes: 1 }) });
    await chefe('/api/roteiros/rot-show-1/trello', { method: 'POST', body: JSON.stringify({ jaEsta: { card: sai } }) });
    const anexos = criarAnexos(db);
    anexos.guardarPdf({ chave: 'rot-show-1', card: sai, nome: 'Show da Noite 20-11 SP.pdf', dados: Buffer.from('%PDF-1.4 de mentira') });
    const lista = (await (await chefe('/api/duplicadas')).json()) as Lista;
    const id = lista.casos.find((c) => c.claquete === 'Show da Noite 20/11 SP')!.id;
    const caso = (await (await chefe(`/api/duplicadas/caso?id=${encodeURIComponent(id)}`)).json()) as Caso;
    const r = await chefe('/api/duplicadas/apagar', { method: 'POST', body: JSON.stringify({ caso: caso.id, dias: 90, sai, fica, codigo: sai.slice(-4), vistos: Object.fromEntries(caso.cards.map((c) => [c.id, c])) }) });
    expect(r.status).toBe(200);
    s.tirarDaProducao(linhas.show1);
    const apagado = (await registroDe(chefe))[0];
    s.pedidos.length = 0;
    s.comentarios.length = 0;
    return { ...s, sai, fica, caso, apagado, anexos };
  }

  it('cria um card novo só com a cópia, pelo caminho do envio; a linha nasce como no envio; acervo, roteiro e PDF voltam; comenta no que ficou', async () => {
    const { chefe, sai, fica, apagado, pedidos, criados, producao, acervo, comentarios, anexos, linhas } = await comApagado();
    expect(apagado).toMatchObject({ acao: 'apagar', card: sai, estado: 'feito' });
    const r = await recriar(chefe, apagado.id);
    expect(r.status).toBe(200);
    const novo = criados[0];
    expect(await r.json()).toMatchObject({ registro: expect.any(Number), card: novo.id, codigo: novo.id.slice(-4), url: `https://trello.com/c/${novo.id.slice(-8)}`, religadas: 3, roteiros: 1, pdfs: 1, linha: true, comentou: true });
    // nada lido do Trello
    expect(pedidos.filter((p) => p.startsWith('GET /1/'))).toEqual([]);
    // o card na entrada da praça, com o nome, a descrição do envio, a checklist das artes, os campos e o PDF guardado
    expect(criados).toHaveLength(1);
    expect(novo).toMatchObject({ idList: 'entradaSP', name: 'Show da Noite 20/11 SP', checklists: [{ nome: 'ARTES PRODUZIDAS', itens: ['HOJE', 'AMANHÃ', 'SÁBADO', 'DOMINGO'] }], anexos: ['Show da Noite 20-11 SP.pdf'] });
    expect(novo.desc).toContain('**ARTES IDENTIFICADAS:**\n`HOJE`, `AMANHÃ`, `SÁBADO`, `DOMINGO`');
    expect(novo.campos).toEqual({
      cBot: { value: { checked: 'true' } },
      cPraca: { idValue: 'opSP' },
      cComplexidade: { idValue: 'opMedia' },
      cEntrada: { value: { date: linhas.show1.data_entrada } },
    });
    // a linha da produção do card novo, pela API do Teable como no envio, com a entrada de antes
    const nova = producao.find((l) => l.card_ID === novo.id)!;
    expect(nova).toMatchObject({ claquete: 'Show da Noite 20/11 SP', artes: 'HOJE | AMANHÃ | SÁBADO | DOMINGO', artes_quantidade: 4, key: 'SHOWDANOITE2011SP', redator: 'Redator Um', texto: 'O texto do roteiro', complexidade: 2, data_entrada: linhas.show1.data_entrada });
    expect(producao.filter((l) => l.card_ID === novo.id)).toHaveLength(1);
    // a ordem: o card, a linha, o acervo e, por último, o comentário no card que ficou
    const passos = escritas(pedidos).filter((p) => /^POST \/1\/cards$|tblProducao|tblAcervo|comments/.test(p));
    expect(passos).toEqual(['POST /1/cards', 'POST teable /api/table/tblProducao/record', 'PATCH teable /api/table/tblAcervo/record', `POST /1/cards/${fica}/actions/comments`]);
    // as artes do acervo, o roteiro guardado e o PDF voltam a apontar para o card novo
    expect(acervo.filter((a) => a.claquete[0].id === nova.registro).map((a) => a.arte)).toEqual(['HOJE', 'AMANHÃ', 'SÁBADO']);
    expect(((await (await chefe('/api/roteiros/rot-show-1/trello')).json()) as { url: string }).url).toBe(`https://trello.com/c/${novo.id.slice(-8)}`);
    expect(anexos.pdfDoCard(novo.id)).toMatchObject({ nome: 'Show da Noite 20-11 SP.pdf' });
    expect(anexos.pdfDoCard(sai)).toBeNull();
    expect(comentarios).toEqual([{ id: expect.any(String), card: fica, texto: `Card …${sai.slice(-4)} (Show da Noite 20/11 SP) recriado por Chefe pelo PROMeiro: o card novo é …${novo.id.slice(-4)}.` }]);
    // o Registro: "recriou o card", e a cópia passa a "recriado"
    const registro = await registroDe(chefe);
    expect(registro[0]).toMatchObject({ acao: 'recriar', card: sai, fica, por: 'Chefe', estado: 'feito', recriado: { codigo: sai.slice(-4), novo: novo.id.slice(-4), religadas: 3, roteiros: 1, pdfs: 1, erro: '', naoDesfeito: [] } });
    expect(registro.find((l) => l.id === apagado.id)).toMatchObject({ acao: 'apagar', estado: 'recriado' });
  });

  it('não recria duas vezes; só administradores; no modo só olhar, recusa; o que não foi apagado não recria', async () => {
    const { chefe, ana, apagado, pedidos, criados } = await comApagado();
    expect((await recriar(ana, apagado.id)).status).toBe(403);
    expect((await chefe('/api/duplicadas/recriar')).status).toBe(405);
    expect((await recriar(chefe, 99999)).status).toBe(404);
    expect(pedidos).toEqual([]);
    const [um, dois] = await Promise.all([recriar(chefe, apagado.id), recriar(chefe, apagado.id)]);
    expect([um.status, dois.status].sort()).toEqual([200, 409]);
    const tres = await recriar(chefe, apagado.id);
    expect(tres.status).toBe(409);
    expect((await tres.json()).erro).toMatch(/já foi recriado/);
    expect(criados).toHaveLength(1);
    // uma ação que não é apagar (o recriar mesmo) não recria
    expect((await recriar(chefe, (await registroDe(chefe))[0].id)).status).toBe(404);
    await parar?.();
    const soOlhando = await comApagado();
    await soOlhando.chefe('/api/duplicadas/modo', { method: 'POST', body: JSON.stringify({ soOlhar: true }) });
    const r = await recriar(soOlhando.chefe, soOlhando.apagado.id);
    expect(r.status).toBe(403);
    expect((await r.json()).erro).toMatch(/modo só olhar/);
    expect(soOlhando.criados).toEqual([]);
  });

  it('a linha que o n8n já criou para o card novo não nasce em dobro: o acervo vai para ela', async () => {
    const { chefe, apagado, pedidos, criados, producao, acervo, n8n } = await comApagado();
    n8n.criaLinha = true;
    expect((await recriar(chefe, apagado.id)).status).toBe(200);
    const doCard = producao.filter((l) => l.card_ID === criados[0].id);
    expect(doCard.map((l) => l.registro)).toEqual([expect.stringMatching(/^recDoN8n/)]);
    expect(escritas(pedidos)).not.toContain('POST teable /api/table/tblProducao/record');
    expect(acervo.filter((a) => a.claquete[0].id === doCard[0].registro)).toHaveLength(3);
  });

  it.each(['religar', 'comentar'] as const)('a falha ao %s desfaz tudo: o card novo sai, a linha sai, acervo, roteiro e PDF voltam; dá para tentar de novo', async (falha) => {
    const { chefe, sai, fica, apagado, falhar, criados, producao, acervo, noTrello, anexos, comentarios } = await comApagado();
    falhar.add(falha);
    const r = await recriar(chefe, apagado.id);
    expect(r.status).toBe(502);
    expect((await r.json()).erro).toMatch(/Nada ficou no Trello\. O que tinha sido feito foi desfeito\./);
    const novo = criados[0].id;
    expect(noTrello.some((c) => c.id === novo)).toBe(false);
    expect(producao.some((l) => l.card_ID === novo)).toBe(false);
    expect(comentarios).toEqual([]);
    expect(acervo.filter((a) => a.arte !== 'ABERTURA').map((a) => a.claquete[0].id)).toEqual(Array(3).fill(producao.find((l) => l.card_ID === fica)!.registro));
    expect(((await (await chefe('/api/roteiros/rot-show-1/trello')).json()) as { url: string }).url).toBe(`https://trello.com/c/${fica}`);
    expect(anexos.pdfDoCard(sai)).toMatchObject({ nome: 'Show da Noite 20-11 SP.pdf' });
    const registro = await registroDe(chefe);
    expect(registro[0]).toMatchObject({ acao: 'recriar', estado: 'falhou', recriado: { erro: expect.any(String), naoDesfeito: [] } });
    expect(registro.find((l) => l.id === apagado.id)).toMatchObject({ estado: 'feito' });
    falhar.clear();
    expect((await recriar(chefe, apagado.id)).status).toBe(200);
  });
});
