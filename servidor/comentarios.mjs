/* Os comentários do Roteiro escrito no PROMeiro (#192): os fios (o comentário preso ao trecho e as respostas), o
   resolver com desfazer e os avisos de cada pessoa (a bolinha em "Roteiros" e no roteiro), no SQLite. Os comentários
   ficam fora do documento: quem só comenta não escreve no texto, e a âncora por citação (src/modelo/comentarios.ts)
   acha o trecho sem mudar nada nele. Chegam ao vivo pelo aviso da fila (o app.mjs avisa). Nada sai do PROMeiro. */
import { randomUUID } from 'node:crypto';

/** As tabelas dos comentários e dos avisos (no abrirBanco, como as outras). */
export function criarTabelasDosComentarios(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comentarios (
      id TEXT PRIMARY KEY,
      roteiro_id TEXT NOT NULL REFERENCES roteiros (id) ON DELETE CASCADE,
      fio TEXT,
      autor_email TEXT NOT NULL,
      autor_nome TEXT NOT NULL,
      papel TEXT NOT NULL DEFAULT '',
      texto TEXT NOT NULL,
      ancora TEXT,
      criado_em TEXT NOT NULL,
      resolvido_em TEXT,
      resolvido_email TEXT,
      resolvido_nome TEXT
    );
    CREATE INDEX IF NOT EXISTS comentarios_roteiro ON comentarios (roteiro_id, criado_em);
    -- o aviso de cada pessoa: foi citada (mencao) ou comentaram no roteiro dela (no-seu); some quando ela vê
    CREATE TABLE IF NOT EXISTS avisos_de_comentario (
      email TEXT NOT NULL,
      comentario_id TEXT NOT NULL REFERENCES comentarios (id) ON DELETE CASCADE,
      roteiro_id TEXT NOT NULL REFERENCES roteiros (id) ON DELETE CASCADE,
      motivo TEXT NOT NULL,
      criado_em TEXT NOT NULL,
      visto_em TEXT,
      PRIMARY KEY (email, comentario_id)
    );
    CREATE INDEX IF NOT EXISTS avisos_de_comentario_email ON avisos_de_comentario (email, visto_em);
  `);
  // a revisão que volta como sugestão (#196): a sugestão é um comentário de outro tipo, com o texto sugerido, o lote
  // (a vez do cadeado aberto de quem sugeriu) e a decisão; o resolvido é quem decidiu e quando
  const tem = (coluna) => db.prepare('PRAGMA table_info(comentarios)').all().some((c) => c.name === coluna);
  if (!tem('sugerido')) db.exec('ALTER TABLE comentarios ADD COLUMN sugerido TEXT');
  if (!tem('lote')) db.exec('ALTER TABLE comentarios ADD COLUMN lote TEXT');
  if (!tem('decisao')) db.exec('ALTER TABLE comentarios ADD COLUMN decisao TEXT');
  if (!tem('de_copia')) db.exec('ALTER TABLE comentarios ADD COLUMN de_copia TEXT');
}

export function criarComentarios(db) {
  const q = {
    doRoteiro: db.prepare('SELECT * FROM comentarios WHERE roteiro_id = ? ORDER BY criado_em, rowid'),
    um: db.prepare('SELECT * FROM comentarios WHERE id = ? AND roteiro_id = ?'),
    criar: db.prepare(
      `INSERT INTO comentarios (id, roteiro_id, fio, autor_email, autor_nome, papel, texto, ancora, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    resolver: db.prepare('UPDATE comentarios SET resolvido_em = ?, resolvido_email = ?, resolvido_nome = ? WHERE id = ?'),
    reabrir: db.prepare('UPDATE comentarios SET resolvido_em = NULL, resolvido_email = NULL, resolvido_nome = NULL, decisao = NULL WHERE id = ?'),
    ancora: db.prepare('UPDATE comentarios SET ancora = ? WHERE id = ? AND roteiro_id = ? AND fio IS NULL'),
    // as sugestões (#196)
    qualquer: db.prepare('SELECT * FROM comentarios WHERE id = ?'),
    sugerir: db.prepare(
      `INSERT INTO comentarios (id, roteiro_id, fio, autor_email, autor_nome, papel, texto, ancora, criado_em, sugerido, lote, de_copia) VALUES (?, ?, NULL, ?, ?, ?, '', ?, ?, ?, ?, ?)`,
    ),
    mudarSugestao: db.prepare('UPDATE comentarios SET ancora = ?, sugerido = ? WHERE id = ? AND decisao IS NULL'),
    doLote: db.prepare('SELECT id, decisao FROM comentarios WHERE roteiro_id = ? AND lote = ? AND autor_email = ? AND sugerido IS NOT NULL'),
    temResposta: db.prepare('SELECT 1 FROM comentarios WHERE fio = ? LIMIT 1'),
    apagar: db.prepare('DELETE FROM comentarios WHERE id = ? AND decisao IS NULL'),
    decidir: db.prepare('UPDATE comentarios SET decisao = ?, resolvido_em = ?, resolvido_email = ?, resolvido_nome = ? WHERE id = ? AND sugerido IS NOT NULL'),
    avisar: db.prepare('INSERT OR IGNORE INTO avisos_de_comentario (email, comentario_id, roteiro_id, motivo, criado_em) VALUES (?, ?, ?, ?, ?)'),
    visto: db.prepare('UPDATE avisos_de_comentario SET visto_em = ? WHERE email = ? AND roteiro_id = ? AND visto_em IS NULL'),
    novos: db.prepare('SELECT comentario_id, motivo FROM avisos_de_comentario WHERE email = ? AND roteiro_id = ? AND visto_em IS NULL'),
    naoVistos: db.prepare(
      `SELECT roteiro_id, COUNT(*) AS n, MAX(motivo = 'mencao') AS mencao FROM avisos_de_comentario WHERE email = ? AND visto_em IS NULL GROUP BY roteiro_id`,
    ),
  };

  const paraFora = (l) => ({
    id: l.id,
    fio: l.fio ?? null,
    autor: { nome: l.autor_nome, email: l.autor_email },
    papel: l.papel,
    texto: l.texto,
    criadoEm: l.criado_em,
    ancora: l.ancora ? JSON.parse(l.ancora) : null,
    resolvido: l.resolvido_em ? { em: l.resolvido_em, por: { nome: l.resolvido_nome, email: l.resolvido_email } } : null,
    ...(l.sugerido != null ? { sugestao: { texto: l.sugerido, decisao: l.decisao ?? null } } : {}),
  });

  return {
    /** Os comentários e as respostas do roteiro, na ordem em que chegaram. */
    doRoteiro: (roteiro) => q.doRoteiro.all(roteiro).map(paraFora),
    um: (roteiro, id) => {
      const l = q.um.get(id, roteiro);
      return l ? paraFora(l) : null;
    },
    /** Um comentário novo (com a âncora) ou uma resposta (com o `fio`), e os avisos dele, juntos. */
    criar({ roteiro, fio = null, autor, papel, texto, ancora = null, avisos = [], em }) {
      const id = randomUUID();
      db.exec('BEGIN');
      try {
        q.criar.run(id, roteiro, fio, autor.email, autor.nome, papel, texto, ancora ? JSON.stringify(ancora) : null, em);
        for (const a of avisos) q.avisar.run(a.email, id, roteiro, a.motivo, em);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return paraFora(q.um.get(id, roteiro));
    },
    resolver: (id, por, em) => q.resolver.run(em, por.email, por.nome, id),
    reabrir: (id) => q.reabrir.run(id),
    /** As âncoras refeitas por quem escreve (o trecho mudou de lugar ou de letra): só as dos comentários de cima. */
    mudarAncoras(roteiro, ancoras) {
      let n = 0;
      for (const [id, a] of ancoras) n += Number(q.ancora.run(JSON.stringify(a), id, roteiro).changes);
      return n;
    },
    /**
     * As sugestões de um lote (#196), como estão agora no navegador de quem sugeriu: cada uma entra (com o aviso) ou
     * muda no lugar (pelo id, enquanto ninguém decidiu); as do lote que não vêm mais (a mudança foi desfeita) saem, a
     * menos que já tenham resposta. A decidida não muda: volta em `decididas`, para quem sugeriu esquecer o trecho.
     * @returns { decididas: ids, novas: quantas entraram }
     */
    sugerir({ roteiro, copia, lote, autor, papel, sugestoes, avisos = [], em }) {
      const decididas = [];
      let novas = 0;
      db.exec('BEGIN');
      try {
        const doLote = new Map(q.doLote.all(roteiro, lote, autor.email).map((l) => [l.id, l]));
        for (const s of sugestoes) {
          const ja = q.qualquer.get(s.id);
          if (ja) {
            // o id é de outra pessoa ou de outro roteiro: não mexe
            if (ja.roteiro_id !== roteiro || ja.autor_email !== autor.email || ja.sugerido == null) continue;
            if (ja.decisao) decididas.push(s.id);
            else q.mudarSugestao.run(JSON.stringify(s.ancora), s.texto, s.id);
            continue;
          }
          q.sugerir.run(s.id, roteiro, autor.email, autor.nome, papel, JSON.stringify(s.ancora), em, s.texto, lote, copia);
          for (const a of avisos) q.avisar.run(a.email, s.id, roteiro, a.motivo, em);
          novas++;
        }
        const vieram = new Set(sugestoes.map((s) => s.id));
        for (const [id, l] of doLote) if (!vieram.has(id) && !l.decisao && !q.temResposta.get(id)) q.apagar.run(id);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return { decididas, novas };
    },
    /** Quem escreve decide a sugestão: 'aceita' ou 'recusada'. */
    decidir: (id, decisao, por, em) => q.decidir.run(decisao, em, por.email, por.nome, id),
    /** Os comentários com aviso desta pessoa ainda não visto, neste roteiro ({ id: motivo }). */
    novos: (email, roteiro) => Object.fromEntries(q.novos.all(email, roteiro).map((l) => [l.comentario_id, l.motivo])),
    /** A pessoa viu o roteiro: os avisos dela nele somem. */
    visto: (email, roteiro, em) => Number(q.visto.run(em, email, roteiro).changes),
    /** Os avisos ainda não vistos da pessoa, por roteiro: { id: { n, mencao } }. */
    naoVistos: (email) => Object.fromEntries(q.naoVistos.all(email).map((l) => [l.roteiro_id, { n: Number(l.n), mencao: !!l.mencao }])),
  };
}
