// @vitest-environment node
/* As áreas de trabalho (#101): quem é quem pela ligação por e-mail com os cadastros de redatores e editores do Teable
   (falso), a última área lembrada no SQLite e "meus roteiros". Nomes e e-mails inventados. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, fazerBackup } from '../servidor/app.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENV = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
  CADASTRO_ADMINS: 'chefe@empresa.com',
};

/** O Teable de mentira: só as tabelas de redatores e editores (com o e-mail do login) e as das keys, vazias. */
function falso() {
  const tabelas: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
    tblRed: [
      { id: 'recR1', fields: { redator: 'Marina Teles', email: 'marina.teles@empresa.com' } },
      { id: 'recR2', fields: { redator: 'Júlio Pires', email: 'julio.pires@empresa.com' } },
      { id: 'recR3', fields: { redator: 'Otávio Reis' } },
    ],
    tblEdi: [
      { id: 'recE1', fields: { editor: 'Caio Brandão', email: 'caio.brandao@empresa.com' } },
      // o Júlio também edita
      { id: 'recE2', fields: { editor: 'Júlio Pires', email: 'julio.pires@empresa.com' } },
    ],
    tblKeyRed: [],
    tblKeyEdi: [],
  };
  const pedidos: string[] = [];
  const buscar = async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? 'GET';
    pedidos.push(`${metodo} ${url}`);
    const u = new URL(url);
    const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(u.pathname)!;
    if (metodo !== 'GET') throw new Error(`as áreas só leem o Teable: ${metodo} ${url}`);
    return { ok: true, status: 200, json: async () => ({ records: tabelas[tabela] }), text: async () => '' };
  };
  return { tabelas, pedidos, buscar };
}

const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LOC: HOJE' }] }] };

describe('áreas de trabalho (#101)', () => {
  let servidor: Server;
  let base = '';
  let db: unknown;
  let teable: ReturnType<typeof falso>;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const marina = como('marina.teles@empresa.com');
  const caio = como('caio.brandao@empresa.com');
  const julio = como('julio.pires@empresa.com');
  const davi = como('davi.rocha@empresa.com');
  const chefe = como('chefe@empresa.com');
  const eu = async (quem: ReturnType<typeof como>) => (await quem('/api/eu')).json();
  const lembrar = (quem: ReturnType<typeof como>, preferencias: Record<string, unknown>) => quem('/api/eu/preferencias', { method: 'PUT', body: JSON.stringify(preferencias) });
  const subir = async (banco: unknown) => {
    teable = falso();
    const app = criarApp({ db: banco, env: {}, cadastros: criarCadastros(ENV, { buscar: teable.buscar }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  };
  const guardar = (quem: ReturnType<typeof como>, id: string, meta: Record<string, unknown>) =>
    quem(`/api/roteiros/${id}`, { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: '', programa: '', praca: '', dataExibicao: '', redator: '', editor: '', ...meta }, doc }, nArtes: 2 }) });

  beforeAll(async () => {
    db = abrirBanco(':memory:');
    await subir(db);
    // quem sobe os roteiros é a arte (o Davi); o redator e o editor vêm no roteiro, pelo nome
    await guardar(davi, 'rot-chef-1', { claquete: 'CHEF(FUT) 3/12 SP', programa: 'Chef do Futuro', praca: 'SP', dataExibicao: '2026-12-03', redator: 'Marina Teles', editor: 'Caio Brandão' });
    await guardar(davi, 'rot-fest-1', { claquete: 'FESTIVAL(VER) 5/12 REDE', programa: 'Festival de Verão', praca: 'G5', dataExibicao: '2026-12-05', redator: 'MARINA TELES', editor: 'Júlio Pires' });
    await guardar(davi, 'rot-nov-1', { claquete: 'NOVELA7(CAP) 4/12 SP', programa: 'Sete Mares', praca: 'SP', dataExibicao: '2026-12-04', redator: 'Júlio Pires', editor: 'Caio Brandao' });
    await guardar(davi, 'rot-sem-1', { claquete: 'AUDITORIO(DOM) SP', redator: 'Otávio Reis', editor: '' });
  });
  afterAll(() => servidor.close());

  it('pelo e-mail no cadastro: o redator ganha a área Redator, o editor a Editor, e todo mundo a Designer', async () => {
    expect((await eu(marina)).areas).toEqual(['designer', 'redator']);
    expect((await eu(caio)).areas).toEqual(['designer', 'editor']);
  });

  it('quem está nos dois cadastros tem as três áreas; quem não está em nenhum fica só na Designer', async () => {
    expect((await eu(julio)).areas).toEqual(['designer', 'redator', 'editor']);
    expect((await eu(davi)).areas).toEqual(['designer']);
  });

  it('o administrador tem as três áreas, mesmo sem cadastro', async () => {
    const d = await eu(chefe);
    expect(d.admin).toBe(true);
    expect(d.areas).toEqual(['designer', 'redator', 'editor']);
  });

  it('a primeira entrada abre na Designer; a última área usada fica lembrada por pessoa, também com o servidor de novo', async () => {
    expect((await eu(marina)).area).toBe('designer');
    const r = await lembrar(marina, { area: 'redator' });
    expect(r.status).toBe(200);
    expect((await r.json()).preferencias).toEqual({ area: 'redator' });
    expect((await eu(marina)).area).toBe('redator');
    // a de cada um: a do Caio continua a Designer
    expect((await eu(caio)).area).toBe('designer');
    servidor.close();
    await subir(db);
    const d = await eu(marina);
    expect(d.area).toBe('redator');
    expect(d.preferencias).toEqual({ area: 'redator' });
  });

  it('a preferência entra no backup do SQLite', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'promeiro-backup-'));
    try {
      const copia = abrirBanco(fazerBackup(db, pasta));
      const app = criarApp({ db: copia, env: {}, cadastros: criarCadastros(ENV, { buscar: falso().buscar }) });
      const s = createServer(app);
      await new Promise<void>((ok) => s.listen(0, ok));
      const r = await fetch(`http://localhost:${(s.address() as { port: number }).port}/api/eu`, { headers: { 'cf-access-authenticated-user-email': 'marina.teles@empresa.com' } });
      expect((await r.json()).area).toBe('redator');
      s.close();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('a área que a pessoa não tem não é lembrada; a preferência desconhecida é recusada', async () => {
    const r = await lembrar(davi, { area: 'editor' });
    expect(r.status).toBe(400);
    expect((await r.json()).erro).toBe('Você não tem a área editor.');
    expect((await eu(davi)).area).toBe('designer');
    expect((await lembrar(davi, { qualquer: 1 })).status).toBe(400);
    expect((await lembrar(davi, { area: 'designer' })).status).toBe(200);
  });

  it('a área lembrada que a pessoa perdeu (saiu do cadastro) volta à Designer', async () => {
    expect((await lembrar(caio, { area: 'editor' })).status).toBe(200);
    teable.tabelas.tblEdi.splice(0, 1);
    await chefe('/api/cadastros?renovar=1');
    const d = await eu(caio);
    expect(d.areas).toEqual(['designer']);
    expect(d.area).toBe('designer');
  });

  it('"meus roteiros" no Redator: os roteiros em que a pessoa é o redator (o nome sem caixa e acento), por data', async () => {
    const d = await (await julio('/api/meus-roteiros?area=redator')).json();
    expect(d.nome).toBe('Júlio Pires');
    expect(d.roteiros.map((r: { id: string }) => r.id)).toEqual(['rot-nov-1']);
    const m = await (await marina('/api/meus-roteiros?area=redator')).json();
    expect(m.roteiros.map((r: { id: string; meta: { claquete: string } }) => [r.id, r.meta.claquete])).toEqual([
      ['rot-chef-1', 'CHEF(FUT) 3/12 SP'],
      ['rot-fest-1', 'FESTIVAL(VER) 5/12 REDE'],
    ]);
  });

  it('"meus roteiros" no Editor: os roteiros em que a pessoa é o editor', async () => {
    const d = await (await julio('/api/meus-roteiros?area=editor')).json();
    expect(d.nome).toBe('Júlio Pires');
    expect(d.roteiros.map((r: { id: string }) => r.id)).toEqual(['rot-fest-1']);
  });

  it('sem cadastro ligado, "meus roteiros" vem vazio e sem nome; a área que não existe é recusada', async () => {
    expect(await (await davi('/api/meus-roteiros?area=redator')).json()).toEqual({ area: 'redator', nome: null, roteiros: [] });
    expect((await davi('/api/meus-roteiros?area=designer')).status).toBe(400);
    // nada foi escrito no Teable
    expect(teable.pedidos.every((p) => p.startsWith('GET '))).toBe(true);
  });

  /* ---------- as três exibições do Redator e do Editor (#103) ---------- */

  it('a exibição fica lembrada por pessoa e por área, junto da última área, também com o servidor de novo', async () => {
    // o Júlio é redator e editor: uma exibição em cada área
    const r = await lembrar(julio, { 'exibicao.redator': 'quadro' });
    expect(r.status).toBe(200);
    expect((await r.json()).preferencias).toEqual({ 'exibicao.redator': 'quadro' });
    expect((await lembrar(julio, { 'exibicao.editor': 'estado', area: 'editor' })).status).toBe(200);
    expect((await eu(julio)).preferencias).toEqual({ area: 'editor', 'exibicao.redator': 'quadro', 'exibicao.editor': 'estado' });
    // trocar a de uma área não mexe na outra
    expect((await lembrar(julio, { 'exibicao.redator': 'dia' })).status).toBe(200);
    // a de cada um: a Marina não herda a do Júlio
    expect((await eu(marina)).preferencias).toEqual({ area: 'redator' });
    servidor.close();
    await subir(db);
    expect((await eu(julio)).preferencias).toEqual({ area: 'editor', 'exibicao.redator': 'dia', 'exibicao.editor': 'estado' });
  });

  it('a exibição inválida é recusada, e nada é gravado', async () => {
    const antes = (await eu(marina)).preferencias;
    const recusa = async (p: Record<string, unknown>, erro: string) => {
      const r = await lembrar(marina, p);
      expect(r.status).toBe(400);
      expect((await r.json()).erro).toBe(erro);
    };
    await recusa({ 'exibicao.redator': 'mural' }, 'Exibição desconhecida: escolha por dia, quadro ou por estado.');
    await recusa({ 'exibicao.redator': null }, 'Exibição desconhecida: escolha por dia, quadro ou por estado.');
    // a Designer não tem exibições; a área que a pessoa não tem também não guarda a exibição
    await recusa({ 'exibicao.designer': 'quadro' }, 'Preferência desconhecida: exibicao.designer.');
    await recusa({ 'exibicao.editor': 'quadro' }, 'Você não tem a área editor.');
    // uma chave ruim recusa o pedido inteiro: a boa que veio junto também não é gravada
    await recusa({ 'exibicao.redator': 'estado', area: 'mural' }, 'Área desconhecida.');
    expect((await eu(marina)).preferencias).toEqual(antes);
  });

  /* ---------- o ciclo do roteiro (#102) ---------- */

  type Banco = { prepare: (s: string) => { run: (...a: unknown[]) => void } };
  /** O envio ao Trello e a Produção do card, como o envio e a releitura da produção da arte deixam no SQLite. */
  const enviar = (id: string, card: string, em: string) => (db as Banco).prepare("INSERT OR REPLACE INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'enviado', ?, ?)").run(id, card, em);
  const producao = (id: string, card: string, p: { etapa: string; designers?: string[]; entregaEm?: string | null; roteiro?: string | null }) =>
    (db as Banco)
      .prepare(
        `INSERT INTO producoes (id, claquete, etapa, designers, card_id, roteiro_id, entrada_em, entrega_em, arquivada, criada_em, atualizada_em) VALUES (?, 'X', ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET etapa = excluded.etapa, designers = excluded.designers, entrega_em = excluded.entrega_em, arquivada = excluded.arquivada`,
      )
      .run(id, p.etapa, JSON.stringify(p.designers ?? []), card, p.roteiro ?? null, '2026-11-26T14:03:00.000Z', p.entregaEm ?? null, p.etapa === 'arquivada' ? 1 : 0, '2026-11-26T14:03:00.000Z', '2026-11-26T14:03:00.000Z');
  type Meu = { id: string; ciclo: { estado: string; passos: { id: string; situacao: string; quando: string | null }[] }; daArte: string[] };
  const meus = async (quem: ReturnType<typeof como>, area: string) => ((await (await quem(`/api/meus-roteiros?area=${area}`)).json()) as { roteiros: Meu[] }).roteiros;
  const doRoteiro = async (quem: ReturnType<typeof como>, area: string, id: string) => (await meus(quem, area)).find((r) => r.id === id)!;
  const passo = (r: Meu, id: string) => r.ciclo.passos.find((p) => p.id === id)!;

  it('o ciclo: o roteiro que chegou à fila e não foi enviado está Em revisão, com quando chegou e sem ninguém da arte', async () => {
    const r = await doRoteiro(marina, 'redator', 'rot-chef-1');
    expect(r.ciclo.estado).toBe('revisao');
    expect(r.ciclo.passos.map((p) => p.situacao)).toEqual(['em-breve', 'em-breve', 'em-breve', 'agora', 'depois', 'depois', 'depois']);
    expect(Date.parse(passo(r, 'revisao').quando ?? '')).toBeGreaterThan(0);
    expect(r.daArte).toEqual([]);
  });

  it('o ciclo: enviado, com a Produção do card em Produzindo, está Produzindo, com o designer da Produção', async () => {
    enviar('rot-chef-1', 'cardchef', '2026-11-26T14:02:00.000Z');
    // ainda sem Produção (a produção da arte não foi relida): já está Produzindo
    expect((await doRoteiro(marina, 'redator', 'rot-chef-1')).ciclo.estado).toBe('produzindo');
    producao('prod-chef', 'cardchef', { etapa: 'produzindo', designers: ['Tânia Arruda'] });
    const r = await doRoteiro(marina, 'redator', 'rot-chef-1');
    expect(r.ciclo.estado).toBe('produzindo');
    expect(passo(r, 'produzindo').quando).toBe('2026-11-26T14:02:00.000Z');
    expect(r.daArte).toEqual(['Tânia Arruda']);
  });

  it('o ciclo: a Produção Entregue (ou arquivada) deixa o roteiro Entregue, com quando foi entregue', async () => {
    producao('prod-chef', 'cardchef', { etapa: 'entregue', designers: ['Tânia Arruda'], entregaEm: '2026-11-27T19:20:00.000Z' });
    let r = await doRoteiro(marina, 'redator', 'rot-chef-1');
    expect(r.ciclo.estado).toBe('entregue');
    expect(passo(r, 'entregue').quando).toBe('2026-11-27T19:20:00.000Z');
    producao('prod-chef', 'cardchef', { etapa: 'arquivada', designers: ['Tânia Arruda'], entregaEm: '2026-11-27T19:20:00.000Z' });
    r = await doRoteiro(marina, 'redator', 'rot-chef-1');
    expect(r.ciclo.estado).toBe('entregue');
  });

  it('o ciclo: a Produção ligada pelo Roteiro (sem o card do envio) também vale', async () => {
    enviar('rot-fest-1', '', '2026-11-26T15:00:00.000Z');
    producao('prod-fest', 'outrocard', { etapa: 'entrada', roteiro: 'rot-fest-1' });
    expect((await doRoteiro(marina, 'redator', 'rot-fest-1')).ciclo.estado).toBe('produzindo');
    // o mesmo roteiro, visto pelo editor
    expect((await doRoteiro(julio, 'editor', 'rot-fest-1')).ciclo.estado).toBe('produzindo');
  });

  it('o ciclo: a data da claquete que já passou deixa o roteiro Exibido', async () => {
    await guardar(davi, 'rot-velho-1', { claquete: 'CHEF(FUT) 3/1 SP', programa: 'Chef do Futuro', dataExibicao: '2026-01-03', redator: 'Marina Teles' });
    const r = await doRoteiro(marina, 'redator', 'rot-velho-1');
    expect(r.ciclo.estado).toBe('exibido');
    expect(passo(r, 'exibido').quando).toBe('2026-01-03');
  });
});

/* ---------- o roteiro aberto: as artes com o estado e a origem (#104) ---------- */

describe('o roteiro aberto: as artes com o estado e a origem (#104)', () => {
  let servidor: Server;
  let base = '';
  let db: unknown;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const caio = como('caio.brandao@empresa.com');
  const marina = como('marina.teles@empresa.com');
  const davi = como('davi.rocha@empresa.com');
  type Banco = { prepare: (s: string) => { run: (...a: unknown[]) => void } };
  type Arte = { texto: string; tipos: string[]; estado: string; origem: string };
  type Artes = { lista: Arte[]; aProduzir: number; entregues: number };
  const artesDe = async (quem: ReturnType<typeof como>, area: string, id: string) =>
    ((await (await quem(`/api/meus-roteiros?area=${area}`)).json()) as { roteiros: { id: string; artes: Artes }[] }).roteiros.find((r) => r.id === id)!.artes;
  const resumo = (a: Artes) => a.lista.map((x) => [x.texto, x.estado, x.origem]);

  /** Um parágrafo com uma arte marcada na revisão (o sublinhado com o tipo). */
  const comArte = (texto: string, subtipo: string, id: string) => ({ type: 'paragraph', content: [{ type: 'text', text: texto, marks: [{ type: 'arte', attrs: { id, subtipo, obs: '' } }] }] });
  const docComArtes = {
    type: 'doc',
    content: [
      comArte('NESTA QUARTA', 'rodape', 'a1'),
      comArte('12 COZINHEIROS', 'cartao', 'a2'),
      comArte('CHEF DO FUTURO', 'lettering', 'a3'),
      // a mesma arte em dois tipos: o checklist a escreve uma vez por tipo
      comArte('DEPOIS DE A FAVORITA', 'rodape', 'a4'),
      comArte('DEPOIS DE A FAVORITA', 'cartao', 'a5'),
      // a que a revisão tirou (✕) não é arte do roteiro
      comArte('APRESENTA', 'rodape', 'a6'),
    ],
  };
  /** A Produção do card, com as artes da produção da arte e as marcadas no checklist. */
  const producao = (etapa: string, artes: string[], marcadas: string[]) =>
    (db as Banco)
      .prepare(
        `INSERT INTO producoes (id, claquete, etapa, artes, artes_marcadas, card_id, entrada_em, arquivada, criada_em, atualizada_em) VALUES ('prod-a', 'CHEF(FUT) 3/12 SP', ?, ?, ?, 'cardartes', '2026-11-26T14:03:00.000Z', ?, '2026-11-26T14:03:00.000Z', '2026-11-26T14:03:00.000Z')
         ON CONFLICT (id) DO UPDATE SET etapa = excluded.etapa, artes = excluded.artes, artes_marcadas = excluded.artes_marcadas, arquivada = excluded.arquivada`,
      )
      .run(etapa, JSON.stringify(artes), JSON.stringify(marcadas), etapa === 'arquivada' ? 1 : 0);
  const ITENS = ['NESTA QUARTA', '12 COZINHEIROS', 'DEPOIS DE A FAVORITA (RDP)', 'DEPOIS DE A FAVORITA (CRT)'];

  beforeAll(async () => {
    db = abrirBanco(':memory:');
    const app = criarApp({ db, env: {}, cadastros: criarCadastros(ENV, { buscar: falso().buscar }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    const meta = { claquete: 'CHEF(FUT) 3/12 SP', programa: 'Chef do Futuro', praca: 'SP', dataExibicao: '2026-12-03', redator: 'Marina Teles', editor: 'Caio Brandão', jaExiste: ['CHEF DO FUTURO'], naoProduzir: ['APRESENTA'] };
    await davi('/api/roteiros/rot-artes-1', { method: 'PUT', body: JSON.stringify({ roteiro: { meta, doc: docComArtes }, nArtes: 3 }) });
  });
  afterAll(() => servidor.close());

  it('antes do envio, as artes marcadas na revisão estão a fazer, "do roteiro"; a que já existe aparece como já existe', async () => {
    const a = await artesDe(caio, 'editor', 'rot-artes-1');
    expect(resumo(a)).toEqual([
      ['NESTA QUARTA', 'a-fazer', 'roteiro'],
      ['12 COZINHEIROS', 'a-fazer', 'roteiro'],
      ['CHEF DO FUTURO', 'ja-existe', 'roteiro'],
      ['DEPOIS DE A FAVORITA', 'a-fazer', 'roteiro'],
    ]);
    expect(a.lista[3].tipos).toEqual(['RDP', 'CRT']);
    expect([a.aProduzir, a.entregues]).toEqual([3, 0]);
  });

  it('na Produção em Entrada, as artes continuam a fazer', async () => {
    (db as Banco).prepare("INSERT INTO envios (roteiro_id, estado, card_id, em) VALUES ('rot-artes-1', 'enviado', 'cardartes', '2026-11-26T14:02:00.000Z')").run();
    producao('entrada', ITENS, []);
    expect(resumo(await artesDe(caio, 'editor', 'rot-artes-1')).map((x) => x[1])).toEqual(['a-fazer', 'a-fazer', 'ja-existe', 'a-fazer']);
  });

  it('na Produção em Produzindo: a marcada no checklist está entregue, as outras produzindo; a posta direto na produção é "do designer"', async () => {
    // a de dois tipos com só um marcado ainda está produzindo
    producao('produzindo', [...ITENS, 'SELO AO VIVO'], ['NESTA QUARTA', 'DEPOIS DE A FAVORITA (RDP)']);
    const a = await artesDe(caio, 'editor', 'rot-artes-1');
    expect(resumo(a)).toEqual([
      ['NESTA QUARTA', 'entregue', 'roteiro'],
      ['12 COZINHEIROS', 'produzindo', 'roteiro'],
      ['CHEF DO FUTURO', 'ja-existe', 'roteiro'],
      ['DEPOIS DE A FAVORITA', 'produzindo', 'roteiro'],
      ['SELO AO VIVO', 'produzindo', 'designer'],
    ]);
    expect([a.aProduzir, a.entregues]).toEqual([4, 1]);
    // os dois tipos marcados: entregue; a do designer marcada também
    producao('produzindo', [...ITENS, 'SELO AO VIVO'], ['nesta quarta', 'DEPOIS DE A FAVORITA (RDP)', 'DEPOIS DE A FAVORITA (CRT)', 'SELO AO VIVO']);
    const b = await artesDe(caio, 'editor', 'rot-artes-1');
    expect(resumo(b).map((x) => x[1])).toEqual(['entregue', 'produzindo', 'ja-existe', 'entregue', 'entregue']);
    expect([b.aProduzir, b.entregues]).toEqual([4, 3]);
  });

  it('a marcada no checklist que não está na coluna da produção da arte também é "do designer"', async () => {
    producao('produzindo', ITENS, ['VINHETA EXTRA']);
    const a = await artesDe(caio, 'editor', 'rot-artes-1');
    expect(a.lista.at(-1)).toEqual({ texto: 'VINHETA EXTRA', tipos: [], estado: 'entregue', origem: 'designer' });
  });

  it('na Produção Entregue (ou arquivada), todas as artes a produzir estão entregues', async () => {
    producao('entregue', [...ITENS, 'SELO AO VIVO'], ['NESTA QUARTA']);
    let a = await artesDe(caio, 'editor', 'rot-artes-1');
    expect(resumo(a).map((x) => x[1])).toEqual(['entregue', 'entregue', 'ja-existe', 'entregue', 'entregue']);
    expect([a.aProduzir, a.entregues]).toEqual([4, 4]);
    producao('arquivada', [...ITENS, 'SELO AO VIVO'], []);
    a = await artesDe(caio, 'editor', 'rot-artes-1');
    expect(a.entregues).toBe(4);
  });

  it('o redator vê a mesma conta das artes do roteiro dele', async () => {
    const a = await artesDe(marina, 'redator', 'rot-artes-1');
    expect([a.aProduzir, a.entregues]).toEqual([4, 4]);
  });
});
