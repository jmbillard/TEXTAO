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
  ],
  tblKeyRed: [
    { id: 'recKR1', fields: { key: 'BLINS', redator: [{ id: 'recR1' }] } },
    { id: 'recKR2', fields: { key: 'MTELES', redator: [{ id: 'recR2' }] } },
    { id: 'recKR3', fields: { key: 'OREIS', redator: [{ id: 'recR3' }] } },
  ],
  tblEdi: [{ id: 'recE1', fields: { editor: 'Bruno Regis' } }],
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

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: LIA }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: LIA } });
  // quem já entrou no PROMeiro (o nome sai do e-mail); a Renata só entra no celular
  for (const email of [LIA, OUTRA, MARIANA, BRUNO]) await fetch(`${s.api}/eu`, { headers: { 'cf-access-authenticated-user-email': email } });
  const navegador = await chromium.launch();
  try {
    await simE(navegador, s.url);
    await semSerAdministrador(navegador, s.url);
    await noCelular(navegador, s.url);
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
