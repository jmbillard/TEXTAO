import { Extension } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { ySyncPluginKey } from 'y-prosemirror';
import { tipoDoTrecho } from '../modelo/trecho';
import type { NoJSON } from '../modelo/tipos';

/* Colar na folha de escrita (#195, spec #186): o texto do Word colado no meio do roteiro também adivinha os tipos, pela
   mesma regra da fila. O `prepararColagem` (o mesmo da revisão) já põe a arte no que vem sublinhado; aqui:

   - linha a linha: a quebra de linha do Word (Shift+Enter) vira um trecho novo, como a fila lê o arquivo;
   - o trecho colado que a arte (ou a etiqueta copiada da revisão) cobre inteiro chega com o tipo confirmado; o resto
     fica com o palpite, que a escrita refaz sozinha (`Escrita`).

   O texto colado na folha ainda vazia é outra coisa: começa o roteiro pela leitura inteira da fila
   (`comecoDoColado`, em `TelaDeEscrita`). */

/** Parte os trechos colados nas quebras de linha: cada linha é um trecho, com os atributos do de origem. */
export function colagemLinhaALinha(slice: Slice): Slice {
  const filhos: PMNode[] = [];
  let mudou = false;
  slice.content.forEach((no) => {
    if (no.type.name !== 'paragraph' || !no.content.childCount) return void filhos.push(no);
    let pedaco: PMNode[] = [];
    const pedacos: PMNode[][] = [];
    no.content.forEach((filho) => {
      if (filho.type.name === 'hardBreak') {
        pedacos.push(pedaco);
        pedaco = [];
      } else pedaco.push(filho);
    });
    pedacos.push(pedaco);
    if (pedacos.length > 1) mudou = true;
    for (const p of pedacos) filhos.push(no.type.create(no.attrs, Fragment.from(p), no.marks));
  });
  return mudou ? new Slice(Fragment.from(filhos), slice.openStart, slice.openEnd) : slice;
}

/** Os trechos tocados pela colagem (ou pelo soltar de um texto), já na posição de agora. */
function faixasColadas(trs: readonly Transaction[]): [number, number][] {
  let faixas: [number, number][] = [];
  for (const tr of trs) {
    faixas = faixas.map(([a, b]) => [tr.mapping.map(a, -1), tr.mapping.map(b, 1)]);
    const evento = tr.getMeta('uiEvent');
    if (!tr.getMeta('paste') && evento !== 'paste' && evento !== 'drop') continue;
    tr.steps.forEach((step, i) => {
      const resto = tr.mapping.slice(i + 1);
      step.getMap().forEach((_a, _b, de, ate) => faixas.push([resto.map(de, -1), resto.map(ate, 1)]));
    });
  }
  return faixas;
}

/** Na colagem, o trecho que as marcas cobrem inteiro ganha o tipo delas, confirmado (o palpite fica com a escrita). */
export const ColagemNaEscrita = Extension.create({
  name: 'colagemNaEscrita',
  addProseMirrorPlugins: () => [
    new Plugin({
      key: new PluginKey('colagemNaEscrita'),
      props: { transformPasted: (slice) => colagemLinhaALinha(slice) },
      appendTransaction(trs, _antes, state) {
        if (trs.some((t) => t.getMeta(ySyncPluginKey))) return null;
        const faixas = faixasColadas(trs);
        if (!faixas.length) return null;
        let tr: Transaction | null = null;
        for (const [de, ate] of faixas)
          state.doc.nodesBetween(Math.max(0, de), Math.min(state.doc.content.size, ate), (no, pos) => {
            if (no.type.name !== 'paragraph') return true;
            if (no.attrs.confirmado === true) return false;
            // pelas marcas, sem o palpite guardado: a arte ou a etiqueta que cobre o trecho inteiro
            const json = no.toJSON() as NoJSON;
            const lido = tipoDoTrecho({ ...json, attrs: {} });
            if (lido.confirmado) (tr ??= state.tr).setNodeMarkup(pos, undefined, { ...no.attrs, tipo: lido.tipo, confirmado: true });
            return false;
          });
        return tr;
      },
    }),
  ],
});
