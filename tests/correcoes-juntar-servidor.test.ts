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

/* Juntar atrações (#117) pela API, com o Teable de mentira: o administrador escolhe a ficha que fica e o nome final, e
   o PROMeiro guarda uma cópia da ficha que sai, passa as artes do acervo, as keys, as regras e as ligações (os roteiros
   da produção da arte e os filmes das exibições) para a que fica, renomeia a que fica e apaga a que sai. A falha no
   meio desfaz o que foi feito. A junção entra no registro das correções, e o desfazer recria a ficha a partir da cópia
   e religa tudo. Só administradores. Nomes e claquetes fictícios. */

const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const NOMES = { atracoes: 'atracoes_pg', KEY_atracoes: 'keys_pg', ARTES_acervo: 'acervo_pg', ARTE_producao: 'producao_pg', exibicoes: 'exibicoes_pg' };
const TABELA = (nome: string) => `/api/table/tblFalso_bseFalso_${nome}/record`;

type Reg = { id: string; fields: Record<string, unknown> };
const reg = (id: string, fields: Record<string, unknown>): Reg => ({ id, fields });
const vinculo = (id: string, title: string) => [{ id, title }];

const registros = () => ({
  atracoes: [
    reg('recAtr1', { atracao: 'A Clínica', categoria: 'Novelas', projeto_win: 'P:\\Clinica' }),
    reg('recAtr2', { atracao: 'Clinica', categoria: 'Novelas', output_win: 'O:\\Clinica' }),
    reg('recAtr3', { atracao: 'Antártida', categoria: 'Filmes' }),
    reg('recAtr4', { atracao: 'Antartica', categoria: 'Filmes' }),
  ],
  KEY_atracoes: [reg('recKey1', { key: 'A CLINICA', atracoes: vinculo('recAtr1', 'A Clínica') }), reg('recKey2', { key: 'CLINICA', atracoes: vinculo('recAtr2', 'Clinica') })],
  ARTES_acervo: [
    reg('recArte1', { arte: 'HOJE', tipo: 'RODAPE', atracao: vinculo('recAtr1', 'A Clínica') }),
    reg('recArte2', { arte: 'ESTREIA', tipo: 'CARTAO', atracao: vinculo('recAtr2', 'Clinica') }),
    reg('recArte3', { arte: 'AMANHÃ', tipo: 'RODAPE', atracao: vinculo('recAtr2', 'Clinica') }),
    reg('recArte4', { arte: 'HOJE', tipo: 'RODAPE', atracao: vinculo('recAtr3', 'Antártida') }),
  ],
  ARTE_producao: [
    reg('recProd1', { card_ID: '', claquete: 'A Clinica 20/11', status: '[]', data_entrada: '2026-11-18T12:00:00.000Z', atracao: vinculo('recAtr1', 'A Clínica') }),
    reg('recProd2', { card_ID: '', claquete: 'Clinica 21/11', status: '[]', data_entrada: '2026-11-19T12:00:00.000Z', atracao: vinculo('recAtr2', 'Clinica') }),
  ],
  exibicoes: [reg('recExib1', { exibicao: 'CLINICA 22/11 - FILME', sessao: { id: 'recAtr2', title: 'Clinica' } })],
});

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function comServidor({ db = abrirBanco(':memory:'), env = ENV, opcoes = {} }: { db?: unknown; env?: Record<string, string>; opcoes?: Record<string, unknown> } = {}) {
  const dados = registros();
  const teable = teableFalso(NOMES, { registros: dados, ...opcoes });
  const app = criarApp({ db, env, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: (e: Record<string, string>) => criarCadastros(e, { buscar: teable }) });
  await app.tabelasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, corpo?: unknown) =>
    fetch(base + caminho, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: { ...(email ? { 'cf-access-authenticated-user-email': email } : {}), 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  const regras = criarRegrasDaAtracao(db);
  regras.lembrar('Clinica', [{ tipo: 'trocas', re: '^ESTREIA$', motivo: 'troca de exemplo' }], 'Ana');
  regras.lembrar('A Clínica', [{ tipo: 'ignorar', re: '^LOGO$', motivo: 'ignorar de exemplo' }], 'Ana');
  const da = (tabela: keyof typeof dados, id: string) => (dados[tabela] as Reg[]).find((l) => l.id === id);
  const ligadoA = (v: unknown) => (Array.isArray(v) ? v.map((x) => x.id) : [(v as { id: string })?.id]);
  return { teable, dados, da, ligadoA, regras, db, chefe: como('chefe@empresa.com'), ana: como('ana@empresa.com'), ninguem: como('') };
}

type Chamar = (caminho: string, corpo?: unknown) => Promise<Response>;
const juntar = (chefe: Chamar, corpo: Record<string, unknown> = {}) => chefe('/api/correcoes/atracoes/juntar', { ids: ['recAtr1', 'recAtr2'], fica: 'recAtr1', nome: 'A Clínica', ...corpo });
const corpoDe = async <T = Record<string, unknown>,>(r: Response, status = 200) => {
  const corpo = (await r.json()) as T;
  expect(r.status, JSON.stringify(corpo)).toBe(status);
  return corpo;
};
type Registro = { itens: { id: string; tipo: string; alvo: string; detalhes: { resumo: string }; desfeita: unknown }[] };

describe('juntar um grupo', () => {
  it('passa as artes do acervo, as keys, as regras, os roteiros e os filmes para a ficha que fica e apaga a que sai', async () => {
    const { chefe, dados, da, ligadoA, regras } = await comServidor();
    const r = await corpoDe<{ registro: string; fica: string; nome: string }>(await juntar(chefe));
    expect(r).toMatchObject({ fica: 'recAtr1', nome: 'A Clínica' });
    expect(ligadoA(da('ARTES_acervo', 'recArte2')!.fields.atracao)).toEqual(['recAtr1']);
    expect(ligadoA(da('ARTES_acervo', 'recArte3')!.fields.atracao)).toEqual(['recAtr1']);
    expect(ligadoA(da('KEY_atracoes', 'recKey2')!.fields.atracoes)).toEqual(['recAtr1']);
    expect(ligadoA(da('ARTE_producao', 'recProd2')!.fields.atracao)).toEqual(['recAtr1']);
    expect(ligadoA(da('exibicoes', 'recExib1')!.fields.sessao)).toEqual(['recAtr1']);
    // a de outra atração não mexe
    expect(ligadoA(da('ARTES_acervo', 'recArte4')!.fields.atracao)).toEqual(['recAtr3']);
    expect(dados.atracoes.map((a) => a.id)).toEqual(['recAtr1', 'recAtr3', 'recAtr4']);
    expect(da('atracoes', 'recAtr1')!.fields.atracao).toBe('A Clínica');
    expect(regras.lista('Clinica')).toEqual([]);
    expect(regras.lista('A Clínica').map((x: { re: string }) => x.re).sort()).toEqual(['^ESTREIA$', '^LOGO$']);
    // o grupo sai da lista
    const p = await corpoDe<{ total: number; grupos: { id: string }[] }>(await chefe('/api/correcoes/atracoes'));
    expect(p.grupos.map((g) => g.id)).toEqual(['recAtr3+recAtr4']);
    // e entra no registro, com o resumo
    const reg = await corpoDe<Registro>(await chefe('/api/correcoes/registro'));
    expect(reg.itens).toHaveLength(1);
    expect(reg.itens[0]).toMatchObject({ id: r.registro, tipo: 'atracoes', alvo: 'recAtr1', desfeita: null });
    expect(reg.itens[0].detalhes.resumo).toBe('Clinica → A Clínica: 2 artes do acervo, 1 key, 1 regra, 1 roteiro e 1 filme');
  });
});

describe('a falha no meio', () => {
  it('desfaz tudo o que já foi feito: as ligações, as regras e o nome voltam, e a ficha que sai fica', async () => {
    const { chefe, teable, dados, da, ligadoA, regras } = await comServidor();
    const antes = structuredClone(dados);
    // a ficha que fica é a Clinica, com o nome da que sai; o Teable falha ao apagar
    teable.estado.falhar = (metodo: string, caminho: string) => metodo === 'DELETE' && caminho.startsWith(TABELA('atracoes'));
    const r = await corpoDe<{ erro: string; naoDesfeito: string[] }>(await juntar(chefe, { fica: 'recAtr2', nome: 'A Clínica' }), 502);
    expect(r.erro).toMatch(/^Parei ao apagar a ficha que sai: .*Nada foi juntado\. O que tinha sido feito foi desfeito\.$/);
    expect(r.naoDesfeito).toEqual([]);
    const ligacoes = (d: typeof dados) => ({
      acervo: d.ARTES_acervo.map((l) => [l.id, ligadoA(l.fields.atracao)]),
      keys: d.KEY_atracoes.map((l) => [l.id, ligadoA(l.fields.atracoes)]),
      roteiros: d.ARTE_producao.map((l) => [l.id, ligadoA(l.fields.atracao)]),
      filmes: d.exibicoes.map((l) => [l.id, ligadoA(l.fields.sessao)]),
      fichas: d.atracoes.map((l) => [l.id, l.fields.atracao]),
    });
    expect(ligacoes(dados)).toEqual(ligacoes(antes));
    expect(da('atracoes', 'recAtr2')!.fields.atracao).toBe('Clinica');
    expect(regras.lista('Clinica').map((x: { re: string }) => x.re)).toEqual(['^ESTREIA$']);
    expect(regras.lista('A Clínica').map((x: { re: string }) => x.re)).toEqual(['^LOGO$']);
    // nada entrou no registro, e o grupo continua na lista
    expect((await corpoDe<Registro>(await chefe('/api/correcoes/registro'))).itens).toEqual([]);
    expect((await corpoDe<{ grupos: { id: string }[] }>(await chefe('/api/correcoes/atracoes'))).grupos.map((g) => g.id)).toContain('recAtr1+recAtr2');
  });

  it('a falha ao passar as ligações também desfaz o que já tinha passado', async () => {
    const { chefe, teable, ligadoA, da } = await comServidor();
    teable.estado.falhar = (metodo: string, caminho: string) => metodo === 'PATCH' && caminho === TABELA('exibicoes');
    const r = await corpoDe<{ erro: string }>(await juntar(chefe), 502);
    expect(r.erro).toMatch(/^Parei ao passar as artes, as keys, as regras e as ligações: o Teable respondeu 500 em exibicoes\./);
    expect(ligadoA(da('ARTES_acervo', 'recArte2')!.fields.atracao)).toEqual(['recAtr2']);
    expect(ligadoA(da('KEY_atracoes', 'recKey2')!.fields.atracoes)).toEqual(['recAtr2']);
    expect(ligadoA(da('ARTE_producao', 'recProd2')!.fields.atracao)).toEqual(['recAtr2']);
    expect(da('atracoes', 'recAtr2')).toBeDefined();
  });
});

describe('desfazer a junção', () => {
  it('recria a ficha a partir da cópia, religa as artes e as ligações, e devolve o nome e as regras', async () => {
    const { chefe, dados, da, ligadoA, regras } = await comServidor();
    const { registro } = await corpoDe<{ registro: string }>(await juntar(chefe, { fica: 'recAtr2', nome: 'A Clínica' }));
    expect(da('atracoes', 'recAtr2')!.fields.atracao).toBe('A Clínica');
    expect(da('atracoes', 'recAtr1')).toBeUndefined();
    const d = await corpoDe<{ certas: string[]; falhas: unknown[] }>(await chefe('/api/correcoes/desfazer', { ids: [registro] }));
    expect(d).toEqual({ certas: [registro], falhas: [] });
    // a ficha recriada, com outro id e os campos da cópia
    const recriada = dados.atracoes.find((a) => a.fields.atracao === 'A Clínica')!;
    expect(recriada.id).not.toBe('recAtr1');
    expect(recriada.fields).toMatchObject({ atracao: 'A Clínica', categoria: 'Novelas', projeto_win: 'P:\\Clinica' });
    expect(da('atracoes', 'recAtr2')!.fields.atracao).toBe('Clinica');
    expect(ligadoA(da('ARTES_acervo', 'recArte1')!.fields.atracao)).toEqual([recriada.id]);
    expect(ligadoA(da('ARTES_acervo', 'recArte2')!.fields.atracao)).toEqual(['recAtr2']);
    expect(ligadoA(da('KEY_atracoes', 'recKey1')!.fields.atracoes)).toEqual([recriada.id]);
    expect(ligadoA(da('ARTE_producao', 'recProd1')!.fields.atracao)).toEqual([recriada.id]);
    expect(ligadoA(da('exibicoes', 'recExib1')!.fields.sessao)).toEqual(['recAtr2']);
    expect(regras.lista('Clinica').map((x: { re: string }) => x.re)).toEqual(['^ESTREIA$']);
    expect(regras.lista('A Clínica').map((x: { re: string }) => x.re)).toEqual(['^LOGO$']);
    // o registro marca a junção como desfeita, e o grupo volta à lista
    const reg = await corpoDe<Registro>(await chefe('/api/correcoes/registro'));
    expect(reg.itens[0].desfeita).toMatchObject({ por: 'chefe@empresa.com' });
    const p = await corpoDe<{ grupos: { fichas: { id: string }[] }[] }>(await chefe('/api/correcoes/atracoes'));
    expect(p.grupos.some((g) => g.fichas.some((f) => f.id === recriada.id))).toBe(true);
  });

  it('a ficha que ficou mudou de nome desde então: não desfaz', async () => {
    const { chefe, da } = await comServidor();
    const { registro } = await corpoDe<{ registro: string }>(await juntar(chefe));
    da('atracoes', 'recAtr1')!.fields.atracao = 'A Clínica Nova';
    const d = await corpoDe<{ certas: string[]; falhas: { motivo: string; texto: string }[] }>(await chefe('/api/correcoes/desfazer', { ids: [registro] }));
    expect(d.certas).toEqual([]);
    expect(d.falhas[0]).toMatchObject({ motivo: 'mudou' });
    expect(d.falhas[0].texto).toMatch(/mudou de nome desde então/);
  });
});

describe('o que não junta', () => {
  it('o grupo que não existe, a ficha que fica fora do grupo, o nome vazio ou de outra atração', async () => {
    const { chefe, teable } = await comServidor();
    expect((await corpoDe<{ erro: string }>(await juntar(chefe, { ids: ['recAtr1', 'recAtr3'] }), 409)).erro).toMatch(/mudou/);
    expect((await juntar(chefe, { fica: 'recAtr3' })).status).toBe(400);
    expect((await juntar(chefe, { nome: '  ' })).status).toBe(400);
    expect((await juntar(chefe, { ids: ['recAtr1'] })).status).toBe(400);
    expect((await corpoDe<{ erro: string }>(await juntar(chefe, { nome: 'antártida' }), 409)).erro).toBe('Antártida é o nome de outra atração.');
    expect(teable.estado.pedidos.filter((x: string) => !x.startsWith('GET '))).toEqual([]);
  });

  it('as tabelas fora da base do PROMeiro: não grava', async () => {
    const { chefe, teable } = await comServidor({ opcoes: { esquemas: { exibicoes: 'bseOutra' } } });
    const r = await corpoDe<{ erro: string }>(await juntar(chefe), 409);
    expect(r.erro).toMatch(/base do PROMeiro/);
    expect(teable.estado.pedidos.filter((x: string) => !x.startsWith('GET '))).toEqual([]);
  });
});

describe('só administradores', () => {
  it('quem não é administrador recebe 403, e quem não entrou, 401; nada é gravado', async () => {
    const { ana, ninguem, teable, dados } = await comServidor();
    const r = await juntar(ana);
    expect(r.status).toBe(403);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/administradores/);
    expect((await juntar(ninguem)).status).toBe(401);
    expect(dados.atracoes).toHaveLength(4);
    expect(teable.estado.pedidos.filter((x: string) => !x.startsWith('GET '))).toEqual([]);
  });

  it('juntar é POST', async () => {
    const { chefe } = await comServidor();
    expect((await chefe('/api/correcoes/atracoes/juntar')).status).toBe(405);
  });
});
