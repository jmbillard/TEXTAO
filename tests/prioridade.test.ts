import { describe, expect, it } from 'vitest';
import { jaFoiExibida } from '../src/modelo/vocabularios';

// "agora" em UTC: Brasília é UTC-3
const em = (iso: string) => new Date(iso);

describe('claquete já exibida (sai da lista de prioridade)', () => {
  it('em 26/11: sai a de dia anterior, fica a de hoje, a de depois e a sem data', () => {
    const agora = em('2026-11-26T15:00:00Z');
    for (const c of ['Encontro 24/11 (H)', 'Terra 25/11-2 (A)', 'Tempo 18 A 25/11 B (MNT)', 'Rio Fut 25-11']) expect(jaFoiExibida(c, agora), c).toBe(true);
    for (const c of ['Terra 26/11-2 (H)', 'Encontro 26/11 (H)', 'Tempo 24 A 28/11 B (MNT)', 'Chef(Manut) D', 'Fe Cena 13/12 (DIA)']) expect(jaFoiExibida(c, agora), c).toBe(false);
  });

  it('a virada do ano: o ano é o mais perto de hoje', () => {
    const fimDoAno = em('2026-12-30T15:00:00Z');
    expect(jaFoiExibida('Fant 29/12', fimDoAno)).toBe(true);
    expect(jaFoiExibida('Fant 2/1', fimDoAno)).toBe(false);

    const comecoDoAno = em('2027-01-02T02:30:00Z'); // 01/01 às 23h30 em Brasília
    expect(jaFoiExibida('Fant 30/12', comecoDoAno)).toBe(true);
    expect(jaFoiExibida('Fant 2/1', comecoDoAno)).toBe(false);
  });

  it('o dia é o de Brasília, não o de UTC', () => {
    // 27/11 às 01h em UTC ainda é 26/11 em Brasília
    expect(jaFoiExibida('Encontro 26/11 (H)', em('2026-11-27T01:00:00Z'))).toBe(false);
  });
});
