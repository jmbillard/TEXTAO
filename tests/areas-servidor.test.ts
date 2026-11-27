// @vitest-environment node
/* As áreas de trabalho (#101): quem é quem pela ligação por e-mail com os cadastros de redatores e editores do Teable
   (falso), a última área lembrada no SQLite e "meus roteiros". Nomes e e-mails inventados. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, fazerBackup } from '../servidor/app.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENV = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
  CADASTRO_ADMINS: 'chefe@empresa.com',
};

/** O Teable de mentira: só as tabelas de redatores e editores (com o e-mail do login) e as das keys, vazias. */
function falso() {
  const tabelas: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
    tblRed: [
      { id: 'recR1', fields: { redator: 'Marina Teles', email: 'marina.teles@empresa.com' } },
      { id: 'recR2', fields: { redator: 'Júlio Pires', email: 'julio.pires@empresa.com' } },
      { id: 'recR3', fields: { redator: 'Otávio Reis' } },
    ],
    tblEdi: [
      { id: 'recE1', fields: { editor: 'Caio Brandão', email: 'caio.brandao@empresa.com' } },
      // o Júlio também edita
      { id: 'recE2', fields: { editor: 'Júlio Pires', email: 'julio.pires@empresa.com' } },
    ],
    tblKeyRed: [],
    tblKeyEdi: [],
  };
  const pedidos: string[] = [];
  const buscar = async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? 'GET';
    pedidos.push(`${metodo} ${url}`);
    const u = new URL(url);
    const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(u.pathname)!;
    if (metodo !== 'GET') throw new Error(`as áreas só leem o Teable: ${metodo} ${url}`);
    return { ok: true, status: 200, json: async () => ({ records: tabelas[tabela] }), text: async () => '' };
  };
  return { tabelas, pedidos, buscar };
}

const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LOC: HOJE' }] }] };

describe('áreas de trabalho (#101)', () => {
  let servidor: Server;
  let base = '';
  let db: unknown;
  let teable: ReturnType<typeof falso>;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const marina = como('marina.teles@empresa.com');
  const caio = como('caio.brandao@empresa.com');
  const julio = como('julio.pires@empresa.com');
  const davi = como('davi.rocha@empresa.com');
  const chefe = como('chefe@empresa.com');
  const eu = async (quem: ReturnType<typeof como>) => (await quem('/api/eu')).json();
  const lembrar = (quem: ReturnType<typeof como>, preferencias: Record<string, unknown>) => quem('/api/eu/preferencias', { method: 'PUT', body: JSON.stringify(preferencias) });
  const subir = async (banco: unknown) => {
    teable = falso();
    const app = criarApp({ db: banco, env: {}, cadastros: criarCadastros(ENV, { buscar: teable.buscar }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  };
  const guardar = (quem: ReturnType<typeof como>, id: string, meta: Record<string, unknown>) =>
    quem(`/api/roteiros/${id}`, { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: '', programa: '', praca: '', dataExibicao: '', redator: '', editor: '', ...meta }, doc }, nArtes: 2 }) });

  beforeAll(async () => {
    db = abrirBanco(':memory:');
    await subir(db);
    // quem sobe os roteiros é a arte (o Davi); o redator e o editor vêm no roteiro, pelo nome
    await guardar(davi, 'rot-chef-1', { claquete: 'CHEF(FUT) 3/12 SP', programa: 'Chef do Futuro', praca: 'SP', dataExibicao: '2026-12-03', redator: 'Marina Teles', editor: 'Caio Brandão' });
    await guardar(davi, 'rot-fest-1', { claquete: 'FESTIVAL(VER) 5/12 REDE', programa: 'Festival de Verão', praca: 'G5', dataExibicao: '2026-12-05', redator: 'MARINA TELES', editor: 'Júlio Pires' });
    await guardar(davi, 'rot-nov-1', { claquete: 'NOVELA7(CAP) 4/12 SP', programa: 'Sete Mares', praca: 'SP', dataExibicao: '2026-12-04', redator: 'Júlio Pires', editor: 'Caio Brandao' });
    await guardar(davi, 'rot-sem-1', { claquete: 'AUDITORIO(DOM) SP', redator: 'Otávio Reis', editor: '' });
  });
  afterAll(() => servidor.close());

  it('pelo e-mail no cadastro: o redator ganha a área Redator, o editor a Editor, e todo mundo a Designer', async () => {
    expect((await eu(marina)).areas).toEqual(['designer', 'redator']);
    expect((await eu(caio)).areas).toEqual(['designer', 'editor']);
  });

  it('quem está nos dois cadastros tem as três áreas; quem não está em nenhum fica só na Designer', async () => {
    expect((await eu(julio)).areas).toEqual(['designer', 'redator', 'editor']);
    expect((await eu(davi)).areas).toEqual(['designer']);
  });

  it('o administrador tem as três áreas, mesmo sem cadastro', async () => {
    const d = await eu(chefe);
    expect(d.admin).toBe(true);
    expect(d.areas).toEqual(['designer', 'redator', 'editor']);
  });

  it('a primeira entrada abre na Designer; a última área usada fica lembrada por pessoa, também com o servidor de novo', async () => {
    expect((await eu(marina)).area).toBe('designer');
    const r = await lembrar(marina, { area: 'redator' });
    expect(r.status).toBe(200);
    expect((await r.json()).preferencias).toEqual({ area: 'redator' });
    expect((await eu(marina)).area).toBe('redator');
    // a de cada um: a do Caio continua a Designer
    expect((await eu(caio)).area).toBe('designer');
    servidor.close();
    await subir(db);
    const d = await eu(marina);
    expect(d.area).toBe('redator');
    expect(d.preferencias).toEqual({ area: 'redator' });
  });

  it('a preferência entra no backup do SQLite', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'promeiro-backup-'));
    try {
      const copia = abrirBanco(fazerBackup(db, pasta));
      const app = criarApp({ db: copia, env: {}, cadastros: criarCadastros(ENV, { buscar: falso().buscar }) });
      const s = createServer(app);
      await new Promise<void>((ok) => s.listen(0, ok));
      const r = await fetch(`http://localhost:${(s.address() as { port: number }).port}/api/eu`, { headers: { 'cf-access-authenticated-user-email': 'marina.teles@empresa.com' } });
      expect((await r.json()).area).toBe('redator');
      s.close();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('a área que a pessoa não tem não é lembrada; a preferência desconhecida é recusada', async () => {
    const r = await lembrar(davi, { area: 'editor' });
    expect(r.status).toBe(400);
    expect((await r.json()).erro).toBe('Você não tem a área editor.');
    expect((await eu(davi)).area).toBe('designer');
    expect((await lembrar(davi, { qualquer: 1 })).status).toBe(400);
    expect((await lembrar(davi, { area: 'designer' })).status).toBe(200);
  });

  it('a área lembrada que a pessoa perdeu (saiu do cadastro) volta à Designer', async () => {
    expect((await lembrar(caio, { area: 'editor' })).status).toBe(200);
    teable.tabelas.tblEdi.splice(0, 1);
    await chefe('/api/cadastros?renovar=1');
    const d = await eu(caio);
    expect(d.areas).toEqual(['designer']);
    expect(d.area).toBe('designer');
  });

  it('"meus roteiros" no Redator: os roteiros em que a pessoa é o redator (o nome sem caixa e acento), por data', async () => {
    const d = await (await julio('/api/meus-roteiros?area=redator')).json();
    expect(d.nome).toBe('Júlio Pires');
    expect(d.roteiros.map((r: { id: string }) => r.id)).toEqual(['rot-nov-1']);
    const m = await (await marina('/api/meus-roteiros?area=redator')).json();
    expect(m.roteiros.map((r: { id: string; meta: { claquete: string } }) => [r.id, r.meta.claquete])).toEqual([
      ['rot-chef-1', 'CHEF(FUT) 3/12 SP'],
      ['rot-fest-1', 'FESTIVAL(VER) 5/12 REDE'],
    ]);
  });

  it('"meus roteiros" no Editor: os roteiros em que a pessoa é o editor', async () => {
    const d = await (await julio('/api/meus-roteiros?area=editor')).json();
    expect(d.nome).toBe('Júlio Pires');
    expect(d.roteiros.map((r: { id: string }) => r.id)).toEqual(['rot-fest-1']);
  });

  it('sem cadastro ligado, "meus roteiros" vem vazio e sem nome; a área que não existe é recusada', async () => {
    expect(await (await davi('/api/meus-roteiros?area=redator')).json()).toEqual({ area: 'redator', nome: null, roteiros: [] });
    expect((await davi('/api/meus-roteiros?area=designer')).status).toBe(400);
    // nada foi escrito no Teable
    expect(teable.pedidos.every((p) => p.startsWith('GET '))).toBe(true);
  });
});
