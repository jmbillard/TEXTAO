import { armazenamento, pedir } from './armazenamento';
import { ouvirFila } from './eventos';
import type { Ancora, Comentario, Quem } from '../modelo/comentarios';

/* Os comentários do Roteiro escrito no PROMeiro (#192), pelo servidor: ler, comentar, responder, resolver, reabrir, o
   visto e a âncora refeita. E o aviso ao vivo: uma conexão só por página, que só escuta os comentários (não conta como
   presença na fila), para a folha e a bolinha do topo. Sem servidor, não há comentários. */

export interface ComentariosLidos {
  comentarios: Comentario[];
  /** os comentários com aviso desta pessoa ainda não visto: { id: 'mencao' | 'no-seu' } */
  novos: Record<string, 'mencao' | 'no-seu'>;
  /** quem o @ acha */
  pessoas: Quem[];
  /** a pessoa escreve no roteiro (resolve qualquer comentário) */
  escreve: boolean;
}

const base = (id: string) => `/api/roteiros/${encodeURIComponent(id)}/comentarios`;
const comServidor = () => armazenamento.tipo === 'servidor';

export async function lerComentarios(id: string): Promise<ComentariosLidos> {
  if (!comServidor()) return { comentarios: [], novos: {}, pessoas: [], escreve: false };
  return pedir<ComentariosLidos>(base(id));
}
export const comentar = (id: string, texto: string, ancora: Ancora) =>
  pedir<{ comentario: Comentario }>(base(id), { method: 'POST', body: JSON.stringify({ texto, ancora }) }).then((r) => r.comentario);
export const responder = (id: string, fio: string, texto: string) =>
  pedir<{ comentario: Comentario }>(base(id), { method: 'POST', body: JSON.stringify({ texto, fio }) }).then((r) => r.comentario);
export const resolverComentario = (id: string, comentario: string, reabrir = false) =>
  pedir<{ comentario: Comentario }>(`${base(id)}/${encodeURIComponent(comentario)}/${reabrir ? 'reabrir' : 'resolver'}`, { method: 'POST' }).then((r) => r.comentario);
export const marcarVisto = (id: string) => (comServidor() ? pedir<{ vistos: number }>(`${base(id)}/visto`, { method: 'POST' }) : Promise.resolve({ vistos: 0 }));
export const refazerAncoras = (id: string, ancoras: Record<string, Ancora>) => pedir<{ mudadas: number }>(`${base(id)}/ancoras`, { method: 'POST', body: JSON.stringify({ ancoras }) });

/** Os avisos não vistos da pessoa, por roteiro. */
export async function lerAvisos(): Promise<Record<string, { n: number; mencao: boolean }>> {
  if (!comServidor()) return {};
  return (await pedir<{ roteiros: Record<string, { n: number; mencao: boolean }> }>('/api/avisos')).roteiros;
}

/** O que chega ao vivo: os comentários de um roteiro mudaram, ou alguém viu os avisos dele. */
export type AvisoDeComentario = { tipo: 'comentarios' | 'avisos'; id: string; por: string } | { tipo: 'reconectou' };

const ouvintes = new Set<(a: AvisoDeComentario) => void>();
let conexao: { parar: () => void } | null = null;

/** Escuta os avisos dos comentários ao vivo; devolve o parar. Uma conexão por página, aberta enquanto alguém escuta. */
export function ouvirComentarios(aoReceber: (a: AvisoDeComentario) => void): () => void {
  if (!comServidor() || typeof WebSocket === 'undefined') return () => {};
  ouvintes.add(aoReceber);
  // a mesma conexão da fila, só com os comentários
  conexao ??= ouvirFila(
    (e) => {
      if (e.tipo === 'comentarios' || e.tipo === 'avisos' || e.tipo === 'reconectou') for (const o of ouvintes) o(e);
    },
    { so: 'comentarios' },
  );
  return () => {
    ouvintes.delete(aoReceber);
    if (!ouvintes.size) {
      conexao?.parar();
      conexao = null;
    }
  };
}
