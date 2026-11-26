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
    // outras mudanças do card (o nome, a descrição), comentários, etiquetas: não são eventos da Produção
    expect(eventosDoAviso(acao('updateCard', { card, old: { name: 'Antigo' } }), LISTAS)).toEqual([]);
    expect(eventosDoAviso(acao('commentCard', { card, text: 'oi' }), LISTAS)).toEqual([]);
    expect(eventosDoAviso(acao('addLabelToCard', { card, label: { id: 'etiqueta', name: 'PRODUZINDO' } }), LISTAS)).toEqual([]);
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

/* #88: os outros eventos. O designer entra ou sai (os membros do card), a arte é marcada ou desmarcada (o item do
   checklist), um campo muda (prioridade, complexidade, praça, entrega), antes → depois. */

const PESSOAS = {
  designers: [
    { nome: 'Rafaela Designer', idNoTrello: 'membroDois' },
    { nome: 'Caio Sem Id', idNoTrello: '' },
  ],
};
const CAMPOS = {
  campos: {
    prioridade: { id: 'campoPrioridade', opcoes: { opAlta: 'ALTA', opMedia: 'MÉDIA' } },
    complexidade: { id: 'campoComplexidade', opcoes: { opBaixa: 'BAIXA', opMediaC: 'MÉDIA', opAltaC: 'ALTA' } },
    praca: { id: 'campoPraca', opcoes: { opSP: 'SP', opRJ: 'RJ' } },
  },
};
const COMPLETO: ListasDoQuadro = { ...LISTAS, ...PESSOAS, ...CAMPOS };

describe('designer entrou ou saiu (os membros do card)', () => {
  it('o membro ligado ao designer pelo id do Trello entra com o nome da tabela designers', () => {
    const entrou = acao('addMemberToCard', { card, idMember: 'membroDois', member: { id: 'membroDois', name: 'rafa.trello' } });
    expect(eventosDoAviso(entrou, COMPLETO)).toEqual([
      { tipo: 'designer-entrou', cardId: 'cardUm', antes: null, depois: 'Rafaela Designer', quem: { id: 'membroUm', nome: 'Designer Um' }, quando: '2026-11-26T12:40:00.000Z', acao: 'acao-addMemberToCard' },
    ]);
  });

  it('sem o id na tabela, liga pelo nome (sem caixa nem acento); sem ligação, fica o nome do membro', () => {
    expect(eventosDoAviso(acao('removeMemberFromCard', { card, idMember: 'membroTres', member: { id: 'membroTres', name: 'CAIO sem id' } }), COMPLETO)).toMatchObject([
      { tipo: 'designer-saiu', antes: 'Caio Sem Id', depois: null },
    ]);
    expect(eventosDoAviso(acao('addMemberToCard', { card, idMember: 'membroQuatro', member: { id: 'membroQuatro', name: 'Pessoa Nova' } }), COMPLETO)).toMatchObject([
      { tipo: 'designer-entrou', antes: null, depois: 'Pessoa Nova' },
    ]);
    // sem nome nenhum (nem do membro), não há o que anotar
    expect(eventosDoAviso(acao('addMemberToCard', { card, idMember: 'membroCinco' }), COMPLETO)).toEqual([]);
  });
});

describe('arte marcada ou desmarcada (o item do checklist)', () => {
  it('marcar o item vira "arte marcada" com o nome dele; desmarcar, "arte desmarcada"', () => {
    const marcar = acao('updateCheckItemStateOnCard', { card, checklist: { id: 'lista', name: 'ARTES PRODUZIDAS' }, checkItem: { id: 'item', name: 'GC SHOW DA NOITE', state: 'complete' } });
    expect(eventosDoAviso(marcar, COMPLETO)).toEqual([
      { tipo: 'arte-marcada', cardId: 'cardUm', antes: null, depois: 'GC SHOW DA NOITE', quem: { id: 'membroUm', nome: 'Designer Um' }, quando: '2026-11-26T12:40:00.000Z', acao: 'acao-updateCheckItemStateOnCard' },
    ]);
    const desmarcar = acao('updateCheckItemStateOnCard', { card, checklist: { id: 'lista' }, checkItem: { id: 'item', name: 'GC SHOW DA NOITE', state: 'incomplete' } });
    expect(eventosDoAviso(desmarcar, COMPLETO)).toMatchObject([{ tipo: 'arte-desmarcada', antes: 'GC SHOW DA NOITE', depois: null }]);
    expect(eventosDoAviso(acao('updateCheckItemStateOnCard', { card, checkItem: { id: 'item', state: 'complete' } }), COMPLETO)).toEqual([]);
  });
});

describe('campo mudado: prioridade, complexidade, praça (pelos campos ligados), com a opção pelo nome', () => {
  const mudou = (idCampo: string, idValue: string | null, velho: string | null) =>
    acao('updateCustomFieldItem', { card, customField: { id: idCampo, name: 'Nome no Trello', type: 'list' }, customFieldItem: { id: 'item', idCustomField: idCampo, idModel: 'cardUm', idValue }, old: { idValue: velho } });

  it('prioridade: antes → depois pelo nome da opção', () => {
    expect(eventosDoAviso(mudou('campoPrioridade', 'opAlta', 'opMedia'), COMPLETO)).toEqual([
      { tipo: 'campo', campo: 'prioridade', cardId: 'cardUm', antes: 'MÉDIA', depois: 'ALTA', quem: { id: 'membroUm', nome: 'Designer Um' }, quando: '2026-11-26T12:40:00.000Z', acao: 'acao-updateCustomFieldItem' },
    ]);
  });

  it('complexidade: preenchida pela primeira vez (antes vazio) e limpa (depois vazio)', () => {
    expect(eventosDoAviso(mudou('campoComplexidade', 'opAltaC', null), COMPLETO)).toMatchObject([{ tipo: 'campo', campo: 'complexidade', antes: null, depois: 'ALTA' }]);
    expect(eventosDoAviso(mudou('campoComplexidade', null, 'opBaixa'), COMPLETO)).toMatchObject([{ tipo: 'campo', campo: 'complexidade', antes: 'BAIXA', depois: null }]);
  });

  it('praça: a opção vira a sigla da praça', () => {
    expect(eventosDoAviso(mudou('campoPraca', 'opRJ', 'opSP'), COMPLETO)).toMatchObject([{ tipo: 'campo', campo: 'praca', antes: 'SP', depois: 'RJ' }]);
  });

  it('a opção que não se conhece fica com o id; o campo que não está ligado, ou que não mudou, não é evento', () => {
    expect(eventosDoAviso(mudou('campoPrioridade', 'opNova', null), COMPLETO)).toMatchObject([{ campo: 'prioridade', antes: null, depois: 'opNova' }]);
    expect(eventosDoAviso(mudou('campoDoOutput', 'qualquer', null), COMPLETO)).toEqual([]);
    expect(eventosDoAviso(mudou('campoPrioridade', 'opAlta', 'opAlta'), COMPLETO)).toEqual([]);
    // sem a configuração dos campos, nenhum campo é ligado
    expect(eventosDoAviso(mudou('campoPrioridade', 'opAlta', null), LISTAS)).toEqual([]);
  });

  it('o campo de texto ou número (não de opções) vale pelo valor', () => {
    const texto = acao('updateCustomFieldItem', { card, customField: { id: 'campoComplexidade', type: 'number' }, customFieldItem: { idCustomField: 'campoComplexidade', value: { number: '3' } }, old: { value: { number: '1' } } });
    expect(eventosDoAviso(texto, COMPLETO)).toMatchObject([{ campo: 'complexidade', antes: '1', depois: '3' }]);
  });
});

describe('a entrega do card', () => {
  it('o prazo (a data de entrega do card) mudado vira "campo mudado: entrega", antes → depois', () => {
    const prazo = acao('updateCard', { card: { ...card, due: '2026-11-28T03:00:00.000Z' }, old: { due: '2026-11-27T03:00:00.000Z' }, list: { id: 'lQualquer' } });
    expect(eventosDoAviso(prazo, COMPLETO)).toMatchObject([{ tipo: 'campo', campo: 'entrega', antes: '2026-11-27T03:00:00.000Z', depois: '2026-11-28T03:00:00.000Z' }]);
    const semPrazo = acao('updateCard', { card: { ...card, due: null }, old: { due: '2026-11-27T03:00:00.000Z' }, list: { id: 'lQualquer' } });
    expect(eventosDoAviso(semPrazo, COMPLETO)).toMatchObject([{ campo: 'entrega', antes: '2026-11-27T03:00:00.000Z', depois: null }]);
  });

  it('marcar a entrega como concluída é a etapa Entregue; desmarcar volta à etapa da lista', () => {
    const concluiu = acao('updateCard', { card: { ...card, dueComplete: true }, old: { dueComplete: false }, list: { id: 'lQualquer' } });
    expect(eventosDoAviso(concluiu, COMPLETO)).toMatchObject([{ tipo: 'etapa', antes: 'produzindo', depois: 'entregue' }]);
    const desfez = acao('updateCard', { card: { ...card, dueComplete: false }, old: { dueComplete: true }, list: { id: 'lEntradaSP' } });
    expect(eventosDoAviso(desfez, COMPLETO)).toMatchObject([{ tipo: 'etapa', antes: 'entregue', depois: 'entrada' }]);
    // na lista de saída, concluir não muda a etapa (já é Entregue)
    expect(eventosDoAviso(acao('updateCard', { card: { ...card, dueComplete: true }, old: { dueComplete: false }, list: { id: 'lSaidaSP' } }), COMPLETO)).toEqual([]);
  });
});
