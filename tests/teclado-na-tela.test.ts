import { describe, expect, it } from 'vitest';
import { alturaDoTeclado } from '../src/ui/tecladoNaTela';

/* O teclado do celular (#198): a barra de tipos fica acima dele, pela diferença entre a janela e o visualViewport. */
describe('a altura do teclado (#198)', () => {
  it('sem teclado, zero', () => {
    expect(alturaDoTeclado(844, { height: 844, offsetTop: 0 })).toBe(0);
  });
  it('com o teclado aberto, o que ele cobre do pé da janela', () => {
    expect(alturaDoTeclado(844, { height: 508, offsetTop: 0 })).toBe(336);
  });
  it('com a página rolada por baixo do teclado (o iOS), desconta o deslocamento', () => {
    expect(alturaDoTeclado(844, { height: 508, offsetTop: 120 })).toBe(216);
  });
  it('a barra do navegador que some ou volta (menos de 80 px) não é teclado', () => {
    expect(alturaDoTeclado(844, { height: 790, offsetTop: 0 })).toBe(0);
  });
  it('sem o visualViewport (o navegador antigo), zero', () => {
    expect(alturaDoTeclado(844, null)).toBe(0);
  });
});
