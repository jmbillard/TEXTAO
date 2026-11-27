/* O "Mover para…" (⇄) do Montar a pauta (#163): antes de mover, a tela guarda onde a demanda estava (a posição e a
   demanda seguinte, sem contar as linhas vazias), para o Desfazer da caixinha a pôr de volta no mesmo lugar.
   Nomes e claquetes fictícios. */
import { describe, expect, it } from 'vitest';
import { lugarDaDemanda, moverDemanda } from '../src/modelo/distribuir';
import type { PosicaoDaEscala } from '../src/modelo/escala';

const posicao = (id: string, editor: string, demandas: string[]): PosicaoDaEscala => ({ id, turno: 'tarde', editor, ilha: '', horario: '14h às 23h', demandas: demandas.map((texto, i) => ({ id: `${id}-d${i}`, texto })), avisos: [] });

describe('onde a demanda estava, para o Desfazer do "Mover para…" (#163)', () => {
  const posicoes = [posicao('p1', 'Rui Teixeira', ['CALHAUS', '', 'Mundo Animal 28/11 (P)', '']), posicao('p2', 'Gil Moura', ['Terra Viva 28/11 (A)'])];

  it('a posição e a demanda seguinte, pulando as linhas vazias', () => {
    expect(lugarDaDemanda(posicoes, 'p1-d0')).toEqual({ posicao: 'p1', antesDe: 'p1-d2' });
  });

  it('a última da posição (as vazias depois não contam): volta para o fim', () => {
    expect(lugarDaDemanda(posicoes, 'p1-d2')).toEqual({ posicao: 'p1', antesDe: null });
    expect(lugarDaDemanda(posicoes, 'p2-d0')).toEqual({ posicao: 'p2', antesDe: null });
  });

  it('a demanda que não está no dia: nada', () => {
    expect(lugarDaDemanda(posicoes, 'outra')).toBeNull();
  });

  it('mover e desfazer pelo lugar guardado deixa a posição como estava', () => {
    const lugar = lugarDaDemanda(posicoes, 'p1-d0')!;
    const movidas = moverDemanda(posicoes, 'p1-d0', 'p2')!;
    const desfeitas = moverDemanda(movidas, 'p1-d0', lugar.posicao, lugar.antesDe)!;
    expect(desfeitas.map((p) => p.demandas.map((d) => d.texto).filter(Boolean))).toEqual([['CALHAUS', 'Mundo Animal 28/11 (P)'], ['Terra Viva 28/11 (A)']]);
  });
});
