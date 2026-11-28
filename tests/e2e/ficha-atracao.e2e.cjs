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
// As linhas para decidir (#60), noutra atração fictícia: as perguntas na linha (o nome parecido com um do acervo, o
// erro que está no próprio acervo, o acento sugerido, o tipo tirado do começo do nome, a sigla que não é tipo e o
// rodapé composto), o nome e o tipo editados na linha (o estado recalculado), o lote (aceitar os acentos, deixar fora
// as de uma sigla, dar o tipo às marcadas e tirar as marcadas) e o Gravar, travado com "Faltam N decisões" e liberado
// com o que será feito; gravar cria as novas e renomeia no lugar a linha do acervo que estava errada.
//
// O histórico e o desfazer (#61), numa revista fictícia (uma por tema): gravar → a caixinha preta "+N no acervo" →
// Desfazer → o resultado volta (6 → 4) e a ficha também, com a importação riscada em "Importações"; gravar de novo,
// alguém mexe numa linha no Teable de mentira (a data de modificação muda), desfazer pelo histórico da ficha → o aviso
// diz qual linha não voltou.
//
// Lembrar as decisões (#63): a gravação do Auditório (com "lembrar as decisões", marcado por padrão) guarda as
// decisões como regras da atração; importar o mesmo CSV de novo já vem decidido, cada linha com "regra desta atração",
// e a ficha mostra "Regras desta atração"; apagar a regra da sigla COMP faz as linhas dela perguntarem de novo.
//
// Os avisos da prévia (#62): cada atração tem a pasta de output no cadastro (o caminho do Windows; o CSV vem do Mac).
// O CSV da pasta da atração e novo dá o aviso verde; o mesmo arquivo de novo, "já foi importado aqui em DD/MM"; o CSV
// da novela na ficha do programa, o aviso de outra atração, com o Gravar travado até "É de … mesmo" e o "Importar em
// Novela Fictícia", que leva o CSV para a ficha da novela.
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
// o Auditório Fictício (#60): o acervo com um nome errado (SORISSO) e os que o CSV escreve quase igual
const AUDITORIO = 'Auditório Fictício';
const ARTES_DO_AUDITORIO = [
  ['BANDA MAR ABERTO', 'RDP'],
  ['SORISSO FICTICIO', 'RDP'],
  ['HOJE', 'CRT'],
  ['PLATEIA', 'LETT'],
];
const LINHAS = [
  ...ARTES.map(([arte, tipo], i) => ({ id: `recArte${i}`, arte, tipo: tipo || null, atracao: [{ id: 'recProg', title: PROGRAMA }], claquete: [], filme: null })),
  ...ARTES_DO_AUDITORIO.map(([arte, tipo], i) => ({ id: `recAud${i}`, arte, tipo, atracao: [{ id: 'recAud', title: AUDITORIO }], claquete: [], filme: null })),
  { id: 'recOutra', arte: 'HOJE', tipo: 'RDP', atracao: [{ id: 'recNovela', title: 'Novela Fictícia' }], claquete: [], filme: null },
  { id: 'recFilme', arte: 'TÍTULO', tipo: null, atracao: [{ id: 'recSessao', title: 'Sessão Fictícia' }], claquete: [], filme: { id: 'recF', title: 'FILME FICTÍCIO (2020)' } },
];
// as revistas (#61): o mesmo acervo, uma para cada tema
const REVISTAS = { light: 'Revista Fictícia', dark: 'Revista Noturna' };
const ARTES_DA_REVISTA = [
  ['CAPA', 'CRT'],
  ['ENTREVISTA', 'RDP'],
  ['BASTIDORES', ''],
  ['MODA NOVA', 'RDP'],
];
let relogio = 0;
const carimbo = () => new Date(Date.UTC(2026, 10, 20, 12, 0, relogio++)).toISOString();
for (const [tema, nome] of Object.entries(REVISTAS))
  LINHAS.push(...ARTES_DA_REVISTA.map(([arte, tipo], i) => ({ id: `recRev${tema}${i}`, arte, tipo: tipo || null, atracao: [{ id: `recRev${tema}`, title: nome }], claquete: [], filme: null })));
for (const l of LINHAS) l.modificado = carimbo();
// a pasta de output de cada atração no cadastro (#62): o caminho do Windows; a revista noturna não tem
const saida = (pasta) => `\\\\FICTICIO\\output\\${pasta}`;
const ACERVOS = [
  { atracao: REVISTAS.light, acervo: 'próprio', output_win: saida('REVISTA') },
  { atracao: REVISTAS.dark, acervo: 'próprio', output_win: 'cole_aqui_o_caminho' },
  { atracao: PROGRAMA, acervo: 'próprio', output_win: saida('PROGRAMA FICTICIO') },
  { atracao: 'Novela Fictícia', acervo: null, output_win: saida('NOVELA FICTICIA') },
  { atracao: 'Sessão Fictícia', acervo: 'do filme', output_win: null },
  { atracao: 'Shows Fictícios', acervo: 'sem acervo', output_win: null },
  { atracao: AUDITORIO, acervo: 'próprio', output_win: saida('AUDITORIO FICTICIO') },
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
  'ABERTURA EP 12.mov', // sem o prefixo do tipo
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
  { atracao: [{ id: 'recAud', title: AUDITORIO }], artes: 'SORRISO FICTÍCIO | MÁRCIA UM | MÁRCIA DOIS | JOÃO TRÊS | JOÃO QUATRO' },
];
// a revista (#61): ESTREIA nova, CAPA em lettering nova, BASTIDORES ganha o tipo, CAPA (CRT) já está
const CSV_REVISTA = csv('REVISTA', ['RDP - BASTIDORES.mov', 'CRT - CAPA.mov', 'LETT - CAPA.mov', 'RDP - ESTREIA.mov']);
const CSV_NOVELA = csv('NOVELA FICTICIA', ['RDP - HOJE.mov', 'CRT - HOJE.mov', 'CRT - AMANHA.mov', 'RDP - HOJE (1).mov']);
// o CSV do Auditório (#60): cada pergunta, as que se editam na linha e as que vão em lote
const CSV_AUDITORIO = csv('AUDITORIO FICTICIO', [
  'RDP - BANDA MAR ABERTTO.mov', // parecida com BANDA MAR ABERTO: é a mesma
  'RDP - SORRISO FICTICIO.mov', // o acervo escreve SORISSO, o roteiro SORRISO: corrigir o acervo
  'RDP - MARCIA DO VALE.mov', // acento sugerido (em lote)
  'RDP - JOAO PEDREIRA.mov', // acento sugerido (em lote)
  'MOLDURA VIDEO.png', // o tipo do começo do nome: confirmar
  'COMP - ABERTURA EP 12.mov', // COMP não é tipo (em lote: ficam fora)
  'COMP - ENCERRAMENTO EP 12.mov',
  'RDP - ANA LUZ E BENTO LUZ.mov', // rodapé composto: fica fora
  'CRT - HOJ.mov', // o nome editado na linha: HOJE já está no acervo
  'CRT - PLATEIA.mov', // o tipo trocado na linha: PLATEIA (LETT) já está no acervo
  'CRT - DOMINGO.mov', // marcadas: ganham o tipo LETT
  'CRT - SEGUNDA.mov',
  'CRT - VINHETA 1.mov', // marcadas: não importar
  'CRT - VINHETA 2.mov',
]);

const atracao = (id, nome, categoria, acervo, keys) => ({ id, nome, categoria, acervo, keys: keys.map((key, i) => ({ id: `${id}k${i}`, key })), caminhos: {}, campos: {} });
const CADASTROS = {
  ligado: true,
  atracoes: [
    atracao('recNovela', 'Novela Fictícia', 'Novela', 'proprio', ['NOVELA FICTICIA']),
    atracao('recProg', PROGRAMA, 'Programa', 'proprio', ['PROGRAMA FICTICIO', 'PROG FICT']),
    atracao('recSessao', 'Sessão Fictícia', 'Filme', 'filme', ['SESSAO FICTICIA']),
    atracao('recShows', 'Shows Fictícios', 'Show', 'sem', ['SHOWS']),
    atracao('recAud', AUDITORIO, 'Programa', 'proprio', ['AUDITORIO FICTICIO']),
    atracao('recRevlight', REVISTAS.light, 'Programa', 'proprio', ['REVISTA FICTICIA']),
    atracao('recRevdark', REVISTAS.dark, 'Programa', 'proprio', ['REVISTA NOTURNA']),
  ],
  redatores: [],
  editores: [],
  categorias: ['Filme', 'Novela', 'Programa', 'Show'],
  camposCaminho: [],
  formulas: {},
  podeApagar: true,
};

const ID_DA_ATRACAO = { [PROGRAMA]: 'recProg', 'Novela Fictícia': 'recNovela', 'Sessão Fictícia': 'recSessao', 'Shows Fictícios': 'recShows', [AUDITORIO]: 'recAud', [REVISTAS.light]: 'recRevlight', [REVISTAS.dark]: 'recRevdark' };
const TIPOS = ['RDP', 'CRT', 'LETT', 'FOTO', 'MOLDURA'];

/** O Teable de mentira: o Postgres (o acervo e as atrações, com a data de modificação de cada linha) e a API (os campos
    e os registros, que mudam o acervo e a data). */
async function acervoFalso() {
  const { criarAcervo } = await import(join(RAIZ, 'servidor', 'acervo.mjs'));
  const env = { TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', tabelas: { ARTES_acervo: { pg: 'acervo' }, atracoes: { pg: 'atracoes' }, ARTE_producao: { pg: 'producao' } }, TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'falso', TEABLE_ACERVO: 'tblFalso' };
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
      resposta = {
        records: corpo.records.map((r) => {
          const nome = Object.keys(ID_DA_ATRACAO).find((n) => ID_DA_ATRACAO[n] === r.fields.atracao[0].id);
          const nova = { id: `recNova${++novas}`, arte: r.fields.arte, tipo: r.fields.tipo ?? null, caminho: r.fields.caminho ?? null, atracao: [{ id: r.fields.atracao[0].id, title: nome }], claquete: [], filme: null, modificado: carimbo() };
          LINHAS.push(nova);
          return { id: nova.id, fields: r.fields };
        }),
      };
    else if (metodo === 'PATCH') for (const r of corpo.records) Object.assign(LINHAS.find((l) => l.id === r.id), r.fields, { modificado: carimbo() });
    else if (metodo === 'DELETE')
      for (const [, id] of [...new URL(url).searchParams].filter(([k]) => /^recordIds\[\d+\]$/.test(k))) {
        const i = LINHAS.findIndex((l) => l.id === id);
        if (i >= 0) LINHAS.splice(i, 1);
      }
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
  await lista.locator('.cad-busca input').focus();
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
  await ficha.locator('.cad-busca input').focus();
  await ficha.locator('.cad-busca input').fill('sábado');
  assert.deepEqual(await ficha.locator('.arte-acervo .t').allTextContents(), ['PRÓXIMO SÁBADO', 'SÁBADO', 'SÁBADO', 'SÁBADO 3:00', 'SABADO 7 15']);
  await semRolagemDeLado(p, `celular ${tema}`);
  await capturar(p, `ficha-celular-${tema === 'dark' ? 'escuro' : 'claro'}`);
  await ficha.locator('.cad-busca input').focus();
  await ficha.locator('.cad-busca input').fill('nenhuma assim');
  // #171: o vazio da busca à mão (NadaNaBusca)
  await ficha.locator('.nada-na-busca', { hasText: 'nada com “nenhuma assim” no acervo' }).waitFor();
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
      const arte = l.querySelector('input.arte')?.value ?? t('.arte');
      const tipo = l.querySelector('.tipo select')?.value ?? '';
      return `${l.querySelector('.arq').lastChild.textContent} → ${t('.etq')} ${arte}${tipo ? ` (${tipo})` : ''}`;
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
    'ABERTURA EP 12.mov → fora —',
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
  // os caminhos na pasta de output do programa e o arquivo novo: o aviso verde (#62)
  assert.equal(await conf.locator('.conf-aviso.ok').textContent(), `Os 19 caminhos estão na pasta de output de ${PROGRAMA}. Este arquivo nunca foi importado aqui.`);
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
  assert.equal((await res.locator('.det').textContent()).replace(/\s+/g, ' ').trim(), `artes no acervo de ${PROGRAMA}+7 novas · 2 ganharam o tipo · 10 linhas sem mudança1 decisão lembrada para as próximas desta atração`); // a linha tirada
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

/** Os avisos da prévia (#62), depois de o programa gravar o PROGRAMA_SERVICO.csv: o verde (um CSV novo da pasta do
    programa), o já importado (o mesmo arquivo de novo) e o de outra atração (o CSV da novela na ficha do programa), com
    a confirmação e o "Importar em Novela Fictícia". Nada é gravado. */
async function avisosNoComputador(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  await linha(p, PROGRAMA).locator('.abrir-ficha').click();
  const ficha = p.locator('.ficha-atr');
  await ficha.locator('.total-acervo').waitFor();
  const conf = p.locator('.conferencia');
  const importar = async (arquivo, texto) => {
    await ficha.locator('.area-importar input[type=file]').setInputFiles({ name: arquivo, mimeType: 'text/csv', buffer: Buffer.from(texto) });
    await conf.waitFor();
  };
  const cancelar = async () => {
    await conf.locator('.conf-topo .botao', { hasText: 'Cancelar' }).click();
    await ficha.locator('.total-acervo').waitFor();
  };
  const texto = async (sel) => (await conf.locator(sel).textContent()).replace(/\s+/g, ' ').trim();

  // o verde: os caminhos na pasta do programa e o arquivo nunca importado
  await importar('PROGRAMA_NOVIDADES.csv', csv('PROGRAMA FICTICIO', ['RDP - CONVIDADA NOVA.mov', 'CRT - ESTREIA.mov']));
  assert.equal(await texto('.conf-aviso.ok'), `Os 2 caminhos estão na pasta de output de ${PROGRAMA}. Este arquivo nunca foi importado aqui.`);
  assert.equal(await conf.locator('.conf-aviso.ruim').count(), 0);
  await capturar(p, `avisos-verde-${nome}`);
  await cancelar();

  // o mesmo arquivo de novo: "já foi importado aqui em DD/MM"; a pasta confere, sem o verde
  await importar('PROGRAMA_SERVICO.csv', CSV_PROGRAMA);
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  assert.equal(await texto('.conf-aviso.ruim'), `Este arquivo já foi importado aqui em ${hoje}. O que já está no acervo vem como “já no acervo” e não é gravado de novo.`);
  assert.equal(await conf.locator('.conf-aviso.ok').count(), 0);
  // o já importado só avisa (o que já entrou vem "já no acervo"): não pede confirmação
  assert.equal(await placar(p), '0 novas · 0 completam o acervo · 12 já no acervo · 7 ficam de fora');
  assert.ok(!(await texto('.conf-pe')).includes('Confirme a atração'), 'o já importado não trava o Gravar');
  await capturar(p, `avisos-ja-importado-${nome}`);
  await cancelar();

  // o CSV da novela na ficha do programa: o aviso de outra atração, e o Gravar travado até confirmar
  await importar('NOVELA_CAPITULOS.csv', csv('NOVELA FICTICIA', ['RDP - CAPITULO FINAL.mov', 'CRT - REENCONTRO.mov']));
  const aviso = conf.locator('.conf-aviso.ruim');
  assert.equal(
    (await aviso.locator('> span').first().textContent()).replace(/\s+/g, ' ').trim(),
    `Estes caminhos estão na pasta de output de Novela Fictícia, não na de ${PROGRAMA}. Um CSV da atração errada enche o acervo de artes que nunca vão bater.`,
  );
  assert.deepEqual(await aviso.locator('.acoes-av button').allTextContents(), ['Importar em Novela Fictícia', `É de ${PROGRAMA} mesmo`]);
  const gravar = conf.locator('.conf-pe .botao.primario');
  assert.ok(await gravar.isDisabled(), 'sem a confirmação, o Gravar fica travado');
  assert.ok((await texto('.conf-pe')).includes('Confirme a atração no aviso acima'));
  await semRolagemDeLado(p, `avisos ${nome}, outra atração`);
  await capturar(p, `avisos-outra-atracao-${nome}`);
  await aviso.locator('button', { hasText: 'mesmo' }).click();
  assert.equal(await texto('.conf-aviso.neutro > span:not(.acoes-av)'), `Confirmado: o CSV é de ${PROGRAMA}, mesmo com os caminhos fora da pasta de output.`);
  assert.ok(await gravar.isEnabled(), 'confirmado, o Gravar libera');
  await capturar(p, `avisos-outra-confirmada-${nome}`);
  await conf.locator('.conf-aviso.neutro button', { hasText: 'mudar' }).click();
  assert.ok(await gravar.isDisabled());
  // "Importar em Novela Fictícia": o mesmo CSV vai para a ficha da novela, e a conferência recomeça lá
  await conf.locator('.conf-aviso.ruim button', { hasText: 'Importar em Novela Fictícia' }).click();
  await conf.locator('h2', { hasText: 'Novela Fictícia' }).waitFor();
  assert.equal(await conf.locator('.conf-aviso', { hasText: 'outra atração' }).count(), 0);
  assert.equal(await conf.locator('.conf-aviso button', { hasText: 'mesmo' }).count(), 0, 'na novela, os caminhos conferem');
  assert.equal((await p.locator('.trilha-cad').textContent()).replace(/\s+/g, ' ').trim(), 'CadastrosNovela FictíciaImportar acervo', 'a trilha é a da novela');
  await conf.locator('.conf-topo .botao', { hasText: 'Cancelar' }).click();
  assert.deepEqual(erros, [], `avisos ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: avisos ${nome}: o verde, o já importado em ${hoje} e o CSV de outra atração (travado → confirmado; Importar em Novela Fictícia)`);
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

/** As linhas para decidir (#60): as perguntas na linha, a edição, o lote e o Gravar travado e liberado. Com gravar,
    vai até o resultado (o acervo de mentira muda); sem, cancela depois das capturas. */
async function decidirNoComputador(navegador, url, tema, { gravar }) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  // alta o bastante para a conferência inteira caber: o pé (fixo embaixo) não cobre linhas na captura
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1800 }, colorScheme: tema });
  await linha(p, AUDITORIO).locator('.abrir-ficha').click();
  await p.locator('.ficha-atr .area-importar input[type=file]').setInputFiles({ name: 'AUDITORIO_SERVICO.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_AUDITORIO) });
  const conf = p.locator('.conferencia');
  await conf.waitFor();
  const pe = conf.locator('.conf-pe');
  // pelo nome do arquivo (o texto da linha inteira tem as opções do tipo)
  const da = (arquivo) => conf.locator('.conf-linha', { has: p.locator('.arq', { hasText: arquivo }) });
  const estado = async (arquivo) => `${(await da(arquivo).locator('.etq').textContent()).trim()} ${await da(arquivo).locator('input.arte').inputValue()} (${await da(arquivo).locator('.tipo select').inputValue()})`;
  assert.equal(await placar(p), '6 novas · 0 completam o acervo · 0 já no acervo · 0 ficam de fora · 8 para decidir');
  // as "para decidir" vêm primeiro, cada uma com a pergunta na linha
  assert.deepEqual((await linhasDaConferencia(p)).slice(0, 8), [
    'RDP - BANDA MAR ABERTTO.mov → decidir BANDA MAR ABERTTO (RDP)',
    'RDP - SORRISO FICTICIO.mov → decidir SORRISO FICTÍCIO (RDP)',
    'RDP - MARCIA DO VALE.mov → decidir MARCIA DO VALE (RDP)',
    'RDP - JOAO PEDREIRA.mov → decidir JOAO PEDREIRA (RDP)',
    'MOLDURA VIDEO.png → decidir MOLDURA VÍDEO (MOLDURA)',
    'COMP - ABERTURA EP 12.mov → decidir ABERTURA EP 12',
    'COMP - ENCERRAMENTO EP 12.mov → decidir ENCERRAMENTO EP 12',
    'RDP - ANA LUZ E BENTO LUZ.mov → decidir ANA LUZ E BENTO LUZ (RDP)',
  ]);
  const pergunta = (arquivo) => da(arquivo).locator('.conf-perguntas .conf-pergunta').evaluate((q) => [q.querySelector('.q').textContent, ...[...q.querySelectorAll('button')].map((b) => b.textContent)].join(' | '));
  assert.equal(await pergunta('BANDA MAR ABERTTO'), 'Parece BANDA MAR ABERTO (RDP), que já está no acervo. | É a mesma: erro no arquivo | O do acervo está errado: corrigir | É outra arte');
  assert.equal(await pergunta('SORRISO'), 'O acervo tem SORISSO FICTICIO (RDP), quase igual. | O do acervo está errado: corrigir | É a mesma: erro no arquivo | São artes diferentes');
  assert.equal(await pergunta('MARCIA'), 'Acento? | MÁRCIA DO VALE | Como está');
  assert.equal(await pergunta('MOLDURA'), 'Sem “SIGLA - ”: o tipo saiu do começo do nome. | MOLDURA está certo | Fica fora');
  assert.equal(await pergunta('ABERTURA EP 12'), 'COMP não é tipo do acervo. | Fica fora');
  assert.equal(await pergunta('ANA LUZ'), 'Dois nomes num rodapé. O roteiro escreve assim? | Sim, importar | Fica fora');
  assert.equal((await pe.locator('.falta').textContent()).trim(), 'Faltam 8 decisões');
  assert.ok(await pe.locator('.botao').isDisabled(), 'o Gravar travado com decisão pendente');
  assert.equal(await pe.locator('.botao').textContent(), 'Gravar');
  await conf.locator('.conf-filtros button', { hasText: 'Para decidir' }).click();
  assert.equal(await conf.locator('.conf-linha').count(), 8);
  await semRolagemDeLado(p, `decidir ${nome}`);
  await capturar(p, `decidir-perguntas-${nome}`);
  await conf.locator('.conf-filtros button', { hasText: 'Todas' }).click();

  // decidir na linha: a pergunta some e fica "Decidido: … mudar"; o estado é recalculado
  await da('BANDA MAR ABERTTO').locator('.conf-perguntas button', { hasText: 'É a mesma: erro no arquivo' }).click();
  assert.equal(await estado('BANDA MAR ABERTTO'), 'já no acervo BANDA MAR ABERTO (RDP)');
  assert.equal((await da('BANDA MAR ABERTTO').locator('.resolvida').textContent()).replace(/\s+/g, ' ').trim(), 'Decidido: É a mesma: erro no arquivo mudar');
  await da('SORRISO').locator('.conf-perguntas button', { hasText: 'O do acervo está errado: corrigir' }).click();
  assert.equal(await estado('SORRISO'), 'corrige o acervo SORRISO FICTÍCIO (RDP)');
  assert.equal(await da('SORRISO').locator('.mot').textContent(), '“SORISSO FICTICIO” no acervo vira “SORRISO FICTÍCIO” (a mesma linha)');
  await da('MOLDURA').locator('.conf-perguntas button', { hasText: 'MOLDURA está certo' }).click();
  assert.equal(await estado('MOLDURA'), 'nova MOLDURA VÍDEO (MOLDURA)');
  await da('ANA LUZ').locator('.conf-perguntas button', { hasText: 'Fica fora' }).click();
  assert.equal((await da('ANA LUZ').locator('.etq').textContent()).trim(), 'fora');
  // "mudar" devolve a pergunta; decidir de novo
  await da('ANA LUZ').locator('.resolvida .botao-texto').click();
  assert.equal((await da('ANA LUZ').locator('.etq').textContent()).trim(), 'decidir');
  await da('ANA LUZ').locator('.conf-perguntas button', { hasText: 'Fica fora' }).click();
  assert.equal((await pe.locator('.falta').textContent()).trim(), 'Faltam 4 decisões');
  assert.ok(await pe.locator('.botao').isDisabled());
  await capturar(p, `decidir-travado-${nome}`);

  // a edição na linha: o nome e o tipo, com o estado recalculado pela chave
  await da('CRT - HOJ.mov').locator('input.arte').fill('hoje');
  await da('CRT - HOJ.mov').locator('input.arte').press('Enter');
  assert.equal(await estado('CRT - HOJ.mov'), 'já no acervo HOJE (CRT)');
  await da('CRT - PLATEIA').locator('.tipo select').selectOption('LETT');
  assert.equal(await estado('CRT - PLATEIA'), 'já no acervo PLATEIA (LETT)');

  // em lote: marcar linhas, dar o tipo, tirar; aceitar os acentos; as de uma sigla ficam fora
  const lote = conf.locator('.conf-lote');
  await da('CRT - DOMINGO').locator('.marcar').check();
  await da('CRT - SEGUNDA').locator('.marcar').check();
  assert.deepEqual(await lote.locator('.pilula').allTextContents(), ['Aceitar os 2 acentos sugeridos', 'As 2 com COMP ficam fora', 'não importar']);
  assert.equal((await lote.locator('span').nth(1).textContent()).replace(/\s+/g, ' ').trim(), '2 marcadas:');
  await capturar(p, `decidir-lote-${nome}`);
  await lote.locator('select').selectOption('LETT');
  assert.equal(await estado('CRT - DOMINGO'), 'nova DOMINGO (LETT)');
  assert.equal(await estado('CRT - SEGUNDA'), 'nova SEGUNDA (LETT)');
  await da('VINHETA 1').locator('.marcar').check();
  await da('VINHETA 2').locator('.marcar').check();
  await lote.locator('.pilula', { hasText: 'não importar' }).click();
  assert.equal(await da('VINHETA 2').locator('.mot').textContent(), 'tirada da importação');
  await lote.locator('.pilula', { hasText: 'Aceitar os 2 acentos sugeridos' }).click();
  assert.equal(await estado('MARCIA'), 'nova MÁRCIA DO VALE (RDP)');
  assert.equal(await estado('JOAO'), 'nova JOÃO PEDREIRA (RDP)');
  await lote.locator('.pilula', { hasText: 'As 2 com COMP ficam fora' }).click();
  assert.equal(await conf.locator('.conf-linha.e-decidir').count(), 0);

  // sem decisão pendente, o Gravar libera e diz o que será feito
  assert.equal(await placar(p), '5 novas · 1 completa o acervo · 3 já no acervo · 5 ficam de fora · 0 para decidir');
  assert.equal(await pe.locator('.falta').count(), 0);
  assert.equal((await pe.locator('.efeito').textContent()).replace(/\s+/g, ' ').trim(), 'Cria 5 no acervo, renomeia 1 (o nome errado no acervo, na mesma linha). As 8 outras não mudam nada.');
  assert.equal(await pe.locator('.botao').textContent(), 'Gravar 6 no acervo');
  assert.ok(await pe.locator('.botao').isEnabled());
  assert.equal((await pe.locator('.lembrar').textContent()).trim(), `lembrar as decisões nas próximas de ${AUDITORIO}`);
  assert.ok(await pe.locator('.lembrar input').isChecked(), '"lembrar as decisões" vem marcado');
  await semRolagemDeLado(p, `decidir ${nome}, liberado`);
  await capturar(p, `decidir-liberado-${nome}`);

  if (gravar) {
    await pe.locator('.botao').click();
    const res = p.locator('.resultado-importacao');
    await res.waitFor();
    assert.equal((await res.locator('.grande').textContent()).replace(/\s+/g, ''), '4→9');
    assert.equal(
      (await res.locator('.det').textContent()).replace(/\s+/g, ' ').trim(),
      `artes no acervo de ${AUDITORIO}+5 novas · 0 ganharam o tipo · 1 nome corrigido · 8 linhas sem mudança13 decisões lembradas para as próximas desta atração`,
    );
    assert.equal(LINHAS.find((l) => l.id === 'recAud1').arte, 'SORRISO FICTÍCIO', 'o nome errado do acervo foi corrigido na mesma linha (o mesmo id)');
    await capturar(p, `decidir-gravado-${nome}`);
    await res.locator('.botao', { hasText: 'Ver o acervo' }).click();
    await p.locator('.lista-acervo .arte-acervo').nth(8).waitFor();
    assert.deepEqual(await p.locator('.lista-acervo .arte-acervo .t').allTextContents(), ['BANDA MAR ABERTO', 'DOMINGO', 'HOJE', 'JOÃO PEDREIRA', 'MÁRCIA DO VALE', 'MOLDURA VÍDEO', 'PLATEIA', 'SEGUNDA', 'SORRISO FICTÍCIO']);
  } else await conf.locator('.conf-topo .botao', { hasText: 'Cancelar' }).click();
  assert.deepEqual(erros, [], `decidir ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: decidir ${nome}: as perguntas na linha, a edição, o lote e o Gravar travado → liberado${gravar ? ' → gravado (cria 5, renomeia 1 no lugar)' : ''}`);
}

/** Lembrar as decisões (#63): depois de gravar o Auditório lembrando, a ficha mostra as regras e o mesmo CSV volta já
    decidido, cada linha com "regra desta atração"; com apagar, a regra da sigla COMP some e as linhas dela perguntam
    de novo. */
async function lembrarNoComputador(navegador, url, tema, { apagar }) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1500 }, colorScheme: tema });
  await linha(p, AUDITORIO).locator('.abrir-ficha').click();
  const ficha = p.locator('.ficha-atr');
  const regras = ficha.locator('.regras-atracao');
  await regras.locator('li').first().waitFor();
  assert.equal(await regras.locator('li').count(), 8, 'a lista mostra 8 e "ver todas"');
  await regras.locator('> .botao-texto', { hasText: 'ver todas as 13' }).click();
  assert.deepEqual(await regras.locator('li .motivo').allTextContents(), [
    'BANDA MAR ABERTTO é BANDA MAR ABERTO (erro no arquivo)',
    'SORISSO FICTICIO → SORRISO FICTÍCIO (o nome errado do acervo)',
    'MARCIA DO VALE: o acento sugerido',
    'JOAO PEDREIRA: o acento sugerido',
    'MOLDURA VIDEO é MOLDURA',
    'COMP não é tipo do acervo: fica fora',
    'RDP - ANA LUZ E BENTO LUZ fica fora',
    'HOJ → HOJE',
    'CRT - PLATEIA é LETT',
    'CRT - DOMINGO é LETT',
    'CRT - SEGUNDA é LETT',
    'CRT - VINHETA 1 fica fora (tirada da importação)',
    'CRT - VINHETA 2 fica fora (tirada da importação)',
  ]);
  assert.match(await regras.locator('li .meta').first().textContent(), /^Lia Moraes · \d{2}\/\d{2}$/);
  await semRolagemDeLado(p, `lembrar ${nome}, ficha`);
  await capturar(p, `lembrar-regras-${nome}`);
  if (apagar) {
    const comp = regras.locator('li', { has: p.locator('.motivo', { hasText: 'COMP não é tipo do acervo' }) });
    await comp.locator('.botao-texto', { hasText: 'apagar' }).click();
    await comp.locator('.remover-conferir .botao-texto', { hasText: 'Apagar' }).click();
    await p.waitForFunction(() => document.querySelectorAll('.regras-atracao li').length === 12);
  }

  // o mesmo CSV de novo: as linhas já vêm decididas pelas regras desta atração
  await ficha.locator('.area-importar input[type=file]').setInputFiles({ name: 'AUDITORIO_SERVICO.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_AUDITORIO) });
  const conf = p.locator('.conferencia');
  await conf.waitFor();
  const da = (arquivo) => conf.locator('.conf-linha', { has: p.locator('.arq', { hasText: arquivo }) });
  const regrasDa = async (arquivo) => (await da(arquivo).locator('.regra').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
  if (apagar) {
    assert.equal(await placar(p), '0 novas · 0 completam o acervo · 9 já no acervo · 3 ficam de fora · 2 para decidir');
    assert.deepEqual((await linhasDaConferencia(p)).slice(0, 2), ['COMP - ABERTURA EP 12.mov → decidir ABERTURA EP 12', 'COMP - ENCERRAMENTO EP 12.mov → decidir ENCERRAMENTO EP 12']);
  } else {
    assert.equal(await placar(p), '0 novas · 0 completam o acervo · 9 já no acervo · 5 ficam de fora');
    assert.equal(await conf.locator('.conf-linha.e-decidir').count(), 0, 'nada para decidir');
    assert.equal((await da('COMP - ABERTURA').locator('.mot').textContent()).trim(), 'COMP não é tipo do acervo: fica fora · regra desta atração');
    assert.equal(await conf.locator('.conf-pe .botao').textContent(), 'Nada a gravar');
  }
  assert.deepEqual(await regrasDa('CRT - HOJ.mov'), ['HOJ → HOJE · regra desta atração']);
  assert.deepEqual(await regrasDa('BANDA MAR ABERTTO'), ['BANDA MAR ABERTTO → BANDA MAR ABERTO · regra desta atração']);
  assert.deepEqual(await regrasDa('CRT - PLATEIA'), ['tipo CRT → LETT · regra desta atração']);
  assert.deepEqual(await regrasDa('MOLDURA VIDEO'), ['sem “SIGLA - ” → MOLDURA · tipo · regra desta atração', 'VIDEO → VÍDEO · acento']);
  assert.equal((await da('VINHETA 1').locator('.mot').textContent()).trim(), 'CRT - VINHETA 1 fica fora (tirada da importação) · regra desta atração');
  assert.equal((await da('ANA LUZ').locator('.etq').textContent()).trim(), 'fora');
  await semRolagemDeLado(p, `lembrar ${nome}, conferência`);
  await capturar(p, `lembrar-previa-${nome}${apagar ? '-apagada' : ''}`);
  await conf.locator('.conf-topo .botao', { hasText: 'Cancelar' }).click();
  assert.deepEqual(erros, [], `lembrar ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: lembrar ${nome}: as regras na ficha${apagar ? ' (apagada a da sigla COMP)' : ''} → o mesmo CSV de novo já vem decidido, com "regra desta atração"`);
}

/** O histórico e o desfazer (#61): gravar → a caixinha preta → Desfazer → o total volta, com a importação riscada no
    histórico da ficha; gravar de novo, alguém mexe numa linha no Teable, desfazer pelo histórico → o aviso. */
async function desfazerNoComputador(navegador, url, tema) {
  const nome = tema === 'dark' ? 'escuro' : 'claro';
  const revista = REVISTAS[tema];
  const { ctx, p, erros } = await abrir(navegador, url, { viewport: { width: 1440, height: 1000 }, colorScheme: tema });
  await linha(p, revista).locator('.abrir-ficha').click();
  const ficha = p.locator('.ficha-atr');
  await ficha.locator('.total-acervo', { hasText: '4' }).waitFor();
  assert.equal(await ficha.locator('.historico-importacoes').count(), 0, 'sem importação, sem histórico');
  const importar = async (arquivo) => {
    await ficha.locator('.area-importar input[type=file]').setInputFiles({ name: arquivo, mimeType: 'text/csv', buffer: Buffer.from(CSV_REVISTA) });
    await p.locator('.conferencia').waitFor();
    assert.equal(await placar(p), '2 novas · 1 completa o acervo · 1 já no acervo · 0 ficam de fora');
    await p.locator('.conf-pe .botao').click();
    await p.locator('.resultado-importacao').waitFor();
  };

  // gravar: o resultado com o desfazer, e a caixinha preta
  await importar('REVISTA_SERVICO.csv');
  const res = p.locator('.resultado-importacao');
  assert.equal((await res.locator('.grande').textContent()).replace(/\s+/g, ''), '4→6');
  assert.match(await res.locator('.nota-desfazer').textContent(), /^Desfazer apaga as 2 linhas criadas e devolve o tipo e o nome antigos das que mudaram\. Fica na ficha da atração, em “Importações”, por 7 dias\./);
  const caixinha = p.locator('.caixinha-importacao');
  assert.equal((await caixinha.locator('span').textContent()).trim(), `+2 no acervo de ${revista}.`);
  await semRolagemDeLado(p, `desfazer ${nome}, gravado`);
  await capturar(p, `desfazer-gravado-${nome}`);

  // Desfazer na caixinha: o total volta (6 → 4); BASTIDORES volta a ficar sem tipo
  await caixinha.locator('.botao-texto', { hasText: 'Desfazer' }).click();
  await res.locator('.det-desfeita').waitFor();
  assert.equal((await res.locator('.grande').textContent()).replace(/\s+/g, ''), '6→4');
  assert.equal(await res.locator('.det-desfeita').textContent(), `Importação desfeita: o acervo de ${revista} voltou a 4.`);
  assert.equal(await res.locator('.nao-voltaram').count(), 0);
  await p.locator('.caixinha-importacao').waitFor({ state: 'detached', timeout: 2000 });
  assert.deepEqual(
    LINHAS.filter((l) => l.atracao[0]?.title === revista).map((l) => `${l.arte} (${l.tipo ?? ''})`),
    ['CAPA (CRT)', 'ENTREVISTA (RDP)', 'BASTIDORES ()', 'MODA NOVA (RDP)'],
    'o acervo voltou ao que era',
  );
  await capturar(p, `desfazer-desfeito-${nome}`);
  await res.locator('.botao', { hasText: 'Ver a ficha' }).click();
  await ficha.locator('.total-acervo', { hasText: '4' }).waitFor();
  await linha(p, revista).locator('.qtd-acervo', { hasText: '4 artes' }).waitFor();
  const hist = ficha.locator('.historico-importacoes');
  await hist.locator('li').first().waitFor();
  assert.equal(await hist.locator('li').count(), 1);
  assert.equal(await hist.locator('li .arq').textContent(), 'REVISTA_SERVICO.csv');
  assert.equal(await hist.locator('li .q').textContent(), '+2');
  assert.match(await hist.locator('li .meta').textContent(), /^Lia Moraes · 1 ganhou o tipo · desfeita por Lia Moraes em \d{2}\/\d{2}$/);
  assert.ok(await hist.locator('li').evaluate((li) => li.classList.contains('imp-desfeita')), 'a desfeita vem riscada');
  assert.equal(await hist.locator('li .acoes-imp').count(), 0, 'a desfeita não se desfaz de novo');

  // gravar de novo; alguém corrige no Teable o tipo de uma das criadas; desfazer pelo histórico
  await importar('REVISTA_SERVICO_2.csv');
  await p.locator('.resultado-importacao .botao', { hasText: 'Ver a ficha' }).click();
  await ficha.locator('.total-acervo', { hasText: '6' }).waitFor();
  await hist.locator('li').nth(1).waitFor();
  assert.deepEqual(await hist.locator('li .arq').allTextContents(), ['REVISTA_SERVICO_2.csv', 'REVISTA_SERVICO.csv'], 'a mais nova primeiro');
  await capturar(p, `desfazer-historico-${nome}`);
  Object.assign(LINHAS.find((l) => l.atracao[0]?.title === revista && l.arte === 'ESTREIA'), { tipo: 'CRT', modificado: carimbo() });
  const nova = hist.locator('li').first();
  await nova.locator('.acoes-imp .botao-texto', { hasText: 'desfazer' }).click();
  await nova.locator('.remover-conferir .botao-texto', { hasText: 'Desfazer' }).click();
  await nova.locator('.nao-voltaram').waitFor();
  assert.match(await nova.locator('.nao-voltaram').textContent(), /^1 linha não voltou: alguém mexeu nela no Teable depois da importação\. Confira à mão\./);
  assert.deepEqual(await nova.locator('.nao-voltaram li').evaluateAll((ls) => ls.map((l) => [...l.children].map((c) => c.textContent).join(' | '))), ['ESTREIA | CRT | continua no acervo']);
  await ficha.locator('.total-acervo', { hasText: '5' }).waitFor();
  await p.locator('.aviso, [role=status]', { hasText: '1 linha não voltou: veja em Importações.' }).first().waitFor();
  await semRolagemDeLado(p, `desfazer ${nome}, aviso`);
  await capturar(p, `desfazer-aviso-${nome}`);
  assert.deepEqual(erros, [], `desfazer ${nome}: erros na página`);
  await ctx.close();
  console.log(`ok: desfazer ${nome}: gravar 4 → 6 → Desfazer na caixinha → 6 → 4; histórico na ficha; desfazer pelo histórico avisa a linha mexida no Teable`);
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
    for (const tema of ['light', 'dark']) await avisosNoComputador(navegador, s.url, tema);
    await decidirNoComputador(navegador, s.url, 'dark', { gravar: false });
    await decidirNoComputador(navegador, s.url, 'light', { gravar: true });
    await lembrarNoComputador(navegador, s.url, 'light', { apagar: false });
    await lembrarNoComputador(navegador, s.url, 'dark', { apagar: true });
    for (const tema of ['light', 'dark']) await desfazerNoComputador(navegador, s.url, tema);
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
