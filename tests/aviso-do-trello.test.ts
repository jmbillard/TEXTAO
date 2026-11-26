import { describe, expect, it } from 'vitest';
import { etapaDaLista, eventosDoAviso, type ListasDoQuadro } from '../src/modelo/avisoDoTrello.ts';

/* A tradução do aviso do Trello (#87) em eventos da Produção, pura: card criado no quadro vira "criada"; mudar de
   lista vira "mudou de etapa" (a lista diz a etapa: entrada das praças → Entrada; saída das praças ou entregues →
   Entregue; as outras → Produzindo); arquivar e desarquivar viram evento. Ids e nomes inventados. */

const QUADRO = 'quadroFalso';
const LISTAS: ListasDoQuadro = { quadro: QUADRO, entradas: ['lEntradaSP', 'lEntradaRJ'], saidas: ['lSaidaSP', 'lEntregues'] };
const QUEM = { id: 'membroUm', fullName: 'Designer Um', username: 'designerum' };

const acao = (type: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: `acao-${type}`,
  type,
  date: '2026-11-26T12:40:00.000Z',
  idMemberCreator: QUEM.id,
  memberCreator: QUEM,
  data: { board: { id: QUADRO, name: 'Quadro de teste' }, ...data },
  ...extra,
});
const card = { id: 'cardUm', name: 'Show da Noite 20/11 SP' };

describe('a etapa da lista', () => {
  it('entrada das praças → Entrada; saída ou entregues → Entregue; as outras → Produzindo', () => {
    expect(etapaDaLista('lEntradaRJ', LISTAS)).toBe('entrada');
    expect(etapaDaLista('lSaidaSP', LISTAS)).toBe('entregue');
    expect(etapaDaLista('lEntregues', LISTAS)).toBe('entregue');
    expect(etapaDaLista('lQualquer', LISTAS)).toBe('produzindo');
  });
});

describe('o aviso do Trello em eventos', () => {
  it('card criado no quadro vira "criada", na etapa da lista, com quem, quando e o id da ação', () => {
    expect(eventosDoAviso(acao('createCard', { card, list: { id: 'lEntradaSP', name: 'SP ENTRADA' } }), LISTAS)).toEqual([
      { tipo: 'criada', cardId: 'cardUm', claquete: 'Show da Noite 20/11 SP', antes: null, depois: 'entrada', quem: { id: 'membroUm', nome: 'Designer Um' }, quando: '2026-11-26T12:40:00.000Z', acao: 'acao-createCard' },
    ]);
  });

  it('card copiado ou trazido de outro quadro também vira "criada"', () => {
    expect(eventosDoAviso(acao('copyCard', { card, list: { id: 'lEntradaRJ' }, cardSource: { id: 'cardVelho' } }), LISTAS)).toMatchObject([{ tipo: 'criada', cardId: 'cardUm', depois: 'entrada' }]);
    expect(eventosDoAviso(acao('moveCardToBoard', { card, list: { id: 'lOutra' }, boardSource: { id: 'quadroDeFora' } }), LISTAS)).toMatchObject([{ tipo: 'criada', cardId: 'cardUm', depois: 'produzindo' }]);
  });

  it('mudar de lista vira "mudou de etapa", antes → depois', () => {
    const mudou = acao('updateCard', { card: { ...card, idList: 'lSaidaSP' }, old: { idList: 'lEntradaSP' }, listBefore: { id: 'lEntradaSP' }, listAfter: { id: 'lSaidaSP' } });
    expect(eventosDoAviso(mudou, LISTAS)).toEqual([{ tipo: 'etapa', cardId: 'cardUm', antes: 'entrada', depois: 'entregue', quem: { id: 'membroUm', nome: 'Designer Um' }, quando: '2026-11-26T12:40:00.000Z', acao: 'acao-updateCard' }]);
  });

  it('mudar para uma lista da mesma etapa (de uma entrada para outra) não é evento', () => {
    expect(eventosDoAviso(acao('updateCard', { card, listBefore: { id: 'lEntradaSP' }, listAfter: { id: 'lEntradaRJ' } }), LISTAS)).toEqual([]);
  });

  it('arquivar vira "arquivada" (da etapa da lista para Arquivada); desarquivar volta à etapa da lista', () => {
    const arquivar = acao('updateCard', { card: { ...card, closed: true }, old: { closed: false }, list: { id: 'lSaidaSP' } });
    expect(eventosDoAviso(arquivar, LISTAS)).toMatchObject([{ tipo: 'arquivada', cardId: 'cardUm', antes: 'entregue', depois: 'arquivada' }]);
    const desarquivar = acao('updateCard', { card: { ...card, closed: false }, old: { closed: true }, list: { id: 'lQualquer' } });
    expect(eventosDoAviso(desarquivar, LISTAS)).toMatchObject([{ tipo: 'desarquivada', cardId: 'cardUm', antes: 'arquivada', depois: 'produzindo' }]);
  });

  it('o que não é do quadro configurado, ou não é deste ticket, não vira evento', () => {
    // de outro quadro
    expect(eventosDoAviso({ ...acao('createCard', { card, list: { id: 'lEntradaSP' } }), data: { board: { id: 'outroQuadro' }, card, list: { id: 'lEntradaSP' } } }, LISTAS)).toEqual([]);
    // sem quadro configurado
    expect(eventosDoAviso(acao('createCard', { card, list: { id: 'lEntradaSP' } }), { ...LISTAS, quadro: '' })).toEqual([]);
    // outras mudanças do card (o nome, a descrição), comentários, membros: fora deste ticket
    expect(eventosDoAviso(acao('updateCard', { card, old: { name: 'Antigo' } }), LISTAS)).toEqual([]);
    expect(eventosDoAviso(acao('commentCard', { card, text: 'oi' }), LISTAS)).toEqual([]);
    expect(eventosDoAviso(acao('addMemberToCard', { card, idMember: 'membroDois' }), LISTAS)).toEqual([]);
    // sem o id da ação, sem a data, sem card, ou nem uma ação
    expect(eventosDoAviso({ ...acao('createCard', { card, list: { id: 'lEntradaSP' } }), id: '' }, LISTAS)).toEqual([]);
    expect(eventosDoAviso({ ...acao('createCard', { card, list: { id: 'lEntradaSP' } }), date: 'ontem' }, LISTAS)).toEqual([]);
    expect(eventosDoAviso(acao('createCard', { list: { id: 'lEntradaSP' } }), LISTAS)).toEqual([]);
    expect(eventosDoAviso(null, LISTAS)).toEqual([]);
    expect(eventosDoAviso('lixo', LISTAS)).toEqual([]);
  });

  it('sem quem fez (a automação do Trello às vezes não traz o membro), o evento vem sem quem', () => {
    const semMembro = { ...acao('createCard', { card, list: { id: 'lEntradaSP' } }), memberCreator: undefined, idMemberCreator: undefined };
    expect(eventosDoAviso(semMembro, LISTAS)).toMatchObject([{ tipo: 'criada', quem: null }]);
  });
});
