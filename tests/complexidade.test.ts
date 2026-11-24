import { describe, expect, it } from 'vitest';
import { alvosDoTeclado, complexidadeDaArte, complexidadeDoRoteiro, marcarComplexidade, subirComplexidade } from '../src/modelo/exportar';
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

describe('complexidade pelo teclado e pela barra de lote', () => {
  it('a tecla vale para a seleção inteira; sem seleção, para a arte sob o mouse; sem ela, para a última clicada', () => {
    expect(alvosDoTeclado(['a1', 'a3'], 'a2', 'a4')).toEqual(['a1', 'a3']);
    expect(alvosDoTeclado([], 'a2', 'a4')).toEqual(['a2']);
    expect(alvosDoTeclado([], null, 'a4')).toEqual(['a4']);
    expect(alvosDoTeclado([], null, null)).toEqual([]);
  });

  it('1, 2 e 3 levam direto ao nível, em todas as artes de uma vez; a BAIXA não fica guardada', () => {
    const meta: Marcas = { complexidade: { HOJE: 3 } };
    expect(marcarComplexidade(meta, ['HOJE', 'AMANHA'], 2)).toEqual({ complexidade: { HOJE: 2, AMANHA: 2 } });
    expect(marcarComplexidade(meta, ['AMANHA'], 3)).toEqual({ complexidade: { HOJE: 3, AMANHA: 3 } });
    expect(marcarComplexidade(meta, ['HOJE'], 1)).toEqual({ complexidade: undefined });
    expect(meta.complexidade).toEqual({ HOJE: 3 });
  });

  it('a arte que já existe e a que está fora não ganham marca (não têm fogo)', () => {
    const meta: Marcas = { jaExiste: ['HOJE'], naoProduzir: ['SEXTA'] };
    expect(marcarComplexidade(meta, ['HOJE', 'AMANHA', 'SEXTA'], 3)).toEqual({ complexidade: { AMANHA: 3 } });
  });
});
