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
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:producoes
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:producoes');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
// sem cadastro de designer: vê a tela, não pega
const RUI = 'rui.sem.cadastro@exemplo.com';
const CHEFE = 'chefe.ficticia@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
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
const linha = (id, fields) => ({ id, fields: { status: '[]', designers: null, arquivado: false, entregue: false, praca: null, filme: null, ...fields } });
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

/** Os blocos lado a lado: a 1920px cabem todos e usam a largura toda; a 1440px, a área rola para o lado. */
async function blocosLadoALado(p, largura) {
  const m = await medidasDosBlocos(p);
  assert.deepEqual(m.blocos.map((b) => b.praca), ['G5', 'RJ', 'SP', 'INTER']);
  assert.equal(new Set(m.blocos.map((b) => b.top)).size, 1, `${largura}: os blocos ficam lado a lado`);
  for (let i = 1; i < m.blocos.length; i++) assert.ok(m.blocos[i].left >= m.blocos[i - 1].right, `${largura}: um bloco depois do outro`);
  // dentro do bloco, as três colunas lado a lado
  const topos = await p.locator('.prod-bloco[data-praca="SP"] .prod-coluna').evaluateAll((cs) => cs.map((c) => Math.round(c.getBoundingClientRect().top)));
  assert.equal(new Set(topos).size, 1, `${largura}: no bloco, as colunas ficam lado a lado`);
  assert.deepEqual(await passamDaBorda(p), [], `${largura}: nada passa da borda do card`);
  // no topo de cada coluna, o nome inteiro e a contagem na mesma linha
  const nomes = await p.locator('.prod-coluna h3').evaluateAll((hs) =>
    hs.map((h) => ({ cortado: h.querySelector('.prod-coluna-nome').scrollWidth > h.querySelector('.prod-coluna-nome').clientWidth, linha: Math.abs(h.querySelector('.prod-conta').getBoundingClientRect().top - h.querySelector('i').getBoundingClientRect().top) < 12 })),
  );
  assert.ok(nomes.every((n) => !n.cortado && n.linha), `${largura}: o nome da coluna e a contagem na mesma linha (${JSON.stringify(nomes)})`);
  if (largura >= 1920) {
    assert.ok(m.rolaDeLado <= 1, `1920: os quatro blocos cabem (${m.rolaDeLado}px a rolar)`);
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
  const presos = await p.locator('.prod-bloco').evaluateAll((bs) =>
    bs.map((b) => ({ topo: b.querySelector('.prod-bloco-topo').getBoundingClientRect(), coluna: b.querySelector('.prod-coluna h3').getBoundingClientRect() })),
  );
  for (const b of presos) {
    assert.ok(Math.abs(b.topo.top - topo) <= 1, `o topo do bloco fica em cima (${b.topo.top} e ${topo})`);
    assert.ok(Math.abs(b.coluna.top - b.topo.bottom) <= 1, 'o nome da coluna fica logo abaixo do topo do bloco');
  }
  assert.ok(await p.evaluate(() => scrollY === 0), 'quem rola é a área dos blocos, não a página');
  await area.evaluate((a) => (a.scrollTop = 0));
  await p.setViewportSize({ width: largura, height: 1000 });
}

async function noComputador(navegador, url, tema, chamadasAoTrello) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  // o claro a 1920px, o escuro a 1440px
  const largura = tema === 'dark' ? 1440 : 1920;
  const { ctx, p, erros, aoTrello, leituras } = await abrir(navegador, url, { viewport: { width: largura, height: 1000 }, colorScheme: tema }, '', { relogio: tema === 'light' });
  assert.equal(await fundoEscuro(p), tema === 'dark');

  // a entrada no topo da fila, ao lado da agenda No Trello; o endereço próprio, na área Designer
  await p.locator('.barra-topo .topo-producoes').click();
  await p.locator('.prod-bloco').first().waitFor();
  assert.equal(hash(p), '#/designer/producoes');
  assert.equal((await p.locator('.prod-cabeca h1').textContent()).trim(), 'Produções');

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
  assert.deepEqual(await contas(p, 'INTER'), [0, 0, 0]);

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

  // os caminhos do topo (#156): "No Trello · Pauta da edição", com a bolinha entre eles, sem o "De todo mundo"
  const caminhos = p.locator('.barra-topo nav.caminhos-do-topo');
  assert.deepEqual((await caminhos.locator('a span').allTextContents()).slice(0, 2), ['No Trello', 'Pauta da edição']);
  assert.equal(await caminhos.locator('.caminho-bolinha').count() >= 1, true, 'a bolinha entre os caminhos');
  assert.equal(await p.locator('.barra-topo', { hasText: /de todo mundo/i }).count(), 0, 'sem o "De todo mundo"');
  // a volta para a agenda No Trello
  await p.locator('.barra-topo .topo-agenda').click();
  await p.locator('.barra-topo .topo-producoes').waitFor();
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
  assert.equal(await entrada.locator('span').isVisible(), false);
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

  // "Peguei": o card vai para Produzindo com a Lia; no Trello, a Lia entra no card (o card fica na lista)
  await cardDe(p, 'Festa na Praça').locator('.prod-mudar').click();
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
  const alturas = await cel.p.locator('.prod-mudar').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height));
  assert.ok(alturas.length > 0 && alturas.every((h) => h >= 44), 'no celular, os botões têm 44px');
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
  await cardLoc.locator('.prod-claquete').hover();
  await p.mouse.down();
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

  // arrastar da Entrada para Produzindo é pegar: no ar, só as colunas do bloco dele para onde ele pode ir ficam marcadas
  await arrastar(p, novela(), coluna(p, 'G5', 'produzindo'), async () => {
    const marcadas = await p.locator('.prod-coluna.aceita').evaluateAll((cs) => cs.map((c) => `${c.closest('.prod-bloco').dataset.praca} ${c.dataset.coluna}${c.classList.contains('sobre') ? ' (sobre)' : ''}`));
    assert.deepEqual(marcadas, ['G5 produzindo (sobre)', 'G5 entregue']);
    await capturar(p, '10-producoes-arrastando');
  });
  await coluna(p, 'G5', 'produzindo').locator('.prod-card', { hasText: 'Novela Sinfonia' }).waitFor();
  await calmo(p);
  assert.equal(await designersDe(novela()), 'Dora Lima, Enzo Prado, Lia Moraes');
  assert.deepEqual(chamadasAoTrello.splice(0), [`POST /cards/${card(4)}/idMembers ?value=membroLia`]);
  assert.equal(await p.locator('.prod-coluna.aceita').count(), 0, 'solto, nenhuma coluna fica marcada');
  // a caixinha de desfazer
  const caixinha = p.locator('.prod-desfazer');
  await caixinha.waitFor();
  assert.match(await caixinha.locator('.prod-desfazer-texto').textContent(), /Você pegou Novela Sinfonia/);
  await capturar(p, '11-producoes-desfazer');
  // "Desfazer": o card volta para a Entrada, e no Trello a Lia sai do card
  await caixinha.getByRole('button', { name: 'Desfazer' }).click();
  await coluna(p, 'G5', 'entrada').locator('.prod-card', { hasText: 'Novela Sinfonia' }).waitFor();
  assert.equal(await caixinha.count(), 0, 'desfeito, a caixinha fecha');
  await calmo(p);
  assert.equal(await designersDe(novela()), 'Dora Lima, Enzo Prado');
  assert.deepEqual(chamadasAoTrello.splice(0), [`DELETE /cards/${card(4)}/idMembers/membroLia`]);
  await p.reload();
  await p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await contas(p, 'G5'), [3, 0, 0], 'o desfeito fica depois de recarregar');

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
  assert.match(await caixinha.locator('.prod-desfazer-texto').textContent(), /Novela Sinfonia .* foi entregue/);
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
  const caixa = cel.p.locator('.prod-desfazer');
  await caixa.waitFor();
  assert.match(await caixa.textContent(), /Jogo Final .* voltou para a Entrada/);
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
  assert.deepEqual(await recolhidos(p), [], 'sem escolha, todos os blocos abertos');
  const g5 = await contas(p, 'G5');
  const guardou = () => p.waitForResponse((r) => new URL(r.url()).pathname === '/api/eu/preferencias' && r.request().method() === 'PUT' && r.ok());

  // recolher o RJ e o G5: uma coluna estreita com a sigla e as contagens; os outros blocos ficam com a largura
  let gravou = guardou();
  await p.getByRole('button', { name: 'Recolher o bloco RJ' }).click();
  assert.deepEqual(JSON.parse((await gravou).request().postData()), { 'producoes.recolhidos': ['RJ'] });
  gravou = guardou();
  await p.getByRole('button', { name: 'Recolher o bloco G5' }).click();
  await gravou;
  assert.deepEqual(await recolhidos(p), ['G5', 'RJ']);
  assert.deepEqual(await contasRecolhido(p, 'G5'), g5, 'o recolhido mostra a contagem de cada coluna');
  assert.deepEqual(await contasRecolhido(p, 'RJ'), [0, 0, 0]);
  assert.equal((await p.locator('.prod-bloco[data-praca="G5"] .prod-sigla').textContent()).trim(), 'G5');
  assert.equal(await p.locator('.prod-bloco[data-praca="G5"] .prod-card').count(), 0, 'o recolhido não mostra os cards');
  const m = await medidasDosBlocos(p);
  const largura = (praca) => m.blocos.find((b) => b.praca === praca).width;
  assert.ok(largura('G5') < 100 && largura('RJ') < 100, `o recolhido é uma coluna estreita (${largura('G5')}px)`);
  assert.ok(m.rolaDeLado <= 1, `com dois recolhidos, os blocos cabem sem rolar para o lado (${m.rolaDeLado}px)`);
  assert.ok(Math.abs(m.area.right - m.blocos.at(-1).right) <= 1 && largura('SP') > 448, `os abertos ficam com a largura (${largura('SP')}px)`);
  await capturar(p, '13-producoes-recolhidos');

  // recarregada, os dois continuam recolhidos (o servidor guardou)
  await p.reload();
  await p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await recolhidos(p), ['G5', 'RJ'], 'depois de recarregar, os blocos continuam recolhidos');
  // a outra pessoa vê todos abertos
  const outra = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, '#/designer/producoes', { email: RUI });
  await outra.p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await recolhidos(outra.p), [], 'a outra pessoa vê todos os blocos abertos');
  await outra.ctx.close();
  // no celular (outro aparelho), o recolhido é uma linha só, com a sigla e as contagens
  const cel = await abrir(navegador, url, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await cel.p.locator('.prod-bloco').first().waitFor();
  assert.deepEqual(await recolhidos(cel.p), ['G5', 'RJ'], 'no celular, os mesmos recolhidos');
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
  assert.deepEqual(await recolhidos(p), ['RJ'], 'depois de recarregar, só o RJ recolhido');
  console.log('ok: recolher: a coluna estreita com a sigla e as contagens, guardada por pessoa (recarregar, outro aparelho), e a outra pessoa com todos abertos');

  // abrir a Produção: a linha do tempo, as artes do checklist e o link do card no Trello
  const novela = cardDe(p, 'Novela Sinfonia');
  await novela.locator('.prod-atracao').click();
  const painel = p.getByRole('dialog');
  await painel.locator('.prod-aberta-tempo li').first().waitFor();
  assert.equal((await painel.locator('h2').textContent()).trim(), `Novela Sinfonia ${dm(2)} (AH)`);
  assert.equal((await painel.locator('.prod-aberta-rotulo').textContent()).replace(/\s+/g, ' ').trim(), 'G5 · Entrada');
  const frases = await textos(painel.locator('.prod-aberta-tempo li'));
  assert.ok(frases.some((f) => /^Lia Moraes pegou /.test(f)) && frases.some((f) => /^entregue /.test(f)), `a linha do tempo diz o que a Lia fez (${frases.join(' · ')})`);
  assert.deepEqual(await textos(painel.locator('.prod-aberta-artes .nome')), ['HOJE', 'AMANHÃ']);
  assert.deepEqual(await textos(painel.locator('.prod-aberta-artes .estado')), ['falta', 'falta']);
  const link = painel.getByRole('link', { name: /Abrir o card no Trello/ });
  assert.equal(await link.getAttribute('href'), `https://trello.com/c/${card(4)}`);
  assert.equal(await link.getAttribute('target'), '_blank');
  await capturar(p, '15-producoes-aberta');
  // fecha no Esc, e o foco volta para o card
  await p.keyboard.press('Escape');
  assert.equal(await painel.count(), 0);
  await p.waitForFunction(() => document.activeElement?.matches('.prod-card') && document.activeElement.textContent.includes('Novela Sinfonia'));
  // o Enter no card em foco abre de novo; o clique fora fecha
  await p.keyboard.press('Enter');
  await painel.waitFor();
  await p.mouse.click(40, 500);
  assert.equal(await painel.count(), 0, 'o clique fora fecha');
  // a sem card: sem o link
  await cardDe(p, 'Cozinha de Vó').locator('.prod-claquete').click();
  await painel.locator('.prod-aberta-sem-card').waitFor();
  assert.equal(await painel.getByRole('link').count(), 0);
  await painel.getByRole('button', { name: 'Fechar' }).click();
  assert.equal(await painel.count(), 0);

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
  await noCel.locator('.prod-aberta-tempo li').first().waitFor();
  await noCel.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  const caixa = await noCel.boundingBox();
  assert.ok(caixa.x <= 1 && Math.abs(caixa.width - 390) <= 1, `no celular, a Produção aberta ocupa a tela (${JSON.stringify(caixa)})`);
  await semRolagemDeLado(celular.p, 'celular com a Produção aberta');
  await capturar(celular.p, '16-producoes-celular-aberta');
  await noCel.getByRole('button', { name: 'Fechar' }).tap();
  assert.equal(await noCel.count(), 0);
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
  const aberta = p.locator('.prod-aberta');
  await aberta.waitFor();
  const apelido = aberta.locator('.apelido-claquete');
  // #156: sem versão, a Produção aberta não mostra a linha das versões nem as dá; o apelido continua
  assert.equal(await apelido.locator('small', { hasText: 'versões' }).count(), 0, 'a Produção aberta sem a seção das versões');
  assert.equal(await aberta.getByRole('button', { name: /Editar as versões|dar as versões/ }).count(), 0, '"dar as versões" escondido');
  assert.ok(await apelido.getByRole('button', { name: 'dar um apelido' }).isVisible(), 'o apelido continua na Produção aberta');
  // as versões à mão guardadas pela rota, como antes (a Produção do card)
  const producao = await show.getAttribute('data-producao');
  const guardar = (versoes) => p.evaluate(async ([id, v]) => (await fetch('/api/apelidos', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ producao: id, versoes: v }) })).status, [producao, versoes]);
  assert.equal(await guardar('PN'), 200, 'gravou pela Produção, sem roteiro');
  await p.keyboard.press('Escape');
  await p.reload();
  await show.waitFor();
  assert.equal(await nome(), `Show da Noite ${dm(3)} SP (PN)`, 'o card: o código no fim do nome');
  assert.match(await show.locator('.sufixo-versoes').getAttribute('title'), /feitas à mão/, 'o card: a dica diz à mão');
  await show.locator('.prod-atracao').click();
  await aberta.waitFor();
  await aberta.locator('#prod-aberta-titulo .sufixo-versoes').waitFor();
  assert.equal((await aberta.locator('#prod-aberta-titulo').textContent()).replace(/\s+/g, ' ').trim(), `Show da Noite ${dm(3)} SP (PN)`, 'a Produção aberta: o código no fim do nome');
  assert.equal(await apelido.evaluate((e) => getComputedStyle(e).borderLeftWidth), '0px', 'sem unha');
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

async function principal() {
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const { comTabelas } = await import(join(RAIZ, 'servidor', 'tabelas-do-teable.mjs'));
  // o cadastro de designers (fictício): a Lia, com o e-mail e o id do membro no Trello
  const DESIGNERS = [{ id: 'recDesignerE2e', fields: { designer: 'Lia Moraes', email: LIA, designer_ID: 'membroLia', status: 'ativo' } }];
  const teable = teableFalso({ ARTE_producao: 'arte_e2e', designers: 'designers_e2e' }, { registros: { ARTE_producao: ARTE, designers: DESIGNERS } });
  const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
  // o Trello de mentira só aceita escrita nos cards (#110): o que o servidor pede fica anotado; a leitura falha; o card
  // do Show da Noite recusa (para a tela desfazer)
  const chamadasAoTrello = [];
  // #112: o Trello de mentira também recusa tudo quando o teste pede (o desfazer recusado)
  const trelloFalso = { recusar: false };
  const buscar = async (u, init = {}) => {
    const metodo = init.method ?? 'GET';
    chamadasAoTrello.push(metodo === 'GET' ? `GET ${u}` : escrito(u, metodo));
    if (metodo === 'GET' || !new URL(u).pathname.startsWith('/1/cards/')) throw new Error(`o teste não sai para a rede: ${u}`);
    if (trelloFalso.recusar) return new Response('recusado pelo Trello falso', { status: 400 });
    if (new URL(u).pathname.includes(card(1))) return new Response('card recusado pelo Trello falso', { status: 400 });
    return Response.json({});
  };
  const trello = { env: { ...PG, ...comTabelas({ ARTE_producao: 'arte_e2e' }), TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso' }, consultar: teable.consultar, buscar };
  const listas = { TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP', TRELLO_LISTA_G5: 'entradaG5', TRELLO_SAIDA_G5: 'saidaG5' };
  const s = await subir({ teable, pg: teable.abrirPg, trello, env: { CADASTRO_ADMINS: CHEFE, ...TEABLE_FALSO, ...PG, ...listas } });
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
  const navegador = await chromium.launch();
  let falhou = false;
  try {
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
