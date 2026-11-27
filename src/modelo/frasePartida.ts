/* A frase partida em duas linhas (a planilha da edição, #133; a info da pauta, #172): a planilha não diz onde a frase
   acaba, então é um palpite pelas pontas das duas linhas. A mesma regra para o colar da planilha e para a pauta. */
import { nomeComparavel } from './ligarPeloNome.ts';

/** As palavras que deixam a frase pela metade (a linha de baixo continua a frase). */
export const PARADAS = new Set(['A', 'O', 'AS', 'OS', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'QUE', 'PARA', 'COM', 'EM', 'NA', 'NO', 'POR', 'SEGUNDO', 'QUAIS', 'QUAL', 'SEM', 'AO', 'AOS']);

/** A linha de baixo continua a de cima: a de cima termina em vírgula ou numa palavra que pede continuação, ou a de baixo
    começa por uma; ou (`umaLinha`) a de cima é uma linha só, comprida, e a de baixo tem mais de uma palavra. */
export function continua(cima: string, baixo: string, umaLinha: boolean): boolean {
  if (/[.!?]$/.test(cima)) return false;
  const pc = nomeComparavel(cima).split(' ');
  const pb = nomeComparavel(baixo).split(' ');
  return /[,;:\-–]$/.test(cima) || PARADAS.has(pc.at(-1) ?? '') || PARADAS.has(pb[0] ?? '') || (umaLinha && pc.length >= 4 && pb.length >= 2);
}
