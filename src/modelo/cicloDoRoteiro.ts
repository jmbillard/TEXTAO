/* O ciclo do roteiro (#102, spec #100): o estado de um roteiro num ciclo único e quando aconteceu cada passo, do que o
   PROMeiro já sabe (nada do Trello): a chegada à fila, o envio, a Produção e a data da claquete. Puro e compartilhado:
   o servidor diz o estado ("meus roteiros") e o navegador escreve as datas no relógio local, como a agenda mostra.

   Escrevendo → Em aprovação (antes) → Aprovado (antes) → Em revisão → Produzindo → Entregue → Exibido

   O Escrevendo vale desde o editor de escrita (#189): o Roteiro escrito no PROMeiro está nele enquanto é **sendo
   escrito**; no roteiro que chegou de fora, o passo aconteceu fora do PROMeiro ("fora"). Os dois passos de aprovação
   existem no ciclo, mas são sempre "em breve". Só sintaxe que o Node apaga. */
import type { Etapa } from './producao.ts';

export type EstadoDoCiclo = 'escrevendo' | 'aprovacao' | 'aprovado' | 'revisao' | 'produzindo' | 'entregue' | 'exibido';

/** O ciclo, na ordem; `antes` são os passos de antes do PROMeiro (em breve). */
export const CICLO: readonly { id: EstadoDoCiclo; nome: string; antes: boolean }[] = [
  { id: 'escrevendo', nome: 'Escrevendo', antes: false },
  { id: 'aprovacao', nome: 'Em aprovação', antes: true },
  { id: 'aprovado', nome: 'Aprovado', antes: true },
  { id: 'revisao', nome: 'Em revisão', antes: false },
  { id: 'produzindo', nome: 'Produzindo', antes: false },
  { id: 'entregue', nome: 'Entregue', antes: false },
  { id: 'exibido', nome: 'Exibido', antes: false },
];

/** O que o ciclo lê do roteiro. */
export interface FatosDoCiclo {
  /** quando o roteiro chegou à fila (ISO) */
  chegouEm: string | null;
  /** quando foi enviado ao Trello (ISO); null sem envio */
  enviadoEm: string | null;
  /** a Produção ligada ao roteiro (pelo Roteiro ou pelo card do envio); null sem nenhuma */
  producao: { etapa: Etapa; entradaEm: string | null; entregaEm: string | null } | null;
  /** a data da claquete (AAAA-MM-DD); sem ela, o roteiro fica no último estado conhecido */
  dataExibicao: string | null | undefined;
  /** o Roteiro escrito no PROMeiro (#189): 'sendo-escrito' antes do primeiro Enviar, 'enviado' depois; ausente no
      roteiro que chegou de fora */
  escrito?: 'sendo-escrito' | 'enviado' | null;
  /** quando o Roteiro escrito no PROMeiro começou (ISO) */
  escritoEm?: string | null;
}

export interface PassoDoCiclo {
  id: EstadoDoCiclo;
  nome: string;
  /** em-breve: de antes do PROMeiro; fora: aconteceu fora do PROMeiro (o Escrevendo do roteiro que chegou de fora);
      feito: já passou; agora: o estado; depois: ainda não */
  situacao: 'em-breve' | 'fora' | 'feito' | 'agora' | 'depois';
  /** quando aconteceu (ISO; no Exibido, a data AAAA-MM-DD); null no passo que não aconteceu ou sem data conhecida */
  quando: string | null;
}

export interface CicloDoRoteiro {
  estado: EstadoDoCiclo;
  passos: PassoDoCiclo[];
}

const ehData = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * O estado e os passos. Escrevendo: o Roteiro escrito no PROMeiro ainda não foi enviado. Em revisão: chegou à fila. Produzindo: foi enviado (com a Produção em Entrada ou Produzindo,
 * ou ainda sem ela). Entregue: a Produção está Entregue ou arquivada. Exibido: a data da claquete é de antes de hoje.
 * @param hoje o dia de hoje (AAAA-MM-DD), no fuso da casa
 */
export function cicloDoRoteiro(f: FatosDoCiclo, hoje: string): CicloDoRoteiro {
  const etapa = f.producao?.etapa;
  const entregue = etapa === 'entregue' || etapa === 'arquivada';
  const exibido = ehData(f.dataExibicao) && f.dataExibicao < hoje;
  const sendoEscrito = f.escrito === 'sendo-escrito';
  const estado: EstadoDoCiclo = sendoEscrito ? 'escrevendo' : exibido ? 'exibido' : entregue ? 'entregue' : f.enviadoEm || etapa ? 'produzindo' : 'revisao';
  const quando: Partial<Record<EstadoDoCiclo, string | null>> = {
    escrevendo: f.escritoEm ?? null,
    revisao: f.chegouEm,
    produzindo: f.enviadoEm ?? f.producao?.entradaEm ?? null,
    entregue: entregue ? (f.producao?.entregaEm ?? null) : null,
    exibido: exibido ? (f.dataExibicao as string) : null,
  };
  const k = CICLO.findIndex((c) => c.id === estado);
  const passos = CICLO.map((c, i): PassoDoCiclo => {
    const situacao = c.antes ? 'em-breve' : c.id === 'escrevendo' && !f.escrito ? 'fora' : i < k ? 'feito' : i === k ? 'agora' : 'depois';
    return { id: c.id, nome: c.nome, situacao, quando: situacao === 'feito' || situacao === 'agora' ? (quando[c.id] ?? null) : null };
  });
  return { estado, passos };
}

const instante = (s: string) => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
};
const diaEHora = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}, ${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
/** O que cada passo diz antes da data. */
const VERBO: Partial<Record<EstadoDoCiclo, string>> = { escrevendo: 'começou', revisao: 'chegou', produzindo: 'no Trello', entregue: 'entregue', exibido: 'foi ao ar' };

/**
 * Os passos que aconteceram, em frases curtas com a data, no relógio local: "chegou 26/11, 9h40", "no Trello 26/11,
 * 11h02", "entregue 27/11, 16h20", "foi ao ar 3/12" (a claquete tem só o dia). O passo sem data conhecida fica de fora.
 */
export function frasesDoCiclo(passos: readonly PassoDoCiclo[]): string[] {
  return passos.flatMap((p) => {
    const verbo = VERBO[p.id];
    if (!verbo || !p.quando) return [];
    if (ehData(p.quando)) {
      const [, mes, dia] = p.quando.split('-').map(Number);
      return [`${verbo} ${dia}/${mes}`];
    }
    const d = instante(p.quando);
    return d ? [`${verbo} ${diaEHora(d)}`] : [];
  });
}
