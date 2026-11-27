import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent as PointerDoReact, type RefObject } from 'react';
import { moverAPraca } from '../modelo/producoesPorPraca';
import { semMovimento } from './util';

/* O movimento da tela de produções (#159): o que muda de lugar desliza em vez de pular, e as praças se arrumam
   arrastando. Rápido (de 150 a 250 ms), na curva --suave, e nada com prefers-reduced-motion. */

/** A curva --suave de estilos.css, para as animações feitas aqui. */
const SUAVE = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const DURACAO_DO_DESLIZE = 240;
/** Mais do que isso de uma vez (uma releitura que muda a tela toda) não desliza: o olho não acompanha. */
const MAX_DESLIZANDO = 30;

const animacoes = new WeakMap<Element, Animation>();

/**
 * Deslize (FLIP) dos elementos da raiz que casam com o seletor, pelo atributo que os identifica (o card pela
 * data-producao, o bloco pela data-praca): quando a disposição muda, o que mudou de lugar desliza da posição antiga até
 * a nova (o card que vai de uma coluna para outra, os vizinhos que abrem ou fecham o espaço), e o que chegou agora
 * aparece subindo de leve (com prefers-reduced-motion, os dois só esmaecem). A foto de antes é tirada na renderização,
 * antes de o React mexer na tela. A primeira disposição (a tela que acabou de ler) não anima.
 * @param chegada o que chegou agora aparece subindo (padrão); sem ela, só o que mudou de lugar desliza (a chegada fica
 *   com o CSS, como a cascata da busca, #161)
 */
export function useDeslize(raiz: RefObject<HTMLElement | null>, seletor: string, atributo: string, disposicao: string, { chegada = true } = {}) {
  const ultima = useRef('');
  const fotografar = () => {
    const el = raiz.current;
    if (!el || !ultima.current || ultima.current === disposicao) return null;
    return new Map([...el.querySelectorAll<HTMLElement>(seletor)].map((e) => [e.getAttribute(atributo) ?? '', e.getBoundingClientRect()]));
  };
  const antes = fotografar();
  useLayoutEffect(() => {
    ultima.current = disposicao;
    const el = raiz.current;
    if (!antes || !el) return;
    const agora = [...el.querySelectorAll<HTMLElement>(seletor)];
    for (const e of agora) animacoes.get(e)?.cancel();
    // com prefers-reduced-motion, nada desliza: o que mudou de lugar ou chegou só esmaece no lugar novo
    const parado = semMovimento();
    const mudancas = agora.flatMap((e): { e: HTMLElement; quadros: Keyframe[] }[] => {
      const de = antes.get(e.getAttribute(atributo) ?? '');
      const para = e.getBoundingClientRect();
      if (!de && !chegada) return [];
      const mudou = !de || Math.abs(de.left - para.left) > 0.5 || Math.abs(de.top - para.top) > 0.5;
      if (parado) return mudou ? [{ e, quadros: [{ opacity: 0 }, { opacity: 1 }] }] : [];
      if (!de) return [{ e, quadros: [{ opacity: 0, transform: 'translateY(6px) scale(0.98)' }, { opacity: 1, transform: 'none' }] }];
      const dx = de.left - para.left;
      const dy = de.top - para.top;
      return Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 ? [{ e, quadros: [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }] }] : [];
    });
    if (mudancas.length > MAX_DESLIZANDO) return;
    for (const { e, quadros } of mudancas) {
      e.classList.add('deslizando');
      const a = e.animate(quadros, { duration: DURACAO_DO_DESLIZE, easing: SUAVE });
      animacoes.set(e, a);
      const fim = () => animacoes.get(e) === a && e.classList.remove('deslizando');
      a.onfinish = fim;
      a.oncancel = fim;
    }
  });
}

/** Perto da borda da área (ou da janela, no celular), a área rola sozinha enquanto a praça está no ar. */
const BORDA = 56;
const PASSO = 14;
/** No mouse, o arrasto começa depois de andar uns pixels, para o clique continuar clique. */
const ANDAR_NO_MOUSE = 5;

/**
 * Arrumar as praças arrastando (#159): o bloco inteiro, pela faixa do nome. No mouse, a faixa toda; no dedo e na caneta,
 * a alça (⠿) da faixa, que não rola a página (o resto rola como sempre). Com a praça no ar, as outras abrem o lugar
 * dela na hora (`mudar`, com o deslize da tela); solta, ela assenta no lugar e a ordem fica (`soltar`). Esc cancela e
 * volta a ordem de antes. `eixo`: lado a lado ('x', no computador e no tablet) ou uma embaixo da outra ('y', no celular).
 */
export function useReordenar(area: RefObject<HTMLElement | null>, ordem: readonly string[], eixo: 'x' | 'y', mudar: (ordem: string[]) => void, soltar: (ordem: string[]) => void) {
  const [levantada, setLevantada] = useState<string | null>(null);
  const atual = useRef(ordem);
  atual.current = ordem;
  const regras = useRef({ mudar, soltar, eixo });
  regras.current = { mudar, soltar, eixo };
  // depois de cada mudança de ordem, a praça no ar volta para baixo do ponteiro
  const posicionar = useRef<(() => void) | null>(null);
  useLayoutEffect(() => posicionar.current?.());

  const iniciar = useCallback(
    (praca: string) => (e: PointerDoReact<HTMLElement>) => {
      const raiz = area.current;
      if (e.button !== 0 || !raiz || posicionar.current) return;
      const alvo = e.target as HTMLElement;
      const naAlca = !!alvo.closest('.prod-alca');
      if (e.pointerType !== 'mouse' && !naAlca) return;
      if (!naAlca && alvo.closest('button, a, input')) return;
      const bloco = e.currentTarget.closest<HTMLElement>('.prod-bloco');
      if (!bloco) return;
      if (naAlca) e.preventDefault();
      const { eixo: no } = regras.current;
      const de = [...atual.current];
      const inicio = { x: e.clientX, y: e.clientY };
      let ultimo = inicio;
      let comecou = false;
      let quadro = 0;
      const lugar = (b: HTMLElement) => (no === 'x' ? b.offsetLeft : b.offsetTop);
      const tamanho = (b: HTMLElement) => (no === 'x' ? b.offsetWidth : b.offsetHeight);
      const naArea = (p: { x: number; y: number }) => {
        const r = raiz.getBoundingClientRect();
        return no === 'x' ? p.x - r.left + raiz.scrollLeft : p.y - r.top + raiz.scrollTop;
      };
      const pega = naArea(inicio) - lugar(bloco);

      const colocar = () => {
        const centro = naArea(ultimo) - pega + tamanho(bloco) / 2;
        const outros = [...raiz.querySelectorAll<HTMLElement>(':scope > .prod-bloco')].filter((b) => b !== bloco);
        const i = outros.filter((b) => lugar(b) + tamanho(b) / 2 < centro).length;
        const nova = moverAPraca(atual.current, praca, i);
        if (nova.join('\n') !== atual.current.join('\n')) {
          atual.current = nova;
          regras.current.mudar(nova);
        }
        const d = naArea(ultimo) - pega - lugar(bloco);
        bloco.style.transform = no === 'x' ? `translateX(${d}px)` : `translateY(${d}px)`;
      };
      const comecar = () => {
        comecou = true;
        posicionar.current = colocar;
        document.body.classList.add('prod-reordenando');
        setLevantada(praca);
        const rolar = () => {
          if (no === 'x') {
            const r = raiz.getBoundingClientRect();
            const passo = ultimo.x < r.left + BORDA ? -PASSO : ultimo.x > r.right - BORDA ? PASSO : 0;
            if (passo) {
              raiz.scrollLeft += passo;
              colocar();
            }
          } else {
            const passo = ultimo.y < BORDA ? -PASSO : ultimo.y > innerHeight - BORDA ? PASSO : 0;
            if (passo) {
              scrollBy(0, passo);
              colocar();
            }
          }
          quadro = requestAnimationFrame(rolar);
        };
        quadro = requestAnimationFrame(rolar);
      };
      const mover = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        ultimo = { x: ev.clientX, y: ev.clientY };
        if (!comecou) {
          if (!naAlca && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < ANDAR_NO_MOUSE) return;
          comecar();
        }
        ev.preventDefault();
        colocar();
      };
      const fim = (ficou: boolean) => {
        removeEventListener('pointermove', mover);
        removeEventListener('pointerup', solto);
        removeEventListener('pointercancel', cancelado);
        removeEventListener('keydown', esc, true);
        cancelAnimationFrame(quadro);
        posicionar.current = null;
        if (!comecou) return;
        document.body.classList.remove('prod-reordenando');
        // o clique que o mouse solta no fim do arrasto não abre nem fecha a praça
        const engolir = (ev: MouseEvent) => ev.stopPropagation();
        addEventListener('click', engolir, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', engolir, { capture: true }), 0);
        // a praça assenta no lugar dela, de onde estava no ar
        const noAr = bloco.style.transform;
        bloco.style.transform = '';
        setLevantada(null);
        if (ficou) regras.current.soltar([...atual.current]);
        else regras.current.mudar(de);
        // (o deslize da tela, se a ordem voltou atrás, troca esta animação pela dele, que parte do mesmo lugar)
        if (noAr && !semMovimento()) animacoes.set(bloco, bloco.animate([{ transform: noAr }, { transform: 'none' }], { duration: DURACAO_DO_DESLIZE, easing: SUAVE }));
      };
      const solto = (ev: PointerEvent) => ev.pointerId === e.pointerId && fim(true);
      const cancelado = (ev: PointerEvent) => ev.pointerId === e.pointerId && fim(false);
      const esc = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape' || !comecou) return;
        ev.preventDefault();
        ev.stopPropagation();
        fim(false);
      };
      addEventListener('pointermove', mover, { passive: false });
      addEventListener('pointerup', solto);
      addEventListener('pointercancel', cancelado);
      addEventListener('keydown', esc, true);
    },
    [area],
  );
  return { levantada, iniciar };
}
