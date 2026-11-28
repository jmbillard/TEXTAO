// Ponta a ponta do ver o Roteiro sendo escrito (#193): Texto | Colunas, o modo limpo e o .docx igual a ele. Rodado à
// parte do vitest: `npm run e2e:colunas`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros sobre um Teable
// falso. A Marina (redatora, claro) escreve um roteiro com o "/" e o Ctrl+U; a Bia (coordenação, escuro) abre o mesmo
// roteiro na sala ao vivo. A Marina passa para "Colunas": os trechos andam até a coluna deles (FLIP), o vídeo à
// esquerda, o áudio à direita, a locação na linha inteira. Ela escreve nas colunas e a Bia, no texto, recebe; a Bia
// troca o tipo de um trecho (Tab) e ele muda de coluna na folha da Marina. O modo limpo (Ctrl+Shift+L e o botão)
// esconde tudo menos a folha, com Arial 11, a locução em caixa alta, a arte sublinhada em negrito, a sonora em negrito e
// a locação sublinhada; o "/" continua; em colunas, é a tabela de bordas pretas. O .docx baixado sai igual, em texto e
// em colunas. Com o movimento reduzido, a troca vai direto, sem animação. Claro e escuro, sem "unha" e sem ✓ verde.
//
// Nomes e e-mails fictícios. Precisa do Playwright com o Chromium, instalado globalmente:
// NODE_PATH=$(npm root -g) npm run e2e:colunas
// Com CAPTURAS=pasta, grava as capturas (densidade 2) e os vídeos da troca texto ↔ colunas e da entrada no limpo.
const assert = require('node:assert/strict');
const { mkdirSync, readFileSync, renameSync } = require('node:fs');
const { join } = require('node:path');
const JSZip = require('jszip');
const { subir } = require('./tour.e2e.cjs');
const { checksVerdes } = require('./coerencia.cjs');
const RAIZ = join(__dirname, '..', '..');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:colunas');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const MARINA = 'marina.teles@exemplo.com';
const BIA = 'bia.prado@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };
const ID = 'colunas-e-limpo-1';
const TAMANHO = { width: 1280, height: 860 };

const ENV_CADASTROS = { TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'falso', TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };
const TABELAS = { tblRed: [{ id: 'recR1', fields: { redator: 'Marina Teles', email: MARINA } }], tblKeyRed: [], tblEdi: [], tblKeyEdi: [] };
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  if (u.host !== 'teable-falso' || (init.method ?? 'GET') !== 'GET') throw new Error(`o teste não sai para a rede: ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(u.pathname);
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
}

async function abrir(navegador, url, email, tema, { nomeDoVideo, reduzido } = {}) {
  const video = CAPTURAS && nomeDoVideo ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: TAMANHO } } : {};
  const ctx = await navegador.newContext({
    viewport: TAMANHO,
    colorScheme: tema,
    acceptDownloads: true,
    ...(reduzido ? { reducedMotion: 'reduce' } : {}),
    extraHTTPHeaders: { 'cf-access-authenticated-user-email': email },
    ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}),
    ...video,
  });
  // o WebSocket do navegador não leva o cabeçalho: o servidor do teste lê o e-mail do cookie
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(email), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/roteiros/${ID}`);
  await liberada(p);
  return { ctx, p, erros, nomeDoVideo };
}
const liberada = (p) => p.waitForSelector('.folha-escrita:not(.chegando)', { timeout: 15000 });
const salvou = (p) => p.waitForSelector('.escrita-salvo[data-salvamento="salvo"]', { timeout: 8000 });
/** Os trechos na ordem do documento, com a coluna (nas colunas) e o lugar na tela. */
const trechos = (p) =>
  p.evaluate(() => {
    const els = [...document.querySelectorAll('.texto-escrita > p')];
    return els.map((el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll('.collaboration-cursor__caret').forEach((x) => x.remove());
      const r = el.getBoundingClientRect();
      return { texto: c.textContent, tipo: el.dataset.tipo, coluna: el.dataset.coluna ?? null, x: Math.round(r.left), w: Math.round(r.width), y: Math.round(r.top) };
    });
  });
const esperarTextos = async (p, esperado, oQue) => {
  try {
    await p.waitForFunction(
      (e) =>
        JSON.stringify(
          [...document.querySelectorAll('.texto-escrita > p')].map((el) => {
            const c = el.cloneNode(true);
            c.querySelectorAll('.collaboration-cursor__caret').forEach((x) => x.remove());
            return c.textContent;
          }),
        ) === JSON.stringify(e),
      esperado,
      { timeout: 8000 },
    );
  } catch {
    assert.fail(`${oQue}: esperava ${JSON.stringify(esperado)}, está ${JSON.stringify((await trechos(p)).map((t) => t.texto))}`);
  }
};
/** Põe o cursor no fim do trecho n (0 é o primeiro; -1, o último). */
const noFimDo = async (p, n) => {
  await p.evaluate((i) => {
    const alvo = [...document.querySelectorAll('.texto-escrita > p')].at(i);
    const sel = getSelection();
    const r = document.createRange();
    r.selectNodeContents(alvo);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    alvo.closest('.texto-escrita').focus();
  }, n);
  // o editor lê a seleção nova no selectionchange, um instante depois
  await p.waitForTimeout(120);
};
/** Seleciona um pedaço do texto de um trecho (para o Ctrl+U na frase). */
const selecionar = (p, n, pedaco) =>
  p.evaluate(
    ([i, t]) => {
      const alvo = [...document.querySelectorAll('.texto-escrita > p')].at(i);
      const no = [...alvo.childNodes].find((x) => x.nodeType === 3 && x.nodeValue.includes(t)) ?? alvo.firstChild;
      const ini = no.nodeValue.indexOf(t);
      const r = document.createRange();
      r.setStart(no, ini);
      r.setEnd(no, ini + t.length);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      alvo.closest('.texto-escrita').focus();
    },
    [n, pedaco],
  );
/** Um trecho novo, com o comando do "/" (vazio: o palpite pelo texto). */
async function trecho(p, comando, texto) {
  if (comando) {
    await p.keyboard.type(`/${comando}`, { delay: 15 });
    await p.waitForSelector(`.menu-da-barra .menu-item.ativo[data-comando="${comando}"]`);
    await p.keyboard.press('Enter');
  }
  await p.keyboard.type(texto, { delay: 6 });
}
async function semUnha(p, onde) {
  const unhas = await p.evaluate(() =>
    [...document.querySelectorAll('.folha-escrita *, .escrita-barra *, .folha-escrita, .sair-do-limpo *')].filter((e) => {
      if (e.closest('.collaboration-cursor__caret')) return false;
      const c = getComputedStyle(e);
      const borda = parseFloat(c.borderLeftWidth) >= 3 && c.borderLeftStyle !== 'none' && c.borderLeftColor !== c.borderTopColor;
      const sombra = /inset\s+([3-9]|\d{2,})px\s+0/.test(c.boxShadow);
      return borda || sombra;
    }).map((e) => e.className),
  );
  assert.deepEqual(unhas, [], `${onde}: nada de unha`);
}
const capturar = async (p, nome, inteira = false) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(700);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: inteira });
};
const fechar = async ({ ctx, p, nomeDoVideo }) => {
  const caminho = await p.video()?.path();
  await ctx.close();
  if (caminho && nomeDoVideo) renameSync(caminho, join(CAPTURAS, `${nomeDoVideo}.webm`));
};
/** Quantos trechos estão andando agora (a animação do FLIP). */
const andando = (p) => p.evaluate(() => [...document.querySelectorAll('.texto-escrita > p')].filter((el) => el.getAnimations().length).length);
/** O .docx baixado: os parágrafos (com a tabela, se houver) e o XML do corpo. */
async function baixarDocx(p, botao) {
  const [download] = await Promise.all([p.waitForEvent('download'), p.click(botao)]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const xml = await zip.file('word/document.xml').async('string');
  return { nome: download.suggestedFilename(), xml };
}

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: LIA }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: LIA } });
  const como = (email) => (caminho, init = {}) => fetch(`${s.api}${caminho}`, { ...init, headers: { 'content-type': 'application/json', 'cf-access-authenticated-user-email': email, ...init.headers } });
  for (const email of [LIA, MARINA, BIA]) await como(email)('/eu/tour', { method: 'POST' });
  assert.equal((await como(LIA)('/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: BIA }) })).status, 200);
  assert.equal((await como(MARINA)('/roteiros-escritos', { method: 'POST', body: JSON.stringify({ id: ID, titulo: 'Desafio da Brasa, a final' }) })).status, 201);

  const navegador = await chromium.launch();
  try {
    // a Marina escreve o roteiro com o "/" e o Ctrl+U
    const marina = await abrir(navegador, s.url, MARINA, 'light', { nomeDoVideo: 'colunas-e-limpo-marina' });
    await marina.p.waitForFunction(() => document.activeElement?.closest('.texto-escrita') !== null);
    await trecho(marina.p, 'locacao', 'Galpão da final');
    await marina.p.keyboard.press('Enter');
    await trecho(marina.p, 'edicao', 'Abre no fogo acendendo; close na brasa. Do bruto: \\\\srv-promo\\brutos\\CAM_A_014.mxf aos 1\'20\'\'');
    await marina.p.keyboard.press('Enter');
    await trecho(marina.p, '', 'TRILHA: batida da casa entrando junto com o fogo.');
    await marina.p.keyboard.press('Enter');
    await trecho(marina.p, 'locucao', 'neste sábado, a brasa decide.');
    await marina.p.keyboard.press('Enter');
    await trecho(marina.p, 'arte', 'DESAFIO DA BRASA');
    await marina.p.keyboard.press('Enter');
    await trecho(marina.p, 'locucao', 'oito churrasqueiros. um só título.');
    await selecionar(marina.p, -1, 'oito churrasqueiros');
    // o editor lê a seleção nova no selectionchange, um instante depois
    await marina.p.waitForTimeout(150);
    await marina.p.keyboard.press('Control+u');
    await noFimDo(marina.p, -1);
    await marina.p.keyboard.press('Enter');
    await trecho(marina.p, '', 'Dona Zélia, de Pelotas: aqui ninguém leva carne crua pra casa, não! 00:12:41:08');
    await marina.p.keyboard.press('Enter');
    await trecho(marina.p, 'locacao', 'Bancada dos jurados');
    await marina.p.keyboard.press('Enter');
    await trecho(marina.p, '', 'E A FINAL TEM JURADO NOVO NA BANCADA.');
    await salvou(marina.p);
    const escritos = (await trechos(marina.p)).map((t) => `${t.tipo}: ${t.texto}`);
    assert.equal(escritos.length, 9, `nove trechos: ${JSON.stringify(escritos)}`);
    if (process.env.DEPURAR) console.log(escritos);
    assert.deepEqual(
      (await trechos(marina.p)).map((t) => t.tipo),
      ['locacao', 'edicao', 'trilha', 'locucao', 'arte', 'locucao', 'sonora', 'locacao', 'locucao'],
    );
    await capturar(marina.p, '01-texto-claro');
    console.log('ok: o roteiro escrito com o "/" e o Ctrl+U');

    // a Bia (escuro) chega pela sala
    const bia = await abrir(navegador, s.url, BIA, 'dark', { nomeDoVideo: 'colunas-e-limpo-bia' });
    const textos = (await trechos(marina.p)).map((t) => t.texto);
    await esperarTextos(bia.p, textos, 'a Bia recebe o texto');

    // Colunas: os trechos andam até a coluna deles
    await marina.p.evaluate(() => scrollTo(0, 0));
    await marina.p.click('.escrita-ver [role="radio"]:has-text("Colunas")');
    assert.ok((await andando(marina.p)) > 0, 'a troca anda (FLIP)');
    await marina.p.waitForFunction(() => [...document.querySelectorAll('.texto-escrita > p')].every((el) => !el.getAnimations().length), null, { timeout: 4000 });
    const nas = await trechos(marina.p);
    assert.deepEqual(
      nas.map((t) => t.coluna),
      ['linha', 'video', 'audio', 'audio', 'video', 'audio', 'audio', 'linha', 'audio'],
    );
    const video = nas.filter((t) => t.coluna === 'video');
    const audio = nas.filter((t) => t.coluna === 'audio');
    const linha = nas.filter((t) => t.coluna === 'linha');
    assert.ok(video.every((v) => audio.every((a) => v.x < a.x)), 'o vídeo à esquerda do áudio');
    assert.ok(linha.every((l) => l.w > video[0].w + audio[0].w - 4), 'a locação na linha inteira');
    // o vídeo e o áudio do mesmo grupo lado a lado: a edição e a trilha na mesma altura
    assert.equal(nas[1].y, nas[2].y, 'a edição e a trilha lado a lado');
    assert.equal(await marina.p.locator('.texto-escrita .celula-vazia').count(), 1, 'o grupo da bancada não tem vídeo: a célula vazia');
    // o rótulo do tipo vai junto, no começo do trecho
    const rotulos = await marina.p.evaluate(() => [...document.querySelectorAll('.tipo-na-margem')].map((b) => Math.round(b.getBoundingClientRect().left)));
    assert.ok(rotulos[2] > rotulos[1] + 200, 'o rótulo da trilha está na coluna do áudio');
    await semUnha(marina.p, 'as colunas (claro)');
    await capturar(marina.p, '02-colunas-claro');
    console.log('ok: as colunas, com a locação na linha inteira e a animação');

    // escrever nas colunas é escrever no texto: a Bia, no texto, recebe
    await noFimDo(marina.p, 3);
    await marina.p.keyboard.type(' E É AO VIVO.', { delay: 10 });
    textos[3] = `${textos[3]} E É AO VIVO.`;
    await esperarTextos(bia.p, textos, 'a Bia, no texto, recebe o que a Marina escreve nas colunas');
    // a Bia troca o tipo da trilha para produção (Tab até lá): na folha da Marina, ele muda para o vídeo
    await noFimDo(bia.p, 2);
    await bia.p.keyboard.press('Tab'); // confirma a trilha
    for (let i = 0; i < 2; i++) await bia.p.keyboard.press('Tab'); // locutor, produção
    await marina.p.waitForFunction(() => document.querySelectorAll('.texto-escrita > p')[2]?.dataset.coluna === 'video', null, { timeout: 8000 });
    // e volta para a trilha
    for (let i = 0; i < 2; i++) await bia.p.keyboard.press('Shift+Tab');
    await marina.p.waitForFunction(() => document.querySelectorAll('.texto-escrita > p')[2]?.dataset.coluna === 'audio', null, { timeout: 8000 });
    console.log('ok: escrever nas colunas é o mesmo documento, também na sala');

    // a Bia também vê em colunas (escuro)
    await bia.p.evaluate(() => scrollTo(0, 0));
    await bia.p.click('.escrita-ver [role="radio"]:has-text("Colunas")');
    await bia.p.waitForFunction(() => document.querySelectorAll('.texto-escrita > p[data-coluna]').length === 9);
    await semUnha(bia.p, 'as colunas (escuro)');
    assert.deepEqual(await checksVerdes(bia.p), []);
    await capturar(bia.p, '03-colunas-escuro');

    // o modo limpo, em colunas: Ctrl+Shift+L com o cursor no texto
    await noFimDo(marina.p, -1);
    await marina.p.keyboard.press('Control+Shift+L');
    await marina.p.waitForSelector('.pagina-escrita.limpo');
    await marina.p.waitForTimeout(600);
    const escondidos = await marina.p.evaluate(() =>
      ['.escrita-barra', '.escrita-lado', '.rodape-da-escrita', '.margem-dos-tipos', '.escrita-ver', '.botao-atalhos', '.topo'].filter((q) => {
        const el = document.querySelector(q);
        return el && el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none';
      }),
    );
    assert.deepEqual(escondidos, [], 'no limpo, só a folha');
    const tabela = await marina.p.evaluate(() => {
      const ps = [...document.querySelectorAll('.texto-escrita > p')];
      const c = (el) => getComputedStyle(el);
      return {
        fonte: c(ps[3]).fontFamily,
        tamanho: c(ps[3]).fontSize,
        borda: c(ps[1]).borderTopColor,
        bordaLargura: c(ps[1]).borderTopWidth,
        locucao: c(ps[3]).textTransform,
        sonora: c(ps[6]).fontWeight,
        locacao: c(ps[0]).textDecorationLine,
        arte: c(ps[5].querySelector('u.arte')).fontWeight,
        arteSublinhada: c(ps[5].querySelector('u.arte')).textDecorationLine,
      };
    });
    assert.match(tabela.fonte, /^Arial/);
    assert.equal(tabela.tamanho, '14.6667px', 'Arial 11');
    assert.equal(tabela.borda, 'rgb(0, 0, 0)', 'as bordas pretas');
    assert.equal(tabela.bordaLargura, '1px');
    assert.equal(tabela.locucao, 'uppercase');
    assert.equal(tabela.sonora, '700');
    assert.equal(tabela.locacao, 'underline');
    assert.equal(tabela.arte, '700');
    assert.equal(tabela.arteSublinhada, 'underline');
    await semUnha(marina.p, 'o limpo em colunas');
    await capturar(marina.p, '04-limpo-colunas-claro', true);
    // o "/" continua no limpo
    await marina.p.keyboard.press('Enter');
    await marina.p.keyboard.type('/son', { delay: 20 });
    await marina.p.waitForSelector('.menu-da-barra .menu-item.ativo[data-comando="sonora"]');
    await marina.p.keyboard.press('Enter');
    await marina.p.keyboard.type('Seu Tião, da Bancada: a brasa não perdoa.', { delay: 5 });
    await marina.p.waitForFunction(() => [...document.querySelectorAll('.texto-escrita > p')].at(-1)?.dataset.tipo === 'sonora');
    textos.push('Seu Tião, da Bancada: a brasa não perdoa.');
    await esperarTextos(bia.p, textos, 'o que se escreve no limpo chega à Bia');
    console.log('ok: o modo limpo em colunas é a tabela de bordas pretas, e o "/" continua');

    // o .docx do limpo em colunas: a tabela
    const emColunas = await baixarDocx(marina.p, '.sair-do-limpo button:has-text(".docx")');
    assert.match(emColunas.nome, /\.docx$/);
    assert.match(emColunas.xml, /<w:tbl>/);
    assert.match(emColunas.xml, /NESTE SÁBADO, A BRASA DECIDE\. E É AO VIVO\./);
    assert.match(emColunas.xml, /w:color="000000"/);
    console.log('ok: o .docx em colunas é a tabela');

    // o limpo em texto: sai das colunas pelo botão de sair, troca para o texto e volta ao limpo pelo botão
    await marina.p.click('.sair-do-limpo button:has-text("Sair do modo limpo")');
    await marina.p.waitForSelector('.pagina-escrita:not(.limpo)');
    await marina.p.evaluate(() => scrollTo(0, 0));
    await marina.p.click('.escrita-ver [role="radio"]:has-text("Texto")');
    await marina.p.waitForFunction(() => !document.querySelector('.texto-escrita > p[data-coluna]'));
    await marina.p.click('.escrita-ver-limpo');
    await marina.p.waitForSelector('.pagina-escrita.limpo');
    const corrido = await marina.p.evaluate(() => {
      const ps = [...document.querySelectorAll('.texto-escrita > p')];
      return { borda: getComputedStyle(ps[1]).borderTopWidth, fichaPasta: getComputedStyle(ps[1].querySelector('.ficha-do-texto-pasta') ?? ps[1]).display };
    });
    assert.equal(corrido.borda, '0px', 'no texto, sem tabela');
    assert.equal(corrido.fichaPasta, 'inline', 'o caminho inteiro do arquivo, como no .docx');
    await capturar(marina.p, '05-limpo-texto-claro', true);
    const emTexto = await baixarDocx(marina.p, '.sair-do-limpo button:has-text(".docx")');
    assert.doesNotMatch(emTexto.xml, /<w:tbl>/);
    assert.match(emTexto.xml, /NESTE SÁBADO, A BRASA DECIDE\. E É AO VIVO\./);
    assert.match(emTexto.xml, /OITO CHURRASQUEIROS/);
    console.log('ok: o modo limpo em texto e o .docx igual');
    await marina.p.keyboard.press('Control+Shift+L');
    await marina.p.waitForSelector('.pagina-escrita:not(.limpo)');

    // a Bia no limpo (escuro), em colunas
    await bia.p.keyboard.press('Control+Shift+L');
    await bia.p.waitForSelector('.pagina-escrita.limpo');
    await capturar(bia.p, '06-limpo-colunas-escuro', true);
    await bia.p.click('.sair-do-limpo button:has-text("Sair do modo limpo")');
    await bia.p.evaluate(() => scrollTo(0, 0));
    await bia.p.click('.escrita-ver [role="radio"]:has-text("Texto")');
    await bia.p.click('.escrita-ver-limpo');
    await bia.p.waitForSelector('.pagina-escrita.limpo');
    await capturar(bia.p, '07-limpo-texto-escuro', true);
    assert.deepEqual(await checksVerdes(bia.p), []);

    assert.deepEqual(marina.erros, []);
    assert.deepEqual(bia.erros, []);
    await Promise.all([salvou(marina.p), bia.p.waitForTimeout(300)]);
    await fechar(marina);
    await fechar(bia);

    // com o movimento reduzido, a troca vai direto
    const quieta = await abrir(navegador, s.url, MARINA, 'light', { reduzido: true });
    await quieta.p.click('.escrita-ver [role="radio"]:has-text("Colunas")');
    assert.equal(await andando(quieta.p), 0, 'sem a animação');
    await quieta.p.waitForFunction(() => document.querySelectorAll('.texto-escrita > p[data-coluna]').length === 10);
    await quieta.p.keyboard.press('Control+Shift+L');
    await quieta.p.waitForSelector('.pagina-escrita.limpo');
    // (com o movimento reduzido, a folha de estilos dá 0,01 ms a toda transição: conta só o que dura de verdade)
    const doLimpo = await quieta.p.evaluate(() =>
      document.getAnimations().filter((a) => String(a.effect?.pseudoElement ?? '').startsWith('::view-transition') || Number(a.effect?.getComputedTiming().duration) > 1).length,
    );
    assert.equal(doLimpo, 0, 'o limpo entra sem animação (nem a transição da página)');
    assert.deepEqual(quieta.erros, []);
    await quieta.ctx.close();
    console.log('ok: com o movimento reduzido, tudo vai direto');

    // no celular, as colunas e o limpo cabem, sem rolar para o lado
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 800 }, colorScheme: 'dark', extraHTTPHeaders: { 'cf-access-authenticated-user-email': MARINA }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}) });
    await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(MARINA), url: s.url }]);
    await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
    const cel = await ctx.newPage();
    await cel.goto(`${s.url}#/roteiros/${ID}`);
    await liberada(cel);
    await cel.click('.escrita-ver [role="radio"]:has-text("Colunas")');
    const sobra = () => cel.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.equal(await sobra(), 0, 'as colunas no celular cabem');
    await capturar(cel, '08-colunas-celular-escuro');
    await cel.click('.escrita-ver-limpo');
    await cel.waitForSelector('.pagina-escrita.limpo');
    assert.equal(await sobra(), 0, 'o limpo no celular cabe');
    await capturar(cel, '09-limpo-celular-escuro');
    await ctx.close();
    console.log('ok: no celular, cabe');
  } finally {
    await navegador.close();
    await s.descer();
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
