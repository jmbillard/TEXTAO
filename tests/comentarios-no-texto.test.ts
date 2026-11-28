/* O grifo dos comentários no texto (#192): o trecho comentado acompanha a digitação em volta, é achado de novo quando o
   documento inteiro chega de fora (a sala, o recarregar), a âncora se refaz quando o próprio trecho muda e a seleção vira
   âncora. Pelo editor de verdade, com o schema do roteiro. Texto inventado. */
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { extensoesDoRoteiro } from '../src/editor/extensoes';
import { ancoraDaSelecao, ancorasRefeitas, ComentariosNoTexto, definirAncoras, faixasDosComentarios, textoCorrido } from '../src/editor/comentarios';
import { ancoraDe } from '../src/modelo/comentarios';

const par = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const DOC = { type: 'doc', content: [par('NESTE SÁBADO, A BRASA DECIDE.'), par('OITO CHURRASQUEIROS. UM SÓ TÍTULO.'), par('E A FINAL TEM JURADO NOVO.')] };

let editor: Editor;
afterEach(() => editor?.destroy());

function montar() {
  editor = new Editor({ extensions: [...extensoesDoRoteiro(), ComentariosNoTexto], content: DOC });
  const { texto } = textoCorrido(editor.state.doc);
  const de = texto.indexOf('UM SÓ TÍTULO');
  definirAncoras(editor.view, [{ id: 'c1', ancora: ancoraDe(texto, de, de + 12) }]);
  return editor;
}
const grifado = (id = 'c1') => {
  const f = faixasDosComentarios(editor.state).get(id);
  return f ? editor.state.doc.textBetween(f.de, f.ate) : null;
};

describe('o grifo dos comentários no texto', () => {
  it('acha o trecho pela âncora e o grifa', () => {
    montar();
    expect(grifado()).toBe('UM SÓ TÍTULO');
    expect(editor.view.dom.querySelector('[data-comentario="c1"]')?.textContent).toBe('UM SÓ TÍTULO');
  });

  it('acompanha o texto reescrito em volta, sem refazer a âncora', () => {
    montar();
    editor.commands.insertContentAt(1, 'AGORA: ');
    const f = faixasDosComentarios(editor.state).get('c1')!;
    editor.commands.insertContentAt(f.de, 'DOZE CHURRASQUEIROS. ');
    editor.commands.insertContentAt(faixasDosComentarios(editor.state).get('c1')!.ate, ' NOVIDADE');
    expect(grifado()).toBe('UM SÓ TÍTULO');
  });

  it('o documento trocado inteiro (como chega da sala ou ao reabrir): achado de novo pela âncora', () => {
    montar();
    editor.commands.setContent({ type: 'doc', content: [par('UM PARÁGRAFO NOVO NO COMEÇO.'), par('DOZE CHURRASQUEIROS. UM SÓ TÍTULO!')] });
    expect(grifado()).toBe('UM SÓ TÍTULO');
  });

  it('o trecho mudado por dentro continua grifado e a âncora se refaz (para quem escreve guardar)', () => {
    montar();
    const f = faixasDosComentarios(editor.state).get('c1')!;
    editor.commands.insertContentAt(f.de + 3, 'BOM ');
    expect(grifado()).toBe('UM BOM SÓ TÍTULO');
    expect(ancorasRefeitas(editor.state).c1.trecho).toBe('UM BOM SÓ TÍTULO');
  });

  it('o trecho apagado sai do grifo', () => {
    montar();
    const f = faixasDosComentarios(editor.state).get('c1')!;
    editor.commands.deleteRange({ from: f.de, to: f.ate });
    expect(grifado()).toBeNull();
  });

  it('a seleção vira âncora, sem os espaços das pontas; sem seleção, nada', () => {
    montar();
    const { texto, pos } = textoCorrido(editor.state.doc);
    const i = texto.indexOf(' A BRASA');
    editor.commands.setTextSelection({ from: pos[i], to: pos[i + 8] + 1 });
    expect(ancoraDaSelecao(editor.view)?.ancora.trecho).toBe('A BRASA');
    editor.commands.setTextSelection(3);
    expect(ancoraDaSelecao(editor.view)).toBeNull();
  });
});
