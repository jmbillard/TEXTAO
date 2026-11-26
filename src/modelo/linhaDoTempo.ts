/* A Linha do tempo (#89, ADR 0006): os eventos de uma Produção em frases curtas do dia a dia, na ordem em que
   aconteceram ("entrou 26/11 9h40 · Rafael pegou 10h02 · 3 de 5 artes · entregue 15h20"). Puro: recebe a Produção
   (o estado de agora) e os eventos como a rota da linha do tempo devolve, e as horas saem no relógio local, como a
   agenda mostra. O dia só aparece na primeira frase com hora e quando muda de uma frase para a outra. */
import type { CampoDoEvento, TipoDoEvento } from './avisoDoTrello.ts';
import type { Etapa } from './producao.ts';

/** O evento como a linha do tempo lê (o que a rota devolve a qualquer pessoa: sem os ids do Trello). */
export interface EventoDaLinha {
  tipo: TipoDoEvento;
  campo?: CampoDoEvento;
  antes: string | null;
  depois: string | null;
  /** o nome de quem fez, quando o Trello diz */
  quem: string | null;
  /** ISO */
  quando: string;
}

/** O que a linha do tempo lê da Produção: o estado de agora (para a Produção sem eventos) e o total de artes. */
export interface ProducaoDaLinha {
  etapa: Etapa;
  entradaEm: string | null;
  entregaEm: string | null;
  artes: readonly string[];
  artesQuantidade: number | null;
  arquivada: boolean;
}

const instante = (s: string | null | undefined) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? null : new Date(t);
};
const diaDe = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
const horaDe = (d: Date) => `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;

/** A etapa para onde a Produção foi, em português do dia a dia ("voltou" quando andou para trás no fluxo). */
function daEtapa(antes: string | null, depois: string | null): string | null {
  const ordem = ['entrada', 'produzindo', 'entregue'];
  const voltou = ordem.indexOf(String(antes)) > ordem.indexOf(String(depois));
  if (depois === 'entregue') return 'entregue';
  if (depois === 'produzindo') return voltou ? 'voltou para a produção' : 'em produção';
  if (depois === 'entrada') return 'voltou para a entrada';
  if (depois === 'arquivada') return 'arquivada';
  return null;
}

/** O campo mudado: "prioridade alta", "sem prioridade", "praça SP". */
function doCampo(campo: CampoDoEvento | undefined, depois: string | null): string | null {
  const valor = String(depois ?? '').trim();
  if (campo === 'praca') return valor ? `praça ${valor}` : 'sem praça';
  if (campo === 'prioridade' || campo === 'complexidade') return valor ? `${campo} ${valor.toLowerCase()}` : `sem ${campo}`;
  return null;
}

/** Uma frase: o texto e, quando tem, o instante que vai depois dele (a hora, e o dia se mudou). */
interface Pedaco {
  texto: string;
  quando: Date | null;
}

/**
 * As frases da linha do tempo, em ordem. Sem eventos, só o estado atual ("na produção desde 20/11" e, se saiu, a
 * entrega); sem nada, nenhuma. A Produção que já estava lá antes do primeiro evento (a da carga do Teable) começa por
 * "na produção desde". As marcações de arte seguidas viram uma frase só, com a conta até ali ("3 de 5 artes"; sem o
 * total, "3 artes marcadas"); as artes e o prazo de entrega não levam hora.
 */
export function frasesDaLinhaDoTempo(p: ProducaoDaLinha, eventos: readonly EventoDaLinha[]): string[] {
  const ordem = [...eventos].filter((e) => instante(e.quando)).sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));
  const pedacos: Pedaco[] = [];
  const entrada = instante(p.entradaEm);
  if (entrada && ordem[0]?.tipo !== 'criada') pedacos.push({ texto: `na produção desde ${diaDe(entrada)}`, quando: null });
  if (!ordem.length) {
    const entrega = instante(p.entregaEm);
    if (entrega) pedacos.push({ texto: 'entregue', quando: entrega });
  }
  const total = p.artesQuantidade ?? (p.artes.length || null);
  const marcadas = new Set<string>();
  let emGrupo = false;
  for (const e of ordem) {
    const quando = instante(e.quando);
    const arte = e.tipo === 'arte-marcada' || e.tipo === 'arte-desmarcada';
    if (arte) {
      const nome = String(e.depois ?? e.antes ?? '').trim().toLowerCase();
      if (e.tipo === 'arte-marcada') marcadas.add(nome);
      else marcadas.delete(nome);
      const n = marcadas.size;
      const texto = total ? `${n} de ${total} artes` : `${n} ${n === 1 ? 'arte marcada' : 'artes marcadas'}`;
      if (emGrupo) pedacos[pedacos.length - 1].texto = texto;
      else pedacos.push({ texto, quando: null });
      emGrupo = true;
      continue;
    }
    emGrupo = false;
    // o designer é o do evento (quem fez a ação pode ser outra pessoa, que pôs o designer no card)
    const quem = String((e.tipo === 'designer-saiu' ? e.antes : e.depois) ?? '').trim();
    if (e.tipo === 'criada') pedacos.push({ texto: 'entrou', quando });
    else if (e.tipo === 'designer-entrou' || e.tipo === 'designer-saiu') pedacos.push({ texto: `${quem || 'alguém'} ${e.tipo === 'designer-entrou' ? 'pegou' : 'saiu'}`, quando });
    else if (e.tipo === 'desarquivada') pedacos.push({ texto: 'desarquivada', quando });
    else if (e.tipo === 'etapa' || e.tipo === 'arquivada') {
      const texto = daEtapa(e.antes, e.depois);
      if (texto) pedacos.push({ texto, quando });
    } else if (e.tipo === 'campo' && e.campo === 'entrega') {
      const prazo = instante(e.depois);
      pedacos.push({ texto: prazo ? `prazo ${diaDe(prazo)} ${horaDe(prazo)}` : 'sem prazo', quando: null });
    } else if (e.tipo === 'campo') {
      const texto = doCampo(e.campo, e.depois);
      if (texto) pedacos.push({ texto, quando });
    }
  }
  let ultimoDia = '';
  return pedacos.map(({ texto, quando }) => {
    if (!quando) return texto;
    const dia = diaDe(quando);
    const comDia = dia !== ultimoDia;
    ultimoDia = dia;
    return `${texto} ${comDia ? `${dia} ` : ''}${horaDe(quando)}`;
  });
}
