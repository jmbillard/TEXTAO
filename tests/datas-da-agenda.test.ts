import { describe, expect, it } from 'vitest';
import { diaDaAgenda, instanteDaAgenda } from '../src/ui/util';

// #171: as datas fora da agenda (a Correção de grafia, os Padeiros) no padrão dela, "sex 27/11"
describe('as datas no padrão da agenda', () => {
  it('o dia: o dia da semana curto, sem ponto, e o dia/mês, sem o ano', () => {
    expect(diaDaAgenda('2026-11-27')).toBe('sex 27/11');
    expect(diaDaAgenda('2026-11-29')).toBe('dom 29/11');
    expect(diaDaAgenda('2026-11-28T15:00:00Z')).toBe('sáb 28/11');
  });
  it('o instante: o dia e a hora, no fuso de quem vê', () => {
    const d = new Date(2026, 10, 27, 23, 5);
    expect(instanteDaAgenda(d.toISOString())).toBe('sex 27/11 23h05');
  });
  it('o que não é data volta como veio', () => {
    expect(diaDaAgenda('sem data')).toBe('sem data');
    expect(instanteDaAgenda('x')).toBe('x');
  });
});
