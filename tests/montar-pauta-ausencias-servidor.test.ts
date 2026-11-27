// @vitest-environment node
/* Montar a pauta, ausências com período (#128), pela API: a ausência (quem, tipo, período e observação) marcada uma
   vez vale para todos os dias do período; ao marcar, o PROMeiro diz onde a pessoa está escalada, e essas posições
   viram vaga nos rascunhos. Num dia já publicado, ele não mexe sozinho: oferece tirar a pessoa, e tirar manda as
   demandas dela para "Para distribuir" e deixa o dia alterado. Na Pauta da edição, todos veem "fora"; o motivo e a
   observação, só a coordenação e os administradores. Nada vai ao Teable. Nomes, e-mails e claquetes fictícios;
   27/11/2026 é uma sexta. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/** O dia da Pauta da edição como a tela o vê (#162): a Semana que tem o dia, só com as linhas e quem está fora nele. */
async function pautaNoDia(quem: (caminho: string) => Promise<Response>, dia: string) {
  const s = await (await quem(`/api/pauta/semana?inicio=${dia}`)).json();
  return { ...s, linhas: s.linhas.filter((l: { dia: string }) => l.dia === dia), fora: (s.fora ?? []).filter((f: { dia: string }) => f.dia === dia) };
}

const SEXTA = '2026-11-27';
const SABADO = '2026-11-28';
const SEGUNDA = '2026-11-30';
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
  ],
  tblKeyEdi: [],
};
const escritas: string[] = [];
async function buscarOsCadastros(url: string, init: RequestInit = {}) {
  const metodo = init.method ?? 'GET';
  if (metodo !== 'GET') {
    escritas.push(`${metodo} ${url}`);
    throw new Error(`as ausências não escrevem no Teable: ${metodo} ${url}`);
  }
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: CADASTROS[tabela] }), text: async () => '' };
}

const SEXTA_RASCUNHO = [
  { id: 'pos-1', turno: 'madrugada', editor: 'Rui Teixeira', horario: '22h às 6h', demandas: [{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }] },
  { id: 'pos-2', turno: 'tarde', editor: 'Elis Furtado', horario: '14h às 22h53', demandas: [{ id: 'd-2', texto: 'Mundo Animal 30/11 (P)' }] },
];
const SEGUNDA_RASCUNHO = [{ id: 'pos-3', turno: 'manha', editor: 'elis  furtado', horario: '6h às 15h', demandas: [] }];
const SABADO_PUBLICADO = [
  { id: 'pos-4', turno: 'tarde', editor: 'Gil Moura', horario: '14h às 23h', demandas: [{ id: 'd-4', texto: 'Corujão 28/11 (D)' }, { id: 'd-5', texto: 'CALHAUS' }] },
  { id: 'pos-5', turno: 'noite', editor: 'Rui Teixeira', horario: '20h às 2h', demandas: [{ id: 'd-6', texto: 'Vale a Pena Rever 1/12 (P)' }] },
];

type Ausencia = { id: string; editor: string; tipo: string; de: string; ate: string; observacao: string };
type Painel = { dia: string; ausencias: Ausencia[]; fora: Ausencia[]; noPublicado: { ausencia: string; editor: string; dia: string; turnos: string[] }[]; paraDistribuir: { id: string; texto: string; deQuem: string }[] };
type Escalada = { dia: string; turnos: string[]; publicado: boolean }[];
type Posicao = { id: string; editor: string; demandas: { id: string; texto: string }[] };
type Fora = { dia: string; editor: string; motivo?: string; observacao?: string };

describe('montar a pauta: ausências com período (#128)', () => {
  let servidor: Server;
  let base = '';
  let teable: ReturnType<typeof teableFalso>;
  let app: { fechar: () => Promise<void>; tabelasProntas: Promise<void> };
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  const bia = como('bia.coord@empresa.com');
  const lia = como('lia.edicao@empresa.com');
  const gravar = (dia: string, posicoes: unknown) => bia(`/api/montar-pauta?dia=${dia}`, { method: 'PUT', body: JSON.stringify({ posicoes }) });
  const rascunho = async (dia: string): Promise<{ estado: string; posicoes: Posicao[] }> => (await bia(`/api/montar-pauta?dia=${dia}`)).json();
  const painel = async (dia: string, quem = bia): Promise<Painel> => (await quem(`/api/montar-pauta/ausencias?dia=${dia}`)).json();
  const marcar = (corpo: Record<string, string>, quem = bia) => quem(`/api/montar-pauta/ausencias?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify(corpo) });
  const quemEstaFora = async (dia: string) => (await painel(dia)).fora.map((a) => a.editor);
  const foraNaPauta = async (quem: typeof bia, dia = SEXTA): Promise<Fora[]> => (await pautaNoDia(quem, dia)).fora;

  beforeAll(async () => {
    teable = teableFalso({ EDICAO_producao: 'pauta_pg' }, { registros: { EDICAO_producao: [] } });
    app = criarApp({ db: abrirBanco(':memory:'), env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: criarCadastros(ENV_CADASTROS, { buscar: buscarOsCadastros }) });
    await app.tabelasProntas;
    servidor = createServer(app as never);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) });
    expect((await gravar(SEXTA, SEXTA_RASCUNHO)).status).toBe(200);
    expect((await gravar(SEGUNDA, SEGUNDA_RASCUNHO)).status).toBe(200);
    expect((await gravar(SABADO, SABADO_PUBLICADO)).status).toBe(200);
    expect((await bia(`/api/montar-pauta/publicar?dia=${SABADO}`, { method: 'POST' })).status).toBe(200);
  });
  afterAll(async () => {
    await app.fechar();
    servidor.close();
  });

  it('antes de marcar, o PROMeiro diz onde a pessoa está escalada no período (e quais dias já foram publicados)', async () => {
    const r = await bia(`/api/montar-pauta/ausencias/onde?editor=${encodeURIComponent('Elis Furtado')}&de=${SEXTA}&ate=2026-12-01`);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { escalada: Escalada }).escalada).toEqual([
      { dia: SEXTA, turnos: ['tarde'], publicado: false },
      { dia: SEGUNDA, turnos: ['manha'], publicado: false },
    ]);
    const gil: { escalada: Escalada } = await (await bia(`/api/montar-pauta/ausencias/onde?editor=Gil%20Moura&de=${SABADO}&ate=${SABADO}`)).json();
    expect(gil.escalada).toEqual([{ dia: SABADO, turnos: ['tarde'], publicado: true }]);
  });

  it('férias com período: marcada uma vez, vale de "de" a "até"; nos rascunhos, a posição vira vaga e as demandas ficam', async () => {
    const r = await marcar({ editor: 'Elis Furtado', tipo: 'ferias', de: SEXTA, ate: '2026-12-01', observacao: 'volta dia 2' });
    expect(r.status).toBe(200);
    const corpo: Painel & { marcada: Ausencia; escalada: Escalada } = await r.json();
    expect(corpo.marcada).toMatchObject({ editor: 'Elis Furtado', tipo: 'ferias', de: SEXTA, ate: '2026-12-01', observacao: 'volta dia 2' });
    expect(corpo.escalada.map((e) => e.dia)).toEqual([SEXTA, SEGUNDA]);
    for (const dia of [SEXTA, SABADO, SEGUNDA, '2026-12-01']) expect(await quemEstaFora(dia)).toContain('Elis Furtado');
    for (const dia of ['2026-11-26', '2026-12-02']) expect(await quemEstaFora(dia)).not.toContain('Elis Furtado');
    // a posição da Elis vira vaga (sem editor), com as demandas; a do Rui fica
    const sexta = await rascunho(SEXTA);
    expect(sexta.posicoes.map((p) => [p.id, p.editor, p.demandas.length])).toEqual([['pos-1', 'Rui Teixeira', 1], ['pos-2', '', 1]]);
    expect(sexta.estado).toBe('rascunho');
    expect((await rascunho(SEGUNDA)).posicoes[0].editor).toBe('');
  });

  it('folga e DM valem um dia só; tipo, período e quem errados são recusados; só a coordenação marca', async () => {
    const r = await marcar({ editor: 'Gil Moura', tipo: 'folga', de: '2026-12-03', ate: '2026-12-10', observacao: 'comp' });
    expect(((await r.json()) as { marcada: Ausencia }).marcada).toMatchObject({ de: '2026-12-03', ate: '2026-12-03' });
    expect(await quemEstaFora('2026-12-04')).not.toContain('Gil Moura');
    expect((await marcar({ editor: 'Gil Moura', tipo: 'gripe', de: SEXTA, ate: SEXTA })).status).toBe(400);
    expect((await marcar({ editor: 'Gil Moura', tipo: 'licenca', de: '2026-12-10', ate: '2026-12-03' })).status).toBe(400);
    expect((await marcar({ editor: 'Gil Moura', tipo: 'ferias', de: '2026-02-30', ate: '2026-03-02' })).status).toBe(400);
    expect((await marcar({ editor: '  ', tipo: 'folga', de: SEXTA, ate: SEXTA })).status).toBe(400);
    expect((await marcar({ editor: 'Gil Moura', tipo: 'folga', de: SEXTA, ate: SEXTA }, lia)).status).toBe(403);
    expect((await marcar({ editor: 'Gil Moura', tipo: 'folga', de: SEXTA, ate: SEXTA }, chefe)).status).toBe(403);
    expect((await lia(`/api/montar-pauta/ausencias?dia=${SEXTA}`)).status).toBe(403);
  });

  it('na Pauta da edição, todos veem "fora"; o motivo e a observação, só a coordenação e os administradores', async () => {
    expect(await foraNaPauta(lia)).toEqual([{ dia: SEXTA, editor: 'Elis Furtado' }]);
    const comMotivo = [{ dia: SEXTA, editor: 'Elis Furtado', motivo: 'férias até 1/12', observacao: 'volta dia 2' }];
    expect(await foraNaPauta(bia)).toEqual(comMotivo);
    expect(await foraNaPauta(chefe)).toEqual(comMotivo);
    // na Semana, um por dia do período
    const semana: { fora: Fora[] } = await (await lia(`/api/pauta/semana?inicio=${SEXTA}`)).json();
    expect(semana.fora.map((f) => f.dia)).toEqual([SEXTA, SABADO, '2026-11-29']);
    expect(semana.fora.every((f) => !('motivo' in f) && !('observacao' in f))).toBe(true);
  });

  it('num dia publicado, marcar não mexe sozinho: oferece tirar a pessoa', async () => {
    const r = await marcar({ editor: 'Gil Moura', tipo: 'dm', de: SABADO, ate: SABADO, observacao: '' });
    expect(((await r.json()) as { escalada: Escalada }).escalada).toEqual([{ dia: SABADO, turnos: ['tarde'], publicado: true }]);
    const sabado = await rascunho(SABADO);
    expect(sabado.estado).toBe('publicado');
    expect(sabado.posicoes[0].editor).toBe('Gil Moura');
    expect((await painel(SABADO)).noPublicado).toEqual([{ ausencia: expect.any(String), editor: 'Gil Moura', dia: SABADO, turnos: ['tarde'] }]);
  });

  it('tirar a pessoa do dia publicado: a posição fica vaga, as demandas vão para "Para distribuir" e o dia fica alterado', async () => {
    const r = await bia(`/api/montar-pauta/tirar?dia=${SABADO}`, { method: 'POST', body: JSON.stringify({ editor: 'Gil Moura' }) });
    expect(r.status).toBe(200);
    const p: Painel = await r.json();
    expect(p.paraDistribuir.map((d) => [d.texto, d.deQuem])).toEqual([['Corujão 28/11 (D)', 'Gil Moura'], ['CALHAUS', 'Gil Moura']]);
    expect(p.noPublicado).toEqual([]);
    const sabado = await rascunho(SABADO);
    expect(sabado.estado).toBe('alterado');
    expect(sabado.posicoes.map((x) => [x.editor, x.demandas.length])).toEqual([['', 0], ['Rui Teixeira', 1]]);
    // a Pauta continua com o publicado até publicar de novo; o Gil aparece fora
    const naPauta: { linhas: { editor: string; texto: string }[]; fora: Fora[] } = await pautaNoDia(lia, SABADO);
    expect(naPauta.linhas.map((l) => `${l.editor}: ${l.texto}`)).toContain('Gil Moura: Corujão 28/11 (D)');
    expect(naPauta.fora.map((f) => f.editor)).toEqual(['Elis Furtado', 'Gil Moura']);
    // tirar quem não está escalado é recusado; "já distribuí" tira da lista
    expect((await bia(`/api/montar-pauta/tirar?dia=${SABADO}`, { method: 'POST', body: JSON.stringify({ editor: 'Gil Moura' }) })).status).toBe(400);
    const depois: Painel = await (await bia(`/api/montar-pauta/para-distribuir/tirar?dia=${SABADO}`, { method: 'POST', body: JSON.stringify({ id: p.paraDistribuir[1].id }) })).json();
    expect(depois.paraDistribuir.map((d) => d.texto)).toEqual(['Corujão 28/11 (D)']);
    expect((await lia(`/api/montar-pauta/tirar?dia=${SABADO}`, { method: 'POST', body: JSON.stringify({ editor: 'Rui Teixeira' }) })).status).toBe(403);
  });

  it('apagar a ausência a tira dos dias; o registro fica no histórico', async () => {
    const gil = (await painel(SABADO)).fora.find((a) => a.editor === 'Gil Moura')!;
    const r = await bia(`/api/montar-pauta/ausencias/apagar?dia=${SABADO}`, { method: 'POST', body: JSON.stringify({ id: gil.id }) });
    expect(r.status).toBe(200);
    expect(((await r.json()) as Painel).fora.map((a) => a.editor)).toEqual(['Elis Furtado']);
    const hist: { historico: (Ausencia & { apagadaEm: string | null })[] } = await (await bia(`/api/montar-pauta/ausencias/historico?editor=Gil%20Moura`)).json();
    expect(hist.historico.map((a) => [a.tipo, !!a.apagadaEm])).toEqual([['dm', true], ['folga', false]]);
  });

  it('nada foi ao Teable', () => {
    expect(escritas).toEqual([]);
    expect(teable.estado.pedidos.every((p: string) => p.startsWith('GET '))).toBe(true);
  });
});
