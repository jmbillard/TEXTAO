// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* A Produção (#86) pela API: a carga inicial lê a produção da arte INTEIRA do Teable de mentira (as tabelas achadas
   pelo nome, o Postgres respondendo as linhas) e cada linha vira uma Produção do PROMeiro, com id próprio. Rodar de
   novo atualiza, não duplica (a chave é o registro do Teable). Nada do Trello: o ambiente nem tem o Trello. */

const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg' };

// ids de card fictícios (24 caracteres hexadecimais)
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
type Campos = Record<string, unknown>;
const registro = (id: string, fields: Campos) => ({ id, fields });

function producaoDaArte() {
  return [
    // com card, designer e status detalhado; o envio do PROMeiro liga ao Roteiro
    registro('recLinha1', { card_ID: card(1), claquete: 'Show da Noite 20/11 SP', status: '["PRODUZINDO","AGUARDANDO MATERIAL"]', designers: '["Designer Um"]', data_entrada: '2026-11-18T12:00:00.000Z', artes: 'HOJE\nAMANHÃ', artes_quantidade: 2, arquivado: false, entregue: false, praca: null, filme: null }),
    registro('recLinha2', { card_ID: card(2), claquete: 'Festa na Praça 19/11', status: '[]', designers: '["Designer Dois"]', data_entrada: '2026-11-15T12:00:00.000Z', data_entrega: '2026-11-16T18:00:00.000Z', entregue: true, praca: '[{"id":"x","title":"REDE"}]' }),
    // sem card
    registro('recLinha3', { card_ID: '', claquete: 'Cozinha de Vó 18/11', status: null, designers: null, data_entrada: '2026-11-10T12:00:00.000Z' }),
    // arquivada
    registro('recLinha4', { card_ID: card(4), claquete: 'Novela Sinfonia 12/11', status: '["FINALIZADO"]', designers: '["Designer Um"]', arquivado: true, entregue: true, data_entrada: '2026-11-01T12:00:00.000Z' }),
    // de filme, com o filme ligado na linha
    registro('recLinha5', { card_ID: card(5), claquete: 'Filme da Tarde 21/11', status: '["FILME"]', designers: null, filme: [{ id: 'recFilme1', title: 'Filme da Tarde' }], data_entrada: '2026-11-19T12:00:00.000Z' }),
    // de filme, ligado pela exibição do card
    registro('recLinha6', { card_ID: card(6), claquete: 'Corujão 22/11', status: '["FINALIZADO"]', designers: '["Designer Dois"]', data_entrada: '2026-11-19T12:00:00.000Z' }),
  ];
}
const exibicoes = () => [registro('recExib1', { card_ID: card(6), data_de_exibicao: '2026-11-22T03:00:00.000Z', filme: { id: 'recFilme2', title: 'Filme da Madrugada (1999)' } })];

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function comServidor({ db = abrirBanco(':memory:'), registros = { ARTE_producao: producaoDaArte(), exibicoes: exibicoes() } } = {}) {
  const teable = teableFalso(NOMES, { registros });
  const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = () => new Promise<void>((ok) => servidor.close(() => ok()));
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  return { db, teable, registros, chefe: como('chefe@empresa.com'), ana: como('ana@empresa.com') };
}

type Contagem = { ligado: boolean; carregando: boolean; total: number; porEtapa: Record<string, number>; comCard: number; semCard: number; comRoteiro: number; comFilme: number; ultimaCarga: { linhas: number; novas: number; atualizadas: number } | null };
type Producao = { id: string; claquete: string; praca: string; etapa: string; marcador: string; designers: string[]; cardId: string | null; teableRegistro: string; roteiroId: string | null; filmeId: string | null; filmeTitulo: string | null; exibicaoEm: string | null; entradaEm: string | null; entregaEm: string | null; artes: string[]; arquivada: boolean };

const ler = async (r: Response) => (await r.json()) as Contagem;
const porRegistro = async (chefe: (c: string, i?: RequestInit) => Promise<Response>, rec: string) => ((await (await chefe(`/api/producoes?registro=${rec}`)).json()) as { producoes: Producao[] }).producoes;

/** Um Roteiro guardado que foi enviado para o card (o envio liga Roteiro ↔ card). */
function roteiroEnviado(db: { prepare: (s: string) => { run: (...a: unknown[]) => void } }, id: string, cardId: string, dataExibicao: string) {
  const agora = '2026-11-18T10:00:00.000Z';
  db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'ana@empresa.com', 'Ana', JSON.stringify({ claquete: 'Show da Noite 20/11 SP', dataExibicao }), '{}', agora, agora);
  db.prepare("INSERT INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'ok', ?, ?)").run(id, cardId, agora);
}

describe('a carga inicial das Produções', () => {
  it('todas as linhas da produção da arte viram Produção (com e sem card, filmes, arquivadas), com a etapa', async () => {
    const { chefe } = await comServidor();
    const r = await chefe('/api/producoes/recarregar', { method: 'POST' });
    expect(r.status).toBe(200);
    // (a carga da subida pode ter corrido antes: as novas são dela ou desta)
    expect(await r.json()).toMatchObject({ linhas: 6 });
    const c = await ler(await chefe('/api/producoes'));
    expect(c).toMatchObject({ ligado: true, carregando: false, total: 6, porEtapa: { entrada: 2, produzindo: 1, entregue: 2, arquivada: 1 }, comCard: 5, semCard: 1, comFilme: 2 });
    const [show] = await porRegistro(chefe, 'recLinha1');
    expect(show).toMatchObject({ claquete: 'Show da Noite 20/11 SP', praca: 'SP', etapa: 'produzindo', marcador: 'Aguardando material', designers: ['Designer Um'], cardId: card(1), artes: ['HOJE', 'AMANHÃ'], arquivada: false });
    // o id é do PROMeiro, não o card nem o registro do Teable
    expect(show.id).not.toBe(card(1));
    expect(show.id).not.toBe('recLinha1');
    expect((await porRegistro(chefe, 'recLinha2'))[0]).toMatchObject({ praca: 'G5', etapa: 'entregue', entregaEm: '2026-11-16T18:00:00.000Z' });
    expect((await porRegistro(chefe, 'recLinha3'))[0]).toMatchObject({ cardId: null, etapa: 'entrada', entradaEm: '2026-11-10T12:00:00.000Z' });
    expect((await porRegistro(chefe, 'recLinha4'))[0]).toMatchObject({ etapa: 'arquivada', arquivada: true });
  });

  it('liga ao Roteiro pelo envio e ao filme pela linha ou pela exibição do card', async () => {
    const db = abrirBanco(':memory:');
    roteiroEnviado(db, 'roteiro-show-1', card(1), '2026-11-20');
    const { chefe } = await comServidor({ db });
    await chefe('/api/producoes/recarregar', { method: 'POST' });
    expect((await ler(await chefe('/api/producoes'))).comRoteiro).toBe(1);
    expect((await porRegistro(chefe, 'recLinha1'))[0]).toMatchObject({ roteiroId: 'roteiro-show-1', exibicaoEm: '2026-11-20', filmeId: null });
    expect((await porRegistro(chefe, 'recLinha5'))[0]).toMatchObject({ filmeId: 'recFilme1', filmeTitulo: 'Filme da Tarde', roteiroId: null });
    expect((await porRegistro(chefe, 'recLinha6'))[0]).toMatchObject({ filmeId: 'recFilme2', filmeTitulo: 'Filme da Madrugada (1999)', exibicaoEm: '2026-11-22T03:00:00.000Z', etapa: 'entregue' });
  });

  it('rodar de novo não duplica: atualiza a mesma Produção (o mesmo id) e acrescenta só as linhas novas', async () => {
    const { chefe, registros } = await comServidor();
    await chefe('/api/producoes/recarregar', { method: 'POST' });
    const [antes] = await porRegistro(chefe, 'recLinha3');
    // a linha sem card ganhou designer, e entrou uma linha nova
    Object.assign(registros.ARTE_producao[2].fields, { designers: '["Designer Um"]' });
    registros.ARTE_producao.push(registro('recLinha7', { card_ID: card(7), claquete: 'Praia do Sol 22/11', data_entrada: '2026-11-20T12:00:00.000Z' }));
    const r = await chefe('/api/producoes/recarregar', { method: 'POST' });
    expect(await r.json()).toMatchObject({ linhas: 7, novas: 1, atualizadas: 6 });
    const c = await ler(await chefe('/api/producoes'));
    expect(c).toMatchObject({ total: 7, porEtapa: { entrada: 2, produzindo: 2, entregue: 2, arquivada: 1 } });
    const depois = await porRegistro(chefe, 'recLinha3');
    expect(depois).toHaveLength(1);
    expect(depois[0]).toMatchObject({ id: antes.id, etapa: 'produzindo', designers: ['Designer Um'] });
  });

  it('roda sozinha na subida quando não há nenhuma Produção; com Produções guardadas, não lê o Teable de novo', async () => {
    const db = abrirBanco(':memory:');
    const primeira = await comServidor({ db });
    let c = await ler(await primeira.chefe('/api/producoes'));
    for (let i = 0; i < 50 && (c.carregando || !c.total); i++) {
      await new Promise((ok) => setTimeout(ok, 20));
      c = await ler(await primeira.chefe('/api/producoes'));
    }
    expect(c).toMatchObject({ total: 6, ultimaCarga: { linhas: 6, novas: 6 } });
    await parar?.();
    parar = null;
    const segunda = await comServidor({ db });
    await new Promise((ok) => setTimeout(ok, 100));
    expect(segunda.teable.estado.consultas.filter((s: string) => s.includes('"arte_producao_pg"'))).toEqual([]);
    expect(await ler(await segunda.chefe('/api/producoes'))).toMatchObject({ total: 6, ultimaCarga: null });
  });

  it('com o Teable fora do ar, recarregar falha e as Produções guardadas ficam', async () => {
    const { chefe, teable } = await comServidor();
    await chefe('/api/producoes/recarregar', { method: 'POST' });
    teable.estado.fora = true;
    const r = await chefe('/api/producoes/recarregar', { method: 'POST' });
    expect(r.status).toBe(502);
    expect((await r.json()).erro).toMatch(/produção da arte/);
    expect(await ler(await chefe('/api/producoes'))).toMatchObject({ total: 6 });
  });

  it('só administradores veem a contagem e recarregam', async () => {
    const { ana } = await comServidor();
    expect((await ana('/api/producoes')).status).toBe(403);
    expect((await ana('/api/producoes/recarregar', { method: 'POST' })).status).toBe(403);
    expect((await ana('/api/producoes?registro=recLinha1')).status).toBe(403);
  });
});
