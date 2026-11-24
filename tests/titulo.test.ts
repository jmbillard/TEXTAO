// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { chaveDoTitulo } from '../servidor/titulo.mjs';

/* A chave do título de filme sem artigos: a mesma regra da conferência do fluxo de filmes no n8n. */
describe('chave do título sem artigos', () => {
  it('o mesmo filme escrito de jeitos diferentes dá a mesma chave', () => {
    expect(chaveDoTitulo('Kong: Ilha da Caveira')).toBe(chaveDoTitulo('Kong - A Ilha da Caveira'));
    expect(chaveDoTitulo('O Esquadrão Suicida')).toBe(chaveDoTitulo('Esquadrão Suicida'));
    expect(chaveDoTitulo('Tomb Raider: A Origem')).toBe(chaveDoTitulo('TOMB RAIDER - ORIGEM'));
  });

  it('tira acento, pontuação e os artigos (também o "The")', () => {
    expect(chaveDoTitulo('Kong - A Ilha da Caveira')).toBe('KONGILHADACAVEIRA');
    expect(chaveDoTitulo('Os 33')).toBe('33');
    expect(chaveDoTitulo('The Batman')).toBe('BATMAN');
    expect(chaveDoTitulo('Aprendiz de Espiã: Na Cidade Eterna')).toBe('APRENDIZDEESPIANACIDADEETERNA');
  });

  it('artigo só sai como palavra inteira', () => {
    expect(chaveDoTitulo('Avatar')).toBe('AVATAR');
    expect(chaveDoTitulo('Uma Nova Chance')).toBe('NOVACHANCE');
    expect(chaveDoTitulo('Umas e Outras')).toBe('EOUTRAS');
  });

  it('"&" vale "E", e o sufixo de episódios sai', () => {
    expect(chaveDoTitulo('Elsa & Fred')).toBe(chaveDoTitulo('Elsa e Fred'));
    expect(chaveDoTitulo('Detetives do Prédio Azul - Episódio 3')).toBe('DETETIVESDOPREDIOAZUL');
  });

  it('título vazio dá chave vazia', () => {
    expect(chaveDoTitulo('')).toBe('');
    expect(chaveDoTitulo(undefined)).toBe('');
  });
});
