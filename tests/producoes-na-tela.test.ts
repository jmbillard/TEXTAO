import { describe, expect, it } from 'vitest';
import { abertasNoComeco, abrirAPraca, diasDoEntregue, moverAPraca, naOrdem, ordemDe, type CardDaProducao } from '../src/modelo/producoesPorPraca.ts';

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
