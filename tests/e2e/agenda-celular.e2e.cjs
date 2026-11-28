// Ponta a ponta da agenda No Trello no celular (spec #37, #40 e as animações do #41) e das mesmas animações na semana do
// computador, rodado à parte do vitest: `npm run e2e:agenda`.
//
// Sobe o servidor e o Vite como o e2e do tour (banco temporário, dados fictícios, nada sai para a rede), abre a tela
// inicial em tamanho de iPhone e de Android e arrasta a faixa de dias com toque emulado pelo CDP: curto, longo,
// rápido, diagonal, de cima para baixo e começando num card. Quadro a quadro (requestAnimationFrame), confere que a
// faixa nunca anda contra o movimento, que a página não rola (nem para o lado), que as colunas não se mexem por dentro e
// que o topo (período e resumo) só troca quando a rolagem termina. Confere também que o toque abre o card e o arrasto
// não, as setas e o "voltar para hoje", a faixa já em hoje antes de pintar, a agenda encolhida e que o tour não aparece.
// No computador, troca de semana pelas setas e pelo "voltar para hoje" e confere, quadro a quadro, que os números dos
// dias e o período contam (os meses apagados antes, sem mês errado à vista), que o resumo conta, que os cards saem e
// entram em vez de trocar de estalo, que as marcas do dia se escrevem, que a seta da direita não sai do lugar e que nada
// anima na primeira carga nem com o movimento reduzido.
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
const LIA = 'lia.moraes@exemplo.com';
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
/** Um instante `n` dias depois de hoje, à hora `h` (ISO). */
const instante = (n, h) => {
  const d = diaMais(n);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};
// o andamento fictício (pela rota): um entregue (ontem) e um na lista de prioridade hoje, um produzindo amanhã; a
// entrada na produção de alguns (o critério "entrada"); os outros, que já estavam no Trello, ficam sem data por entrada
const ANDAMENTO = {
  agdhoje1: { status: ['FINALIZADO'], designers: ['Ana Arte'], entregue: true, entrega: instante(-1, 18), entrada: instante(-3, 10) },
  agdhoje2: { status: ['EM APROVAÇÃO'], designers: ['Bia Arte'], entregue: false, entrega: null, prioridade: true, entrada: instante(-1, 11) },
  agdhoje3: { status: ['PRODUZINDO'], designers: [], entregue: false, entrega: null, entrada: instante(0, 9) },
  agdamanha: { status: ['PRODUZINDO'], designers: ['Caio Traço'], entregue: false, entrega: null, entrada: instante(0, 8) },
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
      aberto: document.querySelectorAll('.card-aberto-camada').length,
      // onde estão as setas, de lado: o seletor tem largura fixa, elas nunca se mexem (nem com o topo contando)
      setas: [...document.querySelectorAll('.secao-trello .semana-nav .botao-icone')].map((b) => Math.round(b.getBoundingClientRect().left * 10) / 10).join(','),
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
  let interno = 0, paginaY = 0, paginaX = 0, textoNoMeio = 0, maiorPasso = 0, setas = 0;
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
    if (q[k].setas !== q[k - 1].setas) setas++;
  }
  const inversoes = inversoesComDedo + inversoesSolto;
  return { quadros: q.length, rolou: Math.round(xFim - q[0].x), inversoes, inversoesComDedo, inversoesSolto, voltaDoEncaixe: Math.max(0, volta), maiorPasso: Math.round(maiorPasso), interno, paginaY, paginaRolouPx: Math.round(q[q.length - 1].y - q[0].y), paginaX, textoNoMeio, setas, textoFinal: q[q.length - 1].texto, aberto: q[q.length - 1].aberto };
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
      conferir(m.setas === 0, rotulo(`${n}: as setas não saem do lugar, nem com o topo contando`));
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
    // a faixa parou em hoje: espera o topo terminar de contar (cerca de meio segundo), para o gesto começar parado
    await p.waitForTimeout(900);
    const [cx, cy] = await cardAVista(p);
    m = await fase('começando num card (180 px)', () => arrastar(cdp, p, linha(cx + 40, cy, cx - 140, cy + 3, 14), 16));
    deLado(m, 'começando num card');
    conferir(m.aberto === 0, rotulo('o arrasto que começa num card não o abre'));
    k = await encaixado('começando num card');

    const [tx, ty] = await cardAVista(p);
    m = await fase('toque num card', () => p.touchscreen.tap(tx, ty), 900);
    conferir(m.aberto === 1 && m.rolou === 0, rotulo('o toque abre o card, sem rolar a faixa'));
    // #171: o card abre no centro (CardAberto), na tela toda: o X fecha e volta ao card
    const fecharOCard = async () => {
      await p.tap('.card-aberto-fechar');
      await p.locator('.card-aberto-camada').waitFor({ state: 'detached', timeout: 5000 });
      await p.waitForTimeout(300);
    };
    await fecharOCard();
    m = await fase('toque com tremida de 4 px', () => arrastar(cdp, p, [[tx, ty], [tx + 2, ty + 1], [tx + 4, ty + 1]], 30), 900);
    conferir(m.aberto === 1 && m.rolou === 0, rotulo('o toque com tremida também abre o card, sem rolar a faixa'));
    await fecharOCard();

    // as setas andam um dia; toques seguidos somam no destino, e a rolagem é suave
    k = await diaAVista(p);
    m = await fase('seta › três vezes seguidas', async () => {
      for (let n = 0; n < 3; n++) {
        await p.tap('.secao-trello .semana-nav button[aria-label="Próximo dia"]');
        await p.waitForTimeout(70);
      }
    }, 1500);
    conferir(m.inversoes === 0 && m.textoNoMeio === 0 && m.setas === 0 && m.quadros > 5 && m.maiorPasso < m.rolou, rotulo(`seta ›: rola suave (${m.rolou} px), sem tremor, sem trocar o topo no meio e sem as setas saírem do lugar`));
    conferir((await encaixado('seta ›')) === k + 3, rotulo('seta › três vezes: três dias para a frente'));
    m = await fase('seta ‹ duas vezes seguidas', async () => {
      for (let n = 0; n < 2; n++) {
        await p.tap('.secao-trello .semana-nav button[aria-label="Dia anterior"]');
        await p.waitForTimeout(70);
      }
    }, 1500);
    conferir((await encaixado('seta ‹')) === k + 1 && m.inversoes === 0 && m.setas === 0, rotulo('seta ‹ duas vezes: dois dias para trás'));
    m = await fase('voltar para hoje', () => p.tap('.voltar-hoje'), 1800);
    conferir((await encaixado('voltar para hoje')) === HOJE && m.inversoes === 0 && m.textoNoMeio === 0 && m.setas === 0, rotulo('"voltar para hoje" rola suave até hoje e amanhã'));
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

/* ---------- No computador: a semana de sete colunas ---------- */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** O período de sete dias que começa `k` dias depois de hoje, como o computador escreve. */
const periodoDesde = (k) => {
  const [a, b] = [diaMais(k), diaMais(k + 6)];
  return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} de ${MESES[b.getMonth()]}` : `${a.getDate()} de ${MESES[a.getMonth()]} – ${b.getDate()} de ${MESES[b.getMonth()]}`;
};
/** O período da semana `n` semanas a partir da de agora (que começa ontem). */
const periodoDaSemana = (n) => periodoDesde(7 * n - 1);
/** Os números das sete colunas da semana `n`. */
const numerosDaSemana = (n) => Array.from({ length: 7 }, (_, i) => diaMais(7 * n - 1 + i).getDate()).join(' ');

// a cada quadro: o instante, o período como se vê (o mês apagado, ou dentro de uma vaga que fecha transparente, não
// conta: ele está na página, mas não à vista) e se algum mês está à vista, os números das colunas, as marcas, o resumo,
// as setas, os cards meio transparentes e as animações em curso nas marcas do dia. Cada fase começa um laço novo, que
// substitui o anterior: sem isso, a terceira fase gravaria cada quadro três vezes (e as cópias pareceriam quadros
// parados no meio de um movimento)
const QUADROS_DO_COMPUTADOR = () => {
  window.__log = [];
  const laco = (window.__laco = (window.__laco ?? 0) + 1);
  const f = () => {
    if (window.__laco !== laco) return;
    const sec = document.querySelector('.secao-trello');
    const b = sec.querySelector('.semana-nav b');
    const setas = [...sec.querySelectorAll('.semana-nav .botao-icone')].map((e) => Math.round(e.getBoundingClientRect().left * 10) / 10);
    const aVista = (e) => {
      for (let x = e; x && x !== b; x = x.parentElement) if (+getComputedStyle(x).opacity <= 0.05) return false;
      return true;
    };
    const ocultos = [...b.querySelectorAll('.p-mes')].filter((m) => !aVista(m));
    const textos = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    let periodo = '';
    for (let t = textos.nextNode(); t; t = textos.nextNode()) if (!ocultos.some((m) => m.contains(t))) periodo += t.textContent;
    window.__log.push({
      t: performance.now(),
      periodo,
      mesAVista: [...b.querySelectorAll('.p-mes')].some((m) => aVista(m)),
      numeros: [...sec.querySelectorAll('.coluna .dia-num')].map((e) => e.textContent).join(' '),
      marcas: [...sec.querySelectorAll('.coluna .dia-rel')].map((e) => e.textContent).join(','),
      circulo: !!sec.querySelector('.coluna .dia-num svg'),
      escrevendo: [...sec.querySelectorAll('.coluna .dia-num path, .coluna .dia-rel')].some((e) => e.getAnimations().length > 0),
      resumo: sec.querySelector('.secao-trello-conta').textContent,
      esquerda: setas[0],
      direita: setas[1],
      transparentes: [...sec.querySelectorAll('.coluna-corpo > *')].filter((e) => +getComputedStyle(e).opacity < 0.95).length,
    });
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
};

/**
 * Onde a seta da esquerda salta, ou null. Mede por quadro, não por tempo: o passo de cada quadro é contado como se o
 * quadro durasse 1/60 s (um quadro atrasado pela máquina não vira salto). A seta anda em movimentos (separados por
 * dois quadros parados): o que muda a largura de uma vez (um algarismo a mais) anda no máximo 6 px por quadro; o que
 * muda muito (o " de novembro" da esquerda abrindo ou fechando a vaga, ~90 px) pode andar mais por quadro, mas nunca
 * mais que um terço do caminho num quadro só. Um salto de estalo (o caminho inteiro num quadro) falha nos dois casos.
 */
function saltoDaSeta(log) {
  const movimentos = [];
  let atual = null;
  let parados = 0;
  for (let k = 1; k < log.length; k++) {
    const d = Math.abs(log[k].esquerda - log[k - 1].esquerda);
    if (d < 0.05) {
      if (++parados >= 2 && atual) movimentos.push(atual), (atual = null);
      continue;
    }
    parados = 0;
    (atual ??= []).push(d / Math.max(1, (log[k].t - log[k - 1].t) / (1000 / 60)));
  }
  if (atual) movimentos.push(atual);
  for (const passos of movimentos) {
    const caminho = passos.reduce((a, b) => a + b, 0);
    const maior = Math.max(...passos);
    if (maior > Math.max(6, caminho / 3)) return `maior passo ${maior.toFixed(1)} px de um caminho de ${caminho.toFixed(1)} px em ${passos.length} quadros`;
  }
  return null;
}

/** Anota cada animação feita por código dentro da agenda (o elemento), desde antes de a página carregar. */
const ANOTAR_ANIMACOES = () => {
  window.__animadas = [];
  const animar = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    if (this.closest?.('.secao-trello')) window.__animadas.push({ conta: !!this.closest('.secao-trello-conta'), el: `${this.className?.baseVal ?? this.className}`.trim() });
    return animar.apply(this, args);
  };
};

/** A semana do computador: a primeira carga parada, a troca pelas setas e pelo "voltar para hoje" e o movimento reduzido. */
async function computador(navegador, url, conferir) {
  for (const reduzido of [false, true]) {
    const rotulo = (t) => `computador${reduzido ? ' (movimento reduzido)' : ''}: ${t}`;
    const { ctx, p, erros } = await contexto(navegador, 'about:blank', { viewport: { width: 1440, height: 900 }, reducedMotion: reduzido ? 'reduce' : 'no-preference' });
    try {
      await ctx.route('**/api/andamento', (r) => r.fulfill({ json: ANDAMENTO }));
      await ctx.addInitScript(ANOTAR_ANIMACOES);
      await p.goto(url);
      await p.waitForSelector('.secao-trello .semana .coluna');
      await p.waitForTimeout(1200);
      // a primeira carga: só anima o que o celular também anima, o resumo quando o andamento chega ("· 1 entregue" abre
      // a vaga e a prioridade se escreve); o período, os números, as marcas do dia e os cards ficam parados
      const naCarga = await p.evaluate(() => window.__animadas);
      const foraDoResumo = naCarga.filter((a) => !a.conta);
      conferir(foraDoResumo.length === 0 && (!reduzido || naCarga.length === 0), rotulo(`na primeira carga, só o resumo anima, como no celular${foraDoResumo.length ? `: ${foraDoResumo.map((a) => a.el).join(', ')}` : ''}`));
      await p.evaluate(() => scrollTo(0, document.querySelector('.secao-trello').getBoundingClientRect().top + scrollY - 8));
      const topo = () => p.evaluate(() => [document.querySelector('.secao-trello .semana-nav b').textContent, [...document.querySelectorAll('.secao-trello .coluna .dia-num')].map((e) => e.textContent).join(' '), [...document.querySelectorAll('.secao-trello .coluna .dia-rel')].map((e) => e.textContent).join(',')]);
      const [per, nums, marcas] = await topo();
      conferir(per === periodoDaSemana(0) && nums === numerosDaSemana(0) && marcas === 'ontem,hoje,amanhã', rotulo(`abre na semana de agora: "${per}", ${nums}, ${marcas}`));
      conferir(!(await p.isVisible('.secao-trello .voltar-hoje')), rotulo('na semana de agora, sem o "voltar para hoje"'));

      const fase = async (fn, espera = 1100) => {
        await p.evaluate(QUADROS_DO_COMPUTADOR);
        await fn();
        await p.waitForTimeout(espera);
        const log = await p.evaluate(() => window.__log);
        await p.evaluate(() => (window.__log = []));
        return log;
      };
      const distintos = (log, campo) => [...new Set(log.map((q) => q[campo]))];
      const conferirTroca = (log, n, de, para) => {
        const ultimo = log[log.length - 1];
        conferir(ultimo.periodo === periodoDaSemana(para) && ultimo.numeros === numerosDaSemana(para), rotulo(`${n}: chega à semana certa ("${ultimo.periodo}")`));
        const meio = distintos(log, 'numeros').filter((x) => x !== numerosDaSemana(de) && x !== numerosDaSemana(para));
        const periodos = distintos(log, 'periodo');
        // as semanas inteiras entre a partida e a chegada (dois toques seguidos, sem movimento, passam por uma delas)
        const semanas = Array.from({ length: Math.abs(para - de) + 1 }, (_, k) => de + k * Math.sign(para - de));
        if (reduzido) {
          conferir(meio.every((x) => semanas.some((w) => numerosDaSemana(w) === x)) && periodos.every((x) => semanas.some((w) => periodoDaSemana(w) === x)), rotulo(`${n}: só a troca, sem contar`));
          conferir(log.every((q) => q.transparentes === 0 && !q.escrevendo), rotulo(`${n}: os cards e as marcas só trocam`));
          return;
        }
        conferir(meio.length >= 2, rotulo(`${n}: os números dos dias contam pelas datas (${meio.length} quadros no caminho)`));
        conferir(periodos.length >= 3, rotulo(`${n}: o período conta junto (${periodos.length} períodos)`));
        // com o mês à vista, o período é sempre um período de verdade (sete dias seguidos com os meses deles)
        const deVerdade = new Set();
        for (let k = Math.min(de, para) * 7 - 1; k <= Math.max(de, para) * 7 - 1; k++) deVerdade.add(periodoDesde(k));
        const errado = log.filter((q) => q.mesAVista && !deVerdade.has(q.periodo));
        conferir(errado.length === 0, rotulo(`${n}: nenhum mês errado à vista${errado.length ? ` (${errado[0].periodo})` : ''}`));
        conferir(log.some((q) => q.transparentes > 0), rotulo(`${n}: os cards saem e entram, sem trocar de estalo`));
        conferir(distintos(log, 'direita').length === 1, rotulo(`${n}: a seta da direita não sai do lugar`));
        const salto = saltoDaSeta(log);
        conferir(!salto, rotulo(`${n}: a seta da esquerda anda suave quando o período muda de largura${salto ? ` (${salto})` : ''}`));
      };

      let log = await fase(() => p.click('.secao-trello button[aria-label="Próxima semana"]'));
      conferirTroca(log, 'semana seguinte', 0, 1);
      conferir(log[log.length - 1].marcas === '' && !log[log.length - 1].circulo, rotulo('semana seguinte: sem as marcas do dia'));
      if (!reduzido) conferir(distintos(log, 'resumo').length >= 3, rotulo(`semana seguinte: o resumo conta (${distintos(log, 'resumo').join(' → ')})`));
      conferir(await p.isVisible('.secao-trello .voltar-hoje'), rotulo('semana seguinte: o "voltar para hoje" aparece'));

      log = await fase(async () => {
        await p.click('.secao-trello button[aria-label="Semana anterior"]');
        await p.waitForTimeout(60);
        await p.click('.secao-trello button[aria-label="Semana anterior"]');
      }, 1300);
      conferirTroca(log, 'duas para trás, seguidas', 1, -1);

      log = await fase(() => p.click('.secao-trello .voltar-hoje'), 1300);
      conferirTroca(log, 'voltar para hoje', -1, 0);
      const fim = log[log.length - 1];
      conferir(fim.marcas === 'ontem,hoje,amanhã' && fim.circulo, rotulo('voltar para hoje: as marcas do dia e o círculo voltam'));
      if (!reduzido) {
        const primeiraMarca = log.findIndex((q) => q.marcas);
        const ultimaContagem = log.map((q) => q.numeros !== numerosDaSemana(0)).lastIndexOf(true);
        conferir(primeiraMarca > ultimaContagem, rotulo('voltar para hoje: as marcas só aparecem depois que os números terminam de contar'));
        conferir(log.some((q) => q.escrevendo && q.circulo), rotulo('voltar para hoje: o círculo e as palavras se escrevem à mão'));
      }
      await p.waitForTimeout(400);
      conferir(!(await p.isVisible('.secao-trello .voltar-hoje')), rotulo('de volta em hoje, o "voltar para hoje" sai'));
      conferir(erros.length === 0, rotulo(`nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`));
    } finally {
      await ctx.close();
    }
  }
}

/* ---------- O critério da agenda: exibição, entrada ou entrega ---------- */

// a cada quadro, onde está o card que troca de coluna e o resumo
const QUADROS_DO_CRITERIO = () => {
  window.__log = [];
  const f = () => {
    const c = document.querySelector('.secao-trello .semana [data-card="agdhoje1"]');
    const r = c?.getBoundingClientRect();
    window.__log.push({ x: r ? Math.round(r.left * 10) / 10 : null, y: r ? Math.round(r.top * 10) / 10 : null, resumo: document.querySelector('.secao-trello-conta').textContent });
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
};

/** As abas do critério no computador: o card voa de uma coluna para a outra (sem teleporte), o resumo muda, a semana por
    entrada termina hoje, as setas do teclado trocam de aba e o critério fica guardado depois de recarregar. */
async function criterio(navegador, url, conferir) {
  for (const reduzido of [false, true]) {
    const rotulo = (t) => `critério${reduzido ? ' (movimento reduzido)' : ''}: ${t}`;
    const { ctx, p, erros } = await contexto(navegador, 'about:blank', { viewport: { width: 1440, height: 900 }, reducedMotion: reduzido ? 'reduce' : 'no-preference' });
    try {
      await ctx.route('**/api/andamento', (r) => r.fulfill({ json: ANDAMENTO }));
      await p.goto(url);
      await p.waitForSelector('.secao-trello .semana .coluna');
      await p.waitForTimeout(1200);
      await p.evaluate(() => scrollTo(0, document.querySelector('.secao-trello').getBoundingClientRect().top + scrollY - 8));
      const ativa = () => p.evaluate(() => document.querySelector('.abas-criterio [aria-selected="true"]')?.dataset.criterio);
      const colunaDe = (id) => p.evaluate((id) => document.querySelector(`.secao-trello [data-card="${id}"]`)?.closest('.coluna')?.getAttribute('aria-label') ?? (document.querySelector(`.secao-trello .sem-data [data-card="${id}"]`) ? 'sem data' : null), id);
      const resumo = () => p.textContent('.secao-trello-conta');
      conferir((await ativa()) === 'exibicao' && (await colunaDe('agdhoje1')).endsWith(', hoje'), rotulo('abre por exibição, com o card de hoje em hoje'));
      const resumoExibicao = await resumo();
      conferir(/^\d+ cards/.test(resumoExibicao) && resumoExibicao.includes('1 prioridade'), rotulo(`o resumo por exibição ("${resumoExibicao}")`));

      // por entrega: o card entregue ontem voa de hoje para ontem; o que ainda não saiu fica em hoje, tracejado
      await p.evaluate(QUADROS_DO_CRITERIO);
      await p.click('.abas-criterio [data-criterio="entrega"]');
      await p.waitForTimeout(1100);
      const log = await p.evaluate(() => window.__log);
      conferir((await colunaDe('agdhoje1')).endsWith(', ontem'), rotulo('por entrega, o card entregue ontem fica em ontem'));
      conferir(await p.isVisible('.secao-trello .semana [data-card="agdhoje3"].a-entregar'), rotulo('por entrega, o que ainda não saiu fica no dia da exibição, tracejado'));
      const xs = log.map((q) => q.x).filter((x) => x !== null);
      const [x0, x1] = [xs[0], xs[xs.length - 1]];
      let passo = 0;
      for (let k = 1; k < xs.length; k++) passo = Math.max(passo, Math.abs(xs[k] - xs[k - 1]));
      const caminho = new Set(xs.filter((x) => Math.abs(x - x0) > 1 && Math.abs(x - x1) > 1)).size;
      if (reduzido) conferir(caminho === 0, rotulo('com o movimento reduzido, o card troca de coluna na hora'));
      else conferir(caminho >= 4 && passo < Math.abs(x1 - x0) / 2, rotulo(`o card voa de uma coluna para a outra, sem teleporte (${caminho} quadros no caminho, maior passo ${passo} px de ${Math.abs(x1 - x0)})`));
      const resumoEntrega = await resumo();
      conferir(/entregues? · \d+ a entregar/.test(resumoEntrega) && resumoEntrega !== resumoExibicao, rotulo(`o resumo muda com o critério ("${resumoEntrega}")`));
      const resumos = [...new Set(log.map((q) => q.resumo))];
      if (reduzido) conferir(resumos.length <= 2, rotulo(`com o movimento reduzido, o resumo só troca (${resumos.join(' → ')})`));
      else conferir(resumos.length >= 3, rotulo(`o resumo conta até o novo (${resumos.length} resumos no caminho)`));

      // por entrada: a semana termina hoje, na última coluna; as setas do teclado trocam de aba
      await p.focus('.abas-criterio [aria-selected="true"]');
      await p.keyboard.press('ArrowLeft');
      await p.waitForTimeout(1100);
      const colunas = await p.$$eval('.secao-trello .semana .coluna', (cs) => cs.map((c) => c.getAttribute('aria-label')));
      conferir((await ativa()) === 'entrada' && colunas[6].endsWith(', hoje') && colunas[5].endsWith(', ontem'), rotulo('a seta ← leva para entrada, e a semana termina hoje'));
      conferir((await colunaDe('agdhoje3')).endsWith(', hoje') && (await colunaDe('agdhoje2')).endsWith(', ontem') && (await colunaDe('agdmais2a')) === 'sem data', rotulo('por entrada, cada card no dia em que entrou; o que já estava no Trello sem a entrada fica no "sem data"'));
      conferir(/^\d+ entraram/.test(await resumo()), rotulo(`o resumo por entrada ("${await resumo()}")`));
      conferir(await p.evaluate(() => document.activeElement?.dataset.criterio === 'entrada'), rotulo('o foco vai junto para a aba nova'));

      // o critério fica guardado no navegador
      await p.reload();
      await p.waitForSelector('.secao-trello .semana .coluna');
      await p.waitForTimeout(800);
      conferir((await ativa()) === 'entrada' && (await colunaDe('agdhoje3')).endsWith(', hoje'), rotulo('depois de recarregar, o critério continua o mesmo'));
      await p.click('.abas-criterio [data-criterio="exibicao"]');
      await p.waitForTimeout(900);
      conferir((await colunaDe('agdhoje1')).endsWith(', hoje'), rotulo('de volta por exibição, o card volta para hoje'));
      conferir(erros.length === 0, rotulo(`nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`));
    } finally {
      await ctx.close();
    }
  }
}

/* ---------- O filtro das prioridades: o "N prioridades" do topo ---------- */

// a cada quadro: onde está o card de prioridade de hoje (o que fica), dentro da agenda e na tela (a página pode rolar
// junto, quando a agenda encolhe no fim da página), e a altura de cada vaga de card nas colunas
const QUADROS_DO_FILTRO = () => {
  window.__log = [];
  const laco = (window.__laco = (window.__laco ?? 0) + 1);
  const f = () => {
    if (window.__laco !== laco) return;
    const sec = document.querySelector('.secao-trello');
    const fica = sec.querySelector('.semana [data-card="agdhoje2"]');
    window.__log.push({
      fica: fica ? Math.round((fica.getBoundingClientRect().top - sec.getBoundingClientRect().top) * 10) / 10 : null,
      tela: fica ? Math.round(fica.getBoundingClientRect().top * 10) / 10 : null,
      vagas: [...sec.querySelectorAll('.semana .coluna-corpo > .vaga-y')].map((v) => ({ id: v.querySelector('[data-card]')?.dataset.card, h: Math.round(v.getBoundingClientRect().height * 10) / 10 })),
    });
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
};

/** Os cards à vista na agenda (fora dos que estão fechando a vaga e dos fantasmas da troca de critério). */
const cardsAVista = (p) => p.$$eval('.secao-trello [data-card]', (cs) => cs.filter((c) => !c.closest('.saindo, .camada-voo')).map((c) => c.dataset.card).sort());
const botaoDoFiltro = (p) => p.evaluate(() => {
  const b = document.querySelector('.secao-trello-conta .prio-filtro');
  return b && { pressionado: b.getAttribute('aria-pressed'), texto: b.textContent, risco: !!b.querySelector('svg.sub'), botao: b.tagName === 'BUTTON' };
});

/**
 * Quantos quadros cada vaga que mudou passou no meio do caminho (nem inteira nem fechada) e o passo do card que fica.
 * Uma vaga que fecha ou abre de estalo passa zero quadros no meio; o card que fica, se teleporta, anda tudo num quadro.
 */
function semTeleporte(log, ids) {
  const altura = (q, id) => q.vagas.find((v) => v.id === id)?.h ?? 0;
  const inteira = Object.fromEntries(ids.map((id) => [id, Math.max(...log.map((q) => altura(q, id)))]));
  const noMeio = Object.fromEntries(ids.map((id) => [id, log.filter((q) => { const h = altura(q, id); return h > 1 && h < inteira[id] - 1; }).length]));
  const maiorPasso = (ys) => {
    let passo = 0;
    for (let k = 1; k < ys.length; k++) passo = Math.max(passo, Math.abs(ys[k] - ys[k - 1]));
    return Math.round(passo * 10) / 10;
  };
  const ys = log.map((q) => q.fica).filter((y) => y !== null);
  const caminho = Math.round(Math.abs(ys[ys.length - 1] - ys[0]) * 10) / 10;
  // na tela, o card também anda com a página, que rola junto quando a agenda encolhe no fim dela
  const naTela = log.map((q) => q.tela).filter((y) => y !== null);
  return { noMeio, menosNoMeio: Math.min(...Object.values(noMeio)), passo: maiorPasso(ys), caminho, passoNaTela: maiorPasso(naTela), caminhoNaTela: Math.round(Math.abs(naTela[naTela.length - 1] - naTela[0]) * 10) / 10 };
}

/** O filtro das prioridades no computador (com e sem movimento reduzido) e no celular: clicar mostra só as prioridades,
    os outros cards fecham a vaga sem teleporte, clicar de novo traz tudo de volta, o teclado liga e desliga, recarregar
    volta sem filtro e, quando os dias à vista ficam sem prioridade, o filtro desliga sozinho. Os cards fictícios estão
    em dias contados a partir de hoje: nada aqui depende da data em que roda. */
async function filtroDasPrioridades(navegador, url, conferir) {
  const casos = [
    { nome: 'computador', reduzido: false },
    { nome: 'computador', reduzido: true },
    { nome: 'iPhone 13', reduzido: false },
  ];
  for (const { nome, reduzido } of casos) {
    const celular = nome !== 'computador';
    const rotulo = (t) => `filtro das prioridades, ${nome}${reduzido ? ' (movimento reduzido)' : ''}: ${t}`;
    const aberto = celular
      ? await abrirNoCelular(navegador, url, nome)
      : await contexto(navegador, 'about:blank', { viewport: { width: 1440, height: 900 }, reducedMotion: reduzido ? 'reduce' : 'no-preference' });
    const { ctx, p, erros } = aberto;
    try {
      if (!celular) {
        await ctx.route('**/api/andamento', (r) => r.fulfill({ json: ANDAMENTO }));
        await p.goto(url);
        await p.waitForSelector('.secao-trello .semana .coluna');
        await p.waitForTimeout(1200);
      }
      await levarAteAAgenda(p);
      // à vista: no computador, a semana de agora (de ontem a cinco dias depois de hoje); no celular, hoje e amanhã
      const todos = await cardsAVista(p);
      const b0 = await botaoDoFiltro(p);
      conferir(b0?.botao && b0.pressionado === 'false' && b0.texto === '1 prioridade' && !b0.risco, rotulo(`o "1 prioridade" é um botão, desligado e sem o risco (${JSON.stringify(b0)})`));
      conferir(todos.includes('agdhoje2') && todos.length > 2, rotulo(`abre com todos os cards (${todos.length})`));
      // a etapa do card na bolinha de estado (BolinhaDeEstado, #172), a mesma da Pauta da edição
      const bolinhaDaEtapa = await p.$eval('.secao-trello [data-card="agdhoje2"] .card-semana-etapa', (e) => e.querySelector('.bolinha-estado')?.dataset.estado ?? null);
      conferir(bolinhaDaEtapa === 'aprovacao', rotulo(`a etapa na bolinha de estado compartilhada (${bolinhaDaEtapa})`));
      const saem = (await p.$$eval('.secao-trello .semana .coluna-corpo [data-card]', (cs) => cs.map((c) => c.dataset.card))).filter((id) => id !== 'agdhoje2');

      const resumoAntes = await p.textContent('.secao-trello-conta > span');
      // clicar: só a prioridade fica; os outros fecham a vaga, e o card que fica sobe até o lugar novo sem saltar
      await p.evaluate(QUADROS_DO_FILTRO);
      await p.click('.secao-trello-conta .prio-filtro');
      await p.waitForTimeout(900);
      let log = await p.evaluate(() => window.__log);
      const b1 = await botaoDoFiltro(p);
      conferir(b1.pressionado === 'true' && b1.risco, rotulo('clicar liga o filtro: aria-pressed e o risco à mão embaixo'));
      conferir(JSON.stringify(await cardsAVista(p)) === JSON.stringify(['agdhoje2']), rotulo(`clicar mostra só a prioridade (${(await cardsAVista(p)).join(', ')})`));
      conferir(!(await p.$('.secao-trello .sem-data')), rotulo('o "sem data" sem prioridade sai'));
      conferir(await p.evaluate(() => [...document.querySelectorAll('.secao-trello .coluna')].find((c) => c.getAttribute('aria-label').endsWith(', amanhã'))?.querySelector('.nada')?.textContent === 'nada ainda'), rotulo('amanhã, sem prioridade, mostra o "nada ainda"'));
      const resumoLigado = await p.textContent('.secao-trello-conta > span');
      conferir(resumoLigado === resumoAntes, rotulo(`o resumo continua contando todos os cards dos dias à vista ("${resumoLigado}")`));
      let m = semTeleporte(log, saem);
      if (reduzido) conferir(m.menosNoMeio === 0 && Math.max(...Object.values(m.noMeio)) === 0, rotulo('com o movimento reduzido, os outros cards só saem'));
      else {
        conferir(m.menosNoMeio >= 3, rotulo(`os outros cards fecham a vaga, sem sumir de estalo (cada um passa ${m.menosNoMeio} quadros ou mais no meio)`));
        conferir(m.caminho > 0 && m.passo < m.caminho / 2 && m.passoNaTela < Math.max(m.caminho, m.caminhoNaTela) / 2, rotulo(`o card que fica sobe sem teleporte, na agenda e na tela (maior passo ${m.passo} px de ${m.caminho}; na tela, ${m.passoNaTela} px de ${m.caminhoNaTela})`));
      }

      // clicar de novo: tudo volta, abrindo as vagas
      await p.evaluate(QUADROS_DO_FILTRO);
      await p.click('.secao-trello-conta .prio-filtro');
      await p.waitForTimeout(900);
      log = await p.evaluate(() => window.__log);
      const b2 = await botaoDoFiltro(p);
      conferir(b2.pressionado === 'false' && !b2.risco, rotulo('clicar de novo desliga o filtro e tira o risco'));
      conferir(JSON.stringify(await cardsAVista(p)) === JSON.stringify(todos), rotulo('clicar de novo traz todos os cards de volta'));
      m = semTeleporte(log, saem);
      if (reduzido) conferir(Math.max(...Object.values(m.noMeio)) === 0, rotulo('com o movimento reduzido, os cards só voltam'));
      else {
        conferir(m.menosNoMeio >= 3, rotulo(`os cards voltam abrindo a vaga (cada um passa ${m.menosNoMeio} quadros ou mais no meio)`));
        conferir(m.caminho > 0 && m.passo < m.caminho / 2 && m.passoNaTela < Math.max(m.caminho, m.caminhoNaTela) / 2, rotulo(`o card de prioridade desce sem teleporte, na agenda e na tela (maior passo ${m.passo} px de ${m.caminho}; na tela, ${m.passoNaTela} px de ${m.caminhoNaTela})`));
      }

      // o teclado: o botão recebe o foco, e o espaço e o Enter ligam e desligam
      await p.focus('.secao-trello-conta .prio-filtro');
      await p.keyboard.press('Space');
      await p.waitForTimeout(500);
      const comEspaco = (await botaoDoFiltro(p)).pressionado;
      await p.keyboard.press('Enter');
      await p.waitForTimeout(500);
      conferir(comEspaco === 'true' && (await botaoDoFiltro(p)).pressionado === 'false', rotulo('o espaço liga e o Enter desliga, pelo teclado'));

      // os dias à vista ficam sem prioridade: o número sai e o filtro desliga sozinho
      await p.click('.secao-trello-conta .prio-filtro');
      await p.waitForTimeout(500);
      if (celular) {
        await p.evaluate((k) => {
          const s = document.querySelector('.secao-trello .semana');
          s.scrollTo({ left: k * (s.children[1].offsetLeft - s.children[0].offsetLeft) });
        }, HOJE + 5);
      } else await p.click('.secao-trello button[aria-label="Próxima semana"]');
      await p.waitForTimeout(1500);
      const longe = await cardsAVista(p);
      conferir(!(await p.$('.secao-trello-conta .prio-filtro')) && longe.includes(celular ? 'agdmais5' : 'agdmais8'), rotulo(`sem prioridade à vista, o número sai e o filtro desliga sozinho (${longe.join(', ')})`));
      if (celular) await p.tap('.voltar-hoje');
      else await p.click('.secao-trello .voltar-hoje');
      await p.waitForTimeout(1500);
      conferir((await botaoDoFiltro(p))?.pressionado === 'false' && JSON.stringify(await cardsAVista(p)) === JSON.stringify(todos), rotulo('de volta em hoje, o filtro continua desligado, com todos os cards'));

      // recarregar volta sem filtro
      await p.click('.secao-trello-conta .prio-filtro');
      await p.waitForTimeout(500);
      await p.reload();
      await p.waitForSelector('.secao-trello .semana .coluna');
      await p.waitForTimeout(1200);
      conferir((await botaoDoFiltro(p))?.pressionado === 'false' && JSON.stringify(await cardsAVista(p)) === JSON.stringify(todos), rotulo('recarregar volta sem o filtro, com todos os cards'));
      conferir(erros.length === 0, rotulo(`nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`));
    } finally {
      await ctx.close();
    }
  }
}

/* ---------- A Linha do tempo da Produção no card aberto (#89) ---------- */

/** Um instante `n` dias depois de hoje, às `h`h`m` (ISO). */
const as = (n, h, m = 0) => {
  const d = diaMais(n);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const diaMes = (n) => `${diaMais(n).getDate()}/${diaMais(n).getMonth() + 1}`;
// a rota de mentira (o servidor de verdade não tem Produções neste banco): o card das cinco artes com eventos, o
// entregue da carga sem eventos (só o estado atual) e um card sem Produção
const LINHAS_DO_TEMPO = {
  agdhoje2: {
    producao: { id: 'p-agdhoje2', claquete: 'CHAMADA_SERIE', etapa: 'produzindo', entradaEm: as(-1, 9, 40), entregaEm: null, artes: [], artesQuantidade: 5, arquivada: false },
    eventos: [
      { tipo: 'criada', antes: null, depois: 'entrada', quem: 'Pessoa Fictícia', quando: as(-1, 9, 40) },
      { tipo: 'designer-entrou', antes: null, depois: 'Bia Arte', quem: 'Bia Arte', quando: as(-1, 10, 2) },
      { tipo: 'etapa', antes: 'entrada', depois: 'produzindo', quem: 'Bia Arte', quando: as(-1, 10, 3) },
      { tipo: 'arte-marcada', antes: null, depois: 'HOJE', quem: 'Bia Arte', quando: as(0, 8, 10) },
      { tipo: 'arte-marcada', antes: null, depois: 'AMANHÃ', quem: 'Bia Arte', quando: as(0, 8, 30) },
      { tipo: 'arte-marcada', antes: null, depois: 'SÁBADO', quem: 'Bia Arte', quando: as(0, 8, 50) },
      { tipo: 'campo', campo: 'prioridade', antes: null, depois: 'ALTA', quem: 'Pessoa Fictícia', quando: as(0, 9, 5) },
    ],
  },
  agdhoje1: { producao: { id: 'p-agdhoje1', claquete: 'CHAMADA_AUDITORIO', etapa: 'entregue', entradaEm: as(-3, 10), entregaEm: as(-1, 18, 0), artes: ['A', 'B'], artesQuantidade: 2, arquivada: false }, eventos: [] },
  agdhoje3: { producao: null, eventos: [] },
};
const FRASES = {
  agdhoje2: [`entrou ${diaMes(-1)} 9h40`, 'Bia Arte pegou 10h02', 'em produção 10h03', '3 de 5 artes', `prioridade alta ${diaMes(0)} 9h05`],
  agdhoje1: [`na produção desde ${diaMes(-3)}`, `entregue ${diaMes(-1)} 18h00`],
  agdhoje3: [],
};
const CAPTURAS = process.env.CAPTURAS || '';
const CAPTURAS_SUFIXO = process.env.CAPTURAS_SUFIXO || '';

/** Abrir o card mostra a linha do tempo, lida só então (nenhum pedido antes), discreta e sem passar da largura do
    card; o card sem Produção não mostra nada. No computador e no celular, claro e escuro. */
async function linhaDoTempo(navegador, url, conferir) {
  const casos = [
    { nome: 'computador', tema: 'light' },
    { nome: 'computador', tema: 'dark' },
    { nome: 'iPhone 13', tema: 'light' },
    { nome: 'iPhone 13', tema: 'dark' },
  ];
  for (const { nome, tema } of casos) {
    const celular = nome !== 'computador';
    const rotulo = (t) => `linha do tempo, ${nome}, ${tema === 'dark' ? 'escuro' : 'claro'}: ${t}`;
    const pedidos = [];
    const comRota = async (ctx) =>
      ctx.route('**/api/linha-do-tempo?*', (r) => {
        const card = new URL(r.request().url()).searchParams.get('card');
        pedidos.push(card);
        r.fulfill({ json: LINHAS_DO_TEMPO[card] ?? { producao: null, eventos: [] } });
      });
    const opcoes = { colorScheme: tema, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}) };
    // as rotas antes de abrir a página (o abrirNoCelular já navegaria)
    const { ctx, p, erros } = await contexto(navegador, 'about:blank', { ...(celular ? aparelho(nome) : { viewport: { width: 1440, height: 900 } }), ...opcoes });
    try {
      await ctx.route('**/api/andamento', (r) => r.fulfill({ json: ANDAMENTO }));
      await comRota(ctx);
      await p.goto(url);
      await p.waitForSelector('.secao-trello .semana .coluna');
      await p.waitForTimeout(1200);
      await levarAteAAgenda(p);
      conferir(pedidos.length === 0, rotulo(`com os cards fechados, nenhuma linha do tempo é lida (${pedidos.length})`));
      const card = (id) => p.locator(`.secao-trello .semana [data-card="${id}"]`);
      // #171: o card abre no centro (CardAberto); um por vez: o aberto fecha antes de abrir o outro
      const ficha = p.locator('.card-trello-ficha');
      const abrirCard = async (id) => {
        if (await ficha.count()) {
          await p.keyboard.press('Escape');
          await ficha.waitFor({ state: 'detached', timeout: 5000 });
        }
        const b = card(id).locator('.card-semana-abrir');
        if (celular) await b.tap();
        else await b.click();
        await ficha.waitFor({ timeout: 5000 });
        await p.waitForTimeout(900);
      };
      const frases = () => ficha.locator('.tempo-da-producao.chegou li').allTextContents();

      await abrirCard('agdhoje2');
      // (o modo estrito do React, no servidor do e2e, monta o card aberto duas vezes: vale que só ele foi lido)
      conferir(JSON.stringify([...new Set(pedidos)]) === JSON.stringify(['agdhoje2']), rotulo(`abrir o card lê só a linha do tempo dele, pelo card (${pedidos.join(', ')})`));
      const lidasAntes = pedidos.filter((c) => c === 'agdhoje2').length;
      const vistas = await frases();
      conferir(JSON.stringify(vistas) === JSON.stringify(FRASES.agdhoje2), rotulo(`as frases em ordem: "${vistas.join(' · ')}"`));
      const medida = await ficha.evaluate((c) => {
        const l = c.querySelector('.tempo-da-producao > div');
        const li = c.querySelector('.tempo-da-producao li');
        const st = getComputedStyle(li);
        const r = l.getBoundingClientRect();
        const rc = c.getBoundingClientRect();
        return { cabe: l.scrollWidth <= l.clientWidth + 1 && r.right <= rc.right + 0.5, fonte: parseFloat(st.fontSize), cor: st.color, corDoNome: getComputedStyle(c.querySelector('.card-semana-dados dd')).color, visivel: r.height > 10 };
      });
      conferir(medida.visivel && medida.cabe, rotulo('a linha do tempo aparece dentro do card, sem passar da largura'));
      conferir(medida.fonte <= 12 && medida.cor !== medida.corDoNome, rotulo(`discreta: letra pequena (${medida.fonte}px) e mais apagada que os nomes`));
      conferir((await ficha.locator('.tempo-da-producao button, .tempo-da-producao a, .tempo-da-producao input').count()) === 0, rotulo('só leitura: nada para clicar'));
      conferir(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), rotulo('a página não rola para o lado'));
      if (CAPTURAS) {
        const n = `${celular ? 'celular' : 'computador'}-${tema === 'dark' ? 'escuro' : 'claro'}`;
        await p.locator('.card-aberto').screenshot({ path: `${CAPTURAS}/agenda-card-${n}.png` });
        await p.screenshot({ path: `${CAPTURAS}/agenda-${n}.png` });
      }

      // só um card aberto por vez: abrir o entregue da carga, sem eventos, mostra só o estado atual
      await abrirCard('agdhoje1');
      const daCarga = await frases();
      conferir(JSON.stringify(daCarga) === JSON.stringify(FRASES.agdhoje1), rotulo(`a Produção sem eventos mostra só o estado atual: "${daCarga.join(' · ')}"`));
      // o card sem Produção não mostra nada (nem a vaga)
      await abrirCard('agdhoje3');
      const semProducao = await ficha.evaluate((c) => ({ frases: c.querySelectorAll('.tempo-da-producao li').length, altura: c.querySelector('.tempo-da-producao').getBoundingClientRect().height }));
      conferir(semProducao.frases === 0 && semProducao.altura === 0, rotulo('o card sem Produção não mostra nada'));
      // reabrir lê de novo, sem piscar: as frases continuam à vista enquanto a leitura chega
      await abrirCard('agdhoje2');
      conferir(pedidos.filter((c) => c === 'agdhoje2').length > lidasAntes && JSON.stringify(await frases()) === JSON.stringify(FRASES.agdhoje2), rotulo('reabrir lê de novo e mostra as mesmas frases'));
      conferir(erros.length === 0, rotulo(`nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`));
    } finally {
      await ctx.close();
    }
  }
}

/**
 * O apelido da claquete e as versões que ela sabe no card da agenda (#120, #121, #152, #156), no iPhone. O código das
 * versões é um sufixo colado no fim do nome, uma vez só ("CHAMADA_CODIGO_27/11 (AH)"), com a dica; nunca uma etiqueta
 * embaixo. A claquete sem código fica com as versões lidas do roteiro ("hoje", a arte "HOJE, 21H" que só este roteiro
 * tem). A versão do roteiro (#156): o card aberto diz sempre ("V1" sem versão nova); a claquete só da V2 em diante. "dar
 * as versões" está escondido (#156): o card aberto não tem a seção das versões. No toque, o lápis fica sempre à vista no
 * card aberto e dá o apelido, que volta ao original. "Mostrar o código das versões" desligado no menu do perfil: só o
 * nome; ligado de novo, o código volta.
 */
async function apelidoNaAgenda(navegador, url, api, conferir) {
  const rotulo = (t) => `apelido no card da agenda, iPhone 13: ${t}`;
  const d = diaMais(0);
  const claquete = `CHAMADA_SERIE_${d.getDate()}/${d.getMonth() + 1}`;
  const comCodigo = `CHAMADA_CODIGO_${d.getDate()}/${d.getMonth() + 1}`;
  const comArte = { type: 'doc', content: [...doc.content, { type: 'paragraph', content: [{ type: 'text', text: 'HOJE, 21H', marks: [{ type: 'arte', attrs: { id: 'h1' } }] }] }] };
  const agora = new Date().toISOString();
  await fetch(`${api}/roteiros/agdhoje2`, { method: 'PUT', headers: cabecalhos, body: JSON.stringify({ roteiro: { id: 'agdhoje2', meta: meta(claquete, isoLocal(d), 'RJ'), doc: comArte, revisao: 1, criadoEm: agora, atualizadoEm: agora, publico: true }, nArtes: 5 }) });
  // #121: o roteiro sem versão nas artes mostra o código da claquete; #156: ele é a versão 2 do roteiro
  await fetch(`${api}/roteiros/agdhoje4`, { method: 'PUT', headers: cabecalhos, body: JSON.stringify({ roteiro: { id: 'agdhoje4', meta: meta(`${comCodigo} (ah)`, isoLocal(d), 'RJ', { versao: 2 }), doc, revisao: 1, criadoEm: agora, atualizadoEm: agora, publico: true }, nArtes: 1 }) });
  await fetch(`${api}/roteiros/agdhoje4/trello`, { method: 'POST', headers: cabecalhos, body: JSON.stringify({ jaEsta: { card: 'agdhoje4' } }) });
  const { ctx, p, erros } = await abrirNoCelular(navegador, url, 'iPhone 13');
  const foto = async (nome) => {
    if (!CAPTURAS_SUFIXO) return;
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${CAPTURAS_SUFIXO}/${nome}.png` });
  };
  try {
    await levarAteAAgenda(p);
    const card = p.locator('.secao-trello .semana [data-card="agdhoje2"]');
    const doCodigo = p.locator('.secao-trello .semana [data-card="agdhoje4"]');
    const nomeDe = async (c) => (await c.locator('.card-semana-claquete').innerText()).replace(/\s+/g, ' ').trim();
    const nome = () => nomeDe(card);
    // #171: o card abre no centro (CardAberto); a versão se lê no card aberto
    const ficha = p.locator('.card-trello-ficha');
    const versaoAberta = async () => (await ficha.locator('.card-semana-dados .card-semana-pessoa', { hasText: 'versão' }).locator('dd').textContent()).trim();
    const fecharFicha = async () => {
      await p.keyboard.press('Escape');
      await ficha.waitFor({ state: 'detached', timeout: 5000 });
    };
    const versaoNaFicha = async (c) => {
      await c.locator('.card-semana-abrir').tap();
      await ficha.waitFor({ timeout: 5000 });
      const v = await versaoAberta();
      await fecharFicha();
      return v;
    };
    // com revisão na fila, a agenda encolhe: a semana inteira mostra os cards
    if (await p.isVisible('.secao-trello.encolhida')) {
      await card.waitFor({ state: 'visible', timeout: 5000 });
      await p.click('.pe-agenda .botao-texto:has-text("ver a semana inteira")');
      await p.waitForTimeout(400);
    }
    await card.waitFor({ state: 'visible', timeout: 5000 });
    // #152: o código no fim do nome, uma vez só, no padrão; nenhuma etiqueta embaixo; #156: a V1 não aparece no nome
    conferir((await nome()) === `${claquete} (H)`, rotulo(`a claquete sem código fica com a versão do roteiro, no fim do nome, sem a V1 (${await nome()})`));
    conferir((await p.locator('.codigo-versoes, .versoes-do-card').count()) === 0, rotulo('nenhuma etiqueta separada embaixo do nome'));
    conferir((await card.locator('.conflito-versoes').count()) === 0, rotulo('o valor inicial pelo roteiro não tem conflito'));
    if (await doCodigo.count()) {
      conferir((await nomeDe(doCodigo)) === `${comCodigo} (AH) V2`, rotulo(`o código da claquete no padrão, uma vez só, e a V2 no fim (${await nomeDe(doCodigo)})`));
      conferir((await doCodigo.locator('.sufixo-versoes').getAttribute('title')) === 'amanhã e hoje, do código da claquete', rotulo('a dica diz o que quer dizer e de onde veio'));
      conferir((await versaoNaFicha(doCodigo)) === 'V2', rotulo('o card aberto da V2 diz V2'));
    } else conferir(false, rotulo('o card do código da claquete está na agenda'));
    await card.scrollIntoViewIfNeeded();
    await foto('agenda-ligada');
    if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/agenda-versoes-celular.png` });
    // fechado, o lápis do toque não está à vista
    conferir(!(await card.locator('.card-lapis').isVisible()), rotulo('o card fechado sem o lápis (o lápis fica no card aberto)'));
    await card.locator('.card-semana-abrir').tap();
    await ficha.waitFor({ timeout: 5000 });
    await p.waitForTimeout(900);
    // #156: a versão do roteiro no card aberto, V1 sem versão nova; "dar as versões" escondido; sem o link de texto
    conferir((await versaoAberta()) === 'V1', rotulo(`o card aberto diz a versão do roteiro, V1 (${await versaoAberta()})`));
    conferir((await ficha.locator('.apelido-claquete').count()) === 0, rotulo('sem apelido, o card aberto não tem a linha do apelido nem a das versões'));
    conferir((await ficha.getByRole('button', { name: /dar as versões|Editar as versões|^dar um apelido$/ }).count()) === 0, rotulo('nem "dar as versões" nem o link "dar um apelido"'));
    // no toque, o lápis fica sempre à vista no card aberto
    const lapis = ficha.getByRole('button', { name: /^Dar um apelido:/ });
    conferir(await lapis.isVisible(), rotulo('o lápis à vista no card aberto'));
    await lapis.tap();
    const apelido = ficha.locator('.apelido-claquete');
    const campo = apelido.getByRole('textbox', { name: 'Apelido da claquete' });
    await campo.waitFor({ state: 'visible', timeout: 5000 });
    conferir((await campo.inputValue()) === claquete, rotulo('o campo abre com a claquete'));
    await campo.fill('SÉRIE FICTÍCIA, O FINAL');
    await apelido.getByRole('button', { name: 'guardar' }).tap();
    await apelido.locator('.apelido-nome').waitFor({ state: 'visible', timeout: 5000 });
    conferir((await nome()) === 'SÉRIE FICTÍCIA, O FINAL (H)', rotulo(`o apelido no lugar da claquete, com o código no fim (${await nome()})`));
    conferir((await card.locator('.card-semana-claquete').getAttribute('title')) === `Claquete: ${claquete}`, rotulo('a claquete original aparece ao passar o mouse'));
    conferir(await ficha.getByRole('button', { name: /^Editar o apelido:/ }).isVisible(), rotulo('com apelido, o lápis edita'));
    conferir(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), rotulo('a página não rola para o lado'));
    if (CAPTURAS) await p.locator('.card-aberto').screenshot({ path: `${CAPTURAS}/agenda-apelido-celular.png` });
    await apelido.getByRole('button', { name: 'voltar ao original' }).tap();
    await ficha.locator('.apelido-claquete').waitFor({ state: 'detached', timeout: 5000 });
    conferir(!(await nome()).includes('FINAL') && (await nome()).includes('SERIE'), rotulo(`"voltar ao original" devolve a claquete (${await nome()})`));
    await fecharFicha();
    // "Mostrar o código das versões" desligado no menu do perfil: só o nome, em todos os cards (a V2 fica)
    await mostrarOCodigo(p, false);
    conferir((await nome()) === claquete && (await nomeDe(doCodigo)) === `${comCodigo} V2`, rotulo(`desligado: só o nome e a versão do roteiro (${await nomeDe(doCodigo)})`));
    conferir((await p.locator('.secao-trello .sufixo-versoes').count()) === 0, rotulo('desligado: nenhum código na agenda'));
    await doCodigo.scrollIntoViewIfNeeded();
    await foto('agenda-desligada');
    await mostrarOCodigo(p, true);
    conferir((await nomeDe(doCodigo)) === `${comCodigo} (AH) V2`, rotulo('ligado de novo: o código volta'));
    conferir(erros.length === 0, rotulo(`nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`));
  } finally {
    await ctx.close();
  }
}

/**
 * O apelido pelo lápis e pelo clique direito no computador (#156): o lápis só aparece com o mouse sobre o card, ao lado
 * da claquete; o clique abre o card no campo do apelido (Esc cancela). O clique direito abre o menu do card com "Dar um
 * apelido", que faz o mesmo; com o apelido, o menu diz "Editar o apelido". Nada de "unha" no card nem no menu.
 */
async function apelidoPeloLapis(navegador, url, conferir) {
  const rotulo = (t) => `apelido pelo lápis, computador: ${t}`;
  const { ctx, p, erros } = await contexto(navegador, 'about:blank', { viewport: { width: 1440, height: 900 } });
  try {
    await ctx.route('**/api/andamento', (r) => r.fulfill({ json: ANDAMENTO }));
    await p.goto(url);
    await p.waitForSelector('.secao-trello .semana .coluna');
    await p.waitForTimeout(900);
    const card = p.locator('.secao-trello .semana [data-card="agdamanha"]');
    await card.scrollIntoViewIfNeeded();
    const lapis = card.locator('.card-lapis');
    const opacidade = async () => Number(await lapis.evaluate((e) => getComputedStyle(e).opacity));
    await p.mouse.move(5, 5);
    await p.waitForTimeout(250);
    conferir((await opacidade()) === 0, rotulo('sem o mouse, o lápis não aparece'));
    await card.locator('.card-semana-claquete').hover();
    await p.waitForTimeout(250);
    conferir((await opacidade()) === 1, rotulo('com o mouse, o lápis aparece'));
    const caixaDoLapis = await lapis.boundingBox();
    const caixaDaClaquete = await card.locator('.card-semana-claquete').boundingBox();
    conferir(Math.abs(caixaDoLapis.y - caixaDaClaquete.y) < 14, rotulo('o lápis na altura da claquete'));
    await lapis.click();
    // #171: o lápis abre o card no centro (CardAberto), já no campo do apelido
    const ficha = p.locator('.card-trello-ficha');
    const fecharFicha = async () => {
      await p.keyboard.press('Escape');
      await ficha.waitFor({ state: 'detached', timeout: 5000 });
    };
    const campo = ficha.getByRole('textbox', { name: 'Apelido da claquete' });
    await campo.waitFor({ state: 'visible', timeout: 5000 });
    conferir((await p.getByRole('dialog').count()) === 1, rotulo('o lápis abre o card'));
    conferir(await campo.evaluate((e) => e === document.activeElement), rotulo('o campo do apelido com o foco'));
    await p.keyboard.press('Escape');
    await campo.waitFor({ state: 'detached', timeout: 5000 });
    conferir((await p.getByRole('dialog').count()) === 1, rotulo('o Esc do campo não fecha o card'));
    await fecharFicha();
    // o clique direito: o menu do card com "Dar um apelido"
    await card.locator('.card-semana-claquete').click({ button: 'right' });
    const menu = p.getByRole('menu', { name: /^O card / });
    await menu.waitFor({ timeout: 5000 });
    conferir(JSON.stringify(await menu.getByRole('menuitem').allInnerTexts()) === JSON.stringify(['Dar um apelido']), rotulo('o menu do clique direito com "Dar um apelido"'));
    const semUnha = async (l) => l.evaluate((e) => ['borderLeftWidth', 'boxShadow'].map((k) => getComputedStyle(e)[k]).join(' '));
    conferir(/^0px/.test(await semUnha(menu)) && /^1px/.test(await semUnha(card)), rotulo('nada de unha no menu nem no card'));
    await p.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached', timeout: 5000 });
    await card.locator('.card-semana-claquete').click({ button: 'right' });
    await menu.getByRole('menuitem', { name: 'Dar um apelido' }).click();
    await campo.waitFor({ state: 'visible', timeout: 5000 });
    await campo.fill('REALITY FICTÍCIO, A ESTREIA');
    await campo.press('Enter');
    await ficha.locator('.apelido-nome').waitFor({ state: 'visible', timeout: 5000 });
    conferir((await card.locator('.card-semana-claquete').innerText()).includes('REALITY FICTÍCIO, A ESTREIA'), rotulo('o apelido pelo menu no lugar da claquete'));
    await fecharFicha();
    await card.locator('.card-semana-claquete').click({ button: 'right' });
    conferir((await menu.getByRole('menuitem').allInnerTexts()).join() === 'Editar o apelido', rotulo('com o apelido, o menu diz "Editar o apelido"'));
    await p.keyboard.press('Escape');
    await card.locator('.card-semana-abrir').click();
    await ficha.getByRole('button', { name: 'voltar ao original' }).click();
    await ficha.locator('.apelido-claquete').waitFor({ state: 'detached', timeout: 5000 });
    conferir(erros.length === 0, rotulo(`nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`));
  } finally {
    await ctx.close();
  }
}

/**
 * A letra e a versão do roteiro (#166), no iPhone. Na fila, "Substituir a anterior" pergunta "Essa chamada já foi
 * liberada para exibição?": o "Sim" faz a nova virar a letra B, de volta à V1, e a anterior sai da fila. Na agenda, a
 * claquete só mostra o que não é o início ("B"; nada na A V1), e o card aberto diz sempre a letra e a versão e deixa
 * corrigir a resposta: o "Não" refaz a letra e a versão a partir da anterior (A V2). Nada de unha.
 */
async function letraEVersaoNaAgenda(navegador, url, api, conferir) {
  const rotulo = (t) => `letra e versão do roteiro, iPhone 13: ${t}`;
  const d = diaMais(0);
  const claquete = `CHAMADA_LETRA_${d.getDate()}/${d.getMonth() + 1}`;
  const naAgenda = `CHAMADA_CORRIGIR_${d.getDate()}/${d.getMonth() + 1}`;
  // a versão anterior na fila e a nova que a substitui (a pergunta da ficha)
  await por(api, 'agdletraa', meta(claquete, isoLocal(d), 'RJ'), 1);
  await por(api, 'agdletran', meta(claquete, isoLocal(d), 'RJ', { substitui: 'agdletraa' }), 1);
  // na agenda: a que substituiu a A V1 como liberada (a B), para corrigir a resposta
  await por(api, 'agdletrab', meta(naAgenda, isoLocal(d), 'RJ', { letra: 'B', versao: 1, substituiu: { letra: 'A', versao: 1, liberada: true } }), 1);
  await fetch(`${api}/roteiros/agdletrab/trello`, { method: 'POST', headers: cabecalhos, body: JSON.stringify({ jaEsta: { card: 'agdletrab' } }) });
  const lerMeta = async (id) => (await (await fetch(`${api}/roteiros/${id}`, { headers: cabecalhos })).json())?.meta;
  const { ctx, p, erros } = await abrirNoCelular(navegador, url, 'iPhone 13');
  try {
    // a fila: o aviso da versão nova, com os dois botões no celular
    const aviso = p.locator('.ficha-versao', { hasText: claquete });
    await aviso.waitFor({ state: 'visible', timeout: 5000 });
    await aviso.scrollIntoViewIfNeeded();
    await aviso.getByRole('button', { name: 'Substituir a anterior' }).tap();
    const pergunta = aviso.getByRole('group', { name: 'Essa chamada já foi liberada para exibição?' });
    await pergunta.waitFor({ state: 'visible', timeout: 5000 });
    conferir((await pergunta.innerText()).includes('Essa chamada já foi liberada para exibição?'), rotulo('"Substituir a anterior" pergunta se a chamada já foi liberada'));
    conferir(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), rotulo('com a pergunta, a página não rola para o lado'));
    if (CAPTURAS) await aviso.screenshot({ path: `${CAPTURAS}/fila-pergunta-liberacao.png` });
    // "Cancelar" volta aos dois botões; "Sim" substitui com a letra nova
    await pergunta.getByRole('button', { name: 'Cancelar' }).tap();
    await aviso.getByRole('button', { name: 'Substituir a anterior' }).waitFor({ state: 'visible', timeout: 5000 });
    await aviso.getByRole('button', { name: 'Substituir a anterior' }).tap();
    await pergunta.getByRole('button', { name: 'Sim' }).tap();
    let m = null;
    for (let i = 0; i < 30 && !m?.letra; i++) {
      await p.waitForTimeout(200);
      m = await lerMeta('agdletran');
    }
    conferir(m?.letra === 'B' && m?.versao === 1 && m?.substituiu?.liberada === true && !m?.substitui, rotulo(`"Sim": a nova vira a letra B, V1 (${JSON.stringify([m?.letra, m?.versao, m?.substituiu])})`));
    conferir([404, 410].includes((await fetch(`${api}/roteiros/agdletraa`, { headers: cabecalhos })).status), rotulo('a anterior sai da fila'));

    // a agenda: a claquete com a letra, o card aberto com a letra e a versão, e a correção
    await levarAteAAgenda(p);
    if (await p.isVisible('.secao-trello.encolhida')) {
      await p.click('.pe-agenda .botao-texto:has-text("ver a semana inteira")');
      await p.waitForTimeout(400);
    }
    const card = p.locator('.secao-trello .semana [data-card="agdletrab"]');
    await card.waitFor({ state: 'visible', timeout: 5000 });
    const nome = async () => (await card.locator('.card-semana-claquete').innerText()).replace(/\s+/g, ' ').trim();
    // #171: o card abre no centro (CardAberto)
    const ficha = p.locator('.card-trello-ficha');
    const dado = async (r) => (await ficha.locator('.card-semana-dados .card-semana-pessoa', { hasText: r }).locator('dd').textContent()).trim();
    conferir((await nome()) === `${naAgenda} B`, rotulo(`a claquete da letra B termina em "B", sem a V1 (${await nome()})`));
    await card.scrollIntoViewIfNeeded();
    await card.locator('.card-semana-abrir').tap();
    await p.waitForTimeout(900);
    conferir((await dado('letra')) === 'B' && (await dado('versão')) === 'V1', rotulo(`o card aberto diz a letra e a versão (${await dado('letra')} ${await dado('versão')})`));
    const liberacao = ficha.getByRole('radiogroup', { name: 'A versão anterior já tinha sido liberada para exibição?' });
    conferir((await liberacao.getByRole('radio', { name: 'Sim' }).getAttribute('aria-checked')) === 'true', rotulo('a resposta guardada aparece marcada'));
    if (CAPTURAS) await p.locator('.card-aberto').screenshot({ path: `${CAPTURAS}/agenda-letra-b.png` });
    await liberacao.getByRole('radio', { name: 'Não' }).tap();
    await p.waitForFunction(() => document.querySelector('.secao-trello .semana [data-card="agdletrab"] .marca-letra-versao')?.textContent?.trim() === 'V2', null, { timeout: 5000 });
    conferir((await nome()) === `${naAgenda} V2` && (await dado('letra')) === 'A' && (await dado('versão')) === 'V2', rotulo(`corrigida para "Não": a A V2 (${await nome()})`));
    let mb = null;
    for (let i = 0; i < 30 && mb?.versao !== 2; i++) {
      await p.waitForTimeout(200);
      mb = await lerMeta('agdletrab');
    }
    conferir(mb?.versao === 2 && !mb?.letra && mb?.substituiu?.liberada === false, rotulo(`a correção fica gravada (${JSON.stringify([mb?.letra, mb?.versao, mb?.substituiu])})`));
    if (CAPTURAS) await p.locator('.card-aberto').screenshot({ path: `${CAPTURAS}/agenda-letra-corrigida.png` });
    const unha = await ficha.locator('.card-semana-liberacao').evaluate((e) => [e, ...e.querySelectorAll('*')].some((x) => parseFloat(getComputedStyle(x).borderLeftWidth) > 1 || /inset/.test(getComputedStyle(x).boxShadow)));
    conferir(!unha, rotulo('nada de unha na correção'));
    conferir(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), rotulo('a página não rola para o lado'));
    conferir(erros.length === 0, rotulo(`nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`));
  } finally {
    await ctx.close();
  }
  // no computador, a pergunta fica na comparação: "Substituir a anterior" e o Revisar perguntam; o "Não" dá a V2
  const rotuloPc = (t) => `letra e versão do roteiro, computador: ${t}`;
  const outra = `CHAMADA_VERSAO_${d.getDate()}/${d.getMonth() + 1}`;
  await por(api, 'agdversaoa', meta(outra, isoLocal(d), 'RJ'), 1);
  await por(api, 'agdversaon', meta(outra, isoLocal(d), 'RJ', { substitui: 'agdversaoa' }), 1);
  const pc = await contexto(navegador, url);
  try {
    const ficha = pc.p.locator('.ficha', { has: pc.p.locator('.ficha-versao', { hasText: outra }) });
    await ficha.getByRole('button', { name: 'Revisar' }).click();
    const dialogo = pc.p.getByRole('dialog', { name: 'Comparar com a versão anterior da fila' });
    await dialogo.waitFor({ state: 'visible', timeout: 5000 });
    await dialogo.locator('.comparar-decisao').getByRole('button', { name: 'Revisar' }).click();
    const pergunta = dialogo.getByRole('group', { name: 'Essa chamada já foi liberada para exibição?' });
    await pergunta.waitFor({ state: 'visible', timeout: 5000 });
    conferir(true, rotuloPc('o Revisar de "Substituir a anterior" pergunta se a chamada já foi liberada'));
    if (CAPTURAS) await dialogo.locator('.comparar-cabeca').screenshot({ path: `${CAPTURAS}/comparar-pergunta-liberacao.png` });
    await pergunta.getByRole('button', { name: 'Não' }).click();
    let m = null;
    for (let i = 0; i < 30 && !m?.versao; i++) {
      await pc.p.waitForTimeout(200);
      m = await lerMeta('agdversaon');
    }
    conferir(m?.versao === 2 && !m?.letra && m?.substituiu?.liberada === false, rotuloPc(`"Não": a nova fica na A, como V2 (${JSON.stringify([m?.letra, m?.versao])})`));
    conferir(pc.erros.length === 0, rotuloPc(`nenhum erro na página${pc.erros.length ? `: ${pc.erros.join(' | ')}` : ''}`));
  } finally {
    await pc.ctx.close();
  }
}

/** Liga ou desliga "Mostrar o código das versões" no menu do perfil (#152) e fecha o menu. */
async function mostrarOCodigo(p, ligado) {
  await p.locator('.perfil-botao').click();
  const opcao = p.getByRole('radiogroup', { name: 'Mostrar o código das versões' }).getByRole('radio', { name: ligado ? 'Ligado' : 'Desligado', exact: true });
  await opcao.click();
  await p.waitForFunction((v) => document.querySelector('.escolha-codigo-versoes [aria-checked="true"]')?.textContent === v, ligado ? 'Ligado' : 'Desligado');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
}

/**
 * A etiqueta da campanha no card da agenda (#181): a mesma pílula de Produções e da Pauta, a primeira e "+N", fora do
 * botão do card; o clique leva à página da campanha (#180). As campanhas vêm no andamento (pela rota,
 * como o resto do andamento deste e2e; a rota de verdade é a do teste de servidor das campanhas). Claro e escuro, no
 * computador e no celular.
 */
async function campanhaNaAgenda(navegador, url, conferir) {
  const COM_CAMPANHAS = {
    ...ANDAMENTO,
    agdhoje1: { ...ANDAMENTO.agdhoje1, campanhas: [{ id: 'campE2eLanc', nome: 'Lançamento Fictício' }, { id: 'campE2eAesp', nome: 'AESP Fictícia' }] },
    agdhoje3: { ...ANDAMENTO.agdhoje3, campanhas: [{ id: 'campE2eLanc', nome: 'Lançamento Fictício' }] },
  };
  const pasta = CAPTURAS || CAPTURAS_SUFIXO;
  for (const [rotulo, opcoes] of [
    ['computador-claro', { viewport: { width: 1440, height: 900 }, colorScheme: 'light' }],
    ['computador-escuro', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }],
    ['celular-claro', { ...aparelho('iPhone 13'), colorScheme: 'light' }],
  ]) {
    const { ctx, p, erros } = await contexto(navegador, 'about:blank', { ...opcoes, ...(pasta ? { deviceScaleFactor: 2 } : {}) });
    try {
      await ctx.route('**/api/andamento', (r) => r.fulfill({ json: COM_CAMPANHAS }));
      await p.goto(url);
      await p.waitForSelector('.secao-trello .semana .coluna');
      const card = (id) => p.locator(`.secao-trello .card-semana[data-card="${id}"]`);
      const etiqueta = card('agdhoje1').locator('.campanhas.compacta');
      await etiqueta.waitFor();
      conferir((await etiqueta.locator('.campanha-nome').allTextContents()).join('|') === 'Lançamento Fictício', `${rotulo}: a etiqueta mostra a primeira campanha`);
      conferir((await etiqueta.locator('.campanha-mais').textContent()).trim() === '+1', `${rotulo}: e "+1" das outras`);
      conferir((await etiqueta.locator('.campanha-mais').getAttribute('title')) === 'AESP Fictícia', `${rotulo}: o título do "+1" diz quais`);
      conferir((await card('agdhoje3').locator('.campanha-mais').count()) === 0, `${rotulo}: com uma campanha, sem "+N"`);
      conferir((await card('agdhoje2').locator('.campanha').count()) === 0, `${rotulo}: sem campanha, sem etiqueta`);
      // a etiqueta fica fora do botão do card (não abre o card) e sem "unha"
      conferir((await etiqueta.evaluate((e) => !e.closest('.card-semana-abrir'))) === true, `${rotulo}: a etiqueta fica fora do botão do card`);
      const unha = await etiqueta.locator('.campanha').evaluate((e) => ({ borda: parseFloat(getComputedStyle(e).borderLeftWidth), sombra: getComputedStyle(e).boxShadow }));
      conferir(unha.borda === 0 && !/inset/.test(unha.sombra), `${rotulo}: sem unha`);
      conferir(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${rotulo}: a página não rola para o lado`);
      await card('agdhoje1').scrollIntoViewIfNeeded();
      if (pasta) {
        await p.waitForTimeout(300);
        await card('agdhoje1').screenshot({ path: `${pasta}/agenda-campanha-card-${rotulo}.png` });
        await p.screenshot({ path: `${pasta}/agenda-campanha-${rotulo}.png` });
      }
      // #171: o card abre no centro (CardAberto, o mesmo da Pauta, das Produções e dos Filmes), com todas as campanhas
      const abre = card('agdhoje1').locator('.card-semana-abrir');
      if (rotulo.startsWith('celular')) await abre.tap();
      else await abre.click();
      const ficha = p.getByRole('dialog').locator('.card-trello-ficha');
      await ficha.waitFor();
      conferir((await ficha.locator('.campanhas .campanha-nome').allTextContents()).join('|') === 'Lançamento Fictício|AESP Fictícia', `${rotulo}: o card aberto com todas as campanhas`);
      conferir((await p.locator('.card-aberto-camada').evaluate((c) => c.parentElement === document.body)) === true, `${rotulo}: o card aberto no centro, por cima da página`);
      if (pasta) {
        await p.waitForTimeout(400);
        await p.screenshot({ path: `${pasta}/agenda-card-aberto-${rotulo}.png` });
      }
      await p.keyboard.press('Escape');
      await ficha.waitFor({ state: 'detached' });
      // o clique na etiqueta leva à página da campanha (#180), como em qualquer tela (a campanha fictícia não existe no
      // servidor: a página diz que ela não existe mais, mas o endereço é o dela)
      await etiqueta.getByRole('button', { name: 'Abrir a campanha Lançamento Fictício' }).click();
      const foi = await p.waitForFunction(() => location.hash === '#/campanhas/campE2eLanc', null, { timeout: 5000 }).then(() => true, () => false);
      conferir(foi, `${rotulo}: a etiqueta abre a página da campanha`);
      conferir(erros.length === 0, `${rotulo}: sem erros na página (${erros.join(' | ')})`);
    } finally {
      await ctx.close();
    }
  }
}

/**
 * A busca na agenda (#171): toda tela de lista ou agenda tem a lupa (BuscaNaLupa). A da fila busca também na agenda No
 * Trello: os cards que não batem saem, e sem nenhum a agenda fica, com o "nada com “x” na agenda" à mão.
 */
async function buscaNaAgenda(navegador, url, conferir) {
  const rotulo = (t) => `busca na agenda, computador: ${t}`;
  const { ctx, p, erros } = await contexto(navegador, 'about:blank', { viewport: { width: 1440, height: 900 } });
  try {
    await ctx.route('**/api/andamento', (r) => r.fulfill({ json: ANDAMENTO }));
    await p.goto(url);
    await p.waitForSelector('.secao-trello .semana .coluna');
    await p.waitForTimeout(900);
    const lupa = p.locator('.barra-topo .busca.lupa');
    conferir((await lupa.count()) === 1, rotulo('a lupa está no topo'));
    const cards = p.locator('.secao-trello .card-semana');
    const antes = await cards.count();
    const alvo = (await p.locator('.secao-trello .card-semana[data-card="agdhoje1"] .card-semana-claquete').innerText()).trim().split(/\s+/)[0];
    await p.keyboard.press('/');
    await p.keyboard.type(alvo, { delay: 20 });
    await p.waitForTimeout(700);
    const depois = await cards.count();
    conferir(depois >= 1 && depois < antes && (await p.locator('.secao-trello .card-semana[data-card="agdhoje1"]').count()) === 1, rotulo(`a lupa filtra a agenda (${antes} → ${depois}, "${alvo}")`));
    await p.locator('.barra-topo .busca.lupa input').fill('zzzqqq');
    const nada = p.locator('.secao-trello .nada-na-busca');
    await nada.waitFor({ timeout: 5000 });
    conferir((await nada.textContent()).trim() === 'nada com “zzzqqq” na agenda', rotulo(`sem nenhum, a agenda fica e diz à mão (${(await nada.textContent()).trim()})`));
    conferir((await nada.evaluate((e) => getComputedStyle(e).fontFamily)).includes('Caveat'), rotulo('o vazio da busca à mão, em Caveat'));
    if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/agenda-busca-vazia.png` });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(700);
    conferir((await cards.count()) === antes, rotulo('o Esc limpa e a agenda volta inteira'));
    conferir(erros.length === 0, rotulo(`nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`));
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
    // SO=campanha roda só a etiqueta da campanha (#181)
    if (process.env.SO === 'campanha') {
      await fetch(`${amb.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': LIA } });
      return void (await campanhaNaAgenda(navegador, amb.url, conferir));
    }
    // SO=card roda só o card aberto no centro, a busca e o apelido (#171)
    if (process.env.SO === 'card') {
      await fetch(`${amb.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': LIA } });
      await linhaDoTempo(navegador, amb.url, conferir);
      await campanhaNaAgenda(navegador, amb.url, conferir);
      await buscaNaAgenda(navegador, amb.url, conferir);
      await apelidoNaAgenda(navegador, amb.url, amb.api, conferir);
      await apelidoPeloLapis(navegador, amb.url, conferir);
      await letraEVersaoNaAgenda(navegador, amb.url, amb.api, conferir);
      return;
    }
    for (const nome of ['iPhone 13', 'Galaxy S24']) medicao[nome] = await gestos(navegador, amb.url, nome, conferir);
    // no computador, o tour da revisão já visto (senão o convite cobre a tela)
    await fetch(`${amb.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': LIA } });
    await computador(navegador, amb.url, conferir);
    await filtroDasPrioridades(navegador, amb.url, conferir);
    await criterio(navegador, amb.url, conferir);
    await linhaDoTempo(navegador, amb.url, conferir);
    await campanhaNaAgenda(navegador, amb.url, conferir);
    await buscaNaAgenda(navegador, amb.url, conferir);
    await semearRevisao(amb.api);
    await encolhida(navegador, amb.url, conferir);
    await apelidoNaAgenda(navegador, amb.url, amb.api, conferir);
    await apelidoPeloLapis(navegador, amb.url, conferir);
    await letraEVersaoNaAgenda(navegador, amb.url, amb.api, conferir);
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
