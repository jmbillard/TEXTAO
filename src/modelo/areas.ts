/* As áreas de trabalho (#100): visões do mesmo PROMeiro, com o mesmo login, e não papéis de permissão. A regra de
   quem tem qual área é uma só, do servidor (que sabe quem é quem pelo e-mail nos cadastros) e do navegador. */

export type Area = 'designer' | 'redator' | 'editor';
/** As áreas dos roteiros de alguém: o campo do roteiro em que a pessoa aparece pelo nome. */
export type AreaDosRoteiros = Exclude<Area, 'designer'>;

/** As três, na ordem do seletor, cada uma com o que ela mostra. */
export const AREAS: readonly { id: Area; nome: string; mostra: string }[] = [
  { id: 'designer', nome: 'Designer', mostra: 'a fila, a agenda No Trello, os filmes e a revisão' },
  { id: 'redator', nome: 'Redator', mostra: 'os roteiros que você escreve, por dia' },
  { id: 'editor', nome: 'Editor', mostra: 'os roteiros que você edita, por dia' },
];

export const ehArea = (x: unknown): x is Area => AREAS.some((a) => a.id === x);
export const ehAreaDosRoteiros = (x: unknown): x is AreaDosRoteiros => x === 'redator' || x === 'editor';

/** Todo mundo tem a Designer; o cadastro de redator dá a Redator e o de editor, a Editor. O administrador tem as três. */
export function areasDaPessoa({ admin, redator, editor }: { admin: boolean; redator: boolean; editor: boolean }): Area[] {
  return AREAS.map((a) => a.id).filter((a) => a === 'designer' || admin || (a === 'redator' ? redator : editor));
}

/** A área em que o PROMeiro abre: a última usada, se a pessoa ainda a tem; senão, a Designer. */
export const areaDeEntrada = (ultima: unknown, areas: readonly Area[]): Area => (ehArea(ultima) && areas.includes(ultima) ? ultima : 'designer');
