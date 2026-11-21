import type { CSSProperties } from 'react';

/* Cursores dos colegas. Cada desenho tem a ponta (o ponto que clica) em (5, 5) de um quadro 48 × 48.
   Os escudos são só nas cores dos times, não os escudos oficiais. */

export interface TipoCursor {
  id: string;
  nome: string;
  /** Times entram só por escolha: o sorteio nunca dá o escudo do rival para ninguém. */
  time?: boolean;
}

export const CURSORES: TipoCursor[] = [
  { id: 'cenoura', nome: 'Cenoura' },
  { id: 'mouse', nome: 'Mouse' },
  { id: 'pen-tool', nome: 'Pen tool' },
  { id: 'lapis', nome: 'Lápis' },
  { id: 'pincel', nome: 'Pincel' },
  { id: 'conta-gotas', nome: 'Conta-gotas' },
  { id: 'tesoura', nome: 'Tesoura' },
  { id: 'pena', nome: 'Pena' },
  { id: 'varinha', nome: 'Varinha' },
  { id: 'claquete', nome: 'Claquete' },
  { id: 'bacon', nome: 'Bacon' },
  { id: 'brocolis', nome: 'Brócolis' },
  { id: 'vasco', nome: 'Vasco', time: true },
  { id: 'fluminense', nome: 'Fluminense', time: true },
  { id: 'flamengo', nome: 'Flamengo', time: true },
  { id: 'botafogo', nome: 'Botafogo', time: true },
];

const SORTEAVEIS = CURSORES.filter((c) => !c.time);
const CHAVE = 'promeiro.cursor';

/** O cursor sorteado para a pessoa: sempre o mesmo, em qualquer computador. */
export function cursorDe(email: string): string {
  let h = 7;
  for (const c of email.toLowerCase()) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return SORTEAVEIS[h % SORTEAVEIS.length].id;
}

/** O cursor que eu escolhi, ou o sorteado. */
export function meuCursor(email: string): string {
  try {
    const escolhido = localStorage.getItem(CHAVE);
    if (escolhido && CURSORES.some((c) => c.id === escolhido)) return escolhido;
  } catch {
    /* sem armazenamento local: fica o sorteado */
  }
  return cursorDe(email);
}

export function escolherCursor(id: string) {
  try {
    localStorage.setItem(CHAVE, id);
  } catch {
    /* sem armazenamento local, a escolha vale só até recarregar */
  }
}

export const cursorValido = (id: unknown): id is string => typeof id === 'string' && CURSORES.some((c) => c.id === id);

/** Um cursor desenhado. `cor` é a cor da pessoa, usada num detalhe do objeto. */
export function Cursor({ id, cor, tamanho = 52, className }: { id: string; cor: string; tamanho?: number; className?: string }) {
  return (
    <svg className={className} width={tamanho} height={tamanho} viewBox="0 0 48 48" style={{ '--cor': cor, overflow: 'visible' } as CSSProperties} aria-hidden="true">
      <use href={`#cursor-${cursorValido(id) ? id : 'lapis'}`} filter="url(#cursor-contorno)" />
    </svg>
  );
}

/** Os desenhos, uma vez só na página; cada cursor só aponta para eles. */
export function DesenhosDeCursor() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {/* contorno branco por fora do desenho inteiro: o cursor aparece em qualquer fundo, claro ou escuro */}
        <filter id="cursor-contorno" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="borda" />
          <feFlood style={{ floodColor: 'var(--contorno-cursor, #fff)' }} />
          <feComposite in2="borda" operator="in" result="branco" />
          <feMerge>
            <feMergeNode in="branco" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="escudo-recorte">
          <path d="M3 3 H31 V17 C31 28 23 34 17 37 C11 34 3 28 3 17 Z" />
        </clipPath>
        <g id="cursor-cenoura" transform="translate(5 5) rotate(45)">
          <path className="trac" d="M38 -1 C44 -12 52 -12 52 -8 C48 -6 43 -3 38 -1Z M38 1 C46 2 54 -1 54 2 C52 6 44 5 38 1Z M38 0 C44 -5 51 -3 51 0 C47 2 42 1 38 0Z" fill="#3f9a4a" />
          <path className="trac" d="M0 0 C10 -3 22 -8 34 -8 C37 -8 39 -4 39 0 C39 4 37 8 34 8 C22 8 10 3 0 0 Z" fill="#f08a24" />
          <path className="trac" d="M12 -3 L16 -2 M20 4 L25 3 M27 -5.5 L31 -4.5" fill="none" strokeWidth="1.5" />
        </g>
        <g id="cursor-mouse" transform="translate(5 5) rotate(48)">
          <path className="trac" d="M0 0 C5 4 9 -4 14 0" fill="none" />
          <rect className="trac" x="14" y="-10" width="31" height="20" rx="10" fill="#fff" />
          <path d="M26 -9.6 V0 H14.4 A10 10 0 0 1 24 -10 Z" fill="var(--cor)" opacity=".85" />
          <path className="trac" d="M14.5 0 H26 M26 -9.6 V9.6" fill="none" strokeWidth="1.6" />
          <rect className="trac" x="14" y="-10" width="31" height="20" rx="10" fill="none" />
        </g>
        <g id="cursor-pen-tool" transform="translate(5 5) rotate(45)">
          <rect className="trac" x="27" y="-6" width="20" height="12" rx="3" fill="var(--cor)" />
          <path className="trac" d="M0 0 L14 -8.5 Q19.5 -9.5 21.5 -5.5 L27 -5.5 L27 5.5 L21.5 5.5 Q19.5 9.5 14 8.5 Z" fill="#fff" />
          <path className="trac" d="M0 0 H11" fill="none" strokeWidth="1.6" />
          <circle cx="13" cy="0" r="2.3" fill="#1a1916" />
        </g>
        <g id="cursor-lapis" transform="translate(5 5) rotate(45)">
          <rect className="trac" x="12" y="-6" width="32" height="12" fill="var(--cor)" />
          <path className="trac" d="M0 0 L12 -6 L12 6 Z" fill="#f3d9a4" />
          <path d="M0 0 L4.2 -2.1 L4.2 2.1 Z" fill="#1a1916" />
          <rect className="trac" x="44" y="-6" width="5" height="12" fill="#c9c4b8" />
          <rect className="trac" x="49" y="-6" width="6" height="12" rx="2" fill="#f2a7a0" />
        </g>
        <g id="cursor-pincel" transform="translate(5 5) rotate(45)">
          <path className="trac" d="M23 -4 L50 -2.6 Q53.5 0 50 2.6 L23 4Z" fill="#e0b77a" />
          <rect className="trac" x="15" y="-5" width="8" height="10" fill="#c9c4b8" />
          <path className="trac" d="M0 0 C4 -5 10 -5.6 15 -5 L15 5 C10 5.6 4 5 0 0Z" fill="var(--cor)" />
        </g>
        <g id="cursor-conta-gotas" transform="translate(5 5) rotate(45)">
          <ellipse className="trac" cx="41" cy="0" rx="9" ry="6.5" fill="#2c2a26" />
          <rect className="trac" x="28" y="-5.5" width="5" height="11" rx="1" fill="#c9c4b8" />
          <rect x="6" y="-3.5" width="13" height="7" fill="var(--cor)" />
          <rect className="trac" x="6" y="-3.5" width="22" height="7" rx="1.5" fill="none" />
          <path className="trac" d="M0 0 L6 -1.8 L6 1.8 Z" fill="#fff" />
        </g>
        <g id="cursor-tesoura" transform="translate(5 5) rotate(45)">
          <path className="trac" d="M22 -1.5 L27 -5 M22 1.5 L27 5" fill="none" strokeWidth="3" />
          <path className="trac" fillRule="evenodd" d="M26 -6.5 a7 5 0 1 0 14 0 a7 5 0 1 0 -14 0 Z M29.5 -6.5 a3.5 2.2 0 1 0 7 0 a3.5 2.2 0 1 0 -7 0 Z" fill="var(--cor)" />
          <path className="trac" fillRule="evenodd" d="M26 6.5 a7 5 0 1 0 14 0 a7 5 0 1 0 -14 0 Z M29.5 6.5 a3.5 2.2 0 1 0 7 0 a3.5 2.2 0 1 0 -7 0 Z" fill="var(--cor)" />
          <path className="trac" d="M0 -0.4 L23 -4.6 L24 0 Z" fill="#ebe8e0" />
          <path className="trac" d="M0 0.4 L23 4.6 L24 0 Z" fill="#ebe8e0" />
          <circle cx="21.5" cy="0" r="1.8" fill="#1a1916" />
        </g>
        <g id="cursor-pena" transform="translate(5 5) rotate(45)">
          <path className="trac" d="M9 0.3 C20 4.5 34 4.5 44 0 C32 0.2 20 0.6 9 0.3Z" fill="var(--cor)" opacity=".75" />
          <path className="trac" d="M7 -0.4 C16 -10.5 34 -14.5 51 -10 C42 -6 26 -2 7 -0.4Z" fill="var(--cor)" />
          <path d="M20 -4 L24 -9 M28 -4.5 L33 -10.5 M36 -5.5 L41 -10.6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".8" />
          <path className="trac" d="M0 0 L50 -2.4" fill="none" strokeWidth="1.6" />
          <path d="M0 0 L7 -1.6 L7 1.2 Z" fill="#1a1916" />
        </g>
        <g id="cursor-varinha" transform="translate(5 5)">
          <g transform="rotate(45)">
            <rect className="trac" x="6" y="-2.3" width="40" height="4.6" rx="2" fill="#1a1916" />
            <rect className="trac" x="38" y="-2.3" width="8" height="4.6" rx="2" fill="#fff" />
          </g>
          <path className="trac" d="M0 -7 L1.8 -2.4 L6.7 -2.2 L2.9 0.9 L4.1 5.7 L0 3 L-4.1 5.7 L-2.9 0.9 L-6.7 -2.2 L-1.8 -2.4Z" fill="#ffd34d" />
          <path className="brilho" d="M14 -4 l1 -3 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1Z" fill="var(--cor)" />
          <path className="brilho" d="M-3 13 l.8 -2.2 l.8 2.2 l2.2 .8 l-2.2 .8 l-.8 2.2 l-.8 -2.2 l-2.2 -.8Z" fill="var(--cor)" style={{ animationDelay: '.6s' }} />
        </g>
        <g id="cursor-claquete">
          <rect className="trac" x="4" y="13" width="36" height="25" rx="2.5" fill="#1a1916" />
          <path d="M9 22 H35 M9 29 H24" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".8" />
          <rect x="28" y="27" width="8" height="6" rx="1" fill="var(--cor)" />
          <path className="trac" d="M3 5 L38 -1 L39.5 6 L4.5 12 Z" fill="#fff" />
          <path d="M10 3.8 L15 3 L16.4 10 L11.4 10.8Z M20 2.1 L25 1.3 L26.4 8.3 L21.4 9.1Z M30 0.4 L35 -0.4 L36.4 6.6 L31.4 7.4Z" fill="#1a1916" />
        </g>
        <g id="cursor-bacon" transform="translate(5 5) rotate(45)">
          <path className="trac" d="M0 -3 C6 -8 10 2 16 -3 C22 -8 26 2 32 -3 C38 -8 42 2 48 -3 L48 5 C42 10 38 0 32 5 C26 10 22 0 16 5 C10 10 6 0 0 5 Z" fill="#c4553f" />
          <path d="M3 1.4 C8 -2.6 11 4.6 16 1 C21 -2.6 25 4.6 30 1 C35 -2.6 39 4.6 45 1" fill="none" stroke="#f7d7c8" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M6 -3.4 C9 -5.5 11 -2 13 -3.6 M27 4.6 C30 7 32 3.5 35 5" fill="none" stroke="#8f2f22" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        <g id="cursor-brocolis" transform="translate(-1 0.5) rotate(-38 20 24)">
          <path className="trac" d="M16.5 24 C16.5 31 15.5 37 13.5 44 Q20 46.5 26.5 44 C24.5 37 23.5 31 23.5 24 Z" fill="#a6d36c" />
          <path className="trac" d="M17 30 C14 28.5 11.5 27 10 24.5 M23 30 C26 28.5 28.5 27 30 24.5" fill="none" stroke="#1a1916" strokeWidth="6" />
          <path d="M17 30 C14 28.5 11.5 27 10 24.5 M23 30 C26 28.5 28.5 27 30 24.5" fill="none" stroke="#a6d36c" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M20 33 V42" stroke="#86b955" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="12" cy="17" r="8" fill="#1a1916" stroke="#1a1916" strokeWidth="4" /><circle cx="20" cy="11" r="9.5" fill="#1a1916" stroke="#1a1916" strokeWidth="4" /><circle cx="29" cy="16" r="8" fill="#1a1916" stroke="#1a1916" strokeWidth="4" /><circle cx="17" cy="22" r="7" fill="#1a1916" stroke="#1a1916" strokeWidth="4" /><circle cx="25" cy="22" r="6.5" fill="#1a1916" stroke="#1a1916" strokeWidth="4" />
          <circle cx="12" cy="17" r="8" fill="#4f9d3c" /><circle cx="20" cy="11" r="9.5" fill="#4f9d3c" /><circle cx="29" cy="16" r="8" fill="#4f9d3c" /><circle cx="17" cy="22" r="7" fill="#4f9d3c" /><circle cx="25" cy="22" r="6.5" fill="#4f9d3c" />
          <circle cx="13" cy="15" r="2.6" fill="#3b822e" /><circle cx="19" cy="9" r="2.8" fill="#3b822e" /><circle cx="26" cy="12" r="2.4" fill="#3b822e" /><circle cx="29" cy="18" r="2.4" fill="#3b822e" /><circle cx="21" cy="17" r="2.6" fill="#3b822e" /><circle cx="15" cy="22" r="2.2" fill="#3b822e" /><circle cx="24" cy="22" r="2.2" fill="#3b822e" /><circle cx="9" cy="19" r="1.8" fill="#3b822e" /><circle cx="17" cy="13" r="1.6" fill="#3b822e" />
          <path d="M14 9.5 C16 7 19 6 22 6.2 M24.5 8 C27 8.5 29 10 30 12" fill="none" stroke="#8fd16a" strokeWidth="1.6" strokeLinecap="round" />
        </g>
        <g id="cursor-vasco" transform="rotate(-10 17 20)">
          <g clipPath="url(#escudo-recorte)">
            <rect x="0" y="0" width="34" height="40" fill="#141414" />
            <path d="M0 0 L34 23 L34 40 L0 17 Z" fill="#fff" />
            <path d="M-1.6 -6.2 L1.6 -6.2 L0.9 -0.9 L6.2 -1.6 L6.2 1.6 L0.9 0.9 L1.6 6.2 L-1.6 6.2 L-0.9 0.9 L-6.2 1.6 L-6.2 -1.6 L-0.9 -0.9 Z" fill="#d42a2a" transform="translate(17 20.5) rotate(34) scale(.82)" />
          </g>
          <path className="trac" d="M3 3 H31 V17 C31 28 23 34 17 37 C11 34 3 28 3 17 Z" fill="none" />
        </g>
        <g id="cursor-fluminense" transform="rotate(-10 17 20)">
          <g clipPath="url(#escudo-recorte)">
            <rect x="0" y="0" width="12" height="40" fill="#7a1131" />
            <rect x="12" y="0" width="10" height="40" fill="#fff" />
            <rect x="22" y="0" width="12" height="40" fill="#00613c" />
          </g>
          <path className="trac" d="M3 3 H31 V17 C31 28 23 34 17 37 C11 34 3 28 3 17 Z" fill="none" />
        </g>
        <g id="cursor-flamengo" transform="rotate(-10 17 20)">
          <g clipPath="url(#escudo-recorte)">
            <rect x="0" y="0" width="34" height="40" fill="#141414" />
            <rect x="0" y="3" width="34" height="6" fill="#d2121b" />
            <rect x="0" y="15" width="34" height="6" fill="#d2121b" />
            <rect x="0" y="27" width="34" height="6" fill="#d2121b" />
          </g>
          <path className="trac" d="M3 3 H31 V17 C31 28 23 34 17 37 C11 34 3 28 3 17 Z" fill="none" />
        </g>
        <g id="cursor-botafogo" transform="rotate(-10 17 20)">
          <path className="trac" d="M3 3 H31 V17 C31 28 23 34 17 37 C11 34 3 28 3 17 Z" fill="#141414" />
          <path d="M17 9.5 L19.4 15.6 L25.9 15.9 L20.9 20 L22.5 26.4 L17 22.8 L11.5 26.4 L13.1 20 L8.1 15.9 L14.6 15.6Z" fill="#fff" strokeLinejoin="round" transform="translate(0 -3)" />
        </g>
      </defs>
    </svg>
  );
}

/* ---------- o meu cursor, no meu próprio mouse ---------- */

const CHAVE_NO_MOUSE = 'promeiro.cursor.no-mouse';
/* Ver os ponteiros dos colegas: preferência de cada um, guardada no navegador. Desligado, eles somem só desta
   tela; o meu continua indo para os outros. */
const CHAVE_VER_PONTEIROS = 'promeiro.ponteiros.ver';
export function verPonteiros(): boolean {
  try {
    return localStorage.getItem(CHAVE_VER_PONTEIROS) !== '0';
  } catch {
    return true;
  }
}
const aplicarVerPonteiros = (ver: boolean) => document.documentElement.classList.toggle('sem-ponteiros', !ver);
export function usarVerPonteiros(ver: boolean) {
  try {
    localStorage.setItem(CHAVE_VER_PONTEIROS, ver ? '1' : '0');
  } catch {
    /* vale até recarregar */
  }
  aplicarVerPonteiros(ver);
}
if (typeof document !== 'undefined') aplicarVerPonteiros(verPonteiros());

export function cursorNoMouse(): boolean {
  try {
    return localStorage.getItem(CHAVE_NO_MOUSE) !== '0';
  } catch {
    return true;
  }
}
export function usarCursorNoMouse(ligado: boolean) {
  try {
    localStorage.setItem(CHAVE_NO_MOUSE, ligado ? '1' : '0');
  } catch {
    /* vale até recarregar */
  }
  window.dispatchEvent(new Event('promeiro:cursor'));
}
/** Avisa a página que o cursor, a cor ou o tema mudou: o do mouse é redesenhado. */
export const avisarCursorMudou = () => window.dispatchEvent(new Event('promeiro:cursor'));

/** Um SVG sozinho (para virar o cursor do mouse) a partir do desenho que está na página.
    O SVG de um cursor não enxerga a página: cor, traço e contorno vão escritos nele. */
export function svgDoCursor(id: string, cor: string, contorno: string, tamanho = 32): string | null {
  const desenho = document.getElementById(`cursor-${cursorValido(id) ? id : 'lapis'}`);
  const recorte = document.getElementById('escudo-recorte');
  if (!desenho) return null;
  const limpar = (html: string) =>
    html
      .replace(/var\(--cor\)/g, cor)
      // o traço vai como style (e não como atributo): igual ao .trac da página, vale por cima de um stroke-width do
      // próprio desenho, e não repete atributo (atributo repetido deixa o SVG inválido e o cursor não carrega)
      .replace(/class="trac"/g, 'style="stroke:#1a1916;stroke-width:2;stroke-linejoin:round;stroke-linecap:round"');
  // a ponta do desenho fica em (5,5); com folga de 6 em volta, para o contorno e as partes que saem do quadro
  const filtro = `<filter id="c" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="1.6" result="b"/><feFlood flood-color="${contorno}"/><feComposite in2="b" operator="in" result="w"/><feMerge><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  const corpo = limpar(desenho.outerHTML).replace(/^<g /, '<g filter="url(#c)" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="-6 -6 60 60"><defs>${filtro}${recorte ? recorte.outerHTML : ''}</defs>${corpo}</svg>`;
}

/** Desenha o SVG num quadro de `px` pixels e devolve um PNG: a tela de alta densidade ganha um cursor nítido. */
function pngDoSvg(svg: string, px: number): Promise<string | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const tela = document.createElement('canvas');
      tela.width = tela.height = px;
      const ctx = tela.getContext('2d');
      if (!ctx) return ok(null);
      ctx.drawImage(img, 0, 0, px, px);
      try {
        ok(tela.toDataURL('image/png'));
      } catch {
        ok(null);
      }
    };
    img.onerror = () => ok(null);
    img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  });
}

let pedidoCursor = 0;
/** Põe o meu cursor no meu mouse, inclusive sobre o que é clicável (sem piscar para a mãozinha a cada item); onde
    se digita, fica o cursor de texto.
    Em tela de alta densidade (Retina), vai uma versão com o dobro de pixels, para não borrar. */
export async function aplicarCursorNoMouse(id: string, cor: string) {
  const raiz = document.documentElement;
  const meu = ++pedidoCursor;
  const tirar = () => (raiz.style.removeProperty('--cursor-meu'), raiz.classList.remove('com-cursor-meu'));
  if (!cursorNoMouse() || window.matchMedia?.('(pointer: coarse)').matches) return tirar();
  const contorno = getComputedStyle(raiz).getPropertyValue('--contorno-cursor').trim() || '#fff';
  const tam = 32;
  const svg = svgDoCursor(id, cor, contorno, tam);
  if (!svg) return;
  const ponta = Math.round(((5 + 6) * tam) / 60); // a ponta do desenho, na escala do cursor
  const [um, dois] = await Promise.all([pngDoSvg(svg, tam), pngDoSvg(svg, tam * 2)]);
  if (meu !== pedidoCursor) return; // outro pedido mais novo já está a caminho
  if (!um) return tirar();
  const opcoes = dois
    ? [`image-set(url("${um}") 1x, url("${dois}") 2x) ${ponta} ${ponta}, auto`, `-webkit-image-set(url("${um}") 1x, url("${dois}") 2x) ${ponta} ${ponta}, auto`]
    : [];
  const valor = opcoes.find((v) => CSS.supports?.('cursor', v)) ?? `url("${um}") ${ponta} ${ponta}, auto`;
  raiz.style.setProperty('--cursor-meu', valor);
  raiz.classList.add('com-cursor-meu');
}
