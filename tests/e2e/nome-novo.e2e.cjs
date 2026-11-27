// Ponta a ponta do nome novo da pauta (#132), rodado à parte do vitest: `npm run e2e:nome-novo`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com um Teable falso que lê os
// cadastros de editores (fictícios) e aceita os registros novos dos Cadastros (o editor novo e a key), guardando-os.
//
// Em Montar a pauta, a Bia (da coordenação) escreve na Madrugada um editor que não está nos Cadastros: a lista oferece,
// no fim, "usar “Fê Lopes” como nome novo", já escolhido quando nenhum cadastrado casa, e Enter o confirma (a posição
// mostra a etiqueta "nome novo"). Na Tarde, "Gil Mora" vai pelo Tab. Na Noite, "rui" mostra o Rui e o nome novo; as
// setas andam até o nome novo e voltam, e Enter escolhe o Rui. Publicado o dia, a pauta tem os nomes como foram
// escritos. Nos Editores dos Cadastros, a administradora vê "Nomes novos da pauta, pendentes": a Fê, sem sugestão, e o
// Gil Mora, com o Gil Moura já escolhido ("pelo nome"). Ligar o Gil Mora grava a key no Teable e a pauta passa a
// mostrar o Gil Moura (o dia continua publicado); "Cadastrar como editor novo" cadastra a Fê, que sai da lista e entra
// na lista do montar. A Lia, que não é administradora, não vê a lista. No celular (escuro), a lista cabe na tela.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:nome-novo
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:nome-novo');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const BIA = 'bia.campos@exemplo.com';
const CHEFE = 'chefe.ficticia@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const amanha = new Date(Date.parse(`${hoje}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/* ---------- o Teable falso: os cadastros, que também aceitam os registros novos ---------- */
const ENV_CADASTROS = { TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'falso', TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };
const TABELAS = {
  tblRed: [],
  tblKeyRed: [],
  tblEdi: [
    { id: 'recE1', fields: { editor: 'Rui Teixeira' } },
    { id: 'recE2', fields: { editor: 'Elis Furtado' } },
    { id: 'recE3', fields: { editor: 'Gil Moura' } },
    { id: 'recE4', fields: { editor: 'Bia Campos', email: BIA } },
  ],
  tblKeyEdi: [],
};
const gravadosNoTeable = [];
let proximo = 1;
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  const metodo = init.method ?? 'GET';
  if (u.host !== 'teable-falso') throw new Error(`o teste não sai para a rede: ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(u.pathname);
  if (metodo === 'POST') {
    const novo = { id: `recNovo${proximo++}`, fields: JSON.parse(init.body).records[0].fields };
    TABELAS[tabela].push(novo);
    gravadosNoTeable.push(`${tabela} ${JSON.stringify(novo.fields)}`);
    return { ok: true, status: 200, json: async () => ({ records: [novo] }), text: async () => '' };
  }
  if (metodo !== 'GET') throw new Error(`inesperado: ${metodo} ${u.pathname}`);
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
}

/* ---------- o navegador ---------- */
async function abrir(navegador, url, email, hash, opcoes = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/cadastros/sem-cadastro', (r) => r.fulfill({ json: { keys: [], reconhecidas: { total: 0, amostra: [] } } }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}${hash}`);
  return { ctx, p, erros };
}
const capturar = async (p, nome, opcoes = {}) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), ...opcoes });
};
const campo = (p) => p.evaluate(() => ({ campo: document.activeElement?.getAttribute('data-campo') ?? '', valor: document.activeElement?.value ?? '' }));
const turno = (p, nome) => p.locator('.montar-turno', { has: p.locator('h2', { hasText: new RegExp(`^${nome}$`) }) });
const lerODia = (api) => fetch(`${api}/montar-pauta?dia=${amanha}`, { headers: { 'cf-access-authenticated-user-email': BIA } }).then((r) => r.json());

async function escreverOsNomesNovos(navegador, url, api) {
  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${amanha}`);
  await p.locator('.montar-turno').first().waitFor();
  const lista = p.locator('.montar-lista');
  const opcoes = () => lista.locator('[role="option"] strong').allInnerTexts();

  // nenhum cadastrado casa: o nome novo é a única opção, já escolhida, e Enter o confirma
  await turno(p, 'Madrugada').getByRole('button', { name: '+ posição' }).click();
  await p.keyboard.type('Fê Lopes');
  await lista.waitFor();
  assert.deepEqual(await opcoes(), ['usar “Fê Lopes” como nome novo']);
  assert.equal(await lista.locator('.montar-nome-novo').getAttribute('aria-selected'), 'true');
  await capturar(p, '01-usar-como-nome-novo');
  await p.keyboard.press('Enter');
  assert.equal((await campo(p)).campo, 'ilha', 'Enter confirma o nome novo e segue');
  const madrugada = turno(p, 'Madrugada').locator('.montar-celula').first();
  assert.equal(await madrugada.locator('[data-campo="editor"]').inputValue(), 'Fê Lopes');
  await madrugada.locator('.montar-tag', { hasText: 'nome novo' }).waitFor();

  // pelo Tab, também
  await turno(p, 'Tarde').getByRole('button', { name: '+ posição' }).click();
  await p.keyboard.type('Gil Mora');
  await lista.locator('.montar-nome-novo').waitFor();
  await p.keyboard.press('Tab');
  assert.equal(await turno(p, 'Tarde').locator('[data-campo="editor"]').first().inputValue(), 'Gil Mora', 'o Tab no nome novo fica com o escrito');

  // com um cadastrado que casa, ele vem primeiro; as setas chegam ao nome novo e voltam
  await turno(p, 'Noite').getByRole('button', { name: '+ posição' }).click();
  await p.keyboard.type('rui');
  await lista.locator('.montar-nome-novo').waitFor();
  assert.deepEqual(await opcoes(), ['Rui Teixeira', 'usar “rui” como nome novo']);
  await p.keyboard.press('ArrowDown');
  assert.equal(await lista.locator('.montar-nome-novo').getAttribute('aria-selected'), 'true');
  await p.keyboard.press('ArrowUp');
  await p.keyboard.press('Enter');
  assert.equal(await turno(p, 'Noite').locator('[data-campo="editor"]').first().inputValue(), 'Rui Teixeira');
  await p.locator('.montar-estado', { hasText: 'rascunho guardado' }).waitFor();

  // publicado como foi escrito
  await p.getByRole('button', { name: 'Conferir e publicar →' }).click();
  await p.getByRole('button', { name: 'Publicar a pauta de amanhã' }).click();
  await p.getByText('publicada!').waitFor();
  const dia = await lerODia(api);
  assert.equal(dia.estado, 'publicado');
  assert.deepEqual(dia.posicoes.map((x) => x.editor), ['Fê Lopes', 'Gil Mora', 'Rui Teixeira']);
  assert.deepEqual(erros, [], 'montar: erros na página');
  await ctx.close();
  console.log('ok: a lista do editor aceita "usar como nome novo", e a pauta publica com o nome escrito');
}

async function confirmarNosCadastros(navegador, url, api) {
  const { ctx, p, erros } = await abrir(navegador, url, CHEFE, '#/cadastros/editores');
  const bloco = p.getByRole('region', { name: 'Nomes novos da pauta, pendentes' });
  await bloco.waitFor();
  assert.match(await bloco.locator('.titulo-nomes-novos').innerText(), /Nomes novos da pauta, pendentes\s*2/);
  const fe = bloco.getByRole('group', { name: 'Nome novo: Fê Lopes' });
  const gil = bloco.getByRole('group', { name: 'Nome novo: Gil Mora' });
  assert.match(await fe.innerText(), /\(publicada\)/);
  assert.equal(await fe.getByRole('combobox').inputValue(), '', 'a Fê não parece ninguém');
  assert.equal(await gil.getByRole('combobox').inputValue(), 'recE3', 'o Gil Mora parece o Gil Moura');
  await gil.getByText('pelo nome').waitFor();
  await capturar(p, '02-nomes-novos-nos-cadastros', { fullPage: true });

  // ligar: a key no Teable e o nome do cadastro na pauta
  await gil.getByRole('button', { name: 'Ligar' }).click();
  await p.getByText('Gil Mora agora é Gil Moura: a pauta mostra o nome do cadastro.').waitFor();
  await gil.waitFor({ state: 'detached' });
  assert.ok(gravadosNoTeable.includes('tblKeyEdi {"key":"GIL MORA","editor":[{"id":"recE3"}]}'), 'a key do Gil Moura no Teable');
  let dia = await lerODia(api);
  assert.deepEqual(dia.posicoes.map((x) => x.editor), ['Fê Lopes', 'Gil Moura', 'Rui Teixeira']);
  assert.equal(dia.estado, 'publicado', 'o rascunho e a publicação mudam juntos');

  // cadastrar como editor novo: sai da lista e entra na do montar
  await fe.getByRole('button', { name: 'Cadastrar como editor novo' }).click();
  await p.getByText('Fê Lopes cadastrado.').waitFor();
  await bloco.waitFor({ state: 'detached' });
  assert.ok(gravadosNoTeable.includes('tblEdi {"editor":"Fê Lopes"}'), 'o editor novo no Teable');
  await p.locator('.item-cad', { has: p.locator('.nome', { hasText: 'Fê Lopes' }) }).waitFor();
  dia = await lerODia(api);
  assert.ok(dia.editores.includes('Fê Lopes'), 'a Fê entra na lista do montar');
  assert.deepEqual(erros, [], 'cadastros: erros na página');
  await ctx.close();
  console.log('ok: nos Cadastros, o nome novo pendente é ligado a quem já existe ou cadastrado');
}

async function quemNaoEAdministrador(navegador, url, api) {
  // um nome novo de novo, para a lista ter o que mostrar
  const corpo = { posicoes: [{ id: 'pos-e2e-1', turno: 'tarde', editor: 'Duda Reis', horario: '14h às 22h', demandas: [] }] };
  const h = (email) => ({ 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' });
  const depois = new Date(Date.parse(`${amanha}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  assert.equal((await fetch(`${api}/montar-pauta?dia=${depois}`, { method: 'PUT', headers: h(BIA), body: JSON.stringify(corpo) })).status, 200);
  const { ctx, p, erros } = await abrir(navegador, url, LIA, '#/cadastros/editores');
  await p.locator('.item-cad', { has: p.locator('.nome', { hasText: 'Rui Teixeira' }) }).waitFor();
  assert.equal(await p.locator('.nome-novo-cad').count(), 0, 'a Lia não vê os nomes novos');
  assert.deepEqual(erros, [], 'Lia: erros na página');
  await ctx.close();

  // no celular (escuro), a administradora vê a lista sem rolar para o lado
  const celular = await abrir(navegador, url, CHEFE, '#/cadastros/editores', { viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
  await celular.p.getByRole('group', { name: 'Nome novo: Duda Reis' }).waitFor();
  assert.ok(await celular.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'celular: a página não rola para o lado');
  await capturar(celular.p, '03-nomes-novos-celular');
  assert.deepEqual(celular.erros, [], 'celular: erros na página');
  await celular.ctx.close();
  console.log('ok: só administradores veem os nomes novos; no celular, cabe na tela');
}

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: CHEFE }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: CHEFE } });
  for (const quem of [LIA, BIA, CHEFE]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': quem } });
  await fetch(`${s.api}/cadastros/coordenacao`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': CHEFE, 'content-type': 'application/json' }, body: JSON.stringify({ email: BIA }) });
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    await escreverOsNomesNovos(navegador, s.url, s.api);
    await confirmarNosCadastros(navegador, s.url, s.api);
    await quemNaoEAdministrador(navegador, s.url, s.api);
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
