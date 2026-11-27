// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros, normalizarKey } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { comTabelas } from '../servidor/tabelas-do-teable.mjs';

const ENV = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_CADASTRO: 'tblAtr',
  TEABLE_ATRACOES: 'tblKeyAtr',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_API: 'http://trello/1',
  CADASTRO_ADMINS: 'chefe@empresa.com',
};

type Campo = { id: string; name: string; type: string; options?: { choices: { name: string }[] } };
const ACERVO: Campo = { id: 'fldAcervo', name: 'acervo', type: 'singleSelect', options: { choices: [{ name: 'próprio' }, { name: 'do filme' }, { name: 'sem acervo' }] } };

/** Um Teable de mentira, com as cinco tabelas, e o Trello. Nomes inventados. O campo acervo das atrações só vem
    quando pedido. */
function falso(campoAcervo: Campo | null = null) {
  let n = 100;
  const tabelas: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
    tblAtr: [
      { id: 'recA1', fields: { atracao: 'Show da Noite', categoria: 'Variedades', pasta: 'SHOW', projeto_win: 'P:\\SHOW' } },
      { id: 'recA2', fields: { atracao: 'A Casa da Colina', categoria: 'Novelas', pasta: 'COLINA', ...(campoAcervo ? { acervo: 'sem acervo' } : {}) } },
    ],
    tblKeyAtr: [
      { id: 'recK1', fields: { key: 'SHOW DA NOITE', atracoes: [{ id: 'recA1', title: 'Show da Noite' }] } },
      { id: 'recK2', fields: { key: 'COLINA', atracoes: [{ id: 'recA2', title: 'A Casa da Colina' }] } },
    ],
    tblRed: [{ id: 'recR1', fields: { redator: 'Ana Lima', redator_ID: 'opAna', customField_ID: 'cRedator' } }],
    tblKeyRed: [{ id: 'recKR1', fields: { key: 'ANA LIMA', redator: [{ id: 'recR1', title: 'Ana Lima' }] } }],
    tblEdi: [{ id: 'recE1', fields: { editor: 'Bruno Regis', editor_ID: 'opBruno', customField_ID: 'cEditor' } }],
    tblKeyEdi: [{ id: 'recKE1', fields: { key: 'BRUNO', editor: [{ id: 'recE1', title: 'Bruno Regis' }] } }],
  };
  const pedidos: { metodo: string; url: string; corpo: unknown; token?: string }[] = [];
  const buscar = async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? 'GET';
    const corpo = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    pedidos.push({ metodo, url, corpo, token: (init.headers as Record<string, string>)?.authorization });
    const ok = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
    const u = new URL(url);
    if (u.host === 'trello') return ok({ id: 'opNova' + ++n });
    const m = /\/api\/table\/(\w+)\/(record|field)(?:\/(\w+))?/.exec(u.pathname)!;
    const [, tabela, oque, recId] = m;
    if (oque === 'field')
      return ok([
        { id: 'fldNome', name: 'atracao', type: 'singleLineText' },
        { id: 'fldCat', name: 'categoria', type: 'singleSelect', options: { choices: [{ name: 'Novelas' }, { name: 'Variedades' }, { name: 'Esportes' }] } },
        { id: 'fldPasta', name: 'pasta', type: 'singleLineText' },
        { id: 'fldServ', name: 'servidor', type: 'singleSelect', options: { choices: [{ name: 'HP' }, { name: 'SP' }] } },
        { id: 'fldProj', name: 'projeto_win', type: 'formula', isComputed: true, options: { expression: '"\\\\\\\\" & {fldServ} & "\\\\" & {fldPasta} & "\\\\" & {fldNome}' } },
        { id: 'fldOut', name: 'output_win', type: 'formula', isComputed: true, options: { expression: '{fldProj} & "\\\\OUTPUT"' } },
        ...(campoAcervo ? [campoAcervo] : []),
      ]);
    if (metodo === 'GET') return ok({ records: tabelas[tabela].map((r) => ({ id: r.id, fields: r.fields })) });
    if (metodo === 'PATCH') {
      const r = tabelas[tabela].find((x) => x.id === recId)!;
      Object.assign(r.fields, (corpo as { record: { fields: Record<string, unknown> } }).record.fields);
      return ok(r);
    }
    if (metodo === 'DELETE') {
      tabelas[tabela] = tabelas[tabela].filter((r) => r.id !== recId);
      return ok({});
    }
    const novo = { id: 'rec' + ++n, fields: (corpo as { records: { fields: Record<string, unknown> }[] }).records[0].fields };
    tabelas[tabela].push(novo);
    return ok({ records: [novo] });
  };
  return { buscar, pedidos, tabelas };
}

describe('cadastros no Teable', () => {
  it('acha as fórmulas dos caminhos quando o nome tem espaço ("projeto win")', async () => {
    const { buscar } = falso();
    const comEspaco = async (url: string, init?: RequestInit) => {
      const r = await buscar(url, init);
      if (!/\/field/.test(url)) return r;
      const campos = (await r.json()) as { name: string }[];
      const novos = campos.map((c) =>
        /_win$/.test(c.name) ? { ...c, name: c.name.replace('_', ' '), dbFieldName: c.name } : c,
      );
      return { ...r, json: async () => novos };
    };
    const d = await criarCadastros(ENV, { buscar: comEspaco }).ler();
    expect(d.camposCaminho.map((c: { nome: string }) => c.nome)).toEqual(['servidor', 'pasta']);
  });

  it('lê atrações com as keys, as categorias do campo e os campos que as fórmulas dos caminhos usam', async () => {
    const { buscar } = falso();
    const c = criarCadastros(ENV, { buscar });
    const d = await c.ler();
    expect(d.atracoes.map((a: { nome: string; keys: { key: string }[] }) => [a.nome, a.keys.map((k) => k.key)])).toEqual([
      ['A Casa da Colina', ['COLINA']],
      ['Show da Noite', ['SHOW DA NOITE']],
    ]);
    expect(d.categorias).toEqual(['Novelas', 'Variedades', 'Esportes']);
    // nome e categoria já estão no formulário; o caminho pede só servidor e pasta
    expect(d.camposCaminho).toEqual([
      { nome: 'servidor', tipo: 'singleSelect', opcoes: ['HP', 'SP'] },
      { nome: 'pasta', tipo: 'singleLineText', opcoes: null },
    ]);
    expect(d.formulas.projeto_win).toContain('{servidor}');
    expect(d.editores[0]).toMatchObject({ nome: 'Bruno Regis', keys: [{ id: 'recKE1', key: 'BRUNO' }], trello: true });
  });

  it('atração nova: registro, keys ligadas e normalizadas; key repetida é recusada', async () => {
    const { buscar, pedidos, tabelas } = falso();
    const vocab = { renovacoes: 0, renovar: async () => void vocab.renovacoes++ };
    const c = criarCadastros(ENV, { buscar, vocabulario: vocab });
    const r = await c.novaAtracao({ nome: '  Festa na  Praça ', categoria: 'Variedades', keys: ['Festa na Praça', 'festa'], campos: { pasta: 'FESTA', servidor: 'HP', inventado: 'x' } });
    expect(r.keys).toEqual(['FESTA NA PRACA', 'FESTA']);
    expect(tabelas.tblAtr.at(-1)!.fields).toEqual({ atracao: 'Festa na Praça', categoria: 'Variedades', servidor: 'HP', pasta: 'FESTA' });
    expect(tabelas.tblKeyAtr.slice(-2).map((k) => k.fields)).toEqual([
      { key: 'FESTA NA PRACA', atracoes: [{ id: r.id }] },
      { key: 'FESTA', atracoes: [{ id: r.id }] },
    ]);
    expect(pedidos.filter((p) => p.metodo === 'POST').every((p) => p.token === 'Bearer um-token-so')).toBe(true);
    expect(vocab.renovacoes).toBe(1);
    await expect(c.novaKey('atracao', 'recA2', 'show da noite')).rejects.toThrow('A key SHOW DA NOITE já é de Show da Noite.');
    expect((await c.novaKey('atracao', 'recA2', 'colina resumo')).key).toBe('COLINA RESUMO');
  });

  it('o acervo da atração: lê, cria (próprio é o padrão) e troca', async () => {
    const { buscar, pedidos, tabelas } = falso(ACERVO);
    const c = criarCadastros(ENV, { buscar });
    const d = await c.ler();
    expect(d.atracoes.map((a: { nome: string; acervo: string }) => [a.nome, a.acervo])).toEqual([
      ['A Casa da Colina', 'sem'],
      ['Show da Noite', 'proprio'], // vazio vale próprio
    ]);
    await c.novaAtracao({ nome: 'Festa na Praça', keys: ['FESTA'] });
    await c.novaAtracao({ nome: 'Cine Noite', acervo: 'filme', keys: ['CINE NOITE'] });
    await c.novaAtracao({ nome: 'Chamadas Avulsas', acervo: 'sem', keys: ['AVULSAS'] });
    expect(tabelas.tblAtr.slice(-3).map((r) => r.fields.acervo)).toEqual(['próprio', 'do filme', 'sem acervo']);
    await expect(c.novaAtracao({ nome: 'Outra', acervo: 'VT', keys: ['OUTRA'] })).rejects.toThrow('Escolha o acervo');

    expect(await c.mudarAcervo('recA2', 'filme')).toEqual({ id: 'recA2', nome: 'A Casa da Colina', acervo: 'filme' });
    const patch = pedidos.find((p) => p.metodo === 'PATCH')!;
    expect(patch.url).toBe('http://teable:3000/api/table/tblAtr/record/recA2');
    expect(patch.corpo).toEqual({ fieldKeyType: 'name', typecast: true, record: { fields: { acervo: 'do filme' } } });
    expect((await c.ler()).atracoes.find((a: { id: string }) => a.id === 'recA2').acervo).toBe('filme');
    await expect(c.mudarAcervo('recNaoTem', 'sem')).rejects.toThrow('não está mais nos cadastros');
  });

  it('sem a coluna do acervo no Teable, a atração nova não grava o acervo e a troca é recusada', async () => {
    const { buscar, tabelas } = falso();
    const c = criarCadastros(ENV, { buscar });
    await c.novaAtracao({ nome: 'Festa na Praça', acervo: 'filme', keys: ['FESTA'] });
    expect(tabelas.tblAtr.at(-1)!.fields).toEqual({ atracao: 'Festa na Praça' });
    await expect(c.mudarAcervo('recA2', 'filme')).rejects.toThrow('não tem a coluna do acervo');
  });

  it('redator e editor novos viram opção no Trello e linha no Teable', async () => {
    const { buscar, pedidos, tabelas } = falso();
    const c = criarCadastros(ENV, { buscar });
    const r = await c.novoRedator({ nome: 'Gabriel Pires', keys: ['gpires', 'Gabriel_P'] });
    expect(r.trello).toBe(true);
    const op = pedidos.find((p) => p.url.includes('/customField/cRedator/options'))!;
    expect(op.corpo).toEqual({ pos: 'bottom', value: { text: 'Gabriel Pires' } });
    expect(tabelas.tblRed.at(-1)!.fields).toMatchObject({ redator: 'Gabriel Pires', customField_ID: 'cRedator' });
    expect(tabelas.tblKeyRed.slice(-2).map((k) => k.fields)).toEqual([
      { key: 'GPIRES', redator: [{ id: r.id }] },
      { key: 'GABRIEL P', redator: [{ id: r.id }] },
    ]);
    await expect(c.novoRedator({ nome: 'ana lima' })).rejects.toThrow('já está cadastrado');
    await expect(c.novoRedator({ nome: 'Outra Ana', keys: ['ana lima'] })).rejects.toThrow('A key ANA LIMA já é de Ana Lima.');
    // sem key, vale o nome; a key nova e a remoção levam as keys junto
    const s = await c.novoRedator({ nome: 'Sem Login' });
    expect(tabelas.tblKeyRed.at(-1)!.fields).toEqual({ key: 'SEM LOGIN', redator: [{ id: s.id }] });
    expect((await c.novaKey('redator', s.id, 'slogin')).key).toBe('SLOGIN');
    await c.remover('redator', s.id);
    expect(tabelas.tblKeyRed.some((k) => (k.fields.redator as { id: string }[])[0].id === s.id)).toBe(false);

    const e = await c.novoEditor({ nome: 'Marina Castro', keys: ['marina', 'Marina 16'] });
    expect(pedidos.some((p) => p.url.includes('/customField/cEditor/options'))).toBe(true);
    expect(tabelas.tblKeyEdi.slice(-2).map((k) => k.fields)).toEqual([
      { key: 'MARINA', editor: [{ id: e.id }] },
      { key: 'MARINA 16', editor: [{ id: e.id }] },
    ]);
  });

  it('remover editor leva as keys junto e não mexe no Trello', async () => {
    const { buscar, pedidos, tabelas } = falso();
    const c = criarCadastros(ENV, { buscar });
    await c.remover('editor', 'recE1');
    expect(tabelas.tblEdi).toHaveLength(0);
    expect(tabelas.tblKeyEdi).toHaveLength(0);
    expect(pedidos.some((p) => p.url.includes('trello'))).toBe(false);
  });

  it('key do jeito da pauta', () => {
    expect(normalizarKey(' São João & Cia. ')).toBe('SAO JOAO E CIA');
  });
});

describe('rotas dos cadastros', () => {
  let servidor: Server;
  let base = '';
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const ana = como('ana@empresa.com');
  const chefe = como('chefe@empresa.com');
  beforeAll(async () => {
    const { buscar } = falso(ACERVO);
    const app = criarApp({ db: abrirBanco(':memory:'), env: {}, cadastros: criarCadastros(ENV, { buscar }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  });
  afterAll(() => servidor.close());

  it('todos cadastram, só administradores removem', async () => {
    const lista = await (await ana('/api/cadastros')).json();
    expect(lista.podeApagar).toBe(false);
    expect((await (await chefe('/api/cadastros')).json()).podeApagar).toBe(true);
    const r = await ana('/api/cadastros/atracoes', { method: 'POST', body: JSON.stringify({ nome: 'Festa na Praça', keys: ['FESTA'] }) });
    expect(r.status).toBe(200);
    const sem = await ana('/api/cadastros/atracoes', { method: 'POST', body: JSON.stringify({ nome: 'Sem Key', keys: [] }) });
    expect(sem.status).toBe(400);
    expect((await sem.json()).erro).toBe('A atração precisa de pelo menos uma key.');
    expect((await ana('/api/cadastros/redatores/recR1', { method: 'DELETE' })).status).toBe(403);
    expect((await chefe('/api/cadastros/redatores/recR1', { method: 'DELETE' })).status).toBe(200);
    expect((await chefe('/api/cadastros/editores/recE1/keys/recKE1', { method: 'DELETE' })).status).toBe(200);
    expect((await ana('/api/cadastros/atracoes/recA2/keys', { method: 'POST', body: JSON.stringify({ key: 'colina 2' }) })).status).toBe(200);
  });

  it('todos trocam o acervo de uma atração; o acervo desconhecido é recusado', async () => {
    const r = await ana('/api/cadastros/atracoes/recA1', { method: 'PATCH', body: JSON.stringify({ acervo: 'sem' }) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: 'recA1', nome: 'Show da Noite', acervo: 'sem' });
    const ruim = await ana('/api/cadastros/atracoes/recA1', { method: 'PATCH', body: JSON.stringify({ acervo: 'Genérica' }) });
    expect(ruim.status).toBe(400);
    expect((await ana('/api/cadastros/redatores/recR1', { method: 'PATCH', body: JSON.stringify({ acervo: 'sem' }) })).status).toBe(405);
  });
});

describe('Sem cadastro depois de cadastrar a atração', () => {
  /* O Teable grava a key (com o link para a atração) na hora, mas a coluna de keys da própria atração (o lado de lá
     do link, que o vocabulário lê pelo Postgres) só se ajeita um pouco depois. A leitura logo depois do cadastro
     vê a atração nova sem nenhuma key. Nomes inventados. */
  it('a key que acabou de ser cadastrada sai da lista, mesmo com o Teable atrasado', async () => {
    // @ts-expect-error módulo JS sem tipos
    const { criarVocabulario } = await import('../servidor/vocabulario.mjs');
    // @ts-expect-error módulo JS sem tipos
    const { keysSemCadastro } = await import('../servidor/app.mjs');
    const { buscar, tabelas } = falso();
    // o lado da atração no link: só muda quando o Teable "se ajeita"
    const espelho = new Map<string, { id: string; title: string }[]>();
    const ajeitar = () => {
      espelho.clear();
      for (const k of tabelas.tblKeyAtr)
        for (const a of k.fields.atracoes as { id: string }[]) espelho.set(a.id, [...(espelho.get(a.id) ?? []), { id: k.id, title: String(k.fields.key) }]);
    };
    ajeitar();
    const consultar = async () =>
      tabelas.tblAtr.map((r) => ({ atracao: r.fields.atracao, categoria: r.fields.categoria ?? null, pattern: espelho.get(r.id) ?? null }));
    const env = { ...ENV, TEABLE_PG_URL: 'postgres://x', TEABLE_PG_ESQUEMA: 'bseX', ...comTabelas({ atracoes: 'atracoes' }) };
    const vocabulario = criarVocabulario(env, buscar, null, null, consultar);
    const c = criarCadastros(ENV, { buscar, vocabulario });
    const claquetes = [
      { claquete: 'Rio Souza(Teaser)12/12', em: '2026-11-17' },
      { claquete: 'RIO SOUZA TEASER(FLASHMOB)', em: '2026-11-25' },
    ];
    const antes = keysSemCadastro(claquetes, (await vocabulario.ler()).programas);
    expect(antes.map((k: { key: string }) => k.key)).toEqual(['SOUZA', 'SOUZA TEASER']);

    await c.novaAtracao({ nome: 'Só Mais Um Souza', keys: ['SOUZA'] });

    const depois = keysSemCadastro(claquetes, (await vocabulario.ler()).programas);
    expect(depois).toEqual([]);
    // ligar uma key a uma atração que já existe ("Ligar a…") tem o mesmo atraso
    const comNoite = [...claquetes, { claquete: 'NOITINHA(CHAMADA) 3/12', em: '2026-11-25' }];
    expect(keysSemCadastro(comNoite, (await vocabulario.ler()).programas).map((k: { key: string }) => k.key)).toEqual(['NOITINHA']);
    await c.novaKey('atracao', 'recA1', 'noitinha');
    expect(keysSemCadastro(comNoite, (await vocabulario.ler()).programas)).toEqual([]);
    // quando o Teable se ajeita, a leitura seguinte continua certa
    ajeitar();
    expect(keysSemCadastro(comNoite, (await vocabulario.renovar()).programas)).toEqual([]);
  });
});

describe('ligar pessoa e cadastro pelo e-mail ("É ela", #106)', () => {
  /* Os usuários do PROMeiro (a tabela usuarios do SQLite, de quem já entrou) e os redatores e editores do Teable
     falso, ligados pelo campo e-mail. Nomes e e-mails inventados. */
  let servidor: Server;
  let base = '';
  let tabelas: ReturnType<typeof falso>['tabelas'];
  let db: unknown;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como('chefe@empresa.com');
  const ana = como('ana@empresa.com');
  const subir = async (banco: unknown) => {
    const f = falso();
    tabelas = f.tabelas;
    // a Marina sem e-mail; o Paulo já ligado; o editor Bruno Regis (do falso) sem e-mail
    tabelas.tblRed.push({ id: 'recR2', fields: { redator: 'Marina Teles' } }, { id: 'recR3', fields: { redator: 'Paulo Nunes', email: 'paulo.nunes@empresa.com' } });
    const app = criarApp({ db: banco, env: {}, cadastros: criarCadastros(ENV, { buscar: f.buscar }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  };
  const sugestoes = async (quem = chefe) => ((await (await quem('/api/cadastros?renovar=1')).json()).sugestoes ?? []) as { tipo: string; id: string; nome: string; email: string; usuario: string }[];
  beforeAll(async () => {
    db = abrirBanco(':memory:');
    await subir(db);
    // quem já entrou no PROMeiro (o nome vem do e-mail)
    for (const email of ['mariana.telles@empresa.com', 'bruno.regis@empresa.com', 'paulo.nunes@empresa.com', 'carla.souza@empresa.com']) await como(email)('/api/eu');
  });
  afterAll(() => servidor.close());

  it('o e-mail de redatores e editores vem nos Cadastros; o administrador edita à mão, e só ele', async () => {
    const d = await (await ana('/api/cadastros')).json();
    expect(d.redatores.map((r: { nome: string; email: string }) => [r.nome, r.email])).toEqual([
      ['Ana Lima', ''],
      ['Marina Teles', ''],
      ['Paulo Nunes', 'paulo.nunes@empresa.com'],
    ]);
    expect(d.editores[0]).toMatchObject({ nome: 'Bruno Regis', email: '' });
    const corpo = (email: string) => ({ method: 'PATCH', body: JSON.stringify({ email }) });
    expect((await ana('/api/cadastros/redatores/recR1', corpo('ana.lima@empresa.com'))).status).toBe(403);
    const ruim = await chefe('/api/cadastros/redatores/recR1', corpo('ana lima'));
    expect(ruim.status).toBe(400);
    expect((await ruim.json()).erro).toBe('Escreva um e-mail.');
    const repetido = await chefe('/api/cadastros/redatores/recR1', corpo('Paulo.Nunes@empresa.com'));
    expect(repetido.status).toBe(409);
    expect((await repetido.json()).erro).toBe('paulo.nunes@empresa.com já é de Paulo Nunes.');
    const r = await chefe('/api/cadastros/redatores/recR1', corpo(' Ana.Lima@Empresa.com '));
    expect(await r.json()).toEqual({ id: 'recR1', nome: 'Ana Lima', email: 'ana.lima@empresa.com', antes: '' });
    expect(tabelas.tblRed[0].fields.email).toBe('ana.lima@empresa.com');
    // vazio apaga
    await chefe('/api/cadastros/redatores/recR1', corpo(''));
    expect(tabelas.tblRed[0].fields.email ?? '').toBe('');
  });

  it('a sugestão pelo nome: quem já entrou e parece ser um redator ou editor sem e-mail; só o administrador vê', async () => {
    expect(await sugestoes()).toEqual([
      { tipo: 'editores', id: 'recE1', nome: 'Bruno Regis', email: 'bruno.regis@empresa.com', usuario: 'Bruno Regis' },
      // sem caixa e acento, e uma letra de diferença em cada nome
      { tipo: 'redatores', id: 'recR2', nome: 'Marina Teles', email: 'mariana.telles@empresa.com', usuario: 'Mariana Telles' },
    ]);
    expect(await sugestoes(ana)).toEqual([]);
  });

  it('"É ela" grava o e-mail no Teable na hora; desfazer apaga, e a sugestão volta', async () => {
    const r = await chefe('/api/cadastros/redatores/recR2', { method: 'PATCH', body: JSON.stringify({ email: 'mariana.telles@empresa.com' }) });
    expect(r.status).toBe(200);
    expect(tabelas.tblRed.find((x) => x.id === 'recR2')!.fields.email).toBe('mariana.telles@empresa.com');
    expect((await sugestoes()).map((s) => s.nome)).toEqual(['Bruno Regis']);
    // desfazer: o e-mail de antes (vazio)
    await chefe('/api/cadastros/redatores/recR2', { method: 'PATCH', body: JSON.stringify({ email: (await r.json()).antes }) });
    expect((await sugestoes()).map((s) => s.nome)).toEqual(['Bruno Regis', 'Marina Teles']);
  });

  it('"Não é" fica guardado no SQLite e a sugestão não volta (nem com o servidor de novo); desfazer traz de volta', async () => {
    const naoE = { tipo: 'editores', id: 'recE1', email: 'bruno.regis@empresa.com' };
    expect((await ana('/api/cadastros/nao-e', { method: 'POST', body: JSON.stringify(naoE) })).status).toBe(403);
    expect((await chefe('/api/cadastros/nao-e', { method: 'POST', body: JSON.stringify(naoE) })).status).toBe(200);
    expect((await sugestoes()).map((s) => s.nome)).toEqual(['Marina Teles']);
    servidor.close();
    await subir(db);
    expect((await sugestoes()).map((s) => s.nome)).toEqual(['Marina Teles']);
    const de = new URLSearchParams(naoE).toString();
    expect((await chefe(`/api/cadastros/nao-e?${de}`, { method: 'DELETE' })).status).toBe(200);
    expect((await sugestoes()).map((s) => s.nome)).toEqual(['Bruno Regis', 'Marina Teles']);
  });
});
