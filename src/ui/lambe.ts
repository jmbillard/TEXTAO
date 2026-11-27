/* O lambe-lambe da agenda de filmes (#184, a variação A do protótipo aprovado, com os ajustes do usuário): cada pôster
   é um cartaz colado no muro, com uma rotação pequena, umas rasgadinhas discretas na borda e, às vezes, um pedaço de
   fita. Sem dobra, sem canto descolando. Tudo sai de um sorteio fixo pelo pôster: desenhar de novo (trocar de semana,
   voltar da busca) não muda o cartaz. Aqui só a conta, sem tela. */

/** Um sorteio fixo pela semente: a mesma semente dá sempre a mesma sequência, de 0 a 1. */
export function sorteio(semente: string): () => number {
  let s = 0;
  for (const ch of semente) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quanto a rasgadinha entra no papel, no máximo, em px, e em quantos trechos cada lado se divide. */
export const RASGO_PX = 2.2;
const TRECHOS = 14;

/**
 * A borda rasgada: o polígono do clip-path, que entra até `amp` px em cada lado, sem canto cortado (nada de dobra).
 * @param rnd o sorteio do pôster
 */
export function rasgo(rnd: () => number, amp = RASGO_PX, trechos = TRECHOS): string {
  const p: string[] = [];
  const j = () => (rnd() * amp).toFixed(2);
  const pct = (k: number) => +((k / trechos) * 100).toFixed(3);
  for (let k = 0; k <= trechos; k++) p.push(`${pct(k)}% ${j()}px`); // em cima
  for (let k = 1; k <= trechos; k++) p.push(`calc(100% - ${j()}px) ${pct(k)}%`); // à direita
  for (let k = 1; k <= trechos; k++) p.push(`${+(100 - pct(k)).toFixed(3)}% calc(100% - ${j()}px)`); // embaixo
  for (let k = 1; k < trechos; k++) p.push(`${j()}px ${+(100 - pct(k)).toFixed(3)}%`); // à esquerda
  return `polygon(${p.join(',')})`;
}

/** Onde a fita prende o cartaz (ou nenhuma). */
export type FitaDoLambe = '' | 'topo-meio' | 'topo-esq' | 'topo-dir';

export interface Lambe {
  /** a rotação, em graus (de -1,6 a 1,6: pequena) */
  rot: number;
  /** o desnível, em px (de -3 a 3: os cartazes não ficam em fila perfeita) */
  y: number;
  fita: FitaDoLambe;
  clip: string;
}

/** O cartaz de um pôster: a rotação, o desnível, a fita e a borda rasgada, sempre os mesmos para a mesma semente. */
export function lambeDe(semente: string): Lambe {
  const r = sorteio(semente);
  const rot = +(r() * 3.2 - 1.6).toFixed(2);
  const y = Math.round(r() * 6 - 3);
  const fita = r() < 0.5 ? (['topo-meio', 'topo-esq', 'topo-dir'] as const)[Math.floor(r() * 3)] : '';
  return { rot, y, fita, clip: rasgo(r) };
}
