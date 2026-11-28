import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import { sugerir } from '../dados/comentarios';
import { acompanhar, esquecer, registrarMudanca, sugestoesDoRastro, type Rastro } from '../editor/sugestoes';
import { novoId } from '../modelo/tipos';

/* A revisão que volta como sugestão (#196), do lado do designer: na cópia da fila de um Roteiro escrito no PROMeiro,
   cada mudança com o cadeado aberto (#188) passa como sempre (a cópia guarda a mudança, a arte não espera o redator) e
   entra no rastro; um instante depois da última tecla, o rastro vai ao servidor como as sugestões do lote (a vez do
   cadeado aberto nesta tela). Ao travar o cadeado e ao sair do roteiro, vai de uma vez. O que o redator já decidiu
   volta e sai do rastro. */

/** O rastro de uma tela da revisão: o lote, os trechos mudados e as transações que passaram pelo cadeado. */
export interface RastroDaRevisao {
  lote: string;
  rastro: Rastro;
  doCadeado: WeakSet<Transaction>;
}

/** Quanto a revisão espera, depois da última tecla com o cadeado aberto, para mandar as sugestões. */
export const SUGERIR_MS = 1200;

export function useSugestoesDaRevisao(
  editor: Editor | null,
  estado: RastroDaRevisao | null,
  { copia, destravado, avisar, redator }: { copia: string; destravado: boolean; avisar: (t: string) => void; redator: string },
) {
  const avisarRef = useRef(avisar);
  avisarRef.current = avisar;
  const redatorRef = useRef(redator);
  redatorRef.current = redator;
  // o que já foi mandado (para não mandar de novo o mesmo) e se a pessoa já sabe que a mudança vai como sugestão
  const mandado = useRef('[]');
  const avisou = useRef(false);
  // o documento da última transação: ao sair, o editor pode já ter sido desmontado
  const doc = useRef<Transaction['doc'] | null>(null);
  const mandar = useRef(() => {});
  mandar.current = () => {
    const agora = editor && !editor.isDestroyed ? editor.state.doc : doc.current;
    if (!agora || !estado) return;
    const sugestoes = sugestoesDoRastro(estado.rastro, agora);
    const json = JSON.stringify(sugestoes);
    if (json === mandado.current) return;
    mandado.current = json;
    if (sugestoes.length && !avisou.current) {
      avisou.current = true;
      avisarRef.current(`A mudança fica na fila e vai como sugestão para ${redatorRef.current || 'o redator'}, no roteiro escrito.`);
    }
    sugerir(copia, estado.lote, sugestoes).then(
      (r) => {
        if (!r.decididas.length) return;
        esquecer(estado.rastro, r.decididas);
        mandado.current = JSON.stringify(sugestoesDoRastro(estado.rastro, editor && !editor.isDestroyed ? editor.state.doc : agora));
      },
      () => {
        // não foi: tenta de novo na próxima mudança
        mandado.current = '';
      },
    );
  };

  useEffect(() => {
    if (!editor || !estado) return;
    let prazo: ReturnType<typeof setTimeout> | undefined;
    const aoMudar = ({ transaction, appendedTransactions }: { transaction: Transaction; appendedTransactions?: Transaction[] }) => {
      doc.current = editor.state.doc;
      if (estado.doCadeado.has(transaction)) {
        registrarMudanca(estado.rastro, transaction, novoId);
        clearTimeout(prazo);
        prazo = setTimeout(() => mandar.current(), SUGERIR_MS);
      } else acompanhar(estado.rastro, transaction);
      for (const t of appendedTransactions ?? []) acompanhar(estado.rastro, t);
    };
    editor.on('transaction', aoMudar);
    return () => {
      clearTimeout(prazo);
      editor.off('transaction', aoMudar);
      // ao sair do roteiro, vai o que falta
      mandar.current();
    };
  }, [editor, estado]);

  // travar o cadeado manda de uma vez
  useEffect(() => {
    if (!destravado) mandar.current();
  }, [destravado]);
}
