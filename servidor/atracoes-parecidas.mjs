/* As atrações parecidas da correção de grafia (#116): as fichas de atração dos cadastros que parecem ser a mesma
   atração, juntas num grupo com o motivo (a regra pura atracoesParecidas) e, em cada ficha, quantas artes do acervo,
   Produções e regras ela tem, para o administrador escolher a que fica (juntar é o #117, juntar-atracoes.mjs). "Não são a mesma" fica
   guardado aqui, no SQLite do PROMeiro (e por isso no backup), par a par: o grupo não aparece de novo, a não ser que
   chegue uma ficha nova parecida. O SQL é o comum ao SQLite e ao Postgres (texto, PRIMARY KEY composta e
   INSERT … ON CONFLICT … DO NOTHING). */
import { atracoesParecidas, parDeFichas } from '../src/modelo/correcaoDeGrafia.ts';

/** Quantos grupos por página. */
export const GRUPOS_POR_PAGINA = 20;
/** O id de uma ficha de atração no Teable. */
const REC = /^rec\w{1,40}$/;
/** Um grupo tem pelo menos duas fichas; mais de 50 não é pedido de verdade. */
const MAX_DO_GRUPO = 50;

/** @param db o SQLite do PROMeiro (a tabela `atracoes_nao_sao_a_mesma` é criada aqui) */
export function criarAtracoesParecidas({ db }) {
  // o par vai sempre na mesma ordem (ficha_a < ficha_b); os nomes são os de quando foi marcado, só para ler a tabela
  db.exec(`CREATE TABLE IF NOT EXISTS atracoes_nao_sao_a_mesma (
    ficha_a TEXT NOT NULL,
    ficha_b TEXT NOT NULL,
    nome_a TEXT NOT NULL DEFAULT '',
    nome_b TEXT NOT NULL DEFAULT '',
    por TEXT,
    em TEXT NOT NULL,
    PRIMARY KEY (ficha_a, ficha_b)
  )`);
  const q = {
    todos: db.prepare('SELECT ficha_a, ficha_b FROM atracoes_nao_sao_a_mesma'),
    marcar: db.prepare('INSERT INTO atracoes_nao_sao_a_mesma (ficha_a, ficha_b, nome_a, nome_b, por, em) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (ficha_a, ficha_b) DO NOTHING'),
  };
  const diferentes = () => new Set(q.todos.all().map((l) => parDeFichas(l.ficha_a, l.ficha_b)));
  const ids = (g) => g.fichas.map((f) => f.id).sort();

  /**
   * Uma página dos grupos de fichas parecidas, sem os pares marcados como "não são a mesma".
   * @param fichas [{ id, nome, categoria }] as atrações dos cadastros
   * @param contas { artes: { [id da ficha]: n } | null (sem o acervo ligado), producoes: { [nome]: n }, regras: { [nome]: n } }
   * @param pagina a partir de 1
   */
  function grupos(fichas, contas, pagina = 1) {
    const comContas = fichas.map((f) => ({
      id: f.id,
      nome: f.nome,
      categoria: f.categoria ?? '',
      artes: contas.artes ? (contas.artes[f.id] ?? 0) : null,
      producoes: contas.producoes[f.nome] ?? 0,
      regras: contas.regras[f.nome] ?? 0,
    }));
    const todos = atracoesParecidas(comContas, diferentes());
    const inicio = (pagina - 1) * GRUPOS_POR_PAGINA;
    return { pagina, porPagina: GRUPOS_POR_PAGINA, total: todos.length, grupos: todos.slice(inicio, inicio + GRUPOS_POR_PAGINA).map((g) => ({ id: ids(g).join('+'), ...g })) };
  }

  /**
   * O grupo que a tela mostra agora com exatamente estas fichas (os pares de "não são a mesma" fora), ou null: o que
   * mudou desde que a tela leu não vale (para marcar e para juntar, #117).
   * @param fichas as atrações dos cadastros de agora; pedidas os ids das fichas do grupo
   */
  function grupoAtual(fichas, pedidas) {
    const alvo = [...new Set(pedidas)].sort().join('+');
    return atracoesParecidas(fichas, diferentes()).find((g) => ids(g).join('+') === alvo) ?? null;
  }

  /**
   * "Não são a mesma": guarda cada par do grupo, e ele não volta. Só vale um grupo que a tela mostra agora (as mesmas
   * fichas): o que mudou desde então devolve null.
   * @param fichas as atrações dos cadastros de agora; pedidas os ids das fichas do grupo
   * @returns o grupo marcado, ou null
   */
  function naoSaoAMesma(fichas, pedidas, por, em = new Date().toISOString()) {
    const grupo = grupoAtual(fichas, pedidas);
    if (!grupo) return null;
    db.exec('BEGIN');
    try {
      const fs = grupo.fichas;
      for (let i = 0; i < fs.length; i++)
        for (let j = i + 1; j < fs.length; j++) {
          const [a, b] = fs[i].id < fs[j].id ? [fs[i], fs[j]] : [fs[j], fs[i]];
          q.marcar.run(a.id, b.id, a.nome, b.nome, por, em);
        }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return grupo;
  }

  return { grupos, grupoAtual, naoSaoAMesma };
}

/** Os ids do pedido de "não são a mesma": de 2 a 50 ids de ficha, ou null. */
export function idsDoGrupo(v) {
  if (!Array.isArray(v) || v.length < 2 || v.length > MAX_DO_GRUPO) return null;
  return v.every((x) => typeof x === 'string' && REC.test(x)) ? v : null;
}
