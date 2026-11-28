/* A escala na Pauta da edição (o mock-up aprovado: "06:00–15:00 · AVID 30 · manhã"): a ilha e o turno de cada editor
   em cada dia e o aviso de dois editores na mesma ilha. Enquanto a montagem vem da planilha (ADR 0006, antes da
   virada), as posições saem da foto da planilha que o n8n manda (#133), lida pelo colar da planilha (lerAFoto); no dia
   publicado pelo Montar que vale, da escala publicada. A ilha ocupada segue a regra do Montar (ilhasOcupadas: o mesmo
   turno, a mesma sala, #165). Só leitura: nada daqui muda a pauta. Regras puras, as mesmas no servidor e no navegador
   (só sintaxe que o Node apaga). */
import type { ForaNaPauta } from './ausencias.ts';
import type { PosicaoDaEscala, TurnoDaEscala } from './escala.ts';
import { ilhasOcupadas, rotuloDaIlha, salaPeloId, type Ilha } from './ilhas.ts';
import { nomeComparavel } from './ligarPeloNome.ts';

/** Quem mais está na mesma ilha, no mesmo turno: o editor e o horário dele. */
export interface DivideAIlha {
  editor: string;
  horario: string;
}

/** Um editor num dia da escala, como a Pauta mostra. */
export interface EscalaNaPauta {
  dia: string;
  editor: string;
  /** o rótulo da ilha do cadastro ("AVID 30"); '' sem ilha ou com a ilha fora do cadastro */
  ilha: string;
  /** o nome do turno da edição (Configuração); '' quando ele não está lá */
  turno: string;
  /** o horário da posição, como a escala tem ("6h às 15h") */
  horario: string;
  /** os outros editores na mesma ilha e no mesmo turno ([] quando ninguém) */
  divide: DivideAIlha[];
}

type Posicao = Pick<PosicaoDaEscala, 'id' | 'turno' | 'editor' | 'ilha' | 'horario'>;

/** O nome do editor para comparar: sem caixa, acento e pontuação, e sem o "(sem ID)*" que o Teable põe. */
const comparavel = (nome: string) => nomeComparavel(String(nome ?? '').replace(/\(\s*sem\s+id\s*\)\s*\*?/gi, ''));

/**
 * A escala de cada dia como a Pauta mostra: um item por editor no dia (a primeira posição dele), na ordem das posições;
 * a vaga (sem editor) fica de fora. A ilha é o rótulo do cadastro; o turno, o nome do turno da edição.
 */
export function escalaNaPauta(dias: readonly { dia: string; posicoes: readonly Posicao[] }[], o: { ilhas: readonly Ilha[]; turnos: readonly TurnoDaEscala[] }): EscalaNaPauta[] {
  const porId = new Map(o.ilhas.map((i) => [i.id, i]));
  const sala = salaPeloId(o.ilhas);
  const nomeDoTurno = new Map(o.turnos.map((t) => [t.id, t.nome]));
  return dias.flatMap(({ dia, posicoes }) => {
    // a ilha fora do cadastro não divide nada (não se sabe que sala é)
    const comIlha = posicoes.filter((p) => p.editor.trim()).map((p) => ({ ...p, ilha: porId.has(p.ilha) ? p.ilha : '' }));
    const ocupadas = new Map(ilhasOcupadas(comIlha, sala).map((x) => [x.posicao, x.com]));
    const vistos = new Set<string>();
    return comIlha.flatMap((p) => {
      const k = comparavel(p.editor);
      if (vistos.has(k)) return [];
      vistos.add(k);
      const ilha = porId.get(p.ilha);
      const divide = (ocupadas.get(p.id) ?? []).map((id) => comIlha.find((q) => q.id === id)).filter((q): q is (typeof comIlha)[number] => !!q && comparavel(q.editor) !== k);
      return [{ dia, editor: p.editor.trim(), ilha: ilha ? rotuloDaIlha(ilha) : '', turno: nomeDoTurno.get(p.turno) ?? '', horario: p.horario, divide: divide.map((q) => ({ editor: q.editor.trim(), horario: q.horario })) }];
    });
  });
}

/** O editor da pauta naquele dia, na escala (pelo nome sem caixa e acento); null sem ele. */
export function naEscala(escala: readonly EscalaNaPauta[] | undefined, dia: string, editor: string): EscalaNaPauta | null {
  const k = comparavel(editor);
  if (!k) return null;
  return (escala ?? []).find((e) => e.dia === dia && comparavel(e.editor) === k) ?? null;
}

/** A ilha do editor na semana (a fileira da Semana): a que mais se repete; no empate, a do dia mais recente. */
export function ilhaDaSemana(escala: readonly EscalaNaPauta[] | undefined, editor: string): string {
  const k = comparavel(editor);
  const contas = new Map<string, { n: number; ultimo: string }>();
  for (const e of escala ?? []) {
    if (!e.ilha || comparavel(e.editor) !== k) continue;
    const c = contas.get(e.ilha) ?? { n: 0, ultimo: '' };
    contas.set(e.ilha, { n: c.n + 1, ultimo: e.dia > c.ultimo ? e.dia : c.ultimo });
  }
  return [...contas].sort(([, a], [, b]) => b.n - a.n || b.ultimo.localeCompare(a.ultimo))[0]?.[0] ?? '';
}

/**
 * Quem está fora, com o que a planilha diz (DM, folga, férias, lidos pelo colar da planilha) junto das ausências do
 * PROMeiro: a da planilha entra sem motivo, e quem o PROMeiro já tem fora no dia não se repete. Na ordem dos dias.
 */
export function foraPelaPlanilha(doPromeiro: readonly ForaNaPauta[], daPlanilha: readonly { dia: string; fora: readonly string[] }[]): ForaNaPauta[] {
  const todos: ForaNaPauta[] = [...doPromeiro];
  for (const { dia, fora } of daPlanilha)
    for (const nome of fora) {
      const editor = nome.trim();
      if (editor && !todos.some((f) => f.dia === dia && comparavel(f.editor) === comparavel(editor))) todos.push({ dia, editor });
    }
  return todos.map((f, i) => [f, i] as const).sort(([a, i], [b, j]) => a.dia.localeCompare(b.dia) || i - j).map(([f]) => f);
}
