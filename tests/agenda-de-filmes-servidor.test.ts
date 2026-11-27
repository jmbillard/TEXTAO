// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';

/* A agenda de filmes da aba Filmes (#169): para quem está logado, os filmes com exibição perto de hoje (a mesma leitura
   dos filmes recentes do Padeiro, #142), agora com todas as exibições de cada filme, o pôster pelo caminho com login e a
   Produção ligada pelo card. O Teable e o Trello são de mentira; títulos, pastas, cards e e-mails inventados. */

const ANA = 'ana@empresa.com';
const ENV = {
  ...TEABLE_FALSO,
  TEABLE_PG_URL: 'postgres://falso',
  TEABLE_PG_ESQUEMA: 'bseFalso',
  TRELLO_KEY: 'chave-falsa',
  TRELLO_TOKEN: 'token-falso-do-trello',
};
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg', filmes: 'filmes_pg' };
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });

/** O dia de Brasília daqui a `n` dias (AAAA-MM-DD). */
const dia = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + n * 86_400_000));
/** A exibição como o PROMeiro grava (a meia-noite de Brasília), ou numa hora certa (`hora`, em Brasília). */
const exibicao = (id: string, filme: string, n: number, o: Record<string, unknown> = {}, hora = '00:00') =>
  registro(id, {
    filme: { id: filme, title: filme },
    data_de_exibicao: new Date(`${dia(n)}T${hora}:00-03:00`).toISOString(),
    sessao: { id: 'recSessao', title: 'Sessão da Noite' },
    inedito: false,
    link: '',
    card_ID: '',
    labels: null,
    ...o,
  });

const filme = (id: string, titulo: string, ano: number | null, nomeDaPasta: string, o: Record<string, unknown> = {}) =>
  registro(id, {
    titulo,
    ano_de_producao: ano,
    nome_da_pasta: nomeDaPasta,
    projeto_win: `P:\\FILMES\\${nomeDaPasta}`,
    projeto_mac: `/Volumes/P/FILMES/${nomeDaPasta}`,
    output_win: `O:\\OUTPUT\\${nomeDaPasta}`,
    output_mac: `/Volumes/O/OUTPUT/${nomeDaPasta}`,
    poster: null,
    ...o,
  });

const filmes = () => [
  filme('recFilmeA', 'Viagem ao Farol', 2021, 'VIAGEM AO FAROL', { poster: [{ name: 'farol.jpg', token: 'x' }] }),
  filme('recFilmeB', 'Corrida no Gelo', 2019, 'CORRIDA NO GELO (2019)'),
  filme('recFilmeC', 'Fora da Janela', 2020, 'FORA DA JANELA'),
];
const exibicoes = () => [
  // A: três exibições, uma com card ligado a uma Produção, uma às 22h30 e uma cancelada
  exibicao('recExA1', 'recFilmeA', 10, { sessao: { id: 'recS3', title: 'Corujão' } }, '22:30'),
  exibicao('recExA2', 'recFilmeA', 3, { inedito: true, card_ID: 'cardFalsoA', link: 'https://trello.com/c/cardFalsoA', sessao: { id: 'recS2', title: 'Tela Quente' } }),
  exibicao('recExA3', 'recFilmeA', 5, { labels: ['CANCELADO'] }),
  // B: ontem (fica: a agenda vai de 2 dias atrás a 45 à frente) e amanhã, com o card só no link
  exibicao('recExB1', 'recFilmeB', -1),
  exibicao('recExB2', 'recFilmeB', 1, { link: 'https://trello.com/c/cardFalsoB/12-corrida' }),
  // C: fora da janela
  exibicao('recExC1', 'recFilmeC', -3),
  exibicao('recExC2', 'recFilmeC', 46),
];

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function preparado(env: Record<string, string> = ENV) {
  const db = abrirBanco(':memory:');
  const registros = { ARTE_producao: [], exibicoes: exibicoes(), designers: [], filmes: filmes() };
  const teable = teableFalso(NOMES, { registros });
  const pedidosAoTrello: string[] = [];
  const buscarNoTrello = async (endereco: string) => {
    pedidosAoTrello.push(endereco);
    return Response.json({});
  };
  const app = criarApp({ db, env, buscarNoTeable: teable, abrirPg: teable.abrirPg, trello: (e: unknown, deps: Record<string, unknown>) => criarTrello(e, { ...deps, buscar: buscarNoTrello }) });
  await app.releituraPronta;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const ler = async (headers: Record<string, string> = { 'cf-access-authenticated-user-email': ANA }) => {
    const r = await fetch(`${base}/api/filmes/agenda`, { headers });
    return { status: r.status, corpo: (await r.json()) as { hoje?: string; filmes?: Filme[]; erro?: string } };
  };
  type Banco = { prepare: (s: string) => { run: (...a: unknown[]) => void } };
  const producao = (id: string, card: string, etapa: string, designers: string[]) =>
    (db as Banco)
      .prepare(`INSERT INTO producoes (id, claquete, etapa, designers, card_id, entrada_em, arquivada, criada_em, atualizada_em) VALUES (?, 'X', ?, ?, ?, ?, 0, ?, ?)`)
      .run(id, etapa, JSON.stringify(designers), card, '2026-11-26T14:03:00.000Z', '2026-11-26T14:03:00.000Z', '2026-11-26T14:03:00.000Z');
  const preferir = (valor: unknown) =>
    fetch(`${base}/api/eu/preferencias`, { method: 'PUT', headers: { 'cf-access-authenticated-user-email': ANA, 'content-type': 'application/json' }, body: JSON.stringify({ 'filmes.agenda': valor }) });
  const eu = async () => ((await (await fetch(`${base}/api/eu`, { headers: { 'cf-access-authenticated-user-email': ANA } })).json()) as { preferencias?: Record<string, unknown> }).preferencias ?? {};
  return { db, teable, pedidosAoTrello, ler, producao, preferir, eu };
}

type Exibicao = { id: string; dia: string; hora: string | null; sessao: string; inedito: boolean; trello: string | null; producao: { id: string; etapa: string; designers: string[] } | null };
type Filme = { id: string; titulo: string; ano: number | null; pasta: string; projeto: { win: string; mac: string }; output: { win: string; mac: string }; poster: string | null; exibicoes: Exibicao[] };

describe('a agenda de filmes da aba Filmes (#169)', () => {
  it('cada filme com todas as exibições da janela (sem as canceladas), a hora quando não é meia-noite e o pôster com login', async () => {
    const { ler, pedidosAoTrello } = await preparado();
    const { status, corpo } = await ler();
    expect(status).toBe(200);
    expect(corpo.hoje).toBe(dia(0));
    // o filme da exibição mais perto de hoje primeiro (de hoje em diante), sem o que está fora da janela
    expect(corpo.filmes!.map((f) => f.titulo)).toEqual(['Corrida no Gelo', 'Viagem ao Farol']);
    const farol = corpo.filmes![1];
    expect(farol).toMatchObject({
      id: 'recFilmeA',
      ano: 2021,
      pasta: 'VIAGEM AO FAROL (2021)',
      projeto: { win: 'P:\\FILMES\\VIAGEM AO FAROL (2021)', mac: '/Volumes/P/FILMES/VIAGEM AO FAROL (2021)' },
      output: { win: 'O:\\OUTPUT\\VIAGEM AO FAROL (2021)' },
      // o caminho do pôster com login (o mesmo da prévia): o do Teable, guardado pelo PROMeiro
      poster: '/api/filmes/poster/recFilmeA',
    });
    expect(farol.exibicoes).toEqual([
      { id: 'recExA2', dia: dia(3), hora: null, sessao: 'Tela Quente', inedito: true, trello: 'https://trello.com/c/cardFalsoA', producao: null },
      { id: 'recExA1', dia: dia(10), hora: '22:30', sessao: 'Corujão', inedito: false, trello: null, producao: null },
    ]);
    // as duas exibições do Corrida no Gelo, a de ontem também; sem pôster nenhum
    const gelo = corpo.filmes![0];
    expect(gelo.poster).toBeNull();
    expect(gelo.exibicoes.map((e) => [e.id, e.dia])).toEqual([
      ['recExB1', dia(-1)],
      ['recExB2', dia(1)],
    ]);
    // nada é lido do Trello
    expect(pedidosAoTrello).toEqual([]);
  });

  it('a Produção ligada pelo card da exibição (o card_ID ou o do link), com a etapa e os designers', async () => {
    const { ler, producao } = await preparado();
    producao('prod-farol', 'cardFalsoA', 'produzindo', ['Tânia Arruda']);
    producao('prod-gelo', 'cardFalsoB', 'entregue', []);
    const lista = (await ler()).corpo.filmes!;
    const de = (titulo: string) => lista.find((f) => f.titulo === titulo)!;
    expect(de('Viagem ao Farol').exibicoes[0].producao).toEqual({ id: 'prod-farol', etapa: 'produzindo', designers: ['Tânia Arruda'] });
    expect(de('Viagem ao Farol').exibicoes[1].producao).toBeNull();
    expect(de('Corrida no Gelo').exibicoes[1]).toMatchObject({ trello: 'https://trello.com/c/cardFalsoB/12-corrida', producao: { id: 'prod-gelo', etapa: 'entregue' } });
  });

  it('o pôster guardado pelo PROMeiro também vale', async () => {
    const { db, ler } = await preparado();
    (db as { prepare: (s: string) => { run: (...a: unknown[]) => void } })
      .prepare("INSERT INTO anexos (id, tipo, chave, nome, mime, dados, origem, em, conferido_em) VALUES ('poster-b', 'poster', 'recFilmeB', 'recFilmeB.jpg', 'image/jpeg', ?, 'previa', ?, ?)")
      .run(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), new Date().toISOString(), new Date().toISOString());
    const lista = (await ler()).corpo.filmes!;
    expect(lista.find((f) => f.titulo === 'Corrida no Gelo')!.poster).toBe('/api/filmes/poster/recFilmeB');
  });

  it('sem login, 401; com o Postgres do Teable fora, 503', async () => {
    const { ler, teable } = await preparado();
    expect((await ler({})).status).toBe(401);
    teable.estado.fora = true;
    const r = await ler();
    expect(r.status).toBe(503);
    expect(r.corpo.erro).toBeTruthy();
  });

  it('sem as tabelas exibicoes e filmes no Teable, 503 com o motivo', async () => {
    const { ler } = await preparado({ ...ENV, TEABLE_PG_URL: '' });
    const r = await ler();
    expect(r.status).toBe(503);
    expect(r.corpo.erro).toMatch(/exibicoes/);
  });

  it('a forma de ver fica lembrada por pessoa: por data ou por sessão; outra, 400', async () => {
    const { preferir, eu } = await preparado();
    expect((await preferir('sessao')).status).toBe(200);
    expect((await eu())['filmes.agenda']).toBe('sessao');
    expect((await preferir('quadro')).status).toBe(400);
    expect((await eu())['filmes.agenda']).toBe('sessao');
  });
});
