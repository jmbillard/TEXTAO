// Ponta a ponta da Pauta da edição (#94; no desenho do mock-up aprovado, #162), rodado à parte do vitest:
// `npm run e2e:pauta`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o Teable falso
// (tests/fixtures/teable-falso.mjs): a tabela EDICAO_producao achada pelo nome e o Postgres dele respondendo as linhas
// da pauta, fictícias, da semana de hoje e da anterior. Nada vai ao Trello.
// - A Semana (computador, claro e escuro, pela Lia, que não é editora): sem o texto embaixo do título; um editor por
//   linha, "sem editor · sobrou" no fim; o código das versões no fim do nome; a tarefa com outro visual; o ⚑ do aviso
//   com o balão; o recado do dia, o que sobrou e quem está fora; a claquete com a produção da arte (#96); o hover da
//   agenda sem sublinhado, o lápis do apelido e o clique direito; a ficha no card aberto do centro (#160, alternativa
//   A); a busca por claquete, atração e editor, nas semanas vizinhas também; o interruptor do código; anterior,
//   próxima e Hoje. No tablet e no celular: a grade rola com os nomes fixos e abre em hoje; a ficha na tela toda.
// - A Carla (editora, com o e-mail no cadastro): o "Minha pauta" no alto com a contagem do dia (que vira quando a
//   arte chega), "você" na Semana; o Dia com a fita, a coluna dela primeiro, o que sobrou e a equipe pelo turno, com o
//   relógio do navegador às 15:30 de hoje ("no ar agora"); no celular, o Dia abre na coluna dela.
// - A visão lembrada (#98); o resumo do administrador e a cópia de reserva (#99); o código das versões (#152); as
//   versões à mão (#154).
// - O movimento: a troca de semana e de dia desliza para o lado da navegação, a ficha cresce do card e volta; com o
//   movimento reduzido, só esmaece. Com VIDEO=pasta, grava o vídeo das transições.
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
// o recado do dia (#125): o aviso sem editor
PAUTA.push(linha('Reunião geral às 10h na ilha 4', null, hoje, ['08:00', '17:00'], true));
// a mesma atração em outra praça e com versão (#96): a ficha junta as duas linhas
PAUTA.push(linha(`Show da Tarde ${diaMes(hoje)} SP (H)`, 'Ana Ribeiro', hoje, ['06:00', '15:00']));
PAUTA.push(linha(`Esporte Antigo ${diaMes(mais(anterior, 3))}`, 'Ana Ribeiro', mais(anterior, 2), ['06:00', '15:00']));

/** A produção da arte (fictícia) do Show da Tarde de hoje: a G5 entregue, com prioridade ALTA, e a de SP produzindo. */
const ARTE = [
  { id: 'recArteE2e1', fields: { card_ID: '', claquete: `Show da Tarde ${diaMes(hoje)}`, status: '["FINALIZADO"]', entregue: true, arquivado: false, designers: '["Dora Lima"]', artes: 'HOJE | AMANHÃ | hoje', prioridade: 'ALTA', praca: null, filme: null, data_entrada: sp(mais(hoje, -3), '10:00'), data_entrega: sp(mais(hoje, -1), '18:30') } },
  // a Festa da Carla de hoje, produzindo (o e2e do Dia a entrega no meio, para a contagem virar)
  { id: 'recArteE2e3', fields: { card_ID: '', claquete: `Festa da Vila(Prologo)${diaMes(mais(hoje, 2))}`, status: '["PRODUZINDO"]', entregue: false, arquivado: false, designers: '["Enzo Prado"]', artes: 'HOJE', praca: null, filme: null, data_entrada: sp(mais(hoje, -1), '10:00') } },
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

const cardDe = (l, texto) => l.locator('.pauta-item', { has: l.page().locator('.pauta-texto', { hasText: texto }) });
/** O card aberto do centro (#160, alternativa A): o painel e a camada. */
const painel = (p) => p.locator('.card-aberto');
/** Espera o card aberto voltar ao card e sair da página. */
const fechou = (p) => p.locator('.card-aberto-camada').waitFor({ state: 'detached' });
/** As animações em andamento do elemento: as propriedades que cada uma mexe. */
const animando = (l) =>
  l.evaluate((e) =>
    e.getAnimations().map((a) => {
      const ks = a.effect.getKeyframes();
      return [...new Set(ks.flatMap((k) => Object.keys(k).filter((c) => !['offset', 'easing', 'composite', 'computedOffset'].includes(c))))].sort().join(',');
    }),
  );

/** A Fora no dia (#128) da semana, pela rota: uma pessoa fictícia fora hoje (o e2e não tem a coordenação para marcar). */
async function comFora(ctx) {
  await ctx.route(/\/api\/pauta\/semana/, async (r) => {
    const res = await r.fetch();
    const j = await res.json();
    if (j.dias?.includes(hoje)) j.fora = [...(j.fora ?? []), { dia: hoje, editor: 'Elis Furtado' }];
    await r.fulfill({ response: res, json: j });
  });
}

async function noComputador(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema }, '');
  await comFora(ctx);
  assert.equal(await fundoEscuro(p), tema === 'dark');

  // a entrada no topo da fila
  await p.locator('.barra-topo .topo-pauta').click();
  await p.locator('.pauta-grade').waitFor();
  assert.equal(hash(p), '#/pauta');
  assert.equal((await p.locator('.pauta-cabeca h1').textContent()).trim(), 'Pauta da edição');
  // sem o texto embaixo do título (#162)
  assert.equal(await p.locator('.pauta-cabeca p, .pauta-sub').count(), 0, 'sem o texto embaixo do título');
  assert.equal(await p.locator('.pauta-visao [aria-checked="true"]').textContent(), 'Semana');

  // a semana de hoje, de segunda a domingo; hoje marcado à mão
  const dias = await p.locator('th.pauta-dia').evaluateAll((ths) => ths.map((t) => t.dataset.dia));
  assert.equal(dias.length, 7);
  assert.equal(dias[0], segunda);
  assert.deepEqual(await p.locator('th.pauta-dia.hoje').evaluateAll((ths) => ths.map((t) => t.dataset.dia)), [hoje]);
  assert.equal((await p.locator('th.pauta-dia.hoje .pauta-dia-rel').textContent()).trim(), 'hoje');

  // um editor por linha, na ordem do turno de costume; "sem editor · sobrou" no fim
  assert.deepEqual(await textos(p.locator('.pauta-grade .pauta-nome')), ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Duarte', 'sem editor']);
  assert.equal((await fileira(p, 'Carla Duarte').locator('.pauta-editor-meta').textContent()).trim(), '7 claquetes');
  assert.equal((await fileira(p, 'sem editor').locator('.pauta-editor-meta').textContent()).trim(), 'sobrou');
  // a Lia não é editora: nenhuma linha "você", sem "Minha pauta"
  assert.equal(await p.locator('tr.eu, .pauta-minha').count(), 0);

  // a célula: o turno e as linhas; o turno que passa da meia-noite fica no dia em que começou
  const daCarla = celula(p, 'Carla Duarte', segunda);
  assert.equal((await daCarla.locator('.pauta-turno').textContent()).trim(), '22:00–06:00');
  assert.deepEqual(await textos(daCarla.locator('.pauta-texto')), [`Festa da Vila(Prologo)${diaMes(mais(segunda, 2))}`]);

  // as versões só como o código no padrão, no fim do nome; o que ele quer dizer fica na dica; o desconhecido, cru
  assert.deepEqual(await etiquetas(daCarla), ['(AH)']);
  assert.match((await dicas(daCarla))[0], /^amanhã e hoje, da claquete /);
  const itemDo = (texto) => cardDe(celula(p, 'Bruno Teixeira', hoje), texto);
  const jogo = new Date(`${JOGO}T12:00:00Z`).getUTCDay();
  assert.deepEqual(await etiquetas(itemDo('Jogo Final')), ['(DP)']);
  assert.match((await dicas(itemDo('Jogo Final')))[0], new RegExp(`^dia ${Number(JOGO.slice(8))} e ${jogo % 6 === 0 ? 'próximo' : 'próxima'} ${SEMANA[jogo]}, `));
  assert.deepEqual(await etiquetas(itemDo('Festival')), ['(M)']);
  assert.match((await dicas(itemDo('Festival')))[0], new RegExp(`^em ${MESES[Number(FESTIVAL.slice(5, 7)) - 1]}, `));
  assert.deepEqual(await etiquetas(itemDo('Grade da Noite')), ['(MNT)']);
  assert.deepEqual(await textos(itemDo('Show Extra').locator('.sufixo-versoes.desconhecido')), ['(XYZ)']);
  assert.deepEqual(await nomesComVersoes(daCarla), [`Festa da Vila(Prologo)${diaMes(mais(segunda, 2))} (AH)`]);
  assert.equal(await p.locator('.codigo-versoes, .pauta-versoes').count(), 0);

  // a tarefa tem outro visual que a claquete; na coluna de hoje ela diz "tarefa"
  const doBruno = celula(p, 'Bruno Teixeira', hoje);
  const tarefa = doBruno.locator('.pauta-item.pauta-tarefa');
  const claquete = doBruno.locator('.pauta-item.pauta-claquete').first();
  assert.deepEqual(await textos(tarefa.locator('.pauta-texto')), ['COMUNICAÇÃO']);
  assert.equal((await tarefa.locator('.pauta-producao').textContent()).trim(), 'tarefa');
  const estilo = (l) => l.evaluate((e) => [getComputedStyle(e).fontStyle, getComputedStyle(e).fontFamily].join('|'));
  assert.notEqual(await estilo(tarefa.locator('.pauta-nome-com-versoes')), await estilo(claquete.locator('.pauta-nome-com-versoes')));
  assert.match(await estilo(tarefa.locator('.pauta-nome-com-versoes')), /^italic/);
  assert.deepEqual(await textos(celula(p, 'sem editor', hoje).locator('.pauta-item.pauta-tarefa .pauta-texto')), ['CALHAUS']);

  // a produção da arte aparece só na coluna de hoje; nos outros dias, só o nome
  assert.ok((await celula(p, 'Ana Ribeiro', hoje).locator('.pauta-producao').count()) > 0);
  assert.equal(await celula(p, 'Ana Ribeiro', segunda).locator('.pauta-producao').count(), 0);

  // o aviso não é item da pauta: só o ⚑ com o número; o texto abre ao passar o mouse
  const avisoDeHoje = celula(p, 'Carla Duarte', hoje);
  assert.equal(await p.locator('.pauta-item', { hasText: 'Redator vem acompanhar' }).count(), 0);
  assert.equal((await avisoDeHoje.locator('.pauta-aviso-botao').textContent()).replace(/\s+/g, ' ').trim(), '⚑ 1');
  assert.equal(await p.locator('.pauta-grade .pauta-aviso-botao').count(), 1);
  await avisoDeHoje.locator('.pauta-aviso-botao').hover();
  await p.locator('.pauta-aviso-balao').waitFor();
  assert.match(await p.locator('.pauta-aviso-balao').textContent(), /Redator vem acompanhar a edição/);
  await p.mouse.move(5, 5);
  await p.locator('.pauta-aviso-balao').waitFor({ state: 'detached' });

  // o recado do dia (o aviso sem editor), no alto; a mesa da produção: o que sobrou e quem está fora
  const recado = p.locator('.pauta-recado');
  assert.match(await recado.locator('.rotulo').textContent(), /Recado do dia · hoje/);
  assert.equal((await recado.locator('p').textContent()).trim(), 'Reunião geral às 10h na ilha 4');
  assert.equal(await p.locator('.pauta-mesa.so-lateral').count(), 1);
  const sobrou = p.locator('.pauta-sobrou');
  assert.match(await sobrou.locator('.rotulo').textContent(), /Sobrou · sem editor\s*1/);
  assert.deepEqual(await textos(sobrou.locator('.pauta-texto')), ['CALHAUS']);
  const fora = p.locator('.pauta-fora');
  assert.match(await fora.locator('.rotulo').textContent(), /Fora no dia\s*1/);
  assert.deepEqual(await textos(fora.locator('.pauta-fora-nome')), ['Elis Furtado']);
  assert.deepEqual(await textos(fora.locator('.pauta-etiqueta')), ['fora']);
  await capturar(p, `01-semana-${nome}`);

  // a claquete com a produção da arte (#96): a etapa, as artes, o designer, a praça e o marca-texto da prioridade ALTA
  const show = itemDo(`Show da Tarde ${diaMes(hoje)}`).first();
  assert.equal((await show.locator('.pauta-producao').textContent()).replace(/\s+/g, ' ').trim(), 'Entregue · 2 artes · Dora Lima · G5');
  assert.equal(await show.locator('.marca-texto').count(), 1);
  const novela = cardDe(celula(p, 'Ana Ribeiro', hoje), 'Novela Sol');
  assert.equal((await novela.locator('.pauta-producao').textContent()).trim(), 'sem card');
  // o hover da agenda (#162): o realce, sem sublinhado; o lápis do apelido aparece no canto
  const lapis = show.locator('.pauta-lapis');
  assert.equal(await lapis.evaluate((e) => getComputedStyle(e).opacity), '0');
  await show.hover();
  await p.waitForTimeout(250);
  assert.equal(await lapis.evaluate((e) => getComputedStyle(e).opacity), '1');
  assert.equal(await show.locator('.pauta-texto').evaluate((e) => getComputedStyle(e).textDecorationLine), 'none', 'sem sublinhado no hover');
  assert.equal(await show.locator('.pauta-claquete-botao').evaluate((e) => getComputedStyle(e).textDecorationLine), 'none');
  // nada de "unha": nenhuma borda esquerda colorida nos cards
  assert.equal(await show.evaluate((e) => getComputedStyle(e).borderLeftWidth), '0px', 'sem unha');
  await capturar(p, `02-semana-hover-${nome}`, false);

  // um clique abre a ficha no card aberto do centro: 720 px, crescendo do card
  await show.locator('.pauta-claquete-botao').click();
  const ficha = p.getByRole('dialog', { name: `Show da Tarde ${diaMes(hoje)}` });
  await ficha.waitFor();
  const largura = await painel(p).evaluate((e) => e.getBoundingClientRect().width);
  await p.waitForTimeout(400);
  assert.ok(Math.abs((await painel(p).evaluate((e) => e.getBoundingClientRect().width)) - 720) <= 1, `o painel tem 720 px (${largura})`);
  assert.match(await ficha.locator('.pauta-ficha-onde').textContent(), /Na pauta de Bruno Teixeira · 14:00–22:53/);
  const tabelas = ficha.locator('.pauta-ficha-tabela');
  // a produção de cada praça e, embaixo, as linhas da atração (versões diferentes) na pauta
  assert.deepEqual(await tabelas.nth(0).locator('tbody tr').evaluateAll((trs) => trs.map((t) => t.dataset.praca)), ['G5', 'SP']);
  assert.match(await tabelas.nth(0).locator('tr[data-praca="SP"]').textContent(), /Produzindo.*1.*Enzo Prado/);
  assert.match(await tabelas.nth(0).locator('tr[data-praca="G5"]').textContent(), /Entregue.*2.*Dora Lima/);
  assert.equal(await tabelas.nth(1).locator('tbody tr').count(), 2);
  assert.deepEqual((await textos(tabelas.nth(1).locator('tbody td:last-child'))).sort(), ['Ana Ribeiro', 'Bruno Teixeira']);
  assert.deepEqual((await textos(tabelas.nth(1).locator('tbody td.pauta-ficha-versao'))).sort(), ['(H)', '—']);
  assert.equal(await ficha.locator('.pauta-ficha-versoes').count(), 0);
  assert.match(await ficha.locator('.pauta-nenhum').textContent(), /nenhum aviso/);
  await capturar(p, `03-ficha-${nome}`, false);
  // Esc fecha: o painel volta para o card e o foco também
  await p.keyboard.press('Escape');
  await fechou(p);
  assert.equal(await p.evaluate(() => document.activeElement?.className), 'pauta-claquete-botao');

  // o clique direito: "Dar um apelido" abre a ficha com o campo do apelido aberto
  await show.click({ button: 'right' });
  const menu = p.getByRole('menu', { name: `A claquete Show da Tarde ${diaMes(hoje)}` });
  await menu.waitFor();
  await menu.getByRole('menuitem', { name: 'Dar um apelido' }).click();
  await ficha.waitFor();
  await ficha.locator('.apelido-claquete input').waitFor();
  await ficha.getByRole('button', { name: 'Fechar a ficha' }).click();
  await fechou(p);
  // o lápis faz o mesmo
  await show.hover();
  await lapis.click();
  await ficha.locator('.apelido-claquete input').waitFor();
  await p.locator('.card-aberto-veu').click({ position: { x: 20, y: 500 } });
  await fechou(p);

  // a busca: por claquete, atração e editor, na semana à vista e nas vizinhas; Esc limpa
  await p.keyboard.press('/');
  await p.keyboard.type('esporte antigo');
  const achados = p.locator('.pauta-achados');
  await achados.waitFor();
  assert.deepEqual(await textos(achados.locator('.pauta-texto')), [`Esporte Antigo ${diaMes(mais(anterior, 3))}`], 'achou na semana anterior');
  assert.deepEqual(await textos(achados.locator('.pauta-achado-editor')), ['Ana Ribeiro']);
  await p.getByRole('searchbox', { name: 'Buscar na pauta' }).fill('carla');
  await p.waitForFunction(() => document.querySelectorAll('.pauta-achados .pauta-item').length === 7);
  await p.getByRole('searchbox', { name: 'Buscar na pauta' }).fill('show tarde sp');
  await p.waitForFunction(() => document.querySelectorAll('.pauta-achados .pauta-item').length === 1);
  await capturar(p, `04-busca-${nome}`, false);
  // o achado abre a ficha, como o card
  await achados.locator('.pauta-claquete-botao').click();
  await p.getByRole('dialog', { name: `Show da Tarde ${diaMes(hoje)} SP` }).waitFor();
  await p.keyboard.press('Escape');
  await fechou(p);
  await p.getByRole('searchbox', { name: 'Buscar na pauta' }).press('Escape');
  await achados.waitFor({ state: 'detached' });

  // o interruptor do código das versões, na própria Pauta: desligado, só o nome; ligado, o código de volta
  const interruptor = p.getByRole('switch', { name: 'Mostrar o código das versões' });
  assert.equal(await interruptor.getAttribute('aria-checked'), 'true');
  await interruptor.click();
  await p.waitForFunction(() => !document.querySelector('.pauta-grade .sufixo-versoes'));
  assert.equal(await interruptor.getAttribute('aria-checked'), 'false');
  await interruptor.click();
  await daCarla.locator('.sufixo-versoes').waitFor();

  // a semana anterior e a próxima: o endereço muda e a grade também (deslizando)
  await p.getByRole('button', { name: 'Semana anterior' }).click();
  await p.locator(`th.pauta-dia[data-dia="${anterior}"]`).waitFor();
  assert.equal(hash(p), `#/pauta/semana/${anterior}`);
  assert.deepEqual(await textos(p.locator('.pauta-grade .pauta-item .pauta-texto')), [`Esporte Antigo ${diaMes(mais(anterior, 3))}`]);
  assert.equal(await p.locator('th.pauta-dia.hoje').count(), 0);
  assert.equal(await p.locator('.pauta-hoje').isEnabled(), true);
  await p.getByRole('button', { name: 'Próxima semana' }).click();
  await p.locator(`th.pauta-dia[data-dia="${segunda}"]`).waitFor();
  assert.equal(hash(p), '#/pauta');
  assert.equal(await p.locator('.pauta-hoje').isEnabled(), false, 'Hoje: já na semana de hoje');
  // a próxima semana ainda sem pauta: diz que não há nada
  await p.keyboard.press('ArrowRight');
  await p.locator('.pauta-vazia').waitFor();
  assert.equal(hash(p), `#/pauta/semana/${proxima}`);
  // "Hoje" volta para a de hoje
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
  console.log(`ok: computador ${nome}: a Semana do mock-up (sem o texto do título, o recado, sobrou e fora), o código no fim do nome, aviso no balão, o hover sem sublinhado, o lápis e o clique direito, a ficha no card aberto do centro, a busca, o interruptor do código, semana anterior, próxima e Hoje`);
}

/** No tablet e no celular: a grade rola para o lado, os nomes ficam e ela abre em hoje; o toque abre o aviso e a ficha
    ocupa a tela toda. */
async function naTelaPequena(navegador, url, aparelho, rotulo, tema) {
  const { deviceScaleFactor, ...opcoes } = devices[aparelho];
  const nome = `${rotulo}-${tema === 'dark' ? 'escuro' : 'claro'}`;
  const { ctx, p, erros } = await abrir(navegador, url, { ...opcoes, colorScheme: tema });
  await comFora(ctx);
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
  assert.ok(medida.hoje >= medida.nomes - 2 && medida.hoje < medida.largura, `${nome}: hoje à vista (${JSON.stringify(medida)})`);
  if (medida.scrollLeft < medida.maximo - 1) assert.ok(Math.abs(medida.hoje - medida.nomes) <= 2, `${nome}: hoje logo depois dos nomes`);
  await capturar(p, `05-semana-${nome}`);
  // rolando para o lado, a coluna dos nomes fica
  await p.locator('.pauta-rolagem').evaluate((r) => (r.scrollLeft = r.scrollWidth));
  const nomesDepois = await p.locator('th.pauta-editor').first().evaluate((e) => e.getBoundingClientRect().left);
  const rolagem = await p.locator('.pauta-rolagem').evaluate((e) => e.getBoundingClientRect().left);
  assert.ok(Math.abs(nomesDepois - rolagem) <= 2, `${nome}: os nomes ficam fixos`);
  await p.locator('.pauta-rolagem').evaluate((r) => (r.scrollLeft = 0));
  // o toque abre o aviso; outro toque fora fecha
  const botao = celula(p, 'Carla Duarte', hoje).locator('.pauta-aviso-botao');
  await botao.scrollIntoViewIfNeeded();
  await botao.tap();
  await p.locator('.pauta-aviso-balao').waitFor();
  assert.match(await p.locator('.pauta-aviso-balao').textContent(), /Redator vem acompanhar a edição/);
  await p.locator('.pauta-cabeca h1').tap();
  await p.locator('.pauta-aviso-balao').waitFor({ state: 'detached' });
  // o toque na claquete abre a ficha; no celular, a tela toda; o X fecha
  const show = celula(p, 'Bruno Teixeira', hoje).locator('.pauta-claquete-botao', { hasText: `Show da Tarde ${diaMes(hoje)}` }).first();
  await show.scrollIntoViewIfNeeded();
  await show.tap();
  await painel(p).waitFor();
  await p.waitForTimeout(400);
  const r = await painel(p).evaluate((e) => ({ largura: e.getBoundingClientRect().width, cabe: e.scrollWidth <= innerWidth + 1, tela: innerWidth }));
  assert.ok(r.cabe, `${nome}: a ficha cabe na tela`);
  if (rotulo === 'celular') assert.ok(Math.abs(r.largura - r.tela) <= 1, `${nome}: a ficha ocupa a tela toda (${JSON.stringify(r)})`);
  await capturar(p, `06-ficha-${nome}`, false);
  await p.getByRole('button', { name: 'Fechar a ficha' }).tap();
  await fechou(p);
  assert.deepEqual(erros, [], `${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: ${nome}: a grade rola para o lado com os nomes fixos, abre em hoje, o toque abre o aviso e a ficha${rotulo === 'celular' ? ' na tela toda' : ''}`);
}

/** Na fila do celular, a entrada da pauta é só o ícone, e cabe no topo. */
async function entradaNoCelular(navegador, url) {
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, iphone, '');
  const entrada = p.locator('.barra-topo .topo-pauta');
  await entrada.waitFor();
  assert.equal(await entrada.locator('.caminho-nome').isVisible(), false, 'no celular, só o ícone');
  await semRolagemDeLado(p, 'fila no celular');
  await entrada.tap();
  await p.locator('.pauta-grade').waitFor();
  assert.equal(hash(p), '#/pauta');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: celular: a entrada no topo da fila (o ícone) abre a pauta');
}

/* ---------- o Dia (#97) e o "Minha pauta" (#162) ---------- */
/** 15:30 de hoje em São Paulo: a Ana (06:00–15:00) já saiu, o Bruno (14:00–22:53) está no ar, a Carla entra às 22:00. */
const AS_15_30 = new Date(sp(hoje, '15:30'));
const coluna = (p, nome) => p.locator('.pauta-coluna', { has: p.locator('.pauta-coluna-topo .pauta-nome', { hasText: new RegExp(`^${nome}$`) }) });
const DIAS_POR_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const porExtenso = (iso) => `${DIAS_POR_EXTENSO[new Date(`${iso}T12:00:00Z`).getUTCDay()]}, ${Number(iso.slice(8))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;

/** A Carla (editora, com o e-mail no cadastro): o "Minha pauta" no alto, a linha "você" na Semana e, no Dia, a coluna
    dela primeiro, depois o que sobrou e a equipe. */
async function oDia(navegador, url, tema, teable, api) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema }, '#/pauta', null, CARLA, AS_15_30);
  await p.locator('.pauta-grade').waitFor();

  // a Semana da Carla: "você" na linha dela, e o "Minha pauta" de hoje no alto
  assert.equal((await p.locator('tr.eu .pauta-nome').textContent()).trim(), 'Carla Duarte');
  assert.equal((await p.locator('tr.eu .pauta-mao').textContent()).trim(), 'você');
  const minha = p.locator('.pauta-minha');
  assert.match(await minha.locator('.rotulo').textContent(), new RegExp(`Minha pauta · hoje, ${Number(hoje.slice(8))} de`));
  assert.equal((await minha.locator('h2').textContent()).trim(), 'Carla Duarte');
  assert.match(await minha.locator('.pauta-minha-meta').textContent(), /22:00–06:00/);
  assert.equal((await minha.locator('.pauta-aviso-botao').textContent()).replace(/\s+/g, ' ').trim(), '⚑ 1');
  assert.deepEqual(await textos(minha.locator('.pauta-texto')), [`Festa da Vila(Prologo)${diaMes(mais(hoje, 2))}`]);
  // a contagem do dia: as claquetes com a arte entregue, uma bolinha por claquete
  assert.equal((await minha.locator('.pauta-conta-num').textContent()).replace(/\s+/g, ' ').trim(), '0 de 1');
  assert.equal(await minha.locator('.pauta-conta-bolinhas i').count(), 1);
  assert.equal(await minha.locator('.pauta-conta-bolinhas i.sim').count(), 0);
  await capturar(p, `07-semana-minha-pauta-${nome}`);

  // um clique no dia da Semana abre aquele Dia, com endereço próprio
  await p.locator(`th.pauta-dia[data-dia="${hoje}"] a`).click();
  await p.locator('.pauta-colunas').waitFor();
  assert.equal(hash(p), `#/pauta/dia/${hoje}`);
  assert.equal((await p.locator('.pauta-cabeca h1').textContent()).trim(), 'Pauta da edição');
  assert.equal((await p.locator('.pauta-periodo').textContent()).trim(), porExtenso(hoje));
  assert.equal(await p.locator('.pauta-visao [aria-checked="true"]').textContent(), 'Dia');
  // a fita dos dias: a semana, o de hoje aberto
  assert.deepEqual(await p.locator('.pauta-fita button').evaluateAll((bs) => bs.map((b) => b.dataset.dia)), Array.from({ length: 7 }, (_, i) => mais(segunda, i)));
  assert.equal(await p.locator('.pauta-fita [aria-current="true"]').getAttribute('data-dia'), hoje);
  assert.equal(await p.locator('.pauta-fita .hoje').getAttribute('data-dia'), hoje);

  // a coluna da Carla primeiro, depois o que sobrou, depois a equipe pela hora de entrada
  assert.deepEqual(await textos(p.locator('.pauta-coluna-topo .pauta-nome')), ['Carla Duarte', 'Sobrou · sem editor', 'Ana Ribeiro', 'Bruno Teixeira']);
  assert.equal(await coluna(p, 'Carla Duarte').evaluate((c) => c.classList.contains('eu')), true);
  assert.equal((await coluna(p, 'Carla Duarte').locator('.pauta-mao').textContent()).trim(), 'você');
  assert.deepEqual(await textos(p.locator('.pauta-coluna-topo .pauta-turno')), ['22:00–06:00', 'quem puder', '06:00–15:00', '14:00–22:53']);
  // no ar agora: só o Bruno
  assert.deepEqual(await textos(p.locator('.pauta-coluna.no-ar .pauta-nome')), ['Bruno Teixeira']);
  // as colunas lado a lado, com a largura de uma coluna (nada de espremer)
  const larguras = await p.locator('.pauta-coluna').evaluateAll((cs) => cs.map((c) => Math.round(c.getBoundingClientRect().width)));
  assert.ok(larguras.every((l) => l >= 220), `as colunas do Dia têm largura (${larguras})`);
  const larguraDaMesa = await p.locator('.pauta-minha').evaluate((e) => e.getBoundingClientRect().width);
  assert.ok(larguraDaMesa > 600, `o "Minha pauta" ocupa a mesa (${larguraDaMesa})`);
  assert.equal((await coluna(p, 'Bruno Teixeira').locator('.pauta-no-ar').textContent()).trim(), 'no ar agora');
  // a contagem de cada coluna
  assert.equal((await coluna(p, 'Ana Ribeiro').locator('.pauta-conta-num').textContent()).replace(/\s+/g, ' ').trim(), '0 de 2');
  // o aviso da Carla no ⚑ da coluna
  assert.equal(await coluna(p, 'Carla Duarte').locator('.pauta-aviso-botao').count(), 1);
  // as claquetes e as tarefas em cards; o aviso não é card
  const doBruno = coluna(p, 'Bruno Teixeira');
  assert.deepEqual(await textos(doBruno.locator('.pauta-tarefa .pauta-texto')), ['COMUNICAÇÃO']);
  const show = doBruno.locator('.pauta-claquete', { has: p.locator('.pauta-texto', { hasText: new RegExp(`^Show da Tarde ${diaMes(hoje)}$`) }) });
  assert.equal((await show.locator('.pauta-producao').textContent()).replace(/\s+/g, ' ').trim(), 'Entregue · 2 artes · Dora Lima · G5');
  assert.equal(await p.locator('.pauta-colunas .pauta-item', { hasText: 'Redator vem acompanhar' }).count(), 0);
  await capturar(p, `08-dia-${nome}`);

  // a ficha abre por cima do Dia: na pauta de quem
  await show.locator('.pauta-claquete-botao').click();
  const ficha = p.getByRole('dialog', { name: `Show da Tarde ${diaMes(hoje)}` });
  await ficha.waitFor();
  await p.keyboard.press('Escape');
  await fechou(p);
  const festa = cardDe(coluna(p, 'Carla Duarte'), 'Festa da Vila');
  await festa.locator('.pauta-claquete-botao').click();
  await p.locator('.pauta-ficha-onde', { hasText: 'Na sua pauta' }).waitFor();
  assert.match(await p.locator('.pauta-ficha-avisos').textContent(), /para a posição.*Redator vem acompanhar a edição/);
  await p.keyboard.press('Escape');
  await fechou(p);

  // a arte da Festa chega (a carga das Produções e a releitura de cada minuto): a contagem vira para 1 de 1
  const arte = ARTE.find((a) => a.id === 'recArteE2e3');
  arte.fields.status = '["FINALIZADO"]';
  arte.fields.entregue = true;
  arte.fields.data_entrega = sp(hoje, '15:00');
  assert.equal((await fetch(`${api}/producoes/recarregar`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': CHEFE } })).status, 200);
  await p.clock.runFor(61_000);
  await p.waitForFunction(() => document.querySelector('.pauta-minha .pauta-conta-num')?.textContent.replace(/\s+/g, ' ').trim() === '1 de 1');
  assert.equal(await p.locator('.pauta-minha .pauta-conta-bolinhas i.sim').count(), 1);
  assert.ok((await animando(p.locator('.pauta-minha .pauta-conta-vira'))).length >= 0);
  // volta a produzir, para os outros testes
  arte.fields.status = '["PRODUZINDO"]';
  arte.fields.entregue = false;
  delete arte.fields.data_entrega;
  await fetch(`${api}/producoes/recarregar`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': CHEFE } });

  // o próximo e o anterior, pelos botões, pelas setas e pela fita
  await p.getByRole('button', { name: 'Próximo dia' }).click();
  await p.locator('.pauta-periodo', { hasText: porExtenso(mais(hoje, 1)) }).waitFor();
  assert.equal(hash(p), `#/pauta/dia/${mais(hoje, 1)}`);
  await p.getByRole('button', { name: 'Dia anterior' }).click();
  await p.getByRole('button', { name: 'Dia anterior' }).click();
  await p.locator('.pauta-periodo', { hasText: porExtenso(mais(hoje, -1)) }).waitFor();
  assert.equal(hash(p), `#/pauta/dia/${mais(hoje, -1)}`);
  await p.keyboard.press('ArrowRight');
  await p.locator('.pauta-periodo', { hasText: porExtenso(hoje) }).waitFor();
  await p.locator(`.pauta-fita button[data-dia="${segunda}"]`).click();
  await p.locator('.pauta-periodo', { hasText: porExtenso(segunda) }).waitFor();
  assert.equal(hash(p), `#/pauta/dia/${segunda}`);
  await p.locator('.pauta-hoje').click();
  await p.locator('.pauta-periodo', { hasText: porExtenso(hoje) }).waitFor();

  // o endereço do Dia aberto direto (e recarregado); o dia sem pauta diz que não há nada
  await p.goto(`${url}#/pauta/dia/${mais(proxima, 2)}`);
  await p.locator('.pauta-vazia').waitFor();
  await p.goto(`${url}#/pauta/dia/${mais(segunda, 1)}`);
  await p.reload();
  await p.locator('.pauta-periodo', { hasText: porExtenso(mais(segunda, 1)) }).waitFor();
  await p.locator('.pauta-colunas').waitFor();
  // a volta à Semana: a semana do dia
  await p.getByRole('radio', { name: 'Semana', exact: true }).click();
  await p.locator('.pauta-grade').waitFor();
  assert.equal(hash(p), '#/pauta');
  // e da Semana ao Dia pela troca da visão: hoje
  await p.getByRole('radio', { name: 'Dia', exact: true }).click();
  await p.locator('.pauta-periodo', { hasText: porExtenso(hoje) }).waitFor();
  assert.equal(hash(p), '#/pauta/dia');
  await semRolagemDeLado(p, `dia ${nome}`);
  assert.deepEqual(erros, [], `dia ${nome}: erros na página`);
  assert.deepEqual(aoTrello, [], 'nada vai ao Trello');
  await ctx.close();
  console.log(`ok: computador ${nome}: o "Minha pauta" da Carla com a contagem (que vira quando a arte chega), "você" na Semana; Semana → Dia: a fita, a coluna dela primeiro, o que sobrou, a equipe pelo turno, no ar agora, a ficha, anterior e próximo, volta à Semana`);
}

/** No celular, o Dia da Carla abre na coluna dela, e as colunas rolam para o lado. */
async function oDiaNoCelular(navegador, url, tema) {
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const nome = `celular-${tema === 'dark' ? 'escuro' : 'claro'}`;
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema }, '#/pauta/dia', AS_15_30, CARLA);
  await p.locator('.pauta-colunas').waitFor();
  assert.equal((await p.locator('.pauta-periodo').textContent()).trim(), porExtenso(hoje));
  await semRolagemDeLado(p, `dia ${nome}`);
  const m = await p.evaluate(() => {
    const f = document.querySelector('.pauta-faixa');
    const eu = document.querySelector('.pauta-coluna.eu').getBoundingClientRect();
    return { rola: f.scrollWidth > f.clientWidth, eu: eu.left, direita: eu.right, largura: innerWidth };
  });
  assert.ok(m.rola, `${nome}: as colunas rolam para o lado`);
  assert.ok(m.eu >= 0 && m.direita <= m.largura + 1, `${nome}: abre na coluna da Carla (${JSON.stringify(m)})`);
  await capturar(p, `09-dia-${nome}`);
  // a ficha no celular: a tela toda
  await cardDe(p.locator('.pauta-coluna.eu'), 'Festa da Vila').locator('.pauta-claquete-botao').tap();
  await painel(p).waitFor();
  await p.waitForTimeout(400);
  await capturar(p, `10-ficha-dia-${nome}`, false);
  await p.getByRole('button', { name: 'Fechar a ficha' }).tap();
  await fechou(p);
  assert.deepEqual(erros, [], `dia ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: ${nome}: o Dia da Carla abre na coluna dela, as colunas rolam para o lado, a ficha na tela toda`);
}

/** Espera o servidor guardar a escolha (o PUT das preferências). */
const guardou = (p) => p.waitForResponse((r) => r.url().endsWith('/api/eu/preferencias') && r.request().method() === 'PUT' && r.ok());

/** A visão escolhida fica lembrada (#98): a entrada no topo abre a última, depois de recarregar e em outro navegador. */
async function aEscolhaLembrada(navegador, url) {
  const tela = { viewport: { width: 1440, height: 1000 } };
  let { ctx, p, erros } = await abrir(navegador, url, tela, '', AS_15_30, TOM);
  await p.locator('.barra-topo .topo-pauta').click();
  await p.locator('.pauta-grade').waitFor();
  assert.equal(hash(p), '#/pauta');
  const salvo = guardou(p);
  await p.getByRole('radio', { name: 'Dia', exact: true }).click();
  await salvo;
  await p.locator('.pauta-colunas').waitFor();
  await ctx.close();
  ({ ctx, p, erros } = await abrir(navegador, url, tela, '', AS_15_30, TOM));
  await p.locator('.barra-topo .topo-pauta').click();
  await p.locator('.pauta-colunas').waitFor();
  assert.equal(hash(p), '#/pauta/dia');
  const deVolta = guardou(p);
  await p.getByRole('radio', { name: 'Semana', exact: true }).click();
  await deVolta;
  await p.goto(`${url}#/`);
  await p.locator('.barra-topo .topo-pauta').click();
  await p.locator('.pauta-grade').waitFor();
  assert.equal(hash(p), '#/pauta');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: a visão da pauta lembrada por pessoa: a entrada no topo abre a última, em outro navegador também');
}

/** O resumo do administrador e a cópia de reserva (#99); a releitura a cada minuto; a Dora (designer) sem filtro. */
async function oResumoEACopia(navegador, url, teable) {
  const tela = { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' };
  // a Carla: sem resumo; a releitura a cada minuto relê a pauta
  let { ctx, p, erros } = await abrir(navegador, url, tela, '#/pauta', null, CARLA, AS_15_30);
  await p.locator('.pauta-grade').waitFor();
  assert.equal(await p.locator('.pauta-resumo').count(), 0);
  // o filtro "Só as minhas" saiu (#162): o "Minha pauta" está no alto
  assert.equal(await p.getByRole('radiogroup', { name: 'Filtro da pauta' }).count(), 0);
  const releu = p.waitForResponse((r) => /\/api\/pauta\/semana/.test(r.url()) && r.ok());
  await p.clock.runFor(61_000);
  await releu;
  assert.deepEqual(await textos(p.locator('.pauta-grade .pauta-nome')), ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Duarte', 'sem editor']);
  assert.deepEqual(erros, []);
  await ctx.close();

  // a Dora, designer: sem "Com arte minha" (#156), no computador e no celular
  for (const [onde, opcoes] of [['computador', tela], ['celular', devices['iPhone 13']]]) {
    ({ ctx, p, erros } = await abrir(navegador, url, { ...opcoes, colorScheme: 'light' }, '#/pauta', null, DORA));
    await p.locator('.pagina.pauta .pauta-texto').first().waitFor();
    assert.equal(await p.getByText('Com arte minha').count(), 0, `nada de "Com arte minha" (${onde})`);
    assert.deepEqual(erros, [], 'a Dora: erros na página');
    await ctx.close();
  }

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
    assert.deepEqual(await textos(p.locator('.pauta-grade .pauta-nome')), ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Duarte', 'sem editor']);
    await capturar(p, '11-semana-copia-e-resumo-escuro');
  } finally {
    teable.estado.fora = false;
  }
  assert.deepEqual(erros, [], 'resumo e cópia: erros na página');
  await ctx.close();
  console.log('ok: sem o filtro (o "Minha pauta" no alto), a releitura, o resumo do administrador e a cópia de reserva');
}

/**
 * "Mostrar o código das versões" (#152), do Rui (a escolha é de cada um): começa ligada; desligada no menu do perfil, a
 * Pauta (Semana e ficha) mostra só o nome; a escolha fica lembrada depois de recarregar e em outro navegador, e a da Lia
 * continua ligada.
 */
async function oCodigoDasVersoes(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, '', null, RUI);
  await p.locator('.perfil-botao').waitFor();
  await p.locator('.barra-topo .topo-pauta').click();
  await p.locator('.pauta-grade').waitFor();
  const daCarla = celula(p, 'Carla Duarte', segunda);
  const festa = `Festa da Vila(Prologo)${diaMes(mais(segunda, 2))}`;
  assert.deepEqual(await nomesComVersoes(daCarla), [`${festa} (AH)`], 'ligada: o código no fim do nome');
  // desligada no menu do perfil: só o nome, em todo lugar da Pauta (e o interruptor da Pauta concorda)
  await p.goto(`${url}#/`);
  await mostrarOCodigo(p, false);
  await p.goto(`${url}#/pauta`);
  await p.locator('.pauta-grade').waitFor();
  assert.deepEqual(await nomesComVersoes(daCarla), [festa], 'desligada: só o nome');
  assert.equal(await p.getByRole('switch', { name: 'Mostrar o código das versões' }).getAttribute('aria-checked'), 'false');
  assert.equal(await p.locator('.sufixo-versoes, .codigo-versoes, .pauta-versoes').count(), 0, 'desligada: nenhum código na Semana');
  // a ficha: o nome sem o código e a tabela sem a coluna da versão
  await celula(p, 'Bruno Teixeira', hoje).locator('.pauta-claquete-botao').first().click();
  const ficha = p.locator('.pauta-ficha');
  await ficha.waitFor();
  assert.equal(await ficha.locator('.sufixo-versoes, .pauta-ficha-versao').count(), 0, 'desligada: a ficha sem código');
  await p.keyboard.press('Escape');
  await fechou(p);
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
  // ligada de novo pelo interruptor da própria Pauta: o código volta, e o menu do perfil concorda
  await p.getByRole('switch', { name: 'Mostrar o código das versões' }).click();
  await daCarla.locator('.sufixo-versoes').waitFor();
  await p.waitForLoadState('networkidle');
  await p.reload();
  await p.locator('.pauta-grade').waitFor();
  assert.deepEqual(await nomesComVersoes(daCarla), [`${festa} (AH)`], 'ligada de novo');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: "Mostrar o código das versões": o menu do perfil e o interruptor da Pauta; desligada, só o nome na Semana e na ficha; lembrada por pessoa');
}

/**
 * As versões à mão da claquete sem roteiro no PROMeiro (#154): o apelido é da claquete. "dar as versões" está escondido
 * (#156). As versões guardadas à mão (pela rota) continuam no fim do nome, na ficha e na Semana, com a origem "à mão" na
 * dica; tiradas, a claquete volta sem código. O apelido se dá pelo lápis (#156, #162).
 */
async function asVersoesAMaoSemRoteiro(navegador, url) {
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } });
  await p.locator('.pauta-grade').waitFor();
  const novela = `Novela Sol ${diaMes(mais(hoje, 1))}`;
  const item = cardDe(celula(p, 'Ana Ribeiro', hoje), novela);
  assert.deepEqual(await nomesComVersoes(item), [novela], 'antes: sem código no nome');
  await item.locator('.pauta-claquete-botao').click();
  const ficha = p.locator('.pauta-ficha');
  await ficha.waitFor();
  assert.equal(await ficha.getByRole('button', { name: /Editar as versões|dar as versões/ }).count(), 0, '"dar as versões" escondido');
  // o apelido pelo lápis ao lado do nome
  await ficha.getByRole('button', { name: 'Dar um apelido' }).click();
  await ficha.locator('.apelido-claquete input').waitFor();
  await ficha.getByRole('button', { name: 'Fechar a ficha' }).click();
  await fechou(p);
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
  await capturar(p, 'ficha-versoes-a-mao-sem-roteiro', false);
  await p.keyboard.press('Escape');
  await fechou(p);
  assert.equal(await guardar(''), 200);
  await p.reload();
  await p.locator('.pauta-grade').waitFor();
  assert.deepEqual(await nomesComVersoes(item), [novela], 'voltou ao inicial');
  assert.deepEqual(erros, []);
  assert.deepEqual(aoTrello, [], 'nada vai ao Trello');
  await ctx.close();
  console.log('ok: a ficha da Pauta sem "dar as versões" (#156); o apelido pelo lápis; as versões à mão no fim do nome, com a origem "à mão" (#154)');
}

/**
 * O movimento (#162): a troca de semana e de dia desliza para o lado da navegação; a ficha cresce do card e volta para
 * ele; com o movimento reduzido, só esmaece. Com VIDEO=pasta, grava o vídeo das transições (a Carla, no computador).
 */
async function oMovimento(navegador, url) {
  const VIDEO = process.env.VIDEO || '';
  const tela = { viewport: { width: 1440, height: 900 }, ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1440, height: 900 } } } : {}) };
  const { ctx, p, erros } = await abrir(navegador, url, tela, '#/pauta', null, CARLA);
  await p.locator('.pauta-grade').waitFor();
  const devagar = (ms) => (VIDEO ? p.waitForTimeout(ms) : Promise.resolve());
  await devagar(900);
  // o hover de alguns cards
  for (const dia of [hoje, segunda]) {
    await cardDe(celula(p, 'Carla Duarte', dia), 'Festa da Vila').hover();
    await devagar(450);
  }
  // a semana seguinte: o que sai anda para a esquerda (a navegação vai para a frente)
  await p.getByRole('button', { name: 'Próxima semana' }).click();
  await p.waitForFunction(() => [...document.querySelectorAll('.desliza')].some((e) => e.getAnimations().some((a) => JSON.stringify(a.effect.getKeyframes()).includes('translateX(-'))));
  await p.locator('.pauta-vazia').waitFor();
  await devagar(700);
  await p.getByRole('button', { name: 'Semana anterior' }).click();
  await p.waitForFunction(() => [...document.querySelectorAll('.desliza')].some((e) => e.getAnimations().some((a) => JSON.stringify(a.effect.getKeyframes()).includes('translateX('))));
  await p.locator(`th.pauta-dia[data-dia="${segunda}"]`).waitFor();
  await devagar(700);
  await p.getByRole('button', { name: 'Semana anterior' }).click();
  await p.locator(`th.pauta-dia[data-dia="${anterior}"]`).waitFor();
  await devagar(700);
  await p.locator('.pauta-hoje').click();
  await p.locator(`th.pauta-dia[data-dia="${segunda}"]`).waitFor();
  await devagar(800);
  // a ficha cresce do card (a escala do card até 1) e volta para ele
  const show = cardDe(celula(p, 'Bruno Teixeira', hoje), `Show da Tarde ${diaMes(hoje)}`).first();
  await show.locator('.pauta-claquete-botao').click();
  await painel(p).waitFor();
  assert.ok((await animando(painel(p))).some((k) => k.includes('transform')), 'a ficha cresce do card');
  await devagar(1200);
  await p.keyboard.press('Escape');
  await fechou(p);
  await devagar(700);
  // o Dia: as colunas em cascata; o próximo dia desliza
  await p.getByRole('radio', { name: 'Dia', exact: true }).click();
  await p.locator('.pauta-colunas').waitFor();
  await devagar(900);
  await p.getByRole('button', { name: 'Próximo dia' }).click();
  await p.locator('.pauta-periodo', { hasText: porExtenso(mais(hoje, 1)) }).waitFor();
  await devagar(700);
  await p.getByRole('button', { name: 'Dia anterior' }).click();
  await p.locator('.pauta-periodo', { hasText: porExtenso(hoje) }).waitFor();
  await devagar(700);
  // a busca: os achados aparecem e somem recolhendo
  await p.keyboard.press('/');
  await p.keyboard.type('festa', { delay: VIDEO ? 90 : 0 });
  await p.locator('.pauta-achados').waitFor();
  await devagar(1200);
  await p.getByRole('searchbox', { name: 'Buscar na pauta' }).press('Escape');
  await p.locator('.pauta-achados.saindo').waitFor();
  await p.locator('.pauta-achados').waitFor({ state: 'detached' });
  await devagar(600);
  // o interruptor do código
  await p.getByRole('switch', { name: 'Mostrar o código das versões' }).click();
  await devagar(600);
  await p.getByRole('switch', { name: 'Mostrar o código das versões' }).click();
  await devagar(600);
  await p.getByRole('radio', { name: 'Semana', exact: true }).click();
  await p.locator('.pauta-grade').waitFor();
  await devagar(900);
  assert.deepEqual(erros, []);
  await ctx.close();

  // o movimento reduzido: a ficha e a troca só esmaecem (só a opacidade anima)
  const reduzido = await abrir(navegador, url, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, '#/pauta', null, CARLA);
  const q = reduzido.p;
  await q.locator('.pauta-grade').waitFor();
  await cardDe(celula(q, 'Bruno Teixeira', hoje), `Show da Tarde ${diaMes(hoje)}`).first().locator('.pauta-claquete-botao').click();
  await painel(q).waitFor();
  const naFicha = await animando(painel(q));
  assert.ok(naFicha.length && naFicha.every((k) => k === 'opacity'), `reduzido: a ficha só esmaece (${naFicha})`);
  await q.keyboard.press('Escape');
  await fechou(q);
  await q.getByRole('button', { name: 'Próxima semana' }).click();
  await q.waitForFunction(() => [...document.querySelectorAll('.desliza')].some((e) => e.getAnimations().length));
  const naTroca = await q.locator('.desliza').first().evaluate((e) => e.getAnimations().map((a) => JSON.stringify(a.effect.getKeyframes())));
  assert.ok(naTroca.every((k) => !k.includes('translate')), `reduzido: a troca só esmaece (${naTroca})`);
  assert.deepEqual(reduzido.erros, []);
  await reduzido.ctx.close();
  console.log(`ok: o movimento: a troca de semana e de dia desliza para o lado da navegação, a ficha cresce do card e volta; reduzido, só esmaece${VIDEO ? ` (vídeo em ${VIDEO})` : ''}`);
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
  for (const quem of [LIA, TOM, CARLA, DORA, RUI]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': quem } });
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, tema);
    await naTelaPequena(navegador, s.url, 'iPad (gen 7)', 'tablet', 'light');
    for (const tema of ['light', 'dark']) await naTelaPequena(navegador, s.url, 'iPhone 13', 'celular', tema);
    await entradaNoCelular(navegador, s.url);
    for (const tema of ['light', 'dark']) await oDia(navegador, s.url, tema, teable, s.api);
    for (const tema of ['light', 'dark']) await oDiaNoCelular(navegador, s.url, tema);
    await aEscolhaLembrada(navegador, s.url);
    await oResumoEACopia(navegador, s.url, teable);
    await oCodigoDasVersoes(navegador, s.url);
    await asVersoesAMaoSemRoteiro(navegador, s.url);
    await oMovimento(navegador, s.url);
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
