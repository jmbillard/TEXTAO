import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from './icones';
import { semMovimento } from './util';
import './cardAberto.css';

/* O card aberto no centro (a alternativa A do #160, escolhida pelo usuário): um painel de 720 px sobre um véu leve,
   preso perto do topo da janela. Ele nasce do retângulo do card clicado e cresce até o meio (FLIP); ao fechar (o X, o
   Esc ou o clique no véu), volta para o card. No celular (até 600 px), ocupa a tela toda. Com o movimento reduzido, só
   esmaece. A Pauta da edição (#162) abre a ficha da claquete nele; a tela de Produções (#160) usa o mesmo painel. */

/** Quanto o painel leva para abrir e para voltar ao card, em ms (no movimento reduzido, só o esmaecer). */
const ABRE_MS = 260;
const REDUZIDO_MS = 140;
const ABRE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const FECHA = 'cubic-bezier(0.4, 0, 0.8, 0.4)';

/** Fecha o card aberto com o movimento de volta ao card; para os botões de dentro do painel. */
const FecharCardAberto = createContext<() => void>(() => undefined);
export const useFecharCardAberto = () => useContext(FecharCardAberto);

/** O X do canto, que fecha o card aberto (com a volta ao card). */
export function FecharOCardAberto({ rotulo = 'Fechar' }: { rotulo?: string }) {
  const fechar = useFecharCardAberto();
  return (
    <button type="button" className="card-aberto-fechar" aria-label={rotulo} title={`${rotulo} (Esc)`} onClick={fechar}>
      <Icone nome="fechar" tam={18} traco={1.8} />
    </button>
  );
}

/**
 * O painel do card aberto, por cima de tudo (no corpo da página).
 * @param origem o card clicado: o painel cresce dele e volta para ele (e o foco também); sem ele, só esmaece
 * @param titulo o id do título do painel, para o leitor de tela
 * @param fechar chamado depois que o painel voltou ao card
 */
export function CardAberto({ origem, titulo, fechar, children }: { origem: HTMLElement | null; titulo: string; fechar: () => void; children: ReactNode }) {
  const painel = useRef<HTMLElement>(null);
  const veu = useRef<HTMLDivElement>(null);
  const fechando = useRef(false);
  // o card de onde ele veio pode ter sido redesenhado (a releitura): vale o que está na página na hora
  const deOnde = useRef(origem);
  deOnde.current = origem;

  /** As animações de abrir (ou, ao contrário, de voltar ao card). */
  const animar = useCallback((abrindo: boolean): Animation[] => {
    const p = painel.current;
    const v = veu.current;
    if (!p || !v || typeof p.animate !== 'function') return [];
    const reduzido = semMovimento();
    const op: KeyframeAnimationOptions = { duration: reduzido ? REDUZIDO_MS : ABRE_MS, easing: abrindo ? ABRE : FECHA, fill: 'both' };
    const sentido = (k: Keyframe[]) => (abrindo ? k : [...k].reverse());
    const lista = [v.animate(sentido([{ opacity: 0 }, { opacity: 1 }]), op)];
    const c = deOnde.current?.isConnected ? deOnde.current.getBoundingClientRect() : null;
    if (reduzido || !c || !c.width || !c.height) {
      lista.push(p.animate(sentido([{ opacity: 0 }, { opacity: 1 }]), op));
      return lista;
    }
    // FLIP: o painel nasce do retângulo do card e cresce até o lugar dele
    const r = p.getBoundingClientRect();
    const de = `translate(${c.left - r.left}px, ${c.top - r.top}px) scale(${c.width / r.width}, ${c.height / r.height})`;
    p.style.transformOrigin = '0 0';
    lista.push(p.animate(sentido([{ transform: de, opacity: 0.35, borderRadius: '9px' }, { transform: 'none', opacity: 1 }]), op));
    const dentro = p.firstElementChild as HTMLElement | null;
    if (dentro) lista.push(dentro.animate(sentido([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }]), op));
    return lista;
  }, []);

  const pedirParaFechar = useCallback(() => {
    if (fechando.current) return;
    fechando.current = true;
    const devolverFoco = () => {
      const o = deOnde.current;
      if (o?.isConnected) (o.matches('button, a, [tabindex]') ? o : (o.querySelector<HTMLElement>('button, a, [tabindex]') ?? o)).focus({ preventScroll: true });
    };
    const lista = animar(false);
    if (!lista.length) return void (fechar(), devolverFoco());
    void Promise.all(lista.map((a) => a.finished)).then(
      () => (fechar(), devolverFoco()),
      () => fechar(),
    );
  }, [animar, fechar]);

  useLayoutEffect(() => {
    animar(true);
    painel.current?.focus({ preventScroll: true });
  }, [animar]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      // um menu ou um campo aberto dentro do painel trata o Esc antes
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      pedirParaFechar();
    };
    document.addEventListener('keydown', tecla);
    // a página atrás não rola enquanto o painel está aberto
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.documentElement.style.overflow = antes;
    };
  }, [pedirParaFechar]);

  return createPortal(
    <FecharCardAberto.Provider value={pedirParaFechar}>
      <div className="card-aberto-camada">
        <div className="card-aberto-veu" ref={veu} onClick={pedirParaFechar} />
        <section className="card-aberto" role="dialog" aria-modal="true" aria-labelledby={titulo} tabIndex={-1} ref={painel}>
          <div className="card-aberto-rolar">{children}</div>
        </section>
      </div>
    </FecharCardAberto.Provider>,
    document.body,
  );
}
