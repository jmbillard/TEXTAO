import { describe, expect, it } from 'vitest';
import { juntarAPublicada } from '../src/modelo/pautaPublicada';
import { linhaDaPauta, type LinhaDaPauta } from '../src/modelo/pauta';
import type { PosicaoDaEscala } from '../src/modelo/escala';

/* A Pauta da edição com o dia publicado no PROMeiro (#127). Até a virada (#134), a pauta do Teable continua valendo:
   as linhas dela ficam todas. Do dia publicado no PROMeiro entra só o que o Teable ainda não tem naquele dia: a mesma
   claquete (sem olhar a grafia nem as versões) ou a mesma tarefa do mesmo editor aparece uma vez só, a do Teable.
   Nomes e claquetes fictícios; 27/11/2026 é uma sexta. */

const SEXTA = '2026-11-27';
const SABADO = '2026-11-28';
const sp = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();
/** Uma linha do Teable, já lida como a Pauta lê. */
const doTeable = (id: string, claquete: string, editor: string, dia: string, inicio: string, fim: string, anotacao = false) =>
  linhaDaPauta({ id, claquete, editor: { title: editor }, data: sp(dia, '00:00'), expediente_inicio: sp(dia, inicio), expediente_fim: sp(fim < inicio ? '2026-11-28' : dia, fim), anotacao }) as LinhaDaPauta;
const pos = (id: string, turno: PosicaoDaEscala['turno'], editor: string, horario: string, demandas: string[]): PosicaoDaEscala => ({ id, turno, editor, ilha: '', horario, demandas: demandas.map((texto, i) => ({ id: `${id}-d${i + 1}`, texto })) });
const resumo = (ls: LinhaDaPauta[]) => ls.map((l) => `${l.dia} ${l.editor || '—'} ${l.turno ? `${l.turno.inicio}-${l.turno.fim}` : 'sem turno'} ${l.tipo}: ${l.texto}`);

describe('juntarAPublicada: o Teable e o dia publicado no PROMeiro', () => {
  it('sem nada publicado, a pauta é a do Teable', () => {
    const teable = [doTeable('rec1', 'Noite de Gala 27/11 (DP)', 'Rui Teixeira', SEXTA, '22:00', '06:00')];
    expect(juntarAPublicada(teable, [])).toEqual(teable);
  });

  it('um dia que só o PROMeiro tem entra inteiro, uma linha por demanda, com o editor e o turno da posição', () => {
    const publicadas = [{ dia: SABADO, posicoes: [pos('p1', 'madrugada', 'Rui Teixeira', '22h às 6h', ['Noite de Gala 28/11 (DP)', 'COMUNICAÇÃO']), pos('p2', 'tarde', '', 'quando der', ['Mundo Animal 30/11 (P)']), pos('p3', 'manha', 'Gil Moura', '6h às 15h', [])] }];
    const linhas = juntarAPublicada([], publicadas);
    expect(resumo(linhas)).toEqual([
      '2026-11-28 Rui Teixeira 22:00-06:00 claquete: Noite de Gala 28/11 (DP)',
      '2026-11-28 Rui Teixeira 22:00-06:00 tarefa: COMUNICAÇÃO',
      // o horário que o PROMeiro não entendeu fica sem turno; a posição sem demanda não vira linha
      '2026-11-28 — sem turno claquete: Mundo Animal 30/11 (P)',
    ]);
    // a claquete com as versões lidas, como as do Teable; o id diz de onde veio
    expect(linhas[0].versoes.map((v) => v.codigo)).toEqual(['D', 'P']);
    expect(linhas[0].id).toBe('promeiro:p1-d1');
  });

  it('no dia que os dois têm, o Teable fica inteiro e do PROMeiro entra só o que falta, sem dobrar', () => {
    const teable = [
      doTeable('rec1', 'Noite de Gala(Prologo)27/11 Dp', 'Rui Teixeira', SEXTA, '22:00', '06:00'),
      doTeable('rec2', 'COMUNICAÇÃO', 'Rui Teixeira', SEXTA, '22:00', '06:00'),
      doTeable('rec3', 'REDATOR VEM ACOMPANHAR', 'Rui Teixeira', SEXTA, '22:00', '06:00', true),
      // só no Teable: continua
      doTeable('rec4', 'Corujão 28/11', 'Gil Moura', SEXTA, '06:00', '15:00'),
    ];
    const publicadas = [
      {
        dia: SEXTA,
        posicoes: [
          // a mesma claquete, com outra grafia e outra versão: uma vez só, a do Teable
          pos('p1', 'madrugada', 'Rui Teixeira', '22h às 6h', ['Noite de Gala (Prologo) 27/11 (D)', 'comunicação', 'Vale a Pena Rever 30/11 (P)']),
          // a mesma claquete com outro editor no PROMeiro: vale a do Teable, até a virada
          pos('p2', 'tarde', 'Elis Furtado', '14h às 22h53', ['Corujão 28/11', 'COMUNICAÇÃO']),
        ],
      },
    ];
    expect(resumo(juntarAPublicada(teable, publicadas))).toEqual([
      '2026-11-27 Rui Teixeira 22:00-06:00 claquete: Noite de Gala(Prologo)27/11 Dp',
      '2026-11-27 Rui Teixeira 22:00-06:00 tarefa: COMUNICAÇÃO',
      '2026-11-27 Rui Teixeira 22:00-06:00 aviso: REDATOR VEM ACOMPANHAR',
      '2026-11-27 Gil Moura 06:00-15:00 claquete: Corujão 28/11',
      // só no PROMeiro: entra
      '2026-11-27 Rui Teixeira 22:00-06:00 claquete: Vale a Pena Rever 30/11 (P)',
      // a tarefa é de cada editor: a COMUNICAÇÃO da Elis não é a do Rui
      '2026-11-27 Elis Furtado 14:00-22:53 tarefa: COMUNICAÇÃO',
    ]);
  });

  it('a claquete de um dia não apaga a mesma claquete em outro dia', () => {
    const teable = [doTeable('rec1', 'Corujão 28/11', 'Gil Moura', SEXTA, '06:00', '15:00')];
    const linhas = juntarAPublicada(teable, [{ dia: SABADO, posicoes: [pos('p1', 'manha', 'Gil Moura', '6h às 15h', ['Corujão 28/11'])] }]);
    expect(resumo(linhas)).toEqual(['2026-11-27 Gil Moura 06:00-15:00 claquete: Corujão 28/11', '2026-11-28 Gil Moura 06:00-15:00 claquete: Corujão 28/11']);
  });
});
