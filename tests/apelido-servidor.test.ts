// @vitest-environment node
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
const darVersoes = (quem: (c: string, i?: RequestInit) => Promise<Response>, roteiroId: string, versoes: string) => quem('/api/apelidos', { method: 'PUT', body: JSON.stringify({ roteiro: roteiroId, versoes }) });
const guardar = (quem: (c: string, i?: RequestInit) => Promise<Response>, id: string, claquete: string, artes: string[] = []) => quem(`/api/roteiros/${id}`, { method: 'PUT', body: JSON.stringify(roteiro(claquete, artes)) });

describe('o apelido da claquete, um por claquete (#154)', () => {
  it('qualquer pessoa logada dá o apelido; todos leem, com a claquete original do roteiro; quem não entrou não vê', async () => {
    const { base, ana, beto } = await subir();
    await guardar(ana, 'rot-apelido-1', 'Show Fictício 25/11 (A)');
    expect(await (await ana('/api/apelidos')).json()).toEqual([]);
    expect((await darApelido(beto, 'rot-apelido-1', 'Show Fictício 25/11 (H)')).status).toBe(200);
    expect(await (await ana('/api/apelidos')).json()).toMatchObject([{ chave: 'SHOW FICTICIO 25 11', roteiros: ['rot-apelido-1'], original: 'Show Fictício 25/11 (A)', apelido: 'Show Fictício 25/11 (H)', por: 'Beto', producoes: [], cards: [] }]);
    expect((await fetch(`${base}/api/apelidos`)).status).toBe(401);
  });

  it('dois roteiros com a mesma claquete, em qualquer grafia e código, têm o mesmo apelido', async () => {
    const { ana } = await subir();
    await guardar(ana, 'rot-apelido-1', 'Show Fictício 25/11 (A)');
    await guardar(ana, 'rot-apelido-2', 'SHOW FICTICIO 25/11 (H)');
    await guardar(ana, 'rot-apelido-3', 'Outro Show 25/11');
    await darApelido(ana, 'rot-apelido-1', 'Um');
    expect((await (await ana('/api/apelidos')).json()).map((a: { roteiros: string[]; apelido: string }) => [a.roteiros, a.apelido])).toEqual([[['rot-apelido-1', 'rot-apelido-2'], 'Um']]);
  });

  it('trocar grava por cima; "voltar ao original" (o apelido vazio ou igual à claquete) tira; apagar o roteiro não leva junto', async () => {
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
    // o apelido é da claquete: fica, sem o roteiro
    expect(await (await ana('/api/apelidos')).json()).toMatchObject([{ apelido: 'Quarto', original: 'Show Fictício 25/11 (A)', roteiros: [] }]);
  });

  it('vale para todas as Produções da claquete, de todas as praças, com ou sem o roteiro', async () => {
    const db = abrirBanco(':memory:');
    const { ana } = await subir({ db });
    await guardar(ana, 'rot-apelido-1', 'Show Fictício 25/11 (A)');
    const agora = new Date().toISOString();
    const producao = db.prepare("INSERT INTO producoes (id, claquete, praca, etapa, roteiro_id, criada_em, atualizada_em) VALUES (?, 'Show Fictício 25/11 (A)', ?, 'entrada', ?, ?, ?)");
    producao.run('prod-rj', 'RJ', 'rot-apelido-1', agora, agora);
    producao.run('prod-sp', 'SP', 'rot-apelido-1', agora, agora);
    producao.run('prod-sem-roteiro', 'SP', null, agora, agora);
    db.prepare("INSERT INTO producoes (id, claquete, praca, etapa, roteiro_id, criada_em, atualizada_em) VALUES ('prod-outra', 'Outra Festa 25/11', 'SP', 'entrada', NULL, ?, ?)").run(agora, agora);
    await darApelido(ana, 'rot-apelido-1', 'Show Fictício, a estreia');
    expect((await (await ana('/api/apelidos')).json())[0].producoes).toEqual(['prod-rj', 'prod-sem-roteiro', 'prod-sp']);
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
    expect(copia.prepare('SELECT chave, original, apelido FROM apelidos').all()).toEqual([{ chave: 'SHOW FICTICIO 25 11', original: 'Show Fictício 25/11 (A)', apelido: 'Show Fictício 25/11 (H)' }]);
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
    expect((await (await ana('/api/apelidos')).json())[0]).toMatchObject({ roteiros: ['rot-apelido-1'], cards: ['card1'] });
  });
});

describe('as versões à mão no apelido (#152)', () => {
  it('a claquete sem código e sem versão no roteiro recebe as versões à mão; o nome continua o original', async () => {
    const { ana, beto } = await subir();
    await guardar(ana, 'rot-mao-1', 'Show Fictício 27/11', ['AO VIVO']);
    expect((await darVersoes(beto, 'rot-mao-1', '(ah)')).status).toBe(200);
    const [a] = await (await ana('/api/apelidos')).json();
    expect(a).toMatchObject({ roteiros: ['rot-mao-1'], apelido: '', versoes: 'AH', por: 'Beto' });
    expect(a.versoesDaChamada).toMatchObject({ de: 'mao', conflito: null });
  });

  it('o nome e as versões se editam cada um sem mexer no outro; os dois vazios tiram o apelido', async () => {
    const { ana } = await subir();
    await guardar(ana, 'rot-mao-2', 'Show Fictício 27/11 (A)');
    await darVersoes(ana, 'rot-mao-2', 'MNT');
    await darApelido(ana, 'rot-mao-2', 'A grade fictícia');
    expect(await (await ana('/api/apelidos')).json()).toMatchObject([{ apelido: 'A grade fictícia', versoes: 'MNT' }]);
    await darApelido(ana, 'rot-mao-2', '');
    expect(await (await ana('/api/apelidos')).json()).toMatchObject([{ apelido: '', versoes: 'MNT' }]);
    // as versões vazias voltam ao valor inicial (o código do nome): sem nada à mão nem nome novo, o apelido sai
    await darVersoes(ana, 'rot-mao-2', '');
    expect(await (await ana('/api/apelidos')).json()).toEqual([]);
  });

  it('sem nada à mão, o apelido diz as versões iniciais e de onde vieram (o nome, senão o roteiro)', async () => {
    const { ana } = await subir();
    await guardar(ana, 'rot-mao-3', 'Show Fictício 27/11', ['HOJE']);
    await darApelido(ana, 'rot-mao-3', 'A estreia fictícia');
    const [a] = await (await ana('/api/apelidos')).json();
    expect([a.versoes, a.versoesDaChamada.de, a.versoesDaChamada.lista.map((v: { codigo: string }) => v.codigo)]).toEqual(['', 'roteiro', ['H']]);
    await darApelido(ana, 'rot-mao-3', 'A estreia fictícia 27/11 (N)');
    expect((await (await ana('/api/apelidos')).json())[0].versoesDaChamada.de).toBe('apelido');
  });

  it('o código desconhecido é recusado; as versões entram no backup; o envio continua com a claquete original', async () => {
    const db = abrirBanco(':memory:');
    const { ana } = await subir({ db });
    await guardar(ana, 'rot-mao-4', 'Show Fictício 27/11 (A)');
    expect((await darVersoes(ana, 'rot-mao-4', 'XYZ')).status).toBe(400);
    expect((await darVersoes(ana, 'rot-mao-4', 'AA')).status).toBe(400);
    await darVersoes(ana, 'rot-mao-4', 'H');
    const destino = fazerBackup(db, mkdtempSync(join(tmpdir(), 'promeiro-versoes-')));
    const copia = new DatabaseSync(destino);
    expect(copia.prepare('SELECT chave, apelido, versoes FROM apelidos').all()).toEqual([{ chave: 'SHOW FICTICIO 27 11', apelido: '', versoes: 'H' }]);
    copia.close();
    // a claquete guardada não muda
    expect((await (await ana('/api/roteiros')).json())[0].meta.claquete).toBe('Show Fictício 27/11 (A)');
  });
});

describe('a opção "Mostrar o código das versões" (#152), lembrada por pessoa', () => {
  const lembrar = (quem: (c: string, i?: RequestInit) => Promise<Response>, valor: unknown) => quem('/api/eu/preferencias', { method: 'PUT', body: JSON.stringify({ 'versoes.codigo': valor }) });
  it('cada pessoa liga ou desliga; o valor que não é ligado nem desligado é recusado', async () => {
    const { ana, beto } = await subir();
    expect((await lembrar(ana, false)).status).toBe(200);
    expect((await (await ana('/api/eu')).json()).preferencias).toMatchObject({ 'versoes.codigo': false });
    expect((await (await beto('/api/eu')).json()).preferencias?.['versoes.codigo']).toBeUndefined();
    expect((await lembrar(ana, 'sim')).status).toBe(400);
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

describe('as versões da chamada nos cards (#121), prontas da API', () => {
  type Versoes = { lista: { codigo: string; rotulo: string }[]; de: string | null; conflito: { daClaquete: string; doRoteiro: string } | null };
  const rotulos = (v: Versoes) => v.lista.map((x) => x.rotulo);
  /** O roteiro com a data de exibição (o dia das etiquetas sem data na claquete) e as artes marcadas. */
  const comData = (quem: (c: string, i?: RequestInit) => Promise<Response>, id: string, claquete: string, artes: string[] = []) =>
    quem(`/api/roteiros/${id}`, { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete, dataExibicao: '2026-11-27' }, doc: roteiro(claquete, artes).roteiro.doc }, nArtes: artes.length }) });
  const daAgenda = async (quem: (c: string, i?: RequestInit) => Promise<Response>, id: string) =>
    ((await (await quem('/api/roteiros')).json()) as { id: string; versoesDaChamada: Versoes }[]).find((r) => r.id === id)!.versoesDaChamada;
  const daTela = async (quem: (c: string, i?: RequestInit) => Promise<Response>, id: string) =>
    ((await (await quem('/api/producoes/por-praca')).json()) as { blocos: { colunas: Record<string, { id: string; versoesDaChamada: Versoes }[]> }[] }).blocos
      .flatMap((b) => Object.values(b.colunas).flat())
      .find((c) => c.id === id)!.versoesDaChamada;
  const producao = (db: { prepare: (s: string) => { run: (...a: unknown[]) => void } }, id: string, claquete: string, roteiroId: string | null) => {
    const agora = new Date().toISOString();
    db.prepare("INSERT INTO producoes (id, claquete, praca, etapa, roteiro_id, criada_em, atualizada_em) VALUES (?, ?, 'RJ', 'entrada', ?, ?, ?)").run(id, claquete, roteiroId, agora, agora);
  };

  it('na agenda: vale o código do nome (#152), com o aviso quando o roteiro diz outra coisa', async () => {
    const { ana } = await subir();
    await comData(ana, 'rot-card-1', 'Show Fictício 27/11 (H)', ['AMANHÃ, 22H30']);
    const v = await daAgenda(ana, 'rot-card-1');
    expect(rotulos(v)).toEqual(['hoje']);
    expect(v.de).toBe('claquete');
    expect(v.conflito).toMatchObject({ daClaquete: '(H)', doRoteiro: '(A)' });
  });

  it('na agenda: sem versão nas artes, o código da claquete; com apelido que tem código, o do apelido', async () => {
    const { ana } = await subir();
    await comData(ana, 'rot-card-2', 'Show Fictício 27/11 (AH)', ['AO VIVO']);
    expect(await daAgenda(ana, 'rot-card-2')).toEqual({ lista: [{ codigo: 'A', rotulo: 'amanhã', conhecida: true }, { codigo: 'H', rotulo: 'hoje', conhecida: true }], de: 'claquete', conflito: null });
    await darApelido(ana, 'rot-card-2', 'Show Fictício 27/11 (N)');
    const v = await daAgenda(ana, 'rot-card-2');
    expect([rotulos(v), v.de]).toEqual([['nesta sex'], 'apelido']);
    // o apelido sem código: volta o da claquete
    await darApelido(ana, 'rot-card-2', 'A estreia fictícia');
    expect((await daAgenda(ana, 'rot-card-2')).de).toBe('claquete');
  });

  it('na agenda: o apelido com as versões do roteiro desfaz o aviso; sem versão em lugar nenhum, a lista vazia', async () => {
    const { ana } = await subir();
    await comData(ana, 'rot-card-3', 'Show Fictício 27/11 (H)', ['AMANHÃ']);
    await darApelido(ana, 'rot-card-3', 'Show Fictício 27/11 (A)');
    expect((await daAgenda(ana, 'rot-card-3')).conflito).toBeNull();
    // outra claquete: o apelido é da claquete (#154)
    await comData(ana, 'rot-card-4', 'Festa Fictícia 27/11', ['AO VIVO']);
    expect(await daAgenda(ana, 'rot-card-4')).toEqual({ lista: [], de: null, conflito: null });
  });

  it('na agenda: o nome sem código fica com as versões do roteiro (#152)', async () => {
    const { ana } = await subir();
    await comData(ana, 'rot-card-7', 'Show Fictício 27/11', ['AMANHÃ, 22H30']);
    const v = await daAgenda(ana, 'rot-card-7');
    expect([rotulos(v), v.de, v.conflito]).toEqual([['amanhã'], 'roteiro', null]);
  });

  it('as versões à mão (#152) valem na agenda e na tela de produções, sobre o nome e o roteiro', async () => {
    const db = abrirBanco(':memory:');
    const { ana } = await subir({ db });
    await comData(ana, 'rot-card-8', 'Show Fictício 27/11 (H)', ['AMANHÃ']);
    producao(db, 'prod-a-mao', 'Show Fictício 27/11 (H) RJ', 'rot-card-8');
    expect((await darVersoes(ana, 'rot-card-8', 'pn')).status).toBe(200);
    const v = await daAgenda(ana, 'rot-card-8');
    expect([v.lista.map((x) => x.codigo).join(''), v.de]).toEqual(['PN', 'mao']);
    expect(v.conflito).toMatchObject({ doRoteiro: '(A)' });
    expect((await daTela(ana, 'prod-a-mao')).de).toBe('mao');
    // as do roteiro, à mão: o aviso some
    await darVersoes(ana, 'rot-card-8', 'A');
    expect((await daAgenda(ana, 'rot-card-8')).conflito).toBeNull();
  });

  it('na tela de produções: o código da claquete dela, mesmo com a praça no fim (com o aviso do roteiro)', async () => {
    const db = abrirBanco(':memory:');
    const { ana } = await subir({ db });
    await comData(ana, 'rot-card-5', 'Show Fictício 27/11 (H)', ['AMANHÃ, 22H30']);
    producao(db, 'prod-com-roteiro', 'Show Fictício 27/11 (H) RJ', 'rot-card-5');
    producao(db, 'prod-sem-roteiro', 'Festa Fictícia 27/11 (AH) RJ', null);
    producao(db, 'prod-sem-versao', 'Festa Fictícia 27/11', null);
    const comRoteiro = await daTela(ana, 'prod-com-roteiro');
    expect([rotulos(comRoteiro), comRoteiro.de]).toEqual([['hoje'], 'claquete']);
    expect(comRoteiro.conflito).toMatchObject({ daClaquete: '(H)', doRoteiro: '(A)' });
    const semRoteiro = await daTela(ana, 'prod-sem-roteiro');
    expect([rotulos(semRoteiro), semRoteiro.de, semRoteiro.conflito]).toEqual([['amanhã', 'hoje'], 'claquete', null]);
    expect(await daTela(ana, 'prod-sem-versao')).toEqual({ lista: [], de: null, conflito: null });
  });

  it('na tela de produções: o apelido do roteiro vale para a Produção dele', async () => {
    const db = abrirBanco(':memory:');
    const { ana } = await subir({ db });
    await comData(ana, 'rot-card-6', 'Show Fictício 27/11', ['AO VIVO']);
    producao(db, 'prod-apelido', 'Show Fictício 27/11 RJ', 'rot-card-6');
    await darApelido(ana, 'rot-card-6', 'Show Fictício 27/11 (P)');
    const v = await daTela(ana, 'prod-apelido');
    expect([rotulos(v), v.de]).toEqual([['próxima sex'], 'apelido']);
  });
});

describe('o apelido pela claquete, com ou sem roteiro (#154)', () => {
  const pelaClaquete = (quem: (c: string, i?: RequestInit) => Promise<Response>, claquete: string, mudanca: { apelido?: string; versoes?: string }) =>
    quem('/api/apelidos', { method: 'PUT', body: JSON.stringify({ claquete, ...mudanca }) });
  const producao = (db: { prepare: (s: string) => { run: (...a: unknown[]) => void } }, id: string, claquete: string, roteiroId: string | null = null) => {
    const agora = new Date().toISOString();
    db.prepare("INSERT INTO producoes (id, claquete, praca, etapa, roteiro_id, exibicao_em, criada_em, atualizada_em) VALUES (?, ?, 'RJ', 'entrada', ?, '2026-11-28', ?, ?)").run(id, claquete, roteiroId, agora, agora);
  };
  const daTela = async (quem: (c: string, i?: RequestInit) => Promise<Response>, id: string) =>
    ((await (await quem('/api/producoes/por-praca')).json()) as { blocos: { colunas: Record<string, { id: string; versoesDaChamada: { lista: { codigo: string }[]; de: string | null } }[]> }[] }).blocos
      .flatMap((b) => Object.values(b.colunas).flat())
      .find((c) => c.id === id)!.versoesDaChamada;
  const codigo = (v: { lista: { codigo: string }[] }) => v.lista.map((x) => x.codigo).join('');

  it('a claquete sem roteiro recebe as versões à mão, e a Produção dela mostra o código, com a origem à mão', async () => {
    const db = abrirBanco(':memory:');
    const { ana, beto } = await subir({ db });
    producao(db, 'prod-sem-roteiro', 'Festa Fictícia 28/11 RJ');
    expect((await pelaClaquete(beto, 'Festa Fictícia 28/11', { versoes: 'pn' })).status).toBe(200);
    expect(await (await ana('/api/apelidos')).json()).toMatchObject([{ chave: 'FESTA FICTICIA 28 11', original: 'Festa Fictícia 28/11', apelido: '', versoes: 'PN', roteiros: [], producoes: ['prod-sem-roteiro'], por: 'Beto' }]);
    const v = await daTela(ana, 'prod-sem-roteiro');
    expect([codigo(v), v.de]).toEqual(['PN', 'mao']);
  });

  it('pela Produção: o apelido vai para a claquete dela; a que não existe é 404; sem alvo, 400', async () => {
    const db = abrirBanco(':memory:');
    const { ana } = await subir({ db });
    producao(db, 'prod-alvo', 'Festa Fictícia 28/11 (A) RJ');
    expect((await ana('/api/apelidos', { method: 'PUT', body: JSON.stringify({ producao: 'prod-alvo', apelido: 'A festa' }) })).status).toBe(200);
    expect(await (await ana('/api/apelidos')).json()).toMatchObject([{ chave: 'FESTA FICTICIA 28 11', apelido: 'A festa', producoes: ['prod-alvo'] }]);
    expect((await ana('/api/apelidos', { method: 'PUT', body: JSON.stringify({ producao: 'prod-nao-existe', apelido: 'X' }) })).status).toBe(404);
    expect((await ana('/api/apelidos', { method: 'PUT', body: JSON.stringify({ apelido: 'X' }) })).status).toBe(400);
    expect((await pelaClaquete(ana, '  ', { apelido: 'X' })).status).toBe(400);
  });

  it('quando o roteiro chega, ele usa o apelido que já existe, e o aviso de conflito com o roteiro aparece como antes', async () => {
    const { ana } = await subir();
    await pelaClaquete(ana, 'Show Fictício 27/11', { versoes: 'H' });
    await guardar(ana, 'rot-chegou', 'SHOW FICTÍCIO 27/11', ['AMANHÃ, 22H']);
    expect(await (await ana('/api/apelidos')).json()).toMatchObject([{ versoes: 'H', roteiros: ['rot-chegou'] }]);
    const [r] = await (await ana('/api/roteiros')).json();
    expect([codigo(r.versoesDaChamada), r.versoesDaChamada.de]).toEqual(['H', 'mao']);
    expect(r.versoesDaChamada.conflito).toMatchObject({ daClaquete: '(H)', doRoteiro: '(A)' });
    // a claquete guardada não muda
    expect(r.meta.claquete).toBe('SHOW FICTÍCIO 27/11');
  });
});

describe('a migração dos apelidos por roteiro para a claquete (#154)', () => {
  /** O banco de antes do #154: o apelido por roteiro, com as versões à mão do #152 (ou sem a coluna, o de antes dele). */
  function bancoAntigo({ comVersoes = true } = {}) {
    const db = abrirBanco(':memory:');
    db.exec(`CREATE TABLE apelidos (roteiro_id TEXT PRIMARY KEY REFERENCES roteiros (id) ON DELETE CASCADE, apelido TEXT NOT NULL, por_email TEXT NOT NULL, por_nome TEXT NOT NULL, em TEXT NOT NULL${comVersoes ? ', versoes TEXT' : ''})`);
    const rot = db.prepare("INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, 'ana@empresa.com', 'Ana', ?, '{}', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')");
    rot.run('rot-velho', JSON.stringify({ claquete: 'Show Fictício 27/11 (A)' }));
    rot.run('rot-novo', JSON.stringify({ claquete: 'SHOW FICTICIO 27/11 (H) RJ' }));
    rot.run('rot-festa', JSON.stringify({ claquete: 'Festa Fictícia 28/11' }));
    rot.run('rot-sem-claquete', JSON.stringify({}));
    const apelido = db.prepare(`INSERT INTO apelidos (roteiro_id, apelido, por_email, por_nome, em${comVersoes ? ', versoes' : ''}) VALUES (?, ?, 'ana@empresa.com', 'Ana', ?${comVersoes ? ', ?' : ''})`);
    const dar = (id: string, nome: string, em: string, versoes: string | null) => (comVersoes ? apelido.run(id, nome, em, versoes) : apelido.run(id, nome, em));
    dar('rot-velho', 'O velho', '2026-11-02T00:00:00Z', 'A');
    dar('rot-novo', 'O novo', '2026-11-05T00:00:00Z', null);
    dar('rot-festa', '', '2026-11-03T00:00:00Z', 'NP');
    dar('rot-sem-claquete', 'Sem lugar', '2026-11-04T00:00:00Z', null);
    return db;
  }

  it('cada apelido vai para a chave da claquete do roteiro; dois na mesma claquete, vale o mais recente, e o outro vai ao log', async () => {
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const db = bancoAntigo();
      const { ana } = await subir({ db });
      expect(db.prepare('SELECT chave, original, apelido, versoes FROM apelidos ORDER BY chave').all()).toEqual([
        { chave: 'FESTA FICTICIA 28 11', original: 'Festa Fictícia 28/11', apelido: '', versoes: 'NP' },
        { chave: 'SHOW FICTICIO 27 11', original: 'SHOW FICTICIO 27/11 (H) RJ', apelido: 'O novo', versoes: null },
      ]);
      const log = avisos.mock.calls.map((c) => String(c[0])).join('\n');
      expect(log).toContain('rot-velho');
      expect(log).toContain('O velho');
      expect(log).toContain('rot-sem-claquete');
      // os dois roteiros da mesma claquete ficam com o apelido mais recente
      expect((await (await ana('/api/apelidos')).json()).find((a: { chave: string }) => a.chave === 'SHOW FICTICIO 27 11')).toMatchObject({ apelido: 'O novo', roteiros: ['rot-novo', 'rot-velho'] });
      // a tabela por roteiro some, e a migração não roda de novo
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'apelidos%'").all()).toEqual([{ name: 'apelidos' }]);
    } finally {
      avisos.mockRestore();
    }
  });

  it('o banco de antes do #152 (sem a coluna das versões) também passa, sem perder os apelidos', async () => {
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const db = bancoAntigo({ comVersoes: false });
      await subir({ db });
      expect(db.prepare('SELECT chave, apelido, versoes FROM apelidos ORDER BY chave').all()).toEqual([
        { chave: 'FESTA FICTICIA 28 11', apelido: '', versoes: null },
        { chave: 'SHOW FICTICIO 27 11', apelido: 'O novo', versoes: null },
      ]);
    } finally {
      avisos.mockRestore();
    }
  });
});
