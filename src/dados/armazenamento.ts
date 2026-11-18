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
  meu: boolean;
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
  lerVersao: async () => {
    throw new Error('Sem histórico neste modo.');
  },
};

/* ---------- servidor ---------- */

let cabecalhos: Record<string, string> = {};

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
};

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
  cabecalhos = perfil?.email ? { 'x-perfil-email': encodeURIComponent(perfil.email), 'x-perfil-nome': encodeURIComponent(perfil.nome) } : {};
  try {
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), 3000);
    const r = await fetch('/api/eu', { credentials: 'same-origin', headers: cabecalhos, signal: controle.signal });
    clearTimeout(prazo);
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('sem servidor');
    const d = (await r.json()) as { email: string | null; nome?: string; origem?: 'acesso' | 'local'; perfilLocal?: boolean };
    if (d.email) {
      armazenamento = noServidor;
      return { eu: { email: d.email, nome: d.nome ?? d.email, origem: d.origem ?? 'acesso' }, pedePerfil: false };
    }
    armazenamento = noNavegador;
    return { eu: null, pedePerfil: !!d.perfilLocal };
  } catch {
    armazenamento = noNavegador;
    return { eu: null, pedePerfil: false };
  }
}
