/* Modelo intermediário: o que o arquivo dizia, sem interpretação.
   Todos os formatos (docx, rtf, txt) viram isto antes de qualquer regra. */

export interface Run {
  t: string;
  /** sublinhado */
  u?: boolean;
  b?: boolean;
  i?: boolean;
  /** marca-texto: nome da cor do Word ("yellow") ou hex sem # */
  hl?: string;
  /** cor do texto em hex sem #, quando não é preto/automático */
  cor?: string;
  link?: boolean;
}

export type Par = Run[];

export type BlocoBruto = { tipo: 'p'; par: Par } | { tipo: 'tabela'; linhas: Par[][][] };

export interface DocBruto {
  arquivo: string;
  formato: 'docx' | 'rtf' | 'txt';
  autor: string;
  blocos: BlocoBruto[];
}

const mesmaMarca = (a: Run, b: Run) =>
  !!a.u === !!b.u && !!a.b === !!b.b && !!a.i === !!b.i && a.hl === b.hl && a.cor === b.cor && !!a.link === !!b.link;

/** Acrescenta texto ao parágrafo, juntando com o trecho anterior se a formatação for igual. */
export function empurrar(par: Par, run: Run) {
  if (!run.t) return;
  const ultimo = par[par.length - 1];
  if (ultimo && mesmaMarca(ultimo, run)) ultimo.t += run.t;
  else par.push({ ...run });
}

export const textoDoPar = (par: Par) => par.map((r) => r.t).join('');
