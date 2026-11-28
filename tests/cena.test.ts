import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarPalco } from '../src/ui/cena';

/** O palco das cenas (a fila zerada, a comemoração) respeita o movimento reduzido sozinho (#171): quem o cria não
    precisa lembrar de passar `instante`. */
describe('criarPalco', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reduzido = (sim: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: sim && q.includes('reduce'), media: q }));

  it('com o movimento reduzido, é instantâneo: o prazo roda na hora', () => {
    reduzido(true);
    const palco = criarPalco();
    expect(palco.instante).toBe(true);
    const fn = vi.fn();
    palco.at(500, fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('sem ele, anima: o prazo espera', () => {
    reduzido(false);
    vi.useFakeTimers();
    const palco = criarPalco();
    expect(palco.instante).toBe(false);
    const fn = vi.fn();
    palco.at(500, fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('quem pede instantâneo continua tendo', () => {
    reduzido(false);
    expect(criarPalco(true).instante).toBe(true);
  });
});
