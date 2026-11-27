/* As artes do roteiro aberto (#104), uma regra pura e compartilhada: as que a revisão marcou ("do roteiro") e as que o
   designer pôs direto na produção ("do designer"), cada uma com o seu estado, a partir do que o PROMeiro já sabe (a
   revisão e a Produção). Nada vem do Trello. Só sintaxe que o Node apaga. */
import { chaveDeArte } from './diferencas.ts';
import type { Etapa } from './producao.ts';

/** O estado de uma arte: a fazer, produzindo, entregue ou já existe (no acervo, não se produz). */
export type EstadoDaArte = 'a-fazer' | 'produzindo' | 'entregue' | 'ja-existe';
/** "do roteiro": marcada na revisão; "do designer": posta direto na produção (no checklist do card). */
export type OrigemDaArte = 'roteiro' | 'designer';

export interface ArteDoRoteiro {
  texto: string;
  /** as siglas dos tipos (RDP, CRT…); a do designer vem sem tipo */
  tipos: string[];
  estado: EstadoDaArte;
  origem: OrigemDaArte;
}

export interface ArtesDoRoteiro {
  lista: ArteDoRoteiro[];
  /** quantas há para produzir (sem as que já existem) */
  aProduzir: number;
  /** quantas dessas já foram entregues */
  entregues: number;
}

/** A arte como a revisão a manda (`artesDoEnvio`): o texto, as siglas dos tipos e se já existe. */
export interface ArteDaRevisao {
  texto: string;
  tipos: string[];
  existe: boolean;
}

/** O que a regra lê da Produção do roteiro: a etapa, os itens da coluna de artes e os marcados no checklist. */
export interface ProducaoDasArtes {
  etapa: Etapa;
  artes: string[];
  artesMarcadas: string[];
}

/** O estado da arte ainda não marcada, pela etapa da Produção: Entrada (ou nenhuma) a fazer, Produzindo produzindo,
    Entregue ou arquivada entregue (a entrega vale para todas, marcadas no checklist ou não). */
function pelaEtapa(producao: ProducaoDasArtes | null): EstadoDaArte {
  if (!producao || producao.etapa === 'entrada') return 'a-fazer';
  return producao.etapa === 'produzindo' ? 'produzindo' : 'entregue';
}

/**
 * As artes do roteiro, na ordem da revisão, e depois as do designer, na ordem da produção. A arte de vários tipos é
 * um item do checklist por tipo ("HOJE (RDP)", "HOJE (CRT)"): está entregue quando todos estão marcados. Um item da
 * produção que não é de nenhuma arte da revisão é "do designer". Os textos se comparam sem caixa, acento e pontuação.
 */
export function artesDoRoteiro(daRevisao: ArteDaRevisao[], producao: ProducaoDasArtes | null): ArtesDoRoteiro {
  const marcadas = new Set((producao?.artesMarcadas ?? []).map(chaveDeArte));
  const resto = pelaEtapa(producao);
  const usados = new Set<string>();
  const lista: ArteDoRoteiro[] = daRevisao.map((a) => {
    const itens = a.tipos.length > 1 ? a.tipos.map((t) => chaveDeArte(`${a.texto} (${t})`)) : [chaveDeArte(a.texto)];
    for (const k of [chaveDeArte(a.texto), ...itens]) usados.add(k);
    if (a.existe) return { texto: a.texto, tipos: a.tipos, estado: 'ja-existe', origem: 'roteiro' };
    const entregue = marcadas.has(chaveDeArte(a.texto)) || itens.every((k) => marcadas.has(k));
    return { texto: a.texto, tipos: a.tipos, estado: entregue ? 'entregue' : resto, origem: 'roteiro' };
  });
  // as do designer: os itens da produção (a coluna de artes e os marcados no checklist) que não são da revisão
  for (const item of [...(producao?.artes ?? []), ...(producao?.artesMarcadas ?? [])]) {
    const k = chaveDeArte(item);
    if (!k || usados.has(k)) continue;
    usados.add(k);
    lista.push({ texto: item.trim(), tipos: [], estado: marcadas.has(k) ? 'entregue' : resto, origem: 'designer' });
  }
  const aProduzir = lista.filter((a) => a.estado !== 'ja-existe');
  return { lista, aProduzir: aProduzir.length, entregues: aProduzir.filter((a) => a.estado === 'entregue').length };
}
