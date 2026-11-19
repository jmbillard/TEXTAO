import { empurrar, type BlocoBruto, type DocBruto, type Par } from './bruto';

/* Leitura de PDF com pdf.js. O PDF não guarda "sublinhado": o texto e os traços são desenhos
   separados. Aqui o texto é agrupado em linhas e cada traço horizontal fino logo abaixo de uma
   palavra conta como sublinhado, assim como as anotações de sublinhado feitas em leitores de PDF.
   Adaptado do extrator do app de upload de roteiros. */

/** O módulo do pdf.js (carregado por quem chama, para o navegador e os testes usarem builds diferentes). */
export interface PdfJs {
  getDocument(opcoes: object): { promise: Promise<any> };
  OPS: Record<string, number>;
}

/** Espessura máxima e largura mínima (pt) de um traço de sublinhado. */
const TRACO_MAX = 3;
const TRACO_MIN_LARGURA = 2;

interface Letra {
  c: string;
  x0: number;
  x1: number;
  base: number;
  tam: number;
  cob: number;
  anot: boolean;
  link: boolean;
  u?: boolean;
  b?: boolean;
  hl?: string;
}
interface Linha {
  letras: Letra[];
  x0: number;
  x1: number;
  base: number;
  tam: number;
}
type Traco = [x0: number, x1: number, y: number];
/** Traço vertical (borda de tabela): x, do alto (y0) até embaixo (y1). */
type Vertical = [x: number, y0: number, y1: number];
/** Retângulo colorido atrás do texto (marca-texto). */
type Fundo = [x0: number, y0: number, x1: number, y1: number, cor: string];
interface Desenhos {
  tracos: Traco[];
  verticais: Vertical[];
  fundos: Fundo[];
}
type Matriz = [number, number, number, number, number, number];

/* Larguras aproximadas (Helvetica, /1000) para estimar a posição de cada letra dentro de um trecho. */
const HELV: Record<string, number> = (() => {
  const s = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
  const v = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722,
    667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333,
    500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const w: Record<string, number> = {};
  for (let k = 0; k < s.length; k++) w[s[k]] = v[k];
  return w;
})();
const peso = (c: string) => HELV[c] ?? HELV[c.normalize('NFD')[0]] ?? 556;

export async function lerPdf(dados: ArrayBuffer | Uint8Array, arquivo: string, pdfjs: PdfJs): Promise<DocBruto> {
  let pdf: any;
  try {
    // o pdf.js fica com o buffer para si; entrega uma cópia
    pdf = await pdfjs.getDocument({ data: new Uint8Array(dados instanceof Uint8Array ? dados : new Uint8Array(dados)).slice(), isEvalSupported: false }).promise;
  } catch (e: any) {
    if (e?.name === 'PasswordException') throw new Error('Este PDF é protegido por senha.');
    throw new Error('Não consegui abrir este PDF.');
  }

  let autor = '';
  try {
    const meta = await pdf.getMetadata();
    autor = meta?.info?.Author || '';
    if (!autor && meta?.metadata) {
      const c = meta.metadata.get('dc:creator');
      autor = Array.isArray(c) ? c.join(', ') : c || '';
    }
  } catch {
    /* sem metadados */
  }

  const blocos: BlocoBruto[] = [];
  let digitalizadas = 0;
  let temColunas = false;
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const topo = pagina.view[3];
    const virarY = (y: number) => topo - y;
    const operadores = await pagina.getOperatorList(); // também carrega as fontes, para saber o que é negrito
    const desenhos = coletarDesenhos(pdfjs.OPS, operadores, virarY);
    const negrito = (fonte: string): boolean => {
      try {
        return /bold|black|heavy|semibold/i.test(pagina.commonObjs.get(fonte)?.name ?? '');
      } catch {
        return false;
      }
    };
    const itens = (await pagina.getTextContent()).items;
    // tabela sem bordas desenhadas: a segunda coluna se denuncia por várias linhas começando no mesmo ponto
    const corredor = desenhos.verticais.length ? null : acharCorredor(itens);
    const barreiras = [...new Set(desenhos.verticais.map((v) => Math.round(v[0]))), ...(corredor ? [corredor] : [])];
    const linhas = montarLinhas(itens, virarY, barreiras, negrito);
    if (!linhas.length) {
      const O = pdfjs.OPS;
      if (operadores.fnArray.some((f: number) => f === O.paintImageXObject || f === O.paintInlineImageXObject || f === O.paintJpegXObject)) digitalizadas++;
      continue;
    }
    marcar(linhas, desenhos, await pagina.getAnnotations(), virarY);
    const daPagina = montarBlocos(linhas, desenhos, corredor);
    temColunas ||= daPagina.some((bl) => bl.tipo === 'tabela');
    blocos.push(...daPagina);
    pagina.cleanup();
  }
  await pdf.destroy();

  const avisos = [
    temColunas
      ? 'Num PDF, colunas, sublinhado e marca-texto são reconhecidos pelo desenho da página, e a cor do texto não vem. Confira antes de seguir.'
      : 'Num PDF, sublinhado e marca-texto são reconhecidos pelo desenho da página, e a cor do texto não vem. Confira antes de seguir.',
  ];
  if (digitalizadas) avisos.push(`${digitalizadas} ${digitalizadas === 1 ? 'página é uma imagem digitalizada' : 'páginas são imagens digitalizadas'} e não ${digitalizadas === 1 ? 'pôde' : 'puderam'} ser ${digitalizadas === 1 ? 'lida' : 'lidas'}.`);
  const temTexto = blocos.some((bl) => (bl.tipo === 'p' ? bl.par.length : bl.linhas.some((l) => l.some((c) => c.some((p) => p.length)))));
  if (!temTexto) throw new Error('Não encontrei texto neste PDF. Se ele foi digitalizado, é uma imagem e não dá para ler.');
  return { arquivo, formato: 'pdf', autor: autor.trim(), blocos, avisos };
}

/** Agrupa os trechos de texto em linhas visuais; cada letra guarda a posição estimada. */
function montarLinhas(itens: any[], virarY: (y: number) => number, barreiras: number[], negrito: (fonte: string) => boolean): Linha[] {
  const linhas: Linha[] = [];
  for (const it of itens) {
    if (!it.str || !it.transform) continue;
    const [a, b, c, d, e, f] = it.transform as Matriz;
    if (a <= 0 || Math.abs(b) > 1e-3 || Math.abs(c) > 1e-3) continue; // texto girado
    const tam = Math.abs(d) || it.height || 10;
    const base = virarY(f);
    const chars = [...(it.str as string)];
    const pesos = chars.map(peso);
    const total = pesos.reduce((s, w) => s + w, 0) || 1;
    const largura = it.width || (total / 1000) * tam;
    let x = e;
    const forte = it.fontName ? negrito(it.fontName) : false;
    const lista: Letra[] = chars.map((ch, k) => {
      const w = (pesos[k] / total) * largura;
      const letra = { c: ch, x0: x, x1: x + w, base, tam, cob: 0, anot: false, link: false, b: forte };
      x += w;
      return letra;
    });
    while (lista.length && !lista[lista.length - 1].c.trim()) lista.pop();
    while (lista.length && !lista[0].c.trim()) lista.shift();
    if (!lista.length) continue;

    const ant = linhas[linhas.length - 1];
    const vao = ant ? lista[0].x0 - ant.x1 : 0;
    // uma borda de tabela entre dois trechos da mesma altura: são colunas diferentes, não a mesma linha
    const cruzaBorda = !!ant && barreiras.some((bx) => bx > ant.x1 - 1 && bx < lista[0].x0 + 1);
    if (ant && !cruzaBorda && Math.abs(ant.base - base) <= 0.3 * tam && vao >= -1 && vao <= 1.5 * tam) {
      if (vao > 0.15 * tam) ant.letras.push({ c: ' ', x0: ant.x1, x1: lista[0].x0, base: ant.base, tam, cob: 0, anot: false, link: false });
      ant.letras.push(...lista);
      ant.x1 = lista[lista.length - 1].x1;
      ant.tam = Math.max(ant.tam, tam);
      continue;
    }
    linhas.push({ letras: lista, x0: lista[0].x0, x1: lista[lista.length - 1].x1, base, tam });
  }
  return linhas;
}

/** O que foi desenhado além do texto: traços horizontais (sublinhado), verticais (bordas de tabela) e fundos coloridos (marca-texto). */
function coletarDesenhos(OPS: Record<string, number>, ol: { fnArray: number[]; argsArray: any[] }, virarY: (y: number) => number): Desenhos {
  type Ponto = { x: number; y: number };
  type Seg = { tipo: 'l' | 'c'; pts: Ponto[] } | { tipo: 're'; p0: Ponto; p1: Ponto };
  const tracos: Traco[] = [];
  const verticais: Vertical[] = [];
  const fundos: Fundo[] = [];
  const pilha: [Matriz, number, string][] = [];
  let ctm: Matriz = [1, 0, 0, 1, 0, 0];
  let espessura = 1;
  let cor = '000000';
  const hex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
  let caminho: Seg[] = [];

  const mul = (m: number[], n: number[]): Matriz => [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ];
  const pt = (x: number, y: number): Ponto => ({ x: ctm[0] * x + ctm[2] * y + ctm[4], y: virarY(ctm[1] * x + ctm[3] * y + ctm[5]) });
  const escala = () => Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
  const CONTORNA = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const PREENCHE = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

  function pintar(contorna: boolean, preenche: boolean) {
    if (!caminho.length) return;
    const todos = caminho.flatMap((s) => (s.tipo === 're' ? [s.p0, s.p1] : s.pts));
    const xs = todos.map((p) => p.x);
    const ys = todos.map((p) => p.y);
    const [bx0, bx1, by0, by1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (preenche && by1 - by0 <= TRACO_MAX && bx1 - bx0 >= TRACO_MIN_LARGURA) {
      tracos.push([bx0, bx1, (by0 + by1) / 2]);
      return;
    }
    if (preenche && bx1 - bx0 <= TRACO_MAX && by1 - by0 >= 20) {
      verticais.push([(bx0 + bx1) / 2, by0, by1]);
      return;
    }
    // faixa colorida da altura de uma linha de texto: marca-texto
    if (preenche && !contorna && by1 - by0 >= 6 && by1 - by0 <= 44 && bx1 - bx0 >= 4 && !/^(FFFFFF|000000)$/.test(cor)) {
      const [r, g, b] = [0, 2, 4].map((k) => parseInt(cor.slice(k, k + 2), 16));
      if (Math.max(r, g, b) - Math.min(r, g, b) >= 40) fundos.push([bx0, by0, bx1, by1, cor]);
      return;
    }
    const lw = espessura * escala();
    for (const s of caminho) {
      if (s.tipo === 'l' && contorna) {
        const [p1, p2] = s.pts;
        if (Math.abs(p1.y - p2.y) <= 1 && Math.abs(p1.x - p2.x) >= TRACO_MIN_LARGURA && lw <= TRACO_MAX)
          tracos.push([Math.min(p1.x, p2.x), Math.max(p1.x, p2.x), (p1.y + p2.y) / 2]);
        else if (Math.abs(p1.x - p2.x) <= 1 && Math.abs(p1.y - p2.y) >= 20 && lw <= TRACO_MAX)
          verticais.push([(p1.x + p2.x) / 2, Math.min(p1.y, p2.y), Math.max(p1.y, p2.y)]);
      } else if (s.tipo === 're') {
        const x0 = Math.min(s.p0.x, s.p1.x);
        const x1 = Math.max(s.p0.x, s.p1.x);
        const y0 = Math.min(s.p0.y, s.p1.y);
        const y1 = Math.max(s.p0.y, s.p1.y);
        if (y1 - y0 <= TRACO_MAX && x1 - x0 >= TRACO_MIN_LARGURA) tracos.push([x0, x1, (y0 + y1) / 2]);
        else if (x1 - x0 <= TRACO_MAX && y1 - y0 >= 20) verticais.push([(x0 + x1) / 2, y0, y1]);
        else if (contorna && y1 - y0 >= 20 && x1 - x0 >= 20 && lw <= TRACO_MAX) {
          // moldura de célula: as quatro bordas
          verticais.push([x0, y0, y1], [x1, y0, y1]);
          tracos.push([x0, x1, y0], [x0, x1, y1]);
        }
      }
    }
  }

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args = ol.argsArray[i];
    if (fn === OPS.save) pilha.push([ctm, espessura, cor]);
    else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) {
      const topo = pilha.pop();
      if (topo) [ctm, espessura, cor] = topo;
    } else if (fn === OPS.setFillRGBColor) {
      // conforme a versão do pdf.js: três números (0–255) ou "#rrggbb"
      cor = typeof args[0] === 'string' ? args[0].replace('#', '').toUpperCase() : hex(args[0]) + hex(args[1]) + hex(args[2]);
    } else if (fn === OPS.transform) ctm = mul(args, ctm);
    else if (fn === OPS.paintFormXObjectBegin) {
      pilha.push([ctm, espessura, cor]);
      if (Array.isArray(args[0]) || ArrayBuffer.isView(args[0])) ctm = mul([...(args[0] as number[])], ctm);
    } else if (fn === OPS.setLineWidth) espessura = args[0];
    else if (fn === OPS.setGState) {
      for (const [chave, valor] of args[0] || []) if (chave === 'LW') espessura = valor;
    } else if (fn === OPS.constructPath) {
      const [ops, coords] = args as [number[], number[]];
      let c = 0;
      let atual: Ponto | null = null;
      for (const op of ops) {
        if (op === OPS.moveTo) {
          atual = pt(coords[c], coords[c + 1]);
          c += 2;
        } else if (op === OPS.lineTo) {
          const p = pt(coords[c], coords[c + 1]);
          c += 2;
          if (atual) caminho.push({ tipo: 'l', pts: [atual, p] });
          atual = p;
        } else if (op === OPS.curveTo) {
          const p = [pt(coords[c], coords[c + 1]), pt(coords[c + 2], coords[c + 3]), pt(coords[c + 4], coords[c + 5])];
          c += 6;
          caminho.push({ tipo: 'c', pts: atual ? [atual, ...p] : p });
          atual = p[2];
        } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
          const p = [pt(coords[c], coords[c + 1]), pt(coords[c + 2], coords[c + 3])];
          c += 4;
          caminho.push({ tipo: 'c', pts: atual ? [atual, ...p] : p });
          atual = p[1];
        } else if (op === OPS.rectangle) {
          const [x, y, w, h] = [coords[c], coords[c + 1], coords[c + 2], coords[c + 3]];
          c += 4;
          caminho.push({ tipo: 're', p0: pt(x, y), p1: pt(x + w, y + h) });
        }
      }
    } else if (CONTORNA.has(fn) || PREENCHE.has(fn)) {
      pintar(CONTORNA.has(fn), PREENCHE.has(fn));
      caminho = [];
    } else if (fn === OPS.endPath) caminho = [];
  }
  return { tracos, verticais, fundos };
}

/** Marca as letras sublinhadas (por traço ou anotação) e as que estão em links. */
function marcar(linhas: Linha[], { tracos, fundos }: Desenhos, anotacoes: any[], virarY: (y: number) => number) {
  for (const ln of linhas) {
    const t = ln.tam;
    for (const [fx0, fy0, fx1, fy1, cor] of fundos) {
      if (fy1 - fy0 > 2.4 * t) continue; // fundo de célula, não marca-texto
      for (const ch of ln.letras) {
        const px = (ch.x0 + ch.x1) / 2;
        const py = ch.base - 0.3 * ch.tam;
        if (fx0 <= px && px <= fx1 && fy0 <= py && py <= fy1) ch.hl = cor;
      }
    }
    for (const [x0, x1, y] of tracos) {
      if (!(ln.base - 0.06 * t <= y && y <= ln.base + 0.35 * t)) continue;
      if (x0 < ln.x0 - 0.5 * t || x1 > ln.x1 + t) continue; // régua ou borda de tabela
      for (const ch of ln.letras) {
        const w = ch.x1 - ch.x0;
        if (w > 0) ch.cob += Math.max(0, Math.min(ch.x1, x1) - Math.max(ch.x0, x0)) / w;
      }
    }
  }

  type Caixa = [number, number, number, number];
  const caixasDe = (a: any): Caixa[] => {
    const q = a.quadPoints;
    if (q && q.length) {
      const plano: number[] = typeof q[0] === 'number' ? [...q] : q.flatMap((quad: any[]) => quad.flatMap((p) => [p.x, p.y]));
      const caixas: Caixa[] = [];
      for (let k = 0; k + 7 < plano.length; k += 8) {
        const xs = [plano[k], plano[k + 2], plano[k + 4], plano[k + 6]];
        const ys = [plano[k + 1], plano[k + 3], plano[k + 5], plano[k + 7]].map(virarY);
        caixas.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
      }
      if (caixas.length) return caixas;
    }
    const r = a.rect;
    return r ? [[Math.min(r[0], r[2]), virarY(Math.max(r[1], r[3])), Math.max(r[0], r[2]), virarY(Math.min(r[1], r[3]))]] : [];
  };
  const dentro = (caixas: Caixa[], ch: Letra) => {
    const px = (ch.x0 + ch.x1) / 2;
    const py = ch.base - 0.3 * ch.tam;
    return caixas.some(([x0, y0, x1, y1]) => x0 <= px && px <= x1 && y0 <= py && py <= y1);
  };
  const sublinhados = anotacoes.filter((a) => a.subtype === 'Underline' || a.subtype === 'Squiggly').flatMap(caixasDe);
  const links = anotacoes.filter((a) => a.subtype === 'Link').flatMap(caixasDe);

  for (const ln of linhas) {
    for (const ch of ln.letras) {
      if (sublinhados.length && dentro(sublinhados, ch)) ch.anot = true;
      if (links.length && dentro(links, ch)) ch.link = true;
    }
    // decide por palavra, porque a posição de cada letra é estimada
    const cs = ln.letras;
    let k = 0;
    while (k < cs.length) {
      if (!cs[k].c.trim()) {
        cs[k].u = false;
        k++;
        continue;
      }
      let j = k;
      while (j < cs.length && cs[j].c.trim()) j++;
      let coberto = 0;
      let largura = 0;
      let anot = 0;
      for (let m = k; m < j; m++) {
        const w = cs[m].x1 - cs[m].x0;
        coberto += Math.min(1, cs[m].cob) * w;
        largura += w;
        if (cs[m].anot) anot++;
      }
      const u = (largura > 0 && coberto / largura >= 0.5) || anot * 2 >= j - k;
      // pontuação nas pontas da palavra só conta se estiver sob o traço
      let a = k;
      let z = j - 1;
      while (a <= z && !/[\p{L}\p{N}]/u.test(cs[a].c)) a++;
      while (z >= a && !/[\p{L}\p{N}]/u.test(cs[z].c)) z--;
      for (let m = k; m < j; m++) cs[m].u = m >= a && m <= z ? u : u && (cs[m].cob >= 0.6 || cs[m].anot);
      k = j;
    }
    // o espaço entre duas palavras sublinhadas pertence ao sublinhado
    for (let m = 1; m < cs.length - 1; m++) if (!cs[m].c.trim() && cs[m - 1].u && cs[m + 1].u) cs[m].u = true;
  }
}

const RE_ABRE_SONORA = /^\s*(?:\([^()]{2,90}\)\s*)?\d{1,2}[.:]\d{2}(?:[.:]\d{2})?\s*(?:[–—-]\s|\p{L})|^\s*(?:MC|M[IÍ]DIA\s+CENTRAL|FRAME\.?\s?IO)\b/iu;

const RE_ABRE_CABECALHO = /^\s*\(?\s*(?:LOC(?:UTOR[A]?|U[CÇ][AÃ]O)?\s*[:-]|(?:COM\s+)?SELO\b|FECHAR\s+C|REDATOR[A]?\s*:|PGM\s*:|M[AÁ]X\w*\.?\s*\d)/i;

/** A linha i+1 continua a linha i por quebra automática? null = não; " " = sim; "" = sim, com palavra cortada. */
function quebraAutomatica(linhas: Linha[], i: number, disponivel: number): string | null {
  const a = linhas[i];
  const b = linhas[i + 1];
  const t = a.tam;
  // mesmo alinhamento (à esquerda, à direita ou centralizado) e na linha logo abaixo
  const alinhadas = Math.abs(a.x0 - b.x0) <= 2 || Math.abs(a.x1 - b.x1) <= 2 || Math.abs(a.x0 + a.x1 - b.x0 - b.x1) <= 4;
  if (!alinhadas || !(b.base - a.base > 0 && b.base - a.base <= 2 * t)) return null;
  // Em roteiro, juntar duas linhas que eram separadas custa mais do que separar um parágrafo:
  // frase terminada + linha nova começando "do zero", ou linha que abre uma sonora, é parágrafo novo.
  const textoA = a.letras.map((l) => l.c).join('');
  const textoB = b.letras.map((l) => l.c).join('');
  if (RE_ABRE_CABECALHO.test(textoB) || RE_ABRE_SONORA.test(textoB) || /^\s*\/\/\s*$/.test(textoA) || /^\s*\/\/\s*$/.test(textoB)) return null;
  if (/[.!?…][”"')\]/]*\s*$/.test(textoA) && /^[\p{Lu}\d(/“"]/u.test(textoB)) return null;
  let primeira = b.x1;
  for (const ch of b.letras)
    if (!ch.c.trim()) {
      primeira = ch.x0;
      break;
    }
  // se a primeira palavra da linha de baixo cabia na de cima, a quebra foi de quem escreveu
  if (a.x1 - a.x0 + 0.25 * t + (primeira - b.x0) <= disponivel + 0.5) return null;
  const umaPalavra = !a.letras.some((ch) => !ch.c.trim());
  const cheia = disponivel - (a.x1 - a.x0) < 0.9 * t;
  return umaPalavra && cheia ? '' : ' ';
}

function linhasParaParagrafos(linhas: Linha[]): Par[] {
  const pars: Par[] = [];
  if (!linhas.length) return pars;
  const disponivel = Math.max(...linhas.map((l) => l.x1 - l.x0));
  let par: Par = [];
  const marcas = (ch: Letra) => ({ ...(ch.u ? { u: true } : {}), ...(ch.b ? { b: true } : {}), ...(ch.hl ? { hl: ch.hl } : {}), ...(ch.link ? { link: true } : {}) });
  linhas.forEach((ln, i) => {
    if (i > 0) {
      const sep = quebraAutomatica(linhas, i - 1, disponivel);
      if (sep === null) {
        pars.push(par);
        par = [];
        const acima = linhas[i - 1];
        if (ln.base - acima.base > 1.9 * Math.max(acima.tam, ln.tam) && Math.abs(ln.x0 - acima.x0) < 200) pars.push([]);
      } else if (sep) {
        // o espaço da quebra herda a marcação quando os dois lados a têm
        const antes = linhas[i - 1].letras[linhas[i - 1].letras.length - 1];
        const depois = ln.letras[0];
        empurrar(par, { t: sep, ...(antes.u && depois.u ? { u: true } : {}), ...(antes.b && depois.b ? { b: true } : {}), ...(antes.hl && antes.hl === depois.hl ? { hl: antes.hl } : {}) });
      }
    }
    for (const ch of ln.letras) empurrar(par, { t: ch.c, ...marcas(ch) });
  });
  pars.push(par);
  return pars;
}

/** Separa a página em parágrafos soltos e tabela de duas colunas, usando as bordas desenhadas. */
function acharCorredor(itens: any[]): number | null {
  const caixas = itens.filter((it) => it.str?.trim() && it.transform).map((it) => [it.transform[4], it.transform[4] + (it.width || 0)] as [number, number]);
  if (caixas.length < 8) return null;
  const margem = Math.min(...caixas.map((c) => c[0]));
  const inicios = new Map<number, number>();
  for (const [x0] of caixas) inicios.set(Math.round(x0 / 2) * 2, (inicios.get(Math.round(x0 / 2) * 2) ?? 0) + 1);
  let melhor: { x: number; n: number } | null = null;
  for (const [inicio, n] of inicios) {
    if (n < 3 || inicio < margem + 60) continue;
    const x = inicio - 1.5;
    const cruzam = caixas.filter((c) => c[0] < x - 1 && c[1] > x + 1).length;
    const aEsquerda = caixas.filter((c) => c[1] <= x + 1).length;
    if (aEsquerda >= 3 && cruzam <= Math.max(1, 0.04 * caixas.length) && (!melhor || n > melhor.n)) melhor = { x, n };
  }
  return melhor?.x ?? null;
}

function montarBlocos(linhas: Linha[], { tracos, verticais }: Desenhos, corredor: number | null): BlocoBruto[] {
  const soltos = (ls: Linha[]): BlocoBruto[] => linhasParaParagrafos(ls).map((par) => ({ tipo: 'p' as const, par }));
  const X0 = Math.min(...linhas.map((l) => l.x0));
  const X1 = Math.max(...linhas.map((l) => l.x1));

  // candidata a divisória: borda vertical no miolo da página, com texto dos dois lados
  let melhor: { x: number; y0: number; y1: number; lados: number } | null = null;
  const vistos = new Set<number>();
  for (const [vx] of verticais) {
    const x = Math.round(vx);
    if (vistos.has(x) || vx < X0 + 0.12 * (X1 - X0) || vx > X1 - 0.12 * (X1 - X0)) continue;
    vistos.add(x);
    const trechos = verticais.filter((v) => Math.abs(v[0] - vx) <= 2);
    const y0 = Math.min(...trechos.map((v) => v[1]));
    const y1 = Math.max(...trechos.map((v) => v[2]));
    const dentro = linhas.filter((l) => l.base >= y0 - 2 && l.base <= y1 + l.tam);
    const esq = dentro.filter((l) => l.x1 <= vx + 1).length;
    const dir = dentro.filter((l) => l.x0 >= vx - 1).length;
    const lados = Math.min(esq, dir);
    if (dir >= 2 && (!melhor || lados > melhor.lados || (lados === melhor.lados && dir > 0 && y1 - y0 > melhor.y1 - melhor.y0))) melhor = { x: vx, y0, y1, lados };
  }
  if (!melhor) {
    if (corredor === null) return soltos(linhas);
    melhor = { x: corredor, y0: -1e6, y1: 1e6, lados: 0 };
  }
  const { x, y0, y1 } = melhor;

  const antes = linhas.filter((l) => l.base < y0 - 2);
  const depois = linhas.filter((l) => l.base > y1 + l.tam);
  const dentro = linhas.filter((l) => !antes.includes(l) && !depois.includes(l));
  // bordas horizontais que atravessam a divisória separam as linhas da tabela
  const cortes = [...new Set(tracos.filter((t) => t[0] < x - 5 && t[1] > x + 5 && t[2] > y0 + 2 && t[2] < y1 - 2).map((t) => Math.round(t[2])))].sort((a, b) => a - b);
  // uma linha que atravessa a divisória (título, célula mesclada) também separa as linhas da tabela
  for (const l of dentro) if (l.x0 < x - 3 && l.x1 > x + 3) cortes.push(Math.round(l.base - l.tam), Math.round(l.base + 0.2 * l.tam));
  cortes.sort((a, b) => a - b);
  const faixas = [y0 - 1e6, ...cortes, y1 + 1e6];
  const linhasDaTabela: Par[][][] = [];
  for (let k = 0; k + 1 < faixas.length; k++) {
    const daFaixa = dentro.filter((l) => l.base - 0.3 * l.tam > faixas[k] && l.base - 0.3 * l.tam <= faixas[k + 1]);
    if (!daFaixa.length) continue;
    const esq = daFaixa.filter((l) => l.x1 <= x + 3 && l.x0 < x - 3);
    const dir = daFaixa.filter((l) => l.x0 >= x - 3 && !esq.includes(l));
    const outras = daFaixa.filter((l) => !esq.includes(l) && !dir.includes(l)); // célula que ocupa a largura toda
    if (outras.length || (!esq.length && !dir.length)) linhasDaTabela.push([linhasParaParagrafos(daFaixa)]);
    else linhasDaTabela.push([linhasParaParagrafos(esq), linhasParaParagrafos(dir)]);
  }
  return [...soltos(antes), { tipo: 'tabela', linhas: linhasDaTabela }, ...soltos(depois)];
}
