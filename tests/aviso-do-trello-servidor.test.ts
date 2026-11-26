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
   desligou). Desligado por padrão (ADR 0006: por enquanto o PROMeiro só escreve no Trello e lê do Teable): estes
   testes ligam com TRELLO_AVISO=1, e os do fim conferem que, sem ele, nada é lido do Trello e a rota não existe.
   Trello e Teable de mentira: ids, nomes e segredos inventados. */

const CHEFE = 'chefe@empresa.com';
const SEGREDO = 'segredo-de-mentira';
const PROMEIRO = 'https://promeiro.exemplo.com';
const ROTA = '/api/trello/aviso';
const CALLBACK = `${PROMEIRO}${ROTA}`;
const QUADRO = 'quadroFalso';
const ENV = {
  TRELLO_AVISO: '1',
  CADASTRO_ADMINS: CHEFE,
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_QUADRO: QUADRO,
  TRELLO_LISTA_SP: 'lEntradaSP',
  TRELLO_SAIDA_SP: 'lSaidaSP',
  TRELLO_LISTA_ENTREGUES: 'lEntregues',
  TRELLO_PRACAS: 'SP=opSP,RJ=opRJ',
  TRELLO_CAMPO_PRACA: 'campoPraca',
  TRELLO_CAMPO_PRIORIDADE: 'campoPrioridade',
  TRELLO_PRIORIDADE_ALTA: 'opAlta',
  TRELLO_PRIORIDADE_MEDIA: 'opMedia',
  TRELLO_CAMPO_COMPLEXIDADE: 'campoComplexidade',
  TRELLO_COMPLEXIDADE_OPCOES: 'opBaixa,opMediaC,opAltaC',
  TRELLO_SEGREDO: SEGREDO,
  PROMEIRO_URL: `${PROMEIRO}/`,
  ...TEABLE_FALSO,
  TEABLE_PG_URL: 'postgres://falso',
  TEABLE_PG_ESQUEMA: 'bseFalso',
};

type Webhook = { id: string; callbackURL: string; idModel: string; active: boolean; description?: string };
type Acao = { id: string; type: string; date: string; [k: string]: unknown };
/** O Trello de mentira: os webhooks do token, as ações do quadro (da mais nova à mais velha, com since, before, limit
    e filter, como o Trello) e os membros do quadro. */
function trelloFalso(webhooks: Webhook[] = [], acoes: Acao[] = [], membros: { id: string; fullName: string }[] = []) {
  const pedidos: string[] = [];
  const leiturasDasAcoes: URLSearchParams[] = [];
  const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => JSON.stringify(dados) });
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    const rota = url.pathname.replace(/^\/1/, '');
    pedidos.push(`${metodo} ${rota}`);
    if (metodo === 'GET' && rota === '/tokens/t/webhooks') return ok(webhooks);
    if (metodo === 'GET' && rota === `/boards/${QUADRO}/members`) return ok(membros);
    if (metodo === 'GET' && rota === `/boards/${QUADRO}/actions`) {
      const p = url.searchParams;
      leiturasDasAcoes.push(p);
      const tipos = (p.get('filter') ?? '').split(',').filter(Boolean);
      let lista = [...acoes].sort((a, b) => (a.date < b.date ? 1 : -1)).filter((a) => (!tipos.length || tipos.includes(a.type)) && (!p.get('since') || a.date >= String(p.get('since'))));
      const antes = p.get('before');
      if (antes) lista = lista.slice(lista.findIndex((a) => a.id === antes) + 1);
      return ok(lista.slice(0, Number(p.get('limit') ?? 50)));
    }
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
  return { buscar, pedidos, webhooks, acoes, leiturasDasAcoes };
}

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

type Linha = { id: string; fields: Record<string, unknown> };
async function comServidor({
  env = ENV as Record<string, string>,
  webhooks = [] as Webhook[],
  producaoDaArte = [] as Linha[],
  acoes = [] as Acao[],
  membros = [] as { id: string; fullName: string }[],
  designers = [] as Linha[],
  db = abrirBanco(':memory:'),
  recuperacao = undefined as { porPagina?: number; paginas?: number; dias?: number } | undefined,
} = {}) {
  const falso = trelloFalso(webhooks, acoes, membros);
  const teable = teableFalso({ ARTE_producao: 'arte_producao_pg', designers: 'designers_pg' }, { registros: { ARTE_producao: producaoDaArte, designers } });
  const app = criarApp({ db, env, buscarNoTeable: teable, abrirPg: teable.abrirPg, esperaDoAviso: 0, recuperacao, trello: (e: Record<string, string>) => criarTrello(e, { buscar: falso.buscar, consultar: teable.consultar }) });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  await app.tabelasProntas;
  await app.pessoasProntas;
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
type Producao = {
  id: string;
  claquete: string;
  praca: string;
  etapa: string;
  arquivada: boolean;
  cardId: string;
  teableRegistro: string | null;
  entradaEm: string | null;
  entregaEm: string | null;
  designers: string[];
  artesMarcadas: string[];
  eventos: { tipo: string; campo?: string; antes: string | null; depois: string | null; quem: { id: string; nome: string } | null; quando: string; acao: string }[];
};

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

/* #88: os outros eventos pela rota (designer, arte, campos) e a recuperação do que faltou (as ações do quadro desde o
   último evento, pela mesma tradução, sem duplicar). */

const membro = (card: string, tipo: 'addMemberToCard' | 'removeMemberFromCard', id: string, nome: string, date?: string) => aviso(tipo, { card: { id: card }, idMember: id, member: { id, name: nome } }, date);
const arte = (card: string, nome: string, state: 'complete' | 'incomplete', date?: string) => aviso('updateCheckItemStateOnCard', { card: { id: card }, checklist: { id: 'lista' }, checkItem: { id: `item-${nome}`, name: nome, state } }, date);
const campo = (card: string, idCampo: string, idValue: string | null, velho: string | null, date?: string) =>
  aviso('updateCustomFieldItem', { card: { id: card }, customField: { id: idCampo, type: 'list' }, customFieldItem: { idCustomField: idCampo, idModel: card, idValue }, old: { idValue: velho } }, date);

describe('os outros eventos pelo aviso assinado (#88)', () => {
  it('designer entra e sai: a Produção guarda o designer (pelo nome da tabela designers, ligado pelo id do Trello)', async () => {
    const { avisar, doCard } = await comServidor({
      membros: [{ id: 'membroDois', fullName: 'rafa no trello' }],
      designers: [{ id: 'recRafa', fields: { designer: 'Rafaela Designer', status: 'ativo', designer_ID: 'membroDois' } }],
    });
    await avisar(criado('cardD'));
    await avisar(membro('cardD', 'addMemberToCard', 'membroDois', 'rafa no trello', '2026-11-26T13:00:00.000Z'));
    await avisar(membro('cardD', 'addMemberToCard', 'membroSemCadastro', 'Pessoa Nova', '2026-11-26T13:05:00.000Z'));
    expect((await doCard('cardD'))[0].designers).toEqual(['Rafaela Designer', 'Pessoa Nova']);
    await avisar(membro('cardD', 'removeMemberFromCard', 'membroDois', 'rafa no trello', '2026-11-26T14:00:00.000Z'));
    const [p] = await doCard('cardD');
    expect(p.designers).toEqual(['Pessoa Nova']);
    expect(p.eventos.slice(1).map((e) => [e.tipo, e.antes, e.depois])).toEqual([
      ['designer-entrou', null, 'Rafaela Designer'],
      ['designer-entrou', null, 'Pessoa Nova'],
      ['designer-saiu', 'Rafaela Designer', null],
    ]);
  });

  it('arte marcada e desmarcada: a Produção guarda as artes marcadas', async () => {
    const { avisar, doCard } = await comServidor();
    await avisar(criado('cardA'));
    await avisar(arte('cardA', 'GC SHOW', 'complete', '2026-11-26T13:00:00.000Z'));
    await avisar(arte('cardA', 'LETTERING SHOW', 'complete', '2026-11-26T13:10:00.000Z'));
    await avisar(arte('cardA', 'GC SHOW', 'incomplete', '2026-11-26T13:20:00.000Z'));
    const [p] = await doCard('cardA');
    expect(p.artesMarcadas).toEqual(['LETTERING SHOW']);
    expect(p.eventos.slice(1).map((e) => [e.tipo, e.antes, e.depois])).toEqual([
      ['arte-marcada', null, 'GC SHOW'],
      ['arte-marcada', null, 'LETTERING SHOW'],
      ['arte-desmarcada', 'GC SHOW', null],
    ]);
  });

  it('prioridade, complexidade e praça mudadas viram "campo mudado" pelo nome da opção; a praça muda a Produção', async () => {
    const { avisar, doCard } = await comServidor();
    await avisar(criado('cardC'));
    await avisar(campo('cardC', 'campoPrioridade', 'opAlta', null, '2026-11-26T13:00:00.000Z'));
    await avisar(campo('cardC', 'campoComplexidade', 'opAltaC', 'opBaixa', '2026-11-26T13:01:00.000Z'));
    await avisar(campo('cardC', 'campoPraca', 'opRJ', 'opSP', '2026-11-26T13:02:00.000Z'));
    // um campo que não está ligado (o output) não é evento
    await avisar(campo('cardC', 'campoDoOutput', 'qualquer', null, '2026-11-26T13:03:00.000Z'));
    const [p] = await doCard('cardC');
    expect(p.praca).toBe('RJ');
    expect(p.eventos.slice(1).map((e) => [e.tipo, e.campo, e.antes, e.depois])).toEqual([
      ['campo', 'prioridade', null, 'ALTA'],
      ['campo', 'complexidade', 'BAIXA', 'ALTA'],
      ['campo', 'praca', 'SP', 'RJ'],
    ]);
  });

  it('o prazo de entrega mudado vira "campo mudado: entrega"; a entrega concluída é a etapa Entregue', async () => {
    const { avisar, doCard } = await comServidor();
    await avisar(criado('cardE'));
    await avisar(aviso('updateCard', { card: { id: 'cardE', due: '2026-11-28T03:00:00.000Z' }, old: { due: null }, list: { id: 'lEntradaSP' } }, '2026-11-26T13:00:00.000Z'));
    await avisar(aviso('updateCard', { card: { id: 'cardE', dueComplete: true }, old: { dueComplete: false }, list: { id: 'lProduzindo' } }, '2026-11-26T16:00:00.000Z'));
    const [p] = await doCard('cardE');
    expect(p).toMatchObject({ etapa: 'entregue', entregaEm: '2026-11-26T16:00:00.000Z' });
    expect(p.eventos.slice(1).map((e) => [e.tipo, e.campo ?? null, e.antes, e.depois])).toEqual([
      ['campo', 'entrega', null, '2026-11-28T03:00:00.000Z'],
      ['etapa', null, 'produzindo', 'entregue'],
    ]);
  });

  it('o aviso atrasado de um designer não desfaz o mais novo (a ordem vale para o mesmo designer)', async () => {
    const { avisar, doCard } = await comServidor();
    await avisar(criado('cardOrdem'));
    await avisar(membro('cardOrdem', 'removeMemberFromCard', 'membroX', 'Fulano', '2026-11-26T15:00:00.000Z'));
    await avisar(membro('cardOrdem', 'addMemberToCard', 'membroX', 'Fulano', '2026-11-26T14:00:00.000Z'));
    // a etapa não depende dos eventos do designer
    await avisar(moveu('cardOrdem', 'lEntradaSP', 'lProduzindo', '2026-11-26T14:30:00.000Z'));
    const [p] = await doCard('cardOrdem');
    expect(p.designers).toEqual([]);
    expect(p.etapa).toBe('produzindo');
  });
});

describe('recuperar o que faltou (#88): as ações do quadro desde o último evento', () => {
  const acaoDoQuadro = (id: string, type: string, date: string, data: Record<string, unknown>): Acao => ({ id, type, date, idMemberCreator: QUEM.id, memberCreator: QUEM, data: { board: { id: QUADRO }, ...data } });

  it('na subida, lê as ações perdidas e anota pela mesma tradução nas Produções que já existem, sem duplicar', async () => {
    const agora = Date.now();
    const ha = (min: number) => new Date(agora - min * 60_000).toISOString();
    const acoes = [
      acaoDoQuadro('perdida1', 'createCard', ha(60), { card: { id: 'cardFora', name: 'Novela das Nove 21/11 SP' }, list: { id: 'lEntradaSP' } }),
      acaoDoQuadro('perdida2', 'addMemberToCard', ha(50), { card: { id: 'cardFora' }, idMember: 'membroX', member: { id: 'membroX', name: 'Fulano' } }),
      acaoDoQuadro('perdida3', 'updateCard', ha(40), { card: { id: 'cardFora', idList: 'lSaidaSP' }, old: { idList: 'lEntradaSP' }, listBefore: { id: 'lEntradaSP' }, listAfter: { id: 'lSaidaSP' } }),
      // de um card que nunca foi Produção: ignorada
      acaoDoQuadro('perdida4', 'updateCard', ha(30), { card: { id: 'cardLixo', idList: 'lSaidaSP' }, listBefore: { id: 'lEntradaSP' }, listAfter: { id: 'lSaidaSP' } }),
    ];
    // a Produção do cardFora veio da carga do Teable
    const producaoDaArte = [{ id: 'recFora', fields: { card_ID: 'cardFora', claquete: 'Novela das Nove 21/11 SP', data_entrada: ha(61) } }];
    const { app, doCard, falso } = await comServidor({ acoes, producaoDaArte });
    await app.recuperacaoPronta;
    const [p] = await doCard('cardFora');
    expect(p).toMatchObject({ claquete: 'Novela das Nove 21/11 SP', teableRegistro: 'recFora', etapa: 'entregue', designers: ['Fulano'] });
    expect(p.eventos.map((e) => e.acao)).toEqual(['perdida1', 'perdida2', 'perdida3']);
    expect(await doCard('cardLixo')).toEqual([]);
    // só os tipos que a tradução lê
    expect(falso.leiturasDasAcoes[0].get('filter')?.split(',')).toEqual(expect.arrayContaining(['createCard', 'updateCard', 'addMemberToCard', 'removeMemberFromCard', 'updateCheckItemStateOnCard', 'updateCustomFieldItem']));
    // de novo (a conferência de hora em hora): as mesmas ações não duplicam
    const r = await app.recuperarOQueFaltou();
    expect(r).toMatchObject({ anotados: 0 });
    expect((await doCard('cardFora'))[0].eventos).toHaveLength(3);
  });

  it('a recuperação não cria Produção: o card novo lido do quadro é ignorado (com o que veio depois); o mesmo card pelo aviso ao vivo vira Produção', async () => {
    const agora = Date.now();
    const ha = (min: number) => new Date(agora - min * 60_000).toISOString();
    const criacao = acaoDoQuadro('soNoQuadro', 'createCard', ha(20), { card: { id: 'cardAvulso', name: 'Card Avulso 21/11 SP' }, list: { id: 'lEntradaSP' } });
    const acoes = [
      criacao,
      acaoDoQuadro('soNoQuadro2', 'copyCard', ha(15), { card: { id: 'cardCopiado', name: 'Cópia Avulsa 21/11 SP' }, list: { id: 'lEntradaSP' } }),
      acaoDoQuadro('soNoQuadro3', 'addMemberToCard', ha(10), { card: { id: 'cardAvulso' }, idMember: 'membroX', member: { id: 'membroX', name: 'Fulano' } }),
    ];
    const { app, avisar, doCard } = await comServidor({ acoes });
    const r = await app.recuperacaoPronta;
    expect(r).toMatchObject({ lidas: 3, anotados: 0 });
    expect(await doCard('cardAvulso')).toEqual([]);
    expect(await doCard('cardCopiado')).toEqual([]);
    // a mesma criação pelo aviso ao vivo
    expect((await avisar({ action: criacao, model: { id: QUADRO } })).status).toBe(200);
    const [p] = await doCard('cardAvulso');
    expect(p).toMatchObject({ claquete: 'Card Avulso 21/11 SP', etapa: 'entrada', teableRegistro: null });
    expect(p.eventos.map((e) => [e.tipo, e.acao])).toEqual([['criada', 'soNoQuadro']]);
  });

  it('pede desde o último evento guardado e pagina (before = a mais velha da página) até acabar', async () => {
    const db = abrirBanco(':memory:');
    const primeira = await comServidor({ db, acoes: [] });
    await primeira.avisar(criado('cardP', 'Show da Noite 20/11 SP'));
    await primeira.app.avisosEmDia();
    const ultimo = '2026-11-26T12:40:00.000Z';
    await parar?.();
    parar = null;
    // enquanto o PROMeiro esteve fora: 5 mudanças de designer, lidas de 2 em 2
    const acoes = [1, 2, 3, 4, 5].map((i) => acaoDoQuadro(`fora${i}`, 'addMemberToCard', `2026-11-26T13:0${i}:00.000Z`, { card: { id: 'cardP' }, idMember: `m${i}`, member: { id: `m${i}`, name: `Pessoa ${i}` } }));
    const { app, doCard, falso } = await comServidor({ db, acoes, recuperacao: { porPagina: 2, paginas: 10, dias: 36500 } });
    await app.recuperacaoPronta;
    expect(falso.leiturasDasAcoes.map((p) => [p.get('since'), p.get('before'), p.get('limit')])).toEqual([
      [ultimo, null, '2'],
      [ultimo, 'fora4', '2'],
      [ultimo, 'fora2', '2'],
    ]);
    expect((await doCard('cardP'))[0].designers).toEqual(['Pessoa 1', 'Pessoa 2', 'Pessoa 3', 'Pessoa 4', 'Pessoa 5']);
  });

  it('respeita a janela (nunca antes de N dias) e o limite de páginas', async () => {
    const acoes = [1, 2, 3, 4, 5].map((i) => acaoDoQuadro(`velha${i}`, 'createCard', new Date(Date.now() - i * 60_000).toISOString(), { card: { id: `cardJ${i}`, name: `Card ${i} SP` }, list: { id: 'lEntradaSP' } }));
    const antes = Date.now();
    // as Produções dos cards vieram da carga do Teable (a recuperação não cria Produção)
    const producaoDaArte = [1, 2, 3, 4, 5].map((i) => ({ id: `recJ${i}`, fields: { card_ID: `cardJ${i}`, claquete: `Card ${i} SP` } }));
    const { app, falso, doCard } = await comServidor({ acoes, producaoDaArte, recuperacao: { porPagina: 2, paginas: 2, dias: 30 } });
    const r = await app.recuperacaoPronta;
    // sem evento guardado, desde 30 dias atrás
    const desde = new Date(String(falso.leiturasDasAcoes[0].get('since'))).getTime();
    expect(Math.abs(desde - (antes - 30 * 24 * 60 * 60 * 1000))).toBeLessThan(60_000);
    // 2 páginas de 2: as 4 mais novas; a quinta fica de fora (e a recuperação diz que parou no limite)
    expect(falso.leiturasDasAcoes).toHaveLength(2);
    expect(r).toMatchObject({ lidas: 4, noLimite: true });
    expect((await doCard('cardJ1'))[0].eventos.map((e) => e.acao)).toEqual(['velha1']);
    expect((await doCard('cardJ5'))[0].eventos).toEqual([]);
  });
});

/* A Linha do tempo (#89): a leitura dos eventos de uma Produção, pelo card ou pelo id da Produção, para qualquer pessoa
   logada (é só leitura do trabalho, como o card no Trello que a equipe toda vê). Sem os ids do Trello. */
describe('a rota da linha do tempo', () => {
  const ana = (base: string) => (caminho: string) => fetch(base + caminho, { headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com' } });
  type Linha = { producao: { id: string; claquete: string; etapa: string; entradaEm: string | null; entregaEm: string | null; artes: string[]; artesQuantidade: number | null; arquivada: boolean } | null; eventos: Record<string, unknown>[] };

  it('qualquer pessoa logada lê os eventos do card, em ordem, com o nome de quem fez e sem os ids do Trello', async () => {
    const { avisar, app, base } = await comServidor();
    await avisar(criado('cardLinha'));
    await avisar(membro('cardLinha', 'addMemberToCard', 'membroDois', 'Rafael', '2026-11-26T13:02:00.000Z'));
    await avisar(arte('cardLinha', 'HOJE', 'complete', '2026-11-26T14:00:00.000Z'));
    await avisar(moveu('cardLinha', 'lEntradaSP', 'lSaidaSP', '2026-11-26T18:20:00.000Z'));
    await app.avisosEmDia();
    const r = await ana(base)('/api/linha-do-tempo?card=cardLinha');
    expect(r.status).toBe(200);
    const l = (await r.json()) as Linha;
    expect(l.producao).toMatchObject({ claquete: 'Show da Noite 20/11 SP', etapa: 'entregue', entradaEm: '2026-11-26T12:40:00.000Z', arquivada: false });
    expect(l.eventos).toEqual([
      { tipo: 'criada', antes: null, depois: 'entrada', quem: 'Designer Um', quando: '2026-11-26T12:40:00.000Z' },
      { tipo: 'designer-entrou', antes: null, depois: 'Rafael', quem: 'Designer Um', quando: '2026-11-26T13:02:00.000Z' },
      { tipo: 'arte-marcada', antes: null, depois: 'HOJE', quem: 'Designer Um', quando: '2026-11-26T14:00:00.000Z' },
      { tipo: 'etapa', antes: 'entrada', depois: 'entregue', quem: 'Designer Um', quando: '2026-11-26T18:20:00.000Z' },
    ]);
    // pelo id da Produção, a mesma linha do tempo
    expect(await (await ana(base)(`/api/linha-do-tempo?producao=${l.producao!.id}`)).json()).toEqual(l);
  });

  it('card sem Produção (ou Produção que não existe): 200 com nada, para a tela não mostrar nada', async () => {
    const { base } = await comServidor();
    for (const q of ['card=cardQueNaoExiste', 'producao=00000000-0000-0000-0000-000000000000']) {
      const r = await ana(base)(`/api/linha-do-tempo?${q}`);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ producao: null, eventos: [] });
    }
  });

  it('a Produção da carga, sem eventos, vem com o estado de agora e a lista vazia', async () => {
    const producaoDaArte = [{ id: 'recSemEventos', fields: { card_ID: 'cardDaCarga', claquete: 'Festa na Praça 19/11', designers: '["Designer Dois"]', data_entrada: '2026-11-20T12:00:00.000Z', data_entrega: '2026-11-21T18:20:00.000Z', entregue: true, artes: 'HOJE\nAMANHÃ', artes_quantidade: 2 } }];
    const { base, chefe } = await comServidor({ producaoDaArte });
    expect((await chefe('/api/producoes/recarregar', { method: 'POST' })).status).toBe(200);
    const l = (await (await ana(base)('/api/linha-do-tempo?card=cardDaCarga')).json()) as Linha;
    expect(l).toMatchObject({ producao: { claquete: 'Festa na Praça 19/11', etapa: 'entregue', entradaEm: '2026-11-20T12:00:00.000Z', entregaEm: '2026-11-21T18:20:00.000Z', artes: ['HOJE', 'AMANHÃ'], artesQuantidade: 2 }, eventos: [] });
  });

  it('sem login, recusa; sem o card nem a Produção, 400; só GET', async () => {
    const { base } = await comServidor();
    expect((await fetch(`${base}/api/linha-do-tempo?card=cardLinha`)).status).toBe(401);
    expect((await ana(base)('/api/linha-do-tempo')).status).toBe(400);
    expect((await fetch(`${base}/api/linha-do-tempo?card=x`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com' } })).status).toBe(405);
  });
});

describe('desligado por padrão (ADR 0006: o PROMeiro só escreve no Trello; lê do Teable)', () => {
  const { TRELLO_AVISO: _ligado, ...semAviso } = ENV;

  it('sem TRELLO_AVISO, a rota não existe (404, também no HEAD), nenhum webhook é registrado e nada do quadro é lido', async () => {
    const { app, base, falso, avisar } = await comServidor({ env: semAviso, acoes: [{ id: 'acao1', type: 'createCard', date: '2026-11-26T12:00:00.000Z' }] });
    expect((await fetch(base + ROTA, { method: 'HEAD' })).status).toBe(404);
    expect((await avisar({ action: { id: 'acao2', type: 'createCard' } })).status).toBe(404);
    expect(await app.garantirOAviso()).toBeNull();
    expect(await app.recuperarOQueFaltou()).toBeNull();
    // nenhum pedido ao Trello: nem os webhooks do token, nem as ações e os campos do quadro, nem os membros
    expect(falso.pedidos).toEqual([]);
    expect(falso.webhooks).toEqual([]);
  });

  it('com TRELLO_AVISO=0 (ou qualquer coisa que não seja 1, sim, true, ligado), também desligado', async () => {
    const { base, falso } = await comServidor({ env: { ...semAviso, TRELLO_AVISO: '0' } });
    expect((await fetch(base + ROTA, { method: 'HEAD' })).status).toBe(404);
    expect(falso.pedidos).toEqual([]);
  });
});
