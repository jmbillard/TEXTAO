import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { extensoesDoRoteiro } from '../src/editor/extensoes';
import { aplicarComando, arteNoSelecionadoOuNoTrecho, barraNoCursor, confirmarOuTrocar, Escrita } from '../src/editor/escrita';
import { artesDoTexto, COMANDOS_DA_BARRA } from '../src/modelo/trecho';
import type { NoJSON } from '../src/modelo/tipos';

/* O escrever na folha (#190), pelo que o documento guarda depois de cada tecla: o palpite refeito enquanto se digita, o
   Tab que confirma e troca, o "/" que dá o tipo, e o Ctrl+U no trecho todo. Textos inventados. */

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const montar = (texto = '') => {
  editor = new Editor({ extensions: [...extensoesDoRoteiro(), Escrita], content: { type: 'doc', content: [{ type: 'paragraph', content: texto ? [{ type: 'text', text: texto }] : [] }] } });
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  return editor;
};
const tipos = (e: Editor) => (e.getJSON().content ?? []).map((p) => `${p.attrs?.tipo}${p.attrs?.confirmado ? '' : '?'}`);
const digitar = (e: Editor, texto: string) => {
  for (const c of texto) e.commands.insertContent(c);
};

describe('escrever na folha (#190)', () => {
  it('o palpite é refeito enquanto se digita', () => {
    const e = montar();
    digitar(e, 'Neste');
    expect(tipos(e)).toEqual(['texto?']);
    e.commands.selectAll();
    e.commands.insertContent('NESTE SÁBADO, A BRASA DECIDE.');
    expect(tipos(e)).toEqual(['locucao?']);
  });

  it('o Tab confirma o palpite, de novo troca; o confirmado não muda mais com o texto', () => {
    const e = montar('NESTE SÁBADO, A BRASA DECIDE.');
    digitar(e, ' ');
    confirmarOuTrocar(e, 1);
    expect(tipos(e)).toEqual(['locucao']);
    digitar(e, 'e mais');
    expect(tipos(e)).toEqual(['locucao']);
    confirmarOuTrocar(e, 1);
    expect(tipos(e)).toEqual(['arte']);
    confirmarOuTrocar(e, -1);
    expect(tipos(e)).toEqual(['locucao']);
  });

  it('o trecho do tipo arte fica coberto por uma arte só, que entra na lista, e sai dela ao trocar', () => {
    const e = montar('DESAFIO DA BRASA');
    arteNoSelecionadoOuNoTrecho(e);
    expect(tipos(e)).toEqual(['arte']);
    digitar(e, '!');
    expect(artesDoTexto(e.getJSON() as NoJSON).map((a) => a.texto)).toEqual(['DESAFIO DA BRASA!']);
    const ids = new Set((e.getJSON().content?.[0].content ?? []).map((n) => n.marks?.find((m) => m.type === 'arte')?.attrs?.id));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeTruthy();
    // o Ctrl+U de novo, sem seleção, volta ao palpite e tira a arte
    arteNoSelecionadoOuNoTrecho(e);
    expect(tipos(e)).toEqual(['locucao?']);
    expect(artesDoTexto(e.getJSON() as NoJSON)).toEqual([]);
  });

  it('o Ctrl+U com seleção marca a arte no meio da frase, sem mudar o tipo do trecho', () => {
    const e = montar('OITO CHURRASQUEIROS. UM SÓ TÍTULO.');
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 1, 20)));
    arteNoSelecionadoOuNoTrecho(e);
    expect(artesDoTexto(e.getJSON() as NoJSON).map((a) => a.texto)).toEqual(['OITO CHURRASQUEIROS']);
    digitar(e, ' ');
    expect(tipos(e)).toEqual(['locucao?']);
  });

  it('o "/" e o comando: o "/…" sai do texto e o trecho ganha o tipo; o timecode entra selecionado', () => {
    const e = montar('Galpão ');
    digitar(e, '/loca');
    const barra = barraNoCursor(e.state);
    expect(barra?.q).toBe('loca');
    aplicarComando(e, COMANDOS_DA_BARRA.find((c) => c.id === 'locacao')!, barra!);
    expect(e.getText()).toBe('Galpão ');
    expect(tipos(e)).toEqual(['locacao']);
    digitar(e, '/time');
    aplicarComando(e, COMANDOS_DA_BARRA.find((c) => c.id === 'timecode')!, barraNoCursor(e.state)!);
    expect(e.getText()).toBe('Galpão 00:00:00:00');
    const { from, to } = e.state.selection;
    expect(e.state.doc.textBetween(from, to)).toBe('00:00:00:00');
  });
});
