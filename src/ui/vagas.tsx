import { useEffect, useLayoutEffect, useReducer, useRef, type ReactNode, type RefObject } from 'react';
import { semMovimento } from './util';

/* Vagas: o que entra ou sai de uma lista abre ou fecha o seu espaço, em vez de aparecer ou sumir de estalo.
   Quem sai continua desenhado no lugar onde estava enquanto a vaga fecha; quem volta (desfazer) abre a vaga de novo.
   Mudanças grandes de uma vez (trocar de aba, uma busca que muda a lista inteira) não animam: o olho não acompanha
   dezenas de vagas e o navegador também não. */

export const DURACAO_VAGA = 280;
const MAX_ANIMADAS = 12;

type Estado = '' | 'entrando' | 'saindo';
export interface ItemVaga<T> {
  k: string;
  item: T;
  estado: Estado;
}

/** deslizam: as chaves que só mudaram de lista (vieram de outra ou foram para outra): não abrem nem fecham a vaga,
    porque deslizam de um lugar para o outro (useDeslize). */
export function useVagas<T>(itens: T[], chave: (x: T) => string, deslizam?: ReadonlySet<string>): ItemVaga<T>[] {
  const [, tique] = useReducer((n: number) => n + 1, 0);
  const exibidos = useRef<{ k: string; item: T }[]>([]);
  const saindoDesde = useRef(new Map<string, number>());
  const entrou = useRef(new Set<string>());
  const montado = useRef(false);

  const agora = performance.now();
  const lista: ItemVaga<T>[] = itens.map((item) => ({ k: chave(item), item, estado: '' }));
  const vivos = new Set(lista.map((x) => x.k));
  const anteriores = exibidos.current;
  const conhecidos = new Set(anteriores.map((x) => x.k));
  const desliza = (k: string) => !!deslizam?.has(k);
  const novos = lista.filter((x) => !conhecidos.has(x.k) && !desliza(x.k)).length;
  const sairiam = anteriores.filter((x) => !vivos.has(x.k) && !desliza(x.k)).length;
  const animar = montado.current && novos + sairiam <= MAX_ANIMADAS;

  if (animar) {
    // quem saiu fica onde estava: logo depois do vizinho de cima que ainda aparece
    anteriores.forEach((x, i) => {
      if (vivos.has(x.k) || desliza(x.k)) return;
      let desde = saindoDesde.current.get(x.k);
      if (desde === undefined) {
        desde = agora;
        saindoDesde.current.set(x.k, agora);
      }
      if (agora - desde > DURACAO_VAGA) return;
      let pos = 0;
      for (let j = i - 1; j >= 0; j--) {
        const idx = lista.findIndex((y) => y.k === anteriores[j].k);
        if (idx >= 0) {
          pos = idx + 1;
          break;
        }
      }
      lista.splice(pos, 0, { k: x.k, item: x.item, estado: 'saindo' });
    });
  }
  for (const x of lista) {
    if (x.estado === 'saindo') continue;
    if (animar && !desliza(x.k) && (!conhecidos.has(x.k) || saindoDesde.current.has(x.k))) entrou.current.add(x.k);
    if (entrou.current.has(x.k)) x.estado = 'entrando';
  }

  useLayoutEffect(() => {
    montado.current = true;
    exibidos.current = lista.map(({ k, item }) => ({ k, item }));
    const naTela = new Set(lista.map((x) => x.k));
    for (const k of vivos) saindoDesde.current.delete(k);
    for (const [k, t] of saindoDesde.current) if (!naTela.has(k) || performance.now() - t > DURACAO_VAGA) saindoDesde.current.delete(k);
    for (const k of entrou.current) if (!naTela.has(k)) entrou.current.delete(k);
  });
  const temSaindo = lista.some((x) => x.estado === 'saindo');
  useEffect(() => {
    if (!temSaindo) return;
    const t = setTimeout(tique, DURACAO_VAGA + 30);
    return () => clearTimeout(t);
  });
  return lista;
}

/** Lista com vagas animadas. eixo "y" para linhas (a altura abre e fecha), "x" para chips lado a lado (a largura).
    vazio: o que aparece com a lista vazia. Só entra depois que a última vaga fecha, abrindo a vaga dele. */
export function Vagas<T>({ itens, chave, children, eixo = 'y', como, deslizam, vazio }: { itens: T[]; chave: (x: T) => string; children: (x: T) => ReactNode; eixo?: 'x' | 'y'; como?: 'li' | 'div' | 'span'; deslizam?: ReadonlySet<string>; vazio?: ReactNode }) {
  const lista = useVagas(itens, chave, deslizam);
  const Tag = como ?? (eixo === 'x' ? 'span' : 'div');
  return (
    <>
      {vazio !== undefined && (
        <Vagas eixo={eixo} como={como} itens={!lista.length && vazio !== null ? ['vazio'] : []} chave={(k) => k}>
          {() => vazio}
        </Vagas>
      )}
      {lista.map((x) => (
        <Tag key={x.k} className={`vaga-${eixo} ${x.estado}`} aria-hidden={x.estado === 'saindo' || undefined} inert={x.estado === 'saindo' || undefined}>
          {eixo === 'x' ? <span className="vaga-dentro">{children(x.item)}</span> : <div className="vaga-dentro">{children(x.item)}</div>}
        </Tag>
      ))}
    </>
  );
}

/* Deslize (FLIP): o que muda de lugar sem sair da tela (o card que ganhou data e vai do "sem data" para o dia, os
   vizinhos que abrem espaço para ele) desliza da posição antiga até a nova, em vez de se teletransportar.
   A foto de antes é tirada na renderização, antes de o React mexer na tela, e só quando a disposição muda; os
   elementos são casados pelo data-card, porque o React remonta o card que troca de lista. */

const DURACAO_DESLIZE = 320;
// mais do que isso de uma vez (uma busca, uma troca grande) não desliza: o olho não acompanha
const MAX_DESLIZANDO = 24;
type Ponto = { x: number; y: number };
const deslizes = new WeakMap<Element, Animation>();

// o que está fechando a vaga não desliza: já está saindo
const presentes = (raiz: HTMLElement, seletor: string) => [...raiz.querySelectorAll<HTMLElement>(seletor)].filter((el) => !el.closest('.saindo'));
function onde(el: Element, origem: DOMRect): Ponto {
  const r = el.getBoundingClientRect();
  return { x: r.left - origem.left, y: r.top - origem.top };
}

/** Onde cada elemento está agora (relativo à raiz, para a página rolar ou a fila de cima mudar de altura sem contar). */
function fotografar(raiz: HTMLElement, seletor: string): Map<string, Ponto> {
  const origem = raiz.getBoundingClientRect();
  return new Map(presentes(raiz, seletor).map((el) => [el.dataset.card ?? '', onde(el, origem)]));
}

/** Leva cada elemento da posição da foto até a de agora. Um deslize no meio (um evento que chegou durante a
    animação) é trocado por um novo, que parte de onde o elemento estava na tela. */
function deslizar(raiz: HTMLElement, seletor: string, antes: Map<string, Ponto>) {
  const els = presentes(raiz, seletor);
  for (const el of els) deslizes.get(el)?.cancel();
  // a vaga que voltou (desfazer) antes de sumir volta para o fluxo
  for (const vaga of raiz.querySelectorAll<HTMLElement>('[data-grade] > .vaga-y:not(.saindo)[style]')) vaga.removeAttribute('style');
  // numa grade (o "sem data"), a vaga que fecha sai do fluxo e fica por cima do lugar dela: os vizinhos já
  // deslizam para o espaço, em vez de pularem quando a vaga some
  for (const vaga of raiz.querySelectorAll<HTMLElement>('[data-grade] > .vaga-y.saindo:not(.solta)')) {
    const card = vaga.querySelector<HTMLElement>('[data-card]');
    const ponto = card && antes.get(card.dataset.card ?? '');
    const grade = vaga.parentElement!;
    if (!ponto) continue;
    const g = onde(grade, raiz.getBoundingClientRect());
    Object.assign(vaga.style, { left: `${ponto.x - g.x - grade.clientLeft}px`, top: `${ponto.y - g.y - grade.clientTop}px`, width: `${card.offsetWidth}px` });
    vaga.classList.add('solta');
  }
  const origem = raiz.getBoundingClientRect();
  const mudou = els
    .map((el) => {
      const de = antes.get(el.dataset.card ?? '');
      const para = onde(el, origem);
      return de ? { el, dx: de.x - para.x, dy: de.y - para.y } : null;
    })
    .filter((m): m is { el: HTMLElement; dx: number; dy: number } => !!m && (Math.abs(m.dx) > 0.5 || Math.abs(m.dy) > 0.5));
  if (mudou.length > MAX_DESLIZANDO) return;
  for (const { el, dx, dy } of mudou) {
    el.classList.add('deslizando');
    const a = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: DURACAO_DESLIZE, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' /* a curva --suave */ });
    deslizes.set(el, a);
    const fim = () => {
      if (deslizes.get(el) === a) el.classList.remove('deslizando');
    };
    a.onfinish = fim;
    a.oncancel = fim;
  }
}

/** FLIP dos elementos [data-card] da raiz (filtrados pelo seletor) sempre que a disposição muda.
    disposicao: um texto que muda quando algo entra, sai, troca de lista ou de ordem.
    animar: falso quando a mudança não é para deslizar (outra semana pelas setas, a semana encolhendo). */
export function useDeslize(raiz: RefObject<HTMLElement | null>, seletor: string, disposicao: string, animar: boolean) {
  const ultima = useRef(disposicao);
  const antes = animar && ultima.current !== disposicao && raiz.current && !semMovimento() ? fotografar(raiz.current, seletor) : null;
  useLayoutEffect(() => {
    ultima.current = disposicao;
    if (antes && raiz.current) deslizar(raiz.current, seletor, antes);
  });
}
