// Ponta a ponta da página da campanha e da lista das campanhas (#180), rodado à parte do vitest: `npm run e2e:campanhas`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o Teable falso: a produção
// da arte e a Pauta da edição, fictícias. A Lia (designer) cria as campanhas pela API; o Rui não tem papel (só lê).
// - A lista (#/campanhas): o caminho "Campanhas" no topo, um cartão por campanha com as contagens por etapa (sem a
//   arquivada) e quando foi mexida; a lupa filtra pelo nome sem caixa nem acento, e Esc limpa.
// - A página (#/campanhas/<id>): o nome, as contagens por etapa, as Produções nas três colunas (o card da agenda) com
//   o dia e o editor da Pauta, as arquivadas à parte, a lupa da página; o card abre no card aberto do centro.
// - Ligar a sugestão da mesma atração (ela voa até a coluna), com o Desfazer; ligar várias pela busca; tirar com o ×,
//   com o Desfazer; renomear (o nome se escreve de novo); a etiqueta na tela de Produções leva à página.
// - Os papéis: o Rui vê, sem os botões; a Lia (quem criou) apaga, volta para a lista, e o Desfazer traz de volta.
// - No celular, claro e escuro, sem rolar para o lado. Nenhum pedido ao Trello. Nada de "unha" nem de check verde.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:campanhas
// Com CAPTURAS=pasta, grava as capturas (densidade 2). Com VIDEO=pasta, grava o vídeo do movimento.
const assert = require('node:assert/strict');
const { mkdirSync, readdirSync, renameSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');
const RAIZ = join(__dirname, '..', '..');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:campanhas');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const RUI = 'rui.sem.cadastro@exemplo.com';
const CHEFE = 'chefe.ficticia@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VIDEO = process.env.VIDEO || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

const DIA = 86_400_000;
const agora = Date.now();
const dm = (n) => new Date(agora + n * DIA).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const diaSP = (n) => new Date(agora + n * DIA).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const ha = (n) => new Date(agora - n * DIA).toISOString();
const card = (n) => `c0ffee${String(n).padStart(18, '0')}`;
const linha = (id, fields) => ({ id, fields: { status: '[]', designers: null, arquivado: false, entregue: false, praca: null, filme: null, ...fields } });
const ARTE = [
  linha('recCampE2e1', { card_ID: card(1), claquete: `Novela Aurora Teaser ${dm(3)} SP`, artes: 'HOJE | AMANHÃ', data_entrada: ha(2) }),
  linha('recCampE2e2', { card_ID: card(2), claquete: `Novela Aurora Elenco ${dm(4)} SP`, status: '["PRODUZINDO"]', designers: '["Lia Moraes"]', artes: 'HOJE', prioridade: 'ALTA', data_entrada: ha(2) }),
  linha('recCampE2e3', { card_ID: card(3), claquete: `Novela Aurora Estreia ${dm(1)} SP`, status: '["FINALIZADO"]', designers: '["Caio Prates"]', entregue: true, artes: 'HOJE', data_entrada: ha(3), data_entrega: ha(1) }),
  linha('recCampE2e4', { card_ID: card(4), claquete: `Novela Aurora Abertura ${dm(5)} SP`, artes: 'VINHETA', data_entrada: ha(1) }),
  linha('recCampE2e5', { card_ID: card(5), claquete: `Novela Aurora Piloto ${dm(-2)} SP`, status: '["PRODUZINDO"]', arquivado: true, data_entrada: ha(6) }),
  linha('recCampE2e6', { card_ID: card(6), claquete: `Cozinha de Vó ${dm(2)} SP`, artes: 'VINHETA', data_entrada: ha(1) }),
  linha('recCampE2e7', { card_ID: card(7), claquete: `Show da Noite ${dm(3)} SP`, artes: 'HOJE', data_entrada: ha(1) }),
];
/** A Pauta da edição (fictícia): a claquete do Elenco daqui a dois dias, com a Carla. */
function naPauta(id, claquete, editor, dia) {
  const sp = (h) => new Date(`${dia}T${h}:00-03:00`).toISOString();
  return { id, fields: { claquete, key: claquete.toUpperCase(), editor: { id: `rec${editor.replace(/\W/g, '')}`, title: editor }, data: sp('00:00'), expediente_inicio: sp('06:00'), expediente_fim: sp('15:00'), anotacao: null, alterado_em: ha(0) } };
}
const PAUTA = [naPauta('recPautaE2e1', `Novela Aurora Elenco ${dm(4)}`, 'Carla Noite', diaSP(2))];

async function abrir(navegador, url, opcoes, hash, { email = LIA, video = '' } = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...(video ? { recordVideo: { dir: video, size: opcoes.viewport } } : {}), ...opcoes });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(email), url }]);
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
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(450);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: true });
};
const textos = async (l) => (await l.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
const hashDe = (p) => decodeURIComponent(new URL(p.url()).hash);
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
const contas = (p, onde) => p.locator(`${onde} .camp-contas li`).evaluateAll((ls) => ls.map((l) => [l.dataset.coluna, Number(l.querySelector('.prod-conta').textContent)]));
const coluna = (p, k) => p.locator(`.camp-bloco .prod-coluna[data-coluna="${k}"]`);
const claquetesDa = (p, k) => coluna(p, k).locator('.prod-claquete').evaluateAll((es) => es.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const cardDe = (p, texto) => p.locator('.camp-pagina .prod-card', { has: p.locator('.prod-claquete', { hasText: texto }) });
/** Nada de "unha" (faixa na borda esquerda) nos cartões, nos cards e nas linhas. */
async function semUnha(p, onde) {
  const unhas = await p.evaluate(() =>
    [...document.querySelectorAll('.camp-cartao-abrir, .prod-card, .prod-achado-abrir, .camp-ligar-dentro, .camp-bloco')].filter((e) => {
      const s = getComputedStyle(e);
      return parseFloat(s.borderLeftWidth) > 1.5 || /inset\s+\d+px\s+0/.test(s.boxShadow);
    }).length,
  );
  assert.equal(unhas, 0, `${onde}: nada de unha`);
}

async function naLista(navegador, url, ids) {
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, '#/campanhas');
  try {
    await p.locator('.camp-cartao').first().waitFor();
    assert.equal(await p.locator('.barra-topo nav.caminhos-do-topo a.topo-campanhas[aria-current="page"]').count(), 1, 'o caminho Campanhas no topo, aberto');
    assert.deepEqual(await textos(p.locator('.camp-cartao-nome')), ['Chamadas de elenco', 'AESP Verão', 'Lançamento Aurora'], 'a mexida por último primeiro');
    assert.deepEqual(await contas(p, `.camp-cartao[data-campanha="${ids.aurora}"]`), [['entrada', 1], ['produzindo', 1], ['entregue', 1]], 'as contagens sem a arquivada');
    assert.match(await p.locator(`.camp-cartao[data-campanha="${ids.aurora}"] .camp-cartao-pe`).textContent(), /3 produções\s*·\s*mexida agora há pouco/);
    await semUnha(p, 'a lista');
    await capturar(p, '01-lista-claro');
    // a lupa: "/" abre; filtra sem caixa nem acento; Esc limpa
    await p.keyboard.press('/');
    await p.keyboard.type('AURORA');
    await p.waitForFunction(() => document.querySelectorAll('.camp-cartao').length === 1);
    // os números contam até o novo
    await p.waitForFunction(() => /1 campanha\s*·\s*3 produções\s*com/.test(document.querySelector('.camp-resumo').textContent));
    await capturar(p, '02-lista-busca');
    await p.keyboard.type('x');
    await p.locator('.camp-nada', { hasText: 'nenhuma campanha com isso' }).waitFor();
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.querySelectorAll('.camp-cartao').length === 3);
    // abrir: o endereço da página
    await p.locator(`.camp-cartao[data-campanha="${ids.aurora}"] a`).click();
    await p.locator('.camp-titulo-nome', { hasText: 'Lançamento Aurora' }).waitFor();
    assert.equal(hashDe(p), `#/campanhas/${ids.aurora}`);
    // voltar pelo link e pelo voltar do navegador
    await p.locator('.camp-voltar').click();
    await p.locator('.camp-cartao').first().waitFor();
    await p.goBack();
    await p.locator('.camp-titulo-nome', { hasText: 'Lançamento Aurora' }).waitFor();
    assert.deepEqual(erros, []);
    assert.deepEqual(aoTrello, []);
  } finally {
    await ctx.close();
  }
}

async function naPagina(navegador, url, ids, video = '') {
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, `#/campanhas/${ids.aurora}`, { video });
  try {
    await p.locator('.camp-bloco .prod-card').first().waitFor();
    assert.deepEqual(await contas(p, '.camp-resumo-linha'), [['entrada', 1], ['produzindo', 1], ['entregue', 1]]);
    assert.deepEqual(await claquetesDa(p, 'entrada'), [`Novela Aurora Teaser ${dm(3)} SP`]);
    assert.deepEqual(await claquetesDa(p, 'produzindo'), [`Novela Aurora Elenco ${dm(4)} SP`]);
    assert.deepEqual(await claquetesDa(p, 'entregue'), [`Novela Aurora Estreia ${dm(1)} SP`]);
    // o card da agenda: os designers e o prazo; a Pauta da edição no pé (o dia à mão e o editor)
    const elenco = cardDe(p, 'Novela Aurora Elenco');
    assert.match(await elenco.locator('.prod-designers').textContent(), /Lia Moraes/);
    assert.match(await elenco.locator('.prod-prazo').textContent(), /ao ar/);
    assert.equal(await elenco.locator('.camp-na-pauta li').count(), 1, 'uma claquete na Pauta');
    assert.equal(await p.locator('.camp-na-pauta li').count(), 1, 'só o Elenco está na Pauta');
    assert.match(await elenco.locator('.camp-na-pauta-editor').textContent(), /Carla Noite/);
    assert.match(await p.locator('.camp-resumo').textContent(), /3 produções\s*·\s*1 na Pauta da edição\s*·\s*1 arquivada/);
    // a arquivada à parte; a sugestão da mesma atração
    assert.deepEqual(await textos(p.locator('.camp-sugestoes .prod-claquete')), [`Novela Aurora Abertura ${dm(5)} SP`]);
    await p.locator('.camp-arquivadas summary').click();
    assert.equal(await p.locator('.camp-arquivadas .prod-card').count(), 1);
    await semUnha(p, 'a página');
    await capturar(p, '03-pagina-claro');
    await p.locator('.camp-arquivadas summary').click();

    // ligar a sugestão: ela voa até a Entrada (desliza), as contagens contam, a caixinha abre
    const voou = p.evaluate(
      () =>
        new Promise((ok) => {
          const o = new MutationObserver(() => {
            const c = [...document.querySelectorAll('.camp-bloco .prod-card.deslizando')].some((e) => e.textContent.includes('Novela Aurora Abertura'));
            if (c) o.disconnect(), ok(true);
          });
          o.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
          setTimeout(() => ok(false), 4000);
        }),
    );
    await p.locator('.camp-sugestoes .prod-card', { hasText: 'Novela Aurora Abertura' }).getByRole('button', { name: 'Ligar à campanha' }).click();
    assert.equal(await voou, true, 'a sugestão desliza até a coluna');
    await coluna(p, 'entrada').locator('.prod-claquete', { hasText: 'Novela Aurora Abertura' }).waitFor();
    await p.locator('.desfazer', { hasText: 'entrou na campanha' }).waitFor();
    await p.waitForFunction(() => document.querySelector('.camp-resumo-linha [data-coluna="entrada"] .prod-conta')?.textContent === '2');
    assert.equal(await p.locator('.camp-sugestoes').count(), 0, 'sem sugestões agora');
    await capturar(p, '04-sugestao-ligada');
    await p.locator('.desfazer').getByRole('button', { name: 'Desfazer' }).click();
    await p.locator('.camp-sugestoes .prod-claquete', { hasText: 'Novela Aurora Abertura' }).waitFor();
    assert.deepEqual(await claquetesDa(p, 'entrada'), [`Novela Aurora Teaser ${dm(3)} SP`]);

    // ligar várias pela busca: a Cozinha e o Show; a que já está diz que já está
    await p.getByRole('button', { name: 'Ligar Produções' }).click();
    const painel = p.locator('.camp-ligar.aberto');
    await painel.waitFor();
    await painel.getByRole('searchbox', { name: 'Buscar Produções para ligar' }).fill('cozinha');
    await painel.locator('.prod-achado-abrir', { hasText: 'Cozinha de Vó' }).click();
    await painel.getByRole('searchbox').fill('noite');
    await painel.locator('.prod-achado-abrir', { hasText: 'Show da Noite' }).click();
    assert.equal(await painel.locator('.prod-achado-abrir.escolhida').count(), 1);
    assert.deepEqual(await textos(painel.locator('.camp-escolhida')), [`Cozinha de Vó ${dm(2)} SP`, `Show da Noite ${dm(3)} SP`]);
    await painel.getByRole('searchbox').fill('aurora teaser');
    await painel.locator('.prod-achado-abrir.ja-esta', { hasText: 'já está na campanha' }).waitFor();
    await semUnha(p, 'o ligar Produções');
    await capturar(p, '05-ligar-varias');
    await painel.getByRole('button', { name: 'Ligar 2 Produções' }).click();
    await coluna(p, 'entrada').locator('.prod-claquete', { hasText: 'Show da Noite' }).waitFor();
    await coluna(p, 'entrada').locator('.prod-claquete', { hasText: 'Cozinha de Vó' }).waitFor();
    await p.locator('.desfazer', { hasText: '2 Produções entraram na campanha' }).waitFor();
    await p.locator('.camp-ligar:not(.aberto)').waitFor({ state: 'attached' });
    // a Cozinha está em duas campanhas: a etiqueta mostra a primeira e "+1"
    assert.equal((await cardDe(p, 'Cozinha de Vó').locator('.campanha-mais').textContent()).trim(), '+1');

    // tirar com o ×: sai na hora, os vizinhos fecham o espaço; o Desfazer traz de volta
    await cardDe(p, 'Show da Noite').hover();
    await cardDe(p, 'Show da Noite').getByRole('button', { name: /Tirar .*Show da Noite.* da campanha/ }).click();
    await cardDe(p, 'Show da Noite').waitFor({ state: 'detached' });
    await p.locator('.desfazer', { hasText: 'saiu da campanha' }).waitFor();
    await capturar(p, '06-tirou');
    await p.locator('.desfazer').getByRole('button', { name: 'Desfazer' }).click();
    await cardDe(p, 'Show da Noite').waitFor();

    // renomear: o lápis, Enter salva, e o nome se escreve de novo
    await p.locator('.camp-titulo').hover();
    await p.getByRole('button', { name: 'Renomear Lançamento Aurora' }).click();
    const nome = p.getByRole('textbox', { name: 'O nome da campanha' });
    await nome.fill('Lançamento Aurora 2027');
    await capturar(p, '07-renomear');
    await nome.press('Enter');
    await p.locator('.camp-titulo-nome', { hasText: 'Lançamento Aurora 2027' }).waitFor();
    assert.deepEqual(await textos(cardDe(p, 'Novela Aurora Teaser').locator('.campanha-nome')), ['Lançamento Aurora 2027'], 'a etiqueta já com o nome novo');

    // a lupa da página: filtra os cards nas colunas
    await p.keyboard.press('/');
    await p.keyboard.type('elenco');
    await p.waitForFunction(() => document.querySelectorAll('.camp-bloco .prod-card').length === 1);
    await capturar(p, '08-pagina-busca');
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.querySelectorAll('.camp-bloco .prod-card').length > 1);

    // o card abre no card aberto do centro; Esc fecha e o foco volta
    await cardDe(p, 'Novela Aurora Elenco').locator('.prod-atracao').click();
    await p.locator('.card-aberto[role="dialog"]').waitFor();
    await p.waitForTimeout(400);
    await capturar(p, '09-card-aberto');
    await p.keyboard.press('Escape');
    await p.locator('.card-aberto').waitFor({ state: 'detached' });
    if (video) await p.waitForTimeout(600);
    assert.deepEqual(erros, []);
    assert.deepEqual(aoTrello, []);
  } finally {
    await ctx.close();
  }
}

async function pelaEtiqueta(navegador, url, ids) {
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 900 } }, '#/designer/producoes');
  try {
    // no card da tela, a etiqueta filtra (#179); no card aberto, ela leva à página da campanha
    const cozinha = p.locator('.prod-card', { has: p.locator('.prod-claquete', { hasText: 'Cozinha de Vó' }) });
    await cozinha.locator('.prod-atracao').click();
    await p.locator('.card-aberto[role="dialog"]').waitFor();
    await p.locator('.card-aberto').getByRole('button', { name: 'Abrir a campanha AESP Verão' }).click();
    await p.locator('.camp-titulo-nome', { hasText: 'AESP Verão' }).waitFor();
    assert.equal(hashDe(p), `#/campanhas/${ids.aesp}`, 'a etiqueta leva à página da campanha');
    assert.equal(await p.locator('.card-aberto').count(), 0, 'o card aberto fechou com a troca de tela');
    assert.equal(await p.evaluate(() => document.documentElement.style.overflow), '', 'a página rola de novo');
    assert.deepEqual(erros, []);
  } finally {
    await ctx.close();
  }
}

async function osPapeis(navegador, url, ids) {
  // o Rui só lê: sem lápis, sem ligar, sem apagar, sem tirar, sem sugestões
  {
    const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 900 } }, `#/campanhas/${ids.aurora}`, { email: RUI });
    try {
      await p.locator('.camp-bloco .prod-card').first().waitFor();
      for (const s of ['.camp-lapis', '.camp-abrir-ligar', '.camp-apagar', '.camp-tirar', '.camp-sugestoes']) assert.equal(await p.locator(s).count(), 0, `o Rui não tem ${s}`);
      await p.goto(`${url}#/campanhas`);
      await p.locator('.camp-cartao').first().waitFor();
      assert.equal(await p.locator('.camp-nova').count(), 0, 'o Rui não cria');
      assert.deepEqual(erros, []);
    } finally {
      await ctx.close();
    }
  }
  // a Lia criou: apaga, volta para a lista com o Desfazer, e ele traz a campanha de volta
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 900 } }, `#/campanhas/${ids.aesp}`);
  try {
    await p.locator('.camp-titulo-nome', { hasText: 'AESP Verão' }).waitFor();
    await p.getByRole('button', { name: 'Apagar a campanha AESP Verão' }).click();
    await p.locator('.desfazer', { hasText: 'A campanha AESP Verão foi apagada' }).waitFor();
    assert.equal(hashDe(p), '#/campanhas');
    await p.waitForFunction(() => ![...document.querySelectorAll('.camp-cartao-nome')].some((e) => e.textContent.includes('AESP')));
    await capturar(p, '10-apagada-desfazer');
    await p.locator('.desfazer').getByRole('button', { name: 'Desfazer' }).click();
    await p.locator('.camp-cartao-nome', { hasText: 'AESP Verão' }).waitFor();
    // criar pela lista: o nome, Enter, e a página da nova
    await p.getByRole('button', { name: 'Nova campanha' }).click();
    await p.getByRole('textbox', { name: 'O nome da campanha nova' }).fill('Chamadas de Natal');
    await p.keyboard.press('Enter');
    await p.locator('.camp-titulo-nome', { hasText: 'Chamadas de Natal' }).waitFor();
    assert.match(await p.locator('.camp-bloco').textContent(), /nada aqui/);
    assert.deepEqual(erros, []);
  } finally {
    await ctx.close();
  }
}

async function noCelularEEscuro(navegador, url, ids) {
  for (const tema of ['light', 'dark']) {
    const { ctx, p, erros } = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: tema }, '#/campanhas');
    try {
      await p.locator('.camp-cartao').first().waitFor();
      await semRolagemDeLado(p, `a lista no celular (${tema})`);
      await capturar(p, `11-celular-lista-${tema}`);
      await p.goto(`${url}#/campanhas/${ids.aurora}`);
      await p.locator('.camp-bloco .prod-card').first().waitFor();
      await semRolagemDeLado(p, `a página no celular (${tema})`);
      await capturar(p, `12-celular-pagina-${tema}`);
      assert.deepEqual(erros, []);
    } finally {
      await ctx.close();
    }
  }
  const { ctx, p } = await abrir(navegador, url, { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }, `#/campanhas/${ids.aurora}`);
  try {
    await p.locator('.camp-bloco .prod-card').first().waitFor();
    await capturar(p, '13-pagina-escuro');
    await p.goto(`${url}#/campanhas`);
    await p.locator('.camp-cartao').first().waitFor();
    await capturar(p, '14-lista-escuro');
  } finally {
    await ctx.close();
  }
}

async function principal() {
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const { comTabelas } = await import(join(RAIZ, 'servidor', 'tabelas-do-teable.mjs'));
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const DESIGNERS = [
    { id: 'recDesignerE2e', fields: { designer: 'Lia Moraes', email: LIA, designer_ID: 'membroLia', status: 'ativo' } },
    { id: 'recDesignerCaioE2e', fields: { designer: 'Caio Prates', email: 'caio.prates@exemplo.com', designer_ID: 'membroCaio', status: 'ativo' } },
  ];
  const teable = teableFalso({ ARTE_producao: 'arte_e2e', designers: 'designers_e2e', atracoes: 'atracoes_e2e', EDICAO_producao: 'pauta_e2e' }, { registros: { ARTE_producao: ARTE, designers: DESIGNERS, atracoes: [], EDICAO_producao: PAUTA } });
  const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
  const buscar = async (u) => {
    throw new Error(`o teste não sai para a rede: ${u}`);
  };
  const trello = { env: { ...PG, ...comTabelas({ ARTE_producao: 'arte_e2e' }), TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso' }, consultar: teable.consultar, buscar };
  const s = await subir({ teable, pg: teable.abrirPg, trello, cadastros: (env) => criarCadastros(env, { buscar: teable }), env: { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, ...PG, TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP' } });
  await s.app.pessoasProntas;
  const carga = await fetch(`${s.api}/producoes/recarregar`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': CHEFE } });
  assert.equal(carga.status, 200, 'a carga das Produções');
  for (const e of [LIA, RUI, CHEFE]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': e } });
  // a atração escolhida no card aberto (#160): as da Aurora juntas
  const idDe = (inicio) => s.db.prepare('SELECT id FROM producoes WHERE claquete LIKE ?').get(`${inicio}%`).id;
  for (const k of ['Novela Aurora Teaser', 'Novela Aurora Elenco', 'Novela Aurora Estreia', 'Novela Aurora Abertura', 'Novela Aurora Piloto']) s.db.prepare('UPDATE producoes SET atracao = ? WHERE id = ?').run('Novela Aurora', idDe(k));
  // as campanhas, criadas pela Lia (a designer) pela API
  const comoLia = (caminho, corpo) => fetch(`${s.api}${caminho}`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/json' }, body: JSON.stringify(corpo) }).then((r) => r.json());
  const criar = async (nome, ligadas) => {
    const { campanha } = await comoLia('/campanhas', { nome });
    if (ligadas.length) await comoLia(`/campanhas/${campanha.id}/producoes`, { producoes: ligadas.map(idDe), liga: true });
    await new Promise((ok) => setTimeout(ok, 15));
    return campanha.id;
  };
  const aurora = await criar('Lançamento Aurora', ['Novela Aurora Teaser', 'Novela Aurora Elenco', 'Novela Aurora Estreia']);
  // a arquivada continua na campanha (ligada antes de arquivar)
  s.db.prepare('INSERT INTO campanhas_producoes (campanha_id, producao_id, ligada_por, ligada_em) VALUES (?, ?, ?, ?)').run(aurora, idDe('Novela Aurora Piloto'), LIA, new Date().toISOString());
  const aesp = await criar('AESP Verão', ['Cozinha de Vó']);
  await criar('Chamadas de elenco', []);
  const ids = { aurora, aesp };
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    await naLista(navegador, s.url, ids);
    await naPagina(navegador, s.url, ids);
    await pelaEtiqueta(navegador, s.url, ids);
    await noCelularEEscuro(navegador, s.url, ids);
    await osPapeis(navegador, s.url, ids);
    if (VIDEO) {
      // o vídeo do movimento: a página de novo (o nome volta para o de antes), com a sugestão, o ligar e o tirar
      await comoLia(`/campanhas/${aurora}/nome`, { nome: 'Lançamento Aurora' });
      await comoLia(`/campanhas/${aurora}/producoes`, { producoes: ['Cozinha de Vó', 'Show da Noite'].map(idDe), liga: false });
      const pasta = join(VIDEO, 'bruto');
      await naPagina(navegador, s.url, ids, pasta);
      const [arquivo] = readdirSync(pasta).filter((n) => n.endsWith('.webm'));
      if (arquivo) renameSync(join(pasta, arquivo), join(VIDEO, 'campanhas.webm'));
    }
    console.log('e2e campanhas: ok');
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
