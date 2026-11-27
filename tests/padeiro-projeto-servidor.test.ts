// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';

/* O projeto do Padeiro (#144): o envio do webhook do projeto (o contrato do docs/webhook-projeto.md do Padeiro), que ia
   ao fluxo "PROMO - PROJETO" do n8n, chega ao PROMeiro pela chave do Padeiro. O PROMeiro grava o que o fluxo gravava: a
   linha na tabela projetos, a atração nova no cadastro, o card ligado a ela na produção da arte e o designer da chave
   no card. O Trello e o Teable são de mentira; claquetes, nomes, caminhos, usuários e computadores inventados. */

const CHEFE = 'chefe@empresa.com';
const ENV = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso-do-trello', TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP' };
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg', atracoes: 'atracoes_pg', KEY_atracoes: 'key_atracoes_pg', projetos: 'projetos_pg' };
const DIA = 86_400_000;
const ha = (n: number) => new Date(Date.now() - n * DIA).toISOString();
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });
type Registro = { id: string; fields: Record<string, unknown> };

const SERVIDOR = '//servidor-falso/VFX/PROGRAMAS';
const linhas = () => [
  // o card de uma atração ainda sem cadastro, já com outra atração ligada
  registro('recPr1', { card_ID: card(1), claquete: 'Rio Batuque 5-12 SP', status: '[]', designers: null, atracao: [{ id: 'recAtrVelha', title: 'Velha' }], data_entrada: ha(1), __last_modified_time: ha(1) }),
  registro('recPr2', { card_ID: card(2), claquete: 'Show da Noite 20/12 SP', status: '["PRODUZINDO"]', designers: '["Ana Souza"]', data_entrada: ha(2), __last_modified_time: ha(2) }),
];
const designers = () => [
  registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana.souza@empresa.com', designer_ID: 'membroAna', status: 'ativo' }),
  // sem o membro do Trello
  registro('recDesignerBia', { designer: 'Bia Lima', email: 'bia@empresa.com', status: 'ativo' }),
];
const atracoes = () => [registro('recAtrShow', { atracao: 'Show da Noite', categoria: 'PROGRAMAS', projeto: '\\\\servidor-falso\\VFX\\PROGRAMAS\\SHOW DA NOITE\\2026', projeto_win: '\\\\servidor-falso\\VFX\\PROGRAMAS\\SHOW DA NOITE\\2026' })];

type Pedido = { metodo: string; caminho: string; consulta: Record<string, string> };
function trelloFalso() {
  const estado: { recusar: ((p: Pedido) => Response | null) | null } = { recusar: null };
  const pedidos: Pedido[] = [];
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const consulta = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'key' && k !== 'token'));
    const p = { metodo: init.method ?? 'GET', caminho: url.pathname.replace(/^\/1/, ''), consulta };
    pedidos.push(p);
    return estado.recusar?.(p) ?? Response.json({});
  };
  return { pedidos, buscar, estado };
}

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

type Item = { codigo: string; texto: string };

async function preparado() {
  const db = abrirBanco(':memory:');
  const registros: Record<string, Registro[]> = { ARTE_producao: linhas(), exibicoes: [], designers: designers(), atracoes: atracoes(), KEY_atracoes: [registro('recKeyShow', { key: 'SHOW DA NOITE', atracoes: [{ id: 'recAtrShow' }] })], projetos: [] };
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
  const chefe = (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': CHEFE, 'content-type': 'application/json', ...init.headers } });
  const cadastrar = async (usuario = 'ana.souza') => {
    const r = await padeiro('/api/padeiro/cadastro', { method: 'POST', body: JSON.stringify({ usuario, computador: 'MAC-ARTE-07', sistema: 'macOS 15.1', sigla: 'ANA' }) });
    const { chave } = (await r.json()) as { chave: string };
    const lista = (await (await chefe('/api/cadastros/padeiros')).json()) as { padeiros: { id: string; usuario: string; estado: string }[] };
    return { chave, id: lista.padeiros.find((p) => p.usuario === usuario && p.estado === 'pendente')!.id };
  };
  const ligada = async (designer = 'recDesignerAna', usuario = 'ana.souza') => {
    const p = await cadastrar(usuario);
    expect((await chefe(`/api/cadastros/padeiros/${p.id}/ligar`, { method: 'POST', body: JSON.stringify({ designer }) })).status).toBe(200);
    return p.chave;
  };
  const enviar = async (chave: string | undefined, corpo: unknown) => {
    const r = await padeiro('/api/padeiro/projeto', { method: 'POST', chave, body: JSON.stringify(corpo) });
    return { status: r.status, corpo: (await r.json()) as { itens?: Item[]; erro?: string; estado?: string } };
  };
  return { app, registros, teable, trello: t, cadastrar, ligada, enviar, chefe };
}

/** O envio do Padeiro (o contrato do webhook do projeto). */
const envio = (o: { momento?: string; atracao?: Record<string, unknown>; card?: { id: string; claquete: string } | null } = {}) => ({
  momento: o.momento ?? 'criado',
  atracao: { nome: 'Show da Noite', tipo: '', nova: false, quadro: '', pasta: `${SERVIDOR}/SHOW DA NOITE/2026`, output: '', aep: `${SERVIDOR}/SHOW DA NOITE/2026/01_PROJETOS/SHOW DA NOITE CHAMADA.aep`, ...o.atracao },
  card: o.card ?? null,
  designer: { login: 'ana.souza', sigla: 'ANA' },
  versao: '2.0.11',
});
const codigos = (itens?: Item[]) => (itens ?? []).map((i) => i.codigo);

describe('o projeto do Padeiro: a chave', () => {
  it('sem a chave, 401; com a pendente, 403; nada é gravado', async () => {
    const { enviar, cadastrar, registros, trello } = await preparado();
    expect((await enviar(undefined, envio())).status).toBe(401);
    expect((await enviar('chave-errada', envio())).status).toBe(401);
    const { chave } = await cadastrar();
    const r = await enviar(chave, envio());
    expect(r.status).toBe(403);
    expect(r.corpo.estado).toBe('pendente');
    expect(registros.projetos).toEqual([]);
    expect(trello.pedidos).toEqual([]);
  });

  it('GET na rota não é nada (404), e o login do Access não vale no caminho do Padeiro', async () => {
    const { chefe } = await preparado();
    expect((await chefe('/api/padeiro/projeto')).status).toBe(404);
  });
});

describe('o projeto do Padeiro: o que o fluxo do n8n gravava', () => {
  it('a atração conhecida sem card: só o registro do projeto, na tabela projetos', async () => {
    const { enviar, ligada, registros, trello } = await preparado();
    const chave = await ligada();
    const r = await enviar(chave, envio());
    expect(r.status).toBe(200);
    expect(r.corpo.itens).toEqual([{ codigo: 'projetoRegistrado', texto: 'projeto registrado' }]);
    expect(registros.projetos).toHaveLength(1);
    const f = registros.projetos[0].fields;
    expect(f).toMatchObject({ aep: `${SERVIDOR}/SHOW DA NOITE/2026/01_PROJETOS/SHOW DA NOITE CHAMADA.aep`, atracao: 'Show da Noite', pasta: `${SERVIDOR}/SHOW DA NOITE/2026`, designer_login: 'ana.souza', designer_sigla: 'ANA', momento: 'criado', versao: '2.0.11' });
    // os vazios ficam de fora; a hora é a da chegada
    expect(f).not.toHaveProperty('tipo');
    expect(f).not.toHaveProperty('card_ID');
    expect(Math.abs(Date.parse(String(f.data)) - Date.now())).toBeLessThan(60_000);
    // nada no cadastro das atrações nem no Trello
    expect(registros.atracoes).toHaveLength(1);
    expect(trello.pedidos).toEqual([]);
  });

  it('o filme leva o ano no registro', async () => {
    const { enviar, ligada, registros } = await preparado();
    const chave = await ligada();
    await enviar(chave, envio({ atracao: { nome: 'Os Pequenos Rastros', tipo: 'FILME', filme: { ano: '2021' } } }));
    expect(registros.projetos[0].fields).toMatchObject({ atracao: 'Os Pequenos Rastros', tipo: 'FILME', filme_ano: '2021' });
  });

  it('a atração nova sem card: entra no cadastro com a categoria, o acervo próprio, as pastas e a key', async () => {
    const { enviar, ligada, registros, trello } = await preparado();
    const chave = await ligada();
    const pasta = `${SERVIDOR}/LA NA MINHA VILA/2026`;
    const r = await enviar(chave, envio({ atracao: { nome: 'LA NA MINHA VILA', tipo: 'programas', nova: true, pasta, output: '//servidor-falso/OUTPUT/PROGRAMAS/LA NA MINHA VILA', aep: `${pasta}/01_PROJETOS/LA NA MINHA VILA CHAMADA.aep` } }));
    expect(r.corpo.itens).toEqual([{ codigo: 'atracaoCadastrada', texto: 'LA NA MINHA VILA cadastrada no banco das atrações' }]);
    const nova = registros.atracoes.find((a) => a.fields.atracao === 'LA NA MINHA VILA')!;
    // a categoria como já está no banco; o caminho de rede com a barra invertida
    expect(nova.fields).toMatchObject({ categoria: 'PROGRAMAS', acervo: 'próprio', projeto: '\\\\servidor-falso\\VFX\\PROGRAMAS\\LA NA MINHA VILA\\2026', output: '\\\\servidor-falso\\OUTPUT\\PROGRAMAS\\LA NA MINHA VILA' });
    expect(registros.KEY_atracoes.find((k) => k.fields.key === 'LA NA MINHA VILA')?.fields.atracoes).toEqual([{ id: nova.id }]);
    expect(registros.projetos).toHaveLength(1);
    expect(trello.pedidos).toEqual([]);
  });

  it('a atração nova num quadro: a pasta da atração é sem o quadro', async () => {
    const { enviar, ligada, registros } = await preparado();
    const chave = await ligada();
    await enviar(chave, envio({ atracao: { nome: 'Festival Novo', tipo: 'SHOWS', nova: true, quadro: 'FINAL', pasta: `${SERVIDOR}/FESTIVAL NOVO/2026/FINAL` } }));
    expect(registros.atracoes.find((a) => a.fields.atracao === 'Festival Novo')?.fields.projeto).toBe('\\\\servidor-falso\\VFX\\PROGRAMAS\\FESTIVAL NOVO\\2026');
  });

  it('a atração "nova" que já está no cadastro, pelo nome sem acento e caixa, ou pela pasta (no Mac): não duplica', async () => {
    const { enviar, ligada, registros } = await preparado();
    const chave = await ligada();
    const r1 = await enviar(chave, envio({ atracao: { nome: 'SHOW DA NOITE!', nova: true } }));
    expect(r1.corpo.itens).toEqual([{ codigo: 'atracaoJaExistia', texto: 'Show da Noite já estava no banco das atrações' }]);
    const r2 = await enviar(chave, envio({ atracao: { nome: 'Show Noturno', nova: true, pasta: '/Volumes/VFX-2/PROGRAMAS/SHOW DA NOITE/2026' } }));
    expect(codigos(r2.corpo.itens)).toEqual(['atracaoJaExistia']);
    expect(registros.atracoes).toHaveLength(1);
    expect(registros.projetos).toHaveLength(2);
  });

  it('abrir e alterar nunca cadastram, mesmo com `nova`', async () => {
    const { enviar, ligada, registros } = await preparado();
    const chave = await ligada();
    const r = await enviar(chave, envio({ momento: 'aberto', atracao: { nome: 'Outra Coisa', nova: true } }));
    expect(codigos(r.corpo.itens)).toEqual(['projetoRegistrado']);
    expect(registros.atracoes).toHaveLength(1);
    expect(registros.projetos[0].fields.momento).toBe('aberto');
  });

  it('a atração nova por card: cadastrada, o card ligado a ela (a de antes fica depois) e o designer da chave no card', async () => {
    const { enviar, ligada, registros, trello } = await preparado();
    const chave = await ligada();
    const r = await enviar(chave, envio({ atracao: { nome: 'RIO BATUQUE', tipo: 'SHOWS', nova: true, pasta: `${SERVIDOR}/RIO BATUQUE/2026` }, card: { id: card(1), claquete: 'Rio Batuque 5-12 SP' } }));
    expect(r.corpo.itens).toEqual([
      { codigo: 'atracaoCadastrada', texto: 'RIO BATUQUE cadastrada no banco das atrações' },
      { codigo: 'cardLigado', texto: 'card Rio Batuque 5-12 SP ligado à atração' },
      { codigo: 'designerEntrouNoCard', texto: 'você entrou no card Rio Batuque 5-12 SP' },
    ]);
    const nova = registros.atracoes.find((a) => a.fields.atracao === 'RIO BATUQUE')!;
    expect(registros.ARTE_producao.find((l) => l.id === 'recPr1')?.fields.atracao).toEqual([{ id: nova.id }, { id: 'recAtrVelha' }]);
    // o membro do Trello vem do cadastro do designer da chave (não do login nem da sigla do envio); só escrita
    expect(trello.pedidos).toEqual([{ metodo: 'POST', caminho: `/cards/${card(1)}/idMembers`, consulta: { value: 'membroAna' } }]);
    expect(registros.projetos[0].fields.card_ID).toBe(card(1));
  });

  it('a atração conhecida por card: só o designer no card; já estava, não entra duas vezes', async () => {
    const { enviar, ligada, registros, trello } = await preparado();
    const chave = await ligada();
    const r1 = await enviar(chave, envio({ card: { id: card(2), claquete: 'Show da Noite 20/12 SP' } }));
    expect(r1.corpo.itens).toEqual([{ codigo: 'designerEntrouNoCard', texto: 'você entrou no card Show da Noite 20/12 SP' }]);
    trello.estado.recusar = () => new Response('member is already on the card', { status: 400 });
    const r2 = await enviar(chave, envio({ momento: 'alterado', card: { id: card(2), claquete: 'Show da Noite 20/12 SP' } }));
    expect(r2.corpo.itens).toEqual([{ codigo: 'designerJaEstavaNoCard', texto: 'você já estava no card Show da Noite 20/12 SP' }]);
    // o card não foi ligado (a atração não é nova)
    expect(registros.ARTE_producao.find((l) => l.id === 'recPr2')?.fields.atracao).toBeUndefined();
  });

  it('o card que não está na produção da arte, e o Trello que recusa: o item erro, e o resto segue', async () => {
    const { enviar, ligada, trello, registros } = await preparado();
    const chave = await ligada();
    trello.estado.recusar = () => new Response('server error', { status: 500 });
    const r = await enviar(chave, envio({ atracao: { nome: 'Coisa Nova', nova: true, pasta: `${SERVIDOR}/COISA NOVA/2026` }, card: { id: card(9), claquete: 'Coisa Nova 1/1' } }));
    expect(r.corpo.itens).toEqual([
      { codigo: 'atracaoCadastrada', texto: 'Coisa Nova cadastrada no banco das atrações' },
      { codigo: 'erro', texto: 'o card Coisa Nova 1/1 não está no banco: não deu para ligá-lo à atração' },
      { codigo: 'erro', texto: 'o Trello não aceitou: você não entrou no card Coisa Nova 1/1; entre à mão' },
    ]);
    expect(registros.projetos).toHaveLength(1);
  });

  it('o designer sem o membro do Trello: designerNaoEncontrado; inativo, volta para os ativos', async () => {
    const { app, enviar, ligada, registros, trello } = await preparado();
    const chave = await ligada('recDesignerBia', 'bia.lima');
    // depois de ligada, a Bia ficou inativa na tabela designers (a verificação das Pessoas viu)
    registros.designers.find((d) => d.id === 'recDesignerBia')!.fields.status = 'inativo';
    await app.verificarPessoas();
    const r = await enviar(chave, envio({ card: { id: card(2), claquete: 'Show da Noite 20/12 SP' } }));
    expect(r.corpo.itens).toEqual([
      { codigo: 'designerNaoEncontrado', texto: 'o seu cadastro de designer no PROMeiro não tem o usuário do Trello: peça para completarem (Configuração · Pessoas) (e voltou para a lista de designers ativos)' },
    ]);
    expect(registros.designers.find((d) => d.id === 'recDesignerBia')?.fields.status).toBe('ativo');
    expect(trello.pedidos).toEqual([]);
  });

  it('o envio fora do formato e o Teable fora do ar: o item erro, sempre 200', async () => {
    const { enviar, ligada, teable } = await preparado();
    const chave = await ligada();
    const r1 = await enviar(chave, { momento: 'criado' });
    expect(r1.status).toBe(200);
    expect(r1.corpo.itens).toEqual([{ codigo: 'erro', texto: 'o envio veio sem a atração e sem o card: nada foi feito' }]);
    teable.estado.fora = true;
    const r2 = await enviar(chave, envio());
    expect(r2.status).toBe(200);
    expect(codigos(r2.corpo.itens)).toEqual(['erro']);
    expect(r2.corpo.itens![0].texto).toMatch(/^o projeto não foi registrado no banco \(.+\): avise a equipe$/);
  });
});
