/* O .docx original como o Word mostra (tabelas, sublinhado, cores, imagens), só para ver, com as artes do roteiro
   pintadas por cima. Fica num módulo à parte: o docx-editor é grande e só carrega quando alguém abre o original. */
import { useCallback } from 'react';
import { DocxEditor, useHighlights } from '@docx-editor.dev/react';
import '@docx-editor.dev/core/styles/editor.css';

type EditorComBusca = { findMatches(q: readonly string[], o?: { matchCase?: boolean; wholeWord?: boolean }): readonly (readonly unknown[])[] };

/** As artes marcadas no PROMeiro, achadas no texto do original e pintadas com a cor da arte. */
function Realces({ artes }: { artes: string[] }) {
  const chave = artes.join('\u0001');
  const achar = useCallback(
    (editor: unknown) => (artes.length ? ((editor as EditorComBusca).findMatches(artes, { matchCase: false }).flat() as never[]) : []),
    [chave], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useHighlights('artes-promeiro', achar, { color: 'var(--realce-original)', className: 'realce-original' });
  return null;
}

export default function VisorDocx({ dados, artes }: { dados: Uint8Array; artes: string[] }) {
  return (
    <div className="visor-docx">
      <DocxEditor.Root document={dados} mode="view" locale="pt-BR" zoomMode={{ type: 'fit', fit: 'pageWidth', maxZoom: 1 }} popups={{}}>
        <Realces artes={artes} />
        <DocxEditor.Viewport>
          <DocxEditor.Content />
        </DocxEditor.Viewport>
      </DocxEditor.Root>
    </div>
  );
}
