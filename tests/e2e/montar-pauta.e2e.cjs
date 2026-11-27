// Ponta a ponta de Montar a pauta (#123), rodado à parte do vitest: `npm run e2e:montar-pauta`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com um Teable falso que só
// responde os cadastros de redatores e editores (fictícios). Nada vai ao Teable: o rascunho fica no SQLite.
//
// O papel: a administradora marca a Bia como coordenação nos Editores dos Cadastros. A Lia (que não é da coordenação)
// não vê a entrada "Montar a pauta" no topo, e o endereço da tela a leva para a Pauta, com o aviso; a rota recusa.
// A Bia vê a entrada ao lado da Pauta, nos caminhos do topo, e abre a tela em amanhã, com as abas da semana (o dia
// vazio). Tudo pelo teclado: "+ posição" na Madrugada põe o foco no editor; "rui" mostra o Rui na lista (livre) e Enter
// escolhe e vai ao horário; "22 AS 06" mostra "grava 22h às 6h" e, ao sair, vira o padrão; a demanda mostra o que o
// PROMeiro entendeu (a atração, a data, as versões como etiquetas e a grafia no padrão); Enter cria uma linha, Backspace
// na linha vazia apaga, as setas andam entre as linhas. Na Tarde, o Rui aparece "já na madrugada" na lista, e o Tab
// completa "eli" com a Elis. O rascunho é gravado sozinho: a aba de amanhã passa a rascunho e, recarregada a página,
// tudo volta como foi gravado (o horário e a claquete no padrão). Outro dia da semana continua vazio. No celular
// (escuro), o rascunho cabe na tela, sem rolar para o lado.
// As ilhas e os turnos (#124): a Bia cadastra as ilhas na aba Ilhas dos Cadastros (AVID 46 e VDI 7 com nome; a ILHA 46
// é recusada, é a mesma sala da AVID 46, #165); a Lia vê a lista, sem cadastrar. A ILHA 46 repetida de antes da regra
// (posta direto no banco, com uma posição) aparece no alto da lista como "mesma sala"; a Bia só lê que um
// administrador junta; a administradora escolhe ficar com a AVID 46, confere que 1 posição passa e junta. Com o histórico de uma semana antes (o Rui na AVID 46),
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
// na…" põe a Bia numa posição nova da Noite, o "Mover para…" leva a última claquete para o Rui e o ⇄ da demanda a
// move do Gil para a Bia, sem rolar para o lado. O ⇄ (#163) também está nas claquetes atribuídas no computador:
// discreto (sem borda e sem fundo, 44 px, no meio da claquete), o mesmo da lista "Para distribuir"; movida do Gil para
// o Rui por ele, a caixinha diz para onde foi e o Desfazer a põe de volta.
//
// Distribuir (#151): num dia adiante, com só uma vaga, o Distribuir de "Para distribuir" fica desligado e diz por quê.
// Com o Rui, a Elis e o Gil escalados, Distribuir põe o Mundo Animal no Gil (que o pegou no Teable dois dias antes) e a
// Terra Viva na Elis (menos demandas); cada uma tem o motivo na dica e o fundo tingido, sem faixa na borda, e a caixinha
// diz "2 claquetes distribuídas". Movida para o Rui, a Terra Viva perde o motivo. Nada é publicado. Desfazer devolve as
// duas para a lista de uma vez, mesmo a que foi movida.
//
// Colar da planilha (#130): num dia vazio, a Bia cola uma aba fictícia (as células por tab, como a planilha copia),
// com a linha de lixo, o dia, os rótulos de turno e um 4º bloco das 20h sem rótulo. O diálogo mostra o resumo
// (posições, demandas, avisos, ausências e grafias), as notas (o apelido, a ilha que sobra, o bloco lido como Noite) e
// a pergunta do nome com erro de digitação; respondida, "Pôr em…" monta a grade: os nomes do cadastro, as ilhas, os
// horários e as claquetes no padrão, o aviso quebrado juntado, e a folga da Bia vira ausência, na caixa "Fora".
// Colado de novo só um turno, "Juntar ao rascunho" acrescenta à Elis só a claquete que faltava. Recarregada, fica.
//
// A semana lado a lado com a planilha (#133): no dia colado, sem foto, a faixa diz que ainda não chegou. O n8n de
// mentira manda a mesma aba como foto crua (sem o token, 401; a mesma de novo só confirma); a faixa diz de quando é a
// foto e mostra 1 diferença (a claquete que o "Juntar" deu à Elis, que a planilha não tem), com o "ELIZ" casado com a
// Elis escalada; a foto crua abre à parte. Mudar o horário do Rui na grade vira diferença na hora, e voltar a tira.
// No celular (escuro), a faixa aberta cabe na tela.
//
// Repetir (#129): numa semana adiante, com a semana anterior montada (o Rui com claquete e COMUNICAÇÃO; a Elis com
// CALHAUS) e a Elis de férias na segunda e na terça, o dia vazio oferece Repetir (o mesmo dia na semana passada, o de
// ontem, que está vazio e fica desligado, e a semana passada inteira), Colar da planilha (o #130) e
// Começar do zero. Repetir a segunda traz a ilha, o editor, o horário e as tarefas, nunca as claquetes; a posição da
// Elis vira vaga, com o motivo, que sai quando a vaga ganha editor. Na terça, "a semana passada inteira" só preenche
// os dias vazios: a quarta, já montada, fica como estava. Na quinta, "Começar do zero" abre uma posição por turno,
// com o foco no editor.
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
  // o apelido do Gil na planilha (#130)
  tblKeyEdi: [{ id: 'recK1', fields: { key: 'GUGA', editor: [{ id: 'recE3' }] } }],
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
  await p.locator('.caminhos-do-topo .topo-pauta').first().waitFor();
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
  // a entrada, ao lado da Pauta, nos caminhos do topo
  const entrada = p.locator('.caminhos-do-topo .topo-montar');
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
  // os cadastrados que casam; no fim, o "usar como nome novo" (#132)
  assert.deepEqual(await lista.locator('[role="option"] strong').allInnerTexts(), ['Rui Teixeira', 'usar “rui” como nome novo']);
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
  // as versões como o código no padrão, colado no fim do que o PROMeiro entendeu (#152); o que ele quer dizer fica na dica
  const versoes = leitura.locator('.sufixo-versoes');
  assert.deepEqual((await versoes.allTextContents()).map((t) => t.trim()), ['(DP)'], 'as duas versões num código só, no padrão');
  assert.equal((await leitura.locator('.montar-data').textContent()).replace(/\s+/g, ' ').trim(), `Noite de Gala · ${semanaDe(amanha)} ${diaMes(amanha)} (DP)`, 'o código colado no fim, sem etiqueta');
  assert.equal(await p.locator('.codigo-versoes, .pauta-versoes').count(), 0, 'nenhuma etiqueta separada');
  assert.match(await versoes.getAttribute('title'), new RegExp(`^dia ${Number(amanha.slice(8))} e próxim[ao] ${semanaDe(amanha)}, da claquete$`));
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
  // o dia vazio oferece Repetir, Colar da planilha e Começar do zero (#129)
  await p.locator('.dia-vazio').getByText(/ainda vazio/).waitFor();
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
  // a ILHA 46 é a mesma sala da AVID 46 (#165)
  await form.getByRole('radio', { name: 'ILHA' }).click();
  await form.getByLabel('Número').fill('46');
  await form.getByRole('button', { name: 'Cadastrar' }).click();
  await p.locator('.aviso', { hasText: 'Já existe a AVID 46: ILHA 46 é a mesma sala.' }).waitFor();
  // a mesma ilha de novo é recusada
  await form.getByRole('radio', { name: 'AVID' }).click();
  await form.getByLabel('Número').fill('46');
  await form.getByRole('button', { name: 'Cadastrar' }).click();
  await p.locator('.aviso', { hasText: 'Já existe a AVID 46.' }).waitFor();
  await form.getByLabel('Número').fill('');
  const linhas = () => lista.locator('.item-ilha .nome').allInnerTexts();
  assert.deepEqual((await linhas()).map((t) => t.replace(/\s+/g, ' ').trim()), ['AVID 46', 'VDI 7 Sala da esquina']);
  // a coordenação não remove (só administradores)
  assert.equal(await lista.locator('.lixo-cad.travado').count(), 2);
  await capturar(p, '10-cadastros-ilhas');
  assert.deepEqual(erros, [], 'ilhas: erros na página');
  await ctx.close();

  // a Lia vê a lista, sem cadastrar
  const lia = await abrir(navegador, url, LIA, '#/cadastros/ilhas');
  await lia.p.locator('.item-ilha').first().waitFor();
  assert.equal(await lia.p.locator('.item-ilha').count(), 2);
  assert.ok(await lia.p.locator('.form-ilha').getByRole('button', { name: 'Cadastrar' }).isDisabled(), 'a Lia não cadastra');
  assert.deepEqual(lia.erros, [], 'ilhas (Lia): erros na página');
  await lia.ctx.close();
  console.log('ok: a coordenação cadastra as ilhas nos Cadastros; quem não é só vê');
}

/** A ILHA 46 repetida de antes da regra (#165): aparece para juntar, e só a administradora junta, depois de conferir. */
async function juntarAsRepetidas(navegador, url, api, db) {
  db.prepare("INSERT INTO ilhas (id, tipo, numero, nome, por, em) VALUES ('ilha-velha', 'ILHA', '46', '', ?, '2026-01-05T12:00:00.000Z')").run(BIA);
  const h = { 'cf-access-authenticated-user-email': BIA, 'content-type': 'application/json' };
  // uma posição antiga, fora das oito semanas da ilha de costume
  const longe = mais(amanha, -90);
  const r = await fetch(`${api}/montar-pauta?dia=${longe}`, { method: 'PUT', headers: h, body: JSON.stringify({ posicoes: [{ id: 'velha-1', turno: 'manha', editor: 'Gil Moura', ilha: 'ilha-velha', horario: '6h às 15h', demandas: [] }] }) });
  assert.equal(r.status, 200);

  const bia = await abrir(navegador, url, BIA, '#/cadastros/ilhas');
  const caixaDaBia = bia.p.locator('.ilha-repetida');
  await caixaDaBia.waitFor();
  assert.equal((await caixaDaBia.locator('p').innerText()).replace(/\s+/g, ' ').trim(), 'MESMA SALA AVID 46 (0 posições) e ILHA 46 (1 posição) são a mesma sala.');
  await caixaDaBia.getByText('Um administrador junta as duas.').waitFor();
  assert.equal(await caixaDaBia.getByRole('button').count(), 0, 'a coordenação não junta');
  assert.deepEqual(bia.erros, [], 'repetidas (Bia): erros na página');
  await bia.ctx.close();

  const { ctx, p, erros } = await abrir(navegador, url, CHEFE, '#/cadastros/ilhas');
  const caixa = p.locator('.ilha-repetida');
  await caixa.waitFor();
  await caixa.getByRole('button', { name: 'Ficar com a AVID 46' }).click();
  await caixa.getByText('1 posição da ILHA 46 passa para a AVID 46, e a ILHA 46 sai do cadastro. Os dias publicados continuam publicados.').waitFor();
  await capturar(p, '10b-cadastros-ilhas-repetidas');
  // nada mudou ainda: só a conferência
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM escala_posicoes WHERE ilha = 'ilha-velha'").get().n, 1);
  await caixa.getByRole('button', { name: 'Juntar na AVID 46' }).click();
  await p.locator('.aviso', { hasText: 'ILHA 46 juntada na AVID 46 (1 posição passou).' }).waitFor();
  await caixa.waitFor({ state: 'detached' });
  const linhas = (await p.locator('.lista-cad[aria-label="Ilhas"] .item-ilha .nome').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  assert.deepEqual(linhas, ['AVID 46', 'VDI 7 Sala da esquina']);
  const avid = db.prepare("SELECT id FROM ilhas WHERE tipo = 'AVID' AND numero = '46'").get().id;
  assert.equal(db.prepare("SELECT ilha FROM escala_posicoes WHERE id = 'velha-1'").get().ilha, avid);
  await capturar(p, '10c-cadastros-ilhas-juntadas');
  assert.deepEqual(erros, [], 'repetidas: erros na página');
  await ctx.close();
  console.log('ok: a ILHA 46 repetida de antes da regra aparece para juntar; só a administradora junta, depois de conferir');
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
/** O dia do Distribuir (#151), bem adiante; dois dias antes, no Teable, o Gil pegou o Mundo Animal. */
const distDia = mais(segunda, 45);
const PAUTA_DO_TEABLE = [
  linhaDoTeable('recT1', `Noite de Gala ${diaMes(amanha)} Dp`, 'Rui Teixeira', amanha, ['22:00', '06:00']),
  linhaDoTeable('recT2', `Corujão ${diaMes(amanha)}`, 'Gil Moura', amanha, ['06:00', '15:00']),
  linhaDoTeable('recT3', `Mundo Animal ${diaMes(mais(distDia, -1))} (P)`, 'Gil Moura', mais(distDia, -2), ['14:00', '23:00']),
];

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
  // o dia publicado: o código no fim do nome, uma vez só (#152)
  assert.equal((await p.locator('.pub-item.pub-claquete', { hasText: 'Vale a Pena Rever' }).textContent()).replace(/\s+/g, ' ').trim(), `Vale a Pena Rever ${diaMes(amanha)} (AH)`, 'publicada: o código no fim do nome');
  await capturar(p, '06-publicada', { fullPage: true });

  // na Pauta da edição (a Lia): a do Teable inteira e o que só o PROMeiro tem, sem dobrar
  const lia = await abrir(navegador, url, LIA, `#/pauta/dia/${amanha}`);
  await lia.p.locator('.pauta-colunas').waitFor();
  const naPauta = async () => lia.p.locator('.pauta-colunas .pauta-item').allInnerTexts().then((t) => t.join('\n'));
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

/* ---------- "Mostrar o código das versões" desligado (#152) ---------- */
/** A Bia desliga o código (pela rota das preferências; o menu do perfil é conferido nos e2e da Pauta e da agenda): ao
    montar a pauta, o que o PROMeiro entendeu fica só com o nome; ligado de novo, o código volta. */
async function oCodigoDesligado(navegador, url, api) {
  const lembrar = (v) => fetch(`${api}/eu/preferencias`, { method: 'PUT', headers: { 'cf-access-authenticated-user-email': BIA, 'content-type': 'application/json' }, body: JSON.stringify({ 'versoes.codigo': v }) });
  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${amanha}`);
  const noite = p.locator('.montar-leitura', { hasText: 'Noite de Gala ·' }).first();
  await noite.waitFor();
  assert.equal((await noite.locator('.montar-data').textContent()).replace(/\s+/g, ' ').trim(), `Noite de Gala · ${semanaDe(amanha)} ${diaMes(amanha)} (DP)`, 'ligado: o código no fim');
  assert.equal((await lembrar(false)).status, 200);
  await p.reload();
  await noite.waitFor();
  assert.equal((await noite.locator('.montar-data').textContent()).replace(/\s+/g, ' ').trim(), `Noite de Gala · ${semanaDe(amanha)} ${diaMes(amanha)}`, 'desligado: só o nome');
  assert.equal(await p.locator('.sufixo-versoes, .codigo-versoes').count(), 0, 'desligado: nenhum código');
  const pasta = process.env.CAPTURAS_SUFIXO || '';
  if (pasta) {
    mkdirSync(pasta, { recursive: true });
    await p.screenshot({ path: join(pasta, 'montar-pauta-desligada.png'), fullPage: true });
  }
  assert.equal((await lembrar(true)).status, 200);
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: "Mostrar o código das versões" desligado: ao montar a pauta, só o nome');
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
  // (#162: os avisos no ⚑ da coluna, com o balão; o recado do dia no alto)
  await lia.p.getByRole('button', { name: '2 avisos para Rui Teixeira' }).click();
  const balao = lia.p.locator('.pauta-aviso-balao');
  await balao.waitFor();
  assert.deepEqual(await balao.locator('.pauta-aviso-texto').allInnerTexts(), ['Redator vem acompanhar', 'Chega às 21h']);
  assert.deepEqual(await lia.p.locator('.pauta-recado p').allInnerTexts(), ['Reunião geral às 15h, na sala 3']);
  assert.equal(await lia.p.locator('.pauta-colunas .pauta-item', { hasText: 'Chega às 21h' }).count(), 0, 'o aviso não é item da pauta');
  await capturar(lia.p, '13-pauta-com-avisos-e-recado', { fullPage: true });

  // desfeita a publicação, a Pauta volta a ser só a do Teable (as ausências, a seguir, começam do rascunho)
  await p.getByRole('button', { name: 'Desfazer' }).click();
  await p.locator('.pub-faixa', { hasText: 'Publicação desfeita' }).waitFor();
  await lia.p.reload();
  await lia.p.locator('.pauta-colunas').waitFor();
  assert.equal(await lia.p.locator('.pauta-aviso-botao, .pauta-recado').count(), 0, 'sem a publicação, sem os avisos do PROMeiro');
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
  assert.deepEqual(await fora.locator('.pauta-etiqueta').allInnerTexts(), ['fora', 'fora']);
  assert.doesNotMatch(await fora.innerText(), /férias|folga|volta depois|comp/, 'a Lia não vê o motivo');
  await capturar(lia.p, '10-pauta-fora');
  // a mesma leitura da tela: a Semana que tem o dia, com quem está fora naquele dia
  const doChefe = await (await fetch(`${api}/pauta/semana?inicio=${amanha}`, { headers: { 'cf-access-authenticated-user-email': CHEFE } })).json();
  assert.deepEqual(doChefe.fora.filter((f) => f.dia === amanha).map((f) => f.motivo), [`férias até ${diaMes(mais(amanha, 3))}`, 'folga'], 'a administradora vê o motivo');

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
  // o ⇄ (#163): também na claquete já atribuída, no computador; discreto (sem borda, sem fundo), 44 px, no meio da
  // claquete, o mesmo da lista "Para distribuir"; nada de faixa na borda
  const gala = `Noite de Gala ${diaMes(depois)} (DP)`;
  const trocar = p.getByLabel(`Mover ${gala} para…`);
  const naLista = distribuir.getByLabel('Mover CALHAUS para…');
  await trocar.waitFor();
  const estilo = (el) => el.evaluate((x) => { const c = getComputedStyle(x); const r = x.getBoundingClientRect(); const li = x.closest('li').getBoundingClientRect(); return { largura: r.width, altura: r.height, meio: Math.abs(r.top + r.height / 2 - (li.top + li.height / 2)) < 1.5, borda: c.borderTopWidth, fundo: c.backgroundColor, cor: c.color, texto: x.selectedOptions[0].textContent, unha: parseFloat(getComputedStyle(x.closest('li')).borderLeftWidth) > 1 }; });
  const daGrade = await estilo(trocar);
  assert.deepEqual(daGrade, { largura: 44, altura: 44, meio: true, borda: '0px', fundo: 'rgba(0, 0, 0, 0)', cor: daGrade.cor, texto: '⇄', unha: false });
  assert.deepEqual(await estilo(naLista), daGrade, 'o mesmo ⇄ na lista "Para distribuir"');
  await p.mouse.move(2, 2);
  assert.ok(parseFloat(await trocar.evaluate((x) => getComputedStyle(x).opacity)) < 1, 'discreto até o mouse passar');
  await celula(gil).locator('.montar-demanda.arrastavel').first().hover();
  await ate(async () => assert.equal(await trocar.evaluate((x) => getComputedStyle(x).opacity), '1', 'acende com o mouse'));
  await capturar(p, '14a-mover-computador');
  // movida pelo ⇄ do Gil para o Rui: a caixinha diz para onde foi; Desfazer a põe de volta no Gil
  await trocar.selectOption(`posicao:${rui}`);
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => x.demandas), [[gala], []]));
  const movida = p.locator('.desfazer', { hasText: 'foi para' });
  assert.equal(await movida.innerText().then((t) => t.split('\n')[0]), `${gala} foi para Rui Teixeira`);
  await capturar(p, '14b-mover-caixinha');
  await movida.getByRole('button', { name: 'Desfazer' }).click();
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => x.demandas), [[], [gala]]));
  assert.equal(await movida.count(), 0, 'desfeito, a caixinha sai');
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
  // no tablet a coluna fica em cima da grade, e o "Fora" e o "Sem escala" chegam depois do dia, empurrando a grade
  // para baixo: o dedo só arrasta com os dois na tela, senão a soltura cai fora da célula do Rui
  await tablet.p.getByRole('region', { name: 'Fora' }).waitFor();
  await tablet.p.getByRole('region', { name: 'Sem escala' }).locator('.coluna-pessoa').first().waitFor();
  // a tela mostra o levar antes de o servidor gravar: fechar o tablet antes da resposta pode cortar o pedido
  const levado = tablet.p.waitForResponse((r) => new URL(r.url()).pathname === '/api/montar-pauta/levar' && r.request().method() === 'POST');
  levado.catch(() => {});
  await arrastarComODedo(tablet.p, tColuna.locator('.coluna-claquete', { hasText: 'Mundo Animal' }), tablet.p.locator(`.montar-celula[data-posicao-id="${rui}"]`));
  await ate(async () => assert.deepEqual((await aGrade(tablet.p)).map((x) => x.demandas), [[`Mundo Animal ${diaMes(depois)} (P)`], [`Noite de Gala ${diaMes(depois)} (DP)`]]));
  assert.deepEqual(await daLista(tablet.p), ['CALHAUS']);
  await semRolagemDeLado(tablet.p, 'coluna no tablet');
  await capturar(tablet.p, '15-coluna-tablet');
  assert.deepEqual(tablet.erros, [], 'coluna no tablet: erros na página');
  assert.equal((await levado).status(), 200, 'no tablet, o servidor gravou o levar');
  await tablet.ctx.close();

  // no celular (escuro): a coluna embaixo; "Escalar na…", "Mover para…" e o ⇄ da demanda
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

/* ---------- Distribuir (#151) ---------- */
async function distribuirSozinho(navegador, url, api) {
  const h = { 'cf-access-authenticated-user-email': BIA, 'content-type': 'application/json' };
  const gravar = async (posicoes) => assert.equal((await fetch(`${api}/montar-pauta?dia=${distDia}`, { method: 'PUT', headers: h, body: JSON.stringify({ posicoes }) })).status, 200);
  const posicao = (id, turno, editor, horario, demandas) => ({ id, turno, editor, ilha: '', horario, demandas: demandas.map((texto, i) => ({ id: `${id}-d${i}`, texto })) });
  // só uma vaga: ninguém para receber
  await gravar([posicao('dist-1', 'tarde', '', '14h às 23h', [])]);
  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${distDia}`);
  const coluna = p.getByRole('region', { name: 'Para distribuir' });
  await p.locator('.montar-celula').first().waitFor();
  const mundo = `Mundo Animal ${diaMes(distDia)} (P)`;
  const terra = `Terra Viva ${diaMes(distDia)} (A)`;
  await coluna.getByLabel('Escrever ou colar as claquetes').fill(`${mundo}\n${terra}`);
  await p.keyboard.press('Enter');
  await ate(async () => assert.deepEqual(await daLista(p), [mundo, terra]));
  const botao = coluna.getByRole('button', { name: 'Distribuir' });
  assert.ok(await botao.isDisabled(), 'sem ninguém escalado, o Distribuir fica desligado');
  await coluna.getByText('Ninguém escalado no dia para receber', { exact: false }).waitFor();

  // escalados: o Rui com uma tarefa, a Elis sem nada e o Gil com duas
  await gravar([posicao('dist-1', 'madrugada', 'Rui Teixeira', '22h às 6h', ['COMUNICAÇÃO']), posicao('dist-2', 'tarde', 'Elis Furtado', '14h às 23h', []), posicao('dist-3', 'tarde', 'Gil Moura', '14h às 23h', ['CALHAUS', 'COMUNICAÇÃO'])]);
  await p.reload();
  await p.locator('.montar-celula').nth(2).waitFor();
  await ate(async () => assert.deepEqual(await daLista(p), [mundo, terra]));
  assert.ok(!(await botao.isDisabled()), 'com gente escalada, o Distribuir liga');
  await botao.click();
  // o Mundo Animal vai para o Gil (pegou a atração no Teable, dois dias antes); a Terra Viva, para a Elis (menos demandas)
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => [x.editor, x.demandas]), [['Rui Teixeira', ['COMUNICAÇÃO']], ['Elis Furtado', [terra]], ['Gil Moura', ['CALHAUS', 'COMUNICAÇÃO', mundo]]]));
  assert.deepEqual(await daLista(p), [], 'a lista esvazia');
  const caixinha = p.locator('.desfazer', { hasText: 'distribuídas' });
  assert.match(await caixinha.innerText(), /2 claquetes distribuídas/);
  // o motivo na dica de cada demanda distribuída, no fundo tingido, sem faixa na borda
  const linha = (id) => p.locator(`.montar-celula[data-posicao-id="${id}"] .montar-demanda.distribuida`);
  assert.equal(await linha('dist-3').getAttribute('title'), `Distribuída: pegou a atração em ${diaMes(mais(distDia, -2))}`);
  assert.equal(await linha('dist-2').getAttribute('title'), 'Distribuída: menos demandas');
  const borda = await linha('dist-3').evaluate((el) => getComputedStyle(el).borderLeftWidth);
  assert.ok(parseFloat(borda) <= 1, 'nada de faixa na borda esquerda');
  // arrastada para outro editor, a claquete deixa de mostrar o motivo (ele era de onde o Distribuir a pôs)
  await arrastarComOMouse(p, linha('dist-2'), p.locator('.montar-celula[data-posicao-id="dist-1"]'));
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => x.demandas), [['COMUNICAÇÃO', terra], [], ['CALHAUS', 'COMUNICAÇÃO', mundo]]));
  assert.equal(await p.locator('.montar-demanda.distribuida').count(), 1);
  await linha('dist-3').hover();
  await p.locator('.montar-estado', { hasText: 'rascunho guardado' }).waitFor();
  await capturar(p, '22-distribuido');
  // recarregada, o rascunho ficou; nada foi publicado
  const lido = await (await fetch(`${api}/montar-pauta?dia=${distDia}`, { headers: h })).json();
  assert.equal(lido.estado, 'rascunho');
  assert.equal(lido.paraDistribuir.length, 0);

  // Desfazer: tudo volta para "Para distribuir", de uma vez
  await caixinha.getByRole('button', { name: 'Desfazer' }).click();
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => x.demandas), [['COMUNICAÇÃO'], [], ['CALHAUS', 'COMUNICAÇÃO']]));
  await ate(async () => assert.deepEqual(await daLista(p), [mundo, terra]));
  assert.equal(await caixinha.count(), 0, 'desfeito, a caixinha sai');
  assert.equal(await p.locator('.montar-demanda.distribuida').count(), 0);
  await ate(async () => assert.equal((await (await fetch(`${api}/montar-pauta?dia=${distDia}`, { headers: h })).json()).paraDistribuir.length, 2));
  await capturar(p, '23-distribuir-desfeito');
  assert.equal(escritasNoTeable.length, 0, 'nada foi escrito no Teable');
  assert.deepEqual(erros, [], 'distribuir: erros na página');
  await ctx.close();
  console.log('ok: Distribuir (a continuidade pelo Teable, a carga, o motivo na dica) e Desfazer, que devolve tudo de uma vez');
}

/* ---------- colar da planilha (#130) ---------- */
const colarDia = mais(amanha, 6);
const dm = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
/** A grade como a planilha copia: as células por tab, as linhas por quebra de linha. */
const tsv = (linhas) => linhas.map((l) => l.join('\t')).join('\n');
function blocos(rotulo, bs) {
  const linhas = [];
  if (rotulo) linhas.push(['', `                          ${rotulo}`]);
  linhas.push(['', ...bs.flatMap((b) => [b.ilha, ''])]);
  linhas.push(['', ...bs.flatMap((b) => ['EDITOR: ', b.nome])]);
  linhas.push(['', ...bs.flatMap((b) => ['HORÁRIO: ', b.hora])]);
  const max = Math.max(0, ...bs.map((b) => b.demandas.length));
  for (let k = 0; k < max; k++) linhas.push(['', ...bs.flatMap((b) => [b.demandas[k] ?? '', ''])]);
  linhas.push(['']);
  return linhas;
}
const [dd, mm, aaaa] = [colarDia.slice(8), colarDia.slice(5, 7), colarDia.slice(0, 4)];
const ABA = tsv([
  ['L'],
  ['', 'DIA', `${dd}/${mm}/${aaaa}`, '', 'ESTEIRA DE PÓS PRODUÇÃO'],
  ...blocos('MADRUGADA', [
    { ilha: 'AVID 46', nome: 'RUI', hora: '22H AS 6H', demandas: [`Noite de Gala ${dm(colarDia)} dp`, 'TERRA VEM PRONTA DA PROMO,', 'SÓ FINALIZAR'] },
    { ilha: 'VDI 7', nome: 'GUGA', hora: '22 AS 6', demandas: ['COMUNICAÇÃO', 'VDI 7'] },
  ]),
  ...blocos('MANHÃ', [
    { ilha: '', nome: 'ELIZ', hora: '8H AS 17', demandas: [`Mundo Animal ${dm(colarDia)} (P)`] },
    { ilha: 'AVID 46', nome: 'BIA', hora: 'FOLGA COMP', demandas: [] },
  ]),
  ...blocos(null, [{ ilha: 'AVID 99', nome: 'TOMÁS NOVO', hora: '20H AS 02H', demandas: [`Corujão ${dm(colarDia)} a`] }]),
]);

async function colarDaPlanilha(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${colarDia}`);
  // o dia vazio (#129) oferece o colar: abre o mesmo diálogo do botão do alto
  await p.locator('.dia-vazio').getByRole('button', { name: /Colar da planilha/ }).click();
  const dlg = p.getByRole('dialog', { name: 'Colar da planilha' });
  await dlg.getByLabel('O que foi copiado da planilha').fill(ABA);
  const lido = dlg.getByRole('region', { name: 'O que o PROMeiro entendeu' });
  await lido.getByText(/^Entendi/).waitFor();
  assert.equal(
    (await lido.locator('.colar-resumo').innerText()).replace(/\s+/g, ' ').trim(),
    'Entendi 4 posições, 4 demandas, 1 aviso e 1 ausência. 9 grafias vão para o padrão.',
    'o resumo antes de aplicar',
  );
  await lido.getByText('1 nome para confirmar', { exact: false }).waitFor();
  // as notas do que foi interpretado
  await lido.getByText('GUGA → Gil Moura').waitFor();
  await lido.getByText('“VDI 7” saiu: é uma ilha').waitFor();
  await lido.getByText('sem rótulo de turno, das 20h: lido como Noite').waitFor();
  await lido.getByText('“AVID 99” não está no cadastro das ilhas').waitFor();
  await lido.getByText('“TOMÁS NOVO” não está nos cadastros: nome novo').waitFor();
  await lido.getByText('Bia Campos · fora (folga comp)').waitFor();
  await lido.getByText('⚑ TERRA VEM PRONTA DA PROMO, SÓ FINALIZAR').waitFor();
  // a pergunta: "ELIZ" é a Elis
  const pergunta = lido.getByRole('group', { name: 'Quem é “ELIZ”?' });
  await pergunta.getByRole('button', { name: 'Elis Furtado' }).click();
  assert.equal(await pergunta.getByRole('button', { name: 'Elis Furtado' }).getAttribute('aria-pressed'), 'true');
  await semRolagemDeLado(p, 'colar');
  await capturar(p, '17-colar-da-planilha');
  await dlg.getByRole('button', { name: /^Pôr em/ }).click();
  await dlg.waitFor({ state: 'detached' });
  await p.getByText('Colado da planilha: 4 posições, 4 demandas e 1 ausência marcada.').waitFor();

  const esperado = [
    ['Madrugada', 'Rui Teixeira', '22h às 6h', [`Noite de Gala ${dm(colarDia)} (DP)`]],
    ['Madrugada', 'Gil Moura', '22h às 6h', ['COMUNICAÇÃO']],
    ['Manhã', 'Elis Furtado', '8h às 17h', [`Mundo Animal ${dm(colarDia)} (P)`]],
    ['Noite', 'TOMÁS NOVO', '20h às 2h', [`Corujão ${dm(colarDia)} (A)`]],
  ];
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => [x.turno, x.editor, x.horario, x.demandas]), esperado));
  assert.deepEqual(await p.locator('.montar-celula [data-campo="ilha"]').evaluateAll((es) => es.map((e) => e.value)), ['AVID 46', 'VDI 7', '', '']);
  assert.deepEqual(await p.locator('.montar-celula [data-campo="aviso"]').evaluateAll((es) => es.map((e) => e.value)), ['TERRA VEM PRONTA DA PROMO, SÓ FINALIZAR']);
  // a folga da Bia, marcada: na caixa "Fora", e não em "Sem escala"
  const coluna = p.getByRole('complementary', { name: 'Coluna lateral' });
  await coluna.getByRole('region', { name: 'Fora' }).locator('.aus-pessoa', { hasText: 'Bia Campos' }).waitFor();
  await p.locator('.montar-estado', { hasText: 'rascunho guardado' }).waitFor();
  await capturar(p, '18-colar-aplicado');

  // colado de novo, só um turno: juntar acrescenta à Elis só o que faltava
  await p.getByRole('button', { name: '⎘ Colar da planilha', exact: true }).click();
  await dlg.getByLabel('O que foi copiado da planilha').fill(tsv(blocos('MANHÃ', [{ ilha: '', nome: 'ELIS FURTADO', hora: '8h às 17h', demandas: [`Mundo Animal ${dm(colarDia)} (P)`, `Cozinha de Raiz ${dm(colarDia)} (AH)`] }])));
  await lido.getByText(/^Entendi 1 posição/).waitFor();
  await dlg.getByRole('button', { name: 'Juntar ao rascunho' }).click();
  await dlg.waitFor({ state: 'detached' });
  esperado[2][3] = [`Mundo Animal ${dm(colarDia)} (P)`, `Cozinha de Raiz ${dm(colarDia)} (AH)`];
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => [x.turno, x.editor, x.horario, x.demandas]), esperado));
  // recarregada, fica
  await p.locator('.montar-estado', { hasText: 'rascunho guardado' }).waitFor();
  await p.reload();
  await p.locator('.montar-celula').first().waitFor();
  await ate(async () => assert.deepEqual((await aGrade(p)).map((x) => [x.turno, x.editor, x.horario, x.demandas]), esperado));
  assert.deepEqual(erros, [], 'colar: erros na página');
  await ctx.close();

  // no celular (escuro), o diálogo cabe na tela, sem rolar para o lado
  const cel = await abrir(navegador, url, BIA, `#/pauta/montar/${colarDia}`, { viewport: { width: 390, height: 844 }, colorScheme: 'dark', hasTouch: true, isMobile: true });
  await cel.p.locator('.montar-celula').first().waitFor();
  await cel.p.getByRole('button', { name: '⎘ Colar da planilha', exact: true }).click();
  await cel.p.getByLabel('O que foi copiado da planilha').fill(ABA);
  await cel.p.getByRole('region', { name: 'O que o PROMeiro entendeu' }).getByText(/^Entendi/).waitFor();
  await semRolagemDeLado(cel.p, 'colar no celular');
  await capturar(cel.p, '19-colar-celular');
  assert.deepEqual(cel.erros, [], 'colar no celular: erros na página');
  await cel.ctx.close();
  console.log('ok: colar da planilha (o resumo, as notas, a pergunta do nome, pôr no dia, a ausência e juntar)');
}

/* ---------- A semana lado a lado com a planilha (#133) ---------- */
const TOKEN_DA_FOTO = 'token-da-foto-e2e';
/** O n8n de mentira: manda a foto crua (formato 1) de uma aba, como a API do Google devolve a grade. */
const mandarAFoto = (api, aba, texto) =>
  fetch(`${api}/publico/edicao/foto`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN_DA_FOTO}`, 'content-type': 'application/json' },
    body: JSON.stringify({ formato: 1, origem: { fluxo: 'fluxo-e2e', execucao: '1' }, lida_em: new Date().toISOString(), todas_as_abas: [aba], abas: [{ aba, intervalo: `'${aba}'!A1:AD80`, sheetId: 1, data_da_aba: null, linhas: texto.split('\n').map((l) => l.split('\t')), mesclas: [] }] }),
  });

async function ladoALado(navegador, url, api) {
  // sem foto do dia: a faixa só diz que ainda não chegou
  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${colarDia}`);
  await p.locator('.montar-celula').first().waitFor();
  await p.getByText('ainda não chegou foto da planilha para este dia', { exact: false }).waitFor();
  // sem o token, a rota recusa; com ele, guarda a aba (e a mesma de novo só confirma)
  assert.equal((await fetch(`${api}/publico/edicao/foto`, { method: 'POST', body: '{}' })).status, 401);
  assert.deepEqual(await (await mandarAFoto(api, 'SEXTA', ABA)).json(), { gravadas: 1, iguais: 0 });
  assert.deepEqual(await (await mandarAFoto(api, 'SEXTA', ABA)).json(), { gravadas: 0, iguais: 1 });

  // a foto é a aba que a Bia colou; depois, o "Juntar" deu à Elis uma claquete que a planilha não tem
  await p.reload();
  const lado = p.getByRole('region', { name: 'Lado a lado com a planilha' });
  await lado.getByText('1 diferença', { exact: true }).waitFor();
  await lado.getByText('3 posições iguais', { exact: false }).waitFor();
  await lado.getByRole('button', { name: 'ver as diferenças' }).click();
  const lista = lado.getByRole('list', { name: 'Diferenças por posição' });
  const textos = async () => (await lista.locator('.lado-pos').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  assert.deepEqual(await textos(), [`Elis Furtado Manhã PROMEIRO PLANILHA Demandas Cozinha de Raiz ${dm(colarDia)} (AH) —`]);
  await lado.getByText('A foto crua da aba SEXTA').click();
  await lado.locator('.lado-grade td', { hasText: 'TOMÁS NOVO' }).waitFor();
  await semRolagemDeLado(p, 'lado a lado');
  await capturar(p, '20-lado-a-lado');

  // a comparação acompanha o que está sendo digitado: o horário do Rui, mudado, vira diferença
  const rui = p.locator('.montar-celula').filter({ has: p.locator('[data-campo="editor"][value="Rui Teixeira"]') });
  const hora = rui.locator('[data-campo="horario"]');
  await hora.fill('22 as 5');
  await hora.press('Tab');
  await lado.getByText('2 diferenças', { exact: true }).waitFor();
  await ate(async () => assert.deepEqual((await textos())[0], 'Rui Teixeira Madrugada PROMEIRO PLANILHA Horário 22h às 5h 22h às 6h'));
  await hora.fill('22h às 6h');
  await hora.press('Tab');
  await lado.getByText('1 diferença', { exact: true }).waitFor();
  assert.deepEqual(erros, [], 'lado a lado: erros na página');
  await ctx.close();

  // no celular (escuro), a faixa aberta cabe na tela
  const cel = await abrir(navegador, url, BIA, `#/pauta/montar/${colarDia}`, { viewport: { width: 390, height: 844 }, colorScheme: 'dark', hasTouch: true, isMobile: true });
  const ladoCel = cel.p.getByRole('region', { name: 'Lado a lado com a planilha' });
  await ladoCel.getByRole('button', { name: 'ver as diferenças' }).click();
  await ladoCel.getByText('A foto crua da aba SEXTA').click();
  await semRolagemDeLado(cel.p, 'lado a lado no celular');
  await capturar(cel.p, '21-lado-a-lado-celular');
  assert.deepEqual(cel.erros, [], 'lado a lado no celular: erros na página');
  await cel.ctx.close();
  console.log('ok: a semana lado a lado (a foto com token, guardada só quando muda, e as diferenças posição por posição)');
}

/* ---------- Repetir (#129) ---------- */
async function repetir(navegador, url, api) {
  const h = { 'cf-access-authenticated-user-email': BIA, 'content-type': 'application/json' };
  const { ilhas } = await (await fetch(`${api}/cadastros/ilhas`, { headers: h })).json();
  const avid = ilhas.find((i) => i.tipo === 'AVID' && i.numero === '46').id;
  // a semana de antes, montada; a nova, adiante, com a quarta já montada
  const antes = mais(segunda, 21);
  const nova = mais(antes, 7);
  const montada = (dia) => [
    { id: `rep-${dia}-1`, turno: 'madrugada', editor: 'Rui Teixeira', ilha: avid, horario: '22h às 6h', demandas: [{ id: `rep-${dia}-d1`, texto: `Noite de Gala ${diaMes(dia)} (DP)` }, { id: `rep-${dia}-d2`, texto: 'COMUNICAÇÃO' }] },
    { id: `rep-${dia}-2`, turno: 'tarde', editor: 'Elis Furtado', ilha: '', horario: '14h às 22h53', demandas: [{ id: `rep-${dia}-d3`, texto: 'CALHAUS' }] },
  ];
  const gravar = async (dia, posicoes) => assert.equal((await fetch(`${api}/montar-pauta?dia=${dia}`, { method: 'PUT', headers: h, body: JSON.stringify({ posicoes }) })).status, 200);
  for (const n of [0, 1, 2]) await gravar(mais(antes, n), montada(mais(antes, n)));
  await gravar(mais(nova, 2), [{ id: 'rep-quarta', turno: 'noite', editor: 'Gil Moura', ilha: '', horario: '20h às 2h', demandas: [] }]);
  const r = await fetch(`${api}/montar-pauta/ausencias?dia=${nova}`, { method: 'POST', headers: h, body: JSON.stringify({ editor: 'Elis Furtado', tipo: 'ferias', de: nova, ate: mais(nova, 1), observacao: '' }) });
  assert.equal(r.status, 200);

  const { ctx, p, erros } = await abrir(navegador, url, BIA, `#/pauta/montar/${nova}`);
  const vazio = p.locator('.dia-vazio');
  await vazio.waitFor();
  const opcao = (nome) => vazio.getByRole('button', { name: nome });
  const semanaPassada = opcao(new RegExp(`A escala de ${curto(antes)}`));
  assert.match(await semanaPassada.innerText(), /o mesmo dia, na semana passada · 2 posições/);
  assert.ok(await opcao(new RegExp(`A escala de ${curto(mais(nova, -1))}`)).isDisabled(), 'ontem (domingo) está vazio: desligado');
  assert.match(await opcao(/A semana passada inteira/).innerText(), new RegExp(`preenche os dias vazios: ${curto(nova)}, ${curto(mais(nova, 1))}$`, 'm'));
  assert.ok(!(await opcao(/Colar da planilha/).isDisabled()), 'o colar da planilha (#130) está ligado');
  await capturar(p, '11-repetir-dia-vazio');

  // o mesmo dia na semana passada: a escala e as tarefas, nunca as claquetes; a Elis de férias vira vaga
  await semanaPassada.click();
  await p.locator('.repetido').getByText(`Escala de ${curto(antes)} repetida: 2 posições. Elis Furtado está fora: ficou a vaga.`).waitFor();
  const madrugada = turno(p, 'Madrugada').locator('.montar-celula').first();
  assert.equal(await madrugada.locator('[data-campo="editor"]').inputValue(), 'Rui Teixeira');
  assert.equal(await madrugada.locator('[data-campo="ilha"]').inputValue(), 'AVID 46');
  assert.equal(await madrugada.locator('[data-campo="horario"]').inputValue(), '22h às 6h');
  assert.deepEqual(await madrugada.locator('[data-campo="demanda"]').evaluateAll((els) => els.map((e) => e.value)), ['COMUNICAÇÃO'], 'a claquete fica');
  const tarde = turno(p, 'Tarde').locator('.montar-celula').first();
  assert.equal(await tarde.locator('[data-campo="editor"]').inputValue(), '');
  await tarde.locator('.montar-vaga').getByText(`Elis Furtado está de férias até ${diaMes(mais(nova, 1))}`).waitFor();
  assert.deepEqual(await tarde.locator('[data-campo="demanda"]').evaluateAll((els) => els.map((e) => e.value)), ['CALHAUS']);
  assert.equal(await p.locator('.montar-aba[aria-current="page"]').getAttribute('data-estado'), 'rascunho');
  assert.equal(await p.locator('.dia-vazio').count(), 0, 'o dia deixou de estar vazio');
  await semRolagemDeLado(p, 'repetir');
  await capturar(p, '12-repetir-vaga-com-motivo', { fullPage: true });
  // recarregada, a vaga continua com o motivo; com editor, o motivo sai
  await p.reload();
  await tarde.locator('.montar-vaga').waitFor();
  await tarde.locator('[data-campo="editor"]').fill('Gil Moura');
  assert.equal(await tarde.locator('.montar-vaga').count(), 0, 'com editor, a vaga sai');

  // na terça, a semana passada inteira: só os dias vazios
  await p.locator('.montar-aba', { hasText: diaMes(mais(nova, 1)) }).click();
  await p.waitForFunction((d) => location.hash === `#/pauta/montar/${d}`, mais(nova, 1));
  await opcao(/A semana passada inteira/).click();
  await p.locator('.repetido').getByText(`Semana passada repetida em ${curto(mais(nova, 1))}. Elis Furtado está fora: ficou a vaga.`).waitFor();
  const quarta = await (await fetch(`${api}/montar-pauta?dia=${mais(nova, 2)}`, { headers: h })).json();
  assert.deepEqual(quarta.posicoes.map((x) => x.id), ['rep-quarta'], 'a quarta, já montada, fica como estava');
  const segundaNova = await (await fetch(`${api}/montar-pauta?dia=${nova}`, { headers: h })).json();
  assert.deepEqual(segundaNova.posicoes.map((x) => x.editor), ['Rui Teixeira', 'Gil Moura'], 'a segunda também fica como estava');

  // na quinta, começar do zero: uma posição por turno, com o foco no editor da primeira
  await p.locator('.montar-aba', { hasText: diaMes(mais(nova, 3)) }).click();
  await opcao(/Começar do zero/).click();
  await p.waitForFunction(() => document.querySelectorAll('.montar-celula').length === 4);
  assert.equal((await focado(p)).campo, 'editor', 'o foco no editor');
  assert.deepEqual(await p.locator('[data-campo="horario"]').evaluateAll((els) => els.map((e) => e.value)), ['22h às 6h', '6h às 15h', '14h às 23h', '20h às 2h']);

  assert.equal(escritasNoTeable.length, 0, 'nada foi escrito nos cadastros');
  assert.deepEqual(erros, [], 'repetir: erros na página');
  await ctx.close();
  console.log('ok: Repetir a escala (as tarefas sem as claquetes, a vaga com o motivo, a semana inteira nos vazios) e começar do zero');
}

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: CHEFE }, { buscar: buscarNoTeable });
  // o Teable falso da descoberta e do Postgres da pauta (#127), só leitura
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const teable = teableFalso({ EDICAO_producao: 'pauta_e2e' }, { registros: { EDICAO_producao: PAUTA_DO_TEABLE } });
  const s = await subir({ cadastros, teable, pg: teable.abrirPg, env: { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, ...PG, EDICAO_FOTO_TOKEN: TOKEN_DA_FOTO } });
  // o convite do tour não atrapalha
  for (const quem of [LIA, BIA, CHEFE]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': quem } });
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    await marcarACoordenacao(navegador, s.url);
    await quemNaoEDaCoordenacao(navegador, s.url, s.api);
    await cadastrarAsIlhas(navegador, s.url);
    await juntarAsRepetidas(navegador, s.url, s.api, s.db);
    await umaSemanaAntes(s.api);
    await montarPeloTeclado(navegador, s.url);
    await noCelular(navegador, s.url);
    await conferirEPublicar(navegador, s.url, teable);
    await oCodigoDesligado(navegador, s.url, s.api);
    await turnosDaConfiguracao(navegador, s.url, s.app);
    await avisosERecado(navegador, s.url);
    await ausencias(navegador, s.url, s.api);
    await colunaEArrastar(navegador, s.url);
    await distribuirSozinho(navegador, s.url, s.api);
    await repetir(navegador, s.url, s.api);
    await colarDaPlanilha(navegador, s.url);
    await ladoALado(navegador, s.url, s.api);
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
