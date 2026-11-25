import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { criarPalco, escreverFrase, FraseAMao, sorteio, SUAVE } from './cena';
import type { Tira } from './regrasDaComemoracao';
import { semMovimento } from './util';

/*
  A comemoração de uma lista que zerou: a claquete gigante se desenha no meio da lista vazia e bate; na batida, as
  linhas de impacto aparecem e as tiras de papel (claquetes) e os picotes estouram da fresta, com as destacadas por
  cima, retas e legíveis; a claquete cai para fora do quadro, a frase se escreve à mão e os papéis caem e somem.
  O repouso é só a frase, o risco e a linha de baixo.

  Reaproveitável: quem usa passa a frase, a linha de baixo, as tiras e os campos da claquete. Sem animar (a lista
  já estava vazia, ou movimento reduzido), mostra direto o repouso.

  A física dos papéis é um laço de requestAnimationFrame; o resto, Web Animations. Tudo é desfeito ao desmontar.
*/

/** A linha do tempo, em ms desde que a cena monta (a última vaga da lista acabou de fechar). */
const T = { bate: 720, sai: 840, escreve: 1520, somem: 1920, fim: 2620 } as const;
/** A altura do palco enquanto a cena roda; no fim ele encolhe até o tamanho do repouso. */
const ALTURA_DO_PALCO = 320;

const CORES = ['--ultra', '--ok', '--producao', '--sonoplastia', '--locutor', '--edicao'];
/** A largura da claquete na tela; o desenho é de 200 × 170. */
const LARGURA_CLAQUETE = 220;

export interface CamposDaClaquete {
  /** O nome que vai na CENA (a atração que acabou de ser cadastrada). */
  cena: string;
  /** A data de hoje, curta ("25/11"). */
  data: string;
  /** O que vai no TAKE (o total); vazio enquanto não chegou. */
  take: string;
}

/** A hachura das listras da claquete (recortada pelo clipPath das listras). */
function hachura(x0: number, x1: number, yT: number, yB: number, passo: number) {
  let d = '';
  for (let x = x0 - 20; x < x1 + 10; x += passo) d += `M${x.toFixed(1)} ${yB} L${(x + 9).toFixed(1)} ${yT} `;
  return d;
}
/** As listras diagonais (o clipPath da hachura). */
function listras(yT: number, yB: number) {
  let d = '';
  for (let x = 14; x < 186; x += 30) {
    const a = Math.max(x, 14), b = Math.min(x + 15, 186);
    d += `M${a} ${yB} L${Math.min(a + 8, 186)} ${yT} L${Math.min(b + 8, 186)} ${yT} L${b} ${yB} Z `;
  }
  return d;
}
const HACH_CORPO = hachura(14, 186, 62, 84, 3.1);
const HACH_BRACO = hachura(14, 186, 39.5, 56.5, 3.1);
const LISTRAS_CORPO = listras(62, 84);
const LISTRAS_BRACO = listras(39.5, 56.5);
const IMPACTO = ['M194 46 L206 40', 'M195 55 L210 55', 'M194 64 L206 71', 'M8 48 L-3 41', 'M7 60 L-6 62'];

/** A claquete desenhada à mão, com a CENA, a data e o TAKE. */
function Claquete({ campos, uid, cena }: { campos: CamposDaClaquete; uid: string; cena: React.RefObject<SVGTextElement | null> }) {
  return (
    <svg viewBox="0 0 200 170" className="mao-livre" aria-hidden="true">
      <defs>
        <clipPath id={`lb-${uid}`}><path d={LISTRAS_CORPO} /></clipPath>
        <clipPath id={`la-${uid}`}><path d={LISTRAS_BRACO} /></clipPath>
      </defs>
      {/* o miolo opaco: a claquete passa por cima dos papéis sem deixar ver através */}
      <path className="fundo-claq" d="M14 61.5 L186.5 60.8 L187 162.6 L13.6 163.2 Z" />
      <g className="tracos">
        <path d="M14 61.5 C 60 60.6, 130 61.6, 186.5 60.8 C 187.3 95, 186.4 130, 187 162.6 C 130 163.6, 60 162.4, 13.6 163.2 C 14.5 130, 13.4 95, 14 61.5" />
        <path d="M14 84.5 C 70 83.4, 130 85, 186.6 83.6" />
        <path d="M14 113 C 80 112, 140 114.4, 186.8 112.8" />
        <path d="M101 113 C 101.6 130, 100.4 148, 101.2 162.8" />
        <path className="hach" d={HACH_CORPO} clipPath={`url(#lb-${uid})`} />
      </g>
      <g className="textos">
        <text x={24} y={106} fontSize={23}>PROMeiro</text>
        <text x={178} y={105} fontSize={17} textAnchor="end">{campos.data}</text>
        <text x={22} y={127} className="rotulo">CENA</text>
        <text ref={cena} x={22} y={152} fontSize={17}>{campos.cena}</text>
        <text x={110} y={127} className="rotulo">TAKE</text>
        <text x={110} y={155} fontSize={27} className="take">{campos.take}</text>
      </g>
      <g className="braco">
        <path className="fundo-claq" d="M14.5 57 L186.4 55.4 L186.6 38.4 L14.8 40 Z" />
        <g className="tracos">
          <path d="M14.5 57 C 70 56.2, 130 56.6, 186.4 55.4 C 186.8 49, 186.2 44, 186.6 38.4 C 130 39.4, 70 39.2, 14.8 40 C 14.4 46, 14.9 51, 14.5 57" />
          <path className="hach" d={HACH_BRACO} clipPath={`url(#la-${uid})`} />
          <circle cx={18} cy={58.5} r={3.6} />
        </g>
      </g>
      <g className="impacto">
        {IMPACTO.map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  );
}

type Peca = {
  el: HTMLDivElement;
  tira: boolean;
  destacada: boolean;
  ordem: number;
  w: number;
  h: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  giro: number;
  vgiro: number;
  fase: number;
  atraso: number;
};

/** A cena viva: monta tudo, roda a linha do tempo e devolve a função que desfaz tudo. */
function rodar(
  raiz: HTMLDivElement,
  claq: HTMLDivElement,
  confete: HTMLDivElement,
  frase: HTMLDivElement,
  tiras: Tira[],
  aoBater: (() => void) | undefined,
  aoAcabar: () => void,
) {
  const palco = criarPalco();
  const { a, at, tracar } = palco;
  let quadroId = 0;

  const W = raiz.clientWidth, H = raiz.clientHeight;
  const k = LARGURA_CLAQUETE / 200, ALT = 170 * k;
  const x0 = (W - LARGURA_CLAQUETE) / 2, y0 = (H - ALT) / 2 + 8;
  const svg = claq.querySelector('svg')!;
  claq.style.transform = `translate(${x0}px, ${y0}px)`;

  // a claquete se desenha
  svg.querySelectorAll<SVGGeometryElement>('.tracos path, .tracos circle').forEach((p, i) => tracar(p, 400, i * 32));
  svg.querySelectorAll('.fundo-claq').forEach((p) => a(p, [{ opacity: 0 }, { opacity: 1 }], { dur: 300, delay: 80 }));
  a(svg.querySelector('.textos')!, [{ opacity: 0 }, { opacity: 1 }], { dur: 320, delay: 260 });
  a(svg, [{ transform: 'translateY(18px)', opacity: 0 }, { transform: 'none', opacity: 1, offset: 0.4 }, { transform: 'none', opacity: 1 }], { dur: 560, delay: 0 });
  // bate: um respiro para trás e o braço desce
  a(svg.querySelector('.braco')!, [{ transform: 'rotate(-27deg)' }, { transform: 'rotate(-33deg)', offset: 0.5 }, { transform: 'rotate(1.5deg)', offset: 0.9 }, { transform: 'rotate(0deg)' }], {
    dur: 400,
    delay: T.bate - 370,
    easing: 'cubic-bezier(0.6, 0, 0.9, 0.5)',
  });
  svg.querySelectorAll<SVGPathElement>('.impacto path').forEach((p) => {
    p.setAttribute('pathLength', '1');
    p.style.strokeDasharray = '1 1.02';
    a(p, [{ strokeDashoffset: 1.01 }, { strokeDashoffset: 0, offset: 0.45 }, { strokeDashoffset: -1.01 }], { dur: 340, delay: T.bate, easing: 'ease-out' });
  });
  at(T.bate, () => aoBater?.());
  // sai de cena por baixo, como o claquetista tirando a claquete do quadro
  a(
    claq,
    [
      { transform: `translate(${x0}px, ${y0}px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${x0 - 6}px, ${y0 - 10}px) rotate(-2deg)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${x0 + 30}px, ${H + 30}px) rotate(9deg)`, opacity: 1, offset: 0.85 },
      { transform: `translate(${x0 + 34}px, ${H + 60}px) rotate(10deg)`, opacity: 0 },
    ],
    { dur: 640, delay: T.sai, easing: 'cubic-bezier(0.45, 0, 0.85, 0.4)' },
  );

  // a frase se escreve à mão; a linha de baixo entra quando chegar (ela tem o próprio efeito)
  escreverFrase(palco, frase, T.escreve);

  // o confete estoura da fresta da batida (entre o braço e o corpo da claquete)
  const fresta = { x: x0 + 100 * k, y: y0 + 58 * k, meia: 80 * k };
  at(T.bate, () => {
    quadroId = estourar(confete, tiras, fresta, W, (id) => (quadroId = id));
  });

  // no fim: os papéis já sumiram; o palco encolhe até o repouso
  at(T.fim, () => {
    const de = raiz.offsetHeight;
    raiz.style.minHeight = '';
    const para = raiz.offsetHeight;
    if (de !== para) a(raiz, [{ height: `${de}px` }, { height: `${para}px` }], { dur: 420, fill: 'none' });
    aoAcabar();
  });

  return () => {
    palco.desfazer();
    cancelAnimationFrame(quadroId);
    confete.replaceChildren();
  };
}

/** Os papéis: tiras (claquetes) e picotes. Devolve o primeiro pedido de quadro; os seguintes vão por `quadro`. */
function estourar(camada: HTMLDivElement, tiras: Tira[], fresta: { x: number; y: number; meia: number }, W: number, quadro: (id: number) => void) {
  const rnd = sorteio(11);
  const estreito = W < 520;
  const pecas: Peca[] = [];
  const nova = (cls: string) => {
    const el = document.createElement('div');
    el.className = cls;
    camada.appendChild(el);
    return el;
  };
  // as destacadas vão por último no DOM: voam por cima das outras
  const lista = tiras.slice(0, estreito ? 10 : 16);
  const comuns = lista.filter((t) => !t.destacada);
  const destacadas = lista.filter((t) => t.destacada);
  [...comuns, ...destacadas].forEach((t, i) => {
    const el = nova(`tira${t.destacada ? ' destacada' : ''}`);
    el.textContent = t.texto;
    pecas.push({ el, tira: true, destacada: t.destacada, ordem: i, w: el.offsetWidth, h: el.offsetHeight } as Peca);
  });
  for (let i = 0, n = estreito ? 24 : 34; i < n; i++) {
    const el = nova('picote');
    el.style.background = `var(${CORES[i % CORES.length]})`;
    pecas.push({ el, tira: false, destacada: false, ordem: 0, w: 7, h: 11 } as Peca);
  }
  for (const p of pecas) {
    // as destacadas saem primeiro, mais retas, para o alto do meio (dá para ler), uma para cada lado
    const iDest = p.destacada ? p.ordem - comuns.length : 0;
    const lado = p.destacada ? (iDest % 2 ? 1 : -1) * (0.35 + 0.25 * Math.floor(iDest / 2)) : (rnd() - 0.5) * 2;
    const ang = -Math.PI / 2 + lado * (p.destacada ? 0.9 : 1.15);
    const v = p.destacada ? (iDest % 2 ? 430 : 530) : (p.tira ? 260 : 320) + rnd() * rnd() * 560 + rnd() * 120;
    Object.assign(p, {
      x: fresta.x + lado * fresta.meia * (p.destacada ? 0.7 : 1),
      y: fresta.y + (rnd() - 0.5) * 6,
      vx: Math.cos(ang) * v * (p.destacada ? 1.4 : 2.1),
      vy: Math.sin(ang) * v * 1.12,
      rot: p.tira ? (rnd() - 0.5) * (p.destacada ? 10 : 26) : rnd() * 360,
      vr: (rnd() - 0.5) * (p.tira ? (p.destacada ? 30 : 90) : 900),
      giro: 0,
      vgiro: p.tira ? (p.destacada ? 0.6 + rnd() * 0.5 : 1.2 + rnd() * 1.8) : 8 + rnd() * 9,
      fase: rnd() * 6.28,
      atraso: p.destacada ? 0 : rnd() * 0.08,
    });
  }
  const passo = (dt: number, t: number) => {
    for (const p of pecas) {
      if (t < p.atraso) continue;
      const atrito = p.tira ? 4.4 : 5.2;
      p.vy += 1250 * dt;
      p.vx -= p.vx * atrito * dt;
      p.vy -= p.vy * atrito * dt * (p.vy > 0 ? 1 : 0.55);
      p.x += (p.vx + Math.sin(t * 5 + p.fase) * (p.tira ? 36 : 64)) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.tira) p.vr -= p.rot * 5 * dt + p.vr * 0.6 * dt;
      p.giro += p.vgiro * dt;
      // as paredes e o teto seguram os papéis; o chão não: eles caem para fora
      if (p.x < p.w / 2 + 4) {
        p.x = p.w / 2 + 4;
        p.vx = Math.abs(p.vx) * 0.35;
      }
      if (p.x > W - p.w / 2 - 4) {
        p.x = W - p.w / 2 - 4;
        p.vx = -Math.abs(p.vx) * 0.35;
      }
      if (p.y < p.h / 2 + 6) {
        p.y = p.h / 2 + 6;
        p.vy = Math.abs(p.vy) * 0.25;
      }
    }
  };
  // somem juntos, num esmaecer comum, depois que a frase já está escrita
  const fade0 = (T.somem - T.bate) / 1000, fade1 = (T.fim - T.bate) / 1000;
  const desenhar = (t: number) => {
    const alfa = Math.max(0, Math.min(1, 1 - (t - fade0) / (fade1 - fade0)));
    for (const p of pecas) {
      const c = Math.cos(p.giro);
      const sy = Math.sign(c || 1) * Math.max(0.08, Math.abs(c));
      p.el.style.transform = `translate(${(p.x - p.w / 2).toFixed(1)}px, ${(p.y - p.h / 2).toFixed(1)}px) rotate(${p.rot.toFixed(1)}deg) scaleY(${sy.toFixed(3)})`;
      p.el.style.opacity = String(t < p.atraso ? 0 : alfa);
      if (p.tira) p.el.classList.toggle('verso', c < 0);
    }
    return alfa > 0;
  };
  let ultimo: number | null = null, t = 0;
  const laco = (agora: number) => {
    const dt = ultimo == null ? 1 / 60 : Math.min(0.033, (agora - ultimo) / 1000);
    ultimo = agora;
    t += dt;
    passo(dt, t);
    if (desenhar(t)) quadro(requestAnimationFrame(laco));
    else camada.replaceChildren();
  };
  desenhar(0);
  return requestAnimationFrame(laco);
}

/**
 * A comemoração de uma lista que zerou.
 * @param animar roda a cena (só na hora em que a lista zera); falso mostra direto o repouso. Lido só ao montar.
 * @param linha a linha de baixo; null enquanto não chegou (o lugar fica guardado e ela entra quando chegar)
 * @param aoBater na batida da claquete (quem usa faz a lista tremer de leve)
 * @param aoAcabar quando a cena termina e fica só o repouso
 */
export function Comemoracao({
  frase,
  linha,
  tiras,
  claquete,
  animar,
  aoBater,
  aoAcabar,
}: {
  frase: string;
  linha: ReactNode | null;
  tiras: Tira[];
  claquete: CamposDaClaquete;
  animar: boolean;
  aoBater?: () => void;
  aoAcabar?: () => void;
}) {
  const [rodando, setRodando] = useState(() => animar && !semMovimento());
  const raiz = useRef<HTMLDivElement>(null);
  const claq = useRef<HTMLDivElement>(null);
  const confete = useRef<HTMLDivElement>(null);
  const fraseEl = useRef<HTMLDivElement>(null);
  const linhaEl = useRef<HTMLParagraphElement>(null);
  const cena = useRef<SVGTextElement>(null);
  const inicio = useRef(0);
  const uid = `claq-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // o que muda depois de montar não reinicia a cena
  const fixos = useRef({ tiras, aoBater, aoAcabar });
  fixos.current = { tiras, aoBater, aoAcabar };

  useLayoutEffect(() => {
    if (!rodando) return;
    const el = raiz.current!;
    inicio.current = performance.now();
    el.style.minHeight = `${ALTURA_DO_PALCO}px`;
    // o nome da atração precisa caber na CENA
    const c = cena.current;
    if (c && c.getComputedTextLength() > 74) {
      c.setAttribute('textLength', '74');
      c.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
    const desfazer = rodar(el, claq.current!, confete.current!, fraseEl.current!, fixos.current.tiras, () => fixos.current.aoBater?.(), () => {
      setRodando(false);
      fixos.current.aoAcabar?.();
    });
    return () => {
      desfazer();
      el.style.minHeight = '';
    };
  }, []);

  // a linha de baixo entra depois da frase; se chegar atrasada, entra quando chegar (sem número errado no meio)
  const temLinha = linha != null;
  useLayoutEffect(() => {
    const el = linhaEl.current;
    if (!temLinha || !el || !inicio.current) return;
    const falta = inicio.current + T.escreve + 700 - performance.now();
    const an = el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: Math.max(0, falta), easing: SUAVE, fill: 'backwards' });
    return () => an.cancel();
  }, [temLinha]);

  return (
    <div ref={raiz} className="comemoracao">
      <FraseAMao ref={fraseEl} texto={frase}>
        <p ref={linhaEl} className="linha">{linha ?? ' '}</p>
      </FraseAMao>
      {rodando && (
        <>
          <div ref={claq} className="claq-gigante">
            <Claquete campos={claquete} uid={uid} cena={cena} />
          </div>
          <div ref={confete} className="confete" aria-hidden="true" />
        </>
      )}
    </div>
  );
}

/** A lista treme de leve na batida (quem usa a comemoração passa isto no aoBater). */
export function tremerDeLeve(el: HTMLElement | null, px = 7) {
  if (!el || semMovimento()) return;
  const passos = [0, -1, 0.85, -0.6, 0.35, -0.15, 0];
  el.animate(
    passos.map((f, i) => ({ transform: `translate(${(f * px).toFixed(1)}px, ${((i % 2 ? 0.45 : -0.3) * f * px).toFixed(1)}px)` })),
    { duration: 340, easing: 'linear' },
  );
}
