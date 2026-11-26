// Ponta a ponta da aba Duplicadas dos Cadastros (#65), rodado à parte do vitest: `npm run e2e:duplicadas`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o quadro do Trello, a
// produção da arte e o acervo falsos (cards fictícios): as rotas /api/duplicadas são as de verdade. No computador, claro
// e escuro: a aba com o número de casos, o período, "Lido do Trello", a busca, as três seções; abrir um caso mostra os
// cards lado a lado com as diferenças e a sugestão, que a pessoa troca; o caso de três cards. Quem não é administrador
// não vê a aba. No celular, claro e escuro: a lista e o caso aberto com os cards empilhados, só consulta.
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

/* ---------- o quadro fictício ---------- */
const DIA = 86_400_000;
const HORA = 3_600_000;
const AGORA = Date.now();
let sequencia = 0;
const idCriadoEm = (ms) => Math.floor(ms / 1000).toString(16).padStart(8, '0') + (++sequencia).toString(16).padStart(16, '0');
const LISTAS = { entradaSP: 'ENTRADA SP', entradaG5: 'ENTRADA G5', saidaSP: 'SAÍDA SP', saidaG5: 'SAÍDA G5', entregues: 'PROJETOS ENTREGUES' };
const PESSOAS = { m1: 'Pessoa Um', m2: 'Pessoa Dois', m3: 'Pessoa Três' };
const CARDS = [];
const PRODUCAO = [];
function card(numero, nome, criado, o = {}) {
  const c = { id: idCriadoEm(criado), idShort: numero, name: nome, closed: false, idList: 'entradaG5', idMembers: ['m1'], due: null, checkItems: 4, anexos: ['application/pdf'], ...o };
  CARDS.push(c);
  if (o.producao) PRODUCAO.push({ registro: `rec${numero}`, card_ID: c.id, status: o.producao.status ?? [], designers: o.producao.designers ?? [], data_entrada: new Date(criado + HORA).toISOString() });
  return c;
}
const exibicao = (dias) => new Date(AGORA + dias * DIA).toISOString();
// com arquivado e aberto
card(4681, 'Festa na Praça 19/11 REDE', AGORA - 4.4 * DIA, { producao: { status: ['PRODUZINDO'], designers: ['Designer Um'] }, due: exibicao(1) });
card(4686, 'FESTA NA PRACA 19/11', AGORA - 4.2 * DIA, { closed: true, idMembers: [], due: exibicao(1) });
card(4790, 'Show da Noite 20/11 SP', AGORA - 6.3 * DIA, { idList: 'saidaSP', idMembers: ['m1', 'm2'], anexos: ['application/pdf', 'image/png', 'image/jpeg'], producao: { status: ['FINALIZADO'], designers: ['Designer Um', 'Designer Dois'] }, due: exibicao(2) });
card(4795, 'Show da Noite 20/11', AGORA - 6.3 * DIA + 3 * HORA, { closed: true, idList: 'entradaSP', praca: 'opSP', idMembers: [], producao: { status: ['ENTRADA'] }, due: exibicao(2) });
card(4840, 'Arena do Domingo 23/11', AGORA - 2.4 * DIA, { checkItems: 3, producao: { status: ['PRODUZINDO'], designers: ['Designer Três'] }, due: exibicao(4) });
card(4843, 'Arena do Domingo 23/11', AGORA - 2.4 * DIA + 26 * 60_000, { closed: true, idMembers: [], checkItems: 3, due: exibicao(4) });
card(4851, 'ARENA DO DOMINGO_23_11', AGORA - 2.4 * DIA + 8 * HORA, { closed: true, idMembers: [], checkItems: 2, anexos: [], due: exibicao(4) });
// todos abertos
card(4700, 'Cozinha de Vó 18/11', AGORA - 9.5 * DIA, { producao: { status: ['FINALIZADO'] }, idList: 'saidaG5' });
card(4702, 'Cozinha de Vo 18/11', AGORA - 9.2 * DIA, { producao: { status: ['ENTRADA'] } });
card(4760, 'Jornal da Tarde(Chamada)21/11 SP', AGORA - 5.5 * DIA, { idList: 'entradaSP', producao: {} });
card(4763, 'JORNAL DA TARDE(CHAMADA)21/11 SP', AGORA - 5.3 * DIA, { idList: 'entradaSP', producao: {} });
// todos arquivados
card(4600, 'Novela Sinfonia 12/11', AGORA - 15.5 * DIA, { closed: true, idList: 'entregues', producao: { status: ['FINALIZADO'] } });
card(4604, 'Novela Sinfonia 12/11', AGORA - 15.2 * DIA, { closed: true });
// versões diferentes não contam; e um caso só com mais de 90 dias
card(4720, 'Terra 20/11', AGORA - 3 * DIA);
card(4722, 'Terra 20/11 V2', AGORA - 2.9 * DIA);
card(4200, 'Verão Antigo 10/07', AGORA - 120 * DIA, { closed: true });
card(4201, 'Verao Antigo 10/07', AGORA - 119 * DIA, { closed: true });
// as artes do acervo ligadas às linhas da produção
const ACERVO = [
  ...['HOJE', 'AMANHÃ', 'SÁBADO'].map((arte, i) => ({ id: `recS${i}`, arte, tipo: 'RDP', atracao: [{ id: 'recShow', title: 'Show da Noite' }], claquete: [{ id: 'rec4790', title: 'SHOW DA NOITE 20/11 SP' }], filme: null })),
  ...['ABERTURA', 'ELENCO', 'ESTREIA', 'HOJE', 'FINAL'].map((arte, i) => ({ id: `recN${i}`, arte, tipo: 'CRT', atracao: [{ id: 'recNov', title: 'Novela Sinfonia' }], claquete: [{ id: 'rec4600', title: 'NOVELA SINFONIA 12/11' }], filme: null })),
];

const ENV_TRELLO = {
  TRELLO_KEY: 'falsa',
  TRELLO_TOKEN: 'falso',
  TRELLO_QUADRO: 'quadroFicticio',
  TRELLO_LISTA_SP: 'entradaSP',
  TRELLO_LISTA_G5: 'entradaG5',
  TRELLO_SAIDA_SP: 'saidaSP',
  TRELLO_SAIDA_G5: 'saidaG5',
  TRELLO_LISTA_ENTREGUES: 'entregues',
  TRELLO_CAMPO_PRACA: 'campoPraca',
  TRELLO_PRACAS: 'G5=opG5,SP=opSP,RJ=opRJ',
  TEABLE_PG_URL: 'postgres://falso',
  TEABLE_PG_ESQUEMA: 'bseFalso',
  TEABLE_PG_ARTE: 'producao',
  TEABLE_PG_ACERVO: 'acervo',
};
const criado = (id) => parseInt(id.slice(0, 8), 16) * 1000;
const comoTrello = (x) => ({
  id: x.id,
  idShort: x.idShort,
  name: x.name,
  closed: x.closed,
  idList: x.idList,
  idMembers: x.idMembers,
  due: x.due,
  shortUrl: `https://trello.com/c/Ficti${x.idShort}`,
  dateLastActivity: new Date(criado(x.id)).toISOString(),
  badges: { checkItems: x.checkItems, attachments: x.anexos.length },
  customFieldItems: x.praca ? [{ idCustomField: 'campoPraca', idValue: x.praca }] : [],
});
/** O Trello de mentira: só leitura (qualquer outro método derruba o teste). */
const pedidosAoTrello = [];
async function buscar(url, init = {}) {
  const u = new URL(url);
  const metodo = init.method ?? 'GET';
  pedidosAoTrello.push(`${metodo} ${u.pathname}`);
  if (metodo !== 'GET') throw new Error(`a aba Duplicadas só lê: ${metodo} ${u.pathname}`);
  const ok = (dados) => ({ ok: true, status: 200, json: async () => dados, text: async () => '' });
  if (u.pathname === '/1/boards/quadroFicticio/cards/all') {
    const desde = Date.parse(u.searchParams.get('since') ?? '') || 0;
    const antes = u.searchParams.get('before');
    return ok(CARDS.filter((x) => criado(x.id) >= desde && (!antes || x.id < antes)).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5).map(comoTrello));
  }
  if (u.pathname === '/1/boards/quadroFicticio/customFields') return ok([{ id: 'campoPraca', name: 'PRAÇA', options: ['G5', 'SP', 'RJ'].map((p) => ({ id: `op${p}`, value: { text: p } })) }]);
  if (u.pathname === '/1/boards/quadroFicticio/lists') return ok(Object.entries(LISTAS).map(([id, name]) => ({ id, name, closed: false })));
  const umCard = /^\/1\/cards\/([0-9a-f]{24})$/.exec(u.pathname);
  const x = umCard && CARDS.find((y) => y.id === umCard[1]);
  if (x) return ok({ ...comoTrello(x), attachments: x.anexos.map((mimeType, i) => ({ id: `a${i}`, name: `anexo${i}`, mimeType })), members: x.idMembers.map((id) => ({ id, fullName: PESSOAS[id] })) });
  throw new Error(`pedido inesperado ao Trello: ${u.pathname}`);
}
async function consultar(sql, params = []) {
  if (sql.includes('"bseFalso"."acervo"')) return ACERVO;
  if (sql.includes('"bseFalso"."producao"') && sql.includes('card_ID')) return PRODUCAO.filter((l) => (params[0] ?? []).includes(l.card_ID));
  return [];
}

/* ---------- o navegador ---------- */

async function abrir(navegador, url, opcoes, { admin = true } = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/cadastros', (r) => r.fulfill({ json: { ...CADASTROS, podeApagar: admin } }));
  await ctx.route((u) => u.pathname === '/api/cadastros/sem-cadastro', (r) => r.fulfill({ json: { keys: [], reconhecidas: { total: 0, amostra: [] } } }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
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
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: true });
};
const claquetes = (p) => p.locator('.linha-dup .claquete-dup').allTextContents();
const caso = (p, nome) => p.locator('.caso-dup', { has: p.locator('.claquete-dup', { hasText: nome }) });
const textos = async (l) => (await l.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());

async function noComputador(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
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
  assert.match((await p.locator('.lido-dup').textContent()).replace(/\s+/g, ' '), /^Lido do Trello agora · 15 cards/);
  assert.deepEqual(await p.locator('.secao-dup > header').evaluateAll((hs) => hs.map((h) => [...h.children].map((c) => c.textContent.trim()).join(' '))), [
    'Com arquivado e aberto 3 casos · 7 cards O caso de sempre: um reenvio arquivado na entrada.',
    'Todos abertos 2 casos · 4 cards Ainda estão todos no quadro.',
    'Todos arquivados 1 caso · 2 cards Já saíram do quadro.',
  ]);
  assert.deepEqual(await claquetes(p), ['Arena do Domingo 23/11', 'Festa na Praça 19/11 REDE', 'Show da Noite 20/11 SP', 'Jornal da Tarde(Chamada)21/11 SP', 'Cozinha de Vó 18/11', 'Novela Sinfonia 12/11']);
  assert.deepEqual(await textos(caso(p, 'Show da Noite').locator('.sinais-dup .s')), ['1 aberto', '1 arquivado', '2 com linha na produção', '3 artes no acervo']);
  assert.deepEqual(await textos(caso(p, 'Show da Noite').locator('.lado-dup span')), ['2 cards', 'há 6 dias']);
  assert.equal(await caso(p, 'Terra').count(), 0, 'versões diferentes não contam');
  await semRolagemDeLado(p, `computador ${nome}, lista`);
  await capturar(p, `01-lista-${nome}`);

  // abrir um caso: os cards lado a lado, as diferenças e a sugestão
  await caso(p, 'Show da Noite').locator('.linha-dup').click();
  const tabela = caso(p, 'Show da Noite').locator('.tabela-dup');
  await tabela.waitFor();
  assert.equal(await caso(p, 'Show da Noite').locator('.linha-dup').getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await textos(tabela.locator('.cabeca .numero-dup')), ['#4790', '#4795']);
  assert.deepEqual(await textos(tabela.locator('.cabeca .sugestao-dup')), ['Sugestão: fica. Não foi arquivado na entrada.', 'Provável duplicado. Arquivado na lista de entrada.']);
  const diferentes = await textos(tabela.locator('.difere [role=rowheader]'));
  for (const r of ['Lista', 'Estado', 'Status', 'Designers', 'Membros', 'Anexos', 'Acervo ligado']) assert.ok(diferentes.includes(r), `${r} difere`);
  for (const r of ['Exibição', 'Artes', 'Produção da arte', 'Criado', 'Trello']) assert.ok(!diferentes.includes(r), `${r} não difere`);
  const linhaDe = async (rotulo) => textos(tabela.locator('[role=row]', { has: p.locator('[role=rowheader]', { hasText: new RegExp(`^${rotulo}$`) }) }).locator('[role=cell]'));
  assert.deepEqual(await linhaDe('Lista'), ['SAÍDA SP≠', 'ENTRADA SP≠']);
  assert.deepEqual(await linhaDe('Anexos'), ['1 PDF, 2 imagens≠', '1 PDF≠']);
  assert.deepEqual(await linhaDe('Produção da arte'), ['tem linha', 'tem linha']);
  assert.match((await linhaDe('Criado'))[1], / · 3 h depois$/);
  assert.deepEqual(await linhaDe('Trello'), ['trello.com/c/Ficti4790', 'trello.com/c/Ficti4795']);
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

  // três cards: fica um, saem dois; com três, o último que fica não sai
  await caso(p, 'Arena do Domingo').locator('.linha-dup').click();
  const tres = caso(p, 'Arena do Domingo').locator('.tabela-dup');
  await tres.waitFor();
  assert.deepEqual(await textos(tres.locator('.cabeca .numero-dup')), ['#4840', '#4843', '#4851']);
  assert.deepEqual(await tres.locator('.cabeca .col-dup').evaluateAll((cs) => cs.map((c) => (c.classList.contains('fica') ? 'fica' : 'sai'))), ['fica', 'sai', 'sai']);
  await tres.locator('.cabeca .col-dup').nth(0).locator('button', { hasText: 'Sai' }).click();
  assert.deepEqual(await tres.locator('.cabeca .col-dup').evaluateAll((cs) => cs.map((c) => (c.classList.contains('fica') ? 'fica' : 'sai'))), ['fica', 'sai', 'sai']);
  await semRolagemDeLado(p, `computador ${nome}, três cards`);
  await capturar(p, `03-tres-cards-${nome}`);
  await caso(p, 'Arena do Domingo').locator('.linha-dup').click();

  // a busca, pela claquete sem acento; o contador da aba não muda
  await p.locator('.cad-busca input').fill('cozinha de vo');
  await p.waitForFunction(() => document.querySelectorAll('.linha-dup').length === 1);
  assert.deepEqual(await claquetes(p), ['Cozinha de Vó 18/11']);
  assert.equal((await aba.locator('.rot').textContent()).trim(), 'Duplicadas 6');
  await p.locator('.cad-busca input').fill('');
  await p.waitForFunction(() => document.querySelectorAll('.linha-dup').length === 6);

  // o período: 180 dias pega o caso antigo; a escolha fica guardada no navegador
  await p.locator('.periodo-dup button', { hasText: '180' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.linha-dup').length === 7);
  assert.equal((await aba.locator('.rot').textContent()).trim(), 'Duplicadas 7');
  assert.match((await p.locator('.lido-dup').textContent()).replace(/\s+/g, ' '), /· 17 cards/);
  await p.locator('.periodo-dup button', { hasText: '90' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.linha-dup').length === 6);

  assert.deepEqual(erros, [], `computador ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: computador ${nome}: aba com 6, seções, lista → caso lado a lado com diferenças e sugestão trocável, três cards, busca e período`);
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
  assert.ok((await textos(detalhe.locator('.card-dup').nth(1).locator('.difere dt'))).includes('Lista'));
  await semRolagemDeLado(p, `celular ${nome}, caso`);
  await capturar(p, `11-celular-detalhe-${nome}`);
  assert.deepEqual(erros, [], `celular ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: celular ${nome}: lista → caso com os cards empilhados, só consulta`);
}

async function principal() {
  const { criarAcervo } = await import(join(RAIZ, 'servidor', 'acervo.mjs'));
  const acervo = criarAcervo(ENV_TRELLO, { consultar });
  const s = await subir({ trello: { env: ENV_TRELLO, buscar, consultar }, acervo, env: { CADASTRO_ADMINS: LIA } });
  const navegador = await chromium.launch();
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, tema);
    await semSerAdministrador(navegador, s.url);
    for (const tema of ['light', 'dark']) await noCelular(navegador, s.url, tema);
    assert.deepEqual([...new Set(pedidosAoTrello.map((x) => x.split(' ')[0]))], ['GET'], 'só leitura no Trello');
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
