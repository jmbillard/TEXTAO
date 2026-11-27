// Ponta a ponta da entrada da aba Filmes no celular (spec #55, ticket #80), rodado à parte do vitest:
// `npm run e2e:filmes`.
//
// Sobe o servidor e o Vite como o e2e do tour (banco temporário, dados fictícios), com a leitura por IA e o Postgres do
// Teable falsos: nada sai para a rede. Gera prévias fictícias em PDF (pôsteres de uma cor só, títulos inventados) e, em
// tamanho de iPhone e de Android, sobe cada uma pelo "Subir prévia" e acompanha a ficha dela: cada página passa por
// "subindo", "na fila", "lendo" e "lida", e "pode fechar a aba" aparece quando tudo chegou ao servidor. No iPhone, a
// primeira subida cai no meio (a página 2 não chega, como a aba fechando): a ficha diz o que falta, e subir o mesmo PDF
// de novo só manda a página que faltou. No fim, a ficha mostra o andamento (páginas lidas, prontos, com pergunta) e quem
// mais está na prévia, e tocar nela abre a revisão: a sequência de filmes (#81), as sessões próprias por data e depois a
// Sessão da Tarde, arrastada com o dedo (o arrasto que não passa da metade volta; o que passa, ou o gesto rápido, troca de
// filme), com a imagem de cima deslizando entre pôsteres da mesma página e esmaecendo entre páginas (sem movimento, só
// esmaece) e a barra "1/4" fixa embaixo. Os alvos têm 44px e a página não rola para o lado. Com CAPTURAS=<pasta>,
// guarda as telas nos temas claro e escuro, e a entrada do computador (que não muda).
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:filmes
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const zlib = require('node:zlib');
const { subir } = require('./tour.e2e.cjs');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:filmes');
  process.exit(2);
}

const RAIZ = join(__dirname, '..', '..');
const LIA = 'lia.moraes@exemplo.com';
const BRUNO = 'bruno.teixeira@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
/** O Postgres do Teable falso, com os nomes de tabela inventados dos testes de tests/filmes.test.ts. */
// as tabelas no Postgres vêm do Teable (#76): o Teable de mentira da descoberta tem estas, com estes nomes
const PG = { TEABLE_PG_URL: 'postgres://teste', TEABLE_PG_ESQUEMA: 'bse_teste', TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'token-falso' };
const NO_POSTGRES = { filmes: 'filmes_teste', exibicoes: 'exibicoes_teste', ARTES_acervo: 'acervo_teste' };
const ENV = { N8N_FILMES_LER: 'http://n8n.falso/webhook/ler-pagina', FILMES_INTERVALO_MS: '0', ...PG };
/** O banco de filmes fictício: o Kong bate (pronto), o Corvo tem dois candidatos (qual filme?) e o Rivais, outro ano. */
const BANCO = [
  { __id: 'recKong01', titulo: 'Kong - A Ilha da Caveira', ano_de_producao: 2017 },
  { __id: 'recCorvo94', titulo: 'O Corvo', ano_de_producao: 1994 },
  { __id: 'recCorvo24', titulo: 'O Corvo', ano_de_producao: 2024 },
  { __id: 'recRivais1', titulo: 'Rivais', ano_de_producao: 2024 },
];
const consultar = async (sql) => (sql.includes('"filmes_teste"') ? BANCO : []);

/* ---------- a prévia fictícia em PDF ---------- */
/** Um PNG de uma cor só (o pôster fictício). */
function png(w, h, [r, g, b]) {
  const pedaco = (tipo, dados) => {
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo), dados]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(corpo));
    return Buffer.concat([tam, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const linha = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const pixels = zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => linha)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', ihdr), pedaco('IDAT', pixels), pedaco('IEND', Buffer.alloc(0))]);
}
const CORES = [[176, 52, 40], [32, 92, 150], [60, 120, 70], [120, 70, 140]];
/**
 * Uma prévia fictícia: a capa, as páginas úteis (cada uma com os pôsteres e o título embaixo de cada um) e a
 * contracapa. `paginas` é a lista dos títulos de cada página útil.
 */
async function pdfDaPrevia(paginas, marca) {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const capa = (texto) => doc.addPage([842, 595]).drawText(texto, { x: 60, y: 300, size: 28, font: fonte });
  capa(`PREVIA FICTICIA ${marca}`);
  for (const [k, titulos] of paginas.entries()) {
    const pg = doc.addPage([842, 595]);
    pg.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(0.09, 0.13, 0.23) });
    pg.drawText(`SEMANA FICTICIA ${marca} - PAGINA ${k + 1}`, { x: 40, y: 550, size: 14, font: fonte, color: rgb(1, 1, 1) });
    for (const [i, titulo] of titulos.entries()) {
      const imagem = await doc.embedPng(png(8, 12, CORES[(i + k) % CORES.length]));
      const x = 60 + i * 190;
      pg.drawImage(imagem, { x, y: 250, width: 120, height: 180 });
      pg.drawText(titulo, { x, y: 230, size: 10, font: fonte, color: rgb(1, 1, 1) });
    }
  }
  capa('FIM');
  return Buffer.from(await doc.save());
}

/* ---------- a leitura por IA falsa: segura cada página até o teste soltar ---------- */
function leituraFalsa(filmesDaPagina) {
  const esperando = [];
  const lidas = [];
  const buscar = async (endereco, init = {}) => {
    if (endereco !== ENV.N8N_FILMES_LER) throw new Error(`o teste não sai para a rede: ${endereco}`);
    const n = Number(init.body.get('original_page_number'));
    const nome = String(init.body.get('original_file_name'));
    await new Promise((ok) => esperando.push({ n, nome, ok }));
    lidas.push({ n, nome });
    const movies = filmesDaPagina(nome, n);
    return { ok: true, status: 200, text: async () => JSON.stringify({ movies }) };
  };
  /** Espera a leitura de uma página começar (a página está "lendo") e a solta. */
  const soltar = async () => {
    for (let t = Date.now(); !esperando.length; ) {
      if (Date.now() - t > 30000) throw new Error('nenhuma página chegou à leitura');
      await new Promise((ok) => setTimeout(ok, 50));
    }
    esperando.shift().ok();
  };
  return { buscar, soltar, lidas, esperando };
}

/** O que a leitura falsa devolve de cada página (pela prévia e pelo número da página no PDF). */
const FILMES = {
  'PREVIA_FILMES_FICTICIA_A.pdf': {
    2: [
      { titulo: 'KONG: ILHA DA CAVEIRA', ano_de_producao: 2017, sessao: 'SUPERCINE', data: '05/12/2026' },
      { titulo: 'O CORVO', sessao: 'TELA QUENTE', data: '07/12/2026' },
    ],
    3: [
      { titulo: 'RIVAIS', ano_de_producao: 2023, sessao: 'CORUJÃO', data: '08/12/2026' },
      { titulo: 'FILME INEDITO FICTICIO', ano_de_producao: 2026, inedito: true, sessao: 'SUPERCINE', data: '12/12/2026' },
    ],
  },
  'PREVIA_FILMES_FICTICIA_B.pdf': {
    2: [{ titulo: 'KONG: ILHA DA CAVEIRA', ano_de_producao: 2017, sessao: 'SUPERCINE', data: '19/12/2026' }],
    3: [{ titulo: 'RIVAIS', ano_de_producao: 2023, sessao: 'CORUJÃO', data: '20/12/2026' }],
    4: [{ titulo: 'FILME INEDITO FICTICIO', ano_de_producao: 2026, inedito: true, sessao: 'SUPERCINE', data: '21/12/2026' }],
  },
};
const filmesDaPagina = (nome, n) => (FILMES[nome]?.[n] ?? []).map((f) => ({ inedito: false, ano_de_producao: null, ...f }));

/* ---------- o navegador ---------- */
const aparelho = (nome) => {
  const { deviceScaleFactor, ...resto } = devices[nome];
  return resto;
};

/**
 * Abre a aba Filmes no aparelho. As páginas que sobem (PUT) passam pelo `plano`: 'segurar' prende o pedido até o teste
 * soltar (para ver a página "subindo"), 'derrubar' faz o pedido cair (como a aba fechando no meio da subida).
 */
async function abrirNoCelular(navegador, url, nome, opcoes = {}) {
  const ctx = await navegador.newContext({ ...aparelho(nome), extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, ...opcoes });
  const subidas = [];
  const plano = new Map();
  const presos = new Map();
  await ctx.route(/\/api\/filmes\/previas\/[^/]+\/paginas\/\d+$/, async (r) => {
    if (r.request().method() !== 'PUT') return r.continue();
    const n = Number(/(\d+)$/.exec(new URL(r.request().url()).pathname)[1]);
    subidas.push(n);
    const o = plano.get(n);
    plano.delete(n);
    if (o === 'derrubar') return r.abort('connectionreset');
    if (o === 'segurar') await new Promise((ok) => presos.set(n, ok));
    return r.continue();
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/filmes`);
  await p.getByRole('button', { name: 'Subir prévia' }).waitFor({ timeout: 30000 });
  /** Solta a página presa assim que o pedido dela chegar. */
  const soltarSubida = async (n) => {
    for (let t = Date.now(); !presos.has(n); ) {
      if (Date.now() - t > 30000) throw new Error(`a página ${n} não chegou a subir`);
      await p.waitForTimeout(50);
    }
    presos.get(n)();
    presos.delete(n);
  };
  return { ctx, p, erros, subidas, plano, soltarSubida };
}

/** A página não rola para o lado. */
async function semRolagemDeLado(p, onde) {
  const [largura, conteudo] = await p.evaluate(() => [innerWidth, document.documentElement.scrollWidth]);
  assert.ok(conteudo <= largura, `${onde}: a página rola para o lado (${conteudo} > ${largura})`);
}

/** Os alvos de toque à vista têm pelo menos 44px de altura e de largura. */
async function alvosDe44(p, onde) {
  const pequenos = await p.evaluate(() =>
    [...document.querySelectorAll('.pagina.filmes button, .pagina.filmes [role="button"]')]
      .map((b) => ({ r: b.getBoundingClientRect(), t: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40) }))
      .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
      .map(({ r, t }) => `${t} (${Math.round(r.width)}×${Math.round(r.height)})`),
  );
  assert.deepEqual(pequenos, [], `${onde}: alvos menores que 44px`);
}

/** A ficha da prévia (pelo nome) e o estado de cada página dela. */
const ficha = (p, nome) => p.locator('.previa-celular').filter({ has: p.locator('b', { hasText: new RegExp(`^${nome}$`) }) });
const estadosDe = (f) => f.locator('.paginas-subida li').evaluateAll((lis) => lis.map((li) => li.dataset.estado));
async function esperarEstados(f, esperado, onde) {
  let visto;
  for (let t = Date.now(); Date.now() - t < 30000; ) {
    visto = await estadosDe(f).catch(() => null);
    if (JSON.stringify(visto) === JSON.stringify(esperado)) return;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  assert.deepEqual(visto, esperado, `${onde}: os estados das páginas`);
}

/** Guarda a tela nos dois temas, quando pedido (CAPTURAS=pasta). */
async function capturar(p, nome) {
  if (!CAPTURAS) return;
  for (const [tema, esquema] of [['claro', 'light'], ['escuro', 'dark']]) {
    await p.emulateMedia({ colorScheme: esquema });
    await p.waitForTimeout(250);
    await p.screenshot({ path: join(CAPTURAS, `${nome}-${tema}.png`) });
  }
  await p.emulateMedia({ colorScheme: 'light' });
}

const arquivo = (name, buffer) => ({ name, mimeType: 'application/pdf', buffer });

/**
 * iPhone: a subida que cai no meio e retoma. A página 2 (pág. 1 útil) sobe presa (vê-se "subindo") e vai para a
 * leitura (presa: "lendo"); a página 3 (pág. 2 útil) cai. A ficha diz o que falta. O mesmo PDF de novo só manda a
 * página 3, e a 2 continua lida.
 */
async function noIphone(navegador, s, leitura, pdf) {
  const nome = 'PREVIA_FILMES_FICTICIA_A';
  const { ctx, p, erros, subidas, plano, soltarSubida } = await abrirNoCelular(navegador, s.url, 'iPhone 13');
  await semRolagemDeLado(p, 'iPhone, a entrada vazia');
  await alvosDe44(p, 'iPhone, a entrada vazia');

  plano.set(2, 'segurar');
  plano.set(3, 'derrubar');
  await p.locator('input[type=file]').setInputFiles(arquivo(`${nome}.pdf`, pdf));
  const f = ficha(p, nome);
  await esperarEstados(f, ['subindo', 'esperando'], 'iPhone, a primeira página subindo');
  assert.match(await f.locator('.subida-estado').textContent(), /^Preparando a página 1 de 2$/);
  assert.ok(await p.getByRole('button', { name: 'Subir prévia' }).isDisabled(), 'o "Subir prévia" espera a subida terminar');
  await capturar(p, 'iphone-02-subindo');
  await soltarSubida(2);
  // a página 3 cai: a subida para, a 2 está na leitura (presa) e a 3 não chegou
  await esperarEstados(f, ['lendo', 'falta'], 'iPhone, a subida que caiu');
  assert.match(await f.locator('.subida-estado').textContent(), /^Falta 1 página: suba o mesmo PDF$/);
  assert.match(await f.locator('.paginas-subida li[data-estado="falta"] .est').textContent(), /não chegou/);
  await p.getByText(/Não deu para subir a prévia/).waitFor({ timeout: 10000 });
  await leitura.soltar();
  await esperarEstados(f, ['lida', 'falta'], 'iPhone, a página 1 lida');
  assert.match(await f.locator('.paginas-subida li').first().textContent(), /lida · 2 filmes/);
  await semRolagemDeLado(p, 'iPhone, com a página que falta');

  // de novo o mesmo PDF: só a página que faltou sobe; a lida fica lida
  plano.set(3, 'segurar');
  await p.locator('input[type=file]').setInputFiles(arquivo(`${nome}.pdf`, pdf));
  await esperarEstados(f, ['lida', 'subindo'], 'iPhone, subindo de novo');
  await soltarSubida(3);
  await esperarEstados(f, ['lida', 'lendo'], 'iPhone, a página que faltou na leitura');
  assert.match(await f.locator('.subida-estado').textContent(), /^Lendo no servidor · 1 de 2 lidas\s*pode fechar a aba$/);
  await capturar(p, 'iphone-03-lendo-pode-fechar');
  await leitura.soltar();
  assert.deepEqual(subidas, [2, 3, 3], 'subir de novo só manda a página que faltou');

  // tudo lido: a ficha volta a ser a da lista, com o andamento
  await f.locator('.andamento').waitFor({ timeout: 30000 });
  assert.equal((await f.locator('.andamento').innerText()).replace(/\s+/g, ' '), '2/2 páginas lidas 2 prontos 2 com pergunta');
  assert.match(await f.locator('.linha').textContent(), /^2 páginas · subida por .+ em \d\d\/\d\d$/);
  await semRolagemDeLado(p, 'iPhone, a lista');
  await alvosDe44(p, 'iPhone, a lista');
  return { ctx, p, erros, f };
}

/** Android: uma subida inteira de três páginas, com cada página passando de "subindo" a "lida". */
async function noAndroid(navegador, s, leitura, pdf) {
  const nome = 'PREVIA_FILMES_FICTICIA_B';
  const { ctx, p, erros, subidas, plano, soltarSubida } = await abrirNoCelular(navegador, s.url, 'Pixel 7');
  plano.set(2, 'segurar');
  await p.locator('input[type=file]').setInputFiles(arquivo(`${nome}.pdf`, pdf));
  const f = ficha(p, nome);
  await esperarEstados(f, ['subindo', 'esperando', 'esperando'], 'Android, a primeira página subindo');
  await soltarSubida(2);
  // as outras sobem sem esperar; a leitura segura a primeira ("lendo") e as outras esperam na fila
  await esperarEstados(f, ['lendo', 'fila', 'fila'], 'Android, tudo no servidor');
  assert.match(await f.locator('.subida-estado').textContent(), /pode fechar a aba$/);
  await capturar(p, 'android-02-lendo-pode-fechar');
  await leitura.soltar();
  await esperarEstados(f, ['lida', 'lendo', 'fila'], 'Android, a primeira lida');
  await leitura.soltar();
  await leitura.soltar();
  await f.locator('.andamento').waitFor({ timeout: 30000 });
  assert.equal((await f.locator('.andamento').innerText()).replace(/\s+/g, ' '), '3/3 páginas lidas 2 prontos 1 com pergunta');
  assert.deepEqual(subidas, [2, 3, 4]);
  await semRolagemDeLado(p, 'Android, a lista');
  await alvosDe44(p, 'Android, a lista');
  return { ctx, p, erros, f };
}

/* ---------- a sequência de filmes (#81) ---------- */
/** A prévia A em sequência: as sessões próprias por data (todas aqui), cada filme com a página dele. */
const SEQUENCIA_A = ['KONG: ILHA DA CAVEIRA', 'O CORVO', 'RIVAIS', 'FILME INEDITO FICTICIO'];

/**
 * Arrasta o dedo na faixa, de verdade (os toques passam pelo navegador e viram a rolagem nativa): `dx` em proporção da
 * largura (negativo vai para o próximo filme), em `passos` movimentos de `ms` cada. `segurando` roda com o dedo ainda
 * na tela, no fim do caminho.
 */
async function arrastar(p, dx, { passos = 12, ms = 30, segurando } = {}) {
  const cdp = await p.context().newCDPSession(p);
  const caixa = await p.locator('.sequencia-faixa').boundingBox();
  const y = caixa.y + caixa.height * 0.6;
  const x0 = caixa.x + caixa.width * (dx < 0 ? 0.85 : 0.15);
  const toque = (x) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: toque(x0) });
  for (let k = 1; k <= passos; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: toque(x0 + (dx * caixa.width * k) / passos) });
    await p.waitForTimeout(ms);
  }
  if (segurando) {
    await p.waitForTimeout(150);
    await segurando();
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await paradaNoFilme(p);
}

/** Espera a faixa parar encaixada num filme. */
async function paradaNoFilme(p) {
  let antes = -1;
  for (let t = Date.now(); Date.now() - t < 10000; ) {
    const { x, w } = await p.locator('.sequencia-faixa').evaluate((el) => ({ x: el.scrollLeft, w: el.clientWidth }));
    if (x === antes && Math.abs(x / w - Math.round(x / w)) < 0.01) return;
    antes = x;
    await p.waitForTimeout(120);
  }
  throw new Error('a faixa não parou num filme');
}

/** O filme à vista: a posição na barra e o título do card atual. */
async function filmeAVista(p) {
  await p.waitForTimeout(100);
  const posicao = (await p.locator('.sequencia-barra .posicao').textContent()).trim();
  const titulo = (await p.locator('.sequencia-item[aria-current] .cc-titulo').textContent()).trim();
  return [posicao, titulo];
}

/** A imagem de cima agora: o modo (desliza ou esmaece), a escala e o deslocamento da primeira camada, e a opacidade de cada uma. */
const imagemAgora = (p) =>
  p.locator('.sequencia-imagem').evaluate((el) => {
    const [a, b] = el.querySelectorAll('.camada');
    const m = new DOMMatrix(getComputedStyle(a.firstElementChild).transform);
    return { modo: el.dataset.modo, zoom: m.a, x: m.e, y: m.f, a: Number(a.style.opacity), b: Number(b.style.opacity) };
  });

/** iPhone: abrir a prévia pela lista e arrastar entre os filmes. */
async function naSequencia(p) {
  await p.locator('.sequencia-faixa').waitFor({ timeout: 30000 });
  assert.deepEqual(await filmeAVista(p), ['1/4', SEQUENCIA_A[0]]);
  const titulos = await p.locator('.sequencia-item .cc-titulo').allTextContents();
  assert.deepEqual(titulos, SEQUENCIA_A, 'a ordem: as sessões próprias por data');
  // a imagem de cima está ampliada no pôster do Kong, com o contorno à mão
  await p.waitForFunction(() => [...document.querySelectorAll('.sequencia-imagem img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  const parado = await imagemAgora(p);
  assert.ok(parado.zoom > 1.5, `a imagem amplia o pôster (zoom ${parado.zoom})`);
  assert.equal(await p.locator('.sequencia-imagem .camada').first().locator('.contorno').count(), 1, 'o contorno no pôster atual');
  await semRolagemDeLado(p, 'iPhone, a sequência');
  await alvosDe44(p, 'iPhone, a sequência');
  // a barra fica embaixo, colada na borda (com a margem do sistema, quando há)
  const barra = await p.locator('.sequencia-barra').boundingBox();
  assert.equal(Math.round(barra.y + barra.height), await p.evaluate(() => innerHeight), 'a barra fica embaixo');
  await capturar(p, 'iphone-04-sequencia');

  // o arrasto que não passa da metade volta; no meio do caminho, a imagem desliza até o próximo pôster (a mesma página)
  await arrastar(p, -0.35, {
    segurando: async () => {
      const meio = await imagemAgora(p);
      assert.equal(meio.modo, 'deslizar', 'na mesma página, a imagem desliza');
      assert.ok(Math.abs(meio.x - parado.x) > 10, `a imagem acompanha o dedo (${parado.x} → ${meio.x})`);
      assert.equal(meio.b, 0, 'deslizando, uma imagem só');
      if (CAPTURAS) await p.screenshot({ path: join(CAPTURAS, 'iphone-05-arrastando.png') });
    },
  });
  assert.deepEqual(await filmeAVista(p), ['1/4', SEQUENCIA_A[0]], 'o arrasto curto volta');
  // passou da metade: o próximo
  await arrastar(p, -0.6);
  assert.deepEqual(await filmeAVista(p), ['2/4', SEQUENCIA_A[1]], 'o arrasto que passa da metade troca de filme');
  // do Corvo (página 1) ao Rivais (página 2): a imagem esmaece entre as páginas
  await arrastar(p, -0.6, {
    segurando: async () => {
      const meio = await imagemAgora(p);
      assert.equal(meio.modo, 'esmaecer', 'entre páginas, a imagem esmaece');
      assert.ok(meio.a > 0.15 && meio.a < 0.85 && meio.b > 0.15 && meio.b < 0.85, `as duas páginas no meio do esmaecer (${meio.a}, ${meio.b})`);
    },
  });
  assert.deepEqual(await filmeAVista(p), ['3/4', SEQUENCIA_A[2]]);
  // o gesto rápido e curto troca de filme (um só, mesmo rápido)
  const [pos] = await filmeAVista(p);
  await arrastar(p, -0.22, { passos: 4, ms: 8 });
  const depois = await filmeAVista(p);
  assert.equal(Number(depois[0].split('/')[0]), Number(pos.split('/')[0]) + 1, `o gesto rápido troca de filme (${pos} → ${depois[0]})`);
  assert.deepEqual(depois, ['4/4', SEQUENCIA_A[3]]);
  await capturar(p, 'iphone-06-sequencia-pagina-2');
  // e volta, também com o gesto rápido
  await arrastar(p, 0.22, { passos: 4, ms: 8 });
  assert.deepEqual(await filmeAVista(p), ['3/4', SEQUENCIA_A[2]]);
  await semRolagemDeLado(p, 'iPhone, depois de arrastar');
}

/** Sem movimento (o sistema pede menos animação): até na mesma página, a imagem só esmaece. */
async function semMovimentoNaSequencia(navegador, url, id) {
  const ctx = await navegador.newContext({ ...aparelho('Pixel 7'), reducedMotion: 'reduce', extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/filmes/${encodeURIComponent(id)}`);
  await p.locator('.sequencia-faixa').waitFor({ timeout: 30000 });
  assert.deepEqual(await filmeAVista(p), ['1/4', SEQUENCIA_A[0]]);
  await arrastar(p, -0.6, {
    segurando: async () => {
      const meio = await imagemAgora(p);
      assert.equal(meio.modo, 'esmaecer', 'sem movimento, só esmaece');
      assert.ok(meio.b > 0, 'a próxima aparece esmaecendo');
    },
  });
  assert.deepEqual(await filmeAVista(p), ['2/4', SEQUENCIA_A[1]]);
  assert.deepEqual(erros, [], 'sem movimento: erros na página');
  await ctx.close();
}

async function principal() {
  if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  const pasta = mkdtempSync(join(tmpdir(), 'promeiro-e2e-previas-'));
  const { criarFilmes } = await import(join(RAIZ, 'servidor', 'filmes.mjs'));
  const leitura = leituraFalsa(filmesDaPagina);
  const { teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const s = await subir({ env: ENV, teable: teableFalso(NO_POSTGRES, { base: 'bse_teste' }), filmes: (env, deps) => criarFilmes(env, { ...deps, pasta, buscar: leitura.buscar, consultar }) });
  const navegador = await chromium.launch();
  try {
    const pdfA = await pdfDaPrevia([['KONG: ILHA DA CAVEIRA', 'O CORVO'], ['RIVAIS', 'FILME INEDITO FICTICIO']], 'A');
    const pdfB = await pdfDaPrevia([['KONG: ILHA DA CAVEIRA'], ['RIVAIS'], ['FILME INEDITO FICTICIO']], 'B');
    const iphone = await noIphone(navegador, s, leitura, pdfA);
    const android = await noAndroid(navegador, s, leitura, pdfB);

    // outra pessoa abre a prévia A no computador: a ficha dela, no celular, mostra quem está vendo
    const outro = await navegador.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'cf-access-authenticated-user-email': BRUNO } });
    const pc = await outro.newPage();
    await pc.goto(`${s.url}#/filmes`);
    await pc.locator('.ficha-previa', { hasText: 'PREVIA FILMES FICTICIA A' }).click();
    await pc.locator('.previa-cab').waitFor({ timeout: 30000 });
    for (const { p } of [iphone, android]) await ficha(p, 'PREVIA_FILMES_FICTICIA_A').locator('.gente .rubrica').waitFor({ timeout: 20000 });
    assert.match(await iphone.f.locator('.gente').textContent(), /Bruno tá vendo/);
    // a rubrica termina de se escrever antes da captura
    await iphone.p.waitForTimeout(2000);
    await capturar(iphone.p, 'iphone-01-lista');
    await capturar(android.p, 'android-01-lista');

    // tocar na ficha abre a sequência de filmes (#81): arrastar entre os filmes, com a imagem acompanhando
    await iphone.f.tap();
    await iphone.p.waitForFunction(() => /^#\/filmes\/.+/.test(location.hash), null, { timeout: 10000 });
    const idDaPrevia = decodeURIComponent((await iphone.p.evaluate(() => location.hash)).replace(/^#\/filmes\//, ''));
    await naSequencia(iphone.p);
    await semMovimentoNaSequencia(navegador, s.url, idDaPrevia);

    // o computador não muda: a entrada larga, com o "Solte aqui o PDF da prévia"
    await pc.goto(`${s.url}#/filmes`);
    await pc.getByText('Solte aqui o PDF da prévia').waitFor({ timeout: 30000 });
    assert.equal(await pc.locator('.previa-celular, .subir-previa').count(), 0, 'o computador não mostra a entrada do celular');
    await pc.waitForTimeout(800);
    if (CAPTURAS) await pc.screenshot({ path: join(CAPTURAS, 'computador-entrada.png') });

    assert.deepEqual(iphone.erros, [], 'iPhone: erros na página');
    assert.deepEqual(android.erros, [], 'Android: erros na página');
    await Promise.all([iphone.ctx.close(), android.ctx.close(), outro.close()]);
    console.log('ok: a aba Filmes no celular (iPhone 13 e Pixel 7): a subida, a retomada, o andamento e a sequência de filmes');
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
