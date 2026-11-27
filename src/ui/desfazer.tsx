import { useEffect, useRef, useState, type ReactNode } from 'react';

/* O desfazer dos Cadastros: o que se apaga, remove ou ignora some na hora (a vaga fecha), a caixinha preta embaixo
   oferece desfazer por alguns segundos e só depois vai para o servidor. Outra ação no meio executa a anterior na hora;
   sair da tela não cancela (o que foi apagado é apagado). Serve aos Cadastros e às Pessoas da Configuração (#176). */

/** Quanto tempo a caixinha espera o desfazer antes de mandar para o servidor. */
export const PRAZO_DO_DESFAZER = 6000;

type Pendente = { id: string; executar: () => Promise<void>; timer: number };

export function useDesfazerAdiado() {
  // o que sumiu da lista e ainda não foi para o servidor (ou está indo)
  const [escondidos, setEscondidos] = useState<string[]>([]);
  const [desfazer, setDesfazer] = useState<{ texto: ReactNode; id: string } | null>(null);
  const pendente = useRef<Pendente | null>(null);
  /** Executa já o que estava esperando o desfazer (outra ação começou, ou a tela vai fechar). */
  const concluir = () => {
    const p = pendente.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendente.current = null;
    setDesfazer(null);
    void p.executar().finally(() => setEscondidos((l) => l.filter((x) => x !== p.id)));
  };
  /** Some com `id` na hora e oferece desfazer; sem desfazer, `executar` vai para o servidor no fim do prazo. */
  const comDesfazer = (id: string, texto: ReactNode, executar: () => Promise<void>) => {
    concluir();
    setEscondidos((l) => [...l, id]);
    setDesfazer({ texto, id });
    pendente.current = { id, executar, timer: window.setTimeout(concluir, PRAZO_DO_DESFAZER) };
  };
  /** O Desfazer da caixinha: nada vai para o servidor e a vaga abre de novo. */
  const desfazerAgora = () => {
    const p = pendente.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendente.current = null;
    setDesfazer(null);
    setEscondidos((l) => l.filter((x) => x !== p.id));
  };
  // sair da tela não cancela: o que foi apagado é apagado
  useEffect(
    () => () => {
      const p = pendente.current;
      if (p) (clearTimeout(p.timer), void p.executar());
    },
    [],
  );
  return { escondidos, desfazer, comDesfazer, desfazerAgora, concluir };
}

/** A caixinha preta embaixo da tela, com o Desfazer (e o fechar, quando dá para fechar sem desfazer). */
export function CaixinhaDoDesfazer({ className = '', desfazer, fechar, children }: { className?: string; desfazer: () => void; fechar?: () => void; children: ReactNode }) {
  return (
    <div className={`desfazer ${className}`.trim()} role="status">
      <span>{children}</span>
      <button type="button" className="botao-texto" onClick={desfazer}>
        Desfazer
      </button>
      {fechar && (
        <button type="button" className="botao-texto" aria-label="Fechar" onClick={fechar}>
          ×
        </button>
      )}
    </div>
  );
}
