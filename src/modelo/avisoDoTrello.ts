/* O aviso do Trello (#87, ADR 0006) traduzido em eventos da Produção. O Trello é só a fonte do aviso: o que sai daqui
   são conceitos do PROMeiro (a etapa, o evento), e a lista do card só serve para dizer a etapa. Puro: recebe a ação do
   Trello como veio no aviso e as listas do quadro configurado, e devolve zero ou mais eventos.
   O mesmo módulo serve ao servidor e ao navegador: só sintaxe que o Node apaga. */
import type { Etapa } from './producao.ts';

/** As listas do quadro que dizem a etapa. Uma lista que está nas duas é de saída. */
export interface ListasDoQuadro {
  /** o quadro configurado (TRELLO_QUADRO): aviso de outro quadro não é da Produção */
  quadro: string;
  /** as listas de entrada (as das praças, a reserva, a do VT, a dos filmes) */
  entradas: readonly string[];
  /** as listas de saída das praças e a dos entregues */
  saidas: readonly string[];
}

/** Os tipos de evento que o aviso do Trello gera por enquanto (membros, checklist e campos ficam para depois). */
export type TipoDoEvento = 'criada' | 'etapa' | 'arquivada' | 'desarquivada';

export interface EventoDoAviso {
  tipo: TipoDoEvento;
  /** o card do Trello: o servidor acha a Produção por ele */
  cardId: string;
  /** só em "criada": o nome do card (a claquete da Produção nova) */
  claquete?: string;
  antes: Etapa | null;
  depois: Etapa;
  /** o membro do Trello que fez (null quando o Trello não diz) */
  quem: { id: string; nome: string } | null;
  /** a data da ação no Trello (ISO) */
  quando: string;
  /** o id da ação do Trello: o mesmo aviso duas vezes não vira dois eventos */
  acao: string;
}

/** A etapa que a lista diz: saída das praças ou entregues → Entregue; entrada → Entrada; as outras → Produzindo. */
export function etapaDaLista(lista: string | null | undefined, l: ListasDoQuadro): Etapa {
  const id = String(lista ?? '');
  if (id && l.saidas.includes(id)) return 'entregue';
  if (id && l.entradas.includes(id)) return 'entrada';
  return 'produzindo';
}

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objeto) : null);
/** Um texto do aviso, limpo e com tamanho máximo (o aviso vem de fora). */
const texto = (v: unknown, max = 200) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const idDe = (v: unknown) => texto(objeto(v)?.id, 100);

/** Os tipos de ação do Trello em que um card passa a existir no quadro. */
const DE_CARD_NOVO = new Set(['createCard', 'copyCard', 'moveCardToBoard']);

/**
 * Os eventos de uma ação do Trello (o `action` do aviso): card criado, copiado ou trazido de outro quadro → "criada";
 * card que mudou de lista para outra etapa → "etapa"; arquivar → "arquivada"; desarquivar → "desarquivada". Ação de
 * outro quadro, sem id, sem data, sem card, ou de um tipo que não é deste ticket, não gera nada.
 */
export function eventosDoAviso(acao: unknown, l: ListasDoQuadro): EventoDoAviso[] {
  const a = objeto(acao);
  const dados = objeto(a?.data);
  if (!a || !dados || !l.quadro) return [];
  const id = texto(a.id, 100);
  const tipo = texto(a.type, 60);
  const cardId = idDe(dados.card);
  const data = new Date(texto(a.date, 40));
  if (!id || !cardId || idDe(dados.board) !== l.quadro || Number.isNaN(data.getTime())) return [];
  const membro = objeto(a.memberCreator);
  const quemId = texto(membro?.id, 100) || texto(a.idMemberCreator, 100);
  const base = {
    cardId,
    quem: quemId ? { id: quemId, nome: texto(membro?.fullName) || texto(membro?.username) } : null,
    quando: data.toISOString(),
    acao: id,
  };
  const card = objeto(dados.card) ?? {};
  // a lista onde o card está: a da ação ou a do card
  const listaDoCard = idDe(dados.list) || texto(card.idList, 100);

  if (DE_CARD_NOVO.has(tipo)) return [{ tipo: 'criada', ...base, claquete: texto(card.name, 300), antes: null, depois: etapaDaLista(listaDoCard, l) }];
  if (tipo !== 'updateCard') return [];
  const velho = objeto(dados.old) ?? {};
  if ('closed' in velho && typeof card.closed === 'boolean' && card.closed !== velho.closed) {
    const etapa = etapaDaLista(listaDoCard, l);
    return [card.closed ? { tipo: 'arquivada', ...base, antes: etapa, depois: 'arquivada' } : { tipo: 'desarquivada', ...base, antes: 'arquivada', depois: etapa }];
  }
  const antes = idDe(dados.listBefore);
  const depois = idDe(dados.listAfter);
  if (antes && depois && antes !== depois) {
    const [de, para] = [etapaDaLista(antes, l), etapaDaLista(depois, l)];
    return de === para ? [] : [{ tipo: 'etapa', ...base, antes: de, depois: para }];
  }
  return [];
}
