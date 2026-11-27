// Ponta a ponta da aba Filmes no computador e no celular (#169), rodado à parte do vitest: `npm run e2e:filmes-agenda`.
//
// Sobe o servidor e o Vite como o e2e do tour (banco temporário, dados fictícios), com o Postgres do Teable falso: nada
// sai para a rede. Confere a área de soltar a prévia no padrão da fila (o convite que se escreve sozinho, o risco à mão,
// a camada "Pode soltar" ao arrastar um arquivo pela janela, sem a camada dos roteiros), a agenda de filmes com os
// pôsteres (a cascata, o hover da agenda, a semana por data com as setas e o "voltar para hoje", #182, a busca na lupa,
// por sessão, a escolha lembrada depois de recarregar), o filme sem
// pôster e o de pôster quebrado (a capa com o título, nunca a imagem quebrada), o card aberto no centro que cresce do
// pôster (as exibições, a Produção ligada, o "Copiar caminho") e o movimento reduzido. No celular, a página não rola
// para o lado e os alvos têm 44px. Com CAPTURAS=<pasta>, guarda as telas nos temas claro e escuro e um vídeo curto.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:filmes-agenda
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, renameSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const zlib = require('node:zlib');
const { subir } = require('./tour.e2e.cjs');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:filmes-agenda');
  process.exit(2);
}

const RAIZ = join(__dirname, '..', '..');
const LIA = 'lia.moraes@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const PG = { TEABLE_PG_URL: 'postgres://teste', TEABLE_PG_ESQUEMA: 'bse_teste', TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'token-falso' };
const NO_POSTGRES = { filmes: 'filmes_teste', exibicoes: 'exibicoes_teste' };
const ENV = { N8N_FILMES_LER: 'http://n8n.falso/webhook/ler-pagina', FILMES_INTERVALO_MS: '0', ...PG };

/** O dia de Brasília daqui a `n` dias (AAAA-MM-DD). */
const dia = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + n * 86_400_000));
const quando = (n, hora = '00:00') => new Date(`${dia(n)}T${hora}:00-03:00`).toISOString();

/** O cadastro de filmes fictício: o Farol e o Gelo com pôster guardado, a Noite sem pôster, o Vidro com o pôster do
    Teable que não vem (a capa com o título, nunca a imagem quebrada). */
const filme = (id, titulo, ano, poster = null) => ({
  __id: id,
  titulo,
  ano_de_producao: ano,
  nome_da_pasta: titulo.toUpperCase(),
  projeto_win: `P:\\FILMES\\${titulo.toUpperCase()}`,
  projeto_mac: `/Volumes/P/FILMES/${titulo.toUpperCase()}`,
  output_win: `O:\\OUTPUT\\${titulo.toUpperCase()}`,
  output_mac: `/Volumes/O/OUTPUT/${titulo.toUpperCase()}`,
  poster,
});
const FILMES = [
  filme('recFarolFic1', 'Viagem ao Farol', 2021),
  filme('recGeloFic01', 'Corrida no Gelo', 2019),
  filme('recNoiteFic1', 'Noite Antiga', null),
  filme('recVidroFic1', 'A Casa de Vidro', 2016, [{ name: 'vidro.jpg', token: 'x' }]),
  filme('recPonteFic1', 'Ponte Sobre o Rio', 2022),
  filme('recSalaFic01', 'A Sala Escura', 2018),
];
const sessao = (title) => ({ id: `recSes${title.replace(/\W/g, '').slice(0, 8)}`, title });
const exibicao = (id, filmeId, n, s, o = {}) => ({ __id: id, filme: { id: filmeId, title: filmeId }, data_de_exibicao: quando(n, o.hora), sessao: sessao(s), inedito: !!o.inedito, link: o.link ?? '', card_ID: o.card ?? '', labels: null });
const EXIBICOES = [
  exibicao('recEx01', 'recFarolFic1', 0, 'Sessão da Tarde', { card: 'cardFicFarol1', link: 'https://trello.com/c/cardFicFarol1' }),
  exibicao('recEx02', 'recFarolFic1', 6, 'Corujão', { hora: '01:40' }),
  exibicao('recEx03', 'recGeloFic01', 0, 'Tela Quente', { inedito: true, hora: '22:30' }),
  exibicao('recEx04', 'recNoiteFic1', 1, 'Corujão', { hora: '02:10' }),
  exibicao('recEx05', 'recVidroFic1', 2, 'Temperatura Máxima'),
  exibicao('recEx06', 'recPonteFic1', 2, 'Sessão da Tarde', { inedito: true }),
  exibicao('recEx07', 'recSalaFic01', 3, 'Supercine'),
  exibicao('recEx08', 'recGeloFic01', 4, 'Sessão da Tarde'),
  exibicao('recEx09', 'recSalaFic01', -1, 'Corujão'),
];
const consultar = async (sql) => (sql.includes('"filmes_teste"') ? FILMES : sql.includes('"exibicoes_teste"') ? EXIBICOES : []);

/** Um PNG de pôster fictício: um degradê vertical de uma cor, com uma faixa clara (a "cara" de pôster). */
function png(w, h, [r, g, b]) {
  const pedaco = (tipo, dados) => {
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo), dados]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(corpo));
    return Buffer.concat([tam, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const linhas = Array.from({ length: h }, (_, y) => {
    const k = 0.55 + 0.45 * (1 - y / h);
    const faixa = y > h * 0.62 && y < h * 0.7;
    const px = faixa ? [235, 230, 220] : [r * k, g * k, b * k].map(Math.round);
    return Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => px).flat())]);
  });
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', ihdr), pedaco('IDAT', zlib.deflateSync(Buffer.concat(linhas))), pedaco('IEND', Buffer.alloc(0))]);
}
const POSTERES = { recFarolFic1: [32, 92, 150], recGeloFic01: [176, 52, 40], recPonteFic1: [60, 120, 70], recSalaFic01: [120, 70, 140] };

async function capturar(p, nome) {
  if (!CAPTURAS) return;
  for (const [tema, esquema] of [['claro', 'light'], ['escuro', 'dark']]) {
    await p.emulateMedia({ colorScheme: esquema });
    await p.waitForTimeout(300);
    await p.screenshot({ path: join(CAPTURAS, `${nome}-${tema}.png`) });
  }
  await p.emulateMedia({ colorScheme: 'light' });
}

async function semRolagemDeLado(p, onde) {
  const [largura, conteudo] = await p.evaluate(() => [innerWidth, document.documentElement.scrollWidth]);
  assert.ok(conteudo <= largura, `${onde}: a página rola para o lado (${conteudo} > ${largura})`);
}

/** Os alvos de toque da agenda e do card aberto, à vista, têm pelo menos 44px. */
async function alvosDe44(p, onde, seletor) {
  const pequenos = await p.evaluate(
    (s) =>
      [...document.querySelectorAll(s)]
        .map((b) => ({ r: b.getBoundingClientRect(), t: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40) }))
        .filter(({ r }) => r.width > 0 && r.bottom > 0 && r.top < innerHeight && (r.width < 44 || r.height < 44))
        .map(({ r, t }) => `${t} (${Math.round(r.width)}×${Math.round(r.height)})`),
    seletor,
  );
  assert.deepEqual(pequenos, [], `${onde}: alvos menores que 44px`);
}

/** Nenhuma imagem quebrada na página: toda <img> à vista carregou, e o pôster que não veio virou a capa com o título. */
async function semImagemQuebrada(p, onde) {
  await p.waitForFunction(() => [...document.querySelectorAll('.agenda-filmes img, .card-aberto img')].every((i) => i.complete), null, { timeout: 10000 });
  const quebradas = await p.evaluate(() => [...document.querySelectorAll('.agenda-filmes img, .card-aberto img')].filter((i) => !i.naturalWidth).length);
  assert.equal(quebradas, 0, `${onde}: imagem quebrada`);
}

/** Arrasta um arquivo pela janela (o dragenter do sistema), sem soltar. */
const arrastarArquivo = (p, tipo) =>
  p.evaluate((t) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['%PDF-1.4'], 'previa.pdf', { type: 'application/pdf' }));
    window.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true }));
  }, tipo);

async function noComputador(navegador, s, video) {
  const ctx = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA },
    permissions: ['clipboard-read', 'clipboard-write'],
    ...(video ? { recordVideo: { dir: video, size: { width: 1440, height: 900 } } } : {}),
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${s.url}#/filmes`);

  // a área de soltar no padrão da fila: o ícone, o título que se escreve, o risco à mão e o "escolher o arquivo"
  const zona = p.locator('.convite-previa');
  await zona.waitFor({ timeout: 30000 });
  assert.equal(await zona.getAttribute('data-soltar-aqui'), '', 'a área de soltar é dela: o soltar da janela (roteiros) fica de fora');
  await zona.locator('.formatos-riscados svg path').waitFor();
  await p.getByRole('button', { name: 'escolher o arquivo' }).waitFor();
  assert.equal(await zona.evaluate((z) => getComputedStyle(z).borderTopStyle), 'dashed', 'a borda tracejada da fila');

  // a agenda chega em cascata, os cartazes sendo colados (#184): o primeiro começa antes dos de depois
  await p.locator('.poster-filme').first().waitFor({ timeout: 15000 });
  const atrasos = await p.locator('.filmes-dias .poster-filme .lambe').evaluateAll((ls) => ls.map((l) => parseFloat(getComputedStyle(l).animationDelay)));
  assert.ok(atrasos.length >= 6, `os pôsteres de hoje em diante (${atrasos.length})`);
  assert.ok(atrasos[0] < atrasos[atrasos.length - 1], 'os pôsteres chegam em cascata');
  // por data (#182): a semana da agenda No Trello, sete colunas a partir de ontem; ontem, com o que passou esmaecido; hoje
  // circulado, com o que passa hoje em destaque
  const colunas = p.locator('.filmes-dias .coluna');
  assert.equal(await colunas.count(), 7, 'a semana: sete dias, de ontem a daqui a 5 dias');
  assert.match(await colunas.nth(0).textContent(), /ontem/);
  assert.match(await colunas.nth(1).textContent(), /hoje/);
  await colunas.nth(1).locator('.dia-num svg').waitFor();
  assert.equal(await colunas.nth(0).getAttribute('class').then((c) => c.includes('passou')), true, 'ontem já passou');
  const passou = colunas.nth(0).locator('.poster-filme', { hasText: 'A Sala Escura' });
  assert.equal(await passou.getAttribute('data-quando'), 'passou');
  assert.ok(Number(await passou.locator('.papel img').evaluate((c) => getComputedStyle(c).opacity)) < 0.8, 'o que passou fica esmaecido');
  assert.equal(await colunas.nth(1).locator('.poster-filme.hoje').count(), 2, 'o que passa hoje, em destaque');
  // o topo da agenda: o período e o resumo que contam, sem o "voltar para hoje" na semana de agora
  assert.match(await p.locator('.agenda-filmes .semana-nav b').textContent(), /\d+.*–.*\d+/);
  assert.match(await p.locator('.agenda-filmes .secao-trello-conta').textContent(), /8 exibições · 2 inéditas/);
  assert.equal(await p.locator('.agenda-filmes .voltar-hoje').count(), 0);
  // o Vidro (pôster do Teable que não vem) e a Noite (sem pôster): a capa com o título, nunca a imagem quebrada
  await p.waitForTimeout(1500);
  await semImagemQuebrada(p, 'computador');
  assert.match(await p.locator('.poster-filme', { hasText: 'A Casa de Vidro' }).locator('.capa-sem-poster').textContent(), /A Casa de Vidro/);
  assert.match(await p.locator('.poster-filme', { hasText: 'Noite Antiga' }).locator('.capa-sem-poster').textContent(), /Noite Antiga/);
  assert.equal(await p.locator('.poster-filme', { hasText: 'Corrida no Gelo' }).first().locator('img.carregou').count(), 1, 'o pôster guardado carrega');
  assert.equal(await p.locator('.poster-filme', { hasText: 'Corrida no Gelo' }).first().locator('.selo').count(), 1, 'o selo de inédito');
  await capturar(p, 'filmes-01-computador');

  // a troca de semana (as setas), como a agenda No Trello: a semana que sai some, a nova chega e os números contam; o
  // "voltar para hoje" abre a vaga e traz de volta
  await p.getByRole('button', { name: 'Próxima semana' }).click();
  await p.locator('.filmes-dias .poster-filme', { hasText: 'Viagem ao Farol' }).waitFor();
  await p.waitForTimeout(900);
  assert.equal(await colunas.count(), 7);
  assert.equal(await p.locator('.filmes-dias .coluna.hoje').count(), 0, 'outra semana, sem o hoje');
  assert.match(await colunas.nth(0).textContent(), /Viagem ao Farol/);
  assert.match(await p.locator('.agenda-filmes .secao-trello-conta').textContent(), /1 exibição/);
  await capturar(p, 'filmes-01b-proxima-semana');
  await p.getByRole('button', { name: 'voltar para hoje' }).click();
  await p.locator('.filmes-dias .coluna.hoje').waitFor();
  await p.waitForTimeout(900);
  assert.match(await colunas.nth(1).textContent(), /hoje/);

  // a busca (#182): a lupa acha pelo sessão, sem acento, em outras semanas também, e mostra como a busca de Produções
  await p.locator('.agenda-filmes .busca.lupa').click();
  await p.keyboard.type('corujao');
  const achados = p.locator('.filmes-busca .prod-achado');
  await achados.first().waitFor();
  await p.waitForTimeout(700);
  assert.match(await p.locator('.filmes-busca h2').textContent(), /3 exibições com.*corujao/);
  assert.deepEqual(await achados.evaluateAll((ls) => ls.map((l) => l.getAttribute('data-quando'))), ['passou', 'vai-passar', 'vai-passar']);
  assert.match(await achados.nth(2).textContent(), /Viagem ao Farol.*2021.*Corujão.*01:40.*vai passar/);
  assert.equal(await p.locator('.agenda-filmes-corpo').isHidden(), true, 'os achados no lugar da agenda');
  await capturar(p, 'filmes-01c-busca');
  // pelo título e pelo ano, sem caixa nem acento
  await p.locator('.agenda-filmes .busca input').fill('GELO 2019');
  await p.waitForTimeout(500);
  assert.equal(await achados.count(), 2);
  // um clique abre o card do filme
  await achados.first().locator('button').click();
  await p.locator('.card-aberto[role=dialog] #ficha-filme-titulo', { hasText: 'Corrida no Gelo' }).waitFor();
  await p.keyboard.press('Escape');
  await p.locator('.card-aberto[role=dialog]').waitFor({ state: 'detached' });
  // o Esc no campo limpa e a agenda volta
  await p.locator('.agenda-filmes .busca input').focus();
  await p.keyboard.press('Escape');
  await p.locator('.filmes-busca').waitFor({ state: 'detached' });
  assert.equal(await p.locator('.agenda-filmes-corpo').isVisible(), true);
  await p.waitForTimeout(500);

  // o lambe-lambe (#184): o muro, o cartaz rasgado e sem dobra, a tarja da data (HOJE em laranja), a fita sem sombra e
  // nenhuma sombra projetada
  const lambe = await p.evaluate(() => {
    const corpo = document.querySelector('.agenda-filmes-corpo');
    const cartaz = document.querySelector('.filmes-dias .coluna.hoje .lambe');
    const papel = cartaz.querySelector('.papel');
    const fitas = [...document.querySelectorAll('.lambe .fita')];
    return {
      muro: corpo.classList.contains('muro') && getComputedStyle(corpo).backgroundImage.includes('url('),
      rasgo: getComputedStyle(papel).clipPath.startsWith('polygon('),
      tarja: cartaz.querySelector('.tarja').textContent,
      tarjaHoje: getComputedStyle(cartaz.querySelector('.tarja')).backgroundColor,
      filtro: getComputedStyle(cartaz).filter,
      fitas: fitas.length,
      sombraNaFita: fitas.some((f) => getComputedStyle(f).boxShadow !== 'none' || getComputedStyle(f).filter !== 'none'),
      restos: document.querySelectorAll('.resto, .orelha').length,
      letra: document.fonts.check('18px "Bebas Neue"'),
    };
  });
  assert.ok(lambe.muro, 'o muro atrás da agenda');
  assert.ok(lambe.rasgo, 'o papel rasgado');
  assert.match(lambe.tarja, /^HOJE · 22:30$/);
  assert.equal(lambe.tarjaHoje, 'rgb(226, 83, 43)', 'HOJE em destaque');
  // os únicos drop-shadow são os contornos de 1,2px da borda do hover (sem desfoque): nenhuma sombra projetada
  const sombras = [...lambe.filtro.matchAll(/(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/g)].map((m) => m.slice(1).map(Number));
  assert.ok(sombras.length && sombras.every(([x, y, desfoque]) => desfoque === 0 && Math.abs(x) <= 1.2 && Math.abs(y) <= 1.2), `sem sombra projetada (${lambe.filtro})`);
  assert.ok(lambe.fitas > 0 && !lambe.sombraNaFita, 'a fita, sem sombra');
  assert.equal(lambe.restos, 0, 'sem dobra e sem restos de cartaz');
  assert.ok(lambe.letra, 'a letra do lambe (Bebas Neue) carregou');
  // nenhum pôster escondido: cada cartaz à vista na semana tem o centro dele por cima de tudo
  const escondidos = await p.evaluate(() =>
    [...document.querySelectorAll('.filmes-dias .lambe')]
      .filter((l) => {
        const r = l.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return false;
        const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !l.contains(e);
      })
      .map((l) => l.getAttribute('aria-label')),
  );
  assert.deepEqual(escondidos, [], 'nenhum pôster escondido');

  // o hover da agenda: só a borda acende, pela silhueta do papel
  const card = p.locator('.poster-filme', { hasText: 'Ponte Sobre o Rio' });
  const borda = () => card.locator('.lambe').evaluate((c) => getComputedStyle(c).filter);
  await p.mouse.move(5, 5);
  await p.waitForTimeout(300);
  const antes = await borda();
  await card.hover();
  await p.waitForTimeout(300);
  assert.notEqual(await borda(), antes, 'o hover acende a borda do cartaz');

  // arrastar um arquivo pela janela: a camada "Pode soltar" da fila, para a prévia (e não a dos roteiros)
  await arrastarArquivo(p, 'dragenter');
  await p.locator('.soltar.da-previa').waitFor({ timeout: 3000 });
  assert.equal(await p.locator('.soltar:not(.da-previa)').count(), 0, 'a camada dos roteiros fica de fora');
  assert.match(await p.locator('.soltar.da-previa').textContent(), /Pode soltar.*PDF da prévia/);
  await p.waitForTimeout(700);
  await capturar(p, 'filmes-02-arrastando');
  await arrastarArquivo(p, 'dragleave');
  await p.locator('.soltar.da-previa').waitFor({ state: 'detached', timeout: 3000 });

  // por sessão: uma faixa por sessão; a escolha fica lembrada (no servidor, por pessoa)
  await p.getByRole('tab', { name: 'por sessão' }).click();
  await p.locator('.faixa-sessao').first().waitFor();
  const faixas = await p.locator('.faixa-sessao h3').evaluateAll((hs) => hs.map((h) => h.firstChild.textContent));
  assert.deepEqual(faixas, ['Sessão da Tarde', 'Tela Quente', 'Corujão', 'Temperatura Máxima', 'Supercine']);
  await p.waitForTimeout(900);
  await capturar(p, 'filmes-03-por-sessao');
  await p.waitForTimeout(400);
  await p.reload();
  await p.locator('.faixa-sessao').first().waitFor({ timeout: 15000 });
  assert.equal(await p.getByRole('tab', { name: 'por sessão' }).getAttribute('aria-selected'), 'true', 'a escolha lembrada depois de recarregar');
  await p.getByRole('tab', { name: 'por data' }).click();
  await p.locator('.filmes-dias').waitFor();
  await p.waitForTimeout(900);

  // o clique abre o card no centro, que cresce do pôster: as exibições, a Produção ligada e o "Copiar caminho"
  const farol = p.locator('.filmes-dias .poster-filme', { hasText: 'Viagem ao Farol' }).first();
  const doPoster = await farol.locator('.poster-filme-capa').boundingBox();
  await farol.locator('.poster-filme-capa').click();
  const painel = p.locator('.card-aberto[role=dialog]');
  await painel.waitFor();
  // a animação de abrir (FLIP) começa do retângulo do pôster: a escala de partida é a do pôster no painel
  const escala = await painel.evaluate((el) => {
    const a = el.getAnimations().find((x) => /scale/.test(String(x.effect.getKeyframes()[0]?.transform ?? '')));
    return a ? Number(/scale\(([\d.]+)/.exec(a.effect.getKeyframes()[0].transform)[1]) : null;
  });
  assert.ok(escala !== null && Math.abs(escala - doPoster.width / 720) < 0.02, `o card cresce a partir do pôster (escala ${escala}, pôster ${Math.round(doPoster.width)}px)`);
  await p.waitForTimeout(500);
  assert.match(await painel.locator('#ficha-filme-titulo').textContent(), /Viagem ao Farol\s*2021/);
  const linhas = painel.locator('.ficha-filme-exibicoes li');
  assert.equal(await linhas.count(), 2);
  assert.match(await linhas.nth(0).textContent(), /hoje.*Sessão da Tarde.*Produzindo.*Rita Campos.*Trello/);
  assert.match(await linhas.nth(1).textContent(), /01:40.*Corujão.*Sem card/);
  await painel.getByRole('button', { name: 'Copiar caminho' }).first().click();
  await painel.getByText('Copiado').waitFor();
  assert.match(await p.evaluate(() => navigator.clipboard.readText()), /FILMES[\\/]VIAGEM AO FAROL \(2021\)$/);
  await semImagemQuebrada(p, 'o card aberto');
  await capturar(p, 'filmes-04-card-aberto');
  await p.keyboard.press('Escape');
  await painel.waitFor({ state: 'detached' });

  // o filme sem pôster, no card aberto: a capa grande com o título
  await p.locator('.filmes-dias .poster-filme', { hasText: 'A Casa de Vidro' }).locator('.poster-filme-capa').click();
  await painel.locator('.ficha-filme-capa .capa-sem-poster').waitFor();
  await p.waitForTimeout(500);
  await capturar(p, 'filmes-05-sem-poster');
  await p.keyboard.press('Escape');
  await painel.waitFor({ state: 'detached' });

  // o movimento reduzido: sem a cascata (e o card só esmaece, no CardAberto)
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.reload();
  await p.locator('.poster-filme').first().waitFor({ timeout: 15000 });
  assert.equal(await p.locator('.poster-filme').first().evaluate((l) => getComputedStyle(l).animationName), 'none', 'sem cascata no movimento reduzido');
  // o cartaz não é colado (nada se mexe) e a cola não passa
  assert.deepEqual(await p.locator('.poster-filme .lambe').first().evaluate((l) => [getComputedStyle(l).animationName, getComputedStyle(l.querySelector('.cola')).display]), ['none', 'none']);
  await capturar(p, 'filmes-09-reduzido');
  await p.emulateMedia({ reducedMotion: 'no-preference' });

  assert.deepEqual(erros, [], 'sem erros na página');
  await ctx.close();
}

/** O vídeo curto: a área de soltar reagindo, a cascata, o hover, a troca de forma e o card crescendo do pôster. */
async function gravarVideo(navegador, s) {
  const pasta = join(CAPTURAS, 'video-tmp');
  mkdirSync(pasta, { recursive: true });
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, recordVideo: { dir: pasta, size: { width: 1280, height: 800 } } });
  const p = await ctx.newPage();
  await p.goto(`${s.url}#/filmes`);
  await p.locator('.poster-filme').first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(1800);
  await p.mouse.move(640, 200);
  await arrastarArquivo(p, 'dragenter');
  await p.waitForTimeout(1600);
  await arrastarArquivo(p, 'dragleave');
  await p.waitForTimeout(500);
  for (const t of ['Corrida no Gelo', 'Ponte Sobre o Rio', 'A Sala Escura']) {
    await p.locator('.poster-filme', { hasText: t }).first().hover();
    await p.waitForTimeout(450);
  }
  await p.locator('.agenda-filmes').evaluate((a) => a.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await p.waitForTimeout(900);
  await p.getByRole('button', { name: 'Próxima semana' }).click();
  await p.waitForTimeout(1300);
  await p.getByRole('button', { name: 'voltar para hoje' }).click();
  await p.waitForTimeout(1300);
  await p.getByRole('button', { name: 'Semana anterior' }).click();
  await p.waitForTimeout(1300);
  await p.getByRole('button', { name: 'Próxima semana' }).click();
  await p.waitForTimeout(1300);
  await p.locator('.agenda-filmes .busca.lupa').click();
  await p.keyboard.type('corujao', { delay: 110 });
  await p.waitForTimeout(1500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(1000);
  await p.getByRole('tab', { name: 'por sessão' }).click();
  await p.waitForTimeout(1600);
  await p.getByRole('tab', { name: 'por data' }).click();
  await p.waitForTimeout(1400);
  await p.locator('.filmes-dias .poster-filme', { hasText: 'Viagem ao Farol' }).first().locator('.poster-filme-capa').click();
  await p.waitForTimeout(1800);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(900);
  await p.locator('.filmes-dias .poster-filme', { hasText: 'Noite Antiga' }).locator('.poster-filme-capa').click();
  await p.waitForTimeout(1500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
  await ctx.close();
  const [arquivo] = readdirSync(pasta);
  if (arquivo) renameSync(join(pasta, arquivo), join(CAPTURAS, 'filmes-video.webm'));
}

async function noCelular(navegador, s) {
  const ctx = await navegador.newContext({ ...devices['iPhone 13'], extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${s.url}#/filmes`);
  await p.getByRole('button', { name: 'Subir prévia' }).waitFor({ timeout: 30000 });
  await p.locator('.poster-filme').first().waitFor({ timeout: 15000 });
  await p.locator('.agenda-filmes').scrollIntoViewIfNeeded();
  await p.waitForTimeout(1500);
  await semRolagemDeLado(p, 'celular, a agenda por data');
  await alvosDe44(p, 'celular, a agenda', '.agenda-filmes button');
  await semImagemQuebrada(p, 'celular');
  await capturar(p, 'filmes-06-celular');
  await p.getByRole('tab', { name: 'por sessão' }).tap();
  await p.locator('.faixa-sessao').first().waitFor();
  await p.waitForTimeout(1000);
  await semRolagemDeLado(p, 'celular, a agenda por sessão');
  await capturar(p, 'filmes-07-celular-por-sessao');
  await p.locator('.faixa-sessao .poster-filme', { hasText: 'Viagem ao Farol' }).first().locator('.poster-filme-capa').tap();
  const painel = p.locator('.card-aberto[role=dialog]');
  await painel.waitFor();
  await p.waitForTimeout(600);
  const r = await painel.boundingBox();
  assert.ok(r.width >= 389 && r.height >= 600, 'no celular, o card aberto ocupa a tela toda');
  await alvosDe44(p, 'celular, o card aberto', '.card-aberto button');
  await capturar(p, 'filmes-08-celular-card');
  // volta a forma por data para a próxima vez
  await painel.getByRole('button', { name: 'Fechar o filme' }).tap();
  await painel.waitFor({ state: 'detached' });
  await p.getByRole('tab', { name: 'por data' }).tap();
  await p.waitForTimeout(400);
  assert.deepEqual(erros, [], 'sem erros na página (celular)');
  await ctx.close();
}

(async () => {
  if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  const pasta = mkdtempSync(join(tmpdir(), 'promeiro-e2e-agenda-de-filmes-'));
  const { criarFilmes } = await import(join(RAIZ, 'servidor', 'filmes.mjs'));
  const { teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const s = await subir({ env: ENV, trello: { viva: true, env: ENV, consultar }, teable: teableFalso(NO_POSTGRES, { base: 'bse_teste' }), filmes: (env, deps) => criarFilmes(env, { ...deps, pasta, consultar }) });
  // os pôsteres guardados pelo PROMeiro (os da prévia) e a Produção do card do Farol
  const agora = new Date().toISOString();
  for (const [rec, cor] of Object.entries(POSTERES))
    s.db.prepare("INSERT INTO anexos (id, tipo, chave, nome, mime, dados, origem, em, conferido_em) VALUES (?, 'poster', ?, ?, 'image/png', ?, 'previa', ?, ?)").run(`poster-${rec}`, rec, `${rec}.png`, png(200, 300, cor), agora, agora);
  s.db
    .prepare("INSERT INTO producoes (id, claquete, etapa, designers, card_id, entrada_em, arquivada, criada_em, atualizada_em) VALUES ('prod-farol', 'FILME VIAGEM AO FAROL', 'produzindo', ?, 'cardFicFarol1', ?, 0, ?, ?)")
    .run(JSON.stringify(['Rita Campos']), agora, agora, agora);
  const navegador = await chromium.launch();
  try {
    await noComputador(navegador, s);
    await noCelular(navegador, s);
    if (CAPTURAS) await gravarVideo(navegador, s);
    console.log('ok: a aba Filmes (#169), no computador e no celular');
  } finally {
    await navegador.close();
    await s.descer();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
