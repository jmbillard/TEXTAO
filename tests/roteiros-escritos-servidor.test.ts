// @vitest-environment node
/* O Roteiro sendo escrito em "Roteiros" (#189): o Novo roteiro, salvar e reler, visível, fechado e convidado, quem
   escreve e quem só lê, e o roteiro sendo escrito fora da fila, do Trello e de "meus roteiros" de quem não é o autor.
   Pelo servidor inteiro (criarApp), com o Teable de mentira dos cadastros. Nomes e e-mails inventados. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';

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
  tblRed: [
    { id: 'recR1', fields: { redator: 'Marina Teles', email: 'marina.teles@empresa.com' } },
    { id: 'recR2', fields: { redator: 'Júlio Pires', email: 'julio.pires@empresa.com' } },
  ],
  tblEdi: [{ id: 'recE1', fields: { editor: 'Caio Brandão', email: 'caio.brandao@empresa.com' } }],
  tblKeyRed: [],
  tblKeyEdi: [],
};
const buscar = async (url: string) => {
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
};

const texto = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', attrs: { tipo: 'locucao', confirmado: false }, content: [{ type: 'text', text: t }] }] });

describe('o Roteiro sendo escrito em "Roteiros" (#189)', () => {
  let servidor: Server;
  let base = '';
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const marina = como('marina.teles@empresa.com'); // redatora, a autora
  const julio = como('julio.pires@empresa.com'); // outro redator
  const caio = como('caio.brandao@empresa.com'); // editor
  const davi = como('davi.rocha@empresa.com'); // designer, sem cadastro
  const bia = como('bia.coord@empresa.com'); // coordenação
  const chefe = como('chefe@empresa.com'); // administrador
  type Quem = typeof marina;

  const comecar = async (quem: Quem, corpo: Record<string, unknown> = {}) => quem('/api/roteiros-escritos', { method: 'POST', body: JSON.stringify(corpo) });
  const ler = async (quem: Quem, id: string) => quem(`/api/roteiros/${id}`);
  const salvar = async (quem: Quem, id: string, mudar: (r: Record<string, unknown>) => Record<string, unknown>) => {
    const r = await (await ler(marina, id)).json();
    return quem(`/api/roteiros/${id}`, { method: 'PUT', body: JSON.stringify({ roteiro: mudar(r), nArtes: 0 }) });
  };
  const lista = async (quem: Quem) => (await (await quem('/api/roteiros-escritos')).json()) as { podeComecar: boolean; roteiros: { id: string; escrito: string; meu: boolean; podeEditar: boolean; publico: boolean; convidado?: boolean; meta: { titulo: string } }[] };

  beforeAll(async () => {
    // o servidor aberto (o padrão): para o roteiro sendo escrito, a regra dele vale mesmo assim
    const app = criarApp({ db: abrirBanco(':memory:'), env: {}, cadastros: criarCadastros(ENV, { buscar }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    expect((await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) })).status).toBe(200);
  });
  afterAll(() => servidor.close());

  it('o Novo roteiro nasce sendo escrito, visível para a equipe, sem claquete, com o título e a autora de redatora', async () => {
    const r = await comecar(marina, { id: 'escrito-novo-1', titulo: '  Desafio   da Brasa, a final ' });
    expect(r.status).toBe(201);
    const novo = await r.json();
    expect(novo).toMatchObject({ id: 'escrito-novo-1', escrito: 'sendo-escrito', publico: true, meu: true, podeEditar: true });
    expect(novo.meta).toMatchObject({ titulo: 'Desafio da Brasa, a final', claquete: '', redator: 'Marina Teles', status: 'rascunho' });
    expect(novo.doc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    // o mesmo id de novo não cria outro
    expect((await comecar(marina, { id: 'escrito-novo-1' })).status).toBe(409);
  });

  it('o texto digitado se salva e volta ao reler, com o tipo do trecho; o status continua o de rascunho', async () => {
    await comecar(marina, { id: 'escrito-salvar-1', titulo: 'Festival' });
    const r = await salvar(marina, 'escrito-salvar-1', (x) => ({ ...x, meta: { ...(x.meta as object), titulo: 'Festival de Verão', status: 'revisao' }, doc: texto('NESTE SÁBADO, A BRASA DECIDE.') }));
    expect(r.status).toBe(200);
    const lido = await (await ler(marina, 'escrito-salvar-1')).json();
    expect(lido.doc).toEqual(texto('NESTE SÁBADO, A BRASA DECIDE.'));
    expect(lido.meta).toMatchObject({ titulo: 'Festival de Verão', status: 'rascunho' });
    expect(lido.escrito).toBe('sendo-escrito');
  });

  it('visível: a equipe lê; escrevem a autora, a coordenação e o administrador; designer, editor e outro redator só leem', async () => {
    await comecar(marina, { id: 'escrito-visivel-1', titulo: 'Visível' });
    for (const quem of [davi, caio, julio, bia, chefe]) expect((await ler(quem, 'escrito-visivel-1')).status).toBe(200);
    expect((await (await ler(davi, 'escrito-visivel-1')).json()).podeEditar).toBe(false);
    expect((await (await ler(bia, 'escrito-visivel-1')).json()).podeEditar).toBe(true);
    for (const quem of [bia, chefe]) expect((await salvar(quem, 'escrito-visivel-1', (x) => ({ ...x, doc: texto('JUNTO.') }))).status).toBe(200);
    // quem não escreve é recusado pela rota, mesmo com o servidor aberto
    for (const quem of [davi, caio, julio]) {
      const r = await salvar(quem, 'escrito-visivel-1', (x) => ({ ...x, doc: texto('POR CIMA.') }));
      expect(r.status).toBe(403);
      expect((await r.json()).erro).toMatch(/só lê/);
    }
    expect((await (await ler(marina, 'escrito-visivel-1')).json()).doc).toEqual(texto('JUNTO.'));
    // apagar é só da autora (e do administrador)
    expect((await davi('/api/roteiros/escrito-visivel-1', { method: 'DELETE' })).status).toBe(404);
  });

  it('fechado: só a autora e quem ela convidou; o convite de ler só lê, o de escrever escreve; e reabre', async () => {
    await comecar(marina, { id: 'escrito-fechado-1', titulo: 'Fechado' });
    const fechar = (publico: boolean, compartilhadoCom: { email: string; editar: boolean }[]) => salvar(marina, 'escrito-fechado-1', (x) => ({ ...x, publico, compartilhadoCom }));
    expect((await fechar(false, [{ email: 'davi.rocha@empresa.com', editar: false }, { email: 'julio.pires@empresa.com', editar: true }])).status).toBe(200);
    // a coordenação e o administrador não veem o fechado sem convite
    for (const quem of [caio, bia, chefe]) expect((await ler(quem, 'escrito-fechado-1')).status).toBe(403);
    expect((await lista(bia)).roteiros.map((r) => r.id)).not.toContain('escrito-fechado-1');
    // convidados
    expect((await (await ler(davi, 'escrito-fechado-1')).json()).podeEditar).toBe(false);
    expect((await salvar(davi, 'escrito-fechado-1', (x) => ({ ...x, doc: texto('NÃO.') }))).status).toBe(403);
    expect((await salvar(julio, 'escrito-fechado-1', (x) => ({ ...x, doc: texto('A QUATRO MÃOS.') }))).status).toBe(200);
    const doJulio = (await lista(julio)).roteiros.find((r) => r.id === 'escrito-fechado-1');
    expect(doJulio).toMatchObject({ convidado: true, podeEditar: true, publico: false });
    // o convidado escreve, mas não mexe em quem vê
    await salvar(julio, 'escrito-fechado-1', (x) => ({ ...x, publico: true, compartilhadoCom: [] }));
    expect((await ler(bia, 'escrito-fechado-1')).status).toBe(403);
    // reabrir: a equipe volta a ver
    expect((await fechar(true, [])).status).toBe(200);
    expect((await ler(bia, 'escrito-fechado-1')).status).toBe(200);
    expect((await ler(caio, 'escrito-fechado-1')).status).toBe(200);
  });

  it('quem começa: o redator, a coordenação e o administrador; o designer e o editor, não', async () => {
    for (const quem of [julio, bia, chefe]) expect((await comecar(quem)).status).toBe(201);
    for (const quem of [davi, caio]) expect((await comecar(quem)).status).toBe(403);
    expect((await lista(davi)).podeComecar).toBe(false);
    expect((await lista(marina)).podeComecar).toBe(true);
  });

  it('a lista de "Roteiros": os sendo escritos que a pessoa lê, com o estado e se ela escreve', async () => {
    await comecar(marina, { id: 'escrito-lista-1', titulo: 'Na lista' });
    const doDavi = (await lista(davi)).roteiros.find((r) => r.id === 'escrito-lista-1');
    expect(doDavi).toMatchObject({ escrito: 'sendo-escrito', meu: false, podeEditar: false, meta: { titulo: 'Na lista' } });
    expect((await lista(marina)).roteiros.find((r) => r.id === 'escrito-lista-1')).toMatchObject({ meu: true, podeEditar: true });
  });

  it('sendo escrito, o roteiro fica fora da fila e não vai ao Trello (nem, por ele, às Produções e à Pauta)', async () => {
    await comecar(marina, { id: 'escrito-fora-1', titulo: 'Fora da fila' });
    // um roteiro de fora, para a fila não estar vazia
    await davi('/api/roteiros/de-fora-1', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'CHEF(FUT) 3/12 SP', redator: 'Marina Teles' }, doc: texto('LOC') }, nArtes: 1 }) });
    const fila = (await (await davi('/api/roteiros')).json()) as { id: string }[];
    expect(fila.map((r) => r.id)).toContain('de-fora-1');
    expect(fila.some((r) => r.id.startsWith('escrito-'))).toBe(false);
    const r = await marina('/api/roteiros/escrito-fora-1/trello', { method: 'POST', body: JSON.stringify({}) });
    expect(r.status).toBe(409);
  });

  it('em "meus roteiros" do Redator, o roteiro sendo escrito é da autora, no Escrevendo; o de fora segue no ciclo de antes', async () => {
    await comecar(marina, { id: 'escrito-meus-1', titulo: 'Meu' });
    const meus = (await (await marina('/api/meus-roteiros?area=redator')).json()) as { roteiros: { id: string; ciclo: { estado: string; passos: { id: string; situacao: string }[] } }[] };
    const escrito = meus.roteiros.find((r) => r.id === 'escrito-meus-1');
    expect(escrito?.ciclo.estado).toBe('escrevendo');
    expect(escrito?.ciclo.passos[0]).toMatchObject({ id: 'escrevendo', situacao: 'agora' });
    const deFora = meus.roteiros.find((r) => r.id === 'de-fora-1');
    expect(deFora?.ciclo.estado).toBe('revisao');
    expect(deFora?.ciclo.passos[0]).toMatchObject({ id: 'escrevendo', situacao: 'fora' });
    // o do Júlio não aparece nos meus dele como dela; a coordenação (sem cadastro de redator) vê os que ela começou
    const doJulio = (await (await julio('/api/meus-roteiros?area=redator')).json()) as { roteiros: { id: string }[] };
    expect(doJulio.roteiros.map((r) => r.id)).not.toContain('escrito-meus-1');
    await comecar(bia, { id: 'escrito-da-bia-1', titulo: 'Da coordenação' });
    const daBia = (await (await bia('/api/meus-roteiros?area=redator')).json()) as { nome: string | null; roteiros: { id: string }[] };
    expect(daBia.nome).toBeNull();
    expect(daBia.roteiros.map((r) => r.id)).toContain('escrito-da-bia-1');
    expect(daBia.roteiros.map((r) => r.id)).not.toContain('escrito-meus-1');
  });
});
