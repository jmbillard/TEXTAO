// Ponta a ponta do "próximo da fila" com duas pessoas ao mesmo tempo, rodado à parte do vitest: `npm run e2e:proximo`.
//
// O bug: duas pessoas revisavam; quando uma enviou o roteiro dela, o PROMeiro a levou para o próximo da fila, que era
// justamente o que a outra estava revisando. A regra (proximoParaRevisar): o próximo é o que ninguém revisou e ninguém
// está com aberto agora. Aqui: a Ana abre o roteiro 2; a Bia envia o 1 e vai para o 3, não para o 2. Depois a Bia abre
// o 2 à mão: entra normalmente (a edição simultânea) e vê o aviso discreto de que a Ana está revisando.
//
// Sobe o servidor e o Vite como os outros e2e (banco temporário, dados fictícios, o Trello e o Teable falsos). Cada
// pessoa é um contexto do navegador com o próprio e-mail (no cabeçalho e no cookie que o WebSocket leva).
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:proximo
const assert = require('node:assert/strict');
const { subir } = require('./tour.e2e.cjs');
const { trelloFalso } = require('./editor-celular.e2e.cjs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:proximo');
  process.exit(2);
}

// o nome vem do e-mail (sem o acento), como o servidor monta para quem entra pelo Access
const ANA = { email: 'ana.ficticia@exemplo.com', nome: 'Ana Ficticia' };
const BIA = { email: 'bia.ficticia@exemplo.com', nome: 'Bia Ficticia' };
const DONO = 'redacao.ficticia@exemplo.com';
const VOCAB = {
  programas: [{ nome: 'Programa Fictício', chaves: ['CHAMADA'], categoria: 'variedades' }],
  redatores: ['Redator Fictício'],
  editores: ['Bruno Teixeira'],
  pauta: [],
};
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cabecalho = (email) => ({ 'content-type': 'application/json', 'cf-access-authenticated-user-email': email });

/** Três roteiros fictícios para revisar (sem editor), um por dia: o 1 amanhã, o 2 depois, o 3 depois do 2. */
async function semear(api) {
  const hoje = new Date();
  for (const n of [1, 2, 3]) {
    const id = `proximo${n}`;
    const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n);
    const claquete = `CHAMADA_PROXIMO_${n}_${dia.getDate()}/${dia.getMonth() + 1}`;
    const meta = { claquete, titulo: `Próximo ${n}`, programa: 'Programa Fictício', tipoPrograma: 'variedades', dataExibicao: isoLocal(dia), capitulo: null, edicao: '', praca: 'RJ', redator: 'Redator Fictício', editor: '', locutor: '', selo: '', duracaoAlvoSeg: 30, duracaoModo: 'fechar', layout: 'padrao', status: 'rascunho', revisar: ['Sem editor'] };
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LOC: ' }, { type: 'text', text: `ARTE ${n}`, marks: [{ type: 'arte', attrs: { id: `a${n}`, subtipo: '', sugerido: false } }] }] }] };
    const agora = new Date().toISOString();
    const r = await fetch(`${api}/roteiros/${id}`, { method: 'PUT', headers: cabecalho(DONO), body: JSON.stringify({ roteiro: { id, meta, doc, revisao: 1, criadoEm: agora, atualizadoEm: agora, publico: true }, nArtes: 1 }) });
    if (!r.ok) throw new Error(`semear ${id}: ${r.status} ${await r.text()}`);
  }
  // as duas já viram o tour: o convite não cobre o editor
  for (const p of [ANA, BIA]) await fetch(`${api}/eu/tour`, { method: 'POST', headers: cabecalho(p.email) });
}

/** Uma pessoa num contexto próprio do navegador, já no editor do roteiro, com o texto chegado da sala. */
async function abrirComo(navegador, url, pessoa, id) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'cf-access-authenticated-user-email': pessoa.email } });
  await ctx.addCookies([{ name: 'e2e-email', value: encodeURIComponent(pessoa.email), url }]);
  await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${url}#/r/${id}`);
  await esperarTexto(p, id);
  return { ctx, p, erros };
}

/** O texto do roteiro chegou da sala e a folha está liberada (veja a nota sobre o modo estrito em editor-celular). */
async function esperarTexto(p, id) {
  const n = id.replace('proximo', '');
  const chegou = await p.waitForSelector(`.texto u.arte[data-id="a${n}"]`, { timeout: 45000 }).then(() => true, () => false);
  if (!chegou) throw new Error(`o texto de ${id} não chegou da sala`);
  await p.waitForFunction(() => !document.querySelector('[inert] ol.artes'), null, { timeout: 20000 });
}

/** Quem o servidor diz que está em cada roteiro, como a pessoa vê. */
async function noRoteiro(api, email) {
  return (await fetch(`${api}/no-roteiro`, { headers: cabecalho(email) })).json();
}

async function principal() {
  const falso = trelloFalso();
  const s = await subir({ trello: falso });
  const navegador = await chromium.launch();
  try {
    await semear(s.api);
    // a Ana abre o 2 e fica nele
    const ana = await abrirComo(navegador, s.url, ANA, 'proximo2');
    for (let t = Date.now(); !(await noRoteiro(s.api, BIA.email)).proximo2 && Date.now() - t < 10000; ) await ana.p.waitForTimeout(200);
    assert.deepEqual((await noRoteiro(s.api, BIA.email)).proximo2, [{ nome: ANA.nome, email: ANA.email }], 'o servidor conta a Ana no roteiro 2');
    // o 2 continua sem revisão: quem o tira do caminho da Bia é a presença da Ana
    const lista = await (await fetch(`${s.api}/roteiros`, { headers: cabecalho(BIA.email) })).json();
    assert.equal(lista.find((r) => r.id === 'proximo2')?.revisadoPor ?? null, null, 'o roteiro 2 ainda não foi revisado por ninguém');

    // a Bia abre o 1 e envia: vai para o 3, não para o 2
    const bia = await abrirComo(navegador, s.url, BIA, 'proximo1');
    await bia.p.locator('.acao-principal button', { hasText: 'Enviar' }).click();
    await bia.p.waitForFunction(() => /#\/r\/proximo[23]$/.test(location.hash), null, { timeout: 30000 });
    assert.equal(await bia.p.evaluate(() => location.hash), '#/r/proximo3', 'depois de enviar o 1, a Bia vai para o 3 (o 2 está com a Ana)');
    assert.ok(falso.pedidos.some((x) => x.url.pathname.replace('/1', '') === '/cards' && x.metodo === 'POST'), 'o 1 foi para o Trello falso');
    console.log('ok: a Ana no 2; a Bia envia o 1 e vai para o 3');

    // abrir à mão o roteiro da Ana continua livre, com o aviso discreto
    await bia.p.goto(`${s.url}#/r/proximo2`);
    await esperarTexto(bia.p, 'proximo2');
    await bia.p.waitForSelector('.avisos .aviso:has-text("Ana está revisando este roteiro.")', { timeout: 10000 });
    console.log('ok: a Bia abre o 2 à mão, entra e vê "Ana está revisando este roteiro."');

    assert.deepEqual(ana.erros, [], 'erros na página da Ana');
    assert.deepEqual(bia.erros, [], 'erros na página da Bia');
    await ana.ctx.close();
    await bia.ctx.close();
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
