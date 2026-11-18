/* Modelo de dados do roteiro. O corpo é um documento ProseMirror (JSON);
   tudo o que sai para outros departamentos é derivado dele em `exportar.ts`. */

export const SCHEMA_VERSION = '1.0';

export type Layout = 'coluna_unica' | 'ilustracao_audio' | 'instrucoes_texto';
export type TipoPrograma = 'novela' | 'ao_vivo' | 'esporte' | 'auditorio' | 'outro';
export type Status = 'rascunho' | 'revisao' | 'aprovado' | 'em_producao' | 'finalizado';

export type SubtipoArte = 'rodape' | 'tela_cheia' | 'lettering' | 'logo' | 'versao' | 'selo' | 'outro';
export type TipoEtiqueta = 'edicao' | 'locutor' | 'sonoplastia' | 'cortavel' | 'producao' | 'comentario';

export const SUBTIPOS_ARTE: { id: SubtipoArte; nome: string; curto: string }[] = [
  { id: 'rodape', nome: 'Rodapé / GC', curto: 'Rodapé' },
  { id: 'tela_cheia', nome: 'Tela cheia', curto: 'Tela cheia' },
  { id: 'lettering', nome: 'Lettering em alpha', curto: 'Lettering' },
  { id: 'logo', nome: 'Logo', curto: 'Logo' },
  { id: 'versao', nome: 'Versão', curto: 'Versão' },
  { id: 'selo', nome: 'Selo', curto: 'Selo' },
  { id: 'outro', nome: 'Outro', curto: 'Outro' },
];

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
  locutor: string;
  selo: string;
  duracaoAlvoSeg: number | null;
  /** "fechar" = fechar com N''; "max" = no máximo N''. */
  duracaoModo: 'fechar' | 'max';
  layout: Layout;
  status: Status;
}

export const metaVazia = (): Meta => ({
  titulo: '',
  programa: '',
  tipoPrograma: 'outro',
  dataExibicao: '',
  capitulo: null,
  edicao: '',
  praca: '',
  redator: '',
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
  compartilhadoCom?: string[];
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
