// Ponta a ponta do editor no celular (spec #42, ticket #43), rodado à parte do vitest: `npm run e2e:editor`.
//
// Sobe o servidor e o Vite como o e2e do tour (banco temporário, dados fictícios), com o Trello e o Teable falsos: os
// pedidos ficam guardados aqui e nada sai para a rede. Abre um roteiro fictício em tamanho de iPhone e de Android e,
// tocando como a pessoa faria, confere a ordem da página (topo, ficha, "Para revisar", texto, lista, barra), a ficha e
// as pendências que abrem e recolhem, que digitar no texto não muda nada, o fogo que sobe, a bolinha que marca "já
// existe", o toque no nome que leva à arte no texto e a barra de baixo (a maior complexidade e a contagem). No texto
// (#44): uma seleção nativa, como a do dedo, mostra o botão "Arte" embaixo do trecho, e tocar nele marca o trecho
// ajustado (palavras inteiras) como arte, que entra na lista; tocar numa arte mostra "Arte N · Desmarcar", acende a
// linha dela, acompanha o trecho quando a página rola e desmarca; um toque fora fecha. No iPhone, envia pelo Enviar da
// barra e confere o que chegou ao Trello e à produção da arte: as artes do checklist (a marcada pelo dedo entra, a
// desmarcada sai) e a complexidade. O lote (#45): um arrasto sobre a lista rola a página sem começar o lote; segurar
// uma linha começa, os toques marcam e desmarcam (sem mexer no fogo da linha), a barra escura toma o lugar da de baixo,
// um fogo vale para as selecionadas, "Já existem" tira outra seleção do checklist, o ✕ sai e a última linha desmarcada
// também. Em nenhum momento a página rola para o lado.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:editor
const assert = require('node:assert/strict');
const { subir } = require('./tour.e2e.cjs');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:editor');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const VOCAB = {
  programas: [{ nome: 'Programa Fictício', chaves: ['CHAMADA'], categoria: 'variedades' }],
  redatores: ['Redator Fictício'],
  editores: ['Bruno Teixeira', 'Carla Nunes', 'Diego Ramos'],
  pauta: [],
};
const ID = 'editorcelular1';
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** O Trello e o Teable falsos (IDs inventados, como em tests/trello.test.ts): cada pedido fica em `pedidos`. */
function trelloFalso() {
  const pedidos = [];
  let n = 0;
  const ok = (dados) => ({ ok: true, status: 200, json: async () => dados, text: async () => '', arrayBuffer: async () => new ArrayBuffer(4) });
  const buscar = async (endereco, init = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    const corpo = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    pedidos.push({ metodo, url, corpo });
    if (url.host === 'teable.falso') return ok({ records: [{ id: 'rec1' }] });
    const rota = url.pathname.replace('/1', '');
    if (rota === '/cards' && metodo === 'POST') return ok({ id: `card${++n}`, shortUrl: `https://trello.com/c/FALSO${n}` });
    if (rota === '/checklists') return ok({ id: 'checklist1' });
    if (rota.endsWith('/attachments') && metodo === 'POST') return ok({ id: 'anexo1', url: 'https://trello.com/anexo.pdf' });
    return ok({});
  };
  const env = {
    TRELLO_KEY: 'k', TRELLO_TOKEN: 't', TRELLO_LISTA: 'listaG5', TRELLO_CAMPO_BOT: 'cBot',
    TRELLO_CAMPO_COMPLEXIDADE: 'cComplexidade', TRELLO_COMPLEXIDADE_OPCOES: 'opBaixa,opMedia,opAlta',
    TEABLE_URL: 'http://teable.falso', TEABLE_TOKEN: 'x', TEABLE_ARTE_PRODUCAO: 'tblProducao',
  };
  return { env, buscar, pedidos };
}

/** O roteiro fictício do rascunho: sete artes e duas pendências (sem editor e uma arte longa). */
const P = (...partes) => ({
  type: 'paragraph',
  content: partes.map((x) => (typeof x === 'string' ? { type: 'text', text: x } : { type: 'text', text: x.a, marks: [{ type: 'arte', attrs: { id: x.id, subtipo: '', sugerido: false } }] })),
});
const ARTES = ['LOGO DO CANTA BRASIL', 'DOZE VOZES, UMA FINAL', 'NOME DA JURADA / JURADA DO PROGRAMA', 'GRADE COM AS FOTOS DOS DOZE FINALISTAS E O NOME DE CADA UM EMBAIXO, ENTRANDO UM POR UM', 'AO VIVO', 'VOTE PELO APLICATIVO', 'SÁBADO, DEPOIS DO JORNAL'];
const DOC = {
  type: 'doc',
  content: [
    P('TÉC: abre na plateia lotada, as luzes do palco acendendo.'),
    P('LOC: NESTE SÁBADO, O PALCO É DE QUEM CANTA.'),
    P({ a: ARTES[0], id: 'c1' }),
    P('LOC: DOZE VOZES, UMA SÓ FINAL.'),
    P({ a: ARTES[1], id: 'c2' }),
    P('SONORA: jurada fictícia, "Quem chega aqui já ganhou alguma coisa."'),
    P({ a: ARTES[2], id: 'c3' }),
    P('LOC: OS FINALISTAS SOBEM AO PALCO COM A BANDA AO VIVO.'),
    P({ a: ARTES[3], id: 'c4' }),
    P('TÉC: corte seco para o ensaio, a banda afinando.'),
    P({ a: ARTES[4], id: 'c5' }),
    P('LOC: E VOCÊ DECIDE QUEM LEVA.'),
    P({ a: ARTES[5], id: 'c6' }),
    P('LOC: CANTA BRASIL. SÁBADO, DEPOIS DO JORNAL.'),
    P({ a: ARTES[6], id: 'c7' }),
  ],
};

/** Grava o roteiro fictício como da Lia e marca o tour como visto (o convite não cobre o editor no computador). */
async function semearRoteiro(api, id = ID) {
  const h = { 'content-type': 'application/json', 'cf-access-authenticated-user-email': LIA };
  const d = new Date();
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 4);
  const claquete = `CHAMADA_CANTA_BRASIL_${String(dia.getDate()).padStart(2, '0')}/${String(dia.getMonth() + 1).padStart(2, '0')}`;
  const meta = { claquete, titulo: 'Canta Brasil', programa: 'Programa Fictício', tipoPrograma: 'variedades', dataExibicao: isoLocal(dia), capitulo: null, edicao: '', praca: 'RJ', redator: 'Redator Fictício', editor: '', locutor: 'Locutor Fictício', selo: '', duracaoAlvoSeg: 30, duracaoModo: 'fechar', layout: 'padrao', status: 'rascunho' };
  const agora = new Date().toISOString();
  const r = await fetch(`${api}/roteiros/${id}`, { method: 'PUT', headers: h, body: JSON.stringify({ roteiro: { id, meta, doc: DOC, revisao: 1, criadoEm: agora, atualizadoEm: agora }, nArtes: ARTES.length }) });
  if (!r.ok) throw new Error(`semear ${id}: ${r.status} ${await r.text()}`);
  await fetch(`${api}/eu/tour`, { method: 'POST', headers: h });
  return { id, claquete };
}

/** O aparelho como o Playwright o descreve, sem a densidade de tela (as capturas ficam no tamanho de CSS). */
const aparelho = (nome) => {
  const { deviceScaleFactor, ...resto } = devices[nome];
  return resto;
};

/**
 * Abre o roteiro no editor, no aparelho (ou no tamanho) pedido, e espera o texto chegar da sala. No Vite, o modo
 * estrito do React lê o roteiro duas vezes ao abrir: a primeira leitura reserva o preenchimento da sala por 20 s e,
 * às vezes, a folha fica com a segunda, que espera a vez passar. Por isso a espera longa e, se ainda assim o texto não
 * chegar, uma segunda abertura (com a reserva já vencida).
 */
async function abrirEditor(navegador, url, id, opcoes) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, ...opcoes });
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/r/${id}`);
  const chegou = (ms) => p.waitForSelector('.texto u.arte[data-id="c7"]', { timeout: ms }).then(() => true, () => false);
  if (!(await chegou(30000))) {
    await p.reload();
    if (!(await chegou(45000))) throw new Error(`o texto de ${id} não chegou da sala`);
  }
  // liberado: a lista de artes deixa de estar travada
  await p.waitForFunction(() => !document.querySelector('[inert] ol.artes'), null, { timeout: 20000 });
  return { ctx, p, erros };
}

/** A página não rola para o lado. */
async function semRolagemDeLado(p, onde) {
  const [largura, conteudo] = await p.evaluate(() => [innerWidth, document.documentElement.scrollWidth]);
  assert.ok(conteudo <= largura, `${onde}: a página rola para o lado (${conteudo} > ${largura})`);
}

/**
 * Seleciona no texto como o dedo faria: uma seleção nativa no parágrafo `i` do texto do roteiro, do caractere `de`
 * (inclusive) ao `ate` (exclusive), contados no texto do parágrafo.
 */
async function selecionarNoTexto(p, i, de, ate) {
  await p.evaluate(([i, de, ate]) => {
    const par = document.querySelectorAll('.texto p')[i];
    par.scrollIntoView({ block: 'center' });
    const ponto = (n) => {
      const andar = document.createTreeWalker(par, NodeFilter.SHOW_TEXT);
      for (let resto = n; andar.nextNode(); resto -= andar.currentNode.length) if (resto <= andar.currentNode.length) return [andar.currentNode, resto];
      throw new Error(`a posição ${n} passa do parágrafo ${i}`);
    };
    const r = document.createRange();
    r.setStart(...ponto(de));
    r.setEnd(...ponto(ate));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }, [i, de, ate]);
}

/**
 * Rola a página com o dedo, `dy` px para baixo. O gesto de toque sintético dispara os eventos do dedo (que encosta,
 * arrasta e solta: não é um toque), mas o Chromium sem janela não move a página com ele; quem rola de fato é o gesto
 * seguinte, sem dedo. Juntos: o dedo que arrasta não fecha o balão, e a página rola.
 */
async function rolarComODedo(p, dy, { y, speed = 1200 } = {}) {
  const cdp = await p.context().newCDPSession(p);
  const { width, height } = p.viewportSize();
  const gesto = { x: Math.round(width / 2), y: Math.round(y ?? height * 0.6), yDistance: -dy, speed, preventFling: true };
  await cdp.send('Input.synthesizeScrollGesture', { ...gesto, gestureSourceType: 'touch' });
  await cdp.send('Input.synthesizeScrollGesture', gesto);
  await cdp.detach();
}

/** O balão do celular ("Arte" ou "Arte N · Desmarcar") e a distância dele até a última linha do trecho. */
const BALAO = '.balao-celular';
const distanciaDoTrecho = (p, seletor) =>
  p.evaluate(([b, s]) => {
    const linhas = [...document.querySelector(s).getClientRects()];
    return document.querySelector(b).getBoundingClientRect().top - linhas[linhas.length - 1].bottom;
  }, [BALAO, seletor]);

/** O parágrafo da locução de abertura, onde o dedo marca a arte nova. */
const LOC_ABERTURA = 'LOC: NESTE SÁBADO, O PALCO É DE QUEM CANTA.';
const ARTE_DO_DEDO = 'NESTE SÁBADO';

/** O meio do alvo, trazido para o meio da tela (longe da barra fixa de baixo). */
async function meioDe(alvo) {
  await alvo.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const c = await alvo.boundingBox();
  return { x: Math.round(c.x + c.width / 2), y: Math.round(c.y + c.height / 2) };
}

/**
 * Um toque do dedo no meio do alvo, pelo ponto da tela (no lote, o que está por baixo do dedo é a linha inteira: o
 * fogo e a bolinha não recebem o toque, então o toque do Playwright, que confere o alvo, não serve).
 */
async function tocar(p, alvo) {
  const { x, y } = await meioDe(alvo);
  await p.touchscreen.tap(x, y);
  await p.waitForTimeout(150);
}

/** Segura o dedo parado no meio do alvo por `ms` e solta (o toque longo). */
async function segurar(p, alvo, ms = 700) {
  const ponto = await meioDe(alvo);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [ponto] });
  await p.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await p.waitForTimeout(150);
}

const linha = (p, texto) => p.locator('ol.artes li', { has: p.locator('.txt', { hasText: texto }) });
const topoDe = (p, sel) => p.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + scrollY, sel);

async function noCelular(navegador, url, nome, { id, enviar, pedidos }) {
  const { ctx, p, erros } = await abrirEditor(navegador, url, id, aparelho(nome));
  await semRolagemDeLado(p, `${nome}, ao abrir`);

  // a ordem da página: o topo, a ficha, "Para revisar", o texto, a lista e a barra fixa no lugar das estatísticas
  const ordem = await Promise.all(['.topo', '.claquete', '.pendencias-celular', '.folha', 'ol.artes'].map((s) => topoDe(p, s)));
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, `${nome}: a ordem da página é topo, ficha, pendências, texto e lista`);
  assert.equal(await p.locator('.estatisticas').count(), 0, `${nome}: o rodapé de estatísticas sai no celular`);
  const barra = p.locator('.barra-enviar');
  assert.ok(await barra.isVisible(), `${nome}: a barra de baixo aparece`);
  assert.equal(await p.locator('.topo .acao-principal').count(), 0, `${nome}: o Enviar sai do topo`);

  // a ficha: recolhida mostra editor, exibição e tempo; um toque abre inteira, editável; a seta recolhe
  const claquete = p.locator('.claquete');
  // a ficha inteira está à vista quando a dobra dela tem altura (recolhida, ela fica no DOM com altura zero)
  const fichaInteira = () => p.locator('.claquete .dobra.inteira').evaluate((el) => el.getBoundingClientRect().height > 100);
  assert.match(await p.locator('.ficha-resumo').innerText(), /EDITOR[\s\S]*EXIBIÇÃO[\s\S]*TEMPO/i);
  assert.equal(await fichaInteira(), false, `${nome}: a ficha começa recolhida`);
  await p.locator('.ficha-resumo').tap();
  await p.waitForTimeout(400);
  assert.ok(await fichaInteira(), `${nome}: a ficha abre inteira`);
  await p.locator('.claquete .campo-c.nome input').fill(await p.locator('.claquete .campo-c.nome input').inputValue());
  assert.equal(await claquete.evaluate((el) => el.classList.contains('aberta')), true);
  await p.locator('.claquete .ripa-botao').tap();
  await p.waitForTimeout(400);
  assert.equal(await fichaInteira(), false, `${nome}: a seta recolhe a ficha`);

  // "Para revisar": recolhido com as pendências numa linha; aberto, "Escolher" abre a ficha
  assert.match(await p.locator('.pendencias-celular .pend-linha').innerText(), /Sem editor/);
  await p.locator('.pend-topo').tap();
  await p.waitForTimeout(400);
  await p.locator('.pendencias-celular li', { hasText: 'Sem editor' }).getByRole('button', { name: 'Escolher' }).tap();
  await p.waitForTimeout(400);
  assert.equal(await claquete.evaluate((el) => el.classList.contains('aberta')), true, `${nome}: "Escolher" abre a ficha`);
  await p.keyboard.press('Escape');
  await p.locator('.claquete .ripa-botao').tap();
  await p.locator('.pend-topo').tap();
  await p.waitForTimeout(400);

  // o texto é só de leitura: tocar e digitar não muda nada (nem salva)
  const antes = await p.locator('.texto').innerText();
  assert.equal(await p.locator('.texto').getAttribute('contenteditable'), 'false', `${nome}: o texto não é editável no celular`);
  await p.locator('.texto p').nth(1).tap();
  await p.keyboard.type('XYZ');
  await p.keyboard.press('Backspace');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  assert.equal(await p.locator('.texto').innerText(), antes, `${nome}: digitar no texto não muda nada`);
  // as dicas de teclado ficam escondidas
  assert.equal(await p.locator('.folha-fim .dicas').isVisible(), false);

  // marcar arte com o dedo: a seleção corta as palavras ("STE SÁB"); o botão "Arte" aparece embaixo do trecho, sem
  // sombra, e marca o trecho ajustado ("NESTE SÁBADO"), que entra na lista. O texto continua o mesmo
  await selecionarNoTexto(p, 1, LOC_ABERTURA.indexOf('STE'), LOC_ABERTURA.indexOf('ADO,'));
  const botaoArte = p.locator(BALAO).getByRole('button', { name: 'Arte', exact: true });
  await botaoArte.waitFor({ state: 'visible', timeout: 3000 });
  await p.waitForTimeout(300); // o balão abre com uma animação curta de escala
  const caixaArte = await botaoArte.boundingBox();
  const fimDaSelecao = await p.evaluate(() => getSelection().getRangeAt(0).getBoundingClientRect().bottom);
  assert.ok(caixaArte.y >= fimDaSelecao, `${nome}: o botão "Arte" fica embaixo da seleção`);
  assert.ok(caixaArte.height >= 44, `${nome}: o botão "Arte" tem 44px`);
  assert.equal(await p.locator(BALAO).evaluate((el) => getComputedStyle(el).boxShadow), 'none', `${nome}: o botão "Arte" não tem sombra`);
  await semRolagemDeLado(p, `${nome}, com o botão "Arte"`);
  await botaoArte.tap();
  await p.waitForFunction((t) => [...document.querySelectorAll('.texto u.arte')].some((u) => u.textContent === t), ARTE_DO_DEDO, { timeout: 3000 });
  assert.equal(await p.locator(BALAO).count(), 0, `${nome}: o botão some depois de marcar`);
  assert.equal(await p.locator('ol.artes li').first().locator('.txt').innerText(), ARTE_DO_DEDO, `${nome}: a arte nova entra na lista, em primeiro`);
  assert.equal(await p.locator('.texto').innerText(), antes, `${nome}: marcar a arte não muda o texto`);

  // seleção só de espaço e pontuação: nada
  await selecionarNoTexto(p, 1, LOC_ABERTURA.indexOf(', O'), LOC_ABERTURA.indexOf(', O') + 2);
  await p.waitForTimeout(400);
  assert.equal(await p.locator(BALAO).count(), 0, `${nome}: a seleção sem palavra não oferece "Arte"`);
  await p.evaluate(() => getSelection().removeAllRanges());

  // desmarcar pelo texto: tocar numa arte mostra "Arte N · Desmarcar" embaixo dela e acende a linha dela na lista
  const vote = '.texto u.arte[data-id="c6"]';
  await p.locator(vote).scrollIntoViewIfNeeded();
  await p.locator(vote).tap();
  const balao = p.locator(BALAO);
  await balao.waitFor({ state: 'visible', timeout: 3000 });
  assert.match(await balao.innerText(), /^Arte 7\s+Desmarcar$/, `${nome}: o balão diz o número da arte`);
  assert.ok(await linha(p, ARTES[5]).evaluate((li) => li.classList.contains('realcada')), `${nome}: a linha da arte acende na lista`);
  const antesDeRolar = await distanciaDoTrecho(p, vote);
  assert.ok(antesDeRolar >= 0 && antesDeRolar < 30, `${nome}: o balão fica logo embaixo da arte (${antesDeRolar}px)`);
  // rolar a página com o dedo não fecha o balão, e ele acompanha a arte
  const topoAntes = await balao.evaluate((el) => el.getBoundingClientRect().top);
  await rolarComODedo(p, 120);
  await p.waitForTimeout(300);
  const topoDepois = await balao.evaluate((el) => el.getBoundingClientRect().top);
  assert.ok(topoAntes - topoDepois > 60, `${nome}: a página rolou (${topoAntes} → ${topoDepois})`);
  assert.ok(await balao.isVisible(), `${nome}: rolar não fecha o balão`);
  assert.ok(Math.abs((await distanciaDoTrecho(p, vote)) - antesDeRolar) < 1, `${nome}: o balão acompanha a arte quando a página rola`);
  await balao.getByRole('button', { name: /Desmarcar/ }).tap();
  await p.waitForFunction((s) => !document.querySelector(s), vote, { timeout: 3000 });
  // a linha sai da lista com a vaga fechando
  await linha(p, ARTES[5]).waitFor({ state: 'detached', timeout: 3000 });
  assert.equal(await p.locator('.texto').innerText(), antes, `${nome}: desmarcar não muda o texto`);

  // um toque fora fecha o balão
  await p.locator('.texto u.arte[data-id="c5"]').tap();
  await balao.waitFor({ state: 'visible', timeout: 3000 });
  await p.locator('.texto p').nth(9).tap();
  await balao.waitFor({ state: 'detached', timeout: 3000 });

  // a lista: o ✕ sempre visível, o fogo que sobe, a bolinha que marca "já existe"
  await p.locator('ol.artes').scrollIntoViewIfNeeded();
  const tirar = linha(p, ARTES[0]).locator('.tirar-arte');
  assert.equal(await tirar.evaluate((el) => getComputedStyle(el).opacity), '1', `${nome}: o ✕ fica sempre visível`);
  for (const alvo of [linha(p, ARTES[0]).locator('.b'), linha(p, ARTES[0]).locator('.cx'), tirar]) {
    const r = await alvo.evaluate((el) => {
      // o alvo de toque: o próprio botão ou a área ampliada (::after) da bolinha
      const c = el.getBoundingClientRect();
      const d = getComputedStyle(el, '::after');
      return d.content !== 'none' && d.position === 'absolute' ? { w: c.width - parseFloat(d.left) - parseFloat(d.right), h: c.height - parseFloat(d.top) - parseFloat(d.bottom) } : { w: c.width, h: c.height };
    });
    assert.ok(r.w >= 44 && r.h >= 44, `${nome}: alvo de toque com menos de 44px (${r.w}×${r.h})`);
  }
  await linha(p, ARTES[2]).locator('.cx').tap();
  await linha(p, ARTES[3]).locator('.cx').tap();
  await linha(p, ARTES[3]).locator('.cx').tap();
  await p.waitForTimeout(200);
  assert.equal(await linha(p, ARTES[2]).locator('.cx').getAttribute('aria-label'), 'Complexidade MÉDIA');
  assert.equal(await linha(p, ARTES[3]).locator('.cx').getAttribute('aria-label'), 'Complexidade ALTA');
  await linha(p, ARTES[4]).locator('.b').tap();
  await p.waitForTimeout(200);
  assert.equal(await linha(p, ARTES[4]).locator('.b').getAttribute('data-marca'), 'existe', `${nome}: a bolinha marca "já existe"`);
  // a barra acompanha: a maior complexidade e as artes a produzir
  await p.waitForFunction(() => /ALTA/.test(document.querySelector('.barra-enviar .cx-card').textContent), null, { timeout: 3000 });
  assert.match(await barra.locator('.conta').innerText(), /^6\s+artes$/);

  // o lote (#45). Um arrasto sobre a lista rola a página e não começa o lote
  const LOTE = '.barra-lote.no-celular';
  const contaDoLote = () => p.locator(`${LOTE} .conta`).innerText();
  const selecionadas = () => p.locator('ol.artes li.selecionada .txt').allInnerTexts();
  await linha(p, ARTES[0]).scrollIntoViewIfNeeded();
  const yDaLinha = await linha(p, ARTES[0]).evaluate((li) => li.getBoundingClientRect().top + 24);
  const rolagemAntes = await p.evaluate(() => scrollY);
  // devagar (mais que o meio segundo de segurar), como quem rola lendo a lista
  await rolarComODedo(p, 160, { y: yDaLinha, speed: 160 });
  await p.waitForTimeout(700);
  assert.ok((await p.evaluate(() => scrollY)) > rolagemAntes + 60, `${nome}: o arrasto sobre a lista rola a página`);
  assert.equal(await p.locator(LOTE).count(), 0, `${nome}: o arrasto não começa o lote`);
  assert.deepEqual(await selecionadas(), [], `${nome}: o arrasto não seleciona`);
  // segurar uma linha começa o lote: a barra escura no lugar da de baixo
  await segurar(p, linha(p, ARTES[0]));
  await p.locator(LOTE).waitFor({ state: 'visible', timeout: 3000 });
  assert.equal(await p.locator('.barra-enviar').count(), 0, `${nome}: a barra do lote toma o lugar da barra de baixo`);
  assert.match(await contaDoLote(), /^1\s+selecionada$/);
  // os toques marcam: um no fogo da linha seleciona a linha e não mexe no fogo
  await tocar(p, linha(p, ARTES[1]).locator('.cx'));
  await tocar(p, linha(p, ARTE_DO_DEDO));
  assert.match(await contaDoLote(), /^3\s+selecionadas$/, `${nome}: segurar uma e tocar em outras duas`);
  assert.deepEqual(await selecionadas(), [ARTE_DO_DEDO, ARTES[0], ARTES[1]]);
  assert.equal(await linha(p, ARTES[1]).locator('.cx').getAttribute('aria-label'), 'Complexidade BAIXA', `${nome}: no lote, tocar no fogo não muda o fogo`);
  assert.equal(await linha(p, ARTES[0]).locator('.b').getAttribute('data-marca'), 'produzir', `${nome}: no lote, a bolinha não muda`);
  const caixaDoLote = await p.locator(LOTE).boundingBox();
  assert.ok(caixaDoLote.y + caixaDoLote.height <= p.viewportSize().height + 1, `${nome}: a barra do lote fica embaixo, à vista`);
  for (const b of await p.locator(`${LOTE} button`).all()) assert.ok((await b.boundingBox()).height >= 44, `${nome}: os botões do lote têm 44px`);
  await semRolagemDeLado(p, `${nome}, no lote`);
  // um fogo vale para as três, e o lote continua
  await p.locator(LOTE).getByRole('button', { name: 'Complexidade ALTA nas selecionadas' }).tap();
  await p.waitForTimeout(200);
  for (const t of [ARTE_DO_DEDO, ARTES[0], ARTES[1]]) assert.equal(await linha(p, t).locator('.cx').getAttribute('aria-label'), 'Complexidade ALTA', `${nome}: o fogo do lote em "${t}"`);
  assert.match(await contaDoLote(), /^3\s+selecionadas$/, `${nome}: o lote continua depois do fogo`);
  // outra seleção: desmarca duas, marca a grade, e "Já existem" tira as duas do checklist e sai do lote
  await tocar(p, linha(p, ARTES[0]));
  await tocar(p, linha(p, ARTES[1]));
  await tocar(p, linha(p, ARTES[3]));
  assert.deepEqual(await selecionadas(), [ARTE_DO_DEDO, ARTES[3]]);
  await p.locator(LOTE).getByRole('button', { name: 'Já existem' }).tap();
  await p.locator(LOTE).waitFor({ state: 'detached', timeout: 3000 });
  for (const t of [ARTE_DO_DEDO, ARTES[3]]) assert.equal(await linha(p, t).locator('.b').getAttribute('data-marca'), 'existe', `${nome}: "Já existem" em "${t}"`);
  assert.ok(await p.locator('.barra-enviar').isVisible(), `${nome}: a barra de baixo volta`);
  // o ✕ sai do lote sem mexer em nada
  await segurar(p, linha(p, ARTES[2]));
  await p.locator(LOTE).waitFor({ state: 'visible', timeout: 3000 });
  await p.locator(LOTE).getByRole('button', { name: 'Limpar a seleção' }).tap();
  await p.locator(LOTE).waitFor({ state: 'detached', timeout: 3000 });
  assert.deepEqual(await selecionadas(), [], `${nome}: o ✕ limpa a seleção`);
  assert.equal(await linha(p, ARTES[2]).locator('.cx').getAttribute('aria-label'), 'Complexidade MÉDIA');
  // desmarcar a última linha sai sozinho
  await segurar(p, linha(p, ARTES[6]));
  await p.locator(LOTE).waitFor({ state: 'visible', timeout: 3000 });
  await tocar(p, linha(p, ARTES[6]));
  await p.locator(LOTE).waitFor({ state: 'detached', timeout: 3000 });
  assert.deepEqual(await selecionadas(), [], `${nome}: sem linha marcada, o lote sai sozinho`);
  // fora do lote, o fogo volta a responder ao toque
  await linha(p, ARTES[6]).locator('.cx').tap();
  await p.waitForTimeout(200);
  assert.equal(await linha(p, ARTES[6]).locator('.cx').getAttribute('aria-label'), 'Complexidade MÉDIA', `${nome}: fora do lote, o fogo sobe`);
  // a barra: as quatro a produzir, com a ALTA do lote
  assert.match(await barra.locator('.conta').innerText(), /^4\s+artes$/);
  assert.match(await barra.locator('.cx-card').innerText(), /ALTA/);

  // tocar no nome leva até a arte no texto, com o destaque
  await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await linha(p, ARTES[1]).locator('.txt').tap();
  await p.waitForTimeout(900);
  const u = await p.evaluate(() => {
    const r = document.querySelector('.texto u.arte[data-id="c2"]').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, h: innerHeight, realce: [...document.querySelectorAll('style')].some((s) => s.textContent.includes('[data-id="c2"]')) };
  });
  assert.ok(u.top >= 0 && u.bottom <= u.h, `${nome}: tocar no nome leva até a arte no texto`);
  assert.ok(u.realce, `${nome}: a arte ganha o destaque`);
  await semRolagemDeLado(p, `${nome}, depois de mexer na lista`);

  if (enviar) {
    await barra.getByRole('button', { name: /Enviar/ }).tap();
    // o envio termina com o registro na produção da arte (depois, o editor pode seguir para o próximo da fila)
    const registrou = () => pedidos.some((x) => x.url.pathname === '/api/table/tblProducao/record');
    for (let t = Date.now(); !registrou() && Date.now() - t < 30000; ) await p.waitForTimeout(250);
    const checklist = pedidos.filter((x) => x.url.pathname === '/1/checklists/checklist1/checkItems').map((x) => x.url.searchParams.get('name'));
    // a desmarcada no texto sai; as que já existem (pela bolinha e pelo lote: entre elas a marcada pelo dedo) ficam de fora
    const aProduzir = [ARTES[0], ARTES[1], ARTES[2], ARTES[6]];
    assert.deepEqual(checklist, aProduzir, 'o checklist leva as artes a produzir, sem as que já existem');
    // a ALTA veio do lote (a grade, que era ALTA, saiu com "Já existem")
    const campo = pedidos.find((x) => x.metodo === 'PUT' && x.url.pathname.endsWith('/customField/cComplexidade/item'))?.corpo;
    assert.deepEqual(campo, { idValue: 'opAlta' }, 'o card vai com a maior complexidade');
    const registro = pedidos.find((x) => x.url.pathname === '/api/table/tblProducao/record')?.corpo?.records?.[0]?.fields;
    assert.ok(registro, 'a produção da arte recebe o registro');
    assert.equal(registro.complexidade, 3, 'a produção da arte leva a maior complexidade');
    assert.equal(registro.artes_quantidade, 4);
    assert.equal(registro.artes, aProduzir.join(' | '));
    await semRolagemDeLado(p, `${nome}, depois de enviar`);
  }
  assert.deepEqual(erros, [], `${nome}: erros na página`);
  await ctx.close();
}

async function principal() {
  const falso = trelloFalso();
  const s = await subir({ trello: falso });
  const navegador = await chromium.launch();
  try {
    // um roteiro para cada aparelho: os dois começam do mesmo jeito
    await semearRoteiro(s.api, `${ID}a`);
    await semearRoteiro(s.api, `${ID}b`);
    await noCelular(navegador, s.url, 'Galaxy S24', { id: `${ID}a`, enviar: false, pedidos: falso.pedidos });
    await noCelular(navegador, s.url, 'iPhone 13', { id: `${ID}b`, enviar: true, pedidos: falso.pedidos });
    console.log('ok: o editor no celular (Galaxy S24 e iPhone 13), com o envio ao Trello falso');
  } finally {
    await navegador.close();
    await s.descer();
  }
}

if (require.main === module)
  principal().then(
    () => process.exit(0),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );

module.exports = { trelloFalso, semearRoteiro, abrirEditor, aparelho, selecionarNoTexto, rolarComODedo, segurar, tocar, linha, ARTES, ID, LOC_ABERTURA, ARTE_DO_DEDO };
