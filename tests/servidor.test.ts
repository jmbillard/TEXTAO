// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as sinc from 'y-protocols/sync';
import * as cod from 'lib0/encoding';
import * as dec from 'lib0/decoding';
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
  const app = criarApp({ db, env: { ACESSO: 'privado' } });
  servidor = createServer(app);
  servidor.on('upgrade', app.upgrade);
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

  it('compartilhar com algumas pessoas', async () => {
    const carla = como('carla@empresa.com');
    for (const quem of [ana, beto, carla]) await quem('/api/eu');
    expect((await (await ana('/api/usuarios')).json()).map((u: { email: string }) => u.email)).toEqual(['beto@empresa.com', 'carla@empresa.com']);
    await salvar(ana, 'roteiro-da-ana', { roteiro: { ...roteiro('A').roteiro, compartilhadoCom: [{ email: 'Beto@empresa.com', editar: false }] }, nArtes: 1 });
    expect((await beto('/api/roteiros/roteiro-da-ana')).status).toBe(200);
    expect((await carla('/api/roteiros/roteiro-da-ana')).status).toBe(404);
    expect(await (await carla('/api/roteiros')).json()).toHaveLength(0);
    // quem recebeu lê, mas não altera nem vê com quem mais foi compartilhado
    expect((await salvar(beto, 'roteiro-da-ana', roteiro('invadido'))).status).toBe(403);
    expect((await (await beto('/api/roteiros/roteiro-da-ana')).json()).compartilhadoCom).toBeUndefined();
    expect((await (await ana('/api/roteiros/roteiro-da-ana')).json()).compartilhadoCom).toEqual([{ email: 'beto@empresa.com', editar: false }]);
    // salvar o texto sem mexer no compartilhamento mantém; lista vazia retira
    await salvar(ana, 'roteiro-da-ana', roteiro('A2'));
    expect((await beto('/api/roteiros/roteiro-da-ana')).status).toBe(200);
    await salvar(ana, 'roteiro-da-ana', { roteiro: { ...roteiro('A2').roteiro, compartilhadoCom: [] }, nArtes: 1 });
    expect((await beto('/api/roteiros/roteiro-da-ana')).status).toBe(404);
  });

  it('quem pode editar altera o conteúdo, mas não o compartilhamento', async () => {
    const carla = como('carla@empresa.com');
    await salvar(ana, 'a-quatro-maos', { roteiro: { ...roteiro('A').roteiro, compartilhadoCom: [{ email: 'beto@empresa.com', editar: true }, { email: 'carla@empresa.com', editar: false }] }, nArtes: 0 });
    expect(await (await beto('/api/roteiros/a-quatro-maos')).json()).toMatchObject({ meu: false, podeEditar: true });
    expect(await (await carla('/api/roteiros/a-quatro-maos')).json()).toMatchObject({ meu: false, podeEditar: false });
    // Beto edita e tenta abrir para todos: o texto entra, o compartilhamento não muda
    expect((await salvar(beto, 'a-quatro-maos', { roteiro: { ...roteiro('do Beto', true).roteiro, compartilhadoCom: [] }, nArtes: 0 })).status).toBe(200);
    const visto = await (await ana('/api/roteiros/a-quatro-maos')).json();
    expect(visto.doc.content[0].content[0].text).toBe('do Beto');
    expect(visto.publico).toBe(false);
    expect(visto.compartilhadoCom).toHaveLength(2);
    expect((await salvar(carla, 'a-quatro-maos', roteiro('da Carla'))).status).toBe(403);
    expect((await beto('/api/roteiros/a-quatro-maos', { method: 'DELETE' })).status).toBe(404);
  });

  it('edição simultânea: quem edita sincroniza, quem só lê recebe e não altera', async () => {
    const entrar = (email: string) =>
      new Promise<{ ws: WebSocket; doc: Y.Doc }>((ok, erro) => {
        const ws = new WebSocket(base.replace('http', 'ws') + '/api/colab/a-quatro-maos', { headers: { 'cf-access-authenticated-user-email': email } });
        const doc = new Y.Doc();
        ws.binaryType = 'arraybuffer';
        ws.on('message', (dados: ArrayBuffer) => {
          const d = dec.createDecoder(new Uint8Array(dados));
          if (dec.readVarUint(d) !== 0) return;
          const e = cod.createEncoder();
          cod.writeVarUint(e, 0);
          sinc.readSyncMessage(d, e, doc, ws);
          if (cod.length(e) > 1) ws.send(cod.toUint8Array(e));
        });
        doc.on('update', (u: Uint8Array, origem: unknown) => {
          if (origem === ws) return;
          const e = cod.createEncoder();
          cod.writeVarUint(e, 0);
          sinc.writeUpdate(e, u);
          ws.send(cod.toUint8Array(e));
        });
        ws.on('open', () => {
          const e = cod.createEncoder();
          cod.writeVarUint(e, 0);
          sinc.writeSyncStep1(e, doc);
          ws.send(cod.toUint8Array(e));
          ok({ ws, doc });
        });
        ws.on('error', erro);
      });
    const pausa = () => new Promise((ok) => setTimeout(ok, 150));
    const a = await entrar('ana.lima@empresa.com');
    const b = await entrar('beto@empresa.com');
    const c = await entrar('carla@empresa.com');
    a.doc.getText('t').insert(0, 'Ana. ');
    await pausa();
    b.doc.getText('t').insert(5, 'Beto. ');
    await pausa();
    c.doc.getText('t').insert(0, 'CARLA NÃO PODE. ');
    await pausa();
    expect(a.doc.getText('t').toString()).toBe('Ana. Beto. ');
    expect(b.doc.getText('t').toString()).toBe('Ana. Beto. ');
    // quem só lê recebeu o texto dos outros; o que digitou ficou só com ela
    expect(c.doc.getText('t').toString()).toContain('Ana. Beto. ');
    for (const x of [a, b, c]) x.ws.close();
    await pausa();
    // quem não tem acesso nem conecta
    await expect(entrar('intruso@fora.com')).rejects.toThrow();
    // o documento ficou guardado: quem entra depois recebe tudo
    const d = await entrar('ana.lima@empresa.com');
    await pausa();
    expect(d.doc.getText('t').toString()).toBe('Ana. Beto. ');
    d.ws.close();
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

describe('vocabulário do Teable', () => {
  it('agrupa as chaves por atração, lista redatores e aguenta o Teable fora do ar', async () => {
    // @ts-expect-error módulo JS sem tipos
    const { criarVocabulario } = await import('../servidor/vocabulario.mjs');
    const tabelas: Record<string, unknown[]> = {
      tblA: [
        { fields: { key: 'S TARDE', atracoes: 'Sessão da Tarde' } },
        { fields: { key: 'STARDE', atracoes: 'Sessão da Tarde' } },
        { fields: { key: 'CASA', atracoes: 'É de Casa' } },
      ],
      tblR: [{ fields: { redator: 'Fulana de Tal' } }, { fields: { redator: 'Beltrano Silva' } }],
    };
    let fora = false;
    const pedidos: string[] = [];
    const buscar = (async (url: string, init: { headers: Record<string, string> }) => {
      pedidos.push(url + ' ' + init.headers.authorization);
      if (fora) throw new Error('fora do ar');
      const id = /table\/(\w+)\/record/.exec(url)![1];
      return { ok: true, json: async () => ({ records: tabelas[id] }) };
    }) as unknown as typeof fetch;
    const v = criarVocabulario({ TEABLE_URL: 'http://teable:3000/', TEABLE_TOKEN: 'segredo', TEABLE_ATRACOES: 'tblA', TEABLE_REDATORES: 'tblR' }, buscar);
    expect(await v.ler()).toEqual({
      programas: [
        { nome: 'É de Casa', chaves: ['CASA'] },
        { nome: 'Sessão da Tarde', chaves: ['S TARDE', 'STARDE'] },
      ],
      redatores: ['Beltrano Silva', 'Fulana de Tal'],
      editores: [],
      pauta: [],
    });
    expect(pedidos[0]).toBe('http://teable:3000/api/table/tblA/record?fieldKeyType=name&take=1000&skip=0 Bearer segredo');
    await v.ler();
    expect(pedidos.length).toBe(2); // dentro da validade, não pergunta de novo

    fora = true;
    const semRede = criarVocabulario({ TEABLE_URL: 'http://x', TEABLE_TOKEN: 't', TEABLE_ATRACOES: 'tblA' }, buscar);
    expect(await semRede.ler()).toEqual({ programas: [], redatores: [], editores: [], pauta: [] });
    expect(await criarVocabulario({}, buscar).ler()).toEqual({ programas: [], redatores: [], editores: [], pauta: [] });
  });
});

describe('pauta da edição no Teable', () => {
  it('para a mesma claquete vale o expediente mais recente; a visão entra no pedido', async () => {
    // @ts-expect-error módulo JS sem tipos
    const { criarVocabulario } = await import('../servidor/vocabulario.mjs');
    const pedidos: string[] = [];
    const buscar = (async (url: string) => {
      pedidos.push(url);
      const registros = url.includes('tblE')
        ? [{ fields: { editor: 'Fulano Silva' } }, { fields: { editor: 'Beltrana Souza' } }]
        : [
            { fields: { key: 'FESTA 26 10', editor: [{ id: 'rec1', title: 'Fulano Silva' }], data: '2026-10-24', expediente_inicio: '2026-10-24 06:00' } },
            { fields: { key: 'FESTA 26 10', claquete: 'Festa 26/10 (AH)', editor: [{ id: 'rec2', title: 'Beltrana Souza' }], data: '2026-10-25', expediente_inicio: '2026-10-25 14:00' } },
            { fields: { key: 'FINALIZAR', editor: 'Fulano Silva', data: '2026-10-25' } },
          ];
      return { ok: true, json: async () => ({ records: registros }) };
    }) as unknown as typeof fetch;
    const v = await criarVocabulario({ TEABLE_URL: 'http://teable:3000', TEABLE_TOKEN: 't', TEABLE_EDITORES: 'tblE', TEABLE_PAUTA: 'tblP', TEABLE_PAUTA_VISAO: 'viwRecentes' }, buscar).ler();
    expect(v.editores).toEqual(['Beltrana Souza', 'Fulano Silva']);
    expect(v.pauta).toEqual([{ chave: 'FESTA 26 10', editor: 'Beltrana Souza', claquete: 'Festa 26/10 (AH)' }, { chave: 'FINALIZAR', editor: 'Fulano Silva', claquete: '' }]);
    expect(pedidos.find((u) => u.includes('tblP'))).toContain('&viewId=viwRecentes');
  });
});

describe('pauta grande pela API', () => {
  it('lê do mais novo para o mais antigo e para quando passa de 45 dias', async () => {
    // @ts-expect-error módulo JS sem tipos
    const { criarVocabulario } = await import('../servidor/vocabulario.mjs');
    const hoje = Date.now();
    const dia = (n: number) => new Date(hoje - n * 86400000).toISOString().slice(0, 10);
    // 3500 linhas, as mais novas por último na ordem da tabela
    const linhas = Array.from({ length: 3500 }, (_, i) => ({ fields: { key: `CHAMADA ${i}`, editor: 'Fulano', data: dia(3499 - i) } }));
    linhas.push({ fields: { key: 'AFROPUNK 8 11', editor: 'Alan', data: dia(20) } });
    const pedidos: string[] = [];
    const buscar = (async (url: string) => {
      pedidos.push(url);
      if (url.endsWith('/field')) return { ok: true, json: async () => [{ id: 'fldData', name: 'data' }, { id: 'fldKey', name: 'key' }] };
      const u = new URL(url);
      const pular = Number(u.searchParams.get('skip'));
      const ordem = u.searchParams.get('orderBy');
      const lista = ordem?.includes('fldData') ? [...linhas].sort((a, b) => b.fields.data.localeCompare(a.fields.data)) : linhas;
      return { ok: true, json: async () => ({ records: lista.slice(pular, pular + 1000) }) };
    }) as unknown as typeof fetch;
    const v = await criarVocabulario({ TEABLE_URL: 'http://teable:3000', TEABLE_TOKEN: 't', TEABLE_PAUTA: 'tblP' }, buscar).ler();
    expect(v.pauta.find((p: { chave: string }) => p.chave === 'AFROPUNK 8 11')?.editor).toBe('Alan');
    expect(v.pauta.length).toBeLessThan(60);
    expect(pedidos.filter((u) => u.includes('/record')).length).toBe(1);
  });
});

describe('pauta direto no Postgres do Teable', () => {
  it('consulta por chave, tenta sem a praça e volta para a API se o banco falhar', async () => {
    // @ts-expect-error módulo JS sem tipos
    const { criarPauta } = await import('../servidor/pauta.mjs');
    const vocabulario = { ler: async () => ({ pauta: [{ chave: 'FESTA 26 10', editor: 'Pela Api', claquete: 'Festa 26/10' }] }) };
    const env = { TEABLE_PG_URL: 'postgres://x', TEABLE_PG_ESQUEMA: 'bseABC', TEABLE_PG_PAUTA: 'demandasXYZ' };
    const consultas: unknown[][] = [];
    let fora = false;
    const abrir = async () => ({
      query: async (sql: string, params: unknown[] = []) => {
        consultas.push([sql, params]);
        if (fora) throw new Error('conexão recusada');
        return { rows: params[0] === 'FESTA 26 10' ? [{ editor: 'Do Banco', claquete: 'Festa 26/10 (AH)' }] : [] };
      },
    });
    const pauta = criarPauta(env, vocabulario, abrir);
    expect(await pauta.achar('FESTA 26 10')).toEqual({ editor: 'Do Banco', claquete: 'Festa 26/10 (AH)' });
    expect(consultas[0][0]).toContain('"bseABC"."demandasXYZ"');
    expect(consultas[0][1]).toEqual(['FESTA 26 10']);
    // achou só sem a praça: vale o editor, não a grafia
    expect(await pauta.achar('FESTA 26 10 REDE')).toEqual({ editor: 'Do Banco', claquete: '' });
    expect(await pauta.achar('NADA 1 1')).toEqual({ editor: '', claquete: '' });
    fora = true;
    expect(await pauta.achar('FESTA 26 10')).toEqual({ editor: 'Pela Api', claquete: 'Festa 26/10' });
    // nome de tabela que não é um identificador simples não entra na consulta
    expect(criarPauta({ ...env, TEABLE_PG_PAUTA: 'x"; drop' }, vocabulario, abrir).comBanco).toBe(false);
  });
});

describe('modo aberto (padrão)', () => {
  it('todos veem, editam e apagam todos os roteiros', async () => {
    const banco = abrirBanco(':memory:');
    const app = criarApp({ db: banco, env: {} });
    const s = createServer(app);
    await new Promise<void>((ok) => s.listen(0, ok));
    const url = `http://localhost:${(s.address() as { port: number }).port}`;
    const pedir = (email: string) => (caminho: string, init: RequestInit = {}) =>
      fetch(url + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
    const [a, b] = [pedir('ana@empresa.com'), pedir('beto@empresa.com')];
    try {
      expect((await a('/api/roteiros/aberto-0001', { method: 'PUT', body: JSON.stringify(roteiro('da Ana')) })).status).toBeLessThan(300);
      const lista = (await (await b('/api/roteiros')).json()) as { id: string; meu: boolean; podeEditar: boolean; aberto: boolean }[];
      expect(lista).toMatchObject([{ id: 'aberto-0001', meu: false, podeEditar: true, aberto: true }]);
      expect(await (await b('/api/roteiros/aberto-0001')).json()).toMatchObject({ meu: false, podeEditar: true, aberto: true });
      expect(((await (await b('/api/roteiros')).json()) as { revisadoPor: unknown }[])[0].revisadoPor).toBeNull();
      expect((await b('/api/roteiros/aberto-0001', { method: 'PUT', body: JSON.stringify(roteiro('mexido pelo Beto')) })).status).toBeLessThan(300);
      // quem mexe depois que o roteiro chegou aparece na fila como "revisado por"
      expect(((await (await a('/api/roteiros')).json()) as { revisadoPor: unknown }[])[0].revisadoPor).toEqual({ nome: 'Beto', email: 'beto@empresa.com' });
      expect((await b('/api/roteiros/aberto-0001', { method: 'DELETE' })).status).toBeLessThan(300);
      expect(await (await a('/api/roteiros')).json()).toEqual([]);
    } finally {
      s.close();
    }
  });
});

describe('fila ao vivo: correções da revisão', () => {
  const ouvir = (url: string, email: string, origin?: string) =>
    new Promise<{ ws: WebSocket; recebidos: { tipo: string; id?: string }[] }>((ok, erro) => {
      const ws = new WebSocket(url.replace('http', 'ws') + '/api/eventos', { headers: { 'cf-access-authenticated-user-email': email, ...(origin ? { origin } : {}) } });
      const recebidos: { tipo: string; id?: string }[] = [];
      ws.on('message', (m) => recebidos.push(JSON.parse(String(m))));
      ws.on('open', () => ok({ ws, recebidos }));
      ws.on('error', erro);
    });
  const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  const corpo = (texto: string) => JSON.stringify(roteiro(texto));

  it('recusa conexão em tempo real vinda de outro site', async () => {
    await expect(ouvir(base, 'ana@empresa.com', 'https://outro-site.example')).rejects.toThrow(/403/);
    const { ws } = await ouvir(base, 'ana@empresa.com', base);
    ws.close();
  });

  it('modo privado: quem não pode ler não fica sabendo do roteiro', async () => {
    const carla = await ouvir(base, 'carla@empresa.com');
    await ana('/api/roteiros/so-da-ana-01', { method: 'PUT', body: corpo('segredo') });
    await espera(150);
    carla.ws.close();
    expect(carla.recebidos.filter((e) => e.id === 'so-da-ana-01')).toEqual([]);
  });

  it('modo aberto: mexer só no texto avisa a fila de quem revisou, uma vez por revisor', async () => {
    const banco = abrirBanco(':memory:');
    const app = criarApp({ db: banco, env: {} });
    const s = createServer(app);
    s.on('upgrade', app.upgrade);
    await new Promise<void>((ok) => s.listen(0, ok));
    const url = `http://localhost:${(s.address() as { port: number }).port}`;
    const put = (email: string, texto: string) =>
      fetch(url + '/api/roteiros/rubrica-0001', { method: 'PUT', headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' }, body: corpo(texto) });
    try {
      await put('ana@empresa.com', 'v1');
      const fila = await ouvir(url, 'carla@empresa.com');
      await put('beto@empresa.com', 'v2'); // novo revisor: avisa
      await put('beto@empresa.com', 'v3'); // mesmo revisor, só texto: não avisa de novo
      await espera(150);
      fila.ws.close();
      expect(fila.recebidos.filter((e) => e.tipo === 'alterado').length).toBe(1);
    } finally {
      s.close();
      await app.fechar();
    }
  });
});

describe('cópia local do Teable', () => {
  const copiaEmMemoria = () => {
    const m = new Map<string, { dados: unknown; em: string }>();
    return { ler: (k: string) => m.get(k) ?? null, guardar: (k: string, d: unknown) => void m.set(k, { dados: JSON.parse(JSON.stringify(d)), em: '2026-11-19T10:00:00.000Z' }) };
  };
  it('com o Teable fora do ar (até depois de reiniciar), vale a última leitura boa', async () => {
    // @ts-expect-error módulo JS sem tipos
    const { criarVocabulario } = await import('../servidor/vocabulario.mjs');
    const copia = copiaEmMemoria();
    const env = { TEABLE_URL: 'http://teable:3000', TEABLE_TOKEN: 't', TEABLE_ATRACOES: 'tblA' };
    const ok = (async () => ({ ok: true, json: async () => ({ records: [{ fields: { key: 'CASA', atracoes: 'É de Casa' } }] }) })) as unknown as typeof fetch;
    const fora = (async () => {
      throw new Error('fora do ar');
    }) as unknown as typeof fetch;
    expect((await criarVocabulario(env, ok, null, copia).ler()).programas).toEqual([{ nome: 'É de Casa', chaves: ['CASA'] }]);
    // "reiniciou": instância nova, Teable fora do ar
    expect((await criarVocabulario(env, fora, null, copia).ler()).programas).toEqual([{ nome: 'É de Casa', chaves: ['CASA'] }]);
  });
  it('com o Postgres fora do ar, a pauta vem da cópia', async () => {
    // @ts-expect-error módulo JS sem tipos
    const { criarPauta } = await import('../servidor/pauta.mjs');
    const copia = copiaEmMemoria();
    copia.guardar('pauta-pg', [{ chave: 'FESTA 26 10', editor: 'Fulano Silva', claquete: 'Festa 26/10 (AH)' }]);
    const abrir = async () => ({
      query: async () => {
        throw new Error('conexão recusada');
      },
    });
    const vazio = { ler: async () => ({ pauta: [] }) };
    const pauta = criarPauta({ TEABLE_PG_URL: 'postgres://x', TEABLE_PG_ESQUEMA: 'bseA', TEABLE_PG_PAUTA: 'demandasB' }, vazio, abrir, null, copia);
    try {
      expect(await pauta.achar('FESTA 26 10')).toEqual({ editor: 'Fulano Silva', claquete: 'Festa 26/10 (AH)' });
      expect(await pauta.achar('OUTRA 1 1')).toEqual({ editor: '', claquete: '' });
    } finally {
      pauta.parar();
    }
  });
});
