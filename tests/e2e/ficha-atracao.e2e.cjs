// Ponta a ponta da ficha da atração nos Cadastros (#57), rodado à parte do vitest: `npm run e2e:ficha`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, dados fictícios, nada sai para a rede), com o acervo
// de artes ligado a um Postgres do Teable falso: as rotas /api/acervo/* são as de verdade. A lista dos cadastros vem
// pela rota do navegador (o Teable da API fica desligado). No computador, claro e escuro: a lista mostra "N artes" e
// "acervo do filme"; clicar na atração abre a ficha (total, barra por tipo, "sem tipo" em destaque, novo pacote só para
// administradores); "Ver as N" troca a lista pelo acervo, com busca e filtro por tipo; "+ Nova atração" volta ao
// formulário. No celular, claro e escuro: a ficha é só consulta (total, por tipo, "tem essa arte?" e a lista).
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:ficha
// Com CAPTURAS=pasta, grava as capturas de cada tela (densidade 2).
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:ficha');
  process.exit(2);
}

const RAIZ = join(__dirname, '..', '..');
const LIA = 'lia.moraes@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

// o acervo fictício: o Programa Fictício tem 24 linhas (3 sem tipo); a sessão é de filme; os shows, sem acervo
const PROGRAMA = 'Programa Fictício';
const ARTES = [
  ...['SÁBADO', 'PRÓXIMO SÁBADO', 'SÁBADO 3:00', 'HOJE', 'AMANHÃ', 'DAQUI A POUCO', 'LOGO MAIS', 'NESTA SEMANA', 'BANDA FICTÍCIA', 'CORAL FICTÍCIO', 'TRIO DE EXEMPLO', 'ORQUESTRA DE TESTE'].map((arte) => [arte, 'RDP']),
  ...['SÁBADO', 'HOJE', 'AMANHÃ', 'DOMINGO', 'SEGUNDA', 'TERÇA'].map((arte) => [arte, 'CRT']),
  ['AO VIVO', 'LETT'],
  ['ESPECIAL', 'LETT'],
  ['PALCO', 'FOTO'],
  ['SABADO 7 15', ''],
  ['VEM AÍ', ''],
  ['PLATEIA', ''],
];
const LINHAS = [
  ...ARTES.map(([arte, tipo], i) => ({ id: `recArte${i}`, arte, tipo: tipo || null, atracao: [{ id: 'recProg', title: PROGRAMA }], claquete: [], filme: null })),
  { id: 'recOutra', arte: 'HOJE', tipo: 'RDP', atracao: [{ id: 'recNovela', title: 'Novela Fictícia' }], claquete: [], filme: null },
  { id: 'recFilme', arte: 'TÍTULO', tipo: null, atracao: [{ id: 'recSessao', title: 'Sessão Fictícia' }], claquete: [], filme: { id: 'recF', title: 'FILME FICTÍCIO (2020)' } },
];
const ACERVOS = [
  { atracao: PROGRAMA, acervo: 'próprio' },
  { atracao: 'Novela Fictícia', acervo: null },
  { atracao: 'Sessão Fictícia', acervo: 'do filme' },
  { atracao: 'Shows Fictícios', acervo: 'sem acervo' },
];
const atracao = (id, nome, categoria, acervo, keys) => ({ id, nome, categoria, acervo, keys: keys.map((key, i) => ({ id: `${id}k${i}`, key })), caminhos: {}, campos: {} });
const CADASTROS = {
  ligado: true,
  atracoes: [
    atracao('recNovela', 'Novela Fictícia', 'Novela', 'proprio', ['NOVELA FICTICIA']),
    atracao('recProg', PROGRAMA, 'Programa', 'proprio', ['PROGRAMA FICTICIO', 'PROG FICT']),
    atracao('recSessao', 'Sessão Fictícia', 'Filme', 'filme', ['SESSAO FICTICIA']),
    atracao('recShows', 'Shows Fictícios', 'Show', 'sem', ['SHOWS']),
  ],
  redatores: [],
  editores: [],
  categorias: ['Filme', 'Novela', 'Programa', 'Show'],
  camposCaminho: [],
  formulas: {},
  podeApagar: true,
};

async function acervoFalso() {
  const { criarAcervo } = await import(join(RAIZ, 'servidor', 'acervo.mjs'));
  const env = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', TEABLE_PG_ACERVO: 'acervo', TEABLE_PG_ATRACOES: 'atracoes' };
  const consultar = async (sql) => (sql.includes('"bseFalso"."acervo"') ? LINHAS : sql.includes('"atracoes"') ? ACERVOS : []);
  return criarAcervo(env, { consultar });
}

/** Um contexto do navegador como a Lia, com a lista fictícia dos cadastros (administradora ou não). */
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
  await p.waitForSelector('.atracao-cad .qtd-acervo');
  return { ctx, p, erros };
}

const semRolagemDeLado = async (p, onde) =>
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
/** O fundo da página é escuro? (o tema segue o sistema) */
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
const linha = (p, nome) => p.locator('.atracao-cad', { has: p.locator('.abrir-ficha', { hasText: nome }) });

async function noComputador(navegador, url, tema) {
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark', `computador ${tema}: o tema segue o sistema`);
  // a lista: "N artes" do acervo próprio, "acervo do filme" da sessão; a sem acervo, sem número
  assert.equal((await linha(p, PROGRAMA).locator('.qtd-acervo').textContent()).trim(), '24 artes');
  assert.equal((await linha(p, 'Novela Fictícia').locator('.qtd-acervo').textContent()).trim(), '1 arte');
  assert.equal((await linha(p, 'Sessão Fictícia').locator('.qtd-acervo').textContent()).trim(), 'acervo do filme');
  assert.equal(await linha(p, 'Shows Fictícios').locator('.qtd-acervo').count(), 0);
  assert.equal(await p.locator('.atracao-cad .pacote-cad').count(), 0, 'o novo pacote saiu da linha');

  // clicar na atração abre a ficha no lugar de "Nova atração"
  await linha(p, PROGRAMA).locator('.keys').click({ position: { x: 400, y: 5 } });
  const ficha = p.locator('.ficha-atr');
  await ficha.locator('.total-acervo').waitFor();
  assert.equal(await ficha.locator('h2').textContent(), PROGRAMA);
  assert.equal(await ficha.locator('.dica').textContent(), 'Programa · acervo próprio');
  assert.deepEqual(await ficha.locator('.keys-ficha .key:not(.nova)').allTextContents(), ['PROGRAMA FICTICIO', 'PROG FICT']);
  assert.match(await ficha.locator('.total-acervo').textContent(), /^24\s*artes prontas$/);
  assert.equal(await ficha.locator('.barra-tipos i').count(), 5, 'uma faixa por tipo');
  assert.deepEqual(await ficha.locator('.legenda-tipos span').allTextContents(), ['RDP12', 'CRT6', 'LETT2', 'FOTO1', 'sem tipo3']);
  assert.equal(await ficha.locator('.legenda-tipos .sem').textContent(), 'sem tipo3', '"sem tipo" no fim e em destaque');
  assert.ok(await linha(p, PROGRAMA).evaluate((el) => el.classList.contains('aberta')), 'a linha aberta fica marcada');
  assert.equal(await ficha.locator('.rodape-ficha .pacote-cad').textContent(), 'novo pacote', 'o novo pacote na ficha, para administradores');
  assert.equal(await ficha.locator('.rodape-ficha .pacote-cad').evaluate((b) => getComputedStyle(b).opacity), '1', 'o novo pacote aparece sem passar o mouse');
  assert.equal(await p.locator('.form-cad h2', { hasText: 'Nova atração' }).count(), 0);
  await semRolagemDeLado(p, `computador ${tema}, ficha`);
  await capturar(p, `ficha-computador-${tema === 'dark' ? 'escuro' : 'claro'}`);
  // o novo pacote pede a confirmação, como antes na linha; "Não" desiste sem apagar nada
  await ficha.locator('.rodape-ficha .pacote-cad').click();
  await ficha.locator('.rodape-ficha .remover-conferir', { hasText: `As artes de ${PROGRAMA} deixam de valer.` }).waitFor();
  await ficha.locator('.rodape-ficha .remover-conferir button', { hasText: 'Não' }).click();
  await ficha.locator('.rodape-ficha .pacote-cad').waitFor();

  // "Ver as 24": a lista da esquerda vira o acervo, com o filtro por tipo e a busca
  await ficha.locator('.secao-acervo-tit .botao-texto', { hasText: 'Ver as 24' }).click();
  const lista = p.locator('.lista-acervo');
  await lista.locator('.arte-acervo').first().waitFor();
  assert.equal(await lista.locator('.arte-acervo').count(), 24);
  assert.deepEqual(await lista.locator('.filtro-tipos button').allTextContents(), ['Todos · 24', 'RDP · 12', 'CRT · 6', 'LETT · 2', 'FOTO · 1', 'sem tipo · 3']);
  await capturar(p, `acervo-computador-${tema === 'dark' ? 'escuro' : 'claro'}`);
  await lista.locator('.filtro-tipos button', { hasText: 'sem tipo' }).click();
  assert.deepEqual(await lista.locator('.arte-acervo .t').allTextContents(), ['PLATEIA', 'SABADO 7 15', 'VEM AÍ']);
  await lista.locator('.filtro-tipos button', { hasText: 'Todos' }).click();
  await lista.locator('.cad-busca input').fill('sabado');
  assert.deepEqual(
    await lista.locator('.arte-acervo').evaluateAll((ls) => ls.map((l) => `${l.querySelector('.t').textContent} ${l.querySelector('.s').textContent}`)),
    ['PRÓXIMO SÁBADO RDP', 'SÁBADO CRT', 'SÁBADO RDP', 'SÁBADO 3:00 RDP', 'SABADO 7 15 sem tipo'],
    'a busca ignora acento e caixa',
  );
  await lista.locator('.filtro-tipos button', { hasText: 'CRT' }).click();
  assert.deepEqual(await lista.locator('.arte-acervo .t').allTextContents(), ['SÁBADO'], 'a busca e o filtro juntos');
  await semRolagemDeLado(p, `computador ${tema}, acervo`);

  // "Atrações" volta à lista; "+ Nova atração" volta ao formulário
  await lista.locator('.trilha-cad .botao-texto', { hasText: 'Atrações' }).click();
  await linha(p, PROGRAMA).waitFor();
  assert.equal(await p.locator('.ficha-atr').count(), 1, 'a ficha continua aberta');
  // a sessão de filme: a ficha diz que o acervo é do filme, sem "Ver as" nem novo pacote
  await linha(p, 'Sessão Fictícia').locator('.abrir-ficha').click();
  await ficha.locator('.nota-acervo', { hasText: 'acervo de cada filme' }).waitFor();
  assert.equal(await ficha.locator('h2').textContent(), 'Sessão Fictícia');
  assert.equal(await ficha.locator('.secao-acervo-tit .botao-texto').count(), 0);
  assert.equal(await ficha.locator('.rodape-ficha').count(), 0);
  await ficha.locator('.volta-ficha').click();
  await p.locator('.form-cad h2', { hasText: 'Nova atração' }).waitFor();
  assert.equal(await p.locator('.atracao-cad.aberta').count(), 0);

  assert.deepEqual(erros, [], `computador ${tema}: erros na página`);
  await ctx.close();
  console.log(`ok: computador ${tema === 'dark' ? 'escuro' : 'claro'}: lista com o acervo, ficha, "Ver as 24" com busca e filtro, volta ao formulário`);
}

async function semSerAdministrador(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, { admin: false });
  await linha(p, PROGRAMA).locator('.abrir-ficha').click();
  await p.locator('.ficha-atr .total-acervo').waitFor();
  assert.equal(await p.locator('.ficha-atr .rodape-ficha').count(), 0, 'quem não é administrador não vê o novo pacote');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: sem ser administrador, a ficha não tem o novo pacote');
}

async function noCelular(navegador, url, tema) {
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark', `celular ${tema}: o tema segue o sistema`);
  await linha(p, PROGRAMA).locator('.abrir-ficha').tap();
  const ficha = p.locator('.ficha-celular');
  await ficha.locator('.total-acervo').waitFor();
  assert.equal(await ficha.locator('h1').textContent(), PROGRAMA);
  assert.match(await ficha.locator('.total-acervo').textContent(), /^24\s*artes no acervo$/);
  assert.equal(await ficha.locator('.legenda-tipos .sem').textContent(), 'sem tipo3');
  assert.equal(await ficha.locator('.arte-acervo').count(), 24);
  // só consulta: nada de keys, novo pacote, lixeira ou formulário
  assert.equal(await p.locator('.ficha-celular .key, .pacote-cad, .lixo-cad, .form-cad, .atracao-cad').count(), 0, 'no celular, a ficha é só consulta');
  await ficha.locator('.cad-busca input').fill('sábado');
  assert.deepEqual(await ficha.locator('.arte-acervo .t').allTextContents(), ['PRÓXIMO SÁBADO', 'SÁBADO', 'SÁBADO', 'SÁBADO 3:00', 'SABADO 7 15']);
  await semRolagemDeLado(p, `celular ${tema}`);
  await capturar(p, `ficha-celular-${tema === 'dark' ? 'escuro' : 'claro'}`);
  await ficha.locator('.cad-busca input').fill('nenhuma assim');
  await ficha.locator('.cad-vazio', { hasText: 'Nada com “nenhuma assim” no acervo.' }).waitFor();
  await ficha.locator('.trilha-cad .botao-texto').tap();
  await linha(p, PROGRAMA).waitFor();
  assert.deepEqual(erros, [], `celular ${tema}: erros na página`);
  await ctx.close();
  console.log(`ok: celular ${tema === 'dark' ? 'escuro' : 'claro'}: a ficha só de consulta, com a busca "tem essa arte?"`);
}

async function principal() {
  const s = await subir({ acervo: await acervoFalso() });
  const navegador = await chromium.launch();
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, tema);
    await semSerAdministrador(navegador, s.url);
    for (const tema of ['light', 'dark']) await noCelular(navegador, s.url, tema);
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
