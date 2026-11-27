/* A Pauta da edição com o dia publicado no PROMeiro (#127), a regra pura que junta as duas fontes. Até a virada (#134),
   o fluxo do n8n continua gravando a planilha no Teable, e a pauta do Teable continua valendo: as linhas dela ficam
   todas, sempre. Do dia publicado no PROMeiro entra só o que o Teable ainda não tem naquele dia:
   - a claquete é a mesma pela atração e pela data, sem olhar a grafia nem as versões ("Terra(Prologo)28/11 Ah" e
     "Terra (Prologo) 28/11 (A)" são uma só), seja qual for o editor: com editores diferentes, vale o do Teable;
   - a tarefa (e o aviso) é a mesma pelo texto e pelo editor: a COMUNICAÇÃO de um não é a de outro.
   Assim nada aparece em dobro e nada do Teable some. Depois da virada, publicar grava no Teable e as duas fontes
   passam a ser a mesma. */
import { horarioEntendido, lerHorario, type PosicaoDaEscala } from './escala.ts';
import { nomeComparavel } from './ligarPeloNome.ts';
import { diaVizinho, linhaDaPauta, type LinhaDaPauta } from './pauta.ts';

/** Um dia publicado no PROMeiro: as posições como foram publicadas. */
export interface DiaPublicado {
  dia: string;
  posicoes: readonly PosicaoDaEscala[];
}

/** O instante (ISO) de uma hora "HH:MM" de um dia, em São Paulo (sem horário de verão desde 2019). */
const instante = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();

/** As linhas da pauta de um dia publicado: uma por demanda, com o editor e o turno da posição (como o Teable guarda). */
function linhasDoDia({ dia, posicoes }: DiaPublicado): LinhaDaPauta[] {
  return posicoes.flatMap((p) => {
    const h = lerHorario(p.horario);
    const turno = horarioEntendido(h) ? { expediente_inicio: instante(dia, h.inicio), expediente_fim: instante(h.viraODia ? diaVizinho(dia, 1) : dia, h.fim) } : {};
    return p.demandas.flatMap((d) => {
      const l = linhaDaPauta({ id: `promeiro:${d.id}`, claquete: d.texto, editor: p.editor.trim(), data: dia, anotacao: false, ...turno });
      return l ? [l] : [];
    });
  });
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
