/* A tela de link quebrado, sem o desenho: as variantes sorteadas, os casos e os textos que saem da lápide. */

/** Os três desenhos do link quebrado. A lápide (quando o servidor sabe quem apagou) é sempre a claquete. */
export const VARIANTES = ['cortada', 'claquete', 'lupa'] as const;
export type Variante = (typeof VARIANTES)[number];

/** Uma variante qualquer, menos a última (para quem cai em dois links seguidos ver um desenho novo). */
export function sortearVariante(ultima: Variante | null, acaso: () => number = Math.random): Variante {
  const opcoes = VARIANTES.filter((v) => v !== ultima);
  return opcoes[Math.min(opcoes.length - 1, Math.floor(acaso() * opcoes.length))];
}

const CHAVE = 'promeiro.link-quebrado';

/** A variante desta vez: sorteada sem repetir a última desta aba (sessionStorage). Sem o armazenamento, sorteia livre. */
export function varianteDaVez(): Variante {
  let ultima: Variante | null = null;
  try {
    const v = sessionStorage.getItem(CHAVE) ?? '';
    ultima = (VARIANTES as readonly string[]).includes(v) ? (v as Variante) : null;
  } catch {
    /* sem sessionStorage (janela privada, site bloqueado): sorteia sem a última */
  }
  return sortearVariante(ultima);
}

/** Guarda a variante que ficou na tela, para a próxima não repetir. */
export function lembrarVariante(v: Variante) {
  try {
    sessionStorage.setItem(CHAVE, v);
  } catch {
    /* idem */
  }
}

/** A claquete em duas partes, como na lousa: o nome (o que se busca na fila) e a data ("Rota do Sabor", "20/11"). */
export function partesDaClaquete(claquete: string): { nome: string; data: string } {
  const m = /^(.*?)\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/.exec(claquete);
  if (!m || !m[1].trim()) return { nome: claquete.trim(), data: '' };
  return { nome: m[1].trim(), data: m[2] };
}

/** "24/11", no fuso da casa. */
export const diaEMes = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
};
