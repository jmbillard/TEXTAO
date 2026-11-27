/* A Campanha (#177, #178): um conjunto de Produções com um nome. Uma Produção pode estar em várias; a etiqueta do card
   mostra a primeira ligada e "+N" das outras. Puro: a tela de Produções, o card aberto e, depois, a Pauta e a agenda
   (#181) leem daqui. */

/** A campanha como o card mostra. */
export interface CampanhaDoCard {
  id: string;
  nome: string;
}

/** Quantos tons a etiqueta tem (o CSS define `--campanha-0` … `--campanha-5`, no claro e no escuro). */
export const TONS_DA_CAMPANHA = 6;

/** O tom da bolinha da campanha, sempre o mesmo para a mesma campanha (pelo id). */
export function tomDaCampanha(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % TONS_DA_CAMPANHA;
}

/**
 * O que a etiqueta compacta mostra: as primeiras `quantas` (na ordem em que foram ligadas) e, das outras, quantas são
 * e os nomes (para o título do "+N").
 */
export function etiquetasDoCard(campanhas: readonly CampanhaDoCard[] | undefined, quantas = 1): { vistas: CampanhaDoCard[]; mais: number; resto: string[] } {
  const todas = campanhas ?? [];
  const vistas = todas.slice(0, Math.max(0, quantas));
  const resto = todas.slice(vistas.length).map((c) => c.nome);
  return { vistas, mais: resto.length, resto };
}

/** As campanhas que ainda dá para ligar à Produção (as que ela não tem), na ordem da lista. */
export const campanhasParaLigar = (todas: readonly CampanhaDoCard[], daProducao: readonly CampanhaDoCard[]) => todas.filter((c) => !daProducao.some((x) => x.id === c.id));
