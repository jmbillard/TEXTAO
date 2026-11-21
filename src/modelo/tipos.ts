/* Modelo de dados do roteiro. O corpo é um documento ProseMirror (JSON);
   tudo o que sai para outros departamentos é derivado dele em `exportar.ts`. */

export const SCHEMA_VERSION = '1.0';

export type Layout = 'coluna_unica' | 'ilustracao_audio' | 'instrucoes_texto';
export type TipoPrograma = 'novela' | 'ao_vivo' | 'esporte' | 'auditorio' | 'outro';
export type Status = 'rascunho' | 'revisao' | 'aprovado' | 'em_producao' | 'finalizado';

/** '' = ainda sem tipo: o app nunca sugere, quem escolhe é a pessoa. */
export type SubtipoArte = '' | 'rodape' | 'cartao' | 'lettering' | 'vinheta' | 'assinatura' | 'logo' | 'passagem' | 'foto' | 'moldura';
export type TipoEtiqueta = 'edicao' | 'locutor' | 'sonoplastia' | 'cortavel' | 'producao' | 'comentario';

export const SUBTIPOS_ARTE: { id: Exclude<SubtipoArte, ''>; nome: string; curto: string }[] = [
  { id: 'rodape', nome: 'Rodapé', curto: 'Rodapé' },
  { id: 'cartao', nome: 'Cartão', curto: 'Cartão' },
  { id: 'lettering', nome: 'Lettering com alpha', curto: 'Lettering alpha' },
  { id: 'vinheta', nome: 'Vinheta', curto: 'Vinheta' },
  { id: 'assinatura', nome: 'Assinatura', curto: 'Assinatura' },
  { id: 'logo', nome: 'Logo Globo', curto: 'Logo Globo' },
  { id: 'passagem', nome: 'Passagem', curto: 'Passagem' },
  { id: 'foto', nome: 'Foto', curto: 'Foto' },
  { id: 'moldura', nome: 'Moldura', curto: 'Moldura' },
];

/** Roteiros antigos usavam outros tipos; o que não existe mais volta a ficar sem tipo. */
export const normalizarSubtipo = (s: unknown): SubtipoArte =>
  s === 'tela_cheia' ? 'cartao' : SUBTIPOS_ARTE.some((x) => x.id === s) ? (s as SubtipoArte) : '';

export const ETIQUETAS: { id: TipoEtiqueta; nome: string; rotulo: string; atalho: string }[] = [
  { id: 'edicao', nome: 'Orientação para a edição', rotulo: 'edição', atalho: 'Mod-Shift-1' },
  { id: 'locutor', nome: 'Orientação para o locutor', rotulo: 'locutor', atalho: 'Mod-Shift-2' },
  { id: 'sonoplastia', nome: 'Sonoplastia', rotulo: 'sonoplastia', atalho: 'Mod-Shift-3' },
  { id: 'cortavel', nome: 'Pode cortar', rotulo: 'cortável', atalho: 'Mod-Shift-4' },
  { id: 'producao', nome: 'Nota de produção', rotulo: 'produção', atalho: 'Mod-Shift-5' },
  { id: 'comentario', nome: 'Transformar em comentário', rotulo: 'comentário', atalho: 'Mod-Shift-m' },
];

export const nomeSubtipo = (s: string) => SUBTIPOS_ARTE.find((x) => x.id === s)?.nome ?? 'Sem tipo';
export const nomeEtiqueta = (t: string) => ETIQUETAS.find((x) => x.id === t)?.rotulo ?? t;

export interface Meta {
  /** Nome da chamada como vai na claquete: vem do nome do arquivo, com a data em dd/mm. */
  claquete: string;
  titulo: string;
  programa: string;
  tipoPrograma: TipoPrograma;
  /** ISO 8601 (AAAA-MM-DD) ou vazio. */
  dataExibicao: string;
  capitulo: number | null;
  /** Edição do programa quando não é capítulo (ex.: "PGM 23"). */
  edicao: string;
  praca: string;
  redator: string;
  editor: string;
  locutor: string;
  selo: string;
  duracaoAlvoSeg: number | null;
  /** "fechar" = fechar com N''; "max" = no máximo N''. */
  duracaoModo: 'fechar' | 'max';
  layout: Layout;
  status: Status;
  /** Motivos para alguém conferir o roteiro antes de enviar. Vazio = pronto. Recalculado a cada mudança. */
  revisar?: string[];
  /** Veio de PDF digitalizado, lido por OCR: pede conferência até alguém marcar como conferido. */
  lidoPorOcr?: boolean;
  /** Páginas do arquivo que subiu, quando o formato diz. */
  paginasOriginal?: number;
  /** Pendências que alguém conferiu e disse "está certo" (ids de pendência). */
  conferidos?: string[];
  /** Este roteiro é a versão nova de outro que já estava na fila (id do anterior), até alguém decidir. */
  substitui?: string;
  /** A claquete já estava na produção da arte (Teable) quando o roteiro chegou: a fila pergunta se é uma v2. */
  naProducao?: NaProducao;
  /** Respondido "é v2": o envio atualiza este card em vez de criar outro. */
  v2De?: { card: string; url: string; registro?: string | null };
  /** Respondido "é outro roteiro": vai como card novo, mesmo com a claquete parecida. */
  outroRoteiro?: boolean;
  /** Artes do roteiro que a atração já tem prontas (acervo do Teable): aviso para quem revisa decidir. */
  jaExistem?: ArteDoAcervo[];
  /** Artes que quem revisa marcou como "já existe" (pela chave): ficam no texto, saem do checklist e não entram no acervo. */
  jaExiste?: string[];
  /** Artes que quem revisa decidiu não produzir (pela chave): ficam no texto, saem do checklist, sem dizer que existem. */
  naoProduzir?: string[];
}

export const metaVazia = (): Meta => ({
  claquete: '',
  titulo: '',
  programa: '',
  tipoPrograma: 'outro',
  dataExibicao: '',
  capitulo: null,
  edicao: '',
  praca: '',
  redator: '',
  editor: '',
  locutor: '',
  selo: '',
  duracaoAlvoSeg: null,
  duracaoModo: 'fechar',
  layout: 'coluna_unica',
  status: 'rascunho',
});

/* ---------- Documento (JSON do ProseMirror) ---------- */

export interface MarcaJSON {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface NoJSON {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NoJSON[];
  text?: string;
  marks?: MarcaJSON[];
}

export interface Pessoa {
  nome: string;
  /** Identificador estável de quem escreve; é o que o login da empresa vai fornecer. */
  email: string;
}

export interface Roteiro {
  id: string;
  meta: Meta;
  doc: NoJSON;
  revisao: number;
  criadoEm: string;
  atualizadoEm: string;
  criadoPor?: Pessoa;
  alteradoPor?: Pessoa;
  /** Visível (só leitura) para as outras pessoas. Só existe com servidor. */
  publico?: boolean;
  /** E-mails de quem pode ler, além do dono. Só o dono recebe esta lista. */
  compartilhadoCom?: { email: string; editar: boolean }[];
  /** O servidor está em modo aberto: todos veem e editam todos os roteiros. */
  aberto?: boolean;
  /** O arquivo que subiu, guardado no servidor para baixar de novo. */
  original?: { nome: string; tipo: string; tamanho: number; em: string };
  /** Outra pessoa é a dona, mas autorizou esta a editar. */
  podeEditar?: boolean;
  /** O documento compartilhado ainda está vazio e cabe a esta sessão preenchê-lo. */
  semear?: boolean;
  /** false quando o roteiro é de outra pessoa (aberto por ser público ou compartilhado). */
  meu?: boolean;
  /** Nome do arquivo de origem, quando importado. */
  origem?: string;
}

export const novoId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export const docVazio = (layout: Layout): NoJSON =>
  layout === 'coluna_unica'
    ? { type: 'doc', content: [{ type: 'paragraph' }] }
    : {
        type: 'doc',
        content: [
          {
            type: 'linha',
            content: [
              { type: 'celula', content: [{ type: 'paragraph' }] },
              { type: 'celula', content: [{ type: 'paragraph' }] },
            ],
          },
        ],
      };

export const NOMES_COLUNAS: Record<Layout, [string, string] | null> = {
  coluna_unica: null,
  ilustracao_audio: ['Ilustração', 'Áudio'],
  instrucoes_texto: ['Instruções', 'Texto'],
};

export interface ArteDoAcervo {
  arte: string;
  chave: string;
  /** Preenchido no Teable (à mão ou por script); o PROMeiro só mostra. */
  tipo: string;
  /** A claquete em que foi pedida. */
  claquete: string;
}

export interface NaProducao {
  card: string;
  url: string;
  registro?: string | null;
  claquete: string;
  entrada: string | null;
  status: string[];
  artes: number;
}

/** O que já está na produção da arte, completo, para comparar (não fica guardado no roteiro). */
export interface ProducaoCompleta extends NaProducao {
  listaDeArtes: string[];
  texto: string;
  redator?: string;
  editor?: string;
}
