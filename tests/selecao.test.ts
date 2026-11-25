import { describe, expect, it } from 'vitest';
import { ajustarSelecao } from '../src/editor/selecao';

/** O trecho que a seleção vira, como texto (null: o botão "Arte" não aparece). */
const trecho = (paragrafos: string[], de: [number, number], ate: [number, number]) => {
  const t = ajustarSelecao(paragrafos, { paragrafo: de[0], posicao: de[1] }, { paragrafo: ate[0], posicao: ate[1] });
  return t && paragrafos[t.paragrafo].slice(t.ini, t.fim);
};
const LOC = 'LOC: NESTE SÁBADO, O PALCO É DE QUEM CANTA.';
const em = (s: string, pedaco: string) => s.indexOf(pedaco);

describe('o ajuste da seleção do dedo (o botão "Arte" no celular)', () => {
  it('a palavra cortada na ponta entra inteira', () => {
    // "NESTE SÁB" → "NESTE SÁBADO"
    expect(trecho([LOC], [0, em(LOC, 'NESTE')], [0, em(LOC, 'ADO,')])).toBe('NESTE SÁBADO');
  });
  it('a palavra cortada no começo também', () => {
    // "STE SÁBADO" → "NESTE SÁBADO"; "ALC" (no meio da palavra) → "PALCO"
    expect(trecho([LOC], [0, em(LOC, 'STE')], [0, em(LOC, ',')])).toBe('NESTE SÁBADO');
    expect(trecho([LOC], [0, em(LOC, 'ALC')], [0, em(LOC, 'CO É')])).toBe('PALCO');
  });

  it('a pontuação e os espaços das pontas ficam de fora; a do meio fica', () => {
    // ": NESTE SÁBADO, " → "NESTE SÁBADO"
    expect(trecho([LOC], [0, em(LOC, ': N')], [0, em(LOC, 'O PALCO')])).toBe('NESTE SÁBADO');
    // até o fim do parágrafo: o ponto final sai, a vírgula do meio fica
    expect(trecho([LOC], [0, em(LOC, 'SÁBADO')], [0, LOC.length])).toBe('SÁBADO, O PALCO É DE QUEM CANTA');
    const fala = 'SONORA: jurada fictícia, "Quem chega aqui já ganhou alguma coisa."';
    expect(trecho([fala], [0, em(fala, '"Quem')], [0, fala.length])).toBe('Quem chega aqui já ganhou alguma coisa');
    expect(trecho(['(AO VIVO) — já!'], [0, 0], [0, 9])).toBe('AO VIVO');
    expect(trecho(['Veja… DOZE VOZES!?'], [0, 4], [0, 18])).toBe('DOZE VOZES');
  });

  it('a seleção vazia, só de espaços ou só de pontuação não oferece nada', () => {
    expect(trecho([LOC], [0, 10], [0, 10])).toBeNull();
    expect(trecho(['NESTE   SÁBADO'], [0, 6], [0, 8])).toBeNull();
    expect(trecho([LOC], [0, em(LOC, ', O')], [0, em(LOC, ', O') + 2])).toBeNull();
    expect(trecho([''], [0, 0], [0, 0])).toBeNull();
  });

  it('a seleção que atravessa parágrafos fica só no primeiro que tem texto dela', () => {
    const pars = [LOC, 'LOGO DO CANTA BRASIL', 'LOC: DOZE VOZES, UMA SÓ FINAL.'];
    // do meio do primeiro até o terceiro: do começo da seleção ao fim do primeiro, sem o ponto
    expect(trecho(pars, [0, em(LOC, 'QUEM')], [2, 9])).toBe('QUEM CANTA');
    // a alça do dedo caiu no fim do parágrafo de cima (no ponto final): o trecho é o do parágrafo seguinte
    const fim = trecho(pars, [0, LOC.length - 1], [1, 'LOGO DO CAN'.length]);
    expect(fim).toBe('LOGO DO CANTA');
    // nada em nenhum: nada
    expect(trecho(['FIM.', '', '  '], [0, 3], [2, 1])).toBeNull();
  });

  it('acentos e cedilha contam como letra, também com o acento separado (decomposto)', () => {
    expect(trecho(['ATRAÇÃO DE SÁBADO'], [0, 3], [0, 5])).toBe('ATRAÇÃO');
    const decomposto = 'E VOCE\u0302 DECIDE';
    expect(trecho([decomposto], [0, 3], [0, 6])).toBe('VOCE\u0302');
    expect(trecho(['Ñandú, pinguïm'], [0, 1], [0, 2])).toBe('Ñandú');
  });

  it('a palavra com hífen ou apóstrofo é uma palavra só', () => {
    expect(trecho(['SEJA BEM-VINDO AO SHOW'], [0, 'SEJA BEM-VI'.length], [0, 'SEJA BEM-VIN'.length])).toBe('BEM-VINDO');
    expect(trecho(["PINGO D'ÁGUA NO PALCO"], [0, "PINGO D'Á".length], [0, "PINGO D'ÁG".length])).toBe("D'ÁGUA");
    // o travessão entre espaços continua separando
    expect(trecho(['AO VIVO - HOJE'], [0, 3], [0, 5])).toBe('VIVO');
  });
});
