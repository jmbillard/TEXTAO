// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
import { chaveDeArte } from '../src/modelo/diferencas';

/* As ações da janela "PROMeiro · produções" no After (#147), pela chave do Padeiro: o fogo da arte (sobe um nível,
   como no editor), entregar, voltar para a Entrada e desfazer a última. Entregar e voltar escrevem no Trello como a
   tela de produções; os eventos levam a origem "Padeiro" e a hora da ação, com a regra do conflito. O Trello e o
   Teable são de mentira; claquetes, nomes, usuários, computadores e e-mails inventados. */

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
  // Entrada, com o Roteiro ligado (o fogo vem dele)
  registro('recAc1', { card_ID: card(1), claquete: 'Show da Noite 20/12 SP', status: '[]', designers: null, artes: 'HOJE | AMANHÃ | DOMINGO', data_entrada: ha(1), __last_modified_time: ha(1) }),
  // Produzindo, só com a Ana
  registro('recAc2', { card_ID: card(2), claquete: 'Festa na Praça 20/12 SP', status: '["PRODUZINDO"]', designers: '["Ana Souza"]', artes: 'LETTERING | CARTÃO', data_entrada: ha(2), __last_modified_time: ha(2) }),
  // Produzindo, com a Ana e o Caio
  registro('recAc3', { card_ID: card(3), claquete: 'Corrida 20/12 SP', status: '["PRODUZINDO"]', designers: '["Ana Souza", "Caio Prates"]', artes: 'LETTERING', data_entrada: ha(2), __last_modified_time: ha(2) }),
  // Entregue, da Ana
  registro('recAc4', { card_ID: card(4), claquete: 'Jogo Final 20/12 SP', status: '["FINALIZADO"]', designers: '["Ana Souza"]', entregue: true, artes: 'PLACAR', data_entrada: ha(3), data_entrega: ha(1), __last_modified_time: ha(1) }),
  // Produzindo, só com o Caio
  registro('recAc5', { card_ID: card(5), claquete: 'Novela Sinfonia 20/12 SP', status: '["PRODUZINDO"]', designers: '["Caio Prates"]', artes: 'LETTERING', data_entrada: ha(2), __last_modified_time: ha(2) }),
  // o filme sem card: muda só no PROMeiro
  registro('recAc6', { card_ID: '', claquete: 'Filme da Tarde 21/12', status: '["FILME"]', designers: '["Ana Souza"]', filme: [{ id: 'recFilme1', title: 'Filme da Tarde' }], data_entrada: ha(1.5), __last_modified_time: ha(1.5) }),
];
const designers = () => [
  registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana.souza@empresa.com', designer_ID: 'membroAna', status: 'ativo' }),
  registro('recDesignerCaio', { designer: 'Caio Prates', email: 'caio@empresa.com', designer_ID: 'membroCaio', status: 'ativo' }),
];

type Pedido = { metodo: string; caminho: string; consulta: Record<string, string> };
/** O Trello de mentira: anota cada pedido (sem a chave e o token) e responde ok, ou recusa o que `recusar` disser. */
function trelloFalso() {
  const estado: { recusar: ((p: Pedido) => boolean) | null } = { recusar: null };
  const pedidos: Pedido[] = [];
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const consulta = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'key' && k !== 'token'));
    const p = { metodo: init.method ?? 'GET', caminho: url.pathname.replace(/^\/1/, ''), consulta };
    if (estado.recusar?.(p)) return new Response('card fora do ar', { status: 500 });
    pedidos.push(p);
    return Response.json({});
  };
  return { pedidos, buscar, estado };
}

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

type Banco = { prepare: (sql: string) => { run: (...a: unknown[]) => unknown; get: (...a: unknown[]) => unknown } };
/** Um Roteiro enviado para o card (o envio liga Roteiro ↔ card), com a meta dada. */
function roteiroNoCard(db: Banco, id: string, n: number, meta: Record<string, unknown>) {
  const em = ha(1);
  db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'redatora@empresa.com', 'Redatora', JSON.stringify(meta), '{}', em, em);
  db.prepare("INSERT INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'ok', ?, ?)").run(id, card(n), em);
}

type ArteDaJanela = { nome: string; fogo: number | null; feita: boolean };
type ProducaoDaJanela = { id: string; etapa: string; designers: string[]; comVoce: boolean; artes: ArteDaJanela[] };
type Resposta = { producao?: ProducaoDaJanela; repetido?: boolean; erro?: string; estado?: string; feito?: { eventos: string[]; trello: string[] } };
type EventoDaLinha = { tipo: string; campo?: string; antes: string | null; depois: string | null; quem: string | null; quando: string; origem?: string; desfez?: boolean };

async function preparado({ ydoc }: { ydoc?: Record<string, unknown> } = {}) {
  const db = abrirBanco(':memory:') as Banco;
  // o Show: o editor marcou HOJE como ALTA e DOMINGO como MÉDIA; AMANHÃ fica BAIXA
  roteiroNoCard(db, 'roteiro-show', 1, { claquete: 'Show da Noite 20/12 SP', programa: 'Show da Noite', complexidade: { HOJE: 3, DOMINGO: 2 } });
  roteiroNoCard(db, 'roteiro-jogo', 4, { claquete: 'Jogo Final 20/12 SP', programa: 'Jogo Final' });
  if (ydoc) {
    // o documento compartilhado do roteiro, guardado (ninguém com o editor aberto)
    const doc = new Y.Doc();
    doc.transact(() => Object.entries(ydoc).forEach(([k, v]) => doc.getMap('meta').set(k, v)));
    db.prepare('UPDATE roteiros SET ydoc = ? WHERE id = ?').run(Y.encodeStateAsUpdate(doc), 'roteiro-show');
  }
  const registros = { ARTE_producao: linhas(), exibicoes: [], designers: designers(), atracoes: [], filmes: [] };
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
  const padeiro = (caminho: string, { chave, ...init }: RequestInit & { chave?: string } = {}) =>
    fetch(base + caminho, { ...init, headers: { 'content-type': 'application/json', ...(chave ? { 'x-chave-do-padeiro': chave } : {}), ...init.headers } });
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  const cadastrar = async (o: Record<string, string> = {}) => {
    const r = await padeiro('/api/padeiro/cadastro', { method: 'POST', body: JSON.stringify({ usuario: 'ana.souza', computador: 'MAC-ARTE-07', sistema: 'macOS 15.1', sigla: 'ANA', ...o }) });
    const { chave } = (await r.json()) as { chave: string };
    const lista = (await (await chefe('/api/cadastros/padeiros')).json()) as { padeiros: { id: string; usuario: string; estado: string }[] };
    const id = lista.padeiros.find((p) => p.usuario === (o.usuario ?? 'ana.souza') && p.estado === 'pendente')!.id;
    return { chave, id };
  };
  const ligar = (id: string, designer = 'recDesignerAna') => chefe(`/api/cadastros/padeiros/${id}/ligar`, { method: 'POST', body: JSON.stringify({ designer }) });
  const revogar = (id: string) => chefe(`/api/cadastros/padeiros/${id}/revogar`, { method: 'POST' });
  const ana = await cadastrar();
  expect((await ligar(ana.id)).status).toBe(200);
  let n = 0;
  /** Uma ação da janela (fogo, entregar, voltar, desfazer, aviso): o identificador novo e a hora de agora, sem eles. */
  const agir = async (rota: string, corpo: Record<string, unknown>, k = ana.chave) => {
    const r = await padeiro(`/api/padeiro/${rota}`, { method: 'POST', chave: k, body: JSON.stringify({ acao: `acao-${++n}`, feitaEm: new Date().toISOString(), ...corpo }) });
    return { status: r.status, corpo: (await r.json()) as Resposta };
  };
  const avisar = async (producao: string, k = ana.chave) => {
    const r = await padeiro('/api/padeiro/aviso', { method: 'POST', chave: k, body: JSON.stringify({ aviso: `aviso-${++n}`, abertoEm: new Date().toISOString(), producao }) });
    return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
  };
  const linhaDoTempo = async (id: string) => ((await (await chefe(`/api/linha-do-tempo?producao=${id}`)).json()) as { eventos: EventoDaLinha[] }).eventos;
  const resumo = (evs: EventoDaLinha[]) => evs.map((e) => [e.tipo, e.antes, e.depois, e.quem, e.origem ?? '']);
  const idDe = (inicio: string) => (db.prepare('SELECT id FROM producoes WHERE claquete LIKE ?').get(`${inicio}%`) as { id: string }).id;
  const producao = (id: string) => {
    const l = db.prepare('SELECT etapa, designers, entrega_em FROM producoes WHERE id = ?').get(id) as { etapa: string; designers: string; entrega_em: string | null };
    return { etapa: l.etapa, designers: JSON.parse(l.designers) as string[], entregaEm: l.entrega_em };
  };
  const metaDoShow = () => JSON.parse((db.prepare("SELECT meta FROM roteiros WHERE id = 'roteiro-show'").get() as { meta: string }).meta);
  const ydocDoShow = () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, (db.prepare("SELECT ydoc FROM roteiros WHERE id = 'roteiro-show'").get() as { ydoc: Uint8Array }).ydoc);
    return doc.getMap('meta').toJSON();
  };
  const daTela = (id: string) => (caminho: string, init: RequestInit = {}) => chefe(caminho, { ...init, headers: { 'cf-access-authenticated-user-email': id } });
  return { db, trello: t, padeiro, chefe, cadastrar, ligar, revogar, ana, agir, avisar, linhaDoTempo, resumo, idDe, producao, metaDoShow, ydocDoShow, daTela };
}

describe('o fogo da arte pela janela do After', () => {
  it('sobe um nível (1, 2, 3 e volta para 1) no Roteiro ligado, como o clique no fogo do editor; a janela mostra o novo, e nada vai ao Trello', async () => {
    const { agir, idDe, metaDoShow, linhaDoTempo, resumo, trello } = await preparado();
    const show = idDe('Show da Noite');
    const fogoDe = (r: { corpo: Resposta }, nome: string) => r.corpo.producao!.artes.find((a) => a.nome === nome)!.fogo;
    const r1 = await agir('fogo', { producao: show, arte: 'AMANHÃ' });
    expect(r1.status).toBe(200);
    expect(r1.corpo.feito).toEqual({ eventos: ['fogo'], trello: [] });
    expect(fogoDe(r1, 'AMANHÃ')).toBe(2);
    expect(fogoDe(await agir('fogo', { producao: show, arte: 'amanhã' }), 'AMANHÃ')).toBe(3);
    expect(fogoDe(await agir('fogo', { producao: show, arte: 'AMANHÃ' }), 'AMANHÃ')).toBe(1);
    // HOJE é ALTA: volta para BAIXA, que o editor não guarda
    expect(fogoDe(await agir('fogo', { producao: show, arte: 'HOJE' }), 'HOJE')).toBe(1);
    expect(metaDoShow().complexidade).toEqual({ DOMINGO: 2 });
    expect(metaDoShow().claquete).toBe('Show da Noite 20/12 SP');
    expect(resumo(await linhaDoTempo(show))).toEqual([
      ['fogo', '1', '2', 'Ana Souza', 'Padeiro'],
      ['fogo', '2', '3', 'Ana Souza', 'Padeiro'],
      ['fogo', '3', '1', 'Ana Souza', 'Padeiro'],
      ['fogo', '3', '1', 'Ana Souza', 'Padeiro'],
    ]);
    expect((await linhaDoTempo(show))[0].campo).toBe('AMANHÃ');
    expect(trello.pedidos).toEqual([]);
  });

  it('qualquer designer com a chave ligada muda o fogo (não precisa estar na Produção)', async () => {
    const { agir, idDe } = await preparado();
    // a Ana não está no Show (Entrada, sem ninguém)
    expect((await agir('fogo', { producao: idDe('Show da Noite'), arte: 'DOMINGO' })).corpo.producao!.artes.find((a) => a.nome === 'DOMINGO')!.fogo).toBe(3);
  });

  it('o documento compartilhado do roteiro recebe o fogo novo (a próxima abertura do editor não traz o antigo de volta)', async () => {
    const { agir, idDe, ydocDoShow } = await preparado({ ydoc: { claquete: 'Show da Noite 20/12 SP', complexidade: { HOJE: 3, DOMINGO: 2 }, redator: 'Redatora' } });
    expect((await agir('fogo', { producao: idDe('Show da Noite'), arte: 'AMANHÃ' })).status).toBe(200);
    expect(ydocDoShow()).toEqual({ claquete: 'Show da Noite 20/12 SP', complexidade: { HOJE: 3, DOMINGO: 2, [chaveDeArte('AMANHÃ')]: 2 }, redator: 'Redatora' });
  });

  it('não muda depois de Entregue (409); sem Roteiro ligado, 409; a arte que não está na Produção, 404; nada muda', async () => {
    const { agir, idDe, linhaDoTempo, db } = await preparado();
    const jogo = idDe('Jogo Final');
    const entregue = await agir('fogo', { producao: jogo, arte: 'PLACAR' });
    expect(entregue.status).toBe(409);
    expect(entregue.corpo.erro).toMatch(/Entregue/);
    expect(entregue.corpo.producao).toMatchObject({ etapa: 'entregue' });
    expect(JSON.parse((db.prepare("SELECT meta FROM roteiros WHERE id = 'roteiro-jogo'").get() as { meta: string }).meta).complexidade).toBeUndefined();
    expect((await agir('fogo', { producao: idDe('Festa na Praça'), arte: 'LETTERING' })).status).toBe(409);
    expect((await agir('fogo', { producao: idDe('Show da Noite'), arte: 'NÃO EXISTE' })).status).toBe(404);
    expect((await agir('fogo', { producao: 'nao-existe', arte: 'HOJE' })).status).toBe(404);
    expect((await agir('fogo', { producao: idDe('Show da Noite') })).status).toBe(400);
    expect(await linhaDoTempo(jogo)).toEqual([]);
  });

  it('a ação repetida (o mesmo identificador) não sobe de novo; a atrasada (mais velha que a última mudança do fogo da arte) fica só no histórico', async () => {
    const { agir, idDe, metaDoShow, linhaDoTempo } = await preparado();
    const show = idDe('Show da Noite');
    expect((await agir('fogo', { producao: show, arte: 'AMANHÃ', acao: 'fogo-unico' })).status).toBe(200);
    expect(await agir('fogo', { producao: show, arte: 'AMANHÃ', acao: 'fogo-unico' })).toMatchObject({ status: 200, corpo: { repetido: true } });
    expect(metaDoShow().complexidade[chaveDeArte('AMANHÃ')]).toBe(2);
    // o clique guardado sem rede, de uma hora atrás, chega agora
    const atrasado = await agir('fogo', { producao: show, arte: 'AMANHÃ', feitaEm: new Date(Date.now() - 60 * MINUTO).toISOString() });
    expect(atrasado.status).toBe(200);
    expect(atrasado.corpo.producao!.artes.find((a) => a.nome === 'AMANHÃ')!.fogo).toBe(2);
    expect(metaDoShow().complexidade[chaveDeArte('AMANHÃ')]).toBe(2);
    expect(await linhaDoTempo(show)).toHaveLength(2);
  });
});

describe('entregar pela janela do After', () => {
  it('muda a etapa e move o card para a saída da praça, como o Entreguei da tela; a linha do tempo mostra a origem "Padeiro" e a hora da ação', async () => {
    const { agir, idDe, producao, linhaDoTempo, resumo, trello } = await preparado();
    const festa = idDe('Festa na Praça');
    const feitaEm = new Date(Date.now() - 2 * MINUTO).toISOString();
    // as artes não estão marcadas: o "entregar assim mesmo" é decidido na janela; o servidor só entrega
    const r = await agir('entregar', { producao: festa, feitaEm });
    expect(r.status).toBe(200);
    expect(r.corpo.feito).toEqual({ eventos: ['etapa'], trello: ['card-movido'] });
    expect(r.corpo.producao).toMatchObject({ etapa: 'entregue', designers: ['Ana Souza'] });
    expect(trello.pedidos).toEqual([{ metodo: 'PUT', caminho: `/cards/${card(2)}`, consulta: { idList: 'saidaSP' } }]);
    expect(producao(festa)).toEqual({ etapa: 'entregue', designers: ['Ana Souza'], entregaEm: feitaEm });
    const evs = await linhaDoTempo(festa);
    expect(resumo(evs)).toEqual([['etapa', 'produzindo', 'entregue', 'Ana Souza', 'Padeiro']]);
    expect(evs[0].quando).toBe(feitaEm);
  });

  it('a Produção que já está Entregue: 409, e nada muda; sem card, muda só no PROMeiro', async () => {
    const { agir, idDe, trello, linhaDoTempo } = await preparado();
    const jogo = idDe('Jogo Final');
    expect(await agir('entregar', { producao: jogo })).toMatchObject({ status: 409, corpo: { producao: { etapa: 'entregue' } } });
    expect(await linhaDoTempo(jogo)).toEqual([]);
    expect(await agir('entregar', { producao: idDe('Filme da Tarde') })).toMatchObject({ status: 200, corpo: { feito: { trello: [] }, producao: { etapa: 'entregue' } } });
    expect(trello.pedidos).toEqual([]);
  });

  it('o Trello recusando: 502, a Produção não muda, e o identificador fica livre para tentar de novo', async () => {
    const { agir, idDe, producao, trello, linhaDoTempo } = await preparado();
    const festa = idDe('Festa na Praça');
    trello.estado.recusar = () => true;
    expect((await agir('entregar', { producao: festa, acao: 'entrega-1' })).status).toBe(502);
    expect(producao(festa).etapa).toBe('produzindo');
    expect(await linhaDoTempo(festa)).toEqual([]);
    trello.estado.recusar = null;
    expect(await agir('entregar', { producao: festa, acao: 'entrega-1' })).toMatchObject({ status: 200, corpo: { producao: { etapa: 'entregue' } } });
  });

  it('a entrega atrasada (mais velha que a última mudança da etapa) fica só no histórico, e nada vai ao Trello', async () => {
    const { agir, avisar, idDe, producao, trello, linhaDoTempo } = await preparado();
    const show = idDe('Show da Noite');
    // a Ana pegou agora (o aviso); a entrega guardada sem rede é de uma hora atrás
    expect((await avisar(show)).status).toBe(200);
    const antes = trello.pedidos.length;
    const r = await agir('entregar', { producao: show, feitaEm: new Date(Date.now() - 60 * MINUTO).toISOString() });
    expect(r).toMatchObject({ status: 200, corpo: { feito: { eventos: ['etapa'], trello: [] }, producao: { etapa: 'produzindo' } } });
    expect(producao(show).etapa).toBe('produzindo');
    expect(trello.pedidos).toHaveLength(antes);
    expect((await linhaDoTempo(show)).filter((e) => e.tipo === 'etapa').map((e) => e.depois)).toEqual(['entregue', 'produzindo']);
  });
});

describe('voltar para a Entrada pela janela do After', () => {
  it('tira a designer da Produção e do card; sem ninguém, a Produção volta para a Entrada', async () => {
    const { agir, idDe, producao, trello, linhaDoTempo, resumo } = await preparado();
    const festa = idDe('Festa na Praça');
    const r = await agir('voltar', { producao: festa });
    expect(r.status).toBe(200);
    expect(r.corpo.feito).toEqual({ eventos: ['etapa', 'designer-saiu'], trello: ['membro-saiu'] });
    expect(r.corpo.producao).toMatchObject({ etapa: 'entrada', designers: [], comVoce: false });
    expect(trello.pedidos).toEqual([{ metodo: 'DELETE', caminho: `/cards/${card(2)}/idMembers/membroAna`, consulta: {} }]);
    expect(producao(festa)).toMatchObject({ etapa: 'entrada', designers: [] });
    expect(resumo(await linhaDoTempo(festa))).toEqual([
      ['etapa', 'produzindo', 'entrada', 'Ana Souza', 'Padeiro'],
      ['designer-saiu', 'Ana Souza', null, 'Ana Souza', 'Padeiro'],
    ]);
  });

  it('com outro designer na Produção, só ela sai: a Produção fica em Produzindo', async () => {
    const { agir, idDe, producao, trello } = await preparado();
    const corrida = idDe('Corrida');
    expect(await agir('voltar', { producao: corrida })).toMatchObject({ status: 200, corpo: { feito: { eventos: ['designer-saiu'] }, producao: { etapa: 'produzindo', designers: ['Caio Prates'] } } });
    expect(producao(corrida)).toMatchObject({ etapa: 'produzindo', designers: ['Caio Prates'] });
    expect(trello.pedidos).toEqual([{ metodo: 'DELETE', caminho: `/cards/${card(3)}/idMembers/membroAna`, consulta: {} }]);
  });

  it('a Produção Entregue volta para a Entrada (o card volta para a entrada da praça), como na tela', async () => {
    const { agir, idDe, producao, trello } = await preparado();
    const jogo = idDe('Jogo Final');
    expect(await agir('voltar', { producao: jogo })).toMatchObject({ status: 200, corpo: { feito: { eventos: ['etapa', 'designer-saiu'], trello: ['card-movido', 'membro-saiu'] }, producao: { etapa: 'entrada', designers: [] } } });
    expect(producao(jogo)).toMatchObject({ etapa: 'entrada', designers: [] });
    expect(trello.pedidos).toEqual([
      { metodo: 'PUT', caminho: `/cards/${card(4)}`, consulta: { idList: 'entradaSP' } },
      { metodo: 'DELETE', caminho: `/cards/${card(4)}/idMembers/membroAna`, consulta: {} },
    ]);
  });

  it('quem não está na Produção em Produzindo é recusado (403); a que já está na Entrada, sem a designer, 409; nada muda', async () => {
    const { agir, idDe, producao, trello } = await preparado();
    expect((await agir('voltar', { producao: idDe('Novela Sinfonia') })).status).toBe(403);
    expect(producao(idDe('Novela Sinfonia'))).toMatchObject({ etapa: 'produzindo', designers: ['Caio Prates'] });
    expect(await agir('voltar', { producao: idDe('Show da Noite') })).toMatchObject({ status: 409, corpo: { producao: { etapa: 'entrada' } } });
    expect(trello.pedidos).toEqual([]);
  });
});

describe('desfazer a última ação pela janela do After', () => {
  it('depois de entregar: a Produção volta a Produzindo, e o card, para a entrada da praça', async () => {
    const { agir, idDe, producao, trello, linhaDoTempo, resumo } = await preparado();
    const festa = idDe('Festa na Praça');
    expect((await agir('entregar', { producao: festa, acao: 'entrega' })).status).toBe(200);
    const r = await agir('desfazer', { producao: festa, desfaz: 'entrega' });
    expect(r.status).toBe(200);
    expect(r.corpo.feito).toEqual({ eventos: ['etapa'], trello: ['card-movido'] });
    expect(r.corpo.producao).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    expect(trello.pedidos.at(-1)).toEqual({ metodo: 'PUT', caminho: `/cards/${card(2)}`, consulta: { idList: 'entradaSP' } });
    expect(producao(festa)).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    const evs = await linhaDoTempo(festa);
    expect(resumo(evs).at(-1)).toEqual(['etapa', 'entregue', 'produzindo', 'Ana Souza', 'Padeiro']);
    expect(evs.at(-1)!.desfez).toBe(true);
  });

  it('depois de voltar: a designer entra de novo na Produção e no card, e a etapa volta', async () => {
    const { agir, idDe, producao, trello } = await preparado();
    const festa = idDe('Festa na Praça');
    expect((await agir('voltar', { producao: festa })).status).toBe(200);
    expect(await agir('desfazer', { producao: festa })).toMatchObject({ status: 200, corpo: { feito: { eventos: ['etapa', 'designer-entrou'], trello: ['membro-entrou'] }, producao: { etapa: 'produzindo', designers: ['Ana Souza'] } } });
    expect(producao(festa)).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    expect(trello.pedidos.at(-1)).toEqual({ metodo: 'POST', caminho: `/cards/${card(2)}/idMembers`, consulta: { value: 'membroAna' } });
  });

  it('depois de pegar (o aviso de abrir o projeto): a Produção volta para a Entrada, e a designer sai do card', async () => {
    const { agir, avisar, idDe, producao, trello } = await preparado();
    const show = idDe('Show da Noite');
    expect((await avisar(show)).status).toBe(200);
    expect(producao(show)).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    expect(await agir('desfazer', { producao: show })).toMatchObject({ status: 200, corpo: { feito: { eventos: ['etapa', 'designer-saiu'], trello: ['membro-saiu'] }, producao: { etapa: 'entrada', designers: [] } } });
    expect(producao(show)).toMatchObject({ etapa: 'entrada', designers: [] });
    expect(trello.pedidos.at(-1)).toEqual({ metodo: 'DELETE', caminho: `/cards/${card(1)}/idMembers/membroAna`, consulta: {} });
  });

  it('não desfaz duas vezes, nem o que outro mudou depois, nem quando não há ação sua; o `desfaz` que não é a última, 409', async () => {
    const { agir, idDe, daTela, producao } = await preparado();
    const festa = idDe('Festa na Praça');
    expect((await agir('desfazer', { producao: festa })).status).toBe(409);
    expect((await agir('entregar', { producao: festa, acao: 'a-entrega' })).status).toBe(200);
    expect((await agir('desfazer', { producao: festa, desfaz: 'outra-acao' })).status).toBe(409);
    expect((await agir('desfazer', { producao: festa })).status).toBe(200);
    const deNovo = await agir('desfazer', { producao: festa });
    expect(deNovo.status).toBe(409);
    expect(deNovo.corpo.erro).toMatch(/já foi desfeita/);
    // o Caio pega a Corrida na tela depois da volta da Ana: a volta não se desfaz mais
    const corrida = idDe('Corrida');
    expect((await agir('voltar', { producao: corrida })).status).toBe(200);
    const caio = daTela('caio@empresa.com');
    expect((await caio('/api/producoes/etapa', { method: 'POST', body: JSON.stringify({ producao: corrida, etapa: 'entrada' }) })).status).toBe(200);
    expect(await agir('desfazer', { producao: corrida })).toMatchObject({ status: 409, corpo: { producao: { etapa: 'entrada' } } });
    expect(producao(corrida)).toMatchObject({ etapa: 'entrada', designers: [] });
  });

  it('a ação de outra chave (outro computador) não é desfeita por esta', async () => {
    const { agir, idDe, cadastrar, ligar } = await preparado();
    const festa = idDe('Festa na Praça');
    const outra = await cadastrar({ usuario: 'ana.outra', computador: 'WIN-ARTE-09' });
    await ligar(outra.id);
    expect((await agir('entregar', { producao: festa }, outra.chave)).status).toBe(200);
    expect((await agir('desfazer', { producao: festa })).status).toBe(409);
    expect((await agir('desfazer', { producao: festa }, outra.chave)).status).toBe(200);
  });
});

describe('quem age e como a ação chega', () => {
  it('só a chave ligada age: a pendente e a revogada são recusadas (403, com o estado); sem chave ou com a errada, 401; nada muda', async () => {
    const { agir, idDe, cadastrar, revogar, ana, producao, linhaDoTempo, trello } = await preparado();
    const festa = idDe('Festa na Praça');
    const show = idDe('Show da Noite');
    const pendente = await cadastrar({ usuario: 'cprates', computador: 'WIN-ARTE-02', sigla: 'CP' });
    const pedidos: [string, Record<string, unknown>][] = [
      ['fogo', { producao: show, arte: 'HOJE' }],
      ['entregar', { producao: festa }],
      ['voltar', { producao: festa }],
      ['desfazer', { producao: festa }],
    ];
    for (const [rota, corpo] of pedidos) {
      expect(await agir(rota, corpo, pendente.chave)).toMatchObject({ status: 403, corpo: { estado: 'pendente' } });
      expect((await agir(rota, corpo, 'chave-inventada')).status).toBe(401);
    }
    await revogar(ana.id);
    for (const [rota, corpo] of pedidos) expect(await agir(rota, corpo)).toMatchObject({ status: 403, corpo: { estado: 'revogada' } });
    expect(producao(festa)).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    expect(await linhaDoTempo(festa)).toEqual([]);
    expect(await linhaDoTempo(show)).toEqual([]);
    expect(trello.pedidos).toEqual([]);
  });

  it('cada ação tem identificador (o repetido não grava de novo) e hora; sem eles, 400; o método errado, 404', async () => {
    const { agir, idDe, padeiro, ana, linhaDoTempo, trello } = await preparado();
    const festa = idDe('Festa na Praça');
    for (const rota of ['fogo', 'entregar', 'voltar', 'desfazer']) {
      expect((await agir(rota, { producao: festa, arte: 'LETTERING', acao: '' })).status).toBe(400);
      expect((await agir(rota, { producao: festa, arte: 'LETTERING', feitaEm: 'ontem' })).status).toBe(400);
      expect((await padeiro(`/api/padeiro/${rota}`, { chave: ana.chave })).status).toBe(404);
    }
    expect((await agir('entregar', { producao: festa, acao: 'uma-so' })).status).toBe(200);
    expect(await agir('entregar', { producao: festa, acao: 'uma-so' })).toMatchObject({ status: 200, corpo: { repetido: true, producao: { etapa: 'entregue' } } });
    expect(await linhaDoTempo(festa)).toHaveLength(1);
    expect(trello.pedidos).toHaveLength(1);
  });
});
