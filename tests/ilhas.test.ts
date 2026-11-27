import { describe, expect, it } from 'vitest';
import { ilhasDeCostume, ilhasOcupadas, ilhasQueCasam, ilhasRepetidas, mesmaIlha, reconhecerIlha, salaDaIlha, salaPeloId, type Ilha } from '../src/modelo/ilhas';
import { conferirTurnos, turnosArrumados, turnosDaConfiguracao, turnosDoDia } from '../src/modelo/turnos';

/* Montar a pauta: ilhas e turnos (#124), as regras puras. Ilhas e nomes fictícios. */

const ILHAS: Ilha[] = [
  { id: 'a46', tipo: 'AVID', numero: '46', nome: '' },
  { id: 'i46', tipo: 'ILHA', numero: '46', nome: '' },
  { id: 'v7', tipo: 'VDI', numero: '7', nome: 'Sala da esquina' },
  { id: 'a12', tipo: 'AVID', numero: '12', nome: '' },
];

describe('mesmaIlha: AVID 46, ILHA 46 e só 46 são a mesma sala (#165)', () => {
  it.each([
    ['AVID 46', 'ILHA 46'],
    ['AVID 46', '46'],
    ['ILHA 46', '46'],
    ['Ilha 46', 'avid46'],
    ['AVID-046', ' 46 '],
    ['VDI 5', 'vdi5'],
    ['AVID 12B', 'ilha 12b'],
  ])('"%s" = "%s"', (a, b) => {
    expect(mesmaIlha(a, b)).toBe(true);
    expect(mesmaIlha(b, a)).toBe(true);
  });

  it.each([
    ['AVID 46', 'AVID 47'],
    ['46', '47'],
    ['VDI 5', 'AVID 5'],
    ['VDI 5', '5'],
    ['VDI 5', 'ILHA 5'],
    ['AVID 12', 'AVID 12B'],
  ])('"%s" ≠ "%s"', (a, b) => expect(mesmaIlha(a, b)).toBe(false));

  it('a VDI 5 é ela mesma: uma ilha comum, sem regra especial', () => {
    expect(salaDaIlha('VDI 5')).toBe('VDI 5');
    expect(salaDaIlha('Vdi 05')).toBe('VDI 5');
  });

  it('a ilha em branco é "sem ilha": não é a mesma de nenhuma, nem de outra em branco', () => {
    expect(salaDaIlha('')).toBe('');
    expect(salaDaIlha('  ')).toBe('');
    expect(mesmaIlha('', '')).toBe(false);
    expect(mesmaIlha('', '46')).toBe(false);
    expect(mesmaIlha('AVID 46', ' ')).toBe(false);
  });

  it('pelo id do cadastro: as duas do cadastro que são a mesma sala; a juntada vale pela que ficou; a que saiu é ela mesma', () => {
    const sala = salaPeloId(ILHAS, { velha: 'a46' });
    expect(sala('a46')).toBe(sala('i46'));
    expect(sala('velha')).toBe(sala('a46'));
    expect(sala('a46')).not.toBe(sala('a12'));
    expect(sala('saiu')).not.toBe(sala('a46'));
    expect(sala('saiu')).toBe(sala('saiu'));
    expect(sala('')).toBe('');
  });

  it('as ilhas repetidas do cadastro, para juntar: as que são a mesma sala, em ordem', () => {
    expect(ilhasRepetidas(ILHAS).map((g) => g.map((i) => i.id))).toEqual([['a46', 'i46']]);
    expect(ilhasRepetidas(ILHAS.filter((i) => i.id !== 'i46'))).toEqual([]);
  });
});

describe('reconhecerIlha: a ilha escrita de qualquer jeito', () => {
  it.each([
    ['AVID 46', 'a46'],
    ['avid46', 'a46'],
    ['ILHA 46', 'i46'],
    ['vdi 7', 'v7'],
    ['7', 'v7'],
    ['12', 'a12'],
    ['sala da esquina', 'v7'],
  ])('"%s" é %s', (escrito, id) => expect(reconhecerIlha(escrito, ILHAS)?.id).toBe(id));

  it('AVID 46 e ILHA 46 repetidas no cadastro são a mesma sala: o rótulo escrito decide, senão a primeira (#165)', () => {
    expect(reconhecerIlha('46', ILHAS)?.id).toBe('a46');
    expect(reconhecerIlha('Ilha 46', ILHAS)?.id).toBe('i46');
    expect(reconhecerIlha('ILHA 46', ILHAS.filter((i) => i.id !== 'i46'))?.id).toBe('a46');
    expect(reconhecerIlha('VDI 46', ILHAS)).toBeNull();
    expect(reconhecerIlha('AVID 7', ILHAS)).toBeNull();
    expect(reconhecerIlha('99', ILHAS)).toBeNull();
    expect(reconhecerIlha('', ILHAS)).toBeNull();
  });

  it('a lista casa pelo começo do rótulo, do número ou do nome, em ordem', () => {
    expect(ilhasQueCasam('', ILHAS).map((i) => i.id)).toEqual(['a12', 'a46', 'i46', 'v7']);
    expect(ilhasQueCasam('4', ILHAS).map((i) => i.id)).toEqual(['a46', 'i46']);
    expect(ilhasQueCasam('sala', ILHAS).map((i) => i.id)).toEqual(['v7']);
    // a mesma sala com outro tipo escrito (#165)
    const semIlha46 = ILHAS.filter((i) => i.id !== 'i46');
    expect(ilhasQueCasam('ilha 4', semIlha46).map((i) => i.id)).toEqual(['a46']);
    expect(ilhasQueCasam('vdi 4', semIlha46).map((i) => i.id)).toEqual([]);
  });
});

describe('ilhasDeCostume: a ilha que mais se repete no histórico', () => {
  it('pelo nome comparável; no empate, a mais recente; só as do cadastro', () => {
    const historico = [
      { dia: '2026-11-02', editor: 'Rui Teixeira', ilha: 'a46' },
      { dia: '2026-11-03', editor: 'RUI TEIXEIRA', ilha: 'a46' },
      { dia: '2026-11-04', editor: 'Rui Teixeira', ilha: 'v7' },
      { dia: '2026-11-02', editor: 'Elis Furtado', ilha: 'a12' },
      { dia: '2026-11-05', editor: 'Elis Furtado', ilha: 'v7' },
      { dia: '2026-11-05', editor: 'Gil Moura', ilha: 'saiu' },
      { dia: '2026-11-05', editor: '', ilha: 'a12' },
    ];
    expect(ilhasDeCostume(historico, new Set(['a46', 'a12', 'v7']))).toEqual({ 'RUI TEIXEIRA': 'a46', 'ELIS FURTADO': 'v7' });
  });

  it('a mesma sala com dois ids conta junto, e fica o id usado por último (#165)', () => {
    const historico = [
      { dia: '2026-11-02', editor: 'Rui Teixeira', ilha: 'a46' },
      { dia: '2026-11-03', editor: 'Rui Teixeira', ilha: 'v7' },
      { dia: '2026-11-04', editor: 'Rui Teixeira', ilha: 'v7' },
      { dia: '2026-11-05', editor: 'Rui Teixeira', ilha: 'i46' },
      { dia: '2026-11-06', editor: 'Rui Teixeira', ilha: '' },
    ];
    expect(ilhasDeCostume(historico)).toEqual({ 'RUI TEIXEIRA': 'v7' });
    expect(ilhasDeCostume(historico, undefined, salaPeloId(ILHAS))).toEqual({ 'RUI TEIXEIRA': 'i46' });
    expect(ilhasDeCostume([...historico, { dia: '2026-11-07', editor: 'Rui Teixeira', ilha: 'a46' }], undefined, salaPeloId(ILHAS))).toEqual({ 'RUI TEIXEIRA': 'a46' });
  });
});

describe('ilhasOcupadas: a mesma ilha no mesmo turno', () => {
  it('só no mesmo turno, e a ilha vazia não conta', () => {
    const posicoes = [
      { id: 'p1', turno: 'tarde', editor: 'Rui', ilha: 'a46' },
      { id: 'p2', turno: 'tarde', editor: 'Gil', ilha: 'a46' },
      { id: 'p3', turno: 'noite', editor: 'Elis', ilha: 'a46' },
      { id: 'p4', turno: 'tarde', editor: 'Bia', ilha: '' },
      { id: 'p5', turno: 'tarde', editor: 'Lia', ilha: '' },
    ];
    expect(ilhasOcupadas(posicoes)).toEqual([
      { posicao: 'p1', ilha: 'a46', com: ['p2'] },
      { posicao: 'p2', ilha: 'a46', com: ['p1'] },
    ]);
  });

  it('a AVID 46 e a ILHA 46 do cadastro são a mesma sala: ocupada (#165)', () => {
    const posicoes = [
      { id: 'p1', turno: 'tarde', editor: 'Rui', ilha: 'a46' },
      { id: 'p2', turno: 'tarde', editor: 'Gil', ilha: 'i46' },
      { id: 'p3', turno: 'tarde', editor: 'Elis', ilha: 'a12' },
    ];
    expect(ilhasOcupadas(posicoes)).toEqual([]);
    expect(ilhasOcupadas(posicoes, salaPeloId(ILHAS))).toEqual([
      { posicao: 'p1', ilha: 'a46', com: ['p2'] },
      { posicao: 'p2', ilha: 'i46', com: ['p1'] },
    ]);
  });
});

describe('os turnos da Configuração', () => {
  it('sem nada salvo, ou ilegível, os de fábrica', () => {
    expect(turnosDaConfiguracao({}).map((t) => t.id)).toEqual(['madrugada', 'manha', 'tarde', 'noite']);
    expect(turnosDaConfiguracao({ TURNOS: 'não é json' })).toHaveLength(4);
    expect(turnosDaConfiguracao({ TURNOS: '[]' })).toHaveLength(4);
  });

  it('o turno novo ganha o id do nome, sem repetir; o horário vai para o padrão', () => {
    expect(turnosArrumados([{ id: 'manha', nome: ' Manhã ', horario: '7 as 16' }, { nome: 'Plantão', horario: '10-19' }, { nome: 'Plantão!', horario: '' }])).toEqual([
      { id: 'manha', nome: 'Manhã', horario: '7h às 16h' },
      { id: 'plantao', nome: 'Plantão', horario: '10h às 19h' },
      { id: 'plantao-2', nome: 'Plantão!', horario: '' },
    ]);
  });

  it('a conferência: sem turno, sem horário; tirar um turno é só aviso', () => {
    expect(conferirTurnos([], turnosDaConfiguracao()).itens[0].detalhe).toBe('precisa de ao menos um turno.');
    expect(conferirTurnos([{ id: 'x', nome: 'Extra', horario: '' }], []).itens[0].detalhe).toBe('o turno Extra está sem horário.');
    const c = conferirTurnos(turnosDaConfiguracao().slice(0, 3), turnosDaConfiguracao());
    expect(c.ok).toBe(true);
    expect(c.itens.find((i) => i.tipo === 'aviso')?.detalhe).toBe('Noite sai da grade; os dias já montados continuam com as posições.');
  });

  it('o nome e a ordem mudam sem mudar o id', () => {
    const [m, ma, t, n] = turnosDaConfiguracao();
    expect(conferirTurnos([ma, { ...m, nome: 'Corujão' }, t, n], turnosDaConfiguracao()).muda).toEqual([
      { oque: 'Nome de Madrugada', antes: 'Madrugada', depois: 'Corujão' },
      { oque: 'Ordem', antes: 'Madrugada, Manhã, Tarde, Noite', depois: 'Manhã, Corujão, Tarde, Noite' },
    ]);
  });

  it('o turno que saiu da Configuração continua no dia que tem posição nele', () => {
    const [m, ma] = turnosDaConfiguracao();
    expect(turnosDoDia([m, ma], [{ turno: 'manha' }, { turno: 'noite' }, { turno: 'extra' }])).toEqual([
      m,
      ma,
      { id: 'noite', nome: 'Noite', horario: '' },
      { id: 'extra', nome: 'extra', horario: '' },
    ]);
  });
});
