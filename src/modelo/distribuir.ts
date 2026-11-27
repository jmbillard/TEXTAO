/* Montar a pauta, a coluna lateral (#126): as regras puras de arrastar, as mesmas no servidor e no navegador (só
   sintaxe que o Node apaga). Nenhuma muda a lista recebida: cada uma devolve as posições novas, ou null quando o que
   foi pedido não existe mais (a demanda, a posição). */
import { nomeComparavel } from './ligarPeloNome.ts';
import type { DemandaDaEscala, PosicaoDaEscala } from './escala.ts';

/** A lista escrita ou colada em "Para distribuir": uma claquete por linha, sem as vazias e sem os espaços das pontas. */
export const linhasParaDistribuir = (texto: string): string[] =>
  texto
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

/** Põe a demanda na posição, antes de `antesDe` (uma demanda dela) ou no fim. */
export function acrescentarDemanda(posicoes: readonly PosicaoDaEscala[], posicao: string, demanda: DemandaDaEscala, antesDe: string | null = null): PosicaoDaEscala[] | null {
  if (!posicoes.some((p) => p.id === posicao)) return null;
  return posicoes.map((p) => {
    if (p.id !== posicao) return p;
    const onde = antesDe ? p.demandas.findIndex((d) => d.id === antesDe) : -1;
    const i = onde >= 0 ? onde : p.demandas.length;
    return { ...p, demandas: [...p.demandas.slice(0, i), demanda, ...p.demandas.slice(i)] };
  });
}

/** Tira a demanda da posição em que está: as posições sem ela, a demanda e de quem ela era ('' na vaga). */
export function tirarDemanda(posicoes: readonly PosicaoDaEscala[], demanda: string): { posicoes: PosicaoDaEscala[]; demanda: DemandaDaEscala; de: string } | null {
  const dona = posicoes.find((p) => p.demandas.some((d) => d.id === demanda));
  if (!dona) return null;
  return {
    posicoes: posicoes.map((p) => (p === dona ? { ...p, demandas: p.demandas.filter((d) => d.id !== demanda) } : p)),
    demanda: dona.demandas.find((d) => d.id === demanda)!,
    de: dona.editor,
  };
}

/** Move a demanda para a posição (pode ser a mesma), antes de `antesDe` ou no fim. */
export function moverDemanda(posicoes: readonly PosicaoDaEscala[], demanda: string, posicao: string, antesDe: string | null = null): PosicaoDaEscala[] | null {
  if (antesDe === demanda) return posicoes.slice();
  const tirada = tirarDemanda(posicoes, demanda);
  return tirada && acrescentarDemanda(tirada.posicoes, posicao, tirada.demanda, antesDe);
}

/** Onde escalar: numa posição que já existe (a vaga, ou no lugar de quem está nela) ou numa posição nova do turno. */
export type AlvoDeEscalar = { posicao: string } | { turno: string; nova: PosicaoDaEscala };

/** Escala o editor: na posição do alvo, ou na posição nova, depois da última do turno. */
export function escalarNa(posicoes: readonly PosicaoDaEscala[], editor: string, alvo: AlvoDeEscalar): PosicaoDaEscala[] | null {
  if ('posicao' in alvo) {
    if (!posicoes.some((p) => p.id === alvo.posicao)) return null;
    return posicoes.map((p) => (p.id === alvo.posicao ? { ...p, editor } : p));
  }
  const nova = { ...alvo.nova, turno: alvo.turno, editor };
  const ultima = posicoes.map((p) => p.turno).lastIndexOf(alvo.turno);
  const onde = ultima >= 0 ? ultima + 1 : posicoes.length;
  return [...posicoes.slice(0, onde), nova, ...posicoes.slice(onde)];
}

/**
 * Quem está "Sem escala" no dia: os editores cadastrados que não estão em nenhuma posição e não estão fora (pelo nome
 * sem caixa, acento e pontuação), na ordem da lista.
 */
export function semEscala(editores: readonly string[], posicoes: readonly Pick<PosicaoDaEscala, 'editor'>[], fora: readonly string[]): string[] {
  const ocupados = new Set([...posicoes.map((p) => p.editor), ...fora].map(nomeComparavel).filter(Boolean));
  return editores.filter((e) => !ocupados.has(nomeComparavel(e)));
}
