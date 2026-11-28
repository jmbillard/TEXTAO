import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { extensoesDoRoteiro } from '../src/editor/extensoes';
import { Escrita, definirTipo } from '../src/editor/escrita';
import { Colunas, mudarVisao, visaoDe } from '../src/editor/colunas';

/* As colunas da folha (#193): uma visão do mesmo documento. Na tela, cada trecho ganha a coluna e a linha da grade
   (a regra `gradeDasColunas`); o documento continua o mesmo, e o que se escreve nas colunas é o texto. Inventado. */

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const p = (texto: string, tipo: string) => ({ type: 'paragraph', attrs: { tipo, confirmado: true }, content: [{ type: 'text', text: texto }] });
const montar = (inicial?: 'texto' | 'colunas') => {
  editor = new Editor({
    extensions: [...extensoesDoRoteiro(), Escrita, inicial ? Colunas.configure({ inicial }) : Colunas],
    content: { type: 'doc', content: [p('Galpão da final', 'locacao'), p('Abre no fogo.', 'edicao'), p('NESTE SÁBADO.', 'locucao'), p('OITO CHURRASQUEIROS.', 'locucao')] },
  });
  return editor;
};
/** Cada filho da raiz do editor: o trecho com a coluna e a linha, ou a célula vazia. */
const grade = (e: Editor) =>
  [...e.view.dom.children].map((el) => {
    const h = el as HTMLElement;
    return h.tagName === 'P' ? `${h.dataset.coluna} ${h.style.gridRow} · ${h.textContent}` : `vazia ${h.dataset.coluna} ${h.style.gridRow}`;
  });

describe('as colunas na folha (#193)', () => {
  it('no texto não há grade; nas colunas, cada trecho no lugar dele, sem mexer no documento', () => {
    const e = montar();
    const antes = JSON.stringify(e.getJSON());
    expect(e.view.dom.getAttribute('data-visao')).toBe('texto');
    expect(e.view.dom.querySelector('[data-coluna]')).toBeNull();
    mudarVisao(e, 'colunas');
    expect(visaoDe(e)).toBe('colunas');
    expect(e.view.dom.getAttribute('data-visao')).toBe('colunas');
    expect(grade(e)).toEqual(['linha 1 / span 1 · Galpão da final', 'video 2 / span 2 · Abre no fogo.', 'audio 2 / span 1 · NESTE SÁBADO.', 'audio 3 / span 1 · OITO CHURRASQUEIROS.']);
    expect(JSON.stringify(e.getJSON())).toBe(antes);
    mudarVisao(e, 'texto');
    expect(e.view.dom.querySelector('[data-coluna]')).toBeNull();
  });

  it('a folha pode abrir já nas colunas (o envio lido pela Pauta, #197), e volta ao texto como sempre', () => {
    const e = montar('colunas');
    expect(visaoDe(e)).toBe('colunas');
    expect(e.view.dom.getAttribute('data-visao')).toBe('colunas');
    expect(grade(e)[1]).toBe('video 2 / span 2 · Abre no fogo.');
    mudarVisao(e, 'texto');
    expect(e.view.dom.querySelector('[data-coluna]')).toBeNull();
  });

  it('escrever nas colunas é escrever no texto; o trecho que troca de tipo troca de coluna', () => {
    const e = montar();
    mudarVisao(e, 'colunas');
    e.chain().setTextSelection(e.state.doc.content.size - 1).insertContent(' NA BRASA.').run();
    expect(e.getJSON().content?.at(-1)?.content?.[0].text).toBe('OITO CHURRASQUEIROS. NA BRASA.');
    // o último trecho vira arte: abre um grupo novo, no vídeo, e o áudio do grupo fica vazio
    let pos = 0;
    e.state.doc.forEach((_, at) => (pos = at));
    definirTipo(e, pos, 'arte');
    expect(grade(e)).toEqual([
      'linha 1 / span 1 · Galpão da final',
      'video 2 / span 1 · Abre no fogo.',
      'audio 2 / span 1 · NESTE SÁBADO.',
      'video 3 / span 1 · OITO CHURRASQUEIROS. NA BRASA.',
      'vazia audio 3 / span 1',
    ]);
  });
});
