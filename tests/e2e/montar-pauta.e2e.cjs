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
// Conferir e publicar (#127): o Teable falso também tem o Postgres da pauta, com duas linhas de amanhã (uma delas a
// mesma claquete que a Bia montou). A Bia abre uma posição vazia na Noite e escreve uma claquete sem data; "Conferir e
// publicar" mostra o placar e as pendências: "Turno sem editor" e "Claquete sem data" para olhar. O "Corrigir" da
// claquete volta à grade com o foco na linha; corrigida, sai da conferência. O "está certo" do turno o leva para as
// conferidas, e publicar mostra "publicada!", com a aba de amanhã publicada. Na Pauta da edição, a Lia vê o dia com a
// do Teable inteira e o que só o PROMeiro tem, sem a claquete em dobro. Mexer depois deixa o dia "alterado"; publicar
// de novo entra no histórico; Desfazer volta à publicação anterior e, de novo, tira a publicação: a Pauta volta a ser
// só a do Teable.
//
// Ausências (#128): a Bia marca as férias da Elis de amanhã a três dias depois, com observação. Antes de marcar, o
// diálogo diz quantos dias cobre e onde a Elis está na escala; marcada, a posição dela vira vaga (com as demandas) e
// ela aparece no "Fora no dia", com o motivo. Publicado o dia, a folga do Rui não mexe no publicado: o painel oferece
// tirá-lo, e tirar deixa a posição vaga, manda as demandas para "Para distribuir" e o dia fica alterado. Na Pauta da
// edição, a Lia vê os dois "fora", sem o motivo; a administradora vê o motivo.
//
// Os avisos e o recado do dia (#125): a Bia escreve o recado do dia, no campo acima da grade, e, no Rui, abre os avisos
// pelo "+ aviso" (Enter cria outro, Backspace na vazia apaga), à parte das demandas. Recarregada, tudo volta como foi
// gravado. A conferência conta os avisos (o recado conta como um) e a tela "publicada" mostra o recado e os avisos. Na
// Pauta da edição, a Lia vê os avisos no balão do Rui e o recado no da coluna "sem editor"; o aviso que o Teable já tem
// não dobra. Desfeita a publicação, a Pauta volta a ser só a do Teable.
//
// A coluna lateral e o arrastar (#126): no dia seguinte a amanhã, vazio, a coluna mostra "Sem escala" (os editores
// cadastrados, sem a Elis, que está de férias) e "Fora" (a Elis, com o motivo). No computador, com o mouse, a Bia
// arrasta o Rui para o turno da Madrugada (uma posição nova, com o horário do turno) e escala o Gil na Tarde pelo
// "Escalar na…"; escreve três claquetes em "Para distribuir" (Enter junta, no padrão), arrasta a primeira para o Rui e
// depois a leva, arrastando a demanda, do Rui para o Gil. Recarregada, tudo volta como foi gravado. No tablet, com o
// dedo (pela alça), leva outra claquete para o Rui. No celular (escuro), a coluna fica embaixo da grade; o "Escalar
// na…" põe a Bia numa posição nova da Noite, o "Mover para…" leva a última claquete para o Rui e o "⋯" da demanda a
// move do Gil para a Bia, sem rolar para o lado.
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
  await capturar(p, '08-montar-ilha-de-costume');
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
  await capturar(p, '09-montar-ilha-ocupada');
  // a Madrugada tem a AVID 46 também, mas em outro turno: não está ocupada
  assert.equal(await turno(p, 'Madrugada').getByText(/ocupada/).count(), 0);
  // o Gil sai: a Elis volta a ter a ilha só para ela (e o resto do teste segue com as posições de antes)
  await gil.locator('[data-campo="horario"]').focus();
  await gil.getByRole('button', { name: 'Tirar esta posição' }).click();
  await p.waitForFunction(() => !document.body.textContent?.includes('ocupada:'));
  await tarde.locator('[data-campo="demanda"]').first().focus();

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
  await capturar(p, '10-cadastros-ilhas');
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

/* ---------- conferir e publicar (#127) ---------- */
const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
/** Uma linha da pauta do Teable (EDICAO_producao), no fuso de São Paulo. */
function linhaDoTeable(id, claquete, quem, dia, [inicio, fim]) {
  const sp = (d, h) => new Date(`${d}T${h}:00-03:00`).toISOString();
  return { id, fields: { claquete, key: claquete.toUpperCase(), editor: { id: `rec${quem.replace(/\W/g, '')}`, title: quem }, data: sp(dia, '00:00'), expediente_inicio: sp(dia, inicio), expediente_fim: sp(fim < inicio ? mais(dia, 1) : dia, fim), anotacao: null, alterado_em: new Date().toISOString() } };
}
const PAUTA_DO_TEABLE = [linhaDoTeable('recT1', `Noite de Gala ${diaMes(amanha)} Dp`, 'Rui Teixeira', amanha, ['22:00', '06:00']), linhaDoTeable('recT2', `Corujão ${diaMes(amanha)}`, 'Gil Moura', amanha, ['06:00', '15:00'])];

async function conferirEPublicar(navegador, url, teable) {
  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${amanha}`);
  await p.locator('.montar-celula').first().waitFor();
  // uma posição vazia na Noite; uma claquete sem data na Tarde
  await turno(p, 'Noite').getByRole('button', { name: '+ posição' }).click();
  await p.keyboard.press('Escape');
  const tarde = turno(p, 'Tarde').locator('.montar-celula').first();
  await tarde.locator('[data-campo="demanda"]').last().click();
  await p.keyboard.press('End');
  await p.keyboard.press('Enter');
  await p.keyboard.type('Vale a Pena Rever (AH)');
  await p.locator('.montar-estado', { hasText: 'rascunho guardado' }).waitFor();

  // a conferência: o placar e as pendências
  await p.getByRole('button', { name: 'Conferir e publicar →' }).click();
  await p.getByRole('heading', { name: 'Conferir antes de publicar' }).waitFor();
  assert.deepEqual(await p.locator('.conf-placar span').allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' '))), ['3 posições', '2 editores', '4 demandas']);
  assert.deepEqual(await p.locator('.conf-prob.olhar .conf-prob-tipo').allInnerTexts(), ['CLAQUETE SEM DATA', 'TURNO SEM EDITOR']);
  await p.getByText('2 itens para olhar; dá para publicar assim mesmo').waitFor();
  await capturar(p, '05-conferir', { fullPage: true });

  // "Corrigir" volta à grade, com o foco na linha da claquete
  await p.locator('.conf-prob', { hasText: 'Claquete sem data' }).getByRole('button', { name: 'Corrigir' }).click();
  await p.waitForFunction(() => document.activeElement?.getAttribute('data-campo') === 'demanda');
  assert.equal((await focado(p)).valor, 'Vale a Pena Rever (AH)', 'o foco vai à linha da claquete sem data');
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.type(`Vale a Pena Rever ${diaMes(amanha)} (AH)`);
  await p.getByRole('button', { name: 'Conferir e publicar →' }).click();
  await p.getByRole('heading', { name: 'Conferir antes de publicar' }).waitFor();
  assert.deepEqual(await p.locator('.conf-prob.olhar .conf-prob-tipo').allInnerTexts(), ['TURNO SEM EDITOR'], 'corrigida, a claquete sai da conferência');

  // "está certo" leva o turno para as conferidas
  await p.locator('.conf-prob.olhar', { hasText: 'Turno sem editor' }).getByRole('button', { name: 'está certo' }).click();
  await p.locator('.conf-prob.conferida', { hasText: 'Turno sem editor' }).waitFor();
  await p.getByText('tudo conferido').waitFor();

  // publicar
  await p.getByRole('button', { name: 'Publicar a pauta de amanhã' }).click();
  await p.getByText('publicada!').waitFor();
  await p.getByRole('heading', { name: /está no ar$/ }).waitFor();
  assert.match(await p.locator('.pub-cartoes').innerText(), /0\s*pendências ficaram/);
  await capturar(p, '06-publicada', { fullPage: true });

  // na Pauta da edição (a Lia): a do Teable inteira e o que só o PROMeiro tem, sem dobrar
  const lia = await abrir(navegador, url, LIA, `#/pauta/dia/${amanha}`);
  await lia.p.locator('.pauta-colunas').waitFor();
  const naPauta = async () => lia.p.locator('.pauta-cards .pauta-item').allInnerTexts().then((t) => t.join('\n'));
  let texto = await naPauta();
  assert.equal((texto.match(/Noite de Gala/g) ?? []).length, 1, 'a mesma claquete aparece uma vez');
  assert.match(texto, /Corujão/, 'a do Teable continua');
  assert.match(texto, /Mundo Animal/, 'o que só o PROMeiro tem aparece');
  assert.match(texto, /Vale a Pena Rever/);
  assert.ok((await lia.p.locator('.pauta-coluna-topo .pauta-nome').allInnerTexts()).includes('Elis Furtado'), 'a Elis ganha a coluna dela');
  await capturar(lia.p, '07-pauta-com-o-publicado', { fullPage: true });

  // de volta à grade: a aba de amanhã publicada; mexer depois de publicar deixa alterado
  await p.getByRole('button', { name: 'Voltar a mexer' }).click();
  assert.equal(await p.locator('.montar-aba[aria-current="page"]').getAttribute('data-estado'), 'publicado');
  await p.locator('.pub-faixa', { hasText: 'Publicada' }).waitFor();
  const tardeDeNovo = turno(p, 'Tarde').locator('.montar-celula').first();
  await tardeDeNovo.locator('[data-campo="demanda"]').last().click();
  await p.keyboard.press('End');
  await p.keyboard.press('Enter');
  await p.keyboard.type('CALHAUS');
  await p.waitForFunction(() => document.querySelector('.montar-aba[aria-current="page"]')?.getAttribute('data-estado') === 'alterado');
  await p.locator('.pub-faixa', { hasText: 'Alterada depois de publicar' }).waitFor();
  // publicar de novo: duas no histórico
  await p.getByRole('button', { name: 'Conferir e publicar →' }).click();
  await p.getByRole('button', { name: 'Publicar de novo a pauta de amanhã' }).click();
  await p.getByText('publicada!').waitFor();
  await p.getByRole('button', { name: 'Voltar a mexer' }).click();
  await p.locator('.pub-historico summary', { hasText: 'Histórico · 2' }).waitFor();

  // Desfazer: volta a valer a anterior (o rascunho tem a CALHAUS a mais: alterado); de novo, nenhuma
  await p.getByRole('button', { name: 'Desfazer a publicação' }).click();
  await p.waitForFunction(() => document.querySelector('.montar-aba[aria-current="page"]')?.getAttribute('data-estado') === 'alterado');
  await p.getByRole('button', { name: 'Desfazer a publicação' }).click();
  await p.locator('.pub-faixa', { hasText: 'Publicação desfeita' }).waitFor();
  assert.equal(await p.locator('.montar-aba[aria-current="page"]').getAttribute('data-estado'), 'rascunho');
  await lia.p.reload();
  await lia.p.locator('.pauta-colunas').waitFor();
  texto = await naPauta();
  assert.doesNotMatch(texto, /Mundo Animal/, 'desfeita, a Pauta volta a ser só a do Teable');
  assert.match(texto, /Noite de Gala/);
  assert.match(texto, /Corujão/);

  assert.ok(teable.estado.pedidos.every((x) => x.startsWith('GET ')), 'nada foi escrito no Teable');
  assert.equal(escritasNoTeable.length, 0, 'nada foi escrito nos cadastros');
  assert.deepEqual(erros, [], 'conferir: erros na página');
  assert.deepEqual(lia.erros, [], 'pauta: erros na página');
  await lia.ctx.close();
  await ctx.close();
  console.log('ok: conferir, corrigir, "está certo", publicar, a Pauta sem dobrar, alterado, republicar e desfazer');
}

/* ---------- os avisos e o recado do dia (#125) ---------- */
async function avisosERecado(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${amanha}`);
  await p.locator('.montar-celula').first().waitFor();
  // o recado do dia, no campo próprio, acima da grade
  await p.getByLabel('Recado do dia').fill('Reunião geral às 15h, na sala 3');
  // os avisos do Rui, à parte das demandas, pelo teclado
  const rui = turno(p, 'Madrugada').locator('.montar-celula').first();
  const demandasAntes = await rui.locator('[data-campo="demanda"]').count();
  await rui.getByRole('button', { name: '+ aviso' }).click();
  assert.equal((await focado(p)).campo, 'aviso', '"+ aviso" põe o foco no aviso novo');
  await p.keyboard.type('Redator vem acompanhar');
  await p.keyboard.press('Enter');
  await p.keyboard.type('Chega às 21h');
  await p.keyboard.press('Enter');
  assert.equal(await rui.locator('[data-campo="aviso"]').count(), 3, 'Enter cria outro aviso');
  await p.keyboard.press('Backspace');
  assert.deepEqual(await focado(p).then((f) => [f.campo, f.valor]), ['aviso', 'Chega às 21h'], 'Backspace na vazia apaga e sobe');
  await p.keyboard.press('ArrowUp');
  await p.keyboard.press('ArrowUp');
  assert.equal((await focado(p)).campo, 'demanda', 'de cima do primeiro aviso, a última demanda');
  assert.equal(await rui.locator('[data-campo="demanda"]').count(), demandasAntes, 'os avisos não viram demandas');
  await p.locator('.montar-estado', { hasText: 'rascunho guardado' }).waitFor();
  await semRolagemDeLado(p, 'avisos');
  await capturar(p, '11-montar-avisos-e-recado');

  // recarregada, tudo volta como foi gravado
  await p.reload();
  await p.locator('.montar-celula').first().waitFor();
  assert.equal(await p.getByLabel('Recado do dia').inputValue(), 'Reunião geral às 15h, na sala 3');
  assert.deepEqual(await turno(p, 'Madrugada').locator('.montar-celula').first().locator('[data-campo="aviso"]').evaluateAll((els) => els.map((e) => e.value)), ['Redator vem acompanhar', 'Chega às 21h']);

  // a conferência conta os avisos (o recado conta como um); a "publicada" mostra o recado e os avisos
  await p.getByRole('button', { name: 'Conferir e publicar →' }).click();
  await p.getByRole('heading', { name: 'Conferir antes de publicar' }).waitFor();
  assert.ok((await p.locator('.conf-placar span').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ')).includes('3 avisos'), 'o placar conta os avisos');
  await p.getByRole('button', { name: /^Publicar/ }).click();
  await p.getByText('publicada!').waitFor();
  await p.getByRole('note', { name: 'Recado do dia' }).getByText('Reunião geral às 15h, na sala 3').waitFor();
  assert.match(await p.getByRole('list', { name: 'Avisos para Rui Teixeira' }).innerText(), /Redator vem acompanhar[\s\S]*Chega às 21h/);
  await capturar(p, '12-publicada-com-avisos', { fullPage: true });

  // na Pauta da edição (a Lia): os avisos no balão do Rui, o recado no "sem editor"
  const lia = await abrir(navegador, url, LIA, `#/pauta/dia/${amanha}`);
  await lia.p.locator('.pauta-colunas').waitFor();
  const balao = lia.p.getByRole('note', { name: 'avisos para Rui Teixeira' });
  await balao.waitFor();
  assert.deepEqual(await balao.locator('.pauta-aviso-texto').allInnerTexts(), ['Redator vem acompanhar', 'Chega às 21h']);
  assert.deepEqual(await lia.p.getByRole('note', { name: 'aviso para sem editor' }).locator('.pauta-aviso-texto').allInnerTexts(), ['Reunião geral às 15h, na sala 3']);
  assert.equal(await lia.p.locator('.pauta-cards .pauta-item', { hasText: 'Chega às 21h' }).count(), 0, 'o aviso não é item da pauta');
  await capturar(lia.p, '13-pauta-com-avisos-e-recado', { fullPage: true });

  // desfeita a publicação, a Pauta volta a ser só a do Teable (as ausências, a seguir, começam do rascunho)
  await p.getByRole('button', { name: 'Desfazer' }).click();
  await p.locator('.pub-faixa', { hasText: 'Publicação desfeita' }).waitFor();
  await lia.p.reload();
  await lia.p.locator('.pauta-colunas').waitFor();
  assert.equal(await lia.p.locator('.pauta-balao-aviso').count(), 0, 'sem a publicação, sem os avisos do PROMeiro');
  assert.deepEqual(erros, [], 'avisos: erros na página');
  assert.deepEqual(lia.erros, [], 'pauta com avisos: erros na página');
  await lia.ctx.close();
  await ctx.close();
  console.log('ok: os avisos por posição e o recado do dia, gravados, conferidos, publicados e na Pauta');
}

/* ---------- ausências com período (#128) ---------- */
const curto = (iso) => `${semanaDe(iso)} ${diaMes(iso)}`;
async function ausencias(navegador, url, api) {
  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${amanha}`);
  await p.locator('.montar-celula').first().waitFor();
  const painel = p.locator('.aus-painel');
  await painel.getByText('ninguém').waitFor();
  const dialogo = p.getByRole('dialog', { name: 'Marcar ausência' });
  const marcarComo = async (editor, tipo) => {
    await painel.getByRole('button', { name: 'Marcar ausência' }).click();
    await dialogo.waitFor();
    await dialogo.getByLabel('Quem').fill(editor);
    await dialogo.getByRole('radio', { name: tipo }).click();
  };

  // as férias da Elis: o diálogo diz quantos dias e onde ela está na escala, antes de marcar
  await marcarComo('Elis Furtado', 'Férias');
  await dialogo.getByLabel('De').fill(amanha);
  await dialogo.getByLabel('Até (o último dia fora)').fill(mais(amanha, 3));
  await dialogo.getByLabel('Observação').fill('volta depois');
  await dialogo.getByText(`Cobre 4 dias, de ${curto(amanha)} a ${curto(mais(amanha, 3))}`).waitFor();
  await dialogo.getByText(`Elis está na escala em ${curto(amanha)} (tarde): lá a posição vira vaga.`).waitFor();
  await capturar(p, '08-ausencia-marcar');
  await dialogo.getByRole('button', { name: 'Marcar férias' }).click();
  await dialogo.waitFor({ state: 'detached' });
  // marcada: a posição da Elis vira vaga, com as demandas; ela aparece fora, com o motivo
  await painel.locator('.aus-pessoa', { hasText: 'Elis Furtado' }).getByText(`férias até ${diaMes(mais(amanha, 3))} · volta depois`).waitFor();
  await painel.getByText(`A posição ficou vaga em ${curto(amanha)} (tarde).`).waitFor();
  const tarde = turno(p, 'Tarde').locator('.montar-celula').first();
  await p.waitForFunction(() => [...document.querySelectorAll('.montar-turno')].find((t) => t.querySelector('h2')?.textContent === 'Tarde')?.querySelector('[data-campo="editor"]')?.value === '');
  assert.ok((await tarde.locator('[data-campo="demanda"]').evaluateAll((els) => els.map((e) => e.value))).some((v) => /Mundo Animal/.test(v)), 'a vaga fica com as demandas');

  // publicado o dia, a folga do Rui não mexe sozinha: o painel oferece tirar
  const r = await fetch(`${api}/montar-pauta/publicar?dia=${amanha}`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': BIA } });
  assert.equal(r.status, 200, 'publicou');
  await p.reload();
  await p.locator('.montar-celula').first().waitFor();
  await marcarComo('Rui Teixeira', 'Folga');
  await dialogo.getByLabel('Observação').fill('comp');
  await dialogo.getByText(`${curto(amanha)} já foi publicado com Rui: depois de marcar, dá para tirar de lá.`).waitFor();
  await dialogo.getByRole('button', { name: 'Marcar folga' }).click();
  await dialogo.waitFor({ state: 'detached' });
  const oferta = painel.locator('.aus-oferta', { hasText: 'Rui Teixeira' });
  await oferta.getByText(`está na pauta publicada de ${curto(amanha)} (madrugada)`).waitFor();
  assert.equal(await turno(p, 'Madrugada').locator('[data-campo="editor"]').first().inputValue(), 'Rui Teixeira', 'o publicado não muda sozinho');
  assert.equal(await p.locator('.montar-aba[aria-current="page"]').getAttribute('data-estado'), 'publicado');
  await oferta.getByRole('button', { name: `Tirar Rui de ${curto(amanha)}` }).click();
  // tirado: a posição vaga, as demandas para distribuir, o dia alterado
  const distribuir = p.getByRole('region', { name: 'Para distribuir' });
  await distribuir.locator('.coluna-claquete').first().waitFor();
  assert.deepEqual(await distribuir.locator('.coluna-claquete .mono').allInnerTexts(), [`Noite de Gala ${diaMes(amanha)} (DP)`, 'COMUNICAÇÃO']);
  assert.match(await distribuir.locator('.coluna-claquete').first().innerText(), /era de Rui/);
  await p.waitForFunction(() => document.querySelector('.montar-aba[aria-current="page"]')?.getAttribute('data-estado') === 'alterado');
  assert.equal(await turno(p, 'Madrugada').locator('[data-campo="editor"]').first().inputValue(), '', 'a posição do Rui ficou vaga');
  assert.equal(await painel.locator('.aus-oferta').count(), 0, 'a oferta sai');
  await semRolagemDeLado(p, 'ausências');
  await capturar(p, '09-ausencia-tirada-do-publicado', { fullPage: true });

  // na Pauta da edição: todos veem "fora"; o motivo, só a coordenação e os administradores
  const lia = await abrir(navegador, url, LIA, `#/pauta/dia/${amanha}`);
  const fora = lia.p.locator('.pauta-fora');
  await fora.waitFor();
  assert.deepEqual(await fora.locator('.pauta-fora-nome').allInnerTexts(), ['Elis Furtado', 'Rui Teixeira']);
  assert.deepEqual(await fora.locator('.pauta-fora-det').allInnerTexts(), ['fora', 'fora']);
  assert.doesNotMatch(await fora.innerText(), /férias|folga|volta depois|comp/, 'a Lia não vê o motivo');
  await capturar(lia.p, '10-pauta-fora');
  const doChefe = await (await fetch(`${api}/pauta/dia?dia=${amanha}`, { headers: { 'cf-access-authenticated-user-email': CHEFE } })).json();
  assert.deepEqual(doChefe.fora.map((f) => f.motivo), [`férias até ${diaMes(mais(amanha, 3))}`, 'folga'], 'a administradora vê o motivo');

  assert.equal(escritasNoTeable.length, 0, 'nada foi escrito nos cadastros');
  assert.deepEqual(erros, [], 'ausências: erros na página');
  assert.deepEqual(lia.erros, [], 'pauta com fora: erros na página');
  await lia.ctx.close();
  await ctx.close();
  console.log('ok: marcar a ausência, a vaga nos rascunhos, tirar do dia publicado e o "fora" na Pauta');
}

/* ---------- a coluna lateral e o arrastar (#126) ---------- */
const depois = mais(amanha, 1);
/** As posições da grade, como estão na tela: o id, o editor, o horário e as demandas preenchidas. */
const aGrade = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('.montar-turno')].flatMap((t) =>
      [...t.querySelectorAll('.montar-celula')].map((c) => ({
        turno: t.querySelector('h2')?.textContent ?? '',
        id: c.getAttribute('data-posicao-id'),
        editor: c.querySelector('[data-campo="editor"]').value,
        horario: c.querySelector('[data-campo="horario"]').value,
        demandas: [...c.querySelectorAll('[data-campo="demanda"]')].map((i) => i.value).filter(Boolean),
      })),
    ),
  );
/** Espera a condição valer (até 5 s), repetindo; a última falha é a que conta. */
async function ate(f) {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= 50) throw e;
      await new Promise((ok) => setTimeout(ok, 100));
    }
  }
}
const centro = async (l) => {
  const c = await l.boundingBox();
  assert.ok(c, 'o item está na tela');
  return { x: c.x + c.width / 2, y: c.y + Math.min(c.height / 2, 14) };
};
/** Arrasta com o mouse, pela alça do item, até o lugar. */
async function arrastarComOMouse(p, item, lugar) {
  await lugar.scrollIntoViewIfNeeded();
  const a = await centro(item.locator('.arrasto-alca').first());
  const b = await centro(lugar);
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  await p.mouse.move(a.x + 12, a.y + 8, { steps: 3 });
  await p.mouse.move(b.x, b.y, { steps: 12 });
  await p.mouse.up();
}
/** Arrasta com o dedo (toque de verdade, pelo protocolo do Chromium), pela alça do item, até o lugar. */
async function arrastarComODedo(p, item, lugar) {
  const cdp = await p.context().newCDPSession(p);
  const a = await centro(item.locator('.arrasto-alca').first());
  const b = await centro(lugar);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 12, y: a.y + ((b.y - a.y) * i) / 12 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
const nomes = (caixa) => caixa.locator('.coluna-pessoa strong').allInnerTexts();
const daLista = (p) => p.getByRole('region', { name: 'Para distribuir' }).locator('.coluna-claquete .mono').allInnerTexts();

async function colunaEArrastar(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${depois}`);
  const coluna = p.getByRole('complementary', { name: 'Coluna lateral' });
  const semEscala = coluna.getByRole('region', { name: 'Sem escala' });
  const distribuir = coluna.getByRole('region', { name: 'Para distribuir' });
  await semEscala.locator('.coluna-pessoa').first().waitFor();
  // o dia vazio: sem escala, os cadastrados (a Elis, de férias, está em "Fora", com o motivo)
  assert.deepEqual(await nomes(semEscala), ['Bia Campos', 'Gil Moura', 'Rui Teixeira']);
  await coluna.getByRole('region', { name: 'Fora' }).locator('.aus-pessoa', { hasText: 'Elis Furtado' }).getByText(/^férias até/).waitFor();

  // o Rui, arrastado com o mouse para a Madrugada: uma posição nova, com o horário do turno
  await arrastarComOMouse(p, semEscala.locator('.coluna-pessoa', { hasText: 'Rui Teixeira' }), turno(p, 'Madrugada').locator('.montar-turno-cab'));
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => [x.turno, x.editor, x.horario]), [['Madrugada', 'Rui Teixeira', '22h às 6h']]));
  assert.deepEqual(await nomes(semEscala), ['Bia Campos', 'Gil Moura'], 'escalado, o Rui sai de "Sem escala"');
  // o Gil, pelo "Escalar na…", numa posição nova da Tarde
  await semEscala.getByLabel('Escalar Gil Moura na…').selectOption('turno:tarde');
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => x.editor), ['Rui Teixeira', 'Gil Moura']));

  // "Para distribuir": três claquetes escritas (Enter junta, no padrão)
  await distribuir.getByLabel('Escrever ou colar as claquetes').fill(`Noite de Gala ${diaMes(depois)} dp\nMundo Animal ${diaMes(depois)} (P)\nCALHAUS`);
  await p.keyboard.press('Enter');
  await ate(async () => assert.deepEqual(await daLista(p), [`Noite de Gala ${diaMes(depois)} (DP)`, `Mundo Animal ${diaMes(depois)} (P)`, 'CALHAUS']));
  assert.equal(await distribuir.getByLabel('Escrever ou colar as claquetes').inputValue(), '', 'juntada, o campo esvazia');
  const [rui, gil] = (await aGrade(p)).map((x) => x.id);
  const celula = (id) => p.locator(`.montar-celula[data-posicao-id="${id}"]`);
  // a primeira, arrastada para o Rui
  await arrastarComOMouse(p, distribuir.locator('.coluna-claquete').first(), celula(rui));
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => x.demandas), [[`Noite de Gala ${diaMes(depois)} (DP)`], []]));
  assert.deepEqual(await daLista(p), [`Mundo Animal ${diaMes(depois)} (P)`, 'CALHAUS']);
  // a demanda, arrastada do Rui para o Gil
  await arrastarComOMouse(p, celula(rui).locator('.montar-demanda.arrastavel').first(), celula(gil));
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => x.demandas), [[], [`Noite de Gala ${diaMes(depois)} (DP)`]]));
  await p.locator('.montar-estado', { hasText: 'rascunho guardado' }).waitFor();
  await semRolagemDeLado(p, 'coluna');
  await capturar(p, '14-coluna-computador');
  // recarregada, tudo volta como foi gravado
  await p.reload();
  await semEscala.locator('.coluna-pessoa').first().waitFor();
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => [x.editor, x.demandas]), [['Rui Teixeira', []], ['Gil Moura', [`Noite de Gala ${diaMes(depois)} (DP)`]]]));
  assert.deepEqual(await daLista(p), [`Mundo Animal ${diaMes(depois)} (P)`, 'CALHAUS']);
  assert.deepEqual(erros, [], 'coluna no computador: erros na página');
  await ctx.close();

  // no tablet, com o dedo: a claquete vai para o Rui, pela alça
  const tablet = await abrir(navegador, url, BIA, `#/pauta/montar/${depois}`, { viewport: { width: 834, height: 1194 }, hasTouch: true });
  const tColuna = tablet.p.getByRole('region', { name: 'Para distribuir' });
  await tColuna.locator('.coluna-claquete').first().waitFor();
  await arrastarComODedo(tablet.p, tColuna.locator('.coluna-claquete', { hasText: 'Mundo Animal' }), tablet.p.locator(`.montar-celula[data-posicao-id="${rui}"]`));
  await ate(async () => assert.deepEqual((await aGrade(tablet.p)).map((x) => x.demandas), [[`Mundo Animal ${diaMes(depois)} (P)`], [`Noite de Gala ${diaMes(depois)} (DP)`]]));
  assert.deepEqual(await daLista(tablet.p), ['CALHAUS']);
  await semRolagemDeLado(tablet.p, 'coluna no tablet');
  await capturar(tablet.p, '15-coluna-tablet');
  assert.deepEqual(tablet.erros, [], 'coluna no tablet: erros na página');
  await tablet.ctx.close();

  // no celular (escuro): a coluna embaixo; "Escalar na…", "Mover para…" e o "⋯" da demanda
  const cel = await abrir(navegador, url, BIA, `#/pauta/montar/${depois}`, { viewport: { width: 390, height: 844 }, colorScheme: 'dark', hasTouch: true, isMobile: true });
  const c = cel.p;
  const cSem = c.getByRole('region', { name: 'Sem escala' });
  await cSem.locator('.coluna-pessoa').first().waitFor();
  const embaixo = await c.evaluate(() => document.querySelector('.montar-coluna').getBoundingClientRect().top > document.querySelector('.montar-grade').getBoundingClientRect().bottom - 1);
  assert.ok(embaixo, 'no celular, a coluna fica embaixo da grade');
  await cSem.getByLabel('Escalar Bia Campos na…').selectOption('turno:noite');
  await ate(async () => assert.deepEqual((await aGrade(c)).map((x) => [x.turno, x.editor]), [['Madrugada', 'Rui Teixeira'], ['Tarde', 'Gil Moura'], ['Noite', 'Bia Campos']]));
  assert.equal(await cSem.locator('.coluna-pessoa').count(), 0);
  await cSem.getByText('todos escalados').waitFor();
  const bia = (await aGrade(c))[2].id;
  await c.getByLabel('Mover CALHAUS para…').selectOption(`posicao:${rui}`);
  await ate(async () => assert.deepEqual((await aGrade(c)).find((x) => x.id === rui).demandas, [`Mundo Animal ${diaMes(depois)} (P)`, 'CALHAUS']));
  await c.getByLabel(`Mover Noite de Gala ${diaMes(depois)} (DP) para…`).selectOption(`posicao:${bia}`);
  await ate(async () => assert.deepEqual((await aGrade(c)).map((x) => x.demandas.length), [2, 0, 1]));
  await c.getByRole('region', { name: 'Para distribuir' }).getByText('uma por linha', { exact: false }).waitFor();
  await semRolagemDeLado(c, 'coluna no celular');
  await capturar(c, '16-coluna-celular', { fullPage: true });
  assert.deepEqual(cel.erros, [], 'coluna no celular: erros na página');
  await cel.ctx.close();
  console.log('ok: a coluna lateral (para distribuir, sem escala, fora), o arrastar no mouse e no dedo, e o "Escalar na…" e o "Mover para…" no celular');
}

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: CHEFE }, { buscar: buscarNoTeable });
  // o Teable falso da descoberta e do Postgres da pauta (#127), só leitura
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const teable = teableFalso({ EDICAO_producao: 'pauta_e2e' }, { registros: { EDICAO_producao: PAUTA_DO_TEABLE } });
  const s = await subir({ cadastros, teable, pg: teable.abrirPg, env: { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, ...PG } });
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
    await conferirEPublicar(navegador, s.url, teable);
    await turnosDaConfiguracao(navegador, s.url, s.app);
    await avisosERecado(navegador, s.url);
    await ausencias(navegador, s.url, s.api);
    await colunaEArrastar(navegador, s.url);
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
