import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CONVITE, FIM, aceita, comecar, PASSOS, passoAtual, pular, seguir, terminar, type Acao, type IdDoPasso, type Tour } from './passos';
import { ID_DO_EXEMPLO } from './exemplo';

/* O desenho do tour da revisão: o balão de papel com a anotação à mão, o laço à mão por fora do alvo, o véu leve no
   resto da tela e a seta, só quando cabe. Quem decide em que passo o tour está é a sequência (passos.ts); aqui fica só
   onde cada passo aponta e qual clique da pessoa conta como a ação dele. */

interface Props {
  tour: Tour;
  mudar: (t: Tour) => void;
  /** Colar do Word, Escolher arquivos ou Ctrl+V no passo chegar: o exemplo entra na fila, sem ler arquivo nenhum. */
  trazerExemplo: () => void;
}

interface Retangulo {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Desenho {
  /** O que o laço circula e o véu deixa à vista. */
  alvo?: () => Element | null;
  /** Ao lado de quem o balão fica (sem alvo, ou quando é outro). */
  ancora?: () => Element | null;
  seta?: boolean;
  /** O clique dentro do alvo que vale como ação do passo (null: um clique fora do lugar). */
  acaoDoClique?: (el: Element) => Acao | null;
  /** O alvo está pronto para ser mostrado (a ficha que chega termina de se montar antes). */
  pronto?: (alvo: Element) => boolean;
}

const conviteDeSoltar = () => document.querySelector('.convite-compacto, .fila-vazia');
const fichaDoExemplo = () => document.querySelector(`.ficha[data-ancora="ficha:${ID_DO_EXEMPLO}"]`);

/** Onde cada passo aponta. Os passos do editor e do envio entram nos próximos tickets (#35, #36). */
const DESENHOS: Partial<Record<IdDoPasso, Desenho>> = {
  chegar: {
    alvo: conviteDeSoltar,
    seta: true,
    // os dois botões e a própria área do convite (que abriria o seletor de arquivos)
    acaoDoClique: (el) => (el.closest('[aria-keyshortcuts], .convite-acoes .botao-texto:not(.escolher)') ? 'colar' : 'escolher-arquivo'),
  },
  fila: {
    alvo: fichaDoExemplo,
    seta: true,
    acaoDoClique: (el) => (el.closest('.ficha-acoes .botao, .ficha-claquete') ? 'revisar' : null),
    pronto: (ficha) => ficha.classList.contains('montada'),
  },
};
/** O convite e a despedida: o balão ao lado do convite de soltar, sem laço. */
const AO_LADO_DO_CONVITE: Desenho = { ancora: conviteDeSoltar };
/** A ficha nova acaba de se montar: o círculo das artes ainda está sendo desenhado. */
const ESPERA_DEPOIS_DE_MONTAR_MS = 1250;

/** Um laço à mão em volta de um retângulo: cantos arredondados, lados que cedem um pouco e a ponta que passa do começo. */
function laco(x: number, y: number, w: number, h: number, semente: number) {
  let k = semente * 7 + 3;
  const t = () => ((k = (k * 9301 + 49297) % 233280) / 233280 - 0.5) * 2.4;
  const r = Math.min(h / 2, 16);
  const f = (n: number) => n.toFixed(1);
  return [
    `M${f(x + r + 4)} ${f(y - 1 + t())}`,
    `C${f(x + w * 0.35)} ${f(y - 2 + t())}, ${f(x + w * 0.65)} ${f(y + 1 + t())}, ${f(x + w - r)} ${f(y + t() * 0.5)}`,
    `Q${f(x + w + 1)} ${f(y)}, ${f(x + w + 1 + t() * 0.5)} ${f(y + r)}`,
    `C${f(x + w + 2 + t())} ${f(y + h * 0.4)}, ${f(x + w + t())} ${f(y + h * 0.6)}, ${f(x + w)} ${f(y + h - r)}`,
    `Q${f(x + w)} ${f(y + h + 1)}, ${f(x + w - r)} ${f(y + h + 1)}`,
    `C${f(x + w * 0.62)} ${f(y + h + 2 + t())}, ${f(x + w * 0.36)} ${f(y + h + t())}, ${f(x + r)} ${f(y + h + 0.5)}`,
    `Q${f(x - 1)} ${f(y + h)}, ${f(x - 1 + t() * 0.5)} ${f(y + h - r)}`,
    `C${f(x - 2 + t())} ${f(y + h * 0.6)}, ${f(x + t())} ${f(y + h * 0.4)}, ${f(x)} ${f(y + r)}`,
    `Q${f(x + 1)} ${f(y - 3)}, ${f(x + r + 10)} ${f(y - 3)}`,
    `L${f(x + r + Math.min(46, w * 0.3))} ${f(y - 1.5)}`,
  ].join(' ');
}

interface Geometria {
  buraco: Retangulo | null;
  laco: string;
  balao: { x: number; y: number };
  seta: { corpo: string; ponta: string } | null;
}

const sobrepoe = (a: Retangulo, b: Retangulo) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

/** O balão à direita do alvo (e, se não couber sem cobri-lo, embaixo), o laço por fora e a seta do balão até o laço. */
function medir(alvo: Element | null, ancora: Element | null, balao: { w: number; h: number }, comSeta: boolean, semente: number): Geometria {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let buraco: Retangulo | null = null;
  let c: { x: number; y: number; w: number; h: number } | null = null;
  if (alvo) {
    const r = alvo.getBoundingClientRect();
    const p = 6;
    buraco = { left: r.left - p, top: r.top - p, width: r.width + 2 * p, height: r.height + 2 * p };
    c = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.max(r.width + 20, 34), h: Math.max(r.height + 16, 30) };
  }
  const a = (ancora ?? alvo)?.getBoundingClientRect() ?? { left: vw / 2, right: vw / 2, top: vh / 2, bottom: vh / 2, width: 0, height: 0 };
  const dentro = (x: number, y: number) => ({ x: Math.min(Math.max(12, x), vw - balao.w - 12), y: Math.min(Math.max(12, y), vh - balao.h - 60) });
  let pos = dentro((c ? Math.max(a.right, c.x + c.w / 2) : a.right) + 44, a.top + a.height / 2 - balao.h / 2);
  // o balão nunca cobre o alvo: sem espaço à direita, ele desce para baixo do alvo
  const ocupado = c ? { left: c.x - c.w / 2, top: c.y - c.h / 2, width: c.w, height: c.h } : null;
  if (ocupado && sobrepoe({ left: pos.x, top: pos.y, width: balao.w, height: balao.h }, ocupado)) pos = dentro(a.right - balao.w, ocupado.top + ocupado.height + 34);

  let seta: Geometria['seta'] = null;
  if (c && comSeta) {
    const B = balao;
    const bx = pos.x + B.w / 2;
    const by = pos.y + B.h / 2;
    const dx = c.x - bx;
    const dy = c.y - by;
    // onde a reta do centro do balão ao alvo sai do balão
    const k = Math.min(Math.abs(B.w / 2 / (dx || 1e-6)), Math.abs(B.h / 2 / (dy || 1e-6)));
    const len0 = Math.hypot(dx, dy) || 1;
    const s = { x: bx + dx * k + (dx / len0) * 8, y: by + dy * k + (dy / len0) * 8 };
    const L = Math.hypot(c.x - s.x, c.y - s.y) || 1;
    const nx = -(c.y - s.y) / L;
    const ny = (c.x - s.x) / L;
    // a curva cede para baixo (seta deitada) ou para a esquerda (seta em pé), como quem desenha à mão
    let curva = 0.12 * L;
    if (Math.abs(dx) > Math.abs(dy) ? ny * curva < 0 : nx * curva > 0) curva = -curva;
    const ctrl = { x: (s.x + c.x) / 2 + nx * curva, y: (s.y + c.y) / 2 + ny * curva };
    // termina na borda do laço, do lado de onde a seta vem
    const ang = Math.atan2(s.y - c.y, s.x - c.x);
    const re = Math.min(c.w / 2 / Math.max(Math.abs(Math.cos(ang)), 1e-6), c.h / 2 / Math.max(Math.abs(Math.sin(ang)), 1e-6)) + 7;
    const e = { x: c.x + Math.cos(ang) * re, y: c.y + Math.sin(ang) * re };
    // só quando há espaço entre o balão e o laço
    if (Math.hypot(e.x - s.x, e.y - s.y) > 46) {
      const tx = e.x - ctrl.x;
      const ty = e.y - ctrl.y;
      const tl = Math.hypot(tx, ty) || 1;
      const ux = tx / tl;
      const uy = ty / tl;
      const rot = (g: number) => ({ x: e.x - 10 * (ux * Math.cos(g) - uy * Math.sin(g)), y: e.y - 10 * (uy * Math.cos(g) + ux * Math.sin(g)) });
      const p1 = rot(0.5);
      const p2 = rot(-0.42);
      const f = (n: number) => n.toFixed(1);
      seta = {
        corpo: `M${f(s.x)} ${f(s.y)} Q${f(ctrl.x)} ${f(ctrl.y)} ${f(e.x)} ${f(e.y)}`,
        ponta: `M${f(p1.x)} ${f(p1.y)} L${f(e.x)} ${f(e.y)} L${f(p2.x)} ${f(p2.y)}`,
      };
    }
  }
  return { buraco, laco: c ? laco(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, semente) : '', balao: pos, seta };
}

const mesmo = (a: Geometria | null, b: Geometria) =>
  !!a && a.laco === b.laco && a.balao.x === b.balao.x && a.balao.y === b.balao.y && a.seta?.corpo === b.seta?.corpo;

export function TourDaRevisao({ tour, mudar, trazerExemplo }: Props) {
  const passo = passoAtual(tour);
  const desenho: Desenho | null = tour.fase === 'convite' || tour.fase === 'fim' ? AO_LADO_DO_CONVITE : passo ? (DESENHOS[passo.id] ?? null) : null;
  // a chave de cada tela do tour: muda, e o balão, o laço e a seta são desenhados de novo
  const tela = tour.fase === 'passo' ? `passo-${tour.i}` : tour.fase;
  const n = tour.fase === 'passo' ? tour.i + 1 : 0;
  const balao = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geometria | null>(null);
  const [cutucado, setCutucado] = useState(0);
  const tourRef = useRef(tour);
  tourRef.current = tour;

  // um passo que ainda não tem desenho (os do editor, nos próximos tickets): por enquanto, o tour termina como "pular"
  useEffect(() => {
    if (tour.fase === 'passo' && !desenho) mudar(pular(tour));
  }, [tour, desenho, mudar]);

  // a despedida some sozinha
  useEffect(() => {
    if (tour.fase !== 'fim') return;
    const t = setTimeout(() => mudar(terminar(tourRef.current)), 3200);
    return () => clearTimeout(t);
  }, [tour.fase, mudar]);

  // acompanha o alvo na tela (a fila se mexe: a vaga abre, a ficha se monta); só redesenha quando algo mudou
  useLayoutEffect(() => {
    setGeo(null);
    if (!desenho) return;
    let quadro = 0;
    let prontoDesde = 0;
    let ultima: Geometria | null = null;
    const olhar = () => {
      quadro = requestAnimationFrame(olhar);
      const alvo = desenho.alvo?.() ?? null;
      const ancora = desenho.ancora?.() ?? alvo;
      const b = balao.current;
      if ((desenho.alvo && !alvo) || !ancora || !b) return;
      if (alvo && desenho.pronto) {
        if (!desenho.pronto(alvo)) return void (prontoDesde = 0);
        prontoDesde ||= performance.now();
        if (performance.now() - prontoDesde < ESPERA_DEPOIS_DE_MONTAR_MS) return;
      }
      const g = medir(alvo, ancora, { w: b.offsetWidth, h: b.offsetHeight }, !!desenho.seta, n);
      if (mesmo(ultima, g)) return;
      ultima = g;
      setGeo(g);
    };
    olhar();
    return () => cancelAnimationFrame(quadro);
  }, [tela, desenho, n]);

  // o que a pessoa faz: só a ação do passo conta; um clique fora do alvo faz o balão lembrar onde clicar
  useEffect(() => {
    if (!desenho) return;
    const agir = (acao: Acao) => {
      const t = tourRef.current;
      if (!aceita(t, acao)) return;
      if (passoAtual(t)?.id === 'chegar') trazerExemplo();
      mudar(seguir(t, acao));
    };
    const clique = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (!el || el.closest('.tour-balao')) return;
      e.preventDefault();
      e.stopPropagation();
      // o alvo ainda não apareceu (a ficha está chegando): o clique não faz nada
      if (!geo) return;
      const alvo = desenho.alvo?.();
      const acao = alvo?.contains(el) ? desenho.acaoDoClique?.(el) : null;
      if (acao) agir(acao);
      else setCutucado((k) => k + 1);
    };
    const tecla = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // Ctrl/⌘+V no passo chegar traz o exemplo; R (revisar o próximo) não abre o exemplo por fora do tour
      if (mod && e.key.toLowerCase() === 'v' && passoAtual(tourRef.current)?.id === 'chegar') {
        e.preventDefault();
        e.stopPropagation();
        agir('colar');
      } else if (!mod && e.key.toLowerCase() === 'r' && tourRef.current.fase === 'passo') {
        e.stopPropagation();
      }
    };
    window.addEventListener('click', clique, true);
    window.addEventListener('keydown', tecla, true);
    return () => {
      window.removeEventListener('click', clique, true);
      window.removeEventListener('keydown', tecla, true);
    };
  }, [desenho, geo, mudar, trazerExemplo]);

  if (!desenho || tour.fase === 'fora') return null;
  const textos = tour.fase === 'convite' ? CONVITE : tour.fase === 'fim' ? FIM : passo!;
  const visivel = !!geo;
  return (
    <div className={`tour ${visivel ? '' : 'esperando'}`} key={tela}>
      {geo?.buraco ? (
        <div className="tour-buraco" style={{ left: geo.buraco.left, top: geo.buraco.top, width: geo.buraco.width, height: geo.buraco.height }} />
      ) : (
        <div className="tour-buraco sem-alvo" />
      )}
      {geo?.laco && (
        <svg className="tour-desenho tour-laco" aria-hidden="true">
          <path pathLength={1} d={geo.laco} />
        </svg>
      )}
      {geo?.seta && (
        <svg className="tour-desenho tour-seta" aria-hidden="true">
          <path pathLength={1} d={geo.seta.corpo} />
          <path className="ponta" pathLength={1} d={geo.seta.ponta} />
        </svg>
      )}
      <div
        ref={balao}
        key={cutucado}
        className={`tour-balao ${cutucado ? 'cutucado' : ''}`}
        role="dialog"
        aria-label="Tour da revisão"
        aria-live="polite"
        style={geo ? { left: geo.balao.x, top: geo.balao.y } : undefined}
      >
        <span className="tour-etapa">{textos.etapa}</span>
        <p className="tour-texto">{textos.texto}</p>
        {tour.fase === 'convite' && (
          <div className="tour-pe">
            <span />
            <span className="tour-acoes">
              <button type="button" className="botao" onClick={() => mudar(pular(tour))}>Agora não</button>
              <button type="button" className="botao primario" onClick={() => mudar(comecar(tour))}>Começar</button>
            </span>
          </div>
        )}
        {tour.fase === 'passo' && (
          <div className="tour-pe">
            <span className="tour-prog">{n}/{PASSOS.length}</span>
            <button type="button" className="botao-texto" onClick={() => mudar(pular(tour))}>pular tour</button>
          </div>
        )}
      </div>
    </div>
  );
}
