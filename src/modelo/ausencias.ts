/* Montar a pauta, ausências (#128): as regras puras do período em que uma pessoa está fora (férias, folga, DM ou
   licença), as mesmas no servidor e no navegador (só sintaxe que o Node apaga). A ausência é marcada uma vez, por
   pessoa, e vale para todos os dias do período: nas férias e na licença, de "de" a "até"; na folga e no DM, um dia só.
   Na Pauta da edição, todos veem só "fora"; o motivo (o tipo e o período) e a observação, só a coordenação e os
   administradores, porque o motivo é pessoal. */
import { nomeComparavel } from './ligarPeloNome.ts';

export type TipoDeAusencia = 'ferias' | 'folga' | 'dm' | 'licenca';
/** Os tipos, na ordem da tela, com o nome escrito. */
export const TIPOS_DE_AUSENCIA: readonly { id: TipoDeAusencia; nome: string }[] = [
  { id: 'ferias', nome: 'férias' },
  { id: 'folga', nome: 'folga' },
  { id: 'dm', nome: 'DM' },
  { id: 'licenca', nome: 'licença' },
];
export const ehTipoDeAusencia = (x: unknown): x is TipoDeAusencia => TIPOS_DE_AUSENCIA.some((t) => t.id === x);
/** Férias e licença têm período (de e até); folga e DM valem um dia só. */
export const temPeriodo = (tipo: TipoDeAusencia) => tipo === 'ferias' || tipo === 'licenca';
export const nomeDoTipo = (tipo: TipoDeAusencia) => TIPOS_DE_AUSENCIA.find((t) => t.id === tipo)?.nome ?? tipo;

/** Uma ausência marcada: quem (o nome como na escala), o tipo, o período (AAAA-MM-DD, os dois inclusive) e a observação. */
export interface Ausencia {
  id: string;
  editor: string;
  tipo: TipoDeAusencia;
  de: string;
  ate: string;
  observacao: string;
}

/** A ausência vale no dia (o período inclui as duas pontas). */
export const valeNoDia = (a: Pick<Ausencia, 'de' | 'ate'>, dia: string) => a.de <= dia && dia <= a.ate;

/** "1/12", de AAAA-MM-DD. */
const diaMes = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/** O motivo escrito: "férias até 12/12", "licença até 3/1", "folga", "DM" (o período de mais de um dia diz o fim). */
export function motivoDaAusencia(a: Pick<Ausencia, 'tipo' | 'de' | 'ate'>): string {
  const nome = nomeDoTipo(a.tipo);
  return temPeriodo(a.tipo) || a.de !== a.ate ? `${nome} até ${diaMes(a.ate)}` : nome;
}

/** Quem está fora num dia da Pauta da edição; o motivo e a observação só para quem pode ver. */
export interface ForaNaPauta {
  dia: string;
  editor: string;
  motivo?: string;
  observacao?: string;
}

/**
 * Quem está fora em cada dia, na ordem dos dias e, no dia, das pessoas (uma vez por pessoa no dia).
 * @param comMotivo a coordenação e os administradores veem o motivo e a observação; os outros, só "fora"
 */
export function foraNaPauta(ausencias: readonly Ausencia[], dias: readonly string[], comMotivo: boolean): ForaNaPauta[] {
  return dias.flatMap((dia) => {
    const vistos = new Set<string>();
    return ausencias
      .filter((a) => valeNoDia(a, dia))
      .sort((a, b) => a.editor.localeCompare(b.editor, 'pt-BR'))
      .filter((a) => !vistos.has(nomeComparavel(a.editor)) && !!vistos.add(nomeComparavel(a.editor)))
      .map((a) => (comMotivo ? { dia, editor: a.editor, motivo: motivoDaAusencia(a), ...(a.observacao ? { observacao: a.observacao } : {}) } : { dia, editor: a.editor }));
  });
}

/** Onde a pessoa está escalada num dia do período: os turnos e se o dia já foi publicado. */
export interface EscaladaNoDia {
  dia: string;
  turnos: string[];
  publicado: boolean;
}

/** Uma demanda tirada de quem saiu de um dia publicado, à espera de ir para uma posição. */
export interface DemandaParaDistribuir {
  id: string;
  texto: string;
  /** de quem ela era */
  deQuem: string;
}

/** O que a tela de montar mostra das ausências (GET /api/montar-pauta/ausencias). */
export interface PainelDasAusencias {
  dia: string;
  /** as que ainda valem a partir da semana do dia, pela data de início */
  ausencias: Ausencia[];
  /** as que valem no dia */
  fora: Ausencia[];
  /** quem está fora e continua escalado num dia já publicado: o PROMeiro oferece tirar */
  noPublicado: { ausencia: string; editor: string; dia: string; turnos: string[] }[];
  paraDistribuir: DemandaParaDistribuir[];
}
