import { useEffect, useState } from 'react';

/* O teclado do celular (#198): o redator escreve com ele aberto, e o que fica no pé da tela (a barra de tipos, a folha de
   baixo do comentário) sobe para ficar acima dele. O teclado não muda a janela (o layout), só o visualViewport: a
   diferença entre os dois é o que ele cobre. A altura vai para o `--teclado` da página (e `data-teclado="aberto"`), para o
   CSS de quem fica no pé usar. */

/** Abaixo disto, é a barra do navegador que some ou volta ao rolar, não o teclado. */
const MINIMO = 80;

interface Visivel {
  height: number;
  offsetTop: number;
}

/** Quanto o teclado cobre do pé da janela, em px (0 sem ele). */
export function alturaDoTeclado(alturaDaJanela: number, visivel: Visivel | null | undefined): number {
  if (!visivel) return 0;
  const coberto = Math.round(alturaDaJanela - visivel.height - visivel.offsetTop);
  return coberto >= MINIMO ? coberto : 0;
}

/** Acompanha o teclado enquanto `ativo` (no celular): devolve a altura e a põe no `--teclado` da página. */
export function useTecladoNaTela(ativo: boolean): number {
  const [altura, setAltura] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!ativo || !vv) return;
    const raiz = document.documentElement;
    const medir = () => {
      const a = alturaDoTeclado(window.innerHeight, vv);
      setAltura(a);
      raiz.style.setProperty('--teclado', `${a}px`);
      raiz.style.setProperty('--altura-visivel', `${Math.round(vv.height)}px`);
      if (a) raiz.dataset.teclado = 'aberto';
      else delete raiz.dataset.teclado;
    };
    medir();
    vv.addEventListener('resize', medir);
    vv.addEventListener('scroll', medir);
    return () => {
      vv.removeEventListener('resize', medir);
      vv.removeEventListener('scroll', medir);
      raiz.style.removeProperty('--teclado');
      raiz.style.removeProperty('--altura-visivel');
      delete raiz.dataset.teclado;
      setAltura(0);
    };
  }, [ativo]);
  return altura;
}
