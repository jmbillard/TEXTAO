// @vitest-environment node
/* Montar a pauta: duas pessoas ao mesmo tempo (#131), pela API. Duas pessoas da coordenação montam o mesmo dia sem
   bloquear uma à outra e sem perder trabalho:
   - a gravação (PUT) leva a `base`, o dia como a pessoa o leu; o servidor junta o que ela mudou desde a base com o que
     está gravado agora, campo por campo (o que a outra mudou fica; no mesmo campo, vale quem gravou por último);
   - cada resposta traz a `versao` do dia, um número que só cresce;
   - a sala do dia (a mesma sala de colaboração do editor de roteiros, `/api/colab/montar-AAAA-MM-DD`) só recebe a
     coordenação, repassa a presença (quem está e em que campo) e avisa, com a versão, toda vez que o dia muda.
   Nada vai ao Teable. Nomes, e-mails e claquetes fictícios; 27/11/2026 é uma sexta. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as sinc from 'y-protocols/sync';
import * as presenca from 'y-protocols/awareness';
import * as cod from 'lib0/encoding';
import * as dec from 'lib0/decoding';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';

const SEXTA = '2026-11-27';
const CHEFE = 'chefe@empresa.com';
const BIA = 'bia.coord@empresa.com';
const ANA = 'ana.coord@empresa.com';
const ENV = { TEABLE_URL: 'http://teable:3000', TEABLE_TOKEN: 'um-token-so', TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi', CADASTRO_ADMINS: CHEFE };
const TABELAS: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
  tblRed: [],
  tblKeyRed: [],
  tblEdi: [
    { id: 'recE1', fields: { editor: 'Rui Teixeira' } },
    { id: 'recE2', fields: { editor: 'Elis Furtado' } },
    { id: 'recE3', fields: { editor: 'Gil Moura' } },
  ],
  tblKeyEdi: [],
};
async function buscar(url: string, init: RequestInit = {}) {
  if ((init.method ?? 'GET') !== 'GET') throw new Error(`montar a pauta não escreve no Teable: ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
}

type Demanda = { id: string; texto: string };
type Posicao = { id: string; turno: string; editor: string; ilha: string; horario: string; demandas: Demanda[]; avisos: Demanda[]; vaga?: string };
type Dia = { dia: string; posicoes: Posicao[]; recado: string; versao: number; paraDistribuir: { id: string; texto: string }[] };

const RASCUNHO: Posicao[] = [
  { id: 'pos-1', turno: 'madrugada', editor: 'Rui Teixeira', ilha: '', horario: '22h às 6h', demandas: [{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }, { id: 'd-2', texto: 'COMUNICAÇÃO' }], avisos: [] },
  { id: 'pos-2', turno: 'tarde', editor: 'Elis Furtado', ilha: '', horario: '14h às 23h', demandas: [{ id: 'd-3', texto: 'Mundo Animal 30/11 (P)' }], avisos: [] },
  { id: 'pos-3', turno: 'tarde', editor: '', ilha: '', horario: '14h às 23h', demandas: [], avisos: [] },
];
const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe('montar a pauta: duas pessoas ao mesmo tempo (#131)', () => {
  let servidor: Server;
  let base = '';
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const bia = como(BIA);
  const ana = como(ANA);
  const ler = async (quem = bia): Promise<Dia> => (await quem(`/api/montar-pauta?dia=${SEXTA}`)).json();
  const gravar = async (quem: ReturnType<typeof como>, posicoes: Posicao[], deBase?: Dia, recado?: string) => {
    const r = await quem(`/api/montar-pauta?dia=${SEXTA}`, { method: 'PUT', body: JSON.stringify({ posicoes, ...(recado !== undefined ? { recado } : {}), ...(deBase ? { base: { posicoes: deBase.posicoes, recado: deBase.recado } } : {}) }) });
    expect(r.status).toBe(200);
    return (await r.json()) as Dia;
  };
  /** Começa cada caso do mesmo rascunho, gravado pela Bia sem base (troca o dia inteiro). */
  const doRascunho = async () => {
    await gravar(bia, RASCUNHO, undefined, '');
    return ler();
  };
  const daPosicao = (d: Dia, id: string) => d.posicoes.find((p) => p.id === id);

  beforeAll(async () => {
    const app = criarApp({ db: abrirBanco(':memory:'), env: {}, cadastros: criarCadastros(ENV, { buscar }) });
    servidor = createServer(app);
    servidor.on('upgrade', app.upgrade);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    for (const email of [BIA, ANA]) expect((await como(CHEFE)('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email }) })).status).toBe(200);
  });
  afterAll(() => servidor.close());

  it('as duas mexem em posições diferentes com a mesma base: fica o trabalho das duas', async () => {
    const lido = await doRascunho();
    // a Bia muda o horário do Rui; a Ana, sem saber, escala o Gil na vaga da Tarde
    const daBia = copia(lido.posicoes);
    daBia[0].horario = '23 as 7';
    const daAna = copia(lido.posicoes);
    daAna[2].editor = 'Gil Moura';
    await gravar(bia, daBia, lido);
    const depois = await gravar(ana, daAna, lido);
    expect(daPosicao(depois, 'pos-1')?.horario).toBe('23h às 7h');
    expect(daPosicao(depois, 'pos-3')?.editor).toBe('Gil Moura');
    expect(await ler()).toMatchObject({ posicoes: depois.posicoes });
  });

  it('na mesma posição, campos diferentes e linhas novas: nada se perde', async () => {
    const lido = await doRascunho();
    const daBia = copia(lido.posicoes);
    daBia[0].demandas[1].texto = 'CALHAUS';
    daBia[0].avisos.push({ id: 'a-bia', texto: 'chega mais cedo' });
    const daAna = copia(lido.posicoes);
    daAna[0].ilha = '';
    daAna[0].demandas.push({ id: 'd-ana', texto: 'Mundo Animal 28/11 d' });
    await gravar(bia, daBia, lido);
    const depois = await gravar(ana, daAna, lido);
    expect(daPosicao(depois, 'pos-1')).toMatchObject({
      demandas: [
        { id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' },
        { id: 'd-2', texto: 'CALHAUS' },
        { id: 'd-ana', texto: 'Mundo Animal 28/11 (D)' },
      ],
      avisos: [{ id: 'a-bia', texto: 'chega mais cedo' }],
    });
  });

  it('no mesmo campo vale quem gravou por último; a mesma coisa com outra grafia não briga', async () => {
    const lido = await doRascunho();
    const daBia = copia(lido.posicoes);
    daBia[1].horario = '15 as 23';
    const daAna = copia(lido.posicoes);
    daAna[1].horario = '16h às 0h';
    await gravar(bia, daBia, lido);
    expect(daPosicao(await gravar(ana, daAna, lido), 'pos-2')?.horario).toBe('16h às 0h');
    // a Bia escreve de novo do jeito dela o que já está gravado: não é mudança, a da Ana fica
    const deNovo = await ler();
    const outra = copia(deNovo.posicoes);
    outra[1].horario = '16 AS 00';
    outra[0].horario = '22 AS 06';
    const d = await gravar(bia, outra, { ...deNovo, posicoes: copia(deNovo.posicoes).map((p) => (p.id === 'pos-2' ? { ...p, horario: '16 as 0' } : p)) });
    expect(daPosicao(d, 'pos-2')?.horario).toBe('16h às 0h');
  });

  it('o recado do dia: o que uma escreveu não some quando a outra grava as posições', async () => {
    const lido = await doRascunho();
    await gravar(bia, lido.posicoes, lido, 'reunião às 15h');
    const daAna = copia(lido.posicoes);
    daAna[0].editor = 'Gil Moura';
    const d = await gravar(ana, daAna, lido, '');
    expect(d.recado).toBe('reunião às 15h');
    expect(daPosicao(d, 'pos-1')?.editor).toBe('Gil Moura');
  });

  it('tirar uma posição: sai se a outra não mexeu nela; fica se a outra mexeu', async () => {
    const lido = await doRascunho();
    // a Ana escreve uma demanda na vaga; a Bia, sem ver, tira a vaga e a posição da Elis
    const daAna = copia(lido.posicoes);
    daAna[2].demandas.push({ id: 'd-vaga', texto: 'COMUNICAÇÃO' });
    await gravar(ana, daAna, lido);
    const d = await gravar(bia, lido.posicoes.filter((p) => p.id === 'pos-1'), lido);
    expect(d.posicoes.map((p) => p.id)).toEqual(['pos-1', 'pos-3']);
    expect(daPosicao(d, 'pos-3')?.demandas).toEqual([{ id: 'd-vaga', texto: 'COMUNICAÇÃO' }]);
  });

  it('a posição nova de cada uma entra no lugar em que ela pôs', async () => {
    const lido = await doRascunho();
    const daBia = copia(lido.posicoes);
    daBia.splice(1, 0, { id: 'pos-bia', turno: 'madrugada', editor: 'Gil Moura', ilha: '', horario: '22h às 6h', demandas: [], avisos: [] });
    const daAna = copia(lido.posicoes);
    daAna.push({ id: 'pos-ana', turno: 'noite', editor: '', ilha: '', horario: '20h às 2h', demandas: [], avisos: [] });
    await gravar(bia, daBia, lido);
    const d = await gravar(ana, daAna, lido);
    expect(d.posicoes.map((p) => p.id)).toEqual(['pos-1', 'pos-bia', 'pos-2', 'pos-3', 'pos-ana']);
  });

  it('a ação da coluna de uma não é desfeita pela gravação da outra, que ainda tinha o dia de antes', async () => {
    const lido = await doRascunho();
    // a Ana leva uma claquete de "Para distribuir" para a vaga e move a COMUNICAÇÃO do Rui para a Elis
    const comLista: Dia = await (await ana(`/api/montar-pauta/para-distribuir?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ texto: 'Fim de Tarde 27/11' }) })).json();
    const item = comLista.paraDistribuir[0];
    expect((await ana(`/api/montar-pauta/levar?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ id: item.id, posicao: 'pos-3', antesDe: null }) })).status).toBe(200);
    expect((await ana(`/api/montar-pauta/mover?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ demanda: 'd-2', posicao: 'pos-2', antesDe: null }) })).status).toBe(200);
    // a Bia, com o dia de antes, muda o texto da COMUNICAÇÃO e o horário da vaga
    const daBia = copia(lido.posicoes);
    daBia[0].demandas[1].texto = 'COMUNICAÇÃO E CALHAUS';
    daBia[2].horario = '15 as 23';
    const d = await gravar(bia, daBia, lido);
    expect(daPosicao(d, 'pos-1')?.demandas.map((x) => x.id)).toEqual(['d-1']);
    expect(daPosicao(d, 'pos-2')?.demandas).toEqual([{ id: 'd-3', texto: 'Mundo Animal 30/11 (P)' }, { id: 'd-2', texto: 'COMUNICAÇÃO E CALHAUS' }]);
    expect(daPosicao(d, 'pos-3')).toMatchObject({ horario: '15h às 23h', demandas: [{ id: item.id, texto: 'Fim de Tarde 27/11' }] });
  });

  it('a base só serve para comparar: um turno que já não vale nela não recusa a gravação', async () => {
    const lido = await doRascunho();
    // a base tem uma posição de um turno criado na Configuração (o Plantão), que a outra já tirou
    const comPlantao = { ...lido, posicoes: [...lido.posicoes, { id: 'pos-plantao', turno: 'plantao', editor: '', ilha: 'ilha-que-saiu', horario: '', demandas: [], avisos: [] }] };
    const daBia = copia(lido.posicoes);
    daBia[0].horario = '23 as 7';
    const d = await gravar(bia, daBia, comPlantao);
    expect(d.posicoes.map((p) => p.id)).toEqual(['pos-1', 'pos-2', 'pos-3']);
    expect(daPosicao(d, 'pos-1')?.horario).toBe('23h às 7h');
  });

  it('escalar numa posição nova fica com o id que a tela mostrou antes da resposta (o mesmo nas duas telas)', async () => {
    await doRascunho();
    const r = await ana(`/api/montar-pauta/escalar?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ editor: 'Gil Moura', turno: 'noite', id: 'p-da-tela' }) });
    expect(r.status).toBe(200);
    expect(daPosicao(await r.json(), 'p-da-tela')).toMatchObject({ turno: 'noite', editor: 'Gil Moura' });
    // o id que já existe no dia não serve: o servidor dá outro
    const d: Dia = await (await ana(`/api/montar-pauta/escalar?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ editor: 'Rui Teixeira', turno: 'noite', id: 'pos-1' }) })).json();
    expect(d.posicoes.filter((p) => p.id === 'pos-1')).toHaveLength(1);
    expect(d.posicoes.filter((p) => p.turno === 'noite').map((p) => p.editor)).toEqual(['Gil Moura', 'Rui Teixeira']);
  });

  it('sem a base, gravar troca o dia inteiro (como antes)', async () => {
    await doRascunho();
    const d = await gravar(bia, [RASCUNHO[0]]);
    expect(d.posicoes.map((p) => p.id)).toEqual(['pos-1']);
  });

  it('a versão do dia só cresce a cada mudança; ler não muda a versão', async () => {
    const um = await ler();
    expect(typeof um.versao).toBe('number');
    expect((await ler()).versao).toBe(um.versao);
    const gravado = await gravar(bia, um.posicoes, um, 'outro recado');
    expect(gravado.versao).toBeGreaterThan(um.versao);
    expect((await ler(ana)).versao).toBe(gravado.versao);
  });

  /* ---------- a sala do dia ---------- */
  const MSG_SINC = 0;
  const MSG_PRESENCA = 1;
  type NaSala = { ws: WebSocket; doc: Y.Doc; pres: presenca.Awareness };
  const entrar = (email: string, dia = SEXTA) =>
    new Promise<NaSala>((ok, erro) => {
      const ws = new WebSocket(base.replace('http', 'ws') + `/api/colab/montar-${dia}`, { headers: { 'cf-access-authenticated-user-email': email } });
      const doc = new Y.Doc();
      const pres = new presenca.Awareness(doc);
      ws.binaryType = 'arraybuffer';
      ws.on('message', (dados: ArrayBuffer) => {
        const d = dec.createDecoder(new Uint8Array(dados));
        const tipo = dec.readVarUint(d);
        if (tipo === MSG_PRESENCA) return presenca.applyAwarenessUpdate(pres, dec.readVarUint8Array(d), ws);
        const e = cod.createEncoder();
        cod.writeVarUint(e, MSG_SINC);
        sinc.readSyncMessage(d, e, doc, ws);
        if (cod.length(e) > 1) ws.send(cod.toUint8Array(e));
      });
      pres.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origem: unknown) => {
        if (origem === ws) return;
        const e = cod.createEncoder();
        cod.writeVarUint(e, MSG_PRESENCA);
        cod.writeVarUint8Array(e, presenca.encodeAwarenessUpdate(pres, [...added, ...updated, ...removed]));
        ws.send(cod.toUint8Array(e));
      });
      ws.on('open', () => {
        const e = cod.createEncoder();
        cod.writeVarUint(e, MSG_SINC);
        sinc.writeSyncStep1(e, doc);
        ws.send(cod.toUint8Array(e));
        ok({ ws, doc, pres });
      });
      ws.on('error', erro);
    });
  const pausa = () => new Promise((ok) => setTimeout(ok, 150));

  it('a sala do dia só recebe a coordenação', async () => {
    await expect(entrar('elis.furtado@empresa.com')).rejects.toThrow();
    await expect(entrar(CHEFE)).rejects.toThrow();
    await expect(entrar(BIA, '2026-02-30')).rejects.toThrow();
    const b = await entrar(BIA);
    b.ws.close();
  });

  it('na sala, uma vê a outra e o campo em que ela está', async () => {
    const b = await entrar(BIA);
    const a = await entrar(ANA);
    a.pres.setLocalState({ user: { name: 'Ana Coord', email: ANA }, campo: { posicao: 'pos-1', campo: 'horario' } });
    await pausa();
    const daAna = [...b.pres.getStates().values()].find((s) => s.user?.email === ANA);
    expect(daAna?.campo).toEqual({ posicao: 'pos-1', campo: 'horario' });
    a.ws.close();
    await pausa();
    // quem sai some da sala
    expect([...b.pres.getStates().values()].some((s) => s.user?.email === ANA)).toBe(false);
    b.ws.close();
  });

  it('cada mudança do dia avisa a sala com a versão nova: a gravação, a ação da coluna e o Repetir', async () => {
    const b = await entrar(BIA);
    await pausa();
    const avisada = () => (b.doc.getMap('dia').get('versao') as number | undefined) ?? 0;
    await doRascunho();
    const lido = await ler(ana);
    const gravado = await gravar(ana, lido.posicoes, lido, 'avisa a sala');
    await pausa();
    expect(avisada()).toBe(gravado.versao);
    const movido: Dia = await (await ana(`/api/montar-pauta/mover?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ demanda: 'd-1', posicao: 'pos-2', antesDe: null }) })).json();
    await pausa();
    expect(avisada()).toBe(movido.versao);
    expect(movido.versao).toBeGreaterThan(gravado.versao);
    // a ausência marcada também muda os rascunhos: a sala é avisada
    const antes = avisada();
    expect((await ana(`/api/montar-pauta/ausencias?dia=${SEXTA}`, { method: 'POST', body: JSON.stringify({ editor: 'Elis Furtado', tipo: 'folga', de: SEXTA, ate: SEXTA }) })).status).toBe(200);
    await pausa();
    expect(avisada()).toBeGreaterThan(antes);
    // a sala do dia não vira roteiro: entrar de novo não traz nada guardado além da versão
    b.ws.close();
    await pausa();
    const c = await entrar(BIA);
    await pausa();
    expect(c.doc.getMap('dia').size).toBe(0);
    c.ws.close();
  });
});
