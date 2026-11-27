// @vitest-environment node
/* Montar a pauta: o Distribuir (#151), pela API. A coordenação aperta Distribuir e a lista "Para distribuir" inteira vai
   para os editores escalados do rascunho, numa gravação só: pela continuidade (quem pegou a atração nos 14 dias antes,
   na pauta do Teable e na publicada no PROMeiro), pela carga e, no empate, pelo sorteio. Quem está fora nunca recebe.
   Desfazer devolve tudo para a lista, com de quem era. Nada é publicado nem vai ao Teable. Nomes, e-mails e claquetes
   fictícios; 27/11/2026 é uma sexta. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

const SEXTA = '2026-11-27';
const QUINTA = '2026-11-26';
const CHEFE = 'chefe@empresa.com';
const BIA = 'bia.coord@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const ENV_CADASTROS = { ...ENV, TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };
const CADASTROS: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
  tblRed: [],
  tblKeyRed: [],
  tblEdi: ['Rui Teixeira', 'Elis Furtado', 'Gil Moura', 'Ana Prado'].map((editor, i) => ({ id: `recE${i}`, fields: { editor } })),
  tblKeyEdi: [],
};
const escritas: string[] = [];
async function buscarOsCadastros(url: string, init: RequestInit = {}) {
  const metodo = init.method ?? 'GET';
  if (metodo !== 'GET') {
    escritas.push(`${metodo} ${url}`);
    throw new Error(`distribuir não escreve no Teable: ${metodo} ${url}`);
  }
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: CADASTROS[tabela] }), text: async () => '' };
}

/** Uma linha da pauta do Teable (EDICAO_producao), no fuso de São Paulo. */
function linha(id: string, dia: string, claquete: string, quem: string) {
  const sp = (h: string) => new Date(`${dia}T${h}:00-03:00`).toISOString();
  return { id, fields: { claquete, key: claquete.toUpperCase(), editor: { id: `rec${quem.replace(/\W/g, '')}`, title: quem }, data: sp('00:00'), expediente_inicio: sp('14:00'), expediente_fim: sp('23:00'), anotacao: null, alterado_em: '2026-11-26T12:00:00.000Z' } };
}
const PAUTA_DO_TEABLE = [
  linha('recT1', '2026-11-25', 'Mundo Animal 26/11 (P)', 'Elis Furtado'),
  linha('recT2', '2026-11-24', 'A Cozinha Mágica 25/11 (C)', 'Ana Prado'),
  // 15 dias antes: não conta
  linha('recT3', '2026-11-12', 'Sala de Estar 13/11 (A)', 'Gil Moura'),
];

const posicao = (id: string, editor: string, demandas: string[] = []) => ({ id, turno: 'tarde', editor, horario: '14h às 23h', demandas: demandas.map((texto, i) => ({ id: `${id}-d${i}`, texto })), avisos: [] });
const RASCUNHO = [posicao('pos-1', 'Rui Teixeira', ['COMUNICAÇÃO', 'CALHAUS']), posicao('pos-2', 'Elis Furtado'), posicao('pos-3', 'Gil Moura', ['COMUNICAÇÃO']), posicao('pos-4', 'Ana Prado'), posicao('pos-5', '')];
const LISTA = ['Mundo Animal 30/11 (P)', 'Terra Viva 28/11 (A)', 'Cozinha Mágica 28/11 (P)'];

type Posicao = { id: string; editor: string; demandas: { id: string; texto: string }[] };
type Distribuida = { id: string; texto: string; deQuem: string; posicao: string; editor: string; motivo: string };
type Dia = { estado: string; versao: number; posicoes: Posicao[]; paraDistribuir: { id: string; texto: string; deQuem: string }[]; distribuidas?: Distribuida[] };

describe('montar a pauta: o Distribuir (#151)', () => {
  let servidor: Server;
  let base = '';
  let app: { fechar: () => Promise<void>; tabelasProntas: Promise<void> };
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const bia = como(BIA);
  const lia = como('lia.edicao@empresa.com');
  const acao = (nome: string, corpo: unknown = {}, dia = SEXTA, quem = bia) => quem(`/api/montar-pauta/${nome}?dia=${dia}`, { method: 'POST', body: JSON.stringify(corpo) });
  const ler = async (dia = SEXTA): Promise<Dia> => (await bia(`/api/montar-pauta?dia=${dia}`)).json();
  const resumo = (d: Dia) => d.posicoes.map((p) => `${p.editor || '(vaga)'}: ${p.demandas.map((x) => x.texto).join(' | ')}`);

  beforeAll(async () => {
    const teable = teableFalso({ EDICAO_producao: 'pauta_pg' }, { registros: { EDICAO_producao: PAUTA_DO_TEABLE } });
    app = criarApp({ db: abrirBanco(':memory:'), env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: criarCadastros(ENV_CADASTROS, { buscar: buscarOsCadastros }) });
    await app.tabelasProntas;
    servidor = createServer(app as never);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    await como(CHEFE)('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: BIA }) });
    // a quinta publicada no PROMeiro: o Gil pegou Terra Viva (o Teable ainda não tem)
    await bia(`/api/montar-pauta?dia=${QUINTA}`, { method: 'PUT', body: JSON.stringify({ posicoes: [posicao('q-1', 'Gil Moura', ['Terra Viva 27/11 (A)'])] }) });
    expect((await acao('publicar', {}, QUINTA)).status).toBe(200);
    expect((await bia(`/api/montar-pauta?dia=${SEXTA}`, { method: 'PUT', body: JSON.stringify({ posicoes: RASCUNHO }) })).status).toBe(200);
    // a Ana está fora no dia (marcar a ausência a tira da posição, que fica vaga): não recebe a Cozinha Mágica, que pegou
    expect((await bia(`/api/montar-pauta/ausencias?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ editor: 'Ana Prado', tipo: 'folga', de: SEXTA, ate: SEXTA }) })).status).toBe(200);
  });
  afterAll(async () => {
    await app.fechar();
    servidor.close();
  });

  it('sem nada em "Para distribuir", recusa', async () => {
    const r = await acao('distribuir');
    expect(r.status).toBe(400);
    expect((await r.json()).erro).toMatch(/Para distribuir/);
  });

  it('distribui a lista inteira numa gravação só, pela continuidade (Teable e publicada) e pela carga; quem está fora não recebe', async () => {
    expect((await acao('para-distribuir', { texto: LISTA.join('\n') })).status).toBe(200);
    const antes = await ler();
    const r = await acao('distribuir');
    expect(r.status).toBe(200);
    const d: Dia = await r.json();
    expect(d.distribuidas?.map((x) => `${x.texto} → ${x.editor} (${x.motivo})`)).toEqual([
      'Mundo Animal 30/11 (P) → Elis Furtado (pegou a atração em 25/11)',
      'Terra Viva 28/11 (A) → Gil Moura (pegou a atração em 26/11)',
      'Cozinha Mágica 28/11 (P) → Elis Furtado (menos demandas)',
    ]);
    expect(d.paraDistribuir).toEqual([]);
    expect(resumo(d)).toEqual(['Rui Teixeira: COMUNICAÇÃO | CALHAUS', 'Elis Furtado: Mundo Animal 30/11 (P) | Cozinha Mágica 28/11 (P)', 'Gil Moura: COMUNICAÇÃO | Terra Viva 28/11 (A)', '(vaga): ', '(vaga): ']);
    // uma mudança só do rascunho (#131): a versão sobe uma vez; nada publicado, nada no Teable
    expect(d.versao).toBe(antes.versao + 1);
    expect(d.estado).toBe('rascunho');
    expect(escritas).toEqual([]);
  });

  it('desfazer devolve tudo para a lista de uma vez, mesmo a que já foi arrastada para outra posição', async () => {
    const d = await ler();
    const [mundo, terra, cozinha] = d.posicoes.flatMap((p) => p.demandas).filter((x) => LISTA.includes(x.texto)).sort((a, b) => LISTA.indexOf(a.texto) - LISTA.indexOf(b.texto));
    expect((await acao('mover', { demanda: cozinha.id, posicao: 'pos-1', antesDe: null })).status).toBe(200);
    const r = await acao('desfazer-distribuicao', { itens: [mundo, terra, cozinha].map((x) => ({ id: x.id, deQuem: x === terra ? 'Elis Furtado' : '' })) });
    expect(r.status).toBe(200);
    const depois: Dia = await r.json();
    expect(depois.paraDistribuir).toEqual([
      { id: mundo.id, texto: 'Mundo Animal 30/11 (P)', deQuem: '' },
      { id: terra.id, texto: 'Terra Viva 28/11 (A)', deQuem: 'Elis Furtado' },
      { id: cozinha.id, texto: 'Cozinha Mágica 28/11 (P)', deQuem: '' },
    ]);
    expect(resumo(depois)).toEqual(['Rui Teixeira: COMUNICAÇÃO | CALHAUS', 'Elis Furtado: ', 'Gil Moura: COMUNICAÇÃO', '(vaga): ', '(vaga): ']);
    // de novo, nenhuma está mais no dia
    expect((await acao('desfazer-distribuicao', { itens: [{ id: mundo.id, deQuem: '' }] })).status).toBe(400);
    expect((await acao('desfazer-distribuicao', { itens: 'tudo' })).status).toBe(400);
  });

  it('sem ninguém escalado para receber, recusa e a lista fica', async () => {
    await bia(`/api/montar-pauta?dia=2026-11-30`, { method: 'PUT', body: JSON.stringify({ posicoes: [posicao('s-1', '')] }) });
    await acao('para-distribuir', { texto: 'Terra Viva 1/12 (A)' }, '2026-11-30');
    const r = await acao('distribuir', {}, '2026-11-30');
    expect(r.status).toBe(400);
    expect((await r.json()).erro).toMatch(/Ninguém escalado/);
    expect((await ler('2026-11-30')).paraDistribuir).toHaveLength(1);
  });

  it('só a coordenação distribui', async () => {
    expect((await acao('distribuir', {}, SEXTA, lia)).status).toBe(403);
    expect((await acao('desfazer-distribuicao', { itens: [] }, SEXTA, lia)).status).toBe(403);
  });
});
