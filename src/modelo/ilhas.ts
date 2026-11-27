/* As ilhas (#124): a sala de edição, com tipo (AVID, VDI, ILHA…), número e nome opcional, no cadastro de ilhas do
   PROMeiro. "AVID 46", "ILHA 46" e só "46" são a mesma sala (confirmado pela edição em 27/11/2026, #165): a regra
   é a `salaDaIlha`, e todo lugar que compara ilhas passa por ela (ou pela `salaPeloId`, quando a ilha é o id do
   cadastro). A VDI é uma ilha comum, ela mesma. A ilha em branco é "sem ilha", nunca a mesma de outra. Aqui, as
   regras puras, as mesmas no servidor e no navegador (só sintaxe que o Node apaga): a sala, o rótulo, a ilha escrita
   de qualquer jeito, a ilha de costume de cada editor (tirada do histórico das posições) e a ilha ocupada naquele
   turno. */
import { nomeComparavel } from './ligarPeloNome.ts';

export interface Ilha {
  id: string;
  /** em maiúsculas: AVID, VDI, ILHA */
  tipo: string;
  /** como está escrito: "46", "12B" */
  numero: string;
  /** opcional: '' sem nome */
  nome: string;
}

/** Os tipos que a lista oferece antes de haver ilha cadastrada. */
export const TIPOS_DE_ILHA = ['AVID', 'VDI', 'ILHA'] as const;

/** Os tipos que são só a sala: "AVID 46", "ILHA 46" e "46" são a mesma. */
const TIPOS_DA_SALA = new Set(['', 'AVID', 'ILHA']);
const compacto = (t: string) => nomeComparavel(t).replace(/\s+/g, '');

/** A sala do tipo e do número: o tipo sai quando é AVID ou ILHA, e os zeros da frente do número também. */
const sala = (tipo: string, numero: string) => {
  const n = compacto(numero).replace(/^0+(?=\d)/, '');
  const t = compacto(tipo);
  return TIPOS_DA_SALA.has(t) ? n : `${t} ${n}`;
};

/**
 * A regra da ilha (#165): a sala de uma ilha escrita de qualquer jeito. "AVID 46", "ILHA 46", "Ilha 46" e "46" dão
 * "46"; "VDI 5" dá "VDI 5" (é ela mesma); o texto sem número (um nome) fica comparável; a ilha em branco dá ''.
 */
export function salaDaIlha(texto: string): string {
  const t = compacto(texto);
  if (!t) return '';
  const m = /^([A-Z]*?)(\d[A-Z0-9]*)$/.exec(t);
  return m ? sala(m[1], m[2]) : t;
}

/** A sala de uma ilha do cadastro. */
export const salaDe = (i: Pick<Ilha, 'tipo' | 'numero'>) => sala(i.tipo, i.numero);

/** As duas são a mesma ilha (pela `salaDaIlha`); a ilha em branco nunca é a mesma de nenhuma. */
export const mesmaIlha = (a: string, b: string) => {
  const x = salaDaIlha(a);
  return !!x && x === salaDaIlha(b);
};

/**
 * A sala pelo id do cadastro, para comparar as posições (que guardam o id): as do cadastro que são a mesma sala dão o
 * mesmo; a juntada (`juntadas`: o id que saiu → o que ficou) vale pela que ficou; o id fora do cadastro é ele mesmo;
 * a ilha em branco dá ''.
 */
export function salaPeloId(ilhas: readonly Ilha[], juntadas: Readonly<Record<string, string>> = {}): (id: string) => string {
  const porId = new Map(ilhas.map((i) => [i.id, salaDe(i)]));
  return (id) => {
    if (!id) return '';
    const fica = juntadas[id] ?? id;
    return porId.get(fica) ?? `#${fica}`;
  };
}

/** As ilhas do cadastro que são a mesma sala (as repetidas, para juntar), cada grupo em ordem. */
export function ilhasRepetidas(ilhas: readonly Ilha[]): Ilha[][] {
  const grupos = new Map<string, Ilha[]>();
  for (const i of emOrdem(ilhas)) grupos.set(salaDe(i), [...(grupos.get(salaDe(i)) ?? []), i]);
  return [...grupos.values()].filter((g) => g.length > 1);
}

/** "AVID 46". */
export const rotuloDaIlha = (i: Pick<Ilha, 'tipo' | 'numero'>) => `${i.tipo} ${i.numero}`;

/** Em ordem: pelo tipo, e o número como número ("7" antes de "46"). */
export const emOrdem = (ilhas: readonly Ilha[]) =>
  [...ilhas].sort((a, b) => a.tipo.localeCompare(b.tipo, 'pt-BR') || a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));

/**
 * A ilha de um texto escrito de qualquer jeito: "AVID 46", "avid46", "ILHA 46" ou só "46" (a mesma sala, #165), ou só
 * o número de outro tipo ("7" para a VDI 7, quando uma sala só tem esse número), ou o nome. Duas do cadastro na mesma
 * sala (repetidas, antes de juntar): a do rótulo escrito, senão a primeira em ordem. null quando nenhuma ou mais de
 * uma sala batem.
 */
export function reconhecerIlha(texto: string, ilhas: readonly Ilha[]): Ilha | null {
  const t = compacto(texto);
  if (!t) return null;
  const inteira = ilhas.find((i) => compacto(rotuloDaIlha(i)) === t);
  if (inteira) return inteira;
  const s = salaDaIlha(texto);
  const daSala = emOrdem(ilhas.filter((i) => salaDe(i) === s));
  if (daSala.length) return daSala[0];
  const umaSala = (xs: Ilha[]) => (xs.length && new Set(xs.map(salaDe)).size === 1 ? emOrdem(xs)[0] : null);
  const peloNumero = umaSala(ilhas.filter((i) => compacto(i.numero) === t));
  if (peloNumero) return peloNumero;
  return umaSala(ilhas.filter((i) => i.nome && compacto(i.nome) === t));
}

/** As ilhas que casam com o que foi escrito (o começo do rótulo, do número, da sala ou do nome), em ordem. */
export function ilhasQueCasam(escrito: string, ilhas: readonly Ilha[]): Ilha[] {
  const q = compacto(escrito);
  if (!q) return emOrdem(ilhas);
  const s = /\d/.test(q) ? compacto(salaDaIlha(escrito)) : '';
  const casa = (i: Ilha) => [rotuloDaIlha(i), i.numero, i.nome].some((x) => x && compacto(x).startsWith(q)) || (!!s && compacto(salaDe(i)).startsWith(s));
  return emOrdem(ilhas.filter(casa));
}

/** Uma posição do histórico: o dia, o editor como escrito e a ilha. */
export interface PosicaoDoHistorico {
  dia: string;
  editor: string;
  ilha: string;
}

/** Sem o cadastro, cada id é a sua sala. */
const peloProprioId = (id: string) => id;

/**
 * A ilha de costume de cada editor (pelo nome comparável: sem caixa, acento e pontuação): a ilha em que ele mais
 * esteve no histórico; no empate, a mais recente. Só as ilhas de `valem` (as do cadastro), quando dada. Com `sala`
 * (a `salaPeloId`), a mesma sala com dois ids conta junto, e fica o id usado por último.
 */
export function ilhasDeCostume(historico: readonly PosicaoDoHistorico[], valem?: ReadonlySet<string>, sala: (id: string) => string = peloProprioId): Record<string, string> {
  const contas = new Map<string, Map<string, { n: number; ultimo: string; id: string }>>();
  for (const p of historico) {
    const editor = nomeComparavel(p.editor);
    if (!editor || !p.ilha || (valem && !valem.has(p.ilha))) continue;
    const doEditor = contas.get(editor) ?? new Map();
    const s = sala(p.ilha);
    const c = doEditor.get(s) ?? { n: 0, ultimo: '', id: p.ilha };
    doEditor.set(s, { n: c.n + 1, ultimo: p.dia >= c.ultimo ? p.dia : c.ultimo, id: p.dia >= c.ultimo ? p.ilha : c.id });
    contas.set(editor, doEditor);
  }
  const costume: Record<string, string> = {};
  for (const [editor, doEditor] of contas) {
    const [, { id }] = [...doEditor].sort(([, a], [, b]) => b.n - a.n || b.ultimo.localeCompare(a.ultimo))[0];
    costume[editor] = id;
  }
  return costume;
}

/** A ilha de costume do editor, ou ''. */
export const ilhaDeCostume = (editor: string, costume: Readonly<Record<string, string>>) => costume[nomeComparavel(editor)] ?? '';

interface PosicaoComIlha {
  id: string;
  turno: string;
  editor: string;
  ilha: string;
}

/**
 * As outras posições do mesmo turno na mesma ilha (`exceto` é a posição de que se fala). Com `sala` (a `salaPeloId`),
 * a mesma sala com outro id do cadastro também; a ilha em branco não divide nada.
 */
export const quemEstaNaIlha = <P extends PosicaoComIlha>(ilha: string, turno: string, posicoes: readonly P[], exceto: string, sala: (id: string) => string = peloProprioId): P[] =>
  ilha ? posicoes.filter((p) => p.id !== exceto && p.turno === turno && !!p.ilha && sala(p.ilha) === sala(ilha)) : [];

/** As posições cuja ilha já está ocupada naquele turno, com as outras que dividem a ilha (`sala`: a `salaPeloId`). */
export function ilhasOcupadas(posicoes: readonly PosicaoComIlha[], sala: (id: string) => string = peloProprioId): { posicao: string; ilha: string; com: string[] }[] {
  return posicoes
    .map((p) => ({ posicao: p.id, ilha: p.ilha, com: quemEstaNaIlha(p.ilha, p.turno, posicoes, p.id, sala).map((o) => o.id) }))
    .filter((o) => o.com.length);
}
