/**
 * O gesto do dedo numa linha da lista de artes, no celular: o que começa o lote e o que, dentro dele, marca ou
 * desmarca uma linha. Regra pura; o TelaEditor mede o tempo e o quanto o dedo mais se afastou de onde encostou.
 */

/** Quanto tempo o dedo fica parado na linha para começar o lote. */
export const SEGURAR_MS = 500;
/** O quanto o dedo pode tremer sem virar arrasto. */
const TREMOR_PX = 8;

/**
 * O que o gesto é, depois de `ms` com o dedo na tela e o maior afastamento `afastou` (px) de onde ele encostou:
 * - `arrasto`: o dedo saiu do lugar (rolar a página); não seleciona nem começa o lote;
 * - `segurar`: parado por `SEGURAR_MS` ou mais; começa o lote;
 * - `toque`: encostou e soltou antes disso; no lote, marca ou desmarca a linha.
 */
export function gestoNaLista(ms: number, afastou: number): 'toque' | 'segurar' | 'arrasto' {
  if (afastou > TREMOR_PX) return 'arrasto';
  return ms >= SEGURAR_MS ? 'segurar' : 'toque';
}
