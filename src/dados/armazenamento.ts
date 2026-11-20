import { chaveDaClaquete, naPauta, registrarVocabulario, type VocabularioExterno } from '../modelo/vocabularios';
import { artesForaDoChecklist, exportar } from '../modelo/exportar';
import { registrarCores } from './colaboracao';
import type { ArteDoAcervo, Meta, NaProducao, NoJSON, Pessoa, ProducaoCompleta, Roteiro } from '../modelo/tipos';
import { chaveDeArte } from '../modelo/diferencas';

/* Camada de persistência. Duas implementações com a mesma interface:
   - servidor (SQLite, com dono, público/privado e histórico), quando a API responde;
   - navegador (IndexedDB), quando o app roda como site estático. */

export interface Resumo {
  id: string;
  meta: Meta;
  nArtes: number;
  atualizadoEm: string;
  dono: Pessoa | null;
  publico: boolean;
  podeEditar?: boolean;
  /** Servidor em modo aberto: todos veem e editam tudo. */
  aberto?: boolean;
  /** Quem mexeu por último depois que o roteiro chegou. */
  revisadoPor?: Pessoa | null;
  /** Compartilhado com pessoas específicas. */
  compartilhado?: boolean;
  meu: boolean;
  /** O que aconteceu ao mandar para o Trello. */
  trello?: EnvioTrello;
  /** O arquivo que subiu está guardado no servidor (vira o PDF do card). */
  temOriginal?: boolean;
}
export interface EnvioTrello {
  /** "duplicado": a claquete já tinha entrado hoje na produção da arte (pelo upload antigo). */
  estado: 'enviando' | 'enviado' | 'duplicado' | 'erro';
  url?: string;
  erro?: string;
  em: string;
  por?: string;
}
export interface Versao {
  n: number;
  criadoEm: string;
  por: Pessoa | null;
  motivo: string;
}
export interface ConteudoVersao {
  n: number;
  criadoEm: string;
  meta: Meta;
  doc: NoJSON;
}

export interface Armazenamento {
  /** "servidor" guarda por conta, com histórico; "navegador" guarda só neste computador. */
  tipo: 'servidor' | 'navegador';
  listar(): Promise<Resumo[]>;
  ler(id: string): Promise<Roteiro | undefined>;
  /** `marco` registra uma versão no histórico (ex.: "exportou"). */
  salvar(roteiro: Roteiro, marco?: string): Promise<void>;
  apagar(id: string): Promise<void>;
  versoes(id: string): Promise<Versao[]>;
  lerVersao(id: string, n: number): Promise<ConteudoVersao>;
  /** As outras pessoas que já usaram a plataforma. */
  usuarios(): Promise<Pessoa[]>;
  /** Como anda na produção da arte o que já está no Trello, por roteiro (lido do Teable). */
  andamento(): Promise<Record<string, Andamento>>;
}

export interface Andamento {
  /** FINALIZADO, EM APROVAÇÃO, PRODUZINDO, AGUARDANDO MATERIAL, PEDIDO DE ALTERAÇÃO, CAIU, FILME */
  status: string[];
  designers: string[];
  entregue: boolean;
  entrega: string | null;
}

/* ---------- navegador ---------- */

const BANCO = 'roteirista';
const LOJA = 'roteiros';

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA, { keyPath: 'id' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}
async function operar<T>(modo: IDBTransactionMode, acao: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((ok, erro) => {
      const req = acao(db.transaction(LOJA, modo).objectStore(LOJA));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => erro(req.error);
    });
  } finally {
    db.close();
  }
}

const noNavegador: Armazenamento = {
  tipo: 'navegador',
  async listar() {
    const todos = await operar<Roteiro[]>('readonly', (l) => l.getAll());
    return todos
      .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
      .map((r) => ({ id: r.id, meta: r.meta, nArtes: exportar(r).artes.length, atualizadoEm: r.atualizadoEm, dono: r.criadoPor ?? null, publico: false, meu: true }));
  },
  ler: (id) => operar<Roteiro | undefined>('readonly', (l) => l.get(id)),
  async salvar(roteiro) {
    await operar('readwrite', (l) => l.put(roteiro));
  },
  async apagar(id) {
    await operar('readwrite', (l) => l.delete(id));
  },
  versoes: async () => [],
  usuarios: async () => [],
  andamento: async () => ({}),
  lerVersao: async () => {
    throw new Error('Sem histórico neste modo.');
  },
};

/* ---------- servidor ---------- */

let cabecalhos: Record<string, string> = {};
let perfilLocal: Pessoa | null = null;

/** O WebSocket do navegador não envia cabeçalhos; no modo de demonstração o perfil vai na URL. */
export const parametrosDoPerfil = (): Record<string, string> => (perfilLocal?.email ? { email: perfilLocal.email, nome: perfilLocal.nome } : {});

async function pedir<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(caminho, { ...init, credentials: 'same-origin', headers: { 'content-type': 'application/json', ...cabecalhos, ...init.headers } });
  if (!r.ok) {
    const erro = (await r.json().catch(() => null)) as { erro?: string } | null;
    throw Object.assign(new Error(erro?.erro ?? `O servidor não respondeu (${r.status}${r.status === 524 ? ', demorou demais' : ''}).`), { status: r.status });
  }
  return (await r.json()) as T;
}

const noServidor: Armazenamento = {
  tipo: 'servidor',
  listar: () => pedir<Resumo[]>('/api/roteiros'),
  andamento: () => pedir<Record<string, Andamento>>('/api/andamento').catch(() => ({})),
  ler: (id) => pedir<Roteiro>(`/api/roteiros/${encodeURIComponent(id)}`).catch((e: { status?: number }) => (e.status === 404 ? undefined : Promise.reject(e))),
  async salvar(roteiro, marco) {
    await pedir(`/api/roteiros/${encodeURIComponent(roteiro.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ roteiro, nArtes: exportar(roteiro).artes.length, marco }),
    });
  },
  async apagar(id) {
    await pedir(`/api/roteiros/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  versoes: (id) => pedir<Versao[]>(`/api/roteiros/${encodeURIComponent(id)}/versoes`),
  lerVersao: (id, n) => pedir<ConteudoVersao>(`/api/roteiros/${encodeURIComponent(id)}/versoes/${n}`),
  usuarios: () => pedir<Pessoa[]>('/api/usuarios'),
};

/** Nomes da casa e pauta da edição, quando o servidor está ligado ao Teable. A pauta muda ao longo do dia. */
export async function atualizarVocabulario() {
  if (armazenamento.tipo !== 'servidor') return;
  const v = await pedir<VocabularioExterno>('/api/vocabulario').catch(() => undefined);
  if (v) registrarVocabulario(v);
}

/** Quem está com a claquete na pauta da edição. Pergunta ao servidor; sem resposta, usa a pauta que já veio no vocabulário. */
export async function consultarPauta(claquete: string): Promise<{ editor: string; claquete: string }> {
  if (armazenamento.tipo === 'servidor') {
    const r = await pedir<{ editor: string; claquete: string }>(`/api/pauta?chave=${encodeURIComponent(chaveDaClaquete(claquete))}`).catch(() => null);
    if (r) return r;
  }
  return naPauta(claquete);
}

/* ---------- Trello ---------- */

let trelloLigado = false;
/** O servidor sabe mandar para o Trello (TRELLO_KEY, TRELLO_TOKEN e TRELLO_LISTA configurados). */
export const temTrello = () => armazenamento.tipo === 'servidor' && trelloLigado;

/** Guarda o arquivo como veio: é ele que vira o PDF anexado ao card. */
export async function guardarOriginal(id: string, arquivo: File) {
  if (armazenamento.tipo !== 'servidor') return;
  const r = await fetch(`/api/roteiros/${encodeURIComponent(id)}/original`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { ...cabecalhos, 'content-type': arquivo.type || 'application/octet-stream', 'x-arquivo': encodeURIComponent(arquivo.name) },
    body: arquivo,
  });
  if (!r.ok) throw new Error('Não consegui guardar o arquivo original.');
}

/* ---------- cadastros (atrações, redatores, editores) ---------- */

export interface KeyCadastro {
  id: string;
  key: string;
}
export interface AtracaoCadastro {
  id: string;
  nome: string;
  categoria: string;
  keys: KeyCadastro[];
  caminhos: Record<string, string>;
  campos: Record<string, string>;
}
export interface RedatorCadastro {
  id: string;
  nome: string;
  user: string;
  trello: boolean;
}
export interface EditorCadastro {
  id: string;
  nome: string;
  keys: KeyCadastro[];
  trello: boolean;
}
export interface CampoCaminho {
  nome: string;
  tipo: string;
  opcoes: string[] | null;
}
export interface Cadastros {
  ligado: boolean;
  atracoes: AtracaoCadastro[];
  redatores: RedatorCadastro[];
  editores: EditorCadastro[];
  categorias: string[];
  camposCaminho: CampoCaminho[];
  formulas: Record<string, string>;
  podeApagar: boolean;
}
export type TipoCadastro = 'atracoes' | 'redatores' | 'editores';

/** Minha cor de destaque, para os colegas ('' volta para a sorteada). */
export async function escolherMinhaCor(email: string, cor: string) {
  registrarCores([{ email, cor }]);
  if (armazenamento.tipo === 'servidor') await pedir('/api/eu/cor', { method: 'PUT', body: JSON.stringify({ cor }) });
}

/** Há servidor para guardar os cadastros (o Teable em si é conferido na tela). */
export const temCadastros = () => armazenamento.tipo === 'servidor';

export const lerCadastros = (renovar = false) => pedir<Cadastros>(`/api/cadastros${renovar ? '?renovar=1' : ''}`);
export const cadastrar = <T = { id: string; nome: string }>(tipo: TipoCadastro, dados: object) =>
  pedir<T>(`/api/cadastros/${tipo}`, { method: 'POST', body: JSON.stringify(dados) });
export const darKey = (tipo: 'atracoes' | 'editores', id: string, key: string) =>
  pedir<KeyCadastro>(`/api/cadastros/${tipo}/${encodeURIComponent(id)}/keys`, { method: 'POST', body: JSON.stringify({ key }) });
export const removerCadastro = (tipo: TipoCadastro, id: string, keyId?: string) =>
  pedir<{ ok: true }>(`/api/cadastros/${tipo}/${encodeURIComponent(id)}${keyId ? `/keys/${encodeURIComponent(keyId)}` : ''}`, { method: 'DELETE' });

/** O arquivo como subiu, para baixar de novo. */
export async function baixarOriginal(id: string): Promise<Blob> {
  const r = await fetch(`/api/roteiros/${encodeURIComponent(id)}/original`, { credentials: 'same-origin', headers: cabecalhos });
  if (!r.ok) throw new Error(r.status === 404 ? 'O arquivo original deste roteiro não foi guardado.' : 'Não consegui baixar o original.');
  return r.blob();
}

/** As artes que a atração já tem prontas (acervo do Teable). Sem servidor ou sem acervo: lista vazia. */
export async function consultarAcervo(atracao: string): Promise<{ ligado: boolean; podeZerar?: boolean; artes: ArteDoAcervo[] }> {
  if (armazenamento.tipo !== 'servidor' || !atracao.trim()) return { ligado: false, artes: [] };
  return pedir<{ ligado: boolean; podeZerar?: boolean; artes: ArteDoAcervo[] }>(`/api/acervo?atracao=${encodeURIComponent(atracao)}`).catch(() => ({ ligado: false, artes: [] }));
}

/** Pacote gráfico novo: as artes da atração deixam de valer. */
export const zerarAcervo = (atracao: string) => pedir<{ zeradas: number }>('/api/acervo/zerar', { method: 'POST', body: JSON.stringify({ atracao }) });

/** O PDF anexado ao card que já está na produção da arte (null se o card não tiver). */
export async function pdfDaProducao(claquete: string): Promise<ArrayBuffer | null> {
  const r = await fetch(`/api/producao/pdf?claquete=${encodeURIComponent(claquete)}`, { credentials: 'same-origin', headers: cabecalhos });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Não consegui baixar o PDF do card.');
  return r.arrayBuffer();
}

/** O roteiro em PDF, como vai para o card. */
export async function pdfDoRoteiro(roteiro: Roteiro): Promise<ArrayBuffer> {
  const artes = exportar(roteiro).artes.map((a) => ({ texto: a.texto, tipo: a.subtipo ? a.subtipoNome : '' }));
  const r = await fetch(`/api/roteiros/${encodeURIComponent(roteiro.id)}/pdf`, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...cabecalhos }, body: JSON.stringify({ artes }),
  });
  if (!r.ok) throw new Error('Não consegui montar o PDF do roteiro.');
  return r.arrayBuffer();
}

/** Versão nova que substitui outra: herda o card do Trello que a anterior já tinha. */
export async function herdarEnvio(novo: string, anterior: string) {
  if (armazenamento.tipo !== 'servidor') return;
  await pedir(`/api/roteiros/${encodeURIComponent(novo)}/trello`, { method: 'POST', body: JSON.stringify({ herdarDe: anterior }) });
}

/** Cria o card no Trello. As artes e o texto saem daqui, do mesmo jeito que o app mostra. */
export async function mandarParaTrello(roteiro: Roteiro, deNovo = false) {
  const saida = exportar(roteiro);
  // as que já existem e quem revisou decidiu não produzir: ficam no PDF, fora do checklist
  const existem = new Set(artesForaDoChecklist(saida));
  return pedir<{ estado: EnvioTrello['estado']; url?: string; avisos?: string[]; erro?: string }>(`/api/roteiros/${encodeURIComponent(roteiro.id)}/trello`, {
    method: 'POST',
    body: JSON.stringify({ artes: saida.artes.map((a) => ({ texto: a.texto, tipo: a.subtipo ? a.subtipoNome : '', existe: existem.has(chaveDeArte(a.texto)) })), texto: saida.texto.completo, deNovo }),
  });
}

/** A claquete já está na produção da arte (Teable)? Só com servidor; sem resposta, segue como novo. */
export async function consultarProducao(claquete: string): Promise<ProducaoCompleta | null> {
  if (armazenamento.tipo !== 'servidor' || !claquete.trim()) return null;
  return pedir<ProducaoCompleta | null>(`/api/producao?claquete=${encodeURIComponent(claquete)}`).catch(() => null);
}

/** Só o resumo fica no roteiro; o texto e as artes de lá se buscam na hora de comparar. */
export const resumoDaProducao = ({ card, url, registro, claquete, entrada, status, artes }: ProducaoCompleta): NaProducao => ({ card, url, registro, claquete, entrada, status, artes });

/** "É o mesmo roteiro que já está na produção": liga ao card que já existe, sem mandar nada. */
export const ligarAoCardExistente = (id: string, card: string) =>
  pedir<{ estado: EnvioTrello['estado']; url?: string }>(`/api/roteiros/${encodeURIComponent(id)}/trello`, { method: 'POST', body: JSON.stringify({ jaEsta: { card } }) });

/** O armazenamento em uso. Começa no navegador e passa para o servidor quando `conectar` o encontra. */
export let armazenamento: Armazenamento = noNavegador;

export interface Conexao {
  /** Quem o servidor reconheceu, se houver servidor e login. */
  eu: (Pessoa & { origem: 'acesso' | 'local' }) | null;
  /** Há servidor, mas ele espera que a pessoa se apresente com o perfil local. */
  pedePerfil: boolean;
}

/** Procura o servidor. `perfil` é o perfil local, usado só quando o servidor aceita esse modo (demonstração). */
export async function conectar(perfil: Pessoa | null): Promise<Conexao> {
  perfilLocal = perfil;
  cabecalhos = perfil?.email ? { 'x-perfil-email': encodeURIComponent(perfil.email), 'x-perfil-nome': encodeURIComponent(perfil.nome) } : {};
  try {
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), 3000);
    const r = await fetch('/api/eu', { credentials: 'same-origin', headers: cabecalhos, signal: controle.signal });
    clearTimeout(prazo);
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('sem servidor');
    const d = (await r.json()) as { email: string | null; nome?: string; origem?: 'acesso' | 'local'; perfilLocal?: boolean; trello?: boolean };
    if (d.email) {
      armazenamento = noServidor;
      trelloLigado = !!d.trello;
      // as cores que cada um escolheu, para a orelha, o grifo e os cursores saírem certos
      await pedir<{ email: string; cor: string }[]>('/api/cores').then(registrarCores, () => {});
      // nomes da casa (atrações e redatores), quando o servidor está ligado ao Teable
      await atualizarVocabulario();
      return { eu: { email: d.email, nome: d.nome ?? d.email, origem: d.origem ?? 'acesso' }, pedePerfil: false };
    }
    armazenamento = noNavegador;
    return { eu: null, pedePerfil: !!d.perfilLocal };
  } catch {
    armazenamento = noNavegador;
    return { eu: null, pedePerfil: false };
  }
}
