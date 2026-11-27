// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
import { chaveDeArte } from '../src/modelo/diferencas';

/* O card aberto da tela de produções (#160): o prazo, a atração, atribuir e tirar designer e as artes (marcar, apagar,
   desfazer, incluir, o fogo) pela API, com o Trello e o Teable de mentira. Cada ação escreve no Trello (o prazo, o
   membro, o checklist), grava o evento (origem PROMeiro) e muda a Produção; o Trello que recusa não deixa mudar nada. */

const DIA = 86_400_000;
const ha = (n: number) => new Date(Date.now() - n * DIA).toISOString();
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg', atracoes: 'atracoes_pg' };
const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso-do-trello', TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP' };

const linhas = () => [
  registro('recCa1', { card_ID: card(31), claquete: 'Novela Sinfonia 20/12 SP', status: '["PRODUZINDO"]', designers: '["Ana Souza"]', artes: 'HOJE (RDP) | HOJE (CRT) | AMANHÃ | DOMINGO', data_entrada: ha(2), __last_modified_time: ha(2) }),
  registro('recCa2', { card_ID: '', claquete: 'Cozinha de Vó 20/12 SP', status: null, designers: null, artes: 'VINHETA | CHAMADA', data_entrada: ha(1), __last_modified_time: ha(1) }),
];
const designers = () => [
  registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana@empresa.com', designer_ID: 'membroAna', status: 'ativo' }),
  registro('recDesignerCaio', { designer: 'Caio Prates', email: 'caio@empresa.com', designer_ID: 'membroCaio', status: 'ativo' }),
  registro('recDesignerDuda', { designer: 'Duda Reis', email: 'duda@empresa.com', status: 'ativo' }),
];
const atracoes = () => [registro('recAtrNovela', { atracao: 'Novela das Nove', categoria: 'Novelas' }), registro('recAtrShow', { atracao: 'Show da Noite', categoria: 'Variedades' })];

type Pedido = { metodo: string; caminho: string; consulta: Record<string, string> };
type Item = { id: string; name: string; state: 'complete' | 'incomplete' };

/** O Trello de mentira: o checklist das artes do card 31 (lido e mudado de verdade) e cada pedido anotado (sem a chave). */
function trelloFalso() {
  const pedidos: Pedido[] = [];
  let n = 0;
  const itens: Item[] = ['HOJE (RDP)', 'HOJE (CRT)', 'AMANHÃ', 'DOMINGO'].map((name) => ({ id: `item${++n}`, name, state: 'incomplete' }));
  const estado = { recusar: null as null | ((p: Pedido) => boolean), itens };
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const consulta = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'key' && k !== 'token'));
    const p = { metodo: init.method ?? 'GET', caminho: url.pathname.replace(/^\/1/, ''), consulta };
    pedidos.push(p);
    if (estado.recusar?.(p)) return new Response('recusado de mentira', { status: 400 });
    if (p.metodo === 'GET' && /\/checklists$/.test(p.caminho)) return Response.json([{ id: 'listaArtes', name: 'ARTES PRODUZIDAS', checkItems: estado.itens }]);
    const marcar = /\/checkItem\/([^/]+)$/.exec(p.caminho);
    if (marcar && p.metodo === 'PUT') estado.itens.find((i) => i.id === marcar[1])!.state = consulta.state as Item['state'];
    const apagar = /\/checklists\/[^/]+\/checkItems\/([^/]+)$/.exec(p.caminho);
    if (apagar && p.metodo === 'DELETE') estado.itens = estado.itens.filter((i) => i.id !== apagar[1]);
    if (p.metodo === 'POST' && /\/checklists\/[^/]+\/checkItems$/.test(p.caminho)) {
      const item: Item = { id: `item${++n}`, name: consulta.name, state: consulta.checked === 'true' ? 'complete' : 'incomplete' };
      estado.itens.push(item);
      return Response.json(item);
    }
    return Response.json({});
  };
  return { pedidos, estado, buscar };
}

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

type Card = { id: string; claquete: string; atracao: string; prazo: string | null; designers: string[]; artes: { aProduzir: number | null; entregues: number } };
type Evento = { tipo: string; campo?: string; antes: string | null; depois: string | null; quem: string | null; origem?: string; desfez?: boolean };
type ArteDoCard = { nome: string; itens: string[]; feita: boolean; fogo: number | null };
type Linha = { fogo_das_artes: string };
type Banco = { prepare: (sql: string) => { run: (...a: unknown[]) => unknown; get: (...a: unknown[]) => unknown } };
type Aberta = { eventos: Evento[]; artesDoCard: ArteDoCard[]; designersAtivos: string[]; atracoes: string[]; roteiro: { versao: number; em: string } | null };

async function preparado() {
  const t = trelloFalso();
  const db = abrirBanco(':memory:');
  const producaoDaArte = linhas();
  const teable = teableFalso(NOMES, { registros: { ARTE_producao: producaoDaArte, exibicoes: [], designers: designers(), atracoes: atracoes() } });
  const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: (env: Record<string, string>) => criarCadastros(env, { buscar: teable }), trello: (env: unknown, deps: Record<string, unknown>) => criarTrello(env, { ...deps, buscar: t.buscar }) });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  await app.tabelasProntas;
  await app.releituraPronta;
  await app.pessoasProntas;
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const ana = como('ana@empresa.com');
  const bia = como('bia@empresa.com');
  const cards = async () => ((await (await ana('/api/producoes/por-praca')).json()) as { blocos: { colunas: Record<string, Card[]> }[] }).blocos.flatMap((b) => Object.values(b.colunas).flat());
  const daClaquete = async (inicio: string) => (await cards()).find((c) => c.claquete.startsWith(inicio))!;
  const novela = (await daClaquete('Novela Sinfonia')).id;
  const cozinha = (await daClaquete('Cozinha de Vó')).id;
  const pedir = (o: string, corpo: Record<string, unknown>, quem = ana) => quem(`/api/producoes/${o}`, { method: 'POST', body: JSON.stringify(corpo) });
  const aberta = async (id: string) => (await (await ana(`/api/producoes/aberta?producao=${id}`)).json()) as Aberta;
  const doPROMeiro = async (id: string) => (await aberta(id)).eventos.filter((e) => e.origem === 'PROMeiro').map((e) => [e.tipo, e.campo ?? '', e.antes, e.depois, e.desfez ? 'desfez' : '']);
  // o Trello que o teste olha: só o que foi escrito (a leitura do checklist fica de fora)
  const escritas = () => t.pedidos.filter((p) => p.metodo !== 'GET');
  return { db, app, producaoDaArte, ana, bia, trello: t, teable, novela, cozinha, pedir, aberta, daClaquete, doPROMeiro, escritas };
}

describe('o card aberto da tela de produções (#160)', () => {
  it('abrir traz as artes como a janela do After, os designers ativos e as atrações do cadastro; sem Roteiro, sem versão, e o fogo começa na vela (#174)', async () => {
    const { aberta, novela, trello } = await preparado();
    const a = await aberta(novela);
    expect(a.artesDoCard).toEqual([
      { nome: 'HOJE', itens: ['HOJE (RDP)', 'HOJE (CRT)'], feita: false, fogo: 1 },
      { nome: 'AMANHÃ', itens: ['AMANHÃ'], feita: false, fogo: 1 },
      { nome: 'DOMINGO', itens: ['DOMINGO'], feita: false, fogo: 1 },
    ]);
    expect(a.designersAtivos).toEqual(['Ana Souza', 'Caio Prates', 'Duda Reis']);
    expect(a.atracoes).toEqual(['Novela das Nove', 'Show da Noite']);
    expect(a.roteiro).toBeNull();
    // abrir não pede nada ao Trello
    expect(trello.pedidos).toEqual([]);
  });

  it('o prazo: vira o due do card (18h de São Paulo), vale sobre a exibição na tela e vira evento', async () => {
    const { pedir, novela, daClaquete, doPROMeiro, escritas } = await preparado();
    const r = await pedir('prazo', { producao: novela, prazo: '2026-12-04' });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toMatchObject({ feito: { eventos: ['campo'], trello: ['prazo-mudou'] }, producao: { id: novela, prazo: '2026-12-04' } });
    expect(corpo.aberta.eventos.at(-1)).toMatchObject({ tipo: 'campo', campo: 'prazo', depois: '2026-12-04', quem: 'Ana Souza', origem: 'PROMeiro' });
    expect(escritas()).toEqual([{ metodo: 'PUT', caminho: `/cards/${card(31)}`, consulta: { due: '2026-12-04T21:00:00.000Z' } }]);
    expect((await daClaquete('Novela Sinfonia')).prazo).toBe('2026-12-04');
    // o mesmo prazo de novo não grava nada
    expect((await (await pedir('prazo', { producao: novela, prazo: '2026-12-04' })).json()).feito.eventos).toEqual([]);
    expect(escritas()).toHaveLength(1);
    expect(await doPROMeiro(novela)).toEqual([['campo', 'prazo', '2026-12-20', '2026-12-04', '']]);
    // o dia que não existe
    expect((await pedir('prazo', { producao: novela, prazo: '2026-02-31' })).status).toBe(400);
  });

  it('a atração: uma do cadastro (na grafia dele) ou desligada; vale sobre a da claquete, fica só no PROMeiro', async () => {
    const { pedir, novela, daClaquete, doPROMeiro, trello } = await preparado();
    const r = await pedir('atracao', { producao: novela, atracao: 'novela das nove' });
    expect(r.status).toBe(200);
    expect((await r.json()).producao.atracao).toBe('Novela das Nove');
    expect((await daClaquete('Novela Sinfonia')).atracao).toBe('Novela das Nove');
    expect((await pedir('atracao', { producao: novela, atracao: 'Não Existe' })).status).toBe(404);
    expect((await pedir('atracao', { producao: novela, atracao: '' })).status).toBe(200);
    expect((await daClaquete('Novela Sinfonia')).atracao).toBe('');
    expect((await doPROMeiro(novela)).map((e) => e.slice(0, 4))).toEqual([
      ['campo', 'atracao', null, 'Novela das Nove'],
      ['campo', 'atracao', 'Novela das Nove', null],
    ]);
    // o card do Trello não tem o campo da atração
    expect(trello.pedidos).toEqual([]);
  });

  it('atribuir e tirar designer: o membro dele entra e sai do card; a etapa não muda', async () => {
    const { pedir, novela, daClaquete, doPROMeiro, escritas } = await preparado();
    const r = await pedir('designer', { producao: novela, designer: 'caio prates', entra: true });
    expect(r.status).toBe(200);
    expect((await r.json()).producao).toMatchObject({ designers: ['Ana Souza', 'Caio Prates'] });
    expect((await pedir('designer', { producao: novela, designer: 'Ana Souza', entra: false })).status).toBe(200);
    expect(await daClaquete('Novela Sinfonia')).toMatchObject({ etapa: 'produzindo', designers: ['Caio Prates'] });
    expect(escritas()).toEqual([
      { metodo: 'POST', caminho: `/cards/${card(31)}/idMembers`, consulta: { value: 'membroCaio' } },
      { metodo: 'DELETE', caminho: `/cards/${card(31)}/idMembers/membroAna`, consulta: {} },
    ]);
    expect(await doPROMeiro(novela)).toEqual([
      ['designer-entrou', '', null, 'Caio Prates', ''],
      ['designer-saiu', '', 'Ana Souza', null, ''],
    ]);
    // quem não está no cadastro não entra; quem não tem o membro do Trello não entra no card que tem card
    expect((await pedir('designer', { producao: novela, designer: 'Zé Ninguém', entra: true })).status).toBe(404);
    const semMembro = await pedir('designer', { producao: novela, designer: 'Duda Reis', entra: true });
    expect(semMembro.status).toBe(403);
    expect((await semMembro.json()).erro).toMatch(/Duda Reis.*membro no Trello/);
  });

  it('a Produção sem card: designer e prazo mudam só no PROMeiro', async () => {
    const { pedir, cozinha, daClaquete, trello } = await preparado();
    expect((await pedir('designer', { producao: cozinha, designer: 'Duda Reis', entra: true })).status).toBe(200);
    expect((await pedir('prazo', { producao: cozinha, prazo: '2026-12-10' })).status).toBe(200);
    expect(await daClaquete('Cozinha de Vó')).toMatchObject({ designers: ['Duda Reis'], prazo: '2026-12-10' });
    expect(trello.pedidos).toEqual([]);
  });

  it('marcar e desmarcar a arte: os itens dela no checklist do card; a contagem da tela muda', async () => {
    const { pedir, novela, daClaquete, doPROMeiro, escritas, trello } = await preparado();
    const r = await pedir('arte', { producao: novela, arte: 'HOJE', acao: 'marcar' });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.feito).toEqual({ eventos: ['arte-marcada', 'arte-marcada'], trello: ['item-marcado', 'item-marcado'] });
    expect(corpo.aberta.artesDoCard[0]).toMatchObject({ nome: 'HOJE', feita: true });
    expect(escritas()).toEqual([
      { metodo: 'PUT', caminho: `/cards/${card(31)}/checkItem/item1`, consulta: { state: 'complete' } },
      { metodo: 'PUT', caminho: `/cards/${card(31)}/checkItem/item2`, consulta: { state: 'complete' } },
    ]);
    expect((await daClaquete('Novela Sinfonia')).artes).toEqual({ aProduzir: 3, entregues: 1 });
    expect((await pedir('arte', { producao: novela, arte: 'HOJE', acao: 'desmarcar' })).status).toBe(200);
    expect(trello.estado.itens.map((i) => i.state)).toEqual(['incomplete', 'incomplete', 'incomplete', 'incomplete']);
    expect((await doPROMeiro(novela)).map((e) => e[0])).toEqual(['arte-marcada', 'arte-marcada', 'arte-desmarcada', 'arte-desmarcada']);
  });

  it('apagar a arte tira os itens do checklist; o desfazer põe de volta, com a marca de antes, e marca o evento', async () => {
    const { pedir, novela, aberta, daClaquete, doPROMeiro, trello } = await preparado();
    await pedir('arte', { producao: novela, arte: 'AMANHÃ', acao: 'marcar' });
    const r = await pedir('arte', { producao: novela, arte: 'AMANHÃ', acao: 'apagar' });
    expect(r.status).toBe(200);
    expect((await r.json()).feito).toEqual({ eventos: ['arte-apagada'], trello: ['item-apagado'] });
    expect(trello.estado.itens.map((i) => i.name)).toEqual(['HOJE (RDP)', 'HOJE (CRT)', 'DOMINGO']);
    expect((await aberta(novela)).artesDoCard.map((a) => a.nome)).toEqual(['HOJE', 'DOMINGO']);
    expect((await daClaquete('Novela Sinfonia')).artes).toEqual({ aProduzir: 2, entregues: 0 });
    // o desfazer
    const v = await pedir('arte', { producao: novela, arte: 'AMANHÃ', acao: 'voltar' });
    expect(v.status).toBe(200);
    expect(trello.pedidos.at(-1)).toEqual({ metodo: 'POST', caminho: '/checklists/listaArtes/checkItems', consulta: { name: 'AMANHÃ', pos: 'bottom', checked: 'true' } });
    expect((await aberta(novela)).artesDoCard.map((a) => [a.nome, a.feita])).toEqual([
      ['HOJE', false],
      ['AMANHÃ', true],
      ['DOMINGO', false],
    ]);
    expect((await doPROMeiro(novela)).slice(1)).toEqual([
      ['arte-apagada', '', 'AMANHÃ', null, ''],
      ['arte-incluida', '', null, 'AMANHÃ', 'desfez'],
    ]);
    // não dá para voltar o que não está apagado
    expect((await pedir('arte', { producao: novela, arte: 'AMANHÃ', acao: 'voltar' })).status).toBe(404);
  });

  it('a arte apagada continua apagada quando a releitura do Teable traz a coluna de artes de novo', async () => {
    const { pedir, novela, aberta, app, producaoDaArte } = await preparado();
    await pedir('arte', { producao: novela, arte: 'DOMINGO', acao: 'apagar' });
    // o Teable mudou a linha (uma arte a mais), ainda com a apagada
    Object.assign(producaoDaArte[0].fields, { artes: 'HOJE (RDP) | HOJE (CRT) | AMANHÃ | DOMINGO | SEGUNDA', __last_modified_time: new Date().toISOString() });
    await app.relerAProducao();
    expect((await aberta(novela)).artesDoCard.map((a) => a.nome)).toEqual(['HOJE', 'AMANHÃ', 'SEGUNDA']);
  });

  it('incluir uma arte: entra no fim do checklist e na Produção; a que já existe, não', async () => {
    const { pedir, novela, aberta, trello } = await preparado();
    const r = await pedir('arte', { producao: novela, arte: 'PEÇA SOCIAL 1:1', acao: 'incluir' });
    expect(r.status).toBe(200);
    expect(trello.pedidos.at(-1)).toEqual({ metodo: 'POST', caminho: '/checklists/listaArtes/checkItems', consulta: { name: 'PEÇA SOCIAL 1:1', pos: 'bottom' } });
    expect((await aberta(novela)).artesDoCard.map((a) => a.nome)).toEqual(['HOJE', 'AMANHÃ', 'DOMINGO', 'PEÇA SOCIAL 1:1']);
    expect((await pedir('arte', { producao: novela, arte: 'amanha', acao: 'incluir' })).status).toBe(409);
    // a incluída que é apagada sai de vez (e o desfazer a traz de novo)
    await pedir('arte', { producao: novela, arte: 'PEÇA SOCIAL 1:1', acao: 'apagar' });
    expect((await aberta(novela)).artesDoCard).toHaveLength(3);
    await pedir('arte', { producao: novela, arte: 'PEÇA SOCIAL 1:1', acao: 'voltar' });
    expect((await aberta(novela)).artesDoCard).toHaveLength(4);
  });

  it('o Trello recusa: nada muda na Produção e nenhum evento; o passo que já foi é desfeito', async () => {
    const { pedir, novela, aberta, doPROMeiro, trello } = await preparado();
    trello.estado.recusar = (p) => p.metodo === 'PUT' && p.caminho.endsWith('/item2');
    const r = await pedir('arte', { producao: novela, arte: 'HOJE', acao: 'marcar' });
    expect(r.status).toBe(502);
    expect((await r.json()).erro).toMatch(/Trello recusou.*Nada mudou/s);
    // o item1 foi marcado e desmarcado de volta
    expect(trello.pedidos.filter((p) => p.metodo === 'PUT').map((p) => [p.caminho.split('/').at(-1), p.consulta.state])).toEqual([
      ['item1', 'complete'],
      ['item2', 'complete'],
      ['item1', 'incomplete'],
    ]);
    expect((await aberta(novela)).artesDoCard[0].feita).toBe(false);
    trello.estado.recusar = () => true;
    expect((await pedir('prazo', { producao: novela, prazo: '2026-12-05' })).status).toBe(502);
    expect((await pedir('designer', { producao: novela, designer: 'Caio Prates', entra: true })).status).toBe(502);
    expect(await doPROMeiro(novela)).toEqual([]);
  });

  it('o fogo: sobe o nível da arte no Roteiro ligado, com o evento', async () => {
    const { db, pedir, novela, aberta } = await preparado();
    const agora = new Date().toISOString();
    db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run('rotNovela', 'ana@empresa.com', 'Ana', JSON.stringify({ claquete: 'Novela Sinfonia 20/12 SP', versao: 2 }), '{}', agora, agora);
    db.prepare('UPDATE producoes SET roteiro_id = ? WHERE id = ?').run('rotNovela', novela);
    expect((await aberta(novela)).roteiro).toMatchObject({ versao: 2 });
    const r = await pedir('fogo', { producao: novela, arte: 'HOJE' });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.aberta.artesDoCard[0]).toMatchObject({ nome: 'HOJE', fogo: 2 });
    expect(corpo.aberta.eventos.at(-1)).toMatchObject({ tipo: 'fogo', campo: 'HOJE', antes: '1', depois: '2', origem: 'PROMeiro' });
    expect((await pedir('fogo', { producao: novela, arte: 'HOJE', nivel: 7 })).status).toBe(400);
  });

  it('o pedido mal feito: sem ligação a um designer, a Produção que não existe, a ação desconhecida e o método', async () => {
    const { pedir, bia, ana, novela, trello } = await preparado();
    const r = await pedir('prazo', { producao: novela, prazo: '2026-12-04' }, bia);
    expect(r.status).toBe(403);
    expect((await r.json()).erro).toMatch(/administrador/);
    expect((await pedir('designer', { producao: 'nao-existe', designer: 'Caio Prates', entra: true })).status).toBe(404);
    expect((await pedir('arte', { producao: novela, arte: 'HOJE', acao: 'pintar' })).status).toBe(400);
    expect((await pedir('arte', { producao: novela, arte: 'NÃO TEM', acao: 'apagar' })).status).toBe(404);
    expect((await ana('/api/producoes/prazo')).status).toBe(405);
    expect(trello.pedidos).toEqual([]);
  });
});

describe('o fogo das artes com ou sem Roteiro (#174)', () => {
  const roteiro = (db: Banco, id: string, meta: Record<string, unknown>) => {
    const agora = new Date().toISOString();
    db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'ana@empresa.com', 'Ana', JSON.stringify(meta), '{}', agora, agora);
  };
  const metaDe = (db: Banco, id: string) => JSON.parse((db.prepare('SELECT meta FROM roteiros WHERE id = ?').get(id) as { meta: string }).meta);
  const fogosDa = (db: Banco, id: string) => JSON.parse((db.prepare('SELECT fogo_das_artes FROM producoes WHERE id = ?').get(id) as Linha).fogo_das_artes);
  const fogos = (a: Aberta) => a.artesDoCard.map((x) => [x.nome, x.fogo]);

  it('sem Roteiro: o clique sobe o nível (vela, fogueira, incêndio e volta), guardado na Produção, com o evento; o `nivel` leva direto', async () => {
    const { db, pedir, novela, aberta } = await preparado();
    const r = await pedir('fogo', { producao: novela, arte: 'AMANHÃ' });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(fogos(corpo.aberta)).toEqual([['HOJE', 1], ['AMANHÃ', 2], ['DOMINGO', 1]]);
    expect(corpo.aberta.eventos.at(-1)).toMatchObject({ tipo: 'fogo', campo: 'AMANHÃ', antes: '1', depois: '2', origem: 'PROMeiro' });
    expect(fogosDa(db, novela)).toEqual({ [chaveDeArte('AMANHÃ')]: 2 });
    await pedir('fogo', { producao: novela, arte: 'AMANHÃ' });
    expect(fogos(await aberta(novela))[1]).toEqual(['AMANHÃ', 3]);
    await pedir('fogo', { producao: novela, arte: 'AMANHÃ' });
    // a BAIXA não é guardada, como no Roteiro
    expect(fogosDa(db, novela)).toEqual({});
    expect((await (await pedir('fogo', { producao: novela, arte: 'HOJE', nivel: 3 })).json()).aberta.artesDoCard[0].fogo).toBe(3);
    expect(fogosDa(db, novela)).toEqual({ HOJE: 3 });
  });

  it('a arte incluída pelo "+ arte" também tem fogo', async () => {
    const { pedir, novela, aberta } = await preparado();
    expect((await pedir('arte', { producao: novela, arte: 'PEÇA SOCIAL 1:1', acao: 'incluir' })).status).toBe(200);
    expect(fogos(await aberta(novela)).at(-1)).toEqual(['PEÇA SOCIAL 1:1', 1]);
    await pedir('fogo', { producao: novela, arte: 'PEÇA SOCIAL 1:1' });
    expect(fogos(await aberta(novela)).at(-1)).toEqual(['PEÇA SOCIAL 1:1', 2]);
  });

  it('o Roteiro ligado depois: o fogo dele vale; a arte sem fogo nele recebe o da Produção, que passa para o Roteiro', async () => {
    const { db, pedir, novela, aberta } = await preparado();
    await pedir('fogo', { producao: novela, arte: 'HOJE' });
    await pedir('fogo', { producao: novela, arte: 'AMANHÃ', nivel: 3 });
    expect(fogosDa(db, novela)).toEqual({ HOJE: 2, [chaveDeArte('AMANHÃ')]: 3 });
    // o Roteiro já marcou a AMANHÃ como MÉDIA; a HOJE, não
    roteiro(db, 'rotNovela', { claquete: 'Novela Sinfonia 20/12 SP', complexidade: { [chaveDeArte('AMANHÃ')]: 2 } });
    db.prepare('UPDATE producoes SET roteiro_id = ? WHERE id = ?').run('rotNovela', novela);
    expect(fogos(await aberta(novela))).toEqual([['HOJE', 2], ['AMANHÃ', 2], ['DOMINGO', 1]]);
    expect(metaDe(db, 'rotNovela').complexidade).toEqual({ HOJE: 2, [chaveDeArte('AMANHÃ')]: 2 });
    expect(fogosDa(db, novela)).toEqual({});
    // daí em diante, o fogo muda no Roteiro
    await pedir('fogo', { producao: novela, arte: 'DOMINGO' });
    expect(metaDe(db, 'rotNovela').complexidade).toEqual({ HOJE: 2, [chaveDeArte('AMANHÃ')]: 2, DOMINGO: 2 });
    expect(fogosDa(db, novela)).toEqual({});
  });

});
