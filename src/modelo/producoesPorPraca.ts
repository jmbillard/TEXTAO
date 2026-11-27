/* A tela de produções (#109): as Produções abertas numa faixa por praça, com as colunas Entrada · Produzindo ·
   Entregue. Aqui fica o que é puro: o que o card mostra, a faixa de cada praça (na ordem das praças da Configuração) e
   a ordem dos cards (o prazo e, no mesmo prazo, a prioridade ALTA primeiro). O servidor monta a lista a partir das
   Produções do PROMeiro, sem ler o Trello; o navegador só desenha. O mesmo módulo serve aos dois: só sintaxe que o
   Node apaga. */
import type { Praca } from './pracas.ts';

/** As colunas da faixa, na ordem do fluxo. */
export const COLUNAS_DA_FAIXA = ['entrada', 'produzindo', 'entregue'] as const;
export type ColunaDaFaixa = (typeof COLUNAS_DA_FAIXA)[number];
export const ROTULO_DA_COLUNA: Record<ColunaDaFaixa, string> = { entrada: 'Entrada', produzindo: 'Produzindo', entregue: 'Entregue' };

/** Quantos dias o Entregue mostra (os entregues mais velhos saem da tela). */
export const DIAS_DO_ENTREGUE = 3;

/** Uma Produção como o card da tela mostra. */
export interface CardDaProducao {
  id: string;
  claquete: string;
  /** a atração ('' quando o PROMeiro não sabe) */
  atracao: string;
  praca: string;
  etapa: ColunaDaFaixa;
  /** o status dentro de Produzindo (aguardando material…), '' sem ele */
  marcador: string;
  designers: string[];
  /** as artes a produzir (sem repetir; null sem a lista) e as já marcadas no checklist */
  artes: { aProduzir: number | null; entregues: number };
  /** a prioridade ALTA da produção da arte (o marca-texto) */
  alta: boolean;
  /** o prazo: a exibição (o dia, AAAA-MM-DD, ou o instante ISO) ou, sem ela, o dia da claquete; null sem nenhum */
  prazo: string | null;
  /** sem card no Trello (a linha sem card, o filme sem card) */
  semCard: boolean;
  entregaEm: string | null;
}

export interface FaixaDaPraca {
  praca: string;
  nome: string;
  colunas: Record<ColunaDaFaixa, CardDaProducao[]>;
}

export interface TelaDeProducoes {
  entregueDias: number;
  faixas: FaixaDaPraca[];
}

const SO_O_DIA = /^\d{4}-\d{2}-\d{2}$/;
/** O dia do prazo (AAAA-MM-DD), em São Paulo quando o prazo é um instante. */
export const diaDoPrazo = (prazo: string) =>
  SO_O_DIA.test(prazo) ? prazo : new Date(prazo).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** A ordem dos cards: o dia do prazo (sem prazo, no fim); no mesmo dia, a ALTA primeiro; depois a hora e a claquete. */
export function ordemDosCards(a: CardDaProducao, b: CardDaProducao): number {
  if (!a.prazo || !b.prazo) return a.prazo ? -1 : b.prazo ? 1 : a.claquete.localeCompare(b.claquete, 'pt-BR');
  const dia = diaDoPrazo(a.prazo).localeCompare(diaDoPrazo(b.prazo));
  if (dia) return dia;
  if (a.alta !== b.alta) return a.alta ? -1 : 1;
  return a.prazo.localeCompare(b.prazo) || a.claquete.localeCompare(b.claquete, 'pt-BR');
}

const vazias = (): Record<ColunaDaFaixa, CardDaProducao[]> => ({ entrada: [], produzindo: [], entregue: [] });

/**
 * As faixas da tela: uma por praça, na ordem das praças (também a praça sem nenhuma Produção), e, no fim, uma para cada
 * praça que a Produção diz e a Configuração não tem mais ("sem praça" para a vazia). Cada card vai para a coluna da
 * etapa dele, na ordem do prazo. Quem chama já tirou as arquivadas e os entregues antigos.
 */
export function faixasDasProducoes(cards: readonly CardDaProducao[], pracas: readonly Praca[]): FaixaDaPraca[] {
  const faixas = new Map<string, FaixaDaPraca>(pracas.map((p) => [p.sigla, { praca: p.sigla, nome: p.nome, colunas: vazias() }]));
  for (const c of cards) {
    if (!COLUNAS_DA_FAIXA.includes(c.etapa)) continue;
    if (!faixas.has(c.praca)) faixas.set(c.praca, { praca: c.praca, nome: c.praca || 'sem praça', colunas: vazias() });
    faixas.get(c.praca)!.colunas[c.etapa].push(c);
  }
  for (const f of faixas.values()) for (const k of COLUNAS_DA_FAIXA) f.colunas[k].sort(ordemDosCards);
  return [...faixas.values()];
}
