import type { CSSProperties } from 'react';
import type { TipoEtiqueta } from '../modelo/tipos';

/* Ícones de traço fino, todos no mesmo desenho da tesoura. */

const D = {
  arte: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M6 14h8',
  edicao:
    'M20.2 6L3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z M6.2 5.3l3.1 3.9 M12.4 3.4l3.1 4 M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  locutor: 'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z M5 10a7 7 0 0 0 14 0 M12 17v4',
  sonoplastia: 'M9 18V5l12-2v13 M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M15 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  cortavel: 'M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M20 4L8.1 15.9 M14.5 14.5L20 20 M8.1 8.1L12 12',
  producao: 'M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  comentario: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  voltar: 'M15 18l-6-6 6-6',
  atencao: 'M12 5v9 M12 19v.01',
  lupa: 'M4 11a7 7 0 1 0 14 0a7 7 0 1 0 -14 0 M16 16l4.5 4.5',
  colar: 'M9 4h6v3H9z M15 5h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3 M9 12h6 M9 16h4',
  seta: 'M5 12h14 M13 6l6 6-6 6',
  baixo: 'M6 9l6 6 6-6',
  direita: 'M9 6l6 6-6 6',
  certo: 'M20 6L9 17l-5-5',
  mais: 'M12 5v14 M5 12h14',
  importar: 'M12 15V3 M7 8l5-5 5 5 M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  baixar: 'M12 3v12 M7 10l5 5 5-5 M4 19h16',
  corrido: 'M6 6h12 M6 12h12 M6 18h8',
  colunas: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M10 4v16',
  arquivo: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z M14 3v5h5',
  copiar: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  imprimir: 'M6 9V3h12v6 M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2 M6 14h12v7H6z',
  lixo: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  duplicar: 'M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z M4 16V4a1 1 0 0 1 1-1h11',
  fechar: 'M6 6l12 12 M18 6L6 18',
  pessoas: 'M3 20a6 6 0 0 1 12 0 M5.5 8.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0 M16 4.6a3.5 3.5 0 0 1 0 6.8 M18 14.5a6 6 0 0 1 3 5.5',
  desfazer: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  refazer: 'M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  historico: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2',
  cadeado: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z M8 11V7a4 4 0 0 1 8 0v4',
  olho: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  borracha: 'M20 20H9 M4.5 14.5l9-9a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L11 20H8l-3.5-3.5a1.4 1.4 0 0 1 0-2z',
} as const;

export type NomeIcone = keyof typeof D;

export function Icone({ nome, tam = 16, traco = 1.9, style }: { nome: NomeIcone; tam?: number; traco?: number; style?: CSSProperties }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d={D[nome]} />
    </svg>
  );
}

/** Ícone dentro do quadradinho neutro, como nos menus. */
export function Selo({ nome }: { nome: NomeIcone }) {
  return (
    <span className="selo">
      <Icone nome={nome} tam={14} traco={2} />
    </span>
  );
}

export const iconeDaEtiqueta = (t: TipoEtiqueta): NomeIcone => t;
