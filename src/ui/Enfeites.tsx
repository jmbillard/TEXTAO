/* Os enfeites de fim de ano da tela inicial (fila e agenda), desenhados à mão numa camada por cima da página.
   A camada não recebe o mouse (só as bolas e as taças, para o balanço e o brinde) e nada nela cobre os cards ou o
   texto: cada enfeite é medido a partir das peças da página, nos vãos que sobram (a borda de cima, a régua da agenda,
   as margens dos lados da fila, o fundo da agenda). Nada muda o layout. Quando a página muda de tamanho, a camada é
   redesenhada (as lâmpadas recomeçam o ciclo só então). Com o movimento reduzido, tudo fica parado (enfeites.css).
   No celular, menos enfeites: sem neve, sem confete, sem nada na régua da agenda. */
import { createContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHAMA_DA_VELA } from './fogo';
import { temaDaData, type TemaDaData } from './regrasDosEnfeites';
import { ehCelular } from './util';
import './enfeites.css';

/** O ano novo, quando a agenda troca o "amanhã" (no dia 31) ou o "hoje" (no dia 1º) do dia 1º por "2027!". */
export const AnoNovoNaAgenda = createContext<number | null>(null);

/** O enfeite de agora, conferido a cada 20 s: a contagem do dia 31 anda e a meia-noite troca o tema sem recarregar. */
export function useTemaDaData(): TemaDaData | null {
  const [tema, setTema] = useState(() => temaDaData(new Date()));
  useEffect(() => {
    const t = setInterval(() => {
      const novo = temaDaData(new Date());
      setTema((antes) => (JSON.stringify(antes) === JSON.stringify(novo) ? antes : novo));
    }, 20_000);
    return () => clearInterval(t);
  }, []);
  return tema;
}

/** "faltam 13h48 para 2027"; na última hora, "faltam 12min para 2027". */
export function textoDaContagem(t: TemaDaData, curto = false) {
  if (!t.faltam || !t.anoNovo) return '';
  const { horas, minutos } = t.faltam;
  const quanto = horas ? `${horas}h${String(minutos).padStart(2, '0')}` : `${minutos}min`;
  return `${curto ? '' : 'faltam '}${quanto} para ${t.anoNovo}`;
}

/** A camada dos enfeites, dentro da `.pagina` da tela inicial. */
export function Enfeites({ tema }: { tema: TemaDaData }) {
  const camada = useRef<HTMLDivElement>(null);
  const atual = useRef(tema);
  atual.current = tema;
  // o desenho muda com o tema e com o dia 31 (a contagem); o texto da contagem anda sem redesenhar o resto
  const chave = `${tema.tema}:${tema.faltam ? 'contagem' : ''}`;
  useLayoutEffect(() => {
    const el = camada.current;
    const pagina = el?.parentElement;
    if (!el || !pagina) return;
    let assinatura = '';
    let espera = 0;
    let vivo = true;
    const observador = new ResizeObserver(() => {
      clearTimeout(espera);
      espera = window.setTimeout(desenharSeMudou, 220);
    });
    const desenharSeMudou = () => {
      if (!vivo) return;
      const nova = assinaturaDa(pagina);
      if (nova === assinatura) return;
      assinatura = nova;
      desenhar(el, pagina, atual.current);
      observador.disconnect();
      for (const peca of pecasObservadas(pagina)) observador.observe(peca);
    };
    for (const peca of pecasObservadas(pagina)) observador.observe(peca);
    void document.fonts?.ready.then(desenharSeMudou);
    desenharSeMudou();
    return () => {
      vivo = false;
      clearTimeout(espera);
      observador.disconnect();
      el.replaceChildren();
    };
  }, [chave]);
  // a contagem do dia 31: só o texto muda
  useEffect(() => {
    const texto = camada.current?.querySelector('.contagem-mao-texto');
    if (texto) texto.textContent = textoDaContagem(tema, texto.parentElement?.classList.contains('curta'));
  }, [tema]);
  return <div ref={camada} className="enfeites" aria-hidden="true" data-tema={tema.tema} />;
}

/* ---------- as medidas ---------- */

const SELETORES_OBSERVADOS = ['.barra-topo', '.bib-marca', '.busca', '.perfil', '.lista', '.fila-topo', '.fila-conta', '.secao-trello', '.secao-trello-topo', '.linha-criterio', '.semana-nav', '.semana'];
const pecasObservadas = (pagina: HTMLElement) => [pagina, ...SELETORES_OBSERVADOS.flatMap((s) => [...pagina.querySelectorAll<HTMLElement>(s)])];
/** O tamanho e a posição das peças de que os enfeites dependem: redesenha só quando algo muda de verdade. */
const assinaturaDa = (pagina: HTMLElement) =>
  [pagina.clientWidth, pagina.offsetHeight, ...pecasObservadas(pagina).map((e) => {
    const r = e.getBoundingClientRect();
    return `${Math.round(r.left)},${Math.round(r.top + scrollY)},${Math.round(r.width)},${Math.round(r.height)}`;
  })].join('|');

interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  b: number;
}

const NS = 'http://www.w3.org/2000/svg';
const CORES = ['--ultra', '--producao', '--edicao', '--sonoplastia', '--locutor'];
const f = (n: number) => n.toFixed(1);

/** Um elemento SVG. var() e color-mix() não valem nos atributos de apresentação: vão no style. */
function s(tag: string, at: Record<string, string | number>, pai?: Element | null) {
  const e = document.createElementNS(NS, tag);
  for (const k in at) {
    const v = String(at[k]);
    if ((k === 'fill' || k === 'stroke') && /var\(|color-mix/.test(v)) e.style.setProperty(k, v);
    else e.setAttribute(k, v);
  }
  pai?.appendChild(e);
  return e;
}

/** Um sorteio repetível (mulberry32): o mesmo desenho a cada carga. */
function sorteio(semente: number) {
  return () => {
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Desenha tudo de novo na camada, medindo a página agora. */
function desenhar(camada: HTMLElement, pagina: HTMLElement, tema: TemaDaData) {
  camada.replaceChildren();
  const base = camada.getBoundingClientRect();
  const caixa = (el: Element | null | undefined): Caixa | null => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, r: r.right - base.left, b: r.bottom - base.top };
  };
  const q = <T extends Element = HTMLElement>(sel: string) => pagina.querySelector<T>(sel);
  const W = pagina.clientWidth;
  const H = pagina.offsetHeight;
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, camada);
  // o que fica na barra do topo some no celular quando a busca abre por cima do logo (enfeites.css)
  const topo = s('g', { class: 'no-topo' }, svg);
  const m: Medidas = { caixa, q, W, celular: ehCelular(), svg, topo, camada, tema };
  if (tema.tema === 'natal') natal(m);
  else anoNovo(m);
}

interface Medidas {
  caixa: (el: Element | null | undefined) => Caixa | null;
  q: <T extends Element = HTMLElement>(sel: string) => T | null;
  W: number;
  celular: boolean;
  svg: SVGElement;
  topo: SVGElement;
  camada: HTMLElement;
  tema: TemaDaData;
}

/* ---------- os vãos da página ---------- */

/** Na régua da agenda (computador): entre o resumo ("8 cards") e os links da semana, na linha do título. */
function faixaDaAgenda({ caixa, q }: Medidas): Caixa | null {
  const topo = caixa(q('.secao-trello-topo'));
  const h2 = caixa(q('.secao-trello-topo h2'));
  const linha = caixa(q('.secao-trello-topo .linha-criterio'));
  const nav = caixa(q('.secao-trello-topo .semana-nav'));
  if (!topo || !h2 || !nav || nav.y > h2.b) return null; // a linha quebrou: sem faixa
  const esq = Math.max(h2.r, linha && linha.y < h2.b ? linha.r : 0) + 28;
  const dir = nav.x - 28;
  if (dir - esq < 120) return null;
  return { x: esq, r: dir, w: dir - esq, y: topo.y, h: 22 + h2.h, b: topo.y + 22 + h2.h };
}

/** No celular: o vão entre o logo e quem está online (ou o perfil), na barra do topo (a lupa fica na linha do título, #171). */
function faixaDoTopo({ caixa, q }: Medidas): Caixa | null {
  const logo = caixa(q('.bib-marca'));
  const barra = caixa(q('.barra-topo'));
  const direita = caixa(q('.barra-topo .na-fila')) ?? caixa(q('.perfil'));
  if (!logo || !barra || !direita) return null;
  return { x: logo.r + 16, r: direita.x - 16, w: direita.x - logo.r - 32, y: barra.y, b: barra.b, h: barra.h };
}

/** As margens vazias dos lados da fila, entre a barra do topo e a régua da agenda (no computador largo). */
function margens({ caixa, q, W }: Medidas): Caixa[] {
  const fila = caixa(q('.biblioteca .lista')) ?? caixa(q('.biblioteca > .entra-suave'));
  const barra = caixa(q('.barra-topo'));
  if (!fila || !barra) return [];
  const agenda = caixa(q('.secao-trello-topo'));
  const y = barra.b + 8;
  const b = (agenda ? agenda.y : fila.b) - 14;
  const areas: Caixa[] = [];
  if (b - y < 160) return areas;
  if (fila.x - 32 > 140) areas.push({ x: 32, r: fila.x - 24, w: fila.x - 56, y, b, h: b - y });
  if (W - 32 - fila.r > 140) areas.push({ x: fila.r + 24, r: W - 32, w: W - 56 - fila.r, y, b, h: b - y });
  return areas;
}

/** O fundo da agenda, abaixo da semana (o espaço vazio do fim da página). */
function fundoDaAgenda({ caixa, q }: Medidas): Caixa | null {
  const secao = q('.secao-trello');
  const sc = caixa(secao);
  if (!secao || !sc) return null;
  let livre = sc.y;
  for (const filho of secao.children) {
    const c = caixa(filho);
    if (c) livre = Math.max(livre, c.b);
  }
  const estilo = getComputedStyle(secao);
  const x = sc.x + (parseFloat(estilo.paddingLeft) || 0);
  const r = sc.r - (parseFloat(estilo.paddingRight) || 0);
  const y = livre + 10;
  const b = sc.b - 6;
  return b - y < 36 ? null : { x, r, w: r - x, y, b, h: b - y };
}

/* ---------- Natal: o varal, as bolas, o gorro e a neve ---------- */

/** Um varal de pisca-pisca à mão: laços de fio entre x0 e x1, pendendo de y0, com lâmpadas que acendem devagar.
    Sobre o que está em `evitar`, o fio passa raso e sem lâmpada. Devolve os pontos em que o fio encosta na linha. */
function varal(pai: Element, x0: number, x1: number, y0: number, o: { vao: number; prof: number; evitar?: Caixa[]; lampadas?: number; semente?: number; maxProf?: number }) {
  const { vao, prof, evitar = [], lampadas = 2, semente = 1, maxProf = Infinity } = o;
  const r = sorteio(semente);
  const g = s('g', { class: 'varal' }, pai);
  const n = Math.max(1, Math.round((x1 - x0) / vao));
  const xs: number[] = [];
  for (let i = 0; i <= n; i++) xs.push(x0 + ((x1 - x0) * i) / n + (i > 0 && i < n ? (r() - 0.5) * vao * 0.15 : 0));
  let idx = 0;
  const total = n * lampadas;
  for (let i = 0; i < n; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    let p = Math.min(maxProf, prof * (0.85 + r() * 0.3));
    for (const e of evitar) if (e.x - 10 < b && e.r + 10 > a) p = Math.min(p, e.y - y0 - 14);
    const semLampada = p < 8;
    p = Math.max(p, 3);
    const cx = (a + b) / 2 + (r() - 0.5) * 10;
    const cy = y0 + 2 * p;
    s('path', { class: 'fio', d: `M${f(a)} ${f(y0)} Q ${f(cx)} ${f(cy)} ${f(b)} ${f(y0)}` }, g);
    for (let j = 0; j < (semLampada ? 0 : lampadas); j++) {
      const t = (j + 0.5) / lampadas + (r() - 0.5) * 0.08;
      const x = (1 - t) * (1 - t) * a + 2 * (1 - t) * t * cx + t * t * b;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y0;
      const dx = 2 * (1 - t) * (cx - a) + 2 * t * (b - cx);
      const dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y0 - cy);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI + (r() - 0.5) * 24;
      const cor = `var(${CORES[idx % CORES.length]})`;
      const l = s('g', { class: 'lampada', transform: `translate(${f(x)} ${f(y)}) rotate(${f(ang)})`, style: `--atraso:${(idx * 0.62).toFixed(2)}s;--ciclo:${Math.max(9, total * 0.62).toFixed(1)}s` }, g);
      s('circle', { class: 'halo', cx: 0, cy: 6.6, r: 7, fill: cor }, l);
      s('rect', { class: 'bocal', x: -1.7, y: -0.4, width: 3.4, height: 3, rx: 0.6 }, l);
      s('path', { class: 'vidro', d: 'M0 2.4 C -3.5 3.6, -3.4 9.6, 0 10.6 C 3.4 9.6, 3.5 3.6, 0 2.4 Z', fill: cor }, l);
      s('path', { class: 'reflexo', d: 'M-1.3 4.6 Q -1.9 6.4 -1.2 8' }, l);
      idx++;
    }
  }
  return xs.slice(1, -1);
}

/** Uma bola pendurada num cordão; com o mouse, balança de leve. */
function bola(pai: Element, ax: number, ay: number, comp: number, raio: number, corVar: string, semente: number) {
  const r = sorteio(semente);
  const cor = `var(${corVar})`;
  const g = s('g', { class: 'bola', style: `transform-origin:${f(ax)}px ${f(ay)}px` }, pai);
  const ey = ay + comp;
  s('path', { class: 'cordao', d: `M${f(ax)} ${f(ay)} C ${f(ax + 1.5)} ${f(ay + comp * 0.35)}, ${f(ax - 1.2)} ${f(ay + comp * 0.7)}, ${f(ax)} ${f(ey)}` }, g);
  s('rect', { class: 'tampa', x: f(ax - 2.2), y: f(ey - 0.5), width: 4.4, height: 3.2, rx: 0.8 }, g);
  const cy = ey + 2.4 + raio;
  s('circle', { class: 'globo', cx: f(ax), cy: f(cy), r: raio, fill: `color-mix(in srgb, ${cor} 20%, var(--papel))`, stroke: cor }, g);
  const v = (r() - 0.5) * 2;
  s('path', { class: 'faixa', stroke: cor, d: `M${f(ax - raio * 0.93)} ${f(cy + 0.5)} Q ${f(ax)} ${f(cy + raio * 0.5 + v)} ${f(ax + raio * 0.93)} ${f(cy + 0.5)}` }, g);
  s('path', { class: 'faixa', stroke: cor, d: `M${f(ax - raio * 0.72)} ${f(cy + raio * 0.55)} Q ${f(ax)} ${f(cy + raio * 0.95)} ${f(ax + raio * 0.72)} ${f(cy + raio * 0.55)}`, opacity: 0.6 }, g);
  s('path', { class: 'brilho', d: `M${f(ax - raio * 0.6)} ${f(cy - raio * 0.15)} Q ${f(ax - raio * 0.5)} ${f(cy - raio * 0.62)} ${f(ax - raio * 0.08)} ${f(cy - raio * 0.68)}` }, g);
  const alvo = s('circle', { class: 'alvo', cx: f(ax), cy: f(cy), r: raio + 5 }, g);
  alvo.addEventListener('pointerenter', () => {
    g.classList.remove('balanca');
    void g.getBoundingClientRect();
    g.classList.add('balanca');
  });
  g.addEventListener('animationend', () => g.classList.remove('balanca'));
}

/** O gorro no "P" do PROMeiro. Devolve a caixa dele (o varal do topo passa raso por cima). */
function gorro({ q, caixa, topo }: Medidas): Caixa | null {
  const letra = q('.bib-marca .logo-app b');
  const c = caixa(letra);
  if (!letra || !c) return null;
  const fonte = parseFloat(getComputedStyle(letra).fontSize);
  const k = fonte / 34;
  // a aba assenta no alto do P (a letra começa a ~0,2 da altura da caixa)
  const cx = c.x + fonte * 0.33;
  const cy = c.y + c.h * 0.2;
  const g = s('g', { class: 'gorro', transform: `translate(${f(cx)} ${f(cy)}) rotate(-16) scale(${f(k * 1.05)})` }, topo);
  s('path', { class: 'corpo', d: 'M-10 -1 C -8.5 -9, -3 -16.5, 4 -17.8 C 9.5 -18.8, 14.5 -15.6, 16.8 -10.2 C 13.4 -13, 9.6 -13.4, 7.4 -11 C 8.8 -7.4, 9.6 -4.2, 10.2 -1 Z' }, g);
  s('path', { class: 'aba', d: 'M-12.6 -3.2 C -6 -4.6, 5 -4.8, 12.4 -3 C 13.6 -2.6, 13.8 1.8, 12.4 2.4 C 5 3.8, -6 3.8, -12.4 2.6 C -13.8 2.2, -13.9 -2.8, -12.6 -3.2 Z' }, g);
  s('circle', { class: 'pompom', cx: 17.2, cy: -9.4, r: 3.1 }, g);
  return caixa(g);
}

/** A neve à mão, rara: poucos flocos caindo devagar, só nas margens vazias. */
function neve(pai: Element, areas: Caixa[]) {
  const r = sorteio(7);
  for (const a of areas) {
    const n = Math.max(1, Math.round((a.w * a.h) / 60000));
    for (let i = 0; i < n; i++) {
      const x = a.x + 12 + r() * (a.w - 24);
      const y0 = a.y + r() * a.h * 0.3;
      const tam = 3 + r() * 2.5;
      const queda = a.y + a.h - y0 - 10;
      const g = s('g', { transform: `translate(${f(x)} ${f(y0)})` }, pai);
      const fl = s('g', { class: 'floco', style: `--queda:${f(queda)}px;--dur:${f(30 + r() * 22)}s;--atraso:${f(-r() * 40)}s` }, g);
      for (const ang of [0, 60, 120]) {
        const ra = ((ang + 15) * Math.PI) / 180;
        s('path', { d: `M${f(-Math.cos(ra) * tam)} ${f(-Math.sin(ra) * tam)} L${f(Math.cos(ra) * tam)} ${f(Math.sin(ra) * tam)}` }, fl);
      }
    }
  }
}

function natal(m: Medidas) {
  const { caixa, q, W, celular, svg, topo } = m;
  const chapeu = gorro(m);
  // as bolas no logo
  const logo = caixa(q('.bib-marca .logo-app'));
  if (logo) {
    const base = logo.b - logo.h * 0.12;
    if (celular) bola(topo, logo.x + logo.w * 0.72, base, 9, 5.5, '--ultra', 2);
    else {
      bola(topo, logo.x + logo.w * 0.36, base, 16, 7, '--ultra', 2);
      bola(topo, logo.x + logo.w * 0.74, base, 31, 8.5, '--edicao', 5);
    }
  }
  // o varal da borda de cima: passa raso sobre o logo, o gorro, a busca e o perfil
  const evitar = [caixa(q('.bib-marca')), chapeu, caixa(q('.busca')), caixa(q('.barra-topo .na-fila')), caixa(q('.perfil'))].filter((c): c is Caixa => !!c);
  if (celular) {
    const t = faixaDoTopo(m);
    if (t && t.w > 60) varal(topo, t.x - 4, t.r + 4, -1, { vao: t.w / 2, prof: 15, evitar, semente: 3 });
  } else varal(topo, -6, W + 6, -1, { vao: 170, prof: 19, evitar, semente: 3 });
  if (celular) return;
  // a régua da agenda: um varal curto, com bolas penduradas onde o fio encosta na régua
  const fx = faixaDaAgenda(m);
  if (fx && fx.w > 180) {
    const ganchos = varal(svg, fx.x, fx.r, fx.y, { vao: Math.min(150, fx.w / 2), prof: 13, semente: 9, maxProf: 15 });
    ganchos.slice(0, 2).forEach((x, i) => bola(svg, x, fx.y + 0.5, i ? 21 : 11, i ? 7 : 6, i ? '--sonoplastia' : '--producao', 7 + i * 4));
  }
  neve(svg, margens(m));
}

/* ---------- Ano Novo: as taças, os fogos, o confete e a contagem ---------- */

/** Duas taças brindando, com bolhinhas; com o mouse, brindam de novo. */
function tacas(pai: Element, x: number, cy: number, escala: number) {
  const g = s('g', { class: 'tacas brinda', transform: `translate(${f(x)} ${f(cy)}) scale(${f(escala)})` }, pai);
  const copo = (cls: string, dx: number, ang: number) => {
    const c = s('g', { transform: `translate(${dx} 0) rotate(${ang})` }, g);
    const dentro = s('g', { class: cls }, c);
    s('path', { class: 'bebida', d: 'M-3.5 -7.5 L 3.5 -7.5 C 3.3 -3.6, 2.1 -1.1, 0 -0.2 C -2.1 -1.1, -3.3 -3.6, -3.5 -7.5 Z' }, dentro);
    s('path', { class: 'copo', d: 'M-4.1 -13 C -4.3 -5, -2.6 -0.8, 0 0 C 2.6 -0.8, 4.3 -5, 4.1 -13 M0 0 L0 8.6 M-3.6 9.2 Q 0 8.2 3.6 9.2' }, dentro);
    [-1.2, 1, 0].forEach((bx, i) => s('circle', { class: 'bolha', cx: bx, cy: -2.4 - i * 1.6, r: 0.6, style: `--atraso:${(i * 1.1).toFixed(1)}s` }, dentro));
  };
  copo('esq', -5.4, 13);
  copo('dir', 5.4, -13);
  for (const [a, b] of [[-3, -16.2], [0, -17.8], [3, -16.2]]) s('path', { class: 'tinim', d: `M${a * 0.55} ${b + 2.6} L${a} ${b}` }, g);
  const alvo = s('rect', { class: 'alvo', x: -13, y: -20, width: 26, height: 32 }, g);
  alvo.addEventListener('pointerenter', () => {
    g.classList.remove('brinda');
    void g.getBoundingClientRect();
    g.classList.add('brinda');
  });
  g.addEventListener('animationend', (e) => {
    if ((e as AnimationEvent).animationName.includes('brinda')) g.classList.remove('brinda');
  });
}

/** Um rojão pequeno como os da fila zerada: sobe, estoura devagar e some; depois o céu fica quieto um bom tempo. */
function rojao(pai: Element, cx: number, cy: number, R: number, corVar: string, atraso: number, ciclo: number, semente: number, quieto = false) {
  const r = sorteio(semente);
  const cor = `var(${corVar})`;
  const g = s('g', { class: `estouro${quieto ? ' quieto' : ''}`, style: `--atraso:${atraso}s;--ciclo:${ciclo}s` }, pai);
  s('path', { class: 'rastro', stroke: cor, pathLength: 1, d: `M${f(cx + R * 0.5)} ${f(cy + R * 2.2)} C ${f(cx + R * 0.4)} ${f(cy + R * 1.3)}, ${f(cx + 2)} ${f(cy + R * 0.8)}, ${f(cx)} ${f(cy + R * 0.25)}` }, g);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const th = (360 * i) / n + (r() - 0.5) * 14;
    const RR = R * (0.75 + r() * 0.35);
    const rg = s('g', { transform: `translate(${f(cx)} ${f(cy)}) rotate(${f(th)})` }, g);
    s('path', { class: 'raio', stroke: cor, pathLength: 1, d: `M0 ${f(-RR * 0.28)} Q ${f((r() - 0.5) * 2)} ${f(-RR * 0.55)} 0 ${f(-RR * 0.86)}` }, rg);
    // a chama da vela na ponta, para fora (como na fila zerada)
    s('path', { class: 'ponta', stroke: cor, d: CHAMA_DA_VELA, transform: `translate(0 ${f(-RR * 0.86)}) scale(0.5) translate(-5.1 -16.5) translate(0 -1)` }, rg);
    if (i % 2) s('circle', { class: 'ponta faisca', cx: 0, cy: f(-R * 1.18), r: 0.9, transform: `rotate(${f(180 / n)})`, style: `fill:${cor}` }, rg);
  }
}

/** O confete caindo bem devagar nos cantos de cima das margens, sem sair delas. */
function confete(pai: Element, a: Caixa, queda: number, semente: number, n: number) {
  const r = sorteio(semente);
  const g = s('g', { class: 'confete' }, pai);
  for (let i = 0; i < n; i++) {
    const x = a.x + 6 + r() * (a.w - 12);
    const y = a.y + Math.pow(r(), 1.6) * a.h;
    const cor = `var(${CORES[i % CORES.length]})`;
    const pos = s('g', { transform: `translate(${f(x)} ${f(y)})` }, g);
    const peca = s('g', { class: 'pedaco', style: `--queda:${f(queda)}px;--dur:${f(42 + r() * 26)}s;--atraso:${f(-r() * 60)}s;--giro:${f((r() - 0.5) * 540)}deg` }, pos);
    const tipo = r();
    if (tipo < 0.5) s('rect', { class: 'papel', x: -1.3, y: -3, width: 2.6, height: 6, rx: 0.5, fill: cor, transform: `rotate(${f(r() * 180)})` }, peca);
    else if (tipo < 0.75) s('circle', { class: 'papel', cx: 0, cy: 0, r: f(1.3 + r() * 0.8), fill: cor }, peca);
    else s('path', { class: 'risco', stroke: cor, d: 'M-4 0 q 2 -3 4 0 t 4 0', transform: `rotate(${f(r() * 180)})` }, peca);
  }
}

/** A contagem à mão do dia 31, na linha da contagem da fila, à direita (no vão que sobra nela). */
function contagem({ caixa, q, camada, tema }: Medidas) {
  const conta = q('.fila-conta');
  const linha = caixa(conta);
  const filaTopo = caixa(q('.fila-topo'));
  if (!conta || !linha || !filaTopo) return;
  let ocupado = linha.x;
  for (const filho of conta.children) {
    const c = caixa(filho);
    if (c) ocupado = Math.max(ocupado, c.r);
  }
  for (const curto of [false, true]) {
    const el = document.createElement('div');
    el.className = `contagem-mao${curto ? ' curta' : ''}`;
    el.innerHTML = '<span class="contagem-mao-texto"></span><svg viewBox="0 0 100 14" preserveAspectRatio="none"><path d="M2 9 C 30 3, 70 4, 98 6 C 70 8, 40 10, 14 12"/></svg>';
    el.firstElementChild!.textContent = textoDaContagem(tema, curto);
    camada.appendChild(el);
    const largura = el.offsetWidth;
    const esq = filaTopo.r - largura;
    if (esq < ocupado + 20) {
      el.remove();
      continue;
    }
    el.style.left = `${f(esq)}px`;
    el.style.top = `${f(linha.y + linha.h / 2 - el.offsetHeight / 2 - 1)}px`;
    return;
  }
}

function anoNovo(m: Medidas) {
  const { caixa, q, celular, svg, topo, tema } = m;
  const logo = caixa(q('.bib-marca .logo-app'));
  if (logo) tacas(topo, logo.r + (celular ? 18 : 24), logo.y + logo.h * 0.58, celular ? 0.95 : 1.15);
  // os fogos no fundo da agenda, abaixo da semana: um de cada vez, com o céu quieto entre eles
  const fundo = fundoDaAgenda(m);
  if (fundo) {
    const R = Math.min(celular ? 12 : 17, (fundo.h - 8) / 3.5);
    if (R >= 8) {
      const cy = fundo.y + R * 1.25;
      const ciclo = 30;
      const pontos: [number, string, number][] = celular
        ? [[0.3, '--ultra', 0], [0.72, '--producao', 15]]
        : [[0.2, '--ultra', 0], [0.52, '--producao', 10], [0.83, '--edicao', 20]];
      pontos.forEach(([px, cor, atraso], i) => rojao(svg, fundo.x + fundo.w * px, cy + (i % 2 ? -2 : 2), R * (i === 2 ? 0.8 : 1), cor, atraso, ciclo, 3 + i * 2, i === 2));
    }
  }
  // o confete: nos cantos de cima das margens, caindo bem devagar (só no computador largo)
  if (!celular) {
    const [esq, dir] = margens(m);
    const queda = (a: Caixa) => Math.max(30, Math.min(320, a.h - 190));
    if (esq) {
      const w = Math.min(210, esq.w - 40);
      confete(svg, { x: esq.x, y: esq.y, w, h: 170, r: esq.x + w, b: esq.y + 170 }, queda(esq), 4, 16);
    }
    if (dir) {
      const x = Math.max(dir.x + 40, dir.r - 210);
      confete(svg, { x, y: dir.y, w: dir.r - x, h: 170, r: dir.r, b: dir.y + 170 }, queda(dir), 8, 16);
    }
  }
  if (tema.faltam) contagem(m);
}
