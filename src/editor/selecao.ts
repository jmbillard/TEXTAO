/**
 * O ajuste da seleção do dedo, no celular: o trecho que o botão "Arte" marca. Regra pura, sobre o texto dos
 * parágrafos que a seleção toca (o TelaEditor traduz as posições do editor para cá e de volta).
 */

/** Um ponto da seleção: o parágrafo (na lista passada) e a posição dentro do texto dele. */
export interface PontoDaSelecao {
  paragrafo: number;
  posicao: number;
}

/** O trecho ajustado: num parágrafo só, de `ini` até `fim` (exclusivo) no texto dele. */
export interface TrechoAjustado {
  paragrafo: number;
  ini: number;
  fim: number;
}

const LETRA = /[\p{L}\p{N}\p{M}]/u;

/** O que liga duas partes de uma palavra só (BEM-VINDO, D'ÁGUA), quando fica entre letras. */
const LIGA = /[-‐'’]/;

/** Estende as pontas até as palavras inteiras. */
function inteirarPalavras(texto: string, ini: number, fim: number): [number, number] {
  const letraSo = (i: number) => i >= 0 && i < texto.length && LETRA.test(texto[i]);
  const letra = (i: number) => letraSo(i) || (LIGA.test(texto[i] ?? '') && letraSo(i - 1) && letraSo(i + 1));
  while (letra(ini - 1) && letra(ini)) ini--;
  while (letra(fim - 1) && letra(fim)) fim++;
  return [ini, fim];
}

/** O que sai das pontas: espaço e pontuação. Ficam os sinais que fazem parte da palavra (50%, #TBT, @perfil, P&G). */
const PONTA = /[\s\p{P}]/u;
const FICA = '%#@&';
const ehPonta = (c: string) => PONTA.test(c) && !FICA.includes(c);

/** A parte da seleção num parágrafo, ajustada: palavras inteiras, sem espaço nem pontuação nas pontas. */
function ajustarNoParagrafo(texto: string, de: number, ate: number): [number, number] | null {
  if (de >= ate) return null;
  let [ini, fim] = inteirarPalavras(texto, de, ate);
  while (ini < fim && ehPonta(texto[ini])) ini++;
  while (fim > ini && ehPonta(texto[fim - 1])) fim--;
  return fim > ini ? [ini, fim] : null;
}

/**
 * O trecho que a seleção vira: palavras inteiras, num parágrafo só, sem espaço nem pontuação nas pontas. Quando a
 * seleção atravessa parágrafos, fica no primeiro que tem texto dela (a alça do dedo costuma cair no fim da linha de
 * cima, e a arte é sempre de um parágrafo). Sem nada que preste: null, e o botão "Arte" não aparece.
 */
export function ajustarSelecao(paragrafos: string[], de: PontoDaSelecao, ate: PontoDaSelecao): TrechoAjustado | null {
  for (let p = de.paragrafo; p <= ate.paragrafo; p++) {
    const texto = paragrafos[p] ?? '';
    const parte = ajustarNoParagrafo(texto, p === de.paragrafo ? de.posicao : 0, p === ate.paragrafo ? ate.posicao : texto.length);
    if (parte) return { paragrafo: p, ini: parte[0], fim: parte[1] };
  }
  return null;
}
