// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* A Configuração com o Trello ou o Teable fora do ar (#79), pela API: cada seção mostra o que está salvo com os nomes
   da última leitura (guardada no SQLite, também depois de reiniciar), diz desde quando e trava a edição daquela parte:
   conferir e salvar são recusados. O resto continua funcionando. Trello e Teable de mentira: ids e nomes inventados. */

const CHEFE = 'chefe@empresa.com';
const ANA = 'ana@empresa.com';

const QUADRO = {
  nome: 'PROMO 2026',
  listas: [
    { id: 'lSP', name: 'SP ENTRADA', closed: false },
    { id: 'lRJ', name: 'RIO ENTRADA', closed: false },
    { id: 'lFilmes', name: 'FILMES', closed: false },
  ],
  campos: [{ id: 'cPraca', name: 'Praça', type: 'list', options: ['G5', 'SP', 'RJ', 'INTER'].map((t) => ({ id: `o${t}`, value: { text: t } })) }],
  etiquetas: [{ id: 'eFilme', name: 'FILME' }],
};
const PORTAINER = {
  CADASTRO_ADMINS: CHEFE,
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_QUADRO: 'qHoje',
  TRELLO_LISTA_SP: 'lSP',
  TRELLO_LISTA_RJ: 'lRJ',
  TRELLO_LISTA_G5: 'lRJ',
  TRELLO_CAMPO_PRACA: 'cPraca',
  TRELLO_PRACAS: 'G5=oG5,SP=oSP,RJ=oRJ,INTER=oINTER',
  TRELLO_LISTA_FILMES: 'lFilmes',
  TRELLO_FILMES_ETIQUETAS: 'eFilme',
  TEABLE_PG_ESQUEMA: 'bseHoje',
  ...TEABLE_FALSO,
};

/** O Trello de mentira: `estado.fora = true` faz ele responder 503 a tudo. */
function trelloFalso() {
  const estado = { fora: false };
  const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '' });
  const nao = (status: number) => ({ ok: false, status, json: async () => ({}), text: async () => (status === 503 ? 'Service Unavailable' : 'not found') });
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    if (estado.fora) return nao(503);
    const rota = new URL(endereco).pathname.replace(/^\/1/, '');
    const metodo = init.method ?? 'GET';
    if (metodo === 'GET' && rota === '/members/me/boards') return ok([{ id: 'qHoje', name: QUADRO.nome }]);
    if (metodo === 'GET' && rota === '/boards/qHoje') return ok({ id: 'qHoje', name: QUADRO.nome });
    if (metodo === 'GET' && rota === '/boards/qHoje/lists') return ok(QUADRO.listas);
    if (metodo === 'GET' && rota === '/boards/qHoje/customFields') return ok(QUADRO.campos);
    if (metodo === 'GET' && rota === '/boards/qHoje/labels') return ok(QUADRO.etiquetas);
    if (metodo === 'GET' && rota === '/boards/qHoje/members') return ok([]);
    if (metodo === 'GET') return nao(404);
    return ok({});
  };
  return { buscar, estado };
}

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

async function comServidor({ db = abrirBanco(':memory:'), falso = trelloFalso(), teable = teableFalso({ ARTE_producao: 'arte_producao_h1', designers: 'designers_d1' }, { base: 'bseHoje', nomeDaBase: 'Promo de hoje', registros: { designers: [] } }) } = {}) {
  const abrirPg = async () => ({ query: async () => ({ rows: [] }), end: async () => {} });
  const app = criarApp({ db, env: PORTAINER, abrirPg, buscarNoTeable: teable, trello: (e: Record<string, string>) => criarTrello(e, { buscar: falso.buscar, consultar: async () => [] }) });
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
  return { db, falso, teable, chefe: como(CHEFE), ana: como(ANA) };
}

type ForaDoAr = { servico: string; desde: string; lidoEm: string };
type Secao = {
  salvo: unknown;
  proposta: unknown;
  estado: { excecoes: unknown[]; ligacoes?: unknown } | null;
  quadro?: { listas: { id: string; nome: string }[] } | null;
  foraDoAr?: ForaDoAr;
  erro?: string;
};
type Secoes = { pracas: Secao; card: Secao; filmes: Secao; conexoes: { quadro: { id: string; nome: string } | null; foraDoAr?: string; trelloForaDoAr?: ForaDoAr; teableForaDoAr?: ForaDoAr } };
const lerSecoes = async (chefe: (c: string) => Promise<Response>) => (await (await chefe('/api/configuracao')).json()) as Secoes;

describe('com o Trello fora do ar', () => {
  it('cada seção mostra o salvo com os nomes da última leitura, diz desde quando e não propõe nada novo', async () => {
    const primeiro = await comServidor();
    const antes = await lerSecoes(primeiro.chefe);
    expect(antes.pracas.foraDoAr).toBeUndefined();
    await fechar?.();
    fechar = null;

    // reiniciou com o Trello fora: a última leitura ficou no SQLite
    const falso = trelloFalso();
    falso.estado.fora = true;
    const { chefe } = await comServidor({ db: primeiro.db, falso });
    const s = await lerSecoes(chefe);
    for (const secao of [s.pracas, s.card, s.filmes]) {
      expect(secao.foraDoAr).toMatchObject({ servico: 'Trello' });
      expect(Date.parse(secao.foraDoAr!.desde)).not.toBeNaN();
      expect(Date.parse(secao.foraDoAr!.lidoEm)).toBeLessThanOrEqual(Date.parse(secao.foraDoAr!.desde));
      // sem o Trello, nada é ligado de novo pelo nome: a proposta é o salvo
      expect(secao.proposta).toEqual(secao.salvo);
      expect(secao.estado).not.toBeNull();
    }
    expect(s.pracas.quadro?.listas.find((l) => l.id === 'lSP')?.nome).toBe('SP ENTRADA');
    expect(s.pracas.erro).toBeUndefined();
    expect(s.conexoes.quadro).toMatchObject({ id: 'qHoje', nome: 'PROMO 2026' });
    expect(s.conexoes.trelloForaDoAr).toMatchObject({ servico: 'Trello' });

    // o "desde" é o da primeira falha: a segunda leitura não muda
    const outra = await lerSecoes(chefe);
    expect(outra.pracas.foraDoAr!.desde).toBe(s.pracas.foraDoAr!.desde);
  });

  it('conferir e salvar são recusados e nada é salvo; quando o Trello volta, a seção destrava', async () => {
    const { chefe, falso } = await comServidor();
    const s = await lerSecoes(chefe);
    falso.estado.fora = true;
    const pedido = { pracas: s.pracas.proposta };
    for (const acao of ['conferir', 'salvar']) {
      const r = await chefe(`/api/configuracao/${acao}`, pedido);
      expect(r.status).toBe(503);
      expect(((await r.json()) as { erro: string }).erro).toMatch(/Trello.*fora do ar/);
    }
    const card = await chefe('/api/configuracao/salvar', { card: s.card.proposta });
    expect(card.status).toBe(503);
    const historico = (await (await chefe('/api/configuracao/historico')).json()) as { entradas: unknown[] };
    expect(historico.entradas).toEqual([]);

    falso.estado.fora = false;
    const voltou = await lerSecoes(chefe);
    expect(voltou.pracas.foraDoAr).toBeUndefined();
    expect((await chefe('/api/configuracao/conferir', { pracas: voltou.pracas.proposta })).status).toBe(200);
  });

  it('sem nenhuma leitura guardada, a seção diz que não há nomes e fica travada', async () => {
    const falso = trelloFalso();
    falso.estado.fora = true;
    const { chefe } = await comServidor({ falso });
    const s = await lerSecoes(chefe);
    expect(s.pracas.foraDoAr).toMatchObject({ servico: 'Trello', lidoEm: '' });
    expect(s.pracas.quadro).toBeNull();
    expect(s.pracas.erro).toMatch(/Trello/);
    expect((await chefe('/api/configuracao/salvar', { pracas: s.pracas.proposta })).status).toBe(503);
  });

  it('o resto continua: os administradores mudam com o Trello fora', async () => {
    const { chefe, ana, falso } = await comServidor();
    await lerSecoes(chefe);
    falso.estado.fora = true;
    expect((await chefe('/api/configuracao/pessoas', { acao: 'administrador', email: ANA })).status).toBe(200);
    expect(((await (await ana('/api/eu')).json()) as { admin: boolean }).admin).toBe(true);
  });
});

describe('com o Teable fora do ar', () => {
  it('as Conexões dizem desde quando, e trocar a base é recusado; o Trello segue editável', async () => {
    const { chefe, teable } = await comServidor();
    await lerSecoes(chefe);
    teable.estado.fora = true;
    const s = await lerSecoes(chefe);
    expect(s.conexoes.teableForaDoAr).toMatchObject({ servico: 'Teable' });
    expect(Date.parse(s.conexoes.teableForaDoAr!.desde)).not.toBeNaN();
    expect(s.conexoes.teableForaDoAr!.lidoEm).toBeTruthy();
    expect(s.pracas.foraDoAr).toBeUndefined();
    const r = await chefe('/api/configuracao/trocar', { base: 'bseNova', confirmacao: 'Promo nova' });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/Teable.*fora do ar/);
    expect((await chefe('/api/configuracao/conferir', { pracas: s.pracas.proposta })).status).toBe(200);
  });
});
