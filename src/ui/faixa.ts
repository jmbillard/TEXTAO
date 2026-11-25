import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { diasAVista } from './fila';
import { ehCelular, semMovimento, TELA_DE_CELULAR } from './util';

/* A faixa de dias do celular (a agenda No Trello até 600px): a rolagem, o encaixe por dia, a inércia e o gesto são
   os nativos do navegador (estilos.css). Este código não mexe na faixa durante o arrasto: ele só a põe em hoje antes
   de pintar, lê onde ela parou quando a rolagem termina e rola suave quando as setas ou o "voltar para hoje" pedem. */

const assinarTela = (aviso: () => void) => {
  const m = typeof window !== 'undefined' ? window.matchMedia?.(TELA_DE_CELULAR) : undefined;
  m?.addEventListener('change', aviso);
  return () => m?.removeEventListener('change', aviso);
};

/** A tela é de celular, acompanhando a largura (girar o aparelho troca a agenda de dois dias pela semana). */
export const useTelaDeCelular = () => useSyncExternalStore(assinarTela, ehCelular, () => false);

/** Sem o scrollend (o Safari antigo), a rolagem parada por tanto tempo conta como terminada. */
const PARADA_MS = 140;

export interface Faixa {
  /** Os dois dias à vista (as posições na faixa), lidos só quando a rolagem termina: nunca no meio do gesto. */
  vista: [number, number];
  /** Para que lado a faixa andou na última troca dos dias à vista: 1 para a frente, -1 para trás. */
  sentido: 1 | -1;
  /** Rola suave até o dia (a posição na faixa) ficar na ponta esquerda. */
  ir: (dia: number) => void;
  /** Anda tantos dias a partir de onde a faixa está (ou de onde ela já está indo: toques seguidos somam). */
  andar: (dias: number) => void;
}

/**
 * A faixa em `raiz` (as colunas são os filhos dela): abre com `inicio` e o dia seguinte à vista, posicionada antes de
 * pintar, e volta para lá quando `abertura` muda: a faixa apareceu (a tela estreitou) ou ganhou outro primeiro dia
 * (a virada do dia). Sem a faixa na tela (o computador), não faz nada.
 */
export function useFaixa(raiz: RefObject<HTMLElement | null>, quantos: number, inicio: number, abertura: string): Faixa {
  const [{ vista, sentido }, setVista] = useState<{ vista: [number, number]; sentido: 1 | -1 }>(() => ({ vista: [inicio, inicio + 1], sentido: 1 }));
  // aonde as setas mandaram a faixa, enquanto ela ainda rola até lá
  const alvo = useRef<number | null>(null);
  const larguraDoDia = useCallback(() => {
    const cols = raiz.current?.children;
    return cols && cols.length > 1 ? (cols[1] as HTMLElement).offsetLeft - (cols[0] as HTMLElement).offsetLeft : 0;
  }, [raiz]);
  const onde = useCallback(() => (raiz.current ? diasAVista(raiz.current.scrollLeft, larguraDoDia(), quantos) : vista), [raiz, larguraDoDia, quantos, vista]);

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    el.scrollLeft = inicio * larguraDoDia();
    alvo.current = null;
    setVista((v) => ({ vista: [inicio, inicio + 1], sentido: inicio < v.vista[0] ? -1 : 1 }));
  }, [raiz, larguraDoDia, inicio, abertura]);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const parou = () => {
      alvo.current = null;
      const [a, b] = diasAVista(el.scrollLeft, larguraDoDia(), quantos);
      setVista((v) => (v.vista[0] === a ? v : { vista: [a, b], sentido: a > v.vista[0] ? 1 : -1 }));
    };
    if ('onscrollend' in window) {
      el.addEventListener('scrollend', parou);
      return () => el.removeEventListener('scrollend', parou);
    }
    let t: ReturnType<typeof setTimeout> | undefined;
    const rolou = () => {
      clearTimeout(t);
      t = setTimeout(parou, PARADA_MS);
    };
    el.addEventListener('scroll', rolou, { passive: true });
    return () => {
      clearTimeout(t);
      el.removeEventListener('scroll', rolou);
    };
    // `abertura` também troca quando a faixa aparece (a tela estreitou): só então ela existe para ouvir
  }, [raiz, larguraDoDia, quantos, abertura]);

  const ir = useCallback(
    (dia: number) => {
      const el = raiz.current;
      if (!el) return;
      alvo.current = Math.max(0, Math.min(quantos - 2, dia));
      el.scrollTo({ left: alvo.current * larguraDoDia(), behavior: semMovimento() ? 'auto' : 'smooth' });
    },
    [raiz, larguraDoDia, quantos],
  );
  const andar = useCallback((dias: number) => ir((alvo.current ?? onde()[0]) + dias), [ir, onde]);
  return { vista, sentido, ir, andar };
}
