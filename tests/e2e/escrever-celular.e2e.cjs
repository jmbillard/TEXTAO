// Ponta a ponta do escrever no celular (#198), rodado à parte do vitest: `npm run e2e:escrever-celular`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros sobre um Teable
// falso (a Marina é redatora). Nomes, e-mails e textos fictícios. O teclado do celular é imitado pelo visualViewport (a
// parte da tela que ele deixa), que o Playwright não abre sozinho.
//
// No iPhone (claro) e no Android (escuro), e de novo com os temas trocados: a Marina abre o roteiro novo, vazio. O convite
// só oferece abrir um .docx, RTF ou PDF (lá não se arrasta nem há Ctrl+V). A margem dos tipos sai e a barra do polegar
// fica no pé, acima do teclado. Ela escreve: o tipo adivinhado acende na barra com "?", e o toque confirma e troca, sem
// tirar o foco do texto (o teclado fica aberto). O botão "/" abre o menu dos comandos para cima da barra, e o toque
// escolhe. A Arte (o Ctrl+U) faz do trecho uma arte, que entra na lista. Com um trecho selecionado, o Comentar toma o
// lugar dos tipos e abre a folha de baixo, acima do teclado. As colunas viram linhas empilhadas, vídeo em cima e áudio
// embaixo. O Enviar, ao lado, abre o painel do #194 em tela cheia. Os alvos de toque têm 44 px, a página nunca rola para
// o lado, sem "unha" e sem ✓ verde.
//
// O Davi (só lê) abre o mesmo roteiro no celular: lê, seleciona um trecho e comenta pela barra.
//
// Com CAPTURAS=pasta, grava as capturas (densidade do aparelho) e o vídeo do iPhone (claro).
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:escrever-celular
const assert = require('node:assert/strict');
const { mkdirSync, renameSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');
const { checksVerdes } = require('./coerencia.cjs');
const RAIZ = join(__dirname, '..', '..');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:escrever-celular');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const MARINA = 'marina.teles@exemplo.com';
const DAVI = 'davi.rocha@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [{ nome: 'Brasa na Panela', chaves: ['BRASA'] }], redatores: ['Marina Teles'], editores: [], pauta: [] };
const TECLADO = 300;

const ENV_CADASTROS = { TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'falso', TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };
const TABELAS = { tblRed: [{ id: 'recR1', fields: { redator: 'Marina Teles', email: MARINA } }], tblKeyRed: [], tblEdi: [], tblKeyEdi: [] };
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  if (u.host !== 'teable-falso' || (init.method ?? 'GET') !== 'GET') throw new Error(`o teste não sai para a rede: ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(u.pathname);
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
}

/** O teclado imitado: o visualViewport encolhe pelo que ele cobre (window.__teclado(px), 0 fecha). */
function imitarTeclado() {
  const vv = new EventTarget();
  let coberto = 0;
  Object.defineProperties(vv, {
    height: { get: () => innerHeight - coberto },
    width: { get: () => innerWidth },
    offsetTop: { get: () => 0 },
    offsetLeft: { get: () => 0 },
    scale: { get: () => 1 },
  });
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
  window.__teclado = (px) => {
    coberto = px;
    vv.dispatchEvent(new Event('resize'));
  };
}

async function entrar(navegador, url, hash, email, aparelho, tema, video = '') {
  const tam = devices[aparelho].viewport;
  const ctx = await navegador.newContext({
    ...devices[aparelho],
    colorScheme: tema,
    extraHTTPHeaders: { 'cf-access-authenticated-user-email': email },
    ...(CAPTURAS && video ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: tam } } : {}),
  });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(email), url }]);
  await ctx.addInitScript(imitarTeclado);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}${hash}`);
  return { ctx, p, erros, video };
}
const fechar = async ({ ctx, p, video }) => {
  const caminho = await p.video()?.path();
  await ctx.close();
  if (caminho && video) renameSync(caminho, join(CAPTURAS, `${video}.webm`));
};
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(450);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
};
const liberada = (p) => p.waitForSelector('.folha-escrita:not(.chegando) .texto-escrita', { timeout: 15000 });
const salvou = (p) => p.waitForSelector('.escrita-salvo[data-salvamento="salvo"]', { timeout: 8000 });
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
const semCheckVerde = async (p, onde) => assert.deepEqual(await checksVerdes(p), [], `${onde}: nada de ✓ verde`);
async function semUnha(p, onde) {
  const unhas = await p.evaluate(() =>
    [...document.querySelectorAll('.folha-escrita *, .escrita-barra *, .barra-do-polegar, .barra-do-polegar *, .menu *, .balao-comentario *')].filter((e) => {
      if (e.closest('.collaboration-cursor__caret')) return false;
      const c = getComputedStyle(e);
      const borda = parseFloat(c.borderLeftWidth) >= 3 && c.borderLeftStyle !== 'none' && c.borderLeftColor !== c.borderTopColor;
      const sombra = /inset\s+([3-9]|\d{2,})px\s+0/.test(c.boxShadow);
      return borda || sombra;
    }).map((e) => e.className),
  );
  assert.deepEqual(unhas, [], `${onde}: nada de unha`);
}
/** Os botões à vista no topo da folha, no convite e na barra com menos de 44 px de altura ou de largura. */
const alvosPequenos = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('.escrita-barra button, .folha-escrita-cabeca button, .comecar-na-folha button, .barra-do-polegar button, .menu-da-barra button')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        const c = getComputedStyle(b);
        return r.width > 0 && r.height > 0 && c.visibility !== 'hidden';
      })
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.height < 43.5 || r.width < 43.5;
      })
      .map((b) => `${b.className || b.tagName}<${b.parentElement.className}> "${b.textContent.trim().slice(0, 12)}" (${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)})`),
  );
const tipos = (p) => p.locator('.texto-escrita > p').evaluateAll((ps) => ps.map((x) => `${x.dataset.tipo}${x.dataset.confirmado === 'true' ? '' : '?'}`));
const acesoNaBarra = (p) => p.locator('.polegar-tipo[aria-pressed="true"]').evaluate((b) => `${b.dataset.tipo}${b.classList.contains('palpite') ? '?' : ''}`);
const noTexto = (p) => p.evaluate(() => document.activeElement?.closest('.texto-escrita') !== null);
const artesDaLista = (p) => p.locator('.artes-da-escrita .vaga-y:not(.saindo) .arte-linha .txt b').allInnerTexts();
const devagar = { delay: 8 };
/** O pé da barra (ou de outro elemento) e quanto falta até o pé da tela. */
const peDe = (p, sel) => p.locator(sel).first().evaluate((e) => innerHeight - e.getBoundingClientRect().bottom);

/** Seleciona o trecho no texto, como o dedo faria (a seleção nativa). */
async function selecionar(p, trecho) {
  await p.evaluate((t) => {
    const raiz = document.querySelector('.texto-escrita');
    const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = andar.nextNode(); n; n = andar.nextNode()) {
      const i = n.data.indexOf(t);
      if (i < 0 || n.parentElement.closest('.collaboration-cursor__caret')) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + t.length);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      return;
    }
    throw new Error(`não achei "${t}" no texto`);
  }, trecho);
  await p.waitForTimeout(120);
}

async function aMarinaEscreve(navegador, s, como, { aparelho, tema, sufixo, video }) {
  const id = `celular-${sufixo}`;
  assert.equal((await como(MARINA)('/roteiros-escritos', { method: 'POST', body: JSON.stringify({ id, titulo: '' }) })).status, 201);
  const m = await entrar(navegador, s.url, `#/roteiros/${id}`, MARINA, aparelho, tema, video);
  const { p } = m;
  await liberada(p);
  await p.waitForSelector('.barra-do-polegar');
  await p.tap('.texto-escrita');
  await p.waitForFunction(() => document.activeElement?.closest('.texto-escrita') !== null);

  // o convite da folha vazia: só o abrir
  await p.waitForSelector('.comecar-na-folha .comecar-abrir');
  assert.match(await p.locator('.comecar-na-folha .comecar-abrir').innerText(), /abrir um \.docx, RTF ou PDF/);
  assert.equal(await p.locator('.comecar-na-folha .comecar-no-computador').evaluateAll((es) => es.filter((e) => e.getBoundingClientRect().width > 0).length), 0, 'sem o arrastar e o Ctrl+V');
  // a margem sai, a barra fica no pé, acima do rodapé dos números
  assert.equal(await p.locator('.margem-dos-tipos').evaluate((e) => getComputedStyle(e).display), 'none');
  assert.equal(await p.locator('.polegar-tipo').count(), 10, 'os dez tipos na barra');
  assert.deepEqual(await alvosPequenos(p), [], 'os alvos de toque têm 44 px');
  await semRolagemDeLado(p, `a folha vazia (${sufixo})`);
  await capturar(p, `01-folha-vazia-${sufixo}`);

  // o teclado abre: a barra sobe para ficar logo acima dele, e o rodapé sai
  await p.evaluate((px) => window.__teclado(px), TECLADO);
  await p.waitForFunction((px) => Math.abs(innerHeight - document.querySelector('.barra-do-polegar').getBoundingClientRect().bottom - px) < 2, TECLADO);
  assert.equal(await p.locator('.rodape-da-escrita').evaluate((e) => getComputedStyle(e).display), 'none', 'com o teclado, o rodapé sai');

  // escrever: o palpite acende com "?"; o toque confirma e troca, com o foco no texto
  await p.keyboard.type('NESTE SÁBADO, A BRASA DECIDE.', devagar);
  await p.waitForFunction(() => document.querySelector('.polegar-tipo[aria-pressed="true"]')?.dataset.tipo === 'locucao');
  await p.waitForTimeout(200);
  const cursor = await p.evaluate(() => {
    const r = getSelection().getRangeAt(0).getBoundingClientRect();
    return { cursor: r.bottom, barra: document.querySelector(".barra-do-polegar").getBoundingClientRect().top };
  });
  assert.ok(cursor.cursor > 0 && cursor.cursor <= cursor.barra, `o cursor fica à vista, acima da barra e do teclado: ${JSON.stringify(cursor)}`);
  assert.equal(await acesoNaBarra(p), 'locucao?');
  await p.tap('.polegar-tipo[data-tipo="locucao"]');
  assert.deepEqual(await tipos(p), ['locucao'], 'o toque no palpite confirma');
  assert.equal(await acesoNaBarra(p), 'locucao');
  assert.ok(await noTexto(p), 'o toque não tira o foco do texto: o teclado fica aberto');
  await p.locator('.polegar-tipo[data-tipo="arte"]').scrollIntoViewIfNeeded();
  await p.tap('.polegar-tipo[data-tipo="arte"]');
  assert.deepEqual(await tipos(p), ['arte']);
  assert.deepEqual(await artesDaLista(p), ['NESTE SÁBADO, A BRASA DECIDE.'], 'o trecho de arte entra na lista');
  await p.tap('.polegar-tipo[data-tipo="locucao"]');
  assert.deepEqual(await tipos(p), ['locucao']);
  assert.ok(await noTexto(p));
  await capturar(p, `02-tipos-com-teclado-${sufixo}`);

  // o "/" vira botão: o menu abre para cima da barra, e o toque escolhe
  await p.keyboard.press('Enter');
  await p.tap('.polegar-barra');
  await p.waitForSelector('.menu-da-barra');
  assert.ok(await noTexto(p));
  const menu = await p.locator('.menu-da-barra').boundingBox();
  const barra = await p.locator('.barra-do-polegar').boundingBox();
  assert.ok(menu.y + menu.height <= barra.y + 1, `o menu fica acima da barra: ${JSON.stringify({ menu, barra })}`);
  assert.ok(menu.y >= 0 && menu.x >= 0 && menu.x + menu.width <= p.viewportSize().width + 1, `o menu cabe na tela: ${JSON.stringify(menu)}`);
  assert.deepEqual(await alvosPequenos(p), [], 'os comandos têm 44 px');
  await semUnha(p, `o menu do "/" (${sufixo})`);
  await capturar(p, `03-barra-do-menu-${sufixo}`);
  await p.tap('.menu-da-barra [data-comando="sonora"]');
  await p.waitForSelector('.menu-da-barra', { state: 'detached' });
  assert.ok(await noTexto(p));
  await p.keyboard.type('Dona Zélia, de Pelotas: Aqui ninguém leva carne crua.', devagar);
  assert.deepEqual(await tipos(p), ['locucao', 'sonora']);
  assert.equal(await p.locator('.texto-escrita').innerText().then((t) => t.includes('/')), false, 'o "/" saiu do texto');

  // a Arte (o Ctrl+U): o trecho todo vira arte
  await p.keyboard.press('Enter');
  await p.keyboard.type('AMANHÃ, NA BRASA', devagar);
  await p.tap('.polegar-arte');
  assert.equal((await tipos(p)).at(-1), 'arte');
  assert.equal(await p.locator('.polegar-arte').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await artesDaLista(p), ['AMANHÃ, NA BRASA']);
  assert.ok(await noTexto(p));
  await p.keyboard.press('Enter');
  await p.tap('.polegar-barra');
  await p.tap('.menu-da-barra [data-comando="edicao"]');
  await p.keyboard.type('Abre no fogo, a brasa estalando.', devagar);
  await salvou(p);
  await semRolagemDeLado(p, `escrevendo (${sufixo})`);

  // com um trecho selecionado, o Comentar toma o lugar dos tipos e abre a folha de baixo, acima do teclado
  await selecionar(p, 'BRASA DECIDE');
  await p.waitForSelector('.barra-do-polegar .polegar-comentar');
  assert.equal(await p.locator('.polegar-tipos').count(), 0);
  await capturar(p, `04-selecao-${sufixo}`);
  await p.tap('.polegar-comentar');
  await p.waitForSelector('.balao-comentario.escrevendo textarea');
  assert.equal(await p.locator('.balao-comentario.escrevendo .balao-trecho').innerText(), '“BRASA DECIDE”');
  await p.waitForTimeout(400);
  assert.ok(Math.abs((await peDe(p, '.balao-comentario.escrevendo')) - TECLADO) < 2, 'a folha de baixo fica acima do teclado');
  await p.keyboard.type('Vale a pena repetir a data aqui?', devagar);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.balao-comentario[data-fio]');
  assert.match(await p.locator('.balao-comentario[data-fio]').innerText(), /Vale a pena repetir a data aqui\?/);
  await semUnha(p, `a folha de baixo (${sufixo})`);
  await semCheckVerde(p, `a folha de baixo (${sufixo})`);
  await capturar(p, `05-comentario-${sufixo}`);
  await p.keyboard.press('Escape');
  await p.waitForSelector('.balao-comentario[data-fio]', { state: 'detached' });

  // o teclado fecha: a barra volta para cima do rodapé
  await p.evaluate(() => window.__teclado(0));
  await p.waitForFunction(() => getComputedStyle(document.querySelector('.rodape-da-escrita')).display !== 'none');
  await p.waitForTimeout(400);
  const rodape = await p.locator('.rodape-da-escrita').boundingBox();
  const barraSemTeclado = await p.locator('.barra-do-polegar').boundingBox();
  assert.ok(Math.abs(barraSemTeclado.y + barraSemTeclado.height - rodape.y) < 2, `sem teclado, a barra fica logo acima do rodapé: ${JSON.stringify({ barraSemTeclado, rodape })}`);

  // as colunas viram linhas empilhadas: vídeo em cima, áudio embaixo
  await p.evaluate(() => scrollTo(0, 0));
  await p.tap('.escrita-ver [role="radio"]:has-text("Colunas")');
  await p.waitForSelector('.texto-escrita[data-visao="colunas"]');
  await p.waitForTimeout(500);
  const linhas = await p.locator('.texto-escrita > p').evaluateAll((ps) =>
    ps.map((x) => ({ coluna: x.dataset.coluna, esq: Math.round(x.getBoundingClientRect().left), larg: Math.round(x.getBoundingClientRect().width), nome: getComputedStyle(x, '::after').content })),
  );
  assert.ok(new Set(linhas.map((l) => l.esq)).size === 1 && new Set(linhas.map((l) => l.larg)).size === 1, `empilhadas, uma embaixo da outra: ${JSON.stringify(linhas)}`);
  const nomes = linhas.filter((l) => l.nome !== 'none').map((l) => `${l.coluna}:${l.nome}`);
  assert.ok(nomes.includes('video:"Vídeo"') && nomes.includes('audio:"Áudio"'), `o nome da coluna em cada parte: ${JSON.stringify(linhas)}`);
  assert.equal(await p.locator('.cabeca-das-colunas').evaluate((e) => getComputedStyle(e).display), 'none');
  await semRolagemDeLado(p, `as colunas (${sufixo})`);
  await semUnha(p, `as colunas (${sufixo})`);
  await capturar(p, `06-colunas-${sufixo}`);
  await p.tap('.escrita-ver [role="radio"]:has-text("Texto")');
  await p.waitForSelector('.texto-escrita[data-visao="texto"]');

  // o Enviar, ao lado na barra, abre o painel do #194 em tela cheia
  assert.equal(await p.locator('.escrita-barra .escrita-enviar').evaluate((e) => getComputedStyle(e).display), 'none', 'o Enviar de cima desceu para a barra');
  await p.waitForSelector('.polegar-enviar:not([disabled])');
  await p.tap('.polegar-enviar');
  await p.waitForSelector('.card-aberto .enviar');
  await p.waitForTimeout(500);
  const painel = await p.locator('.card-aberto').boundingBox();
  const { width, height } = p.viewportSize();
  assert.ok(painel.x <= 1 && Math.abs(painel.width - width) <= 1 && painel.height >= height - 2, `o painel em tela cheia: ${JSON.stringify(painel)}`);
  await semRolagemDeLado(p, `o Enviar (${sufixo})`);
  await semCheckVerde(p, `o Enviar (${sufixo})`);
  await capturar(p, `07-enviar-${sufixo}`);
  await p.keyboard.press('Escape');
  await p.waitForSelector('.card-aberto', { state: 'detached' });

  await p.evaluate(() => scrollTo(0, 0));
  assert.deepEqual(await alvosPequenos(p), [], 'os alvos de toque têm 44 px');
  await semRolagemDeLado(p, `a folha (${sufixo})`);
  await semCheckVerde(p, `a folha (${sufixo})`);
  await semUnha(p, `a folha (${sufixo})`);
  await capturar(p, `08-folha-${sufixo}`);
  assert.deepEqual(m.erros, []);
  await fechar(m);
  return id;
}

async function oDaviLeEComenta(navegador, s, id, { aparelho, tema, sufixo }) {
  const d = await entrar(navegador, s.url, `#/roteiros/${id}`, DAVI, aparelho, tema);
  const { p } = d;
  await liberada(p);
  await p.waitForSelector('.escrita-so-lendo');
  await p.waitForSelector('.barra-do-polegar.so-comentar');
  assert.equal(await p.locator('.polegar-tipo, .polegar-barra, .polegar-arte, .polegar-enviar').count(), 0, 'quem só lê não troca tipo nem envia');
  assert.match(await p.locator('.barra-do-polegar').innerText(), /Selecione um trecho para comentar/);
  assert.equal(await p.locator('.texto-escrita').getAttribute('contenteditable'), 'false');
  await semRolagemDeLado(p, `quem só lê (${sufixo})`);
  await capturar(p, `09-so-lendo-${sufixo}`);
  await selecionar(p, 'carne crua');
  await p.tap('.polegar-comentar');
  await p.waitForSelector('.balao-comentario.escrevendo textarea');
  await p.keyboard.type('Fica lindo na arte.', devagar);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.balao-comentario[data-fio]');
  assert.match(await p.locator('.balao-comentario[data-fio]').innerText(), /Davi[\s\S]*Fica lindo na arte\./);
  await p.waitForTimeout(450);
  const pe = await peDe(p, '.balao-comentario[data-fio]');
  assert.ok(Math.abs(pe) < 2, `sem teclado, a folha de baixo encosta no pé: ${pe}`);
  await semUnha(p, `o comentário de quem só lê (${sufixo})`);
  await semCheckVerde(p, `o comentário de quem só lê (${sufixo})`);
  await capturar(p, `10-so-lendo-comenta-${sufixo}`);
  assert.deepEqual(d.erros, []);
  await fechar(d);
}

(async () => {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: LIA }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: LIA } });
  const como = (email) => (caminho, init = {}) => fetch(`${s.api}${caminho}`, { ...init, headers: { 'content-type': 'application/json', 'cf-access-authenticated-user-email': email, ...init.headers } });
  for (const email of [LIA, MARINA, DAVI]) await como(email)('/eu/tour', { method: 'POST' });
  const navegador = await chromium.launch();
  try {
    const rodadas = [
      { aparelho: 'iPhone 13', tema: 'light', sufixo: 'iphone-claro', video: 'escrever-celular-iphone-claro' },
      { aparelho: 'Pixel 7', tema: 'dark', sufixo: 'android-escuro' },
      { aparelho: 'iPhone 13', tema: 'dark', sufixo: 'iphone-escuro' },
      { aparelho: 'Pixel 7', tema: 'light', sufixo: 'android-claro' },
    ];
    for (const r of rodadas) {
      const id = await aMarinaEscreve(navegador, s, como, r);
      console.log(`✔ ${r.sufixo}: o convite, a barra acima do teclado, os tipos, o "/", a Arte, o Comentar, as colunas empilhadas e o Enviar`);
      await oDaviLeEComenta(navegador, s, id, r);
      console.log(`✔ ${r.sufixo}: quem só lê, lê e comenta`);
    }
  } finally {
    await navegador.close();
    await s.descer();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
