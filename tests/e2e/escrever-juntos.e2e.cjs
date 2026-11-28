// Ponta a ponta do escrever junto ao vivo no Roteiro sendo escrito (#191), rodado à parte do vitest:
// `npm run e2e:escrever-juntos`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros sobre um Teable
// falso. A Marina (redatora, a autora) e a Bia (coordenação) abrem o mesmo roteiro, cada uma no seu navegador: cada uma
// vê a outra na barra de cima ("Bia também está aqui") e o cursor com o nome da outra na folha. As duas escrevem ao
// mesmo tempo, em trechos diferentes: nenhuma perde texto, e o título que a Marina dá chega à Bia. O Davi (designer)
// abre o mesmo roteiro: recebe ao vivo o que a Marina escreve, mas a folha não aceita o que ele digita. A Bia recarrega
// no meio da escrita da Marina, e depois a Marina recarrega: a folha volta sem travar e sem duplicar o texto. No fim, o
// que se lê do roteiro pelo servidor é o texto das duas. Claro e escuro, sem "unha" e sem ✓ verde.
//
// Nomes e e-mails fictícios. Precisa do Playwright com o Chromium, instalado globalmente:
// NODE_PATH=$(npm root -g) npm run e2e:escrever-juntos
// Com CAPTURAS=pasta, grava as capturas (densidade 2) e o vídeo dos dois navegadores.
const assert = require('node:assert/strict');
const { mkdirSync, renameSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');
const { checksVerdes } = require('./coerencia.cjs');
const RAIZ = join(__dirname, '..', '..');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:escrever-juntos');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const MARINA = 'marina.teles@exemplo.com';
const BIA = 'bia.prado@exemplo.com';
const DAVI = 'davi.rocha@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };
const ID = 'escrever-juntos-1';

const ENV_CADASTROS = { TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'falso', TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi' };
const TABELAS = { tblRed: [{ id: 'recR1', fields: { redator: 'Marina Teles', email: MARINA } }], tblKeyRed: [], tblEdi: [], tblKeyEdi: [] };
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  if (u.host !== 'teable-falso' || (init.method ?? 'GET') !== 'GET') throw new Error(`o teste não sai para a rede: ${url}`);
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(u.pathname);
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
}

async function abrir(navegador, url, email, tema, nomeDoVideo) {
  const video = CAPTURAS && nomeDoVideo ? { recordVideo: { dir: join(CAPTURAS, 'video'), size: { width: 1100, height: 760 } } } : {};
  const ctx = await navegador.newContext({ viewport: { width: 1100, height: 760 }, colorScheme: tema, extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...video });
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
/** A folha chegou da sala (sem o "Abrindo o roteiro…"). */
const liberada = (p) => p.waitForSelector('.folha-escrita:not(.chegando)', { timeout: 15000 });
const salvou = (p) => p.waitForSelector('.escrita-salvo[data-salvamento="salvo"]', { timeout: 8000 });
/** Os trechos da folha, sem os cursores dos colegas (o nome deles fica dentro do texto). */
const trechos = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('.texto-escrita > p')].map((el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll('.collaboration-cursor__caret').forEach((x) => x.remove());
      return c.textContent;
    }),
  );
const esperarTrechos = async (p, esperado, oQue) => {
  try {
    await p.waitForFunction(
      (e) => JSON.stringify([...document.querySelectorAll('.texto-escrita > p')].map((el) => {
        const c = el.cloneNode(true);
        c.querySelectorAll('.collaboration-cursor__caret').forEach((x) => x.remove());
        return c.textContent;
      })) === JSON.stringify(e),
      esperado,
      { timeout: 8000 },
    );
  } catch {
    assert.fail(`${oQue}: esperava ${JSON.stringify(esperado)}, está ${JSON.stringify(await trechos(p))}`);
  }
};
/** Põe o cursor no fim do trecho n (0 é o primeiro; -1, o último). */
const noFimDo = async (p, n) => {
  await p.evaluate((i) => {
    const ps = [...document.querySelectorAll('.texto-escrita > p')];
    const alvo = ps.at(i);
    const sel = getSelection();
    const r = document.createRange();
    r.selectNodeContents(alvo);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    alvo.closest('.texto-escrita').focus();
  }, n);
};
async function semUnha(p, onde) {
  const unhas = await p.evaluate(() =>
    [...document.querySelectorAll('.folha-escrita *, .escrita-barra *, .folha-escrita')].filter((e) => {
      if (e.closest('.collaboration-cursor__caret')) return false; // o cursor do colega é a barra fina do texto, não um item
      const c = getComputedStyle(e);
      const borda = parseFloat(c.borderLeftWidth) >= 3 && c.borderLeftStyle !== 'none' && c.borderLeftColor !== c.borderTopColor;
      const sombra = /inset\s+([3-9]|\d{2,})px\s+0/.test(c.boxShadow);
      return borda || sombra;
    }).map((e) => e.className),
  );
  assert.deepEqual(unhas, [], `${onde}: nada de unha`);
}
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
};
const fechar = async ({ ctx, p, nomeDoVideo }) => {
  const caminho = await p.video()?.path();
  await ctx.close();
  if (caminho && nomeDoVideo) renameSync(caminho, join(CAPTURAS, `${nomeDoVideo}.webm`));
};

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: LIA }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: LIA } });
  const como = (email) => (caminho, init = {}) => fetch(`${s.api}${caminho}`, { ...init, headers: { 'content-type': 'application/json', 'cf-access-authenticated-user-email': email, ...init.headers } });
  for (const email of [LIA, MARINA, BIA, DAVI]) await como(email)('/eu/tour', { method: 'POST' });
  assert.equal((await como(LIA)('/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: BIA }) })).status, 200);
  assert.equal((await como(MARINA)('/roteiros-escritos', { method: 'POST', body: JSON.stringify({ id: ID }) })).status, 201);

  const navegador = await chromium.launch();
  try {
    // a Marina abre primeiro (é dela a vez de preencher a sala) e recarrega logo: a folha não trava
    const marina = await abrir(navegador, s.url, MARINA, 'light', 'escrever-juntos-marina');
    await marina.p.reload();
    await liberada(marina.p);
    await marina.p.waitForFunction(() => document.activeElement?.closest('.texto-escrita') !== null);
    assert.equal(await marina.p.locator('.texto-escrita').getAttribute('contenteditable'), 'true');
    await marina.p.keyboard.type('NESTE SÁBADO, A BRASA DECIDE.', { delay: 15 });
    await salvou(marina.p);
    console.log('ok: a autora abre, recarrega e escreve sem travar');

    // a Bia chega: cada uma vê a outra na barra de cima
    const bia = await abrir(navegador, s.url, BIA, 'dark', 'escrever-juntos-bia');
    await esperarTrechos(bia.p, ['NESTE SÁBADO, A BRASA DECIDE.'], 'a Bia recebe o texto da Marina');
    await marina.p.locator('.escrita-presentes', { hasText: 'Bia também está aqui' }).waitFor();
    await bia.p.locator('.escrita-presentes', { hasText: 'Marina também está aqui' }).waitFor();
    assert.equal(await bia.p.locator('.escrita-so-lendo').count(), 0, 'a coordenação escreve');
    console.log('ok: cada uma vê a outra na barra de cima');

    // o título que a Marina dá chega à Bia
    await marina.p.click('.folha-escrita-titulo');
    await marina.p.keyboard.type('Desafio da Brasa, a final', { delay: 15 });
    await bia.p.waitForFunction(() => document.querySelector('.folha-escrita-titulo')?.value === 'Desafio da Brasa, a final', null, { timeout: 8000 });

    // as duas escrevem ao mesmo tempo, em trechos diferentes
    await noFimDo(marina.p, -1);
    await marina.p.keyboard.press('Enter');
    await marina.p.keyboard.type('Dona Zélia, de Pelotas:', { delay: 10 });
    await noFimDo(bia.p, 0);
    await bia.p.keyboard.press('Enter');
    await Promise.all([
      marina.p.keyboard.type(' aqui ninguém leva carne crua pra casa.', { delay: 25 }),
      bia.p.keyboard.type('TRILHA: sobe a batida.', { delay: 25 }),
    ]);
    const juntas = ['NESTE SÁBADO, A BRASA DECIDE.', 'TRILHA: sobe a batida.', 'Dona Zélia, de Pelotas: aqui ninguém leva carne crua pra casa.'];
    await esperarTrechos(marina.p, juntas, 'na folha da Marina');
    await esperarTrechos(bia.p, juntas, 'na folha da Bia');
    console.log('ok: as duas escrevem ao mesmo tempo sem perder texto');

    // o cursor de cada uma, com o nome, na folha da outra
    await marina.p.locator('.collaboration-cursor__label', { hasText: 'Bia Prado' }).waitFor();
    await bia.p.locator('.collaboration-cursor__label', { hasText: 'Marina Teles' }).waitFor();
    await Promise.all([salvou(marina.p), salvou(bia.p)]);
    for (const [quem, onde] of [[marina, 'a folha da Marina (claro)'], [bia, 'a folha da Bia (escuro)']]) {
      assert.deepEqual(await checksVerdes(quem.p), [], `${onde}: nada de ✓ verde`);
      await semUnha(quem.p, onde);
    }
    await capturar(marina.p, '01-juntas-marina-claro');
    await capturar(bia.p, '02-juntas-bia-escuro');
    console.log('ok: os cursores com o nome e a presença no topo, sem unha e sem ✓ verde');

    // o Davi (designer) recebe ao vivo, mas não altera
    const davi = await abrir(navegador, s.url, DAVI, 'light');
    await esperarTrechos(davi.p, juntas, 'o Davi recebe o texto');
    await davi.p.waitForSelector('.escrita-so-lendo');
    assert.equal(await davi.p.locator('.texto-escrita').getAttribute('contenteditable'), 'false');
    await marina.p.locator('.escrita-presentes', { hasText: 'mais 2 aqui' }).waitFor();
    await noFimDo(marina.p, -1);
    await marina.p.keyboard.type(' Só no sábado.', { delay: 10 });
    const comMais = [...juntas.slice(0, 2), `${juntas[2]} Só no sábado.`];
    await esperarTrechos(davi.p, comMais, 'o Davi recebe ao vivo');
    await davi.p.click('.texto-escrita');
    await davi.p.keyboard.type('POR CIMA');
    await davi.p.keyboard.press('Enter');
    await davi.p.waitForTimeout(600);
    await esperarTrechos(marina.p, comMais, 'o que o Davi digita não chega à Marina');
    await esperarTrechos(davi.p, comMais, 'nem fica na folha do Davi');
    await davi.p.evaluate(() => scrollTo(0, 0));
    await capturar(davi.p, '03-davi-so-lendo-ao-vivo');
    assert.deepEqual(davi.erros, []);
    await davi.ctx.close();
    console.log('ok: quem só comenta recebe ao vivo e não altera');

    // a Bia recarrega no meio da escrita da Marina: volta sem duplicar
    await noFimDo(marina.p, 0);
    const digitando = marina.p.keyboard.type(' A FINAL É AO VIVO.', { delay: 40 });
    await bia.p.waitForTimeout(200);
    await bia.p.reload();
    await digitando;
    await liberada(bia.p);
    const depois = [`${juntas[0]} A FINAL É AO VIVO.`, ...comMais.slice(1)];
    await esperarTrechos(bia.p, depois, 'a Bia depois de recarregar');
    await esperarTrechos(marina.p, depois, 'a Marina enquanto a Bia recarregava');
    // e a Marina recarrega também
    await salvou(marina.p);
    await marina.p.reload();
    await liberada(marina.p);
    await esperarTrechos(marina.p, depois, 'a Marina depois de recarregar');
    assert.equal(await marina.p.locator('.folha-escrita-titulo').inputValue(), 'Desafio da Brasa, a final');
    await noFimDo(marina.p, -1);
    await marina.p.keyboard.type(' Fim.', { delay: 10 });
    const fim = [...depois.slice(0, 2), `${depois[2]} Fim.`];
    await esperarTrechos(bia.p, fim, 'escrever depois de recarregar chega à Bia');
    await Promise.all([salvou(marina.p), salvou(bia.p)]);
    await capturar(marina.p, '04-depois-de-recarregar-marina');
    console.log('ok: recarregar no meio não trava nem duplica');

    assert.deepEqual(marina.erros, []);
    assert.deepEqual(bia.erros, []);
    await fechar(marina);
    await fechar(bia);
    // fechada a sala, o roteiro guardado é o texto das duas
    await new Promise((ok) => setTimeout(ok, 500));
    const lido = await (await como(MARINA)(`/roteiros/${ID}`)).json();
    assert.deepEqual(lido.doc.content.map((p) => (p.content ?? []).map((t) => t.text).join('')), fim);
    assert.equal(lido.meta.titulo, 'Desafio da Brasa, a final');
    assert.equal(lido.meta.status, 'rascunho');
    console.log('ok: o roteiro guardado é o texto das duas');
  } finally {
    await navegador.close();
    await s.descer();
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
