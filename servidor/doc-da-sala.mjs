/* O texto da sala ao vivo em JSON (#191). Na sala, o documento é um Y.XmlFragment "doc", do jeito do y-prosemirror: cada
   nó é um Y.XmlElement (o nome do nó e os atributos), e o texto, um Y.XmlText cujos trechos levam as marcas como
   atributos (a marca que pode se sobrepor ganha um sufixo "--hash"). Para o roteiro escrito no PROMeiro, é a sala que
   grava: o servidor lê dali o JSON que a lista, o histórico e o Enviar usam, sem precisar do schema do editor.

   Sem `instanceof`: a sala do servidor e os testes podem ter cada um a sua cópia do Yjs. */

/** O nome da marca, sem o sufixo da marca que pode se sobrepor (o mesmo `yattr2markname` do y-prosemirror). */
const nomeDaMarca = (chave) => /^(.*)--[a-zA-Z0-9+/=]{8}$/.exec(chave)?.[1] ?? chave;

const ehTexto = (item) => typeof item?.toDelta === 'function' && typeof item?.nodeName !== 'string';

function textos(item) {
  return item.toDelta().flatMap((d) => {
    if (typeof d.insert !== 'string' || !d.insert) return [];
    const no = { type: 'text', text: d.insert };
    const marcas = Object.entries(d.attributes ?? {}).map(([chave, attrs]) => ({ type: nomeDaMarca(chave), ...(attrs && typeof attrs === 'object' && Object.keys(attrs).length ? { attrs } : {}) }));
    if (marcas.length) no.marks = marcas;
    return [no];
  });
}

function noDe(item) {
  if (ehTexto(item)) return textos(item);
  if (typeof item?.nodeName !== 'string') return [];
  const no = { type: item.nodeName };
  const attrs = item.getAttributes();
  if (Object.keys(attrs).length) no.attrs = attrs;
  const filhos = item.toArray().flatMap(noDe);
  if (filhos.length) no.content = filhos;
  return [no];
}

/**
 * O documento ProseMirror (JSON) do fragmento "doc" da sala. O fragmento vazio vira o documento com um parágrafo vazio,
 * como o Novo roteiro nasce.
 * @param {{ getXmlFragment: (nome: string) => { toArray: () => unknown[] } }} ydoc
 */
export function docDaSala(ydoc) {
  const conteudo = ydoc.getXmlFragment('doc').toArray().flatMap(noDe);
  return { type: 'doc', content: conteudo.length ? conteudo : [{ type: 'paragraph' }] };
}

/** A sala tem texto ou metadados (alguém já a preencheu). */
export const salaPreenchida = (ydoc) => ydoc.getXmlFragment('doc').length > 0 || ydoc.getMap('meta').size > 0;
