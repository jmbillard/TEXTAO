// Ponta a ponta da aba Padeiros dos Cadastros (#137), rodado à parte do vitest: `npm run e2e:padeiros`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o Teable de mentira só
// para a tabela designers (os designers fictícios que a Configuração · Pessoas lê). Os Padeiros pedem a chave pela rota
// de verdade (/api/padeiro/cadastro, sem login) e conferem o estado dela em /api/padeiro/eu. No computador, claro e
// escuro: a aba com o número de pendentes, a lista (usuário, computador, sigla, designer e último aviso), a sugestão de
// designer pela sigla, a busca; ligar (o Padeiro passa a ver "ligada", com o designer), trocar o designer e revogar
// com a confirmação (o Padeiro vê "revogada"; a linha não oferece ligar de novo). O recadastro de um Padeiro ligado
// não derruba a chave: o pedido novo aparece logo acima da ligada, recusar mantém a de agora, aprovar troca (a de
// antes cai). Quem não é administrador não vê a aba. No celular: a lista sem rolar para o lado.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:padeiros
// Com CAPTURAS=pasta, grava as capturas de cada tela (densidade 2).
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:padeiros');
  process.exit(2);
}

const RAIZ = join(__dirname, '..', '..');
const LIA = 'lia.moraes@exemplo.com';
const OUTRA = 'rui.alves@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };
const CADASTROS = { ligado: true, atracoes: [], redatores: [], editores: [], categorias: [], camposCaminho: [], formulas: {} };
// os designers fictícios da tabela designers (o Davi está inativo e não aparece na escolha)
const DESIGNERS = [
  { id: 'recDesignerDora', fields: { designer: 'Dora Lima', email: 'dora.lima@exemplo.com', designer_ID: 'membroDora', status: 'ativo' } },
  { id: 'recDesignerEnzo', fields: { designer: 'Enzo Prado', email: 'enzo@exemplo.com', designer_ID: 'membroEnzo', status: 'ativo' } },
  { id: 'recDesignerDavi', fields: { designer: 'Davi Antigo', email: 'davi@exemplo.com', status: 'inativo' } },
];
// os Padeiros fictícios: a Dora pela sigla (o primeiro nome), o Enzo pelas iniciais, e um computador emprestado
const PEDIDOS = [
  { usuario: 'dora.lima', computador: 'MAC-ARTE-07', sistema: 'macOS 15.1', sigla: 'DORA' },
  { usuario: 'eprado', computador: 'WIN-ARTE-02', sistema: 'Windows 11', sigla: 'EP' },
  { usuario: 'visita', computador: 'MAC-EMPRESTADO', sistema: 'macOS 14.6', sigla: 'XYZ' },
];

async function abrir(navegador, url, opcoes, { email = LIA, admin = true } = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/cadastros', (r) => r.fulfill({ json: { ...CADASTROS, podeApagar: admin } }));
  await ctx.route((u) => u.pathname === '/api/cadastros/sem-cadastro', (r) => r.fulfill({ json: { keys: [], reconhecidas: { total: 0, amostra: [] } } }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  // a aba Duplicadas não é o assunto aqui
  await ctx.route((u) => u.pathname.startsWith('/api/duplicadas'), (r) => r.fulfill({ json: { ligado: false } }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/cadastros/atracoes`);
  await p.waitForSelector('.abas-cad');
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
const linha = (p, usuario) => p.locator('.item-pad', { has: p.locator('.usuario-pad', { hasText: usuario }) });
const texto = async (l) => (await l.innerText()).replace(/\s+/g, ' ').trim();

/** O Padeiro, sem login: o estado da chave dele. */
async function quemSou(api, chave) {
  const r = await fetch(`${api}/padeiro/eu`, { headers: { 'x-chave-do-padeiro': chave } });
  return r.status === 200 ? r.json() : { status: r.status };
}

async function abrirAAba(p) {
  await p.locator('.abas-cad .aba-pad').click();
  await p.locator('.item-pad').first().waitFor();
}

async function noComputador(navegador, s, tema, chaves) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros } = await abrir(navegador, s.url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  // o número de pendentes já vem na aba, antes de abrir
  const aba = p.locator('.abas-cad .aba-pad');
  await aba.locator('sup', { hasText: '3' }).waitFor();
  await abrirAAba(p);
  assert.equal((await aba.locator('.rot').textContent()).trim(), 'Padeiros 3');
  assert.equal(await p.locator('.cad-busca input').getAttribute('placeholder'), 'Buscar usuário, sigla ou designer');
  assert.deepEqual(await p.locator('.item-pad .usuario-pad').allTextContents(), ['dora.lima', 'eprado', 'visita']);
  const dora = linha(p, 'dora.lima');
  assert.match(await texto(dora), /dora\.lima em MAC-ARTE-07 pendente nenhum aviso ainda sigla DORA macOS 15\.1 pediu a chave/i);
  // a sugestão pela sigla já vem escolhida; o computador emprestado não tem sugestão
  assert.equal(await dora.locator('select option:checked').textContent(), 'Dora Lima');
  assert.equal(await dora.locator('.sugestao-pad').textContent(), 'pela sigla');
  assert.equal(await linha(p, 'eprado').locator('select option:checked').textContent(), 'Enzo Prado');
  assert.equal(await linha(p, 'visita').locator('select option:checked').textContent(), 'Escolha…');
  assert.equal(await linha(p, 'visita').getByRole('button', { name: 'Ligar' }).isDisabled(), true);
  // o designer inativo não está na escolha
  assert.deepEqual(await dora.locator('select option').allTextContents(), ['Dora Lima', 'Enzo Prado']);
  // a chave nunca vem ao navegador
  assert.ok(!(await p.content()).includes(chaves[0]), 'a chave não aparece na tela');
  // o painel da direita
  assert.match(await texto(p.locator('.painel-pad')), /Chave do Padeiro .* 3 pendentes 0 ligadas 0 revogadas/);
  // a busca
  await p.locator('.cad-busca input').fill('win-arte');
  await p.waitForFunction(() => document.querySelectorAll('.item-pad').length === 1);
  assert.deepEqual(await p.locator('.item-pad .usuario-pad').allTextContents(), ['eprado']);
  await p.locator('.cad-busca input').fill('');
  await p.waitForFunction(() => document.querySelectorAll('.item-pad').length === 3);
  await semRolagemDeLado(p, `computador ${nome}`);
  await capturar(p, `01-padeiros-${nome}`);
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function ligarERevogar(navegador, s, chaves) {
  const { ctx, p, erros } = await abrir(navegador, s.url, { viewport: { width: 1440, height: 1000 } });
  await abrirAAba(p);
  // ligar a Dora (a sugestão): a linha fica "ligada", com o botão Trocar; o Padeiro passa a ver ligada, com o designer
  await linha(p, 'dora.lima').getByRole('button', { name: 'Ligar' }).click();
  await linha(p, 'dora.lima').locator('.estado-pad.ligada').waitFor();
  assert.deepEqual(await p.locator('.item-pad .usuario-pad').allTextContents(), ['eprado', 'visita', 'dora.lima'], 'os pendentes primeiro');
  assert.match(await texto(linha(p, 'dora.lima')), new RegExp(`ligada por ${LIA.replace('.', '\\.')}`));
  assert.equal((await p.locator('.abas-cad .aba-pad .rot').textContent()).trim(), 'Padeiros 2');
  assert.deepEqual(await quemSou(s.api, chaves[0]), { estado: 'ligada', usuario: 'dora.lima', computador: 'MAC-ARTE-07', sigla: 'DORA', designer: { nome: 'Dora Lima' } });
  // ligar o computador emprestado escolhendo à mão
  await linha(p, 'visita').locator('select').selectOption({ label: 'Enzo Prado' });
  await linha(p, 'visita').getByRole('button', { name: 'Ligar' }).click();
  await linha(p, 'visita').locator('.estado-pad.ligada').waitFor();
  // trocar o designer da ligada
  const visita = linha(p, 'visita');
  assert.equal(await visita.getByRole('button', { name: 'Trocar' }).isDisabled(), true, 'sem mudar a escolha, não troca');
  await visita.locator('select').selectOption({ label: 'Dora Lima' });
  await visita.getByRole('button', { name: 'Trocar' }).click();
  await p.waitForFunction(() => [...document.querySelectorAll('.item-pad')].some((l) => l.textContent.includes('visita') && l.querySelector('select option:checked')?.textContent === 'Dora Lima' && l.querySelector('button.primario')?.disabled));
  assert.equal((await quemSou(s.api, chaves[2])).designer.nome, 'Dora Lima');
  await capturar(p, '02-padeiros-ligados');
  // revogar a Dora: pede a confirmação; cancelar não revoga
  const doraLigada = linha(p, 'dora.lima');
  await doraLigada.getByRole('button', { name: 'Revogar' }).click();
  await doraLigada.getByRole('button', { name: 'cancelar' }).click();
  assert.equal((await quemSou(s.api, chaves[0])).estado, 'ligada');
  await doraLigada.getByRole('button', { name: 'Revogar' }).click();
  await doraLigada.getByRole('button', { name: 'Revogar a chave' }).click();
  await linha(p, 'dora.lima').locator('.estado-pad.revogada').waitFor();
  assert.equal((await quemSou(s.api, chaves[0])).estado, 'revogada');
  // a revogada não oferece ligar de novo: o Padeiro pede outra chave
  const revogada = linha(p, 'dora.lima');
  assert.equal(await revogada.locator('select').count(), 0);
  assert.match(await texto(revogada), /era de Dora Lima .*o Padeiro pede outra chave/);
  assert.match(await texto(p.locator('.painel-pad')), /1 pendente 1 ligada 1 revogada/);
  await capturar(p, '03-padeiro-revogado');
  // o Padeiro pede outra chave: a linha volta a pendente, e a antiga não vale mais
  const nova = await fetch(`${s.api}/padeiro/cadastro`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(PEDIDOS[0]) }).then((r) => r.json());
  assert.equal((await quemSou(s.api, chaves[0])).status, 401);
  assert.equal((await quemSou(s.api, nova.chave)).estado, 'pendente');
  await p.reload();
  await abrirAAba(p);
  await linha(p, 'dora.lima').locator('.estado-pad.pendente').waitFor();
  assert.deepEqual(erros, []);
  await ctx.close();
}

const pedirAChave = (api, pedido) => fetch(`${api}/padeiro/cadastro`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pedido) }).then((r) => r.json());

/** O computador emprestado (ligado à Dora em ligarERevogar) pede a chave de novo: o pedido novo, ao lado da ligada. */
async function recadastroDoLigado(navegador, s, chaves) {
  const { ctx, p, erros } = await abrir(navegador, s.url, { viewport: { width: 1440, height: 1000 } });
  const primeiro = await pedirAChave(s.api, { ...PEDIDOS[2], sistema: 'macOS 15.0' });
  assert.equal(primeiro.estado, 'pendente');
  assert.equal((await quemSou(s.api, chaves[2])).estado, 'ligada', 'a chave ligada não cai com o recadastro');
  await abrirAAba(p);
  const visitas = p.locator('.item-pad', { has: p.locator('.usuario-pad', { hasText: 'visita' }) });
  await p.waitForFunction(() => document.querySelectorAll('.item-pad.pad-novo').length === 1);
  assert.equal(await visitas.count(), 2);
  // o pedido novo vem logo acima da ligada, com a marca, o designer de agora sugerido e o que aprovar faz
  const pedido = visitas.nth(0);
  assert.match(await texto(pedido), /visita em MAC-EMPRESTADO pendente pedido novo do mesmo computador .*macOS 15\.0/i);
  assert.match(await texto(pedido), /Aprovar troca a chave: a de agora, ligada a Dora Lima, deixa de valer\. Recusar mantém a de agora\./);
  assert.equal(await pedido.locator('select option:checked').textContent(), 'Dora Lima');
  assert.equal(await pedido.locator('.sugestao-pad').textContent(), 'o de agora');
  assert.match(await texto(visitas.nth(1)), /visita em MAC-EMPRESTADO ligada/i);
  await capturar(p, '05-pedido-novo');
  // recusar: a de agora continua ligada
  await pedido.getByRole('button', { name: 'Recusar' }).click();
  await pedido.locator('.estado-pad.revogada').waitFor();
  assert.equal((await quemSou(s.api, chaves[2])).estado, 'ligada');
  assert.equal((await quemSou(s.api, primeiro.chave)).estado, 'revogada');
  // pede de novo e o administrador aprova: a nova fica ligada, a de antes cai, e sobra uma linha
  const segundo = await pedirAChave(s.api, { ...PEDIDOS[2], sistema: 'macOS 15.0' });
  await p.reload();
  await abrirAAba(p);
  await p.locator('.item-pad.pad-novo .estado-pad.pendente').waitFor();
  await p.locator('.item-pad.pad-novo').getByRole('button', { name: 'Aprovar' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.item-pad.pad-novo').length === 0);
  assert.equal(await visitas.count(), 1);
  assert.match(await texto(visitas.first()), /visita em MAC-EMPRESTADO ligada .*macOS 15\.0/i);
  assert.equal((await quemSou(s.api, chaves[2])).status, 401, 'a chave de antes caiu');
  assert.deepEqual(await quemSou(s.api, segundo.chave), { estado: 'ligada', usuario: 'visita', computador: 'MAC-EMPRESTADO', sigla: 'XYZ', designer: { nome: 'Dora Lima' } });
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function semSerAdministrador(navegador, s) {
  const { ctx, p, erros } = await abrir(navegador, s.url, { viewport: { width: 1440, height: 1000 } }, { email: OUTRA, admin: false });
  await p.waitForTimeout(500);
  assert.equal(await p.locator('.abas-cad .aba-pad').count(), 0, 'quem não é administrador não vê a aba');
  const r = await fetch(`${s.api}/cadastros/padeiros`, { headers: { 'cf-access-authenticated-user-email': OUTRA } });
  assert.equal(r.status, 403);
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function noCelular(navegador, s) {
  const { ctx, p, erros } = await abrir(navegador, s.url, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await abrirAAba(p);
  assert.equal(await p.locator('.item-pad').count(), 3);
  await semRolagemDeLado(p, 'celular');
  await capturar(p, '04-padeiros-celular');
  assert.deepEqual(erros, []);
  await ctx.close();
}

async function principal() {
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const teable = teableFalso({ ARTE_producao: 'arte_e2e', designers: 'designers_e2e' }, { registros: { ARTE_producao: [], designers: DESIGNERS } });
  const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
  const { comTabelas } = await import(join(RAIZ, 'servidor', 'tabelas-do-teable.mjs'));
  // a verificação das Pessoas (de onde saem os designers) precisa da produção da arte; o Trello não é chamado
  const semTrello = async (u) => {
    throw new Error(`o teste não sai para a rede: ${u}`);
  };
  const trello = { env: { ...PG, ...comTabelas({ ARTE_producao: 'arte_e2e' }) }, consultar: teable.consultar, buscar: semTrello };
  const s = await subir({ teable, pg: teable.abrirPg, trello, env: { CADASTRO_ADMINS: LIA, ...TEABLE_FALSO, ...PG } });
  await s.app.pessoasProntas;
  const chaves = [];
  for (const pedido of PEDIDOS) {
    const r = await fetch(`${s.api}/padeiro/cadastro`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pedido) });
    assert.equal(r.status, 201, 'o cadastro do Padeiro');
    chaves.push((await r.json()).chave);
  }
  const navegador = await chromium.launch();
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s, tema, chaves);
    console.log('ok: a aba Padeiros: o número de pendentes, a lista, a sugestão pela sigla, a busca, claro e escuro');
    await semSerAdministrador(navegador, s);
    console.log('ok: quem não é administrador não vê a aba (e a rota recusa)');
    await noCelular(navegador, s);
    console.log('ok: no celular, a lista sem rolar para o lado');
    await ligarERevogar(navegador, s, chaves);
    console.log('ok: ligar, trocar o designer e revogar com a confirmação; o Padeiro vê cada estado; o cadastro novo volta a pendente');
    await recadastroDoLigado(navegador, s, chaves);
    console.log('ok: o recadastro do ligado vira um pedido novo ao lado; recusar mantém a chave, aprovar troca (a de antes cai)');
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
