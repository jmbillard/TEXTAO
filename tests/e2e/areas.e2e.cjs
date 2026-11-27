// Ponta a ponta das Áreas de trabalho (#100), rodado à parte do vitest: `npm run e2e:areas`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros de verdade
// (as rotas /api/cadastros) sobre um Teable falso: as tabelas de redatores e editores, com o campo e-mail, e as de
// keys. Quem já entrou no PROMeiro é a tabela usuarios do SQLite (cada um passa pelo /api/eu). Nomes e e-mails
// fictícios.
//
// Ligar pessoa e cadastro pelo e-mail (#106), no computador (claro): a administradora vê nos Redatores a sugestão "É Marina
// Teles, dos redatores?" para quem entrou como Mariana Telles; "É" grava o e-mail no Teable falso na hora, a linha
// mostra o e-mail e a caixinha preta oferece desfazer, que apaga o e-mail e traz a sugestão de volta; "É" de
// novo. Nos Editores, "Não é" tira a sugestão do Bruno Regis, e ela não volta depois de recarregar. O e-mail à mão: o
// "sem e-mail" do Otávio Reis vira campo, e o Enter grava. Quem não é administrador vê os e-mails, sem sugestão e sem
// editar. No celular (escuro), a sugestão de quem acabou de entrar e o "É".
//
// O seletor de área (#101), "PROMeiro / designer ▾" na linha do logo: o Caio (redator e editor nos cadastros, pelo
// e-mail) entra na raiz e cai na Designer (a fila); troca para o Redator e para o Editor, cada um com o endereço
// próprio e os "meus roteiros" dele por dia; recarregada a raiz, o PROMeiro volta na última área. A Joana, sem
// cadastro, tem uma área só e não vê o seletor. A administradora sem cadastro vê as três e o aviso de "meus roteiros"
// vazio. No celular (escuro), a Mariana (redatora, ligada pelo "É") troca de área pelo seletor.
//
// O ciclo do roteiro (#102): o Chef do Caio foi para o Trello e está com a Tânia (o envio e a Produção arrumados no
// SQLite, como o envio e a releitura da produção da arte deixam); a lista mostra "Produzindo", os passos com a data e
// "com Tânia Arruda", e a Novela, "Em revisão". A Produção entregue: ao ganhar o foco, a lista se lê de novo e o Chef
// passa a "Entregue". No celular (escuro), o ciclo cabe na ficha.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:areas
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:areas');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const OUTRA = 'joana.prado@exemplo.com';
const MARIANA = 'mariana.telles@exemplo.com';
const BRUNO = 'bruno.regis@exemplo.com';
const CAIO = 'caio.brandao@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

/* ---------- o Teable falso: redatores e editores, com o e-mail ---------- */
const ENV_CADASTROS = {
  TEABLE_URL: 'http://teable-falso',
  TEABLE_TOKEN: 'falso',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
};
const TABELAS = {
  tblRed: [
    { id: 'recR1', fields: { redator: 'Beatriz Lins', email: 'beatriz.lins@exemplo.com' } },
    { id: 'recR2', fields: { redator: 'Marina Teles' } },
    { id: 'recR3', fields: { redator: 'Otávio Reis' } },
    { id: 'recR4', fields: { redator: 'Renata Álvares' } },
    { id: 'recR5', fields: { redator: 'Caio Brandão', email: CAIO } },
  ],
  tblKeyRed: [
    { id: 'recKR1', fields: { key: 'BLINS', redator: [{ id: 'recR1' }] } },
    { id: 'recKR2', fields: { key: 'MTELES', redator: [{ id: 'recR2' }] } },
    { id: 'recKR3', fields: { key: 'OREIS', redator: [{ id: 'recR3' }] } },
  ],
  tblEdi: [
    { id: 'recE1', fields: { editor: 'Bruno Regis' } },
    { id: 'recE2', fields: { editor: 'Caio Brandão', email: CAIO } },
  ],
  tblKeyEdi: [],
};
const pedidosAoTeable = [];
const ok = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  const metodo = init.method ?? 'GET';
  if (u.host !== 'teable-falso') throw new Error(`o teste não sai para a rede: ${url}`);
  pedidosAoTeable.push(`${metodo} ${u.pathname}`);
  const [, tabela, , registro] = /\/api\/table\/(\w+)\/(record|field)(?:\/(\w+))?/.exec(u.pathname);
  if (metodo === 'GET') return ok({ records: TABELAS[tabela].map((r) => ({ id: r.id, fields: r.fields })) });
  if (metodo === 'PATCH') {
    const r = TABELAS[tabela].find((x) => x.id === registro);
    Object.assign(r.fields, JSON.parse(init.body).record.fields);
    return ok(r);
  }
  throw new Error(`pedido inesperado ao Teable: ${metodo} ${u.pathname}`);
}
const emailNoTeable = (tabela, id) => TABELAS[tabela].find((r) => r.id === id).fields.email ?? '';

/* ---------- o navegador ---------- */
async function abrir(navegador, url, aba, { email = LIA, ...opcoes } = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/cadastros/sem-cadastro', (r) => r.fulfill({ json: { keys: [], reconhecidas: { total: 0, amostra: [] } } }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/cadastros/${aba}`);
  await p.waitForSelector('.item-cad');
  return { ctx, p, erros };
}
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
};
const linha = (p, nome) => p.locator('.item-cad', { has: p.locator('.nome', { hasText: nome }) });
const caixinha = (p) => p.locator('.desfazer[role="status"]');

async function simE(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, 'redatores', { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const sugestao = p.locator('.sugestao-email');
  await sugestao.waitFor();
  assert.equal(await sugestao.count(), 1, 'uma sugestão nos Redatores');
  assert.match(await sugestao.innerText(), /mariana\.telles@exemplo\.com/);
  assert.equal((await sugestao.locator('.pergunta-sugestao').innerText()).trim(), 'É Marina Teles, dos redatores?');
  assert.equal((await linha(p, 'Marina Teles').locator('.email-cad').innerText()).trim(), 'sem e-mail');
  assert.equal((await linha(p, 'Beatriz Lins').locator('.email-cad').innerText()).trim(), 'beatriz.lins@exemplo.com');
  await capturar(p, '01-sugestao-dos-redatores-claro');

  // "É": grava na hora, a linha mostra o e-mail e a caixinha oferece desfazer
  await sugestao.getByRole('button', { name: 'É', exact: true }).click();
  await caixinha(p).filter({ hasText: 'agora está ligado a Marina Teles, dos redatores' }).waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR2'), MARIANA, 'o e-mail foi para o Teable');
  await linha(p, 'Marina Teles').locator('.email-cad', { hasText: MARIANA }).waitFor();
  assert.equal(await p.locator('.sugestao-email').count(), 0, 'a sugestão sai');
  await capturar(p, '02-e-gravado-com-desfazer-claro');

  // desfazer: o e-mail sai do Teable e a sugestão volta
  await caixinha(p).locator('button', { hasText: 'Desfazer' }).click();
  await p.locator('.sugestao-email').waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR2'), '', 'o desfazer apaga o e-mail no Teable');
  assert.equal((await linha(p, 'Marina Teles').locator('.email-cad').innerText()).trim(), 'sem e-mail');
  await p.locator('.sugestao-email').getByRole('button', { name: 'É', exact: true }).click();
  await linha(p, 'Marina Teles').locator('.email-cad', { hasText: MARIANA }).waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR2'), MARIANA);
  console.log('ok: "É Marina Teles, dos redatores?" para quem entrou como Mariana Telles; "É" grava no Teable na hora, desfazer apaga e a sugestão volta');

  // o e-mail à mão: o "sem e-mail" vira campo e o Enter grava
  await linha(p, 'Otávio Reis').locator('button.email-cad').click();
  await linha(p, 'Otávio Reis').locator('input.entrada-email-cad').fill('otavio.reis@exemplo.com');
  await linha(p, 'Otávio Reis').locator('input.entrada-email-cad').press('Enter');
  await linha(p, 'Otávio Reis').locator('.email-cad', { hasText: 'otavio.reis@exemplo.com' }).waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR3'), 'otavio.reis@exemplo.com');
  // o e-mail repetido é recusado e nada muda
  await linha(p, 'Otávio Reis').locator('button.email-cad').click();
  await linha(p, 'Otávio Reis').locator('input.entrada-email-cad').fill('beatriz.lins@exemplo.com');
  await linha(p, 'Otávio Reis').locator('input.entrada-email-cad').press('Enter');
  await p.locator('text=beatriz.lins@exemplo.com já é de Beatriz Lins.').waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR3'), 'otavio.reis@exemplo.com');
  await linha(p, 'Otávio Reis').locator('input.entrada-email-cad').press('Escape');
  console.log('ok: o e-mail à mão: o Enter grava no Teable; o e-mail de outro redator é recusado');

  // nos Editores, "Não é" fica lembrado: depois de recarregar, a sugestão não volta
  await p.locator('.abas-cad button[title="Editores"]').click();
  const doBruno = p.locator('.sugestao-email');
  await doBruno.waitFor();
  assert.equal((await doBruno.locator('.pergunta-sugestao').innerText()).trim(), 'É Bruno Regis, dos editores?');
  await doBruno.locator('button', { hasText: 'Não é' }).click();
  await caixinha(p).filter({ hasText: 'O PROMeiro não pergunta de novo.' }).waitFor();
  assert.equal(await p.locator('.sugestao-email').count(), 0);
  assert.equal(emailNoTeable('tblEdi', 'recE1'), '', '"Não é" não grava no Teable');
  await p.reload();
  await p.waitForSelector('.item-cad');
  await p.waitForTimeout(300);
  assert.equal(await p.locator('.sugestao-email').count(), 0, 'o "Não é" fica lembrado');
  console.log('ok: "Não é" tira a sugestão do editor, e ela não volta depois de recarregar');
  await semRolagemDeLado(p, 'computador');
  assert.deepEqual(erros, [], 'computador: erros na página');
  await ctx.close();
}

async function semSerAdministrador(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, 'redatores', { email: OUTRA, viewport: { width: 1440, height: 900 } });
  await p.waitForTimeout(300);
  assert.equal(await p.locator('.sugestao-email').count(), 0, 'sem sugestão para quem não é administrador');
  assert.equal(await p.locator('button.email-cad').count(), 0, 'sem editar o e-mail');
  assert.equal((await linha(p, 'Beatriz Lins').locator('.email-cad').innerText()).trim(), 'beatriz.lins@exemplo.com');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: quem não é administrador vê os e-mails, sem sugestão e sem editar');
}

async function noCelular(navegador, url) {
  // uma sugestão nova para o celular: quem entrou agora como Renata Alvares (o cadastro tem acento)
  await fetch(`${url.replace(/\/$/, '')}/api/eu`, { headers: { 'cf-access-authenticated-user-email': 'renata.alvares@exemplo.com' } });
  const { ctx, p, erros } = await abrir(navegador, url, 'redatores', { ...devices['iPhone 13'], colorScheme: 'dark' });
  const sugestao = p.locator('.sugestao-email');
  await sugestao.waitFor();
  assert.equal((await sugestao.locator('.pergunta-sugestao').innerText()).trim(), 'É Renata Álvares, dos redatores?');
  await semRolagemDeLado(p, 'celular');
  await sugestao.scrollIntoViewIfNeeded();
  await capturar(p, '03-sugestao-no-celular-escuro');
  await sugestao.getByRole('button', { name: 'É', exact: true }).click();
  await linha(p, 'Renata Álvares').locator('.email-cad', { hasText: 'renata.alvares@exemplo.com' }).waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR4'), 'renata.alvares@exemplo.com');
  assert.deepEqual(erros, [], 'celular: erros na página');
  await ctx.close();
  console.log('ok: no celular, a sugestão cabe na tela e o "É" grava');
}

/* ---------- as áreas de trabalho (#101) ---------- */

/** Os roteiros guardados no PROMeiro (quem sobe é a arte): o redator e o editor vêm no roteiro, pelo nome. */
const iso = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ROTEIROS = [
  { id: 'areas-chef', meta: { claquete: 'CHEF(FUT) SP', programa: 'Chef do Futuro', praca: 'SP', dataExibicao: iso(1), redator: 'Caio Brandão', editor: 'Bruno Regis' } },
  { id: 'areas-fest', meta: { claquete: 'FESTIVAL(VER) REDE', programa: 'Festival de Verão', praca: 'G5', dataExibicao: iso(3), redator: 'Marina Teles', editor: 'Caio Brandão' } },
  { id: 'areas-nov', meta: { claquete: 'NOVELA7(CAP) SP', programa: 'Sete Mares', praca: 'SP', dataExibicao: iso(3), redator: 'Caio Brandao', editor: 'Bruno Regis' } },
];
async function semearRoteiros(api) {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LOC: HOJE' }] }] };
  for (const r of ROTEIROS) {
    const meta = { titulo: '', tipoPrograma: 'outro', capitulo: null, edicao: '', locutor: '', selo: '', duracaoAlvoSeg: null, ...r.meta };
    const resp = await fetch(`${api}/roteiros/${r.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'cf-access-authenticated-user-email': OUTRA }, body: JSON.stringify({ roteiro: { meta, doc }, nArtes: 2 }) });
    assert.equal(resp.status, 200, `semear ${r.id}`);
  }
}

async function entrar(navegador, url, hash, email, opcoes = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(email), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  const erros = [];
  const aoTrello = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  p.on('request', (r) => /trello/i.test(r.url()) && aoTrello.push(r.url()));
  await p.goto(`${url}${hash}`);
  await p.waitForSelector('.barra-topo .bib-marca');
  return { ctx, p, erros, aoTrello };
}
const hashDe = (p) => new URL(p.url()).hash;
const nomeDaArea = async (p) => (await p.locator('.seletor-area-nome').innerText()).trim();
const claquetes = (p) => p.locator('.meus-roteiros .ficha-claquete b').allInnerTexts();
async function escolherArea(p, nome) {
  await p.locator('.seletor-area').click();
  await p.locator('.areas-menu .area-item', { hasText: nome }).click();
  await p.locator('.areas-menu').waitFor({ state: 'detached' });
}

async function trocarDeArea(navegador, url) {
  const { ctx, p, erros, aoTrello } = await entrar(navegador, url, '', CAIO, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  // a primeira entrada, na raiz: a Designer, que é a fila de hoje
  await p.locator('.seletor-area').waitFor();
  assert.equal(await nomeDaArea(p), 'designer');
  assert.ok(await p.locator('.topo-pauta').isVisible(), 'a Pauta da edição continua no topo');
  // a lista das áreas: as três, cada uma com o que mostra e o endereço
  await p.locator('.seletor-area').click();
  const itens = p.locator('.areas-menu .area-item');
  assert.equal(await itens.count(), 3, 'o Caio é redator e editor: as três áreas');
  assert.deepEqual((await itens.locator('b').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), ['Designer /designer', 'Redator /redator', 'Editor /editor']);
  assert.match(await itens.nth(1).locator('small').innerText(), /roteiros que você escreve/);
  assert.equal(await itens.nth(0).getAttribute('aria-checked'), 'true');
  await capturar(p, '04-seletor-de-area-aberto-claro');
  await p.locator('.areas-menu .area-item', { hasText: 'Redator' }).click();
  await p.locator('.meus-roteiros').waitFor();
  assert.equal(hashDe(p), '#/redator');
  assert.equal(await nomeDaArea(p), 'redator');
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  // os roteiros em que o Caio é o redator (o nome sem acento também é ele), por dia
  assert.deepEqual(await claquetes(p), ['CHEF(FUT) SP', 'NOVELA7(CAP) SP']);
  assert.deepEqual((await p.locator('.meus-roteiros .dia-topo h3').allInnerTexts()).map((t) => t.split('\n')[0].trim()).slice(0, 1), ['Amanhã']);
  assert.match(await p.locator('.meus-roteiros .fila-conta').innerText(), /como redator: Caio Brandão/);
  await capturar(p, '05-meus-roteiros-do-redator-claro');
  await escolherArea(p, 'Editor');
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.equal(hashDe(p), '#/editor');
  assert.deepEqual(await claquetes(p), ['FESTIVAL(VER) REDE']);
  // de volta à Designer, pelo seletor: o endereço dela e a fila
  await escolherArea(p, 'Designer');
  assert.equal(hashDe(p), '#/designer');
  await p.locator('.biblioteca.fila').waitFor();
  await escolherArea(p, 'Editor');
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  console.log('ok: "PROMeiro / designer ▾" troca para o Redator e o Editor, cada um com o endereço e os roteiros dele');

  // recarregar na raiz: o PROMeiro abre na última área usada (guardada no servidor)
  await p.goto(url);
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.equal(hashDe(p), '#/editor');
  assert.equal(await nomeDaArea(p), 'editor');
  // em outro navegador (outro aparelho), também
  const outro = await entrar(navegador, url, '', CAIO, { viewport: { width: 1280, height: 800 } });
  await outro.p.locator('.meus-roteiros').waitFor();
  assert.equal(hashDe(outro.p), '#/editor');
  await outro.ctx.close();
  console.log('ok: a raiz abre na última área usada, depois de recarregar e em outro navegador');
  await semRolagemDeLado(p, 'áreas no computador');
  assert.deepEqual(erros, [], 'áreas: erros na página');
  assert.deepEqual(aoTrello, [], 'nada é lido do Trello');
  await ctx.close();
}

/* ---------- o ciclo do roteiro (#102) ---------- */

/** O envio ao Trello e a Produção do card, como o envio e a releitura da produção da arte deixam no SQLite. */
const enviar = (db, id, card, em) => db.prepare("INSERT OR REPLACE INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'enviado', ?, ?)").run(id, card, em);
const producao = (db, id, card, { etapa, designers = [], entregaEm = null }) =>
  db
    .prepare(
      `INSERT INTO producoes (id, claquete, etapa, designers, card_id, entrada_em, entrega_em, arquivada, criada_em, atualizada_em) VALUES (?, 'X', ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT (id) DO UPDATE SET etapa = excluded.etapa, designers = excluded.designers, entrega_em = excluded.entrega_em`,
    )
    .run(id, etapa, JSON.stringify(designers), card, new Date().toISOString(), entregaEm, new Date().toISOString(), new Date().toISOString());
const fichaDe = (p, claquete) => p.locator('.meus-roteiros .ficha', { has: p.locator('.ficha-claquete b', { hasText: claquete }) });
const estadoDe = async (p, claquete) => (await fichaDe(p, claquete).locator('.estado-nome').innerText()).trim();

async function cicloNaLista(navegador, url, db) {
  // o Chef foi para o Trello e a Tânia pegou; a Novela ainda está na revisão
  enviar(db, 'areas-chef', 'cardareaschef', new Date().toISOString());
  producao(db, 'prod-areas-chef', 'cardareaschef', { etapa: 'produzindo', designers: ['Tânia Arruda'] });
  const { ctx, p, erros, aoTrello } = await entrar(navegador, url, '#/redator', CAIO, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.equal(await estadoDe(p, 'CHEF(FUT) SP'), 'Produzindo');
  assert.equal(await estadoDe(p, 'NOVELA7(CAP) SP'), 'Em revisão');
  const passosDoChef = (await fichaDe(p, 'CHEF(FUT) SP').locator('.passos-ciclo').innerText()).trim();
  assert.match(passosDoChef, /^chegou \d+\/\d+, \d+h\d\d · no Trello \d+\/\d+, \d+h\d\d$/);
  assert.equal((await fichaDe(p, 'CHEF(FUT) SP').locator('.com-quem').innerText()).trim(), 'com Tânia Arruda', 'quem da arte está com o roteiro');
  assert.match((await fichaDe(p, 'NOVELA7(CAP) SP').locator('.passos-ciclo').innerText()).trim(), /^chegou \d+\/\d+, \d+h\d\d$/);
  assert.equal(await fichaDe(p, 'NOVELA7(CAP) SP').locator('.com-quem').count(), 0, 'na revisão, ninguém da arte');
  await capturar(p, '08-ciclo-na-lista-claro');
  console.log('ok: cada roteiro mostra o estado do ciclo, os passos com data e quem da arte está com ele');

  // a Produção foi entregue: a lista se lê de novo sozinha (aqui, ao ganhar o foco, como na agenda)
  producao(db, 'prod-areas-chef', 'cardareaschef', { etapa: 'entregue', designers: ['Tânia Arruda'], entregaEm: new Date().toISOString() });
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await fichaDe(p, 'CHEF(FUT) SP').locator('.estado-nome', { hasText: 'Entregue' }).waitFor();
  assert.match((await fichaDe(p, 'CHEF(FUT) SP').locator('.passos-ciclo').innerText()).trim(), / · entregue \d+\/\d+, \d+h\d\d$/);
  console.log('ok: a lista se atualiza sozinha quando o estado muda (Produzindo → Entregue)');
  await semRolagemDeLado(p, 'ciclo no computador');
  assert.deepEqual(erros, [], 'ciclo: erros na página');
  assert.deepEqual(aoTrello, [], 'o ciclo não lê o Trello');
  await ctx.close();

  // no celular (escuro), o ciclo cabe na ficha
  const cel = await entrar(navegador, url, '#/redator', CAIO, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await fichaDe(cel.p, 'CHEF(FUT) SP').locator('.estado-nome', { hasText: 'Entregue' }).waitFor();
  await semRolagemDeLado(cel.p, 'ciclo no celular');
  await capturar(cel.p, '09-ciclo-no-celular-escuro');
  assert.deepEqual(cel.erros, [], 'ciclo no celular: erros na página');
  await cel.ctx.close();
  console.log('ok: no celular, o ciclo cabe na ficha');
}

async function umaAreaSo(navegador, url) {
  const { ctx, p, erros } = await entrar(navegador, url, '', OUTRA, { viewport: { width: 1440, height: 900 } });
  await p.locator('.biblioteca.fila').waitFor();
  await p.waitForTimeout(300);
  assert.equal(await p.locator('.seletor-area').count(), 0, 'sem cadastro, uma área só: sem o seletor');
  assert.equal(hashDe(p), '');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: quem tem uma área só (a Designer) não vê o seletor');
}

async function administradoraSemCadastro(navegador, url) {
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', LIA, { viewport: { width: 1440, height: 900 } });
  await p.locator('.meus-roteiros .aviso-meus').waitFor();
  assert.match(await p.locator('.aviso-meus').innerText(), /ainda não está ligado a um cadastro de redator/);
  await p.locator('.seletor-area').click();
  assert.equal(await p.locator('.areas-menu .area-item').count(), 3, 'a administradora vê as três');
  assert.match(await p.locator('.areas-menu-pe').innerText(), /Como administrador, você vê as três/);
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: a administradora sem cadastro vê as três áreas e o aviso claro de "meus roteiros" vazio');
}

async function areasNoCelular(navegador, url) {
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', MARIANA, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.deepEqual(await claquetes(p), ['FESTIVAL(VER) REDE'], 'a Mariana, ligada pelo "É", é a redatora Marina Teles');
  await semRolagemDeLado(p, 'áreas no celular');
  await capturar(p, '06-meus-roteiros-no-celular-escuro');
  await p.locator('.seletor-area').click();
  assert.equal(await p.locator('.areas-menu .area-item').count(), 2, 'redatora: Designer e Redator');
  await semRolagemDeLado(p, 'seletor no celular');
  await capturar(p, '07-seletor-no-celular-escuro');
  await p.locator('.areas-menu .area-item', { hasText: 'Designer' }).click();
  await p.locator('.biblioteca.fila').waitFor();
  assert.equal(hashDe(p), '#/designer');
  assert.deepEqual(erros, [], 'celular: erros na página');
  await ctx.close();
  console.log('ok: no celular, "meus roteiros" cabe na tela e o seletor troca de área');
}

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: LIA }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: LIA } });
  // quem já entrou no PROMeiro (o nome sai do e-mail); a Renata só entra no celular
  for (const email of [LIA, OUTRA, MARIANA, BRUNO]) await fetch(`${s.api}/eu`, { headers: { 'cf-access-authenticated-user-email': email } });
  // o tour da revisão já visto: o convite não cobre a fila das áreas
  for (const email of [LIA, OUTRA, MARIANA, CAIO]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
  await semearRoteiros(s.api);
  const navegador = await chromium.launch();
  try {
    await simE(navegador, s.url);
    await semSerAdministrador(navegador, s.url);
    await noCelular(navegador, s.url);
    await trocarDeArea(navegador, s.url);
    await cicloNaLista(navegador, s.url, s.db);
    await umaAreaSo(navegador, s.url);
    await administradoraSemCadastro(navegador, s.url);
    await areasNoCelular(navegador, s.url);
    assert.ok(pedidosAoTeable.every((x) => /^(GET|PATCH) /.test(x)), 'no Teable, só leitura e o e-mail');
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
