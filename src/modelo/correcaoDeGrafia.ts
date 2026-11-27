/* A correção de grafia (#108): as propostas "de → para" das grafias antigas, conferidas por um administrador antes de
   aplicar. Regras puras, as mesmas no servidor e no navegador (só sintaxe que o Node apaga).

   Na pauta da edição (#114), só o código de versão no fim da claquete muda: vai para o padrão, uma letra por versão,
   maiúscula, entre parênteses, no fim e na ordem escrita. DIA vira (D), MES e MÊS viram (M), MNT continua (MNT). O
   código é achado pela mesma leitura da pauta (lerVersoes): o que ela não reconhece não é corrigido, só apontado.

   Nas atrações (#116), as fichas que parecem ser a mesma atração vêm juntas num grupo, com o motivo; o administrador
   decide se são a mesma (juntar, #117) ou não ("não são a mesma", guardado no servidor). */
import { lerVersoes } from './pauta.ts';
import { nomeComparavel, umaLetraDeDiferenca } from './ligarPeloNome.ts';

/** A correção de uma claquete: a claquete no padrão, ou o código que a pauta não reconhece (só apontado). */
export type PropostaDaClaquete = { tipo: 'corrigir'; de: string; para: string } | { tipo: 'nao-reconhecido'; de: string; codigo: string };

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
/** Os códigos inteiros que viram uma letra só. */
const UMA_LETRA: Record<string, string> = { DIA: 'D', MES: 'M' };

/**
 * A claquete com o código de versão no padrão. null é "sem correção": sem código, já no padrão ou com um código que a
 * pauta não reconhece (aí, `nao-reconhecido`, para a tela apontar). Só o código muda: o resto da claquete, e o espaço
 * antes do código, ficam como estão.
 */
export function propostaDaClaquete(claquete: string): PropostaDaClaquete | null {
  const de = claquete.trim();
  // o dia da linha só muda o rótulo das versões, não o código
  const { versoes, semVersao } = lerVersoes(de, '');
  if (!versoes.length) return null;
  if (versoes.some((v) => !v.conhecida)) return { tipo: 'nao-reconhecido', de, codigo: versoes.map((v) => v.codigo).join('') };
  const lido = semAcento(versoes.map((v) => v.codigo).join(''));
  const codigo = UMA_LETRA[lido] ?? lido;
  const espaco = /^\s*/.exec(de.slice(semVersao.length))![0];
  const para = `${semVersao}${espaco}(${codigo})`;
  return para === de ? null : { tipo: 'corrigir', de, para };
}

/**
 * A claquete como o PROMeiro grava (#118): com o código de versão no padrão, quando há o que corrigir; senão, como
 * está (sem código, já no padrão ou com um código que a pauta não reconhece). A entrada aceita qualquer grafia.
 */
export function claqueteNoPadrao(claquete: string): string {
  const proposta = propostaDaClaquete(claquete);
  return proposta?.tipo === 'corrigir' ? proposta.para : claquete;
}

/** Os dois grupos da pauta na tela: as claquetes a corrigir e os códigos que a pauta não reconhece. */
export type GrupoDaPauta = 'corrigir' | 'nao-reconhecido';

/** Uma proposta da pauta como a rota devolve: a linha (o dia e o editor), "de" e "para" ou o código não reconhecido. */
export interface PropostaDaPauta {
  /** o id da linha no Teable */
  id: string;
  /** o dia da pauta (AAAA-MM-DD) */
  dia: string;
  /** o editor; '' sem editor */
  editor: string;
  de: string;
  /** só no grupo corrigir */
  para?: string;
  /** só no grupo nao-reconhecido */
  codigo?: string;
}

/** Uma página das propostas da pauta: a rota GET /api/correcoes/pauta. */
export interface PaginaDaCorrecao {
  grupo: GrupoDaPauta;
  /** a partir de 1 */
  pagina: number;
  porPagina: number;
  /** quantas há em cada grupo, na pauta inteira */
  resumo: { corrigir: number; naoReconhecido: number };
  propostas: PropostaDaPauta[];
}

/* ---------- as atrações parecidas (#116) ---------- */

/** Por que as fichas parecem a mesma atração: o mesmo nome sem caixa, acento, pontuação e artigos, ou uma letra de
    diferença numa palavra longa. */
export type MotivoDoGrupo = 'mesmo-nome' | 'uma-letra';
export interface GrupoDeAtracoes<F> {
  motivo: MotivoDoGrupo;
  /** em ordem de nome (o empate pelo id) */
  fichas: F[];
}

/** Os artigos, que não contam na comparação ("A Clínica" é "Clínica"), como na chave do título dos filmes. */
const ARTIGOS = new Set(['A', 'O', 'AS', 'OS', 'UM', 'UMA', 'UNS', 'UMAS', 'THE']);
/** Palavra curta ("Gol", "Casa") só vale igual: uma letra de diferença nela já é outro nome. */
const PALAVRA_LONGA = 5;
const palavrasDoNome = (nome: string) => nomeComparavel(nome).split(' ').filter((p) => p && !ARTIGOS.has(p));

/** A ordem das fichas: pelo nome, e o empate pelo id. */
const ordem = (a: { id: string; nome: string }, b: { id: string; nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** O par de fichas, na mesma ordem dos dois lados: a chave do "não são a mesma". */
export const parDeFichas = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Como dois nomes se parecem, já em palavras: o mesmo nome, uma letra de diferença numa palavra longa, ou nada. */
function semelhanca(a: readonly string[], b: readonly string[]): MotivoDoGrupo | null {
  if (!a.length || a.length !== b.length) return null;
  const diferentes = a.flatMap((p, i) => (p === b[i] ? [] : [i]));
  if (!diferentes.length) return 'mesmo-nome';
  if (diferentes.length > 1) return null;
  const [x, y] = [a[diferentes[0]], b[diferentes[0]]];
  return Math.min(x.length, y.length) >= PALAVRA_LONGA && umaLetraDeDiferenca(x, y) ? 'uma-letra' : null;
}

/**
 * As fichas de atração que parecem ser a mesma, em grupos: a comparação da busca de atração (sem caixa, acento,
 * pontuação e artigos; uma letra de diferença, a mais, a menos ou trocada, numa só palavra de 5 letras ou mais). Duas
 * fichas parecidas com uma terceira ficam no mesmo grupo. O par marcado como "não são a mesma" (`diferentes`, as chaves
 * de `parDeFichas`) não junta: o grupo só volta com uma ficha nova parecida. O motivo do grupo é "mesmo-nome" quando
 * todas têm o mesmo nome; senão, "uma-letra". Os grupos vêm na ordem do nome da primeira ficha.
 */
export function atracoesParecidas<F extends { id: string; nome: string }>(fichas: readonly F[], diferentes: ReadonlySet<string> = new Set()): GrupoDeAtracoes<F>[] {
  const palavras = fichas.map((f) => palavrasDoNome(f.nome));
  // cada ficha aponta para o grupo dela (união e busca)
  const pai = fichas.map((_, i) => i);
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  for (let i = 0; i < fichas.length; i++)
    for (let j = i + 1; j < fichas.length; j++)
      if (semelhanca(palavras[i], palavras[j]) && !diferentes.has(parDeFichas(fichas[i].id, fichas[j].id))) pai[raiz(i)] = raiz(j);
  const porGrupo = new Map<number, number[]>();
  fichas.forEach((_, i) => porGrupo.set(raiz(i), [...(porGrupo.get(raiz(i)) ?? []), i]));
  return [...porGrupo.values()]
    .filter((is) => is.length > 1)
    .map((is) => {
      const chave = palavras[is[0]].join(' ');
      return { motivo: is.every((i) => palavras[i].join(' ') === chave) ? ('mesmo-nome' as const) : ('uma-letra' as const), fichas: is.map((i) => fichas[i]).sort(ordem) };
    })
    .sort((a, b) => ordem(a.fichas[0], b.fichas[0]));
}

/**
 * A ficha que parece ser a atração deste nome, na mesma comparação de `atracoesParecidas` (#118: o PROMeiro grava o
 * nome da ficha que já existe, e não outra grafia). A de mesmo nome vem antes da de uma letra de diferença; no empate,
 * a primeira em ordem de nome. null quando nenhuma parece.
 */
export function atracaoParecida<F extends { id: string; nome: string }>(nome: string, fichas: readonly F[]): { ficha: F; motivo: MotivoDoGrupo } | null {
  const procurada = palavrasDoNome(nome);
  const achadas = fichas
    .map((ficha) => ({ ficha, motivo: semelhanca(procurada, palavrasDoNome(ficha.nome)) }))
    .filter((a): a is { ficha: F; motivo: MotivoDoGrupo } => a.motivo !== null)
    .sort((a, b) => Number(a.motivo === 'uma-letra') - Number(b.motivo === 'uma-letra') || ordem(a.ficha, b.ficha));
  return achadas[0] ?? null;
}

/** Uma ficha de um grupo como a rota devolve: quantas artes do acervo (null sem o acervo ligado), Produções e regras. */
export interface FichaParecida {
  /** o id da ficha no Teable */
  id: string;
  nome: string;
  categoria: string;
  artes: number | null;
  producoes: number;
  regras: number;
}
/** Uma página dos grupos de atrações parecidas: a rota GET /api/correcoes/atracoes. */
export interface PaginaDasAtracoes {
  /** a partir de 1 */
  pagina: number;
  porPagina: number;
  /** quantos grupos há, em todas as páginas */
  total: number;
  /** cada grupo com o id (os ids das fichas, em ordem, unidos por "+") */
  grupos: (GrupoDeAtracoes<FichaParecida> & { id: string })[];
}
