// @vitest-environment node
/* O texto da sala ao vivo em JSON (#191): o servidor lê do documento compartilhado o mesmo roteiro que o editor tem,
   sem o schema do editor. Ida pelo y-prosemirror (o que o editor grava na sala) e volta pelo servidor. */
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';
import * as Y from 'yjs';
import { extensoesDoRoteiro } from '../src/editor/extensoes';
// @ts-expect-error módulo JS sem tipos
import { docDaSala, salaPreenchida } from '../servidor/doc-da-sala.mjs';

const schema = getSchema(extensoesDoRoteiro());
/** O JSON como o editor o teria (com os atributos que faltam no padrão). */
const comoNoEditor = (json: unknown) => schema.nodeFromJSON(json).toJSON();

describe('docDaSala', () => {
  it('devolve o roteiro que o editor gravou na sala: os tipos do trecho, a arte na frase e o negrito', () => {
    const roteiro = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { tipo: 'locucao', confirmado: true },
          content: [
            { type: 'text', text: 'NESTE SÁBADO, ' },
            { type: 'text', text: 'OITO CHURRASQUEIROS', marks: [{ type: 'arte', attrs: { id: 'a1', subtipo: 'cartao' } }] },
            { type: 'text', text: ' DISPUTAM A FINAL.' },
          ],
        },
        { type: 'paragraph', attrs: { tipo: 'sonora', confirmado: false }, content: [{ type: 'text', text: 'Dona Zélia, de Pelotas:', marks: [{ type: 'bold' }] }, { type: 'text', text: ' aqui ninguém leva carne crua.' }] },
        { type: 'paragraph' },
      ],
    };
    const ydoc = prosemirrorJSONToYDoc(schema, roteiro, 'doc');
    expect(comoNoEditor(docDaSala(ydoc))).toEqual(comoNoEditor(roteiro));
  });

  it('a sala vazia é o roteiro com um parágrafo vazio, e não está preenchida até ter texto ou metadados', () => {
    const ydoc = new Y.Doc();
    expect(docDaSala(ydoc)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(salaPreenchida(ydoc)).toBe(false);
    ydoc.getMap('meta').set('titulo', 'Festival');
    expect(salaPreenchida(ydoc)).toBe(true);
  });
});
