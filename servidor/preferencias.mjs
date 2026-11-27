/* As preferências de cada pessoa (#101): o lugar único, no SQLite (e por isso no backup), do que o PROMeiro lembra por
   pessoa em qualquer aparelho: a última área usada, a exibição de cada área, a visão da Pauta da edição (#98)…
   Uma linha por pessoa e chave, com o valor em JSON: uma preferência nova é só uma chave nova, sem mudar a tabela.
   O SQL é portável (vale também no Postgres): sem json_extract, sem INSERT OR REPLACE. Quem grava e confere cada
   chave é a rota de quem está logado (/api/eu/preferencias). */

/** @param db o SQLite do PROMeiro (a tabela `preferencias` é criada aqui) */
export function criarPreferencias(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS preferencias (
    email TEXT NOT NULL,
    chave TEXT NOT NULL,
    valor TEXT NOT NULL,
    em TEXT NOT NULL,
    PRIMARY KEY (email, chave)
  )`);
  const q = {
    todas: db.prepare('SELECT chave, valor FROM preferencias WHERE email = ? ORDER BY chave'),
    gravar: db.prepare('INSERT INTO preferencias (email, chave, valor, em) VALUES (?, ?, ?, ?) ON CONFLICT (email, chave) DO UPDATE SET valor = excluded.valor, em = excluded.em'),
  };
  const minusculo = (email) => String(email ?? '').trim().toLowerCase();
  return {
    /** As preferências da pessoa, { chave: valor }; a linha que não dá para ler fica de fora. */
    ler(email) {
      const fora = {};
      for (const l of q.todas.all(minusculo(email))) {
        try {
          fora[l.chave] = JSON.parse(l.valor);
        } catch {
          /* uma linha estragada não derruba as outras */
        }
      }
      return fora;
    },
    /** Grava (ou troca) uma preferência da pessoa. */
    gravar(email, chave, valor) {
      q.gravar.run(minusculo(email), chave, JSON.stringify(valor), new Date().toISOString());
    },
  };
}
