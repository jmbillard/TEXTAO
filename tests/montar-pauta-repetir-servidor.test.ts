// @vitest-environment node
/* Montar a pauta, Repetir (#129), pela API: POST /api/montar-pauta/repetir?dia= { de } copia a escala de outro dia (o
   mesmo dia na semana passada, o de ontem ou a semana passada inteira) para o dia vazio: a ilha, o editor e o horário,
   nunca as claquetes nem as tarefas (#199). Quem está fora no dia de destino vira vaga, com o motivo. A semana inteira só
   preenche os dias vazios. O dia vazio diz, no GET, o que cada opção traz. Nada vai ao Teable. Nomes, e-mails e
   claquetes fictícios; a semana de 7/12/2026 começa numa segunda, e a de antes em 30/11. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

const SEGUNDA_PASSADA = '2026-11-30';
const TERCA_PASSADA = '2026-12-01';
const QUARTA_PASSADA = '2026-12-02';
const SEGUNDA = '2026-12-07';
const TERCA = '2026-12-08';
const QUARTA = '2026-12-09';
const CHEFE = 'chefe@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const ENV_CADASTROS = { ...ENV, TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };
const CADASTROS: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
  tblRed: [],
  tblKeyRed: [],
  tblEdi: [
    { id: 'recE1', fields: { editor: 'Rui Teixeira' } },
    { id: 'recE2', fields: { editor: 'Elis Furtado' } },
  ],
  tblKeyEdi: [],
};
async function buscarOsCadastros(url: string, init: RequestInit = {}) {
  if ((init.method ?? 'GET') !== 'GET') throw new Error(`o Repetir não escreve no Teable: ${init.method} ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: CADASTROS[tabela] }), text: async () => '' };
}

type Posicao = { id: string; turno: string; editor: string; ilha: string; horario: string; demandas: { id: string; texto: string }[]; avisos: { texto: string }[]; vaga?: string };
type Dia = {
  dia: string;
  estado: string;
  posicoes: Posicao[];
  recado: string;
  semana: { dia: string; estado: string }[];
  repetir: { semanaPassada: { origem: string; posicoes: number }; ontem: { origem: string; posicoes: number }; semanaInteira: { origem: string; destino: string }[] } | null;
  repetido?: { origem: string; destino: string; posicoes: number; vagas: { editor: string; motivo: string }[] }[];
};

describe('montar a pauta: Repetir (#129)', () => {
  let servidor: Server;
  let base = '';
  let app: { fechar: () => Promise<void>; tabelasProntas: Promise<void> };
  let ilha = '';
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  const bia = como('bia.coord@empresa.com');
  const lia = como('lia.edicao@empresa.com');
  const gravar = (dia: string, posicoes: unknown, recado?: string) => bia(`/api/montar-pauta?dia=${dia}`, { method: 'PUT', body: JSON.stringify({ posicoes, recado }) });
  const ler = async (dia: string): Promise<Dia> => (await bia(`/api/montar-pauta?dia=${dia}`)).json();
  const repetir = (dia: string, de: string, quem = bia) => quem(`/api/montar-pauta/repetir?dia=${dia}`, { method: 'POST', body: JSON.stringify({ de }) });

  beforeAll(async () => {
    const teable = teableFalso({ EDICAO_producao: 'pauta_pg' }, { registros: { EDICAO_producao: [] } });
    app = criarApp({ db: abrirBanco(':memory:'), env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: criarCadastros(ENV_CADASTROS, { buscar: buscarOsCadastros }) });
    await app.tabelasProntas;
    servidor = createServer(app as never);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) });
    ilha = ((await (await bia('/api/cadastros/ilhas', { method: 'POST', body: JSON.stringify({ tipo: 'AVID', numero: '46' }) })).json()) as { ilha: { id: string } }).ilha.id;
    const semanaPassada = (dia: string, claquete: string) => [
      { id: `${dia}-p1`, turno: 'madrugada', editor: 'Rui Teixeira', ilha, horario: '22 as 6', demandas: [{ id: `${dia}-d1`, texto: claquete }, { id: `${dia}-d2`, texto: 'COMUNICAÇÃO' }], avisos: [{ id: `${dia}-a1`, texto: 'chegar cedo' }] },
      { id: `${dia}-p2`, turno: 'tarde', editor: 'Elis Furtado', ilha: '', horario: '14h às 22h53', demandas: [{ id: `${dia}-d3`, texto: 'CALHAUS' }] },
    ];
    expect((await gravar(SEGUNDA_PASSADA, semanaPassada(SEGUNDA_PASSADA, 'Noite de Gala 30/11 (DP)'), 'recado de lá')).status).toBe(200);
    expect((await gravar(TERCA_PASSADA, semanaPassada(TERCA_PASSADA, 'Mundo Animal 1/12 (P)'))).status).toBe(200);
    expect((await gravar(QUARTA_PASSADA, semanaPassada(QUARTA_PASSADA, 'Corujão 2/12 (D)'))).status).toBe(200);
    // a Elis de férias na semana nova, até a quarta
    expect((await bia(`/api/montar-pauta/ausencias?dia=${SEGUNDA}`, { method: 'POST', body: JSON.stringify({ editor: 'Elis Furtado', tipo: 'ferias', de: SEGUNDA, ate: QUARTA, observacao: '' }) })).status).toBe(200);
  });
  afterAll(async () => {
    await app.fechar();
    servidor.close();
  });

  it('o dia vazio diz o que cada opção traz: o mesmo dia na semana passada, o de ontem e os vazios da semana', async () => {
    const segunda = await ler(SEGUNDA);
    expect(segunda.estado).toBe('vazio');
    expect(segunda.repetir).toEqual({
      semanaPassada: { origem: SEGUNDA_PASSADA, posicoes: 2 },
      ontem: { origem: '2026-12-06', posicoes: 0 },
      semanaInteira: [
        { origem: SEGUNDA_PASSADA, destino: SEGUNDA },
        { origem: TERCA_PASSADA, destino: TERCA },
        { origem: QUARTA_PASSADA, destino: QUARTA },
      ],
    });
  });

  it('o mesmo dia na semana passada: a ilha, o editor e o horário; nunca as claquetes, as tarefas (#199), os avisos nem o recado', async () => {
    const r = await repetir(SEGUNDA, 'semana-passada');
    expect(r.status).toBe(200);
    const d: Dia = await r.json();
    expect(d.estado).toBe('rascunho');
    expect(d.posicoes.map((p) => [p.turno, p.editor, p.ilha, p.horario, p.demandas.map((x) => x.texto), p.avisos.length])).toEqual([
      ['madrugada', 'Rui Teixeira', ilha, '22h às 6h', [], 0],
      ['tarde', '', '', '14h às 22h53', [], 0],
    ]);
    expect(d.recado).toBe('');
    // a Elis está de férias: a posição dela vira vaga, com o motivo
    expect(d.posicoes[1].vaga).toBe('Elis Furtado está de férias até 9/12');
    expect(d.repetido).toEqual([{ origem: SEGUNDA_PASSADA, destino: SEGUNDA, posicoes: 2, vagas: [{ editor: 'Elis Furtado', motivo: 'férias até 9/12' }] }]);
    expect(d.repetir).toBeNull();
    // a origem continua como estava, com os ids dela
    const origem = await ler(SEGUNDA_PASSADA);
    expect(origem.posicoes.map((p) => p.id)).toEqual([`${SEGUNDA_PASSADA}-p1`, `${SEGUNDA_PASSADA}-p2`]);
    expect(origem.posicoes[0].demandas).toHaveLength(2);
    // recarregado, o motivo da vaga continua lá
    expect((await ler(SEGUNDA)).posicoes[1].vaga).toBe('Elis Furtado está de férias até 9/12');
  });

  it('a vaga perde o motivo quando ganha editor', async () => {
    const { posicoes } = await ler(SEGUNDA);
    const comEditor = posicoes.map((p, i) => (i === 1 ? { ...p, editor: 'Rui Teixeira' } : p));
    const d: Dia = await (await gravar(SEGUNDA, comEditor)).json();
    expect(d.posicoes[1]).not.toHaveProperty('vaga');
    // e a posição vazia que a coordenação grava sem motivo não ganha um
    expect((await (await gravar(SEGUNDA, posicoes)).json()).posicoes[1].vaga).toBe('Elis Furtado está de férias até 9/12');
  });

  it('não escreve por cima: o dia que já tem escala recusa; a origem sem nada também', async () => {
    const r = await repetir(SEGUNDA, 'ontem');
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/já tem escala/);
    const vazia = await repetir('2026-12-10', 'ontem');
    expect(vazia.status).toBe(400);
    expect(((await vazia.json()) as { erro: string }).erro).toMatch(/Nada montado/);
    expect((await repetir(TERCA, 'de-qualquer-jeito')).status).toBe(400);
  });

  it('a semana passada inteira só preenche os dias vazios (a segunda, já montada, fica como está)', async () => {
    const antes = (await ler(SEGUNDA)).posicoes;
    const d: Dia = await (await repetir(TERCA, 'semana-inteira')).json();
    expect(d.repetido?.map((x) => [x.origem, x.destino, x.posicoes])).toEqual([
      [TERCA_PASSADA, TERCA, 2],
      [QUARTA_PASSADA, QUARTA, 2],
    ]);
    expect((await ler(SEGUNDA)).posicoes).toEqual(antes);
    const quarta = await ler(QUARTA);
    expect(quarta.posicoes.map((p) => [p.editor, p.demandas.map((x) => x.texto)])).toEqual([
      ['Rui Teixeira', []],
      ['', []],
    ]);
    expect(d.semana.filter((s) => [SEGUNDA, TERCA, QUARTA].includes(s.dia)).map((s) => s.estado)).toEqual(['rascunho', 'rascunho', 'rascunho']);
  });

  it('só a coordenação repete', async () => {
    expect((await repetir('2026-12-11', 'semana-passada', lia)).status).toBe(403);
    expect((await repetir('2026-12-11', 'semana-passada', chefe)).status).toBe(403);
  });
});
