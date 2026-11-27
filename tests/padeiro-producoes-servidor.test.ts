// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';

/* O Padeiro e as Produções (#138): com a chave do Padeiro ligada a um designer, o Padeiro lê as Produções em Entrada e
   Produzindo para o grupo NO TRELLO, no formato `trello` que ele já entende (o do índice do buscar do n8n). Nada é lido
   do Trello: as Produções saem do PROMeiro (a carga da produção da arte do Teable de mentira). Claquetes, nomes,
   usuários, computadores e e-mails inventados. */

const CHEFE = 'chefe@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso-do-trello', TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP' };
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg' };
const DIA = 86_400_000;
const ha = (n: number) => new Date(Date.now() - n * DIA).toISOString();
// ids de card fictícios (24 caracteres hexadecimais)
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });

const linhas = () => [
  // Entrada, com card e o checklist (uma arte já marcada); o Roteiro enviado diz a atração, o redator e o editor
  registro('recPad1', { card_ID: card(1), claquete: 'Show da Noite 20/12 SP', status: '[]', designers: null, artes: 'HOJE | AMANHÃ | DOMINGO', data_entrada: ha(1), __last_modified_time: ha(1) }),
  // Produzindo, com outro designer
  registro('recPad2', { card_ID: card(2), claquete: 'Festa na Praça 20/12 SP', status: '["PRODUZINDO"]', designers: '["Caio Prates"]', data_entrada: ha(2), __last_modified_time: ha(2) }),
  // Entregue e arquivada: ficam de fora
  registro('recPad3', { card_ID: card(3), claquete: 'Jogo Final 20/12 SP', status: '["FINALIZADO"]', designers: '["Ana Souza"]', entregue: true, data_entrada: ha(3), data_entrega: ha(1), __last_modified_time: ha(1) }),
  registro('recPad4', { card_ID: card(4), claquete: 'Novela Sinfonia 12/12 SP', status: '["PRODUZINDO"]', designers: '["Ana Souza"]', arquivado: true, data_entrada: ha(4), __last_modified_time: ha(4) }),
  // o filme, sem card. Entra um pouco antes do Show (um dia e meio): com o mesmo `ha(1)`, a ordem entre os dois dependia
  // de o relógio ter virado o milissegundo entre as duas chamadas
  registro('recPad5', { card_ID: '', claquete: 'Filme da Tarde 21/12', status: '["FILME"]', designers: null, filme: [{ id: 'recFilme1', title: 'Filme da Tarde' }], data_entrada: ha(1.5), __last_modified_time: ha(1.5) }),
];
const designers = () => [
  registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana.souza@empresa.com', designer_ID: 'membroAna', status: 'ativo' }),
  registro('recDesignerCaio', { designer: 'Caio Prates', email: 'caio@empresa.com', designer_ID: 'membroCaio', status: 'ativo' }),
];

type Pedido = { metodo: string; caminho: string; consulta: Record<string, string> };
/** O Trello de mentira: anota cada pedido (sem a chave e o token) e responde ok, ou recusa onde `recusar` disser. */
function trelloFalso() {
  const pedidos: Pedido[] = [];
  const estado = { recusar: null as null | ((p: Pedido) => boolean) };
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const consulta = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'key' && k !== 'token'));
    const p = { metodo: init.method ?? 'GET', caminho: url.pathname.replace(/^\/1/, ''), consulta };
    pedidos.push(p);
    if (estado.recusar?.(p)) return new Response('invalid value for idMembers', { status: 400 });
    return Response.json({});
  };
  return { pedidos, estado, buscar };
}

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function preparado() {
  const db = abrirBanco(':memory:');
  // o Roteiro enviado para o card da primeira (o envio liga Roteiro ↔ card)
  const em = ha(1);
  db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'roteiro-show',
    'redatora@empresa.com',
    'Redatora',
    JSON.stringify({ claquete: 'Show da Noite 20/12 SP', programa: 'Show da Noite', redator: 'LIA', editor: 'BETO' }),
    '{}',
    em,
    em,
  );
  db.prepare("INSERT INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'ok', ?, ?)").run('roteiro-show', card(1), em);
  const registros = { ARTE_producao: linhas(), exibicoes: [], designers: designers() };
  const teable = teableFalso(NOMES, { registros });
  const t = trelloFalso();
  const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, trello: (env: unknown, deps: Record<string, unknown>) => criarTrello(env, { ...deps, buscar: t.buscar }) });
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
  /** O Padeiro ligado à Ana. */
  const daAna = async () => {
    const p = await cadastrar();
    expect((await ligar(p.id)).status).toBe(200);
    return p;
  };
  const tela = async () => (await (await chefe('/api/producoes/por-praca')).json()) as { blocos: { colunas: Record<string, { id: string; claquete: string; etapa: string; designers: string[] }[]> }[] };
  const daClaquete = async (inicio: string) => (await tela()).blocos.flatMap((b) => Object.values(b.colunas).flat()).find((c) => c.claquete.startsWith(inicio))!;
  return { db, app, registros, teable, trello: t, padeiro, chefe, cadastrar, ligar, revogar, daAna, daClaquete };
}

type DoPadeiro = { claq: string; red: string; ed: string; card: string; at: string | null; fim: boolean; atr: string; fil: boolean; praca: string; producao: string; etapa: string; artes: { feitas: string[]; aFazer: string[] } };

describe('o Padeiro: a lista das Produções para o grupo NO TRELLO', () => {
  const ler = async (padeiro: (c: string, i?: RequestInit & { chave?: string }) => Promise<Response>, chave?: string) => {
    const r = await padeiro('/api/padeiro/producoes', { chave });
    return { status: r.status, corpo: (await r.json()) as { trello?: DoPadeiro[]; erro?: string; estado?: string } };
  };

  it('com a chave ligada, devolve as Produções em Entrada e Produzindo no formato `trello` do Padeiro, com a praça', async () => {
    const { padeiro, daAna, trello } = await preparado();
    const { chave } = await daAna();
    const { status, corpo } = await ler(padeiro, chave);
    expect(status).toBe(200);
    const lista = corpo.trello!;
    // as mais novas primeiro; a Entregue e a arquivada ficam de fora
    expect(lista.map((c) => c.claq)).toEqual(['Show da Noite 20/12 SP', 'Filme da Tarde 21/12', 'Festa na Praça 20/12 SP']);
    expect(lista[0]).toMatchObject({ claq: 'Show da Noite 20/12 SP', red: 'LIA', ed: 'BETO', card: card(1), fim: false, atr: 'Show da Noite', fil: false, praca: 'SP', etapa: 'entrada' });
    expect(lista[2]).toMatchObject({ claq: 'Festa na Praça 20/12 SP', red: '', ed: '', card: card(2), fim: false, fil: false, praca: 'SP', etapa: 'produzindo' });
    // a idade: a data de entrada, que o Padeiro lê com Date.parse
    expect(Math.abs(Date.parse(lista[0].at!) - Date.now() + DIA)).toBeLessThan(60_000);
    // a Produção vai junto (o aviso do Padeiro, #139, volta com ela)
    expect(lista.every((c) => typeof c.producao === 'string' && c.producao.length > 0)).toBe(true);
    // nada lido do Trello
    expect(trello.pedidos).toEqual([]);
  });

  it('os filmes vêm marcados (fil), com o título do filme como atração e sem card', async () => {
    const { padeiro, daAna } = await preparado();
    const { chave } = await daAna();
    const filme = (await ler(padeiro, chave)).corpo.trello!.find((c) => c.claq.startsWith('Filme da Tarde'))!;
    expect(filme).toMatchObject({ fil: true, atr: 'Filme da Tarde', card: '', fim: false });
  });

  it('as artes de cada Produção (o checklist: feitas e a fazer) vão num campo a mais, que o Padeiro de antes ignora', async () => {
    const { padeiro, daAna, db, daClaquete } = await preparado();
    const { chave } = await daAna();
    // a arte marcada no checklist chega pelo aviso do Trello; aqui, já guardada na Produção
    db.prepare('UPDATE producoes SET artes_marcadas = ? WHERE id = ?').run(JSON.stringify(['amanha']), (await daClaquete('Show da Noite')).id);
    const lista = (await ler(padeiro, chave)).corpo.trello!;
    expect(lista[0].artes).toEqual({ feitas: ['AMANHÃ'], aFazer: ['HOJE', 'DOMINGO'] });
    expect(lista[2].artes).toEqual({ feitas: [], aFazer: [] });
  });

  it('a ligada e a pendente leem (#146: a janela do After mostra com a pendente); a revogada é recusada (403, com o estado); sem chave ou com a errada, 401', async () => {
    const { padeiro, cadastrar, ligar, revogar } = await preparado();
    const { chave, id } = await cadastrar();
    expect((await ler(padeiro, chave)).status).toBe(200);
    await ligar(id);
    expect((await ler(padeiro, chave)).status).toBe(200);
    await revogar(id);
    expect(await ler(padeiro, chave)).toMatchObject({ status: 403, corpo: { estado: 'revogada' } });
    expect((await ler(padeiro)).status).toBe(401);
    expect((await ler(padeiro, 'chave-inventada')).status).toBe(401);
    // a revogada não vê nenhuma Produção
    expect(JSON.stringify((await ler(padeiro, chave)).corpo)).not.toMatch(/Show da Noite/);
  });

  it('só GET', async () => {
    const { padeiro, daAna } = await preparado();
    const { chave } = await daAna();
    expect((await padeiro('/api/padeiro/producoes', { method: 'POST', chave })).status).toBe(404);
  });
});

type EventoDaLinha = { tipo: string; antes: string | null; depois: string | null; quem: string | null; quando: string; origem?: string };

describe('o aviso do Padeiro: abrir o projeto faz o mesmo que o Peguei', () => {
  const MINUTO = 60_000;
  async function comAviso() {
    const s = await preparado();
    const { chave, id: padeiroId } = await s.daAna();
    let n = 0;
    /** O aviso do Padeiro: a Produção (ou o card, ou o filme), a hora da abertura e o identificador (um novo, sem `aviso`). */
    const avisar = async (corpo: Record<string, unknown>, k = chave) => {
      const r = await s.padeiro('/api/padeiro/aviso', { method: 'POST', chave: k, body: JSON.stringify({ aviso: `aviso-${++n}`, abertoEm: new Date().toISOString(), ...corpo }) });
      return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
    };
    const linhaDoTempo = async (id: string) => ((await (await s.chefe(`/api/linha-do-tempo?producao=${id}`)).json()) as { eventos: EventoDaLinha[] }).eventos;
    const resumo = (evs: EventoDaLinha[]) => evs.map((e) => [e.tipo, e.antes, e.depois, e.quem, e.origem ?? '']);
    const ana = (caminho: string, init: RequestInit = {}) => s.chefe(caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana.souza@empresa.com' } });
    return { ...s, chave, padeiroId, avisar, linhaDoTempo, resumo, ana };
  }

  it('pela Produção: a designer da chave entra no card do Trello (só escrita) e na Produção, que vai para Produzindo, com a origem "Padeiro" e a hora da abertura', async () => {
    const { avisar, daClaquete, linhaDoTempo, resumo, trello, teable, chefe, padeiroId } = await comAviso();
    const id = (await daClaquete('Show da Noite')).id;
    const pedidosAoTeable = teable.estado.pedidos.length;
    const abertoEm = new Date(Date.now() - 5 * MINUTO).toISOString();
    const r = await avisar({ producao: id, abertoEm });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ producao: id, etapa: 'produzindo', designers: ['Ana Souza'] });
    expect(trello.pedidos).toEqual([{ metodo: 'POST', caminho: `/cards/${card(1)}/idMembers`, consulta: { value: 'membroAna' } }]);
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    const evs = await linhaDoTempo(id);
    expect(resumo(evs)).toEqual([
      ['etapa', 'entrada', 'produzindo', 'Ana Souza', 'Padeiro'],
      ['designer-entrou', null, 'Ana Souza', 'Ana Souza', 'Padeiro'],
    ]);
    expect(evs.map((e) => e.quando)).toEqual([abertoEm, abertoEm]);
    // nada escrito no Teable
    expect(teable.estado.pedidos.slice(pedidosAoTeable).filter((p: string) => !p.startsWith('GET'))).toEqual([]);
    // a aba Padeiros mostra o último aviso
    const lista = (await (await chefe('/api/cadastros/padeiros')).json()) as { padeiros: { id: string; ultimoAviso: string | null }[] };
    expect(Math.abs(Date.parse(lista.padeiros.find((p) => p.id === padeiroId)!.ultimoAviso!) - Date.now())).toBeLessThan(MINUTO);
  });

  it('pelo card e pelo filme: acha a Produção dele (a do filme sem card muda só no PROMeiro)', async () => {
    const { avisar, daClaquete, trello } = await comAviso();
    expect(await avisar({ card: card(1) })).toMatchObject({ status: 200, corpo: { etapa: 'produzindo', designers: ['Ana Souza'] } });
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'produzindo' });
    expect(await avisar({ filme: 'recFilme1' })).toMatchObject({ status: 200, corpo: { etapa: 'produzindo', designers: ['Ana Souza'] } });
    expect(await daClaquete('Filme da Tarde')).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    expect(trello.pedidos).toHaveLength(1);
  });

  it('a Produção que já tem designer: a nova é somada, e a etapa (Produzindo) fica', async () => {
    const { avisar, daClaquete, linhaDoTempo, resumo, trello } = await comAviso();
    const id = (await daClaquete('Festa na Praça')).id;
    expect((await avisar({ producao: id })).status).toBe(200);
    expect(await daClaquete('Festa na Praça')).toMatchObject({ etapa: 'produzindo', designers: ['Caio Prates', 'Ana Souza'] });
    expect(trello.pedidos).toEqual([{ metodo: 'POST', caminho: `/cards/${card(2)}/idMembers`, consulta: { value: 'membroAna' } }]);
    expect(resumo(await linhaDoTempo(id))).toEqual([['designer-entrou', null, 'Ana Souza', 'Ana Souza', 'Padeiro']]);
  });

  it('a Produção Entregue: a etapa não muda, ninguém entra no card, e fica só o evento "abriu o projeto"', async () => {
    const { avisar, db, linhaDoTempo, resumo, trello } = await comAviso();
    const { id } = db.prepare("SELECT id FROM producoes WHERE claquete LIKE 'Jogo Final%'").get() as { id: string };
    expect(await avisar({ producao: id })).toMatchObject({ status: 200, corpo: { etapa: 'entregue', designers: ['Ana Souza'] } });
    expect(trello.pedidos).toEqual([]);
    expect(resumo(await linhaDoTempo(id))).toEqual([['abriu-o-projeto', null, 'Ana Souza', 'Ana Souza', 'Padeiro']]);
    expect(db.prepare('SELECT etapa FROM producoes WHERE id = ?').get(id)).toEqual({ etapa: 'entregue' });
  });

  it('o aviso repetido (o mesmo identificador) não grava de novo; abrir de novo o que já é dela não duplica evento nem membro', async () => {
    const { avisar, daClaquete, linhaDoTempo, trello } = await comAviso();
    const id = (await daClaquete('Show da Noite')).id;
    expect((await avisar({ producao: id, aviso: 'aviso-unico' })).status).toBe(200);
    expect(await avisar({ producao: id, aviso: 'aviso-unico' })).toMatchObject({ status: 200, corpo: { repetido: true } });
    // o mesmo projeto aberto de novo (outro aviso): a Ana já está nela, em Produzindo
    expect((await avisar({ producao: id })).status).toBe(200);
    expect(await linhaDoTempo(id)).toHaveLength(2);
    expect(trello.pedidos).toHaveLength(1);
  });

  it('o aviso atrasado (mais velho que a última mudança) fica no histórico e não desfaz o que veio depois', async () => {
    const { avisar, daClaquete, linhaDoTempo, resumo, trello, ana } = await comAviso();
    const id = (await daClaquete('Show da Noite')).id;
    // na tela: a Ana pega e volta para a Entrada (agora)
    const mudar = (etapa: string) => ana('/api/producoes/etapa', { method: 'POST', body: JSON.stringify({ producao: id, etapa }) });
    expect((await mudar('produzindo')).status).toBe(200);
    expect((await mudar('entrada')).status).toBe(200);
    const pedidos = trello.pedidos.length;
    // o aviso guardado sem rede, da abertura de uma hora atrás, chega agora
    const abertoEm = new Date(Date.now() - 60 * MINUTO).toISOString();
    expect((await avisar({ producao: id, abertoEm })).status).toBe(200);
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'entrada', designers: [] });
    expect(trello.pedidos).toHaveLength(pedidos);
    const evs = await linhaDoTempo(id);
    // no histórico, na hora da abertura (antes das mudanças da tela)
    expect(resumo(evs).slice(0, 2)).toEqual([
      ['etapa', 'entrada', 'produzindo', 'Ana Souza', 'Padeiro'],
      ['designer-entrou', null, 'Ana Souza', 'Ana Souza', 'Padeiro'],
    ]);
    expect(evs[0].quando).toBe(abertoEm);
    expect(evs).toHaveLength(6);
  });

  it('a abertura no futuro (o relógio do computador adiantado) vale como agora', async () => {
    const { avisar, daClaquete, linhaDoTempo } = await comAviso();
    const id = (await daClaquete('Show da Noite')).id;
    await avisar({ producao: id, abertoEm: new Date(Date.now() + 120 * MINUTO).toISOString() });
    const [ev] = await linhaDoTempo(id);
    expect(Math.abs(Date.parse(ev.quando) - Date.now())).toBeLessThan(MINUTO);
  });

  it('a chave pendente ou revogada é recusada, e nada muda', async () => {
    const { avisar, daClaquete, cadastrar, revogar, padeiroId, trello } = await comAviso();
    const id = (await daClaquete('Show da Noite')).id;
    const pendente = await cadastrar({ usuario: 'cprates', computador: 'WIN-ARTE-02', sigla: 'CP' });
    expect(await avisar({ producao: id }, pendente.chave)).toMatchObject({ status: 403, corpo: { estado: 'pendente' } });
    await revogar(padeiroId);
    expect(await avisar({ producao: id })).toMatchObject({ status: 403, corpo: { estado: 'revogada' } });
    expect((await avisar({ producao: id }, 'chave-inventada')).status).toBe(401);
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'entrada', designers: [] });
    expect(trello.pedidos).toEqual([]);
  });

  it('o Trello recusa: nada muda, e o mesmo aviso pode vir de novo depois', async () => {
    const { avisar, daClaquete, linhaDoTempo, trello } = await comAviso();
    const id = (await daClaquete('Show da Noite')).id;
    trello.estado.recusar = () => true;
    expect((await avisar({ producao: id, aviso: 'aviso-de-novo' })).status).toBe(502);
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'entrada', designers: [] });
    expect(await linhaDoTempo(id)).toEqual([]);
    trello.estado.recusar = null;
    expect(await avisar({ producao: id, aviso: 'aviso-de-novo' })).toMatchObject({ status: 200, corpo: { etapa: 'produzindo' } });
  });

  it('o aviso mal feito: sem identificador, sem a hora certa, sem a Produção, a que não existe e o método', async () => {
    const { avisar, daClaquete, padeiro, chave } = await comAviso();
    const id = (await daClaquete('Show da Noite')).id;
    expect((await avisar({ producao: id, aviso: '' })).status).toBe(400);
    expect((await avisar({ producao: id, abertoEm: 'ontem' })).status).toBe(400);
    expect((await avisar({})).status).toBe(400);
    expect((await avisar({ producao: 'nao-existe' })).status).toBe(404);
    expect((await avisar({ card: 'card-que-nao-existe' })).status).toBe(404);
    expect((await padeiro('/api/padeiro/aviso', { chave })).status).toBe(404);
  });
});
