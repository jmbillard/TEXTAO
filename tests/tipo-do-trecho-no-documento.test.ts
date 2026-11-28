import { describe, expect, it } from 'vitest';
import { generateHTML, getSchema } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import HardBreak from '@tiptap/extension-hard-break';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror';
import { Arte, Celula, Etiqueta, Imagem, Linha, TipoDoTrecho } from '../src/editor/extensoes';
import { tipoDoTrecho } from '../src/modelo/trecho';
import type { NoJSON } from '../src/modelo/tipos';

/* O tipo do trecho vai guardado no próprio documento (#187), o mesmo da sala ao vivo: os roteiros de antes e os que
   chegam de fora abrem e aparecem iguais. */

const antes = [Document, Paragraph, Text, Bold, Italic, HardBreak, Arte, Etiqueta, Imagem, Linha, Celula];
const agora = [...antes, TipoDoTrecho];
const schema = getSchema(agora);

const roteiroDeAntes: NoJSON = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'NESTE DOMINGO, ' }, { type: 'text', text: 'OITO CHURRASQUEIROS', marks: [{ type: 'arte', attrs: { id: 'a1', subtipo: 'cartao', grupo: null, obs: '', sugerido: false } }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Dona Cida, de Ribeirão Preto: Eu faço desde menina.' }] },
    { type: 'paragraph' },
    { type: 'linha', content: [{ type: 'celula', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abrir no fogo', marks: [{ type: 'etiqueta', attrs: { id: 'e1', tipo: 'edicao', obs: '' } }] }] }] }, { type: 'celula', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'TODO DOMINGO' }] }] }] },
  ],
};

const escrito: NoJSON = {
  type: 'doc',
  content: [
    { type: 'paragraph', attrs: { tipo: 'locacao', confirmado: true }, content: [{ type: 'text', text: 'Quintal da Dona Cida' }] },
    { type: 'paragraph', attrs: { tipo: 'locucao', confirmado: false }, content: [{ type: 'text', text: 'HOJE TEM PUDIM' }] },
  ],
};

const pelaSala = (doc: NoJSON) => yDocToProsemirrorJSON(prosemirrorJSONToYDoc(schema, doc, 'doc'), 'doc') as NoJSON;

describe('o tipo guardado no documento', () => {
  it('o tipo e o palpite passam pela sala ao vivo e voltam iguais', () => {
    const volta = pelaSala(escrito);
    expect(volta.content!.map(tipoDoTrecho)).toEqual([{ tipo: 'locacao', confirmado: true }, { tipo: 'locucao', confirmado: false }]);
    expect(schema.nodeFromJSON(volta).child(0).attrs).toMatchObject({ tipo: 'locacao', confirmado: true });
  });

  it('o roteiro de antes abre no editor e passa pela sala sem mudar nada', () => {
    expect(() => schema.nodeFromJSON(roteiroDeAntes)).not.toThrow();
    expect(pelaSala(roteiroDeAntes)).toEqual(roteiroDeAntes);
  });

  it('o roteiro que chega de fora aparece igual na revisão', () => {
    expect(generateHTML(roteiroDeAntes, agora)).toBe(generateHTML(roteiroDeAntes, antes));
  });
});
