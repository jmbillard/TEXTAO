// Ponta a ponta da lista das artes que recolhe e do "/comentario" que pergunta qual dos dois, rodado à parte do vitest:
// `npm run e2e:artes-recolher`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros sobre um Teable
// falso (a Marina é redatora pelo e-mail). Nomes, servidores e textos fictícios.
//
// A lista das artes (a folha de escrita): o cabeçalho "N artes" recolhe e abre; recolhida, sobra a pílula com o número e
// a folha ganha a largura. O Ctrl+Alt+A também. Ao recarregar, continua como a pessoa deixou (as preferências). O modo
// limpo esconde a lista. A revisão (um roteiro da Marina na fila) usa a mesma peça e a mesma escolha: chega recolhida e
// abre do mesmo jeito. No celular, a lista desce para baixo da folha e recolhe também. No escuro e com o movimento
// reduzido, sem "unha" e sem ✓ verde.
//
// Quem só lê: o rodapé e o "?" sem os atalhos de escrever (/, Tab, Ctrl+U), com o Ctrl+Alt+M e o "?".
//
// O "/comentario": abre a escolha "Recado para… edição / produção / arte" ou "Comentário sobre o texto". O recado vira o
// trecho do tipo (edição, produção ou o recado para a arte); o comentário abre o fio (#192) no trecho.
//
// Com CAPTURAS=pasta, grava as capturas (densidade 2) e o vídeo do recolher (computador, claro).
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:artes-recolher
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:artes-recolher');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const MARINA = 'marina.teles@exemplo.com';
const DAVI = 'davi.rocha@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [{ nome: 'Programa Fictício', chaves: ['CHAMADA'], categoria: 'variedades' }], redatores: ['Marina Teles'], editores: ['Caio Brandão'], pauta: [] };

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
/** Nenhum item com faixa colorida na borda esquerda (a "unha"). */
async function semUnha(p, onde) {
  const unhas = await p.evaluate(() =>
    [...document.querySelectorAll('.artes-que-recolhem, .artes-que-recolhem *, .menu *, .popover *')].filter((e) => {
      const c = getComputedStyle(e);
      const borda = parseFloat(c.borderLeftWidth) >= 3 && c.borderLeftStyle !== 'none' && c.borderLeftColor !== c.borderTopColor;
      const sombra = /inset\s+([3-9]|\d{2,})px\s+0/.test(c.boxShadow);
      return borda || sombra;
    }).map((e) => e.className),
  );
  assert.deepEqual(unhas, [], `${onde}: nada de unha`);
}
const capturar = async (p, nome, espera = 500) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(espera);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
};
const salvou = (p) => p.waitForSelector('.escrita-salvo[data-salvamento="salvo"]', { timeout: 8000 });
const tipos = (p) => p.locator('.texto-escrita > p').evaluateAll((ps) => ps.map((x) => `${x.dataset.tipo}${x.dataset.confirmado === 'true' ? '' : '?'}`));
const devagar = { delay: 10 };
/** Como a lista está: recolhida (o atributo), a largura dela, a altura do corpo e a largura da folha. */
const comoEsta = (p, folha = '.folha-escrita') =>
  p.evaluate((folha) => {
    const l = [...document.querySelectorAll('.artes-que-recolhem')].find((e) => e.getBoundingClientRect().width > 0);
    if (!l) return null;
    return {
      recolhida: l.hasAttribute('data-recolhida'),
      expandida: l.querySelector('.cab-que-recolhe').getAttribute('aria-expanded'),
      largura: Math.round(l.getBoundingClientRect().width),
      corpo: Math.round(l.querySelector('.artes-dobra').getBoundingClientRect().height),
      raio: getComputedStyle(l).borderTopLeftRadius,
      numero: l.querySelector('.cab-que-recolhe b').textContent.replace(/\s+/g, ' ').trim(),
      folha: Math.round(document.querySelector(folha)?.getBoundingClientRect().width ?? 0),
    };
  }, folha);
/** Espera a dobra terminar (a transição é de 0,36 s). */
const assentar = (p) => p.waitForTimeout(600);
const preferencia = async (api, email) => ((await (await fetch(`${api}/eu`, { headers: { 'cf-access-authenticated-user-email': email } })).json()).preferencias ?? {})['artes.recolhida'];

async function recolherNaFolha(navegador, s) {
  const video = CAPTURAS ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: { width: 1440, height: 900 } } } : {};
  const { ctx, p, erros } = await entrar(navegador, s.url, '#/redator', MARINA, { viewport: { width: 1440, height: 900 }, colorScheme: 'light', ...video });
  await p.waitForSelector('.roteiros-escritos');
  await p.click('.novo-roteiro');
  await p.waitForFunction(() => document.activeElement?.closest('.texto-escrita') !== null);
  const id = /#\/roteiros\/([\w-]+)$/.exec(p.url())[1];
  await p.keyboard.type('NESTE SÁBADO, A BRASA DECIDE.', devagar);
  await p.keyboard.press('Enter');
  await p.keyboard.type('/arte', devagar);
  await p.keyboard.press('Enter');
  await p.keyboard.type('Cartela: SÁBADO, 22H', devagar);
  await p.keyboard.press('Enter');
  await p.keyboard.type('/arte', devagar);
  await p.keyboard.press('Enter');
  await p.keyboard.type('Logo do Desafio da Brasa', devagar);
  await salvou(p);
  await p.waitForSelector('.artes-da-escrita .arte-da-escrita >> nth=1');

  const aberta = await comoEsta(p);
  assert.equal(aberta.recolhida, false, 'sem escolha, a lista fica aberta');
  assert.equal(aberta.expandida, 'true');
  assert.equal(aberta.numero, '2 artes');
  await semUnha(p, 'a lista aberta');
  await capturar(p, '01-folha-lista-aberta');

  // o clique no cabeçalho recolhe: sobra a pílula, e a folha ganha a largura
  await p.click('.artes-da-escrita .cab-que-recolhe');
  await p.waitForTimeout(150);
  await capturar(p, '02-recolhendo', 0);
  await assentar(p);
  const recolhida = await comoEsta(p);
  assert.equal(recolhida.recolhida, true, 'recolheu');
  assert.equal(recolhida.expandida, 'false');
  assert.equal(recolhida.corpo, 0, 'o corpo dobrou');
  assert.ok(recolhida.largura < 140, `a pílula é estreita (${recolhida.largura}px)`);
  assert.equal(recolhida.raio, '999px', 'é uma pílula');
  assert.equal(recolhida.numero, '2 artes', 'com o número das artes');
  assert.ok(recolhida.folha > aberta.folha + 100, `a folha ganhou o espaço (${aberta.folha} → ${recolhida.folha})`);
  assert.equal(await p.locator('.artes-da-escrita .artes-dobra[inert]').count(), 1, 'o corpo recolhido sai do Tab e do leitor de tela');
  await semUnha(p, 'a pílula');
  await semCheckVerde(p, 'a pílula');
  await capturar(p, '03-folha-lista-recolhida');
  // a escolha ficou guardada no servidor, para a pessoa
  await p.waitForFunction(() => true);
  for (let i = 0; i < 20 && (await preferencia(s.api, MARINA)) !== true; i++) await p.waitForTimeout(100);
  assert.equal(await preferencia(s.api, MARINA), true, 'o servidor guardou a escolha');
  assert.equal(await preferencia(s.api, LIA), undefined, 'só a da Marina');

  // o Ctrl+Alt+A abre e recolhe de novo, também com o cursor no texto
  await p.locator('.texto-escrita p').first().click();
  await p.keyboard.press('Control+Alt+a');
  await assentar(p);
  assert.equal((await comoEsta(p)).recolhida, false, 'o atalho abriu');
  assert.ok((await comoEsta(p)).corpo > 40, 'o corpo voltou');
  assert.deepEqual(await tipos(p), ['locucao?', 'arte', 'arte'], 'o atalho não mexeu no texto');
  await p.keyboard.press('Control+Alt+a');
  await assentar(p);
  assert.equal((await comoEsta(p)).recolhida, true, 'o atalho recolheu');
  for (let i = 0; i < 20 && (await preferencia(s.api, MARINA)) !== true; i++) await p.waitForTimeout(100);

  // o atalho no cartão "?"
  await p.evaluate(() => document.activeElement?.blur());
  await p.click('.botao-atalhos');
  await p.waitForSelector('.atalhos-cartao');
  assert.match(await p.locator('.atalhos-cartao').innerText(), /Ctrl\+Alt\+A\s+Recolhe ou mostra a lista das artes/);
  await capturar(p, '04-atalhos');
  await p.keyboard.press('Escape');

  // ao recarregar, continua recolhida
  await p.reload();
  await p.waitForSelector('.artes-da-escrita');
  await assentar(p);
  assert.equal((await comoEsta(p)).recolhida, true, 'depois de recarregar, continua recolhida');

  // o modo limpo esconde a lista (recolhida ou aberta)
  await p.locator('.texto-escrita p').first().click();
  await p.keyboard.press('Control+Shift+l');
  await p.waitForSelector('.pagina-escrita.limpo');
  await assentar(p);
  assert.equal(await p.locator('.artes-da-escrita').isVisible(), false, 'o modo limpo esconde a lista');
  await p.keyboard.press('Control+Shift+l');
  await p.waitForSelector('.pagina-escrita:not(.limpo)');

  // o "/comentario" pergunta qual dos dois
  await perguntaQualDosDois(p);

  // abre de novo pelo clique na pílula, para o vídeo terminar com a lista à vista
  await p.click('.artes-da-escrita .cab-que-recolhe');
  await assentar(p);
  assert.equal((await comoEsta(p)).recolhida, false);
  for (let i = 0; i < 20 && (await preferencia(s.api, MARINA)) !== false; i++) await p.waitForTimeout(100);
  await p.click('.artes-da-escrita .cab-que-recolhe');
  await assentar(p);
  for (let i = 0; i < 20 && (await preferencia(s.api, MARINA)) !== true; i++) await p.waitForTimeout(100);
  assert.deepEqual(erros, []);
  const v = p.video();
  await ctx.close();
  if (v && CAPTURAS) renameSync(await v.path(), join(CAPTURAS, 'video', 'recolher-as-artes.webm'));
  return id;
}

/** O "/comentario" na folha: a escolha do recado (edição, produção, arte) ou do comentário sobre o texto. */
async function perguntaQualDosDois(p) {
  const fim = async () => {
    await p.locator('.texto-escrita p').last().click();
    await p.keyboard.press('End');
    // o clique na arte abre o balão dela: fecha, para a escolha ficar sozinha
    await p.keyboard.press('Escape');
  };
  // o recado para a edição: o trecho vira do tipo edição
  await fim();
  await p.keyboard.press('Enter');
  await p.keyboard.type('Abrir no plano da grelha', devagar);
  await p.keyboard.press('Home');
  await p.keyboard.type('/comentario', devagar);
  await p.waitForSelector('.menu-da-barra [data-comando="comentario"]');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.menu-do-comentario');
  const opcoes = await p.locator('.menu-do-comentario .menu-item').allInnerTexts();
  assert.equal(opcoes.length, 4, 'as quatro escolhas');
  assert.match(opcoes[0], /edição/);
  assert.match(opcoes[1], /produção/);
  assert.match(opcoes[2], /arte/);
  assert.match(opcoes[3], /Comentário sobre o texto/);
  assert.match(await p.locator('.menu-do-comentario').innerText(), /Recado para…/i);
  await semUnha(p, 'a escolha do /comentario');
  await semCheckVerde(p, 'a escolha do /comentario');
  await capturar(p, '05-comentario-escolha');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.menu-do-comentario', { state: 'detached' });
  assert.equal((await tipos(p)).at(-1), 'edicao', 'o recado para a edição é o trecho de edição');
  assert.equal(await p.locator('.texto-escrita p').last().innerText(), 'Abrir no plano da grelha', 'o "/comentario" saiu do texto');

  // o recado para a arte, pelo número
  await fim();
  await p.keyboard.press('Enter');
  await p.keyboard.type('A cartela entra com o logo novo', devagar);
  await p.keyboard.type(' /coment', devagar);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.menu-do-comentario');
  await p.keyboard.press('3');
  await p.waitForSelector('.menu-do-comentario', { state: 'detached' });
  assert.equal((await tipos(p)).at(-1), 'comentario', 'o recado para a arte');
  assert.match(await p.locator('.margem-dos-tipos .tipo-na-margem').last().innerText(), /RECADO/);

  // o recado para a produção, pela seta
  await fim();
  await p.keyboard.press('Enter');
  await p.keyboard.type('Providenciar a grelha de 2 metros', devagar);
  await p.keyboard.type(' /recado', devagar);
  await p.waitForSelector('.menu-da-barra [data-comando="comentario"]');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.menu-do-comentario');
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Enter');
  assert.equal((await tipos(p)).at(-1), 'producao', 'o recado para a produção');

  // o Esc fecha a escolha sem mudar o trecho
  await fim();
  await p.keyboard.type(' /comentario', devagar);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.menu-do-comentario');
  await p.keyboard.press('Escape');
  await p.waitForSelector('.menu-do-comentario', { state: 'detached' });
  assert.equal((await tipos(p)).at(-1), 'producao');

  // o comentário sobre o texto: abre o fio no trecho (o balão do #192)
  await p.locator('.texto-escrita p').first().click();
  await p.keyboard.press('End');
  await p.keyboard.type(' /comentario', devagar);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.menu-do-comentario');
  await p.locator('.menu-do-comentario .menu-item', { hasText: 'Comentário sobre o texto' }).click();
  await p.waitForSelector('.comentario-trecho');
  const balao = p.locator('.balao-do-comentario, .comentario-novo, [class*="comentario"] textarea').first();
  await balao.waitFor();
  assert.equal((await p.locator('.texto-escrita p').first().innerText()).trim(), 'NESTE SÁBADO, A BRASA DECIDE.', 'o "/comentario" saiu do texto');
  assert.match(await p.locator('.comentario-trecho').first().innerText(), /NESTE SÁBADO, A BRASA DECIDE/, 'o trecho todo fica grifado');
  await capturar(p, '06-comentario-sobre-o-texto');
  await p.keyboard.type('Dá para trocar "decide" por "manda"?', devagar);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.escrita-comentar-conta');
  await salvou(p);
}

/** A revisão de um roteiro da Marina: a mesma lista, com a mesma escolha (chega recolhida) e o mesmo jeito de abrir. */
async function recolherNaRevisao(navegador, s) {
  const P = (...partes) => ({
    type: 'paragraph',
    content: partes.map((x) => (typeof x === 'string' ? { type: 'text', text: x } : { type: 'text', text: x.a, marks: [{ type: 'arte', attrs: { id: x.id, subtipo: '', sugerido: false } }] })),
  });
  const doc = { type: 'doc', content: [P('LOC: NESTE SÁBADO, O PALCO É DE QUEM CANTA.'), P({ a: 'LOGO DO FESTIVAL FICTÍCIO', id: 'c1' }), P({ a: 'SÁBADO, DEPOIS DO JORNAL', id: 'c2' }), P('LOC: DOZE VOZES, UMA SÓ FINAL.'), P({ a: 'CARTELA FINAL', id: 'c3' })] };
  const d = new Date();
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 4);
  const iso = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
  const meta = { claquete: `CHAMADA_FESTIVAL_${String(dia.getDate()).padStart(2, '0')}/${String(dia.getMonth() + 1).padStart(2, '0')}`, titulo: 'Festival', programa: 'Programa Fictício', tipoPrograma: 'variedades', dataExibicao: iso, capitulo: null, edicao: '', praca: 'RJ', redator: 'Marina Teles', editor: 'Caio Brandão', locutor: '', selo: '', duracaoAlvoSeg: 30, duracaoModo: 'fechar', layout: 'padrao', status: 'rascunho' };
  const agora = new Date().toISOString();
  const id = 'rev-artes-recolher';
  const r = await fetch(`${s.api}/roteiros/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'cf-access-authenticated-user-email': MARINA }, body: JSON.stringify({ roteiro: { id, meta, doc, revisao: 1, criadoEm: agora, atualizadoEm: agora }, nArtes: 3 }) });
  assert.ok(r.ok, `semear a revisão: ${r.status}`);

  const { ctx, p, erros } = await entrar(navegador, s.url, `#/r/${id}`, MARINA, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await p.waitForSelector('.texto u.arte[data-id="c3"]', { timeout: 45000 });
  await p.waitForSelector('.lado .artes-que-recolhem');
  await assentar(p);
  const recolhida = await comoEsta(p, '.folha');
  assert.equal(recolhida.recolhida, true, 'a revisão chega com a mesma escolha da folha (recolhida)');
  assert.equal(recolhida.numero, '3 artes');
  assert.equal(recolhida.corpo, 0);
  assert.equal(recolhida.raio, '999px', 'a mesma pílula');
  await semUnha(p, 'a pílula da revisão');
  await semCheckVerde(p, 'a pílula da revisão');
  await capturar(p, '07-revisao-recolhida');
  // abre pelo cabeçalho, do mesmo jeito
  await p.click('.lado .cab-que-recolhe');
  await assentar(p);
  const aberta = await comoEsta(p, '.folha');
  assert.equal(aberta.recolhida, false, 'abriu');
  assert.ok(aberta.corpo > 60, 'com as artes à vista');
  assert.equal(await p.locator('.lado .artes-que-recolhem ol.artes li').count(), 3);
  await capturar(p, '08-revisao-aberta');
  // e o Ctrl+Alt+A recolhe também aqui
  await p.keyboard.press('Control+Alt+a');
  await assentar(p);
  assert.equal((await comoEsta(p, '.folha')).recolhida, true, 'o atalho recolhe na revisão');
  for (let i = 0; i < 20 && (await preferencia(s.api, MARINA)) !== true; i++) await p.waitForTimeout(100);
  assert.equal(await preferencia(s.api, MARINA), true);
  await p.click('.botao-atalhos');
  assert.match(await p.locator('.atalhos-cartao').innerText(), /Ctrl\+Alt\+A\s+Recolhe ou mostra a lista das artes/);
  await p.keyboard.press('Escape');
  assert.deepEqual(erros, []);
  await ctx.close();
}

/** Quem só lê (o Davi, da arte, sem papel de escrita): o rodapé e o "?" sem os atalhos de escrever, com o comentar. */
async function soLendo(navegador, s, id) {
  const { ctx, p, erros } = await entrar(navegador, s.url, `#/roteiros/${id}`, DAVI, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await p.waitForSelector('.escrita-so-lendo');
  await p.waitForSelector('.rodape-da-escrita');
  const rodape = await p.locator('.rodape-da-escrita .atalhos-da-escrita').innerText();
  assert.doesNotMatch(rodape, /comandos|confirma ou troca o tipo|Ctrl\+U/, 'só lendo, sem os atalhos de escrever');
  assert.match(rodape, /Ctrl\+Alt\+M\s+comenta/, 'quem lê comenta');
  assert.match(rodape, /\?\s+atalhos/);
  await capturar(p, '13-so-lendo-rodape');
  await p.click('.botao-atalhos');
  await p.waitForFunction(() => /Ler o roteiro/i.test(document.querySelector('.atalhos-cartao')?.textContent ?? ''));
  const cartao = await p.locator('.atalhos-cartao').textContent();
  assert.match(cartao, /Ler o roteiro/i);
  assert.match(cartao, /Ctrl\+Alt\+M/);
  assert.match(cartao, /Ctrl\+Alt\+A/);
  assert.doesNotMatch(cartao, /Comandos: \/locucao|Tab|Ctrl\+U/, 'o "?" só lendo, sem os atalhos de escrever');
  await capturar(p, '14-so-lendo-atalhos');
  await p.keyboard.press('Escape');
  assert.doesNotMatch(await p.locator('.artes-da-escrita').innerText(), /Ctrl\+U/, 'a lista das artes também, sem o Ctrl+U');
  // e a lista das artes recolhe para ele também (a escolha é dele: começa aberta)
  assert.equal((await comoEsta(p)).recolhida, false);
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function noEscuroSemMovimento(navegador, s, id) {
  const { ctx, p, erros } = await entrar(navegador, s.url, `#/roteiros/${id}`, MARINA, { viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  await p.waitForSelector('.artes-da-escrita');
  await p.waitForTimeout(300);
  assert.equal((await comoEsta(p)).recolhida, true);
  // sem movimento, a troca é direta: sem esperar a dobra
  await p.click('.artes-da-escrita .cab-que-recolhe');
  await p.waitForTimeout(60);
  assert.ok((await comoEsta(p)).corpo > 40, 'com o movimento reduzido, abre direto');
  await semUnha(p, 'no escuro');
  await semCheckVerde(p, 'no escuro');
  await capturar(p, '09-escuro-aberta', 200);
  await p.click('.artes-da-escrita .cab-que-recolhe');
  await p.waitForTimeout(60);
  assert.equal((await comoEsta(p)).corpo, 0, 'com o movimento reduzido, recolhe direto');
  await capturar(p, '10-escuro-recolhida', 200);
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function noCelular(navegador, s, id) {
  for (const [tema, sufixo] of [['light', 'claro'], ['dark', 'escuro']]) {
    const { ctx, p, erros } = await entrar(navegador, s.url, `#/roteiros/${id}`, MARINA, { ...devices['iPhone 13'], colorScheme: tema });
    await p.waitForSelector('.folha-escrita .texto-escrita p');
    await p.locator('.artes-da-escrita').scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    const recolhida = await comoEsta(p);
    assert.equal(recolhida.recolhida, true, 'no celular, a mesma escolha');
    assert.equal(recolhida.raio, '999px', 'a pílula embaixo da folha');
    await semRolagemDeLado(p, `a pílula no celular (${sufixo})`);
    await capturar(p, `11-celular-recolhida-${sufixo}`);
    await p.locator('.artes-da-escrita .cab-que-recolhe').tap();
    await assentar(p);
    assert.ok((await comoEsta(p)).corpo > 40, 'no celular, abre embaixo da folha');
    await semRolagemDeLado(p, `a lista no celular (${sufixo})`);
    await p.locator('.artes-da-escrita').scrollIntoViewIfNeeded();
    await capturar(p, `12-celular-aberta-${sufixo}`);
    await p.locator('.artes-da-escrita .cab-que-recolhe').tap();
    await assentar(p);
    for (let i = 0; i < 20 && (await preferencia(s.api, MARINA)) !== true; i++) await p.waitForTimeout(100);
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
    for (const email of [LIA, MARINA, DAVI]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
    const id = await recolherNaFolha(navegador, s);
    console.log('✔ a folha: recolher e abrir pelo cabeçalho e pelo Ctrl+Alt+A, a pílula, a folha mais larga, o "?", recarregar e o modo limpo');
    console.log('✔ o "/comentario": recado para a edição, a produção e a arte, o Esc e o comentário sobre o texto (o fio)');
    await recolherNaRevisao(navegador, s);
    console.log('✔ a revisão: a mesma pílula e a mesma escolha, abre e recolhe igual');
    await soLendo(navegador, s, id);
    console.log('✔ só lendo: o rodapé e o "?" sem os atalhos de escrever, com o comentar');
    await noEscuroSemMovimento(navegador, s, id);
    console.log('✔ no escuro, com o movimento reduzido');
    await noCelular(navegador, s, id);
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
