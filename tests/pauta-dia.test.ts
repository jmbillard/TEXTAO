import { describe, expect, it } from 'vitest';
import { agoraNaRegua, diaDaPautaAgora, noArAgora } from '../src/modelo/pauta';

/* A régua do Dia da pauta (#97): das 6h às 6h do dia seguinte, em São Paulo. O turno que passa da meia-noite continua
   no ar na régua do dia em que começou; a linha do "agora" só aparece no dia da régua. */

const sp = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);
const noite = { inicio: '22:00', fim: '06:00' };
const tarde = { inicio: '14:00', fim: '22:53' };

describe('a régua do Dia', () => {
  it('o agora conta os minutos desde as 6h do dia; fora da régua, null', () => {
    expect(agoraNaRegua('2026-11-24', sp('2026-11-24', '06:00'))).toBe(0);
    expect(agoraNaRegua('2026-11-24', sp('2026-11-24', '21:30'))).toBe(15 * 60 + 30);
    // a madrugada ainda é da régua do dia anterior
    expect(agoraNaRegua('2026-11-24', sp('2026-11-25', '02:00'))).toBe(20 * 60);
    expect(agoraNaRegua('2026-11-24', sp('2026-11-24', '05:59'))).toBeNull();
    expect(agoraNaRegua('2026-11-24', sp('2026-11-25', '06:00'))).toBeNull();
  });

  it('no ar agora: entre o início e o fim do turno, na régua do dia em que ele começou', () => {
    expect(noArAgora('2026-11-24', tarde, sp('2026-11-24', '14:00'))).toBe(true);
    expect(noArAgora('2026-11-24', tarde, sp('2026-11-24', '22:53'))).toBe(false);
    expect(noArAgora('2026-11-24', tarde, sp('2026-11-24', '13:59'))).toBe(false);
    // o turno que passa da meia-noite
    expect(noArAgora('2026-11-24', noite, sp('2026-11-25', '03:00'))).toBe(true);
    expect(noArAgora('2026-11-25', noite, sp('2026-11-25', '03:00'))).toBe(false);
    // outro dia, ou sem turno
    expect(noArAgora('2026-11-23', tarde, sp('2026-11-24', '15:00'))).toBe(false);
    expect(noArAgora('2026-11-24', null, sp('2026-11-24', '15:00'))).toBe(false);
  });

  it('o dia da pauta de agora: antes das 6h, a madrugada ainda é do dia anterior', () => {
    expect(diaDaPautaAgora(sp('2026-11-25', '05:59'))).toBe('2026-11-24');
    expect(diaDaPautaAgora(sp('2026-11-25', '06:00'))).toBe('2026-11-25');
    expect(diaDaPautaAgora(sp('2026-11-25', '23:30'))).toBe('2026-11-25');
  });
});
