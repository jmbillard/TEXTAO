import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { extensoesDoRoteiro, prepararColagem } from '../src/editor/extensoes';
import { Escrita } from '../src/editor/escrita';
import { ColagemNaEscrita } from '../src/editor/colagem';
import { artesDoTexto } from '../src/modelo/trecho';
import type { NoJSON } from '../src/modelo/tipos';

/* Colar do Word no meio do roteiro sendo escrito (#195): linha a linha, cada linha é um trecho com o tipo adivinhado; o
   que vem sublinhado vira arte (o prepararColagem da revisão) e o trecho todo sublinhado é do tipo arte, confirmado.
   Textos inventados. */

// o jsdom não tem o evento da colagem: o pasteHTML do ProseMirror só precisa criá-lo
const g = globalThis as { ClipboardEvent?: unknown };
g.ClipboardEvent ??= class extends Event {
  clipboardData = null;
};

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});
const montar = (pars: string[]) => {
  editor = new Editor({
    extensions: [...extensoesDoRoteiro(), Escrita, ColagemNaEscrita],
    content: { type: 'doc', content: pars.map((t) => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] })) },
    editorProps: { transformPastedHTML: prepararColagem },
  });
  return editor;
};
const tipos = (e: Editor) => (e.getJSON().content ?? []).map((p) => `${p.attrs?.tipo}${p.attrs?.confirmado ? '' : '?'}`);
const textos = (e: Editor) => (e.getJSON().content ?? []).map((p) => (p.content ?? []).map((n) => n.text ?? '').join(''));

describe('colar no meio do texto (#195)', () => {
  it('as linhas do Word viram trechos, cada um com o tipo adivinhado; o todo sublinhado é arte confirmada', () => {
    const e = montar(['NESTE SÁBADO, A BRASA DECIDE.', '']);
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.view.pasteHTML('<p class=MsoNormal>Dona Zélia, de Pelotas: Aqui ninguém leva carne crua.</p><p class=MsoNormal><span style="text-decoration:underline">DESAFIO DA BRASA</span></p><p class=MsoNormal>A FINAL TEM <u>OITO CHURRASQUEIROS</u>.</p><p class=MsoNormal>TRILHA SOBE</p>');
    expect(textos(e)).toEqual(['NESTE SÁBADO, A BRASA DECIDE.', 'Dona Zélia, de Pelotas: Aqui ninguém leva carne crua.', 'DESAFIO DA BRASA', 'A FINAL TEM OITO CHURRASQUEIROS.', 'TRILHA SOBE']);
    expect(tipos(e)).toEqual(['locucao?', 'sonora?', 'arte', 'locucao?', 'trilha?']);
    expect(artesDoTexto(e.getJSON() as NoJSON).map((a) => a.texto)).toEqual(['DESAFIO DA BRASA', 'OITO CHURRASQUEIROS']);
  });

  it('linha a linha: a quebra de linha (Shift+Enter no Word) parte em trechos', () => {
    const e = montar(['NESTE SÁBADO, A BRASA DECIDE.', 'E A FINAL É AO VIVO.']);
    // o cursor no fim do primeiro trecho
    e.commands.setTextSelection(1 + 'NESTE SÁBADO, A BRASA DECIDE.'.length);
    e.view.pasteHTML('<p>Seu Arlindo, de Bagé: O fogo é de chão.<br><u>BRASA</u><br>TRILHA SOBE</p>');
    expect(textos(e)).toEqual(['NESTE SÁBADO, A BRASA DECIDE.Seu Arlindo, de Bagé: O fogo é de chão.', 'BRASA', 'TRILHA SOBE', 'E A FINAL É AO VIVO.']);
    expect(tipos(e).slice(1, 3)).toEqual(['arte', 'trilha?']);
  });

  it('o texto puro colado: uma linha por trecho, com o palpite', () => {
    const e = montar(['']);
    e.commands.setTextSelection(1);
    e.view.pasteText('A BRASA DECIDE.\nDona Zélia, de Pelotas: É fogo.\nTRILHA SOBE');
    expect(tipos(e)).toEqual(['locucao?', 'sonora?', 'trilha?']);
  });

  it('no trecho vazio, o colado todo sublinhado vira arte; o tipo confirmado de quem já escreveu não muda', () => {
    const e = montar(['', 'A BRASA DECIDE.']);
    e.commands.setTextSelection(1);
    e.view.pasteHTML('<u>DESAFIO DA BRASA</u>');
    expect(tipos(e)).toEqual(['arte', 'locucao?']);
    e.chain().setTextSelection(e.state.doc.child(0).nodeSize + 1).updateAttributes('paragraph', { tipo: 'producao', confirmado: true }).run();
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.view.pasteHTML('<u>FOGO</u>');
    expect(tipos(e)).toEqual(['arte', 'producao']);
  });
});
