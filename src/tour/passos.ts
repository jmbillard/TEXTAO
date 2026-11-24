/* A sequência de passos do tour da revisão: uma máquina pura, sem tela. Ela diz em que passo o tour está, se uma
   ação da pessoa avança, e trata pular e terminar. O desenho do balão (TourDaRevisao.tsx) só pergunta a ela. */

/** O que a pessoa faz na tela e que pode fazer o tour seguir. */
export type Acao =
  | 'colar'
  | 'escolher-arquivo'
  | 'revisar'
  | 'escolher-editor'
  | 'bolinha'
  | 'fogo-alta'
  | 'enviar'
  | 'terminar';

export type IdDoPasso = 'chegar' | 'fila' | 'ficha' | 'bolinha' | 'fogo' | 'enviar' | 'no-trello';

export interface Passo {
  id: IdDoPasso;
  /** A anotação à mão no alto do balão. */
  etapa: string;
  /** A frase curta do balão. */
  texto: string;
  /** As ações que fazem o tour seguir deste passo. */
  acoes: readonly Acao[];
}

/** Os sete passos, na ordem, com os textos do rascunho aprovado (sem o passo do tipo, que foi cortado). */
export const PASSOS: readonly Passo[] = [
  { id: 'chegar', etapa: 'chegar', texto: 'Os roteiros chegam por aqui. Clique em Colar do Word para trazer o exemplo.', acoes: ['colar', 'escolher-arquivo'] },
  { id: 'fila', etapa: 'a fila', texto: 'Ele entrou no dia da exibição, com o que falta conferir. Clique em Revisar.', acoes: ['revisar'] },
  { id: 'ficha', etapa: 'a ficha', texto: 'A claquete já vem preenchida, e o que falta fica em Para revisar. Escolha o editor.', acoes: ['escolher-editor'] },
  { id: 'bolinha', etapa: 'as artes', texto: 'O logo do festival já existe. Clique na bolinha dele: a arte sai do checklist.', acoes: ['bolinha'] },
  { id: 'fogo', etapa: 'as artes', texto: 'O mapa animado dá trabalho. Clique no fogo até ele virar incêndio.', acoes: ['fogo-alta'] },
  { id: 'enviar', etapa: 'enviar', texto: 'Sem pendências, é só enviar. No tour é de mentira: nada vai ao Trello.', acoes: ['enviar'] },
  { id: 'no-trello', etapa: 'no Trello', texto: 'De verdade, o card iria para o Trello e entraria aqui, na agenda. Este foi só de exemplo.', acoes: ['terminar'] },
];

/** O balão de boas-vindas e o da despedida. */
export const CONVITE = { etapa: 'primeira vez por aqui?', texto: 'Em um minuto, você revisa um roteiro de exemplo, da chegada ao envio.' };
export const FIM = { etapa: 'pronto!', texto: 'A fila é sua. Os próximos roteiros são de verdade.' };

/** Onde o tour está: o convite, um dos passos (pelo índice), o fim, ou fora (pulado, recusado ou terminado). */
export type Tour =
  | { fase: 'convite' }
  | { fase: 'passo'; i: number }
  | { fase: 'fim' }
  | { fase: 'fora'; como: 'pulou' | 'terminou' };

export const convidar = (): Tour => ({ fase: 'convite' });

/** "Começar" no convite: o primeiro passo. */
export const comecar = (t: Tour): Tour => (t.fase === 'convite' ? { fase: 'passo', i: 0 } : t);

/** O passo atual, ou null fora dos passos (convite, fim, fora). */
export const passoAtual = (t: Tour): Passo | null => (t.fase === 'passo' ? PASSOS[t.i] : null);

/** A ação faz o tour seguir do passo atual? */
export const aceita = (t: Tour, acao: Acao): boolean => !!passoAtual(t)?.acoes.includes(acao);

/** A pessoa fez `acao`: se é a do passo, o tour segue (do último passo, para o fim); senão, fica onde está. */
export function seguir(t: Tour, acao: Acao): Tour {
  if (t.fase !== 'passo' || !aceita(t, acao)) return t;
  return t.i + 1 < PASSOS.length ? { fase: 'passo', i: t.i + 1 } : { fase: 'fim' };
}

/** "Agora não" no convite ou "pular tour" num passo. */
export const pular = (t: Tour): Tour => (t.fase === 'fora' ? t : { fase: 'fora', como: 'pulou' });

/** A despedida acabou: o tour sai. Só do fim; nos passos, sair é pular. */
export const terminar = (t: Tour): Tour => (t.fase === 'fim' ? { fase: 'fora', como: 'terminou' } : t);
