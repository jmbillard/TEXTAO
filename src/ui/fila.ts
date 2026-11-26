import type { Andamento, PresencaNosRoteiros, Resumo } from '../dados/armazenamento';

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

/** O próximo roteiro para revisar, na ordem da fila (os dias, e no dia o que pede revisão): o que ainda pede revisão,
    que ninguém revisou (nem eu) e que nenhuma outra pessoa está com aberto agora, fora o roteiro em que estou. Sem
    nenhum, undefined: quem pediu volta para a fila. É o que o Enviar do editor e a tecla R da fila abrem. Abrir à mão
    um roteiro em que alguém já está continua livre (é a edição simultânea); só a sugestão do próximo pula. */
export function proximoParaRevisar(fila: Resumo[], eu: { email?: string; roteiro?: string }, presenca: PresencaNosRoteiros, agora = new Date()): Resumo | undefined {
  const meu = (eu.email ?? '').toLowerCase();
  const deOutro = (id: string) => (presenca[id] ?? []).some((p) => p.email.toLowerCase() !== meu);
  const livres = pendentes(fila, agora).filter((r) => r.id !== eu.roteiro && pedeRevisao(r) && !r.revisadoPor && !deOutro(r.id));
  return agruparPorDia(livres, agora).proximos.flatMap((g) => g.itens)[0];
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
  /** Quando o card entrou na produção da arte (ISO), ou vazio se não se sabe (entradaDoCard). */
  entrada: string;
  /** Por entrega: o card ainda não saiu e fica no dia da exibição, tracejado, como um prazo. Nos outros critérios, não. */
  aEntregar: boolean;
}

/** O que decide o dia de cada card na agenda: a exibição (o padrão), a entrada na produção da arte ou a entrega. */
export type CriterioDaAgenda = 'exibicao' | 'entrada' | 'entrega';
export const CRITERIOS: CriterioDaAgenda[] = ['exibicao', 'entrada', 'entrega'];
export const NOME_DO_CRITERIO: Record<CriterioDaAgenda, string> = { exibicao: 'exibição', entrada: 'entrada', entrega: 'entrega' };

/** O dia (local) de um instante ISO; vazio se não for uma data. */
const diaDoInstante = (s: string | null | undefined) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? '' : isoLocal(new Date(t));
};

/** Quando o card entrou na produção da arte: a data_entrada da ARTE_producao; sem ela, a hora do envio pelo PROMeiro.
    O card que já estava lá (duplicado) não entrou pelo envio: sem a data_entrada, não se sabe. */
export function entradaDoCard(r: Resumo, a: Andamento | undefined): string {
  if (diaDoInstante(a?.entrada)) return a!.entrada!;
  return r.trello?.estado === 'enviado' && diaDoInstante(r.trello.em) ? r.trello.em : '';
}

/** O card já saiu (tem a data_entrega). */
const saiu = (c: Pick<CardDaSemana, 'andamento'>) => !!diaDoInstante(c.andamento?.entrega);

/** O dia (ISO) em que o card fica na agenda pelo critério, ou vazio ("sem data"). Por entrega, o card que ainda não
    saiu fica no dia da exibição: é o prazo de fato (a ARTE_producao não tem um campo de prazo). */
export function diaDe(c: Pick<CardDaSemana, 'r' | 'andamento' | 'entrada'>, criterio: CriterioDaAgenda): string {
  const exibicao = ehData(c.r.meta.dataExibicao) ? c.r.meta.dataExibicao : '';
  if (criterio === 'entrada') return diaDoInstante(c.entrada);
  if (criterio === 'entrega' && saiu(c)) return diaDoInstante(c.andamento!.entrega);
  return exibicao;
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
  /** Por entrega: quantos dos cards nas sete colunas ainda não saíram ("N a entregar"). */
  aEntregar: number;
  /** Quantos dos cards nas sete colunas estão na lista de prioridade ("N prioridades", à mão). */
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

/** A ordem dentro do dia: o que caiu desce para o fim; por exibição, pela claquete; por entrada, na ordem em que
    entraram; por entrega, na ordem em que saíram, e o que ainda não saiu depois. */
function ordemDoDia(criterio: CriterioDaAgenda) {
  const claquete = (c: CardDaSemana) => c.r.meta.claquete || c.r.meta.titulo || '';
  const quando = (s: string | null | undefined) => (s ? Date.parse(s) || 0 : 0);
  return (a: CardDaSemana, b: CardDaSemana) => {
    const caiu = +(a.etapa === 'caiu') - +(b.etapa === 'caiu');
    if (caiu) return caiu;
    if (criterio === 'entrada' && a.entrada && b.entrada && quando(a.entrada) !== quando(b.entrada)) return quando(a.entrada) - quando(b.entrada);
    if (criterio === 'entrega') {
      const [sa, sb] = [saiu(a), saiu(b)];
      if (sa !== sb) return sa ? -1 : 1;
      if (sa && quando(a.andamento!.entrega) !== quando(b.andamento!.entrega)) return quando(a.andamento!.entrega) - quando(b.andamento!.entrega);
    }
    return claquete(a).localeCompare(claquete(b), 'pt-BR');
  };
}

/** Os dias da agenda a partir do dia `primeiro` (contado de hoje: -1 é ontem), com os cards de cada um pelo critério,
    mais o "sem data" e os dias anteriores à semana de agora: o que a semana do computador e a faixa do celular têm em
    comum. */
function montarDias(lista: Resumo[], andamento: Record<string, Andamento>, agora: Date, primeiro: number, quantos: number, criterio: CriterioDaAgenda): Pick<Semana, 'dias' | 'semData' | 'anteriores'> {
  const ontem = isoLocal(somarDias(agora, -1));
  const hoje = isoLocal(agora);
  const amanha = isoLocal(somarDias(agora, 1));
  const enviados = lista.filter(noTrello).map((r): CardDaSemana => {
    const a = andamento[r.id];
    const etapa = etapaDoCard(a);
    const c = { r, etapa, andamento: a, prioridade: !!a?.prioridade, entrada: entradaDoCard(r, a), aEntregar: false };
    c.aEntregar = criterio === 'entrega' && !saiu(c) && etapa !== 'caiu' && etapa !== 'entregue';
    return c;
  });
  const ordem = ordemDoDia(criterio);
  const dia = new Map(enviados.map((c) => [c.r.id, diaDe(c, criterio)]));
  const doDia = (iso: string) => enviados.filter((c) => dia.get(c.r.id) === iso).sort(ordem);
  const dias = Array.from({ length: quantos }, (_, i): DiaDaSemana => {
    const d = somarDias(agora, primeiro + i);
    const iso = isoLocal(d);
    return { iso, diaDaSemana: DIAS_CURTOS[d.getDay()], numero: d.getDate(), marca: iso === ontem ? 'ontem' : iso === hoje ? 'hoje' : iso === amanha ? 'amanhã' : '', fimDeSemana: d.getDay() === 0 || d.getDay() === 6, cards: doDia(iso) };
  });
  const semData = doDia('');
  // os dias anteriores: antes do primeiro dia da semana de agora do critério
  const corte = isoLocal(somarDias(agora, inicioDaSemana(0, criterio)));
  const passados = [...new Set([...dia.values()].filter((d) => d && d < corte))].sort().reverse();
  const anteriores = passados.map((iso) => {
    const d = dataDoIso(iso);
    return { iso, titulo: `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`, cards: doDia(iso) };
  });
  return { dias, semData, anteriores };
}

/** A outra data, discreta, no pé do card: o dia da coluna já diz uma; o pé diz a outra que importa no critério.
    Por exibição, quando entrou ("entrou ter 24"); por entrada, a hora e quando vai ao ar ("21h59 · ao ar dom 29");
    por entrega, o que saiu: a hora e quando vai ao ar, com "depois do ar" quando saiu depois da exibição; o que ainda
    não saiu: quando entrou. Sem a data que ele diria, nada (null). */
export interface PeDoCard {
  /** "21h59", ou vazio. */
  hora: string;
  rotulo: 'entrou' | 'ao ar' | 'sem exibição';
  /** "hoje", "ontem", "amanhã" ou "dom 29"; vazio em "sem exibição". */
  dia: string;
  depoisDoAr: boolean;
}

/** "hoje", "ontem", "amanhã" ou "dom 29". */
function diaCurto(iso: string, agora: Date): string {
  if (iso === isoLocal(agora)) return 'hoje';
  if (iso === isoLocal(somarDias(agora, -1))) return 'ontem';
  if (iso === isoLocal(somarDias(agora, 1))) return 'amanhã';
  const d = dataDoIso(iso);
  return `${DIAS_CURTOS[d.getDay()]} ${d.getDate()}`;
}
const horaDoInstante = (s: string) => {
  const d = new Date(s);
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
};

export function peDoCard(c: Pick<CardDaSemana, 'r' | 'andamento' | 'entrada'>, criterio: CriterioDaAgenda, agora = new Date()): PeDoCard | null {
  const exibicao = ehData(c.r.meta.dataExibicao) ? c.r.meta.dataExibicao : '';
  const aoAr = (hora: string, depoisDoAr = false): PeDoCard => (exibicao ? { hora, rotulo: 'ao ar', dia: diaCurto(exibicao, agora), depoisDoAr } : { hora, rotulo: 'sem exibição', dia: '', depoisDoAr: false });
  if (criterio === 'entrada') return aoAr(c.entrada ? horaDoInstante(c.entrada) : '');
  if (criterio === 'entrega' && saiu(c)) {
    const entrega = c.andamento!.entrega!;
    return aoAr(horaDoInstante(entrega), !!exibicao && diaDoInstante(entrega) > exibicao);
  }
  const entrou = diaDoInstante(c.entrada);
  return entrou ? { hora: '', rotulo: 'entrou', dia: diaCurto(entrou, agora), depoisDoAr: false } : null;
}

/** A semana começa em ontem, para o dia que passou estar sempre à mão; hoje fica na segunda coluna. Por entrada, a
    semana termina hoje (ninguém entra amanhã). deslocamento: quantas semanas para a frente (ou para trás, negativo) a
    partir da de agora. */
export function montarSemana(lista: Resumo[], andamento: Record<string, Andamento>, agora = new Date(), deslocamento = 0, criterio: CriterioDaAgenda = 'exibicao'): Semana {
  const { dias, semData, anteriores } = montarDias(lista, andamento, agora, inicioDaSemana(deslocamento, criterio), 7, criterio);
  const { dia1, mes1, dia2, mes2 } = partesDoPeriodo(dias[0].iso, dias[6].iso, mesPorExtenso);
  return { dias, semData, anteriores, periodo: `${dia1}${mes1} – ${dia2}${mes2}`, ...resumoDosDias(dias) };
}

/** O primeiro dia da semana de agenda `deslocamento` semanas para a frente (ou para trás), contado de hoje: a de agora
    começa ontem (-1); por entrada, seis dias atrás (-6), para terminar hoje. É a posição da semana no eixo que conta
    (eixoDaSemana). */
export const inicioDaSemana = (deslocamento: number, criterio: CriterioDaAgenda = 'exibicao') => deslocamento * 7 + (criterio === 'entrada' ? -6 : -1);

/** O resumo de alguns dias da agenda: os cards, quantos foram entregues e quantos estão na lista de prioridade. */
export function resumoDosDias(dias: DiaDaSemana[]): Pick<Semana, 'total' | 'entregues' | 'aEntregar' | 'comPrioridade'> {
  const cards = dias.flatMap((d) => d.cards);
  return { total: cards.length, entregues: cards.filter((c) => c.etapa === 'entregue').length, aEntregar: cards.filter((c) => c.aEntregar).length, comPrioridade: cards.filter((c) => c.prioridade).length };
}

/* ---------- No Trello no celular: a faixa de dias ---------- */

/** A faixa de dias do celular: uma fila contínua de dias, arrastada com o dedo, dois à vista por vez. */
export interface FaixaDeDias extends Pick<Semana, 'dias' | 'semData' | 'anteriores'> {
  /** A posição de hoje na faixa. */
  hoje: number;
  /** Onde a faixa abre (e para onde o "voltar para hoje" leva): em hoje e amanhã; por entrada, em ontem e hoje. */
  abre: number;
}

/** Quantas semanas de agenda a faixa tem antes e depois da de agora (a que começa ontem). */
const SEMANAS_EM_VOLTA = 2;

/** A faixa vai das duas semanas de agenda antes da de agora até as duas depois (a de agora começa ontem): 35 dias.
    As pontas param ali; o que ficou antes está nos "dias anteriores". */
export function montarFaixa(lista: Resumo[], andamento: Record<string, Andamento>, agora = new Date(), criterio: CriterioDaAgenda = 'exibicao'): FaixaDeDias {
  const primeiro = -1 - SEMANAS_EM_VOLTA * 7;
  const hoje = -primeiro;
  return { ...montarDias(lista, andamento, agora, primeiro, (2 * SEMANAS_EM_VOLTA + 1) * 7, criterio), hoje, abre: criterio === 'entrada' ? hoje - 1 : hoje };
}

/** Os dois dias à vista na faixa: o mais perto da ponta esquerda (pela posição da rolagem e pela largura de um dia
    com o vão) e o seguinte, sem passar das pontas. */
export function diasAVista(posicao: number, larguraDoDia: number, quantos: number): [number, number] {
  const k = larguraDoDia > 0 ? Math.round(posicao / larguraDoDia) : 0;
  const primeiro = Math.max(0, Math.min(quantos - 2, k));
  return [primeiro, primeiro + 1];
}

/* ---------- No Trello: o topo que conta (no celular e no computador) ---------- */

/** A curva do contador: rápido no começo e devagar no fim, perto da --suave dos estilos. */
const suave = (p: number) => 1 - Math.pow(1 - p, 4);

/** O que o contador mostra no instante `p` (de 0 a 1) da contagem de `de` até `para`: sempre um inteiro, sem passar
    do alvo nem voltar antes da partida. Vale para os números do resumo e para os dias do seletor (a posição no eixo). */
export function valorNaContagem(de: number, para: number, p: number): number {
  return Math.round(de + (para - de) * suave(Math.max(0, Math.min(1, p))));
}

/** O período em partes, como o seletor o desenha: o dia e o mês de cada lado. O mês da esquerda ("/11", " de
    novembro") só aparece na virada do mês (ou do ano); fora dela, fica vazio. */
export interface PartesDoPeriodo {
  dia1: number;
  mes1: string;
  dia2: number;
  mes2: string;
}

/** O mês do seletor do celular ("/11") e o da semana do computador (" de novembro"). */
export const mesCurto = (d: Date) => `/${d.getMonth() + 1}`;
export const mesPorExtenso = (d: Date) => ` de ${MESES[d.getMonth()]}`;

export function partesDoPeriodo(de: string, ate: string, mes: (d: Date) => string = mesCurto): PartesDoPeriodo {
  const [a, b] = [dataDoIso(de), dataDoIso(ate)];
  return { dia1: a.getDate(), mes1: a.getMonth() === b.getMonth() ? '' : mes(a), dia2: b.getDate(), mes2: mes(b) };
}

/** O período dos dias à vista, curto, para o seletor do celular: "25 – 26/11"; na virada do mês (ou do ano), o mês
    vai nos dois lados ("30/11 – 1/12", "31/12 – 1/1"). */
export function periodoCurto(de: string, ate: string): string {
  const { dia1, mes1, dia2, mes2 } = partesDoPeriodo(de, ate);
  return `${dia1}${mes1} – ${dia2}${mes2}`;
}

/** Onde o período conta: o dia (ISO) de cada posição, quantos dias o período cobre e como o mês se escreve. No celular,
    as posições são os dias da faixa e o período tem dois dias ("25 – 26/11"); no computador, são os dias contados de
    hoje (inicioDaSemana) e o período tem sete ("24 – 30 de novembro"). Os dias contam pelas datas nos dois. */
export interface EixoDoPeriodo {
  dia: (k: number) => string;
  dias: number;
  mes: (d: Date) => string;
}

/** O eixo da faixa do celular: as posições são os dias da faixa (`isos`). */
export const eixoDaFaixa = (isos: string[]): EixoDoPeriodo => ({ dia: (k) => isos[k], dias: 2, mes: mesCurto });
/** O eixo da semana do computador: as posições são os dias contados a partir de `agora` (-1 é ontem). */
export const eixoDaSemana = (agora: Date): EixoDoPeriodo => ({ dia: (k) => isoLocal(somarDias(agora, k)), dias: 7, mes: mesPorExtenso });

/** As funções do período aceitam o eixo ou, como antes, só os dias da faixa do celular. */
const comoEixo = (e: EixoDoPeriodo | string[]): EixoDoPeriodo => (Array.isArray(e) ? eixoDaFaixa(e) : e);
const partesEm = (e: EixoDoPeriodo, k: number) => partesDoPeriodo(e.dia(k), e.dia(k + e.dias - 1), e.mes);

/** Quanto os dias do seletor levam contando, em ms. */
export const PERIODO_MS = 340;
/** Na virada do mês, quanto os meses levam apagando antes de os dias começarem a contar, em ms (o fade dos meses em
    estilos.css é um pouco mais curto, para nunca sobrar um mês à vista com um dia novo). */
export const MESES_APAGAM_MS = 80;

const mesesMudam = (e: EixoDoPeriodo, de: number, para: number) => {
  const [a, b] = [partesEm(e, de), partesEm(e, para)];
  return a.mes1 !== b.mes1 || a.mes2 !== b.mes2;
};

/** Quanto dura a contagem do período da posição `de` até `para`: na virada do mês, os meses apagam antes de os dias
    contarem. */
export function duracaoDoPeriodo(eixo: EixoDoPeriodo | string[], de: number, para: number): number {
  return mesesMudam(comoEixo(eixo), de, para) ? MESES_APAGAM_MS + PERIODO_MS : PERIODO_MS;
}

/** A posição no instante `p` (de 0 a 1, ao longo de duracaoDoPeriodo) da contagem de `de` até `para`: na virada do
    mês, parada na partida enquanto os meses apagam. É por ela que os dias contam: os do seletor e, no computador, os
    do cabeçalho de cada coluna. */
export function posicaoNaContagem(eixo: EixoDoPeriodo | string[], de: number, para: number, p: number): number {
  const e = comoEixo(eixo);
  if (!mesesMudam(e, de, para)) return valorNaContagem(de, para, p);
  if (p >= 1) return para;
  const ms = p * duracaoDoPeriodo(e, de, para);
  return valorNaContagem(de, para, Math.max(0, ms - MESES_APAGAM_MS) / PERIODO_MS);
}

/** O período no instante `p` (de 0 a 1, ao longo de duracaoDoPeriodo) da contagem da posição `de` até `para` no eixo
    (no celular, `isos`: os dias da faixa). Os dias contam pelas datas (30 → 1 passa pela virada). Quando os meses vão
    mudar, eles ficam apagados até o fim, com os meses da partida guardando a vaga, e os dias só começam a contar depois
    que os meses terminam de apagar: assim nunca aparece um mês errado ("1/11", "30/12"), e o "/11" da esquerda só abre
    ou fecha a vaga no fim. */
export function periodoNaContagem(eixo: EixoDoPeriodo | string[], de: number, para: number, p: number): PartesDoPeriodo & { mesesApagados: boolean } {
  const e = comoEixo(eixo);
  const agora = partesEm(e, posicaoNaContagem(e, de, para, p));
  if (!mesesMudam(e, de, para) || p >= 1) return { ...agora, mesesApagados: false };
  const partida = partesEm(e, de);
  return { dia1: agora.dia1, mes1: partida.mes1, dia2: agora.dia2, mes2: partida.mes2, mesesApagados: true };
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
