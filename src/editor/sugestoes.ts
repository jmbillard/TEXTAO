import type { Node as NoPM } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { ySyncPluginKey } from 'y-prosemirror';
import { acharAncora, ancoraDe, type Ancora } from '../modelo/comentarios';
import { sugestaoDoTrecho, trocaMinima, type SugestaoNova } from '../modelo/sugestoes';
import { textoCorrido } from './comentarios';

/* A revisão que volta como sugestão (#196), no editor.

   Do lado do designer, o rastro: cada mudança feita com o cadeado aberto (#188) na cópia da fila marca um trecho
   mudado, com o texto que estava lá antes de ele mexer. Mudanças vizinhas ou em cima de um trecho já mudado se juntam
   nele; desfeita a mudança (o texto volta a ser o de antes), o trecho sai. A cópia guarda a mudança como sempre (o
   Trello sai certo já); o rastro só diz o que vira sugestão ao redator. O texto que chega da sala (o colega, o desfazer)
   troca o documento inteiro: cada trecho é achado de novo pelo texto dele, como os comentários (#192).

   Do lado do redator, aplicar: aceitar troca, no escrito, o trecho achado pela âncora pelo texto sugerido, mexendo só
   no meio que muda (o começo e o fim iguais guardam as marcas, a arte inclusive). */

/** Um trecho mudado: onde está agora (no documento) e o que estava lá antes. */
export interface TrechoMudado {
  id: string;
  de: number;
  ate: number;
  original: string;
}

export interface Rastro {
  trechos: TrechoMudado[];
}

export const novoRastro = (): Rastro => ({ trechos: [] });

const OBJETO = '￼';
const textoEntre = (doc: NoPM, de: number, ate: number) => (de < ate ? doc.textBetween(de, ate, '\n', OBJETO) : '');

/** A posição `p` do documento no texto corrido (o de `textoCorrido`). */
export function indiceNoTexto(doc: NoPM, p: number): number {
  let n = 0;
  let algum = false;
  doc.descendants((no, q) => {
    if (q >= p) return false;
    if (no.isTextblock) {
      if (algum) n++;
      return true;
    }
    if (no.isText) {
      const k = Math.min(no.text!.length, p - q);
      n += k;
      if (no.text!.length) algum = true;
    } else if (no.isInline && no.isLeaf) {
      n++;
      algum = true;
    }
    return true;
  });
  return n;
}

/** Onde o documento mudou de um para o outro: [de, ateAntes) no de antes, [de, ateDepois) no de depois. */
function ondeMudou(antes: NoPM, depois: NoPM): { de: number; ateAntes: number; ateDepois: number } | null {
  const de = antes.content.findDiffStart(depois.content);
  if (de == null) return null;
  const fim = antes.content.findDiffEnd(depois.content)!;
  let { a, b } = fim;
  const sobra = de - Math.min(a, b);
  if (sobra > 0) {
    a += sobra;
    b += sobra;
  }
  return { de, ateAntes: a, ateDepois: b };
}

/**
 * Uma mudança feita com o cadeado aberto: o trecho dela entra no rastro, juntando-se aos que encosta (o original do
 * trecho junto é o texto de antes de tudo). Os outros trechos andam com o texto.
 * @param novoId o id do trecho novo
 */
export function registrarMudanca(rastro: Rastro, tr: Transaction, novoId: () => string): void {
  const antes = tr.before;
  const m = ondeMudou(antes, tr.doc);
  if (!m) return;
  const delta = m.ateDepois - m.ateAntes;
  const tocados = rastro.trechos.filter((t) => t.ate >= m.de && t.de <= m.ateAntes).sort((x, y) => x.de - y.de);
  const resto = rastro.trechos.filter((t) => !tocados.includes(t)).map((t) => (t.de >= m.ateAntes ? { ...t, de: t.de + delta, ate: t.ate + delta } : t));
  const de = Math.min(m.de, ...tocados.map((t) => t.de));
  const ate = Math.max(m.ateAntes, ...tocados.map((t) => t.ate));
  // o original do trecho junto: o texto de antes, com o original de cada trecho tocado no lugar dele
  let original = '';
  let p = de;
  for (const t of tocados) {
    original += textoEntre(antes, p, t.de) + t.original;
    p = t.ate;
  }
  original += textoEntre(antes, p, ate);
  const novo: TrechoMudado = { id: tocados[0]?.id ?? novoId(), de, ate: ate + delta, original };
  rastro.trechos = juntarNaPalavra([...resto, novo], tr.doc).filter((t) => textoEntre(tr.doc, t.de, t.ate) !== t.original);
}

/**
 * Qualquer outra transação: o rastro anda com ela. O que chega da sala troca o documento inteiro, então cada trecho é
 * achado de novo pelo texto de agora dele (com o contexto); o que não se acha mais e cujo texto de antes voltou (o
 * desfazer) sai do rastro.
 */
export function acompanhar(rastro: Rastro, tr: Transaction): void {
  if (!tr.docChanged || !rastro.trechos.length) return;
  const daSala = !!tr.getMeta(ySyncPluginKey);
  if (!daSala) {
    rastro.trechos = rastro.trechos.map((t) => ({ ...t, de: tr.mapping.map(t.de, -1), ate: Math.max(tr.mapping.map(t.de, -1), tr.mapping.map(t.ate, 1)) }));
    return;
  }
  const velho = textoCorrido(tr.before);
  const novo = textoCorrido(tr.doc);
  const achados: TrechoMudado[] = [];
  for (const t of rastro.trechos) {
    // o trecho com as palavras inteiras em volta: uma letra sozinha se acharia em qualquer lugar
    const i = indiceNoTexto(tr.before, t.de);
    const j = indiceNoTexto(tr.before, t.ate);
    const [I, J] = palavrasEmVolta(velho.texto, i, j);
    const agora = ancoraDe(velho.texto, I, J);
    const a = agora.trecho.trim() ? acharAncora(novo.texto, agora) : null;
    if (a) {
      const de = lugarNoDoc(novo.pos, a.de + (i - I), tr.doc);
      achados.push({ ...t, de, ate: Math.max(de, lugarNoDoc(novo.pos, a.ate - (J - j), tr.doc)) });
      continue;
    }
    // o texto de antes voltou ali: a mudança foi desfeita
    const deAntes = velho.texto.slice(I, i) + t.original + velho.texto.slice(j, J);
    if (deAntes.trim() && acharAncora(novo.texto, { ...agora, trecho: deAntes })) continue;
    // não achou nada: guarda onde estava, para a sugestão já mandada continuar valendo
    const lugar = Math.min(tr.mapping.map(t.de, -1), tr.doc.content.size);
    achados.push({ ...t, de: lugar, ate: lugar });
  }
  rastro.trechos = achados.filter((t) => textoEntre(tr.doc, t.de, t.ate) !== t.original);
}

/** [i, j) do texto crescido até as palavras inteiras. */
function palavrasEmVolta(texto: string, i: number, j: number): [number, number] {
  while (i > 0 && !/\s/.test(texto[i - 1])) i--;
  while (j < texto.length && !/\s/.test(texto[j])) j++;
  return [i, j];
}

/** A letra k do texto corrido como lugar no documento: logo depois da letra de antes (no mesmo trecho), ou a própria. */
function lugarNoDoc(pos: number[], k: number, doc: NoPM): number {
  if (k > 0 && pos[k - 1] >= 0) return pos[k - 1] + 1;
  if (k < pos.length && pos[k] >= 0) return pos[k];
  return Math.max(0, doc.content.size - 1);
}

/** Os trechos na mesma palavra viram um (senão a palavra teria duas sugestões, cada uma com um pedaço). */
function juntarNaPalavra(trechos: TrechoMudado[], doc: NoPM): TrechoMudado[] {
  const saida: TrechoMudado[] = [];
  for (const t of [...trechos].sort((x, y) => x.de - y.de)) {
    const ultimo = saida[saida.length - 1];
    const vao = ultimo ? textoEntre(doc, ultimo.ate, t.de) : ' ';
    if (ultimo && t.de >= ultimo.ate && !/\s/.test(vao) && !vao.includes(OBJETO)) saida[saida.length - 1] = { ...ultimo, ate: t.ate, original: ultimo.original + vao + t.original };
    else saida.push(t);
  }
  return saida;
}

/** As sugestões do rastro, no documento de agora: a âncora do trecho de antes e o texto de agora, por palavra inteira. */
export function sugestoesDoRastro(rastro: Rastro, doc: NoPM): SugestaoNova[] {
  const { texto } = textoCorrido(doc);
  const saida: SugestaoNova[] = [];
  for (const t of rastro.trechos) {
    const s = sugestaoDoTrecho(texto, indiceNoTexto(doc, t.de), indiceNoTexto(doc, t.ate), t.original);
    if (s) saida.push({ id: t.id, ...s });
  }
  return saida;
}

/** Os trechos decididos pelo redator saem do rastro: o que a pessoa mexer ali depois é uma sugestão nova. */
export function esquecer(rastro: Rastro, ids: readonly string[]): void {
  if (ids.length) rastro.trechos = rastro.trechos.filter((t) => !ids.includes(t.id));
}

/**
 * Aceitar a sugestão no texto do escrito: acha o trecho pela âncora e troca só o meio que muda. Devolve a âncora do
 * texto sugerido, já no lugar (para o desfazer achar e trocar de volta), ou null quando o trecho saiu do texto.
 */
export function aplicarSugestao(view: EditorView, ancora: Ancora, sugerido: string): Ancora | null {
  const { texto, pos } = textoCorrido(view.state.doc);
  const a = acharAncora(texto, ancora);
  if (!a) return null;
  const troca = trocaMinima(texto.slice(a.de, a.ate), sugerido);
  // a letra k do texto corrido, como lugar no documento: logo depois da letra de antes (no mesmo trecho), ou a própria
  const noDoc = (k: number) => lugarNoDoc(pos, k, view.state.doc);
  const pDe = noDoc(a.de + troca.de);
  const pAte = troca.ate > troca.de ? noDoc(a.de + troca.ate) : pDe;
  const tr = view.state.tr;
  const linhas = troca.entra.split('\n');
  if (!troca.entra) tr.delete(pDe, pAte);
  else tr.insertText(linhas[0], pDe, pAte);
  // o sugerido com quebras de linha: cada linha nova é um trecho novo
  let p = pDe + linhas[0].length;
  for (const l of linhas.slice(1)) {
    tr.split(p);
    p += 2;
    if (l) tr.insertText(l, p);
    p += l.length;
  }
  view.dispatch(tr);
  const depois = textoCorrido(view.state.doc).texto;
  return ancoraDe(depois, a.de, a.de + sugerido.length);
}
