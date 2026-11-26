import { afterEach, describe, expect, it, vi } from 'vitest';
import { enfeitesLigados, ligarEnfeites, temaDaData } from '../src/ui/regrasDosEnfeites';

/* Os enfeites de fim de ano da tela inicial: qual vale em cada instante, sempre pelo relógio de Brasília (UTC−3). */

const brasilia = (dataHora: string) => new Date(`${dataHora}-03:00`);

describe('o tema de cada data', () => {
  it('fora de dezembro e da virada não há enfeite', () => {
    expect(temaDaData(brasilia('2026-11-26T10:00:00'))).toBeNull();
    expect(temaDaData(brasilia('2027-03-15T10:00:00'))).toBeNull();
  });
  it('o Natal começa à meia-noite do 1º de dezembro em Brasília', () => {
    expect(temaDaData(brasilia('2026-11-30T23:59:59'))).toBeNull();
    expect(temaDaData(brasilia('2026-12-01T00:00:00'))).toEqual({ tema: 'natal' });
    // às 2h de 1º de dezembro em Londres ainda é 30 de novembro em Brasília
    expect(temaDaData(new Date('2026-12-01T02:00:00Z'))).toBeNull();
  });
  it('o Natal vai até o fim do dia 25; o Ano Novo começa no 26', () => {
    expect(temaDaData(brasilia('2026-12-10T15:00:00'))).toEqual({ tema: 'natal' });
    expect(temaDaData(brasilia('2026-12-25T23:59:59'))).toEqual({ tema: 'natal' });
    expect(temaDaData(brasilia('2026-12-26T00:00:00'))).toEqual({ tema: 'ano-novo' });
    expect(temaDaData(brasilia('2026-12-30T22:00:00'))).toEqual({ tema: 'ano-novo' });
  });
  it('no dia 31, o ano que vem e quanto falta para a meia-noite de Brasília', () => {
    expect(temaDaData(brasilia('2026-12-31T10:12:00'))).toEqual({ tema: 'ano-novo', anoNovo: 2027, faltam: { horas: 13, minutos: 48 } });
    expect(temaDaData(brasilia('2026-12-31T00:00:00'))).toEqual({ tema: 'ano-novo', anoNovo: 2027, faltam: { horas: 24, minutos: 0 } });
    // o minuto começado conta inteiro: nunca "0h00" antes da virada
    expect(temaDaData(brasilia('2026-12-31T23:59:30'))).toEqual({ tema: 'ano-novo', anoNovo: 2027, faltam: { horas: 0, minutos: 1 } });
  });
  it('à meia-noite de Brasília vira: o dia 1º mostra o ano novo, sem contagem', () => {
    // às 2h de 1º de janeiro em Londres ainda falta uma hora em Brasília
    expect(temaDaData(new Date('2027-01-01T02:00:00Z'))).toEqual({ tema: 'ano-novo', anoNovo: 2027, faltam: { horas: 1, minutos: 0 } });
    expect(temaDaData(brasilia('2027-01-01T00:00:00'))).toEqual({ tema: 'ano-novo', anoNovo: 2027 });
    expect(temaDaData(brasilia('2027-01-01T23:59:59'))).toEqual({ tema: 'ano-novo', anoNovo: 2027 });
  });
  it('no dia 2 de janeiro tudo some', () => {
    expect(temaDaData(brasilia('2027-01-02T00:00:00'))).toBeNull();
  });
  it('o ano vem da data, não fica preso a 2027', () => {
    expect(temaDaData(brasilia('2030-12-31T18:00:00'))).toEqual({ tema: 'ano-novo', anoNovo: 2031, faltam: { horas: 6, minutos: 0 } });
    expect(temaDaData(brasilia('2031-01-01T09:00:00'))).toEqual({ tema: 'ano-novo', anoNovo: 2031 });
  });
});

describe('a escolha de desligar os enfeites', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });
  it('vem ligada; desligada no perfil, fica desligada depois de recarregar', () => {
    expect(enfeitesLigados()).toBe(true);
    ligarEnfeites(false);
    expect(enfeitesLigados()).toBe(false);
    ligarEnfeites(true);
    expect(enfeitesLigados()).toBe(true);
  });
  it('sem armazenamento no navegador, os enfeites ficam ligados e desligar não quebra', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(enfeitesLigados()).toBe(true);
    expect(() => ligarEnfeites(false)).not.toThrow();
  });
});
