// Ponta a ponta da ficha da atração nos Cadastros (#57), rodado à parte do vitest: `npm run e2e:ficha`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, dados fictícios, nada sai para a rede), com o acervo
// de artes ligado a um Postgres do Teable falso: as rotas /api/acervo/* são as de verdade. A lista dos cadastros vem
// pela rota do navegador (o Teable da API fica desligado). No computador, claro e escuro: a lista mostra "N artes" e
// "acervo do filme"; clicar na atração abre a ficha (total, barra por tipo, "sem tipo" em destaque, novo pacote só para
// administradores); "Ver as N" troca a lista pelo acervo, com busca e filtro por tipo; "+ Nova atração" volta ao
// formulário. No celular, claro e escuro: a ficha é só consulta (total, por tipo, "tem essa arte?" e a lista) e a nota
// "Importar CSV é no computador".
//
// A importação do acervo por CSV (#58), com a API do Teable também falsa (os campos e os registros, que mudam o acervo
// de mentira): na ficha, Importar CSV (claro: o seletor de arquivo; escuro: o arquivo solto na área tracejada) → a
// conferência (placar, filtros por estado, busca, ✕ que tira e devolve a linha) → Gravar → o resultado antes → depois
// → a ficha com o total novo. Quem não é administrador vê o botão travado; a sessão de filme não mostra a importação.
//
// As regras de conversão (#59): a hora ("7 15" → "7:15"), PROX → PRÓXIMA, os acentos do dicionário, a grafia pelas
// fontes (o acervo da atração, os roteiros dela, os de todas, o acervo de todas: a produção da arte também é falsa) e
// as versões (VERT, 6S) em "Versões e cópias"; cada linha mostra o "antes → depois · regra".
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:ficha
// Com CAPTURAS=pasta, grava as capturas de cada tela (densidade 2).
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');

let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:ficha');
  process.exit(2);
}

const RAIZ = join(__dirname, '..', '..');
const LIA = 'lia.moraes@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

// o acervo fictício: o Programa Fictício tem 24 linhas (3 sem tipo); a sessão é de filme; os shows, sem acervo
const PROGRAMA = 'Programa Fictício';
const ARTES = [
  ...['SÁBADO', 'PRÓXIMO SÁBADO', 'SÁBADO 3:00', 'HOJE', 'AMANHÃ', 'DAQUI A POUCO', 'LOGO MAIS', 'NESTA SEMANA', 'BANDA FICTÍCIA', 'CORAL FICTÍCIO', 'TRIO DE EXEMPLO', 'ORQUESTRA DE TESTE'].map((arte) => [arte, 'RDP']),
  ...['SÁBADO', 'HOJE', 'AMANHÃ', 'DOMINGO', 'SEGUNDA', 'TERÇA'].map((arte) => [arte, 'CRT']),
  ['AO VIVO', 'LETT'],
  ['ESPECIAL', 'LETT'],
  ['PALCO', 'FOTO'],
  ['SABADO 7 15', ''],
  ['VEM AÍ', ''],
  ['PLATEIA', ''],
];
const LINHAS = [
  ...ARTES.map(([arte, tipo], i) => ({ id: `recArte${i}`, arte, tipo: tipo || null, atracao: [{ id: 'recProg', title: PROGRAMA }], claquete: [], filme: null })),
  { id: 'recOutra', arte: 'HOJE', tipo: 'RDP', atracao: [{ id: 'recNovela', title: 'Novela Fictícia' }], claquete: [], filme: null },
  { id: 'recFilme', arte: 'TÍTULO', tipo: null, atracao: [{ id: 'recSessao', title: 'Sessão Fictícia' }], claquete: [], filme: { id: 'recF', title: 'FILME FICTÍCIO (2020)' } },
];
const ACERVOS = [
  { atracao: PROGRAMA, acervo: 'próprio' },
  { atracao: 'Novela Fictícia', acervo: null },
  { atracao: 'Sessão Fictícia', acervo: 'do filme' },
  { atracao: 'Shows Fictícios', acervo: 'sem acervo' },
];
// os CSVs fictícios da pasta de output (nome;caminho;criado em), um por atração
const csv = (pasta, nomes) => ['"nome";"caminho";"criado em"', ...nomes.map((n, i) => `"${n}";"/Volumes/FICTICIO/output/${pasta}/${n}";"2024-08-12 19:${10 + i}"`)].join('\r\n');
const CSV_PROGRAMA = csv('PROGRAMA FICTICIO', [
  'RDP - BANDA FICTICIA.mov', // já no acervo
  'RDP - PLATEIA.mov', // completa o acervo
  'CRT - VEM AI.mov', // completa o acervo
  'RDP - CANTORA DE EXEMPLO.mov',
  'RDP - CANTORA DE EXEMPLO - Copy.mov', // cópia
  'CRT - QUARTA.mov',
  'CRT - QUINTA_alfa.mov', // lettering
  'LETT - AO VIVO.mov', // já no acervo
  'RDP - DUPLA FICTICIA.mov',
  'RDP - DUPLA FICTICIA.mxf', // repetida
  '_EPISODIOS', // pasta
  'COMP - ABERTURA EP 12.mov', // sem o prefixo do tipo
  'RDP - GRUPO DE TESTE.mov', // a conferência tira
  'FOTO - PALCO (1).png', // cópia sem o original: já no acervo
  // as regras de conversão (#59)
  'CRT - DOMINGO 7 15.mov', // hora
  'RDP - PROX SEXTA 9 30.mov', // PROX antes do dia da semana, e hora
  'CRT - NAO PERCA.mov', // acento do dicionário
  'RDP - CANTORA DE EXEMPLO VERT.mov', // versão
  'RDP - CANTORA DE EXEMPLO 6S.mov', // versão
]);
// a produção da arte de mentira: as artes dos roteiros enviados ("A | B"), com a atração, para a grafia
const ROTEIROS = [
  { atracao: [{ id: 'recProg', title: PROGRAMA }], artes: 'CANTORA DE EXEMPLO | GRUPO DE TESTE (RDP) | GRUPO DE TESTE (CRT)' },
  { atracao: [{ id: 'recNovela', title: 'Novela Fictícia' }], artes: 'DUPLA FICTÍCIA | NÃO PERCA' },
];
const CSV_NOVELA = csv('NOVELA FICTICIA', ['RDP - HOJE.mov', 'CRT - HOJE.mov', 'CRT - AMANHA.mov', 'RDP - HOJE (1).mov']);

const atracao = (id, nome, categoria, acervo, keys) => ({ id, nome, categoria, acervo, keys: keys.map((key, i) => ({ id: `${id}k${i}`, key })), caminhos: {}, campos: {} });
const CADASTROS = {
  ligado: true,
  atracoes: [
    atracao('recNovela', 'Novela Fictícia', 'Novela', 'proprio', ['NOVELA FICTICIA']),
    atracao('recProg', PROGRAMA, 'Programa', 'proprio', ['PROGRAMA FICTICIO', 'PROG FICT']),
    atracao('recSessao', 'Sessão Fictícia', 'Filme', 'filme', ['SESSAO FICTICIA']),
    atracao('recShows', 'Shows Fictícios', 'Show', 'sem', ['SHOWS']),
  ],
  redatores: [],
  editores: [],
  categorias: ['Filme', 'Novela', 'Programa', 'Show'],
  camposCaminho: [],
  formulas: {},
  podeApagar: true,
};

const ID_DA_ATRACAO = { [PROGRAMA]: 'recProg', 'Novela Fictícia': 'recNovela', 'Sessão Fictícia': 'recSessao', 'Shows Fictícios': 'recShows' };
const TIPOS = ['RDP', 'CRT', 'LETT', 'FOTO', 'MOLDURA'];

/** O Teable de mentira: o Postgres (o acervo e as atrações) e a API (os campos e os registros, que mudam o acervo). */
async function acervoFalso() {
  const { criarAcervo } = await import(join(RAIZ, 'servidor', 'acervo.mjs'));
  const env = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', TEABLE_PG_ACERVO: 'acervo', TEABLE_PG_ATRACOES: 'atracoes', TEABLE_PG_ARTE: 'producao', TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'falso', TEABLE_ACERVO: 'tblFalso' };
  const consultar = async (sql, params = []) => {
    if (sql.includes('"bseFalso"."acervo"')) return LINHAS.map((l) => ({ ...l }));
    if (sql.includes('"bseFalso"."producao"')) return ROTEIROS;
    if (sql.includes('"atracoes"') && sql.includes('__id')) {
      const nome = Object.keys(ID_DA_ATRACAO).find((n) => n.toLowerCase() === String(params[0]).toLowerCase());
      return nome ? [{ id: ID_DA_ATRACAO[nome] }] : [];
    }
    return sql.includes('"atracoes"') ? ACERVOS : [];
  };
  let novas = 0;
  const buscar = async (url, init = {}) => {
    const metodo = init.method ?? 'GET';
    const corpo = init.body ? JSON.parse(init.body) : null;
    let resposta = {};
    if (url.endsWith('/field')) resposta = [{ id: 'fldTipo', name: 'tipo', type: 'singleSelect', options: { choices: TIPOS.map((name) => ({ name })) } }];
    else if (metodo === 'POST')
      for (const r of corpo.records) {
        const nome = Object.keys(ID_DA_ATRACAO).find((n) => ID_DA_ATRACAO[n] === r.fields.atracao[0].id);
        LINHAS.push({ id: `recNova${++novas}`, arte: r.fields.arte, tipo: r.fields.tipo ?? null, atracao: [{ id: r.fields.atracao[0].id, title: nome }], claquete: [], filme: null });
      }
    else if (metodo === 'PATCH') for (const r of corpo.records) Object.assign(LINHAS.find((l) => l.id === r.id), r.fields);
    return { ok: true, status: 200, json: async () => resposta, text: async () => '' };
  };
  return criarAcervo(env, { consultar, buscar });
}

/** Um contexto do navegador como a Lia, com a lista fictícia dos cadastros (administradora ou não). */
async function abrir(navegador, url, opcoes, { admin = true } = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/cadastros', (r) => r.fulfill({ json: { ...CADASTROS, podeApagar: admin } }));
  await ctx.route((u) => u.pathname === '/api/cadastros/sem-cadastro', (r) => r.fulfill({ json: { keys: [], reconhecidas: { total: 0, amostra: [] } } }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/cadastros/atracoes`);
  await p.waitForSelector('.atracao-cad .qtd-acervo');
  return { ctx, p, erros };
}

const semRolagemDeLado = async (p, onde) =>
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
/** O fundo da página é escuro? (o tema segue o sistema) */
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
const linha = (p, nome) => p.locator('.atracao-cad', { has: p.locator('.abrir-ficha', { hasText: nome }) });

async function noComputador(navegador, url, tema) {
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark', `computador ${tema}: o tema segue o sistema`);
  // a lista: "N artes" do acervo próprio, "acervo do filme" da sessão; a sem acervo, sem número
  assert.equal((await linha(p, PROGRAMA).locator('.qtd-acervo').textContent()).trim(), '24 artes');
  assert.equal((await linha(p, 'Novela Fictícia').locator('.qtd-acervo').textContent()).trim(), '1 arte');
  assert.equal((await linha(p, 'Sessão Fictícia').locator('.qtd-acervo').textContent()).trim(), 'acervo do filme');
  assert.equal(await linha(p, 'Shows Fictícios').locator('.qtd-acervo').count(), 0);
  assert.equal(await p.locator('.atracao-cad .pacote-cad').count(), 0, 'o novo pacote saiu da linha');

  // clicar na atração abre a ficha no lugar de "Nova atração"
  await linha(p, PROGRAMA).locator('.keys').click({ position: { x: 400, y: 5 } });
  const ficha = p.locator('.ficha-atr');
  await ficha.locator('.total-acervo').waitFor();
  assert.equal(await ficha.locator('h2').textContent(), PROGRAMA);
  assert.equal(await ficha.locator('.dica').textContent(), 'Programa · acervo próprio');
  assert.deepEqual(await ficha.locator('.keys-ficha .key:not(.nova)').allTextContents(), ['PROGRAMA FICTICIO', 'PROG FICT']);
  assert.match(await ficha.locator('.total-acervo').textContent(), /^24\s*artes prontas$/);
  assert.equal(await ficha.locator('.barra-tipos i').count(), 5, 'uma faixa por tipo');
  assert.deepEqual(await ficha.locator('.legenda-tipos span').allTextContents(), ['RDP12', 'CRT6', 'LETT2', 'FOTO1', 'sem tipo3']);
  assert.equal(await ficha.locator('.legenda-tipos .sem').textContent(), 'sem tipo3', '"sem tipo" no fim e em destaque');
  assert.ok(await linha(p, PROGRAMA).evaluate((el) => el.classList.contains('aberta')), 'a linha aberta fica marcada');
  assert.equal(await ficha.locator('.rodape-ficha .pacote-cad').textContent(), 'novo pacote', 'o novo pacote na ficha, para administradores');
  assert.equal(await ficha.locator('.rodape-ficha .pacote-cad').evaluate((b) => getComputedStyle(b).opacity), '1', 'o novo pacote aparece sem passar o mouse');
  assert.equal(await p.locator('.form-cad h2', { hasText: 'Nova atração' }).count(), 0);
  assert.ok(await ficha.locator('.area-importar .botao', { hasText: 'Importar CSV' }).isEnabled(), 'o administrador importa');
  await semRolagemDeLado(p, `computador ${tema}, ficha`);
  await capturar(p, `ficha-computador-${tema === 'dark' ? 'escuro' : 'claro'}`);
  // o novo pacote pede a confirmação, como antes na linha; "Não" desiste sem apagar nada
  await ficha.locator('.rodape-ficha .pacote-cad').click();
  await ficha.locator('.rodape-ficha .remover-conferir', { hasText: `As artes de ${PROGRAMA} deixam de valer.` }).waitFor();
  await ficha.locator('.rodape-ficha .remover-conferir button', { hasText: 'Não' }).click();
  await ficha.locator('.rodape-ficha .pacote-cad').waitFor();

  // "Ver as 24": a lista da esquerda vira o acervo, com o filtro por tipo e a busca
  await ficha.locator('.secao-acervo-tit .botao-texto', { hasText: 'Ver as 24' }).click();
  const lista = p.locator('.lista-acervo');
  await lista.locator('.arte-acervo').first().waitFor();
  assert.equal(await lista.locator('.arte-acervo').count(), 24);
  assert.deepEqual(await lista.locator('.filtro-tipos button').allTextContents(), ['Todos · 24', 'RDP · 12', 'CRT · 6', 'LETT · 2', 'FOTO · 1', 'sem tipo · 3']);
  await capturar(p, `acervo-computador-${tema === 'dark' ? 'escuro' : 'claro'}`);
  await lista.locator('.filtro-tipos button', { hasText: 'sem tipo' }).click();
  assert.deepEqual(await lista.locator('.arte-acervo .t').allTextContents(), ['PLATEIA', 'SABADO 7 15', 'VEM AÍ']);
  await lista.locator('.filtro-tipos button', { hasText: 'Todos' }).click();
  await lista.locator('.cad-busca input').fill('sabado');
  assert.deepEqual(
    await lista.locator('.arte-acervo').evaluateAll((ls) => ls.map((l) => `${l.querySelector('.t').textContent} ${l.querySelector('.s').textContent}`)),
    ['PRÓXIMO SÁBADO RDP', 'SÁBADO CRT', 'SÁBADO RDP', 'SÁBADO 3:00 RDP', 'SABADO 7 15 sem tipo'],
    'a busca ignora acento e caixa',
  );
  await lista.locator('.filtro-tipos button', { hasText: 'CRT' }).click();
  assert.deepEqual(await lista.locator('.arte-acervo .t').allTextContents(), ['SÁBADO'], 'a busca e o filtro juntos');
  await semRolagemDeLado(p, `computador ${tema}, acervo`);

  // "Atrações" volta à lista; "+ Nova atração" volta ao formulário
  await lista.locator('.trilha-cad .botao-texto', { hasText: 'Atrações' }).click();
  await linha(p, PROGRAMA).waitFor();
  assert.equal(await p.locator('.ficha-atr').count(), 1, 'a ficha continua aberta');
  // a sessão de filme: a ficha diz que o acervo é do filme, sem "Ver as" nem novo pacote
  await linha(p, 'Sessão Fictícia').locator('.abrir-ficha').click();
  await ficha.locator('.nota-acervo', { hasText: 'acervo de cada filme' }).waitFor();
  assert.equal(await ficha.locator('h2').textContent(), 'Sessão Fictícia');
  assert.equal(await ficha.locator('.secao-acervo-tit .botao-texto').count(), 0);
  assert.equal(await ficha.locator('.rodape-ficha').count(), 0);
  assert.equal(await ficha.locator('.area-importar').count(), 0, 'a sessão de filme não mostra a importação');
  await ficha.locator('.volta-ficha').click();
  await p.locator('.form-cad h2', { hasText: 'Nova atração' }).waitFor();
  assert.equal(await p.locator('.atracao-cad.aberta').count(), 0);

  assert.deepEqual(erros, [], `computador ${tema}: erros na página`);
  await ctx.close();
  console.log(`ok: computador ${tema === 'dark' ? 'escuro' : 'claro'}: lista com o acervo, ficha, "Ver as 24" com busca e filtro, volta ao formulário`);
}

async function semSerAdministrador(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 } }, { admin: false });
  await linha(p, PROGRAMA).locator('.abrir-ficha').click();
  await p.locator('.ficha-atr .total-acervo').waitFor();
  assert.equal(await p.locator('.ficha-atr .rodape-ficha').count(), 0, 'quem não é administrador não vê o novo pacote');
  const area = p.locator('.ficha-atr .area-importar');
  assert.ok(await area.locator('.botao', { hasText: 'Importar CSV' }).isDisabled(), 'o botão de importar travado');
  assert.equal(await area.locator('.so-admin').textContent(), 'só administradores');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: sem ser administrador, a ficha não tem o novo pacote e o Importar CSV vem travado');
}

async function noCelular(navegador, url, tema) {
  const { deviceScaleFactor, ...iphone } = devices['iPhone 13'];
  const { ctx, p, erros } = await abrir(navegador, url, { ...iphone, colorScheme: tema });
  assert.equal(await fundoEscuro(p), tema === 'dark', `celular ${tema}: o tema segue o sistema`);
  await linha(p, PROGRAMA).locator('.abrir-ficha').tap();
  const ficha = p.locator('.ficha-celular');
  await ficha.locator('.total-acervo').waitFor();
  assert.equal(await ficha.locator('h1').textContent(), PROGRAMA);
  assert.match(await ficha.locator('.total-acervo').textContent(), /^24\s*artes no acervo$/);
  assert.equal(await ficha.locator('.legenda-tipos .sem').textContent(), 'sem tipo3');
  assert.equal(await ficha.locator('.arte-acervo').count(), 24);
  // só consulta: nada de keys, novo pacote, lixeira ou formulário
  assert.equal(await p.locator('.ficha-celular .key, .pacote-cad, .lixo-cad, .form-cad, .atracao-cad, .area-importar').count(), 0, 'no celular, a ficha é só consulta');
  assert.match(await ficha.locator('.importar-no-computador').textContent(), /^Importar CSV é no computador\./);
  await ficha.locator('.cad-busca input').fill('sábado');
  assert.deepEqual(await ficha.locator('.arte-acervo .t').allTextContents(), ['PRÓXIMO SÁBADO', 'SÁBADO', 'SÁBADO', 'SÁBADO 3:00', 'SABADO 7 15']);
  await semRolagemDeLado(p, `celular ${tema}`);
  await capturar(p, `ficha-celular-${tema === 'dark' ? 'escuro' : 'claro'}`);
  await ficha.locator('.cad-busca input').fill('nenhuma assim');
  await ficha.locator('.cad-vazio', { hasText: 'Nada com “nenhuma assim” no acervo.' }).waitFor();
  await ficha.locator('.trilha-cad .botao-texto').tap();
  await linha(p, PROGRAMA).waitFor();
  assert.deepEqual(erros, [], `celular ${tema}: erros na página`);
  await ctx.close();
  console.log(`ok: celular ${tema === 'dark' ? 'escuro' : 'claro'}: a ficha só de consulta, com a busca "tem essa arte?"`);
}

/** As linhas visíveis da conferência: "arquivo → estado arte (tipo)". */
const linhasDaConferencia = (p) =>
  p.locator('.conf-linha').evaluateAll((ls) =>
    ls.map((l) => {
      const t = (s) => l.querySelector(s)?.textContent.trim() ?? '';
      return `${l.querySelector('.arq').lastChild.textContent} → ${t('.etq')} ${t('.arte')}${t('.tipo') ? ` (${t('.tipo')})` : ''}`;
    }),
  );
const placar = async (p) => (await p.locator('.conf-placar').textContent()).replace(/\s+/g, ' ').trim();

/** Ficha → Importar CSV (pelo seletor de arquivo) → conferir (placar, filtros, busca, tirar e devolver) → gravar →
    resultado → a ficha com o total novo. */
async function importarNoComputador(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  await linha(p, PROGRAMA).locator('.abrir-ficha').click();
  const ficha = p.locator('.ficha-atr');
  await ficha.locator('.total-acervo').waitFor();
  await capturar(p, `importar-ficha-${nome}`);
  await ficha.locator('.area-importar input[type=file]').setInputFiles({ name: 'PROGRAMA_SERVICO.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFF' + CSV_PROGRAMA) });

  // a conferência: o placar e cada linha classificada
  const conf = p.locator('.conferencia');
  await conf.waitFor();
  assert.equal(await conf.locator('h2').textContent(), `Conferir antes de gravar no acervo de ${PROGRAMA}`);
  assert.equal((await conf.locator('.conf-arquivo').textContent()).trim(), 'PROGRAMA_SERVICO.csv · 19 linhas');
  assert.equal(await placar(p), '8 novas · 2 completam o acervo · 3 já no acervo · 6 ficam de fora');
  assert.deepEqual(await linhasDaConferencia(p), [
    'RDP - BANDA FICTICIA.mov → já no acervo BANDA FICTÍCIA (RDP)',
    'RDP - PLATEIA.mov → ganha o tipo PLATEIA (RDP)',
    'CRT - VEM AI.mov → ganha o tipo VEM AÍ (CRT)',
    'RDP - CANTORA DE EXEMPLO.mov → nova CANTORA DE EXEMPLO (RDP)',
    'RDP - CANTORA DE EXEMPLO - Copy.mov → cópia CANTORA DE EXEMPLO (RDP)',
    'CRT - QUARTA.mov → nova QUARTA (CRT)',
    'CRT - QUINTA_alfa.mov → nova QUINTA (LETT)',
    'LETT - AO VIVO.mov → já no acervo AO VIVO (LETT)',
    'RDP - DUPLA FICTICIA.mov → nova DUPLA FICTÍCIA (RDP)',
    'RDP - DUPLA FICTICIA.mxf → cópia DUPLA FICTÍCIA (RDP)',
    '_EPISODIOS → fora —',
    'COMP - ABERTURA EP 12.mov → fora —',
    'RDP - GRUPO DE TESTE.mov → nova GRUPO DE TESTE (RDP)',
    'FOTO - PALCO (1).png → já no acervo PALCO (FOTO)',
    'CRT - DOMINGO 7 15.mov → nova DOMINGO 7:15 (CRT)',
    'RDP - PROX SEXTA 9 30.mov → nova PRÓXIMA SEXTA 9:30 (RDP)',
    'CRT - NAO PERCA.mov → nova NÃO PERCA (CRT)',
    'RDP - CANTORA DE EXEMPLO VERT.mov → versão CANTORA DE EXEMPLO (RDP)',
    'RDP - CANTORA DE EXEMPLO 6S.mov → versão CANTORA DE EXEMPLO (RDP)',
  ]);
  // cada linha diz o que as regras mudaram: "antes → depois · regra"
  const regras = (texto) => conf.locator('.conf-linha', { hasText: texto }).first().locator('.regra').allTextContents();
  assert.deepEqual(await regras('VEM AI.mov'), ['VEM AI → VEM AÍ · grafia do acervo da atração']);
  assert.deepEqual(await regras('DUPLA FICTICIA.mov'), ['DUPLA FICTICIA → DUPLA FICTÍCIA · grafia dos roteiros']);
  assert.deepEqual(await regras('DOMINGO 7 15'), ['7 15 → 7:15 · hora']);
  assert.deepEqual(await regras('PROX SEXTA'), ['PROX → PRÓXIMA · abreviação', '9 30 → 9:30 · hora']);
  assert.deepEqual(await regras('NAO PERCA'), ['NAO → NÃO · acento']);
  assert.deepEqual(await regras('EXEMPLO VERT'), ['VERT sai · versão']);
  assert.deepEqual(await regras('CANTORA DE EXEMPLO.mov'), [], 'sem regra, sem rodapé');
  assert.equal(await conf.locator('.conf-filtros button', { hasText: 'Para decidir' }).count(), 0, 'nesta fatia nada fica para decidir');
  assert.equal(await conf.locator('.conf-pe .botao').textContent(), 'Gravar 10 no acervo');
  await semRolagemDeLado(p, `importar ${nome}, conferência`);

  // os filtros e a busca
  await conf.locator('.conf-filtros button', { hasText: 'Já no acervo' }).click();
  assert.equal(await conf.locator('.conf-linha').count(), 3);
  await conf.locator('.conf-filtros button', { hasText: 'Versões e cópias' }).click();
  assert.deepEqual(await conf.locator('.conf-linha .mot').allTextContents(), [
    'cópia da linha 5 (RDP - CANTORA DE EXEMPLO.mov)',
    'a mesma arte da linha 10 (RDP - DUPLA FICTICIA.mov)',
    'versão VERT da linha 5 (RDP - CANTORA DE EXEMPLO.mov)',
    'versão 6S da linha 5 (RDP - CANTORA DE EXEMPLO.mov)',
  ]);
  assert.equal(await conf.locator('.conf-linha .tirar').count(), 0, 'versão e cópia não são gravadas: não há o que tirar');
  await capturar(p, `importar-versoes-${nome}`);
  await conf.locator('.conf-filtros button', { hasText: 'Todas' }).click();
  await conf.locator('.conf-busca').fill('cantora');
  assert.equal(await conf.locator('.conf-linha').count(), 4, 'a arte, a cópia e as duas versões');
  await conf.locator('.conf-busca').fill('');

  // o ✕ tira a linha (vira "fora"); o ↺ devolve
  const grupo = conf.locator('.conf-linha', { hasText: 'GRUPO DE TESTE' });
  await grupo.locator('.tirar').click();
  assert.equal(await grupo.locator('.etq').textContent(), 'fora');
  assert.equal(await grupo.locator('.mot').textContent(), 'tirada da importação');
  assert.equal(await placar(p), '7 novas · 2 completam o acervo · 3 já no acervo · 7 ficam de fora');
  await grupo.locator('.tirar').click();
  assert.equal(await placar(p), '8 novas · 2 completam o acervo · 3 já no acervo · 6 ficam de fora');
  await grupo.locator('.tirar').click();
  assert.equal(await conf.locator('.conf-pe .botao').textContent(), 'Gravar 9 no acervo');
  assert.equal((await conf.locator('.conf-pe .efeito').textContent()).trim(), 'Cria 7 no acervo, dá o tipo a 2. As 10 outras não mudam nada.');
  await capturar(p, `importar-conferir-${nome}`);

  // gravar: o resultado antes → depois
  await conf.locator('.conf-pe .botao').click();
  const res = p.locator('.resultado-importacao');
  await res.waitFor();
  assert.equal((await res.locator('.grande').textContent()).replace(/\s+/g, ''), '24→31');
  assert.equal((await res.locator('.det').textContent()).replace(/\s+/g, ' ').trim(), `artes no acervo de ${PROGRAMA}+7 novas · 2 ganharam o tipo · 10 linhas sem mudança`);
  await semRolagemDeLado(p, `importar ${nome}, resultado`);
  await capturar(p, `importar-gravado-${nome}`);

  // a ficha com o total novo, a lista também
  await res.locator('.botao', { hasText: 'Ver a ficha' }).click();
  await ficha.locator('.total-acervo', { hasText: '31' }).waitFor();
  assert.equal(await ficha.locator('.legenda-tipos .sem').textContent(), 'sem tipo1', 'as que estavam sem tipo ganharam o tipo');
  await linha(p, PROGRAMA).locator('.qtd-acervo', { hasText: '31 artes' }).waitFor();
  assert.deepEqual(erros, [], `importar ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: importar ${nome}: ficha → Importar CSV → conferir (placar, filtros, busca, tirar e devolver) → gravar → 24 → 31 na ficha`);
}

/** O CSV solto na área tracejada da ficha, de outra atração (a novela), até o resultado. */
async function soltarNoComputador(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  await linha(p, 'Novela Fictícia').locator('.abrir-ficha').click();
  const area = p.locator('.ficha-atr .area-importar');
  await area.waitFor();
  // o arrasto entra na janela e chega à área: o "Pode soltar" dos roteiros não cobre a ficha, e a área acende
  await area.evaluate((el, texto) => {
    window.__csv = new DataTransfer();
    window.__csv.items.add(new File([texto], 'NOVELA_SERVICO.csv', { type: 'text/csv' }));
    for (const tipo of ['dragenter', 'dragover']) el.dispatchEvent(new DragEvent(tipo, { dataTransfer: window.__csv, bubbles: true, cancelable: true }));
  }, CSV_NOVELA);
  assert.equal(await p.locator('.soltar').count(), 0, 'o soltar da janela (roteiros) fica desligado na ficha');
  assert.ok(await area.evaluate((el) => el.classList.contains('sobre')), 'a área tracejada acende');
  await area.evaluate((el) => el.dispatchEvent(new DragEvent('drop', { dataTransfer: window.__csv, bubbles: true, cancelable: true })));
  const conf = p.locator('.conferencia');
  await conf.waitFor();
  assert.equal(p.url().endsWith('#/cadastros/atracoes'), true, 'o CSV não foi para a fila');
  assert.equal(await placar(p), '2 novas · 0 completam o acervo · 1 já no acervo · 1 fica de fora');
  await capturar(p, `importar-conferir-novela-${nome}`);
  await conf.locator('.conf-pe .botao', { hasText: 'Gravar 2 no acervo' }).click();
  await p.locator('.resultado-importacao').waitFor();
  assert.equal((await p.locator('.resultado-importacao .grande').textContent()).replace(/\s+/g, ''), '1→3');
  await capturar(p, `importar-gravado-novela-${nome}`);
  await p.locator('.resultado-importacao .botao', { hasText: 'Ver o acervo' }).click();
  await p.locator('.lista-acervo .arte-acervo').nth(2).waitFor();
  assert.deepEqual(await p.locator('.lista-acervo .arte-acervo .t').allTextContents(), ['AMANHÃ', 'HOJE', 'HOJE'], '"Ver o acervo" abre a lista com as novas (AMANHA ganhou o acento)');
  assert.deepEqual(erros, [], `soltar ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: soltar ${nome}: o CSV solto na área tracejada → conferir → gravar → 1 → 3 → Ver o acervo`);
}

async function principal() {
  const s = await subir({ acervo: await acervoFalso(), env: { CADASTRO_ADMINS: LIA } });
  const navegador = await chromium.launch();
  try {
    for (const tema of ['light', 'dark']) await noComputador(navegador, s.url, tema);
    await semSerAdministrador(navegador, s.url);
    for (const tema of ['light', 'dark']) await noCelular(navegador, s.url, tema);
    // a importação muda o acervo de mentira: depois das telas que contam as 24
    await importarNoComputador(navegador, s.url, 'light');
    await soltarNoComputador(navegador, s.url, 'dark');
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
