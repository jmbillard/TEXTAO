import { describe, expect, it } from 'vitest';
import { RASGO_PX, lambeDe, rasgo, sorteio } from '../src/ui/lambe';

/* O lambe-lambe da agenda de filmes (#184): o cartaz de cada pôster sai de um sorteio fixo, com rotação pequena,
   rasgadinhas discretas e nenhum canto dobrado. */

describe('o lambe-lambe da agenda de filmes (#184)', () => {
  it('o mesmo pôster é sempre o mesmo cartaz; outro pôster, outro cartaz', () => {
    expect(lambeDe('recFilmeFicticio1|recEx01')).toEqual(lambeDe('recFilmeFicticio1|recEx01'));
    expect(lambeDe('recFilmeFicticio1|recEx01').clip).not.toBe(lambeDe('recFilmeFicticio2|recEx02').clip);
  });

  it('a rotação e o desnível são pequenos, em muitos pôsteres', () => {
    for (let k = 0; k < 300; k++) {
      const l = lambeDe(`recFicticio${k}`);
      expect(Math.abs(l.rot)).toBeLessThanOrEqual(1.6);
      expect(Math.abs(l.y)).toBeLessThanOrEqual(3);
      expect(['', 'topo-meio', 'topo-esq', 'topo-dir']).toContain(l.fita);
    }
  });

  it('a rasgadinha entra no máximo 2,2 px, nos quatro lados, sem canto cortado (sem dobra)', () => {
    const clip = rasgo(sorteio('recFicticio'));
    const px = [...clip.matchAll(/([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(px.length).toBe(14 * 4);
    expect(Math.max(...px)).toBeLessThanOrEqual(RASGO_PX);
    // os cantos de baixo existem, inteiros (a dobra cortava um deles)
    expect(clip).toMatch(/calc\(100% - [\d.]+px\) 100%/);
    expect(clip).toMatch(/0% calc\(100% - [\d.]+px\)/);
  });
});
