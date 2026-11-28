// Ponta a ponta do escrever na folha (#190), rodado à parte do vitest: `npm run e2e:escrever`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros sobre um Teable
// falso (a Marina é redatora pelo e-mail). Nomes, servidores e caminhos fictícios.
//
// No computador (claro): a Marina abre um Novo roteiro e escreve. O tipo adivinhado aparece na margem com "?"; o Tab
// confirma, o Tab de novo troca, o Shift+Tab volta. O "/" abre o menu com os doze comandos, que filtra pelo teclado
// (setas, Enter e Tab escolhem; Esc fecha); a locação sai como o cabeçalho do grupo, a locução em caixa alta. O timecode e
// o arquivo da rede viram fichas quando o cursor sai deles; a do arquivo mostra o nome, abre o caminho inteiro e copia.
// O Ctrl+U marca a arte no selecionado (no meio da frase) e, sem seleção, o trecho todo; a lista ao lado numera as
// artes sem repetir, e o clique nela abre o tipo da arte (opcional). O clique na margem abre o menu do tipo (com os
// números). O rodapé conta as palavras, as da locução e o tempo de leitura, com os atalhos à vista; o "?" abre o cartão
// dos atalhos, mas no texto é só um "?". Ao recarregar, os tipos e as artes voltam.
//
// No escuro, com o movimento reduzido, e no celular (a folha sem rolar para o lado).
//
// Com CAPTURAS=pasta, grava as capturas (densidade 2) e o vídeo da escrita (computador, claro).
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:escrever
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:escrever');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const MARINA = 'marina.teles@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };
const CAMINHO = '\\\\srv-promo\\brutos\\DESAFIO_BRASA\\EP08\\CAM_A_014.mxf';

const ENV_CADASTROS = {
  TEABLE_URL: 'http://teable-falso',
  TEABLE_TOKEN: 'falso',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
};
const TABELAS = {
  tblRed: [{ id: 'recR1', fields: { redator: 'Marina Teles', email: MARINA } }],
  tblKeyRed: [],
  tblEdi: [{ id: 'recE1', fields: { editor: 'Caio Brandão' } }],
  tblKeyEdi: [],
};
const ok = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  if (u.host !== 'teable-falso' || (init.method ?? 'GET') !== 'GET') throw new Error(`o teste não sai para a rede: ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(u.pathname);
  return ok({ records: TABELAS[tabela] });
}

async function entrar(navegador, url, hash, email, opcoes = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
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
/** Nenhum item com faixa colorida na borda esquerda (a "unha"). */
async function semUnha(p, onde) {
  const unhas = await p.evaluate(() =>
    [...document.querySelectorAll('.folha-escrita *, .escrita-lado *, .menu *, .popover *, .estatisticas *')].filter((e) => {
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
  await p.waitForTimeout(450);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
};
const salvou = (p) => p.waitForSelector('.escrita-salvo[data-salvamento="salvo"]', { timeout: 8000 });
/** O rótulo da margem do trecho n (0 é o primeiro): o texto ("LOC?") e o tipo. */
const rotulo = async (p, n) => (await p.locator('.margem-dos-tipos .tipo-na-margem').nth(n).innerText()).replace(/\s+/g, '');
const tipos = (p) => p.locator('.texto-escrita > p').evaluateAll((ps) => ps.map((x) => `${x.dataset.tipo}${x.dataset.confirmado === 'true' ? '' : '?'}`));
// a arte que sai ainda fica um instante na lista, recolhendo (as Vagas)
const artesDaLista = (p) => p.locator('.artes-da-escrita .vaga-y:not(.saindo) .arte-linha .txt b').allInnerTexts();
const devagar = { delay: 10 };

async function aMarinaEscreve(navegador, url) {
  const video = CAPTURAS ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: { width: 1440, height: 900 } } } : {};
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', MARINA, { viewport: { width: 1440, height: 900 }, colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'], ...video });
  await p.waitForSelector('.roteiros-escritos');
  await p.click('.novo-roteiro');
  await p.waitForFunction(() => document.activeElement?.closest('.texto-escrita') !== null);
  const id = /#\/roteiros\/([\w-]+)$/.exec(p.url())[1];

  // o palpite com "?" e o Tab: confirma, troca, volta
  await p.keyboard.type('NESTE SÁBADO, A BRASA DECIDE.', devagar);
  await p.waitForFunction(() => document.querySelector('.tipo-na-margem')?.textContent.replace(/\s/g, '') === 'LOC?');
  assert.deepEqual(await tipos(p), ['locucao?']);
  await capturar(p, '01-palpite-claro');
  await p.keyboard.press('Tab');
  assert.deepEqual(await tipos(p), ['locucao'], 'o Tab confirma o palpite');
  assert.equal(await rotulo(p, 0), 'LOC');
  await p.keyboard.press('Tab');
  assert.deepEqual(await tipos(p), ['arte'], 'o Tab de novo troca pelo próximo');
  assert.deepEqual(await artesDaLista(p), ['NESTE SÁBADO, A BRASA DECIDE.'], 'o trecho de arte entra na lista');
  await p.keyboard.press('Shift+Tab');
  assert.deepEqual(await tipos(p), ['locucao'], 'o Shift+Tab volta');
  assert.deepEqual(await artesDaLista(p), [], 'deixou de ser arte, saiu da lista');
  // o palpite é refeito enquanto se digita: o trecho novo começa sem tipo e vira sonora pelo texto
  await p.keyboard.press('Enter');
  await p.keyboard.type('Dona Zélia, de Pelotas: Aqui ninguém leva carne crua ', devagar);
  assert.deepEqual(await tipos(p), ['locucao', 'sonora?']);

  // a ficha do timecode, quando o cursor sai dela
  await p.keyboard.type('00:12:41:08', devagar);
  assert.equal(await p.locator('.ficha-do-texto-timecode').count(), 0, 'enquanto se digita, ainda não é ficha');
  await p.keyboard.type('.');
  await p.waitForSelector('.ficha-do-texto-timecode');
  assert.equal(await p.locator('.ficha-do-texto-timecode').innerText(), '00:12:41:08');

  // o "/": os doze comandos, o filtro pelo teclado, as setas e o Esc
  await p.keyboard.press('Enter');
  await p.keyboard.type('/');
  await p.waitForSelector('.menu-da-barra');
  const comandos = await p.locator('.menu-da-barra [data-comando]').evaluateAll((bs) => bs.map((b) => b.dataset.comando));
  assert.deepEqual(comandos, ['locucao', 'arte', 'sonora', 'edicao', 'trilha', 'locutor', 'producao', 'locacao', 'comentario', 'timecode', 'arquivo', 'texto']);
  await p.keyboard.type('lo');
  assert.deepEqual(await p.locator('.menu-da-barra [data-comando]').evaluateAll((bs) => bs.map((b) => b.dataset.comando)), ['locucao', 'locutor', 'locacao']);
  await capturar(p, '02-barra-claro');
  await p.keyboard.press('Escape');
  await p.waitForSelector('.menu-da-barra', { state: 'detached' });
  await p.keyboard.press('Backspace');
  await p.keyboard.press('Backspace');
  await p.keyboard.press('Backspace');
  // a locação: o "/loca" e o Enter; o "/" sai do texto
  await p.keyboard.type('/loca');
  assert.deepEqual(await p.locator('.menu-da-barra [data-comando]').evaluateAll((bs) => bs.map((b) => b.dataset.comando)), ['locacao']);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.menu-da-barra', { state: 'detached' });
  await p.keyboard.type('Galpão da final', devagar);
  assert.deepEqual((await tipos(p)).slice(2), ['locacao']);
  const locacao = p.locator('.texto-escrita > p').nth(2);
  assert.equal(await locacao.evaluate((e) => e.textContent), 'Galpão da final', 'o "/loca" saiu do texto');
  assert.equal(await locacao.evaluate((e) => getComputedStyle(e).textTransform), 'uppercase');

  // a edição pelo Tab do menu, e o arquivo da rede: a ficha mostra o nome, o balão o caminho inteiro, e copia
  await p.keyboard.press('Enter');
  await p.keyboard.type('/edi');
  await p.keyboard.press('Tab');
  await p.keyboard.type(`Abre no fogo; do bruto: ${CAMINHO} aos 1'20''`, { delay: 4 });
  await p.keyboard.press('Enter');
  assert.deepEqual((await tipos(p)).slice(3), ['edicao', 'texto?']);
  await p.waitForSelector('.ficha-do-texto-arquivo:not(.ficha-do-texto-pasta)');
  assert.equal((await p.locator('.ficha-do-texto-arquivo:not(.ficha-do-texto-pasta)').evaluateAll((es) => es.map((e) => e.innerText).join(''))).trim(), 'CAM_A_014.mxf', 'a ficha mostra o nome do arquivo');
  assert.equal(await p.locator('.texto-escrita .ficha-do-texto-timecode').nth(1).innerText(), "1'20''");
  await p.locator('.ficha-do-texto-arquivo:not(.ficha-do-texto-pasta)').click();
  await p.waitForSelector('.balao-da-ficha');
  assert.equal(await p.locator('.balao-da-ficha-caminho').innerText(), CAMINHO);
  await p.click('.balao-da-ficha .botao');
  await p.waitForFunction(() => document.querySelector('.balao-da-ficha .botao')?.textContent.includes('Copiado'));
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), CAMINHO, 'copia o caminho inteiro');
  await semCheckVerde(p, 'o balão do arquivo');
  await capturar(p, '03-arquivo-claro');
  await p.keyboard.press('Escape');
  await p.waitForSelector('.balao-da-ficha', { state: 'detached' });

  // o Ctrl+U no meio da frase: a arte na lista
  await p.click('.texto-escrita > p >> nth=-1');
  await p.keyboard.type('OITO CHURRASQUEIROS. UM SÓ TÍTULO.', devagar);
  await p.keyboard.press('Home');
  for (let i = 0; i < 'OITO CHURRASQUEIROS'.length; i++) await p.keyboard.press('Shift+ArrowRight');
  // a seleção chega ao editor um instante depois da tecla (o selectionchange)
  await p.waitForTimeout(150);
  await p.keyboard.press('Control+u');
  await p.waitForTimeout(100);
  assert.equal(await p.locator('.texto-escrita > p >> nth=-1').locator('u.arte').innerText(), 'OITO CHURRASQUEIROS');
  assert.deepEqual(await artesDaLista(p), ['OITO CHURRASQUEIROS']);
  // o "/arte": o trecho todo, com a marca da arte
  await p.keyboard.press('End');
  await p.waitForTimeout(100);
  await p.keyboard.press('Enter');
  await p.keyboard.type('/arte');
  await p.keyboard.press('Enter');
  await p.keyboard.type('Desafio da Brasa', devagar);
  assert.deepEqual(await artesDaLista(p), ['OITO CHURRASQUEIROS', 'Desafio da Brasa']);
  // sem repetir: a mesma arte em outra caixa e pontuação
  await p.keyboard.press('Enter');
  await p.keyboard.type('E A FINAL TEM ', devagar);
  await p.keyboard.type('Oito churrasqueiros!', devagar);
  for (let i = 0; i < 'Oito churrasqueiros!'.length; i++) await p.keyboard.press('Shift+ArrowLeft');
  await p.waitForTimeout(150);
  await p.keyboard.press('Control+u');
  await p.waitForTimeout(100);
  assert.deepEqual(await artesDaLista(p), ['OITO CHURRASQUEIROS', 'Desafio da Brasa'], 'a arte repetida conta uma vez');
  assert.match(await p.locator('.artes-da-escrita li').first().innerText(), /2 vezes/);
  // o Ctrl+U sem seleção: o trecho todo
  await p.keyboard.press('End');
  await p.waitForTimeout(100);
  await p.keyboard.press('Enter');
  await p.keyboard.type('AMANHÃ, DEPOIS DO FILME', devagar);
  await p.keyboard.press('Control+u');
  assert.equal((await tipos(p)).at(-1), 'arte');
  assert.deepEqual(await artesDaLista(p), ['OITO CHURRASQUEIROS', 'Desafio da Brasa', 'AMANHÃ, DEPOIS DO FILME']);
  assert.equal(await p.locator('.artes-da-escrita .vaga-y:not(.saindo) .b').allInnerTexts().then((ns) => ns.join(',')), '1,2,3', 'numeradas');

  // o tipo da arte, opcional: o clique na lista abre o balão da arte, o mesmo da revisão
  await p.locator('.artes-da-escrita .arte-linha').nth(1).click();
  await p.waitForSelector('.popover[aria-label="Editar marcação"]');
  await capturar(p, '04-artes-claro');
  await p.keyboard.press('Escape');

  // a margem: o clique abre o menu do tipo, e o número escolhe
  await p.locator('.tipo-na-margem').nth(1).click();
  await p.waitForSelector('.menu-do-tipo');
  await capturar(p, '05-menu-do-tipo-claro');
  await p.keyboard.press('7');
  await p.waitForSelector('.menu-do-tipo', { state: 'detached' });
  assert.equal((await tipos(p))[1], 'producao', 'o 7 é a produção');
  await p.locator('.tipo-na-margem').nth(1).click();
  await p.click('.menu-do-tipo .menu-item:has-text("Deixar o PROMeiro adivinhar")');
  assert.equal((await tipos(p))[1], 'sonora?', 'de volta ao palpite');

  // o rodapé: os números e os atalhos; o "?" no texto é só um "?", fora dele abre o cartão
  const rodape = await p.locator('.rodape-da-escrita').innerText();
  assert.match(rodape, /\d+\s+palavras[\s\S]*\d+\s+na locução[\s\S]*≈\s*\d+s\s+de leitura[\s\S]*3\s+artes/);
  assert.match(rodape, /comandos[\s\S]*Tab[\s\S]*confirma ou troca o tipo[\s\S]*arte[\s\S]*atalhos/);
  await p.click('.texto-escrita > p >> nth=0');
  await p.keyboard.press('End');
  await p.keyboard.type(' E AGORA?');
  assert.equal(await p.locator('.atalhos-cartao').count(), 0, 'no texto, o "?" é do texto');
  assert.match(await p.locator('.texto-escrita > p >> nth=0').innerText(), /E AGORA\?$/);
  await p.click('.folha-escrita-quem');
  await p.keyboard.press('?');
  await p.waitForSelector('.atalhos-cartao');
  assert.match(await p.locator('.atalhos-cartao').innerText(), /Escrever[\s\S]*Tab[\s\S]*Shift\+Tab/i);
  await capturar(p, '06-atalhos-claro');
  await p.keyboard.press('Escape');

  await salvou(p);
  await semCheckVerde(p, 'a folha');
  await semUnha(p, 'a folha');
  await p.evaluate(() => scrollTo(0, 0));
  await capturar(p, '07-folha-claro');

  // ao recarregar, os tipos, as fichas e as artes voltam
  const antes = await tipos(p);
  await p.reload();
  await p.waitForSelector('.tipo-na-margem');
  assert.deepEqual(await tipos(p), antes);
  assert.deepEqual(await artesDaLista(p), ['OITO CHURRASQUEIROS', 'Desafio da Brasa', 'AMANHÃ, DEPOIS DO FILME']);
  assert.ok(await p.locator('.ficha-do-texto-arquivo').count());
  assert.deepEqual(erros, []);
  const caminho = await p.video()?.path();
  await ctx.close();
  if (caminho) renameSync(caminho, join(CAPTURAS, 'escrever-computador-claro.webm'));
  return id;
}

async function noEscuroSemMovimento(navegador, url, id) {
  const { ctx, p, erros } = await entrar(navegador, url, `#/roteiros/${id}`, MARINA, { viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  await p.waitForSelector('.tipo-na-margem');
  const anims = await p.evaluate(() => [...document.querySelectorAll('.tipo-na-margem, .tipo-na-margem-nome, .texto-escrita .ficha-do-texto, .escrita-lado')].map((e) => getComputedStyle(e).animationName).filter((n) => n !== 'none'));
  assert.deepEqual(anims, [], 'com o movimento reduzido, nada anima');
  await p.click('.texto-escrita > p >> nth=-1');
  await p.keyboard.press('End');
  await p.waitForTimeout(100);
  await p.keyboard.press('Enter');
  await p.keyboard.type('/');
  await p.waitForSelector('.menu-da-barra');
  await semCheckVerde(p, 'o menu no escuro');
  await semUnha(p, 'o menu no escuro');
  await capturar(p, '08-barra-escuro');
  await p.keyboard.press('Escape');
  await p.keyboard.press('Backspace');
  await p.locator('.ficha-do-texto-arquivo:not(.ficha-do-texto-pasta)').click();
  await p.waitForSelector('.balao-da-ficha');
  await capturar(p, '09-arquivo-escuro');
  await p.keyboard.press('Escape');
  await p.evaluate(() => scrollTo(0, 0));
  await semCheckVerde(p, 'a folha no escuro');
  await capturar(p, '10-folha-escuro');
  await p.click('.botao-atalhos');
  await p.waitForSelector('.atalhos-cartao');
  await capturar(p, '11-atalhos-escuro');
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function noCelular(navegador, url, id) {
  for (const [tema, sufixo] of [['light', 'claro'], ['dark', 'escuro']]) {
    const { ctx, p, erros } = await entrar(navegador, url, `#/roteiros/${id}`, MARINA, { ...devices['iPhone 13'], colorScheme: tema });
    await p.waitForSelector('.folha-escrita .texto-escrita p');
    await semRolagemDeLado(p, `a folha no celular (${sufixo})`);
    await semCheckVerde(p, `a folha no celular (${sufixo})`);
    await capturar(p, `12-folha-celular-${sufixo}`);
    await p.locator('.artes-da-escrita').scrollIntoViewIfNeeded();
    await semRolagemDeLado(p, `as artes no celular (${sufixo})`);
    await capturar(p, `13-artes-celular-${sufixo}`);
    assert.deepEqual(erros, []);
    await ctx.close();
  }
}

(async () => {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: LIA }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: LIA } });
  const navegador = await chromium.launch();
  try {
    for (const email of [LIA, MARINA]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
    const id = await aMarinaEscreve(navegador, s.url);
    console.log('✔ o palpite com "?", o Tab, o "/" que filtra, a locação, as fichas (copiar), o Ctrl+U, a lista das artes, o rodapé e o "?"');
    await noEscuroSemMovimento(navegador, s.url, id);
    console.log('✔ no escuro, com o movimento reduzido');
    await noCelular(navegador, s.url, id);
    console.log('✔ no celular, claro e escuro, sem rolar para o lado');
    if (CAPTURAS) for (const f of readdirSync(join(CAPTURAS, 'video'), { withFileTypes: true }).filter((f) => f.isFile())) console.log(`vídeo: ${f.name}`);
  } finally {
    await navegador.close();
    await s.descer();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
