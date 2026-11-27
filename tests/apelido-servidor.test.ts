// @vitest-environment node
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, fazerBackup } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { comTabelas } from '../servidor/tabelas-do-teable.mjs';

/* O apelido da claquete e as versões lidas do roteiro (#120) pela API: o apelido fica no SQLite do PROMeiro (e no
   backup), qualquer pessoa logada dá e tira, e o envio ao Trello e ao Teable continua com a claquete original. Trello e
   Teable falsos; claquetes, ids e endereços inventados. */

const ENV = {
  ACESSO: 'aberto',
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_LISTA: 'listaG5',
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_ARTE_PRODUCAO: 'tblProducao',
  ...comTabelas({ ARTE_producao: 'producao' }),
};
const semDescoberta = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' });

/** Trello e Teable (a API) de mentira, num fetch só: cada pedido fica em `pedidos`. */
function falsos() {
  const pedidos: { metodo: string; url: URL; corpo: unknown }[] = [];
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    pedidos.push({ metodo, url, corpo: typeof init.body === 'string' ? JSON.parse(init.body) : null });
    const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '', arrayBuffer: async () => new ArrayBuffer(4) });
    if (url.host === 'teable:3000') return ok({ records: [{ id: 'rec1' }] });
    if (url.pathname === '/1/cards' && metodo === 'POST') return ok({ id: 'card1', shortUrl: 'https://trello.com/c/CARD1' });
    return ok({});
  };
  return { buscar, consultar: async () => [], pedidos };
}

let fechar: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(fechar.map((f) => f()));
  fechar = [];
});

async function subir({ db = abrirBanco(':memory:'), trello = undefined as unknown } = {}) {
  const app = criarApp({ db, env: ENV, buscarNoTeable: semDescoberta, ...(trello ? { trello } : {}) });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  fechar.push(async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await app.fechar?.();
  });
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  return { base, db, ana: como('ana@empresa.com'), beto: como('beto@empresa.com') };
}

const P = (texto: string, arte?: string) => ({ type: 'paragraph', content: [{ type: 'text', text: texto, ...(arte ? { marks: [{ type: 'arte', attrs: { id: arte } }] } : {}) }] });
const roteiro = (claquete: string, artes: string[]) => ({
  roteiro: { meta: { claquete }, doc: { type: 'doc', content: [P('LOC: o programa fictício.'), ...artes.map((a, i) => P(a, `a${i}`))] } },
  nArtes: artes.length,
});
const darApelido = (quem: (c: string, i?: RequestInit) => Promise<Response>, roteiroId: string, apelido: string) => quem('/api/apelidos', { method: 'PUT', body: JSON.stringify({ roteiro: roteiroId, apelido }) });
const guardar = (quem: (c: string, i?: RequestInit) => Promise<Response>, id: string, claquete: string, artes: string[] = []) => quem(`/api/roteiros/${id}`, { method: 'PUT', body: JSON.stringify(roteiro(claquete, artes)) });

describe('o apelido da claquete, um por roteiro', () => {
  it('qualquer pessoa logada dá o apelido; todos leem, com a claquete original do roteiro; quem não entrou não vê', async () => {
    const { base, ana, beto } = await subir();
    await guardar(ana, 'rot-apelido-1', 'Show Fictício 25/11 (A)');
    expect(await (await ana('/api/apelidos')).json()).toEqual([]);
    expect((await darApelido(beto, 'rot-apelido-1', 'Show Fictício 25/11 (H)')).status).toBe(200);
    expect(await (await ana('/api/apelidos')).json()).toMatchObject([{ roteiro: 'rot-apelido-1', original: 'Show Fictício 25/11 (A)', apelido: 'Show Fictício 25/11 (H)', por: 'Beto', producoes: [], cards: [] }]);
    expect((await fetch(`${base}/api/apelidos`)).status).toBe(401);
  });

  it('dois roteiros com a mesma claquete têm cada um o seu apelido', async () => {
    const { ana } = await subir();
    await guardar(ana, 'rot-apelido-1', 'Show Fictício 25/11 (A)');
    await guardar(ana, 'rot-apelido-2', 'Show Fictício 25/11 (A)');
    await darApelido(ana, 'rot-apelido-1', 'Um');
    expect((await (await ana('/api/apelidos')).json()).map((a: { roteiro: string; apelido: string }) => [a.roteiro, a.apelido])).toEqual([['rot-apelido-1', 'Um']]);
  });

  it('trocar grava por cima; "voltar ao original" (o apelido vazio ou igual à claquete) tira; apagar o roteiro leva junto', async () => {
    const { ana } = await subir();
    await guardar(ana, 'rot-apelido-1', 'Show Fictício 25/11 (A)');
    await darApelido(ana, 'rot-apelido-1', 'Primeiro');
    await darApelido(ana, 'rot-apelido-1', 'Segundo');
    expect((await (await ana('/api/apelidos')).json()).map((a: { apelido: string }) => a.apelido)).toEqual(['Segundo']);
    await darApelido(ana, 'rot-apelido-1', '');
    expect(await (await ana('/api/apelidos')).json()).toEqual([]);
    await darApelido(ana, 'rot-apelido-1', 'Terceiro');
    await darApelido(ana, 'rot-apelido-1', 'Show Fictício 25/11 (A)');
    expect(await (await ana('/api/apelidos')).json()).toEqual([]);
    await darApelido(ana, 'rot-apelido-1', 'Quarto');
    await ana('/api/roteiros/rot-apelido-1', { method: 'DELETE' });
    expect(await (await ana('/api/apelidos')).json()).toEqual([]);
  });

  it('vale para todas as Produções do roteiro, de todas as praças', async () => {
    const db = abrirBanco(':memory:');
    const { ana } = await subir({ db });
    await guardar(ana, 'rot-apelido-1', 'Show Fictício 25/11 (A)');
    const agora = new Date().toISOString();
    const producao = db.prepare("INSERT INTO producoes (id, claquete, praca, etapa, roteiro_id, criada_em, atualizada_em) VALUES (?, 'Show Fictício 25/11 (A)', ?, 'entrada', ?, ?, ?)");
    producao.run('prod-rj', 'RJ', 'rot-apelido-1', agora, agora);
    producao.run('prod-sp', 'SP', 'rot-apelido-1', agora, agora);
    producao.run('prod-outra', 'SP', null, agora, agora);
    await darApelido(ana, 'rot-apelido-1', 'Show Fictício, a estreia');
    expect((await (await ana('/api/apelidos')).json())[0].producoes).toEqual(['prod-rj', 'prod-sp']);
  });

  it('o pedido mal feito: o roteiro que não existe, o apelido longo demais e o método', async () => {
    const { ana } = await subir();
    await guardar(ana, 'rot-apelido-1', 'Show 25/11');
    expect((await darApelido(ana, 'nao-existe-1', 'Nome')).status).toBe(404);
    expect((await darApelido(ana, 'rot-apelido-1', 'x'.repeat(201))).status).toBe(400);
    expect((await ana('/api/apelidos', { method: 'POST', body: '{}' })).status).toBe(405);
  });

  it('o apelido entra no backup', async () => {
    const db = abrirBanco(':memory:');
    const { ana } = await subir({ db });
    await guardar(ana, 'rot-apelido-1', 'Show Fictício 25/11 (A)');
    await darApelido(ana, 'rot-apelido-1', 'Show Fictício 25/11 (H)');
    const destino = fazerBackup(db, mkdtempSync(join(tmpdir(), 'promeiro-apelido-')));
    const copia = new DatabaseSync(destino);
    expect(copia.prepare('SELECT roteiro_id, apelido FROM apelidos').all()).toEqual([{ roteiro_id: 'rot-apelido-1', apelido: 'Show Fictício 25/11 (H)' }]);
    copia.close();
  });

  it('o envio ao Trello e o registro no Teable levam a claquete original, não o apelido; o card do envio vem com o apelido', async () => {
    const f = falsos();
    const trello = (e: Record<string, string>, d: object) => criarTrello({ ...e, tabelas: ENV.tabelas }, { ...d, buscar: f.buscar, consultar: f.consultar, sftp: async () => {} });
    const { ana } = await subir({ trello });
    await guardar(ana, 'rot-apelido-1', 'Festa Fictícia 19/11 (A)', ['HOJE, 22H']);
    await darApelido(ana, 'rot-apelido-1', 'Festa Fictícia 19/11 (H)');
    const r = await (await ana('/api/roteiros/rot-apelido-1/trello', { method: 'POST', body: JSON.stringify({ artes: ['HOJE, 22H'], texto: 'x' }) })).json();
    expect(r.estado).toBe('enviado');
    const card = f.pedidos.find((p) => p.metodo === 'POST' && p.url.pathname === '/1/cards')!;
    expect(card.url.searchParams.get('name') ?? (card.corpo as { name: string }).name).toMatch(/19\/11 ?\(A\)$/);
    const registro = f.pedidos.find((p) => p.url.pathname === '/api/table/tblProducao/record')!.corpo as { records: { fields: { claquete: string } }[] };
    expect(registro.records[0].fields.claquete).toMatch(/^Festa Fictícia 19\/11 ?\(A\)$/);
    // o apelido continua só no PROMeiro, e vale também para o card do envio
    expect(JSON.stringify(f.pedidos)).not.toContain('19/11 (H)');
    expect((await (await ana('/api/apelidos')).json())[0]).toMatchObject({ roteiro: 'rot-apelido-1', cards: ['card1'] });
  });
});

describe('as versões lidas do roteiro', () => {
  it('saem das artes do roteiro guardado e vêm na fila, com as etiquetas', async () => {
    const { ana } = await subir();
    await ana('/api/roteiros/rot-versoes-1', { method: 'PUT', body: JSON.stringify(roteiro('Show Fictício 25/11 (A)', ['HOJE, 22H30', 'AMANHÃ', 'AO VIVO'])) });
    const [r] = await (await ana('/api/roteiros')).json();
    expect(r.versoesLidas).toEqual([
      { codigo: 'A', rotulo: 'amanhã', conhecida: true },
      { codigo: 'H', rotulo: 'hoje', conhecida: true },
    ]);
    // a arte desmarcada sai, e a versão com ela
    await ana('/api/roteiros/rot-versoes-1', { method: 'PUT', body: JSON.stringify(roteiro('Show Fictício 25/11 (A)', ['AO VIVO'])) });
    expect((await (await ana('/api/roteiros')).json())[0].versoesLidas).toEqual([]);
  });
});
