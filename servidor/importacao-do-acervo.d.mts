/* Os tipos de importacao-do-acervo.mjs, para a tela (src/ui/ImportarAcervo.tsx) e os testes: a conferência da
   importação roda igual no servidor e no navegador. */

/** O estado de uma linha do CSV na conferência: nova · completa o acervo (só ganha o tipo) · corrige o acervo (renomeia
    a mesma linha) · já no acervo · cópia (ou versão, ou a mesma arte repetida no CSV) · fora · para decidir. */
export type EstadoDaImportacao = 'nova' | 'completa' | 'corrige' | 'ja' | 'copia' | 'fora' | 'decidir';

/** As perguntas da conferência: o nome parecido com um do acervo, o acento sugerido, o tipo tirado do começo do nome,
    a sigla que não é tipo e o rodapé composto. */
export type TipoDePergunta = 'parecida' | 'acento' | 'tipoDoNome' | 'sigla' | 'composto';

export interface OpcaoDaPergunta {
  valor: string;
  rotulo: string;
}
export interface PerguntaDaImportacao {
  tipo: TipoDePergunta;
  texto: string;
  opcoes: OpcaoDaPergunta[];
  /** o valor da opção escolhida, o tipo escolhido na linha ou "à mão" (o nome editado); '' sem resposta */
  resposta?: string;
  /** a sigla que não é tipo ("COMP") */
  sigla?: string;
  /** o texto com o acento sugerido */
  sugestao?: string;
  /** a linha do acervo com o nome parecido */
  alvo?: { id: string; arte: string; tipo: string };
}

/** Uma regra de conversão aplicada: hora, abreviação, acento, versão, a grafia de uma fonte ou a decisão. */
export interface MudancaDaImportacao {
  antes: string;
  depois: string;
  regra: string;
  /** a mudança veio de uma regra lembrada desta atração ("regra desta atração") */
  daAtracao?: boolean;
}

/** O que o nome do arquivo deu, antes das escolhas de quem confere. */
export interface OrigemDaLinha {
  /** o motivo de ficar fora pelo próprio nome (pasta, sem o prefixo, sem texto); '' quando a linha vale */
  fora: string;
  arte: string;
  tipo: string;
  copia: boolean;
  versao: string;
  motivo: string;
  mudancas: MudancaDaImportacao[];
  perguntas: PerguntaDaImportacao[];
  naFonte: boolean;
  /** o texto que as trocas da atração leem (sem acento, em maiúsculas, depois da versão e do PROX): a chave das regras
      lembradas a partir desta linha */
  texto: string;
}

/** Uma linha do CSV, convertida numa arte e classificada contra o acervo da atração. */
export interface LinhaDaImportacao {
  /** a linha no arquivo (o cabeçalho é a 1) */
  n: number;
  nome: string;
  caminho: string;
  arte: string;
  /** a sigla do tipo ('' sem tipo) */
  tipo: string;
  estado: EstadoDaImportacao;
  motivo: string;
  /** a marca de versão tirada do fim do nome ("VERT", "D", "6S"; '' sem versão): a versão é a mesma arte */
  versao: string;
  copia: boolean;
  /** o que as regras de conversão mudaram do nome para a arte, na ordem: "antes → depois · regra" (depois '' é o que saiu) */
  mudancas: MudancaDaImportacao[];
  perguntas: PerguntaDaImportacao[];
  origem: OrigemDaLinha;
  /** a linha do acervo que ganha o tipo (completa) ou o nome (corrige) */
  id?: string;
  /** o nome que estava no acervo (corrige) */
  antigo?: string;
}

/** O que quem confere escolheu numa linha. */
export interface Escolha {
  arte?: string;
  tipo?: string;
  tirada?: boolean;
  respostas?: Partial<Record<TipoDePergunta, string>>;
}
export type Escolhas = Record<number, Escolha>;

export type PlacarDaImportacao = Record<EstadoDaImportacao, number>;

/** O que gravar: criar as novas, dar o tipo às que completam e renomear as que corrigem o acervo. */
export interface PlanoDeGravacao {
  criar: { arte: string; tipo: string }[];
  tipar: { id: string; tipo: string }[];
  renomear: { id: string; arte: string; antigo: string; tipo?: string }[];
  semMudanca: number;
}

export interface Conferencia {
  linhas: LinhaDaImportacao[];
  placar: PlacarDaImportacao;
  faltam: number;
  plano: PlanoDeGravacao;
}

export interface LinhaDoAcervo {
  id: string;
  arte: string;
  tipo: string | null;
}

export function conferir(p: { linhas: Pick<LinhaDaImportacao, 'n' | 'nome' | 'caminho' | 'origem'>[]; acervo?: LinhaDoAcervo[]; tipos?: string[]; escolhas?: Escolhas }): Conferencia;

/** As decisões em lote, como novas escolhas. */
export function emLote(linhas: LinhaDaImportacao[], escolhas: Escolhas, acao: { acentos: true } | { siglaFora: string } | { tipo: string; ns: number[] } | { tirar: true; ns: number[] }): Escolhas;

/** As regras desta atração no formato das cargas à mão (os JSONs de regras): as expressões são texto. */
export interface RegrasDaAtracao {
  trocas?: { re: string; por: string; motivo?: string; fixo?: boolean }[];
  ignorar?: { re: string; motivo?: string }[];
  versoes?: (string | { re: string; motivo?: string })[];
  copias?: (string | { re: string; motivo?: string })[];
  semSigla?: { re: string; tipo: string; motivo?: string }[];
  tipos?: { re: string; tipo: string; motivo?: string }[];
}

/** Uma decisão lembrada como regra da atração (o tipo da regra, a expressão e o que ela faz). */
export interface RegraLembrada {
  tipo: 'troca' | 'ignorar' | 'versao' | 'copia' | 'semSigla' | 'tipo';
  re: string;
  por?: string;
  fixo?: boolean;
  /** o tipo da arte (semSigla e tipo) */
  tipoDaArte?: string;
  motivo: string;
}

export function classificar(p: {
  csv: string;
  acervo?: LinhaDoAcervo[];
  tipos?: string[];
  grafias?: { roteirosDaAtracao?: string[]; roteiros?: string[]; acervo?: string[] };
  regras?: RegrasDaAtracao;
  escolhas?: Escolhas;
}): Conferencia;

/** As decisões da conferência que viram regras desta atração. */
export function regrasDasDecisoes(p: { linhas: LinhaDaImportacao[]; escolhas?: Escolhas }): RegraLembrada[];

/** As regras lembradas no formato das cargas à mão. */
export function comoRegras(lista?: RegraLembrada[]): RegrasDaAtracao;
