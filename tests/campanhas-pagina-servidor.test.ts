// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';

/* A página da campanha e a lista das campanhas (#180) pela API: a página (as Produções com etapa, designers e prazo,
   as contagens por etapa sem as arquivadas, as claquetes da Pauta pelo cruzamento que já existe), as sugestões da mesma
   atração, ligar e tirar várias de uma vez, renomear, apagar com desfazer (só o administrador ou quem criou) e a lista
   com as contagens por etapa. Nada vai ao Trello nem ao Teable. Nomes, e-mails, claquetes e ids inventados. */

const DIA = 86_400_000;
const ha = (n: number) => new Date(Date.now() - n * DIA).toISOString();
/** O dia de São Paulo daqui a `n` dias (AAAA-MM-DD) e o mesmo como a claquete escreve ("20/12"). */
const diaSP = (n: number) => new Date(Date.now() + n * DIA).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const naClaquete = (n: number) => diaSP(n).slice(5).split('-').reverse().join('/');
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg', atracoes: 'atracoes_pg', redatores: 'redatores_pg', EDICAO_producao: 'pauta_pg' };
const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso-do-trello', TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP' };

const D = naClaquete(5);
const linhas = () => [
  registro('recCp1', { card_ID: card(41), claquete: `Novela Sinfonia ${D} SP`, status: '["PRODUZINDO"]', designers: '["Ana Souza"]', artes: 'HOJE | AMANHÃ', data_entrada: ha(2), __last_modified_time: ha(2) }),
  registro('recCp2', { card_ID: card(42), claquete: `Novela Sinfonia Elenco ${D} SP`, status: null, designers: null, artes: 'VINHETA', data_entrada: ha(1), __last_modified_time: ha(1) }),
  registro('recCp3', { card_ID: card(43), claquete: `Novela Antiga ${D} SP`, status: '["PRODUZINDO"]', designers: null, artes: 'HOJE', arquivado: true, data_entrada: ha(5), __last_modified_time: ha(5) }),
  registro('recCp4', { card_ID: card(44), claquete: `Cozinha de Vó ${D} SP`, status: '["FINALIZADO"]', designers: '["Ana Souza"]', artes: 'VINHETA', data_entrada: ha(3), __last_modified_time: ha(1) }),
  registro('recCp5', { card_ID: card(45), claquete: `Novela Sinfonia Teaser ${D} SP`, status: null, designers: null, artes: 'VINHETA', data_entrada: ha(1), __last_modified_time: ha(1) }),
];
const designers = () => [registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana@empresa.com', designer_ID: 'membroAna', status: 'ativo' })];
const redatores = () => [registro('recRedRita', { redator: 'Rita Lemos', email: 'rita@empresa.com' })];
/** Uma linha da Pauta da edição: o dia (AAAA-MM-DD) e o editor, com o turno da manhã. */
function naPauta(id: string, claquete: string, editor: string, dia: string) {
  const sp = (h: string) => new Date(`${dia}T${h}:00-03:00`).toISOString();
  return { id, fields: { claquete, key: claquete.toUpperCase(), editor: { id: `rec${editor.replace(/\W/g, '')}`, title: editor }, data: sp('00:00'), expediente_inicio: sp('06:00'), expediente_fim: sp('15:00'), anotacao: null, alterado_em: ha(0) } };
}
const pauta = () => [naPauta('recPa1', `Novela Sinfonia ${D}`, 'Carla Noite', diaSP(3)), naPauta('recPa2', `Outra Coisa ${D}`, 'Beto Tarde', diaSP(3))];

type Campanha = { id: string; nome: string };
type Card = { id: string; claquete: string; etapa: string; designers: string[]; prazo: string | null; arquivada?: boolean; campanhas: Campanha[] };
type Pagina = {
  campanha: Campanha & { criadaEm: string; mexidaEm: string };
  contagens: Record<'entrada' | 'produzindo' | 'entregue', number>;
  producoes: Card[];
  sugestoes: Card[];
  pauta: { linhas: { producao: string; dia: string; editor: string; claquete: string }[]; erro?: string };
  voce: { podeMudar: boolean; podeApagar: boolean; designer?: string | null };
};

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function preparado({ comPauta = true } = {}) {
  const aoTrello: string[] = [];
  const db = abrirBanco(':memory:');
  const { EDICAO_producao: _semPauta, ...semPauta } = NOMES;
  const teable = teableFalso(comPauta ? NOMES : semPauta, { registros: { ARTE_producao: linhas(), exibicoes: [], designers: designers(), atracoes: [], redatores: redatores(), ...(comPauta ? { EDICAO_producao: pauta() } : {}) } });
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
  const davi = como('davi@empresa.com');
  const id = (inicio: string) => (db.prepare('SELECT id FROM producoes WHERE claquete LIKE ?').get(`${inicio} ${D}%`) as { id: string }).id;
  const p = { novela: id('Novela Sinfonia'), elenco: id('Novela Sinfonia Elenco'), teaser: id('Novela Sinfonia Teaser'), antiga: id('Novela Antiga'), cozinha: id('Cozinha de Vó') };
  // a atração escolhida no card aberto (#160): as três da Sinfonia, a Cozinha à parte
  for (const k of ['novela', 'elenco', 'teaser', 'antiga'] as const) db.prepare('UPDATE producoes SET atracao = ? WHERE id = ?').run('Sinfonia', p[k]);
  db.prepare('UPDATE producoes SET atracao = ? WHERE id = ?').run('Cozinha de Vó', p.cozinha);
  const post = (quem: typeof ana, caminho: string, corpo: unknown = {}) => quem(caminho, { method: 'POST', body: JSON.stringify(corpo) });
  /** Cria a campanha (pela Ana, a designer) com as Produções ligadas. */
  const criada = async (nome: string, ligadas: string[] = [], quem = ana) => {
    const c = (await (await post(quem, '/api/campanhas', { nome })).json()).campanha as Campanha;
    if (ligadas.length) expect((await post(quem, `/api/campanhas/${c.id}/producoes`, { producoes: ligadas, liga: true })).status).toBe(200);
    return c;
  };
  const pagina = async (cid: string, quem = davi) => {
    const r = await quem(`/api/campanhas/${cid}`);
    expect(r.status).toBe(200);
    return (await r.json()) as Pagina;
  };
  const lista = async (q = '') => ((await (await davi(`/api/campanhas${q ? `?q=${encodeURIComponent(q)}` : ''}`)).json()) as { campanhas: (Campanha & { producoes: number; etapas: Record<string, number>; mexidaEm: string })[] }).campanhas;
  return { db, teable, aoTrello, ana, rita, chefe, davi, p, post, criada, pagina, lista };
}

describe('a página da campanha (#180)', () => {
  it('mostra as Produções com etapa, designers e prazo, as contagens sem a arquivada e as claquetes da Pauta (o dia e o editor)', async () => {
    const { p, criada, pagina, db, aoTrello } = await preparado();
    const c = await criada('Lançamento Sinfonia', [p.novela, p.elenco, p.cozinha]);
    // a arquivada continua na campanha (ligada antes de arquivar)
    db.prepare('INSERT INTO campanhas_producoes (campanha_id, producao_id, ligada_por, ligada_em) VALUES (?, ?, ?, ?)').run(c.id, p.antiga, 'ana@empresa.com', new Date().toISOString());
    const pg = await pagina(c.id);
    expect(pg.campanha).toMatchObject({ id: c.id, nome: 'Lançamento Sinfonia' });
    expect(pg.contagens).toEqual({ entrada: 1, produzindo: 1, entregue: 1 });
    const porId = new Map(pg.producoes.map((x) => [x.id, x]));
    expect([...porId.keys()].sort()).toEqual([p.novela, p.elenco, p.cozinha, p.antiga].sort());
    expect(porId.get(p.novela)).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'], arquivada: false });
    expect(porId.get(p.novela)!.prazo).toBeTruthy();
    expect(porId.get(p.novela)!.campanhas).toEqual([{ id: c.id, nome: 'Lançamento Sinfonia' }]);
    expect(porId.get(p.antiga)).toMatchObject({ arquivada: true });
    // a claquete da Pauta pelo cruzamento da Pauta com a Produção (sem a praça no fim): o dia e o editor
    expect(pg.pauta.erro).toBeUndefined();
    expect(pg.pauta.linhas).toEqual([expect.objectContaining({ producao: p.novela, dia: diaSP(3), editor: 'Carla Noite', claquete: `Novela Sinfonia ${D}` })]);
    expect(aoTrello).toEqual([]);
  });

  it('sem a Pauta ligada, a página abre do mesmo jeito, com o motivo; a campanha que não existe é 404', async () => {
    const { p, criada, pagina, davi } = await preparado({ comPauta: false });
    const c = await criada('Sem pauta', [p.novela]);
    const pg = await pagina(c.id);
    expect(pg.producoes).toHaveLength(1);
    expect(pg.pauta.linhas).toEqual([]);
    expect(pg.pauta.erro).toMatch(/Pauta|Postgres|Teable/);
    expect((await davi('/api/campanhas/nao-existe')).status).toBe(404);
  });

  it('as sugestões: as Produções da mesma atração que ainda não estão na campanha, sem as arquivadas', async () => {
    const { p, criada, pagina } = await preparado();
    const c = await criada('Lançamento Sinfonia', [p.novela]);
    const pg = await pagina(c.id);
    expect(pg.sugestoes.map((x) => x.id).sort()).toEqual([p.elenco, p.teaser].sort());
    // a campanha sem atração nenhuma não sugere nada
    const vazia = await criada('Vazia');
    expect((await pagina(vazia.id)).sugestoes).toEqual([]);
  });

  it('ligar várias de uma vez e tirar várias: os eventos na linha do tempo, a resposta é a página nova', async () => {
    const { p, ana, post, criada, davi } = await preparado();
    const c = await criada('Lançamento');
    const r = await post(ana, `/api/campanhas/${c.id}/producoes`, { producoes: [p.novela, p.elenco, p.teaser, p.novela], liga: true });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.feito.mudadas.sort()).toEqual([p.novela, p.elenco, p.teaser].sort());
    expect(corpo.pagina.producoes.map((x: Card) => x.id).sort()).toEqual([p.novela, p.elenco, p.teaser].sort());
    expect(corpo.pagina.contagens).toEqual({ entrada: 2, produzindo: 1, entregue: 0 });
    const aberta = await (await davi(`/api/producoes/aberta?producao=${p.elenco}`)).json();
    expect(aberta.eventos.at(-1)).toMatchObject({ tipo: 'campanha-ligada', depois: 'Lançamento', quem: 'Ana Souza' });
    // ligar de novo as que já estão não muda nada
    expect((await (await post(ana, `/api/campanhas/${c.id}/producoes`, { producoes: [p.novela], liga: true })).json()).feito.mudadas).toEqual([]);
    const tirou = await (await post(ana, `/api/campanhas/${c.id}/producoes`, { producoes: [p.elenco, p.teaser], liga: false })).json();
    expect(tirou.feito.mudadas.sort()).toEqual([p.elenco, p.teaser].sort());
    expect(tirou.pagina.producoes.map((x: Card) => x.id)).toEqual([p.novela]);
    // as recusas: sem a lista, a Produção que não existe, a arquivada (para ligar)
    expect((await post(ana, `/api/campanhas/${c.id}/producoes`, { producoes: [], liga: true })).status).toBe(400);
    expect((await post(ana, `/api/campanhas/${c.id}/producoes`, { producoes: [p.novela], liga: 'sim' })).status).toBe(400);
    expect((await post(ana, `/api/campanhas/${c.id}/producoes`, { producoes: ['nao-existe'], liga: true })).status).toBe(404);
    expect((await post(ana, `/api/campanhas/${c.id}/producoes`, { producoes: [p.antiga], liga: true })).status).toBe(404);
    expect((await post(ana, '/api/campanhas/nao-existe/producoes', { producoes: [p.novela], liga: true })).status).toBe(404);
  });

  it('renomear: o nome novo em todas as etiquetas na hora; o nome de outra campanha é recusado; o vazio também', async () => {
    const { p, ana, post, criada, davi } = await preparado();
    const c = await criada('Lançamento', [p.novela]);
    await criada('AESP');
    const r = await post(ana, `/api/campanhas/${c.id}/nome`, { nome: '  Lançamento   Avenida ' });
    expect(r.status).toBe(200);
    expect((await r.json()).pagina.campanha.nome).toBe('Lançamento Avenida');
    const aberta = await (await davi(`/api/producoes/aberta?producao=${p.novela}`)).json();
    expect(aberta.campanhas).toEqual([{ id: c.id, nome: 'Lançamento Avenida' }]);
    // a mesma campanha com outra caixa vale; o nome da outra, não
    expect((await post(ana, `/api/campanhas/${c.id}/nome`, { nome: 'LANÇAMENTO avenida' })).status).toBe(200);
    const dupla = await post(ana, `/api/campanhas/${c.id}/nome`, { nome: 'aesp' });
    expect(dupla.status).toBe(409);
    expect((await dupla.json()).erro).toMatch(/AESP/);
    expect((await post(ana, `/api/campanhas/${c.id}/nome`, { nome: '   ' })).status).toBe(400);
  });

  it('apagar: só o administrador ou quem criou; as Produções ficam; o desfazer traz a campanha e as ligações de volta', async () => {
    const { p, ana, rita, chefe, davi, post, criada, pagina, lista } = await preparado();
    const c = await criada('Lançamento', [p.novela, p.elenco]);
    expect((await pagina(c.id, ana)).voce).toEqual({ podeMudar: true, podeApagar: true, designer: 'Ana Souza' });
    expect((await pagina(c.id, rita)).voce).toEqual({ podeMudar: true, podeApagar: false, designer: null });
    expect((await pagina(c.id, chefe)).voce).toMatchObject({ podeMudar: true, podeApagar: true });
    expect((await pagina(c.id, davi)).voce).toEqual({ podeMudar: false, podeApagar: false, designer: null });
    // a Rita (redatora) liga e tira, mas não apaga a campanha que não criou
    const recusa = await post(rita, `/api/campanhas/${c.id}/apagar`);
    expect(recusa.status).toBe(403);
    expect((await recusa.json()).erro).toMatch(/administrador ou quem criou/);
    expect((await post(davi, `/api/campanhas/${c.id}/apagar`)).status).toBe(403);
    // o administrador apaga: some da lista, das etiquetas e da página; a Produção continua
    const r = await post(chefe, `/api/campanhas/${c.id}/apagar`);
    expect(r.status).toBe(200);
    expect((await r.json()).apagada).toEqual({ id: c.id, nome: 'Lançamento' });
    expect(await lista()).toEqual([]);
    expect((await davi(`/api/campanhas/${c.id}`)).status).toBe(404);
    const aberta = await (await davi(`/api/producoes/aberta?producao=${p.novela}`)).json();
    expect(aberta.campanhas).toEqual([]);
    expect(aberta.eventos.length).toBeGreaterThan(0);
    // apagada, não se liga nada a ela
    expect((await post(ana, `/api/campanhas/${c.id}/producoes`, { producoes: [p.teaser], liga: true })).status).toBe(404);
    // o desfazer: só quem pode apagar; volta com as duas Produções
    expect((await post(rita, `/api/campanhas/${c.id}/desfazer-apagar`)).status).toBe(403);
    const volta = await post(chefe, `/api/campanhas/${c.id}/desfazer-apagar`);
    expect(volta.status).toBe(200);
    expect((await volta.json()).pagina.producoes.map((x: Card) => x.id).sort()).toEqual([p.novela, p.elenco].sort());
    expect((await lista()).map((x) => [x.nome, x.producoes])).toEqual([['Lançamento', 2]]);
    // o desfazer de novo não tem o que desfazer
    expect((await post(chefe, `/api/campanhas/${c.id}/desfazer-apagar`)).status).toBe(404);
  });

  it('o nome da campanha apagada fica livre: criar com ele faz outra, e a apagada não volta mais', async () => {
    const { ana, post, criada } = await preparado();
    const c = await criada('Lançamento');
    await post(ana, `/api/campanhas/${c.id}/apagar`);
    const nova = await post(ana, '/api/campanhas', { nome: 'lançamento' });
    expect(nova.status).toBe(201);
    expect((await nova.json()).campanha.id).not.toBe(c.id);
    expect((await post(ana, `/api/campanhas/${c.id}/desfazer-apagar`)).status).toBe(404);
  });

  it('quem não tem o papel só lê: não renomeia, não liga, não tira', async () => {
    const { p, davi, post, criada } = await preparado();
    const c = await criada('Lançamento', [p.novela]);
    for (const [caminho, corpo] of [[`/api/campanhas/${c.id}/nome`, { nome: 'Outro' }], [`/api/campanhas/${c.id}/producoes`, { producoes: [p.elenco], liga: true }], [`/api/campanhas/${c.id}/producoes`, { producoes: [p.novela], liga: false }]] as const) {
      const r = await post(davi, caminho, corpo);
      expect(r.status, caminho).toBe(403);
    }
  });
});

describe('a lista das campanhas (#180)', () => {
  it('traz quantas Produções em cada etapa (sem a arquivada) e quando foi mexida, a mexida por último primeiro', async () => {
    const { p, criada, lista, db } = await preparado();
    const lanc = await criada('Lançamento Sinfonia', [p.novela, p.elenco, p.cozinha]);
    db.prepare('INSERT INTO campanhas_producoes (campanha_id, producao_id, ligada_por, ligada_em) VALUES (?, ?, ?, ?)').run(lanc.id, p.antiga, 'ana@empresa.com', new Date().toISOString());
    await criada('AESP');
    const todas = await lista();
    expect(todas.map((c) => c.nome)).toEqual(['AESP', 'Lançamento Sinfonia']);
    expect(todas[1]).toMatchObject({ producoes: 3, etapas: { entrada: 1, produzindo: 1, entregue: 1 } });
    expect(todas[0]).toMatchObject({ producoes: 0, etapas: { entrada: 0, produzindo: 0, entregue: 0 } });
    expect(Date.parse(todas[1].mexidaEm)).toBeGreaterThan(0);
    expect((await lista('sinfonia')).map((c) => c.nome)).toEqual(['Lançamento Sinfonia']);
  });

  it('diz se quem pede cria campanhas (o "+ Nova campanha")', async () => {
    const { davi, ana } = await preparado();
    expect((await (await ana('/api/campanhas')).json()).voce).toEqual({ podeMudar: true });
    expect((await (await davi('/api/campanhas')).json()).voce).toEqual({ podeMudar: false });
  });
});
