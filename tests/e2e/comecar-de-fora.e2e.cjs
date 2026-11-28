// Ponta a ponta do começar o Roteiro de fora (#195), rodado à parte do vitest: `npm run e2e:comecar`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros sobre um Teable
// falso (a Marina é redatora pelo e-mail). Os nomes e o .docx das capturas são inventados (docx-inventado.cjs); os
// fixtures de importação (tests/fixtures) só entram nas conferências, nunca nas capturas.
//
// Na lista de "Roteiros": o Abrir arquivo com um .docx, um RTF e um PDF dos fixtures, o .docx inventado solto na tela e
// um texto do Word colado com o Ctrl+V. Cada um começa um roteiro sendo escrito, com os tipos na margem (o que a arte ou a
// etiqueta cobre inteiro, confirmado; o resto, com "?"), as artes na lista ao lado e o original guardado. Na folha vazia:
// o convite, o colado de um roteiro inteiro e, com texto, o colar linha a linha no meio do texto, que também adivinha.
//
// No escuro, com o movimento reduzido, e no celular (a lista e a folha sem rolar para o lado).
//
// Com CAPTURAS=pasta, grava as capturas (densidade 2) e um vídeo curto (o .docx inventado solto na lista).
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:comecar
const assert = require('node:assert/strict');
const { mkdirSync, readdirSync, renameSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');
const { checksVerdes } = require('./coerencia.cjs');
const { docxInventado, NOME_DO_INVENTADO } = require('./docx-inventado.cjs');
const RAIZ = join(__dirname, '..', '..');
const FIXTURES = join(RAIZ, 'tests', 'fixtures');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:comecar');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const MARINA = 'marina.teles@exemplo.com';
// os fixtures entram pelo Júlio: a lista da Marina (a das capturas) fica só com o inventado
const JULIO = 'julio.pires@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

const ENV_CADASTROS = {
  TEABLE_URL: 'http://teable-falso',
  TEABLE_TOKEN: 'falso',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
};
const TABELAS = {
  tblRed: [
    { id: 'recR1', fields: { redator: 'Marina Teles', email: MARINA } },
    { id: 'recR2', fields: { redator: 'Júlio Pires', email: JULIO } },
  ],
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

/** O Word colado: a arte inteira, a arte na frase, a sonora, a trilha e a quebra de linha (Shift+Enter). Inventado. */
const COLADO_DO_WORD = `<html><body>
  <p class=MsoNormal><span style='text-decoration:underline'>FOGO NO CHÃO</span></p>
  <p class=MsoNormal>A FINAL TEM <u>DOZE HORAS DE BRASA</u>.</p>
  <p class=MsoNormal>Seu Arlindo, de Bagé: O fogo é de chão, como sempre foi.<br>((plim plim))</p>
  </body></html>`;
const COLADO_TEXTO = 'FOGO NO CHÃO\nA FINAL TEM DOZE HORAS DE BRASA.\nSeu Arlindo, de Bagé: O fogo é de chão, como sempre foi.\n((plim plim))';

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
async function semUnha(p, onde) {
  const unhas = await p.evaluate(() =>
    [...document.querySelectorAll('.folha-escrita *, .escrita-lado *, .roteiros-acoes *, .aviso-meus, .soltar *, .comecar-na-folha *')].filter((e) => {
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
const tipos = (p) => p.locator('.texto-escrita > p').evaluateAll((ps) => ps.filter((x) => x.textContent.trim()).map((x) => `${x.dataset.tipo}${x.dataset.confirmado === 'true' ? '' : '?'}`));
const artesDaLista = (p) => p.locator('.artes-da-escrita .vaga-y:not(.saindo) .arte-linha .txt b').allInnerTexts();
const naFolha = async (p) => {
  await p.waitForURL(/#\/roteiros\/[\w-]+$/);
  await p.waitForSelector('.folha-escrita:not(.chegando) .tipo-na-margem');
  return /#\/roteiros\/([\w-]+)$/.exec(p.url())[1];
};
const voltarALista = async (p) => {
  await p.click('.escrita-voltar');
  await p.waitForSelector('.roteiros-escritos .abrir-roteiro');
};
/** Abre o arquivo pelo botão "Abrir arquivo" (o seletor do sistema é o input escondido). */
async function abrirPeloBotao(p, nome) {
  const [seletor] = await Promise.all([p.waitForEvent('filechooser'), p.click('.abrir-roteiro')]);
  await seletor.setFiles(join(FIXTURES, nome));
  return naFolha(p);
}
/** Solta um arquivo (os bytes, em base64) na tela, como o arrastar do sistema. */
async function soltar(p, nome, base64, parar = false) {
  await p.evaluate(
    async ({ nome, base64, parar }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], nome, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const alvo = document.querySelector('main') ?? document.body;
      alvo.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
      alvo.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      if (parar) return;
      await new Promise((r) => setTimeout(r, 200));
      alvo.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    },
    { nome, base64, parar },
  );
}
/** Cola no alvo (o foco de agora, ou o corpo da página) o HTML e o texto, como o Ctrl+V do Word. */
const colar = (p, html, texto) =>
  p.evaluate(({ html, texto }) => {
    const dt = new DataTransfer();
    if (html) dt.setData('text/html', html);
    dt.setData('text/plain', texto);
    (document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body).dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  }, { html, texto });

async function dosFixtures(navegador, url, api) {
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', JULIO, { viewport: { width: 1440, height: 900 } });
  await p.waitForSelector('.roteiros-escritos .abrir-roteiro');
  const ler = async (id) => (await ctx.request.get(`${api}/roteiros/${id}`)).json();

  // o .docx: o título pela atração lida, os tipos (etiqueta e arte inteira confirmadas, o resto com "?") e as artes
  const doDocx = await abrirPeloBotao(p, 'Encontro_27_10.docx');
  assert.equal(await p.inputValue('.folha-escrita-titulo'), 'Encontro · Chamada de 27/10');
  const t = await tipos(p);
  assert.deepEqual(t.slice(0, 3), ['trilha', 'locucao?', 'arte'], 'a sonoplastia é trilha, confirmada; a arte inteira é arte');
  assert.ok(t.includes('edicao') && t.includes('locucao?'), 'a edição pela etiqueta, a locução pelo palpite');
  assert.equal((await artesDaLista(p)).length, 4, 'as artes da leitura da fila, sem repetir');
  await p.waitForFunction(() => document.querySelector('.escrita-salvo')?.dataset.salvamento === 'salvo');
  let r = await ler(doDocx);
  assert.equal(r.escrito, 'sendo-escrito');
  assert.equal(r.origem, 'Encontro_27_10.docx');
  assert.equal(r.meta.claquete, '', 'sem claquete: ela é proposta no Enviar');
  assert.equal(r.meta.redator, 'Júlio Pires', 'o redator é quem escreve');
  for (let i = 0; i < 20 && !r.original; i++) {
    await p.waitForTimeout(150);
    r = await ler(doDocx);
  }
  assert.equal(r.original?.nome, 'Encontro_27_10.docx', 'o original fica guardado, como na fila');
  // ao recarregar, os tipos e as artes voltam
  await p.reload();
  await p.waitForSelector('.folha-escrita:not(.chegando) .tipo-na-margem');
  assert.deepEqual(await tipos(p), t);

  // o RTF e o PDF, pelo mesmo botão
  await voltarALista(p);
  await abrirPeloBotao(p, 'Eliana_20_9.rtf');
  assert.ok((await tipos(p)).length > 5);
  assert.ok((await artesDaLista(p)).length > 3, 'o RTF chega com as artes');
  await voltarALista(p);
  await abrirPeloBotao(p, 'Nobreza_27_10.pdf');
  assert.ok((await tipos(p)).some((x) => x === 'sonora?'), 'o PDF chega com as sonoras');
  assert.ok((await artesDaLista(p)).length >= 3, 'o PDF chega com as artes');

  // o arquivo que não se lê: o aviso diz por quê, e nada começa
  await voltarALista(p);
  const [seletor] = await Promise.all([p.waitForEvent('filechooser'), p.click('.abrir-roteiro')]);
  await seletor.setFiles({ name: 'quebrado.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('isto não é um docx') });
  await p.waitForSelector('.aviso-meus.erro');
  assert.match(await p.locator('.aviso-meus.erro').innerText(), /quebrado\.docx: O arquivo parece corrompido/);
  assert.match(p.url(), /#\/redator$/);
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function doInventado(navegador, url) {
  const video = CAPTURAS ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: { width: 1440, height: 900 } } } : {};
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', MARINA, { viewport: { width: 1440, height: 900 }, colorScheme: 'light', ...video });
  await p.waitForSelector('.roteiros-escritos .abrir-roteiro');
  await semCheckVerde(p, 'a lista');
  await capturar(p, '01-lista-abrir-arquivo-claro');

  // solto na tela: o cartão do soltar, e o roteiro começa
  const base64 = (await docxInventado()).toString('base64');
  await soltar(p, NOME_DO_INVENTADO, base64, true);
  await p.waitForSelector('.soltar');
  assert.match(await p.locator('.soltar').innerText(), /começa sendo escrito/);
  await semUnha(p, 'o soltar');
  await capturar(p, '02-soltar-claro');
  await p.evaluate(() => document.querySelector('main').dispatchEvent(new DragEvent('dragleave', { bubbles: true })));
  await p.waitForSelector('.soltar', { state: 'detached' });
  await soltar(p, NOME_DO_INVENTADO, base64);
  const id = await naFolha(p);
  assert.equal(await p.inputValue('.folha-escrita-titulo'), 'Desafio Brasa 14 11', 'sem a atração, o nome do arquivo');
  assert.equal(await p.locator('.folha-escrita.vazia, .comecar-na-folha').count(), 0, 'com o texto que chegou da sala, a folha não é mais a vazia');
  assert.deepEqual(await tipos(p), ['arte', 'locucao?', 'sonora?', 'trilha', 'locucao?', 'edicao', 'arte']);
  assert.deepEqual(await artesDaLista(p), ['DESAFIO DA BRASA', 'OITO CHURRASQUEIROS', 'SÁBADO, DEPOIS DO JORNAL']);
  assert.equal(await p.locator('.texto-escrita u.arte').first().innerText(), 'DESAFIO DA BRASA');
  await p.waitForFunction(() => document.querySelector('.escrita-salvo')?.dataset.salvamento === 'salvo');
  await semCheckVerde(p, 'a folha aberta do .docx');
  await semUnha(p, 'a folha aberta do .docx');
  await capturar(p, '03-aberto-do-docx-claro');

  // o Ctrl+V na lista, fora dos campos: o texto do Word começa um roteiro
  await voltarALista(p);
  await p.click('.fila-titulo h2');
  await colar(p, COLADO_DO_WORD, COLADO_TEXTO);
  const doColado = await naFolha(p);
  assert.notEqual(doColado, id);
  assert.equal(await p.inputValue('.folha-escrita-titulo'), '', 'colado, sem título inventado');
  assert.deepEqual(await tipos(p), ['arte', 'locucao?', 'sonora?', 'trilha'], 'a quebra de linha é um trecho novo');
  assert.deepEqual(await artesDaLista(p), ['FOGO NO CHÃO', 'DOZE HORAS DE BRASA']);

  // a folha vazia: o convite, e o colado de um roteiro inteiro
  await voltarALista(p);
  await p.click('.novo-roteiro');
  await p.waitForURL(/#\/roteiros\/[\w-]+$/);
  await p.waitForSelector('.folha-escrita:not(.chegando) .comecar-na-folha');
  assert.match(await p.locator('.comecar-na-folha').innerText(), /abrir um \.docx, RTF ou PDF[\s\S]*colar o texto do Word/);
  await semUnha(p, 'a folha vazia');
  await capturar(p, '04-folha-vazia-claro');
  await p.waitForFunction(() => document.activeElement?.closest('.texto-escrita') !== null);
  await colar(p, COLADO_DO_WORD, COLADO_TEXTO);
  await p.waitForSelector('.comecar-na-folha', { state: 'detached' });
  assert.deepEqual(await tipos(p), ['arte', 'locucao?', 'sonora?', 'trilha']);

  // com texto, o colar é linha a linha, no meio do texto, e também adivinha
  // o clique no fim da linha (no meio, o clique na arte abre o balão dela)
  const linha = p.locator('.texto-escrita > p').nth(1);
  const caixa = await linha.boundingBox();
  await linha.click({ position: { x: caixa.width - 4, y: caixa.height / 2 } });
  await p.waitForTimeout(150);
  await p.keyboard.press('End');
  await p.keyboard.press('Enter');
  await colar(p, '<p>Dona Zélia, de Pelotas: Aqui ninguém leva carne crua.</p><p><u>OITO CHURRASQUEIROS</u></p><p>E A FINAL É AO VIVO.<br>((plim plim))</p>', 'Dona Zélia, de Pelotas: Aqui ninguém leva carne crua.\nOITO CHURRASQUEIROS\nE A FINAL É AO VIVO.\n((plim plim))');
  await p.waitForTimeout(150);
  const depois = await tipos(p);
  assert.deepEqual(depois.slice(0, 5), ['arte', 'locucao?', 'sonora?', 'arte', 'locucao?'], 'a sonora, a arte inteira e a locução, no meio do texto');
  assert.deepEqual(depois.slice(-2), ['sonora?', 'trilha'], 'o que vinha depois fica como estava');
  assert.equal(depois.length, 8, 'a quebra de linha colada vira um trecho novo');
  assert.deepEqual(await artesDaLista(p), ['FOGO NO CHÃO', 'DOZE HORAS DE BRASA', 'OITO CHURRASQUEIROS']);
  await capturar(p, '05-colado-no-meio-claro');
  assert.deepEqual(erros, []);
  const caminho = await p.video()?.path();
  await ctx.close();
  if (caminho) renameSync(caminho, join(CAPTURAS, 'comecar-de-fora-computador-claro.webm'));
  return id;
}

async function noEscuroSemMovimento(navegador, url, id) {
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', MARINA, { viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  await p.waitForSelector('.roteiros-escritos .abrir-roteiro');
  await semCheckVerde(p, 'a lista no escuro');
  await capturar(p, '06-lista-escuro');
  await p.click('.novo-roteiro');
  await p.waitForSelector('.folha-escrita:not(.chegando) .comecar-na-folha');
  const anim = await p.locator('.comecar-na-folha').evaluate((e) => getComputedStyle(e).animationName);
  assert.equal(anim, 'none', 'com o movimento reduzido, o convite não anima');
  await semUnha(p, 'a folha vazia no escuro');
  await capturar(p, '07-folha-vazia-escuro');
  await p.goto(`${url}#/roteiros/${id}`);
  await p.waitForSelector('.folha-escrita:not(.chegando) .tipo-na-margem');
  await capturar(p, '08-aberto-do-docx-escuro');
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function noCelular(navegador, url, id) {
  for (const [tema, sufixo] of [['light', 'claro'], ['dark', 'escuro']]) {
    const { ctx, p, erros } = await entrar(navegador, url, '#/redator', MARINA, { ...devices['iPhone 13'], colorScheme: tema });
    await p.waitForSelector('.roteiros-escritos .abrir-roteiro');
    await semRolagemDeLado(p, `a lista no celular (${sufixo})`);
    await capturar(p, `09-lista-celular-${sufixo}`);
    await p.click('.novo-roteiro');
    await p.waitForSelector('.folha-escrita:not(.chegando) .comecar-na-folha');
    await semRolagemDeLado(p, `a folha vazia no celular (${sufixo})`);
    await capturar(p, `10-folha-vazia-celular-${sufixo}`);
    await p.goto(`${url}#/roteiros/${id}`);
    // no celular, a margem dos tipos é outra (#198): o texto chegou
    await p.waitForFunction(() => document.querySelector('.folha-escrita:not(.chegando) .texto-escrita p')?.textContent.trim());
    await semRolagemDeLado(p, `a folha aberta no celular (${sufixo})`);
    await capturar(p, `11-aberto-celular-${sufixo}`);
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
    for (const email of [LIA, MARINA, JULIO]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
    await dosFixtures(navegador, s.url, s.api);
    console.log('✔ .docx, RTF e PDF pelo Abrir arquivo: sendo escrito, com os tipos, as artes e o original; o arquivo quebrado avisa');
    const id = await doInventado(navegador, s.url);
    console.log('✔ o .docx solto na lista, o Ctrl+V na lista, o colado na folha vazia e o colar linha a linha no meio do texto');
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
