// Ponta a ponta da revisão que volta como sugestão (#196), rodado à parte do vitest: `npm run e2e:sugestoes`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros sobre um Teable
// falso (a Marina é redatora; o Davi, designer, não tem cadastro) e a lista de atrações com a "Brasa na Panela" (key
// BRASA). Nomes, e-mails e claquetes fictícios.
//
// A Marina (computador, claro) escreve o roteiro com um erro de grafia na arte ("CHURASQUEIROS") e envia. O Davi
// (computador, escuro) abre a cópia na fila, destrava o cadeado e corrige: a cópia guarda a correção (a arte não espera)
// e ele fica sabendo que ela vai como sugestão. A Marina vê a bolinha em "Roteiros" e na ficha; abre o roteiro e acha a
// sugestão na folha (o trecho riscado e o sugerido inserido, o balão com o Davi, a hora e a bolinha). Ela mexe no texto
// em volta antes de decidir: a sugestão continua presa ao trecho. Aceita: o texto muda, com a arte; o desfazer volta e
// o aceitar de novo fica. A segunda sugestão (a hora) chega ao vivo, com a folha aberta; no celular (claro e escuro) o
// balão é a folha de baixo, sem rolar para o lado; ela recusa. O reenvio leva o aceito e não o recusado: na fila, o
// Davi vê "CHURRASQUEIROS" e "22H". Sem "unha" e sem ✓ verde.
//
// Com CAPTURAS=pasta, grava as capturas (densidade 2) e o vídeo da Marina decidindo (computador, claro).
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:sugestoes
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:sugestoes');
  process.exit(2);
}

const MARINA = 'marina.teles@exemplo.com';
const DAVI = 'davi.rocha@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [{ nome: 'Brasa na Panela', chaves: ['BRASA'] }], redatores: ['Marina Teles'], editores: ['Caio Brandão'], pauta: [] };
const ANO = new Date().getMonth() === 11 ? new Date().getFullYear() + 1 : new Date().getFullYear();
const DIA = '18/12';

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
    [...document.querySelectorAll('.folha-escrita *, .comentarios-da-folha *, .corpo *, .cadeado-do-texto')].filter((e) => {
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
  await p.waitForTimeout(600);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
};
const salvou = (p) => p.waitForSelector('.escrita-salvo[data-salvamento="salvo"]', { timeout: 8000 });
const fichasNaFila = (p) => p.locator('.ficha[data-ancora^="ficha:"]');
/** O trecho riscado da sugestão (pode vir em vários pedaços, cortado por outras decorações). */
const riscado = (p) => p.evaluate(() => [...document.querySelectorAll('.texto-escrita .sugestao-trecho')].map((e) => e.textContent).join(''));
const textoDaFolha = (p) => p.evaluate(() => document.querySelector('.texto-escrita')?.innerText ?? '');
/** O texto do documento, sem o sugerido (que é decoração, não texto). */
const textoSemSugerido = (p, sel) =>
  p.evaluate((sel) => {
    const c = document.querySelector(sel)?.cloneNode(true);
    if (!c) return '';
    c.querySelectorAll('.sugestao-inserido').forEach((e) => e.remove());
    return c.textContent;
  }, sel);

async function aMarinaEscreveEEnvia(navegador, url) {
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', MARINA, { viewport: { width: 1500, height: 900 }, colorScheme: 'light' });
  await p.waitForSelector('.roteiros-escritos');
  await p.click('.novo-roteiro');
  await p.waitForSelector('.folha-escrita');
  await p.waitForFunction(() => document.activeElement?.closest('.texto-escrita') !== null);
  const id = decodeURIComponent(/#\/roteiros\/([\w-]+)$/.exec(p.url())[1]);
  // a arte na frase, com o erro de grafia
  await p.keyboard.type('NESTE SÁBADO, OITO CHURASQUEIROS', { delay: 6 });
  // a seleção da arte direto no texto (as setas com Shift às vezes andam menos que o pedido nesta folha)
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('.texto-escrita p')][0].firstChild;
    const r = document.createRange();
    const i = t.textContent.indexOf('OITO');
    r.setStart(t, i);
    r.setEnd(t, t.textContent.length);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await p.waitForTimeout(100);
  await p.keyboard.press('ControlOrMeta+u');
  await p.keyboard.press('End');
  await p.keyboard.type(' NA BRASA.', { delay: 6 });
  await p.keyboard.press('ControlOrMeta+End');
  await p.keyboard.press('Enter');
  await p.keyboard.type('AMANHÃ, 22H.', { delay: 6 });
  await p.fill('.folha-escrita-titulo', `Brasa na Panela ${DIA}, a final`);
  await salvou(p);
  await p.click('.texto-escrita');
  await p.keyboard.press('ControlOrMeta+Enter');
  await p.waitForSelector('.card-aberto .enviar');
  assert.equal(await p.locator('.enviar-sugestoes').count(), 0, 'nenhuma sugestão esperando');
  await p.fill('.enviar-motivo input', 'a primeira versão');
  await p.click('.enviar-pe .botao.primario');
  await p.waitForSelector('.card-aberto', { state: 'detached' });
  await p.waitForSelector('.andamento-da-arte');
  // de volta à lista de "Roteiros"
  await p.click('.escrita-voltar');
  await p.waitForSelector('.roteiros-escritos');
  assert.deepEqual(erros, []);
  return { id, ctx, p, erros };
}

/** O Davi abre a cópia na fila (a primeira ficha) e espera o texto chegar da sala. */
async function oDaviAbreARevisao(navegador, url) {
  const davi = await entrar(navegador, url, '#/', DAVI, { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const { p } = davi;
  await p.waitForSelector('.ficha .ficha-escrito');
  davi.fichas = await fichasNaFila(p).count();
  await fichasNaFila(p).first().locator('.ficha-claquete').click();
  await p.waitForSelector('.cadeado-do-texto', { timeout: 45000 });
  return davi;
}
/** Com o cadeado aberto, põe o cursor depois das `n` primeiras letras do parágrafo `i` e digita. */
async function corrigir(p, i, n, apagar, digitar) {
  // o popover da arte (do clique de antes) fecha no Esc
  await p.keyboard.press('Escape');
  await p.waitForSelector('.popover', { state: 'detached' }).catch(() => {});
  const par = p.locator('.corpo .texto p').nth(i);
  await par.click({ position: { x: 3, y: 6 } });
  await p.keyboard.press('Home');
  for (let k = 0; k < n; k++) await p.keyboard.press('ArrowRight');
  for (let k = 0; k < apagar; k++) await p.keyboard.press('Delete');
  await p.keyboard.type(digitar, { delay: 30 });
}

(async () => {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros(ENV_CADASTROS, { buscar: buscarNoTeable });
  const s = await subir({ cadastros });
  const navegador = await chromium.launch();
  try {
    for (const email of [MARINA, DAVI]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
    const marina = await aMarinaEscreveEEnvia(navegador, s.url);
    console.log('✔ a Marina escreve com o erro na arte e envia');

    // o Davi corrige a grafia na revisão, com o cadeado aberto: a cópia guarda, e a mudança vai como sugestão
    const davi = await oDaviAbreARevisao(navegador, s.url);
    await davi.p.click('.cadeado-do-texto');
    await corrigir(davi.p, 0, 'NESTE SÁBADO, OITO CHU'.length, 0, 'R');
    await davi.p.waitForSelector('.avisos .aviso', { timeout: 8000 });
    assert.match(await davi.p.locator('.avisos .aviso').innerText(), /vai como sugestão para Marina Teles/);
    assert.match(await davi.p.locator('.corpo .texto p').first().innerText(), /OITO CHURRASQUEIROS NA BRASA/, 'a cópia na fila guarda a correção');
    await semUnha(davi.p, 'a revisão com o cadeado aberto');
    await capturar(davi.p, '01-designer-corrige-na-revisao-escuro');
    console.log('✔ o designer corrige com o cadeado aberto: a cópia guarda, e ele sabe que vai como sugestão');

    // a bolinha em "Roteiros" e na ficha da Marina (a lista lê de novo ao vivo ou ao voltar)
    await marina.p.waitForSelector('.roteiros-escritos .ficha .bolinha-aviso', { timeout: 10000 }).catch(async () => {
      await marina.p.reload();
      await marina.p.waitForSelector('.roteiros-escritos .ficha .bolinha-aviso', { timeout: 8000 });
    });
    await marina.p.waitForSelector('.caminhos-do-topo .topo-roteiros .caminho-aviso', { timeout: 8000 });
    await capturar(marina.p, '02-bolinha-em-roteiros');
    // a Marina abre o roteiro: a sugestão na folha
    const video = CAPTURAS ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: { width: 1500, height: 900 } } } : {};
    await marina.ctx.close();
    const m = await entrar(navegador, s.url, `#/roteiros/${marina.id}`, MARINA, { viewport: { width: 1500, height: 900 }, colorScheme: 'light', ...video });
    await m.p.waitForSelector('.texto-escrita .sugestao-trecho >> nth=0', { timeout: 20000 });
    assert.equal(await riscado(m.p), 'CHURASQUEIROS');
    assert.equal(await m.p.locator('.texto-escrita .sugestao-inserido').innerText(), 'CHURRASQUEIROS');
    const balao = m.p.locator('.balao-sugestao');
    await balao.waitFor();
    assert.match(await balao.innerText(), /Davi Rocha[\s\S]*agora|Davi Rocha[\s\S]*min/i, 'o balão traz quem sugeriu e a hora');
    assert.match(await balao.locator('.sugestao-troca').innerText(), /CHURASQUEIROS\s*→\s*CHURRASQUEIROS/);
    assert.equal(await balao.locator('.bolinha-aviso').count(), 1, 'a bolinha de aviso no balão');
    await semUnha(m.p, 'a folha com a sugestão');
    await semCheckVerde(m.p, 'a folha com a sugestão');
    await capturar(m.p, '03-sugestao-na-folha-claro');

    // a Marina mexe no texto em volta antes de decidir: a sugestão continua presa ao trecho
    await m.p.locator('.texto-escrita p').first().click();
    await m.p.keyboard.press('ControlOrMeta+Home');
    await m.p.keyboard.type('AGORA: ', { delay: 20 });
    await m.p.waitForTimeout(300);
    assert.equal(await riscado(m.p), 'CHURASQUEIROS', 'presa ao trecho, com o texto mudado em volta');

    const textoDaArte = () => m.p.evaluate(() => [...document.querySelectorAll('.texto-escrita u.arte')].map((e) => e.textContent).join(''));
    const arteAntes = await textoDaArte();
    assert.match(arteAntes, /CHURASQUEIROS$/);
    // aceitar: o texto muda (com a arte); o desfazer volta; aceitar de novo fica
    await balao.locator('.sugestao-aceitar').click();
    await m.p.waitForFunction(() => !document.querySelector('.texto-escrita .sugestao-trecho'));
    assert.match(await textoSemSugerido(m.p, '.texto-escrita'), /AGORA: NESTE SÁBADO, OITO CHURRASQUEIROS NA BRASA\./);
    assert.equal(await textoDaArte(), arteAntes.replace('CHURASQUEIROS', 'CHURRASQUEIROS'), 'a arte continua cobrindo a frase');
    await m.p.waitForSelector('.desfazer');
    assert.match(await m.p.locator('.desfazer').innerText(), /Sugestão aceita/);
    await capturar(m.p, '04-aceita-com-desfazer-claro');
    await m.p.click('.desfazer .desfazer-botao');
    await m.p.waitForSelector('.texto-escrita .sugestao-trecho >> nth=0');
    assert.match(await textoSemSugerido(m.p, '.texto-escrita'), /OITO CHURASQUEIROS NA BRASA/, 'o desfazer volta o texto');
    await m.p.locator('.balao-sugestao .sugestao-aceitar').click();
    await m.p.waitForFunction(() => !document.querySelector('.texto-escrita .sugestao-trecho'));
    await salvou(m.p);
    console.log('✔ a redatora vê a sugestão (riscado, inserido, quem e quando, a bolinha), presa ao trecho; aceita, desfaz e aceita');

    // a segunda sugestão chega ao vivo, com a folha aberta
    await corrigir(davi.p, 1, 'AMANHÃ, 2'.length, 1, '3');
    await m.p.waitForSelector('.texto-escrita .sugestao-inserido', { timeout: 10000 });
    assert.equal(await m.p.locator('.texto-escrita .sugestao-inserido').innerText(), '23H.');
    console.log('✔ a sugestão seguinte chega ao vivo');

    // no celular, claro e escuro: o balão é a folha de baixo, sem rolar para o lado
    for (const tema of ['light', 'dark']) {
      const c = await entrar(navegador, s.url, `#/roteiros/${marina.id}`, MARINA, { ...devices['iPhone 13'], colorScheme: tema });
      await c.p.waitForSelector('.texto-escrita .sugestao-inserido', { timeout: 20000 });
      await c.p.locator('.texto-escrita .sugestao-inserido').tap();
      await c.p.waitForSelector('.balao-sugestao.ativo .sugestao-recusar');
      await semRolagemDeLado(c.p, `a sugestão no celular (${tema})`);
      const caixa = await c.p.locator('.balao-sugestao.ativo').boundingBox();
      assert.ok(caixa && caixa.x >= 0 && caixa.x + caixa.width <= 391, 'a folha de baixo cabe na tela');
      await semCheckVerde(c.p, `o celular (${tema})`);
      await capturar(c.p, `06-sugestao-celular-${tema === 'light' ? 'claro' : 'escuro'}`);
      assert.deepEqual(c.erros, []);
      await c.ctx.close();
    }

    await capturar(m.p, '05-sugestao-ao-vivo-claro');
    await m.p.locator('.balao-sugestao .sugestao-recusar').click();
    await m.p.waitForSelector('.texto-escrita .sugestao-inserido', { state: 'detached' });
    assert.match(await m.p.locator('.desfazer').innerText(), /Sugestão recusada/);
    assert.match(await textoDaFolha(m.p), /AMANHÃ, 22H\./, 'recusada: o texto fica');
    console.log('✔ no celular, o balão é a folha de baixo; recusada, o texto fica');

    // o reenvio leva o aceito e não o recusado
    await m.p.click('.texto-escrita');
    await m.p.keyboard.press('ControlOrMeta+Enter');
    await m.p.waitForSelector('.card-aberto .enviar');
    await m.p.fill('.enviar-motivo input', 'a grafia da arte');
    await m.p.click('.enviar-pe .botao.primario');
    await m.p.waitForSelector('.pergunta-liberacao');
    await m.p.locator('.pergunta-liberacao button', { hasText: 'Não' }).click();
    await m.p.waitForSelector('.card-aberto', { state: 'detached' });
    assert.deepEqual(m.erros, []);
    const caminho = await m.p.video()?.path();
    await m.ctx.close();
    if (caminho) renameSync(caminho, join(CAPTURAS, 'sugestoes-computador-claro.webm'));

    await davi.ctx.close();
    const d2 = await oDaviAbreARevisao(navegador, s.url);
    assert.equal(d2.fichas, 1, 'a V2 no lugar da anterior');
    await d2.p.waitForFunction(() => /CHURRASQUEIROS/.test(document.querySelector('.corpo .texto')?.textContent ?? ''));
    const naFila = await d2.p.locator('.corpo .texto').innerText();
    assert.match(naFila, /AGORA: NESTE SÁBADO, OITO CHURRASQUEIROS NA BRASA\./);
    assert.match(naFila, /AMANHÃ, 22H\./, 'o recusado não vai');
    await capturar(d2.p, '07-fila-com-o-aceito-escuro');
    assert.deepEqual(d2.erros, []);
    await d2.ctx.close();
    console.log('✔ o reenvio leva o aceito, e não o recusado');
    if (CAPTURAS) for (const f of readdirSync(join(CAPTURAS, 'video'), { withFileTypes: true }).filter((f) => f.isFile())) console.log(`vídeo: ${f.name}`);
  } finally {
    await navegador.close();
    await s.descer();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
