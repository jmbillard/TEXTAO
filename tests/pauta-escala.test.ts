import { describe, expect, it } from 'vitest';
import { escalaNaPauta, ilhaDaSemana, naEscala, foraPelaPlanilha } from '../src/modelo/escalaNaPauta';
import type { Ilha } from '../src/modelo/ilhas';
import type { TurnoDaEscala } from '../src/modelo/escala';

/* A escala na Pauta da edição (o mock-up aprovado: "06:00–15:00 · AVID 30 · manhã"): a ilha e o turno de cada editor
   no dia e o aviso de dois editores na mesma ilha, lidos da planilha (a foto que o n8n manda, #133) ou da escala
   publicada. A regra da ilha ocupada é a do Montar a pauta (ilhasOcupadas: o mesmo turno, a mesma sala). */

const ILHAS: Ilha[] = [
  { id: 'i30', tipo: 'AVID', numero: '30', nome: '' },
  { id: 'i30b', tipo: 'ILHA', numero: '30', nome: '' },
  { id: 'i22', tipo: 'AVID', numero: '22', nome: '' },
  { id: 'v5', tipo: 'VDI', numero: '5', nome: 'remota' },
];
const TURNOS: TurnoDaEscala[] = [
  { id: 'manha', nome: 'Manhã', horario: '6h às 15h' },
  { id: 'tarde', nome: 'Tarde', horario: '14h às 23h' },
];
let n = 0;
const pos = (editor: string, turno: string, ilha: string, horario = '6h às 15h') => ({ id: `p${++n}`, turno, editor, ilha, horario });

describe('a escala na Pauta', () => {
  it('dá a ilha (o rótulo do cadastro), o turno e o horário de cada editor no dia', () => {
    const e = escalaNaPauta([{ dia: '2026-11-27', posicoes: [pos('Ana Ribeiro', 'manha', 'i22'), pos('Bruno Teixeira', 'tarde', 'v5', '14h às 22h')] }], { ilhas: ILHAS, turnos: TURNOS });
    expect(e).toEqual([
      { dia: '2026-11-27', editor: 'Ana Ribeiro', ilha: 'AVID 22', turno: 'Manhã', horario: '6h às 15h', divide: [] },
      { dia: '2026-11-27', editor: 'Bruno Teixeira', ilha: 'VDI 5', turno: 'Tarde', horario: '14h às 22h', divide: [] },
    ]);
  });

  it('avisa quem divide a ilha no mesmo turno, pela sala (AVID 30 e ILHA 30 são a mesma); em turnos diferentes, não', () => {
    const e = escalaNaPauta(
      [{ dia: '2026-11-27', posicoes: [pos('Ana Ribeiro', 'manha', 'i30'), pos('Carla Duarte', 'manha', 'i30b', '7h às 16h'), pos('Bruno Teixeira', 'tarde', 'i30', '14h às 22h')] }],
      { ilhas: ILHAS, turnos: TURNOS },
    );
    expect(e.find((x) => x.editor === 'Ana Ribeiro')?.divide).toEqual([{ editor: 'Carla Duarte', horario: '7h às 16h' }]);
    expect(e.find((x) => x.editor === 'Carla Duarte')?.divide).toEqual([{ editor: 'Ana Ribeiro', horario: '6h às 15h' }]);
    expect(e.find((x) => x.editor === 'Bruno Teixeira')?.divide).toEqual([]);
  });

  it('a vaga (sem editor) fica de fora; a ilha em branco ou fora do cadastro é "sem ilha" e não divide nada', () => {
    const e = escalaNaPauta([{ dia: '2026-11-27', posicoes: [pos('', 'manha', 'i22'), pos('Ana Ribeiro', 'manha', ''), pos('Bruno Teixeira', 'manha', 'sumiu'), pos('Dora Lima', 'manha', '')] }], { ilhas: ILHAS, turnos: TURNOS });
    expect(e.map((x) => [x.editor, x.ilha, x.divide.length])).toEqual([
      ['Ana Ribeiro', '', 0],
      ['Bruno Teixeira', '', 0],
      ['Dora Lima', '', 0],
    ]);
  });

  it('um editor em duas posições no dia aparece uma vez, com a primeira', () => {
    const e = escalaNaPauta([{ dia: '2026-11-27', posicoes: [pos('Ana Ribeiro', 'manha', 'i22'), pos('ana ribeiro', 'tarde', 'i30', '14h às 22h')] }], { ilhas: ILHAS, turnos: TURNOS });
    expect(e).toHaveLength(1);
    expect(e[0].ilha).toBe('AVID 22');
  });

  it('o turno que não está na Configuração fica sem nome', () => {
    expect(escalaNaPauta([{ dia: '2026-11-27', posicoes: [pos('Ana Ribeiro', 'extra', 'i22')] }], { ilhas: ILHAS, turnos: TURNOS })[0].turno).toBe('');
  });
});

describe('achar o editor da pauta na escala', () => {
  const e = escalaNaPauta(
    [
      { dia: '2026-11-26', posicoes: [pos('Pedro Sales', 'manha', 'i22')] },
      { dia: '2026-11-27', posicoes: [pos('Pedro Sales', 'manha', 'i30'), pos('João Lúcio', 'manha', 'i22')] },
    ],
    { ilhas: ILHAS, turnos: TURNOS },
  );
  it('pelo dia e pelo nome sem caixa e acento; o "(sem ID)*" do Teable não atrapalha', () => {
    expect(naEscala(e, '2026-11-27', 'joao lucio')?.ilha).toBe('AVID 22');
    expect(naEscala(e, '2026-11-27', 'PEDRO SALES (sem ID)*')?.ilha).toBe('AVID 30');
    expect(naEscala(e, '2026-11-28', 'Pedro Sales')).toBeNull();
    expect(naEscala(e, '2026-11-27', '')).toBeNull();
  });
  it('a ilha da semana é a que mais se repete; no empate, a do dia mais recente; sem ilha, vazia', () => {
    const mais = escalaNaPauta(
      [
        { dia: '2026-11-25', posicoes: [pos('Pedro Sales', 'manha', 'i22')] },
        ...[{ dia: '2026-11-26', posicoes: [pos('Pedro Sales', 'manha', 'i22')] }],
        { dia: '2026-11-27', posicoes: [pos('Pedro Sales', 'manha', 'i30')] },
      ],
      { ilhas: ILHAS, turnos: TURNOS },
    );
    expect(ilhaDaSemana(mais, 'Pedro Sales')).toBe('AVID 22');
    expect(ilhaDaSemana(e, 'Pedro Sales')).toBe('AVID 30');
    expect(ilhaDaSemana(e, 'Ninguém')).toBe('');
  });
});

describe('quem está fora pela planilha', () => {
  it('entra com o dia, sem repetir quem o PROMeiro já tem fora no dia (pelo nome)', () => {
    const doPromeiro = [{ dia: '2026-11-27', editor: 'Elis Furtado', motivo: 'férias' }];
    expect(foraPelaPlanilha(doPromeiro, [{ dia: '2026-11-27', fora: ['elis furtado', 'Igor Matos'] }, { dia: '2026-11-28', fora: ['Elis Furtado'] }])).toEqual([
      { dia: '2026-11-27', editor: 'Elis Furtado', motivo: 'férias' },
      { dia: '2026-11-27', editor: 'Igor Matos' },
      { dia: '2026-11-28', editor: 'Elis Furtado' },
    ]);
  });
});
