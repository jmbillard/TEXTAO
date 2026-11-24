// Ponta a ponta do tour da revisão (spec #33, #36), rodado à parte do vitest: `npm run e2e:tour`.
//
// Sobe o servidor do PROMeiro e o Vite com um banco temporário e dados fictícios, faz o tour inteiro clicando como a
// pessoa faria e confere que nenhum pedido saiu para salvar roteiro nem para o Trello, que no fim o exemplo não está
// na fila nem na agenda, que o servidor guardou o tour como visto e que "Fazer o tour" recomeça e funciona de novo.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:tour
// O e-mail da pessoa vai no cabeçalho do Access, injetado pelo próprio servidor de teste (inclusive no WebSocket, que
// o navegador do Playwright abre sem os cabeçalhos extras). Nada sai para a rede: o Trello e o Teable ficam desligados.
const { createServer } = require('node:http');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const net = require('node:net');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:tour');
  process.exit(2);
}

const RAIZ = join(__dirname, '..', '..');
const ID = 'tour-revisao-exemplo';
const LIA = 'lia.moraes@exemplo.com';
const OUTRA = 'outra.pessoa@exemplo.com';
const VOCAB = {
  programas: [{ nome: 'Festival de Exemplo', chaves: ['EXEMPLO_FESTIVAL'], categoria: 'variedades' }, { nome: 'Programa Fictício', chaves: ['CHAMADA'], categoria: 'variedades' }],
  redatores: ['Redator Fictício'],
  editores: ['Bruno Teixeira', 'Carla Nunes', 'Diego Ramos'],
  pauta: [],
};

const portaLivre = () =>
  new Promise((ok, erro) => {
    const s = net.createServer().once('error', erro);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diaMais = (n) => {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), h.getDate() + n);
};

/** Sobe o servidor (banco temporário) e o Vite; devolve os endereços e como derrubar tudo. */
async function subir() {
  const pasta = mkdtempSync(join(tmpdir(), 'promeiro-e2e-'));
  const { abrirBanco, criarApp } = await import(join(RAIZ, 'servidor', 'app.mjs'));
  const { criarTrello } = await import(join(RAIZ, 'servidor', 'trello.mjs'));
  const semRede = async (url) => {
    throw new Error(`o teste não sai para a rede: ${url}`);
  };
  const env = {};
  const trello = criarTrello(env, { buscar: semRede, consultar: async () => [], sftp: async () => {} });
  const db = abrirBanco(join(pasta, 'roteirista.db'));
  const app = criarApp({ db, env, trello });
  const comLia = (req) => {
    if (!req.headers['cf-access-authenticated-user-email']) req.headers['cf-access-authenticated-user-email'] = LIA;
  };
  const servidor = createServer((req, res) => (comLia(req), app(req, res)));
  servidor.on('upgrade', (req, socket, head) => (comLia(req), app.upgrade(req, socket, head)));
  const portaApi = await portaLivre();
  await new Promise((ok) => servidor.listen(portaApi, ok));

  const { createServer: criarVite } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const portaVite = await portaLivre();
  const vite = await criarVite({
    configFile: false,
    root: RAIZ,
    logLevel: 'silent',
    cacheDir: join(pasta, 'vite'),
    plugins: [react()],
    server: { port: portaVite, strictPort: true, proxy: { '/api': { target: `http://localhost:${portaApi}`, ws: true } } },
  });
  await vite.listen();
  const api = `http://localhost:${portaApi}/api`;
  return {
    url: `http://localhost:${portaVite}/`,
    api,
    async descer() {
      await vite.close();
      await new Promise((ok) => servidor.close(ok));
      servidor.closeAllConnections?.();
      db.close?.();
      rmSync(pasta, { recursive: true, force: true });
    },
  };
}

/** A agenda No Trello da semana, com cards fictícios de outra pessoa (de ontem a daqui a 5 dias). */
async function semear(api) {
  const h = (email) => ({ 'content-type': 'application/json', 'cf-access-authenticated-user-email': email });
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LOC: ' }, { type: 'text', text: 'HOJE', marks: [{ type: 'arte', attrs: { id: 'a0', subtipo: '', sugerido: false } }] }] }] };
  const nomes = ['CHAMADA_DOMINGO', 'TEASER_NOVELA', 'CHAMADA_SERIE', 'CHAMADA_REALITY', 'CHAMADA_FILME', 'CHAMADA_SHOW', 'CHAMADA_HUMOR'];
  for (let i = 0; i < nomes.length; i++) {
    const d = diaMais(i - 1);
    const id = `cardficticio${i}`;
    const claquete = `${nomes[i]}_${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const agora = new Date().toISOString();
    const meta = { claquete, titulo: claquete, programa: 'Programa Fictício', tipoPrograma: 'variedades', dataExibicao: isoLocal(d), capitulo: null, edicao: '', praca: 'RJ', redator: 'Redator Fictício', editor: 'Bruno Teixeira', locutor: '', selo: '', duracaoAlvoSeg: 30, duracaoModo: 'fechar', layout: 'padrao', status: 'rascunho' };
    const r = await fetch(`${api}/roteiros/${id}`, { method: 'PUT', headers: h(OUTRA), body: JSON.stringify({ roteiro: { id, meta, doc, revisao: 1, criadoEm: agora, atualizadoEm: agora, publico: true }, nArtes: 1 }) });
    if (!r.ok) throw new Error(`semear ${id}: ${r.status} ${await r.text()}`);
    const t = await fetch(`${api}/roteiros/${id}/trello`, { method: 'POST', headers: h(OUTRA), body: JSON.stringify({ jaEsta: { card: `cardficticio${i}` } }) });
    if (!t.ok) throw new Error(`semear ${id} no Trello: ${t.status} ${await t.text()}`);
  }
}

/** O contexto do navegador como a Lia, com o vocabulário fictício (a lista de editores do passo da ficha). */
async function contexto(navegador, url, opcoes = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1680, height: 1050 }, extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, ...opcoes });
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  const p = await ctx.newPage();
  // o que não pode sair: salvar roteiro e qualquer pedido ao Trello
  const proibidos = [];
  p.on('request', (r) => {
    const u = new URL(r.url());
    if ((u.pathname.startsWith('/api/roteiros') && r.method() === 'PUT') || /\/trello/.test(u.pathname) || u.pathname.includes(ID)) proibidos.push(`${r.method()} ${u.pathname}`);
  });
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(url);
  return { ctx, p, proibidos, erros };
}

const balaoPronto = (p) => p.waitForSelector('.tour:not(.esperando) .tour-balao', { timeout: 15000 });
const noPasso = async (p, n) => {
  await p.waitForFunction((x) => document.querySelector('.tour-prog')?.textContent === x, `${n}/7`, { timeout: 15000 });
  await balaoPronto(p);
};

/**
 * O tour inteiro, do passo chegar ao Terminar, clicando como a pessoa. `aoChegar(nome)` é chamado com o tour parado em
 * cada tela que interessa às capturas ("enviar", "no-trello", "fim").
 */
async function fazerOTour(p, aoChegar = async () => {}) {
  await noPasso(p, 1);
  await p.click('.convite-compacto-acoes .botao:not(.primario)');
  await noPasso(p, 2);
  await p.click(`.ficha[data-ancora="ficha:${ID}"] .ficha-acoes .botao`);
  await noPasso(p, 3);
  await p.click('.pendencias-editor li .botao-texto');
  await p.waitForSelector('.escolha-nome-menu li:has-text("Carla Nunes")');
  await balaoPronto(p);
  await p.click('.escolha-nome-menu li:has-text("Carla Nunes")');
  await noPasso(p, 4);
  await p.locator('ol.artes li', { hasText: 'LOGO DO FESTIVAL' }).locator('.b').click();
  await noPasso(p, 5);
  const fogo = p.locator('ol.artes li', { hasText: 'MAPA ANIMADO' }).locator('.cx');
  await fogo.click();
  await p.waitForFunction(() => document.querySelector('.tour-texto')?.textContent === 'Mais um clique.', null, { timeout: 15000 });
  await balaoPronto(p);
  await fogo.click();

  // passo 6, enviar: "Mandando…" e a volta para a fila
  await noPasso(p, 6);
  await aoChegar('enviar');
  await p.click('.acao-principal .botao.primario');
  await p.waitForFunction(() => document.querySelector('.acao-principal .botao.primario')?.textContent?.includes('Mandando…'), null, { timeout: 5000 });
  await aoChegar('mandando');

  // passo 7, no Trello: o card do exemplo na agenda, só de exemplo
  await noPasso(p, 7);
  const card = p.locator(`.secao-trello [data-card="${ID}"]`);
  if (!(await card.locator('.nota-exemplo').textContent())?.includes('só de exemplo')) throw new Error('o card do exemplo não está marcado "só de exemplo"');
  if (await p.$(`.ficha[data-ancora="ficha:${ID}"]`)) throw new Error('o exemplo enviado continua na fila');
  await aoChegar('no-trello');
  await p.click('.tour-balao .botao.primario:has-text("Terminar")');

  // o fim: a despedida aparece e some sozinha
  await p.waitForFunction(() => document.querySelector('.tour-etapa')?.textContent === 'pronto!', null, { timeout: 5000 });
  await balaoPronto(p);
  await aoChegar('fim');
  await p.waitForFunction(() => !document.querySelector('.tour'), null, { timeout: 8000 });
  // a vaga terminou de fechar
  await p.waitForTimeout(500);
  if (await p.$(`[data-card="${ID}"], .ficha[data-ancora="ficha:${ID}"]`)) throw new Error('no fim, o exemplo continua na fila ou na agenda');
}

async function tourVisto(api) {
  const r = await fetch(`${api}/eu`, { headers: { 'cf-access-authenticated-user-email': LIA } });
  return (await r.json()).tour?.revisao ?? null;
}

async function principal() {
  const amb = await subir();
  const navegador = await chromium.launch();
  let falhou = false;
  const conferir = (ok, oque) => {
    console.log(`${ok ? 'ok  ' : 'FALHOU'} ${oque}`);
    if (!ok) falhou = true;
  };
  try {
    await semear(amb.api);
    conferir((await tourVisto(amb.api)) === null, 'antes: o servidor diz que a Lia não viu o tour');
    const { ctx, p, proibidos, erros } = await contexto(navegador, amb.url);
    await balaoPronto(p);
    await p.click('.tour-balao .botao.primario:has-text("Começar")');
    await fazerOTour(p);
    conferir(true, 'o tour inteiro, do chegar ao Terminar, e a despedida que some sozinha');
    conferir(!(await p.$(`[data-card="${ID}"], .ficha[data-ancora="ficha:${ID}"]`)), 'no fim, o exemplo não está na fila nem na agenda');
    conferir((await tourVisto(amb.api)) !== null, 'o servidor guardou o tour como visto (/api/eu)');

    // "Fazer o tour" no cartão de atalhos: recomeça na tela e funciona de novo
    await p.click('.botao-atalhos');
    await p.click('.atalhos-pe .botao-texto:has-text("Fazer o tour")');
    await noPasso(p, 1);
    conferir(true, '"Fazer o tour" recomeça no passo 1');
    await fazerOTour(p);
    conferir(true, 'recomeçado, o tour vai de novo até o fim');

    // recarregado, o convite não volta (o servidor guardou)
    await p.reload();
    await p.waitForSelector('.convite-compacto, .fila-vazia');
    await p.waitForTimeout(800);
    conferir(!(await p.$('.tour')), 'recarregada a página, o convite não volta');

    conferir(proibidos.length === 0, `nenhum pedido de salvar roteiro nem ao Trello${proibidos.length ? `: ${proibidos.join(', ')}` : ''}`);
    conferir(erros.length === 0, `nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`);
    await ctx.close();
  } catch (e) {
    conferir(false, e instanceof Error ? e.message : String(e));
  } finally {
    await navegador.close();
    await amb.descer();
  }
  process.exit(falhou ? 1 : 0);
}

module.exports = { subir, semear, contexto, fazerOTour, balaoPronto, noPasso };
if (require.main === module) void principal();
