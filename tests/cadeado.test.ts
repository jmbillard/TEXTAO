import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Arte, SoMarcas } from '../src/editor/extensoes';
import { cadeadoNaRevisao } from '../src/modelo/cadeado';

/* O cadeado da revisão (#188): o texto fica como chegou, a não ser com o cadeado aberto. Confere pelo que o editor
   guarda depois de cada mudança, não pela estrutura do plugin. */

const DOC = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LOC: O PALCO É DE QUEM CANTA.' }] }] };

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function montar(opcoes: { destravado?: () => boolean; comCadeado?: (tr: Transaction) => boolean } = {}) {
  const avisos: number[] = [];
  editor = new Editor({
    extensions: [Document, Paragraph, Text, Bold, Italic, Arte, SoMarcas.configure({ aviso: () => avisos.push(1), ...opcoes })],
    content: DOC,
  });
  return { editor, avisos };
}

describe('o cadeado na revisão (#188)', () => {
  it('travado por padrão: digitar não muda o texto e avisa', () => {
    const { editor, avisos } = montar();
    editor.commands.insertContentAt(1, 'XX ');
    expect(editor.getText()).toBe('LOC: O PALCO É DE QUEM CANTA.');
    expect(avisos).toHaveLength(1);
  });

  it('travado, marcar a arte continua valendo', () => {
    const { editor } = montar({ destravado: () => false });
    editor.chain().setTextSelection({ from: 8, to: 13 }).setMark('arte', { id: 'a1' }).run();
    expect(JSON.stringify(editor.getJSON())).toContain('"arte"');
  });

  it('com o cadeado aberto, digitar e apagar mudam o texto, sem aviso; fechado de novo, volta a travar', () => {
    let aberto = true;
    const { editor, avisos } = montar({ destravado: () => aberto });
    editor.commands.insertContentAt(1, 'TÉC: ');
    expect(editor.getText()).toBe('TÉC: LOC: O PALCO É DE QUEM CANTA.');
    editor.commands.deleteRange({ from: 1, to: 6 });
    expect(editor.getText()).toBe('LOC: O PALCO É DE QUEM CANTA.');
    expect(avisos).toHaveLength(0);
    aberto = false;
    editor.commands.insertContentAt(1, 'XX ');
    expect(editor.getText()).toBe('LOC: O PALCO É DE QUEM CANTA.');
    expect(avisos).toHaveLength(1);
  });

  it('a mudança com o cadeado aberto passa pelo ponto do #196, que pode recusá-la', () => {
    const vistas: string[] = [];
    const { editor } = montar({
      destravado: () => true,
      comCadeado: (tr) => {
        vistas.push(tr.doc.textContent);
        return false;
      },
    });
    editor.commands.insertContentAt(1, 'XX ');
    expect(vistas).toEqual(['XX LOC: O PALCO É DE QUEM CANTA.']);
    expect(editor.getText()).toBe('LOC: O PALCO É DE QUEM CANTA.');
  });
});

describe('quem vê o cadeado', () => {
  it('só quem pode editar, fora do celular', () => {
    expect(cadeadoNaRevisao({ podeEditar: true, celular: false })).toBe(true);
    expect(cadeadoNaRevisao({ podeEditar: false, celular: false })).toBe(false);
    expect(cadeadoNaRevisao({ podeEditar: true, celular: true })).toBe(false);
  });
});
