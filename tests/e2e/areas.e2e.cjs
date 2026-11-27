// Ponta a ponta das Áreas de trabalho (#100), rodado à parte do vitest: `npm run e2e:areas`.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, nada sai para a rede), com os Cadastros de verdade
// (as rotas /api/cadastros) sobre um Teable falso: as tabelas de redatores e editores, com o campo e-mail, e as de
// keys. Quem já entrou no PROMeiro é a tabela usuarios do SQLite (cada um passa pelo /api/eu). Nomes e e-mails
// fictícios.
//
// Ligar pessoa e cadastro pelo e-mail (#106), no computador (claro): a administradora vê nos Redatores a sugestão "É Marina
// Teles, dos redatores?" para quem entrou como Mariana Telles; "É" grava o e-mail no Teable falso na hora, a linha
// mostra o e-mail e a caixinha preta oferece desfazer, que apaga o e-mail e traz a sugestão de volta; "É" de
// novo. Nos Editores, "Não é" tira a sugestão do Bruno Regis, e ela não volta depois de recarregar. O e-mail à mão: o
// "sem e-mail" do Otávio Reis vira campo, e o Enter grava. Quem não é administrador vê os e-mails, sem sugestão e sem
// editar. No celular (escuro), a sugestão de quem acabou de entrar e o "É".
//
// O seletor de área (#101), "PROMeiro / designer ▾" na linha do logo: o Caio (redator e editor nos cadastros, pelo
// e-mail) entra na raiz e cai na Designer (a fila); troca para o Redator e para o Editor, cada um com o endereço
// próprio e os "meus roteiros" dele por dia; recarregada a raiz, o PROMeiro volta na última área. A Joana, sem
// cadastro, tem uma área só e não vê o seletor. A administradora sem cadastro vê as três e o aviso de "meus roteiros"
// vazio. No celular (escuro), a Mariana (redatora, ligada pelo "É") troca de área pelo seletor.
//
// O ciclo do roteiro (#102): o Chef do Caio foi para o Trello e está com a Tânia (o envio e a Produção arrumados no
// SQLite, como o envio e a releitura da produção da arte deixam); a lista mostra "Produzindo", os passos com a data e
// "com Tânia Arruda", e a Novela, "Em revisão". A Produção entregue: ao ganhar o foco, a lista se lê de novo e o Chef
// passa a "Entregue". No celular (escuro), o ciclo cabe na ficha.
//
// As três exibições (#103): o Caio escolhe no topo de "meus roteiros" por dia, quadro (uma coluna por estado do ciclo,
// os passos de antes numa coluna "em breve") ou por estado (a faixa com quantos em cada estado, um toque mostra só um,
// e a lista agrupada). A escolha fica guardada por pessoa e por área (o Redator em quadro, o Editor por estado) e volta
// depois de recarregar e em outro navegador. No tablet, o quadro rola dentro dele; no celular (escuro), as colunas
// empilham, por estado cabe na tela e a escolha volta depois de recarregar.
//
// O roteiro aberto (#104): no Redator, o Caio abre o Chef pela lista (o quadro): o endereço é o do roteiro, o texto
// aparece só para leitura (não aceita digitar) e o ciclo em pé mostra os passos com a data; "próximo" vai à Novela e
// "anterior" volta, sem passar pela lista, e o endereço recarregado abre o mesmo roteiro. No Editor, o roteiro com
// artes mostra cada uma com o estado (entregue, produzindo, já existe) e a origem ("do roteiro", "do designer"), e
// quantas já foram entregues. No celular (escuro), o lado sobe para antes do texto e nada rola para o lado.
//
// O administrador (#105): a administradora sem cadastro vê no Redator e no Editor os roteiros de todos ("Roteiros", "de
// todos os redatores"), cada um com o redator e a edição, e o filtro "de quem" (de todos, com quantos, e cada pessoa,
// pelo nome do cadastro); escolher a Marina mostra só os dela, também na navegação do roteiro aberto, e o filtro
// continua ao voltar. Os caminhos do topo levam à Pauta em todas as áreas; o menu do perfil mostra as áreas e, fora
// delas, Cadastros e Configuração. Quem não é administrador vê só os seus, sem o filtro, e a rota recusa "de todos". No
// celular (escuro), o filtro e o perfil cabem na tela.
//
// Os caminhos do topo (#156), sem o "De todo mundo" e sem o traço que o separava: na Designer, "Produções · Filmes ·
// Pauta da edição", com bolinhas entre eles; a de depois de Filmes fica laranja só quando há filme esperando revisão na
// aba Filmes (a lista das prévias, de mentira aqui) e volta a ser neutra quando não há. No computador e no celular,
// claro e escuro; no celular, só os ícones, sem rolar para o lado.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:areas
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
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:areas');
  process.exit(2);
}

const LIA = 'lia.moraes@exemplo.com';
const OUTRA = 'joana.prado@exemplo.com';
const MARIANA = 'mariana.telles@exemplo.com';
const BRUNO = 'bruno.regis@exemplo.com';
const CAIO = 'caio.brandao@exemplo.com';
const CAPTURAS = process.env.CAPTURAS || '';
const VOCAB = { programas: [], redatores: [], editores: [], pauta: [] };

/* ---------- o Teable falso: redatores e editores, com o e-mail ---------- */
const ENV_CADASTROS = {
  TEABLE_URL: 'http://teable-falso',
  TEABLE_TOKEN: 'falso',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
};
const TABELAS = {
  tblRed: [
    { id: 'recR1', fields: { redator: 'Beatriz Lins', email: 'beatriz.lins@exemplo.com' } },
    { id: 'recR2', fields: { redator: 'Marina Teles' } },
    { id: 'recR3', fields: { redator: 'Otávio Reis' } },
    { id: 'recR4', fields: { redator: 'Renata Álvares' } },
    { id: 'recR5', fields: { redator: 'Caio Brandão', email: CAIO } },
  ],
  tblKeyRed: [
    { id: 'recKR1', fields: { key: 'BLINS', redator: [{ id: 'recR1' }] } },
    { id: 'recKR2', fields: { key: 'MTELES', redator: [{ id: 'recR2' }] } },
    { id: 'recKR3', fields: { key: 'OREIS', redator: [{ id: 'recR3' }] } },
  ],
  tblEdi: [
    { id: 'recE1', fields: { editor: 'Bruno Regis' } },
    { id: 'recE2', fields: { editor: 'Caio Brandão', email: CAIO } },
  ],
  tblKeyEdi: [],
};
const pedidosAoTeable = [];
const ok = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
async function buscarNoTeable(url, init = {}) {
  const u = new URL(url);
  const metodo = init.method ?? 'GET';
  if (u.host !== 'teable-falso') throw new Error(`o teste não sai para a rede: ${url}`);
  pedidosAoTeable.push(`${metodo} ${u.pathname}`);
  const [, tabela, , registro] = /\/api\/table\/(\w+)\/(record|field)(?:\/(\w+))?/.exec(u.pathname);
  if (metodo === 'GET') return ok({ records: TABELAS[tabela].map((r) => ({ id: r.id, fields: r.fields })) });
  if (metodo === 'PATCH') {
    const r = TABELAS[tabela].find((x) => x.id === registro);
    Object.assign(r.fields, JSON.parse(init.body).record.fields);
    return ok(r);
  }
  throw new Error(`pedido inesperado ao Teable: ${metodo} ${u.pathname}`);
}
const emailNoTeable = (tabela, id) => TABELAS[tabela].find((r) => r.id === id).fields.email ?? '';

/* ---------- o navegador ---------- */
async function abrir(navegador, url, aba, { email = LIA, ...opcoes } = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/cadastros/sem-cadastro', (r) => r.fulfill({ json: { keys: [], reconhecidas: { total: 0, amostra: [] } } }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/cadastros/${aba}`);
  await p.waitForSelector('.item-cad');
  return { ctx, p, erros };
}
const semRolagemDeLado = async (p, onde) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${onde}: a página não rola para o lado`);
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
};
const linha = (p, nome) => p.locator('.item-cad', { has: p.locator('.nome', { hasText: nome }) });
const caixinha = (p) => p.locator('.desfazer[role="status"]');

async function simE(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, 'redatores', { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const sugestao = p.locator('.sugestao-email');
  await sugestao.waitFor();
  assert.equal(await sugestao.count(), 1, 'uma sugestão nos Redatores');
  assert.match(await sugestao.innerText(), /mariana\.telles@exemplo\.com/);
  assert.equal((await sugestao.locator('.pergunta-sugestao').innerText()).trim(), 'É Marina Teles, dos redatores?');
  assert.equal((await linha(p, 'Marina Teles').locator('.email-cad').innerText()).trim(), 'sem e-mail');
  assert.equal((await linha(p, 'Beatriz Lins').locator('.email-cad').innerText()).trim(), 'beatriz.lins@exemplo.com');
  await capturar(p, '01-sugestao-dos-redatores-claro');

  // "É": grava na hora, a linha mostra o e-mail e a caixinha oferece desfazer
  await sugestao.getByRole('button', { name: 'É', exact: true }).click();
  await caixinha(p).filter({ hasText: 'agora está ligado a Marina Teles, dos redatores' }).waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR2'), MARIANA, 'o e-mail foi para o Teable');
  await linha(p, 'Marina Teles').locator('.email-cad', { hasText: MARIANA }).waitFor();
  assert.equal(await p.locator('.sugestao-email').count(), 0, 'a sugestão sai');
  await capturar(p, '02-e-gravado-com-desfazer-claro');

  // desfazer: o e-mail sai do Teable e a sugestão volta
  await caixinha(p).locator('button', { hasText: 'Desfazer' }).click();
  await p.locator('.sugestao-email').waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR2'), '', 'o desfazer apaga o e-mail no Teable');
  assert.equal((await linha(p, 'Marina Teles').locator('.email-cad').innerText()).trim(), 'sem e-mail');
  await p.locator('.sugestao-email').getByRole('button', { name: 'É', exact: true }).click();
  await linha(p, 'Marina Teles').locator('.email-cad', { hasText: MARIANA }).waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR2'), MARIANA);
  console.log('ok: "É Marina Teles, dos redatores?" para quem entrou como Mariana Telles; "É" grava no Teable na hora, desfazer apaga e a sugestão volta');

  // o e-mail à mão: o "sem e-mail" vira campo e o Enter grava
  await linha(p, 'Otávio Reis').locator('button.email-cad').click();
  await linha(p, 'Otávio Reis').locator('input.entrada-email-cad').fill('otavio.reis@exemplo.com');
  await linha(p, 'Otávio Reis').locator('input.entrada-email-cad').press('Enter');
  await linha(p, 'Otávio Reis').locator('.email-cad', { hasText: 'otavio.reis@exemplo.com' }).waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR3'), 'otavio.reis@exemplo.com');
  // o e-mail repetido é recusado e nada muda
  await linha(p, 'Otávio Reis').locator('button.email-cad').click();
  await linha(p, 'Otávio Reis').locator('input.entrada-email-cad').fill('beatriz.lins@exemplo.com');
  await linha(p, 'Otávio Reis').locator('input.entrada-email-cad').press('Enter');
  await p.locator('text=beatriz.lins@exemplo.com já é de Beatriz Lins.').waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR3'), 'otavio.reis@exemplo.com');
  await linha(p, 'Otávio Reis').locator('input.entrada-email-cad').press('Escape');
  console.log('ok: o e-mail à mão: o Enter grava no Teable; o e-mail de outro redator é recusado');

  // nos Editores, "Não é" fica lembrado: depois de recarregar, a sugestão não volta
  await p.locator('.abas-cad button[title="Editores"]').click();
  const doBruno = p.locator('.sugestao-email');
  await doBruno.waitFor();
  assert.equal((await doBruno.locator('.pergunta-sugestao').innerText()).trim(), 'É Bruno Regis, dos editores?');
  await doBruno.locator('button', { hasText: 'Não é' }).click();
  await caixinha(p).filter({ hasText: 'O PROMeiro não pergunta de novo.' }).waitFor();
  assert.equal(await p.locator('.sugestao-email').count(), 0);
  assert.equal(emailNoTeable('tblEdi', 'recE1'), '', '"Não é" não grava no Teable');
  await p.reload();
  await p.waitForSelector('.item-cad');
  await p.waitForTimeout(300);
  assert.equal(await p.locator('.sugestao-email').count(), 0, 'o "Não é" fica lembrado');
  console.log('ok: "Não é" tira a sugestão do editor, e ela não volta depois de recarregar');
  await semRolagemDeLado(p, 'computador');
  assert.deepEqual(erros, [], 'computador: erros na página');
  await ctx.close();
}

async function semSerAdministrador(navegador, url) {
  const { ctx, p, erros } = await abrir(navegador, url, 'redatores', { email: OUTRA, viewport: { width: 1440, height: 900 } });
  await p.waitForTimeout(300);
  assert.equal(await p.locator('.sugestao-email').count(), 0, 'sem sugestão para quem não é administrador');
  assert.equal(await p.locator('button.email-cad').count(), 0, 'sem editar o e-mail');
  assert.equal((await linha(p, 'Beatriz Lins').locator('.email-cad').innerText()).trim(), 'beatriz.lins@exemplo.com');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: quem não é administrador vê os e-mails, sem sugestão e sem editar');
}

async function noCelular(navegador, url) {
  // uma sugestão nova para o celular: quem entrou agora como Renata Alvares (o cadastro tem acento)
  await fetch(`${url.replace(/\/$/, '')}/api/eu`, { headers: { 'cf-access-authenticated-user-email': 'renata.alvares@exemplo.com' } });
  const { ctx, p, erros } = await abrir(navegador, url, 'redatores', { ...devices['iPhone 13'], colorScheme: 'dark' });
  const sugestao = p.locator('.sugestao-email');
  await sugestao.waitFor();
  assert.equal((await sugestao.locator('.pergunta-sugestao').innerText()).trim(), 'É Renata Álvares, dos redatores?');
  await semRolagemDeLado(p, 'celular');
  await sugestao.scrollIntoViewIfNeeded();
  await capturar(p, '03-sugestao-no-celular-escuro');
  await sugestao.getByRole('button', { name: 'É', exact: true }).click();
  await linha(p, 'Renata Álvares').locator('.email-cad', { hasText: 'renata.alvares@exemplo.com' }).waitFor();
  assert.equal(emailNoTeable('tblRed', 'recR4'), 'renata.alvares@exemplo.com');
  assert.deepEqual(erros, [], 'celular: erros na página');
  await ctx.close();
  console.log('ok: no celular, a sugestão cabe na tela e o "É" grava');
}

/* ---------- as áreas de trabalho (#101) ---------- */

/** Os roteiros guardados no PROMeiro (quem sobe é a arte): o redator e o editor vêm no roteiro, pelo nome. */
const iso = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ROTEIROS = [
  { id: 'areas-chef', meta: { claquete: 'CHEF_FUTURO SP', programa: 'Chef do Futuro', praca: 'SP', dataExibicao: iso(1), redator: 'Caio Brandão', editor: 'Bruno Regis' } },
  { id: 'areas-fest', meta: { claquete: 'FESTIVAL_VER REDE', programa: 'Festival de Verão', praca: 'G5', dataExibicao: iso(3), redator: 'Marina Teles', editor: 'Caio Brandão' } },
  { id: 'areas-nov', meta: { claquete: 'NOVELA7_CAP SP', programa: 'Sete Mares', praca: 'SP', dataExibicao: iso(3), redator: 'Caio Brandao', editor: 'Bruno Regis' } },
];
async function semearRoteiros(api) {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LOC: HOJE' }] }] };
  for (const r of ROTEIROS) {
    const meta = { titulo: '', tipoPrograma: 'outro', capitulo: null, edicao: '', locutor: '', selo: '', duracaoAlvoSeg: null, ...r.meta };
    const resp = await fetch(`${api}/roteiros/${r.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'cf-access-authenticated-user-email': OUTRA }, body: JSON.stringify({ roteiro: { meta, doc }, nArtes: 2 }) });
    assert.equal(resp.status, 200, `semear ${r.id}`);
  }
}

async function entrar(navegador, url, hash, email, opcoes = {}) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': email }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(email), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  const p = await ctx.newPage();
  const erros = [];
  const aoTrello = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  p.on('request', (r) => /trello/i.test(r.url()) && aoTrello.push(r.url()));
  await p.goto(`${url}${hash}`);
  await p.waitForSelector('.barra-topo .bib-marca');
  return { ctx, p, erros, aoTrello };
}
const hashDe = (p) => new URL(p.url()).hash;
const nomeDaArea = async (p) => (await p.locator('.seletor-area-nome').innerText()).trim();
const claquetes = (p) => p.locator('.meus-roteiros .ficha-claquete b').allInnerTexts();
async function escolherArea(p, nome) {
  await p.locator('.seletor-area').click();
  await p.locator('.areas-menu .area-item', { hasText: nome }).click();
  await p.locator('.areas-menu').waitFor({ state: 'detached' });
}

async function trocarDeArea(navegador, url) {
  const { ctx, p, erros, aoTrello } = await entrar(navegador, url, '', CAIO, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  // a primeira entrada, na raiz: a Designer, que é a fila de hoje
  await p.locator('.seletor-area').waitFor();
  assert.equal(await nomeDaArea(p), 'designer');
  assert.ok(await p.locator('.topo-pauta').isVisible(), 'a Pauta da edição continua no topo');
  // a lista das áreas: as três, cada uma com o que mostra e o endereço
  await p.locator('.seletor-area').click();
  const itens = p.locator('.areas-menu .area-item');
  assert.equal(await itens.count(), 3, 'o Caio é redator e editor: as três áreas');
  assert.deepEqual((await itens.locator('b').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), ['Designer /designer', 'Redator /redator', 'Editor /editor']);
  assert.match(await itens.nth(1).locator('small').innerText(), /roteiros que você escreve/);
  assert.equal(await itens.nth(0).getAttribute('aria-checked'), 'true');
  await capturar(p, '04-seletor-de-area-aberto-claro');
  await p.locator('.areas-menu .area-item', { hasText: 'Redator' }).click();
  await p.locator('.meus-roteiros').waitFor();
  assert.equal(hashDe(p), '#/redator');
  assert.equal(await nomeDaArea(p), 'redator');
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  // os roteiros em que o Caio é o redator (o nome sem acento também é ele), por dia
  assert.deepEqual(await claquetes(p), ['CHEF_FUTURO SP', 'NOVELA7_CAP SP']);
  assert.deepEqual((await p.locator('.meus-roteiros .dia-topo h3').allInnerTexts()).map((t) => t.split('\n')[0].trim()).slice(0, 1), ['Amanhã']);
  assert.match(await p.locator('.meus-roteiros .fila-conta').innerText(), /como redator: Caio Brandão/);
  await capturar(p, '05-meus-roteiros-do-redator-claro');
  await escolherArea(p, 'Editor');
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.equal(hashDe(p), '#/editor');
  assert.deepEqual(await claquetes(p), ['FESTIVAL_VER REDE']);
  // de volta à Designer, pelo seletor: o endereço dela e a fila
  await escolherArea(p, 'Designer');
  assert.equal(hashDe(p), '#/designer');
  await p.locator('.biblioteca.fila').waitFor();
  await escolherArea(p, 'Editor');
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  console.log('ok: "PROMeiro / designer ▾" troca para o Redator e o Editor, cada um com o endereço e os roteiros dele');

  // recarregar na raiz: o PROMeiro abre na última área usada (guardada no servidor)
  await p.goto(url);
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.equal(hashDe(p), '#/editor');
  assert.equal(await nomeDaArea(p), 'editor');
  // em outro navegador (outro aparelho), também
  const outro = await entrar(navegador, url, '', CAIO, { viewport: { width: 1280, height: 800 } });
  await outro.p.locator('.meus-roteiros').waitFor();
  assert.equal(hashDe(outro.p), '#/editor');
  await outro.ctx.close();
  console.log('ok: a raiz abre na última área usada, depois de recarregar e em outro navegador');
  await semRolagemDeLado(p, 'áreas no computador');
  assert.deepEqual(erros, [], 'áreas: erros na página');
  assert.deepEqual(aoTrello, [], 'nada é lido do Trello');
  await ctx.close();
}

/* ---------- o ciclo do roteiro (#102) ---------- */

/** O envio ao Trello e a Produção do card, como o envio e a releitura da produção da arte deixam no SQLite. */
const enviar = (db, id, card, em) => db.prepare("INSERT OR REPLACE INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'enviado', ?, ?)").run(id, card, em);
const producao = (db, id, card, { etapa, designers = [], entregaEm = null }) =>
  db
    .prepare(
      `INSERT INTO producoes (id, claquete, etapa, designers, card_id, entrada_em, entrega_em, arquivada, criada_em, atualizada_em) VALUES (?, 'X', ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT (id) DO UPDATE SET etapa = excluded.etapa, designers = excluded.designers, entrega_em = excluded.entrega_em`,
    )
    .run(id, etapa, JSON.stringify(designers), card, new Date().toISOString(), entregaEm, new Date().toISOString(), new Date().toISOString());
const fichaDe = (p, claquete) => p.locator('.meus-roteiros .ficha', { has: p.locator('.ficha-claquete b', { hasText: claquete }) });
const estadoDe = async (p, claquete) => (await fichaDe(p, claquete).locator('.estado-nome').innerText()).trim();

async function cicloNaLista(navegador, url, db) {
  // o Chef foi para o Trello e a Tânia pegou; a Novela ainda está na revisão
  enviar(db, 'areas-chef', 'cardareaschef', new Date().toISOString());
  producao(db, 'prod-areas-chef', 'cardareaschef', { etapa: 'produzindo', designers: ['Tânia Arruda'] });
  const { ctx, p, erros, aoTrello } = await entrar(navegador, url, '#/redator', CAIO, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.equal(await estadoDe(p, 'CHEF_FUTURO SP'), 'Produzindo');
  assert.equal(await estadoDe(p, 'NOVELA7_CAP SP'), 'Em revisão');
  const passosDoChef = (await fichaDe(p, 'CHEF_FUTURO SP').locator('.passos-ciclo').innerText()).trim();
  assert.match(passosDoChef, /^chegou \d+\/\d+, \d+h\d\d · no Trello \d+\/\d+, \d+h\d\d$/);
  assert.equal((await fichaDe(p, 'CHEF_FUTURO SP').locator('.com-quem').innerText()).trim(), 'com Tânia Arruda', 'quem da arte está com o roteiro');
  assert.match((await fichaDe(p, 'NOVELA7_CAP SP').locator('.passos-ciclo').innerText()).trim(), /^chegou \d+\/\d+, \d+h\d\d$/);
  assert.equal(await fichaDe(p, 'NOVELA7_CAP SP').locator('.com-quem').count(), 0, 'na revisão, ninguém da arte');
  await capturar(p, '08-ciclo-na-lista-claro');
  console.log('ok: cada roteiro mostra o estado do ciclo, os passos com data e quem da arte está com ele');

  // a Produção foi entregue: a lista se lê de novo sozinha (aqui, ao ganhar o foco, como na agenda)
  producao(db, 'prod-areas-chef', 'cardareaschef', { etapa: 'entregue', designers: ['Tânia Arruda'], entregaEm: new Date().toISOString() });
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await fichaDe(p, 'CHEF_FUTURO SP').locator('.estado-nome', { hasText: 'Entregue' }).waitFor();
  assert.match((await fichaDe(p, 'CHEF_FUTURO SP').locator('.passos-ciclo').innerText()).trim(), / · entregue \d+\/\d+, \d+h\d\d$/);
  console.log('ok: a lista se atualiza sozinha quando o estado muda (Produzindo → Entregue)');
  await semRolagemDeLado(p, 'ciclo no computador');
  assert.deepEqual(erros, [], 'ciclo: erros na página');
  assert.deepEqual(aoTrello, [], 'o ciclo não lê o Trello');
  await ctx.close();

  // no celular (escuro), o ciclo cabe na ficha
  const cel = await entrar(navegador, url, '#/redator', CAIO, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await fichaDe(cel.p, 'CHEF_FUTURO SP').locator('.estado-nome', { hasText: 'Entregue' }).waitFor();
  await semRolagemDeLado(cel.p, 'ciclo no celular');
  await capturar(cel.p, '09-ciclo-no-celular-escuro');
  assert.deepEqual(cel.erros, [], 'ciclo no celular: erros na página');
  await cel.ctx.close();
  console.log('ok: no celular, o ciclo cabe na ficha');
}

/* ---------- as três exibições (#103) ---------- */

const exibicaoAtual = async (p) => (await p.locator('.exibir button[aria-pressed="true"]').getAttribute('data-exibir'));
async function exibir(p, id) {
  await p.locator(`.exibir button[data-exibir="${id}"]`).click();
  await p.locator(`.meus-roteiros.exibe-${id}`).waitFor();
}
const coluna = (p, nome) => p.locator('.coluna-meus', { has: p.locator('h4', { hasText: nome }) });
const cartoesDa = async (p, nome) => (await coluna(p, nome).locator('.cartao-meu b').allInnerTexts()).map((t) => t.trim());
const exibicoesGuardadas = async (url) => {
  const d = await (await fetch(`${url.replace(/\/$/, '')}/api/eu`, { headers: { 'cf-access-authenticated-user-email': CAIO } })).json();
  return { redator: d.preferencias['exibicao.redator'], editor: d.preferencias['exibicao.editor'] };
};

async function tresExibicoes(navegador, url) {
  // o Caio, redator: o Chef já foi entregue (o ciclo acima) e a Novela está na revisão
  const { ctx, p, erros, aoTrello } = await entrar(navegador, url, '#/redator', CAIO, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.equal(await exibicaoAtual(p), 'dia', 'sem escolha, a lista é por dia');
  assert.deepEqual((await p.locator('.exibir button').allInnerTexts()).map((t) => t.trim()), ['por dia', 'quadro', 'por estado']);

  // quadro: uma coluna por estado do ciclo; os passos de antes, "em breve", numa coluna apagada
  await exibir(p, 'quadro');
  assert.deepEqual((await p.locator('.coluna-meus h4').allInnerTexts()).map((t) => t.split('\n')[0].trim().toLowerCase()), ['antes', 'em revisão', 'produzindo', 'entregue', 'exibido']);
  assert.deepEqual(await cartoesDa(p, 'Em revisão'), ['NOVELA7_CAP SP']);
  assert.deepEqual(await cartoesDa(p, 'Entregue'), ['CHEF_FUTURO SP']);
  assert.deepEqual(await cartoesDa(p, 'Produzindo'), []);
  assert.match(await coluna(p, 'Entregue').locator('.cartao-meu').innerText(), /2 artes · edição: Bruno Regis/);
  assert.match(await coluna(p, 'Entregue').locator('.com-quem').innerText(), /com Tânia Arruda/);
  assert.match(await coluna(p, 'Antes').innerText(), /Escrevendo[\s\S]*Em aprovação[\s\S]*Aprovado[\s\S]*em breve/);
  await p.locator('.exibir-lembrado').waitFor();
  assert.equal((await exibicoesGuardadas(url)).redator, 'quadro', 'o servidor guardou o quadro do Redator');
  await semRolagemDeLado(p, 'quadro no computador');
  await capturar(p, '10-exibir-em-quadro-claro');
  console.log('ok: o quadro tem uma coluna por estado do ciclo, e a escolha fica guardada');

  // por estado: a faixa com quantos em cada estado e a lista agrupada; um toque num estado mostra só ele
  await exibir(p, 'estado');
  const faixa = async () => Object.fromEntries(await p.locator('button.seg-ciclo').evaluateAll((bs) => bs.map((b) => [b.dataset.estado, b.querySelector('b').textContent])));
  assert.deepEqual(await faixa(), { revisao: '1', produzindo: '0', entregue: '1', exibido: '0' });
  assert.deepEqual(await p.locator('.grupo-estado').evaluateAll((g) => g.map((x) => x.dataset.estado)), ['revisao', 'entregue']);
  assert.deepEqual((await p.locator('.grupo-estado[data-estado="entregue"] .linha-meu b').allInnerTexts()).map((t) => t.trim()), ['CHEF_FUTURO SP']);
  assert.match(await p.locator('.grupo-estado[data-estado="revisao"] .linha-meu-dia').innerText(), /^\w{3}, \d+\/\d+$/);
  await p.locator('button.seg-ciclo[data-estado="entregue"]').click();
  assert.deepEqual(await p.locator('.grupo-estado').evaluateAll((g) => g.map((x) => x.dataset.estado)), ['entregue']);
  await capturar(p, '11-exibir-por-estado-claro');
  await p.locator('button.seg-ciclo[data-estado="entregue"]').click();
  assert.equal(await p.locator('.grupo-estado').count(), 2, 'o segundo toque mostra todos de novo');
  console.log('ok: por estado, a faixa conta cada estado, a lista vem agrupada e um toque mostra só um estado');

  // a exibição é por área: o Editor do Caio continua por dia; ele escolhe por estado lá, e o quadro no Redator
  await escolherArea(p, 'Editor');
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.equal(await exibicaoAtual(p), 'dia', 'o Editor tem a sua exibição');
  await exibir(p, 'estado');
  await p.locator('.exibir-lembrado').waitFor();
  await escolherArea(p, 'Redator');
  await p.locator('.meus-roteiros.exibe-estado').waitFor();
  await exibir(p, 'quadro');
  await p.locator('.exibir-lembrado').waitFor();
  assert.deepEqual(await exibicoesGuardadas(url), { redator: 'quadro', editor: 'estado' });

  // recarregada, cada área volta na sua exibição; em outro navegador (outro aparelho), também
  await p.reload();
  await p.locator('.meus-roteiros.exibe-quadro .cartao-meu').first().waitFor();
  assert.equal(await exibicaoAtual(p), 'quadro');
  await escolherArea(p, 'Editor');
  await p.locator('.meus-roteiros.exibe-estado .linha-meu').first().waitFor();
  assert.equal(await exibicaoAtual(p), 'estado');
  const outro = await entrar(navegador, url, '#/redator', CAIO, { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await outro.p.locator('.meus-roteiros.exibe-quadro .cartao-meu').first().waitFor();
  await outro.ctx.close();
  console.log('ok: a exibição fica lembrada por pessoa e por área, depois de recarregar e em outro navegador');
  assert.deepEqual(erros, [], 'exibições: erros na página');
  assert.deepEqual(aoTrello, [], 'as exibições não leem o Trello');
  await ctx.close();

  // no tablet, o quadro rola para o lado dentro dele, e a página não
  const tab = await entrar(navegador, url, '#/redator', CAIO, { ...devices['iPad Mini'], colorScheme: 'dark' });
  await tab.p.locator('.meus-roteiros.exibe-quadro .cartao-meu').first().waitFor();
  await semRolagemDeLado(tab.p, 'quadro no tablet');
  assert.deepEqual(tab.erros, [], 'tablet: erros na página');
  await tab.ctx.close();

  // no celular (escuro): o quadro vira colunas empilhadas; por estado cabe na tela, e a escolha volta depois de recarregar
  const cel = await entrar(navegador, url, '#/redator', CAIO, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await cel.p.locator('.meus-roteiros.exibe-quadro .cartao-meu').first().waitFor();
  await semRolagemDeLado(cel.p, 'quadro no celular');
  const [revisao, entregue] = await Promise.all(['Em revisão', 'Entregue'].map((n) => coluna(cel.p, n).boundingBox()));
  assert.ok(entregue.y > revisao.y + revisao.height - 1, 'no celular, as colunas do quadro ficam umas embaixo das outras');
  assert.deepEqual((await cel.p.locator('.exibir button').allInnerTexts()).map((t) => t.trim()), ['', 'quadro', ''], 'no celular, só o nome da escolhida');
  await exibir(cel.p, 'estado');
  await cel.p.locator('.exibir-lembrado').waitFor();
  await semRolagemDeLado(cel.p, 'por estado no celular');
  await capturar(cel.p, '12-exibir-por-estado-no-celular-escuro');
  await cel.p.reload();
  await cel.p.locator('.meus-roteiros.exibe-estado .linha-meu').first().waitFor();
  assert.equal(await exibicaoAtual(cel.p), 'estado');
  await exibir(cel.p, 'dia');
  await cel.p.locator('.exibir-lembrado').waitFor();
  await semRolagemDeLado(cel.p, 'por dia no celular');
  assert.deepEqual(cel.erros, [], 'exibições no celular: erros na página');
  await cel.ctx.close();
  console.log('ok: no tablet e no celular, as três exibições cabem na tela e a escolha fica lembrada');
}

/* ---------- o roteiro aberto (#104) ---------- */

/** Um parágrafo com uma arte marcada na revisão. */
const comArte = (texto, subtipo, id) => ({ type: 'paragraph', content: [{ type: 'text', text: texto, marks: [{ type: 'arte', attrs: { id, subtipo, obs: '' } }] }] });
const artesAbertas = (p) => p.locator('.arte-aberta').evaluateAll((as) => as.map((a) => [a.querySelector('.t').textContent.trim(), a.dataset.estado, a.querySelector('.origem').textContent.trim()]));

async function roteiroAberto(navegador, url, db) {
  const { ctx, p, erros, aoTrello } = await entrar(navegador, url, '#/redator', CAIO, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  // a lista do Redator está por dia (a última escolha das exibições, acima): um toque na ficha abre o roteiro
  await fichaDe(p, 'CHEF_FUTURO SP').click();
  await p.locator('.roteiro-aberto .folha-aberta .texto').waitFor();
  assert.equal(hashDe(p), '#/redator/r/areas-chef', 'o roteiro aberto tem endereço próprio');
  assert.equal((await p.locator('.aberto-claquete').innerText()).trim(), 'CHEF_FUTURO SP');
  assert.equal((await p.locator('.folha-aberta .texto').innerText()).trim(), 'LOC: HOJE');
  assert.equal(await p.locator('.folha-aberta .texto').getAttribute('contenteditable'), 'false', 'o texto é só para leitura');
  await p.locator('.folha-aberta .texto').click();
  await p.keyboard.type('XYZ');
  assert.equal((await p.locator('.folha-aberta .texto').innerText()).trim(), 'LOC: HOJE', 'digitar não muda o texto');
  // o ciclo em pé: o estado, os passos com a data e os de antes apagados
  assert.equal((await p.locator('.ciclo-em-pe li[aria-current="step"] .nome').innerText()).trim(), 'Entregue');
  assert.match(await p.locator('.ciclo-em-pe li[data-passo="revisao"] .quando').innerText(), /^chegou \d+\/\d+, \d+h\d\d$/);
  assert.match(await p.locator('.ciclo-em-pe li[data-passo="produzindo"] .quando').innerText(), /^no Trello \d+\/\d+, \d+h\d\d · com Tânia Arruda$/);
  assert.match(await p.locator('.ciclo-em-pe li[data-passo="entregue"] .quando').innerText(), /^entregue \d+\/\d+, \d+h\d\d$/);
  assert.equal(await p.locator('.ciclo-em-pe li.em-breve').count(), 3, 'os passos de antes do PROMeiro, em breve');
  assert.equal(await p.locator('.arte-aberta').count(), 0, 'no Redator, as artes não aparecem uma a uma');
  assert.equal((await p.locator('.aberto-posicao').innerText()).trim(), '1 de 2');
  assert.ok(await p.locator('button[aria-label="Roteiro anterior"]').isDisabled(), 'o primeiro não tem anterior');
  await capturar(p, '13-roteiro-aberto-redator-claro');
  // o próximo e o anterior, sem voltar à lista
  await p.locator('button[aria-label="Próximo roteiro"]').click();
  await p.locator('.aberto-claquete', { hasText: 'NOVELA7_CAP SP' }).waitFor();
  assert.equal(hashDe(p), '#/redator/r/areas-nov');
  assert.equal((await p.locator('.ciclo-em-pe li[aria-current="step"] .nome').innerText()).trim(), 'Em revisão');
  assert.equal(await p.locator('.meus-roteiros, .lista-meus').count(), 0, 'não passou pela lista');
  await p.locator('button[aria-label="Roteiro anterior"]').click();
  await p.locator('.aberto-claquete', { hasText: 'CHEF_FUTURO SP' }).waitFor();
  assert.equal(hashDe(p), '#/redator/r/areas-chef');
  // o endereço recarregado abre o mesmo roteiro; "Roteiros" volta à lista
  await p.reload();
  await p.locator('.aberto-claquete', { hasText: 'CHEF_FUTURO SP' }).waitFor();
  await p.locator('.ciclo-em-pe').waitFor();
  await p.locator('.aberto-voltar').click();
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.equal(hashDe(p), '#/redator');
  console.log('ok: o roteiro aberto tem endereço, o texto só para leitura, o ciclo com as datas, e vai ao anterior e ao próximo');

  // no Editor: um roteiro com artes, enviado e com a Produção em Produzindo; o designer pôs uma arte direto na produção
  const doc = { type: 'doc', content: [comArte('NESTA QUARTA', 'rodape', 'a1'), comArte('12 COZINHEIROS', 'cartao', 'a2'), comArte('CHEF DO FUTURO', 'lettering', 'a3')] };
  const meta = { titulo: '', tipoPrograma: 'outro', capitulo: null, edicao: '', locutor: '', selo: '', duracaoAlvoSeg: null, claquete: 'CHEF_FUTURO 2 SP', programa: 'Chef do Futuro', praca: 'SP', dataExibicao: iso(2), redator: 'Beatriz Lins', editor: 'Caio Brandão', jaExiste: ['CHEF DO FUTURO'] };
  const resp = await fetch(`${url.replace(/\/$/, '')}/api/roteiros/areas-artes`, { method: 'PUT', headers: { 'content-type': 'application/json', 'cf-access-authenticated-user-email': OUTRA }, body: JSON.stringify({ roteiro: { meta, doc }, nArtes: 2 }) });
  assert.equal(resp.status, 200);
  enviar(db, 'areas-artes', 'cardareasartes', new Date().toISOString());
  producao(db, 'prod-areas-artes', 'cardareasartes', { etapa: 'produzindo', designers: ['Tânia Arruda'] });
  db.prepare("UPDATE producoes SET artes = ?, artes_marcadas = ? WHERE id = 'prod-areas-artes'").run(JSON.stringify(['NESTA QUARTA', '12 COZINHEIROS', 'SELO AO VIVO']), JSON.stringify(['NESTA QUARTA']));
  await escolherArea(p, 'Editor');
  await p.locator('.meus-roteiros .linha-meu', { hasText: 'CHEF_FUTURO 2 SP' }).click();
  await p.locator('.arte-aberta').first().waitFor();
  assert.equal(hashDe(p), '#/editor/r/areas-artes');
  assert.deepEqual(await artesAbertas(p), [
    ['NESTA QUARTA', 'entregue', 'do roteiro'],
    ['12 COZINHEIROS', 'produzindo', 'do roteiro'],
    ['CHEF DO FUTURO', 'ja-existe', 'do roteiro'],
    ['SELO AO VIVO', 'produzindo', 'do designer'],
  ]);
  assert.deepEqual(await p.locator('.estado-da-arte').allInnerTexts(), ['entregue', 'produzindo', 'já existe', 'produzindo']);
  assert.equal((await p.locator('.artes-entregues').innerText()).trim(), '1 de 3 entregues', 'o topo mostra quantas já foram entregues');
  await semRolagemDeLado(p, 'roteiro aberto no computador');
  await capturar(p, '14-roteiro-aberto-editor-claro');
  // o próximo do Editor é o Festival, sem artes marcadas
  await p.locator('button[aria-label="Próximo roteiro"]').click();
  await p.locator('.aberto-claquete', { hasText: 'FESTIVAL_VER REDE' }).waitFor();
  assert.equal(hashDe(p), '#/editor/r/areas-fest');
  assert.equal((await p.locator('.artes-entregues').innerText()).trim(), 'nenhuma a produzir');
  console.log('ok: no Editor, as artes do roteiro com o estado, a origem e quantas já foram entregues');
  assert.deepEqual(erros, [], 'roteiro aberto: erros na página');
  assert.deepEqual(aoTrello, [], 'o roteiro aberto não lê o Trello');
  await ctx.close();

  // no celular (escuro): o lado sobe para antes do texto, e nada rola para o lado
  const cel = await entrar(navegador, url, '#/editor/r/areas-artes', CAIO, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await cel.p.locator('.arte-aberta').first().waitFor();
  await cel.p.locator('.folha-aberta .texto').waitFor();
  const [lado, folha] = await Promise.all([cel.p.locator('.aberto-lado').boundingBox(), cel.p.locator('.folha-aberta').boundingBox()]);
  assert.ok(lado.y < folha.y, 'no celular, o ciclo e as artes vêm antes do texto');
  await semRolagemDeLado(cel.p, 'roteiro aberto no celular');
  await capturar(cel.p, '15-roteiro-aberto-no-celular-escuro');
  assert.deepEqual(cel.erros, [], 'roteiro aberto no celular: erros na página');
  await cel.ctx.close();
  console.log('ok: no celular, o roteiro aberto cabe na tela');
}

async function umaAreaSo(navegador, url) {
  const { ctx, p, erros } = await entrar(navegador, url, '', OUTRA, { viewport: { width: 1440, height: 900 } });
  await p.locator('.biblioteca.fila').waitFor();
  await p.waitForTimeout(300);
  assert.equal(await p.locator('.seletor-area').count(), 0, 'sem cadastro, uma área só: sem o seletor');
  assert.equal(hashDe(p), '');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: quem tem uma área só (a Designer) não vê o seletor');
}

/* ---------- o administrador, o menu do perfil e "De todo mundo" (#105) ---------- */

const itensDoMenuDeQuem = async (p) => (await p.locator('.de-quem-menu .menu-item').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
async function escolherDeQuem(p, nome) {
  await p.locator('.de-quem').click();
  await p.locator('.de-quem-menu .menu-item', { hasText: nome }).click();
  await p.locator('.de-quem-menu').waitFor({ state: 'detached' });
  await p.locator('.meus-roteiros[aria-busy="false"]').waitFor();
}

async function administradora(navegador, url) {
  // a administradora sem cadastro: as três áreas, e no Redator os roteiros de todos
  const { ctx, p, erros, aoTrello } = await entrar(navegador, url, '#/redator', LIA, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.equal((await p.locator('.meus-roteiros h2').innerText()).trim(), 'Roteiros');
  assert.match(await p.locator('.meus-roteiros .fila-conta').innerText(), /de todos os redatores/);
  assert.equal(await p.locator('.aviso-meus').count(), 0, 'sem o aviso do e-mail não ligado');
  const todos = await claquetes(p);
  for (const c of ['CHEF_FUTURO SP', 'FESTIVAL_VER REDE', 'NOVELA7_CAP SP']) assert.ok(todos.includes(c), `de todos: ${c} em ${todos.join(', ')}`);
  // de todos, cada roteiro diz também quem é o redator
  assert.match(await fichaDe(p, 'FESTIVAL_VER REDE').locator('.ficha-de').innerText(), /^redator: Marina Teles · edição: Caio Brandão$/);
  // o filtro "de quem": de todos, com quantos, e cada redator (o nome do cadastro, também para "Caio Brandao")
  assert.match(await p.locator('.de-quem').innerText(), /de\s+todos/);
  await p.locator('.de-quem').click();
  const itens = await itensDoMenuDeQuem(p);
  // a escolhida leva o ✓ no lugar da conta; a soma dos redatores é a de todos
  assert.equal(itens[0], 'De todos');
  assert.equal(await p.locator('.de-quem-menu .menu-item').first().getAttribute('aria-checked'), 'true');
  assert.equal(itens.slice(1).reduce((n, t) => n + Number(t.split(' ').pop()), 0), todos.length);
  assert.ok(itens.includes('Marina Teles 1'), `de quem: ${itens.join(' | ')}`);
  assert.ok(itens.some((t) => /^Caio Brandão \d+$/.test(t)) && !itens.some((t) => t.startsWith('Caio Brandao')), `o Caio uma vez só: ${itens.join(' | ')}`);
  await semRolagemDeLado(p, 'filtro de quem aberto');
  await capturar(p, '16-de-quem-aberto-claro');
  await p.keyboard.press('Escape');
  await escolherDeQuem(p, 'Marina Teles');
  assert.deepEqual(await claquetes(p), ['FESTIVAL_VER REDE']);
  assert.match(await p.locator('.meus-roteiros .fila-conta').innerText(), /redator: Marina Teles/);
  assert.match(await p.locator('.de-quem').innerText(), /de\s+Marina Teles/);
  // na lista de uma pessoa, a ficha volta a mostrar só a edição
  assert.equal((await fichaDe(p, 'FESTIVAL_VER REDE').locator('.ficha-de').innerText()).trim(), 'edição: Caio Brandão');
  // o roteiro aberto navega na lista filtrada
  await fichaDe(p, 'FESTIVAL_VER REDE').click();
  await p.locator('.aberto-claquete', { hasText: 'FESTIVAL_VER REDE' }).waitFor();
  assert.equal(await p.locator('button[aria-label="Próximo roteiro"]').isDisabled(), true, 'só um roteiro da Marina');
  await p.locator('.aberto-voltar').click();
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.match(await p.locator('.de-quem').innerText(), /de\s+Marina Teles/, 'o filtro continua ao voltar');
  await escolherDeQuem(p, 'De todos');
  assert.deepEqual((await claquetes(p)).length, todos.length);
  // no Editor também, pelo campo do editor
  await escolherArea(p, 'Editor');
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.match(await p.locator('.meus-roteiros .fila-conta').innerText(), /de todos os editores/);
  await escolherDeQuem(p, 'Bruno Regis');
  for (const c of await claquetes(p)) assert.ok(c !== 'FESTIVAL_VER REDE', 'o Festival é do Caio, não do Bruno');
  console.log('ok: a administradora vê os roteiros de todos no Redator e no Editor, com o filtro "de quem"');

  // os caminhos do topo, em todas as áreas: levam à Pauta da edição; o "De todo mundo" saiu (#156)
  const grupo = p.locator('.barra-topo nav.caminhos-do-topo');
  assert.equal((await grupo.getAttribute('aria-label')), 'Caminhos');
  assert.ok(await grupo.locator('.topo-pauta').isVisible(), 'a Pauta nos caminhos, no Editor');
  assert.equal(await p.locator('.barra-topo', { hasText: /de todo mundo/i }).count(), 0, 'sem o "De todo mundo"');
  await escolherArea(p, 'Designer');
  await p.locator('.biblioteca.fila').waitFor();
  assert.ok(await p.locator('.barra-topo nav.caminhos-do-topo .topo-pauta').isVisible(), 'a Pauta nos caminhos, na Designer');
  await capturar(p, '17-caminhos-do-topo-claro');

  // o menu do perfil: as áreas, administrador e, fora das áreas, Cadastros e Configuração
  await p.locator('.perfil-botao').click();
  assert.deepEqual(await p.locator('.perfil-areas span').allInnerTexts(), ['Designer', 'Redator', 'Editor', 'administrador']);
  const fora = p.locator('.perfil-painel .perfil-fora');
  assert.equal((await fora.locator('.rotulo').innerText()).trim().toLowerCase(), 'fora das áreas');
  const links = (await fora.locator('.perfil-link').allInnerTexts()).map((t) => t.split('\n')[0].trim().split(/\s{2,}/)[0]);
  assert.ok(links[0].startsWith('Cadastros') && links[1].startsWith('Configuração'), `fora das áreas: ${links.join(' | ')}`);
  // nenhum dos dois na navegação
  assert.equal(await p.locator('.barra-topo > a', { hasText: /Cadastros|Configuração/ }).count(), 0);
  await capturar(p, '18-menu-do-perfil-claro');
  await fora.locator('.perfil-link', { hasText: 'Cadastros' }).click();
  await p.locator('.pagina.cadastros').waitFor();
  assert.match(hashDe(p), /^#\/cadastros/);
  await p.goto(`${url}#/redator`);
  await p.locator('.barra-topo nav.caminhos-do-topo .topo-pauta').click();
  await p.locator('.pagina.pauta').waitFor();
  assert.equal(hashDe(p), '#/pauta');
  assert.deepEqual(erros, [], 'administradora: erros na página');
  assert.deepEqual(aoTrello, [], 'nada é lido do Trello');
  await ctx.close();
  console.log('ok: Cadastros e Configuração no menu do perfil, fora das áreas; os caminhos do topo levam à Pauta');
}

async function soOsSeus(navegador, url) {
  // quem não é administrador vê só os seus, sem o filtro; no perfil, Cadastros fora das áreas, sem a Configuração
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', CAIO, { viewport: { width: 1440, height: 900 } });
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.equal((await p.locator('.meus-roteiros h2').innerText()).trim(), 'Meus roteiros');
  assert.equal(await p.locator('.de-quem').count(), 0, 'sem o filtro "de quem"');
  assert.ok(await p.locator('.barra-topo nav.caminhos-do-topo .topo-pauta').isVisible());
  await p.locator('.perfil-botao').click();
  assert.deepEqual(await p.locator('.perfil-areas span').allInnerTexts(), ['Designer', 'Redator', 'Editor']);
  assert.equal(await p.locator('.perfil-painel .perfil-link', { hasText: 'Configuração' }).count(), 0);
  // a rota recusa "de todos" para quem não é administrador
  const r = await p.evaluate(async () => (await fetch('/api/meus-roteiros?area=redator&de=todos')).status);
  assert.equal(r, 403);
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: quem não é administrador vê só os seus roteiros, sem o filtro, e a rota recusa "de todos"');
}

async function administradoraNoCelular(navegador, url) {
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', LIA, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  await p.locator('.de-quem').click();
  await p.locator('.de-quem-menu').waitFor();
  await semRolagemDeLado(p, 'filtro de quem no celular');
  await capturar(p, '19-de-quem-no-celular-escuro');
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('.barra-topo .topo-pauta .caminho-nome').isVisible(), false, 'no celular, só o ícone da Pauta');
  await p.locator('.perfil-botao').click();
  await p.locator('.perfil-fora').waitFor();
  await semRolagemDeLado(p, 'perfil no celular');
  await capturar(p, '20-perfil-no-celular-escuro');
  assert.deepEqual(erros, []);
  await ctx.close();
  console.log('ok: no celular, o filtro "de quem" e o menu do perfil cabem na tela');
}

async function areasNoCelular(navegador, url) {
  const { ctx, p, erros } = await entrar(navegador, url, '#/redator', MARIANA, { ...devices['iPhone 13'], colorScheme: 'dark' });
  await p.locator('.meus-roteiros .ficha').first().waitFor();
  assert.deepEqual(await claquetes(p), ['FESTIVAL_VER REDE'], 'a Mariana, ligada pelo "É", é a redatora Marina Teles');
  await semRolagemDeLado(p, 'áreas no celular');
  await capturar(p, '06-meus-roteiros-no-celular-escuro');
  await p.locator('.seletor-area').click();
  assert.equal(await p.locator('.areas-menu .area-item').count(), 2, 'redatora: Designer e Redator');
  await semRolagemDeLado(p, 'seletor no celular');
  await capturar(p, '07-seletor-no-celular-escuro');
  await p.locator('.areas-menu .area-item', { hasText: 'Designer' }).click();
  await p.locator('.biblioteca.fila').waitFor();
  assert.equal(hashDe(p), '#/designer');
  assert.deepEqual(erros, [], 'celular: erros na página');
  await ctx.close();
  console.log('ok: no celular, "meus roteiros" cabe na tela e o seletor troca de área');
}

/* ---------- os caminhos do topo (#156) ---------- */

/** O topo da Designer com a aba Filmes ligada e a lista das prévias de mentira (`pendente`: uma ainda não toda enviada). */
async function comFilmes(navegador, url, opcoes, estado) {
  const ctx = await navegador.newContext({ extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA }, ...(CAPTURAS ? { deviceScaleFactor: 2 } : {}), ...opcoes });
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  await ctx.route((u) => u.pathname === '/api/eu/tour', (r) => r.fulfill({ json: { ok: true } }));
  // a aba Filmes ligada (o servidor do teste não tem a leitura): o resto do /api/eu é o de verdade
  await ctx.route((u) => u.pathname === '/api/eu', async (r) => r.fulfill({ json: { ...(await (await r.fetch()).json()), filmes: true } }));
  await ctx.route((u) => u.pathname === '/api/filmes/previas', (r) =>
    r.fulfill({ json: [{ id: 'previaficticia1', nome: 'previa_ficticia.pdf', por: 'Lia', criada: new Date().toISOString(), paginas: 4, diasParaApagar: estado.pendente ? null : 30, pessoas: [] }] }),
  );
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/designer`);
  await p.locator('.barra-topo nav.caminhos-do-topo .topo-filmes').waitFor();
  return { ctx, p, erros };
}

async function caminhosDoTopo(navegador, url) {
  for (const [onde, opcoes] of [['computador', { viewport: { width: 1440, height: 900 } }], ['celular', { ...devices['iPhone 13'] }]])
    for (const tema of ['light', 'dark']) {
      const estado = { pendente: true };
      const { ctx, p, erros } = await comFilmes(navegador, url, { ...opcoes, colorScheme: tema }, estado);
      const nav = p.locator('.barra-topo nav.caminhos-do-topo');
      const nomes = await nav.locator('a').evaluateAll((as) => as.map((a) => a.querySelector('.caminho-nome').textContent));
      assert.deepEqual(nomes.slice(0, 4), ['No Trello', 'Produções', 'Filmes', 'Pauta da edição'], `${onde}: No Trello · Produções · Filmes · Pauta da edição`);
      // #168: todos os caminhos, o da fila aberto e marcado; a bolinha separadora só antes da Pauta
      const filhos = await nav.evaluate((n) => [...n.children].map((e) => (e.tagName === 'A' ? e.className : `• ${e.className}`)));
      assert.deepEqual(filhos.slice(0, 5), ['topo-agenda aberto', 'topo-producoes', 'topo-filmes', '• caminho-bolinha', 'topo-pauta'], `${onde}: a bolinha só antes da Pauta`);
      assert.equal(await nav.locator('[aria-current="page"]').getAttribute('class'), 'topo-agenda aberto', `${onde}: o caminho da fila é o atual`);
      assert.equal(await p.locator('.barra-topo', { hasText: /de todo mundo/i }).count(), 0, `${onde}: sem o "De todo mundo"`);
      assert.equal(await nav.evaluate((n) => getComputedStyle(n).borderLeftWidth), '0px', `${onde}: sem a linha vertical`);
      // nada de unha: nenhum caminho com faixa na borda esquerda
      for (const a of await nav.locator('a').all()) {
        const borda = await a.evaluate((e) => { const c = getComputedStyle(e); return [c.borderLeftWidth, c.boxShadow]; });
        assert.deepEqual(borda, ['0px', 'none'], `${onde}: sem unha`);
      }
      // só ícones; o aberto mostra o nome (no celular, nem ele)
      const largura = (sel) => nav.locator(sel).evaluate((e) => e.getBoundingClientRect().width);
      assert.equal(await nav.locator('.topo-producoes .caminho-nome').evaluate((e) => e.getBoundingClientRect().width), 0, `${onde}: fechado, sem o nome`);
      if (onde === 'computador') {
        await p.waitForTimeout(700);
        assert.ok((await largura('.topo-agenda')) > 80, `${onde}: o aberto com o nome`);
        assert.ok(await nav.locator('.topo-agenda .caminho-nome').isVisible(), 'o nome do aberto');
        assert.equal(Math.round(await largura('.topo-producoes')), 36, 'o fechado, só o ícone');
      } else {
        assert.equal(await nav.locator('.topo-agenda .caminho-nome').isVisible(), false, 'no celular, só o ícone, mesmo no aberto');
        assert.deepEqual(await nav.locator('.topo-agenda').evaluate((e) => [e.offsetWidth, e.offsetHeight]), [36, 44], 'no celular, 36 por 44');
      }
      const bolinha = nav.locator('.topo-filmes .caminho-icone .caminho-aviso');
      const cor = () => bolinha.evaluate((e) => getComputedStyle(e).backgroundColor);
      const laranja = await p.evaluate(() => {
        const e = document.createElement('i');
        e.style.color = 'var(--ultra)';
        document.body.append(e);
        const c = getComputedStyle(e).color;
        e.remove();
        return c;
      });
      // a cor troca com uma transição curta: espera ela terminar
      await bolinha.waitFor();
      assert.equal(await cor(), laranja, `${onde}, ${tema}: com filme para revisar, a bolinha laranja no ícone dos Filmes`);
      assert.equal(await nav.locator('.topo-filmes').getAttribute('aria-label'), 'Filmes, com filme para revisar');
      if (onde === 'celular') {
        assert.equal(await nav.locator('.topo-filmes .caminho-nome').isVisible(), false, 'no celular, só o ícone');
        await semRolagemDeLado(p, 'caminhos no celular');
      }
      await capturar(p, `21-caminhos-${onde}-${tema === 'light' ? 'claro' : 'escuro'}-revisar`);
      // a prévia toda enviada: na próxima pergunta (a página recarrega), a bolinha volta a ser neutra
      estado.pendente = false;
      await p.reload();
      await nav.locator('.topo-filmes').waitFor();
      await p.waitForTimeout(400);
      assert.equal(await nav.locator('.caminho-aviso').count(), 0, `${onde}, ${tema}: sem filme para revisar, sem o aviso`);
      assert.equal(await nav.locator('.topo-filmes').getAttribute('aria-label'), 'Filmes');
      // a dica com o nome: no foco (pelo teclado) e, no computador, no hover; no aberto, não (o nome já está ali)
      const dica = (sel) => nav.locator(sel).evaluate((e) => { const c = getComputedStyle(e, '::after'); return { texto: c.content, opacidade: c.opacity, mostra: c.display !== 'none' }; });
      await p.keyboard.press('Shift');
      await nav.locator('.topo-producoes').focus();
      await p.waitForTimeout(350);
      assert.deepEqual(await dica('.topo-producoes'), { texto: '"Produções"', opacidade: '1', mostra: true }, `${onde}: a dica no foco`);
      assert.equal(await nav.locator('.topo-producoes').getAttribute('aria-label'), 'Produções');
      await capturar(p, `23-caminhos-${onde}-${tema === 'light' ? 'claro' : 'escuro'}-dica`);
      await nav.locator('.topo-producoes').blur();
      if (onde === 'computador') {
        await nav.locator('.topo-pauta').hover();
        await p.waitForTimeout(650);
        assert.deepEqual(await dica('.topo-pauta'), { texto: '"Pauta da edição"', opacidade: '1', mostra: true }, 'a dica no hover');
        assert.equal((await dica('.topo-agenda')).mostra, false, 'no aberto, sem a dica');
        await p.mouse.move(0, 400);
      }
      await capturar(p, `22-caminhos-${onde}-${tema === 'light' ? 'claro' : 'escuro'}-neutra`);
      // Filmes leva à aba Filmes
      await nav.locator('.topo-filmes').click();
      await p.waitForFunction(() => location.hash === '#/filmes');
      assert.deepEqual(erros, [], `${onde}, ${tema}: erros na página`);
      await ctx.close();
    }
  // sem movimento (#168): a largura troca de uma vez, e o nome só esmaece
  const { ctx, p } = await comFilmes(navegador, url, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, { pendente: false });
  const transicao = await p.locator('.topo-agenda .caminho-nome').evaluate((e) => { const c = getComputedStyle(e); return [c.transitionProperty, c.transitionDuration]; });
  assert.deepEqual(transicao, ['opacity', '0.3s'], 'sem movimento, o nome só esmaece');
  await ctx.close();
  console.log('ok: o topo da Designer é "No Trello · Produções · Filmes · Pauta da edição", só os ícones com o atual aberto, a bolinha só antes da Pauta, o aviso no ícone dos Filmes e a dica no hover e no foco');
}

async function principal() {
  const { criarCadastros } = await import(join(RAIZ, 'servidor', 'cadastros.mjs'));
  const cadastros = criarCadastros({ ...ENV_CADASTROS, CADASTRO_ADMINS: LIA }, { buscar: buscarNoTeable });
  const s = await subir({ cadastros, env: { CADASTRO_ADMINS: LIA } });
  // quem já entrou no PROMeiro (o nome sai do e-mail); a Renata só entra no celular
  for (const email of [LIA, OUTRA, MARIANA, BRUNO]) await fetch(`${s.api}/eu`, { headers: { 'cf-access-authenticated-user-email': email } });
  // o tour da revisão já visto: o convite não cobre a fila das áreas
  for (const email of [LIA, OUTRA, MARIANA, CAIO]) await fetch(`${s.api}/eu/tour`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': email } });
  await semearRoteiros(s.api);
  const navegador = await chromium.launch();
  try {
    await simE(navegador, s.url);
    await semSerAdministrador(navegador, s.url);
    await noCelular(navegador, s.url);
    await trocarDeArea(navegador, s.url);
    await cicloNaLista(navegador, s.url, s.db);
    await tresExibicoes(navegador, s.url);
    await roteiroAberto(navegador, s.url, s.db);
    await umaAreaSo(navegador, s.url);
    await administradora(navegador, s.url);
    await soOsSeus(navegador, s.url);
    await administradoraNoCelular(navegador, s.url);
    await areasNoCelular(navegador, s.url);
    await caminhosDoTopo(navegador, s.url);
    assert.ok(pedidosAoTeable.every((x) => /^(GET|PATCH) /.test(x)), 'no Teable, só leitura e o e-mail');
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
