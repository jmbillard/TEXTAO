// @vitest-environment node
/* A prévia de filmes que chega por e-mail (#157): o n8n pega o PDF do e-mail e manda para POST /api/publico/filmes/previa,
   fora do login, com o FILMES_PREVIA_TOKEN no cabeçalho. O PROMeiro só guarda o arquivo, como prévia "por preparar"; o
   navegador prepara na primeira vez que alguém abre, pelo mesmo caminho da subida à mão (a mesma impressão SHA-256). A
   leitura por IA é falsa e não é chamada aqui; os PDFs são de mentira (só começam com %PDF-). */
import { createServer, request, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarFilmes } from '../servidor/filmes.mjs';

const TOKEN = 'token-da-previa-ficticio';
const ENV = { ACESSO: 'privado', N8N_FILMES_LER: 'http://n8n:5678/webhook/ler-pagina', FILMES_INTERVALO_MS: '0', FILMES_PREVIA_TOKEN: TOKEN, PROMEIRO_URL: 'https://promeiro.exemplo.com/' };
const PDF = Buffer.from('%PDF-1.7\nprévia fictícia de dezembro\n%%EOF');
const impressao = (b: Buffer) => createHash('sha256').update(b).digest('hex');

let servidores: Server[] = [];
afterEach(() => {
  for (const s of servidores) s.close();
  servidores = [];
});

async function subir({ env = ENV as Record<string, string> } = {}) {
  const db = abrirBanco(':memory:');
  const pasta = mkdtempSync(join(tmpdir(), 'previas-email-'));
  const leituras: unknown[] = [];
  const buscar = async (...a: unknown[]) => (leituras.push(a), new Promise(() => {}));
  const filmes = criarFilmes(env, { db, pasta, buscar });
  const servidor = createServer(criarApp({ db, env, filmes }));
  servidores.push(servidor);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const api = (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana.lima@empresa.com', 'content-type': 'application/json', ...init.headers } });
  /** O pedido do n8n: o multipart com o PDF (campo pdf, com o nome do arquivo) e a hora em que o e-mail chegou. */
  const mandar = ({ pdf = PDF as Buffer | string, nome = 'PRÉVIA DEZEMBRO 2026.pdf', chegouEm = '2026-11-27T09:12:00-03:00', token = TOKEN as string | null, tipo = 'application/pdf' } = {}) => {
    const form = new FormData();
    form.append('pdf', new Blob([pdf as BlobPart], { type: tipo }), nome);
    if (chegouEm) form.append('chegou_em', chegouEm);
    return fetch(`${base}/api/publico/filmes/previa`, { method: 'POST', headers: token === null ? {} : { authorization: `Bearer ${token}` }, body: form });
  };
  return { base, api, mandar, pasta, leituras };
}

describe('a prévia que chega por e-mail (#157)', () => {
  it('com o token, guarda o PDF e cria a prévia por preparar, com a origem e-mail e o link da aba Filmes', async () => {
    const { api, mandar, pasta, leituras } = await subir();
    const r = await mandar();
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toEqual({ id: expect.any(String), existente: false, correcao: false, nome: 'PRÉVIA DEZEMBRO 2026.pdf', link: 'https://promeiro.exemplo.com/#/filmes' });
    expect(existsSync(join(pasta, corpo.id, 'previa.pdf'))).toBe(true);

    const lista = await (await api('/api/filmes/previas')).json();
    expect(lista).toEqual([expect.objectContaining({ id: corpo.id, nome: 'PRÉVIA DEZEMBRO 2026.pdf', por: '', origem: 'email', porPreparar: true, paginas: 0, criada: '2026-11-27T12:12:00.000Z' })]);
    const aberta = await (await api(`/api/filmes/previas/${corpo.id}`)).json();
    expect(aberta).toMatchObject({ origem: 'email', porPreparar: true, paginas: [] });
    // o PDF inteiro, para o navegador preparar (com o login)
    const baixado = await api(`/api/filmes/previas/${corpo.id}/pdf`);
    expect(baixado.status).toBe(200);
    expect(baixado.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await baixado.arrayBuffer()).equals(PDF)).toBe(true);
    // nada foi para a leitura: quem prepara é o navegador
    expect(leituras).toEqual([]);
  });

  it('o navegador prepara pelo caminho da subida à mão: a mesma impressão acha a prévia e cria as páginas', async () => {
    const { api, mandar } = await subir();
    const { id } = await (await mandar()).json();
    const criada = await (await api('/api/filmes/previas', { method: 'POST', body: JSON.stringify({ nome: 'PRÉVIA DEZEMBRO 2026.pdf', hash: impressao(PDF), paginas: [2, 3] }) })).json();
    expect(criada).toEqual({ id, existente: true });
    const aberta = await (await api(`/api/filmes/previas/${id}`)).json();
    expect(aberta.paginas.map((p: { numero: number; estado: string }) => [p.numero, p.estado])).toEqual([[2, 'esperando'], [3, 'esperando']]);
    // com páginas esperando, ela ainda está por preparar (a preparação caiu no meio, ou ainda está indo)
    expect(aberta.porPreparar).toBe(true);
    const pagina = { pdf: Buffer.from('%PDF-p').toString('base64'), imagem: Buffer.from('jpg').toString('base64'), tamanho: { width: 10, height: 10 }, posteres: [], textos: [], vagas: [] };
    for (const n of [2, 3]) expect((await api(`/api/filmes/previas/${id}/paginas/${n}`, { method: 'PUT', body: JSON.stringify(pagina) })).status).toBe(200);
    const lista = await (await api('/api/filmes/previas')).json();
    expect(lista[0]).toMatchObject({ id, origem: 'email', porPreparar: false, paginas: 2 });
  });

  it('o mesmo PDF de novo responde "repetida" e não cria nada; um PDF diferente vira outra prévia, ao lado', async () => {
    const { api, mandar } = await subir();
    const primeira = await (await mandar()).json();
    const repetida = await mandar({ nome: 'PRÉVIA DEZEMBRO 2026 (1).pdf', chegouEm: '2026-11-28T09:00:00-03:00' });
    expect(repetida.status).toBe(200);
    expect(await repetida.json()).toEqual({ id: primeira.id, existente: true, correcao: false, nome: 'PRÉVIA DEZEMBRO 2026.pdf', link: 'https://promeiro.exemplo.com/#/filmes' });
    expect(await (await api('/api/filmes/previas')).json()).toHaveLength(1);

    // a prévia corrigida (o mesmo nome, outro PDF): outra prévia, marcada como correção da que já estava
    const corrigida = await (await mandar({ pdf: Buffer.concat([PDF, Buffer.from('\ncorrigida')]), nome: 'Prévia Dezembro 2026 (1).pdf' })).json();
    expect(corrigida).toMatchObject({ existente: false, correcao: true, nome: 'Prévia Dezembro 2026 (1).pdf' });
    expect(corrigida.id).not.toBe(primeira.id);
    const lista = await (await api('/api/filmes/previas')).json();
    expect(lista.map((p: { id: string }) => p.id).sort()).toEqual([primeira.id, corrigida.id].sort());
    expect(lista.find((p: { id: string }) => p.id === corrigida.id).corrige).toBe(primeira.id);
    expect(lista.find((p: { id: string }) => p.id === primeira.id).corrige).toBeNull();
    // outro mês não é correção
    expect(await (await mandar({ pdf: Buffer.concat([PDF, Buffer.from('\njaneiro')]), nome: 'PRÉVIA JANEIRO 2027.pdf' })).json()).toMatchObject({ existente: false, correcao: false });
    expect(lista.every((p: { porPreparar: boolean }) => p.porPreparar)).toBe(true);
  });

  it('o PDF que já foi subido à mão responde "repetida"', async () => {
    const { api, mandar } = await subir();
    const amao = await (await api('/api/filmes/previas', { method: 'POST', body: JSON.stringify({ nome: 'PREVIA_DEZEMBRO.pdf', hash: impressao(PDF), paginas: [2] }) })).json();
    expect(await (await mandar()).json()).toMatchObject({ id: amao.id, existente: true, nome: 'PREVIA_DEZEMBRO.pdf' });
    const lista = await (await api('/api/filmes/previas')).json();
    expect(lista).toEqual([expect.objectContaining({ id: amao.id, por: 'Ana Lima', origem: 'navegador', porPreparar: false })]);
  });

  it('sem o token, ou com o errado, 401; sem o FILMES_PREVIA_TOKEN no Portainer, a rota fica desligada (404)', async () => {
    const { mandar, api } = await subir();
    expect((await mandar({ token: null })).status).toBe(401);
    expect((await mandar({ token: 'token-errado' })).status).toBe(401);
    expect((await mandar({ token: `${TOKEN.slice(0, -1)}X` })).status).toBe(401);
    expect(await (await api('/api/filmes/previas')).json()).toEqual([]);
    const desligada = await subir({ env: { ...ENV, FILMES_PREVIA_TOKEN: '' } });
    expect((await desligada.mandar()).status).toBe(404);
    expect((await desligada.mandar({ token: '' })).status).toBe(404);
    const semVariavel = await subir({ env: { ACESSO: 'privado', N8N_FILMES_LER: ENV.N8N_FILMES_LER } });
    expect((await semVariavel.mandar()).status).toBe(404);
  });

  it('com a aba Filmes desligada, 503', async () => {
    const { mandar } = await subir({ env: { ACESSO: 'privado', FILMES_PREVIA_TOKEN: TOKEN } });
    expect((await mandar()).status).toBe(503);
  });

  it('recusa o corpo que não é PDF (400) e o grande demais (413)', async () => {
    const { mandar, api, base } = await subir();
    expect((await mandar({ pdf: 'isto não é um pdf' })).status).toBe(400);
    expect((await mandar({ pdf: '' })).status).toBe(400);
    // sem o campo pdf
    const form = new FormData();
    form.append('outro', new Blob([PDF]), 'PRÉVIA.pdf');
    expect((await fetch(`${base}/api/publico/filmes/previa`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: form })).status).toBe(400);
    // o PDF cru, fora do multipart
    expect((await fetch(`${base}/api/publico/filmes/previa`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/pdf' }, body: PDF })).status).toBe(400);
    // a hora do e-mail que não é uma data
    expect((await mandar({ chegouEm: 'ontem' })).status).toBe(400);
    const grande = await mandar({ pdf: Buffer.concat([PDF, Buffer.alloc(31 * 1024 * 1024)]) });
    expect(grande.status).toBe(413);
    expect(await (await api('/api/filmes/previas')).json()).toEqual([]);
  });

  it('o caminho torto não guarda nada nem chega às rotas com login, nem com o token', async () => {
    const { base, api } = await subir();
    const cru = (caminho: string, metodo = 'POST') =>
      new Promise<number>((ok, falhou) => {
        const r = request(base + '/', { path: caminho, method: metodo, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'cf-access-authenticated-user-email': 'ana.lima@empresa.com' } }, (resposta) => (resposta.resume(), ok(resposta.statusCode ?? 0)));
        r.on('error', falhou);
        r.end(JSON.stringify({ nome: 'x.pdf', hash: 'abcdef123', paginas: [1] }));
      });
    for (const caminho of [
      '/api/publico/filmes/previa/%2e%2e/%2e%2e/%2e%2e/filmes/previas',
      '/api/publico/filmes/%2e%2e/filmes/previa',
      '/api/publico//filmes/previa',
      '/API/publico/filmes/previa',
      '/api/publico/filmes/previa/',
      '/api/publico/filmes/previas',
      '/api/publico/%2e%2e/filmes/previas',
    ])
      expect(await cru(caminho), caminho).toBe(404);
    expect(await cru('/api/publico/filmes/previa', 'GET')).toBe(404);
    expect(await (await api('/api/filmes/previas')).json()).toEqual([]);
  });
});
