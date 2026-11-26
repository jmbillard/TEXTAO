// Servidor do PROMeiro: API + arquivos estáticos, com SQLite (node:sqlite, sem dependências).
// Cada roteiro pertence a um e-mail. Só o dono vê e edita; se marcar como público, os outros leem.
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { randomUUID, webcrypto } from 'node:crypto';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as sinc from 'y-protocols/sync';
import * as presenca from 'y-protocols/awareness';
import * as cod from 'lib0/encoding';
import * as dec from 'lib0/decoding';
import { criarVocabulario } from './vocabulario.mjs';
import { criarPauta } from './pauta.mjs';
import { criarCache } from './cache.mjs';
import { chaveDaAtracao, criarTrello, nivelDeComplexidade } from './trello.mjs';
import { criarCadastros } from './cadastros.mjs';
import { criarAcervo } from './acervo.mjs';
import { escolhasDoPedido, regrasDasDecisoes } from './importacao-do-acervo.mjs';
import { criarImportacoes, criarTabelaDasImportacoes } from './importacoes.mjs';
import { criarRegrasDaAtracao, criarTabelaDasRegras } from './regras-da-atracao.mjs';
import { criarRedatorProvavel } from './redator.mjs';
import { criarFilmes } from './filmes.mjs';
import { ehSessaoDaTarde } from './exibicao.mjs';
// a chave da claquete é a do navegador (a mesma da "versão nova" na fila): o módulo é lido pelo Node sem os tipos
import { chaveDaClaquete } from '../src/modelo/vocabularios.ts';
import { acertarNArtesUmaVez } from './artes.mjs';

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
// uma página da prévia: a imagem, o PDF e os recortes dos pôsteres, em base64
const LIMITE_PAGINA = 24 * 1024 * 1024;
const ID_VALIDO = /^[\w-]{6,80}$/;
/** O roteiro de exemplo do tour da revisão vive só no navegador: um id com este prefixo nunca é gravado nem vai ao Trello. */
const PREFIXO_DO_TOUR = 'tour-';
const RECUSA_DO_TOUR = { erro: 'Este é o roteiro de exemplo do tour: ele não é gravado nem vai ao Trello.' };

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
  // quando a pessoa viu o tour da revisão (terminou, pulou ou disse "Agora não"); vazio = ainda não viu
  if (!tem('usuarios', 'tour_revisao_em')) db.exec('ALTER TABLE usuarios ADD COLUMN tour_revisao_em TEXT');
  if (!tem('roteiros', 'revisado_email')) db.exec('ALTER TABLE roteiros ADD COLUMN revisado_email TEXT; ALTER TABLE roteiros ADD COLUMN revisado_nome TEXT');
  // acervo de artes: as artes novas de cada envio e a atração, para entrarem no acervo quando o card sair
  // o texto do original com o sublinhado do redator, trecho a trecho: é dele que sai o PDF do card sem o Stirling
  if (!tem('originais', 'texto')) db.exec('ALTER TABLE originais ADD COLUMN texto TEXT');
  if (!tem('envios', 'artes_novas')) db.exec('ALTER TABLE envios ADD COLUMN artes_novas TEXT; ALTER TABLE envios ADD COLUMN atracao TEXT; ALTER TABLE envios ADD COLUMN acervo_em TEXT');
  // a data de exibição: numa sessão de filme, é ela que diz qual filme (pelo log do bot)
  if (!tem('envios', 'exibicao')) db.exec('ALTER TABLE envios ADD COLUMN exibicao TEXT');
  // keys que alguém marcou como "não é atração" na aba Sem cadastro: não voltam para a lista
  db.exec('CREATE TABLE IF NOT EXISTS keys_ignoradas (key TEXT PRIMARY KEY, por TEXT, em TEXT)');
  // cards de filme cujas artes já foram para o acervo do filme (uma vez só, como os roteiros); o card da semana da
  // Sessão da Tarde vai uma vez por filme: a chave é "card|filme"
  db.exec('CREATE TABLE IF NOT EXISTS filmes_no_acervo (card TEXT PRIMARY KEY, em TEXT)');
  // a lápide do roteiro apagado: quem abre o link dele fica sabendo o que houve. "leitores" são os e-mails que podiam
  // ler o roteiro (o dono e quem recebeu): no modo privado, só eles (ou todos, se era público) veem a lápide
  db.exec(`CREATE TABLE IF NOT EXISTS apagados (
    id TEXT PRIMARY KEY, claquete TEXT NOT NULL, por_nome TEXT NOT NULL, por_email TEXT NOT NULL, em TEXT NOT NULL,
    publico INTEGER NOT NULL DEFAULT 0, leitores TEXT NOT NULL DEFAULT '[]'
  )`);
  // o histórico das importações do acervo por CSV, para desfazer e retomar (#61)
  criarTabelaDasImportacoes(db);
  // as regras desta atração: as decisões da conferência lembradas para as próximas importações (#63)
  criarTabelaDasRegras(db);
  // a conta das artes pela lista sem repetição, uma vez: os roteiros guardados antes dela contavam as repetidas
  acertarNArtesUmaVez(db);
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

/** Para o diagnóstico: por que o login do Cloudflare Access foi aceito ou recusado (sem expor o token). */
async function diagnosticarLogin(req, env) {
  const h = req.headers;
  const token = h['cf-access-jwt-assertion'] ? String(h['cf-access-jwt-assertion']) : '';
  const d = {
    modo: env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD ? 'Access com assinatura (ACCESS_TEAM_DOMAIN + ACCESS_AUD)' : h['cf-access-authenticated-user-email'] ? 'cabeçalho do Access' : env.PERFIL_LOCAL === '1' ? 'perfil local' : 'nenhum',
    ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN || '(vazia)',
    ACCESS_AUD: env.ACCESS_AUD ? `${String(env.ACCESS_AUD).slice(0, 8)}… (${String(env.ACCESS_AUD).length} caracteres)` : '(vazia)',
    PERFIL_LOCAL: env.PERFIL_LOCAL ?? '(vazia)',
    recebeuToken: !!token,
    recebeuEmailDoAccess: !!h['cf-access-authenticated-user-email'],
  };
  if (token) {
    try {
      const corpo = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url'));
      const auds = [].concat(corpo.aud ?? []);
      Object.assign(d, {
        tokenEmissor: corpo.iss ?? '',
        tokenAud: auds.map((x) => `${String(x).slice(0, 8)}…`),
        audBate: !!env.ACCESS_AUD && auds.includes(env.ACCESS_AUD),
        dominioBate: !!env.ACCESS_TEAM_DOMAIN && String(corpo.iss ?? '').includes(String(env.ACCESS_TEAM_DOMAIN).replace(/^https?:\/\//, '').replace(/\/+$/, '')),
        expirado: corpo.exp * 1000 < Date.now(),
      });
    } catch {
      d.token = 'não consegui ler o token';
    }
  }
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && token) {
    try {
      d.assinatura = (await validarJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD)) ? 'aceita' : 'recusada (aud, validade ou chave)';
    } catch (e) {
      d.assinatura = `erro ao conferir: ${e instanceof Error ? e.message : e}`;
    }
  }
  d.reconhecido = (await identificar(req, env))?.email ?? null;
  return d;
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

/* ---------- keys sem cadastro ---------- */

const semAcentoMin = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * A atração que a claquete reconhece pelas keys dos cadastros, com a regra do navegador (`acharPrograma`): a key mais
 * longa no começo (também depois da praça do Rio na frente); sem key, o nome da atração (8 letras ou mais) no meio.
 * @param programas [{ nome, chaves }]  @returns o nome, ou '' se nenhuma reconhece
 */
export function atracaoPelaClaquete(claquete, programas) {
  const n = semAcentoMin(claquete);
  if (!n) return '';
  const comeco = [n, n.replace(/^rio /, '')];
  let melhor = null;
  for (const p of programas)
    for (const c of (p.chaves ?? []).map(semAcentoMin).filter(Boolean))
      if (comeco.some((x) => x === c || x.startsWith(c + ' ')) && (!melhor || c.length > melhor.tam)) melhor = { nome: p.nome, tam: c.length };
  if (melhor) return melhor.nome;
  for (const p of programas) {
    const nome = semAcentoMin(p.nome);
    if (nome.length >= 8 && ` ${n} `.includes(` ${nome} `) && (!melhor || nome.length > melhor.tam)) melhor = { nome: p.nome, tam: nome.length };
  }
  return melhor?.nome ?? '';
}

/**
 * As keys das claquetes que nenhuma atração reconhece (a mesma regra do navegador: key no começo; senão, o nome
 * da atração no meio), com quantos roteiros, até dois exemplos e uma atração parecida, se houver.
 * @param claquetes [{ claquete, em }]  @param programas [{ nome, chaves }]  @param ignoradas Set de keys
 */
/** A atração parecida com a key: a key (sem espaços) tem um bom pedaço em comum com o nome, ou uma palavra da key
    começa uma do nome. Vazio quando nenhuma chega perto. */
export function sugerirAtracao(key, programas) {
  const k = semAcentoMin(key);
  const kJunto = k.replace(/ /g, '');
  let melhor = null;
  for (const p of programas) {
    const n = semAcentoMin(p.nome);
    const nJunto = n.replace(/ /g, '');
    let comum = 0;
    for (let i = 0; i < kJunto.length; i++) for (let j = i + comum + 1; j <= kJunto.length; j++) if (nJunto.includes(kJunto.slice(i, j))) comum = j - i;
    const porPalavra = k.split(' ').some((w) => w.length >= 4 && n.split(' ').some((x) => x.startsWith(w)));
    const nota = Math.max(comum / Math.max(4, kJunto.length), porPalavra ? 0.75 : 0);
    if (nota >= 0.7 && (!melhor || nota > melhor.nota)) melhor = { nome: p.nome, nota };
  }
  return melhor?.nome ?? '';
}

export function keysSemCadastro(claquetes, programas, ignoradas = new Set()) {
  return semCadastro(claquetes, programas, ignoradas).keys;
}

/** Quantas claquetes reconhecidas a amostra leva (as mais recentes): as tiras da comemoração do Sem cadastro zerado. */
const AMOSTRA_RECONHECIDAS = 20;

/**
 * O Sem cadastro inteiro: as keys sem atração (keysSemCadastro) e as claquetes que têm atração, contadas uma vez
 * cada (a mesma claquete na fila e na produção conta uma vez, com a data mais recente). As claquetes das keys
 * ignoradas não são de nenhuma atração: ficam fora das duas.
 * @returns {{ keys: object[], reconhecidas: { total: number, amostra: string[] } }}
 */
export function semCadastro(claquetes, programas, ignoradas = new Set()) {
  const lista = programas.map((p) => ({ nome: p.nome, n: semAcentoMin(p.nome), chaves: (p.chaves ?? []).map(semAcentoMin).filter(Boolean) }));
  // compara a claquete inteira e também a key dela (sem a praça na frente: "Rio Fut(...)" → FUT)
  const reconhece = (claquete) => {
    const n = semAcentoMin(claquete);
    const k = semAcentoMin(chaveDaAtracao(claquete));
    const comeca = (x, c) => !!x && (x === c || x.startsWith(c + ' '));
    return lista.some((p) => p.chaves.some((c) => comeca(n, c) || comeca(k, c)) || (p.n.length >= 8 && ` ${n} `.includes(` ${p.n} `)));
  };
  const grupos = new Map();
  const reconhecidas = new Map();
  for (const { claquete, em } of claquetes) {
    const c = claquete.trim();
    if (reconhece(claquete)) {
      if (c && (!reconhecidas.has(c) || reconhecidas.get(c) < em)) reconhecidas.set(c, em);
      continue;
    }
    const key = semAcentoMin(chaveDaAtracao(claquete)).toUpperCase();
    if (!key || key.length < 2 || /^[\d ]+$/.test(key) || ignoradas.has(key)) continue;
    const g = grupos.get(key) ?? { key, claquetes: new Map() };
    if (!g.claquetes.has(c) || g.claquetes.get(c) < em) g.claquetes.set(c, em);
    grupos.set(key, g);
  }
  const maisNovas = (m) => [...m].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
  const parecida = (key) => sugerirAtracao(key, programas);
  const keys = [...grupos.values()]
    .map((g) => {
      const ordem = maisNovas(g.claquetes);
      return { key: g.key, roteiros: ordem.length, exemplos: ordem.slice(0, 2).map(([c]) => c), sugestao: parecida(g.key) };
    })
    .sort((a, b) => b.roteiros - a.roteiros || a.key.localeCompare(b.key));
  return { keys, reconhecidas: { total: reconhecidas.size, amostra: maisNovas(reconhecidas).slice(0, AMOSTRA_RECONHECIDAS).map(([c]) => c) } };
}

/* ---------- utilidades HTTP ---------- */

const json = (res, status, corpo) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(corpo));
};
/** Corpo JSON. Grande demais: o resto é lido e descartado, sem derrubar a conexão, para a resposta 413 chegar. */
const lerCorpo = (req, LIMITE = LIMITE_CORPO, oQue = 'Roteiro') =>
  new Promise((ok, erro) => {
    const grandeDemais = () => Object.assign(new Error(`${oQue} grande demais para guardar (até ${Math.round(LIMITE / 1048576)} MB).`), { status: 413 });
    if (Number(req.headers['content-length']) > LIMITE) {
      req.resume();
      return erro(grandeDemais());
    }
    const partes = [];
    let total = 0;
    req.on('data', (p) => {
      total += p.length;
      if (total <= LIMITE) partes.push(p);
    });
    req.on('end', () => {
      if (total > LIMITE) return erro(grandeDemais());
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

/**
 * Copia os metadados para o mapa "meta" do documento compartilhado do roteiro. Devolve false, sem mexer, quando o
 * documento nunca recebeu metadados (o editor os preenche ao abrir).
 */
export function copiarMetaParaYdoc(doc, meta) {
  const m = doc.getMap('meta');
  if (!m.size) return false;
  doc.transact(() => {
    for (const [k, v] of Object.entries(meta)) if (JSON.stringify(m.get(k)) !== JSON.stringify(v)) m.set(k, v);
    for (const k of [...m.keys()]) if (!(k in meta)) m.delete(k);
  });
  return true;
}

/* ---------- aplicação ---------- */

export function criarApp({ db, env = process.env, estaticos = null, cache = criarCache(env), trello = criarTrello(env), cadastros = null, acervo = criarAcervo(env, { artesDoCard: (card) => trello.artesDoCard?.(card) ?? [] }), filmes = criarFilmes(env, { db, pasta: env.FILMES_PASTA, trello }), redatorProvavel = criarRedatorProvavel(env) }) {
  // cópia local do Teable: o que foi lido por último continua valendo com ele fora do ar, mesmo depois de reiniciar
  const importacoes = criarImportacoes(db);
  const regrasDaAtracao = criarRegrasDaAtracao(db);
  // as importações que estão sendo desfeitas ou retomadas agora (o segundo clique espera o primeiro)
  const mexendoNaImportacao = new Set();
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
    paraOAcervo: db.prepare(
      `SELECT e.roteiro_id, e.card_id, e.artes_novas, e.atracao, e.exibicao, json_extract(r.meta, '$.claquete') AS claquete
       FROM envios e LEFT JOIN roteiros r ON r.id = e.roteiro_id
       WHERE e.estado = 'enviado' AND e.artes_novas IS NOT NULL AND e.acervo_em IS NULL AND e.card_id IS NOT NULL`,
    ),
    noAcervo: db.prepare('UPDATE envios SET acervo_em = ?, atracao = ? WHERE roteiro_id = ?'),
    marcarEnvio: db.prepare('INSERT OR REPLACE INTO envios (roteiro_id, estado, card_id, url, erro, avisos, em, por_email, por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    claquetesDaFila: db.prepare("SELECT json_extract(meta, '$.claquete') AS claquete, atualizado_em AS em FROM roteiros WHERE atualizado_em >= ?"),
    ignoradas: db.prepare('SELECT key FROM keys_ignoradas'),
    filmeNoAcervo: db.prepare('SELECT 1 FROM filmes_no_acervo WHERE card = ?'),
    filmeFoiAoAcervo: db.prepare('INSERT OR IGNORE INTO filmes_no_acervo (card, em) VALUES (?, ?)'),
    ignorar: db.prepare('INSERT OR REPLACE INTO keys_ignoradas (key, por, em) VALUES (?, ?, ?)'),
    designorar: db.prepare('DELETE FROM keys_ignoradas WHERE key = ?'),
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
    gravarLapide: db.prepare('INSERT OR REPLACE INTO apagados (id, claquete, por_nome, por_email, em, publico, leitores) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    lapide: db.prepare('SELECT claquete, por_nome, por_email, em, publico, leitores FROM apagados WHERE id = ?'),
    vivosDesde: db.prepare("SELECT id, json_extract(meta, '$.claquete') AS claquete FROM roteiros WHERE atualizado_em >= ? ORDER BY atualizado_em DESC"),
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
    tourDe: db.prepare('SELECT tour_revisao_em FROM usuarios WHERE email = ?'),
    viuTour: db.prepare('UPDATE usuarios SET tour_revisao_em = ? WHERE email = ?'),
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
    if (copiarMetaParaYdoc(doc, meta) && !sala) q.salvarYdoc.run(Y.encodeStateAsUpdate(doc), id);
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
    // erro de protocolo (mensagem grande demais, quadro inválido): só esta conexão cai, o servidor continua
    ws.on('error', (e) => console.warn(`[fila] conexão de ${eu.email} encerrada: ${e.message}`));
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

  // uma mensagem de edição simultânea nunca chega perto disso (o roteiro inteiro cabe em 2 MB); acima, a conexão fecha
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
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
    ws.on('error', (e) => console.warn(`[colab] ${id}: conexão de ${eu.email} encerrada: ${e.message}`));
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

  /** O link de um roteiro que não existe mais: 410 com a lápide (a claquete, quem apagou, quando e, se houver, a
      versão nova), para quem podia lê-lo; 404 para os outros e para o que nunca existiu. */
  function lapide(res, id, eu) {
    const l = q.lapide.get(id);
    const podia = l && (aberto || l.publico || l.por_email === eu.email || JSON.parse(l.leitores).includes(eu.email));
    if (!podia) return json(res, 404, { erro: 'Roteiro não encontrado.' });
    // a versão nova: o roteiro vivo (e legível) com a mesma chave da claquete, dos últimos 3 meses, como na fila
    const chave = chaveDaClaquete(l.claquete);
    const limite = new Date(Date.now() - 92 * 86_400_000).toISOString();
    const substituto = chave ? q.vivosDesde.all(limite).find((r) => r.id !== id && chaveDaClaquete(r.claquete ?? '') === chave && acesso(r.id, eu).ler)?.id : undefined;
    return json(res, 410, { claquete: l.claquete, por: l.por_nome, em: l.em, ...(substituto ? { substituto } : {}) });
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
          ? corpo.artes.slice(0, 200).map((a) => (typeof a === 'string' ? a.slice(0, 500) : { texto: String(a?.texto ?? '').slice(0, 500), tipo: String(a?.tipo ?? '').slice(0, 40), existe: !!a?.existe, complexidade: nivelDeComplexidade(a?.complexidade) }))
          : [],
        texto: typeof corpo.texto === 'string' ? corpo.texto.slice(0, 200_000) : '',
        original: o ? { nome: o.nome, tipo: o.tipo, dados: Buffer.from(o.dados) } : null,
        endereco: base ? `${base}/#/r/${id}` : '',
      });
      const estado = r.duplicado ? 'duplicado' : 'enviado';
      q.marcarEnvio.run(id, estado, r.card?.id ?? null, r.card?.url ?? null, null, JSON.stringify(r.avisos ?? []), new Date().toISOString(), eu.email, eu.nome);
      // o que entra no acervo da atração quando o card sair: só as artes novas (as que já existiam, não), com o tipo (sigla)
      // e a complexidade (1–3; a sem marca, 1)
      if (estado === 'enviado' && Array.isArray(corpo.artes))
        q.guardarArtesNovas.run(JSON.stringify(corpo.artes.filter((a) => a && !a.existe).map((a) => ({ texto: String(a?.texto ?? a).slice(0, 500), tipos: (Array.isArray(a?.tipos) ? a.tipos : a?.tipo ? [a.tipo] : []).map((t) => String(t).slice(0, 40)).slice(0, 12), complexidade: nivelDeComplexidade(a?.complexidade) }))), String(JSON.parse(atual.meta).programa ?? '').slice(0, 200), String(JSON.parse(atual.meta).dataExibicao ?? '').slice(0, 10) || null, id);
      // as que quem revisa confirmou que já existem (✓) entram no acervo da atração agora (ou no do filme do dia, numa
      // sessão): da próxima vez que ela pedir a mesma arte, já vem riscada. As que já estavam lá não repetem
      if (estado === 'enviado' && Array.isArray(corpo.artes) && acervo.ligado && acervo.grava) {
        const metaAtual = JSON.parse(atual.meta);
        const existentes = corpo.artes
          .filter((a) => a && typeof a === 'object' && a.existe && String(a.texto ?? '').trim())
          .map((a) => ({ texto: String(a.texto).slice(0, 500), tipos: (Array.isArray(a.tipos) ? a.tipos : a.tipo ? [a.tipo] : []).map((t) => String(t).slice(0, 40)).filter(Boolean).slice(0, 12) }));
        if (existentes.length)
          void acervo
            .registrar({ atracao: String(metaAtual.programa ?? ''), data: String(metaAtual.dataExibicao ?? '').slice(0, 10), artes: existentes })
            .then((n) => n && console.log(`[acervo] ${metaAtual.programa}: ${n} ${n === 1 ? 'arte confirmada' : 'artes confirmadas'} na revisão`))
            .catch((e) => console.warn(`[acervo] não guardei as confirmadas de ${id}: ${e instanceof Error ? e.message : e}`));
      }
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

  /** Card de filme que saiu (finalizado ou entregue): as artes dele entram no acervo do filme, uma vez só. */
  let registrandoFilmes = false;
  // pôsteres: o Teable dá um link temporário; o app guarda a imagem por algumas horas (e o "não tem" por 10 min)
  const posteres = new Map();
  async function posterDoFilme(id) {
    const base = (env.TEABLE_URL || '').replace(/\/+$/, '');
    if (!base || !env.TEABLE_FILMES || !env.TEABLE_TOKEN) return null;
    const guardado = posteres.get(id);
    if (guardado && Date.now() - guardado.em < (guardado.img ? 6 * 3600e3 : 600e3)) return guardado.img;
    let img = null;
    try {
      const r = await fetch(`${base}/api/table/${encodeURIComponent(env.TEABLE_FILMES)}/record/${id}?fieldKeyType=name`, { headers: { authorization: `Bearer ${env.TEABLE_TOKEN}` }, signal: AbortSignal.timeout(8000) });
      const anexo = r.ok ? (await r.json())?.fields?.poster?.[0] : null;
      const url = anexo?.presignedUrl ? new URL(anexo.presignedUrl, base).toString() : '';
      if (url && /^image\//.test(anexo.mimetype ?? 'image/')) {
        const f = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (f.ok) img = { tipo: f.headers.get('content-type') || anexo.mimetype || 'image/jpeg', dados: Buffer.from(await f.arrayBuffer()) };
      }
    } catch (e) {
      console.warn(`[pôster] ${id}: ${e instanceof Error ? e.message : e}`);
    }
    if (posteres.size > 400) posteres.delete(posteres.keys().next().value);
    posteres.set(id, { img, em: Date.now() });
    return img;
  }

  async function filmesNoAcervo(filmes) {
    if (registrandoFilmes || !acervo.ligado || !acervo.grava) return;
    registrandoFilmes = true;
    try {
      for (const f of filmes) {
        const saiu = f.entregue || f.status.some((s) => /FINALIZADO/i.test(s));
        // o card da semana da Sessão da Tarde junta vários filmes: o registro é por filme (card + filme), não por card.
        // A exibição da Sessão da Tarde sem artes (a do n8n) tem uma arte só: o título do filme
        const daTarde = ehSessaoDaTarde(f.sessao);
        const artes = daTarde && !f.artes.length && !f.existentes?.length && f.titulo ? [String(f.titulo).toUpperCase()] : f.artes;
        const chave = daTarde ? `${f.card}|${f.filme}` : f.card;
        if (!saiu || !f.card || !artes.length || (daTarde && !f.filme) || q.filmeNoAcervo.get(chave)) continue;
        try {
          const n = await acervo.registrar({ atracao: f.sessao, data: f.data, card: f.card, artes });
          q.filmeFoiAoAcervo.run(chave, new Date().toISOString());
          if (n) console.log(`[acervo] ${f.titulo}: ${n} ${n === 1 ? 'arte nova' : 'artes novas'} do card ${f.card}`);
        } catch (erro) {
          console.warn(`[acervo] não registrei o filme ${f.titulo}: ${erro instanceof Error ? erro.message : erro}`);
        }
      }
    } finally {
      registrandoFilmes = false;
    }
  }
  // os cards de filme que saíram (finalizados ou entregues) levam as artes ao acervo do filme. A fila não mostra mais
  // os filmes (ela é a revisão dos roteiros), então o servidor confere sozinho: 1 min depois de subir e de 10 em 10 min
  if (trello.filmesProximos && acervo.ligado && acervo.grava) {
    const conferirFilmes = () =>
      void trello.filmesProximos(14).then(filmesNoAcervo).catch((e) => console.warn(`[filmes] ${e instanceof Error ? e.message : e}`));
    setTimeout(conferirFilmes, 60_000).unref?.();
    setInterval(conferirFilmes, 600_000).unref?.();
  }
  // a prévia toda enviada há mais de 60 dias é apagada (o registro e as imagens): 1 min depois de subir e de 6 em 6 h
  if (filmes.ligado && filmes.apagarVencidas) {
    const apagarPrevias = () => void filmes.apagarVencidas().catch((e) => console.warn(`[filmes] ${e instanceof Error ? e.message : e}`));
    setTimeout(apagarPrevias, 60_000).unref?.();
    setInterval(apagarPrevias, 6 * 3_600_000).unref?.();
  }

  /**
   * A atração dos envios que saíram sem ela na ficha (#54): a ligada na produção da arte do card (uma leitura para
   * todos) e, sem link, a que a claquete reconhece pelas keys de agora (o vocabulário que o servidor já guarda).
   * Só é chamada com envios assim; sem nenhum, não lê nada. @returns (envio) => nome, ou ''
   */
  async function atracoesSemFicha(envios) {
    if (!envios.length) return () => '';
    const ligadas = trello.atracoesDosCards
      ? await trello.atracoesDosCards(envios.map((e) => e.card_id)).catch((erro) => (console.warn(`[acervo] não li a atração na produção da arte: ${erro instanceof Error ? erro.message : erro}`), {}))
      : {};
    const programas = (await vocabulario.ler().catch(() => null))?.programas ?? [];
    return (e) => ligadas[e.card_id] || atracaoPelaClaquete(e.claquete ?? '', programas);
  }

  let registrando = false;
  async function registrarNoAcervo(andamento) {
    if (registrando) return;
    registrando = true;
    try {
      const sairam = q.paraOAcervo.all().filter((e) => {
        const a = andamento[e.roteiro_id];
        return a && (a.entregue || a.status.some((s) => /FINALIZADO/i.test(s)));
      });
      const atracaoDe = await atracoesSemFicha(sairam.filter((e) => !e.atracao));
      for (const e of sairam) {
        // a atração da ficha; sem ela, a ligada na produção da arte ou a que a claquete reconhece; sem nenhuma, espera
        const atracao = e.atracao || atracaoDe(e);
        if (!atracao) continue;
        try {
          // as artes a produzir levam a complexidade; o envio guardado antes dela (texto, ou { texto, tipos }) entra com 1
          const artes = JSON.parse(e.artes_novas).map((x) => (typeof x === 'string' ? { texto: x } : x)).map((x) => ({ ...x, complexidade: nivelDeComplexidade(x?.complexidade) }));
          const n = await acervo.registrar({ atracao, data: e.exibicao, card: e.card_id, artes });
          q.noAcervo.run(new Date().toISOString(), atracao, e.roteiro_id);
          if (n) console.log(`[acervo] ${atracao}: ${n} ${n === 1 ? 'arte nova' : 'artes novas'} do card ${e.card_id}`);
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
        if (tipo === 'atracoes') acervo.esquecerAcervos?.();
        console.log(`[cadastros] ${eu.email} cadastrou ${singular}: ${feito.nome}`);
        return json(res, 200, feito);
      }
      if (id && !REC.test(id)) return json(res, 400, { erro: 'Identificador inválido.' });
      if (req.method === 'PATCH' && tipo === 'atracoes' && id && !sub) {
        const corpo = (await lerCorpo(req)) ?? {};
        const feito = await cadastros.mudarAcervo(id, corpo.acervo);
        acervo.esquecerAcervos?.();
        console.log(`[cadastros] ${eu.email} mudou o acervo de ${feito.nome}: ${feito.acervo}`);
        return json(res, 200, feito);
      }
      if (req.method === 'POST' && sub === 'keys' && !keyId) {
        const corpo = (await lerCorpo(req)) ?? {};
        const feito = await cadastros.novaKey(singular, id, corpo.key);
        console.log(`[cadastros] ${eu.email} deu a key ${feito.key} para ${id}`);
        return json(res, 200, feito);
      }
      if (req.method === 'DELETE') {
        if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores removem cadastros.' });
        if (sub === 'keys') {
          if (!REC.test(keyId ?? '')) return json(res, 400, { erro: 'Identificador inválido.' });
          await cadastros.remover({ atracao: 'keyAtracao', redator: 'keyRedator', editor: 'keyEditor' }[singular], keyId);
        } else await cadastros.remover(singular, id);
        console.log(`[cadastros] ${eu.email} removeu ${sub === 'keys' ? `a key ${keyId}` : `${singular} ${id}`}`);
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { erro: 'Método não permitido.' });
    } catch (e) {
      return json(res, e.status && e.status < 600 ? e.status : 422, { erro: e instanceof Error ? e.message : 'Não consegui falar com o Teable.' });
    }
  }

  /* ---------- aba Filmes: as prévias de filmes ---------- */
  // Quem está em cada prévia: a tela aberta avisa a cada poucos segundos (e diz o card em que mexe); quem para de
  // avisar (a aba fechou, o notebook dormiu) sai sozinho. Fica na memória desta instância, como a sala de um roteiro.
  const naPrevia = new Map(); // id → Map<email, { nome, email, card, em }>
  const PRESENCA_MS = Math.max(1000, Number(env.FILMES_PRESENCA_MS ?? 12_000) || 12_000);
  /** Quem está na prévia agora, sem a própria pessoa. */
  const pessoasNaPrevia = (id, eu) => {
    const gente = naPrevia.get(id);
    if (!gente) return [];
    for (const [email, p] of gente) if (Date.now() - p.em > PRESENCA_MS) gente.delete(email);
    if (!gente.size) naPrevia.delete(id);
    return [...gente.values()].filter((p) => p.email !== eu.email).sort((a, b) => a.em - b.em);
  };
  const umCard = (c) => (c && Number.isInteger(c.numero) && Number.isInteger(c.i) && c.numero > 0 && c.i >= 0 && c.i < 100 ? { numero: c.numero, i: c.i } : null);

  async function previas(req, res, caminho, eu) {
    if (!filmes.ligado) return json(res, 503, { erro: `A aba Filmes está desligada: falta ${filmes.faltando.join(', ')}.` });
    if (caminho === '/api/filmes/previas' && req.method === 'GET')
      return json(res, 200, (await filmes.listar()).map((p) => ({ ...p, pessoas: pessoasNaPrevia(p.id, eu).map(({ nome, email }) => ({ nome, email })) })));
    const presenca = /^\/api\/filmes\/previas\/([\w-]{6,80})\/presenca$/.exec(caminho);
    if (presenca && req.method === 'POST') {
      const id = presenca[1];
      const versao = filmes.versao(id);
      if (versao === null) return json(res, 404, { erro: 'Prévia não encontrada.' });
      const corpo = (await lerCorpo(req)) ?? {};
      if (corpo.saiu === true) naPrevia.get(id)?.delete(eu.email);
      else {
        if (!naPrevia.has(id)) naPrevia.set(id, new Map());
        naPrevia.get(id).set(eu.email, { nome: eu.nome, email: eu.email, card: umCard(corpo.card), em: Date.now() });
      }
      return json(res, 200, { versao, pessoas: pessoasNaPrevia(id, eu).map(({ nome, email, card }) => ({ nome, email, card })) });
    }
    if (caminho === '/api/filmes/previas' && req.method === 'POST') {
      const { nome, hash, paginas } = (await lerCorpo(req)) ?? {};
      if (typeof nome !== 'string' || typeof hash !== 'string' || !/^[\w-]{6,128}$/.test(hash) || !Array.isArray(paginas) || !paginas.length || !paginas.every((n) => Number.isInteger(n) && n > 0))
        return json(res, 400, { erro: 'Faltam o nome, a impressão do PDF ou as páginas.' });
      return json(res, 200, filmes.criar({ nome: nome.slice(0, 200), hash, paginas: paginas.slice(0, 12) }, eu));
    }
    const umFilme = /^\/api\/filmes\/previas\/([\w-]{6,80})\/paginas\/(\d{1,3})\/filmes\/(\d{1,2})$/.exec(caminho);
    if (umFilme && req.method === 'PATCH') {
      const [, id, numero, i] = umFilme;
      const r = await filmes.mudar(id, Number(numero), Number(i), (await lerCorpo(req)) ?? {});
      return r.erro ? json(res, r.status ?? 400, { erro: r.erro }) : json(res, 200, r);
    }
    const daPagina = /^\/api\/filmes\/previas\/([\w-]{6,80})\/paginas\/(\d{1,3})(?:\/(imagem|poster\/(\d{1,3})|reler))?$/.exec(caminho);
    if (daPagina) {
      const [, id, numero, extra, k] = daPagina;
      if (!extra && req.method === 'PUT') {
        const corpo = (await lerCorpo(req, LIMITE_PAGINA, 'Página')) ?? {};
        const r = filmes.receberPagina(id, Number(numero), corpo);
        return r.erro ? json(res, r.status ?? 400, { erro: r.erro }) : json(res, 200, { ok: true });
      }
      if (extra === 'reler' && req.method === 'POST') {
        const r = filmes.reler(id, Number(numero));
        return r.erro ? json(res, r.status ?? 400, { erro: r.erro }) : json(res, 200, { ok: true });
      }
      if (extra && req.method === 'GET') {
        const img = filmes.imagem(id, Number(numero), k ? Number(k) : 0);
        if (!img) return json(res, 404, { erro: 'Imagem não encontrada.' });
        res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': img.length, 'cache-control': 'private, max-age=86400' });
        return res.end(img);
      }
    }
    const envio = /^\/api\/filmes\/previas\/([\w-]{6,80})\/enviar$/.exec(caminho);
    if (envio && req.method === 'POST') {
      const r = await filmes.enviar(envio[1], eu);
      if (r.erro) return json(res, r.status ?? 400, { erro: r.erro });
      if (r.enviando) console.log(`[filmes] ${eu.email} mandou ${r.enviando} ${r.enviando === 1 ? 'filme' : 'filmes'} para o Trello`);
      return json(res, 200, r);
    }
    const umaPrevia = /^\/api\/filmes\/previas\/([\w-]{6,80})$/.exec(caminho);
    if (umaPrevia && req.method === 'GET') {
      const p = await filmes.abrir(umaPrevia[1]);
      return p ? json(res, 200, p) : json(res, 404, { erro: 'Prévia não encontrada.' });
    }
    return json(res, 404, { erro: 'Não encontrado.' });
  }

  const relatosDoNavegador = [];
  async function api(req, res, caminho) {
    const eu = await identificar(req, env);
    if (caminho === '/api/eu') {
      if (eu) {
        // quem entra passa a constar na lista de pessoas com quem se pode compartilhar
        q.verUsuario.run(eu.email, eu.nome, new Date().toISOString());
        const tour = { revisao: q.tourDe.get(eu.email)?.tour_revisao_em ?? null };
        return json(res, 200, { ...eu, trello: trello.ligado, filmes: filmes.ligado, tour });
      }
      // sem login na porta: o navegador pode se apresentar com o perfil local, se a demonstração permitir
      return json(res, 200, { email: null, perfilLocal: env.PERFIL_LOCAL === '1' });
    }
    if (caminho === '/api/diagnostico/navegador' && req.method === 'POST') {
      // o navegador conta o que tinha quando um roteiro chegou sem atração (os últimos 10 ficam no diagnóstico)
      const corpo = (await lerCorpo(req).catch(() => ({}))) ?? {};
      relatosDoNavegador.unshift({ em: new Date().toISOString(), quem: eu?.email ?? null, ...Object.fromEntries(Object.entries(corpo ?? {}).slice(0, 12).map(([k, v]) => [k, String(v).slice(0, 300)])) });
      relatosDoNavegador.length = Math.min(relatosDoNavegador.length, 10);
      return json(res, 200, { ok: true });
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
        login: await diagnosticarLogin(req, env),
        vocabulario: vocabulario.estado?.() ?? null,
        // o que o navegador acharia com a lista que recebe (vazio aqui = a lista não tem a key desta claquete)
        naListaDoNavegador: naLista,
        relatosDoNavegador,
        exemplo: (voc.programas ?? []).filter((p) => /chef|eliana/i.test(p.nome)).map((p) => ({ nome: p.nome, chaves: p.chaves })),
        atracao: trello.diagnosticarAtracao ? await trello.diagnosticarAtracao(claquete) : null,
        postgres: { esquema: env.TEABLE_PG_ESQUEMA || '', atracoes: env.TEABLE_PG_ATRACOES || '', url: env.TEABLE_PG_URL ? 'configurada' : 'faltando' },
      });
    }
    if (!eu) return json(res, 401, { erro: 'Entre com a sua conta para ver os roteiros.' });

    if (caminho === '/api/conferencia') {
      // ponta a ponta no ambiente de verdade, depois de cada deploy: só lê, nada é criado nem alterado
      const itens = [];
      itens.push({ item: 'Login (Cloudflare Access)', ok: eu.origem === 'acesso', detalhe: `${eu.email} (${eu.origem})` });
      const voc = await vocabulario.renovar?.().catch(() => null) ?? (await vocabulario.ler());
      const ev = vocabulario.estado?.() ?? {};
      itens.push({ item: 'Atrações e keys', ok: (voc.programas?.length ?? 0) > 0 && ev.origem !== 'cópia local antiga', detalhe: `${voc.programas?.length ?? 0} atrações (${ev.comKeys ?? '?'} com key), pelo ${ev.origem || 'cache'}${ev.erroPg ? ` · erro no Postgres: ${ev.erroPg}` : ''}${ev.erroApi ? ` · erro na API: ${ev.erroApi}` : ''}` });
      itens.push({ item: 'Redatores e editores', ok: (voc.redatores?.length ?? 0) > 0 && (voc.editores?.length ?? 0) > 0, detalhe: `${voc.redatores?.length ?? 0} redatores, ${voc.editores?.length ?? 0} editores` });
      // a API do Teable: o token lê cada tabela em que o app grava
      const base = (env.TEABLE_URL || '').replace(/\/+$/, '');
      for (const [nome, id] of Object.entries({ TEABLE_CADASTRO: env.TEABLE_CADASTRO, TEABLE_ATRACOES: env.TEABLE_ATRACOES, TEABLE_REDATORES: env.TEABLE_REDATORES, TEABLE_KEY_REDATORES: env.TEABLE_KEY_REDATORES, TEABLE_EDITORES: env.TEABLE_EDITORES, TEABLE_KEY_EDITORES: env.TEABLE_KEY_EDITORES, TEABLE_ARTE_PRODUCAO: env.TEABLE_ARTE_PRODUCAO, TEABLE_ACERVO: env.TEABLE_ACERVO, TEABLE_PAUTA: env.TEABLE_PAUTA })) {
        if (!id) {
          itens.push({ item: `API do Teable: ${nome}`, ok: nome === 'TEABLE_PAUTA', detalhe: 'não configurada' });
          continue;
        }
        try {
          const r = await fetch(`${base}/api/table/${encodeURIComponent(id)}/field`, { headers: { authorization: `Bearer ${env.TEABLE_TOKEN}` }, signal: AbortSignal.timeout(8000) });
          itens.push({ item: `API do Teable: ${nome}`, ok: r.ok, detalhe: r.ok ? `${(await r.json()).length} campos` : `respondeu ${r.status}${r.status === 401 || r.status === 403 ? ' (o token não tem acesso a esta tabela)' : ''}` });
        } catch (e) {
          itens.push({ item: `API do Teable: ${nome}`, ok: false, detalhe: e instanceof Error ? e.message : String(e) });
        }
      }
      itens.push({ item: 'Acervo de artes', ok: acervo.ligado && acervo.grava, detalhe: acervo.ligado ? (acervo.grava ? 'lê e grava' : 'só lê (falta TEABLE_ACERVO)') : 'desligado (falta TEABLE_PG_ACERVO)' });
      if (trello.conferir) itens.push(...(await trello.conferir()));
      // o reconhecimento de atração com dados reais: a mesma regra do navegador (key no começo; senão, o nome no meio)
      if (trello.ultimasClaquetes) {
        try {
          const achar = (claquete) => atracaoPelaClaquete(claquete, voc.programas ?? []);
          const casos = await trello.ultimasClaquetes(500);
          const errados = casos.map((c) => ({ ...c, achou: achar(c.claquete) })).filter((c) => c.achou !== c.atracao);
          const pct = casos.length ? Math.round((100 * (casos.length - errados.length)) / casos.length) : 0;
          itens.push({ item: 'Reconhecimento de atração (últimas claquetes reais)', ok: casos.length > 0 && pct >= 90, detalhe: `${casos.length - errados.length} de ${casos.length} iguais ao Teable (${pct}%)`, diferentes: errados.slice(0, 25).map((c) => `${c.claquete} → ${c.achou || 'nada'} (Teable: ${c.atracao})`) });
        } catch (e) {
          itens.push({ item: 'Reconhecimento de atração (últimas claquetes reais)', ok: false, detalhe: e instanceof Error ? e.message : String(e) });
        }
      }
      const falhas = itens.filter((i) => !i.ok).length;
      return json(res, 200, { resumo: falhas ? `${falhas} de ${itens.length} itens com problema` : `tudo certo (${itens.length} itens)`, quando: new Date().toISOString(), itens });
    }
    // quem está com cada roteiro aberto agora (as salas de edição simultânea desta instância, como o "no-roteiro" da
    // fila): o editor consulta na hora de escolher o próximo, para não mandar a pessoa para o roteiro de um colega
    if (caminho === '/api/no-roteiro') {
      const salasAbertas = [...salas.keys()].map((id) => [id, quemNoRoteiro(id)]).filter(([id, pessoas]) => pessoas.length && acesso(id, eu).ler);
      return json(res, 200, Object.fromEntries(salasAbertas));
    }
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
    if (caminho === '/api/eu/tour') {
      // a pessoa viu o tour da revisão: o convite não aparece mais, em nenhum navegador
      if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
      const agora = new Date().toISOString();
      q.verUsuario.run(eu.email, eu.nome, agora);
      q.viuTour.run(agora, eu.email);
      return json(res, 200, { ok: true, tour: { revisao: agora } });
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
    if (caminho === '/api/redator-provavel') {
      // o roteiro chegou sem redator: quem escreveu as últimas claquetes da atração, na mesma praça (a sugestão do
      // histórico). Sem o Postgres do Teable, vazio: o app segue com a sugestão do texto, se houver
      const busca = new URL(req.url, 'http://x').searchParams;
      const atracao = (busca.get('atracao') ?? '').slice(0, 200);
      const praca = (busca.get('praca') ?? '').slice(0, 20);
      return json(res, 200, { redator: await redatorProvavel.provavel(atracao, praca) });
    }
    if (caminho === '/api/acervo') {
      // as artes que a atração já tem prontas (as do acervo), para marcar na revisão; numa sessão, as do filme do dia
      const busca = new URL(req.url, 'http://x').searchParams;
      const atracao = (busca.get('atracao') ?? '').slice(0, 200);
      const data = (busca.get('data') ?? '').slice(0, 10);
      if (!acervo.ligado) return json(res, 200, { ligado: false, artes: [] });
      return json(res, 200, { ligado: true, podeZerar: cadastros.podeApagar(eu.email), artes: await acervo.paraRevisao(atracao, data).catch((e) => (console.warn(`[acervo] ${e instanceof Error ? e.message : e}`), [])) });
    }
    if (caminho === '/api/acervo/totais') {
      // a lista de atrações nos Cadastros: quantas artes cada uma tem no acervo
      if (!acervo.ligado) return json(res, 200, { ligado: false, totais: {} });
      try {
        return json(res, 200, { ligado: true, totais: await acervo.totais() });
      } catch (e) {
        return json(res, 502, { erro: `Não consegui ler o acervo: ${e instanceof Error ? e.message : e}` });
      }
    }
    if (caminho === '/api/acervo/atracao') {
      // a ficha da atração nos Cadastros: o acervo dela linha a linha, com o total e a contagem por tipo (só consulta)
      const atracao = (new URL(req.url, 'http://x').searchParams.get('atracao') ?? '').slice(0, 200);
      if (!acervo.ligado) return json(res, 200, { ligado: false, acervo: 'proprio', podeZerar: false, total: 0, porTipo: [], artes: [] });
      try {
        return json(res, 200, { ligado: true, podeZerar: cadastros.podeApagar(eu.email), ...(await acervo.fichaDa(atracao)) });
      } catch (e) {
        return json(res, 502, { erro: `Não consegui ler o acervo: ${e instanceof Error ? e.message : e}` });
      }
    }
    if (caminho === '/api/acervo/importar/previa' || caminho === '/api/acervo/importar') {
      // a importação do acervo por CSV (ADR 0005): a prévia classifica, o gravar grava o que a conferência decidiu.
      // Só administradores (CADASTRO_ADMINS) e só atração de acervo próprio.
      if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
      if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores importam o acervo.' });
      if (!acervo.ligado || !acervo.grava) return json(res, 503, { erro: 'O acervo de artes não está configurado para gravar (TEABLE_ACERVO e TEABLE_PG_ACERVO).' });
      const corpo = (await lerCorpo(req, LIMITE_CORPO, 'CSV')) ?? {};
      const atracao = typeof corpo.atracao === 'string' ? corpo.atracao.trim().slice(0, 200) : '';
      if (!atracao) return json(res, 400, { erro: 'Qual atração?' });
      try {
        const qual = await acervo.acervoDe(atracao);
        if (qual !== 'proprio') return json(res, 422, { erro: `${atracao} não tem acervo próprio: a importação é só para atração de acervo próprio.` });
        if (typeof corpo.csv !== 'string' || !corpo.csv.trim()) return json(res, 400, { erro: 'O CSV veio vazio.' });
        if (caminho === '/api/acervo/importar/previa') {
          const arquivo = typeof corpo.arquivo === 'string' ? corpo.arquivo.slice(0, 200) : '';
          return json(res, 200, { atracao, arquivo, ...(await acervo.previaDaImportacao(atracao, corpo.csv, regrasDaAtracao.daAtracao(atracao))) });
        }
        // o gravar recebe o mesmo CSV e as escolhas da conferência, e classifica de novo contra o acervo relido; o
        // registro de cada passo vai para o histórico (#61), para desfazer e para retomar se parar no meio
        const arquivo = String(corpo.arquivo ?? '').slice(0, 200) || 'CSV';
        const id = randomUUID();
        const quem = { atracao, por: eu, arquivo, em: new Date().toISOString() };
        const anotar = (registro) => importacoes.anotar(id, quem, registro);
        // "lembrar as decisões nas próximas desta atração" (#63): só com a opção marcada
        const escolhas = escolhasDoPedido(corpo.escolhas);
        let lembradas = 0;
        const lembrar =
          corpo.lembrar === true
            ? (linhas) => {
                lembradas = regrasDaAtracao.lembrar(atracao, regrasDasDecisoes({ linhas, escolhas }), eu.nome);
              }
            : undefined;
        try {
          const { registro, ...feito } = await acervo.gravarImportacao(atracao, corpo.csv, escolhas, { anotar, regras: regrasDaAtracao.daAtracao(atracao), lembrar });
          console.log(
            `[acervo] ${eu.email} importou ${arquivo} em ${atracao}: ${feito.novas} novas, ${feito.ganharamTipo} ganharam o tipo, ${feito.renomeadas.length} renomeadas (${feito.antes} → ${feito.depois})`,
          );
          return json(res, 200, { ...feito, importacao: registro ? id : null, lembradas });
        } catch (e) {
          if (!e?.interrompida) throw e;
          console.warn(`[acervo] a importação de ${arquivo} em ${atracao} parou no meio: ${e.message}`);
          return json(res, 502, { erro: e.message, importacao: id });
        }
      } catch (e) {
        if (e?.status === 422) return json(res, 422, { erro: e.message });
        return json(res, 502, { erro: `Não consegui ${caminho.endsWith('previa') ? 'ler o acervo' : 'gravar no acervo'}: ${e instanceof Error ? e.message : e}` });
      }
    }
    if (caminho === '/api/acervo/regras' || caminho === '/api/acervo/regras/apagar') {
      // as regras desta atração (#63): as decisões lembradas, para ver e apagar a lembrada errada. Só administradores.
      if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores veem e apagam as regras da atração.' });
      if (caminho === '/api/acervo/regras') {
        if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
        const atracao = (new URL(req.url, 'http://x').searchParams.get('atracao') ?? '').trim().slice(0, 200);
        return json(res, 200, { regras: atracao ? regrasDaAtracao.lista(atracao) : [] });
      }
      if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
      const corpo = (await lerCorpo(req)) ?? {};
      const apagada = Number.isInteger(corpo.id) ? regrasDaAtracao.apagar(corpo.id) : null;
      if (!apagada) return json(res, 404, { erro: 'Essa regra não está mais na atração.' });
      console.log(`[acervo] ${eu.email} apagou a regra de ${apagada.atracao}: ${apagada.motivo}`);
      return json(res, 200, { apagada: corpo.id });
    }
    if (caminho === '/api/acervo/importacoes' && req.method === 'GET') {
      // o histórico das importações da atração (a ficha): quando, o arquivo, quem e +N; todos veem, só administradores
      // desfazem e retomam
      const atracao = (new URL(req.url, 'http://x').searchParams.get('atracao') ?? '').slice(0, 200);
      return json(res, 200, { importacoes: atracao ? importacoes.lista(atracao, { admin: cadastros.podeApagar(eu.email) }) : [] });
    }
    if (caminho === '/api/acervo/importacoes/desfazer' || caminho === '/api/acervo/importacoes/retomar') {
      // desfazer (apaga as criadas, devolve o tipo e o nome antigos; a linha mexida depois não volta) ou retomar a
      // gravação interrompida, por 7 dias. Só administradores.
      if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
      const desfazer = caminho.endsWith('desfazer');
      if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: `Só administradores ${desfazer ? 'desfazem' : 'retomam'} a importação.` });
      if (!acervo.ligado || !acervo.grava) return json(res, 503, { erro: 'O acervo de artes não está configurado para gravar (TEABLE_ACERVO e TEABLE_PG_ACERVO).' });
      const corpo = (await lerCorpo(req)) ?? {};
      const linha = typeof corpo.id === 'string' ? importacoes.uma(corpo.id) : null;
      if (!linha) return json(res, 404, { erro: 'Essa importação não está no histórico.' });
      const estado = importacoes.estado(linha);
      if (estado === 'desfeita') return json(res, 409, { erro: 'Essa importação já foi desfeita.' });
      if (!desfazer && estado !== 'interrompida') return json(res, 409, { erro: 'Essa importação já foi gravada inteira.' });
      if (!importacoes.noPrazo(linha)) return json(res, 422, { erro: `Passou o prazo: a importação só pode ser ${desfazer ? 'desfeita' : 'retomada'} até 7 dias depois.` });
      if (mexendoNaImportacao.has(linha.id)) return json(res, 409, { erro: 'Essa importação já está sendo desfeita ou retomada.' });
      mexendoNaImportacao.add(linha.id);
      const quem = { atracao: linha.atracao, por: { email: linha.por_email, nome: linha.por_nome }, arquivo: linha.arquivo, em: linha.em };
      try {
        if (desfazer) {
          const feito = await acervo.desfazerImportacao(linha.registro);
          // o registro guarda os ids que o desfazer achou (do lote que falhou no meio)
          importacoes.anotar(linha.id, quem, linha.registro);
          importacoes.desfeita(linha.id, eu.nome, feito.naoVoltaram);
          console.log(`[acervo] ${eu.email} desfez a importação de ${linha.arquivo} em ${linha.atracao}: ${feito.apagadas} apagadas, ${feito.devolvidas} devolvidas, ${feito.naoVoltaram.length} não voltaram`);
          return json(res, 200, { ...feito, antes: linha.registro.antes });
        }
        const feito = await acervo.retomarImportacao(linha.registro, { anotar: (registro) => importacoes.anotar(linha.id, quem, registro) });
        console.log(`[acervo] ${eu.email} retomou a importação de ${linha.arquivo} em ${linha.atracao}`);
        return json(res, 200, { ...feito, importacao: linha.id });
      } catch (e) {
        if (e?.interrompida) return json(res, 502, { erro: e.message, importacao: linha.id });
        return json(res, 502, { erro: `Não consegui ${desfazer ? 'desfazer' : 'retomar'} a importação: ${e instanceof Error ? e.message : e}` });
      } finally {
        mexendoNaImportacao.delete(linha.id);
      }
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
      // como anda, na produção da arte, o que já foi para o Trello, e quais roteiros (enviados ou na fila de revisão)
      // estão na lista de prioridade; só dos roteiros que a pessoa vê
      const linhas = aberto ? q.listaTudo.all(eu.email) : q.lista.all(eu.email, eu.email, eu.email);
      const enviado = (l) => l.envio_estado === 'enviado' || l.envio_estado === 'duplicado';
      const dados = await trello.andamento(linhas.map((l) => ({ id: l.id, card: l.envio_card, claquete: JSON.parse(l.meta).claquete ?? '', ...(enviado(l) ? {} : { naFila: true }) })));
      // card que saiu (finalizado ou entregue): as artes novas dele entram no acervo da atração, uma vez só
      if (acervo.ligado && acervo.grava) void registrarNoAcervo(dados);
      return json(res, 200, dados);
    }
    const posterDe = /^\/api\/filmes\/poster\/(rec[A-Za-z0-9]{6,32})$/.exec(caminho);
    if (posterDe && req.method === 'GET') {
      // o pôster do filme (campo "poster" da tabela de filmes, que o FilmeBOT preenche), servido daqui com cache
      const img = await posterDoFilme(posterDe[1]);
      if (!img) {
        res.writeHead(404, { 'cache-control': 'private, max-age=600' });
        return res.end();
      }
      res.writeHead(200, { 'content-type': img.tipo, 'content-length': img.dados.length, 'cache-control': 'private, max-age=86400' });
      return res.end(img.dados);
    }
    if (caminho.startsWith('/api/filmes/previas')) return previas(req, res, caminho, eu);
    if (caminho === '/api/filmes' && req.method === 'GET') {
      // os filmes dos próximos dias, com o andamento do card (a mesma produção da arte das claquetes)
      const filmes = await trello.filmesProximos?.(14).catch((e) => (console.warn(`[filmes] ${e instanceof Error ? e.message : e}`), [])) ?? [];
      void filmesNoAcervo(filmes);
      return json(res, 200, filmes);
    }
    if (caminho === '/api/cadastros/sugerir' && req.method === 'GET') {
      // a key de uma claquete e a atração parecida, para ligar sem sair da revisão
      const claquete = String(new URL(req.url, 'http://x').searchParams.get('claquete') ?? '').slice(0, 200);
      const key = semAcentoMin(chaveDaAtracao(claquete)).toUpperCase();
      const voc = await vocabulario.ler();
      return json(res, 200, { key, sugestao: key ? sugerirAtracao(key, voc.programas ?? []) : '' });
    }
    if (caminho === '/api/cadastros/sem-cadastro' && req.method === 'GET') {
      // as keys que aparecem nas claquetes dos últimos 90 dias (produção e fila) e não são de nenhuma atração.
      // Com ?com=reconhecidas, vem também quantas claquetes têm atração (e uma amostra): { keys, reconhecidas }.
      // Sem pedir, a resposta continua a lista de keys (uma aba aberta com o app antigo segue funcionando).
      const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const voc = await vocabulario.ler();
      const claquetes = [
        ...q.claquetesDaFila.all(desde).map((l) => ({ claquete: String(l.claquete ?? ''), em: String(l.em ?? '') })),
        ...((await trello.claquetesRecentes?.(90).catch(() => [])) ?? []),
      ].filter((c) => c.claquete.trim());
      const r = semCadastro(claquetes, voc.programas ?? [], new Set(q.ignoradas.all().map((l) => l.key)));
      const comReconhecidas = new URL(req.url, 'http://x').searchParams.get('com') === 'reconhecidas';
      return json(res, 200, comReconhecidas ? r : r.keys);
    }
    if (caminho === '/api/cadastros/ignorar' && req.method === 'POST') {
      const { key } = (await lerCorpo(req).catch(() => ({}))) ?? {};
      if (!key || typeof key !== 'string') return json(res, 400, { erro: 'Falta a key.' });
      q.ignorar.run(key.trim().toUpperCase().slice(0, 80), eu.email, new Date().toISOString());
      return json(res, 200, { ok: true });
    }
    if (caminho.startsWith('/api/cadastros/ignorar/') && req.method === 'DELETE') {
      q.designorar.run(decodeURIComponent(caminho.slice('/api/cadastros/ignorar/'.length)).toUpperCase());
      return json(res, 200, { ok: true });
    }
    if (caminho === '/api/cadastros' || caminho.startsWith('/api/cadastros/')) return rotaDosCadastros(req, res, eu, caminho);
    if (caminho === '/api/pauta') return json(res, 200, await pauta.achar(new URL(req.url, 'http://x').searchParams.get('chave')));

    const extra = /^\/api\/roteiros\/([^/]+)\/(original|original-texto|trello|pdf)$/.exec(caminho);
    if (extra?.[2] === 'trello' && extra[1].startsWith(PREFIXO_DO_TOUR)) return json(res, 400, RECUSA_DO_TOUR);
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
      if (!atual) return lapide(res, id, eu);
      // o id existe e não é para esta pessoa: 403 sem dados, para a tela dizer "sem permissão" e não "não existe"
      if (!podeLer) return json(res, 403, { erro: 'Você não tem acesso a este roteiro.' });
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
      db.exec('BEGIN');
      try {
        const leitores = [atual.dono_email, ...q.compartilhadoCom.all(id).map((c) => c.email)];
        const claquete = String(JSON.parse(atual.meta)?.claquete ?? '');
        q.gravarLapide.run(id, claquete, eu.nome, eu.email, new Date().toISOString(), atual.publico ? 1 : 0, JSON.stringify(leitores));
        q.apagar.run(id);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      fecharSala(id, 'apagado');
      avisarFila('apagado', id, eu);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'PUT') {
      if (id.startsWith(PREFIXO_DO_TOUR)) return json(res, 400, RECUSA_DO_TOUR);
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
        // o que o app preenche sozinho (a atração reconhecida depois de um cadastro) não é revisão de ninguém
        if (atual && !corpo.automatico && (atual.meta !== meta || atual.doc !== doc)) {
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
