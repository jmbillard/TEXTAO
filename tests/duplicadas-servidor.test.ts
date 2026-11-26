// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarAcervo } from '../servidor/acervo.mjs';

/* A aba Duplicadas pela API (#65): o quadro do Trello e a produção da arte (o Postgres do Teable) de mentira, com
   cards fictícios. Só leitura: nenhum pedido que não seja GET sai para o Trello. */

const ENV = {
  CADASTRO_ADMINS: 'chefe@empresa.com',
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_QUADRO: 'quadroFicticio',
  TRELLO_LISTA_SP: 'entradaSP',
  TRELLO_LISTA_G5: 'entradaG5',
  TRELLO_SAIDA_SP: 'saidaSP',
  TRELLO_LISTA_ENTREGUES: 'entregues',
  TRELLO_CAMPO_PRACA: 'campoPraca',
  TRELLO_PRACAS: 'G5=opG5,SP=opSP,RJ=opRJ',
  TRELLO_CAMPO_ENTRADA: 'campoEntrada',
  TEABLE_PG_URL: 'postgres://falso',
  TEABLE_PG_ESQUEMA: 'bseFalso',
  TEABLE_PG_ARTE: 'producao',
  TEABLE_PG_ACERVO: 'acervo',
};

const DIA = 86_400_000;
const PESSOAS: Record<string, string> = { m1: 'Pessoa Um', m2: 'Pessoa Dois' };
let sequencia = 0;
/** Um id de card do Trello criado há `dias` (os 8 primeiros caracteres são o segundo da criação). */
const idCriadoHa = (dias: number) => Math.floor((Date.now() - dias * DIA) / 1000).toString(16).padStart(8, '0') + (++sequencia).toString(16).padStart(16, '0');

type CardFalso = { id: string; idShort: number; name: string; closed: boolean; idList: string; idMembers: string[]; praca?: string; due?: string; checkItems?: number; anexos?: string[] };
const quadro = () => {
  const c = (dias: number, name: string, o: Partial<CardFalso> = {}): CardFalso => ({ id: idCriadoHa(dias), idShort: 1000 + sequencia, name, closed: false, idList: 'entradaG5', idMembers: ['m1'], checkItems: 4, anexos: ['application/pdf'], ...o });
  const cards = {
    show1: c(6.2, 'Show da Noite 20/11 SP', { idShort: 4790, idList: 'saidaSP', idMembers: ['m1', 'm2'], due: '2026-11-20T23:00:00.000Z', anexos: ['application/pdf', 'image/png', 'image/jpeg'] }),
    show2: c(6, 'Show da Noite 20/11', { idShort: 4795, praca: 'opSPdoQuadro', closed: true, idList: 'entradaSP', idMembers: [], due: '2026-11-20T23:00:00.000Z' }),
    festa1: c(4.5, 'Festa na Praça 19/11 REDE'),
    festa2: c(4, 'FESTA NA PRACA 19/11', { closed: true, idMembers: [] }),
    cozinha1: c(9.5, 'Cozinha de Vó 18/11'),
    cozinha2: c(9, 'Cozinha de Vo 18/11', { idList: 'entregues' }),
    novela1: c(120, 'Novela Sinfonia 12/11', { closed: true }),
    novela2: c(119, 'Novela Sinfonia 12/11', { closed: true }),
    terra: c(3, 'Terra 20/11'),
    terraV2: c(2, 'Terra 20/11 V2'),
    sozinho: c(1, 'Sozinho 25/11'),
  };
  return cards;
};

function falsos() {
  const cards = quadro();
  const todos = Object.values(cards);
  const pedidos: string[] = [];
  const buscar = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const metodo = init.method ?? 'GET';
    pedidos.push(`${metodo} ${u.pathname}`);
    if (metodo !== 'GET') throw new Error(`a aba Duplicadas só lê: ${metodo} ${u.pathname}`);
    const resposta = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '' });
    const criado = (id: string) => parseInt(id.slice(0, 8), 16) * 1000;
    const comoTrello = (x: CardFalso) => ({
      id: x.id,
      idShort: x.idShort,
      name: x.name,
      closed: x.closed,
      idList: x.idList,
      idMembers: x.idMembers,
      due: x.due ?? null,
      shortUrl: `https://trello.com/c/${x.id.slice(-8)}`,
      dateLastActivity: new Date(criado(x.id)).toISOString(),
      badges: { checkItems: x.checkItems ?? 0, attachments: x.anexos?.length ?? 0 },
      customFieldItems: [
        ...(x.praca ? [{ idCustomField: 'campoPraca', idValue: x.praca }] : []),
        { idCustomField: 'campoEntrada', value: { date: new Date(criado(x.id)).toISOString() } },
      ],
    });
    if (u.pathname === '/1/boards/quadroFicticio/cards/all') {
      // de duas em duas, do mais novo ao mais antigo, como a paginação do Trello pelo `before`
      const desde = Date.parse(u.searchParams.get('since') ?? '') || 0;
      const antes = u.searchParams.get('before');
      const pagina = todos
        .filter((x) => criado(x.id) >= desde && (!antes || x.id < antes))
        .sort((a, b) => b.id.localeCompare(a.id))
        .slice(0, 2);
      return resposta(pagina.map(comoTrello));
    }
    // a opção do campo PRAÇA que TRELLO_PRACAS não tem: vale o texto dela no quadro
    if (u.pathname === '/1/boards/quadroFicticio/customFields')
      return resposta([{ id: 'campoPraca', name: 'PRAÇA', options: [{ id: 'opSP', value: { text: 'SP' } }, { id: 'opSPdoQuadro', value: { text: 'SP' } }] }]);
    if (u.pathname === '/1/boards/quadroFicticio/lists')
      return resposta([
        { id: 'entradaSP', name: 'ENTRADA SP', closed: false },
        { id: 'entradaG5', name: 'ENTRADA G5', closed: false },
        { id: 'saidaSP', name: 'SAÍDA SP', closed: false },
        { id: 'entregues', name: 'PROJETOS ENTREGUES', closed: false },
      ]);
    const umCard = /^\/1\/cards\/([0-9a-f]{24})$/.exec(u.pathname);
    if (umCard) {
      const x = todos.find((y) => y.id === umCard[1]);
      if (!x) return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
      return resposta({ ...comoTrello(x), attachments: (x.anexos ?? []).map((mimeType, i) => ({ id: `a${i}`, name: `anexo${i}`, mimeType })), members: x.idMembers.map((id) => ({ id, fullName: PESSOAS[id] })) });
    }
    throw new Error(`pedido inesperado ao Trello: ${u.pathname}`);
  };
  // a produção da arte: o show tem as duas linhas; a festa e a cozinha, uma; a novela, uma
  const producao = [
    { registro: 'recShow1', card_ID: cards.show1.id, status: '["FINALIZADO"]', designers: '["Designer Um","Designer Dois"]', data_entrada: '2026-11-13T12:00:00.000Z', artes: 'HOJE | AMANHÃ' },
    { registro: 'recShow2', card_ID: cards.show2.id, status: ['ENTRADA'], designers: null, data_entrada: '2026-11-13T15:00:00.000Z', artes: '' },
    { registro: 'recFesta1', card_ID: cards.festa1.id, status: [], designers: [], data_entrada: null, artes: '' },
    { registro: 'recCozinha1', card_ID: cards.cozinha1.id, status: [], designers: [], data_entrada: null, artes: '' },
    { registro: 'recCozinha2', card_ID: cards.cozinha2.id, status: [], designers: [], data_entrada: null, artes: '' },
    { registro: 'recNovela1', card_ID: cards.novela1.id, status: [], designers: [], data_entrada: null, artes: '' },
  ];
  // o acervo: três artes ligadas à linha do primeiro show, uma à da novela
  const acervo = [
    ...['HOJE', 'AMANHÃ', 'SÁBADO'].map((arte, i) => ({ id: `recA${i}`, arte, tipo: 'RDP', atracao: [{ id: 'recShow', title: 'Show da Noite' }], claquete: [{ id: 'recShow1', title: 'SHOW DA NOITE 20/11 SP' }], filme: null })),
    { id: 'recA9', arte: 'ABERTURA', tipo: 'CRT', atracao: [{ id: 'recNov', title: 'Novela Sinfonia' }], claquete: [{ id: 'recNovela1', title: 'NOVELA SINFONIA 12/11' }], filme: null },
  ];
  const consultar = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('"bseFalso"."acervo"')) return acervo;
    if (sql.includes('"bseFalso"."producao"') && sql.includes('card_ID')) {
      const ids = (params[0] as string[]) ?? [];
      return producao.filter((l) => ids.includes(l.card_ID));
    }
    return [];
  };
  return { cards, buscar, consultar, pedidos };
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
  const servidor = createServer(criarApp({ db: abrirBanco(':memory:'), env, trello, acervo }));
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = () => new Promise<void>((ok) => servidor.close(() => ok()));
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  return { ...f, chefe: como('chefe@empresa.com'), ana: como('ana@empresa.com') };
}

type Resumo = { id: string; claquete: string; praca: string; secao: string; cards: number; abertos: number; arquivados: number; comProducao: number; artesNoAcervo: number; dias: number };
type Lista = { ligado: boolean; lidoEm: string; cardsLidos: number; pendentes: number; dias: number; casos: Resumo[] };

describe('a lista das duplicadas', () => {
  it('agrupa os cards do período, com o contador, a data da leitura e o que cada caso tem', async () => {
    const { chefe } = await comServidor();
    const r = await chefe('/api/duplicadas');
    expect(r.status).toBe(200);
    const lista = (await r.json()) as Lista;
    expect(lista).toMatchObject({ ligado: true, dias: 90, pendentes: 3, cardsLidos: 9 });
    expect(Date.now() - Date.parse(lista.lidoEm)).toBeLessThan(60_000);
    expect(lista.casos.map((c) => [c.claquete, c.praca, c.secao])).toEqual([
      ['Festa na Praça 19/11 REDE', 'G5', 'misto'],
      ['Show da Noite 20/11 SP', 'SP', 'misto'],
      ['Cozinha de Vó 18/11', 'G5', 'abertos'],
    ]);
    const show = lista.casos[1];
    expect(show).toMatchObject({ cards: 2, abertos: 1, arquivados: 1, comProducao: 2, artesNoAcervo: 3, dias: 6 });
    expect(lista.casos[0]).toMatchObject({ comProducao: 1, artesNoAcervo: 0, dias: 4 });
  });

  it('o período escolhe os cards (30 a 730 dias); a busca filtra pela claquete sem mudar o contador', async () => {
    const { chefe } = await comServidor();
    const longe = (await (await chefe('/api/duplicadas?dias=180')).json()) as Lista;
    expect(longe).toMatchObject({ dias: 180, pendentes: 4, cardsLidos: 11 });
    expect(longe.casos.at(-1)).toMatchObject({ claquete: 'Novela Sinfonia 12/11', secao: 'arquivados', comProducao: 1, artesNoAcervo: 1 });
    const busca = (await (await chefe('/api/duplicadas?busca=cozinha%20de%20vo')).json()) as Lista;
    expect(busca.pendentes).toBe(3);
    expect(busca.casos.map((c) => c.claquete)).toEqual(['Cozinha de Vó 18/11']);
    for (const dias of ['0', '731', 'abc']) expect((await chefe(`/api/duplicadas?dias=${dias}`)).status).toBe(400);
  });

  it('a leitura do Trello é paginada e guardada por alguns minutos; "renovar" lê de novo', async () => {
    const { chefe, pedidos } = await comServidor();
    await chefe('/api/duplicadas');
    const paginas = pedidos.filter((p) => p.endsWith('/cards/all')).length;
    expect(paginas).toBeGreaterThanOrEqual(5);
    const antes = (await (await chefe('/api/duplicadas')).json()) as Lista;
    expect(pedidos.filter((p) => p.endsWith('/cards/all')).length).toBe(paginas);
    await new Promise((ok) => setTimeout(ok, 5));
    const depois = (await (await chefe('/api/duplicadas?renovar=1')).json()) as Lista;
    expect(pedidos.filter((p) => p.endsWith('/cards/all')).length).toBe(paginas * 2);
    expect(Date.parse(depois.lidoEm)).toBeGreaterThan(Date.parse(antes.lidoEm));
  });

  it('só administradores', async () => {
    const { ana, pedidos } = await comServidor();
    const r = await ana('/api/duplicadas');
    expect(r.status).toBe(403);
    expect((await ana('/api/duplicadas/caso?id=x')).status).toBe(403);
    expect(pedidos).toEqual([]);
  });

  it('sem o quadro configurado, a aba diz que não está ligada', async () => {
    const { chefe, pedidos } = await comServidor({ ...ENV, TRELLO_QUADRO: '' });
    expect(await (await chefe('/api/duplicadas')).json()).toMatchObject({ ligado: false, pendentes: 0, casos: [] });
    expect(pedidos).toEqual([]);
  });
});

describe('o detalhe de um caso', () => {
  it('os cards lado a lado, com a lista, o estado, a produção, o acervo, o roteiro no PROMeiro e a sugestão', async () => {
    const { chefe, cards } = await comServidor();
    // o roteiro guardado no PROMeiro que foi para o primeiro show
    await chefe('/api/roteiros/rot-show-1', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'Show da Noite 20/11 SP' }, doc: { type: 'doc', content: [] } }, nArtes: 1 }) });
    await chefe('/api/roteiros/rot-show-1/trello', { method: 'POST', body: JSON.stringify({ jaEsta: { card: cards.show1.id } }) });
    const lista = (await (await chefe('/api/duplicadas')).json()) as Lista;
    const r = await chefe(`/api/duplicadas/caso?id=${encodeURIComponent(lista.casos[1].id)}`);
    expect(r.status).toBe(200);
    const caso = await r.json();
    expect(caso.sugestao).toEqual({ fica: cards.show1.id, saem: [cards.show2.id] });
    expect(caso.cards).toHaveLength(2);
    expect(caso.cards[0]).toMatchObject({
      id: cards.show1.id,
      numero: 4790,
      nome: 'Show da Noite 20/11 SP',
      lista: 'SAÍDA SP',
      arquivado: false,
      exibicao: '2026-11-20T23:00:00.000Z',
      entrada: '2026-11-13T12:00:00.000Z',
      status: ['FINALIZADO'],
      designers: ['Designer Um', 'Designer Dois'],
      membros: ['Pessoa Um', 'Pessoa Dois'],
      checklist: 4,
      anexos: '1 PDF, 2 imagens',
      producao: true,
      acervo: 3,
      roteiro: { id: 'rot-show-1', claquete: 'Show da Noite 20/11 SP', por: 'Chefe' },
      url: `https://trello.com/c/${cards.show1.id.slice(-8)}`,
      motivo: 'Não foi arquivado na entrada.',
    });
    expect(caso.cards[1]).toMatchObject({ id: cards.show2.id, numero: 4795, lista: 'ENTRADA SP', arquivado: true, status: ['ENTRADA'], designers: [], membros: [], anexos: '1 PDF', producao: true, acervo: 0, roteiro: null, motivo: 'Arquivado na lista de entrada.' });
    expect(Date.parse(caso.cards[1].criado) - Date.parse(caso.cards[0].criado)).toBeGreaterThan(0);
  });

  it('o caso que não existe mais no período responde 404', async () => {
    const { chefe } = await comServidor();
    expect((await chefe('/api/duplicadas/caso?id=NADA%7CG5%7C')).status).toBe(404);
  });
});
