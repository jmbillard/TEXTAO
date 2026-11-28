import { describe, expect, it } from 'vitest';
import { aplicarOColado, demandasQueEntram, lerOColado } from '../src/modelo/colarDaPlanilha';
import { acrescentarDemanda, moverDemanda, tirarDemanda } from '../src/modelo/distribuir';
import { TURNOS_DE_FABRICA, type PosicaoDaEscala } from '../src/modelo/escala';
import { claquetesParaEscolher, type ProducaoNaPauta } from '../src/modelo/pauta';

/* O Montar a pauta só com claquetes (#199, ADR 0008), as regras puras: a claquete escolhida leva as infos dela quando
   muda de lugar; o colar da planilha só põe no rascunho o que casa com uma Produção (o resto fica "de fora", com a
   mesma regra da Pauta para a info); e a lista das claquetes que a coordenação escolhe. Nomes e claquetes inventados;
   27/11/2026 é uma sexta. */

const DIA = '2026-11-27';
const posicao = (id: string, editor: string, demandas: string[]): PosicaoDaEscala => ({ id, turno: 'manha', editor, ilha: '', horario: '6h às 15h', demandas: demandas.map((texto, i) => ({ id: `${id}-d${i}`, texto })), avisos: [] });
const textos = (ps: PosicaoDaEscala[]) => ps.map((p) => p.demandas.map((d) => d.texto));

describe('a claquete leva as infos dela', () => {
  const dia = () => [posicao('p1', 'Rui Teixeira', ['Bola Cheia 29/11', 'TRANSFORMAR DA A B', 'ENTRA SÁBADO', 'Terra Viva 30/11', 'VIRA B']), posicao('p2', 'Elis Furtado', ['Mundo Animal 28/11'])];

  it('tirar a claquete tira as infos que vêm logo depois dela, até a próxima claquete', () => {
    const t = tirarDemanda(dia(), 'p1-d0')!;
    expect(t.demanda.texto).toBe('Bola Cheia 29/11');
    expect(t.infos.map((d) => d.texto)).toEqual(['TRANSFORMAR DA A B', 'ENTRA SÁBADO']);
    expect(textos(t.posicoes)[0]).toEqual(['Terra Viva 30/11', 'VIRA B']);
  });

  it('mover a claquete para outra posição leva as infos junto, na ordem', () => {
    expect(textos(moverDemanda(dia(), 'p1-d0', 'p2', null)!)).toEqual([
      ['Terra Viva 30/11', 'VIRA B'],
      ['Mundo Animal 28/11', 'Bola Cheia 29/11', 'TRANSFORMAR DA A B', 'ENTRA SÁBADO'],
    ]);
    // antes de outra claquete, as infos vão entre as duas
    expect(textos(moverDemanda(dia(), 'p1-d3', 'p2', 'p2-d0')!)[1]).toEqual(['Terra Viva 30/11', 'VIRA B', 'Mundo Animal 28/11']);
  });

  it('soltar entre as próprias infos é soltar depois delas; tirar a info sozinha não mexe na claquete', () => {
    expect(textos(moverDemanda(dia(), 'p1-d0', 'p1', 'p1-d2')!)[0]).toEqual(['Terra Viva 30/11', 'VIRA B', 'Bola Cheia 29/11', 'TRANSFORMAR DA A B', 'ENTRA SÁBADO']);
    const t = tirarDemanda(dia(), 'p1-d1')!;
    expect(t.infos).toEqual([]);
    expect(textos(t.posicoes)[0]).toEqual(['Bola Cheia 29/11', 'ENTRA SÁBADO', 'Terra Viva 30/11', 'VIRA B']);
  });

  it('acrescentar com as infos as põe logo depois da claquete', () => {
    const ps = acrescentarDemanda([posicao('p1', 'Rui', ['Mundo Animal 28/11'])], 'p1', { id: 'n', texto: 'Bola Cheia 29/11' }, 'p1-d0', [{ id: 'i', texto: 'VIRA B' }])!;
    expect(textos(ps)[0]).toEqual(['Bola Cheia 29/11', 'VIRA B', 'Mundo Animal 28/11']);
  });
});

describe('o colar da planilha só põe o que casa', () => {
  const casa = (t: string) => /BOLA CHEIA|MUNDO ANIMAL/i.test(t);

  it('entram a claquete que casa e as infos dela; ficam de fora a tarefa, a claquete sem Produção e a info dela', () => {
    const r = demandasQueEntram(['REDATOR VAI ACOMPANHAR', 'Bola Cheia 29/11', 'ENTRA SÁBADO', 'Terra Viva 30/11', 'TRANSFORMAR DA A B', 'COMUNICAÇÃO', 'VIRA B', 'Mundo Animal 28/11'], casa);
    expect(r.entram).toEqual([0, 1, 2, 6, 7]);
    expect(r.deFora).toEqual([
      { i: 3, tipo: 'claquete' },
      { i: 4, tipo: 'info' },
      { i: 5, tipo: 'tarefa' },
    ]);
  });

  it('aplicar com `casa` deixa no rascunho só o que entra e devolve o resto, com o editor', () => {
    const colado = ['\t                         MANHÃ', '\tAVID 46\t', '\tEDITOR: \tRui Teixeira', '\tHORÁRIO: \t6 as 15', '\tBola Cheia 29/11\t', '\tCOMUNICAÇÃO\t', '\tTerra Viva 30/11\t'].join('\n');
    const ctx = { dia: DIA, turnos: [...TURNOS_DE_FABRICA], editores: ['Rui Teixeira'], apelidos: {}, ilhas: [] };
    const leitura = lerOColado(colado, ctx);
    let n = 0;
    const r = aplicarOColado(leitura, { dia: DIA, turnos: ctx.turnos, posicoes: [], modo: 'substituir', respostas: {}, jaFora: [], novoId: (p) => `${p}-${++n}`, casa });
    expect(textos(r.posicoes)).toEqual([['Bola Cheia 29/11']]);
    expect(r.deFora).toEqual([
      { editor: 'Rui Teixeira', texto: 'COMUNICAÇÃO', tipo: 'tarefa' },
      { editor: 'Rui Teixeira', texto: 'Terra Viva 30/11', tipo: 'claquete' },
    ]);
    // sem `casa` (como antes do #199), tudo entra
    expect(textos(aplicarOColado(leitura, { dia: DIA, turnos: ctx.turnos, posicoes: [], modo: 'substituir', respostas: {}, jaFora: [], novoId: (p) => `${p}-${++n}` }).posicoes)).toEqual([['Bola Cheia 29/11', 'COMUNICAÇÃO', 'Terra Viva 30/11']]);
  });
});

describe('as claquetes para escolher', () => {
  const producao = (id: string, claquete: string, entradaEm: string | null, extra: Partial<ProducaoNaPauta> = {}): ProducaoNaPauta => ({ id, claquete, praca: '', etapa: 'entrada', artes: null, designers: [], alta: false, entradaEm, entregaEm: null, ...extra });
  const semPraca = (chave: string) => chave.replace(/ SP$/, '');

  it('uma por chave (as praças juntas), da que entrou por último para a mais velha, sem arquivadas, sem as que estão no dia, só perto do dia', () => {
    const lista = claquetesParaEscolher(
      [
        producao('a', 'Bola Cheia 29/11', '2026-11-20T12:00:00.000Z'),
        producao('b', 'Mundo Animal 28/11 SP', '2026-11-25T12:00:00.000Z', { praca: 'SP', etapa: 'produzindo' }),
        producao('c', 'Mundo Animal 28/11', '2026-11-24T12:00:00.000Z', { praca: 'G5', etapa: 'entregue' }),
        producao('d', 'Festa Velha 29/11', '2026-11-26T12:00:00.000Z', { etapa: 'arquivada' }),
        producao('e', 'Terra Viva 30/11', '2026-11-26T12:00:00.000Z'),
        producao('f', 'Bola Cheia 29/11', '2025-11-20T12:00:00.000Z'),
        producao('g', 'Sem Data Ainda', null),
      ],
      DIA,
      semPraca,
      { comCard: new Set(['c']), noDia: new Set(['e']) },
    );
    expect(lista.map((c) => [c.claquete, c.pracas, c.etapa, c.noTrello, c.producoes])).toEqual([
      ['Mundo Animal 28/11 SP', ['G5', 'SP'], 'produzindo', true, ['b', 'c']],
      ['Bola Cheia 29/11', [], 'entrada', false, ['a']],
      ['Sem Data Ainda', [], 'entrada', false, ['g']],
    ]);
  });
});
