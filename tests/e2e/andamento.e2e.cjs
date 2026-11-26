// Ponta a ponta do Andamento do projeto (#92), rodado à parte do vitest: `npm run e2e:andamento`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o GitHub falso
// (tests/fixtures/github-falso.mjs: specs, tickets e commits fictícios; só leitura). No computador, claro e escuro: o
// item "Andamento" no menu do perfil, depois da Configuração; a trilha das etapas, o resumo, as frentes com a barra e o
// que vem agora, os tickets com a situação e o link para a issue, e o "Ler de novo" que vai ao GitHub. Com o GitHub
// fora, a linha "O GitHub não responde desde…" e a última leitura. Quem não é administrador não vê o item nem abre a
// página. Sem o GITHUB_TOKEN (outro servidor), a página diz o que falta. No celular, claro e escuro: só consulta, a
// trilha em pé, sem rolar para o lado.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:andamento
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:andamento');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const OUTRA = 'bruno.teixeira@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

async function abrir(navegador, url, opcoes, { email = LIA, hash = '#/andamento' } = {}) {
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
const fundoEscuro = (p) =>
  p.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return r + g + b < 200;
  });
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: true });
};
const textos = async (l) => (await l.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
const frente = (p, spec) => p.locator('.and-frente', { has: p.locator(`a[href$="/issues/${spec}"]`) });

async function noComputador(navegador, url, github, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  github.estado.fora = false;
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema }, { hash: '' });
  assert.equal(await fundoEscuro(p), tema === 'dark');

  // o item no menu do perfil, logo depois da Configuração
  await p.locator('.perfil-botao').click();
  const itens = await textos(p.locator('.perfil-painel .perfil-link'));
  const i = itens.findIndex((t) => t.startsWith('Andamento'));
  assert.ok(i > 0 && itens[i - 1].startsWith('Configuração'), `Andamento depois da Configuração: ${itens.join(' | ')}`);
  await capturar(p, `01-menu-${nome}`);
  await p.locator('.perfil-painel .perfil-link', { hasText: 'Andamento' }).click();
  await p.locator('.and-frente').first().waitFor();
  assert.equal(new URL(p.url()).hash, '#/andamento');
  assert.equal((await p.locator('.cfg-cabeca h1').textContent()).trim(), 'Andamento');
  assert.match(await p.locator('.and-lido').textContent(), /Lido do GitHub agora há pouco/);
  assert.equal(await p.locator('.and-aviso').count(), 0);

  // o resumo e a trilha: onde estamos
  assert.match(await p.locator('.and-resumo').textContent(), /^5 de 11 tickets das frentes estão feitos\. Na meta de longo prazo, estamos entre a etapa 1 \(Espelho, quase pronta\) e a 2/);
  assert.deepEqual(await textos(p.locator('.and-etapa strong')), ['Espelho', 'O PROMeiro manda', 'Designer no PROMeiro', 'Desligar o Trello', 'Banco próprio', 'O n8n sai']);
  assert.equal(await p.locator('.and-etapa[aria-current="step"] strong').textContent(), 'O PROMeiro manda');

  // as frentes: a lista do código e a spec nova (93), com a conta e o que vem agora
  assert.equal(await p.locator('.and-frente').count(), 6);
  assert.deepEqual(await textos(frente(p, 64).locator('.and-conta')), ['2 de 3 feitos']);
  assert.deepEqual(await textos(frente(p, 64).locator('.and-agora')), ['Próximo: #67 a rega']);
  assert.deepEqual(await textos(frente(p, 56).locator('.and-agora')), ['Concluída; spec fechada.']);
  assert.deepEqual(await textos(frente(p, 85).locator('.and-agora')), ['Planejada; começa por #86 o portão']);
  assert.match(await frente(p, 93).locator('.and-frente-nome').textContent(), /^Pomar novo/);
  assert.equal(await frente(p, 64).locator('.and-barra > span').evaluate((e) => e.style.width), '67%');

  // os tickets: abertas as frentes em andamento; a situação e o link para a issue
  const horta = p.locator('.and-listas details', { hasText: 'spec #64' });
  assert.equal(await horta.getAttribute('open'), '');
  assert.deepEqual(await textos(horta.locator('tbody tr td:nth-child(3)')), ['fechada', 'pronta no código', 'aberta']);
  assert.equal(await horta.locator('a', { hasText: '#66' }).getAttribute('href'), 'https://github.com/exemplo/pomar/issues/66');
  assert.equal(await horta.locator('a', { hasText: '#66' }).getAttribute('target'), '_blank');
  const fora = p.locator('.and-listas details', { hasText: 'Fora das specs' });
  assert.deepEqual(await textos(fora.locator('tbody tr td:nth-child(3)')), ['pronta no código']);
  await semRolagemDeLado(p, `computador ${nome}`);
  await capturar(p, `02-andamento-${nome}`);

  // ler de novo: vai ao GitHub
  const antes = github.estado.pedidos.length;
  await p.locator('.and-ler').click();
  await p.waitForFunction(() => !document.querySelector('.and-ler')?.hasAttribute('disabled'));
  assert.ok(github.estado.pedidos.length > antes, 'ler de novo foi ao GitHub');

  // o GitHub fora: a última leitura, com desde quando
  github.estado.fora = true;
  await p.locator('.and-ler').click();
  await p.locator('.and-aviso.fora').waitFor();
  assert.match(await p.locator('.and-aviso.fora').textContent(), /O GitHub não responde desde .*503.*Vale a última leitura guardada\./);
  assert.equal(await p.locator('.and-frente').count(), 6);
  await capturar(p, `03-github-fora-${nome}`);
  // voltou: "ler de novo" lê e o aviso some
  github.estado.fora = false;
  await p.locator('.and-ler').click();
  await p.locator('.and-aviso.fora').waitFor({ state: 'detached' });
  assert.deepEqual(erros, [], `computador ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: computador ${nome}: menu → trilha, frentes e tickets → ler de novo → GitHub fora (a última leitura)`);
}

async function semSerAdministrador(navegador, url, github) {
  const antes = github.estado.pedidos.length;
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, { email: OUTRA, hash: '' });
  await p.locator('.perfil-botao').click();
  await p.locator('.perfil-painel').waitFor();
  assert.equal(await p.locator('.perfil-painel .perfil-link', { hasText: 'Andamento' }).count(), 0);
  await p.goto(`${url}#/andamento`);
  await p.locator('.aviso', { hasText: 'Só administradores veem o Andamento.' }).waitFor();
  assert.equal(new URL(p.url()).hash, '#/');
  assert.equal(github.estado.pedidos.length, antes, 'quem não é administrador não leva ao GitHub');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: quem não é administrador não vê o item nem abre a página');
}

async function noCelular(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  await p.locator('.and-frente').first().waitFor();
  // a trilha em pé; as tabelas viram linhas
  const colunas = await p.locator('.and-trilha').evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  assert.equal(colunas, 1, 'a trilha em pé no celular');
  assert.equal(await p.locator('.and-tabela thead').first().isVisible(), false);
  await semRolagemDeLado(p, `celular ${nome}`);
  await capturar(p, `04-celular-${nome}`);
  assert.deepEqual(erros, [], `celular ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: celular ${nome}: só consulta, a trilha em pé, sem rolar para o lado`);
}

async function semToken(navegador) {
  const { githubFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'github-falso.mjs'));
  const github = githubFalso();
  const s = await subir({ github, env: { CADASTRO_ADMINS: LIA, GITHUB_REPO: 'exemplo/pomar' } });
  try {
    for (const tema of ['light', 'dark']) {
      const { ctx, p, erros } = await abrir(navegador, s.url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
      await p.locator('.and-aviso').waitFor();
      assert.match(await p.locator('.and-aviso').textContent(), /falta no Portainer: GITHUB_TOKEN \(um token fine-grained.*Ainda não há nenhuma leitura guardada\./);
      assert.equal(await p.locator('.and-ler').count(), 0);
      assert.equal(await p.locator('.and-frente').count(), 0);
      // a trilha é do código: aparece mesmo sem o GitHub
      assert.equal(await p.locator('.and-etapa').count(), 6);
      assert.deepEqual(github.estado.pedidos, []);
      await capturar(p, `05-sem-token-${tema === 'dark' ? 'escuro' : 'claro'}`);
      assert.deepEqual(erros, []);
      await ctx.close();
    }
  } finally {
    await s.descer();
  }
  console.log('ok: sem o GITHUB_TOKEN, a página diz o que falta (claro e escuro)');
}

async function principal() {
  const { GITHUB_FALSO, githubFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'github-falso.mjs'));
  const github = githubFalso();
  const s = await subir({ github, env: { CADASTRO_ADMINS: LIA, ...GITHUB_FALSO } });
  // o convite do tour da revisão não aparece na fila (as duas já viram)
  for (const email of [LIA, OUTRA]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
  const navegador = await chromium.launch();
  let descido = false;
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, github, tema);
    await semSerAdministrador(navegador, s.url, github);
    for (const tema of ['light', 'dark']) await noCelular(navegador, s.url, tema);
    await s.descer();
    descido = true;
    await semToken(navegador);
  } finally {
    await navegador.close();
    if (!descido) await s.descer();
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
