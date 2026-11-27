// Ponta a ponta da tela de produções (#109), rodado à parte do vitest: `npm run e2e:producoes`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o Teable falso
// (tests/fixtures/teable-falso.mjs): a produção da arte, fictícia, carregada como Produções do PROMeiro. Quem abre não é
// administrador (a tela é de todo mundo que entrou). No computador, claro e escuro: a entrada no topo da fila, ao lado
// da agenda No Trello, e o endereço próprio na área Designer; uma faixa por praça na ordem das praças (as de fábrica),
// com as colunas Entrada · Produzindo · Entregue lado a lado e a contagem de cada uma; os cards na ordem do prazo (no
// mesmo prazo, a ALTA primeiro, com o marca-texto da agenda), com a claquete, a atração, as artes, os designers e o
// prazo; o Entregue só com os dos últimos 3 dias; a arquivada fora; as sem card (a linha sem card, o filme) na faixa
// delas; a releitura a cada minuto, como a agenda; e a volta para a agenda. No celular, claro e escuro, cada faixa com
// as etapas uma embaixo da outra, sem rolar para o lado. Nenhum pedido ao Trello, nem do navegador nem do servidor.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:producoes
// Com CAPTURAS=pasta, grava as capturas de cada tela (densidade 2).
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');
const RAIZ = join(__dirname, '..', '..');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:producoes');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const CHEFE = 'chefe.ficticia@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

/* ---------- as datas, sempre em São Paulo ---------- */
const DIA = 86_400_000;
const agora = Date.now();
const dm = (n) => new Date(agora + n * DIA).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const ha = (n) => new Date(agora - n * DIA).toISOString();
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** O prazo como o card escreve: "amanhã", "sex 20/11". */
const prazo = (n) => {
  if (n === 1) return 'amanhã';
  const d = new Date(`${new Date(agora + n * DIA).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T12:00:00Z`);
  return `${SEMANA[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

// ids de card fictícios (24 caracteres hexadecimais)
const card = (n) => `c0ffee${String(n).padStart(18, '0')}`;
const linha = (id, fields) => ({ id, fields: { status: '[]', designers: null, arquivado: false, entregue: false, praca: null, filme: null, ...fields } });
/** A produção da arte (fictícia). */
const ARTE = [
  // SP: duas no mesmo prazo (a ALTA primeiro) e uma sem card com o prazo mais perto
  linha('recProdE2e1', { card_ID: card(1), claquete: `Show da Noite ${dm(3)} SP`, artes: 'HOJE | AMANHÃ | DOMINGO', data_entrada: ha(1) }),
  linha('recProdE2e2', { card_ID: card(2), claquete: `Festa na Praça ${dm(3)} SP`, artes: 'HOJE', prioridade: 'ALTA', data_entrada: ha(1) }),
  linha('recProdE2e3', { card_ID: '', claquete: `Cozinha de Vó ${dm(1)} SP`, data_entrada: ha(2) }),
  // G5: produzindo, entregue ontem (fica), entregue há 5 dias (sai) e um filme sem card
  linha('recProdE2e4', { card_ID: card(4), claquete: `Novela Sinfonia ${dm(2)}`, status: '["PRODUZINDO","AGUARDANDO MATERIAL"]', designers: '["Dora Lima","Enzo Prado"]', artes: 'HOJE | AMANHÃ', data_entrada: ha(2) }),
  linha('recProdE2e5', { card_ID: card(5), claquete: `Jogo Final ${dm(0)}`, status: '["FINALIZADO"]', designers: '["Dora Lima"]', entregue: true, data_entrada: ha(3), data_entrega: ha(1) }),
  linha('recProdE2e6', { card_ID: card(6), claquete: `Jogo Antigo ${dm(-4)}`, status: '["FINALIZADO"]', designers: '["Enzo Prado"]', entregue: true, data_entrada: ha(8), data_entrega: ha(5) }),
  linha('recProdE2e8', { card_ID: '', claquete: `Filme da Tarde ${dm(4)}`, status: '["FILME"]', filme: [{ id: 'recFilmeE2e', title: 'Filme da Tarde' }], data_entrada: ha(1) }),
  // RJ: arquivada (sai)
  linha('recProdE2e7', { card_ID: card(7), claquete: `RIO Show ${dm(2)}`, status: '["PRODUZINDO"]', designers: '["Dora Lima"]', arquivado: true, data_entrada: ha(2) }),
];

async function abrir(navegador, url, opcoes, hash = '#/designer/producoes', { relogio = false } = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(LIA), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  if (relogio) await p.clock.install();
  const erros = [];
  const aoTrello = [];
  const leituras = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  p.on('request', (r) => {
    if (/trello/i.test(r.url())) aoTrello.push(r.url());
    if (new URL(r.url()).pathname === '/api/producoes/por-praca') leituras.push(r.url());
  });
  await p.goto(`${url}${hash}`);
  return { ctx, p, erros, aoTrello, leituras };
}
const fundoEscuro = (p) =>
  p.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return r + g + b < 200;
  });
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: true });
};
const textos = async (l) => (await l.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
const hash = (p) => new URL(p.url()).hash;
const coluna = (p, praca, k) => p.locator(`.prod-faixa[data-praca="${praca}"] .prod-coluna[data-coluna="${k}"]`);
const claquetes = (p, praca, k) => textos(coluna(p, praca, k).locator('.prod-claquete'));
const contas = async (p, praca) => Promise.all(['entrada', 'produzindo', 'entregue'].map(async (k) => Number(await coluna(p, praca, k).locator('.prod-conta').textContent())));
const cardDe = (p, claquete) => p.locator('.prod-card', { has: p.locator('.prod-claquete', { hasText: claquete }) });

async function noComputador(navegador, url, tema, chamadasAoTrello) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros, aoTrello, leituras } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema }, '', { relogio: tema === 'light' });
  assert.equal(await fundoEscuro(p), tema === 'dark');

  // a entrada no topo da fila, ao lado da agenda No Trello; o endereço próprio, na área Designer
  await p.locator('.barra-topo .topo-producoes').click();
  await p.locator('.prod-faixa').first().waitFor();
  assert.equal(hash(p), '#/designer/producoes');
  assert.equal((await p.locator('.prod-cabeca h1').textContent()).trim(), 'Produções');

  // uma faixa por praça, na ordem das praças (a que não tem nada também), com as três colunas lado a lado
  assert.deepEqual(await p.locator('.prod-faixa').evaluateAll((fs) => fs.map((f) => f.dataset.praca)), ['G5', 'RJ', 'SP', 'INTER']);
  assert.deepEqual(await p.locator('.prod-faixa[data-praca="SP"] .prod-coluna').evaluateAll((cs) => cs.map((c) => c.dataset.coluna)), ['entrada', 'produzindo', 'entregue']);
  assert.deepEqual(await textos(p.locator('.prod-faixa[data-praca="SP"] .prod-coluna-nome')), ['Entrada', 'Produzindo', 'Entregue']);
  const topos = await p.locator('.prod-faixa[data-praca="SP"] .prod-coluna').evaluateAll((cs) => cs.map((c) => Math.round(c.getBoundingClientRect().top)));
  assert.equal(new Set(topos).size, 1, 'no computador, as colunas ficam lado a lado');

  // a contagem de cada coluna
  assert.deepEqual(await contas(p, 'SP'), [3, 0, 0]);
  assert.deepEqual(await contas(p, 'G5'), [1, 1, 1]);
  assert.deepEqual(await contas(p, 'RJ'), [0, 0, 0]);
  assert.deepEqual(await contas(p, 'INTER'), [0, 0, 0]);

  // a ordem do prazo; no mesmo prazo, a ALTA primeiro, com o marca-texto da agenda
  assert.deepEqual(await claquetes(p, 'SP', 'entrada'), [`Cozinha de Vó ${dm(1)} SP`, `Festa na Praça ${dm(3)} SP`, `Show da Noite ${dm(3)} SP`]);
  const festa = cardDe(p, 'Festa na Praça');
  assert.equal(await festa.locator('.marca-texto').count(), 1);
  assert.equal(await cardDe(p, 'Show da Noite').locator('.marca-texto').count(), 0);
  // o card: a atração (do Roteiro enviado), as artes, o prazo
  assert.equal((await festa.locator('.prod-atracao').textContent()).trim(), 'Festa na Praça');
  assert.equal((await festa.locator('.prod-artes').textContent()).trim(), '1 arte');
  assert.equal((await festa.locator('.prod-prazo').textContent()).replace(/\s+/g, ' ').trim(), `ao ar ${prazo(3)}`);
  assert.equal((await cardDe(p, 'Show da Noite').locator('.prod-artes').textContent()).trim(), '3 artes');
  // os designers e o marcador de Produzindo
  const novela = cardDe(p, 'Novela Sinfonia');
  assert.equal((await novela.locator('.prod-designers').textContent()).trim(), 'Dora Lima, Enzo Prado');
  assert.equal((await novela.locator('.prod-marcador').textContent()).trim(), 'Aguardando material');
  assert.equal((await novela.locator('.prod-artes').textContent()).trim(), '2 artes');

  // o Entregue: só os dos últimos 3 dias; a arquivada não aparece
  assert.deepEqual(await claquetes(p, 'G5', 'entregue'), [`Jogo Final ${dm(0)}`]);
  assert.match(await coluna(p, 'G5', 'entregue').locator('h3').textContent(), /últimos 3 dias/);
  assert.equal(await cardDe(p, 'Jogo Antigo').count(), 0);
  assert.equal(await cardDe(p, 'RIO Show').count(), 0);

  // as sem card ficam na faixa delas, marcadas
  assert.equal(await cardDe(p, 'Cozinha de Vó').locator('.prod-sem-card').count(), 1);
  const filme = coluna(p, 'G5', 'entrada').locator('.prod-card');
  assert.equal((await filme.locator('.prod-atracao').textContent()).trim(), 'Filme da Tarde');
  assert.equal(await filme.locator('.prod-sem-card').count(), 1);
  assert.equal(await festa.locator('.prod-sem-card').count(), 0);

  await semRolagemDeLado(p, `computador ${nome}`);
  await capturar(p, `01-producoes-computador-${nome}`);

  // a releitura a cada minuto, como a agenda
  if (tema === 'light') {
    const antes = leituras.length;
    const releu = p.waitForRequest((r) => new URL(r.url()).pathname === '/api/producoes/por-praca', { timeout: 5000 });
    await p.clock.fastForward(61_000);
    await releu;
    assert.ok(leituras.length > antes, 'a tela se lê de novo depois de um minuto');
  }

  // a volta para a agenda No Trello
  await p.locator('.barra-topo .topo-agenda').click();
  await p.locator('.barra-topo .topo-producoes').waitFor();
  assert.equal(hash(p), '#/designer');

  assert.deepEqual(aoTrello, [], 'nenhum pedido ao Trello pelo navegador');
  assert.deepEqual(chamadasAoTrello, [], 'nenhum pedido ao Trello pelo servidor');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log(`ok: computador ${nome}: as faixas por praça, as colunas com a contagem, os cards na ordem do prazo, o Entregue recente`);
}

async function noCelular(navegador, url, tema, chamadasAoTrello) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: tema });
  await p.locator('.prod-faixa').first().waitFor();
  assert.equal(await fundoEscuro(p), tema === 'dark');
  // as etapas da faixa uma embaixo da outra
  const caixas = await p.locator('.prod-faixa[data-praca="SP"] .prod-coluna').evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom, left: Math.round(r.left) })));
  assert.equal(caixas.length, 3);
  assert.ok(caixas[0].bottom <= caixas[1].top && caixas[1].bottom <= caixas[2].top, 'no celular, Entrada, Produzindo e Entregue uma embaixo da outra');
  assert.equal(new Set(caixas.map((c) => c.left)).size, 1);
  assert.deepEqual(await claquetes(p, 'SP', 'entrada'), [`Cozinha de Vó ${dm(1)} SP`, `Festa na Praça ${dm(3)} SP`, `Show da Noite ${dm(3)} SP`]);
  await semRolagemDeLado(p, `celular ${nome}`);
  await capturar(p, `02-producoes-celular-${nome}`);
  assert.deepEqual(aoTrello, []);
  assert.deepEqual(chamadasAoTrello, []);
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log(`ok: celular ${nome}: as etapas uma embaixo da outra, sem rolar para o lado`);
}

async function entradaNoCelular(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, devices['iPhone 13'], '');
  const entrada = p.locator('.barra-topo .topo-producoes');
  await entrada.waitFor();
  assert.equal(await entrada.locator('span').isVisible(), false);
  await semRolagemDeLado(p, 'fila no celular');
  await entrada.tap();
  await p.locator('.prod-faixa').first().waitFor();
  assert.equal(hash(p), '#/designer/producoes');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: celular: a entrada no topo da fila (o ícone) abre a tela de produções');
}

async function principal() {
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const { comTabelas } = await import(join(RAIZ, 'servidor', 'tabelas-do-teable.mjs'));
  const teable = teableFalso({ ARTE_producao: 'arte_e2e' }, { registros: { ARTE_producao: ARTE } });
  const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
  // o servidor não pode pedir nada ao Trello: o que ele tentar fica anotado (e falha)
  const chamadasAoTrello = [];
  const buscar = async (u) => {
    chamadasAoTrello.push(String(u));
    throw new Error(`o teste não sai para a rede: ${u}`);
  };
  const trello = { env: { ...PG, ...comTabelas({ ARTE_producao: 'arte_e2e' }) }, consultar: teable.consultar, buscar };
  const s = await subir({ teable, pg: teable.abrirPg, trello, env: { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, ...PG } });
  // o Roteiro (fictício) enviado para o card da Festa diz a atração
  const em = new Date().toISOString();
  s.db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run('roteiro-festa-e2e', CHEFE, 'Chefe', JSON.stringify({ claquete: `Festa na Praça ${dm(3)} SP`, programa: 'Festa na Praça' }), '{}', em, em);
  s.db.prepare("INSERT INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'ok', ?, ?)").run('roteiro-festa-e2e', card(2), em);
  const carga = await fetch(`${s.api}/producoes/recarregar`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': CHEFE } });
  assert.equal(carga.status, 200, 'a carga das Produções');
  await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': LIA } });
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, tema, chamadasAoTrello);
    for (const tema of ['light', 'dark']) await noCelular(navegador, s.url, tema, chamadasAoTrello);
    await entradaNoCelular(navegador, s.url);
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
