// Ponta a ponta da aba Duplicadas dos Cadastros (#65), rodado à parte do vitest: `npm run e2e:duplicadas`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com a produção da arte, o
// Trello e o acervo falsos (linhas e cards fictícios): as rotas /api/duplicadas são as de verdade. A lista e o caso
// aberto saem só da produção (nenhum pedido ao Trello, ADR 0006). No computador, claro e escuro: a aba com o número de
// casos, o período, "Lido da produção", a busca, as três seções; abrir um caso mostra os cards lado a lado com as
// diferenças e a sugestão, que a pessoa troca; o card apagado no Trello, que continua na produção; o caso de três
// cards. Ignorar (#66) pela linha,
// com o motivo: o caso sai da lista e do contador, vai para Resolvidas e para o Registro; Reabrir devolve. Quem não é
// administrador não vê a aba. No celular, claro e escuro: a lista e o caso aberto com os cards empilhados, Resolvidas e
// o Registro, só consulta (sem Ignorar nem Reabrir). Apagar (#67): no modo só olhar (o padrão) não há Apagar; liberado
// no painel, apagar um card com a confirmação (Conferi + o código do card que sai, o aviso do card aberto): o resultado,
// o caso sai da lista, o contador cai e o Registro mostra quem apagou. No Trello, só o comentário e o DELETE.
// Recriar (#68), no Registro: a confirmação com o que volta e o que não volta ("Entendi"), o card novo pelo caminho do
// envio (nada lido do Trello), a linha da produção nova, as artes do acervo de volta, o caso de novo na lista e o
// Registro com "recriou o card"; não dá para recriar duas vezes.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:duplicadas
// Com CAPTURAS=pasta, grava as capturas de cada tela (densidade 2).
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:duplicadas');
  process.exit(2);
}

const RAIZ = join(__dirname, '..', '..');
const LIA = 'lia.moraes@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };
const CADASTROS = { ligado: true, atracoes: [], redatores: [], editores: [], categorias: [], camposCaminho: [], formulas: {}, podeApagar: true };

/* ---------- a produção da arte e o Trello fictícios ---------- */
const DIA = 86_400_000;
const HORA = 3_600_000;
const AGORA = Date.now();
let sequencia = 0;
const idCriadoEm = (ms) => Math.floor(ms / 1000).toString(16).padStart(8, '0') + (++sequencia).toString(16).padStart(16, '0');
const LISTAS = { entradaSP: 'ENTRADA SP', entradaG5: 'ENTRADA G5', saidaSP: 'SAÍDA SP', saidaG5: 'SAÍDA G5', entregues: 'PROJETOS ENTREGUES' };
const PESSOAS = { m1: 'Pessoa Um', m2: 'Pessoa Dois', m3: 'Pessoa Três' };
const CARDS = [];
const PRODUCAO = [];
/** Uma linha da produção (que entrou uma hora depois de o card ser criado) e o card dela no Trello (sem ele com sumiu). */
function card(numero, nome, criado, o = {}) {
  const c = { id: idCriadoEm(criado), idShort: numero, name: nome, closed: false, idList: 'entradaG5', idMembers: ['m1'], due: null, checkItems: 4, anexos: ['application/pdf'], ...o };
  if (!o.sumiu) CARDS.push(c);
  PRODUCAO.push({
    registro: `rec${numero}`,
    card_ID: o.semCard ? null : c.id,
    claquete: nome,
    praca: o.praca ?? null,
    data_entrada: new Date(criado + HORA).toISOString(),
    status: o.status ?? [],
    designers: o.designers ?? [],
    arquivado: c.closed,
    entregue: !!o.entregue,
    filme: o.filme ?? null,
    __last_modified_time: new Date(criado + 2 * HORA).toISOString(),
  });
  return c;
}
const exibicao = (dias) => new Date(AGORA + dias * DIA).toISOString();
// com arquivado e aberto
card(4681, 'Festa na Praça 19/11 REDE', AGORA - 4.4 * DIA, { status: ['PRODUZINDO'], designers: ['Designer Um'], due: exibicao(1) });
card(4686, 'FESTA NA PRACA 19/11', AGORA - 4.2 * DIA, { closed: true, idMembers: [], due: exibicao(1) });
card(4790, 'Show da Noite 20/11 SP', AGORA - 6.3 * DIA, { idList: 'saidaSP', idMembers: ['m1', 'm2'], anexos: ['application/pdf', 'image/png', 'image/jpeg'], status: ['FINALIZADO'], designers: ['Designer Um', 'Designer Dois'], due: exibicao(2) });
card(4795, 'Show da Noite 20/11', AGORA - 6.3 * DIA + 3 * HORA, { closed: true, idList: 'entradaSP', praca: 'SP', idMembers: [], status: ['ENTRADA'], due: exibicao(2) });
card(4840, 'Arena do Domingo 23/11', AGORA - 2.4 * DIA, { checkItems: 3, status: ['PRODUZINDO'], designers: ['Designer Três'], due: exibicao(4) });
card(4843, 'Arena do Domingo 23/11', AGORA - 2.4 * DIA + 26 * 60_000, { closed: true, idMembers: [], checkItems: 3, due: exibicao(4) });
card(4851, 'ARENA DO DOMINGO_23_11', AGORA - 2.4 * DIA + 8 * HORA, { closed: true, idMembers: [], checkItems: 2, anexos: [], due: exibicao(4) });
// todos abertos; o segundo card do Jornal não existe mais no Trello
card(4700, 'Cozinha de Vó 18/11', AGORA - 9.5 * DIA, { status: ['FINALIZADO'], idList: 'saidaG5' });
card(4702, 'Cozinha de Vo 18/11', AGORA - 9.2 * DIA, { status: ['ENTRADA'] });
card(4760, 'Jornal da Tarde(Chamada)21/11 SP', AGORA - 5.5 * DIA, { idList: 'entradaSP', designers: ['Designer Dois'] });
card(4763, 'JORNAL DA TARDE(CHAMADA)21/11 SP', AGORA - 5.3 * DIA, { idList: 'entradaSP', sumiu: true });
// todos arquivados
card(4600, 'Novela Sinfonia 12/11', AGORA - 15.5 * DIA, { closed: true, idList: 'entregues', status: ['FINALIZADO'], entregue: true });
card(4604, 'Novela Sinfonia 12/11', AGORA - 15.2 * DIA, { closed: true });
// versões diferentes não contam; um caso só com mais de 90 dias; a linha sem card e as de filme não contam
card(4720, 'Terra 20/11', AGORA - 3 * DIA);
card(4722, 'Terra 20/11 V2', AGORA - 2.9 * DIA);
card(4200, 'Verão Antigo 10/07', AGORA - 120 * DIA, { closed: true });
card(4201, 'Verao Antigo 10/07', AGORA - 119 * DIA, { closed: true });
card(4300, 'DIA 24', AGORA - 1.5 * DIA);
card(4301, 'DIA 24', AGORA - 1.4 * DIA, { semCard: true });
card(4310, 'Filme da Tarde 21/11', AGORA - 2 * DIA, { filme: [{ id: 'recFilme', title: 'Filme da Tarde' }] });
card(4311, 'Filme da Tarde 21/11', AGORA - 1.9 * DIA, { filme: '[{"id":"recFilme","title":"Filme da Tarde"}]' });
// as artes do acervo ligadas às linhas da produção
const ACERVO = [
  ...['HOJE', 'AMANHÃ', 'SÁBADO'].map((arte, i) => ({ id: `recS${i}`, arte, tipo: 'RDP', atracao: [{ id: 'recShow', title: 'Show da Noite' }], claquete: [{ id: 'rec4790', title: 'SHOW DA NOITE 20/11 SP' }], filme: null })),
  ...['ABERTURA', 'ELENCO', 'ESTREIA', 'HOJE', 'FINAL'].map((arte, i) => ({ id: `recN${i}`, arte, tipo: 'CRT', atracao: [{ id: 'recNov', title: 'Novela Sinfonia' }], claquete: [{ id: 'rec4600', title: 'NOVELA SINFONIA 12/11' }], filme: null })),
];

// sem TRELLO_QUADRO: a aba não precisa dele
const ENV_TRELLO = {
  TRELLO_KEY: 'falsa',
  TRELLO_TOKEN: 'falso',
  TRELLO_LISTA_SP: 'entradaSP',
  TRELLO_LISTA_G5: 'entradaG5',
  TRELLO_SAIDA_SP: 'saidaSP',
  TRELLO_SAIDA_G5: 'saidaG5',
  TRELLO_LISTA_ENTREGUES: 'entregues',
  TEABLE_PG_URL: 'postgres://falso',
  TEABLE_PG_ESQUEMA: 'bseFalso',
  // os nomes no Postgres, como a descoberta das tabelas do Teable (#76) acharia
  tabelas: { ARTE_producao: { id: '', pg: 'producao' }, ARTES_acervo: { id: '', pg: 'acervo' } },
  // recriar (#68) grava a linha da produção do card novo como o envio, pela API do Teable (de mentira)
  TEABLE_URL: 'http://teable-falso',
  TEABLE_TOKEN: 'falso',
  TEABLE_ARTE_PRODUCAO: 'tblProducao',
};
// a Linha do tempo (#89) do card que fica no caso do Show da Noite: a rota de mentira (o banco do e2e não tem eventos);
// o outro card do caso não é Produção e mostra "—"
const SHOW = CARDS.find((c) => c.idShort === 4790);
const diaHoraLocal = (ms) => {
  const d = new Date(ms);
  return [`${d.getDate()}/${d.getMonth() + 1}`, `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`];
};
const CRIADO_SHOW = AGORA - 6.3 * DIA + HORA;
const LINHA_DO_SHOW = {
  producao: { id: 'p-show', claquete: 'Show da Noite 20/11 SP', etapa: 'entregue', entradaEm: new Date(CRIADO_SHOW).toISOString(), entregaEm: null, artes: [], artesQuantidade: 4, arquivada: false },
  eventos: [
    { tipo: 'criada', antes: null, depois: 'entrada', quem: 'Pessoa Um', quando: new Date(CRIADO_SHOW).toISOString() },
    { tipo: 'arte-marcada', antes: null, depois: 'HOJE', quem: 'Pessoa Um', quando: new Date(CRIADO_SHOW + 20 * 60_000).toISOString() },
    { tipo: 'arte-marcada', antes: null, depois: 'AMANHÃ', quem: 'Pessoa Um', quando: new Date(CRIADO_SHOW + 40 * 60_000).toISOString() },
  ],
};
const FRASES_DO_SHOW = [`entrou ${diaHoraLocal(CRIADO_SHOW).join(' ')}`, '2 de 4 artes'];
const pedidosDaLinha = [];

/** O Trello de mentira: a aba não lê o Trello (ADR 0006); o pedido que chegar fica anotado e o teste confere que não
    chegou nenhum. Apagar (#67) só escreve: o comentário no card que fica e o DELETE do que sai. */
const pedidosAoTrello = [];
const ok = (dados = {}) => ({ ok: true, status: 200, json: async () => dados, text: async () => '' });
/** Os cards que o PROMeiro criou (recriar da cópia, #68). */
const CRIADOS = [];
async function buscar(url, init = {}) {
  const u = new URL(url);
  const metodo = init.method ?? 'GET';
  if (u.origin === ACERVO_GRAVA.TEABLE_URL) return buscarNoTeable(url, init);
  pedidosAoTrello.push(`${metodo} ${u.pathname}`);
  // o card recriado: o card, a checklist, os campos e o anexo, pelo caminho do envio
  if (metodo === 'POST' && u.pathname === '/1/cards') {
    const corpo = JSON.parse(init.body);
    const c = { id: idCriadoEm(Date.now()), idShort: 4999, name: corpo.name, closed: false, idList: corpo.idList, idMembers: [], due: null, checkItems: 0, anexos: [] };
    CARDS.push(c);
    CRIADOS.push({ ...c, desc: corpo.desc, itens: [] });
    return ok({ id: c.id, shortUrl: `https://trello.com/c/Ficti${c.idShort}` });
  }
  if (metodo === 'POST' && u.pathname === '/1/checklists') return ok({ id: 'listaFalsa1' });
  if (metodo === 'POST' && /^\/1\/checklists\/\w+\/checkItems$/.test(u.pathname)) {
    CRIADOS.at(-1).itens.push(u.searchParams.get('name'));
    return ok();
  }
  if ((metodo === 'PUT' && /\/customField\/\w+\/item$/.test(u.pathname)) || (metodo === 'POST' && /\/attachments$/.test(u.pathname))) return ok();
  if (metodo === 'POST' && /^\/1\/cards\/[0-9a-f]{24}\/actions\/comments$/.test(u.pathname)) return ok({ id: 'acaoFalsa1' });
  if (metodo === 'DELETE' && /^\/1\/cards\/[0-9a-f]{24}$/.test(u.pathname)) {
    CARDS.splice(CARDS.findIndex((c) => u.pathname.endsWith(c.id)), 1);
    return ok();
  }
  if (metodo !== 'GET') throw new Error(`pedido inesperado ao Trello: ${metodo} ${u.pathname}`);
  const umCard = /^\/1\/cards\/([0-9a-f]{24})$/.exec(u.pathname);
  if (!umCard) throw new Error(`pedido inesperado ao Trello: ${u.pathname}`);
  const x = CARDS.find((y) => y.id === umCard[1]);
  if (!x) return { ok: false, status: 404, json: async () => ({}), text: async () => 'The requested resource was not found.' };
  const dados = {
    id: x.id,
    idShort: x.idShort,
    name: x.name,
    closed: x.closed,
    idList: x.idList,
    idMembers: x.idMembers,
    due: x.due,
    shortUrl: `https://trello.com/c/Ficti${x.idShort}`,
    badges: { checkItems: x.checkItems, attachments: x.anexos.length },
    list: { id: x.idList, name: LISTAS[x.idList] },
    attachments: x.anexos.map((mimeType, i) => ({ id: `a${i}`, name: `anexo${i}`, mimeType })),
    members: x.idMembers.map((id) => ({ id, fullName: PESSOAS[id] })),
  };
  return { ok: true, status: 200, json: async () => dados, text: async () => '' };
}
async function consultar(sql, params = []) {
  if (sql.includes('"bseFalso"."acervo"')) return ACERVO;
  // a produção do período, como o Postgres responde: entrou nos últimos N dias e tem card
  if (sql.includes('"bseFalso"."producao"') && sql.includes('"data_entrada" >=')) {
    const desde = Date.now() - Number(params[0]) * DIA;
    return PRODUCAO.filter((l) => l.card_ID && Date.parse(l.data_entrada) >= desde);
  }
  // as linhas dos cards do caso, relidas na hora de apagar (#67)
  if (sql.includes('"bseFalso"."producao"') && sql.includes('= ANY(')) return PRODUCAO.filter((l) => l.card_ID && params[0].includes(l.card_ID)).map((l) => ({ ...l, __id: l.registro, inteira: { ...l } }));
  return [];
}
/** O Teable de mentira (a API): o acervo religa as artes ao card que fica. */
const ACERVO_GRAVA = { TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'falso', TEABLE_ACERVO: 'tblAcervo' };
const pedidosAoTeable = [];
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  pedidosAoTeable.push(`${init.method ?? 'GET'} ${u.pathname}`);
  // a linha da produção do card recriado (#68)
  if (init.method === 'POST' && u.pathname === '/api/table/tblProducao/record') {
    const f = JSON.parse(init.body).records[0].fields;
    PRODUCAO.push({ registro: 'recNova1', status: [], designers: [], arquivado: false, entregue: false, filme: null, praca: null, __last_modified_time: new Date().toISOString(), ...f });
    return ok({ records: [{ id: 'recNova1', fields: f }] });
  }
  if (init.method !== 'PATCH') throw new Error(`pedido inesperado ao Teable: ${u.pathname}`);
  const { records } = JSON.parse(init.body);
  for (const r of records) ACERVO.find((a) => a.id === r.id).claquete = [{ id: r.fields.claquete[0].id, title: '' }];
  return ok({ records });
}

/* ---------- o navegador ---------- */

async function abrir(navegador, url, opcoes, { admin = true } = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/cadastros', (r) => r.fulfill({ json: { ...CADASTROS, podeApagar: admin } }));
  await ctx.route((u) => u.pathname === '/api/cadastros/sem-cadastro', (r) => r.fulfill({ json: { keys: [], reconhecidas: { total: 0, amostra: [] } } }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  await ctx.route((u) => u.pathname === '/api/linha-do-tempo', (r) => {
    const card = new URL(r.request().url()).searchParams.get('card');
    pedidosDaLinha.push(card);
    r.fulfill({ json: card === SHOW.id ? LINHA_DO_SHOW : { producao: null, eventos: [] } });
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/cadastros/atracoes`);
  await p.waitForSelector('.abas-cad');
  return { ctx, p, erros };
}
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
const fundoEscuro = (p) =>
  p.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return r + g + b < 200;
  });
// `tela`: só o que cabe na janela (a confirmação fica por cima da página, num véu fixo)
const capturar = async (p, nome, { tela = false } = {}) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: !tela });
};
/** O nome que o servidor deu à Lia (sai do e-mail). */
const nomeDaLia = (p) => p.evaluate(() => fetch('/api/eu').then((r) => r.json()).then((d) => d.nome));
const claquetes = (p) => p.locator('.linha-dup .claquete-dup').allTextContents();
const caso = (p, nome) => p.locator('.caso-dup', { has: p.locator('.claquete-dup', { hasText: nome }) });
const textos = async (l) => (await l.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());

async function noComputador(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  pedidosAoTrello.length = 0;
  pedidosDaLinha.length = 0;
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  // o número de casos já vem na aba, antes de abrir
  const aba = p.locator('.abas-cad .aba-dup');
  await aba.locator('sup', { hasText: '6' }).waitFor();
  await aba.click();
  await p.locator('.secao-dup').first().waitFor();
  assert.equal((await aba.locator('.rot').textContent()).trim(), 'Duplicadas 6');
  assert.equal(await p.locator('.cad-busca input').getAttribute('placeholder'), 'Buscar claquete');
  assert.deepEqual(await p.locator('.periodo-dup button').allTextContents(), ['30 dias', '60', '90', '180', '365']);
  assert.equal(await p.locator('.periodo-dup [aria-checked=true]').textContent(), '90');
  assert.match((await p.locator('.lido-dup').textContent()).replace(/\s+/g, ' '), /^Lido da produção agora · 16 linhas/);
  assert.deepEqual(await p.locator('.secao-dup > header').evaluateAll((hs) => hs.map((h) => [...h.children].map((c) => c.textContent.trim()).join(' '))), [
    'Com arquivado e aberto 3 casos · 7 cards O caso de sempre: um reenvio arquivado na entrada.',
    'Todos abertos 2 casos · 4 cards Nenhum foi arquivado.',
    'Todos arquivados 1 caso · 2 cards Já foram todos arquivados.',
  ]);
  assert.deepEqual(await claquetes(p), ['Arena do Domingo 23/11', 'Festa na Praça 19/11 REDE', 'Show da Noite 20/11 SP', 'Jornal da Tarde(Chamada)21/11 SP', 'Cozinha de Vó 18/11', 'Novela Sinfonia 12/11']);
  assert.deepEqual(await textos(caso(p, 'Show da Noite').locator('.sinais-dup .s')), ['1 aberto', '1 arquivado', '3 artes no acervo']);
  assert.deepEqual(await textos(caso(p, 'Show da Noite').locator('.lado-dup span')), ['2 cards', 'há 6 dias']);
  assert.equal(await caso(p, 'Terra').count(), 0, 'versões diferentes não contam');
  assert.equal(await caso(p, 'DIA 24').count(), 0, 'a linha sem card não conta');
  assert.equal(await caso(p, 'Filme da Tarde').count(), 0, 'as linhas de filme não contam');
  assert.deepEqual(pedidosAoTrello, [], 'a lista não lê o Trello');
  await semRolagemDeLado(p, `computador ${nome}, lista`);
  await capturar(p, `01-lista-${nome}`);

  // abrir um caso: os cards lado a lado, as diferenças e a sugestão; só o que a produção tem, nada lido no Trello
  pedidosAoTrello.length = 0;
  assert.deepEqual(pedidosDaLinha, [], 'a lista não lê a linha do tempo');
  await caso(p, 'Show da Noite').locator('.linha-dup').click();
  const tabela = caso(p, 'Show da Noite').locator('.tabela-dup');
  await tabela.waitFor();
  assert.equal(await caso(p, 'Show da Noite').locator('.linha-dup').getAttribute('aria-expanded'), 'true');
  assert.deepEqual(pedidosAoTrello, [], 'o caso aberto não lê o Trello');
  assert.deepEqual(await textos(tabela.locator('.cabeca .sugestao-dup')), ['Sugestão: fica. Não foi arquivado na entrada.', 'Provável duplicado. Arquivado sem sair da entrada.']);
  const rotulos = await textos(tabela.locator('[role=rowheader]'));
  for (const r of ['Nome no Trello', 'Lista', 'Membros', 'Anexos', 'Exibição']) assert.ok(!rotulos.includes(r), `sem a linha ${r} (era do Trello)`);
  const diferentes = await textos(tabela.locator('.difere [role=rowheader]'));
  for (const r of ['Claquete na produção', 'Estado', 'Status', 'Designers', 'Acervo ligado']) assert.ok(diferentes.includes(r), `${r} difere`);
  for (const r of ['Entrega', 'Artes', 'Criado', 'Trello']) assert.ok(!diferentes.includes(r), `${r} não difere`);
  const linhaDe = async (rotulo) => textos(tabela.locator('[role=row]', { has: p.locator('[role=rowheader]', { hasText: new RegExp(`^${rotulo}$`) }) }).locator('[role=cell]'));
  assert.match((await linhaDe('Criado'))[1], / · 3 h depois$/);
  const doShow = [4790, 4795].map((n) => CARDS.find((x) => x.idShort === n).id);
  assert.deepEqual(await linhaDe('Trello'), doShow.map((id) => `trello.com/c/${id}`));
  // a Linha do tempo (#89) de cada card, discreta, só leitura; o card que não é Produção mostra "—"
  const linhaDoTempo = tabela.locator('[role=row]', { has: p.locator('[role=rowheader]', { hasText: /^Linha do tempo$/ }) }).locator('[role=cell]');
  await linhaDoTempo.nth(0).locator('.tempo-da-producao.chegou li').first().waitFor();
  assert.deepEqual(await linhaDoTempo.nth(0).locator('li').allTextContents(), FRASES_DO_SHOW);
  assert.equal((await linhaDoTempo.nth(1).textContent()).trim(), '—');
  assert.equal(await linhaDoTempo.locator('button, a').count(), 0, 'a linha do tempo é só leitura');
  assert.ok(diferentes.indexOf('Linha do tempo') < 0, 'a linha do tempo não conta como diferença');
  // Ignorar também no caso aberto (onde ficará o Apagar)
  assert.deepEqual(await textos(caso(p, 'Show da Noite').locator('.acoes-dup .botao')), ['Ignorar']);
  const fica = () => tabela.locator('.cabeca .col-dup').evaluateAll((cs) => cs.map((c) => (c.classList.contains('fica') ? 'fica' : 'sai')));
  assert.deepEqual(await fica(), ['fica', 'sai']);
  await semRolagemDeLado(p, `computador ${nome}, caso`);
  await capturar(p, `02-detalhe-${nome}`);
  // a pessoa troca: ficar com o segundo tira o primeiro
  await tabela.locator('.cabeca .col-dup').nth(1).locator('button', { hasText: 'Fica' }).click();
  assert.deepEqual(await fica(), ['sai', 'fica']);
  await tabela.locator('.cabeca .col-dup').nth(1).locator('button', { hasText: 'Sai' }).click();
  assert.deepEqual(await fica(), ['fica', 'sai']);
  // fechar o caso
  await caso(p, 'Show da Noite').locator('.linha-dup').click();
  assert.equal(await p.locator('.tabela-dup').count(), 0);

  // o card apagado no Trello continua na produção: o caso mostra o que o Teable tem (o PROMeiro não lê o Trello)
  await caso(p, 'Jornal da Tarde').locator('.linha-dup').click();
  const sumido = caso(p, 'Jornal da Tarde').locator('.tabela-dup');
  await sumido.waitFor();
  assert.deepEqual(await textos(sumido.locator('.cabeca .sugestao-dup')), ['Sugestão: fica. Tem designers.', 'Provável duplicado. Sem designers.']);
  const linhaDoSumido = async (rotulo) => textos(sumido.locator('[role=row]', { has: p.locator('[role=rowheader]', { hasText: new RegExp(`^${rotulo}$`) }) }).locator('[role=cell]'));
  assert.deepEqual(await linhaDoSumido('Designers'), ['Designer Dois≠', '—≠']);
  assert.deepEqual(pedidosAoTrello, [], 'nada lido no Trello');
  await semRolagemDeLado(p, `computador ${nome}, card apagado no Trello`);
  await capturar(p, `02b-detalhe-card-apagado-${nome}`);
  await caso(p, 'Jornal da Tarde').locator('.linha-dup').click();

  // três cards: fica um, saem dois; com três, o último que fica não sai
  await caso(p, 'Arena do Domingo').locator('.linha-dup').click();
  const tres = caso(p, 'Arena do Domingo').locator('.tabela-dup');
  await tres.waitFor();
  assert.deepEqual(await tres.locator('.cabeca .col-dup').evaluateAll((cs) => cs.map((c) => (c.classList.contains('fica') ? 'fica' : 'sai'))), ['fica', 'sai', 'sai']);
  await tres.locator('.cabeca .col-dup').nth(0).locator('button', { hasText: 'Sai' }).click();
  assert.deepEqual(await tres.locator('.cabeca .col-dup').evaluateAll((cs) => cs.map((c) => (c.classList.contains('fica') ? 'fica' : 'sai'))), ['fica', 'sai', 'sai']);
  await semRolagemDeLado(p, `computador ${nome}, três cards`);
  await capturar(p, `03-tres-cards-${nome}`);
  await caso(p, 'Arena do Domingo').locator('.linha-dup').click();

  // a busca, pela claquete sem acento; o contador da aba não muda
  await p.locator('.cad-busca input').focus();
  await p.locator('.cad-busca input').fill('cozinha de vo');
  await p.waitForFunction(() => document.querySelectorAll('.linha-dup').length === 1);
  assert.deepEqual(await claquetes(p), ['Cozinha de Vó 18/11']);
  assert.equal((await aba.locator('.rot').textContent()).trim(), 'Duplicadas 6');
  await p.locator('.cad-busca input').focus();
  await p.locator('.cad-busca input').fill('');
  await p.waitForFunction(() => document.querySelectorAll('.linha-dup').length === 6);

  // o período: 180 dias pega o caso antigo; a escolha fica guardada no navegador
  await p.locator('.periodo-dup button', { hasText: '180' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.linha-dup').length === 7);
  assert.equal((await aba.locator('.rot').textContent()).trim(), 'Duplicadas 7');
  assert.match((await p.locator('.lido-dup').textContent()).replace(/\s+/g, ' '), /· 18 linhas/);
  await p.locator('.periodo-dup button', { hasText: '90' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.linha-dup').length === 6);

  // ignorar pela linha, sem abrir o caso, com o motivo
  const vista = (rotulo) => p.locator('.vista-dup button', { hasText: rotulo });
  assert.deepEqual(await textos(p.locator('.vista-dup button')), ['Para olhar6', 'Resolvidas0']);
  assert.equal(await p.locator('.ignorar-dup').count(), 6, 'Ignorar em cada linha');
  await caso(p, 'Cozinha de Vó').locator('.ignorar-dup').click();
  const dialogo = p.locator('.dialogo-dup');
  await dialogo.waitFor();
  assert.equal(await caso(p, 'Cozinha de Vó').locator('.detalhe-dup').count(), 0, 'ignorar pela linha não abre o caso');
  assert.match(await dialogo.locator('.dica').textContent(), /Nada muda no Trello nem no Teable/);
  await dialogo.locator('.motivos-dup button', { hasText: 'São exibições diferentes' }).click();
  await dialogo.locator('.obs-dup').fill('uma é a reprise');
  await semRolagemDeLado(p, `computador ${nome}, ignorar`);
  await capturar(p, `04-ignorar-${nome}`);
  await dialogo.locator('.botao.primario', { hasText: 'Ignorar' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.linha-dup').length === 5);
  // o diálogo fecha logo depois de a lista chegar (o registro é lido antes): espera, sem corrida
  await p.locator('.dialogo-dup').waitFor({ state: 'detached' });
  assert.equal(await caso(p, 'Cozinha de Vó').count(), 0, 'o caso saiu da lista');
  assert.equal((await aba.locator('.rot').textContent()).trim(), 'Duplicadas 5', 'o contador da aba caiu');
  assert.deepEqual(await textos(p.locator('.vista-dup button')), ['Para olhar5', 'Resolvidas1']);
  // o Registro: quem ignorou o quê e quando, com o motivo
  const primeira = p.locator('.registro-dup li').first();
  await primeira.locator('text=ignorou').waitFor();
  assert.match((await primeira.textContent()).replace(/\s+/g, ' '), /ignorou Cozinha de Vó 18\/11 \(2 cards\): São exibições diferentes: uma é a reprise\.agora · Reabrir$/);
  assert.equal(await primeira.getAttribute('class'), 'novo');

  // Resolvidas
  await vista('Resolvidas').click();
  const resolvida = p.locator('.resolvida-dup');
  await resolvida.first().waitFor();
  assert.equal(await resolvida.count(), 1);
  assert.equal(await p.locator('.linha-dup').count(), 0);
  assert.deepEqual(await textos(resolvida.locator('.sinais-dup .s')), ['Não é duplicada', 'São exibições diferentes: uma é a reprise', '2 cards', `${await nomeDaLia(p)}, agora`]);
  await semRolagemDeLado(p, `computador ${nome}, resolvidas`);
  await capturar(p, `05-resolvidas-${nome}`);

  // Reabrir devolve o caso
  await resolvida.locator('button', { hasText: 'Reabrir' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.resolvida-dup').length === 0);
  assert.deepEqual(await textos(p.locator('.vista-dup button')), ['Para olhar6', 'Resolvidas0']);
  assert.equal((await aba.locator('.rot').textContent()).trim(), 'Duplicadas 6');
  assert.match((await p.locator('.registro-dup li').first().textContent()).replace(/\s+/g, ' '), /reabriu Cozinha de Vó 18\/11\.agora$/);
  assert.equal(await p.locator('.registro-dup button', { hasText: 'Reabrir' }).count(), 0, 'o reaberto não reabre de novo');
  await capturar(p, `06-registro-${nome}`);
  await vista('Para olhar').click();
  await caso(p, 'Cozinha de Vó').waitFor();
  assert.equal(await p.locator('.linha-dup').count(), 6);

  assert.deepEqual(erros, [], `computador ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: computador ${nome}: aba com 6, seções, lista → caso lado a lado com diferenças e sugestão trocável, três cards, busca e período; ignorar pela linha → Resolvidas e Registro → reabrir`);
}

async function semSerAdministrador(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, { admin: false });
  await p.waitForTimeout(400);
  assert.equal(await p.locator('.abas-cad .aba-dup').count(), 0, 'quem não é administrador não vê a aba');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: sem ser administrador, a aba Duplicadas não aparece');
}

async function noCelular(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  const aba = p.locator('.abas-cad .aba-dup');
  await aba.locator('sup', { hasText: '6' }).waitFor();
  await aba.tap();
  await p.locator('.secao-dup').first().waitFor();
  assert.equal(await p.locator('.linha-dup').count(), 6);
  await semRolagemDeLado(p, `celular ${nome}, lista`);
  await capturar(p, `10-celular-lista-${nome}`);
  await caso(p, 'Show da Noite').locator('.linha-dup').tap();
  const detalhe = caso(p, 'Show da Noite').locator('.detalhe-dup.empilhado');
  await detalhe.waitFor();
  // os cards empilhados, sem o Fica/Sai: no celular, só consulta
  assert.deepEqual(await textos(detalhe.locator('.card-dup .selo-dup')), ['Sugestão: fica', 'Sugestão: duplicado']);
  assert.equal(await p.locator('.fica-sai, .tabela-dup').count(), 0, 'no celular, só consulta');
  assert.ok((await textos(detalhe.locator('.card-dup').nth(1).locator('.difere dt'))).includes('Estado'));
  const linhaNoCelular = detalhe.locator('.card-dup').nth(0).locator('div', { has: p.locator('dt', { hasText: /^Linha do tempo$/ }) }).locator('dd');
  await linhaNoCelular.locator('.tempo-da-producao.chegou li').first().waitFor();
  assert.deepEqual(await linhaNoCelular.locator('li').allTextContents(), FRASES_DO_SHOW, 'a linha do tempo também no celular');
  await semRolagemDeLado(p, `celular ${nome}, caso`);
  assert.equal(await p.locator('.acoes-dup .botao').count(), 0, 'no celular, sem Ignorar no caso');
  assert.equal(await p.locator('.ignorar-dup').count(), 0, 'no celular, sem Ignorar na linha');
  await capturar(p, `11-celular-detalhe-${nome}`);

  // Resolvidas e o Registro também no celular, sem Reabrir: um caso ignorado pela API (como se fosse no computador)
  const lista = await (await ctx.request.get(new URL('/api/duplicadas', url).href)).json();
  const novela = lista.casos.find((c) => c.claquete.startsWith('Novela Sinfonia'));
  assert.equal((await ctx.request.post(new URL('/api/duplicadas/ignorar', url).href, { data: { id: novela.id, dias: 90, motivo: 'Pedido de propósito' } })).status(), 200);
  await p.reload();
  await p.waitForSelector('.abas-cad');
  await aba.locator('sup', { hasText: '5' }).waitFor();
  await aba.tap();
  await p.locator('.vista-dup button', { hasText: 'Resolvidas' }).tap();
  await p.locator('.resolvida-dup').first().waitFor();
  assert.equal(await p.locator('.resolvida-dup button').count(), 0, 'no celular, sem Reabrir em Resolvidas');
  await p.locator('.registro-dup li', { hasText: 'Novela Sinfonia' }).first().waitFor();
  assert.equal(await p.locator('.registro-dup button').count(), 0, 'no celular, sem Reabrir no Registro');
  await semRolagemDeLado(p, `celular ${nome}, resolvidas`);
  await capturar(p, `12-celular-resolvidas-${nome}`);
  assert.equal((await ctx.request.post(new URL('/api/duplicadas/reabrir', url).href, { data: { id: novela.id } })).status(), 200);

  assert.deepEqual(erros, [], `celular ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: celular ${nome}: lista → caso com os cards empilhados, Resolvidas e Registro, só consulta`);
}

/** Apagar (#67): o modo só olhar esconde o Apagar; liberado, apagar um card com a confirmação à prova de engano. */
async function apagarNoComputador(navegador, url) {
  pedidosAoTrello.length = 0;
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1500 }, colorScheme: 'light' });
  const aba = p.locator('.abas-cad .aba-dup');
  await aba.locator('sup', { hasText: '6' }).waitFor();
  await aba.click();
  await p.locator('.secao-dup').first().waitFor();
  // no modo só olhar (sem a chave na configuração), o caso aberto não tem Apagar
  const modo = p.locator('.painel-dup .modo-dup');
  assert.match((await modo.textContent()).replace(/\s+/g, ' '), /^Só olhar O Apagar fica escondido/);
  const show = caso(p, 'Show da Noite');
  await show.locator('.linha-dup').click();
  await show.locator('.tabela-dup').waitFor();
  assert.deepEqual(await textos(show.locator('.acoes-dup .botao')), ['Ignorar'], 'só olhar: sem Apagar');
  // liberar o Apagar no painel
  await modo.locator('button', { hasText: 'Liberar o Apagar' }).click();
  await modo.locator('text=Apagar liberado').waitFor();
  const [primeiro, segundo] = [4790, 4795].map((n) => CARDS.find((x) => x.idShort === n).id);
  const cod = (id) => id.slice(-4);
  await show.locator('.apagar-dup').waitFor();
  assert.deepEqual(await textos(show.locator('.acoes-dup .botao')), ['Ignorar', `Apagar …${cod(segundo)}`]);
  // a pessoa troca: sai o primeiro (aberto, com designers e as três artes do acervo), fica o segundo
  const cabeca = show.locator('.tabela-dup .cabeca .col-dup');
  await cabeca.nth(1).locator('button', { hasText: 'Fica' }).click();
  assert.deepEqual(await textos(show.locator('.acoes-dup .botao')), ['Ignorar', `Apagar …${cod(primeiro)}`]);
  await show.locator('.apagar-dup').click();
  const dialogo = p.locator('.dialogo-dup.largo');
  await dialogo.waitFor();
  assert.equal((await dialogo.locator('h2').textContent()).trim(), `Apagar o card …${cod(primeiro)}`);
  assert.deepEqual(await textos(dialogo.locator('.comparar-dup .cabeca [role=columnheader]')), ['', `Fica …${cod(segundo)}`, `Sai …${cod(primeiro)}`]);
  assert.match(await dialogo.locator('.aviso-dup').textContent(), /O card que sai está aberto \(não foi arquivado\), com Designer Um, Designer Dois/);
  const diferentes = await textos(dialogo.locator('.comparar-dup .difere [role=rowheader]'));
  for (const r of ['Estado', 'Designers', 'Acervo ligado']) assert.ok(diferentes.includes(r), `${r} difere na confirmação`);
  assert.deepEqual(await textos(dialogo.locator('.efeitos-dup tbody th')), ['Trello', 'Produção da arte', 'Acervo', 'Roteiro no PROMeiro']);
  assert.match(await dialogo.locator('.efeitos-dup tbody tr').nth(2).textContent(), /3 artes passam para o card que fica/);
  assert.match(await dialogo.locator('.efeitos-dup tbody tr').nth(1).textContent(), /fluxo PROMO: DB do n8n/);
  assert.equal((await dialogo.locator('.conferi-dup').textContent()).trim(), 'Conferi: é a mesma claquete, na mesma praça e na mesma versão, e o card que fica é o certo');
  // o botão só acende com o Conferi e o código certo
  const botao = dialogo.locator('.botao.perigo-cheio');
  assert.equal(await botao.isDisabled(), true);
  await dialogo.locator('.conferi-dup input').check();
  assert.equal(await botao.isDisabled(), true, 'sem o código, apagado');
  await dialogo.locator('.codigo-dup input').fill(cod(segundo));
  assert.equal(await botao.isDisabled(), true, 'com o código do outro card, apagado');
  await dialogo.locator('.codigo-dup input').fill(cod(primeiro).toUpperCase());
  assert.equal(await botao.isDisabled(), false);
  assert.deepEqual(pedidosAoTrello, [], 'nada no Trello antes de confirmar');
  await semRolagemDeLado(p, 'computador, confirmação de apagar');
  await capturar(p, '20-apagar-confirmacao-claro', { tela: true });
  await botao.click();
  await dialogo.locator('.resultado-dup').waitFor();
  assert.equal((await dialogo.locator('h2').textContent()).trim(), `Card …${cod(primeiro)} apagado`);
  assert.match(await dialogo.locator('.feito-dup').textContent(), /3 artes do acervo passaram para o card que fica/);
  // no Trello, só escritas: o comentário no card que fica e o DELETE do que sai
  assert.deepEqual(pedidosAoTrello, [`POST /1/cards/${segundo}/actions/comments`, `DELETE /1/cards/${primeiro}`]);
  assert.deepEqual(pedidosAoTeable, ['PATCH /api/table/tblAcervo/record']);
  assert.deepEqual(ACERVO.filter((a) => a.atracao[0].id === 'recShow').map((a) => a.claquete[0].id), ['rec4795', 'rec4795', 'rec4795']);
  await capturar(p, '21-apagar-resultado-claro', { tela: true });
  await dialogo.locator('button', { hasText: 'Fechar' }).click();
  // o caso sai da lista e o contador cai (a linha ainda está na produção: o n8n tira depois); o Registro mostra quem apagou
  await p.waitForFunction(() => document.querySelectorAll('.linha-dup').length === 5);
  assert.equal(await caso(p, 'Show da Noite').count(), 0);
  assert.equal((await aba.locator('.rot').textContent()).trim(), 'Duplicadas 5');
  const primeira = p.locator('.registro-dup li').first();
  await primeira.locator('text=apagou').waitFor();
  assert.match((await primeira.textContent()).replace(/\s+/g, ' '), new RegExp(`apagou o card …${cod(primeiro)} de Show da Noite 20/11 SP \\(ficou …${cod(segundo)}, que recebeu 3 artes\\)\\.agora · Recriar$`));
  await semRolagemDeLado(p, 'computador, depois de apagar');
  await capturar(p, '22-apagar-registro-claro');

  // Recriar (#68), no Registro: só no card apagado de verdade, com a confirmação do que volta e do que não volta
  pedidosAoTrello.length = 0;
  pedidosAoTeable.length = 0;
  assert.deepEqual(await textos(p.locator('.registro-dup .recriar-registro-dup')), ['Recriar'], 'Recriar só no card apagado');
  await primeira.locator('.recriar-registro-dup').click();
  const recriar = p.locator('.dialogo-dup.recriar-dup');
  await recriar.waitFor();
  assert.equal((await recriar.locator('h2').textContent()).trim(), `Recriar o card …${cod(primeiro)}`);
  assert.match(await recriar.locator('.dica').first().textContent(), /O card apagado não volta: o PROMeiro faz um card novo só com a cópia guardada/);
  assert.deepEqual(await textos(recriar.locator('.efeitos-dup tbody th')), ['Trello', 'Produção da arte', 'Acervo', 'Roteiro no PROMeiro']);
  assert.match(await recriar.locator('.efeitos-dup tbody tr').nth(0).textContent(), new RegExp(`Um card novo na entrada de SP.*O card …${cod(segundo)}, que tinha ficado, ganha o comentário`));
  assert.match(await recriar.locator('.efeitos-dup tbody tr').nth(2).textContent(), new RegExp(`3 artes voltam do card …${cod(segundo)} para o card novo`));
  const naoVolta = await textos(recriar.locator('.nao-volta-dup li'));
  assert.equal(naoVolta.length, 3);
  assert.match(naoVolta[1], /descrição editada à mão, as etiquetas, os comentários e os membros: só existiam no Trello/);
  const botaoRecriar = recriar.locator('.botao.primario');
  assert.equal(await botaoRecriar.isDisabled(), true, 'sem o Entendi, apagado');
  await recriar.locator('.conferi-dup input').check();
  assert.equal(await botaoRecriar.isDisabled(), false);
  assert.deepEqual(pedidosAoTrello, [], 'nada no Trello antes de confirmar');
  await semRolagemDeLado(p, 'computador, confirmação de recriar');
  await capturar(p, '23-recriar-confirmacao-claro', { tela: true });
  await botaoRecriar.click();
  await recriar.locator('.resultado-dup').waitFor();
  const novo = CRIADOS[0];
  assert.equal((await recriar.locator('h2').textContent()).trim(), `Card novo …${cod(novo.id)} criado`);
  assert.match(await recriar.locator('.feito-dup').textContent(), /3 artes do acervo voltaram para o card novo/);
  // só escritas no Trello: o card (na entrada da praça, com a checklist das artes) e o comentário no que tinha ficado
  assert.ok(pedidosAoTrello.every((x) => !x.startsWith('GET ')), 'nada lido do Trello');
  assert.equal(pedidosAoTrello[0], 'POST /1/cards');
  assert.equal(pedidosAoTrello.at(-1), `POST /1/cards/${segundo}/actions/comments`);
  assert.deepEqual([novo.name, novo.idList], ['Show da Noite 20/11 SP', 'entradaSP']);
  assert.deepEqual(pedidosAoTeable, ['POST /api/table/tblProducao/record', 'PATCH /api/table/tblAcervo/record']);
  assert.deepEqual(ACERVO.filter((a) => a.atracao[0].id === 'recShow').map((a) => a.claquete[0].id), ['recNova1', 'recNova1', 'recNova1']);
  await capturar(p, '24-recriar-resultado-claro', { tela: true });
  await recriar.locator('button', { hasText: 'Fechar' }).click();
  // o caso volta à lista (o card novo e o que ficou); o Registro mostra quem recriou, e o apagado não recria de novo
  await p.waitForFunction(() => document.querySelectorAll('.linha-dup').length === 6);
  assert.equal((await aba.locator('.rot').textContent()).trim(), 'Duplicadas 6');
  await primeira.locator('text=recriou').waitFor();
  assert.match((await primeira.textContent()).replace(/\s+/g, ' '), new RegExp(`recriou o card …${cod(primeiro)} de Show da Noite 20/11 SP: card novo …${cod(novo.id)}, com 3 artes\\.agora$`));
  assert.match((await p.locator('.registro-dup li').nth(1).textContent()).replace(/\s+/g, ' '), /Já foi recriado\./);
  assert.equal(await p.locator('.registro-dup .recriar-registro-dup').count(), 0, 'não dá para recriar duas vezes');
  await semRolagemDeLado(p, 'computador, depois de recriar');
  await capturar(p, '25-recriar-registro-claro');
  // volta ao só olhar (o Apagar e o Recriar somem)
  await modo.locator('button', { hasText: 'Voltar a só olhar' }).click();
  await modo.locator('text=Só olhar').waitFor();
  assert.equal(await p.locator('.recriar-registro-dup').count(), 0);
  await caso(p, 'Festa na Praça').locator('.linha-dup').click();
  await caso(p, 'Festa na Praça').locator('.tabela-dup').waitFor();
  assert.equal(await p.locator('.apagar-dup').count(), 0);
  assert.deepEqual(erros, [], 'apagar: erros na página');
  await ctx.close();
  console.log('ok: apagar: só olhar esconde o Apagar; liberado, a confirmação (aviso do card aberto, Conferi + código) apaga, religa o acervo, e o caso sai da lista e entra no Registro');
  console.log('ok: recriar: no Registro, a confirmação (o que volta, o que não volta, Entendi) faz o card novo sem ler o Trello, a linha e o acervo voltam, o caso volta à lista e não recria duas vezes');
}

async function principal() {
  const { criarAcervo } = await import(join(RAIZ, 'servidor', 'acervo.mjs'));
  const acervo = criarAcervo({ ...ENV_TRELLO, ...ACERVO_GRAVA }, { consultar, buscar: buscarNoTeable });
  const s = await subir({ trello: { env: ENV_TRELLO, buscar, consultar }, acervo, env: { CADASTRO_ADMINS: LIA } });
  const navegador = await chromium.launch();
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, tema);
    await semSerAdministrador(navegador, s.url);
    for (const tema of ['light', 'dark']) await noCelular(navegador, s.url, tema);
    assert.deepEqual(pedidosAoTrello, [], 'nada lido no Trello (ADR 0006)');
    await apagarNoComputador(navegador, s.url);
  } finally {
    await navegador.close();
    await s.descer();
  }
}

if (require.main === module)
  principal().then(
    () => process.exit(0),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
