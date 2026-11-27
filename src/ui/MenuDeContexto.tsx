import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icone, type NomeIcone } from './icones';

/** Um item do menu de contexto: o nome, o ícone e o que ele faz. */
export interface ItemDoMenu {
  nome: string;
  icone: NomeIcone;
  fazer: () => void;
}

/** A folga do menu até a borda da janela. */
const FOLGA = 8;

/**
 * O menu de contexto (o clique direito) no ponto do clique, por cima de tudo (no corpo da página, fora do card que pode
 * estar se mexendo), e sempre dentro da janela. O primeiro item recebe o foco; fecha no clique fora, no Esc, quando a
 * janela muda de tamanho e ao escolher um item.
 */
export function MenuDeContexto({ x, y, rotulo, itens, fechar }: { x: number; y: number; rotulo: string; itens: ItemDoMenu[]; fechar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [lugar, setLugar] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const e = caixa.current;
    if (!e) return;
    const { width, height } = e.getBoundingClientRect();
    setLugar({ left: Math.max(FOLGA, Math.min(x, innerWidth - width - FOLGA)), top: Math.max(FOLGA, Math.min(y, innerHeight - height - FOLGA)) });
    e.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [x, y]);
  useEffect(() => {
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && fechar();
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      fechar();
    };
    window.addEventListener('pointerdown', fora, true);
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('resize', fechar);
    return () => {
      window.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('resize', fechar);
    };
  }, [fechar]);
  return createPortal(
    <div ref={caixa} className="menu menu-de-contexto" role="menu" aria-label={rotulo} style={lugar} onContextMenu={(e) => e.preventDefault()}>
      {itens.map((it) => (
        <button
          key={it.nome}
          type="button"
          role="menuitem"
          className="menu-item"
          onClick={() => {
            fechar();
            it.fazer();
          }}
        >
          <Icone nome={it.icone} tam={15} traco={1.9} />
          <span className="menu-texto">{it.nome}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
