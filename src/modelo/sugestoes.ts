/* A revisão que volta como sugestão (#196, spec #186): o que o designer muda com o cadeado aberto (#188) na cópia da
   fila de um Roteiro escrito no PROMeiro (#194, `escritoDe`) vira uma sugestão no escrito do redator, com autor e hora,
   para aceitar ou recusar. A sugestão é um comentário de outro tipo (a mesma tabela, o mesmo fio, a mesma âncora por
   citação e o mesmo aviso do #192): o trecho de como estava, o texto sugerido e a decisão. Puro e compartilhado: o
   servidor confere com estas regras, e o navegador monta e aplica a sugestão com elas. Só sintaxe que o Node apaga. */
import { ancoraDe, type Ancora, type Comentario } from './comentarios.ts';

/** A decisão de quem escreve: aceitar troca o trecho pelo sugerido no escrito; recusar deixa como está. */
export type DecisaoDaSugestao = 'aceita' | 'recusada';

/** O que uma sugestão carrega além do comentário: o texto sugerido e a decisão (null enquanto ninguém decidiu). */
export interface Sugerido {
  texto: string;
  decisao: DecisaoDaSugestao | null;
}

/** Uma sugestão que o navegador do designer manda: o id dele (estável enquanto ele mexe no mesmo trecho), a âncora do
    trecho de como estava e o texto sugerido. */
export interface SugestaoNova {
  id: string;
  ancora: Ancora;
  texto: string;
}

/** O tamanho máximo do texto sugerido, e quantas sugestões cabem num pedido. */
export const LIMITE_DO_SUGERIDO = 2000;
export const SUGESTOES_POR_PEDIDO = 200;
/** O id que o navegador dá à sugestão (e ao lote, a sessão do cadeado aberto). */
export const ID_DA_SUGESTAO = /^[\w-]{6,80}$/;

export const ehSugestao = (c: Pick<Comentario, 'sugestao'>): boolean => !!c.sugestao;

const espaco = (c: string | undefined) => c === undefined || /\s/.test(c);

/**
 * A sugestão de um trecho mudado, no texto corrido de agora: [de, ate) é o que está lá agora e `original`, o que
 * estava antes de a pessoa mexer. O trecho cresce até as palavras inteiras (quem lê a sugestão vê "CHURASQUEIROS" →
 * "CHURRASQUEIROS", e não "R" entrando no meio), e o que só entrou (sem nada saindo) leva a palavra de antes junto,
 * para a âncora ter o que citar. Devolve null quando nada mudou de fato.
 */
export function sugestaoDoTrecho(texto: string, de: number, ate: number, original: string): { ancora: Ancora; texto: string } | null {
  let i = de;
  let j = ate;
  while (i > 0 && !espaco(texto[i - 1])) i--;
  while (j < texto.length && !espaco(texto[j])) j++;
  let antes = texto.slice(i, de);
  let depois = texto.slice(ate, j);
  // só entrou texto (ou só espaço saiu): a palavra de antes vai junto; no começo, a de depois
  if (!(antes + original + depois).trim()) {
    let k = i;
    while (k > 0 && espaco(texto[k - 1]) && texto[k - 1] !== '\n') k--;
    while (k > 0 && !espaco(texto[k - 1])) k--;
    if (k < i) {
      antes = texto.slice(k, de);
      i = k;
    } else {
      let m = j;
      while (m < texto.length && espaco(texto[m]) && texto[m] !== '\n') m++;
      while (m < texto.length && !espaco(texto[m])) m++;
      depois = texto.slice(ate, m);
      j = m;
    }
  }
  const trecho = antes + original + depois;
  const sugerido = texto.slice(i, j);
  if (!trecho.trim() || trecho === sugerido) return null;
  // a âncora é a do trecho de como estava: o texto em volta (o contexto) é o mesmo de agora
  const base = ancoraDe(texto, i, j);
  return { ancora: { ...base, trecho }, texto: sugerido };
}

/**
 * A troca mínima do trecho pelo sugerido: o começo e o fim que já são iguais ficam (com as marcas deles, a arte
 * inclusive), e só o meio muda. Devolve onde começa e termina o meio no trecho, e o que entra no lugar.
 */
export function trocaMinima(trecho: string, sugerido: string): { de: number; ate: number; entra: string } {
  let p = 0;
  while (p < trecho.length && p < sugerido.length && trecho[p] === sugerido[p]) p++;
  let s = 0;
  while (s < trecho.length - p && s < sugerido.length - p && trecho[trecho.length - 1 - s] === sugerido[sugerido.length - 1 - s]) s++;
  return { de: p, ate: trecho.length - s, entra: sugerido.slice(p, sugerido.length - s) };
}

/** O texto sugerido que chegou de fora, limpo (pode ser vazio: o designer apagou o trecho); null se não serve. */
export function sugeridoValido(x: unknown): string | null {
  return typeof x === 'string' && x.length <= LIMITE_DO_SUGERIDO ? x : null;
}

/** As sugestões ainda sem decisão de uma lista de comentários. */
export const sugestoesAbertas = (lista: readonly Comentario[]) => lista.filter((c) => !c.fio && c.sugestao && !c.sugestao.decisao).length;
