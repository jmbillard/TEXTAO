/* A Campanha (#177, #178): um conjunto de Produções com um nome. Uma Produção pode estar em várias; a etiqueta do card
   mostra a primeira ligada e "+N" das outras. Puro: a tela de Produções, o card aberto e, depois, a Pauta e a agenda
   (#181) leem daqui. */
import { nomeComparavel } from './ligarPeloNome.ts';

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

/** A campanha tem todas as palavras do termo no nome, cada uma pelo começo de uma palavra, sem caixa, acento e
    pontuação (a busca da lista das campanhas, #180: a mesma no servidor e na tela). O termo vazio acha todas. */
export function campanhaCombina(nome: string, termo: string): boolean {
  const palavras = nomeComparavel(String(termo ?? '')).split(' ').filter(Boolean);
  const onde = ` ${nomeComparavel(nome)}`;
  return palavras.every((p) => onde.includes(` ${p}`));
}

/* ---------- a página da campanha (#180) ---------- */

/** O endereço da lista das campanhas e o da página de uma campanha. */
export const HASH_DAS_CAMPANHAS = '#/campanhas';
export const hashDaCampanha = (id: string) => `${HASH_DAS_CAMPANHAS}/${encodeURIComponent(id)}`;

/** O endereço é o da lista (`{ id: undefined }`) ou o da página de uma campanha; null quando não é das campanhas. */
export function campanhaDoHash(hash: string): { id?: string } | null {
  const m = /^#\/campanhas(?:\/([^/]+))?\/?$/.exec(hash);
  if (!m) return null;
  return m[1] ? { id: decodeURIComponent(m[1]) } : {};
}

/** As etapas que a campanha conta (a arquivada fica de fora). */
export const ETAPAS_DA_CAMPANHA = ['entrada', 'produzindo', 'entregue'] as const;
export type EtapaDaCampanha = (typeof ETAPAS_DA_CAMPANHA)[number];
export type ContagensDaCampanha = Record<EtapaDaCampanha, number>;

/** A campanha na lista: quantas Produções (sem as arquivadas), quantas em cada etapa e quando foi mexida por último. */
export interface CampanhaNaLista extends CampanhaDoCard {
  producoes: number;
  etapas: ContagensDaCampanha;
  mexidaEm: string;
}

/** Quando foi mexida por último, como a lista escreve: "agora há pouco", "há 3 h", "ontem", "há 5 dias", "em 12/10". */
export function mexidaEscrita(iso: string, agora: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const min = Math.max(0, Math.round((agora - t) / 60_000));
  if (min < 2) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  const dia = (x: number) => new Date(x).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const ontem = dia(agora - 86_400_000);
  if (dia(t) === dia(agora)) return `há ${h} h`;
  if (dia(t) === ontem) return 'ontem';
  const dias = Math.round((Date.parse(`${dia(agora)}T12:00:00Z`) - Date.parse(`${dia(t)}T12:00:00Z`)) / 86_400_000);
  if (dias < 30) return `há ${dias} dias`;
  const d = new Date(t);
  return `em ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d)}`;
}
