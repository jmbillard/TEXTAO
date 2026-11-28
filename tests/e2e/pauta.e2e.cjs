// Ponta a ponta da Pauta da edição (#94; no desenho do mock-up aprovado, #162), rodado à parte do vitest:
// `npm run e2e:pauta`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o Teable falso
// (tests/fixtures/teable-falso.mjs): a tabela EDICAO_producao achada pelo nome e o Postgres dele respondendo as linhas
// da pauta, fictícias, da semana de hoje e da anterior. Só aparecem as claquetes que casam com uma Produção (#199): as
// Produções vão direto no SQLite, menos as de algumas claquetes, que ficam de fora com as tarefas. Nada vai ao Trello.
// - A Semana (computador, claro e escuro, pela Lia, que não é editora): sem o texto embaixo do título; um editor por
//   linha ("sem editor · sobrou" no fim, só para a coordenação e os editores, #172); o código das versões no fim do nome; a tarefa e a claquete sem Produção de fora (#199); o ⚑ do aviso
//   com o balão; o recado do dia e quem está fora (o que sobrou, só a coordenação e os editores, #172); a claquete com a produção da arte (#96); o hover da
//   agenda sem sublinhado, o lápis do apelido e o clique direito; a ficha no card aberto do centro (#160, alternativa
//   A); a busca por claquete, atração e editor, nas semanas vizinhas também; o interruptor do código; anterior,
//   próxima e Hoje. No tablet e no celular: a grade rola com os nomes fixos e abre em hoje; a ficha na tela toda.
// - A Carla (editora, com o e-mail no cadastro): o "Minha pauta" no alto com a contagem do dia (que vira quando a
//   arte chega), "você" na Semana; o Dia com a fita, a coluna dela primeiro, o que sobrou e a equipe pelo turno, com o
//   relógio do navegador às 15:30 de hoje ("no ar agora"); no celular, o Dia abre na coluna dela.
// - A visão lembrada (#98); o resumo do administrador e a cópia de reserva (#99); o código das versões (#152); as
//   versões à mão (#154).
// - Os contadores da agenda (#170): o seletor de datas, o cabeçalho da grade, a fita e o resumo contam juntos.
// - A etiqueta da campanha (#181): na Semana, no Dia e na ficha, e o clique que leva à página da campanha.
// - O movimento: a troca de semana e de dia desliza para o lado da navegação, a ficha cresce do card e volta; com o
//   movimento reduzido, só esmaece. Com VIDEO=pasta, grava o vídeo das transições.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:pauta
// Com CAPTURAS=pasta, grava as capturas de cada tela (densidade 2).
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');
const { checksVerdes, lugarDaLupa } = require('./coerencia.cjs');
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
// a coordenação (#123), marcada no e2e por um administrador: vê o que sobrou (#172)
const COORD = 'cora.nunes@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

/* ---------- as datas, sempre em São Paulo ---------- */
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const mais = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const segunda = mais(hoje, -((new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7));
const anterior = mais(segunda, -7);
const proxima = mais(segunda, 7);
const diasDe = (seg) => Array.from({ length: 7 }, (_, i) => mais(seg, i));
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
// só as claquetes que casam com uma Produção (#199): a que sobrou sem editor tem Produção; o Filme Sem Card, não (fica de
// fora, como a COMUNICAÇÃO e a CALHAUS, que são tarefas)
const SOBROU = `Sessão Extra ${diaMes(hoje)}`;
const SEM_CARD = `Filme Sem Card ${diaMes(hoje)}`;
PAUTA.push(linha(SOBROU, null, hoje, ['08:00', '17:00']));
PAUTA.push(linha(SEM_CARD, 'Bruno Teixeira', hoje, ['14:00', '22:53']));
// mais claquetes sem Produção, fora da tela, para o resumo do administrador contar (#170): cinco nesta semana, uma na
// anterior
const SEM_CARD_TAMBEM = [];
for (let i = 0; i < 5; i++) SEM_CARD_TAMBEM.push(linha(`Reprise Sem Card ${i + 1} ${diaMes(mais(segunda, i))}`, 'Bruno Teixeira', mais(segunda, i), ['14:00', '22:53']));
SEM_CARD_TAMBEM.push(linha(`Arquivo Sem Card ${diaMes(mais(anterior, 1))}`, 'Ana Ribeiro', mais(anterior, 1), ['06:00', '15:00']));
PAUTA.push(...SEM_CARD_TAMBEM);

/* A semana daqui a duas, na forma da pauta real que quebrou a Semana no Safari (#172), com nomes inventados: só de
   segunda a sexta (o fim de semana sem ninguém), muitos editores na manhã, o nome em caixa alta com "(sem ID)*" como
   vem do Teable, as tarefas, as instruções e o aviso com a caixinha. */
const DEPOIS = mais(segunda, 14);
const DA_FORMA_REAL = ['Rita Fontes', 'Otto Lemos', 'Vera Campos', 'Igor Matos', 'PEDRO SALES (sem ID)*', 'Nina Prado'];
for (let i = 0; i < 5; i++) {
  const d = mais(DEPOIS, i);
  DA_FORMA_REAL.forEach((editor, j) => {
    const turno = j < 4 ? ['06:00', '15:00'] : j === 4 ? ['14:00', '20:00'] : ['22:00', '06:00'];
    // a info sem claquete antes fica na posição (#172)
    if (j === 3) PAUTA.push(linha('REDATOR VAI ACOMPANHAR', editor, d, turno));
    PAUTA.push(linha(`Atração ${j + 1}(Prologo)${diaMes(mais(d, 1))} (AH)`, editor, d, turno));
    // a tarefa (#199): no Teable, fora da Pauta
    if (j === 4) PAUTA.push(linha('COMUNICAÇÃO', editor, d, turno));
    if (j === 1) PAUTA.push(linha('TRANSFORMAR DA A B', editor, d, turno));
    if (j === 2) PAUTA.push(linha('VEM PRONTA', editor, d, turno, true));
  });
}

/* Os caminhos da arte (#202): os cards (inventados) das duas Produções do Show da Tarde e o registro do projeto do Padeiro
   de cada um (a tabela projetos, #144): a G5 criada no Windows (com a pasta de saída) e aberta depois no Mac (o .aep
   mais novo); a SP criada no Mac, com o volume montado de novo. Servidor, volumes e pastas inventados. */
const CARD_G5 = 'cafe00000000000000e2e0g5';
const CARD_SP = 'cafe00000000000000e2e0sp';
const PASTA_DO_SHOW = 'SHOWS/SHOW DA TARDE/2026';
const PROJETOS = [
  { id: 'recPjE2e1', fields: { card_ID: CARD_G5, aep: `\\\\servidor-ficticio\\ARTE\\${PASTA_DO_SHOW.replace(/\//g, '\\')}\\01_PROJETOS\\SHOW DA TARDE CHAMADA.aep`, output: '\\\\servidor-ficticio\\SAIDA\\SHOWS\\SHOW DA TARDE', atracao: 'SHOW DA TARDE', momento: 'criado', data: sp(mais(hoje, -3), '11:00') } },
  { id: 'recPjE2e2', fields: { card_ID: CARD_G5, aep: `/Volumes/ARTE/${PASTA_DO_SHOW}/01_PROJETOS/SHOW DA TARDE CHAMADA V2.aep`, atracao: 'SHOW DA TARDE', momento: 'aberto', data: sp(mais(hoje, -2), '09:30') } },
  { id: 'recPjE2e3', fields: { card_ID: CARD_SP, aep: `/Volumes/ARTE-2/${PASTA_DO_SHOW}/SP/01_PROJETOS/SHOW DA TARDE SP.aep`, output: '/Volumes/SAIDA/SHOWS/SHOW DA TARDE/SP', atracao: 'SHOW DA TARDE', momento: 'criado', data: sp(mais(hoje, -2), '10:00') } },
];
const SAIDA_G5 = { win: '\\\\servidor-ficticio\\SAIDA\\SHOWS\\SHOW DA TARDE', mac: '/Volumes/SAIDA/SHOWS/SHOW DA TARDE' };
const PROJETO_G5 = { win: `\\\\servidor-ficticio\\ARTE\\SHOWS\\SHOW DA TARDE\\2026\\01_PROJETOS\\SHOW DA TARDE CHAMADA V2.aep`, mac: `/Volumes/ARTE/${PASTA_DO_SHOW}/01_PROJETOS/SHOW DA TARDE CHAMADA V2.aep` };

/** A produção da arte (fictícia) do Show da Tarde de hoje: a G5 entregue, com prioridade ALTA, e a de SP produzindo. */
const ARTE = [
  { id: 'recArteE2e1', fields: { card_ID: CARD_G5, claquete: `Show da Tarde ${diaMes(hoje)}`, status: '["FINALIZADO"]', entregue: true, arquivado: false, designers: '["Dora Lima"]', artes: 'HOJE | AMANHÃ | hoje', prioridade: 'ALTA', praca: null, filme: null, data_entrada: sp(mais(hoje, -3), '10:00'), data_entrega: sp(mais(hoje, -1), '18:30') } },
  // a Festa da Carla de hoje, produzindo (o e2e do Dia a entrega no meio, para a contagem virar)
  { id: 'recArteE2e3', fields: { card_ID: '', claquete: `Festa da Vila(Prologo)${diaMes(mais(hoje, 2))}`, status: '["PRODUZINDO"]', entregue: false, arquivado: false, designers: '["Enzo Prado"]', artes: 'HOJE', praca: null, filme: null, data_entrada: sp(mais(hoje, -1), '10:00') } },
  { id: 'recArteE2e2', fields: { card_ID: CARD_SP, claquete: `Show da Tarde ${diaMes(hoje)} SP`, status: '["PRODUZINDO"]', entregue: false, arquivado: false, designers: '["Enzo Prado"]', artes: 'HOJE', praca: null, filme: null, data_entrada: sp(mais(hoje, -2), '10:00') } },
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

  // um editor por linha, na ordem do turno de costume
  assert.deepEqual(await textos(p.locator('.pauta-grade .pauta-nome')), ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Duarte']);
  assert.equal((await fileira(p, 'Carla Duarte').locator('.pauta-editor-meta').textContent()).trim(), '7 claquetes');
  // sem "sem editor · sobrou": a Lia não é da coordenação nem editora (#172; oSobrouPorPerfil)
  assert.equal(await p.locator('.pauta-grade tr.sem-editor').count(), 0);
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

  // só as claquetes que casam com uma Produção (#199): a tarefa (COMUNICAÇÃO, CALHAUS) e a claquete sem Produção (o Filme
  // Sem Card) ficam no Teable, fora da Pauta
  const doBruno = celula(p, 'Bruno Teixeira', hoje);
  assert.equal(await p.locator('.pauta-item.pauta-tarefa').count(), 0, 'nenhuma tarefa na Semana');
  assert.equal(await p.locator('.pauta-item', { hasText: /COMUNICAÇÃO|CALHAUS|Filme Sem Card/ }).count(), 0, 'nem a claquete sem Produção');
  assert.ok((await doBruno.locator('.pauta-item.pauta-claquete').count()) > 0);


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

  // o recado do dia (o aviso sem editor), no alto; a mesa da produção: quem está fora (o que sobrou, a Lia não vê:
  // não é da coordenação nem editora, #172)
  const recado = p.locator('.pauta-recado');
  assert.match(await recado.locator('.rotulo').textContent(), /Recado do dia · hoje/);
  assert.equal((await recado.locator('p').textContent()).trim(), 'Reunião geral às 10h na ilha 4');
  assert.equal(await p.locator('.pauta-mesa.so-lateral').count(), 1);
  assert.equal(await p.locator('.pauta-sobrou').count(), 0, 'a Lia não vê o que sobrou');
  assert.equal(await p.locator('.pauta-lateral.so-fora').count(), 1);
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
  assert.equal((await novela.locator('.pauta-producao').textContent()).trim(), 'Entrada');
  // a bolinha da Entrada é a bolinha de estado da agenda (BolinhaDeEstado, #172): o pontinho cheio e neutro, sem anel
  const bolinha = (l) => l.locator('.pauta-nome-com-versoes > .bolinha-estado').evaluate((e) => ({ estado: e.dataset.estado, cor: getComputedStyle(e).backgroundColor, anel: getComputedStyle(e).boxShadow, w: getComputedStyle(e).width, raio: getComputedStyle(e).borderRadius }));
  const semCard = await bolinha(novela);
  const tinta3 = await p.evaluate(() => { const e = document.createElement('i'); e.style.color = 'var(--tinta3)'; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; });
  assert.deepEqual(semCard, { estado: 'entrada', cor: tinta3, anel: 'none', w: '6px', raio: '50%' }, 'entrada: a bolinha neutra da agenda');
  assert.equal((await bolinha(show)).estado, 'entregue');
  assert.notEqual((await bolinha(show)).cor, tinta3, 'entregue: a bolinha com a cor da etapa');
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
  // a coerência entre as telas (#171): a lupa no lugar de todas e nenhum check verde de estado
  {
    const lugar = await lugarDaLupa(p);
    assert.ok(lugar.ok, `a Pauta: a lupa na ponta da linha do título (${JSON.stringify(lugar)})`);
    assert.deepEqual(await checksVerdes(p), [], 'a Pauta: nenhum check verde de estado');
  }
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
  // o "voltar para hoje" da agenda (#171): aparece fora da semana de hoje
  await p.locator('.pauta-nav .voltar-hoje:not(.fora)').waitFor();
  await p.getByRole('button', { name: 'Próxima semana' }).click();
  await p.locator(`th.pauta-dia[data-dia="${segunda}"]`).waitFor();
  assert.equal(hash(p), '#/pauta');
  await p.locator('.pauta-nav .voltar-hoje:not(.fora)').waitFor({ state: 'detached' });
  // a próxima semana ainda sem pauta: diz que não há nada
  await p.keyboard.press('ArrowRight');
  await p.locator('.pauta-vazia').waitFor();
  assert.equal(hash(p), `#/pauta/semana/${proxima}`);
  // o "voltar para hoje" volta para a de hoje
  await p.locator('.pauta-nav .voltar-hoje').click();
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

/**
 * Emula o Safari (WebKit) na grade (#172): lá, a largura em calc() com % de uma célula de tabela conta como porcentagem
 * no tamanho intrínseco da tabela, e com min-width: max-content a grade ia ao limite do navegador. Troca, nas regras das
 * células da grade, o calc() com % pela porcentagem dele; devolve as regras trocadas (nenhuma, com a grade em medidas
 * fixas).
 */
const comoNoSafari = (p) =>
  p.evaluate(() => {
    const trocadas = [];
    const varrer = (regras) => {
      for (const r of regras) {
        if (r.cssRules) varrer(r.cssRules);
        if (!r.style || !/pauta-(grade|dia|celula|canto|editor)/.test(r.selectorText || '')) continue;
        for (const prop of ['width', 'min-width']) {
          const v = r.style.getPropertyValue(prop);
          const pct = /calc\(.*?([\d.]+)%/.exec(v);
          if (!pct) continue;
          const divide = /\/\s*([\d.]+)\s*\)?\s*$/.exec(v);
          r.style.setProperty(prop, `${Number(pct[1]) / (divide ? Number(divide[1]) : 1)}%`);
          trocadas.push(`${r.selectorText} { ${prop}: ${v} }`);
        }
      }
    };
    for (const f of document.styleSheets) varrer(f.cssRules);
    return trocadas;
  });
/** O que a Semana mostra na tela: as datas das colunas à vista, os nomes à vista e a largura da grade e de cada dia. */
const semanaAVista = (p) =>
  p.evaluate(() => {
    const caixa = document.querySelector('.pauta-rolagem').getBoundingClientRect();
    const dentro = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.left >= caixa.left - 1 && r.right <= caixa.right + 1;
    };
    return {
      dias: [...document.querySelectorAll('th.pauta-dia')].filter(dentro).map((t) => t.dataset.dia),
      nomes: [...document.querySelectorAll('th.pauta-editor .pauta-nome')].filter((e) => dentro(e) && e.textContent.trim()).map((e) => e.textContent.trim()),
      grade: Math.round(document.querySelector('.pauta-grade').getBoundingClientRect().width),
      maiorDia: Math.round(Math.max(...[...document.querySelectorAll('th.pauta-dia')].map((t) => t.getBoundingClientRect().width))),
    };
  });

/**
 * A Semana no Safari (#172): com a regra do WebKit emulada, a grade continua com os 7 dias e o nome de cada editor à
 * vista, na semana de hoje (a rolagem até hoje) e numa semana na forma da pauta real (o fim de semana vazio, o nome em
 * caixa alta com "(sem ID)*", as tarefas e os avisos).
 */
async function aSemanaNoSafari(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1600, height: 1000 } });
  await p.locator('.pauta-grade').waitFor();
  const trocadas = await comoNoSafari(p);
  assert.deepEqual(trocadas, [], 'a grade não tem largura em calc() com %, que o Safari conta como porcentagem');
  // a grade montada de novo com a regra emulada, e a rolagem até hoje de novo
  await p.keyboard.press('ArrowRight');
  await p.locator('.pauta-vazia').waitFor();
  await p.keyboard.press('ArrowLeft');
  await p.locator(`th.pauta-dia[data-dia="${hoje}"]`).waitFor();
  await p.waitForTimeout(400);
  let vista = await semanaAVista(p);
  assert.deepEqual(vista.dias, diasDe(segunda), `a semana de hoje inteira à vista (${JSON.stringify(vista)})`);
  assert.deepEqual(vista.nomes, ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Duarte']);
  assert.ok(vista.grade <= 1600 && vista.maiorDia < 400, `a grade cabe na tela (${JSON.stringify(vista)})`);
  // a semana na forma da pauta real
  await p.goto(`${url}#/pauta/semana/${DEPOIS}`);
  await p.locator(`th.pauta-dia[data-dia="${DEPOIS}"]`).waitFor();
  await comoNoSafari(p);
  await p.waitForTimeout(400);
  vista = await semanaAVista(p);
  assert.deepEqual(vista.dias, diasDe(DEPOIS), `a semana da forma real inteira à vista (${JSON.stringify(vista)})`);
  assert.deepEqual([...vista.nomes].sort(), [...DA_FORMA_REAL].sort(), 'o nome de cada editor à vista');
  assert.ok(vista.grade <= 1600 && vista.maiorDia < 400, `a grade cabe na tela (${JSON.stringify(vista)})`);
  // o fim de semana sem ninguém: o traço em cada linha
  assert.deepEqual(await textos(fileira(p, 'Rita Fontes').locator(`td[data-dia="${mais(DEPOIS, 5)}"], td[data-dia="${mais(DEPOIS, 6)}"]`)), ['–', '–']);
  // no celular, com a regra emulada: a grade rola, os nomes ficam e hoje abre logo depois deles
  const cel = await abrir(navegador, url, { ...devices['iPhone 13'], deviceScaleFactor: 1 });
  await cel.p.locator('.pauta-grade').waitFor();
  await comoNoSafari(cel.p);
  const medida = await cel.p.evaluate(() => {
    const r = document.querySelector('.pauta-rolagem');
    return { largura: r.scrollWidth, tela: r.clientWidth, nome: document.querySelector('th.pauta-editor .pauta-nome').getBoundingClientRect().left >= r.getBoundingClientRect().left - 1 };
  });
  assert.ok(medida.largura < 8 * medida.tela && medida.nome, `celular: a grade rola sem ir ao limite (${JSON.stringify(medida)})`);
  assert.deepEqual(erros, []);
  assert.deepEqual(cel.erros, []);
  await cel.ctx.close();
  await ctx.close();
  console.log('ok: a Semana no Safari (#172): os 7 dias e os nomes à vista, na semana de hoje e na da forma real; no celular, a grade rola sem ir ao limite');
}

/**
 * Quem vê o "Sobrou · sem editor" (#172): a coordenação (marcada por um administrador) e os editores (a Carla); a Lia e
 * a designer (a Dora), não.
 */
async function oSobrouPorPerfil(navegador, url, api) {
  const marcar = await fetch(`${api}/cadastros/coordenacao`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-access-authenticated-user-email': CHEFE }, body: JSON.stringify({ email: COORD }) });
  assert.equal(marcar.status, 200, 'a coordenação marcada');
  const ve = {};
  for (const [quem, email] of [['coordenação', COORD], ['editora', CARLA], ['designer', DORA], ['sem perfil', LIA]]) {
    const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, '#/pauta', null, email);
    await p.locator('.pauta-grade').waitFor();
    await p.locator('.pauta-fora').waitFor();
    const sobrou = p.locator('.pauta-sobrou');
    ve[quem] = (await sobrou.count()) ? await textos(sobrou.locator('.pauta-texto')) : null;
    // a linha "sem editor · sobrou" da Semana vai junto com a folha
    const linha = (await p.locator('.pauta-grade tr.sem-editor').count()) ? await textos(celula(p, 'sem editor', hoje).locator('.pauta-item .pauta-texto')) : null;
    assert.deepEqual(linha, ve[quem], `${quem}: a linha da Semana e a folha do que sobrou juntas`);
    if (ve[quem]) {
      assert.match(await sobrou.locator('.rotulo').textContent(), /Sobrou · sem editor\s*1/);
      assert.equal((await fileira(p, 'sem editor').locator('.pauta-editor-meta').textContent()).trim(), 'sobrou');
    }
    // e a coluna do Dia
    await p.getByRole('radio', { name: 'Dia', exact: true }).click();
    await p.locator('.pauta-colunas').waitFor();
    assert.equal(await p.locator('.pauta-coluna.sobra').count(), ve[quem] ? 1 : 0, `${quem}: a coluna do que sobrou no Dia`);
    await p.getByRole('radio', { name: 'Semana', exact: true }).click();
    await p.locator('.pauta-grade').waitFor();
    if (CAPTURAS && quem !== 'editora') await capturar(p, `00-sobrou-${quem.replace(/\s+/g, '-')}`, false);
    assert.deepEqual(erros, []);
    await ctx.close();
  }
  // o que sobrou é a claquete sem editor que casa com uma Produção; a CALHAUS (tarefa) ficou de fora (#199)
  assert.deepEqual(ve, { coordenação: [SOBROU], editora: [SOBROU], designer: null, 'sem perfil': null });
  console.log('ok: o "Sobrou · sem editor" (a folha, a linha da Semana e a coluna do Dia) só para a coordenação e os editores; a designer e quem não tem perfil não veem');
}

/**
 * A info (#172): a instrução para o editor sai da lista (não é tarefa) e fica escondida num balão. A da claquete, no
 * canto do card; a que não tem claquete antes, no alto da posição. Com info, o balão é cheio e laranja; o clique abre o
 * texto ali mesmo (sem abrir a ficha), e Esc, outro clique ou um clique fora fecham.
 */
async function aInfoNoBalao(navegador, url) {
  for (const [onde, opcoes] of [
    ['computador', { viewport: { width: 1440, height: 1000 } }],
    ['celular', { ...devices['iPhone 13'] }],
  ]) {
    for (const tema of ['light', 'dark']) {
      const nome = `${onde}-${tema === 'dark' ? 'escuro' : 'claro'}`;
      const { ctx, p, erros } = await abrir(navegador, url, { ...opcoes, colorScheme: tema }, `#/pauta/semana/${DEPOIS}`);
      await p.locator(`th.pauta-dia[data-dia="${DEPOIS}"]`).waitFor();
      const otto = celula(p, 'Otto Lemos', DEPOIS);
      // a instrução não é item da lista nem "tarefa"
      const daLista = await textos(otto.locator('.pauta-texto'));
      assert.ok(daLista.length === 1 && daLista[0].startsWith('Atração 2(Prologo)'), `${nome}: só a claquete na lista (${daLista})`);
      assert.equal(await otto.locator('.pauta-producao', { hasText: 'tarefa' }).count(), 0);
      const card = cardDe(otto, 'Atração 2');
      const botao = card.locator('.balao-info-botao');
      assert.equal(await botao.getAttribute('aria-expanded'), 'false');
      assert.equal(await card.locator('.balao-info-texto').count(), 0, `${nome}: a info escondida`);
      const ultra = await p.evaluate(() => { const e = document.createElement('i'); e.style.color = 'var(--ultra)'; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; });
      assert.equal(await botao.evaluate((b) => getComputedStyle(b).color), ultra, `${nome}: com info, o balão laranja`);
      assert.equal(await botao.locator('path').getAttribute('fill'), 'currentColor', `${nome}: o balão cheio`);
      await botao.scrollIntoViewIfNeeded();
      await botao.click();
      await card.locator('.balao-info-texto').waitFor();
      assert.equal(await botao.getAttribute('aria-expanded'), 'true');
      assert.deepEqual(await textos(card.locator('.balao-info-texto p')), ['TRANSFORMAR DA A B']);
      assert.equal(await p.locator('.card-aberto').count(), 0, `${nome}: o balão não abre a ficha`);
      await p.waitForTimeout(300);
      await capturar(p, `08-info-${nome}`, false);
      // Esc fecha
      await p.keyboard.press('Escape');
      await card.locator('.balao-info-texto').waitFor({ state: 'detached' });
      // a info sem claquete antes: no alto da posição
      const igor = celula(p, 'Igor Matos', DEPOIS);
      assert.equal(await igor.locator('.pauta-texto', { hasText: 'REDATOR' }).count(), 0);
      const daPosicao = igor.locator('.pauta-celula-topo .balao-info-botao.tem');
      await daPosicao.scrollIntoViewIfNeeded();
      await daPosicao.click();
      await igor.locator('.pauta-celula-topo .balao-info-texto').waitFor();
      assert.deepEqual(await textos(igor.locator('.balao-info-texto p')), ['REDATOR VAI ACOMPANHAR']);
      // um clique fora fecha
      await p.locator('.pauta-cabeca h1').click();
      await igor.locator('.balao-info-texto').waitFor({ state: 'detached' });
      await semRolagemDeLado(p, nome);
      assert.deepEqual(erros, [], `${nome}: erros na página`);
      await ctx.close();
    }
  }
  console.log('ok: a info (#172): fora da lista, no balão da claquete ou da posição; laranja e cheio; o clique abre ali mesmo, Esc e o clique fora fecham (computador e celular, claro e escuro)');
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
  assert.equal((await p.locator('tr.eu .voce-a-mao').textContent()).trim(), 'você');
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
  assert.equal((await coluna(p, 'Carla Duarte').locator('.voce-a-mao').textContent()).trim(), 'você');
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
  // só as claquetes que casam com uma Produção, em cards (#199): a tarefa e a claquete sem Produção ficam de fora; o
  // aviso não é card
  const doBruno = coluna(p, 'Bruno Teixeira');
  assert.equal(await doBruno.locator('.pauta-tarefa').count(), 0, 'no Dia, nenhuma tarefa');
  assert.equal(await doBruno.locator('.pauta-item', { hasText: 'Filme Sem Card' }).count(), 0, 'nem a claquete sem Produção');
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
  await p.locator('.pauta-nav .voltar-hoje').click();
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
  // da pauta inteira, com o que ficou fora da tela (#199): sem editor, a CALHAUS e a Sessão Extra
  assert.match(resumo, /^2 linhas sem editor/);
  assert.match(resumo, /\d+ claquetes sem card, fora da Pauta/);
  assert.match(resumo, /pauta alterada às 08:00/);
  assert.equal(await p.locator('.pauta-copia').count(), 0);
  // o banco do Teable cai: a página relida mostra a última cópia, com a hora dela
  teable.estado.fora = true;
  try {
    await p.reload();
    await p.locator('.pauta-grade').waitFor();
    await p.locator('.pauta-copia').waitFor();
    assert.match(await p.locator('.pauta-copia').textContent(), /O banco do Teable não respondeu: esta é a cópia da pauta das \d{2}:\d{2}/);
    assert.deepEqual(await textos(p.locator('.pauta-grade .pauta-nome')), ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Duarte']);
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
  await p.locator('.pauta-nav .voltar-hoje').click();
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

/** O período escrito da Semana, o mesmo da agenda (#171): "16 – 22 de novembro", "30 de novembro – 6 de dezembro". */
const periodoDaSemana = (seg) => {
  const fim = mais(seg, 6);
  const [a, b] = [Number(seg.slice(5, 7)) - 1, Number(fim.slice(5, 7)) - 1];
  return a === b ? `${Number(seg.slice(8))} – ${Number(fim.slice(8))} de ${MESES[b]}` : `${Number(seg.slice(8))} de ${MESES[a]} – ${Number(fim.slice(8))} de ${MESES[b]}`;
};

/** Grava, a cada quadro, o que o seletor de datas, o resumo e o cabeçalho da grade (ou a fita) mostram, enquanto `agir`
    troca de semana ou de dia, até o seletor chegar a `alvo` e tudo parar por um tempo; devolve os quadros, sem
    repetidos seguidos. */
async function quadrosDaTroca(p, agir, alvo, parado = 400) {
  await p.evaluate(() => {
    window.__quadros = [];
    window.__gravando = true;
    const ler = () => {
      const txt = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join('|');
      const q = { periodo: txt('.pauta-periodo'), resumo: txt('.pauta-resumo .ct-num'), dias: txt('th.pauta-dia .pauta-dia-num, .pauta-fita .pauta-fita-num'), t: performance.now() };
      const u = window.__quadros.at(-1);
      if (!u || u.periodo !== q.periodo || u.resumo !== q.resumo || u.dias !== q.dias) window.__quadros.push(q);
      if (window.__gravando) requestAnimationFrame(ler);
    };
    requestAnimationFrame(ler);
  });
  await agir();
  await p.waitForFunction(
    ([a, ms]) => {
      const u = window.__quadros.at(-1);
      return u && u.periodo === a && performance.now() - u.t > ms;
    },
    [alvo, parado],
    { timeout: 8000 },
  );
  return p.evaluate(() => ((window.__gravando = false), window.__quadros));
}

/**
 * Os contadores da agenda na Pauta (#170): o seletor de datas ("16 – 22 de novembro", "sexta, 27 de novembro") e os
 * números do resumo do administrador ("1 linha sem editor · 15 claquetes sem card") contam como os da agenda (No
 * Trello) quando a semana ou o dia muda: o período e os números do cabeçalho da grade (e da fita do Dia) contam juntos,
 * pelas datas, e o "hoje" volta à mão no fim. Com o movimento reduzido, nada conta: só esmaece. Com VIDEO=pasta, grava
 * o vídeo da troca de semana.
 */
async function osContadores(navegador, url) {
  const VIDEO = process.env.VIDEO || '';
  const tela = { viewport: { width: 1440, height: 900 }, colorScheme: 'light', ...(VIDEO ? { recordVideo: { dir: join(VIDEO, 'contadores'), size: { width: 1440, height: 900 } } } : {}) };
  const { ctx, p, erros } = await abrir(navegador, url, tela, '#/pauta', null, CHEFE);
  await p.locator('.pauta-grade').waitFor();
  await p.locator('.pauta-resumo').waitFor();
  const devagar = (ms) => (VIDEO ? p.waitForTimeout(ms) : Promise.resolve());
  const periodo = () => p.locator('.pauta-periodo').textContent().then((t) => t.replace(/\s+/g, ' ').trim());
  // o período da agenda: o mesmo componente (os dias com algarismos de largura fixa), escrito como a Pauta escreve
  assert.equal(await periodo(), periodoDaSemana(segunda));
  assert.equal(await p.locator('.pauta-periodo b .p-dia').count(), 2, 'o período da agenda: dois dias que contam');
  assert.equal(await p.locator('.pauta-periodo b .p-dia').first().evaluate((e) => getComputedStyle(e).fontVariantNumeric), 'tabular-nums');
  // o leitor de tela ouve o período parado, não a contagem
  assert.equal(await p.locator('.pauta-periodo').getAttribute('aria-hidden'), 'true');
  assert.equal((await p.locator('.pauta-leitor').textContent()).trim(), periodoDaSemana(segunda));
  const resumo = async () => (await p.locator('.pauta-resumo').textContent()).replace(/\s+/g, ' ');
  const [semEditor, semCard] = (await p.locator('.pauta-resumo .ct-num').allTextContents()).map(Number);
  assert.match(await resumo(), /^2 linhas sem editor/);
  assert.ok(semCard > 3, `claquetes sem card (${semCard})`);
  await capturar(p, '12-contadores-semana', false);
  await devagar(900);

  // a semana anterior: o período e os números do cabeçalho contam para trás, pelas datas, e o resumo conta junto
  const indo = await quadrosDaTroca(p, () => p.getByRole('button', { name: 'Semana anterior' }).click(), periodoDaSemana(anterior));
  const finalAnterior = indo.at(-1);
  assert.equal(finalAnterior.periodo, periodoDaSemana(anterior));
  const primeiros = indo.map((q) => Number(q.dias.split('|')[0]));
  const contados = [...new Set(primeiros)];
  assert.ok(contados.length >= 3, `o cabeçalho conta (${contados})`);
  const [ini, fim] = [Number(segunda.slice(8)), Number(anterior.slice(8))];
  // o primeiro número passa por dias entre a partida e o alvo (pelas datas: a virada do mês volta a 31)
  assert.ok(contados.includes(ini) && contados.at(-1) === fim, `o cabeçalho sai de ${ini} e chega em ${fim} (${contados})`);
  const noMeio = indo.filter((q) => q.periodo !== periodoDaSemana(segunda) && q.periodo !== periodoDaSemana(anterior));
  assert.ok(noMeio.length >= 1, `o período conta, passando pelas datas do meio (${indo.map((q) => q.periodo)})`);
  const cards = [...new Set(indo.map((q) => Number(q.resumo.split('|')[1])))];
  assert.equal(cards[0], semCard);
  assert.ok(cards.length >= 3 && cards.some((c) => c < semCard && c > cards.at(-1)), `as claquetes sem card contam (${cards})`);
  // as contas param certas: o período, o resumo (a palavra acompanha) e o hoje fora desta semana
  assert.equal(await periodo(), periodoDaSemana(anterior));
  assert.equal(await p.locator('th.pauta-dia.hoje').count(), 0);
  assert.match(await resumo(), /^0 linhas sem editor1 claquete sem card/);
  await capturar(p, '13-contadores-semana-anterior', false);
  await devagar(700);

  // de volta: hoje volta ao cabeçalho depois da contagem, escrevendo-se à mão
  const voltando = await quadrosDaTroca(p, () => p.getByRole('button', { name: 'Próxima semana' }).click(), periodoDaSemana(segunda));
  assert.equal(voltando.at(-1).periodo, periodoDaSemana(segunda));
  await p.locator('th.pauta-dia.hoje .pauta-dia-rel').waitFor();
  assert.equal((await p.locator('th.pauta-dia.hoje').getAttribute('data-dia')), hoje);
  assert.deepEqual((await p.locator('.pauta-resumo .ct-num').allTextContents()).map(Number), [semEditor, semCard]);
  await devagar(700);
  // a semana seguinte, sem pauta, e a volta pelo Hoje: as contas param certas
  await p.keyboard.press('ArrowRight');
  await p.locator('.pauta-vazia').waitFor();
  await p.waitForFunction((t) => document.querySelector('.pauta-periodo')?.textContent.replace(/\s+/g, ' ').trim() === t, periodoDaSemana(proxima));
  await devagar(800);
  await p.locator('.pauta-nav .voltar-hoje').click();
  await p.waitForFunction((t) => document.querySelector('.pauta-periodo')?.textContent.replace(/\s+/g, ' ').trim() === t, periodoDaSemana(segunda));
  await devagar(800);

  // o Dia: o período conta o dia ("sexta, 27 de novembro"), e a fita conta quando a semana muda
  await p.getByRole('radio', { name: 'Dia', exact: true }).click();
  await p.locator('.pauta-colunas').waitFor();
  assert.equal(await periodo(), porExtenso(hoje));
  await devagar(700);
  const dia = await quadrosDaTroca(p, () => p.getByRole('button', { name: 'Próximo dia' }).click(), porExtenso(mais(hoje, 1)));
  assert.equal(dia.at(-1).periodo, porExtenso(mais(hoje, 1)));
  await capturar(p, '14-contadores-dia', false);
  await devagar(500);
  // a fita: ir para a segunda e voltar um dia troca de semana; os números da fita contam
  await p.locator(`.pauta-fita [data-dia="${segunda}"]`).click();
  await p.waitForFunction((t) => document.querySelector('.pauta-periodo')?.textContent.replace(/\s+/g, ' ').trim() === t, porExtenso(segunda));
  await devagar(500);
  const fita = await quadrosDaTroca(p, () => p.getByRole('button', { name: 'Dia anterior' }).click(), porExtenso(mais(segunda, -1)));
  assert.equal(fita.at(-1).periodo, porExtenso(mais(segunda, -1)));
  const daFita = [...new Set(fita.map((q) => q.dias.split('|')[0]))];
  assert.ok(daFita.length >= 3, `a fita conta (${daFita})`);
  assert.equal(daFita.at(-1), `${anterior.slice(8)}/${anterior.slice(5, 7)}`);
  await devagar(900);
  assert.deepEqual(erros, [], 'os contadores: erros na página');
  await ctx.close();

  // o movimento reduzido: nada conta (o período e os números trocam de uma vez) e só esmaece
  const reduzido = await abrir(navegador, url, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, '#/pauta', null, CHEFE);
  const q = reduzido.p;
  await q.locator('.pauta-resumo').waitFor();
  const troca = await quadrosDaTroca(q, () => q.getByRole('button', { name: 'Semana anterior' }).click(), periodoDaSemana(anterior));
  const periodos = [...new Set(troca.map((x) => x.periodo))];
  assert.deepEqual(periodos, [periodoDaSemana(segunda), periodoDaSemana(anterior)], `reduzido: o período só troca (${periodos})`);
  assert.equal(new Set(troca.map((x) => x.resumo)).size, 2, 'reduzido: o resumo só troca');
  await q.getByRole('button', { name: 'Próxima semana' }).click();
  await q.waitForFunction(() => document.querySelector('.pauta-periodo').getAnimations().length > 0);
  const anima = await q.locator('.pauta-periodo').evaluate((e) => e.getAnimations().map((a) => Object.keys(a.effect.getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).join(',')));
  assert.ok(anima.every((k) => k === 'opacity'), `reduzido: o período só esmaece (${anima})`);
  assert.deepEqual(reduzido.erros, []);
  await reduzido.ctx.close();
  console.log(`ok: os contadores da agenda na Pauta: o seletor de datas (Semana e Dia), o cabeçalho da grade, a fita e o resumo contam juntos; reduzido, só esmaece${VIDEO ? ` (vídeo em ${join(VIDEO, 'contadores')})` : ''}`);
}

/* ---------- #181: a etiqueta da campanha na claquete ---------- */

/**
 * A campanha na Pauta (#181): o Show da Tarde de hoje (a G5 e a SP) ligado a duas campanhas pela API, como faz o card
 * aberto de Produções. A etiqueta vem do cruzamento com a Produção (a claquete não guarda nada): na Semana (a primeira e
 * "+N"), no Dia e na ficha (todas); o clique leva à página da campanha (#180). Claro e escuro, no
 * computador e no celular.
 */
async function aCampanha(navegador, url, api) {
  const como = (caminho, corpo) => fetch(`${api}${caminho}`, { method: corpo ? 'POST' : 'GET', headers: { 'cf-access-authenticated-user-email': CHEFE, 'content-type': 'application/json' }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) }).then((r) => r.json());
  const tela = await como('/producoes/por-praca');
  const shows = tela.blocos.flatMap((b) => Object.values(b.colunas).flat()).filter((c) => c.claquete.startsWith(`Show da Tarde ${diaMes(hoje)}`));
  assert.equal(shows.length, 2, 'o Show da Tarde de hoje tem a G5 e a SP');
  const g5 = shows.find((c) => !c.claquete.endsWith(' SP'));
  const spp = shows.find((c) => c.claquete.endsWith(' SP'));
  const lanc = (await como('/producoes/campanha', { producao: g5.id, nova: 'Lançamento da Tarde' })).feito.campanha;
  await como('/producoes/campanha', { producao: g5.id, nova: 'AESP Verão' });
  await como('/producoes/campanha', { producao: spp.id, campanha: lanc.id, liga: true });
  try {
    for (const tema of ['light', 'dark']) {
      const nome = tema === 'dark' ? 'escuro' : 'claro';
      const { p, ctx, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
      await p.locator('.pauta-grade').waitFor();
      // a Semana: a primeira campanha e "+1" (a AESP só na G5), na mesma pílula das Produções
      const show = cardDe(celula(p, 'Bruno Teixeira', hoje), `Show da Tarde ${diaMes(hoje)}`).first();
      const etiqueta = show.locator('.campanhas.compacta');
      await etiqueta.waitFor();
      assert.deepEqual(await textos(etiqueta.locator('.campanha-nome')), ['Lançamento da Tarde']);
      assert.equal((await etiqueta.locator('.campanha-mais').textContent()).trim(), '+1');
      assert.equal(await etiqueta.locator('.campanha-mais').getAttribute('title'), 'AESP Verão');
      // a claquete sem campanha não tem etiqueta; a tarefa também não
      assert.equal(await cardDe(celula(p, 'Ana Ribeiro', hoje), 'Novela Sol').locator('.campanha').count(), 0, 'sem campanha, sem etiqueta');
      // nada de "unha" na pílula
      const unha = await etiqueta.locator('.campanha').first().evaluate((e) => ({ borda: parseFloat(getComputedStyle(e).borderLeftWidth), sombra: getComputedStyle(e).boxShadow }));
      assert.equal(unha.borda, 0, 'sem unha');
      assert.ok(!/inset/.test(unha.sombra), 'sem faixa por sombra');
      await semRolagemDeLado(p, `a campanha na Semana ${nome}`);
      await capturar(p, `60-campanha-semana-${nome}`);
      // a ficha: todas as campanhas das Produções da claquete, sem o tirar (é no card aberto de Produções)
      await show.locator('.pauta-claquete-botao').click();
      const ficha = p.getByRole('dialog', { name: `Show da Tarde ${diaMes(hoje)}` });
      await ficha.waitFor();
      assert.deepEqual(await textos(ficha.locator('.pauta-ficha-campanhas .campanha-nome')), ['Lançamento da Tarde', 'AESP Verão']);
      assert.equal(await ficha.getByRole('button', { name: /^Tirar da campanha/ }).count(), 0, 'a ficha não tira');
      await p.waitForTimeout(450);
      await capturar(p, `61-campanha-ficha-${nome}`, false);
      await p.keyboard.press('Escape');
      await fechou(p);
      // o Dia: a mesma etiqueta no card da coluna do Bruno
      await p.locator(`th.pauta-dia[data-dia="${hoje}"] a`).click();
      await p.locator('.pauta-colunas').waitFor();
      const noDia = cardDe(p.locator('.pauta-coluna[data-editor="Bruno Teixeira"]'), `Show da Tarde ${diaMes(hoje)}`).first();
      await noDia.locator('.campanhas.compacta .campanha', { hasText: 'Lançamento da Tarde' }).waitFor();
      assert.equal((await noDia.locator('.campanha-mais').textContent()).trim(), '+1');
      await capturar(p, `62-campanha-dia-${nome}`);
      // o clique na etiqueta leva à página da campanha (#180), como em qualquer tela
      await noDia.getByRole('button', { name: 'Abrir a campanha Lançamento da Tarde' }).click();
      await p.waitForFunction((id) => location.hash === `#/campanhas/${encodeURIComponent(id)}`, lanc.id);
      await p.locator('.camp-titulo-nome', { hasText: 'Lançamento da Tarde' }).waitFor();
      await capturar(p, `63-campanha-pagina-${nome}`);
      assert.deepEqual(aoTrello, [], 'a campanha não vai ao Trello');
      assert.deepEqual(erros, []);
      await ctx.close();
    }
    // no celular: o Dia, com a etiqueta no card, sem a página rolar para o lado
    const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
    const { p, ctx, erros } = await abrir(navegador, url, { ...iphone, colorScheme: 'light' }, `#/pauta/dia/${hoje}`);
    await p.locator('.pauta-colunas').waitFor();
    const noCelular = cardDe(p.locator('.pauta-coluna[data-editor="Bruno Teixeira"]'), `Show da Tarde ${diaMes(hoje)}`).first();
    await noCelular.scrollIntoViewIfNeeded();
    await noCelular.locator('.campanhas.compacta .campanha').waitFor();
    await semRolagemDeLado(p, 'a campanha no celular');
    await capturar(p, '64-campanha-dia-celular', false);
    assert.deepEqual(erros, []);
    await ctx.close();
  } finally {
    // as outras partes do e2e não contam com as campanhas
    for (const c of [g5, spp]) for (const x of (await como(`/producoes/aberta?producao=${c.id}`)).campanhas ?? []) await como('/producoes/campanha', { producao: c.id, campanha: x.id, liga: false });
  }
  console.log('ok: a campanha na Pauta (#181)');
}

/** Nada de "unha" no bloco: nenhuma borda esquerda nem sombra por dentro em nenhum pedaço dele. */
const unhas = (l) =>
  l.evaluate((raiz) =>
    [raiz, ...raiz.querySelectorAll('*')]
      .filter((e) => {
        const c = getComputedStyle(e);
        return parseFloat(c.borderLeftWidth) > 1 || /inset/.test(c.boxShadow) || parseFloat(c.borderInlineStartWidth) > 1;
      })
      .map((e) => e.className),
  );

/**
 * Os caminhos da arte (#202) na ficha da claquete: a pasta de saída em destaque e o projeto de cada Produção com projeto
 * do Padeiro (a G5 e a SP do Show da Tarde), com o copiar, em Windows e Mac; a claquete sem projeto não mostra nada. No
 * computador e no celular, claro e escuro; com o movimento reduzido, nada anima.
 */
async function osCaminhosDaArte(navegador, url) {
  const tela = async (rotulo, opcoes, tema) => {
    const nome = `${rotulo}-${tema === 'dark' ? 'escuro' : 'claro'}`;
    const celular = rotulo === 'celular';
    const { ctx, p, erros } = await abrir(navegador, url, { ...opcoes, colorScheme: tema });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    await p.locator('.pauta-grade').waitFor();
    // a claquete sem projeto do Padeiro (a Festa da Carla, sem card): nada dos caminhos
    const festa = celula(p, 'Carla Duarte', hoje).locator('.pauta-claquete-botao').first();
    await festa.scrollIntoViewIfNeeded();
    await (celular ? festa.tap() : festa.click());
    await painel(p).waitFor();
    await p.locator('.pauta-ficha-producao').waitFor();
    assert.equal(await painel(p).locator('.caminhos-da-arte').count(), 0, `${nome}: sem projeto, nada aparece`);
    assert.doesNotMatch(await painel(p).textContent(), /sem caminho|Caminhos da arte/i, `${nome}: nem o "sem caminho"`);
    await p.keyboard.press('Escape');
    await fechou(p);

    const show = celula(p, 'Bruno Teixeira', hoje).locator('.pauta-claquete-botao', { hasText: `Show da Tarde ${diaMes(hoje)}` }).first();
    await show.scrollIntoViewIfNeeded();
    await (celular ? show.tap() : show.click());
    const blocos = painel(p).locator('.caminhos-da-arte');
    await blocos.first().waitFor();
    await p.waitForTimeout(450);
    // um bloco por Produção com projeto, com a praça no título (a claquete tem duas)
    assert.deepEqual(await blocos.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label'))), ['Caminhos da arte · G5', 'Caminhos da arte · SP']);
    const g5 = blocos.nth(0);
    // a pasta de saída primeiro, em destaque (o fundo tingido, não a borda), e o projeto embaixo
    assert.deepEqual(await g5.locator('.cda-caminho').evaluateAll((cs) => cs.map((c) => c.dataset.caminho)), ['saida', 'projeto']);
    const fundo = (l) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.notEqual(await fundo(g5.locator('.cda-saida')), await fundo(g5.locator('.cda-projeto')), `${nome}: a pasta de saída tem o fundo dela`);
    assert.match(await g5.locator('.cda-saida').textContent(), /Pasta de saída.*a edição pega o render aqui/);
    assert.deepEqual(await unhas(painel(p).locator('.caminhos-da-arte').first()), [], `${nome}: sem unha`);
    assert.deepEqual(await checksVerdes(p), [], `${nome}: nada de check verde`);
    // o sistema começa no do navegador (o Chromium do e2e no Linux: Windows) e a troca leva os dois caminhos
    const texto = async (l, tipo) => (await l.locator(`.cda-${tipo} .cda-texto`).textContent()).trim();
    assert.equal(await g5.locator('.cda-sistema [aria-checked="true"]').textContent(), 'Windows');
    assert.equal(await texto(g5, 'saida'), SAIDA_G5.win);
    assert.equal(await texto(g5, 'projeto'), PROJETO_G5.win, 'o .aep mais novo, no Windows pelo servidor do volume');
    assert.equal(await g5.locator('.cda-projeto .cda-texto b').textContent(), 'SHOW DA TARDE CHAMADA V2.aep', 'o nome do .aep em negrito');
    const mac = g5.getByRole('radio', { name: 'Mac' });
    await (celular ? mac.tap() : mac.click());
    await p.waitForTimeout(260);
    assert.equal(await texto(g5, 'saida'), SAIDA_G5.mac);
    assert.equal(await texto(g5, 'projeto'), PROJETO_G5.mac);
    // a pastilha deslizou para o Mac
    const pastilha = await g5.locator('.cda-pastilha').evaluate((e) => e.getBoundingClientRect().left);
    const doMac = await mac.evaluate((e) => e.getBoundingClientRect().left);
    assert.ok(Math.abs(pastilha - doMac) <= 3, `${nome}: a pastilha no Mac (${pastilha} × ${doMac})`);
    // a escolha vale para todos os caminhos à vista: a SP também no Mac. Ela veio do Mac, com o volume montado de novo:
    // sem o -2; e, no Windows, pelo servidor que os outros registros dão
    assert.equal(await blocos.nth(1).locator('.cda-sistema [aria-checked="true"]').textContent(), 'Mac');
    assert.equal(await texto(blocos.nth(1), 'projeto'), `/Volumes/ARTE/${PASTA_DO_SHOW}/SP/01_PROJETOS/SHOW DA TARDE SP.aep`);
    // copiar: o caminho no sistema escolhido vai para a área de transferência, e o botão diz "Copiado"
    const copiar = g5.locator('.cda-saida .copiar-caminho');
    await (celular ? copiar.tap() : copiar.click());
    await g5.locator('.cda-saida .copiar-caminho.copiado').waitFor();
    assert.equal((await copiar.textContent()).trim(), 'Copiado');
    assert.equal(await p.evaluate(() => navigator.clipboard.readText()), SAIDA_G5.mac);
    assert.deepEqual(await checksVerdes(p), [], `${nome}: o copiado também sem check verde`);
    if (celular) {
      // os alvos de 44 px: o copiar e a troca do sistema
      const alvos = await painel(p).locator('.caminhos-da-arte .copiar-caminho, .caminhos-da-arte .cda-sistema button').evaluateAll((es) => es.map((e) => Math.round(e.getBoundingClientRect().height)));
      assert.ok(alvos.every((h) => h >= 44), `${nome}: os alvos de 44 px (${alvos})`);
      assert.ok(await painel(p).evaluate((e) => e.scrollWidth <= innerWidth + 1), `${nome}: a ficha não rola para o lado`);
    }
    await blocos.first().scrollIntoViewIfNeeded();
    await p.waitForTimeout(250);
    await capturar(p, `70-caminhos-da-arte-${nome}`, false);
    assert.deepEqual(erros, []);
    await ctx.close();
  };
  for (const tema of ['light', 'dark']) await tela('computador', { viewport: { width: 1440, height: 1000 } }, tema);
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  for (const tema of ['light', 'dark']) await tela('celular', iphone, tema);

  // o movimento: o bloco entra subindo, um caminho depois do outro; com o movimento reduzido, nada anima
  for (const reduzido of [false, true]) {
    const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, ...(reduzido ? { reducedMotion: 'reduce' } : {}) });
    await p.locator('.pauta-grade').waitFor();
    await celula(p, 'Bruno Teixeira', hoje).locator('.pauta-claquete-botao', { hasText: `Show da Tarde ${diaMes(hoje)}` }).first().click();
    const saida = painel(p).locator('.caminhos-da-arte .cda-saida').first();
    await saida.waitFor();
    const anima = await saida.evaluate((e) => e.getAnimations().length);
    if (reduzido) assert.equal(anima, 0, 'com o movimento reduzido, o caminho não anima');
    else assert.ok(anima > 0, 'o caminho entra animando');
    const atraso = await painel(p).locator('.caminhos-da-arte').first().locator('.cda-caminho').evaluateAll((cs) => cs.map((c) => getComputedStyle(c).animationDelay));
    if (!reduzido) assert.deepEqual(atraso, ['0s', '0.06s'], 'um caminho depois do outro');
    const transicao = await painel(p).locator('.cda-pastilha').first().evaluate((e) => getComputedStyle(e).transitionDuration);
    assert.equal(transicao, reduzido ? '0s' : '0.2s', 'a pastilha desliza (parada com o movimento reduzido)');
    assert.deepEqual(erros, []);
    await ctx.close();
  }
  console.log('ok: os caminhos da arte na ficha da Pauta (#202)');
}

/**
 * As Produções das outras claquetes da pauta (#199: a Pauta só mostra as que casam), direto no SQLite, em Entrada: todas
 * menos as da produção da arte do Teable (a carga) e o Filme Sem Card, que fica de fora.
 */
async function porAsProducoes(db) {
  const { tipoDaLinha } = await import(join(RAIZ, 'src', 'modelo', 'pauta.ts'));
  const daCarga = new Set([`Show da Tarde ${diaMes(hoje)}`, `Show da Tarde ${diaMes(hoje)} SP (H)`, `Festa da Vila(Prologo)${diaMes(mais(hoje, 2))} (AH)`, SEM_CARD, ...SEM_CARD_TAMBEM.map((l) => l.fields.claquete)]);
  const inserir = db.prepare('INSERT INTO producoes (id, claquete, praca, etapa, entrada_em, criada_em, atualizada_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const agora = new Date().toISOString();
  const feitas = new Set();
  for (const { fields: f } of PAUTA) {
    if (f.anotacao || daCarga.has(f.claquete) || feitas.has(f.claquete) || tipoDaLinha(f.claquete, null) !== 'claquete') continue;
    feitas.add(f.claquete);
    inserir.run(`prod-e2e-${feitas.size}`, f.claquete, '', 'entrada', new Date(Date.parse(f.data) - 86_400_000).toISOString(), agora, agora);
  }
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
    projetos: PROJETOS,
  };
  const teable = teableFalso({ EDICAO_producao: 'pauta_e2e', ARTE_producao: 'arte_e2e', editores: 'editores_e2e', KEY_editores: 'key_editores_e2e', designers: 'designers_e2e', projetos: 'projetos_e2e' }, { registros });
  const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
  // a produção da arte do mesmo Teable falso, para a carga das Produções (#96)
  const trello = { env: { ...PG, ...comTabelas({ ARTE_producao: 'arte_e2e' }) }, consultar: teable.consultar };
  const env = { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, ...PG };
  const cadastros = criarCadastros({ ...env, TEABLE_EDITORES: 'tblFalso_bseFalso_editores', TEABLE_KEY_EDITORES: 'tblFalso_bseFalso_KEY_editores' }, { buscar: teable });
  const s = await subir({ teable, pg: teable.abrirPg, trello, cadastros, env });
  const carga = await fetch(`${s.api}/producoes/recarregar`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': CHEFE } });
  assert.equal(carga.status, 200, 'a carga das Produções');
  await porAsProducoes(s.db);
  for (const quem of [LIA, TOM, CARLA, DORA, RUI, COORD]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': quem } });
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    // SO=campanha roda só a etiqueta da campanha (#181)
    if (process.env.SO === 'campanha') return void (await aCampanha(navegador, s.url, s.api));
    // SO=caminhos roda só os caminhos da arte (#202)
    if (process.env.SO === 'caminhos') return void (await osCaminhosDaArte(navegador, s.url));
    await aSemanaNoSafari(navegador, s.url);
    await oSobrouPorPerfil(navegador, s.url, s.api);
    await aInfoNoBalao(navegador, s.url);
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
    await osContadores(navegador, s.url);
    await aCampanha(navegador, s.url, s.api);
    await osCaminhosDaArte(navegador, s.url);
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
