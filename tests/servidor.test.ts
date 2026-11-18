// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, fazerBackup } from '../servidor/app.mjs';

let servidor: Server;
let base = '';
const db = abrirBanco(':memory:');
const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
  fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
const ana = como('Ana.Lima@empresa.com');
const beto = como('beto@empresa.com');
const roteiro = (texto: string, publico = false) => ({
  roteiro: { meta: { titulo: 'Teste' }, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texto }] }] }, publico },
  nArtes: 1,
});
const salvar = (quem: typeof ana, id: string, corpo: object) => quem(`/api/roteiros/${id}`, { method: 'PUT', body: JSON.stringify(corpo) });

beforeAll(async () => {
  servidor = createServer(criarApp({ db, env: {} }));
  await new Promise<void>((ok) => servidor.listen(0, ok));
  base = `http://localhost:${(servidor.address() as { port: number }).port}`;
});
afterAll(() => servidor.close());

describe('servidor', () => {
  it('identifica pelo e-mail do Access e recusa quem não entrou', async () => {
    expect(await (await ana('/api/eu')).json()).toMatchObject({ email: 'ana.lima@empresa.com', nome: 'Ana Lima' });
    expect((await fetch(base + '/api/roteiros')).status).toBe(401);
    expect((await fetch(base + '/api/roteiros', { headers: { 'x-perfil-email': 'x@y.com' } })).status).toBe(401);
  });

  it('cada pessoa só vê o próprio roteiro', async () => {
    expect((await salvar(ana, 'roteiro-da-ana', roteiro('A'))).status).toBe(200);
    expect(await (await ana('/api/roteiros')).json()).toHaveLength(1);
    expect(await (await beto('/api/roteiros')).json()).toHaveLength(0);
    expect((await beto('/api/roteiros/roteiro-da-ana')).status).toBe(404);
    expect((await beto('/api/roteiros/roteiro-da-ana/versoes')).status).toBe(404);
  });

  it('público: os outros leem, mas não alteram nem apagam', async () => {
    await salvar(ana, 'roteiro-da-ana', roteiro('A', true));
    const lista = await (await beto('/api/roteiros')).json();
    expect(lista).toMatchObject([{ id: 'roteiro-da-ana', publico: true, meu: false, dono: { nome: 'Ana Lima' } }]);
    expect((await beto('/api/roteiros/roteiro-da-ana')).status).toBe(200);
    expect((await salvar(beto, 'roteiro-da-ana', roteiro('invadido'))).status).toBe(403);
    expect((await beto('/api/roteiros/roteiro-da-ana', { method: 'DELETE' })).status).toBe(404);
    expect((await beto('/api/roteiros/roteiro-da-ana/versoes')).status).toBe(404);
    // voltar a privado esconde de novo
    await salvar(ana, 'roteiro-da-ana', roteiro('A', false));
    expect((await beto('/api/roteiros/roteiro-da-ana')).status).toBe(404);
  });

  it('guarda versões nos marcos e não repete conteúdo igual', async () => {
    await salvar(ana, 'com-historico', roteiro('um'));
    await salvar(ana, 'com-historico', roteiro('dois')); // menos de 5 min: não vira versão
    await salvar(ana, 'com-historico', { ...roteiro('três'), marco: 'exportou' });
    await salvar(ana, 'com-historico', { ...roteiro('três'), marco: 'exportou' }); // igual: não repete
    const versoes = await (await ana('/api/roteiros/com-historico/versoes')).json();
    expect(versoes.map((v: { n: number; motivo: string }) => [v.n, v.motivo])).toEqual([[2, 'exportou'], [1, 'criação']]);
    const v1 = await (await ana('/api/roteiros/com-historico/versoes/1')).json();
    expect(v1.doc.content[0].content[0].text).toBe('um');
  });

  it('apagar leva o histórico junto', async () => {
    expect((await ana('/api/roteiros/com-historico', { method: 'DELETE' })).status).toBe(200);
    expect((await ana('/api/roteiros/com-historico')).status).toBe(404);
  });

  it('backup diário em arquivo próprio', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'roteirista-'));
    expect(fazerBackup(db, pasta)).toMatch(/roteirista-\d{4}-\d{2}-\d{2}\.db$/);
    expect(fazerBackup(db, pasta)).toBeNull();
    expect(readdirSync(pasta)).toHaveLength(1);
  });
});
