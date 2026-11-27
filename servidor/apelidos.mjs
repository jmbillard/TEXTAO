/* O apelido da claquete (#120): o nome que o PROMeiro mostra no lugar da claquete, só dentro dele, um por roteiro. O
   Trello e o Teable continuam com a claquete original (o envio lê o roteiro guardado, não esta tabela), que fica no
   roteiro, e o apelido nunca entra na chave dos cruzamentos. A tela mostra o apelido no roteiro e em todas as Produções
   dele (de todas as praças) e nos cards do envio. No SQLite do PROMeiro (e por isso no backup), com SQL portável (vale
   também no Postgres): sem json_extract, sem INSERT OR REPLACE. */

/** O apelido mais longo que o PROMeiro guarda. */
export const APELIDO_MAXIMO = 200;

/** @param db o SQLite do PROMeiro (a tabela `apelidos` é criada aqui; `roteiros`, `envios` e `producoes` já existem) */
export function criarApelidos(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS apelidos (
    roteiro_id TEXT PRIMARY KEY REFERENCES roteiros (id) ON DELETE CASCADE,
    apelido TEXT NOT NULL,
    por_email TEXT NOT NULL,
    por_nome TEXT NOT NULL,
    em TEXT NOT NULL
  )`);
  // as consultas que leem as Produções ficam para a primeira leitura: a tabela delas nasce depois desta
  let q = null;
  const consultas = () =>
    (q ??= {
      todos: db.prepare('SELECT a.roteiro_id, a.apelido, a.por_nome, a.em, r.meta FROM apelidos a JOIN roteiros r ON r.id = a.roteiro_id ORDER BY a.roteiro_id'),
      producoes: db.prepare('SELECT p.roteiro_id, p.id FROM producoes p JOIN apelidos a ON a.roteiro_id = p.roteiro_id ORDER BY p.id'),
      cards: db.prepare("SELECT e.roteiro_id, e.card_id FROM envios e JOIN apelidos a ON a.roteiro_id = e.roteiro_id WHERE e.card_id IS NOT NULL AND e.card_id <> ''"),
      gravar: db.prepare(
        `INSERT INTO apelidos (roteiro_id, apelido, por_email, por_nome, em) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (roteiro_id) DO UPDATE SET apelido = excluded.apelido, por_email = excluded.por_email, por_nome = excluded.por_nome, em = excluded.em`,
      ),
      tirar: db.prepare('DELETE FROM apelidos WHERE roteiro_id = ?'),
      soOsApelidos: db.prepare('SELECT roteiro_id, apelido FROM apelidos'),
      // a Produção com o roteiro dela (#121): as versões lidas dele e o apelido
      roteiroDaProducao: db.prepare('SELECT r.versoes_lidas, a.apelido FROM producoes p LEFT JOIN roteiros r ON r.id = p.roteiro_id LEFT JOIN apelidos a ON a.roteiro_id = p.roteiro_id WHERE p.id = ?'),
    });
  const claqueteDe = (meta) => {
    try {
      return String(JSON.parse(meta)?.claquete ?? '');
    } catch {
      return '';
    }
  };
  const porRoteiro = (linhas, coluna) => {
    const m = new Map();
    for (const l of linhas) m.set(l.roteiro_id, [...(m.get(l.roteiro_id) ?? []), l[coluna]]);
    return m;
  };
  return {
    /**
     * Os apelidos guardados, como a rota devolve: { roteiro, original, apelido, por, em, producoes, cards }, com a
     * claquete original do roteiro, as Produções dele e os cards do envio.
     * @param podeLer (id) => a pessoa lê o roteiro: o apelido do roteiro que ela não vê fica de fora
     */
    todos(podeLer = () => true) {
      const c = consultas();
      const producoes = porRoteiro(c.producoes.all(), 'id');
      const cards = porRoteiro(c.cards.all(), 'card_id');
      return c.todos
        .all()
        .filter((l) => podeLer(l.roteiro_id))
        .map((l) => ({ roteiro: l.roteiro_id, original: claqueteDe(l.meta), apelido: l.apelido, por: l.por_nome, em: l.em, producoes: producoes.get(l.roteiro_id) ?? [], cards: cards.get(l.roteiro_id) ?? [] }));
    },
    /** Os apelidos por roteiro (id → apelido), sem mais nada: as versões do card da agenda (#121). */
    porRoteiro() {
      return new Map(consultas().soOsApelidos.all().map((l) => [l.roteiro_id, l.apelido]));
    },
    /** O roteiro da Produção (#121): as versões lidas dele (vazia sem roteiro) e o apelido ('' sem apelido). */
    roteiroDaProducao(id) {
      const l = consultas().roteiroDaProducao.get(id);
      return { lidas: l?.versoes_lidas ? JSON.parse(l.versoes_lidas) : [], apelido: l?.apelido ?? '' };
    },
    /**
     * Dá (ou troca) o apelido do roteiro; o apelido vazio, ou igual à claquete original, volta ao original (tira).
     * @param original a claquete guardada no roteiro
     * @returns a recusa, ou '' quando gravou
     */
    gravar(roteiro, original, apelido, eu) {
      const novo = String(apelido ?? '').trim();
      if (novo.length > APELIDO_MAXIMO) return `O apelido tem mais de ${APELIDO_MAXIMO} caracteres.`;
      if (!novo || novo === String(original ?? '').trim()) consultas().tirar.run(roteiro);
      else consultas().gravar.run(roteiro, novo, eu.email, eu.nome, new Date().toISOString());
      return '';
    },
  };
}
