// @vitest-environment node
/* Montar a pauta: gravar no Teable e a chave da virada (#134), pela API, com o Teable falso (nada sai para a rede).
   A chave fica na Configuração, só para administradores, e vem desligada: publicar não grava no Teable. Ligada,
   publicar grava o dia na tabela da pauta da edição (EDICAO_producao), no formato do n8n: uma linha por demanda, com a
   claquete, o editor (o link para o cadastro), a data e o expediente; os avisos e o recado do dia como linhas com a
   caixinha de anotação. Republicar ajusta as linhas do dia sem duplicar (o vínculo de cada item publicado com o registro
   fica no SQLite), o rascunho nunca vai, e desfazer a publicação volta o Teable para a anterior (ou tira o dia). Depois
   da virada, na Pauta da edição vale o publicado: o Teable daquele dia é o espelho. Nomes e claquetes fictícios;
   27/11/2026 é uma sexta. */
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
const BIA = 'bia.coord@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const ENV_CADASTROS = { ...ENV, TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };
const TABELA_DA_PAUTA = 'tblFalso_bseFalso_EDICAO_producao';

/** Os cadastros de mentira (só leitura): os editores, com o id do registro que o link da pauta usa. */
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
async function buscarOsCadastros(url: string, init: RequestInit = {}) {
  if ((init.method ?? 'GET') !== 'GET') throw new Error(`os cadastros não são gravados aqui: ${init.method} ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: CADASTROS[tabela] }), text: async () => '' };
}

const sp = (d: string, h: string) => new Date(`${d}T${h}:00-03:00`).toISOString();
/** Uma linha que o fluxo do n8n gravou na pauta do Teable, lida da planilha. */
function doN8n(id: string, claquete: string, quem: string, dia: string, turno: [string, string]) {
  return { id, fields: { claquete, key: claquete.toUpperCase(), editor: { id: `rec${quem.replace(/\W/g, '')}`, title: quem }, data: sp(dia, '00:00'), expediente_inicio: sp(dia, turno[0]), expediente_fim: sp(dia, turno[1]), anotacao: null, alterado_em: '2026-11-26T12:00:00.000Z' } };
}

const RASCUNHO = [
  { id: 'pos-1', turno: 'madrugada', editor: 'Rui Teixeira', horario: '22h às 6h', demandas: [{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }, { id: 'd-2', texto: 'COMUNICAÇÃO' }], avisos: [{ id: 'a-1', texto: 'VEM PRONTA' }] },
  { id: 'pos-2', turno: 'tarde', editor: 'Elis Furtado', horario: '14h às 22h53', demandas: [{ id: 'd-3', texto: 'Corujão 28/11 (A)' }] },
];

/** O mesmo rascunho no sábado (os ids são de cada dia). */
const DO_SABADO = RASCUNHO.map((p) => ({ ...p, id: `${p.id}-sab`, demandas: p.demandas.map((d) => ({ ...d, id: `${d.id}-sab` })), avisos: (p.avisos ?? []).map((a) => ({ ...a, id: `${a.id}-sab` })) }));

type Registro = { id: string; fields: Record<string, unknown> };
type Linha = { id: string; dia: string; editor: string; texto: string; tipo: string };

describe('montar a pauta: gravar no Teable e a chave da virada (#134)', () => {
  let servidor: Server;
  let base = '';
  let teable: ReturnType<typeof teableFalso>;
  let app: { fechar: () => Promise<void>; tabelasProntas: Promise<void> };
  /** A tabela da pauta no Teable falso: o mesmo array que o Postgres de mentira lê. */
  const pautaNoTeable: Registro[] = [];
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  const bia = como(BIA);
  const lia = como('lia.edicao@empresa.com');
  const gravar = (posicoes: unknown, dia = SEXTA, recado?: string) => bia(`/api/montar-pauta?dia=${dia}`, { method: 'PUT', body: JSON.stringify({ posicoes, ...(recado !== undefined ? { recado } : {}) }) });
  const publicar = async (dia = SEXTA) => (await bia(`/api/montar-pauta/publicar?dia=${dia}`, { method: 'POST' })).json();
  const desfazer = async (dia = SEXTA) => (await bia(`/api/montar-pauta/desfazer?dia=${dia}`, { method: 'POST' })).json();
  const virada = (ligada: boolean, quem = chefe) => quem('/api/configuracao/virada', { method: 'POST', body: JSON.stringify({ ligada }) });
  /** O que está no Teable num dia, legível: "editor: claquete (aviso)". */
  const noTeable = (dia = SEXTA) =>
    pautaNoTeable
      .filter((r) => r.fields.data === sp(dia, '00:00'))
      .map((r) => `${(r.fields.editor as { id?: string } | null)?.id ?? '—'}: ${r.fields.claquete}${r.fields.anotacao ? ' (aviso)' : ''}`)
      .sort();
  const escritas = () => teable.estado.pedidos.filter((p: string) => !p.startsWith('GET') && p.includes(TABELA_DA_PAUTA));

  beforeAll(async () => {
    pautaNoTeable.push(doN8n('recN1', 'Noite de Gala 27/11 Dp', 'Rui Teixeira', SEXTA, ['22:00', '06:00']), doN8n('recN2', 'Vale a Pena Rever 30/11', 'Gil Moura', SEXTA, ['06:00', '15:00']), doN8n('recN3', 'Corujão 29/11', 'Gil Moura', DOMINGO, ['06:00', '15:00']));
    teable = teableFalso({ EDICAO_producao: 'pauta_pg' }, { registros: { EDICAO_producao: pautaNoTeable } });
    app = criarApp({ db: abrirBanco(':memory:'), env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: criarCadastros(ENV_CADASTROS, { buscar: buscarOsCadastros }) });
    await app.tabelasProntas;
    servidor = createServer(app as never);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: BIA }) });
    expect((await gravar(RASCUNHO, SEXTA, 'Reunião geral às 15h')).status).toBe(200);
  });
  afterAll(async () => {
    await app.fechar();
    servidor.close();
  });

  it('a chave vem desligada: publicar fica no PROMeiro e não grava nada no Teable', async () => {
    const d = await publicar();
    expect(d.estado).toBe('publicado');
    expect(d.noTeable).toEqual({ ligada: false, gravadoEm: null, erro: null });
    expect(escritas()).toEqual([]);
    expect(pautaNoTeable).toHaveLength(3);
    // e a Pauta junta como antes da virada: a do Teable inteira, mais o que só o PROMeiro tem
    const p: { linhas: Linha[] } = await (await lia(`/api/pauta/dia?dia=${SEXTA}`)).json();
    expect(p.linhas.map((l) => l.texto)).toEqual(['Noite de Gala 27/11 Dp', 'Vale a Pena Rever 30/11', 'COMUNICAÇÃO', 'VEM PRONTA', 'Corujão 28/11 (A)', 'Reunião geral às 15h']);
  });

  it('a chave é da Configuração, só para administradores: a coordenação não liga', async () => {
    expect((await virada(true, bia)).status).toBe(403);
    const cfg = await (await chefe('/api/configuracao')).json();
    expect(cfg.virada).toEqual({ ligada: false, tabela: true });
    const r = await virada(true);
    expect(r.status).toBe(200);
    expect((await r.json()).virada).toEqual({ ligada: true, tabela: true });
    // ligar não grava nada: só a próxima publicação vai
    expect(escritas()).toEqual([]);
    // e entra no histórico da Configuração
    const h = await (await chefe('/api/configuracao/historico')).json();
    expect(h.entradas[0].linhas).toEqual([{ oque: 'A pauta grava no Teable (a virada)', antes: 'desligada', depois: 'ligada' }]);
  });

  it('ligada, publicar grava o dia no formato do n8n: uma linha por demanda, os avisos e o recado com a caixinha de anotação', async () => {
    const d = await publicar();
    expect(d.noTeable).toMatchObject({ ligada: true, erro: null });
    expect(d.noTeable.gravadoEm).toEqual(expect.any(String));
    const doDia = pautaNoTeable.filter((r) => r.fields.data === sp(SEXTA, '00:00'));
    // as linhas que o n8n gravou no dia saem: o dia agora é do PROMeiro (o outro dia fica)
    expect(doDia.map((r) => r.id)).not.toContain('recN1');
    expect(pautaNoTeable.map((r) => r.id)).toContain('recN3');
    const campos = doDia.map((r) => r.fields);
    expect(campos).toEqual([
      { claquete: 'Noite de Gala 27/11 (DP)', editor: { id: 'recE1' }, data: sp(SEXTA, '00:00'), expediente_inicio: sp(SEXTA, '22:00'), expediente_fim: sp(SABADO, '06:00'), anotacao: null, alterado_em: d.publicacao.em },
      { claquete: 'COMUNICAÇÃO', editor: { id: 'recE1' }, data: sp(SEXTA, '00:00'), expediente_inicio: sp(SEXTA, '22:00'), expediente_fim: sp(SABADO, '06:00'), anotacao: null, alterado_em: d.publicacao.em },
      { claquete: 'VEM PRONTA', editor: { id: 'recE1' }, data: sp(SEXTA, '00:00'), expediente_inicio: sp(SEXTA, '22:00'), expediente_fim: sp(SABADO, '06:00'), anotacao: true, alterado_em: d.publicacao.em },
      { claquete: 'Corujão 28/11 (A)', editor: { id: 'recE2' }, data: sp(SEXTA, '00:00'), expediente_inicio: sp(SEXTA, '14:00'), expediente_fim: sp(SEXTA, '22:53'), anotacao: null, alterado_em: d.publicacao.em },
      { claquete: 'Reunião geral às 15h', editor: null, data: sp(SEXTA, '00:00'), expediente_inicio: null, expediente_fim: null, anotacao: true, alterado_em: d.publicacao.em },
    ]);
    // só na tabela da pauta da edição, da base do PROMeiro
    expect(teable.estado.pedidos.filter((p: string) => !p.startsWith('GET')).every((p: string) => p.includes(`/api/table/${TABELA_DA_PAUTA}/record`))).toBe(true);
  });

  it('depois da virada, na Pauta da edição vale o publicado; o dia que o PROMeiro não gravou continua com o Teable', async () => {
    const p: { linhas: Linha[] } = await (await lia(`/api/pauta/dia?dia=${SEXTA}`)).json();
    expect(p.linhas.map((l) => `${l.editor || '—'}: ${l.texto}`)).toEqual(['Rui Teixeira: Noite de Gala 27/11 (DP)', 'Rui Teixeira: COMUNICAÇÃO', 'Rui Teixeira: VEM PRONTA', 'Elis Furtado: Corujão 28/11 (A)', '—: Reunião geral às 15h']);
    const domingo: { linhas: Linha[] } = await (await lia(`/api/pauta/dia?dia=${DOMINGO}`)).json();
    expect(domingo.linhas.map((l) => `${l.editor}: ${l.texto}`)).toEqual(['Gil Moura: Corujão 29/11']);
  });

  it('o rascunho nunca vai: mexer sem publicar não grava no Teable', async () => {
    const antes = escritas().length;
    const fotografia = JSON.stringify(pautaNoTeable);
    expect((await gravar([{ ...RASCUNHO[0], demandas: [] }, RASCUNHO[1]])).status).toBe(200);
    expect(escritas()).toHaveLength(antes);
    expect(JSON.stringify(pautaNoTeable)).toBe(fotografia);
  });

  it('republicar ajusta as linhas do dia, sem duplicar: o que ficou igual não é regravado, o que mudou muda, o que saiu sai', async () => {
    const ids = Object.fromEntries(pautaNoTeable.map((r) => [r.fields.claquete, r.id]));
    // a claquete troca de editor, a COMUNICAÇÃO sai, entra uma nova, o recado muda
    const novo = [
      { ...RASCUNHO[0], demandas: [{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }, { id: 'd-4', texto: 'Mundo Animal 30/11 (P)' }] },
      { ...RASCUNHO[1], demandas: [{ id: 'd-3', texto: 'Corujão 28/11 (A)' }] },
    ];
    expect((await gravar(novo, SEXTA, 'Reunião geral às 16h')).status).toBe(200);
    const antes = escritas().length;
    const d = await publicar();
    expect(d.noTeable.erro).toBeNull();
    expect(noTeable()).toEqual(['recE1: Mundo Animal 30/11 (P)', 'recE1: Noite de Gala 27/11 (DP)', 'recE1: VEM PRONTA (aviso)', 'recE2: Corujão 28/11 (A)', '—: Reunião geral às 16h (aviso)'].sort());
    // os registros que continuam são os mesmos
    const depois = Object.fromEntries(pautaNoTeable.map((r) => [r.fields.claquete, r.id]));
    expect(depois['Noite de Gala 27/11 (DP)']).toBe(ids['Noite de Gala 27/11 (DP)']);
    expect(depois['Reunião geral às 16h']).toBe(ids['Reunião geral às 15h']);
    // só o recado mudou (PATCH), a demanda nova foi criada e a que saiu, apagada; o resto nem foi tocado
    const pedidos = escritas().slice(antes);
    expect(pedidos.filter((p: string) => p.startsWith('PATCH'))).toHaveLength(1);
    expect(pedidos.filter((p: string) => p.startsWith('POST'))).toHaveLength(1);
    expect(pedidos.filter((p: string) => p.startsWith('DELETE'))).toHaveLength(1);
    // a linha que não mudou guarda a hora em que mudou de verdade
    expect(pautaNoTeable.find((r) => r.id === ids['Noite de Gala 27/11 (DP)'])?.fields.alterado_em).not.toBe(d.publicacao.em);
    // republicar de novo, sem mudar nada, não duplica nem escreve
    const agora = escritas().length;
    await publicar();
    expect(noTeable()).toHaveLength(5);
    expect(escritas()).toHaveLength(agora);
  });

  it('desfazer a publicação volta o Teable para a anterior; desfazer todas tira as linhas do dia', async () => {
    let d = await desfazer();
    expect(d.noTeable.erro).toBeNull();
    // vale a publicação anterior, que era igual a esta (o recado das 16h, sem a COMUNICAÇÃO)
    expect(noTeable()).toHaveLength(5);
    await desfazer();
    // agora vale a segunda publicação (a de 15h, com a COMUNICAÇÃO)
    expect(noTeable()).toEqual(['recE1: COMUNICAÇÃO', 'recE1: Noite de Gala 27/11 (DP)', 'recE1: VEM PRONTA (aviso)', 'recE2: Corujão 28/11 (A)', '—: Reunião geral às 15h (aviso)'].sort());
    await desfazer();
    // a primeira (com a chave desligada) é a que vale agora: com a chave ligada, ela vai ao Teable também
    expect(noTeable()).toHaveLength(5);
    d = await desfazer();
    expect(d.publicacao).toBeNull();
    expect(noTeable()).toEqual([]);
    // o outro dia não é tocado
    expect(noTeable(DOMINGO)).toEqual(['recGilMoura: Corujão 29/11']);
    // sem publicação, a Pauta volta ao Teable (que já não tem o dia)
    const p: { linhas: Linha[] } = await (await lia(`/api/pauta/dia?dia=${SEXTA}`)).json();
    expect(p.linhas).toEqual([]);
  });

  it('com o Teable fora do ar, publicar fica no PROMeiro e diz que não gravou; publicar de novo grava, sem duplicar', async () => {
    expect((await gravar(DO_SABADO, SABADO)).status).toBe(200);
    teable.estado.fora = true;
    let d = await publicar(SABADO);
    teable.estado.fora = false;
    expect(d.estado).toBe('publicado');
    expect(d.noTeable.erro).toMatch(/Teable/);
    // a Pauta mostra o publicado mesmo assim: o PROMeiro vale
    const p: { linhas: Linha[] } = await (await lia(`/api/pauta/dia?dia=${SABADO}`)).json();
    expect(p.linhas.map((l) => l.texto)).toEqual(['Noite de Gala 27/11 (DP)', 'COMUNICAÇÃO', 'VEM PRONTA', 'Corujão 28/11 (A)']);
    d = await publicar(SABADO);
    expect(d.noTeable.erro).toBeNull();
    expect(noTeable(SABADO)).toHaveLength(4);
    // e o GET do dia diz quando foi gravado
    const lido = await (await bia(`/api/montar-pauta?dia=${SABADO}`)).json();
    expect(lido.noTeable).toEqual({ ligada: true, gravadoEm: d.noTeable.gravadoEm, erro: null });
  });

  it('desligar a chave volta a antes da virada: publicar não grava, e o Teable fica como estava', async () => {
    expect((await virada(false)).status).toBe(200);
    const antes = escritas().length;
    expect((await gravar([DO_SABADO[1]], SABADO)).status).toBe(200);
    const d = await publicar(SABADO);
    expect(d.noTeable).toEqual({ ligada: false, gravadoEm: expect.any(String), erro: null });
    expect(escritas()).toHaveLength(antes);
    expect(noTeable(SABADO)).toHaveLength(4);
  });
});
