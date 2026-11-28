import { describe, expect, it } from 'vitest';
import { colunaDoTipo, gradeDasColunas, gruposDasColunas } from '../src/modelo/trecho';

/* As colunas do roteiro de TV (#187): cada tipo de trecho vai para o vídeo ou para o áudio, e a locação ocupa a linha
   inteira. É uma visão do mesmo documento. */

describe('a coluna de cada tipo de trecho', () => {
  it('arte, edição e produção no vídeo', () => {
    expect((['arte', 'edicao', 'producao'] as const).map(colunaDoTipo)).toEqual(['video', 'video', 'video']);
  });

  it('locução, sonora, trilha e para o locutor no áudio', () => {
    expect((['locucao', 'sonora', 'trilha', 'locutor'] as const).map(colunaDoTipo)).toEqual(['audio', 'audio', 'audio', 'audio']);
  });

  it('a locação na linha inteira, por cima das duas colunas', () => {
    expect(colunaDoTipo('locacao')).toBe('linha');
  });

  it('o texto sem tipo fica no áudio, com o que se lê; o comentário, no vídeo, com as notas', () => {
    expect(colunaDoTipo('texto')).toBe('audio');
    expect(colunaDoTipo('comentario')).toBe('video');
  });
});

/* Os grupos das colunas (#193): a mesma regra monta a grade na folha e a tabela do .docx. Um grupo junta o vídeo e o
   áudio que andam lado a lado; o vídeo que vem depois de um áudio abre um grupo novo, e a locação é uma linha só dela. */
describe('os grupos das colunas', () => {
  it('o vídeo e o áudio seguidos andam juntos; o vídeo depois do áudio abre outro grupo', () => {
    expect(gruposDasColunas(['edicao', 'trilha', 'locucao', 'arte', 'locucao'])).toEqual([
      { tipo: 'par', video: [0], audio: [1, 2] },
      { tipo: 'par', video: [3], audio: [4] },
    ]);
  });

  it('a locação fecha o grupo e ocupa a linha inteira', () => {
    expect(gruposDasColunas(['locacao', 'arte', 'arte', 'locucao', 'locacao', 'locucao'])).toEqual([
      { tipo: 'linha', trecho: 0 },
      { tipo: 'par', video: [1, 2], audio: [3] },
      { tipo: 'linha', trecho: 4 },
      { tipo: 'par', video: [], audio: [5] },
    ]);
  });

  it('o áudio sozinho e o vídeo sozinho são grupos com a outra coluna vazia', () => {
    expect(gruposDasColunas(['locucao', 'sonora'])).toEqual([{ tipo: 'par', video: [], audio: [0, 1] }]);
    expect(gruposDasColunas(['arte'])).toEqual([{ tipo: 'par', video: [0], audio: [] }]);
    expect(gruposDasColunas([])).toEqual([]);
  });
});

describe('a grade das colunas na folha', () => {
  it('cada trecho na linha e na coluna dele; o último da coluna mais curta estica até o fim do grupo', () => {
    const { lugares, vazios } = gradeDasColunas(['locacao', 'edicao', 'trilha', 'locucao', 'sonora', 'arte', 'locucao']);
    expect(lugares).toEqual([
      { linha: 1, coluna: 'linha', vao: 1, abre: true, fecha: true },
      { linha: 2, coluna: 'video', vao: 3, abre: true, fecha: true },
      { linha: 2, coluna: 'audio', vao: 1, abre: true, fecha: false },
      { linha: 3, coluna: 'audio', vao: 1, abre: false, fecha: false },
      { linha: 4, coluna: 'audio', vao: 1, abre: false, fecha: true },
      { linha: 5, coluna: 'video', vao: 1, abre: true, fecha: true },
      { linha: 5, coluna: 'audio', vao: 1, abre: true, fecha: true },
    ]);
    expect(vazios).toEqual([]);
  });

  it('a coluna sem trecho no grupo vira uma célula vazia, depois do último trecho do grupo', () => {
    const { lugares, vazios } = gradeDasColunas(['locucao', 'locucao', 'locacao', 'arte']);
    expect(lugares.map((l) => [l.linha, l.coluna, l.vao])).toEqual([
      [1, 'audio', 1],
      [2, 'audio', 1],
      [3, 'linha', 1],
      [4, 'video', 1],
    ]);
    expect(vazios).toEqual([
      { linha: 1, coluna: 'video', vao: 2, depoisDo: 1 },
      { linha: 4, coluna: 'audio', vao: 1, depoisDo: 3 },
    ]);
  });
});
