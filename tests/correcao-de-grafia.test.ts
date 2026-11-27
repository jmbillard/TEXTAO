import { describe, expect, it } from 'vitest';
import { propostaDaClaquete } from '../src/modelo/correcaoDeGrafia';
import { lerVersoes } from '../src/modelo/pauta';

/* A correção de grafia da pauta da edição (#114): o código de versão no fim da claquete passa para o padrão, uma letra
   por versão, maiúscula, entre parênteses, no fim e na ordem escrita (DIA vira D, MES e MÊS viram M, MNT continua
   inteiro). Só o código muda. Claquetes fictícias. */

const para = (claquete: string) => {
  const p = propostaDaClaquete(claquete);
  return p?.tipo === 'corrigir' ? p.para : p;
};

describe('propostaDaClaquete: a grafia fora do padrão vai para o padrão', () => {
  it('minúsculas sem parênteses viram maiúsculas entre parênteses', () => {
    expect(propostaDaClaquete('Show da Tarde 4/12 Dp')).toEqual({ tipo: 'corrigir', de: 'Show da Tarde 4/12 Dp', para: 'Show da Tarde 4/12 (DP)' });
  });
});

describe('lerVersoes: a letra M é "em <mês>"', () => {
  it('sozinha e combinada, como as outras letras', () => {
    expect(lerVersoes('Festival 3/1 (M)', '2026-12-20').versoes).toEqual([{ codigo: 'M', rotulo: 'em janeiro', conhecida: true }]);
    expect(lerVersoes('Festival 3/1 (MA)', '2026-12-20').versoes.map((v) => v.rotulo)).toEqual(['em janeiro', 'amanhã']);
    expect(lerVersoes('Festival 3/1 m', '2026-12-20').versoes.map((v) => v.rotulo)).toEqual(['em janeiro']);
  });

  it('repetida não é combinação', () => {
    expect(lerVersoes('Festival 3/1 (MM)', '2026-12-20').versoes).toEqual([{ codigo: 'MM', rotulo: 'MM', conhecida: false }]);
  });
});

describe('propostaDaClaquete: cada letra', () => {
  it.each(['A', 'H', 'N', 'P', 'D', 'M'])('%s em minúscula vira maiúscula', (letra) => {
    expect(para(`Novela Sol 28/11 (${letra.toLowerCase()})`)).toBe(`Novela Sol 28/11 (${letra})`);
  });

  it.each(['A', 'H', 'N', 'P', 'D', 'M'])('(%s) já está no padrão', (letra) => {
    expect(propostaDaClaquete(`Novela Sol 28/11 (${letra})`)).toBeNull();
  });
});

describe('propostaDaClaquete: os códigos inteiros', () => {
  it('DIA vira (D), em qualquer caixa', () => {
    expect(para('Show da Tarde 28/11 (DIA)')).toBe('Show da Tarde 28/11 (D)');
    expect(para('Show da Tarde 28/11 (Dia)')).toBe('Show da Tarde 28/11 (D)');
  });

  it('MES e MÊS viram (M), com ou sem acento', () => {
    expect(para('Festival 3/1 (MES)')).toBe('Festival 3/1 (M)');
    expect(para('Festival 3/1 (MÊS)')).toBe('Festival 3/1 (M)');
    expect(para('Festival 3/1 (mês)')).toBe('Festival 3/1 (M)');
  });

  it('MNT continua (MNT)', () => {
    expect(propostaDaClaquete('Grade da Noite 28/11 (MNT)')).toBeNull();
    expect(para('Grade da Noite 28/11 (mnt)')).toBe('Grade da Noite 28/11 (MNT)');
    expect(para('Grade da Noite 28/11 MNT')).toBe('Grade da Noite 28/11 (MNT)');
  });
});

describe('propostaDaClaquete: as combinações ficam na ordem escrita', () => {
  it.each([
    ['Novela Sol 28/11 (ah)', 'Novela Sol 28/11 (AH)'],
    ['Show da Tarde 4/12 NAH', 'Show da Tarde 4/12 (NAH)'],
    ['Show da Tarde 4/12 (Dp)', 'Show da Tarde 4/12 (DP)'],
    ['Show da Tarde 4/12 pnah', 'Show da Tarde 4/12 (PNAH)'],
  ])('%s → %s', (de, esperado) => {
    expect(para(de)).toBe(esperado);
  });

  it.each(['Novela Sol 28/11 (AH)', 'Show da Tarde 4/12 (NAH)', 'Show da Tarde 4/12 (DP)', 'Show da Tarde 4/12 (PNAH)'])('%s já está no padrão', (claquete) => {
    expect(propostaDaClaquete(claquete)).toBeNull();
  });
});

describe('propostaDaClaquete: as outras grafias fora do padrão', () => {
  it('a letra sem parênteses, depois da data', () => {
    expect(para('Novela Sol 28/11 H')).toBe('Novela Sol 28/11 (H)');
  });

  it('com espaços dentro dos parênteses', () => {
    expect(para('Novela Sol 28/11 ( AH )')).toBe('Novela Sol 28/11 (AH)');
  });
});

describe('propostaDaClaquete: só o código de versão muda', () => {
  it('o resto da claquete fica como está, até o parêntese do meio e o espaço antes do código', () => {
    expect(para('Festa do Bairro(Prologo)26/11 (ah)')).toBe('Festa do Bairro(Prologo)26/11 (AH)');
    expect(para('Show da Tarde 4/12-2 Dp')).toBe('Show da Tarde 4/12-2 (DP)');
    expect(para('festa   da vila 28/11(dia)')).toBe('festa   da vila 28/11(D)');
  });

  it('sem código, sem correção (a praça e a versão da arte no fim não são código)', () => {
    expect(propostaDaClaquete('Novela Sol 24/11-2')).toBeNull();
    expect(propostaDaClaquete('Quem Ama 20/11 SP')).toBeNull();
    expect(propostaDaClaquete('Chamada 8/1 B')).toBeNull();
    expect(propostaDaClaquete('COMUNICAÇÃO')).toBeNull();
    expect(propostaDaClaquete('')).toBeNull();
  });
});

describe('propostaDaClaquete: o código desconhecido não é corrigido', () => {
  it('fica sem correção e é apontado como não reconhecido, cru', () => {
    expect(propostaDaClaquete('Show da Tarde 28/11 (XYZ)')).toEqual({ tipo: 'nao-reconhecido', de: 'Show da Tarde 28/11 (XYZ)', codigo: 'XYZ' });
    expect(propostaDaClaquete('Show da Tarde 28/11 (aa)')).toEqual({ tipo: 'nao-reconhecido', de: 'Show da Tarde 28/11 (aa)', codigo: 'aa' });
  });
});
