// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
import { reconhecerPraca, type Praca } from '../src/modelo/pracas';
import type { Ligacao, LigacoesDasPracas } from '../src/modelo/ligarPeloNome';

/* A seção Praças da Configuração (#72) pela API, com o Trello de mentira: o quadro, as listas e o campo Praça são
   fictícios. Só administradores (CADASTRO_ADMINS). Nada é salvo sem passar pela conferência. */

const CHEFE = 'chefe@empresa.com';
const ANA = 'ana@empresa.com';
// o quadro de hoje: a G5 usa as listas do RJ (como no Portainer de verdade); INTER tem duas listas de saída
const LISTAS = [
  { id: 'lSP', name: 'SP ENTRADA', closed: false },
  { id: 'lSPs', name: 'SP ENTREGUE', closed: false },
  { id: 'lSP2', name: 'PAULISTA CHEGADA', closed: false },
  { id: 'lRJ', name: 'RIO ENTRADA', closed: false },
  { id: 'lRJs', name: 'RIO ENTREGUE', closed: false },
  { id: 'lIN', name: 'INTER ENTRADA', closed: false },
  { id: 'lINs', name: 'INTER ENTREGUE', closed: false },
  { id: 'lINs2', name: 'INTER ENTREGUE (2025)', closed: false },
  { id: 'lVelha', name: 'ARQUIVO 2024', closed: true },
];
const CAMPOS = [
  { id: 'cPraca', name: 'Praça', type: 'list', options: ['G5', 'SP', 'RJ', 'INTER'].map((t) => ({ id: `o${t}`, value: { text: t } })) },
  { id: 'cProjeto', name: 'Projeto', type: 'text' },
];
/** O Portainer de hoje: as listas e as opções das praças pelas variáveis de sempre. */
const PORTAINER = {
  CADASTRO_ADMINS: CHEFE,
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_LISTA_G5: 'lRJ',
  TRELLO_SAIDA_G5: 'lRJs',
  TRELLO_LISTA_RJ: 'lRJ',
  TRELLO_SAIDA_RJ: 'lRJs',
  TRELLO_LISTA_SP: 'lSP',
  TRELLO_SAIDA_SP: 'lSPs',
  TRELLO_LISTA_INTER: 'lIN',
  TRELLO_CAMPO_PRACA: 'cPraca',
  TRELLO_PRACAS: 'G5=oG5,SP=oSP,RJ=oRJ,INTER=oINTER',
};

function trelloFalso() {
  const pedidos: string[] = [];
  const cards: { idList: string }[] = [];
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    const rota = url.pathname.replace(/^\/1/, '');
    pedidos.push(`${metodo} ${rota}`);
    const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '', arrayBuffer: async () => new ArrayBuffer(4) });
    if (metodo === 'GET' && /^\/lists\/\w+$/.test(rota)) return ok({ id: rota.split('/')[2], idBoard: 'quadroFalso' });
    if (metodo === 'GET' && rota === '/boards/quadroFalso/lists') return ok(LISTAS);
    if (metodo === 'GET' && rota === '/boards/quadroFalso/customFields') return ok(CAMPOS);
    if (rota === '/cards' && metodo === 'POST') {
      cards.push(JSON.parse(String(init.body)));
      return ok({ id: `card${cards.length}`, shortUrl: `https://trello.com/c/FALSO${cards.length}` });
    }
    if (metodo === 'GET') return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
    return ok({});
  };
  return { buscar, pedidos, listasDosCards: () => cards.map((c) => c.idList) };
}

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

async function comServidor(env: Record<string, string> = PORTAINER) {
  const falso = trelloFalso();
  const app = criarApp({ db: abrirBanco(':memory:'), env, trello: (e: Record<string, string>) => criarTrello(e, { buscar: falso.buscar, consultar: async () => [] }) });
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
  const enviar = async (claquete: string, praca: string) => {
    const id = `rot-pracas-${++n}`;
    await fetch(`${base}/api/roteiros/${id}`, {
      method: 'PUT',
      headers: { 'cf-access-authenticated-user-email': CHEFE, 'content-type': 'application/json' },
      body: JSON.stringify({ roteiro: { meta: { claquete, praca }, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }, nArtes: 0 }),
    });
    return chefe(`/api/roteiros/${id}/trello`, { artes: [], texto: 'x' }).then((r) => r.json());
  };
  return { app, falso, chefe, ana: como(ANA), enviar };
}

interface Secao {
  primeiraVez: boolean;
  quadro: { id: string; de: string } | null;
  salvo: LigacoesDasPracas;
  proposta: LigacoesDasPracas;
  estado: { resumo: string; excecoes: Ligacao[]; pracas: { sigla: string; entrada: Ligacao; saida: Ligacao; opcao: Ligacao }[] };
}
const lerSecao = async (pedir: (caminho: string) => Promise<Response>) => ((await (await pedir('/api/configuracao')).json()) as { pracas: Secao }).pracas;
const mudar = (c: LigacoesDasPracas, sigla: string, m: Partial<Praca>): LigacoesDasPracas => ({ ...c, pracas: c.pracas.map((p) => (p.sigla === sigla ? { ...p, ...m } : p)) });

describe('a seção Praças: o estado', () => {
  it('na primeira vez, começa com os valores do Portainer; o quadro vem da lista já configurada; nada é salvo', async () => {
    const { chefe, app } = await comServidor();
    const s = await lerSecao(chefe);
    expect(s.primeiraVez).toBe(true);
    expect(s.quadro).toMatchObject({ id: 'quadroFalso', de: 'lista' });
    expect(s.salvo.pracas.map((p) => [p.sigla, p.entrada, p.saida, p.opcao])).toEqual([
      ['G5', 'lRJ', 'lRJs', 'oG5'],
      ['RJ', 'lRJ', 'lRJs', 'oRJ'],
      ['SP', 'lSP', 'lSPs', 'oSP'],
      ['INTER', 'lIN', '', 'oINTER'],
    ]);
    // só as exceções: a G5 à mão (dividida com o RJ) e a saída de INTER em dobro
    expect(s.estado.excecoes.map((l) => [l.chave, l.como, l.problema, l.divididaCom ?? '', l.candidatos.join(',')])).toEqual([
      ['G5.entrada', 'mao', '', 'RJ', ''],
      ['G5.saida', 'mao', '', 'RJ', ''],
      ['INTER.saida', '', 'dobro', '', 'lINs,lINs2'],
    ]);
    expect(s.estado.resumo).toBe('4 praças · 1 em dobro · 2 à mão');
    expect(app.modulos().env.PRACAS).toBeUndefined();
  });

  it('com TRELLO_QUADRO, o quadro vem dele; sem nada no Portainer, liga pelo nome o que acha um só (como proposta)', async () => {
    const { chefe, falso } = await comServidor({ CADASTRO_ADMINS: CHEFE, TRELLO_KEY: 'k', TRELLO_TOKEN: 't', TRELLO_QUADRO: 'quadroFalso' });
    const s = await lerSecao(chefe);
    expect(s.quadro).toMatchObject({ id: 'quadroFalso', de: 'variavel' });
    expect(falso.pedidos.some((p) => p.startsWith('GET /lists/'))).toBe(false);
    expect(s.salvo.pracas.every((p) => !p.entrada && !p.saida && !p.opcao)).toBe(true);
    expect(s.proposta.campoPraca).toBe('cPraca');
    expect(s.proposta.pracas.map((p) => [p.sigla, p.entrada, p.saida, p.opcao])).toEqual([
      ['G5', '', '', 'oG5'],
      ['RJ', 'lRJ', 'lRJs', 'oRJ'],
      ['SP', 'lSP', 'lSPs', 'oSP'],
      ['INTER', 'lIN', '', 'oINTER'],
    ]);
    expect(s.estado.excecoes.map((l) => `${l.chave}:${l.problema}`)).toEqual(['G5.entrada:nenhum', 'G5.saida:nenhum', 'INTER.saida:dobro']);
  });

  it('sem quadro (nem TRELLO_QUADRO, nem lista configurada), a seção diz o que falta', async () => {
    const { chefe } = await comServidor({ CADASTRO_ADMINS: CHEFE, TRELLO_KEY: 'k', TRELLO_TOKEN: 't' });
    const r = await chefe('/api/configuracao');
    expect(r.status).toBe(200);
    const s = ((await r.json()) as { pracas: Secao & { erro: string } }).pracas;
    expect(s.quadro).toBeNull();
    expect(s.erro).toMatch(/TRELLO_QUADRO/);
  });
});

describe('a seção Praças: só administradores', () => {
  it('quem não é administrador não lê, não confere e não salva; o /api/eu diz quem é', async () => {
    const { ana, chefe } = await comServidor();
    expect((await ana('/api/configuracao')).status).toBe(403);
    expect((await ana('/api/configuracao/conferir', { pracas: {} })).status).toBe(403);
    expect((await ana('/api/configuracao/salvar', { pracas: {} })).status).toBe(403);
    expect((await (await ana('/api/eu')).json()).admin).toBe(false);
    expect((await (await chefe('/api/eu')).json()).admin).toBe(true);
  });
});

describe('a seção Praças: conferir e salvar', () => {
  it('ligar à mão: escolher a saída de INTER e salvar; ela fica marcada como ligada à mão', async () => {
    const { chefe } = await comServidor();
    const s = await lerSecao(chefe);
    const nova = { ...mudar(s.proposta, 'INTER', { saida: 'lINs' }), aMao: [...s.proposta.aMao, 'INTER.saida'] };
    const conferido = await (await chefe('/api/configuracao/conferir', { pracas: nova })).json();
    expect(conferido.ok).toBe(true);
    expect(conferido.muda).toEqual([{ oque: 'INTER: saída', antes: '—', depois: 'INTER ENTREGUE (à mão)' }]);
    const r = await chefe('/api/configuracao/salvar', { pracas: nova });
    expect(r.status).toBe(200);
    const depois = await lerSecao(chefe);
    expect(depois.primeiraVez).toBe(false);
    expect(depois.estado.excecoes.map((l) => `${l.chave}:${l.como}`)).toEqual(['G5.entrada:mao', 'G5.saida:mao', 'INTER.saida:mao']);
    expect(depois.estado.resumo).toBe('4 praças · tudo ligado · 3 à mão');
  });

  it('conferir com erro (lista arquivada, opção que não existe) não salva nada; salvar também recusa', async () => {
    const { chefe, app } = await comServidor();
    const s = await lerSecao(chefe);
    const errada = mudar(s.proposta, 'SP', { entrada: 'lVelha', opcao: 'oNada' });
    const conferido = await (await chefe('/api/configuracao/conferir', { pracas: errada })).json();
    expect(conferido.ok).toBe(false);
    expect(conferido.itens.filter((i: { tipo: string }) => i.tipo === 'erro').map((i: { titulo: string }) => i.titulo)).toEqual(['SP: entrada', 'SP: opção no campo Praça']);
    const r = await chefe('/api/configuracao/salvar', { pracas: errada });
    expect(r.status).toBe(422);
    expect((await r.json()).conferencia.ok).toBe(false);
    expect(app.modulos().env.PRACAS).toBeUndefined();
    expect((await lerSecao(chefe)).salvo.pracas.find((p) => p.sigla === 'SP')?.entrada).toBe('lSP');
  });

  it('salvar vale na hora: o próximo envio de SP vai para a lista nova, e a regra nova chega ao navegador', async () => {
    const { chefe, enviar, falso } = await comServidor();
    expect((await enviar('Festa 3/12 SP', 'SP')).estado).toBe('enviado');
    const s = await lerSecao(chefe);
    const nova = mudar(s.proposta, 'SP', { entrada: 'lSP2', regra: { onde: 'fim', palavras: ['SP', 'PAULISTA'] } });
    nova.aMao = [...nova.aMao, 'SP.entrada'];
    expect((await chefe('/api/configuracao/salvar', { pracas: nova })).status).toBe(200);
    expect((await enviar('Festa 4/12 SP', 'SP')).estado).toBe('enviado');
    expect(falso.listasDosCards()).toEqual(['lSP', 'lSP2']);
    const eu = await (await chefe('/api/eu')).json();
    expect(reconhecerPraca('FESTA 4/12 PAULISTA', eu.pracas)).toBe('SP');
    expect(eu.pracas.every((p: Praca) => !p.entrada && !p.opcao)).toBe(true);
  });

  it('uma praça com corpo inválido é recusada', async () => {
    const { chefe } = await comServidor();
    expect((await chefe('/api/configuracao/salvar', { pracas: { pracas: [{ nome: 'sem sigla' }], campoPraca: '', aMao: [] } })).status).toBe(400);
  });
});
