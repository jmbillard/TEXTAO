/* Os comentários do Roteiro escrito no PROMeiro (#192, spec #186): o fio (o comentário e as respostas), a âncora no
   trecho e a menção @nome. Puro e compartilhado: o servidor guarda e confere com estas regras, e o navegador acha o
   trecho no texto com elas. É uma estrutura nova, separada da etiqueta `comentario` do roteiro importado (que continua
   sendo um tipo de trecho). Só sintaxe que o Node apaga. */
import { nomeComparavel } from './ligarPeloNome.ts';
import type { Sugerido } from './sugestoes.ts';

/**
 * Onde o comentário está preso: o trecho citado, um pouco do texto antes e depois dele e o lugar aproximado (a posição
 * no texto corrido). É a âncora por citação: não muda o documento (quem só comenta não escreve nele) e sobrevive ao
 * texto reescrito em volta, porque o trecho é achado de novo pelo que ele diz, com o contexto e o lugar desempatando.
 */
export interface Ancora {
  trecho: string;
  antes: string;
  depois: string;
  pos: number;
}

export interface Quem {
  nome: string;
  email: string;
}

/** Um comentário ou uma resposta. A resposta tem `fio` (o id do comentário que ela responde) e não tem âncora. */
export interface Comentario {
  id: string;
  fio: string | null;
  autor: Quem;
  /** o papel de quem escreveu, quando escreveu: "redação", "arte", "edição", "coordenação"… */
  papel: string;
  texto: string;
  criadoEm: string;
  ancora: Ancora | null;
  resolvido: { em: string; por: Quem } | null;
  /** a sugestão da revisão (#196): o texto sugerido no lugar do trecho da âncora e a decisão; o resolvido é quem
      decidiu e quando. Num comentário, não há */
  sugestao?: Sugerido | null;
}

/** Um fio: o comentário de cima, com as respostas na ordem em que chegaram. */
export interface Fio extends Comentario {
  respostas: Comentario[];
}

/** Quanto texto de cada lado a âncora guarda. */
export const CONTEXTO_DA_ANCORA = 32;
/** O tamanho máximo do comentário e do trecho citado. */
export const LIMITE_DO_COMENTARIO = 4000;
export const LIMITE_DO_TRECHO = 2000;

/** A âncora do trecho [de, ate) do texto corrido. */
export function ancoraDe(texto: string, de: number, ate: number): Ancora {
  return {
    trecho: texto.slice(de, ate),
    antes: texto.slice(Math.max(0, de - CONTEXTO_DA_ANCORA), de),
    depois: texto.slice(ate, ate + CONTEXTO_DA_ANCORA),
    pos: de,
  };
}

/** Quantas letras do fim de `a` batem com o fim de `b`. */
const fimIgual = (a: string, b: string) => {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
};
/** Quantas letras do começo de `a` batem com o começo de `b`. */
const comecoIgual = (a: string, b: string) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

/**
 * Acha o trecho da âncora no texto de agora: entre os lugares em que o trecho aparece (do jeito que foi escrito ou, se
 * não, sem caixa), fica o de contexto mais parecido e, empatado, o mais perto do lugar guardado. Devolve [de, ate) ou
 * null quando o trecho saiu do texto.
 */
export function acharAncora(texto: string, a: Ancora): { de: number; ate: number } | null {
  if (!a.trecho) return null;
  const achar = (onde: string, oque: string) => {
    const lugares: number[] = [];
    for (let i = onde.indexOf(oque); i >= 0; i = onde.indexOf(oque, i + 1)) lugares.push(i);
    return lugares;
  };
  let lugares = achar(texto, a.trecho);
  if (!lugares.length) lugares = achar(texto.toLowerCase(), a.trecho.toLowerCase());
  if (!lugares.length) return null;
  let melhor = lugares[0];
  let nota = -Infinity;
  for (const i of lugares) {
    const ate = i + a.trecho.length;
    const contexto = fimIgual(texto.slice(Math.max(0, i - a.antes.length), i), a.antes) + comecoIgual(texto.slice(ate, ate + a.depois.length), a.depois);
    // o contexto pesa mais que a distância: cada letra igual vale mais que mil letras de distância
    const n = contexto * 1000 - Math.abs(i - a.pos);
    if (n > nota) {
      nota = n;
      melhor = i;
    }
  }
  return { de: melhor, ate: melhor + a.trecho.length };
}

/** A âncora que chegou de fora (do navegador), limpa; null se não serve. */
export function ancoraValida(x: unknown): Ancora | null {
  const a = x as Partial<Ancora> | null;
  if (!a || typeof a !== 'object' || typeof a.trecho !== 'string' || !a.trecho.trim()) return null;
  const txt = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max) : '');
  return {
    trecho: a.trecho.slice(0, LIMITE_DO_TRECHO),
    antes: txt(a.antes, CONTEXTO_DA_ANCORA),
    depois: txt(a.depois, CONTEXTO_DA_ANCORA),
    pos: Number.isFinite(a.pos) && (a.pos as number) >= 0 ? Math.floor(a.pos as number) : 0,
  };
}

/** O texto do comentário, sem espaços sobrando nas pontas; vazio não vale. */
export const textoDoComentario = (t: unknown) => (typeof t === 'string' ? t.trim().slice(0, LIMITE_DO_COMENTARIO) : '');

/** Os fios: os comentários de cima, na ordem em que chegaram, cada um com as respostas dele. */
export function fiosDosComentarios(lista: readonly Comentario[]): Fio[] {
  const porData = (a: Comentario, b: Comentario) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id);
  const respostas = new Map<string, Comentario[]>();
  for (const c of lista) if (c.fio) (respostas.get(c.fio) ?? respostas.set(c.fio, []).get(c.fio)!).push(c);
  return lista
    .filter((c) => !c.fio)
    .sort(porData)
    .map((c) => ({ ...c, respostas: (respostas.get(c.id) ?? []).sort(porData) }));
}

/** O primeiro nome, comparável. */
const primeiro = (nome: string) => nomeComparavel(nome).split(' ')[0] ?? '';
/** O primeiro e o último nome, comparáveis. */
const primeiroEUltimo = (nome: string) => {
  const p = nomeComparavel(nome).split(' ').filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : '';
};

/**
 * As pessoas citadas com @nome no texto, pelos cadastros: o nome inteiro, o primeiro e o último, ou só o primeiro
 * (quando ninguém mais tem o mesmo). Sem caixa e sem acento. Cada pessoa uma vez, na ordem em que aparece.
 */
export function mencoesDoTexto(texto: string, pessoas: readonly Quem[]): Quem[] {
  const achadas: Quem[] = [];
  for (const m of texto.matchAll(RE_MENCAO)) {
    const palavras = nomeComparavel(m[2]).split(' ').filter(Boolean);
    // da frase mais longa para a mais curta: "@Ana Paula Reis" acha a Ana Paula antes da Ana
    for (let k = palavras.length; k > 0; k--) {
      const p = pessoaDaFrase(palavras.slice(0, k).join(' '), pessoas);
      if (p) {
        if (!achadas.some((a) => a.email === p.email)) achadas.push(p);
        break;
      }
    }
  }
  return achadas;
}

/** O @nome: o @ no começo ou depois de um espaço (não num e-mail), e até cinco palavras. */
const RE_MENCAO = /(^|[^\p{L}\p{N}_.@])@([\p{L}\p{N}][\p{L}\p{N}'.-]*(?:[ \t]+[\p{L}\p{N}][\p{L}\p{N}'.-]*){0,4})/gu;

/** A pessoa que a frase (comparável) nomeia por inteiro: o nome, o primeiro e o último, ou o primeiro sem xará. */
function pessoaDaFrase<T extends Quem>(frase: string, pessoas: readonly T[]): T | undefined {
  return (
    pessoas.find((x) => nomeComparavel(x.nome) === frase) ??
    pessoas.find((x) => primeiroEUltimo(x.nome) === frase) ??
    (frase.includes(' ') ? undefined : pessoas.filter((x) => primeiro(x.nome) === frase).length === 1 ? pessoas.find((x) => primeiro(x.nome) === frase) : undefined)
  );
}

/** Os pedaços do texto do comentário, com as menções separadas (para destacá-las). */
export function pedacosComMencoes(texto: string, pessoas: readonly Quem[]): { texto: string; mencao?: Quem }[] {
  const pedacos: { texto: string; mencao?: Quem }[] = [];
  let desde = 0;
  for (const m of texto.matchAll(RE_MENCAO)) {
    const inicio = (m.index ?? 0) + m[1].length;
    // onde termina cada palavra depois do @, da frase mais longa para a mais curta
    const fins = [...m[2].matchAll(/[\p{L}\p{N}][\p{L}\p{N}'.-]*/gu)].map((w) => (w.index ?? 0) + w[0].length).reverse();
    for (const fim of fins) {
      const p = pessoaDaFrase(nomeComparavel(m[2].slice(0, fim)), pessoas);
      if (!p) continue;
      if (inicio > desde) pedacos.push({ texto: texto.slice(desde, inicio) });
      pedacos.push({ texto: texto.slice(inicio, inicio + 1 + fim), mencao: p });
      desde = inicio + 1 + fim;
      break;
    }
  }
  if (desde < texto.length) pedacos.push({ texto: texto.slice(desde) });
  return pedacos;
}

/** O @ que está sendo digitado antes do cursor ("@ma" → "ma"), para a lista de quem citar; null fora de uma menção. */
export function mencaoSendoDigitada(antesDoCursor: string): string | null {
  const m = /(^|[^\p{L}\p{N}_.@])@([\p{L}\p{N}'.-]*(?: [\p{L}\p{N}'.-]*)?)$/u.exec(antesDoCursor);
  return m ? m[2] : null;
}

/** Quem combina com o @ sendo digitado: o nome começa com o que foi digitado (ou alguma palavra dele), sem caixa e acento. */
export function quemCombina<T extends Quem>(digitado: string, pessoas: readonly T[], max = 6): T[] {
  const alvo = nomeComparavel(digitado);
  const ok = pessoas.filter((p) => {
    const n = nomeComparavel(p.nome);
    return !alvo || n.startsWith(alvo) || n.split(' ').some((w) => w.startsWith(alvo));
  });
  return ok.sort((a, b) => Number(!nomeComparavel(a.nome).startsWith(alvo)) - Number(!nomeComparavel(b.nome).startsWith(alvo)) || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, max);
}

/** Quem resolve um comentário: quem comentou e quem escreve no roteiro. */
export const podeResolver = (q: { autorDoComentario: boolean; escreve: boolean }) => q.autorDoComentario || q.escreve;

/**
 * Quem ganha o aviso de um comentário novo (ou de uma resposta): as pessoas citadas e o autor do roteiro, menos quem
 * escreveu. Cada uma uma vez, com o motivo (a menção vale mais que o "no seu roteiro").
 */
export function quemAvisar(q: { autor: string; donoDoRoteiro: string; citadas: readonly string[] }): { email: string; motivo: 'mencao' | 'no-seu' }[] {
  const saida = new Map<string, 'mencao' | 'no-seu'>();
  for (const e of q.citadas) if (e !== q.autor) saida.set(e, 'mencao');
  if (q.donoDoRoteiro !== q.autor && !saida.has(q.donoDoRoteiro)) saida.set(q.donoDoRoteiro, 'no-seu');
  return [...saida].map(([email, motivo]) => ({ email, motivo }));
}
