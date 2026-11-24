import { describe, expect, it } from 'vitest';
import { complexidadeDaArte, complexidadeDoRoteiro, subirComplexidade } from '../src/modelo/exportar';
import type { Meta } from '../src/modelo/tipos';

type Marcas = Pick<Meta, 'complexidade' | 'jaExiste' | 'jaExistem' | 'naoProduzir' | 'produzir'>;

describe('complexidade da arte', () => {
  it('o clique sobe um nível (BAIXA → MÉDIA → ALTA → BAIXA); só MÉDIA e ALTA ficam guardadas', () => {
    let meta: Marcas = {};
    expect(complexidadeDaArte(meta, 'HOJE')).toBe(1);
    meta = { ...meta, ...subirComplexidade(meta, 'HOJE') };
    expect(meta.complexidade).toEqual({ HOJE: 2 });
    meta = { ...meta, ...subirComplexidade(meta, 'HOJE') };
    expect(complexidadeDaArte(meta, 'HOJE')).toBe(3);
    meta = { ...meta, ...subirComplexidade(meta, 'HOJE') };
    // de volta à BAIXA: a ausência é BAIXA, e sem nenhuma marca a lista some do roteiro
    expect(meta.complexidade).toBeUndefined();
    expect(complexidadeDaArte(meta, 'HOJE')).toBe(1);
  });

  it('mexer numa arte não mexe nas outras', () => {
    const meta: Marcas = { complexidade: { HOJE: 3, AMANHA: 2 } };
    expect(subirComplexidade(meta, 'AMANHA')).toEqual({ complexidade: { HOJE: 3, AMANHA: 3 } });
    expect(subirComplexidade(meta, 'HOJE')).toEqual({ complexidade: { AMANHA: 2 } });
    expect(meta.complexidade).toEqual({ HOJE: 3, AMANHA: 2 });
  });

  it('o roteiro vai com a maior das artes a produzir; a que já existe e a que está fora não contam; sem nenhuma, BAIXA', () => {
    const chaves = ['HOJE', 'AMANHA', 'SEXTA'];
    expect(complexidadeDoRoteiro({}, chaves)).toBe(1);
    expect(complexidadeDoRoteiro({ complexidade: { AMANHA: 2 } }, chaves)).toBe(2);
    expect(complexidadeDoRoteiro({ complexidade: { HOJE: 3, AMANHA: 2 }, jaExiste: ['HOJE'] }, chaves)).toBe(2);
    expect(complexidadeDoRoteiro({ complexidade: { HOJE: 3, AMANHA: 2 }, jaExiste: ['HOJE'], naoProduzir: ['AMANHA'] }, chaves)).toBe(1);
    // a do acervo vem riscada sozinha
    expect(complexidadeDoRoteiro({ complexidade: { SEXTA: 3 }, jaExistem: [{ arte: 'Sexta', chave: 'SEXTA', tipo: '', claquete: 'X' }] }, chaves)).toBe(1);
    expect(complexidadeDoRoteiro({ complexidade: { HOJE: 3 } }, [])).toBe(1);
  });
});
