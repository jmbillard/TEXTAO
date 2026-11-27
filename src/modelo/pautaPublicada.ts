/* A Pauta da edição com o dia publicado no PROMeiro (#127), a regra pura que junta as duas fontes. Até a virada (#134),
   o fluxo do n8n continua gravando a planilha no Teable, e a pauta do Teable continua valendo: as linhas dela ficam
   todas, sempre. Do dia publicado no PROMeiro entra só o que o Teable ainda não tem naquele dia:
   - a claquete é a mesma pela atração e pela data, sem olhar a grafia nem as versões ("Terra(Prologo)28/11 Ah" e
     "Terra (Prologo) 28/11 (A)" são uma só), seja qual for o editor: com editores diferentes, vale o do Teable;
   - a tarefa (e o aviso) é a mesma pelo texto e pelo editor: a COMUNICAÇÃO de um não é a de outro.
   Os avisos de cada posição (#125) entram como as linhas com a caixinha de anotação do Teable, com o editor e o turno
   da posição; o recado do dia, como um aviso sem editor e sem turno (o grupo "sem editor" da Pauta).
   Assim nada aparece em dobro e nada do Teable some. Depois da virada, publicar grava no Teable e as duas fontes
   passam a ser a mesma. */
import { horarioEntendido, lerHorario, type PosicaoDaEscala } from './escala.ts';
import { nomeComparavel } from './ligarPeloNome.ts';
import { diaVizinho, linhaDaPauta, type LinhaDaPauta } from './pauta.ts';

/** Um dia publicado no PROMeiro: as posições como foram publicadas. */
export interface DiaPublicado {
  dia: string;
  posicoes: readonly PosicaoDaEscala[];
  /** o recado do dia (#125); '' ou ausente (o dia publicado antes dele): nenhum */
  recado?: string;
}

/** O instante (ISO) de uma hora "HH:MM" de um dia, em São Paulo (sem horário de verão desde 2019). */
const instante = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();

/**
 * As linhas da pauta de um dia publicado, como o Teable guarda: uma por demanda e uma por aviso (a caixinha de anotação
 * marcada), com o editor e o turno da posição; no fim, o recado do dia, um aviso sem editor.
 */
function linhasDoDia({ dia, posicoes, recado = '' }: DiaPublicado): LinhaDaPauta[] {
  const linha = (b: Parameters<typeof linhaDaPauta>[0]) => {
    const l = linhaDaPauta({ data: dia, ...b });
    return l ? [l] : [];
  };
  const daPosicao = posicoes.flatMap((p) => {
    const h = lerHorario(p.horario);
    const turno = horarioEntendido(h) ? { expediente_inicio: instante(dia, h.inicio), expediente_fim: instante(h.viraODia ? diaVizinho(dia, 1) : dia, h.fim) } : {};
    const editor = p.editor.trim();
    return [
      ...p.demandas.flatMap((d) => linha({ id: `promeiro:${d.id}`, claquete: d.texto, editor, anotacao: false, ...turno })),
      // a posição publicada antes do #125 não tem os avisos
      ...(p.avisos ?? []).flatMap((a) => linha({ id: `promeiro:${a.id}`, claquete: a.texto, editor, anotacao: true, ...turno })),
    ];
  });
  return recado.trim() ? [...daPosicao, ...linha({ id: `promeiro:recado:${dia}`, claquete: recado.trim(), editor: '', anotacao: true })] : daPosicao;
}

/** O que faz duas linhas do mesmo dia serem a mesma coisa na pauta. */
const mesma = (l: LinhaDaPauta) => (l.tipo === 'claquete' ? `${l.dia}|claquete|${nomeComparavel(l.semVersao)}` : `${l.dia}|${l.tipo === 'aviso' ? 'aviso' : 'tarefa'}|${nomeComparavel(l.editor)}|${nomeComparavel(l.texto)}`);

/**
 * As linhas do Teable, todas, mais as dos dias publicados no PROMeiro que o Teable não tem naquele dia; na ordem dos
 * dias (dentro do dia, as do Teable primeiro).
 */
export function juntarAPublicada(doTeable: readonly LinhaDaPauta[], publicadas: readonly DiaPublicado[]): LinhaDaPauta[] {
  if (!publicadas.length) return [...doTeable];
  const ja = new Set(doTeable.map(mesma));
  // só contra o Teable: o que o próprio dia publicado repete fica como foi publicado
  const novas = publicadas.flatMap(linhasDoDia).filter((l) => !ja.has(mesma(l)));
  // a ordenação é estável: dentro do dia, a ordem de antes
  return [...doTeable, ...novas].sort((a, b) => a.dia.localeCompare(b.dia));
}
