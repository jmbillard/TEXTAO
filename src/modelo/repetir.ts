/* Montar a pauta, Repetir (#129): copiar para outro dia a escala e as tarefas fixas de um dia, para não montar do
   zero; nunca as claquetes, que mudam todo dia (GLOSSARY.md, "Repetir"). As regras puras, as mesmas no servidor e no
   navegador (só sintaxe que o Node apaga):
   - de onde vem: o mesmo dia na semana passada, o de ontem, ou a semana passada inteira, que só preenche os dias vazios;
   - o que vem: a ilha, o editor, o horário e as tarefas; os avisos e o recado são daquele dia e ficam lá;
   - quem está fora no dia de destino vira vaga, com o motivo ("Elis Furtado está de férias até 4/12"). */
import { lerDemanda, type EstadoDoDia, type PosicaoDaEscala } from './escala.ts';
import { motivoDaAusencia, valeNoDia, type Ausencia } from './ausencias.ts';
import { nomeComparavel } from './ligarPeloNome.ts';
import { diaVizinho } from './pauta.ts';

/** De onde vem a escala: o mesmo dia na semana passada, o de ontem ou a semana passada inteira (nos dias vazios). */
export type DeOndeRepetir = 'semana-passada' | 'ontem' | 'semana-inteira';
export const ehDeOndeRepetir = (x: unknown): x is DeOndeRepetir => x === 'semana-passada' || x === 'ontem' || x === 'semana-inteira';

/** Um dia que recebe a escala de outro. */
export interface RepeticaoDoDia {
  origem: string;
  destino: string;
}
/** Quem ficou de fora no dia de destino: a posição dele virou vaga. */
export interface VagaDoRepetir {
  editor: string;
  motivo: string;
}

/**
 * A escala do dia de origem, para o dia de destino: cada posição com o turno, a ilha, o editor e o horário, e só as
 * tarefas das demandas (a claquete fica). Os ids são novos. Quem está fora no destino vira vaga, com o motivo; a ilha
 * que não vale mais (`ilhaVale`) fica vazia.
 * @param novoId o gerador de ids (o prefixo: 'p' para a posição, 'd' para a demanda)
 */
export function repetirODia(
  origem: readonly PosicaoDaEscala[],
  destino: string,
  ausencias: readonly Ausencia[],
  novoId: (prefixo: 'p' | 'd') => string,
  { ilhaVale = () => true }: { ilhaVale?: (ilha: string) => boolean } = {},
): { posicoes: PosicaoDaEscala[]; vagas: VagaDoRepetir[] } {
  const vagas: VagaDoRepetir[] = [];
  const foraNoDestino = ausencias.filter((a) => valeNoDia(a, destino));
  const posicoes = origem.map((p): PosicaoDaEscala => {
    const editor = p.editor.trim();
    const fora = editor ? foraNoDestino.find((a) => nomeComparavel(a.editor) === nomeComparavel(editor)) : undefined;
    const tarefas = p.demandas.filter((d) => lerDemanda(d.texto, destino).tipo === 'tarefa').map((d) => ({ id: novoId('d'), texto: d.texto }));
    const posicao: PosicaoDaEscala = { id: novoId('p'), turno: p.turno, editor: fora ? '' : editor, ilha: p.ilha && ilhaVale(p.ilha) ? p.ilha : '', horario: p.horario, demandas: tarefas, avisos: [] };
    if (!fora) return posicao;
    const motivo = motivoDaAusencia(fora);
    vagas.push({ editor, motivo });
    return { ...posicao, vaga: `${editor} está de ${motivo}` };
  });
  return { posicoes, vagas };
}

/**
 * Os dias da repetição: o mesmo dia na semana passada ou o de ontem, para o dia; a semana passada inteira, para cada
 * dia vazio da semana, do mesmo dia na semana passada.
 */
export function diasDoRepetir(dia: string, deOnde: DeOndeRepetir, semana: readonly { dia: string; estado: EstadoDoDia }[]): RepeticaoDoDia[] {
  if (deOnde === 'semana-passada') return [{ origem: diaVizinho(dia, -7), destino: dia }];
  if (deOnde === 'ontem') return [{ origem: diaVizinho(dia, -1), destino: dia }];
  return semana.filter((s) => s.estado === 'vazio').map((s) => ({ origem: diaVizinho(s.dia, -7), destino: s.dia }));
}

/** As opções do dia vazio: de onde vem cada uma e quantas posições traz; a semana inteira, os vazios que têm o que trazer. */
export interface OpcoesDoRepetir {
  semanaPassada: { origem: string; posicoes: number };
  ontem: { origem: string; posicoes: number };
  semanaInteira: RepeticaoDoDia[];
}

/** @param quantas quantas posições o dia tem montadas */
export function opcoesDoRepetir(dia: string, semana: readonly { dia: string; estado: EstadoDoDia }[], quantas: (dia: string) => number): OpcoesDoRepetir {
  const de = (deOnde: DeOndeRepetir) => {
    const [{ origem }] = diasDoRepetir(dia, deOnde, semana);
    return { origem, posicoes: quantas(origem) };
  };
  return { semanaPassada: de('semana-passada'), ontem: de('ontem'), semanaInteira: diasDoRepetir(dia, 'semana-inteira', semana).filter((r) => quantas(r.origem) > 0) };
}
