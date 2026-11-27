/* A tela de produções (#109): as Produções abertas num bloco por praça (#119), com as colunas Entrada · Produzindo ·
   Entregue. Aqui fica o que é puro: o que o card mostra, o bloco de cada praça (na ordem das praças da Configuração) e
   a ordem dos cards (o prazo e, no mesmo prazo, a prioridade ALTA primeiro). O servidor monta a lista a partir das
   Produções do PROMeiro, sem ler o Trello; o navegador só desenha. O mesmo módulo serve aos dois: só sintaxe que o
   Node apaga. */
import type { Praca } from './pracas.ts';
import type { VersoesDaChamada } from './versoesDoRoteiro.ts';
import type { Versao } from './pauta.ts';

/** As colunas do bloco, na ordem do fluxo. */
export const COLUNAS_DO_BLOCO = ['entrada', 'produzindo', 'entregue'] as const;
export type ColunaDoBloco = (typeof COLUNAS_DO_BLOCO)[number];
export const ROTULO_DA_COLUNA: Record<ColunaDoBloco, string> = { entrada: 'Entrada', produzindo: 'Produzindo', entregue: 'Entregue' };

/** Quantos dias o Entregue mostra (os entregues mais velhos saem da tela). */
export const DIAS_DO_ENTREGUE = 3;

/** Uma Produção como o card da tela mostra. */
export interface CardDaProducao {
  id: string;
  claquete: string;
  /** a atração ('' quando o PROMeiro não sabe) */
  atracao: string;
  praca: string;
  etapa: ColunaDoBloco;
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
  /** as versões da chamada (#121), prontas: as do roteiro dela, ou o código do apelido ou da claquete */
  versoesDaChamada?: VersoesDaChamada;
  /** as versões lidas do roteiro dela (#152), vazia sem roteiro: a conta das versões refeita na tela quando o apelido
      muda (#154) */
  versoesLidas?: Versao[];
}

export interface BlocoDaPraca {
  praca: string;
  nome: string;
  colunas: Record<ColunaDoBloco, CardDaProducao[]>;
}

/** Quem está logado (#110): o designer ligado a ele, ou, sem a ligação, por que não pega e a quem pedir. */
export interface VoceNaTela {
  designer: string | null;
  porQue?: string;
}

export interface TelaDeProducoes {
  entregueDias: number;
  blocos: BlocoDaPraca[];
  voce: VoceNaTela;
}

/** Para onde os botões do card levam, na ordem: da Entrada, "Peguei" (#110); de Produzindo, "Entreguei" (#111) e a volta
    para a Entrada; de Entregue, a volta para a Entrada. */
export const BOTOES_DO_CARD: Record<ColunaDoBloco, readonly ColunaDoBloco[]> = { entrada: ['produzindo'], produzindo: ['entregue', 'entrada'], entregue: ['entrada'] };

/** Para onde o card pode ser arrastado, no mesmo bloco (#112): para onde os botões levam e, da Entrada, também direto
    para Entregue (o servidor aceita entregar da Entrada). */
export const ARRASTA_PARA: Record<ColunaDoBloco, readonly ColunaDoBloco[]> = { entrada: ['produzindo', 'entregue'], produzindo: ['entregue', 'entrada'], entregue: ['entrada'] };

/** O card mostra arte do checklist ainda não marcada? (Sem a lista de artes, não.) Entregar esse card pode trazer o
    aviso das que faltam (#111), que o servidor confere. */
export const faltaArte = (c: CardDaProducao) => c.artes.aProduzir !== null && c.artes.entregues < c.artes.aProduzir;

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

const vazias = (): Record<ColunaDoBloco, CardDaProducao[]> => ({ entrada: [], produzindo: [], entregue: [] });

/**
 * Os blocos da tela: um por praça, na ordem das praças (também a praça sem nenhuma Produção), e, no fim, um para cada
 * praça que a Produção diz e a Configuração não tem mais ("sem praça" para a vazia). Cada card vai para a coluna da
 * etapa dele, na ordem do prazo. Quem chama já tirou as arquivadas e os entregues antigos.
 */
export function blocosDasProducoes(cards: readonly CardDaProducao[], pracas: readonly Praca[]): BlocoDaPraca[] {
  const blocos = new Map<string, BlocoDaPraca>(pracas.map((p) => [p.sigla, { praca: p.sigla, nome: p.nome, colunas: vazias() }]));
  for (const c of cards) {
    if (!COLUNAS_DO_BLOCO.includes(c.etapa)) continue;
    if (!blocos.has(c.praca)) blocos.set(c.praca, { praca: c.praca, nome: c.praca || 'sem praça', colunas: vazias() });
    blocos.get(c.praca)!.colunas[c.etapa].push(c);
  }
  for (const b of blocos.values()) for (const k of COLUNAS_DO_BLOCO) b.colunas[k].sort(ordemDosCards);
  return [...blocos.values()];
}

/**
 * A tela com o card no lugar da etapa dele (#110): tirado de onde estava (em qualquer bloco) e posto na coluna da etapa,
 * no bloco da praça, na ordem do prazo. Serve para mostrar a mudança na hora e para voltar atrás. Sem o bloco da praça,
 * o card só sai de onde estava.
 */
export function comOCard(tela: TelaDeProducoes, card: CardDaProducao): TelaDeProducoes {
  const blocos = tela.blocos.map((b) => {
    const colunas = Object.fromEntries(COLUNAS_DO_BLOCO.map((k) => [k, b.colunas[k].filter((c) => c.id !== card.id)])) as Record<ColunaDoBloco, CardDaProducao[]>;
    if (b.praca === card.praca && COLUNAS_DO_BLOCO.includes(card.etapa)) colunas[card.etapa] = [...colunas[card.etapa], card].sort(ordemDosCards);
    return { ...b, colunas };
  });
  return { ...tela, blocos };
}

/* ---------- os blocos recolhidos (#113) ---------- */

/** A chave das preferências da pessoa (no SQLite, pela rota de quem está logado) com as siglas das praças dos blocos
    que ela recolheu; sem a chave, todos abertos. */
export const CHAVE_DOS_RECOLHIDOS = 'producoes.recolhidos';
/** Quantas siglas a lista aceita e o tamanho de cada uma (a do bloco "sem praça" é ''). */
const RECOLHIDOS_NO_MAXIMO = 100;
const SIGLA_NO_MAXIMO = 40;

/** A recusa da lista de blocos recolhidos: '' quando vale (uma lista de siglas, também vazia). */
export const recusaDosRecolhidos = (valor: unknown): string =>
  Array.isArray(valor) && valor.length <= RECOLHIDOS_NO_MAXIMO && valor.every((s) => typeof s === 'string' && s.length <= SIGLA_NO_MAXIMO)
    ? ''
    : 'Blocos recolhidos inválidos: mande a lista das siglas das praças.';

/** As praças que a pessoa deixou recolhidas; a lembrada que já não vale conta como nenhuma. */
export const recolhidosDe = (preferencias: Record<string, unknown> | undefined): string[] => {
  const lembrados = preferencias?.[CHAVE_DOS_RECOLHIDOS];
  return recusaDosRecolhidos(lembrados) ? [] : (lembrados as string[]);
};
