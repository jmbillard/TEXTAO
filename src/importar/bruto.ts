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
  formato: 'docx' | 'rtf' | 'txt' | 'pdf';
  autor: string;
  blocos: BlocoBruto[];
  /** O que o formato não conseguiu trazer e merece conferência. */
  avisos?: string[];
  /** Alguma página veio de imagem digitalizada e foi lida por OCR. */
  lidoPorOcr?: boolean;
  /** Páginas do arquivo, quando o formato diz (PDF; Word, pelo que ele gravou da última vez). */
  paginas?: number;
  /** As imagens do roteiro (data URL), na ordem. No texto, cada uma é um marcador de um caractere (marcaDeImagem). */
  imagens?: string[];
}

/* As imagens atravessam a leitura do roteiro como um caractere de uso privado por imagem: as regras de texto
   (colunas, sublinhado, etiquetas) não precisam saber delas, e a montagem do documento troca o marcador pela imagem. */
export const marcaDeImagem = (i: number) => String.fromCharCode(0xe000 + i);
export const RE_MARCA_IMAGEM = /[\ue000-\uf8ff]/g;
export const indiceDaMarca = (c: string) => c.charCodeAt(0) - 0xe000;
export const semMarcasDeImagem = (s: string) => s.replace(RE_MARCA_IMAGEM, '');

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
