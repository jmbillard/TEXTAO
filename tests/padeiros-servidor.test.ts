// @vitest-environment node
import { createServer, request } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, fazerBackup } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* O caminho do Padeiro (#137): as rotas embaixo de /api/padeiro/ só respondem com a chave do Padeiro num cabeçalho e
   nunca aceitam o login do Access. O cadastro devolve a chave (pendente), o administrador liga a um designer cadastrado
   (a tabela designers do Teable de mentira, a mesma que a Configuração · Pessoas lê) e pode revogar. Nomes, usuários,
   computadores e e-mails inventados. */

const CHEFE = 'chefe@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });
const designers = () => [
  registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana.souza@empresa.com', designer_ID: 'membroAna', status: 'ativo' }),
  registro('recDesignerCaio', { designer: 'Caio Prates', email: 'caio@empresa.com', designer_ID: 'membroCaio', status: 'ativo' }),
  registro('recDesignerVelho', { designer: 'Davi Antigo', email: 'davi@empresa.com', status: 'inativo' }),
];

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function comServidor({ db = abrirBanco(':memory:') } = {}) {
  const teable = teableFalso({ ARTE_producao: 'arte_pg', designers: 'designers_pg' }, { registros: { ARTE_producao: [], designers: designers() } });
  const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg });
  await app.pessoasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  /** O Padeiro: sem login, com a chave no cabeçalho (quando tem). */
  const padeiro = (caminho: string, { chave, ...init }: RequestInit & { chave?: string } = {}) =>
    fetch(base + caminho, { ...init, headers: { 'content-type': 'application/json', ...(chave ? { 'x-chave-do-padeiro': chave } : {}), ...init.headers } });
  /** O pedido com o caminho exatamente como vai (o fetch arrumaria o %2e%2e e as barras repetidas antes de mandar). */
  const cru = (caminho: string, headers: Record<string, string> = {}) =>
    new Promise<number>((ok, falhou) => {
      const r = request(base + '/', { path: caminho, headers }, (resposta) => (resposta.resume(), ok(resposta.statusCode ?? 0)));
      r.on('error', falhou);
      r.end();
    });
  /** Alguém logado pelo Access. */
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const cadastrar = async (o: Record<string, string> = {}) => {
    const r = await padeiro('/api/padeiro/cadastro', { method: 'POST', body: JSON.stringify({ usuario: 'ana.souza', computador: 'MAC-ARTE-07', sistema: 'macOS 15.1', sigla: 'ANA', ...o }) });
    return { status: r.status, corpo: (await r.json()) as { chave: string; estado: string } };
  };
  const quemSou = async (chave?: string) => {
    const r = await padeiro('/api/padeiro/eu', { chave });
    return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
  };
  return { db, base, padeiro, cru, cadastrar, quemSou, chefe: como(CHEFE), ana: como('ana.souza@empresa.com') };
}

describe('o caminho do Padeiro: o cadastro e a chave', () => {
  it('o Padeiro se cadastra e recebe a chave; "quem sou eu" diz que ela está pendente', async () => {
    const { cadastrar, quemSou } = await comServidor();
    const { status, corpo } = await cadastrar();
    expect(status).toBe(201);
    expect(corpo.estado).toBe('pendente');
    expect(corpo.chave).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const eu = await quemSou(corpo.chave);
    expect(eu.status).toBe(200);
    expect(eu.corpo).toEqual({ estado: 'pendente', usuario: 'ana.souza', computador: 'MAC-ARTE-07', sigla: 'ANA', designer: null });
  });

  it('sem a chave, com a errada ou só com o login do Access, o caminho do Padeiro recusa', async () => {
    const { cadastrar, quemSou, padeiro } = await comServidor();
    const { corpo } = await cadastrar();
    expect((await quemSou()).status).toBe(401);
    expect((await quemSou('chave-inventada')).status).toBe(401);
    // a chave com uma letra trocada
    const trocada = (corpo.chave[0] === 'A' ? 'B' : 'A') + corpo.chave.slice(1);
    expect((await quemSou(trocada)).status).toBe(401);
    // o login do Access (o de um administrador, até) não vale aqui
    const r = await padeiro('/api/padeiro/eu', { headers: { 'cf-access-authenticated-user-email': CHEFE } });
    expect(r.status).toBe(401);
    // a chave vai no cabeçalho, não no endereço
    expect((await padeiro(`/api/padeiro/eu?chave=${corpo.chave}`)).status).toBe(401);
  });

  it('nada embaixo de /api/padeiro chega às rotas com login', async () => {
    const { cadastrar, cru, chefe } = await comServidor();
    const { corpo } = await cadastrar();
    // as rotas com login respondem ao administrador…
    expect((await chefe('/api/cadastros/padeiros')).status).toBe(200);
    expect((await chefe('/api/roteiros')).status).toBe(200);
    // …mas, embaixo do caminho do Padeiro, nem com o login do Access nem com a chave
    const forjado = { 'cf-access-authenticated-user-email': CHEFE };
    for (const caminho of ['/api/padeiro/roteiros', '/api/padeiro/%2e%2e/cadastros/padeiros', '/api/padeiro/%2E%2E/roteiros', '/api//padeiro/%2e%2e/roteiros', '/API/padeiro/%2e%2e/roteiros', '/api/padeiro/cadastros/padeiros', '/api/padeiros', '/api/padeiro', '/api/padeiro/', '/api/padeiro/eu/mais'])
      for (const chave of [undefined, corpo.chave]) expect(await cru(caminho, { ...forjado, ...(chave ? { 'x-chave-do-padeiro': chave } : {}) }), caminho).toBe(404);
  });

  it('as rotas do Padeiro só respondem ao método delas', async () => {
    const { cadastrar, padeiro } = await comServidor();
    const { corpo } = await cadastrar();
    expect((await padeiro('/api/padeiro/eu', { method: 'POST', chave: corpo.chave })).status).toBe(404);
    expect((await padeiro('/api/padeiro/cadastro')).status).toBe(404);
  });
});

type Padeiro = { id: string; usuario: string; computador: string; sistema: string; sigla: string; estado: string; designer: { registro: string; nome: string } | null; sugestao: { registro: string; nome: string } | null; ultimoAviso: string | null; pedidoNovo: boolean; substitui: string | null };
type Lista = { padeiros: Padeiro[]; designers: { registro: string; nome: string }[] };

describe('a aba Padeiros: ligar e revogar a chave', () => {
  const lista = async (quem: (c: string, i?: RequestInit) => Promise<Response>) => (await (await quem('/api/cadastros/padeiros')).json()) as Lista;
  const ligar = (quem: (c: string, i?: RequestInit) => Promise<Response>, id: string, designer: string) => quem(`/api/cadastros/padeiros/${id}/ligar`, { method: 'POST', body: JSON.stringify({ designer }) });
  const revogar = (quem: (c: string, i?: RequestInit) => Promise<Response>, id: string) => quem(`/api/cadastros/padeiros/${id}/revogar`, { method: 'POST' });

  it('o administrador vê os Padeiros, com a sugestão de designer pela sigla, e os designers cadastrados ativos', async () => {
    const { cadastrar, chefe } = await comServidor();
    await cadastrar();
    await cadastrar({ usuario: 'cprates', computador: 'WIN-ARTE-02', sistema: 'Windows 11', sigla: 'CP' });
    await cadastrar({ usuario: 'visita', computador: 'MAC-EMPRESTADO', sistema: 'macOS 14', sigla: 'XYZ' });
    const l = await lista(chefe);
    expect(l.designers).toEqual([
      { registro: 'recDesignerAna', nome: 'Ana Souza' },
      { registro: 'recDesignerCaio', nome: 'Caio Prates' },
    ]);
    const resumo = l.padeiros.map((p) => [p.usuario, p.computador, p.sistema, p.sigla, p.estado, p.designer, p.sugestao?.nome ?? null, p.ultimoAviso]);
    expect(resumo).toEqual([
      ['ana.souza', 'MAC-ARTE-07', 'macOS 15.1', 'ANA', 'pendente', null, 'Ana Souza', null],
      ['cprates', 'WIN-ARTE-02', 'Windows 11', 'CP', 'pendente', null, 'Caio Prates', null],
      ['visita', 'MAC-EMPRESTADO', 'macOS 14', 'XYZ', 'pendente', null, null, null],
    ]);
    // a chave (nem o hash) não sai daqui
    expect(JSON.stringify(l)).not.toMatch(/chave|hash/i);
  });

  it('ligar a chave a um designer: o Padeiro passa a ver "ligada", com o designer', async () => {
    const { cadastrar, quemSou, chefe } = await comServidor();
    const { corpo } = await cadastrar();
    const [p] = (await lista(chefe)).padeiros;
    const r = await ligar(chefe, p.id, 'recDesignerAna');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ padeiro: { id: p.id, estado: 'ligada', designer: { registro: 'recDesignerAna', nome: 'Ana Souza' } } });
    expect((await quemSou(corpo.chave)).corpo).toEqual({ estado: 'ligada', usuario: 'ana.souza', computador: 'MAC-ARTE-07', sigla: 'ANA', designer: { nome: 'Ana Souza' } });
    // trocar o designer da ligada
    await ligar(chefe, p.id, 'recDesignerCaio');
    expect((await quemSou(corpo.chave)).corpo).toMatchObject({ estado: 'ligada', designer: { nome: 'Caio Prates' } });
  });

  it('só um designer cadastrado e ativo; o Padeiro que não existe, 404', async () => {
    const { cadastrar, chefe } = await comServidor();
    await cadastrar();
    const [p] = (await lista(chefe)).padeiros;
    expect((await ligar(chefe, p.id, 'recNinguem')).status).toBe(400);
    expect((await ligar(chefe, p.id, 'recDesignerVelho')).status).toBe(400);
    expect((await ligar(chefe, 'nao-existe', 'recDesignerAna')).status).toBe(404);
    expect((await lista(chefe)).padeiros[0].estado).toBe('pendente');
  });

  it('revogar: o Padeiro vê "revogada"; a chave não volta, e o cadastro novo do mesmo par troca a chave e volta a pendente', async () => {
    const { cadastrar, quemSou, chefe } = await comServidor();
    const antiga = (await cadastrar()).corpo.chave;
    const [p] = (await lista(chefe)).padeiros;
    await ligar(chefe, p.id, 'recDesignerAna');
    const r = await revogar(chefe, p.id);
    expect(r.status).toBe(200);
    expect((await quemSou(antiga)).corpo).toMatchObject({ estado: 'revogada' });
    // a revogada não se liga de novo: o Padeiro pede outra chave
    expect((await ligar(chefe, p.id, 'recDesignerAna')).status).toBe(409);
    // o mesmo usuário no mesmo computador (em outra caixa) se cadastra de novo: outra chave, pendente; a antiga não vale
    const nova = (await cadastrar({ usuario: 'Ana.Souza', computador: 'mac-arte-07', sistema: 'macOS 15.2' })).corpo.chave;
    expect(nova).not.toBe(antiga);
    expect((await quemSou(nova)).corpo).toMatchObject({ estado: 'pendente', designer: null });
    expect((await quemSou(antiga)).status).toBe(401);
    const depois = (await lista(chefe)).padeiros;
    expect(depois).toHaveLength(1);
    expect(depois[0]).toMatchObject({ estado: 'pendente', designer: null, sistema: 'macOS 15.2' });
  });

  it('o recadastro de um Padeiro pendente troca a chave na hora (a antiga cai)', async () => {
    const { cadastrar, quemSou, chefe } = await comServidor();
    const antiga = (await cadastrar()).corpo.chave;
    const nova = (await cadastrar({ sistema: 'macOS 15.2' })).corpo.chave;
    expect((await quemSou(antiga)).status).toBe(401);
    expect((await quemSou(nova)).corpo).toMatchObject({ estado: 'pendente', designer: null });
    expect((await lista(chefe)).padeiros).toHaveLength(1);
  });

  it('o recadastro de um Padeiro ligado não derruba a chave: vira um pedido novo, pendente, ao lado da ligada', async () => {
    const { cadastrar, quemSou, chefe } = await comServidor();
    const antiga = (await cadastrar()).corpo.chave;
    await cadastrar({ usuario: 'cprates', computador: 'WIN-ARTE-02', sistema: 'Windows 11', sigla: 'CP' });
    const ligada = (await lista(chefe)).padeiros.find((p) => p.usuario === 'ana.souza')!;
    // ligada ao Caio (o computador mudou de mãos): a sigla diria Ana, mas a sugestão do pedido novo é a da chave de antes
    await ligar(chefe, ligada.id, 'recDesignerCaio');
    const r = await cadastrar({ sistema: 'macOS 15.2', sigla: 'AS' });
    expect(r.status).toBe(201);
    expect(r.corpo.estado).toBe('pendente');
    // a ligada continua valendo; a nova espera o administrador
    expect((await quemSou(antiga)).corpo).toMatchObject({ estado: 'ligada', designer: { nome: 'Caio Prates' } });
    expect((await quemSou(r.corpo.chave)).corpo).toMatchObject({ estado: 'pendente', designer: null });
    const l = (await lista(chefe)).padeiros;
    // o pedido novo vem logo antes da ligada que ele troca, com o designer dela como sugestão
    expect(l.map((p) => [p.usuario, p.estado, p.pedidoNovo, p.sistema])).toEqual([
      ['cprates', 'pendente', false, 'Windows 11'],
      ['ana.souza', 'pendente', true, 'macOS 15.2'],
      ['ana.souza', 'ligada', false, 'macOS 15.1'],
    ]);
    expect(l[1]).toMatchObject({ substitui: ligada.id, sugestao: { registro: 'recDesignerCaio', nome: 'Caio Prates' } });
    // pedir de novo troca só o pedido novo (a primeira chave nova cai; a ligada fica)
    const outra = (await cadastrar()).corpo.chave;
    expect((await quemSou(r.corpo.chave)).status).toBe(401);
    expect((await quemSou(outra)).corpo).toMatchObject({ estado: 'pendente' });
    expect((await quemSou(antiga)).corpo).toMatchObject({ estado: 'ligada' });
    expect((await lista(chefe)).padeiros).toHaveLength(3);
  });

  it('aprovar o pedido novo: a chave nova fica ligada e a antiga cai', async () => {
    const { cadastrar, quemSou, chefe } = await comServidor();
    const antiga = (await cadastrar()).corpo.chave;
    await ligar(chefe, (await lista(chefe)).padeiros[0].id, 'recDesignerAna');
    const nova = (await cadastrar()).corpo.chave;
    const pedido = (await lista(chefe)).padeiros.find((p) => p.pedidoNovo)!;
    const r = await ligar(chefe, pedido.id, 'recDesignerAna');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ padeiro: { id: pedido.id, estado: 'ligada', pedidoNovo: false, substitui: null } });
    expect((await quemSou(antiga)).status).toBe(401);
    expect((await quemSou(nova)).corpo).toMatchObject({ estado: 'ligada', designer: { nome: 'Ana Souza' } });
    const l = (await lista(chefe)).padeiros;
    expect(l.map((p) => [p.id, p.estado, p.pedidoNovo])).toEqual([[pedido.id, 'ligada', false]]);
    // um recadastro depois disso volta a ser um pedido novo ao lado da ligada
    await cadastrar();
    expect((await lista(chefe)).padeiros.map((p) => p.pedidoNovo)).toEqual([true, false]);
  });

  it('recusar o pedido novo mantém a chave ligada', async () => {
    const { cadastrar, quemSou, chefe } = await comServidor();
    const antiga = (await cadastrar()).corpo.chave;
    await ligar(chefe, (await lista(chefe)).padeiros[0].id, 'recDesignerAna');
    const nova = (await cadastrar()).corpo.chave;
    const pedido = (await lista(chefe)).padeiros.find((p) => p.pedidoNovo)!;
    expect((await revogar(chefe, pedido.id)).status).toBe(200);
    expect((await quemSou(antiga)).corpo).toMatchObject({ estado: 'ligada', designer: { nome: 'Ana Souza' } });
    expect((await quemSou(nova)).corpo).toMatchObject({ estado: 'revogada' });
    // o recusado não se aprova depois
    expect((await ligar(chefe, pedido.id, 'recDesignerAna')).status).toBe(409);
    expect((await quemSou(antiga)).corpo).toMatchObject({ estado: 'ligada' });
  });

  it('com a ligada revogada, o recadastro troca a chave na hora e o pedido novo que havia some', async () => {
    const { cadastrar, quemSou, chefe } = await comServidor();
    await cadastrar();
    const ligada = (await lista(chefe)).padeiros[0];
    await ligar(chefe, ligada.id, 'recDesignerAna');
    const doPedido = (await cadastrar()).corpo.chave;
    await revogar(chefe, ligada.id);
    const nova = (await cadastrar()).corpo.chave;
    expect((await quemSou(doPedido)).status).toBe(401);
    expect((await quemSou(nova)).corpo).toMatchObject({ estado: 'pendente' });
    expect((await lista(chefe)).padeiros.map((p) => [p.id, p.estado, p.pedidoNovo])).toEqual([[ligada.id, 'pendente', false]]);
  });

  it('só administradores veem, ligam e revogam', async () => {
    const { cadastrar, ana, chefe } = await comServidor();
    await cadastrar();
    const [p] = (await lista(chefe)).padeiros;
    expect((await ana('/api/cadastros/padeiros')).status).toBe(403);
    expect((await ligar(ana, p.id, 'recDesignerAna')).status).toBe(403);
    expect((await revogar(ana, p.id)).status).toBe(403);
    expect((await lista(chefe)).padeiros[0].estado).toBe('pendente');
  });

  it('o cadastro confere o que veio: falta o usuário ou o computador, ou longo demais, 400', async () => {
    const { cadastrar } = await comServidor();
    expect((await cadastrar({ usuario: '' })).status).toBe(400);
    expect((await cadastrar({ computador: '  ' })).status).toBe(400);
    expect((await cadastrar({ sigla: 'X'.repeat(500) })).status).toBe(400);
  });

  it('o caminho é aberto: passados 500 cadastros, um par novo é recusado (429); o mesmo par ainda troca a chave', async () => {
    const { cadastrar } = await comServidor();
    for (let i = 1; i < 500; i++) expect((await cadastrar({ usuario: `robo${i}` })).status).toBe(201);
    expect((await cadastrar()).status).toBe(201);
    expect((await cadastrar({ usuario: 'mais.um' })).status).toBe(429);
    expect((await cadastrar()).status).toBe(201);
  });

  it('a chave fica só como hash no SQLite, e a tabela vai no backup', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'padeiros-'));
    const db = abrirBanco(join(pasta, 'roteirista.db'));
    const { cadastrar } = await comServidor({ db });
    const { chave } = (await cadastrar()).corpo;
    const destino = fazerBackup(db, join(pasta, 'backup'));
    const copia = new DatabaseSync(destino);
    const linhas = copia.prepare('SELECT * FROM padeiros').all() as Record<string, unknown>[];
    copia.close();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ usuario: 'ana.souza', computador: 'MAC-ARTE-07', estado: 'pendente' });
    expect(JSON.stringify(linhas)).not.toContain(chave);
    expect(readFileSync(destino).includes(Buffer.from(chave))).toBe(false);
  });
});
