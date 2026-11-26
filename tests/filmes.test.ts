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
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
import referencia from './fixtures/cards-de-filme.json';
import referenciaDaTarde from './fixtures/card-da-sessao-da-tarde.json';
// @ts-expect-error módulo JS sem tipos
import { comTabelas } from '../servidor/tabelas-do-teable.mjs';

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
async function subir({ db = abrirBanco(':memory:'), env = ENV as Record<string, string>, n8n = n8nFalso({}), pasta = mkdtempSync(join(tmpdir(), 'previas-')), consultar = undefined as Consultar | undefined, trello = undefined as unknown, agora = undefined as (() => number) | undefined } = {}) {
  const filmes = criarFilmes(env, { db, pasta, buscar: n8n.buscar, consultar, trello, agora });
  const app = criarApp({ db, env, filmes, ...(trello ? { trello } : {}) });
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
const PG = { TEABLE_PG_URL: 'postgres://teste', TEABLE_PG_ESQUEMA: 'bse_teste', ...comTabelas({ filmes: 'filmes_teste', exibicoes: 'exibicoes_teste', ARTES_acervo: 'acervo_teste' }) };
type FilmeDoBanco = { __id: string; titulo: string; ano_de_producao: number | null; projeto_win?: string; projeto_mac?: string; output_win?: string; output_mac?: string; poster?: { name: string; token: string }[] | null };
type ExibicaoDoBanco = { filme: { id: string; title: string }; sessao: { id: string; title: string }; data_de_exibicao: string; card_ID: string; link: string; labels: string[] | null; exibicao?: string };
type ArteDoAcervo = { arte: string; filme: { id: string; title: string } };
type SessaoDoBanco = { __id: string; atracao: string; acervo: string | null };
function postgresFalso(banco: { filmes?: FilmeDoBanco[]; exibicoes?: ExibicaoDoBanco[]; acervo?: ArteDoAcervo[]; atracoes?: SessaoDoBanco[] }) {
  const consultas: string[] = [];
  // o dia da exibição em Brasília, como o filtro por data das consultas faz no Postgres
  const dia = (e: ExibicaoDoBanco) => new Date(e.data_de_exibicao).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const consultar: Consultar = async (sql, params = []) => {
    consultas.push(sql);
    if (sql.includes('"filmes_teste"')) return banco.filmes ?? [];
    if (sql.includes('"exibicoes_teste"')) {
      const todas = banco.exibicoes ?? [];
      if (sql.includes('BETWEEN')) return todas.filter((e) => dia(e) >= String(params[0]) && dia(e) <= String(params[1]));
      if (sql.includes('ANY($1::date[])')) return todas.filter((e) => (params[0] as string[]).includes(dia(e)));
      return todas;
    }
    if (sql.includes('"acervo_teste"')) return banco.acervo ?? [];
    // as sessões de filme: o acervo do filme, mais a Sessão da Tarde (o filtro que o Postgres faria)
    if (sql.includes('"atracoes_teste"') && sql.includes(`"acervo" = 'do filme'`)) return (banco.atracoes ?? []).filter((a) => a.acervo === 'do filme' || /^sess.o da tarde$/i.test(a.atracao));
    if (sql.includes('"atracoes_teste"')) throw new Error(`consulta inesperada das atrações: ${sql}`);
    throw new Error(`tabela inesperada: ${sql}`);
  };
  return { consultar, consultas };
}
const filmeDoBanco = (__id: string, titulo: string, ano_de_producao: number | null): FilmeDoBanco => ({ __id, titulo, ano_de_producao });
type Lido = { titulo: string; ano_de_producao?: number | string | null; sessao?: string; data?: string; inedito?: boolean };
/** Sobe uma prévia de uma página com estes filmes lidos e espera a leitura; devolve a API e a prévia aberta. */
const comPadroes = (lidos: Lido[]) => lidos.map((l) => ({ sessao: 'SUPERCINE', data: '05/12/2026', inedito: false, ano_de_producao: null, ...l }));
async function conferir(lidos: Lido[], banco: Parameters<typeof postgresFalso>[0] = {}, naPagina = lidos.map((l) => l.titulo)) {
  const pg = postgresFalso(banco);
  // a resposta do n8n falso é lida a cada leitura: trocá-la faz a próxima leitura (o reler) voltar diferente
  const respostas: Record<number, unknown> = { 2: { movies: comPadroes(lidos) } };
  const n8n = n8nFalso(respostas);
  const { api } = await subir({ env: { ...ENV, ...PG }, n8n, consultar: pg.consultar });
  const { id } = await criar(api, { nome: 'PREVIA.pdf', hash: `conf${Math.random().toString(36).slice(2, 10)}`, paginas: [2] });
  await api(`/api/filmes/previas/${id}/paginas/2`, { method: 'PUT', body: JSON.stringify(pagina(naPagina)) });
  await ate(api, id, (p) => p.paginas[0].estado === 'lida');
  const abrir = async () => (await (await api(`/api/filmes/previas/${id}`)).json()).paginas[0].filmes;
  const mudar = (i: number, corpo: object) => api(`/api/filmes/previas/${id}/paginas/2/filmes/${i}`, { method: 'PATCH', body: JSON.stringify(corpo) });
  /** Lê a página de novo, agora com estes filmes na resposta do n8n, e espera a leitura nova. */
  const reler = (novos: Lido[]) => relerComo(api, id, 2, n8n, respostas, novos);
  return { api, id, abrir, mudar, pg, reler };
}
/** O botão "Ler de novo": a resposta do n8n troca para estes filmes, a página vai para a fila, e espera a leitura nova. */
async function relerComo(api: Awaited<ReturnType<typeof subir>>['api'], id: string, n: number, n8n: ReturnType<typeof n8nFalso>, respostas: Record<number, unknown>, novos: Lido[], extra: object = {}) {
  respostas[n] = { ...extra, movies: comPadroes(novos) };
  const antes = n8n.leituras.length;
  const r = await api(`/api/filmes/previas/${id}/paginas/${n}/reler`, { method: 'POST' });
  if (r.status !== 200) return r;
  for (let i = 0; i < 100 && n8n.leituras.length === antes; i++) await new Promise((ok) => setTimeout(ok, 10));
  await ate(api, id, (p) => p.paginas.every((g) => g.estado === 'lida' || g.estado === 'erro'));
  return r;
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

/* ---------- o envio: o card no Trello e o registro no Teable ---------- */
/* Trello e Teable falsos, num fetch só (como no teste do envio de roteiros). Os IDs são inventados, os mesmos do card
   de referência gravado do fluxo CARDS (tests/fixtures/cards-de-filme.json). */
const ENVIO = {
  ...PG,
  tabelas: { ...PG.tabelas, atracoes: { id: '', pg: 'atracoes_teste' } },
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_LISTA: 'listaRoteiros',
  TRELLO_LISTA_FILMES: 'listaFilmes',
  TRELLO_FILMES_ETIQUETAS: 'etqFilme',
  TRELLO_FILMES_PRACA: 'opPracaFilmes',
  TRELLO_CAMPO_PRACA: 'cPraca',
  TRELLO_CAMPO_PRIORIDADE: 'cPrio',
  TRELLO_PRIORIDADE_MEDIA: 'opMedia',
  TRELLO_CAMPO_PROJETO: 'cProjeto',
  TRELLO_CAMPO_OUTPUT: 'cOutput',
  TRELLO_CAMPO_BOT: 'cBot',
  TRELLO_CAMPO_ENTRADA: 'cEntrada',
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_FILMES: 'tblFilmes',
  TEABLE_FILMES_POSTER: 'fldPoster',
  TEABLE_EXIBICOES: 'tblExibicoes',
};
type Pedido = { metodo: string; url: URL; corpo: Record<string, unknown> | null };
type CardNoTrello = { id: string; card: Record<string, unknown>; checklist: { name: string; itens: string[] } | null; campos: Record<string, unknown>; anexos: Record<string, unknown>[] };
const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
/** Trello e Teable falsos: guardam os pedidos e montam os cards criados (com a checklist, os campos e os anexos). */
function trelloETeableFalsos({ falharCard = (_nome: string): boolean => false, jaNoTrello = [] as CardNoTrello[] } = {}) {
  const pedidos: Pedido[] = [];
  // os cards que já estavam no quadro (criados antes, pelo n8n)
  const cards = new Map<string, CardNoTrello>(jaNoTrello.map((c) => [c.id, c]));
  let n = 0;
  let novos = 0;
  const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => JSON.stringify(dados) });
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    let corpo: Record<string, unknown> | null = null;
    if (typeof init.body === 'string') corpo = JSON.parse(init.body);
    else if (init.body instanceof FormData) corpo = Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : (v as File).name]));
    pedidos.push({ metodo, url, corpo });
    if (url.host === 'teable:3000') {
      if (url.pathname === '/api/table/tblFilmes/record' && metodo === 'POST') {
        const f = (corpo!.records as { fields: { titulo: string } }[])[0].fields;
        const c = (referencia.caminhos as Record<string, Record<string, string>>)[sem(f.titulo)] ?? {};
        return ok({ records: [{ id: `recNovo000${++novos}`, fields: { ...f, 'projeto win': c.projeto_win, 'projeto mac': c.projeto_mac, 'output win': c.output_win, 'output mac': c.output_mac } }] });
      }
      if (url.pathname.endsWith('/uploadAttachment')) return ok({ id: url.pathname.split('/')[5], fields: { fldPoster: [{ name: corpo!.file, token: `tokNovo${++n}` }] } });
      return ok({ records: [{ id: `recQualquer${++n}` }] });
    }
    const rota = url.pathname.replace(/^\/1/, '');
    if (rota === '/cards' && metodo === 'POST') {
      if (falharCard(String(corpo!.name))) return { ok: false, status: 401, text: async () => 'invalid token', json: async () => ({}) };
      const id = `card${++n}`;
      cards.set(id, { id, card: corpo!, checklist: null, campos: {}, anexos: [] });
      return ok({ id, shortUrl: `https://trello.com/c/${id.toUpperCase()}` });
    }
    if (rota === '/checklists' && metodo === 'POST') {
      const card = cards.get(url.searchParams.get('idCard')!)!;
      card.checklist = { name: url.searchParams.get('name')!, itens: [] };
      return ok({ id: `chk-${card.id}` });
    }
    const umCard = /^\/cards\/(\w+)$/.exec(rota);
    if (umCard && cards.has(umCard[1])) {
      const card = cards.get(umCard[1])!;
      if (metodo === 'PUT') Object.assign(card.card, corpo);
      return ok({ id: card.id, name: card.card.name, desc: card.card.desc, due: card.card.due, shortUrl: `https://trello.com/c/${card.id.toUpperCase()}` });
    }
    const listas = /^\/cards\/(\w+)\/checklists$/.exec(rota);
    if (listas && metodo === 'GET') {
      const card = cards.get(listas[1])!;
      return ok(card.checklist ? [{ id: `chk-${card.id}`, name: card.checklist.name, checkItems: card.checklist.itens.map((name) => ({ name })) }] : []);
    }
    const item = /^\/checklists\/chk-(\w+)\/checkItems$/.exec(rota);
    if (item) cards.get(item[1])!.checklist!.itens.push(url.searchParams.get('name')!);
    const campo = /^\/cards\/(\w+)\/customField\/(\w+)\/item$/.exec(rota);
    if (campo && metodo === 'PUT') cards.get(campo[1])!.campos[campo[2]] = corpo;
    const anexo = /^\/cards\/(\w+)\/attachments$/.exec(rota);
    if (anexo && metodo === 'POST') cards.get(anexo[1])!.anexos.push(corpo!);
    return ok({ id: `x${++n}` });
  };
  const teable = (tabela: string, metodo = 'POST') => pedidos.filter((p) => p.url.host === 'teable:3000' && p.metodo === metodo && p.url.pathname.includes(`/api/table/${tabela}/record`));
  return { buscar, pedidos, cards: () => [...cards.values()], teable };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
type Envio = { estado: string; card?: string; link?: string; por?: string; em?: string; erro?: string };
type FilmeEnviado = { titulo: string; envio?: Envio; conferencia?: { marca: string; link?: string } };
/** Sobe uma prévia de uma página com estes filmes lidos, com Trello, Teable e Postgres falsos. */
async function paraEnviar(lidos: Lido[], banco: Parameters<typeof postgresFalso>[0], opcoes: Parameters<typeof trelloETeableFalsos>[0] = {}, env: Record<string, string> = ENVIO, outrasPaginas: Record<number, Lido[]> = {}, agora?: () => number) {
  const falsos = trelloETeableFalsos(opcoes);
  // as exibições que o envio grava no Teable aparecem no Postgres, como no de verdade
  const sessaoDe = (id: string) => ({ id, title: banco.atracoes?.find((s) => s.__id === id)?.atracao ?? '' });
  const gravadas = (): ExibicaoDoBanco[] =>
    falsos.teable('tblExibicoes').map((p) => {
      const e = (p.corpo!.records as { fields: Record<string, unknown> }[])[0].fields as { filme: { id: string }; sessao?: { id: string }; data_de_exibicao: string; card_ID?: string; link?: string; exibicao: string };
      return { filme: { id: e.filme.id, title: '' }, sessao: sessaoDe(e.sessao?.id ?? ''), data_de_exibicao: e.data_de_exibicao, card_ID: e.card_ID ?? '', link: e.link ?? '', labels: null, exibicao: e.exibicao };
    });
  const pg = postgresFalso({ ...banco, get exibicoes() { return [...(banco.exibicoes ?? []), ...gravadas()]; } });
  const trello = criarTrello(env, { buscar: falsos.buscar, consultar: pg.consultar });
  const movies = (l: Lido[]) => ({ movies: l.map((x) => ({ sessao: 'SUPERCINE', data: '05/12/2026', inedito: false, ano_de_producao: null, ...x })) });
  const respostas: Record<number, unknown> = { 2: movies(lidos), ...Object.fromEntries(Object.entries(outrasPaginas).map(([n, l]) => [n, movies(l)])) };
  const n8n = n8nFalso(respostas);
  const { api, filmes: modulo } = await subir({ env: { ...ENV, ...env }, n8n, consultar: pg.consultar, trello, agora });
  /** Uma prévia de uma página só (a página n, com os filmes dela). */
  const previa = async (n: number, titulos: string[]) => {
    const { id } = await criar(api, { nome: 'PREVIA.pdf', hash: `env${Math.random().toString(36).slice(2, 10)}`, paginas: [n] });
    await api(`/api/filmes/previas/${id}/paginas/${n}`, { method: 'PUT', body: JSON.stringify(pagina(titulos)) });
    await ate(api, id, (p) => p.paginas[0].estado === 'lida');
    const filmes = async (): Promise<FilmeEnviado[]> => (await (await api(`/api/filmes/previas/${id}`)).json()).paginas[0].filmes;
    const enviar = () => api(`/api/filmes/previas/${id}/enviar`, { method: 'POST' });
    /** Espera o envio terminar (nenhum filme "enviando"). */
    const terminar = async () => {
      for (let i = 0; i < 200; i++) {
        const f = await filmes();
        if (!f.some((x) => x.envio?.estado === 'enviando')) return f;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error('o envio não terminou');
    };
    const reler = (novos: Lido[]) => relerComo(api, id, n, n8n, respostas, novos);
    return { id, filmes, enviar, terminar, reler };
  };
  const primeira = await previa(2, lidos.map((l) => l.titulo));
  /** A prévia de outra página (de outrasPaginas), no mesmo servidor. */
  const outra = (n: number) => previa(n, outrasPaginas[n].map((l) => l.titulo));
  return { api, ...primeira, outra, falsos, pg, modulo };
}

const SESSOES = [
  { __id: 'recSessaoSuper', atracao: 'Supercine', acervo: 'do filme' },
  { __id: 'recSessaoDomMaior', atracao: 'Domingo Maior', acervo: 'do filme' },
  { __id: 'recSessaoTarde', atracao: 'Sessão da Tarde', acervo: 'do filme' },
  { __id: 'recSessaoTQ', atracao: 'Tela Quente', acervo: 'do filme' },
];
const DESPEDIDA = { ...filmeDoBanco('recDespedida01', 'Despedida em Grande Estilo', 2017), ...referencia.caminhos['DESPEDIDA EM GRANDE ESTILO'], poster: null };
const doAcervo = (arte: string, id: string, title: string) => ({ arte, filme: { id, title } });

describe('aba Filmes: o envio', () => {
  it('o card sai igual ao do fluxo CARDS (o de referência), e o Teable recebe a exibição, o filme novo e o pôster', async () => {
    const { enviar, terminar, falsos } = await paraEnviar(
      [
        { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017, sessao: 'SUPERCINE', data: '05/12/2026' },
        { titulo: 'PERSEGUIÇÃO NAS ALTURAS', ano_de_producao: 2022, sessao: 'DOMINGO MAIOR', data: '06/12/2026', inedito: true },
      ],
      {
        filmes: [DESPEDIDA],
        acervo: ['Despedida em Grande Estilo', 'HOJE', 'AMANHÃ'].map((a) => doAcervo(a, 'recDespedida01', 'DESPEDIDA EM GRANDE ESTILO (2017)')),
        atracoes: SESSOES,
      },
    );
    const r = await enviar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ enviando: 2 });
    const filmes = await terminar();

    // os cards, comparados com os do CARDS (a hora do envio é a de agora)
    const cards = falsos.cards();
    expect(cards).toHaveLength(2);
    cards.forEach((c, k) => {
      const ref = referencia.cards[k];
      expect(c.card).toEqual(ref.card);
      expect(c.checklist).toEqual(ref.checklist);
      expect((c.campos.cEntrada as { value: { date: string } }).value.date).toMatch(ISO);
      expect({ ...c.campos, cEntrada: { value: { date: '<agora>' } } }).toEqual(ref.campos);
      expect(c.anexos).toHaveLength(1);
      expect(c.anexos[0]).toMatchObject(ref.anexos[0]);
    });

    // o filme novo é cadastrado (título como no cadastro, ano) antes do card, para o card levar os caminhos dele
    const novos = falsos.teable('tblFilmes').filter((p) => p.url.pathname.endsWith('/record'));
    expect(novos).toHaveLength(1);
    const cadastro = (novos[0].corpo!.records as { fields: Record<string, unknown> }[])[0].fields;
    expect(cadastro.cadastrado_em).toMatch(ISO);
    expect({ ...cadastro, cadastrado_em: '<agora>' }).toEqual(referencia.cards[1].filmeNovo);

    // a exibição de cada card, no formato do CARDS (é o que a fila de filmes e o Padeiro leem)
    const exibicoes = falsos.teable('tblExibicoes').map((p) => (p.corpo!.records as { fields: Record<string, unknown> }[])[0].fields);
    expect(exibicoes).toHaveLength(2);
    exibicoes.forEach((e, k) => {
      expect(e.criado_em).toMatch(ISO);
      expect({ ...e, criado_em: '<agora>' }).toEqual({ ...referencia.cards[k].exibicao, card_ID: cards[k].id, link: `https://trello.com/c/${cards[k].id.toUpperCase()}`, filme: { id: k ? 'recNovo0001' : 'recDespedida01' } });
    });
    // nada na produção da arte (ADR 0001)
    expect(falsos.pedidos.filter((p) => p.url.host === 'teable:3000' && !/tblFilmes|tblExibicoes/.test(p.url.pathname))).toEqual([]);

    // o pôster recortado vai para o cadastro dos dois filmes (nenhum tinha)
    const posteres = falsos.pedidos.filter((p) => p.url.pathname.endsWith('/fldPoster/uploadAttachment'));
    expect(posteres.map((p) => p.url.pathname.split('/')[5])).toEqual(['recDespedida01', 'recNovo0001']);

    // cada filme guarda o resultado; o enviado mostra o Trello com o link
    expect(filmes[0].envio).toMatchObject({ estado: 'enviado', card: cards[0].id, link: `https://trello.com/c/${cards[0].id.toUpperCase()}`, por: 'Ana Lima' });
    expect(filmes[0].envio!.em).toMatch(ISO);
    expect(filmes[0].conferencia).toMatchObject({ marca: 'trello', link: `https://trello.com/c/${cards[0].id.toUpperCase()}` });
    expect(filmes[1].envio).toMatchObject({ estado: 'enviado', card: cards[1].id });
  });

  it('dois Envios seguidos não criam card duplicado', async () => {
    const { enviar, terminar, falsos } = await paraEnviar([{ titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 }], { filmes: [DESPEDIDA], atracoes: SESSOES });
    // os dois ao mesmo tempo (duas pessoas): o segundo não pega o filme que o primeiro marcou
    const [a, b] = await Promise.all([enviar(), enviar()]);
    expect([(await a.json()).enviando, (await b.json()).enviando].sort()).toEqual([0, 1]);
    await terminar();
    // e depois de enviado, outro Enviar não manda de novo
    expect(await (await enviar()).json()).toEqual({ enviando: 0 });
    await terminar();
    expect(falsos.cards()).toHaveLength(1);
    expect(falsos.teable('tblExibicoes')).toHaveLength(1);
  });

  it('um erro num filme não para os outros; o filme com erro mostra o motivo e pode ir de novo', async () => {
    let recusar = true;
    const { enviar, terminar, falsos, api, id } = await paraEnviar(
      [
        { titulo: 'RIVAIS', ano_de_producao: 2024, sessao: 'TELA QUENTE', data: '07/12/2026' },
        { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 },
      ],
      { filmes: [DESPEDIDA, filmeDoBanco('recRivais1', 'Rivais', 2024)], atracoes: SESSOES },
      { falharCard: (nome) => recusar && nome.includes('RIVAIS') },
    );
    expect(await (await enviar()).json()).toEqual({ enviando: 2 });
    let [rivais, despedida] = await terminar();
    expect(rivais.envio).toMatchObject({ estado: 'erro', por: 'Ana Lima' });
    expect(rivais.envio!.erro).toMatch(/401.*invalid token/);
    expect(rivais.conferencia!.marca).toBe('ok');
    expect(despedida.envio).toMatchObject({ estado: 'enviado' });
    // o filme que já foi não muda mais
    expect((await api(`/api/filmes/previas/${id}/paginas/2/filmes/1`, { method: 'PATCH', body: JSON.stringify({ titulo: 'OUTRO' }) })).status).toBe(409);

    recusar = false;
    expect(await (await enviar()).json()).toEqual({ enviando: 1 });
    [rivais, despedida] = await terminar();
    expect(rivais.envio).toMatchObject({ estado: 'enviado' });
    expect(rivais.envio!.erro).toBeUndefined();
    expect(falsos.cards().map((c) => c.card.name)).toEqual(['SUPERCINE 05/12 - DESPEDIDA EM GRANDE ESTILO (2017)', 'TELA QUENTE 07/12 - RIVAIS (2024)']);
  });

  it('o ano que faltava vai para o cadastro; o pôster da prévia substitui o mais antigo e não o mais atual', async () => {
    const { enviar, terminar, falsos } = await paraEnviar(
      [
        { titulo: 'RIVAIS', ano_de_producao: 2024, sessao: 'TELA QUENTE', data: '07/12/2026' },
        { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 },
      ],
      {
        filmes: [
          // sem ano, e com um pôster de antes do PROMeiro
          { ...filmeDoBanco('recRivais1', 'Rivais', null), poster: [{ name: 'Rivais.jpg', token: 'tokVelho' }] },
          // com o pôster de uma prévia mais nova que esta
          { ...DESPEDIDA, poster: [{ name: 'Despedida em Grande Estilo (prévia 2027-01).jpg', token: 'tokNovo' }] },
        ],
        atracoes: SESSOES,
      },
    );
    await enviar();
    await terminar();
    const patches = falsos.teable('tblFilmes', 'PATCH').map((p) => [p.url.pathname.split('/').pop(), p.corpo!.record]);
    const upload = falsos.pedidos.filter((p) => p.url.pathname.endsWith('/uploadAttachment'));
    expect(upload.map((p) => [p.url.pathname.split('/')[5], p.corpo!.file])).toEqual([['recRivais1', 'Rivais (prévia 2026-12).jpg']]);
    // o ano, e o pôster novo no lugar do antigo (o que acabou de subir é o último da lista)
    expect(patches).toEqual([
      ['recRivais1', { fields: { ano_de_producao: 2024 } }],
      ['recRivais1', { fields: { poster: [{ name: 'Rivais (prévia 2026-12).jpg', token: expect.stringMatching(/^tokNovo/) }] } }],
    ]);
    expect(falsos.cards()[0].card.name).toBe('TELA QUENTE 07/12 - RIVAIS (2024)');
  });

  it('o pôster da prévia fica guardado no PROMeiro (#90) e é servido de lá, também quando o cadastro já tem um mais atual', async () => {
    const { enviar, terminar, api, falsos } = await paraEnviar(
      [
        { titulo: 'RIVAIS', ano_de_producao: 2024, sessao: 'TELA QUENTE', data: '07/12/2026' },
        { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 },
      ],
      {
        filmes: [
          { ...filmeDoBanco('recRivais1', 'Rivais', 2024), poster: [{ name: 'Rivais.jpg', token: 'tokVelho' }] },
          { ...DESPEDIDA, poster: [{ name: 'Despedida em Grande Estilo (prévia 2027-01).jpg', token: 'tokNovo' }] },
        ],
        atracoes: SESSOES,
      },
    );
    await enviar();
    await terminar();
    const antes = falsos.pedidos.length;
    // o que subiu para o cadastro, e o que não subiu (o cadastro tem um mais atual) mas o PROMeiro não tinha
    expect(await (await api('/api/filmes/poster/recRivais1')).text()).toBe('jpg-poster-1');
    expect(await (await api('/api/filmes/poster/recDespedida01')).text()).toBe('jpg-poster-2');
    expect(falsos.pedidos.slice(antes)).toEqual([]);
  });

  it('sem a lista dos filmes no Trello, o envio fica desligado e diz o que falta', async () => {
    const { TRELLO_LISTA_FILMES: _, ...semLista } = ENVIO;
    const { enviar, api, id, falsos } = await paraEnviar([{ titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 }], { filmes: [DESPEDIDA] }, {}, semLista);
    const r = await enviar();
    expect(r.status).toBe(503);
    expect((await r.json()).erro).toMatch(/TRELLO_LISTA_FILMES/);
    expect((await (await api(`/api/filmes/previas/${id}`)).json()).envio).toEqual({ ligado: false, faltando: ['TRELLO_LISTA_FILMES'] });
    expect(falsos.pedidos).toEqual([]);
  });

  it('as sessões de filme do cadastro: só a de acervo do filme vira o vínculo da exibição', async () => {
    const atracoes: SessaoDoBanco[] = [
      { __id: 'recSessaoSuper', atracao: 'Supercine', acervo: 'do filme' },
      { __id: 'recDomMaior', atracao: 'Domingo Maior', acervo: null },
    ];
    const { enviar, terminar, falsos } = await paraEnviar(
      [
        { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017, sessao: 'SUPERCINE', data: '05/12/2026' },
        { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017, sessao: 'DOMINGO MAIOR', data: '06/12/2026' },
      ],
      { filmes: [DESPEDIDA], atracoes },
    );
    await enviar();
    await terminar();
    const exibicoes = falsos.teable('tblExibicoes').map((p) => (p.corpo!.records as { fields: Record<string, unknown> }[])[0].fields);
    expect(exibicoes.map((e) => e.sessao)).toEqual([{ id: 'recSessaoSuper' }, undefined]);
  });

  it('o filme sem título pede atenção e não vai', async () => {
    const { enviar, filmes } = await paraEnviar([{ titulo: '', ano_de_producao: 2017 }, { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 }], { filmes: [DESPEDIDA], atracoes: SESSOES });
    const [semTitulo] = await filmes();
    expect(semTitulo.conferencia).toMatchObject({ marca: 'atencao', pergunta: 'sem-titulo' });
    expect(await (await enviar()).json()).toEqual({ enviando: 1 });
  });

  it('a prioridade MÉDIA vai só no inédito, como no CARDS (o filme novo já está no cadastro quando o card nasce)', async () => {
    const { enviar, terminar, falsos } = await paraEnviar(
      [{ titulo: 'KONG: ILHA DA CAVEIRA', ano_de_producao: 2017, sessao: 'TELA QUENTE', data: '07/12/2026' }],
      { filmes: [], atracoes: SESSOES },
      {},
      { ...ENVIO, TRELLO_FILMES_ETIQUETAS_SESSAO: 'Tela Quente=etqTQ' },
    );
    await enviar();
    await terminar();
    const [card] = falsos.cards();
    expect(card.campos.cPrio).toBeUndefined();
    // a etiqueta da sessão, escrita de qualquer jeito na variável
    expect(card.card.idLabels).toBe('etqFilme,etqTQ');
  });
});


/* ---------- a Sessão da Tarde: um card por semana ---------- */
/* O card da semana comparado com o do fluxo CARDS (tests/fixtures/card-da-sessao-da-tarde.json): os quatro filmes da
   semana de 30/11 a 04/12, o de terça com o título já no acervo. */
const saida = (pasta: string, letra: string) => `\\\\servidor-arte\\SAIDA\\FILMES\\TITULOS\\${letra}\\${pasta}`;
const daTarde = (__id: string, titulo: string, ano: number, pasta: string, letra: string): FilmeDoBanco => ({ ...filmeDoBanco(__id, titulo, ano), output_win: saida(pasta, letra), poster: null });
const DA_TARDE = [
  daTarde('recFlores01', 'Flores de Aço', 2012, 'FLORES DE ACO', '_F_'),
  daTarde('recBecky01', 'Os Delírios de Consumo de Becky Bloom', 2009, 'OS DELIRIOS DE CONSUMO DE BECKY BLOOM', '_D_'),
  daTarde('recComite01', 'O Comitê da Vida', 2021, 'O COMITE DA VIDA', '_C_'),
  daTarde('recSalafra01', 'Os Salafrários', 2021, 'OS SALAFRARIOS', '_S_'),
  daTarde('recRepente01', 'De Repente 30', 2004, 'DE REPENTE 30', '_R_'),
];
const tarde = (titulo: string, data: string): Lido => ({ titulo, sessao: 'SESSÃO DA TARDE', data });
const SEMANA = [tarde('FLORES DE AÇO', '30/11/2026'), tarde('OS DELÍRIOS DE CONSUMO DE BECKY BLOOM', '01/12/2026'), tarde('O COMITÊ DA VIDA', '03/12/2026'), tarde('OS SALAFRÁRIOS', '04/12/2026')];
const BECKY_NO_ACERVO = [doAcervo('Os Delírios de Consumo de Becky Bloom', 'recBecky01', 'Os Delírios de Consumo de Becky Bloom (2009)')];

describe('aba Filmes: a Sessão da Tarde', () => {
  it('os filmes da semana viram um card só, igual ao do fluxo CARDS (o de referência), e cada um ganha a sua exibição ligada a ele', async () => {
    const { enviar, terminar, falsos } = await paraEnviar(SEMANA, { filmes: DA_TARDE, acervo: BECKY_NO_ACERVO, atracoes: SESSOES });
    expect(await (await enviar()).json()).toEqual({ enviando: 4 });
    const filmes = await terminar();

    const cards = falsos.cards();
    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(card.card).toEqual(referenciaDaTarde.card);
    expect(card.checklist).toEqual({ name: referenciaDaTarde.checklist.name, itens: referenciaDaTarde.checklist.itens });
    expect(card.campos).toEqual({});
    expect(card.anexos).toEqual([]);

    const link = `https://trello.com/c/${card.id.toUpperCase()}`;
    const exibicoes = falsos.teable('tblExibicoes').map((p) => (p.corpo!.records as { fields: Record<string, unknown> }[])[0].fields);
    exibicoes.forEach((e) => expect(e.criado_em).toMatch(ISO));
    // a exibição do n8n vinha sem artes; a do PROMeiro guarda as do filme (o título): a produzir ou que já existe
    const artes = [{ artes: 'FLORES DE AÇO' }, { artes: '', artes_existentes: 'OS DELÍRIOS DE CONSUMO DE BECKY BLOOM' }, { artes: 'O COMITÊ DA VIDA' }, { artes: 'OS SALAFRÁRIOS' }];
    expect(exibicoes.map((e) => ({ ...e, criado_em: '<agora>' }))).toEqual(referenciaDaTarde.exibicoes.map((e, k) => ({ ...e, card_ID: card.id, link, ...artes[k] })));
    // nada na produção da arte (ADR 0001)
    expect(falsos.pedidos.filter((p) => p.url.host === 'teable:3000' && !/tblFilmes|tblExibicoes/.test(p.url.pathname))).toEqual([]);

    for (const f of filmes) {
      expect(f.envio).toMatchObject({ estado: 'enviado', card: card.id, link, por: 'Ana Lima' });
      expect(f.conferencia).toMatchObject({ marca: 'trello', link });
    }
  });

  it('uma semana com cinco filmes gera um card, e não cinco; a semana seguinte ganha o seu', async () => {
    const cinco = [...SEMANA, tarde('DE REPENTE 30', '02/12/2026')];
    const { enviar, terminar, falsos } = await paraEnviar([...cinco, tarde('FLORES DE AÇO', '07/12/2026')], { filmes: DA_TARDE, atracoes: SESSOES });
    expect(await (await enviar()).json()).toEqual({ enviando: 6 });
    const filmes = await terminar();

    const cards = falsos.cards();
    expect(cards.map((c) => c.card.name)).toEqual(['SESSÃO DA TARDE 30/11 A 04/12 - TÍTULOS', 'SESSÃO DA TARDE 07/12 - TÍTULOS']);
    expect(cards[0].checklist!.itens).toEqual([
      '30/11 SEG · FLORES DE AÇO (2012)',
      '01/12 TER · OS DELÍRIOS DE CONSUMO DE BECKY BLOOM (2009)',
      '02/12 QUA · DE REPENTE 30 (2004)',
      '03/12 QUI · O COMITÊ DA VIDA (2021)',
      '04/12 SEX · OS SALAFRÁRIOS (2021)',
    ]);
    expect(cards[1].checklist!.itens).toEqual(['07/12 SEG · FLORES DE AÇO (2012)']);
    // cada filme com a sua exibição, ligada ao card da semana dele
    const exibicoes = falsos.teable('tblExibicoes').map((p) => (p.corpo!.records as { fields: { exibicao: string; card_ID: string } }[])[0].fields);
    expect(exibicoes.map((e) => [e.exibicao, e.card_ID])).toEqual([
      ['SESSÃO DA TARDE 30/11 - FLORES DE AÇO', cards[0].id],
      ['SESSÃO DA TARDE 01/12 - OS DELÍRIOS DE CONSUMO DE BECKY BLOOM', cards[0].id],
      ['SESSÃO DA TARDE 03/12 - O COMITÊ DA VIDA', cards[0].id],
      ['SESSÃO DA TARDE 04/12 - OS SALAFRÁRIOS', cards[0].id],
      ['SESSÃO DA TARDE 02/12 - DE REPENTE 30', cards[0].id],
      ['SESSÃO DA TARDE 07/12 - FLORES DE AÇO', cards[1].id],
    ]);
    expect(filmes.map((f) => f.envio!.card)).toEqual([...cinco.map(() => cards[0].id), cards[1].id]);
  });

  it('um segundo Envio na mesma semana acrescenta ao card que já existe, sem criar outro', async () => {
    const quarta = [tarde('DE REPENTE 30', '02/12/2026'), tarde('O COMITÊ DA VIDA', '03/12/2026'), tarde('OS SALAFRÁRIOS', '04/12/2026')];
    // a semana passa de uma prévia para a outra: segunda e terça numa, o resto na outra
    const { enviar, terminar, outra, falsos } = await paraEnviar(SEMANA.slice(0, 2), { filmes: DA_TARDE, acervo: BECKY_NO_ACERVO, atracoes: SESSOES }, {}, ENVIO, { 3: quarta });
    await enviar();
    await terminar();
    const [card] = falsos.cards();
    expect(card.card.name).toBe('SESSÃO DA TARDE 30/11 A 01/12 - TÍTULOS');

    const segunda = await outra(3);
    expect(await (await segunda.enviar()).json()).toEqual({ enviando: 3 });
    const filmes = await segunda.terminar();
    expect(falsos.cards()).toHaveLength(1);
    expect(card.card).toMatchObject({
      name: 'SESSÃO DA TARDE 30/11 A 04/12 - TÍTULOS',
      desc: [
        '**TÍTULOS IDENTIFICADOS (5):**',
        '`30/11 SEG` FLORES DE AÇO (2012)',
        '`01/12 TER` OS DELÍRIOS DE CONSUMO DE BECKY BLOOM (2009) · ✓ já existe',
        '`02/12 QUA` DE REPENTE 30 (2004)',
        '`03/12 QUI` O COMITÊ DA VIDA (2021)',
        '`04/12 SEX` OS SALAFRÁRIOS (2021)',
        '',
        '**A PRODUZIR (4):** no checklist.',
        '',
        '**JÁ EXISTEM (não produzir):** OS DELÍRIOS DE CONSUMO DE BECKY BLOOM (2009)',
      ].join('\n'),
      due: '2026-11-30T03:00:00.000Z',
    });
    expect(card.checklist).toEqual({ name: 'TÍTULOS A PRODUZIR', itens: ['30/11 SEG · FLORES DE AÇO (2012)', '02/12 QUA · DE REPENTE 30 (2004)', '03/12 QUI · O COMITÊ DA VIDA (2021)', '04/12 SEX · OS SALAFRÁRIOS (2021)'] });
    const link = `https://trello.com/c/${card.id.toUpperCase()}`;
    const exibicoes = falsos.teable('tblExibicoes').map((p) => (p.corpo!.records as { fields: { card_ID: string; link: string } }[])[0].fields);
    expect(exibicoes.map((e) => [e.card_ID, e.link])).toEqual(Array(5).fill([card.id, link]));
    for (const f of filmes) expect(f.envio).toMatchObject({ estado: 'enviado', card: card.id, link });
  });

  it('o card do n8n que pega mais de uma semana recebe o filme novo sem perder os títulos das outras semanas', async () => {
    const doN8n: CardNoTrello = {
      id: 'cardN8n00001',
      card: { idList: 'listaFilmes', name: 'SESSÃO DA TARDE 30/11 A 08/12 - TÍTULOS', desc: ['**TÍTULOS IDENTIFICADOS (2):**', '`30/11 SEG` FLORES DE AÇO (2012)', '`08/12 TER` O COMITÊ DA VIDA (2021)', '', '**A PRODUZIR (2):** no checklist.'].join('\n') },
      checklist: { name: 'TÍTULOS A PRODUZIR', itens: ['30/11 SEG · FLORES DE AÇO (2012)', '08/12 TER · O COMITÊ DA VIDA (2021)'] },
      campos: {},
      anexos: [],
    };
    const exibicao = (filme: string, data: string): ExibicaoDoBanco => ({ filme: { id: filme, title: '' }, sessao: { id: 'recSessaoTarde', title: 'Sessão da Tarde' }, data_de_exibicao: data, card_ID: doN8n.id, link: 'https://trello.com/c/N8N00001', labels: null });
    const { enviar, terminar, falsos } = await paraEnviar(
      [tarde('OS SALAFRÁRIOS', '09/12/2026')],
      { filmes: DA_TARDE, atracoes: SESSOES, exibicoes: [exibicao('recFlores01', '2026-11-30T03:00:00.000Z'), exibicao('recComite01', '2026-12-08T03:00:00.000Z')] },
      { jaNoTrello: [doN8n] },
    );
    await enviar();
    await terminar();
    expect(falsos.cards()).toHaveLength(1);
    expect(doN8n.card.name).toBe('SESSÃO DA TARDE 30/11 A 09/12 - TÍTULOS');
    expect(doN8n.card.desc).toBe(
      ['**TÍTULOS IDENTIFICADOS (3):**', '`30/11 SEG` FLORES DE AÇO (2012)', '`08/12 TER` O COMITÊ DA VIDA (2021)', '`09/12 QUA` OS SALAFRÁRIOS (2021)', '', '**A PRODUZIR (3):** no checklist.'].join('\n'),
    );
    expect(doN8n.checklist!.itens.at(-1)).toBe('09/12 QUA · OS SALAFRÁRIOS (2021)');
  });

  it('na conferência seguinte, o título que o card da semana pôs no acervo do filme conta como arte que já existe', async () => {
    // a linha do acervo como o card da semana que saiu a grava: o título, ligado ao filme
    const floresNoAcervo = [doAcervo('FLORES DE AÇO', 'recFlores01', 'Flores de Aço (2012)')];
    const { enviar, terminar, filmes, falsos } = await paraEnviar([tarde('FLORES DE AÇO', '07/12/2026'), tarde('O COMITÊ DA VIDA', '08/12/2026')], { filmes: DA_TARDE, acervo: floresNoAcervo, atracoes: SESSOES });
    const [flores, comite] = (await filmes()) as (FilmeEnviado & { conferencia: { artes: { novas: string[]; existentes: string[] } } })[];
    expect(flores.conferencia.artes.existentes).toEqual(['FLORES DE AÇO']);
    expect(comite.conferencia.artes.existentes).toEqual([]);
    await enviar();
    await terminar();
    const [card] = falsos.cards();
    expect(card.checklist!.itens).toEqual(['08/12 TER · O COMITÊ DA VIDA (2021)']);
    expect(card.card.desc).toContain('`07/12 SEG` FLORES DE AÇO (2012) · ✓ já existe');
    const exibicoes = falsos.teable('tblExibicoes').map((p) => (p.corpo!.records as { fields: Record<string, unknown> }[])[0].fields);
    expect(exibicoes.map((e) => [e.artes, e.artes_existentes])).toEqual([
      ['', 'FLORES DE AÇO'],
      ['O COMITÊ DA VIDA', undefined],
    ]);
  });

  it('sem título a produzir e sem card na semana, não há card (como no CARDS): as exibições ficam sem ele', async () => {
    const { enviar, terminar, falsos } = await paraEnviar([SEMANA[1]], { filmes: DA_TARDE, acervo: BECKY_NO_ACERVO, atracoes: SESSOES });
    expect(await (await enviar()).json()).toEqual({ enviando: 1 });
    const [becky] = await terminar();
    expect(falsos.cards()).toEqual([]);
    const [e] = falsos.teable('tblExibicoes').map((p) => (p.corpo!.records as { fields: Record<string, unknown> }[])[0].fields);
    expect(e).toMatchObject({ exibicao: 'SESSÃO DA TARDE 01/12 - OS DELÍRIOS DE CONSUMO DE BECKY BLOOM', filme: { id: 'recBecky01' } });
    expect(e).not.toHaveProperty('card_ID');
    expect(becky.envio).toMatchObject({ estado: 'enviado' });
    expect(becky.envio!.card).toBeUndefined();
  });
});

/* ---------- o filme que a leitura pôs por engano na Sessão da Tarde ---------- */
/* Uma página como a da prévia: na fileira de cima, três colunas (a data em texto acima de cada pôster; o nome da
   sessão é logotipo, sem texto); na de baixo, a Sessão da Tarde. A leitura erra a coluna do meio. */
const SESSOES_DA_PAGINA = ['SUPERCINE', 'CINEMAÇO', 'TELA QUENTE', 'SESSÃO DA TARDE'];
function paginaComDuasFileiras(textosAcima: string[][] = [['05/12'], ['06/12'], ['07/12']]) {
  const cima = [0, 1, 2].map((k) => ({ x: 100 + k * 200, y: 100, width: 100, height: 150 }));
  const baixo = [0, 1].map((k) => ({ x: 150 + k * 300, y: 380, width: 90, height: 130 }));
  const titulos = ['DESPEDIDA EM GRANDE ESTILO', 'UM SONHO DE LIBERDADE', 'TREZE VIDAS', 'KONG', 'LUCA'];
  return {
    ...pagina([]),
    tamanho: { width: 1000, height: 600 },
    posteres: [...cima, ...baixo].map((c, i) => ({ dados: b64(`jpg-poster-${i + 1}`), caixa: c })),
    textos: [
      ...[...cima, ...baixo].map((c, i) => ({ str: titulos[i], x: c.x, top: c.y + c.height + 8, width: c.width, height: 12 })),
      ...textosAcima.flatMap((linhas, k) => linhas.map((str, j) => ({ str, x: cima[k].x + 10, top: 60 + j * 16, width: 60, height: 12 }))),
      { str: '09/12', x: 160, top: 355, width: 40, height: 12 },
      { str: '10/12', x: 460, top: 355, width: 40, height: 12 },
    ],
  };
}
async function comFilmeNaTardePorEngano({ sessoes = SESSOES_DA_PAGINA, sessaoDaDireita = 'TELA QUENTE', textosAcima = undefined as string[][] | undefined } = {}) {
  const pg = postgresFalso({ filmes: [filmeDoBanco('recSonho01', 'Um Sonho de Liberdade', 1994)] });
  const movies = [
    { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017, sessao: 'SUPERCINE', data: '05/12/2026' },
    { titulo: 'UM SONHO DE LIBERDADE', ano_de_producao: 1994, sessao: 'SESSÃO DA TARDE', data: '09/12/2026' },
    { titulo: 'TREZE VIDAS', ano_de_producao: 2022, sessao: sessaoDaDireita, data: '07/12/2026' },
    { titulo: 'KONG', ano_de_producao: 2017, sessao: 'SESSÃO DA TARDE', data: '09/12/2026' },
    { titulo: 'LUCA', ano_de_producao: 2021, sessao: 'SESSÃO DA TARDE', data: '10/12/2026' },
  ];
  const respostas: Record<number, unknown> = { 2: { movies, sessoes } };
  const n8n = n8nFalso(respostas);
  const { api } = await subir({ env: { ...ENV, ...PG }, n8n, consultar: pg.consultar });
  const { id } = await criar(api, { nome: 'PREVIA.pdf', hash: `tarde${Math.random().toString(36).slice(2, 10)}`, paginas: [2] });
  await api(`/api/filmes/previas/${id}/paginas/2`, { method: 'PUT', body: JSON.stringify(paginaComDuasFileiras(textosAcima)) });
  await ate(api, id, (p) => p.paginas[0].estado === 'lida');
  const abrir = async () => (await (await api(`/api/filmes/previas/${id}`)).json()).paginas[0];
  const mudar = (i: number, corpo: object) => api(`/api/filmes/previas/${id}/paginas/2/filmes/${i}`, { method: 'PATCH', body: JSON.stringify(corpo) });
  /** Lê de novo: a leitura nova traz os mesmos filmes, com as mudanças dadas (filme i → campos novos). */
  const reler = (mudancas: Record<number, Partial<Lido>> = {}) => relerComo(api, id, 2, n8n, respostas, movies.map((m, i) => ({ ...m, ...mudancas[i] })), { sessoes });
  return { abrir, mudar, reler };
}

describe('aba Filmes: o filme de identidade própria lido na Sessão da Tarde', () => {
  it('subir o filme para a vaga dele grava: ele sai da Sessão da Tarde e pede a sessão, a da coluna em primeiro', async () => {
    const { abrir, mudar } = await comFilmeNaTardePorEngano();
    const antes = await abrir();
    // os pôsteres da fileira de cima da página (a vaga do filme lido na Sessão da Tarde é um deles)
    expect(antes.fileiraDeCima).toEqual([0, 1, 2]);
    expect(antes.filmes[1]).toMatchObject({ sessao: 'SESSÃO DA TARDE', poster: 1 });

    const r = await mudar(1, { subir: true });
    expect(r.status).toBe(200);
    const { filme } = await r.json();
    expect(filme.sessao).toBe('');
    expect(filme.conferencia).toMatchObject({ marca: 'atencao', pergunta: 'sessao' });
    expect(filme.conferencia.sessoes).toEqual([
      { sessao: 'CINEMAÇO', data: '06/12/2026', coluna: true },
      { sessao: 'SUPERCINE' },
      { sessao: 'TELA QUENTE' },
    ]);
    // gravado: quem abrir a prévia depois vê o mesmo
    const depois = (await abrir()).filmes[1];
    expect(depois).toMatchObject({ sessao: '', conferencia: { marca: 'atencao', pergunta: 'sessao' } });
  });

  it('escolhida a sessão, o filme passa pela conferência e fica pronto; a da coluna traz a data do alto da coluna', async () => {
    const { abrir, mudar } = await comFilmeNaTardePorEngano();
    await mudar(1, { subir: true });
    expect((await mudar(1, { sessao: 'CORUJÃO' })).status).toBe(400);
    const r = await mudar(1, { sessao: 'Cinemaço' });
    expect(r.status).toBe(200);
    expect((await r.json()).filme).toMatchObject({ sessao: 'CINEMAÇO', data: '06/12/2026', conferencia: { marca: 'ok', filme: { id: 'recSonho01' } } });
    const pag = await abrir();
    expect(pag.filmes[1]).toMatchObject({ sessao: 'CINEMAÇO', data: '06/12/2026', conferencia: { marca: 'ok' } });
    expect(pag.filmes[1].conferencia.pergunta).toBeUndefined();

    // outra sessão da página: fica a data lida
    const outro = await comFilmeNaTardePorEngano();
    await outro.mudar(1, { subir: true });
    expect((await (await outro.mudar(1, { sessao: 'SUPERCINE' })).json()).filme).toMatchObject({ sessao: 'SUPERCINE', data: '09/12/2026', conferencia: { marca: 'ok' } });
  });

  it('só sobe o filme da Sessão da Tarde com o pôster na fileira de cima; a sessão só muda no que subiu', async () => {
    const { mudar } = await comFilmeNaTardePorEngano();
    expect((await mudar(3, { subir: true })).status).toBe(409);
    expect((await mudar(0, { subir: true })).status).toBe(409);
    expect((await mudar(0, { sessao: 'CINEMAÇO' })).status).toBe(409);
  });

  it('a sessão da coluna: o nome escrito acima do pôster vale primeiro; sem ele, as colunas sem sessão casam com as sessões livres', async () => {
    // o nome da sessão em texto no alto da coluna
    const escrito = await comFilmeNaTardePorEngano({ textosAcima: [['05/12'], ['06/12', 'TELA QUENTE'], ['07/12']] });
    const a = (await (await escrito.mudar(1, { subir: true })).json()).filme;
    expect(a.conferencia.sessoes[0]).toEqual({ sessao: 'TELA QUENTE', data: '06/12/2026', coluna: true });
    // duas colunas lidas na Sessão da Tarde: a da esquerda fica com a primeira sessão livre, a da direita com a outra
    const duas = await comFilmeNaTardePorEngano({ sessoes: ['SUPERCINE', 'CINEMAÇO', 'CORUJÃO', 'SESSÃO DA TARDE'], sessaoDaDireita: 'SESSÃO DA TARDE' });
    const b = (await (await duas.mudar(2, { subir: true })).json()).filme;
    expect(b.conferencia.sessoes).toEqual([{ sessao: 'CORUJÃO', data: '07/12/2026', coluna: true }, { sessao: 'SUPERCINE' }, { sessao: 'CINEMAÇO' }]);
    expect((await (await duas.mudar(1, { subir: true })).json()).filme.conferencia.sessoes[0]).toEqual({ sessao: 'CINEMAÇO', data: '06/12/2026', coluna: true });
    // sem como saber a coluna, as sessões da página na ordem da leitura, nenhuma marcada como a da coluna
    const sem = await comFilmeNaTardePorEngano({ sessoes: [] });
    const c = (await (await sem.mudar(1, { subir: true })).json()).filme;
    expect(c.conferencia.sessoes).toEqual([{ sessao: 'SUPERCINE' }, { sessao: 'TELA QUENTE' }]);
  });
});

/* ---------- várias pessoas na mesma prévia ---------- */
describe('aba Filmes: várias pessoas na mesma prévia', () => {
  const comoBruno = { 'cf-access-authenticated-user-email': 'bruno.reis@empresa.com' };
  const presenca = (api: Awaited<ReturnType<typeof subir>>['api'], id: string, corpo: object = {}, headers: Record<string, string> = {}) =>
    api(`/api/filmes/previas/${id}/presenca`, { method: 'POST', body: JSON.stringify(corpo), headers }).then((r) => r.json());

  it('quem está na prévia aparece para os outros, com o card em que mexe, e a lista mostra quem está em cada uma', async () => {
    const { api } = await subir();
    const { id } = await criar(api, { nome: 'PREVIA_DEZEMBRO_2026.pdf', hash: 'gente01', paginas: [2] });
    const { id: outra } = await criar(api, { nome: 'PREVIA_JANEIRO_2027.pdf', hash: 'gente02', paginas: [2] });

    expect((await presenca(api, id, { card: { numero: 2, i: 1 } })).pessoas).toEqual([]);
    // a Ana não se vê; o Bruno vê a Ana no card que ela abriu
    expect((await presenca(api, id, {}, comoBruno)).pessoas).toEqual([{ nome: 'Ana Lima', email: 'ana.lima@empresa.com', card: { numero: 2, i: 1 } }]);
    expect((await presenca(api, id)).pessoas).toEqual([{ nome: 'Bruno Reis', email: 'bruno.reis@empresa.com', card: null }]);

    const lista = await (await api('/api/filmes/previas', { headers: comoBruno })).json();
    expect(lista.find((p: { id: string }) => p.id === id).pessoas).toEqual([{ nome: 'Ana Lima', email: 'ana.lima@empresa.com' }]);
    expect(lista.find((p: { id: string }) => p.id === outra).pessoas).toEqual([]);

    // a Ana sai: some para o Bruno
    await presenca(api, id, { saiu: true });
    expect((await presenca(api, id, {}, comoBruno)).pessoas).toEqual([]);
  });

  it('a mudança de uma pessoa aparece para a outra: a versão muda, e só então a prévia é reaberta (o aviso não consulta o banco)', async () => {
    const { api, id, mudar, pg } = await conferir([{ titulo: 'RIVAIS', ano_de_producao: 2023 }], { filmes: [filmeDoBanco('recRivais1', 'Rivais', 2024)] });
    const aberta = await (await api(`/api/filmes/previas/${id}`, { headers: comoBruno })).json();
    const consultas = pg.consultas.length;
    const antes = await presenca(api, id, {}, comoBruno);
    expect(antes.versao).toBe(aberta.versao);
    expect((await presenca(api, id, {}, comoBruno)).versao).toBe(antes.versao);
    expect(pg.consultas.length).toBe(consultas);

    // a Ana escolhe o ano: o próximo aviso do Bruno traz outra versão, e a prévia reaberta mostra a escolha
    await mudar(0, { ano: 2023 });
    const depois = await presenca(api, id, {}, comoBruno);
    expect(depois.versao).not.toBe(antes.versao);
    const nova = await (await api(`/api/filmes/previas/${id}`, { headers: comoBruno })).json();
    expect(nova.versao).toBe(depois.versao);
    expect(nova.paginas[0].filmes[0].conferencia).toMatchObject({ marca: 'ok', ano: 2023 });
    // o título também
    await mudar(0, { titulo: 'Rivais' });
    expect((await presenca(api, id, {}, comoBruno)).versao).not.toBe(depois.versao);
  });

  it('quem para de avisar (a aba fechou sem dizer) sai sozinho', async () => {
    const { api } = await subir({ env: { ...ENV, FILMES_PRESENCA_MS: '1000' } });
    const { id } = await criar(api, { nome: 'PREVIA_DEZEMBRO_2026.pdf', hash: 'gente03', paginas: [2] });
    await presenca(api, id);
    expect((await presenca(api, id, {}, comoBruno)).pessoas).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await presenca(api, id, {}, comoBruno)).pessoas).toEqual([]);
    expect((await (await api('/api/filmes/previas', { headers: comoBruno })).json())[0].pessoas).toEqual([]);
  });
});

/* ---------- a prévia toda enviada some depois de 60 dias ---------- */
/* O relógio é injetado: o teste anda os dias em vez de esperar por eles. */
describe('aba Filmes: a prévia toda enviada é apagada depois de 60 dias', () => {
  const DIA = 86_400_000;
  const relogio = () => {
    const r = { agora: Date.parse('2026-11-10T15:00:00Z'), andar: (dias: number) => void (r.agora += dias * DIA) };
    return r;
  };
  type NaLista = { id: string; diasParaApagar: number | null };

  it('a prévia toda enviada mostra na lista em quantos dias será apagada', async () => {
    const r = relogio();
    const { api, id, enviar, terminar } = await paraEnviar([{ titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 }], { filmes: [DESPEDIDA], atracoes: SESSOES }, {}, ENVIO, {}, () => r.agora);
    const naLista = async () => ((await (await api('/api/filmes/previas')).json()) as NaLista[]).find((p) => p.id === id)!;
    expect((await naLista()).diasParaApagar).toBeNull();
    await enviar();
    await terminar();
    expect((await naLista()).diasParaApagar).toBe(60);
    r.andar(22);
    expect((await naLista()).diasParaApagar).toBe(38);
  });

  it('a prévia enviada há 61 dias some, o registro e as imagens; a de 59 dias fica; as exibições e os cards ficam', async () => {
    const r = relogio();
    const { api, id, enviar, terminar, outra, falsos, modulo } = await paraEnviar(
      [{ titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 }],
      { filmes: [DESPEDIDA, filmeDoBanco('recRivais1', 'Rivais', 2024)], atracoes: SESSOES },
      {},
      ENVIO,
      { 3: [{ titulo: 'RIVAIS', ano_de_producao: 2024, sessao: 'TELA QUENTE', data: '07/12/2026' }] },
      () => r.agora,
    );
    await enviar();
    await terminar();
    r.andar(2);
    const segunda = await outra(3);
    await segunda.enviar();
    await segunda.terminar();
    const pedidos = falsos.pedidos.length;

    r.andar(59);
    expect(await modulo.apagarVencidas()).toEqual([id]);
    const lista = ((await (await api('/api/filmes/previas')).json()) as NaLista[]).map((p) => [p.id, p.diasParaApagar]);
    expect(lista).toEqual([[segunda.id, 1]]);
    expect((await api(`/api/filmes/previas/${id}`)).status).toBe(404);
    expect((await api(`/api/filmes/previas/${id}/paginas/2/imagem`)).status).toBe(404);
    expect((await api(`/api/filmes/previas/${id}/paginas/2/poster/1`)).status).toBe(404);
    // a de 59 dias fica inteira, com as imagens
    expect(await (await api(`/api/filmes/previas/${segunda.id}/paginas/3/imagem`)).text()).toBe('jpg-pagina');
    // nada sai do Trello nem do Teable
    expect(falsos.pedidos.length).toBe(pedidos);
    expect(falsos.cards()).toHaveLength(2);
  });

  it('a prévia com filme ainda não enviado nunca é apagada; enviado o último, o prazo conta deste envio', async () => {
    const r = relogio();
    let recusar = true;
    const { api, id, enviar, terminar, modulo } = await paraEnviar(
      [
        { titulo: 'RIVAIS', ano_de_producao: 2024, sessao: 'TELA QUENTE', data: '07/12/2026' },
        { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 },
      ],
      { filmes: [DESPEDIDA, filmeDoBanco('recRivais1', 'Rivais', 2024)], atracoes: SESSOES },
      { falharCard: (nome) => recusar && nome.includes('RIVAIS') },
      ENVIO,
      {},
      () => r.agora,
    );
    const naLista = async () => ((await (await api('/api/filmes/previas')).json()) as NaLista[]).find((p) => p.id === id);
    await enviar();
    expect((await terminar()).map((f) => f.envio?.estado)).toEqual(['erro', 'enviado']);
    r.andar(400);
    expect(await modulo.apagarVencidas()).toEqual([]);
    expect((await naLista())!.diasParaApagar).toBeNull();

    recusar = false;
    await enviar();
    await terminar();
    expect((await naLista())!.diasParaApagar).toBe(60);
    r.andar(59);
    expect(await modulo.apagarVencidas()).toEqual([]);
    r.andar(2);
    expect(await modulo.apagarVencidas()).toEqual([id]);
    expect(await naLista()).toBeUndefined();
  });

  it('a página que ainda não foi lida segura a prévia; o filme com o card que já existia conta como enviado', async () => {
    const r = relogio();
    const ja = { filme: { id: 'recRivais1', title: 'Rivais (2024)' }, sessao: { id: 'recSessaoTQ', title: 'Tela Quente' }, data_de_exibicao: '2026-12-07T03:00:00.000Z', card_ID: 'cardRivais0001', link: 'https://trello.com/c/AbCd1234', labels: null };
    const { api, id, enviar, terminar, modulo } = await paraEnviar(
      [
        { titulo: 'RIVAIS', ano_de_producao: 2024, sessao: 'TELA QUENTE', data: '07/12/2026' },
        { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 },
      ],
      { filmes: [DESPEDIDA, filmeDoBanco('recRivais1', 'Rivais', 2024)], exibicoes: [ja], atracoes: SESSOES },
      {},
      ENVIO,
      { 3: [{ titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 }] },
      () => r.agora,
    );
    expect(await (await enviar()).json()).toEqual({ enviando: 1 });
    await terminar();
    // a outra prévia: na página lida, o filme já tem card (o da primeira); a outra página nunca chegou
    const { id: pendente } = await criar(api, { nome: 'PREVIA_JANEIRO.pdf', hash: 'pendente01', paginas: [3, 5] });
    await api(`/api/filmes/previas/${pendente}/paginas/3`, { method: 'PUT', body: JSON.stringify(pagina(['DESPEDIDA EM GRANDE ESTILO'])) });
    const lida = await ate(api, pendente, (p) => p.paginas[0].estado === 'lida');
    expect((lida as unknown as { paginas: { filmes: FilmeEnviado[] }[] }).paginas[0].filmes[0].conferencia!.marca).toBe('trello');
    r.andar(61);
    expect(await modulo.apagarVencidas()).toEqual([id]);
    const lista = ((await (await api('/api/filmes/previas')).json()) as NaLista[]).map((p) => [p.id, p.diasParaApagar]);
    expect(lista).toEqual([[pendente, null]]);
  });

  it('a prévia lida sem nenhum filme não conta como enviada', async () => {
    const r = relogio();
    const { api, filmes } = await subir({ n8n: n8nFalso({ 2: { movies: [] } }), agora: () => r.agora });
    const { id } = await criar(api, { nome: 'PREVIA.pdf', hash: 'vazia01', paginas: [2] });
    await api(`/api/filmes/previas/${id}/paginas/2`, { method: 'PUT', body: JSON.stringify(pagina([])) });
    await ate(api, id, (p) => p.paginas[0].estado === 'lida');
    r.andar(400);
    expect(await filmes.apagarVencidas()).toEqual([]);
    expect(((await (await api('/api/filmes/previas')).json()) as NaLista[])[0]).toMatchObject({ id, diasParaApagar: null });
  });
});

/* ---------- ler a página de novo preserva as correções feitas à mão ---------- */
describe('aba Filmes: ler a página de novo preserva as correções feitas à mão', () => {
  it('o título corrigido fica no filme do mesmo pôster; o filme sem correção segue a leitura nova', async () => {
    const { abrir, mudar, reler } = await conferir([
      { titulo: 'KONG ILHA DA CAVERA', ano_de_producao: 2017 },
      { titulo: 'RIVAIS', ano_de_producao: 2024 },
    ]);
    await mudar(0, { titulo: 'KONG: A ILHA DA CAVEIRA' });
    await reler([
      { titulo: 'KONG ILHA DA CAVERNA', ano_de_producao: 2016, data: '06/12/2026' },
      { titulo: 'RIVAIS', ano_de_producao: 2023, sessao: 'TELA QUENTE' },
    ]);
    const [kong, rivais] = await abrir();
    expect(kong).toMatchObject({ titulo: 'KONG: A ILHA DA CAVEIRA', ano: 2016, data: '06/12/2026', poster: 0 });
    expect(rivais).toMatchObject({ titulo: 'RIVAIS', ano: 2023, sessao: 'TELA QUENTE', poster: 1 });
  });

  it('as escolhas de "qual filme?" e de "ano diferente" ficam no filme do mesmo pôster', async () => {
    const banco = { filmes: [filmeDoBanco('recCorvo94', 'O Corvo', 1994), filmeDoBanco('recCorvo24', 'O Corvo', 2024), filmeDoBanco('recRivais1', 'Rivais', 2024)] };
    const { abrir, mudar, reler } = await conferir([{ titulo: 'O CORVO' }, { titulo: 'RIVAIS', ano_de_producao: 2023 }], banco);
    await mudar(0, { filme: 'recCorvo94' });
    await mudar(1, { ano: 2023 });
    await reler([{ titulo: 'O CORVO' }, { titulo: 'RIVAIS', ano_de_producao: 2023, data: '06/12/2026' }]);
    const [corvo, rivais] = await abrir();
    expect(corvo).toMatchObject({ escolha: { filme: 'recCorvo94' }, conferencia: { marca: 'ok', filme: { id: 'recCorvo94' } } });
    expect(rivais).toMatchObject({ data: '06/12/2026', escolha: { ano: 2023 }, conferencia: { marca: 'ok', ano: 2023 } });
  });

  it('o filme sem pôster é reconhecido pelo título', async () => {
    // a página tem dois pôsteres; o terceiro filme lido não tem o dele
    const { abrir, mudar, reler } = await conferir(
      [{ titulo: 'KONG', ano_de_producao: 2017 }, { titulo: 'RIVAIS', ano_de_producao: 2024 }, { titulo: 'O CORVO', ano_de_producao: 1994 }],
      {},
      ['KONG', 'RIVAIS'],
    );
    expect((await abrir())[2]).toMatchObject({ titulo: 'O CORVO', poster: null });
    await mudar(2, { titulo: 'O CORVO: A VINGANÇA' });
    // a leitura nova traz o Corvo primeiro e mais um filme sem pôster
    await reler([{ titulo: 'CORVO', ano_de_producao: 1995 }, { titulo: 'KONG', ano_de_producao: 2017 }, { titulo: 'RIVAIS', ano_de_producao: 2024 }, { titulo: 'TREZE VIDAS', ano_de_producao: 2022 }]);
    const filmes = await abrir();
    expect(filmes.map((f: { titulo: string; poster: number | null }) => [f.titulo, f.poster])).toEqual([
      ['KONG', 0],
      ['RIVAIS', 1],
      ['O CORVO: A VINGANÇA', null],
      ['TREZE VIDAS', null],
    ]);
    expect(filmes[2].ano).toBe(1995);
  });

  it('o filme que subiu da Sessão da Tarde continua em cima, com a sessão escolhida', async () => {
    const { abrir, mudar, reler } = await comFilmeNaTardePorEngano();
    await mudar(1, { subir: true });
    await mudar(1, { sessao: 'Cinemaço' });
    // a leitura nova põe o filme na Sessão da Tarde de novo
    await reler({ 0: { ano_de_producao: 2018 } });
    const { filmes } = await abrir();
    expect(filmes[0]).toMatchObject({ titulo: 'DESPEDIDA EM GRANDE ESTILO', ano: 2018 });
    expect(filmes[1]).toMatchObject({ titulo: 'UM SONHO DE LIBERDADE', subiu: true, sessao: 'CINEMAÇO', data: '06/12/2026', conferencia: { marca: 'ok' } });
  });

  it('o filme enviado continua enviado, com o card e o link, e não vai de novo; o erro do envio fica', async () => {
    let recusar = true;
    const { enviar, terminar, reler, filmes, falsos } = await paraEnviar(
      [
        { titulo: 'RIVAIS', ano_de_producao: 2024, sessao: 'TELA QUENTE', data: '07/12/2026' },
        { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 },
      ],
      { filmes: [DESPEDIDA, filmeDoBanco('recRivais1', 'Rivais', 2024)], atracoes: SESSOES },
      { falharCard: (nome) => recusar && nome.includes('RIVAIS') },
    );
    await enviar();
    const [, enviada] = await terminar();
    // a leitura nova lê a Despedida em outra sessão: o que foi para o Trello não muda
    await reler([
      { titulo: 'RIVAIS', ano_de_producao: 2024, sessao: 'TELA QUENTE', data: '07/12/2026' },
      { titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017, sessao: 'CORUJÃO' },
    ]);
    const [rivais, despedida] = await filmes();
    expect(despedida).toMatchObject({ sessao: 'SUPERCINE', envio: enviada.envio, conferencia: { marca: 'trello', link: enviada.envio!.link } });
    expect(rivais.envio).toMatchObject({ estado: 'erro' });
    expect(rivais.envio!.erro).toMatch(/401/);

    recusar = false;
    expect(await (await enviar()).json()).toEqual({ enviando: 1 });
    await terminar();
    expect(falsos.cards().map((c) => c.card.name)).toEqual(['SUPERCINE 05/12 - DESPEDIDA EM GRANDE ESTILO (2017)', 'TELA QUENTE 07/12 - RIVAIS (2024)']);
  });

  it('o filme com correção que a leitura nova não trouxe fica com um !; a pessoa decide se ele fica ou sai', async () => {
    const { abrir, mudar, reler } = await conferir(
      [{ titulo: 'KONG', ano_de_producao: 2017 }, { titulo: 'RIVAIS', ano_de_producao: 2024 }, { titulo: 'O CORVO' }, { titulo: 'TREZE VIDAS' }, { titulo: 'LUCA' }],
      { filmes: [filmeDoBanco('recCorvo94', 'O Corvo', 1994), filmeDoBanco('recCorvo24', 'O Corvo', 2024)] },
      ['KONG', 'RIVAIS'],
    );
    await mudar(2, { filme: 'recCorvo94' });
    await mudar(3, { titulo: 'TREZE VIDAS: O RESGATE' });
    // a leitura nova não traz o Corvo, Treze Vidas e Luca; o Luca não tinha correção e some
    await reler([{ titulo: 'KONG', ano_de_producao: 2017 }, { titulo: 'RIVAIS', ano_de_producao: 2024 }]);
    let filmes = await abrir();
    expect(filmes.map((f: { titulo: string }) => f.titulo)).toEqual(['KONG', 'RIVAIS', 'O CORVO', 'TREZE VIDAS: O RESGATE']);
    expect(filmes[0].naoAchado).toBeUndefined();
    expect(filmes[2]).toMatchObject({ naoAchado: true, escolha: { filme: 'recCorvo94' }, conferencia: { marca: 'atencao', pergunta: 'nao-achado' } });
    expect(filmes[3]).toMatchObject({ naoAchado: true, conferencia: { marca: 'atencao', pergunta: 'nao-achado' } });

    // sai: some da página
    const saiu = await mudar(3, { sai: true });
    expect(saiu.status).toBe(200);
    expect(await saiu.json()).toEqual({ saiu: true });
    // fica: perde o ! e volta a ser um filme como os outros, com a correção
    const ficou = await mudar(2, { fica: true });
    expect((await ficou.json()).filme).toMatchObject({ titulo: 'O CORVO', escolha: { filme: 'recCorvo94' }, conferencia: { marca: 'ok', filme: { id: 'recCorvo94' } } });
    filmes = await abrir();
    expect(filmes.map((f: { titulo: string }) => f.titulo)).toEqual(['KONG', 'RIVAIS', 'O CORVO']);
    expect(filmes[2].naoAchado).toBeUndefined();
    // só o filme não achado pode sair ou ficar
    expect((await mudar(0, { sai: true })).status).toBe(409);
  });

  it('o filme enviado que a leitura nova não trouxe segura a prévia até a pessoa decidir', async () => {
    const r = { agora: Date.parse('2026-11-10T15:00:00Z') };
    const { api, id, enviar, terminar, reler, filmes, falsos } = await paraEnviar(
      [{ titulo: 'DESPEDIDA EM GRANDE ESTILO', ano_de_producao: 2017 }],
      { filmes: [DESPEDIDA], atracoes: SESSOES },
      {},
      ENVIO,
      {},
      () => r.agora,
    );
    const diasParaApagar = async () => ((await (await api('/api/filmes/previas')).json()) as { id: string; diasParaApagar: number | null }[]).find((p) => p.id === id)!.diasParaApagar;
    await enviar();
    const [enviada] = await terminar();
    expect(await diasParaApagar()).toBe(60);
    await reler([]);
    const [despedida] = await filmes();
    expect(despedida).toMatchObject({ naoAchado: true, envio: enviada.envio, conferencia: { marca: 'atencao', pergunta: 'nao-achado' } });
    expect(await diasParaApagar()).toBeNull();
    // o ! não manda de novo
    expect(await (await enviar()).json()).toEqual({ enviando: 0 });

    const ficou = await api(`/api/filmes/previas/${id}/paginas/2/filmes/0`, { method: 'PATCH', body: JSON.stringify({ fica: true }) });
    expect((await ficou.json()).filme).toMatchObject({ envio: enviada.envio, conferencia: { marca: 'trello', link: enviada.envio!.link } });
    expect(await diasParaApagar()).toBe(60);
    expect(falsos.cards()).toHaveLength(1);
  });
});
