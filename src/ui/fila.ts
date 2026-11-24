import type { Andamento, Resumo } from '../dados/armazenamento';

/* A fila organizada pela data de exibição: o que vai ao ar primeiro vem primeiro, e o que já foi ao ar
   desce para um grupo recolhido. Dentro de cada dia, o que pede revisão vem antes. */

export interface GrupoDia {
  chave: string;
  titulo: string;
  subtitulo: string;
  itens: Resumo[];
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** A data de exibição veio completa (AAAA-MM-DD)? */
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const maiuscula = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Já tem card no Trello (mandado pelo PROMeiro ou pelo upload antigo). */
export const noTrello = (r: Resumo) => r.trello?.estado === 'enviado' || r.trello?.estado === 'duplicado';

/** Pede alguém olhar: tem pendência, ou falta responder se é uma v2 do que já está na produção. */
export const pedeRevisao = (r: Resumo) => !!r.meta.revisar?.length || !!r.meta.naProducao;

// dentro do dia: o que pede revisão, depois os prontos, e por último o que já está no Trello
const ordemNoDia = (a: Resumo, b: Resumo) =>
  +noTrello(a) - +noTrello(b) || +pedeRevisao(b) - +pedeRevisao(a) || b.atualizadoEm.localeCompare(a.atualizadoEm);

function nomear(iso: string, hoje: string, amanha: string): Pick<GrupoDia, 'titulo' | 'subtitulo'> {
  const [a, m, d] = iso.split('-').map(Number);
  const data = new Date(a, m - 1, d);
  const extenso = `${d} de ${MESES[m - 1]}`;
  if (iso === hoje) return { titulo: 'Hoje', subtitulo: `${DIAS[data.getDay()]}, ${extenso}` };
  if (iso === amanha) return { titulo: 'Amanhã', subtitulo: `${DIAS[data.getDay()]}, ${extenso}` };
  return { titulo: maiuscula(DIAS[data.getDay()]), subtitulo: extenso };
}

/** O que ainda pede trabalho: nem foi ao ar, nem já está no Trello. É isso que a fila conta. */
export function pendentes(lista: Resumo[], agora = new Date()): Resumo[] {
  const hoje = isoLocal(agora);
  return lista.filter((r) => !noTrello(r) && !(ehData(r.meta.dataExibicao) && r.meta.dataExibicao < hoje));
}

/** diasExtras: dias que aparecem mesmo sem roteiro (os dias que só têm filme). */
export function agruparPorDia(lista: Resumo[], agora = new Date(), diasExtras: string[] = []): { proximos: GrupoDia[]; exibidos: GrupoDia[] } {
  const hoje = isoLocal(agora);
  const amanha = isoLocal(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1));
  const porDia = new Map<string, Resumo[]>();
  for (const r of lista) {
    const k = ehData(r.meta.dataExibicao) ? r.meta.dataExibicao : '';
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k)!.push(r);
  }
  for (const k of diasExtras) if (ehData(k) && k >= hoje && !porDia.has(k)) porDia.set(k, []);
  const grupo = (k: string): GrupoDia => ({
    chave: k || 'sem-data',
    ...(k ? nomear(k, hoje, amanha) : { titulo: 'Sem data', subtitulo: 'a data de exibição não veio no arquivo' }),
    itens: porDia.get(k)!.sort(ordemNoDia),
  });
  const datas = [...porDia.keys()].filter(Boolean);
  const proximos = datas.filter((k) => k >= hoje).sort().map(grupo);
  if (porDia.has('')) proximos.push(grupo(''));
  const exibidos = datas.filter((k) => k < hoje).sort().reverse().map(grupo);
  return { proximos, exibidos };
}

/* ---------- No Trello: a semana de agenda ---------- */

/** O dia de uma semana de agenda: sete colunas fixas; na semana de agora, a primeira é ontem e a segunda é hoje. */
export interface DiaDaSemana {
  iso: string;
  /** "ter", "qua"… */
  diaDaSemana: string;
  numero: number;
  /** "ontem", "hoje" ou "amanhã", escritos à mão; nos outros dias, vazio. */
  marca: '' | 'ontem' | 'hoje' | 'amanhã';
  fimDeSemana: boolean;
  cards: CardDaSemana[];
}

/** Um roteiro já no Trello, com a etapa do card na produção da arte. */
export interface CardDaSemana {
  r: Resumo;
  etapa: EtapaDoCard;
  /** As etiquetas, os designers e a entrega do card, para o card aberto. */
  andamento?: Andamento;
  /** A claquete está na lista de prioridade (a que dá a prioridade ALTA no envio): o card ganha o risco à mão. */
  prioridade: boolean;
}

/** O que o card fechado mostra à direita. As outras etapas (aguardando material, pedido de alteração…) não aparecem. */
export type EtapaDoCard = 'produzindo' | 'aprovacao' | 'entregue' | 'caiu' | null;

/** A etapa a partir das etiquetas do card na produção da arte: o card que caiu vence tudo, e entregue vale como finalizado. */
export function etapaDoCard(a: Andamento | undefined): EtapaDoCard {
  const status = (a?.status ?? []).map((s) => s.toUpperCase());
  if (status.includes('CAIU')) return 'caiu';
  if (a?.entregue || status.includes('FINALIZADO')) return 'entregue';
  if (status.includes('EM APROVAÇÃO')) return 'aprovacao';
  if (status.includes('PRODUZINDO')) return 'produzindo';
  return null;
}

export interface Semana {
  dias: DiaDaSemana[];
  /** Os enviados sem data de exibição (VT de evento…): não cabem em coluna nenhuma. */
  semData: CardDaSemana[];
  /** Os cards nas sete colunas, e quantos deles já foram entregues (o resumo do título). */
  total: number;
  entregues: number;
  /** Quantos dos cards nas sete colunas estão na lista de prioridade ("N com prioridade", à mão). */
  comPrioridade: number;
  /** Os dias antes de ontem que têm card, do mais recente para o mais antigo (o link "dias anteriores"). */
  anteriores: { iso: string; titulo: string; cards: CardDaSemana[] }[];
  /** "23 – 29 de novembro", "30 de novembro – 6 de dezembro". */
  periodo: string;
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const somarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** A semana começa em ontem, para o dia que passou estar sempre à mão; hoje fica na segunda coluna.
    deslocamento: quantas semanas para a frente (ou para trás, negativo) a partir da que começa ontem. */
export function montarSemana(lista: Resumo[], andamento: Record<string, Andamento>, agora = new Date(), deslocamento = 0): Semana {
  const ontem = isoLocal(somarDias(agora, -1));
  const hoje = isoLocal(agora);
  const amanha = isoLocal(somarDias(agora, 1));
  const enviados = lista.filter(noTrello).map((r): CardDaSemana => ({ r, etapa: etapaDoCard(andamento[r.id]), andamento: andamento[r.id], prioridade: !!andamento[r.id]?.prioridade }));
  const claquete = (c: CardDaSemana) => c.r.meta.claquete || c.r.meta.titulo || '';
  // o que caiu desce para o fim do dia
  const ordem = (a: CardDaSemana, b: CardDaSemana) => +(a.etapa === 'caiu') - +(b.etapa === 'caiu') || claquete(a).localeCompare(claquete(b), 'pt-BR');
  const doDia = (iso: string) => enviados.filter((c) => c.r.meta.dataExibicao === iso).sort(ordem);
  const datas = Array.from({ length: 7 }, (_, i) => somarDias(agora, deslocamento * 7 + i - 1));
  const dias = datas.map((d): DiaDaSemana => {
    const iso = isoLocal(d);
    return { iso, diaDaSemana: DIAS_CURTOS[d.getDay()], numero: d.getDate(), marca: iso === ontem ? 'ontem' : iso === hoje ? 'hoje' : iso === amanha ? 'amanhã' : '', fimDeSemana: d.getDay() === 0 || d.getDay() === 6, cards: doDia(iso) };
  });
  const [ini, fim] = [datas[0], datas[6]];
  const periodo = ini.getMonth() === fim.getMonth() ? `${ini.getDate()} – ${fim.getDate()} de ${MESES[fim.getMonth()]}` : `${ini.getDate()} de ${MESES[ini.getMonth()]} – ${fim.getDate()} de ${MESES[fim.getMonth()]}`;
  const semData = enviados.filter((c) => !ehData(c.r.meta.dataExibicao)).sort(ordem);
  const passados = [...new Set(enviados.map((c) => c.r.meta.dataExibicao).filter((d) => ehData(d) && d < ontem))].sort().reverse();
  const anteriores = passados.map((iso) => {
    const [a, m, d] = iso.split('-').map(Number);
    return { iso, titulo: `${DIAS[new Date(a, m - 1, d).getDay()]}, ${d} de ${MESES[m - 1]}`, cards: doDia(iso) };
  });
  const naSemana = dias.flatMap((d) => d.cards);
  return { dias, semData, anteriores, periodo, total: naSemana.length, entregues: naSemana.filter((c) => c.etapa === 'entregue').length, comPrioridade: naSemana.filter((c) => c.prioridade).length };
}

/** A semana encolhe quando há roteiros para revisar (a prioridade é a revisão), a menos que a pessoa tenha escolhido
    "ver a semana inteira". Só conta o que ainda pede trabalho: o que foi ao ar ou já está no Trello fica de fora. */
export function semanaEncolhida(fila: Resumo[], inteira: boolean, agora = new Date()): boolean {
  return !inteira && pendentes(fila, agora).some(pedeRevisao);
}

/* ---------- No Trello: o card aberto ---------- */

// as etiquetas do card na produção da arte (status do Teable, que o n8n traz do Trello), por extenso
const ETIQUETAS: Record<string, string> = {
  'AGUARDANDO MATERIAL': 'Aguardando material',
  PRODUZINDO: 'Produzindo',
  'EM APROVAÇÃO': 'Em aprovação',
  'PEDIDO DE ALTERAÇÃO': 'Pedido de alteração',
  FINALIZADO: 'Finalizado',
  FILME: 'Filme',
  CAIU: 'Caiu',
};
/** O nome de uma etiqueta do card ("EM APROVAÇÃO" → "Em aprovação"); a que não conhece vira só minúscula. */
export const nomeDaEtiqueta = (st: string) => ETIQUETAS[st.toUpperCase()] ?? st[0] + st.slice(1).toLowerCase();

/** A etapa no card aberto: o nome por extenso (caiu e entregue vencem as outras etiquetas) e o prazo "até 25/11",
    o dia da entrega em Brasília, só enquanto o card não foi entregue nem caiu. */
export function etapaPorExtenso(a: Andamento | undefined): { nome: string; ate: string } {
  const etapa = etapaDoCard(a);
  const nome = etapa === 'caiu' ? 'Caiu' : etapa === 'entregue' ? 'Entregue' : (a?.status ?? []).map(nomeDaEtiqueta).join(', ');
  // a entrega vem em UTC; o dia que vale é o de Brasília
  const ate =
    a?.entrega && etapa !== 'caiu' && etapa !== 'entregue'
      ? new Date(a.entrega).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
      : '';
  return { nome, ate };
}

/** A rubrica de quem revisou, à mão no pé do card: "Clara Vieira" → "Clara V.". */
export function rubrica(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.` : partes[0] ?? '';
}
