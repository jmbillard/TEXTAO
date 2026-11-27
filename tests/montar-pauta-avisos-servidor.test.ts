// @vitest-environment node
/* Montar a pauta: os avisos por posição e o recado do dia (#125), pela API. Cada posição tem os seus avisos (⚑), à
   parte das demandas; o dia tem o recado, para todos. O rascunho os guarda; publicados, aparecem na Pauta da edição
   como os avisos de hoje (as linhas com a caixinha de anotação): o aviso no editor da posição, o recado sem editor. O
   que o Teable já tem no dia não dobra. Nada vai ao Teable. Nomes, e-mails e textos fictícios; 27/11/2026 é uma
   sexta. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarEscala } from '../servidor/escala.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

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
const escritas: string[] = [];
async function buscarOsCadastros(url: string, init: RequestInit = {}) {
  const metodo = init.method ?? 'GET';
  if (metodo !== 'GET') {
    escritas.push(`${metodo} ${url}`);
    throw new Error(`montar a pauta não escreve no Teable: ${metodo} ${url}`);
  }
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: CADASTROS[tabela] }), text: async () => '' };
}

/** Uma linha da pauta do Teable (EDICAO_producao), no fuso de São Paulo; `anotacao`: um aviso. */
function linha(id: string, claquete: string, quem: string, anotacao = false) {
  const sp = (h: string, d = SEXTA) => new Date(`${d}T${h}:00-03:00`).toISOString();
  return { id, fields: { claquete, key: claquete.toUpperCase(), editor: { id: `rec${quem.replace(/\W/g, '')}`, title: quem }, data: sp('00:00'), expediente_inicio: sp('22:00'), expediente_fim: sp('06:00', '2026-11-28'), anotacao: anotacao || null, alterado_em: '2026-11-26T12:00:00.000Z' } };
}
const PAUTA_DO_TEABLE = [linha('recT1', 'Noite de Gala 27/11 Dp', 'Rui Teixeira'), linha('recT2', 'REDATOR VEM ACOMPANHAR', 'Rui Teixeira', true)];

const RASCUNHO = [
  { id: 'pos-1', turno: 'madrugada', editor: 'Rui Teixeira', horario: '22h às 6h', demandas: [{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }], avisos: [{ id: 'a-1', texto: '  Redator vem acompanhar ' }, { id: 'a-2', texto: 'Chega às 21h' }, { id: 'a-3', texto: '   ' }] },
  { id: 'pos-2', turno: 'tarde', editor: 'Elis Furtado', horario: '14h às 23h', demandas: [{ id: 'd-2', texto: 'COMUNICAÇÃO' }], avisos: [] },
];
const RECADO = 'Reunião geral às 15h, na sala 3';

type Posicao = { id: string; demandas: { id: string; texto: string }[]; avisos: { id: string; texto: string }[] };
type Dia = { estado: string; recado: string; posicoes: Posicao[] };
type Linha = { id: string; dia: string; editor: string; tipo: string; texto: string; turno: { inicio: string; fim: string } | null };

describe('montar a pauta: avisos por posição e recado do dia (#125)', () => {
  let servidor: Server;
  let base = '';
  let teable: ReturnType<typeof teableFalso>;
  let app: { fechar: () => Promise<void>; tabelasProntas: Promise<void> };
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const bia = como(BIA);
  const lia = como('lia.edicao@empresa.com');
  const ler = async (): Promise<Dia> => (await bia(`/api/montar-pauta?dia=${SEXTA}`)).json();
  const gravar = (corpo: unknown) => bia(`/api/montar-pauta?dia=${SEXTA}`, { method: 'PUT', body: JSON.stringify(corpo) });
  const publicar = () => bia(`/api/montar-pauta/publicar?dia=${SEXTA}`, { method: 'POST' });
  const pautaDoDia = async (): Promise<{ linhas: Linha[]; editores: string[] }> => (await lia(`/api/pauta/dia?dia=${SEXTA}`)).json();
  const avisos = (ls: Linha[]) => ls.filter((l) => l.tipo === 'aviso').map((l) => `${l.editor || '—'}: ${l.texto}`);

  beforeAll(async () => {
    teable = teableFalso({ EDICAO_producao: 'pauta_pg' }, { registros: { EDICAO_producao: PAUTA_DO_TEABLE } });
    app = criarApp({ db: abrirBanco(':memory:'), env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: criarCadastros(ENV_CADASTROS, { buscar: buscarOsCadastros }) });
    await app.tabelasProntas;
    servidor = createServer(app as never);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    await como(CHEFE)('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: BIA }) });
  });
  afterAll(async () => {
    await app.fechar();
    servidor.close();
  });

  it('o rascunho guarda os avisos de cada posição, à parte das demandas, e o recado do dia', async () => {
    const r = await gravar({ posicoes: RASCUNHO, recado: `  ${RECADO}  ` });
    expect(r.status).toBe(200);
    const d: Dia = await r.json();
    expect(d.recado).toBe(RECADO);
    // o aviso fica como foi escrito (sem os espaços das pontas); o vazio não é gravado
    expect(d.posicoes[0].avisos).toEqual([{ id: 'a-1', texto: 'Redator vem acompanhar' }, { id: 'a-2', texto: 'Chega às 21h' }]);
    expect(d.posicoes[0].demandas).toEqual([{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }]);
    expect(d.posicoes[1].avisos).toEqual([]);
    expect(await ler()).toMatchObject({ estado: 'rascunho', recado: RECADO });
  });

  it('o rascunho não vai à Pauta: lá, só os avisos do Teable', async () => {
    expect(avisos((await pautaDoDia()).linhas)).toEqual(['Rui Teixeira: REDATOR VEM ACOMPANHAR']);
  });

  it('recusa o aviso e o recado que não são texto ou são longos demais, e o id do aviso repetido', async () => {
    const com = (avisos: unknown) => [{ ...RASCUNHO[0], avisos }];
    expect((await gravar({ posicoes: com([{ id: 'a-1', texto: 'x'.repeat(201) }]), recado: RECADO })).status).toBe(400);
    expect((await gravar({ posicoes: com('um aviso'), recado: RECADO })).status).toBe(400);
    expect((await gravar({ posicoes: com([{ id: 'd-1', texto: 'mesmo id da demanda' }]), recado: RECADO })).status).toBe(400);
    expect((await gravar({ posicoes: RASCUNHO, recado: 42 })).status).toBe(400);
    expect((await gravar({ posicoes: RASCUNHO, recado: 'x'.repeat(501) })).status).toBe(400);
    // nada mudou
    expect(await ler()).toMatchObject({ recado: RECADO, posicoes: [{ avisos: [{ id: 'a-1' }, { id: 'a-2' }] }, { avisos: [] }] });
  });

  it('publicado, os avisos aparecem no editor da posição e o recado sem editor, sem dobrar o que o Teable tem', async () => {
    expect((await publicar()).status).toBe(200);
    const p = await pautaDoDia();
    expect(avisos(p.linhas)).toEqual([
      // "Redator vem acompanhar" é o mesmo aviso do Teable para o Rui: uma vez só, o do Teable
      'Rui Teixeira: REDATOR VEM ACOMPANHAR',
      'Rui Teixeira: Chega às 21h',
      '—: Reunião geral às 15h, na sala 3',
    ]);
    // o aviso com o turno da posição; o recado, sem turno, no grupo "sem editor" (no fim)
    expect(p.linhas.find((l) => l.texto === 'Chega às 21h')?.turno).toEqual({ inicio: '22:00', fim: '06:00' });
    expect(p.linhas.find((l) => l.texto === RECADO)?.turno).toBeNull();
    expect(p.editores.at(-1)).toBe('');
    // e na Semana também
    const semana: { linhas: Linha[] } = await (await lia(`/api/pauta/semana?inicio=${SEXTA}`)).json();
    expect(avisos(semana.linhas.filter((l) => l.dia === SEXTA))).toHaveLength(3);
  });

  it('mudar só o recado, ou só um aviso, deixa o dia alterado; a Pauta continua com o que foi publicado', async () => {
    await gravar({ posicoes: RASCUNHO, recado: 'Reunião geral às 16h' });
    expect((await ler()).estado).toBe('alterado');
    expect(avisos((await pautaDoDia()).linhas)).toContain(`—: ${RECADO}`);
    await gravar({ posicoes: [{ ...RASCUNHO[0], avisos: [] }, RASCUNHO[1]], recado: RECADO });
    expect((await ler()).estado).toBe('alterado');
    // voltar ao que foi publicado volta a "publicado"
    await gravar({ posicoes: RASCUNHO, recado: RECADO });
    expect((await ler()).estado).toBe('publicado');
  });

  it('gravar sem o recado no pedido não o apaga', async () => {
    await gravar({ posicoes: RASCUNHO });
    expect(await ler()).toMatchObject({ estado: 'publicado', recado: RECADO });
  });

  it('nada foi ao Teable: só leitura', () => {
    expect(escritas).toEqual([]);
    expect(teable.estado.pedidos.every((x: string) => x.startsWith('GET '))).toBe(true);
  });
});

describe('a publicação de antes do #125', () => {
  it('sem avisos nem recado no que foi publicado, o dia que não mudou continua publicado', () => {
    const db = abrirBanco(':memory:');
    const escala = criarEscala(db);
    // como o #127 gravava: as posições sem os avisos, e o dia sem o recado
    db.prepare("INSERT INTO escala_dias (dia, estado, gravado_por, gravado_em) VALUES (?, 'rascunho', ?, ?)").run(SEXTA, BIA, '2026-11-26T12:00:00.000Z');
    db.prepare("INSERT INTO escala_posicoes (id, dia, ordem, turno, editor, horario, ilha) VALUES ('pos-1', ?, 0, 'manha', 'Rui Teixeira', '6h às 15h', '')").run(SEXTA);
    db.prepare("INSERT INTO escala_demandas (id, posicao, ordem, texto) VALUES ('d-1', 'pos-1', 0, 'COMUNICAÇÃO')").run();
    const antiga = [{ id: 'pos-1', turno: 'manha', editor: 'Rui Teixeira', ilha: '', horario: '6h às 15h', demandas: [{ id: 'd-1', texto: 'COMUNICAÇÃO' }] }];
    db.prepare('INSERT INTO escala_publicacoes (id, dia, em, por, pendencias, posicoes) VALUES (?, ?, ?, ?, 0, ?)').run('pub-1', SEXTA, '2026-11-26T13:00:00.000Z', BIA, JSON.stringify(antiga));
    expect(escala.lerDia(SEXTA)).toMatchObject({ estado: 'publicado', recado: '', posicoes: [{ avisos: [] }] });
    expect(escala.publicadas(SEXTA, SEXTA)).toEqual([{ dia: SEXTA, posicoes: antiga, recado: '' }]);
  });
});
