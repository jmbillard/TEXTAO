// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';

/* O Padeiro e as Produções (#138): com a chave do Padeiro ligada a um designer, o Padeiro lê as Produções em Entrada e
   Produzindo para o grupo NO TRELLO, no formato `trello` que ele já entende (o do índice do buscar do n8n). Nada é lido
   do Trello: as Produções saem do PROMeiro (a carga da produção da arte do Teable de mentira). Claquetes, nomes,
   usuários, computadores e e-mails inventados. */

const CHEFE = 'chefe@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso-do-trello', TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP' };
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg' };
const DIA = 86_400_000;
const ha = (n: number) => new Date(Date.now() - n * DIA).toISOString();
// ids de card fictícios (24 caracteres hexadecimais)
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });

const linhas = () => [
  // Entrada, com card e o checklist (uma arte já marcada); o Roteiro enviado diz a atração, o redator e o editor
  registro('recPad1', { card_ID: card(1), claquete: 'Show da Noite 20/12 SP', status: '[]', designers: null, artes: 'HOJE | AMANHÃ | DOMINGO', data_entrada: ha(1), __last_modified_time: ha(1) }),
  // Produzindo, com outro designer
  registro('recPad2', { card_ID: card(2), claquete: 'Festa na Praça 20/12 SP', status: '["PRODUZINDO"]', designers: '["Caio Prates"]', data_entrada: ha(2), __last_modified_time: ha(2) }),
  // Entregue e arquivada: ficam de fora
  registro('recPad3', { card_ID: card(3), claquete: 'Jogo Final 20/12 SP', status: '["FINALIZADO"]', designers: '["Ana Souza"]', entregue: true, data_entrada: ha(3), data_entrega: ha(1), __last_modified_time: ha(1) }),
  registro('recPad4', { card_ID: card(4), claquete: 'Novela Sinfonia 12/12 SP', status: '["PRODUZINDO"]', designers: '["Ana Souza"]', arquivado: true, data_entrada: ha(4), __last_modified_time: ha(4) }),
  // o filme, sem card
  registro('recPad5', { card_ID: '', claquete: 'Filme da Tarde 21/12', status: '["FILME"]', designers: null, filme: [{ id: 'recFilme1', title: 'Filme da Tarde' }], data_entrada: ha(1), __last_modified_time: ha(1) }),
];
const designers = () => [
  registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana.souza@empresa.com', designer_ID: 'membroAna', status: 'ativo' }),
  registro('recDesignerCaio', { designer: 'Caio Prates', email: 'caio@empresa.com', designer_ID: 'membroCaio', status: 'ativo' }),
];

type Pedido = { metodo: string; caminho: string; consulta: Record<string, string> };
/** O Trello de mentira: anota cada pedido (sem a chave e o token) e responde ok, ou recusa onde `recusar` disser. */
function trelloFalso() {
  const pedidos: Pedido[] = [];
  const estado = { recusar: null as null | ((p: Pedido) => boolean) };
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const consulta = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'key' && k !== 'token'));
    const p = { metodo: init.method ?? 'GET', caminho: url.pathname.replace(/^\/1/, ''), consulta };
    pedidos.push(p);
    if (estado.recusar?.(p)) return new Response('invalid value for idMembers', { status: 400 });
    return Response.json({});
  };
  return { pedidos, estado, buscar };
}

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function preparado() {
  const db = abrirBanco(':memory:');
  // o Roteiro enviado para o card da primeira (o envio liga Roteiro ↔ card)
  const em = ha(1);
  db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'roteiro-show',
    'redatora@empresa.com',
    'Redatora',
    JSON.stringify({ claquete: 'Show da Noite 20/12 SP', programa: 'Show da Noite', redator: 'LIA', editor: 'BETO' }),
    '{}',
    em,
    em,
  );
  db.prepare("INSERT INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'ok', ?, ?)").run('roteiro-show', card(1), em);
  const registros = { ARTE_producao: linhas(), exibicoes: [], designers: designers() };
  const teable = teableFalso(NOMES, { registros });
  const t = trelloFalso();
  const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, trello: (env: unknown, deps: Record<string, unknown>) => criarTrello(env, { ...deps, buscar: t.buscar }) });
  await app.releituraPronta;
  await app.pessoasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  /** O Padeiro: sem login, com a chave no cabeçalho (quando tem). */
  const padeiro = (caminho: string, { chave, ...init }: RequestInit & { chave?: string } = {}) =>
    fetch(base + caminho, { ...init, headers: { 'content-type': 'application/json', ...(chave ? { 'x-chave-do-padeiro': chave } : {}), ...init.headers } });
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  /** Cadastra o Padeiro (pendente) e devolve a chave e o id dele na aba Padeiros. */
  const cadastrar = async (o: Record<string, string> = {}) => {
    const r = await padeiro('/api/padeiro/cadastro', { method: 'POST', body: JSON.stringify({ usuario: 'ana.souza', computador: 'MAC-ARTE-07', sistema: 'macOS 15.1', sigla: 'ANA', ...o }) });
    const { chave } = (await r.json()) as { chave: string };
    const lista = (await (await chefe('/api/cadastros/padeiros')).json()) as { padeiros: { id: string; usuario: string; estado: string }[] };
    const id = lista.padeiros.find((p) => p.usuario === (o.usuario ?? 'ana.souza') && p.estado === 'pendente')!.id;
    return { chave, id };
  };
  const ligar = (id: string, designer = 'recDesignerAna') => chefe(`/api/cadastros/padeiros/${id}/ligar`, { method: 'POST', body: JSON.stringify({ designer }) });
  const revogar = (id: string) => chefe(`/api/cadastros/padeiros/${id}/revogar`, { method: 'POST' });
  /** O Padeiro ligado à Ana. */
  const daAna = async () => {
    const p = await cadastrar();
    expect((await ligar(p.id)).status).toBe(200);
    return p;
  };
  const tela = async () => (await (await chefe('/api/producoes/por-praca')).json()) as { blocos: { colunas: Record<string, { id: string; claquete: string; etapa: string; designers: string[] }[]> }[] };
  const daClaquete = async (inicio: string) => (await tela()).blocos.flatMap((b) => Object.values(b.colunas).flat()).find((c) => c.claquete.startsWith(inicio))!;
  return { db, app, registros, teable, trello: t, padeiro, chefe, cadastrar, ligar, revogar, daAna, daClaquete };
}

type DoPadeiro = { claq: string; red: string; ed: string; card: string; at: string | null; fim: boolean; atr: string; fil: boolean; praca: string; producao: string; etapa: string; artes: { feitas: string[]; aFazer: string[] } };

describe('o Padeiro: a lista das Produções para o grupo NO TRELLO', () => {
  const ler = async (padeiro: (c: string, i?: RequestInit & { chave?: string }) => Promise<Response>, chave?: string) => {
    const r = await padeiro('/api/padeiro/producoes', { chave });
    return { status: r.status, corpo: (await r.json()) as { trello?: DoPadeiro[]; erro?: string; estado?: string } };
  };

  it('com a chave ligada, devolve as Produções em Entrada e Produzindo no formato `trello` do Padeiro, com a praça', async () => {
    const { padeiro, daAna, trello } = await preparado();
    const { chave } = await daAna();
    const { status, corpo } = await ler(padeiro, chave);
    expect(status).toBe(200);
    const lista = corpo.trello!;
    // as mais novas primeiro; a Entregue e a arquivada ficam de fora
    expect(lista.map((c) => c.claq)).toEqual(['Show da Noite 20/12 SP', 'Filme da Tarde 21/12', 'Festa na Praça 20/12 SP']);
    expect(lista[0]).toMatchObject({ claq: 'Show da Noite 20/12 SP', red: 'LIA', ed: 'BETO', card: card(1), fim: false, atr: 'Show da Noite', fil: false, praca: 'SP', etapa: 'entrada' });
    expect(lista[2]).toMatchObject({ claq: 'Festa na Praça 20/12 SP', red: '', ed: '', card: card(2), fim: false, fil: false, praca: 'SP', etapa: 'produzindo' });
    // a idade: a data de entrada, que o Padeiro lê com Date.parse
    expect(Math.abs(Date.parse(lista[0].at!) - Date.now() + DIA)).toBeLessThan(60_000);
    // a Produção vai junto (o aviso do Padeiro, #139, volta com ela)
    expect(lista.every((c) => typeof c.producao === 'string' && c.producao.length > 0)).toBe(true);
    // nada lido do Trello
    expect(trello.pedidos).toEqual([]);
  });

  it('os filmes vêm marcados (fil), com o título do filme como atração e sem card', async () => {
    const { padeiro, daAna } = await preparado();
    const { chave } = await daAna();
    const filme = (await ler(padeiro, chave)).corpo.trello!.find((c) => c.claq.startsWith('Filme da Tarde'))!;
    expect(filme).toMatchObject({ fil: true, atr: 'Filme da Tarde', card: '', fim: false });
  });

  it('as artes de cada Produção (o checklist: feitas e a fazer) vão num campo a mais, que o Padeiro de antes ignora', async () => {
    const { padeiro, daAna, db, daClaquete } = await preparado();
    const { chave } = await daAna();
    // a arte marcada no checklist chega pelo aviso do Trello; aqui, já guardada na Produção
    db.prepare('UPDATE producoes SET artes_marcadas = ? WHERE id = ?').run(JSON.stringify(['amanha']), (await daClaquete('Show da Noite')).id);
    const lista = (await ler(padeiro, chave)).corpo.trello!;
    expect(lista[0].artes).toEqual({ feitas: ['AMANHÃ'], aFazer: ['HOJE', 'DOMINGO'] });
    expect(lista[2].artes).toEqual({ feitas: [], aFazer: [] });
  });

  it('só a chave ligada lê: a pendente e a revogada são recusadas (403, com o estado); sem chave ou com a errada, 401', async () => {
    const { padeiro, cadastrar, ligar, revogar } = await preparado();
    const { chave, id } = await cadastrar();
    expect(await ler(padeiro, chave)).toMatchObject({ status: 403, corpo: { estado: 'pendente' } });
    await ligar(id);
    expect((await ler(padeiro, chave)).status).toBe(200);
    await revogar(id);
    expect(await ler(padeiro, chave)).toMatchObject({ status: 403, corpo: { estado: 'revogada' } });
    expect((await ler(padeiro)).status).toBe(401);
    expect((await ler(padeiro, 'chave-inventada')).status).toBe(401);
    // a pendente e a revogada não veem nenhuma Produção
    expect(JSON.stringify((await ler(padeiro, chave)).corpo)).not.toMatch(/Show da Noite/);
  });

  it('só GET', async () => {
    const { padeiro, daAna } = await preparado();
    const { chave } = await daAna();
    expect((await padeiro('/api/padeiro/producoes', { method: 'POST', chave })).status).toBe(404);
  });
});
