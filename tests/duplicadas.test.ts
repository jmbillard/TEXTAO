import { describe, expect, it } from 'vitest';
import { agruparDuplicadas, type CardDoQuadro } from '../src/modelo/duplicadas';

/* Os casos fictícios das claquetes duplicadas (#65): a função pura que agrupa os cards do quadro e sugere quem sai. */

let n = 0;
const BASE = Date.UTC(2026, 10, 10, 12);
/** Um card fictício: aberto, na entrada, com linha na produção e um membro, a não ser que se diga outra coisa. */
const card = (nome: string, o: Partial<CardDoQuadro> = {}): CardDoQuadro => ({
  id: `card${++n}`,
  nome,
  praca: '',
  arquivado: false,
  lista: 'entrada',
  criado: BASE + n * 60_000,
  membros: 1,
  temProducao: true,
  ...o,
});
const grupos = (cards: CardDoQuadro[]) => agruparDuplicadas(cards).map((c) => c.cards.map((id) => cards.find((x) => x.id === id)!.nome));

describe('agrupar as claquetes duplicadas', () => {
  it('junta pela chave da claquete: sem acento, caixa e pontuação', () => {
    const cards = [card('Festa na Praça 19/11'), card('FESTA NA PRACA_19_11'), card('Festa na Praça 20/11')];
    expect(grupos(cards)).toEqual([['Festa na Praça 19/11', 'FESTA NA PRACA_19_11']]);
  });

  it('a praça vem do campo do card; sem ele, a que o nome indica', () => {
    const cards = [
      card('Show da Noite 20/11', { praca: 'SP' }),
      card('Show da Noite 20/11 SP'),
      card('Show da Noite 20/11'),
      card('Show da Noite 20/11 REDE'),
      card('Rio Arena 09/11'),
      card('Arena 09/11', { praca: 'RJ' }),
    ];
    // na mesma seção, o caso mais recente primeiro; no caso, os cards do mais antigo ao mais novo
    expect(grupos(cards)).toEqual([
      ['Rio Arena 09/11', 'Arena 09/11'],
      ['Show da Noite 20/11', 'Show da Noite 20/11 REDE'],
      ['Show da Noite 20/11', 'Show da Noite 20/11 SP'],
    ]);
    expect(agruparDuplicadas(cards).map((c) => c.praca)).toEqual(['RJ', 'G5', 'SP']);
  });

  it('versões diferentes não contam como duplicadas; a mesma versão escrita de outro jeito conta', () => {
    const cards = [
      card('Terra 20/11'),
      card('Terra 20/11-2'),
      card('Terra 20/11 V2'),
      card('Terra 20/11 2'),
      card('Terra 20/11 B'),
      card('Terra 20/11 C'),
      card('Terra Opção 2 20/11'),
      card('Terra 20/11 (AH)'),
    ];
    expect(grupos(cards)).toEqual([
      ['Terra 20/11', 'Terra 20/11 (AH)'],
      ['Terra 20/11-2', 'Terra 20/11 V2', 'Terra 20/11 2'],
    ]);
  });

  it('separa em com arquivado e aberto, todos abertos e todos arquivados', () => {
    const cards = [
      card('Um 1/11'),
      card('Um 1/11', { arquivado: true }),
      card('Dois 2/11'),
      card('Dois 2/11'),
      card('Tres 3/11', { arquivado: true }),
      card('Tres 3/11', { arquivado: true }),
    ];
    expect(agruparDuplicadas(cards).map((c) => [c.chave, c.secao])).toEqual([
      ['UM 1 11', 'misto'],
      ['DOIS 2 11', 'abertos'],
      ['TRES 3 11', 'arquivados'],
    ]);
  });
});

describe('a sugestão de quem fica e quem sai', () => {
  const sugestao = (cards: CardDoQuadro[]) => {
    const [caso] = agruparDuplicadas(cards);
    const nome = (id: string) => cards.findIndex((c) => c.id === id);
    return { fica: nome(caso.sugestao.fica), saem: caso.sugestao.saem.map(nome), motivos: caso.cards.map((id) => caso.sugestao.motivos[id]) };
  };

  it('o arquivado numa lista de entrada sai, mesmo criado antes, sem membros e sem produção no outro', () => {
    const s = sugestao([card('Caso 5/11', { arquivado: true }), card('Caso 5/11', { temProducao: false, membros: 0, lista: 'outra' })]);
    expect(s.fica).toBe(1);
    expect(s.motivos[0]).toBe('Arquivado na lista de entrada.');
  });

  it('depois, sai o que não tem linha na produção', () => {
    const s = sugestao([card('Caso 5/11', { temProducao: false }), card('Caso 5/11', { membros: 0, lista: 'outra' })]);
    expect(s).toMatchObject({ fica: 1, saem: [0] });
    expect(s.motivos[0]).toBe('Sem linha na produção da arte.');
    expect(s.motivos[1]).toBe('Tem linha na produção da arte.');
  });

  it('depois, o que não tem membros; depois, o criado depois; por fim, o que está fora das saídas', () => {
    expect(sugestao([card('Caso 5/11', { membros: 0 }), card('Caso 5/11', { lista: 'outra' })]).motivos[0]).toBe('Sem membros.');
    const criado = sugestao([card('Caso 5/11', { lista: 'saida' }), card('Caso 5/11')]);
    expect(criado).toMatchObject({ fica: 0, saem: [1] });
    expect(criado.motivos[1]).toBe('Criado depois.');
    const mesmaHora = BASE;
    const saida = sugestao([card('Caso 5/11', { criado: mesmaHora }), card('Caso 5/11', { criado: mesmaHora, lista: 'saida' })]);
    expect(saida).toMatchObject({ fica: 1, saem: [0] });
    expect(saida.motivos).toEqual(['Fora das listas de saída.', 'Está na saída.']);
  });

  it('com três cards, fica um e saem dois, cada um com o seu motivo', () => {
    const s = sugestao([
      card('Arena do Domingo 23/11', { arquivado: true, temProducao: false, membros: 0 }),
      card('Arena do Domingo 23/11'),
      card('ARENA DO DOMINGO_23_11', { temProducao: false }),
    ]);
    expect(s).toMatchObject({ fica: 1, saem: [0, 2] });
    expect(s.motivos).toEqual(['Arquivado na lista de entrada.', 'Não foi arquivado na entrada; tem linha na produção da arte.', 'Sem linha na produção da arte.']);
  });
});
