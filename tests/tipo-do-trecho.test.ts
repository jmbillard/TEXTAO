import { describe, expect, it } from 'vitest';
import { palpiteDoTipo, tipoDoTrecho } from '../src/modelo/trecho';
import type { NoJSON } from '../src/modelo/tipos';

/* O palpite do tipo do trecho pelo texto (#187): caixa alta é locução, "Nome, de onde:" é sonora, "TRILHA/BG" é
   trilha. Casos inventados, no jeito dos roteiros que chegam. */

describe('o palpite do tipo pelo texto', () => {
  it('caixa alta é locução', () => {
    expect(palpiteDoTipo('NESTE DOMINGO, O GRANDE ENCONTRO DOS OITO CHURRASQUEIROS!')).toBe('locucao');
  });

  it('"Nome, de onde:" é sonora, e também os formatos com timecode que a revisão já reconhece', () => {
    expect(palpiteDoTipo('Dona Cida, de Ribeirão Preto: Eu faço esse pudim desde menina.')).toBe('sonora');
    expect(palpiteDoTipo('Tião Brasa, churrasqueiro de Goiânia: O segredo é o sal grosso.')).toBe('sonora');
    expect(palpiteDoTipo('Débora: Vamos botar a sessentona pra jogo?')).toBe('sonora');
    expect(palpiteDoTipo('MC/BL02/10.53 – Pedro no tribunal: Eu não fiz nada!')).toBe('sonora');
    expect(palpiteDoTipo('00:01:36:16 MARIA LUZ: Ninguém me avisou.')).toBe('sonora');
  });

  it('"TRILHA" e "BG" no começo são trilha, mesmo em caixa alta', () => {
    expect(palpiteDoTipo('TRILHA SOBE: forró animado')).toBe('trilha');
    expect(palpiteDoTipo('BG: viola caipira baixinho')).toBe('trilha');
    expect(palpiteDoTipo('Trilha: sobe a música da abertura')).toBe('trilha');
    expect(palpiteDoTipo('SOBE SOM DA TORCIDA')).toBe('trilha');
    // no meio de uma frase comum, a palavra não faz do trecho uma trilha
    expect(palpiteDoTipo('Trilha sonora nova para a novela das nove.')).toBe('texto');
    expect(palpiteDoTipo('BGS DO BRASIL')).toBe('locucao');
  });

  it('"LOCAÇÃO:" ou "Cenário:" no começo é locação, mesmo em caixa alta', () => {
    expect(palpiteDoTipo('LOCAÇÃO: Cozinha do Brasa Brasil')).toBe('locacao');
    expect(palpiteDoTipo('Cenário: quintal da Dona Cida, fim de tarde')).toBe('locacao');
    expect(palpiteDoTipo('LOCACAO: ESTÚDIO 3')).toBe('locacao');
  });

  it('misturados: cada trecho no seu tipo, e o que não é nada é texto', () => {
    const roteiro = [
      'TRILHA: batucada',
      'LOC: Neste sábado, a disputa esquenta.',
      'NO BRASA BRASIL, HOJE ÀS 21:00 – NA TELA!',
      'Tião Brasa, de Goiânia: Ninguém vai me tirar daqui.',
      'Arte, cartão: OITO CHURRASQUEIROS',
      'LOCAÇÃO: Quintal da Dona Cida',
      'Imagens do Tião acendendo a churrasqueira.',
      '',
    ];
    expect(roteiro.map(palpiteDoTipo)).toEqual(['trilha', 'locucao', 'locucao', 'sonora', 'texto', 'locacao', 'texto', 'texto']);
  });
});

const par = (texto: string, attrs?: Record<string, unknown>, marks?: NoJSON['marks']): NoJSON => ({
  type: 'paragraph',
  ...(attrs ? { attrs } : {}),
  content: texto ? [{ type: 'text', text: texto, ...(marks ? { marks } : {}) }] : undefined,
});

describe('o tipo guardado no trecho', () => {
  it('o tipo guardado vale sobre o texto, confirmado ou ainda palpite', () => {
    expect(tipoDoTrecho(par('O QUINTAL DA DONA CIDA', { tipo: 'locacao', confirmado: true }))).toEqual({ tipo: 'locacao', confirmado: true });
    expect(tipoDoTrecho(par('Dona Cida conta a história.', { tipo: 'sonora', confirmado: false }))).toEqual({ tipo: 'sonora', confirmado: false });
  });

  it('o trecho de antes, sem tipo guardado, fica com o palpite pelo texto, não confirmado', () => {
    expect(tipoDoTrecho(par('HOJE, DEPOIS DA NOVELA'))).toEqual({ tipo: 'locucao', confirmado: false });
    expect(tipoDoTrecho(par('Imagens do quintal.', { tipo: null, confirmado: null }))).toEqual({ tipo: 'texto', confirmado: false });
    expect(tipoDoTrecho({ type: 'paragraph' })).toEqual({ tipo: 'texto', confirmado: false });
    // um tipo que não existe é como não ter tipo
    expect(tipoDoTrecho(par('HOJE', { tipo: 'vinheta', confirmado: true }))).toEqual({ tipo: 'locucao', confirmado: false });
  });

  it('sem tipo guardado, a arte ou a etiqueta no trecho inteiro dizem o tipo, como na revisão', () => {
    const arte = [{ type: 'arte', attrs: { id: 'a1', subtipo: 'cartao' } }];
    expect(tipoDoTrecho(par('OITO CHURRASQUEIROS', undefined, arte))).toEqual({ tipo: 'arte', confirmado: true });
    const etq = (tipo: string) => [{ type: 'etiqueta', attrs: { id: 'e1', tipo } }];
    expect(tipoDoTrecho(par('forró animado', undefined, etq('sonoplastia')))).toEqual({ tipo: 'trilha', confirmado: true });
    expect(tipoDoTrecho(par('abrir no fogo', undefined, etq('edicao')))).toEqual({ tipo: 'edicao', confirmado: true });
    expect(tipoDoTrecho(par('ler animado', undefined, etq('locutor')))).toEqual({ tipo: 'locutor', confirmado: true });
    expect(tipoDoTrecho(par('pedir a autorização', undefined, etq('producao')))).toEqual({ tipo: 'producao', confirmado: true });
    expect(tipoDoTrecho(par('ver com a direção', undefined, etq('comentario')))).toEqual({ tipo: 'comentario', confirmado: true });
    // a arte no meio da frase não muda o tipo do trecho
    const meio: NoJSON = { type: 'paragraph', content: [{ type: 'text', text: 'SÃO ' }, { type: 'text', text: 'OITO CHURRASQUEIROS', marks: arte }, { type: 'text', text: ' NA DISPUTA' }] };
    expect(tipoDoTrecho(meio)).toEqual({ tipo: 'locucao', confirmado: false });
    // o "pode cortar" não é tipo de trecho
    expect(tipoDoTrecho(par('E MAIS: O PUDIM DA DONA CIDA', undefined, etq('cortavel')))).toEqual({ tipo: 'locucao', confirmado: false });
  });
});
