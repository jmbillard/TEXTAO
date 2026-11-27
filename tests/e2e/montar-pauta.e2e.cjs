// Ponta a ponta de Montar a pauta (#123), rodado à parte do vitest: `npm run e2e:montar-pauta`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com um Teable falso que só
// responde os cadastros de redatores e editores (fictícios). Nada vai ao Teable: o rascunho fica no SQLite.
//
// O papel: a administradora marca a Bia como coordenação nos Editores dos Cadastros. A Lia (que não é da coordenação)
// não vê a entrada "Montar a pauta" no topo, e o endereço da tela a leva para a Pauta, com o aviso; a rota recusa.
// A Bia vê a entrada ao lado da Pauta, no grupo "De todo mundo", e abre a tela em amanhã, com as abas da semana (o dia
// vazio). Tudo pelo teclado: "+ posição" na Madrugada põe o foco no editor; "rui" mostra o Rui na lista (livre) e Enter
// escolhe e vai ao horário; "22 AS 06" mostra "grava 22h às 6h" e, ao sair, vira o padrão; a demanda mostra o que o
// PROMeiro entendeu (a atração, a data, as versões como etiquetas e a grafia no padrão); Enter cria uma linha, Backspace
// na linha vazia apaga, as setas andam entre as linhas. Na Tarde, o Rui aparece "já na madrugada" na lista, e o Tab
// completa "eli" com a Elis. O rascunho é gravado sozinho: a aba de amanhã passa a rascunho e, recarregada a página,
// tudo volta como foi gravado (o horário e a claquete no padrão). Outro dia da semana continua vazio. No celular
// (escuro), o rascunho cabe na tela, sem rolar para o lado.
// As ilhas e os turnos (#124): a Bia cadastra as ilhas na aba Ilhas dos Cadastros (AVID 46, VDI 7 com nome e ILHA 46,
// que fica como está escrita); a Lia vê a lista, sem cadastrar. Com o histórico de uma semana antes (o Rui na AVID 46),
// escolher o Rui leva à ilha, com a AVID 46 "de costume" no alto da lista, e Enter a confirma; "avid46" e Tab acham a
// ilha da Elis; o Gil na mesma ilha da Elis, na Tarde, mostra "ocupada". Recarregada, a ilha volta como foi gravada.
// Os turnos vêm da Configuração: com um turno salvo a mais (Plantão), a grade ganha o bloco dele.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:montar-pauta
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:montar-pauta');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const BIA = 'bia.campos@exemplo.com';
const CHEFE = 'chefe.ficticia@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

/* ---------- as datas, sempre em São Paulo ---------- */
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const mais = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const amanha = mais(hoje, 1);
const segunda = mais(amanha, -((new Date(`${amanha}T12:00:00Z`).getUTCDay() + 6) % 7));
const diaMes = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const semanaDe = (iso) => SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];

/* ---------- o Teable falso: só os cadastros, só leitura ---------- */
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
const escritasNoTeable = [];
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  const metodo = init.method ?? 'GET';
  if (u.host !== 'teable-falso') throw new Error(`o teste não sai para a rede: ${url}`);
  if (metodo !== 'GET') {
    escritasNoTeable.push(`${metodo} ${u.pathname}`);
    throw new Error(`montar a pauta não escreve no Teable: ${metodo} ${u.pathname}`);
  }
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(u.pathname);
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
const focado = (p) => p.evaluate(() => {
  const el = document.activeElement;
  return { campo: el?.getAttribute('data-campo') ?? '', valor: el?.value ?? '', posicao: el?.getAttribute('data-posicao') ?? '' };
});
const turno = (p, nome) => p.locator('.montar-turno', { has: p.locator('h2', { hasText: new RegExp(`^${nome}$`) }) });
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);

async function marcarACoordenacao(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, CHEFE, '#/cadastros/editores');
  const linha = p.locator('.item-cad', { has: p.locator('.nome', { hasText: 'Bia Campos' }) });
  await linha.waitFor();
  // só quem tem e-mail pode ser marcado
  assert.equal(await p.locator('.item-cad', { has: p.locator('.nome', { hasText: 'Rui Teixeira' }) }).locator('.coordenacao-cad').count(), 0, 'sem e-mail, sem coordenação');
  await linha.getByRole('button', { name: '+ coordenação' }).click();
  await linha.locator('.coordenacao-cad.marcada').waitFor();
  assert.equal(await linha.locator('.coordenacao-cad').getAttribute('aria-pressed'), 'true');
  // a marca fica: recarregada a página, continua
  await p.reload();
  await p.locator('.item-cad', { has: p.locator('.nome', { hasText: 'Bia Campos' }) }).locator('.coordenacao-cad.marcada').waitFor();
  assert.deepEqual(erros, [], 'cadastros: erros na página');
  await ctx.close();
  console.log('ok: a administradora marca a coordenação nos Editores');
}

async function quemNaoEDaCoordenacao(navegador, url, api) {
  const { ctx, p, erros } = await abrir(navegador, url, LIA, '');
  await p.locator('.de-todo-mundo .topo-pauta').first().waitFor();
  assert.equal(await p.locator('.topo-montar').count(), 0, 'a Lia não vê a entrada');
  await p.goto(`${url}#/pauta/montar`);
  await p.waitForFunction(() => location.hash === '#/pauta');
  await p.getByText('Só a coordenação monta a pauta.').waitFor();
  assert.equal(await p.locator('.montar-pauta').count(), 0, 'a tela não aparece');
  const r = await fetch(`${api}/montar-pauta`, { headers: { 'cf-access-authenticated-user-email': LIA } });
  assert.equal(r.status, 403, 'a rota recusa');
  assert.deepEqual(erros, [], 'Lia: erros na página');
  await ctx.close();
  console.log('ok: quem não é da coordenação não vê a tela, e a rota recusa');
}

async function montarPeloTeclado(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, BIA, '');
  // a entrada, ao lado da Pauta, no grupo De todo mundo
  const entrada = p.locator('.de-todo-mundo .topo-montar');
  await entrada.waitFor();
  await entrada.click();
  await p.waitForFunction(() => location.hash === '#/pauta/montar');
  await p.locator('.montar-turno').first().waitFor();
  // amanhã, vazio, com as abas da semana
  const abas = p.locator('.montar-aba');
  assert.equal(await abas.count(), 7, 'as sete abas da semana');
  assert.match(await abas.first().innerText(), new RegExp(`SEG\\s+${diaMes(segunda)}`));
  const abaDeAmanha = p.locator('.montar-aba[aria-current="page"]');
  assert.match(await abaDeAmanha.innerText(), /amanhã/);
  assert.equal(await abaDeAmanha.getAttribute('data-estado'), 'vazio');
  assert.deepEqual(await p.locator('.montar-turno h2').allInnerTexts(), ['Madrugada', 'Manhã', 'Tarde', 'Noite']);

  // a Madrugada, pelo teclado
  await turno(p, 'Madrugada').getByRole('button', { name: '+ posição' }).click();
  assert.equal((await focado(p)).campo, 'editor', '"+ posição" põe o foco no editor');
  await p.keyboard.type('rui');
  const lista = p.locator('.montar-lista');
  await lista.waitFor();
  assert.deepEqual(await lista.locator('[role="option"] strong').allInnerTexts(), ['Rui Teixeira']);
  assert.match(await lista.locator('[role="option"] small').first().innerText(), /livre/);
  await p.keyboard.press('Enter');
  let f = await focado(p);
  assert.equal(f.campo, 'ilha', 'Enter escolhe o editor e vai à ilha');
  // a ilha de costume do Rui (do histórico) vem no alto da lista, já escolhida: Enter a confirma
  const ilhas = p.locator('.lista-ilhas');
  await ilhas.waitFor();
  const primeira = ilhas.locator('[role="option"]').first();
  assert.match(await primeira.innerText(), /AVID 46[\s\S]*livre[\s\S]*de costume/);
  assert.equal(await primeira.getAttribute('aria-selected'), 'true');
  await capturar(p, '05-montar-ilha-de-costume');
  await p.keyboard.press('Enter');
  f = await focado(p);
  assert.deepEqual([f.campo, f.valor], ['horario', '22h às 6h'], 'Enter confirma a ilha e vai ao horário, que vem do turno');
  assert.equal(await turno(p, 'Madrugada').locator('[data-campo="ilha"]').first().inputValue(), 'AVID 46');
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.type('22 AS 06');
  const celula = turno(p, 'Madrugada').locator('.montar-celula').first();
  await celula.getByText('grava 22h às 6h').waitFor();
  await p.keyboard.press('Tab');
  f = await focado(p);
  assert.equal(f.campo, 'demanda', 'Tab vai à demanda');
  assert.equal(await celula.locator('[data-campo="horario"]').inputValue(), '22h às 6h', 'ao sair, o horário vai para o padrão');

  const claquete = `Noite de Gala ${diaMes(amanha)} Dp`;
  await p.keyboard.type(claquete);
  const leitura = celula.locator('.montar-demanda').first().locator('.montar-leitura');
  await leitura.getByText(`Noite de Gala · ${semanaDe(amanha)} ${diaMes(amanha)}`).waitFor();
  const versoes = await leitura.locator('.pauta-versao').allInnerTexts();
  assert.equal(versoes.length, 2, 'as duas versões como etiquetas');
  assert.match(versoes[0], new RegExp(`^dia ${Number(amanha.slice(8))}\\s*D$`));
  assert.match(versoes[1], new RegExp(`^próxim[ao] ${semanaDe(amanha)}\\s*P$`));
  await leitura.getByText(`grava Noite de Gala ${diaMes(amanha)} (DP)`).waitFor();
  await capturar(p, '01-montar-digitando');

  // Enter cria uma linha; Backspace na linha vazia apaga; as setas andam
  await p.keyboard.press('Enter');
  f = await focado(p);
  assert.deepEqual([f.campo, f.valor], ['demanda', ''], 'Enter cria uma linha nova');
  assert.equal(await celula.locator('[data-campo="demanda"]').first().inputValue(), `Noite de Gala ${diaMes(amanha)} (DP)`, 'a linha de cima foi para o padrão');
  await p.keyboard.type('COMUNICAÇÃO');
  await p.keyboard.press('Enter');
  assert.equal(await celula.locator('[data-campo="demanda"]').count(), 3);
  await p.keyboard.press('Backspace');
  assert.equal(await celula.locator('[data-campo="demanda"]').count(), 2, 'Backspace na linha vazia apaga');
  f = await focado(p);
  assert.equal(f.valor, 'COMUNICAÇÃO', 'o foco sobe para a linha de cima');
  await p.keyboard.press('ArrowUp');
  assert.equal((await focado(p)).valor, `Noite de Gala ${diaMes(amanha)} (DP)`, '↑ sobe uma linha');
  await p.keyboard.press('ArrowDown');
  assert.equal((await focado(p)).valor, 'COMUNICAÇÃO', '↓ desce uma linha');

  // a Tarde: a lista mostra a situação de cada um no dia; o Tab completa
  await turno(p, 'Tarde').getByRole('button', { name: '+ posição' }).click();
  await p.keyboard.type('r');
  const rui = lista.locator('[role="option"]', { hasText: 'Rui Teixeira' });
  await rui.waitFor();
  assert.match(await rui.locator('small').innerText(), /já na madrugada/, 'o Rui já está na madrugada');
  await capturar(p, '02-montar-lista-do-editor');
  await p.keyboard.press('Backspace');
  await p.keyboard.type('eli');
  await p.keyboard.press('Tab');
  f = await focado(p);
  const tarde = turno(p, 'Tarde').locator('.montar-celula').first();
  assert.equal(await tarde.locator('[data-campo="editor"]').inputValue(), 'Elis Furtado', 'Tab completa o editor');
  assert.equal(f.campo, 'ilha', 'e vai à ilha');
  // a ilha escrita de qualquer jeito: "avid46" e o Tab acham a AVID 46
  await p.keyboard.type('avid46');
  await p.keyboard.press('Tab');
  f = await focado(p);
  assert.equal(await tarde.locator('[data-campo="ilha"]').inputValue(), 'AVID 46', 'Tab completa a ilha');
  assert.equal(f.campo, 'horario', 'e vai ao horário');
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.type('14 as 22:53');
  await p.keyboard.press('Enter');
  assert.equal((await focado(p)).campo, 'demanda', 'Enter no horário vai à demanda');
  await p.keyboard.type('Mundo Animal 30/11 (P)');

  // o Gil na mesma ilha da Elis, na Tarde: a lista diz com quem está, e a escolhida avisa "ocupada"
  await turno(p, 'Tarde').getByRole('button', { name: '+ posição' }).click();
  await p.keyboard.type('gil');
  await p.keyboard.press('Enter');
  assert.equal((await focado(p)).campo, 'ilha');
  await p.keyboard.type('avid 4');
  const avid = ilhas.locator('[role="option"]', { hasText: 'AVID 46' });
  await avid.waitFor();
  assert.match(await avid.locator('small').innerText(), /com Elis Furtado/);
  await p.keyboard.press('Enter');
  const gil = turno(p, 'Tarde').locator('.montar-celula').nth(1);
  await gil.getByText('ocupada: Elis Furtado na tarde').waitFor();
  await tarde.getByText('ocupada: Gil Moura na tarde').waitFor();
  await capturar(p, '06-montar-ilha-ocupada');
  // a Madrugada tem a AVID 46 também, mas em outro turno: não está ocupada
  assert.equal(await turno(p, 'Madrugada').getByText(/ocupada/).count(), 0);
  await gil.locator('[data-campo="horario"]').focus();

  // gravado sozinho: a aba de amanhã passa a rascunho
  await p.locator('.montar-estado', { hasText: 'rascunho guardado' }).waitFor();
  await p.waitForFunction(() => document.querySelector('.montar-aba[aria-current="page"]')?.getAttribute('data-estado') === 'rascunho');
  await p.waitForFunction(() => document.querySelector('.montar-estado')?.textContent?.includes('rascunho guardado') && !document.querySelector('.montar-estado')?.textContent?.includes('gravando'));
  await semRolagemDeLado(p, 'montar');
  await p.locator('.montar-in:focus').evaluate((el) => el.blur());
  await capturar(p, '03-montar-rascunho', { fullPage: true });

  // recarregada, a página traz o rascunho como foi gravado
  await p.reload();
  await p.locator('.montar-celula').first().waitFor();
  const madrugada = turno(p, 'Madrugada').locator('.montar-celula').first();
  assert.equal(await madrugada.locator('[data-campo="editor"]').inputValue(), 'Rui Teixeira');
  assert.equal(await madrugada.locator('[data-campo="ilha"]').inputValue(), 'AVID 46');
  assert.equal(await madrugada.locator('[data-campo="horario"]').inputValue(), '22h às 6h');
  assert.deepEqual(await madrugada.locator('[data-campo="demanda"]').evaluateAll((els) => els.map((e) => e.value)), [`Noite de Gala ${diaMes(amanha)} (DP)`, 'COMUNICAÇÃO']);
  const tardeDeNovo = turno(p, 'Tarde').locator('.montar-celula').first();
  assert.equal(await tardeDeNovo.locator('[data-campo="editor"]').inputValue(), 'Elis Furtado');
  assert.equal(await tardeDeNovo.locator('[data-campo="ilha"]').inputValue(), 'AVID 46');
  assert.equal(await tardeDeNovo.locator('[data-campo="horario"]').inputValue(), '14h às 22h53');
  assert.deepEqual(await tardeDeNovo.locator('[data-campo="demanda"]').evaluateAll((els) => els.map((e) => e.value)), ['Mundo Animal 30/11 (P)']);
  assert.equal(await p.locator('.montar-aba[aria-current="page"]').getAttribute('data-estado'), 'rascunho');

  // outro dia da semana continua vazio
  const outro = amanha === segunda ? mais(segunda, 1) : segunda;
  await p.locator('.montar-aba', { hasText: diaMes(outro) }).click();
  await p.waitForFunction((d) => location.hash === `#/pauta/montar/${d}`, outro);
  await p.waitForFunction(() => document.querySelector('.montar-aba[aria-current="page"]')?.getAttribute('data-estado') === 'vazio');
  assert.equal(await p.locator('.montar-celula').count(), 0, 'o outro dia não tem posição');
  await p.getByText(/Nada montado para/).waitFor();
  assert.equal(escritasNoTeable.length, 0, 'nada foi escrito no Teable');
  assert.deepEqual(erros, [], 'Bia: erros na página');
  await ctx.close();
  console.log('ok: a coordenação monta o rascunho pelo teclado, gravado e relido');
}

async function noCelular(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${amanha}`, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await p.locator('.montar-celula').first().waitFor();
  await semRolagemDeLado(p, 'celular');
  assert.equal(await turno(p, 'Madrugada').locator('[data-campo="editor"]').first().inputValue(), 'Rui Teixeira');
  await capturar(p, '04-montar-celular-escuro');
  assert.deepEqual(erros, [], 'celular: erros na página');
  await ctx.close();
  console.log('ok: no celular (escuro), o rascunho cabe na tela');
}

async function cadastrarAsIlhas(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, BIA, '#/cadastros/ilhas');
  const lista = p.locator('.lista-cad[aria-label="Ilhas"]');
  await lista.getByText('Nenhuma ilha cadastrada ainda.').waitFor();
  const form = p.locator('.form-ilha');
  const cadastrar = async (tipo, numero, nome = '') => {
    await form.getByRole('radio', { name: tipo }).click();
    await form.getByLabel('Número').fill(numero);
    await form.getByLabel('Nome').fill(nome);
    await form.getByRole('button', { name: 'Cadastrar' }).click();
    await p.locator('.aviso', { hasText: `${tipo} ${numero} cadastrada.` }).waitFor();
  };
  await cadastrar('AVID', '46');
  await cadastrar('VDI', '7', 'Sala da esquina');
  // AVID e ILHA com o mesmo número ficam como estão escritas
  await cadastrar('ILHA', '46');
  // a mesma ilha de novo é recusada
  await form.getByRole('radio', { name: 'AVID' }).click();
  await form.getByLabel('Número').fill('46');
  await form.getByRole('button', { name: 'Cadastrar' }).click();
  await p.locator('.aviso', { hasText: 'Já existe a AVID 46.' }).waitFor();
  await form.getByLabel('Número').fill('');
  const linhas = () => lista.locator('.item-ilha .nome').allInnerTexts();
  assert.deepEqual((await linhas()).map((t) => t.replace(/\s+/g, ' ').trim()), ['AVID 46', 'ILHA 46', 'VDI 7 Sala da esquina']);
  // a coordenação não remove (só administradores)
  assert.equal(await lista.locator('.lixo-cad.travado').count(), 3);
  await capturar(p, '07-cadastros-ilhas');
  assert.deepEqual(erros, [], 'ilhas: erros na página');
  await ctx.close();

  // a Lia vê a lista, sem cadastrar
  const lia = await abrir(navegador, url, LIA, '#/cadastros/ilhas');
  await lia.p.locator('.item-ilha').first().waitFor();
  assert.equal(await lia.p.locator('.item-ilha').count(), 3);
  assert.ok(await lia.p.locator('.form-ilha').getByRole('button', { name: 'Cadastrar' }).isDisabled(), 'a Lia não cadastra');
  assert.deepEqual(lia.erros, [], 'ilhas (Lia): erros na página');
  await lia.ctx.close();
  console.log('ok: a coordenação cadastra as ilhas nos Cadastros; quem não é só vê');
}

/** O histórico: uma semana antes de amanhã, o Rui na AVID 46 (a ilha de costume dele). */
async function umaSemanaAntes(api) {
  const h = { 'cf-access-authenticated-user-email': BIA, 'content-type': 'application/json' };
  const { ilhas } = await (await fetch(`${api}/cadastros/ilhas`, { headers: h })).json();
  const avid = ilhas.find((i) => i.tipo === 'AVID' && i.numero === '46').id;
  const r = await fetch(`${api}/montar-pauta?dia=${mais(amanha, -7)}`, { method: 'PUT', headers: h, body: JSON.stringify({ posicoes: [{ id: 'hist-1', turno: 'manha', editor: 'Rui Teixeira', ilha: avid, horario: '6h às 15h', demandas: [] }] }) });
  assert.equal(r.status, 200);
}

async function turnosDaConfiguracao(navegador, url, app) {
  await app.mudarConfiguracao({ TURNOS: JSON.stringify([{ id: 'madrugada', nome: 'Madrugada', horario: '22h às 6h' }, { id: 'manha', nome: 'Manhã', horario: '6h às 15h' }, { id: 'plantao', nome: 'Plantão', horario: '10h às 19h' }, { id: 'tarde', nome: 'Tarde', horario: '14h às 23h' }, { id: 'noite', nome: 'Noite', horario: '20h às 2h' }]) }).antigaFechada;
  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${amanha}`);
  await p.locator('.montar-celula').first().waitFor();
  assert.deepEqual(await p.locator('.montar-turno h2').allInnerTexts(), ['Madrugada', 'Manhã', 'Plantão', 'Tarde', 'Noite']);
  assert.match(await turno(p, 'Plantão').locator('.montar-turno-h').innerText(), /10h às 19h/);
  await turno(p, 'Plantão').getByRole('button', { name: '+ posição' }).click();
  await p.keyboard.press('Escape');
  assert.equal(await turno(p, 'Plantão').locator('[data-campo="horario"]').inputValue(), '10h às 19h', 'o horário vem do turno da Configuração');
  assert.deepEqual(erros, [], 'turnos: erros na página');
  await ctx.close();
  await app.mudarConfiguracao({ TURNOS: null }).antigaFechada;
  console.log('ok: os turnos vêm da Configuração (o Plantão, com o horário dele)');
}

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: CHEFE }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: CHEFE } });
  // o convite do tour não atrapalha
  for (const quem of [LIA, BIA, CHEFE]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': quem } });
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    await marcarACoordenacao(navegador, s.url);
    await quemNaoEDaCoordenacao(navegador, s.url, s.api);
    await cadastrarAsIlhas(navegador, s.url);
    await umaSemanaAntes(s.api);
    await montarPeloTeclado(navegador, s.url);
    await noCelular(navegador, s.url);
    await turnosDaConfiguracao(navegador, s.url, s.app);
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
