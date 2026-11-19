import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { parametrosDoPerfil } from './armazenamento';

/* Edição simultânea. Cada roteiro tem um documento compartilhado (Yjs) com duas partes:
   "doc" (o texto, ligado ao editor) e "meta" (os campos do cabeçalho).
   O servidor repassa as alterações entre quem está no roteiro e guarda o resultado. */

export interface Sala {
  doc: Y.Doc;
  provedor: WebsocketProvider;
  meta: Y.Map<unknown>;
}

export function abrirSala(id: string): Sala {
  const doc = new Y.Doc();
  const base = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/colab`;
  const provedor = new WebsocketProvider(base, id, doc, { connect: false, params: parametrosDoPerfil() });
  return { doc, provedor, meta: doc.getMap('meta') };
}

const CORES = ['#3a35e0', '#b4400b', '#0f6b63', '#b0175a', '#7a5a12', '#5b3fb5', '#1f6fbf', '#8a3a62'];

/** A mesma pessoa tem sempre a mesma cor, em qualquer computador. */
export function corDe(email: string): string {
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

export interface Presente {
  nome: string;
  email: string;
  cor: string;
}

/** Ponteiros do mouse de quem mais está no roteiro. */
export function ponteirosDaSala(sala: Sala, euEmail: string): { email: string; nome: string; cor: string; cursor?: string; p: { ancora: string; fx: number; fy: number; pos?: number; dx?: number; dy?: number } }[] {
  const vistos = new Map<string, ReturnType<typeof ponteirosDaSala>[number]>();
  sala.provedor.awareness.getStates().forEach((estado, cliente) => {
    const { user: u, ponteiro: p } = estado as { user?: { name?: string; email?: string; color?: string }; ponteiro?: { ancora?: string; fx?: number; fy?: number; cursor?: string } | null };
    if (!u?.email || !p?.ancora || u.email === euEmail || cliente === sala.doc.clientID) return;
    vistos.set(u.email, { email: u.email, nome: u.name ?? u.email, cor: u.color ?? '#5f5b53', cursor: p.cursor, p: p as { ancora: string; fx: number; fy: number } });
  });
  return [...vistos.values()];
}

/** Quem mais está com o roteiro aberto agora (sem repetir a pessoa que abriu em duas abas). */
export function presentes(sala: Sala, euEmail: string): Presente[] {
  const vistos = new Map<string, Presente>();
  sala.provedor.awareness.getStates().forEach((estado, cliente) => {
    const u = (estado as { user?: { name?: string; email?: string; color?: string } }).user;
    if (!u?.email || u.email === euEmail || cliente === sala.doc.clientID) return;
    vistos.set(u.email, { nome: u.name ?? u.email, email: u.email, cor: u.color ?? '#5f5b53' });
  });
  return [...vistos.values()];
}
