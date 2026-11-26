/*
 * O registro da aba Duplicadas (#66), no SQLite do PROMeiro: quem ignorou, reabriu, apagou (#67) (e, no #68, recriou)
 * o quê e quando, com o motivo. Uma linha por ação, sem apagar nenhuma: o Registro da tela lê daqui, e o caso
 * ignorado de agora sai da última ação de ignorar ou reabrir de cada caso.
 *
 * Ignorar guarda a assinatura do grupo (os ids dos cards): o caso continua ignorado enquanto não entrar card novo no
 * grupo. Nada disto escreve no Trello nem no Teable.
 *
 * Apagar (#67) guarda a cópia do card antes de tudo (em `copia`, JSON: a linha da produção da arte inteira e o que o
 * PROMeiro tem do card), com o estado 'em-curso'; no fim, 'feito' (o card saiu do Trello) ou 'falhou' (nada foi
 * apagado; a cópia diz o que foi desfeito e o que não deu). O card apagado ('feito') não volta à lista, mesmo antes de
 * o n8n tirar a linha da produção. O SQL é o comum ao SQLite e ao Postgres, e a tabela entra no backup do banco.
 */

/** As ações do registro: ignorar, reabrir e apagar; recriar fica pronta para o #68. */
export const ACOES = ['ignorar', 'reabrir', 'apagar', 'recriar'];
export const MOTIVO_MAXIMO = 200;
/** O estado de apagar: a cópia guardada e o resto em curso, o card apagado, ou parou antes de apagar. */
export const ESTADOS = ['em-curso', 'feito', 'falhou'];

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
  // o estado de apagar (#67), na tabela que já existia (a consulta vazia diz se a coluna existe, sem nada que só o
  // SQLite tenha); as outras ações ficam sem estado
  try {
    db.prepare('SELECT estado FROM duplicadas_registro LIMIT 0').all();
  } catch {
    db.exec('ALTER TABLE duplicadas_registro ADD COLUMN estado TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS duplicadas_registro_card ON duplicadas_registro (card, acao)');
}

/** O que o Registro mostra de um apagar, tirado da cópia: o código do card, quantas artes e roteiros foram para o card
    que fica e, no que falhou, o erro e o que não foi desfeito. */
function resumoDaCopia(copia) {
  if (!copia) return null;
  let c;
  try {
    c = JSON.parse(copia);
  } catch {
    return null;
  }
  return {
    codigo: String(c?.codigo ?? ''),
    religadas: c?.feito?.religadas?.length ?? 0,
    roteiros: c?.feito?.roteiros?.length ?? 0,
    erro: c?.erro ? String(c.erro) : '',
    naoDesfeito: Array.isArray(c?.naoDesfeito) ? c.naoDesfeito.map(String) : [],
  };
}

/**
 * @returns anotar (uma ação), ignorados (o caso → a ação de ignorar que vale agora), estaIgnorado (pela assinatura)
 *   e lista (as últimas ações, do mais novo ao mais antigo)
 */
export function criarRegistroDasDuplicadas(db) {
  criarTabelaDoRegistroDasDuplicadas(db);
  const q = {
    anotar: db.prepare(
      `INSERT INTO duplicadas_registro (acao, caso, claquete, praca, cards, card, fica, por_email, por_nome, em, motivo, copia, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    // a última ação de ignorar ou reabrir de cada caso
    vigentes: db.prepare(
      `SELECT * FROM duplicadas_registro r WHERE id = (
         SELECT MAX(id) FROM duplicadas_registro x WHERE x.caso = r.caso AND x.acao IN ('ignorar', 'reabrir'))`,
    ),
    ultimas: db.prepare('SELECT * FROM duplicadas_registro ORDER BY id DESC LIMIT ?'),
    concluir: db.prepare('UPDATE duplicadas_registro SET estado = ?, copia = ? WHERE id = ?'),
    // os cards apagados de verdade: não voltam à lista (o em curso que ficou para trás, numa queda do servidor, não
    // esconde o card)
    apagados: db.prepare("SELECT card FROM duplicadas_registro WHERE acao = 'apagar' AND estado = 'feito' AND card IS NOT NULL"),
    copia: db.prepare('SELECT copia FROM duplicadas_registro WHERE id = ?'),
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
    ...(l.acao === 'apagar' ? { estado: l.estado ?? 'feito', apagado: resumoDaCopia(l.copia) } : {}),
  });

  /** @param a { acao, caso, claquete, praca, cards, card?, fica?, por: { email, nome }, motivo?, copia?, estado? } */
  function anotar(a) {
    if (!ACOES.includes(a.acao)) throw new Error(`Ação desconhecida no registro: ${a.acao}`);
    if (a.estado != null && !ESTADOS.includes(a.estado)) throw new Error(`Estado desconhecido no registro: ${a.estado}`);
    const em = new Date().toISOString();
    const motivo = String(a.motivo ?? '').trim().slice(0, MOTIVO_MAXIMO);
    const r = q.anotar.run(a.acao, a.caso, a.claquete, a.praca, JSON.stringify(a.cards), a.card ?? null, a.fica ?? null, a.por.email, a.por.nome, em, motivo, a.copia == null ? null : JSON.stringify(a.copia), a.estado ?? null);
    return { id: Number(r.lastInsertRowid), em, motivo };
  }

  /** Fecha o apagar (#67): 'feito' ou 'falhou', com a cópia completada (o que foi feito, desfeito e o erro). */
  function concluir(id, estado, copia) {
    if (!ESTADOS.includes(estado)) throw new Error(`Estado desconhecido no registro: ${estado}`);
    q.concluir.run(estado, JSON.stringify(copia), id);
  }

  /** Os cards apagados pelo PROMeiro. */
  const apagados = () => new Set(q.apagados.all().map((l) => String(l.card)));

  /** A cópia guardada de uma ação (o card apagado, para o #68 recriar), ou null. */
  function copiaDe(id) {
    const l = q.copia.get(id);
    return l?.copia ? JSON.parse(l.copia) : null;
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

  return { anotar, concluir, apagados, copiaDe, ignorados, continuaIgnorado, lista };
}
