import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { SUAVE } from './topoDaAgenda';
import { semMovimento } from './util';

/* A troca de semana do computador (as setas e o "voltar para hoje"). As sete colunas ficam no lugar; o que é da semana
   que sai (os cards, o "nada ainda", as marcas do dia) anda 10px para o lado contrário ao da troca e some, e só então a
   semana nova entra: os cards chegam do outro lado, enquanto os números dos dias e o período contam (topoDaAgenda.tsx).
   É o movimento do celular: lá a faixa anda para o lado e o "voltar para hoje" anda junto com o conteúdo, 10px.
   Uma troca pedida no meio de outra continua de onde a tela está (toques seguidos somam). Com o movimento reduzido,
   só a troca. */

/** Quanto a semana que sai leva sumindo (como a prioridade que some) e quanto a nova leva entrando (como o "voltar
    para hoje"), em ms, e quanto elas andam de lado, em px. */
const SAI_MS = 130;
const ENTRA_MS = 220;
const ANDA_PX = 10;

export interface TrocaDeSemana {
  /** A semana na tela: chega ao alvo quando a que estava termina de sair. */
  mostrada: number;
  /** Para que lado foi a última troca: 1 para a frente, -1 para trás. */
  sentido: 1 | -1;
}

/**
 * Leva a semana na tela até `alvo` (o deslocamento que as setas pediram), em `raiz`: `sai` são os elementos da semana
 * que sai (some antes da troca) e `entra`, os da que entra (chega depois). Desligada (o celular), só troca.
 */
export function useTrocaDeSemana(raiz: RefObject<HTMLElement | null>, alvo: number, sai: string, entra: string, ligada: boolean): TrocaDeSemana {
  const [estado, setEstado] = useState<TrocaDeSemana & { vez: number }>({ mostrada: alvo, sentido: 1, vez: 0 });
  const alvoAgora = useRef(alvo);
  alvoAgora.current = alvo;
  const saindo = useRef<Animation[] | null>(null);
  const entrando = useRef<Animation[]>([]);
  const entrar = useRef(false);

  useEffect(() => {
    // uma saída em andamento já leva ao alvo mais novo quando terminar
    if (alvo === estado.mostrada || saindo.current) return;
    const sentido = alvo > estado.mostrada ? 1 : -1;
    const el = raiz.current;
    if (!ligada || !el || semMovimento() || typeof Animation === 'undefined') {
      setEstado((e) => ({ mostrada: alvo, sentido, vez: e.vez + 1 }));
      return;
    }
    // sai de onde está na tela (a semana anterior pode estar ainda entrando)
    const itens = [...el.querySelectorAll<HTMLElement>(sai)];
    const de = itens.map((e) => {
      const cs = getComputedStyle(e);
      return { opacity: cs.opacity, transform: cs.transform === 'none' ? 'translateX(0px)' : cs.transform };
    });
    entrando.current.forEach((a) => a.cancel());
    entrando.current = [];
    const estas = itens.map((e, i) => e.animate([de[i], { opacity: 0, transform: `translateX(${-ANDA_PX * sentido}px)` }], { duration: SAI_MS, easing: 'ease-out', fill: 'forwards' }));
    saindo.current = estas;
    const trocar = () => {
      if (saindo.current !== estas) return;
      entrar.current = true;
      // a semana do alvo de agora (outro toque no meio da saída soma); se ele voltou para a mesma, ela entra de novo
      setEstado((e) => ({ mostrada: alvoAgora.current, sentido: alvoAgora.current === e.mostrada ? (-sentido as 1 | -1) : alvoAgora.current > e.mostrada ? 1 : -1, vez: e.vez + 1 }));
    };
    if (!estas.length) trocar();
    else void Promise.all(estas.map((a) => a.finished)).then(trocar, () => undefined);
  }, [alvo, estado.mostrada]); // eslint-disable-line react-hooks/exhaustive-deps

  // a semana nova já está na tela, antes de pintar: o que ficou da que saiu volta ao normal e a nova entra
  useLayoutEffect(() => {
    if (!entrar.current) return;
    entrar.current = false;
    saindo.current?.forEach((a) => a.cancel());
    saindo.current = null;
    const el = raiz.current;
    if (!el || semMovimento()) return;
    const d = ANDA_PX * estado.sentido;
    entrando.current = [...el.querySelectorAll<HTMLElement>(entra)].map((e) =>
      e.animate([{ opacity: 0, transform: `translateX(${d}px)` }, { opacity: 1, transform: 'translateX(0px)' }], { duration: ENTRA_MS, easing: SUAVE, fill: 'backwards' }),
    );
  }, [estado.vez]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      saindo.current?.forEach((a) => a.cancel());
      entrando.current.forEach((a) => a.cancel());
    },
    [],
  );
  return { mostrada: estado.mostrada, sentido: estado.sentido };
}

/* A troca de critério (exibição, entrada, entrega): cada card voa da coluna antiga para a nova (FLIP), em 640 ms, na
   curva --suave, com um arco leve por cima dos outros. Quem sai da agenda à vista (vai para outra semana ou para os
   dias anteriores) anda 10px para o lado contrário e some, desenhado no lugar antigo; quem entra chega do outro lado.
   Quando a semana muda de começo (por entrada, ela termina hoje), os cabeçalhos dos dias trocam com o mesmo esmaecer
   de 10px, enquanto os números contam (topoDaAgenda.tsx). A outra data no pé de cada card troca com um esmaecer curto.
   Com o movimento reduzido, só a troca. */

const VOO_MS = 640;
const SOME_MS = 160;
const CHEGA_MS = 260;
const CHEGA_ATRASO_MS = 200;
const CABECALHO_ATRASO_MS = 130;
const PE_MS = 420;

interface Foto {
  el: HTMLElement;
  /** Na página (com a rolagem), para o voo não contar a página que rolou. */
  x: number;
  y: number;
  largura: number;
  /** Estava à vista (dentro da faixa que rola, se ela rola): só quem estava à vista deixa o fantasma. */
  aVista: boolean;
}

/** O retângulo à vista do elemento: o dele recortado pelas caixas que rolam ou cortam em volta (a semana estreita, a
    faixa do celular). */
function aVista(el: HTMLElement): boolean {
  let r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p);
    if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
    const c = p.getBoundingClientRect();
    const [l, t, d, b] = [Math.max(r.left, c.left), Math.max(r.top, c.top), Math.min(r.right, c.right), Math.min(r.bottom, c.bottom)];
    if (d - l < 1 || b - t < 1) return false;
    r = new DOMRect(l, t, d - l, b - t);
  }
  return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
}

function fotografarCards(raiz: HTMLElement): Map<string, Foto> {
  const fotos = new Map<string, Foto>();
  for (const el of raiz.querySelectorAll<HTMLElement>('[data-card]')) {
    if (el.closest('.saindo, .camada-voo') || !el.offsetParent) continue;
    const r = el.getBoundingClientRect();
    fotos.set(el.dataset.card ?? '', { el, x: r.left + scrollX, y: r.top + scrollY, largura: r.width, aVista: aVista(el) });
  }
  return fotos;
}

/**
 * Anima a troca de critério da agenda em `raiz` (a seção No Trello). `inicio`: o primeiro dia da semana à vista contado
 * de hoje, que diz para que lado a agenda andou. `camada`: onde ficam os fantasmas de quem saiu. Devolve se esta
 * renderização é a da troca: nela, as vagas não abrem nem fecham (os cards voam).
 */
export function useTrocaDeCriterio(raiz: RefObject<HTMLElement | null>, camada: RefObject<HTMLElement | null>, criterio: string, inicio: number): boolean {
  const ultimo = useRef({ criterio, inicio });
  const animacoes = useRef<Animation[]>([]);
  const trocando = ultimo.current.criterio !== criterio;
  // a foto de antes: na renderização, antes de o React mexer na tela
  const foto = trocando && raiz.current && !semMovimento() && typeof Animation !== 'undefined' ? fotografarCards(raiz.current) : null;

  useLayoutEffect(() => {
    const antes = ultimo.current;
    ultimo.current = { criterio, inicio };
    if (antes.criterio === criterio) return;
    const el = raiz.current;
    if (!foto || !el) return;
    animacoes.current.forEach((a) => a.cancel());
    animacoes.current = [];
    camada.current?.replaceChildren();
    const lado = Math.sign(inicio - antes.inicio) || 1;
    const vao = (a: Animation) => animacoes.current.push(a);
    const agora = new Map<string, HTMLElement>();
    for (const c of el.querySelectorAll<HTMLElement>('[data-card]')) if (!c.closest('.saindo, .camada-voo') && c.offsetParent) agora.set(c.dataset.card ?? '', c);

    for (const [id, c] of agora) {
      const f = foto.get(id);
      if (!f) {
        // entrou na agenda à vista: chega do outro lado, quando os outros já estão a caminho
        vao(c.animate([{ opacity: 0, transform: `translateX(${ANDA_PX * lado}px)` }, { opacity: 1, transform: 'none' }], { duration: CHEGA_MS, delay: CHEGA_ATRASO_MS, easing: SUAVE, fill: 'backwards' }));
        continue;
      }
      const pe = c.querySelector<HTMLElement>('.card-outra');
      if (pe) vao(pe.animate([{ opacity: 0, transform: 'translateY(-2px)' }, { opacity: 1, transform: 'none' }], { duration: PE_MS, easing: SUAVE }));
      const r = c.getBoundingClientRect();
      const dx = f.x - (r.left + scrollX);
      const dy = f.y - (r.top + scrollY);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      // um arco leve: quem vai longe sobe um pouco no meio do caminho, por cima dos outros
      const arco = Math.min(18, Math.hypot(dx, dy) * 0.04);
      c.classList.add('voando');
      const a = c.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: `translate(${dx * 0.42}px, ${dy * 0.42 - arco}px)`, offset: 0.35 }, { transform: 'none' }],
        { duration: VOO_MS, easing: SUAVE },
      );
      const fim = () => c.classList.remove('voando');
      a.onfinish = fim;
      a.oncancel = fim;
      vao(a);
    }

    // saiu da agenda à vista: um fantasma no lugar antigo anda 10px para trás e some
    const base = camada.current;
    if (base) {
      const b = base.getBoundingClientRect();
      for (const [id, f] of foto) {
        if (agora.has(id) || !f.aVista) continue;
        const g = f.el.cloneNode(true) as HTMLElement;
        g.removeAttribute('data-card');
        g.classList.remove('voando', 'deslizando');
        Object.assign(g.style, { position: 'absolute', left: `${f.x - (b.left + scrollX)}px`, top: `${f.y - (b.top + scrollY)}px`, width: `${f.largura}px`, margin: '0' });
        base.appendChild(g);
        const a = g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-ANDA_PX * lado}px)` }], { duration: SOME_MS, easing: 'ease-out', fill: 'forwards' });
        const tirar = () => g.remove();
        a.onfinish = tirar;
        a.oncancel = tirar;
        vao(a);
      }
    }

    // a semana mudou de começo: os cabeçalhos dos dias chegam do outro lado
    if (inicio !== antes.inicio) {
      for (const t of el.querySelectorAll<HTMLElement>('.coluna-topo')) vao(t.animate([{ opacity: 0, transform: `translateX(${ANDA_PX * lado}px)` }, { opacity: 1, transform: 'none' }], { duration: ENTRA_MS, delay: CABECALHO_ATRASO_MS, easing: SUAVE, fill: 'backwards' }));
    }
  });

  useEffect(() => () => animacoes.current.forEach((a) => a.cancel()), []);
  return trocando;
}
