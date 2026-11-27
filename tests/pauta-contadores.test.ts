import { describe, expect, it } from 'vitest';
import { diaDoNumero, numeroDoDia, periodoDaPautaNaContagem } from '../src/ui/trocaDaPauta';

/* Os contadores da Pauta (#170): o seletor de datas conta como o da agenda (No Trello), pelas datas. Na Semana, o
   período é "16 a 22 de novembro" (o mês da esquerda só na virada); no Dia, "sexta, 27 de novembro", com o dia da
   semana do dia contado. */

const n = numeroDoDia;
const extenso = (p: ReturnType<typeof periodoDaPautaNaContagem>) => `${p.semana ? `${p.semana}, ` : ''}${p.semana ? '' : `${p.dia1}${p.mes1} a `}${p.dia2}${p.mes2}`;

describe('o seletor de datas da Pauta', () => {
  it('o número do dia vai e volta', () => {
    expect(diaDoNumero(n('2026-11-16'))).toBe('2026-11-16');
    expect(n('2026-11-23') - n('2026-11-16')).toBe(7);
  });

  it('a Semana parada: o período escrito, com o mês da esquerda só na virada', () => {
    const k = n('2026-11-16');
    expect(extenso(periodoDaPautaNaContagem('semana', k, k, 1))).toBe('16 a 22 de novembro');
    const v = n('2026-11-30');
    expect(extenso(periodoDaPautaNaContagem('semana', v, v, 1))).toBe('30 de novembro a 6 de dezembro');
  });

  it('a Semana contando: os dias passam pelas datas, sem pular o alvo nem um mês errado', () => {
    const de = n('2026-11-16');
    const para = n('2026-11-23');
    const dias = [0, 0.1, 0.3, 0.6, 1].map((p) => periodoDaPautaNaContagem('semana', de, para, p).dia1);
    expect(dias[0]).toBe(16);
    expect(dias.at(-1)).toBe(23);
    for (let i = 1; i < dias.length; i++) expect(dias[i]).toBeGreaterThanOrEqual(dias[i - 1]);
    // indo para a virada do mês, os meses ficam apagados (com os da partida) até o fim
    const virada = periodoDaPautaNaContagem('semana', para, n('2026-11-30'), 0.5);
    expect(virada).toMatchObject({ mesesApagados: true, mes1: '', mes2: ' de novembro' });
    expect(periodoDaPautaNaContagem('semana', para, n('2026-11-30'), 1)).toMatchObject({ dia1: 30, mes1: ' de novembro', dia2: 6, mes2: ' de dezembro', mesesApagados: false });
  });

  it('o Dia: o dia da semana por extenso acompanha o dia contado', () => {
    const k = n('2026-11-27');
    expect(extenso(periodoDaPautaNaContagem('dia', k, k, 1))).toBe('sexta, 27 de novembro');
    expect(extenso(periodoDaPautaNaContagem('dia', k, k + 1, 1))).toBe('sábado, 28 de novembro');
    expect(periodoDaPautaNaContagem('dia', k, k + 3, 0)).toMatchObject({ semana: 'sexta', dia2: 27 });
    // a virada do mês: o mês apaga enquanto conta, e o novo chega no fim
    expect(periodoDaPautaNaContagem('dia', n('2026-11-30'), n('2026-12-01'), 0.5)).toMatchObject({ mesesApagados: true, mes2: ' de novembro' });
    expect(extenso(periodoDaPautaNaContagem('dia', n('2026-11-30'), n('2026-12-01'), 1))).toBe('terça, 1 de dezembro');
  });
});
