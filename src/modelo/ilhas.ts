/* As ilhas (#124): a sala de edição, com tipo (AVID, VDI, ILHA…), número e nome opcional, no cadastro de ilhas do
   PROMeiro. AVID e ILHA com o mesmo número são duas ilhas, como estão escritas (até a coordenação dizer se são a
   mesma). Aqui, as regras puras, as mesmas no servidor e no navegador (só sintaxe que o Node apaga): o rótulo, a ilha
   escrita de qualquer jeito, a ilha de costume de cada editor (tirada do histórico das posições) e a ilha ocupada
   naquele turno. */
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

/** "AVID 46". */
export const rotuloDaIlha = (i: Pick<Ilha, 'tipo' | 'numero'>) => `${i.tipo} ${i.numero}`;

/** Em ordem: pelo tipo, e o número como número ("7" antes de "46"). */
export const emOrdem = (ilhas: readonly Ilha[]) =>
  [...ilhas].sort((a, b) => a.tipo.localeCompare(b.tipo, 'pt-BR') || a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));

/**
 * A ilha de um texto escrito de qualquer jeito: "AVID 46", "avid46", "ILHA 46" ou só "46" (quando um só tipo tem esse
 * número). null quando nenhuma ou mais de uma batem.
 */
export function reconhecerIlha(texto: string, ilhas: readonly Ilha[]): Ilha | null {
  const t = nomeComparavel(texto).replace(/\s+/g, '');
  if (!t) return null;
  const inteira = ilhas.filter((i) => nomeComparavel(rotuloDaIlha(i)).replace(/\s+/g, '') === t);
  if (inteira.length === 1) return inteira[0];
  const peloNumero = ilhas.filter((i) => nomeComparavel(i.numero) === t);
  if (peloNumero.length === 1) return peloNumero[0];
  const peloNome = ilhas.filter((i) => i.nome && nomeComparavel(i.nome).replace(/\s+/g, '') === t);
  return peloNome.length === 1 ? peloNome[0] : null;
}

/** As ilhas que casam com o que foi escrito (o começo do rótulo, do número ou do nome), em ordem. */
export function ilhasQueCasam(escrito: string, ilhas: readonly Ilha[]): Ilha[] {
  const q = nomeComparavel(escrito).replace(/\s+/g, '');
  if (!q) return emOrdem(ilhas);
  const casa = (i: Ilha) => [rotuloDaIlha(i), i.numero, i.nome].some((x) => x && nomeComparavel(x).replace(/\s+/g, '').startsWith(q));
  return emOrdem(ilhas.filter(casa));
}

/** Uma posição do histórico: o dia, o editor como escrito e a ilha. */
export interface PosicaoDoHistorico {
  dia: string;
  editor: string;
  ilha: string;
}

/**
 * A ilha de costume de cada editor (pelo nome comparável: sem caixa, acento e pontuação): a ilha em que ele mais
 * esteve no histórico; no empate, a mais recente. Só as ilhas de `valem` (as do cadastro), quando dada.
 */
export function ilhasDeCostume(historico: readonly PosicaoDoHistorico[], valem?: ReadonlySet<string>): Record<string, string> {
  const contas = new Map<string, Map<string, { n: number; ultimo: string }>>();
  for (const p of historico) {
    const editor = nomeComparavel(p.editor);
    if (!editor || !p.ilha || (valem && !valem.has(p.ilha))) continue;
    const doEditor = contas.get(editor) ?? new Map();
    const c = doEditor.get(p.ilha) ?? { n: 0, ultimo: '' };
    doEditor.set(p.ilha, { n: c.n + 1, ultimo: p.dia > c.ultimo ? p.dia : c.ultimo });
    contas.set(editor, doEditor);
  }
  const costume: Record<string, string> = {};
  for (const [editor, doEditor] of contas) {
    const [ilha] = [...doEditor].sort(([, a], [, b]) => b.n - a.n || b.ultimo.localeCompare(a.ultimo))[0];
    costume[editor] = ilha;
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

/** As outras posições do mesmo turno na mesma ilha (`exceto` é a posição de que se fala). */
export const quemEstaNaIlha = <P extends PosicaoComIlha>(ilha: string, turno: string, posicoes: readonly P[], exceto: string): P[] =>
  ilha ? posicoes.filter((p) => p.id !== exceto && p.turno === turno && p.ilha === ilha) : [];

/** As posições cuja ilha já está ocupada naquele turno, com as outras que dividem a ilha. */
export function ilhasOcupadas(posicoes: readonly PosicaoComIlha[]): { posicao: string; ilha: string; com: string[] }[] {
  return posicoes
    .map((p) => ({ posicao: p.id, ilha: p.ilha, com: quemEstaNaIlha(p.ilha, p.turno, posicoes, p.id).map((o) => o.id) }))
    .filter((o) => o.com.length);
}
