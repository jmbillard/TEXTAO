// Ponta a ponta da tela de Configuração, seção Praças (#72), rodado à parte do vitest: `npm run e2e:configuracao`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com o quadro do Trello falso
// (listas, campo Praça e opções fictícios; só leitura): as rotas /api/configuracao são as de verdade, e salvar vale
// na hora pela configuração viva. No computador, claro e escuro: o item "Configuração" no menu do perfil; tudo ligado
// (a linha de estado, o "?", o "ver tudo"); com exceções (a G5 nas listas do RJ, à mão; a saída de INTER em dobro);
// ligar à mão pelo "Escolher"; as regras editadas e a ordem arrastada, com a barra "N mudanças"; conferir com erro
// (nada salvo) e conferir certo, salvar e valer na hora (o /api/eu traz as praças novas). Quem não é administrador
// não vê o item nem abre a tela. No celular, claro e escuro: só consulta.
// A praça nova (#73), claro e escuro: "+ Nova praça" (MG), a sigla repetida que a conferência recusa, a contagem das
// claquetes da fila que mudam de praça, o aviso do n8n, e salvar: o PROMeiro cria a opção MG no campo Praça (o único
// pedido ao Trello que não é leitura) e a praça vale na hora.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:configuracao
// Com CAPTURAS=pasta, grava as capturas de cada tela (densidade 2).
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:configuracao');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const OUTRA = 'bruno.teixeira@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

/* ---------- o quadro fictício ---------- */
const LISTAS = [
  ['lG5', 'G5 ENTRADA'],
  ['lG5s', 'G5 ENTREGUE'],
  ['lRJ', 'RIO ENTRADA'],
  ['lRJs', 'RIO ENTREGUE'],
  ['lSP', 'SP ENTRADA'],
  ['lSPs', 'SP ENTREGUE'],
  ['lIN', 'INTER ENTRADA'],
  ['lINs', 'INTER ENTREGUE'],
  ['lVT', 'VT'],
  ['lVelha', 'SP ENTRADA 2024', true],
  // a praça nova (#73): as listas já estão no quadro
  ['lMG', 'MG ENTRADA'],
  ['lMGs', 'MG PRONTO'],
].map(([id, name, closed = false]) => ({ id, name, closed }));
// a segunda saída de INTER: só no cenário com exceções
const DOBRO = { id: 'lINs2', name: 'INTER ENTREGUE (2025)', closed: false };
let comDobro = false;
const OPCOES = ['G5', 'SP', 'RJ', 'INTER'].map((t) => ({ id: `o${t}`, value: { text: t } }));
const CAMPOS = [
  { id: 'cPraca', name: 'Praça', type: 'list', options: [...OPCOES] },
  { id: 'cProjeto', name: 'Projeto', type: 'text' },
];
// o Portainer: cada praça nas suas listas; o quadro sai do idBoard da primeira lista (sem TRELLO_QUADRO)
const ENV_TRELLO = {
  TRELLO_KEY: 'falsa',
  TRELLO_TOKEN: 'falso',
  TRELLO_LISTA_G5: 'lG5',
  TRELLO_SAIDA_G5: 'lG5s',
  TRELLO_LISTA_RJ: 'lRJ',
  TRELLO_SAIDA_RJ: 'lRJs',
  TRELLO_LISTA_SP: 'lSP',
  TRELLO_SAIDA_SP: 'lSPs',
  TRELLO_LISTA_INTER: 'lIN',
  TRELLO_SAIDA_INTER: 'lINs',
  TRELLO_CAMPO_PRACA: 'cPraca',
  TRELLO_PRACAS: 'G5=oG5,SP=oSP,RJ=oRJ,INTER=oINTER',
};
const pedidosAoTrello = [];
async function buscar(url, init = {}) {
  const u = new URL(url);
  const metodo = init.method ?? 'GET';
  pedidosAoTrello.push(`${metodo} ${u.pathname}`);
  const ok = (dados) => ({ ok: true, status: 200, json: async () => dados, text: async () => '' });
  // a única escrita: a opção da praça nova no campo Praça
  if (metodo === 'POST' && u.pathname === '/1/customField/cPraca/options') {
    const opcao = { id: `oNova${CAMPOS[0].options.length}`, value: { text: JSON.parse(init.body).value.text } };
    CAMPOS[0].options.push(opcao);
    return ok(opcao);
  }
  if (metodo !== 'GET') throw new Error(`a Configuração só lê o Trello: ${metodo} ${u.pathname}`);
  if (/^\/1\/lists\/\w+$/.test(u.pathname)) return ok({ id: u.pathname.split('/')[3], idBoard: 'quadroFicticio' });
  if (u.pathname === '/1/boards/quadroFicticio/lists') return ok(comDobro ? [...LISTAS, DOBRO] : LISTAS);
  if (u.pathname === '/1/boards/quadroFicticio/customFields') return ok(CAMPOS);
  throw new Error(`pedido inesperado ao Trello: ${u.pathname}`);
}

/** Volta ao começo: nada salvo na tela; `excecoes` põe a G5 nas listas do RJ e a saída de INTER sem nada (em dobro). */
async function recomecar(app, { excecoes }) {
  comDobro = excecoes;
  CAMPOS[0].options = [...OPCOES];
  await app.mudarConfiguracao(
    excecoes
      ? { PRACAS: null, LIGADO_A_MAO: null, TRELLO_CAMPO_PRACA: null, TRELLO_LISTA_G5: 'lRJ', TRELLO_SAIDA_G5: 'lRJs', TRELLO_SAIDA_INTER: '' }
      : { PRACAS: null, LIGADO_A_MAO: null, TRELLO_CAMPO_PRACA: null, TRELLO_LISTA_G5: null, TRELLO_SAIDA_G5: null, TRELLO_SAIDA_INTER: null },
  ).antigaFechada;
}

/* ---------- o navegador ---------- */

async function abrir(navegador, url, opcoes, { email = LIA, hash = '#/configuracao' } = {}) {
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
const resumo = async (p) => (await p.locator('.cfg-estado').textContent()).trim();
const excecoes = (p) => textos(p.locator('.cfg-exc .cfg-exc-texto strong'));
const barra = async (p) => ((await p.locator('.cfg-barra').count()) ? (await p.locator('.cfg-barra-n').textContent()).trim() : '');
const regra = (p, sigla) => p.locator(`.cfg-praca[data-sigla="${sigla}"]`);
const ordem = (p) => p.locator('.cfg-praca').evaluateAll((ls) => ls.map((l) => l.dataset.sigla));

async function noComputador(navegador, url, app, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await recomecar(app, { excecoes: false });
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema }, { hash: '' });
  assert.equal(await fundoEscuro(p), tema === 'dark');

  // o item no menu do perfil, ao lado de Tema e Enfeites
  await p.locator('.perfil-botao').click();
  const item = p.locator('.perfil-painel .perfil-link', { hasText: 'Configuração' });
  await item.waitFor();
  await capturar(p, `01-menu-${nome}`);
  await item.click();
  await p.locator('.cfg-praca').first().waitFor();
  assert.equal(new URL(p.url()).hash, '#/configuracao');

  // tudo ligado: a tela quase vazia, só a linha de estado e as regras; sem barra
  assert.equal(await resumo(p), '4 praças · tudo ligado');
  assert.equal(await p.locator('.cfg-exc').count(), 0);
  assert.deepEqual(await ordem(p), ['G5', 'RJ', 'SP', 'INTER']);
  assert.deepEqual(await textos(regra(p, 'G5').locator('.cfg-regra > *')), ['quando a claquete não diz', 'também REDE MG DF PE', 'FESTA 3/11 → G5']);
  assert.deepEqual(await textos(regra(p, 'RJ').locator('.cfg-regra > *')), ['começa com RIO', 'RIO FESTA 3/11 → RJ']);
  assert.deepEqual(await textos(regra(p, 'INTER').locator('.cfg-regra > *')), ['termina em INTER ou INTERNACIONAL', 'também INTERNACIONAL', 'FESTA 3/11 INTER → INTER']);
  assert.equal(await regra(p, 'G5').locator('.cfg-marca.padrao').count(), 1);
  assert.equal(await barra(p), '');
  await semRolagemDeLado(p, `computador ${nome}, tudo ligado`);
  await capturar(p, `02-tudo-ligado-${nome}`);
  // o "?" explica
  await p.locator('.cfg-ajuda button').click();
  assert.match(await p.locator('.cfg-ajuda-texto').textContent(), /liga pelo nome/);
  await capturar(p, `02b-ajuda-${nome}`);
  await p.keyboard.press('Escape');
  // ver tudo: cada ligação e como foi ligada
  await p.locator('.cfg-ver-tudo').click();
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="SP.entrada"] > span')), ['Entrada', 'SP ENTRADA', 'achado pelo nome · trocar']);
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="campo"] > span')), ['Campo Praça', 'Praça', 'achado pelo nome · trocar']);
  await capturar(p, `02c-ver-tudo-${nome}`);
  await p.locator('.cfg-ver-tudo').click();

  // com exceções: a G5 nas listas do RJ (à mão, dividida) e a saída de INTER em dobro
  await recomecar(app, { excecoes: true });
  await p.reload();
  await p.locator('.cfg-exc').first().waitFor();
  assert.equal(await resumo(p), '4 praças · 1 em dobro · 2 à mão');
  assert.deepEqual(await excecoes(p), ['G5 usa as listas do RJ', 'INTER: duas listas de saída']);
  assert.deepEqual(await textos(p.locator('.cfg-exc .cfg-exc-texto span')), ['ligada à mão · dividida com RJ', '"INTER ENTREGUE" e "INTER ENTREGUE (2025)". Qual vale?']);
  assert.equal(await regra(p, 'G5').locator('.cfg-marca.mao').count(), 1);
  await semRolagemDeLado(p, `computador ${nome}, com exceções`);
  await capturar(p, `03-com-excecoes-${nome}`);

  // ligar à mão: Escolher a saída de INTER
  await p.locator('.cfg-exc', { hasText: 'INTER: duas' }).locator('.botao', { hasText: 'Escolher' }).click();
  const escolher = p.locator('.cfg-escolher');
  await escolher.waitFor();
  assert.equal(await escolher.locator('.cfg-escolher-titulo').textContent(), 'Saída de INTER');
  // os dois que o nome achou vêm primeiro; a lista arquivada não aparece; a que já é de outra praça diz de quem é
  assert.deepEqual((await textos(escolher.locator('li .n'))).slice(0, 2), ['INTER ENTREGUE', 'INTER ENTREGUE (2025)']);
  assert.ok(!(await textos(escolher.locator('li .n'))).includes('SP ENTRADA 2024'));
  assert.deepEqual(await textos(escolher.locator('li', { hasText: 'RIO ENTRADA' }).locator('.nota')), ['é a entrada de G5']);
  await escolher.locator('input').fill('inter');
  assert.equal(await escolher.locator('li button').count(), 3);
  await capturar(p, `04-ligar-a-mao-${nome}`);
  await escolher.locator('li button', { hasText: /^INTER ENTREGUE$/ }).click();
  assert.equal(await escolher.count(), 0);
  assert.deepEqual(await excecoes(p), ['G5 usa as listas do RJ', 'INTER usa "INTER ENTREGUE" na saída']);
  assert.equal(await resumo(p), '4 praças · tudo ligado · 3 à mão');
  assert.equal(await barra(p), '1 mudança');

  // as regras editáveis: SP também termina em PAULISTA; o RJ é arrastado para depois de SP
  await regra(p, 'SP').locator('.cfg-ed.regra').click();
  const editor = regra(p, 'SP').locator('.cfg-editor');
  await editor.waitFor();
  await editor.getByLabel('Palavras da regra').fill('SP PAULISTA');
  assert.deepEqual(await textos(regra(p, 'SP').locator('.cfg-ed.regra')), ['termina em SP ou PAULISTA']);
  await regra(p, 'RJ').locator('.cfg-alca').dragTo(regra(p, 'SP'));
  // o arrastar do HTML (o Chromium do Playwright arrasta); as setas na alça são o mesmo caminho pelo teclado
  const arrastou = (await ordem(p))[1] === 'SP';
  if (!arrastou) await regra(p, 'RJ').locator('.cfg-alca').press('ArrowDown');
  assert.deepEqual(await ordem(p), ['G5', 'SP', 'RJ', 'INTER']);
  // a ordem vale no exemplo: "RIO FESTA 3/11" continua do Rio (a regra do começo não bate com a do fim)
  assert.deepEqual(await textos(regra(p, 'RJ').locator('.cfg-exemplo')), ['RIO FESTA 3/11 → RJ']);
  assert.equal(await barra(p), '3 mudanças');
  await semRolagemDeLado(p, `computador ${nome}, regras editadas`);
  await capturar(p, `05-regras-editadas-${nome}`);

  // conferir com erro: INTER também termina em SP, que já é de SP. Nada é salvo
  await regra(p, 'SP').locator('.cfg-editor .botao', { hasText: 'Pronto' }).click();
  await regra(p, 'INTER').locator('.cfg-ed.regra').click();
  await regra(p, 'INTER').locator('.cfg-editor').getByLabel('Palavras da regra').fill('INTER SP');
  await p.locator('.cfg-barra-salvar').click();
  const dialogo = p.locator('.cfg-modal');
  await dialogo.locator('h2', { hasText: 'Não dá para salvar' }).waitFor();
  assert.deepEqual(await textos(dialogo.locator('.cfg-checks li.erro')), ['INTER: termina em INTER ou SP"SP" já é a regra de SP. Use outra palavra.']);
  assert.equal(await dialogo.locator('.botao.primario').isDisabled(), true);
  await capturar(p, `06-conferir-erro-${nome}`);
  await dialogo.locator('.botao', { hasText: 'Voltar' }).click();
  const eu0 = await p.evaluate(() => fetch('/api/eu').then((r) => r.json()));
  assert.deepEqual(eu0.pracas.map((x) => x.sigla), ['G5', 'RJ', 'SP', 'INTER'], 'nada foi salvo');
  await regra(p, 'INTER').locator('.cfg-editor').getByLabel('Palavras da regra').fill('INTER INTERNACIONAL');
  await regra(p, 'INTER').locator('.cfg-editor .botao', { hasText: 'Pronto' }).click();
  assert.equal(await barra(p), '3 mudanças');

  // conferir certo: o que muda; salvar vale na hora
  await p.locator('.cfg-barra-salvar').click();
  await dialogo.locator('h2', { hasText: 'Tudo confere' }).waitFor();
  const linhasDoQueMuda = await dialogo.locator('.cfg-muda tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim()).filter(Boolean).join(' | ')));
  assert.deepEqual(linhasDoQueMuda, [
    'Ordem | G5, RJ, SP, INTER | G5, SP, RJ, INTER',
    'SP: regra | termina em SP | termina em SP ou PAULISTA',
    'INTER: saída | — | INTER ENTREGUE (à mão)',
  ]);
  await capturar(p, `07-conferir-${nome}`);
  await dialogo.locator('.botao.primario', { hasText: 'Salvar' }).click();
  await p.locator('.aviso', { hasText: 'Salvo. Já vale.' }).waitFor();
  assert.equal(await p.locator('.cfg-modal').count(), 0);
  assert.equal(await barra(p), '');
  const eu = await p.evaluate(() => fetch('/api/eu').then((r) => r.json()));
  assert.deepEqual(eu.pracas.map((x) => x.sigla), ['G5', 'SP', 'RJ', 'INTER']);
  assert.deepEqual(eu.pracas.find((x) => x.sigla === 'SP').regra, { onde: 'fim', palavras: ['SP', 'PAULISTA'] });
  await p.reload();
  await p.locator('.cfg-exc').first().waitFor();
  assert.equal(await resumo(p), '4 praças · tudo ligado · 3 à mão');
  assert.deepEqual(await ordem(p), ['G5', 'SP', 'RJ', 'INTER']);
  await capturar(p, `08-salvo-${nome}`);

  assert.deepEqual(erros, [], `computador ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: computador ${nome}${arrastou ? '' : ' (a ordem foi pelas setas: o arrastar não pegou)'}: menu → tudo ligado (?, ver tudo) → exceções → ligar à mão → regras e ordem com a barra → conferir com erro (nada salvo) → conferir e salvar, vale na hora`);
}

async function novaPraca(navegador, url, app, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await recomecar(app, { excecoes: false });
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  await p.locator('.cfg-praca').first().waitFor();
  assert.equal(await resumo(p), '4 praças · tudo ligado');

  // + Nova praça: a sigla (as palavras da regra seguem a sigla), o nome; as listas ligam pelo nome
  await p.locator('.cfg-mais .botao-texto', { hasText: '+ Nova praça' }).click();
  const linha = p.locator('.cfg-praca.nova');
  await linha.waitFor();
  assert.equal(await p.locator('.cfg-mais').count(), 0, 'uma praça nova por vez');
  await linha.getByLabel('Sigla da praça nova').fill('sp');
  assert.equal(await linha.getByLabel('Sigla da praça nova').inputValue(), 'SP');
  assert.equal(await linha.getByLabel('Palavras da regra').inputValue(), 'SP');
  await linha.getByLabel('Palavras da regra').fill('PAULISTA');
  assert.equal(await barra(p), '1 mudança');
  // a sigla repetida: a conferência recusa e nada é salvo
  await p.locator('.cfg-barra-salvar').click();
  const dialogo = p.locator('.cfg-modal');
  await dialogo.locator('h2', { hasText: 'Não dá para salvar' }).waitFor();
  assert.ok((await textos(dialogo.locator('.cfg-checks li.erro strong'))).includes('Sigla SP'));
  assert.equal(await dialogo.locator('.botao.primario').isDisabled(), true);
  await dialogo.locator('.botao', { hasText: 'Voltar' }).click();

  await linha.getByLabel('Sigla da praça nova').fill('MG');
  await linha.getByLabel('Palavras da regra').fill('MG');
  await linha.getByLabel('Nome da praça nova').fill('Minas');
  assert.deepEqual(await textos(linha.locator('.cfg-exemplo')), ['FESTA 3/11 MG → MG']);
  // a G5 também lia MG: o exemplo dela continua dela
  assert.deepEqual(await textos(regra(p, 'G5').locator('.cfg-exemplo')), ['FESTA 3/11 → G5']);
  assert.deepEqual(await textos(p.locator('.cfg-n8n strong')), ['O n8n ainda não conhece MG']);
  assert.match(await p.locator('.cfg-n8n').textContent(), /PROMO: UPLOAD ROTEIROS · BATCH: TRELLO CARDS → DB · PROMO: DB · PROMO: CLAQUETES DUPLICADAS/);
  assert.equal(await resumo(p), '5 praças · tudo ligado');
  assert.equal(await p.locator('.cfg-exc').count(), 1, 'só o aviso do n8n: entrada e saída ligadas pelo nome');
  await p.locator('.cfg-ver-tudo').click();
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="MG.entrada"] > span')), ['Entrada', 'MG ENTRADA', 'achado pelo nome · trocar']);
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="MG.saida"] > span')), ['Saída', 'MG PRONTO', 'achado pelo nome · trocar']);
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="MG.opcao"] > span')), ['No campo Praça', '—', 'o PROMeiro cria ao salvar · trocar']);
  await p.locator('.cfg-ver-tudo').click();
  await semRolagemDeLado(p, `computador ${nome}, praça nova`);
  await capturar(p, `12-nova-praca-${nome}`);

  // conferir: a contagem das claquetes da fila que mudam de praça, o que muda e o aviso do n8n
  await p.locator('.cfg-barra-salvar').click();
  await dialogo.locator('h2', { hasText: 'Tudo confere' }).waitFor();
  assert.deepEqual(await textos(dialogo.locator('.cfg-checks li', { hasText: 'Claquetes recentes' }).locator('small')), [
    '1 das 2 claquetes dos últimos 90 dias muda de praça: 1 de G5 para MG.',
  ]);
  assert.deepEqual(await textos(dialogo.locator('.cfg-checks li', { hasText: 'MG: opção' }).locator('small')), ['não existe: o PROMeiro cria "MG" ao salvar.']);
  assert.deepEqual(await textos(dialogo.locator('.cfg-claquetes li')), ['BAILE 3/12 MGG5 → MG']);
  const linhasDoQueMuda = await dialogo.locator('.cfg-muda tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim()).filter(Boolean).join(' | ')));
  assert.deepEqual(linhasDoQueMuda, [
    'Praça nova MG | — | termina em MG · depois de INTER',
    'MG: entrada | — | MG ENTRADA',
    'MG: saída | — | MG PRONTO',
    'Campo Praça | G5, SP, RJ, INTER | + MG',
  ]);
  assert.match(await dialogo.locator('.cfg-alerta').textContent(), /O n8n ainda não conhece MG\./);
  assert.ok(!pedidosAoTrello.some((x) => x.startsWith('POST')), 'nada é criado antes de salvar');
  await capturar(p, `13-nova-praca-conferir-${nome}`);

  // salvar: o PROMeiro cria a opção MG no campo Praça, e vale na hora
  await dialogo.locator('.botao.primario', { hasText: 'Salvar' }).click();
  await p.locator('.aviso', { hasText: 'Salvo. Já vale.' }).waitFor();
  assert.deepEqual(pedidosAoTrello.filter((x) => x.startsWith('POST')), ['POST /1/customField/cPraca/options']);
  assert.deepEqual(CAMPOS[0].options.map((o) => o.value.text), ['G5', 'SP', 'RJ', 'INTER', 'MG']);
  assert.equal(await p.locator('.cfg-praca.nova').count(), 0);
  assert.deepEqual(await ordem(p), ['G5', 'RJ', 'SP', 'INTER', 'MG']);
  assert.deepEqual(await textos(regra(p, 'MG').locator('.cfg-regra > *')), ['termina em MG', 'FESTA 3/11 MG → MG']);
  assert.equal(await resumo(p), '5 praças · tudo ligado');
  // o aviso do n8n continua na tela depois de salvar
  assert.deepEqual(await textos(p.locator('.cfg-n8n strong')), ['O n8n ainda não conhece MG']);
  const eu = await p.evaluate(() => fetch('/api/eu').then((r) => r.json()));
  assert.deepEqual(eu.pracas.map((x) => x.sigla), ['G5', 'RJ', 'SP', 'INTER', 'MG']);
  await capturar(p, `14-nova-praca-salva-${nome}`);
  pedidosAoTrello.length = 0;

  assert.deepEqual(erros, [], `praça nova ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: praça nova ${nome}: + Nova praça → sigla repetida recusada → MG ligada pelo nome, aviso do n8n → conferir com a contagem → salvar cria a opção no Trello`);
}

async function semSerAdministrador(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, { email: OUTRA });
  await p.locator('.aviso', { hasText: 'Só administradores' }).waitFor();
  assert.equal(new URL(p.url()).hash, '#/');
  assert.equal(await p.locator('.cfg').count(), 0);
  await p.locator('.perfil-botao').click();
  await p.locator('.perfil-painel').waitFor();
  assert.equal(await p.locator('.perfil-painel .perfil-link', { hasText: 'Configuração' }).count(), 0);
  assert.equal((await ctx.request.get(new URL('/api/configuracao', url).href)).status(), 403);
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: sem ser administrador, sem o item no menu, sem a tela e sem a API');
}

async function noCelular(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  await p.locator('.cfg-exc').first().waitFor();
  assert.match(await p.locator('.cfg-so-consulta').textContent(), /só consulta/);
  assert.equal(await resumo(p), '4 praças · tudo ligado · 3 à mão');
  assert.deepEqual(await excecoes(p), ['G5 usa as listas do RJ', 'INTER usa "INTER ENTREGUE" na saída']);
  // só consulta: nada de Escolher, desfazer, alça, regra que abre ou barra
  assert.equal(await p.locator('.cfg-exc button, .cfg-alca, button.cfg-ed, .cfg-barra').count(), 0);
  assert.deepEqual(await textos(regra(p, 'SP').locator('.cfg-ed.regra')), ['termina em SP ou PAULISTA']);
  await semRolagemDeLado(p, `celular ${nome}`);
  await capturar(p, `10-celular-${nome}`);
  await p.locator('.cfg-ver-tudo').tap();
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="INTER.saida"] > span')), ['Saída', 'INTER ENTREGUE', 'ligado à mão']);
  assert.equal(await p.locator('.cfg-tudo button').count(), 0);
  await semRolagemDeLado(p, `celular ${nome}, ver tudo`);
  await capturar(p, `11-celular-ver-tudo-${nome}`);
  assert.deepEqual(erros, [], `celular ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: celular ${nome}: a linha de estado, as exceções, as regras e o ver tudo, só consulta`);
}

async function principal() {
  const s = await subir({ trello: { env: ENV_TRELLO, buscar, viva: true }, env: { CADASTRO_ADMINS: LIA } });
  // o convite do tour da revisão não aparece na fila (as duas já viram)
  for (const email of [LIA, OUTRA]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
  const navegador = await chromium.launch();
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, s.app, tema);
    await semSerAdministrador(navegador, s.url);
    for (const tema of ['light', 'dark']) await noCelular(navegador, s.url, tema);
    assert.deepEqual([...new Set(pedidosAoTrello.map((x) => x.split(' ')[0]))], ['GET'], 'só leitura no Trello');
    // a praça nova: roteiros na fila, um deles de Minas (hoje lido como G5)
    for (const [id, claquete] of [
      ['rot-mg', 'BAILE 3/12 MG'],
      ['rot-g5', 'JOGO 2/12'],
    ])
      await fetch(`${s.api}/roteiros/${id}`, {
        method: 'PUT',
        headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/json' },
        body: JSON.stringify({ roteiro: { meta: { claquete }, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }, nArtes: 0 }),
      });
    for (const tema of ['light', 'dark']) await novaPraca(navegador, s.url, s.app, tema);
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
