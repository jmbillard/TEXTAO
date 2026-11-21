import { describe, expect, it } from 'vitest';
import { artesQueJaExistem } from '../src/modelo/exportar';
import type { Saida } from '../src/modelo/exportar';

const saida = (jaExiste?: string[]) =>
  ({
    roteiro: { jaExistem: [{ arte: 'HOJE', chave: 'HOJE', tipo: 'RDP', claquete: 'X' }, { arte: 'AMANHÃ', chave: 'AMANHA', tipo: '', claquete: 'Y' }], jaExiste },
    artes: [{ texto: 'Hoje' }, { texto: 'Amanhã!' }, { texto: 'Sexta' }],
  }) as unknown as Saida;

describe('já existe', () => {
  it('a arte do acervo que quem revisa marcou como "já existe" deixa de contar como pendência', () => {
    expect(artesQueJaExistem(saida())).toEqual(['HOJE', 'AMANHA']);
    expect(artesQueJaExistem(saida(['HOJE']))).toEqual(['AMANHA']);
    expect(artesQueJaExistem(saida(['HOJE', 'AMANHA']))).toEqual([]);
  });
});
