// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
import { porProducoes } from './fixtures/producoes-falsas';

/* A escala na Pauta da edição (o mock-up aprovado): a rota da Semana traz a ilha, o turno e quem divide a ilha de cada
   editor em cada dia, lidos da foto da planilha que o n8n manda (#133), e soma ao "Fora no dia" quem a planilha diz que
   está fora. Enquanto a montagem vem da planilha, é ela que diz; nada é gravado. Nomes e claquetes inventados; nada do
   Trello, e o Teable falso só é lido. */

const TOKEN = 'token-da-foto-de-teste';
const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', EDICAO_FOTO_TOKEN: TOKEN };
const NOMES = { EDICAO_producao: 'pauta_pg' };
const SEXTA = '2026-11-27';
const sp = (d: string, h: string) => new Date(`${d}T${h}:00-03:00`).toISOString();
const linha = (id: string, claquete: string, quem: string, dia: string) => ({
  id,
  fields: { claquete, key: claquete.toUpperCase(), editor: { id: `rec${quem.replace(/\W/g, '')}`, title: quem }, data: sp(dia, '00:00'), expediente_inicio: sp(dia, '06:00'), expediente_fim: sp(dia, '15:00'), anotacao: null, alterado_em: sp(dia, '08:00') },
});
const PAUTA = [linha('recA', 'Novela Sol 28/11', 'Rui Teixeira', SEXTA), linha('recB', 'Show da Tarde 27/11', 'Gil Moura', SEXTA), linha('recC', 'Terra 28/11 (AH)', 'Elis Furtado', SEXTA)];

/** A aba da sexta como a API do Google devolve: Rui e Gil na mesma sala (AVID 22 e ILHA 22) de manhã, a Elis na VDI
    5 à tarde e a Ivo Prates de folga. */
const GRADE_DA_SEXTA = [
  ['', 'SEXTA', '27/11/2026'],
  [],
  ['', '                                 MANHÃ'],
  [],
  ['', 'AVID 22', '', 'ILHA 22'],
  ['', 'EDITOR: ', 'Rui Teixeira', 'EDITOR: ', 'Gil Moura'],
  ['', 'HORÁRIO: ', '6 AS 15', 'HORÁRIO: ', '7 AS 16'],
  ['', 'Novela Sol 28/11', '', 'Show da Tarde 27/11'],
  [],
  ['', '                                 TARDE'],
  [],
  ['', 'VDI 5', '', 'AVID 30'],
  ['', 'EDITOR: ', 'Elis Furtado', 'EDITOR: ', 'Ivo Prates'],
  ['', 'HORÁRIO: ', '14 AS 23', 'HORÁRIO: ', 'FOLGA'],
  ['', 'Terra 28/11 (AH)'],
];
const pacote = { formato: 1, origem: { fluxo: 'teste', execucao: '1' }, lida_em: '2026-11-27T08:00:00-03:00', todas_as_abas: ['SEXTA'], abas: [{ aba: 'SEXTA', intervalo: null, sheetId: 1, data_da_aba: null, linhas: GRADE_DA_SEXTA, mesclas: [] }] };

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function comServidor({ comFoto = true } = {}) {
  const db = abrirBanco(':memory:');
  const teable = teableFalso(NOMES, { registros: { EDICAO_producao: PAUTA } });
  const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg });
  await app.tabelasProntas;
  porProducoes(db, ['Novela Sol 28/11', 'Show da Tarde 27/11', 'Terra 28/11'], { perto: SEXTA });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como('chefe@empresa.com');
  for (const ilha of [
    { tipo: 'AVID', numero: '22' },
    { tipo: 'VDI', numero: '5' },
    { tipo: 'AVID', numero: '30' },
  ])
    expect((await chefe('/api/cadastros/ilhas', { method: 'POST', body: JSON.stringify(ilha) })).status).toBe(201);
  if (comFoto) expect((await fetch(`${base}/api/publico/edicao/foto`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(pacote) })).status).toBe(200);
  return { ana: como('ana@empresa.com'), teable };
}

type Escala = { dia: string; editor: string; ilha: string; turno: string; horario: string; divide: { editor: string; horario: string }[] };

describe('a escala na Pauta, pela planilha', () => {
  it('traz a ilha, o turno e o horário de cada editor no dia, e quem divide a ilha no mesmo turno', async () => {
    const { ana } = await comServidor();
    const s = await (await ana(`/api/pauta/semana?inicio=${SEXTA}`)).json();
    const de = (nome: string) => (s.escala as Escala[]).find((e) => e.editor === nome);
    expect(de('Rui Teixeira')).toMatchObject({ dia: SEXTA, ilha: 'AVID 22', turno: 'Manhã', divide: [{ editor: 'Gil Moura', horario: expect.stringMatching(/^7h às 16h/) }] });
    expect(de('Gil Moura')).toMatchObject({ ilha: 'AVID 22', divide: [{ editor: 'Rui Teixeira' }] });
    expect(de('Elis Furtado')).toMatchObject({ ilha: 'VDI 5', turno: 'Tarde', divide: [] });
  });

  it('quem a planilha diz que está fora entra no "Fora no dia", sem o motivo', async () => {
    const { ana } = await comServidor();
    const s = await (await ana(`/api/pauta/semana?inicio=${SEXTA}`)).json();
    expect(s.fora).toEqual([{ dia: SEXTA, editor: 'Ivo Prates' }]);
  });

  it('sem a foto da planilha, a Pauta sai igual, sem a escala; nada é gravado no Teable', async () => {
    const { ana, teable } = await comServidor({ comFoto: false });
    const s = await (await ana(`/api/pauta/semana?inicio=${SEXTA}`)).json();
    expect(s.escala).toEqual([]);
    expect(s.linhas.map((l: { id: string }) => l.id).sort()).toEqual(['recA', 'recB', 'recC']);
    expect(teable.estado.pedidos.filter((p: string) => !p.startsWith('GET'))).toEqual([]);
  });
});
