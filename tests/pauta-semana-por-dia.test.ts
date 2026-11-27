import { describe, expect, it } from 'vitest';
import { colunasDaSemana, escolhaDaPauta, type LinhaDaPauta } from '../src/modelo/pauta';

/* A Semana com um dia por coluna (#98): em cada dia, os cards agrupados pelo período em que o turno começa (manhã,
   tarde, noite, madrugada), na ordem do dia da pauta (que começa às 6h); dentro do período, cada editor pela hora de
   entrada. E a escolha lembrada: sem escolha (ou com uma que não vale), a Semana editor × dia e o Dia empilhado. */

let n = 0;
const linha = (dia: string, editor: string, inicio: string | null, texto = `Claquete ${++n} 30/11`, tipo: LinhaDaPauta['tipo'] = 'claquete'): LinhaDaPauta => ({
  id: `rec${++n}`,
  dia,
  editor,
  tipo,
  texto,
  turno: inicio ? { inicio, fim: '' } : null,
  versoes: [],
  semVersao: texto,
});

describe('a Semana com um dia por coluna', () => {
  const SEG = '2026-11-23';
  const TER = '2026-11-24';
  const linhas = [
    linha(SEG, 'Nina Noite', '22:00'),
    linha(SEG, 'Mário Madrugada', '01:30'),
    linha(SEG, 'Teo Tarde', '12:00'),
    linha(SEG, 'Ana Manhã', '06:00'),
    linha(SEG, 'Bia Manhã', '11:59'),
    linha(SEG, 'Ana Manhã', '06:00', 'RECADO', 'aviso'),
    linha(SEG, 'Teo Tarde', '12:00', 'COMUNICAÇÃO', 'tarefa'),
    linha(SEG, '', '08:00', 'CALHAUS', 'tarefa'),
    linha(SEG, 'Sem Hora', null),
    linha(TER, 'Teo Tarde', '18:00'),
  ];
  const colunas = colunasDaSemana({ dias: [SEG, TER, '2026-11-25'], linhas });

  it('um dia por coluna, na ordem da semana, mesmo o dia sem pauta', () => {
    expect(colunas.map((c) => c.dia)).toEqual([SEG, TER, '2026-11-25']);
    expect(colunas[2].turnos).toEqual([]);
  });

  it('os editores agrupados pelo período em que o turno começa, de manhã à madrugada; sem editor no fim do período e sem horário no fim do dia', () => {
    const seg = colunas[0];
    expect(seg.turnos.map((t) => [t.periodo, t.editores.map((e) => e.editor)])).toEqual([
      ['manha', ['Ana Manhã', 'Bia Manhã', '']],
      ['tarde', ['Teo Tarde']],
      ['noite', ['Nina Noite']],
      ['madrugada', ['Mário Madrugada']],
      ['sem-horario', ['Sem Hora']],
    ]);
    // às 18h já é noite
    expect(colunas[1].turnos.map((t) => t.periodo)).toEqual(['noite']);
  });

  it('o aviso fica à parte, preso ao editor; a tarefa é card; a conta do dia é de editores e claquetes', () => {
    const ana = colunas[0].turnos[0].editores[0];
    expect(ana.itens).toHaveLength(1);
    expect(ana.avisos.map((a) => a.texto)).toEqual(['RECADO']);
    expect(colunas[0].turnos[1].editores[0].itens.map((l) => l.tipo)).toEqual(['claquete', 'tarefa']);
    expect(colunas[0]).toMatchObject({ editores: 6, claquetes: 6 });
  });
});

describe('a escolha lembrada da pauta', () => {
  it('sem escolha, a Semana editor × dia e o Dia empilhado', () => {
    expect(escolhaDaPauta(undefined)).toEqual({ visao: 'semana', semana: 'editor-dia', dia: 'empilhado' });
    expect(escolhaDaPauta({ 'pauta.visao': 'mes', 'pauta.arranjo.dia': 'dia-por-coluna' })).toEqual({ visao: 'semana', semana: 'editor-dia', dia: 'empilhado' });
  });

  it('a escolha de cada parte vale sozinha', () => {
    expect(escolhaDaPauta({ 'pauta.visao': 'dia', 'pauta.arranjo.semana': 'dia-por-coluna' })).toEqual({ visao: 'dia', semana: 'dia-por-coluna', dia: 'empilhado' });
    expect(escolhaDaPauta({ 'pauta.arranjo.dia': 'por-hora' })).toEqual({ visao: 'semana', semana: 'editor-dia', dia: 'por-hora' });
  });
});
