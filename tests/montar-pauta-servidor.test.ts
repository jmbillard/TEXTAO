// @vitest-environment node
/* Montar a pauta (#123): o papel de coordenação, marcado por um administrador nos Cadastros e guardado no SQLite do
   PROMeiro; o rascunho do dia (as posições, o horário no padrão e as demandas, com a claquete no padrão) gravado e lido
   pela rota /api/montar-pauta, que recusa quem não é da coordenação. Nada vai ao Teable: o Teable falso só responde a
   leitura dos cadastros. Nomes e e-mails inventados. */
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, fazerBackup } from '../servidor/app.mjs';

const ENV = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
  CADASTRO_ADMINS: 'chefe@empresa.com',
};

/** O Teable de mentira: os cadastros de editores (a lista do montar) e de redatores; só leitura. */
function falso() {
  const tabelas: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
    tblRed: [],
    tblEdi: [
      { id: 'recE1', fields: { editor: 'Rui Teixeira' } },
      { id: 'recE2', fields: { editor: 'Elis Furtado', email: 'elis.furtado@empresa.com' } },
      { id: 'recE3', fields: { editor: 'Gil Moura' } },
    ],
    tblKeyRed: [],
    tblKeyEdi: [],
  };
  const pedidos: string[] = [];
  const buscar = async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? 'GET';
    pedidos.push(`${metodo} ${url}`);
    if (metodo !== 'GET') throw new Error(`montar a pauta não escreve no Teable: ${metodo} ${url}`);
    const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
    return { ok: true, status: 200, json: async () => ({ records: tabelas[tabela] }), text: async () => '' };
  };
  return { pedidos, buscar };
}

const SEXTA = '2026-11-27';

describe('montar a pauta: o papel de coordenação e o rascunho do dia (#123)', () => {
  let servidor: Server;
  let base = '';
  let db: unknown;
  let teable: ReturnType<typeof falso>;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como('chefe@empresa.com');
  const bia = como('bia.coord@empresa.com');
  const elis = como('elis.furtado@empresa.com');
  const subir = async (banco: unknown) => {
    teable = falso();
    const app = criarApp({ db: banco, env: {}, cadastros: criarCadastros(ENV, { buscar: teable.buscar }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  };
  const marcar = (quem: ReturnType<typeof como>, email: string) => quem('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email }) });
  const tirar = (quem: ReturnType<typeof como>, email: string) => quem(`/api/cadastros/coordenacao?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
  const ler = (quem: ReturnType<typeof como>, dia = SEXTA) => quem(`/api/montar-pauta?dia=${dia}`);
  const gravar = (quem: ReturnType<typeof como>, posicoes: unknown, dia = SEXTA) => quem(`/api/montar-pauta?dia=${dia}`, { method: 'PUT', body: JSON.stringify({ posicoes }) });

  const RASCUNHO = [
    { id: 'pos-1', turno: 'madrugada', editor: 'Rui Teixeira', horario: '22H ÀS 06', demandas: [{ id: 'd-1', texto: 'Noite de Gala 27/11 Dp' }, { id: 'd-2', texto: '   ' }, { id: 'd-3', texto: 'COMUNICAÇÃO' }] },
    { id: 'pos-2', turno: 'tarde', editor: 'Elis Furtado', horario: 'depois do almoço', demandas: [{ id: 'd-4', texto: 'Mundo Animal 30/11 (P)' }] },
    { id: 'pos-3', turno: 'tarde', editor: '', horario: '14 as 22:53', demandas: [] },
  ];

  beforeAll(async () => {
    db = abrirBanco(':memory:');
    await subir(db);
  });
  afterAll(() => servidor.close());

  it('ninguém nasce da coordenação: nem o administrador', async () => {
    expect((await (await chefe('/api/eu')).json()).coordenacao).toBe(false);
    expect((await (await bia('/api/eu')).json()).coordenacao).toBe(false);
    expect((await ler(chefe)).status).toBe(403);
  });

  it('só um administrador marca a coordenação nos Cadastros', async () => {
    const r = await marcar(elis, 'bia.coord@empresa.com');
    expect(r.status).toBe(403);
    expect((await r.json()).erro).toBe('Só administradores marcam a coordenação.');
    expect((await marcar(chefe, 'não é e-mail')).status).toBe(400);
    expect((await marcar(chefe, 'Bia.Coord@Empresa.com')).status).toBe(200);
    // os Cadastros dizem quem é da coordenação
    expect((await (await chefe('/api/cadastros')).json()).coordenacao).toEqual(['bia.coord@empresa.com']);
  });

  it('a coordenação se vê como coordenação e ganha a área do Editor', async () => {
    const d = await (await bia('/api/eu')).json();
    expect(d.coordenacao).toBe(true);
    expect(d.areas).toEqual(['designer', 'editor']);
  });

  it('o dia vazio: os turnos, as abas da semana e a lista dos editores cadastrados', async () => {
    const r = await ler(bia);
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d).toMatchObject({ dia: SEXTA, estado: 'vazio', posicoes: [], gravadoEm: null });
    expect(d.turnos.map((t: { id: string }) => t.id)).toEqual(['madrugada', 'manha', 'tarde', 'noite']);
    expect(d.semana.map((s: { dia: string }) => s.dia)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    expect(d.semana.every((s: { estado: string }) => s.estado === 'vazio')).toBe(true);
    expect(d.editores).toEqual(['Elis Furtado', 'Gil Moura', 'Rui Teixeira']);
  });

  it('o rascunho gravado e lido: o horário e a claquete no padrão, a linha vazia fora', async () => {
    const r = await gravar(bia, RASCUNHO);
    expect(r.status).toBe(200);
    const d = await (await ler(bia)).json();
    expect(d.estado).toBe('rascunho');
    expect(d.gravadoPor).toBe('bia.coord@empresa.com');
    expect(d.posicoes).toEqual([
      { id: 'pos-1', turno: 'madrugada', editor: 'Rui Teixeira', horario: '22h às 6h', demandas: [{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }, { id: 'd-3', texto: 'COMUNICAÇÃO' }] },
      // o horário que o PROMeiro não entende fica como foi escrito
      { id: 'pos-2', turno: 'tarde', editor: 'Elis Furtado', horario: 'depois do almoço', demandas: [{ id: 'd-4', texto: 'Mundo Animal 30/11 (P)' }] },
      { id: 'pos-3', turno: 'tarde', editor: '', horario: '14h às 22h53', demandas: [] },
    ]);
    // a aba do dia passa a rascunho; as outras continuam vazias
    expect(d.semana.find((s: { dia: string }) => s.dia === SEXTA).estado).toBe('rascunho');
    expect(d.semana.filter((s: { estado: string }) => s.estado === 'rascunho')).toHaveLength(1);
    // nada foi ao Teable além da leitura dos cadastros
    expect(teable.pedidos.every((p) => p.startsWith('GET '))).toBe(true);
  });

  it('gravar de novo troca o dia inteiro; sem posição, o dia volta a vazio', async () => {
    await gravar(bia, [RASCUNHO[0]]);
    expect((await (await ler(bia)).json()).posicoes.map((p: { id: string }) => p.id)).toEqual(['pos-1']);
    await gravar(bia, [], '2026-11-28');
    expect((await (await ler(bia, '2026-11-28')).json()).estado).toBe('vazio');
  });

  it('o rascunho fica no SQLite: vale depois de reiniciar e entra no backup', async () => {
    servidor.close();
    await subir(db);
    expect((await (await ler(bia)).json()).posicoes[0].horario).toBe('22h às 6h');
    const pasta = mkdtempSync(join(tmpdir(), 'promeiro-backup-'));
    try {
      const copia = abrirBanco(fazerBackup(db, pasta));
      const app = criarApp({ db: copia, env: {}, cadastros: criarCadastros(ENV, { buscar: falso().buscar }) });
      const s = createServer(app);
      await new Promise<void>((ok) => s.listen(0, ok));
      const r = await fetch(`http://localhost:${(s.address() as { port: number }).port}/api/montar-pauta?dia=${SEXTA}`, { headers: { 'cf-access-authenticated-user-email': 'bia.coord@empresa.com' } });
      expect((await r.json()).posicoes.map((p: { id: string }) => p.id)).toEqual(['pos-1']);
      s.close();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('quem não é da coordenação não lê nem grava o rascunho', async () => {
    for (const quem of [elis, chefe]) {
      const r = await ler(quem);
      expect(r.status).toBe(403);
      expect((await r.json()).erro).toBe('Só a coordenação monta a pauta.');
      expect((await gravar(quem, RASCUNHO)).status).toBe(403);
    }
    expect((await (await ler(bia)).json()).posicoes).toHaveLength(1);
  });

  it('o pedido malformado é recusado, sem mexer no rascunho', async () => {
    expect((await gravar(bia, [{ ...RASCUNHO[0], turno: 'almoço' }])).status).toBe(400);
    expect((await gravar(bia, 'nada')).status).toBe(400);
    expect((await bia('/api/montar-pauta?dia=2026-02-30')).status).toBe(400);
    expect((await (await ler(bia)).json()).posicoes).toHaveLength(1);
  });

  it('tirada da coordenação, a pessoa passa a ser recusada', async () => {
    expect((await tirar(elis, 'bia.coord@empresa.com')).status).toBe(403);
    expect((await tirar(chefe, 'bia.coord@empresa.com')).status).toBe(200);
    expect((await (await bia('/api/eu')).json()).coordenacao).toBe(false);
    expect((await ler(bia)).status).toBe(403);
    expect((await (await chefe('/api/cadastros')).json()).coordenacao).toEqual([]);
  });
});
