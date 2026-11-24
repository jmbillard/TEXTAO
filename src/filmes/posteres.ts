/* Os pôsteres de uma página da prévia de filmes, pela regra do FilmeBOT: as imagens que a página desenha com
   tamanho e proporção de pôster (o fundo e os logos ficam de fora), em ordem de leitura; as linhas de texto,
   para ligar cada filme ao pôster logo acima do título; e as vagas onde a prévia escreveu "CANCELADO".
   Tudo em pixels da imagem da página na escala pedida. */

export interface Caixa {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface LinhaDeTexto {
  str: string;
  x: number;
  top: number;
  width: number;
  height: number;
  base: number;
}
export interface Vaga {
  caixa: Caixa;
  texto: string;
}
export interface PosteresDaPagina {
  tamanho: { width: number; height: number };
  posteres: Caixa[];
  textos: LinhaDeTexto[];
  vagas: Vaga[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- o pdf.js chega por import dinâmico, sem os tipos dele aqui */
type Matriz = number[];
interface PdfJsMinimo {
  OPS: Record<string, number>;
  Util: { transform(a: Matriz, b: Matriz): Matriz; applyTransform(p: number[], m: Matriz): number[] };
}
interface PaginaPdf {
  getViewport(o: { scale: number }): { width: number; height: number; transform: Matriz; scale: number };
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: any[] }>;
  getTextContent(): Promise<{ items: any[] }>;
}

// frações do tamanho da página e proporção altura/largura de um pôster
const MIN_LARGURA = 0.04;
const MIN_ALTURA = 0.1;
const MAX_AREA = 0.25;
const MIN_PROPORCAO = 1.1;
const MAX_PROPORCAO = 2.2;

async function caixasDasImagens(pdfjs: PdfJsMinimo, pagina: PaginaPdf, vista: ReturnType<PaginaPdf['getViewport']>) {
  const { OPS, Util } = pdfjs;
  const desenhaImagem = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat, OPS.paintJpegXObject].filter((o) => o !== undefined));
  const ops = await pagina.getOperatorList();
  const caixas: { esq: number; topo: number; dir: number; base: number }[] = [];
  const pilha: Matriz[] = [];
  let m = vista.transform.slice();
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) pilha.push(m);
    else if (fn === OPS.restore) m = pilha.pop() ?? m;
    else if (fn === OPS.transform) m = Util.transform(m, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      pilha.push(m);
      if (Array.isArray(args?.[0]) && args[0].length === 6) m = Util.transform(m, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) m = pilha.pop() ?? m;
    else if (desenhaImagem.has(fn)) {
      // a imagem é desenhada no quadrado unitário do espaço atual
      const cantos = [[0, 0], [1, 0], [0, 1], [1, 1]].map((p) => Util.applyTransform(p, m));
      const xs = cantos.map((p) => p[0]);
      const ys = cantos.map((p) => p[1]);
      caixas.push({ esq: Math.min(...xs), topo: Math.min(...ys), dir: Math.max(...xs), base: Math.max(...ys) });
    }
  }
  return caixas;
}

function soPosteres(caixas: Awaited<ReturnType<typeof caixasDasImagens>>, largura: number, altura: number): Caixa[] {
  const candidatas = caixas
    .map((c) => {
      const x = Math.max(0, Math.round(c.esq));
      const y = Math.max(0, Math.round(c.topo));
      return { x, y, width: Math.min(largura, Math.round(c.dir)) - x, height: Math.min(altura, Math.round(c.base)) - y };
    })
    .filter((c) => {
      if (c.width <= 0 || c.height <= 0) return false;
      const p = c.height / c.width;
      return c.width >= largura * MIN_LARGURA && c.height >= altura * MIN_ALTURA && c.width * c.height <= largura * altura * MAX_AREA && p >= MIN_PROPORCAO && p <= MAX_PROPORCAO;
    });
  // a mesma arte desenhada duas vezes: fica a maior
  candidatas.sort((a, b) => b.width * b.height - a.width * a.height);
  return candidatas.filter((c, i) =>
    !candidatas.slice(0, i).some((o) => {
      const w = Math.min(c.x + c.width, o.x + o.width) - Math.max(c.x, o.x);
      const h = Math.min(c.y + c.height, o.y + o.height) - Math.max(c.y, o.y);
      return w > 0 && h > 0 && w * h >= c.width * c.height * 0.5;
    }),
  );
}

/** Fileiras de cima para baixo; em cada fileira, da esquerda para a direita. */
function emOrdemDeLeitura(caixas: Caixa[]): Caixa[] {
  const fileiras: { topo: number; base: number; caixas: Caixa[] }[] = [];
  [...caixas]
    .sort((a, b) => a.y - b.y)
    .forEach((c) => {
      const meio = c.y + c.height / 2;
      const f = fileiras.find((r) => meio >= r.topo && meio <= r.base);
      if (f) {
        f.caixas.push(c);
        f.topo = Math.min(f.topo, c.y);
        f.base = Math.max(f.base, c.y + c.height);
      } else fileiras.push({ topo: c.y, base: c.y + c.height, caixas: [c] });
    });
  return fileiras.sort((a, b) => a.topo - b.topo).flatMap((f) => f.caixas.sort((a, b) => a.x - b.x));
}

async function linhasDeTexto(pdfjs: PdfJsMinimo, pagina: PaginaPdf, vista: ReturnType<PaginaPdf['getViewport']>): Promise<LinhaDeTexto[]> {
  const conteudo = await pagina.getTextContent();
  const linhas: LinhaDeTexto[] = [];
  for (const item of conteudo.items) {
    if (!item.str || !String(item.str).trim()) continue;
    const [x, y] = pdfjs.Util.applyTransform([item.transform[4], item.transform[5]], vista.transform);
    const altura = Math.hypot(item.transform[2], item.transform[3]) * vista.scale;
    const largura = item.width * vista.scale;
    const l = linhas.find((o) => Math.abs(o.base - y) < altura * 0.6 && x - (o.x + o.width) < altura * 1.5 && x >= o.x - 2);
    if (l) {
      l.str += (x - (l.x + l.width) > altura * 0.15 ? ' ' : '') + item.str;
      l.width = Math.max(l.width, x + largura - l.x);
    } else linhas.push({ str: String(item.str), x, base: y, top: y - altura, width: largura, height: altura });
  }
  return linhas;
}

/** "CANCELADO" escrito no lugar de um pôster: uma vaga do tamanho de um pôster, na coluna do texto e na fileira mais próxima. */
function vagasCanceladas(posteres: Caixa[], textos: LinhaDeTexto[]): Vaga[] {
  if (!posteres.length) return [];
  const mediana = (v: number[]) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const w = mediana(posteres.map((p) => p.width));
  const h = mediana(posteres.map((p) => p.height));
  return textos
    .filter((l) => /^CANCELAD[OA]S?$/i.test(l.str.trim()))
    .map((l) => {
      const centro = l.x + l.width / 2;
      const perto = posteres.reduce((a, p) => (Math.abs(p.y + p.height / 2 - l.top) < Math.abs(a.y + a.height / 2 - l.top) ? p : a));
      return { caixa: { x: Math.round(centro - w / 2), y: perto.y, width: w, height: h }, texto: 'CANCELADO' };
    })
    .filter((v) => !posteres.some((p) => Math.min(p.x + p.width, v.caixa.x + w) - Math.max(p.x, v.caixa.x) > w * 0.3 && Math.abs(p.y - v.caixa.y) < h * 0.5));
}

export async function acharPosteres(pdfjs: unknown, pagina: unknown, escala = 2): Promise<PosteresDaPagina> {
  const p = pdfjs as PdfJsMinimo;
  const pg = pagina as PaginaPdf;
  const vista = pg.getViewport({ scale: escala });
  const tamanho = { width: Math.floor(vista.width), height: Math.floor(vista.height) };
  const posteres = emOrdemDeLeitura(soPosteres(await caixasDasImagens(p, pg, vista), tamanho.width, tamanho.height));
  const textos = await linhasDeTexto(p, pg, vista).catch(() => []);
  return { tamanho, posteres, textos, vagas: vagasCanceladas(posteres, textos) };
}
