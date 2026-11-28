/* O Roteiro escrito no PROMeiro (#189, spec #186): o estado dele (sendo escrito, antes do primeiro Enviar) e quem o lê
   e quem o escreve. Puro e compartilhado: o servidor decide com estas regras (no acesso e na lista) e o navegador só
   mostra o que o servidor disse. Só sintaxe que o Node apaga. */
import { metaVazia, type Meta } from './tipos.ts';

/** O estado do Roteiro escrito no PROMeiro, guardado pelo servidor: 'sendo-escrito' antes do primeiro Enviar; o Enviar
    (#194) acrescenta 'enviado'. O roteiro que chegou de fora não tem estado (null). */
export type EstadoDoEscrito = 'sendo-escrito' | 'enviado';

export const ehEstadoDoEscrito = (x: unknown): x is EstadoDoEscrito => x === 'sendo-escrito' || x === 'enviado';

/** O que a regra do escrito lê de uma pessoa diante de um roteiro. */
export interface QuemDiante {
  /** é o autor (o dono) */
  autor: boolean;
  /** foi convidada pelo autor: 'ler' ou 'escrever'; null sem convite */
  convite: 'ler' | 'escrever' | null;
  /** o roteiro está visível para a equipe (o `publico`) */
  visivel: boolean;
  /** é da coordenação ou administradora: escreve no roteiro que vê */
  coordenaOuAdministra: boolean;
}

/**
 * Quem lê e quem escreve o Roteiro escrito no PROMeiro. Vale sempre, também com o servidor aberto (ACESSO): o autor
 * tudo; o convidado lê e, com "pode escrever", escreve; com o roteiro visível, a equipe toda lê, e a coordenação e o
 * administrador também escrevem. Fechado, é só do autor e de quem ele convidou. Designer, editor e produtor só leem
 * (o comentário chega no #192).
 */
export function regraDoEscrito(q: QuemDiante): { ler: boolean; escrever: boolean } {
  const escrever = q.autor || q.convite === 'escrever' || (q.visivel && q.coordenaOuAdministra);
  return { ler: escrever || q.convite !== null || q.visivel, escrever };
}

/** Quem pode começar um Roteiro novo: quem é redator (pelo cadastro), a coordenação e o administrador. */
export const podeComecar = (q: { redator: boolean; coordenacao: boolean; admin: boolean }) => q.redator || q.coordenacao || q.admin;

/** O título do Roteiro novo: o que a pessoa deu, sem espaços sobrando, até 200 letras. */
export const tituloLimpo = (t: unknown) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, 200) : '');

/** A meta do Roteiro que começa a ser escrito: sem claquete (ela é proposta no Enviar), com o título e o redator, no
    status de rascunho (que é o sendo escrito). */
export const metaDoNovo = (titulo: string, redator: string): Meta => ({ ...metaVazia(), titulo, redator, status: 'rascunho' });

/** O título para mostrar: o dado, ou "Sem título". */
export const tituloParaMostrar = (meta: Pick<Meta, 'titulo' | 'claquete'> | undefined) => meta?.titulo?.trim() || meta?.claquete?.trim() || 'Sem título';
