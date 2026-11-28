import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './cadeadoDoTexto.css';

/**
 * O cadeado da revisão (#188): no canto da folha, mostra se o texto está travado (como chegou) ou destravado, e troca
 * com um clique. Abrir levanta o arco e o gira para fora; fechar o traz de volta e encaixa. `chacoalhar` muda a cada
 * tentativa de digitar com o texto travado: o cadeado balança, para mostrar onde se destrava. Com o movimento
 * reduzido, a troca é seca.
 */
export function CadeadoDoTexto({ aberto, mudar, chacoalhar = 0 }: { aberto: boolean; mudar: () => void; chacoalhar?: number }) {
  const botao = useRef<HTMLButtonElement>(null);
  // a animação de fechar só existe depois da primeira troca: ao abrir o roteiro, o cadeado já está fechado, parado
  const [mexeu, setMexeu] = useState(false);
  useEffect(() => {
    const b = botao.current;
    if (!chacoalhar || !b) return;
    b.classList.remove('chacoalha');
    void b.offsetWidth; // recomeça a animação a cada tentativa
    b.classList.add('chacoalha');
  }, [chacoalhar]);
  // os dois rótulos ocupam o mesmo lugar; a largura acompanha o que aparece, num deslize
  const rotulos = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const r = rotulos.current;
    const visivel = r?.querySelector<HTMLElement>(aberto ? '.r-destravado' : '.r-travado');
    if (r && visivel) r.style.width = `${visivel.scrollWidth}px`;
  }, [aberto]);
  return (
    <button
      ref={botao}
      type="button"
      className={`cadeado-do-texto ${aberto ? 'aberto' : ''} ${mexeu ? 'mexeu' : ''}`}
      aria-pressed={aberto}
      data-tentativas={chacoalhar || undefined}
      aria-label={aberto ? 'Texto destravado: travar de novo' : 'Texto travado: destravar para editar'}
      title={aberto ? 'Travar o texto de novo' : 'Destravar o texto para editar'}
      onPointerDown={(e) => {
        // o clique não tira a seleção nem o cursor do texto
        e.preventDefault();
        e.stopPropagation();
      }}
      onAnimationEnd={(e) => e.animationName === 'cadeado-chacoalha' && e.currentTarget.classList.remove('chacoalha')}
      onClick={() => {
        setMexeu(true);
        mudar();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path className="arco" d="M6.5 11V7.5a4 4 0 0 1 8 0V11" />
        <rect className="caixa" x="3.5" y="11" width="14" height="10" rx="2" />
        <path className="buraco" d="M10.5 15.2v1.8" />
      </svg>
      <span className="rotulos" ref={rotulos} aria-hidden="true">
        <span className="r-travado">Texto travado</span>
        <span className="r-destravado">Texto destravado</span>
      </span>
    </button>
  );
}
