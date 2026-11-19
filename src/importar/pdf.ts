import { empurrar, type DocBruto, type Par } from './bruto';

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
}
interface Linha {
  letras: Letra[];
  x0: number;
  x1: number;
  base: number;
  tam: number;
}
type Traco = [x0: number, x1: number, y: number];
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

  const pars: Par[] = [];
  let digitalizadas = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const topo = pagina.view[3];
    const virarY = (y: number) => topo - y;
    const linhas = montarLinhas((await pagina.getTextContent()).items, virarY);
    const operadores = await pagina.getOperatorList();
    if (!linhas.length) {
      const O = pdfjs.OPS;
      if (operadores.fnArray.some((f: number) => f === O.paintImageXObject || f === O.paintInlineImageXObject || f === O.paintJpegXObject)) digitalizadas++;
      continue;
    }
    marcar(linhas, coletarTracos(pdfjs.OPS, operadores, virarY), await pagina.getAnnotations(), virarY);
    pars.push(...linhasParaParagrafos(linhas));
    pagina.cleanup();
  }
  await pdf.destroy();

  const avisos = ['O PDF não guarda colunas, negrito, marca-texto nem cores. Confira o texto e as artes antes de seguir.'];
  if (digitalizadas) avisos.push(`${digitalizadas} ${digitalizadas === 1 ? 'página é uma imagem digitalizada' : 'páginas são imagens digitalizadas'} e não ${digitalizadas === 1 ? 'pôde' : 'puderam'} ser ${digitalizadas === 1 ? 'lida' : 'lidas'}.`);
  if (!pars.some((p) => p.length)) throw new Error('Não encontrei texto neste PDF. Se ele foi digitalizado, é uma imagem e não dá para ler.');
  return { arquivo, formato: 'pdf', autor: autor.trim(), blocos: pars.map((par) => ({ tipo: 'p' as const, par })), avisos };
}

/** Agrupa os trechos de texto em linhas visuais; cada letra guarda a posição estimada. */
function montarLinhas(itens: any[], virarY: (y: number) => number): Linha[] {
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
    const lista: Letra[] = chars.map((ch, k) => {
      const w = (pesos[k] / total) * largura;
      const letra = { c: ch, x0: x, x1: x + w, base, tam, cob: 0, anot: false, link: false };
      x += w;
      return letra;
    });
    while (lista.length && !lista[lista.length - 1].c.trim()) lista.pop();
    while (lista.length && !lista[0].c.trim()) lista.shift();
    if (!lista.length) continue;

    const ant = linhas[linhas.length - 1];
    const vao = ant ? lista[0].x0 - ant.x1 : 0;
    if (ant && Math.abs(ant.base - base) <= 0.3 * tam && vao >= -1 && vao <= 4 * tam) {
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

/** Traços horizontais finos (linhas e retângulos) desenhados na página. */
function coletarTracos(OPS: Record<string, number>, ol: { fnArray: number[]; argsArray: any[] }, virarY: (y: number) => number): Traco[] {
  type Ponto = { x: number; y: number };
  type Seg = { tipo: 'l' | 'c'; pts: Ponto[] } | { tipo: 're'; p0: Ponto; p1: Ponto };
  const tracos: Traco[] = [];
  const pilha: [Matriz, number][] = [];
  let ctm: Matriz = [1, 0, 0, 1, 0, 0];
  let espessura = 1;
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
    const lw = espessura * escala();
    for (const s of caminho) {
      if (s.tipo === 'l' && contorna) {
        const [p1, p2] = s.pts;
        if (Math.abs(p1.y - p2.y) <= 1 && Math.abs(p1.x - p2.x) >= TRACO_MIN_LARGURA && lw <= TRACO_MAX)
          tracos.push([Math.min(p1.x, p2.x), Math.max(p1.x, p2.x), (p1.y + p2.y) / 2]);
      } else if (s.tipo === 're') {
        const x0 = Math.min(s.p0.x, s.p1.x);
        const x1 = Math.max(s.p0.x, s.p1.x);
        if (Math.abs(s.p0.y - s.p1.y) <= TRACO_MAX && x1 - x0 >= TRACO_MIN_LARGURA) tracos.push([x0, x1, (s.p0.y + s.p1.y) / 2]);
      }
    }
  }

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args = ol.argsArray[i];
    if (fn === OPS.save) pilha.push([ctm, espessura]);
    else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) {
      const topo = pilha.pop();
      if (topo) [ctm, espessura] = topo;
    } else if (fn === OPS.transform) ctm = mul(args, ctm);
    else if (fn === OPS.paintFormXObjectBegin) {
      pilha.push([ctm, espessura]);
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
  return tracos;
}

/** Marca as letras sublinhadas (por traço ou anotação) e as que estão em links. */
function marcar(linhas: Linha[], tracos: Traco[], anotacoes: any[], virarY: (y: number) => number) {
  for (const ln of linhas) {
    const t = ln.tam;
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

/** A linha i+1 continua a linha i por quebra automática? null = não; " " = sim; "" = sim, com palavra cortada. */
function quebraAutomatica(linhas: Linha[], i: number): string | null {
  const a = linhas[i];
  const b = linhas[i + 1];
  const t = a.tam;
  if (Math.abs(a.x0 - b.x0) > 2 || !(b.base - a.base > 0 && b.base - a.base <= 2.2 * t)) return null;
  // Em roteiro, juntar duas linhas que eram separadas custa mais do que separar um parágrafo:
  // frase terminada + linha nova começando "do zero", ou linha que abre uma sonora, é parágrafo novo.
  const textoA = a.letras.map((l) => l.c).join('');
  const textoB = b.letras.map((l) => l.c).join('');
  if (RE_ABRE_SONORA.test(textoB) || /^\s*\/\/\s*$/.test(textoA) || /^\s*\/\/\s*$/.test(textoB)) return null;
  if (/[.!?…][”"')\]/]*\s*$/.test(textoA) && /^[\p{Lu}\d(/“"]/u.test(textoB)) return null;
  let primeira = b.x1;
  for (const ch of b.letras)
    if (!ch.c.trim()) {
      primeira = ch.x0;
      break;
    }
  const disponivel = Math.max(...linhas.filter((l) => Math.abs(l.x0 - a.x0) <= 2).map((l) => l.x1 - l.x0));
  if (a.x1 - a.x0 + 0.25 * t + (primeira - b.x0) <= disponivel + 0.5) return null;
  const umaPalavra = !a.letras.some((ch) => !ch.c.trim());
  const cheia = disponivel - (a.x1 - a.x0) < 0.9 * t;
  return umaPalavra && cheia ? '' : ' ';
}

function linhasParaParagrafos(linhas: Linha[]): Par[] {
  const pars: Par[] = [];
  let par: Par = [];
  linhas.forEach((ln, i) => {
    if (i > 0) {
      const sep = quebraAutomatica(linhas, i - 1);
      if (sep === null) {
        pars.push(par);
        par = [];
      } else if (sep) empurrar(par, { t: sep, ...(par[par.length - 1]?.u && ln.letras[0]?.u ? { u: true } : {}) });
    }
    for (const ch of ln.letras) empurrar(par, { t: ch.c, ...(ch.u ? { u: true } : {}), ...(ch.link ? { link: true } : {}) });
  });
  pars.push(par);
  return pars;
}
