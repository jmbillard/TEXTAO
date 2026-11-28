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

/* ---------- escrever na folha (#190) ---------- */

/** Como cada tipo aparece: o nome, o rótulo curto da margem e a dica do menu do "/". */
export const SOBRE_O_TIPO: Record<TipoDoTrecho, { nome: string; rotulo: string; dica: string }> = {
  locucao: { nome: 'Locução', rotulo: 'LOC', dica: 'caixa alta, conta no tempo' },
  arte: { nome: 'Arte', rotulo: 'ARTE', dica: 'o trecho todo vai para a lista da arte' },
  sonora: { nome: 'Sonora', rotulo: 'SONORA', dica: '“Nome, de onde: a fala”' },
  edicao: { nome: 'Edição', rotulo: 'EDIÇÃO', dica: 'imagem, corte, material' },
  trilha: { nome: 'Trilha', rotulo: 'TRILHA', dica: 'música, efeito, silêncio' },
  locutor: { nome: 'Para o locutor', rotulo: 'LOCUTOR', dica: 'o jeito de ler, para quem grava' },
  producao: { nome: 'Produção', rotulo: 'PRODUÇÃO', dica: 'o que a produção precisa providenciar' },
  locacao: { nome: 'Locação', rotulo: 'LOCAÇÃO', dica: 'onde a cena se passa; agrupa o que vem depois' },
  comentario: { nome: 'Comentário', rotulo: 'NOTA', dica: 'uma nota no roteiro, fora do texto lido' },
  texto: { nome: 'Texto sem tipo', rotulo: 'TEXTO', dica: 'o PROMeiro adivinha pelo texto' },
};

/** A ordem em que o Tab troca o tipo (e em que o menu do tipo os mostra, com os números de 1 a 0). */
export const CICLO_DOS_TIPOS: readonly TipoDoTrecho[] = ['locucao', 'arte', 'sonora', 'edicao', 'trilha', 'locutor', 'producao', 'locacao', 'comentario', 'texto'];

/** O tipo seguinte (Tab) ou o anterior (Shift+Tab), dando a volta. */
export function tipoVizinho(tipo: TipoDoTrecho, sentido: 1 | -1): TipoDoTrecho {
  const i = CICLO_DOS_TIPOS.indexOf(tipo);
  const n = CICLO_DOS_TIPOS.length;
  return CICLO_DOS_TIPOS[(i + sentido + n) % n];
}

/** Um comando do "/": troca o tipo do trecho ou põe uma ficha (timecode, arquivo) no texto. */
export interface ComandoDaBarra {
  id: string;
  nome: string;
  dica: string;
  tipo?: TipoDoTrecho;
}

const comandoDoTipo = (tipo: TipoDoTrecho): ComandoDaBarra => ({ id: tipo, tipo, nome: SOBRE_O_TIPO[tipo].nome, dica: SOBRE_O_TIPO[tipo].dica });

/** Os comandos do "/", na ordem do menu: os tipos, as fichas e, no fim, o texto sem tipo. */
export const COMANDOS_DA_BARRA: readonly ComandoDaBarra[] = [
  ...(['locucao', 'arte', 'sonora', 'edicao', 'trilha', 'locutor', 'producao', 'locacao', 'comentario'] as const).map(comandoDoTipo),
  { id: 'timecode', nome: 'Timecode', dica: '00:00:00:00, vira ficha' },
  { id: 'arquivo', nome: 'Arquivo na rede', dica: '\\\\servidor\\pasta\\…, vira ficha' },
  comandoDoTipo('texto'),
];

const semAcentoNemCaixa = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Os comandos que batem com o que se digitou depois do "/": primeiro os que começam com ele (pelo id ou pelo nome),
    depois os que o têm no nome. Sem caixa e sem acento. */
export function comandosQueBatem(q: string): ComandoDaBarra[] {
  const k = semAcentoNemCaixa(q.trim());
  if (!k) return [...COMANDOS_DA_BARRA];
  const comeca = COMANDOS_DA_BARRA.filter((c) => c.id.startsWith(k) || semAcentoNemCaixa(c.nome).startsWith(k));
  const tem = COMANDOS_DA_BARRA.filter((c) => !comeca.includes(c) && semAcentoNemCaixa(c.nome).includes(k));
  return [...comeca, ...tem];
}

/** O "/" que abre o menu: no começo do trecho ou depois de um espaço, só com letras depois (até 14). Devolve o que se
    digitou depois dele, ou null (uma data, um caminho, um espaço no meio). */
export function barraNoTexto(antesDoCursor: string): string | null {
  const m = /(?:^|\s)\/(\p{L}{0,14})$/u.exec(antesDoCursor);
  return m ? m[1] : null;
}

/** O nome do arquivo, sem as pastas: é o que a ficha mostra (o caminho inteiro abre no clique). */
export const nomeDoArquivo = (caminho: string) => caminho.split(/[\\/]/).filter(Boolean).pop() ?? caminho;

const contarPalavras = (s: string) => (s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
/** O texto sem as fichas: o timecode e o caminho não são palavras. */
const semFichas = (texto: string) => {
  let out = texto;
  for (const f of fichasDoTexto(texto).reverse()) out = out.slice(0, f.ini) + ' ' + out.slice(f.fim);
  return out;
};
/** Ritmo médio de leitura de chamada, em palavras por segundo (o mesmo de `RITMO`, na exportação). */
const LEITURA = { locucao: 2.6, sonora: 3 };

/**
 * Os números do rodapé: as palavras do texto, as da locução e o tempo de leitura (a locução e a fala das sonoras, no
 * ritmo médio). Vale o tipo do trecho, confirmado ou palpite. Os timecodes e os arquivos não contam como palavras.
 */
export function contagemDoTexto(doc: NoJSON): { palavras: number; locucao: number; segundos: number } {
  let palavras = 0;
  let locucao = 0;
  let seg = 0;
  for (const p of trechosDoDoc(doc)) {
    const texto = semFichas(textoDoTrecho(p));
    const n = contarPalavras(texto);
    palavras += n;
    const { tipo } = tipoDoTrecho(p);
    if (tipo === 'locucao') {
      locucao += n;
      seg += n / LEITURA.locucao;
    } else if (tipo === 'sonora') seg += contarPalavras(texto.replace(/^[^:\n]{1,60}:\s*/u, '')) / LEITURA.sonora;
  }
  return { palavras, locucao, segundos: Math.round(seg) };
}

/** O tempo como o rodapé mostra: "12s", "1min", "1min15s". */
export const duracaoLegivel = (seg: number) => (seg < 60 ? `${seg}s` : `${Math.floor(seg / 60)}min${seg % 60 ? `${String(seg % 60).padStart(2, '0')}s` : ''}`);
