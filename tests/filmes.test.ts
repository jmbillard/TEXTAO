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

let servidores: Server[] = [];
afterEach(() => {
  for (const s of servidores) s.close();
  servidores = [];
});
async function subir({ db = abrirBanco(':memory:'), env = ENV, n8n = n8nFalso({}), pasta = mkdtempSync(join(tmpdir(), 'previas-')) } = {}) {
  const filmes = criarFilmes(env, { db, pasta, buscar: n8n.buscar });
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
