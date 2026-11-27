// @vitest-environment node
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, fazerBackup } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';

/* A janela "PROMeiro · produções" no After (#146), pela chave do Padeiro: a Produção como a janela mostra (a praça e a
   etapa, a claquete, a versão da chamada só como o código, o "pronto para abrir" e as artes do roteiro, com o fogo da
   complexidade e se estão feitas) e a arte marcada como feita pelo designer que está na Produção. O Trello e o Teable
   são de mentira; claquetes, nomes, usuários, computadores e e-mails inventados. */

const CHEFE = 'chefe@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso-do-trello', TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP' };
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg', atracoes: 'atracoes_pg', filmes: 'filmes_pg' };
const DIA = 86_400_000;
const MINUTO = 60_000;
const ha = (n: number) => new Date(Date.now() - n * DIA).toISOString();
// ids de card fictícios (24 caracteres hexadecimais)
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });

const linhas = () => [
  // Entrada: a arte HOJE tem dois tipos (dois itens no checklist), e conta uma vez só
  registro('recJan1', { card_ID: card(1), claquete: 'Show da Noite 20/12 SP', status: '[]', designers: null, artes: 'HOJE (RDP) | HOJE (CRT) | AMANHÃ | DOMINGO', data_entrada: ha(1), __last_modified_time: ha(1) }),
  // Produzindo, com a Ana: a atração está no cadastro, mas sem a pasta do projeto
  registro('recJan2', { card_ID: card(2), claquete: 'Festa na Praça 20/12 SP', status: '["PRODUZINDO"]', designers: '["Ana Souza"]', artes: 'LETTERING | CARTÃO', data_entrada: ha(2), __last_modified_time: ha(2) }),
  // os filmes, sem card e sem atração no cadastro: valem os caminhos do filme
  registro('recJan3', { card_ID: '', claquete: 'Filme da Tarde 21/12', status: '["FILME"]', designers: null, filme: [{ id: 'recFilme1', title: 'Filme da Tarde' }], data_entrada: ha(1.5), __last_modified_time: ha(1.5) }),
  registro('recJan4', { card_ID: '', claquete: 'Filme da Noite 22/12', status: '["FILME"]', designers: null, filme: [{ id: 'recFilme2', title: 'Filme da Noite' }], data_entrada: ha(3), __last_modified_time: ha(3) }),
];
/** Os filmes do cadastro, com os caminhos que o Teable calcula (as fórmulas): o da Noite não achou a pasta do projeto. */
const filmes = () => [
  registro('recFilme1', { titulo: 'Filme da Tarde', projeto_win: 'P:\\FILMES\\FILME DA TARDE\\PROJETOS', projeto_mac: '/Volumes/P/FILMES/FILME DA TARDE/PROJETOS', output_win: '', output_mac: '' }),
  registro('recFilme2', { titulo: 'Filme da Noite', projeto_win: 'caminho_nao_encontrado', projeto_mac: 'caminho_nao_encontrado', output_win: 'P:\\FILMES\\FILME DA NOITE\\OUTPUT', output_mac: '/Volumes/P/FILMES/FILME DA NOITE/OUTPUT' }),
];
const designers = () => [
  registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana.souza@empresa.com', designer_ID: 'membroAna', status: 'ativo' }),
  registro('recDesignerCaio', { designer: 'Caio Prates', email: 'caio@empresa.com', designer_ID: 'membroCaio', status: 'ativo' }),
];
const atracoes = () => [
  // o Show tem a pasta do projeto e não a do output: o "pronto para abrir" só precisa da pasta do projeto
  registro('recAtrShow', { atracao: 'Show da Noite', categoria: 'Variedades', projeto_win: 'P:\\SHOW\\PROJETOS', output_win: '' }),
  // a Festa tem a do output, e na do projeto o que o cadastro escreve quando não sabe o caminho
  registro('recAtrFesta', { atracao: 'Festa na Praça', categoria: 'Shows', projeto_win: 'cole_aqui_o_caminho', output_win: 'P:\\FESTA\\OUTPUT' }),
];

type Pedido = { metodo: string; caminho: string; consulta: Record<string, string> };
/** O Trello de mentira: anota cada pedido (sem a chave e o token) e responde ok. */
function trelloFalso() {
  const pedidos: Pedido[] = [];
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const consulta = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'key' && k !== 'token'));
    pedidos.push({ metodo: init.method ?? 'GET', caminho: url.pathname.replace(/^\/1/, ''), consulta });
    return Response.json({});
  };
  return { pedidos, buscar };
}

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

/** Um Roteiro enviado para o card (o envio liga Roteiro ↔ card), com a meta dada e as versões lidas. */
function roteiroNoCard(db: { prepare: (sql: string) => { run: (...a: unknown[]) => unknown } }, id: string, n: number, meta: Record<string, unknown>, versoes: unknown[] = []) {
  const em = ha(1);
  db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em, versoes_lidas) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, 'redatora@empresa.com', 'Redatora', JSON.stringify(meta), '{}', em, em, JSON.stringify(versoes));
  db.prepare("INSERT INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'ok', ?, ?)").run(id, card(n), em);
}

async function preparado({ db = abrirBanco(':memory:') } = {}) {
  // o Show: a revisão diz amanhã e hoje (AH) e a complexidade de HOJE (ALTA) e de DOMINGO (MÉDIA); AMANHÃ fica BAIXA
  roteiroNoCard(db, 'roteiro-show', 1, { claquete: 'Show da Noite 20/12 SP', programa: 'Show da Noite', complexidade: { HOJE: 3, DOMINGO: 2 } }, [
    { codigo: 'A', rotulo: 'amanhã', conhecida: true },
    { codigo: 'H', rotulo: 'hoje', conhecida: true },
  ]);
  roteiroNoCard(db, 'roteiro-festa', 2, { claquete: 'Festa na Praça 20/12 SP', programa: 'Festa na Praça' });
  const registros = { ARTE_producao: linhas(), exibicoes: [], designers: designers(), atracoes: atracoes(), filmes: filmes() };
  const teable = teableFalso(NOMES, { registros });
  const t = trelloFalso();
  const app = criarApp({
    db,
    env: ENV,
    buscarNoTeable: teable,
    abrirPg: teable.abrirPg,
    cadastros: (env: Record<string, string>) => criarCadastros(env, { buscar: teable }),
    trello: (env: unknown, deps: Record<string, unknown>) => criarTrello(env, { ...deps, buscar: t.buscar }),
  });
  await app.tabelasProntas;
  await app.releituraPronta;
  await app.pessoasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  /** O Padeiro: sem login, com a chave no cabeçalho (quando tem). */
  const padeiro = (caminho: string, { chave, ...init }: RequestInit & { chave?: string } = {}) =>
    fetch(base + caminho, { ...init, headers: { 'content-type': 'application/json', ...(chave ? { 'x-chave-do-padeiro': chave } : {}), ...init.headers } });
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  /** Cadastra o Padeiro (pendente) e devolve a chave e o id dele na aba Padeiros. */
  const cadastrar = async (o: Record<string, string> = {}) => {
    const r = await padeiro('/api/padeiro/cadastro', { method: 'POST', body: JSON.stringify({ usuario: 'ana.souza', computador: 'MAC-ARTE-07', sistema: 'macOS 15.1', sigla: 'ANA', ...o }) });
    const { chave } = (await r.json()) as { chave: string };
    const lista = (await (await chefe('/api/cadastros/padeiros')).json()) as { padeiros: { id: string; usuario: string; estado: string }[] };
    const id = lista.padeiros.find((p) => p.usuario === (o.usuario ?? 'ana.souza') && p.estado === 'pendente')!.id;
    return { chave, id };
  };
  const ligar = (id: string, designer = 'recDesignerAna') => chefe(`/api/cadastros/padeiros/${id}/ligar`, { method: 'POST', body: JSON.stringify({ designer }) });
  const revogar = (id: string) => chefe(`/api/cadastros/padeiros/${id}/revogar`, { method: 'POST' });
  /** O Padeiro ligado à Ana (ou a outro designer). */
  const ligado = async (o: Record<string, string> = {}, designer = 'recDesignerAna') => {
    const p = await cadastrar(o);
    expect((await ligar(p.id, designer)).status).toBe(200);
    return p;
  };
  const tela = async () => (await (await chefe('/api/producoes/por-praca')).json()) as { blocos: { colunas: Record<string, CardDaTela[]> }[] };
  const daClaquete = async (inicio: string) => (await tela()).blocos.flatMap((b) => Object.values(b.colunas).flat()).find((c) => c.claquete.startsWith(inicio))!;
  const idDe = (inicio: string) => (db.prepare('SELECT id FROM producoes WHERE claquete LIKE ?').get(`${inicio}%`) as { id: string }).id;
  return { db, trello: t, padeiro, chefe, cadastrar, ligar, revogar, ligado, daClaquete, idDe };
}

type CardDaTela = { id: string; claquete: string; etapa: string; designers: string[]; artes: { aProduzir: number | null; entregues: number } };
type ArteDaJanela = { nome: string; fogo: number | null; feita: boolean; marcada: { por: string; em: string } | null };
type ProducaoDaJanela = { id: string; praca: string; etapa: string; claquete: string; versao: string; pronto: boolean; estado: string; designers: string[]; comVoce: boolean; artes: ArteDaJanela[]; contagem: { feitas: number; total: number } };

type Padeiro = (c: string, i?: RequestInit & { chave?: string }) => Promise<Response>;
const lerProducao = async (padeiro: Padeiro, id: string, chave?: string) => {
  const r = await padeiro(`/api/padeiro/producoes/${encodeURIComponent(id)}`, { chave });
  return { status: r.status, corpo: (await r.json()) as { producao?: ProducaoDaJanela; erro?: string; estado?: string } };
};

describe('a Produção como a janela do After mostra', () => {
  it('traz a praça e a etapa, a claquete, a versão só como o código, o "pronto para abrir" e as artes com o fogo e se estão feitas', async () => {
    const { padeiro, ligado, idDe, trello } = await preparado();
    const { chave } = await ligado();
    const { status, corpo } = await lerProducao(padeiro, idDe('Show da Noite'), chave);
    expect(status).toBe(200);
    expect(corpo.producao).toMatchObject({ praca: 'SP', etapa: 'entrada', claquete: 'Show da Noite 20/12 SP', versao: '(AH)', pronto: true, estado: 'pronto para abrir', designers: [], comVoce: false });
    // HOJE, de dois tipos, é uma arte só; sem complexidade marcada no editor, a arte é BAIXA
    expect(corpo.producao!.artes).toEqual([
      { nome: 'HOJE', fogo: 3, feita: false, marcada: null },
      { nome: 'AMANHÃ', fogo: 1, feita: false, marcada: null },
      { nome: 'DOMINGO', fogo: 2, feita: false, marcada: null },
    ]);
    expect(corpo.producao!.contagem).toEqual({ feitas: 0, total: 3 });
    // nada lido do Trello
    expect(trello.pedidos).toEqual([]);
  });
});

describe('o "pronto para abrir": a atração ligada e a pasta do projeto definida', () => {
  it('sem a pasta do projeto no cadastro (vazia ou "cole_aqui_o_caminho"), "sem pasta", mesmo com a do output; sem Roteiro, as artes ficam sem fogo', async () => {
    const { padeiro, ligado, idDe } = await preparado();
    const { chave } = await ligado();
    expect((await lerProducao(padeiro, idDe('Festa na Praça'), chave)).corpo.producao).toMatchObject({ pronto: false, estado: 'sem pasta', designers: ['Ana Souza'], comVoce: true });
    const filme = (await lerProducao(padeiro, idDe('Filme da Tarde'), chave)).corpo.producao!;
    expect(filme).toMatchObject({ versao: '', artes: [], contagem: { feitas: 0, total: 0 } });
  });

  it('o filme usa os caminhos do filme (o cadastro de filmes), não o de atrações: com a pasta do projeto, "pronto para abrir"; sem ela, "sem pasta"', async () => {
    const { padeiro, ligado, idDe } = await preparado();
    const { chave } = await ligado();
    expect((await lerProducao(padeiro, idDe('Filme da Tarde'), chave)).corpo.producao).toMatchObject({ pronto: true, estado: 'pronto para abrir' });
    expect((await lerProducao(padeiro, idDe('Filme da Noite'), chave)).corpo.producao).toMatchObject({ pronto: false, estado: 'sem pasta' });
  });

  it('sem a atração no cadastro, "sem atração"', async () => {
    const { padeiro, ligado, idDe, db } = await preparado();
    const { chave } = await ligado();
    db.prepare("UPDATE producoes SET claquete = 'Programa Novo 20/12 SP' WHERE id = ?").run(idDe('Show da Noite'));
    db.prepare("UPDATE roteiros SET meta = ? WHERE id = 'roteiro-show'").run(JSON.stringify({ claquete: 'Programa Novo 20/12 SP', programa: 'Programa Novo' }));
    expect((await lerProducao(padeiro, idDe('Programa Novo'), chave)).corpo.producao).toMatchObject({ pronto: false, estado: 'sem atração' });
  });

  it('a lista do Padeiro traz o mesmo estado em cada Produção', async () => {
    const { padeiro, ligado } = await preparado();
    const { chave } = await ligado();
    const r = await padeiro('/api/padeiro/producoes', { chave });
    const lista = ((await r.json()) as { trello: { claq: string; pronto: boolean; estado: string }[] }).trello;
    expect(lista.map((c) => [c.claq, c.pronto, c.estado])).toEqual([
      ['Show da Noite 20/12 SP', true, 'pronto para abrir'],
      ['Filme da Tarde 21/12', true, 'pronto para abrir'],
      ['Festa na Praça 20/12 SP', false, 'sem pasta'],
      ['Filme da Noite 22/12', false, 'sem pasta'],
    ]);
  });
});

describe('quem lê a Produção', () => {
  it('só a ligada lê (a lista e a Produção); a pendente é recusada (403) com o aviso de que espera o administrador ligar; a revogada, 403 com o estado; sem chave ou com a errada, 401; a que não existe, 404', async () => {
    const { padeiro, cadastrar, ligar, revogar, idDe } = await preparado();
    const id = idDe('Show da Noite');
    const { chave, id: padeiroId } = await cadastrar();
    const pendente = await lerProducao(padeiro, id, chave);
    expect(pendente).toMatchObject({ status: 403, corpo: { estado: 'pendente' } });
    expect(pendente.corpo.erro).toMatch(/aguardando um administrador .*ligar/);
    expect(JSON.stringify(pendente.corpo)).not.toMatch(/Show da Noite/);
    const lista = await padeiro('/api/padeiro/producoes', { chave });
    expect(lista.status).toBe(403);
    expect(await lista.json()).toEqual(pendente.corpo);
    await ligar(padeiroId);
    expect(await lerProducao(padeiro, id, chave)).toMatchObject({ status: 200, corpo: { producao: { claquete: 'Show da Noite 20/12 SP', comVoce: false } } });
    await revogar(padeiroId);
    expect(await lerProducao(padeiro, id, chave)).toMatchObject({ status: 403, corpo: { estado: 'revogada' } });
    expect((await padeiro('/api/padeiro/producoes', { chave })).status).toBe(403);
    expect(JSON.stringify((await lerProducao(padeiro, id, chave)).corpo)).not.toMatch(/Show da Noite/);
    expect((await lerProducao(padeiro, id)).status).toBe(401);
    expect((await lerProducao(padeiro, id, 'chave-inventada')).status).toBe(401);
    const outra = await cadastrar({ usuario: 'cprates', computador: 'WIN-ARTE-02', sigla: 'CP' });
    await ligar(outra.id, 'recDesignerCaio');
    expect((await lerProducao(padeiro, 'nao-existe', outra.chave)).status).toBe(404);
  });
});

type EventoDaLinha = { tipo: string; antes: string | null; depois: string | null; quem: string | null; quando: string; origem?: string };

describe('marcar a arte feita pela janela do After', () => {
  async function comArte(o: { db?: unknown } = {}) {
    const s = await preparado(o as Parameters<typeof preparado>[0]);
    const { chave, id: padeiroId } = await s.ligado();
    let n = 0;
    /** A ação de marcar (ou desmarcar): a Produção, a arte, se está feita, a hora e o identificador (um novo, sem `acao`). */
    const marcar = async (corpo: Record<string, unknown>, k = chave) => {
      const r = await s.padeiro('/api/padeiro/arte', { method: 'POST', chave: k, body: JSON.stringify({ acao: `acao-${++n}`, feitaEm: new Date().toISOString(), feita: true, ...corpo }) });
      return { status: r.status, corpo: (await r.json()) as { producao?: ProducaoDaJanela; repetido?: boolean; erro?: string; estado?: string; feito?: { eventos: string[] } } };
    };
    const linhaDoTempo = async (id: string) => ((await (await s.chefe(`/api/linha-do-tempo?producao=${id}`)).json()) as { eventos: EventoDaLinha[] }).eventos;
    const resumo = (evs: EventoDaLinha[]) => evs.map((e) => [e.tipo, e.antes, e.depois, e.quem, e.origem ?? '']);
    return { ...s, chave, padeiroId, marcar, linhaDoTempo, resumo, festa: s.idDe('Festa na Praça') };
  }

  it('a designer que está na Produção marca e desmarca; o PROMeiro guarda quem marcou e quando, e a janela mostra "1 de 2"', async () => {
    const { marcar, festa, linhaDoTempo, resumo, trello } = await comArte();
    const feitaEm = new Date(Date.now() - 5 * MINUTO).toISOString();
    const r = await marcar({ producao: festa, arte: 'LETTERING', feitaEm });
    expect(r.status).toBe(200);
    expect(r.corpo.feito).toEqual({ eventos: ['arte-marcada'] });
    expect(r.corpo.producao!.artes).toEqual([
      { nome: 'LETTERING', fogo: 1, feita: true, marcada: { por: 'Ana Souza', em: feitaEm } },
      { nome: 'CARTÃO', fogo: 1, feita: false, marcada: null },
    ]);
    expect(r.corpo.producao!.contagem).toEqual({ feitas: 1, total: 2 });
    expect(resumo(await linhaDoTempo(festa))).toEqual([['arte-marcada', null, 'LETTERING', 'Ana Souza', 'Padeiro']]);
    // desmarcar
    const d = await marcar({ producao: festa, arte: 'lettering', feita: false });
    expect(d.corpo.producao!.contagem).toEqual({ feitas: 0, total: 2 });
    expect(resumo(await linhaDoTempo(festa)).at(-1)).toEqual(['arte-desmarcada', 'LETTERING', null, 'Ana Souza', 'Padeiro']);
    // nada vai ao Trello
    expect(trello.pedidos).toEqual([]);
  });

  it('a arte de vários tipos marca todos os itens dela; a tela de produções mostra a mesma contagem', async () => {
    const { marcar, idDe, daClaquete, chefe } = await comArte();
    const show = idDe('Show da Noite');
    // a Ana pega o Show (na tela) e marca HOJE, que tem dois itens no checklist
    const ana = (caminho: string, init: RequestInit = {}) => chefe(caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana.souza@empresa.com' } });
    expect((await ana('/api/producoes/etapa', { method: 'POST', body: JSON.stringify({ producao: show, etapa: 'produzindo' }) })).status).toBe(200);
    const r = await marcar({ producao: show, arte: 'HOJE' });
    expect(r.corpo.feito).toEqual({ eventos: ['arte-marcada', 'arte-marcada'] });
    expect(r.corpo.producao!.contagem).toEqual({ feitas: 1, total: 3 });
    expect((await daClaquete('Show da Noite')).artes).toEqual({ aProduzir: 3, entregues: 1 });
    // o Entreguei da tela não acha HOJE faltando (os dois itens estão marcados)
    const entregar = (await (await ana('/api/producoes/etapa', { method: 'POST', body: JSON.stringify({ producao: show, etapa: 'entregue' }) })).json()) as { faltam?: string[] };
    expect(entregar.faltam).toEqual(['AMANHÃ', 'DOMINGO']);
  });

  it('quem não está na Produção é recusado (403), e nada muda', async () => {
    const { marcar, idDe, linhaDoTempo } = await comArte();
    const show = idDe('Show da Noite');
    expect(await marcar({ producao: show, arte: 'HOJE' })).toMatchObject({ status: 403 });
    expect(await linhaDoTempo(show)).toEqual([]);
  });

  it('a ação repetida (o mesmo identificador) não grava de novo; marcar o que já está feito não duplica evento', async () => {
    const { marcar, festa, linhaDoTempo } = await comArte();
    expect((await marcar({ producao: festa, arte: 'CARTÃO', acao: 'acao-unica' })).status).toBe(200);
    expect(await marcar({ producao: festa, arte: 'CARTÃO', acao: 'acao-unica', feita: false })).toMatchObject({ status: 200, corpo: { repetido: true, producao: { contagem: { feitas: 1, total: 2 } } } });
    expect(await marcar({ producao: festa, arte: 'CARTÃO' })).toMatchObject({ status: 200, corpo: { feito: { eventos: [] } } });
    expect(await linhaDoTempo(festa)).toHaveLength(1);
  });

  it('a ação atrasada (mais velha que a última mudança da arte) fica no histórico e não desfaz o que veio depois', async () => {
    const { marcar, festa, linhaDoTempo, resumo } = await comArte();
    expect((await marcar({ producao: festa, arte: 'CARTÃO' })).status).toBe(200);
    // o desmarcar guardado sem rede, de uma hora atrás, chega agora
    const feitaEm = new Date(Date.now() - 60 * MINUTO).toISOString();
    const r = await marcar({ producao: festa, arte: 'CARTÃO', feita: false, feitaEm });
    expect(r.status).toBe(200);
    expect(r.corpo.producao!.artes.find((a) => a.nome === 'CARTÃO')).toMatchObject({ feita: true });
    const evs = await linhaDoTempo(festa);
    expect(resumo(evs)[0]).toEqual(['arte-desmarcada', 'CARTÃO', null, 'Ana Souza', 'Padeiro']);
    expect(evs[0].quando).toBe(feitaEm);
  });

  it('só a chave ligada marca: a pendente e a revogada são recusadas (403, com o estado); sem chave, 401', async () => {
    const { marcar, festa, cadastrar, revogar, padeiroId, linhaDoTempo } = await comArte();
    const pendente = await cadastrar({ usuario: 'cprates', computador: 'WIN-ARTE-02', sigla: 'CP' });
    expect(await marcar({ producao: festa, arte: 'CARTÃO' }, pendente.chave)).toMatchObject({ status: 403, corpo: { estado: 'pendente' } });
    expect((await marcar({ producao: festa, arte: 'CARTÃO' }, 'chave-inventada')).status).toBe(401);
    await revogar(padeiroId);
    expect(await marcar({ producao: festa, arte: 'CARTÃO' })).toMatchObject({ status: 403, corpo: { estado: 'revogada' } });
    expect(await linhaDoTempo(festa)).toEqual([]);
  });

  it('a ação mal feita: sem identificador, sem a hora, sem dizer se está feita, a arte ou a Produção que não existem e o método', async () => {
    const { marcar, festa, padeiro, chave } = await comArte();
    expect((await marcar({ producao: festa, arte: 'CARTÃO', acao: '' })).status).toBe(400);
    expect((await marcar({ producao: festa, arte: 'CARTÃO', feitaEm: 'ontem' })).status).toBe(400);
    expect((await marcar({ producao: festa, arte: 'CARTÃO', feita: 'sim' })).status).toBe(400);
    expect((await marcar({ producao: festa })).status).toBe(400);
    expect((await marcar({ producao: festa, arte: 'NÃO EXISTE' })).status).toBe(404);
    expect((await marcar({ producao: 'nao-existe', arte: 'CARTÃO' })).status).toBe(404);
    expect((await padeiro('/api/padeiro/arte', { chave })).status).toBe(404);
    // a arte que não existe não ocupa o identificador
    expect((await marcar({ producao: festa, arte: 'NÃO EXISTE', acao: 'acao-x' })).status).toBe(404);
    expect((await marcar({ producao: festa, arte: 'CARTÃO', acao: 'acao-x' })).corpo.feito).toEqual({ eventos: ['arte-marcada'] });
  });

  it('a arte marcada, quem marcou e quando e o identificador da ação vão no backup (o SQLite do PROMeiro)', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'janela-'));
    const { marcar, festa, db } = await comArte({ db: abrirBanco(join(pasta, 'roteirista.db')) });
    expect((await marcar({ producao: festa, arte: 'CARTÃO', acao: 'acao-do-backup' })).status).toBe(200);
    const destino = fazerBackup(db, join(pasta, 'backup'));
    const copia = new DatabaseSync(destino);
    const producao = copia.prepare('SELECT artes_marcadas FROM producoes WHERE id = ?').get(festa) as { artes_marcadas: string };
    const evento = copia.prepare("SELECT tipo, depois, quem_nome, origem FROM eventos WHERE producao_id = ? AND tipo = 'arte-marcada'").get(festa);
    const acao = copia.prepare("SELECT producao_id FROM avisos_do_padeiro WHERE aviso = 'acao-do-backup'").get() as { producao_id: string };
    copia.close();
    expect(JSON.parse(producao.artes_marcadas)).toEqual(['CARTÃO']);
    expect(evento).toEqual({ tipo: 'arte-marcada', depois: 'CARTÃO', quem_nome: 'Ana Souza', origem: 'Padeiro' });
    expect(acao.producao_id).toBe(festa);
  });
});
