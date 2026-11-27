import { describe, expect, it } from 'vitest';
import { diaDaFoto, diferencasDaFoto, textoDaFoto } from '../src/modelo/fotoDaPlanilha';
import type { PosicaoDaEscala } from '../src/modelo/escala';

/* Montar a pauta, a semana lado a lado com a planilha (#133): a foto crua de uma aba da planilha da edição, que o n8n
   manda, vira o texto que o colar da planilha (#130) lê; o dia da foto sai da própria grade; e o dia montado no
   PROMeiro é comparado com o que a foto diz, posição por posição. Nomes e claquetes fictícios. */

const SEXTA = '2026-11-27';

const posicao = (p: Partial<PosicaoDaEscala> & Pick<PosicaoDaEscala, 'id' | 'turno' | 'editor'>): PosicaoDaEscala => ({
  ilha: '',
  horario: '',
  demandas: [],
  avisos: [],
  ...p,
});
const demandas = (...textos: string[]) => textos.map((texto, i) => ({ id: `d-${texto}-${i}`, texto }));

describe('textoDaFoto: a grade crua, como o colar da planilha lê', () => {
  it('uma linha por linha da grade, as células separadas por tab', () => {
    expect(textoDaFoto([['', 'AVID 22', '', 'ILHA 46'], [], ['', 'EDITOR: ', 'Rui']])).toBe('\tAVID 22\t\tILHA 46\n\n\tEDITOR: \tRui');
  });

  it('a quebra de linha e o tab de dentro da célula viram espaço (não abrem linha nem coluna nova)', () => {
    expect(textoDaFoto([['', 'Terra 25/11\n(AH)', 'a\tb']])).toBe('\tTerra 25/11 (AH)\ta b');
  });

  it('o que não é texto vira vazio', () => {
    expect(textoDaFoto([[null as unknown as string, 'x'], null as unknown as string[]])).toBe('\tx\n');
  });
});

describe('diaDaFoto: o dia da aba, lido da grade', () => {
  it('a primeira dd/mm/aaaa das primeiras linhas', () => {
    expect(diaDaFoto([['', 'L'], ['', 'SEXTA', '27/11/2026', '', 'ESTEIRA DE PÓS PRODUÇÃO']], null)).toBe(SEXTA);
  });

  it('sem data na grade, vale a pista do n8n, se for uma data de verdade', () => {
    expect(diaDaFoto([['', 'SEXTA']], '2026-11-27')).toBe(SEXTA);
    expect(diaDaFoto([['', 'SEXTA']], '2026-02-31')).toBeNull();
    expect(diaDaFoto([['', 'SEXTA']], 'amanhã')).toBeNull();
  });

  it('a data da grade vale mais que a pista; a que não existe não conta', () => {
    expect(diaDaFoto([['31/02/2026', '27/11/2026']], '2026-11-20')).toBe(SEXTA);
  });
});

describe('diferencasDaFoto: o dia montado e a foto, posição por posição', () => {
  const MONTADO: PosicaoDaEscala[] = [
    posicao({ id: 'p-1', turno: 'madrugada', editor: 'Rui Teixeira', ilha: 'ilha-46', horario: '22h às 6h', demandas: demandas('Noite de Gala 27/11 (DP)', 'COMUNICAÇÃO') }),
    posicao({ id: 'p-2', turno: 'tarde', editor: 'Elis Furtado', ilha: 'ilha-7', horario: '14h às 23h', demandas: demandas('Mundo Animal 30/11 (P)') }),
  ];

  it('a mesma escala dos dois lados: nenhuma diferença (o nome e a claquete sem caixa, acento e grafia)', () => {
    const foto = [
      posicao({ id: 'f-1', turno: 'madrugada', editor: 'RUI TEIXEIRA', ilha: 'ilha-46', horario: '22h às 6h', demandas: demandas('Noite de Gala 27/11 Dp', 'Comunicação') }),
      posicao({ id: 'f-2', turno: 'tarde', editor: 'Elis Furtado', ilha: 'ilha-7', horario: '14h às 23h', demandas: demandas('Mundo Animal 30/11 (P)') }),
    ];
    expect(diferencasDaFoto(MONTADO, foto, { dia: SEXTA })).toEqual({ posicoes: [], iguais: 2, fora: { soNoPromeiro: [], soNaPlanilha: [] } });
  });

  it('a mesma pessoa dos dois lados: o que difere, campo por campo', () => {
    const foto = [
      posicao({ id: 'f-1', turno: 'madrugada', editor: 'Rui Teixeira', ilha: 'ilha-22', horario: '22h às 5h', demandas: demandas('Noite de Gala 27/11 (DP)', 'Terra 28/11 (AH)'), avisos: [{ id: 'a', texto: 'SEM INTERVALO' }] }),
      posicao({ id: 'f-2', turno: 'tarde', editor: 'Elis Furtado', ilha: 'ilha-7', horario: '14h às 23h', demandas: demandas('Mundo Animal 30/11 (P)') }),
    ];
    const r = diferencasDaFoto(MONTADO, foto, { dia: SEXTA });
    expect(r.iguais).toBe(1);
    expect(r.posicoes).toEqual([
      {
        editor: 'Rui Teixeira',
        turno: 'madrugada',
        onde: 'nos-dois',
        campos: [
          { campo: 'ilha', promeiro: ['ilha-46'], planilha: ['ilha-22'] },
          { campo: 'horario', promeiro: ['22h às 6h'], planilha: ['22h às 5h'] },
          { campo: 'demandas', promeiro: ['COMUNICAÇÃO'], planilha: ['Terra 28/11 (AH)'] },
          { campo: 'avisos', promeiro: [], planilha: ['SEM INTERVALO'] },
        ],
      },
    ]);
  });

  it('a pessoa em outro turno é uma diferença de turno, não duas posições', () => {
    const foto = [MONTADO[0], posicao({ ...MONTADO[1], id: 'f-2', turno: 'noite' })];
    expect(diferencasDaFoto(MONTADO, foto, { dia: SEXTA }).posicoes).toEqual([{ editor: 'Elis Furtado', turno: 'tarde', onde: 'nos-dois', campos: [{ campo: 'turno', promeiro: ['tarde'], planilha: ['noite'] }] }]);
  });

  it('a posição que só um lado tem; a vaga vazia que sobra não conta', () => {
    const foto = [MONTADO[0], posicao({ id: 'f-3', turno: 'noite', editor: 'Gil Moura', horario: '20h às 2h', demandas: demandas('CALHAUS') }), posicao({ id: 'f-4', turno: 'manha', editor: '' })];
    const montado = [...MONTADO, posicao({ id: 'p-9', turno: 'noite', editor: '', vaga: 'Ana está de folga' })];
    const r = diferencasDaFoto(montado, foto, { dia: SEXTA });
    expect(r.iguais).toBe(1);
    expect(r.posicoes.map((p) => [p.onde, p.editor, p.turno])).toEqual([
      ['so-no-promeiro', 'Elis Furtado', 'tarde'],
      ['so-na-planilha', 'Gil Moura', 'noite'],
    ]);
    expect(r.posicoes[1].campos).toEqual([
      { campo: 'horario', promeiro: [], planilha: ['20h às 2h'] },
      { campo: 'demandas', promeiro: [], planilha: ['CALHAUS'] },
    ]);
  });

  it('a vaga com demandas é casada pelo turno e pela ilha', () => {
    const montado = [posicao({ id: 'p-1', turno: 'tarde', editor: '', ilha: 'ilha-7', demandas: demandas('CALHAUS') })];
    const foto = [posicao({ id: 'f-1', turno: 'tarde', editor: '', ilha: 'ilha-7', demandas: demandas('CALHAUS', 'FINALIZAR') })];
    expect(diferencasDaFoto(montado, foto, { dia: SEXTA }).posicoes).toEqual([{ editor: '', turno: 'tarde', onde: 'nos-dois', campos: [{ campo: 'demandas', promeiro: [], planilha: ['FINALIZAR'] }] }]);
  });

  it('a AVID 46 e a ILHA 46 do cadastro são a mesma sala: não é diferença, e a vaga casa por ela (#165)', () => {
    const ilhas = [
      { id: 'ilha-46', tipo: 'AVID', numero: '46', nome: '' },
      { id: 'ilha-46b', tipo: 'ILHA', numero: '46', nome: '' },
      { id: 'ilha-7', tipo: 'VDI', numero: '7', nome: '' },
    ];
    const foto = [
      posicao({ id: 'f-1', turno: 'madrugada', editor: 'Rui Teixeira', ilha: 'ilha-46b', horario: '22h às 6h', demandas: demandas('Noite de Gala 27/11 (DP)', 'COMUNICAÇÃO') }),
      posicao({ id: 'f-2', turno: 'tarde', editor: 'Elis Furtado', ilha: 'ilha-7', horario: '14h às 23h', demandas: demandas('Mundo Animal 30/11 (P)') }),
    ];
    expect(diferencasDaFoto(MONTADO, foto, { dia: SEXTA }).posicoes.map((p) => p.campos.map((c) => c.campo))).toEqual([['ilha']]);
    expect(diferencasDaFoto(MONTADO, foto, { dia: SEXTA, ilhas }).posicoes).toEqual([]);
    const vagas = [posicao({ id: 'v-1', turno: 'tarde', editor: '', ilha: 'ilha-7', demandas: demandas('CALHAUS') }), posicao({ id: 'v-2', turno: 'tarde', editor: '', ilha: 'ilha-46', demandas: demandas('VINHETAS') })];
    const daFoto = [posicao({ id: 'f-1', turno: 'tarde', editor: '', ilha: 'ilha-46b', demandas: demandas('VINHETAS') }), posicao({ id: 'f-2', turno: 'tarde', editor: '', ilha: 'ilha-7', demandas: demandas('CALHAUS') })];
    expect(diferencasDaFoto(vagas, daFoto, { dia: SEXTA, ilhas })).toMatchObject({ posicoes: [], iguais: 2 });
  });

  it('quem está fora só de um lado', () => {
    const r = diferencasDaFoto(MONTADO, MONTADO, { dia: SEXTA, foraNoPromeiro: ['Gil Moura', 'Ana Lima'], foraNaPlanilha: ['GIL MOURA', 'Bia Souza'] });
    expect(r.fora).toEqual({ soNoPromeiro: ['Ana Lima'], soNaPlanilha: ['Bia Souza'] });
  });
});
