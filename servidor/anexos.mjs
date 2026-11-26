/* Os anexos guardados pelo PROMeiro (#90): o PDF do roteiro que vai ao card no envio e os pôsteres dos filmes. Ficam
   no SQLite do PROMeiro (entram no backup, com o resto do banco) e são servidos por endereço fixo, para não depender
   do anexo do Trello nem do armazenamento do Teable (que já perdeu os pôsteres uma vez). SQL comum ao Postgres. */
import { randomUUID, timingSafeEqual } from 'node:crypto';

/** O PDF do roteiro: /api/anexos/<id>/<nome do arquivo>. O nome é só para quem baixa; vale o id. */
export const ROTA_DOS_ANEXOS = '/api/anexos';
const DO_ANEXO = /^\/api\/anexos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/[^/]*)?$/;

/** O pôster aberto sem login (o Padeiro, dentro do After Effects, não passa pelo Cloudflare Access):
    /api/publico/poster/<registro do filme>?t=<POSTER_PUBLICO_TOKEN>. Tudo o que está embaixo de /api/publico/ é
    público (o Bypass do Access cobre o caminho e o que está embaixo dele) e nunca chega às rotas com login. */
export const ROTA_PUBLICA = '/api/publico/';
const DO_POSTER_PUBLICO = /^\/api\/publico\/poster\/(rec[A-Za-z0-9]{6,32})$/;

/** O pôster é conferido no Teable de 6 em 6 horas (um pôster novo posto lá à mão substitui a cópia). */
const CONFERIR_O_POSTER = 6 * 3600e3;
/** O "não tem" fica guardado na memória: 1 hora quando o Teable respondeu sem o arquivo, 5 minutos quando falhou. */
const SEM_O_ARQUIVO = 3600e3;
const SEM_RESPOSTA = 5 * 60e3;

/** O id do anexo no caminho do pedido (/api/anexos/<id>/<nome>), ou null. */
export const idDoCaminho = (caminho) => DO_ANEXO.exec(String(caminho ?? ''))?.[1] ?? null;

/** O id do anexo no endereço (de qualquer servidor: o PROMeiro pode ter mudado de endereço), ou null. */
export function idDoEndereco(url) {
  try {
    return idDoCaminho(new URL(String(url ?? '')).pathname);
  } catch {
    return null;
  }
}

/** O registro do filme de um pedido ao pôster público com o token certo; null para qualquer outra coisa. */
export function posterPublico(caminho, consulta, token) {
  const rec = DO_POSTER_PUBLICO.exec(caminho)?.[1];
  const esperado = String(token ?? '').trim();
  const veio = String(consulta.get('t') ?? '');
  if (!rec || !esperado || veio.length !== esperado.length) return null;
  return timingSafeEqual(Buffer.from(veio), Buffer.from(esperado)) ? rec : null;
}

/**
 * @param db o SQLite do PROMeiro
 * @param deps.buscar fetch, para o Teable (o pôster que ainda está lá)
 * @param deps.agora () => ms
 */
export function criarAnexos(db, { buscar = fetch, agora = () => Date.now() } = {}) {
  db.exec(`
    -- tipo: 'roteiro' (o PDF do envio) ou 'poster'; chave: o roteiro, ou o registro do filme no Teable; origem: de
    -- onde veio o pôster (o token do anexo no Teable, ou 'previa'); conferido_em: a última conferência com o Teable
    CREATE TABLE IF NOT EXISTS anexos (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      chave TEXT NOT NULL,
      nome TEXT NOT NULL,
      mime TEXT NOT NULL,
      dados BLOB NOT NULL,
      origem TEXT,
      em TEXT NOT NULL,
      conferido_em TEXT
    );
    CREATE INDEX IF NOT EXISTS anexos_chave ON anexos (tipo, chave);
  `);
  const q = {
    guardar: db.prepare('INSERT INTO anexos (id, tipo, chave, nome, mime, dados, origem, em, conferido_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    pdf: db.prepare("SELECT nome, mime, dados FROM anexos WHERE id = ? AND tipo = 'roteiro'"),
    poster: db.prepare("SELECT id, mime, dados, origem, conferido_em FROM anexos WHERE tipo = 'poster' AND chave = ? ORDER BY em DESC LIMIT 1"),
    tirarPoster: db.prepare("DELETE FROM anexos WHERE tipo = 'poster' AND chave = ?"),
    conferido: db.prepare('UPDATE anexos SET conferido_em = ? WHERE id = ?'),
  };
  const iso = () => new Date(agora()).toISOString();
  // os pôsteres que o Teable não tem (rec → até quando não perguntar de novo) e as conferências em curso
  const negativos = new Map();
  const conferindo = new Set();

  /** Guarda o PDF do roteiro; o endereço (sem o servidor) vai para o Teable e para quem baixa. */
  function guardarPdf({ chave, nome, dados }) {
    const id = randomUUID();
    const limpo = String(nome || 'roteiro.pdf').replace(/[\u0000-\u001f/\\]/g, '_').slice(0, 200);
    q.guardar.run(id, 'roteiro', String(chave ?? '').slice(0, 200), limpo, 'application/pdf', Buffer.from(dados), null, iso(), null);
    return { id, caminho: `${ROTA_DOS_ANEXOS}/${id}/${encodeURIComponent(limpo)}` };
  }

  const pdf = (id) => {
    const l = q.pdf.get(id);
    return l ? { nome: l.nome, mime: l.mime, dados: Buffer.from(l.dados) } : null;
  };

  /**
   * Guarda a cópia do pôster do filme (a de antes sai).
   * @param seFaltar só guarda se o PROMeiro ainda não tem um (o da prévia, quando o cadastro já tem um mais atual)
   */
  function guardarPoster(rec, { mime = 'image/jpeg', dados, origem = null, seFaltar = false }) {
    if (!rec || !dados?.length) return false;
    if (seFaltar && q.poster.get(rec)) return false;
    db.exec('BEGIN');
    try {
      q.tirarPoster.run(rec);
      q.guardar.run(randomUUID(), 'poster', rec, `${rec}.${mime.split('/')[1] || 'jpg'}`, mime, Buffer.from(dados), origem, iso(), iso());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    negativos.delete(rec);
    return true;
  }

  /**
   * O pôster no Teable (campo poster da tabela de filmes).
   * @param jaTenho a origem da cópia do PROMeiro: se o anexo do Teable é o mesmo, nem baixa
   * @returns { img, origem } | { mesmo: true } | { semArquivo: true } | { falhou: motivo } | null (sem o Teable)
   */
  async function doTeable(rec, env, jaTenho) {
    const base = String(env.TEABLE_URL || '').replace(/\/+$/, '');
    if (!base || !env.TEABLE_FILMES || !env.TEABLE_TOKEN) return null;
    try {
      const r = await buscar(`${base}/api/table/${encodeURIComponent(env.TEABLE_FILMES)}/record/${rec}?fieldKeyType=name`, { headers: { authorization: `Bearer ${env.TEABLE_TOKEN}` }, signal: AbortSignal.timeout(8000) });
      if (r.status === 404) return { semArquivo: true };
      if (!r.ok) return { falhou: `o Teable respondeu ${r.status}` };
      const anexo = (await r.json())?.fields?.poster?.[0];
      const origem = String(anexo?.token || anexo?.id || anexo?.path || '');
      if (!anexo?.presignedUrl || !/^image\//.test(anexo.mimetype ?? 'image/')) return { semArquivo: true };
      if (jaTenho && origem && origem === jaTenho) return { mesmo: true };
      // o armazenamento do Teable pode ter perdido o arquivo ("Could not find attachment"): sem imagem, não tem
      const f = await buscar(new URL(anexo.presignedUrl, base).toString(), { signal: AbortSignal.timeout(10000) });
      const tipo = String(f.headers?.get?.('content-type') || anexo.mimetype || '').split(';')[0].trim();
      if (!f.ok || !/^image\//.test(tipo)) return { semArquivo: true };
      const dados = Buffer.from(await f.arrayBuffer());
      return dados.length ? { img: { mime: tipo, dados }, origem: origem || 'teable' } : { semArquivo: true };
    } catch (e) {
      return { falhou: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Confere a cópia com o Teable, sem atrasar quem pediu: um pôster novo lá substitui; sem o arquivo, a cópia fica. */
  async function conferir(rec, env, local) {
    if (conferindo.has(rec)) return;
    conferindo.add(rec);
    try {
      const r = await doTeable(rec, env, local.origem);
      if (r?.img) guardarPoster(rec, { ...r.img, origem: r.origem });
      else q.conferido.run(iso(), local.id);
    } finally {
      conferindo.delete(rec);
    }
  }

  /**
   * O pôster do filme: a cópia do PROMeiro; sem ela, o do Teable (que vira a cópia); sem os dois, null. O "não tem"
   * fica guardado um tempo, para o pedido repetido (a lista, o Padeiro de 10 em 10 minutos) não ir ao Teable toda vez.
   * @param env a configuração de agora (TEABLE_URL, TEABLE_TOKEN e TEABLE_FILMES)
   */
  async function poster(rec, env) {
    const local = q.poster.get(rec);
    if (local) {
      if (!local.conferido_em || agora() - Date.parse(local.conferido_em) >= CONFERIR_O_POSTER) void conferir(rec, env, local).catch(() => {});
      return { mime: local.mime, dados: Buffer.from(local.dados) };
    }
    if ((negativos.get(rec) ?? 0) > agora()) return null;
    const r = await doTeable(rec, env, null);
    if (r?.img) {
      guardarPoster(rec, { ...r.img, origem: r.origem });
      return r.img;
    }
    if (r?.falhou) console.warn(`[pôster] ${rec}: ${r.falhou}`);
    if (r) {
      if (negativos.size >= 2000) negativos.delete(negativos.keys().next().value);
      negativos.set(rec, agora() + (r.falhou ? SEM_RESPOSTA : SEM_O_ARQUIVO));
    }
    return null;
  }

  return {
    guardarPdf,
    pdf,
    /** O PDF de um endereço do PROMeiro (o link `doc` da produção da arte), ou null quando não é daqui. */
    pdfDoEndereco: (url) => {
      const id = idDoEndereco(url);
      return id ? pdf(id) : null;
    },
    guardarPoster,
    poster,
  };
}
