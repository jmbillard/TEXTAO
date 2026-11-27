import type { ReactNode } from 'react';

/**
 * A caixinha de desfazer (#112, #160, #178), a mesma em toda a tela de produções: a frase do que acabou de acontecer,
 * "Desfazer" e o × que fecha. Quem a abre cuida de fechar sozinha depois de um tempo.
 * @param onde 'tela': embaixo, no meio da janela (a etapa, na tela de produções); 'card': presa embaixo do card aberto
 *   (o apagar da arte, o tirar da campanha)
 * Quem usa dá uma `key` nova a cada abertura: a caixinha sobe de novo quando a frase troca.
 */
export function CaixinhaDoDesfazer({ onde, texto, desfazer, fechar }: { onde: 'tela' | 'card'; texto: ReactNode; desfazer: () => void; fechar: () => void }) {
  const c = onde === 'tela' ? 'prod-desfazer' : 'pa-desfazer';
  return (
    <div className={c} role="status">
      <span className={`${c}-texto`}>{texto}</span>
      <button type="button" className={`botao ${c}-botao`} onClick={desfazer}>
        Desfazer
      </button>
      <button type="button" className={`botao-texto ${c}-fechar`} aria-label="Fechar" onClick={fechar}>
        ×
      </button>
    </div>
  );
}
