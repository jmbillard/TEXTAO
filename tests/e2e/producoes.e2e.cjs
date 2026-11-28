// Ponta a ponta da tela de produções (#109), rodado à parte do vitest: `npm run e2e:producoes`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o Teable falso
// (tests/fixtures/teable-falso.mjs): a produção da arte, fictícia, carregada como Produções do PROMeiro. Quem abre não é
// administrador (a tela é de todo mundo que entrou). No computador, claro e escuro: a entrada no topo da fila, ao lado
// da agenda No Trello, e o endereço próprio na área Designer; um bloco por praça na ordem das praças (as de fábrica),
// com as colunas Entrada · Produzindo · Entregue lado a lado dentro dele e a contagem de cada uma; os cards na ordem do prazo (no
// mesmo prazo, a ALTA primeiro, com o marca-texto da agenda), com a claquete, a atração, as artes, os designers e o
// prazo; o Entregue só com os dos últimos 3 dias; a arquivada fora; as sem card (a linha sem card, o filme) no bloco
// delas; a releitura a cada minuto, como a agenda; e a volta para a agenda. No celular, claro e escuro, as praças e as
// etapas uma embaixo da outra, sem rolar para o lado.
//
// #119, os blocos: a 1920px (claro) os quatro blocos cabem lado a lado e usam a largura toda; a 1440px (escuro) ficam
// lado a lado com a área rolando para o lado até a última praça; numa janela baixa, o topo do bloco e o das colunas
// ficam presos em cima ao rolar para baixo; no card estreito, nada passa da borda (a claquete quebra, não é cortada).
// No tablet, cabe um bloco inteiro e a área rola para o lado entre as praças. Nenhum pedido ao Trello, nem do navegador nem do servidor.
//
// #110, os botões: a Lia (ligada ao designer pelo e-mail no cadastro de designers) pega o card da Entrada ("Peguei")
// e volta o de Produzindo e o de Entregue para a Entrada; a mudança aparece na hora e fica depois de recarregar; o
// Trello de mentira recebe só escritas (o membro do card, mover de lista), nunca uma leitura; quando ele recusa, a tela
// volta atrás e mostra o motivo; a Produção sem card muda sem ir ao Trello. Quem não está ligado vê a tela sem os
// botões, com a explicação de a quem pedir. No celular, os botões têm 44px.
//
// #111, entregar: o card de Produzindo tem "Entreguei". A Festa (1 arte, nenhuma marcada no checklist) mostra o aviso
// com a arte que falta, "Entregar assim mesmo" e "Voltar": "Voltar" fecha o aviso e nada muda (nem no Trello);
// "Entregar assim mesmo" leva o card para Entregue e, no Trello, para a saída da praça. A Cozinha (sem card, sem a
// lista de artes) é entregue direto, sem aviso e sem ir ao Trello. Com o aviso aberto, nada passa da borda do card.
//
// #112, arrastar e desfazer: no computador, a Lia arrasta o card entre as colunas do mesmo bloco, e o efeito é o dos
// botões: pegar (entra no card do Trello), entregar direto da Entrada com o aviso de arte faltando (o card fica onde
// está até "Entregar assim mesmo"); com o card no ar, só as colunas do bloco dele para onde ele pode ir ficam marcadas,
// e soltar no bloco de outra praça não muda nada. Depois de cada mudança, a caixinha de desfazer: "Desfazer" volta o
// card na hora e faz o contrário no Trello (sai do card, volta para a entrada), e o desfeito fica depois de recarregar;
// quando o Trello recusa o desfazer, o card volta para onde a mudança o deixou, com o motivo. No celular, o card não se
// arrasta: a mudança é pelos botões, e a caixinha de desfazer tem os botões de 44px.
//
// #113, recolher e abrir: a Lia recolhe o bloco do RJ e o do G5, e cada um vira uma coluna estreita com a sigla e a
// contagem de cada coluna, e os outros blocos ficam com a largura; o servidor guarda (a preferência da pessoa), e depois
// de recarregar continuam recolhidos; a outra pessoa vê todos abertos; no celular, o recolhido é uma linha. Mostrar o
// bloco de novo também fica guardado. Um clique no card abre a Produção na própria tela: a linha do tempo (com o que a
// Lia fez), as artes do checklist e o link do card no Trello (a sem card, sem o link); fecha no ×, no Esc e fora, e o
// foco volta para o card. O clique num botão do card e o arrasto não abrem. Nada é lido do Trello.
//
// #146, a contagem das artes feitas: a arte marcada pela janela do After (aqui, já guardada na Produção) aparece no
// card como "1 de 3 artes", pela mesma regra da janela, sem faixa colorida na borda esquerda.
//
// #159, o topo, as praças e o movimento: o logo, o seletor de área e o perfil ficam no mesmo lugar (no máximo 1 px) na
// fila, nas Produções, nos Filmes e na Pauta, também no meio da troca de tela; sem o texto de explicação. No máximo 3
// praças abertas (a G5, o RJ e o SP; o INTER fechado, com o nome na vertical): abrir a quarta fecha a aberta há mais
// tempo, com a largura deslizando. A Produzindo vazia é fina e se abre ao arrastar e ao "Peguei", deslizando. O Entregue
// tem as divisórias por dia ("hoje", "ontem", "qua 25/11"). O contorno da coluna-alvo fica por cima do nome dela, e os
// cantos ficam certos com a área rolando. As praças se arrumam arrastando (mouse e toque), as vizinhas deslizando, e a
// ordem fica guardada por pessoa. Nada de "unha".
//
// #161, o espaço e a busca: com o mouse sobre o card da Entrada, o espaço faz o mesmo que o "Peguei" (o card desliza
// para a Produzindo, a Lia entra no card do Trello, a caixinha de desfazer abre); de novo, no card que já é dela, nada; com
// o foco na lupa, o espaço é do campo. A lupa do topo busca pela claquete, pela atração e pela pessoa, sem caixa nem
// acento, e acha também o entregue de 5 dias atrás, que os blocos não mostram, com o dia da entrega; a lista chega em
// cascata e sai esmaecendo, e os blocos voltam; um clique abre a Produção. No celular, a lupa toma a linha do título.
//
// #179, o filtro por campanha: pelo botão "Campanha" (a busca sem acento; a etiqueta do card abre a página, #171); as praças de sempre
// só com as Produções da campanha, e as contagens acompanham; o nome ao lado do título; o Esc e o × tiram; lembrado por
// pessoa; a campanha renomeada mostra o nome novo e a apagada não filtra mais. No celular, o botão tem 44px.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:producoes
// Com CAPTURAS=pasta, grava as capturas de cada tela (densidade 2). Com VIDEO=pasta, grava o vídeo do movimento (#159).
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');
const RAIZ = join(__dirname, '..', '..');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:producoes');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
// sem cadastro de designer: vê a tela, não pega
const RUI = 'rui.sem.cadastro@exemplo.com';
const CHEFE = 'chefe.ficticia@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VIDEO = process.env.VIDEO || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

/* ---------- as datas, sempre em São Paulo ---------- */
const DIA = 86_400_000;
const agora = Date.now();
const dm = (n) => new Date(agora + n * DIA).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const ha = (n) => new Date(agora - n * DIA).toISOString();
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** O prazo como o card escreve: "amanhã", "sex 20/11". */
const prazo = (n) => {
  if (n === 1) return 'amanhã';
  const d = new Date(`${new Date(agora + n * DIA).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T12:00:00Z`);
  return `${SEMANA[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

// ids de card fictícios (24 caracteres hexadecimais)
const card = (n) => `c0ffee${String(n).padStart(18, '0')}`;
// a hora da última mudança no Teable (a entrada ou a entrega, a mais nova): a releitura do servidor, a cada minuto,
// só traz de novo o que mudou depois da carga, como no Teable; sem ela, trazia tudo e desfazia o que o teste mudou (#183)
const linha = (id, fields) => ({
  id,
  fields: { status: '[]', designers: null, arquivado: false, entregue: false, praca: null, filme: null, ...fields },
  lastModifiedTime: [fields.data_entrada, fields.data_entrega].filter(Boolean).sort().pop() ?? ha(1),
});
/** A produção da arte (fictícia). */
const ARTE = [
  // SP: duas no mesmo prazo (a ALTA primeiro) e uma sem card com o prazo mais perto
  linha('recProdE2e1', { card_ID: card(1), claquete: `Show da Noite ${dm(3)} SP`, artes: 'HOJE | AMANHÃ | DOMINGO', data_entrada: ha(1) }),
  linha('recProdE2e2', { card_ID: card(2), claquete: `Festa na Praça ${dm(3)} SP`, artes: 'HOJE', prioridade: 'ALTA', data_entrada: ha(1) }),
  linha('recProdE2e3', { card_ID: '', claquete: `Cozinha de Vó ${dm(1)} SP`, data_entrada: ha(2) }),
  // G5: produzindo, entregue ontem (fica), entregue há 5 dias (sai) e um filme sem card
  linha('recProdE2e4', { card_ID: card(4), claquete: `Novela Sinfonia ${dm(2)} (AH)`, status: '["PRODUZINDO","AGUARDANDO MATERIAL"]', designers: '["Dora Lima","Enzo Prado"]', artes: 'HOJE | AMANHÃ', data_entrada: ha(2) }),
  linha('recProdE2e5', { card_ID: card(5), claquete: `Jogo Final ${dm(0)}`, status: '["FINALIZADO"]', designers: '["Dora Lima"]', entregue: true, data_entrada: ha(3), data_entrega: ha(1) }),
  linha('recProdE2e6', { card_ID: card(6), claquete: `Jogo Antigo ${dm(-4)}`, status: '["FINALIZADO"]', designers: '["Enzo Prado"]', entregue: true, data_entrada: ha(8), data_entrega: ha(5) }),
  linha('recProdE2e8', { card_ID: '', claquete: `Filme da Tarde ${dm(4)}`, status: '["FILME"]', filme: [{ id: 'recFilmeE2e', title: 'Filme da Tarde' }], data_entrada: ha(1) }),
  // RJ: arquivada (sai)
  linha('recProdE2e7', { card_ID: card(7), claquete: `RIO Show ${dm(2)}`, status: '["PRODUZINDO"]', designers: '["Dora Lima"]', arquivado: true, data_entrada: ha(2) }),
];

async function abrir(navegador, url, opcoes, hash = '#/designer/producoes', { relogio = false, email = LIA } = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(email), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  if (relogio) await p.clock.install();
  const erros = [];
  const aoTrello = [];
  const leituras = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  p.on('request', (r) => {
    if (/trello/i.test(r.url())) aoTrello.push(r.url());
    if (new URL(r.url()).pathname === '/api/producoes/por-praca') leituras.push(r.url());
  });
  await p.goto(`${url}${hash}`);
  return { ctx, p, erros, aoTrello, leituras };
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
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: true });
};
const textos = async (l) => (await l.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
const hash = (p) => new URL(p.url()).hash;
const coluna = (p, praca, k) => p.locator(`.prod-bloco[data-praca="${praca}"] .prod-coluna[data-coluna="${k}"]`);
/** As claquetes da coluna, só o nome (sem o sufixo das versões, #152, que versoesNosCards confere). */
const claquetes = (p, praca, k) =>
  coluna(p, praca, k)
    .locator('.prod-claquete')
    .evaluateAll((es) => es.map((e) => [...e.querySelectorAll('.prod-claquete-texto')].map((t) => [...t.childNodes].filter((n) => !n.classList?.contains('sufixo-versoes')).map((n) => n.textContent).join('')).join('').replace(/\s+/g, ' ').trim()));
const contas = async (p, praca) => Promise.all(['entrada', 'produzindo', 'entregue'].map(async (k) => Number(await coluna(p, praca, k).locator('.prod-conta').textContent())));
const cardDe = (p, claquete) => p.locator('.prod-card', { has: p.locator('.prod-claquete', { hasText: claquete }) });

/* ---------- #159: o topo parado ---------- */
/** O logo, o seletor de área (para quem tem mais de uma) e o perfil: onde cada um está, em px da janela. */
const PECAS_DO_TOPO = ['.barra-topo .bib-marca', '.barra-topo .seletor-area', '.barra-topo .perfil'];
const posicoesDoTopo = (p) =>
  p.evaluate((pecas) => pecas.map((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }), PECAS_DO_TOPO);
/** Os caminhos do topo, pela ordem (#168). */
const caminhosNaOrdem = (p) => p.locator('.barra-topo nav.caminhos-do-topo a').evaluateAll((as) => as.map((a) => a.getAttribute('aria-label')));
/** Mede, quadro a quadro, onde fica cada ícone dos caminhos (pela ordem) a partir de agora, por 1,2 s. Cada tela monta o
    topo dela, então a medida acha o nav de novo a cada quadro. */
const comecarAMedirOsIcones = (p) =>
  p.evaluate(() => {
    const quadros = [];
    window.__quadrosDosIcones = quadros;
    const inicio = performance.now();
    const medir = () => {
      const icones = [...document.querySelectorAll('.barra-topo nav.caminhos-do-topo .caminho-icone')];
      quadros.push([Math.round(performance.now() - inicio), ...icones.map((i) => i.getBoundingClientRect().left)]); // [ms, x...]
      if (performance.now() - inicio < 1200) requestAnimationFrame(medir);
    };
    medir();
  });
/** Os ícones dos caminhos só deslizam (#168): cada ícone que muda de lugar leva um tempo de ponta a ponta (um pulo iria
    de uma ponta à outra num quadro só). Pelo tempo e não em px por quadro: a curva --suave começa rápida, e um quadro
    longo da tela nova chegando faz um passo grande sem ser pulo. No computador, o primeiro fica parado; no celular (sem
    o nome), todos. */
async function iconesSemPulo(p, comNome, onde) {
  const todos = (await p.evaluate(() => window.__quadrosDosIcones)).filter((q) => q.length > 1);
  assert.ok(todos.length > 10, `${onde}: os quadros medidos`);
  const n = todos[todos.length - 1].length;
  const quadros = todos.filter((q) => q.length === n);
  for (let j = 1; j < n; j++) {
    const xs = quadros.map((q) => q[j]);
    const [de, para] = [xs[0], xs[xs.length - 1]];
    if (!comNome || j === 1) {
      assert.ok(Math.max(...xs) - Math.min(...xs) <= 1, `${onde}: o ícone ${j} parado`);
      continue;
    }
    if (Math.abs(para - de) <= 4) continue;
    const saiu = quadros.findIndex((q) => Math.abs(q[j] - de) > 1);
    // chegou: o primeiro quadro depois do último ainda fora do lugar
    const chegou = quadros.length - [...quadros].reverse().findIndex((q) => Math.abs(q[j] - para) > 1);
    const ms = quadros[chegou][0] - quadros[saiu - 1][0];
    assert.ok(chegou - saiu >= 2 && ms >= 100, `${onde}: o ícone ${j} desliza de ${de.toFixed(0)} a ${para.toFixed(0)} (em ${ms} ms, ${chegou - saiu} quadros no meio)`);
  }
}
/** O topo no mesmo lugar de antes: no máximo 1 px em cada lado de cada peça. */
async function topoParado(p, antes, onde) {
  const agora = await posicoesDoTopo(p);
  PECAS_DO_TOPO.forEach((peca, i) => {
    assert.equal(!!agora[i], !!antes[i], `${onde}: ${peca} ${antes[i] ? 'continua' : 'não aparece'}`);
    if (!antes[i]) return;
    const anda = Math.max(...['left', 'top', 'right', 'bottom'].map((k) => Math.abs(agora[i][k] - antes[i][k])));
    assert.ok(anda <= 1, `${onde}: ${peca} parado (andou ${anda.toFixed(1)}px: ${JSON.stringify(antes[i])} → ${JSON.stringify(agora[i])})`);
  });
}

/** Onde estão os blocos e a área deles (em px da janela), e quanto a área rola. */
const medidasDosBlocos = (p) =>
  p.locator('.prod-blocos').evaluate((a) => {
    const r = a.getBoundingClientRect();
    const estilo = getComputedStyle(a);
    return {
      area: { left: r.left + parseFloat(estilo.paddingLeft), right: r.left + a.clientWidth - parseFloat(estilo.paddingRight), top: r.top },
      largura: a.clientWidth,
      rolaDeLado: a.scrollWidth - a.clientWidth,
      blocos: [...a.querySelectorAll('.prod-bloco')].map((b) => {
        const c = b.getBoundingClientRect();
        return { praca: b.dataset.praca, left: c.left, right: c.right, top: Math.round(c.top), width: c.width };
      }),
    };
  });
/** Os elementos do card que passam da borda dele (nada deveria). */
const passamDaBorda = (p) =>
  p.locator('.prod-card').evaluateAll((cs) =>
    cs.flatMap((c) => {
      const r = c.getBoundingClientRect();
      return [...c.querySelectorAll('*')].filter((e) => {
        const q = e.getBoundingClientRect();
        return q.width > 0 && (q.left < r.left - 0.5 || q.right > r.right + 0.5 || e.scrollWidth > e.clientWidth + 1);
      }).map((e) => `${c.querySelector('.prod-claquete').textContent} · ${e.className}`);
    }),
  );

/** As versões da chamada nos cards (#121, #152), prontas da API, como o sufixo colado no fim do nome: as do Roteiro da
    Festa (a claquete não tem código: o valor inicial é o do roteiro, sem aviso), o código da claquete da Novela (uma vez
    só), nada no Show da Noite. Nenhuma etiqueta embaixo do nome. Com `ligado` false, só o nome. */
async function versoesNosCards(p, onde, ligado = true) {
  const nomeDe = async (claquete) => (await cardDe(p, claquete).locator('.prod-claquete').textContent()).replace(/\s+/g, ' ').trim();
  assert.equal(await p.locator('.prod-card .codigo-versoes, .prod-card .versoes-do-card').count(), 0, `${onde}: nenhuma etiqueta embaixo do nome`);
  if (!ligado) {
    assert.equal(await p.locator('.prod-card .sufixo-versoes').count(), 0, `${onde}: desligado, nenhum código`);
    assert.equal(await nomeDe('Festa na Praça'), `Festa na Praça ${dm(3)} SP`, `${onde}: desligado, a Festa só com o nome`);
    assert.equal(await nomeDe('Novela Sinfonia'), `Novela Sinfonia ${dm(2)}`, `${onde}: desligado, a Novela só com o nome`);
    return;
  }
  assert.equal(await nomeDe('Festa na Praça'), `Festa na Praça ${dm(3)} SP (A)`, `${onde}: a Festa com a versão do roteiro no fim do nome`);
  assert.equal(await cardDe(p, 'Festa na Praça').locator('.sufixo-versoes').getAttribute('title'), 'amanhã, das artes do roteiro', `${onde}: a dica da Festa diz de onde veio`);
  assert.equal(await cardDe(p, 'Festa na Praça').locator('.conflito-versoes').count(), 0, `${onde}: a Festa sem aviso`);
  assert.equal(await nomeDe('Novela Sinfonia'), `Novela Sinfonia ${dm(2)} (AH)`, `${onde}: a Novela com o código da claquete, uma vez só`);
  assert.equal(await cardDe(p, 'Novela Sinfonia').locator('.sufixo-versoes').getAttribute('title'), 'amanhã e hoje, do código da claquete', `${onde}: a dica diz o que quer dizer`);
  assert.equal(await cardDe(p, 'Show da Noite').locator('.sufixo-versoes').count(), 0, `${onde}: sem versão, sem sufixo`);
}

/**
 * O movimento que começou (#159), gravado pela página enquanto acontece (a medida depois do clique chega tarde numa
 * máquina ocupada): as transições de largura (o elemento e a propriedade) e as animações do deslize (o card pela
 * data-producao, o bloco pela data-praca). `gravarMovimento` zera e começa; `movimento` devolve o que houve.
 */
const gravarMovimento = (p) =>
  p.evaluate(() => {
    window.__movimento = [];
    if (window.__gravando) return;
    window.__gravando = true;
    const nome = (e) => (e.dataset?.producao ? `card ${e.querySelector('.prod-claquete-texto')?.textContent.trim()}` : e.dataset?.praca !== undefined && e.classList.contains('prod-bloco') ? `bloco ${e.dataset.praca}` : e.className);
    document.addEventListener('transitionrun', (ev) => window.__movimento.push(`transição ${ev.propertyName} ${nome(ev.target)}`), true);
    const animar = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      window.__movimento.push(`deslize ${nome(this)}`);
      return animar.apply(this, args);
    };
  });
const movimento = (p) => p.evaluate(() => window.__movimento);

/** Espera o movimento da tela parar (#159): as animações que têm fim. */
// o trilho do tempo da caixinha do desfazer (8 s) não conta: esperar por ele fecharia a caixinha
const quieta = (p) => p.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity && !a.effect?.target?.classList?.contains('desfazer-trilho')).map((a) => a.finished.catch(() => {}))));

/** Os blocos lado a lado: a 1920px cabem todos e usam a largura toda; a 1440px, a área rola para o lado. */
async function blocosLadoALado(p, largura) {
  await quieta(p);
  const m = await medidasDosBlocos(p);
  assert.deepEqual(m.blocos.map((b) => b.praca), ['G5', 'RJ', 'SP', 'INTER']);
  assert.equal(new Set(m.blocos.map((b) => b.top)).size, 1, `${largura}: os blocos ficam lado a lado`);
  for (let i = 1; i < m.blocos.length; i++) assert.ok(m.blocos[i].left >= m.blocos[i - 1].right, `${largura}: um bloco depois do outro`);
  // dentro do bloco, as três colunas lado a lado
  const topos = await p.locator('.prod-bloco[data-praca="SP"] .prod-coluna').evaluateAll((cs) => cs.map((c) => Math.round(c.getBoundingClientRect().top)));
  assert.equal(new Set(topos).size, 1, `${largura}: no bloco, as colunas ficam lado a lado`);
  assert.deepEqual(await passamDaBorda(p), [], `${largura}: nada passa da borda do card`);
  // no topo de cada coluna, o nome inteiro e a contagem na mesma linha
  const nomes = await p.locator('.prod-coluna:not(.fina) h3').evaluateAll((hs) =>
    hs.map((h) => ({ cortado: h.querySelector('.prod-coluna-nome').scrollWidth > h.querySelector('.prod-coluna-nome').clientWidth, linha: Math.abs(h.querySelector('.prod-conta').getBoundingClientRect().top - h.querySelector('i').getBoundingClientRect().top) < 12 })),
  );
  assert.ok(nomes.every((n) => !n.cortado && n.linha), `${largura}: o nome da coluna e a contagem na mesma linha (${JSON.stringify(nomes)})`);
  if (largura >= 1920) {
    assert.ok(m.rolaDeLado <= 1, `1920: os três abertos e o fechado cabem (${m.rolaDeLado}px a rolar)`);
    assert.ok(m.blocos[0].left - m.area.left <= 1 && m.area.right - m.blocos.at(-1).right <= 1, `1920: os blocos usam a largura toda (${JSON.stringify(m.area)})`);
  } else {
    // três inteiros à vista; o quarto aparece rolando a área para o lado (a página não rola)
    assert.ok(m.rolaDeLado > 0, `${largura}: a área dos blocos rola para o lado`);
    assert.ok(m.blocos.slice(0, 3).every((b) => b.right <= m.area.right + 1), `${largura}: três blocos inteiros à vista`);
    await p.locator('.prod-blocos').evaluate((a) => (a.scrollLeft = a.scrollWidth));
    const fim = await medidasDosBlocos(p);
    assert.ok(Math.abs(fim.blocos.at(-1).right - fim.area.right) <= 1, `${largura}: rolando para o lado, a última praça aparece inteira`);
    await p.locator('.prod-blocos').evaluate((a) => (a.scrollLeft = 0));
  }
}

/** Numa janela baixa, o topo do bloco e o das colunas ficam presos em cima ao rolar a área para baixo. */
async function topoPreso(p, largura) {
  await p.setViewportSize({ width: largura, height: 560 });
  const area = p.locator('.prod-blocos');
  const { rola, topo } = await area.evaluate((a) => ({ rola: a.scrollHeight - a.clientHeight, topo: a.getBoundingClientRect().top }));
  assert.ok(rola > 80, `numa janela baixa, a área dos blocos rola para baixo (${rola}px)`);
  await area.evaluate((a) => (a.scrollTop = a.scrollHeight));
  const presos = await p.locator('.prod-bloco:not(.recolhido)').evaluateAll((bs) =>
    bs.map((b) => ({ topo: b.querySelector('.prod-bloco-topo').getBoundingClientRect(), coluna: b.querySelector('.prod-coluna h3').getBoundingClientRect() })),
  );
  for (const b of presos) {
    assert.ok(Math.abs(b.topo.top - topo) <= 1, `o topo do bloco fica em cima (${b.topo.top} e ${topo})`);
    assert.ok(Math.abs(b.coluna.top - b.topo.bottom) <= 1, 'o nome da coluna fica logo abaixo do topo do bloco');
  }
  // #159 e #167, os cantos com a área rolando: os topos presos levam o canto arredondado do bloco e da coluna (a quina
  // não fica pontuda), e o bloco e a coluna cortam sem criar rolagem (o topo continua preso)
  const cantos = await p.locator('.prod-bloco:not(.recolhido)').first().evaluate((b) => {
    const e = (s) => getComputedStyle(b.querySelector(s));
    return { topo: e('.prod-bloco-topo').borderTopLeftRadius, nome: e('.prod-coluna h3').borderTopLeftRadius, coluna: e('.prod-coluna').borderTopLeftRadius, bloco: getComputedStyle(b).overflow, corte: e('.prod-coluna').overflow, raio: getComputedStyle(b).borderTopLeftRadius };
  });
  assert.deepEqual(cantos, { topo: '13px', nome: '10px', coluna: '10px', bloco: 'clip', corte: 'clip', raio: '14px' }, 'os cantos redondos com a área rolando');
  // #167: rolada, o "últimos dias" some (a altura fecha), o cabeçalho da coluna baixa e a fenda aparece onde há card
  // passando por baixo; de volta ao topo, tudo volta
  await p.waitForTimeout(350);
  const rolada = await p.evaluate(() => {
    const a = document.querySelector('.prod-blocos');
    const recente = document.querySelector('.prod-coluna[data-coluna="entregue"] .prod-recente');
    const cobertas = [...document.querySelectorAll('.prod-coluna[data-coberta]')];
    return {
      marcada: a.hasAttribute('data-rolada'),
      recente: recente.getBoundingClientRect().height,
      cabeca: parseFloat(getComputedStyle(document.querySelector('.prod-coluna:not(.fina) h3')).paddingTop),
      cobertas: cobertas.length,
      fenda: cobertas.map((c) => getComputedStyle(c.querySelector('h3'), '::after').opacity),
      semFenda: [...document.querySelectorAll('.prod-coluna:not([data-coberta]) h3')].map((h) => getComputedStyle(h, '::after').opacity),
    };
  });
  assert.ok(rolada.marcada && rolada.recente < 1 && rolada.cabeca === 6, `rolada: o "últimos dias" some e o cabeçalho baixa (${JSON.stringify(rolada)})`);
  assert.ok(rolada.cobertas > 0 && rolada.fenda.every((o) => o === '1') && rolada.semFenda.every((o) => o === '0'), `a fenda só onde há card por baixo (${JSON.stringify(rolada)})`);
  await capturar(p, `01b-producoes-${largura}-rolada`);
  assert.ok(await p.evaluate(() => scrollY === 0), 'quem rola é a área dos blocos, não a página');
  // #167: o hover do card é o da agenda: só a borda, sem subir nem sombra
  const card = p.locator('.prod-card').first();
  await card.hover();
  await p.waitForTimeout(250);
  const hover = await card.evaluate((c) => ({ transform: getComputedStyle(c).transform, sombra: getComputedStyle(c).boxShadow }));
  assert.deepEqual(hover, { transform: 'none', sombra: 'none' }, 'o hover não levanta o card');
  await p.mouse.move(2, 2);
  await area.evaluate((a) => (a.scrollTop = 0));
  await p.waitForTimeout(350);
  const noTopo = await p.evaluate(() => ({ marcada: document.querySelector('.prod-blocos').hasAttribute('data-rolada'), recente: document.querySelector('.prod-coluna[data-coluna="entregue"] .prod-recente').getBoundingClientRect().height, cobertas: document.querySelectorAll('.prod-coluna[data-coberta]').length }));
  assert.ok(!noTopo.marcada && noTopo.recente > 10 && noTopo.cobertas === 0, `no topo, o "últimos dias" volta e a fenda some (${JSON.stringify(noTopo)})`);
  await p.setViewportSize({ width: largura, height: 1000 });
}

async function noComputador(navegador, url, tema, chamadasAoTrello) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  // o claro a 1920px, o escuro a 1440px
  const largura = tema === 'dark' ? 1440 : 1920;
  const { ctx, p, erros, aoTrello, leituras } = await abrir(navegador, url, { viewport: { width: largura, height: 1000 }, colorScheme: tema }, '', { relogio: tema === 'light' });
  assert.equal(await fundoEscuro(p), tema === 'dark');

  // a entrada no topo da fila, ao lado da agenda No Trello; o endereço próprio, na área Designer
  await p.locator('.barra-topo .perfil').waitFor();
  const naFila = await posicoesDoTopo(p);
  await p.locator('.barra-topo .topo-producoes').click();
  await p.locator('.prod-pagina').waitFor();
  await topoParado(p, naFila, `${largura}: da fila para as Produções, logo depois do clique`);
  await p.locator('.prod-bloco').first().waitFor();
  await topoParado(p, naFila, `${largura}: nas Produções`);
  await quieta(p);
  assert.equal(hash(p), '#/designer/producoes');
  assert.equal((await p.locator('.prod-cabeca h1').textContent()).trim(), 'Produções');
  // sem o texto de explicação (#159)
  assert.equal(await p.locator('.prod-sub').count(), 0, 'sem o texto de explicação');
  assert.equal(await p.getByText(/Um bloco por praça/).count(), 0, 'sem o texto de explicação');
  // no máximo 3 praças abertas: a quarta (o INTER) fechada, com o nome na vertical, menor
  assert.deepEqual(await recolhidos(p), ['INTER'], 'sem escolha, as três primeiras abertas');
  const inter = await p.locator('.prod-bloco[data-praca="INTER"] h2').evaluate((h) => ({ modo: getComputedStyle(h).writingMode, alto: h.getBoundingClientRect().height > h.getBoundingClientRect().width, tam: parseFloat(getComputedStyle(h.querySelector('.prod-sigla')).fontSize) }));
  assert.ok(inter.modo === 'vertical-rl' && inter.alto && inter.tam < 28, `a praça fechada com o nome na vertical, menor (${JSON.stringify(inter)})`);
  assert.deepEqual(await contasRecolhido(p, 'INTER'), [0, 0, 0], 'a fechada com o resumo das contagens');
  // a Produzindo vazia é fina; a com card, não
  const larguraDa = (praca, k) => coluna(p, praca, k).evaluate((c) => c.getBoundingClientRect().width);
  // #167: só quando falta largura (a 1440 px, com três praças); a 1920 px, com espaço, ela divide com as outras
  if (largura >= 1920) assert.ok((await larguraDa('SP', 'produzindo')) > 150, 'com espaço, a Produzindo vazia é larga');
  else assert.ok((await larguraDa('SP', 'produzindo')) < 50 && (await larguraDa('SP', 'entrada')) > 150, 'apertada, a Produzindo vazia fica fina');
  assert.ok((await larguraDa('G5', 'produzindo')) > 100, 'a Produzindo com card, não');
  // as divisórias por dia no Entregue: o Jogo Final, entregue ontem
  assert.deepEqual(await textos(coluna(p, 'G5', 'entregue').locator('.prod-dia-nome')), ['ontem'], 'as divisórias por dia no Entregue');

  // um bloco por praça, na ordem das praças (a que não tem nada também), com as três colunas dentro dele
  assert.deepEqual(await p.locator('.prod-bloco').evaluateAll((fs) => fs.map((f) => f.dataset.praca)), ['G5', 'RJ', 'SP', 'INTER']);
  assert.deepEqual(await p.locator('.prod-bloco[data-praca="SP"] .prod-coluna').evaluateAll((cs) => cs.map((c) => c.dataset.coluna)), ['entrada', 'produzindo', 'entregue']);
  assert.deepEqual(await textos(p.locator('.prod-bloco[data-praca="SP"] .prod-coluna-nome')), ['Entrada', 'Produzindo', 'Entregue']);
  // no topo do bloco, a sigla, o nome e o total da praça
  assert.deepEqual(await textos(p.locator('.prod-bloco[data-praca="SP"] .prod-bloco-topo').locator('.prod-sigla, .prod-nome, .prod-total')), ['SP', 'São Paulo', '3 produções']);
  await blocosLadoALado(p, largura);

  // a contagem de cada coluna
  assert.deepEqual(await contas(p, 'SP'), [3, 0, 0]);
  assert.deepEqual(await contas(p, 'G5'), [1, 1, 1]);
  assert.deepEqual(await contas(p, 'RJ'), [0, 0, 0]);

  // a ordem do prazo; no mesmo prazo, a ALTA primeiro, com o marca-texto da agenda
  assert.deepEqual(await claquetes(p, 'SP', 'entrada'), [`Cozinha de Vó ${dm(1)} SP`, `Festa na Praça ${dm(3)} SP`, `Show da Noite ${dm(3)} SP`]);
  const festa = cardDe(p, 'Festa na Praça');
  assert.equal(await festa.locator('.marca-texto').count(), 1);
  assert.equal(await cardDe(p, 'Show da Noite').locator('.marca-texto').count(), 0);
  // o card: a atração (do Roteiro enviado), as artes, o prazo
  assert.equal((await festa.locator('.prod-atracao').textContent()).trim(), 'Festa na Praça');
  assert.equal((await festa.locator('.prod-artes').textContent()).trim(), '1 arte');
  assert.equal((await festa.locator('.prod-prazo').textContent()).replace(/\s+/g, ' ').trim(), `ao ar ${prazo(3)}`);
  assert.equal((await cardDe(p, 'Show da Noite').locator('.prod-artes').textContent()).trim(), '3 artes');
  // os designers e o marcador de Produzindo
  const novela = cardDe(p, 'Novela Sinfonia');
  assert.equal((await novela.locator('.prod-designers').textContent()).trim(), 'Dora Lima, Enzo Prado');
  assert.equal((await novela.locator('.prod-marcador').textContent()).trim(), 'Aguardando material');
  assert.equal((await novela.locator('.prod-artes').textContent()).trim(), '2 artes');
  await versoesNosCards(p, `computador ${largura}px`);

  // o Entregue: só os dos últimos 3 dias; a arquivada não aparece
  assert.deepEqual(await claquetes(p, 'G5', 'entregue'), [`Jogo Final ${dm(0)}`]);
  assert.match(await coluna(p, 'G5', 'entregue').locator('h3').textContent(), /últimos 3 dias/);
  assert.equal(await cardDe(p, 'Jogo Antigo').count(), 0);
  assert.equal(await cardDe(p, 'RIO Show').count(), 0);

  // as sem card ficam no bloco delas, marcadas
  assert.equal(await cardDe(p, 'Cozinha de Vó').locator('.prod-sem-card').count(), 1);
  const filme = coluna(p, 'G5', 'entrada').locator('.prod-card');
  assert.equal((await filme.locator('.prod-atracao').textContent()).trim(), 'Filme da Tarde');
  assert.equal(await filme.locator('.prod-sem-card').count(), 1);
  assert.equal(await festa.locator('.prod-sem-card').count(), 0);

  await semRolagemDeLado(p, `computador ${nome}`);
  await capturar(p, `01-producoes-${largura}-${nome}`);
  await topoPreso(p, largura);

  // a releitura a cada minuto, como a agenda
  if (tema === 'light') {
    const antes = leituras.length;
    const releu = p.waitForRequest((r) => new URL(r.url()).pathname === '/api/producoes/por-praca', { timeout: 5000 });
    await p.clock.fastForward(61_000);
    await releu;
    assert.ok(leituras.length > antes, 'a tela se lê de novo depois de um minuto');
  }

  // os caminhos do topo (#156, #168): "No Trello · Produções · Pauta da edição", com as Produções abertas e a bolinha
  // só antes da Pauta, sem o "De todo mundo"
  const caminhos = p.locator('.barra-topo nav.caminhos-do-topo');
  assert.deepEqual((await caminhos.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('aria-label')))).slice(0, 4), ['No Trello', 'Produções', 'Campanhas', 'Pauta da edição']);
  assert.equal(await caminhos.locator('[aria-current="page"]').getAttribute('aria-label'), 'Produções', 'as Produções são o caminho atual');
  assert.equal(await caminhos.locator('.caminho-bolinha').count(), 1, 'uma bolinha só');
  assert.equal(await caminhos.locator('.caminho-bolinha + .topo-pauta').count(), 1, 'a bolinha antes da Pauta');
  assert.equal(await p.locator('.barra-topo', { hasText: /de todo mundo/i }).count(), 0, 'sem o "De todo mundo"');
  // a volta para a agenda No Trello, com o topo parado
  await p.locator('.barra-topo .topo-agenda').click();
  await p.locator('.barra-topo .topo-agenda[aria-current="page"]').waitFor();
  await topoParado(p, naFila, `${largura}: das Produções para a fila`);
  assert.equal(hash(p), '#/designer');

  assert.deepEqual(aoTrello, [], 'nenhum pedido ao Trello pelo navegador');
  assert.deepEqual(chamadasAoTrello, [], 'nenhum pedido ao Trello pelo servidor');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log(`ok: computador ${nome} (${largura}px): os blocos lado a lado${largura < 1920 ? ' (a área rola para o lado)' : ', na largura toda'}, o topo preso ao rolar, as colunas com a contagem, os cards na ordem do prazo, o Entregue recente`);
}

async function noTablet(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, { ...devices['iPad Mini'], colorScheme: 'light' });
  await p.locator('.prod-bloco').first().waitFor();
  await quieta(p);
  const m = await medidasDosBlocos(p);
  assert.equal(new Set(m.blocos.map((b) => b.top)).size, 1, 'tablet: os blocos lado a lado');
  assert.ok(m.blocos[0].right <= m.area.right + 1, `tablet: cabe um bloco inteiro (${m.blocos[0].width}px em ${m.largura}px)`);
  assert.ok(m.rolaDeLado > 0, 'tablet: a área rola para o lado entre as praças');
  const topos = await p.locator('.prod-bloco[data-praca="G5"] .prod-coluna').evaluateAll((cs) => cs.map((c) => Math.round(c.getBoundingClientRect().top)));
  assert.equal(new Set(topos).size, 1, 'tablet: no bloco, as colunas lado a lado');
  assert.deepEqual(await passamDaBorda(p), [], 'tablet: nada passa da borda do card');
  await versoesNosCards(p, 'tablet');
  await semRolagemDeLado(p, 'tablet');
  await capturar(p, '02-producoes-tablet');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: tablet: um bloco inteiro à vista, a área rola para o lado entre as praças');
}

async function noCelular(navegador, url, tema, chamadasAoTrello) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: tema });
  await p.locator('.prod-bloco').first().waitFor();
  assert.equal(await fundoEscuro(p), tema === 'dark');
  // as praças uma embaixo da outra, e as etapas de cada uma também
  const blocos = await p.locator('.prod-bloco').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom })));
  assert.ok(blocos.every((b, i) => i === 0 || blocos[i - 1].bottom <= b.top), 'no celular, as praças uma embaixo da outra');
  const caixas = await p.locator('.prod-bloco[data-praca="SP"] .prod-coluna').evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom, left: Math.round(r.left) })));
  assert.equal(caixas.length, 3);
  assert.ok(caixas[0].bottom <= caixas[1].top && caixas[1].bottom <= caixas[2].top, 'no celular, Entrada, Produzindo e Entregue uma embaixo da outra');
  assert.equal(new Set(caixas.map((c) => c.left)).size, 1);
  assert.deepEqual(await claquetes(p, 'SP', 'entrada'), [`Cozinha de Vó ${dm(1)} SP`, `Festa na Praça ${dm(3)} SP`, `Show da Noite ${dm(3)} SP`]);
  await versoesNosCards(p, `celular ${nome}`);
  await semRolagemDeLado(p, `celular ${nome}`);
  await capturar(p, `03-producoes-celular-${nome}`);
  // #167: rolada, no celular (a página rola; o cabeçalho da coluna não fica preso ali)
  if (CAPTURAS) {
    await p.evaluate(() => scrollTo(0, 700));
    await p.waitForTimeout(300);
    await p.screenshot({ path: join(CAPTURAS, `03b-producoes-celular-${nome}-rolada.png`) });
    await p.evaluate(() => scrollTo(0, 0));
  }
  assert.deepEqual(aoTrello, []);
  assert.deepEqual(chamadasAoTrello, []);
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log(`ok: celular ${nome}: as etapas uma embaixo da outra, sem rolar para o lado`);
}

async function entradaNoCelular(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, devices['iPhone 13'], '');
  const entrada = p.locator('.barra-topo .topo-producoes');
  await entrada.waitFor();
  assert.equal(await entrada.locator('.caminho-nome').isVisible(), false, 'no celular, só o ícone');
  await semRolagemDeLado(p, 'fila no celular');
  await entrada.tap();
  await p.locator('.prod-bloco').first().waitFor();
  assert.equal(hash(p), '#/designer/producoes');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: celular: a entrada no topo da fila (o ícone) abre a tela de produções');
}

/** O que o servidor escreveu no Trello: "MÉTODO /caminho ?consulta" (sem a chave e o token). */
const escrito = (u, metodo) => {
  const url = new URL(u);
  const consulta = [...url.searchParams].filter(([k]) => k !== 'key' && k !== 'token').map(([k, v]) => `${k}=${v}`).join('&');
  return `${metodo} ${url.pathname.replace(/^\/1/, '')}${consulta ? ` ?${consulta}` : ''}`;
};
const designersDe = async (c) => ((await c.locator('.prod-designers').count()) ? (await c.locator('.prod-designers').textContent()).trim() : '');

async function osBotoes(navegador, url, chamadasAoTrello) {
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await p.locator('.prod-bloco').first().waitFor();
  assert.equal(await p.locator('.prod-sem-ligacao').count(), 0, 'a Lia está ligada a um designer');
  // da Entrada, "Peguei"; de Produzindo, "Entreguei" e a volta para a Entrada; de Entregue, a volta para a Entrada
  assert.deepEqual(await textos(coluna(p, 'SP', 'entrada').locator('.prod-mudar')), ['Peguei', 'Peguei', 'Peguei']);
  assert.deepEqual(await textos(coluna(p, 'G5', 'produzindo').locator('.prod-mudar')), ['Entreguei', 'Voltar para a Entrada']);
  assert.deepEqual(await textos(coluna(p, 'G5', 'entregue').locator('.prod-mudar')), ['Voltar para a Entrada']);

  // "Peguei": o card vai para Produzindo com a Lia; no Trello, a Lia entra no card (o card fica na lista). A Produzindo,
  // fina, se abre deslizando (#159), e o card desliza para ela
  const produzindoSP = coluna(p, 'SP', 'produzindo');
  assert.ok((await produzindoSP.evaluate((c) => c.getBoundingClientRect().width)) < 50, 'a Produzindo do SP, vazia, é fina');
  await gravarMovimento(p);
  await cardDe(p, 'Festa na Praça').locator('.prod-mudar').click();
  await p.waitForTimeout(350);
  const aberta = await produzindoSP.evaluate((c) => c.getBoundingClientRect().width);
  const abrindo = await movimento(p);
  assert.ok(abrindo.includes('transição grid-template-columns prod-colunas') && aberta > 100, `com o Peguei, a Produzindo se abre deslizando (${abrindo} → ${aberta}px)`);
  assert.ok(abrindo.some((m) => m.startsWith('deslize card Festa na Praça')), `o card desliza para a Produzindo (${abrindo})`);
  await coluna(p, 'SP', 'produzindo').locator('.prod-card', { hasText: 'Festa na Praça' }).waitFor();
  assert.deepEqual(await contas(p, 'SP'), [2, 1, 0]);
  assert.equal(await designersDe(cardDe(p, 'Festa na Praça')), 'Lia Moraes');
  assert.deepEqual(await textos(cardDe(p, 'Festa na Praça').locator('.prod-mudar')), ['Entreguei', 'Voltar para a Entrada']);
  await p.waitForFunction(() => !document.querySelector('.prod-mudar:disabled'));
  assert.deepEqual(chamadasAoTrello.splice(0), [`POST /cards/${card(2)}/idMembers ?value=membroLia`]);
  await capturar(p, '04-producoes-peguei');

  // o Trello recusa: a tela volta atrás e mostra o motivo
  await cardDe(p, 'Show da Noite').locator('.prod-mudar').click();
  const recusa = p.locator('.prod-recusa');
  await recusa.waitFor();
  assert.match(await recusa.textContent(), /Show da Noite.*Trello recusou.*Nada mudou/s);
  await p.waitForFunction(() => !document.querySelector('.prod-mudar:disabled'));
  assert.deepEqual(await claquetes(p, 'SP', 'entrada'), [`Cozinha de Vó ${dm(1)} SP`, `Show da Noite ${dm(3)} SP`]);
  assert.deepEqual(await contas(p, 'SP'), [2, 1, 0]);
  chamadasAoTrello.splice(0);
  await capturar(p, '05-producoes-trello-recusou');
  await recusa.locator('button').click();
  assert.equal(await recusa.count(), 0);

  // voltar para a Entrada: de Produzindo (a Lia não estava: os outros ficam) e de Entregue (o card sai da saída)
  await cardDe(p, 'Novela Sinfonia').locator('.prod-mudar.voltar').click();
  await coluna(p, 'G5', 'entrada').locator('.prod-card', { hasText: 'Novela Sinfonia' }).waitFor();
  assert.equal(await designersDe(cardDe(p, 'Novela Sinfonia')), 'Dora Lima, Enzo Prado');
  await cardDe(p, 'Jogo Final').locator('.prod-mudar').click();
  await coluna(p, 'G5', 'entrada').locator('.prod-card', { hasText: 'Jogo Final' }).waitFor();
  assert.deepEqual(await contas(p, 'G5'), [3, 0, 0]);
  await p.waitForFunction(() => !document.querySelector('.prod-mudar:disabled'));
  assert.deepEqual(chamadasAoTrello.splice(0), [`DELETE /cards/${card(4)}/idMembers/membroLia`, `PUT /cards/${card(5)} ?idList=entradaG5`, `DELETE /cards/${card(5)}/idMembers/membroLia`]);

  // a Produção sem card: só no PROMeiro
  await cardDe(p, 'Cozinha de Vó').locator('.prod-mudar').click();
  await coluna(p, 'SP', 'produzindo').locator('.prod-card', { hasText: 'Cozinha de Vó' }).waitFor();
  await p.waitForFunction(() => !document.querySelector('.prod-mudar:disabled'));
  assert.deepEqual(chamadasAoTrello, [], 'a Produção sem card não vai ao Trello');

  // recarregada, a tela mostra o que o PROMeiro guardou
  await p.reload();
  await p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await claquetes(p, 'SP', 'produzindo'), [`Cozinha de Vó ${dm(1)} SP`, `Festa na Praça ${dm(3)} SP`]);
  assert.deepEqual(await contas(p, 'G5'), [3, 0, 0]);
  console.log('ok: os botões: Peguei, Voltar para a Entrada (de Produzindo e de Entregue), a recusa do Trello desfeita na tela, a sem card só no PROMeiro');

  // "Entreguei" com arte faltando (#111): o card fica em Produzindo, com o aviso das que faltam; nada vai ao Trello
  const festaNoSP = cardDe(p, 'Festa na Praça');
  await festaNoSP.locator('.prod-mudar.entregar').click();
  const aviso = festaNoSP.locator('.prod-aviso');
  await aviso.waitFor();
  assert.match(await aviso.locator('.prod-aviso-texto').textContent(), /Falta marcar 1 arte no checklist/);
  assert.deepEqual(await textos(aviso.locator('.prod-aviso-artes li')), ['HOJE']);
  assert.deepEqual(await textos(aviso.locator('button')), ['Entregar assim mesmo', 'Voltar']);
  assert.deepEqual(await claquetes(p, 'SP', 'produzindo'), [`Cozinha de Vó ${dm(1)} SP`, `Festa na Praça ${dm(3)} SP`]);
  assert.equal(await festaNoSP.locator('.prod-mudar').count(), 0, 'o aviso fica no lugar dos botões');
  assert.deepEqual(await passamDaBorda(p), [], 'com o aviso, nada passa da borda do card');
  assert.deepEqual(chamadasAoTrello, [], 'o aviso não vai ao Trello');
  await capturar(p, '08-producoes-aviso-arte-faltando');
  // "Voltar": fecha o aviso, e nada muda
  await aviso.getByRole('button', { name: 'Voltar' }).click();
  assert.equal(await aviso.count(), 0);
  assert.deepEqual(await textos(festaNoSP.locator('.prod-mudar')), ['Entreguei', 'Voltar para a Entrada']);
  assert.deepEqual(await contas(p, 'SP'), [1, 2, 0]);
  // "Entregar assim mesmo": o card vai para Entregue e, no Trello, para a saída da praça
  await festaNoSP.locator('.prod-mudar.entregar').click();
  await aviso.waitFor();
  await aviso.getByRole('button', { name: 'Entregar assim mesmo' }).click();
  await coluna(p, 'SP', 'entregue').locator('.prod-card', { hasText: 'Festa na Praça' }).waitFor();
  await p.waitForFunction(() => !document.querySelector('.prod-mudar:disabled, .prod-aviso'));
  assert.deepEqual(chamadasAoTrello.splice(0), [`PUT /cards/${card(2)} ?idList=saidaSP`]);
  // a sem card, sem a lista de artes: entregue direto, sem aviso, só no PROMeiro
  await cardDe(p, 'Cozinha de Vó').locator('.prod-mudar.entregar').click();
  await coluna(p, 'SP', 'entregue').locator('.prod-card', { hasText: 'Cozinha de Vó' }).waitFor();
  await p.waitForFunction(() => !document.querySelector('.prod-mudar:disabled'));
  assert.equal(await p.locator('.prod-aviso').count(), 0);
  assert.deepEqual(chamadasAoTrello, [], 'a entrega sem card não vai ao Trello');
  assert.deepEqual(await contas(p, 'SP'), [1, 0, 2]);
  // as divisórias por dia: as duas, entregues hoje
  assert.deepEqual(await textos(coluna(p, 'SP', 'entregue').locator('.prod-dia-nome')), ['hoje']);
  await capturar(p, '09-producoes-entregues');
  // recarregada, as duas ficam no Entregue
  await p.reload();
  await p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await claquetes(p, 'SP', 'entregue'), [`Cozinha de Vó ${dm(1)} SP`, `Festa na Praça ${dm(3)} SP`]);
  assert.deepEqual(aoTrello, [], 'nenhum pedido ao Trello pelo navegador');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: Entreguei: o aviso da arte faltando (Voltar e Entregar assim mesmo), o card na saída da praça, a sem card só no PROMeiro');

  // no celular, os botões no tamanho do dedo
  const cel = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await cel.p.locator('.prod-bloco').first().waitFor();
  await quieta(cel.p);
  const alturas = await cel.p.locator('.prod-mudar').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height));
  assert.ok(alturas.length > 0 && alturas.every((h) => h >= 44), `no celular, os botões têm 44px (${alturas})`);
  await semRolagemDeLado(cel.p, 'celular com os botões');
  await capturar(cel.p, '06-producoes-celular-botoes');
  assert.deepEqual(cel.erros, []);
  await cel.ctx.close();
  console.log('ok: celular: os botões com 44px');

  // quem não está ligado a um designer: vê a tela, sem os botões, e a explicação
  const rui = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, '#/designer/producoes', { email: RUI });
  await rui.p.locator('.prod-bloco').first().waitFor();
  assert.match(await rui.p.locator('.prod-sem-ligacao').textContent(), /cadastro de designer.*administrador/s);
  assert.equal(await rui.p.locator('.prod-mudar').count(), 0);
  await capturar(rui.p, '07-producoes-sem-ligacao');
  assert.deepEqual(rui.erros, []);
  await rui.ctx.close();
  console.log('ok: sem a ligação com o designer: a tela sem os botões, com a explicação');
}

/** Arrasta o card até a coluna com o mouse (o arrastar do navegador); `antes` olha a tela com o card no ar. */
async function arrastar(p, cardLoc, destino, antes = async () => {}) {
  const pega = await cardLoc.locator('.prod-claquete').boundingBox();
  await cardLoc.locator('.prod-claquete').hover();
  await p.mouse.down();
  // o card sai do lugar e a Produzindo vazia se abre (#159): o destino é medido depois que ela se abriu
  await p.mouse.move(pega.x + pega.width / 2 + 12, pega.y + pega.height / 2 + 4, { steps: 2 });
  await p.waitForTimeout(280);
  const caixa = await destino.boundingBox();
  await p.mouse.move(caixa.x + caixa.width / 2, caixa.y + Math.min(caixa.height / 2, 60), { steps: 8 });
  await antes();
  await p.mouse.up();
}
const calmo = (p) => p.waitForFunction(() => !document.querySelector('.prod-mudar:disabled'));

async function arrastarEDesfazer(navegador, url, chamadasAoTrello, trelloFalso) {
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await p.locator('.prod-bloco').first().waitFor();
  chamadasAoTrello.splice(0);
  const novela = () => cardDe(p, 'Novela Sinfonia');
  assert.equal(await novela().getAttribute('draggable'), 'true', 'no computador, o card se arrasta');
  assert.deepEqual(await contas(p, 'G5'), [3, 0, 0]);

  // arrastar da Entrada para Produzindo é pegar: no ar, só as colunas do bloco dele para onde ele pode ir ficam marcadas.
  // A Produzindo, fina, se abre ao começar o arrasto (#159), e o contorno da coluna-alvo fica por cima do nome dela
  const produzindoG5 = coluna(p, 'G5', 'produzindo');
  assert.ok(await produzindoG5.evaluate((c) => c.classList.contains('fina') && c.getBoundingClientRect().width < 50), 'a Produzindo vazia, fina');
  await arrastar(p, novela(), produzindoG5, async () => {
    assert.ok(await produzindoG5.evaluate((c) => !c.classList.contains('fina') && c.getBoundingClientRect().width > 100), 'com o card no ar, a Produzindo se abre');
    const contorno = await produzindoG5.evaluate((c) => {
      const depois = getComputedStyle(c, '::after');
      const h3 = getComputedStyle(c.querySelector('h3'));
      return { sombra: depois.boxShadow, camada: Number(depois.zIndex) >= Number(h3.zIndex), cobre: depois.position === 'absolute' && depois.top === '0px' };
    });
    assert.ok(/inset/.test(contorno.sombra) && contorno.camada && contorno.cobre, `o contorno da coluna-alvo por cima do nome, sem corte (${JSON.stringify(contorno)})`);
    const marcadas = await p.locator('.prod-coluna.aceita').evaluateAll((cs) => cs.map((c) => `${c.closest('.prod-bloco').dataset.praca} ${c.dataset.coluna}${c.classList.contains('sobre') ? ' (sobre)' : ''}`));
    assert.deepEqual(marcadas, ['G5 produzindo (sobre)', 'G5 entregue']);
    await capturar(p, '10-producoes-arrastando');
  });
  await coluna(p, 'G5', 'produzindo').locator('.prod-card', { hasText: 'Novela Sinfonia' }).waitFor();
  await calmo(p);
  assert.equal(await designersDe(novela()), 'Dora Lima, Enzo Prado, Lia Moraes');
  assert.deepEqual(chamadasAoTrello.splice(0), [`POST /cards/${card(4)}/idMembers ?value=membroLia`]);
  assert.equal(await p.locator('.prod-coluna.aceita').count(), 0, 'solto, nenhuma coluna fica marcada');
  // soltar fora não deixa a Produzindo aberta: vazia de novo (depois do desfazer), ela se recolhe
  // a caixinha de desfazer
  const caixinha = p.locator('.desfazer');
  await caixinha.waitFor();
  assert.match(await caixinha.locator('.desfazer-texto').textContent(), /Você pegou Novela Sinfonia/);
  // #171: a caixinha única: o "Desfazer" em texto sublinhado, o × e o trilho do tempo de 8 s, encolhendo
  const forma = await caixinha.evaluate((c) => {
    const b = c.querySelector('.desfazer-botao');
    const t = c.querySelector('.desfazer-trilho');
    const a = t?.getAnimations()[0];
    return { sublinhado: getComputedStyle(b).textDecorationLine, fundo: getComputedStyle(b).backgroundColor, fechar: !!c.querySelector('.desfazer-fechar[aria-label="Fechar"]'), duracao: a?.effect?.getTiming().duration, altura: t?.getBoundingClientRect().height };
  });
  assert.equal(forma.sublinhado, 'underline', 'o Desfazer é texto sublinhado');
  assert.equal(forma.fundo, 'rgba(0, 0, 0, 0)', 'o Desfazer não é botão cheio');
  assert.ok(forma.fechar, 'a caixinha tem o ×');
  assert.equal(forma.duracao, 8000, 'o trilho do tempo leva 8 s');
  assert.equal(forma.altura, 2, 'o trilho é um fio de 2 px');
  // #171: o seu card: a Lia pegou, o card fica tingido de --ultra com o "você" à mão, como a sua linha na Pauta
  assert.ok(await novela().evaluate((c) => c.classList.contains('seu')), 'o card que a Lia pegou é o dela');
  assert.equal((await novela().locator('.voce-a-mao').textContent()).trim(), 'você');
  const fundos = await novela().evaluate((c) => [getComputedStyle(c).backgroundColor, getComputedStyle(c.closest('.prod-coluna').querySelector('.prod-card:not(.seu)') ?? document.body).backgroundColor]);
  assert.notEqual(fundos[0], fundos[1], 'o seu card tem o fundo tingido');
  assert.equal(await p.locator('.prod-card.seu').count(), await p.locator('.prod-card', { has: p.locator('.prod-designers', { hasText: 'Lia Moraes' }) }).count(), 'só os cards da Lia');
  await capturar(p, '11-producoes-desfazer');
  // "Desfazer": o card volta para a Entrada, e no Trello a Lia sai do card
  await caixinha.getByRole('button', { name: 'Desfazer' }).click();
  await coluna(p, 'G5', 'entrada').locator('.prod-card', { hasText: 'Novela Sinfonia' }).waitFor();
  await caixinha.waitFor({ state: 'detached', timeout: 2000 });
  await calmo(p);
  assert.equal(await designersDe(novela()), 'Dora Lima, Enzo Prado');
  assert.deepEqual(chamadasAoTrello.splice(0), [`DELETE /cards/${card(4)}/idMembers/membroLia`]);
  await p.reload();
  await p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await contas(p, 'G5'), [3, 0, 0], 'o desfeito fica depois de recarregar');
  assert.ok(await produzindoG5.evaluate((c) => c.classList.contains('fina')), 'vazia de novo, a Produzindo se recolhe');

  // soltar no bloco de outra praça não muda nada
  await arrastar(p, novela(), coluna(p, 'SP', 'produzindo'), async () => {
    assert.equal(await coluna(p, 'SP', 'produzindo').evaluate((c) => c.classList.contains('aceita')), false);
  });
  await p.waitForTimeout(300);
  assert.deepEqual(await contas(p, 'G5'), [3, 0, 0]);
  assert.deepEqual(chamadasAoTrello, [], 'soltar fora do bloco não vai ao Trello');

  // arrastar da Entrada para Entregue, com arte faltando: o aviso, e o card fica onde está; "Entregar assim mesmo" entrega
  await arrastar(p, novela(), coluna(p, 'G5', 'entregue'));
  const aviso = novela().locator('.prod-aviso');
  await aviso.waitFor();
  assert.deepEqual(await textos(aviso.locator('.prod-aviso-artes li')), ['HOJE', 'AMANHÃ']);
  assert.deepEqual(await contas(p, 'G5'), [3, 0, 0]);
  assert.deepEqual(chamadasAoTrello, [], 'o aviso não vai ao Trello');
  assert.equal(await novela().getAttribute('draggable'), 'false', 'com o aviso aberto, o card não se arrasta');
  await aviso.getByRole('button', { name: 'Entregar assim mesmo' }).click();
  await coluna(p, 'G5', 'entregue').locator('.prod-card', { hasText: 'Novela Sinfonia' }).waitFor();
  await calmo(p);
  assert.deepEqual(chamadasAoTrello.splice(0), [`PUT /cards/${card(4)} ?idList=saidaG5`]);
  assert.match(await caixinha.locator('.desfazer-texto').textContent(), /Novela Sinfonia .* foi entregue/);
  // desfazer a entrega: o card volta para a entrada da praça
  await caixinha.getByRole('button', { name: 'Desfazer' }).click();
  await coluna(p, 'G5', 'entrada').locator('.prod-card', { hasText: 'Novela Sinfonia' }).waitFor();
  await calmo(p);
  assert.deepEqual(chamadasAoTrello.splice(0), [`PUT /cards/${card(4)} ?idList=entradaG5`]);

  // o Trello recusa o desfazer: o card volta para onde a mudança o deixou, e a tela diz o motivo
  const jogo = () => cardDe(p, 'Jogo Final');
  await arrastar(p, jogo(), coluna(p, 'G5', 'produzindo'));
  await coluna(p, 'G5', 'produzindo').locator('.prod-card', { hasText: 'Jogo Final' }).waitFor();
  await caixinha.waitFor();
  await calmo(p);
  chamadasAoTrello.splice(0);
  trelloFalso.recusar = true;
  await caixinha.getByRole('button', { name: 'Desfazer' }).click();
  const recusa = p.locator('.prod-recusa');
  await recusa.waitFor();
  trelloFalso.recusar = false;
  assert.match(await recusa.textContent(), /Não desfez Jogo Final.*Trello recusou/s);
  await calmo(p);
  assert.deepEqual(await claquetes(p, 'G5', 'produzindo'), [`Jogo Final ${dm(0)}`]);
  assert.equal(await designersDe(jogo()), 'Dora Lima, Lia Moraes');
  await recusa.locator('button').click();
  chamadasAoTrello.splice(0);

  // #171: o × fecha sem desfazer; sem nada, a caixinha fecha sozinha no fim dos 8 s
  await arrastar(p, jogo(), coluna(p, 'G5', 'entrada'));
  await caixinha.waitFor();
  await caixinha.locator('.desfazer-fechar').click();
  await caixinha.waitFor({ state: 'detached', timeout: 2000 });
  assert.equal(await coluna(p, 'G5', 'entrada').locator('.prod-card', { hasText: 'Jogo Final' }).count(), 1, 'o × não desfaz');
  await calmo(p);
  await arrastar(p, jogo(), coluna(p, 'G5', 'produzindo'));
  await caixinha.waitFor();
  const abriu = Date.now();
  await p.waitForTimeout(7000);
  assert.equal(await caixinha.count(), 1, 'aos 7 s, a caixinha ainda está à vista');
  await caixinha.waitFor({ state: 'detached', timeout: 3000 });
  const durou = Date.now() - abriu;
  assert.ok(durou >= 7900 && durou < 9500, `a caixinha fica 8 s (${durou} ms)`);
  await calmo(p);
  chamadasAoTrello.splice(0);
  assert.deepEqual(aoTrello, [], 'nenhum pedido ao Trello pelo navegador');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: arrastar: pegar e entregar da Entrada (com o aviso), só as colunas do bloco; desfazer na hora (também depois de recarregar), e a recusa do Trello desfeita na tela');

  // no celular, o card não se arrasta: os botões, e a caixinha de desfazer com 44px
  const cel = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await cel.p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await cel.p.locator('.prod-card').evaluateAll((cs) => cs.filter((c) => c.draggable).length), 0, 'no celular, nenhum card se arrasta');
  await cardDe(cel.p, 'Jogo Final').locator('.prod-mudar.voltar').tap();
  await coluna(cel.p, 'G5', 'entrada').locator('.prod-card', { hasText: 'Jogo Final' }).waitFor();
  const caixa = cel.p.locator('.desfazer');
  await caixa.waitFor();
  assert.match(await caixa.textContent(), /Jogo Final .* voltou para a Entrada/);
  await quieta(cel.p);
  const alturas = await caixa.locator('button').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height));
  assert.ok(alturas.length === 2 && alturas.every((h) => h >= 44), `no celular, os botões da caixinha têm 44px (${alturas})`);
  await semRolagemDeLado(cel.p, 'celular com a caixinha de desfazer');
  await capturar(cel.p, '12-producoes-celular-desfazer');
  await caixa.getByRole('button', { name: 'Desfazer' }).tap();
  await coluna(cel.p, 'G5', 'produzindo').locator('.prod-card', { hasText: 'Jogo Final' }).waitFor();
  await calmo(cel.p);
  assert.deepEqual(chamadasAoTrello.splice(0), [`DELETE /cards/${card(5)}/idMembers/membroLia`, `POST /cards/${card(5)}/idMembers ?value=membroLia`]);
  assert.deepEqual(cel.erros, []);
  await cel.ctx.close();
  console.log('ok: celular: sem arrastar, a mudança pelos botões e a caixinha de desfazer com 44px');
}

/** Os blocos recolhidos, na ordem da tela. */
const recolhidos = (p) => p.locator('.prod-bloco.recolhido').evaluateAll((bs) => bs.map((b) => b.dataset.praca));
/** As contagens do bloco recolhido: Entrada, Produzindo e Entregue. */
const contasRecolhido = async (p, praca) => (await textos(p.locator(`.prod-bloco[data-praca="${praca}"] .prod-contas-recolhido .prod-conta`))).map(Number);

async function recolherEAbrir(navegador, url, chamadasAoTrello) {
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await p.locator('.prod-bloco').first().waitFor();
  chamadasAoTrello.splice(0);
  assert.deepEqual(await recolhidos(p), ['INTER'], 'sem escolha, as três primeiras abertas (#159)');
  const g5 = await contas(p, 'G5');
  const guardou = () => p.waitForResponse((r) => new URL(r.url()).pathname === '/api/eu/preferencias' && r.request().method() === 'PUT' && r.ok());

  // recolher o RJ e o G5: uma coluna estreita com a sigla e as contagens; os outros blocos ficam com a largura
  let gravou = guardou();
  await p.getByRole('button', { name: 'Recolher o bloco RJ' }).click();
  assert.deepEqual(JSON.parse((await gravou).request().postData()), { 'producoes.recolhidos': ['RJ', 'INTER'] });
  gravou = guardou();
  await p.getByRole('button', { name: 'Recolher o bloco G5' }).click();
  await gravou;
  assert.deepEqual(await recolhidos(p), ['G5', 'RJ', 'INTER']);
  assert.deepEqual(await contasRecolhido(p, 'G5'), g5, 'o recolhido mostra a contagem de cada coluna');
  assert.deepEqual(await contasRecolhido(p, 'RJ'), [0, 0, 0]);
  assert.equal((await p.locator('.prod-bloco[data-praca="G5"] .prod-sigla').textContent()).trim(), 'G5');
  assert.equal(await p.locator('.prod-bloco[data-praca="G5"] .prod-card').count(), 0, 'o recolhido não mostra os cards');
  await quieta(p);
  const m = await medidasDosBlocos(p);
  const largura = (praca) => m.blocos.find((b) => b.praca === praca).width;
  assert.ok(largura('G5') < 100 && largura('RJ') < 100, `o recolhido é uma coluna estreita (${largura('G5')}px)`);
  assert.ok(m.rolaDeLado <= 1, `com três recolhidos, os blocos cabem sem rolar para o lado (${m.rolaDeLado}px)`);
  assert.ok(Math.abs(m.area.right - m.blocos.at(-1).right) <= 1 && largura('SP') > 448, `os abertos ficam com a largura (${largura('SP')}px)`);
  await capturar(p, '13-producoes-recolhidos');

  // recarregada, os dois continuam recolhidos (o servidor guardou)
  await p.reload();
  await p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await recolhidos(p), ['G5', 'RJ', 'INTER'], 'depois de recarregar, os blocos continuam recolhidos');
  // a outra pessoa vê todos abertos
  const outra = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, '#/designer/producoes', { email: RUI });
  await outra.p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await recolhidos(outra.p), ['INTER'], 'a outra pessoa vê as três primeiras abertas');
  await outra.ctx.close();
  // no celular (outro aparelho), o recolhido é uma linha só, com a sigla e as contagens
  const cel = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await cel.p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await recolhidos(cel.p), ['G5', 'RJ', 'INTER'], 'no celular, os mesmos recolhidos');
  const linha = await cel.p.locator('.prod-bloco[data-praca="G5"]').evaluate((b) => b.getBoundingClientRect().height);
  assert.ok(linha < 80, `no celular, o recolhido é uma linha (${linha}px)`);
  const toque = await cel.p.getByRole('button', { name: 'Mostrar o bloco G5' }).evaluate((b) => b.getBoundingClientRect().height);
  assert.ok(toque >= 44, 'no celular, o botão de mostrar tem 44px');
  await semRolagemDeLado(cel.p, 'celular com os recolhidos');
  await capturar(cel.p, '14-producoes-celular-recolhidos');
  assert.deepEqual(cel.erros, []);
  await cel.ctx.close();

  // mostrar o G5 de novo (um clique na coluna estreita): fica guardado também
  gravou = guardou();
  await p.locator('.prod-bloco[data-praca="G5"]').click();
  await gravou;
  await p.locator('.prod-bloco[data-praca="G5"] .prod-card').first().waitFor();
  assert.deepEqual(await contas(p, 'G5'), g5);
  await p.reload();
  await p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await recolhidos(p), ['RJ', 'INTER'], 'depois de recarregar, o RJ e o INTER recolhidos');

  // #159, no máximo 3 abertas: com a G5 e o SP abertos, abrir o RJ deixa três; abrir o INTER fecha a aberta há mais
  // tempo (a G5), com a largura deslizando
  await p.locator('.prod-bloco[data-praca="RJ"]').click();
  await p.locator('.prod-bloco[data-praca="RJ"]:not(.recolhido)').waitFor();
  assert.deepEqual(await recolhidos(p), ['INTER']);
  const larguraDe = (praca) => p.locator(`.prod-bloco[data-praca="${praca}"]`).evaluate((b) => b.getBoundingClientRect().width);
  const antesDeFechar = await larguraDe('G5');
  gravou = guardou();
  await gravarMovimento(p);
  await p.locator('.prod-bloco[data-praca="INTER"]').click();
  assert.deepEqual(JSON.parse((await gravou).request().postData()), { 'producoes.recolhidos': ['G5'] });
  await p.waitForTimeout(350);
  const fechada = await larguraDe('G5');
  assert.deepEqual(await recolhidos(p), ['G5'], 'abrir a quarta fecha a aberta há mais tempo');
  const fechando = await movimento(p);
  assert.ok(fechando.includes('transição grid-template-columns prod-blocos') && fechada < 100 && antesDeFechar > 400, `a mais antiga fecha deslizando (${antesDeFechar}px → ${fechada}px, ${fechando})`);
  assert.ok(await p.locator('.prod-bloco').evaluateAll((bs) => bs.filter((b) => !b.classList.contains('recolhido')).length === 3), 'nunca mais de 3 abertas');
  await capturar(p, '13b-producoes-tres-abertas');
  // a G5 de volta (fecha o RJ) e o SP também, para o resto: abertas a G5, o SP e o INTER
  await p.locator('.prod-bloco[data-praca="G5"]').click();
  await p.locator('.prod-bloco[data-praca="G5"]:not(.recolhido)').waitFor();
  assert.deepEqual(await recolhidos(p), ['SP'], 'a G5 de volta fecha o SP, o aberto há mais tempo');
  await p.locator('.prod-bloco[data-praca="SP"]').click();
  await p.locator('.prod-bloco[data-praca="SP"]:not(.recolhido)').waitFor();
  assert.deepEqual(await recolhidos(p), ['RJ']);
  await p.waitForTimeout(300);
  console.log('ok: recolher: a coluna estreita com a sigla e as contagens, guardada por pessoa (recarregar, outro aparelho); no máximo 3 abertas, a mais antiga fecha deslizando');

  // abrir a Produção (#160: o card aberto no centro): a linha do tempo (fechada, num link), as artes e o link do card
  const novela = cardDe(p, 'Novela Sinfonia');
  await novela.locator('.prod-atracao').click();
  const painel = p.getByRole('dialog');
  await painel.locator('.pa-arte').first().waitFor();
  assert.equal((await painel.locator('h2').textContent()).trim(), `Novela Sinfonia ${dm(2)} (AH)`);
  assert.equal((await painel.locator('.pa-etapa').textContent()).replace(/\s+/g, ' ').trim(), 'G5 · Entrada');
  assert.equal(await painel.locator('.pa-tempo-lista').count(), 0, 'a linha do tempo começa fechada');
  await painel.getByRole('button', { name: 'linha do tempo' }).click();
  const frases = await textos(painel.locator('.pa-tempo-lista li span'));
  assert.ok(frases.includes('Lia Moraes pegou') && frases.includes('Lia Moraes entregou'), `a linha do tempo diz o que a Lia fez (${frases.join(' · ')})`);
  assert.deepEqual(await textos(painel.locator('.pa-arte .txt')), ['HOJE', 'AMANHÃ']);
  assert.equal(await painel.locator('.pa-arte.marcada').count(), 0, 'nenhuma feita');
  const link = painel.getByRole('link', { name: 'Abrir no Trello' });
  assert.equal(await link.getAttribute('href'), `https://trello.com/c/${card(4)}`);
  assert.equal(await link.getAttribute('target'), '_blank');
  await capturar(p, '15-producoes-aberta');
  // fecha no Esc (voltando para o card), e o foco volta para o card
  await p.keyboard.press('Escape');
  await painel.waitFor({ state: 'detached' });
  await p.waitForFunction(() => document.activeElement?.matches('.prod-card') && document.activeElement.textContent.includes('Novela Sinfonia'));
  // o Enter no card em foco abre de novo; o clique fora fecha
  await p.keyboard.press('Enter');
  await painel.waitFor();
  await painel.locator('.pa-arte').first().waitFor();
  await p.mouse.click(40, 500);
  await painel.waitFor({ state: 'detached' });
  // a sem card: sem o link
  await cardDe(p, 'Cozinha de Vó').locator('.prod-claquete').click();
  await painel.locator('.pa-detalhe', { hasText: 'sem card no Trello' }).waitFor();
  assert.equal(await painel.getByRole('link').count(), 0);
  await painel.getByRole('button', { name: 'Fechar a Produção' }).click();
  await painel.waitFor({ state: 'detached' });

  // o clique num botão do card e o arrasto não abrem a Produção
  await cardDe(p, 'Cozinha de Vó').locator('.prod-mudar').click();
  await coluna(p, 'SP', 'entrada').locator('.prod-card', { hasText: 'Cozinha de Vó' }).waitFor();
  await calmo(p);
  const jogo = cardDe(p, 'Jogo Final');
  const ondeEsta = await jogo.getAttribute('data-etapa');
  await arrastar(p, jogo, coluna(p, 'G5', ondeEsta === 'entrada' ? 'produzindo' : 'entrada'));
  await coluna(p, 'G5', ondeEsta === 'entrada' ? 'produzindo' : 'entrada').locator('.prod-card', { hasText: 'Jogo Final' }).waitFor();
  await calmo(p);
  await p.waitForTimeout(200);
  assert.equal(await p.getByRole('dialog').count(), 0, 'o botão e o arrasto não abrem a Produção');
  assert.ok(chamadasAoTrello.every((c) => !c.startsWith('GET')), 'nada é lido do Trello');
  chamadasAoTrello.splice(0);
  assert.deepEqual(aoTrello, [], 'nenhum pedido ao Trello pelo navegador');
  assert.deepEqual(erros, []);
  await ctx.close();

  // no celular, a Produção aberta ocupa a tela
  const celular = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await celular.p.locator('.prod-bloco').first().waitFor();
  await cardDe(celular.p, 'Novela Sinfonia').locator('.prod-claquete').tap();
  const noCel = celular.p.getByRole('dialog');
  await noCel.locator('.pa-arte').first().waitFor();
  await noCel.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  const caixa = await noCel.boundingBox();
  assert.ok(caixa.x <= 1 && Math.abs(caixa.width - 390) <= 1, `no celular, a Produção aberta ocupa a tela (${JSON.stringify(caixa)})`);
  await semRolagemDeLado(celular.p, 'celular com a Produção aberta');
  await capturar(celular.p, '16-producoes-celular-aberta');
  await noCel.getByRole('button', { name: 'Fechar a Produção' }).tap();
  await noCel.waitFor({ state: 'detached' });
  assert.deepEqual(celular.aoTrello, []);
  assert.deepEqual(celular.erros, []);
  await celular.ctx.close();
  console.log('ok: abrir a Produção: a linha do tempo, as artes e o link do Trello (a sem card sem ele); fecha no ×, no Esc e fora; o botão e o arrasto não abrem; no celular, a tela toda');
}

/** #146: a arte feita (marcada pela janela do After) conta no card da tela: "1 de 3 artes", sem unha. */
async function artesFeitas(navegador, url, db) {
  db.prepare("UPDATE producoes SET artes_marcadas = ? WHERE claquete LIKE 'Show da Noite%'").run(JSON.stringify(['AMANHÃ']));
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const show = cardDe(p, 'Show da Noite');
  await show.waitFor();
  assert.equal((await show.locator('.prod-artes').textContent()).trim(), '1 de 3 artes');
  const borda = await show.evaluate((el) => [el, el.querySelector('.prod-artes')].map((x) => getComputedStyle(x).borderLeftWidth));
  assert.ok(borda.every((w) => parseFloat(w) <= 1), `sem faixa na borda esquerda (${borda.join(', ')})`);
  await capturar(p, '17-producoes-artes-feitas');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: a arte feita pela janela do After conta no card ("1 de 3 artes"), sem unha');
}

/**
 * "Mostrar o código das versões" desligado (#152), de outra pessoa (a escolha é de cada um, guardada pela rota das
 * preferências; o menu do perfil é conferido no e2e da Pauta e no da agenda): a tela de produções mostra só o nome, no
 * computador e no celular, sem etiqueta nenhuma.
 */
async function oCodigoDesligado(navegador, url, api) {
  const RUI = 'rui.costa@exemplo.com';
  const r = await fetch(`${api}/eu/preferencias`, { method: 'PUT', headers: { 'cf-access-authenticated-user-email': RUI, 'content-type': 'application/json' }, body: JSON.stringify({ 'versoes.codigo': false }) });
  assert.equal(r.status, 200);
  await fetch(`${api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': RUI } });
  const pasta = process.env.CAPTURAS_SUFIXO || '';
  for (const [onde, opcoes] of [['computador', { viewport: { width: 1920, height: 1000 } }], ['celular', { ...devices['iPhone 13'] }]]) {
    const { ctx, p, erros } = await abrir(navegador, url, opcoes, '#/designer/producoes', { email: RUI });
    await p.locator('.prod-card').first().waitFor();
    await versoesNosCards(p, `desligado, ${onde}`, false);
    if (pasta) {
      mkdirSync(pasta, { recursive: true });
      await p.screenshot({ path: join(pasta, `producoes-desligada-${onde}.png`), fullPage: onde === 'computador' });
    }
    assert.deepEqual(erros, []);
    await ctx.close();
  }
  console.log('ok: "Mostrar o código das versões" desligado: a tela de produções só com o nome, no computador e no celular');
}

/**
 * As versões à mão da claquete sem roteiro no PROMeiro (#154): o apelido é da claquete. "dar as versões" está escondido
 * (#156): a Produção aberta não edita as versões (a claquete sem versão nem mostra a linha delas). As versões guardadas à mão no Show da Noite (pela rota, como
 * antes) continuam no fim do nome, no topo dela e no card, com a origem "à mão" na dica; tiradas, o nome volta sem código.
 */
async function asVersoesAMaoSemRoteiro(navegador, url) {
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const show = cardDe(p, 'Show da Noite');
  await show.waitFor();
  const nome = async () => (await show.locator('.prod-claquete').textContent()).replace(/\s+/g, ' ').trim();
  assert.equal(await nome(), `Show da Noite ${dm(3)} SP`, 'antes: sem código no nome');
  await show.locator('.prod-atracao').click();
  const aberta = p.locator('.pa');
  await aberta.waitFor();
  const apelido = aberta.locator('.apelido-claquete');
  // #156: sem versão, a Produção aberta não mostra a linha das versões nem as dá; o apelido continua
  assert.equal(await apelido.locator('small', { hasText: 'versões' }).count(), 0, 'a Produção aberta sem a seção das versões');
  assert.equal(await aberta.getByRole('button', { name: /Editar as versões|dar as versões/ }).count(), 0, '"dar as versões" escondido');
  // #160: o apelido se dá pelo lápis, ao lado da versão
  assert.ok(await aberta.getByRole('button', { name: /^Dar um apelido/ }).isVisible(), 'o apelido continua na Produção aberta, pelo lápis');
  // as versões à mão guardadas pela rota, como antes (a Produção do card)
  const producao = await show.getAttribute('data-producao');
  const guardar = (versoes) => p.evaluate(async ([id, v]) => (await fetch('/api/apelidos', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ producao: id, versoes: v }) })).status, [producao, versoes]);
  assert.equal(await guardar('PN'), 200, 'gravou pela Produção, sem roteiro');
  await p.keyboard.press('Escape');
  await p.reload();
  await show.locator('.sufixo-versoes').waitFor();
  assert.equal(await nome(), `Show da Noite ${dm(3)} SP (PN)`, 'o card: o código no fim do nome');
  assert.match(await show.locator('.sufixo-versoes').getAttribute('title'), /feitas à mão/, 'o card: a dica diz à mão');
  await show.locator('.prod-atracao').click();
  await aberta.waitFor();
  await aberta.locator('#prod-aberta-titulo .sufixo-versoes').waitFor();
  assert.equal((await aberta.locator('#prod-aberta-titulo').textContent()).replace(/\s+/g, ' ').trim(), `Show da Noite ${dm(3)} SP (PN)`, 'a Produção aberta: o código no fim do nome');
  assert.equal(await aberta.locator('.pa-topo').evaluate((e) => getComputedStyle(e).borderLeftWidth), '0px', 'sem unha');
  await capturar(p, '18-producao-aberta-versoes-a-mao');
  // tiradas: o nome volta sem código
  assert.equal(await guardar(''), 200);
  await p.keyboard.press('Escape');
  await p.reload();
  await show.waitFor();
  assert.equal(await nome(), `Show da Noite ${dm(3)} SP`, 'voltou ao inicial');
  assert.deepEqual(erros, []);
  assert.deepEqual(aoTrello, [], 'nada vai ao Trello');
  await ctx.close();
  console.log('ok: a Produção aberta sem "dar as versões" (#156); as versões à mão da claquete sem roteiro no fim do nome, no topo e no card, com a origem "à mão" (#154)');
}

/**
 * #159: o topo parado entre as telas, para quem tem as três áreas (o seletor aparece) e a aba Filmes: o logo, o seletor e
 * o perfil no mesmo lugar (no máximo 1 px) na fila, nas Produções, nos Filmes e na Pauta, logo depois do clique (no meio
 * da troca) e depois; no computador e no celular (ali, sem os Filmes, que têm a entrada própria das prévias, #80).
 * #168: os caminhos são sempre os mesmos, na mesma ordem, com o da tela atual marcado; os ícones só deslizam enquanto o
 * nome do de antes fecha e o da tela nova abre (no celular, sem o nome, nem isso), e o primeiro fica parado.
 */
async function topoEntreAsTelas(navegador, url) {
  for (const [onde, opcoes] of [['computador', { viewport: { width: 1440, height: 900 } }], ['celular', { ...devices['iPhone 13'] }]]) {
    // com VIDEO=pasta, o vídeo curto da troca de tela no computador (#168): o caminho da tela abrindo e o de antes fechando
    const filme = VIDEO && onde === 'computador' ? { recordVideo: { dir: join(VIDEO, 'topo'), size: { width: 1440, height: 900 } } } : {};
    const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': CHEFE }, ...opcoes, ...filme });
    await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
    await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
    // a aba Filmes ligada (o servidor do teste não tem a leitura) e a lista das prévias vazia
    await ctx.route((u) => u.pathname === '/api/eu', async (r) => r.fulfill({ json: { ...(await (await r.fetch()).json()), filmes: true } }));
    await ctx.route((u) => u.pathname === '/api/filmes/previas', (r) => r.fulfill({ json: [] }));
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e)));
    await p.goto(`${url}#/designer`);
    await p.locator('.barra-topo .topo-filmes').waitFor();
    await p.locator('.barra-topo .seletor-area').waitFor();
    const naFila = await posicoesDoTopo(p);
    const ordem = await caminhosNaOrdem(p);
    const ir = async (caminho, chegou, tela) => {
      await comecarAMedirOsIcones(p);
      await p.locator(`.barra-topo ${caminho}`).click();
      await p.locator(chegou).first().waitFor();
      await topoParado(p, naFila, `${onde}: ${tela}, logo depois do clique`);
      await p.waitForTimeout(700);
      await topoParado(p, naFila, `${onde}: ${tela}`);
      // #168: os mesmos caminhos, na mesma ordem, com o da tela aberto; os ícones deslizam, sem pular
      assert.deepEqual(await caminhosNaOrdem(p), ordem, `${onde}: ${tela}, os caminhos de sempre`);
      assert.equal(await p.locator(`.barra-topo ${caminho}`).getAttribute('aria-current'), 'page', `${onde}: ${tela}, o caminho atual`);
      await iconesSemPulo(p, onde === 'computador', `${onde}: ${tela}`);
    };
    await ir('.topo-producoes', '.prod-pagina', 'Produções');
    // no celular, a aba Filmes é a entrada das prévias (#80), com o topo próprio dela: fica de fora
    if (onde === 'computador') {
      await ir('.topo-filmes', '.pagina.filmes', 'Filmes');
      await capturar(p, '19-topo-filmes');
    }
    await ir('.topo-pauta', '.pagina.pauta', 'Pauta');
    if (onde === 'computador') await capturar(p, '20-topo-pauta');
    await ir('.topo-producoes', '.prod-pagina', 'Produções de novo');
    await ir('.topo-agenda', '.barra-topo .topo-agenda[aria-current="page"]', 'a fila de novo');
    await semRolagemDeLado(p, `${onde}: o topo`);
    assert.deepEqual(erros, []);
    await ctx.close();
  }
  console.log('ok: o topo parado (no máximo 1 px) na fila, nas Produções, nos Filmes e na Pauta, no meio da troca e depois, no computador e no celular; os caminhos de sempre, com o atual aberto e os ícones deslizando (#168)');
}

/** As praças na ordem da tela. */
const ordemNaTela = (p) => p.locator('.prod-bloco').evaluateAll((bs) => bs.map((b) => b.dataset.praca));
/** Arrasta a praça pela faixa do nome com o mouse até o meio do bloco de destino; `antes` olha a tela com ela no ar. */
async function arrastarPraca(p, praca, destino, antes = async () => {}) {
  const faixa = p.locator(`.prod-bloco[data-praca="${praca}"]`).locator('.prod-bloco-topo, .prod-recolhido').first();
  const de = await faixa.boundingBox();
  await p.mouse.move(de.x + 40, de.y + 20);
  await p.mouse.down();
  const para = await p.locator(`.prod-bloco[data-praca="${destino}"]`).boundingBox();
  await p.mouse.move(para.x + 30, de.y + 20, { steps: 12 });
  await antes();
  await p.mouse.up();
}
/** Arrasta a praça pela alça com o dedo (os toques do Chromium): encosta, anda, espera `segurar` ms (perto da borda, a
    área rola sozinha) e solta. */
async function arrastarPracaNoDedo(p, praca, dx, dy, segurar = 0) {
  const cdp = await p.context().newCDPSession(p);
  const alca = await p.locator(`.prod-bloco[data-praca="${praca}"] .prod-alca`).boundingBox();
  const x = alca.x + alca.width / 2;
  const y = alca.y + alca.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 12, y: y + (dy * i) / 12 }] });
    await p.waitForTimeout(16);
  }
  await p.waitForTimeout(segurar);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * #159, arrumar as praças arrastando: no mouse, pela faixa do nome, o SP vai para antes da G5, e a vizinha abre o espaço
 * deslizando; a ordem fica guardada (recarregar, outro aparelho) e a outra pessoa não é afetada; Esc cancela. No dedo
 * (o tablet e o celular), pela alça. Por fim, a ordem de fábrica de volta.
 */
async function arrumarAsPracas(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await ordemNaTela(p), ['G5', 'RJ', 'SP', 'INTER']);
  const guardou = () => p.waitForResponse((r) => new URL(r.url()).pathname === '/api/eu/preferencias' && r.request().method() === 'PUT' && r.ok());
  // a G5 aberta, o RJ fechado: o SP (aberto) vai para o começo
  let gravou = guardou();
  await gravarMovimento(p);
  await arrastarPraca(p, 'SP', 'G5', async () => {
    const noAr = await p.locator('.prod-bloco.levantado').evaluateAll((bs) => bs.map((b) => b.dataset.praca));
    assert.deepEqual(noAr, ['SP'], 'a praça no ar, levantada');
    assert.deepEqual(await ordemNaTela(p), ['SP', 'G5', 'RJ', 'INTER'], 'as outras abrem o lugar dela na hora');
    const houve = await movimento(p);
    assert.ok(houve.includes('deslize bloco G5') && !houve.includes('deslize bloco SP'), `a vizinha desliza para abrir o espaço (${houve})`);
    await capturar(p, '21-producoes-arrumando');
  });
  assert.deepEqual(JSON.parse((await gravou).request().postData()), { 'producoes.ordem': ['SP', 'G5', 'RJ', 'INTER'] });
  assert.equal(await p.locator('.prod-bloco.levantado').count(), 0, 'solta, ela assenta');
  assert.equal(await p.getByRole('dialog').count(), 0, 'o arrasto não abre nada');
  // Esc cancela: a ordem volta
  await arrastarPraca(p, 'G5', 'INTER', async () => {
    assert.notDeepEqual(await ordemNaTela(p), ['SP', 'G5', 'RJ', 'INTER']);
    await p.keyboard.press('Escape');
  });
  await p.waitForTimeout(300);
  assert.deepEqual(await ordemNaTela(p), ['SP', 'G5', 'RJ', 'INTER'], 'o Esc cancela');
  // a praça fechada também se arrasta, e o clique do fim do arrasto não a abre
  gravou = guardou();
  await arrastarPraca(p, 'RJ', 'SP');
  await gravou;
  assert.deepEqual(await ordemNaTela(p), ['RJ', 'SP', 'G5', 'INTER']);
  assert.deepEqual(await recolhidos(p), ['RJ'], 'o arrasto da fechada não a abre');
  await p.reload();
  await p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await ordemNaTela(p), ['RJ', 'SP', 'G5', 'INTER'], 'depois de recarregar, a ordem continua');
  const outra = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, '#/designer/producoes', { email: RUI });
  await outra.p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await ordemNaTela(outra.p), ['G5', 'RJ', 'SP', 'INTER'], 'a outra pessoa, na ordem de fábrica');
  await outra.ctx.close();
  assert.deepEqual(erros, []);
  await ctx.close();

  // no dedo (o tablet, no mesmo aparelho da pessoa): pela alça, o RJ (fechado) para depois do SP
  const tab = await abrir(navegador, url, { ...devices['iPad Mini'], colorScheme: 'dark' });
  await tab.p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await ordemNaTela(tab.p), ['RJ', 'SP', 'G5', 'INTER'], 'no outro aparelho, a mesma ordem');
  await tab.p.locator('.prod-blocos').evaluate((a) => (a.scrollLeft = 0));
  const alca = await tab.p.locator('.prod-bloco[data-praca="RJ"] .prod-alca').boundingBox();
  const sp = await tab.p.locator('.prod-bloco[data-praca="SP"]').boundingBox();
  const g = tab.p.waitForResponse((r) => new URL(r.url()).pathname === '/api/eu/preferencias' && r.request().method() === 'PUT');
  await arrastarPracaNoDedo(tab.p, 'RJ', sp.x + sp.width / 2 + 60 - alca.x, 0);
  assert.deepEqual(JSON.parse((await g).request().postData()), { 'producoes.ordem': ['SP', 'RJ', 'G5', 'INTER'] }, 'no dedo, pela alça');
  assert.deepEqual(await recolhidos(tab.p), ['RJ'], 'o toque do arrasto não abre a fechada');
  await capturar(tab.p, '22-producoes-tablet-arrumada');
  assert.deepEqual(tab.erros, []);
  await tab.ctx.close();
  // no celular, as praças uma embaixo da outra: pela alça, o RJ sobe para antes do SP (a página rola sozinha)
  const cel = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: 'light' });
  await cel.p.locator('.prod-bloco').first().waitFor();
  await quieta(cel.p);
  assert.deepEqual(await ordemNaTela(cel.p), ['SP', 'RJ', 'G5', 'INTER']);
  await cel.p.locator('.prod-bloco[data-praca="RJ"]').evaluate((b) => b.scrollIntoView({ block: 'center' }));
  const rjNoCel = await cel.p.locator('.prod-bloco[data-praca="RJ"] .prod-alca').boundingBox();
  const gc = cel.p.waitForResponse((r) => new URL(r.url()).pathname === '/api/eu/preferencias' && r.request().method() === 'PUT');
  await arrastarPracaNoDedo(cel.p, 'RJ', 0, 30 - rjNoCel.y, 1200);
  await cel.p.waitForTimeout(300);
  assert.deepEqual(JSON.parse((await gc).request().postData()), { 'producoes.ordem': ['RJ', 'SP', 'G5', 'INTER'] }, 'no celular, pela alça, de baixo para cima');
  await semRolagemDeLado(cel.p, 'celular arrumando');
  assert.deepEqual(cel.erros, []);
  await cel.ctx.close();
  // a ordem de fábrica de volta, pela rota
  const volta = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } });
  await volta.p.locator('.prod-bloco').first().waitFor();
  assert.equal(await volta.p.evaluate(async () => (await fetch('/api/eu/preferencias', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 'producoes.ordem': [] }) })).status), 200);
  await volta.ctx.close();
  console.log('ok: arrumar as praças arrastando: pela faixa do nome (mouse) e pela alça (dedo), as vizinhas deslizando, o Esc cancela, a ordem guardada por pessoa');
}

/** #159, as divisórias por dia no Entregue: hoje, ontem e o dia curto ("qua 25/11"), do mais novo para o mais velho. */
async function divisoriasPorDia(navegador, url, db) {
  db.prepare("UPDATE producoes SET etapa = 'entregue', entrega_em = ? WHERE claquete LIKE 'Festa na Praça%'").run(new Date().toISOString());
  db.prepare("UPDATE producoes SET etapa = 'entregue', entrega_em = ? WHERE claquete LIKE 'Show da Noite%'").run(ha(2));
  db.prepare("UPDATE producoes SET etapa = 'entregue', entrega_em = ? WHERE claquete LIKE 'Cozinha de Vó%'").run(ha(1));
  for (const [tema, opcoes] of [['claro', { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' }], ['escuro', { ...devices['iPhone 13'], colorScheme: 'dark' }]]) {
    const { ctx, p, erros } = await abrir(navegador, url, opcoes);
    await p.locator('.prod-bloco').first().waitFor();
    const dias = coluna(p, 'SP', 'entregue').locator('.prod-dia');
    assert.deepEqual(await textos(dias.locator('.prod-dia-nome')), ['hoje', 'ontem', prazo(-2)], `${tema}: as divisórias por dia`);
    assert.deepEqual((await textos(dias.nth(0).locator('.prod-claquete-texto'))).map((t) => t.replace(/ \([A-Z]+\)$/, '')), [`Festa na Praça ${dm(3)} SP`]);
    assert.deepEqual((await textos(dias.nth(1).locator('.prod-claquete-texto'))).map((t) => t.replace(/ \([A-Z]+\)$/, '')), [`Cozinha de Vó ${dm(1)} SP`]);
    assert.deepEqual((await textos(dias.nth(2).locator('.prod-claquete-texto'))).map((t) => t.replace(/ \([A-Z]+\)$/, '')), [`Show da Noite ${dm(3)} SP`]);
    // nada de unha nas divisórias
    const borda = await dias.evaluateAll((ds) => ds.map((d) => parseFloat(getComputedStyle(d).borderLeftWidth)));
    assert.ok(borda.every((w) => w <= 1));
    await semRolagemDeLado(p, `${tema}: as divisórias`);
    await capturar(p, `23-producoes-divisorias-${tema}`);
    assert.deepEqual(erros, []);
    await ctx.close();
  }
  console.log('ok: o Entregue com as divisórias por dia (hoje, ontem, o dia curto), no computador e no celular');
}

/** O espaço pega o card e a busca no histórico (#161). */
async function espacoEBusca(navegador, url, db, api, chamadasAoTrello) {
  // o palco: a Novela na Entrada da G5, sem ninguém
  db.prepare("UPDATE producoes SET etapa = 'entrada', designers = '[]' WHERE claquete LIKE 'Novela Sinfonia%'").run();
  await fetch(`${api}/eu/preferencias`, { method: 'PUT', headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/json' }, body: JSON.stringify({ 'producoes.recolhidos': [], 'producoes.ordem': [] }) });
  const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await p.locator('.prod-bloco').first().waitFor();
  await quieta(p);
  chamadasAoTrello.splice(0);
  const novela = cardDe(p, 'Novela Sinfonia');
  const lupa = p.getByRole('searchbox', { name: 'Buscar nas produções' });

  // com o foco no campo da busca, o espaço é do campo: nada muda
  await lupa.focus();
  await novela.locator('.prod-atracao').hover();
  await p.keyboard.press(' ');
  await p.waitForTimeout(300);
  assert.equal(await coluna(p, 'G5', 'entrada').locator('.prod-card', { hasText: 'Novela Sinfonia' }).count(), 1, 'no campo de texto, o espaço não pega');
  assert.equal(await p.locator('.desfazer').count(), 0);
  assert.deepEqual(chamadasAoTrello, []);
  await lupa.press('Escape');

  // o espaço sobre o card: o "Peguei", com o deslize para a Produzindo e a caixinha de desfazer
  await novela.locator('.prod-atracao').hover();
  await gravarMovimento(p);
  await p.keyboard.press(' ');
  await coluna(p, 'G5', 'produzindo').locator('.prod-card', { hasText: 'Novela Sinfonia' }).waitFor();
  assert.ok((await movimento(p)).some((m) => m.startsWith('deslize card Novela Sinfonia')), 'o card pego pelo espaço desliza para a Produzindo');
  const caixinha = p.locator('.desfazer');
  await caixinha.waitFor();
  assert.match(await caixinha.textContent(), /Você pegou Novela Sinfonia/);
  assert.equal(await designersDe(cardDe(p, 'Novela Sinfonia')), 'Lia Moraes');
  await p.waitForFunction(() => !document.querySelector('.prod-mudar:disabled'));
  assert.deepEqual(chamadasAoTrello.splice(0), [`POST /cards/${card(4)}/idMembers ?value=membroLia`]);
  assert.equal(await p.locator('[role="dialog"]').count(), 0, 'o espaço sobre o card não abre a Produção');
  await capturar(p, '24-producoes-espaco-pegou');
  // de novo, no card que já é dela: nada
  await quieta(p);
  await cardDe(p, 'Novela Sinfonia').locator('.prod-atracao').hover();
  await p.keyboard.press(' ');
  await p.waitForTimeout(400);
  assert.equal(await coluna(p, 'G5', 'produzindo').locator('.prod-card', { hasText: 'Novela Sinfonia' }).count(), 1);
  assert.deepEqual(chamadasAoTrello, [], 'o espaço no card que já é da pessoa não faz nada');
  assert.equal(await p.evaluate(() => scrollY + (document.querySelector('.prod-blocos')?.scrollTop ?? 0)), 0, 'o espaço não rola a página');
  // o Desfazer da caixinha, como no Peguei
  await caixinha.getByRole('button', { name: 'Desfazer' }).click();
  await coluna(p, 'G5', 'entrada').locator('.prod-card', { hasText: 'Novela Sinfonia' }).waitFor();
  await p.waitForFunction(() => !document.querySelector('.prod-mudar:disabled'));
  assert.deepEqual(chamadasAoTrello.splice(0), [`DELETE /cards/${card(4)}/idMembers/membroLia`]);
  console.log('ok: o espaço sobre o card pega (o deslize, a caixinha, o Desfazer); no card que já é da pessoa e no campo de texto, nada');

  // a busca: o entregue de 5 dias atrás, que os blocos não mostram, sem caixa nem acento
  assert.equal(await cardDe(p, 'Jogo Antigo').count(), 0, 'o Jogo Antigo não está nos blocos');
  await p.keyboard.press('/');
  await p.keyboard.type('JOGO antígo');
  const busca = p.locator('.prod-busca');
  const achados = busca.locator('.prod-achado');
  await achados.first().waitFor();
  await p.waitForFunction(() => document.querySelectorAll('.prod-achado').length === 1 && !document.querySelector('.prod-busca.buscando'));
  assert.equal(await p.locator('.prod-blocos').isVisible(), false, 'a lista fica no lugar dos blocos');
  assert.equal(await achados.evaluate((l) => getComputedStyle(l).animationName), 'surgir-achado', 'o achado chega subindo');
  const jogo = achados.first();
  assert.match(await jogo.locator('.prod-achado-claquete').textContent(), new RegExp(`^Jogo Antigo ${dm(-4)}`));
  assert.equal((await jogo.locator('.prod-achado-etapa').textContent()).trim(), 'Entregue');
  assert.equal(await jogo.locator('.prod-achado-quando').textContent(), `entregue ${prazo(-5)}`);
  assert.equal(await jogo.locator('.prod-achado-designers').textContent(), 'Enzo Prado');
  assert.match(await busca.locator('.prod-busca-topo h2').textContent(), /1 produção com/);
  await semRolagemDeLado(p, 'a busca');
  await capturar(p, '25-producoes-busca');
  // pela pessoa e pela atração
  await lupa.fill('dora');
  await p.waitForFunction(() => [...document.querySelectorAll('.prod-achado-claquete')].some((e) => e.textContent.startsWith('Jogo Final')));
  await lupa.fill('ENZO');
  await p.waitForFunction(() => [...document.querySelectorAll('.prod-achado-claquete')].map((e) => e.textContent.slice(0, 11)).join('|') === 'Jogo Antigo');
  await lupa.fill('festa na praca');
  await p.waitForFunction(() => [...document.querySelectorAll('.prod-achado-claquete')].map((e) => e.textContent).join('|').startsWith('Festa na Praça'));
  // um clique abre a Produção; o Esc fecha, e o foco volta para a linha
  await lupa.fill('jogo antigo');
  await p.waitForFunction(() => document.querySelectorAll('.prod-achado').length === 1 && document.querySelector('.prod-achado-claquete')?.textContent.startsWith('Jogo Antigo'));
  await quieta(p);
  await achados.first().locator('button').click();
  const dialogo = p.locator('[role="dialog"]');
  await dialogo.waitFor();
  assert.match(await dialogo.textContent(), /Jogo Antigo/);
  await capturar(p, '26-producoes-busca-aberta');
  await p.keyboard.press('Escape');
  await dialogo.waitFor({ state: 'detached' });
  assert.equal(await busca.count(), 1, 'o Esc da Produção aberta só fecha ela');
  await p.waitForFunction(() => document.activeElement?.closest('.prod-achado'));
  // o Esc fora do campo limpa a busca: a lista sai esmaecendo, e os blocos voltam
  await p.keyboard.press('Escape');
  await p.locator('.prod-busca.saindo').waitFor();
  await busca.waitFor({ state: 'detached' });
  await p.locator('.prod-blocos.voltando').waitFor();
  assert.equal(await lupa.inputValue(), '');
  assert.ok(await p.locator('.prod-blocos').isVisible());
  assert.deepEqual(aoTrello, [], 'nenhum pedido ao Trello pelo navegador');
  assert.deepEqual(erros, []);
  await ctx.close();

  // no celular: a lupa toma a linha do título, e a lista cabe sem rolar para o lado
  const cel = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await cel.p.locator('.prod-bloco').first().waitFor();
  await cel.p.locator('.prod-cabeca .busca.lupa').click();
  await cel.p.keyboard.type('jogo');
  await cel.p.locator('.prod-achado').first().waitFor();
  await cel.p.waitForFunction(() => !document.querySelector('.prod-busca.buscando'));
  assert.ok((await textos(cel.p.locator('.prod-achado-claquete'))).some((t) => t.startsWith('Jogo Antigo')));
  const borda = await cel.p.locator('.prod-achado-abrir').evaluateAll((bs) => bs.map((b) => parseFloat(getComputedStyle(b).borderLeftWidth)));
  assert.ok(borda.every((w) => w <= 1), 'nada de unha nos achados');
  await semRolagemDeLado(cel.p, 'celular: a busca');
  await capturar(cel.p, '27-producoes-busca-celular');
  assert.deepEqual(cel.erros, []);
  await cel.ctx.close();
  console.log('ok: a busca: pela claquete, pela pessoa e pela atração, sem caixa nem acento, com o entregue antigo e o dia da entrega; chega e sai animando; o clique abre a Produção; no celular, cabe');
}

/**
 * O vídeo do movimento (#159), com VIDEO=pasta: a primeira carga (as colunas em cascata), o hover do card, o Peguei (a
 * Produzindo se abre, o card desliza, a contagem pula, a caixinha sobe), o arrasto (a Produzindo se abre com o card no
 * ar), fechar e abrir praça (a quarta fecha a mais antiga, o nome gira), arrumar as praças; e o mesmo com
 * prefers-reduced-motion (só esmaecer). Cada vídeo vai como .webm para a pasta.
 */
async function filmar(navegador, url, db, api) {
  if (!VIDEO) return;
  mkdirSync(VIDEO, { recursive: true });
  const { renameSync } = require('node:fs');
  // um palco arrumado: a Festa e o Show na Entrada do SP, a Novela na da G5, a ordem de fábrica, nada recolhido
  db.prepare("UPDATE producoes SET etapa = 'entrada', designers = '[]' WHERE claquete LIKE 'Festa na Praça%' OR claquete LIKE 'Show da Noite%' OR claquete LIKE 'Novela Sinfonia%'").run();
  for (const [nome, movimento] of [['movimento', 'no-preference'], ['movimento-reduzido', 'reduce']]) {
    const ctx = await navegador.newContext({
      extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA },
      viewport: { width: 1440, height: 860 },
      recordVideo: { dir: VIDEO, size: { width: 1440, height: 860 } },
      reducedMotion: movimento,
      colorScheme: 'light',
    });
    await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(LIA), url }]);
    await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
    await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
    await fetch(`${api}/eu/preferencias`, { method: 'PUT', headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/json' }, body: JSON.stringify({ 'producoes.recolhidos': [], 'producoes.ordem': [] }) });
    const p = await ctx.newPage();
    await p.goto(`${url}#/designer`);
    await p.locator('.barra-topo .topo-producoes').waitFor();
    await p.waitForTimeout(700);
    // a troca de tela (o topo parado) e a primeira carga
    await p.locator('.barra-topo .topo-producoes').click();
    await p.locator('.prod-bloco').first().waitFor();
    await p.waitForTimeout(1100);
    // o hover dos cards
    for (const c of ['Festa na Praça', 'Show da Noite', 'Cozinha de Vó']) {
      await cardDe(p, c).locator('.prod-atracao').hover();
      await p.waitForTimeout(450);
    }
    // o Peguei: a Produzindo se abre, o card desliza, a contagem pula, a caixinha sobe
    await cardDe(p, 'Festa na Praça').locator('.prod-mudar').click();
    await p.waitForTimeout(1400);
    // desfazer: o card volta deslizando, e a Produzindo se recolhe
    await p.locator('.desfazer').getByRole('button', { name: 'Desfazer' }).click();
    await p.waitForTimeout(1300);
    // o arrasto: a Produzindo se abre com o card no ar; o card cai nela
    const novela = cardDe(p, 'Novela Sinfonia');
    const pega = await novela.locator('.prod-claquete').boundingBox();
    await novela.locator('.prod-claquete').hover();
    await p.mouse.down();
    await p.mouse.move(pega.x + pega.width / 2 + 10, pega.y + pega.height / 2 + 4, { steps: 3 });
    await p.waitForTimeout(450);
    const caixa = await coluna(p, 'G5', 'produzindo').boundingBox();
    await p.mouse.move(caixa.x + caixa.width / 2, caixa.y + 90, { steps: 25 });
    await p.waitForTimeout(500);
    await p.mouse.up();
    await p.waitForTimeout(1300);
    // abrir a quarta praça: a mais antiga fecha, deslizando, e o nome gira para a vertical
    await p.locator('.prod-bloco[data-praca="INTER"]').click();
    await p.waitForTimeout(1300);
    await p.getByRole('button', { name: 'Recolher o bloco RJ' }).click();
    await p.waitForTimeout(1100);
    await p.locator('.prod-bloco[data-praca="G5"]').click();
    await p.waitForTimeout(1300);
    // arrumar as praças: o SP vai para o começo, as vizinhas deslizam
    const faixa = await p.locator('.prod-bloco[data-praca="SP"] .prod-bloco-topo').boundingBox();
    await p.mouse.move(faixa.x + 60, faixa.y + 22);
    await p.mouse.down();
    await p.mouse.move(40, faixa.y + 22, { steps: 40 });
    await p.waitForTimeout(400);
    await p.mouse.up();
    await p.waitForTimeout(1200);
    const video = p.video();
    await ctx.close();
    renameSync(await video.path(), join(VIDEO, `producoes-${nome}.webm`));
  }
  console.log(`ok: o vídeo do movimento em ${VIDEO}`);
}

/**
 * #160, o card aberto: a Produção abre no centro (720 px, sobre o véu), crescendo do card clicado, e volta para ele ao
 * fechar. A versão V1 fica no detalhe (não no título), com o lápis do apelido; "dar as versões" escondido. A linha do
 * tempo começa fechada e abre e fecha deslizando. A Lia muda a atração (a busca do cadastro), o prazo e os designers
 * (atribui o Caio e tira de novo): o card da tela muda junto, o Trello recebe a escrita (o due, o membro) e a linha do
 * tempo ganha o evento. As artes no esquema da janela do After: a bolinha laranja numerada; marcar risca a arte (o
 * risco se escreve) e marca o item no checklist do card; apagar recolhe a linha e tira o item; "Desfazer" traz a linha e
 * o item de volta; "+ arte" põe uma no fim. O fogo da Festa (o Roteiro ligado) sobe um nível; a Novela, sem Roteiro,
 * tem o fogo em todas as artes, também na incluída, e o clique sobe o nível (#174). Nada de unha, nada de
 * check verde. Claro e escuro no computador; claro e escuro no celular, a tela toda.
 */
async function oCardAberto(navegador, url, chamadasAoTrello, db) {
  // o palco: a Festa e a Novela com as artes de sempre, sem prazo mudado, sem atração escolhida, sem designer
  db.prepare("UPDATE producoes SET etapa = 'produzindo', designers = '[]', artes_marcadas = '[]', artes_apagadas = '[]', artes_novas = '[]', fogo_das_artes = '{}', atracao = NULL, prazo_em = NULL WHERE claquete LIKE 'Festa na Praça%' OR claquete LIKE 'Novela Sinfonia%'").run();
  for (const tema of ['light', 'dark']) {
    const nome = tema === 'dark' ? 'escuro' : 'claro';
    const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
    const festa = cardDe(p, 'Festa na Praça');
    await festa.waitFor();
    await calmo(p);
    chamadasAoTrello.splice(0);
    const doCard = await festa.boundingBox();
    // o painel cresce do card (FLIP): a animação dele começa no tamanho do card e termina no dele
    await p.evaluate(() => {
      window.__flip = [];
      const animar = Element.prototype.animate;
      Element.prototype.animate = function (quadros, op) {
        if (this.classList.contains('card-aberto')) window.__flip.push(quadros.map((q) => q.transform ?? ''));
        return animar.call(this, quadros, op);
      };
    });
    await festa.locator('.prod-atracao').click();
    const painel = p.getByRole('dialog');
    await painel.waitFor();
    // (no modo estrito do React o efeito roda duas vezes: vale a última animação, a que fica)
    const flip = await p.evaluate(() => window.__flip);
    const abriu = flip.length;
    const escala = Number(/scale\(([\d.]+)/.exec(flip.at(-1)?.[0] ?? '')?.[1]);
    assert.ok(Math.abs(escala - doCard.width / 720) < 0.02 && flip.at(-1)[1] === 'none', `o painel nasce do card (${JSON.stringify(flip)}; o card tem ${doCard.width}px)`);
    await painel.locator('.pa-arte').first().waitFor();
    await painel.evaluate((e) => Promise.all(e.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).map((a) => a.finished)));
    const caixa = await painel.boundingBox();
    assert.ok(Math.abs(caixa.width - 720) <= 1 && Math.abs(caixa.x + caixa.width / 2 - 720) <= 1, `${nome}: o painel de 720 px no centro (${JSON.stringify(caixa)})`);
    // a versão no detalhe, não no título; o lápis do apelido; "dar as versões" escondido
    assert.equal((await painel.locator('.pa-versao').textContent()).trim(), 'V1');
    assert.ok(!(await painel.locator('h2').textContent()).includes('V1'), 'a versão não vai para o título');
    assert.equal(await painel.getByRole('button', { name: /dar as versões/ }).count(), 0, '"dar as versões" escondido');
    await painel.getByRole('button', { name: /^Dar um apelido/ }).click();
    await painel.getByRole('textbox', { name: 'Apelido da claquete' }).waitFor();
    await painel.getByRole('button', { name: 'cancelar' }).click();
    // as artes: a bolinha laranja numerada e o fogo (o Roteiro ligado)
    assert.deepEqual(await textos(painel.locator('.pa-arte .num')), ['1']);
    const bolinha = await painel.locator('.pa-arte .b').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    const laranja = await p.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--ultra)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    assert.equal(bolinha, laranja, 'a bolinha é laranja');
    await painel.locator('.pa-arte .cx').first().waitFor();
    // a linha do tempo começa fechada
    assert.equal(await painel.locator('.pa-tempo-lista, .pa-tempo .pa-nada').count(), 0, 'a linha do tempo começa fechada');
    if (tema === 'light') {
      // a atração: a busca do cadastro
      await painel.getByRole('button', { name: 'Atração' }).click();
      await painel.getByRole('textbox', { name: 'Buscar atração' }).fill('dom');
      await painel.getByRole('option', { name: 'Domingo Show' }).click();
      await painel.locator('.pa-valor', { hasText: 'Domingo Show' }).waitFor();
      await festa.locator('.prod-atracao', { hasText: 'Domingo Show' }).waitFor();
      // o prazo: o dia de daqui a 5 dias (pulando o domingo)
      await painel.getByRole('button', { name: 'Prazo' }).click();
      const dia = painel.locator('.pa-datas .menu-item').nth(4);
      const rotulo = (await dia.textContent()).replace(/^\D+/, '');
      await dia.click();
      await painel.locator('.pa-valor', { hasText: rotulo }).waitFor();
      await festa.locator('.prod-prazo', { hasText: rotulo }).waitFor();
      // o designer: atribuir o Caio e tirar de novo
      await painel.getByRole('button', { name: 'Atribuir um designer' }).click();
      await painel.locator('.pa-menu .menu-item', { hasText: 'Caio Prates' }).click();
      await painel.locator('.pa-chip', { hasText: 'Caio' }).waitFor();
      await p.waitForTimeout(350);
      await capturar(p, `20-card-aberto-${nome}-campos`);
      await painel.getByRole('button', { name: 'Tirar Caio Prates' }).click();
      await painel.locator('.pa-chip', { hasText: 'Caio' }).waitFor({ state: 'detached' });
      // o fogo sobe um nível
      await painel.locator('.pa-arte .cx').first().click();
      await painel.locator('.pa-arte .cx .fogo.n2').first().waitFor();
      // a linha do tempo abre (deslizando) com o que a Lia fez
      await painel.getByRole('button', { name: 'linha do tempo' }).click();
      const tempo = painel.locator('.pa-tempo > .vaga-y');
      assert.ok(await tempo.evaluate((e) => e.classList.contains('entrando')), 'a linha do tempo abre deslizando');
      const frases = await textos(painel.locator('.pa-tempo-lista li span'));
      for (const f of ['Lia Moraes ligou a atração Domingo Show', 'Lia Moraes atribuiu Caio Prates', 'Lia Moraes tirou Caio Prates']) assert.ok(frases.includes(f), `a linha do tempo diz "${f}" (${frases.join(' · ')})`);
      assert.ok(frases.some((f) => f.startsWith('Lia Moraes mudou o prazo para ')) && frases.some((f) => /^Lia Moraes mudou o fogo de HOJE para média$/.test(f)), `o prazo e o fogo na linha do tempo (${frases.join(' · ')})`);
      await p.waitForTimeout(350);
      await capturar(p, `21-card-aberto-${nome}-linha-do-tempo`);
      await painel.getByRole('button', { name: 'linha do tempo' }).click();
      await painel.locator('.pa-tempo-lista').waitFor({ state: 'detached' });
      const escritas = chamadasAoTrello.filter((c) => !c.startsWith('GET'));
      assert.ok(escritas.some((c) => c.startsWith(`PUT /cards/${card(2)} ?due=`) && c.endsWith('T21:00:00.000Z')), `o prazo vai ao Trello (${escritas.join(' | ')})`);
      assert.ok(escritas.includes(`POST /cards/${card(2)}/idMembers ?value=membroCaio`) && escritas.includes(`DELETE /cards/${card(2)}/idMembers/membroCaio`), `o Caio entra e sai do card (${escritas.join(' | ')})`);
    }
    await painel.getByRole('button', { name: 'Fechar a Produção' }).click();
    // volta para o card: a animação ao contrário, que termina no tamanho do card
    await p.waitForFunction((n) => window.__flip.length > n, abriu);
    const volta = await p.evaluate(() => window.__flip.at(-1));
    assert.ok(volta[0] === 'none' && /scale/.test(volta[1]), `o painel volta para o card (${JSON.stringify(volta)})`);
    await painel.waitFor({ state: 'detached' });
    await p.waitForFunction(() => document.activeElement?.matches('.prod-card') && document.activeElement.textContent.includes('Festa na Praça'));

    // a Novela: marcar, apagar, desfazer e "+ arte", com o checklist do card espelhando
    chamadasAoTrello.splice(0);
    const novela = cardDe(p, 'Novela Sinfonia');
    await novela.locator('.prod-atracao').click();
    await painel.locator('.pa-arte').first().waitFor();
    assert.deepEqual(await textos(painel.locator('.pa-arte .txt')), tema === 'light' ? ['HOJE', 'AMANHÃ'] : ['HOJE', 'AMANHÃ', 'VINHETA 5"']);
    // #174: a Novela não tem Roteiro, e toda arte tem o fogo do mesmo jeito (começa na vela)
    const fogos = () => painel.locator('.pa-arte').evaluateAll((l) => l.map((e) => e.querySelector('.cx .fogo')?.getAttribute('class') ?? 'sem fogo'));
    assert.deepEqual(await fogos(), tema === 'light' ? ['fogo n1', 'fogo n1'] : ['fogo n1', 'fogo n2', 'fogo n1'], `${nome}: o fogo em todas as artes da Novela, sem Roteiro`);
    if (tema === 'light') {
      await painel.locator('.pa-arte', { hasText: 'HOJE' }).locator('.arte-linha').click();
      await painel.locator('.pa-arte.marcada .riscado-mao').waitFor();
      assert.equal((await painel.locator('.pa-parte h3 small').textContent()).trim(), '1 de 2 feitas');
      await novela.locator('.prod-artes', { hasText: '1 de 2 artes' }).waitFor();
      // apagar: a linha recolhe; o "Desfazer" traz de volta
      await painel.locator('.pa-arte', { hasText: 'AMANHÃ' }).hover();
      await painel.getByRole('button', { name: 'Apagar AMANHÃ' }).click();
      await painel.locator('.vaga-y.saindo .pa-arte', { hasText: 'AMANHÃ' }).waitFor();
      await painel.locator('.pa-arte', { hasText: 'AMANHÃ' }).waitFor({ state: 'detached' });
      await p.locator('.desfazer', { hasText: 'Apagou AMANHÃ' }).waitFor();
      // #171: a caixinha do apagar é a mesma das outras, no mesmo lugar: embaixo, no meio da janela, fora do card
      const lugar = await p.locator('.desfazer').evaluate((c) => ({ dentro: !!c.closest('[role="dialog"]'), meio: Math.abs(c.getBoundingClientRect().left + c.getBoundingClientRect().width / 2 - innerWidth / 2), baixo: innerHeight - c.getBoundingClientRect().bottom }));
      assert.ok(!lugar.dentro && lugar.meio < 2 && lugar.baixo >= 14 && lugar.baixo <= 26, `a caixinha do apagar no lugar das outras (${JSON.stringify(lugar)})`);
      await capturar(p, `22-card-aberto-${nome}-apagou`);
      await p.locator('.desfazer').getByRole('button', { name: 'Desfazer' }).click();
      await painel.locator('.vaga-y.entrando .pa-arte', { hasText: 'AMANHÃ' }).waitFor();
      await novela.locator('.prod-artes', { hasText: '1 de 2 artes' }).waitFor();
      // "+ arte"
      await painel.getByRole('button', { name: '+ arte' }).click();
      await painel.getByRole('textbox', { name: 'O nome da arte nova' }).fill('vinheta 5"');
      await p.keyboard.press('Enter');
      await painel.locator('.pa-arte', { hasText: 'VINHETA 5"' }).waitFor();
      await novela.locator('.prod-artes', { hasText: '1 de 3 artes' }).waitFor();
      // #174: a arte nova também tem fogo; o clique no da AMANHÃ sobe um nível, guardado na Produção
      await painel.locator('.pa-arte', { hasText: 'VINHETA 5"' }).locator('.cx .fogo.n1').waitFor();
      await painel.locator('.pa-arte', { hasText: 'AMANHÃ' }).locator('.cx').click();
      await painel.locator('.pa-arte', { hasText: 'AMANHÃ' }).locator('.cx .fogo.n2').waitFor();
      await p.waitForTimeout(300);
      assert.deepEqual(JSON.parse(db.prepare("SELECT fogo_das_artes FROM producoes WHERE claquete LIKE 'Novela Sinfonia%'").get().fogo_das_artes), { AMANHA: 2 }, 'o fogo da Novela fica na Produção');
      const escritas = chamadasAoTrello.filter((c) => !c.startsWith('GET'));
      assert.deepEqual(
        escritas.map((c) => c.replace(/item\d+/, 'item')),
        [`PUT /cards/${card(4)}/checkItem/item ?state=complete`, `DELETE /checklists/lista-${card(4)}/checkItems/item`, `POST /checklists/lista-${card(4)}/checkItems ?name=AMANHÃ&pos=bottom`, `POST /checklists/lista-${card(4)}/checkItems ?name=VINHETA 5"&pos=bottom`],
        'o checklist do card espelha: marcar, apagar, desfazer e incluir',
      );
      assert.ok(chamadasAoTrello.filter((c) => c.startsWith('GET')).every((c) => new URL(c.slice(4)).pathname === `/1/cards/${card(4)}/checklists`), 'a única leitura é o checklist do card que muda');
    }
    await capturar(p, `23-card-aberto-${nome}-artes`);
    // nada de unha nem de check verde
    const unhas = await painel.evaluate((raiz) => [...raiz.querySelectorAll('*')].filter((e) => parseFloat(getComputedStyle(e).borderLeftWidth) > 1 || /inset \d{2,}px 0/.test(getComputedStyle(e).boxShadow)).map((e) => e.className));
    assert.deepEqual(unhas, [], 'nada de unha');
    const verdes = await painel.evaluate((raiz) =>
      [...raiz.querySelectorAll('*')].filter((e) => {
        const [r, g, b] = (getComputedStyle(e).backgroundColor.match(/\d+(\.\d+)?/g) ?? [0, 0, 0]).map(Number);
        const [cr, cg, cb] = (getComputedStyle(e).color.match(/\d+(\.\d+)?/g) ?? [0, 0, 0]).map(Number);
        return (g > r + 40 && g > b + 40) || (e.closest('.b') && cg > cr + 40 && cg > cb + 40);
      }).map((e) => e.className),
    );
    assert.deepEqual(verdes, [], 'nada de check verde');
    await p.keyboard.press('Escape');
    await painel.waitFor({ state: 'detached' });
    await semRolagemDeLado(p, `card aberto ${nome}`);
    assert.deepEqual(aoTrello, [], 'nenhum pedido ao Trello pelo navegador');
    assert.deepEqual(erros, []);
    await ctx.close();
  }
  // o celular: a tela toda, claro e escuro
  for (const tema of ['light', 'dark']) {
    const nome = tema === 'dark' ? 'escuro' : 'claro';
    const cel = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: tema });
    await cardDe(cel.p, 'Festa na Praça').locator('.prod-claquete').tap();
    const painel = cel.p.getByRole('dialog');
    await painel.locator('.pa-arte').first().waitFor();
    await painel.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
    const caixa = await painel.boundingBox();
    assert.ok(caixa.x <= 1 && Math.abs(caixa.width - 390) <= 1, `celular ${nome}: a tela toda (${JSON.stringify(caixa)})`);
    await semRolagemDeLado(cel.p, `celular ${nome} com o card aberto`);
    const fechar = await painel.getByRole('button', { name: 'Fechar a Produção' }).boundingBox();
    assert.ok(fechar.width >= 44 && fechar.height >= 44, 'o X no tamanho do dedo');
    await painel.getByRole('button', { name: 'linha do tempo' }).tap();
    await painel.locator('.pa-tempo-lista li').first().waitFor();
    await cel.p.waitForTimeout(400);
    if (CAPTURAS) await painel.screenshot({ path: join(CAPTURAS, `24-card-aberto-celular-${nome}.png`) });
    await painel.getByRole('button', { name: 'Fechar a Produção' }).tap();
    await painel.waitFor({ state: 'detached' });
    assert.deepEqual(cel.erros, []);
    await cel.ctx.close();
  }
  console.log('ok: o card aberto (#160): no centro, crescendo do card e voltando; a versão no detalhe; a linha do tempo fechada; atração, prazo e designers vão ao Trello e à linha do tempo; marcar, apagar, desfazer e "+ arte" no checklist; o fogo; sem unha e sem verde; no celular, a tela toda');
}

/** #160: o vídeo do card aberto (VIDEO=pasta): abrir crescendo do card, a linha do tempo abrindo, riscar, apagar e
    desfazer, o fogo, e a volta para o card. */
async function filmarOCardAberto(navegador, url, db) {
  if (!VIDEO) return;
  mkdirSync(VIDEO, { recursive: true });
  const { renameSync } = require('node:fs');
  db.prepare("UPDATE producoes SET artes_marcadas = '[]', artes_apagadas = '[]', artes_novas = '[]' WHERE claquete LIKE 'Novela Sinfonia%'").run();
  const ctx = await navegador.newContext({
    extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA },
    viewport: { width: 1440, height: 860 },
    recordVideo: { dir: VIDEO, size: { width: 1440, height: 860 } },
    colorScheme: 'light',
  });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(LIA), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  await p.goto(`${url}#/designer/producoes`);
  await cardDe(p, 'Novela Sinfonia').waitFor();
  await p.waitForTimeout(1200);
  const painel = p.getByRole('dialog');
  // abrir a Festa (cresce do card), o fogo, a linha do tempo, fechar (volta para o card)
  await cardDe(p, 'Festa na Praça').locator('.prod-atracao').click();
  await p.waitForTimeout(900);
  await painel.locator('.pa-arte .cx').first().click();
  await p.waitForTimeout(900);
  await painel.getByRole('button', { name: 'linha do tempo' }).click();
  await p.waitForTimeout(1100);
  await painel.getByRole('button', { name: 'linha do tempo' }).click();
  await p.waitForTimeout(900);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(900);
  // a Novela: riscar, apagar, desfazer, voltar a fazer
  await cardDe(p, 'Novela Sinfonia').locator('.prod-atracao').click();
  await p.waitForTimeout(900);
  await painel.locator('.pa-arte', { hasText: 'AMANHÃ' }).locator('.arte-linha').click();
  await p.waitForTimeout(1200);
  await painel.locator('.pa-arte', { hasText: 'HOJE' }).hover();
  await p.waitForTimeout(300);
  await painel.getByRole('button', { name: 'Apagar HOJE' }).click();
  await p.waitForTimeout(1200);
  await p.locator('.desfazer').getByRole('button', { name: 'Desfazer' }).click();
  await p.waitForTimeout(1200);
  await painel.locator('.pa-arte', { hasText: 'AMANHÃ' }).locator('.arte-linha').click();
  await p.waitForTimeout(900);
  await painel.getByRole('button', { name: 'Prazo' }).click();
  await p.waitForTimeout(700);
  await painel.locator('.pa-datas .menu-item').nth(3).click();
  await p.waitForTimeout(900);
  await p.mouse.click(60, 600);
  await p.waitForTimeout(1200);
  const video = p.video();
  await ctx.close();
  renameSync(await video.path(), join(VIDEO, 'card-aberto.webm'));
  console.log(`ok: o vídeo do card aberto em ${VIDEO}`);
}

/**
 * #167: a Produzindo vazia só fica fina quando falta largura na praça. A 1920 px com duas praças abertas (o RJ e o SP),
 * ela é larga, com o "nada aqui" à mão; a 1280 px com três, fina; e a troca desliza quando a janela muda de tamanho.
 */
async function produzindoComEspaco(navegador, url, db, api) {
  db.prepare("UPDATE producoes SET etapa = 'entrada', designers = '[]' WHERE claquete LIKE 'Festa na Praça%' OR claquete LIKE 'Show da Noite%'").run();
  const preferir = (recolhidos) => fetch(`${api}/eu/preferencias`, { method: 'PUT', headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/json' }, body: JSON.stringify({ 'producoes.recolhidos': recolhidos, 'producoes.ordem': [] }) });
  for (const tema of ['light', 'dark']) {
    const nome = tema === 'dark' ? 'escuro' : 'claro';
    await preferir(['G5', 'INTER']);
    const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1920, height: 1000 }, colorScheme: tema });
    await p.locator('.prod-bloco').first().waitFor();
    await quieta(p);
    const largura = (praca) => coluna(p, praca, 'produzindo').evaluate((c) => ({ w: c.getBoundingClientRect().width, fina: c.classList.contains('fina'), nada: c.querySelector('.prod-nada') ? getComputedStyle(c.querySelector('.prod-nada')).display : '' }));
    const larga = await largura('RJ');
    assert.ok(!larga.fina && larga.w > 150 && larga.nada !== 'none', `1920 px, duas praças: a Produzindo vazia larga, com o "nada aqui" (${JSON.stringify(larga)})`);
    await capturar(p, `30-producoes-1920-duas-pracas-${nome}`);
    // a janela encolhe: a Produzindo vazia fica fina, deslizando
    await gravarMovimento(p);
    await p.setViewportSize({ width: 1100, height: 1000 });
    await p.waitForFunction(() => document.querySelector('.prod-bloco[data-praca="RJ"] .prod-coluna[data-coluna="produzindo"]').classList.contains('fina'));
    assert.ok((await movimento(p)).includes('transição grid-template-columns prod-colunas fina'), 'a troca de larga para fina desliza');
    await ctx.close();
    assert.deepEqual(erros, []);
    await preferir(['INTER']);
    const tres = await abrir(navegador, url, { viewport: { width: 1280, height: 1000 }, colorScheme: tema });
    await tres.p.locator('.prod-bloco').first().waitFor();
    await quieta(tres.p);
    const fina = await coluna(tres.p, 'RJ', 'produzindo').evaluate((c) => ({ w: c.getBoundingClientRect().width, fina: c.classList.contains('fina') }));
    assert.ok(fina.fina && fina.w < 50, `1280 px, três praças: a Produzindo vazia fina (${JSON.stringify(fina)})`);
    await capturar(tres.p, `31-producoes-1280-tres-pracas-${nome}`);
    assert.deepEqual(tres.erros, []);
    await tres.ctx.close();
  }
  await preferir([]);
  console.log('ok: a Produzindo vazia só fica fina quando falta largura (1920 px com duas praças: larga; 1280 px com três: fina), deslizando');
}

/** #167: o vídeo do acabamento (VIDEO=pasta): o hover dos cards (só a borda), a área rolando (o "últimos dias" some,
    o cabeçalho baixa, a fenda aparece) e voltando, e a janela que alarga (a Produzindo vazia se abre). */
async function filmarOAcabamento(navegador, url, api) {
  if (!VIDEO) return;
  mkdirSync(VIDEO, { recursive: true });
  const { renameSync } = require('node:fs');
  await fetch(`${api}/eu/preferencias`, { method: 'PUT', headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/json' }, body: JSON.stringify({ 'producoes.recolhidos': [], 'producoes.ordem': [] }) });
  for (const tema of ['light', 'dark']) {
    const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, viewport: { width: 1440, height: 560 }, recordVideo: { dir: VIDEO, size: { width: 1440, height: 560 } }, colorScheme: tema });
    await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(LIA), url }]);
    await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
    await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
    const p = await ctx.newPage();
    await p.goto(`${url}#/designer/producoes`);
    await p.locator('.prod-card').first().waitFor();
    await p.waitForTimeout(1000);
    for (const c of ['Festa na Praça', 'Show da Noite', 'Novela Sinfonia']) {
      await cardDe(p, c).locator('.prod-atracao').hover();
      await p.waitForTimeout(500);
    }
    await p.mouse.move(700, 300);
    for (let y = 0; y <= 360; y += 20) {
      await p.mouse.wheel(0, 20);
      await p.waitForTimeout(40);
    }
    await p.waitForTimeout(900);
    for (let y = 0; y <= 380; y += 20) {
      await p.mouse.wheel(0, -20);
      await p.waitForTimeout(40);
    }
    await p.waitForTimeout(900);
    await p.setViewportSize({ width: 1440, height: 560 });
    const video = p.video();
    await ctx.close();
    renameSync(await video.path(), join(VIDEO, `acabamento-${tema === 'dark' ? 'escuro' : 'claro'}.webm`));
  }
  console.log(`ok: o vídeo do acabamento em ${VIDEO}`);
}

/* ---------- #178: as campanhas ---------- */
/** O "+N" e a etiqueta no card de Produções, ligar e criar pelo card aberto, tirar com a caixinha de desfazer, a linha
    do tempo, e quem não tem o papel só vê. Nada vai ao Trello. Sem "unha": o tom vai na bolinha e no fundo. */
async function asCampanhas(navegador, url, chamadasAoTrello, db) {
  db.prepare('DELETE FROM campanhas_producoes').run();
  db.prepare('DELETE FROM campanhas').run();
  for (const tema of ['light', 'dark']) {
    const nome = tema === 'dark' ? 'escuro' : 'claro';
    const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
    const festa = cardDe(p, 'Festa na Praça');
    await festa.waitFor();
    await calmo(p);
    chamadasAoTrello.splice(0);
    const painel = p.getByRole('dialog');
    if (tema === 'light') {
      assert.equal(await festa.locator('.campanha').count(), 0, 'sem campanha, sem etiqueta');
      await festa.locator('.prod-atracao').click();
      await painel.locator('.pa-arte').first().waitFor();
      // criar pela busca: "+ Nova campanha" com o nome buscado
      for (const [i, n] of ['Lançamento Domingo', 'AESP Verão', 'Chamadas de elenco'].entries()) {
        await painel.getByRole('button', { name: 'Ligar a uma campanha' }).click();
        await painel.getByRole('textbox', { name: 'Buscar campanha' }).fill(n);
        await painel.getByRole('button', { name: '+ Nova campanha' }).click();
        await painel.locator('.campanhas-do-card .campanha', { hasText: n }).waitFor();
        if (i === 0) {
          // a etiqueta chega carimbada no card da lista
          await festa.locator('.campanhas.compacta .campanha.chegou', { hasText: n }).waitFor();
          await p.waitForTimeout(120);
          await capturar(p, `40-campanha-${nome}-carimbo`);
        }
      }
      assert.deepEqual(await textos(painel.locator('.campanhas-do-card .campanha-nome')), ['Lançamento Domingo', 'AESP Verão', 'Chamadas de elenco']);
      // no card: a primeira e "+2", com as outras no título
      assert.deepEqual(await textos(festa.locator('.campanhas.compacta .campanha-nome')), ['Lançamento Domingo']);
      assert.equal((await festa.locator('.campanha-mais').textContent()).trim(), '+2');
      assert.equal(await festa.locator('.campanha-mais').getAttribute('title'), 'AESP Verão · Chamadas de elenco');
      await p.waitForTimeout(600);
      await capturar(p, `41-campanha-${nome}-card-aberto`);
      // tirar: a vaga fecha e a caixinha de desfazer abre; "Desfazer" liga de novo
      // a vaga que fecha dura 220 ms: um observador anota se ela apareceu, sem depender de pegar o instante
      await p.evaluate(() => {
        window.__fechou = false;
        const o = new MutationObserver(() => {
          if ([...document.querySelectorAll('.campanhas-do-card .vaga-x.saindo .campanha')].some((e) => e.textContent.includes('AESP Verão'))) (window.__fechou = true), o.disconnect();
        });
        o.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      });
      await painel.getByRole('button', { name: 'Tirar da campanha AESP Verão' }).click();
      await p.waitForFunction(() => window.__fechou === true);
      await painel.locator('.campanhas-do-card .campanha', { hasText: 'AESP Verão' }).waitFor({ state: 'detached' });
      await p.locator('.desfazer', { hasText: 'Tirou da campanha AESP Verão' }).waitFor();
      await festa.locator('.campanha-mais', { hasText: '+1' }).waitFor();
      await capturar(p, `42-campanha-${nome}-tirou`);
      await p.locator('.desfazer').getByRole('button', { name: 'Desfazer' }).click();
      await painel.locator('.campanhas-do-card .campanha', { hasText: 'AESP Verão' }).waitFor();
      await festa.locator('.campanha-mais', { hasText: '+2' }).waitFor();
      // ligar uma que já existe, pela busca (sem acento), na Novela
      await painel.getByRole('button', { name: 'Fechar a Produção' }).click();
      await painel.waitFor({ state: 'detached' });
      const novela = cardDe(p, 'Novela Sinfonia');
      await novela.locator('.prod-atracao').click();
      await painel.locator('.pa-arte').first().waitFor();
      await painel.getByRole('button', { name: 'Ligar a uma campanha' }).click();
      await painel.getByRole('textbox', { name: 'Buscar campanha' }).fill('aesp verao');
      await painel.getByRole('option', { name: 'AESP Verão' }).click();
      await novela.locator('.campanhas.compacta .campanha', { hasText: 'AESP Verão' }).waitFor();
      assert.equal(await novela.locator('.campanha-mais').count(), 0, 'com uma campanha, sem "+N"');
      // a linha do tempo diz quem ligou e quem tirou
      await painel.getByRole('button', { name: 'Fechar a Produção' }).click();
      await painel.waitFor({ state: 'detached' });
      await festa.locator('.prod-atracao').click();
      await painel.locator('.pa-arte').first().waitFor();
      await painel.getByRole('button', { name: 'linha do tempo' }).click();
      const frases = await textos(painel.locator('.pa-tempo-lista li span'));
      for (const f of ['Lia Moraes ligou à campanha Lançamento Domingo', 'Lia Moraes tirou da campanha AESP Verão', 'Lia Moraes ligou à campanha AESP Verão']) assert.ok(frases.includes(f), `a linha do tempo diz "${f}" (${frases.join(' · ')})`);
      await painel.getByRole('button', { name: 'Fechar a Produção' }).click();
      await painel.waitFor({ state: 'detached' });
      // depois de recarregar, continua
      await p.reload();
      await festa.locator('.campanha-mais', { hasText: '+2' }).waitFor();
    } else {
      await festa.locator('.campanhas.compacta .campanha').first().waitFor();
      await festa.locator('.prod-atracao').click();
      await painel.locator('.campanhas-do-card .campanha').first().waitFor();
      await p.waitForTimeout(600);
      await capturar(p, `41-campanha-${nome}-card-aberto`);
      await painel.getByRole('button', { name: 'Fechar a Produção' }).click();
      await painel.waitFor({ state: 'detached' });
    }
    // sem "unha": nada de faixa na borda esquerda
    const unha = await p.locator('.campanha').first().evaluate((e) => { const c = getComputedStyle(e); return { borda: parseFloat(c.borderLeftWidth), sombra: c.boxShadow }; });
    assert.ok(unha.borda === 0 && !/inset/.test(unha.sombra), `a etiqueta não tem unha (${JSON.stringify(unha)})`);
    await semRolagemDeLado(p, `campanhas ${nome}`);
    await capturar(p, `43-campanha-${nome}-producoes`);
    assert.deepEqual(chamadasAoTrello, [], 'as campanhas não vão ao Trello');
    assert.deepEqual(aoTrello, [], 'nem o navegador pede ao Trello');
    assert.deepEqual(erros, [], `${nome}: sem erros na página`);
    await ctx.close();
  }
  // no celular: a etiqueta no card e no card aberto (a tela toda), sem rolar para o lado
  for (const tema of ['light', 'dark']) {
    const nome = tema === 'dark' ? 'escuro' : 'claro';
    const { ctx, p, erros } = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: tema });
    const festa = cardDe(p, 'Festa na Praça');
    await festa.locator('.campanhas.compacta .campanha').waitFor();
    await semRolagemDeLado(p, `campanhas no celular ${nome}`);
    await festa.scrollIntoViewIfNeeded();
    await capturar(p, `44-campanha-celular-${nome}`);
    await festa.locator('.prod-atracao').tap();
    const painel = p.getByRole('dialog');
    await painel.locator('.campanhas-do-card .campanha').first().waitFor();
    await p.waitForTimeout(500);
    await semRolagemDeLado(p, `card aberto no celular ${nome}`);
    await capturar(p, `45-campanha-celular-${nome}-card-aberto`);
    assert.deepEqual(erros, [], `celular ${nome}: sem erros na página`);
    await ctx.close();
  }
  // quem não tem o papel (o Rui: sem designer, sem redator, sem coordenação) vê as etiquetas, mas não liga nem tira
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, '#/designer/producoes', { email: RUI });
  const festa = cardDe(p, 'Festa na Praça');
  await festa.locator('.campanhas.compacta .campanha').waitFor();
  await festa.locator('.prod-atracao').click();
  const painel = p.getByRole('dialog');
  await painel.locator('.campanhas-do-card .campanha').first().waitFor();
  await painel.locator('.pa-arte').first().waitFor();
  assert.equal(await painel.getByRole('button', { name: 'Ligar a uma campanha' }).count(), 0, 'quem não tem o papel não liga');
  assert.equal(await painel.getByRole('button', { name: /^Tirar da campanha/ }).count(), 0, 'nem tira');
  await painel.getByRole('button', { name: 'Fechar a Produção' }).click();
  await painel.waitFor({ state: 'detached' });
  // #181: a busca acha pelo nome da campanha, sem caixa nem acento (qualquer pessoa busca)
  const lupa = p.getByRole('searchbox', { name: 'Buscar nas produções' });
  for (const termo of ['chamadas de ELENCO', 'lancamento domingo']) {
    await lupa.fill(termo);
    await p.locator('.prod-busca-topo', { hasText: termo }).waitFor();
    await p.locator('.prod-achado', { hasText: 'Festa na Praça' }).waitFor();
    assert.ok((await p.locator('.prod-achado').count()) >= 1, `a busca acha "${termo}"`);
  }
  await capturar(p, '46-campanha-busca');
  await lupa.press('Escape');
  await p.locator('.prod-achado').first().waitFor({ state: 'detached' });
  assert.deepEqual(erros, [], 'sem erros na página');
  await ctx.close();
  console.log('ok: as campanhas (#178) e a busca pelo nome da campanha (#181)');
}

/* ---------- #179: o filtro por campanha ---------- */
/** Ligar o filtro pelo botão "Campanha" (a busca das campanhas, sem acento) e pela etiqueta do card; as praças de
    sempre com só as Produções da campanha, as contagens acompanhando; o nome ao lado do título; tirar pelo × e pelo Esc;
    lembrado por pessoa (depois de recarregar continua; a outra pessoa não filtra). No computador e no celular, claro e
    escuro, e o vídeo do filtro entrando e saindo. Nada vai ao Trello. */
async function oFiltroDaCampanha(navegador, url, chamadasAoTrello, db, api) {
  const como = (email) => (caminho, corpo, metodo = 'POST') => fetch(`${api}${caminho}`, { method: metodo, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  const lia = como(LIA);
  // um palco arrumado: a Festa, o Show e a Cozinha na Entrada do SP, a Novela na Produzindo da G5; nada recolhido
  db.prepare("UPDATE producoes SET etapa = 'entrada', designers = '[]' WHERE claquete LIKE 'Festa na Praça%' OR claquete LIKE 'Show da Noite%' OR claquete LIKE 'Cozinha de Vó%'").run();
  db.prepare("UPDATE producoes SET etapa = 'produzindo' WHERE claquete LIKE 'Novela Sinfonia%'").run();
  db.prepare('DELETE FROM campanhas_producoes').run();
  db.prepare('DELETE FROM campanhas').run();
  for (const quem of [LIA, CHEFE]) await como(quem)('/eu/preferencias', { 'producoes.recolhidos': [], 'producoes.ordem': [], 'producoes.campanha': null }, 'PUT');
  const idDe = (inicio) => db.prepare('SELECT id FROM producoes WHERE claquete LIKE ?').get(`${inicio}%`).id;
  const ligar = async (claquete, nome) => assert.equal((await lia('/producoes/campanha', { producao: idDe(claquete), nova: nome })).status, 200, `ligar ${claquete} a ${nome}`);
  await ligar('Festa na Praça', 'Lançamento Domingo');
  await ligar('Novela Sinfonia', 'Lançamento Domingo');
  await ligar('Show da Noite', 'AESP Verão');
  const pracasDe = (p) => p.locator('.prod-blocos > .prod-bloco').evaluateAll((bs) => bs.map((b) => b.dataset.praca));
  const todas = async (p) => Object.fromEntries(await Promise.all(['SP', 'G5'].map(async (pr) => [pr, await Promise.all(['entrada', 'produzindo', 'entregue'].map((k) => claquetes(p, pr, k)))])));
  const filtroNoTopo = (p) => p.locator('.prod-cabeca .prod-filtro .campanha');
  for (const tema of ['light', 'dark']) {
    const nome = tema === 'dark' ? 'escuro' : 'claro';
    const { ctx, p, erros, aoTrello } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
    await cardDe(p, 'Festa na Praça').waitFor();
    chamadasAoTrello.splice(0);
    const pracas = await pracasDe(p);
    const antes = await todas(p);
    const contasAntes = await contas(p, 'SP');
    assert.equal(await filtroNoTopo(p).count(), 0, 'sem filtro, sem etiqueta no topo');
    // escolher pelo botão "Campanha": a busca das campanhas, sem acento
    await p.getByRole('button', { name: 'Campanha', exact: true }).click();
    await p.getByRole('textbox', { name: 'Buscar campanha' }).fill('lancamento');
    assert.deepEqual(await textos(p.locator('.prod-menu-campanha [role="option"]')), ['Lançamento Domingo'], 'a busca acha sem acento');
    await capturar(p, `46-filtro-${nome}-escolher`);
    await p.getByRole('option', { name: 'Lançamento Domingo' }).click();
    await filtroNoTopo(p).filter({ hasText: 'Lançamento Domingo' }).waitFor();
    await cardDe(p, 'Show da Noite').waitFor({ state: 'detached' });
    // as praças de sempre, só com as Produções da campanha, e as contagens acompanham
    assert.deepEqual(await pracasDe(p), pracas, 'as praças continuam as mesmas');
    const so = await todas(p);
    assert.deepEqual(so.SP, [[antes.SP[0].find((c) => c.startsWith('Festa na Praça'))], [], []], `no SP, só a Festa (${JSON.stringify(so.SP)})`);
    assert.deepEqual(so.G5, [[], [antes.G5[1].find((c) => c.startsWith('Novela Sinfonia'))], []], `na G5, só a Novela (${JSON.stringify(so.G5)})`);
    assert.deepEqual(await contas(p, 'SP'), [1, 0, 0], 'as contagens do SP acompanham');
    assert.deepEqual(await contas(p, 'G5'), [0, 1, 0], 'as da G5 também');
    assert.ok(contasAntes[0] > 1, 'antes, o SP tinha mais na Entrada');
    assert.equal(await p.locator('.prod-cabeca .prod-filtro-so').textContent(), 'só');
    // sem "unha" na etiqueta do topo
    const unha = await filtroNoTopo(p).evaluate((e) => { const c = getComputedStyle(e); return { borda: parseFloat(c.borderLeftWidth), sombra: c.boxShadow }; });
    assert.ok(unha.borda === 0 && !/inset/.test(unha.sombra), `a etiqueta do filtro não tem unha (${JSON.stringify(unha)})`);
    await p.waitForTimeout(500);
    await semRolagemDeLado(p, `filtro ${nome}`);
    await capturar(p, `47-filtro-${nome}-ligado`);
    if (tema === 'light') {
      // lembrado por pessoa: depois de recarregar continua; a outra pessoa vê tudo
      await p.reload();
      await filtroNoTopo(p).filter({ hasText: 'Lançamento Domingo' }).waitFor();
      await cardDe(p, 'Festa na Praça').waitFor();
      assert.equal(await cardDe(p, 'Show da Noite').count(), 0, 'depois de recarregar, continua filtrado');
      const outra = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, '#/designer/producoes', { email: CHEFE });
      await cardDe(outra.p, 'Show da Noite').waitFor();
      assert.equal(await filtroNoTopo(outra.p).count(), 0, 'a outra pessoa não filtra');
      await outra.ctx.close();
      // o Esc tira o filtro: tudo volta, com as contagens
      await p.locator('.prod-titulo h1').click();
      await p.keyboard.press('Escape');
      await cardDe(p, 'Show da Noite').waitFor();
      await filtroNoTopo(p).waitFor({ state: 'detached' });
      assert.deepEqual(await todas(p), antes, 'sem o filtro, as praças completas');
      assert.deepEqual(await contas(p, 'SP'), contasAntes, 'e as contagens de antes');
      // #171: o clique na etiqueta do card abre a página da campanha, como em todas as telas: não filtra nem abre a
      // Produção; o filtro é o botão "Campanha" do topo
      const id = db.prepare("SELECT id FROM campanhas WHERE nome = 'AESP Verão'").get().id;
      await cardDe(p, 'Show da Noite').getByRole('button', { name: 'Abrir a campanha AESP Verão' }).click();
      await p.waitForFunction((x) => location.hash.endsWith(`/${encodeURIComponent(x)}`), id);
      assert.equal(await p.getByRole('dialog').count(), 0, 'o clique na etiqueta não abre a Produção');
      await p.goBack();
      await cardDe(p, 'Festa na Praça').waitFor();
      assert.equal(await filtroNoTopo(p).count(), 0, 'a etiqueta não filtra');
      await p.getByRole('button', { name: 'Campanha', exact: true }).click();
      await p.getByRole('textbox', { name: 'Buscar campanha' }).fill('aesp');
      await p.getByRole('option', { name: 'AESP Verão' }).click();
      await filtroNoTopo(p).filter({ hasText: 'AESP Verão' }).waitFor();
      await cardDe(p, 'Festa na Praça').waitFor({ state: 'detached' });
      assert.deepEqual(await contas(p, 'SP'), [1, 0, 0], 'só o Show no SP');
      // o × tira o filtro, e tirado fica lembrado
      await p.getByRole('button', { name: 'Tirar o filtro da campanha AESP Verão (Esc)' }).click();
      await cardDe(p, 'Festa na Praça').waitFor();
      await filtroNoTopo(p).waitFor({ state: 'detached' });
      await p.waitForFunction(async () => (await (await fetch('/api/eu')).json()).preferencias['producoes.campanha'] === null);
      await p.reload();
      await cardDe(p, 'Show da Noite').waitFor();
      assert.equal(await filtroNoTopo(p).count(), 0, 'tirado, fica tirado');
      // a campanha renomeada no servidor: o topo diz o nome das etiquetas, não o lembrado
      await lia('/eu/preferencias', { 'producoes.campanha': { id: db.prepare("SELECT id FROM campanhas WHERE nome = 'AESP Verão'").get().id, nome: 'Nome Velho' } }, 'PUT');
      await p.reload();
      await filtroNoTopo(p).filter({ hasText: 'AESP Verão' }).waitFor();
      await p.getByRole('button', { name: /^Tirar o filtro/ }).click();
      await filtroNoTopo(p).waitFor({ state: 'detached' });
      // a campanha apagada não filtra mais
      await lia('/eu/preferencias', { 'producoes.campanha': { id: 'cp-apagada-e2e', nome: 'Apagada' } }, 'PUT');
      await p.reload();
      await cardDe(p, 'Show da Noite').waitFor();
      await p.waitForFunction(() => !document.querySelector('.prod-cabeca .prod-filtro .campanha'));
      await p.waitForFunction(async () => (await (await fetch('/api/eu')).json()).preferencias['producoes.campanha'] === null);
    } else {
      await p.getByRole('button', { name: /^Tirar o filtro/ }).click();
      await filtroNoTopo(p).waitFor({ state: 'detached' });
    }
    assert.deepEqual(chamadasAoTrello, [], 'o filtro não vai ao Trello');
    assert.deepEqual(aoTrello, [], 'nem o navegador pede ao Trello');
    assert.deepEqual(erros, [], `${nome}: sem erros na página`);
    await ctx.close();
  }
  // no celular: o botão no tamanho do dedo, o nome no topo, sem rolar para o lado
  for (const tema of ['light', 'dark']) {
    const nome = tema === 'dark' ? 'escuro' : 'claro';
    const { ctx, p, erros } = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: tema });
    await cardDe(p, 'Festa na Praça').waitFor();
    const botao = p.getByRole('button', { name: 'Filtrar por uma campanha' });
    const caixa = await botao.boundingBox();
    assert.ok(caixa.width >= 44 && caixa.height >= 44, `o botão no tamanho do dedo (${caixa.width}×${caixa.height})`);
    await botao.tap();
    await p.getByRole('option', { name: 'Lançamento Domingo' }).tap();
    await filtroNoTopo(p).filter({ hasText: 'Lançamento Domingo' }).waitFor();
    await cardDe(p, 'Show da Noite').waitFor({ state: 'detached' });
    await p.waitForTimeout(500);
    await semRolagemDeLado(p, `filtro no celular ${nome}`);
    await capturar(p, `48-filtro-celular-${nome}`);
    await p.getByRole('button', { name: /^Tirar o filtro/ }).tap();
    await cardDe(p, 'Show da Noite').waitFor();
    assert.deepEqual(erros, [], `celular ${nome}: sem erros na página`);
    await ctx.close();
  }
  await filmarOFiltro(navegador, url, api);
  console.log('ok: o filtro por campanha (#179)');
}

/** O vídeo do filtro por campanha (#179), com VIDEO=pasta: escolher pelo botão (os de fora esmaecem, os que ficam
    deslizam, as contagens pulam), tirar pelo Esc (os que voltam chegam em cascata), filtrar pela etiqueta do card e
    tirar pelo ×; e o mesmo com prefers-reduced-motion (só esmaecer). */
async function filmarOFiltro(navegador, url, api) {
  if (!VIDEO) return;
  mkdirSync(VIDEO, { recursive: true });
  const { renameSync } = require('node:fs');
  for (const [nome, movimento] of [['filtro', 'no-preference'], ['filtro-reduzido', 'reduce']]) {
    await fetch(`${api}/eu/preferencias`, { method: 'PUT', headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/json' }, body: JSON.stringify({ 'producoes.campanha': null }) });
    const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, viewport: { width: 1440, height: 860 }, recordVideo: { dir: VIDEO, size: { width: 1440, height: 860 } }, reducedMotion: movimento, colorScheme: 'light' });
    await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(LIA), url }]);
    await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
    await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
    const p = await ctx.newPage();
    await p.goto(`${url}#/designer/producoes`);
    await cardDe(p, 'Festa na Praça').waitFor();
    await p.waitForTimeout(1000);
    await p.getByRole('button', { name: 'Campanha', exact: true }).click();
    await p.waitForTimeout(500);
    await p.getByRole('textbox', { name: 'Buscar campanha' }).pressSequentially('lanç', { delay: 90 });
    await p.waitForTimeout(400);
    await p.getByRole('option', { name: 'Lançamento Domingo' }).click();
    await p.waitForTimeout(1500);
    await p.locator('.prod-titulo h1').click();
    await p.keyboard.press('Escape');
    await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Campanha', exact: true }).click();
    await p.getByRole('textbox', { name: 'Buscar campanha' }).pressSequentially('aesp', { delay: 90 });
    await p.getByRole('option', { name: 'AESP Verão' }).click();
    await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /^Tirar o filtro/ }).click();
    await p.waitForTimeout(1500);
    const video = p.video();
    await ctx.close();
    renameSync(await video.path(), join(VIDEO, `producoes-${nome}.webm`));
  }
  console.log(`ok: o vídeo do filtro em ${VIDEO}`);
}

async function principal() {
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const { comTabelas } = await import(join(RAIZ, 'servidor', 'tabelas-do-teable.mjs'));
  // o cadastro de designers (fictício): a Lia, com o e-mail e o id do membro no Trello
  // #160: o Caio (fictício), para atribuir no card aberto; e as atrações do cadastro, para a busca
  const DESIGNERS = [
    { id: 'recDesignerE2e', fields: { designer: 'Lia Moraes', email: LIA, designer_ID: 'membroLia', status: 'ativo' } },
    { id: 'recDesignerCaioE2e', fields: { designer: 'Caio Prates', email: 'caio.prates@exemplo.com', designer_ID: 'membroCaio', status: 'ativo' } },
  ];
  const ATRACOES = [
    { id: 'recAtrE2e1', fields: { atracao: 'Domingo Show', categoria: 'Variedades' } },
    { id: 'recAtrE2e2', fields: { atracao: 'Festa na Praça', categoria: 'Shows' } },
  ];
  const teable = teableFalso({ ARTE_producao: 'arte_e2e', designers: 'designers_e2e', atracoes: 'atracoes_e2e' }, { registros: { ARTE_producao: ARTE, designers: DESIGNERS, atracoes: ATRACOES } });
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
  // o Trello de mentira só aceita escrita nos cards (#110): o que o servidor pede fica anotado; a leitura falha; o card
  // do Show da Noite recusa (para a tela desfazer)
  const chamadasAoTrello = [];
  // #112: o Trello de mentira também recusa tudo quando o teste pede (o desfazer recusado)
  const trelloFalso = { recusar: false };
  // #160: o checklist das artes de cada card (lido só pelo card aberto, no card que muda), com os itens da produção da arte
  const checklists = new Map();
  let nItem = 0;
  const itensDe = (id) => {
    if (!checklists.has(id)) checklists.set(id, String(ARTE.find((l) => l.fields.card_ID === id)?.fields.artes ?? '').split('|').map((a) => a.trim()).filter(Boolean).map((name) => ({ id: `item${++nItem}`, name, state: 'incomplete' })));
    return checklists.get(id);
  };
  const buscar = async (u, init = {}) => {
    const metodo = init.method ?? 'GET';
    chamadasAoTrello.push(metodo === 'GET' ? `GET ${u}` : escrito(u, metodo));
    const caminho = new URL(u).pathname;
    const doCheck = /^\/1\/cards\/([^/]+)\/checklists$/.exec(caminho);
    if (doCheck && metodo === 'GET') return Response.json([{ id: `lista-${doCheck[1]}`, name: 'ARTES PRODUZIDAS', checkItems: itensDe(doCheck[1]) }]);
    const doItem = /^\/1\/checklists\/lista-([^/]+)\/checkItems(?:\/([^/]+))?$/.exec(caminho);
    if (doItem) {
      const itens = itensDe(doItem[1]);
      if (metodo === 'DELETE') itens.splice(itens.findIndex((i) => i.id === doItem[2]), 1);
      if (metodo !== 'POST') return Response.json({});
      const item = { id: `item${++nItem}`, name: new URL(u).searchParams.get('name'), state: 'incomplete' };
      itens.push(item);
      return Response.json(item);
    }
    if (metodo === 'GET' || !caminho.startsWith('/1/cards/')) throw new Error(`o teste não sai para a rede: ${u}`);
    if (trelloFalso.recusar) return new Response('recusado pelo Trello falso', { status: 400 });
    if (new URL(u).pathname.includes(card(1))) return new Response('card recusado pelo Trello falso', { status: 400 });
    return Response.json({});
  };
  const trello = { env: { ...PG, ...comTabelas({ ARTE_producao: 'arte_e2e' }), TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso' }, consultar: teable.consultar, buscar };
  const listas = { TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP', TRELLO_LISTA_G5: 'entradaG5', TRELLO_SAIDA_G5: 'saidaG5' };
  // os trabalhos de tempo em tempo do servidor (a releitura do Teable, a cada minuto de relógio) não rodam sozinhos: os
  // passos arrumam as Produções direto no SQLite, e uma releitura que caísse no meio de um passo trazia de volta o que
  // estava no Teable falso, mais vezes quanto mais lenta a máquina (#183). A releitura tem os testes dela no Vitest; a
  // "releitura a cada minuto" conferida aqui é a da tela, pelo relógio do navegador
  const s = await subir({ agendar: () => ({ unref() {} }), teable, pg: teable.abrirPg, trello, cadastros: (env) => criarCadastros(env, { buscar: teable }), env: { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, ...PG, ...listas } });
  await s.app.pessoasProntas;
  // o Roteiro (fictício) enviado para o card da Festa diz a atração
  const em = new Date().toISOString();
  s.db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run('roteiro-festa-e2e', CHEFE, 'Chefe', JSON.stringify({ claquete: `Festa na Praça ${dm(3)} SP`, programa: 'Festa na Praça' }), '{}', em, em);
  // #121: as artes do Roteiro da Festa dizem "AMANHÃ" (as versões lidas, como o servidor guarda ao gravar)
  s.db.prepare('UPDATE roteiros SET versoes_lidas = ? WHERE id = ?').run(JSON.stringify([{ codigo: 'A', rotulo: 'amanhã', conhecida: true }]), 'roteiro-festa-e2e');
  s.db.prepare("INSERT INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'ok', ?, ?)").run('roteiro-festa-e2e', card(2), em);
  const carga = await fetch(`${s.api}/producoes/recarregar`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': CHEFE } });
  assert.equal(carga.status, 200, 'a carga das Produções');
  await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': LIA } });
  await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': CHEFE } });
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    // SO=card-aberto roda só o card aberto (#160) e o vídeo dele
    if (process.env.SO === 'acabamento') {
      await produzindoComEspaco(navegador, s.url, s.db, s.api);
      await filmarOAcabamento(navegador, s.url, s.api);
    }
    // SO=topo roda só o topo (#168): a fila e as Produções no computador, a troca entre as telas e o vídeo dela
    else if (process.env.SO === 'topo') {
      await noComputador(navegador, s.url, 'light', chamadasAoTrello);
      await entradaNoCelular(navegador, s.url);
      await topoEntreAsTelas(navegador, s.url);
    }
    // SO=campanhas roda só as campanhas (#178)
    else if (process.env.SO === 'campanhas') await asCampanhas(navegador, s.url, chamadasAoTrello, s.db);
    // SO=filtro roda só o filtro por campanha (#179) e o vídeo dele
    else if (process.env.SO === 'filtro') await oFiltroDaCampanha(navegador, s.url, chamadasAoTrello, s.db, s.api);
    else if (process.env.SO === 'card-aberto') {
      await oCardAberto(navegador, s.url, chamadasAoTrello, s.db);
      await filmarOCardAberto(navegador, s.url, s.db);
    } else await tudo();
  } catch (e) {
    falhou = true;
    console.error(e);
  } finally {
    await navegador.close();
    await s.descer();
  }
  process.exit(falhou ? 1 : 0);

  async function tudo() {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, tema, chamadasAoTrello);
    await noTablet(navegador, s.url);
    for (const tema of ['light', 'dark']) await noCelular(navegador, s.url, tema, chamadasAoTrello);
    await entradaNoCelular(navegador, s.url);
    await osBotoes(navegador, s.url, chamadasAoTrello);
    await arrastarEDesfazer(navegador, s.url, chamadasAoTrello, trelloFalso);
    await recolherEAbrir(navegador, s.url, chamadasAoTrello);
    await artesFeitas(navegador, s.url, s.db);
    await oCodigoDesligado(navegador, s.url, s.api);
    await asVersoesAMaoSemRoteiro(navegador, s.url);
    await topoEntreAsTelas(navegador, s.url);
    await arrumarAsPracas(navegador, s.url);
    await divisoriasPorDia(navegador, s.url, s.db);
    await espacoEBusca(navegador, s.url, s.db, s.api, chamadasAoTrello);
    await produzindoComEspaco(navegador, s.url, s.db, s.api);
    await filmarOAcabamento(navegador, s.url, s.api);
    await oCardAberto(navegador, s.url, chamadasAoTrello, s.db);
    await filmarOCardAberto(navegador, s.url, s.db);
    await asCampanhas(navegador, s.url, chamadasAoTrello, s.db);
    await oFiltroDaCampanha(navegador, s.url, chamadasAoTrello, s.db, s.api);
    await filmar(navegador, s.url, s.db, s.api);
  }
}
void principal();
