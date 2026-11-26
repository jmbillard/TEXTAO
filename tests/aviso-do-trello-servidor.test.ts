// @vitest-environment node
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* O Trello avisa o PROMeiro direto (#87): a rota do aviso é pública (fora do Cloudflare Access), e só o aviso assinado
   com o segredo da aplicação do Trello é aceito. Card novo vira Produção, mudar de lista muda a etapa, arquivar
   arquiva; o mesmo aviso duas vezes não duplica. O PROMeiro registra o webhook no quadro (e re-registra se o Trello
   desligou). Trello e Teable de mentira: ids, nomes e segredos inventados. */

const CHEFE = 'chefe@empresa.com';
const SEGREDO = 'segredo-de-mentira';
const PROMEIRO = 'https://promeiro.exemplo.com';
const ROTA = '/api/trello/aviso';
const CALLBACK = `${PROMEIRO}${ROTA}`;
const QUADRO = 'quadroFalso';
const ENV = {
  CADASTRO_ADMINS: CHEFE,
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_QUADRO: QUADRO,
  TRELLO_LISTA_SP: 'lEntradaSP',
  TRELLO_SAIDA_SP: 'lSaidaSP',
  TRELLO_LISTA_ENTREGUES: 'lEntregues',
  TRELLO_SEGREDO: SEGREDO,
  PROMEIRO_URL: `${PROMEIRO}/`,
  ...TEABLE_FALSO,
  TEABLE_PG_URL: 'postgres://falso',
  TEABLE_PG_ESQUEMA: 'bseFalso',
};

type Webhook = { id: string; callbackURL: string; idModel: string; active: boolean; description?: string };
function trelloFalso(webhooks: Webhook[] = []) {
  const pedidos: string[] = [];
  const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => JSON.stringify(dados) });
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    const rota = url.pathname.replace(/^\/1/, '');
    pedidos.push(`${metodo} ${rota}`);
    if (metodo === 'GET' && rota === '/tokens/t/webhooks') return ok(webhooks);
    if (metodo === 'POST' && rota === '/webhooks') {
      const corpo = JSON.parse(String(init.body));
      const novo = { id: `webhook${webhooks.length + 1}`, active: true, ...corpo };
      webhooks.push(novo);
      return ok(novo);
    }
    const um = /^\/webhooks\/(\w+)$/.exec(rota);
    if (um && metodo === 'PUT') {
      const w = webhooks.find((x) => x.id === um[1]);
      Object.assign(w ?? {}, JSON.parse(String(init.body)));
      return ok(w);
    }
    if (um && metodo === 'DELETE') {
      webhooks.splice(webhooks.findIndex((x) => x.id === um[1]), 1);
      return ok({});
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
  };
  return { buscar, pedidos, webhooks };
}

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function comServidor({ env = ENV as Record<string, string>, webhooks = [] as Webhook[], producaoDaArte = [] as { id: string; fields: Record<string, unknown> }[] } = {}) {
  const falso = trelloFalso(webhooks);
  const teable = teableFalso({ ARTE_producao: 'arte_producao_pg' }, { registros: { ARTE_producao: producaoDaArte } });
  const app = criarApp({ db: abrirBanco(':memory:'), env, buscarNoTeable: teable, abrirPg: teable.abrirPg, esperaDoAviso: 0, trello: (e: Record<string, string>) => criarTrello(e, { buscar: falso.buscar, consultar: teable.consultar }) });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  await app.tabelasProntas;
  await app.avisoPronto;
  /** O Trello avisando: o corpo, assinado com o segredo (ou com a assinatura dada). */
  const avisar = (corpo: unknown, assinatura: string | null = assinar(JSON.stringify(corpo))) =>
    fetch(base + ROTA, { method: 'POST', body: JSON.stringify(corpo), headers: { 'content-type': 'application/json', ...(assinatura === null ? {} : { 'x-trello-webhook': assinatura }) } });
  const chefe = (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': CHEFE, ...init.headers } });
  const doCard = async (card: string) => {
    await app.avisosEmDia();
    return ((await (await chefe(`/api/producoes?card=${card}`)).json()) as { producoes: Producao[] }).producoes;
  };
  return { app, base, falso, teable, avisar, chefe, doCard };
}
type Producao = { id: string; claquete: string; praca: string; etapa: string; arquivada: boolean; cardId: string; teableRegistro: string | null; entradaEm: string | null; entregaEm: string | null; eventos: { tipo: string; antes: string | null; depois: string; quem: { id: string; nome: string } | null; quando: string; acao: string }[] };

const assinar = (corpo: string, segredo = SEGREDO) => createHmac('sha1', segredo).update(corpo + CALLBACK).digest('base64');
const QUEM = { id: 'membroUm', fullName: 'Designer Um', username: 'designerum' };
let n = 0;
const aviso = (type: string, data: Record<string, unknown>, date = '2026-11-26T12:40:00.000Z') => ({
  action: { id: `acao${++n}`, type, date, idMemberCreator: QUEM.id, memberCreator: QUEM, data: { board: { id: QUADRO, name: 'Quadro de teste' }, ...data } },
  model: { id: QUADRO, name: 'Quadro de teste' },
});
const criado = (card: string, nome = 'Show da Noite 20/11 SP', lista = 'lEntradaSP') => aviso('createCard', { card: { id: card, name: nome }, list: { id: lista } });
const moveu = (card: string, de: string, para: string, date?: string) => aviso('updateCard', { card: { id: card, idList: para }, old: { idList: de }, listBefore: { id: de }, listAfter: { id: para } }, date);

describe('a rota do aviso do Trello', () => {
  it('responde 200 ao HEAD (é como o Trello confere o endereço), sem login', async () => {
    const { base } = await comServidor();
    expect((await fetch(base + ROTA, { method: 'HEAD' })).status).toBe(200);
  });

  it('o que está embaixo da rota (que o Bypass do Access também deixa passar) não chega às rotas com login', async () => {
    const { base } = await comServidor();
    const r = await fetch(`${base}${ROTA}/producoes`, { headers: { 'cf-access-authenticated-user-email': CHEFE } });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ erro: 'Não encontrado.' });
  });

  it('recusa (401) o aviso sem assinatura ou com a assinatura errada, sem processar', async () => {
    const { avisar, doCard } = await comServidor();
    expect((await avisar(criado('cardSemAssinatura'), null)).status).toBe(401);
    expect((await avisar(criado('cardAssinadoErrado'), assinar('{}', 'outro-segredo'))).status).toBe(401);
    expect((await avisar(criado('cardTruncado'), 'curta')).status).toBe(401);
    expect(await doCard('cardSemAssinatura')).toEqual([]);
    expect(await doCard('cardAssinadoErrado')).toEqual([]);
  });

  it('recusa o corpo grande demais (413) e sem o segredo configurado não aceita nada', async () => {
    const { base } = await comServidor();
    const grande = JSON.stringify({ action: { id: 'x', data: { texto: 'a'.repeat(300 * 1024) } } });
    expect((await fetch(base + ROTA, { method: 'POST', body: grande, headers: { 'x-trello-webhook': assinar(grande) } })).status).toBe(413);
    await parar?.();
    const sem = await comServidor({ env: { ...ENV, TRELLO_SEGREDO: '' } });
    expect((await sem.avisar(criado('cardSemSegredo'))).status).toBe(503);
    expect(await sem.doCard('cardSemSegredo')).toEqual([]);
  });

  it('card novo no quadro vira Produção, com o evento "criada" (quem, quando, o id da ação)', async () => {
    const { avisar, doCard } = await comServidor();
    const corpo = criado('cardUm');
    expect((await avisar(corpo)).status).toBe(200);
    const [p] = await doCard('cardUm');
    expect(p).toMatchObject({ claquete: 'Show da Noite 20/11 SP', praca: 'SP', etapa: 'entrada', arquivada: false, cardId: 'cardUm', teableRegistro: null, entradaEm: '2026-11-26T12:40:00.000Z' });
    expect(p.eventos).toEqual([{ tipo: 'criada', antes: null, depois: 'entrada', quem: { id: 'membroUm', nome: 'Designer Um' }, quando: '2026-11-26T12:40:00.000Z', acao: corpo.action.id }]);
  });

  it('aceita a assinatura com acento no corpo (o nome do card)', async () => {
    const { avisar, doCard } = await comServidor();
    expect((await avisar(criado('cardAcento', 'Coração de Mãe 20/11'))).status).toBe(200);
    expect((await doCard('cardAcento'))[0]).toMatchObject({ claquete: 'Coração de Mãe 20/11' });
  });

  it('mudar de lista muda a etapa e anota o evento antes → depois; arquivar e desarquivar também', async () => {
    const { avisar, doCard } = await comServidor();
    await avisar(criado('cardDois'));
    await avisar(moveu('cardDois', 'lEntradaSP', 'lProduzindo', '2026-11-26T13:00:00.000Z'));
    expect((await doCard('cardDois'))[0]).toMatchObject({ etapa: 'produzindo', entregaEm: null });
    await avisar(moveu('cardDois', 'lProduzindo', 'lSaidaSP', '2026-11-26T15:20:00.000Z'));
    const [entregue] = await doCard('cardDois');
    expect(entregue).toMatchObject({ etapa: 'entregue', entregaEm: '2026-11-26T15:20:00.000Z' });
    expect(entregue.eventos.map((e) => [e.tipo, e.antes, e.depois])).toEqual([
      ['criada', null, 'entrada'],
      ['etapa', 'entrada', 'produzindo'],
      ['etapa', 'produzindo', 'entregue'],
    ]);
    await avisar(aviso('updateCard', { card: { id: 'cardDois', closed: true }, old: { closed: false }, list: { id: 'lSaidaSP' } }, '2026-11-27T09:00:00.000Z'));
    expect((await doCard('cardDois'))[0]).toMatchObject({ etapa: 'arquivada', arquivada: true });
    await avisar(aviso('updateCard', { card: { id: 'cardDois', closed: false }, old: { closed: true }, list: { id: 'lSaidaSP' } }, '2026-11-27T10:00:00.000Z'));
    const [devolta] = await doCard('cardDois');
    expect(devolta).toMatchObject({ etapa: 'entregue', arquivada: false });
    expect(devolta.eventos.slice(-2).map((e) => [e.tipo, e.antes, e.depois])).toEqual([
      ['arquivada', 'entregue', 'arquivada'],
      ['desarquivada', 'arquivada', 'entregue'],
    ]);
  });

  it('o mesmo aviso duas vezes não duplica a Produção nem o evento', async () => {
    const { avisar, doCard } = await comServidor();
    const corpo = criado('cardTres');
    await avisar(corpo);
    await avisar(corpo);
    const mudanca = moveu('cardTres', 'lEntradaSP', 'lProduzindo');
    await avisar(mudanca);
    await avisar(mudanca);
    const producoes = await doCard('cardTres');
    expect(producoes).toHaveLength(1);
    expect(producoes[0].eventos.map((e) => e.tipo)).toEqual(['criada', 'etapa']);
  });

  it('um aviso atrasado (mais velho que o último evento) fica no histórico, mas não volta a etapa', async () => {
    const { avisar, doCard } = await comServidor();
    await avisar(criado('cardAtrasado'));
    await avisar(moveu('cardAtrasado', 'lProduzindo', 'lSaidaSP', '2026-11-26T15:00:00.000Z'));
    await avisar(moveu('cardAtrasado', 'lEntradaSP', 'lProduzindo', '2026-11-26T13:00:00.000Z'));
    const [p] = await doCard('cardAtrasado');
    expect(p.etapa).toBe('entregue');
    expect(p.eventos.map((e) => e.depois)).toEqual(['entrada', 'produzindo', 'entregue']);
  });

  it('aviso de card fora do domínio é ignorado: outro quadro, ou card que não é Produção', async () => {
    const { avisar, doCard } = await comServidor();
    const deFora = criado('cardDeFora');
    deFora.action.data.board = { id: 'outroQuadro', name: 'Outro' };
    expect((await avisar(deFora)).status).toBe(200);
    expect(await doCard('cardDeFora')).toEqual([]);
    // um card velho do quadro, que nunca foi Produção, mudou de lista
    await avisar(moveu('cardVelho', 'lEntradaSP', 'lSaidaSP'));
    expect(await doCard('cardVelho')).toEqual([]);
    // corpo que nem é JSON (assinado): 200 ao Trello, nada processado
    expect((await avisar('não é um aviso')).status).toBe(200);
  });

  it('a carga do Teable depois do card novo fica na mesma Produção (não duplica pelo card)', async () => {
    const linhas: { id: string; fields: Record<string, unknown> }[] = [];
    const { avisar, doCard, chefe } = await comServidor({ producaoDaArte: linhas });
    await avisar(criado('cardQuatro'));
    const [antes] = await doCard('cardQuatro');
    linhas.push({ id: 'recQuatro', fields: { card_ID: 'cardQuatro', claquete: 'Show da Noite 20/11 SP', designers: '["Designer Um"]', data_entrada: '2026-11-26T12:41:00.000Z' } });
    expect((await chefe('/api/producoes/recarregar', { method: 'POST' })).status).toBe(200);
    const depois = await doCard('cardQuatro');
    expect(depois).toHaveLength(1);
    expect(depois[0]).toMatchObject({ id: antes.id, teableRegistro: 'recQuatro', etapa: 'produzindo' });
    expect(depois[0].eventos.map((e) => e.tipo)).toEqual(['criada']);
  });
});

describe('o registro do webhook no Trello', () => {
  it('na subida, sem webhook do PROMeiro no quadro, registra um (callbackURL = PROMEIRO_URL + a rota, idModel = o quadro)', async () => {
    const { falso } = await comServidor();
    expect(falso.webhooks).toMatchObject([{ callbackURL: CALLBACK, idModel: QUADRO, active: true }]);
    expect(falso.pedidos.filter((p) => p === 'POST /webhooks')).toHaveLength(1);
  });

  it('com o webhook já registrado e ativo, não duplica', async () => {
    const { falso, app } = await comServidor({ webhooks: [{ id: 'webhookVelho', callbackURL: CALLBACK, idModel: QUADRO, active: true }] });
    await app.garantirOAviso();
    expect(falso.webhooks).toHaveLength(1);
    expect(falso.pedidos.filter((p) => !p.startsWith('GET'))).toEqual([]);
  });

  it('o Trello desligou o webhook (inativo): liga de novo; sumiu: registra de novo', async () => {
    const { falso, app } = await comServidor({ webhooks: [{ id: 'webhookVelho', callbackURL: CALLBACK, idModel: QUADRO, active: false }] });
    expect(falso.webhooks).toMatchObject([{ id: 'webhookVelho', active: true }]);
    expect(falso.pedidos).toContain('PUT /webhooks/webhookVelho');
    falso.webhooks.splice(0);
    await app.garantirOAviso();
    expect(falso.webhooks).toMatchObject([{ callbackURL: CALLBACK, idModel: QUADRO, active: true }]);
  });

  it('o webhook do PROMeiro num quadro antigo sai; o de outro endereço (de outra aplicação) fica', async () => {
    const outro = { id: 'webhookDeOutro', callbackURL: 'https://outra.exemplo.com/aviso', idModel: QUADRO, active: true };
    const { falso } = await comServidor({ webhooks: [{ id: 'webhookAntigo', callbackURL: CALLBACK, idModel: 'quadroAntigo', active: true }, outro] });
    expect(falso.webhooks.map((w) => [w.id === 'webhookDeOutro' ? w.id : 'novo', w.idModel])).toEqual([
      ['webhookDeOutro', QUADRO],
      ['novo', QUADRO],
    ]);
  });

  it('sem PROMEIRO_URL, sem TRELLO_SEGREDO ou sem o quadro, não registra nada', async () => {
    for (const falta of ['PROMEIRO_URL', 'TRELLO_SEGREDO', 'TRELLO_QUADRO']) {
      const { falso } = await comServidor({ env: { ...ENV, [falta]: '' } });
      expect(falso.pedidos.filter((p) => p.includes('webhooks'))).toEqual([]);
      await parar?.();
      parar = null;
    }
  });
});
