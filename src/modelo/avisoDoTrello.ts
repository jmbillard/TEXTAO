/* O aviso do Trello (#87, ADR 0006) traduzido em eventos da Produção. O Trello é só a fonte do aviso: o que sai daqui
   são conceitos do PROMeiro (a etapa, o evento), e a lista do card só serve para dizer a etapa. Puro: recebe a ação do
   Trello como veio no aviso (ou como a recuperação leu do quadro) e o que o quadro configurado diz (as listas, os
   campos ligados, os designers), e devolve zero ou mais eventos.
   O mesmo módulo serve ao servidor e ao navegador: só sintaxe que o Node apaga. */
import { nomeComparavel } from './ligarPeloNome.ts';
import type { Etapa } from './producao.ts';

/** Os campos da Produção que o evento "campo mudado" acompanha. */
export type CampoDoEvento = 'prioridade' | 'complexidade' | 'praca' | 'entrega';

/** Um campo personalizado do card ligado na Configuração: o id e o nome de cada opção (o id → o nome). */
export interface CampoLigado {
  id: string;
  opcoes: Readonly<Record<string, string>>;
}

/** O que o quadro configurado diz para a tradução. Uma lista que está nas duas é de saída. */
export interface ListasDoQuadro {
  /** o quadro configurado (TRELLO_QUADRO): aviso de outro quadro não é da Produção */
  quadro: string;
  /** as listas de entrada (as das praças, a reserva, a do VT, a dos filmes) */
  entradas: readonly string[];
  /** as listas de saída das praças e a dos entregues */
  saidas: readonly string[];
  /** os campos ligados (TRELLO_CAMPO_*): sem um, a mudança nele não é evento. A praça traz a sigla de cada opção. */
  campos?: Partial<Record<Exclude<CampoDoEvento, 'entrega'>, CampoLigado>>;
  /** a tabela designers (a última verificação das Pessoas): o membro do card vira o designer pelo id ou pelo nome */
  designers?: readonly { nome: string; idNoTrello: string }[];
}

/** Os tipos de evento da Produção. "abriu-o-projeto" é só do aviso do Padeiro (#139), na Produção já Entregue. */
export type TipoDoEvento = 'criada' | 'etapa' | 'arquivada' | 'desarquivada' | 'designer-entrou' | 'designer-saiu' | 'arte-marcada' | 'arte-desmarcada' | 'campo' | 'abriu-o-projeto';

export interface EventoDoAviso {
  tipo: TipoDoEvento;
  /** o card do Trello: o servidor acha a Produção por ele */
  cardId: string;
  /** só em "criada": o nome do card (a claquete da Produção nova) */
  claquete?: string;
  /** só em "campo": qual campo mudou */
  campo?: CampoDoEvento;
  /** antes → depois: a etapa (criada, etapa, arquivada, desarquivada); o designer (entrou: só depois; saiu: só antes);
      a arte (marcada: só depois; desmarcada: só antes); o valor do campo (null = vazio) */
  antes: Etapa | string | null;
  depois: Etapa | string | null;
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

/** Os tipos de ação do Trello que a tradução lê (a recuperação pede só estes ao quadro). */
export const TIPOS_DE_ACAO = [...DE_CARD_NOVO, 'updateCard', 'addMemberToCard', 'removeMemberFromCard', 'updateCheckItemStateOnCard', 'updateCustomFieldItem'] as const;

/** O designer do membro do card: o da tabela designers pelo id do Trello; sem o id lá, pelo nome; senão, o membro. */
function designerDoMembro(membro: { id: string; nome: string }, l: ListasDoQuadro): string {
  const designers = l.designers ?? [];
  const peloId = designers.find((d) => d.idNoTrello && d.idNoTrello === membro.id);
  const nome = nomeComparavel(membro.nome);
  const peloNome = nome ? designers.find((d) => !d.idNoTrello && nomeComparavel(d.nome) === nome) : undefined;
  return (peloId ?? peloNome)?.nome.trim() || membro.nome;
}

/** O valor de um item de campo personalizado: a opção pelo nome (a desconhecida fica com o id) ou o valor escrito. */
function valorDoCampo(item: Objeto | null, campo: CampoLigado): string | null {
  if (!item) return null;
  const opcao = texto(item.idValue, 100);
  if (opcao) return campo.opcoes[opcao] || opcao;
  const valor = objeto(item.value);
  if (!valor) return null;
  for (const k of ['text', 'number', 'date', 'checked']) if (texto(valor[k])) return texto(valor[k]);
  return null;
}

/**
 * Os eventos de uma ação do Trello (o `action` do aviso): card criado, copiado ou trazido de outro quadro → "criada";
 * card que mudou de lista para outra etapa → "etapa"; entrega concluída → "etapa" para Entregue (desfeita: a etapa da
 * lista); arquivar → "arquivada"; desarquivar → "desarquivada"; membro entrou ou saiu → "designer-entrou"/"-saiu";
 * item do checklist marcado ou desmarcado → "arte-marcada"/"-desmarcada"; prioridade, complexidade ou praça (os
 * campos ligados) ou o prazo de entrega do card mudados → "campo". Uma ação vira no máximo um evento (o id dela é o do
 * evento). Ação de outro quadro, sem id, sem data, sem card, ou de outro tipo, não gera nada.
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
  if (tipo === 'addMemberToCard' || tipo === 'removeMemberFromCard') {
    const m = objeto(dados.member);
    const membro = { id: texto(dados.idMember, 100) || texto(m?.id, 100), nome: texto(m?.name) || texto(m?.fullName) || texto(m?.username) };
    if (!membro.id && !membro.nome) return [];
    const designer = designerDoMembro(membro, l);
    if (!designer) return [];
    return [tipo === 'addMemberToCard' ? { tipo: 'designer-entrou', ...base, antes: null, depois: designer } : { tipo: 'designer-saiu', ...base, antes: designer, depois: null }];
  }
  if (tipo === 'updateCheckItemStateOnCard') {
    const item = objeto(dados.checkItem);
    const arte = texto(item?.name, 500);
    if (!arte) return [];
    if (item?.state === 'complete') return [{ tipo: 'arte-marcada', ...base, antes: null, depois: arte }];
    if (item?.state === 'incomplete') return [{ tipo: 'arte-desmarcada', ...base, antes: arte, depois: null }];
    return [];
  }
  if (tipo === 'updateCustomFieldItem') {
    const item = objeto(dados.customFieldItem);
    const idDoCampo = texto(item?.idCustomField, 100) || idDe(dados.customField);
    const ligado = (Object.entries(l.campos ?? {}) as [CampoDoEvento, CampoLigado | undefined][]).find(([, c]) => c?.id && c.id === idDoCampo);
    if (!idDoCampo || !ligado?.[1]) return [];
    const [campo, config] = ligado as [CampoDoEvento, CampoLigado];
    const [antes, depois] = [valorDoCampo(objeto(dados.old), config), valorDoCampo(item, config)];
    return antes === depois ? [] : [{ tipo: 'campo', campo, ...base, antes, depois }];
  }
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
  // o prazo de entrega do card (due): "campo mudado: entrega"
  if ('due' in velho) {
    const data = (v: unknown) => {
      const d = new Date(texto(v, 40));
      return texto(v, 40) && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    };
    const [antes, depois] = [data(velho.due), data(card.due)];
    return antes === depois ? [] : [{ tipo: 'campo', campo: 'entrega', ...base, antes, depois }];
  }
  // a entrega concluída (dueComplete) é a etapa Entregue; desfeita, volta à etapa da lista
  if ('dueComplete' in velho && typeof card.dueComplete === 'boolean' && card.dueComplete !== velho.dueComplete) {
    const etapa = etapaDaLista(listaDoCard, l);
    if (etapa === 'entregue') return [];
    return [card.dueComplete ? { tipo: 'etapa', ...base, antes: etapa, depois: 'entregue' } : { tipo: 'etapa', ...base, antes: 'entregue', depois: etapa }];
  }
  return [];
}
