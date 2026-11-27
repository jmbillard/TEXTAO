/* O apelido da claquete (#120): o nome que o PROMeiro mostra no lugar da claquete, só dentro dele, um por roteiro. O
   Trello e o Teable continuam com a claquete original (o envio lê o roteiro guardado, não esta tabela), que fica no
   roteiro, e o apelido nunca entra na chave dos cruzamentos. A tela mostra o apelido no roteiro e em todas as Produções
   dele (de todas as praças) e nos cards do envio. O apelido também guarda as versões que a claquete sabe (#152), quando
   alguém as faz à mão: o código no padrão ("AH", "MNT"), que vale sobre o valor inicial (o código do nome ou, sem ele,
   as artes do roteiro, que o PROMeiro lê na hora e não guarda). Um apelido só com as versões tem o nome vazio, e a tela
   mostra a claquete original. No SQLite do PROMeiro (e por isso no backup), com SQL portável (vale
   também no Postgres): sem json_extract, sem INSERT OR REPLACE. */

import { codigoAMao, versoesDaChamada } from '../src/modelo/versoesDoRoteiro.ts';

/** O apelido mais longo que o PROMeiro guarda. */
export const APELIDO_MAXIMO = 200;

/** @param db o SQLite do PROMeiro (a tabela `apelidos` é criada aqui; `roteiros`, `envios` e `producoes` já existem) */
export function criarApelidos(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS apelidos (
    roteiro_id TEXT PRIMARY KEY REFERENCES roteiros (id) ON DELETE CASCADE,
    apelido TEXT NOT NULL,
    por_email TEXT NOT NULL,
    por_nome TEXT NOT NULL,
    em TEXT NOT NULL,
    versoes TEXT
  )`);
  // o banco de antes do #152: a coluna das versões à mão
  if (!db.prepare('PRAGMA table_info(apelidos)').all().some((c) => c.name === 'versoes')) db.exec('ALTER TABLE apelidos ADD COLUMN versoes TEXT');
  // as consultas que leem as Produções ficam para a primeira leitura: a tabela delas nasce depois desta
  let q = null;
  const consultas = () =>
    (q ??= {
      todos: db.prepare('SELECT a.roteiro_id, a.apelido, a.versoes, a.por_nome, a.em, r.meta, r.versoes_lidas FROM apelidos a JOIN roteiros r ON r.id = a.roteiro_id ORDER BY a.roteiro_id'),
      um: db.prepare('SELECT apelido, versoes FROM apelidos WHERE roteiro_id = ?'),
      producoes: db.prepare('SELECT p.roteiro_id, p.id FROM producoes p JOIN apelidos a ON a.roteiro_id = p.roteiro_id ORDER BY p.id'),
      cards: db.prepare("SELECT e.roteiro_id, e.card_id FROM envios e JOIN apelidos a ON a.roteiro_id = e.roteiro_id WHERE e.card_id IS NOT NULL AND e.card_id <> ''"),
      gravar: db.prepare(
        `INSERT INTO apelidos (roteiro_id, apelido, versoes, por_email, por_nome, em) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (roteiro_id) DO UPDATE SET apelido = excluded.apelido, versoes = excluded.versoes, por_email = excluded.por_email, por_nome = excluded.por_nome, em = excluded.em`,
      ),
      tirar: db.prepare('DELETE FROM apelidos WHERE roteiro_id = ?'),
      soOsApelidos: db.prepare('SELECT roteiro_id, apelido, versoes FROM apelidos'),
      // a Produção com o roteiro dela (#121): as versões lidas dele, o apelido e as versões à mão (#152)
      roteiroDaProducao: db.prepare('SELECT r.versoes_lidas, a.apelido, a.versoes FROM producoes p LEFT JOIN roteiros r ON r.id = p.roteiro_id LEFT JOIN apelidos a ON a.roteiro_id = p.roteiro_id WHERE p.id = ?'),
    });
  const metaDe = (meta) => {
    try {
      return JSON.parse(meta) ?? {};
    } catch {
      return {};
    }
  };
  const claqueteDe = (meta) => String(metaDe(meta)?.claquete ?? '');
  const lidasDe = (json) => {
    try {
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  };
  const porRoteiro = (linhas, coluna) => {
    const m = new Map();
    for (const l of linhas) m.set(l.roteiro_id, [...(m.get(l.roteiro_id) ?? []), l[coluna]]);
    return m;
  };
  return {
    /**
     * Os apelidos guardados, como a rota devolve: { roteiro, original, apelido, versoes, versoesDaChamada, por, em,
     * producoes, cards }, com a claquete original do roteiro, as versões à mão ('' sem elas), as que valem (à mão, do
     * nome ou do roteiro, com a origem), as Produções dele e os cards do envio. O apelido só com as versões tem o nome ''.
     * @param podeLer (id) => a pessoa lê o roteiro: o apelido do roteiro que ela não vê fica de fora
     */
    todos(podeLer = () => true) {
      const c = consultas();
      const producoes = porRoteiro(c.producoes.all(), 'id');
      const cards = porRoteiro(c.cards.all(), 'card_id');
      return c.todos
        .all()
        .filter((l) => podeLer(l.roteiro_id))
        .map((l) => {
          const meta = metaDe(l.meta);
          const original = String(meta?.claquete ?? '');
          const versoes = l.versoes ?? '';
          return {
            roteiro: l.roteiro_id, original, apelido: l.apelido, versoes,
            versoesDaChamada: versoesDaChamada({ lidas: lidasDe(l.versoes_lidas), claquete: original, apelido: l.apelido, mao: versoes, dia: String(meta?.dataExibicao ?? '') }),
            por: l.por_nome, em: l.em, producoes: producoes.get(l.roteiro_id) ?? [], cards: cards.get(l.roteiro_id) ?? [],
          };
        });
    },
    /** Os apelidos por roteiro (id → { apelido, mao }), sem mais nada: as versões do card da agenda (#121, #152). */
    porRoteiro() {
      return new Map(consultas().soOsApelidos.all().map((l) => [l.roteiro_id, { apelido: l.apelido, mao: l.versoes ?? '' }]));
    },
    /** O roteiro da Produção (#121): as versões lidas dele (vazia sem roteiro), o apelido ('' sem apelido) e as versões
        à mão ('' sem elas, #152). */
    roteiroDaProducao(id) {
      const l = consultas().roteiroDaProducao.get(id);
      return { lidas: lidasDe(l?.versoes_lidas), apelido: l?.apelido ?? '', mao: l?.versoes ?? '' };
    },
    /**
     * Dá (ou troca) o nome e as versões à mão do apelido do roteiro; o que não vem no pedido (undefined) fica como está.
     * O nome vazio, ou igual à claquete original, volta ao original; as versões vazias voltam ao valor inicial. Sem nome
     * nem versões, o apelido sai.
     * @param original a claquete guardada no roteiro
     * @param mudanca { apelido?, versoes? }: o nome e o código das versões à mão ("ah", "(MNT)")
     * @returns a recusa, ou '' quando gravou
     */
    gravar(roteiro, original, { apelido, versoes } = {}, eu) {
      const antes = consultas().um.get(roteiro);
      let nome = antes?.apelido ?? '';
      if (apelido !== undefined) {
        nome = String(apelido ?? '').trim();
        if (nome.length > APELIDO_MAXIMO) return `O apelido tem mais de ${APELIDO_MAXIMO} caracteres.`;
        if (nome === String(original ?? '').trim()) nome = '';
      }
      let codigo = antes?.versoes ?? '';
      if (versoes !== undefined) {
        const lido = codigoAMao(versoes ?? '');
        if ('recusa' in lido) return lido.recusa;
        codigo = lido.codigo;
      }
      if (!nome && !codigo) consultas().tirar.run(roteiro);
      else consultas().gravar.run(roteiro, nome, codigo || null, eu.email, eu.nome, new Date().toISOString());
      return '';
    },
  };
}
