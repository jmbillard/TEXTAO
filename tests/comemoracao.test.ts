import { describe, expect, it } from 'vitest';
import { festaDoSemCadastro, linhaDoTotal, montarTiras } from '../src/ui/regrasDaComemoracao';

/* A comemoração do Sem cadastro zerado: as regras puras. Claquetes e keys inventadas. */

const linha = (key: string, ...exemplos: string[]) => ({ key, exemplos });

describe('quando a comemoração dispara', () => {
  it('a key cadastrada era a última linha: dispara, com os exemplos dela como tiras destacadas', () => {
    expect(festaDoSemCadastro([linha('ROTA SABOR', 'Rota do Sabor 20/11', 'RIO ROTA SABOR(TEASER)')], ['ROTA SABOR'])).toEqual({
      destacadas: ['Rota do Sabor 20/11', 'RIO ROTA SABOR(TEASER)'],
    });
  });
  it('ainda sobra alguma linha: não dispara', () => {
    expect(festaDoSemCadastro([linha('ROTA SABOR', 'Rota do Sabor 20/11'), linha('UPFRONT', 'UPFRONT 2/12')], ['ROTA SABOR'])).toBeNull();
  });
  it('uma atração com duas keys leva as duas últimas linhas de uma vez: dispara, com os exemplos das duas', () => {
    expect(festaDoSemCadastro([linha('ROTA SABOR', 'Rota do Sabor 20/11'), linha('ROTA DO SABOR', 'ROTA DO SABOR 1/12')], ['ROTA SABOR', 'ROTA DO SABOR'])).toEqual({
      destacadas: ['Rota do Sabor 20/11', 'ROTA DO SABOR 1/12'],
    });
  });
  it('a lista já estava vazia (abrir a aba já vazia, ou nada saiu): não dispara', () => {
    expect(festaDoSemCadastro([], ['ROTA SABOR'])).toBeNull();
    expect(festaDoSemCadastro([linha('UPFRONT', 'UPFRONT 2/12')], [])).toBeNull();
  });
});

describe('as tiras do confete', () => {
  it('as destacadas vêm primeiro; as comuns depois, na ordem da amostra', () => {
    expect(montarTiras(['Rota do Sabor 20/11'], ['CHEF 25/12-2', 'Festa na Praça 12/12 SP'])).toEqual([
      { texto: 'Rota do Sabor 20/11', destacada: true },
      { texto: 'CHEF 25/12-2', destacada: false },
      { texto: 'Festa na Praça 12/12 SP', destacada: false },
    ]);
  });
  it('não repete: a claquete destacada que também está na amostra vem uma vez só, destacada', () => {
    expect(montarTiras(['Rota do Sabor 20/11', ' Rota do Sabor 20/11'], ['Rota do Sabor 20/11 ', 'CHEF 25/12-2', 'CHEF 25/12-2', ''])).toEqual([
      { texto: 'Rota do Sabor 20/11', destacada: true },
      { texto: 'CHEF 25/12-2', destacada: false },
    ]);
  });
  it('para no limite, cortando as comuns antes das destacadas', () => {
    const comuns = Array.from({ length: 30 }, (_, i) => `CHEF ${i + 1}/12`);
    const tiras = montarTiras(['Rota do Sabor 20/11', 'RIO ROTA SABOR(TEASER)'], comuns, 5);
    expect(tiras.map((t) => t.texto)).toEqual(['Rota do Sabor 20/11', 'RIO ROTA SABOR(TEASER)', 'CHEF 1/12', 'CHEF 2/12', 'CHEF 3/12']);
    expect(montarTiras(['A 1/12', 'B 1/12', 'C 1/12'], comuns, 2).map((t) => t.texto)).toEqual(['A 1/12', 'B 1/12']);
  });
  it('a amostra vazia: só as destacadas', () => {
    expect(montarTiras(['Rota do Sabor 20/11'], [])).toEqual([{ texto: 'Rota do Sabor 20/11', destacada: true }]);
  });
});

describe('a linha do número', () => {
  const junto = (l: { antes: string; numero: string; depois: string }) => `${l.antes}[${l.numero}]${l.depois}`;
  it('no plural', () => {
    expect(junto(linhaDoTotal(142))).toBe('As [142] claquetes dos últimos 90 dias têm atração.');
  });
  it('no singular', () => {
    expect(junto(linhaDoTotal(1))).toBe('A [1] claquete dos últimos 90 dias tem atração.');
  });
  it('o milhar com ponto', () => {
    expect(junto(linhaDoTotal(1234))).toBe('As [1.234] claquetes dos últimos 90 dias têm atração.');
  });
  it('nenhuma claquete nos últimos 90 dias', () => {
    expect(junto(linhaDoTotal(0))).toBe('[Nenhuma] claquete nos últimos 90 dias.');
  });
});
