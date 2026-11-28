/* O tipo do trecho do Roteiro (#187): o que cada parágrafo é (locução, sonora, arte, locação…), guardado no trecho ou
   adivinhado pelo texto. Regras puras, usadas pelo editor de escrita e pelas colunas. */
import { analisarSonoras, ehLocucao, NAO_E_NOME } from './sonora';
import { chaveDeArte } from './diferencas';
import type { NoJSON, TipoEtiqueta } from './tipos';

export const TIPOS_DO_TRECHO = ['texto', 'locucao', 'sonora', 'trilha', 'locutor', 'arte', 'edicao', 'producao', 'locacao', 'comentario'] as const;
export type TipoDoTrecho = (typeof TIPOS_DO_TRECHO)[number];

/** O tipo do trecho e se a pessoa o confirmou (false: é o palpite, que aparece com "?"). */
export interface TipoLido {
  tipo: TipoDoTrecho;
  confirmado: boolean;
}

const ehTipo = (t: unknown): t is TipoDoTrecho => (TIPOS_DO_TRECHO as readonly unknown[]).includes(t);

/** A etiqueta da revisão que, no trecho inteiro, é o tipo dele; o "pode cortar" não é tipo. */
const TIPO_DA_ETIQUETA: Partial<Record<TipoEtiqueta, TipoDoTrecho>> = {
  sonoplastia: 'trilha',
  edicao: 'edicao',
  locutor: 'locutor',
  producao: 'producao',
  comentario: 'comentario',
};

/** "Dona Cida, de Ribeirão Preto: fala": o nome (com minúsculas), a vírgula, de onde, os dois-pontos e a fala. */
const RE_NOME_DE_ONDE = /^\s*(\p{Lu}\p{Ll}[\p{L}'’.-]*)(?:\s+[\p{L}'’.-]+){0,3}\s*,\s*[^:,\n]{2,60}:\s+\S/u;

const ehSonora = (texto: string) => {
  const m = RE_NOME_DE_ONDE.exec(texto);
  if (m && !NAO_E_NOME.test(m[1])) return true;
  // os formatos que a revisão já reconhece (timecode, origem, "Nome: fala"), começando no início do trecho
  return analisarSonoras(texto).some((s) => s.ini === texto.length - texto.trimStart().length);
};

/** A trilha (a sonoplastia): "TRILHA", "BG", "SOBE SOM" ou "SFX" no começo, em caixa alta; ou "Trilha:" em qualquer caixa. */
const RE_TRILHA = /^\s*(?:TRILHA|BG|SOBE\s+SOM|SFX)\b/u;
const RE_TRILHA_DOIS_PONTOS = /^\s*(?:trilha|bg|sfx)\s*:/iu;
const ehTrilha = (texto: string) => RE_TRILHA.test(texto) || RE_TRILHA_DOIS_PONTOS.test(texto);

/** A locação marcada à mão: "LOCAÇÃO: cozinha", "Cenário: quintal". */
const RE_LOCACAO = /^\s*(?:loca[cç][aã]o|cen[aá]rio)\s*:/iu;

/** O tipo que o texto sugere: nunca é confirmado, quem confirma é a pessoa. */
export function palpiteDoTipo(texto: string): TipoDoTrecho {
  if (ehTrilha(texto)) return 'trilha';
  if (RE_LOCACAO.test(texto)) return 'locacao';
  if (ehLocucao(texto)) return 'locucao';
  if (ehSonora(texto)) return 'sonora';
  return 'texto';
}

/** O texto do trecho, com a quebra de linha como "\n". */
export const textoDoTrecho = (p: NoJSON) => (p.content ?? []).map((n) => (n.type === 'hardBreak' ? '\n' : (n.text ?? ''))).join('');

/** O tipo que as marcas da revisão dão ao trecho: a arte ou a mesma etiqueta em todo o texto dele. */
function tipoPelasMarcas(p: NoJSON): TipoDoTrecho | null {
  const pedacos = (p.content ?? []).filter((n) => n.type === 'text' && n.text?.trim());
  if (!pedacos.length) return null;
  if (pedacos.every((n) => n.marks?.some((m) => m.type === 'arte'))) return 'arte';
  const tipos = new Set(pedacos.map((n) => n.marks?.find((m) => m.type === 'etiqueta')?.attrs?.tipo));
  const [etq] = tipos;
  return tipos.size === 1 ? (TIPO_DA_ETIQUETA[etq as TipoEtiqueta] ?? null) : null;
}

/**
 * O tipo do trecho: o guardado nele (confirmado ou palpite); sem tipo guardado (os roteiros de antes e os que chegam de
 * fora), a arte ou a etiqueta que cobre o trecho inteiro, como a revisão marcou; e, sem nada, o palpite pelo texto.
 */
export function tipoDoTrecho(p: NoJSON): TipoLido {
  const guardado = p.attrs?.tipo;
  if (ehTipo(guardado)) return { tipo: guardado, confirmado: p.attrs?.confirmado === true };
  const pelasMarcas = tipoPelasMarcas(p);
  if (pelasMarcas) return { tipo: pelasMarcas, confirmado: true };
  return { tipo: palpiteDoTipo(textoDoTrecho(p)), confirmado: false };
}

/** Onde o trecho fica nas colunas: no vídeo, no áudio ou na linha inteira, por cima das duas. */
export type ColunaDoTrecho = 'video' | 'audio' | 'linha';

const COLUNA: Record<TipoDoTrecho, ColunaDoTrecho> = {
  arte: 'video',
  edicao: 'video',
  producao: 'video',
  comentario: 'video',
  locucao: 'audio',
  sonora: 'audio',
  trilha: 'audio',
  locutor: 'audio',
  texto: 'audio',
  locacao: 'linha',
};

/** A coluna de cada tipo: arte, edição e produção no vídeo; locução, sonora, trilha, para o locutor e o texto sem tipo
    no áudio; a locação na linha inteira (ela agrupa os trechos que vêm depois). O comentário fica com as notas, no vídeo. */
export const colunaDoTipo = (tipo: TipoDoTrecho): ColunaDoTrecho => COLUNA[tipo];

/** Um timecode ou um arquivo da rede achado no texto, que vira ficha: [ini, fim) no texto. */
export interface FichaNoTexto {
  tipo: 'timecode' | 'arquivo';
  ini: number;
  fim: number;
  texto: string;
}

/** 00:12:41:08 (com quadros), 00:12:41 e 00:12, sem ser pedaço de outro número. */
const RE_TIMECODE = /(?<![\d:;.])\d{2}:\d{2}(?:[:;]\d{2}){0,2}(?![\d:;]|\.\d)/g;

/** "aos 1'20''": minutos e segundos depois de um "aos" (sem ele, 1'20'' é a duração da chamada). A ficha é só o tempo. */
const RE_AOS = /(?<![\p{L}\p{N}])aos\s+(\d{1,2}['’]\d{1,2}(?:''|’’|"|”))/giu;

/** O caminho na rede: \\servidor\pasta, /Volumes/…, smb:// ou afp://, até o espaço. */
const RE_CAMINHO = /\\\\[\p{L}\p{N}_.$-]+\\\S*|(?:smb|afp):\/\/\S+|\/Volumes\/\S+/giu;
/** O nome de um arquivo de vídeo ou de som, solto no texto. */
const RE_ARQUIVO = /(?<![\p{L}\p{N}_.\\/-])[\p{L}\p{N}_-][\p{L}\p{N}_.-]*\.(?:mov|mxf|wav|mp4|aif|aiff)(?![\p{L}\p{N}])/giu;
/** A pontuação da frase colada no fim do caminho não é dele. */
const RE_PONTUACAO_NO_FIM = /[.,;:!?)\]}"'”’]+$/u;

const achar = (texto: string, re: RegExp, tipo: FichaNoTexto['tipo'], grupo = 0): FichaNoTexto[] =>
  [...texto.matchAll(re)].map((m) => {
    const achado = grupo ? m[grupo] : m[0].replace(RE_PONTUACAO_NO_FIM, '');
    const ini = m.index + (grupo ? m[0].length - achado.length : 0);
    return { tipo, ini, fim: ini + achado.length, texto: achado };
  });

/** Os timecodes e os arquivos da rede do texto, na ordem, sem se sobrepor: o timecode dentro de um caminho é do caminho. */
export function fichasDoTexto(texto: string): FichaNoTexto[] {
  const candidatas = [
    ...achar(texto, RE_CAMINHO, 'arquivo'),
    ...achar(texto, RE_ARQUIVO, 'arquivo'),
    ...achar(texto, RE_TIMECODE, 'timecode'),
    ...achar(texto, RE_AOS, 'timecode', 1),
  ];
  const out: FichaNoTexto[] = [];
  for (const f of candidatas) if (!out.some((o) => f.ini < o.fim && o.ini < f.fim)) out.push(f);
  return out.sort((a, b) => a.ini - b.ini);
}

/** Uma arte da lista ao lado do texto: numerada na ordem da primeira aparição, com quantas vezes aparece. */
export interface ArteDoTexto {
  ordem: number;
  texto: string;
  vezes: number;
}

/** Os textos das artes de um trecho: ele inteiro, se o tipo guardado é arte; senão, cada arte marcada nele (a de
    pedaços vizinhos com a mesma identidade é uma só). */
function artesDoTrecho(p: NoJSON): string[] {
  if (p.attrs?.tipo === 'arte') return [textoDoTrecho(p)];
  const out: { id: unknown; texto: string }[] = [];
  let anterior: unknown = null;
  for (const n of p.content ?? []) {
    const m = n.type === 'text' ? n.marks?.find((x) => x.type === 'arte') : undefined;
    if (m && out.length && anterior === m.attrs?.id) out[out.length - 1].texto += n.text ?? '';
    else if (m) out.push({ id: m.attrs?.id, texto: n.text ?? '' });
    anterior = m ? m.attrs?.id : null;
  }
  return out.map((a) => a.texto);
}

/** Os trechos do documento, também os de dentro das colunas, na ordem. */
const trechosDoDoc = (no: NoJSON): NoJSON[] => (no.type === 'paragraph' ? [no] : (no.content ?? []).flatMap(trechosDoDoc));

/**
 * A lista de artes do texto, sem repetir: a arte marcada no meio da frase e o trecho inteiro do tipo arte. É a mesma
 * arte quando o texto bate sem caixa, acento e pontuação (a chave do acervo); fica o texto da primeira aparição.
 */
export function artesDoTexto(doc: NoJSON): ArteDoTexto[] {
  const porChave = new Map<string, ArteDoTexto>();
  for (const texto of trechosDoDoc(doc).flatMap(artesDoTrecho)) {
    const k = chaveDeArte(texto);
    if (!k) continue;
    const ja = porChave.get(k);
    if (ja) ja.vezes++;
    else porChave.set(k, { ordem: porChave.size + 1, texto: texto.trim(), vezes: 1 });
  }
  return [...porChave.values()];
}
