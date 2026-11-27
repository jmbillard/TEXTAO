// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* A Semana da pauta da edição (#94) pela API: a tabela EDICAO_producao do Teable de mentira (achada pelo nome, o
   Postgres respondendo as linhas inteiras, sem olhar o WHERE), lida só para a semana pedida. Cada linha vem
   classificada (claquete, tarefa ou aviso), com o turno no fuso de São Paulo e o dia da pauta. Nada do Trello: o
   ambiente nem tem o Trello. Nomes e claquetes fictícios. */

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

async function comServidor({ env = ENV, registros = { EDICAO_producao: PAUTA() } }: { env?: Record<string, string>; registros?: Record<string, unknown[]> } = {}) {
  const teable = teableFalso(NOMES, { registros });
  const app = criarApp({ db: abrirBanco(':memory:'), env, buscarNoTeable: teable, abrirPg: teable.abrirPg });
  await app.tabelasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string) => fetch(base + caminho, { headers: email ? { 'cf-access-authenticated-user-email': email } : {} });
  return { teable, ana: como('ana@empresa.com'), chefe: como('chefe@empresa.com'), ninguem: como('') };
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
    expect(s.linhas.map((l) => l.id).sort()).toEqual(['recP1', 'recP10', 'recP2', 'recP3', 'recP4', 'recP5', 'recP6', 'recP7', 'recP8', 'recP9']);
    expect(s.linhas.map((l) => l.dia)).toEqual([...s.linhas.map((l) => l.dia)].sort());
    // a consulta é do Postgres do Teable, só leitura, pela tabela achada pelo nome, com o período nos parâmetros
    const i = teable.estado.consultas.findIndex((sql: string) => sql.includes('"bseFalso"."pauta_pg"') && sql.includes('expediente_inicio'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(teable.estado.consultas[i]).toMatch(/^\s*SELECT/);
    expect(teable.estado.parametros[i]).toEqual(['2026-11-23T03:00:00.000Z', '2026-11-30T03:00:00.000Z']);
    // a hora da última alteração da pauta
    expect(s.alteradoEm).toBe('2026-11-26T15:30:00.000Z');
  });

  it('cada linha vem classificada: claquete, tarefa ou aviso (a caixinha de anotação marcada)', async () => {
    const { ana } = await comServidor();
    const s = await semana(await ana('/api/pauta/semana?inicio=2026-11-23'));
    const por = (id: string) => s.linhas.find((l) => l.id === id)!;
    expect(por('recP1')).toMatchObject({ tipo: 'claquete', texto: 'Festa do Bairro(Prologo)26/11 (AH)' });
    expect(por('recP5')).toMatchObject({ tipo: 'claquete', texto: 'Novela Sol 24/11-2' });
    expect(por('recP2')).toMatchObject({ tipo: 'tarefa', texto: 'COMUNICAÇÃO' });
    expect(por('recP7')).toMatchObject({ tipo: 'tarefa', texto: 'CALHAUS' });
    expect(por('recP6')).toMatchObject({ tipo: 'aviso', texto: 'REDATOR VEM ACOMPANHAR' });
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
    const { ana } = await comServidor();
    const s = await semana(await ana('/api/pauta/semana?inicio=2026-11-23'));
    expect(s.editores).toEqual(['Ana Manhã', 'Beto Tarde', 'Carla Noite', '']);
    expect(s.linhas.find((l) => l.id === 'recP7')).toMatchObject({ editor: '', turno: { inicio: '08:00', fim: '17:00' } });
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
    // sem data na claquete (é uma tarefa), o mês da linha
    expect(por('recV3')).toMatchObject({ tipo: 'tarefa', semVersao: 'Especial de Verão', versoes: [{ codigo: 'MES', rotulo: 'em novembro', conhecida: true }] });
    // o desconhecido vem cru na claquete; a tarefa e o aviso não ganham versão desconhecida nem versão nenhuma
    expect(por('recV4')).toMatchObject({ semVersao: 'Show da Tarde 28/11', versoes: [{ codigo: 'XYZ', rotulo: 'XYZ', conhecida: false }] });
    expect(por('recV5')).toMatchObject({ tipo: 'tarefa', semVersao: 'CALHAUS (VER LISTA)', versoes: [] });
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
  ];
  const PAUTA_COM_ARTE = () => [
    ...PAUTA(),
    linha('recC2', 'Novela Sol 27/11 NAH', 'Ana Manhã', '2026-11-26', ['06:00', '15:00']),
    linha('recC3', 'Quem Ama 28/11 Rede', 'Carla Noite', '2026-11-27', ['22:00', '06:00']),
    linha('recC4', 'Festa do Bairro(Prologo)26/11 (H)', 'Beto Tarde', '2026-11-26', ['14:00', '22:53']),
  ];
  type Producao = { praca: string; etapa: string; artes: number | null; designers: string[]; alta: boolean };
  type LinhaComArte = Linha & { chave?: string; producoes?: Producao[] };

  async function semanaComArte() {
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
    const r = await fetch(`${base}/api/pauta/semana?inicio=2026-11-23`, { headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com' } });
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

  it('a claquete sem produção vem sem card; a tarefa e o aviso não cruzam', async () => {
    const por = await semanaComArte();
    expect(por('recP8').producoes).toEqual([]);
    expect(por('recP2').producoes).toBeUndefined();
    expect(por('recP6').producoes).toBeUndefined();
  });

  it('as linhas da mesma atração com versões diferentes têm a mesma chave (a ficha junta)', async () => {
    const por = await semanaComArte();
    expect(por('recP1').chave).toBeTruthy();
    expect(por('recC4').chave).toBe(por('recP1').chave);
    expect(por('recC3').chave).not.toBe(por('recP1').chave);
  });
});
