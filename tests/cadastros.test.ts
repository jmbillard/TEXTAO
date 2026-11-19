// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros, normalizarKey } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';

const ENV = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'leitura',
  TEABLE_TOKEN_ESCRITA: 'escrita',
  TEABLE_CADASTRO: 'tblAtr',
  TEABLE_ATRACOES: 'tblKeyAtr',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_API: 'http://trello/1',
  CADASTRO_ADMINS: 'chefe@empresa.com',
};

/** Um Teable de mentira, com as cinco tabelas, e o Trello. Nomes inventados. */
function falso() {
  let n = 100;
  const tabelas: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
    tblAtr: [
      { id: 'recA1', fields: { atracao: 'Show da Noite', categoria: 'Variedades', pasta: 'SHOW', projeto_win: 'P:\\SHOW' } },
      { id: 'recA2', fields: { atracao: 'A Casa da Colina', categoria: 'Novelas', pasta: 'COLINA' } },
    ],
    tblKeyAtr: [
      { id: 'recK1', fields: { key: 'SHOW DA NOITE', atracoes: [{ id: 'recA1', title: 'Show da Noite' }] } },
      { id: 'recK2', fields: { key: 'COLINA', atracoes: [{ id: 'recA2', title: 'A Casa da Colina' }] } },
    ],
    tblRed: [{ id: 'recR1', fields: { user: 'ana.lima', redator: 'Ana Lima', redator_ID: 'opAna', customField_ID: 'cRedator' } }],
    tblEdi: [{ id: 'recE1', fields: { editor: 'Bruno Regis', editor_ID: 'opBruno', customField_ID: 'cEditor' } }],
    tblKeyEdi: [{ id: 'recKE1', fields: { key: 'BRUNO', editor: [{ id: 'recE1', title: 'Bruno Regis' }] } }],
  };
  const pedidos: { metodo: string; url: string; corpo: unknown; token?: string }[] = [];
  const buscar = async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? 'GET';
    const corpo = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    pedidos.push({ metodo, url, corpo, token: (init.headers as Record<string, string>)?.authorization });
    const ok = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
    const u = new URL(url);
    if (u.host === 'trello') return ok({ id: 'opNova' + ++n });
    const m = /\/api\/table\/(\w+)\/(record|field)(?:\/(\w+))?/.exec(u.pathname)!;
    const [, tabela, oque, recId] = m;
    if (oque === 'field')
      return ok([
        { id: 'fldNome', name: 'atracao', type: 'singleLineText' },
        { id: 'fldCat', name: 'categoria', type: 'singleSelect', options: { choices: [{ name: 'Novelas' }, { name: 'Variedades' }, { name: 'Esportes' }] } },
        { id: 'fldPasta', name: 'pasta', type: 'singleLineText' },
        { id: 'fldServ', name: 'servidor', type: 'singleSelect', options: { choices: [{ name: 'HP' }, { name: 'SP' }] } },
        { id: 'fldProj', name: 'projeto_win', type: 'formula', isComputed: true, options: { expression: '"\\\\\\\\" & {fldServ} & "\\\\" & {fldPasta} & "\\\\" & {fldNome}' } },
        { id: 'fldOut', name: 'output_win', type: 'formula', isComputed: true, options: { expression: '{fldProj} & "\\\\OUTPUT"' } },
      ]);
    if (metodo === 'GET') return ok({ records: tabelas[tabela].map((r) => ({ id: r.id, fields: r.fields })) });
    if (metodo === 'DELETE') {
      tabelas[tabela] = tabelas[tabela].filter((r) => r.id !== recId);
      return ok({});
    }
    const novo = { id: 'rec' + ++n, fields: (corpo as { records: { fields: Record<string, unknown> }[] }).records[0].fields };
    tabelas[tabela].push(novo);
    return ok({ records: [novo] });
  };
  return { buscar, pedidos, tabelas };
}

describe('cadastros no Teable', () => {
  it('lê atrações com as keys, as categorias do campo e os campos que as fórmulas dos caminhos usam', async () => {
    const { buscar } = falso();
    const c = criarCadastros(ENV, { buscar });
    const d = await c.ler();
    expect(d.atracoes.map((a: { nome: string; keys: { key: string }[] }) => [a.nome, a.keys.map((k) => k.key)])).toEqual([
      ['A Casa da Colina', ['COLINA']],
      ['Show da Noite', ['SHOW DA NOITE']],
    ]);
    expect(d.categorias).toEqual(['Novelas', 'Variedades', 'Esportes']);
    // nome e categoria já estão no formulário; o caminho pede só servidor e pasta
    expect(d.camposCaminho).toEqual([
      { nome: 'servidor', tipo: 'singleSelect', opcoes: ['HP', 'SP'] },
      { nome: 'pasta', tipo: 'singleLineText', opcoes: null },
    ]);
    expect(d.formulas.projeto_win).toContain('{servidor}');
    expect(d.editores[0]).toMatchObject({ nome: 'Bruno Regis', keys: [{ id: 'recKE1', key: 'BRUNO' }], trello: true });
  });

  it('atração nova: registro, keys ligadas e normalizadas; key repetida é recusada', async () => {
    const { buscar, pedidos, tabelas } = falso();
    const vocab = { renovacoes: 0, renovar: async () => void vocab.renovacoes++ };
    const c = criarCadastros(ENV, { buscar, vocabulario: vocab });
    const r = await c.novaAtracao({ nome: '  Festa na  Praça ', categoria: 'Variedades', keys: ['Festa na Praça', 'festa'], campos: { pasta: 'FESTA', servidor: 'HP', inventado: 'x' } });
    expect(r.keys).toEqual(['FESTA NA PRACA', 'FESTA']);
    expect(tabelas.tblAtr.at(-1)!.fields).toEqual({ atracao: 'Festa na Praça', categoria: 'Variedades', servidor: 'HP', pasta: 'FESTA' });
    expect(tabelas.tblKeyAtr.slice(-2).map((k) => k.fields)).toEqual([
      { key: 'FESTA NA PRACA', atracoes: [{ id: r.id }] },
      { key: 'FESTA', atracoes: [{ id: r.id }] },
    ]);
    expect(pedidos.filter((p) => p.metodo === 'POST').every((p) => p.token === 'Bearer escrita')).toBe(true);
    expect(vocab.renovacoes).toBe(1);
    await expect(c.novaKey('atracao', 'recA2', 'show da noite')).rejects.toThrow('A key SHOW DA NOITE já é de Show da Noite.');
    expect((await c.novaKey('atracao', 'recA2', 'colina resumo')).key).toBe('COLINA RESUMO');
  });

  it('redator e editor novos viram opção no Trello e linha no Teable', async () => {
    const { buscar, pedidos, tabelas } = falso();
    const c = criarCadastros(ENV, { buscar });
    const r = await c.novoRedator({ nome: 'Gabriel Pires', user: 'gpires' });
    expect(r.trello).toBe(true);
    const op = pedidos.find((p) => p.url.includes('/customField/cRedator/options'))!;
    expect(op.corpo).toEqual({ pos: 'bottom', value: { text: 'Gabriel Pires' } });
    expect(tabelas.tblRed.at(-1)!.fields).toMatchObject({ user: 'gpires', redator: 'Gabriel Pires', customField_ID: 'cRedator' });
    await expect(c.novoRedator({ nome: 'ana lima' })).rejects.toThrow('já está cadastrado');

    const e = await c.novoEditor({ nome: 'Marina Castro', keys: ['marina', 'Marina 16'] });
    expect(pedidos.some((p) => p.url.includes('/customField/cEditor/options'))).toBe(true);
    expect(tabelas.tblKeyEdi.slice(-2).map((k) => k.fields)).toEqual([
      { key: 'MARINA', editor: [{ id: e.id }] },
      { key: 'MARINA 16', editor: [{ id: e.id }] },
    ]);
  });

  it('remover editor leva as keys junto e não mexe no Trello', async () => {
    const { buscar, pedidos, tabelas } = falso();
    const c = criarCadastros(ENV, { buscar });
    await c.remover('editor', 'recE1');
    expect(tabelas.tblEdi).toHaveLength(0);
    expect(tabelas.tblKeyEdi).toHaveLength(0);
    expect(pedidos.some((p) => p.url.includes('trello'))).toBe(false);
  });

  it('key do jeito da pauta', () => {
    expect(normalizarKey(' São João & Cia. ')).toBe('SAO JOAO E CIA');
  });
});

describe('rotas dos cadastros', () => {
  let servidor: Server;
  let base = '';
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const ana = como('ana@empresa.com');
  const chefe = como('chefe@empresa.com');
  beforeAll(async () => {
    const { buscar } = falso();
    const app = criarApp({ db: abrirBanco(':memory:'), env: {}, cadastros: criarCadastros(ENV, { buscar }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  });
  afterAll(() => servidor.close());

  it('todos cadastram, só administradores removem', async () => {
    const lista = await (await ana('/api/cadastros')).json();
    expect(lista.podeApagar).toBe(false);
    expect((await (await chefe('/api/cadastros')).json()).podeApagar).toBe(true);
    const r = await ana('/api/cadastros/atracoes', { method: 'POST', body: JSON.stringify({ nome: 'Festa na Praça', keys: ['FESTA'] }) });
    expect(r.status).toBe(200);
    const sem = await ana('/api/cadastros/atracoes', { method: 'POST', body: JSON.stringify({ nome: 'Sem Key', keys: [] }) });
    expect(sem.status).toBe(400);
    expect((await sem.json()).erro).toBe('A atração precisa de pelo menos uma key.');
    expect((await ana('/api/cadastros/redatores/recR1', { method: 'DELETE' })).status).toBe(403);
    expect((await chefe('/api/cadastros/redatores/recR1', { method: 'DELETE' })).status).toBe(200);
    expect((await chefe('/api/cadastros/editores/recE1/keys/recKE1', { method: 'DELETE' })).status).toBe(200);
    expect((await ana('/api/cadastros/atracoes/recA2/keys', { method: 'POST', body: JSON.stringify({ key: 'colina 2' }) })).status).toBe(200);
  });
});
