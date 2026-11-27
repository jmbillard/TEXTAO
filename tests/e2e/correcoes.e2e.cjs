// Ponta a ponta da Correção de grafia (#114, #116), rodado à parte do vitest: `npm run e2e:correcoes`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o Teable falso
// (tests/fixtures/teable-falso.mjs): a tabela EDICAO_producao achada pelo nome e o Postgres dele respondendo a pauta
// inteira, fictícia, de vários meses. No computador, claro e escuro: o item "Correção de grafia" no menu do perfil,
// junto de Cadastros e Configuração; o endereço próprio; o resumo no topo; as claquetes fora do padrão "de → para",
// com o dia e o editor e o código destacado; os códigos que a pauta não reconhece, à parte; nada é gravado no Teable.
// As páginas: com mais propostas do que cabem, "Próximas" pede a página seguinte. Quem não é administrador não vê o
// item nem abre a página. No celular, claro e escuro: só mostra, cada linha um cartão, sem rolar para o lado.
// As atrações (#116): as fichas dos cadastros do Teable falso que parecem a mesma, num grupo com o motivo, e em cada
// ficha quantas artes do acervo, Produções e regras ela tem; os nomes curtos e diferentes não juntam; "Não são a mesma"
// tira o grupo, e ele não volta ao reabrir a página. No celular, sem o botão.
// Aplicar e desfazer (#115), no computador: a proposta com o (M) espera a key nova e não se marca; marcar todas da
// página e uma por vez; aplicar só as marcadas, com a linha que mudou no Teable depois da proposta voltando como
// "mudou desde a proposta" e o resultado "1 deu certo e 1 falhou"; a caixinha de desfazer devolve a claquete antiga; o
// registro das correções aplicadas, com o desfazer de cada uma e o "mudou desde então". Com a tabela da pauta fora da
// base do PROMeiro, só o aviso, sem marcar.
// Juntar (#117), no computador: "Juntar…" abre a escolha da ficha que fica (a sugerida é a com mais artes) e do nome
// final; juntar passa as artes do acervo, a key e a regra para a que fica, renomeia e apaga a que sai, no Teable falso;
// o grupo sai, a caixinha de desfazer e o registro mostram o resumo; desfazer recria a ficha que saiu e religa as artes.
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
    lastModifiedTime: '2026-11-20T12:00:00.000Z',
    fields: { claquete, key: claquete.toUpperCase(), editor: editor ? { id: `rec${editor.replace(/\W/g, '')}`, title: editor } : null, data: meiaNoite, expediente_inicio: meiaNoite, expediente_fim: null, anotacao, alterado_em: meiaNoite },
  };
}
/** As fichas de atração dos cadastros (fictícias): duas com o mesmo nome sem o artigo e o acento, duas com uma letra
    de diferença e duas curtas e diferentes. */
const vinculo = (id, title) => [{ id, title }];
const ATRACOES = [
  { id: 'recAtrE2e1', fields: { atracao: 'A Clínica', categoria: 'Novelas' } },
  { id: 'recAtrE2e2', fields: { atracao: 'Clinica', categoria: 'Novelas' } },
  { id: 'recAtrE2e3', fields: { atracao: 'Antártida', categoria: 'Filmes' } },
  { id: 'recAtrE2e4', fields: { atracao: 'Antartica', categoria: 'Filmes' } },
  { id: 'recAtrE2e5', fields: { atracao: 'Gol', categoria: 'Esportes' } },
  { id: 'recAtrE2e6', fields: { atracao: 'Sol', categoria: 'Shows' } },
];
const KEYS = [{ id: 'recKeyE2e1', fields: { key: 'A CLINICA', atracoes: vinculo('recAtrE2e1', 'A Clínica') } }];
const ACERVO = [
  { id: 'recArteE2e1', fields: { arte: 'HOJE', tipo: 'RODAPE', atracao: vinculo('recAtrE2e1', 'A Clínica') } },
  { id: 'recArteE2e2', fields: { arte: 'AMANHÃ', tipo: 'RODAPE', atracao: vinculo('recAtrE2e1', 'A Clínica') } },
  { id: 'recArteE2e3', fields: { arte: 'ESTREIA', tipo: 'CARTAO', atracao: vinculo('recAtrE2e3', 'Antártida') } },
];

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
const grupoDeAtracoes = (p, id) => p.locator(`.cor-grupo[data-id="${id}"]`);
/** As fichas de um grupo: o nome e as três contas (artes, Produções, regras). */
const fichasDe = (g) =>
  g.locator('.cor-fichas tbody tr').evaluateAll((trs) => trs.map((tr) => [tr.querySelector('.cor-nome').textContent, ...[...tr.querySelectorAll('.cor-num')].map((td) => td.textContent.replace(/[^\d—]/g, ''))].join(' ')));
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
  await grupo(p, 'atracoes').locator('.cor-grupo').first().waitFor();
  assert.equal(new URL(p.url()).hash, '#/correcoes');
  assert.equal((await p.locator('.cfg-cabeca h1').textContent()).trim(), 'Correção de grafia');

  // o resumo no topo: a pauta e as atrações
  assert.equal((await p.locator('.cor-resumo').textContent()).replace(/\s+/g, ' ').trim(), '3 propostas de correção na pauta da edição e 1 código não reconhecido. 2 grupos de atrações parecidas.');

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

  // as atrações parecidas: cada grupo com o motivo e as fichas, com as contas; os nomes curtos e diferentes, não
  const atracoes = grupo(p, 'atracoes');
  assert.equal((await atracoes.locator('.cor-conta').textContent()).trim(), '2');
  assert.deepEqual(await textos(atracoes.locator('.cor-grupo .cor-motivo')), ['O mesmo nome sem maiúsculas, acentos e artigos', 'Uma letra de diferença no nome']);
  assert.deepEqual(await fichasDe(grupoDeAtracoes(p, 'recAtrE2e1+recAtrE2e2')), ['A Clínica 2 0 1', 'Clinica 0 0 0']);
  assert.deepEqual(await fichasDe(grupoDeAtracoes(p, 'recAtrE2e3+recAtrE2e4')), ['Antartica 0 0 0', 'Antártida 1 0 0']);
  assert.deepEqual(await textos(grupoDeAtracoes(p, 'recAtrE2e1+recAtrE2e2').locator('.cor-categoria')), ['Novelas', 'Novelas']);
  for (const nome of ['Gol', 'Sol']) assert.equal(await atracoes.locator('.cor-nome', { hasText: new RegExp(`^${nome}$`) }).count(), 0, nome);
  assert.equal(await atracoes.getByRole('button', { name: 'Não são a mesma' }).count(), 2);

  await semRolagemDeLado(p, `computador ${nome}`);
  await capturar(p, `01-computador-${nome}`);
  // só leitura: nada foi ao Teable para gravar
  assert.deepEqual(teable.estado.pedidos.filter((x) => !x.startsWith('GET ')), []);
  assert.deepEqual(erros, [], `computador ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: computador ${nome}: menu do perfil → resumo, "de → para" com o dia e o editor, não reconhecido à parte`);
}

/** "Não são a mesma": o grupo sai na hora, fica guardado e não volta ao reabrir; o outro continua. */
async function naoSaoAMesma(navegador, url, teable) {
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } });
  const antartida = grupoDeAtracoes(p, 'recAtrE2e3+recAtrE2e4');
  await antartida.waitFor();
  await antartida.getByRole('button', { name: 'Não são a mesma' }).click();
  await antartida.waitFor({ state: 'detached' });
  assert.equal((await p.locator('.cor-guardado').textContent()).trim(), 'Guardado: Antartica, Antártida não são a mesma atração.');
  assert.equal((await grupo(p, 'atracoes').locator('.cor-conta').textContent()).trim(), '1');
  await capturar(p, '03-nao-sao-a-mesma');
  await p.reload();
  await grupoDeAtracoes(p, 'recAtrE2e1+recAtrE2e2').waitFor();
  assert.equal(await antartida.count(), 0, 'o grupo marcado não volta');
  assert.match((await p.locator('.cor-resumo').textContent()).replace(/\s+/g, ' '), /1 grupo de atrações parecidas\./);
  // guardado no PROMeiro: nada foi ao Teable para gravar
  assert.deepEqual(teable.estado.pedidos.filter((x) => !x.startsWith('GET ')), []);
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: "Não são a mesma" tira o grupo, e ele não volta ao reabrir');
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
    // a tabela da pauta fora da base do PROMeiro: a tela só mostra
    const escrita = { pode: false, aviso: 'A tabela da pauta da edição não está na base do PROMeiro: a correção só mostra as propostas.' };
    if (busca.get('grupo') !== 'corrigir') return r.fulfill({ json: { grupo: busca.get('grupo'), pagina, porPagina: 50, resumo, escrita, propostas: [] } });
    const quantas = pagina === 3 ? 20 : 50;
    return r.fulfill({ json: { grupo: 'corrigir', pagina, porPagina: 50, resumo, escrita, propostas: Array.from({ length: quantas }, (_, i) => proposta(pagina, i)) } });
  });
  // o endereço próprio, aberto direto (com a resposta de mentira já no lugar)
  await p.goto(`${url}#/correcoes`);
  await p.reload();
  const corrigir = grupo(p, 'corrigir');
  await corrigir.locator('.cor-paginas').waitFor();
  assert.equal((await corrigir.locator('.cor-pagina').textContent()).trim(), 'página 1 de 3');
  assert.equal(await corrigir.getByRole('button', { name: 'Anteriores' }).isDisabled(), true);
  assert.equal(await corrigir.locator('.cor-tabela tbody tr').count(), 50);
  assert.equal((await p.locator('.cor-aviso').textContent()).trim(), 'A tabela da pauta da edição não está na base do PROMeiro: a correção só mostra as propostas.');
  assert.equal(await p.locator('.cor-marcar input').count(), 0, 'fora da base do PROMeiro: sem marcar');
  assert.equal(await p.getByRole('button', { name: /^Aplicar/ }).count(), 0);
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
  assert.equal((await fetch(`${api}/correcoes/atracoes`, { headers: { 'cf-access-authenticated-user-email': OUTRA } })).status, 403);
  const marcar = await fetch(`${api}/correcoes/atracoes/nao-sao-a-mesma`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': OUTRA, 'content-type': 'application/json' }, body: JSON.stringify({ ids: ['recAtrE2e1', 'recAtrE2e2'] }) });
  assert.equal(marcar.status, 403);
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
  // as atrações: só mostra, sem o botão
  await grupo(p, 'atracoes').locator('.cor-grupo').first().waitFor();
  assert.equal(await grupo(p, 'atracoes').getByRole('button', { name: 'Não são a mesma' }).count(), 0);
  await semRolagemDeLado(p, `celular ${nome}`);
  await capturar(p, `02-celular-${nome}`);
  assert.deepEqual(erros, [], `celular ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: celular ${nome}: só mostra, cada linha um cartão, sem rolar para o lado`);
}

/** Aplicar e desfazer (#115): marcar, aplicar, a linha que mudou, a caixinha de desfazer e o registro. */
async function aplicarEDesfazer(navegador, url, teable) {
  const daPauta = (claquete) => PAUTA.find((l) => l.fields.claquete === claquete);
  const jogo = daPauta('Jogo Final 4/12 Dp');
  const novela = daPauta('Novela Sol 28/9 H');
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } });
  const corrigir = grupo(p, 'corrigir');
  await corrigir.locator('.cor-marcar input').first().waitFor();
  assert.equal(await p.locator('.cor-aviso').count(), 0, 'na base do PROMeiro: sem o aviso');
  // a do (M) espera a fórmula nova da key no Teable: não se marca
  const festival = linhaDe(p, daPauta('Festival 3/1 (MÊS)').id);
  assert.equal(await festival.locator('.cor-marcar input').isDisabled(), true);
  assert.equal((await festival.locator('.cor-etiqueta').textContent()).trim(), 'espera a key nova');
  // todas da página (as que se marcam), e uma por vez
  await corrigir.getByRole('checkbox', { name: 'Marcar todas da página' }).check();
  assert.equal((await corrigir.locator('.cor-marcadas').textContent()).trim(), '2 marcadas');
  await linhaDe(p, novela.id).locator('.cor-marcar input').uncheck();
  assert.equal((await corrigir.locator('.cor-marcadas').textContent()).trim(), '1 marcada');
  assert.equal(await corrigir.getByRole('checkbox', { name: 'Marcar todas da página' }).isChecked(), false);
  await linhaDe(p, novela.id).locator('.cor-marcar input').check();
  await capturar(p, '04-marcadas');
  // alguém muda a linha da Novela no Teable depois da tela ler: ela não é gravada
  novela.lastModifiedTime = '2026-11-27T09:00:00.000Z';
  await corrigir.getByRole('button', { name: 'Aplicar 2 marcadas' }).click();
  await p.locator('.cor-resultado', { hasText: 'falhou' }).waitFor();
  assert.equal((await p.locator('.cor-resultado').textContent()).trim(), '1 deu certo e 1 falhou.');
  assert.equal(jogo.fields.claquete, 'Jogo Final 4/12 (DP)');
  assert.equal(novela.fields.claquete, 'Novela Sol 28/9 H');
  await linhaDe(p, jogo.id).waitFor({ state: 'detached' });
  assert.equal((await linhaDe(p, novela.id).locator('.cor-etiqueta').textContent()).trim(), 'mudou desde a proposta');
  // a caixinha de desfazer e o registro
  const caixinha = p.locator('.cor-desfazer');
  assert.equal((await caixinha.locator('.cor-desfazer-texto').textContent()).trim(), '1 correção aplicada na pauta.');
  const registro = grupo(p, 'registro');
  await registro.locator('tbody tr').first().waitFor();
  assert.deepEqual(await textos(registro.locator('tbody tr .cor-de-para')), ['Jogo Final 4/12 Dp → Jogo Final 4/12 (DP)']);
  await semRolagemDeLado(p, 'aplicar');
  await capturar(p, '05-aplicada');
  await caixinha.getByRole('button', { name: 'Desfazer' }).click();
  await caixinha.waitFor({ state: 'detached' });
  assert.match(await p.locator('.cor-resultado').textContent(), /1 correção desfeita/);
  assert.equal(jogo.fields.claquete, 'Jogo Final 4/12 Dp');
  await linhaDe(p, jogo.id).waitFor();
  await registro.locator('.cor-etiqueta[data-motivo="desfeita"]').waitFor();
  assert.match(await registro.locator('.cor-etiqueta[data-motivo="desfeita"]').textContent(), /^desfeita por /);
  await capturar(p, '06-desfeita');

  // pelo registro, mais tarde: aplica de novo, fecha a caixinha; a linha mudou desde então e não é desfeita
  await linhaDe(p, jogo.id).locator('.cor-marcar input').check();
  await corrigir.getByRole('button', { name: 'Aplicar 1 marcada' }).click();
  await caixinha.waitFor();
  await caixinha.getByRole('button', { name: 'Fechar' }).click();
  assert.equal(jogo.fields.claquete, 'Jogo Final 4/12 (DP)');
  const ativa = registro.locator('tbody tr:not(.desfeita)');
  await ativa.waitFor();
  jogo.fields.claquete = 'Jogo Final 5/12 (DP)';
  await ativa.getByRole('button', { name: 'Desfazer' }).click();
  await ativa.locator('.cfg-falha', { hasText: 'mudou desde então' }).waitFor();
  assert.equal(jogo.fields.claquete, 'Jogo Final 5/12 (DP)');
  // volta como a correção deixou: agora desfaz
  jogo.fields.claquete = 'Jogo Final 4/12 (DP)';
  await ativa.getByRole('button', { name: 'Desfazer' }).click();
  await registro.locator('tbody tr:not(.desfeita)').waitFor({ state: 'detached' });
  assert.equal(jogo.fields.claquete, 'Jogo Final 4/12 Dp');
  await capturar(p, '07-registro');
  // só a claquete foi gravada, sempre na tabela da pauta da base do PROMeiro
  const gravacoes = teable.estado.pedidos.filter((x) => !x.startsWith('GET '));
  assert.ok(gravacoes.length === 4 && gravacoes.every((x) => x.startsWith('PATCH /api/table/tblFalso_bseFalso_EDICAO_producao/record/')), gravacoes.join(' | '));
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: aplicar e desfazer: marcar, aplicar só as marcadas, "mudou desde a proposta", a caixinha e o registro');
}

/** Juntar (#117): escolher a ficha que fica e o nome final, juntar, e desfazer pela caixinha. */
async function juntarEDesfazer(navegador, url, teable) {
  const antes = teable.estado.pedidos.length;
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } });
  const clinica = grupoDeAtracoes(p, 'recAtrE2e1+recAtrE2e2');
  await clinica.waitFor();
  await clinica.getByRole('button', { name: 'Juntar…' }).click();
  // a sugerida é a com mais artes do acervo, e o nome final é o dela
  const nomeFinal = clinica.getByRole('combobox');
  assert.equal(await clinica.getByRole('radio', { name: 'Fica A Clínica' }).isChecked(), true);
  assert.equal(await nomeFinal.inputValue(), 'A Clínica');
  assert.equal(await clinica.getByRole('button', { name: 'Não são a mesma' }).count(), 0);
  // fica a outra, e o nome segue a escolha até alguém mudar à mão
  await clinica.getByRole('radio', { name: 'Fica Clinica' }).check();
  assert.equal(await nomeFinal.inputValue(), 'Clinica');
  assert.equal((await clinica.locator('.cor-juntar-texto').textContent()).trim(), 'A Clínica sai: as artes do acervo, as keys, as regras e as ligações passam para a que fica.');
  await nomeFinal.fill('A Clínica');
  await semRolagemDeLado(p, 'juntar');
  await capturar(p, '08-juntar');
  // cancelar fecha a escolha sem gravar
  await clinica.getByRole('button', { name: 'Cancelar' }).click();
  assert.equal(await clinica.locator('.cor-juntar').count(), 0);
  assert.deepEqual(teable.estado.pedidos.slice(antes).filter((x) => !x.startsWith('GET ')), []);
  await clinica.getByRole('button', { name: 'Juntar…' }).click();
  await clinica.getByRole('radio', { name: 'Fica Clinica' }).check();
  await nomeFinal.fill('A Clínica');
  await clinica.getByRole('button', { name: 'Juntar', exact: true }).click();
  await clinica.waitFor({ state: 'detached' });
  // no Teable falso: as artes e a key passaram, a que fica foi renomeada e a que sai foi apagada
  assert.deepEqual(ATRACOES.map((a) => [a.id, a.fields.atracao]).filter(([id]) => /E2e[12]$/.test(id)), [['recAtrE2e2', 'A Clínica']]);
  assert.deepEqual(ACERVO.filter((a) => a.id !== 'recArteE2e3').map((a) => a.fields.atracao.map((v) => v.id)), [['recAtrE2e2'], ['recAtrE2e2']]);
  assert.deepEqual(KEYS[0].fields.atracoes.map((v) => v.id), ['recAtrE2e2']);
  const caixinha = p.locator('.cor-desfazer');
  assert.equal((await caixinha.locator('.cor-desfazer-texto').textContent()).trim(), 'Atrações juntadas em A Clínica.');
  assert.equal((await p.locator('.cor-resultado').textContent()).trim(), 'Juntadas: A Clínica + Clinica → A Clínica: 2 artes do acervo, 1 key e 1 regra.');
  const registro = grupo(p, 'registro');
  await registro.locator('tbody tr', { hasText: '→ A Clínica' }).waitFor();
  assert.equal((await registro.locator('tbody tr .cor-de-para').first().textContent()).trim(), 'A Clínica + Clinica → A Clínica: 2 artes do acervo, 1 key e 1 regra');
  assert.match((await p.locator('.cor-resumo').textContent()).replace(/\s+/g, ' '), /Nenhuma atração parecida com outra\./);
  await capturar(p, '09-juntadas');
  // desfazer: a ficha que saiu volta (com outro id), com as artes e a key; a que ficou volta ao nome de antes
  await caixinha.getByRole('button', { name: 'Desfazer' }).click();
  await caixinha.waitFor({ state: 'detached' });
  assert.equal((await p.locator('.cor-resultado').textContent()).trim(), '1 correção desfeita: a ficha que saiu voltou, com as artes e as ligações.');
  const recriada = ATRACOES.find((a) => a.fields.atracao === 'A Clínica');
  assert.ok(recriada && recriada.id !== 'recAtrE2e1', 'a ficha recriada, com outro id');
  assert.equal(ATRACOES.find((a) => a.id === 'recAtrE2e2').fields.atracao, 'Clinica');
  assert.deepEqual(ACERVO.filter((a) => a.id !== 'recArteE2e3').map((a) => a.fields.atracao.map((v) => v.id)), [[recriada.id], [recriada.id]]);
  assert.deepEqual(KEYS[0].fields.atracoes.map((v) => v.id), [recriada.id]);
  // o grupo volta à lista, e o registro marca a junção como desfeita
  await p.locator('.cor-grupo', { hasText: 'Clinica' }).waitFor();
  await registro.locator('.cor-etiqueta[data-motivo="desfeita"]').first().waitFor();
  await capturar(p, '10-juntada-desfeita');
  // tudo na base do PROMeiro: só as tabelas das atrações, das keys e do acervo
  const gravacoes = teable.estado.pedidos.slice(antes).filter((x) => !x.startsWith('GET '));
  assert.ok(gravacoes.length && gravacoes.every((x) => /^(PATCH|POST|DELETE) \/api\/table\/tblFalso_bseFalso_(atracoes|KEY_atracoes|ARTES_acervo)\/record/.test(x)), gravacoes.join(' | '));
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: juntar: a ficha que fica e o nome final, as artes passam, o grupo sai, e desfazer recria a ficha');
}

async function principal() {
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const { criarRegrasDaAtracao } = await import(join(RAIZ, 'servidor', 'regras-da-atracao.mjs'));
  const nomes = { EDICAO_producao: 'pauta_e2e', atracoes: 'atracoes_e2e', KEY_atracoes: 'keys_e2e', ARTES_acervo: 'acervo_e2e' };
  const teable = teableFalso(nomes, { registros: { EDICAO_producao: PAUTA, atracoes: ATRACOES, KEY_atracoes: KEYS, ARTES_acervo: ACERVO } });
  const PG = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
  // os cadastros leem as atrações pela API do Teable falso
  const s = await subir({ teable, pg: teable.abrirPg, cadastros: (e) => criarCadastros(e, { buscar: teable }), env: { CADASTRO_ADMINS: LIA, ...TEABLE_FALSO, ...PG } });
  // uma regra lembrada da ficha A Clínica
  criarRegrasDaAtracao(s.db).lembrar('A Clínica', [{ tipo: 'trocas', re: '^ESTREIA$', motivo: 'troca de exemplo' }], 'Lia Moraes');
  // o convite do tour da revisão não aparece na fila (as duas já viram)
  for (const email of [LIA, OUTRA]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
  const navegador = await chromium.launch();
  let falhou = false;
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, teable, tema);
    await naoSaoAMesma(navegador, s.url, teable);
    await asPaginas(navegador, s.url);
    await semSerAdministrador(navegador, s.url, s.api, teable);
    for (const tema of ['light', 'dark']) await noCelular(navegador, s.url, tema);
    await aplicarEDesfazer(navegador, s.url, teable);
    await juntarEDesfazer(navegador, s.url, teable);
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
