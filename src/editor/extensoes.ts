import { Extension, Mark, Node, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ehVersoes, RE_LINK, sugerirSubtipo } from '../importar/interpretar';
import { analisarSonoras, ehLocucao, lerContexto, lerTimecodeSolto, RE_LINHA_LOC, type ContextoSonora } from '../modelo/sonora';
import { nomeEtiqueta, novoId, type Layout, type NoJSON, type SubtipoArte, type TipoEtiqueta } from '../modelo/tipos';

/* ---------- marcas ---------- */

const attr = (nome: string, padrao: unknown, html = `data-${nome}`) => ({
  default: padrao,
  parseHTML: (el: HTMLElement) => {
    const v = el.getAttribute(html);
    if (v === null) return padrao;
    return typeof padrao === 'boolean' ? v === 'true' : v;
  },
  renderHTML: (attrs: Record<string, unknown>) =>
    attrs[nome] === null || attrs[nome] === '' || attrs[nome] === false ? {} : { [html]: String(attrs[nome]) },
});

export const Arte = Mark.create({
  name: 'arte',
  inclusive: false,
  // a arte já é um chip: negrito e itálico por dentro só a partiriam em pedaços
  excludes: 'bold italic',
  addAttributes() {
    return {
      id: attr('id', null),
      subtipo: attr('subtipo', ''),
      grupo: attr('grupo', null),
      obs: attr('obs', ''),
      sugerido: attr('sugerido', false),
    };
  },
  parseHTML() {
    return [{ tag: 'u.arte' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['u', { ...HTMLAttributes, class: 'arte' }, 0];
  },
});

export const Etiqueta = Mark.create({
  name: 'etiqueta',
  inclusive: false,
  addAttributes() {
    return { id: attr('id', null), tipo: attr('tipo', 'comentario'), obs: attr('obs', '') };
  },
  parseHTML() {
    return [{ tag: 'span.etq' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'etq' }, 0];
  },
});

/** Texto colado do Word ou de outro editor: o que vem sublinhado vira arte, e "AMANHÃ/HOJE" vira uma arte por versão. */
export function prepararColagem(html: string): string {
  if (typeof DOMParser === 'undefined' || !/<u[\s>]|underline|data-id/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // arte ou etiqueta copiada daqui mesmo: a cópia ganha identidade própria, senão mudar uma mudaria as duas
  const grupos = new Map<string, string>();
  doc.querySelectorAll('u.arte[data-id], span.etq[data-id]').forEach((el) => {
    el.setAttribute('data-id', novoId());
    const g = el.getAttribute('data-grupo');
    if (g) {
      if (!grupos.has(g)) grupos.set(g, novoId());
      el.setAttribute('data-grupo', grupos.get(g)!);
    }
  });
  const sublinhado = (no: Text): Element | null => {
    let achado: Element | null = null;
    for (let el = no.parentElement; el && el !== doc.body; el = el.parentElement) {
      // link é sublinhado por natureza; e o que foi copiado daqui mesmo já é arte
      if (el.tagName === 'A' || el.classList.contains('arte')) return null;
      if (!achado && (el.tagName === 'U' || /underline/i.test(el.getAttribute('style') ?? ''))) achado = el;
    }
    return achado;
  };
  const textos: Text[] = [];
  const andar = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (andar.nextNode()) textos.push(andar.currentNode as Text);
  // um mesmo trecho sublinhado pode vir partido (negrito no meio): continua sendo a mesma arte
  const emCurso = new Map<Element, { id: string; grupo: string | null }>();
  // link e caminho de rede colados como texto sublinhado também não são arte
  const marcados = textos.map((t) => ({ t, dono: sublinhado(t) })).filter((x) => x.dono && x.t.data.trim() && !RE_LINK.test(x.dono.textContent ?? '')) as { t: Text; dono: Element }[];
  marcados.forEach(({ t, dono }, n) => {
    // espaços entre dois pedaços do mesmo sublinhado ficam dentro da arte, para ela não se partir
    const continuaAntes = marcados[n - 1]?.dono === dono;
    const continuaDepois = marcados[n + 1]?.dono === dono;
    const partes = ehVersoes(t.data) ? t.data.split('/') : [t.data];
    const grupo = partes.filter((p) => p.trim()).length > 1 ? novoId() : (emCurso.get(dono)?.grupo ?? null);
    const frag = doc.createDocumentFragment();
    partes.forEach((parte, k) => {
      if (k > 0) {
        frag.append('/');
        emCurso.delete(dono);
      }
      const ini = k === 0 && continuaAntes ? 0 : parte.length - parte.trimStart().length;
      const fim = k === partes.length - 1 && continuaDepois ? parte.length : parte.trimEnd().length;
      const miolo = parte.slice(ini, fim);
      if (!miolo.trim()) return void frag.append(parte);
      const atual = emCurso.get(dono) ?? { id: novoId(), grupo };
      emCurso.set(dono, atual);
      const u = doc.createElement('u');
      u.className = 'arte';
      u.setAttribute('data-id', atual.id);
      const g = grupo ?? atual.grupo;
      if (g) u.setAttribute('data-grupo', g);
      u.textContent = miolo;
      frag.append(parte.slice(0, ini), u, parte.slice(fim));
    });
    t.replaceWith(frag);
  });
  return doc.body.innerHTML;
}

/* ---------- colunas ---------- */

export const Linha = Node.create({
  name: 'linha',
  group: 'block',
  content: 'celula celula',
  isolating: true,
  parseHTML() {
    return [{ tag: 'div.linha' }];
  },
  renderHTML() {
    return ['div', { class: 'linha' }, 0];
  },
});

export const Celula = Node.create({
  name: 'celula',
  content: 'paragraph+',
  isolating: true,
  parseHTML() {
    return [{ tag: 'div.celula' }];
  },
  renderHTML() {
    return ['div', { class: 'celula' }, 0];
  },
});

const linhaVazia = (): NoJSON => ({
  type: 'linha',
  content: [
    { type: 'celula', content: [{ type: 'paragraph' }] },
    { type: 'celula', content: [{ type: 'paragraph' }] },
  ],
});

/** Converte o documento entre texto corrido e duas colunas, sem perder nada. */
export function converterLayout(doc: NoJSON, layout: Layout): NoJSON {
  const temTexto = (p: NoJSON) => (p.content ?? []).length > 0;
  const emColunas = (doc.content ?? []).some((n) => n.type === 'linha');
  if (layout === 'coluna_unica') {
    if (!emColunas) return doc;
    const pars = (doc.content ?? []).flatMap((n) =>
      n.type === 'linha' ? (n.content ?? []).flatMap((c) => c.content ?? []).filter(temTexto) : [n],
    );
    return { type: 'doc', content: pars.length ? pars : [{ type: 'paragraph' }] };
  }
  if (emColunas) return doc;
  const linhas = (doc.content ?? [])
    .filter(temTexto)
    .map((p) => ({ type: 'linha', content: [{ type: 'celula', content: [{ type: 'paragraph' }] }, { type: 'celula', content: [p] }] }));
  return { type: 'doc', content: linhas.length ? linhas : [linhaVazia()] };
}

/* ---------- comandos de marcação ---------- */

interface Faixa {
  from: number;
  to: number;
  texto: string;
  /** Texto do parágrafo antes da faixa e o parágrafo inteiro, para sugerir o subtipo. */
  antes: string;
  total: string;
}

/** A seleção, quebrada por parágrafo e sem espaços nas pontas. */
function faixasDaSelecao(editor: Editor): Faixa[] {
  const { from, to } = editor.state.selection;
  const out: Faixa[] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const ini = Math.max(from, pos + 1);
    const fim = Math.min(to, pos + 1 + node.content.size);
    if (fim <= ini) return false;
    const total = node.textBetween(0, node.content.size, undefined, '\n');
    const bruto = total.slice(ini - pos - 1, fim - pos - 1);
    const a = bruto.length - bruto.trimStart().length;
    const b = bruto.length - bruto.trimEnd().length;
    if (bruto.trim()) out.push({ from: ini + a, to: fim - b, texto: bruto.trim(), antes: total.slice(0, ini + a - pos - 1), total });
    return false;
  });
  return out;
}

/** Subtipo que o app sugere para o trecho selecionado. */
export function sugestaoParaSelecao(editor: Editor, programa: string): SubtipoArte {
  const f = faixasDaSelecao(editor)[0];
  void programa;
  return f ? sugerirSubtipo(f.texto, f.antes) : '';
}

export function selecaoTem(editor: Editor, nome: 'arte' | 'etiqueta', tipo?: string): boolean {
  const faixas = faixasDaSelecao(editor);
  if (!faixas.length) return false;
  return faixas.every((f) => {
    let ok = true;
    editor.state.doc.nodesBetween(f.from, f.to, (node) => {
      if (node.isText && !node.marks.some((m) => m.type.name === nome && (!tipo || m.attrs.tipo === tipo))) ok = false;
    });
    return ok;
  });
}

/** Marca a seleção como arte. "AMANHÃ/HOJE" vira uma arte por versão. Sem subtipo, usa a sugestão. */
export function marcarArte(editor: Editor, subtipo?: SubtipoArte, programa = ''): boolean {
  void programa;
  const faixas = faixasDaSelecao(editor);
  if (!faixas.length) return false;
  const tipo = editor.schema.marks.arte;
  const tr = editor.state.tr;
  if (!subtipo && selecaoTem(editor, 'arte')) {
    faixas.forEach((f) => tr.removeMark(f.from, f.to, tipo));
    editor.view.dispatch(tr);
    return true;
  }
  for (const f of faixas) {
    tr.removeMark(f.from, f.to, tipo);
    const partes = ehVersoes(f.texto) ? f.texto.split('/') : [f.texto];
    const grupo = partes.filter((p) => p.trim()).length > 1 ? novoId() : null;
    let pos = f.from;
    for (const parte of partes) {
      const a = parte.length - parte.trimStart().length;
      const miolo = parte.trim();
      if (miolo) {
        const sub = subtipo ?? sugerirSubtipo(miolo, f.antes);
        tr.addMark(pos + a, pos + a + miolo.length, tipo.create({ id: novoId(), subtipo: sub, grupo, obs: '', sugerido: false }));
      }
      pos += parte.length + 1;
    }
  }
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, tr.selection.to)));
  return true;
}

export function marcarEtiqueta(editor: Editor, tipoEtq: TipoEtiqueta): boolean {
  const faixas = faixasDaSelecao(editor);
  if (!faixas.length) return false;
  const tipo = editor.schema.marks.etiqueta;
  const tr = editor.state.tr;
  const remover = selecaoTem(editor, 'etiqueta', tipoEtq);
  for (const f of faixas) {
    tr.removeMark(f.from, f.to, tipo);
    if (!remover) tr.addMark(f.from, f.to, tipo.create({ id: novoId(), tipo: tipoEtq, obs: '' }));
  }
  editor.view.dispatch(remover ? tr : tr.setSelection(TextSelection.create(tr.doc, tr.selection.to)));
  return true;
}

export function limparMarcas(editor: Editor): boolean {
  const faixas = faixasDaSelecao(editor);
  if (!faixas.length) return false;
  const tr = editor.state.tr;
  faixas.forEach((f) => tr.removeMark(f.from, f.to, editor.schema.marks.arte).removeMark(f.from, f.to, editor.schema.marks.etiqueta));
  editor.view.dispatch(tr);
  return true;
}

export interface MarcaNoDoc {
  nome: 'arte' | 'etiqueta';
  id: string;
  from: number;
  to: number;
  texto: string;
  attrs: Record<string, any>;
}

/** Todas as marcações do documento, na ordem em que aparecem. */
export function listarMarcas(doc: PMNode, nome: 'arte' | 'etiqueta'): MarcaNoDoc[] {
  const out: MarcaNoDoc[] = [];
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    const m = node.marks.find((x) => x.type.name === nome);
    if (!m) return false;
    const texto = node.text ?? ' ';
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.id === m.attrs.id && ultimo.to === pos) {
      ultimo.to = pos + node.nodeSize;
      ultimo.texto += texto;
    } else out.push({ nome, id: m.attrs.id, from: pos, to: pos + node.nodeSize, texto, attrs: m.attrs });
    return false;
  });
  return out;
}

/** A marcação sob o cursor: a arte tem prioridade sobre a etiqueta que a envolve. */
export function marcaEm(editor: Editor, pos: number): MarcaNoDoc | null {
  const em = (nome: 'arte' | 'etiqueta') => listarMarcas(editor.state.doc, nome).find((m) => pos >= m.from && pos <= m.to);
  return em('arte') ?? em('etiqueta') ?? null;
}

export function atualizarMarca(editor: Editor, marca: Pick<MarcaNoDoc, 'nome' | 'id'>, attrs: Record<string, unknown> | null) {
  const tipo = editor.schema.marks[marca.nome];
  const tr = editor.state.tr;
  for (const m of listarMarcas(editor.state.doc, marca.nome).filter((x) => x.id === marca.id)) {
    tr.removeMark(m.from, m.to, tipo);
    if (attrs) tr.addMark(m.from, m.to, tipo.create({ ...m.attrs, ...attrs }));
  }
  editor.view.dispatch(tr);
}

/** Troca a arte por um comentário (ou qualquer etiqueta), mantendo o texto. */
export function trocarPorEtiqueta(editor: Editor, marca: MarcaNoDoc, tipoEtq: TipoEtiqueta) {
  const tr = editor.state.tr;
  for (const m of listarMarcas(editor.state.doc, marca.nome).filter((x) => x.id === marca.id)) {
    tr.removeMark(m.from, m.to, editor.schema.marks[marca.nome]);
    tr.removeMark(m.from, m.to, editor.schema.marks.etiqueta);
    tr.addMark(m.from, m.to, editor.schema.marks.etiqueta.create({ id: novoId(), tipo: tipoEtq, obs: marca.attrs.obs ?? '' }));
  }
  editor.view.dispatch(tr);
}

/* ---------- teclado ---------- */

function celulaAtual(editor: Editor) {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--)
    if ($from.node(d).type.name === 'celula')
      return { linhaPos: $from.before(d - 1), linha: $from.node(d - 1), indice: $from.index(d - 1), profLinha: d - 1, $from };
  return null;
}

function irParaCelula(editor: Editor, linhaPos: number, indice: number): boolean {
  const linha = editor.state.doc.nodeAt(linhaPos);
  if (!linha || linha.type.name !== 'linha') return false;
  let pos = linhaPos + 1;
  for (let i = 0; i < indice; i++) pos += linha.child(i).nodeSize;
  const fim = pos + linha.child(indice).nodeSize - 2;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, fim)).scrollIntoView());
  return true;
}

function novaLinhaDepois(editor: Editor, linhaPos: number): boolean {
  const linha = editor.state.doc.nodeAt(linhaPos);
  if (!linha) return false;
  const depois = linhaPos + linha.nodeSize;
  const tr = editor.state.tr.insert(depois, editor.schema.nodeFromJSON(linhaVazia()));
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, depois + 3)).scrollIntoView());
  return true;
}

export const Teclado = Extension.create<{ programa: () => string }>({
  name: 'teclado',
  addOptions() {
    return { programa: () => '' };
  },
  addKeyboardShortcuts() {
    const etq = (t: TipoEtiqueta) => () => marcarEtiqueta(this.editor, t);
    return {
      'Mod-u': () => marcarArte(this.editor, undefined, this.options.programa()),
      'Mod-Shift-1': etq('edicao'),
      'Mod-Shift-2': etq('locutor'),
      'Mod-Shift-3': etq('sonoplastia'),
      'Mod-Shift-4': etq('cortavel'),
      'Mod-Shift-5': etq('producao'),
      'Mod-Shift-m': etq('comentario'),
      Tab: () => {
        const c = celulaAtual(this.editor);
        if (!c) return false;
        if (c.indice === 0) return irParaCelula(this.editor, c.linhaPos, 1);
        const proxima = c.linhaPos + c.linha.nodeSize;
        if (this.editor.state.doc.nodeAt(proxima)?.type.name === 'linha') return irParaCelula(this.editor, proxima, 0);
        return novaLinhaDepois(this.editor, c.linhaPos);
      },
      'Shift-Tab': () => {
        const c = celulaAtual(this.editor);
        if (!c) return false;
        if (c.indice === 1) return irParaCelula(this.editor, c.linhaPos, 0);
        const $l = this.editor.state.doc.resolve(c.linhaPos);
        const anterior = $l.nodeBefore;
        return anterior?.type.name === 'linha' ? irParaCelula(this.editor, c.linhaPos - anterior.nodeSize, 1) : true;
      },
      'Mod-Enter': () => {
        const c = celulaAtual(this.editor);
        return c ? novaLinhaDepois(this.editor, c.linhaPos) : false;
      },
      Backspace: () => {
        // apagar numa linha totalmente vazia remove a linha
        const c = celulaAtual(this.editor);
        if (!c || !this.editor.state.selection.empty || c.linha.textContent || c.linha.child(0).childCount + c.linha.child(1).childCount > 2) return false;
        const $l = this.editor.state.doc.resolve(c.linhaPos);
        const anterior = $l.nodeBefore;
        if (anterior?.type.name !== 'linha') return false;
        const tr = this.editor.state.tr.delete(c.linhaPos, c.linhaPos + c.linha.nodeSize);
        this.editor.view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(c.linhaPos - 1), -1)).scrollIntoView());
        return true;
      },
    };
  },
});

/* ---------- reconhecimento (só aparência; o texto não é alterado) ---------- */

const NAO_LIDO = ['edicao', 'locutor', 'sonoplastia', 'producao', 'comentario'];
const RE_MARCAS = /\/(?:edit|enx)\/|(?<![^\s])\/\/(?![^\s])|(?<=\s)\+(?=\s)/gi;

function decorar(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  let ctx: ContextoSonora | null = null;
  const vazio = !doc.textContent.trim();
  let primeiro = true;

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const ini = pos + 1;
    const total = node.textBetween(0, node.content.size, undefined, '\n');
    if (vazio && primeiro) {
      primeiro = false;
      decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'convite' }));
      return false;
    }
    if (!total.trim()) return false;

    let lido = '';
    node.forEach((filho) => {
      const e = filho.marks.find((m) => m.type.name === 'etiqueta');
      if (filho.isText && !(e && NAO_LIDO.includes(e.attrs.tipo))) lido += filho.text;
    });

    const novoCtx = lerContexto(total);
    const solto = novoCtx ? null : lerTimecodeSolto(total);
    const linhaLoc = RE_LINHA_LOC.exec(total);
    const sonoras = novoCtx || solto || linhaLoc || !lido.trim() ? [] : analisarSonoras(total, ctx);
    if (ctx?.tcPendente) ctx = { ...ctx, tcPendente: undefined };
    let classe = 'p-nota';
    if (novoCtx) {
      ctx = novoCtx;
      classe = 'p-origem';
    } else if (solto) {
      ctx = { origem: ctx?.origem ?? 'outro', origemOriginal: ctx?.origemOriginal ?? '', bloco: ctx?.bloco ?? null, tcPendente: solto };
      classe = 'p-origem';
    } else if (linhaLoc) {
      classe = 'p-loc';
      decos.push(Decoration.inline(ini, ini + linhaLoc[0].length, { class: 'marca-ed' }));
    } else if (sonoras.length) {
      classe = 'p-sonora';
      for (const s of sonoras) {
        if (s.prefixo) decos.push(Decoration.inline(ini + s.ini, ini + s.ini + s.prefixo, { class: 'tc' }));
        if (s.quemFim > s.quemIni) decos.push(Decoration.inline(ini + s.quemIni, ini + s.quemFim, { class: 'quem' }));
      }
    } else if (/^\s*\/\/\s*$/.test(total)) classe = 'p-corte';
    else if (ehLocucao(lido)) classe = 'p-loc';
    decos.push(Decoration.node(pos, pos + node.nodeSize, { class: classe }));

    if (classe !== 'p-corte')
      for (const m of total.matchAll(RE_MARCAS)) decos.push(Decoration.inline(ini + m.index, ini + m.index + m[0].length, { class: 'marca-ed' }));
    return false;
  });
  // rótulo no início de cada etiqueta ("edição", "sonoplastia"…): nunca depender só da cor
  for (const m of listarMarcas(doc, 'etiqueta')) {
    const tipo = String(m.attrs.tipo);
    decos.push(
      Decoration.widget(
        m.from,
        () => {
          const el = document.createElement('span');
          el.className = 'etq-rotulo';
          el.dataset.tipo = tipo;
          el.textContent = nomeEtiqueta(tipo);
          el.contentEditable = 'false';
          return el;
        },
        { side: -1, key: `${m.id}:${tipo}`, marks: [] },
      ),
    );
  }
  return DecorationSet.create(doc, decos);
}

const chave = new PluginKey<DecorationSet>('reconhecimento');

export const Reconhecimento = Extension.create({
  name: 'reconhecimento',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: chave,
        state: {
          init: (_, state) => decorar(state.doc),
          apply: (tr, antigo) => (tr.docChanged ? decorar(tr.doc) : antigo),
        },
        props: { decorations: (state) => chave.getState(state) },
      }),
    ];
  },
});
