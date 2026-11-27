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

/** Por data de exibição: um dia por coluna, só os dias com filme, de hoje em diante; no dia, pela hora e pela sessão. */
export function porData(filmes: readonly FilmeDaAgenda[], hoje: string): { dia: string; itens: FilmeNaAgenda[] }[] {
  const dias = new Map<string, FilmeNaAgenda[]>();
  for (const x of daquiEmDiante(filmes, hoje)) dias.set(x.exibicao.dia, [...(dias.get(x.exibicao.dia) ?? []), x]);
  return [...dias]
    .sort(([a], [b]) => comparar(a, b))
    .map(([dia, itens]) => ({
      dia,
      // a sem hora (só o dia) vai pela sessão, depois das que têm hora
      itens: itens.sort((a, b) => Number(!a.exibicao.hora) - Number(!b.exibicao.hora) || comparar(a.exibicao.hora, b.exibicao.hora) || comparar(a.exibicao.sessao, b.exibicao.sessao) || comparar(a.filme.titulo, b.filme.titulo)),
    }));
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
