// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* A seção Pessoas da Configuração (#77) pela API: os administradores (a chave-mestra do Portainer e o salvo na tela;
   ninguém tira a si mesmo), quem entrou e quem saiu do quadro do Trello (os membros × a tabela designers do Teable),
   cadastrar como designer e marcar inativo (gravam no Teable falso), ignorar e desfazer, a verificação diária e o
   pontinho do menu. Trello e Teable de mentira: ids, nomes e e-mails inventados. */

const CHEFE = 'chefe@empresa.com';
const ANA = 'ana@empresa.com';
const BIA = 'bia@empresa.com';

type Linha = { id: string; fields: Record<string, unknown> };

function trelloFalso(membros: { id: string; fullName: string; email?: string }[]) {
  const pedidos: string[] = [];
  const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '' });
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    const rota = url.pathname.replace(/^\/1/, '');
    pedidos.push(`${metodo} ${rota}`);
    if (metodo !== 'GET') throw new Error(`a seção Pessoas só lê o Trello: ${metodo} ${rota}`);
    if (rota === '/boards/qFalso/members') return ok(membros);
    if (rota.startsWith('/boards/qFalso')) return ok(rota === '/boards/qFalso' ? { id: 'qFalso', name: 'Quadro falso' } : []);
    return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
  };
  return { buscar, pedidos };
}

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

const MEMBROS = [
  { id: 'mAna', fullName: 'Ana Prado' },
  { id: 'mBia', fullName: 'Bia Sampaio', email: BIA },
  { id: 'mCaio', fullName: 'Caio Reis' },
];

async function comServidor({ membros = MEMBROS, designers = [] as Linha[], db = abrirBanco(':memory:') } = {}) {
  const falso = trelloFalso(membros);
  const linhas: Linha[] = designers.length
    ? designers
    : [
        { id: 'recAna', fields: { designer: 'Ana Prado', status: 'ativo', email: ANA, designer_ID: 'mAna' } },
        { id: 'recCaio', fields: { designer: 'Caio Reis', status: 'ativo', designer_ID: 'mCaio' } },
        { id: 'recOtavio', fields: { designer: 'Otávio Lins', status: 'ativo', email: 'otavio@empresa.com', designer_ID: 'mOtavio' } },
        { id: 'recEva', fields: { designer: 'Eva Luz', status: 'inativo', designer_ID: 'mEva' } },
      ];
  const teable = teableFalso({ designers: 'designers_d1' }, { base: 'bseFalso', registros: { designers: linhas } });
  const agendados: { f: () => unknown; ms: number }[] = [];
  const env = { CADASTRO_ADMINS: CHEFE, TRELLO_KEY: 'k', TRELLO_TOKEN: 't', TRELLO_QUADRO: 'qFalso', TEABLE_PG_ESQUEMA: 'bseFalso', ...TEABLE_FALSO };
  const app = criarApp({
    db,
    env,
    buscarNoTeable: teable,
    trello: (e: Record<string, string>) => criarTrello(e, { buscar: falso.buscar }),
    agendar: (f: () => unknown, ms: number) => (agendados.push({ f, ms }), { unref() {} }),
  });
  await app.tabelasProntas;
  await app.pessoasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  fechar = async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await app.fechar();
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, corpo?: unknown) =>
    fetch(base + caminho, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  return { app, db, linhas, falso, teable, agendados, chefe: como(CHEFE), ana: como(ANA), bia: como(BIA) };
}

type Pessoas = {
  administradores: { email: string; nome: string; mestra: boolean }[];
  novidades: { chave: string; tipo: string; nome: string; email: string; administrador?: boolean }[];
  ignoradas: { chave: string; nome: string }[];
  quemJaEntrou: { email: string; nome: string }[];
  verificadoEm: string;
  erro?: string;
};
const ler = async (r: Promise<Response>) => (await (await r).json()) as Pessoas;
const titulos = (p: Pessoas) => p.novidades.map((n) => `${n.tipo} ${n.nome}`);

describe('quem entrou e quem saiu do quadro', () => {
  it('ao abrir: a nova no quadro e o designer ativo que saiu (o inativo não conta)', async () => {
    const { chefe } = await comServidor();
    const p = await ler(chefe('/api/configuracao/pessoas'));
    expect(titulos(p)).toEqual(['entrou Bia Sampaio', 'saiu Otávio Lins']);
    // o e-mail que o Trello deu vai junto
    expect(p.novidades[0]).toMatchObject({ chave: 'entrou:mBia', email: BIA });
    expect(p.verificadoEm).toBeTruthy();
  });

  it('cadastrar como designer grava no Teable (ativo, o id do membro, o nome e o e-mail) e a novidade sai', async () => {
    const { chefe, linhas } = await comServidor();
    const p = await ler(chefe('/api/configuracao/pessoas', { acao: 'cadastrar', chave: 'entrou:mBia' }));
    expect(linhas.at(-1)?.fields).toEqual({ designer: 'Bia Sampaio', status: 'ativo', designer_ID: 'mBia', email: BIA });
    expect(titulos(p)).toEqual(['saiu Otávio Lins']);
  });

  it('o e-mail digitado ao tornar administrador quem o Trello não dá vai junto no cadastro de designer', async () => {
    const { chefe, linhas } = await comServidor({ membros: [...MEMBROS, { id: 'mDuda', fullName: 'Duda Lima' }] });
    let p = await ler(chefe('/api/configuracao/pessoas'));
    expect(p.novidades.find((n) => n.chave === 'entrou:mDuda')).toMatchObject({ email: '', emailSugerido: '', administrador: false });
    p = await ler(chefe('/api/configuracao/pessoas', { acao: 'administrador', chave: 'entrou:mDuda', email: 'duda@empresa.com' }));
    expect(p.novidades.find((n) => n.chave === 'entrou:mDuda')).toMatchObject({ emailSugerido: 'duda@empresa.com', administrador: true });
    await chefe('/api/configuracao/pessoas', { acao: 'cadastrar', chave: 'entrou:mDuda' });
    expect(linhas.at(-1)?.fields).toEqual({ designer: 'Duda Lima', status: 'ativo', designer_ID: 'mDuda', email: 'duda@empresa.com' });
  });

  it('marcar inativo muda o status no Teable e a novidade sai', async () => {
    const { chefe, linhas } = await comServidor();
    const p = await ler(chefe('/api/configuracao/pessoas', { acao: 'inativar', chave: 'saiu:recOtavio' }));
    expect(linhas.find((l) => l.id === 'recOtavio')?.fields.status).toBe('inativo');
    expect(titulos(p)).toEqual(['entrou Bia Sampaio']);
  });

  it('ignorar tira da lista até desfazer (também depois de reiniciar)', async () => {
    const { chefe, db } = await comServidor();
    let p = await ler(chefe('/api/configuracao/pessoas', { acao: 'ignorar', chave: 'entrou:mBia' }));
    expect(titulos(p)).toEqual(['saiu Otávio Lins']);
    expect(p.ignoradas.map((i) => i.nome)).toEqual(['Bia Sampaio']);
    await fechar?.();
    fechar = null;
    const outra = await comServidor({ db });
    p = await ler(outra.chefe('/api/configuracao/pessoas'));
    expect(titulos(p)).toEqual(['saiu Otávio Lins']);
    p = await ler(outra.chefe('/api/configuracao/pessoas', { acao: 'desfazer', chave: 'entrou:mBia' }));
    expect(titulos(p)).toEqual(['entrou Bia Sampaio', 'saiu Otávio Lins']);
    expect(p.ignoradas).toEqual([]);
  });

  it('a chave que não é novidade agora é recusada, sem gravar nada', async () => {
    const { chefe, linhas } = await comServidor();
    const antes = JSON.stringify(linhas);
    expect((await chefe('/api/configuracao/pessoas', { acao: 'cadastrar', chave: 'entrou:mAna' })).status).toBe(404);
    expect((await chefe('/api/configuracao/pessoas', { acao: 'inativar', chave: 'entrou:mBia' })).status).toBe(404);
    expect((await chefe('/api/configuracao/pessoas', { acao: 'qualquer' })).status).toBe(400);
    expect(JSON.stringify(linhas)).toBe(antes);
  });

  it('com o Teable fora do ar, valem as novidades da última verificação, e cadastrar não grava', async () => {
    const { chefe, teable } = await comServidor();
    teable.estado.fora = true;
    const p = await ler(chefe('/api/configuracao/pessoas'));
    expect(p.erro).toMatch(/Teable/);
    expect(titulos(p)).toEqual(['entrou Bia Sampaio', 'saiu Otávio Lins']);
    expect((await chefe('/api/configuracao/pessoas', { acao: 'cadastrar', chave: 'entrou:mBia' })).status).toBe(502);
  });
});

describe('os administradores', () => {
  it('pôr pelo e-mail vale na hora no app inteiro; a chave-mestra fica sempre', async () => {
    const { chefe, ana } = await comServidor();
    expect((await ana('/api/configuracao/pessoas')).status).toBe(403);
    expect(((await (await ana('/api/eu')).json()) as { admin: boolean }).admin).toBe(false);
    const p = await ler(chefe('/api/configuracao/pessoas', { acao: 'administrador', email: 'Ana@Empresa.com' }));
    // o nome de quem já entrou no PROMeiro aparece (a Ana entrou; o chefe ainda não)
    expect(p.administradores).toEqual([
      { email: ANA, nome: 'Ana', mestra: false },
      { email: CHEFE, nome: '', mestra: true },
    ]);
    expect(((await (await ana('/api/eu')).json()) as { admin: boolean }).admin).toBe(true);
    // o resto do app também: as duplicadas e a Configuração, que são só de administradores
    expect((await ana('/api/duplicadas')).status).not.toBe(403);
    expect((await ana('/api/configuracao/pessoas')).status).toBe(200);
  });

  it('quem já entrou no PROMeiro aparece para escolher; ninguém tira a si mesmo; a chave-mestra não sai pela tela', async () => {
    const { chefe, ana, bia } = await comServidor();
    await bia('/api/eu');
    expect((await ler(chefe('/api/configuracao/pessoas'))).quemJaEntrou).toEqual([{ email: BIA, nome: 'Bia' }]);
    await chefe('/api/configuracao/pessoas', { acao: 'administrador', email: ANA });
    const eu = await ana('/api/configuracao/pessoas', { acao: 'tirar', email: ANA });
    expect(eu.status).toBe(422);
    expect(((await eu.json()) as { erro: string }).erro).toBe('Não dá para tirar você mesmo.');
    expect((await ana('/api/configuracao/pessoas', { acao: 'tirar', email: CHEFE })).status).toBe(422);
    const p = await ler(chefe('/api/configuracao/pessoas', { acao: 'tirar', email: ANA }));
    expect(p.administradores.map((a) => a.email)).toEqual([CHEFE]);
    expect((await ana('/api/configuracao/pessoas')).status).toBe(403);
  });

  it('tornar administradora quem entrou no quadro, e tirar de administrador quem saiu', async () => {
    const { chefe } = await comServidor();
    let p = await ler(chefe('/api/configuracao/pessoas', { acao: 'administrador', chave: 'entrou:mBia', email: BIA }));
    expect(p.administradores.map((a) => a.email)).toContain(BIA);
    // continua nova no quadro: ser administradora não é ser designer
    expect(titulos(p)).toEqual(['entrou Bia Sampaio', 'saiu Otávio Lins']);
    await chefe('/api/configuracao/pessoas', { acao: 'administrador', email: 'otavio@empresa.com' });
    p = await ler(chefe('/api/configuracao/pessoas'));
    expect(p.novidades.find((n) => n.tipo === 'saiu')).toMatchObject({ administrador: true });
    // quem não entrou no PROMeiro aparece com o nome da tabela designers
    expect(p.administradores.find((a) => a.email === 'otavio@empresa.com')?.nome).toBe('Otávio Lins');
    p = await ler(chefe('/api/configuracao/pessoas', { acao: 'tirar', email: 'otavio@empresa.com' }));
    expect(p.novidades.find((n) => n.tipo === 'saiu')).toMatchObject({ administrador: false });
  });
});

describe('a verificação diária e o pontinho', () => {
  it('o servidor agenda a verificação uma vez por dia; o /api/eu dos administradores diz quantas novidades há', async () => {
    const { chefe, ana, agendados, falso } = await comServidor();
    const diaria = agendados.find((a) => a.ms === 24 * 60 * 60 * 1000);
    expect(diaria).toBeTruthy();
    const membros = () => falso.pedidos.filter((x) => x === 'GET /boards/qFalso/members').length;
    const antes = membros();
    await diaria!.f();
    expect(membros()).toBe(antes + 1);
    expect(((await (await chefe('/api/eu')).json()) as { novidades: number }).novidades).toBe(2);
    // quem não é administrador não recebe o número
    expect(((await (await ana('/api/eu')).json()) as { novidades?: number }).novidades).toBeUndefined();
    // ignorar uma tira do pontinho
    await chefe('/api/configuracao/pessoas', { acao: 'ignorar', chave: 'saiu:recOtavio' });
    expect(((await (await chefe('/api/eu')).json()) as { novidades: number }).novidades).toBe(1);
  });
});
