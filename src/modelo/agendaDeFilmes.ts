/* A agenda de filmes da aba Filmes (#169): os filmes que o servidor lê (GET /api/filmes/agenda, a mesma leitura dos
   filmes recentes do Padeiro), agrupados para a tela. Duas formas de ver, escolhidas pela pessoa e lembradas por ela
   (a preferência `filmes.agenda`): por data de exibição (os dias em colunas, de hoje em diante) e por sessão ou atração
   (uma faixa por sessão: Sessão da Tarde, Temperatura Máxima, Corujão…). Aqui só a regra, sem tela. */

/** A Produção ligada pelo card da exibição, com a etapa. */
export interface ProducaoDoFilme {
  id: string;
  etapa: 'entrada' | 'produzindo' | 'entregue' | 'arquivada';
  designers: string[];
}

/** Uma exibição do filme: o dia (AAAA-MM-DD, Brasília), a hora quando o cadastro tem ("22:30"), a sessão e o card. */
export interface ExibicaoDoFilme {
  id: string;
  dia: string;
  hora: string | null;
  sessao: string;
  inedito: boolean;
  trello: string | null;
  producao: ProducaoDoFilme | null;
}

/** Um filme da agenda, como o cadastro tem: o pôster é o caminho com login (null sem pôster). */
export interface FilmeDaAgenda {
  id: string;
  titulo: string;
  ano: number | null;
  pasta: string;
  projeto: { win: string; mac: string };
  output: { win: string; mac: string };
  poster: string | null;
  exibicoes: ExibicaoDoFilme[];
}

export interface AgendaDeFilmes {
  hoje: string;
  filmes: FilmeDaAgenda[];
}

/** Um pôster na agenda: o filme numa exibição. */
export interface FilmeNaAgenda {
  filme: FilmeDaAgenda;
  exibicao: ExibicaoDoFilme;
}

export type FormaDaAgenda = 'data' | 'sessao';
export const FORMAS_DA_AGENDA: readonly FormaDaAgenda[] = ['data', 'sessao'];
/** A preferência da pessoa (#101): a forma de ver a agenda de filmes. */
export const CHAVE_DA_AGENDA_DE_FILMES = 'filmes.agenda';
/** Sem escolha, por data de exibição. */
export const formaDaAgenda = (preferencias: Record<string, unknown>): FormaDaAgenda => (preferencias[CHAVE_DA_AGENDA_DE_FILMES] === 'sessao' ? 'sessao' : 'data');
/** O motivo de recusar o valor da preferência, ou null quando ele vale. */
export const recusaDaFormaDaAgenda = (valor: unknown): string | null =>
  FORMAS_DA_AGENDA.includes(valor as FormaDaAgenda) ? null : 'Forma da agenda de filmes desconhecida: escolha por data ou por sessão.';

/** O nome da faixa da exibição sem sessão. */
export const SEM_SESSAO = 'Sem sessão';

const comparar = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'pt-BR');

/** Os pôsteres de hoje em diante (o que já passou fica só no card aberto). */
function daquiEmDiante(filmes: readonly FilmeDaAgenda[], hoje: string): FilmeNaAgenda[] {
  return filmes.flatMap((filme) => filme.exibicoes.filter((e) => e.dia >= hoje).map((exibicao) => ({ filme, exibicao })));
}

/** A ordem no dia: as com hora primeiro, pela hora; a sem hora (só o dia) vai pela sessão, depois das que têm hora. */
const ordemNoDia = (a: FilmeNaAgenda, b: FilmeNaAgenda) =>
  Number(!a.exibicao.hora) - Number(!b.exibicao.hora) || comparar(a.exibicao.hora, b.exibicao.hora) || comparar(a.exibicao.sessao, b.exibicao.sessao) || comparar(a.filme.titulo, b.filme.titulo);

/** Por data de exibição: um dia por coluna, só os dias com filme, de hoje em diante; no dia, pela hora e pela sessão. */
export function porData(filmes: readonly FilmeDaAgenda[], hoje: string): { dia: string; itens: FilmeNaAgenda[] }[] {
  const dias = new Map<string, FilmeNaAgenda[]>();
  for (const x of daquiEmDiante(filmes, hoje)) dias.set(x.exibicao.dia, [...(dias.get(x.exibicao.dia) ?? []), x]);
  return [...dias].sort(([a], [b]) => comparar(a, b)).map(([dia, itens]) => ({ dia, itens: itens.sort(ordemNoDia) }));
}

/** O dia AAAA-MM-DD somado de `n` dias (só o calendário, sem fuso). */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** O dia da exibição diante de hoje: já passou, passa hoje ou ainda vai passar. */
export type QuandoPassa = 'passou' | 'hoje' | 'vai-passar';
export const quandoPassa = (dia: string, hoje: string): QuandoPassa => (dia < hoje ? 'passou' : dia === hoje ? 'hoje' : 'vai-passar');

/** Uma semana da agenda de filmes (#182): os sete dias, cada um com as exibições, e o resumo dela. */
export interface SemanaDeFilmes {
  dias: { dia: string; itens: FilmeNaAgenda[] }[];
  /** quantas exibições a semana tem e quantas são inéditas */
  exibicoes: number;
  ineditas: number;
}

/**
 * A semana da agenda de filmes, igual à semana da agenda No Trello (#182): sete dias a partir de `inicio` dias contados
 * de hoje (o `inicioDaSemana` da agenda: a de agora começa ontem), todos, com filme ou sem. Os dias que já passaram
 * ficam, com o que passou neles; no dia, pela hora e pela sessão.
 */
export function semanaDosFilmes(filmes: readonly FilmeDaAgenda[], hoje: string, inicio: number): SemanaDeFilmes {
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(hoje, inicio + i));
  const porDia = new Map<string, FilmeNaAgenda[]>(dias.map((d) => [d, []]));
  for (const filme of filmes) for (const exibicao of filme.exibicoes) porDia.get(exibicao.dia)?.push({ filme, exibicao });
  const semana = dias.map((dia) => ({ dia, itens: (porDia.get(dia) ?? []).sort(ordemNoDia) }));
  const todas = semana.flatMap((d) => d.itens);
  return { dias: semana, exibicoes: todas.length, ineditas: todas.filter((x) => x.exibicao.inedito).length };
}

/** O texto do jeito de buscar: sem acento, sem caixa, a pontuação vira espaço. Sem importar nada: o servidor lê este
    módulo direto pelo node (servidor/app.mjs). */
const paraBuscar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * A busca da lupa na agenda de filmes (#182): as exibições cujo filme ou sessão têm todas as palavras do termo (no
 * título, no ano ou na sessão), sem diferença de caixa e acento, em todas as semanas que a agenda leu. Em ordem de dia
 * e, no dia, como na agenda. Sem termo, nada.
 */
export function buscarNaAgenda(filmes: readonly FilmeDaAgenda[], termo: string): FilmeNaAgenda[] {
  const palavras = paraBuscar(termo).split(' ').filter(Boolean);
  if (!palavras.length) return [];
  const achados: FilmeNaAgenda[] = [];
  for (const filme of filmes)
    for (const exibicao of filme.exibicoes) {
      const texto = ` ${paraBuscar([filme.titulo, filme.ano ?? '', exibicao.sessao].join(' '))} `;
      if (palavras.every((p) => texto.includes(p))) achados.push({ filme, exibicao });
    }
  return achados.sort((a, b) => comparar(a.exibicao.dia, b.exibicao.dia) || ordemNoDia(a, b));
}

/** Por sessão ou atração: uma faixa por sessão, na ordem da próxima exibição dela; na faixa, por dia e hora. */
export function porSessao(filmes: readonly FilmeDaAgenda[], hoje: string): { sessao: string; itens: FilmeNaAgenda[] }[] {
  const sessoes = new Map<string, FilmeNaAgenda[]>();
  for (const x of daquiEmDiante(filmes, hoje)) {
    const nome = x.exibicao.sessao.trim() || SEM_SESSAO;
    sessoes.set(nome, [...(sessoes.get(nome) ?? []), x]);
  }
  const ordenadas = [...sessoes].map(([sessao, itens]) => ({
    sessao,
    itens: itens.sort((a, b) => comparar(a.exibicao.dia, b.exibicao.dia) || comparar(a.exibicao.hora, b.exibicao.hora) || comparar(a.filme.titulo, b.filme.titulo)),
  }));
  // a faixa sem sessão vai por último
  return ordenadas.sort((a, b) => Number(a.sessao === SEM_SESSAO) - Number(b.sessao === SEM_SESSAO) || comparar(a.itens[0].exibicao.dia, b.itens[0].exibicao.dia) || comparar(a.sessao, b.sessao));
}

/** O caminho da pasta para o sistema da pessoa (o do Mac no Mac; senão, o do Windows), ou o outro quando falta. */
export const caminhoNoSistema = (c: { win: string; mac: string }, mac: boolean): string => (mac ? c.mac || c.win : c.win || c.mac);
