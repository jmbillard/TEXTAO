/* A Produção (#86, ADR 0006): o trabalho da arte de uma claquete numa praça, com id próprio do PROMeiro. O card do
   Trello e o registro da produção da arte no Teable são só referências dela. Aqui fica o que é puro: a etapa a partir
   do que a produção da arte diz (sem o Trello) e a Produção que sai de uma linha da produção da arte na carga inicial.
   O mesmo módulo serve ao servidor e ao navegador: só sintaxe que o Node apaga. */
import { normalizarPraca, pracasRegistradas, reconhecerPraca, type Praca } from './pracas.ts';

/** As etapas da Produção, na ordem do fluxo (Arquivada fica de fora do fluxo). */
export const ETAPAS = ['entrada', 'produzindo', 'entregue', 'arquivada'] as const;
export type Etapa = (typeof ETAPAS)[number];

/** O que a etapa lê de uma linha da produção da arte. */
export interface SinaisDaEtapa {
  arquivado: boolean;
  entregue: boolean;
  /** o status (seleção múltipla do Teable, o que o n8n traz das etiquetas do card) */
  status: readonly string[];
  designers: readonly string[];
}

const comparavel = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Os status que não são trabalho: a entrada e a etiqueta de todos os cards de filme. */
const SEM_TRABALHO = new Set(['ENTRADA', 'FILME']);
/** Os status que já são a etapa (não viram marcador). */
const DA_ETAPA = new Set(['PRODUZINDO', 'FINALIZADO']);
/** O status por extenso, pela forma sem acento; o que não está aqui vira só minúscula. */
const POR_EXTENSO: Record<string, string> = {
  'AGUARDANDO MATERIAL': 'Aguardando material',
  'EM APROVACAO': 'Em aprovação',
  'PEDIDO DE ALTERACAO': 'Pedido de alteração',
  CAIU: 'Caiu',
};
const porExtenso = (s: string) => POR_EXTENSO[s] ?? s[0] + s.slice(1).toLowerCase();

/**
 * A etapa e o marcador da Produção pelo que a produção da arte diz (sem o Trello): arquivada → Arquivada; entregue ou
 * FINALIZADO → Entregue; com designer ou status de trabalho → Produzindo; senão, Entrada. O status detalhado
 * (aguardando material, em aprovação…) é o marcador, só dentro de Produzindo.
 */
export function etapaDaProducao(l: SinaisDaEtapa): { etapa: Etapa; marcador: string } {
  const status = [...new Set(l.status.map(comparavel).filter(Boolean))];
  if (l.arquivado) return { etapa: 'arquivada', marcador: '' };
  if (l.entregue || status.includes('FINALIZADO')) return { etapa: 'entregue', marcador: '' };
  const trabalho = status.filter((s) => !SEM_TRABALHO.has(s));
  if (!l.designers.length && !trabalho.length) return { etapa: 'entrada', marcador: '' };
  return { etapa: 'produzindo', marcador: trabalho.filter((s) => !DA_ETAPA.has(s)).map(porExtenso).join(', ') };
}

/** Uma linha da produção da arte como a carga lê (servidor/trello.mjs, producaoInteira). */
export interface LinhaDaCarga extends SinaisDaEtapa {
  /** o id do registro no Teable (a chave natural da carga) */
  registro: string;
  card: string;
  claquete: string;
  /** a praça da coluna praca ('' sem ela) */
  praca: string;
  entrada: string | null;
  entrega: string | null;
  artes: string[];
  artesQuantidade: number | null;
  /** o filme ligado na linha (o registro dele no Teable) */
  filme: { id: string; titulo: string } | null;
}

/** A Produção como fica guardada (sem o id próprio e as datas de quando foi gravada). */
export interface ProducaoDaCarga {
  teableRegistro: string;
  cardId: string | null;
  claquete: string;
  praca: string;
  etapa: Etapa;
  marcador: string;
  designers: string[];
  artes: string[];
  artesQuantidade: number | null;
  entradaEm: string | null;
  entregaEm: string | null;
  exibicaoEm: string | null;
  roteiroId: string | null;
  filmeId: string | null;
  filmeTitulo: string | null;
  arquivada: boolean;
}

/**
 * A Produção de uma linha da produção da arte. A praça é a da coluna (normalizada) ou, sem ela, a que a claquete
 * indica. O filme é o da linha ou, sem ele, o da exibição do card; a exibição vem da exibição do card ou do Roteiro.
 * @param ligacoes.roteiro o Roteiro ligado pelo card (o envio) e a data de exibição dele
 * @param ligacoes.exibicao a exibição do card (os cards de filme): a data e o filme
 */
export function producaoDaLinha(
  l: LinhaDaCarga,
  ligacoes: { roteiro?: { id: string; exibicao: string | null } | null; exibicao?: { data: string | null; filme: { id: string; titulo: string } | null } | null } = {},
  pracas: readonly Praca[] = pracasRegistradas(),
): ProducaoDaCarga {
  const { etapa, marcador } = etapaDaProducao(l);
  const filme = l.filme ?? ligacoes.exibicao?.filme ?? null;
  return {
    teableRegistro: l.registro,
    cardId: l.card || null,
    claquete: l.claquete,
    praca: l.praca ? normalizarPraca(l.praca, pracas) : reconhecerPraca(l.claquete, pracas),
    etapa,
    marcador,
    designers: [...l.designers],
    artes: [...l.artes],
    artesQuantidade: l.artesQuantidade,
    entradaEm: l.entrada,
    entregaEm: l.entrega,
    exibicaoEm: ligacoes.exibicao?.data ?? ligacoes.roteiro?.exibicao ?? null,
    roteiroId: ligacoes.roteiro?.id ?? null,
    filmeId: filme?.id || null,
    filmeTitulo: filme?.titulo || null,
    arquivada: l.arquivado,
  };
}
