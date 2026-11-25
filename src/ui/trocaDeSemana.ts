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
