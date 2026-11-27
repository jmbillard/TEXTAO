// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';

/* Os filmes recentes do Padeiro (#142): com a chave do Padeiro, o Padeiro lê do PROMeiro os filmes com exibição perto
   de hoje, no mesmo formato do fluxo "filmes-recentes" do n8n (o PROMO: FILMES PARA O PADEIRO), com o pôster servido
   pelo próprio PROMeiro (o endereço público do pôster, #90). O Teable e o Trello são de mentira; títulos, pastas,
   usuários, computadores e e-mails inventados. */

const CHEFE = 'chefe@empresa.com';
const PROMEIRO = 'https://promeiro.exemplo.com';
const TOKEN_DO_POSTER = 'token-do-poster-falso';
const ENV = {
  CADASTRO_ADMINS: CHEFE,
  ...TEABLE_FALSO,
  TEABLE_PG_URL: 'postgres://falso',
  TEABLE_PG_ESQUEMA: 'bseFalso',
  TRELLO_KEY: 'chave-falsa',
  TRELLO_TOKEN: 'token-falso-do-trello',
  PROMEIRO_URL: PROMEIRO,
  POSTER_PUBLICO_TOKEN: TOKEN_DO_POSTER,
};
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg', filmes: 'filmes_pg' };
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });

/** O dia de Brasília daqui a `n` dias (AAAA-MM-DD). */
const dia = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + n * 86_400_000));
/** A exibição como o PROMeiro grava: a meia-noite de Brasília. */
const exibicao = (id: string, filme: string, n: number, o: Record<string, unknown> = {}) =>
  registro(id, { filme: { id: filme, title: filme }, data_de_exibicao: `${dia(n)}T03:00:00.000Z`, sessao: { id: 'recSessao', title: 'Sessão da Noite' }, inedito: false, link: '', labels: null, ...o });

const PASTA = 'P:\\FILMES\\TITULOS';
const MAC = '/Volumes/P/FILMES/TITULOS';
const filme = (id: string, titulo: string, ano: number | null, nomeDaPasta: string, o: Record<string, unknown> = {}) =>
  registro(id, {
    titulo,
    ano_de_producao: ano,
    nome_da_pasta: nomeDaPasta,
    projeto_win: `${PASTA}\\${nomeDaPasta}`,
    projeto_mac: `${MAC}/${nomeDaPasta}`,
    output_win: `O:\\OUTPUT\\${nomeDaPasta}`,
    output_mac: `/Volumes/O/OUTPUT/${nomeDaPasta}`,
    poster: null,
    ...o,
  });

const filmes = () => [
  // a pasta do cadastro sem o ano: a resposta leva "TÍTULO (ANO)" no lugar do último nível dos caminhos
  filme('recFilmeA', 'Viagem ao Farol', 2021, 'VIAGEM AO FAROL', { poster: [{ name: 'farol.jpg', token: 'x' }] }),
  filme('recFilmeB', 'Corrida no Gelo', 2019, 'CORRIDA NO GELO (2019)'),
  filme('recFilmeC', 'Noite Antiga', null, 'NOITE ANTIGA'),
  filme('recFilmeD', 'Fora da Janela', 2020, 'FORA DA JANELA'),
  filme('recFilmeE', 'Só Cancelado', 2018, 'SO CANCELADO'),
];
const exibicoes = () => [
  // A: duas exibições à frente e uma que já passou: vale a próxima (a de daqui a 3 dias), inédita e com card
  exibicao('recExA1', 'recFilmeA', 10),
  exibicao('recExA2', 'recFilmeA', 3, { inedito: true, link: 'https://trello.com/c/cardFalsoA', sessao: { id: 'recS2', title: 'Tela Quente' } }),
  exibicao('recExA3', 'recFilmeA', -1),
  // B: amanhã
  exibicao('recExB1', 'recFilmeB', 1),
  // C: só exibições que já passaram (dentro dos 2 dias): vale a mais recente, depois dos próximos
  exibicao('recExC1', 'recFilmeC', -2),
  exibicao('recExC2', 'recFilmeC', -1),
  // D: fora da janela (3 dias atrás e 46 à frente)
  exibicao('recExD1', 'recFilmeD', -3),
  exibicao('recExD2', 'recFilmeD', 46),
  // E: só a cancelada
  exibicao('recExE1', 'recFilmeE', 2, { labels: ['CANCELADO'] }),
];

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function preparado(env: Record<string, string> = ENV) {
  const db = abrirBanco(':memory:');
  const registros = { ARTE_producao: [], exibicoes: exibicoes(), designers: [registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana.souza@empresa.com', designer_ID: 'membroAna', status: 'ativo' })], filmes: filmes() };
  const teable = teableFalso(NOMES, { registros });
  const pedidosAoTrello: string[] = [];
  const buscarNoTrello = async (endereco: string) => {
    pedidosAoTrello.push(endereco);
    return Response.json({});
  };
  const app = criarApp({ db, env, buscarNoTeable: teable, abrirPg: teable.abrirPg, trello: (e: unknown, deps: Record<string, unknown>) => criarTrello(e, { ...deps, buscar: buscarNoTrello }) });
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
  const ler = async (chave?: string, init: RequestInit = {}) => {
    const r = await padeiro('/api/padeiro/filmes', { chave, ...init });
    return { status: r.status, cache: r.headers.get('cache-control'), corpo: (await r.json()) as { atualizado_em?: string; filmes?: Filme[]; erro?: string; estado?: string } };
  };
  return { db, base, teable, pedidosAoTrello, padeiro, cadastrar, ligar, revogar, ler };
}

type Filme = {
  exibicao_id: string;
  filme_id: string;
  titulo: string;
  ano: number | null;
  pasta: string;
  projeto: { win: string; mac: string };
  output: { win: string; mac: string };
  exibicao: string;
  sessao: string;
  inedito: boolean;
  trello: string | null;
  poster: string | null;
};

describe('o Padeiro: os filmes recentes vêm do PROMeiro (#142)', () => {
  it('com a chave ligada, devolve os filmes no formato do filmes-recentes do n8n', async () => {
    const { cadastrar, ligar, ler, pedidosAoTrello } = await preparado();
    const p = await cadastrar();
    expect((await ligar(p.id)).status).toBe(200);
    const { status, cache, corpo } = await ler(p.chave);
    expect(status).toBe(200);
    // como o n8n: nada fica guardado no caminho
    expect(cache).toBe('no-store');
    // a hora de Brasília, sem os milissegundos (o `atualizado_em` do n8n)
    expect(corpo.atualizado_em).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
    expect(Math.abs(Date.parse(corpo.atualizado_em!) - Date.now())).toBeLessThan(60_000);
    expect(corpo.filmes![0]).toEqual({
      exibicao_id: 'recExB1',
      filme_id: 'recFilmeB',
      titulo: 'Corrida no Gelo',
      ano: 2019,
      pasta: 'CORRIDA NO GELO (2019)',
      projeto: { win: `${PASTA}\\CORRIDA NO GELO (2019)`, mac: `${MAC}/CORRIDA NO GELO (2019)` },
      output: { win: 'O:\\OUTPUT\\CORRIDA NO GELO (2019)', mac: '/Volumes/O/OUTPUT/CORRIDA NO GELO (2019)' },
      exibicao: dia(1),
      sessao: 'Sessão da Noite',
      inedito: false,
      trello: null,
      poster: null,
    });
    // nada é lido do Trello
    expect(pedidosAoTrello).toEqual([]);
  });

  it('um filme por linha, a próxima exibição; os próximos primeiro, depois os dos últimos 2 dias; sem as canceladas e fora da janela', async () => {
    const { cadastrar, ligar, ler } = await preparado();
    const p = await cadastrar();
    await ligar(p.id);
    const lista = (await ler(p.chave)).corpo.filmes!;
    expect(lista.map((f) => [f.titulo, f.exibicao_id, f.exibicao])).toEqual([
      ['Corrida no Gelo', 'recExB1', dia(1)],
      ['Viagem ao Farol', 'recExA2', dia(3)],
      ['Noite Antiga', 'recExC2', dia(-1)],
    ]);
    const farol = lista[1];
    // a pasta "TÍTULO (ANO)" no lugar do último nível dos caminhos do cadastro; a sessão, o inédito e o card da exibição
    expect(farol).toMatchObject({ ano: 2021, pasta: 'VIAGEM AO FAROL (2021)', projeto: { win: `${PASTA}\\VIAGEM AO FAROL (2021)` }, sessao: 'Tela Quente', inedito: true, trello: 'https://trello.com/c/cardFalsoA' });
    // sem o ano, a pasta fica só com o nome
    expect(lista[2]).toMatchObject({ ano: null, pasta: 'NOITE ANTIGA', projeto: { mac: `${MAC}/NOITE ANTIGA` } });
  });

  it('o pôster é o endereço público do PROMeiro, que serve a imagem sem login', async () => {
    const { db, base, cadastrar, ligar, ler } = await preparado();
    const p = await cadastrar();
    await ligar(p.id);
    // a cópia do pôster guardada pelo PROMeiro (a da prévia), para o Corrida no Gelo, que não tem no Teable
    db.prepare("INSERT INTO anexos (id, tipo, chave, nome, mime, dados, origem, em, conferido_em) VALUES ('poster-b', 'poster', 'recFilmeB', 'recFilmeB.jpg', 'image/jpeg', ?, 'previa', ?, ?)").run(
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      new Date().toISOString(),
      new Date().toISOString(),
    );
    const lista = (await ler(p.chave)).corpo.filmes!;
    const de = (titulo: string) => lista.find((f) => f.titulo === titulo)!;
    // o do Teable (o campo poster) e o guardado pelo PROMeiro
    expect(de('Viagem ao Farol').poster).toBe(`${PROMEIRO}/api/publico/poster/recFilmeA?t=${TOKEN_DO_POSTER}`);
    expect(de('Corrida no Gelo').poster).toBe(`${PROMEIRO}/api/publico/poster/recFilmeB?t=${TOKEN_DO_POSTER}`);
    // sem pôster nenhum
    expect(de('Noite Antiga').poster).toBeNull();
    // o endereço serve a imagem, sem login (o mesmo caminho no PROMeiro de teste)
    const r = await fetch(base + new URL(de('Corrida no Gelo').poster!).pathname + new URL(de('Corrida no Gelo').poster!).search);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/jpeg');
  });

  it('sem o POSTER_PUBLICO_TOKEN ou sem o PROMEIRO_URL, os filmes vêm sem pôster', async () => {
    for (const falta of ['POSTER_PUBLICO_TOKEN', 'PROMEIRO_URL'] as const) {
      const { [falta]: _, ...env } = ENV;
      const { cadastrar, ligar, ler } = await preparado(env);
      const p = await cadastrar();
      await ligar(p.id);
      const lista = (await ler(p.chave)).corpo.filmes!;
      expect(lista.find((f) => f.titulo === 'Viagem ao Farol')!.poster).toBeNull();
      await parar?.();
      parar = null;
    }
  });

  it('a chave pendente também lê (o n8n dava a lista sem chave nenhuma); a revogada e a desconhecida, não', async () => {
    const { cadastrar, revogar, ler } = await preparado();
    const p = await cadastrar();
    const pendente = await ler(p.chave);
    expect(pendente.status).toBe(200);
    expect(pendente.corpo.filmes!.length).toBe(3);
    expect((await revogar(p.id)).status).toBe(200);
    expect(await ler(p.chave)).toMatchObject({ status: 403, corpo: { estado: 'revogada' } });
    expect((await ler('chave-que-nao-existe')).status).toBe(401);
    expect((await ler()).status).toBe(401);
  });

  it('o login do Access não abre o caminho: sem a chave, 401', async () => {
    const { ler } = await preparado();
    expect((await ler(undefined, { headers: { 'cf-access-authenticated-user-email': CHEFE } })).status).toBe(401);
  });

  it('com o Teable fora do ar, 503 (o Padeiro volta ao n8n)', async () => {
    const { cadastrar, ligar, ler, teable } = await preparado();
    const p = await cadastrar();
    await ligar(p.id);
    teable.estado.fora = true;
    const r = await ler(p.chave);
    expect(r.status).toBe(503);
    expect(r.corpo.erro).toBeTruthy();
  });
});
