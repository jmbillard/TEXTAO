// @vitest-environment node
/* Montar a pauta, a coluna lateral e o arrastar (#126), pela API: em "Para distribuir" a coordenação escreve ou cola
   uma lista de claquetes (uma por linha, no padrão) e depois leva cada uma para uma posição; uma demanda vai de uma
   posição para outra (ou volta para "Para distribuir"); quem está "Sem escala" é escalado numa vaga ou numa posição
   nova de um turno, e quem está fora no dia não. Cada ação devolve o dia, como o GET. Nada vai ao Teable. Nomes,
   e-mails e claquetes fictícios; 27/11/2026 é uma sexta. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

const SEXTA = '2026-11-27';
const SABADO = '2026-11-28';
const DOMINGO = '2026-11-29';
const CHEFE = 'chefe@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const ENV_CADASTROS = { ...ENV, TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };

const CADASTROS: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
  tblRed: [],
  tblKeyRed: [],
  tblEdi: [
    { id: 'recE1', fields: { editor: 'Rui Teixeira' } },
    { id: 'recE2', fields: { editor: 'Elis Furtado' } },
    { id: 'recE3', fields: { editor: 'Gil Moura' } },
    { id: 'recE4', fields: { editor: 'Ana Prado' } },
  ],
  tblKeyEdi: [],
};
const escritas: string[] = [];
async function buscarOsCadastros(url: string, init: RequestInit = {}) {
  const metodo = init.method ?? 'GET';
  if (metodo !== 'GET') {
    escritas.push(`${metodo} ${url}`);
    throw new Error(`a coluna não escreve no Teable: ${metodo} ${url}`);
  }
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: CADASTROS[tabela] }), text: async () => '' };
}

const SEXTA_RASCUNHO = [
  { id: 'pos-1', turno: 'madrugada', editor: 'Rui Teixeira', horario: '22h às 6h', demandas: [{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }, { id: 'd-2', texto: 'COMUNICAÇÃO' }] },
  { id: 'pos-2', turno: 'tarde', editor: 'Elis Furtado', horario: '14h às 23h', demandas: [{ id: 'd-3', texto: 'Mundo Animal 30/11 (P)' }] },
  { id: 'pos-3', turno: 'tarde', editor: '', horario: '14h às 23h', demandas: [] },
];

type Demanda = { id: string; texto: string };
type Posicao = { id: string; turno: string; editor: string; ilha: string; horario: string; demandas: Demanda[] };
type Dia = { dia: string; estado: string; posicoes: Posicao[]; paraDistribuir: { id: string; texto: string; deQuem: string }[] };

describe('montar a pauta: a coluna lateral e o arrastar (#126)', () => {
  let servidor: Server;
  let base = '';
  let teable: ReturnType<typeof teableFalso>;
  let app: { fechar: () => Promise<void>; tabelasProntas: Promise<void> };
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  const bia = como('bia.coord@empresa.com');
  const lia = como('lia.edicao@empresa.com');
  const gravar = (dia: string, posicoes: unknown) => bia(`/api/montar-pauta?dia=${dia}`, { method: 'PUT', body: JSON.stringify({ posicoes }) });
  const rascunho = async (dia: string): Promise<Dia> => (await bia(`/api/montar-pauta?dia=${dia}`)).json();
  const acao = (nome: string, corpo: unknown, dia = SEXTA, quem = bia) => quem(`/api/montar-pauta/${nome}?dia=${dia}`, { method: 'POST', body: JSON.stringify(corpo) });
  const resumo = (d: Dia) => d.posicoes.map((p) => `${p.turno}/${p.editor || '(vaga)'}: ${p.demandas.map((x) => x.texto).join(' | ')}`);

  beforeAll(async () => {
    teable = teableFalso({ EDICAO_producao: 'pauta_pg' }, { registros: { EDICAO_producao: [] } });
    app = criarApp({ db: abrirBanco(':memory:'), env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: criarCadastros(ENV_CADASTROS, { buscar: buscarOsCadastros }) });
    await app.tabelasProntas;
    servidor = createServer(app as never);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) });
    expect((await gravar(SEXTA, SEXTA_RASCUNHO)).status).toBe(200);
  });
  afterAll(async () => {
    await app.fechar();
    servidor.close();
  });

  it('em "Para distribuir", a lista escrita ou colada vira uma claquete por linha, no padrão, na ordem', async () => {
    const r = await acao('para-distribuir', { texto: 'Pequenas Empresas 6/12 p\n\n  Vale a Pena Rever 30/11 (P)  \r\nCALHAUS\n' });
    expect(r.status).toBe(200);
    const dia: Dia = await r.json();
    expect(dia.paraDistribuir.map((d) => [d.texto, d.deQuem])).toEqual([
      ['Pequenas Empresas 6/12 (P)', ''],
      ['Vale a Pena Rever 30/11 (P)', ''],
      ['CALHAUS', ''],
    ]);
    // colar de novo junta no fim; o GET também traz a lista
    await acao('para-distribuir', { texto: 'Corujão 28/11 (D)' });
    expect((await rascunho(SEXTA)).paraDistribuir.map((d) => d.texto)).toEqual(['Pequenas Empresas 6/12 (P)', 'Vale a Pena Rever 30/11 (P)', 'CALHAUS', 'Corujão 28/11 (D)']);
    // vazia ou longa demais é recusada; o rascunho não muda
    expect((await acao('para-distribuir', { texto: ' \n ' })).status).toBe(400);
    expect((await acao('para-distribuir', { texto: 'x'.repeat(201) })).status).toBe(400);
    expect((await rascunho(SEXTA)).estado).toBe('rascunho');
  });
  it('levar uma claquete de "Para distribuir" para uma posição: sai da lista e entra nas demandas (no fim, ou antes de outra)', async () => {
    const lista = (await rascunho(SEXTA)).paraDistribuir;
    const r = await acao('levar', { id: lista[0].id, posicao: 'pos-2' });
    expect(r.status).toBe(200);
    const dia: Dia = await r.json();
    expect(dia.paraDistribuir.map((d) => d.texto)).toEqual(['Vale a Pena Rever 30/11 (P)', 'CALHAUS', 'Corujão 28/11 (D)']);
    expect(dia.posicoes.find((p) => p.id === 'pos-2')!.demandas.map((d) => d.texto)).toEqual(['Mundo Animal 30/11 (P)', 'Pequenas Empresas 6/12 (P)']);
    // antes de outra demanda, na vaga
    await acao('levar', { id: lista[1].id, posicao: 'pos-1', antesDe: 'd-2' });
    expect(resumo(await rascunho(SEXTA))).toEqual([
      'madrugada/Rui Teixeira: Noite de Gala 27/11 (DP) | Vale a Pena Rever 30/11 (P) | COMUNICAÇÃO',
      'tarde/Elis Furtado: Mundo Animal 30/11 (P) | Pequenas Empresas 6/12 (P)',
      'tarde/(vaga): ',
    ]);
    // a que já saiu da lista, ou a posição que não existe, são recusadas
    expect((await acao('levar', { id: lista[0].id, posicao: 'pos-2' })).status).toBe(400);
    expect((await acao('levar', { id: lista[2].id, posicao: 'pos-9' })).status).toBe(400);
    expect((await rascunho(SEXTA)).paraDistribuir).toHaveLength(2);
  });

  it('mover uma demanda de uma posição para outra (para a vaga, para antes de outra) leva o mesmo id e o mesmo texto', async () => {
    const r = await acao('mover', { demanda: 'd-1', posicao: 'pos-3' });
    expect(r.status).toBe(200);
    const dia: Dia = await r.json();
    expect(dia.posicoes.find((p) => p.id === 'pos-3')!.demandas).toEqual([{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }]);
    await acao('mover', { demanda: 'd-3', posicao: 'pos-3', antesDe: 'd-1' });
    expect(resumo(await rascunho(SEXTA))).toEqual([
      'madrugada/Rui Teixeira: Vale a Pena Rever 30/11 (P) | COMUNICAÇÃO',
      'tarde/Elis Furtado: Pequenas Empresas 6/12 (P)',
      'tarde/(vaga): Mundo Animal 30/11 (P) | Noite de Gala 27/11 (DP)',
    ]);
    expect((await acao('mover', { demanda: 'd-9', posicao: 'pos-1' })).status).toBe(400);
    expect((await acao('mover', { demanda: 'd-1', posicao: 'pos-9' })).status).toBe(400);
  });

  it('devolver uma demanda para "Para distribuir" a põe no fim da lista, com de quem era', async () => {
    const r = await acao('devolver', { demanda: 'd-2' });
    expect(r.status).toBe(200);
    const dia: Dia = await r.json();
    expect(dia.paraDistribuir.map((d) => [d.texto, d.deQuem])).toEqual([['CALHAUS', ''], ['Corujão 28/11 (D)', ''], ['COMUNICAÇÃO', 'Rui Teixeira']]);
    expect(dia.posicoes[0].demandas.map((d) => d.texto)).toEqual(['Vale a Pena Rever 30/11 (P)']);
    // e volta dela para uma posição
    await acao('levar', { id: dia.paraDistribuir[2].id, posicao: 'pos-1' });
    expect((await rascunho(SEXTA)).posicoes[0].demandas.map((d) => d.texto)).toEqual(['Vale a Pena Rever 30/11 (P)', 'COMUNICAÇÃO']);
  });

  it('escalar quem está sem escala: na vaga, ou numa posição nova do turno, com o horário padrão dele', async () => {
    const r = await acao('escalar', { editor: 'Gil Moura', posicao: 'pos-3' });
    expect(r.status).toBe(200);
    expect(((await r.json()) as Dia).posicoes.find((p) => p.id === 'pos-3')!.editor).toBe('Gil Moura');
    const nova: Dia = await (await acao('escalar', { editor: 'Ana Prado', turno: 'madrugada' })).json();
    expect(nova.posicoes.map((p) => [p.turno, p.editor, p.horario])).toEqual([
      ['madrugada', 'Rui Teixeira', '22h às 6h'],
      ['madrugada', 'Ana Prado', '22h às 6h'],
      ['tarde', 'Elis Furtado', '14h às 23h'],
      ['tarde', 'Gil Moura', '14h às 23h'],
    ]);
    // a posição nova fica com o id que a tela já mostra; o que já existe no dia (ou mal formado) não vale
    const comId: Dia = await (await acao('escalar', { editor: 'Bia Campos', turno: 'noite', id: 'p-da-tela-1' })).json();
    expect(comId.posicoes.find((p) => p.editor === 'Bia Campos')!.id).toBe('p-da-tela-1');
    const repetido: Dia = await (await acao('escalar', { editor: 'Lia Moraes', turno: 'noite', id: 'pos-1' })).json();
    expect(repetido.posicoes.filter((p) => p.id === 'pos-1')).toHaveLength(1);
    expect(repetido.posicoes.find((p) => p.editor === 'Lia Moraes')!.id).not.toBe('pos-1');
    // no dia vazio, a posição nova cria o rascunho
    const domingo: Dia = await (await acao('escalar', { editor: 'Rui Teixeira', turno: 'noite' }, DOMINGO)).json();
    expect([domingo.estado, resumo(domingo)]).toEqual(['rascunho', ['noite/Rui Teixeira: ']]);
    // turno, posição e editor errados são recusados
    expect((await acao('escalar', { editor: 'Ana Prado', turno: 'plantao' })).status).toBe(400);
    expect((await acao('escalar', { editor: 'Ana Prado', posicao: 'pos-9' })).status).toBe(400);
    expect((await acao('escalar', { editor: '  ', turno: 'noite' })).status).toBe(400);
  });

  it('quem está fora no dia não é escalado; no dia publicado, arrastar deixa o dia alterado', async () => {
    await bia(`/api/montar-pauta/ausencias?dia=${SABADO}`, { method: 'POST', body: JSON.stringify({ editor: 'Elis Furtado', tipo: 'folga', de: SABADO, ate: SABADO, observacao: '' }) });
    const r = await acao('escalar', { editor: 'elis furtado', turno: 'manha' }, SABADO);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toBe('elis furtado está fora no dia (folga).');
    expect((await rascunho(SABADO)).estado).toBe('vazio');

    expect((await bia(`/api/montar-pauta/publicar?dia=${SEXTA}`, { method: 'POST' })).status).toBe(200);
    expect((await rascunho(SEXTA)).estado).toBe('publicado');
    const depois: Dia = await (await acao('mover', { demanda: 'd-3', posicao: 'pos-1' })).json();
    expect(depois.estado).toBe('alterado');
  });

  it('só a coordenação mexe na coluna', async () => {
    for (const [nome, corpo] of [['para-distribuir', { texto: 'CALHAUS' }], ['mover', { demanda: 'd-1', posicao: 'pos-1' }], ['escalar', { editor: 'Ana Prado', turno: 'noite' }]] as const) {
      expect((await acao(nome, corpo, SEXTA, lia)).status).toBe(403);
      expect((await acao(nome, corpo, SEXTA, chefe)).status).toBe(403);
    }
    expect((await bia(`/api/montar-pauta/mover?dia=${SEXTA}`)).status).toBe(405);
  });

  it('nada foi ao Teable', () => {
    expect(escritas).toEqual([]);
    expect(teable.estado.pedidos.every((p: string) => p.startsWith('GET '))).toBe(true);
  });
});
