// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarRegrasDaAtracao } from '../servidor/regras-da-atracao.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* A correção de grafia das atrações (#116) pela API: as fichas de atração dos cadastros do Teable de mentira que
   parecem ser a mesma, juntas num grupo com o motivo, e em cada ficha quantas artes do acervo, Produções e regras ela
   tem. "Não são a mesma" fica guardado no SQLite do PROMeiro e o grupo não volta. Só administradores. Nada é gravado
   no Teable. Nomes e claquetes fictícios. */

const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const NOMES = { atracoes: 'atracoes_pg', KEY_atracoes: 'keys_pg', ARTES_acervo: 'acervo_pg', ARTE_producao: 'producao_pg' };

const reg = (id: string, fields: Record<string, unknown>) => ({ id, fields });
const atracao = (id: string, nome: string, categoria = 'Shows') => reg(id, { atracao: nome, categoria });
const vinculo = (id: string, title: string) => [{ id, title }];

const registros = () => ({
  atracoes: [
    atracao('recAtr1', 'A Clínica', 'Novelas'),
    atracao('recAtr2', 'Clinica', 'Novelas'),
    atracao('recAtr3', 'Antártida', 'Filmes'),
    atracao('recAtr4', 'Antartica', 'Filmes'),
    // nomes curtos e diferentes: não juntam
    atracao('recAtr5', 'Gol'),
    atracao('recAtr6', 'Sol'),
  ],
  KEY_atracoes: [reg('recKey1', { key: 'A CLINICA', atracoes: vinculo('recAtr1', 'A Clínica') }), reg('recKey2', { key: 'CLINICA', atracoes: vinculo('recAtr2', 'Clinica') }), reg('recKey3', { key: 'ANTARTIDA', atracoes: vinculo('recAtr3', 'Antártida') })],
  ARTES_acervo: [
    reg('recArte1', { arte: 'HOJE', tipo: 'RODAPE', atracao: vinculo('recAtr1', 'A Clínica') }),
    reg('recArte2', { arte: 'AMANHÃ', tipo: 'RODAPE', atracao: vinculo('recAtr1', 'A Clínica') }),
    reg('recArte3', { arte: 'ESTREIA', tipo: 'CARTAO', atracao: vinculo('recAtr2', 'Clinica') }),
    reg('recArte4', { arte: 'HOJE', tipo: 'RODAPE', atracao: vinculo('recAtr3', 'Antártida') }),
  ],
  ARTE_producao: [
    reg('recProd1', { card_ID: '', claquete: 'A Clinica 20/11', status: '[]', data_entrada: '2026-11-18T12:00:00.000Z' }),
    reg('recProd2', { card_ID: '', claquete: 'A Clinica 21/11', status: '[]', data_entrada: '2026-11-19T12:00:00.000Z' }),
    reg('recProd3', { card_ID: '', claquete: 'Antartida 21/11', status: '[]', data_entrada: '2026-11-19T12:00:00.000Z' }),
  ],
});

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function comServidor({ db = abrirBanco(':memory:') } = {}) {
  const teable = teableFalso(NOMES, { registros: registros() });
  // os cadastros leem as atrações e as keys pela API do Teable de mentira (as tabelas achadas pelo nome)
  const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: (env: Record<string, string>) => criarCadastros(env, { buscar: teable }) });
  await app.tabelasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { ...(email ? { 'cf-access-authenticated-user-email': email } : {}), 'content-type': 'application/json' } });
  const chefe = como('chefe@empresa.com');
  // as Produções vêm da produção da arte (a carga)
  expect((await chefe('/api/producoes/recarregar', { method: 'POST' })).status).toBe(200);
  return { db, teable, chefe, ana: como('ana@empresa.com'), ninguem: como('') };
}

type Ficha = { id: string; nome: string; categoria: string; artes: number | null; producoes: number; regras: number };
type Pagina = { pagina: number; porPagina: number; total: number; grupos: { id: string; motivo: string; fichas: Ficha[] }[] };
const ler = async (r: Response) => {
  expect(r.status).toBe(200);
  return (await r.json()) as Pagina;
};
const naoSaoAMesma = (chefe: (c: string, i?: RequestInit) => Promise<Response>, ids: string[]) => chefe('/api/correcoes/atracoes/nao-sao-a-mesma', { method: 'POST', body: JSON.stringify({ ids }) });

describe('as atrações parecidas', () => {
  it('as fichas que parecem a mesma vêm juntas, com o motivo; nomes curtos e diferentes não', async () => {
    const { chefe } = await comServidor();
    const p = await ler(await chefe('/api/correcoes/atracoes'));
    expect(p).toMatchObject({ pagina: 1, total: 2 });
    expect(p.grupos.map((g) => ({ motivo: g.motivo, nomes: g.fichas.map((f) => f.nome) }))).toEqual([
      { motivo: 'mesmo-nome', nomes: ['A Clínica', 'Clinica'] },
      { motivo: 'uma-letra', nomes: ['Antartica', 'Antártida'] },
    ]);
  });

  it('cada ficha diz quantas artes do acervo, Produções e regras ela tem', async () => {
    const { chefe, db } = await comServidor();
    criarRegrasDaAtracao(db).lembrar('Clinica', [{ tipo: 'trocas', re: '^ESTREIA$', motivo: 'troca de exemplo' }], 'Ana');
    const p = await ler(await chefe('/api/correcoes/atracoes'));
    const fichas = p.grupos.flatMap((g) => g.fichas);
    expect(fichas.find((f) => f.id === 'recAtr1')).toEqual({ id: 'recAtr1', nome: 'A Clínica', categoria: 'Novelas', artes: 2, producoes: 2, regras: 0 });
    expect(fichas.find((f) => f.id === 'recAtr2')).toEqual({ id: 'recAtr2', nome: 'Clinica', categoria: 'Novelas', artes: 1, producoes: 0, regras: 1 });
    expect(fichas.find((f) => f.id === 'recAtr3')).toMatchObject({ artes: 1, producoes: 1, regras: 0 });
    expect(fichas.find((f) => f.id === 'recAtr4')).toMatchObject({ artes: 0, producoes: 0, regras: 0 });
  });

  it('só lê: nada vai ao Teable para gravar', async () => {
    const { chefe, teable } = await comServidor();
    await ler(await chefe('/api/correcoes/atracoes'));
    expect(teable.estado.pedidos.filter((x: string) => !x.startsWith('GET '))).toEqual([]);
  });
});

describe('"não são a mesma"', () => {
  it('fica guardado no SQLite e o grupo não aparece de novo, nem depois de reiniciar', async () => {
    const db = abrirBanco(':memory:');
    const { chefe, teable } = await comServidor({ db });
    const r = await naoSaoAMesma(chefe, ['recAtr4', 'recAtr3']);
    expect(r.status).toBe(200);
    expect((await ler(await chefe('/api/correcoes/atracoes'))).grupos.map((g) => g.id)).toEqual(['recAtr1+recAtr2']);
    expect(teable.estado.pedidos.filter((x: string) => !x.startsWith('GET '))).toEqual([]);
    // o servidor de novo, com o mesmo banco
    await parar?.();
    const outro = await comServidor({ db });
    const p = await ler(await outro.chefe('/api/correcoes/atracoes'));
    expect(p.total).toBe(1);
    expect(p.grupos[0].fichas.map((f) => f.id)).toEqual(['recAtr1', 'recAtr2']);
  });

  it('o grupo que não existe (ou mudou) não é marcado', async () => {
    const { chefe } = await comServidor();
    const r = await naoSaoAMesma(chefe, ['recAtr1', 'recAtr3']);
    expect(r.status).toBe(409);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/mudou/);
    expect((await ler(await chefe('/api/correcoes/atracoes'))).total).toBe(2);
  });

  it('o pedido sem as fichas do grupo não vale', async () => {
    const { chefe } = await comServidor();
    expect((await naoSaoAMesma(chefe, ['recAtr1'])).status).toBe(400);
    expect((await chefe('/api/correcoes/atracoes/nao-sao-a-mesma', { method: 'POST', body: JSON.stringify({ ids: 'recAtr1+recAtr2' }) })).status).toBe(400);
  });
});

describe('só administradores', () => {
  it('quem não é administrador recebe 403, e quem não entrou, 401, para ver e para marcar', async () => {
    const { ana, ninguem, chefe } = await comServidor();
    const r = await ana('/api/correcoes/atracoes');
    expect(r.status).toBe(403);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/administradores/);
    expect((await naoSaoAMesma(ana, ['recAtr1', 'recAtr2'])).status).toBe(403);
    expect((await ninguem('/api/correcoes/atracoes')).status).toBe(401);
    // o grupo continua lá
    expect((await ler(await chefe('/api/correcoes/atracoes'))).total).toBe(2);
  });

  it('ver é GET e marcar é POST', async () => {
    const { chefe } = await comServidor();
    expect((await chefe('/api/correcoes/atracoes', { method: 'POST' })).status).toBe(405);
    expect((await chefe('/api/correcoes/atracoes/nao-sao-a-mesma')).status).toBe(405);
  });
});
