import { Extension } from '@tiptap/core';
import type { Node as NoPM } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { ySyncPluginKey } from 'y-prosemirror';
import { acharAncora, ancoraDe, type Ancora } from '../modelo/comentarios';

/* Os trechos comentados no texto (#192): o grifo de cada comentário aberto, achado pela âncora por citação e levado
   junto a cada mudança do texto. O documento não muda (quem só comenta não escreve nele): o grifo é decoração. Na
   digitação de quem está na folha, o trecho anda com o texto (o mapeamento do ProseMirror) e a âncora se refaz com o
   texto de agora (quem escreve a guarda no servidor); quando o texto chega de fora (a sala ao vivo, #191), o trecho é
   achado de novo pela âncora. */

/** O texto corrido do documento (os trechos separados por quebra de linha) e a posição de cada letra no documento. */
export function textoCorrido(doc: NoPM): { texto: string; pos: number[] } {
  let texto = '';
  const pos: number[] = [];
  doc.descendants((n, p) => {
    if (n.isTextblock) {
      if (pos.length) {
        texto += '\n';
        pos.push(-1);
      }
      return true;
    }
    if (n.isText) {
      texto += n.text;
      for (let i = 0; i < n.text!.length; i++) pos.push(p + i);
    } else if (n.isInline && n.isLeaf) {
      texto += '￼';
      pos.push(p);
    }
    return true;
  });
  return { texto, pos };
}

/** O trecho [de, ate) do texto corrido, em posições do documento. */
export function faixaNoDoc(pos: number[], de: number, ate: number): { de: number; ate: number } | null {
  while (de < ate && pos[de] < 0) de++;
  while (ate > de && pos[ate - 1] < 0) ate--;
  return de < ate ? { de: pos[de], ate: pos[ate - 1] + 1 } : null;
}
/** O trecho [de, ate) do documento, no texto corrido. */
export function faixaNoTexto(pos: number[], de: number, ate: number): { de: number; ate: number } | null {
  const i = pos.findIndex((p) => p >= de);
  let j = -1;
  for (let k = pos.length - 1; k >= 0; k--)
    if (pos[k] >= 0 && pos[k] < ate) {
      j = k;
      break;
    }
  return i >= 0 && j >= i ? { de: i, ate: j + 1 } : null;
}

export interface Faixa {
  de: number;
  ate: number;
  ancora: Ancora;
}
interface Estado {
  /** os comentários com a âncora guardada (os abertos e o que está sendo escrito) */
  ancoras: Map<string, Ancora>;
  /** onde cada um está agora; o que não está aqui saiu do texto */
  faixas: Map<string, Faixa>;
  ativo: string | null;
  /** as âncoras refeitas pela digitação daqui, para quem escreve guardar */
  refeitas: Set<string>;
}
type Meta = { ancoras: { id: string; ancora: Ancora }[] } | { ativo: string | null } | { guardadas: string[] };

export const chaveDosComentarios = new PluginKey<Estado>('comentarios-no-texto');

function acharTodas(doc: NoPM, ancoras: Map<string, Ancora>): Map<string, Faixa> {
  const { texto, pos } = textoCorrido(doc);
  const faixas = new Map<string, Faixa>();
  for (const [id, ancora] of ancoras) {
    const t = acharAncora(texto, ancora);
    const f = t && faixaNoDoc(pos, t.de, t.ate);
    if (f) faixas.set(id, { ...f, ancora });
  }
  return faixas;
}

/** O grifo dos trechos comentados (a classe `comentario-trecho`; o ativo, também `ativo`). */
export const ComentariosNoTexto = Extension.create({
  name: 'comentariosNoTexto',
  addProseMirrorPlugins() {
    return [
      new Plugin<Estado>({
        key: chaveDosComentarios,
        state: {
          init: () => ({ ancoras: new Map(), faixas: new Map(), ativo: null, refeitas: new Set() }),
          apply(tr, velho, _antes, depois) {
            const meta = tr.getMeta(chaveDosComentarios) as Meta | undefined;
            if (meta && 'ancoras' in meta) {
              const ancoras = new Map(meta.ancoras.map((a) => [a.id, a.ancora]));
              return { ...velho, ancoras, faixas: acharTodas(depois.doc, ancoras), refeitas: new Set([...velho.refeitas].filter((id) => ancoras.has(id))) };
            }
            if (meta && 'ativo' in meta) return { ...velho, ativo: meta.ativo };
            if (meta && 'guardadas' in meta) return { ...velho, refeitas: new Set([...velho.refeitas].filter((id) => !meta.guardadas.includes(id))) };
            if (!tr.docChanged || !velho.ancoras.size) return velho;
            // o texto que chegou da sala troca o documento inteiro: o trecho é achado de novo pela âncora
            const deFora = !!(tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin;
            if (deFora) return { ...velho, faixas: acharTodas(depois.doc, velho.ancoras) };
            const { texto, pos } = textoCorrido(depois.doc);
            const ancoras = new Map(velho.ancoras);
            const faixas = new Map<string, Faixa>();
            const refeitas = new Set(velho.refeitas);
            for (const [id, ancora] of velho.ancoras) {
              const f = velho.faixas.get(id);
              const de = f ? tr.mapping.map(f.de, 1) : 0;
              const ate = f ? tr.mapping.map(f.ate, -1) : 0;
              const noTexto = f && de < ate ? faixaNoTexto(pos, de, ate) : null;
              if (!noTexto) {
                // o trecho sumiu na edição (ou já tinha saído): tenta achar pela âncora
                const t = acharAncora(texto, ancora);
                const achado = t && faixaNoDoc(pos, t.de, t.ate);
                if (achado) faixas.set(id, { ...achado, ancora });
                continue;
              }
              const nova = ancoraDe(texto, noTexto.de, noTexto.ate);
              if (nova.trecho !== ancora.trecho || nova.antes !== ancora.antes || nova.depois !== ancora.depois) {
                ancoras.set(id, nova);
                refeitas.add(id);
              }
              faixas.set(id, { de, ate, ancora: ancoras.get(id)! });
            }
            return { ...velho, ancoras, faixas, refeitas };
          },
        },
        props: {
          decorations(state) {
            const e = chaveDosComentarios.getState(state);
            if (!e?.faixas.size) return DecorationSet.empty;
            return DecorationSet.create(
              state.doc,
              [...e.faixas].map(([id, f]) => Decoration.inline(f.de, f.ate, { class: `comentario-trecho${e.ativo === id ? ' ativo' : ''}`, 'data-comentario': id })),
            );
          },
        },
      }),
    ];
  },
});

/** Põe as âncoras dos comentários abertos (e a do que está sendo escrito) no texto. */
export const definirAncoras = (view: EditorView, ancoras: { id: string; ancora: Ancora }[]) => view.dispatch(view.state.tr.setMeta(chaveDosComentarios, { ancoras }).setMeta('addToHistory', false));
/** O comentário em foco: o grifo dele fica mais forte. */
export const ativarComentario = (view: EditorView, ativo: string | null) => view.dispatch(view.state.tr.setMeta(chaveDosComentarios, { ativo }).setMeta('addToHistory', false));
/** Onde está cada comentário agora. */
export const faixasDosComentarios = (state: EditorState) => chaveDosComentarios.getState(state)?.faixas ?? new Map<string, Faixa>();
/** As âncoras refeitas pela digitação daqui que ainda não foram guardadas. */
export function ancorasRefeitas(state: EditorState): Record<string, Ancora> {
  const e = chaveDosComentarios.getState(state);
  return Object.fromEntries([...(e?.refeitas ?? [])].filter((id) => e!.ancoras.has(id)).map((id) => [id, e!.ancoras.get(id)!]));
}
export const ancorasGuardadas = (view: EditorView, ids: string[]) => view.dispatch(view.state.tr.setMeta(chaveDosComentarios, { guardadas: ids }).setMeta('addToHistory', false));

/** A âncora do trecho selecionado; sem seleção (ou só espaço), null. Quem só lê seleciona no texto que não se edita:
    vale a seleção da página quando o editor não a tem. */
export function ancoraDaSelecao(view: EditorView): { ancora: Ancora; de: number; ate: number } | null {
  let { from, to } = view.state.selection;
  if (from === to) {
    const s = typeof window !== 'undefined' ? window.getSelection() : null;
    if (s && !s.isCollapsed && s.anchorNode && s.focusNode && view.dom.contains(s.anchorNode) && view.dom.contains(s.focusNode)) {
      try {
        const a = view.posAtDOM(s.anchorNode, s.anchorOffset);
        const b = view.posAtDOM(s.focusNode, s.focusOffset);
        from = Math.min(a, b);
        to = Math.max(a, b);
      } catch {
        return null;
      }
    }
  }
  if (from === to) return null;
  const { texto, pos } = textoCorrido(view.state.doc);
  const t = faixaNoTexto(pos, from, to);
  if (!t) return null;
  // sem os espaços das pontas
  let { de, ate } = t;
  while (de < ate && /\s/.test(texto[de])) de++;
  while (ate > de && /\s/.test(texto[ate - 1])) ate--;
  if (de >= ate) return null;
  const f = faixaNoDoc(pos, de, ate)!;
  return { ancora: ancoraDe(texto, de, ate), ...f };
}
