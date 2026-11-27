// @vitest-environment node
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, fazerBackup } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
import { linhaDoTempoDoCard, type EventoDaLinha } from '../src/modelo/linhaDoTempo';

/* As Campanhas (#178) pela API: criar, ligar e tirar Produções pelo card aberto (uma Produção em várias campanhas), os
   papéis (o administrador, a coordenação, o designer e o redator mudam; os outros só leem), os eventos na linha do
   tempo, as campanhas na lista de Produções e na Produção aberta, a busca e as contagens (a arquivada de fora) e o
   backup. Nada vai ao Trello nem ao Teable. Nomes, e-mails e ids inventados. */

const DIA = 86_400_000;
const ha = (n: number) => new Date(Date.now() - n * DIA).toISOString();
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg', atracoes: 'atracoes_pg', redatores: 'redatores_pg' };
const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso-do-trello', TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP' };

const linhas = () => [
  registro('recCp1', { card_ID: card(41), claquete: 'Novela Sinfonia 20/12 SP', status: '["PRODUZINDO"]', designers: '["Ana Souza"]', artes: 'HOJE | AMANHÃ', data_entrada: ha(2), __last_modified_time: ha(2) }),
  registro('recCp2', { card_ID: '', claquete: 'Cozinha de Vó 20/12 SP', status: null, designers: null, artes: 'VINHETA', data_entrada: ha(1), __last_modified_time: ha(1) }),
  registro('recCp3', { card_ID: card(43), claquete: 'Novela Antiga 10/12 SP', status: '["PRODUZINDO"]', designers: null, artes: 'HOJE', arquivado: true, data_entrada: ha(5), __last_modified_time: ha(5) }),
];
const designers = () => [registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana@empresa.com', designer_ID: 'membroAna', status: 'ativo' })];
const redatores = () => [registro('recRedRita', { redator: 'Rita Lemos', email: 'rita@empresa.com' })];

type Campanha = { id: string; nome: string };
type Card = { id: string; claquete: string; campanhas: Campanha[] };
type Evento = EventoDaLinha & { campo?: string };
type Aberta = { eventos: Evento[]; campanhas: Campanha[]; todasAsCampanhas: Campanha[]; podeLigarCampanhas: boolean };

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function preparado() {
  const aoTrello: string[] = [];
  const db = abrirBanco(':memory:');
  const teable = teableFalso(NOMES, { registros: { ARTE_producao: linhas(), exibicoes: [], designers: designers(), atracoes: [], redatores: redatores() } });
  const app = criarApp({
    db,
    env: ENV,
    buscarNoTeable: teable,
    abrirPg: teable.abrirPg,
    cadastros: (env: Record<string, string>) => criarCadastros(env, { buscar: teable }),
    trello: (env: unknown, deps: Record<string, unknown>) =>
      criarTrello(env, {
        ...deps,
        buscar: async (u: string, init: RequestInit = {}) => {
          aoTrello.push(`${init.method ?? 'GET'} ${u}`);
          return Response.json({});
        },
      }),
  });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  await app.tabelasProntas;
  await app.releituraPronta;
  await app.pessoasProntas;
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const ana = como('ana@empresa.com');
  const rita = como('rita@empresa.com');
  const chefe = como('chefe@empresa.com');
  const bia = como('bia.coord@empresa.com');
  const davi = como('davi@empresa.com');
  const cards = async () => ((await (await davi('/api/producoes/por-praca')).json()) as { blocos: { colunas: Record<string, Card[]> }[] }).blocos.flatMap((b) => Object.values(b.colunas).flat());
  const daClaquete = async (inicio: string) => (await cards()).find((c) => c.claquete.startsWith(inicio))!;
  const novela = (await daClaquete('Novela Sinfonia')).id;
  const cozinha = (await daClaquete('Cozinha de Vó')).id;
  const antiga = (db.prepare("SELECT id FROM producoes WHERE claquete LIKE 'Novela Antiga%'").get() as { id: string }).id;
  const naProducao = (corpo: Record<string, unknown>, quem = ana) => quem('/api/producoes/campanha', { method: 'POST', body: JSON.stringify(corpo) });
  const aberta = async (id: string, quem = davi) => (await (await quem(`/api/producoes/aberta?producao=${id}`)).json()) as Aberta;
  const lista = async (q = '') => ((await (await davi(`/api/campanhas${q ? `?q=${encodeURIComponent(q)}` : ''}`)).json()) as { campanhas: (Campanha & { producoes: number; mexidaEm: string })[] }).campanhas;
  return { db, teable, aoTrello, ana, rita, chefe, bia, davi, novela, cozinha, antiga, naProducao, aberta, lista, daClaquete };
}

describe('as Campanhas (#178)', () => {
  it('criar e ligar pelo card aberto: a campanha nova, a etiqueta no card de Produções e na Produção aberta, e o evento com quem fez', async () => {
    const { naProducao, novela, aberta, daClaquete, aoTrello, teable } = await preparado();
    const pedidosAoTeable = teable.estado.pedidos.length;
    const r = await naProducao({ producao: novela, nova: '  Lançamento   Avenida Carona ' });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.feito).toMatchObject({ eventos: ['campanha-ligada'], trello: [], criada: true, campanha: { nome: 'Lançamento Avenida Carona' } });
    expect(corpo.producao.campanhas).toEqual([{ id: corpo.feito.campanha.id, nome: 'Lançamento Avenida Carona' }]);
    expect(corpo.aberta.campanhas).toEqual(corpo.producao.campanhas);
    expect(corpo.aberta.eventos.at(-1)).toMatchObject({ tipo: 'campanha-ligada', campo: corpo.feito.campanha.id, depois: 'Lançamento Avenida Carona', quem: 'Ana Souza', origem: 'PROMeiro' });
    expect((await daClaquete('Novela Sinfonia')).campanhas).toEqual(corpo.producao.campanhas);
    expect((await daClaquete('Cozinha de Vó')).campanhas).toEqual([]);
    const a = await aberta(novela);
    expect(a.todasAsCampanhas).toEqual(corpo.producao.campanhas);
    // nada vai ao Trello nem ao Teable
    expect(aoTrello).toEqual([]);
    expect(teable.estado.pedidos.slice(pedidosAoTeable).filter((p: string) => !p.startsWith('GET'))).toEqual([]);
  });

  it('o mesmo nome (sem caixa nem acento) liga a campanha que já existe, sem criar outra; o nome vazio ou longo é recusado', async () => {
    const { naProducao, novela, cozinha, lista } = await preparado();
    const primeira = (await (await naProducao({ producao: novela, nova: 'AESP Verão' })).json()).feito.campanha;
    const r = await (await naProducao({ producao: cozinha, nova: 'aesp verao' })).json();
    expect(r.feito).toMatchObject({ criada: false, campanha: primeira, eventos: ['campanha-ligada'] });
    expect(await lista()).toHaveLength(1);
    expect((await naProducao({ producao: novela, nova: '  ' })).status).toBe(400);
    expect((await naProducao({ producao: novela, nova: 'x'.repeat(81) })).status).toBe(400);
  });

  it('uma Produção em várias campanhas, na ordem em que foi ligada; tirar uma deixa as outras, e ligar de novo o que já está não repete', async () => {
    const { naProducao, novela, aberta } = await preparado();
    const lanc = (await (await naProducao({ producao: novela, nova: 'Lançamento' })).json()).feito.campanha;
    const aesp = (await (await naProducao({ producao: novela, nova: 'AESP' })).json()).feito.campanha;
    const elenco = (await (await naProducao({ producao: novela, nova: 'Chamadas de elenco' })).json()).feito.campanha;
    expect((await aberta(novela)).campanhas).toEqual([lanc, aesp, elenco]);
    // ligar de novo: nada muda, nenhum evento
    const de = await (await naProducao({ producao: novela, campanha: aesp.id, liga: true })).json();
    expect(de.feito.eventos).toEqual([]);
    const tirou = await (await naProducao({ producao: novela, campanha: aesp.id, liga: false })).json();
    expect(tirou.feito.eventos).toEqual(['campanha-tirada']);
    expect(tirou.producao.campanhas).toEqual([lanc, elenco]);
    expect(tirou.aberta.eventos.at(-1)).toMatchObject({ tipo: 'campanha-tirada', antes: 'AESP', depois: null, quem: 'Ana Souza' });
    // tirar o que já saiu: nada
    expect((await (await naProducao({ producao: novela, campanha: aesp.id, liga: false })).json()).feito.eventos).toEqual([]);
    // o desfazer da caixinha é ligar de novo: volta para o fim
    await naProducao({ producao: novela, campanha: aesp.id, liga: true });
    expect((await aberta(novela)).campanhas).toEqual([lanc, elenco, aesp]);
  });

  it('a linha do tempo diz "ligou à campanha X" e "tirou da campanha X", com quem fez', async () => {
    const { naProducao, novela, aberta } = await preparado();
    const c = (await (await naProducao({ producao: novela, nova: 'Lançamento' })).json()).feito.campanha;
    await naProducao({ producao: novela, campanha: c.id, liga: false });
    const frases = linhaDoTempoDoCard((await aberta(novela)).eventos).map((i) => i.texto);
    expect(frases.slice(0, 2)).toEqual(['Ana Souza tirou da campanha Lançamento', 'Ana Souza ligou à campanha Lançamento']);
  });

  it('os papéis: o administrador, a coordenação, o designer e o redator mudam, com o nome deles; quem não tem o papel só lê', async () => {
    const { naProducao, novela, chefe, bia, rita, davi, aberta, lista } = await preparado();
    // a coordenação é marcada por um administrador
    expect((await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) })).status).toBe(200);
    const nomes: Record<string, string> = {};
    for (const [quem, nome] of [[chefe, 'Do Chefe'], [bia, 'Da Coordenação'], [rita, 'Da Rita']] as const) {
      const r = await naProducao({ producao: novela, nova: nome }, quem);
      expect(r.status, nome).toBe(200);
      nomes[nome] = (await r.json()).aberta.eventos.at(-1).quem;
      expect((await aberta(novela, quem)).podeLigarCampanhas, nome).toBe(true);
    }
    expect(nomes['Da Rita']).toBe('Rita Lemos');
    expect(nomes['Do Chefe']).toBeTruthy();
    expect(nomes['Da Coordenação']).toBeTruthy();
    // o Davi não tem papel: vê, mas não cria, não liga, não tira
    const a = await aberta(novela, davi);
    expect(a.podeLigarCampanhas).toBe(false);
    expect(a.campanhas).toHaveLength(3);
    const umaDelas = a.campanhas[0].id;
    for (const corpo of [{ producao: novela, nova: 'Do Davi' }, { producao: novela, campanha: umaDelas, liga: false }, { producao: novela, campanha: umaDelas, liga: true }]) {
      const r = await naProducao(corpo, davi);
      expect(r.status).toBe(403);
      expect((await r.json()).erro).toMatch(/administrador, a coordenação, os designers e os redatores/);
    }
    expect((await davi('/api/campanhas', { method: 'POST', body: JSON.stringify({ nome: 'Do Davi' }) })).status).toBe(403);
    expect((await lista()).map((c) => c.nome).sort()).toEqual(['Da Coordenação', 'Da Rita', 'Do Chefe']);
    expect((await aberta(novela, davi)).campanhas).toHaveLength(3);
  });

  it('as recusas: a Produção que não existe ou arquivada, a campanha que não existe, o pedido sem o "liga"', async () => {
    const { naProducao, novela, antiga } = await preparado();
    expect((await naProducao({ producao: 'nao-existe', nova: 'X' })).status).toBe(404);
    expect((await naProducao({ producao: antiga, nova: 'X' })).status).toBe(404);
    expect((await naProducao({ producao: novela, campanha: 'nao-existe', liga: true })).status).toBe(404);
    expect((await naProducao({ producao: novela, campanha: 'x' })).status).toBe(400);
  });

  it('a lista das campanhas: a busca sem caixa nem acento, as contagens sem a arquivada, a mexida por último primeiro; e o POST cria', async () => {
    const { naProducao, novela, cozinha, antiga, db, lista, ana } = await preparado();
    const lanc = (await (await naProducao({ producao: novela, nova: 'Lançamento Avenida Carona' })).json()).feito.campanha;
    await naProducao({ producao: cozinha, campanha: lanc.id, liga: true });
    // a arquivada continua na campanha, mas fica de fora da contagem
    db.prepare('INSERT INTO campanhas_producoes (campanha_id, producao_id, ligada_por, ligada_em) VALUES (?, ?, ?, ?)').run(lanc.id, antiga, 'ana@empresa.com', new Date().toISOString());
    const criada = await ana('/api/campanhas', { method: 'POST', body: JSON.stringify({ nome: 'Chamadas de Elenco' }) });
    expect(criada.status).toBe(201);
    expect((await ana('/api/campanhas', { method: 'POST', body: JSON.stringify({ nome: 'chamadas de elenco' }) })).status).toBe(200);
    const todas = await lista();
    expect(todas.map((c) => [c.nome, c.producoes])).toEqual([
      ['Chamadas de Elenco', 0],
      ['Lançamento Avenida Carona', 2],
    ]);
    expect((await lista('LANCAMENTO avenida')).map((c) => c.nome)).toEqual(['Lançamento Avenida Carona']);
    expect((await lista('carona')).map((c) => c.nome)).toEqual(['Lançamento Avenida Carona']);
    expect(await lista('arona')).toEqual([]);
  });

  it('as campanhas e as ligações entram no backup do banco', async () => {
    const { naProducao, novela } = await preparado();
    await naProducao({ producao: novela, nova: 'Lançamento' });
    const pasta = mkdtempSync(join(tmpdir(), 'campanhas-backup-'));
    try {
      // o banco do teste é :memory:, e o backup é do banco aberto: um segundo banco, no disco, com o mesmo caminho
      const db2 = abrirBanco(join(pasta, 'origem.db'));
      const teable = teableFalso(NOMES, { registros: { ARTE_producao: linhas(), exibicoes: [], designers: designers(), atracoes: [], redatores: [] } });
      const app = criarApp({ db: db2, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: (env: Record<string, string>) => criarCadastros(env, { buscar: teable }) });
      await app.tabelasProntas;
      await app.releituraPronta;
      await app.pessoasProntas;
      const id = (db2.prepare("SELECT id FROM producoes WHERE claquete LIKE 'Novela Sinfonia%'").get() as { id: string }).id;
      db2.prepare("INSERT INTO campanhas (id, nome, chave, criada_por, criada_em, mexida_por, mexida_em) VALUES ('camp1', 'Lançamento', 'lancamento', 'ana@empresa.com', '2026-11-27T12:00:00Z', 'ana@empresa.com', '2026-11-27T12:00:00Z')").run();
      db2.prepare("INSERT INTO campanhas_producoes (campanha_id, producao_id, ligada_por, ligada_em) VALUES ('camp1', ?, 'ana@empresa.com', '2026-11-27T12:00:00Z')").run(id);
      const feito = fazerBackup(db2, join(pasta, 'backup'), 14, new Date('2026-11-27T12:00:00Z'));
      await app.fechar();
      const copia = abrirBanco(feito);
      expect(copia.prepare('SELECT nome FROM campanhas').all()).toEqual([{ nome: 'Lançamento' }]);
      expect(copia.prepare('SELECT campanha_id, producao_id FROM campanhas_producoes').all()).toEqual([{ campanha_id: 'camp1', producao_id: id }]);
      copia.close();
      db2.close();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('a migração é portável: abrir de novo o mesmo banco não perde nem duplica nada', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'campanhas-migra-'));
    try {
      const caminho = join(pasta, 'p.db');
      // @ts-expect-error módulo JS sem tipos
      const { criarCampanhas } = await import('../servidor/campanhas.mjs');
      // @ts-expect-error módulo JS sem tipos
      const { criarTabelaDasProducoes } = await import('../servidor/producoes.mjs');
      const db = abrirBanco(caminho);
      criarTabelaDasProducoes(db);
      const c = criarCampanhas(db, { producoes: {} });
      c.criar('Lançamento', { email: 'ana@empresa.com', nome: 'Ana' });
      db.close();
      const de = abrirBanco(caminho);
      const c2 = criarCampanhas(de, { producoes: {} });
      expect(c2.lista().map((x: Campanha) => x.nome)).toEqual(['Lançamento']);
      de.close();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});
