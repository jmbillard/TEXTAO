// @vitest-environment node
import { createServer, request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, fazerBackup } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello, chaveN8n } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarAnexos } from '../servidor/anexos.mjs';
// @ts-expect-error módulo JS sem tipos
import { comTabelas } from '../servidor/tabelas-do-teable.mjs';

/* Os anexos guardados pelo PROMeiro (#90): o PDF do roteiro do envio e os pôsteres dos filmes, guardados no SQLite e
   servidos por endereço fixo. Trello e Teable falsos; ids e endereços inventados. */

const PROMEIRO = 'https://promeiro.exemplo.com';
const ENV = {
  ACESSO: 'aberto',
  PROMEIRO_URL: PROMEIRO,
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_LISTA: 'listaG5',
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_ARTE_PRODUCAO: 'tblProducao',
  TEABLE_FILMES: 'tblFilmes',
  TEABLE_PG_URL: 'postgres://x',
  TEABLE_PG_ESQUEMA: 'bseBase',
  ...comTabelas({ ARTE_producao: 'producao' }),
};
const PDF = Buffer.from('%PDF-1.4 o roteiro como chegou');
const IMAGEM = Buffer.from('jpg-do-poster');
/** O Teable fora do ar para a descoberta das tabelas: valem as do env (comTabelas). */
const semDescoberta = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' });
/** O módulo do Trello de verdade, com os falsos e as tabelas do env (a descoberta não acha nada aqui). */
const trelloCom = (f: ReturnType<typeof falsos>) => (e: Record<string, string>, d: object) => criarTrello({ ...e, tabelas: ENV.tabelas }, { ...d, buscar: f.buscar, consultar: f.consultar, sftp: async () => {} });

interface Pedido {
  metodo: string;
  url: URL;
  corpo: unknown;
}

/** Trello e Teable (a API) de mentira, num fetch só; a produção da arte guarda o que o envio registrou. */
function falsos() {
  const pedidos: Pedido[] = [];
  const producao: Record<string, unknown>[] = [];
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    let corpo: unknown = null;
    if (typeof init.body === 'string') corpo = JSON.parse(init.body);
    else if (init.body instanceof FormData) corpo = Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `arquivo:${(v as File).name}`]));
    pedidos.push({ metodo, url, corpo });
    const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '', arrayBuffer: async () => new TextEncoder().encode('%PDF do trello').buffer });
    if (url.host === 'teable:3000') {
      if (metodo === 'POST') producao.push(...(corpo as { records: { fields: Record<string, unknown> }[] }).records.map((r) => r.fields));
      return ok({ records: [{ id: 'rec1' }] });
    }
    const rota = url.pathname.replace('/1', '');
    if (rota === '/cards' && metodo === 'POST') return ok({ id: 'card1', shortUrl: 'https://trello.com/c/CARD1' });
    if (rota.endsWith('/attachments') && metodo === 'POST') return ok({ id: 'anexo1', url: 'https://trello.com/1/cards/card1/attachments/anexo1/download/roteiro.pdf' });
    return ok({});
  };
  /** O Postgres do Teable: a produção da arte é a que o envio registrou (de hoje, mas a checagem de duplicado não acha). */
  const consultar = async (sql: string) => {
    if (sql.includes('"doc"')) return producao.map((f) => ({ registro: 'rec1', card_ID: f.card_ID, claquete: f.claquete, key: f.key, status: null, data_entrada: new Date(), artes_quantidade: 1, artes: f.artes, texto: '', doc: f.doc }));
    return [];
  };
  return { buscar, consultar, pedidos, producao };
}

let fechar: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(fechar.map((f) => f()));
  fechar = [];
});

async function subir({ db = abrirBanco(':memory:'), env = ENV as Record<string, string>, teable = undefined as unknown, trello = undefined as unknown } = {}) {
  const app = criarApp({ db, env, ...(teable ? { buscarNoTeable: teable } : {}), ...(trello ? { trello } : {}) });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  fechar.push(async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await app.fechar?.();
  });
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const ana = (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com', 'content-type': 'application/json', ...init.headers } });
  return { base, ana, db };
}

describe('o PDF do roteiro guardado pelo PROMeiro', () => {
  it('o envio guarda o PDF ligado ao card, o Teable não recebe link nenhum do PDF e o card do Trello continua com o anexo', async () => {
    const f = falsos();
    const { base, ana, db } = await subir({ teable: semDescoberta, trello: trelloCom(f) });
    await ana('/api/roteiros/rot-anexo-1', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'Festa 19/11' }, doc: { type: 'doc', content: [] } }, nArtes: 1 }) });
    await ana('/api/roteiros/rot-anexo-1/original', { method: 'PUT', body: PDF, headers: { 'content-type': 'application/pdf', 'x-arquivo': encodeURIComponent('Festa 19_11.pdf') } });
    const r = await (await ana('/api/roteiros/rot-anexo-1/trello', { method: 'POST', body: JSON.stringify({ artes: ['A GRANDE FESTA'], texto: 'x' }) })).json();
    expect(r.estado).toBe('enviado');

    // o card recebe o PDF como antes
    expect(f.pedidos.find((p) => p.metodo === 'POST' && p.url.pathname === '/1/cards/card1/attachments')!.corpo).toMatchObject({ name: 'Festa 19_11.pdf', file: 'arquivo:Festa 19_11.pdf' });
    // a produção da arte não recebe o campo doc: nem o endereço do PROMeiro, nem o do anexo do Trello
    expect(f.producao).toHaveLength(1);
    expect(f.producao[0]).not.toHaveProperty('doc');

    // o PDF fica guardado no PROMeiro, ligado ao card da Produção; o endereço fixo serve só para quem está logado
    const { id, nome } = db.prepare("SELECT id, nome FROM anexos WHERE tipo = 'roteiro' AND card = ?").get('card1') as { id: string; nome: string };
    expect(nome).toBe('Festa 19_11.pdf');
    const caminho = `/api/anexos/${id}/${encodeURIComponent(nome)}`;
    const baixado = await ana(caminho);
    expect(baixado.status).toBe(200);
    expect(baixado.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await baixado.arrayBuffer()).equals(PDF)).toBe(true);
    expect((await fetch(base + caminho)).status).toBe(401);
    expect((await ana('/api/anexos/00000000-0000-4000-8000-000000000000/x.pdf')).status).toBe(404);

    // comparar com o que está na produção: sem doc no Teable, o PDF vem do PROMeiro, sem baixar nada do Trello
    const antes = f.pedidos.length;
    const daProducao = await ana(`/api/producao/pdf?claquete=${encodeURIComponent('Festa 19/11')}`);
    expect(daProducao.status).toBe(200);
    expect(Buffer.from(await daProducao.arrayBuffer()).equals(PDF)).toBe(true);
    expect(f.pedidos.slice(antes)).toEqual([]);
  });

  it('a produção antiga, sem PDF guardado, com o link do anexo do Trello no doc: ainda baixa do Trello', async () => {
    const f = falsos();
    f.producao.push({ card_ID: 'cardVelho', claquete: 'Festa 19/11', key: chaveN8n('Festa 19/11'), artes: 'A', doc: 'https://trello.com/1/cards/cardVelho/attachments/x/download/roteiro.pdf' });
    const { ana } = await subir({ teable: semDescoberta, trello: trelloCom(f) });
    const r = await ana(`/api/producao/pdf?claquete=${encodeURIComponent('Festa 19/11')}`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('%PDF do trello');
    expect(f.pedidos.map((p) => p.url.hostname)).toEqual(['trello.com']);
  });

  it('a produção com o link do PROMeiro no doc (o PDF guardado antes da ligação com o card) ainda é lida do PROMeiro', async () => {
    const f = falsos();
    const anexos = criarAnexos(abrirBanco(':memory:'));
    const { caminho } = anexos.guardarPdf({ chave: 'rot-velho', nome: 'Festa.pdf', dados: PDF });
    f.producao.push({ card_ID: 'cardVelho', claquete: 'Festa 19/11', key: chaveN8n('Festa 19/11'), artes: 'A', doc: `${PROMEIRO}${caminho}` });
    const t = criarTrello(ENV, { buscar: f.buscar, consultar: f.consultar, anexos });
    expect((await t.pdfDaProducao('Festa 19/11'))?.dados.equals(PDF)).toBe(true);
    expect(f.pedidos).toEqual([]);
  });

  it('a versão nova (V2) também fica no PROMeiro, ligada ao card, sem mexer no doc do Teable; a comparação acha ela', async () => {
    const f = falsos();
    const anexos = criarAnexos(abrirBanco(':memory:'));
    const buscar = async (endereco: string, init: RequestInit = {}) => {
      const u = new URL(endereco);
      if ((init.method ?? 'GET') === 'GET' && u.pathname.endsWith('/cards/cardVelho')) return { ok: true, status: 200, json: async () => ({ id: 'cardVelho', shortUrl: 'https://trello.com/c/VELHO' }), text: async () => '' };
      if ((init.method ?? 'GET') === 'GET' && u.pathname.endsWith('/cards/cardVelho/checklists')) return { ok: true, status: 200, json: async () => [], text: async () => '' };
      return f.buscar(endereco, init);
    };
    const t = criarTrello(ENV, { buscar, consultar: f.consultar, anexos });
    const meta = { claquete: 'Festa 19/11', v2De: { card: 'cardVelho', url: 'https://trello.com/c/cardVelho', registro: 'recP1' } };
    await t.enviar({ meta, doc: { type: 'doc', content: [] }, artes: ['A'], texto: 'novo', original: { nome: 'Festa V2.pdf', tipo: 'application/pdf', dados: PDF } });
    // o card antigo recebe o roteiro novo, como antes
    expect((f.pedidos.find((p) => p.metodo === 'POST' && p.url.pathname.endsWith('/cards/cardVelho/attachments'))!.corpo as { name: string }).name).toBe('Festa V2 V2.pdf');
    // a produção da arte é atualizada (artes, texto), mas o doc que já está lá fica como está
    const patch = f.pedidos.find((p) => p.metodo === 'PATCH' && p.url.host === 'teable:3000')!;
    const campos = (patch.corpo as { record: { fields: Record<string, unknown> } }).record.fields;
    expect(campos.texto).toBe('novo');
    expect(campos).not.toHaveProperty('doc');

    // a produção em andamento, com o doc antigo (o anexo do Trello): vale o PDF da V2 guardado, sem ir ao Trello
    f.producao.push({ card_ID: 'cardVelho', claquete: 'Festa 19/11', key: chaveN8n('Festa 19/11'), artes: 'A', doc: 'https://trello.com/1/cards/cardVelho/attachments/x/download/roteiro.pdf' });
    const antes = f.pedidos.length;
    const pdf = await t.pdfDaProducao('Festa 19/11');
    expect(pdf?.nome).toBe('Festa V2 V2.pdf');
    expect(pdf?.dados.equals(PDF)).toBe(true);
    expect(f.pedidos.slice(antes)).toEqual([]);
  });
});

/** O Teable dos pôsteres: o registro do filme com o anexo, e o arquivo (que o armazenamento pode ter perdido). */
function teableDosPosteres() {
  const estado = { temArquivo: true, token: 'tokPoster1', imagem: IMAGEM };
  const pedidos: string[] = [];
  const buscar = async (endereco: string) => {
    const url = new URL(endereco);
    pedidos.push(url.pathname);
    if (url.pathname.startsWith('/api/table/tblFilmes/record/recFilme0001'))
      return { ok: true, status: 200, json: async () => ({ fields: { poster: [{ token: estado.token, name: 'poster.jpg', mimetype: 'image/jpeg', presignedUrl: `/api/attachments/read/${estado.token}` }] } }) };
    if (url.pathname.startsWith('/api/table/tblFilmes/record/'))
      return { ok: true, status: 200, json: async () => ({ fields: {} }) };
    if (url.pathname.startsWith('/api/attachments/read/'))
      return estado.temArquivo
        ? { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/jpeg' }), arrayBuffer: async () => new Uint8Array(estado.imagem).buffer }
        : { ok: false, status: 404, headers: new Headers({ 'content-type': 'application/json' }), arrayBuffer: async () => new TextEncoder().encode('{"message":"Could not find attachment"}').buffer };
    return { ok: false, status: 404, json: async () => ({}), headers: new Headers() };
  };
  return { buscar, estado, pedidos };
}
const ENV_DOS_FILMES = { ACESSO: 'aberto', TEABLE_URL: 'http://teable:3000', TEABLE_TOKEN: 'um-token-so', TEABLE_FILMES: 'tblFilmes', POSTER_PUBLICO_TOKEN: 'token-do-padeiro' };

describe('os pôsteres guardados pelo PROMeiro', () => {
  it('o pôster que o Teable ainda tem vira cópia do PROMeiro e continua servido depois que o Teable o perde (e no backup)', async () => {
    const teable = teableDosPosteres();
    const db = abrirBanco(':memory:');
    const { ana } = await subir({ db, env: ENV_DOS_FILMES, teable: teable.buscar });
    const r = await ana('/api/filmes/poster/recFilme0001');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await r.arrayBuffer()).equals(IMAGEM)).toBe(true);

    // o Teable perde o arquivo; o PROMeiro reinicia (outro servidor, o mesmo banco) e o pôster continua lá
    teable.estado.temArquivo = false;
    const depois = await subir({ db, env: ENV_DOS_FILMES, teable: teable.buscar });
    const de_novo = await depois.ana('/api/filmes/poster/recFilme0001');
    expect(de_novo.status).toBe(200);
    expect(Buffer.from(await de_novo.arrayBuffer()).equals(IMAGEM)).toBe(true);

    // o backup leva a cópia
    const pasta = mkdtempSync(join(tmpdir(), 'backup-anexos-'));
    const arquivo = fazerBackup(db, pasta);
    const doBackup = await subir({ db: abrirBanco(arquivo), env: { ACESSO: 'aberto' } });
    expect(Buffer.from(await (await doBackup.ana('/api/filmes/poster/recFilme0001')).arrayBuffer()).equals(IMAGEM)).toBe(true);
    new DatabaseSync(arquivo).close();
  });

  it('o Teable sem o arquivo: 404 limpo, sem perguntar ao Teable a cada pedido', async () => {
    const teable = teableDosPosteres();
    teable.estado.temArquivo = false;
    const { ana } = await subir({ env: ENV_DOS_FILMES, teable: teable.buscar });
    for (let i = 0; i < 3; i++) {
      const r = await ana('/api/filmes/poster/recFilme0001');
      expect(r.status).toBe(404);
      expect(await r.text()).toBe('');
    }
    // o filme sem pôster nenhum também
    expect((await ana('/api/filmes/poster/recSemPoster01')).status).toBe(404);
    expect((await ana('/api/filmes/poster/recSemPoster01')).status).toBe(404);
    expect(teable.pedidos.filter((p) => p.includes('/record/recFilme0001'))).toHaveLength(1);
    expect(teable.pedidos.filter((p) => p.includes('/record/recSemPoster01'))).toHaveLength(1);
  });

  it('o Padeiro abre o pôster sem login pelo endereço público, só com o token', async () => {
    const teable = teableDosPosteres();
    const { base } = await subir({ env: ENV_DOS_FILMES, teable: teable.buscar });
    const r = await fetch(`${base}/api/publico/poster/recFilme0001?t=token-do-padeiro`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toMatch(/public/);
    expect(Buffer.from(await r.arrayBuffer()).equals(IMAGEM)).toBe(true);
    // sem o token, com o errado ou com o e-mail do Access forjado: 404, sem ir ao Teable
    const antes = teable.pedidos.length;
    expect((await fetch(`${base}/api/publico/poster/recFilme0001`)).status).toBe(404);
    expect((await fetch(`${base}/api/publico/poster/recFilme0001?t=errado`)).status).toBe(404);
    expect((await fetch(`${base}/api/publico/poster/recFilme0001?t=token-do-padeir0`)).status).toBe(404);
    // o que está embaixo de /api/publico/ não chega às rotas com login
    expect((await fetch(`${base}/api/publico/roteiros`, { headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com' } })).status).toBe(404);
    expect(teable.pedidos.length).toBe(antes);
  });

  it('o caminho torto embaixo de /api/publico (%2e%2e, barras repetidas, outra caixa) não chega às rotas com login (#145)', async () => {
    const teable = teableDosPosteres();
    const { base, ana } = await subir({ env: ENV_DOS_FILMES, teable: teable.buscar });
    // o pedido com o caminho exatamente como vai (o fetch arrumaria o %2e%2e e as barras antes de mandar)
    const cru = (caminho: string) =>
      new Promise<number>((ok, falhou) => {
        const r = request(base + '/', { path: caminho, headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com' } }, (resposta) => (resposta.resume(), ok(resposta.statusCode ?? 0)));
        r.on('error', falhou);
        r.end();
      });
    // com o login, as rotas respondem…
    expect((await ana('/api/roteiros')).status).toBe(200);
    expect((await ana('/api/eu')).status).toBe(200);
    // …mas não pelo caminho do pôster público, nem com o token
    for (const caminho of [
      '/api/publico/%2e%2e/roteiros',
      '/api/publico/%2E%2E/eu',
      '/api/publico/poster/%2e%2e/%2e%2e/roteiros',
      '/api//publico/%2e%2e/roteiros',
      '/API/publico/%2e%2e/roteiros',
      '/api/PUBLICO/%2e%2e/eu',
      '/api/publico%2f%2e%2e%2froteiros',
      '/api/publico',
      '/api/publicos',
      '/api/publico/%2e%2e/roteiros?t=token-do-padeiro',
    ])
      expect(await cru(caminho), caminho).toBe(404);
    // o pôster continua abrindo pelo caminho certo
    expect(await cru('/api/publico/poster/recFilme0001?t=token-do-padeiro')).toBe(200);
  });

  it('sem o POSTER_PUBLICO_TOKEN, o endereço público fica desligado', async () => {
    const teable = teableDosPosteres();
    const { POSTER_PUBLICO_TOKEN: _, ...semToken } = ENV_DOS_FILMES;
    const { base } = await subir({ env: semToken, teable: teable.buscar });
    expect((await fetch(`${base}/api/publico/poster/recFilme0001?t=`)).status).toBe(404);
    expect((await fetch(`${base}/api/publico/poster/recFilme0001?t=token-do-padeiro`)).status).toBe(404);
  });

  it('um pôster novo posto no Teable substitui a cópia na conferência (de 6 em 6 horas)', async () => {
    const teable = teableDosPosteres();
    let agora = Date.parse('2026-11-26T12:00:00Z');
    const anexos = criarAnexos(abrirBanco(':memory:'), { buscar: teable.buscar, agora: () => agora });
    expect((await anexos.poster('recFilme0001', ENV_DOS_FILMES)).dados.equals(IMAGEM)).toBe(true);
    teable.estado.token = 'tokPoster2';
    teable.estado.imagem = Buffer.from('jpg-novo');
    // antes das 6 horas, a cópia vale sem perguntar
    agora += 3600e3;
    expect((await anexos.poster('recFilme0001', ENV_DOS_FILMES)).dados.toString()).toBe('jpg-do-poster');
    agora += 6 * 3600e3;
    // a conferência não atrasa quem pediu: vai a cópia, e a nova vale no pedido seguinte
    expect((await anexos.poster('recFilme0001', ENV_DOS_FILMES)).dados.toString()).toBe('jpg-do-poster');
    await new Promise((ok) => setTimeout(ok, 20));
    expect((await anexos.poster('recFilme0001', ENV_DOS_FILMES)).dados.toString()).toBe('jpg-novo');
  });
});
