import { describe, expect, it } from 'vitest';
import { artesDoTexto } from '../src/modelo/trecho';
import type { NoJSON } from '../src/modelo/tipos';

/* A lista de artes ao lado do texto (#187): numeradas, sem repetir (sem caixa, acento e pontuação), contando a arte
   marcada no meio da frase e o trecho inteiro do tipo arte. */

const arte = (texto: string, id: string): NoJSON => ({ type: 'text', text: texto, marks: [{ type: 'arte', attrs: { id, subtipo: '' } }] });
const txt = (texto: string): NoJSON => ({ type: 'text', text: texto });
const par = (content: NoJSON[], attrs?: Record<string, unknown>): NoJSON => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content });

describe('a lista de artes do texto', () => {
  it('a arte no meio da frase entra, e a repetida (outra caixa, acento ou pontuação) conta uma vez', () => {
    const doc: NoJSON = {
      type: 'doc',
      content: [
        par([txt('NESTE DOMINGO, '), arte('OITO CHURRASQUEIROS', 'a1'), txt(' DISPUTAM O TÍTULO NO '), arte('BRASA BRASIL', 'a2'), txt('.')]),
        par([txt('Tião Brasa, de Goiânia: Ninguém me tira daqui.')]),
        par([txt('E OS '), arte('Oito churrasqueiros!', 'a3'), txt(' VOLTAM '), arte('DOMINGÃO', 'a4')]),
        par([arte('domingao', 'a5')]),
      ],
    };
    expect(artesDoTexto(doc)).toEqual([
      { ordem: 1, texto: 'OITO CHURRASQUEIROS', vezes: 2 },
      { ordem: 2, texto: 'BRASA BRASIL', vezes: 1 },
      { ordem: 3, texto: 'DOMINGÃO', vezes: 2 },
    ]);
  });

  it('o trecho inteiro do tipo arte é uma arte, mesmo sem a marca, e também nas colunas', () => {
    const doc: NoJSON = {
      type: 'doc',
      content: [
        par([txt('Cartela: HOJE, 22H')], { tipo: 'arte', confirmado: true }),
        par([txt('HOJE TEM '), arte('Brasa Brasil', 'a1')]),
        par([txt('BRASA BRASIL')], { tipo: 'arte', confirmado: false }),
        { type: 'linha', content: [{ type: 'celula', content: [par([arte('PUDIM DA CIDA', 'a2')])] }, { type: 'celula', content: [par([txt('A RECEITA')])] }] },
        par([txt('   ')], { tipo: 'arte', confirmado: true }),
      ],
    };
    expect(artesDoTexto(doc)).toEqual([
      { ordem: 1, texto: 'Cartela: HOJE, 22H', vezes: 1 },
      { ordem: 2, texto: 'Brasa Brasil', vezes: 2 },
      { ordem: 3, texto: 'PUDIM DA CIDA', vezes: 1 },
    ]);
  });

  it('a arte partida em pedaços (uma etiqueta no meio) é uma só', () => {
    const doc: NoJSON = {
      type: 'doc',
      content: [par([arte('OITO ', 'a1'), { type: 'text', text: 'CHURRASQUEIROS', marks: [{ type: 'arte', attrs: { id: 'a1' } }, { type: 'etiqueta', attrs: { id: 'e1', tipo: 'cortavel' } }] }])],
    };
    expect(artesDoTexto(doc)).toEqual([{ ordem: 1, texto: 'OITO CHURRASQUEIROS', vezes: 1 }]);
  });
});
