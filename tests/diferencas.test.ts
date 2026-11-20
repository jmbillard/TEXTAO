import { describe, expect, it } from 'vitest';
import { diferencasDeArtes, diferencasDeTexto, semelhanca } from '../src/modelo/diferencas';

describe('comparar dois roteiros', () => {
  it('marca o que saiu e o que entrou, frase inteira, ignorando acento, caixa e pontuação', () => {
    const t = diferencasDeTexto('VEM AÍ: A GRANDE FESTA. SÁBADO, LOGO APÓS A NOVELA!', 'Vem ai a grande festa. Domingo à noite, logo após a novela!');
    expect(t.map((x) => [x.tipo, x.texto.trim()])).toEqual([
      ['igual', 'Vem ai a grande festa.'],
      ['entrou', 'Domingo à noite,'],
      ['saiu', 'SÁBADO,'],
      ['igual', 'logo após a novela!'],
    ]);
    expect(semelhanca(t)).toBeCloseTo(9 / 12); // 9 iguais; o novo tem 12 palavras
  });

  it('textos iguais: tudo igual, semelhança 1', () => {
    const t = diferencasDeTexto('UM DOIS TRÊS', 'um   dois três');
    expect(t).toHaveLength(1);
    expect(semelhanca(t)).toBe(1);
    expect(semelhanca(diferencasDeTexto('', ''))).toBe(1);
  });

  it('artes: continuam, saíram, entraram', () => {
    const d = diferencasDeArtes(['A GRANDE FESTA', 'SÁBADO'], ['A Grande Festa', 'DOMINGO']);
    expect(d.antigas).toEqual([{ texto: 'A GRANDE FESTA', tipo: 'igual' }, { texto: 'SÁBADO', tipo: 'saiu' }]);
    expect(d.novas).toEqual([{ texto: 'A Grande Festa', tipo: 'igual' }, { texto: 'DOMINGO', tipo: 'entrou' }]);
  });
});

describe('mesma pessoa', () => {
  it('login, nome completo e acento contam como a mesma; outro primeiro nome, não', async () => {
    const { mesmaPessoa } = await import('../src/modelo/diferencas');
    expect(mesmaPessoa('ana', 'Ana Lima')).toBe(true);
    expect(mesmaPessoa('ana.lima', 'ANA LIMA')).toBe(true);
    expect(mesmaPessoa('Joao', 'João Pedro')).toBe(true);
    expect(mesmaPessoa('Bia Costa', 'Ana Lima')).toBe(false);
    expect(mesmaPessoa('', 'Ana Lima')).toBe(true);
  });
});
