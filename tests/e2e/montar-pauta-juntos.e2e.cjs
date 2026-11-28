// Ponta a ponta de Montar a pauta com duas pessoas ao mesmo tempo (#131), rodado à parte do vitest:
// `npm run e2e:montar-pauta-juntos`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com um Teable falso que só
// responde os cadastros (fictícios). A Bia e a Ana, as duas da coordenação, abrem o mesmo dia, cada uma no seu
// navegador. Cada uma vê a outra no alto da tela ("Ana também está montando este dia"). A Ana entra no horário do Rui e
// a Bia vê o campo com o contorno e o nome dela; a Bia entra no mesmo campo e digita: ninguém fica bloqueado. Ao mesmo
// tempo, a Ana muda o horário do Rui e a Bia escreve uma info na claquete dele (#199: as claquetes são escolhidas das
// Produções; a info é o texto que se digita): as duas mudanças aparecem nas duas telas, e nenhuma desfaz a outra. A Ana
// escreve o recado do dia e escala o Gil na vaga pelo "Escalar na…" da coluna (uma ação do servidor) enquanto a Bia
// digita uma info na Elis: tudo aparece nas duas, sem perder o que a Bia digitava. Recarregadas as
// duas, o dia volta com o trabalho das duas. Quando a Ana sai, a Bia deixa de vê-la.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:montar-pauta-juntos
// Com CAPTURAS=pasta, grava as capturas (densidade 2).
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');
const RAIZ = join(__dirname, '..', '..');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:montar-pauta-juntos');
  process.exit(2);
}

const BIA = 'bia.campos@exemplo.com';
const ANA = 'ana.prado@exemplo.com';
const CHEFE = 'chefe.ficticia@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const mais = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const DIA = mais(hoje, 2);
const diaMes = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;

const ENV_CADASTROS = { TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'falso', TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };
const TABELAS = {
  tblRed: [],
  tblKeyRed: [],
  tblEdi: [
    { id: 'recE1', fields: { editor: 'Rui Teixeira' } },
    { id: 'recE2', fields: { editor: 'Elis Furtado' } },
    { id: 'recE3', fields: { editor: 'Gil Moura' } },
    { id: 'recE4', fields: { editor: 'Bia Campos', email: BIA } },
    { id: 'recE5', fields: { editor: 'Ana Prado', email: ANA } },
  ],
  tblKeyEdi: [],
};
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  if (u.host !== 'teable-falso') throw new Error(`o teste não sai para a rede: ${url}`);
  if ((init.method ?? 'GET') !== 'GET') throw new Error(`montar a pauta não escreve no Teable: ${u.pathname}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(u.pathname);
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
}

async function abrir(navegador, url, email) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}) });
  // o WebSocket do navegador não leva o cabeçalho: o servidor do teste lê o e-mail do cookie
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(email), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/cadastros/sem-cadastro', (r) => r.fulfill({ json: { keys: [], reconhecidas: { total: 0, amostra: [] } } }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/pauta/montar/${DIA}`);
  await p.locator('.montar-turno').first().waitFor();
  return { ctx, p, erros };
}
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
};
const IDS = { 'Rui Teixeira': 'pos-rui', 'Elis Furtado': 'pos-elis' };
const celulaDe = (p, editor) => p.locator(`.montar-celula[data-posicao-id="${IDS[editor]}"]`);
/** Espera o valor de um campo (o que chega da outra pessoa leva um instante). */
const esperarValor = (p, seletor, valor, oQue) =>
  p
    .waitForFunction(([s, v]) => [...document.querySelectorAll(s)].some((el) => el.value === v), [seletor, valor], { timeout: 8000 })
    .catch(async () => assert.fail(`${oQue}: esperava "${valor}", está ${JSON.stringify(await p.evaluate((s) => [...document.querySelectorAll(s)].map((el) => el.value), seletor))}`));

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: CHEFE }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: CHEFE } });
  const como = (email) => (caminho, init = {}) => fetch(`${s.api}${caminho}`, { ...init, headers: { 'content-type': 'application/json', 'cf-access-authenticated-user-email': email, ...init.headers } });
  for (const quem of [BIA, ANA, CHEFE]) await como(quem)('/eu/tour', { method: 'POST' });
  for (const email of [BIA, ANA]) assert.equal((await como(CHEFE)('/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email }) })).status, 200);
  // o dia já começado: o Rui na Madrugada, a Elis e uma vaga na Tarde
  const posicoes = [
    { id: 'pos-rui', turno: 'madrugada', editor: 'Rui Teixeira', ilha: '', horario: '22h às 6h', demandas: [{ id: 'd-gala', texto: `Noite de Gala ${diaMes(DIA)} (DP)` }], avisos: [] },
    { id: 'pos-elis', turno: 'tarde', editor: 'Elis Furtado', ilha: '', horario: '14h às 23h', demandas: [{ id: 'd-mundo', texto: `Mundo Animal ${diaMes(DIA)} (P)` }], avisos: [] },
    { id: 'pos-vaga', turno: 'tarde', editor: '', ilha: '', horario: '14h às 23h', demandas: [], avisos: [] },
  ];
  assert.equal((await como(BIA)(`/montar-pauta?dia=${DIA}`, { method: 'PUT', body: JSON.stringify({ posicoes, recado: '' }) })).status, 200);

  const navegador = await chromium.launch();
  let falhou = false;
  try {
    const bia = await abrir(navegador, s.url, BIA);
    const ana = await abrir(navegador, s.url, ANA);

    // presença: cada uma vê a outra no alto
    await bia.p.locator('.juntos-no-dia', { hasText: 'Ana também está montando este dia' }).waitFor();
    await ana.p.locator('.juntos-no-dia', { hasText: 'Bia também está montando este dia' }).waitFor();
    console.log('ok: cada uma vê a outra no dia');

    // a Ana entra no horário do Rui: a Bia vê o campo marcado com o nome dela
    await celulaDe(ana.p, 'Rui Teixeira').locator('[data-campo="horario"]').click();
    const marca = bia.p.locator('.marca-do-outro', { hasText: 'Ana' });
    await marca.waitFor();
    const caixa = await marca.boundingBox();
    const campo = await celulaDe(bia.p, 'Rui Teixeira').locator('[data-campo="horario"]').boundingBox();
    assert.ok(caixa && campo && Math.abs(caixa.x + 3 - campo.x) < 2 && Math.abs(caixa.y + 3 - campo.y) < 2, 'a marca da Ana está em volta do horário do Rui');
    await capturar(bia.p, '01-bia-ve-a-ana-no-horario');
    console.log('ok: a Bia vê em que campo a Ana está');

    // ao mesmo tempo: a Ana muda o horário do Rui; a Bia escreve uma info na claquete do Rui
    await ana.p.keyboard.press('ControlOrMeta+a');
    await ana.p.keyboard.type('23 as 7');
    const galaDaBia = celulaDe(bia.p, 'Rui Teixeira').locator('.montar-demanda.t-claquete').first();
    await galaDaBia.hover();
    await galaDaBia.getByRole('button', { name: '+ info' }).click();
    await bia.p.keyboard.type('VEM PRONTA DA PROMO');
    await ana.p.keyboard.press('Tab');
    await esperarValor(bia.p, '[data-posicao="pos-rui"][data-campo="horario"]', '23h às 7h', 'a Bia vê o horário da Ana');
    // a Ana vê a info da Bia, embaixo da claquete
    await esperarValor(ana.p, '[data-posicao="pos-rui"][data-campo="demanda"]', 'VEM PRONTA DA PROMO', 'a Ana vê a info da Bia');
    const daAna = await celulaDe(ana.p, 'Rui Teixeira').locator('input[data-campo="demanda"]').evaluateAll((els) => els.map((el) => el.value));
    assert.deepEqual(daAna, ['VEM PRONTA DA PROMO'], 'uma info só, sem linha vazia');
    assert.equal(await celulaDe(bia.p, 'Rui Teixeira').locator('input[data-campo="demanda"]').first().inputValue(), 'VEM PRONTA DA PROMO', 'a Bia continua com o que digitou');
    console.log('ok: as duas mexem no Rui ao mesmo tempo e veem as duas mudanças');

    // ninguém fica bloqueado: a Bia entra no campo em que a Ana está e digita
    await celulaDe(ana.p, 'Elis Furtado').locator('[data-campo="horario"]').click();
    await bia.p.locator('.marca-do-outro', { hasText: 'Ana' }).waitFor();
    const horarioDaElis = celulaDe(bia.p, 'Elis Furtado').locator('[data-campo="horario"]');
    await horarioDaElis.click();
    await bia.p.keyboard.press('ControlOrMeta+a');
    await bia.p.keyboard.type('15 as 23');
    assert.equal(await horarioDaElis.inputValue(), '15 as 23', 'a Bia digita no campo em que a Ana está');
    await bia.p.keyboard.press('Tab');
    await esperarValor(ana.p, '[data-posicao="pos-elis"][data-campo="horario"]', '15h às 23h', 'a Ana vê o horário que a Bia escreveu');
    await capturar(ana.p, '02-ana-ve-a-bia-na-elis');
    console.log('ok: ninguém fica bloqueado no campo da outra');

    // a Ana escreve o recado e escala o Gil na vaga pela coluna, enquanto a Bia digita uma info da Elis
    const mundoDaBia = celulaDe(bia.p, 'Elis Furtado').locator('.montar-demanda.t-claquete').first();
    await mundoDaBia.hover();
    await mundoDaBia.getByRole('button', { name: '+ info' }).click();
    await bia.p.keyboard.type('VIRA');
    await ana.p.locator('[data-campo="recado"]').fill('reunião de pauta às 15h');
    await ana.p.getByLabel('Escalar Gil Moura na…').selectOption('posicao:pos-vaga');
    await bia.p.keyboard.type(' B');
    await esperarValor(bia.p, '[data-campo="recado"]', 'reunião de pauta às 15h', 'a Bia vê o recado da Ana');
    await esperarValor(ana.p, '[data-posicao="pos-vaga"][data-campo="editor"]', 'Gil Moura', 'a Ana vê o Gil que escalou');
    await esperarValor(bia.p, '[data-posicao="pos-vaga"][data-campo="editor"]', 'Gil Moura', 'a Bia vê o Gil escalado pela Ana');
    await esperarValor(ana.p, '[data-posicao="pos-elis"][data-campo="demanda"]', 'VIRA B', 'a Ana vê a info da Bia');
    assert.equal(await celulaDe(bia.p, 'Elis Furtado').locator('input[data-campo="demanda"]').first().inputValue(), 'VIRA B', 'a Bia não perdeu o que digitava');
    await capturar(bia.p, '03-as-duas-no-mesmo-dia');
    console.log('ok: a ação da coluna e o recado da Ana não apagam o que a Bia digitava');

    // recarregadas as duas, o dia tem o trabalho das duas
    await bia.p.waitForFunction(() => /rascunho guardado/.test(document.querySelector('.montar-estado')?.textContent ?? ''));
    await ana.p.waitForFunction(() => /rascunho guardado/.test(document.querySelector('.montar-estado')?.textContent ?? ''));
    const gravado = await (await como(BIA)(`/montar-pauta?dia=${DIA}`)).json();
    const p = (id) => gravado.posicoes.find((x) => x.id === id);
    assert.equal(p('pos-rui').horario, '23h às 7h');
    assert.deepEqual(p('pos-rui').demandas.map((d) => d.texto), [`Noite de Gala ${diaMes(DIA)} (DP)`, 'VEM PRONTA DA PROMO']);
    assert.equal(p('pos-elis').horario, '15h às 23h');
    assert.deepEqual(p('pos-elis').demandas.map((d) => d.texto), [`Mundo Animal ${diaMes(DIA)} (P)`, 'VIRA B']);
    assert.equal(p('pos-vaga').editor, 'Gil Moura');
    assert.equal(gravado.recado, 'reunião de pauta às 15h');
    await bia.p.reload();
    await esperarValor(bia.p, '[data-posicao="pos-rui"][data-campo="horario"]', '23h às 7h', 'recarregada, o horário da Ana');
    await esperarValor(bia.p, '[data-posicao="pos-vaga"][data-campo="editor"]', 'Gil Moura', 'recarregada, o Gil');
    console.log('ok: recarregado, o dia tem o trabalho das duas');

    // a Ana sai: a Bia deixa de vê-la
    await ana.ctx.close();
    await bia.p.locator('.juntos-no-dia').waitFor({ state: 'detached', timeout: 8000 });
    assert.equal(await bia.p.locator('.marca-do-outro').count(), 0);
    console.log('ok: quem sai some do dia');
    assert.deepEqual([...bia.erros, ...ana.erros], [], 'erros na página');
    await bia.ctx.close();
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
