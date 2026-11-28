import { useEffect, useRef, useState } from 'react';
import { Icone } from './icones';

/** A tecla foi num campo de texto ou num diálogo: os atalhos da tela não valem ali. */
export const emCampo = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]');

/**
 * A busca recolhida numa lupa (a da fila e a da Pauta da edição, #162): "/" ou um clique abrem o campo; Esc limpa e
 * recolhe; sem texto, perder o foco recolhe.
 * @param ativa o "/" vale (a tela está à vista, sem nada por cima)
 * @param className o lugar dela na tela (o resto do desenho e do comportamento é o mesmo em todas)
 * @param focar já abre com o foco (a lista que acabou de abrir para buscar, como o acervo da ficha)
 */
export function BuscaNaLupa({ valor, mudar, ativa, dica = 'Buscar claquete, atração ou redator', rotulo = 'Buscar roteiros', className = '', focar = false }: { valor: string; mudar: (v: string) => void; ativa: boolean; dica?: string; rotulo?: string; className?: string; focar?: boolean }) {
  const campo = useRef<HTMLInputElement>(null);
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    if (!ativa) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || emCampo(e)) return;
      e.preventDefault();
      campo.current?.focus();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ativa]);
  return (
    <label className={`busca lupa ${aberta || valor ? 'aberta' : ''}${className ? ` ${className}` : ''}`} title="Buscar (/)">
      <Icone nome="lupa" tam={15} traco={2} />
      <input
        ref={campo}
        type="search"
        placeholder={dica}
        aria-label={rotulo}
        aria-keyshortcuts="/"
        autoFocus={focar}
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        onFocus={() => setAberta(true)}
        onBlur={() => setAberta(false)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // o Esc da busca não fecha mais nada
          e.stopPropagation();
          mudar('');
          e.currentTarget.blur();
        }}
      />
      {/* o × que limpa (#171): o nosso, em --tinta3, no lugar do azul do navegador */}
      {valor && (
        <button
          type="button"
          className="busca-limpar"
          aria-label="Limpar a busca"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            mudar('');
            campo.current?.focus();
          }}
        >
          <Icone nome="fechar" tam={13} traco={2} />
        </button>
      )}
    </label>
  );
}
