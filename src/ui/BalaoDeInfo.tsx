import { useEffect, useId, useRef, useState } from 'react';
import { useSaida } from './pecas';
import './balaoDeInfo.css';

/* O balão de info (#172): o mesmo desenho e o mesmo comportamento do balão de observação do mock-up do Montar a pauta
   (o balão de fala em SVG; com texto, cheio e laranja). Escondido por padrão: o clique abre o texto ali mesmo, numa
   linha que se expande; outro clique, um clique fora ou Esc fecham. Reaproveitável: quem usa decide onde o botão e o
   texto ficam (o envoltório é `display: contents`: o botão e o texto entram no lugar de quem o põe). Na Pauta, a info
   da claquete fica no canto do card, e a que não é de claquete, no alto da posição (a célula, a coluna, o "Minha
   pauta"). */

/** O balão de fala do mock-up; `cheio` quando há texto. */
export function IconeDoBalao({ cheio }: { cheio: boolean }) {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.2 2.8h9.6a1.7 1.7 0 0 1 1.7 1.7v5.4a1.7 1.7 0 0 1-1.7 1.7H7.6l-3 2.6v-2.6H3.2a1.7 1.7 0 0 1-1.7-1.7V4.5a1.7 1.7 0 0 1 1.7-1.7Z" fill={cheio ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * O botão do balão e, aberto, o texto.
 * @param textos o que o balão diz, um parágrafo por texto ([]: o balão vazio, contornado)
 * @param rotulo de quem é a info, para o leitor de tela ("Rita Fontes, sex 27")
 */
export function BalaoDeInfo({ textos, rotulo }: { textos: readonly string[]; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const saindo = useSaida(aberto, 200);
  const botao = useRef<HTMLButtonElement>(null);
  const texto = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (!botao.current?.contains(alvo) && !texto.current?.contains(alvo)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAberto(false);
      botao.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);
  const tem = textos.length > 0;
  return (
    <span className={`balao-info${aberto ? ' aberto' : ''}`}>
      <button
        ref={botao}
        type="button"
        className={`balao-info-botao${tem ? ' tem' : ''}`}
        aria-expanded={aberto}
        aria-controls={aberto || saindo ? id : undefined}
        aria-label={`${tem ? (textos.length === 1 ? 'Info' : `${textos.length} infos`) : 'Sem info'} para ${rotulo}`}
        title={aberto ? 'Fechar a info' : 'Info para o editor'}
        onClick={(e) => {
          // dentro de um card que abre a ficha, o clique no balão é só do balão
          e.stopPropagation();
          setAberto((a) => !a);
        }}
      >
        <IconeDoBalao cheio={tem} />
      </button>
      {(aberto || saindo) && (
        <div ref={texto} id={id} className={`balao-info-texto${saindo ? ' saindo' : ''}`} role="note" aria-label={`Info para ${rotulo}`}>
          <div className="balao-info-dentro">
            {textos.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
