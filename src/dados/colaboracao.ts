import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import * as dec from 'lib0/decoding';
import { parametrosDoPerfil } from './armazenamento';

/* Edição simultânea. Cada roteiro tem um documento compartilhado (Yjs) com duas partes:
   "doc" (o texto, ligado ao editor) e "meta" (os campos do cabeçalho).
   O servidor repassa as alterações entre quem está no roteiro e guarda o resultado. */

export interface Sala {
  doc: Y.Doc;
  provedor: WebsocketProvider;
  meta: Y.Map<unknown>;
  /** Os comentários ao vivo do Roteiro escrito no PROMeiro (#192), num mapa à parte da mesma sala (id → comentário).
      Quem só comenta não escreve pela sala: o comentário entra por uma rota e o servidor o põe aqui (`app.naSala`). */
  comentarios: Y.Map<unknown>;
  /** Avisa quando a sala gravou (só na sala do Roteiro escrito, #191); devolve a função que para de avisar. */
  aoGravar: (avisar: () => void) => () => void;
  /** Há o que esta aba mudou e a sala ainda não gravou. */
  pendente: () => boolean;
}

/** A mensagem da sala do Roteiro escrito (#191): gravou, com o vetor de estado do que gravou (servidor/app.mjs). */
const MSG_GRAVADO = 4;

export function abrirSala(id: string): Sala {
  const doc = new Y.Doc();
  const base = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/colab`;
  const provedor = new WebsocketProvider(base, id, doc, { connect: false, params: parametrosDoPerfil() });
  let gravado = new Map<number, number>();
  const ouvintes = new Set<() => void>();
  provedor.messageHandlers[MSG_GRAVADO] = (_e, d) => {
    gravado = Y.decodeStateVector(dec.readVarUint8Array(d));
    ouvintes.forEach((f) => f());
  };
  const meu = () => Y.decodeStateVector(Y.encodeStateVector(doc)).get(doc.clientID) ?? 0;
  return {
    doc,
    provedor,
    meta: doc.getMap('meta'),
    comentarios: doc.getMap('comentarios'),
    aoGravar: (avisar) => {
      ouvintes.add(avisar);
      return () => void ouvintes.delete(avisar);
    },
    pendente: () => meu() > (gravado.get(doc.clientID) ?? 0),
  };
}

/** A sala ainda não recebeu nada: nem texto, nem metadados (ninguém a preencheu). */
export const salaVazia = (sala: Sala) => sala.doc.getXmlFragment('doc').length === 0 && sala.meta.size === 0;

/** Cores de destaque que leem bem como texto e como grifo, nos dois temas. Nenhuma é o laranja do app. */
export const PALETA: { cor: string; nome: string }[] = [
  { cor: '#3a35e0', nome: 'Anil' },
  { cor: '#1f6fbf', nome: 'Azul' },
  { cor: '#0f6b63', nome: 'Petróleo' },
  { cor: '#2e7d32', nome: 'Verde' },
  { cor: '#a16207', nome: 'Mostarda' },
  { cor: '#b0175a', nome: 'Magenta' },
  { cor: '#6d28d9', nome: 'Roxo' },
  { cor: '#9f1239', nome: 'Vinho' },
];
const CORES = PALETA.map((p) => p.cor);

/** Cores que as pessoas escolheram no perfil (vêm do servidor); quem não escolheu fica com a sorteada. */
const escolhidas = new Map<string, string>();
export function registrarCores(lista: { email: string; cor: string | null }[]) {
  for (const { email, cor } of lista) {
    const e = email.toLowerCase();
    if (cor) escolhidas.set(e, cor);
    else escolhidas.delete(e);
  }
}

/** A cor da pessoa: a que ela escolheu ou, sem escolha, sempre a mesma pelo e-mail, em qualquer computador. */
export function corDe(email: string): string {
  const escolhida = escolhidas.get(email.toLowerCase());
  if (escolhida) return escolhida;
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}
/** A cor sorteada, para mostrar como "padrão" no seletor. */
export function corSorteada(email: string): string {
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

/** O primeiro nome, para a rubrica à mão ("Ana tá vendo"). */
export const primeiroNome = (nome: string) => nome.split(/\s+/)[0];
/** As iniciais da bolinha de quem está junto: a do primeiro nome e a do último. */
export const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')
    .toUpperCase();
/** "Ana", "Ana e Bruno", "Ana e mais 2". */
export const nomesCurtos = (pessoas: { nome: string }[]) =>
  pessoas.length <= 2 ? pessoas.map((p) => primeiroNome(p.nome)).join(' e ') : `${primeiroNome(pessoas[0].nome)} e mais ${pessoas.length - 1}`;

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
