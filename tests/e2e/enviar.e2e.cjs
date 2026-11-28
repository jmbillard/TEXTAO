// Ponta a ponta do Enviar da folha de escrita (#194), rodado à parte do vitest: `npm run e2e:enviar`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros sobre um Teable
// falso (a Marina é redatora; o Davi, designer, não tem cadastro) e a lista de atrações com a "Brasa na Panela" (key
// BRASA). Nomes, e-mails e claquetes fictícios.
//
// A Marina (computador, claro) escreve o roteiro com uma arte na frase e um trecho inteiro de arte, e o Ctrl+Enter abre o
// painel do Enviar no card aberto: a claquete proposta (a key da atração, a data do título e a versão lida nas artes),
// sem aviso de "não bate"; corrigida a data à mão, o aviso aparece e some ao voltar. As pendências e os destinos estão
// lá. Ela envia: a folha diz "enviado" com a claquete, e ao lado aparecem o andamento da arte e o envio. O Davi
// (computador, escuro) vê o roteiro na fila, "escrito no PROMeiro", com as duas artes na revisão. A Marina continua
// escrevendo e reenvia: a pergunta da liberação (não) faz a V2, que substitui a anterior na fila (o Davi vê uma ficha
// só) e o histórico abre o envio com o que entrou marcado. No celular (claro e escuro), o painel do Enviar cabe, sem
// rolar para o lado. Sem "unha" e sem ✓ verde.
//
// Com CAPTURAS=pasta, grava as capturas (densidade 2) e o vídeo do Enviar (computador, claro).
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:enviar
const assert = require('node:assert/strict');
const { mkdirSync, readdirSync, renameSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');
const { checksVerdes } = require('./coerencia.cjs');
const RAIZ = join(__dirname, '..', '..');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:enviar');
  process.exit(2);
}

const MARINA = 'marina.teles@exemplo.com';
const DAVI = 'davi.rocha@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [{ nome: 'Brasa na Panela', chaves: ['BRASA'] }], redatores: ['Marina Teles'], editores: ['Caio Brandão'], pauta: [] };
// um dia de dezembro que ainda não passou: a claquete não sai como exibida
const ANO = new Date().getMonth() === 11 ? new Date().getFullYear() + 1 : new Date().getFullYear();
const DIA = '18/12';
const DIA_ISO = `${ANO}-12-18`;

const ENV_CADASTROS = {
  TEABLE_URL: 'http://teable-falso',
  TEABLE_TOKEN: 'falso',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
};
const TABELAS = { tblRed: [{ id: 'recR1', fields: { redator: 'Marina Teles', email: MARINA } }], tblKeyRed: [], tblEdi: [{ id: 'recE1', fields: { editor: 'Caio Brandão' } }], tblKeyEdi: [] };
const ok = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  if (u.host !== 'teable-falso' || (init.method ?? 'GET') !== 'GET') throw new Error(`o teste não sai para a rede: ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(u.pathname);
  return ok({ records: TABELAS[tabela] });
}

async function entrar(navegador, url, hash, email, opcoes = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(email), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}${hash}`);
  return { ctx, p, erros };
}
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
const semCheckVerde = async (p, onde) => assert.deepEqual(await checksVerdes(p), [], `${onde}: nada de ✓ verde`);
async function semUnha(p, onde) {
  const unhas = await p.evaluate(() =>
    [...document.querySelectorAll('.enviar *, .escrita-lado *, .envio-aberto *')].filter((e) => {
      const c = getComputedStyle(e);
      const borda = parseFloat(c.borderLeftWidth) >= 3 && c.borderLeftStyle !== 'none' && c.borderLeftColor !== c.borderTopColor;
      const sombra = /inset\s+([3-9]|\d{2,})px\s+0/.test(c.boxShadow);
      return borda || sombra;
    }).map((e) => e.className),
  );
  assert.deepEqual(unhas, [], `${onde}: nada de unha`);
}
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
};
const salvou = (p) => p.waitForSelector('.escrita-salvo[data-salvamento="salvo"]', { timeout: 8000 });
const fichasNaFila = (p) => p.locator('.ficha[data-ancora^="ficha:"]');

async function aMarinaEnvia(navegador, url) {
  const video = CAPTURAS ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: { width: 1280, height: 800 } } } : {};
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', MARINA, { viewport: { width: 1280, height: 800 }, colorScheme: 'light', ...video });
  await p.waitForSelector('.roteiros-escritos');
  await p.click('.novo-roteiro');
  await p.waitForSelector('.folha-escrita');
  await p.waitForFunction(() => document.activeElement?.closest('.texto-escrita') !== null);
  const id = decodeURIComponent(/#\/roteiros\/([\w-]+)$/.exec(p.url())[1]);
  // a locução com a arte na frase (Ctrl+U no selecionado) e um trecho inteiro de arte (Ctrl+U sem seleção)
  await p.keyboard.type('NESTE SÁBADO, OITO CHURRASQUEIROS', { delay: 8 });
  for (let i = 0; i < 'OITO CHURRASQUEIROS'.length; i++) await p.keyboard.press('Shift+ArrowLeft');
  await p.keyboard.press('ControlOrMeta+u');
  await p.keyboard.press('End');
  await p.keyboard.type(' NA BRASA.', { delay: 8 });
  await p.keyboard.press('ControlOrMeta+End');
  await p.keyboard.press('Enter');
  await p.keyboard.type('AMANHÃ, NA BRASA', { delay: 8 });
  await p.keyboard.press('ControlOrMeta+u');
  await p.fill('.folha-escrita-titulo', `Brasa na Panela ${DIA}, a final`);
  await salvou(p);
  await p.waitForSelector('.artes-da-escrita .arte-da-escrita >> nth=1');

  // o Ctrl+Enter abre o painel do Enviar, que cresce do botão
  await p.click('.texto-escrita');
  await p.keyboard.press('ControlOrMeta+Enter');
  await p.waitForSelector('.card-aberto .enviar');
  assert.equal(await p.inputValue('.enviar-claquete'), `BRASA ${DIA} (A)`, 'a key da atração, a data do título e a versão lida nas artes');
  assert.equal(await p.inputValue('.enviar-campo input[list]'), 'Brasa na Panela');
  assert.equal(await p.inputValue('.enviar-campo input[type="date"]'), DIA_ISO);
  assert.match(await p.locator('.enviar-versoes').innerText(), /A\s+amanhã/);
  assert.equal(await p.locator('.enviar-avisos li').count(), 0, 'nada que não bate');
  assert.match(await p.locator('.enviar-destinos').innerText(), /A fila da arte[\s\S]*A Pauta da edição/);
  await semUnha(p, 'o painel do Enviar');
  await semCheckVerde(p, 'o painel do Enviar');
  await capturar(p, '01-enviar-claquete-proposta');
  // a data corrigida à mão: a claquete não bate com ela, e o aviso aparece
  await p.fill('.enviar-claquete', `BRASA 19/12 (A)`);
  await p.waitForSelector('.enviar-avisos li');
  assert.match(await p.locator('.enviar-avisos').innerText(), /A claquete diz 19\/12, e a exibição é 18\/12/);
  await capturar(p, '02-enviar-nao-bate');
  await p.fill('.enviar-claquete', `BRASA ${DIA} (A)`);
  await p.waitForFunction(() => !document.querySelector('.enviar-avisos li'));
  await p.fill('.enviar-motivo input', 'a primeira versão');
  await p.click('.enviar-pe .botao.primario');
  await p.waitForSelector('.card-aberto', { state: 'detached' });
  await p.waitForSelector('.avisos .aviso');
  assert.match(await p.locator('.avisos .aviso').innerText(), /está na fila da arte/);
  assert.match(await p.locator('.folha-escrita-sobre').innerText(), new RegExp(`enviado · BRASA ${DIA} \\(A\\)`, 'i'));
  await p.waitForSelector('.andamento-da-arte .passos-da-arte li');
  assert.equal(await p.locator('.lista-de-envios .envio-linha').count(), 1);
  await semUnha(p, 'ao lado da folha enviada');
  await capturar(p, '03-folha-enviada');
  assert.deepEqual(erros, []);
  return { id, ctx, p };
}

async function oDaviNaFila(navegador, url, { ficha = 1, artes = 2 } = {}, nome) {
  const { ctx, p, erros } = await entrar(navegador, url, '#/', DAVI, { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await p.waitForSelector('.ficha .ficha-escrito');
  assert.equal(await fichasNaFila(p).count(), ficha, 'uma ficha só: o último envio');
  assert.match(await fichasNaFila(p).first().innerText(), new RegExp(`BRASA[\\s\\S]*escrito no PROMeiro`));
  await semCheckVerde(p, 'a fila');
  await capturar(p, `${nome}-fila-escuro`);
  // na revisão, as artes do texto: a da frase e o trecho inteiro
  await fichasNaFila(p).first().locator('.ficha-claquete').click();
  await p.waitForSelector('.texto .arte, .texto [data-arte], .texto u');
  await p.waitForFunction((n) => document.querySelectorAll('.lista-artes li, .artes li').length >= n, artes, { timeout: 8000 });
  await capturar(p, `${nome}-revisao-escuro`);
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function aMarinaReenvia({ p, ctx }) {
  await p.click('.texto-escrita');
  await p.keyboard.press('ControlOrMeta+End');
  await p.keyboard.press('Enter');
  await p.keyboard.type('E O PUDIM DA CIDA FECHA A NOITE.', { delay: 8 });
  await salvou(p);
  await p.click('.escrita-enviar');
  await p.waitForSelector('.card-aberto .enviar');
  assert.match(await p.locator('.enviar-sobre').innerText(), /Reenviar · o último foi A V1/i);
  assert.equal(await p.inputValue('.enviar-claquete'), `BRASA ${DIA} (A)`, 'o reenvio propõe a claquete do anterior');
  await p.fill('.enviar-motivo input', 'o pudim no final');
  await p.click('.enviar-pe .botao.primario');
  await p.waitForSelector('.pergunta-liberacao');
  await capturar(p, '06-reenviar-liberada');
  await p.locator('.pergunta-liberacao button', { hasText: 'Não' }).click();
  await p.waitForSelector('.card-aberto', { state: 'detached' });
  assert.match(await p.locator('.folha-escrita-sobre').innerText(), /V2/);
  await p.waitForFunction(() => document.querySelectorAll('.lista-de-envios .envio-linha').length === 2);
  // o histórico: o envio aberto com o que entrou desde o anterior
  await p.locator('.lista-de-envios .envio-linha').first().click();
  await p.waitForSelector('.envio-aberto .comparar-texto mark.entrou');
  assert.match(await p.locator('.envio-aberto mark.entrou').first().innerText(), /PUDIM DA CIDA/);
  await semUnha(p, 'o envio aberto');
  await capturar(p, '07-historico-do-envio');
  await p.keyboard.press('Escape');
  await p.waitForSelector('.card-aberto', { state: 'detached' });
  const caminho = await p.video()?.path();
  await ctx.close();
  if (caminho) renameSync(caminho, join(CAPTURAS, 'enviar-computador-claro.webm'));
}

async function noCelular(navegador, url, id) {
  for (const tema of ['light', 'dark']) {
    const { ctx, p, erros } = await entrar(navegador, url, `#/roteiros/${id}`, MARINA, { ...devices['iPhone 13'], colorScheme: tema });
    await p.waitForSelector('.folha-escrita .texto-escrita p');
    // no celular, o Enviar fica na barra do polegar (#198)
    await p.waitForSelector('.barra-do-polegar .polegar-enviar:not([disabled])');
    await semRolagemDeLado(p, `a folha enviada no celular (${tema})`);
    await capturar(p, `08-folha-celular-${tema}`);
    await p.click('.barra-do-polegar .polegar-enviar');
    await p.waitForSelector('.card-aberto .enviar');
    await semRolagemDeLado(p, `o painel do Enviar no celular (${tema})`);
    const largura = await p.locator('.card-aberto').evaluate((e) => e.getBoundingClientRect().width);
    assert.ok(largura <= 391, 'o painel ocupa a tela, sem passar dela');
    await semUnha(p, `o painel no celular (${tema})`);
    await semCheckVerde(p, `o painel no celular (${tema})`);
    await capturar(p, `09-enviar-celular-${tema}`);
    assert.deepEqual(erros, []);
    await ctx.close();
  }
}

(async () => {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros(ENV_CADASTROS, { buscar: buscarNoTeable });
  const s = await subir({ cadastros });
  const navegador = await chromium.launch();
  try {
    for (const email of [MARINA, DAVI]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
    const marina = await aMarinaEnvia(navegador, s.url);
    console.log('✔ o Ctrl+Enter abre o Enviar com a claquete proposta e os avisos de "não bate"; enviado, a folha mostra o andamento e o envio');
    await oDaviNaFila(navegador, s.url, {}, '04');
    console.log('✔ o designer vê o roteiro na fila, "escrito no PROMeiro", com as duas artes (a da frase e o trecho inteiro)');
    await aMarinaReenvia(marina);
    console.log('✔ o reenvio pergunta da liberação e vira a V2; o histórico mostra o que entrou');
    await oDaviNaFila(navegador, s.url, { artes: 2 }, '05');
    console.log('✔ na fila, a V2 no lugar da anterior: uma ficha só');
    await noCelular(navegador, s.url, marina.id);
    console.log('✔ no celular, claro e escuro, o painel do Enviar cabe, sem rolar para o lado');
    if (CAPTURAS) for (const f of readdirSync(join(CAPTURAS, 'video'), { withFileTypes: true }).filter((f) => f.isFile())) console.log(`vídeo: ${f.name}`);
  } finally {
    await navegador.close();
    await s.descer();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
