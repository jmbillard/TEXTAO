import { describe, expect, it } from 'vitest';
import { gestoNaLista, SEGURAR_MS } from '../src/ui/gestoNaLista';

describe('o gesto do dedo numa linha da lista de artes (o lote no celular)', () => {
  it('encostar e soltar logo, sem sair do lugar, é um toque', () => {
    expect(gestoNaLista(120, 0)).toBe('toque');
    expect(gestoNaLista(300, 6)).toBe('toque');
  });

  it('ficar parado por meio segundo é segurar (começa o lote)', () => {
    expect(SEGURAR_MS).toBe(500);
    expect(gestoNaLista(499, 2)).toBe('toque');
    expect(gestoNaLista(500, 2)).toBe('segurar');
    expect(gestoNaLista(1400, 4)).toBe('segurar');
  });

  it('o dedo que se afasta é um arrasto (rolar a página): não é toque nem segurar', () => {
    expect(gestoNaLista(150, 30)).toBe('arrasto');
    expect(gestoNaLista(900, 30)).toBe('arrasto');
  });

  it('um tremor do dedo não vira arrasto; passar de 8px vira', () => {
    expect(gestoNaLista(600, 8)).toBe('segurar');
    expect(gestoNaLista(600, 9)).toBe('arrasto');
    expect(gestoNaLista(100, 9)).toBe('arrasto');
  });
});
