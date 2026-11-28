// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
import { porProducoes } from './fixtures/producoes-falsas';

/* A Semana da pauta da edição (#94) pela API: a tabela EDICAO_producao do Teable de mentira (achada pelo nome, o
   Postgres respondendo as linhas inteiras, sem olhar o WHERE), lida só para a semana pedida. Cada linha vem
   classificada (claquete, tarefa ou aviso), com o turno no fuso de São Paulo e o dia da pauta. Só vêm as claquetes que
   casam com uma Produção (#199, ADR 0008), a info e o aviso: a tarefa e a claquete sem Produção ficam de fora. As
   Produções das claquetes da semana vão direto no SQLite (fixtures/producoes-falsas). Nada do Trello: o ambiente nem
   tem o Trello. Nomes e claquetes fictícios. */

const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const NOMES = { EDICAO_producao: 'pauta_pg' };

type Campos = Record<string, unknown>;
const editor = (nome: string) => ({ id: `rec${nome.replace(/\W/g, '')}`, title: nome });
/** Uma linha da pauta: o dia (AAAA-MM-DD) e o turno em horas de São Paulo (o fim menor que o início vira o dia). */
function linha(id: string, claquete: string, quem: string | null, dia: string, turno: [string, string] | null, extra: Campos = {}) {
  const sp = (d: string, h: string) => new Date(`${d}T${h}:00-03:00`).toISOString();
  const seguinte = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const fields: Campos = {
    claquete,
    key: claquete.toUpperCase(),
    editor: quem ? editor(quem) : null,
    data: sp(dia, '00:00'),
    expediente_inicio: turno ? sp(dia, turno[0]) : null,
    expediente_fim: turno ? sp(turno[1] < turno[0] ? seguinte(dia) : dia, turno[1]) : null,
    anotacao: null,
    alterado_em: '2026-11-24T12:00:00.000Z',
    ...extra,
  };
  return { id, fields };
}

const PAUTA = () => [
  // a semana de 23/11 (segunda) a 29/11 (domingo)
  linha('recP1', 'Festa do Bairro(Prologo)26/11 (AH)', 'Carla Noite', '2026-11-24', ['22:00', '06:00']),
  linha('recP2', 'COMUNICAÇÃO', 'Carla Noite', '2026-11-24', ['22:00', '06:00']),
  linha('recP3', 'Show da Tarde 25/11', 'Beto Tarde', '2026-11-24', ['14:00', '22:53']),
  linha('recP4', 'Show da Tarde 26/11', 'Beto Tarde', '2026-11-25', ['14:00', '22:53']),
  linha('recP5', 'Novela Sol 24/11-2', 'Ana Manhã', '2026-11-23', ['06:00', '15:00']),
  linha('recP6', 'REDATOR VEM ACOMPANHAR', 'Ana Manhã', '2026-11-23', ['06:00', '15:00'], { anotacao: true }),
  linha('recP7', 'CALHAUS', null, '2026-11-26', ['08:00', '17:00'], { alterado_em: '2026-11-26T15:30:00.000Z' }),
  linha('recP8', 'Esporte Total 29/11', 'Ana Manhã', '2026-11-28', ['06:00', '15:00']),
  // uma tarde que alguém pegou de manhã, uma vez: o turno de costume continua a tarde
  linha('recP9', 'Show da Tarde 28/11', 'Beto Tarde', '2026-11-27', ['06:00', '15:00']),
  linha('recP10', 'Show da Tarde 29/11', 'Beto Tarde', '2026-11-26', ['14:00', '22:53']),
  // fora da semana: o Postgres de mentira devolve, mas não entra
  linha('recFora1', 'Novela Sol 22/11', 'Ana Manhã', '2026-11-22', ['06:00', '15:00']),
  linha('recFora2', 'Novela Sol 30/11', 'Ana Manhã', '2026-11-30', ['06:00', '15:00']),
];

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

/** As claquetes da semana que têm Produção (a Esporte Total 29/11 não tem: fica de fora da Pauta). */
const COM_PRODUCAO = ['Festa do Bairro(Prologo)26/11', 'Show da Tarde 25/11', 'Show da Tarde 26/11', 'Novela Sol 24/11-2', 'Show da Tarde 28/11', 'Show da Tarde 29/11', 'Novela Sol 28/11', 'Show da Tarde 4/12', 'Festival 3/1'];

async function comServidor({ env = ENV, registros = { EDICAO_producao: PAUTA() }, db = abrirBanco(':memory:'), producoes = COM_PRODUCAO }: { env?: Record<string, string>; registros?: Record<string, unknown[]>; db?: unknown; producoes?: readonly string[] } = {}) {
  const teable = teableFalso(NOMES, { registros });
  const app = criarApp({ db, env, buscarNoTeable: teable, abrirPg: teable.abrirPg });
  await app.tabelasProntas;
  porProducoes(db, producoes, { perto: '2026-11-24' });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string) => fetch(base + caminho, { headers: email ? { 'cf-access-authenticated-user-email': email } : {} });
  return { base, teable, ana: como('ana@empresa.com'), chefe: como('chefe@empresa.com'), ninguem: como('') };
}

type Linha = { id: string; dia: string; editor: string; tipo: string; texto: string; turno: { inicio: string; fim: string } | null };
type Semana = { inicio: string; dias: string[]; editores: string[]; linhas: Linha[]; alteradoEm: string | null };
const semana = async (r: Response) => {
  expect(r.status).toBe(200);
  return (await r.json()) as Semana;
};

describe('a Semana da pauta da edição', () => {
  it('lê só a semana pedida, de segunda a domingo, na ordem dos dias; qualquer pessoa logada vê', async () => {
    const { ana, teable } = await comServidor();
    const s = await semana(await ana('/api/pauta/semana?inicio=2026-11-26'));
    expect(s.inicio).toBe('2026-11-23');
    expect(s.dias).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    // a COMUNICAÇÃO e a CALHAUS (tarefas) e a Esporte Total (sem Produção) ficam de fora (#199)
    expect(s.linhas.map((l) => l.id).sort()).toEqual(['recP1', 'recP10', 'recP3', 'recP4', 'recP5', 'recP6', 'recP9']);
    expect(s.linhas.map((l) => l.dia)).toEqual([...s.linhas.map((l) => l.dia)].sort());
    // a consulta é do Postgres do Teable, só leitura, pela tabela achada pelo nome, com o período nos parâmetros
    const i = teable.estado.consultas.findIndex((sql: string) => sql.includes('"bseFalso"."pauta_pg"') && sql.includes('expediente_inicio'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(teable.estado.consultas[i]).toMatch(/^\s*SELECT/);
    expect(teable.estado.parametros[i]).toEqual(['2026-11-23T03:00:00.000Z', '2026-11-30T03:00:00.000Z']);
    // a hora da última alteração da pauta: a do Teable inteiro, também do que ficou de fora
    expect(s.alteradoEm).toBe('2026-11-26T15:30:00.000Z');
  });

  it('cada linha vem classificada: claquete ou aviso (a caixinha de anotação marcada); a tarefa e a claquete sem Produção ficam de fora (#199)', async () => {
    const { ana } = await comServidor();
    const s = await semana(await ana('/api/pauta/semana?inicio=2026-11-23'));
    const por = (id: string) => s.linhas.find((l) => l.id === id);
    expect(por('recP1')).toMatchObject({ tipo: 'claquete', texto: 'Festa do Bairro(Prologo)26/11 (AH)' });
    expect(por('recP5')).toMatchObject({ tipo: 'claquete', texto: 'Novela Sol 24/11-2' });
    expect(por('recP6')).toMatchObject({ tipo: 'aviso', texto: 'REDATOR VEM ACOMPANHAR' });
    expect(por('recP2')).toBeUndefined();
    expect(por('recP7')).toBeUndefined();
    expect(por('recP8')).toBeUndefined();
    expect(s.linhas.every((l) => l.tipo !== 'tarefa')).toBe(true);
  });

  it('a claquete que passa a ter Produção aparece; a info depois da claquete de fora sai com ela', async () => {
    const { ana } = await comServidor({
      registros: { EDICAO_producao: [...PAUTA(), linha('recI1', 'ENTRA SÁBADO', 'Ana Manhã', '2026-11-28', ['06:00', '15:00']), linha('recI2', 'VIRA B', 'Beto Tarde', '2026-11-27', ['06:00', '15:00'])] },
      producoes: [...COM_PRODUCAO],
    });
    const s = await semana(await ana('/api/pauta/semana?inicio=2026-11-23'));
    // a info da Esporte Total (sem Produção) sai; a do Show da Tarde 28/11 (com Produção) fica
    expect(s.linhas.find((l) => l.id === 'recI1')).toBeUndefined();
    expect(s.linhas.find((l) => l.id === 'recI2')).toMatchObject({ tipo: 'info', texto: 'VIRA B' });
    await parar?.();
    const comEsporte = await comServidor({ registros: { EDICAO_producao: [...PAUTA(), linha('recI1', 'ENTRA SÁBADO', 'Ana Manhã', '2026-11-28', ['06:00', '15:00'])] }, producoes: [...COM_PRODUCAO, 'Esporte Total 29/11'] });
    const t = await semana(await comEsporte.ana('/api/pauta/semana?inicio=2026-11-23'));
    expect(t.linhas.find((l) => l.id === 'recP8')).toMatchObject({ tipo: 'claquete' });
    expect(t.linhas.find((l) => l.id === 'recI1')).toMatchObject({ tipo: 'info' });
  });

  it('o turno sai do expediente, no fuso de São Paulo; o que passa da meia-noite conta no dia em que começou', async () => {
    const { ana } = await comServidor();
    const s = await semana(await ana('/api/pauta/semana?inicio=2026-11-23'));
    const por = (id: string) => s.linhas.find((l) => l.id === id)!;
    expect(por('recP1')).toMatchObject({ dia: '2026-11-24', editor: 'Carla Noite', turno: { inicio: '22:00', fim: '06:00' } });
    expect(por('recP3')).toMatchObject({ dia: '2026-11-24', turno: { inicio: '14:00', fim: '22:53' } });
    expect(s.linhas.some((l) => l.dia === '2026-11-25' && l.editor === 'Carla Noite')).toBe(false);
  });

  it('os editores vêm na ordem do turno de costume, e a linha sem editor fica no grupo "sem editor", no fim', async () => {
    const { ana } = await comServidor({ registros: { EDICAO_producao: [...PAUTA(), linha('recS1', 'Show da Tarde 26/11', null, '2026-11-26', ['08:00', '17:00'])] } });
    const s = await semana(await ana('/api/pauta/semana?inicio=2026-11-23'));
    expect(s.editores).toEqual(['Ana Manhã', 'Beto Tarde', 'Carla Noite', '']);
    expect(s.linhas.find((l) => l.id === 'recS1')).toMatchObject({ editor: '', turno: { inicio: '08:00', fim: '17:00' } });
    // só com a tarefa sem editor (a CALHAUS), o grupo "sem editor" não aparece: a tarefa ficou de fora (#199)
    await parar?.();
    const so = await comServidor();
    expect((await semana(await so.ana('/api/pauta/semana?inicio=2026-11-23'))).editores).toEqual(['Ana Manhã', 'Beto Tarde', 'Carla Noite']);
  });

  it('as versões da chamada vêm já resolvidas, da data da claquete ou, sem ela, do dia da linha (#95)', async () => {
    const { ana } = await comServidor({
      registros: {
        EDICAO_producao: [
          ...PAUTA(),
          linha('recV1', 'Show da Tarde 4/12 Dp', 'Beto Tarde', '2026-11-27', ['14:00', '22:53']),
          linha('recV2', 'Festival 3/1 (MÊS)', 'Ana Manhã', '2026-11-27', ['06:00', '15:00']),
          linha('recV3', 'Especial de Verão (MES)', 'Ana Manhã', '2026-11-27', ['06:00', '15:00']),
          linha('recV4', 'Show da Tarde 28/11 (XYZ)', 'Beto Tarde', '2026-11-27', ['14:00', '22:53']),
          linha('recV5', 'CALHAUS (VER LISTA)', null, '2026-11-27', ['08:00', '17:00']),
          linha('recV6', 'TROCAR A GRADE (AH)', 'Carla Noite', '2026-11-27', ['22:00', '06:00'], { anotacao: true }),
        ],
      },
    });
    const s = await semana(await ana('/api/pauta/semana?inicio=2026-11-23'));
    const por = (id: string) => s.linhas.find((l) => l.id === id)! as Linha & { versoes: unknown[]; semVersao: string };
    expect(por('recP1')).toMatchObject({ semVersao: 'Festa do Bairro(Prologo)26/11', versoes: [{ codigo: 'A', rotulo: 'amanhã', conhecida: true }, { codigo: 'H', rotulo: 'hoje', conhecida: true }] });
    expect(por('recV1').versoes).toEqual([
      { codigo: 'D', rotulo: 'dia 4', conhecida: true },
      { codigo: 'p', rotulo: 'próxima sex', conhecida: true },
    ]);
    expect(por('recV2').versoes).toEqual([{ codigo: 'MÊS', rotulo: 'em janeiro', conhecida: true }]);
    // a tarefa (com ou sem código) fica de fora (#199): as versões dela estão no teste do modelo (pauta-versoes)
    expect(por('recV3')).toBeUndefined();
    expect(por('recV5')).toBeUndefined();
    // o desconhecido vem cru na claquete; o aviso não ganha versão desconhecida nem versão nenhuma
    expect(por('recV4')).toMatchObject({ semVersao: 'Show da Tarde 28/11', versoes: [{ codigo: 'XYZ', rotulo: 'XYZ', conhecida: false }] });
    expect(por('recV6')).toMatchObject({ tipo: 'aviso', semVersao: 'TROCAR A GRADE (AH)', versoes: [] });
    // sem código, a linha inteira
    expect(por('recP5')).toMatchObject({ semVersao: 'Novela Sol 24/11-2', versoes: [] });
  });

  it('sem semana pedida, vale a de hoje; quem não entrou não vê', async () => {
    const { ana, ninguem } = await comServidor({ registros: { EDICAO_producao: [] } });
    const s = await semana(await ana('/api/pauta/semana'));
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    expect(s.dias).toContain(hoje);
    expect(new Date(`${s.inicio}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(s).toMatchObject({ editores: [], linhas: [], alteradoEm: null });
    expect((await ninguem('/api/pauta/semana')).status).toBe(401);
  });

  it('sem o Postgres do Teable, a página fica sabendo por quê (nada do Trello)', async () => {
    const { ana } = await comServidor({ env: { ...TEABLE_FALSO, TEABLE_PG_ESQUEMA: 'bseFalso' } });
    const r = await ana('/api/pauta/semana?inicio=2026-11-23');
    expect(r.status).toBe(503);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/Postgres do Teable/);
  });

  it('com o Postgres fora do ar, diz que não respondeu', async () => {
    const { ana, teable } = await comServidor();
    teable.estado.fora = true;
    const r = await ana('/api/pauta/semana?inicio=2026-11-23');
    expect(r.status).toBe(503);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/não respondeu/);
  });
});

/* O Dia da pauta (#97) pela API: um dia só, com a mesma leitura da Semana (cada linha classificada, o turno, as
   versões) e os editores na ordem de início do turno daquele dia; sem editor, no fim. */
type Dia = { dia: string; editores: string[]; linhas: (Linha & { producoes?: unknown[] })[]; alteradoEm: string | null };
const diaDaPauta = async (r: Response) => {
  expect(r.status).toBe(200);
  return (await r.json()) as Dia;
};

describe('o Dia da pauta da edição (#97)', () => {
  it('lê só o dia pedido, de 00:00 a 00:00 em São Paulo; o turno que passa da meia-noite fica no dia em que começou', async () => {
    const { ana, teable } = await comServidor();
    const d = await diaDaPauta(await ana('/api/pauta/dia?dia=2026-11-24'));
    expect(d.dia).toBe('2026-11-24');
    // a COMUNICAÇÃO (tarefa) fica de fora (#199)
    expect(d.linhas.map((l) => l.id).sort()).toEqual(['recP1', 'recP3']);
    expect(d.linhas.find((l) => l.id === 'recP1')).toMatchObject({ tipo: 'claquete', editor: 'Carla Noite', turno: { inicio: '22:00', fim: '06:00' }, versoes: [{ rotulo: 'amanhã' }, { rotulo: 'hoje' }] });
    const consultas: string[] = teable.estado.consultas;
    const i = consultas.map((sql, j) => (sql.includes('"bseFalso"."pauta_pg"') && sql.includes('expediente_inicio') ? j : -1)).reduce((a, b) => Math.max(a, b), -1);
    expect(teable.estado.consultas[i]).toMatch(/^\s*SELECT/);
    expect(teable.estado.parametros[i]).toEqual(['2026-11-24T03:00:00.000Z', '2026-11-25T03:00:00.000Z']);
    expect(d.alteradoEm).toBe('2026-11-24T12:00:00.000Z');
  });

  it('os editores vêm na ordem de início do turno daquele dia (não o de costume); sem editor, no fim', async () => {
    const { ana } = await comServidor({
      registros: { EDICAO_producao: [...PAUTA(), linha('recD1', 'Novela Sol 28/11', 'Ana Manhã', '2026-11-27', ['14:00', '22:53']), linha('recD2', 'Show da Tarde 28/11 (H)', 'Carla Noite', '2026-11-27', ['10:00', '18:00'])] },
    });
    // Beto pegou a manhã de sexta (06:00), Carla entrou às 10:00 e Ana à tarde
    expect((await diaDaPauta(await ana('/api/pauta/dia?dia=2026-11-27'))).editores).toEqual(['Beto Tarde', 'Carla Noite', 'Ana Manhã']);
    // a CALHAUS sem editor (uma tarefa) fica de fora (#199): o grupo "sem editor" some
    expect((await diaDaPauta(await ana('/api/pauta/dia?dia=2026-11-26'))).editores).toEqual(['Beto Tarde']);
  });

  it('o aviso vem no dia, preso ao editor e ao turno, separado da pauta', async () => {
    const { ana } = await comServidor();
    const d = await diaDaPauta(await ana('/api/pauta/dia?dia=2026-11-23'));
    expect(d.editores).toEqual(['Ana Manhã']);
    expect(d.linhas.find((l) => l.id === 'recP6')).toMatchObject({ tipo: 'aviso', editor: 'Ana Manhã', texto: 'REDATOR VEM ACOMPANHAR', turno: { inicio: '06:00', fim: '15:00' } });
  });

  it('sem dia (ou com um dia que não é data), vale hoje; quem não entrou não vê', async () => {
    const { ana, ninguem } = await comServidor({ registros: { EDICAO_producao: [] } });
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    expect(await diaDaPauta(await ana('/api/pauta/dia'))).toMatchObject({ dia: hoje, editores: [], linhas: [], alteradoEm: null });
    expect((await diaDaPauta(await ana('/api/pauta/dia?dia=2026-13-45'))).dia).toBe(hoje);
    expect((await ninguem('/api/pauta/dia')).status).toBe(401);
  });

  it('sem o Postgres do Teable, ou com ele fora do ar, a página fica sabendo', async () => {
    const sem = await comServidor({ env: { ...TEABLE_FALSO, TEABLE_PG_ESQUEMA: 'bseFalso' } });
    const r = await sem.ana('/api/pauta/dia?dia=2026-11-24');
    expect(r.status).toBe(503);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/Postgres do Teable/);
    await parar?.();
    const fora = await comServidor();
    fora.teable.estado.fora = true;
    expect((await fora.ana('/api/pauta/dia?dia=2026-11-24')).status).toBe(503);
  });
});

/* O cruzamento com a produção da arte (#96): as Produções do PROMeiro (a carga da produção da arte do Teable de
   mentira) achadas pela chave da claquete da pauta, em três tentativas: a chave exata, sem a versão no fim, sem a
   praça. Nada do Trello e nenhuma leitura nova do Teable na rota da Semana. */
describe('a claquete da pauta com a produção da arte (#96)', () => {
  const NOMES_COM_ARTE = { ARTE_producao: 'arte_producao_pg' };
  const arte = (id: string, fields: Campos) => ({ id, fields: { card_ID: '', status: '[]', designers: null, arquivado: false, entregue: false, praca: null, filme: null, ...fields } });
  const PRODUCAO = () => [
    // exata: entregue, com a mesma arte duas vezes (conta uma) e a prioridade ALTA
    arte('recA1', { claquete: 'Show da Tarde 25/11', status: '["FINALIZADO"]', entregue: true, designers: '["Designer Um"]', artes: 'HOJE | AMANHÃ | Hoje', prioridade: 'ALTA', data_entrada: '2026-11-20T12:00:00.000Z', data_entrega: '2026-11-23T18:00:00.000Z' }),
    // a mesma chave um ano antes: não é desta pauta
    arte('recA0', { claquete: 'Show da Tarde 25/11', status: '["FINALIZADO"]', arquivado: true, designers: '["Designer Antigo"]', data_entrada: '2025-11-20T12:00:00.000Z' }),
    // sem a versão: a pauta escreve "NAH" sem parênteses
    arte('recA2', { claquete: 'Novela Sol 27/11', status: '["PRODUZINDO"]', designers: '["Designer Dois"]', artes: 'VEM AI', prioridade: 'MÉDIA', data_entrada: '2026-11-22T12:00:00.000Z' }),
    // sem a praça: a pauta escreve "Rede"; a produção tem SP e a G5
    arte('recA3', { claquete: 'Quem Ama 28/11 SP', artes: 'HOJE\nAMANHÃ', data_entrada: '2026-11-23T12:00:00.000Z' }),
    arte('recA4', { claquete: 'Quem Ama 28/11', status: '["PRODUZINDO"]', designers: '["Designer Um","Designer Dois"]', artes: 'HOJE', data_entrada: '2026-11-23T12:00:00.000Z' }),
    // a Festa do Bairro, que a pauta tem em duas versões
    arte('recA5', { claquete: 'Festa do Bairro(Prologo)26/11', artes: 'HOJE', data_entrada: '2026-11-21T12:00:00.000Z' }),
  ];
  const PAUTA_COM_ARTE = () => [
    ...PAUTA(),
    linha('recC2', 'Novela Sol 27/11 NAH', 'Ana Manhã', '2026-11-26', ['06:00', '15:00']),
    linha('recC3', 'Quem Ama 28/11 Rede', 'Carla Noite', '2026-11-27', ['22:00', '06:00']),
    linha('recC4', 'Festa do Bairro(Prologo)26/11 (H)', 'Beto Tarde', '2026-11-26', ['14:00', '22:53']),
  ];
  type Producao = { praca: string; etapa: string; artes: number | null; designers: string[]; alta: boolean };
  type LinhaComArte = Linha & { chave?: string; producoes?: Producao[] };

  async function semanaComArte(caminho = '/api/pauta/semana?inicio=2026-11-23') {
    const teable = teableFalso({ ...NOMES, ...NOMES_COM_ARTE }, { registros: { EDICAO_producao: PAUTA_COM_ARTE(), ARTE_producao: PRODUCAO() } });
    const app = criarApp({ db: abrirBanco(':memory:'), env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg });
    await app.tabelasProntas;
    const servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    parar = async () => {
      await app.fechar();
      await new Promise<void>((ok) => servidor.close(() => ok()));
    };
    const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    // a carga das Produções (a da subida pode já ter rodado: rodar de novo atualiza, não duplica)
    const carga = await fetch(`${base}/api/producoes/recarregar`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': 'chefe@empresa.com' } });
    expect(carga.status).toBe(200);
    const antes = teable.estado.consultas.length;
    const r = await fetch(`${base}${caminho}`, { headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com' } });
    const s = (await semana(r)) as unknown as { linhas: LinhaComArte[] };
    // a Semana só lê a pauta: a produção da arte não é lida de novo do Teable
    expect(teable.estado.consultas.slice(antes).every((sql: string) => sql.includes('pauta_pg'))).toBe(true);
    return (id: string) => s.linhas.find((l) => l.id === id)!;
  }

  it('pela chave exata: a etapa, as artes sem repetir, os designers, a praça e a prioridade ALTA', async () => {
    const por = await semanaComArte();
    expect(por('recP3').producoes).toEqual([expect.objectContaining({ praca: 'G5', etapa: 'entregue', artes: 2, designers: ['Designer Um'], alta: true })]);
  });

  it('sem a versão no fim, quando a exata não acha', async () => {
    const por = await semanaComArte();
    expect(por('recC2').producoes).toEqual([expect.objectContaining({ praca: 'G5', etapa: 'produzindo', artes: 1, designers: ['Designer Dois'], alta: false })]);
  });

  it('sem a praça, quando nem a exata nem a sem versão acham: a produção de cada praça', async () => {
    const por = await semanaComArte();
    const producoes = por('recC3').producoes!;
    expect(producoes.map((p) => p.praca).sort()).toEqual(['G5', 'SP']);
    expect(producoes.find((p) => p.praca === 'SP')).toMatchObject({ etapa: 'entrada', artes: 2, designers: [] });
    expect(producoes.find((p) => p.praca === 'G5')).toMatchObject({ etapa: 'produzindo', designers: ['Designer Um', 'Designer Dois'] });
  });

  it('a claquete sem produção e a tarefa ficam de fora (#199); o aviso não cruza', async () => {
    const por = await semanaComArte();
    expect(por('recP8')).toBeUndefined();
    expect(por('recP2')).toBeUndefined();
    expect(por('recP6').producoes).toBeUndefined();
  });

  it('as linhas da mesma atração com versões diferentes têm a mesma chave (a ficha junta)', async () => {
    const por = await semanaComArte();
    expect(por('recP1').chave).toBeTruthy();
    expect(por('recC4').chave).toBe(por('recP1').chave);
    expect(por('recC3').chave).not.toBe(por('recP1').chave);
  });

  it('o Dia também traz a claquete com a produção da arte (#97)', async () => {
    const por = await semanaComArte('/api/pauta/dia?dia=2026-11-24');
    expect(por('recP3').producoes).toEqual([expect.objectContaining({ praca: 'G5', etapa: 'entregue', artes: 2, alta: true })]);
    // a COMUNICAÇÃO (tarefa) fica de fora (#199)
    expect(por('recP2')).toBeUndefined();
  });
});

describe('a escolha da visão e do arranjo, lembrada por pessoa (#98)', () => {
  const PREFERENCIAS = '/api/eu/preferencias';
  type Servidor = Awaited<ReturnType<typeof comServidor>>;
  /** As preferências da pessoa, pela rota de quem está logado. */
  const lembradas = async (email: string, s: Servidor) => {
    const r = await fetch(`${s.base}/api/eu`, { headers: { 'cf-access-authenticated-user-email': email } });
    return (await r.json()).preferencias as Record<string, unknown>;
  };
  const lembrar = (s: Servidor, email: string, corpo: unknown) =>
    fetch(`${s.base}${PREFERENCIAS}`, { method: 'PUT', headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

  it('grava e lê a visão e o arranjo de cada visão; vale de novo com o servidor reiniciado, e a outra pessoa não é afetada', async () => {
    const db = abrirBanco(':memory:');
    let s = await comServidor({ db });
    expect(await lembradas('ana@empresa.com', s)).toEqual({});
    const r = await lembrar(s, 'ana@empresa.com', { 'pauta.visao': 'dia', 'pauta.arranjo.semana': 'dia-por-coluna', 'pauta.arranjo.dia': 'por-hora' });
    expect(r.status).toBe(200);
    expect((await r.json()).preferencias).toEqual({ 'pauta.visao': 'dia', 'pauta.arranjo.semana': 'dia-por-coluna', 'pauta.arranjo.dia': 'por-hora' });
    // uma chave por vez troca só aquela
    expect((await lembrar(s, 'ana@empresa.com', { 'pauta.visao': 'semana' })).status).toBe(200);
    // a outra pessoa continua sem escolha (o padrão: Semana editor × dia e Dia empilhado)
    expect(await lembradas('chefe@empresa.com', s)).toEqual({});
    expect((await lembrar(s, 'chefe@empresa.com', { 'pauta.arranjo.semana': 'editor-dia' })).status).toBe(200);
    // com o servidor de novo, no mesmo SQLite: em qualquer aparelho
    await parar?.();
    s = await comServidor({ db });
    expect(await lembradas('ana@empresa.com', s)).toEqual({ 'pauta.visao': 'semana', 'pauta.arranjo.semana': 'dia-por-coluna', 'pauta.arranjo.dia': 'por-hora' });
    expect(await lembradas('chefe@empresa.com', s)).toEqual({ 'pauta.arranjo.semana': 'editor-dia' });
  });

  it('recusa a visão ou o arranjo desconhecido, e o arranjo de uma visão no lugar da outra', async () => {
    const s = await comServidor();
    const recusa = async (corpo: unknown, erro: string) => {
      const r = await lembrar(s, 'ana@empresa.com', corpo);
      expect(r.status).toBe(400);
      expect((await r.json()).erro).toBe(erro);
    };
    await recusa({ 'pauta.visao': 'mes' }, 'Visão da pauta desconhecida: escolha Semana ou Dia.');
    await recusa({ 'pauta.arranjo.semana': 'por-hora' }, 'Arranjo da Semana desconhecido: escolha editor × dia ou um dia por coluna.');
    await recusa({ 'pauta.arranjo.dia': 'dia-por-coluna' }, 'Arranjo do Dia desconhecido: escolha empilhado ou por hora.');
    await recusa({ 'pauta.arranjo.mes': 'empilhado' }, 'Preferência desconhecida: pauta.arranjo.mes.');
    // uma ruim recusa o pedido inteiro
    await recusa({ 'pauta.visao': 'dia', 'pauta.arranjo.dia': null }, 'Arranjo do Dia desconhecido: escolha empilhado ou por hora.');
    expect(await lembradas('ana@empresa.com', s)).toEqual({});
  });
});

/* Os filtros pessoais, o resumo do administrador e a cópia de reserva (#99). "Só as minhas": o editor ligado ao e-mail
   da pessoa (o cadastro de editores do Teable de mentira, com o e-mail). "Com arte minha": as claquetes em que o
   designer da pessoa (a tabela designers, pelo e-mail) está na produção da arte. O resumo (linhas sem editor, claquetes
   sem card e a hora da última alteração) só vem para administradores. Com o Postgres do Teable fora do ar, a Semana e
   o Dia saem da última cópia local da pauta, com a hora dela. Nomes e e-mails fictícios. */
describe('os filtros, o resumo do administrador e a cópia de reserva (#99)', () => {
  type Voce = { editor: string | null; designer: string | null };
  type Resumo = { semEditor: number; semCard: number; alteradoEm: string | null };
  type Lida = Semana & { filtro: string | null; voce: Voce; resumo?: Resumo; origem: string; copiaEm: string | null };
  const lida = async (r: Response) => (await semana(r)) as Lida;
  const ids = (s: { linhas: { id: string }[] }) => s.linhas.map((l) => l.id).sort();

  const NOMES_COMPLETOS = { ...NOMES, editores: 'editores_pg', KEY_editores: 'key_editores_pg', ARTE_producao: 'arte_producao_pg', designers: 'designers_pg' };
  const arte = (id: string, fields: Campos) => ({ id, fields: { card_ID: '', status: '[]', designers: null, arquivado: false, entregue: false, praca: null, filme: null, ...fields } });
  const REGISTROS = () => ({
    EDICAO_producao: [...PAUTA(), linha('recC3', 'Quem Ama 28/11 Rede', 'Carla Noite', '2026-11-27', ['22:00', '06:00'])],
    // a Carla tem o e-mail no cadastro de editores; o Beto, não
    editores: [
      { id: 'recE1', fields: { editor: 'Carla Noite', email: 'carla@empresa.com' } },
      { id: 'recE2', fields: { editor: 'Beto Tarde' } },
    ],
    KEY_editores: [],
    // a Dani é a "Designer Um" da tabela designers
    designers: [{ id: 'recD1', fields: { designer: 'Designer Um', email: 'dani@empresa.com', status: 'ativo' } }],
    ARTE_producao: [
      arte('recA1', { claquete: 'Show da Tarde 25/11', status: '["FINALIZADO"]', entregue: true, designers: '["Designer Um"]', artes: 'HOJE', data_entrada: '2026-11-20T12:00:00.000Z' }),
      arte('recA2', { claquete: 'Novela Sol 24/11-2', status: '["PRODUZINDO"]', designers: '["Designer Dois"]', artes: 'HOJE', data_entrada: '2026-11-20T12:00:00.000Z' }),
      arte('recA3', { claquete: 'Quem Ama 28/11 SP', status: '["PRODUZINDO"]', designers: '["designer um"]', artes: 'HOJE', data_entrada: '2026-11-23T12:00:00.000Z' }),
    ],
  });

  async function completo(db: unknown = abrirBanco(':memory:')) {
    const teable = teableFalso(NOMES_COMPLETOS, { registros: REGISTROS() });
    // os Cadastros leem o mesmo Teable de mentira (a tabela de editores, com o e-mail)
    const cadastros = criarCadastros({ ...ENV, TEABLE_EDITORES: 'tblFalso_bseFalso_editores', TEABLE_KEY_EDITORES: 'tblFalso_bseFalso_KEY_editores' }, { buscar: teable });
    const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros });
    await app.tabelasProntas;
    const servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    parar = async () => {
      await app.fechar();
      await new Promise<void>((ok) => servidor.close(() => ok()));
    };
    const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    const carga = await fetch(`${base}/api/producoes/recarregar`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': 'chefe@empresa.com' } });
    expect(carga.status).toBe(200);
    // a verificação das pessoas (a tabela designers, com o e-mail), a mesma das Produções
    await app.pessoasProntas;
    // as outras claquetes da semana com Produção; a Esporte Total 29/11 continua sem (fica de fora, #199)
    porProducoes(db, ['Festa do Bairro(Prologo)26/11', 'Show da Tarde 26/11', 'Show da Tarde 28/11', 'Show da Tarde 29/11'], { perto: '2026-11-24' });
    const como = (email: string) => (caminho: string) => fetch(base + caminho, { headers: { 'cf-access-authenticated-user-email': email } });
    return { teable, carla: como('carla@empresa.com'), dani: como('dani@empresa.com'), ana: como('ana@empresa.com'), chefe: como('chefe@empresa.com') };
  }

  it('"Só as minhas": só as linhas do editor ligado ao e-mail da pessoa, na Semana e no Dia', async () => {
    const { carla } = await completo();
    const todas = await lida(await carla('/api/pauta/semana?inicio=2026-11-23'));
    expect(todas).toMatchObject({ filtro: null, voce: { editor: 'Carla Noite', designer: null } });
    // as 11 menos as duas tarefas e a Esporte Total, sem Produção (#199)
    expect(todas.linhas.length).toBe(8);
    const minhas = await lida(await carla('/api/pauta/semana?inicio=2026-11-23&filtro=minhas'));
    expect(minhas.filtro).toBe('minhas');
    expect(ids(minhas)).toEqual(['recC3', 'recP1']);
    expect(minhas.editores).toEqual(['Carla Noite']);
    const dia = (await lida(await carla('/api/pauta/dia?dia=2026-11-24&filtro=minhas'))) as unknown as Lida & { dia: string };
    expect(ids(dia)).toEqual(['recP1']);
    expect(dia.editores).toEqual(['Carla Noite']);
  });

  it('"Com arte minha": só as claquetes em que o designer da pessoa está na produção da arte', async () => {
    const { dani } = await completo();
    const s = await lida(await dani('/api/pauta/semana?inicio=2026-11-23&filtro=arte'));
    expect(s.voce).toEqual({ editor: null, designer: 'Designer Um' });
    // o Show da Tarde 25/11 pela chave exata e o Quem Ama pela chave sem a praça (o nome sem caixa); a Novela Sol é de outro
    expect(ids(s)).toEqual(['recC3', 'recP3']);
    expect(s.linhas.every((l) => l.tipo === 'claquete')).toBe(true);
    expect(s.editores).toEqual(['Beto Tarde', 'Carla Noite']);
  });

  it('sem a ligação, o filtro não acha nada; um filtro desconhecido vale como sem filtro', async () => {
    const { ana } = await completo();
    const s = await lida(await ana('/api/pauta/semana?inicio=2026-11-23&filtro=minhas'));
    expect(s).toMatchObject({ filtro: 'minhas', voce: { editor: null, designer: null }, linhas: [], editores: [] });
    expect((await lida(await ana('/api/pauta/semana?inicio=2026-11-23&filtro=arte'))).linhas).toEqual([]);
    const outro = await lida(await ana('/api/pauta/semana?inicio=2026-11-23&filtro=tudo'));
    expect(outro.filtro).toBeNull();
    expect(outro.linhas.length).toBe(8);
  });

  it('o resumo só vem para o administrador: linhas sem editor, claquetes sem card e a última alteração, da pauta inteira', async () => {
    const { ana, chefe } = await completo();
    const doChefe = await lida(await chefe('/api/pauta/semana?inicio=2026-11-23'));
    // da pauta inteira, também do que ficou de fora da tela (#199): sem editor, a CALHAUS; sem card, a Esporte Total
    expect(doChefe.resumo).toEqual({ semEditor: 1, semCard: 1, alteradoEm: '2026-11-26T15:30:00.000Z' });
    // com um filtro, o resumo continua o da pauta inteira
    expect((await lida(await chefe('/api/pauta/semana?inicio=2026-11-23&filtro=minhas'))).resumo).toEqual(doChefe.resumo);
    expect((await lida(await chefe('/api/pauta/dia?dia=2026-11-26'))).resumo).toEqual({ semEditor: 1, semCard: 0, alteradoEm: '2026-11-26T15:30:00.000Z' });
    expect('resumo' in (await lida(await ana('/api/pauta/semana?inicio=2026-11-23')))).toBe(false);
    expect('resumo' in (await lida(await ana('/api/pauta/dia?dia=2026-11-26')))).toBe(false);
  });

  it('com o Postgres fora do ar, a Semana e o Dia saem da última cópia local da pauta, com a hora dela', async () => {
    const { ana, teable } = await completo();
    const doBanco = await lida(await ana('/api/pauta/semana?inicio=2026-11-23'));
    expect(doBanco).toMatchObject({ origem: 'banco', copiaEm: null });
    teable.estado.fora = true;
    const daCopia = await lida(await ana('/api/pauta/semana?inicio=2026-11-23'));
    expect(daCopia.origem).toBe('copia');
    expect(Date.parse(daCopia.copiaEm!)).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - Date.parse(daCopia.copiaEm!)).toBeLessThan(60_000);
    // a mesma pauta: as linhas, os editores, a produção da arte e a última alteração
    expect(daCopia.linhas).toEqual(doBanco.linhas);
    expect(daCopia.editores).toEqual(doBanco.editores);
    expect(daCopia.alteradoEm).toBe(doBanco.alteradoEm);
    // o Dia de um dia já copiado também; com o filtro, igual
    const dia = (await lida(await ana('/api/pauta/dia?dia=2026-11-24'))) as unknown as Lida;
    expect(dia).toMatchObject({ origem: 'copia', copiaEm: daCopia.copiaEm });
    expect(ids(dia)).toEqual(['recP1', 'recP3']);
    // uma semana que nunca foi copiada: a página fica sabendo que o banco não respondeu
    const nunca = await ana('/api/pauta/semana?inicio=2027-03-01');
    expect(nunca.status).toBe(503);
    expect(((await nunca.json()) as { erro: string }).erro).toMatch(/não respondeu/);
  });
});
