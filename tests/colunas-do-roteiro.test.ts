import { describe, expect, it } from 'vitest';
import { colunaDoTipo } from '../src/modelo/trecho';

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
