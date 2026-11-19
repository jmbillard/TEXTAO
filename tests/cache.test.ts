// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import WebSocket from 'ws';
// @ts-expect-error módulo JS sem tipos
import { criarCache } from '../servidor/cache.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const temRedis = spawnSync('redis-server', ['--version']).status === 0;
const PORTA = 6390 + Math.floor(Math.random() * 400);
let redis: ChildProcess | null = null;

beforeAll(async () => {
  if (!temRedis) return;
  redis = spawn('redis-server', ['--port', String(PORTA), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  // espera o Redis aceitar conexão (um tempo fixo falhava com a máquina carregada)
  for (let i = 0; i < 50; i++) {
    const pronto = await new Promise<boolean>((ok) => {
      const c = connect(PORTA, '127.0.0.1', () => (c.end(), ok(true)));
      c.on('error', () => ok(false));
    });
    if (pronto) break;
    await esperar(100);
  }
});
afterAll(() => redis?.kill());

describe('cache em memória (sem REDIS_URL)', () => {
  it('guarda com prazo e avisa quem assinou', async () => {
    const cache = criarCache({});
    expect(cache.tipo).toBe('memória');
    await cache.guardar('a', { x: 1 }, 60);
    expect(await cache.ler('a')).toEqual({ x: 1 });
    await cache.guardar('curto', 1, 0.05);
    await esperar(80);
    expect(await cache.ler('curto')).toBeUndefined();
    const recebidos: unknown[] = [];
    const parar = cache.assinar('fila', (m: unknown) => recebidos.push(m));
    await cache.publicar('fila', { tipo: 'criado', id: 'x' });
    parar();
    await cache.publicar('fila', { tipo: 'criado', id: 'y' });
    expect(recebidos).toEqual([{ tipo: 'criado', id: 'x' }]);
  });
  it('Redis fora do ar não derruba nada: segue em memória', async () => {
    const cache = criarCache({ REDIS_URL: 'redis://127.0.0.1:1' });
    await cache.ligando;
    expect(cache.tipo).toBe('memória');
    await cache.guardar('k', 'v', 60);
    expect(await cache.ler('k')).toBe('v');
    await cache.fechar();
  });
});

describe.skipIf(!temRedis)('com Redis de verdade', () => {
  it('o que uma instância guarda, a outra lê; o aviso chega nas duas', async () => {
    const env = { REDIS_URL: `redis://127.0.0.1:${PORTA}` };
    const [a, b] = [criarCache(env), criarCache(env)];
    await Promise.all([a.ligando, b.ligando]);
    expect([a.tipo, b.tipo]).toEqual(['redis', 'redis']);
    await a.guardar('vocabulario', { programas: ['Festa'] }, 60);
    expect(await b.ler('vocabulario')).toEqual({ programas: ['Festa'] });
    const emA: unknown[] = [];
    const emB: unknown[] = [];
    a.assinar('fila', (m: unknown) => emA.push(m));
    b.assinar('fila', (m: unknown) => emB.push(m));
    await esperar(150);
    await a.publicar('fila', { tipo: 'alterado', id: 'r1' });
    await esperar(200);
    expect(emA).toEqual([{ tipo: 'alterado', id: 'r1' }]);
    expect(emB).toEqual([{ tipo: 'alterado', id: 'r1' }]);
    await Promise.all([a.fechar(), b.fechar()]);
  });

  it('fila ao vivo: o roteiro subido numa instância avisa quem está na outra', async () => {
    const env = { REDIS_URL: `redis://127.0.0.1:${PORTA}` };
    const db = abrirBanco(':memory:');
    const subir = async () => {
      const app = criarApp({ db, env });
      await app.cache.ligando;
      const s: Server = createServer(app);
      s.on('upgrade', app.upgrade);
      await new Promise<void>((ok) => s.listen(0, ok));
      return { app, s, base: `http://localhost:${(s.address() as { port: number }).port}` };
    };
    const [um, dois] = [await subir(), await subir()];
    try {
      const recebidos: { tipo: string; id?: string; por?: string; pessoas?: { email: string }[] }[] = [];
      const ws = new WebSocket(dois.base.replace('http', 'ws') + '/api/eventos', { headers: { 'cf-access-authenticated-user-email': 'beto@empresa.com' } });
      ws.on('message', (m) => recebidos.push(JSON.parse(String(m))));
      await new Promise((ok, erro) => (ws.on('open', ok), ws.on('error', erro)));
      await esperar(150);
      const corpo = { roteiro: { meta: { claquete: 'FESTA 1/1' }, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }, nArtes: 2 };
      const r = await fetch(um.base + '/api/roteiros/ao-vivo-01', {
        method: 'PUT',
        headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com', 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      expect(r.status).toBeLessThan(300);
      // salvar de novo sem mudar o que a fila mostra não gera aviso
      await fetch(um.base + '/api/roteiros/ao-vivo-01', {
        method: 'PUT',
        headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com', 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      await esperar(300);
      ws.close();
      expect(recebidos.filter((e) => e.tipo !== 'presenca')).toEqual([{ tipo: 'criado', id: 'ao-vivo-01', por: 'ana@empresa.com' }]);
      expect(recebidos.find((e) => e.tipo === 'presenca')?.pessoas).toEqual([{ nome: 'Beto', email: 'beto@empresa.com' }]);
    } finally {
      for (const { app, s } of [um, dois]) {
        s.close();
        await app.fechar();
      }
    }
  });
});
