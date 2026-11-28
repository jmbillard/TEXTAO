import type { CSSProperties, ReactNode, Ref } from 'react';

/*
  As peças comuns das comemorações (o Sem cadastro zerado, em Comemoracao.tsx, e a fila zerada, em FilaZerada.tsx):
  as curvas, o rabisco do risco, o sorteio com semente, a frase escrita à mão e o palco, que guarda cada animação e
  cada prazo da cena para desfazer tudo de uma vez ao desmontar.
*/

export const SUAVE = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** A cascata de entrada das listas e das colunas (#171), a mesma em todas as telas: o passo de um para o outro e
    quantos entram nela (os de depois chegam com o último). */
export const CASCATA_MS = 30;
export const NA_CASCATA = 12;
/** A curva da escrita à mão: começa devagar, corre no meio e assenta. */
export const ESCREVER = 'cubic-bezier(0.45, 0, 0.3, 1)';
/** O risco à mão, num viewBox de 100 × 14. */
export const RABISCO = 'M2 9 C 30 3, 70 4, 98 6 C 70 8, 40 10, 14 12';

/** Sorteio com semente (mulberry32): a mesma cena sempre sai igual. */
export function sorteio(semente: number) {
  return () => {
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface OpcoesDaAnimacao {
  dur?: number;
  delay?: number;
  easing?: string;
  fill?: FillMode;
}

/** O palco de uma cena: anima, marca prazos e desfaz tudo. Instantâneo (movimento reduzido), tudo vai direto ao fim. */
export interface Palco {
  instante: boolean;
  a(el: Element, kf: Keyframe[], o?: OpcoesDaAnimacao): Animation;
  at(ms: number, fn: () => void): void;
  /** O traço se desenha do começo ao fim. */
  tracar(p: SVGGeometryElement, dur: number, delay: number, easing?: string): Animation;
  desfazer(): void;
}

export function criarPalco(instante = false): Palco {
  const animacoes: Animation[] = [];
  const prazos: number[] = [];
  const palco: Palco = {
    instante,
    a(el, kf, o = {}) {
      const an = el.animate(kf, { duration: instante ? 0 : (o.dur ?? 400), delay: instante ? 0 : (o.delay ?? 0), easing: o.easing ?? SUAVE, fill: o.fill ?? 'both' });
      animacoes.push(an);
      return an;
    },
    at(ms, fn) {
      if (instante) fn();
      else prazos.push(window.setTimeout(fn, ms));
    },
    tracar(p, dur, delay, easing = ESCREVER) {
      p.setAttribute('pathLength', '1');
      p.style.strokeDasharray = '1 1.02';
      return palco.a(p, [{ strokeDashoffset: 1.01 }, { strokeDashoffset: 0 }], { dur, delay, easing });
    },
    desfazer() {
      for (const t of prazos) clearTimeout(t);
      for (const an of animacoes) an.cancel();
      prazos.length = animacoes.length = 0;
    },
  };
  return palco;
}

/** A frase à mão com o risco embaixo; `children` vem logo depois do risco (a linha de baixo do Sem cadastro). */
export function FraseAMao({ texto, ref, className, style, children }: { texto: string; ref?: Ref<HTMLDivElement>; className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div ref={ref} className={`frase${className ? ` ${className}` : ''}`} style={style}>
      <p className="mao">{texto}</p>
      <svg className="risco" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
        <path d={RABISCO} />
      </svg>
      {children}
    </div>
  );
}

/** A frase se escreve da esquerda para a direita a partir de `t` ms; o risco vem no fim da escrita. */
export function escreverFrase(palco: Palco, frase: Element, t: number) {
  palco.a(frase.querySelector('.mao')!, [{ clipPath: 'inset(-40% 100% -40% -10%)' }, { clipPath: 'inset(-40% -10% -40% -10%)' }], { dur: 720, delay: t, easing: ESCREVER });
  palco.a(frase.querySelector('.risco')!, [{ clipPath: 'inset(-50% 100% -50% -5%)' }, { clipPath: 'inset(-50% -5% -50% -5%)' }], { dur: 380, delay: t + 640, easing: ESCREVER });
}
