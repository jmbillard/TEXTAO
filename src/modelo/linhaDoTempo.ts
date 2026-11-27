/* A Linha do tempo (#89, ADR 0006): os eventos de uma Produção em frases curtas do dia a dia, na ordem em que
   aconteceram ("entrou 26/11 9h40 · Rafael pegou 10h02 · 3 de 5 artes · entregue 15h20"). Puro: recebe a Produção
   (o estado de agora) e os eventos como a rota da linha do tempo devolve, e as horas saem no relógio local, como a
   agenda mostra. O dia só aparece na primeira frase com hora e quando muda de uma frase para a outra. */
import type { CampoDoEvento, TipoDoEvento } from './avisoDoTrello.ts';
import type { Etapa } from './producao.ts';

/** O evento como a linha do tempo lê (o que a rota devolve a qualquer pessoa: sem os ids do Trello). */
export interface EventoDaLinha {
  tipo: TipoDoEvento;
  /** o campo mudado; no "fogo" (#147, #160), a arte */
  campo?: CampoDoEvento | (string & {});
  antes: string | null;
  depois: string | null;
  /** o nome de quem fez, quando o Trello diz */
  quem: string | null;
  /** ISO */
  quando: string;
  /** de onde veio: 'PROMeiro' (a tela de produções), 'Padeiro' (a janela do After); sem ela, o Teable ou o Trello */
  origem?: string;
  /** o evento desfez outro (o desfazer) */
  desfez?: boolean;
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
function doCampo(campo: EventoDaLinha['campo'], depois: string | null): string | null {
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
    else if (e.tipo === 'abriu-o-projeto') pedacos.push({ texto: `${quem || 'alguém'} abriu o projeto`, quando });
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

/** Uma linha da linha do tempo do card aberto (#160): o instante, a frase e se foi feita no PROMeiro. */
export interface ItemDaLinhaDoTempo {
  quando: string;
  texto: string;
  /** feita no PROMeiro (a tela de produções): foi ao Trello */
  doPROMeiro: boolean;
}

const NIVEL_DO_FOGO: Record<string, string> = { '1': 'baixa', '2': 'média', '3': 'alta' };
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** "sex 4/12", do dia AAAA-MM-DD. */
const diaCurto = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? dia : `${DIAS_CURTOS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

/** A frase de um evento, com quem fez na frente quando se sabe; null para o que não se mostra. */
function fraseDoEvento(e: EventoDaLinha, itens: string): string | null {
  const quem = String(e.quem ?? '').trim();
  const por = (verbo: string) => (quem ? `${quem} ${verbo}` : verbo);
  switch (e.tipo) {
    case 'criada':
      return 'entrou na Entrada';
    case 'designer-entrou':
      return quem && nomeIgual(quem, e.depois) ? `${quem} pegou` : quem ? `${quem} atribuiu ${e.depois ?? 'alguém'}` : `${e.depois ?? 'alguém'} entrou`;
    case 'designer-saiu':
      return quem && nomeIgual(quem, e.antes) ? `${quem} saiu` : quem ? `${quem} tirou ${e.antes ?? 'alguém'}` : `${e.antes ?? 'alguém'} saiu`;
    case 'etapa':
      return e.depois === 'entregue' ? por('entregou') : daEtapa(e.antes, e.depois);
    case 'arquivada':
      return 'arquivada';
    case 'desarquivada':
      return 'desarquivada';
    case 'abriu-o-projeto':
      return `${e.depois || quem || 'alguém'} abriu o projeto`;
    case 'arte-marcada':
      return por(`marcou ${itens}`);
    case 'arte-desmarcada':
      return por(`desmarcou ${itens}`);
    case 'arte-apagada':
      return por(`apagou ${itens}`);
    case 'arte-incluida':
      return por(e.desfez ? `devolveu ${itens} ao checklist` : `incluiu ${itens}`);
    case 'fogo':
      return por(`mudou o fogo de ${e.campo ?? 'uma arte'} para ${NIVEL_DO_FOGO[String(e.depois)] ?? e.depois}`);
    case 'campo':
      if (e.campo === 'prazo') return por(e.depois ? `mudou o prazo para ${diaCurto(e.depois)}` : 'tirou o prazo');
      if (e.campo === 'atracao') return por(e.depois ? `ligou a atração ${e.depois}` : 'desligou a atração');
      if (e.campo === 'entrega') {
        const prazo = instante(e.depois);
        return prazo ? `prazo do card ${diaDe(prazo)} ${horaDe(prazo)}` : 'sem prazo no card';
      }
      return doCampo(e.campo, e.depois);
  }
  return null;
}
const nomeIgual = (a: string, b: string | null) => a.trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * A linha do tempo do card aberto da tela de produções (#160): um evento por linha, do mais novo para o mais velho,
 * com quem fez na frente ("Ana Souza ligou a atração X"). Os itens de uma arte mudados de uma vez (o mesmo tipo, a
 * mesma pessoa, o mesmo instante) viram uma linha só.
 */
export function linhaDoTempoDoCard(eventos: readonly EventoDaLinha[]): ItemDaLinhaDoTempo[] {
  const ordem = [...eventos].filter((e) => instante(e.quando)).sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));
  const grupos: EventoDaLinha[][] = [];
  const arte = (e: EventoDaLinha) => e.tipo.startsWith('arte-');
  for (const e of ordem) {
    const u = grupos[grupos.length - 1]?.[0];
    if (u && arte(e) && u.tipo === e.tipo && u.quem === e.quem && u.quando === e.quando) grupos[grupos.length - 1].push(e);
    else grupos.push([e]);
  }
  return grupos
    .flatMap((g) => {
      const texto = fraseDoEvento(g[0], g.map((e) => e.depois ?? e.antes ?? '').join(', '));
      return texto ? [{ quando: g[0].quando, texto, doPROMeiro: g[0].origem === 'PROMeiro' }] : [];
    })
    .reverse();
}
