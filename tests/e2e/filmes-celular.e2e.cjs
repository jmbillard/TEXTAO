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
// esmaece) e a barra "1/4" fixa embaixo. Responder no card (#82): as perguntas tocáveis gravam a mesma mudança do
// computador, a marca nova aparece e a sequência anda sozinha (só se a pessoa ainda estiver no filme); o título se
// corrige num campo de 16px; o filme da Sessão da Tarde sobe pelo "Subir para a vaga"; o link do card do Trello; e a
// presença dos dois lados, com o Bruno no computador. A página inteira (#83): um toque na imagem mostra a página do
// filme atual inteira, com ele contornado e os pendentes com o círculo menor; o pôster leva ao filme, o toque fora volta;
// e o filme sem pôster mostra a página inteira com a nota "sem pôster". A tela final (#84): depois do último filme, o
// resumo ("N prontos · M com pergunta", quantos já estão no Trello, as pendências tocáveis que voltam ao filme) e o
// Enviar, que leva só os prontos de todas as páginas ao Trello falso; o resultado em cada filme (enviando, enviado e o
// erro com o motivo, que vai de novo no próximo Enviar). Os alvos têm 44px e a página não rola para o lado. Com CAPTURAS=<pasta>,
// guarda as telas nos temas claro e escuro, e a entrada do computador (que não muda). Por último, a prévia que chega
// por e-mail (#157): o n8n falso manda o PDF com o token, a lista mostra "prévia nova · chegou por e-mail" e abrir prepara.
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
/** O token da prévia que chega por e-mail (#157): inventado, como o resto. */
const TOKEN_DA_PREVIA = 'token-da-previa-ficticio';
const ENV = { N8N_FILMES_LER: 'http://n8n.falso/webhook/ler-pagina', FILMES_INTERVALO_MS: '0', FILMES_PREVIA_TOKEN: TOKEN_DA_PREVIA, ...PG };
/** O banco de filmes fictício: o Kong bate (pronto), o Corvo tem dois candidatos (qual filme?) e o Rivais, outro ano. O
    filme de cima da prévia C já tem card no Trello (a exibição na mesma sessão e no mesmo dia). */
const BANCO = [
  { __id: 'recKong01', titulo: 'Kong - A Ilha da Caveira', ano_de_producao: 2017 },
  { __id: 'recCorvo94', titulo: 'O Corvo', ano_de_producao: 1994 },
  { __id: 'recCorvo24', titulo: 'O Corvo', ano_de_producao: 2024 },
  { __id: 'recRivais1', titulo: 'Rivais', ano_de_producao: 2024 },
  { __id: 'recCimaFic1', titulo: 'Filme de Cima Ficticio', ano_de_producao: 2020 },
];
const LINK_DO_CARD = 'https://trello.com/c/cardFicticio1';
const EXIBICOES = [
  { filme: { id: 'recCimaFic1', title: 'Filme de Cima Ficticio (2020)' }, sessao: { id: 'recSesFic01', title: 'SUPERCINE' }, data_de_exibicao: '2027-01-09T03:00:00.000Z', card_ID: 'cardFicticio1', link: LINK_DO_CARD, labels: null },
];
// o dia da exibição em Brasília, como o filtro por data da consulta faz no Postgres
const diaDe = (e) => new Date(e.data_de_exibicao).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const consultar = async (sql, params = []) =>
  sql.includes('"filmes_teste"') ? BANCO : sql.includes('"exibicoes_teste"') ? EXIBICOES.filter((e) => (params[0] ?? []).includes(diaDe(e))) : [];

/* ---------- o Trello falso (e a escrita no Teable que o envio faz) ---------- */
/** As variáveis do envio dos filmes, com ids inventados: a lista dos filmes e as tabelas do cadastro e das exibições. */
const ENV_TRELLO = {
  ...ENV,
  TRELLO_KEY: 'chave-falsa',
  TRELLO_TOKEN: 'token-falso',
  TRELLO_LISTA_FILMES: 'listaFilmesFalsa',
  TEABLE_FILMES: 'tblFilmesFalso',
  TEABLE_FILMES_POSTER: 'fldPosterFalso',
  TEABLE_EXIBICOES: 'tblExibicoesFalso',
};
/**
 * O Trello e o Teable falsos do envio, num fetch só: guardam os cards criados. `segurar()` prende a criação dos próximos
 * cards até o teste soltar (para ver o "enviando"); `recusar(trecho)` faz o Trello recusar o card cujo nome tem o trecho,
 * uma vez.
 */
function trelloFalso() {
  const cards = [];
  let preso = null;
  const recusados = new Set();
  let n = 0;
  const ok = (dados) => ({ ok: true, status: 200, json: async () => dados, text: async () => JSON.stringify(dados) });
  const buscar = async (endereco, init = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    if (url.origin === ENV_TRELLO.TEABLE_URL) {
      if (/\/uploadAttachment$/.test(url.pathname)) return ok({ id: url.pathname.split('/')[5], fields: { [ENV_TRELLO.TEABLE_FILMES_POSTER]: [{ name: 'poster.jpg', token: `tokFalso${++n}` }] } });
      const corpo = typeof init.body === 'string' ? JSON.parse(init.body) : {};
      return ok({ records: (corpo.records ?? [{}]).map((r) => ({ id: `recFalsoNovo${++n}`, fields: r.fields ?? {} })) });
    }
    if (url.host !== 'api.trello.com') throw new Error(`o teste não sai para a rede: ${endereco}`);
    const rota = url.pathname.replace(/^\/1/, '');
    if (rota === '/cards' && metodo === 'POST') {
      if (preso) await preso.promessa;
      const corpo = JSON.parse(init.body);
      const recusa = [...recusados].find((t) => corpo.name.includes(t));
      if (recusa) {
        recusados.delete(recusa);
        return { ok: false, status: 401, json: async () => ({}), text: async () => 'invalid token' };
      }
      const id = `cardFalso${++n}`;
      cards.push({ id, nome: corpo.name, lista: corpo.idList });
      return ok({ id, shortUrl: `https://trello.com/c/${id}` });
    }
    if (/^\/cards\/\w+\/checklists$/.test(rota)) return ok([]);
    return ok({ id: `x${++n}` });
  };
  const segurar = () => {
    let soltar;
    preso = { promessa: new Promise((ok) => (soltar = ok)) };
    return () => ((preso = null), soltar());
  };
  return { buscar, cards, segurar, recusar: (trecho) => recusados.add(trecho) };
}

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

/**
 * A prévia C, de uma página útil com as duas fileiras: em cima, o filme de cima (já no Trello) e o filme que a leitura
 * pôs por engano na Sessão da Tarde (o pôster dele está na fileira de cima: ele sobe para a vaga); embaixo, dois da
 * Sessão da Tarde.
 */
async function pdfDaTarde() {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const capa = (texto) => doc.addPage([842, 595]).drawText(texto, { x: 60, y: 300, size: 28, font: fonte });
  capa('PREVIA FICTICIA C');
  const pg = doc.addPage([842, 595]);
  pg.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(0.09, 0.13, 0.23) });
  pg.drawText('SEMANA FICTICIA C', { x: 40, y: 565, size: 14, font: fonte, color: rgb(1, 1, 1) });
  const fileiras = [
    [340, ['FILME DE CIMA FICTICIO', 'FILME LIDO NA TARDE']],
    [120, ['TARDE FICTICIA UM', 'TARDE FICTICIA DOIS']],
  ];
  for (const [k, [y, titulos]] of fileiras.entries())
    for (const [i, titulo] of titulos.entries()) {
      const x = 80 + i * 300;
      pg.drawImage(await doc.embedPng(png(8, 12, CORES[(i + 2 * k) % CORES.length])), { x, y, width: 100, height: 150 });
      pg.drawText(titulo, { x, y: y - 15, size: 10, font: fonte, color: rgb(1, 1, 1) });
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
    // o filme sem pôster (#83): o título dele não está na página, e a página tem um pôster só
    4: [
      { titulo: 'FILME INEDITO FICTICIO', ano_de_producao: 2026, inedito: true, sessao: 'SUPERCINE', data: '21/12/2026' },
      { titulo: 'FILME SEM POSTER FICTICIO', ano_de_producao: 2015, sessao: 'TELA QUENTE', data: '22/12/2026' },
    ],
  },
  // a que chega por e-mail (#157)
  'PREVIA_FILMES_FICTICIA_EMAIL.pdf': {
    2: [{ titulo: 'KONG: ILHA DA CAVEIRA', ano_de_producao: 2017, sessao: 'SUPERCINE', data: '02/01/2027' }],
    3: [{ titulo: 'RIVAIS', ano_de_producao: 2023, sessao: 'CORUJÃO', data: '03/01/2027' }],
  },
  'PREVIA_FILMES_FICTICIA_C.pdf': {
    2: [
      { titulo: 'FILME DE CIMA FICTICIO', ano_de_producao: 2020, sessao: 'SUPERCINE', data: '09/01/2027' },
      { titulo: 'FILME LIDO NA TARDE', ano_de_producao: 2019, sessao: 'SESSÃO DA TARDE', data: '10/01/2027' },
      { titulo: 'TARDE FICTICIA UM', ano_de_producao: 2018, sessao: 'SESSÃO DA TARDE', data: '11/01/2027' },
      { titulo: 'TARDE FICTICIA DOIS', ano_de_producao: 2017, sessao: 'SESSÃO DA TARDE', data: '12/01/2027' },
    ],
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
  assert.equal((await f.locator('.andamento').innerText()).replace(/\s+/g, ' '), '3/3 páginas lidas 3 prontos 1 com pergunta');
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

/* ---------- a página inteira (#83) ---------- */
/** Abre a página inteira com um toque na imagem de cima do filme à vista. */
async function abrirPaginaInteira(p) {
  await p.locator('.sequencia-item[aria-current]').getByRole('button', { name: 'Ver a página inteira' }).tap();
  const pi = p.getByRole('dialog', { name: 'A página inteira' });
  await pi.waitFor({ timeout: 5000 });
  return pi;
}
/** Os pôsteres da página inteira: o filme de cada um e a marca (atual, pendente ou nada). */
const marcasDa = (pi) => pi.locator('.pi-poster').evaluateAll((bs) => bs.map((b) => [b.getAttribute('aria-label'), b.dataset.papel]));
/** Toca fora dos pôsteres: no meio da tela, embaixo da página. */
async function tocarFora(p) {
  const { width, height } = p.viewportSize();
  await p.touchscreen.tap(width / 2, height * 0.75);
}

/**
 * iPhone, noutra aba na prévia A, parado no Kong (1/4): um toque na imagem mostra a página inteira, com o Kong contornado
 * e o Corvo (qual filme?) com o círculo menor. Tocar no pôster do Corvo leva até ele; tocar fora volta ao atual.
 */
async function naPaginaInteira(navegador, url, id) {
  const ctx = await navegador.newContext({ ...aparelho('iPhone 13'), extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/filmes/${encodeURIComponent(id)}`);
  await p.locator('.sequencia-faixa').waitFor({ timeout: 30000 });
  assert.deepEqual(await filmeAVista(p), ['1/4', SEQUENCIA_A[0]]);
  let pi = await abrirPaginaInteira(p);
  assert.deepEqual(await marcasDa(pi), [['KONG: ILHA DA CAVEIRA', 'atual'], ['O CORVO', 'pendente']]);
  assert.equal(await pi.locator('.contorno .circulo.atual').count(), 1, 'o atual contornado');
  assert.equal(await pi.locator('.pi-pendente .circulo.pendente').count(), 1, 'o pendente com o círculo');
  assert.equal(await pi.locator('.sem-poster').count(), 0, 'com pôster, sem a nota');
  // a página cabe inteira na janela de cima
  await pi.locator('img').evaluate((i) => i.decode());
  const [janela, folha] = await Promise.all([pi.locator('.pi-janela').boundingBox(), pi.locator('.pi-folha').boundingBox()]);
  assert.ok(folha.x >= janela.x - 1 && folha.x + folha.width <= janela.x + janela.width + 1, 'a página inteira cabe na largura');
  assert.ok(folha.y >= janela.y - 1 && folha.y + folha.height <= janela.y + janela.height + 1, 'a página inteira cabe na altura');
  await semRolagemDeLado(p, 'iPhone, a página inteira');
  await alvosDe44(p, 'iPhone, a página inteira');
  await p.waitForTimeout(400);
  await capturar(p, 'iphone-04b-pagina-inteira');
  // o pôster do Corvo leva até ele
  await pi.getByRole('button', { name: 'O CORVO' }).tap();
  await pi.waitFor({ state: 'detached', timeout: 5000 });
  await paradaNoFilme(p);
  assert.deepEqual(await filmeAVista(p), ['2/4', 'O CORVO'], 'o pôster leva ao filme dele');
  // de novo, e tocar fora: volta ao atual (o Corvo), sem andar
  pi = await abrirPaginaInteira(p);
  assert.deepEqual(await marcasDa(pi), [['KONG: ILHA DA CAVEIRA', 'outro'], ['O CORVO', 'atual']]);
  await tocarFora(p);
  await pi.waitFor({ state: 'detached', timeout: 5000 });
  assert.deepEqual(await filmeAVista(p), ['2/4', 'O CORVO'], 'o toque fora volta ao atual');
  assert.deepEqual(erros, [], 'a página inteira: erros na página');
  await ctx.close();
}

/**
 * Android, na prévia B: o filme sem pôster mostra a página inteira com a nota à mão "sem pôster", como aviso só (sem
 * pergunta); a página inteira dele também leva a nota.
 */
async function semPosterNoAndroid(p, f) {
  await f.tap();
  await p.locator('.sequencia-faixa').waitFor({ timeout: 30000 });
  assert.deepEqual(
    await p.locator('.sequencia-item .cc-titulo').allTextContents(),
    ['KONG: ILHA DA CAVEIRA', 'RIVAIS', 'FILME INEDITO FICTICIO', 'FILME SEM POSTER FICTICIO'],
  );
  const nota = p.locator('.sequencia-imagem .sem-poster');
  for (const k of [1, 2, 3]) {
    assert.equal(await nota.evaluateAll((ns) => ns.filter((n) => Number(n.style.opacity) > 0.5).length), 0, `${k}/4: com pôster, sem a nota`);
    await arrastar(p, -0.6);
  }
  assert.deepEqual(await filmeAVista(p), ['4/4', 'FILME SEM POSTER FICTICIO']);
  // a página inteira, com a nota à vista; aviso só: o card não pergunta nada e a marca é a do pronto
  const imagem = await imagemAgora(p);
  assert.ok(Math.abs(imagem.zoom - 1) < 0.01, `sem pôster, a página inteira (zoom ${imagem.zoom})`);
  assert.deepEqual(await nota.evaluateAll((ns) => ns.filter((n) => Number(n.style.opacity) > 0.5).map((n) => n.textContent)), ['sem pôster']);
  assert.equal(await cardNa(p, 3).locator('.cc-opcoes, .cc-explica').count(), 0, 'sem pôster não é pergunta');
  assert.equal(await cardNa(p, 3).locator('.ficha-marca').getAttribute('aria-label'), 'Pronto');
  await semRolagemDeLado(p, 'Android, sem pôster');
  await alvosDe44(p, 'Android, sem pôster');
  await capturar(p, 'android-09-sem-poster');
  // o toque na imagem: a página inteira com a nota, e o pôster do outro filme da página, sem marca
  const pi = await abrirPaginaInteira(p);
  assert.equal(await pi.locator('.sem-poster').textContent(), 'sem pôster');
  assert.deepEqual(await marcasDa(pi), [['FILME INEDITO FICTICIO', 'outro']]);
  await tocarFora(p);
  await pi.waitFor({ state: 'detached', timeout: 5000 });
  assert.deepEqual(await filmeAVista(p), ['4/4', 'FILME SEM POSTER FICTICIO']);
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

/* ---------- responder no card (#82) ---------- */
/** O card de um filme da sequência (pela posição, a partir de 0). */
const cardNa = (p, k) => p.locator('.sequencia-item').nth(k).locator('.card-celular');
/** As mudanças que o celular mandou ao servidor (o corpo de cada PATCH num filme), na ordem. */
function mudancasDe(p) {
  const corpos = [];
  p.on('request', (r) => {
    if (r.method() === 'PATCH' && /\/paginas\/\d+\/filmes\/\d+$/.test(new URL(r.url()).pathname)) corpos.push(JSON.parse(r.postData()));
  });
  return corpos;
}
/** A prévia como o servidor guarda (a mesma que o computador abre). */
const previaNoServidor = (p, id) => p.evaluate(async (id) => (await fetch(`/api/filmes/previas/${encodeURIComponent(id)}`)).json(), id);
/** Espera a sequência chegar a uma posição ("3/4") sozinha. */
async function esperarPosicao(p, posicao, onde) {
  await p.waitForFunction((alvo) => document.querySelector('.sequencia-barra .posicao')?.textContent.trim() === alvo, posicao, { timeout: 5000 }).catch(() => {});
  assert.equal((await p.locator('.sequencia-barra .posicao').textContent()).trim(), posicao, onde);
}

/**
 * iPhone, na prévia A (parado no Rivais, 3/4), com o Bruno no computador: a presença dos dois lados; "qual filme?"
 * respondido no card grava a mesma mudança do computador, a marca nova aparece e a sequência anda sozinha; a resposta
 * que chega quando a pessoa já saiu do filme não arrasta a sequência; o título corrigido no campo de 16px.
 */
async function responderNoCard(p, pc, id, mudancas) {
  // o Bruno abre o "qual filme?" do Corvo no computador: no celular, a bolinha dele e o Corvo grifado com a rubrica
  await pc.getByRole('button', { name: 'Qual filme?' }).click();
  await p.locator('.sequencia-gente .presente').first().waitFor({ timeout: 15000 });
  await cardNa(p, 1).locator('.rubrica', { hasText: 'Bruno tá vendo' }).waitFor({ timeout: 15000 });
  assert.ok(await cardNa(p, 1).evaluate((el) => el.classList.contains('ocupado')), 'o card do Corvo grifado na cor do Bruno');
  await arrastar(p, 0.6);
  assert.deepEqual(await filmeAVista(p), ['2/4', 'O CORVO']);
  // e o computador vê a Lia no Corvo (o filme à vista no celular)
  await pc.locator('.cartao-filme.ocupado', { hasText: 'O CORVO' }).locator('.rubrica', { hasText: 'Lia tá vendo' }).waitFor({ timeout: 15000 });
  // as opções do "qual filme?" no card: os dois candidatos com o pôster do banco e "outro filme (novo)"
  const opcoes = cardNa(p, 1).locator('.cc-opcoes button');
  assert.deepEqual((await opcoes.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), ['O Corvo 1994', 'O Corvo 2024', 'outro filme (novo)']);
  await alvosDe44(p, 'iPhone, as opções do card');
  await semRolagemDeLado(p, 'iPhone, as opções do card');
  await p.waitForTimeout(1500);
  await capturar(p, 'iphone-07-qual-filme');

  // tocar no candidato: a marca nova (✓) aparece no lugar, e a sequência anda sozinha para o Rivais
  await opcoes.first().tap();
  await cardNa(p, 1).locator('.ficha-marca[aria-label="Pronto"]').waitFor({ timeout: 10000 });
  assert.equal((await p.locator('.sequencia-barra .posicao').textContent()).trim(), '2/4', 'a marca nova aparece antes de andar');
  if (CAPTURAS) await p.screenshot({ path: join(CAPTURAS, 'iphone-08-respondido.png') });
  await esperarPosicao(p, '3/4', 'respondido, a sequência anda sozinha');
  await paradaNoFilme(p);
  assert.deepEqual(await filmeAVista(p), ['3/4', 'RIVAIS']);
  // gravou o mesmo que o computador grava: a escolha do candidato, e o computador vê o Corvo pronto na hora
  assert.deepEqual(mudancas, [{ filme: 'recCorvo94' }]);
  let previa = await previaNoServidor(p, id);
  assert.equal(previa.paginas[0].filmes[1].escolha.filme, 'recCorvo94');
  assert.equal(previa.paginas[0].filmes[1].conferencia.marca, 'ok');
  await pc.locator('.cartao-filme', { hasText: 'O CORVO' }).locator('.ficha-marca[aria-label="Pronto"]').waitFor({ timeout: 10000 });

  // o ano do Rivais, mas a pessoa volta ao Corvo antes da resposta chegar: grava, e a sequência não anda sozinha
  let soltar;
  const segura = new Promise((ok) => (soltar = ok));
  const filmeDoRivais = /\/paginas\/3\/filmes\/0$/;
  await p.route(filmeDoRivais, async (r) => (await segura, r.continue()));
  assert.deepEqual(await cardNa(p, 2).locator('.cc-opcoes button').allInnerTexts(), ['2023', '2024']);
  await cardNa(p, 2).getByRole('button', { name: '2024' }).tap();
  await arrastar(p, 0.6);
  assert.deepEqual(await filmeAVista(p), ['2/4', 'O CORVO']);
  soltar();
  await cardNa(p, 2).locator('.ficha-marca[aria-label="Pronto"]').waitFor({ timeout: 10000 });
  await p.waitForTimeout(1200);
  assert.deepEqual(await filmeAVista(p), ['2/4', 'O CORVO'], 'quem já saiu do filme não é levado embora');
  await p.unroute(filmeDoRivais);
  assert.deepEqual(mudancas, [{ filme: 'recCorvo94' }, { ano: 2024 }]);

  // o título se corrige no próprio card, num campo de 16px (o iPhone não amplia a tela)
  await arrastar(p, -0.6);
  await arrastar(p, -0.6);
  assert.deepEqual(await filmeAVista(p), ['4/4', 'FILME INEDITO FICTICIO']);
  await cardNa(p, 3).locator('.cc-titulo [role="button"]').tap();
  const campo = cardNa(p, 3).getByRole('textbox', { name: 'Título do filme' });
  assert.equal(await campo.evaluate((el) => getComputedStyle(el).fontSize), '16px', 'o campo do título tem 16px');
  await semRolagemDeLado(p, 'iPhone, corrigindo o título');
  await campo.fill('FILME INEDITO FICTICIO DOIS');
  await campo.press('Enter');
  await cardNa(p, 3).locator('.cc-titulo', { hasText: 'FILME INEDITO FICTICIO DOIS' }).waitFor({ timeout: 10000 });
  assert.deepEqual(mudancas, [{ filme: 'recCorvo94' }, { ano: 2024 }, { titulo: 'FILME INEDITO FICTICIO DOIS' }]);
  previa = await previaNoServidor(p, id);
  assert.deepEqual(previa.paginas[1].filmes.map((f) => [f.titulo, f.conferencia.marca]), [['RIVAIS', 'ok'], ['FILME INEDITO FICTICIO DOIS', 'ok']]);
  await pc.locator('.bolinha[aria-label="Página 2"]').click();
  await pc.locator('.cartao-filme', { hasText: 'FILME INEDITO FICTICIO DOIS' }).waitFor({ timeout: 10000 });
  await alvosDe44(p, 'iPhone, depois de responder');
}

/**
 * Android, na prévia C: o card da Sessão da Tarde reduzido; o filme de cima já no Trello, com o link do card; e o filme
 * lido por engano na Sessão da Tarde sobe pelo botão: "Subir para a vaga" mostra a vaga "???", e depois a sessão.
 */
async function naTarde(navegador, s, leitura, pdf) {
  const nome = 'PREVIA_FILMES_FICTICIA_C';
  const { ctx, p, erros } = await abrirNoCelular(navegador, s.url, 'Pixel 7');
  const mudancas = mudancasDe(p);
  await p.locator('input[type=file]').setInputFiles(arquivo(`${nome}.pdf`, pdf));
  await leitura.soltar();
  const f = ficha(p, nome);
  await f.locator('.andamento').waitFor({ timeout: 30000 });
  await f.tap();
  await p.locator('.sequencia-faixa').waitFor({ timeout: 30000 });
  const titulos = await p.locator('.sequencia-item .cc-titulo').allTextContents();
  assert.deepEqual(titulos, ['FILME DE CIMA FICTICIO', 'FILME LIDO NA TARDE', 'TARDE FICTICIA UM', 'TARDE FICTICIA DOIS'], 'a sessão própria, depois a Tarde');
  // o filme de cima já está no Trello: o link do card
  assert.equal(await cardNa(p, 0).getByRole('link', { name: 'Abrir o card no Trello' }).getAttribute('href'), LINK_DO_CARD);
  // a Tarde: só o pôster, o nome e a marca; o que não tem a vaga em cima não sobe
  for (const k of [1, 2]) {
    const card = cardNa(p, k);
    assert.ok(await card.evaluate((el) => el.classList.contains('tarde')), 'o card da Tarde é o reduzido');
    assert.equal(await card.locator('.cc-sessao, .cc-linha, .cc-artes').count(), 0, 'o card da Tarde não mostra sessão, ano, data nem artes');
    assert.equal(await card.locator('.ficha-marca').count(), 1, 'o card da Tarde tem a marca');
  }
  assert.equal(await cardNa(p, 2).getByRole('button', { name: 'Subir para a vaga' }).count(), 0, 'sem a vaga em cima, não sobe');

  await arrastar(p, -0.6);
  assert.deepEqual(await filmeAVista(p), ['2/4', 'FILME LIDO NA TARDE']);
  await semRolagemDeLado(p, 'Android, a Tarde');
  await alvosDe44(p, 'Android, a Tarde');
  await capturar(p, 'android-07-tarde');
  // o botão mostra a vaga "???"; tocada, o filme sobe (sem andar: agora ele pede a sessão)
  await cardNa(p, 1).getByRole('button', { name: 'Subir para a vaga' }).tap();
  await cardNa(p, 1).getByRole('button', { name: 'A vaga ??? do pôster dele em cima' }).tap();
  await cardNa(p, 1).locator('.cc-opcoes.sessao').waitFor({ timeout: 10000 });
  assert.ok(!(await cardNa(p, 1).evaluate((el) => el.classList.contains('tarde'))), 'subiu: o card deixa de ser o da Tarde');
  await p.waitForTimeout(1200);
  assert.deepEqual(await filmeAVista(p), ['2/4', 'FILME LIDO NA TARDE'], 'subir não anda: falta a sessão');
  await alvosDe44(p, 'Android, a sessão');
  await capturar(p, 'android-08-sessao');
  // a sessão escolhida responde: pronto, e a sequência anda sozinha
  await cardNa(p, 1).locator('.cc-opcoes.sessao button', { hasText: 'SUPERCINE' }).tap();
  await cardNa(p, 1).locator('.ficha-marca[aria-label="Pronto"]').waitFor({ timeout: 10000 });
  await esperarPosicao(p, '3/4', 'com a sessão, a sequência anda sozinha');
  assert.deepEqual(mudancas, [{ subir: true }, { sessao: 'SUPERCINE' }]);
  const previa = await (async () => {
    const id = decodeURIComponent((await p.evaluate(() => location.hash)).replace(/^#\/filmes\//, ''));
    return previaNoServidor(p, id);
  })();
  assert.deepEqual(
    previa.paginas[0].filmes.map((g) => [g.titulo, g.sessao, !!g.subiu]),
    [
      ['FILME DE CIMA FICTICIO', 'SUPERCINE', false],
      ['FILME LIDO NA TARDE', 'SUPERCINE', true],
      ['TARDE FICTICIA UM', 'SESSÃO DA TARDE', false],
      ['TARDE FICTICIA DOIS', 'SESSÃO DA TARDE', false],
    ],
  );
  assert.deepEqual(erros, [], 'Android, a Tarde: erros na página');
  await ctx.close();
}

/* ---------- a tela final e o Enviar (#84) ---------- */
/** A tela final à vista: a conta, o "no Trello", as pendências e o resultado do envio (o título e o estado de cada um). */
async function telaFinalAgora(p) {
  const fim = p.locator('.sequencia-fim');
  const texto = async (sel) => (await fim.locator(sel).innerText()).replace(/\s+/g, ' ').trim();
  return {
    conta: await texto('.sf-conta'),
    trello: await texto('.sf-trello'),
    pendencias: await fim.locator('.sf-pendencias .sf-titulo').allTextContents(),
    envio: await fim.locator('.sf-envio li').evaluateAll((lis) => lis.map((li) => [li.querySelector('.sf-titulo').textContent, li.dataset.estado])),
  };
}
const botaoEnviar = (p) => p.locator('.sequencia-fim .sf-enviar button');

/** iPhone, na prévia A (no último filme, 4/4): depois do último, o resumo; tudo respondido, nada com pergunta. */
async function naTelaFinal(p) {
  assert.deepEqual(await filmeAVista(p), ['4/4', 'FILME INEDITO FICTICIO DOIS']);
  await arrastar(p, -0.6);
  assert.equal((await p.locator('.sequencia-barra .posicao').textContent()).trim(), 'resumo', 'a barra diz "resumo" no fim');
  assert.equal(await p.locator('.sequencia-fim[aria-current]').count(), 1);
  assert.deepEqual(await telaFinalAgora(p), { conta: '4 prontos · 0 com pergunta', trello: 'nenhum no Trello ainda', pendencias: [], envio: [] });
  assert.equal((await botaoEnviar(p).innerText()).trim(), 'Enviar 4 prontos');
  assert.ok(await botaoEnviar(p).isEnabled());
  assert.equal(await p.locator('.sequencia-fim .sf-dica').count(), 0, 'nada com pergunta, nada fica para depois');
  // o Enviar fica embaixo, logo acima da barra, ao alcance do polegar
  const [botao, barra] = await Promise.all([botaoEnviar(p).boundingBox(), p.locator('.sequencia-barra').boundingBox()]);
  assert.ok(barra.y - (botao.y + botao.height) < 40, `o Enviar fica embaixo (${botao.y + botao.height} e a barra em ${barra.y})`);
  await semRolagemDeLado(p, 'iPhone, a tela final');
  await alvosDe44(p, 'iPhone, a tela final');
  await capturar(p, 'iphone-09-tela-final');
  // e volta ao último filme
  await arrastar(p, 0.6);
  assert.deepEqual(await filmeAVista(p), ['4/4', 'FILME INEDITO FICTICIO DOIS']);
}

/**
 * Android, na prévia B (no último filme, 4/4), com o Trello falso: o resumo com a pendência (o ano do Rivais), que
 * tocada volta ao filme; o Enviar leva só os três prontos, de três páginas: "enviando" em cada um, e o card que o Trello
 * recusa volta com o motivo e vai no próximo Enviar. O Rivais (com pergunta) fica para o próximo envio.
 */
async function enviarNoAndroid(p, trello) {
  assert.deepEqual(await filmeAVista(p), ['4/4', 'FILME SEM POSTER FICTICIO']);
  await arrastar(p, -0.6);
  assert.equal((await p.locator('.sequencia-barra .posicao').textContent()).trim(), 'resumo');
  assert.deepEqual(await telaFinalAgora(p), { conta: '3 prontos · 1 com pergunta', trello: 'nenhum no Trello ainda', pendencias: ['RIVAIS'], envio: [] });
  assert.equal((await p.locator('.sequencia-fim .sf-dica').textContent()).trim(), 'Os com pergunta ficam para o próximo envio.');
  assert.equal((await botaoEnviar(p).innerText()).trim(), 'Enviar 3 prontos');
  await semRolagemDeLado(p, 'Android, a tela final');
  await alvosDe44(p, 'Android, a tela final');
  await capturar(p, 'android-10-tela-final');

  // a pendência tocada volta ao filme dela (de um pulo); e de lá, de novo até o fim
  await p.locator('.sf-pendencias button', { hasText: 'RIVAIS' }).tap();
  await paradaNoFilme(p);
  assert.deepEqual(await filmeAVista(p), ['2/4', 'RIVAIS'], 'a pendência volta ao filme');
  for (let k = 0; k < 3; k++) await arrastar(p, -0.6);
  assert.equal((await p.locator('.sequencia-barra .posicao').textContent()).trim(), 'resumo');

  // o Enviar: os três prontos passam a "enviando" (o Trello falso segura os cards); o do sem pôster o Trello recusa
  const soltar = trello.segurar();
  trello.recusar('FILME SEM POSTER FICTICIO');
  await botaoEnviar(p).tap();
  await p.locator('.sf-envio li[data-estado="enviando"]').nth(2).waitFor({ timeout: 15000 });
  assert.deepEqual((await telaFinalAgora(p)).envio, [
    ['KONG: ILHA DA CAVEIRA', 'enviando'],
    ['FILME INEDITO FICTICIO', 'enviando'],
    ['FILME SEM POSTER FICTICIO', 'enviando'],
  ]);
  assert.equal((await botaoEnviar(p).innerText()).trim(), 'Mandando…');
  assert.ok(await botaoEnviar(p).isDisabled(), 'enviando, o Enviar espera');
  assert.equal(await cardNa(p, 0).locator('.ficha-marca').getAttribute('aria-label'), 'Indo para o Trello');
  soltar();
  // o resultado chega pela batida: dois enviados e o erro com o motivo
  await p.waitForFunction(() => !document.querySelector('.sf-envio li[data-estado="enviando"]') && document.querySelectorAll('.sf-envio li').length === 3, null, { timeout: 30000 });
  const depois = await telaFinalAgora(p);
  assert.deepEqual(depois.envio, [
    ['KONG: ILHA DA CAVEIRA', 'enviado'],
    ['FILME INEDITO FICTICIO', 'enviado'],
    ['FILME SEM POSTER FICTICIO', 'erro'],
  ]);
  assert.match(await p.locator('.sf-envio li[data-estado="erro"] .sf-estado').textContent(), /^não foi: Trello respondeu 401 .*invalid token/);
  assert.equal(await p.locator('.sf-envio li[data-estado="enviado"] a').first().getAttribute('href'), `https://trello.com/c/${trello.cards[0].id}`);
  assert.deepEqual([depois.conta, depois.trello, depois.pendencias], ['1 pronto · 1 com pergunta', '2 já no Trello', ['RIVAIS']]);
  assert.equal((await botaoEnviar(p).innerText()).trim(), 'Enviar 1 pronto');
  await semRolagemDeLado(p, 'Android, o resultado do envio');
  await capturar(p, 'android-11-resultado-do-envio');
  // o motivo também no card do filme
  assert.match(await cardNa(p, 3).locator('.cc-explica').textContent(), /^Não foi para o Trello: Trello respondeu 401 .*Vai no próximo Enviar\.$/);

  // o próximo Enviar leva só o que deu erro; o Rivais continua com a pergunta
  await botaoEnviar(p).tap();
  await p.waitForFunction(() => document.querySelectorAll('.sf-envio li[data-estado="enviado"]').length === 3, null, { timeout: 30000 });
  const fim = await telaFinalAgora(p);
  assert.deepEqual([fim.conta, fim.trello, fim.pendencias], ['0 prontos · 1 com pergunta', '3 já no Trello', ['RIVAIS']]);
  assert.ok(await botaoEnviar(p).isDisabled(), 'sem prontos, nada a enviar');
  // o que chegou ao Trello falso: um card por pronto, na lista dos filmes, e nada do Rivais
  assert.deepEqual(
    trello.cards.map((c) => [c.lista, /KONG|FILME INEDITO FICTICIO|FILME SEM POSTER FICTICIO|RIVAIS/.exec(c.nome)?.[0]]),
    [
      ['listaFilmesFalsa', 'KONG'],
      ['listaFilmesFalsa', 'FILME INEDITO FICTICIO'],
      ['listaFilmesFalsa', 'FILME SEM POSTER FICTICIO'],
    ],
  );
  await semRolagemDeLado(p, 'Android, tudo enviado');
  await alvosDe44(p, 'Android, tudo enviado');
}

/**
 * A prévia que chega por e-mail (#157), no computador: o n8n (aqui, um fetch com o token) manda o PDF; o mesmo PDF de
 * novo é "repetida". A lista mostra "prévia nova · chegou por e-mail" (e a marca dela, que acende a bolinha do Filmes); abrir a
 * prévia prepara no navegador, pela mesma subida da mão (a mesma impressão: o servidor acha a mesma prévia), e as
 * páginas vão para a leitura como sempre.
 */
async function porEmail(pc, url, leitura, pdf) {
  const mandar = () => {
    const form = new FormData();
    form.append('pdf', new Blob([pdf], { type: 'application/pdf' }), 'PREVIA_FILMES_FICTICIA_EMAIL.pdf');
    form.append('chegou_em', new Date().toISOString());
    return fetch(new URL('/api/publico/filmes/previa', url), { method: 'POST', headers: { authorization: `Bearer ${TOKEN_DA_PREVIA}` }, body: form }).then((r) => r.json());
  };
  const nova = await mandar();
  assert.equal(nova.existente, false, 'a prévia do e-mail é nova');
  assert.deepEqual(await mandar(), { ...nova, existente: true }, 'o mesmo PDF de novo é repetida');
  // a bolinha do Filmes no topo (#156) acende com a prévia por preparar, que a lista das prévias marca
  const porPreparar = () => pc.evaluate(async (id) => (await (await fetch('/api/filmes/previas')).json()).find((p) => p.id === id)?.porPreparar, nova.id);
  assert.equal(await porPreparar(), true, 'a prévia do e-mail está por preparar');

  await pc.goto(`${url}#/filmes`);
  const f = pc.locator('.ficha-previa', { hasText: 'PREVIA FILMES FICTICIA EMAIL' });
  await f.waitFor({ timeout: 30000 });
  assert.match((await f.locator('.some').textContent()).replace(/\s+/g, ' '), /^prévia nova · chegou por e-mail em \d\d\/\d\d\/\d{4}$/);
  await pc.waitForTimeout(500);
  if (CAPTURAS) await pc.screenshot({ path: join(CAPTURAS, 'computador-email-01-lista.png') });

  // abrir prepara: o PDF baixado vira as páginas úteis, que sobem e vão para a leitura
  await f.click();
  await pc.waitForFunction((id) => location.hash === `#/filmes/${id}`, nova.id, { timeout: 10000 });
  await pc.locator('.aviso-do-preparo').waitFor({ timeout: 10000 });
  if (CAPTURAS) await pc.screenshot({ path: join(CAPTURAS, 'computador-email-02-preparando.png') });
  await leitura.soltar();
  await leitura.soltar();
  for (let t = Date.now(); ; ) {
    const p = await previaNoServidor(pc, nova.id);
    if (p.paginas.length === 2 && p.paginas.every((g) => g.estado === 'lida')) {
      assert.deepEqual(p.paginas.map((g) => g.numero), [2, 3], 'as páginas úteis, como na subida à mão');
      assert.equal(p.porPreparar, false);
      break;
    }
    if (Date.now() - t > 30000) throw new Error('a prévia do e-mail não ficou lida');
    await pc.waitForTimeout(100);
  }
  await pc.locator('.aviso-do-preparo').waitFor({ state: 'detached', timeout: 10000 });
  assert.equal(await porPreparar(), false, 'preparada, ela não está mais por preparar');
  await pc.waitForTimeout(800);
  if (CAPTURAS) await pc.screenshot({ path: join(CAPTURAS, 'computador-email-03-preparada.png') });
  await pc.goto(`${url}#/filmes`);
  await f.waitFor({ timeout: 30000 });
  assert.match((await f.locator('.some').textContent()).replace(/\s+/g, ' '), /^2 páginas · chegou por e-mail em /);
}

async function principal() {
  if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  const pasta = mkdtempSync(join(tmpdir(), 'promeiro-e2e-previas-'));
  const { criarFilmes } = await import(join(RAIZ, 'servidor', 'filmes.mjs'));
  const leitura = leituraFalsa(filmesDaPagina);
  const { teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
    // o Trello falso (#84): o Enviar da tela final vai até ele
  const trello = trelloFalso();
  const s = await subir({ env: ENV, trello: { env: ENV_TRELLO, buscar: trello.buscar, consultar }, teable: teableFalso(NO_POSTGRES, { base: 'bse_teste' }), filmes: (env, deps) => criarFilmes(env, { ...deps, pasta, buscar: leitura.buscar, consultar }) });
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
    const mudancas = mudancasDe(iphone.p);
    await naSequencia(iphone.p);
    await naPaginaInteira(navegador, s.url, idDaPrevia);
    // responder no card (#82): com o Bruno ainda na prévia A, no computador
    await responderNoCard(iphone.p, pc, idDaPrevia, mudancas);
    // a tela final (#84), depois do último filme
    await naTelaFinal(iphone.p);
    await semMovimentoNaSequencia(navegador, s.url, idDaPrevia);
    await naTarde(navegador, s, leitura, await pdfDaTarde());
    // o filme sem pôster (#83), no Android, depois dos gestos do iPhone
    await semPosterNoAndroid(android.p, android.f);
    // a tela final e o Enviar (#84), na prévia B: até o Trello falso
    await enviarNoAndroid(android.p, trello);

    // o computador não muda: a entrada larga, com o "Solte aqui o PDF da prévia"
    await pc.goto(`${s.url}#/filmes`);
    await pc.getByText('Solte aqui o PDF da prévia').waitFor({ timeout: 30000 });
    assert.equal(await pc.locator('.previa-celular, .subir-previa').count(), 0, 'o computador não mostra a entrada do celular');
    await pc.waitForTimeout(800);
    if (CAPTURAS) await pc.screenshot({ path: join(CAPTURAS, 'computador-entrada.png') });
    // a prévia que chega por e-mail (#157), por último: a leitura falsa já soltou as outras
    await porEmail(pc, s.url, leitura, await pdfDaPrevia([['KONG: ILHA DA CAVEIRA'], ['RIVAIS']], 'EMAIL'));

    assert.deepEqual(iphone.erros, [], 'iPhone: erros na página');
    assert.deepEqual(android.erros, [], 'Android: erros na página');
    await Promise.all([iphone.ctx.close(), android.ctx.close(), outro.close()]);
    console.log('ok: a aba Filmes no celular (iPhone 13 e Pixel 7): a subida, a retomada, o andamento, a sequência de filmes, responder no card, a página inteira, a tela final e o Enviar');
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
