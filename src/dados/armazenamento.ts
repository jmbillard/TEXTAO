import type { Roteiro } from '../modelo/tipos';

/* Camada de persistência. Hoje é o IndexedDB do navegador; a interface existe
   para que D1/KV/R2 possam entrar depois sem tocar no resto do app. */

export interface Armazenamento {
  listar(): Promise<Roteiro[]>;
  ler(id: string): Promise<Roteiro | undefined>;
  salvar(roteiro: Roteiro): Promise<void>;
  apagar(id: string): Promise<void>;
}

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

export const armazenamento: Armazenamento = {
  async listar() {
    const todos = await operar<Roteiro[]>('readonly', (l) => l.getAll());
    return todos.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  },
  ler: (id) => operar<Roteiro | undefined>('readonly', (l) => l.get(id)),
  async salvar(roteiro) {
    await operar('readwrite', (l) => l.put(roteiro));
  },
  async apagar(id) {
    await operar('readwrite', (l) => l.delete(id));
  },
};
