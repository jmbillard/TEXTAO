import { describe, expect, it } from 'vitest';
import { cicloDoRoteiro, frasesDoCiclo, type FatosDoCiclo } from '../src/modelo/cicloDoRoteiro';

/* O ciclo do roteiro (#102): o estado e os passos com data, do que o PROMeiro já sabe (a chegada à fila, o envio, a
   Produção e a data da claquete). As horas são as do relógio local, como a agenda mostra: os instantes saem de datas
   locais. */

const em = (dia: number, h: number, m = 0, mes = 11) => new Date(2026, mes - 1, dia, h, m).toISOString();
const HOJE = '2026-11-27';
const fatos = (f: Partial<FatosDoCiclo> = {}): FatosDoCiclo => ({ chegouEm: em(26, 9, 40), enviadoEm: null, producao: null, dataExibicao: '2026-12-03', ...f });
const situacoes = (f: FatosDoCiclo, hoje = HOJE) => Object.fromEntries(cicloDoRoteiro(f, hoje).passos.map((p) => [p.id, p.situacao]));

describe('o ciclo do roteiro', () => {
  it('o roteiro que chegou à fila e não foi enviado está Em revisão, com quando chegou', () => {
    const c = cicloDoRoteiro(fatos(), HOJE);
    expect(c.estado).toBe('revisao');
    expect(c.passos.map((p) => p.nome)).toEqual(['Escrevendo', 'Em aprovação', 'Aprovado', 'Em revisão', 'Produzindo', 'Entregue', 'Exibido']);
    expect(situacoes(fatos())).toEqual({ escrevendo: 'em-breve', aprovacao: 'em-breve', aprovado: 'em-breve', revisao: 'agora', produzindo: 'depois', entregue: 'depois', exibido: 'depois' });
    expect(frasesDoCiclo(c.passos)).toEqual(['chegou 26/11, 9h40']);
  });

  it('enviado, com a Produção em Entrada ou em Produzindo, está Produzindo, com quando foi para o Trello', () => {
    for (const etapa of ['entrada', 'produzindo'] as const) {
      const f = fatos({ enviadoEm: em(26, 11, 2), producao: { etapa, entradaEm: em(26, 11, 3), entregaEm: null } });
      const c = cicloDoRoteiro(f, HOJE);
      expect(c.estado).toBe('produzindo');
      expect(situacoes(f)).toMatchObject({ revisao: 'feito', produzindo: 'agora', entregue: 'depois' });
      expect(frasesDoCiclo(c.passos)).toEqual(['chegou 26/11, 9h40', 'no Trello 26/11, 11h02']);
    }
  });

  it('enviado e ainda sem Produção (a produção da arte não foi relida) já está Produzindo', () => {
    const c = cicloDoRoteiro(fatos({ enviadoEm: em(26, 11, 2) }), HOJE);
    expect(c.estado).toBe('produzindo');
    expect(frasesDoCiclo(c.passos)).toEqual(['chegou 26/11, 9h40', 'no Trello 26/11, 11h02']);
  });

  it('a Produção Entregue deixa o roteiro Entregue, com quando foi entregue', () => {
    const c = cicloDoRoteiro(fatos({ enviadoEm: em(26, 11, 2), producao: { etapa: 'entregue', entradaEm: em(26, 11, 3), entregaEm: em(27, 16, 20) } }), HOJE);
    expect(c.estado).toBe('entregue');
    expect(frasesDoCiclo(c.passos)).toEqual(['chegou 26/11, 9h40', 'no Trello 26/11, 11h02', 'entregue 27/11, 16h20']);
  });

  it('a Produção arquivada conta como Entregue', () => {
    const c = cicloDoRoteiro(fatos({ enviadoEm: em(26, 11, 2), producao: { etapa: 'arquivada', entradaEm: em(26, 11, 3), entregaEm: em(27, 16, 20) } }), HOJE);
    expect(c.estado).toBe('entregue');
    expect(frasesDoCiclo(c.passos)).toEqual(['chegou 26/11, 9h40', 'no Trello 26/11, 11h02', 'entregue 27/11, 16h20']);
  });

  it('a data da claquete que já passou deixa o roteiro Exibido; no próprio dia, ainda não', () => {
    const entregue = fatos({ enviadoEm: em(26, 11, 2), producao: { etapa: 'entregue', entradaEm: null, entregaEm: em(27, 16, 20) }, dataExibicao: '2026-11-27' });
    expect(cicloDoRoteiro(entregue, '2026-11-27').estado).toBe('entregue');
    const c = cicloDoRoteiro(entregue, '2026-11-28');
    expect(c.estado).toBe('exibido');
    expect(situacoes(entregue, '2026-11-28')).toMatchObject({ entregue: 'feito', exibido: 'agora' });
    expect(frasesDoCiclo(c.passos)).toEqual(['chegou 26/11, 9h40', 'no Trello 26/11, 11h02', 'entregue 27/11, 16h20', 'foi ao ar 27/11']);
  });

  it('a data que passou com o roteiro ainda na revisão também é Exibido: a claquete foi ao ar', () => {
    const c = cicloDoRoteiro(fatos({ dataExibicao: '2026-11-20' }), HOJE);
    expect(c.estado).toBe('exibido');
    expect(frasesDoCiclo(c.passos)).toEqual(['chegou 26/11, 9h40', 'foi ao ar 20/11']);
  });

  it('o roteiro sem data fica no último estado conhecido', () => {
    for (const dataExibicao of ['', null, 'sem data']) {
      expect(cicloDoRoteiro(fatos({ dataExibicao }), '2030-01-01').estado).toBe('revisao');
      expect(cicloDoRoteiro(fatos({ dataExibicao, producao: { etapa: 'entregue', entradaEm: null, entregaEm: null } }), '2030-01-01').estado).toBe('entregue');
    }
  });

  it('a Produção que voltou da entrega para a produção não mostra a entrega antiga', () => {
    const c = cicloDoRoteiro(fatos({ enviadoEm: em(26, 11, 2), producao: { etapa: 'produzindo', entradaEm: null, entregaEm: em(27, 16, 20) } }), HOJE);
    expect(c.estado).toBe('produzindo');
    expect(c.passos.find((p) => p.id === 'entregue')?.quando).toBeNull();
  });
});
