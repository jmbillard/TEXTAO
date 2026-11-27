// Ponta a ponta da Pauta da edição (#94), rodado à parte do vitest: `npm run e2e:pauta`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o Teable falso
// (tests/fixtures/teable-falso.mjs): a tabela EDICAO_producao achada pelo nome e o Postgres dele respondendo as linhas
// da pauta, fictícias, da semana de hoje e da anterior. Quem abre não é administrador (a pauta é de todo mundo que
// entrou). No computador, claro e escuro: a entrada no topo da fila, a Semana editor × dia na semana de hoje (um
// editor por linha na ordem do turno, "sem editor" no fim, o turno que passa da meia-noite no dia em que começou), as
// tarefas com outro visual, as versões da chamada como etiquetas (#95), o aviso só como ⚑ com o número e o texto no
// balão ao passar o mouse; a semana anterior e a próxima pelo endereço, e o endereço da semana aberto direto. No tablet e no celular: a grade rola para o lado com os
// nomes fixos, abre em hoje, e o toque abre o aviso. A claquete com a produção da arte (#96): as Produções carregadas da
// produção da arte do Teable falso (fictícias), a etapa, as artes, os designers, a praça, o marca-texto da prioridade
// ALTA ou "sem card"; um clique (ou toque) abre a ficha da claquete. Nada vai ao Trello.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:pauta
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:pauta');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const CHEFE = 'chefe.ficticia@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

/* ---------- as datas, sempre em São Paulo ---------- */
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const mais = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const segunda = mais(hoje, -((new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7));
const anterior = mais(segunda, -7);
const proxima = mais(segunda, 7);
const diaMes = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const sp = (iso, h) => new Date(`${iso}T${h}:00-03:00`).toISOString();

/** Uma linha da pauta (fictícia): o dia, o turno (o fim antes do início vira o dia seguinte), o editor ou null. */
let n = 0;
function linha(claquete, editor, dia, [ini, fim], anotacao = null) {
  n += 1;
  return {
    id: `recPautaE2e${n}`,
    fields: { claquete, key: claquete.toUpperCase(), editor: editor ? { id: `rec${editor.replace(/\W/g, '')}`, title: editor } : null, data: sp(dia, '00:00'), expediente_inicio: sp(dia, ini), expediente_fim: sp(fim < ini ? mais(dia, 1) : dia, fim), anotacao, alterado_em: sp(hoje, '08:00') },
  };
}
const PAUTA = [];
for (let i = 0; i < 7; i++) {
  const d = mais(segunda, i);
  PAUTA.push(linha(`Festa da Vila(Prologo)${diaMes(mais(d, 2))} (AH)`, 'Carla Duarte', d, ['22:00', '06:00']));
  PAUTA.push(linha(`Novela Sol ${diaMes(mais(d, 1))}`, 'Ana Ribeiro', d, ['06:00', '15:00']));
  PAUTA.push(linha(`Show da Tarde ${diaMes(d)}`, 'Bruno Teixeira', d, ['14:00', '22:53']));
}
PAUTA.push(linha('COMUNICAÇÃO', 'Bruno Teixeira', hoje, ['14:00', '22:53']));
// as versões da chamada (#95): fora do padrão (minúsculas, sem parênteses, com acento), inteiras e uma desconhecida
const JOGO = mais(hoje, 3);
const FESTIVAL = mais(hoje, 40);
PAUTA.push(linha(`Jogo Final ${diaMes(JOGO)} Dp`, 'Bruno Teixeira', hoje, ['14:00', '22:53']));
PAUTA.push(linha(`Festival ${diaMes(FESTIVAL)} (MÊS)`, 'Bruno Teixeira', hoje, ['14:00', '22:53']));
PAUTA.push(linha(`Grade da Noite ${diaMes(hoje)} (MNT)`, 'Bruno Teixeira', hoje, ['14:00', '22:53']));
PAUTA.push(linha(`Show Extra ${diaMes(hoje)} (XYZ)`, 'Bruno Teixeira', hoje, ['14:00', '22:53']));
PAUTA.push(linha('CALHAUS', null, hoje, ['08:00', '17:00']));
PAUTA.push(linha('Redator vem acompanhar a edição', 'Carla Duarte', hoje, ['22:00', '06:00'], true));
// a mesma atração em outra praça e com versão (#96): a ficha junta as duas linhas
PAUTA.push(linha(`Show da Tarde ${diaMes(hoje)} SP (H)`, 'Ana Ribeiro', hoje, ['06:00', '15:00']));
PAUTA.push(linha(`Esporte Antigo ${diaMes(mais(anterior, 3))}`, 'Ana Ribeiro', mais(anterior, 2), ['06:00', '15:00']));

/** A produção da arte (fictícia) do Show da Tarde de hoje: a G5 entregue, com prioridade ALTA, e a de SP produzindo. */
const ARTE = [
  { id: 'recArteE2e1', fields: { card_ID: '', claquete: `Show da Tarde ${diaMes(hoje)}`, status: '["FINALIZADO"]', entregue: true, arquivado: false, designers: '["Dora Lima"]', artes: 'HOJE | AMANHÃ | hoje', prioridade: 'ALTA', praca: null, filme: null, data_entrada: sp(mais(hoje, -3), '10:00'), data_entrega: sp(mais(hoje, -1), '18:30') } },
  { id: 'recArteE2e2', fields: { card_ID: '', claquete: `Show da Tarde ${diaMes(hoje)} SP`, status: '["PRODUZINDO"]', entregue: false, arquivado: false, designers: '["Enzo Prado"]', artes: 'HOJE', praca: null, filme: null, data_entrada: sp(mais(hoje, -2), '10:00') } },
];

async function abrir(navegador, url, opcoes, hash = '#/pauta') {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(LIA), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  const erros = [];
  const aoTrello = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  p.on('request', (r) => /trello/i.test(r.url()) && aoTrello.push(r.url()));
  await p.goto(`${url}${hash}`);
  return { ctx, p, erros, aoTrello };
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
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: true });
};
/** As etiquetas das versões: [o rótulo, o código pequeno]. */
const etiquetas = (l) => l.locator('.pauta-versao').evaluateAll((es) => es.map((e) => [e.firstChild.textContent.trim(), e.querySelector('small')?.textContent ?? '']));
const textos = async (l) => (await l.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
const fileira = (p, nome) => p.locator('.pauta-grade tbody tr', { has: p.locator('.pauta-nome', { hasText: new RegExp(`^${nome}$`) }) });
const celula = (p, nome, dia) => fileira(p, nome).locator(`td[data-dia="${dia}"]`);
const hash = (p) => new URL(p.url()).hash;

async function noComputador(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema }, '');
  assert.equal(await fundoEscuro(p), tema === 'dark');

  // a entrada no topo da fila
  await p.locator('.barra-topo .topo-pauta').click();
  await p.locator('.pauta-grade').waitFor();
  assert.equal(hash(p), '#/pauta');
  assert.equal((await p.locator('.pauta-cabeca h1').textContent()).trim(), 'Pauta da edição');

  // a semana de hoje, de segunda a domingo; hoje marcado
  const dias = await p.locator('th.pauta-dia').evaluateAll((ths) => ths.map((t) => t.dataset.dia));
  assert.equal(dias.length, 7);
  assert.equal(dias[0], segunda);
  assert.deepEqual(await p.locator('th.pauta-dia.hoje').evaluateAll((ths) => ths.map((t) => t.dataset.dia)), [hoje]);

  // um editor por linha, na ordem do turno de costume; "sem editor" no fim
  assert.deepEqual(await textos(p.locator('.pauta-nome')), ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Duarte', 'sem editor']);

  // a célula: o turno e as linhas; o turno que passa da meia-noite fica no dia em que começou
  const daCarla = celula(p, 'Carla Duarte', segunda);
  assert.equal((await daCarla.locator('.pauta-turno').textContent()).trim(), '22:00–06:00');
  assert.deepEqual(await textos(daCarla.locator('.pauta-texto')), [`Festa da Vila(Prologo)${diaMes(mais(segunda, 2))}`]);

  // as versões viram etiquetas, cada uma com o código original pequeno ao lado; o desconhecido aparece cru
  assert.deepEqual(await etiquetas(daCarla), [['amanhã', 'A'], ['hoje', 'H']]);
  const itemDo = (texto) => celula(p, 'Bruno Teixeira', hoje).locator('.pauta-item', { has: p.locator('.pauta-texto', { hasText: texto }) });
  const jogo = new Date(`${JOGO}T12:00:00Z`).getUTCDay();
  assert.deepEqual(await etiquetas(itemDo('Jogo Final')), [[`dia ${Number(JOGO.slice(8))}`, 'D'], [`${jogo % 6 === 0 ? 'próximo' : 'próxima'} ${SEMANA[jogo]}`, 'p']]);
  assert.deepEqual(await etiquetas(itemDo('Festival')), [[`em ${MESES[Number(FESTIVAL.slice(5, 7)) - 1]}`, 'MÊS']]);
  assert.deepEqual(await etiquetas(itemDo('Grade da Noite')), [['manutenção da grade', 'MNT']]);
  assert.deepEqual(await textos(itemDo('Show Extra').locator('.pauta-versao.desconhecida')), ['XYZ']);
  assert.deepEqual(await textos(itemDo('Show Extra').locator('.pauta-texto')), [`Show Extra ${diaMes(hoje)}`]);

  // a tarefa tem outro visual que a claquete
  const doBruno = celula(p, 'Bruno Teixeira', hoje);
  const tarefa = doBruno.locator('.pauta-item.pauta-tarefa');
  const claquete = doBruno.locator('.pauta-item.pauta-claquete').first();
  assert.deepEqual(await textos(tarefa), ['COMUNICAÇÃO']);
  const estilo = (l) => l.evaluate((e) => [getComputedStyle(e).fontStyle, getComputedStyle(e).fontFamily].join('|'));
  assert.notEqual(await estilo(tarefa), await estilo(claquete));
  assert.match(await estilo(tarefa), /^italic/);
  assert.deepEqual(await textos(celula(p, 'sem editor', hoje).locator('.pauta-item.pauta-tarefa')), ['CALHAUS']);

  // o aviso não é item da pauta: só o ⚑ com o número; o texto abre ao passar o mouse
  const avisoDeHoje = celula(p, 'Carla Duarte', hoje);
  assert.equal(await p.locator('.pauta-item', { hasText: 'Redator vem acompanhar' }).count(), 0);
  assert.equal((await avisoDeHoje.locator('.pauta-aviso-botao').textContent()).replace(/\s+/g, ' ').trim(), '⚑ 1');
  assert.equal(await p.locator('.pauta-aviso-botao').count(), 1);
  assert.equal(await p.locator('.pauta-aviso-balao').count(), 0);
  await avisoDeHoje.locator('.pauta-aviso-botao').hover();
  await p.locator('.pauta-aviso-balao').waitFor();
  assert.match(await p.locator('.pauta-aviso-balao').textContent(), /Redator vem acompanhar a edição/);
  await capturar(p, `01-semana-${nome}`);
  await p.mouse.move(5, 5);
  await p.locator('.pauta-aviso-balao').waitFor({ state: 'detached' });

  // a claquete com a produção da arte (#96): a etapa, as artes sem repetir, o designer, a praça e o marca-texto da
  // prioridade ALTA; a claquete sem produção diz "sem card"
  const show = itemDo(`Show da Tarde ${diaMes(hoje)}`).first();
  assert.equal((await show.locator('.pauta-producao').textContent()).replace(/\s+/g, ' ').trim(), 'Entregue · 2 artes · Dora Lima · G5');
  assert.equal(await show.locator('.marca-texto').count(), 1);
  const novela = celula(p, 'Ana Ribeiro', hoje).locator('.pauta-item', { has: p.locator('.pauta-texto', { hasText: 'Novela Sol' }) });
  assert.equal((await novela.locator('.pauta-producao').textContent()).trim(), 'sem card');
  assert.equal(await novela.locator('.marca-texto').count(), 0);
  // um clique abre a ficha: as duas linhas da atração (versões diferentes), os dias e a produção de cada praça
  await show.locator('.pauta-claquete-botao').click();
  const ficha = p.getByRole('dialog', { name: `Show da Tarde ${diaMes(hoje)}` });
  await ficha.waitFor();
  const tabelas = ficha.locator('.pauta-ficha-tabela');
  assert.equal(await tabelas.nth(0).locator('tbody tr').count(), 2);
  assert.deepEqual((await textos(tabelas.nth(0).locator('tbody td:last-child'))).sort(), ['Ana Ribeiro', 'Bruno Teixeira']);
  assert.match((await tabelas.nth(0).locator('tbody tr').first().textContent()) ?? '', /hoje/);
  assert.deepEqual(await etiquetas(ficha.locator('.pauta-ficha-versoes')), [['hoje', 'H']]);
  assert.deepEqual(await tabelas.nth(1).locator('tbody tr').evaluateAll((trs) => trs.map((t) => t.dataset.praca)), ['G5', 'SP']);
  assert.match(await tabelas.nth(1).locator('tr[data-praca="SP"]').textContent(), /Produzindo.*1.*Enzo Prado/);
  assert.match(await tabelas.nth(1).locator('tr[data-praca="G5"]').textContent(), /Entregue.*2.*Dora Lima/);
  await capturar(p, `03-ficha-${nome}`);
  await p.keyboard.press('Escape');
  await ficha.waitFor({ state: 'detached' });

  // a semana anterior e a próxima: o endereço muda e a grade também
  await p.getByRole('button', { name: 'Semana anterior' }).click();
  await p.locator(`th.pauta-dia[data-dia="${anterior}"]`).waitFor();
  assert.equal(hash(p), `#/pauta/semana/${anterior}`);
  assert.deepEqual(await textos(p.locator('.pauta-item .pauta-texto')), [`Esporte Antigo ${diaMes(mais(anterior, 3))}`]);
  assert.equal(await p.locator('th.pauta-dia.hoje').count(), 0);
  await p.getByRole('button', { name: 'Próxima semana' }).click();
  await p.locator(`th.pauta-dia[data-dia="${segunda}"]`).waitFor();
  assert.equal(hash(p), '#/pauta');
  // a próxima semana ainda sem pauta: diz que não há nada
  await p.keyboard.press('ArrowRight');
  await p.locator('.pauta-vazia').waitFor();
  assert.equal(hash(p), `#/pauta/semana/${proxima}`);
  // "esta semana" volta para a de hoje
  await p.locator('.pauta-hoje').click();
  await p.locator(`th.pauta-dia[data-dia="${segunda}"]`).waitFor();
  // o voltar do navegador
  await p.goBack();
  await p.locator('.pauta-vazia').waitFor();
  assert.equal(hash(p), `#/pauta/semana/${proxima}`);

  // o endereço da semana aberto direto (e recarregado)
  await p.goto(`${url}#/pauta/semana/${mais(anterior, 3)}`);
  await p.locator(`th.pauta-dia[data-dia="${anterior}"]`).waitFor();
  await p.reload();
  await p.locator(`th.pauta-dia[data-dia="${anterior}"]`).waitFor();
  await semRolagemDeLado(p, `computador ${nome}`);
  assert.deepEqual(erros, [], `computador ${nome}: erros na página`);
  assert.deepEqual(aoTrello, [], 'nada vai ao Trello');
  await ctx.close();
  console.log(`ok: computador ${nome}: entrada no topo → a semana de hoje, editores na ordem, tarefa, as versões como etiquetas, aviso no balão, a claquete com a produção e a ficha → semana anterior, próxima e o endereço`);
}

/** No tablet e no celular: a grade rola para o lado, os nomes ficam e ela abre em hoje; o toque abre o aviso. */
async function naTelaPequena(navegador, url, aparelho, rotulo, tema) {
  const { deviceScaleFactor, ...opcoes } = devices[aparelho];
  const nome = `${rotulo}-${tema === 'dark' ? 'escuro' : 'claro'}`;
  const { ctx, p, erros } = await abrir(navegador, url, { ...opcoes, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  await p.locator('.pauta-grade').waitFor();
  await semRolagemDeLado(p, nome);
  const medida = await p.evaluate(() => {
    const r = document.querySelector('.pauta-rolagem');
    const nomes = document.querySelector('th.pauta-canto').getBoundingClientRect();
    const hoje = document.querySelector('th.pauta-dia.hoje').getBoundingClientRect();
    return { rola: r.scrollWidth > r.clientWidth, scrollLeft: r.scrollLeft, maximo: r.scrollWidth - r.clientWidth, hoje: hoje.left, nomes: nomes.right, largura: r.getBoundingClientRect().right };
  });
  assert.ok(medida.rola, `${nome}: a grade rola para o lado`);
  // abre em hoje: a coluna de hoje logo depois dos nomes (ou o mais perto disso, no fim da semana)
  assert.ok(medida.hoje >= medida.nomes - 2 && medida.hoje < medida.largura, `${nome}: hoje à vista (${JSON.stringify(medida)})`);
  if (medida.scrollLeft < medida.maximo - 1) assert.ok(Math.abs(medida.hoje - medida.nomes) <= 2, `${nome}: hoje logo depois dos nomes`);
  // rolando para o lado, a coluna dos nomes fica
  await p.locator('.pauta-rolagem').evaluate((r) => (r.scrollLeft = r.scrollWidth));
  const nomesDepois = await p.locator('th.pauta-editor').first().evaluate((e) => e.getBoundingClientRect().left);
  const rolagem = await p.locator('.pauta-rolagem').evaluate((e) => e.getBoundingClientRect().left);
  assert.ok(Math.abs(nomesDepois - rolagem) <= 2, `${nome}: os nomes ficam fixos`);
  // o toque abre o aviso; outro toque fora fecha
  await p.locator('.pauta-rolagem').evaluate((r) => (r.scrollLeft = 0));
  const botao = celula(p, 'Carla Duarte', hoje).locator('.pauta-aviso-botao');
  await botao.scrollIntoViewIfNeeded();
  await botao.tap();
  await p.locator('.pauta-aviso-balao').waitFor();
  assert.match(await p.locator('.pauta-aviso-balao').textContent(), /Redator vem acompanhar a edição/);
  await capturar(p, `02-${nome}`);
  await p.locator('.pauta-cabeca h1').tap();
  await p.locator('.pauta-aviso-balao').waitFor({ state: 'detached' });
  // o toque na claquete abre a ficha, que cabe na tela; o voltar dela fecha
  const show = celula(p, 'Bruno Teixeira', hoje).locator('.pauta-claquete-botao', { hasText: `Show da Tarde ${diaMes(hoje)}` }).first();
  await show.scrollIntoViewIfNeeded();
  await show.tap();
  const ficha = p.locator('.pauta-ficha');
  await ficha.waitFor();
  assert.ok(await ficha.evaluate((f) => f.scrollWidth <= innerWidth + 1), `${nome}: a ficha cabe na tela`);
  await capturar(p, `04-ficha-${nome}`);
  await ficha.locator('.pauta-ficha-voltar').tap();
  await ficha.waitFor({ state: 'detached' });
  assert.deepEqual(erros, [], `${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: ${nome}: a grade rola para o lado com os nomes fixos, abre em hoje, o toque abre o aviso e a ficha`);
}

/** Na fila do celular, a entrada da pauta é só o ícone, e cabe no topo. */
async function entradaNoCelular(navegador, url) {
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, iphone, '');
  const entrada = p.locator('.barra-topo .topo-pauta');
  await entrada.waitFor();
  assert.equal(await entrada.locator('span').isVisible(), false);
  await semRolagemDeLado(p, 'fila no celular');
  await entrada.tap();
  await p.locator('.pauta-grade').waitFor();
  assert.equal(hash(p), '#/pauta');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: celular: a entrada no topo da fila (o ícone) abre a pauta');
}

async function principal() {
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const { comTabelas } = await import(join(RAIZ, 'servidor', 'tabelas-do-teable.mjs'));
  const teable = teableFalso({ EDICAO_producao: 'pauta_e2e', ARTE_producao: 'arte_e2e' }, { registros: { EDICAO_producao: PAUTA, ARTE_producao: ARTE } });
  const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
  // a produção da arte do mesmo Teable falso, para a carga das Produções (#96)
  const trello = { env: { ...PG, ...comTabelas({ ARTE_producao: 'arte_e2e' }) }, consultar: teable.consultar };
  const s = await subir({ teable, pg: teable.abrirPg, trello, env: { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, ...PG } });
  const carga = await fetch(`${s.api}/producoes/recarregar`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': CHEFE } });
  assert.equal(carga.status, 200, 'a carga das Produções');
  await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': LIA } });
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, tema);
    await naTelaPequena(navegador, s.url, 'iPad (gen 7)', 'tablet', 'light');
    for (const tema of ['light', 'dark']) await naTelaPequena(navegador, s.url, 'iPhone 13', 'celular', tema);
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
