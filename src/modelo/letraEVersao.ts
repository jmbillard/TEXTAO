/* A letra da chamada e a versão do roteiro (#156, #166): o ponto do ciclo da chamada em que o roteiro está. A claquete
   começa sem letra e sem versão (vale como A V1); um ajuste antes de a chamada ser liberada para exibição sobe a versão
   (V2, V3…); depois de liberada, o ajuste faz a chamada virar a letra seguinte (B, C…), de volta à V1. Sem imports de
   código: o servidor também lê daqui (o título das Produções e da Pauta). */
import type { Meta } from './tipos';

/** A versão do roteiro (#156): a guardada (a versão nova que substituiu a anterior na fila), senão a V2 do roteiro que
    respondeu "é v2" (atualiza o card que já estava na produção da arte), senão a V1. É a versão dentro da letra (#166). */
export const versaoDoRoteiro = (meta: Pick<Meta, 'versao' | 'v2De'>): number => Math.max(meta.versao ?? 1, meta.v2De ? 2 : 1);

/** A letra da chamada (#166): a guardada, senão a A (o roteiro sem letra, também os de antes do #166). */
export const letraDoRoteiro = (meta: Pick<Meta, 'letra'>): string => (/^[B-Z]$/.test(meta.letra ?? '') ? meta.letra! : 'A');

/** A letra e a versão do roteiro, juntas (#166): o ponto do ciclo da chamada em que ele está. */
export interface LetraEVersao {
  letra: string;
  versao: number;
}

export const letraEVersaoDoRoteiro = (meta: Pick<Meta, 'letra' | 'versao' | 'v2De'>): LetraEVersao => ({ letra: letraDoRoteiro(meta), versao: versaoDoRoteiro(meta) });

/**
 * A próxima letra e versão do roteiro que substitui o anterior (#166), pelo ciclo da chamada: a chamada ainda não
 * liberada para exibição ganha a versão seguinte na mesma letra (V2, V3…); a já liberada vira a letra seguinte (B, C…),
 * de volta à V1. Depois da Z, fica na Z.
 */
export function proximaLetraEVersao(anterior: LetraEVersao, liberada: boolean): LetraEVersao {
  if (!liberada) return { letra: anterior.letra, versao: anterior.versao + 1 };
  const letra = anterior.letra >= 'Z' ? 'Z' : String.fromCharCode(anterior.letra.charCodeAt(0) + 1);
  return { letra, versao: 1 };
}

/** O que o título e a claquete mostram da letra e da versão (#166): só o que não é o início. "" na A V1; "B", "V2",
    "B V2" nas outras. */
export const marcaDaLetraEVersao = ({ letra, versao }: LetraEVersao): string => [letra !== 'A' ? letra : '', versao > 1 ? `V${versao}` : ''].filter(Boolean).join(' ');

/** A marca da letra e da versão para pôr depois do nome (#166): '' quando o nome já diz. A que tem a versão ("V2",
    "B V2") vale em qualquer lugar do nome, como no #156; a letra sozinha, só no fim ("… B"), para não confundir com uma
    palavra do nome. */
export function marcaDepoisDoNome(marca: string, nome: string): string {
  if (!marca) return '';
  const padrao = `\\b${marca.replace(/ /g, '\\s+')}\\b`;
  return new RegExp(/V\d/.test(marca) ? padrao : `${padrao}\\W*$`, 'i').test(nome) ? '' : marca;
}

/** A letra e a versão de quem fica, guardadas na meta (#166), com a anterior e a resposta para corrigir depois. */
export const comLetraEVersao = (meta: Meta, anterior: LetraEVersao, liberada: boolean): Meta => {
  const { letra, versao } = proximaLetraEVersao(anterior, liberada);
  return { ...meta, letra: letra === 'A' ? undefined : letra, versao, substituiu: { ...anterior, liberada } };
};

/** A resposta de "Essa chamada já foi liberada para exibição?" corrigida no detalhe do card (#166): a letra e a versão
    são refeitas a partir da anterior guardada. Sem ela (o roteiro que não substituiu outro), a meta fica como está. */
export const corrigirLiberacao = (meta: Meta, liberada: boolean): Meta => (meta.substituiu ? comLetraEVersao(meta, meta.substituiu, liberada) : meta);
