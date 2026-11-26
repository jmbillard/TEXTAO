/* Os eventos da Produção que nascem da produção da arte do Teable (ADR 0006: por enquanto o PROMeiro só ESCREVE no
   Trello; o que ele lê vem do Teable, a fonte oficial). A cada releitura, a linha relida é comparada com a Produção
   guardada, e o que mudou vira evento: a etapa (pela regra da etapa, etapaDaProducao), o designer que entrou ou saiu,
   a praça, a prioridade e a complexidade. Linha nova vira "criada". As artes marcadas não: o Teable não sabe do
   checklist. O Teable não diz quem mudou (quem grava é o n8n): `quem` fica vazio.
   Cada evento leva uma chave estável (registro + tipo + campo + valor + quando, o quando sendo a modificação da linha
   no Teable): a mesma releitura duas vezes não vira dois eventos.
   O mesmo módulo serve ao servidor e ao navegador: só sintaxe que o Node apaga. */
import type { CampoDoEvento, TipoDoEvento } from './avisoDoTrello.ts';
import { nomeComparavel } from './ligarPeloNome.ts';
import { pracasRegistradas, type Praca } from './pracas.ts';
import { producaoDaLinha, type Etapa, type LinhaDaCarga } from './producao.ts';

/** Uma linha da produção da arte relida: a da carga, com a prioridade, a complexidade e quando o Teable a mudou. */
export interface LinhaRelida extends LinhaDaCarga {
  /** a coluna prioridade ('' sem ela) */
  prioridade: string;
  /** a coluna complexidade, como veio (1, 2, 3 ou o nome; '' sem ela) */
  complexidade: string;
  /** __last_modified_time (ISO): quando a linha mudou no Teable */
  modificadoEm: string | null;
}

/** O que a Produção guardada diz, para comparar. A prioridade e a complexidade null: ainda não guardadas (não comparam). */
export interface EstadoGuardado {
  etapa: Etapa;
  designers: readonly string[];
  praca: string;
  prioridade: string | null;
  complexidade: string | null;
}

export interface EventoDoTeable {
  tipo: TipoDoEvento;
  campo?: CampoDoEvento;
  antes: string | null;
  depois: string | null;
  /** o Teable não diz quem mudou */
  quem: null;
  /** ISO */
  quando: string;
  /** registro + tipo + campo + valor + quando: o mesmo evento não entra duas vezes */
  chave: string;
}

const NIVEIS = ['BAIXA', 'MÉDIA', 'ALTA'];
/** A complexidade pelo nome: 1, 2, 3 → BAIXA, MÉDIA, ALTA; o nome escrito fica (sem caixa); vazio → null. */
export function nivelDaComplexidade(v: string | number | null | undefined): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 3) return NIVEIS[n - 1];
  return NIVEIS.find((x) => nomeComparavel(x) === nomeComparavel(s)) ?? s.toUpperCase();
}
const prioridadeDe = (v: string | null | undefined) => String(v ?? '').trim().toUpperCase() || null;
const mesmo = (a: string | null, b: string | null) => nomeComparavel(a ?? '') === nomeComparavel(b ?? '');

/**
 * Os eventos da linha relida diante da Produção guardada (null: a linha é nova). Em ordem: a etapa, os designers que
 * entraram, os que saíram, a praça, a prioridade, a complexidade.
 * @param o.agora o instante da releitura (ISO): o quando do evento da linha sem a data de modificação
 */
export function eventosDaReleitura(antes: EstadoGuardado | null, l: LinhaRelida, { pracas = pracasRegistradas(), agora }: { pracas?: readonly Praca[]; agora: string }): EventoDoTeable[] {
  const p = producaoDaLinha(l, {}, pracas);
  const quando = l.modificadoEm || agora;
  const evento = (tipo: TipoDoEvento, antes: string | null, depois: string | null, campo?: CampoDoEvento, em = quando): EventoDoTeable => ({
    tipo,
    ...(campo ? { campo } : {}),
    antes,
    depois,
    quem: null,
    quando: em,
    chave: `teable:${l.registro}:${tipo}:${campo ?? ''}:${depois ?? antes ?? ''}:${em}`,
  });
  if (!antes) return [evento('criada', null, p.etapa, undefined, l.entrada || quando)];
  const evs: EventoDoTeable[] = [];
  if (p.etapa !== antes.etapa) {
    const tipo: TipoDoEvento = p.etapa === 'arquivada' ? 'arquivada' : antes.etapa === 'arquivada' ? 'desarquivada' : 'etapa';
    evs.push(evento(tipo, antes.etapa, p.etapa));
  }
  const tem = (lista: readonly string[], nome: string) => lista.some((x) => nomeComparavel(x) === nomeComparavel(nome));
  for (const d of p.designers) if (!tem(antes.designers, d)) evs.push(evento('designer-entrou', null, d));
  for (const d of antes.designers) if (!tem(p.designers, d)) evs.push(evento('designer-saiu', d, null));
  if (p.praca && antes.praca !== p.praca) evs.push(evento('campo', antes.praca || null, p.praca, 'praca'));
  if (antes.prioridade !== null) {
    const [a, d] = [prioridadeDe(antes.prioridade), prioridadeDe(l.prioridade)];
    if (!mesmo(a, d)) evs.push(evento('campo', a, d, 'prioridade'));
  }
  if (antes.complexidade !== null) {
    const [a, d] = [nivelDaComplexidade(antes.complexidade), nivelDaComplexidade(l.complexidade)];
    if (!mesmo(a, d)) evs.push(evento('campo', a, d, 'complexidade'));
  }
  return evs;
}
