// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
import type { EstadoDoCard, LigacoesDoCard } from '../src/modelo/ligarOCard';

/* A seção Card da Configuração (#74) pela API, com o Trello de mentira: os campos do card, as opções e a lista do VT
   são fictícios. Salvar passa pela conferência e vale na hora: o próximo card enviado já leva as opções novas. */

const CHEFE = 'chefe@empresa.com';
const ANA = 'ana@empresa.com';
const LISTAS = [
  { id: 'lSP', name: 'SP ENTRADA', closed: false },
  { id: 'lSPs', name: 'SP ENTREGUE', closed: false },
  { id: 'lVT', name: 'VT', closed: false },
];
const ops = (...xs: [string, string][]) => xs.map(([id, text]) => ({ id, value: { text }, color: 'red' }));
// a Prioridade tem ALTA duas vezes (a de 2025, esquecida, e a de hoje); há uma segunda Complexidade, a nova
const CAMPOS = [
  { id: 'cPraca', name: 'Praça', type: 'list', options: ops(['oSP', 'SP'], ['oG5', 'G5']) },
  { id: 'cPrio', name: 'Prioridade', type: 'list', options: ops(['pAlta', 'ALTA'], ['pMedia', 'MÉDIA'], ['pAlta2', 'ALTA']) },
  { id: 'cCx', name: 'Complexidade', type: 'list', options: ops(['xBaixa', 'BAIXA'], ['xMedia', 'MÉDIA'], ['xAlta', 'ALTA']) },
  { id: 'cCx2', name: 'Complexidade (nova)', type: 'list', options: ops(['yAlta', 'ALTA'], ['yBaixa', 'BAIXA']) },
  { id: 'cRed', name: 'Redator', type: 'list', options: [] },
  { id: 'cEd', name: 'Editor', type: 'list', options: [] },
  { id: 'cProj', name: 'Projeto', type: 'text' },
  { id: 'cOut', name: 'Output', type: 'text' },
  { id: 'cBot', name: 'BOT', type: 'checkbox' },
  { id: 'cEnt', name: 'Entrada', type: 'date' },
];
/** O Portainer de hoje: a prioridade ALTA é a de 2025 (a primeira), a complexidade nas três opções. */
const PORTAINER = {
  CADASTRO_ADMINS: CHEFE,
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_LISTA_SP: 'lSP',
  TRELLO_SAIDA_SP: 'lSPs',
  TRELLO_CAMPO_PRACA: 'cPraca',
  TRELLO_PRACAS: 'SP=oSP,G5=oG5',
  TRELLO_CAMPO_PRIORIDADE: 'cPrio',
  TRELLO_PRIORIDADE_ALTA: 'pAlta',
  TRELLO_CAMPO_COMPLEXIDADE: 'cCx',
  TRELLO_COMPLEXIDADE_OPCOES: 'xBaixa,xMedia,xAlta',
  TRELLO_CAMPO_BOT: 'cBot',
  // a lista de prioridade do dia está no Postgres do Teable
  TEABLE_PG_ESQUEMA: 'promo',
  ...TEABLE_FALSO,
};

function trelloFalso() {
  const pedidos: string[] = [];
  const cards: { idList: string }[] = [];
  const itens: { card: string; campo: string; idValue: string }[] = [];
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    const rota = url.pathname.replace(/^\/1/, '');
    pedidos.push(`${metodo} ${rota}`);
    const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '', arrayBuffer: async () => new ArrayBuffer(4) });
    if (metodo === 'GET' && /^\/lists\/\w+$/.test(rota)) return ok({ id: rota.split('/')[2], idBoard: 'quadroFalso' });
    if (metodo === 'GET' && rota === '/boards/quadroFalso/lists') return ok(LISTAS);
    if (metodo === 'GET' && rota === '/boards/quadroFalso/customFields') return ok(CAMPOS);
    const item = rota.match(/^\/cards\/(\w+)\/customField\/(\w+)\/item$/);
    if (metodo === 'PUT' && item) itens.push({ card: item[1], campo: item[2], idValue: String(JSON.parse(String(init.body)).idValue ?? '') });
    if (rota === '/cards' && metodo === 'POST') {
      cards.push(JSON.parse(String(init.body)));
      return ok({ id: `card${cards.length}`, shortUrl: `https://trello.com/c/FALSO${cards.length}` });
    }
    if (metodo === 'GET') return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
    return ok({});
  };
  /** O que cada card levou no campo (o idValue), na ordem dos cards. */
  const noCampo = (campo: string) => itens.filter((i) => i.campo === campo).map((i) => `${i.card}:${i.idValue}`);
  return { buscar, pedidos, noCampo, listasDosCards: () => cards.map((c) => c.idList) };
}

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

async function comServidor(env: Record<string, string> = PORTAINER) {
  const falso = trelloFalso();
  // toda claquete está na lista de prioridade de hoje em diante (e nenhuma foi exibida)
  const consultar = async (sql: string, params: unknown[] = []) => (/"prioridade"/.test(sql) ? (params[0] as string[]).map((key) => ({ key, claquete: '' })) : []);
  const app = criarApp({ db: abrirBanco(':memory:'), env, buscarNoTeable: teableFalso({ prioridade: 'prioridade' }, { base: 'promo' }), trello: (e: Record<string, string>) => criarTrello(e, { buscar: falso.buscar, consultar }) });
  await app.tabelasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  fechar = async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await app.fechar();
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, corpo?: unknown) =>
    fetch(base + caminho, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  const chefe = como(CHEFE);
  let n = 0;
  /** Um roteiro de SP com uma arte de complexidade `cx`, enviado ao Trello. */
  const enviar = async (cx: 1 | 2 | 3) => {
    const id = `rot-card-${++n}`;
    await fetch(`${base}/api/roteiros/${id}`, {
      method: 'PUT',
      headers: { 'cf-access-authenticated-user-email': CHEFE, 'content-type': 'application/json' },
      body: JSON.stringify({ roteiro: { meta: { claquete: `FESTA ${n}/12 SP`, praca: 'SP' }, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }, nArtes: 1 }),
    });
    return chefe(`/api/roteiros/${id}/trello`, { artes: [{ texto: 'CARTELA', tipo: '', complexidade: cx }], texto: 'x' }).then((r) => r.json());
  };
  return { app, falso, chefe, ana: como(ANA), enviar };
}

interface SecaoCard {
  primeiraVez: boolean;
  salvo: LigacoesDoCard;
  proposta: LigacoesDoCard;
  estado: EstadoDoCard;
}
interface Conferencia {
  ok: boolean;
  itens: { tipo: string; titulo: string; detalhe: string }[];
  muda: { oque: string; antes: string; depois: string }[];
}
const lerCard = async (pedir: (caminho: string) => Promise<Response>) => ((await (await pedir('/api/configuracao')).json()) as { card: SecaoCard }).card;
const comIds = (c: LigacoesDoCard, ids: Record<string, string>, aMao: string[] = []): LigacoesDoCard => ({ ...c, ids: { ...c.ids, ...ids }, aMao: [...new Set([...c.aMao, ...aMao])] });

describe('a seção Card: o estado', () => {
  it('na primeira vez, começa com o Portainer; o resto liga pelo nome e pelo tipo; a ALTA em dobro só aparece quando vazia', async () => {
    const { chefe } = await comServidor();
    const s = await lerCard(chefe);
    expect(s.primeiraVez).toBe(true);
    expect(s.proposta.ids).toMatchObject({ prioridade: 'cPrio', 'prioridade.ALTA': 'pAlta', 'prioridade.MEDIA': 'pMedia', complexidade: 'cCx', redator: 'cRed', projeto: 'cProj', entrada: 'cEnt', vt: 'lVT' });
    // a ALTA do Portainer é uma das duas: o nome não a acharia sozinho, então fica ligada à mão
    expect(s.estado.excecoes.map((l) => `${l.chave}:${l.como}:${l.problema}`)).toEqual(['card.prioridade.ALTA:mao:']);
    expect(s.estado.resumo).toBe('tudo ligado · 1 à mão');

    const semAlta = await comServidor({ ...PORTAINER, TRELLO_PRIORIDADE_ALTA: '' });
    const s2 = await lerCard(semAlta.chefe);
    expect(s2.estado.excecoes.map((l) => [l.chave, l.problema, l.candidatos.join(',')])).toEqual([['card.prioridade.ALTA', 'dobro', 'pAlta,pAlta2']]);
    expect(s2.estado.resumo).toBe('1 em dobro');
  });

  it('só administradores', async () => {
    const { ana } = await comServidor();
    expect((await ana('/api/configuracao')).status).toBe(403);
    expect((await ana('/api/configuracao/salvar', { card: {} })).status).toBe(403);
  });
});

describe('a seção Card: conferir e salvar', () => {
  it('trocar o campo Complexidade limpa as opções dele: as do campo novo ligam pelo nome, a que falta fica pedindo', async () => {
    const { chefe, app } = await comServidor();
    const s = await lerCard(chefe);
    // só o campo muda: as opções que vieram são as do campo antigo
    const nova = comIds(s.proposta, { complexidade: 'cCx2' }, ['card.complexidade']);
    const conferido = (await (await chefe('/api/configuracao/conferir', { card: nova })).json()) as Conferencia;
    expect(conferido.ok).toBe(true);
    // o resto do que muda é o que o nome achou agora (o Portainer não tinha)
    expect(conferido.muda.filter((m) => m.oque.startsWith('Complexidade'))).toEqual([
      { oque: 'Complexidade', antes: 'Complexidade', depois: 'Complexidade (nova) (à mão)' },
      { oque: 'Complexidade BAIXA', antes: 'BAIXA', depois: 'BAIXA' },
      { oque: 'Complexidade MÉDIA', antes: 'MÉDIA', depois: '—' },
      { oque: 'Complexidade ALTA', antes: 'ALTA', depois: 'ALTA' },
    ]);
    expect(conferido.itens).toContainEqual({ tipo: 'aviso', titulo: 'Complexidade MÉDIA', detalhe: 'nada ligado: o card de complexidade MÉDIA vai sem ela.' });
    expect(app.modulos().env.TRELLO_CAMPO_COMPLEXIDADE).toBe('cCx');

    expect((await chefe('/api/configuracao/salvar', { card: nova })).status).toBe(200);
    expect(app.modulos().env.TRELLO_COMPLEXIDADE_OPCOES).toBe('yBaixa,,yAlta');
    const depois = await lerCard(chefe);
    expect(depois.primeiraVez).toBe(false);
    expect(depois.estado.excecoes.map((l) => `${l.chave}:${l.como}:${l.problema}`)).toEqual(['card.prioridade.ALTA:mao:', 'card.complexidade:mao:', 'card.complexidade.MEDIA::nenhum']);
  });

  it('o campo do tipo errado não passa na conferência: nada é salvo', async () => {
    const { chefe, app } = await comServidor();
    const s = await lerCard(chefe);
    const errada = comIds(s.proposta, { bot: 'cProj' }, ['card.bot']);
    const r = await chefe('/api/configuracao/salvar', { card: errada });
    expect(r.status).toBe(422);
    const { conferencia } = (await r.json()) as { conferencia: Conferencia };
    expect(conferencia.itens.filter((i) => i.tipo === 'erro')).toEqual([{ tipo: 'erro', titulo: 'BOT', detalhe: '"Projeto" não é caixa de marcar.' }]);
    expect(app.modulos().env.TRELLO_CAMPO_BOT).toBe('cBot');
  });

  it('salvar vale na hora: o próximo card sai com a ALTA escolhida e a complexidade nas opções do campo novo', async () => {
    const { chefe, falso, enviar } = await comServidor();
    expect((await enviar(3)).estado).toBe('enviado');
    const s = await lerCard(chefe);
    const nova = comIds(s.proposta, { 'prioridade.ALTA': 'pAlta2', complexidade: 'cCx2' }, ['card.prioridade.ALTA', 'card.complexidade']);
    expect((await chefe('/api/configuracao/salvar', { card: nova })).status).toBe(200);
    expect((await enviar(3)).estado).toBe('enviado');
    expect(falso.noCampo('cPrio')).toEqual(['card1:pAlta', 'card2:pAlta2']);
    expect(falso.noCampo('cCx')).toEqual(['card1:xAlta']);
    expect(falso.noCampo('cCx2')).toEqual(['card2:yAlta']);
  });

  it('salvar o card não desfaz o ligado à mão das praças, e salvar as praças não desfaz o do card', async () => {
    const { chefe } = await comServidor({ ...PORTAINER, TRELLO_LISTA_G5: 'lSP' });
    const antes = ((await (await chefe('/api/configuracao')).json()) as { pracas: { proposta: { aMao: string[] } } }).pracas.proposta;
    expect(antes.aMao).toEqual(['G5.entrada']);
    const s = await lerCard(chefe);
    expect((await chefe('/api/configuracao/salvar', { card: comIds(s.proposta, { editor: '' }) })).status).toBe(200);
    const tudo = (await (await chefe('/api/configuracao')).json()) as { pracas: { proposta: { aMao: string[] } }; card: SecaoCard };
    expect(tudo.pracas.proposta.aMao).toEqual(['G5.entrada']);
    expect((await chefe('/api/configuracao/salvar', { pracas: tudo.pracas.proposta })).status).toBe(200);
    const fim = (await (await chefe('/api/configuracao')).json()) as { pracas: { salvo: { aMao: string[] } }; card: SecaoCard };
    expect(fim.pracas.salvo.aMao).toEqual(['G5.entrada']);
    expect(fim.card.salvo.aMao).toEqual(['card.prioridade.ALTA']);
    expect(fim.card.salvo.ids.editor).toBe('');
  });

  it('um card com id inválido é recusado', async () => {
    const { chefe } = await comServidor();
    const s = await lerCard(chefe);
    expect((await chefe('/api/configuracao/salvar', { card: comIds(s.proposta, { bot: 'a b/c' }) })).status).toBe(400);
  });
});
