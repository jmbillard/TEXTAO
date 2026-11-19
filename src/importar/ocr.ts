import type { Worker } from 'tesseract.js';
import type { LeituraOcr } from './pdf';

/* OCR de página digitalizada, no próprio navegador (Tesseract). O motor e o português são servidos pelo app,
   em ./ocr/, e só são baixados quando aparece o primeiro PDF digitalizado. O OCR traz as palavras com posição;
   o sublinhado, as bordas de tabela e o marca-texto saem da própria imagem, procurando traços e fundos coloridos. */

/** Resolução da leitura: 3 × 72 pt = 216 dpi, com teto para página grande. */
const ESCALA_MAX = 3;
const LARGURA_MAX = 2600;
/** Traço horizontal: pelo menos 14 pt (mais que a barra de uma letra). Vertical: pelo menos 40 pt (mais que um "l"). */
const TRACO_MIN_PT = 14;
const VERTICAL_MIN_PT = 40;
const ESCURO = 128;

let trabalhador: Promise<Worker> | null = null;
let progresso: ((p: number) => void) | null = null;
let folga: ReturnType<typeof setTimeout> | undefined;

function obterTrabalhador(): Promise<Worker> {
  clearTimeout(folga);
  trabalhador ??= (async () => {
    const { createWorker, OEM } = await import('tesseract.js');
    const base = new URL('ocr/', document.baseURI).href;
    return createWorker('por', OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base,
      gzip: true,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') progresso?.(m.progress);
      },
    });
  })().catch((e) => {
    trabalhador = null;
    throw new Error(`Não consegui iniciar a leitura de imagem (OCR): ${e instanceof Error ? e.message : e}`);
  });
  return trabalhador;
}

/** Sem uso por 2 minutos, o motor é desligado para devolver a memória. */
function liberarDepois() {
  clearTimeout(folga);
  folga = setTimeout(() => {
    void trabalhador?.then((w) => w.terminate());
    trabalhador = null;
  }, 120_000);
}

const hex = (r: number, g: number, b: number) => [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Traços horizontais e verticais longos, e fundos coloridos atrás das palavras, achados nos pixels. */
function acharDesenhos(img: ImageData, escala: number, palavras: { x0: number; y0: number; x1: number; y1: number }[]) {
  const { width: L, height: A, data } = img;
  const escuro = new Uint8Array(L * A);
  for (let i = 0, p = 0; p < L * A; i += 4, p++) escuro[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < ESCURO ? 1 : 0;

  const tracos: LeituraOcr['tracos'] = [];
  const minH = TRACO_MIN_PT * escala;
  for (let y = 0; y < A; y++) {
    let ini = -1;
    for (let x = 0; x <= L; x++) {
      const e = x < L && escuro[y * L + x];
      if (e && ini < 0) ini = x;
      else if (!e && ini >= 0) {
        if (x - ini >= minH) tracos.push([ini / escala, x / escala, y / escala]);
        ini = -1;
      }
    }
  }
  const verticais: LeituraOcr['verticais'] = [];
  const minV = VERTICAL_MIN_PT * escala;
  for (let x = 0; x < L; x++) {
    let ini = -1;
    for (let y = 0; y <= A; y++) {
      const e = y < A && escuro[y * L + x];
      if (e && ini < 0) ini = y;
      else if (!e && ini >= 0) {
        if (y - ini >= minV) verticais.push([x / escala, ini / escala, y / escala]);
        ini = -1;
      }
    }
  }

  // marca-texto: o fundo claro atrás da palavra é colorido (não branco, não cinza)
  const fundos: LeituraOcr['fundos'] = [];
  for (const p of palavras) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = Math.max(0, p.y0 | 0); y < Math.min(A, p.y1); y += 2)
      for (let x = Math.max(0, p.x0 | 0); x < Math.min(L, p.x1); x += 2) {
        const pi = y * L + x;
        if (escuro[pi]) continue;
        r += data[pi * 4];
        g += data[pi * 4 + 1];
        b += data[pi * 4 + 2];
        n++;
      }
    if (n < 12) continue;
    [r, g, b] = [r / n, g / n, b / n];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 60) fundos.push([p.x0 / escala, p.y0 / escala, p.x1 / escala, p.y1 / escala, hex(r, g, b)]);
  }
  return { tracos, verticais, fundos };
}

interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface LinhaTesseract {
  bbox: Bbox;
  baseline?: Bbox & { has_baseline?: boolean };
  rowAttributes?: { row_height?: number };
  words: { text: string; bbox: Bbox }[];
}

/** Lê uma página do pdf.js que é só imagem. `aoProgredir` recebe de 0 a 1. */
export async function lerPaginaPorOcr(pagina: any, aoProgredir?: (p: number) => void): Promise<LeituraOcr> {
  const largura = pagina.view[2] - pagina.view[0];
  const escala = Math.min(ESCALA_MAX, LARGURA_MAX / largura);
  const vista = pagina.getViewport({ scale: escala });
  const tela = document.createElement('canvas');
  tela.width = Math.ceil(vista.width);
  tela.height = Math.ceil(vista.height);
  const ctx = tela.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, tela.width, tela.height);
  await pagina.render({ canvasContext: ctx, viewport: vista }).promise;

  const w = await obterTrabalhador();
  progresso = aoProgredir ?? null;
  let blocos: { paragraphs: { lines: LinhaTesseract[] }[] }[] = [];
  try {
    const { data } = await w.recognize(tela, {}, { blocks: true, text: false });
    blocos = ((data as unknown as { blocks?: typeof blocos }).blocks ?? []) as typeof blocos;
  } finally {
    progresso = null;
    liberarDepois();
  }

  const palavras: LeituraOcr['palavras'] = [];
  const caixas: Bbox[] = [];
  let n = 0;
  for (const bloco of blocos)
    for (const par of bloco.paragraphs)
      for (const linha of par.lines) {
        n++;
        const alturaLinha = linha.rowAttributes?.row_height || linha.bbox.y1 - linha.bbox.y0;
        const tam = Math.max(6, alturaLinha / 1.25 / escala);
        const bl = linha.baseline?.has_baseline !== false ? linha.baseline : undefined;
        for (const pw of linha.words) {
          if (!pw.text.trim()) continue;
          const meio = (pw.bbox.x0 + pw.bbox.x1) / 2;
          // a linha de base dá onde o sublinhado começa; sem ela, o pé da palavra
          const baseY = bl && bl.x1 !== bl.x0 ? bl.y0 + ((bl.y1 - bl.y0) * (meio - bl.x0)) / (bl.x1 - bl.x0) : pw.bbox.y1;
          palavras.push({ texto: pw.text, x0: pw.bbox.x0 / escala, x1: pw.bbox.x1 / escala, base: baseY / escala, tam, linha: n });
          caixas.push(pw.bbox);
        }
      }

  const img = ctx.getImageData(0, 0, tela.width, tela.height);
  return { palavras, ...acharDesenhos(img, escala, caixas) };
}
