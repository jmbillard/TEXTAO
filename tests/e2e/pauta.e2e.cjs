// Ponta a ponta da Pauta da edição (#94), rodado à parte do vitest: `npm run e2e:pauta`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o Teable falso
// (tests/fixtures/teable-falso.mjs): a tabela EDICAO_producao achada pelo nome e o Postgres dele respondendo as linhas
// da pauta, fictícias, da semana de hoje e da anterior. Quem abre não é administrador (a pauta é de todo mundo que
// entrou). No computador, claro e escuro: a entrada no topo da fila, a Semana editor × dia na semana de hoje (um
// editor por linha na ordem do turno, "sem editor" no fim, o turno que passa da meia-noite no dia em que começou), as
// tarefas com outro visual, as versões da chamada como o sufixo no fim do nome (#95, #152), o aviso só como ⚑ com o número e o texto no
// balão ao passar o mouse; a semana anterior e a próxima pelo endereço, e o endereço da semana aberto direto. No tablet e no celular: a grade rola para o lado com os
// nomes fixos, abre em hoje, e o toque abre o aviso. A claquete com a produção da arte (#96): as Produções carregadas da
// produção da arte do Teable falso (fictícias), a etapa, as artes, os designers, a praça, o marca-texto da prioridade
// ALTA ou "sem card"; um clique (ou toque) abre a ficha da claquete. Nada vai ao Trello.
// O Dia (#97), com o relógio do navegador parado às 15:30 de hoje: um clique no dia da Semana abre o Dia, com cada
// editor numa coluna (o nome, o turno, "no ar agora" ou o total de artes), o aviso como balão no topo da coluna; o
// anterior, o próximo e a volta à Semana; a troca entre empilhado e por hora (a régua das 6h às 6h e a linha do
// "agora"). No celular, o Dia abre em hoje e a faixa começa no turno que está no ar, nos dois arranjos.
// A Semana com um dia por coluna (#98), com outras pessoas (a escolha de cada uma começa vazia): a troca do arranjo, os
// cards agrupados por turno com o editor e o ⚑ do aviso, a ficha; a escolha da visão e dos arranjos lembrada depois de
// recarregar e em outro navegador (a entrada no topo abre a visão escolhida), e a da Lia não muda. No celular, as
// colunas rolam para o lado e abrem em hoje.
// Os filtros, o resumo e a cópia de reserva (#99): a Carla (editora, com o e-mail no cadastro de editores) filtra "Só as
// minhas" na Semana e no Dia, e a releitura a cada minuto mantém o filtro; a Dora (designer, pela tabela designers)
// não tem filtro (o "Com arte minha" saiu da tela no #156), nem a Lia; só o administrador vê o resumo; com o banco do Teable fora do
// ar, a página mostra a última cópia da pauta e a hora dela.
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
// a escolha lembrada (#98), de outras pessoas (uma por tema, cada uma começando sem escolha): a da Lia continua a dela
const TOM = 'tom.vieira@exemplo.com';
const IVO = 'ivo.santos@exemplo.com';
const CHEFE = 'chefe.ficticia@exemplo.com';
// os filtros (#99): a Carla é editora (o cadastro de editores tem o e-mail dela) e a Dora, designer (a tabela designers)
const CARLA = 'carla.duarte@exemplo.com';
const DORA = 'dora.lima@exemplo.com';
// a opção do código das versões (#152), de outra pessoa: a escolha é de cada um
const RUI = 'rui.costa@exemplo.com';
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

async function abrir(navegador, url, opcoes, hash = '#/pauta', agora = null, quem = LIA, relogio = null) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': quem }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(quem), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  const erros = [];
  const aoTrello = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  p.on('request', (r) => /trello/i.test(r.url()) && aoTrello.push(r.url()));
  // o relógio do navegador parado (os timers andam): o "agora" do Dia
  if (agora) await p.clock.setFixedTime(agora);
  // o relógio do navegador nas mãos do teste, a partir de `relogio`: o minuto da releitura passa na hora (#99)
  if (relogio) await p.clock.install({ time: relogio });
  await p.goto(`${url}${hash}`);
  return { ctx, p, erros, aoTrello };
}
const fundoEscuro = (p) =>
  p.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return r + g + b < 200;
  });
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
// a página inteira muda a janela de tamanho; a faixa do Dia no celular (larguras em vw) sai só com a tela
const capturar = async (p, nome, fullPage = true) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage });
};
/** As versões (#152): o código no padrão, um sufixo colado no fim do nome de cada claquete, e a dica dele ao passar o
    mouse. */
const etiquetas = (l) => l.locator('.sufixo-versoes').evaluateAll((es) => es.map((e) => e.textContent.trim()));
const dicas = (l) => l.locator('.sufixo-versoes').evaluateAll((es) => es.map((e) => e.title));
/** O nome da claquete como a pessoa lê: o texto e, colado no fim, o sufixo das versões. */
const nomesComVersoes = async (l) => (await l.locator('.pauta-nome-com-versoes').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
/** Liga ou desliga "Mostrar o código das versões" no menu do perfil (na fila, onde o perfil fica). */
async function mostrarOCodigo(p, ligado) {
  await p.locator('.perfil-botao').click();
  const grupo = p.getByRole('radiogroup', { name: 'Mostrar o código das versões' });
  await grupo.getByRole('radio', { name: ligado ? 'Ligado' : 'Desligado', exact: true }).click();
  await p.waitForFunction((v) => document.querySelector(`.escolha-codigo-versoes [aria-checked="true"]`)?.textContent === v, ligado ? 'Ligado' : 'Desligado');
  await p.keyboard.press('Escape');
}
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

  // as versões aparecem só como o código no padrão, uma etiqueta por claquete; o que ele quer dizer fica na dica; o
  // desconhecido aparece cru
  assert.deepEqual(await etiquetas(daCarla), ['(AH)']);
  assert.match((await dicas(daCarla))[0], /^amanhã e hoje, da claquete /);
  const itemDo = (texto) => celula(p, 'Bruno Teixeira', hoje).locator('.pauta-item', { has: p.locator('.pauta-texto', { hasText: texto }) });
  const jogo = new Date(`${JOGO}T12:00:00Z`).getUTCDay();
  assert.deepEqual(await etiquetas(itemDo('Jogo Final')), ['(DP)']);
  assert.match((await dicas(itemDo('Jogo Final')))[0], new RegExp(`^dia ${Number(JOGO.slice(8))} e ${jogo % 6 === 0 ? 'próximo' : 'próxima'} ${SEMANA[jogo]}, `));
  assert.deepEqual(await etiquetas(itemDo('Festival')), ['(M)']);
  assert.match((await dicas(itemDo('Festival')))[0], new RegExp(`^em ${MESES[Number(FESTIVAL.slice(5, 7)) - 1]}, `));
  assert.deepEqual(await etiquetas(itemDo('Grade da Noite')), ['(MNT)']);
  assert.deepEqual(await textos(itemDo('Show Extra').locator('.sufixo-versoes.desconhecido')), ['(XYZ)']);
  // o código vai colado no fim do nome, uma vez só (#152); nenhuma etiqueta separada nem rótulo legível na tela
  assert.deepEqual(await nomesComVersoes(daCarla), [`Festa da Vila(Prologo)${diaMes(mais(segunda, 2))} (AH)`]);
  assert.equal(await p.locator('.codigo-versoes, .pauta-versoes').count(), 0);
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
  // a versão de cada linha da atração, no padrão, na tabela (a ficha não tem etiqueta embaixo do nome, #152)
  assert.deepEqual((await textos(tabelas.nth(0).locator('tbody td.pauta-ficha-versao'))).sort(), ['(H)', '—']);
  assert.equal(await ficha.locator('.pauta-ficha-versoes').count(), 0);
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
  console.log(`ok: computador ${nome}: entrada no topo → a semana de hoje, editores na ordem, tarefa, o código das versões no fim do nome, aviso no balão, a claquete com a produção e a ficha → semana anterior, próxima e o endereço`);
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

/* ---------- o Dia (#97) ---------- */
/** 15:30 de hoje em São Paulo: a Ana (06:00–15:00) já saiu, o Bruno (14:00–22:53) está no ar, a Carla entra às 22:00;
    a faixa do celular começa no Bruno, o primeiro no ar. */
const AS_15_30 = new Date(sp(hoje, '15:30'));
const HORA = 46;
const coluna = (p, nome) => p.locator('.pauta-coluna', { has: p.locator('.pauta-coluna-topo .pauta-nome', { hasText: new RegExp(`^${nome}$`) }) });
const DIAS_POR_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const porExtenso = (iso) => `${DIAS_POR_EXTENSO[new Date(`${iso}T12:00:00Z`).getUTCDay()]}, ${Number(iso.slice(8))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;

async function oDia(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema }, '#/pauta', AS_15_30);
  await p.locator('.pauta-grade').waitFor();

  // um clique no dia da Semana abre aquele Dia, com endereço próprio
  await p.locator(`th.pauta-dia[data-dia="${hoje}"] a`).click();
  await p.locator('.pauta-colunas').waitFor();
  assert.equal(hash(p), `#/pauta/dia/${hoje}`);
  assert.equal((await p.locator('.pauta-cabeca h1').textContent()).trim(), porExtenso(hoje));
  assert.equal(await p.locator('.pauta-visao [aria-checked="true"]').textContent(), 'Dia');

  // cada editor numa coluna, na ordem de início do turno; sem editor no fim
  assert.deepEqual(await textos(p.locator('.pauta-coluna-topo .pauta-nome')), ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Duarte', 'sem editor']);
  // no topo: o turno e "no ar agora" (só quem está no ar) ou o total de artes
  assert.deepEqual(await textos(p.locator('.pauta-coluna-topo .pauta-turno')), ['06:00–15:00', '14:00–22:53', '22:00–06:00', '08:00–17:00']);
  // (a CALHAUS sem editor, das 08:00 às 17:00, também está no ar)
  assert.deepEqual(await p.locator('.pauta-coluna.no-ar .pauta-nome').allTextContents(), ['Bruno Teixeira', 'sem editor']);
  assert.equal((await coluna(p, 'Bruno Teixeira').locator('.pauta-no-ar').textContent()).trim(), 'no ar agora');
  assert.equal((await coluna(p, 'Ana Ribeiro').locator('.pauta-coluna-total').textContent()).trim(), '1 arte · 0/2 entregues');
  assert.equal((await coluna(p, 'Carla Duarte').locator('.pauta-coluna-total').textContent()).trim(), '1 claquete · 0/1 entregues');

  // as claquetes e as tarefas em cards, com as versões e a produção; o aviso não é card
  const doBruno = coluna(p, 'Bruno Teixeira');
  assert.deepEqual(await textos(doBruno.locator('.pauta-cards .pauta-tarefa')), ['COMUNICAÇÃO']);
  const show = doBruno.locator('.pauta-claquete', { has: p.locator('.pauta-texto', { hasText: new RegExp(`^Show da Tarde ${diaMes(hoje)}$`) }) });
  assert.equal((await show.locator('.pauta-producao').textContent()).replace(/\s+/g, ' ').trim(), 'Entregue · 2 artes · Dora Lima · G5');
  assert.equal(await p.locator('.pauta-cards .pauta-item', { hasText: 'Redator vem acompanhar' }).count(), 0);

  // o aviso: um balão "aviso" no topo da coluna da Carla, separado da pauta
  const balao = coluna(p, 'Carla Duarte').locator('.pauta-coluna-avisos .pauta-balao-aviso');
  assert.equal((await balao.locator('.pauta-balao-titulo').textContent()).trim(), 'aviso');
  assert.match(await balao.textContent(), /Redator vem acompanhar a edição/);
  assert.equal(await p.locator('.pauta-balao-aviso').count(), 1);
  // empilhado, o aviso empurra só os cards da coluna dele
  const topos = await p.locator('.pauta-coluna .pauta-coluna-corpo').evaluateAll((es) => es.map((e) => Math.round(e.getBoundingClientRect().top)));
  assert.equal(new Set(topos).size, 2, `só a coluna com aviso desce (${topos})`);
  await capturar(p, `05-dia-empilhado-${nome}`);

  // a ficha da claquete abre por cima do Dia
  await show.locator('.pauta-claquete-botao').click();
  const ficha = p.getByRole('dialog', { name: `Show da Tarde ${diaMes(hoje)}` });
  await ficha.waitFor();
  await p.keyboard.press('Escape');
  await ficha.waitFor({ state: 'detached' });

  // o arranjo por hora: a régua das 6h às 6h, o turno do início ao fim, a linha do "agora"
  await p.getByRole('radio', { name: 'Por hora' }).click();
  await p.locator('.pauta-regua').waitFor();
  assert.equal(await p.locator('.pauta-colunas').getAttribute('data-arranjo'), 'por-hora');
  assert.deepEqual(await textos(p.locator('.pauta-regua .pauta-hora:not(.agora)')), ['06h', '08h', '10h', '12h', '14h', '16h', '18h', '20h', '22h', '00h', '02h', '04h', '06h']);
  const naRegua = (nomeDoEditor) =>
    coluna(p, nomeDoEditor).evaluate((c) => {
      const corpo = c.querySelector('.pauta-horas').getBoundingClientRect();
      const bloco = c.querySelector('.pauta-bloco').getBoundingClientRect();
      const agora = c.querySelector('.pauta-agora')?.getBoundingClientRect();
      return { inicio: bloco.top - corpo.top, altura: bloco.height, agora: agora ? agora.top - corpo.top : null };
    });
  const ana = await naRegua('Ana Ribeiro');
  const bruno = await naRegua('Bruno Teixeira');
  const carla = await naRegua('Carla Duarte');
  assert.ok(Math.abs(ana.inicio) <= 1, `a manhã no topo da régua (${ana.inicio})`);
  assert.ok(Math.abs(bruno.inicio - 8 * HORA) <= 1, `a tarde às 14h (${bruno.inicio})`);
  assert.ok(Math.abs(carla.inicio - 16 * HORA) <= 1, `a noite às 22h (${carla.inicio})`);
  assert.ok(ana.altura >= 9 * HORA - 1, `a manhã vai até as 15h (${ana.altura})`);
  assert.ok(Math.abs(bruno.agora - 9.5 * HORA) <= 2, `a linha do agora às 15:30 (${bruno.agora})`);
  assert.equal((await p.locator('.pauta-regua .pauta-hora.agora').textContent()).trim(), '15:30');
  assert.equal(await coluna(p, 'Carla Duarte').locator('.pauta-coluna-avisos .pauta-balao-aviso').count(), 1);
  // por hora, as réguas das colunas começam juntas, com ou sem aviso
  const corpos = await p.locator('.pauta-colunas .pauta-coluna-corpo').evaluateAll((es) => es.map((e) => Math.round(e.getBoundingClientRect().top)));
  assert.equal(new Set(corpos).size, 1, `as réguas alinhadas (${corpos})`);
  await semRolagemDeLado(p, `dia por hora ${nome}`);
  await capturar(p, `06-dia-por-hora-${nome}`);

  // o próximo e o anterior: o endereço muda, o arranjo fica; fora de hoje, sem a linha do agora
  await p.getByRole('button', { name: 'Próximo dia' }).click();
  await p.locator('.pauta-cabeca h1', { hasText: porExtenso(mais(hoje, 1)) }).waitFor();
  assert.equal(hash(p), `#/pauta/dia/${mais(hoje, 1)}`);
  assert.equal(await p.locator('.pauta-colunas').getAttribute('data-arranjo'), 'por-hora');
  assert.equal(await p.locator('.pauta-agora').count(), 0);
  await p.getByRole('button', { name: 'Dia anterior' }).click();
  await p.getByRole('button', { name: 'Dia anterior' }).click();
  await p.locator('.pauta-cabeca h1', { hasText: porExtenso(mais(hoje, -1)) }).waitFor();
  assert.equal(hash(p), `#/pauta/dia/${mais(hoje, -1)}`);
  await p.keyboard.press('ArrowRight');
  await p.locator('.pauta-cabeca h1', { hasText: porExtenso(hoje) }).waitFor();
  // de volta ao empilhado
  await p.getByRole('radio', { name: 'Empilhado' }).click();
  await p.locator('.pauta-colunas[data-arranjo="empilhado"]').waitFor();
  assert.equal(await p.locator('.pauta-regua').count(), 0);

  // o endereço do Dia aberto direto (e recarregado); o dia sem pauta diz que não há nada
  await p.goto(`${url}#/pauta/dia/${mais(proxima, 2)}`);
  await p.locator('.pauta-vazia').waitFor();
  await p.goto(`${url}#/pauta/dia/${mais(segunda, 1)}`);
  await p.reload();
  await p.locator('.pauta-cabeca h1', { hasText: porExtenso(mais(segunda, 1)) }).waitFor();
  await p.locator('.pauta-colunas').waitFor();
  // a volta à Semana: a semana do dia
  await p.getByRole('radio', { name: 'Semana', exact: true }).click();
  await p.locator('.pauta-grade').waitFor();
  assert.equal(hash(p), '#/pauta');
  // e da Semana ao Dia pela troca da visão: hoje
  await p.getByRole('radio', { name: 'Dia', exact: true }).click();
  await p.locator('.pauta-cabeca h1', { hasText: porExtenso(hoje) }).waitFor();
  assert.equal(hash(p), '#/pauta/dia');
  assert.deepEqual(erros, [], `dia ${nome}: erros na página`);
  assert.deepEqual(aoTrello, [], 'nada vai ao Trello');
  await ctx.close();
  console.log(`ok: computador ${nome}: Semana → Dia, colunas na ordem do turno, no ar agora e o total, o balão do aviso, empilhado e por hora (a régua e o agora), anterior e próximo, volta à Semana`);
}

/** No celular, o Dia abre em hoje e a faixa começa no turno que está no ar, nos dois arranjos. */
async function oDiaNoCelular(navegador, url, tema) {
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const nome = `celular-${tema === 'dark' ? 'escuro' : 'claro'}`;
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema }, '#/pauta/dia', AS_15_30);
  await p.locator('.pauta-colunas').waitFor();
  assert.equal((await p.locator('.pauta-cabeca h1').textContent()).trim(), porExtenso(hoje));
  await semRolagemDeLado(p, `dia ${nome}`);
  const comecaNoAr = async (arranjo) => {
    await p.locator(`.pauta-colunas[data-arranjo="${arranjo}"]`).waitFor();
    const m = await p.evaluate(() => {
      const f = document.querySelector('.pauta-faixa');
      const regua = document.querySelector('.pauta-regua');
      const noAr = document.querySelector('.pauta-coluna.no-ar').getBoundingClientRect();
      return { rola: f.scrollWidth > f.clientWidth, scrollLeft: f.scrollLeft, noAr: noAr.left, inicio: regua ? regua.getBoundingClientRect().right : f.getBoundingClientRect().left, largura: innerWidth, direita: noAr.right };
    });
    assert.ok(m.rola, `${nome} ${arranjo}: as colunas rolam para o lado`);
    assert.ok(m.scrollLeft > 0, `${nome} ${arranjo}: a faixa não fica no começo (${JSON.stringify(m)})`);
    assert.ok(m.noAr >= m.inicio - 2 && m.noAr <= m.inicio + 24 && m.direita <= m.largura + 1, `${nome} ${arranjo}: a faixa começa no turno no ar (${JSON.stringify(m)})`);
  };
  await comecaNoAr('empilhado');
  await capturar(p, `07-dia-${nome}`, false);
  await p.getByRole('radio', { name: 'Por hora' }).tap();
  await comecaNoAr('por-hora');
  await capturar(p, `08-dia-por-hora-${nome}`, false);
  await semRolagemDeLado(p, `dia por hora ${nome}`);
  // rolando para o lado, a régua fica
  await p.locator('.pauta-faixa').evaluate((f) => (f.scrollLeft = f.scrollWidth));
  const regua = await p.locator('.pauta-regua').evaluate((e) => e.getBoundingClientRect().left);
  const faixa = await p.locator('.pauta-faixa').evaluate((e) => e.getBoundingClientRect().left + parseFloat(getComputedStyle(e).paddingLeft));
  assert.ok(Math.abs(regua - faixa) <= 2, `${nome}: a régua fica fixa (${regua}, ${faixa})`);
  // a escolha fica lembrada (#98): de volta ao empilhado, para o próximo tema abrir nele
  await p.getByRole('radio', { name: 'Empilhado' }).tap();
  await p.locator('.pauta-colunas[data-arranjo="empilhado"]').waitFor();
  await p.waitForLoadState('networkidle');
  assert.deepEqual(erros, [], `dia ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: ${nome}: o Dia abre em hoje, as colunas rolam para o lado e a faixa começa no turno no ar (empilhado e por hora)`);
}

/* ---------- a Semana com um dia por coluna e a escolha lembrada (#98) ---------- */
const colunaDoDia = (p, dia) => p.locator(`.pauta-dia-coluna[data-dia="${dia}"]`);
/** Espera o servidor guardar a escolha (o PUT das preferências). */
const guardou = (p) => p.waitForResponse((r) => r.url().endsWith('/api/eu/preferencias') && r.request().method() === 'PUT' && r.ok());

async function aEscolhaLembrada(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const quem = tema === 'dark' ? IVO : TOM;
  const tela = { viewport: { width: 1440, height: 1000 }, colorScheme: tema };
  let { ctx, p, erros, aoTrello } = await abrir(navegador, url, tela, '', AS_15_30, quem);

  // sem escolha: a entrada no topo abre a Semana editor × dia
  await p.locator('.barra-topo .topo-pauta').click();
  await p.locator('.pauta-grade').waitFor();
  assert.equal(hash(p), '#/pauta');
  assert.equal(await p.locator('.pauta-arranjo-semana [aria-checked="true"]').textContent(), 'Editor × dia');

  // a troca para um dia por coluna: sete colunas, de segunda a domingo, hoje marcado
  const salvo = guardou(p);
  await p.getByRole('radio', { name: 'Um dia por coluna' }).click();
  await salvo;
  await p.locator('.pauta-dias').waitFor();
  assert.equal(await p.locator('.pauta-grade').count(), 0);
  assert.equal(hash(p), '#/pauta');
  assert.deepEqual(await p.locator('.pauta-dia-coluna').evaluateAll((cs) => cs.map((c) => c.dataset.dia)), Array.from({ length: 7 }, (_, i) => mais(segunda, i)));
  assert.deepEqual(await p.locator('.pauta-dia-coluna.hoje').evaluateAll((cs) => cs.map((c) => c.dataset.dia)), [hoje]);
  // no topo do dia: quantos editores e quantas claquetes
  const deHoje = colunaDoDia(p, hoje);
  assert.equal((await deHoje.locator('.pauta-dia-conta').textContent()).trim(), '3 editores · 8 claquetes');
  // os cards agrupados por turno: manhã, tarde, noite (ninguém de madrugada); cada card com o editor
  assert.deepEqual(await textos(deHoje.locator('.pauta-periodo-nome')), ['manhã', 'tarde', 'noite']);
  const periodo = (id) => deHoje.locator(`.pauta-periodo[data-periodo="${id}"]`);
  assert.deepEqual(await textos(periodo('manha').locator('.pauta-card-editor')), ['Ana Ribeiro', 'Ana Ribeiro', 'sem editor']);
  assert.deepEqual(await textos(periodo('manha').locator('.pauta-texto')), [`Novela Sol ${diaMes(mais(hoje, 1))}`, `Show da Tarde ${diaMes(hoje)} SP`, 'CALHAUS']);
  assert.equal(await periodo('tarde').locator('.pauta-item.pauta-tarefa', { hasText: 'COMUNICAÇÃO' }).count(), 1);
  assert.deepEqual(await textos(periodo('noite').locator('.pauta-card-editor')), ['Carla Duarte']);
  // a claquete com a produção da arte, como no editor × dia
  const show = periodo('tarde').locator('.pauta-item', { has: p.locator('.pauta-texto', { hasText: new RegExp(`^Show da Tarde ${diaMes(hoje)}$`) }) });
  assert.equal((await show.locator('.pauta-producao').textContent()).replace(/\s+/g, ' ').trim(), 'Entregue · 2 artes · Dora Lima · G5');
  // o aviso: só o ⚑ com o número, preso ao editor, e o texto ao passar o mouse
  assert.equal(await p.locator('.pauta-item', { hasText: 'Redator vem acompanhar' }).count(), 0);
  const aviso = periodo('noite').locator('.pauta-aviso-botao');
  assert.equal((await aviso.textContent()).replace(/\s+/g, ' ').trim(), '⚑ 1');
  await aviso.hover();
  await p.locator('.pauta-aviso-balao').waitFor();
  assert.match(await p.locator('.pauta-aviso-balao').textContent(), /Redator vem acompanhar a edição/);
  await capturar(p, `09-semana-dia-por-coluna-${nome}`);
  await p.mouse.move(5, 5);
  // a ficha abre por cima
  await show.locator('.pauta-claquete-botao').click();
  await p.getByRole('dialog', { name: `Show da Tarde ${diaMes(hoje)}` }).waitFor();
  await p.keyboard.press('Escape');
  await semRolagemDeLado(p, `dia por coluna ${nome}`);

  // recarregada, a Semana continua um dia por coluna; a semana anterior também
  await p.reload();
  await p.locator('.pauta-dias').waitFor();
  await p.getByRole('button', { name: 'Semana anterior' }).click();
  await colunaDoDia(p, anterior).waitFor();
  assert.equal(await p.locator('.pauta-grade').count(), 0);

  // um clique no dia abre aquele Dia; o arranjo do Dia e a visão ficam lembrados
  await p.getByRole('button', { name: 'Próxima semana' }).click();
  await colunaDoDia(p, hoje).locator('.pauta-dia-link').click();
  await p.locator('.pauta-colunas[data-arranjo="empilhado"]').waitFor();
  assert.equal(hash(p), `#/pauta/dia/${hoje}`);
  let salvou = guardou(p);
  await p.getByRole('radio', { name: 'Por hora' }).click();
  await salvou;
  salvou = guardou(p);
  await p.getByRole('radio', { name: 'Semana', exact: true }).click();
  await salvou;
  await p.locator('.pauta-dias').waitFor();
  salvou = guardou(p);
  await p.getByRole('radio', { name: 'Dia', exact: true }).click();
  await salvou;
  await p.locator('.pauta-colunas[data-arranjo="por-hora"]').waitFor();
  await p.reload();
  await p.locator('.pauta-colunas[data-arranjo="por-hora"]').waitFor();
  assert.deepEqual(erros, [], `escolha ${nome}: erros na página`);
  assert.deepEqual(aoTrello, [], 'nada vai ao Trello');
  await ctx.close();

  // em outro aparelho (outro navegador, nada guardado nele): a entrada no topo abre o Dia por hora, e a Semana, um dia
  // por coluna
  ({ ctx, p, erros } = await abrir(navegador, url, tela, '', AS_15_30, quem));
  await p.locator('.barra-topo .topo-pauta').click();
  await p.locator('.pauta-colunas[data-arranjo="por-hora"]').waitFor();
  assert.equal(hash(p), '#/pauta/dia');
  salvou = guardou(p);
  await p.getByRole('radio', { name: 'Semana', exact: true }).click();
  await salvou;
  await p.locator('.pauta-dias').waitFor();
  // e a entrada volta a abrir a Semana
  await p.goto(`${url}#/`);
  await p.locator('.barra-topo .topo-pauta').click();
  await p.locator('.pauta-dias').waitFor();
  assert.equal(hash(p), '#/pauta');
  assert.deepEqual(erros, [], `escolha ${nome}, outro aparelho: erros na página`);
  await ctx.close();

  // a escolha é de cada pessoa: a Lia continua na Semana editor × dia
  ({ ctx, p, erros } = await abrir(navegador, url, tela, '#/pauta', AS_15_30));
  await p.locator('.pauta-grade').waitFor();
  assert.equal(await p.locator('.pauta-dias').count(), 0);
  await ctx.close();
  console.log(`ok: computador ${nome}: a Semana com um dia por coluna (os turnos, o editor no card, o aviso, a ficha), a escolha lembrada depois de recarregar e em outro aparelho, e a de outra pessoa não muda`);
}

/** No celular, a Semana com um dia por coluna rola para o lado e abre em hoje. */
async function oDiaPorColunaNoCelular(navegador, url) {
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: 'dark' }, '#/pauta', AS_15_30, TOM);
  await p.locator('.pauta-dias').waitFor();
  await semRolagemDeLado(p, 'dia por coluna no celular');
  const m = await p.evaluate(() => {
    const r = document.querySelector('.pauta-faixa');
    const hoje = document.querySelector('.pauta-dia-coluna.hoje').getBoundingClientRect();
    return { rola: r.scrollWidth > r.clientWidth, scrollLeft: r.scrollLeft, maximo: r.scrollWidth - r.clientWidth, hoje: hoje.left, direita: hoje.right, inicio: r.getBoundingClientRect().left, largura: innerWidth };
  });
  assert.ok(m.rola, `celular: as colunas rolam para o lado (${JSON.stringify(m)})`);
  assert.ok(m.hoje >= m.inicio - 2 && m.direita <= m.largura + 1, `celular: abre em hoje (${JSON.stringify(m)})`);
  await capturar(p, '10-semana-dia-por-coluna-celular-escuro', false);
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: celular escuro: a Semana com um dia por coluna rola para o lado e abre em hoje');
}

/** Espera a leitura da pauta (a Semana ou o Dia) com este filtro (ou sem nenhum). */
const leu = (p, filtro = null) =>
  p.waitForResponse((r) => /\/api\/pauta\/(semana|dia)/.test(r.url()) && new URL(r.url()).searchParams.get('filtro') === filtro && r.ok());
const nomesDaGrade = (p) => textos(p.locator('.pauta-grade tbody .pauta-nome'));

async function osFiltros(navegador, url, teable) {
  const tela = { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' };

  // a Carla, editora: "Só as minhas" na Semana; "Com arte minha" não aparece (ela não é designer)
  let { ctx, p, erros, aoTrello } = await abrir(navegador, url, tela, '#/pauta', null, CARLA, AS_15_30);
  await p.locator('.pauta-grade').waitFor();
  const filtro = p.getByRole('radiogroup', { name: 'Filtro da pauta' });
  assert.deepEqual(await textos(filtro.getByRole('radio')), ['Todas', 'Só as minhas']);
  assert.equal(await filtro.getByRole('radio', { name: 'Todas' }).getAttribute('aria-checked'), 'true');
  assert.deepEqual(await nomesDaGrade(p), ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Duarte', 'sem editor']);
  // o resumo é só do administrador
  assert.equal(await p.locator('.pauta-resumo').count(), 0);
  let lida = leu(p, 'minhas');
  await filtro.getByRole('radio', { name: 'Só as minhas' }).click();
  await lida;
  await p.waitForFunction(() => document.querySelectorAll('.pauta-grade tbody tr').length === 1);
  assert.deepEqual(await nomesDaGrade(p), ['Carla Duarte']);
  assert.equal(await filtro.getByRole('radio', { name: 'Só as minhas' }).getAttribute('aria-checked'), 'true');
  assert.equal(await celula(p, 'Carla Duarte', hoje).locator('.pauta-aviso-botao').count(), 1);
  await capturar(p, '11-semana-so-as-minhas-claro');

  // a releitura a cada minuto, com o filtro
  lida = leu(p, 'minhas');
  await p.clock.runFor(61_000);
  await lida;
  assert.deepEqual(await nomesDaGrade(p), ['Carla Duarte']);

  // no Dia, o filtro continua: só a coluna dela, com o balão do aviso
  lida = leu(p, 'minhas');
  await p.getByRole('radio', { name: 'Dia', exact: true }).click();
  await lida;
  await p.locator('.pauta-colunas').waitFor();
  assert.deepEqual(await textos(p.locator('.pauta-coluna .pauta-nome')), ['Carla Duarte']);
  assert.match(await p.locator('.pauta-balao-aviso').textContent(), /Redator vem acompanhar a edição/);
  // "Todas" volta a pauta inteira
  lida = leu(p, null);
  await filtro.getByRole('radio', { name: 'Todas' }).click();
  await lida;
  await p.waitForFunction(() => document.querySelectorAll('.pauta-coluna').length > 1);
  assert.deepEqual(await textos(p.locator('.pauta-coluna .pauta-nome')), ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Duarte', 'sem editor']);
  // de volta à Semana, para a próxima vez
  await p.getByRole('radio', { name: 'Semana', exact: true }).click();
  await p.locator('.pauta-grade').waitFor();
  assert.deepEqual(erros, [], 'filtro da Carla: erros na página');
  assert.deepEqual(aoTrello, [], 'nada vai ao Trello');
  await ctx.close();

  // a Dora, designer: o "Com arte minha" saiu da tela (#156); sem ser editora, ela fica sem filtro, no computador e no
  // celular, claro e escuro
  for (const [onde, opcoes] of [['computador', tela], ['celular', devices['iPhone 13']]])
    for (const tema of ['light', 'dark']) {
      ({ ctx, p, erros } = await abrir(navegador, url, { ...opcoes, colorScheme: tema }, '#/pauta', null, DORA));
      await p.locator('.pagina.pauta .pauta-texto').first().waitFor();
      assert.equal(await p.getByRole('radiogroup', { name: 'Filtro da pauta' }).count(), 0, `a designer sem o filtro (${onde})`);
      assert.equal(await p.getByText('Com arte minha').count(), 0, `nada de "Com arte minha" (${onde})`);
      await capturar(p, `pauta-sem-com-arte-minha-${onde}-${tema === 'light' ? 'claro' : 'escuro'}`, false);
      assert.deepEqual(erros, [], 'a Dora: erros na página');
      await ctx.close();
    }

  // a Lia, sem cadastro de editor nem de designer: sem filtro
  ({ ctx, p, erros } = await abrir(navegador, url, tela));
  await p.locator('.pauta-grade').waitFor();
  assert.equal(await p.getByRole('radiogroup', { name: 'Filtro da pauta' }).count(), 0);
  await ctx.close();

  // o administrador vê o resumo discreto: as linhas sem editor, as claquetes sem card e a última alteração
  ({ ctx, p, erros } = await abrir(navegador, url, { ...tela, colorScheme: 'dark' }, '#/pauta', null, CHEFE));
  await p.locator('.pauta-grade').waitFor();
  const resumo = (await p.locator('.pauta-resumo').textContent()).replace(/\s+/g, ' ');
  assert.match(resumo, /^1 linha sem editor/);
  assert.match(resumo, /\d+ claquetes sem card/);
  assert.match(resumo, /pauta alterada às 08:00/);
  assert.equal(await p.locator('.pauta-copia').count(), 0);

  // o banco do Teable cai: a página relida mostra a última cópia, com a hora dela
  teable.estado.fora = true;
  try {
    await p.reload();
    await p.locator('.pauta-grade').waitFor();
    await p.locator('.pauta-copia').waitFor();
    assert.match(await p.locator('.pauta-copia').textContent(), /O banco do Teable não respondeu: esta é a cópia da pauta das \d{2}:\d{2}/);
    assert.deepEqual(await nomesDaGrade(p), ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Duarte', 'sem editor']);
    await capturar(p, '12-semana-copia-e-resumo-escuro');
  } finally {
    teable.estado.fora = false;
  }
  assert.deepEqual(erros, [], 'resumo e cópia: erros na página');
  await ctx.close();
  console.log('ok: o filtro "Só as minhas" (sem o "Com arte minha"), a releitura, o resumo do administrador e a cópia de reserva');
}

/**
 * "Mostrar o código das versões" (#152), do Rui (outra pessoa: a escolha é de cada um): começa ligada; desligada no menu
 * do perfil, a Pauta (Semana, Dia e a ficha) mostra só o nome, sem etiqueta nenhuma; a escolha fica lembrada depois de
 * recarregar e em outro navegador, e a da Lia continua ligada.
 */
async function oCodigoDasVersoes(navegador, url) {
  const pastaDoSufixo = process.env.CAPTURAS_SUFIXO || '';
  const foto = async (p, nome) => {
    if (!pastaDoSufixo) return;
    mkdirSync(pastaDoSufixo, { recursive: true });
    await p.waitForTimeout(300);
    await p.screenshot({ path: join(pastaDoSufixo, `${nome}.png`), fullPage: true });
  };
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, '', null, RUI);
  await p.locator('.perfil-botao').waitFor();
  await p.locator('.barra-topo .topo-pauta').click();
  await p.locator('.pauta-grade').waitFor();
  const daCarla = celula(p, 'Carla Duarte', segunda);
  const festa = `Festa da Vila(Prologo)${diaMes(mais(segunda, 2))}`;
  // ligada (o valor inicial): o código colado no fim do nome
  assert.deepEqual(await nomesComVersoes(daCarla), [`${festa} (AH)`], 'ligada: o código no fim do nome');
  await foto(p, 'pauta-ligada');
  // desligada no menu do perfil: só o nome, em todo lugar da Pauta
  await p.goto(`${url}#/`);
  await mostrarOCodigo(p, false);
  await p.goto(`${url}#/pauta`);
  await p.locator('.pauta-grade').waitFor();
  assert.deepEqual(await nomesComVersoes(daCarla), [festa], 'desligada: só o nome');
  assert.equal(await p.locator('.sufixo-versoes, .codigo-versoes, .pauta-versoes').count(), 0, 'desligada: nenhum código na Semana');
  await foto(p, 'pauta-desligada');
  // a ficha: o nome sem o código e a tabela sem a coluna da versão
  await celula(p, 'Bruno Teixeira', hoje).locator('.pauta-claquete-botao').first().click();
  const ficha = p.locator('.pauta-ficha');
  await ficha.waitFor();
  assert.equal(await ficha.locator('.sufixo-versoes, .pauta-ficha-versao').count(), 0, 'desligada: a ficha sem código');
  await p.keyboard.press('Escape');
  // lembrada por pessoa: depois de recarregar e em outro navegador continua desligada; a da Lia continua ligada
  await p.reload();
  await p.locator('.pauta-grade').waitFor();
  assert.deepEqual(await nomesComVersoes(daCarla), [festa], 'desligada depois de recarregar');
  const outro = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, '#/pauta', null, RUI);
  await outro.p.locator('.pauta-grade').waitFor();
  assert.deepEqual(await nomesComVersoes(celula(outro.p, 'Carla Duarte', segunda)), [festa], 'desligada em outro navegador');
  await outro.ctx.close();
  const daLia = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, '#/pauta');
  await daLia.p.locator('.pauta-grade').waitFor();
  assert.deepEqual(await nomesComVersoes(celula(daLia.p, 'Carla Duarte', segunda)), [`${festa} (AH)`], 'a da Lia continua ligada');
  await daLia.ctx.close();
  // ligada de novo: o código volta
  await p.goto(`${url}#/`);
  await mostrarOCodigo(p, true);
  await p.goto(`${url}#/pauta`);
  await p.locator('.pauta-grade').waitFor();
  assert.deepEqual(await nomesComVersoes(daCarla), [`${festa} (AH)`], 'ligada de novo');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: "Mostrar o código das versões" no menu do perfil: ligada, o código no fim do nome; desligada, só o nome na Semana e na ficha; lembrada por pessoa');
}

/**
 * As versões à mão da claquete sem roteiro no PROMeiro (#154): o apelido é da claquete. "dar as versões" está escondido
 * (#156): a ficha da Pauta não edita as versões (a claquete sem versão nem mostra a linha delas). As versões guardadas à mão (pela rota, como antes) continuam no
 * fim do nome, na ficha e na Semana, com a origem "à mão" na dica; tiradas, a claquete volta sem código.
 */
async function asVersoesAMaoSemRoteiro(navegador, url) {
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } });
  await p.locator('.pauta-grade').waitFor();
  const novela = `Novela Sol ${diaMes(mais(hoje, 1))}`;
  const daAna = celula(p, 'Ana Ribeiro', hoje);
  const item = daAna.locator('.pauta-item', { has: p.locator('.pauta-texto', { hasText: novela }) });
  assert.deepEqual(await nomesComVersoes(item), [novela], 'antes: sem código no nome');
  await item.locator('.pauta-claquete-botao').click();
  const ficha = p.locator('.pauta-ficha');
  await ficha.waitFor();
  const apelido = ficha.locator('.apelido-claquete');
  // #156: sem versão, a ficha não mostra a linha das versões nem as dá; o apelido continua
  assert.equal(await apelido.locator('small', { hasText: 'versões' }).count(), 0, 'a ficha sem a seção das versões');
  assert.equal(await ficha.getByRole('button', { name: /Editar as versões|dar as versões/ }).count(), 0, '"dar as versões" escondido');
  assert.ok(await apelido.getByRole('button', { name: 'dar um apelido' }).isVisible(), 'o apelido continua na ficha');
  await p.keyboard.press('Escape');
  // as versões à mão guardadas pela rota, como antes: o sufixo no fim do nome, na ficha e na Semana, com a origem "à mão"
  const guardar = (versoes) => p.evaluate(async ([claquete, v]) => (await fetch('/api/apelidos', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claquete, versoes: v }) })).status, [novela, versoes]);
  assert.equal(await guardar('AH'), 200, 'gravou pela claquete, sem roteiro');
  await p.reload();
  await p.locator('.pauta-grade').waitFor();
  assert.deepEqual(await nomesComVersoes(item), [`${novela} (AH)`], 'a Semana: o código no fim do nome');
  assert.match((await dicas(item))[0], /feitas à mão/, 'a Semana: a dica diz à mão');
  await item.locator('.pauta-claquete-botao').click();
  await ficha.waitFor();
  await ficha.locator('#pauta-ficha-titulo .sufixo-versoes').waitFor();
  assert.equal((await ficha.locator('#pauta-ficha-titulo').textContent()).replace(/\s+/g, ' ').trim(), `${novela} (AH)`, 'a ficha: o código no fim do nome');
  assert.match(await ficha.locator('#pauta-ficha-titulo .sufixo-versoes').getAttribute('title'), /feitas à mão/, 'a dica: à mão');
  // a ficha sem "unha": nada de faixa colorida na borda esquerda do apelido
  assert.equal(await apelido.evaluate((e) => getComputedStyle(e).borderLeftWidth), '0px', 'sem unha');
  await capturar(p, 'ficha-versoes-a-mao-sem-roteiro', false);
  await p.keyboard.press('Escape');
  // tiradas: a claquete volta sem código
  assert.equal(await guardar(''), 200);
  await p.reload();
  await p.locator('.pauta-grade').waitFor();
  assert.deepEqual(await nomesComVersoes(item), [novela], 'voltou ao inicial');
  assert.deepEqual(erros, []);
  assert.deepEqual(aoTrello, [], 'nada vai ao Trello');
  await ctx.close();
  console.log('ok: a ficha da Pauta sem "dar as versões" (#156); as versões à mão da claquete sem roteiro no fim do nome, com a origem "à mão" (#154)');
}

async function principal() {
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const { comTabelas } = await import(join(RAIZ, 'servidor', 'tabelas-do-teable.mjs'));
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  // os filtros (#99): o cadastro de editores com o e-mail da Carla e a tabela designers com o da Dora (fictícios)
  const registros = {
    EDICAO_producao: PAUTA,
    ARTE_producao: ARTE,
    editores: [{ id: 'recEdCarla', fields: { editor: 'Carla Duarte', email: CARLA } }],
    KEY_editores: [],
    designers: [{ id: 'recDesDora', fields: { designer: 'Dora Lima', email: DORA, status: 'ativo' } }],
  };
  const teable = teableFalso({ EDICAO_producao: 'pauta_e2e', ARTE_producao: 'arte_e2e', editores: 'editores_e2e', KEY_editores: 'key_editores_e2e', designers: 'designers_e2e' }, { registros });
  const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
  // a produção da arte do mesmo Teable falso, para a carga das Produções (#96)
  const trello = { env: { ...PG, ...comTabelas({ ARTE_producao: 'arte_e2e' }) }, consultar: teable.consultar };
  const env = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, ...PG };
  const cadastros = criarCadastros({ ...env, TEABLE_EDITORES: 'tblFalso_bseFalso_editores', TEABLE_KEY_EDITORES: 'tblFalso_bseFalso_KEY_editores' }, { buscar: teable });
  const s = await subir({ teable, pg: teable.abrirPg, trello, cadastros, env });
  const carga = await fetch(`${s.api}/producoes/recarregar`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': CHEFE } });
  assert.equal(carga.status, 200, 'a carga das Produções');
  for (const quem of [LIA, TOM, IVO, CARLA, DORA, RUI]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': quem } });
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, tema);
    await naTelaPequena(navegador, s.url, 'iPad (gen 7)', 'tablet', 'light');
    for (const tema of ['light', 'dark']) await naTelaPequena(navegador, s.url, 'iPhone 13', 'celular', tema);
    await entradaNoCelular(navegador, s.url);
    for (const tema of ['light', 'dark']) await oDia(navegador, s.url, tema);
    for (const tema of ['light', 'dark']) await oDiaNoCelular(navegador, s.url, tema);
    for (const tema of ['light', 'dark']) await aEscolhaLembrada(navegador, s.url, tema);
    await oDiaPorColunaNoCelular(navegador, s.url);
    await osFiltros(navegador, s.url, teable);
    await oCodigoDasVersoes(navegador, s.url);
    await asVersoesAMaoSemRoteiro(navegador, s.url);
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
