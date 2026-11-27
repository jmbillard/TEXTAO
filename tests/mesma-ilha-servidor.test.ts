// @vitest-environment node
/* A mesma ilha (#165): "AVID 46", "ILHA 46" e só "46" são a mesma sala (confirmado pela edição em 27/11/2026). As
   repetidas que o cadastro já tinha antes da regra não mudam sozinhas: a montagem as compara pela sala (a ilha
   ocupada, a de costume), os Cadastros dizem quantas posições cada uma tem, e só um administrador as junta, depois de
   conferir. Juntar passa as posições (as do rascunho e as das publicações) para a que fica; a tela aberta antes de
   juntar, que ainda manda a que saiu, grava pela que ficou; e a "pauta alterada" do Teams não acusa a troca. Nomes,
   e-mails e ilhas inventados; 27/11/2026 é uma sexta. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { oQueMudouNaPauta } from '../servidor/cartao-do-teams.mjs';

const ENV = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
  CADASTRO_ADMINS: 'chefe@empresa.com',
};
const TABELAS: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
  tblRed: [],
  tblEdi: [
    { id: 'recE1', fields: { editor: 'Rui Teixeira' } },
    { id: 'recE2', fields: { editor: 'Elis Furtado' } },
    { id: 'recE3', fields: { editor: 'Gil Moura' } },
  ],
  tblKeyRed: [],
  tblKeyEdi: [],
};
const buscar = async (url: string, init: RequestInit = {}) => {
  if ((init.method ?? 'GET') !== 'GET') throw new Error(`a mesma ilha não escreve no Teable: ${init.method} ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
};

const SEXTA = '2026-11-27';
const QUINTA = '2026-11-26';
type Banco = { prepare: (sql: string) => { run: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown[]; get: (...a: unknown[]) => unknown } };

describe('a mesma ilha (#165)', () => {
  let servidor: Server;
  let base = '';
  let db: Banco;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como('chefe@empresa.com');
  const bia = como('bia.coord@empresa.com');
  const ler = async (dia = SEXTA) => (await bia(`/api/montar-pauta?dia=${dia}`)).json();
  const gravar = (corpo: object, dia = SEXTA) => bia(`/api/montar-pauta?dia=${dia}`, { method: 'PUT', body: JSON.stringify(corpo) });
  const posicao = (id: string, turno: string, editor: string, ilha: string, horario = '14h às 23h') => ({ id, turno, editor, ilha, horario, demandas: [], avisos: [] });
  const cadastro = async () => (await (await chefe('/api/cadastros/ilhas')).json()) as { ilhas: { id: string; tipo: string; numero: string }[]; usos: Record<string, number> };
  const juntar = (quem: typeof chefe, fica: string, sai: string) => quem('/api/cadastros/ilhas/juntar', { method: 'POST', body: JSON.stringify({ fica, sai }) });

  beforeAll(async () => {
    db = abrirBanco(':memory:');
    servidor = createServer(criarApp({ db, env: {}, cadastros: criarCadastros(ENV, { buscar }) }));
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    expect((await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) })).status).toBe(200);
    expect((await bia('/api/cadastros/ilhas', { method: 'POST', body: JSON.stringify({ tipo: 'AVID', numero: '46' }) })).status).toBe(201);
    expect((await bia('/api/cadastros/ilhas', { method: 'POST', body: JSON.stringify({ tipo: 'VDI', numero: '5' }) })).status).toBe(201);
    // a ILHA 46 repetida, de antes da regra (hoje o cadastro a recusa)
    db.prepare("INSERT INTO ilhas (id, tipo, numero, nome, por, em) VALUES ('ilha-velha', 'ILHA', '46', '', 'bia.coord@empresa.com', '2026-11-01T12:00:00.000Z')").run();
  });
  afterAll(() => servidor.close());

  const id = async (tipo: string, numero: string) => (await cadastro()).ilhas.find((i) => i.tipo === tipo && i.numero === numero)!.id;

  it('antes de juntar, a montagem compara pela sala: a AVID 46 e a ILHA 46 no mesmo turno estão ocupadas', async () => {
    const avid = await id('AVID', '46');
    const vdi = await id('VDI', '5');
    expect((await gravar({ posicoes: [posicao('p-1', 'tarde', 'Rui Teixeira', avid), posicao('p-2', 'tarde', 'Gil Moura', 'ilha-velha'), posicao('p-3', 'tarde', 'Elis Furtado', vdi)] })).status).toBe(200);
    const d = await ler();
    expect(d.ocupadas).toEqual([
      { posicao: 'p-1', ilha: avid, com: ['p-2'] },
      { posicao: 'p-2', ilha: 'ilha-velha', com: ['p-1'] },
    ]);
    // nada mudou sozinho: cada posição continua com a ilha que tinha
    expect(d.posicoes.map((p: { ilha: string }) => p.ilha)).toEqual([avid, 'ilha-velha', vdi]);
  });

  it('a de costume conta a mesma sala junto', async () => {
    const avid = await id('AVID', '46');
    const vdi = await id('VDI', '5');
    await gravar({ posicoes: [posicao('h-1', 'manha', 'Elis Furtado', vdi)] }, '2026-11-20');
    await gravar({ posicoes: [posicao('h-2', 'manha', 'Elis Furtado', avid)] }, '2026-11-19');
    await gravar({ posicoes: [posicao('h-3', 'manha', 'Elis Furtado', 'ilha-velha')] }, '2026-11-18');
    expect((await ler()).costume['ELIS FURTADO']).toBe(avid);
  });

  it('os Cadastros dizem quantas posições cada uma tem; juntar é só de administradores, e só da mesma sala', async () => {
    const avid = await id('AVID', '46');
    const vdi = await id('VDI', '5');
    expect((await cadastro()).usos).toMatchObject({ [avid]: 2, 'ilha-velha': 2, [vdi]: 2 });
    const recusa = await juntar(bia, avid, 'ilha-velha');
    expect(recusa.status).toBe(403);
    expect((await recusa.json()).erro).toBe('Só administradores juntam ilhas.');
    const outra = await juntar(chefe, avid, vdi);
    expect(outra.status).toBe(400);
    expect((await outra.json()).erro).toBe('AVID 46 e VDI 5 não são a mesma sala.');
    expect((await juntar(chefe, avid, 'nao-existe')).status).toBe(404);
    expect((await cadastro()).ilhas).toHaveLength(3);
  });

  it('juntar passa as posições para a que fica, e o dia publicado continua publicado', async () => {
    const avid = await id('AVID', '46');
    expect((await gravar({ posicoes: [posicao('q-1', 'tarde', 'Rui Teixeira', 'ilha-velha')] }, QUINTA)).status).toBe(200);
    expect((await bia(`/api/montar-pauta/publicar?dia=${QUINTA}`, { method: 'POST' })).status).toBe(200);
    expect((await ler(QUINTA)).estado).toBe('publicado');

    const r = await juntar(chefe, avid, 'ilha-velha');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ posicoes: 3 });
    expect((await cadastro()).ilhas.map((i) => `${i.tipo} ${i.numero}`)).toEqual(['AVID 46', 'VDI 5']);
    expect((await ler()).posicoes.map((p: { ilha: string }) => p.ilha).slice(0, 2)).toEqual([avid, avid]);
    const quinta = await ler(QUINTA);
    expect(quinta.posicoes[0].ilha).toBe(avid);
    expect(quinta.estado).toBe('publicado');
    expect(db.prepare('SELECT id, fica, por FROM ilhas_juntadas').all()).toEqual([{ id: 'ilha-velha', fica: avid, por: 'chefe@empresa.com' }]);
  });

  it('a tela aberta antes de juntar, que ainda manda a que saiu, grava pela que ficou', async () => {
    const avid = await id('AVID', '46');
    const d = await ler();
    const antes = d.posicoes.map((p: { id: string; ilha: string }) => (p.id === 'p-2' ? { ...p, ilha: 'ilha-velha' } : p));
    const tela = antes.map((p: { id: string; horario: string }) => (p.id === 'p-2' ? { ...p, horario: '15h às 23h' } : p));
    expect((await gravar({ posicoes: tela, base: { posicoes: antes, recado: '' } })).status).toBe(200);
    expect((await ler()).posicoes.find((p: { id: string }) => p.id === 'p-2')).toMatchObject({ ilha: avid, horario: '15h às 23h' });
  });

  it('a "pauta alterada" do Teams não acusa a troca pela mesma sala, nem pela juntada', () => {
    const ilhas = [
      { id: 'a46', tipo: 'AVID', numero: '46', nome: '' },
      { id: 'i46', tipo: 'ILHA', numero: '46', nome: '' },
      { id: 'v5', tipo: 'VDI', numero: '5', nome: '' },
    ];
    const pauta = (ilha: string) => ({ posicoes: [{ id: 'p1', turno: 'tarde', editor: 'Rui Teixeira', ilha, horario: '14h às 23h', demandas: [], avisos: [] }], recado: '' });
    expect(oQueMudouNaPauta(pauta('a46'), pauta('i46'), { ilhas })).toEqual([]);
    expect(oQueMudouNaPauta(pauta('saiu'), pauta('a46'), { ilhas, juntadas: { saiu: 'a46' } })).toEqual([]);
    expect(oQueMudouNaPauta(pauta('a46'), pauta('v5'), { ilhas })).toEqual(['Rui Teixeira: AVID 46 → VDI 5']);
  });
});
