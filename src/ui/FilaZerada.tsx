import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { criarPalco, escreverFrase, FraseAMao, RABISCO, sorteio, SUAVE, type Palco } from './cena';
import { escolherCena, memoriaDaFila, type Cena } from './filaZerada';
import { CHAMA_DA_VELA } from './fogo';
import { plural, semMovimento } from './util';

/*
  A comemoração da fila zerada: a última ficha sai, o título vira "Fila em dia" e, entre o título e o No Trello, uma
  área abre para a cena (os fogos à mão ou o avião de papel, sorteados sem repetir a última). Uns 3,3 s depois a área
  fecha, o No Trello sobe e fica só o risco laranja à mão embaixo de "Fila em dia", que some quando o título muda.
  Dentro dos 15 minutos da última cena, só o risco. Com movimento reduzido, o fim da cena aparece parado, fica uns
  3 s e some num esmaecer, já com o risco no título.

  As regras (quando comemora, a janela, o sorteio e a memória da fila) ficam em filaZerada.ts; aqui, o hook que liga
  a regra à Biblioteca e as cenas desenhadas.
*/

/** A linha do tempo, em ms desde que a área começa a abrir. */
const T = { cena: 400, recolhe: 3700, fechou: 4400 } as const;
/** Movimento reduzido: o quanto o estado final fica parado e o esmaecer. */
const PARADO = { fica: 3000, some: 320 } as const;
/** A altura da área da cena. */
const ALTURA = 300;
/** A frase de cada cena, a altura dela na área (em fração) e quando ela começa a se escrever. */
const FRASES: Record<Cena, { texto: string; y: number; t: number }> = {
  fogos: { texto: 'Zerou a fila!', y: 0.74, t: 1450 },
  aviao: { texto: 'Foi! Fila em dia.', y: 0.5, t: 1950 },
};

type Fase = 'esperando' | 'cena' | 'recolhendo' | 'risco';

interface Festa {
  n: number;
  /** null: dentro da janela de 15 min, só o risco */
  cena: Cena | null;
  /** o texto do bilhete que vira avião: a claquete da última ficha, ou "3 roteiros" quando zerou de uma vez */
  bilhete: string;
  fase: Fase;
  /** começou na hora em que zerou (e não esperando a tela voltar): o título entra com um esmaecer */
  naHora: boolean;
}

export interface FilaZerada {
  festa: Festa | null;
  recolher: (n: number) => void;
  acabar: (n: number) => void;
}

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ateAmanha = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime() + 1000;
};
const telaVisivel = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/**
 * Liga a regra da fila zerada à Biblioteca. Chame logo depois de contar os pendentes.
 * @param pronto a fila já foi lida e nada está sendo lido agora (com um roteiro sendo lido, não comemora)
 * @param saindo o roteiro tirado da fila, com o desfazer aberto (tirar a última não comemora)
 * @param aoFundo a comparação está aberta por cima: a cena espera e toca quando a tela volta
 * @param ultima a claquete do único pendente, quando só sobra um (vira o bilhete do avião)
 */
export function useFilaZerada(
  nPendentes: number,
  { pronto, saindo, aoFundo, ultima }: { pronto: boolean; saindo: object | null; aoFundo: boolean; ultima?: string },
): FilaZerada {
  const [festa, setFesta] = useState<Festa | null>(null);
  const [visivel, setVisivel] = useState(telaVisivel);
  const tirando = saindo != null;
  const hoje = isoLocal(new Date());
  // a virada do dia: a fila se relê à meia-noite (o pendente que foi ao ar sai da conta sem comemorar)
  const [, virar] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const t = setTimeout(virar, ateAmanha());
    return () => clearTimeout(t);
  }, [hoje]);
  useEffect(() => {
    const ver = () => setVisivel(telaVisivel());
    document.addEventListener('visibilitychange', ver);
    return () => document.removeEventListener('visibilitychange', ver);
  }, []);

  // a regra roda antes da pintura: o título que acabou de virar "Fila em dia" já entra com a festa
  const agora = useRef({ visivel, aoFundo });
  agora.current = { visivel, aoFundo };
  const valendo = pronto && nPendentes === 0;
  useLayoutEffect(() => {
    // o título mudou (chegou roteiro, ou está lendo um): a festa acaba e o risco some
    if (!valendo) setFesta(null);
    if (!pronto) return;
    const zerou = memoriaDaFila.ler({ conta: nPendentes, hoje, tirando, ultima });
    if (!zerou) return;
    const cena = escolherCena(Date.now(), Math.random);
    const ja = agora.current.visivel && !agora.current.aoFundo;
    setFesta({
      n: performance.now(),
      cena,
      bilhete: zerou.ultima ?? plural(zerou.antes, 'roteiro', 'roteiros'),
      fase: ja ? (cena ? 'cena' : 'risco') : 'esperando',
      naHora: ja,
    });
  }, [nPendentes, pronto, valendo, tirando, hoje, ultima]);

  // a tela voltou (a aba à vista, a comparação fechada): a cena que esperava toca agora
  useEffect(() => {
    if (festa?.fase !== 'esperando' || !visivel || aoFundo) return;
    setFesta((f) => f && f.fase === 'esperando' ? { ...f, fase: f.cena ? 'cena' : 'risco' } : f);
  }, [festa?.fase, visivel, aoFundo]);

  const mudar = (n: number, fase: Fase) => setFesta((f) => (f && f.n === n ? { ...f, fase } : f));
  return {
    festa: valendo ? festa : null,
    recolher: (n) => mudar(n, 'recolhendo'),
    acabar: (n) => mudar(n, 'risco'),
  };
}

/** "Fila em dia", com o risco laranja à mão embaixo depois da festa. */
export function TituloEmDia({ z }: { z: FilaZerada }) {
  const { festa } = z;
  const el = useRef<HTMLSpanElement>(null);
  const risco = useRef<SVGPathElement>(null);
  const comRisco = !!festa && (festa.fase === 'recolhendo' || festa.fase === 'risco');
  // o título acabou de virar: entra num esmaecer curto, em vez de trocar de estalo
  const entra = festa?.naHora ? festa.n : 0;
  useLayoutEffect(() => {
    if (!entra || semMovimento()) return;
    const an = el.current?.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: SUAVE, fill: 'backwards' });
    return () => an?.cancel();
  }, [entra]);
  // o risco se escreve: depois da cena, enquanto a área fecha; sem cena, logo
  const atraso = festa?.cena ? 220 : 120;
  useLayoutEffect(() => {
    const p = risco.current;
    if (!comRisco || !p || semMovimento()) return;
    const an = criarPalco().tracar(p, 460, atraso);
    return () => an.cancel();
  }, [comRisco, atraso]);
  return (
    <span ref={el} className="fila-em-dia">
      Fila em dia
      {comRisco && (
        <svg className="risco-titulo" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
          <path ref={risco} d={RABISCO} />
        </svg>
      )}
    </span>
  );
}

/** A área da cena, entre o título e o No Trello. */
export function CenaDaFilaZerada({ z }: { z: FilaZerada }) {
  const { festa } = z;
  if (!festa?.cena || (festa.fase !== 'cena' && festa.fase !== 'recolhendo')) return null;
  return <Area key={festa.n} n={festa.n} cena={festa.cena} bilhete={festa.bilhete} recolher={z.recolher} acabar={z.acabar} />;
}

function Area({ n, cena, bilhete, recolher, acabar }: { n: number; cena: Cena; bilhete: string; recolher: (n: number) => void; acabar: (n: number) => void }) {
  const area = useRef<HTMLDivElement>(null);
  const quadro = useRef<HTMLDivElement>(null);
  const camada = useRef<HTMLDivElement>(null);
  const frase = useRef<HTMLDivElement>(null);
  const fixos = useRef({ recolher, acabar });
  fixos.current = { recolher, acabar };
  const f = FRASES[cena];

  useLayoutEffect(() => {
    const el = area.current!, q = quadro.current!, c = camada.current!, fr = frase.current!;
    const parado = semMovimento();
    const palco = criarPalco(parado);
    const prazos: number[] = [];
    const depois = (ms: number, fn: () => void) => prazos.push(window.setTimeout(fn, ms));
    const animacoes: Animation[] = [];
    const W = c.clientWidth;
    const desenhar = () => (cena === 'fogos' ? fogos(c, palco, W, ALTURA, W < 560, fr) : aviao(c, palco, W, ALTURA, W < 560, bilhete));

    el.style.height = `${ALTURA}px`;
    if (parado) {
      // o estado final, parado, já com o risco no título; depois some num esmaecer
      escreverFrase(palco, fr, 0);
      desenhar();
      fixos.current.recolher(n);
      depois(PARADO.fica, () => animacoes.push(q.animate([{ opacity: 1 }, { opacity: 0 }], { duration: PARADO.some, fill: 'forwards' })));
      depois(PARADO.fica + PARADO.some, () => fixos.current.acabar(n));
    } else {
      // a área abre enquanto a vaga da última ficha fecha; a cena começa com ela aberta
      animacoes.push(el.animate([{ height: '0px' }, { height: `${ALTURA}px` }], { duration: T.cena, easing: SUAVE }));
      escreverFrase(palco, fr, T.cena + f.t);
      depois(T.cena, desenhar);
      // o fim: a cena esmaece, a área fecha (o No Trello sobe) e o risco se escreve no título
      depois(T.recolhe, () => {
        fixos.current.recolher(n);
        animacoes.push(q.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, easing: 'ease-out', fill: 'forwards' }));
        animacoes.push(el.animate([{ height: `${ALTURA}px` }, { height: '0px' }], { duration: 520, delay: 160, easing: SUAVE, fill: 'forwards' }));
      });
      depois(T.fechou, () => fixos.current.acabar(n));
    }
    return () => {
      for (const t of prazos) clearTimeout(t);
      for (const a of animacoes) a.cancel();
      palco.desfazer();
      c.replaceChildren();
      el.style.height = '';
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={area} className="fila-festa" aria-hidden="true">
      <div ref={quadro} className="fila-festa-quadro">
        <div ref={camada} className="fila-festa-camada" />
        <FraseAMao ref={frase} texto={f.texto} style={{ top: `${f.y * 100}%` }} />
      </div>
    </div>
  );
}

/* ---------- as cenas: desenho em DOM e SVG, animado pelo palco ---------- */

const SVGNS = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, pai: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  pai.appendChild(e);
  return e;
}
function h(tag: string, cls: string, pai: Element, html?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (html != null) e.innerHTML = html;
  pai.appendChild(e);
  return e;
}

/** Os fogos à mão: rojões em traço que estouram em chamas da vela (o fogo BAIXA da complexidade) e as estrelinhas rabiscadas. */
function fogos(camada: HTMLElement, p: Palco, W: number, H: number, celular: boolean, frase: HTMLElement) {
  const rnd = sorteio(5 * 977 + 13);
  const svg = s('svg', { class: 'fogos', viewBox: `0 0 ${W} ${H}` }, camada);
  const m = celular ? 0.72 : 1;
  const bombas = [
    { t: 0, x0: W * 0.3, bx: W * 0.25, by: 92, cor: '--ultra', R: 54, n: 12, esc: 2.2 },
    { t: 260, x0: W * 0.62, bx: W * 0.73, by: 80, cor: '--producao', R: 60, n: 13, esc: 2.4 },
    { t: 520, x0: W * 0.48, bx: W * 0.5, by: 62, cor: '--ok', R: 44, n: 11, esc: 1.9 },
    { t: 800, x0: W * 0.85, bx: W * 0.88, by: 128, cor: '--sonoplastia', R: 34, n: 10, esc: 1.6 },
    { t: 980, x0: W * 0.12, bx: W * 0.1, by: 70, cor: '--locutor', R: 32, n: 9, esc: 1.5 },
  ];
  for (const b of bombas) {
    const cor = `var(${b.cor})`;
    const R0 = b.R * m, esc = b.esc * (celular ? 0.8 : 1);
    const g = s('g', {}, svg);
    // o rojão sobe num traço curto, deixando o rastro para trás
    const rastro = s('path', { d: `M${b.x0} ${H + 6} C ${b.x0 + 10} ${H * 0.7}, ${b.bx - 12} ${b.by + 70}, ${b.bx} ${b.by}`, stroke: cor, 'stroke-width': 2, pathLength: 1 }, g);
    rastro.style.strokeDasharray = '0.2 2';
    p.a(rastro, [{ strokeDashoffset: 0.2 }, { strokeDashoffset: -0.8, offset: 0.75 }, { strokeDashoffset: -1.01 }], { dur: 520, delay: b.t, easing: 'cubic-bezier(0.25, 0.6, 0.45, 1)' });
    const tb = b.t + 390;
    const cai = s('g', {}, g);
    p.a(cai, [{ transform: 'translateY(0)' }, { transform: 'translateY(16px)' }], { dur: 1150, delay: tb, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' });
    for (let i = 0; i < b.n; i++) {
      const th = (360 * i) / b.n + (rnd() - 0.5) * 12;
      const raio = s('g', { transform: `translate(${b.bx} ${b.by}) rotate(${th.toFixed(1)})` }, cai);
      const sobe = s('g', {}, raio);
      // a chama da vela, com a ponta para fora
      const chama = s('path', { d: CHAMA_DA_VELA, transform: 'translate(-5.1 -16.5)', stroke: cor, 'stroke-width': 1.1 }, sobe);
      const R = R0 * (0.85 + rnd() * 0.3);
      p.a(sobe, [
        { transform: 'translateY(-2px) scale(0.2)', opacity: 0 },
        { opacity: 1, offset: 0.04 },
        { transform: `translateY(${-R}px) scale(${esc * 0.8}, ${esc * 1.25})`, opacity: 1, offset: 0.45 },
        { transform: `translateY(${-R * 1.2}px) scale(${esc * 0.5}, ${esc * 0.9})`, opacity: 0 },
      ], { dur: 1100, delay: tb, easing: 'cubic-bezier(0.15, 0.75, 0.35, 1)' });
      p.tracar(chama, 260, tb);
      const rr = s('path', { d: `M0 ${-(R * 0.2).toFixed(1)} L0 ${-(R * 0.78).toFixed(1)}`, stroke: cor, 'stroke-width': 1.4, pathLength: 1 }, raio);
      rr.style.strokeDasharray = '1 1.02';
      p.a(rr, [{ strokeDashoffset: 1.01 }, { strokeDashoffset: 0, offset: 0.35 }, { strokeDashoffset: -1.01 }], { dur: 520, delay: tb, easing: 'ease-out' });
      const fa = s('path', { d: `M0 ${-(R * 1.1).toFixed(1)} L0 ${-(R * 1.55).toFixed(1)}`, transform: `translate(${b.bx} ${b.by}) rotate(${(th + 180 / b.n).toFixed(1)})`, stroke: cor, 'stroke-width': 1.6, pathLength: 1 }, cai);
      fa.style.strokeDasharray = '1 1.02';
      p.a(fa, [{ strokeDashoffset: 1.01 }, { strokeDashoffset: 0, offset: 0.4 }, { strokeDashoffset: -1.01 }], { dur: 560, delay: tb + 90, easing: 'ease-out' });
    }
  }
  // as estrelinhas rabiscadas em volta da frase, depois que ela se escreve
  const caixa = camada.getBoundingClientRect(), fr = frase.querySelector('.mao')!.getBoundingClientRect();
  const lugares = [
    { x: fr.left - caixa.left - 22, y: fr.top - caixa.top - 2, cor: '--ultra', r: 9 },
    { x: fr.right - caixa.left + 16, y: fr.top - caixa.top - 12, cor: '--producao', r: 11 },
    { x: fr.right - caixa.left + 30, y: fr.top - caixa.top + 22, cor: '--ok', r: 6 },
    { x: fr.left - caixa.left - 6, y: fr.top - caixa.top - 26, cor: '--sonoplastia', r: 6 },
  ];
  lugares.forEach((l, i) => {
    const e = s('svg', { class: 'estrela', viewBox: '-10 -10 20 20' }, camada);
    e.style.left = `${l.x - 10}px`;
    e.style.top = `${l.y - 10}px`;
    e.style.color = `var(${l.cor})`;
    for (const a of [0, 60, 120]) {
      const rad = ((a + 12) * Math.PI) / 180;
      const c = Math.cos(rad) * l.r, sn = Math.sin(rad) * l.r;
      p.tracar(s('path', { d: `M${(-c).toFixed(1)} ${(-sn).toFixed(1)} L${c.toFixed(1)} ${sn.toFixed(1)}`, stroke: 'currentColor' }, e), 180, 2100 + i * 110 + a);
    }
  });
}

/** O avião de papel: a última ficha vira bilhete, dobra em avião, dá uma volta com rastro tracejado e sai pela direita. */
function aviao(camada: HTMLElement, p: Palco, W: number, H: number, celular: boolean, texto: string) {
  // começa onde a ficha estava (o alto da área, logo abaixo da vaga que fechou)
  const x0 = celular ? 70 : 120, y0 = celular ? 62 : 58;
  const r = celular ? 46 : 58;
  const cx = celular ? W * 0.5 : W * 0.36, cy = celular ? H * 0.42 : H * 0.48;
  const d =
    `M ${x0} ${y0} C ${x0 + 90} ${y0 + 10}, ${cx - 150} ${cy + r + 10}, ${cx} ${cy + r}` +
    ` C ${cx + r * 1.35} ${cy + r}, ${cx + r * 1.35} ${cy - r}, ${cx} ${cy - r}` +
    ` C ${cx - r * 1.35} ${cy - r}, ${cx - r * 1.35} ${cy + r}, ${cx + 6} ${cy + r}` +
    ` C ${cx + 140} ${cy + r}, ${W - 110} ${H * 0.2}, ${W + 70} ${-40}`;
  const svg = s('svg', { class: 'voo', viewBox: `0 0 ${W} ${H}` }, camada);
  // o rastro tracejado aparece atrás do avião (uma máscara que se desenha junto com o voo)
  const id = `voo-${Math.random().toString(36).slice(2)}`;
  const mascara = s('mask', { id, maskUnits: 'userSpaceOnUse', x: -200, y: -200, width: W + 400, height: H + 400 }, s('defs', {}, svg));
  const mp = s('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 10, pathLength: 1 }, mascara);
  mp.style.strokeDasharray = '1 1.02';
  const rastro = s('path', { d, class: 'rastro', mask: `url(#${id})` }, svg);

  const bilhete = h('div', 'bilhete', camada);
  bilhete.textContent = texto;
  bilhete.style.left = `${x0 - 30}px`;
  bilhete.style.top = `${y0 - 14}px`;
  const av = h(
    'div',
    'aviao',
    camada,
    '<svg viewBox="0 0 50 30"><path class="asa" d="M48 13 L17 15.5 L11 26 Z"/><path class="corpo" d="M48 13 L2 3.5 L17 15.5 Z"/><path class="dobra" d="M48 13 L17 15.5"/></svg>',
  );
  av.style.setProperty('offset-path', `path('${d}')`);
  // dobra: o bilhete achata e some; o avião abre no mesmo lugar
  p.a(bilhete, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { dur: 160 });
  p.a(bilhete, [{ transform: 'none', opacity: 1 }, { transform: 'scale(0.35, 0.15) rotate(-12deg)', opacity: 0 }], { dur: 260, delay: 220, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)', fill: 'forwards' });
  const VOO = 1650, tVoo = 400, curva = 'cubic-bezier(0.42, 0.05, 0.45, 1)';
  p.a(av, [{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'scale(1)' }], { dur: 220, delay: 300 });
  p.a(av, [{ offsetDistance: '0%' }, { offsetDistance: '100%' }], { dur: VOO, delay: tVoo, easing: curva });
  p.a(mp, [{ strokeDashoffset: 1.01 }, { strokeDashoffset: 0 }], { dur: VOO, delay: tVoo, easing: curva });
  // o rastro se apaga depois que o avião sai
  p.a(rastro, [{ opacity: 1 }, { opacity: 0 }], { dur: 520, delay: tVoo + VOO - 300, easing: 'ease-in' });
}
