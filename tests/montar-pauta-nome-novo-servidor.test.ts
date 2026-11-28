// @vitest-environment node
/* Montar a pauta, o nome novo pendente (#132), pela API: o editor que não está nos Cadastros entra na pauta como foi
   escrito e publica assim; nos Cadastros, os administradores veem os nomes novos da pauta, pendentes, com os dias em que
   aparecem e, quando há, quem parece ser ("é a mesma pessoa?"). Cadastrar o nome como editor novo (pelo caminho de
   sempre dos Cadastros, no Teable falso) o tira da lista; ligar a um editor que já existe grava o nome como key dele
   e troca o nome na escala (o rascunho, as publicações e as ausências): a pauta passa a mostrar o nome do cadastro.
   Ignorar tira da lista e fica guardado, com desfazer. Nomes, e-mails e claquetes fictícios; 27/11/2026 é uma sexta. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
import { porProducoes } from './fixtures/producoes-falsas';

const SEXTA = '2026-11-27';
const SABADO = '2026-11-28';
const CHEFE = 'chefe@empresa.com';
const BIA = 'bia.coord@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const ENV_CADASTROS = { ...ENV, TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };

type Registro = { id: string; fields: Record<string, unknown> };
/** Os cadastros de mentira: lê e cria registros (o caminho dos Cadastros), e guarda o que foi gravado. */
function cadastrosFalsos() {
  const tabelas: Record<string, Registro[]> = {
    tblRed: [],
    tblKeyRed: [],
    tblEdi: [
      { id: 'recE1', fields: { editor: 'Rui Teixeira' } },
      { id: 'recE2', fields: { editor: 'Elisa Furtado' } },
      { id: 'recE3', fields: { editor: 'Gil Moura' } },
    ],
    tblKeyEdi: [{ id: 'recK1', fields: { key: 'GILZINHO', editor: [{ id: 'recE3' }] } }],
  };
  const escritas: string[] = [];
  let proximo = 1;
  const buscar = async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? 'GET';
    const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
    if (metodo === 'POST') {
      const { records } = JSON.parse(String(init.body)) as { records: { fields: Record<string, unknown> }[] };
      const novo = { id: `recNovo${proximo++}`, fields: records[0].fields };
      tabelas[tabela].push(novo);
      escritas.push(`${tabela} ${JSON.stringify(novo.fields)}`);
      return { ok: true, status: 200, json: async () => ({ records: [novo] }), text: async () => '' };
    }
    if (metodo !== 'GET') throw new Error(`inesperado: ${metodo} ${url}`);
    return { ok: true, status: 200, json: async () => ({ records: tabelas[tabela] }), text: async () => '' };
  };
  return { tabelas, escritas, buscar };
}

const RASCUNHO = [
  { id: 'pos-1', turno: 'madrugada', editor: 'Rui Teixeira', horario: '22h às 6h', demandas: [{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }] },
  { id: 'pos-2', turno: 'tarde', editor: 'Fê Lopes', horario: '14h às 22h', demandas: [{ id: 'd-2', texto: 'Mundo Animal 30/11 (P)' }] },
  { id: 'pos-3', turno: 'noite', editor: 'Elsa  Furtado', horario: '20h às 2h', demandas: [{ id: 'd-3', texto: 'Corujão 28/11 (A)' }] },
];

type NomeNovo = { nome: string; dias: { dia: string; publicado: boolean }[]; sugestao: { id: string; nome: string; por: string } | null };
type Linha = { editor: string; texto: string };

describe('montar a pauta: o nome novo pendente (#132)', () => {
  let servidor: Server;
  let base = '';
  let app: { fechar: () => Promise<void>; tabelasProntas: Promise<void> };
  let cad: ReturnType<typeof cadastrosFalsos>;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  const bia = como(BIA);
  const lia = como('lia.edicao@empresa.com');
  const gravar = (posicoes: unknown, dia = SEXTA) => bia(`/api/montar-pauta?dia=${dia}`, { method: 'PUT', body: JSON.stringify({ posicoes }) });
  const nomesNovos = async (quem = chefe): Promise<NomeNovo[]> => (await (await quem('/api/cadastros?renovar=1')).json()).nomesNovos;
  const ligar = (nome: string, editor: string, quem = chefe) => quem('/api/cadastros/nomes-novos/ligar', { method: 'POST', body: JSON.stringify({ nome, editor }) });
  const pautaDoDia = async (dia = SEXTA): Promise<Linha[]> => (await (await lia(`/api/pauta/dia?dia=${dia}`)).json()).linhas;
  const editoresDaPauta = async (dia = SEXTA) => [...new Set((await pautaDoDia(dia)).map((l) => l.editor))];

  beforeAll(async () => {
    cad = cadastrosFalsos();
    const teable = teableFalso({ EDICAO_producao: 'pauta_pg' }, { registros: { EDICAO_producao: [] } });
    const db = abrirBanco(':memory:');
    app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: criarCadastros(ENV_CADASTROS, { buscar: cad.buscar }) });
    // a Pauta só mostra as claquetes que casam com uma Produção (#199)
    porProducoes(db, ['Noite de Gala 27/11', 'Mundo Animal 30/11', 'Corujão 28/11'], { perto: SEXTA });
    await app.tabelasProntas;
    servidor = createServer(app as never);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: BIA }) });
    expect((await gravar(RASCUNHO)).status).toBe(200);
    expect((await gravar([{ id: 'pos-9', turno: 'manha', editor: 'fê lopes', horario: '6h às 15h', demandas: [] }], SABADO)).status).toBe(200);
  });
  afterAll(async () => {
    await app.fechar();
    servidor.close();
  });

  it('o nome novo publica como foi escrito', async () => {
    expect((await bia(`/api/montar-pauta/publicar?dia=${SEXTA}`, { method: 'POST' })).status).toBe(200);
    expect(await editoresDaPauta()).toEqual(['Rui Teixeira', 'Fê Lopes', 'Elsa Furtado']);
  });

  it('nos Cadastros, os nomes novos da pauta ficam pendentes, com os dias e quem parece ser', async () => {
    expect(await nomesNovos()).toEqual([
      { nome: 'Elsa Furtado', dias: [{ dia: SEXTA, publicado: true }], sugestao: { id: 'recE2', nome: 'Elisa Furtado', por: 'parecido' } },
      // a mesma pessoa escrita de dois jeitos é um nome só, como foi escrito primeiro
      { nome: 'Fê Lopes', dias: [{ dia: SEXTA, publicado: true }, { dia: SABADO, publicado: false }], sugestao: null },
    ]);
  });

  it('só os administradores veem a lista e respondem', async () => {
    expect(await nomesNovos(bia)).toEqual([]);
    const r = await ligar('Elsa Furtado', 'recE2', bia);
    expect(r.status).toBe(403);
    expect((await r.json()).erro).toBe('Só administradores ligam os nomes novos da pauta.');
    expect((await bia('/api/cadastros/nomes-novos/ignorar', { method: 'POST', body: JSON.stringify({ nome: 'Fê Lopes' }) })).status).toBe(403);
  });

  it('ligar a um editor que já existe: o nome vira key dele e a pauta passa a mostrar o nome do cadastro', async () => {
    // marcada a ausência com o nome novo, ela também passa a ser do cadastro
    expect((await bia(`/api/montar-pauta/ausencias?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ editor: 'Elsa Furtado', tipo: 'folga', de: '2026-12-02' }) })).status).toBe(200);
    expect((await ligar('Elsa Furtado', 'recZZZ')).status).toBe(400);
    const r = await ligar('Elsa Furtado', 'recE2');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, nome: 'Elisa Furtado' });
    expect(cad.escritas).toEqual(['tblKeyEdi {"key":"ELSA FURTADO","editor":[{"id":"recE2"}]}']);
    expect(await editoresDaPauta()).toEqual(['Rui Teixeira', 'Fê Lopes', 'Elisa Furtado']);
    // o rascunho também, e o dia continua publicado (o rascunho e a publicação mudaram juntos)
    const dia = await (await bia(`/api/montar-pauta?dia=${SEXTA}`)).json();
    expect(dia.posicoes.map((p: { editor: string }) => p.editor)).toEqual(['Rui Teixeira', 'Fê Lopes', 'Elisa Furtado']);
    expect(dia.estado).toBe('publicado');
    const painel = await (await bia('/api/montar-pauta/ausencias?dia=2026-12-02')).json();
    expect(painel.fora.map((a: { editor: string }) => a.editor)).toEqual(['Elisa Furtado']);
    expect((await nomesNovos()).map((n) => n.nome)).toEqual(['Fê Lopes']);
  });

  it('o nome que já é key de um editor sugere esse editor; ligar de novo não grava a key outra vez', async () => {
    await gravar([{ id: 'pos-20', turno: 'tarde', editor: 'Gilzinho', horario: '14h às 22h', demandas: [] }], '2026-11-30');
    expect((await nomesNovos()).find((n) => n.nome === 'Gilzinho')?.sugestao).toEqual({ id: 'recE3', nome: 'Gil Moura', por: 'key' });
    const antes = cad.escritas.length;
    expect((await ligar('Gilzinho', 'recE3')).status).toBe(200);
    expect(cad.escritas.length).toBe(antes);
    // a key de outro editor não é ligada a este
    await gravar([{ id: 'pos-20', turno: 'tarde', editor: 'Gilzinho', horario: '14h às 22h', demandas: [] }], '2026-11-30');
    const r = await ligar('Gilzinho', 'recE1');
    expect(r.status).toBe(409);
    expect((await r.json()).erro).toBe('A key GILZINHO já é de Gil Moura.');
    expect((await nomesNovos()).map((n) => n.nome)).toEqual(['Fê Lopes', 'Gilzinho']);
    await ligar('Gilzinho', 'recE3');
  });

  it('cadastrar como editor novo, pelo caminho dos Cadastros, tira o nome da lista e o põe na lista do montar', async () => {
    const r = await chefe('/api/cadastros/editores', { method: 'POST', body: JSON.stringify({ nome: 'Fê Lopes' }) });
    expect(r.status).toBe(200);
    expect(cad.escritas.at(-1)).toBe('tblEdi {"editor":"Fê Lopes"}');
    expect(await nomesNovos()).toEqual([]);
    expect((await (await bia(`/api/montar-pauta?dia=${SEXTA}`)).json()).editores).toContain('Fê Lopes');
    // e a pauta continua com o nome como foi escrito
    expect(await editoresDaPauta()).toContain('Fê Lopes');
  });

  it('ignorar tira o nome da lista, fica guardado, e desfazer o traz de volta', async () => {
    await gravar([{ id: 'pos-30', turno: 'tarde', editor: 'FREELA', horario: '14h às 22h', demandas: [] }], '2026-12-01');
    expect((await nomesNovos()).map((n) => n.nome)).toEqual(['FREELA']);
    expect((await chefe('/api/cadastros/nomes-novos/ignorar', { method: 'POST', body: JSON.stringify({ nome: 'freela' }) })).status).toBe(200);
    expect(await nomesNovos()).toEqual([]);
    expect((await chefe(`/api/cadastros/nomes-novos/ignorar?nome=FREELA`, { method: 'DELETE' })).status).toBe(200);
    expect((await nomesNovos()).map((n) => n.nome)).toEqual(['FREELA']);
    expect((await chefe('/api/cadastros/nomes-novos/ignorar', { method: 'POST', body: JSON.stringify({ nome: '' }) })).status).toBe(400);
  });
});
