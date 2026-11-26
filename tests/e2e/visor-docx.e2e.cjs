// Ponta a ponta das bordas das tabelas no visor do .docx (#51), rodado à parte do vitest: `npm run e2e:visor`.
//
// Sobe o servidor e o Vite como o e2e do tour (banco temporário, dados fictícios, nada sai para a rede), guarda como
// original de um roteiro o .docx fictício `tests/fixtures/Ficticio_Bordas_Tabela.docx` e abre a vista "Original" do
// editor. O .docx tem quatro tabelas de duas colunas e duas linhas, com as bordas por fora e por dentro definidas:
//   1. na tabela (w:tblBorders);
//   2. nas células (w:tcBorders);
//   3. pelo estilo da tabela (w:tblStyle → "Table Grid", o caso mais comum do Word);
//   4. pelo estilo, com a tabela dentro de uma caixa de texto do tamanho dela.
// Para cada tabela, confere que as seis linhas que o Word desenha (cima, baixo, esquerda, direita, o divisor das
// colunas e o das linhas) estão pintadas: há um traço de borda sobre cada ponto da linha, com pelo menos um pixel da
// tela de espessura depois do arredondamento que o Safari faz (a linha de 1/2 pt sumia lá), e nenhum recorte de um
// elemento de cima (overflow) o esconde.
//
// Precisa do Playwright com o Chromium. Instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:visor
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { subir } = require('./tour.e2e.cjs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Com ele instalado globalmente: NODE_PATH=$(npm root -g) npm run e2e:visor');
  process.exit(2);
}

const RAIZ = join(__dirname, '..', '..');
const LIA = 'lia.moraes@exemplo.com';
const VOCAB = { programas: [{ nome: 'Programa Fictício', chaves: ['CHAMADA'], categoria: 'variedades' }], redatores: ['Redator Fictício'], editores: ['Bruno Teixeira'], pauta: [] };
const ID = 'visorbordas1';
const ARQUIVO = 'Ficticio_Bordas_Tabela.docx';
const CASOS = ['bordas na tabela (w:tblBorders)', 'bordas nas células (w:tcBorders)', 'bordas pelo estilo (Table Grid)', 'pelo estilo, dentro de uma caixa de texto'];
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function semear(api) {
  const h = { 'content-type': 'application/json', 'cf-access-authenticated-user-email': LIA };
  const d = new Date();
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2);
  const meta = { claquete: `BORDAS ${dia.getDate()}/${dia.getMonth() + 1}`, titulo: 'Bordas', programa: 'Programa Fictício', tipoPrograma: 'variedades', dataExibicao: isoLocal(dia), capitulo: null, edicao: '', praca: 'G5', redator: 'Redator Fictício', editor: '', locutor: '', selo: '', duracaoAlvoSeg: null, duracaoModo: 'fechar', layout: 'instrucoes_texto', status: 'rascunho', revisar: ['editor'] };
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'TEXTO FICTÍCIO DA LOCUÇÃO 1' }] }] };
  const agora = new Date().toISOString();
  const r = await fetch(`${api}/roteiros/${ID}`, { method: 'PUT', headers: h, body: JSON.stringify({ roteiro: { id: ID, meta, doc, revisao: 1, criadoEm: agora, atualizadoEm: agora }, nArtes: 0 }) });
  if (!r.ok) throw new Error(`semear ${ID}: ${r.status} ${await r.text()}`);
  const o = await fetch(`${api}/roteiros/${ID}/original`, {
    method: 'PUT',
    headers: { 'cf-access-authenticated-user-email': LIA, 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x-arquivo': ARQUIVO },
    body: readFileSync(join(RAIZ, 'tests', 'fixtures', ARQUIVO)),
  });
  if (!o.ok) throw new Error(`original ${ID}: ${o.status} ${await o.text()}`);
  await fetch(`${api}/eu/tour`, { method: 'POST', headers: h });
}

/**
 * No navegador: para cada tabela do visor (de cima para baixo), as seis linhas da grade e, de cada uma, os pontos
 * (a 1/4, 1/2 e 3/4 de cada trecho) que nenhum traço de borda visível cobre. Um traço é visível na parte dele que
 * sobra depois do recorte de cada elemento de cima que não deixa o conteúdo vazar (overflow diferente de visible).
 */
function medirBordas() {
  const visivel = (el) => {
    let r = el.getBoundingClientRect();
    let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      r = a.getBoundingClientRect();
      if (s.overflowX !== 'visible') (x0 = Math.max(x0, r.left)), (x1 = Math.min(x1, r.right));
      if (s.overflowY !== 'visible') (y0 = Math.max(y0, r.top)), (y1 = Math.min(y1, r.bottom));
    }
    return { x0, y0, x1, y1 };
  };
  const FOLGA = 1.5;
  const tabelas = [...document.querySelectorAll('.visor-docx .docx-table-fragment')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  return tabelas.map((t) => {
    const celulas = [...t.querySelectorAll('.docx-table-cell')].map((c) => c.getBoundingClientRect());
    const xs = [...new Set(celulas.flatMap((c) => [Math.round(c.left * 4) / 4, Math.round(c.right * 4) / 4]))].sort((a, b) => a - b);
    const ys = [...new Set(celulas.flatMap((c) => [Math.round(c.top * 4) / 4, Math.round(c.bottom * 4) / 4]))].sort((a, b) => a - b);
    const [esq, dir, cima, baixo] = [xs[0], xs[xs.length - 1], ys[0], ys[ys.length - 1]];
    // O Safari e o Firefox encaixam a faixa nos pixels da tela arredondando o começo e o fim; a que fica com zero
    // pixel não aparece (o Chrome garante um). Só conta o traço que sobra com pelo menos um pixel da tela.
    const dpr = window.devicePixelRatio || 1;
    const pixels = (a, b) => Math.round(b * dpr) - Math.round(a * dpr);
    const inteiro = (el) => {
      const r = el.getBoundingClientRect();
      return el.dataset.edge === 'top' || el.dataset.edge === 'bottom' ? pixels(r.top, r.bottom) >= 1 : pixels(r.left, r.right) >= 1;
    };
    const tracos = [...t.querySelectorAll('.docx-table-border-edge-stroke')].filter(inteiro).map(visivel).filter((v) => v.x1 > v.x0 && v.y1 > v.y0);
    const coberto = (x, y) => tracos.some((v) => x >= v.x0 - FOLGA && x <= v.x1 + FOLGA && y >= v.y0 - FOLGA && y <= v.y1 + FOLGA);
    const pontos = (a, b) => [0.25, 0.5, 0.75].map((f) => a + (b - a) * f);
    const horizontal = (y) => xs.slice(0, -1).flatMap((x, i) => pontos(x, xs[i + 1]).map((px) => [px, y]));
    const vertical = (x) => ys.slice(0, -1).flatMap((y, i) => pontos(y, ys[i + 1]).map((py) => [x, py]));
    const linhas = {
      cima: horizontal(cima),
      baixo: horizontal(baixo),
      esquerda: vertical(esq),
      direita: vertical(dir),
      'divisor das colunas': xs.slice(1, -1).flatMap(vertical),
      'divisor das linhas': ys.slice(1, -1).flatMap(horizontal),
    };
    const faltando = Object.fromEntries(Object.entries(linhas).map(([nome, ps]) => [nome, ps.length ? ps.filter(([x, y]) => !coberto(x, y)).length / ps.length : 1]));
    return { colunas: xs.length - 1, linhas: ys.length - 1, faltando };
  });
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
    // dois zooms: a vista "Original" do editor larga e a página estreita, como num lado da comparação; e a página
    // estreita na tela Retina (2 pixels por px) e com o zoom do navegador em 90%
    for (const [largura, dpr] of [[1680, 1], [1100, 1], [1100, 2], [1280, 0.9]]) {
      const tela = `${largura}px${dpr === 1 ? '' : ` a ${dpr}x`}`;
      const ctx = await navegador.newContext({ viewport: { width: largura, height: 1050 }, deviceScaleFactor: dpr, extraHTTPHeaders: { 'cf-access-authenticated-user-email': LIA } });
      await ctx.route('**/api/vocabulario', (r) => r.fulfill({ json: VOCAB }));
      const p = await ctx.newPage();
      const erros = [];
      p.on('pageerror', (e) => erros.push(String(e)));
      await p.goto(`${amb.url}#/r/${ID}`);
      await p.waitForSelector('.vista-folha button:has-text("Original")', { timeout: 60000 });
      await p.click('.vista-folha button:has-text("Original")');
      await p.waitForFunction((n) => document.querySelectorAll('.visor-docx .docx-table-fragment').length >= n, CASOS.length, { timeout: 60000 });
      await p.waitForTimeout(800);
      const tabelas = await p.evaluate(medirBordas);
      conferir(tabelas.length === CASOS.length, `${tela}: as ${CASOS.length} tabelas no visor (achei ${tabelas.length})`);
      tabelas.slice(0, CASOS.length).forEach((t, i) => {
        const sumidas = Object.entries(t.faltando).filter(([, f]) => f > 0);
        conferir(t.colunas === 2 && t.linhas === 2 && sumidas.length === 0, `${tela}, tabela ${i + 1} (${CASOS[i]}): ${t.colunas}×${t.linhas}, ${sumidas.length ? `sem ${sumidas.map(([n, f]) => `${n} (${Math.round(f * 100)}%)`).join(', ')}` : 'as seis linhas da grade desenhadas'}`);
      });
      conferir(erros.length === 0, `${tela}: nenhum erro na página${erros.length ? `: ${erros.join(' | ')}` : ''}`);
      await ctx.close();
    }
  } catch (e) {
    conferir(false, e instanceof Error ? e.message : String(e));
  } finally {
    await navegador.close();
    await amb.descer();
  }
  process.exit(falhou ? 1 : 0);
}

if (require.main === module) void principal();
