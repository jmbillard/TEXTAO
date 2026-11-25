import { describe, expect, it } from 'vitest';
import { acentuar } from '../src/modelo/acento';
import { linhaDoRascunho, nomeDaAtracaoNova } from '../src/ui/Cadastros';

/* "+ Nova atração" no "Ligar a…": o nome que a atração nova já traz preenchido. */
describe('nome da atração nova', () => {
  it('com a busca vazia, usa a key em caixa de título', () => {
    expect(nomeDaAtracaoNova('', 'SUMMER BEATS')).toBe('Summer Beats');
  });

  it('com a busca só de espaços, vale como vazia', () => {
    expect(nomeDaAtracaoNova('   ', 'SUMMER BEATS')).toBe('Summer Beats');
  });

  it('com texto na busca, usa o texto digitado', () => {
    expect(nomeDaAtracaoNova('  Verão Sem Fim ', 'SUMMER BEATS')).toBe('Verão Sem Fim');
  });

  it('com a busca vazia, prefere a claquete que dá a mesma key: o nome sai com acento', () => {
    expect(nomeDaAtracaoNova('', 'TELAO OKTOBERFEST', ['OUTRA COISA 10/11', 'Telão Oktoberfest 19/11 Rede'])).toBe('Telão Oktoberfest');
  });

  it('com a key encurtada, a claquete não serve inteira, mas empresta a grafia da palavra', () => {
    expect(nomeDaAtracaoNova('', 'BAILAO', ['Bailão Oktoberfest 19/11'])).toBe('Bailão');
  });
});

/* O nome sugerido sai com acento: a grafia que já existe, senão o dicionário e as terminações; sem certeza, sem acento. */
describe('acento no nome da atração nova', () => {
  it('FESTA NA PRACA vira Festa na Praça', () => {
    expect(nomeDaAtracaoNova('', 'FESTA NA PRACA')).toBe('Festa na Praça');
  });

  it('CORACAO vira Coração', () => {
    expect(nomeDaAtracaoNova('', 'CORACAO')).toBe('Coração');
  });

  it('acha a grafia numa claquete acentuada da linha', () => {
    expect(nomeDaAtracaoNova('', 'NOITE DO FORRO', ['FORRÓ DE OUTRA COISA 19/11'])).toBe('Noite do Forró');
  });

  it('acha a grafia no nome de uma atração já cadastrada', () => {
    expect(nomeDaAtracaoNova('', 'ARRAIA DA ESTACAO', [], ['Arraiá Junino'])).toBe('Arraiá da Estação');
  });

  it('com o texto da busca, não mexe no que foi digitado', () => {
    expect(nomeDaAtracaoNova('Festa na Praca', 'FESTA NA PRACA')).toBe('Festa na Praca');
  });
});

describe('acentuar', () => {
  it('sigla (toda em maiúsculas) não muda, mesmo com a palavra no dicionário', () => {
    expect(acentuar('Especial SAO', [])).toBe('Especial SAO');
    expect(nomeDaAtracaoNova('', 'ESPECIAL CNA', ['Especial CNA 10/11'])).toBe('Especial CNA');
  });

  it('palavra desconhecida não muda', () => {
    expect(acentuar('Baile do Zumbaco')).toBe('Baile do Zumbaco');
  });

  it('palavra curta e ambígua não muda: "pais" pode ser país ou pais', () => {
    expect(acentuar('Dia dos Pais')).toBe('Dia dos Pais');
    expect(acentuar('Cao e Gato')).toBe('Cao e Gato');
  });

  it('terminações seguras: -ção, -ções, -são, -ência, -ância', () => {
    expect(acentuar('Animacao das Estacoes')).toBe('Animação das Estações');
    expect(acentuar('Televisao da Infancia na Ciencia')).toBe('Televisão da Infância na Ciência');
  });

  it('falcão e calção: -lcao fica sem acento', () => {
    expect(acentuar('Falcao')).toBe('Falcao');
  });

  it('duas grafias diferentes nas referências: nenhuma vale', () => {
    expect(acentuar('Baiao', ['Baião 10/11', 'Baiâo 11/11'])).toBe('Baiao');
  });

  it('mantém a caixa da palavra', () => {
    expect(acentuar('FESTA NA praca', ['Praça Nova'])).toBe('FESTA NA praça');
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
