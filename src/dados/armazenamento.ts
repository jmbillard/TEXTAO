import { chaveDaClaquete, naPauta, registrarVocabulario, type VocabularioExterno } from '../modelo/vocabularios';
import { exportar } from '../modelo/exportar';
import type { Meta, NoJSON, Pessoa, Roteiro } from '../modelo/tipos';

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
    throw Object.assign(new Error(erro?.erro ?? 'O servidor não respondeu.'), { status: r.status });
  }
  return (await r.json()) as T;
}

const noServidor: Armazenamento = {
  tipo: 'servidor',
  listar: () => pedir<Resumo[]>('/api/roteiros'),
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

/** Cria o card no Trello. As artes e o texto saem daqui, do mesmo jeito que o app mostra. */
export async function mandarParaTrello(roteiro: Roteiro, deNovo = false) {
  const saida = exportar(roteiro);
  return pedir<{ estado: EnvioTrello['estado']; url?: string; avisos?: string[]; erro?: string }>(`/api/roteiros/${encodeURIComponent(roteiro.id)}/trello`, {
    method: 'POST',
    body: JSON.stringify({ artes: saida.artes.map((a) => ({ texto: a.texto, tipo: a.subtipo ? a.subtipoNome : '' })), texto: saida.texto.completo, deNovo }),
  });
}

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
