// Servidor do PROMeiro: API + arquivos estáticos, com SQLite (node:sqlite, sem dependências).
// Cada roteiro pertence a um e-mail. Só o dono vê e edita; se marcar como público, os outros leem.
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as sinc from 'y-protocols/sync';
import * as presenca from 'y-protocols/awareness';
import * as cod from 'lib0/encoding';
import * as dec from 'lib0/decoding';
import { criarVocabulario } from './vocabulario.mjs';
import { criarPauta } from './pauta.mjs';
import { criarCache } from './cache.mjs';

const MSG_SINC = 0;
const MSG_PRESENCA = 1;

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
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
    -- última leitura boa do que vem do Teable, para quando ele estiver fora do ar
    CREATE TABLE IF NOT EXISTS teable_copia (
      chave TEXT PRIMARY KEY,
      dados TEXT NOT NULL,
      em TEXT NOT NULL
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
  // colunas que chegaram depois da primeira versão do banco
  const tem = (tabela, coluna) => db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna);
  if (!tem('compartilhamentos', 'pode_editar')) db.exec('ALTER TABLE compartilhamentos ADD COLUMN pode_editar INTEGER NOT NULL DEFAULT 0');
  if (!tem('roteiros', 'ydoc')) db.exec('ALTER TABLE roteiros ADD COLUMN ydoc BLOB');
  // quem mexeu por último no roteiro depois que ele chegou: aparece na fila como "revisado por"
  if (!tem('roteiros', 'revisado_email')) db.exec('ALTER TABLE roteiros ADD COLUMN revisado_email TEXT; ALTER TABLE roteiros ADD COLUMN revisado_nome TEXT');
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
  } else if (env.PERFIL_LOCAL === '1') {
    // o WebSocket do navegador não envia cabeçalhos próprios; nesse caso o perfil vem na URL
    const url = new URL(req.url, 'http://x').searchParams;
    const bruto = h['x-perfil-email'] ? decodeURIComponent(String(h['x-perfil-email'])) : url.get('email');
    if (!bruto) return null;
    email = bruto;
    const nome = h['x-perfil-nome'] ? decodeURIComponent(String(h['x-perfil-nome'])) : (url.get('nome') ?? '');
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

export function criarApp({ db, env = process.env, estaticos = null, cache = criarCache(env) }) {
  // cópia local do Teable: o que foi lido por último continua valendo com ele fora do ar, mesmo depois de reiniciar
  const lerCopia = db.prepare('SELECT dados, em FROM teable_copia WHERE chave = ?');
  const gravarCopia = db.prepare('INSERT OR REPLACE INTO teable_copia (chave, dados, em) VALUES (?, ?, ?)');
  const copia = {
    ler: (chave) => {
      const l = lerCopia.get(chave);
      return l ? { dados: JSON.parse(l.dados), em: l.em } : null;
    },
    guardar: (chave, dados) => gravarCopia.run(chave, JSON.stringify(dados), new Date().toISOString()),
  };
  const vocabulario = criarVocabulario(env, fetch, cache, copia);
  const pauta = criarPauta(env, vocabulario, undefined, cache, copia);
  const q = {
    lista: db.prepare(
      `SELECT id, dono_email, dono_nome, publico, meta, n_artes, atualizado_em, revisado_email, revisado_nome,
              EXISTS (SELECT 1 FROM compartilhamentos c WHERE c.roteiro_id = roteiros.id) AS compartilhado,
              COALESCE((SELECT pode_editar FROM compartilhamentos c WHERE c.roteiro_id = roteiros.id AND c.email = ?), 0) AS pode_editar
       FROM roteiros
       WHERE dono_email = ? OR publico = 1 OR id IN (SELECT roteiro_id FROM compartilhamentos WHERE email = ?)
       ORDER BY atualizado_em DESC LIMIT 2000`,
    ),
    listaTudo: db.prepare(
      `SELECT id, dono_email, dono_nome, publico, meta, n_artes, atualizado_em, revisado_email, revisado_nome,
              EXISTS (SELECT 1 FROM compartilhamentos c WHERE c.roteiro_id = roteiros.id) AS compartilhado,
              COALESCE((SELECT pode_editar FROM compartilhamentos c WHERE c.roteiro_id = roteiros.id AND c.email = ?), 0) AS pode_editar
       FROM roteiros
       ORDER BY atualizado_em DESC LIMIT 2000`,
    ),
    um: db.prepare('SELECT id, dono_email, dono_nome, publico, meta, doc, n_artes, revisao, origem, criado_em, atualizado_em, revisado_email, ydoc IS NOT NULL AS tem_ydoc FROM roteiros WHERE id = ?'),
    ydoc: db.prepare('SELECT ydoc FROM roteiros WHERE id = ?'),
    salvarYdoc: db.prepare('UPDATE roteiros SET ydoc = ? WHERE id = ?'),
    conteudo: db.prepare('UPDATE roteiros SET meta = ?, doc = ?, n_artes = ?, atualizado_em = ? WHERE id = ?'),
    revisou: db.prepare('UPDATE roteiros SET revisado_email = ?, revisado_nome = ? WHERE id = ?'),
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
    compartilhadoCom: db.prepare('SELECT email, pode_editar FROM compartilhamentos WHERE roteiro_id = ? ORDER BY email'),
    temAcesso: db.prepare('SELECT pode_editar FROM compartilhamentos WHERE roteiro_id = ? AND email = ?'),
    limparCompartilhamento: db.prepare('DELETE FROM compartilhamentos WHERE roteiro_id = ?'),
    compartilhar: db.prepare('INSERT OR REPLACE INTO compartilhamentos (roteiro_id, email, pode_editar) VALUES (?, ?, ?)'),
  };

  // Por enquanto a ferramenta é da Arte: todo mundo que entra vê e edita todos os roteiros.
  // ACESSO=privado volta ao modelo em que cada um só vê os seus e os que recebeu.
  const aberto = env.ACESSO !== 'privado';

  /** O que esta pessoa pode fazer com o roteiro: o dono tudo; quem recebeu, ler ou editar; os demais, ler se for de todos. */
  const acesso = (id, eu) => {
    const linha = q.um.get(id);
    if (!linha) return { linha: null, meu: false, editar: false, ler: false };
    const meu = linha.dono_email === eu.email;
    const parte = meu ? null : q.temAcesso.get(id, eu.email);
    const editar = aberto || meu || !!parte?.pode_editar;
    return { linha, meu, editar, ler: editar || !!parte || !!linha.publico };
  };

  /* ---------- edição simultânea ---------- */

  const salas = new Map(); // id → { doc, presenca, conexoes: Map<ws, { eu, editar, clientes:Set }>, gravar }
  const reservas = new Map(); // id → prazo: quem abriu primeiro preenche o documento compartilhado

  const enviar = (ws, encoder) => {
    if (ws.readyState === 1) ws.send(cod.toUint8Array(encoder), { binary: true });
  };
  function abrirSala(id) {
    let sala = salas.get(id);
    if (sala) return sala;
    const doc = new Y.Doc();
    const guardado = q.ydoc.get(id)?.ydoc;
    if (guardado) Y.applyUpdate(doc, guardado);
    const pres = new presenca.Awareness(doc);
    pres.setLocalState(null);
    sala = { doc, presenca: pres, conexoes: new Map(), prazo: null };
    const gravar = () => {
      sala.prazo = null;
      q.salvarYdoc.run(Y.encodeStateAsUpdate(doc), id);
    };
    sala.gravar = gravar;
    doc.on('update', (atualizacao, origem) => {
      const e = cod.createEncoder();
      cod.writeVarUint(e, MSG_SINC);
      sinc.writeUpdate(e, atualizacao);
      for (const ws of sala.conexoes.keys()) if (ws !== origem) enviar(ws, e);
      if (!sala.prazo) sala.prazo = setTimeout(gravar, 1500);
    });
    pres.on('update', ({ added, updated, removed }, origem) => {
      const con = sala.conexoes.get(origem);
      if (con) {
        for (const c of [...added, ...updated]) con.clientes.add(c);
        for (const c of removed) con.clientes.delete(c);
      }
      const e = cod.createEncoder();
      cod.writeVarUint(e, MSG_PRESENCA);
      cod.writeVarUint8Array(e, presenca.encodeAwarenessUpdate(pres, [...added, ...updated, ...removed]));
      for (const ws of sala.conexoes.keys()) enviar(ws, e);
    });
    salas.set(id, sala);
    return sala;
  }
  function fecharSala(id, motivo, filtro = () => true) {
    const sala = salas.get(id);
    if (!sala) return;
    for (const [ws, con] of sala.conexoes) if (filtro(con)) ws.close(4001, motivo);
  }

  /* ---------- fila ao vivo ---------- */

  // Quem está com a fila aberta recebe um aviso quando um roteiro chega, muda ou sai.
  // Com Redis, o aviso passa por ele e chega a quem estiver em qualquer instância.
  const naFila = new Map(); // ws → { eu, vivo }
  const FILA = 'fila';
  const pessoasNaFila = () => [...new Map([...naFila.values()].map(({ eu }) => [eu.email, { nome: eu.nome, email: eu.email }])).values()];
  /** Em qual roteiro o aviso toca: o id, ou a ficha sob o ponteiro. */
  const roteiroDoAviso = (dado) => dado.id ?? (typeof dado.ancora === 'string' && dado.ancora.startsWith('ficha:') ? dado.ancora.slice(6) : null);
  const paraTodos = (dado) => {
    const msg = JSON.stringify(dado);
    const id = roteiroDoAviso(dado);
    for (const [ws, c] of naFila) {
      if (ws.readyState !== 1) continue;
      // no modo privado, ninguém fica sabendo de roteiro que não pode ler (o aviso de apagado só leva o id)
      if (!aberto && id && dado.tipo !== 'apagado' && !acesso(id, c.eu).ler) continue;
      ws.send(msg);
    }
  };
  cache.assinar(FILA, paraTodos);
  const avisarFila = (tipo, id, eu) => void cache.publicar(FILA, { tipo, id, por: eu.email }).catch(() => {});
  // túneis e proxies derrubam conexão parada: um ping a cada 25 s mantém a fila viva e descarta quem sumiu
  // vale também para quem está num roteiro: notebook fechado não fica "vendo" para sempre
  const batimento = setInterval(() => {
    const todas = [...naFila, ...[...salas.values()].flatMap((s) => [...s.conexoes])];
    for (const [ws, c] of todas) {
      if (!c.vivo) ws.terminate();
      else {
        c.vivo = false;
        ws.ping();
      }
    }
  }, 25_000);
  batimento.unref?.();
  /** Quem está com cada roteiro aberto agora (nesta instância), sem repetir a pessoa de duas abas. */
  const quemNoRoteiro = (id) => {
    const sala = salas.get(id);
    if (!sala) return [];
    return [...new Map([...sala.conexoes.values()].map(({ eu }) => [eu.email, { nome: eu.nome, email: eu.email }])).values()];
  };
  const avisarNoRoteiro = (id) => void cache.publicar(FILA, { tipo: 'no-roteiro', id, pessoas: quemNoRoteiro(id) }).catch(() => {});

  // ponteiros do mouse: passam pelo mesmo caminho, mas só valem para quem está na fila agora
  const PONTEIROS = 'ponteiros';
  cache.assinar(PONTEIROS, paraTodos);
  const num = (v) => (Number.isFinite(v) ? Math.max(-0.5, Math.min(1.5, v)) : null);

  function entrarNaFila(ws, eu) {
    naFila.set(ws, { eu, vivo: true });
    ws.on('message', (dados) => {
      if (dados.length > 400) return;
      let m;
      try {
        m = JSON.parse(String(dados));
      } catch {
        return;
      }
      if (m?.tipo !== 'ponteiro') return;
      const fx = num(m.fx);
      const fy = num(m.fy);
      const fora = m.saiu === true || fx === null || fy === null || typeof m.ancora !== 'string';
      void cache
        .publicar(PONTEIROS, fora ? { tipo: 'ponteiro', por: eu.email, nome: eu.nome, saiu: true } : { tipo: 'ponteiro', por: eu.email, nome: eu.nome, ancora: m.ancora.slice(0, 80), fx, fy, ...(/^[a-z-]{1,24}$/.test(m.cursor ?? '') ? { cursor: m.cursor } : {}) })
        .catch(() => {});
    });
    // quem chega na fila já vê quem está revisando o quê
    for (const id of salas.keys()) {
      const pessoas = quemNoRoteiro(id);
      if (pessoas.length && ws.readyState === 1) ws.send(JSON.stringify({ tipo: 'no-roteiro', id, pessoas }));
    }
    ws.on('pong', () => {
      const c = naFila.get(ws);
      if (c) c.vivo = true;
    });
    ws.on('close', () => {
      naFila.delete(ws);
      paraTodos({ tipo: 'presenca', pessoas: pessoasNaFila() });
      // com outra aba da mesma pessoa ainda aberta, o ponteiro dela continua
      if (![...naFila.values()].some((c) => c.eu.email === eu.email))
        void cache.publicar(PONTEIROS, { tipo: 'ponteiro', por: eu.email, nome: eu.nome, saiu: true }).catch(() => {});
    });
    paraTodos({ tipo: 'presenca', pessoas: pessoasNaFila() });
  }

  const wss = new WebSocketServer({ noServer: true });
  /** Conexão em tempo real só do próprio site: outra página aberta no navegador não pode falar em nome da pessoa.
      CONFERIR_ORIGEM=0 desliga a conferência (para um proxy que reescreva o endereço). */
  const origemConfere = (req) => {
    const origem = req.headers.origin;
    if (!origem || env.CONFERIR_ORIGEM === '0') return true;
    try {
      const host = new URL(origem).host.toLowerCase();
      return [req.headers.host, req.headers['x-forwarded-host']].some((h) => typeof h === 'string' && h.split(',')[0].trim().toLowerCase() === host);
    } catch {
      return false;
    }
  };

  async function upgrade(req, socket, head) {
    const recusar = (codigo) => {
      socket.write(`HTTP/1.1 ${codigo}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    try {
      if (!origemConfere(req)) {
        console.error(`[tempo real] conexão recusada: origem ${req.headers.origin} não é ${req.headers['x-forwarded-host'] ?? req.headers.host}`);
        return recusar('403 Forbidden');
      }
      const caminho = new URL(req.url, 'http://x').pathname;
      if (caminho === '/api/eventos') {
        const eu = await identificar(req, env);
        if (!eu) return recusar('401 Unauthorized');
        return wss.handleUpgrade(req, socket, head, (ws) => entrarNaFila(ws, eu));
      }
      const m = /^\/api\/colab\/([\w-]{6,80})$/.exec(caminho);
      if (!m) return recusar('404 Not Found');
      const eu = await identificar(req, env);
      if (!eu) return recusar('401 Unauthorized');
      const a = acesso(m[1], eu);
      if (!a.ler) return recusar('404 Not Found');
      wss.handleUpgrade(req, socket, head, (ws) => conectar(ws, m[1], eu, a.editar));
    } catch {
      recusar('500 Internal Server Error');
    }
  }
  function conectar(ws, id, eu, editar) {
    const sala = abrirSala(id);
    const con = { eu, editar, clientes: new Set(), vivo: true };
    sala.conexoes.set(ws, con);
    avisarNoRoteiro(id);
    ws.on('pong', () => (con.vivo = true));
    ws.binaryType = 'arraybuffer';

    ws.on('message', (dados) => {
      try {
        const d = dec.createDecoder(new Uint8Array(dados));
        const tipo = dec.readVarUint(d);
        if (tipo === MSG_SINC) {
          const e = cod.createEncoder();
          cod.writeVarUint(e, MSG_SINC);
          if (editar) sinc.readSyncMessage(d, e, sala.doc, ws);
          // quem só lê recebe o documento, mas o que enviar de alteração é descartado
          else if (dec.readVarUint(d) === sinc.messageYjsSyncStep1) sinc.readSyncStep1(d, e, sala.doc);
          if (cod.length(e) > 1) enviar(ws, e);
        } else if (tipo === MSG_PRESENCA) {
          presenca.applyAwarenessUpdate(sala.presenca, dec.readVarUint8Array(d), ws);
        }
      } catch (erro) {
        console.error('colab:', erro.message);
      }
    });
    ws.on('close', () => {
      presenca.removeAwarenessStates(sala.presenca, [...con.clientes], null);
      sala.conexoes.delete(ws);
      avisarNoRoteiro(id);
      if (!sala.conexoes.size) {
        if (sala.prazo) clearTimeout(sala.prazo);
        if (q.um.get(id)) sala.gravar();
        sala.doc.destroy();
        salas.delete(id);
      }
    });

    const e = cod.createEncoder();
    cod.writeVarUint(e, MSG_SINC);
    sinc.writeSyncStep1(e, sala.doc);
    enviar(ws, e);
    const estados = [...sala.presenca.getStates().keys()];
    if (estados.length) {
      const p = cod.createEncoder();
      cod.writeVarUint(p, MSG_PRESENCA);
      cod.writeVarUint8Array(p, presenca.encodeAwarenessUpdate(sala.presenca, estados));
      enviar(ws, p);
    }
  }

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
    ...(aberto ? { aberto: true } : {}),
    // só o dono sabe com quem compartilhou
    ...(l.dono_email === eu.email ? { compartilhadoCom: q.compartilhadoCom.all(l.id).map((c) => ({ email: c.email, editar: !!c.pode_editar })) } : {}),
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
    if (caminho === '/api/vocabulario') return json(res, 200, await vocabulario.ler());
    if (caminho === '/api/pauta') return json(res, 200, await pauta.achar(new URL(req.url, 'http://x').searchParams.get('chave')));

    const m = /^\/api\/roteiros(?:\/([^/]+))?(?:\/versoes(?:\/(\d+))?)?$/.exec(caminho);
    if (!m) return json(res, 404, { erro: 'Não encontrado.' });
    const [, id, nVersao] = m;
    const pedeVersoes = caminho.includes('/versoes');

    if (!id) {
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      return json(
        res,
        200,
        (aberto ? q.listaTudo.all(eu.email) : q.lista.all(eu.email, eu.email, eu.email)).map((l) => ({
          id: l.id, meta: JSON.parse(l.meta), nArtes: l.n_artes, atualizadoEm: l.atualizado_em,
          dono: { nome: l.dono_nome, email: l.dono_email }, publico: !!l.publico, meu: l.dono_email === eu.email,
          compartilhado: !!l.compartilhado,
          podeEditar: aberto || l.dono_email === eu.email || !!l.pode_editar,
          revisadoPor: l.revisado_email ? { nome: l.revisado_nome, email: l.revisado_email } : null,
          ...(aberto ? { aberto: true } : {}),
        })),
      );
    }
    if (!ID_VALIDO.test(id)) return json(res, 400, { erro: 'Identificador inválido.' });
    const { linha: atual, meu, editar: podeEditar, ler: podeLer } = acesso(id, eu);

    if (pedeVersoes) {
      // no modo privado o histórico é do dono: mostra o caminho todo do texto, não só o resultado
      if (!atual || !(meu || aberto)) return json(res, 404, { erro: 'Roteiro não encontrado.' });
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      if (!nVersao)
        return json(res, 200, q.versoes.all(id).map((v) => ({ n: v.n, criadoEm: v.criado_em, por: { nome: v.por_nome, email: v.por_email }, motivo: v.motivo })));
      const v = q.versao.get(id, Number(nVersao));
      if (!v) return json(res, 404, { erro: 'Versão não encontrada.' });
      return json(res, 200, { n: v.n, criadoEm: v.criado_em, meta: JSON.parse(v.meta), doc: JSON.parse(v.doc) });
    }

    if (req.method === 'GET') {
      if (!podeLer) return json(res, 404, { erro: 'Roteiro não encontrado.' });
      const fora = { ...paraFora(atual, eu), podeEditar };
      // o documento compartilhado ainda está vazio: a primeira pessoa que pode editar o preenche (uma só, por 20 s)
      const vazio = !atual.tem_ydoc && !(salas.get(id)?.doc.getXmlFragment('doc').length > 0);
      if (podeEditar && vazio && !((reservas.get(id) ?? 0) > Date.now())) {
        reservas.set(id, Date.now() + 20_000);
        fora.semear = true;
      }
      return json(res, 200, fora);
    }
    if (req.method === 'DELETE') {
      // no modo aberto qualquer pessoa apaga; no privado, só quem é dono
      if (!atual || !(meu || aberto)) return json(res, 404, { erro: 'Roteiro não encontrado.' });
      q.apagar.run(id);
      fecharSala(id, 'apagado');
      avisarFila('apagado', id, eu);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'PUT') {
      // só o dono e quem ele autorizou a editar alteram o roteiro
      if (atual && !podeEditar) return json(res, 403, { erro: 'Este roteiro é de outra pessoa. Duplique para editar.' });
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
      let mudouAcesso = false;
      let novoRevisor = false;
      db.exec('BEGIN');
      try {
        // quem edita sem ser dono muda o conteúdo, nunca o compartilhamento
        if (atual && !meu) q.conteudo.run(meta, doc, nArtes, agora, id);
        else if (atual) {
          mudouAcesso = !!atual.publico !== !!publico;
          q.atualizar.run(publico, meta, doc, nArtes, revisao, agora, id);
        }
        else q.inserir.run(id, eu.email, eu.nome, publico, meta, doc, nArtes, revisao, r.origem ?? null, agora, agora);
        if ((meu || !atual) && Array.isArray(r.compartilhadoCom)) {
          const antes = JSON.stringify(q.compartilhadoCom.all(id));
          q.limparCompartilhamento.run(id);
          for (const c of r.compartilhadoCom.slice(0, 500)) {
            const email = (typeof c === 'string' ? c : c?.email)?.toLowerCase?.();
            if (email && email.includes('@') && email !== eu.email) q.compartilhar.run(id, email, c?.editar ? 1 : 0);
          }
          mudouAcesso ||= antes !== JSON.stringify(q.compartilhadoCom.all(id));
        }
        if (atual && (atual.meta !== meta || atual.doc !== doc)) {
          novoRevisor = atual.revisado_email !== eu.email;
          q.revisou.run(eu.email, eu.nome, id);
        }
        versionar(id, eu, meta, doc, motivo, agora);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      // mudou quem pode o quê: os convidados reconectam e passam pela conferência de novo
      if (mudouAcesso) fecharSala(id, 'acesso alterado', (con) => con.eu.email !== eu.email);
      // a fila só precisa saber quando muda o que ela mostra; o texto sendo digitado não conta
      if (!atual) avisarFila('criado', id, eu);
      else if (novoRevisor || atual.meta !== meta || atual.n_artes !== nArtes) avisarFila('alterado', id, eu);
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
      // o motor de OCR (uns 5 MB) fica um dia no navegador; o resto do site é conferido a cada visita
      'cache-control': caminho.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : caminho.startsWith('/ocr/') ? 'public, max-age=86400' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(alvo).pipe(res);
  }

  const app = async (req, res) => {
    const caminho = new URL(req.url, 'http://x').pathname;
    try {
      if (caminho.startsWith('/api/')) await api(req, res, caminho);
      else arquivo(req, res, caminho);
    } catch (e) {
      if (!res.headersSent) json(res, e.status ?? 500, { erro: e.status ? e.message : 'Algo deu errado no servidor.' });
      if (!e.status) console.error(e);
    }
  };
  /** Ligue em `server.on('upgrade', app.upgrade)` para a edição simultânea e a fila ao vivo. */
  app.upgrade = upgrade;
  app.cache = cache;
  app.fechar = async () => {
    clearInterval(batimento);
    pauta.parar();
    for (const ws of naFila.keys()) ws.terminate();
    // o que foi digitado nos últimos instantes ainda não foi gravado: grava antes de desligar
    for (const [id, sala] of salas) {
      if (!sala.prazo) continue;
      clearTimeout(sala.prazo);
      if (q.um.get(id)) sala.gravar();
    }
    await cache.fechar();
  };
  return app;
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
