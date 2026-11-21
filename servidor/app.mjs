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
import { criarTrello } from './trello.mjs';
import { criarCadastros } from './cadastros.mjs';
import { criarAcervo } from './acervo.mjs';

const MSG_SINC = 0;
const MSG_PRESENCA = 1;

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon',
};
const INTERVALO_VERSAO_MS = 5 * 60 * 1000;
const LIMITE_CORPO = 2 * 1024 * 1024;
/** Arquivo original do roteiro (docx, rtf, pdf): guardado para o PDF do card do Trello. */
const LIMITE_ORIGINAL = 30 * 1024 * 1024;
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
    -- o arquivo que subiu, como veio: vira o PDF anexado ao card do Trello
    CREATE TABLE IF NOT EXISTS originais (
      roteiro_id TEXT PRIMARY KEY REFERENCES roteiros (id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      dados BLOB NOT NULL,
      em TEXT NOT NULL
    );
    -- o que aconteceu ao mandar para o Trello
    CREATE TABLE IF NOT EXISTS envios (
      roteiro_id TEXT PRIMARY KEY REFERENCES roteiros (id) ON DELETE CASCADE,
      estado TEXT NOT NULL,
      card_id TEXT,
      url TEXT,
      erro TEXT,
      avisos TEXT,
      em TEXT NOT NULL,
      por_email TEXT,
      por_nome TEXT
    );
  `);
  // colunas que chegaram depois da primeira versão do banco
  const tem = (tabela, coluna) => db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna);
  if (!tem('compartilhamentos', 'pode_editar')) db.exec('ALTER TABLE compartilhamentos ADD COLUMN pode_editar INTEGER NOT NULL DEFAULT 0');
  if (!tem('roteiros', 'ydoc')) db.exec('ALTER TABLE roteiros ADD COLUMN ydoc BLOB');
  // quem mexeu por último no roteiro depois que ele chegou: aparece na fila como "revisado por"
  // a cor de destaque que a pessoa escolheu (grifo, orelha, cursor); vazio = a sorteada pelo e-mail
  if (!tem('usuarios', 'cor')) db.exec('ALTER TABLE usuarios ADD COLUMN cor TEXT');
  if (!tem('roteiros', 'revisado_email')) db.exec('ALTER TABLE roteiros ADD COLUMN revisado_email TEXT; ALTER TABLE roteiros ADD COLUMN revisado_nome TEXT');
  // acervo de artes: as artes novas de cada envio e a atração, para entrarem no acervo quando o card sair
  // o texto do original com o sublinhado do redator, trecho a trecho: é dele que sai o PDF do card sem o Stirling
  if (!tem('originais', 'texto')) db.exec('ALTER TABLE originais ADD COLUMN texto TEXT');
  if (!tem('envios', 'artes_novas')) db.exec('ALTER TABLE envios ADD COLUMN artes_novas TEXT; ALTER TABLE envios ADD COLUMN atracao TEXT; ALTER TABLE envios ADD COLUMN acervo_em TEXT');
  // a data de exibição: numa sessão de filme, é ela que diz qual filme (pelo log do bot)
  if (!tem('envios', 'exibicao')) db.exec('ALTER TABLE envios ADD COLUMN exibicao TEXT');
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

/** Corpo binário (o arquivo original). Grande demais: o resto é lido e descartado, sem derrubar a conexão,
    para a resposta 413 chegar a quem enviou. */
const lerBinario = (req, limite) =>
  new Promise((ok, erro) => {
    const grandeDemais = () => Object.assign(new Error('Arquivo grande demais para guardar (até 30 MB).'), { status: 413 });
    if (Number(req.headers['content-length']) > limite) {
      req.resume();
      return erro(grandeDemais());
    }
    const partes = [];
    let total = 0;
    req.on('data', (p) => {
      total += p.length;
      if (total <= limite) partes.push(p);
    });
    req.on('end', () => (total > limite ? erro(grandeDemais()) : ok(Buffer.concat(partes))));
    req.on('error', erro);
  });

/* ---------- aplicação ---------- */

export function criarApp({ db, env = process.env, estaticos = null, cache = criarCache(env), trello = criarTrello(env), cadastros = null, acervo = criarAcervo(env, { artesDoCard: (card) => trello.artesDoCard?.(card) ?? [] }) }) {
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
  cadastros ??= criarCadastros(env, { vocabulario });
  const q = {
    lista: db.prepare(
      `SELECT id, dono_email, dono_nome, publico, meta, n_artes, atualizado_em, revisado_email, revisado_nome,
              EXISTS (SELECT 1 FROM compartilhamentos c WHERE c.roteiro_id = roteiros.id) AS compartilhado,
              COALESCE((SELECT pode_editar FROM compartilhamentos c WHERE c.roteiro_id = roteiros.id AND c.email = ?), 0) AS pode_editar,
              e.estado AS envio_estado, e.card_id AS envio_card, e.url AS envio_url, e.erro AS envio_erro, e.em AS envio_em, e.por_nome AS envio_por,
              EXISTS (SELECT 1 FROM originais o WHERE o.roteiro_id = roteiros.id) AS tem_original
       FROM roteiros LEFT JOIN envios e ON e.roteiro_id = roteiros.id
       WHERE dono_email = ? OR publico = 1 OR id IN (SELECT roteiro_id FROM compartilhamentos WHERE email = ?)
       ORDER BY atualizado_em DESC LIMIT 2000`,
    ),
    listaTudo: db.prepare(
      `SELECT id, dono_email, dono_nome, publico, meta, n_artes, atualizado_em, revisado_email, revisado_nome,
              EXISTS (SELECT 1 FROM compartilhamentos c WHERE c.roteiro_id = roteiros.id) AS compartilhado,
              COALESCE((SELECT pode_editar FROM compartilhamentos c WHERE c.roteiro_id = roteiros.id AND c.email = ?), 0) AS pode_editar,
              e.estado AS envio_estado, e.card_id AS envio_card, e.url AS envio_url, e.erro AS envio_erro, e.em AS envio_em, e.por_nome AS envio_por,
              EXISTS (SELECT 1 FROM originais o WHERE o.roteiro_id = roteiros.id) AS tem_original
       FROM roteiros LEFT JOIN envios e ON e.roteiro_id = roteiros.id
       ORDER BY atualizado_em DESC LIMIT 2000`,
    ),
    original: db.prepare('SELECT nome, tipo, dados, texto FROM originais WHERE roteiro_id = ?'),
    guardarTextoOriginal: db.prepare('UPDATE originais SET texto = ? WHERE roteiro_id = ?'),
    guardarOriginal: db.prepare('INSERT OR REPLACE INTO originais (roteiro_id, nome, tipo, dados, em) VALUES (?, ?, ?, ?, ?)'),
    infoOriginal: db.prepare('SELECT nome, tipo, length(dados) AS tamanho, em FROM originais WHERE roteiro_id = ?'),
    envio: db.prepare('SELECT estado, card_id, url, erro, avisos, em, por_nome FROM envios WHERE roteiro_id = ?'),
    guardarArtesNovas: db.prepare('UPDATE envios SET artes_novas = ?, atracao = ?, exibicao = ?, acervo_em = NULL WHERE roteiro_id = ?'),
    paraOAcervo: db.prepare("SELECT roteiro_id, card_id, artes_novas, atracao, exibicao FROM envios WHERE estado = 'enviado' AND artes_novas IS NOT NULL AND acervo_em IS NULL AND card_id IS NOT NULL"),
    noAcervo: db.prepare('UPDATE envios SET acervo_em = ? WHERE roteiro_id = ?'),
    marcarEnvio: db.prepare('INSERT OR REPLACE INTO envios (roteiro_id, estado, card_id, url, erro, avisos, em, por_email, por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    um: db.prepare('SELECT id, dono_email, dono_nome, publico, meta, doc, n_artes, revisao, origem, criado_em, atualizado_em, revisado_email, ydoc IS NOT NULL AS tem_ydoc FROM roteiros WHERE id = ?'),
    ydoc: db.prepare('SELECT ydoc FROM roteiros WHERE id = ?'),
    salvarYdoc: db.prepare('UPDATE roteiros SET ydoc = ? WHERE id = ?'),
    conteudo: db.prepare('UPDATE roteiros SET meta = ?, doc = ?, n_artes = ?, atualizado_em = ? WHERE id = ?'),
    revisou: db.prepare('UPDATE roteiros SET revisado_email = ?, revisado_nome = ? WHERE id = ?'),
    limparYdoc: db.prepare('UPDATE roteiros SET ydoc = NULL WHERE id = ?'),
    inserir: db.prepare(
      `INSERT INTO roteiros (id, dono_email, dono_nome, publico, meta, doc, n_artes, revisao, origem, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    atualizar: db.prepare('UPDATE roteiros SET publico = ?, meta = ?, doc = ?, n_artes = ?, revisao = ?, atualizado_em = ? WHERE id = ?'),
    apagar: db.prepare('DELETE FROM roteiros WHERE id = ?'),
    ultimaVersao: db.prepare('SELECT n, criado_em, meta, doc FROM versoes WHERE roteiro_id = ? ORDER BY n DESC LIMIT 1'),
    // o roteiro como foi importado: é dele que sai o PDF do card (a revisão não entra no anexo)
    primeiraVersao: db.prepare('SELECT meta, doc FROM versoes WHERE roteiro_id = ? ORDER BY n ASC LIMIT 1'),
    novaVersao: db.prepare('INSERT INTO versoes (roteiro_id, n, criado_em, por_email, por_nome, motivo, meta, doc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    versoes: db.prepare('SELECT n, criado_em, por_email, por_nome, motivo FROM versoes WHERE roteiro_id = ? ORDER BY n DESC LIMIT 200'),
    versao: db.prepare('SELECT * FROM versoes WHERE roteiro_id = ? AND n = ?'),
    verUsuario: db.prepare(
      `INSERT INTO usuarios (email, nome, visto_em) VALUES (?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET nome = excluded.nome, visto_em = excluded.visto_em`,
    ),
    usuarios: db.prepare('SELECT email, nome FROM usuarios WHERE email <> ? ORDER BY nome COLLATE NOCASE LIMIT 1000'),
    cores: db.prepare("SELECT email, cor FROM usuarios WHERE cor IS NOT NULL AND cor <> '' LIMIT 2000"),
    mudarCor: db.prepare('UPDATE usuarios SET cor = ? WHERE email = ?'),
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
  /** Copia os metadados para o documento compartilhado do roteiro (na memória, se a sala estiver aberta, ou no banco). */
  function metaNoYdoc(id, meta) {
    const sala = salas.get(id);
    let doc = sala?.doc;
    if (!doc) {
      const guardado = q.ydoc.get(id)?.ydoc;
      if (!guardado) return;
      doc = new Y.Doc();
      Y.applyUpdate(doc, guardado);
    }
    const m = doc.getMap('meta');
    if (!m.size) return; // sala que nunca recebeu metadados: o editor os preenche ao abrir
    doc.transact(() => {
      for (const [k, v] of Object.entries(meta)) if (JSON.stringify(m.get(k)) !== JSON.stringify(v)) m.set(k, v);
      for (const k of [...m.keys()]) if (!(k in meta)) m.delete(k);
    });
    if (!sala) q.salvarYdoc.run(Y.encodeStateAsUpdate(doc), id);
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
  // onde está o ponteiro de cada um: quem chega (ou reconecta) já vê quem está parado na tela, sem esperar que mexa
  const ultimosPonteiros = new Map(); // email → aviso
  cache.assinar(PONTEIROS, (dado) => {
    if (dado?.tipo !== 'ponteiro') return;
    if (dado.saiu) ultimosPonteiros.delete(dado.por);
    else ultimosPonteiros.set(dado.por, dado);
  });

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
        .publicar(PONTEIROS, fora ? { tipo: 'ponteiro', por: eu.email, nome: eu.nome, saiu: true } : { tipo: 'ponteiro', por: eu.email, nome: eu.nome, ancora: m.ancora.slice(0, 80), fx, fy, ...(m.parado === true ? { parado: true } : {}), ...(/^[a-z-]{1,24}$/.test(m.cursor ?? '') ? { cursor: m.cursor } : {}) })
        .catch(() => {});
    });
    // quem chega na fila já vê os ponteiros parados e quem está revisando o quê
    for (const aviso of ultimosPonteiros.values())
      if (aviso.por !== eu.email && ws.readyState === 1 && (aberto || !roteiroDoAviso(aviso) || acesso(roteiroDoAviso(aviso), eu).ler)) ws.send(JSON.stringify(aviso));
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
    // o arquivo que subiu, para baixar de novo
    ...(() => {
      const o = q.infoOriginal.get(l.id);
      return o ? { original: { nome: o.nome, tipo: o.tipo, tamanho: o.tamanho, em: o.em } } : {};
    })(),
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

  /** Envios em andamento, para o mesmo roteiro não virar dois cards. */
  const enviando = new Set();

  async function rotaDoTrello(req, res, eu, id, oque) {
    if (!ID_VALIDO.test(id)) return json(res, 400, { erro: 'Identificador inválido.' });
    const { linha: atual, editar: podeEditar, ler: podeLer } = acesso(id, eu);
    if (!atual || !podeLer) return json(res, 404, { erro: 'Roteiro não encontrado.' });

    if (oque === 'original' && req.method === 'GET') {
      // baixar o arquivo como subiu: quem lê o roteiro pode baixar
      const o = q.original.get(id);
      if (!o) return json(res, 404, { erro: 'O arquivo original deste roteiro não foi guardado.' });
      const ascii = o.nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      res.writeHead(200, {
        'content-type': o.tipo || 'application/octet-stream',
        'content-length': o.dados.length,
        'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(o.nome)}`,
        'cache-control': 'private, no-store',
      });
      return res.end(Buffer.from(o.dados));
    }
    if (oque === 'pdf') {
      // o roteiro em PDF, como vai para o card (para comparar com o que já está no Trello)
      if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
      const corpo = (await lerCorpo(req)) ?? {};
      const o = q.original.get(id);
      const artes = Array.isArray(corpo.artes) ? corpo.artes.slice(0, 200).map((a) => ({ texto: String(a?.texto ?? a ?? '').slice(0, 500), tipo: String(a?.tipo ?? '').slice(0, 40) })) : [];
      try {
        const v1 = q.primeiraVersao.get(id);
        const pdf = await trello.pdfDoRoteiro({ meta: JSON.parse(atual.meta), doc: JSON.parse(atual.doc), ...(v1 ? { docOriginal: JSON.parse(v1.doc), metaOriginal: JSON.parse(v1.meta) } : {}), ...(o?.texto ? { textoOriginal: JSON.parse(o.texto) } : {}), original: o ? { nome: o.nome, tipo: o.tipo, dados: Buffer.from(o.dados) } : null }, artes);
        res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': pdf.dados.length, 'cache-control': 'private, no-store' });
        return res.end(Buffer.from(pdf.dados));
      } catch (e) {
        return json(res, 422, { erro: `Não consegui montar o PDF: ${e instanceof Error ? e.message : e}` });
      }
    }
    if (!podeEditar) return json(res, 403, { erro: 'Só quem pode editar o roteiro mexe no original e manda ele adiante.' });
    if (oque === 'original-texto') {
      if (req.method !== 'PUT') return json(res, 405, { erro: 'Método não permitido.' });
      const corpo = (await lerCorpo(req)) ?? {};
      const pars = Array.isArray(corpo.pars)
        ? corpo.pars.slice(0, 5000).map((par) => (Array.isArray(par) ? par.slice(0, 500).filter((r) => r && typeof r.t === 'string').map((r) => ({ t: r.t.slice(0, 5000), ...(r.u ? { u: 1 } : {}), ...(r.b ? { b: 1 } : {}), ...(r.i ? { i: 1 } : {}) })) : []))
        : null;
      if (!pars) return json(res, 400, { erro: 'Faltou o texto.' });
      if (!q.original.get(id)) return json(res, 404, { erro: 'O arquivo original deste roteiro não foi guardado.' });
      q.guardarTextoOriginal.run(JSON.stringify(pars), id);
      return json(res, 200, { ok: true });
    }
    if (oque === 'original') {
      if (req.method !== 'PUT') return json(res, 405, { erro: 'Método não permitido.' });
      const dados = await lerBinario(req, LIMITE_ORIGINAL);
      if (!dados.length) return json(res, 400, { erro: 'Arquivo vazio.' });
      let nome = 'roteiro';
      try {
        nome = decodeURIComponent(String(req.headers['x-arquivo'] || 'roteiro')).replace(/[\u0000-\u001f/\\]/g, '_').slice(0, 200);
      } catch {
        /* nome malformado: fica o padrão */
      }
      const tipo = String(req.headers['content-type'] || 'application/octet-stream').slice(0, 100);
      q.guardarOriginal.run(id, nome, tipo, dados, new Date().toISOString());
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET') {
      const e = q.envio.get(id);
      return json(res, 200, e ? { estado: e.estado, url: e.url, erro: e.erro, avisos: JSON.parse(e.avisos || '[]'), em: e.em, por: e.por_nome } : null);
    }
    if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
    const corpo = (await lerCorpo(req)) ?? {};
    // versão nova que substitui outra: o card que a anterior já tinha passa a ser desta
    if (typeof corpo.herdarDe === 'string') {
      if (!ID_VALIDO.test(corpo.herdarDe) || !acesso(corpo.herdarDe, eu).editar) return json(res, 404, { erro: 'Roteiro anterior não encontrado.' });
      const e = q.envio.get(corpo.herdarDe);
      if (e) q.marcarEnvio.run(id, e.estado, e.card_id, e.url, e.erro, e.avisos, e.em, null, e.por_nome);
      return json(res, 200, { herdado: !!e });
    }
    // "é o mesmo roteiro que já está na produção": liga ao card que já existe, sem mandar nada
    if (corpo.jaEsta && typeof corpo.jaEsta.card === 'string' && /^[0-9a-zA-Z]{8,32}$/.test(corpo.jaEsta.card)) {
      q.marcarEnvio.run(id, 'duplicado', corpo.jaEsta.card, `https://trello.com/c/${corpo.jaEsta.card}`, null, null, new Date().toISOString(), eu.email, eu.nome);
      avisarFila('alterado', id, eu);
      return json(res, 200, { estado: 'duplicado', url: `https://trello.com/c/${corpo.jaEsta.card}` });
    }
    if (!trello.ligado) return json(res, 503, { erro: 'O envio para o Trello não está configurado neste servidor.' });
    const antes = q.envio.get(id);
    if (antes?.estado === 'enviado' && !corpo.deNovo) return json(res, 409, { erro: 'Este roteiro já está no Trello.', url: antes.url });
    if (enviando.has(id)) return json(res, 409, { erro: 'Este roteiro já está sendo enviado.' });
    enviando.add(id);
    const agora = new Date().toISOString();
    q.marcarEnvio.run(id, 'enviando', null, null, null, null, agora, eu.email, eu.nome);
    avisarFila('alterado', id, eu);
    try {
      const o = q.original.get(id);
      const base = env.PROMEIRO_URL ? env.PROMEIRO_URL.replace(/\/+$/, '') : '';
      const v1 = q.primeiraVersao.get(id);
      const r = await trello.enviar({
        meta: JSON.parse(atual.meta),
        doc: JSON.parse(atual.doc),
        ...(v1 ? { docOriginal: JSON.parse(v1.doc), metaOriginal: JSON.parse(v1.meta) } : {}),
        ...(o?.texto ? { textoOriginal: JSON.parse(o.texto) } : {}),
        artes: Array.isArray(corpo.artes)
          ? corpo.artes.slice(0, 200).map((a) => (typeof a === 'string' ? a.slice(0, 500) : { texto: String(a?.texto ?? '').slice(0, 500), tipo: String(a?.tipo ?? '').slice(0, 40), existe: !!a?.existe }))
          : [],
        texto: typeof corpo.texto === 'string' ? corpo.texto.slice(0, 200_000) : '',
        original: o ? { nome: o.nome, tipo: o.tipo, dados: Buffer.from(o.dados) } : null,
        endereco: base ? `${base}/#/r/${id}` : '',
      });
      const estado = r.duplicado ? 'duplicado' : 'enviado';
      q.marcarEnvio.run(id, estado, r.card?.id ?? null, r.card?.url ?? null, null, JSON.stringify(r.avisos ?? []), new Date().toISOString(), eu.email, eu.nome);
      // o que entra no acervo da atração quando o card sair: só as artes novas (as que já existiam, não), com o tipo (sigla)
      if (estado === 'enviado' && Array.isArray(corpo.artes))
        q.guardarArtesNovas.run(JSON.stringify(corpo.artes.filter((a) => a && !a.existe).map((a) => ({ texto: String(a?.texto ?? a).slice(0, 500), tipos: (Array.isArray(a?.tipos) ? a.tipos : a?.tipo ? [a.tipo] : []).map((t) => String(t).slice(0, 40)).slice(0, 12) }))), String(JSON.parse(atual.meta).programa ?? '').slice(0, 200), String(JSON.parse(atual.meta).dataExibicao ?? '').slice(0, 10) || null, id);
      if (r.avisos?.length) console.warn(`[trello] ${id}: ${r.avisos.join(' · ')}`);
      return json(res, 200, { estado, url: r.card?.url, avisos: r.avisos ?? [] });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      console.error(`[trello] ${id}: ${erro}`);
      q.marcarEnvio.run(id, 'erro', null, null, erro.slice(0, 500), null, new Date().toISOString(), eu.email, eu.nome);
      return json(res, 422, { estado: 'erro', erro });
    } finally {
      enviando.delete(id);
      avisarFila('alterado', id, eu);
    }
  }

  let registrando = false;
  async function registrarNoAcervo(andamento) {
    if (registrando) return;
    registrando = true;
    try {
      for (const e of q.paraOAcervo.all()) {
        const a = andamento[e.roteiro_id];
        const saiu = a && (a.entregue || a.status.some((s) => /FINALIZADO/i.test(s)));
        if (!saiu || !e.atracao) continue;
        try {
          const n = await acervo.registrar({ atracao: e.atracao, data: e.exibicao, card: e.card_id, artes: JSON.parse(e.artes_novas) });
          q.noAcervo.run(new Date().toISOString(), e.roteiro_id);
          if (n) console.log(`[acervo] ${e.atracao}: ${n} ${n === 1 ? 'arte nova' : 'artes novas'} do card ${e.card_id}`);
        } catch (erro) {
          console.warn(`[acervo] não registrei o card ${e.card_id}: ${erro instanceof Error ? erro.message : erro}`);
        }
      }
    } finally {
      registrando = false;
    }
  }

  /** Cadastros de atrações, redatores e editores: todos cadastram; só CADASTRO_ADMINS removem. */
  async function rotaDosCadastros(req, res, eu, caminho) {
    const partes = caminho.split('/').slice(3); // [tipo, id, 'keys', keyId]
    const [tipo, id, sub, keyId] = partes;
    const REC = /^rec\w{1,40}$/;
    const singular = { atracoes: 'atracao', redatores: 'redator', editores: 'editor' }[tipo];
    try {
      if (!partes.length || !partes[0]) {
        if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
        const forcar = new URL(req.url, 'http://x').searchParams.has('renovar');
        return json(res, 200, { ...(await cadastros.ler(forcar)), podeApagar: cadastros.podeApagar(eu.email) });
      }
      if (!singular) return json(res, 404, { erro: 'Não encontrado.' });
      if (req.method === 'POST' && !id) {
        const corpo = (await lerCorpo(req)) ?? {};
        const feito =
          tipo === 'atracoes' ? await cadastros.novaAtracao(corpo) : tipo === 'redatores' ? await cadastros.novoRedator(corpo) : await cadastros.novoEditor(corpo);
        console.log(`[cadastros] ${eu.email} cadastrou ${singular}: ${feito.nome}`);
        return json(res, 200, feito);
      }
      if (id && !REC.test(id)) return json(res, 400, { erro: 'Identificador inválido.' });
      if (req.method === 'POST' && sub === 'keys' && !keyId && singular !== 'redator') {
        const corpo = (await lerCorpo(req)) ?? {};
        const feito = await cadastros.novaKey(singular, id, corpo.key);
        console.log(`[cadastros] ${eu.email} deu a key ${feito.key} para ${id}`);
        return json(res, 200, feito);
      }
      if (req.method === 'DELETE') {
        if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores removem cadastros.' });
        if (sub === 'keys') {
          if (!REC.test(keyId ?? '') || singular === 'redator') return json(res, 400, { erro: 'Identificador inválido.' });
          await cadastros.remover(singular === 'atracao' ? 'keyAtracao' : 'keyEditor', keyId);
        } else await cadastros.remover(singular, id);
        console.log(`[cadastros] ${eu.email} removeu ${sub === 'keys' ? `a key ${keyId}` : `${singular} ${id}`}`);
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { erro: 'Método não permitido.' });
    } catch (e) {
      return json(res, e.status && e.status < 600 ? e.status : 422, { erro: e instanceof Error ? e.message : 'Não consegui falar com o Teable.' });
    }
  }

  async function api(req, res, caminho) {
    const eu = await identificar(req, env);
    if (caminho === '/api/eu') {
      if (eu) {
        // quem entra passa a constar na lista de pessoas com quem se pode compartilhar
        q.verUsuario.run(eu.email, eu.nome, new Date().toISOString());
        return json(res, 200, { ...eu, trello: trello.ligado });
      }
      // sem login na porta: o navegador pode se apresentar com o perfil local, se a demonstração permitir
      return json(res, 200, { email: null, perfilLocal: env.PERFIL_LOCAL === '1' });
    }
    if (caminho === '/api/diagnostico') {
      // para conferir de fora, direto no navegador (o domínio já fica atrás do Cloudflare Access; aqui não há
      // segredo, só contagens e nomes de tabela): a versão no ar, a lista de atrações e a busca de uma claquete
      const claquete = (new URL(req.url, 'http://x').searchParams.get('claquete') ?? 'CHEF(MANUT) C').slice(0, 200);
      // &renovar=1: lê o Teable agora, sem o cache (para descartar uma lista velha guardada)
      const voc = new URL(req.url, 'http://x').searchParams.get('renovar') ? await vocabulario.renovar() : await vocabulario.ler();
      // a mesma regra do navegador: a key no começo da claquete (sem acento, pontuação vira espaço)
      const normal = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const n = normal(claquete);
      const naLista = (voc.programas ?? [])
        .filter((p) => (p.chaves ?? []).some((c) => n === normal(c) || n.startsWith(normal(c) + ' ')))
        .map((p) => ({ nome: p.nome, chaves: p.chaves }));
      let compilado = null;
      try {
        compilado = estaticos ? (await import('node:fs')).statSync(join(estaticos, 'index.html')).mtime.toISOString() : null;
      } catch {}
      return json(res, 200, {
        compilado,
        vocabulario: vocabulario.estado?.() ?? null,
        // o que o navegador acharia com a lista que recebe (vazio aqui = a lista não tem a key desta claquete)
        naListaDoNavegador: naLista,
        exemplo: (voc.programas ?? []).filter((p) => /chef|eliana/i.test(p.nome)).map((p) => ({ nome: p.nome, chaves: p.chaves })),
        atracao: trello.diagnosticarAtracao ? await trello.diagnosticarAtracao(claquete) : null,
        postgres: { esquema: env.TEABLE_PG_ESQUEMA || '', atracoes: env.TEABLE_PG_ATRACOES || '', url: env.TEABLE_PG_URL ? 'configurada' : 'faltando' },
      });
    }
    if (!eu) return json(res, 401, { erro: 'Entre com a sua conta para ver os roteiros.' });

    if (caminho === '/api/usuarios') return json(res, 200, q.usuarios.all(eu.email));
    if (caminho === '/api/cores') return json(res, 200, q.cores.all());
    if (caminho === '/api/eu/cor') {
      if (req.method !== 'PUT') return json(res, 405, { erro: 'Método não permitido.' });
      const cor = String((await lerCorpo(req))?.cor ?? '').toLowerCase();
      if (cor && !/^#[0-9a-f]{6}$/.test(cor)) return json(res, 400, { erro: 'Cor inválida.' });
      q.verUsuario.run(eu.email, eu.nome, new Date().toISOString());
      q.mudarCor.run(cor || null, eu.email);
      // os colegas com a fila aberta passam a ver a cor nova na hora
      void cache.publicar(FILA, { tipo: 'cor', por: eu.email, cor }).catch(() => {});
      return json(res, 200, { ok: true, cor });
    }
    if (caminho === '/api/vocabulario') return json(res, 200, await vocabulario.ler());
    if (caminho === '/api/producao/pdf') {
      // o PDF anexado ao card que já está na produção da arte (baixado do Trello só quando alguém compara)
      const claquete = (new URL(req.url, 'http://x').searchParams.get('claquete') ?? '').slice(0, 200);
      try {
        const pdf = await trello.pdfDaProducao(claquete);
        if (!pdf) return json(res, 404, { erro: 'O card não tem o roteiro em PDF.' });
        res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': pdf.dados.length, 'cache-control': 'private, max-age=300' });
        return res.end(pdf.dados);
      } catch (e) {
        console.warn(`[producao] PDF: ${e instanceof Error ? e.message : e}`);
        return json(res, 422, { erro: 'Não consegui baixar o PDF do card.' });
      }
    }
    if (caminho === '/api/atracao') {
      // a atração pela claquete, direto das keys do Teable: para quando a lista do navegador não reconhece
      const claquete = (new URL(req.url, 'http://x').searchParams.get('claquete') ?? '').slice(0, 200);
      return json(res, 200, { atracao: claquete && trello.atracaoDaClaquete ? await trello.atracaoDaClaquete(claquete) : '' });
    }
    if (caminho === '/api/producao') {
      // a claquete já está na produção da arte? (para perguntar se o roteiro novo é uma v2)
      const claquete = (new URL(req.url, 'http://x').searchParams.get('claquete') ?? '').slice(0, 200);
      return json(res, 200, await trello.naProducao(claquete).catch((e) => (console.warn(`[producao] ${e instanceof Error ? e.message : e}`), null)));
    }
    if (caminho === '/api/acervo') {
      // as artes que a atração já tem prontas (as do acervo), para marcar na revisão; numa sessão, as do filme do dia
      const busca = new URL(req.url, 'http://x').searchParams;
      const atracao = (busca.get('atracao') ?? '').slice(0, 200);
      const data = (busca.get('data') ?? '').slice(0, 10);
      if (!acervo.ligado) return json(res, 200, { ligado: false, artes: [] });
      return json(res, 200, { ligado: true, podeZerar: cadastros.podeApagar(eu.email), artes: await acervo.paraRevisao(atracao, data).catch((e) => (console.warn(`[acervo] ${e instanceof Error ? e.message : e}`), [])) });
    }
    if (caminho === '/api/acervo/zerar') {
      // pacote gráfico novo: as artes da atração deixam de valer. Só administradores (CADASTRO_ADMINS).
      if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
      if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores trocam o pacote gráfico.' });
      const corpo = (await lerCorpo(req)) ?? {};
      if (typeof corpo.atracao !== 'string' || !corpo.atracao.trim()) return json(res, 400, { erro: 'Qual atração?' });
      try {
        const n = await acervo.zerar(corpo.atracao.trim());
        console.log(`[acervo] ${eu.email} trocou o pacote gráfico de ${corpo.atracao}: ${n} artes deixaram de valer`);
        return json(res, 200, { zeradas: n });
      } catch (e) {
        return json(res, 422, { erro: e instanceof Error ? e.message : String(e) });
      }
    }
    if (caminho === '/api/andamento') {
      // como anda, na produção da arte, o que já foi para o Trello (só dos roteiros que a pessoa vê)
      const linhas = (aberto ? q.listaTudo.all(eu.email) : q.lista.all(eu.email, eu.email, eu.email)).filter((l) => l.envio_estado === 'enviado' || l.envio_estado === 'duplicado');
      const dados = await trello.andamento(linhas.map((l) => ({ id: l.id, card: l.envio_card, claquete: JSON.parse(l.meta).claquete ?? '' })));
      // card que saiu (finalizado ou entregue): as artes novas dele entram no acervo da atração, uma vez só
      if (acervo.ligado && acervo.grava) void registrarNoAcervo(dados);
      return json(res, 200, dados);
    }
    if (caminho === '/api/cadastros' || caminho.startsWith('/api/cadastros/')) return rotaDosCadastros(req, res, eu, caminho);
    if (caminho === '/api/pauta') return json(res, 200, await pauta.achar(new URL(req.url, 'http://x').searchParams.get('chave')));

    const extra = /^\/api\/roteiros\/([^/]+)\/(original|original-texto|trello|pdf)$/.exec(caminho);
    if (extra) return rotaDoTrello(req, res, eu, extra[1], extra[2]);
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
          ...(l.envio_estado ? { trello: { estado: l.envio_estado, url: l.envio_url ?? undefined, erro: l.envio_erro ?? undefined, em: l.envio_em, por: l.envio_por ?? undefined } } : {}),
          temOriginal: !!l.tem_original,
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
        // texto trocado por fora da edição simultânea (versão nova do arquivo): o estado guardado da sala
        // ficaria por cima dele na próxima abertura; sem ninguém na sala, ele é descartado
        if (atual && motivo === 'substituiu a versão anterior' && !salas.get(id)?.conexoes.size) q.limparYdoc.run(id);
        // metadados mudados por fora do editor (atração reconhecida num cadastro, "manter as duas"): sem ninguém
        // na sala, o estado guardado dela recebe a mudança, senão a próxima abertura traria os valores antigos de volta
        else if (atual && atual.meta !== meta && !salas.get(id)?.conexoes.size) metaNoYdoc(id, r.meta);
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
    await trello.parar();
    await acervo.parar?.();
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
