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
// A seção Card (#74), claro e escuro: tudo ligado (só a linha de estado; o "?" e o "ver tudo"); a ALTA em dobro na
// Prioridade, escolhida pela posição e pela cor; trocar o campo Complexidade limpa as opções dele (as do campo novo
// ligam pelo nome, a MÉDIA que falta fica pedindo); conferir e salvar, que vale na hora. No celular, só consulta.
// A seção Filmes (#75), claro e escuro: tudo ligado (a praça dos cards entre as praças; o "ver tudo" com a lista, a
// etiqueta de todos, a de cada sessão e os números da leitura da prévia); a sessão nova no cadastro (Domingo Maior)
// sem etiqueta é exceção, ligada à mão pelo "Escolher"; a praça trocada e a pausa mudada; conferir e salvar, que vale
// na hora (a configuração viva tem a praça, a etiqueta da sessão e a pausa novas). No celular, só consulta.
// As Conexões (#76), claro e escuro: recolhida no fim (o quadro e a base numa linha), aberta (as tabelas do Teable
// achadas pelo nome, com o nome no Postgres que o Teable deu), trocar o quadro com o nome digitado (o errado não deixa)
// e o PROMeiro ligando tudo de novo pelo nome no quadro novo (a INTER, que lá não tem listas, vira exceção); e o aviso
// no topo quando uma tabela não tem uma coluna que o código usa.
// A seção Pessoas (#77), claro e escuro: o pontinho no menu do perfil quando há novidade; quem apareceu na produção
// (os designers da produção da arte falsa × a tabela designers do Teable falso; nada do Trello, ADR 0006) tornada
// administradora com o e-mail digitado e cadastrada como designer (grava no Teable falso); os administradores no "ver
// tudo" (a chave-mestra, "você", não dá para tirar a si mesmo); o designer sem produção ignorado (vai para o "ver
// tudo"), desfeito, tirado de administrador e marcado inativo (grava no Teable falso). No celular, só consulta.
// O Histórico (#78), claro e escuro: pelo rodapé da Configuração; as mudanças (Pessoas e Praças, pela API como a tela
// faz) com quem, quando e o antigo → o novo pelos nomes; voltar travado (a lista antiga foi arquivada) com o porquê;
// voltar que vale na hora e entra no histórico. No celular, só consulta.
// Fora do ar (#79), claro e escuro: com o Trello fora, Praças, Card e Filmes mostram o salvo com os nomes da última
// leitura, a linha "O Trello não responde desde…" e nada para mudar (salvar pela API é recusado); com o Teable fora, as
// Conexões travam trocar a base. "Pode apagar do Portainer", pelo rodapé: o que pode sair (as variáveis das praças,
// salvas na tela, e as que o código não lê mais), com "Copiar os nomes"; o que ainda não; o que fica. No celular, os
// dois, só consulta.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:configuracao
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
  // os cards de filme (#75)
  ['lFilmes', 'FILMES'],
].map(([id, name, closed = false]) => ({ id, name, closed }));
// a segunda saída de INTER: só no cenário com exceções
const DOBRO = { id: 'lINs2', name: 'INTER ENTREGUE (2025)', closed: false };
let comDobro = false;
const OPCOES = ['G5', 'SP', 'RJ', 'INTER'].map((t) => ({ id: `o${t}`, value: { text: t } }));
const opcoes = (...xs) => xs.map(([id, text, color]) => ({ id, value: { text }, color }));
// os campos do card (#74): a Prioridade ganha a segunda ALTA só no cenário com dobro; há uma Complexidade nova, com
// as três opções em outra ordem e sem a MÉDIA
const PRIORIDADE = opcoes(['pAlta', 'ALTA', 'red'], ['pMedia', 'MÉDIA', 'yellow']);
const ALTA_EM_DOBRO = opcoes(['pAlta2', 'ALTA', 'orange'])[0];
const CAMPOS = [
  { id: 'cPraca', name: 'Praça', type: 'list', options: [...OPCOES] },
  { id: 'cPrio', name: 'Prioridade', type: 'list', options: [...PRIORIDADE] },
  { id: 'cCx', name: 'Complexidade', type: 'list', options: opcoes(['xBaixa', 'BAIXA', 'green'], ['xMedia', 'MÉDIA', 'yellow'], ['xAlta', 'ALTA', 'red']) },
  { id: 'cCx2', name: 'Complexidade 2026', type: 'list', options: opcoes(['yAlta', 'ALTA', 'red'], ['yBaixa', 'BAIXA', 'green']) },
  { id: 'cRed', name: 'Redator', type: 'list', options: [] },
  { id: 'cEd', name: 'Editor', type: 'list', options: [] },
  { id: 'cProjeto', name: 'Projeto', type: 'text' },
  { id: 'cOut', name: 'Output', type: 'text' },
  { id: 'cBot', name: 'BOT', type: 'checkbox' },
  { id: 'cEnt', name: 'Entrada', type: 'date' },
  { id: 'cIA', name: 'Uso de IA', type: 'checkbox' },
];
// as etiquetas do quadro (#75): a de todo card de filme e a de cada sessão; a do Domingo Maior não tem o nome dele
const ETIQUETAS = [
  ['eFilme', 'FILME', 'purple'],
  ['eSuper', 'SUPERCINE', 'blue'],
  ['eTQ', 'TELA QUENTE', 'red'],
  ['eCoruja', 'CORUJAO', 'black'],
  ['eTarde', 'SESSÃO DA TARDE', 'yellow'],
  ['eDom', 'DOM. MAIOR', 'green'],
  ['eUrg', 'URGENTE', 'orange'],
].map(([id, name, color]) => ({ id, name, color }));
// as sessões de filme do cadastro de atrações; o Domingo Maior entra só no cenário com exceção
const SESSOES = ['Supercine', 'Tela Quente', 'Corujão', 'Sessão da Tarde'];
const sessoesDoCadastro = [...SESSOES];
const FILMES_DO_PORTAINER = {
  TRELLO_LISTA_FILMES: 'lFilmes',
  TRELLO_FILMES_ETIQUETAS: 'eFilme',
  TRELLO_FILMES_ETIQUETAS_SESSAO: 'SUPERCINE=eSuper,TELA QUENTE=eTQ,CORUJAO=eCoruja,SESSAO DA TARDE=eTarde',
  // a opção da praça, como no Portainer de hoje: a tela mostra a praça dela
  TRELLO_FILMES_PRACA: 'oG5',
};
const CARD_DO_PORTAINER = {
  TRELLO_CAMPO_PRIORIDADE: 'cPrio',
  TRELLO_PRIORIDADE_ALTA: 'pAlta',
  TRELLO_PRIORIDADE_MEDIA: 'pMedia',
  TRELLO_CAMPO_COMPLEXIDADE: 'cCx',
  TRELLO_COMPLEXIDADE_OPCOES: 'xBaixa,xMedia,xAlta',
  TRELLO_CAMPO_REDATOR: 'cRed',
  TRELLO_CAMPO_EDITOR: 'cEd',
  TRELLO_CAMPO_PROJETO: 'cProjeto',
  TRELLO_CAMPO_OUTPUT: 'cOut',
  TRELLO_CAMPO_BOT: 'cBot',
  TRELLO_CAMPO_ENTRADA: 'cEnt',
  TRELLO_LISTA_VT: 'lVT',
  TRELLO_CAMPOS_FILME: 'cCx,cIA',
};
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
  // o card: tudo como o nome acharia (a seção Card começa sem mudança)
  ...CARD_DO_PORTAINER,
  // os filmes: idem
  ...FILMES_DO_PORTAINER,
};
// os quadros (#76): o de hoje e o novo, com os mesmos nomes e outros ids; no novo, a INTER não tem listas
const comoNovo = (x) => ({ ...x, id: `n${x.id}` });
const QUADROS = {
  quadroFicticio: { nome: 'Arte · Promo', listas: () => (comDobro ? [...LISTAS, DOBRO] : LISTAS), campos: () => CAMPOS, etiquetas: () => ETIQUETAS },
  quadroNovo: {
    nome: 'Arte · Promo 2027',
    listas: () => LISTAS.filter((l) => !/INTER/.test(l.name)).map(comoNovo),
    campos: () => CAMPOS.map((c) => ({ ...comoNovo(c), options: c.options?.map(comoNovo) })),
    etiquetas: () => ETIQUETAS.map(comoNovo),
  },
};
// quem aparece na produção da arte (#77, ADR 0006): nomes fictícios; a tabela designers do Teable falso está em DESIGNERS
const NA_PRODUCAO = ['Lia Moraes', 'Bia Sampaio', 'Caio Brandão'];
const BIA_ENTROU = 'entrou:BIA SAMPAIO';
const OTAVIO = 'otavio.lins@exemplo.com';
const BIA = 'bia.sampaio@exemplo.com';
const designersDoComeco = () => [
  { id: 'recLia', fields: { designer: 'Lia Moraes', status: 'ativo', email: LIA, designer_ID: 'mLia' } },
  { id: 'recCaio', fields: { designer: 'Caio Brandão', status: 'ativo', designer_ID: 'mCaio' } },
  { id: 'recOtavio', fields: { designer: 'Otávio Lins', status: 'ativo', email: OTAVIO, designer_ID: 'mOtavio' } },
  { id: 'recEva', fields: { designer: 'Eva Luz', status: 'inativo', designer_ID: 'mEva' } },
];
const DESIGNERS = designersDoComeco();
const pedidosAoTrello = [];
// #79: o Trello fora do ar responde 503 a tudo
let trelloFora = false;
async function buscar(url, init = {}) {
  const u = new URL(url);
  const metodo = init.method ?? 'GET';
  pedidosAoTrello.push(`${metodo} ${u.pathname}`);
  if (trelloFora) return { ok: false, status: 503, json: async () => ({}), text: async () => 'Service Unavailable' };
  const ok = (dados) => ({ ok: true, status: 200, json: async () => dados, text: async () => '' });
  // a única escrita: a opção da praça nova no campo Praça
  if (metodo === 'POST' && u.pathname === '/1/customField/cPraca/options') {
    const opcao = { id: `oNova${CAMPOS[0].options.length}`, value: { text: JSON.parse(init.body).value.text } };
    CAMPOS[0].options.push(opcao);
    return ok(opcao);
  }
  if (metodo !== 'GET') throw new Error(`a Configuração só lê o Trello: ${metodo} ${u.pathname}`);
  if (/^\/1\/lists\/\w+$/.test(u.pathname)) return ok({ id: u.pathname.split('/')[3], idBoard: 'quadroFicticio' });
  // as Conexões (#76): os quadros que o token enxerga e o nome de cada um
  if (u.pathname === '/1/members/me/boards') return ok(Object.entries(QUADROS).map(([id, q]) => ({ id, name: q.nome })));
  const doQuadro = /^\/1\/boards\/(\w+)(\/\w+)?$/.exec(u.pathname);
  if (doQuadro && QUADROS[doQuadro[1]]) {
    const q = QUADROS[doQuadro[1]];
    if (!doQuadro[2]) return ok({ id: doQuadro[1], name: q.nome });
    if (doQuadro[2] === '/lists') return ok(q.listas());
    if (doQuadro[2] === '/customFields') return ok(q.campos());
    if (doQuadro[2] === '/labels') return ok(q.etiquetas());
  }
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
// a seção Praças e a seção Card (#74)
const PRACAS = '.cfg-secao[aria-labelledby="cfg-pracas"]';
const CARD = '.cfg-secao[data-secao="card"]';
const resumo = async (p, secao = PRACAS) => (await p.locator(`${secao} .cfg-estado`).textContent()).trim();
const excecoes = (p, secao = PRACAS) => textos(p.locator(`${secao} .cfg-exc .cfg-exc-texto strong`));
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
  assert.equal(await p.locator(`${PRACAS} .cfg-exc`).count(), 0);
  assert.deepEqual(await ordem(p), ['G5', 'RJ', 'SP', 'INTER']);
  assert.deepEqual(await textos(regra(p, 'G5').locator('.cfg-regra > *')), ['quando a claquete não diz', 'também REDE MG DF PE', 'FESTA 3/11 → G5']);
  assert.deepEqual(await textos(regra(p, 'RJ').locator('.cfg-regra > *')), ['começa com RIO', 'RIO FESTA 3/11 → RJ']);
  assert.deepEqual(await textos(regra(p, 'INTER').locator('.cfg-regra > *')), ['termina em INTER ou INTERNACIONAL', 'também INTERNACIONAL', 'FESTA 3/11 INTER → INTER']);
  assert.equal(await regra(p, 'G5').locator('.cfg-marca.padrao').count(), 1);
  assert.equal(await barra(p), '');
  await semRolagemDeLado(p, `computador ${nome}, tudo ligado`);
  await capturar(p, `02-tudo-ligado-${nome}`);
  // o "?" explica
  await p.locator(`${PRACAS} .cfg-ajuda button`).click();
  assert.match(await p.locator('.cfg-ajuda-texto').textContent(), /liga pelo nome/);
  await capturar(p, `02b-ajuda-${nome}`);
  await p.keyboard.press('Escape');
  // ver tudo: cada ligação e como foi ligada
  await p.locator(`${PRACAS} .cfg-ver-tudo`).click();
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="SP.entrada"] > span')), ['Entrada', 'SP ENTRADA', 'achado pelo nome · trocar']);
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="campo"] > span')), ['Campo Praça', 'Praça', 'achado pelo nome · trocar']);
  await capturar(p, `02c-ver-tudo-${nome}`);
  await p.locator(`${PRACAS} .cfg-ver-tudo`).click();

  // com exceções: a G5 nas listas do RJ (à mão, dividida) e a saída de INTER em dobro
  await recomecar(app, { excecoes: true });
  await p.reload();
  await p.locator(`${PRACAS} .cfg-exc`).first().waitFor();
  assert.equal(await resumo(p), '4 praças · 1 em dobro · 2 à mão');
  assert.deepEqual(await excecoes(p), ['G5 usa as listas do RJ', 'INTER: duas listas de saída']);
  assert.deepEqual(await textos(p.locator(`${PRACAS} .cfg-exc .cfg-exc-texto span`)), ['ligada à mão · dividida com RJ', '"INTER ENTREGUE" e "INTER ENTREGUE (2025)". Qual vale?']);
  assert.equal(await regra(p, 'G5').locator('.cfg-marca.mao').count(), 1);
  await semRolagemDeLado(p, `computador ${nome}, com exceções`);
  await capturar(p, `03-com-excecoes-${nome}`);

  // ligar à mão: Escolher a saída de INTER
  await p.locator(`${PRACAS} .cfg-exc`, { hasText: 'INTER: duas' }).locator('.botao', { hasText: 'Escolher' }).click();
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
  await p.locator(`${PRACAS} .cfg-exc`).first().waitFor();
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
  assert.equal(await p.locator(`${PRACAS} .cfg-exc`).count(), 1, 'só o aviso do n8n: entrada e saída ligadas pelo nome');
  await p.locator(`${PRACAS} .cfg-ver-tudo`).click();
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="MG.entrada"] > span')), ['Entrada', 'MG ENTRADA', 'achado pelo nome · trocar']);
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="MG.saida"] > span')), ['Saída', 'MG PRONTO', 'achado pelo nome · trocar']);
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="MG.opcao"] > span')), ['No campo Praça', '—', 'o PROMeiro cria ao salvar · trocar']);
  await p.locator(`${PRACAS} .cfg-ver-tudo`).click();
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

/* ---------- a seção Card (#74) ---------- */

/** O card volta ao Portainer; `dobro` põe a segunda ALTA na Prioridade e salva a ALTA vazia (ela vira exceção). */
async function recomecarCard(app, { dobro }) {
  CAMPOS[1].options = dobro ? [...PRIORIDADE, ALTA_EM_DOBRO] : [...PRIORIDADE];
  const voltar = Object.fromEntries(Object.keys(CARD_DO_PORTAINER).map((k) => [k, null]));
  await app.mudarConfiguracao({ ...voltar, LIGADO_A_MAO: null, ...(dobro ? { TRELLO_PRIORIDADE_ALTA: '' } : {}) }).antigaFechada;
}
const linhaDoCard = (p, chave) => textos(p.locator(`${CARD} .cfg-tudo-l[data-chave="${chave}"] > span`));
const linhasDoQueMuda = (dialogo) => dialogo.locator('.cfg-muda tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim()).filter(Boolean).join(' | ')));

async function secaoCard(navegador, url, app, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await recomecarCard(app, { dobro: false });
  pedidosAoTrello.length = 0;
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  const card = p.locator(CARD);
  await card.waitFor();

  // tudo ligado: só a linha de estado; o "?" explica; o "ver tudo" mostra cada campo e como foi ligado
  assert.equal(await resumo(p, CARD), 'tudo ligado');
  const dasPracas = await resumo(p);
  assert.equal(await card.locator('.cfg-exc').count(), 0);
  assert.equal(await card.locator('.cfg-secao-corpo').count(), 0, 'tudo ligado: a seção fica só com a linha de estado');
  assert.equal(await barra(p), '');
  await card.locator('.cfg-ajuda button').click();
  assert.match(await card.locator('.cfg-ajuda-texto').textContent(), /pelo nome e pelo tipo/);
  await p.keyboard.press('Escape');
  await card.locator('.cfg-ver-tudo').click();
  assert.deepEqual(await linhaDoCard(p, 'card.prioridade'), ['Campo', 'Prioridade', 'achado pelo nome · trocar']);
  assert.deepEqual(await linhaDoCard(p, 'card.complexidade.MEDIA'), ['MÉDIA', 'MÉDIA', 'achado pelo nome · trocar']);
  assert.deepEqual(await linhaDoCard(p, 'card.bot'), ['BOT', 'BOT', 'achado pelo nome · trocar']);
  assert.deepEqual(await linhaDoCard(p, 'card.vt'), ['Lista do VT', 'VT', 'achado pelo nome · trocar']);
  assert.deepEqual(await linhaDoCard(p, 'card.doFilme'), ['Copiados do filme', 'Complexidade, Uso de IA', 'escolhidos · trocar']);
  await semRolagemDeLado(p, `card ${nome}, ver tudo`);
  await card.scrollIntoViewIfNeeded();
  await capturar(p, `20-card-tudo-ligado-${nome}`);
  await card.locator('.cfg-ver-tudo').click();

  // com dobro: a Prioridade tem ALTA duas vezes, e a ALTA está vazia
  await recomecarCard(app, { dobro: true });
  await p.reload();
  await card.locator('.cfg-exc').first().waitFor();
  assert.equal(await resumo(p, CARD), '1 em dobro');
  assert.deepEqual(await excecoes(p, CARD), ['Prioridade: duas opções "ALTA"']);
  assert.deepEqual(await textos(card.locator('.cfg-exc .cfg-exc-texto span')), ['o campo Prioridade tem ALTA duas vezes. Qual vale?']);
  assert.equal(await resumo(p), dasPracas, 'as praças não mudam');
  await semRolagemDeLado(p, `card ${nome}, com dobro`);
  await capturar(p, `21-card-com-dobro-${nome}`);

  // Escolher: as duas ALTA primeiro, cada uma com a posição e a cor no campo
  await card.locator('.cfg-exc .botao', { hasText: 'Escolher' }).click();
  const escolher = p.locator('.cfg-escolher');
  await escolher.waitFor();
  assert.equal(await escolher.locator('.cfg-escolher-titulo').textContent(), 'ALTA no campo Prioridade');
  assert.deepEqual(await textos(escolher.locator('li button')), ['ALTA1ª do campo · vermelha', 'ALTA3ª do campo · laranja', 'MÉDIA2ª do campo · amarela']);
  await capturar(p, `22-card-escolher-${nome}`);
  await escolher.locator('li button', { hasText: '3ª do campo' }).click();
  assert.deepEqual(await excecoes(p, CARD), ['Prioridade ALTA: "ALTA (a 3ª do campo)"']);
  assert.equal(await resumo(p, CARD), 'tudo ligado · 1 à mão');
  assert.equal(await barra(p), '1 mudança');

  // trocar o campo Complexidade: só campos de lista; as opções do campo novo ligam pelo nome, a que falta fica pedindo
  await card.locator('.cfg-ver-tudo').click();
  await card.locator('.cfg-tudo-l[data-chave="card.complexidade"] .botao-texto', { hasText: 'trocar' }).click();
  await escolher.waitFor();
  assert.equal(await escolher.locator('.cfg-escolher-titulo').textContent(), 'Campo Complexidade');
  assert.equal(await escolher.locator('li button', { hasText: 'Projeto' }).isDisabled(), true);
  assert.deepEqual(await textos(escolher.locator('li button', { hasText: 'Redator' }).locator('.nota')), ['é o campo Redator']);
  await escolher.locator('li button', { hasText: 'Complexidade 2026' }).click();
  assert.deepEqual(await linhaDoCard(p, 'card.complexidade'), ['Campo', 'Complexidade 2026', 'ligado à mão · trocar']);
  assert.deepEqual(await linhaDoCard(p, 'card.complexidade.BAIXA'), ['BAIXA', 'BAIXA', 'achado pelo nome · trocar']);
  assert.deepEqual(await linhaDoCard(p, 'card.complexidade.MEDIA'), ['MÉDIA', '—', 'não achado · trocar']);
  assert.deepEqual(await linhaDoCard(p, 'card.complexidade.ALTA'), ['ALTA', 'ALTA', 'achado pelo nome · trocar']);
  assert.deepEqual(await excecoes(p, CARD), ['Prioridade ALTA: "ALTA (a 3ª do campo)"', 'Complexidade: "Complexidade 2026"', 'Complexidade: sem a opção MÉDIA']);
  assert.equal(await resumo(p, CARD), '1 não achado · 2 à mão');
  assert.equal(await barra(p), '5 mudanças');
  await semRolagemDeLado(p, `card ${nome}, trocar o campo`);
  await capturar(p, `23-card-trocar-campo-${nome}`);

  // conferir: o que muda; salvar vale na hora (a configuração viva já tem as opções novas)
  await p.locator('.cfg-barra-salvar').click();
  const dialogo = p.locator('.cfg-modal');
  await dialogo.locator('h2', { hasText: 'Tudo confere' }).waitFor();
  assert.deepEqual(await linhasDoQueMuda(dialogo), [
    'Prioridade ALTA | — | ALTA (a 3ª do campo) (à mão)',
    'Complexidade | Complexidade | Complexidade 2026 (à mão)',
    'Complexidade BAIXA | BAIXA | BAIXA',
    'Complexidade MÉDIA | MÉDIA | —',
    'Complexidade ALTA | ALTA | ALTA',
  ]);
  assert.deepEqual(await textos(dialogo.locator('.cfg-checks li.aviso')), ['Complexidade MÉDIAnada ligado: o card de complexidade MÉDIA vai sem ela.']);
  assert.equal(await dialogo.locator('.cfg-claquetes').count(), 0, 'só o card foi conferido');
  await capturar(p, `24-card-conferir-${nome}`);
  await dialogo.locator('.botao.primario', { hasText: 'Salvar' }).click();
  await p.locator('.aviso', { hasText: 'Salvo. Já vale.' }).waitFor();
  assert.equal(await barra(p), '');
  const env = app.modulos().env;
  assert.deepEqual([env.TRELLO_PRIORIDADE_ALTA, env.TRELLO_CAMPO_COMPLEXIDADE, env.TRELLO_COMPLEXIDADE_OPCOES], ['pAlta2', 'cCx2', 'yBaixa,,yAlta']);
  await p.reload();
  await card.locator('.cfg-exc').first().waitFor();
  assert.deepEqual(await excecoes(p, CARD), ['Prioridade ALTA: "ALTA (a 3ª do campo)"', 'Complexidade: "Complexidade 2026"', 'Complexidade: sem a opção MÉDIA']);
  assert.equal(await resumo(p), dasPracas, 'salvar o card não mexe nas praças');
  assert.deepEqual([...new Set(pedidosAoTrello.map((x) => x.split(' ')[0]))], ['GET'], 'o card só lê o Trello');

  assert.deepEqual(erros, [], `card ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: card ${nome}: tudo ligado (?, ver tudo) → ALTA em dobro → escolher → trocar o campo Complexidade limpa as opções → conferir e salvar, vale na hora`);
}

async function cardNoCelular(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema });
  const card = p.locator(CARD);
  await card.locator('.cfg-exc').first().waitFor();
  assert.equal(await resumo(p, CARD), '1 não achado · 2 à mão');
  assert.deepEqual(await excecoes(p, CARD), ['Prioridade ALTA: "ALTA (a 3ª do campo)"', 'Complexidade: "Complexidade 2026"', 'Complexidade: sem a opção MÉDIA']);
  // só consulta: nada de Escolher, desfazer ou trocar
  assert.equal(await card.locator('.cfg-exc button').count(), 0);
  await card.locator('.cfg-ver-tudo').tap();
  assert.deepEqual(await linhaDoCard(p, 'card.complexidade.MEDIA'), ['MÉDIA', '—', 'não achado']);
  assert.equal(await card.locator('.cfg-tudo button').count(), 0);
  await semRolagemDeLado(p, `card no celular ${nome}`);
  await card.scrollIntoViewIfNeeded();
  await capturar(p, `25-card-celular-${nome}`);
  assert.deepEqual(erros, [], `card no celular ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: card no celular ${nome}: a linha de estado, as exceções e o ver tudo, só consulta`);
}

/* ---------- a seção Filmes (#75) ---------- */

const FILMES = '.cfg-secao[data-secao="filmes"]';
/** Os filmes voltam ao Portainer; `excecao` põe o Domingo Maior no cadastro (sem etiqueta com o nome dele). */
async function recomecarFilmes(app, { excecao }) {
  sessoesDoCadastro.splice(0, sessoesDoCadastro.length, ...SESSOES, ...(excecao ? ['Domingo Maior'] : []));
  const voltar = Object.fromEntries([...Object.keys(FILMES_DO_PORTAINER), 'FILMES_INTERVALO_MS', 'FILMES_TEMPO_MS'].map((k) => [k, null]));
  await app.mudarConfiguracao({ ...voltar, LIGADO_A_MAO: null }).antigaFechada;
}
const linhaDosFilmes = (p, chave) => textos(p.locator(`${FILMES} .cfg-tudo-l[data-chave="${chave}"] > span`));
const pracaDosFilmes = (p) => p.locator(`${FILMES} .cfg-filmes-praca [role="radio"][aria-checked="true"]`).allTextContents();

async function secaoFilmes(navegador, url, app, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await recomecarFilmes(app, { excecao: false });
  pedidosAoTrello.length = 0;
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  const filmes = p.locator(FILMES);
  await filmes.waitFor();

  // tudo ligado: a linha de estado e a praça dos cards (a opção do Portainer é a da G5); sem exceção e sem barra
  assert.equal(await resumo(p, FILMES), '4 sessões · tudo ligado');
  assert.deepEqual(await pracaDosFilmes(p), ['G5']);
  // as praças da tela (a MG, criada no passo da praça nova, junto)
  assert.deepEqual(await textos(filmes.locator('.cfg-filmes-praca [role="radio"]')), ['G5', 'RJ', 'SP', 'INTER', 'MG']);
  assert.equal(await filmes.locator('.cfg-exc').count(), 0);
  assert.equal(await barra(p), '');
  await filmes.locator('.cfg-ajuda button').click();
  assert.match(await filmes.locator('.cfg-ajuda-texto').textContent(), /cadastro de atrações/);
  await p.keyboard.press('Escape');
  await semRolagemDeLado(p, `filmes ${nome}, tudo ligado`);
  await filmes.scrollIntoViewIfNeeded();
  await capturar(p, `30-filmes-tudo-ligado-${nome}`);
  // ver tudo: a lista, a etiqueta de todos, a de cada sessão e os números da leitura da prévia
  await filmes.locator('.cfg-ver-tudo').click();
  assert.deepEqual(await linhaDosFilmes(p, 'filmes.lista'), ['Lista dos cards', 'FILMES', 'achada pelo nome · trocar']);
  assert.deepEqual(await linhaDosFilmes(p, 'filmes.etiqueta'), ['Etiqueta de todos', 'FILME', 'achada pelo nome · trocar']);
  assert.deepEqual(await linhaDosFilmes(p, 'filmes.sessao.CORUJAO'), ['Corujão', 'CORUJAO', 'achada pelo nome · trocar']);
  assert.deepEqual(await linhaDosFilmes(p, 'filmes.sessao.SESSAO DA TARDE'), ['Sessão da Tarde', 'SESSÃO DA TARDE', 'achada pelo nome · trocar']);
  assert.deepEqual(await linhaDosFilmes(p, 'filmes.pausa'), ['Pausa entre páginas', 's', 'padrão']);
  assert.equal(await filmes.getByLabel('Pausa entre páginas, em segundos').getAttribute('placeholder'), '2,5');
  assert.deepEqual(await linhaDosFilmes(p, 'filmes.espera'), ['Espera por página', 's', 'padrão']);
  await semRolagemDeLado(p, `filmes ${nome}, ver tudo`);
  await filmes.scrollIntoViewIfNeeded();
  await capturar(p, `31-filmes-ver-tudo-${nome}`);
  await filmes.locator('.cfg-ver-tudo').click();

  // a sessão nova no cadastro, sem etiqueta com o nome dela: é exceção
  await recomecarFilmes(app, { excecao: true });
  await p.reload();
  await filmes.locator('.cfg-exc').first().waitFor();
  assert.equal(await resumo(p, FILMES), '5 sessões · 1 não achado');
  assert.deepEqual(await excecoes(p, FILMES), ['Domingo Maior: sem etiqueta']);
  assert.deepEqual(await textos(filmes.locator('.cfg-exc .cfg-exc-texto span')), ['nenhuma etiqueta "Domingo Maior" no quadro: o card sai só com a de todos']);
  await semRolagemDeLado(p, `filmes ${nome}, sessão sem etiqueta`);
  await filmes.scrollIntoViewIfNeeded();
  await capturar(p, `32-filmes-sessao-sem-etiqueta-${nome}`);

  // Escolher: as etiquetas do quadro, cada uma com a cor e de quem já é
  await filmes.locator('.cfg-exc .botao', { hasText: 'Escolher' }).click();
  const escolher = p.locator('.cfg-escolher');
  await escolher.waitFor();
  assert.equal(await escolher.locator('.cfg-escolher-titulo').textContent(), 'Etiqueta de Domingo Maior');
  assert.deepEqual(await textos(escolher.locator('li button', { hasText: 'SUPERCINE' }).locator('.nota')), ['é a de Supercine · azul']);
  await capturar(p, `33-filmes-escolher-${nome}`);
  await escolher.locator('li button', { hasText: 'DOM. MAIOR' }).click();
  assert.deepEqual(await excecoes(p, FILMES), ['Domingo Maior: "DOM. MAIOR"']);
  assert.equal(await resumo(p, FILMES), '5 sessões · tudo ligado · 1 à mão');
  // a praça dos cards e a pausa da leitura
  await filmes.locator('.cfg-filmes-praca [role="radio"]', { hasText: 'SP' }).click();
  assert.deepEqual(await pracaDosFilmes(p), ['SP']);
  await filmes.locator('.cfg-ver-tudo').click();
  await filmes.getByLabel('Pausa entre páginas, em segundos').fill('5');
  assert.deepEqual(await linhaDosFilmes(p, 'filmes.pausa'), ['Pausa entre páginas', 's', 'padrão: 2,5 s']);
  assert.equal(await barra(p), '3 mudanças');

  // conferir: o que muda; salvar vale na hora
  await p.locator('.cfg-barra-salvar').click();
  const dialogo = p.locator('.cfg-modal');
  await dialogo.locator('h2', { hasText: 'Tudo confere' }).waitFor();
  assert.deepEqual(await linhasDoQueMuda(dialogo), [
    'Praça dos cards de filme | G5 | SP',
    'Etiqueta de Domingo Maior | — | DOM. MAIOR (à mão)',
    'Pausa entre páginas | 2,5 s (padrão) | 5 s',
  ]);
  await capturar(p, `34-filmes-conferir-${nome}`);
  await dialogo.locator('.botao.primario', { hasText: 'Salvar' }).click();
  await p.locator('.aviso', { hasText: 'Salvo. Já vale.' }).waitFor();
  assert.equal(await barra(p), '');
  const env = app.modulos().env;
  assert.equal(env.TRELLO_FILMES_PRACA, 'SP');
  assert.match(env.TRELLO_FILMES_ETIQUETAS_SESSAO, /(^|,)Domingo Maior=eDom(,|$)/);
  assert.equal(env.FILMES_INTERVALO_MS, '5000');
  // o card de filme criado agora já vai com a opção de SP no campo Praça
  assert.equal(app.modulos().trello.config.filmes.praca, 'oSP');
  await p.reload();
  await filmes.locator('.cfg-exc').first().waitFor();
  assert.deepEqual(await excecoes(p, FILMES), ['Domingo Maior: "DOM. MAIOR"']);
  assert.deepEqual(await pracaDosFilmes(p), ['SP']);
  assert.deepEqual([...new Set(pedidosAoTrello.map((x) => x.split(' ')[0]))], ['GET'], 'os filmes só leem o Trello');

  assert.deepEqual(erros, [], `filmes ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: filmes ${nome}: tudo ligado (praça, ?, ver tudo) → sessão sem etiqueta é exceção → escolher → praça e pausa → conferir e salvar, vale na hora`);
}

async function filmesNoCelular(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema });
  const filmes = p.locator(FILMES);
  await filmes.locator('.cfg-exc').first().waitFor();
  assert.equal(await resumo(p, FILMES), '5 sessões · tudo ligado · 1 à mão');
  assert.deepEqual(await pracaDosFilmes(p), ['SP']);
  // só consulta: a praça não muda, nada de Escolher, desfazer, trocar ou número para digitar
  assert.equal(await filmes.locator('.cfg-filmes-praca [role="radio"]:not([disabled])').count(), 0);
  assert.equal(await filmes.locator('.cfg-exc button').count(), 0);
  await filmes.locator('.cfg-ver-tudo').tap();
  assert.deepEqual(await linhaDosFilmes(p, 'filmes.sessao.DOMINGO MAIOR'), ['Domingo Maior', 'DOM. MAIOR', 'ligada à mão']);
  assert.deepEqual(await linhaDosFilmes(p, 'filmes.pausa'), ['Pausa entre páginas', '5 s', 'configurado']);
  assert.deepEqual(await linhaDosFilmes(p, 'filmes.espera'), ['Espera por página', '4 min', 'padrão']);
  assert.equal(await filmes.locator('.cfg-tudo button, .cfg-tudo input').count(), 0);
  await semRolagemDeLado(p, `filmes no celular ${nome}`);
  await filmes.scrollIntoViewIfNeeded();
  await capturar(p, `35-filmes-celular-${nome}`);
  assert.deepEqual(erros, [], `filmes no celular ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: filmes no celular ${nome}: a linha de estado, a praça, as exceções e o ver tudo, só consulta`);
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
  await p.locator(`${PRACAS} .cfg-exc`).first().waitFor();
  assert.match(await p.locator('.cfg-so-consulta').textContent(), /só consulta/);
  assert.equal(await resumo(p), '4 praças · tudo ligado · 3 à mão');
  assert.deepEqual(await excecoes(p), ['G5 usa as listas do RJ', 'INTER usa "INTER ENTREGUE" na saída']);
  // só consulta: nada de Escolher, desfazer, alça, regra que abre ou barra
  assert.equal(await p.locator('.cfg-exc button, .cfg-alca, button.cfg-ed, .cfg-barra').count(), 0);
  assert.deepEqual(await textos(regra(p, 'SP').locator('.cfg-ed.regra')), ['termina em SP ou PAULISTA']);
  await semRolagemDeLado(p, `celular ${nome}`);
  await capturar(p, `10-celular-${nome}`);
  await p.locator(`${PRACAS} .cfg-ver-tudo`).tap();
  assert.deepEqual(await textos(p.locator('.cfg-tudo-l[data-chave="INTER.saida"] > span')), ['Saída', 'INTER ENTREGUE', 'ligado à mão']);
  assert.equal(await p.locator('.cfg-tudo button').count(), 0);
  await semRolagemDeLado(p, `celular ${nome}, ver tudo`);
  await capturar(p, `11-celular-ver-tudo-${nome}`);
  assert.deepEqual(erros, [], `celular ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: celular ${nome}: a linha de estado, as exceções, as regras e o ver tudo, só consulta`);
}

/* ---------- as Conexões (#76) ---------- */

const CONEXOES = '.cfg-secao[data-secao="conexoes"]';
/** Volta tudo ao Portainer (nada salvo na tela) e o Teable sem coluna faltando. */
async function voltarAoPortainer(app, teable) {
  const { SALVAVEIS } = await import(join(RAIZ, 'servidor', 'configuracao.mjs'));
  comDobro = false;
  CAMPOS[0].options = [...OPCOES];
  // o que as seções de antes mudaram no quadro e no cadastro (a ALTA em dobro, o Domingo Maior) volta ao começo
  CAMPOS[1].options = [...PRIORIDADE];
  sessoesDoCadastro.splice(0, sessoesDoCadastro.length, ...SESSOES);
  for (const k of Object.keys(teable.faltando)) delete teable.faltando[k];
  await app.mudarConfiguracao(Object.fromEntries([...SALVAVEIS].map((n) => [n, null]))).antigaFechada;
  await app.descobrirAsTabelas();
}

async function conexoes(navegador, url, app, teable, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await voltarAoPortainer(app, teable);
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  await p.locator(CONEXOES).waitFor();
  // recolhida, no fim: o quadro e a base numa linha; sem aviso no topo
  assert.equal(await resumo(p, CONEXOES), 'Trello: Arte · Promo · Teable: Base falsa');
  assert.equal(await p.locator(`${CONEXOES} .cfg-con-l`).count(), 0);
  assert.equal(await p.locator('.cfg-aviso-topo').count(), 0);
  assert.equal(await p.locator('.cfg-secao').last().getAttribute('data-secao'), 'conexoes');
  await semRolagemDeLado(p, `conexões ${nome}, recolhida`);
  await p.locator(CONEXOES).scrollIntoViewIfNeeded();
  await capturar(p, `40-conexoes-recolhida-${nome}`);

  // aberta: o quadro, a base e as tabelas achadas pelo nome, com o nome no Postgres que o Teable deu
  await p.locator(`${CONEXOES} .cfg-ver-tudo`).click();
  assert.equal(await p.locator(`${CONEXOES} .cfg-con-l`).count(), 2);
  assert.deepEqual(await textos(p.locator(`${CONEXOES} .cfg-con-texto small`)), ['Arte · Promo · achado pela lista de uma praça', 'Base falsa · 13 tabelas achadas pelo nome']);
  assert.deepEqual(await textos(p.locator(`${CONEXOES} .cfg-tudo-l`, { hasText: 'Produção da arte' }).locator('> span')), ['Produção da arte', 'arte_producao_x7', 'achada pelo nome']);
  assert.deepEqual(await textos(p.locator(`${CONEXOES} .cfg-tudo-l`, { hasText: 'Designers' }).locator('> span')), ['Designers', 'designers_x6', 'achada pelo nome']);
  await semRolagemDeLado(p, `conexões ${nome}, aberta`);
  await capturar(p, `41-conexoes-aberta-${nome}`);

  // trocar o quadro: escolher o novo e digitar o nome dele; o nome errado não deixa
  await p.locator(`${CONEXOES} .cfg-con-l`, { hasText: 'Quadro do Trello' }).locator('.botao', { hasText: 'Trocar' }).click();
  const dialogo = p.locator('.cfg-trocar');
  await dialogo.locator('.cfg-escolher-conexao button').first().waitFor();
  assert.deepEqual(await textos(dialogo.locator('.cfg-escolher-conexao button')), ['Arte · Promo 2027']);
  await dialogo.locator('.cfg-escolher-conexao button').click();
  assert.equal((await dialogo.locator('h2').textContent()).trim(), 'Para Arte · Promo 2027?');
  const trocar = dialogo.locator('.botao.perigoso');
  assert.equal(await trocar.isDisabled(), true);
  await dialogo.locator('input').fill('Arte · Promo');
  assert.equal(await trocar.isDisabled(), true);
  await dialogo.locator('input').fill('arte promo 2027');
  assert.equal(await trocar.isDisabled(), false);
  await capturar(p, `42-trocar-quadro-${nome}`);
  await trocar.click();
  await p.locator('.aviso', { hasText: 'Quadro trocado' }).waitFor();
  assert.equal(await dialogo.count(), 0);
  // ligado de novo pelo nome: o quadro novo vale, e a INTER, sem listas lá, vira exceção
  assert.equal(await resumo(p, CONEXOES), 'Trello: Arte · Promo 2027 · Teable: Base falsa');
  assert.equal(app.modulos().env.TRELLO_QUADRO, 'quadroNovo');
  assert.equal(app.modulos().env.TRELLO_LISTA_SP, 'lSP', 'a variável do Portainer fica; vale a coleção salva');
  assert.equal(JSON.parse(app.modulos().env.PRACAS).find((x) => x.sigla === 'SP').entrada, 'nlSP');
  assert.ok((await excecoes(p)).some((t) => /INTER/.test(t)), 'a INTER sem listas no quadro novo é exceção');
  assert.equal(await barra(p), '', 'a troca já salvou: nada pendente');
  await semRolagemDeLado(p, `conexões ${nome}, quadro trocado`);
  await capturar(p, `43-quadro-trocado-${nome}`);

  // o aviso no topo: o acervo sem a coluna complexidade (a gravação da complexidade não funciona)
  teable.faltando.ARTES_acervo = ['complexidade'];
  await p.reload();
  await p.locator('.cfg-aviso-topo').waitFor();
  assert.match(await p.locator('.cfg-aviso-topo b').textContent(), /^Acervo sem a coluna complexidade \(na API\)$/);
  await p.locator('.cfg-aviso-topo .botao-texto').click();
  assert.equal(await p.locator(`${CONEXOES} .cfg-tudo-l.com-aviso`).count(), 1);
  await semRolagemDeLado(p, `conexões ${nome}, aviso`);
  await p.evaluate(() => scrollTo(0, 0));
  await capturar(p, `44-aviso-coluna-${nome}`);
  assert.deepEqual(erros, [], `conexões ${nome}: erros na página`);
  await ctx.close();
  await voltarAoPortainer(app, teable);
  console.log(`ok: conexões ${nome}: recolhida, aberta com as tabelas, trocar o quadro com o nome digitado e o aviso da coluna`);
}

/* ---------- a seção Pessoas (#77) ---------- */

const PESSOAS = '.cfg-secao[data-secao="pessoas"]';
const novidades = (p) => textos(p.locator(`${PESSOAS} .cfg-exc .cfg-exc-texto strong`));
/** A tabela designers e os administradores do começo, nada ignorado, e a produção olhada de novo. Otávio (sem
    produção) é administrador salvo na tela. */
async function recomecarPessoas(app, url) {
  DESIGNERS.splice(0, DESIGNERS.length, ...designersDoComeco());
  for (const chave of [BIA_ENTROU, 'saiu:recOtavio'])
    await fetch(new URL('/api/configuracao/pessoas', url), { method: 'POST', headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'desfazer', chave }) });
  await app.mudarConfiguracao({ ADMINISTRADORES: JSON.stringify([OTAVIO]) }).antigaFechada;
  await app.verificarPessoas();
}

async function pessoas(navegador, url, app, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await recomecarPessoas(app, url);
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema }, { hash: '' });
  assert.equal(await fundoEscuro(p), tema === 'dark');

  // o pontinho no menu do perfil: há novidade nas Pessoas
  await p.locator('.perfil-botao.com-novidade').waitFor();
  await p.locator('.perfil-botao').click();
  const item = p.locator('.perfil-painel .perfil-link', { hasText: 'Configuração' });
  assert.equal(await item.locator('.perfil-ponto').count(), 1);
  assert.equal((await item.locator('small').textContent()).trim(), '2 novidades nas Pessoas');
  await capturar(p, `50-pessoas-pontinho-${nome}`);
  await item.click();

  // as novidades: quem aparece na produção e não é designer; o designer ativo sem produção (a inativa não conta)
  await p.locator(`${PESSOAS} .cfg-exc`).first().waitFor();
  assert.equal(await resumo(p, PESSOAS), '2 administradores · 2 novidades');
  assert.deepEqual(await novidades(p), ['Bia Sampaio apareceu na produção', 'Otávio Lins sem produção há 60 dias']);
  assert.deepEqual(await textos(p.locator(`${PESSOAS} .cfg-exc .cfg-exc-texto span`)), ['não é designer', `designer ativo · ${OTAVIO} · administrador`]);
  const bia = p.locator(`${PESSOAS} .cfg-exc[data-chave="${BIA_ENTROU}"]`);
  const otavio = p.locator(`${PESSOAS} .cfg-exc[data-chave="saiu:recOtavio"]`);
  assert.deepEqual(await textos(bia.locator('button')), ['Cadastrar como designer', 'Tornar admin', 'ignorar']);
  assert.deepEqual(await textos(otavio.locator('button')), ['Marcar inativo', 'Tirar de admin', 'ignorar']);
  await semRolagemDeLado(p, `pessoas ${nome}, novidades`);
  await p.locator(PESSOAS).scrollIntoViewIfNeeded();
  await capturar(p, `51-pessoas-novidades-${nome}`);

  // tornar administradora: ninguém com o nome dela entrou no PROMeiro, então o e-mail é pedido
  await bia.locator('.botao', { hasText: 'Tornar admin' }).click();
  await bia.locator('input[type="email"]').fill(BIA);
  await capturar(p, `52-pessoas-email-${nome}`);
  await bia.locator('form .botao.primario').click();
  await p.locator('.aviso', { hasText: 'agora é administrador' }).waitFor();
  assert.deepEqual(await textos(bia.locator('.cfg-exc-texto span')), ['não é designer · já é administrador']);
  assert.equal(await bia.locator('.botao', { hasText: 'Tornar admin' }).count(), 0);
  // vale na hora no app inteiro (sem a Bia entrar no PROMeiro: entrando, o nome dela já daria o e-mail)
  assert.equal(app.modulos().cadastros.podeApagar(BIA), true, 'vale na hora no app inteiro');

  // cadastrar como designer: grava no Teable (ativo, o nome e o e-mail digitado)
  await bia.locator('.botao', { hasText: 'Cadastrar como designer' }).click();
  await p.locator('.aviso', { hasText: 'cadastrado como designer' }).waitFor();
  assert.deepEqual(DESIGNERS.at(-1).fields, { designer: 'Bia Sampaio', status: 'ativo', email: BIA });
  assert.deepEqual(await novidades(p), ['Otávio Lins sem produção há 60 dias']);

  // ver tudo: os administradores, com a chave-mestra e "você"; não dá para tirar a si mesmo
  await p.locator(`${PESSOAS} .cfg-ver-tudo`).click();
  const admins = p.locator(`${PESSOAS} .cfg-pessoa`);
  assert.deepEqual(await admins.evaluateAll((ls) => ls.map((l) => l.dataset.email)), [BIA, LIA, OTAVIO]);
  assert.deepEqual(await textos(p.locator(`${PESSOAS} .cfg-pessoa[data-email="${LIA}"] .cfg-pessoa-selos > span`)), ['você', 'chave-mestra']);
  await p.locator(`${PESSOAS} .cfg-pessoa[data-email="${LIA}"] .cfg-tirar`).click({ force: true }); // aria-disabled: o Playwright não clica sem força; a pessoa clica e lê o porquê
  assert.equal((await p.locator(`${PESSOAS} .cfg-dica-pessoas`).textContent()).trim(), 'Não dá para tirar você mesmo.');
  assert.equal(await admins.count(), 3);
  await semRolagemDeLado(p, `pessoas ${nome}, ver tudo`);
  await capturar(p, `53-pessoas-administradores-${nome}`);

  // ignorar quem está sem produção: sai das novidades e vai para o ver tudo, até desfazer
  await otavio.locator('.botao-texto', { hasText: 'ignorar' }).click();
  await p.locator('.aviso', { hasText: 'ignorado' }).waitFor();
  assert.equal(await p.locator(`${PESSOAS} .cfg-exc`).count(), 0);
  assert.equal(await resumo(p, PESSOAS), '3 administradores');
  assert.deepEqual(await textos(p.locator(`${PESSOAS} .cfg-tudo-l[data-chave="saiu:recOtavio"] > span`)).then((t) => t.slice(0, 2)), ['Otávio Lins', 'sem produção há 60 dias']);
  assert.equal((await p.evaluate(() => fetch('/api/eu').then((r) => r.json()))).novidades, 0, 'sem novidade, sem pontinho');
  await capturar(p, `54-pessoas-ignoradas-${nome}`);
  await p.locator(`${PESSOAS} .cfg-tudo-l[data-chave="saiu:recOtavio"] .botao-texto`, { hasText: 'desfazer' }).click();
  await otavio.waitFor();

  // quem está sem produção: tirar de administrador e marcar inativo (grava no Teable)
  await otavio.locator('.botao', { hasText: 'Tirar de admin' }).click();
  await p.locator('.aviso', { hasText: 'não é mais administrador' }).waitFor();
  assert.equal(await otavio.locator('.botao', { hasText: 'Tirar de admin' }).count(), 0);
  assert.equal(await admins.count(), 2);
  await otavio.locator('.botao', { hasText: 'Marcar inativo' }).click();
  await p.locator('.aviso', { hasText: 'marcado como inativo' }).waitFor();
  assert.equal(DESIGNERS.find((d) => d.id === 'recOtavio').fields.status, 'inativo');
  assert.equal(await p.locator(`${PESSOAS} .cfg-exc`).count(), 0);
  assert.deepEqual(erros, [], `pessoas ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: pessoas ${nome}: o pontinho, a que apareceu na produção tornada administradora e cadastrada, os administradores, ignorar e desfazer, tirar de administrador e marcar inativo`);
}

async function pessoasNoCelular(navegador, url, app, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await recomecarPessoas(app, url);
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema });
  await p.locator(`${PESSOAS} .cfg-exc`).first().waitFor();
  assert.deepEqual(await novidades(p), ['Bia Sampaio apareceu na produção', 'Otávio Lins sem produção há 60 dias']);
  // só consulta: nada de cadastrar, ignorar, tirar ou pôr administrador
  assert.equal(await p.locator(`${PESSOAS} button:not(.cfg-ver-tudo):not(.cfg-ajuda button)`).count(), 0);
  await p.locator(PESSOAS).scrollIntoViewIfNeeded();
  await semRolagemDeLado(p, `pessoas no celular ${nome}`);
  await capturar(p, `55-pessoas-celular-${nome}`);
  await p.locator(`${PESSOAS} .cfg-ver-tudo`).tap();
  assert.equal(await p.locator(`${PESSOAS} .cfg-pessoa`).count(), 2);
  assert.equal(await p.locator(`${PESSOAS} .cfg-tirar, ${PESSOAS} .cfg-mais-admin`).count(), 0);
  await semRolagemDeLado(p, `pessoas no celular ${nome}, ver tudo`);
  await p.locator(PESSOAS).scrollIntoViewIfNeeded();
  await capturar(p, `56-pessoas-celular-ver-tudo-${nome}`);
  assert.deepEqual(erros, [], `pessoas no celular ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: pessoas no celular ${nome}: as novidades e os administradores, só consulta`);
}

/* ---------- o Histórico (#78) ---------- */

const HIST = '.cfg-hist';
const linhaDoHistorico = (p, n) => p.locator(`${HIST} tr`).nth(n);
const comoLia = (url, caminho, corpo) =>
  fetch(new URL(caminho, url), {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }).then(async (r) => {
    assert.equal(r.status, 200, `${caminho}: ${await r.clone().text()}`);
    return r.json();
  });
/** Três mudanças, pela API como a tela faz: Otávio administrador (Pessoas), a G5 na entrada do RJ à mão e a ordem
    das praças (SP antes do RJ); depois a G5 ENTRADA é arquivada no Trello: voltar à G5 nela fica travado. */
async function prepararHistorico(app, url, teable) {
  await voltarAoPortainer(app, teable);
  await comoLia(url, '/api/configuracao/pessoas', { acao: 'administrador', email: OTAVIO });
  const { pracas } = await comoLia(url, '/api/configuracao');
  const g5NoRio = { ...pracas.proposta, aMao: [...pracas.proposta.aMao, 'G5.entrada'], pracas: pracas.proposta.pracas.map((x) => (x.sigla === 'G5' ? { ...x, entrada: 'lRJ' } : x)) };
  await comoLia(url, '/api/configuracao/salvar', { pracas: g5NoRio });
  const praca = (sigla) => g5NoRio.pracas.find((x) => x.sigla === sigla);
  await comoLia(url, '/api/configuracao/salvar', { pracas: { ...g5NoRio, pracas: ['G5', 'SP', 'RJ', 'INTER'].map(praca) } });
  LISTAS.find((l) => l.id === 'lG5').closed = true;
}

async function historico(navegador, url, app, teable, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await prepararHistorico(app, url, teable);
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  // ligado pelo rodapé da Configuração
  await p.locator('.cfg-rodape button', { hasText: 'Histórico' }).click();
  await p.locator(`${HIST} tr`).first().waitFor();
  assert.equal(new URL(p.url()).hash, '#/configuracao/historico');
  assert.equal((await p.locator('.cfg-cabeca h1').textContent()).trim(), 'Histórico');

  // a mais nova primeiro: quem, quando e o antigo → o novo com os nomes (não os ids)
  const ordem = linhaDoHistorico(p, 0);
  assert.match((await ordem.locator('.cfg-hist-q').textContent()).replace(/\s+/g, ' '), /^hoje, \d\d:\d\d Lia Moraes$/);
  assert.deepEqual(await textos(ordem.locator('.cfg-hist-l')), ['Praças · Ordem G5, RJ, SP, INTER → G5, SP, RJ, INTER']);
  assert.equal(await ordem.locator('.botao', { hasText: 'Voltar' }).isDisabled(), false);
  const g5 = linhaDoHistorico(p, 1);
  assert.deepEqual(await textos(g5.locator('.cfg-hist-l')), ['Praças · G5: entrada G5 ENTRADA → RIO ENTRADA (à mão)']);
  const admin = linhaDoHistorico(p, 2);
  assert.deepEqual(await textos(admin.locator('.cfg-hist-l')), ['Administradores — → + Otávio Lins']);
  assert.equal(await p.locator(`${HIST}`).evaluate((t) => /\b(lG5|lRJ|oG5)\b/.test(t.textContent)), false, 'nenhum id à mostra');

  // travado: a G5 ENTRADA foi arquivada; diz o porquê
  assert.equal(await g5.locator('.botao', { hasText: 'Voltar' }).isDisabled(), true);
  assert.match(await g5.locator('.cfg-hist-motivo').textContent(), /G5: entrada: "G5 ENTRADA" está arquivada no Trello/);
  assert.match(await p.locator('.cfg-hist-nota').textContent(), /travado/);
  await semRolagemDeLado(p, `histórico ${nome}`);
  await capturar(p, `60-historico-${nome}`);
  await g5.hover();
  await capturar(p, `61-historico-travado-${nome}`);

  // voltar: aplica na hora (a ordem de antes vale no app inteiro) e entra no histórico, marcada
  await ordem.locator('.botao', { hasText: 'Voltar' }).click();
  await p.locator('.aviso', { hasText: 'Voltou' }).waitFor();
  assert.deepEqual(JSON.parse(app.modulos().env.PRACAS).map((x) => x.sigla), ['G5', 'RJ', 'SP', 'INTER']);
  const voltou = linhaDoHistorico(p, 0);
  assert.equal(await voltou.getAttribute('class'), 'voltou');
  assert.deepEqual(await textos(voltou.locator('.cfg-hist-l')), ['Praças · Ordem G5, SP, RJ, INTER → G5, RJ, SP, INTER']);
  assert.match(await voltou.locator('.cfg-hist-etq').textContent(), /^voltou a hoje, \d\d:\d\d$/);
  // a linha de que voltou já é o que vale
  assert.equal((await linhaDoHistorico(p, 1).locator('.cfg-hist-acao').textContent()).trim(), 'vale agora');
  await semRolagemDeLado(p, `histórico ${nome}, voltou`);
  await capturar(p, `62-historico-voltou-${nome}`);

  // de volta à Configuração pelo topo
  await p.locator('.voltar-cad', { hasText: 'Configuração' }).click();
  await p.locator('.cfg-praca').first().waitFor();
  assert.equal(new URL(p.url()).hash, '#/configuracao');
  assert.deepEqual(erros, [], `histórico ${nome}: erros na página`);
  await ctx.close();
  LISTAS.find((l) => l.id === 'lG5').closed = false;
  console.log(`ok: histórico ${nome}: pelo rodapé, quem/quando/antigo → novo com os nomes, voltar travado com o porquê, voltar que vale na hora`);
}

async function historicoNoCelular(navegador, url, app, teable, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await prepararHistorico(app, url, teable);
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema }, { hash: '#/configuracao/historico' });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  await p.locator(`${HIST} tr`).first().waitFor();
  assert.match(await p.locator('.cfg-so-consulta').textContent(), /só consulta/);
  assert.deepEqual(await textos(linhaDoHistorico(p, 0).locator('.cfg-hist-l')), ['Praças · Ordem G5, RJ, SP, INTER → G5, SP, RJ, INTER']);
  // só consulta: nada de voltar
  assert.equal(await p.locator(`${HIST} button, .cfg-hist-acao`).count(), 0);
  await semRolagemDeLado(p, `histórico no celular ${nome}`);
  await capturar(p, `63-historico-celular-${nome}`);
  assert.deepEqual(erros, [], `histórico no celular ${nome}: erros na página`);
  await ctx.close();
  LISTAS.find((l) => l.id === 'lG5').closed = false;
  console.log(`ok: histórico no celular ${nome}: as mudanças, só consulta`);
}

/* ---------- fora do ar e "Pode apagar do Portainer" (#79) ---------- */

/** Tudo no Portainer e uma leitura do quadro com o Trello de pé (fica guardada); depois o Trello cai. */
async function derrubarOTrello(app, url, teable) {
  await voltarAoPortainer(app, teable);
  await comoLia(url, '/api/configuracao');
  trelloFora = true;
}
async function levantar(app) {
  trelloFora = false;
  await app.verificarPessoas();
}

async function foraDoAr(navegador, url, app, teable, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await derrubarOTrello(app, url, teable);
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  await p.locator('.cfg-praca').first().waitFor();
  // cada seção do quadro: a linha de estado diz, a linha curta diz desde quando e de quando são os nomes
  for (const secao of [PRACAS, CARD, FILMES]) {
    assert.match(await resumo(p, secao), /· Trello fora do ar$/);
    assert.match((await p.locator(`${secao} .cfg-fora`).textContent()).replace(/\s+/g, ' '), /^O Trello não responde desde hoje, \d\d:\d\d\. Vale a última leitura \(hoje, \d\d:\d\d\)\. Mudar fica travado até ele voltar\.$/);
  }
  // nada para mudar: sem "+ Nova praça", sem Escolher, regras que não abrem, a praça dos filmes parada, sem barra
  assert.equal(await p.locator('.cfg-mais', { hasText: 'Nova praça' }).count(), 0);
  assert.equal(await p.locator('.cfg-exc .botao', { hasText: 'Escolher' }).count(), 0);
  assert.equal(await p.locator('.cfg-alca').count(), 0);
  assert.equal(await p.locator(`${FILMES} .cfg-filmes-praca button:not([disabled])`).count(), 0);
  assert.equal(await barra(p), '');
  // os nomes são os da última leitura
  await p.locator(`${PRACAS} .cfg-ver-tudo`).click();
  assert.match(await p.locator(PRACAS).textContent(), /SP ENTRADA/);
  await semRolagemDeLado(p, `fora do ar ${nome}`);
  await p.evaluate(() => scrollTo(0, 0));
  await capturar(p, `70-fora-do-ar-${nome}`);
  // salvar pela API é recusado
  const { pracas } = await comoLia(url, '/api/configuracao');
  const r = await fetch(new URL('/api/configuracao/salvar', url), { method: 'POST', headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/json' }, body: JSON.stringify({ pracas: pracas.proposta }) });
  assert.equal(r.status, 503);
  assert.match((await r.json()).erro, /Trello está fora do ar/);
  // as Conexões: trocar o quadro travado; com o Teable fora também, trocar a base
  teable.estado.fora = true;
  await p.reload();
  await p.locator(CONEXOES).waitFor();
  await p.locator(`${CONEXOES} .cfg-ver-tudo`).click();
  assert.deepEqual((await textos(p.locator(`${CONEXOES} .cfg-fora b`))), ['O Trello não responde', 'O Teable não responde']);
  for (const linha of ['Quadro do Trello', 'Base do Teable']) assert.equal(await p.locator(`${CONEXOES} .cfg-con-l`, { hasText: linha }).locator('.botao').isDisabled(), true);
  // o que não depende deles continua: os administradores
  assert.match(await resumo(p, PESSOAS), /fora do ar/);
  await p.locator(CONEXOES).scrollIntoViewIfNeeded();
  await capturar(p, `71-fora-do-ar-conexoes-${nome}`);
  teable.estado.fora = false;
  await app.descobrirAsTabelas();
  await levantar(app);
  // de volta: a seção destrava
  await p.reload();
  await p.locator('.cfg-praca').first().waitFor();
  assert.equal(await p.locator(`${PRACAS} .cfg-fora`).count(), 0);
  assert.equal(await p.locator('.cfg-mais', { hasText: 'Nova praça' }).count(), 1);
  assert.deepEqual(erros, [], `fora do ar ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: fora do ar ${nome}: os nomes da última leitura, desde quando, tudo travado, salvar recusado; de volta, destrava`);
}

async function foraDoArNoCelular(navegador, url, app, teable, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await derrubarOTrello(app, url, teable);
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  await p.locator('.cfg-praca').first().waitFor();
  assert.match(await p.locator(`${PRACAS} .cfg-fora`).textContent(), /O Trello não responde/);
  await semRolagemDeLado(p, `fora do ar no celular ${nome}`);
  await capturar(p, `72-fora-do-ar-celular-${nome}`);
  assert.deepEqual(erros, [], `fora do ar no celular ${nome}: erros na página`);
  await ctx.close();
  await levantar(app);
  console.log(`ok: fora do ar no celular ${nome}: a linha curta, só consulta`);
}

const PORT = '.cfg-port';
const doGrupo = (p, grupo) => p.locator(`${PORT} [data-grupo="${grupo}"] code`).allTextContents();
/** As praças salvas na tela (o nome da SP mudou): as variáveis delas podem sair do Portainer. */
async function salvarAsPracas(app, url, teable) {
  await voltarAoPortainer(app, teable);
  const { pracas } = await comoLia(url, '/api/configuracao');
  await comoLia(url, '/api/configuracao/salvar', { pracas: { ...pracas.proposta, pracas: pracas.proposta.pracas.map((x) => (x.sigla === 'SP' ? { ...x, nome: 'São Paulo' } : x)) } });
}

async function portainer(navegador, url, app, teable, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await salvarAsPracas(app, url, teable);
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema, permissions: ['clipboard-read', 'clipboard-write'] });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  // ligado pelo rodapé da Configuração
  await p.locator('.cfg-rodape button', { hasText: 'Pode apagar do Portainer' }).click();
  await p.locator(PORT).waitFor();
  assert.equal(new URL(p.url()).hash, '#/configuracao/portainer');
  assert.equal((await p.locator('.cfg-cabeca h1').textContent()).trim(), 'Portainer');
  // pode apagar: as das praças (salvas na tela); ainda não: as do card e dos filmes (sem valor salvo); ficam: os segredos
  const pode = await doGrupo(p, 'pode');
  for (const v of ['TRELLO_LISTA_SP', 'TRELLO_SAIDA_INTER', 'TRELLO_PRACAS', 'TRELLO_CAMPO_PRACA']) assert.ok(pode.includes(v), `pode apagar ${v}`);
  const ainda = await doGrupo(p, 'nao-ainda');
  for (const v of ['TRELLO_LISTA_FILMES', 'TRELLO_CAMPO_PRIORIDADE', 'TEABLE_PG_ESQUEMA']) assert.ok(ainda.includes(v), `ainda não ${v}`);
  assert.ok(!ainda.some((v) => pode.includes(v)));
  assert.match(await p.locator(`${PORT} [data-grupo="nao-ainda"] li`, { hasText: 'TRELLO_LISTA_FILMES' }).textContent(), /^sem valor salvo em Filmes/);
  const ficam = await doGrupo(p, 'fica');
  for (const v of ['TRELLO_KEY', 'TRELLO_TOKEN', 'TEABLE_TOKEN', 'CADASTRO_ADMINS']) assert.ok(ficam.includes(v), `fica ${v}`);
  assert.deepEqual(await textos(p.locator(`${PORT} .cfg-port-linha`)), [
    'O valor já está salvo na tela, ou o PROMeiro não lê mais.',
    'Sem valor salvo na tela: a do Portainer continua valendo.',
    'Segredos e infraestrutura: o lugar delas é o Portainer.',
  ]);
  // copiar os nomes: um por linha
  await p.locator('.cfg-port-copiar').click();
  await p.locator('.aviso', { hasText: 'nomes copiados' }).waitFor();
  assert.deepEqual((await p.evaluate(() => navigator.clipboard.readText())).split('\n'), pode);
  await semRolagemDeLado(p, `portainer ${nome}`);
  await capturar(p, `80-portainer-${nome}`);
  await p.locator('.voltar-cad', { hasText: 'Configuração' }).click();
  await p.locator('.cfg-praca').first().waitFor();
  assert.deepEqual(erros, [], `portainer ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: portainer ${nome}: pelo rodapé, pode apagar (com copiar), ainda não e ficam`);
}

async function portainerNoCelular(navegador, url, app, teable, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  await salvarAsPracas(app, url, teable);
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema }, { hash: '#/configuracao/portainer' });
  assert.equal(await fundoEscuro(p), tema === 'dark');
  await p.locator(PORT).waitFor();
  assert.ok((await doGrupo(p, 'pode')).includes('TRELLO_LISTA_SP'));
  await semRolagemDeLado(p, `portainer no celular ${nome}`);
  await capturar(p, `81-portainer-celular-${nome}`);
  assert.deepEqual(erros, [], `portainer no celular ${nome}: erros na página`);
  await ctx.close();
  await voltarAoPortainer(app, teable);
  console.log(`ok: portainer no celular ${nome}: os três grupos, sem rolar para o lado`);
}

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  // o cadastro de atrações do Teable, de mentira: só a leitura das sessões de filme (#75)
  const cadastros = (e, deps) => ({
    ...criarCadastros(e, deps),
    ler: async () => ({ ligado: true, atracoes: sessoesDoCadastro.map((nome, i) => ({ id: `recSessao${i}`, nome, acervo: 'filme', categoria: '', keys: [] })), redatores: [], editores: [], categorias: [], camposCaminho: [], formulas: {} }),
  });
  // o Teable da descoberta das tabelas (#76): todas as tabelas na base, menos a designers (que não é usada)
  const { TEABLE_FALSO, teableFalso } = await import(join(RAIZ, 'tests', 'fixtures', 'teable-falso.mjs'));
  const { TABELAS_DO_TEABLE } = await import(join(RAIZ, 'src', 'modelo', 'tabelasDoTeable.ts'));
  const faltando = {};
  const naBase = Object.fromEntries(TABELAS_DO_TEABLE.filter((t) => !t.opcional || t.nome === 'EDICAO_producao').map((t, i) => [t.nome, `${t.nome.toLowerCase()}_x${i}`]));
  const teable = Object.assign(teableFalso(naBase, { faltando, registros: { designers: DESIGNERS } }), { faltando });
  // o Postgres do Teable: só quem aparece na produção da arte (as Pessoas); o resto vem vazio, como antes
  const recente = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const consultar = async (sql) => {
    if (teable.estado.fora) throw new Error('connect ECONNREFUSED (Teable fora do ar)');
    return /SELECT "designers", "data_entrada"/.test(sql) ? NA_PRODUCAO.map((nome) => ({ designers: JSON.stringify([nome]), data_entrada: recente })) : [];
  };
  const s = await subir({ trello: { env: ENV_TRELLO, buscar, viva: true, consultar }, env: { CADASTRO_ADMINS: LIA, TEABLE_PG_ESQUEMA: 'bseFalso', ...TEABLE_FALSO }, cadastros, teable });
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
    for (const tema of ['light', 'dark']) await secaoCard(navegador, s.url, s.app, tema);
    for (const tema of ['light', 'dark']) await cardNoCelular(navegador, s.url, tema);
    for (const tema of ['light', 'dark']) await secaoFilmes(navegador, s.url, s.app, tema);
    for (const tema of ['light', 'dark']) await filmesNoCelular(navegador, s.url, tema);
    for (const tema of ['light', 'dark']) await conexoes(navegador, s.url, s.app, teable, tema);
    for (const tema of ['light', 'dark']) await pessoas(navegador, s.url, s.app, tema);
    for (const tema of ['light', 'dark']) await pessoasNoCelular(navegador, s.url, s.app, tema);
    for (const tema of ['light', 'dark']) await historico(navegador, s.url, s.app, teable, tema);
    for (const tema of ['light', 'dark']) await historicoNoCelular(navegador, s.url, s.app, teable, tema);
    for (const tema of ['light', 'dark']) await foraDoAr(navegador, s.url, s.app, teable, tema);
    for (const tema of ['light', 'dark']) await foraDoArNoCelular(navegador, s.url, s.app, teable, tema);
    for (const tema of ['light', 'dark']) await portainer(navegador, s.url, s.app, teable, tema);
    for (const tema of ['light', 'dark']) await portainerNoCelular(navegador, s.url, s.app, teable, tema);
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
