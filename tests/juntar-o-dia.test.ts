/* Montar a pauta: duas pessoas ao mesmo tempo (#131), do lado de quem está na tela: o dia que chega da outra pessoa
   é juntado com o que está na tela, sem tirar o que ela ainda está digitando. Nomes e claquetes fictícios;
   27/11/2026 é uma sexta. */
import { describe, expect, it } from 'vitest';
import { juntarODia } from '../src/modelo/juntarODia';
import type { PosicaoDaEscala } from '../src/modelo/escala';

const DIA = '2026-11-27';
const pos = (id: string, x: Partial<PosicaoDaEscala> = {}): PosicaoDaEscala => ({ id, turno: 'tarde', editor: '', ilha: '', horario: '14h às 23h', demandas: [], avisos: [], ...x });

describe('juntar o dia que chegou com o que está na tela (#131)', () => {
  it('a linha vazia em que a pessoa vai digitar e a grafia dela ficam; o que a outra mudou aparece', () => {
    const base = { posicoes: [pos('p1', { editor: 'Rui Teixeira' }), pos('p2')], recado: '' };
    const tela = { posicoes: [pos('p1', { editor: 'Rui Teixeira', horario: '15 as 23', demandas: [{ id: 'd-vazia', texto: '' }] }), pos('p2')], recado: '' };
    const chegou = { posicoes: [pos('p1', { editor: 'Rui Teixeira', horario: '15h às 23h' }), pos('p2', { editor: 'Gil Moura' })], recado: 'reunião às 15h' };
    expect(juntarODia(base, tela, chegou, DIA)).toEqual({
      posicoes: [pos('p1', { editor: 'Rui Teixeira', horario: '15 as 23', demandas: [{ id: 'd-vazia', texto: '' }] }), pos('p2', { editor: 'Gil Moura' })],
      recado: 'reunião às 15h',
    });
  });

  it('a AVID 46 e a ILHA 46 do cadastro são a mesma ilha: trocar uma pela outra não é mudança (#165)', () => {
    const ilhas = [
      { id: 'a46', tipo: 'AVID', numero: '46', nome: '' },
      { id: 'i46', tipo: 'ILHA', numero: '46', nome: '' },
      { id: 'a12', tipo: 'AVID', numero: '12', nome: '' },
    ];
    const base = { posicoes: [pos('p1', { ilha: 'a46' })], recado: '' };
    const tela = { posicoes: [pos('p1', { ilha: 'i46' })], recado: '' };
    const chegou = { posicoes: [pos('p1', { ilha: 'a12' })], recado: '' };
    expect(juntarODia(base, tela, chegou, DIA).posicoes[0].ilha).toBe('i46');
    expect(juntarODia(base, tela, chegou, DIA, { ilhas }).posicoes[0].ilha).toBe('a12');
    expect(juntarODia(base, tela, base, DIA, { ilhas }).posicoes[0].ilha).toBe('i46');
  });

  it('a vaga que ganha editor do outro lado perde o motivo; a vaga da tela fica', () => {
    const base = { posicoes: [pos('p1', { vaga: 'Elis Furtado está de folga' }), pos('p2', { vaga: 'Gil Moura está de férias' })], recado: '' };
    const chegou = { posicoes: [pos('p1', { editor: 'Rui Teixeira' }), pos('p2', { vaga: 'Gil Moura está de férias' })], recado: '' };
    expect(juntarODia(base, base, chegou, DIA).posicoes).toEqual([pos('p1', { editor: 'Rui Teixeira' }), pos('p2', { vaga: 'Gil Moura está de férias' })]);
  });

  it('a demanda que a outra moveu vai para onde ela pôs, com o texto que eu mudei', () => {
    const base = { posicoes: [pos('p1', { demandas: [{ id: 'd1', texto: 'COMUNICAÇÃO' }] }), pos('p2')], recado: '' };
    const tela = { posicoes: [pos('p1', { demandas: [{ id: 'd1', texto: 'CALHAUS' }] }), pos('p2')], recado: '' };
    const chegou = { posicoes: [pos('p1'), pos('p2', { demandas: [{ id: 'd1', texto: 'COMUNICAÇÃO' }] })], recado: '' };
    expect(juntarODia(base, tela, chegou, DIA).posicoes).toEqual([pos('p1'), pos('p2', { demandas: [{ id: 'd1', texto: 'CALHAUS' }] })]);
  });

  it('a posição que a tela mostrou antes da resposta (com a linha vazia) sai quando o servidor grava a dele', () => {
    const mostrada = pos('p-tela', { editor: 'Rui Teixeira' });
    const base = { posicoes: [mostrada], recado: '' };
    const tela = { posicoes: [{ ...mostrada, demandas: [{ id: 'd-vazia', texto: '' }] }], recado: '' };
    const chegou = { posicoes: [pos('p-servidor', { editor: 'Rui Teixeira' })], recado: '' };
    expect(juntarODia(base, tela, chegou, DIA).posicoes.map((p) => p.id)).toEqual(['p-servidor']);
  });
});
