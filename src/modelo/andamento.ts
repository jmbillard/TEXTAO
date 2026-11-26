/* O Andamento do projeto (#92), as regras sem rede: a trilha das etapas do ADR 0006 (uma referência fixa, mudada
   aqui quando o projeto avança), as specs que viram frentes e a montagem das frentes, do progresso e da situação de
   cada ticket a partir das issues, das sub-issues e dos títulos dos commits do GitHub. Feito = issue fechada OU um
   commit da branch de desenvolvimento cita o ticket no título, "(#N)". O mesmo módulo serve ao servidor e ao navegador. */

/** Uma issue como a API REST do GitHub devolve (só o que se usa; o corpo nunca). */
export interface IssueDoGitHub {
  number: number;
  title: string;
  state: 'open' | 'closed' | string;
  html_url?: string;
  closed_at?: string | null;
  labels?: ({ name?: string } | string)[];
  sub_issues_summary?: { total?: number };
  /** só nos pull requests (a API de issues também os lista) */
  pull_request?: unknown;
}

export type SituacaoDoTicket = 'fechada' | 'pronta no código' | 'aberta';
export type SituacaoDaFrente = 'concluída' | 'em andamento' | 'planejada';

export interface TicketDoAndamento {
  numero: number;
  titulo: string;
  situacao: SituacaoDoTicket;
  url: string;
}
export interface Frente {
  spec: number;
  nome: string;
  titulo: string;
  url: string;
  specFechada: boolean;
  feitos: number;
  total: number;
  situacao: SituacaoDaFrente;
  /** o primeiro ticket ainda aberto (o que vem agora); null quando todos estão feitos */
  proximo: TicketDoAndamento | null;
  tickets: TicketDoAndamento[];
}
export interface Andamento {
  frentes: Frente[];
  /** os tickets fora das specs que se acompanham também (não contam no resumo) */
  avulsos: TicketDoAndamento[];
  resumo: { feitos: number; total: number };
}

/** Uma etapa da meta de longo prazo (ADR 0006). */
export interface Etapa {
  ordem: number;
  etapa: string;
  resumo: string;
  situacao: 'quase pronta' | 'próxima' | 'futura' | 'depois' | 'feita';
  nota?: string;
}

/** A trilha do ADR 0006, com a etapa atual: mude aqui quando o projeto avançar. */
export const ETAPAS: Etapa[] = [
  { ordem: 1, etapa: 'Espelho', resumo: 'O PROMeiro mostra o que está no Trello', situacao: 'quase pronta', nota: 'Fila, agenda e cards do Trello já aparecem no PROMeiro' },
  { ordem: 2, etapa: 'O PROMeiro manda', resumo: 'O PROMeiro manda e o Trello espelha', situacao: 'próxima', nota: 'A Fundação da gestão (#85) é o alicerce' },
  { ordem: 3, etapa: 'Designer no PROMeiro', resumo: 'O trabalho do designer acontece no PROMeiro', situacao: 'futura' },
  { ordem: 4, etapa: 'Desligar o Trello', resumo: 'O Trello deixa de ser usado', situacao: 'futura' },
  { ordem: 5, etapa: 'Banco próprio', resumo: 'Um Postgres próprio no lugar do Teable', situacao: 'futura' },
  { ordem: 6, etapa: 'O n8n sai', resumo: 'O Padeiro fala direto com a API do PROMeiro', situacao: 'depois', nota: 'Logo depois de deixar o Trello e o Teable' },
];

/**
 * As specs que viram frentes, na ordem da página, com o nome curto. A lista é fixa no código (como a trilha): quem
 * escolhe as de antes é ela; as specs mais novas que a última daqui entram sozinhas (veja `specsNovas`).
 */
export const SPECS: { numero: number; nome: string }[] = [
  { numero: 56, nome: 'Importação do acervo' },
  { numero: 64, nome: 'Duplicadas' },
  { numero: 69, nome: 'Configuração' },
  { numero: 55, nome: 'Filmes no celular' },
  { numero: 85, nome: 'Fundação da gestão' },
];
/** Os tickets fora das specs que se acompanham também (o próprio Andamento). */
export const AVULSOS: number[] = [92];
/** O rótulo das specs prontas: as novas entram sozinhas com ele. */
export const ROTULO_DAS_SPECS = 'pronto-para-agente';

/** Os números que os títulos dos commits citam como "(#N)" (só a primeira linha da mensagem). */
export function prontosNoCodigo(titulos: string[]): Set<number> {
  const vistos = new Set<number>();
  for (const t of titulos) for (const m of String(t ?? '').split('\n')[0].matchAll(/\(#(\d+)\)/g)) vistos.add(Number(m[1]));
  return vistos;
}

/** O nome da frente pelo título da spec: sem o "Spec:", até os primeiros dois-pontos. */
export function nomeDaFrente(titulo: string): string {
  const sem = String(titulo ?? '').replace(/^\s*spec\s*:\s*/i, '').trim();
  const nome = sem.includes(':') ? sem.slice(0, sem.indexOf(':')).trim() : sem;
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** O título do ticket sem o prefixo da frente ("Configuração: a seção Card" → "a seção Card"). */
export const tituloCurto = (titulo: string) => String(titulo ?? '').replace(/^[^:]+:\s*/, '');

const ehPullRequest = (i: IssueDoGitHub) => i.pull_request !== undefined && i.pull_request !== null;
const rotulos = (i: IssueDoGitHub) => (i.labels ?? []).map((r) => (typeof r === 'string' ? r : (r?.name ?? '')));

/**
 * As specs novas que entram sozinhas: mais novas que a última da lista fixa, com sub-issues e o rótulo das specs
 * prontas. As de antes ficam de fora (specs antigas, já tocadas, não poluem a página).
 */
export function specsNovas(candidatas: IssueDoGitHub[], daLista: number[]): IssueDoGitHub[] {
  const ultima = Math.max(0, ...daLista);
  return candidatas
    .filter((i) => !ehPullRequest(i) && i.number > ultima && (i.sub_issues_summary?.total ?? 0) > 0 && rotulos(i).includes(ROTULO_DAS_SPECS))
    .sort((a, b) => a.number - b.number);
}

/**
 * Monta as frentes (uma por spec, na ordem dada), o progresso e a situação de cada ticket.
 * @param specs cada spec com as sub-issues dela (e o nome curto; sem ele, sai do título)
 * @param avulsos os tickets fora das specs
 * @param titulosDeCommits os títulos dos commits da branch de desenvolvimento
 */
export function montarAndamento({ specs, avulsos = [], titulosDeCommits }: { specs: { issue: IssueDoGitHub; subIssues: IssueDoGitHub[]; nome?: string }[]; avulsos?: IssueDoGitHub[]; titulosDeCommits: string[] }): Andamento {
  const prontos = prontosNoCodigo(titulosDeCommits);
  const ticket = (i: IssueDoGitHub): TicketDoAndamento => ({
    numero: i.number,
    titulo: i.title,
    situacao: i.state === 'closed' ? 'fechada' : prontos.has(i.number) ? 'pronta no código' : 'aberta',
    url: i.html_url ?? '',
  });
  const frentes = specs.map(({ issue, subIssues, nome }): Frente => {
    const tickets = subIssues.filter((i) => !ehPullRequest(i)).sort((a, b) => a.number - b.number).map(ticket);
    const feitos = tickets.filter((t) => t.situacao !== 'aberta').length;
    const total = tickets.length;
    return {
      spec: issue.number,
      nome: nome || nomeDaFrente(issue.title),
      titulo: issue.title,
      url: issue.html_url ?? '',
      specFechada: issue.state === 'closed',
      feitos,
      total,
      situacao: total && feitos === total ? 'concluída' : feitos ? 'em andamento' : 'planejada',
      proximo: tickets.find((t) => t.situacao === 'aberta') ?? null,
      tickets,
    };
  });
  return {
    frentes,
    avulsos: avulsos.filter((i) => !ehPullRequest(i)).map(ticket),
    resumo: { feitos: frentes.reduce((s, f) => s + f.feitos, 0), total: frentes.reduce((s, f) => s + f.total, 0) },
  };
}
