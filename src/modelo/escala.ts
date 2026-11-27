/* Montar a pauta (#123): as regras puras do rascunho do dia que a coordenação monta, as mesmas no servidor e no
   navegador (só sintaxe que o Node apaga). O dia tem posições, uma por editor em cada turno; cada posição tem o
   editor, o horário e as demandas (claquetes e tarefas, texto livre). O PROMeiro aceita qualquer grafia e grava no
   padrão (ADR 0006): o horário ("22 as 6" vira "22h às 6h") e o código de versão da claquete, pela correção de grafia.
   A demanda não depende de roteiro nem de claquete no banco: a leitura diz o que o PROMeiro entendeu dela. */
import { claqueteNoPadrao } from './correcaoDeGrafia.ts';
import { nomeComparavel } from './ligarPeloNome.ts';
import { dataDaVersao, lerVersoes, tipoDaLinha, type Versao } from './pauta.ts';
import { lerDataDaClaquete } from './vocabularios.ts';
import type { Ilha } from './ilhas.ts';

/** O id de um turno: os de fábrica (madrugada, manha, tarde, noite) e os criados na Configuração (#124). */
export type IdDoTurno = string;
export interface TurnoDaEscala {
  id: IdDoTurno;
  nome: string;
  /** o horário padrão de uma posição nova do turno, já no padrão */
  horario: string;
}
/** Os quatro de fábrica, na ordem da planilha: valem sem nada salvo na Configuração (src/modelo/turnos.ts). */
export const TURNOS_DE_FABRICA: readonly TurnoDaEscala[] = [
  { id: 'madrugada', nome: 'Madrugada', horario: '22h às 6h' },
  { id: 'manha', nome: 'Manhã', horario: '6h às 15h' },
  { id: 'tarde', nome: 'Tarde', horario: '14h às 23h' },
  { id: 'noite', nome: 'Noite', horario: '20h às 2h' },
];
export const ehTurno = (x: unknown): x is IdDoTurno => TURNOS_DE_FABRICA.some((t) => t.id === x);

/** Cada dia está vazio (nada montado) ou em rascunho (montado e não publicado). Publicar vem depois. */
export type EstadoDoDia = 'vazio' | 'rascunho';
export const estadoDoDia = (posicoes: readonly unknown[]): EstadoDoDia => (posicoes.length ? 'rascunho' : 'vazio');

/** Uma demanda da posição: uma claquete ou uma tarefa, como foi escrita (a claquete, no padrão). */
export interface DemandaDaEscala {
  id: string;
  texto: string;
}
/** Uma posição do dia: o lugar de um editor num turno, com o horário e as demandas. */
export interface PosicaoDaEscala {
  id: string;
  turno: IdDoTurno;
  /** o nome como escrito ou escolhido da lista; '' sem editor */
  editor: string;
  /** o id da ilha, da lista das ilhas cadastradas; '' sem ilha */
  ilha: string;
  /** no padrão quando o PROMeiro entende; senão, como foi escrito */
  horario: string;
  demandas: DemandaDaEscala[];
}
/** O dia como a rota devolve (GET e PUT /api/montar-pauta). */
export interface DiaDaEscala {
  dia: string;
  estado: EstadoDoDia;
  posicoes: PosicaoDaEscala[];
  /** a semana do dia, de segunda a domingo, com o estado de cada um (as abas) */
  semana: { dia: string; estado: EstadoDoDia }[];
  turnos: TurnoDaEscala[];
  /** os nomes dos editores cadastrados, para a lista */
  editores: string[];
  /** as ilhas cadastradas, para a lista (#124) */
  ilhas: Ilha[];
  /** a ilha de costume de cada editor (pelo nome comparável), tirada do histórico das posições */
  costume: Record<string, string>;
  /** as posições cuja ilha já está ocupada naquele turno, com as outras que dividem a ilha */
  ocupadas: { posicao: string; ilha: string; com: string[] }[];
  /** quando o rascunho foi gravado por último, e por quem (null: nunca) */
  gravadoEm: string | null;
  gravadoPor: string | null;
}

/* ---------- o horário ---------- */

/** O horário entendido: o padrão ("22h às 6h"), o início e o fim em horas, a duração e se passa da meia-noite. */
export interface HorarioLido {
  padrao: string;
  inicio: string;
  fim: string;
  minutos: number;
  viraODia: boolean;
}

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
const dois = (n: number) => String(n).padStart(2, '0');
const escrita = (h: number, m: number) => `${h}h${m ? dois(m) : ''}`;
/** "22 as 6", "22H ÀS 06", "8:30 - 17", "6h-15h", "das 20 às 2", "08h até 17h". */
const HORARIO = /^(?:DAS?\s+|DE\s+)?(\d{1,2})(?:\s*[H:]\s*(\d{2})?)?\s*(?:AS|A|ATE|-|–|—)\s*(\d{1,2})(?:\s*[H:]\s*(\d{2})?)?\s*H?$/;

/**
 * O horário escrito de qualquer jeito, no padrão: "22 as 6" é "22h às 6h", "8:30 - 17" é "8h30 às 17h"; o fim
 * 24 é 0h. null para o vazio; { erro } para o que não é horário (aí ele fica como foi escrito).
 */
export function lerHorario(texto: string): HorarioLido | { erro: string } | null {
  const t = semAcento(String(texto ?? '')).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const m = HORARIO.exec(t);
  if (!m) return { erro: 'não entendi o horário' };
  const [h1, m1, h2, m2] = [m[1], m[2], m[3], m[4]].map((x) => Number(x ?? 0));
  if (h1 > 23 || h2 > 24 || m1 > 59 || m2 > 59 || (h2 === 24 && m2 > 0)) return { erro: 'hora que não existe' };
  const fimH = h2 % 24;
  const de = h1 * 60 + m1;
  const ate = fimH * 60 + m2;
  return { padrao: `${escrita(h1, m1)} às ${escrita(fimH, m2)}`, inicio: `${dois(h1)}:${dois(m1)}`, fim: `${dois(fimH)}:${dois(m2)}`, minutos: (ate - de + 1440) % 1440, viraODia: ate <= de };
}
export const horarioEntendido = (h: ReturnType<typeof lerHorario>): h is HorarioLido => !!h && 'padrao' in h;

/** O horário como o PROMeiro grava: o padrão, quando entende; senão, como foi escrito (sem os espaços das pontas). */
export function horarioNoPadrao(texto: string): string {
  const h = lerHorario(texto);
  return horarioEntendido(h) ? h.padrao : String(texto ?? '').trim();
}

/* ---------- a demanda ---------- */

/** O que o PROMeiro entendeu de uma linha de demanda. */
export type DemandaLida =
  | { tipo: 'vazia' }
  | { tipo: 'tarefa'; padrao: string; mudou: boolean }
  | {
      tipo: 'claquete';
      /** o nome da atração, como escrito (o texto antes da data, ou antes do código sem data) */
      atracao: string;
      /** a data da claquete (AAAA-MM-DD), no ano mais perto do dia; null sem data */
      data: string | null;
      versoes: Versao[];
      /** a claquete como o PROMeiro grava */
      padrao: string;
      mudou: boolean;
    };

/**
 * Uma linha de demanda: claquete (o nome da atração e a data, como na pauta; ou o nome com um código de versão
 * conhecido, sem a data) ou tarefa (o resto: COMUNICAÇÃO, CALHAUS). Da claquete, a atração, a data, as versões (as
 * etiquetas da pauta) e a grafia no padrão (a correção de grafia).
 * @param dia o dia da escala (AAAA-MM-DD): a data e as versões são lidas perto dele
 */
export function lerDemanda(texto: string, dia: string): DemandaLida {
  const t = String(texto ?? '').trim();
  if (!t) return { tipo: 'vazia' };
  const { versoes, semVersao } = lerVersoes(t, dia);
  const data = lerDataDaClaquete(t);
  const comData = tipoDaLinha(t, false) === 'claquete';
  const soComCodigo = !data && versoes.length > 0 && versoes.every((v) => v.conhecida) && /\p{L}/u.test(semVersao);
  if (!comData && !soComCodigo) return { tipo: 'tarefa', padrao: t, mudou: false };
  const padrao = claqueteNoPadrao(t);
  const atracao = (data ? t.slice(0, data.inicio) : semVersao).replace(/[\s\-–·,:]+$/u, '').trim();
  // a data escrita, no ano que a deixa mais perto do dia (a de janeiro numa pauta de dezembro é do ano seguinte)
  const quando = data ? dataDaVersao(t, dia) : null;
  return { tipo: 'claquete', atracao, data: quando ? quando.toISOString().slice(0, 10) : null, versoes, padrao, mudou: padrao !== t };
}

/** A demanda como o PROMeiro grava: a claquete no padrão; a tarefa como está. */
export function demandaNoPadrao(texto: string, dia: string): string {
  const l = lerDemanda(texto, dia);
  return l.tipo === 'vazia' ? '' : l.padrao;
}

/* ---------- o editor na lista ---------- */

export type SituacaoNoDia = { tipo: 'livre' } | { tipo: 'escalado'; turnos: IdDoTurno[] };

/**
 * A situação do editor no dia, para a lista de escolher: livre, ou já escalado em outros turnos (as outras posições
 * com o mesmo nome, sem caixa, acento e pontuação). `exceto` é a posição em que a lista está aberta.
 */
export function situacaoNoDia(editor: string, posicoes: readonly { id: string; turno: string; editor: string }[], exceto: string): SituacaoNoDia {
  const alvo = nomeComparavel(editor);
  const turnos = alvo ? posicoes.filter((p) => p.id !== exceto && nomeComparavel(p.editor) === alvo).map((p) => p.turno as IdDoTurno) : [];
  return turnos.length ? { tipo: 'escalado', turnos: [...new Set(turnos)] } : { tipo: 'livre' };
}
