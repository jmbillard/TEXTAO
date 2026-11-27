import { describe, expect, it } from 'vitest';
import { campanhaCombina, campanhaDoHash, hashDaCampanha, mexidaEscrita } from '../src/modelo/campanhas';

/* As peças puras da página da campanha e da lista (#180): a busca pelo nome (a mesma no servidor e na tela), o
   endereço próprio e o "mexida há…". */

describe('a página da campanha (#180)', () => {
  it('a busca pelo nome: todas as palavras, cada uma pelo começo, sem caixa, acento e pontuação', () => {
    expect(campanhaCombina('Lançamento Avenida Carona', 'LANCAMENTO avenida')).toBe(true);
    expect(campanhaCombina('Lançamento Avenida Carona', 'carona')).toBe(true);
    expect(campanhaCombina('Lançamento Avenida Carona', 'arona')).toBe(false);
    expect(campanhaCombina('AESP: Verão', 'aesp verao')).toBe(true);
    expect(campanhaCombina('Qualquer', '  ')).toBe(true);
  });

  it('o endereço da lista e o de cada campanha, ida e volta', () => {
    expect(campanhaDoHash('#/campanhas')).toEqual({});
    expect(campanhaDoHash('#/campanhas/')).toEqual({});
    const hash = hashDaCampanha('a b/c');
    expect(campanhaDoHash(hash)).toEqual({ id: 'a b/c' });
    expect(campanhaDoHash('#/designer/producoes')).toBeNull();
    expect(campanhaDoHash('#/campanhas/x/y')).toBeNull();
  });

  it('"mexida": agora há pouco, minutos, horas, ontem, dias e a data', () => {
    const agora = Date.parse('2026-11-27T18:00:00-03:00');
    const antes = (ms: number) => new Date(agora - ms).toISOString();
    expect(mexidaEscrita(antes(30_000), agora)).toBe('agora há pouco');
    expect(mexidaEscrita(antes(25 * 60_000), agora)).toBe('há 25 min');
    expect(mexidaEscrita(antes(5 * 3_600_000), agora)).toBe('há 5 h');
    expect(mexidaEscrita('2026-11-26T10:00:00-03:00', agora)).toBe('ontem');
    expect(mexidaEscrita('2026-11-22T10:00:00-03:00', agora)).toBe('há 5 dias');
    expect(mexidaEscrita('2026-10-12T10:00:00-03:00', agora)).toBe('em 12/10');
    expect(mexidaEscrita('não é data', agora)).toBe('');
  });
});
