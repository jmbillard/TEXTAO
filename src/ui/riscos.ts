/* O risco à mão por cima de um texto riscado, um traço por linha: a lista de artes, a comparação e o texto do roteiro.
   O texto fica em linha (quebra como quiser) e uma camada SVG, sem pegar o mouse, desenha um <path> por linha a partir
   dos retângulos que o navegador dá para o trecho (getClientRects). A geometria é pura e testada; o desenho mede. */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { RISCOS_DE_LINHA } from './pecas';

export interface Caixa {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Risco {
  d: string;
  /** segundos que a linha leva para se escrever */
  dur: number;
  /** segundos até a linha começar (negativo: redesenhada no meio da escrita) */
  atraso: number;
}

/** O tempo da escrita do trecho inteiro, linha a linha. */
export const DURACAO_DO_RISCO = 0.4;
const DURACAO_MINIMA = 0.12;

/** As linhas do trecho: os retângulos da mesma linha (o trecho cortado por outra marca) viram um só; os vazios (a
 *  quebra no fim da linha) ficam de fora. De cima para baixo. */
export function linhasDoTrecho(rects: Caixa[]): Caixa[] {
  const linhas: Caixa[] = [];
  const cheios = rects.filter((r) => r.right - r.left > 1 && r.bottom - r.top > 0).sort((a, b) => a.top - b.top || a.left - b.left);
  for (const r of cheios) {
    const meio = (r.top + r.bottom) / 2;
    const mesma = linhas.find((l) => meio > l.top && meio < l.bottom);
    if (mesma) {
      mesma.left = Math.min(mesma.left, r.left);
      mesma.right = Math.max(mesma.right, r.right);
      mesma.top = Math.min(mesma.top, r.top);
      mesma.bottom = Math.max(mesma.bottom, r.bottom);
    } else linhas.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  return linhas;
}

/** Do alto da caixa da linha ao meio das letras: o meio das maiúsculas (a arte em caixa alta) ou, com minúsculas no
 *  texto, o meio da altura do x. `ascent` é o da fonte (o alto da caixa até a linha de base). */
export function meioDasLetras(m: { ascent: number; cap: number; xAltura: number }, texto: string): number {
  return m.ascent - (/\p{Ll}/u.test(texto) ? m.xAltura : m.cap) / 2;
}

/** Estica um risco do modelo (viewBox 0 0 100 14, o meio em y = 7) de x0 a x1, com o meio na altura y. */
export function esticarRisco(d: string, x0: number, x1: number, y: number, amplitude: number): string {
  const w = x1 - x0;
  return d.replace(/(-?[\d.]+)\s*,?\s+(-?[\d.]+)/g, (_, px: string, py: string) => `${(x0 + (w * Number(px)) / 100).toFixed(1)} ${(y + (Number(py) - 7) * amplitude).toFixed(1)}`);
}

/** Um risco por linha, nas coordenadas da camada (`origem` é o canto dela na tela): na altura do meio das letras, com
 *  4px a mais de cada lado, cada linha com um traço diferente. Os tempos fazem as linhas se escreverem uma depois da
 *  outra, cada uma pelo seu comprimento; `decorrido` continua uma escrita já começada. */
export function tracarRiscos(
  linhas: Caixa[],
  o: { origem: { x: number; y: number }; meio: number; fs: number; tracos: readonly string[]; semente?: number; amplitude?: number; decorrido?: number },
): Risco[] {
  const sobra = Math.min(4, o.fs * 0.25);
  const amplitude = o.amplitude ?? o.fs * 0.06;
  const total = linhas.reduce((s, l) => s + (l.right - l.left), 0);
  const durs = linhas.map((l) => Math.max(DURACAO_MINIMA, (DURACAO_DO_RISCO * (l.right - l.left)) / Math.max(total, 1)));
  // com o mínimo, o total passa de 0,4 s: as compridas encolhem para caber
  const soma = durs.reduce((s, x) => s + x, 0);
  const sobraDe = durs.filter((x) => x > DURACAO_MINIMA).reduce((s, x) => s + x, 0);
  const fator = soma > DURACAO_DO_RISCO && sobraDe > 0 ? Math.max(0, sobraDe - (soma - DURACAO_DO_RISCO)) / sobraDe : 1;
  let t = o.decorrido ? -o.decorrido : 0;
  return linhas.map((l, i) => {
    const dur = durs[i] > DURACAO_MINIMA ? Math.max(DURACAO_MINIMA, durs[i] * fator) : durs[i];
    const d = esticarRisco(o.tracos[((o.semente ?? 0) + i) % o.tracos.length], l.left - o.origem.x - sobra, l.right - o.origem.x + sobra, l.top - o.origem.y + o.meio, amplitude);
    const r = { d, dur, atraso: t };
    t += dur;
    return r;
  });
}

/* ---------- o desenho ---------- */

/** Um trecho riscado: os elementos dele (o mesmo trecho pode vir em pedaços), a semente do primeiro traço e, quando
 *  acabou de ser marcado, o instante da marca (performance.now()), para se escrever. */
export interface TrechoRiscado {
  elementos: Element[];
  semente?: number;
  desde?: number;
}

const metricas = new Map<string, { ascent: number; cap: number; xAltura: number } | null>();
let tela: CanvasRenderingContext2D | null | undefined;
function medirFonte(fonte: string) {
  if (!metricas.has(fonte)) {
    try {
      tela ??= document.createElement('canvas').getContext('2d');
    } catch {
      tela = null;
    }
    let m: { ascent: number; cap: number; xAltura: number } | null = null;
    if (tela) {
      tela.font = fonte;
      const h = tela.measureText('H');
      const x = tela.measureText('x');
      if (h.fontBoundingBoxAscent > 0 && h.actualBoundingBoxAscent > 0) m = { ascent: h.fontBoundingBoxAscent, cap: h.actualBoundingBoxAscent, xAltura: x.actualBoundingBoxAscent };
    }
    metricas.set(fonte, m);
  }
  return metricas.get(fonte) ?? null;
}

/** Desenha na camada os riscos dos trechos. A origem é o canto da própria camada (posta em left 0, top 0 do bloco). */
export function desenharRiscos(svg: SVGSVGElement, trechos: TrechoRiscado[], agora = performance.now()) {
  const o = svg.getBoundingClientRect();
  const paths: string[] = [];
  for (const t of trechos) {
    const el = t.elementos[0];
    if (!el) continue;
    const linhas = linhasDoTrecho(t.elementos.flatMap((e) => [...e.getClientRects()]));
    if (!linhas.length) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 16;
    const m = medirFonte(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`);
    const texto = t.elementos.map((e) => e.textContent ?? '').join('');
    // sem as medidas da fonte: o meio da caixa, um pouco acima (o meio das maiúsculas)
    const meio = m ? meioDasLetras(m, texto) : (linhas[0].bottom - linhas[0].top) / 2 - fs * 0.16;
    const decorrido = t.desde === undefined ? undefined : (agora - t.desde) / 1000;
    const escrever = decorrido !== undefined && decorrido < DURACAO_DO_RISCO;
    for (const r of tracarRiscos(linhas, { origem: { x: o.left, y: o.top }, meio, fs, tracos: RISCOS_DE_LINHA, semente: t.semente, decorrido: escrever ? decorrido : undefined }))
      paths.push(
        escrever
          ? `<path pathLength="1" class="escrever" style="--dur:${r.dur.toFixed(3)}s;--atraso:${r.atraso.toFixed(3)}s" d="${r.d}"/>`
          : `<path pathLength="1" d="${r.d}"/>`,
      );
  }
  const html = paths.join('');
  if (svg.innerHTML !== html) svg.innerHTML = html;
}

/** O bloco mais perto (o ResizeObserver não vê elementos em linha). */
function blocoDe(el: Element | null): Element | null {
  let e = el;
  while (e && getComputedStyle(e).display === 'inline') e = e.parentElement;
  return e;
}

/** Mantém a camada desenhada: na montagem, quando `assinatura` muda, quando o bloco em volta muda de tamanho e quando
 *  as fontes chegam. Devolve o `redesenhar` (estável, um por quadro), para quem sabe de outras mudanças (o editor). */
export function useCamadaDeRiscos(svg: React.RefObject<SVGSVGElement | null>, trechos: () => TrechoRiscado[], assinatura: string): () => void {
  const obter = useRef(trechos);
  obter.current = trechos;
  const quadro = useRef(0);
  const redesenhar = useCallback(() => {
    cancelAnimationFrame(quadro.current);
    quadro.current = requestAnimationFrame(() => svg.current && desenharRiscos(svg.current, obter.current()));
  }, [svg]);
  useLayoutEffect(() => {
    if (svg.current) desenharRiscos(svg.current, obter.current());
  }, [svg, assinatura]);
  useEffect(() => {
    const camada = svg.current;
    if (!camada) return;
    const alvo = blocoDe(camada.parentElement);
    const ro = typeof ResizeObserver === 'undefined' || !alvo ? null : new ResizeObserver(redesenhar);
    if (alvo) ro?.observe(alvo);
    let vivo = true;
    document.fonts?.ready.then(() => vivo && redesenhar());
    return () => {
      vivo = false;
      cancelAnimationFrame(quadro.current);
      ro?.disconnect();
    };
  }, [svg, redesenhar]);
  return redesenhar;
}

/** O instante em que cada chave entrou no conjunto (performance.now()), para o risco se escrever só na marca nova:
 *  o que já vem marcado ao abrir não se escreve. */
export function useDesdeDaMarca(chaves: Iterable<string>): Map<string, number> {
  const antes = useRef<Set<string> | null>(null);
  const desde = useRef(new Map<string, number>());
  const agora = new Set(chaves);
  if (antes.current) {
    const t = performance.now();
    for (const k of agora) if (!antes.current.has(k)) desde.current.set(k, t);
    for (const k of desde.current.keys()) if (!agora.has(k)) desde.current.delete(k);
  }
  antes.current = agora;
  return desde.current;
}
