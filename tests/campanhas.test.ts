import { describe, expect, it } from 'vitest';
import { TONS_DA_CAMPANHA, campanhasParaLigar, etiquetasDoCard, tomDaCampanha } from '../src/modelo/campanhas';

/* A etiqueta da campanha (#178): a primeira ligada e o "+N" das outras, e o tom da bolinha, o mesmo para a mesma
   campanha. */
const c = (id: string, nome = id) => ({ id, nome });

describe('a etiqueta da campanha (#178)', () => {
  it('sem campanha, nada; com uma, ela; com mais de uma, a primeira e +N com os nomes das outras', () => {
    expect(etiquetasDoCard(undefined)).toEqual({ vistas: [], mais: 0, resto: [] });
    expect(etiquetasDoCard([c('a', 'Lançamento')])).toEqual({ vistas: [c('a', 'Lançamento')], mais: 0, resto: [] });
    expect(etiquetasDoCard([c('a', 'Lançamento'), c('b', 'AESP'), c('d', 'Elenco')])).toEqual({ vistas: [c('a', 'Lançamento')], mais: 2, resto: ['AESP', 'Elenco'] });
    expect(etiquetasDoCard([c('a'), c('b'), c('d')], 3)).toEqual({ vistas: [c('a'), c('b'), c('d')], mais: 0, resto: [] });
  });

  it('o tom é estável e dentro dos tons', () => {
    for (const id of ['x', 'campanha-1', '5f0c', '']) {
      expect(tomDaCampanha(id)).toBe(tomDaCampanha(id));
      expect(tomDaCampanha(id)).toBeGreaterThanOrEqual(0);
      expect(tomDaCampanha(id)).toBeLessThan(TONS_DA_CAMPANHA);
    }
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(tomDaCampanha)).size).toBeGreaterThan(1);
  });

  it('para ligar: as que a Produção ainda não tem', () => {
    expect(campanhasParaLigar([c('a'), c('b'), c('d')], [c('b')])).toEqual([c('a'), c('d')]);
  });
});
