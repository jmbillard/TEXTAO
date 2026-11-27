import { describe, expect, it } from 'vitest';
import { ilhasDeCostume, ilhasOcupadas, ilhasQueCasam, reconhecerIlha, type Ilha } from '../src/modelo/ilhas';
import { conferirTurnos, turnosArrumados, turnosDaConfiguracao, turnosDoDia } from '../src/modelo/turnos';

/* Montar a pauta: ilhas e turnos (#124), as regras puras. Ilhas e nomes fictícios. */

const ILHAS: Ilha[] = [
  { id: 'a46', tipo: 'AVID', numero: '46', nome: '' },
  { id: 'i46', tipo: 'ILHA', numero: '46', nome: '' },
  { id: 'v7', tipo: 'VDI', numero: '7', nome: 'Sala da esquina' },
  { id: 'a12', tipo: 'AVID', numero: '12', nome: '' },
];

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

  it('AVID e ILHA com o mesmo número: só o número não decide', () => {
    expect(reconhecerIlha('46', ILHAS)).toBeNull();
    expect(reconhecerIlha('99', ILHAS)).toBeNull();
    expect(reconhecerIlha('', ILHAS)).toBeNull();
  });

  it('a lista casa pelo começo do rótulo, do número ou do nome, em ordem', () => {
    expect(ilhasQueCasam('', ILHAS).map((i) => i.id)).toEqual(['a12', 'a46', 'i46', 'v7']);
    expect(ilhasQueCasam('4', ILHAS).map((i) => i.id)).toEqual(['a46', 'i46']);
    expect(ilhasQueCasam('sala', ILHAS).map((i) => i.id)).toEqual(['v7']);
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
