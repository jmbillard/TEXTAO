// @vitest-environment node
/* Montar a pauta, conferir e publicar (#127), pela API: o "está certo" que dispensa uma pendência, publicar (mesmo com
   pendências, contando as que ficaram), o estado do dia (publicado e alterado), o histórico das publicações e o
   Desfazer da última. O dia publicado aparece na Pauta da edição junto com a do Teable, sem dobrar e sem sumir com
   ela. Nada vai ao Teable: o Teable falso só responde a leitura (os cadastros e o Postgres da pauta). Nomes, e-mails e
   claquetes fictícios; 27/11/2026 é uma sexta. */
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
const CHEFE = 'chefe@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const ENV_CADASTROS = { ...ENV, TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };

/** Os cadastros de mentira: os editores da lista do montar. Só leitura. */
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
    throw new Error(`publicar não escreve no Teable: ${metodo} ${url}`);
  }
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: CADASTROS[tabela] }), text: async () => '' };
}

/** Uma linha da pauta do Teable (a tabela EDICAO_producao), no fuso de São Paulo. */
function linha(id: string, claquete: string, quem: string, dia: string, turno: [string, string]) {
  const sp = (d: string, h: string) => new Date(`${d}T${h}:00-03:00`).toISOString();
  const seguinte = new Date(Date.parse(`${dia}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return { id, fields: { claquete, key: claquete.toUpperCase(), editor: { id: `rec${quem.replace(/\W/g, '')}`, title: quem }, data: sp(dia, '00:00'), expediente_inicio: sp(dia, turno[0]), expediente_fim: sp(turno[1] < turno[0] ? seguinte : dia, turno[1]), anotacao: null, alterado_em: '2026-11-26T12:00:00.000Z' } };
}
const PAUTA_DO_TEABLE = [linha('recT1', 'Noite de Gala 27/11 Dp', 'Rui Teixeira', SEXTA, ['22:00', '06:00']), linha('recT2', 'Corujão 28/11', 'Gil Moura', SEXTA, ['06:00', '15:00'])];

const RASCUNHO = [
  { id: 'pos-1', turno: 'madrugada', editor: 'Rui Teixeira', horario: '22h às 6h', demandas: [{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }, { id: 'd-2', texto: 'Vale a Pena Rever 30/11 (P)' }] },
  { id: 'pos-2', turno: 'tarde', editor: 'Elis Furtado', horario: '14h às 22h53', demandas: [{ id: 'd-3', texto: 'Mundo Animal (AH)' }] },
  { id: 'pos-3', turno: 'noite', editor: '', horario: '20h às 2h', demandas: [] },
];

type Dia = { estado: string; publicacao: { em: string; por: string; pendencias: number } | null; historico: { em: string; por: string; pendencias: number; desfeitaEm: string | null }[]; dispensadas: string[]; semana: { dia: string; estado: string }[] };
type Linha = { id: string; dia: string; editor: string; texto: string; turno: { inicio: string; fim: string } | null };

describe('montar a pauta: conferir e publicar (#127)', () => {
  let servidor: Server;
  let base = '';
  let teable: ReturnType<typeof teableFalso>;
  let app: { fechar: () => Promise<void>; tabelasProntas: Promise<void> };
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  const bia = como('bia.coord@empresa.com');
  const lia = como('lia.edicao@empresa.com');
  const ler = async (dia = SEXTA): Promise<Dia> => (await bia(`/api/montar-pauta?dia=${dia}`)).json();
  const gravar = (posicoes: unknown, dia = SEXTA) => bia(`/api/montar-pauta?dia=${dia}`, { method: 'PUT', body: JSON.stringify({ posicoes }) });
  const publicar = (quem = bia, dia = SEXTA) => quem(`/api/montar-pauta/publicar?dia=${dia}`, { method: 'POST' });
  const desfazer = (quem = bia, dia = SEXTA) => quem(`/api/montar-pauta/desfazer?dia=${dia}`, { method: 'POST' });
  const conferida = (chave: string, certo: boolean, quem = bia) => quem(`/api/montar-pauta/conferida?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ chave, certo }) });
  const pautaDoDia = async (dia = SEXTA): Promise<{ linhas: Linha[]; editores: string[] }> => pautaNoDia(lia, dia);
  const textos = (ls: Linha[]) => ls.map((l) => `${l.editor || '—'}: ${l.texto}`);

  beforeAll(async () => {
    teable = teableFalso({ EDICAO_producao: 'pauta_pg' }, { registros: { EDICAO_producao: PAUTA_DO_TEABLE } });
    app = criarApp({ db: abrirBanco(':memory:'), env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: criarCadastros(ENV_CADASTROS, { buscar: buscarOsCadastros }) });
    await app.tabelasProntas;
    servidor = createServer(app as never);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) });
    expect((await gravar(RASCUNHO)).status).toBe(200);
  });
  afterAll(async () => {
    await app.fechar();
    servidor.close();
  });

  it('antes de publicar: o dia é rascunho, sem publicação nem histórico, e a Pauta é só a do Teable', async () => {
    const d = await ler();
    expect(d).toMatchObject({ estado: 'rascunho', publicacao: null, historico: [], dispensadas: [] });
    expect(textos((await pautaDoDia()).linhas)).toEqual(['Rui Teixeira: Noite de Gala 27/11 Dp', 'Gil Moura: Corujão 28/11']);
  });

  it('"está certo" dispensa uma pendência, e reabrir a traz de volta; só a coordenação', async () => {
    expect((await conferida('sem-editor:pos-3', true)).status).toBe(200);
    expect((await ler()).dispensadas).toEqual(['sem-editor:pos-3']);
    expect((await conferida('sem-editor:pos-3', false)).status).toBe(200);
    expect((await ler()).dispensadas).toEqual([]);
    expect((await conferida('', true)).status).toBe(400);
    expect((await conferida('sem-editor:pos-3', true, lia)).status).toBe(403);
    await conferida('sem-editor:pos-3', true);
  });

  it('publicar funciona com pendências e guarda quantas ficaram (as "para olhar" não dispensadas)', async () => {
    const r = await publicar();
    expect(r.status).toBe(200);
    const d: Dia = await r.json();
    // ficou a claquete sem data ("Mundo Animal (AH)"); o turno sem editor foi dispensado
    expect(d).toMatchObject({ estado: 'publicado', publicacao: { por: 'bia.coord@empresa.com', pendencias: 1 } });
    expect(d.historico).toHaveLength(1);
    expect(d.semana.find((s) => s.dia === SEXTA)?.estado).toBe('publicado');
  });

  it('o dia publicado aparece na Pauta da edição, com a do Teable, sem dobrar', async () => {
    const p = await pautaDoDia();
    expect(textos(p.linhas)).toEqual([
      // a do Teable fica inteira; "Noite de Gala 27/11 (DP)" é a mesma claquete, e não dobra
      'Rui Teixeira: Noite de Gala 27/11 Dp',
      'Gil Moura: Corujão 28/11',
      'Rui Teixeira: Vale a Pena Rever 30/11 (P)',
      'Elis Furtado: Mundo Animal (AH)',
    ]);
    expect(p.linhas.find((l) => l.texto === 'Mundo Animal (AH)')?.turno).toEqual({ inicio: '14:00', fim: '22:53' });
    expect(p.editores).toContain('Elis Furtado');
    // e na Semana também
    const semana: { linhas: Linha[] } = await (await lia(`/api/pauta/semana?inicio=${SEXTA}`)).json();
    expect(semana.linhas.filter((l) => l.dia === SEXTA)).toHaveLength(4);
  });

  it('mexer depois de publicar deixa o dia alterado; a Pauta continua com o que foi publicado', async () => {
    await gravar([RASCUNHO[0], { ...RASCUNHO[1], demandas: [{ id: 'd-3', texto: 'Mundo Animal 30/11 (AH)' }] }]);
    const d = await ler();
    expect(d.estado).toBe('alterado');
    expect(d.semana.find((s) => s.dia === SEXTA)?.estado).toBe('alterado');
    expect(textos((await pautaDoDia()).linhas)).toContain('Elis Furtado: Mundo Animal (AH)');
    // voltar ao que foi publicado volta a "publicado"
    await gravar(RASCUNHO);
    expect((await ler()).estado).toBe('publicado');
  });

  it('republicar entra no histórico, a mais nova primeiro, e a Pauta passa a mostrar a nova', async () => {
    await gravar([RASCUNHO[0], { ...RASCUNHO[1], demandas: [{ id: 'd-3', texto: 'Mundo Animal 30/11 (AH)' }] }]);
    const d: Dia = await (await publicar()).json();
    expect(d.estado).toBe('publicado');
    expect(d.historico.map((h) => h.pendencias)).toEqual([0, 1]);
    expect(textos((await pautaDoDia()).linhas)).toContain('Elis Furtado: Mundo Animal 30/11 (AH)');
    expect(textos((await pautaDoDia()).linhas)).not.toContain('Elis Furtado: Mundo Animal (AH)');
  });

  it('Desfazer tira a última publicação: vale a anterior, e o rascunho fica como está', async () => {
    const d: Dia = await (await desfazer()).json();
    expect(d.publicacao?.pendencias).toBe(1);
    expect(d.estado).toBe('alterado');
    expect(d.historico[0].desfeitaEm).not.toBeNull();
    expect(d.historico[1].desfeitaEm).toBeNull();
    expect(textos((await pautaDoDia()).linhas)).toContain('Elis Furtado: Mundo Animal (AH)');
  });

  it('desfeita a única publicação, o dia volta a rascunho e a Pauta volta a ser só a do Teable', async () => {
    const d: Dia = await (await desfazer()).json();
    expect(d).toMatchObject({ estado: 'rascunho', publicacao: null });
    expect(d.historico.every((h) => h.desfeitaEm)).toBe(true);
    expect(textos((await pautaDoDia()).linhas)).toEqual(['Rui Teixeira: Noite de Gala 27/11 Dp', 'Gil Moura: Corujão 28/11']);
    // nada mais a desfazer
    expect((await desfazer()).status).toBe(400);
  });

  it('o dia vazio não se publica; quem não é da coordenação não publica nem desfaz', async () => {
    const r = await publicar(bia, SABADO);
    expect(r.status).toBe(400);
    expect((await r.json()).erro).toBe('Nada montado para publicar.');
    expect((await publicar(lia)).status).toBe(403);
    expect((await publicar(chefe)).status).toBe(403);
    expect((await desfazer(lia)).status).toBe(403);
    expect((await ler()).publicacao).toBeNull();
  });

  it('nada foi ao Teable: só leitura', () => {
    expect(escritas).toEqual([]);
    expect(teable.estado.pedidos.every((p: string) => p.startsWith('GET '))).toBe(true);
  });
});
