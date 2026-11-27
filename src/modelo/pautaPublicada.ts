/* A Pauta da edição com o dia publicado no PROMeiro (#127), a regra pura que junta as duas fontes, e o formato em que o
   dia publicado vai ao Teable (#134).
   Antes da virada (a chave da Configuração desligada), o fluxo do n8n continua gravando a planilha no Teable, e a pauta
   do Teable continua valendo: as linhas dela ficam todas, sempre. Do dia publicado no PROMeiro entra só o que o Teable
   ainda não tem naquele dia:
   - a claquete é a mesma pela atração e pela data, sem olhar a grafia nem as versões ("Terra(Prologo)28/11 Ah" e
     "Terra (Prologo) 28/11 (A)" são uma só), seja qual for o editor: com editores diferentes, vale o do Teable;
   - a tarefa (e o aviso) é a mesma pelo texto e pelo editor: a COMUNICAÇÃO de um não é a de outro.
   Os avisos de cada posição (#125) entram como as linhas com a caixinha de anotação do Teable, com o editor e o turno
   da posição; o recado do dia, como um aviso sem editor e sem turno (o grupo "sem editor" da Pauta).
   Assim nada aparece em dobro e nada do Teable some.
   Depois da virada (a chave ligada), publicar grava o dia no Teable (servidor/pauta-no-teable.mjs), e no dia que o
   PROMeiro gravou (`vale`) a regra se inverte: vale o publicado, inteiro, e as linhas do Teable daquele dia saem da
   junção, porque são o espelho dele. O dia que o PROMeiro não gravou (o que ninguém publicou, os de antes da virada)
   continua como antes. */
import { horarioEntendido, lerHorario, type PosicaoDaEscala } from './escala.ts';
import { nomeComparavel } from './ligarPeloNome.ts';
import { diaVizinho, linhaDaPauta, type LinhaDaPauta } from './pauta.ts';

/** Um dia publicado no PROMeiro: as posições como foram publicadas. */
export interface DiaPublicado {
  dia: string;
  posicoes: readonly PosicaoDaEscala[];
  /** o recado do dia (#125); '' ou ausente (o dia publicado antes dele): nenhum */
  recado?: string;
  /** depois da virada (#134): o PROMeiro gravou este dia no Teable, e o publicado vale por cima dele */
  vale?: true;
}

/** Uma linha da pauta como o PROMeiro grava no Teable (a tabela EDICAO_producao), com o item publicado que ela é. */
export interface RegistroDaPauta {
  /** o id da demanda ou do aviso publicado; `recado:AAAA-MM-DD` para o recado do dia */
  item: string;
  claquete: string;
  /** o nome do editor ('' sem editor); o servidor liga ao cadastro */
  editor: string;
  /** 00:00 do dia em São Paulo (ISO) */
  data: string;
  expediente_inicio: string | null;
  expediente_fim: string | null;
  /** a caixinha de anotação: os avisos e o recado */
  anotacao: boolean;
}

/** O instante (ISO) de uma hora "HH:MM" de um dia, em São Paulo (sem horário de verão desde 2019). */
const instante = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();

/**
 * O dia publicado como o Teable guarda, no formato que o fluxo do n8n grava: uma linha por demanda e uma por aviso (a
 * caixinha de anotação marcada), com o editor, a data e o expediente da posição (sem ele, quando o PROMeiro não entendeu
 * o horário); no fim, o recado do dia, um aviso sem editor e sem expediente.
 */
export function registrosDoDia({ dia, posicoes, recado = '' }: DiaPublicado): RegistroDaPauta[] {
  const data = instante(dia, '00:00');
  const daPosicao = posicoes.flatMap((p) => {
    const h = lerHorario(p.horario);
    const turno = horarioEntendido(h) ? { expediente_inicio: instante(dia, h.inicio), expediente_fim: instante(h.viraODia ? diaVizinho(dia, 1) : dia, h.fim) } : { expediente_inicio: null, expediente_fim: null };
    const editor = p.editor.trim();
    return [
      ...p.demandas.map((d) => ({ item: d.id, claquete: d.texto, editor, data, ...turno, anotacao: false })),
      // a posição publicada antes do #125 não tem os avisos
      ...(p.avisos ?? []).map((a) => ({ item: a.id, claquete: a.texto, editor, data, ...turno, anotacao: true })),
    ];
  });
  return recado.trim() ? [...daPosicao, { item: `recado:${dia}`, claquete: recado.trim(), editor: '', data, expediente_inicio: null, expediente_fim: null, anotacao: true }] : daPosicao;
}

/** As linhas da pauta de um dia publicado, como a Pauta lê do Teable (o id diz que vieram do PROMeiro). */
function linhasDoDia(publicado: DiaPublicado): LinhaDaPauta[] {
  return registrosDoDia(publicado).flatMap(({ item, ...r }) => {
    const l = linhaDaPauta({ id: `promeiro:${item}`, ...r });
    return l ? [l] : [];
  });
}

/** O que faz duas linhas do mesmo dia serem a mesma coisa na pauta. */
const mesma = (l: LinhaDaPauta) => (l.tipo === 'claquete' ? `${l.dia}|claquete|${nomeComparavel(l.semVersao)}` : `${l.dia}|${l.tipo === 'aviso' ? 'aviso' : 'tarefa'}|${nomeComparavel(l.editor)}|${nomeComparavel(l.texto)}`);

/**
 * As linhas do Teable mais as dos dias publicados no PROMeiro, na ordem dos dias. No dia que vale (#134: o PROMeiro o
 * gravou no Teable), só as publicadas; nos outros, as do Teable, todas, e as publicadas que o Teable não tem naquele dia
 * (dentro do dia, as do Teable primeiro).
 */
export function juntarAPublicada(doTeable: readonly LinhaDaPauta[], publicadas: readonly DiaPublicado[]): LinhaDaPauta[] {
  if (!publicadas.length) return [...doTeable];
  const valem = new Set(publicadas.filter((p) => p.vale).map((p) => p.dia));
  const teable = doTeable.filter((l) => !valem.has(l.dia));
  const ja = new Set(teable.map(mesma));
  // só contra o Teable: o que o próprio dia publicado repete fica como foi publicado
  const novas = publicadas.flatMap((p) => (p.vale ? linhasDoDia(p) : linhasDoDia(p).filter((l) => !ja.has(mesma(l)))));
  // a ordenação é estável: dentro do dia, a ordem de antes
  return [...teable, ...novas].sort((a, b) => a.dia.localeCompare(b.dia));
}
