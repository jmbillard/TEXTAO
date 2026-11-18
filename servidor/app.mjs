// Servidor do Roteirista: API + arquivos estáticos, com SQLite (node:sqlite, sem dependências).
// Cada roteiro pertence a um e-mail. Só o dono vê e edita; se marcar como público, os outros leem.
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { webcrypto } from 'node:crypto';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon',
};
const INTERVALO_VERSAO_MS = 5 * 60 * 1000;
const LIMITE_CORPO = 2 * 1024 * 1024;
const ID_VALIDO = /^[\w-]{6,80}$/;

const nomeDoEmail = (email) =>
  email.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');

export function abrirBanco(caminho) {
  const db = new DatabaseSync(caminho);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS roteiros (
      id TEXT PRIMARY KEY,
      dono_email TEXT NOT NULL,
      dono_nome TEXT NOT NULL,
      publico INTEGER NOT NULL DEFAULT 0,
      meta TEXT NOT NULL,
      doc TEXT NOT NULL,
      n_artes INTEGER NOT NULL DEFAULT 0,
      revisao INTEGER NOT NULL DEFAULT 1,
      origem TEXT,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS roteiros_dono ON roteiros (dono_email, atualizado_em);
    CREATE INDEX IF NOT EXISTS roteiros_publico ON roteiros (publico, atualizado_em);
    CREATE TABLE IF NOT EXISTS versoes (
      roteiro_id TEXT NOT NULL REFERENCES roteiros (id) ON DELETE CASCADE,
      n INTEGER NOT NULL,
      criado_em TEXT NOT NULL,
      por_email TEXT NOT NULL,
      por_nome TEXT NOT NULL,
      motivo TEXT NOT NULL,
      meta TEXT NOT NULL,
      doc TEXT NOT NULL,
      PRIMARY KEY (roteiro_id, n)
    );
    CREATE TABLE IF NOT EXISTS usuarios (
      email TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      visto_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS compartilhamentos (
      roteiro_id TEXT NOT NULL REFERENCES roteiros (id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      PRIMARY KEY (roteiro_id, email)
    );
    CREATE INDEX IF NOT EXISTS compartilhamentos_email ON compartilhamentos (email);
  `);
  return db;
}

/* ---------- quem está pedindo ---------- */

let chaves = { em: 0, lista: [] };
async function validarJwt(token, dominio, aud) {
  const [c, p, a] = token.split('.');
  if (!c || !p || !a) return null;
  const de64 = (s) => Buffer.from(s, 'base64url');
  const cab = JSON.parse(de64(c));
  const corpo = JSON.parse(de64(p));
  if (Date.now() - chaves.em > 3600_000) {
    const r = await fetch(`https://${dominio}/cdn-cgi/access/certs`);
    chaves = { em: Date.now(), lista: (await r.json()).keys ?? [] };
  }
  const jwk = chaves.lista.find((k) => k.kid === cab.kid);
  if (!jwk) return null;
  const chave = await webcrypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, de64(a), Buffer.from(`${c}.${p}`));
  const auds = [].concat(corpo.aud ?? []);
  if (!ok || !auds.includes(aud) || corpo.exp * 1000 < Date.now() || !corpo.email) return null;
  return corpo.email;
}

/**
 * Ordem: 1) Cloudflare Access com assinatura conferida (ACCESS_TEAM_DOMAIN + ACCESS_AUD);
 * 2) cabeçalho do Access, confiando na rede (só o túnel chega ao container);
 * 3) perfil local informado pelo navegador, apenas se PERFIL_LOCAL=1 (demonstração).
 */
async function identificar(req, env) {
  const h = req.headers;
  let email = null;
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const token = h['cf-access-jwt-assertion'];
    email = token ? await validarJwt(String(token), env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD).catch(() => null) : null;
    if (!email) return null;
  } else if (h['cf-access-authenticated-user-email']) {
    email = String(h['cf-access-authenticated-user-email']);
  } else if (env.PERFIL_LOCAL === '1' && h['x-perfil-email']) {
    email = decodeURIComponent(String(h['x-perfil-email']));
    const nome = h['x-perfil-nome'] ? decodeURIComponent(String(h['x-perfil-nome'])) : '';
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null;
    return { email: email.toLowerCase(), nome: nome.trim() || nomeDoEmail(email), origem: 'local' };
  }
  if (!email) return null;
  email = email.toLowerCase();
  return { email, nome: nomeDoEmail(email), origem: 'acesso' };
}

/* ---------- utilidades HTTP ---------- */

const json = (res, status, corpo) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(corpo));
};
const lerCorpo = (req) =>
  new Promise((ok, erro) => {
    const partes = [];
    let total = 0;
    req.on('data', (p) => {
      total += p.length;
      if (total > LIMITE_CORPO) {
        erro(Object.assign(new Error('grande demais'), { status: 413 }));
        req.destroy();
      } else partes.push(p);
    });
    req.on('end', () => {
      try {
        ok(JSON.parse(Buffer.concat(partes).toString('utf8') || 'null'));
      } catch {
        erro(Object.assign(new Error('json inválido'), { status: 400 }));
      }
    });
    req.on('error', erro);
  });

/* ---------- aplicação ---------- */

export function criarApp({ db, env = process.env, estaticos = null }) {
  const q = {
    lista: db.prepare(
      `SELECT id, dono_email, dono_nome, publico, meta, n_artes, atualizado_em,
              EXISTS (SELECT 1 FROM compartilhamentos c WHERE c.roteiro_id = roteiros.id) AS compartilhado
       FROM roteiros
       WHERE dono_email = ? OR publico = 1 OR id IN (SELECT roteiro_id FROM compartilhamentos WHERE email = ?)
       ORDER BY atualizado_em DESC LIMIT 2000`,
    ),
    um: db.prepare('SELECT * FROM roteiros WHERE id = ?'),
    inserir: db.prepare(
      `INSERT INTO roteiros (id, dono_email, dono_nome, publico, meta, doc, n_artes, revisao, origem, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    atualizar: db.prepare('UPDATE roteiros SET publico = ?, meta = ?, doc = ?, n_artes = ?, revisao = ?, atualizado_em = ? WHERE id = ?'),
    apagar: db.prepare('DELETE FROM roteiros WHERE id = ?'),
    ultimaVersao: db.prepare('SELECT n, criado_em, meta, doc FROM versoes WHERE roteiro_id = ? ORDER BY n DESC LIMIT 1'),
    novaVersao: db.prepare('INSERT INTO versoes (roteiro_id, n, criado_em, por_email, por_nome, motivo, meta, doc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    versoes: db.prepare('SELECT n, criado_em, por_email, por_nome, motivo FROM versoes WHERE roteiro_id = ? ORDER BY n DESC LIMIT 200'),
    versao: db.prepare('SELECT * FROM versoes WHERE roteiro_id = ? AND n = ?'),
    verUsuario: db.prepare(
      `INSERT INTO usuarios (email, nome, visto_em) VALUES (?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET nome = excluded.nome, visto_em = excluded.visto_em`,
    ),
    usuarios: db.prepare('SELECT email, nome FROM usuarios WHERE email <> ? ORDER BY nome COLLATE NOCASE LIMIT 1000'),
    compartilhadoCom: db.prepare('SELECT email FROM compartilhamentos WHERE roteiro_id = ? ORDER BY email'),
    temAcesso: db.prepare('SELECT 1 FROM compartilhamentos WHERE roteiro_id = ? AND email = ?'),
    limparCompartilhamento: db.prepare('DELETE FROM compartilhamentos WHERE roteiro_id = ?'),
    compartilhar: db.prepare('INSERT OR IGNORE INTO compartilhamentos (roteiro_id, email) VALUES (?, ?)'),
  };

  const paraFora = (l, eu) => ({
    id: l.id,
    meta: JSON.parse(l.meta),
    doc: JSON.parse(l.doc),
    revisao: l.revisao,
    origem: l.origem ?? undefined,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
    criadoPor: { nome: l.dono_nome, email: l.dono_email },
    publico: !!l.publico,
    meu: l.dono_email === eu.email,
    // só o dono sabe com quem compartilhou
    ...(l.dono_email === eu.email ? { compartilhadoCom: q.compartilhadoCom.all(l.id).map((c) => c.email) } : {}),
  });

  /** Guarda uma versão quando faz sentido: a primeira, a cada 5 min de edição, ou num marco (exportou, restaurou). */
  function versionar(id, eu, meta, doc, motivo, agora) {
    const ultima = q.ultimaVersao.get(id);
    if (ultima && ultima.meta === meta && ultima.doc === doc) return;
    if (ultima && !motivo && Date.parse(agora) - Date.parse(ultima.criado_em) < INTERVALO_VERSAO_MS) return;
    q.novaVersao.run(id, (ultima?.n ?? 0) + 1, agora, eu.email, eu.nome, motivo || (ultima ? 'edição' : 'criação'), meta, doc);
  }

  async function api(req, res, caminho) {
    const eu = await identificar(req, env);
    if (caminho === '/api/eu') {
      if (eu) {
        // quem entra passa a constar na lista de pessoas com quem se pode compartilhar
        q.verUsuario.run(eu.email, eu.nome, new Date().toISOString());
        return json(res, 200, eu);
      }
      // sem login na porta: o navegador pode se apresentar com o perfil local, se a demonstração permitir
      return json(res, 200, { email: null, perfilLocal: env.PERFIL_LOCAL === '1' });
    }
    if (!eu) return json(res, 401, { erro: 'Entre com a sua conta para ver os roteiros.' });

    if (caminho === '/api/usuarios') return json(res, 200, q.usuarios.all(eu.email));

    const m = /^\/api\/roteiros(?:\/([^/]+))?(?:\/versoes(?:\/(\d+))?)?$/.exec(caminho);
    if (!m) return json(res, 404, { erro: 'Não encontrado.' });
    const [, id, nVersao] = m;
    const pedeVersoes = caminho.includes('/versoes');

    if (!id) {
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      return json(
        res,
        200,
        q.lista.all(eu.email, eu.email).map((l) => ({
          id: l.id, meta: JSON.parse(l.meta), nArtes: l.n_artes, atualizadoEm: l.atualizado_em,
          dono: { nome: l.dono_nome, email: l.dono_email }, publico: !!l.publico, meu: l.dono_email === eu.email,
          compartilhado: !!l.compartilhado,
        })),
      );
    }
    if (!ID_VALIDO.test(id)) return json(res, 400, { erro: 'Identificador inválido.' });
    const atual = q.um.get(id);
    const meu = atual?.dono_email === eu.email;
    const podeLer = atual && (meu || atual.publico || q.temAcesso.get(id, eu.email));

    if (pedeVersoes) {
      // o histórico é do dono: mostra o caminho todo do texto, não só o resultado
      if (!atual || !meu) return json(res, 404, { erro: 'Roteiro não encontrado.' });
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      if (!nVersao)
        return json(res, 200, q.versoes.all(id).map((v) => ({ n: v.n, criadoEm: v.criado_em, por: { nome: v.por_nome, email: v.por_email }, motivo: v.motivo })));
      const v = q.versao.get(id, Number(nVersao));
      if (!v) return json(res, 404, { erro: 'Versão não encontrada.' });
      return json(res, 200, { n: v.n, criadoEm: v.criado_em, meta: JSON.parse(v.meta), doc: JSON.parse(v.doc) });
    }

    if (req.method === 'GET') {
      if (!podeLer) return json(res, 404, { erro: 'Roteiro não encontrado.' });
      return json(res, 200, paraFora(atual, eu));
    }
    if (req.method === 'DELETE') {
      if (!atual || !meu) return json(res, 404, { erro: 'Roteiro não encontrado.' });
      q.apagar.run(id);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'PUT') {
      // roteiro de outra pessoa nunca é alterado, mesmo sendo público
      if (atual && !meu) return json(res, 403, { erro: 'Este roteiro é de outra pessoa. Duplique para editar.' });
      const corpo = await lerCorpo(req);
      const r = corpo?.roteiro;
      if (!r || typeof r.meta !== 'object' || r.doc?.type !== 'doc') return json(res, 400, { erro: 'Roteiro inválido.' });
      const agora = new Date().toISOString();
      const meta = JSON.stringify(r.meta);
      const doc = JSON.stringify(r.doc);
      const nArtes = Number.isInteger(corpo.nArtes) ? corpo.nArtes : 0;
      const publico = r.publico ? 1 : 0;
      const revisao = Number.isInteger(r.revisao) ? r.revisao : 1;
      const motivo = typeof corpo.marco === 'string' ? corpo.marco.slice(0, 40) : '';
      db.exec('BEGIN');
      try {
        if (atual) q.atualizar.run(publico, meta, doc, nArtes, revisao, agora, id);
        else q.inserir.run(id, eu.email, eu.nome, publico, meta, doc, nArtes, revisao, r.origem ?? null, agora, agora);
        if (Array.isArray(r.compartilhadoCom)) {
          q.limparCompartilhamento.run(id);
          for (const e of r.compartilhadoCom.slice(0, 500))
            if (typeof e === 'string' && e.includes('@') && e.toLowerCase() !== eu.email) q.compartilhar.run(id, e.toLowerCase());
        }
        versionar(id, eu, meta, doc, motivo, agora);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return json(res, 200, { ok: true, atualizadoEm: agora });
    }
    return json(res, 405, { erro: 'Método não permitido.' });
  }

  function arquivo(req, res, caminho) {
    if (!estaticos) return json(res, 404, { erro: 'Não encontrado.' });
    const raiz = resolve(estaticos);
    let alvo = resolve(join(raiz, normalize(decodeURIComponent(caminho))));
    if (!alvo.startsWith(raiz) || !existsSync(alvo) || statSync(alvo).isDirectory()) alvo = join(raiz, 'index.html');
    const ext = extname(alvo);
    res.writeHead(200, {
      'content-type': TIPOS[ext] ?? 'application/octet-stream',
      'cache-control': caminho.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(alvo).pipe(res);
  }

  return async (req, res) => {
    const caminho = new URL(req.url, 'http://x').pathname;
    try {
      if (caminho.startsWith('/api/')) await api(req, res, caminho);
      else arquivo(req, res, caminho);
    } catch (e) {
      if (!res.headersSent) json(res, e.status ?? 500, { erro: e.status ? e.message : 'Algo deu errado no servidor.' });
      if (!e.status) console.error(e);
    }
  };
}

/* ---------- backup diário ---------- */

export function fazerBackup(db, pasta, manter = 14, hoje = new Date()) {
  mkdirSync(pasta, { recursive: true });
  const destino = join(pasta, `roteirista-${hoje.toISOString().slice(0, 10)}.db`);
  if (existsSync(destino)) return null;
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  const antigos = readdirSync(pasta).filter((f) => /^roteirista-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const f of antigos.slice(0, Math.max(0, antigos.length - manter))) unlinkSync(join(pasta, f));
  return destino;
}
