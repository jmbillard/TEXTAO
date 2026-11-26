// @vitest-environment node
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarConfiguracao } from '../servidor/configuracao.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarFilmes } from '../servidor/filmes.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';

/* IDs inventados: o quadro de verdade fica só nas variáveis do servidor. */
const PORTAINER = { TRELLO_KEY: 'k', TRELLO_TOKEN: 't', TRELLO_LISTA_SP: 'listaSP', TRELLO_LISTA_RJ: 'listaRJ' };

describe('configuração: o salvo vale, senão o Portainer', () => {
  it('sem nada salvo, valem as variáveis do Portainer', () => {
    const config = criarConfiguracao(abrirBanco(':memory:'), PORTAINER);
    expect(config.valores()).toEqual(PORTAINER);
  });

  it('o valor salvo vence o do Portainer e continua valendo ao abrir de novo', () => {
    const db = abrirBanco(':memory:');
    criarConfiguracao(db, PORTAINER).salvar({ TRELLO_LISTA_SP: 'listaNovaSP' }, { por: 'chefe@empresa.com' });
    const valores = criarConfiguracao(db, PORTAINER).valores();
    expect(valores.TRELLO_LISTA_SP).toBe('listaNovaSP');
    expect(valores.TRELLO_LISTA_RJ).toBe('listaRJ');
  });

  it('salvar uma variável que não está no Portainer também vale', () => {
    const config = criarConfiguracao(abrirBanco(':memory:'), PORTAINER);
    expect(config.salvar({ TRELLO_LISTA_INTER: 'listaINTER' }).TRELLO_LISTA_INTER).toBe('listaINTER');
  });

  it('salvo vazio vale como vazio; tirar o salvo (null) volta ao Portainer', () => {
    const config = criarConfiguracao(abrirBanco(':memory:'), PORTAINER);
    expect(config.salvar({ TRELLO_LISTA_RJ: '' }).TRELLO_LISTA_RJ).toBe('');
    expect(config.salvar({ TRELLO_LISTA_RJ: null }).TRELLO_LISTA_RJ).toBe('listaRJ');
  });

  it('segredo e infraestrutura não se guardam: continuam só no Portainer, e nada da mudança é salvo', () => {
    const config = criarConfiguracao(abrirBanco(':memory:'), PORTAINER);
    for (const nome of ['TRELLO_TOKEN', 'TEABLE_PG_URL', 'ACESSO', 'CADASTRO_ADMINS', 'N8N_FILMES_LER'])
      expect(() => config.salvar({ TRELLO_LISTA_SP: 'outra', [nome]: 'x' })).toThrow(nome);
    expect(config.valores()).toEqual(PORTAINER);
  });

  it('o objeto do Portainer não muda', () => {
    const portainer = { ...PORTAINER };
    criarConfiguracao(abrirBanco(':memory:'), portainer).salvar({ TRELLO_LISTA_SP: 'listaNovaSP' });
    expect(portainer).toEqual(PORTAINER);
  });
});

/* ---------- a configuração vale na hora, no servidor ---------- */

interface Pedido {
  metodo: string;
  rota: string;
  corpo: Record<string, unknown> | null;
}

/** O Trello de mentira: guarda os pedidos e cria o card. */
function trelloFalso() {
  const pedidos: Pedido[] = [];
  let n = 0;
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    const corpo = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    const rota = url.pathname.replace(/^\/1/, '');
    pedidos.push({ metodo, rota, corpo });
    const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '', arrayBuffer: async () => new ArrayBuffer(4) });
    if (rota === '/cards' && metodo === 'POST') return ok({ id: 'card' + ++n, shortUrl: `https://trello.com/c/CARD${n}` });
    return ok({});
  };
  return { buscar, listasDosCards: () => pedidos.filter((p) => p.rota === '/cards' && p.metodo === 'POST').map((p) => p.corpo?.idList) };
}

/** Um pedido preso: `chegou` diz que ele chegou ao falso; ele só responde depois de `soltar()`. */
function preso() {
  let avisar = () => {};
  let soltar = () => {};
  const chegou = new Promise<void>((ok) => (avisar = ok));
  const solto = new Promise<void>((ok) => (soltar = ok));
  return { chegou, soltar, esperar: async () => (avisar(), solto) };
}

/** O Postgres do Teable de mentira (a produção de hoje vazia); `segurarProxima` prende a próxima consulta até soltar. */
function bancoFalso() {
  let proxima: ReturnType<typeof preso> | null = null;
  const consultar = async () => {
    const p = proxima;
    proxima = null;
    await p?.esperar();
    return [];
  };
  const segurarProxima = () => (proxima = preso());
  return { consultar, segurarProxima };
}

// com a produção da arte no Postgres, o envio confere a produção de hoje antes de escolher a lista
const ENV = { TRELLO_KEY: 'k', TRELLO_TOKEN: 't', TRELLO_LISTA_SP: 'listaSP', TRELLO_LISTA_RJ: 'listaRJ', TEABLE_PG_ESQUEMA: 'bseBase', TEABLE_PG_ARTE: 'producao' };
const DOC = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'VEM AÍ' }] }] };

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

async function comServidor(env: Record<string, string> = ENV) {
  const falso = trelloFalso();
  const banco = bancoFalso();
  const app = criarApp({ db: abrirBanco(':memory:'), env, trello: (e: Record<string, string>) => criarTrello(e, { buscar: falso.buscar, consultar: banco.consultar }) });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  fechar = async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await app.fechar();
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const ana = (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com', 'content-type': 'application/json', ...init.headers } });
  let n = 0;
  /** Um roteiro de SP novo, mandado para o Trello. @returns a resposta do envio */
  const enviarRoteiroDeSP = async () => {
    const id = `rot-config-${++n}`;
    await ana(`/api/roteiros/${id}`, { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: `Festa ${n}/11 SP`, praca: 'SP' }, doc: DOC }, nArtes: 0 }) });
    return ana(`/api/roteiros/${id}/trello`, { method: 'POST', body: JSON.stringify({ artes: [], texto: 'x' }) }).then((r) => r.json());
  };
  return { app, falso, banco, enviarRoteiroDeSP };
}

describe('a configuração vale na hora', () => {
  it('mudar a entrada de SP: sem reiniciar, o próximo envio vai para a lista nova', async () => {
    const { app, falso, enviarRoteiroDeSP } = await comServidor();
    expect((await enviarRoteiroDeSP()).estado).toBe('enviado');
    await app.mudarConfiguracao({ TRELLO_LISTA_SP: 'listaNovaSP' }, { por: 'chefe@empresa.com' });
    expect((await enviarRoteiroDeSP()).estado).toBe('enviado');
    expect(falso.listasDosCards()).toEqual(['listaSP', 'listaNovaSP']);
  });

  it('o envio que já tinha começado termina com a configuração antiga; ela só fecha depois dele', async () => {
    const { app, falso, banco, enviarRoteiroDeSP } = await comServidor();
    const consulta = banco.segurarProxima();
    const primeiro = enviarRoteiroDeSP();
    await consulta.chegou; // o primeiro envio começou e está conferindo a produção de hoje

    const { antigaFechada } = app.mudarConfiguracao({ TRELLO_LISTA_SP: 'listaNovaSP' });
    let fechou = false;
    void antigaFechada.then(() => (fechou = true));
    expect((await enviarRoteiroDeSP()).estado).toBe('enviado');
    expect(fechou).toBe(false);

    consulta.soltar();
    expect((await primeiro).estado).toBe('enviado');
    await antigaFechada;
    expect(falso.listasDosCards()).toEqual(['listaNovaSP', 'listaSP']);
  });
});

/* ---------- as conexões com o Postgres e a fila de leitura dos filmes ---------- */

/** As conexões abertas com o Postgres do Teable (de mentira): o que cada uma consultou e se foi fechada. */
function postgresFalso() {
  const conexoes: { sql: string[]; fechada: boolean }[] = [];
  const abrirPg = async () => {
    const c = { sql: [] as string[], fechada: false };
    conexoes.push(c);
    return {
      query: async (sql: string) => {
        if (c.fechada) throw new Error('consulta numa conexão já fechada');
        c.sql.push(sql);
        return { rows: [] };
      },
      end: async () => void (c.fechada = true),
    };
  };
  return { abrirPg, conexoes };
}

/** O n8n que lê as páginas (de mentira): responde um filme por página; `segurar(n)` prende a leitura da página n. */
function n8nFalso() {
  const lidas: number[] = [];
  const presas = new Map<number, ReturnType<typeof preso>>();
  const buscar = async (_endereco: string, init: RequestInit = {}) => {
    const n = Number((init.body as FormData).get('original_page_number'));
    lidas.push(n);
    await presas.get(n)?.esperar();
    const r = { status: 'ok', sessoes: ['SUPERCINE'], movies: [{ titulo: `FILME ${n}`, ano_de_producao: 2024, sessao: 'SUPERCINE', data: '05/12/2026', inedito: false }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(r), json: async () => r };
  };
  const segurar = (n: number) => {
    const p = preso();
    presas.set(n, p);
    return p;
  };
  return { buscar, lidas, segurar };
}

const b64 = (t: string) => Buffer.from(t).toString('base64');
const paginaComUmFilme = (n: number) => ({
  pdf: b64('%PDF-pagina'),
  imagem: b64('jpg-pagina'),
  tamanho: { width: 1000, height: 600 },
  posteres: [{ dados: b64('jpg-poster'), caixa: { x: 100, y: 100, width: 100, height: 150 } }],
  textos: [{ str: `FILME ${n} (2024)`, x: 100, top: 260, width: 100, height: 12 }],
  vagas: [],
});

describe('a configuração muda: as conexões e a fila dos filmes', () => {
  it('as conexões antigas com o Postgres fecham; a página que estava sendo lida termina na mesma fila', async () => {
    const pg = postgresFalso();
    const n8n = n8nFalso();
    const env = { N8N_FILMES_LER: 'http://n8n:5678/webhook/ler', FILMES_INTERVALO_MS: '0', TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseBase', TEABLE_PG_FILMES: 'filmes', TEABLE_PG_ARTE: 'producao' };
    const pasta = mkdtempSync(join(tmpdir(), 'previas-'));
    const app = criarApp({ db: abrirBanco(':memory:'), env, abrirPg: pg.abrirPg, filmes: (e: object, d: object) => criarFilmes(e, { ...d, pasta, buscar: n8n.buscar }) });
    const servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    fechar = async () => {
      await new Promise<void>((ok) => servidor.close(() => ok()));
      await app.fechar();
    };
    const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    const api = (caminho: string, init: RequestInit = {}) =>
      fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com', 'content-type': 'application/json', ...init.headers } }).then((r) => r.json());
    type Previa = { paginas: { estado: string }[] };
    const ate = async (id: string, ok: (p: Previa) => boolean) => {
      for (let i = 0; i < 100; i++) {
        const p = (await api(`/api/filmes/previas/${id}`)) as Previa;
        if (ok(p)) return p;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error('a fila não chegou lá');
    };

    // a página 2 lida e conferida com o banco de filmes; a página 3 presa na leitura
    const { id } = await api('/api/filmes/previas', { method: 'POST', body: JSON.stringify({ nome: 'PREVIA.pdf', hash: 'previa-config', paginas: [2, 3] }) });
    await api(`/api/filmes/previas/${id}/paginas/2`, { method: 'PUT', body: JSON.stringify(paginaComUmFilme(2)) });
    await ate(id, (p) => p.paginas[0].estado === 'lida');
    const presa = n8n.segurar(3);
    await api(`/api/filmes/previas/${id}/paginas/3`, { method: 'PUT', body: JSON.stringify(paginaComUmFilme(3)) });
    await presa.chegou;
    await api('/api/redator-provavel?atracao=Festa');
    const antes = [...pg.conexoes];
    expect(antes.some((c) => c.sql.some((s) => s.includes('"bseBase"."filmes"')))).toBe(true);
    expect(antes.some((c) => c.sql.some((s) => s.includes('"bseBase"."producao"')))).toBe(true);

    await app.mudarConfiguracao({ TEABLE_PG_FILMES: 'filmes_novos', TEABLE_PG_ARTE: 'producao_nova' }).antigaFechada;
    expect(antes.every((c) => c.fechada)).toBe(true);

    // a leitura que estava indo termina na mesma fila, sem mandar a página de novo
    presa.soltar();
    await ate(id, (p) => p.paginas.every((g) => g.estado === 'lida'));
    expect(n8n.lidas).toEqual([2, 3]);

    // o que vem depois consulta pelas conexões novas, com os nomes novos
    await api('/api/redator-provavel?atracao=Festa');
    const novas = pg.conexoes.filter((c) => !antes.includes(c));
    expect(novas.some((c) => c.sql.some((s) => s.includes('"bseBase"."filmes_novos"')))).toBe(true);
    expect(novas.some((c) => c.sql.some((s) => s.includes('"bseBase"."producao_nova"')))).toBe(true);
    expect(novas.every((c) => !c.fechada)).toBe(true);
  });
});
