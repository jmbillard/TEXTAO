// Ponta a ponta do cadeado da revisão (#188), rodado à parte do vitest: `npm run e2e:cadeado`.
//
// Sobe o servidor e o Vite como o e2e do tour (banco temporário, dados fictícios). Um roteiro fictício da Lia,
// compartilhado com o Beto (que edita) e com a Carla (que só lê). Confere, no computador: o texto travado por padrão
// (digitar não muda nada e o cadeado chacoalha); o cadeado aberto deixa digitar e apagar, o texto salva e o Beto, na
// mesma sala, vê a mudança; travado de novo, digitar volta a não mudar; ao sair e voltar ao roteiro, está travado de
// novo. A Carla não vê o cadeado. No claro e no escuro, sem "unha" (faixa colorida na borda esquerda). No celular,
// o cadeado fica de fora.
//
// Com CAPTURAS=<pasta>, guarda as capturas e um vídeo curto do cadeado, no claro e no escuro.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:cadeado
const assert = require('node:assert/strict');
const { mkdirSync, renameSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:cadeado');
  process.exit(2);
}

const CAPTURAS = process.env.CAPTURAS;
const LIA = 'lia.moraes@exemplo.com';
const BETO = 'beto.prado@exemplo.com';
const CARLA = 'carla.lima@exemplo.com';
const VOCAB = { programas: [{ nome: 'Programa Fictício', chaves: ['CHAMADA'], categoria: 'variedades' }], redatores: ['Redator Fictício'], editores: ['Editor Fictício'], pauta: [] };
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const P = (...partes) => ({
  type: 'paragraph',
  content: partes.map((x) => (typeof x === 'string' ? { type: 'text', text: x } : { type: 'text', text: x.a, marks: [{ type: 'arte', attrs: { id: x.id, subtipo: '', sugerido: false } }] })),
});
const DOC = {
  type: 'doc',
  content: [
    P('TÉC: abre na plateia lotada, as luzes do palco acendendo.'),
    P('LOC: NESTE SÁBADO, O PALCO É DE QUEM CANTA.'),
    P({ a: 'LOGO DO FESTIVAL FICTÍCIO', id: 'c1' }),
    P('LOC: DOZE VOZES, UMA SÓ FINAL.'),
    P({ a: 'SÁBADO, DEPOIS DO JORNAL', id: 'c2' }),
  ],
};

async function semear(api, id) {
  const h = (email) => ({ 'content-type': 'application/json', 'cf-access-authenticated-user-email': email });
  const d = new Date();
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 4);
  const claquete = `CHAMADA_FESTIVAL_${String(dia.getDate()).padStart(2, '0')}/${String(dia.getMonth() + 1).padStart(2, '0')}`;
  const meta = { claquete, titulo: 'Festival', programa: 'Programa Fictício', tipoPrograma: 'variedades', dataExibicao: isoLocal(dia), capitulo: null, edicao: '', praca: 'RJ', redator: 'Redator Fictício', editor: 'Editor Fictício', locutor: '', selo: '', duracaoAlvoSeg: 30, duracaoModo: 'fechar', layout: 'padrao', status: 'rascunho' };
  const agora = new Date().toISOString();
  const roteiro = { id, meta, doc: DOC, revisao: 1, criadoEm: agora, atualizadoEm: agora, compartilhadoCom: [{ email: BETO, editar: true }, { email: CARLA, editar: false }] };
  const r = await fetch(`${api}/roteiros/${id}`, { method: 'PUT', headers: h(LIA), body: JSON.stringify({ roteiro, nArtes: 2 }) });
  if (!r.ok) throw new Error(`semear ${id}: ${r.status} ${await r.text()}`);
  for (const e of [LIA, BETO, CARLA]) await fetch(`${api}/eu/tour`, { method: 'POST', headers: h(e) });
}

async function abrir(navegador, url, email, id, opcoes = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...opcoes });
  // o WebSocket do navegador não leva o cabeçalho: o servidor do teste lê o e-mail do cookie
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(email), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/r/${id}`);
  await esperarTexto(p);
  return { ctx, p, erros };
}

async function esperarTexto(p) {
  const chegou = await p.waitForSelector('.texto u.arte[data-id="c2"]', { timeout: 45000 }).then(() => true, () => false);
  if (!chegou) throw new Error('o texto não chegou da sala');
  // liberado: a lista de artes deixa de estar travada (quem só lê continua com ela travada, e com a faixa de leitura)
  await p.waitForFunction(() => !document.querySelector('[inert] ol.artes') || !!document.querySelector('.faixa-leitura'), null, { timeout: 20000 });
}

/** O texto do parágrafo `i`, sem o cursor do colega (a barra com o nome dele, que fica dentro do parágrafo). */
const textoDoParagrafo = (i) => {
  const par = document.querySelectorAll('.texto p')[i];
  if (!par) return '';
  const c = par.cloneNode(true);
  c.querySelectorAll('.collaboration-cursor__caret').forEach((x) => x.remove());
  return c.textContent;
};
const paragrafo = (p, i) => p.evaluate(textoDoParagrafo, i);
/** Põe o cursor no fim do parágrafo `i` do texto, com um clique, como a pessoa faria. */
async function cursorNoFim(p, i) {
  const par = p.locator('.texto p').nth(i);
  await par.click();
  await p.keyboard.press('End');
}

/** Nada de faixa colorida na borda esquerda, no texto e no cadeado. */
async function semUnha(p, onde) {
  const unhas = await p.evaluate(() =>
    [...document.querySelectorAll('.corpo, .corpo *, .cadeado-do-texto, .cadeado-do-texto *')]
      .map((el) => {
        const cs = getComputedStyle(el);
        const borda = parseFloat(cs.borderLeftWidth) >= 2 && cs.borderLeftStyle !== 'none' && parseFloat(cs.borderRightWidth) < parseFloat(cs.borderLeftWidth);
        const sombra = /inset\s+[1-9]\d*px\s+0/.test(cs.boxShadow) || /\b[1-9]\d*px 0px 0px 0px[^,]*inset/.test(cs.boxShadow);
        return borda || sombra ? `${el.tagName.toLowerCase()}.${el.className}` : null;
      })
      .filter(Boolean),
  );
  assert.deepEqual(unhas, [], `${onde}: sem "unha"`);
}

const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(700);
  await p.locator('.folha').screenshot({ path: join(CAPTURAS, `${nome}.png`) });
  await p.locator('.cadeado-do-texto').screenshot({ path: join(CAPTURAS, `${nome}-cadeado.png`) });
};

async function noComputador(navegador, s, tema) {
  const id = `cadeado-${tema}`;
  await semear(s.api, id);
  const video = CAPTURAS ? { recordVideo: { dir: join(CAPTURAS, `video-${tema}`), size: { width: 1440, height: 900 } } } : {};
  const lia = await abrir(navegador, s.url, LIA, id, { colorScheme: tema === 'escuro' ? 'dark' : 'light', ...video, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}) });
  const beto = await abrir(navegador, s.url, BETO, id, { colorScheme: tema === 'escuro' ? 'dark' : 'light' });
  const { p } = lia;
  const cadeado = p.locator('.cadeado-do-texto');

  // travado por padrão: o cadeado fechado; digitar não muda o texto e o cadeado chacoalha
  await cadeado.waitFor();
  assert.equal(await cadeado.getAttribute('aria-pressed'), 'false', 'o cadeado começa fechado');
  assert.match(await cadeado.innerText(), /Texto travado/);
  const antes = await paragrafo(p, 1);
  await cursorNoFim(p, 1);
  await p.keyboard.type(' TESTE');
  await p.waitForTimeout(200);
  assert.equal(await paragrafo(p, 1), antes, 'travado: digitar não muda o texto');
  assert.ok(Number(await cadeado.getAttribute('data-tentativas')) > 0, 'o cadeado chacoalha para mostrar onde se destrava');
  await semUnha(p, `${tema}, travado`);
  await capturar(p, `1-travado-${tema}`);

  // abre o cadeado: o texto destravado, com o fundo tingido; digitar e apagar mudam o texto
  await cadeado.click();
  assert.equal(await cadeado.getAttribute('aria-pressed'), 'true', 'o cadeado abre');
  assert.ok(await p.locator('.corpo.destravado').count(), 'o texto fica tingido, destravado');
  await cursorNoFim(p, 1);
  await p.keyboard.type(' AO VIVO');
  await p.keyboard.press('Backspace');
  await p.keyboard.press('Backspace');
  await p.keyboard.type('VO!');
  const novo = `${antes} AO VIVO!`;
  assert.equal(await paragrafo(p, 1), novo, 'destravado: digitar e apagar mudam o texto');
  // colar também passa. O colar usa o cursor que o editor já tem, e o editor só fica sabendo do clique quando o
  // navegador avisa que a seleção mudou: espera o Beto ver o cursor da Lia no 4º parágrafo, como a pessoa que olha o
  // cursor antes de colar, para o colar sintético não sair antes desse aviso (e cair no parágrafo anterior)
  await cursorNoFim(p, 3);
  await beto.p.waitForFunction(() => !!document.querySelectorAll('.texto p')[3]?.querySelector('.collaboration-cursor__caret'), null, { timeout: 10000 });
  await p.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', ' COLADO');
    document.querySelector('.texto').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await p.waitForFunction(`(${textoDoParagrafo})(3).endsWith(' COLADO')`, null, { timeout: 5000 });
  await semUnha(p, `${tema}, destravado`);
  await capturar(p, `2-destravado-${tema}`);

  // o colega na sala vê a mudança, e o texto salva no servidor
  await beto.p.waitForFunction(`(${textoDoParagrafo})(1) === ${JSON.stringify(novo)}`, null, { timeout: 10000 });
  assert.equal(await beto.p.locator('.cadeado-do-texto').getAttribute('aria-pressed'), 'false', 'o cadeado é de quem abriu: o do Beto continua fechado');
  await p.locator('.salvo.ok').waitFor({ timeout: 15000 });
  const salvoNoServidor = async () => JSON.stringify((await (await fetch(`${s.api}/roteiros/${id}`, { headers: { 'cf-access-authenticated-user-email': LIA } })).json()).doc).includes('AO VIVO!');
  for (let i = 0; i < 30 && !(await salvoNoServidor()); i++) await p.waitForTimeout(500);
  assert.ok(await salvoNoServidor(), 'o texto destravado salva no servidor');

  // fecha de novo: digitar volta a não mudar
  await cadeado.click();
  assert.equal(await cadeado.getAttribute('aria-pressed'), 'false', 'o cadeado fecha');
  await cursorNoFim(p, 1);
  await p.keyboard.type('X');
  await p.waitForTimeout(200);
  assert.equal(await paragrafo(p, 1), novo, 'travado de novo: digitar não muda');
  await capturar(p, `3-travado-de-novo-${tema}`);

  // abre, sai do roteiro e volta: está travado de novo
  await cadeado.click();
  await p.getByRole('button', { name: 'Voltar para os roteiros' }).click();
  await p.locator('.folha').waitFor({ state: 'detached', timeout: 10000 });
  await p.goto(`${s.url}#/r/${id}`);
  await esperarTexto(p);
  await cadeado.waitFor();
  assert.equal(await cadeado.getAttribute('aria-pressed'), 'false', 'ao voltar, o cadeado está fechado');
  await cursorNoFim(p, 1);
  await p.keyboard.type('X');
  await p.waitForTimeout(200);
  assert.equal(await paragrafo(p, 1), novo, 'ao voltar, travado: digitar não muda');

  // a Carla só lê: sem cadeado
  const carla = await abrir(navegador, s.url, CARLA, id, { colorScheme: tema === 'escuro' ? 'dark' : 'light' });
  await carla.p.locator('.faixa-leitura').waitFor();
  assert.equal(await carla.p.locator('.cadeado-do-texto').count(), 0, 'quem só lê não vê o cadeado');

  for (const x of [lia, beto, carla]) assert.deepEqual(x.erros, [], `${tema}: erros na página`);
  const caminhoDoVideo = CAPTURAS ? await p.video()?.path() : null;
  for (const x of [lia, beto, carla]) await x.ctx.close();
  if (caminhoDoVideo) renameSync(caminhoDoVideo, join(CAPTURAS, `cadeado-${tema}.webm`));
}

/** No celular o texto continua de leitura, e o cadeado fica de fora. */
async function noCelular(navegador, s) {
  const id = 'cadeado-celular';
  await semear(s.api, id);
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13']; // eslint-disable-line no-unused-vars
  const { ctx, p, erros } = await abrir(navegador, s.url, LIA, id, iphone);
  assert.equal(await p.locator('.cadeado-do-texto').count(), 0, 'no celular, sem cadeado');
  assert.equal(await p.locator('.texto').getAttribute('contenteditable'), 'false', 'no celular, o texto é de leitura');
  assert.deepEqual(erros, [], 'celular: erros na página');
  await ctx.close();
}

async function principal() {
  // no modo privado, o compartilhamento decide quem edita e quem só lê (no aberto, toda a equipe edita)
  const s = await subir({ env: { ACESSO: 'privado' } });
  const navegador = await chromium.launch();
  try {
    await noComputador(navegador, s, 'claro');
    await noComputador(navegador, s, 'escuro');
    await noCelular(navegador, s);
    console.log('ok: o cadeado da revisão (travado por padrão, destravar e digitar, a sala ao vivo, travado ao voltar), no claro e no escuro');
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
