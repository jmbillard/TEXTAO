import { describe, expect, it } from 'vitest';
import { linhaDoRascunho, nomeDaAtracaoNova } from '../src/ui/Cadastros';

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

/* Sem cadastro: a folha de rascunho da atração nova toma o lugar da linha da key que ela leva. */
describe('linha que a folha de rascunho cobre no Sem cadastro', () => {
  const lista = ['FESTA NA PRACA', 'SUMMER BEATS', 'TELAO'];

  it('cobre a linha da key que está no rascunho', () => {
    expect(linhaDoRascunho(lista, ['SUMMER BEATS'])).toBe(1);
  });

  it('compara como key: acento e caixa não importam', () => {
    expect(linhaDoRascunho(lista, ['Telão'])).toBe(2);
  });

  it('com várias keys, vale a primeira linha da lista que alguma delas acha', () => {
    expect(linhaDoRascunho(lista, ['TELAO', 'FESTA NA PRACA'])).toBe(0);
  });

  it('sem key da lista no rascunho, não cobre nenhuma (a folha entra no alto)', () => {
    expect(linhaDoRascunho(lista, ['VERAO SEM FIM'])).toBe(-1);
    expect(linhaDoRascunho(lista, [])).toBe(-1);
  });
});
