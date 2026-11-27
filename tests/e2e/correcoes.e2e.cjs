// Ponta a ponta da Correção de grafia (#114), rodado à parte do vitest: `npm run e2e:correcoes`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o Teable falso
// (tests/fixtures/teable-falso.mjs): a tabela EDICAO_producao achada pelo nome e o Postgres dele respondendo a pauta
// inteira, fictícia, de vários meses. No computador, claro e escuro: o item "Correção de grafia" no menu do perfil,
// junto de Cadastros e Configuração; o endereço próprio; o resumo no topo; as claquetes fora do padrão "de → para",
// com o dia e o editor e o código destacado; os códigos que a pauta não reconhece, à parte; nada é gravado no Teable.
// As páginas: com mais propostas do que cabem, "Próximas" pede a página seguinte. Quem não é administrador não vê o
// item nem abre a página. No celular, claro e escuro: só mostra, cada linha um cartão, sem rolar para o lado.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:correcoes
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:correcoes');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const OUTRA = 'bruno.teixeira@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

/** Uma linha da pauta (fictícia): a claquete, o editor ou null, o dia (AAAA-MM-DD) e a caixinha de anotação. */
let n = 0;
function linha(claquete, editor, dia, anotacao = null) {
  n += 1;
  const meiaNoite = new Date(`${dia}T00:00:00-03:00`).toISOString();
  return {
    id: `recCorrecaoE2e${n}`,
    fields: { claquete, key: claquete.toUpperCase(), editor: editor ? { id: `rec${editor.replace(/\W/g, '')}`, title: editor } : null, data: meiaNoite, expediente_inicio: meiaNoite, expediente_fim: null, anotacao, alterado_em: meiaNoite },
  };
}
const PAUTA = [
  // fora do padrão: minúsculas sem parênteses, o código inteiro, a letra solta
  linha('Jogo Final 4/12 Dp', 'Bruno Teixeira', '2026-11-27'),
  linha('Festival 3/1 (MÊS)', 'Ana Ribeiro', '2025-12-20'),
  linha('Novela Sol 28/9 H', null, '2025-09-27'),
  // no padrão, sem código, a praça no fim, a tarefa: nada a corrigir
  linha('Novela Sol 28/11 (AH)', 'Ana Ribeiro', '2026-11-27'),
  linha('Grade da Noite 28/11 (MNT)', 'Carla Duarte', '2026-11-27'),
  linha('Quem Ama 20/11 SP', 'Carla Duarte', '2026-11-19'),
  linha('COMUNICAÇÃO', 'Carla Duarte', '2026-11-19'),
  linha('CALHAUS (VER LISTA)', null, '2026-11-19'),
  // o aviso é um recado: não é corrigido
  linha('Trocar a grade (ah)', 'Carla Duarte', '2026-11-27', true),
  // o código desconhecido
  linha('Show Extra 28/11 (XYZ)', 'Bruno Teixeira', '2026-11-27'),
];

async function abrir(navegador, url, opcoes, { email = LIA, hash = '#/correcoes' } = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(email), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}${hash}`);
  return { ctx, p, erros };
}
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
const fundoEscuro = (p) =>
  p.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return r + g + b < 200;
  });
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: true });
};
const textos = async (l) => (await l.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
const grupo = (p, g) => p.locator(`.cor-secao[data-grupo="${g}"]`);
const linhaDe = (p, id) => p.locator(`.cor-tabela tr[data-id="${id}"]`);

async function noComputador(navegador, url, teable, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema }, { hash: '' });
  assert.equal(await fundoEscuro(p), tema === 'dark');

  // o item no menu do perfil, junto de Cadastros e Configuração
  await p.locator('.perfil-botao').click();
  const itens = await textos(p.locator('.perfil-painel .perfil-link'));
  const i = itens.findIndex((t) => t.startsWith('Correção de grafia'));
  assert.ok(i > 0 && itens.slice(0, i).some((t) => t.startsWith('Configuração')) && itens.some((t) => t.startsWith('Cadastros')), `Correção de grafia junto de Cadastros e Configuração: ${itens.join(' | ')}`);
  await p.locator('.perfil-painel .perfil-link', { hasText: 'Correção de grafia' }).click();
  await grupo(p, 'corrigir').locator('.cor-tabela').waitFor();
  assert.equal(new URL(p.url()).hash, '#/correcoes');
  assert.equal((await p.locator('.cfg-cabeca h1').textContent()).trim(), 'Correção de grafia');

  // o resumo no topo
  assert.equal((await p.locator('.cor-resumo').textContent()).replace(/\s+/g, ' ').trim(), '3 propostas de correção na pauta da edição e 1 código não reconhecido.');

  // "de → para", com o dia e o editor; a mais recente primeiro; só o código muda
  const corrigir = grupo(p, 'corrigir');
  assert.deepEqual(await textos(corrigir.locator('.cor-tabela tbody tr .cor-de-para')), ['Jogo Final 4/12 Dp → Jogo Final 4/12 (DP)', 'Festival 3/1 (MÊS) → Festival 3/1 (M)', 'Novela Sol 28/9 H → Novela Sol 28/9 (H)']);
  const jogo = corrigir.locator('.cor-tabela tbody tr').first();
  assert.match(await jogo.locator('.cor-dia').textContent(), /27\/11\/2026/);
  assert.equal((await jogo.locator('.cor-editor').textContent()).trim(), 'Bruno Teixeira');
  assert.deepEqual(await textos(jogo.locator('mark')), ['Dp', '(DP)']);
  assert.deepEqual(await textos(corrigir.locator('.cor-tabela tbody tr').last().locator('.cor-editor')), ['sem editor']);
  // o que sai fica riscado; o que entra, não
  assert.match(await jogo.locator('mark.cor-antes').evaluate((e) => getComputedStyle(e).textDecorationLine), /line-through/);
  assert.doesNotMatch(await jogo.locator('mark.cor-depois').evaluate((e) => getComputedStyle(e).textDecorationLine), /line-through/);
  assert.equal(await corrigir.locator('.cor-paginas').count(), 0, 'cabe numa página: sem as páginas');

  // os códigos desconhecidos, à parte, sem correção
  const naoReconhecido = grupo(p, 'nao-reconhecido');
  assert.equal((await naoReconhecido.locator('h2').textContent()).trim(), 'Não reconhecido');
  assert.deepEqual(await textos(naoReconhecido.locator('.cor-tabela tbody tr .cor-de-para')), ['Show Extra 28/11 (XYZ)']);
  assert.deepEqual(await textos(naoReconhecido.locator('mark.cor-desconhecido')), ['(XYZ)']);
  assert.equal(await naoReconhecido.locator('.cor-seta').count(), 0);
  // nem a tarefa, nem o aviso, nem o que já está no padrão
  for (const texto of ['CALHAUS', 'Trocar a grade', 'Novela Sol 28/11', 'Grade da Noite', 'Quem Ama']) assert.equal(await p.locator('.cor-tabela', { hasText: texto }).count(), 0, texto);

  await semRolagemDeLado(p, `computador ${nome}`);
  await capturar(p, `01-computador-${nome}`);
  // só leitura: nada foi ao Teable para gravar
  assert.deepEqual(teable.estado.pedidos.filter((x) => !x.startsWith('GET ')), []);
  assert.deepEqual(erros, [], `computador ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: computador ${nome}: menu do perfil → resumo, "de → para" com o dia e o editor, não reconhecido à parte`);
}

/** As páginas: a resposta do servidor de mentira tem 120 propostas; "Próximas" pede a página 2 e mostra ela. */
async function asPaginas(navegador, url) {
  const proposta = (pagina, i) => ({ id: `recPag${pagina}_${i}`, dia: '2026-11-27', editor: 'Ana Ribeiro', de: `Show ${pagina}.${i} 28/11 ah`, para: `Show ${pagina}.${i} 28/11 (AH)` });
  const pedidas = [];
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, { hash: '' });
  await ctx.route((u) => u.pathname === '/api/correcoes/pauta', (r) => {
    const busca = new URL(r.request().url()).searchParams;
    const pagina = Number(busca.get('pagina'));
    pedidas.push(`${busca.get('grupo')}:${pagina}`);
    const resumo = { corrigir: 120, naoReconhecido: 0 };
    if (busca.get('grupo') !== 'corrigir') return r.fulfill({ json: { grupo: busca.get('grupo'), pagina, porPagina: 50, resumo, propostas: [] } });
    const quantas = pagina === 3 ? 20 : 50;
    return r.fulfill({ json: { grupo: 'corrigir', pagina, porPagina: 50, resumo, propostas: Array.from({ length: quantas }, (_, i) => proposta(pagina, i)) } });
  });
  // o endereço próprio, aberto direto (com a resposta de mentira já no lugar)
  await p.goto(`${url}#/correcoes`);
  await p.reload();
  const corrigir = grupo(p, 'corrigir');
  await corrigir.locator('.cor-paginas').waitFor();
  assert.equal((await corrigir.locator('.cor-pagina').textContent()).trim(), 'página 1 de 3');
  assert.equal(await corrigir.getByRole('button', { name: 'Anteriores' }).isDisabled(), true);
  assert.equal(await corrigir.locator('.cor-tabela tbody tr').count(), 50);
  await corrigir.getByRole('button', { name: 'Próximas' }).click();
  await linhaDe(p, 'recPag2_0').waitFor();
  assert.equal((await corrigir.locator('.cor-pagina').textContent()).trim(), 'página 2 de 3');
  await corrigir.getByRole('button', { name: 'Próximas' }).click();
  await linhaDe(p, 'recPag3_0').waitFor();
  assert.equal(await corrigir.locator('.cor-tabela tbody tr').count(), 20);
  assert.equal(await corrigir.getByRole('button', { name: 'Próximas' }).isDisabled(), true);
  await corrigir.getByRole('button', { name: 'Anteriores' }).click();
  await linhaDe(p, 'recPag2_0').waitFor();
  // o StrictMode do desenvolvimento pede a página da entrada duas vezes: a repetida seguida conta uma
  const doGrupo = pedidas.filter((x) => x.startsWith('corrigir:')).filter((x, i, xs) => x !== xs[i - 1]);
  assert.deepEqual(doGrupo, ['corrigir:1', 'corrigir:2', 'corrigir:3', 'corrigir:2']);
  // sem código desconhecido, sem o grupo "Não reconhecido"
  assert.equal(await grupo(p, 'nao-reconhecido').count(), 0);
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: as páginas: "Próximas" e "Anteriores" pedem a página ao servidor');
}

async function semSerAdministrador(navegador, url, api, teable) {
  const antes = teable.estado.consultas.length;
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, { email: OUTRA, hash: '' });
  await p.locator('.perfil-botao').click();
  await p.locator('.perfil-painel').waitFor();
  assert.equal(await p.locator('.perfil-painel .perfil-link', { hasText: 'Correção de grafia' }).count(), 0);
  await p.goto(`${url}#/correcoes`);
  await p.locator('.aviso', { hasText: 'Só administradores veem a correção de grafia.' }).waitFor();
  assert.equal(new URL(p.url()).hash, '#/');
  const r = await fetch(`${api}/correcoes/pauta`, { headers: { 'cf-access-authenticated-user-email': OUTRA } });
  assert.equal(r.status, 403);
  assert.equal(teable.estado.consultas.slice(antes).some((sql) => sql.includes('grupo')), false, 'quem não é administrador não leva ao Postgres');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: quem não é administrador não vê o item nem abre a página (e a rota responde 403)');
}

async function noCelular(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  await grupo(p, 'corrigir').locator('.cor-tabela tbody tr').first().waitFor();
  // cada linha um cartão: sem o cabeçalho da tabela, a claquete embaixo do dia e do editor
  assert.equal(await p.locator('.cor-tabela thead').first().isVisible(), false);
  assert.deepEqual(await textos(grupo(p, 'corrigir').locator('mark.cor-depois')), ['(DP)', '(M)', '(H)']);
  await semRolagemDeLado(p, `celular ${nome}`);
  await capturar(p, `02-celular-${nome}`);
  assert.deepEqual(erros, [], `celular ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: celular ${nome}: só mostra, cada linha um cartão, sem rolar para o lado`);
}

async function principal() {
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const teable = teableFalso({ EDICAO_producao: 'pauta_e2e' }, { registros: { EDICAO_producao: PAUTA } });
  const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
  const s = await subir({ teable, pg: teable.abrirPg, env: { CADASTRO_ADMINS: LIA, ...TEABLE_FALSO, ...PG } });
  // o convite do tour da revisão não aparece na fila (as duas já viram)
  for (const email of [LIA, OUTRA]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, teable, tema);
    await asPaginas(navegador, s.url);
    await semSerAdministrador(navegador, s.url, s.api, teable);
    for (const tema of ['light', 'dark']) await noCelular(navegador, s.url, tema);
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
