import { chaveDeArte } from './diferencas';
import { exportar, pendencias } from './exportar';
import { metaVazia, type Meta, type NoJSON, type Roteiro } from './tipos';
import { semAcento } from './vocabularios';

/* Versão nova de um roteiro que já estava na fila: o texto vem do arquivo novo, mas o trabalho já feito
   na versão anterior (o tipo e a observação de cada arte) passa para as artes que continuam iguais. */

const comoRoteiro = (doc: NoJSON): Roteiro => ({ id: 'v', meta: metaVazia(), doc, revisao: 1, criadoEm: '', atualizadoEm: '' });
const chave = (texto: string) => semAcento(texto).replace(/[^a-z0-9]+/g, ' ').trim();

export function herdarTipos(novo: NoJSON, anterior: NoJSON): { doc: NoJSON; herdadas: number } {
  const daAnterior = new Map<string, { subtipo: string; obs: string }>();
  for (const a of exportar(comoRoteiro(anterior)).artes) if (a.subtipo || a.observacao) daAnterior.set(chave(a.texto), { subtipo: a.subtipos.join(','), obs: a.observacao });
  const textoDaNova = new Map(exportar(comoRoteiro(novo)).artes.map((a) => [a.id, a.texto]));

  let herdadas = 0;
  const vistas = new Set<string>();
  const copiar = (no: NoJSON): NoJSON => ({
    ...no,
    ...(no.content ? { content: no.content.map(copiar) } : {}),
    ...(no.marks
      ? {
          marks: no.marks.map((m) => {
            const id = String(m.attrs?.id ?? '');
            if (m.type !== 'arte' || m.attrs?.subtipo) return m;
            const veio = daAnterior.get(chave(textoDaNova.get(id) ?? ''));
            if (!veio) return m;
            if (!vistas.has(id)) {
              vistas.add(id);
              herdadas++;
            }
            return { ...m, attrs: { ...m.attrs, subtipo: veio.subtipo, obs: m.attrs?.obs || veio.obs } };
          }),
        }
      : {}),
  });
  return { doc: copiar(novo), herdadas };
}

type Marcas = Pick<Meta, 'jaExiste' | 'naoProduzir' | 'produzir' | 'complexidade'>;

/** As marcas da revisão (já existe, não produzir, produzir e a complexidade), pela chave da arte: as da anterior passam
 *  para as artes que continuam na nova, menos onde a nova já tem a sua. */
function herdarMarcas(nova: Roteiro, anterior: Roteiro): Marcas {
  const chaves = new Set(exportar(nova).artes.map((a) => chaveDeArte(a.texto)));
  const n = nova.meta;
  const a = anterior.meta;
  const listaDaNova = new Set([...(n.jaExiste ?? []), ...(n.naoProduzir ?? []), ...(n.produzir ?? [])]);
  const juntar = (minhas: string[] | undefined, dela: string[] | undefined) => {
    const lista = [...(minhas ?? []), ...(dela ?? []).filter((k) => chaves.has(k) && !listaDaNova.has(k))];
    return lista.length ? [...new Set(lista)] : undefined;
  };
  const complexidade = { ...n.complexidade };
  for (const [k, v] of Object.entries(a.complexidade ?? {})) if (chaves.has(k) && !(k in complexidade)) complexidade[k] = v;
  return {
    jaExiste: juntar(n.jaExiste, a.jaExiste),
    naoProduzir: juntar(n.naoProduzir, a.naoProduzir),
    produzir: juntar(n.produzir, a.produzir),
    complexidade: Object.keys(complexidade).length ? complexidade : undefined,
  };
}

/** A versão do roteiro (#156): a guardada (a versão nova que substituiu a anterior na fila), senão a V2 do roteiro que
    respondeu "é v2" (atualiza o card que já estava na produção da arte), senão a V1. */
export const versaoDoRoteiro = (meta: Pick<Meta, 'versao' | 'v2De'>): number => Math.max(meta.versao ?? 1, meta.v2De ? 2 : 1);

/** "Substituir a anterior": fica a nova, sem a pergunta, com o trabalho já feito na anterior (os tipos e as
 *  observações das artes, o editor e as marcas da revisão) e a versão seguinte à dela. As pendências são recalculadas. */
export function substituirVersao(nova: Roteiro, anterior: Roteiro): { roteiro: Roteiro; herdadas: number } {
  const { doc, herdadas } = herdarTipos(nova.doc, anterior.doc);
  const versao = Math.max(versaoDoRoteiro(nova.meta), versaoDoRoteiro(anterior.meta) + 1);
  const roteiro: Roteiro = { ...nova, doc, meta: { ...nova.meta, ...herdarMarcas(nova, anterior), substitui: undefined, editor: nova.meta.editor || anterior.meta.editor, versao } };
  roteiro.meta.revisar = pendencias(exportar(roteiro));
  return { roteiro, herdadas };
}

/** "Manter as duas": a nova só deixa de perguntar; a anterior fica na fila como está. */
export const manterAsDuas = (nova: Roteiro): Roteiro => ({ ...nova, meta: { ...nova.meta, substitui: undefined } });
