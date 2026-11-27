/* Distribuir sozinho (#151): a regra pura que põe as claquetes de "Para distribuir" nos editores escalados do dia, pela
   continuidade (quem pegou a atração nos últimos 14 dias, o mais recente pesando mais), pela carga (menos demandas no
   dia) e, no empate, pelo sorteio. Nomes e claquetes fictícios; 27/11/2026 é uma sexta. */
import { describe, expect, it } from 'vitest';
import { distribuirAsClaquetes, type PegouAAtracao } from '../src/modelo/distribuir';
import type { PosicaoDaEscala } from '../src/modelo/escala';

const DIA = '2026-11-27';
const posicao = (id: string, editor: string, demandas: string[] = [], turno = 'tarde'): PosicaoDaEscala => ({ id, turno, editor, ilha: '', horario: '14h às 23h', demandas: demandas.map((texto, i) => ({ id: `${id}-d${i}`, texto })), avisos: [] });
const item = (id: string, texto: string, deQuem = '') => ({ id, texto, deQuem });
const pegou = (dia: string, editor: string, atracao: string): PegouAAtracao => ({ dia, editor, atracao });
/** O sorteio fixo: sempre o primeiro da lista dos empatados. */
const primeiro = () => 0;

const distribuir = (o: Partial<Parameters<typeof distribuirAsClaquetes>[0]>) =>
  distribuirAsClaquetes({ dia: DIA, posicoes: [], itens: [], historico: [], fora: [], sortear: primeiro, ...o });
/** Quem recebeu cada claquete e por quê. */
const quem = (r: ReturnType<typeof distribuirAsClaquetes>) => r.distribuidas.map((d) => `${d.texto} → ${d.editor} (${d.motivo})`);

describe('distribuir as claquetes (#151)', () => {
  it('a continuidade: vai para quem pegou a atração, pelo nome sem caixa, acento e artigos', () => {
    const r = distribuir({
      posicoes: [posicao('p1', 'Rui Teixeira'), posicao('p2', 'Elis Furtado')],
      itens: [item('c1', 'A Cozinha Mágica 28/11 (P)')],
      historico: [pegou('2026-11-25', 'Elis Furtado', 'cozinha magica')],
    });
    expect(quem(r)).toEqual(['A Cozinha Mágica 28/11 (P) → Elis Furtado (pegou a atração em 25/11)']);
    expect(r.posicoes.find((p) => p.id === 'p2')?.demandas).toEqual([{ id: 'c1', texto: 'A Cozinha Mágica 28/11 (P)' }]);
    expect(r.posicoes.find((p) => p.id === 'p1')?.demandas).toEqual([]);
    expect(r.sobraram).toEqual([]);
  });

  it('o peso do recente: um dia ontem vale mais que dois dias há quase duas semanas; mais vezes, mais peso', () => {
    const posicoes = [posicao('p1', 'Rui Teixeira'), posicao('p2', 'Elis Furtado'), posicao('p3', 'Gil Moura')];
    const historico = [
      pegou('2026-11-15', 'Rui Teixeira', 'Mundo Animal'),
      pegou('2026-11-14', 'Rui Teixeira', 'Mundo Animal'),
      pegou('2026-11-26', 'Elis Furtado', 'Mundo Animal'),
      // várias claquetes da mesma atração no mesmo dia contam uma vez só
      pegou('2026-11-16', 'Gil Moura', 'Mundo Animal'),
      pegou('2026-11-16', 'Gil Moura', 'MUNDO ANIMAL'),
      pegou('2026-11-16', 'Gil Moura', 'Mundo Animal'),
    ];
    expect(quem(distribuir({ posicoes, itens: [item('c1', 'Mundo Animal 30/11 (P)')], historico }))).toEqual(['Mundo Animal 30/11 (P) → Elis Furtado (pegou a atração em 26/11)']);
    // dois dias seguidos ganham de um dia só, mesmo que o outro seja um pouco mais recente
    const maisVezes = [pegou('2026-11-24', 'Rui Teixeira', 'Mundo Animal'), pegou('2026-11-23', 'Rui Teixeira', 'Mundo Animal'), pegou('2026-11-25', 'Elis Furtado', 'Mundo Animal')];
    expect(quem(distribuir({ posicoes, itens: [item('c1', 'Mundo Animal 30/11 (P)')], historico: maisVezes }))).toEqual(['Mundo Animal 30/11 (P) → Rui Teixeira (pegou a atração em 24/11)']);
  });

  it('só os 14 dias antes do dia contam: o de 15 dias antes, o próprio dia e os depois não', () => {
    const r = distribuir({
      posicoes: [posicao('p1', 'Rui Teixeira', ['COMUNICAÇÃO']), posicao('p2', 'Elis Furtado')],
      itens: [item('c1', 'Mundo Animal 30/11 (P)')],
      historico: [pegou('2026-11-12', 'Rui Teixeira', 'Mundo Animal'), pegou('2026-11-27', 'Rui Teixeira', 'Mundo Animal'), pegou('2026-11-28', 'Rui Teixeira', 'Mundo Animal')],
    });
    expect(quem(r)).toEqual(['Mundo Animal 30/11 (P) → Elis Furtado (menos demandas)']);
    // o de 14 dias antes ainda conta
    expect(quem(distribuir({ posicoes: r.posicoes.map((p) => ({ ...p, demandas: p.id === 'p1' ? p.demandas : [] })), itens: [item('c2', 'Mundo Animal 30/11 (P)')], historico: [pegou('2026-11-13', 'Rui Teixeira', 'Mundo Animal')] }))).toEqual([
      'Mundo Animal 30/11 (P) → Rui Teixeira (pegou a atração em 13/11)',
    ]);
  });

  it('a carga: sem histórico, vai para quem tem menos demandas, contando o que a própria distribuição vai pondo', () => {
    const r = distribuir({
      posicoes: [posicao('p1', 'Rui Teixeira', ['Noite de Gala 27/11 (DP)', 'COMUNICAÇÃO']), posicao('p2', 'Elis Furtado', ['Mundo Animal 30/11 (P)', '']), posicao('p3', 'Gil Moura')],
      itens: [item('c1', 'Terra Viva 28/11 (A)'), item('c2', 'Cozinha Mágica 28/11 (P)'), item('c3', 'Sala de Estar 29/11 (C)')],
    });
    // a linha vazia não conta; o Gil começa sem nada, recebe a primeira e empata com a Elis
    expect(quem(r)).toEqual(['Terra Viva 28/11 (A) → Gil Moura (menos demandas)', 'Cozinha Mágica 28/11 (P) → Elis Furtado (sorteio)', 'Sala de Estar 29/11 (C) → Gil Moura (menos demandas)']);
  });

  it('o empate na continuidade vai para a carga', () => {
    const r = distribuir({
      posicoes: [posicao('p1', 'Rui Teixeira', ['COMUNICAÇÃO']), posicao('p2', 'Elis Furtado'), posicao('p3', 'Gil Moura')],
      itens: [item('c1', 'Mundo Animal 30/11 (P)')],
      historico: [pegou('2026-11-25', 'Rui Teixeira', 'Mundo Animal'), pegou('2026-11-25', 'Elis Furtado', 'Mundo Animal')],
    });
    expect(quem(r)).toEqual(['Mundo Animal 30/11 (P) → Elis Furtado (pegou a atração em 25/11 · menos demandas)']);
  });

  it('o sorteio decide o que ainda empata, pelo gerador que o teste fixa', () => {
    const posicoes = [posicao('p1', 'Rui Teixeira'), posicao('p2', 'Elis Furtado'), posicao('p3', 'Gil Moura')];
    const itens = [item('c1', 'Terra Viva 28/11 (A)')];
    expect(quem(distribuir({ posicoes, itens, sortear: () => 0 }))).toEqual(['Terra Viva 28/11 (A) → Rui Teixeira (sorteio)']);
    expect(quem(distribuir({ posicoes, itens, sortear: () => 0.5 }))).toEqual(['Terra Viva 28/11 (A) → Elis Furtado (sorteio)']);
    expect(quem(distribuir({ posicoes, itens, sortear: () => 0.99 }))).toEqual(['Terra Viva 28/11 (A) → Gil Moura (sorteio)']);
  });

  it('fora e sem escala nunca recebem; nem a vaga; o editor da continuidade que está fora passa para a carga', () => {
    const r = distribuir({
      posicoes: [posicao('p1', 'Rui Teixeira'), posicao('p2', 'Élis Furtado'), posicao('p3', ''), posicao('p4', 'Gil Moura', ['COMUNICAÇÃO'])],
      itens: [item('c1', 'Mundo Animal 30/11 (P)'), item('c2', 'Terra Viva 28/11 (A)')],
      // a Ana está sem escala (não está em nenhuma posição); a Elis, escalada, está fora no dia
      historico: [pegou('2026-11-26', 'Elis Furtado', 'Mundo Animal'), pegou('2026-11-26', 'Ana Prado', 'Terra Viva')],
      fora: ['elis furtado'],
    });
    expect(quem(r)).toEqual(['Mundo Animal 30/11 (P) → Rui Teixeira (menos demandas)', 'Terra Viva 28/11 (A) → Rui Teixeira (sorteio)']);
    expect(r.posicoes.find((p) => p.id === 'p2')?.demandas).toEqual([]);
    expect(r.posicoes.find((p) => p.id === 'p3')?.demandas).toEqual([]);
  });

  it('o editor com duas posições recebe na que tem menos demandas, e a carga é a das duas', () => {
    const r = distribuir({
      posicoes: [posicao('p1', 'Rui Teixeira', ['COMUNICAÇÃO'], 'manha'), posicao('p2', 'Rui Teixeira', [], 'noite'), posicao('p3', 'Elis Furtado', ['CALHAUS'])],
      itens: [item('c1', 'Mundo Animal 30/11 (P)')],
      historico: [pegou('2026-11-26', 'Rui Teixeira', 'Mundo Animal')],
    });
    expect(r.distribuidas).toMatchObject([{ id: 'c1', posicao: 'p2', editor: 'Rui Teixeira' }]);
  });

  it('com uma pessoa só escalada, tudo vai para ela; a distribuída guarda de quem era', () => {
    const r = distribuir({ posicoes: [posicao('p1', 'Rui Teixeira')], itens: [item('c1', 'Terra Viva 28/11 (A)', 'Elis Furtado')] });
    expect(r.distribuidas).toEqual([{ id: 'c1', texto: 'Terra Viva 28/11 (A)', deQuem: 'Elis Furtado', posicao: 'p1', editor: 'Rui Teixeira', motivo: 'a única pessoa escalada' }]);
  });

  it('sem ninguém escalado (só vagas, ou todos fora), nada muda e tudo sobra', () => {
    const itens = [item('c1', 'Terra Viva 28/11 (A)')];
    const posicoes = [posicao('p1', ''), posicao('p2', 'Rui Teixeira')];
    for (const r of [distribuir({ posicoes: [posicao('p1', '')], itens }), distribuir({ posicoes, itens, fora: ['Rui Teixeira'] }), distribuir({ itens })]) {
      expect(r.distribuidas).toEqual([]);
      expect(r.sobraram).toEqual(itens);
    }
    expect(distribuir({ posicoes, itens, fora: ['Rui Teixeira'] }).posicoes).toEqual(posicoes);
  });

  it('não muda as posições recebidas', () => {
    const posicoes = [posicao('p1', 'Rui Teixeira')];
    const copia = structuredClone(posicoes);
    distribuir({ posicoes, itens: [item('c1', 'Terra Viva 28/11 (A)')] });
    expect(posicoes).toEqual(copia);
  });
});
