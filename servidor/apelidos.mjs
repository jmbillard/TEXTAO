/* O apelido da claquete (#120): o nome que o PROMeiro mostra no lugar da claquete, só dentro dele. O Trello e o Teable
   continuam com a claquete original (o envio lê o roteiro guardado, não esta tabela), e o apelido nunca entra na chave
   dos cruzamentos. O apelido é da claquete (#154), com ou sem roteiro no PROMeiro: a chave é a claquete no padrão, a
   mesma da pauta e das Produções (`chaveDoApelido`), e o apelido vale para os roteiros com essa claquete, para todas as
   Produções dela (de todas as praças) e para os cards do envio. O roteiro que chega depois usa o apelido que já existe.
   O apelido também guarda as versões que a claquete sabe (#152), quando alguém as faz à mão: o código no padrão ("AH",
   "MNT"), que vale sobre o valor inicial (o código do nome ou, sem ele, as artes do roteiro, que o PROMeiro lê na hora e
   não guarda). Um apelido só com as versões tem o nome vazio, e a tela mostra a claquete original. No SQLite do PROMeiro
   (e por isso no backup), com SQL portável (vale também no Postgres): sem json_extract, sem INSERT OR REPLACE. */

import { chaveDoApelido, codigoAMao, juntarApelidosPelaClaquete, versoesDaChamada } from '../src/modelo/versoesDoRoteiro.ts';
import { pracasRegistradas, semPracaNoFim } from '../src/modelo/pracas.ts';

/** O apelido mais longo que o PROMeiro guarda. */
export const APELIDO_MAXIMO = 200;

const CRIAR = `CREATE TABLE IF NOT EXISTS apelidos (
    chave TEXT PRIMARY KEY,
    original TEXT NOT NULL,
    apelido TEXT NOT NULL,
    versoes TEXT,
    por_email TEXT NOT NULL,
    por_nome TEXT NOT NULL,
    em TEXT NOT NULL
  )`;

const metaDe = (meta) => {
  try {
    return JSON.parse(meta) ?? {};
  } catch {
    return {};
  }
};
const lidasDe = (json) => {
  try {
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
};

/**
 * O banco de antes do #154 guardava o apelido por roteiro (`roteiro_id`): os apelidos passam para a chave da claquete
 * do roteiro. Dois na mesma claquete, vale o mais recente; o outro (e o do roteiro sem claquete) fica no log.
 */
function migrarDoRoteiro(db, pracas) {
  const colunas = db.prepare('PRAGMA table_info(apelidos)').all().map((c) => c.name);
  if (!colunas.includes('roteiro_id')) return;
  db.exec('BEGIN');
  try {
    // o banco de antes do #152: sem a coluna das versões à mão
    if (!colunas.includes('versoes')) db.exec('ALTER TABLE apelidos ADD COLUMN versoes TEXT');
    db.exec('ALTER TABLE apelidos RENAME TO apelidos_por_roteiro');
    db.exec(CRIAR);
    const antigos = db
      .prepare('SELECT a.roteiro_id, a.apelido, a.versoes, a.por_email, a.por_nome, a.em, r.meta FROM apelidos_por_roteiro a LEFT JOIN roteiros r ON r.id = a.roteiro_id')
      .all()
      .map((l) => ({ roteiro: l.roteiro_id, claquete: String(metaDe(l.meta)?.claquete ?? ''), apelido: l.apelido, versoes: l.versoes ?? null, porEmail: l.por_email, porNome: l.por_nome, em: l.em }));
    const { ficam, deixados } = juntarApelidosPelaClaquete(antigos, pracas);
    const gravar = db.prepare('INSERT INTO apelidos (chave, original, apelido, versoes, por_email, por_nome, em) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const a of ficam) gravar.run(a.chave, a.original, a.apelido, a.versoes, a.porEmail, a.porNome, a.em);
    db.exec('DROP TABLE apelidos_por_roteiro');
    db.exec('COMMIT');
    if (ficam.length || deixados.length) console.log(`[apelidos] ${ficam.length} apelidos passaram do roteiro para a claquete`);
    for (const d of deixados) console.warn(`[apelidos] o apelido "${d.apelido}"${d.versoes ? ` (versões ${d.versoes})` : ''} do roteiro ${d.roteiro} ficou de fora: ${d.motivo}`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/**
 * @param db o SQLite do PROMeiro (a tabela `apelidos` é criada aqui; `roteiros`, `envios` e `producoes` já existem)
 * @param lerPracas () => as praças da configuração de agora: a do fim sai da chave
 */
export function criarApelidos(db, lerPracas = pracasRegistradas) {
  migrarDoRoteiro(db, lerPracas());
  db.exec(CRIAR);
  // as consultas que leem as Produções ficam para a primeira leitura: a tabela delas nasce depois desta
  let q = null;
  const consultas = () =>
    (q ??= {
      todos: db.prepare('SELECT chave, original, apelido, versoes, por_nome, em FROM apelidos ORDER BY chave'),
      um: db.prepare('SELECT apelido, versoes FROM apelidos WHERE chave = ?'),
      roteiros: db.prepare('SELECT id, meta, versoes_lidas FROM roteiros ORDER BY id'),
      roteiro: db.prepare('SELECT meta, versoes_lidas FROM roteiros WHERE id = ?'),
      producoes: db.prepare('SELECT id, claquete, roteiro_id FROM producoes ORDER BY id'),
      producao: db.prepare('SELECT claquete, roteiro_id FROM producoes WHERE id = ?'),
      cards: db.prepare("SELECT roteiro_id, card_id FROM envios WHERE card_id IS NOT NULL AND card_id <> '' ORDER BY roteiro_id"),
      gravar: db.prepare(
        `INSERT INTO apelidos (chave, original, apelido, versoes, por_email, por_nome, em) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (chave) DO UPDATE SET original = excluded.original, apelido = excluded.apelido, versoes = excluded.versoes, por_email = excluded.por_email, por_nome = excluded.por_nome, em = excluded.em`,
      ),
      tirar: db.prepare('DELETE FROM apelidos WHERE chave = ?'),
      soOsApelidos: db.prepare('SELECT chave, apelido, versoes FROM apelidos'),
    });
  /** A chave do apelido desta claquete, com as praças de agora. A leitura de todos os apelidos tira a chave de cada
      roteiro e de cada Produção: as já tiradas ficam guardadas enquanto as praças forem as mesmas. */
  let guardadas = { pracas: null, chaves: new Map() };
  const chave = (claquete) => {
    const pracas = lerPracas();
    if (guardadas.pracas !== pracas) guardadas = { pracas, chaves: new Map() };
    const texto = String(claquete ?? '');
    let k = guardadas.chaves.get(texto);
    if (k === undefined) guardadas.chaves.set(texto, (k = chaveDoApelido(texto, pracas)));
    return k;
  };
  const claqueteDe = (meta) => String(metaDe(meta)?.claquete ?? '');
  /** A chave da Produção: a da claquete do roteiro dela, quando ele está no PROMeiro; senão, a da claquete dela. */
  const chaveDaProducao = (p, claqueteDoRoteiro) => chave(claqueteDoRoteiro ?? p.claquete);
  const juntar = (mapa, k, v) => k && mapa.set(k, [...(mapa.get(k) ?? []), v]);
  return {
    /** A chave do apelido desta claquete (#154): a claquete no padrão, sem o código e sem a praça no fim. */
    chave,
    /**
     * Os apelidos guardados, como a rota devolve: { chave, original, apelido, versoes, versoesDaChamada, por, em, roteiros,
     * producoes, cards }, com a claquete como foi escrita quando o apelido foi dado, as versões à mão ('' sem elas), as
     * que valem (à mão, do nome ou do roteiro, com a origem), os roteiros com a claquete, as Produções dela e os cards do
     * envio. O apelido só com as versões tem o nome ''.
     * @param podeLer (id) => a pessoa lê o roteiro: o roteiro que ela não vê fica fora da lista, e o apelido da claquete
     *   que só tem roteiros que ela não vê também
     */
    todos(podeLer = () => true) {
      const c = consultas();
      const linhas = c.todos.all();
      if (!linhas.length) return [];
      const doRoteiro = new Map();
      const roteiros = new Map();
      for (const r of c.roteiros.all()) {
        const k = chave(claqueteDe(r.meta));
        doRoteiro.set(r.id, { chave: k, meta: metaDe(r.meta), lidas: lidasDe(r.versoes_lidas) });
        juntar(roteiros, k, r.id);
      }
      const producoes = new Map();
      for (const p of c.producoes.all()) juntar(producoes, doRoteiro.get(p.roteiro_id)?.chave ?? chave(p.claquete), p.id);
      const cards = new Map();
      for (const e of c.cards.all()) juntar(cards, doRoteiro.get(e.roteiro_id)?.chave, e.card_id);
      return linhas.flatMap((l) => {
        const todosOsRoteiros = roteiros.get(l.chave) ?? [];
        const vistos = todosOsRoteiros.filter((id) => podeLer(id));
        if (todosOsRoteiros.length && !vistos.length) return [];
        // as versões que valem, pelo primeiro roteiro da claquete (as lidas das artes dele); sem roteiro, pela original
        const r = doRoteiro.get(vistos[0]);
        const original = r ? String(r.meta?.claquete ?? '') : l.original;
        const versoes = l.versoes ?? '';
        return [
          {
            chave: l.chave, original, apelido: l.apelido, versoes,
            versoesDaChamada: versoesDaChamada({ lidas: r?.lidas ?? [], claquete: semPracaNoFim(original, lerPracas()), apelido: l.apelido, mao: versoes, dia: String(r?.meta?.dataExibicao ?? '') }),
            por: l.por_nome, em: l.em, roteiros: vistos, producoes: producoes.get(l.chave) ?? [], cards: cards.get(l.chave) ?? [],
          },
        ];
      });
    },
    /** Os apelidos pela chave da claquete (chave → { apelido, mao }), sem mais nada: as versões do card da agenda (#121, #152). */
    porChave() {
      return new Map(consultas().soOsApelidos.all().map((l) => [l.chave, { apelido: l.apelido, mao: l.versoes ?? '' }]));
    },
    /** O roteiro da Produção (#121): as versões lidas dele (vazia sem roteiro) e, pela chave da claquete (#154), o
        apelido ('' sem apelido) e as versões à mão ('' sem elas, #152). */
    roteiroDaProducao(id) {
      const c = consultas();
      const p = c.producao.get(id);
      const r = p?.roteiro_id ? c.roteiro.get(p.roteiro_id) : null;
      const a = p ? c.um.get(chaveDaProducao(p, r ? claqueteDe(r.meta) : undefined)) : null;
      return { lidas: lidasDe(r?.versoes_lidas), apelido: a?.apelido ?? '', mao: a?.versoes ?? '' };
    },
    /** A claquete que dá a chave do apelido da Produção: a do roteiro dela, quando ele está no PROMeiro; senão, a dela.
        null quando a Produção não existe. */
    claqueteDaProducao(id) {
      const c = consultas();
      const p = c.producao.get(id);
      if (!p) return null;
      const r = p.roteiro_id ? c.roteiro.get(p.roteiro_id) : null;
      return r ? claqueteDe(r.meta) : String(p.claquete ?? '');
    },
    /**
     * Dá (ou troca) o nome e as versões à mão do apelido da claquete; o que não vem no pedido (undefined) fica como está.
     * O nome vazio, ou igual à claquete original, volta ao original; as versões vazias voltam ao valor inicial. Sem nome
     * nem versões, o apelido sai.
     * @param original a claquete (a guardada no roteiro, a da Produção ou a da pauta): dá a chave
     * @param mudanca { apelido?, versoes? }: o nome e o código das versões à mão ("ah", "(MNT)")
     * @returns a recusa, ou '' quando gravou
     */
    gravar(original, { apelido, versoes } = {}, eu) {
      const k = chave(original);
      if (!k) return 'A claquete está vazia.';
      const antes = consultas().um.get(k);
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
      if (!nome && !codigo) consultas().tirar.run(k);
      else consultas().gravar.run(k, String(original).trim(), nome, codigo || null, eu.email, eu.nome, new Date().toISOString());
      return '';
    },
  };
}
