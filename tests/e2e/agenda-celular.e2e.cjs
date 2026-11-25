// Ponta a ponta da agenda No Trello no celular (spec #37, #40), rodado à parte do vitest: `npm run e2e:agenda`.
//
// Sobe o servidor e o Vite como o e2e do tour (banco temporário, dados fictícios, nada sai para a rede), abre a tela
// inicial em tamanho de iPhone e de Android e arrasta a faixa de dias com toque emulado pelo CDP: curto, longo,
// rápido, diagonal, de cima para baixo e começando num card. Quadro a quadro (requestAnimationFrame), confere que a
// faixa nunca anda contra o movimento, que a página não rola (nem para o lado), que as colunas não se mexem por dentro e
// que o topo (período e resumo) só troca quando a rolagem termina. Confere também que o toque abre o card e o arrasto
// não, as setas e o "voltar para hoje", a faixa já em hoje antes de pintar, a agenda encolhida e que o tour não aparece.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:agenda
// Com MEDICAO=arquivo.json, grava os números de cada gesto.
const { writeFileSync } = require('node:fs');
const { subir, contexto } = require('./tour.e2e.cjs');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:agenda');
  process.exit(2);
}

const OUTRA = 'outra.pessoa@exemplo.com';
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diaMais = (n) => {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), h.getDate() + n);
};
/** Os dois dias à vista, como o seletor escreve ("25 – 26/11", "30/11 – 1/12"). */
const periodo = (n) => {
  const [a, b] = [diaMais(n), diaMais(n + 1)];
  return `${a.getDate()}${a.getMonth() === b.getMonth() ? '' : `/${a.getMonth() + 1}`} – ${b.getDate()}/${b.getMonth() + 1}`;
};

// os cards fictícios: [id, claquete, dia a partir de hoje (null: sem data), praça, artes]
const CARDS = [
  ['agdhoje1', 'CHAMADA_AUDITORIO', 0, 'RJ', 2],
  ['agdhoje2', 'CHAMADA_SERIE', 0, 'RJ', 5],
  ['agdhoje3', 'VINHETA_FUTEBOL', 0, 'BH', 3],
  ['agdamanha', 'CHAMADA_REALITY', 1, 'SP', 6],
  ['agdmais2a', 'CHAMADA_FILME', 2, 'RJ', 3],
  ['agdmais2b', 'CHAMADA_MUSICAL', 2, 'RJ', 2],
  ['agdmais3', 'CHAMADA_SHOW', 3, 'SP', 4],
  ['agdmais5', 'CHAMADA_ESPECIAL', 5, 'RJ', 5],
  ['agdmais8', 'TEASER_DOC', 8, 'SP', 3],
  ['agdontem1', 'TEASER_NOVELA', -1, 'RJ', 4],
  ['agdontem2', 'CHAMADA_JORNAL', -1, 'SP', 2],
  ['agdmenos4', 'TEASER_SERIE', -4, 'SP', 3],
  ['agdmenos20', 'CHAMADA_ESPORTE', -20, 'RJ', 2],
  ['agdsemdata1', 'VT_EVENTO_FICTICIO', null, 'RJ', 3],
  ['agdsemdata2', 'VT_INSTITUCIONAL', null, 'SP', 1],
];
// o andamento fictício (pela rota): um entregue e um na lista de prioridade hoje, um produzindo amanhã
const ANDAMENTO = {
  agdhoje1: { status: ['FINALIZADO'], designers: ['Ana Arte'], entregue: true, entrega: null },
  agdhoje2: { status: ['EM APROVAÇÃO'], designers: ['Bia Arte'], entregue: false, entrega: null, prioridade: true },
  agdhoje3: { status: ['PRODUZINDO'], designers: [], entregue: false, entrega: null },
  agdamanha: { status: ['PRODUZINDO'], designers: ['Caio Traço'], entregue: false, entrega: null },
  agdsemdata1: { status: ['PRODUZINDO'], designers: [], entregue: false, entrega: null },
};
const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LOC: TEXTO FICTÍCIO.' }] }] };
const meta = (claquete, data, praca, extra = {}) => ({ claquete, titulo: claquete, programa: 'Programa Fictício', tipoPrograma: 'variedades', dataExibicao: data, capitulo: null, edicao: '', praca, redator: 'Redator Fictício', editor: 'Editora Fictícia', locutor: '', selo: '', duracaoAlvoSeg: 30, duracaoModo: 'fechar', layout: 'padrao', status: 'rascunho', ...extra });
const cabecalhos = { 'content-type': 'application/json', 'cf-access-authenticated-user-email': OUTRA };

async function por(api, id, m, nArtes) {
  const agora = new Date().toISOString();
  const r = await fetch(`${api}/roteiros/${id}`, { method: 'PUT', headers: cabecalhos, body: JSON.stringify({ roteiro: { id, meta: m, doc, revisao: 1, criadoEm: agora, atualizadoEm: agora, publico: true }, nArtes }) });
  if (!r.ok) throw new Error(`semear ${id}: ${r.status} ${await r.text()}`);
}

/** A agenda fictícia, de vinte dias atrás a oito dias para a frente, mais o "sem data". */
async function semearAgenda(api) {
  for (const [id, nome, dia, praca, n] of CARDS) {
    const d = dia === null ? null : diaMais(dia);
    const claquete = d ? `${nome}_${d.getDate()}/${d.getMonth() + 1}` : nome;
    await por(api, id, meta(claquete, d ? isoLocal(d) : '', praca), n);
    const t = await fetch(`${api}/roteiros/${id}/trello`, { method: 'POST', headers: cabecalhos, body: JSON.stringify({ jaEsta: { card: id } }) });
    if (!t.ok) throw new Error(`semear ${id} no Trello: ${t.status} ${await t.text()}`);
  }
}

/** Um roteiro para revisar na fila: a agenda encolhe. */
const semearRevisao = (api) => por(api, 'agdfila1', meta(`CHAMADA_VIAGEM_${diaMais(3).getDate()}/${diaMais(3).getMonth() + 1}`, isoLocal(diaMais(3)), 'BH', { revisar: ['Data sem programa na grade'] }), 2);

/** O aparelho como o Playwright o descreve, sem a densidade de tela (as capturas ficam no tamanho de CSS). */
const aparelho = (nome) => {
  const { deviceScaleFactor, ...resto } = devices[nome];
  return resto;
};

// guarda a posição da faixa no primeiro momento em que ela existe (antes de pintar) e, a cada quadro, onde está tudo
const ESPIAO = () => {
  const ver = new MutationObserver(() => {
    const s = document.querySelector('.secao-trello .semana');
    if (!s || window.__primeira || s.children.length < 2) return;
    window.__primeira = { x: s.scrollLeft, dia: s.children[1].offsetLeft - s.children[0].offsetLeft };
  });
  ver.observe(document, { childList: true, subtree: true });
};
const QUADROS = () => {
  window.__log = [];
  window.__fase = '';
  const s = document.querySelector('.secao-trello .semana');
  const cols = s.querySelectorAll('.coluna');
  const f = () => {
    const r0 = s.getBoundingClientRect();
    // a posição de algumas colunas dentro da faixa: deve ser constante (nada se mexe por dentro)
    const interno = [10, 15, 20].map((k) => Math.round((cols[k].getBoundingClientRect().left - r0.left + s.scrollLeft) * 10) / 10).join(',');
    window.__log.push({
      fase: window.__fase,
      dedo: !!window.__dedo,
      x: s.scrollLeft,
      y: scrollY,
      px: scrollX,
      interno,
      texto: `${document.querySelector('.secao-trello .semana-nav b').textContent} | ${document.querySelector('.secao-trello-conta').textContent}`,
      aberto: document.querySelectorAll('.secao-trello .card-semana.aberto').length,
    });
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
};

/** Quantas vezes a faixa inverte o sentido nesse trecho de quadros. */
function inversoesEm(q) {
  let n = 0, sinal = 0;
  for (let k = 1; k < q.length; k++) {
    const d = q[k].x - q[k - 1].x;
    if (Math.abs(d) <= 0.3) continue;
    if (sinal && Math.sign(d) !== sinal) n++;
    sinal = Math.sign(d);
  }
  return n;
}

/**
 * Os números de um gesto. O salto contra o movimento é contado em dois trechos: com o dedo na tela (a faixa tem de
 * seguir o dedo, sem voltar nunca) e depois de soltar (a inércia e o encaixe vão num sentido só até o dia). Entre os
 * dois, uma volta é permitida: o dedo que passou do dia e o encaixe que volta até ele, devagar, sem tremer.
 */
function analisar(log, fase) {
  const q = log.filter((f) => f.fase === fase);
  let interno = 0, paginaY = 0, paginaX = 0, textoNoMeio = 0, maiorPasso = 0;
  const xFim = q[q.length - 1].x;
  const ultimoComDedo = q.map((f) => f.dedo).lastIndexOf(true);
  const comDedo = q.slice(0, ultimoComDedo + 1).filter((f) => f.dedo);
  const solto = q.slice(Math.max(0, ultimoComDedo));
  const inversoesComDedo = inversoesEm(comDedo);
  const inversoesSolto = inversoesEm(solto);
  // quanto o encaixe voltou, contra o sentido do dedo, depois de soltar
  const sentidoDoDedo = comDedo.length > 1 ? Math.sign(comDedo[comDedo.length - 1].x - comDedo[0].x) : 0;
  const volta = Math.round(-(xFim - solto[0].x) * sentidoDoDedo);
  for (let k = 1; k < q.length; k++) {
    maiorPasso = Math.max(maiorPasso, Math.abs(q[k].x - q[k - 1].x));
    if (q[k].interno !== q[k - 1].interno) interno++;
    if (q[k].y !== q[k - 1].y) paginaY++;
    if (q[k].px !== 0) paginaX++;
    if (q[k].texto !== q[k - 1].texto && Math.abs(q[k].x - xFim) > 0.5) textoNoMeio++;
  }
  const inversoes = inversoesComDedo + inversoesSolto;
  return { quadros: q.length, rolou: Math.round(xFim - q[0].x), inversoes, inversoesComDedo, inversoesSolto, voltaDoEncaixe: Math.max(0, volta), maiorPasso: Math.round(maiorPasso), interno, paginaY, paginaRolouPx: Math.round(q[q.length - 1].y - q[0].y), paginaX, textoNoMeio, textoFinal: q[q.length - 1].texto, aberto: q[q.length - 1].aberto };
}

async function arrastar(cdp, p, pontos, passoMs = 16) {
  const [x0, y0] = pontos[0];
  await p.evaluate(() => (window.__dedo = true));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (const [x, y] of pontos.slice(1)) {
    await p.waitForTimeout(passoMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.evaluate(() => (window.__dedo = false));
}
const linha = (x0, y0, x1, y1, n) => Array.from({ length: n + 1 }, (_, k) => [x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);

/** Abre a tela no aparelho e espera a agenda; devolve a página pronta para os gestos. */
async function abrirNoCelular(navegador, url, nome, opcoes = {}) {
  const { ctx, p, erros } = await contexto(navegador, 'about:blank', { ...aparelho(nome), ...opcoes });
  await ctx.route('**/api/andamento', (r) => r.fulfill({ json: ANDAMENTO }));
  await ctx.addInitScript(ESPIAO);
  await p.goto(url);
  await p.waitForSelector('.secao-trello .semana .coluna');
  await p.waitForTimeout(900);
  return { ctx, p, erros };
}
const levarAteAAgenda = async (p) => {
  await p.evaluate(() => scrollTo(0, document.querySelector('.secao-trello').getBoundingClientRect().top + scrollY - 8));
  await p.waitForTimeout(400);
};
/** O primeiro dia à vista (a posição na faixa), pela rolagem. */
const diaAVista = (p) => p.evaluate(() => {
  const s = document.querySelector('.secao-trello .semana');
  return Math.round(s.scrollLeft / (s.children[1].offsetLeft - s.children[0].offsetLeft));
});
const textoDoTopo = (p) => p.evaluate(() => [document.querySelector('.secao-trello .semana-nav b').textContent, document.querySelector('.secao-trello-conta > span').textContent]);
/** O centro de um card que está inteiro à vista na faixa. */
const cardAVista = (p) => p.locator('.secao-trello .semana .card-semana-abrir').evaluateAll((els) => {
  const s = document.querySelector('.secao-trello .semana').getBoundingClientRect();
  const e = els.find((el) => {
    const r = el.getBoundingClientRect();
    return r.left > s.left && r.right < s.right && r.top > 0 && r.bottom < innerHeight;
  });
  const r = e.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
});

const HOJE = 15; // a posição de hoje na faixa (duas semanas de agenda antes da de agora, que começa ontem)

/** Os gestos, as setas e o toque num aparelho; devolve a medição de cada gesto. */
async function gestos(navegador, url, nome, conferir) {
  const { ctx, p, erros } = await abrirNoCelular(navegador, url, nome);
  const rotulo = (t) => `${nome}: ${t}`;
  try {
    const primeira = await p.evaluate(() => window.__primeira);
    conferir(primeira && Math.abs(primeira.x - HOJE * primeira.dia) < 1, rotulo(`a faixa já está em hoje antes de pintar (${primeira && Math.round(primeira.x)} px)`));
    conferir(!(await p.$('.tour')), rotulo('o tour não aparece'));
    conferir(!(await p.isVisible('.botao-atalhos')), rotulo('o "?" dos atalhos não aparece'));
    const [per, resumo] = await textoDoTopo(p);
    conferir(per === periodo(0), rotulo(`o seletor abre em hoje e amanhã: "${per}"`));
    conferir(resumo === '4 cards · 1 entregue · 1 prioridade', rotulo(`o resumo de hoje e amanhã: "${resumo}"`));
    conferir(!(await p.isVisible('.voltar-hoje')), rotulo('em hoje, o "voltar para hoje" fica escondido (com o lugar guardado)'));
    conferir(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), rotulo('a página cabe na largura'));
    // a altura da faixa é a do dia mais alto
    const alturas = await p.evaluate(() => {
      const s = document.querySelector('.secao-trello .semana');
      return { faixa: s.clientHeight, maisAlto: Math.max(...[...s.children].map((c) => c.offsetHeight)) };
    });
    conferir(Math.abs(alturas.faixa - 6 - alturas.maisAlto) <= 1, rotulo(`a faixa tem a altura do dia mais alto (${alturas.faixa} px)`));

    await levarAteAAgenda(p);
    const cdp = await ctx.newCDPSession(p);
    await p.evaluate(QUADROS);
    const caixa = await p.locator('.secao-trello .semana').boundingBox();
    const W = caixa.width, X = caixa.x, Y = caixa.y + 24; // no cabeçalho dos dias
    const medicao = {};
    const fase = async (n, fn, espera = 1300) => {
      await p.evaluate((x) => (window.__fase = x), n);
      await fn();
      await p.waitForTimeout(espera);
      await p.evaluate(() => (window.__fase = ''));
      medicao[n] = analisar(await p.evaluate(() => window.__log), n);
      return medicao[n];
    };
    const deLado = (m, n) => {
      conferir(m.inversoes === 0, rotulo(`${n}: nenhum salto contra o movimento, com o dedo na tela e depois de soltar (${m.quadros} quadros, maior passo ${m.maiorPasso} px, volta do encaixe ${m.voltaDoEncaixe} px)`));
      conferir(m.paginaY === 0 && m.paginaX === 0, rotulo(`${n}: a página não rola`));
      conferir(m.interno === 0, rotulo(`${n}: as colunas não se mexem por dentro`));
      conferir(m.textoNoMeio === 0, rotulo(`${n}: o topo só troca quando a rolagem termina`));
    };
    const encaixado = async (n) => {
      const x = await p.evaluate(() => {
        const s = document.querySelector('.secao-trello .semana');
        const dia = s.children[1].offsetLeft - s.children[0].offsetLeft;
        return s.scrollLeft / dia;
      });
      conferir(Math.abs(x - Math.round(x)) < 0.01, rotulo(`${n}: parou encaixada num dia`));
      const k = Math.round(x);
      const [per2] = await textoDoTopo(p);
      conferir(per2 === periodo(k - HOJE), rotulo(`${n}: o seletor diz os dias à vista ("${per2}")`));
      return k;
    };

    let k = HOJE;
    let m = await fase('curto e devagar (60 px)', () => arrastar(cdp, p, linha(X + W - 40, Y, X + W - 100, Y + 2, 12), 25));
    deLado(m, 'curto');
    k = await encaixado('curto');
    m = await fase('longo (240 px)', () => arrastar(cdp, p, linha(X + W - 20, Y, X + W - 260, Y + 4, 20), 16));
    deLado(m, 'longo');
    const depoisDoLongo = await encaixado('longo');
    conferir(depoisDoLongo > k, rotulo(`longo: andou para a frente (do dia ${k} ao ${depoisDoLongo})`));
    k = depoisDoLongo;
    conferir(await p.isVisible('.voltar-hoje'), rotulo('longe de hoje, o "voltar para hoje" aparece'));
    m = await fase('rápido (200 px em 80 ms)', () => arrastar(cdp, p, linha(X + W - 20, Y, X + W - 220, Y, 5), 16), 1800);
    deLado(m, 'rápido');
    conferir((await encaixado('rápido')) > k, rotulo('rápido: andou para a frente'));
    m = await fase('rápido para trás', () => arrastar(cdp, p, linha(X + 20, Y, X + 240, Y, 5), 16), 1800);
    deLado(m, 'rápido para trás');
    k = await encaixado('rápido para trás');
    m = await fase('diagonal (-150, -120)', () => arrastar(cdp, p, linha(X + W - 30, Y + 60, X + W - 180, Y - 60, 14), 16), 1500);
    deLado(m, 'diagonal');
    k = await encaixado('diagonal');
    m = await fase('de cima para baixo, sobre a agenda', () => arrastar(cdp, p, linha(X + W / 2, Y + 10, X + W / 2 + 6, Y + 200, 14), 16), 1500);
    conferir(m.rolou === 0 && m.paginaRolouPx < -50 && m.paginaX === 0, rotulo(`de cima para baixo: a faixa fica e a página rola (${m.paginaRolouPx} px)`));
    await levarAteAAgenda(p);

    // os cards: a partir de hoje, que tem três
    await p.evaluate((h) => {
      const s = document.querySelector('.secao-trello .semana');
      s.scrollTo({ left: h * (s.children[1].offsetLeft - s.children[0].offsetLeft) });
    }, HOJE);
    await p.waitForTimeout(500);
    const [cx, cy] = await cardAVista(p);
    m = await fase('começando num card (180 px)', () => arrastar(cdp, p, linha(cx + 40, cy, cx - 140, cy + 3, 14), 16));
    deLado(m, 'começando num card');
    conferir(m.aberto === 0, rotulo('o arrasto que começa num card não o abre'));
    k = await encaixado('começando num card');

    const [tx, ty] = await cardAVista(p);
    m = await fase('toque num card', () => p.touchscreen.tap(tx, ty), 900);
    conferir(m.aberto === 1 && m.rolou === 0, rotulo('o toque abre o card, sem rolar a faixa'));
    m = await fase('toque com tremida de 4 px', () => arrastar(cdp, p, [[tx, ty], [tx + 2, ty + 1], [tx + 4, ty + 1]], 30), 900);
    conferir(m.aberto === 0 && m.rolou === 0, rotulo('o toque com tremida fecha o card, sem rolar a faixa'));

    // as setas andam um dia; toques seguidos somam no destino, e a rolagem é suave
    k = await diaAVista(p);
    m = await fase('seta › três vezes seguidas', async () => {
      for (let n = 0; n < 3; n++) {
        await p.tap('.secao-trello .semana-nav button[aria-label="Próximo dia"]');
        await p.waitForTimeout(70);
      }
    }, 1500);
    conferir(m.inversoes === 0 && m.textoNoMeio === 0 && m.quadros > 5 && m.maiorPasso < m.rolou, rotulo(`seta ›: rola suave (${m.rolou} px), sem tremor e sem trocar o topo no meio`));
    conferir((await encaixado('seta ›')) === k + 3, rotulo('seta › três vezes: três dias para a frente'));
    m = await fase('seta ‹ duas vezes seguidas', async () => {
      for (let n = 0; n < 2; n++) {
        await p.tap('.secao-trello .semana-nav button[aria-label="Dia anterior"]');
        await p.waitForTimeout(70);
      }
    }, 1500);
    conferir((await encaixado('seta ‹')) === k + 1 && m.inversoes === 0, rotulo('seta ‹ duas vezes: dois dias para trás'));
    m = await fase('voltar para hoje', () => p.tap('.voltar-hoje'), 1800);
    conferir((await encaixado('voltar para hoje')) === HOJE && m.inversoes === 0 && m.textoNoMeio === 0, rotulo('"voltar para hoje" rola suave até hoje e amanhã'));
    conferir(!(await p.isVisible('.voltar-hoje')), rotulo('de volta em hoje, o "voltar para hoje" some'));
    const [, resumo2] = await textoDoTopo(p);
    conferir(resumo2 === '4 cards · 1 entregue · 1 prioridade', rotulo('de volta em hoje, o resumo de hoje e amanhã'));

    // as pontas: a seta para no primeiro dia e no último
    await p.evaluate(() => document.querySelector('.secao-trello .semana').scrollTo({ left: 0 }));
    await p.waitForTimeout(500);
    conferir(await p.isDisabled('.secao-trello .semana-nav button[aria-label="Dia anterior"]'), rotulo('no primeiro dia da faixa, a seta ‹ fica desligada'));
    const fimX = await p.evaluate(() => {
      const s = document.querySelector('.secao-trello .semana');
      s.scrollTo({ left: s.scrollWidth });
      return s.scrollWidth;
    });
    await p.waitForTimeout(500);
    conferir(fimX > 0 && (await p.isDisabled('.secao-trello .semana-nav button[aria-label="Próximo dia"]')), rotulo('no último dia da faixa, a seta › fica desligada'));
    conferir(await p.evaluate(() => scrollX === 0 && document.documentElement.scrollWidth <= innerWidth), rotulo('no fim, a página não rolou para o lado'));
    conferir(erros.length === 0, rotulo(`nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`));
    return medicao;
  } finally {
    await ctx.close();
  }
}

/** A agenda encolhida (com revisão na fila): o card só com a claquete, e o "ver a semana inteira" no pé. */
async function encolhida(navegador, url, conferir) {
  const { ctx, p, erros } = await abrirNoCelular(navegador, url, 'iPhone 13');
  try {
    conferir(await p.isVisible('.secao-trello.encolhida'), 'encolhida: com revisão na fila, a agenda encolhe');
    conferir(await p.isVisible('.pe-agenda .botao-texto:has-text("ver a semana inteira")'), 'encolhida: "ver a semana inteira" no pé');
    const antes = await diaAVista(p);
    await p.click('.pe-agenda .botao-texto:has-text("ver a semana inteira")');
    await p.waitForTimeout(400);
    conferir(!(await p.$('.secao-trello.encolhida')) && (await diaAVista(p)) === antes, 'encolhida: "ver a semana inteira" volta ao tamanho normal, nos mesmos dias');
    await p.click('.pe-agenda .botao-texto:has-text("recolher a semana")');
    await p.waitForTimeout(300);
    conferir(erros.length === 0, `encolhida: nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`);
  } finally {
    await ctx.close();
  }
}

async function principal() {
  const amb = await subir();
  const navegador = await chromium.launch();
  let falhou = false;
  const conferir = (ok, oque) => {
    console.log(`${ok ? 'ok  ' : 'FALHOU'} ${oque}`);
    if (!ok) falhou = true;
  };
  const medicao = {};
  try {
    await semearAgenda(amb.api);
    for (const nome of ['iPhone 13', 'Galaxy S24']) medicao[nome] = await gestos(navegador, amb.url, nome, conferir);
    await semearRevisao(amb.api);
    await encolhida(navegador, amb.url, conferir);
  } catch (e) {
    conferir(false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    await navegador.close();
    await amb.descer();
  }
  if (process.env.MEDICAO) writeFileSync(process.env.MEDICAO, JSON.stringify(medicao, null, 1));
  process.exit(falhou ? 1 : 0);
}

module.exports = { semearAgenda, semearRevisao, abrirNoCelular, aparelho, levarAteAAgenda, ANDAMENTO };
if (require.main === module) void principal();
