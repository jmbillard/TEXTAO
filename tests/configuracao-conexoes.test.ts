// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* As Conexões da Configuração (#76) pela API: as tabelas do Teable achadas pelo nome na base (o nome no Postgres vem
   do próprio Teable), o aviso da coluna que falta, o Teable fora do ar, e trocar o quadro do Trello ou a base do Teable
   com o nome digitado, ligando tudo de novo pelo nome. Trello e Teable de mentira: ids e nomes inventados. */

const CHEFE = 'chefe@empresa.com';
const ANA = 'ana@empresa.com';

/** Dois quadros: o de hoje e o novo, com as listas e os campos de nomes parecidos e ids outros. */
const QUADROS: Record<string, { nome: string; listas: { id: string; name: string; closed: boolean }[]; campos: unknown[]; etiquetas: { id: string; name: string }[] }> = {
  qHoje: {
    nome: 'PROMO 2026',
    listas: [
      { id: 'lSP', name: 'SP ENTRADA', closed: false },
      { id: 'lRJ', name: 'RIO ENTRADA', closed: false },
      { id: 'lFilmes', name: 'FILMES', closed: false },
      { id: 'lReserva', name: 'CAIXA GERAL', closed: false },
    ],
    campos: [
      { id: 'cPraca', name: 'Praça', type: 'list', options: ['G5', 'SP', 'RJ', 'INTER'].map((t) => ({ id: `o${t}`, value: { text: t } })) },
      { id: 'cIA', name: 'Uso de IA', type: 'list', options: [] },
    ],
    etiquetas: [{ id: 'eFilme', name: 'FILME' }],
  },
  qNovo: {
    nome: 'Promo 2027',
    listas: [
      { id: 'nSP', name: 'SP · Entrada', closed: false },
      { id: 'nRJ', name: 'RIO ENTRADA', closed: false },
      { id: 'nFilmes', name: 'Cards de filme', closed: false },
      { id: 'nReserva', name: 'Caixa geral', closed: false },
    ],
    campos: [
      { id: 'nPraca', name: 'PRACA', type: 'list', options: ['G5', 'SP', 'RJ'].map((t) => ({ id: `n${t}`, value: { text: t } })) },
      { id: 'nIA', name: 'Uso de IA', type: 'list', options: [] },
    ],
    etiquetas: [{ id: 'nFilme', name: 'Filme' }],
  },
};
const PORTAINER = {
  CADASTRO_ADMINS: CHEFE,
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_LISTA_SP: 'lSP',
  TRELLO_LISTA_RJ: 'lRJ',
  TRELLO_LISTA_G5: 'lRJ',
  TRELLO_LISTA: 'lReserva',
  TRELLO_CAMPO_PRACA: 'cPraca',
  TRELLO_PRACAS: 'G5=oG5,SP=oSP,RJ=oRJ,INTER=oINTER',
  TRELLO_LISTA_FILMES: 'lFilmes',
  TRELLO_FILMES_ETIQUETAS: 'eFilme',
  TRELLO_CAMPOS_FILME: 'cIA',
  TEABLE_PG_URL: 'postgres://falso',
  TEABLE_PG_ESQUEMA: 'bseHoje',
  ...TEABLE_FALSO,
  // restos do Portainer de antes: não são mais lidos (o nome no Postgres vem do Teable). O de exibições é o caso de
  // verdade: um id de tabela onde devia estar o nome no Postgres
  TEABLE_PG_ARTE: 'producao_velha',
  TEABLE_PG_EXIBICOES: 'tblUmIdNoLugarDoNome',
  TEABLE_PG_ARTE_LEITURA: 'bseVelha.producao',
};

function trelloFalso() {
  const pedidos: string[] = [];
  const cards: { idList: string }[] = [];
  const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '', arrayBuffer: async () => new ArrayBuffer(4) });
  const nao = { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    const rota = url.pathname.replace(/^\/1/, '');
    pedidos.push(`${metodo} ${rota}`);
    if (metodo === 'GET' && rota === '/members/me/boards') return ok(Object.entries(QUADROS).map(([id, q]) => ({ id, name: q.nome })));
    const lista = /^\/lists\/(\w+)$/.exec(rota);
    if (metodo === 'GET' && lista) {
      const de = Object.entries(QUADROS).find(([, q]) => q.listas.some((l) => l.id === lista[1]));
      return de ? ok({ id: lista[1], idBoard: de[0] }) : nao;
    }
    const doQuadro = /^\/boards\/(\w+)(\/\w+)?$/.exec(rota);
    if (metodo === 'GET' && doQuadro && QUADROS[doQuadro[1]]) {
      const q = QUADROS[doQuadro[1]];
      if (!doQuadro[2]) return ok({ id: doQuadro[1], name: q.nome });
      if (doQuadro[2] === '/lists') return ok(q.listas);
      if (doQuadro[2] === '/customFields') return ok(q.campos);
      if (doQuadro[2] === '/labels') return ok(q.etiquetas);
    }
    if (rota === '/cards' && metodo === 'POST') {
      cards.push(JSON.parse(String(init.body)));
      return ok({ id: `card${cards.length}`, shortUrl: `https://trello.com/c/FALSO${cards.length}` });
    }
    if (metodo === 'GET') return nao;
    return ok({});
  };
  return { buscar, pedidos, listasDosCards: () => cards.map((c) => c.idList) };
}

/** As tabelas das duas bases: os nomes no Postgres são os do Teable (com o sufixo que ele põe). */
const BASE_DE_HOJE = { ARTE_producao: 'arte_producao_h1', exibicoes: 'exibicoes_h2', ARTES_acervo: 'artes_acervo_h3', redatores: 'redatores_h4' };
const BASE_NOVA = { ARTE_producao: 'arte_producao_n1', exibicoes: 'exibicoes_n2' };

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

async function comServidor({ env = PORTAINER, db = abrirBanco(':memory:'), faltando = {} as Record<string, string[]>, teable = teableFalso(BASE_DE_HOJE, { base: 'bseHoje', nomeDaBase: 'Promo de hoje', faltando, bases: { bseNova: { nome: 'Promo nova', nomes: BASE_NOVA } } }) } = {}) {
  const falso = trelloFalso();
  const sql: string[] = [];
  const consultar = async (texto: string) => {
    sql.push(texto);
    return [];
  };
  const abrirPg = async () => ({ query: async (texto: string) => (sql.push(texto), { rows: [] }), end: async () => {} });
  const app = criarApp({ db, env, abrirPg, buscarNoTeable: teable, trello: (e: Record<string, string>) => criarTrello(e, { buscar: falso.buscar, consultar }) });
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
  const enviar = async (claquete: string, praca: string) => {
    const id = `rot-conexoes-${claquete.replace(/\W+/g, '-')}`;
    await fetch(`${base}/api/roteiros/${id}`, {
      method: 'PUT',
      headers: { 'cf-access-authenticated-user-email': CHEFE, 'content-type': 'application/json' },
      body: JSON.stringify({ roteiro: { meta: { claquete, praca }, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }, nArtes: 0 }),
    });
    return como(CHEFE)(`/api/roteiros/${id}/trello`, { artes: [], texto: 'x' }).then((r) => r.json());
  };
  return { app, db, sql, falso, teable, enviar, chefe: como(CHEFE), ana: como(ANA) };
}

type Conexoes = {
  quadro: { id: string; nome: string; de: string } | null;
  base: { id: string; nome: string } | null;
  tabelas: { nome: string; id: string; pg: string; como: string; problema: string }[];
  avisos: { tabela: string; texto: string }[];
  foraDoAr?: string;
  lidasEm?: string;
};
const lerConexoes = async (chefe: (c: string) => Promise<Response>) => ((await (await chefe('/api/configuracao')).json()) as { conexoes: Conexoes }).conexoes;

describe('as tabelas do Teable, achadas pelo nome na base', () => {
  it('acha as tabelas e descobre o nome no Postgres; os módulos leem por ele, e não pelas variáveis antigas', async () => {
    const { chefe, sql } = await comServidor();
    const c = await lerConexoes(chefe);
    expect(c.base).toEqual({ id: 'bseHoje', nome: 'Promo de hoje' });
    expect(c.tabelas.find((t) => t.nome === 'ARTE_producao')).toMatchObject({ pg: 'arte_producao_h1', como: 'nome', problema: '' });
    expect(c.tabelas.find((t) => t.nome === 'exibicoes')).toMatchObject({ pg: 'exibicoes_h2' });
    expect(c.tabelas.find((t) => t.nome === 'filmes')).toMatchObject({ id: '', problema: 'nenhum' });
    // o palpite do redator lê a ARTE_producao pelo nome que o Teable deu (e não pelo TEABLE_PG_ARTE que sobrou)
    await chefe('/api/redator-provavel?atracao=Festa');
    expect(sql.some((s) => s.includes('"bseHoje"."arte_producao_h1"'))).toBe(true);
    expect(sql.some((s) => /producao_velha|tblUmIdNoLugarDoNome|bseVelha/.test(s))).toBe(false);
  });

  it('o aviso no topo: a tabela que não está na base e a coluna que o código usa e a tabela não tem', async () => {
    const { chefe } = await comServidor({ faltando: { ARTES_acervo: ['complexidade'], ARTE_producao: ['card_ID'] } });
    const { avisos } = await lerConexoes(chefe);
    expect(avisos).toContainEqual({ tabela: 'ARTES_acervo', texto: 'Acervo sem a coluna complexidade (na API)' });
    expect(avisos).toContainEqual({ tabela: 'ARTE_producao', texto: 'Produção da arte sem a coluna card_ID (na API e no Postgres)' });
    expect(avisos).toContainEqual({ tabela: 'filmes', texto: 'Não achei a tabela filmes na base' });
  });

  it('com o Teable fora do ar, valem as tabelas da última descoberta, guardada (também depois de reiniciar)', async () => {
    const primeiro = await comServidor();
    const db = primeiro.db;
    await lerConexoes(primeiro.chefe);
    await fechar?.();
    fechar = null;
    const fora = teableFalso(BASE_DE_HOJE, { base: 'bseHoje' });
    fora.estado.fora = true;
    const { chefe, sql } = await comServidor({ db, teable: fora });
    const c = await lerConexoes(chefe);
    expect(c.foraDoAr).toMatch(/fora do ar/);
    expect(c.lidasEm).toBeTruthy();
    expect(c.tabelas.find((t) => t.nome === 'ARTE_producao')).toMatchObject({ pg: 'arte_producao_h1' });
    await chefe('/api/redator-provavel?atracao=Festa');
    expect(sql.some((s) => s.includes('"bseHoje"."arte_producao_h1"'))).toBe(true);
  });
});

describe('trocar o quadro do Trello', () => {
  it('lista os quadros; o nome errado não troca nada; o certo salva o quadro e liga tudo de novo pelo nome', async () => {
    const { chefe, ana, falso, enviar } = await comServidor();
    expect(((await (await chefe('/api/configuracao/quadros')).json()) as { quadros: unknown[] }).quadros).toEqual([
      { id: 'qHoje', nome: 'PROMO 2026' },
      { id: 'qNovo', nome: 'Promo 2027' },
    ]);
    expect((await lerConexoes(chefe)).quadro).toEqual({ id: 'qHoje', nome: 'PROMO 2026', de: 'lista' });
    expect((await ana('/api/configuracao/trocar', { quadro: 'qNovo', confirmacao: 'Promo 2027' })).status).toBe(403);
    const errado = await chefe('/api/configuracao/trocar', { quadro: 'qNovo', confirmacao: 'Promo 2026' });
    expect(errado.status).toBe(422);
    expect(((await errado.json()) as { erro: string }).erro).toMatch(/Promo 2027/);
    expect((await lerConexoes(chefe)).quadro?.id).toBe('qHoje');

    // sem caixa e sem acento, o nome confirma
    const certo = await chefe('/api/configuracao/trocar', { quadro: 'qNovo', confirmacao: 'promo 2027' });
    expect(certo.status).toBe(200);
    const s = (await certo.json()) as {
      conexoes: Conexoes;
      pracas: { salvo: { campoPraca: string; pracas: { sigla: string; entrada: string; opcao: string }[] }; estado: { excecoes: { chave: string; problema: string }[] } };
      card: { salvo: { doFilme: string[] } };
      filmes: { salvo: { lista: string; etiquetas: string[] } };
    };
    expect(s.conexoes.quadro).toEqual({ id: 'qNovo', nome: 'Promo 2027', de: 'variavel' });
    const praca = (sigla: string) => s.pracas.salvo.pracas.find((p) => p.sigla === sigla);
    expect(s.pracas.salvo.campoPraca).toBe('nPraca');
    expect(praca('SP')).toMatchObject({ entrada: 'nSP', opcao: 'nSP' });
    expect(praca('RJ')).toMatchObject({ entrada: 'nRJ', opcao: 'nRJ' });
    // a G5 usava à mão a lista do RJ: no quadro novo, o nome não acha; vira exceção (e a INTER não tem opção)
    expect(praca('G5')).toMatchObject({ entrada: '', opcao: 'nG5' });
    expect(s.pracas.estado.excecoes).toContainEqual(expect.objectContaining({ chave: 'G5.entrada', problema: 'nenhum' }));
    expect(s.pracas.estado.excecoes).toContainEqual(expect.objectContaining({ chave: 'INTER.opcao', problema: 'nenhum' }));
    // os filmes e o card também: a lista, a etiqueta e o campo copiado do filme (pelo nome que tinha)
    expect(s.filmes.salvo).toMatchObject({ lista: 'nFilmes', etiquetas: ['nFilme'] });
    expect(s.card.salvo.doFilme).toEqual(['nIA']);

    // vale na hora: o próximo card de SP vai para a entrada de SP do quadro novo
    await enviar('FESTA 3/12 SP', 'SP');
    expect(falso.listasDosCards()).toEqual(['nSP']);
  });
});

describe('trocar a base do Teable', () => {
  it('lista as bases; com o nome certo, as tabelas são achadas de novo na base nova', async () => {
    const { chefe, sql } = await comServidor();
    expect(((await (await chefe('/api/configuracao/bases')).json()) as { bases: unknown[] }).bases).toEqual([
      { id: 'bseHoje', nome: 'Promo de hoje' },
      { id: 'bseNova', nome: 'Promo nova' },
    ]);
    expect((await chefe('/api/configuracao/trocar', { base: 'bseNova', confirmacao: 'Promo de hoje' })).status).toBe(422);
    const r = await chefe('/api/configuracao/trocar', { base: 'bseNova', confirmacao: 'PROMO NOVA' });
    expect(r.status).toBe(200);
    const c = ((await r.json()) as { conexoes: Conexoes }).conexoes;
    expect(c.base).toEqual({ id: 'bseNova', nome: 'Promo nova' });
    expect(c.tabelas.find((t) => t.nome === 'ARTE_producao')).toMatchObject({ pg: 'arte_producao_n1', como: 'nome' });
    // a tabela que a base nova não tem vira aviso
    expect(c.avisos).toContainEqual({ tabela: 'ARTES_acervo', texto: 'Não achei a tabela ARTES_acervo na base' });
    await chefe('/api/redator-provavel?atracao=Outra');
    expect(sql.some((s) => s.includes('"bseNova"."arte_producao_n1"'))).toBe(true);
  });
});
