/*
 * O registro da aba Duplicadas (#66), no SQLite do PROMeiro: quem ignorou, reabriu (e, nos próximos tickets, apagou ou
 * recriou) o quê e quando, com o motivo. Uma linha por ação, sem apagar nenhuma: o Registro da tela lê daqui, e o caso
 * ignorado de agora sai da última ação de ignorar ou reabrir de cada caso.
 *
 * Ignorar guarda a assinatura do grupo (os ids dos cards): o caso continua ignorado enquanto não entrar card novo no
 * grupo. Nada disto escreve no Trello nem no Teable.
 */

/** As ações do registro: ignorar e reabrir agora; apagar e recriar ficam prontas para o #67 e o #68. */
export const ACOES = ['ignorar', 'reabrir', 'apagar', 'recriar'];
export const MOTIVO_MAXIMO = 200;

export function criarTabelaDoRegistroDasDuplicadas(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS duplicadas_registro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acao TEXT NOT NULL CHECK (acao IN (${ACOES.map((a) => `'${a}'`).join(', ')})),
    caso TEXT NOT NULL, claquete TEXT NOT NULL, praca TEXT NOT NULL,
    cards TEXT NOT NULL, card TEXT, fica TEXT,
    por_email TEXT NOT NULL, por_nome TEXT NOT NULL, em TEXT NOT NULL,
    motivo TEXT NOT NULL DEFAULT '', copia TEXT
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS duplicadas_registro_caso ON duplicadas_registro (caso, id)');
}

/**
 * @returns anotar (uma ação), ignorados (o caso → a ação de ignorar que vale agora), estaIgnorado (pela assinatura)
 *   e lista (as últimas ações, do mais novo ao mais antigo)
 */
export function criarRegistroDasDuplicadas(db) {
  criarTabelaDoRegistroDasDuplicadas(db);
  const q = {
    anotar: db.prepare(
      `INSERT INTO duplicadas_registro (acao, caso, claquete, praca, cards, card, fica, por_email, por_nome, em, motivo, copia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    // a última ação de ignorar ou reabrir de cada caso
    vigentes: db.prepare(
      `SELECT * FROM duplicadas_registro r WHERE id = (
         SELECT MAX(id) FROM duplicadas_registro x WHERE x.caso = r.caso AND x.acao IN ('ignorar', 'reabrir'))`,
    ),
    ultimas: db.prepare('SELECT * FROM duplicadas_registro ORDER BY id DESC LIMIT ?'),
  };
  const ler = (l) => ({
    id: l.id,
    acao: l.acao,
    caso: l.caso,
    claquete: l.claquete,
    praca: l.praca,
    cards: JSON.parse(l.cards),
    card: l.card ?? null,
    fica: l.fica ?? null,
    por: l.por_nome,
    em: l.em,
    motivo: l.motivo,
  });

  /** @param a { acao, caso, claquete, praca, cards, card?, fica?, por: { email, nome }, motivo?, copia? } */
  function anotar(a) {
    if (!ACOES.includes(a.acao)) throw new Error(`Ação desconhecida no registro: ${a.acao}`);
    const em = new Date().toISOString();
    const motivo = String(a.motivo ?? '').trim().slice(0, MOTIVO_MAXIMO);
    const r = q.anotar.run(a.acao, a.caso, a.claquete, a.praca, JSON.stringify(a.cards), a.card ?? null, a.fica ?? null, a.por.email, a.por.nome, em, motivo, a.copia == null ? null : JSON.stringify(a.copia));
    return { id: Number(r.lastInsertRowid), em, motivo };
  }

  /** O caso → a ação de ignorar que vale agora (o caso reaberto não entra). */
  function ignorados() {
    return new Map(q.vigentes.all().filter((l) => l.acao === 'ignorar').map((l) => [l.caso, ler(l)]));
  }

  /** O caso continua ignorado? Só se a última ação dele é ignorar e nenhum card de agora ficou fora da assinatura. */
  const continuaIgnorado = (ignorado, cards) => !!ignorado && cards.every((id) => ignorado.cards.includes(id));

  /** As últimas ações (do mais novo ao mais antigo), com podeReabrir na ignorada que vale agora. */
  function lista(limite = 100) {
    const vale = new Set([...ignorados().values()].map((l) => l.id));
    return q.ultimas.all(limite).map((l) => ({ ...ler(l), podeReabrir: vale.has(l.id) }));
  }

  return { anotar, ignorados, continuaIgnorado, lista };
}
