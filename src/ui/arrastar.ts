import { useCallback, useEffect, useRef, useState } from 'react';

/* Montar a pauta, o arrastar (#126): pelos eventos de ponteiro, para valer igual no mouse e no dedo (o arrastar nativo
   do navegador não funciona no tablet). No mouse, o item inteiro arrasta (depois de andar uns pixels, para o clique
   continuar clique); no dedo, só a alça (⠿), que não rola a página, e o resto do item rola como sempre.
   Cada item arrastável chama `iniciar(item)` no onPointerDown; cada lugar que recebe tem `data-solta="tipo:id"` (a
   demanda, "demanda:posicao:id"). Perto da borda da janela, a página rola sozinha; Esc cancela. */

/** O item arrastado; 'producao' é uma claquete da lista das Produções (#199), pela chave. */
export type ItemArrastado = { tipo: 'lista' | 'demanda' | 'pessoa' | 'producao'; id: string };
export type LugarDeSoltar = { tipo: 'posicao' | 'turno' | 'lista'; id: string; antesDe: string | null };

/** O lugar de um `data-solta`: "posicao:id", "turno:id", "lista" ou "demanda:posicao:id" (antes daquela demanda). */
export function lerLugar(valor: string): LugarDeSoltar | null {
  const [tipo, a = '', b = ''] = valor.split(':');
  if (tipo === 'posicao' || tipo === 'turno') return a ? { tipo, id: a, antesDe: null } : null;
  if (tipo === 'lista') return { tipo, id: '', antesDe: null };
  if (tipo === 'demanda') return a && b ? { tipo: 'posicao', id: a, antesDe: b } : null;
  return null;
}

const BORDA = 64;
const ANDAR_NO_MOUSE = 5;

/**
 * @param aceita se o item pode ir para o lugar
 * @param soltar o que fazer quando o item é solto num lugar que aceita
 */
export function useArrastar(aceita: (item: ItemArrastado, lugar: LugarDeSoltar) => boolean, soltar: (item: ItemArrastado, lugar: LugarDeSoltar) => void) {
  const [arrastado, setArrastado] = useState<ItemArrastado | null>(null);
  // o data-solta do lugar em que o item está agora (para destacar), ou ''
  const [sobre, setSobre] = useState('');
  const regras = useRef({ aceita, soltar });
  regras.current = { aceita, soltar };
  const cancelar = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelar.current?.(), []);

  const iniciar = useCallback(
    (item: ItemArrastado) => (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || cancelar.current) return;
      const alvo = e.target as HTMLElement;
      const naAlca = !!alvo.closest('.arrasto-alca');
      // no dedo e na caneta, só pela alça; no mouse, não pelos campos e botões (a não ser a alça)
      if (e.pointerType !== 'mouse' && !naAlca) return;
      if (!naAlca && alvo.closest('input, textarea, select, button, a')) return;
      const origem = e.currentTarget;
      const inicio = { x: e.clientX, y: e.clientY };
      const caixa = origem.getBoundingClientRect();
      const pega = { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
      let comecou = false;
      let fantasma: HTMLElement | null = null;
      let lugar: { valor: string; lugar: LugarDeSoltar } | null = null;
      let ultimoY = e.clientY;
      let quadro = 0;
      if (naAlca) e.preventDefault();

      const comecar = () => {
        comecou = true;
        fantasma = origem.cloneNode(true) as HTMLElement;
        fantasma.classList.add('arrasto-fantasma');
        fantasma.removeAttribute('data-solta');
        fantasma.setAttribute('aria-hidden', 'true');
        Object.assign(fantasma.style, { width: `${caixa.width}px`, left: '0px', top: '0px' });
        document.body.appendChild(fantasma);
        document.body.classList.add('arrastando');
        setArrastado(item);
        const rolar = () => {
          const passo = ultimoY < BORDA ? -14 : ultimoY > innerHeight - BORDA ? 14 : 0;
          if (passo) window.scrollBy(0, passo);
          quadro = requestAnimationFrame(rolar);
        };
        quadro = requestAnimationFrame(rolar);
      };
      const mover = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        if (!comecou) {
          const andou = Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y);
          if (!naAlca && andou < ANDAR_NO_MOUSE) return;
          comecar();
        }
        ev.preventDefault();
        ultimoY = ev.clientY;
        fantasma!.style.transform = `translate(${ev.clientX - pega.x}px, ${ev.clientY - pega.y}px)`;
        const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-solta]');
        const valor = el?.dataset.solta ?? '';
        const l = valor ? lerLugar(valor) : null;
        lugar = l && regras.current.aceita(item, l) ? { valor, lugar: l } : null;
        setSobre(lugar?.valor ?? '');
      };
      const fim = (soltou: boolean) => {
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', solto);
        window.removeEventListener('pointercancel', cancelado);
        window.removeEventListener('keydown', esc, true);
        cancelAnimationFrame(quadro);
        fantasma?.remove();
        document.body.classList.remove('arrastando');
        cancelar.current = null;
        setArrastado(null);
        setSobre('');
        if (!comecou) return;
        // o clique que o mouse solta no fim do arrastar não conta
        const engolir = (ev: MouseEvent) => ev.stopPropagation();
        window.addEventListener('click', engolir, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', engolir, { capture: true }), 0);
        if (soltou && lugar) regras.current.soltar(item, lugar.lugar);
      };
      const solto = (ev: PointerEvent) => ev.pointerId === e.pointerId && fim(true);
      const cancelado = (ev: PointerEvent) => ev.pointerId === e.pointerId && fim(false);
      const esc = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape' || !comecou) return;
        ev.preventDefault();
        ev.stopPropagation();
        fim(false);
      };
      cancelar.current = () => fim(false);
      window.addEventListener('pointermove', mover, { passive: false });
      window.addEventListener('pointerup', solto);
      window.addEventListener('pointercancel', cancelado);
      window.addEventListener('keydown', esc, true);
    },
    [],
  );
  return { arrastado, sobre, iniciar };
}
