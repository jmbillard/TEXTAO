/* A comemoração da fila zerada: as regras puras (quando comemora, a janela entre uma cena e outra, o sorteio da cena)
   e a memória da fila. A cena desenhada fica em FilaZerada.tsx. */

/**
 * De onde vem a leitura da fila:
 * - `abriu`: a primeira leitura desta página (abrir ou recarregar);
 * - `tirar`: a pessoa tirou um roteiro da fila e o desfazer ainda está aberto;
 * - `virou-o-dia`: o dia mudou desde a leitura anterior (o pendente foi ao ar à meia-noite);
 * - `fila`: qualquer outra leitura nova (mandar, revisar, voltar do editor, a fila ao vivo).
 */
export type Origem = 'abriu' | 'tirar' | 'virou-o-dia' | 'fila';

/** Comemora só quando a fila passa de pelo menos um pendente para nenhum, numa leitura nova da fila. */
export function deveComemorar(antes: number | null, depois: number, origem: Origem): boolean {
  return antes !== null && antes >= 1 && depois === 0 && origem === 'fila';
}

/** Uma cena a cada 15 minutos, por aba. */
export const JANELA_DA_CENA_MS = 15 * 60 * 1000;

/** Dentro da janela da última cena não há outra: só o risco à mão no título. */
export function cenaLiberada(ultimaEm: number | null, agora: number): boolean {
  return ultimaEm === null || agora - ultimaEm >= JANELA_DA_CENA_MS;
}

/** Sorteia uma cena do repertório, menos a última; com duas, elas alternam. */
export function sortear<T extends string>(ids: readonly T[], ultima: string | null, rnd: () => number): T {
  const podem = ids.filter((id) => id !== ultima);
  const de = podem.length ? podem : ids;
  return de[Math.min(de.length - 1, Math.floor(rnd() * de.length))];
}

/** Uma leitura da fila: quantos pendentes, o dia, se há um "tirar" esperando o desfazer e a claquete do único pendente. */
export interface LeituraDaFila {
  conta: number;
  /** o dia local (AAAA-MM-DD) */
  hoje: string;
  tirando: boolean;
  /** a claquete do pendente, quando só sobra um */
  ultima?: string;
}

/** A fila acabou de zerar: quantos pendentes havia e a claquete do último, quando era um só. */
export interface Zerada {
  antes: number;
  ultima: string | null;
}

/**
 * A memória da fila entre uma leitura e outra. Fica no módulo, e não no componente: a Biblioteca desmonta quando o
 * editor abre, e voltar do editor com a fila zerada também comemora.
 */
export function criarMemoriaDaFila() {
  let conta: number | null = null;
  let dia: string | null = null;
  let claquete: string | null = null;
  return {
    /** Registra a leitura; devolve a zerada quando a fila acabou de zerar e é para comemorar. */
    ler(l: LeituraDaFila): Zerada | null {
      const antes = conta;
      const origem: Origem = antes === null ? 'abriu' : dia !== l.hoje ? 'virou-o-dia' : l.tirando ? 'tirar' : 'fila';
      const ultima = antes === 1 ? claquete : null;
      conta = l.conta;
      dia = l.hoje;
      claquete = l.conta === 1 ? (l.ultima ?? null) : null;
      return deveComemorar(antes, l.conta, origem) ? { antes: antes!, ultima } : null;
    },
  };
}

/** A memória da fila desta página. */
export const memoriaDaFila = criarMemoriaDaFila();

/** O repertório: os fogos à mão e o avião de papel. */
export const CENAS = ['fogos', 'aviao'] as const;
export type Cena = (typeof CENAS)[number];

/** Onde a aba guarda a última cena e quando ela tocou (o sessionStorage, no navegador). */
export type GuardaDaAba = Pick<Storage, 'getItem' | 'setItem'>;
const CHAVE = 'promeiro:fila-zerada';

function guardaDaAba(): GuardaDaAba | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * A cena desta zerada: sorteada sem repetir a última, uma a cada 15 minutos por aba. Dentro da janela, null (só o
 * risco no título). Guarda a escolha na aba; se a guarda falhar, a cena sai assim mesmo.
 */
export function escolherCena(agora: number, rnd: () => number, guarda: GuardaDaAba | null = guardaDaAba()): Cena | null {
  let anterior: { ultima: string | null; em: number | null } = { ultima: null, em: null };
  try {
    const salvo = JSON.parse(guarda?.getItem(CHAVE) ?? 'null') as { ultima?: unknown; em?: unknown } | null;
    if (salvo) anterior = { ultima: typeof salvo.ultima === 'string' ? salvo.ultima : null, em: typeof salvo.em === 'number' ? salvo.em : null };
  } catch {
    // guarda bloqueada ou com lixo: como se fosse a primeira da aba
  }
  if (!cenaLiberada(anterior.em, agora)) return null;
  const cena = sortear(CENAS, anterior.ultima, rnd);
  try {
    guarda?.setItem(CHAVE, JSON.stringify({ ultima: cena, em: agora }));
  } catch {
    // sem guarda, a janela não vale entre leituras; a cena sai mesmo assim
  }
  return cena;
}
