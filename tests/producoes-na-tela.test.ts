import { describe, expect, it } from 'vitest';
import { CHAVE_DO_FILTRO, COLUNAS_DO_BLOCO, abertasNoComeco, abrirAPraca, diasDoEntregue, filtroDe, moverAPraca, naOrdem, nomeDoFiltro, ordemDe, recusaDoFiltro, soDaCampanha, type CardDaProducao } from '../src/modelo/producoesPorPraca.ts';

/* A tela de produções (#159): no máximo 3 praças abertas, a ordem das praças arrumada arrastando e o Entregue com as
   divisórias por dia. A regra é pura; a tela só desenha. */

describe('no máximo 3 praças abertas', () => {
  it('ao abrir a tela: as não recolhidas, na ordem da tela, até 3', () => {
    expect(abertasNoComeco(['G5', 'RJ', 'SP', 'INTER'], [])).toEqual(['G5', 'RJ', 'SP']);
    expect(abertasNoComeco(['G5', 'RJ', 'SP', 'INTER'], ['RJ'])).toEqual(['G5', 'SP', 'INTER']);
    expect(abertasNoComeco(['G5', 'RJ'], ['G5', 'RJ'])).toEqual([]);
  });

  it('abrir a quarta fecha a aberta há mais tempo; abrir de novo uma aberta a faz a mais nova', () => {
    expect(abrirAPraca(['G5', 'RJ', 'SP'], 'INTER')).toEqual(['RJ', 'SP', 'INTER']);
    expect(abrirAPraca(['G5', 'RJ'], 'SP')).toEqual(['G5', 'RJ', 'SP']);
    expect(abrirAPraca(['G5', 'RJ', 'SP'], 'G5')).toEqual(['RJ', 'SP', 'G5']);
  });
});

describe('a ordem das praças', () => {
  const blocos = ['G5', 'RJ', 'SP', 'INTER'].map((praca) => ({ praca }));
  it('sem ordem, a da Configuração; com ela, a da pessoa, e a praça nova no fim', () => {
    expect(naOrdem(blocos, []).map((b) => b.praca)).toEqual(['G5', 'RJ', 'SP', 'INTER']);
    expect(naOrdem(blocos, ['SP', 'G5']).map((b) => b.praca)).toEqual(['SP', 'G5', 'RJ', 'INTER']);
    expect(naOrdem(blocos, ['INTER', 'XX', 'SP', 'RJ', 'G5']).map((b) => b.praca)).toEqual(['INTER', 'SP', 'RJ', 'G5']);
  });

  it('mover leva a praça para o lugar, com as outras na mesma ordem', () => {
    expect(moverAPraca(['G5', 'RJ', 'SP', 'INTER'], 'SP', 0)).toEqual(['SP', 'G5', 'RJ', 'INTER']);
    expect(moverAPraca(['G5', 'RJ', 'SP', 'INTER'], 'G5', 9)).toEqual(['RJ', 'SP', 'INTER', 'G5']);
    expect(moverAPraca(['G5', 'RJ', 'SP'], 'RJ', 1)).toEqual(['G5', 'RJ', 'SP']);
  });

  it('a ordem lembrada que não vale conta como nenhuma', () => {
    expect(ordemDe({ 'producoes.ordem': ['SP', 'RJ'] })).toEqual(['SP', 'RJ']);
    expect(ordemDe({ 'producoes.ordem': 'SP' })).toEqual([]);
    expect(ordemDe(undefined)).toEqual([]);
  });
});

describe('o Entregue com as divisórias por dia', () => {
  const card = (id: string, entregaEm: string | null, prazo: string | null = null): CardDaProducao => ({
    id, claquete: id, atracao: '', praca: 'SP', etapa: 'entregue', marcador: '', designers: [], artes: { aProduzir: null, entregues: 0 }, alta: false, prazo, semCard: false, entregaEm,
  });

  it('agrupa pelo dia da entrega em São Paulo, do mais novo para o mais velho; sem o instante, hoje', () => {
    const dias = diasDoEntregue(
      [
        card('a', '2026-11-25T15:00:00Z'),
        // 01h em UTC ainda é dia 26 à noite em São Paulo
        card('b', '2026-11-27T01:00:00Z'),
        card('c', null),
        card('d', '2026-11-27T14:00:00Z', '2026-11-28'),
        card('e', '2026-11-27T13:00:00Z', '2026-11-27'),
      ],
      '2026-11-27',
    );
    expect(dias.map((d) => [d.dia, d.cards.map((c) => c.id)])).toEqual([
      ['2026-11-27', ['e', 'd', 'c']],
      ['2026-11-26', ['b']],
      ['2026-11-25', ['a']],
    ]);
  });
});

/* O filtro por campanha (#179): a pessoa escolhe uma campanha e as praças de sempre mostram só as Produções dela (as
   contagens saem das colunas, então acompanham). A escolha fica lembrada por pessoa, com a chave `producoes.campanha`. */
describe('o filtro por campanha', () => {
  const card = (id: string, praca: string, etapa: CardDaProducao['etapa'], campanhas: { id: string; nome: string }[] = []): CardDaProducao => ({
    id, claquete: id, atracao: '', praca, etapa, marcador: '', designers: [], artes: { aProduzir: null, entregues: 0 }, alta: false, prazo: null, semCard: false, entregaEm: null, campanhas,
  });
  const lanc = { id: 'cp-lanc', nome: 'Lançamento' };
  const aesp = { id: 'cp-aesp', nome: 'AESP' };
  const tela = {
    entregueDias: 3,
    voce: { designer: null },
    blocos: [
      { praca: 'SP', nome: 'São Paulo', colunas: { entrada: [card('a', 'SP', 'entrada', [lanc]), card('b', 'SP', 'entrada')], produzindo: [card('c', 'SP', 'produzindo', [aesp, lanc])], entregue: [card('d', 'SP', 'entregue', [aesp])] } },
      { praca: 'RJ', nome: 'Rio', colunas: { entrada: [card('e', 'RJ', 'entrada')], produzindo: [], entregue: [] } },
    ],
  };
  const ids = (t: typeof tela) => t.blocos.map((b) => [b.praca, COLUNAS_DO_BLOCO.map((k) => b.colunas[k].map((c) => c.id))]);

  it('sem filtro, a tela como veio; com ele, só as da campanha, nas mesmas praças (também as que ficam vazias)', () => {
    expect(soDaCampanha(tela, null)).toBe(tela);
    expect(ids(soDaCampanha(tela, 'cp-lanc'))).toEqual([['SP', [['a'], ['c'], []]], ['RJ', [[], [], []]]]);
    expect(ids(soDaCampanha(tela, 'cp-aesp'))).toEqual([['SP', [[], ['c'], ['d']]], ['RJ', [[], [], []]]]);
    expect(ids(soDaCampanha(tela, 'cp-sumiu'))).toEqual([['SP', [[], [], []]], ['RJ', [[], [], []]]]);
  });

  it('o nome que vale é o das etiquetas da tela (a renomeada), e sem nenhuma, o lembrado', () => {
    expect(nomeDoFiltro({ id: 'cp-lanc', nome: 'Antigo' }, tela)).toBe('Lançamento');
    expect(nomeDoFiltro({ id: 'cp-sumiu', nome: 'Lembrado' }, tela)).toBe('Lembrado');
  });

  it('lembrado por pessoa: a campanha ou nenhuma; o que não vale conta como nenhuma', () => {
    expect(filtroDe({ [CHAVE_DO_FILTRO]: lanc })).toEqual(lanc);
    expect(filtroDe({ [CHAVE_DO_FILTRO]: null })).toBeNull();
    expect(filtroDe({ [CHAVE_DO_FILTRO]: { id: 1 } })).toBeNull();
    expect(filtroDe(undefined)).toBeNull();
    expect(recusaDoFiltro(lanc)).toBe('');
    expect(recusaDoFiltro(null)).toBe('');
    for (const ruim of ['cp-lanc', { id: '', nome: 'x' }, { id: 'x' }, { id: 'x'.repeat(65), nome: 'x' }, { id: 'x', nome: 'x'.repeat(81) }]) expect(recusaDoFiltro(ruim)).toBe('Filtro da campanha inválido: mande a campanha ({ id, nome }) ou null.');
  });
});
