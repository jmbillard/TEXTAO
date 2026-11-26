import { describe, expect, it } from 'vitest';
import { duplicadasDaProducao, sugestaoDoCaso, type CardDoCaso, type LinhaDaProducao } from '../src/modelo/duplicadas';

/* Os casos fictícios das claquetes duplicadas: a função pura que agrupa as linhas da produção da arte (ARTE_producao)
   e sugere quem sai. Nada do Trello (#65; ADR 0006): só a produção, também no caso aberto. */

let n = 0;
const BASE = Date.UTC(2026, 10, 10, 12);
const DESDE = BASE - 90 * 86_400_000;
/** Uma linha fictícia: com card, de roteiro (sem filme), aberta, em produção, com designer, a não ser que se diga outra coisa. */
const linha = (claquete: string, o: Partial<LinhaDaProducao> = {}): LinhaDaProducao => ({
  registro: `rec${++n}`,
  card: `card${n}`,
  claquete,
  praca: '',
  entrada: new Date(BASE + n * 60_000).toISOString(),
  arquivado: false,
  filme: false,
  status: ['PRODUZINDO'],
  designers: ['Designer Um'],
  entregue: false,
  ...o,
});
const casos = (linhas: LinhaDaProducao[]) => duplicadasDaProducao(linhas, { desde: DESDE });
const grupos = (linhas: LinhaDaProducao[]) => casos(linhas).map((c) => c.cards.map((id) => linhas.find((x) => x.card === id)!.claquete));

describe('agrupar as linhas da produção da arte', () => {
  it('junta pela chave da claquete: sem acento, caixa e pontuação', () => {
    const linhas = [linha('Festa na Praça 19/11'), linha('FESTA NA PRACA_19_11'), linha('Festa na Praça 20/11')];
    expect(grupos(linhas)).toEqual([['Festa na Praça 19/11', 'FESTA NA PRACA_19_11']]);
  });

  it('só as linhas com card e que não são de filme', () => {
    const linhas = [linha('Dia 24'), linha('DIA 24', { card: '' }), linha('Terra 20/11'), linha('TERRA 20/11', { filme: true }), linha('Mar 21/11'), linha('Mar 21/11')];
    expect(grupos(linhas)).toEqual([['Mar 21/11', 'Mar 21/11']]);
  });

  it('o período é o da entrada da linha; a linha sem entrada fica de fora', () => {
    const antes = new Date(DESDE - 60_000).toISOString();
    const linhas = [linha('Velha 1/08', { entrada: antes }), linha('Velha 1/08'), linha('Sem Data 2/08', { entrada: null }), linha('Sem Data 2/08')];
    expect(grupos(linhas)).toEqual([]);
    expect(duplicadasDaProducao(linhas, { desde: DESDE - 120_000 }).map((c) => c.chave)).toEqual(['VELHA 1 08']);
  });

  it('a mesma linha (o mesmo card) duas vezes não vira caso', () => {
    const a = linha('Eco 3/11');
    expect(grupos([a, { ...a, registro: 'outra' }])).toEqual([]);
  });

  it('a praça vem da coluna da linha; sem ela, a que a claquete indica', () => {
    const linhas = [
      linha('Show da Noite 20/11', { praca: 'SP' }),
      linha('Show da Noite 20/11 SP'),
      linha('Show da Noite 20/11'),
      linha('Show da Noite 20/11 REDE'),
      linha('Rio Arena 09/11'),
      linha('Arena 09/11', { praca: 'RJ' }),
    ];
    // na mesma seção, o caso mais recente primeiro; no caso, as linhas da que entrou primeiro à mais nova
    expect(grupos(linhas)).toEqual([
      ['Rio Arena 09/11', 'Arena 09/11'],
      ['Show da Noite 20/11', 'Show da Noite 20/11 REDE'],
      ['Show da Noite 20/11', 'Show da Noite 20/11 SP'],
    ]);
    expect(casos(linhas).map((c) => c.praca)).toEqual(['RJ', 'G5', 'SP']);
  });

  it('versões diferentes não contam como duplicadas; a mesma versão escrita de outro jeito conta', () => {
    const linhas = [
      linha('Terra 20/11'),
      linha('Terra 20/11-2'),
      linha('Terra 20/11 V2'),
      linha('Terra 20/11 2'),
      linha('Terra 20/11 B'),
      linha('Terra 20/11 C'),
      linha('Terra Opção 2 20/11'),
      linha('Terra 20/11 (AH)'),
    ];
    expect(grupos(linhas)).toEqual([
      ['Terra 20/11', 'Terra 20/11 (AH)'],
      ['Terra 20/11-2', 'Terra 20/11 V2', 'Terra 20/11 2'],
    ]);
  });

  it('separa em com arquivado e aberto, todos abertos e todos arquivados (pela coluna arquivado)', () => {
    const linhas = [
      linha('Um 1/11'),
      linha('Um 1/11', { arquivado: true }),
      linha('Dois 2/11'),
      linha('Dois 2/11'),
      linha('Tres 3/11', { arquivado: true }),
      linha('Tres 3/11', { arquivado: true }),
    ];
    expect(casos(linhas).map((c) => [c.chave, c.secao])).toEqual([
      ['UM 1 11', 'misto'],
      ['DOIS 2 11', 'abertos'],
      ['TRES 3 11', 'arquivados'],
    ]);
  });
});

describe('a sugestão de quem fica e quem sai, só com a linha', () => {
  const sugestao = (linhas: LinhaDaProducao[]) => {
    const [caso] = casos(linhas);
    const nome = (id: string) => linhas.findIndex((c) => c.card === id);
    return { fica: nome(caso.sugestao.fica), saem: caso.sugestao.saem.map(nome), motivos: caso.cards.map((id) => caso.sugestao.motivos[id]) };
  };

  it('a arquivada que não andou (sem status ou só ENTRADA) sai, mesmo tendo entrado antes e o outro sem designers', () => {
    const s = sugestao([linha('Caso 5/11', { arquivado: true, status: ['ENTRADA'] }), linha('Caso 5/11', { designers: [], status: [] })]);
    expect(s).toMatchObject({ fica: 1, saem: [0] });
    expect(s.motivos).toEqual(['Arquivado sem sair da entrada.', 'Não foi arquivado na entrada.']);
  });

  it('a arquivada que já andou não conta como arquivada na entrada', () => {
    const s = sugestao([linha('Caso 5/11', { arquivado: true, status: ['FINALIZADO'] }), linha('Caso 5/11', { designers: [] })]);
    expect(s).toMatchObject({ fica: 0, saem: [1] });
    expect(s.motivos[1]).toBe('Sem designers.');
  });

  it('depois, a que entrou depois; por fim, a que não saiu (nem entregue nem finalizada)', () => {
    const depois = sugestao([linha('Caso 5/11', { entregue: true }), linha('Caso 5/11', { entregue: true })]);
    expect(depois).toMatchObject({ fica: 0, saem: [1] });
    expect(depois.motivos[1]).toBe('Entrou depois na produção.');
    const mesmaHora = new Date(BASE).toISOString();
    const saida = sugestao([linha('Caso 5/11', { entrada: mesmaHora }), linha('Caso 5/11', { entrada: mesmaHora, status: ['FINALIZADO'] })]);
    expect(saida).toMatchObject({ fica: 1, saem: [0] });
    expect(saida.motivos).toEqual(['Não saiu nem foi entregue.', 'Saiu ou foi entregue.']);
  });

  it('com três linhas, fica uma e saem duas, cada uma com o seu motivo', () => {
    const s = sugestao([
      linha('Arena do Domingo 23/11', { arquivado: true, status: [], designers: [] }),
      linha('Arena do Domingo 23/11'),
      linha('ARENA DO DOMINGO_23_11', { designers: [] }),
    ]);
    expect(s).toMatchObject({ fica: 1, saem: [0, 2] });
    expect(s.motivos).toEqual(['Arquivado sem sair da entrada.', 'Não foi arquivado na entrada; tem designers.', 'Sem designers.']);
  });
});

describe('a sugestão pelos sinais do card', () => {
  const card = (id: string, o: Partial<CardDoCaso> = {}): CardDoCaso => ({ id, arquivado: false, naEntrada: false, pessoas: 1, entrada: BASE, saiu: false, ...o });

  it('arquivado na entrada sai; arquivado depois de andar, não', () => {
    expect(sugestaoDoCaso([card('a', { arquivado: true, naEntrada: true }), card('b', { pessoas: 0, entrada: BASE + 1 })]).fica).toBe('b');
    expect(sugestaoDoCaso([card('a', { arquivado: true }), card('b', { pessoas: 0, entrada: BASE + 1 })]).fica).toBe('a');
  });
});
