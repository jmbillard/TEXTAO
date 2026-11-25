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

/** O que a fila desenha: os roteiros menos o que está saindo (no prazo do desfazer) e o que já foi apagado.
 *  O apagado fica fora desde o começo do apagar, sem esperar o servidor confirmar (senão ele pisca de volta). */
export function filaVisivel(roteiros: Resumo[] | null, saindo: string | undefined, apagados: ReadonlySet<string>): Resumo[] {
  return (roteiros ?? []).filter((r) => r.id !== saindo && !apagados.has(r.id));
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
const dataDoIso = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
};

/** Os dias da agenda a partir do dia `primeiro` (contado de hoje: -1 é ontem), com os cards de cada um, mais o "sem
    data" e os dias anteriores a ontem: o que a semana do computador e a faixa do celular têm em comum. */
function montarDias(lista: Resumo[], andamento: Record<string, Andamento>, agora: Date, primeiro: number, quantos: number): Pick<Semana, 'dias' | 'semData' | 'anteriores'> {
  const ontem = isoLocal(somarDias(agora, -1));
  const hoje = isoLocal(agora);
  const amanha = isoLocal(somarDias(agora, 1));
  const enviados = lista.filter(noTrello).map((r): CardDaSemana => ({ r, etapa: etapaDoCard(andamento[r.id]), andamento: andamento[r.id], prioridade: !!andamento[r.id]?.prioridade }));
  const claquete = (c: CardDaSemana) => c.r.meta.claquete || c.r.meta.titulo || '';
  // o que caiu desce para o fim do dia
  const ordem = (a: CardDaSemana, b: CardDaSemana) => +(a.etapa === 'caiu') - +(b.etapa === 'caiu') || claquete(a).localeCompare(claquete(b), 'pt-BR');
  const doDia = (iso: string) => enviados.filter((c) => c.r.meta.dataExibicao === iso).sort(ordem);
  const dias = Array.from({ length: quantos }, (_, i): DiaDaSemana => {
    const d = somarDias(agora, primeiro + i);
    const iso = isoLocal(d);
    return { iso, diaDaSemana: DIAS_CURTOS[d.getDay()], numero: d.getDate(), marca: iso === ontem ? 'ontem' : iso === hoje ? 'hoje' : iso === amanha ? 'amanhã' : '', fimDeSemana: d.getDay() === 0 || d.getDay() === 6, cards: doDia(iso) };
  });
  const semData = enviados.filter((c) => !ehData(c.r.meta.dataExibicao)).sort(ordem);
  const passados = [...new Set(enviados.map((c) => c.r.meta.dataExibicao).filter((d) => ehData(d) && d < ontem))].sort().reverse();
  const anteriores = passados.map((iso) => {
    const d = dataDoIso(iso);
    return { iso, titulo: `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`, cards: doDia(iso) };
  });
  return { dias, semData, anteriores };
}

/** A semana começa em ontem, para o dia que passou estar sempre à mão; hoje fica na segunda coluna.
    deslocamento: quantas semanas para a frente (ou para trás, negativo) a partir da que começa ontem. */
export function montarSemana(lista: Resumo[], andamento: Record<string, Andamento>, agora = new Date(), deslocamento = 0): Semana {
  const { dias, semData, anteriores } = montarDias(lista, andamento, agora, deslocamento * 7 - 1, 7);
  const [ini, fim] = [dataDoIso(dias[0].iso), dataDoIso(dias[6].iso)];
  const periodo = ini.getMonth() === fim.getMonth() ? `${ini.getDate()} – ${fim.getDate()} de ${MESES[fim.getMonth()]}` : `${ini.getDate()} de ${MESES[ini.getMonth()]} – ${fim.getDate()} de ${MESES[fim.getMonth()]}`;
  return { dias, semData, anteriores, periodo, ...resumoDosDias(dias) };
}

/** O resumo de alguns dias da agenda: os cards, quantos foram entregues e quantos estão na lista de prioridade. */
export function resumoDosDias(dias: DiaDaSemana[]): Pick<Semana, 'total' | 'entregues' | 'comPrioridade'> {
  const cards = dias.flatMap((d) => d.cards);
  return { total: cards.length, entregues: cards.filter((c) => c.etapa === 'entregue').length, comPrioridade: cards.filter((c) => c.prioridade).length };
}

/* ---------- No Trello no celular: a faixa de dias ---------- */

/** A faixa de dias do celular: uma fila contínua de dias, arrastada com o dedo, dois à vista por vez. */
export interface FaixaDeDias extends Pick<Semana, 'dias' | 'semData' | 'anteriores'> {
  /** A posição de hoje na faixa: a faixa abre com hoje e amanhã à vista. */
  hoje: number;
}

/** Quantas semanas de agenda a faixa tem antes e depois da de agora (a que começa ontem). */
const SEMANAS_EM_VOLTA = 2;

/** A faixa vai das duas semanas de agenda antes da de agora até as duas depois (a de agora começa ontem): 35 dias.
    As pontas param ali; o que ficou antes está nos "dias anteriores". */
export function montarFaixa(lista: Resumo[], andamento: Record<string, Andamento>, agora = new Date()): FaixaDeDias {
  const primeiro = -1 - SEMANAS_EM_VOLTA * 7;
  return { ...montarDias(lista, andamento, agora, primeiro, (2 * SEMANAS_EM_VOLTA + 1) * 7), hoje: -primeiro };
}

/** Os dois dias à vista na faixa: o mais perto da ponta esquerda (pela posição da rolagem e pela largura de um dia
    com o vão) e o seguinte, sem passar das pontas. */
export function diasAVista(posicao: number, larguraDoDia: number, quantos: number): [number, number] {
  const k = larguraDoDia > 0 ? Math.round(posicao / larguraDoDia) : 0;
  const primeiro = Math.max(0, Math.min(quantos - 2, k));
  return [primeiro, primeiro + 1];
}

/** O período dos dias à vista, curto, para o seletor do celular: "25 – 26/11"; na virada do mês (ou do ano), o mês
    vai nos dois lados ("30/11 – 1/12", "31/12 – 1/1"). */
export function periodoCurto(de: string, ate: string): string {
  const [a, b] = [dataDoIso(de), dataDoIso(ate)];
  const mes = (d: Date) => `/${d.getMonth() + 1}`;
  return `${a.getDate()}${a.getMonth() === b.getMonth() ? '' : mes(a)} – ${b.getDate()}${mes(b)}`;
}

/** A coluna de um card na agenda: o dia (ISO) ou "sem data". */
export type ColunaDaSemana = string;
export interface MudancasDaSemana {
  /** Saíram da agenda (apagados, ou foram para fora da semana mostrada): fecham a vaga. */
  sairam: string[];
  /** Entraram na agenda (enviados agora, ou vieram de fora da semana): abrem a vaga. */
  entraram: string[];
  /** Continuam na agenda, mas em outra coluna: deslizam de uma para a outra, sem fechar nem abrir vaga. */
  moveram: { id: string; de: ColunaDaSemana; para: ColunaDaSemana }[];
}

/** Onde está cada card da semana: o dia da coluna, ou "sem-data". */
function colunas(s: Pick<Semana, 'dias' | 'semData'>): Map<string, ColunaDaSemana> {
  const onde = new Map<string, ColunaDaSemana>();
  for (const d of s.dias) for (const c of d.cards) onde.set(c.r.id, d.iso);
  for (const c of s.semData) onde.set(c.r.id, 'sem-data');
  return onde;
}

/** O que mudou na agenda de uma leitura para a outra (as sete colunas e o "sem data"); a etapa e a ordem dentro da
    coluna não contam. Compara a mesma semana (ou a mesma faixa, no celular): quem troca de semana pelas setas não anima. */
export function mudancasDaSemana(antes: Pick<Semana, 'dias' | 'semData'>, depois: Pick<Semana, 'dias' | 'semData'>): MudancasDaSemana {
  const de = colunas(antes);
  const para = colunas(depois);
  const sairam = [...de.keys()].filter((id) => !para.has(id));
  const entraram = [...para.keys()].filter((id) => !de.has(id));
  const moveram = [...para].filter(([id, col]) => de.has(id) && de.get(id) !== col).map(([id, col]) => ({ id, de: de.get(id)!, para: col }));
  return { sairam, entraram, moveram };
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

/** A rubrica de quem revisou, à mão no pé do card: "Clara Vieira" → "Clara V.". */
export function rubrica(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.` : partes[0] ?? '';
}
