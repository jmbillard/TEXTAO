// @vitest-environment node
/* Montar a pauta escolhendo claquetes (#199, ADR 0008), pela API: a coordenação vê as claquetes das Produções perto do
   dia (sem as arquivadas, sem as que já estão no dia, as praças juntas, dizendo as que têm card no Trello) e o que o
   Teable tem no dia e não casa com uma Produção ("de fora": as tarefas e as claquetes sem Produção, com as infos
   delas). Escolher põe a claquete em "Para distribuir" ou direto numa posição, e recusa a que não casa: não há linha
   livre. O colar da planilha pergunta quais casam. Quem não é da coordenação não vê nada. Nomes, e-mails e claquetes
   fictícios; 27/11/2026 é uma sexta. */
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
const CHEFE = 'chefe@empresa.com';
const BIA = 'bia.coord@empresa.com';
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
  if ((init.method ?? 'GET') !== 'GET') throw new Error(`montar a pauta não escreve no Teable: ${init.method} ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: CADASTROS[tabela] }), text: async () => '' };
}
function linha(id: string, claquete: string, quem: string, dia: string) {
  const sp = (h: string) => new Date(`${dia}T${h}:00-03:00`).toISOString();
  return { id, fields: { claquete, key: claquete.toUpperCase(), editor: { id: `rec${quem.replace(/\W/g, '')}`, title: quem }, data: sp('00:00'), expediente_inicio: sp('06:00'), expediente_fim: sp('15:00'), anotacao: null, alterado_em: '2026-11-26T12:00:00.000Z' } };
}
// o que o n8n gravou na sexta: uma claquete que casa, uma sem Produção (com a info dela), uma tarefa e a info da posição
const PAUTA_DO_TEABLE = [
  linha('recT1', 'Noite de Gala 27/11 Dp', 'Rui Teixeira', SEXTA),
  linha('recT2', 'Vale a Pena Rever 30/11', 'Rui Teixeira', SEXTA),
  linha('recT3', 'TRANSFORMAR DA A B', 'Rui Teixeira', SEXTA),
  linha('recT4', 'COMUNICAÇÃO', 'Elis Furtado', SEXTA),
];

type Escolha = { claquete: string; chave: string; pracas: string[]; etapa: string; noTrello: boolean; producoes: string[] };
type DeFora = { id: string; editor: string; tipo: string; texto: string; infos: string[] };
type Lista = { dia: string; claquetes: Escolha[]; deFora: DeFora[] | null; erroDeFora?: string };
type Dia = { posicoes: { id: string; demandas: { id: string; texto: string }[] }[]; paraDistribuir: { id: string; texto: string }[] };

describe('montar a pauta escolhendo claquetes (#199)', () => {
  let servidor: Server;
  let base = '';
  let teable: ReturnType<typeof teableFalso>;
  let app: { fechar: () => Promise<void>; tabelasProntas: Promise<void> };
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  const bia = como(BIA);
  const lia = como('lia.edicao@empresa.com');
  const lista = async (dia = SEXTA): Promise<Lista> => (await bia(`/api/montar-pauta/claquetes?dia=${dia}`)).json();
  const escolher = (corpo: unknown) => bia(`/api/montar-pauta/escolher?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify(corpo) });

  beforeAll(async () => {
    teable = teableFalso({ EDICAO_producao: 'pauta_pg' }, { registros: { EDICAO_producao: PAUTA_DO_TEABLE } });
    const db = abrirBanco(':memory:');
    app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: criarCadastros(ENV_CADASTROS, { buscar: buscarOsCadastros }) });
    await app.tabelasProntas;
    porProducoes(db, ['Noite de Gala 27/11', 'Corujão 28/11'], { perto: SEXTA });
    // a Mundo Animal em duas praças, uma com card no Trello; a Festa Velha arquivada; a do ano passado fora da janela
    porProducoes(db, ['Mundo Animal 30/11 SP'], { perto: '2026-11-26', praca: 'SP', card: 'card-falso-1' });
    porProducoes(db, ['Mundo Animal 30/11'], { perto: '2026-11-25', praca: 'G5' });
    porProducoes(db, ['Festa Velha 29/11'], { perto: SEXTA, etapa: 'arquivada' });
    porProducoes(db, ['Corujão 28/11'], { perto: '2025-11-27' });
    servidor = createServer(app as never);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: BIA }) });
    const rascunho = [{ id: 'pos-1', turno: 'manha', editor: 'Rui Teixeira', horario: '6h às 15h', demandas: [{ id: 'd-1', texto: 'Corujão 28/11 (A)' }] }];
    expect((await bia(`/api/montar-pauta?dia=${SEXTA}`, { method: 'PUT', body: JSON.stringify({ posicoes: rascunho }) })).status).toBe(200);
  });
  afterAll(async () => {
    await app.fechar();
    servidor.close();
  });

  it('as claquetes das Produções perto do dia: as praças juntas, sem as arquivadas, sem as que já estão no dia', async () => {
    const l = await lista();
    expect(l.dia).toBe(SEXTA);
    // a Corujão já está no rascunho; a Festa Velha está arquivada
    expect(l.claquetes.map((c) => c.claquete)).toEqual(['Noite de Gala 27/11', 'Mundo Animal 30/11 SP']);
    const mundo = l.claquetes[1];
    expect(mundo).toMatchObject({ pracas: ['G5', 'SP'], etapa: 'entrada', noTrello: true });
    expect(mundo.producoes).toHaveLength(2);
    expect(l.claquetes[0].noTrello).toBe(false);
  });

  it('"de fora": o que o Teable tem no dia e não casa (a tarefa e a claquete sem Produção, com a info dela)', async () => {
    const l = await lista();
    expect(l.deFora?.map((d) => [d.id, d.tipo, d.editor, d.texto, d.infos])).toEqual([
      ['recT2', 'claquete', 'Rui Teixeira', 'Vale a Pena Rever 30/11', ['TRANSFORMAR DA A B']],
      ['recT4', 'tarefa', 'Elis Furtado', 'COMUNICAÇÃO', []],
    ]);
  });

  it('com o Postgres fora do ar, as claquetes vêm e o "de fora" diz por quê', async () => {
    teable.estado.fora = true;
    try {
      const l = await lista('2027-02-10');
      expect(l.deFora).toBeNull();
      expect(l.erroDeFora).toMatch(/não respondeu|cópia/);
    } finally {
      teable.estado.fora = false;
    }
  });

  it('escolher põe a claquete em "Para distribuir" e a tira da lista', async () => {
    const r = await escolher({ claquete: 'Noite de Gala 27/11' });
    expect(r.status).toBe(200);
    const d: Dia = await r.json();
    expect(d.paraDistribuir.map((x) => x.texto)).toEqual(['Noite de Gala 27/11']);
    expect((await lista()).claquetes.map((c) => c.claquete)).toEqual(['Mundo Animal 30/11 SP']);
  });

  it('escolher com a posição põe direto nela (antes de uma demanda, ou no fim), com o id que a tela mostrou', async () => {
    const r = await escolher({ claquete: 'Mundo Animal 30/11 SP', posicao: 'pos-1', antesDe: 'd-1', id: 'd-da-tela' });
    expect(r.status).toBe(200);
    const d: Dia = await r.json();
    expect(d.posicoes[0].demandas.map((x) => [x.id, x.texto])).toEqual([
      ['d-da-tela', 'Mundo Animal 30/11 SP'],
      ['d-1', 'Corujão 28/11 (A)'],
    ]);
    expect((await lista()).claquetes).toEqual([]);
  });

  it('não há linha livre: a claquete que não casa e a tarefa são recusadas, e nada muda', async () => {
    const antes: Dia = await (await bia(`/api/montar-pauta?dia=${SEXTA}`)).json();
    for (const claquete of ['Vale a Pena Rever 30/11', 'COMUNICAÇÃO', 'Corujão de Sábado 5/12']) {
      const r = await escolher({ claquete });
      expect(r.status, claquete).toBe(422);
      expect(((await r.json()) as { erro: string }).erro).toMatch(/não casa/);
    }
    expect((await escolher({ claquete: '' })).status).toBe(400);
    expect((await escolher({ claquete: 'Corujão 28/11', posicao: 'pos-que-nao-existe' })).status).toBe(400);
    const depois: Dia = await (await bia(`/api/montar-pauta?dia=${SEXTA}`)).json();
    expect(depois.posicoes).toEqual(antes.posicoes);
    expect(depois.paraDistribuir).toEqual(antes.paraDistribuir);
  });

  it('o colar da planilha pergunta quais casam: a mesma chave da Pauta (sem a versão, sem a praça)', async () => {
    const r = await bia(`/api/montar-pauta/casam?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ textos: ['Noite de Gala 27/11 (DP)', 'Mundo Animal 30/11', 'Vale a Pena Rever 30/11', 'COMUNICAÇÃO', 'TRANSFORMAR DA A B'] }) });
    expect(r.status).toBe(200);
    expect((await r.json()).casam).toEqual([true, true, false, false, false]);
    expect((await bia(`/api/montar-pauta/casam?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ textos: 'x' }) })).status).toBe(400);
  });

  it('só a coordenação', async () => {
    expect((await lia(`/api/montar-pauta/claquetes?dia=${SEXTA}`)).status).toBe(403);
    expect((await lia(`/api/montar-pauta/casam?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ textos: [] }) })).status).toBe(403);
    expect((await lia(`/api/montar-pauta/escolher?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ claquete: 'Corujão 28/11' }) })).status).toBe(403);
    expect((await bia(`/api/montar-pauta/claquetes?dia=${SEXTA}`, { method: 'POST' })).status).toBe(405);
  });
});
