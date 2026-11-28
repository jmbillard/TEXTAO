// Ponta a ponta dos comentários do Roteiro sendo escrito (#192), rodado à parte do vitest: `npm run e2e:comentarios`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros sobre um Teable
// falso. A Marina (redatora, a autora, no claro) escreve o roteiro e volta à lista de "Roteiros". O Davi (designer, que só
// lê, no escuro) abre o mesmo roteiro no outro navegador, seleciona "UM SÓ TÍTULO" e comenta com Ctrl+Alt+M, chamando a
// Marina pelo @ (a lista de quem chamar). Na lista da Marina, ao vivo, a bolinha de aviso acende no caminho "Roteiros"
// e no roteiro; ela abre o roteiro: o balão está na margem, à altura do trecho, com autor, papel e hora e a bolinha; na
// lista, a bolinha sumiu. Ela responde no balão, e a resposta chega ao Davi ao vivo. Ela reescreve o texto em volta do
// trecho: o grifo continua nele, também para o Davi depois de recarregar. Ela resolve: o balão some nos dois navegadores;
// o Desfazer da caixinha o traz de volta. Na tela estreita, o balão abre por cima da folha ao tocar no trecho; no
// celular, é uma folha de baixo. Claro e escuro, sem "unha" e sem ✓ verde.
//
// Nomes e e-mails fictícios. Precisa do Playwright com o Chromium, instalado globalmente:
// NODE_PATH=$(npm root -g) npm run e2e:comentarios
// Com CAPTURAS=pasta, grava as capturas (densidade 2) e o vídeo do Davi.
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:comentarios');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const MARINA = 'marina.teles@exemplo.com';
const DAVI = 'davi.rocha@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };
const ID = 'comentarios-e2e-1';
const LARGA = { width: 1500, height: 880 };

const ENV_CADASTROS = { TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'falso', TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };
const TABELAS = { tblRed: [{ id: 'recR1', fields: { redator: 'Marina Teles', email: MARINA } }], tblKeyRed: [], tblEdi: [], tblKeyEdi: [] };
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  if (u.host !== 'teable-falso' || (init.method ?? 'GET') !== 'GET') throw new Error(`o teste não sai para a rede: ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(u.pathname);
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
}

async function entrar(navegador, url, hash, email, opcoes = {}, nomeDoVideo = '') {
  const tam = opcoes.viewport ?? LARGA;
  const video = CAPTURAS && nomeDoVideo ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: tam } } : {};
  const ctx = await navegador.newContext({ viewport: LARGA, extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes, ...video });
  // o WebSocket do navegador não leva o cabeçalho: o servidor do teste lê o e-mail do cookie
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(email), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}${hash}`);
  return { ctx, p, erros, nomeDoVideo };
}
const fechar = async ({ ctx, p, nomeDoVideo }) => {
  const caminho = await p.video()?.path();
  await ctx.close();
  if (caminho && nomeDoVideo) renameSync(caminho, join(CAPTURAS, `${nomeDoVideo}.webm`));
};
const liberada = (p) => p.waitForSelector('.folha-escrita:not(.chegando) .texto-escrita', { timeout: 15000 });
const salvou = (p) => p.waitForSelector('.escrita-salvo[data-salvamento="salvo"]', { timeout: 8000 });
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(450);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
};
const semCheckVerde = async (p, onde) => assert.deepEqual(await checksVerdes(p), [], `${onde}: nada de ✓ verde`);
async function semUnha(p, onde) {
  const unhas = await p.evaluate(() =>
    [...document.querySelectorAll('.folha-escrita *, .escrita-barra *, .roteiros-escritos *')].filter((e) => {
      if (e.closest('.collaboration-cursor__caret')) return false;
      const c = getComputedStyle(e);
      const borda = parseFloat(c.borderLeftWidth) >= 3 && c.borderLeftStyle !== 'none' && c.borderLeftColor !== c.borderTopColor;
      const sombra = /inset\s+([3-9]|\d{2,})px\s+0/.test(c.boxShadow);
      return borda || sombra;
    }).map((e) => e.className),
  );
  assert.deepEqual(unhas, [], `${onde}: nada de unha`);
}
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);

/** Seleciona o trecho no texto, como a pessoa faria com o mouse. */
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
  await p.waitForTimeout(80);
}
/** O texto grifado de cada comentário aberto. */
const grifados = (p) => p.evaluate(() => [...document.querySelectorAll('.texto-escrita .comentario-trecho')].map((e) => e.textContent).join('|'));
/** O balão está à altura do trecho (na margem direita, à direita do texto). */
async function alturaDoBalao(p) {
  return p.evaluate(() => {
    const t = document.querySelector('.texto-escrita .comentario-trecho').getBoundingClientRect();
    const b = document.querySelector('.comentarios-da-folha .balao-comentario').getBoundingClientRect();
    const texto = document.querySelector('.texto-escrita').getBoundingClientRect();
    return { diferenca: Math.abs(b.top - t.top), aDireita: b.left >= texto.right - 1 };
  });
}

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: LIA }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: LIA } });
  const como = (email) => (caminho, init = {}) => fetch(`${s.api}${caminho}`, { ...init, headers: { 'content-type': 'application/json', 'cf-access-authenticated-user-email': email, ...init.headers } });
  for (const email of [LIA, MARINA, DAVI]) await como(email)('/eu/tour', { method: 'POST' });
  assert.equal((await como(MARINA)('/roteiros-escritos', { method: 'POST', body: JSON.stringify({ id: ID, titulo: 'Desafio da Brasa, a final' }) })).status, 201);

  const navegador = await chromium.launch();
  try {
    // a Marina escreve o roteiro e volta à lista
    const marina = await entrar(navegador, s.url, `#/roteiros/${ID}`, MARINA, { colorScheme: 'light' });
    await liberada(marina.p);
    await marina.p.waitForFunction(() => document.activeElement?.closest('.texto-escrita') !== null);
    await marina.p.keyboard.type('NESTE SÁBADO, A BRASA DECIDE.', { delay: 6 });
    await marina.p.keyboard.press('Enter');
    await marina.p.keyboard.type('OITO CHURRASQUEIROS. UM SÓ TÍTULO.', { delay: 6 });
    await marina.p.keyboard.press('Enter');
    await marina.p.keyboard.type('E A FINAL TEM JURADO NOVO NA BANCADA.', { delay: 6 });
    await salvou(marina.p);
    await marina.p.click('.escrita-voltar');
    await marina.p.waitForSelector('.roteiros-escritos .ficha');
    assert.equal(await marina.p.locator('.caminhos-do-topo .topo-roteiros .caminho-aviso').count(), 0, 'sem aviso ainda');

    // o Davi (só lê) seleciona o trecho e comenta com Ctrl+Alt+M, chamando a Marina pelo @
    const davi = await entrar(navegador, s.url, `#/roteiros/${ID}`, DAVI, { colorScheme: 'dark' }, 'comentarios-davi-escuro');
    await liberada(davi.p);
    await davi.p.waitForSelector('.escrita-so-lendo');
    assert.match(await davi.p.locator('.escrita-so-lendo').innerText(), /Selecione um trecho para comentar/);
    await selecionar(davi.p, 'UM SÓ TÍTULO');
    await davi.p.keyboard.press('Control+Alt+KeyM');
    await davi.p.waitForSelector('.balao-comentario.escrevendo textarea');
    assert.equal(await davi.p.locator('.balao-comentario.escrevendo .balao-trecho').innerText(), '“UM SÓ TÍTULO”');
    assert.equal(await grifados(davi.p), 'UM SÓ TÍTULO', 'o trecho fica grifado enquanto escreve');
    await davi.p.keyboard.type('Dá para tirar? @Mar', { delay: 20 });
    await davi.p.waitForSelector('.mencao-lista li');
    assert.match(await davi.p.locator('.mencao-lista').innerText(), /Marina Teles/);
    await capturar(davi.p, '01-mencao-escuro');
    await davi.p.keyboard.press('Enter');
    await davi.p.keyboard.type('a arte 2 já diz isso.', { delay: 10 });
    assert.equal(await davi.p.locator('.balao-comentario.escrevendo textarea').inputValue(), 'Dá para tirar? @Marina Teles a arte 2 já diz isso.');
    await davi.p.keyboard.press('Enter');
    await davi.p.waitForSelector('.balao-comentario[data-fio]');
    assert.match(await davi.p.locator('.balao-comentario[data-fio]').innerText(), /Davi Rocha[\s\S]*equipe · agora há pouco[\s\S]*Dá para tirar\? @Marina Teles a arte 2 já diz isso\./);
    assert.equal(await davi.p.locator('.balao-comentario[data-fio] .comentario-mencao').innerText(), '@Marina Teles');
    // quem só lê não mudou o texto
    assert.equal(await davi.p.locator('.texto-escrita').getAttribute('contenteditable'), 'false');
    await davi.p.waitForTimeout(400);
    const alturaDavi = await alturaDoBalao(davi.p);
    assert.ok(alturaDavi.diferenca < 4 && alturaDavi.aDireita, `o balão na margem, à altura do trecho: ${JSON.stringify(alturaDavi)}`);
    await semCheckVerde(davi.p, 'o balão no escuro');
    await semUnha(davi.p, 'o balão no escuro');
    await capturar(davi.p, '02-balao-escuro');
    console.log('ok: quem só lê seleciona e comenta (Ctrl+Alt+M), com o @ que acha a pessoa; o balão na margem, à altura do trecho');

    // na lista da Marina, ao vivo: a bolinha no caminho "Roteiros" e no roteiro
    await marina.p.waitForSelector('.caminhos-do-topo .topo-roteiros .caminho-aviso', { timeout: 8000 });
    await marina.p.waitForSelector('.roteiros-escritos .ficha .bolinha-aviso', { timeout: 8000 });
    await semUnha(marina.p, 'a lista com o aviso');
    await capturar(marina.p, '03-aviso-na-lista-claro');
    // ela abre: o balão com a bolinha; na lista e no topo, o aviso some
    await marina.p.click('.roteiros-escritos .ficha:has(.bolinha-aviso)');
    await liberada(marina.p);
    await marina.p.waitForSelector('.balao-comentario.novo .bolinha-aviso');
    assert.match(await marina.p.locator('.balao-comentario').innerText(), /Davi Rocha[\s\S]*Dá para tirar/);
    await capturar(marina.p, '04-balao-novo-claro');
    for (let i = 0; i < 40 && Object.keys(await (await como(MARINA)('/avisos')).json().then((r) => r.roteiros)).length; i++) await marina.p.waitForTimeout(100);
    assert.deepEqual((await (await como(MARINA)('/avisos')).json()).roteiros, {}, 'ao ver, o aviso some');
    console.log('ok: a bolinha acende ao vivo em "Roteiros" e no roteiro, e some quando a pessoa vê');

    // a Marina responde no balão; chega ao Davi ao vivo
    await marina.p.click('.balao-comentario');
    await marina.p.waitForSelector('.balao-comentario.ativo .caixa-de-comentario textarea');
    assert.equal(await marina.p.locator('.balao-comentario .bolinha-aviso').count(), 0, 'mexeu no balão: a bolinha some');
    await marina.p.click('.balao-comentario.ativo .caixa-de-comentario textarea');
    await marina.p.keyboard.type('Deixo por ora; se estourar, corto.', { delay: 10 });
    await marina.p.keyboard.press('Enter');
    await marina.p.locator('.balao-comentario.ativo .comentario-texto', { hasText: 'Deixo por ora' }).waitFor();
    assert.match(await marina.p.locator('.balao-comentario.ativo').innerText(), /Marina Teles[\s\S]*redação · agora há pouco[\s\S]*Deixo por ora/);
    await davi.p.locator('.balao-comentario .comentario-texto', { hasText: 'Deixo por ora' }).waitFor({ timeout: 8000 });
    await semCheckVerde(marina.p, 'o balão aberto');
    await semUnha(marina.p, 'o balão aberto');
    await capturar(marina.p, '05-responder-claro');
    console.log('ok: responder no balão, ao vivo no outro navegador');

    // a Marina reescreve em volta do trecho: o grifo continua nele, também para o Davi ao recarregar
    await marina.p.evaluate(() => {
      const p = document.querySelectorAll('.texto-escrita > p')[1];
      const r = document.createRange();
      r.setStart(p.firstChild, 0);
      r.setEnd(p.firstChild, 'OITO'.length);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      p.closest('.texto-escrita').focus();
    });
    await marina.p.waitForTimeout(80);
    await marina.p.keyboard.type('DOZE', { delay: 15 });
    await marina.p.evaluate(() => {
      const ps = document.querySelectorAll('.texto-escrita > p');
      const r = document.createRange();
      r.selectNodeContents(ps[1]);
      r.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await marina.p.keyboard.type(' A FINAL É SÁBADO.', { delay: 10 });
    await salvou(marina.p);
    assert.equal(await grifados(marina.p), 'UM SÓ TÍTULO', 'o grifo acompanha o texto reescrito em volta');
    await davi.p.waitForFunction(() => document.querySelectorAll('.texto-escrita > p')[1]?.textContent.startsWith('DOZE'), null, { timeout: 8000 });
    assert.equal(await grifados(davi.p), 'UM SÓ TÍTULO', 'no outro navegador, ao vivo');
    await davi.p.reload();
    await liberada(davi.p);
    await davi.p.waitForSelector('.texto-escrita .comentario-trecho');
    assert.equal(await grifados(davi.p), 'UM SÓ TÍTULO', 'e depois de recarregar');
    console.log('ok: a âncora sobrevive ao texto reescrito em volta (ao vivo e ao recarregar)');

    // resolver: o balão some nos dois; o Desfazer o traz de volta
    await marina.p.click('.texto-escrita .comentario-trecho');
    await marina.p.click('.balao-comentario.ativo .balao-resolver');
    await marina.p.waitForSelector('.desfazer', { timeout: 4000 });
    assert.match(await marina.p.locator('.desfazer').innerText(), /Comentário resolvido/);
    await marina.p.waitForSelector('.balao-comentario', { state: 'detached' });
    await davi.p.waitForSelector('.balao-comentario', { state: 'detached', timeout: 8000 });
    assert.equal(await grifados(davi.p), '', 'resolvido, o trecho sai do grifo');
    await capturar(marina.p, '06-resolvido-desfazer-claro');
    await marina.p.click('.desfazer .desfazer-botao');
    await marina.p.waitForSelector('.balao-comentario.ativo');
    await davi.p.waitForSelector('.balao-comentario', { timeout: 8000 });
    console.log('ok: resolver e desfazer, nos dois navegadores');

    // na tela estreita, o balão abre por cima da folha ao tocar no trecho
    await marina.p.setViewportSize({ width: 1280, height: 800 });
    await marina.p.keyboard.press('Escape');
    await marina.p.waitForSelector('.balao-comentario', { state: 'detached' });
    await marina.p.click('.texto-escrita .comentario-trecho');
    await marina.p.waitForSelector('.comentarios-da-folha.estreita .balao-comentario.ativo');
    await semRolagemDeLado(marina.p, 'a tela estreita');
    await capturar(marina.p, '07-estreita-claro');
    assert.deepEqual(marina.erros, []);
    assert.deepEqual(davi.erros, []);
    await fechar(davi);
    await fechar(marina);

    // no celular (claro e escuro): o balão é uma folha de baixo
    for (const [tema, sufixo] of [['light', 'claro'], ['dark', 'escuro']]) {
      const cel = await entrar(navegador, s.url, `#/roteiros/${ID}`, DAVI, { ...devices['iPhone 13'], colorScheme: tema });
      await liberada(cel.p);
      await cel.p.waitForSelector('.texto-escrita .comentario-trecho');
      await cel.p.click('.texto-escrita .comentario-trecho');
      await cel.p.waitForSelector('.balao-comentario.ativo');
      await cel.p.waitForTimeout(450);
      const folha = await cel.p.locator('.balao-comentario.ativo').boundingBox();
      const alto = cel.p.viewportSize().height;
      assert.ok(Math.abs(folha.y + folha.height - alto) < 2, `a folha de baixo encosta no pé da tela: ${JSON.stringify(folha)} de ${alto}`);
      await semRolagemDeLado(cel.p, `o celular (${sufixo})`);
      await semCheckVerde(cel.p, `o celular (${sufixo})`);
      await capturar(cel.p, `08-celular-${sufixo}`);
      assert.deepEqual(cel.erros, []);
      await cel.ctx.close();
    }
    console.log('ok: na tela estreita, o balão abre por cima; no celular, é uma folha de baixo; claro e escuro');
  } finally {
    await navegador.close();
    await s.descer();
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
