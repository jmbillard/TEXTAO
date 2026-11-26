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
};

const DIA = 86_400_000;
const PESSOAS: Record<string, string> = { m1: 'Pessoa Um', m2: 'Pessoa Dois' };
let sequencia = 0;
/** Um id de card do Trello criado há `dias` (os 8 primeiros caracteres são o segundo da criação). */
const idCriadoHa = (dias: number) => Math.floor((Date.now() - dias * DIA) / 1000).toString(16).padStart(8, '0') + (++sequencia).toString(16).padStart(16, '0');
const haDias = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();

type CardFalso = { id: string; idShort: number; name: string; closed: boolean; idList: string; idMembers: string[]; due?: string; checkItems?: number; anexos?: string[] };
/** Uma linha da produção da arte como sai do Postgres (status e designers em texto JSON ou lista). */
type LinhaFalsa = { registro: string; card_ID: string | null; claquete: string; praca: string | null; data_entrada: string | null; data_entrega?: string | null; artes_quantidade?: number | null; status: unknown; designers: unknown; arquivado: boolean | null; entregue: boolean | null; filme: unknown };

function falsos() {
  const noTrello: CardFalso[] = [];
  const producao: LinhaFalsa[] = [];
  /** Uma linha da produção que entrou há `dias`, com o card dela no Trello (a não ser que `card` diga outra coisa). */
  const linha = (dias: number, claquete: string, o: Partial<LinhaFalsa> = {}, t: Partial<CardFalso> | null = {}) => {
    const id = idCriadoHa(dias + 0.01);
    const l: LinhaFalsa = { registro: `rec${sequencia}`, card_ID: id, claquete, praca: null, data_entrada: haDias(dias), status: '["PRODUZINDO"]', designers: '["Designer Um"]', arquivado: false, entregue: false, filme: null, ...o };
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
  const buscar = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const metodo = init.method ?? 'GET';
    pedidos.push(`${metodo} ${u.pathname}`);
    if (metodo !== 'GET') throw new Error(`a aba Duplicadas só lê: ${metodo} ${u.pathname}`);
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
  const acervo = [
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
    return [];
  };
  return { linhas, buscar, consultar, pedidos, novaLinha, leituras: () => leiturasDaProducao };
}

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function comServidor(env: Record<string, string> = ENV) {
  const f = falsos();
  const trello = criarTrello(env, { buscar: f.buscar, consultar: f.consultar });
  const acervo = criarAcervo(env, { consultar: f.consultar, buscar: f.buscar });
  const app = criarApp({ db: abrirBanco(':memory:'), env, trello, acervo });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = () => new Promise<void>((ok) => servidor.close(() => ok()));
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  return { ...f, app, chefe: como('chefe@empresa.com'), ana: como('ana@empresa.com') };
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
