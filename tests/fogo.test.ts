import { describe, expect, it } from 'vitest';
import { acabarTroca, comecarFogo, trocarFogo } from '../src/ui/trocaDoFogo';

describe('a troca de nível do fogo', () => {
  it('o fogo nasce parado no nível, sem troca nem brilho', () => {
    expect(comecarFogo(2).camadas).toEqual([{ k: 0, n: 2, papel: 'fica' }]);
  });

  it('subir de nível: o desenho velho cresce até o tamanho do novo e some; o novo nasce do tamanho do velho', () => {
    const e = trocarFogo(comecarFogo(1), 2);
    expect(e.camadas).toEqual([
      { k: 0, n: 1, papel: 'sai', escala: 1.29 },
      { k: 1, n: 2, papel: 'entra', escala: 0.775 },
    ]);
  });

  it('descer de nível: o velho encolhe e o novo nasce maior', () => {
    const e = trocarFogo(comecarFogo(3), 1);
    expect(e.camadas).toEqual([
      { k: 0, n: 3, papel: 'sai', escala: 0.62 },
      { k: 1, n: 1, papel: 'entra', escala: 1.613 },
    ]);
  });

  it('o mesmo nível não troca', () => {
    const e = comecarFogo(2);
    expect(trocarFogo(e, 2)).toBe(e);
  });

  it('trocar de novo no meio da troca: o que entrava passa a sair e o que já saía some', () => {
    const e = trocarFogo(trocarFogo(comecarFogo(1), 2), 3);
    expect(e.camadas).toEqual([
      { k: 1, n: 2, papel: 'sai', escala: 1.25 },
      { k: 2, n: 3, papel: 'entra', escala: 0.8 },
    ]);
  });

  it('no fim da troca fica só o desenho novo, o mesmo elemento, sem brilho', () => {
    const e = acabarTroca(trocarFogo(comecarFogo(1), 3));
    expect(e.camadas).toEqual([{ k: 1, n: 3, papel: 'fica' }]);
    expect(acabarTroca(e)).toBe(e);
  });
});
