// Ponta a ponta da edição abrindo o roteiro escrito pela Pauta (#197), rodado à parte do vitest:
// `npm run e2e:roteiro-pela-pauta`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o Teable falso
// (tests/fixtures/teable-falso.mjs): a pauta de hoje com a Novela Sinfonia e a Cozinha de Vó, fictícias, e a produção
// da arte das duas. A chefe (administradora, que começa roteiros) escreve o roteiro da Sinfonia, envia, e continua
// escrevendo depois do Enviar; a Produção da Sinfonia fica ligada à cópia do envio na fila (o que a carga faz pelo card).
// - A Eva (da edição, que só lê), no claro e no escuro: a ficha da Sinfonia na Pauta tem o "Roteiro" com o "Abrir o
//   roteiro"; a da Cozinha, sem roteiro escrito, não tem. O link abre o último envio (não o texto vivo), em leitura e já
//   nas colunas (vídeo | áudio), com a faixa que diz que é o envio; o timecode e o arquivo abrem o balão com o copiar,
//   e o copiar leva o caminho inteiro; ela seleciona o trecho e comenta (Ctrl+Alt+M), e o comentário vai para o
//   roteiro escrito (a autora vê pela API). O "Pauta" da barra volta à Pauta do mesmo dia.
// - A chefe pela Pauta: o mesmo envio, com "O texto de agora", que leva à folha de escrita.
// - No celular: a ficha e o envio, sem rolar para o lado. Claro e escuro, sem "unha" e sem ✓ verde.
//
// Nomes, e-mails e ids fictícios. Precisa do Playwright com o Chromium, instalado globalmente:
// NODE_PATH=$(npm root -g) npm run e2e:roteiro-pela-pauta
// Com CAPTURAS=pasta, grava as capturas (densidade 2) e o vídeo da Eva.
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:roteiro-pela-pauta');
  process.exit(2);
}

const CHEFE = 'chefe.ficticia@exemplo.com';
const EVA = 'eva.manha@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };
const ID = 'escrito-sinfonia-e2e';
const LARGA = { width: 1440, height: 960 };

const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const mais = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diaMes = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
const sp = (iso, h) => new Date(`${iso}T${h}:00-03:00`).toISOString();
const SINFONIA = `Novela Sinfonia ${diaMes(mais(hoje, 1))}`;
const COZINHA = `Cozinha de Vó ${diaMes(mais(hoje, 1))}`;
const CAMINHO = '\\\\servidor\\promo\\sinfonia\\abertura_cidade.mov';

const naPauta = (id, claquete) => ({ id, fields: { claquete, key: claquete.toUpperCase(), editor: { id: 'recEdEva', title: 'Eva Manhã' }, data: sp(hoje, '00:00'), expediente_inicio: sp(hoje, '06:00'), expediente_fim: sp(hoje, '15:00'), anotacao: null, alterado_em: sp(hoje, '08:00') } });
const PAUTA = [naPauta('recPtSinfonia', SINFONIA), naPauta('recPtCozinha', COZINHA)];
const ARTE = [
  { id: 'recArteSinf', fields: { card_ID: '', claquete: SINFONIA, status: '["PRODUZINDO"]', entregue: false, arquivado: false, designers: '["Dora Lima"]', artes: 'A SINFONIA | AMANHÃ, 21H', praca: null, filme: null, data_entrada: sp(mais(hoje, -1), '10:00') } },
  { id: 'recArteCoz', fields: { card_ID: '', claquete: COZINHA, status: '["PRODUZINDO"]', entregue: false, arquivado: false, designers: '["Dora Lima"]', artes: 'VINHETA', praca: null, filme: null, data_entrada: sp(mais(hoje, -1), '10:00') } },
];

const par = (texto, tipo) => ({ type: 'paragraph', attrs: { tipo, confirmado: true }, content: [{ type: 'text', text: texto }] });
const arte = (texto) => ({ type: 'paragraph', attrs: { tipo: 'arte', confirmado: true }, content: [{ type: 'text', text: texto, marks: [{ type: 'arte', attrs: { id: 'a1', subtipo: '' } }] }] });
const ENVIADO = {
  type: 'doc',
  content: [
    par('Praça da Sé, de manhã', 'locacao'),
    par(`Abre no 00:12:41:08 do bruto, ${CAMINHO}`, 'edicao'),
    arte('A SINFONIA'),
    par('NESTE SÁBADO, A CIDADE VIRA ORQUESTRA.', 'locucao'),
    par('TRILHA: cordas sobem', 'trilha'),
  ],
};
const VIVO = { type: 'doc', content: [par('UM TEXTO NOVO, AINDA NÃO ENVIADO.', 'locucao')] };

async function entrar(navegador, url, hash, email, opcoes = {}, nomeDoVideo = '') {
  const tam = opcoes.viewport ?? LARGA;
  const video = CAPTURAS && nomeDoVideo ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: tam } } : {};
  const ctx = await navegador.newContext({ viewport: LARGA, extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes, ...video });
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
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(450);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
};
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
const semCheckVerde = async (p, onde) => assert.deepEqual(await checksVerdes(p), [], `${onde}: nada de ✓ verde`);
async function semUnha(p, onde) {
  const unhas = await p.evaluate(() =>
    [...document.querySelectorAll('.folha-escrita *, .escrita-barra *, .escrita-so-lendo, .pauta-ficha *')].filter((e) => {
      const c = getComputedStyle(e);
      const borda = parseFloat(c.borderLeftWidth) >= 3 && c.borderLeftStyle !== 'none' && c.borderLeftColor !== c.borderTopColor;
      const sombra = /inset\s+([3-9]|\d{2,})px\s+0/.test(c.boxShadow);
      return borda || sombra;
    }).map((e) => e.className),
  );
  assert.deepEqual(unhas, [], `${onde}: nada de unha`);
}
const fundoEscuro = (p) =>
  p.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return r + g + b < 200;
  });
const cardDe = (p, texto) => p.locator('.pauta-item', { has: p.locator('.pauta-texto', { hasText: texto }) }).first();
/** Seleciona o trecho no texto, como a pessoa faria com o mouse. */
async function selecionar(p, trecho) {
  await p.evaluate((t) => {
    const andar = document.createTreeWalker(document.querySelector('.texto-escrita'), NodeFilter.SHOW_TEXT);
    for (let n = andar.nextNode(); n; n = andar.nextNode()) {
      const i = n.data.indexOf(t);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + t.length);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      return;
    }
    throw new Error(`não achei "${t}" no texto`);
  }, trecho);
  await p.waitForTimeout(80);
}
/** Abre a ficha da claquete no Dia da Pauta. */
async function abrirFicha(p, claquete) {
  await p.locator('.pauta-colunas').waitFor({ timeout: 15000 });
  await cardDe(p, claquete).locator('.pauta-claquete-botao').click();
  const ficha = p.getByRole('dialog', { name: claquete });
  await ficha.waitFor();
  await p.waitForTimeout(450);
  return ficha;
}
const noEnvio = (p) => p.waitForSelector('.folha-escrita:not(.chegando) .texto-escrita', { timeout: 15000 });

async function aEdicaoPelaPauta(navegador, url, api, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const eva = await entrar(navegador, url, `#/pauta/dia/${hoje}`, EVA, { colorScheme: tema, permissions: ['clipboard-read', 'clipboard-write'] }, tema === 'light' ? 'edicao-pela-pauta-claro' : '');
  const { p } = eva;
  assert.equal(await fundoEscuro(p), tema === 'dark', `o tema ${nome}`);
  // a Cozinha não tem roteiro escrito: a ficha não tem o link
  const cozinha = await abrirFicha(p, COZINHA);
  assert.equal(await cozinha.locator('.pauta-ficha-roteiro').count(), 0, 'sem roteiro escrito, sem o link');
  await p.keyboard.press('Escape');
  await p.locator('.card-aberto-camada').waitFor({ state: 'detached' });

  // a Sinfonia tem: o "Roteiro", antes da produção da arte
  const ficha = await abrirFicha(p, SINFONIA);
  const roteiro = ficha.locator('.pauta-ficha-roteiro');
  await roteiro.waitFor();
  assert.match(await roteiro.innerText(), /Escrito no PROMeiro[\s\S]*o último envio, em colunas/);
  const link = roteiro.getByRole('link', { name: 'Abrir o roteiro' });
  assert.equal(await link.getAttribute('href'), `#/roteiros/${ID}/envio`);
  await semUnha(p, `a ficha no ${nome}`);
  await semCheckVerde(p, `a ficha no ${nome}`);
  await capturar(p, `01-ficha-com-roteiro-${nome}`);
  await link.click();

  // o último envio: em leitura, já nas colunas, com a faixa do envio
  await noEnvio(p);
  assert.equal(new URL(p.url()).hash, `#/roteiros/${ID}/envio`);
  assert.equal(await p.locator('.texto-escrita').getAttribute('data-visao'), 'colunas', 'abre nas colunas');
  assert.equal(await p.locator('.escrita-ver [role="radio"][aria-checked="true"]').innerText(), 'Colunas');
  await p.waitForSelector('.cabeca-das-colunas');
  assert.equal(await p.locator('.texto-escrita').getAttribute('contenteditable'), 'false', 'só de leitura');
  assert.equal(await p.locator('.folha-escrita-titulo').getAttribute('readonly'), '');
  assert.match(await p.locator('.escrita-do-envio').innerText(), /lendo o último envio[\s\S]*a versão que vale para a edição[\s\S]*Selecione um trecho para comentar/);
  assert.match(await p.locator('.folha-escrita-sobre').textContent(), new RegExp(`enviado · ${SINFONIA}`));
  const texto = await p.locator('.texto-escrita').innerText();
  assert.match(texto, /A CIDADE VIRA ORQUESTRA/, 'o texto do envio');
  assert.doesNotMatch(texto, /AINDA NÃO ENVIADO/, 'não o texto vivo');
  // cada trecho na coluna dele: a locação na linha inteira, a edição e a arte no vídeo, a locução e a trilha no áudio
  const colunas = await p.locator('.texto-escrita > p').evaluateAll((ps) => ps.map((x) => x.dataset.coluna));
  assert.deepEqual(colunas, ['linha', 'video', 'video', 'audio', 'audio']);
  // sem Enviar, sem visibilidade, sem a sala
  assert.equal(await p.locator('.escrita-enviar, .escrita-visibilidade, .escrita-ao-vivo').count(), 0);
  assert.equal(await p.locator('.escrita-voltar').innerText(), 'Pauta');
  await semUnha(p, `o envio no ${nome}`);
  await semCheckVerde(p, `o envio no ${nome}`);
  await semRolagemDeLado(p, `o envio no ${nome}`);
  await capturar(p, `02-envio-em-colunas-${nome}`);

  // o timecode e o arquivo abrem o balão com o copiar
  await p.locator('.ficha-do-texto-timecode').click();
  const balaoDoTc = p.locator('.balao-da-ficha[data-ficha="timecode"]');
  await balaoDoTc.waitFor();
  assert.match(await balaoDoTc.innerText(), /Timecode[\s\S]*00:12:41:08/i);
  await balaoDoTc.getByRole('button', { name: 'Copiar' }).click();
  await p.waitForFunction(() => document.querySelector('.balao-da-ficha button')?.textContent?.includes('Copiado'));
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), '00:12:41:08');
  await p.keyboard.press('Escape');
  await p.locator('.ficha-do-texto-arquivo:not(.ficha-do-texto-pasta)').click();
  const balaoDoArquivo = p.locator('.balao-da-ficha[data-ficha="arquivo"]');
  await balaoDoArquivo.waitFor();
  assert.equal(await balaoDoArquivo.locator('.balao-da-ficha-caminho').innerText(), CAMINHO);
  await capturar(p, `03-caminho-para-copiar-${nome}`);
  await balaoDoArquivo.getByRole('button', { name: 'Copiar o caminho' }).click();
  await p.waitForFunction(() => document.querySelector('.balao-da-ficha button')?.textContent?.includes('Copiado'));
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), CAMINHO, 'o caminho inteiro');
  await p.keyboard.press('Escape');

  // comentar o que ela vê: o comentário vai para o roteiro escrito
  const pedaco = tema === 'dark' ? 'A CIDADE VIRA ORQUESTRA' : 'NESTE SÁBADO';
  await selecionar(p, pedaco);
  await p.keyboard.press('Control+Alt+KeyM');
  await p.waitForSelector('.balao-comentario.escrevendo textarea');
  await p.keyboard.type(`Do envio (${nome}): o corte entra aqui?`, { delay: 8 });
  await p.keyboard.press('Enter');
  await p.waitForSelector('.balao-comentario[data-fio]');
  await capturar(p, `04-comentario-no-envio-${nome}`);
  const daAutora = await (await fetch(`${api}/roteiros/${ID}/comentarios`, { headers: { 'cf-access-authenticated-user-email': CHEFE } })).json();
  assert.ok(daAutora.comentarios.some((c) => c.texto === `Do envio (${nome}): o corte entra aqui?` && c.ancora.trecho === pedaco && c.autor.email === EVA), 'o comentário no escrito, sobre o texto que ela vê');

  // o "Pauta" volta ao mesmo dia
  await p.locator('.escrita-voltar').click();
  await p.locator('.pauta-colunas').waitFor();
  assert.equal(new URL(p.url()).hash, `#/pauta/dia/${hoje}`);
  assert.deepEqual(eva.erros, []);
  await fechar(eva);
  console.log(`ok (${nome}): a ficha da Pauta abre o último envio, em leitura e nas colunas, com o copiar e o comentar`);
}

async function aAutoraPelaPauta(navegador, url) {
  const chefe = await entrar(navegador, url, `#/pauta/dia/${hoje}`, CHEFE, { colorScheme: 'light' });
  const { p } = chefe;
  const ficha = await abrirFicha(p, SINFONIA);
  await ficha.getByRole('link', { name: 'Abrir o roteiro' }).click();
  await noEnvio(p);
  assert.doesNotMatch(await p.locator('.texto-escrita').innerText(), /AINDA NÃO ENVIADO/, 'a autora também lê o envio');
  // quem escreve tem o caminho para o texto de agora
  await p.locator('.escrita-ao-vivo').click();
  await p.waitForFunction((id) => location.hash === `#/roteiros/${id}`, ID);
  await p.waitForSelector('.folha-escrita:not(.chegando) .texto-escrita[contenteditable="true"]', { timeout: 15000 });
  await p.waitForFunction(() => /AINDA NÃO ENVIADO/.test(document.querySelector('.texto-escrita')?.textContent ?? ''));
  assert.deepEqual(chefe.erros, []);
  await fechar(chefe);
  console.log('ok: quem escreve lê o envio pela Pauta e vai ao texto de agora');
}

async function noCelular(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const eva = await entrar(navegador, url, `#/pauta/dia/${hoje}`, EVA, { ...iphone, colorScheme: tema });
  const { p } = eva;
  const ficha = await abrirFicha(p, SINFONIA);
  await ficha.locator('.pauta-ficha-roteiro').scrollIntoViewIfNeeded();
  await semRolagemDeLado(p, `a ficha no celular ${nome}`);
  await capturar(p, `05-ficha-celular-${nome}`);
  await ficha.getByRole('link', { name: 'Abrir o roteiro' }).click();
  await noEnvio(p);
  assert.equal(await p.locator('.texto-escrita').getAttribute('data-visao'), 'colunas');
  await semRolagemDeLado(p, `o envio no celular ${nome}`);
  await semUnha(p, `o envio no celular ${nome}`);
  await capturar(p, `06-envio-celular-${nome}`);
  assert.deepEqual(eva.erros, []);
  await fechar(eva);
  console.log(`ok (${nome}): no celular, a ficha e o envio sem rolar para o lado`);
}

async function principal() {
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const { comTabelas } = await import(join(RAIZ, 'servidor', 'tabelas-do-teable.mjs'));
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const registros = { EDICAO_producao: PAUTA, ARTE_producao: ARTE, designers: [{ id: 'recDesDora', fields: { designer: 'Dora Lima', email: 'dora.lima@exemplo.com', status: 'ativo' } }] };
  const teable = teableFalso({ EDICAO_producao: 'pauta_e2e', ARTE_producao: 'arte_e2e', designers: 'designers_e2e' }, { registros });
  const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
  const trello = { env: { ...PG, ...comTabelas({ ARTE_producao: 'arte_e2e' }) }, consultar: teable.consultar };
  const env = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, ...PG };
  const cadastros = criarCadastros(env, { buscar: teable });
  const s = await subir({ teable, pg: teable.abrirPg, trello, cadastros, env });
  const como = (email) => (caminho, init = {}) => fetch(`${s.api}${caminho}`, { ...init, headers: { 'content-type': 'application/json', 'cf-access-authenticated-user-email': email, ...init.headers } });
  const chefe = como(CHEFE);
  assert.equal((await chefe('/producoes/recarregar', { method: 'POST' })).status, 200, 'a carga das Produções');
  for (const email of [CHEFE, EVA]) await como(email)('/eu/tour', { method: 'POST' });

  // a chefe escreve, envia e continua escrevendo; a Produção da Sinfonia fica ligada à cópia do envio
  assert.equal((await chefe('/roteiros-escritos', { method: 'POST', body: JSON.stringify({ id: ID, titulo: 'A cidade vira orquestra' }) })).status, 201);
  const salvar = async (doc) => {
    const r = await (await chefe(`/roteiros/${ID}`)).json();
    assert.equal((await chefe(`/roteiros/${ID}`, { method: 'PUT', body: JSON.stringify({ roteiro: { ...r, doc }, nArtes: 1 }) })).status, 200);
  };
  await salvar(ENVIADO);
  const escrito = await (await chefe(`/roteiros/${ID}`)).json();
  const enviou = await chefe(`/roteiros-escritos/${ID}/enviar`, { method: 'POST', body: JSON.stringify({ roteiro: { meta: { ...escrito.meta, claquete: SINFONIA, programa: 'Sinfonia' }, doc: escrito.doc }, copia: 'envio-sinfonia-e2e', motivo: 'primeira' }) });
  assert.equal(enviou.status, 201, 'o Enviar');
  await salvar(VIVO);
  s.db.prepare("UPDATE producoes SET roteiro_id = 'envio-sinfonia-e2e' WHERE claquete = ?").run(SINFONIA);

  const navegador = await chromium.launch();
  let falhou = false;
  try {
    for (const tema of ['light', 'dark']) await aEdicaoPelaPauta(navegador, s.url, s.api, tema);
    await aAutoraPelaPauta(navegador, s.url);
    for (const tema of ['light', 'dark']) await noCelular(navegador, s.url, tema);
  } catch (e) {
    falhou = true;
    console.error(e);
  } finally {
    await navegador.close();
    await s.descer();
  }
  process.exit(falhou ? 1 : 0);
}
void principal();
