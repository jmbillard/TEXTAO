import { describe, expect, it } from 'vitest';
import { diasDoRepetir, opcoesDoRepetir, repetirODia } from '../src/modelo/repetir';
import type { Ausencia } from '../src/modelo/ausencias';
import type { PosicaoDaEscala } from '../src/modelo/escala';

/* Montar a pauta, Repetir (#129): copiar para outro dia a escala de um dia; nunca as claquetes, que mudam todo dia, nem
   as tarefas, que saíram da Pauta (#199). Quem está fora no dia de destino vira vaga, com o motivo. Nomes e claquetes fictícios. A semana de
   23/11/2026 começa numa segunda: 27/11 é sexta; a semana passada começa em 16/11. */

const SEXTA_PASSADA = '2026-11-20';
const SEXTA = '2026-11-27';

const ORIGEM: PosicaoDaEscala[] = [
  {
    id: 'p-1',
    turno: 'madrugada',
    editor: 'Rui Teixeira',
    ilha: 'ilha-46',
    horario: '22h às 6h',
    demandas: [
      { id: 'd-1', texto: 'Noite de Gala 20/11 (DP)' },
      { id: 'd-2', texto: 'COMUNICAÇÃO' },
    ],
    avisos: [{ id: 'a-1', texto: 'chegar mais cedo' }],
  },
  { id: 'p-2', turno: 'tarde', editor: 'Elis Furtado', ilha: 'ilha-7', horario: '14h às 22h53', demandas: [{ id: 'd-3', texto: 'CALHAUS' }, { id: 'd-4', texto: 'Mundo Animal 21/11 (P)' }], avisos: [] },
  { id: 'p-3', turno: 'noite', editor: '', ilha: '', horario: '20h às 2h', demandas: [], avisos: [], vaga: 'Gil Moura está de folga' },
];
const ferias = (editor: string, de: string, ate: string): Ausencia => ({ id: `aus-${editor}`, editor, tipo: 'ferias', de, ate, observacao: 'particular' });

/** Um gerador de ids previsível, para o teste. */
const contador = () => {
  let n = 0;
  return (prefixo: string) => `${prefixo}-novo-${++n}`;
};

describe('repetirODia: a escala, nunca as claquetes nem as tarefas', () => {
  it('copia a ilha, o editor e o horário; deixa as claquetes, as tarefas (#199) e os avisos de fora', () => {
    const { posicoes, vagas } = repetirODia(ORIGEM, SEXTA, [], contador());
    expect(posicoes.map((p) => [p.turno, p.editor, p.ilha, p.horario, p.demandas.map((d) => d.texto)])).toEqual([
      ['madrugada', 'Rui Teixeira', 'ilha-46', '22h às 6h', []],
      ['tarde', 'Elis Furtado', 'ilha-7', '14h às 22h53', []],
      ['noite', '', '', '20h às 2h', []],
    ]);
    expect(posicoes.every((p) => p.avisos.length === 0)).toBe(true);
    expect(vagas).toEqual([]);
  });

  it('as posições ganham ids novos (as do dia de origem continuam lá)', () => {
    const { posicoes } = repetirODia(ORIGEM, SEXTA, [], contador());
    const ids = posicoes.flatMap((p) => [p.id, ...p.demandas.map((d) => d.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const velho of ['p-1', 'p-2', 'p-3', 'd-2', 'd-3']) expect(ids).not.toContain(velho);
  });

  it('a vaga do dia de origem não leva o motivo de lá (ele era daquele dia)', () => {
    const { posicoes } = repetirODia(ORIGEM, SEXTA, [], contador());
    expect(posicoes[2].vaga).toBeUndefined();
  });

  it('quem está fora no dia de destino vira vaga, com o motivo; a ilha e o horário ficam', () => {
    const { posicoes, vagas } = repetirODia(ORIGEM, SEXTA, [ferias('elis  furtado', '2026-11-25', '2026-12-04')], contador());
    expect(posicoes[1]).toMatchObject({ turno: 'tarde', editor: '', ilha: 'ilha-7', horario: '14h às 22h53', vaga: 'Elis Furtado está de férias até 4/12' });
    expect(posicoes[1].demandas).toEqual([]);
    expect(posicoes[0].editor).toBe('Rui Teixeira');
    expect(vagas).toEqual([{ editor: 'Elis Furtado', motivo: 'férias até 4/12' }]);
  });

  it('a ausência que não cobre o dia de destino não tira ninguém', () => {
    const { posicoes, vagas } = repetirODia(ORIGEM, SEXTA, [ferias('Elis Furtado', '2026-11-16', '2026-11-26'), { ...ferias('Rui Teixeira', SEXTA, SEXTA), tipo: 'folga', de: '2026-11-28', ate: '2026-11-28' }], contador());
    expect(posicoes.map((p) => p.editor)).toEqual(['Rui Teixeira', 'Elis Furtado', '']);
    expect(vagas).toEqual([]);
  });

  it('a folga de um dia só diz só o tipo', () => {
    const { posicoes } = repetirODia(ORIGEM, SEXTA, [{ ...ferias('Rui Teixeira', SEXTA, SEXTA), tipo: 'folga' }], contador());
    expect(posicoes[0].vaga).toBe('Rui Teixeira está de folga');
  });

  it('a ilha que não vale mais (saiu do cadastro) fica de fora; o resto da posição vem', () => {
    const { posicoes } = repetirODia(ORIGEM, SEXTA, [], contador(), { ilhaVale: (id) => id === 'ilha-46' });
    expect(posicoes.map((p) => p.ilha)).toEqual(['ilha-46', '', '']);
    expect(posicoes[1].editor).toBe('Elis Furtado');
  });
});

describe('diasDoRepetir: de onde vem e para onde vai', () => {
  const SEMANA = [
    { dia: '2026-11-23', estado: 'rascunho' as const },
    { dia: '2026-11-24', estado: 'vazio' as const },
    { dia: '2026-11-25', estado: 'publicado' as const },
    { dia: '2026-11-26', estado: 'vazio' as const },
    { dia: SEXTA, estado: 'vazio' as const },
    { dia: '2026-11-28', estado: 'alterado' as const },
    { dia: '2026-11-29', estado: 'vazio' as const },
  ];

  it('o mesmo dia na semana passada e o de ontem', () => {
    expect(diasDoRepetir(SEXTA, 'semana-passada', SEMANA)).toEqual([{ origem: SEXTA_PASSADA, destino: SEXTA }]);
    expect(diasDoRepetir(SEXTA, 'ontem', SEMANA)).toEqual([{ origem: '2026-11-26', destino: SEXTA }]);
    // na segunda, ontem é o domingo da semana anterior
    expect(diasDoRepetir('2026-11-23', 'ontem', SEMANA)).toEqual([{ origem: '2026-11-22', destino: '2026-11-23' }]);
  });

  it('a semana passada inteira só preenche os dias vazios, cada um com o mesmo dia da semana passada', () => {
    expect(diasDoRepetir(SEXTA, 'semana-inteira', SEMANA)).toEqual([
      { origem: '2026-11-17', destino: '2026-11-24' },
      { origem: '2026-11-19', destino: '2026-11-26' },
      { origem: SEXTA_PASSADA, destino: SEXTA },
      { origem: '2026-11-22', destino: '2026-11-29' },
    ]);
  });
});

describe('opcoesDoRepetir: as três opções do dia vazio, com quantas posições cada uma traz', () => {
  const SEMANA = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', SEXTA, '2026-11-28', '2026-11-29'].map((dia) => ({ dia, estado: dia === '2026-11-26' ? ('rascunho' as const) : ('vazio' as const) }));
  const NA_SEMANA_PASSADA: Record<string, number> = { '2026-11-16': 6, [SEXTA_PASSADA]: 5, '2026-11-26': 4 };
  const quantas = (dia: string) => NA_SEMANA_PASSADA[dia] ?? 0;

  it('diz o dia de origem e quantas posições ele tem; a semana inteira, só os vazios que têm o que trazer', () => {
    expect(opcoesDoRepetir(SEXTA, SEMANA, quantas)).toEqual({
      semanaPassada: { origem: SEXTA_PASSADA, posicoes: 5 },
      ontem: { origem: '2026-11-26', posicoes: 4 },
      semanaInteira: [
        { origem: '2026-11-16', destino: '2026-11-23' },
        { origem: SEXTA_PASSADA, destino: SEXTA },
      ],
    });
  });

  it('sem nada montado na origem, a opção diz zero', () => {
    expect(opcoesDoRepetir('2026-11-28', SEMANA, quantas)).toMatchObject({ semanaPassada: { origem: '2026-11-21', posicoes: 0 }, ontem: { origem: SEXTA, posicoes: 0 } });
  });
});
