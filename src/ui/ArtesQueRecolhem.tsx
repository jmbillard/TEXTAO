import { useEffect, useId, useSyncExternalStore, type ReactNode } from 'react';
import { artesRecolhidas, assinarPreferencias, lembrarArtesRecolhidas } from '../dados/armazenamento';
import { Icone } from './icones';
import { ATALHO_DAS_ARTES } from './util';

/* A lista das artes ao lado do texto, que recolhe (a da folha de escrita e a da revisão, a mesma peça com o mesmo
   propósito). O cabeçalho "N artes" recolhe e abre; recolhida, sobra a pílula com o número, e a folha ganha o espaço. A
   escolha é uma só para as duas telas, lembrada por pessoa nas preferências (`artes.recolhida`). Ctrl+Alt+A também
   recolhe e abre. O corpo dobra como a dobra do "Para revisar" do celular (as linhas da grade de 1fr a 0fr). */

/** A escolha da pessoa, que muda nas duas telas ao mesmo tempo. */
export const useArtesRecolhidas = () => useSyncExternalStore(assinarPreferencias, artesRecolhidas, artesRecolhidas);

const ehAtalhoDasArtes = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code === 'KeyA';

interface Props {
  /** o número da pílula e do cabeçalho */
  n: number;
  /** o que vem ao lado do número no cabeçalho aberto ("vão para a arte", "+2 fora"); some na pílula */
  extra?: ReactNode;
  /** o que fica em cima, dentro do cartão, e não recolhe (o "Para revisar" da revisão); com ele, não vira pílula */
  antes?: ReactNode;
  className?: string;
  rotulo?: string;
  inert?: boolean;
  children: ReactNode;
}

export function ArtesQueRecolhem({ n, extra, antes, className = '', rotulo = 'As artes do roteiro', inert, children }: Props) {
  const recolhida = useArtesRecolhidas();
  const id = useId();
  const alternar = () => void lembrarArtesRecolhidas(!recolhida);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!ehAtalhoDasArtes(e)) return;
      e.preventDefault();
      void lembrarArtesRecolhidas(!artesRecolhidas());
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
  const palavra = n === 1 ? 'arte' : 'artes';
  return (
    <section
      className={`cartao artes-que-recolhem ${className}${antes ? ' com-antes' : ''}`}
      data-recolhida={recolhida || undefined}
      aria-label={rotulo}
      inert={inert || undefined}
    >
      {antes}
      <button
        type="button"
        className="cab-artes cab-que-recolhe"
        aria-expanded={!recolhida}
        aria-controls={id}
        aria-keyshortcuts="Control+Alt+A"
        title={`${recolhida ? 'Mostrar' : 'Recolher'} a lista das artes (${ATALHO_DAS_ARTES})`}
        onClick={alternar}
      >
        <b>
          <i>{n}</i> {palavra}
        </b>
        {extra && <span className="cab-extra">{extra}</span>}
        <span className="chev" aria-hidden="true">
          <Icone nome="baixo" tam={16} traco={2.2} />
        </span>
      </button>
      <div className="artes-dobra" id={id} inert={recolhida || undefined}>
        <div>{children}</div>
      </div>
    </section>
  );
}
