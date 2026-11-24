// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarFilmes } from '../servidor/filmes.mjs';

/* A aba Filmes pela API do servidor: a leitura por IA do n8n é falsa; o resto é o de verdade (banco em memória,
   imagens numa pasta temporária). O endereço do n8n é inventado: o de verdade fica só nas variáveis do servidor. */
const ENV = { ACESSO: 'privado', N8N_FILMES_LER: 'http://n8n:5678/webhook/ler-pagina', FILMES_INTERVALO_MS: '0' };
const b64 = (s: string) => Buffer.from(s).toString('base64');
const caixa = (x: number, y: number) => ({ x, y, width: 100, height: 150 });

type Leitura = { campos: Record<string, string>; arquivos: Record<string, string> };
/** O n8n falso: guarda o que recebeu e responde com os filmes de cada página (ou falha quando pedido). */
function n8nFalso(respostas: Record<number, unknown | ((n: number) => unknown)>) {
  const leituras: Leitura[] = [];
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    expect(endereco).toBe(ENV.N8N_FILMES_LER);
    const form = init.body as FormData;
    const campos: Record<string, string> = {};
    const arquivos: Record<string, string> = {};
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') campos[k] = v;
      else arquivos[k] = `${(v as File).name}:${await (v as File).text()}`;
    }
    leituras.push({ campos, arquivos });
    const n = Number(campos.original_page_number);
    const r = typeof respostas[n] === 'function' ? (respostas[n] as (n: number) => unknown)(leituras.length) : respostas[n];
    if (r instanceof Error) return { ok: false, status: 500, text: async () => r.message, json: async () => ({}) };
    return { ok: true, status: 200, text: async () => JSON.stringify(r), json: async () => r };
  };
  return { buscar, leituras };
}

type Consultar = (sql: string, params?: unknown[]) => Promise<unknown[]>;
let servidores: Server[] = [];
afterEach(() => {
  for (const s of servidores) s.close();
  servidores = [];
});
async function subir({ db = abrirBanco(':memory:'), env = ENV, n8n = n8nFalso({}), pasta = mkdtempSync(join(tmpdir(), 'previas-')), consultar = undefined as Consultar | undefined } = {}) {
  const filmes = criarFilmes(env, { db, pasta, buscar: n8n.buscar, consultar });
  const app = criarApp({ db, env, filmes });
  const servidor = createServer(app);
  servidores.push(servidor);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const api = (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana.lima@empresa.com', 'content-type': 'application/json', ...init.headers } });
  return { api, filmes, db, pasta, n8n };
}
const criar = (api: Awaited<ReturnType<typeof subir>>['api'], corpo: object) => api('/api/filmes/previas', { method: 'POST', body: JSON.stringify(corpo) }).then((r) => r.json());
const pagina = (titulos: string[]) => ({
  pdf: b64('%PDF-pagina'),
  imagem: b64('jpg-pagina'),
  tamanho: { width: 1000, height: 600 },
  posteres: titulos.map((_, i) => ({ dados: b64(`jpg-poster-${i + 1}`), caixa: caixa(100 + i * 150, 100) })),
  textos: titulos.map((t, i) => ({ str: t, x: 100 + i * 150, top: 260, width: 100, height: 12 })),
  vagas: [],
});
/** Espera a fila de leitura chegar a um estado (ela roda sozinha, uma página por vez). */
async function ate(api: Awaited<ReturnType<typeof subir>>['api'], id: string, ok: (p: { paginas: { estado: string }[] }) => boolean) {
  for (let i = 0; i < 100; i++) {
    const p = await (await api(`/api/filmes/previas/${id}`)).json();
    if (ok(p)) return p;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('a fila não chegou lá');
}

describe('aba Filmes: subir a prévia', () => {
  it('cria a prévia com as páginas úteis; o mesmo PDF de novo abre a que já existe', async () => {
    const { api } = await subir();
    const nova = await criar(api, { nome: 'PREVIA_DEZEMBRO_2026.pdf', hash: 'abc123', paginas: [2, 3, 4] });
    expect(nova.existente).toBe(false);
    const de_novo = await criar(api, { nome: 'outro-nome.pdf', hash: 'abc123', paginas: [2, 3, 4] });
    expect(de_novo).toEqual({ id: nova.id, existente: true });

    const lista = await (await api('/api/filmes/previas')).json();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: nova.id, nome: 'PREVIA_DEZEMBRO_2026.pdf', por: 'Ana Lima', paginas: 3 });
    const previa = await (await api(`/api/filmes/previas/${nova.id}`)).json();
    expect(previa.paginas.map((p: { numero: number; util: number; estado: string }) => [p.numero, p.util, p.estado])).toEqual([
      [2, 1, 'esperando'],
      [3, 2, 'esperando'],
      [4, 3, 'esperando'],
    ]);
  });
});

describe('aba Filmes: a leitura das páginas', () => {
  it('a página que chega entra na fila e vai para a IA com os mesmos campos do FilmeBOT; os filmes voltam ligados aos pôsteres', async () => {
    const n8n = n8nFalso({
      2: {
        status: 'ok',
        sessoes: ['SUPERCINE', 'SESSÃO DA TARDE'],
        // a IA devolve fora da ordem dos pôsteres: cada filme vai para o pôster com o título dele embaixo
        movies: [
          { titulo: 'CIDADE PERDIDA', ano_de_producao: 2022, sessao: 'SESSÃO DA TARDE', data: '06/12/2026', inedito: false },
          { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: '2017', sessao: 'SUPERCINE', data: '05/12/2026', inedito: true },
        ],
      },
    });
    const { api } = await subir({ n8n });
    const { id } = await criar(api, { nome: 'PREVIA_DEZEMBRO_2026.pdf', hash: 'dez2026', paginas: [2] });
    const r = await api(`/api/filmes/previas/${id}/paginas/2`, { method: 'PUT', body: JSON.stringify(pagina(['DESPEDIDA EM GRANDE ESTILO (2017)', 'CIDADE PERDIDA (2022)'])) });
    expect(r.status).toBe(200);

    const lida = await ate(api, id, (p) => p.paginas[0].estado === 'lida');
    expect(n8n.leituras).toHaveLength(1);
    const { campos, arquivos } = n8n.leituras[0];
    expect(campos).toMatchObject({ original_file_name: 'PREVIA_DEZEMBRO_2026.pdf', original_page_number: '2', useful_page_number: '1', total_useful_pages: '1', poster_count: '2' });
    expect(campos.document_id).toBe(id);
    expect(campos.request_id).toBeTruthy();
    expect(JSON.parse(campos.poster_boxes)).toEqual([caixa(100, 100), caixa(250, 100)]);
    expect(arquivos).toEqual({
      page: 'PREVIA_DEZEMBRO_2026_pagina_2.pdf:%PDF-pagina',
      page_image: 'PREVIA_DEZEMBRO_2026_pagina_2.jpg:jpg-pagina',
      poster_1: 'PREVIA_DEZEMBRO_2026_pagina_2_poster_01.jpg:jpg-poster-1',
      poster_2: 'PREVIA_DEZEMBRO_2026_pagina_2_poster_02.jpg:jpg-poster-2',
    });

    const pag = lida.paginas[0];
    expect(pag.filmes).toEqual([
      { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano: 2017, sessao: 'SUPERCINE', data: '05/12/2026', inedito: true, poster: 0 },
      { titulo: 'CIDADE PERDIDA', ano: 2022, sessao: 'SESSÃO DA TARDE', data: '06/12/2026', inedito: false, poster: 1 },
    ]);
    expect(pag.posteres).toEqual([{ caixa: caixa(100, 100) }, { caixa: caixa(250, 100) }]);
    expect(pag.tamanho).toEqual({ width: 1000, height: 600 });
    // as imagens ficam no servidor, para qualquer pessoa abrir depois
    expect(await (await api(`/api/filmes/previas/${id}/paginas/2/imagem`)).text()).toBe('jpg-pagina');
    expect(await (await api(`/api/filmes/previas/${id}/paginas/2/poster/2`)).text()).toBe('jpg-poster-2');
  });
});

describe('aba Filmes: quando a leitura falha ou o servidor reinicia', () => {
  it('as páginas vão uma por vez; a que deu erro guarda o motivo e pode ser lida de novo', async () => {
    let falhar = true;
    const n8n = n8nFalso({
      2: { movies: [{ titulo: 'RIVAIS', ano_de_producao: 2024, sessao: 'TELA QUENTE', data: '05/12/2026' }] },
      3: () => (falhar ? new Error('timeout do modelo') : { movies: [{ titulo: 'TÁ ESCRITO', ano_de_producao: 2023, sessao: 'SUPERCINE', data: '12/12/2026' }] }),
    });
    const { api } = await subir({ n8n });
    const { id } = await criar(api, { nome: 'PREVIA.pdf', hash: 'falha01', paginas: [2, 3] });
    await api(`/api/filmes/previas/${id}/paginas/2`, { method: 'PUT', body: JSON.stringify(pagina(['RIVAIS'])) });
    await api(`/api/filmes/previas/${id}/paginas/3`, { method: 'PUT', body: JSON.stringify(pagina(['TÁ ESCRITO'])) });

    const p = await ate(api, id, (p) => p.paginas.every((g) => g.estado === 'lida' || g.estado === 'erro'));
    expect(p.paginas.map((g: { estado: string }) => g.estado)).toEqual(['lida', 'erro']);
    expect(p.paginas[1].erro).toMatch(/500.*timeout do modelo/);
    expect(n8n.leituras.map((l) => l.campos.original_page_number)).toEqual(['2', '3']);

    falhar = false;
    expect((await api(`/api/filmes/previas/${id}/paginas/3/reler`, { method: 'POST' })).status).toBe(200);
    const de_novo = await ate(api, id, (p) => p.paginas[1].estado === 'lida');
    expect(de_novo.paginas[1]).toMatchObject({ erro: '', filmes: [{ titulo: 'TÁ ESCRITO', ano: 2023, poster: 0 }] });
  });

  it('a página que estava sendo lida quando o servidor caiu volta para a fila e é lida', async () => {
    const db = abrirBanco(':memory:');
    const pasta = mkdtempSync(join(tmpdir(), 'previas-'));
    // o primeiro servidor manda a página e "cai" no meio da leitura (a IA nunca responde)
    const travado = { buscar: () => new Promise(() => {}), leituras: [] };
    const primeiro = await subir({ db, pasta, n8n: travado as unknown as ReturnType<typeof n8nFalso> });
    const { id } = await criar(primeiro.api, { nome: 'PREVIA.pdf', hash: 'reinicio', paginas: [2] });
    await primeiro.api(`/api/filmes/previas/${id}/paginas/2`, { method: 'PUT', body: JSON.stringify(pagina(['RIVAIS'])) });
    await ate(primeiro.api, id, (p) => p.paginas[0].estado === 'lendo');
    primeiro.filmes.parar();

    const n8n = n8nFalso({ 2: { movies: [{ titulo: 'RIVAIS', ano_de_producao: 2024 }] } });
    const segundo = await subir({ db, pasta, n8n });
    const p = await ate(segundo.api, id, (p) => p.paginas[0].estado === 'lida');
    expect(p.paginas[0].filmes[0]).toMatchObject({ titulo: 'RIVAIS', poster: 0 });
    expect(n8n.leituras).toHaveLength(1);
  });

  it('sem o endereço da leitura, a aba fica desligada e diz o que falta', async () => {
    const { api } = await subir({ env: { ACESSO: 'privado' } as typeof ENV });
    const r = await api('/api/filmes/previas');
    expect(r.status).toBe(503);
    expect((await r.json()).erro).toMatch(/N8N_FILMES_LER/);
    expect(await (await api('/api/eu')).json()).toMatchObject({ filmes: false });
  });
});

/* ---------- a conferência com o banco ---------- */
/* O Postgres do Teable falso: responde pelo nome da tabela que aparece no SQL (nomes inventados). Devolve as linhas
   como o Teable guarda: vínculos como { id, title } e a data da exibição em UTC (meia-noite de Brasília = 03:00Z). */
const PG = { TEABLE_PG_URL: 'postgres://teste', TEABLE_PG_ESQUEMA: 'bse_teste', TEABLE_PG_FILMES: 'filmes_teste', TEABLE_PG_EXIBICOES: 'exibicoes_teste', TEABLE_PG_ACERVO: 'acervo_teste' };
type FilmeDoBanco = { __id: string; titulo: string; ano_de_producao: number | null };
type ExibicaoDoBanco = { filme: { id: string; title: string }; sessao: { id: string; title: string }; data_de_exibicao: string; card_ID: string; link: string; labels: string[] | null };
type ArteDoAcervo = { arte: string; filme: { id: string; title: string } };
function postgresFalso(banco: { filmes?: FilmeDoBanco[]; exibicoes?: ExibicaoDoBanco[]; acervo?: ArteDoAcervo[] }) {
  const consultas: string[] = [];
  const consultar: Consultar = async (sql) => {
    consultas.push(sql);
    if (sql.includes('"filmes_teste"')) return banco.filmes ?? [];
    if (sql.includes('"exibicoes_teste"')) return banco.exibicoes ?? [];
    if (sql.includes('"acervo_teste"')) return banco.acervo ?? [];
    throw new Error(`tabela inesperada: ${sql}`);
  };
  return { consultar, consultas };
}
const filmeDoBanco = (__id: string, titulo: string, ano_de_producao: number | null): FilmeDoBanco => ({ __id, titulo, ano_de_producao });
type Lido = { titulo: string; ano_de_producao?: number | string | null; sessao?: string; data?: string; inedito?: boolean };
/** Sobe uma prévia de uma página com estes filmes lidos e espera a leitura; devolve a API e a prévia aberta. */
async function conferir(lidos: Lido[], banco: Parameters<typeof postgresFalso>[0] = {}) {
  const pg = postgresFalso(banco);
  const movies = lidos.map((l) => ({ sessao: 'SUPERCINE', data: '05/12/2026', inedito: false, ano_de_producao: null, ...l }));
  const { api } = await subir({ env: { ...ENV, ...PG }, n8n: n8nFalso({ 2: { movies } }), consultar: pg.consultar });
  const { id } = await criar(api, { nome: 'PREVIA.pdf', hash: `conf${Math.random().toString(36).slice(2, 10)}`, paginas: [2] });
  await api(`/api/filmes/previas/${id}/paginas/2`, { method: 'PUT', body: JSON.stringify(pagina(lidos.map((l) => l.titulo))) });
  await ate(api, id, (p) => p.paginas[0].estado === 'lida');
  const abrir = async () => (await (await api(`/api/filmes/previas/${id}`)).json()).paginas[0].filmes;
  const mudar = (i: number, corpo: object) => api(`/api/filmes/previas/${id}/paginas/2/filmes/${i}`, { method: 'PATCH', body: JSON.stringify(corpo) });
  return { api, id, abrir, mudar, pg };
}

describe('aba Filmes: a conferência com o banco', () => {
  it('um filme do banco com a mesma chave sem artigos e ano compatível: é ele, pronto', async () => {
    const { abrir } = await conferir([{ titulo: 'KONG: ILHA DA CAVEIRA', ano_de_producao: 2017 }], {
      filmes: [filmeDoBanco('recKong01', 'Kong - A Ilha da Caveira', 2017), filmeDoBanco('recOutro1', 'Rei Leão', 2019)],
    });
    const [f] = await abrir();
    expect(f.conferencia).toMatchObject({ marca: 'ok', filme: { id: 'recKong01', titulo: 'Kong - A Ilha da Caveira', ano: 2017 }, novo: false, ano: 2017 });
    expect(f.conferencia.pergunta).toBeUndefined();
  });

  it('o inédito sem filme compatível no banco é filme novo, sem pergunta, mesmo com o mesmo título em outro ano', async () => {
    const { abrir } = await conferir([{ titulo: 'O CORVO', ano_de_producao: 2024, inedito: true }], {
      filmes: [filmeDoBanco('recCorvo94', 'O Corvo', 1994)],
    });
    const [f] = await abrir();
    expect(f.conferencia).toMatchObject({ marca: 'ok', filme: null, novo: true, ano: 2024 });
    expect(f.conferencia.pergunta).toBeUndefined();
  });

  it('mais de um candidato: "qual filme?" com os candidatos; sem ano na prévia, todos os da mesma chave', async () => {
    const banco = { filmes: [filmeDoBanco('recCorvo94', 'O Corvo', 1994), filmeDoBanco('recCorvo24', 'O Corvo', 2024), filmeDoBanco('recCorvoSA', 'Corvo', null)] };
    const semAno = (await (await conferir([{ titulo: 'O CORVO' }], banco)).abrir())[0];
    expect(semAno.conferencia).toMatchObject({ marca: 'atencao', pergunta: 'qual-filme', filme: null, novo: false });
    expect(semAno.conferencia.candidatos).toEqual([
      { id: 'recCorvo94', titulo: 'O Corvo', ano: 1994 },
      { id: 'recCorvo24', titulo: 'O Corvo', ano: 2024 },
      { id: 'recCorvoSA', titulo: 'Corvo', ano: null },
    ]);
    // com o ano, o de 1994 sai; o do banco sem ano continua compatível
    const comAno = (await (await conferir([{ titulo: 'O CORVO', ano_de_producao: 2025 }], banco)).abrir())[0];
    expect(comAno.conferencia.candidatos.map((c: { id: string }) => c.id)).toEqual(['recCorvo24', 'recCorvoSA']);
  });

  it('candidato único com o ano a um de distância: "ano diferente", com os dois anos', async () => {
    const { abrir } = await conferir([{ titulo: 'RIVAIS', ano_de_producao: 2023 }], { filmes: [filmeDoBanco('recRivais1', 'Rivais', 2024)] });
    const [f] = await abrir();
    expect(f.conferencia).toMatchObject({ marca: 'atencao', pergunta: 'ano-diferente', filme: { id: 'recRivais1' }, anos: [2023, 2024] });
  });

  it('já existe card do mesmo filme na mesma sessão e no mesmo dia: a marca é o Trello, com o link', async () => {
    const exibicao = (sessao: string, data: string, labels: string[] | null = null): ExibicaoDoBanco => ({
      filme: { id: 'recRivais1', title: 'Rivais (2024)' },
      sessao: { id: `recSes${sessao.length}xx`, title: sessao },
      data_de_exibicao: data,
      card_ID: 'cardRivais0001',
      link: 'https://trello.com/c/AbCd1234',
      labels,
    });
    const filmes = [filmeDoBanco('recRivais1', 'Rivais', 2024)];
    const lido = { titulo: 'RIVAIS', ano_de_producao: 2024, sessao: 'TELA QUENTE', data: '07/12/2026' };
    const ja = (await (await conferir([lido], { filmes, exibicoes: [exibicao('Tela Quente', '2026-12-07T03:00:00.000Z')] })).abrir())[0];
    expect(ja.conferencia).toMatchObject({ marca: 'trello', link: 'https://trello.com/c/AbCd1234', filme: { id: 'recRivais1' } });
    // outra sessão, outro dia ou a exibição cancelada não contam
    const outras = [exibicao('Supercine', '2026-12-07T03:00:00.000Z'), exibicao('Tela Quente', '2026-12-08T03:00:00.000Z'), exibicao('Tela Quente', '2026-12-07T03:00:00.000Z', ['CANCELADO'])];
    const nao = (await (await conferir([lido], { filmes, exibicoes: outras })).abrir())[0];
    expect(nao.conferencia).toMatchObject({ marca: 'ok' });
    expect(nao.conferencia.link).toBeUndefined();
  });
});

describe('aba Filmes: resolver o que pede atenção', () => {
  it('entre vários candidatos, o que já tem card nesta sessão e neste dia é ele', async () => {
    const { abrir } = await conferir([{ titulo: 'O CORVO', sessao: 'CORUJÃO', data: '06/12/2026' }], {
      filmes: [filmeDoBanco('recCorvo94', 'O Corvo', 1994), filmeDoBanco('recCorvo24', 'O Corvo', 2024)],
      exibicoes: [{ filme: { id: 'recCorvo94', title: 'O Corvo (1994)' }, sessao: { id: 'recSesCoru', title: 'Corujão' }, data_de_exibicao: '2026-12-06T03:00:00.000Z', card_ID: 'cardCorvo001', link: '', labels: [] }],
    });
    const [f] = await abrir();
    expect(f.conferencia).toMatchObject({ marca: 'trello', filme: { id: 'recCorvo94' }, link: 'https://trello.com/c/cardCorvo001' });
  });

  it('escolher um candidato grava e tira o !; "outro filme (novo)" também', async () => {
    const banco = { filmes: [filmeDoBanco('recCorvo94', 'O Corvo', 1994), filmeDoBanco('recCorvo24', 'O Corvo', 2024)] };
    const { abrir, mudar } = await conferir([{ titulo: 'O CORVO' }, { titulo: 'CORVO' }], banco);
    const r = await mudar(0, { filme: 'recCorvo24' });
    expect(r.status).toBe(200);
    expect((await r.json()).filme.conferencia).toMatchObject({ marca: 'ok', filme: { id: 'recCorvo24' }, ano: 2024 });
    await mudar(1, { filme: 'novo' });
    const [a, b] = await abrir();
    expect(a.conferencia).toMatchObject({ marca: 'ok', filme: { id: 'recCorvo24', ano: 2024 }, novo: false });
    expect(b.conferencia).toMatchObject({ marca: 'ok', filme: null, novo: true });
    expect((await mudar(0, { filme: 'qualquer coisa' })).status).toBe(400);
  });

  it('escolher um dos anos grava e tira o !', async () => {
    const { abrir, mudar } = await conferir([{ titulo: 'RIVAIS', ano_de_producao: 2023 }], { filmes: [filmeDoBanco('recRivais1', 'Rivais', 2024)] });
    await mudar(0, { ano: 2023 });
    const [f] = await abrir();
    expect(f.conferencia).toMatchObject({ marca: 'ok', filme: { id: 'recRivais1' }, ano: 2023 });
    expect(f.conferencia.pergunta).toBeUndefined();
  });

  it('corrigir o título grava, e a conferência recomeça com o título corrigido', async () => {
    const { abrir, mudar } = await conferir([{ titulo: 'KONG ILHA DA CAVERA', ano_de_producao: 2017 }], {
      filmes: [filmeDoBanco('recKong01', 'Kong - A Ilha da Caveira', 2017)],
    });
    expect((await abrir())[0].conferencia).toMatchObject({ novo: true });
    const r = await mudar(0, { titulo: '  Kong: A Ilha da Caveira ' });
    expect((await r.json()).filme).toMatchObject({ titulo: 'Kong: A Ilha da Caveira', conferencia: { marca: 'ok', filme: { id: 'recKong01' } } });
    const [f] = await abrir();
    expect(f.titulo).toBe('Kong: A Ilha da Caveira');
    expect(f.conferencia.filme.id).toBe('recKong01');
    expect((await mudar(0, { titulo: '   ' })).status).toBe(400);
  });

  it('as artes que o filme já tem no acervo não contam como novas', async () => {
    const { abrir } = await conferir([{ titulo: 'RIVAIS', ano_de_producao: 2024, sessao: 'TELA QUENTE', data: '07/12/2026' }], {
      filmes: [filmeDoBanco('recRivais1', 'Rivais', 2024)],
      acervo: [
        { arte: 'Rivais', filme: { id: 'recRivais1', title: 'Rivais (2024)' } },
        { arte: 'hoje', filme: { id: 'recRivais1', title: 'Rivais (2024)' } },
        { arte: 'AMANHÃ', filme: { id: 'recOutro01', title: 'Outro (2020)' } },
      ],
    });
    const [f] = await abrir();
    // 07/12/2026 é uma segunda-feira
    expect(f.conferencia.artes).toEqual({
      novas: ['AMANHÃ', 'SEGUNDA', 'PRÓXIMA SEGUNDA', 'TELA QUENTE APRESENTA'],
      existentes: ['RIVAIS', 'HOJE'],
    });
  });

  it('sem a tabela de filmes configurada, os filmes vêm sem conferência', async () => {
    const pg = postgresFalso({});
    const { api } = await subir({ consultar: pg.consultar, n8n: n8nFalso({ 2: { movies: [{ titulo: 'RIVAIS' }] } }) });
    const { id } = await criar(api, { nome: 'PREVIA.pdf', hash: 'semtabela', paginas: [2] });
    await api(`/api/filmes/previas/${id}/paginas/2`, { method: 'PUT', body: JSON.stringify(pagina(['RIVAIS'])) });
    const p = await ate(api, id, (p) => p.paginas[0].estado === 'lida');
    expect((p as unknown as { paginas: { filmes: object[] }[] }).paginas[0].filmes[0]).not.toHaveProperty('conferencia');
    expect(pg.consultas).toEqual([]);
  });
});
