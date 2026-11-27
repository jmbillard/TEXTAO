import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { mesPorExtenso, periodoNaContagem, posicaoNaContagem, type EixoDoPeriodo, type PartesDoPeriodo } from './fila';
import { DIAS_POR_EXTENSO } from './pecasDaPauta';
import { SUAVE, type Contagem } from './topoDaAgenda';
import { semMovimento } from './util';

/* A troca de dia ou de semana da Pauta da edição (#162), o movimento da agenda (trocaDeSemana.ts) um pouco mais largo:
   o que é do período que sai (os elementos com a classe `desliza`) anda para o lado contrário ao da navegação e some;
   só então o período novo entra, chegando do lado da navegação, em cascata curta. Um toque no meio de outra troca
   continua de onde a tela está. Com o movimento reduzido, só esmaece. */

/** Quanto o período que sai leva sumindo e quanto o novo leva entrando, em ms; quanto andam de lado, em px; e o atraso
    da cascata (por elemento, até o teto). */
const SAI_MS = 150;
const ENTRA_MS = 220;
const ANDA_PX = 22;
const CASCATA_MS = 10;
const CASCATA_TETO_MS = 80;
const REDUZIDO_MS = 140;

const ELEMENTOS = '.desliza';

/** O dia (AAAA-MM-DD) como um número que anda de um em um: a troca sabe o sentido pela diferença. */
export const numeroDoDia = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
export const diaDoNumero = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/* ---------- os contadores (#170): o seletor de datas e os números contam como os da agenda (topoDaAgenda.tsx) ---------- */

/** Onde o período da Pauta conta: as posições são os números dos dias (numeroDoDia); a Semana cobre sete, o Dia, um;
    o mês por extenso, como no computador da agenda. */
export const EIXO_DA_SEMANA: EixoDoPeriodo = { dia: diaDoNumero, dias: 7, mes: mesPorExtenso };
export const EIXO_DO_DIA: EixoDoPeriodo = { dia: diaDoNumero, dias: 1, mes: mesPorExtenso };

/** O período da Pauta no instante `p` da contagem da posição `de` até `para` (as regras da agenda: os dias contam
    pelas datas e, na virada do mês, os meses ficam apagados até o fim). No Dia, vem também o dia da semana por
    extenso do dia contado ("sexta"). */
export function periodoDaPautaNaContagem(visao: 'semana' | 'dia', de: number, para: number, p: number): PartesDoPeriodo & { mesesApagados: boolean; semana?: string } {
  if (visao === 'semana') return periodoNaContagem(EIXO_DA_SEMANA, de, para, p);
  const agora = diaDoNumero(posicaoNaContagem(EIXO_DO_DIA, de, para, p));
  return { ...periodoNaContagem(EIXO_DO_DIA, de, para, p), semana: DIAS_POR_EXTENSO[new Date(`${agora}T12:00:00Z`).getUTCDay()] };
}

/** A semana na tela enquanto conta: a contagem da segunda-feira (no eixo da Semana) e a posição contada agora. O
    período da Semana, os números do cabeçalho da grade e os da fita do Dia contam todos por ela, juntos. */
export interface SemanaNaContagem {
  contagem: Contagem;
  /** O número do primeiro dia (a segunda) no instante da contagem. */
  inicio: number;
  contando: boolean;
}
export const SemanaQueConta = createContext<SemanaNaContagem | null>(null);
/** O `i`-ésimo dia da semana na tela no instante da contagem (AAAA-MM-DD: o número e o mês que mostrar) e se ela ainda
    anda; fora da contagem, o próprio `iso`. */
export function useDiaQueConta(iso: string, i: number): { contado: string; contando: boolean } {
  const s = useContext(SemanaQueConta);
  if (!s) return { contado: iso, contando: false };
  return { contado: diaDoNumero(s.inicio + i), contando: s.contando };
}


/**
 * Leva o período na tela (o número do dia, ou da segunda-feira) até `alvo`, em `raiz`. Devolve o que mostrar agora: o
 * anterior enquanto ele sai, o alvo quando ele entra.
 */
export function useTrocaDaPauta(raiz: RefObject<HTMLElement | null>, alvo: number): number {
  const [estado, setEstado] = useState({ mostrado: alvo, sentido: 1 as 1 | -1, vez: 0 });
  const alvoAgora = useRef(alvo);
  alvoAgora.current = alvo;
  const saindo = useRef<Animation[] | null>(null);
  const entrando = useRef<Animation[]>([]);
  const entrar = useRef(false);

  useEffect(() => {
    if (alvo === estado.mostrado || saindo.current) return;
    const sentido = alvo > estado.mostrado ? 1 : -1;
    const el = raiz.current;
    if (!el || typeof Animation === 'undefined') {
      setEstado((e) => ({ mostrado: alvo, sentido, vez: e.vez + 1 }));
      return;
    }
    const reduzido = semMovimento();
    const itens = [...el.querySelectorAll<HTMLElement>(ELEMENTOS)];
    entrando.current.forEach((a) => a.cancel());
    entrando.current = [];
    const ate = reduzido ? { opacity: 0 } : { opacity: 0, transform: `translateX(${-ANDA_PX * sentido}px)` };
    const estas = itens.map((e) => e.animate([{}, ate], { duration: reduzido ? REDUZIDO_MS / 2 : SAI_MS, easing: 'ease-in', fill: 'forwards' }));
    saindo.current = estas;
    const trocar = () => {
      if (saindo.current !== estas) return;
      entrar.current = true;
      setEstado((e) => ({ mostrado: alvoAgora.current, sentido: alvoAgora.current === e.mostrado ? (-sentido as 1 | -1) : alvoAgora.current > e.mostrado ? 1 : -1, vez: e.vez + 1 }));
    };
    if (!estas.length) trocar();
    else void Promise.all(estas.map((a) => a.finished)).then(trocar, () => undefined);
  }, [alvo, estado.mostrado]); // eslint-disable-line react-hooks/exhaustive-deps

  // o período novo já está na tela, antes de pintar: o que ficou do que saiu volta ao normal e o novo entra
  useLayoutEffect(() => {
    if (!entrar.current) return;
    entrar.current = false;
    saindo.current?.forEach((a) => a.cancel());
    saindo.current = null;
    const el = raiz.current;
    if (!el) return;
    const reduzido = semMovimento();
    const de = reduzido ? { opacity: 0 } : { opacity: 0, transform: `translateX(${ANDA_PX * estado.sentido}px)` };
    const para = reduzido ? { opacity: 1 } : { opacity: 1, transform: 'translateX(0px)' };
    entrando.current = [...el.querySelectorAll<HTMLElement>(ELEMENTOS)].map((e, i) =>
      e.animate([de, para], { duration: reduzido ? REDUZIDO_MS : ENTRA_MS, delay: reduzido ? 0 : Math.min(i * CASCATA_MS, CASCATA_TETO_MS), easing: SUAVE, fill: 'backwards' }),
    );
  }, [estado.vez]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      saindo.current?.forEach((a) => a.cancel());
      entrando.current.forEach((a) => a.cancel());
    },
    [],
  );
  return estado.mostrado;
}
