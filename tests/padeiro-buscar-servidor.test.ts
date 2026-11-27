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

/* O índice do buscar (#143): com a chave do Padeiro ligada, o Padeiro lê o índice das atrações (a busca de caminhos e a
   claquete) do PROMeiro, no lugar do fluxo PROMO - BUSCAR do n8n, no mesmo formato que ele já entende ({ v: 2, stamp,
   generated, teams, trello, atracoes, filmes }). As atrações vêm do cadastro (Cadastros), as Produções do PROMeiro, e os
   filmes e as mensagens do Teams do Postgres do Teable (o de mentira). Nada é lido do Trello. Nomes, caminhos,
   claquetes, usuários e e-mails inventados. */

const CHEFE = 'chefe@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso-do-trello', TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP' };
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg', atracoes: 'atracoes_pg', KEY_atracoes: 'key_atracoes_pg', filmes: 'filmes_pg', mensagens: 'mensagens_pg' };
const DIA = 86_400_000;
const ha = (n: number) => new Date(Date.now() - n * DIA).toISOString();
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });

const producoes = () => [
  registro('recPad1', { card_ID: card(1), claquete: 'Show da Noite 20/12 SP', status: '[]', designers: null, data_entrada: ha(1), __last_modified_time: ha(1) }),
  registro('recPad2', { card_ID: card(2), claquete: 'Festa na Praça 20/12 SP', status: '["PRODUZINDO"]', designers: '["Caio Prates"]', data_entrada: ha(2), __last_modified_time: ha(2) }),
  // a Entregue entra, com o fim
  registro('recPad3', { card_ID: card(3), claquete: 'Jogo Final 20/12 SP', status: '["FINALIZADO"]', designers: '["Ana Souza", "Caio Prates"]', entregue: true, data_entrada: ha(3), data_entrega: ha(1), __last_modified_time: ha(1) }),
  // a que entrou há mais de 15 dias fica de fora
  registro('recPad4', { card_ID: card(4), claquete: 'Antiga 01/12 SP', status: '["PRODUZINDO"]', designers: null, data_entrada: ha(20), __last_modified_time: ha(20) }),
  // o filme, sem card
  registro('recPad5', { card_ID: '', claquete: 'Filme da Tarde 21/12', status: '["FILME"]', designers: null, filme: [{ id: 'recFilme1', title: 'Filme da Tarde' }], data_entrada: ha(1.5), __last_modified_time: ha(1.5) }),
];
const atracoes = () => [
  registro('recAtrShow', { atracao: 'Show da Noite', categoria: 'Shows', projeto_win: '\\\\servidor-falso\\ARTE\\SHOWS\\SHOW DA NOITE \\01 PROJETOS\\', output_win: '//servidor-falso/SAIDA/SHOWS/SHOW DA NOITE/' }),
  registro('recAtrFesta', { atracao: 'Festa na Praça', categoria: 'shows', projeto_win: '//servidor-falso/ARTE/SHOWS/FESTA', output_win: 'caminho_nao_encontrado' }),
  // sem caminho nenhum: fica de fora
  registro('recAtrSem', { atracao: 'Sem Pasta Nenhuma', categoria: 'Programas', projeto_win: '', output_win: '' }),
];
const keys = () => [
  registro('recKey1', { key: 'SHOW NOITE', atracoes: [{ id: 'recAtrShow', title: 'Show da Noite' }] }),
  registro('recKey2', { key: 'SHOW DA NOITE', atracoes: [{ id: 'recAtrShow', title: 'Show da Noite' }] }),
];
const filmes = () => [
  registro('recFilme1', { key: 1, titulo: 'Filme da Tarde', ano_de_producao: 2020, output: '', output_win: '\\\\servidor-falso\\FILMES\\F\\FILME DA TARDE\\' }),
  // o mesmo título (outra caixa): vale o de key maior, com o output antigo (texto) antes do calculado
  registro('recFilme2', { key: 2, titulo: 'filme da tarde ', ano_de_producao: null, output: '//servidor-falso/FILMES/ANTIGO/FILME DA TARDE', output_win: '//servidor-falso/FILMES/F/FILME DA TARDE' }),
  registro('recFilme3', { key: 3, titulo: 'Sem Saída', ano_de_producao: 2021, output: null, output_win: '' }),
  registro('recFilme4', { key: 4, titulo: 'Zebra Azul', ano_de_producao: null, output: null, output_win: '//servidor-falso/FILMES/Z/ZEBRA AZUL' }),
];
const mensagem = (id: string, dias: number, de: string, conteudo: string) =>
  registro(id, { messageID: id, receivedDateTime: ha(dias), from: de, jobTitle: 'DESIGNER I', groupID: '19:grupo-falso@thread.v2', content: conteudo });
const mensagens = () => [
  // o arquivo vira a pasta dele, e o texto grudado depois da extensão sai
  mensagem('1001', 0.1, 'Ana Souza', 'olha aqui \\\\servidor-falso\\ARTE\\SHOWS\\SHOW DA NOITE\\2026\\abertura.aepValeu'),
  // a mesma pasta, pelo Mac (no volume montado de novo, -2): conta uma vez, a mais recente
  mensagem('1002', 1, 'Caio Prates', 'tá em /Volumes/ARTE-2/SHOWS/SHOW DA NOITE/2026.'),
  mensagem('1003', 2, 'Caio Prates', 'as logos: /Volumes/ARTE/SHOWS/FESTA/2026/LOGOS\nobrigado'),
  // a de mais de 30 dias, o caminho curto demais e a mensagem sem caminho ficam de fora
  mensagem('1004', 40, 'Ana Souza', '/Volumes/ARTE/SHOWS/VELHO/2025'),
  mensagem('1005', 0.5, 'Ana Souza', 'só /Volumes/ARTE'),
  mensagem('1006', 0.2, 'Ana Souza', 'bom dia'),
];
const designers = () => [registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana.souza@empresa.com', designer_ID: 'membroAna', status: 'ativo' })];

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function preparado({ nomes = NOMES as Record<string, string> } = {}) {
  const db = abrirBanco(':memory:');
  const em = ha(1);
  // o Roteiro enviado para o card da primeira: o programa (em outra grafia) liga a Produção à atração do cadastro
  db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'roteiro-show',
    'redatora@empresa.com',
    'Redatora',
    JSON.stringify({ claquete: 'Show da Noite 20/12 SP', programa: 'show da noite', redator: 'LIA', editor: 'BETO' }),
    '{}',
    em,
    em,
  );
  db.prepare("INSERT INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'ok', ?, ?)").run('roteiro-show', card(1), em);
  const registros = { ARTE_producao: producoes(), exibicoes: [], designers: designers(), atracoes: atracoes(), KEY_atracoes: keys(), filmes: filmes(), mensagens: mensagens() };
  const teable = teableFalso(nomes, { registros });
  const trelloPedidos: string[] = [];
  const buscarNoTrello = async (endereco: string) => {
    trelloPedidos.push(new URL(endereco).pathname);
    return Response.json({});
  };
  const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg,
    trello: (env: unknown, deps: Record<string, unknown>) => criarTrello(env, { ...deps, buscar: buscarNoTrello }),
    cadastros: (env: Record<string, string>) => criarCadastros(env, { buscar: teable }),
  });
  await app.releituraPronta;
  await app.pessoasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const padeiro = (caminho: string, { chave, ...init }: RequestInit & { chave?: string } = {}) =>
    fetch(base + caminho, { ...init, headers: { 'content-type': 'application/json', ...(chave ? { 'x-chave-do-padeiro': chave } : {}), ...init.headers } });
  const chefe = (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': CHEFE, 'content-type': 'application/json', ...init.headers } });
  const cadastrar = async () => {
    const r = await padeiro('/api/padeiro/cadastro', { method: 'POST', body: JSON.stringify({ usuario: 'ana.souza', computador: 'MAC-ARTE-07', sistema: 'macOS 15.1', sigla: 'ANA' }) });
    const { chave } = (await r.json()) as { chave: string };
    const lista = (await (await chefe('/api/cadastros/padeiros')).json()) as { padeiros: { id: string; estado: string }[] };
    return { chave, id: lista.padeiros.find((p) => p.estado === 'pendente')!.id };
  };
  const ligar = (id: string) => chefe(`/api/cadastros/padeiros/${id}/ligar`, { method: 'POST', body: JSON.stringify({ designer: 'recDesignerAna' }) });
  const revogar = (id: string) => chefe(`/api/cadastros/padeiros/${id}/revogar`, { method: 'POST' });
  const daAna = async () => {
    const p = await cadastrar();
    expect((await ligar(p.id)).status).toBe(200);
    return p;
  };
  return { teable, trelloPedidos, padeiro, cadastrar, ligar, revogar, daAna };
}

type Indice = {
  v: number;
  stamp: string;
  generated: string;
  teams: Record<string, string>[];
  trello: Record<string, unknown>[];
  atracoes: Record<string, unknown>[];
  filmes: Record<string, unknown>[];
};
const ler = async (padeiro: (c: string, i?: RequestInit & { chave?: string }) => Promise<Response>, chave?: string) => {
  const r = await padeiro('/api/padeiro/buscar', { chave });
  return { status: r.status, corpo: (await r.json()) as Indice & { erro?: string; estado?: string } };
};

describe('o Padeiro: o índice do buscar vindo do PROMeiro', () => {
  it('com a chave ligada, devolve o índice no formato v2 do buscar (o do n8n), com o stamp e a hora', async () => {
    const { padeiro, daAna } = await preparado();
    const { chave } = await daAna();
    const { status, corpo } = await ler(padeiro, chave);
    expect(status).toBe(200);
    expect(corpo.v).toBe(2);
    expect(corpo.stamp).toMatch(/^[0-9a-f]{10}$/);
    expect(Math.abs(Date.parse(corpo.generated) - Date.now())).toBeLessThan(60_000);
    expect(corpo.generated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(Object.keys(corpo).sort()).toEqual(['atracoes', 'filmes', 'generated', 'stamp', 'teams', 'trello', 'v']);
    // o mesmo conteúdo, o mesmo stamp (o Padeiro compara com o que já tem)
    expect((await ler(padeiro, chave)).corpo.stamp).toBe(corpo.stamp);
  });

  it('as atrações vêm do cadastro: o nome, a categoria em maiúsculas, as keys como padrões e as pastas com barras normais', async () => {
    const { padeiro, daAna } = await preparado();
    const { chave } = await daAna();
    const { corpo } = await ler(padeiro, chave);
    expect(corpo.atracoes).toEqual([
      // o caminho que o cadastro não sabe (caminho_nao_encontrado) não é pasta
      { name: 'Festa na Praça', cat: 'SHOWS', proj: '//servidor-falso/ARTE/SHOWS/FESTA' },
      { name: 'Show da Noite', cat: 'SHOWS', pattern: ['SHOW NOITE', 'SHOW DA NOITE'], proj: '//servidor-falso/ARTE/SHOWS/SHOW DA NOITE/01 PROJETOS', out: '//servidor-falso/SAIDA/SHOWS/SHOW DA NOITE' },
    ]);
  });

  it('o trello são as Produções dos últimos 15 dias, as mais novas primeiro, com a Entregue marcada (fim) e o filme (fil)', async () => {
    const { padeiro, daAna, trelloPedidos } = await preparado();
    const { chave } = await daAna();
    const antes = trelloPedidos.length;
    const { corpo } = await ler(padeiro, chave);
    expect(corpo.trello.map((c) => c.claq)).toEqual(['Show da Noite 20/12 SP', 'Filme da Tarde 21/12', 'Festa na Praça 20/12 SP', 'Jogo Final 20/12 SP']);
    const [show, filme, festa, jogo] = corpo.trello;
    // a atração do Roteiro ligada ao nome do cadastro (o Padeiro compara com o nome da atração do índice)
    expect(show).toMatchObject({ claq: 'Show da Noite 20/12 SP', red: 'LIA', ed: 'BETO', card: card(1), atr: 'Show da Noite' });
    expect(show).not.toHaveProperty('fim');
    expect(show).not.toHaveProperty('fil');
    expect(Math.abs(Date.parse(String(show.at)) - Date.now() + DIA)).toBeLessThan(60_000);
    expect(filme).toMatchObject({ claq: 'Filme da Tarde 21/12', atr: 'Filme da Tarde', fil: true });
    expect(filme).not.toHaveProperty('card');
    expect(festa).toMatchObject({ card: card(2), des: 'Caio Prates' });
    expect(festa).not.toHaveProperty('red');
    expect(jogo).toMatchObject({ card: card(3), fim: true, des: 'Ana Souza, Caio Prates' });
    // a Produção vai junto (o aviso do Padeiro volta com ela)
    expect(corpo.trello.every((c) => typeof c.producao === 'string' && String(c.producao).length > 0)).toBe(true);
    // nada lido do Trello
    expect(trelloPedidos.length).toBe(antes);
  });

  it('os filmes: um por título, com o output (o antigo antes do calculado) e o ano; sem output fica de fora', async () => {
    const { padeiro, daAna } = await preparado();
    const { chave } = await daAna();
    const { corpo } = await ler(padeiro, chave);
    expect(corpo.filmes).toEqual([
      { name: 'filme da tarde', out: '//servidor-falso/FILMES/ANTIGO/FILME DA TARDE' },
      { name: 'Zebra Azul', out: '//servidor-falso/FILMES/Z/ZEBRA AZUL' },
    ]);
  });

  it('o teams: as pastas citadas nas mensagens dos últimos 30 dias, cada uma uma vez (a mais recente), da mais nova para a mais velha', async () => {
    const { padeiro, daAna } = await preparado();
    const { chave } = await daAna();
    const { corpo } = await ler(padeiro, chave);
    const quando = (dias: number) => expect.stringMatching(new RegExp(`^${ha(dias).slice(0, 13)}:\\d{2}:\\d{2}Z$`));
    expect(corpo.teams).toEqual([
      { from: 'Ana Souza', role: 'DESIGNER I', at: quando(0.1), chat: '19:grupo-falso@thread.v2', msg: '1001', path: '//servidor-falso/ARTE/SHOWS/SHOW DA NOITE/2026' },
      { from: 'Caio Prates', role: 'DESIGNER I', at: quando(2), chat: '19:grupo-falso@thread.v2', msg: '1003', path: '/Volumes/ARTE/SHOWS/FESTA/2026/LOGOS' },
    ]);
  });

  it('sem a tabela das mensagens nem a dos filmes na base, o índice vem com o teams e os filmes vazios', async () => {
    const { mensagens: _m, filmes: _f, ...semElas } = NOMES;
    const { padeiro, daAna } = await preparado({ nomes: semElas });
    const { chave } = await daAna();
    const { status, corpo } = await ler(padeiro, chave);
    expect(status).toBe(200);
    expect(corpo.teams).toEqual([]);
    expect(corpo.filmes).toEqual([]);
    expect(corpo.atracoes.length).toBe(2);
  });

  it('com o Teable fora do ar, 503 (o Padeiro fica com o webhook ou com a cópia que tem)', async () => {
    const { padeiro, daAna, teable } = await preparado();
    const { chave } = await daAna();
    teable.estado.fora = true;
    const { status, corpo } = await ler(padeiro, chave);
    expect(status).toBe(503);
    expect(corpo.erro).toMatch(/índice/);
  });

  it('o índice vai comprimido (gzip) para quem aceita', async () => {
    const { padeiro, daAna } = await preparado();
    const { chave } = await daAna();
    const r = await padeiro('/api/padeiro/buscar', { chave, headers: { 'accept-encoding': 'gzip' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-encoding')).toBe('gzip');
    expect(((await r.json()) as Indice).v).toBe(2);
  });

  it('só a ligada lê: a pendente e a revogada, 403 com o estado; sem chave ou com a errada, 401; e só GET', async () => {
    const { padeiro, cadastrar, ligar, revogar } = await preparado();
    const { chave, id } = await cadastrar();
    const pendente = await ler(padeiro, chave);
    expect(pendente).toMatchObject({ status: 403, corpo: { estado: 'pendente' } });
    expect(JSON.stringify(pendente.corpo)).not.toMatch(/Show da Noite/);
    await ligar(id);
    expect((await ler(padeiro, chave)).status).toBe(200);
    expect((await padeiro('/api/padeiro/buscar', { method: 'POST', chave })).status).toBe(404);
    await revogar(id);
    expect(await ler(padeiro, chave)).toMatchObject({ status: 403, corpo: { estado: 'revogada' } });
    expect((await ler(padeiro)).status).toBe(401);
    expect((await ler(padeiro, 'chave-inventada')).status).toBe(401);
  });
});
