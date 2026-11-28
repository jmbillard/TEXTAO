// Ponta a ponta do Roteiro sendo escrito em "Roteiros" (#189), rodado à parte do vitest: `npm run e2e:roteiros`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros sobre um Teable
// falso (a Marina é redatora pelo e-mail; o Davi, designer, não tem cadastro; a Bia é da coordenação; a Lia, a
// administradora). Nomes e e-mails fictícios.
//
// No computador (claro): a Marina entra no Redator, que é "Roteiros" — o título, o Novo roteiro e a lupa na linha do
// título, e as abas meus, da equipe, sendo escritos e enviados. O Novo roteiro abre a folha com o cursor no texto e o
// título no topo, sem claquete; ela digita o texto e o título, a bolinha laranja diz "salvo" (nunca um ✓ verde) e, ao
// recarregar, está tudo lá. Na lista, o roteiro aparece em "meus" (no Escrevendo) e em "sendo escritos", e a busca
// acha pelo título. Ela fecha o roteiro (só ela e convidados): o Davi não abre mais; reaberto, ele abre de novo.
//
// O Davi (designer, escuro): o caminho "Roteiros" está na linha do logo da fila; ele cai em "sendo escritos", abre o
// roteiro da Marina e vê que está só lendo (a faixa, o texto que não aceita digitar). O roteiro sendo escrito não está
// na fila dele. A Bia (coordenação) escreve no roteiro visível, sem a faixa.
//
// No celular (claro e escuro): a lista e a folha cabem, sem rolar para o lado.
//
// Com CAPTURAS=pasta, grava as capturas (densidade 2) e os vídeos do Novo roteiro (no computador, claro, e no celular,
// escuro).
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:roteiros
const assert = require('node:assert/strict');
const { mkdirSync, readdirSync, renameSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');
const { checksVerdes, lugarDaLupa } = require('./coerencia.cjs');
const RAIZ = join(__dirname, '..', '..');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:roteiros');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const MARINA = 'marina.teles@exemplo.com';
const DAVI = 'davi.rocha@exemplo.com';
const BIA = 'bia.coord@exemplo.com';
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
    [...document.querySelectorAll('.folha-escrita *, .roteiros-escritos *, .escrita-so-lendo, .folha-escrita')].filter((e) => {
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

async function oDaMarina(navegador, url) {
  const video = CAPTURAS ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: { width: 1280, height: 800 } } } : {};
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', MARINA, { viewport: { width: 1280, height: 800 }, colorScheme: 'light', ...video });
  await p.waitForSelector('.roteiros-escritos');
  assert.equal((await p.locator('.meus-roteiros h2').innerText()).trim(), 'Roteiros');
  const abas = await p.locator('.abas-roteiros [role="tab"]').evaluateAll((as) => as.map((a) => a.textContent.replace(/\d+/g, '').trim()));
  assert.deepEqual(abas, ['Meus', 'Da equipe', 'Sendo escritos', 'Enviados']);
  const lupa = await lugarDaLupa(p);
  assert.ok(lupa.ok, `a lupa na linha do título, na ponta: ${lupa.motivo}`);
  assert.ok(await p.locator('.caminhos-do-topo a.topo-roteiros[aria-current="page"]').count(), 'no Redator, "Roteiros" é o caminho da tela');
  await capturar(p, '01-roteiros-vazio-claro');

  // o Novo roteiro: a folha com o cursor no texto, o título no topo, sem claquete
  await p.click('.novo-roteiro');
  await p.waitForSelector('.folha-escrita');
  assert.match(p.url(), /#\/roteiros\/[\w-]+$/);
  await p.waitForFunction(() => document.activeElement?.closest('.texto-escrita') !== null);
  assert.equal(await p.locator('.folha-escrita .claquete, .folha-escrita [class*="claquete"]').count(), 0, 'sem claquete');
  assert.equal(await p.locator('.folha-escrita-titulo').getAttribute('placeholder'), 'Título do roteiro');
  await p.keyboard.type('NESTE SÁBADO, A BRASA DECIDE.', { delay: 12 });
  await p.keyboard.press('Enter');
  await p.keyboard.type('Dona Zélia, de Pelotas: aqui ninguém leva carne crua pra casa.', { delay: 8 });
  await p.click('.folha-escrita-titulo');
  await p.keyboard.type('Desafio da Brasa, a final', { delay: 15 });
  await salvou(p);
  assert.equal((await p.locator('.escrita-salvo').innerText()).trim(), 'salvo');
  // a bolinha troca de cor numa transição (0.3s): a cor é a do fim dela
  await p.waitForTimeout(450);
  const cor = await p.locator('.escrita-salvo .bolinha-estado').evaluate((e) => getComputedStyle(e).backgroundColor);
  const laranja = await p.evaluate(() => {
    const i = document.createElement('i');
    i.style.color = 'var(--ultra)';
    document.body.append(i);
    const c = getComputedStyle(i).color;
    i.remove();
    return c;
  });
  assert.equal(cor, laranja, 'a marca de salvo é a bolinha laranja');
  await semCheckVerde(p, 'a folha');
  await semUnha(p, 'a folha');
  await capturar(p, '02-folha-claro');
  const id = /#\/roteiros\/([\w-]+)$/.exec(p.url())[1];

  // recarregar: o texto e o título voltam
  await p.reload();
  await p.waitForSelector('.folha-escrita .texto-escrita p');
  assert.equal(await p.locator('.folha-escrita-titulo').inputValue(), 'Desafio da Brasa, a final');
  const paragrafos = await p.locator('.texto-escrita p').allInnerTexts();
  assert.deepEqual(paragrafos, ['NESTE SÁBADO, A BRASA DECIDE.', 'Dona Zélia, de Pelotas: aqui ninguém leva carne crua pra casa.']);

  // de volta à lista: em "meus" (no Escrevendo) e em "sendo escritos"; a busca acha pelo título
  await p.click('.escrita-voltar');
  await p.waitForSelector('.roteiros-escritos .ficha');
  assert.match(await p.locator('.roteiros-escritos .ficha').first().innerText(), /Desafio da Brasa, a final[\s\S]*Escrevendo/);
  await p.click('.abas-roteiros .aba-sendo');
  await p.waitForSelector('.fichas-escritas .ficha-escrita');
  assert.match(await p.locator('.fichas-escritas').innerText(), /Desafio da Brasa, a final[\s\S]*por Marina Teles[\s\S]*Sendo escrito[\s\S]*visível para a equipe/);
  await p.keyboard.press('/');
  await p.keyboard.type('brasa final');
  assert.equal(await p.locator('.fichas-escritas .ficha-escrita').count(), 1);
  await p.keyboard.type(' xyz');
  await p.waitForSelector('.nada-na-busca');
  await p.keyboard.press('Escape');
  await capturar(p, '03-sendo-escritos-claro');
  await semCheckVerde(p, 'a lista');
  await semUnha(p, 'a lista');
  assert.deepEqual(erros, []);

  // o vídeo do Novo roteiro
  const caminho = await p.video()?.path();
  await ctx.close();
  if (caminho) renameSync(caminho, join(CAPTURAS, 'novo-roteiro-computador-claro.webm'));
  return id;
}

async function fecharEReabrir(navegador, url, id) {
  const { ctx, p, erros } = await entrar(navegador, url, `#/roteiros/${id}`, MARINA, { viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
  await p.waitForSelector('.folha-escrita');
  await p.click('.escrita-visibilidade .visibilidade');
  await p.waitForSelector('.painel-compartilhar');
  assert.match(await p.locator('.painel-compartilhar').innerText(), /Fechado[\s\S]*Visível para a equipe/);
  await capturar(p, '04-quem-ve-claro');
  await p.click('.painel-compartilhar .modo:has-text("Fechado")');
  await salvou(p);
  assert.match(await p.locator('.escrita-visibilidade').innerText(), /Fechado/);
  await semCheckVerde(p, 'o painel de quem vê');

  const davi = await entrar(navegador, url, `#/roteiros/${id}`, DAVI, { viewport: { width: 1280, height: 800 } });
  await davi.p.waitForSelector('.lq[data-caso="sem-permissao"]');
  assert.equal(await davi.p.locator('.folha-escrita').count(), 0, 'fechado, o designer não abre');
  await davi.ctx.close();

  await p.click('.painel-compartilhar .modo:has-text("Visível para a equipe")');
  await salvou(p);
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function oDoDavi(navegador, url, id) {
  const { ctx, p, erros } = await entrar(navegador, url, '#/designer', DAVI, { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await p.waitForSelector('.caminhos-do-topo a.topo-roteiros');
  // o roteiro sendo escrito não está na fila
  await p.waitForTimeout(600);
  assert.ok(!(await p.locator('main').innerText()).includes('Desafio da Brasa'), 'o sendo escrito fora da fila');
  await p.click('.caminhos-do-topo a.topo-roteiros');
  await p.waitForSelector('.fichas-escritas .ficha-escrita');
  assert.match(p.url(), /#\/roteiros$/);
  assert.equal(await p.locator('.abas-roteiros [aria-selected="true"]').getAttribute('class'), 'aba-sendo', 'quem não escreve cai em "sendo escritos"');
  assert.equal(await p.locator('.novo-roteiro').count(), 0, 'o designer não começa roteiro');
  assert.match(await p.locator('.fichas-escritas').innerText(), /Desafio da Brasa[\s\S]*você lê/);
  await capturar(p, '05-roteiros-designer-escuro');
  await p.click('.fichas-escritas .ficha-escrita');
  await p.waitForSelector('.escrita-so-lendo');
  assert.match(await p.locator('.escrita-so-lendo').innerText(), /só lendo[\s\S]*Marina Teles/);
  assert.equal(await p.locator('.texto-escrita').getAttribute('contenteditable'), 'false');
  await p.click('.texto-escrita');
  await p.keyboard.type('POR CIMA');
  assert.ok(!(await p.locator('.texto-escrita').innerText()).includes('POR CIMA'), 'o texto não aceita digitar');
  await semCheckVerde(p, 'só lendo');
  await semUnha(p, 'só lendo');
  await p.evaluate(() => scrollTo(0, 0));
  await capturar(p, '06-so-lendo-escuro');
  assert.equal(p.url().endsWith(`#/roteiros/${id}`), true);
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function aDaBia(navegador, url, id) {
  const { ctx, p, erros } = await entrar(navegador, url, `#/roteiros/${id}`, BIA, { viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
  await p.waitForSelector('.folha-escrita');
  assert.equal(await p.locator('.escrita-so-lendo').count(), 0, 'a coordenação escreve');
  await p.click('.texto-escrita p >> nth=-1');
  await p.keyboard.press('End');
  await p.keyboard.press('Enter');
  await p.keyboard.type('TRILHA: sobe a batida.');
  await salvou(p);
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function noCelular(navegador, url, id) {
  for (const [tema, sufixo] of [['light', 'claro'], ['dark', 'escuro']]) {
    const video = CAPTURAS && tema === 'dark' ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: { width: 390, height: 844 } } } : {};
    const { ctx, p, erros } = await entrar(navegador, url, '#/redator', MARINA, { ...devices['iPhone 13'], colorScheme: tema, ...video });
    await p.waitForSelector('.roteiros-escritos .ficha');
    await semRolagemDeLado(p, `a lista no celular (${sufixo})`);
    const lupa = await lugarDaLupa(p);
    assert.ok(lupa.ok, `a lupa no celular: ${lupa.motivo}`);
    await capturar(p, `07-roteiros-celular-${sufixo}`);
    if (tema === 'dark') {
      // o Novo roteiro no celular, no escuro: a folha com o cursor, salva sozinha
      await p.click('.novo-roteiro');
      await p.waitForFunction(() => document.activeElement?.closest('.texto-escrita') !== null);
      await p.keyboard.type('LOC: a brasa no celular.', { delay: 20 });
      await salvou(p);
      await semRolagemDeLado(p, 'o Novo roteiro no celular');
      await capturar(p, '07b-novo-roteiro-celular-escuro');
      await p.goBack();
      await p.waitForSelector('.roteiros-escritos .ficha');
    }
    await p.goto(`${url}#/roteiros/${id}`);
    await p.waitForSelector('.folha-escrita .texto-escrita p');
    await semRolagemDeLado(p, `a folha no celular (${sufixo})`);
    await semCheckVerde(p, `a folha no celular (${sufixo})`);
    await capturar(p, `08-folha-celular-${sufixo}`);
    assert.deepEqual(erros, []);
    const caminho = await p.video()?.path();
    await ctx.close();
    if (caminho) renameSync(caminho, join(CAPTURAS, 'novo-roteiro-celular-escuro.webm'));
  }
}

async function noComputadorEscuro(navegador, url, id) {
  // o link da revisão de um roteiro sendo escrito leva à folha de escrita, sem ficar no histórico
  const { ctx, p } = await entrar(navegador, url, `#/r/${id}`, MARINA, { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await p.waitForSelector('.folha-escrita .texto-escrita p');
  assert.ok(p.url().endsWith(`#/roteiros/${id}`), 'da revisão para a folha de escrita');
  assert.equal(await p.locator('.cadeado-do-texto').count(), 0, 'sem o cadeado da revisão');
  await semCheckVerde(p, 'a folha no escuro');
  await capturar(p, '09-folha-escuro');
  await p.goto(`${url}#/redator`);
  await p.waitForSelector('.roteiros-escritos .ficha');
  await capturar(p, '10-roteiros-meus-escuro');
  await ctx.close();
}

(async () => {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: LIA }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: LIA } });
  const navegador = await chromium.launch();
  try {
    const r = await fetch(`${s.api}/cadastros/coordenacao`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/json' }, body: JSON.stringify({ email: BIA }) });
    assert.equal(r.status, 200);
    // o tour da revisão já visto: o convite não cobre a fila
    for (const email of [LIA, MARINA, DAVI, BIA]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
    const id = await oDaMarina(navegador, s.url);
    console.log('✔ o Novo roteiro abre a folha com o cursor, salva sozinho (bolinha laranja) e volta ao recarregar; a lista com abas e busca');
    await fecharEReabrir(navegador, s.url, id);
    console.log('✔ fechado, o designer não abre; reaberto, abre');
    await oDoDavi(navegador, s.url, id);
    console.log('✔ o designer vê "Roteiros" no topo, só lê, e o sendo escrito não está na fila');
    await aDaBia(navegador, s.url, id);
    console.log('✔ a coordenação escreve no roteiro visível');
    await noCelular(navegador, s.url, id);
    console.log('✔ no celular, claro e escuro, sem rolar para o lado');
    await noComputadorEscuro(navegador, s.url, id);
    console.log('✔ no escuro, no computador; o link da revisão leva à folha de escrita');
    if (CAPTURAS) for (const f of readdirSync(join(CAPTURAS, 'video'), { withFileTypes: true }).filter((f) => f.isFile())) console.log(`vídeo: ${f.name}`);
  } finally {
    await navegador.close();
    await s.descer();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
