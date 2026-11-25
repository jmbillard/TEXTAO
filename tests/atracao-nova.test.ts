import { describe, expect, it } from 'vitest';
import { nomeDaAtracaoNova } from '../src/ui/Cadastros';

/* "+ Nova atração" no "Ligar a…": o nome que a atração nova já traz preenchido. */
describe('nome da atração nova', () => {
  it('com a busca vazia, usa a key em caixa de título', () => {
    expect(nomeDaAtracaoNova('', 'SUMMER BEATS')).toBe('Summer Beats');
  });

  it('com a busca só de espaços, vale como vazia', () => {
    expect(nomeDaAtracaoNova('   ', 'FESTA NA PRACA')).toBe('Festa na Praca');
  });

  it('com texto na busca, usa o texto digitado', () => {
    expect(nomeDaAtracaoNova('  Verão Sem Fim ', 'SUMMER BEATS')).toBe('Verão Sem Fim');
  });

  it('com a busca vazia, prefere a claquete que dá a mesma key: o nome sai com acento', () => {
    expect(nomeDaAtracaoNova('', 'TELAO OKTOBERFEST', ['OUTRA COISA 10/11', 'Telão Oktoberfest 19/11 Rede'])).toBe('Telão Oktoberfest');
  });

  it('com a key encurtada, a claquete não serve e vale a key', () => {
    expect(nomeDaAtracaoNova('', 'TELAO', ['Telão Oktoberfest 19/11'])).toBe('Telao');
  });
});
