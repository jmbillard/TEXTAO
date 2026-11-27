/* As áreas de trabalho (#100): visões do mesmo PROMeiro, com o mesmo login, e não papéis de permissão. A regra de
   quem tem qual área é uma só, do servidor (que sabe quem é quem pelo e-mail nos cadastros) e do navegador. */

export type Area = 'designer' | 'redator' | 'editor';
/** As áreas dos roteiros de alguém: o campo do roteiro em que a pessoa aparece pelo nome. */
export type AreaDosRoteiros = Exclude<Area, 'designer'>;

/** As três, na ordem do seletor, cada uma com o que ela mostra. */
export const AREAS: readonly { id: Area; nome: string; mostra: string }[] = [
  { id: 'designer', nome: 'Designer', mostra: 'a fila, a agenda No Trello, os filmes e a revisão' },
  { id: 'redator', nome: 'Redator', mostra: 'os roteiros que você escreve, por dia, em quadro ou por estado' },
  { id: 'editor', nome: 'Editor', mostra: 'os roteiros que você edita, por dia, em quadro ou por estado' },
];

export const ehArea = (x: unknown): x is Area => AREAS.some((a) => a.id === x);
export const ehAreaDosRoteiros = (x: unknown): x is AreaDosRoteiros => x === 'redator' || x === 'editor';

/** Todo mundo tem a Designer; o cadastro de redator dá a Redator e o de editor, a Editor. A coordenação (#123) também
    tem a Editor, onde fica o "Montar a pauta". O administrador tem as três. */
export function areasDaPessoa({ admin, redator, editor, coordenacao = false }: { admin: boolean; redator: boolean; editor: boolean; coordenacao?: boolean }): Area[] {
  return AREAS.map((a) => a.id).filter((a) => a === 'designer' || admin || (a === 'redator' ? redator : editor || coordenacao));
}

/** A área em que o PROMeiro abre: a última usada, se a pessoa ainda a tem; senão, a Designer. */
export const areaDeEntrada = (ultima: unknown, areas: readonly Area[]): Area => (ehArea(ultima) && areas.includes(ultima) ? ultima : 'designer');

/* ---------- as exibições do Redator e do Editor (#103) ---------- */

/** Como a lista de "meus roteiros" se mostra: por dia (a de sempre), em quadro (uma coluna por estado do ciclo) ou por
    estado (uma lista agrupada, boa no celular). */
export type Exibicao = 'dia' | 'quadro' | 'estado';

/** As três, na ordem da escolha no topo da lista. */
export const EXIBICOES: readonly { id: Exibicao; nome: string }[] = [
  { id: 'dia', nome: 'por dia' },
  { id: 'quadro', nome: 'quadro' },
  { id: 'estado', nome: 'por estado' },
];

export const ehExibicao = (x: unknown): x is Exibicao => EXIBICOES.some((e) => e.id === x);

/** A chave das preferências da pessoa em que fica a exibição de cada área ("exibicao.redator"). */
export const chaveDaExibicao = (area: AreaDosRoteiros) => `exibicao.${area}` as const;

/** A área de uma chave de exibição ("exibicao.editor" → editor); null quando a chave não é de exibição de uma área dos
    roteiros (a Designer não tem exibições). */
export function areaDaChaveDeExibicao(chave: string): AreaDosRoteiros | null {
  const [prefixo, area, ...resto] = chave.split('.');
  return prefixo === 'exibicao' && !resto.length && ehAreaDosRoteiros(area) ? area : null;
}

/** A exibição lembrada da área; sem nenhuma (ou com uma que não vale mais), por dia. */
export const exibicaoDaArea = (preferencias: Record<string, unknown> | undefined, area: AreaDosRoteiros): Exibicao => {
  const lembrada = preferencias?.[chaveDaExibicao(area)];
  return ehExibicao(lembrada) ? lembrada : 'dia';
};
