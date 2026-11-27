import { describe, expect, it } from 'vitest';
import { estadoDoDia, lerDemanda, lerHorario, situacaoNoDia, TURNOS_DE_FABRICA } from '../src/modelo/escala';

/* Montar a pauta (#123): as regras puras do rascunho do dia. O horário escrito de qualquer jeito vai para o padrão; a
   demanda é texto livre, e o PROMeiro diz o que entendeu (atração, data, versões e a grafia no padrão). Nomes e
   claquetes fictícios. A semana de 23/11/2026 começa numa segunda: 27/11 é sexta, 28/11 sábado. */

describe('lerHorario: qualquer grafia vai para o padrão', () => {
  it.each([
    ['22 as 6', '22h às 6h'],
    ['22H ÀS 06', '22h às 6h'],
    ['22h às 6h', '22h às 6h'],
    ['14h às 22h53', '14h às 22h53'],
    ['14H AS 22H53', '14h às 22h53'],
    ['8:30 - 17', '8h30 às 17h'],
    ['6h-15h', '6h às 15h'],
    ['08h até 17h', '8h às 17h'],
    ['das 20 às 2', '20h às 2h'],
    ['16h às 0h38', '16h às 0h38'],
    ['20 a 24', '20h às 0h'],
  ])('"%s" vira "%s"', (escrito, padrao) => {
    expect(lerHorario(escrito)).toMatchObject({ padrao });
  });

  it('guarda o início e o fim em horas, e diz quando vira o dia', () => {
    expect(lerHorario('22 as 6')).toEqual({ padrao: '22h às 6h', inicio: '22:00', fim: '06:00', minutos: 480, viraODia: true });
    expect(lerHorario('8:30 - 17')).toEqual({ padrao: '8h30 às 17h', inicio: '08:30', fim: '17:00', minutos: 510, viraODia: false });
  });

  it('vazio não é horário nem erro', () => {
    expect(lerHorario('  ')).toBeNull();
  });

  it('o que não é horário fica como está, com o motivo', () => {
    expect(lerHorario('de manhã')).toEqual({ erro: 'não entendi o horário' });
    expect(lerHorario('25 as 3')).toEqual({ erro: 'hora que não existe' });
    expect(lerHorario('8:75 às 17')).toEqual({ erro: 'hora que não existe' });
  });
});

describe('lerDemanda: o que o PROMeiro entendeu da linha', () => {
  it('a claquete: a atração, a data perto do dia e as versões como etiquetas', () => {
    expect(lerDemanda('Noite de Gala 28/11 (AH)', '2026-11-27')).toEqual({
      tipo: 'claquete',
      atracao: 'Noite de Gala',
      data: '2026-11-28',
      versoes: [
        { codigo: 'A', rotulo: 'amanhã', conhecida: true },
        { codigo: 'H', rotulo: 'hoje', conhecida: true },
      ],
      padrao: 'Noite de Gala 28/11 (AH)',
      mudou: false,
    });
  });

  it('a grafia no padrão, pela correção de grafia', () => {
    expect(lerDemanda('Noite de Gala 27/11 Dp', '2026-11-27')).toMatchObject({ tipo: 'claquete', padrao: 'Noite de Gala 27/11 (DP)', mudou: true });
    expect(lerDemanda('Festival 3/1 (MES)', '2026-12-20')).toMatchObject({ data: '2027-01-03', padrao: 'Festival 3/1 (M)', mudou: true });
  });

  it('a claquete sem data, mas com a versão, é claquete (sem data)', () => {
    expect(lerDemanda('Vale a Pena Rever (AH)', '2026-11-27')).toMatchObject({ tipo: 'claquete', atracao: 'Vale a Pena Rever', data: null, mudou: false });
  });

  it('o resto é tarefa, como está', () => {
    expect(lerDemanda('COMUNICAÇÃO', '2026-11-27')).toEqual({ tipo: 'tarefa', padrao: 'COMUNICAÇÃO', mudou: false });
  });

  it('a linha vazia', () => {
    expect(lerDemanda('   ', '2026-11-27')).toEqual({ tipo: 'vazia' });
  });
});

describe('situacaoNoDia: o editor na lista', () => {
  const posicoes = [
    { id: 'p1', turno: 'madrugada', editor: 'Rui Teixeira' },
    { id: 'p2', turno: 'tarde', editor: 'rui teixeira' },
    { id: 'p3', turno: 'manha', editor: 'Elis Furtado' },
  ];
  it('livre quando não está em nenhuma outra posição do dia', () => {
    expect(situacaoNoDia('Gil Moura', posicoes, 'p9')).toEqual({ tipo: 'livre' });
    expect(situacaoNoDia('Elis Furtado', posicoes, 'p3')).toEqual({ tipo: 'livre' });
  });
  it('já escalado em outro turno, pelo nome sem caixa nem acento', () => {
    expect(situacaoNoDia('Rui Teixeira', posicoes, 'p1')).toEqual({ tipo: 'escalado', turnos: ['tarde'] });
    expect(situacaoNoDia('Elis Furtado', posicoes, 'p9')).toEqual({ tipo: 'escalado', turnos: ['manha'] });
  });
});

describe('estadoDoDia e os turnos', () => {
  it('vazio sem posição; rascunho com alguma', () => {
    expect(estadoDoDia([])).toBe('vazio');
    expect(estadoDoDia([{ id: 'p1' }])).toBe('rascunho');
  });
  it('os quatro turnos de fábrica, com o horário padrão já no padrão', () => {
    expect(TURNOS_DE_FABRICA.map((t) => t.id)).toEqual(['madrugada', 'manha', 'tarde', 'noite']);
    for (const t of TURNOS_DE_FABRICA) expect(lerHorario(t.horario)).toMatchObject({ padrao: t.horario });
  });
});
