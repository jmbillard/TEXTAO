import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ySyncPluginKey } from 'y-prosemirror';
import { listarMarcas, marcaEm, marcarArte } from './extensoes';
import { barraNoTexto, fichasDoTexto, nomeDoArquivo, palpiteDoTipo, tipoVizinho, type ComandoDaBarra, type FichaNoTexto, type TipoDoTrecho } from '../modelo/trecho';
import { novoId } from '../modelo/tipos';

/* Escrever na folha (#190, spec #186): o teclado e o texto do editor de escrita. É o mesmo documento da revisão (o
   schema de `extensoesDoRoteiro`); esta extensão só entra na folha de escrita (`TelaDeEscrita`) e faz:

   - o palpite do tipo do trecho, refeito enquanto se digita, até a pessoa confirmar (o "?" da margem);
   - o trecho do tipo arte coberto pela marca `Arte` (uma só, com o tipo da arte opcional), para a lista, a fila e o
     .docx lerem a arte como leem a arte marcada no meio da frase;
   - Tab e Shift+Tab, que confirmam ou trocam o tipo; Ctrl+U, que marca a arte no selecionado ou no trecho todo; o
     Enter no fim do trecho, que abre um trecho novo sem tipo (o palpite);
   - as fichas de timecode e de arquivo, que o texto vira sozinho quando o cursor sai delas (só aparência: o texto fica
     como foi digitado).

   O que é tela (a margem, o menu do "/", os balões) fica em `ui/EscritaNaFolha.tsx`, e fala com a extensão pela
   `PonteDaEscrita`. */

/** O que a extensão pede à tela. Tudo opcional: sem tela, a extensão só faz o palpite e as fichas. */
export interface PonteDaEscrita {
  /** o menu aberto (o do "/") consome as teclas dele: setas, Enter, Tab e Esc. true: a tecla foi dele */
  teclaNoMenu?: (e: KeyboardEvent) => boolean;
  /**
   * Gancho das sugestões de arte (uma leva seguinte da spec #186): Tab aceita a sugestão do trecho, quando há uma, e só
   * sem ela troca o tipo. true: havia uma sugestão e ela foi aceita.
   */
  aceitarSugestao?: () => boolean;
  /** o clique numa ficha (o cursor não entra nela: abre o balão com o caminho inteiro e o copiar) */
  abrirFicha?: (f: { tipo: FichaNoTexto['tipo']; texto: string; el: HTMLElement }) => void;
  /** um clique no texto, com o cursor já no lugar (abre o balão da arte, como na revisão) */
  aoClicar?: (pos: number) => void;
  /** o Ctrl+Enter, que abre o Enviar (#194); sem ele, o Ctrl+Enter é a quebra de linha do editor. true: abriu */
  enviar?: () => boolean;
}

/** O texto do trecho com a quebra de linha e a imagem valendo um caractere cada: as posições batem com as do editor. */
const textoDoNo = (p: PMNode) => p.textBetween(0, p.content.size, '\n', '\n');

/** O trecho (parágrafo) onde está o cursor: a posição dele e o nó. */
export function trechoNoCursor(state: EditorState): { pos: number; no: PMNode } | null {
  const { $from } = state.selection;
  if ($from.parent.type.name !== 'paragraph') return null;
  return { pos: $from.before($from.depth), no: $from.parent };
}

/** O tipo que o trecho mostra: o guardado ou, sem ele, o palpite pelo texto. */
export const tipoDoNo = (p: PMNode): { tipo: TipoDoTrecho; confirmado: boolean } =>
  p.attrs.tipo ? { tipo: p.attrs.tipo as TipoDoTrecho, confirmado: p.attrs.confirmado === true } : { tipo: palpiteDoTipo(textoDoNo(p)), confirmado: false };

/** As marcas de arte que cobrem o trecho inteiro do tipo arte saem quando ele deixa de ser arte. */
function tirarArteDoTrecho(tr: Transaction, pos: number, no: PMNode) {
  tr.removeMark(pos + 1, pos + 1 + no.content.size, no.type.schema.marks.arte);
}

/**
 * Dá o tipo ao trecho em `pos`. `confirmado` false volta ao palpite (o tipo é refeito pelo texto). Sair do tipo arte
 * tira a marca da arte do trecho; entrar nele a põe (pelo `appendTransaction`).
 */
export function definirTipo(editor: Editor, pos: number, tipo: TipoDoTrecho | null, confirmado = true): boolean {
  const no = editor.state.doc.nodeAt(pos);
  if (!no || no.type.name !== 'paragraph') return false;
  const tr = editor.state.tr;
  const novo = confirmado && tipo ? tipo : palpiteDoTipo(textoDoNo(no));
  if (tipoDoNo(no).tipo === 'arte' && novo !== 'arte') tirarArteDoTrecho(tr, pos, no);
  tr.setNodeMarkup(pos, undefined, { ...no.attrs, tipo: novo, confirmado: !!(confirmado && tipo) });
  editor.view.dispatch(tr);
  return true;
}

/** Tab (1) e Shift+Tab (-1): o palpite se confirma no primeiro Tab; o tipo confirmado troca pelo vizinho no ciclo. */
export function confirmarOuTrocar(editor: Editor, sentido: 1 | -1): boolean {
  const t = trechoNoCursor(editor.state);
  if (!t) return false;
  const { tipo, confirmado } = tipoDoNo(t.no);
  return definirTipo(editor, t.pos, sentido === 1 && !confirmado ? tipo : tipoVizinho(tipo, sentido));
}

/**
 * Ctrl+U: com seleção, a arte no selecionado (no meio da frase), como na revisão. Sem seleção: dentro de uma arte da
 * frase, desmarca ela; senão, o trecho todo vira (ou deixa de ser) do tipo arte.
 */
export function arteNoSelecionadoOuNoTrecho(editor: Editor, programa = ''): boolean {
  const { selection } = editor.state;
  if (!selection.empty) return marcarArte(editor, undefined, programa);
  const t = trechoNoCursor(editor.state);
  if (!t) return false;
  const ehArte = tipoDoNo(t.no).tipo === 'arte';
  if (!ehArte) {
    const m = marcaEm(editor, selection.from);
    if (m?.nome === 'arte') {
      const tr = editor.state.tr;
      for (const x of listarMarcas(editor.state.doc, 'arte').filter((x) => x.id === m.id)) tr.removeMark(x.from, x.to, editor.schema.marks.arte);
      editor.view.dispatch(tr);
      return true;
    }
  }
  return ehArte ? definirTipo(editor, t.pos, null, false) : definirTipo(editor, t.pos, 'arte');
}

/** O toque num tipo da barra do celular (#198): o trecho do cursor ganha o tipo (o palpite do mesmo tipo se confirma). */
export function darTipoNoCursor(editor: Editor, tipo: TipoDoTrecho): boolean {
  const t = trechoNoCursor(editor.state);
  if (!t) return false;
  const atual = tipoDoNo(t.no);
  if (atual.confirmado && atual.tipo === tipo) return true;
  return definirTipo(editor, t.pos, tipo);
}

/** O botão "/" do celular (#198): o "/" no cursor, como se digitado, com um espaço antes no meio da palavra (o "/" só
    abre o menu no começo do trecho ou depois de um espaço). */
export function abrirBarraNoCursor(editor: Editor): boolean {
  const { selection } = editor.state;
  const { $from } = selection;
  if ($from.parent.type.name !== 'paragraph') return false;
  const antes = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n');
  const texto = !antes || /\s$/.test(antes) ? '/' : ' /';
  editor.view.dispatch(editor.state.tr.insertText(texto, selection.from, selection.to).scrollIntoView());
  return true;
}

/** O "/" antes do cursor, com o que se digitou depois dele: de `from` (o "/") até `to` (o cursor). */
export interface BarraNoCursor {
  q: string;
  from: number;
  to: number;
}

export function barraNoCursor(state: EditorState): BarraNoCursor | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.parent.type.name !== 'paragraph') return null;
  const q = barraNoTexto($from.parent.textBetween(0, $from.parentOffset, '\n', '\n'));
  return q === null ? null : { q, from: $from.pos - q.length - 1, to: $from.pos };
}

/** Um timecode para preencher, já selecionado: digitar troca ele todo. */
const TIMECODE_VAZIO = '00:00:00:00';

/** Faz o comando do "/": tira o "/…" do texto e dá o tipo ao trecho, ou põe a ficha para preencher. */
export function aplicarComando(editor: Editor, comando: ComandoDaBarra, barra: BarraNoCursor): boolean {
  const { state } = editor;
  const tr = state.tr.delete(barra.from, barra.to);
  if (comando.id === 'timecode') {
    tr.insertText(TIMECODE_VAZIO, barra.from);
    tr.setSelection(TextSelection.create(tr.doc, barra.from, barra.from + TIMECODE_VAZIO.length));
  } else if (comando.id === 'arquivo') {
    tr.insertText('\\\\', barra.from);
  }
  editor.view.dispatch(tr.scrollIntoView());
  if (comando.tipo) {
    const t = trechoNoCursor(editor.state);
    if (t) definirTipo(editor, t.pos, comando.tipo);
  }
  return true;
}

/** Enter no fim do trecho abre um trecho novo sem tipo: o palpite começa de novo. No meio, parte o trecho em dois do
    mesmo tipo (o padrão do editor). */
function enterNoFim(editor: Editor): boolean {
  const { selection } = editor.state;
  if (!selection.empty || selection.$from.parent.type.name !== 'paragraph' || selection.$from.parentOffset < selection.$from.parent.content.size) return false;
  return editor.chain().splitBlock().updateAttributes('paragraph', { tipo: null, confirmado: null }).run();
}

/* ---------- o palpite e a arte do trecho ---------- */

/** Refaz o palpite dos trechos não confirmados e cobre de arte o trecho do tipo arte. */
function arrumar(state: EditorState): Transaction | null {
  let tr: Transaction | null = null;
  const arte = state.schema.marks.arte;
  state.doc.descendants((no, pos) => {
    if (no.type.name !== 'paragraph') return true;
    let { tipo } = no.attrs;
    if (no.attrs.confirmado !== true) {
      const palpite = palpiteDoTipo(textoDoNo(no));
      if (palpite !== tipo || no.attrs.confirmado !== false) (tr ??= state.tr).setNodeMarkup(pos, undefined, { ...no.attrs, tipo: palpite, confirmado: false });
      tipo = palpite;
    }
    if (tipo === 'arte' && no.textContent.trim()) {
      let attrs: Record<string, unknown> | null = null;
      let falta = false;
      no.forEach((filho) => {
        if (!filho.isText) return;
        const m = filho.marks.find((x) => x.type === arte);
        if (m && !attrs) attrs = m.attrs;
        if (!m || m.attrs.id !== (attrs as Record<string, unknown> | null)?.id) falta = true;
      });
      if (falta) (tr ??= state.tr).addMark(pos + 1, pos + 1 + no.content.size, arte.create(attrs ?? { id: novoId(), subtipo: '', grupo: null, obs: '', sugerido: false }));
    }
    return false;
  });
  return tr;
}

/* ---------- as fichas ---------- */

/** As fichas do texto como decoração, menos a que o cursor (ou a seleção) toca: ela ainda está sendo digitada. */
function decorarFichas(state: EditorState): DecorationSet {
  const decos: Decoration[] = [];
  const { from, to } = state.selection;
  state.doc.descendants((no, pos) => {
    if (!no.isTextblock) return true;
    for (const f of fichasDoTexto(textoDoNo(no))) {
      const a = pos + 1 + f.ini;
      const b = pos + 1 + f.fim;
      if (from <= b && to >= a) continue;
      const attrs = { class: `ficha-do-texto ficha-do-texto-${f.tipo}`, 'data-ficha': f.texto, 'data-tipo-ficha': f.tipo };
      decos.push(Decoration.inline(a, b, attrs));
      // no arquivo, a ficha mostra o nome; as pastas ficam guardadas no texto (e aparecem no balão e ao editar)
      if (f.tipo === 'arquivo') {
        const nome = nomeDoArquivo(f.texto);
        const ini = f.texto.lastIndexOf(nome);
        if (ini > 0) decos.push(Decoration.inline(a, a + ini, { class: 'ficha-do-texto-pasta' }));
      }
    }
    return false;
  });
  return DecorationSet.create(state.doc, decos);
}

const chaveDasFichas = new PluginKey<DecorationSet>('fichasDaEscrita');

/** As teclas da escrita, na ordem: o menu aberto, o Ctrl+Enter do Enviar (#194), o Tab (a sugestão, depois o tipo), o Ctrl+U e o Enter no fim. */
function tecla(editor: Editor, ponte: PonteDaEscrita, e: KeyboardEvent, programa: string): boolean {
  if (ponte.teclaNoMenu?.(e)) return true;
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Enter' && mod && !e.shiftKey && !e.altKey && ponte.enviar?.()) return true;
  if (e.key === 'Tab' && !mod && !e.altKey) {
    if (!e.shiftKey && ponte.aceitarSugestao?.()) return true;
    return confirmarOuTrocar(editor, e.shiftKey ? -1 : 1);
  }
  if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyU') return arteNoSelecionadoOuNoTrecho(editor, programa);
  if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) return enterNoFim(editor);
  return false;
}

/**
 * A escrita na folha. Vem antes do `Teclado` da revisão (prioridade alta): o Tab e o Ctrl+U daqui valem na folha.
 * `ponte` é lida a cada uso, para a tela trocar o que oferece sem recriar o editor.
 */
export const Escrita = Extension.create<{ ponte: () => PonteDaEscrita; programa: () => string }>({
  name: 'escrita',
  priority: 1000,
  addOptions: () => ({ ponte: () => ({}), programa: () => '' }),
  addProseMirrorPlugins() {
    const { editor } = this;
    const { ponte, programa } = this.options;
    return [
      new Plugin({
        key: new PluginKey('palpiteDaEscrita'),
        appendTransaction(trs, _antes, state) {
          // o que chega da sala ao vivo já veio arrumado de quem digitou
          if (!trs.some((t) => t.docChanged) || trs.some((t) => t.getMeta(ySyncPluginKey))) return null;
          return arrumar(state);
        },
      }),
      new Plugin<DecorationSet>({
        key: chaveDasFichas,
        state: {
          init: (_, state) => decorarFichas(state),
          apply: (tr, antigo, _velho, novo) => (tr.docChanged || tr.selectionSet ? decorarFichas(novo) : antigo),
        },
        props: {
          decorations: (state) => chaveDasFichas.getState(state),
          handleKeyDown: (_view, e) => editor.isEditable && tecla(editor, ponte(), e, programa()),
          handleClick: (_view, pos) => {
            ponte().aoClicar?.(pos);
            return false;
          },
          handleDOMEvents: {
            mousedown: (_view, e) => {
              const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('.ficha-do-texto');
              const abrir = ponte().abrirFicha;
              if (!el || !abrir || e.button !== 0) return false;
              // o cursor não entra na ficha (ela abriria para editar): o clique abre o balão
              e.preventDefault();
              abrir({ tipo: el.dataset.tipoFicha as FichaNoTexto['tipo'], texto: el.dataset.ficha ?? '', el });
              return true;
            },
          },
        },
      }),
    ];
  },
});
