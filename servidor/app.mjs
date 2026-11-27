// Servidor do PROMeiro: API + arquivos estáticos, com SQLite (node:sqlite, sem dependências).
// Cada roteiro pertence a um e-mail. Só o dono vê e edita; se marcar como público, os outros leem.
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { randomUUID, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as sinc from 'y-protocols/sync';
import * as presenca from 'y-protocols/awareness';
import * as cod from 'lib0/encoding';
import * as dec from 'lib0/decoding';
import { criarVocabulario } from './vocabulario.mjs';
import { abrirPg, criarPauta } from './pauta.mjs';
import { criarCorrecoes, GRUPOS as GRUPOS_DAS_CORRECOES, TIPO_DA_PAUTA, propostasParaAplicar } from './correcoes.mjs';
import { criarRegistroDeCorrecoes, idsParaDesfazer } from './registro-de-correcoes.mjs';
import { criarAtracoesParecidas, idsDoGrupo } from './atracoes-parecidas.mjs';
import { criarJuntarAtracoes, TIPO_DAS_ATRACOES } from './juntar-atracoes.mjs';
import { codigoDasVersoes, colunasDoDia, cruzarComAProducao, diaEmSaoPaulo, diaOuHoje, diasDaSemana, diaVizinho, ehChaveDaPauta, ehFiltroDaPauta, filtrarAPauta, ordemDosEditores, recusaDaPreferenciaDaPauta, resumoDaPauta, segundaDaSemana } from '../src/modelo/pauta.ts';
import { criarConfiguracao } from './configuracao.mjs';
import { criarDescoberta, envDosModulos, mesmasTabelas, tabelaNoPg } from './tabelas-do-teable.mjs';
import { criarCache } from './cache.mjs';
import { chaveDaAtracao, criarTrello, nivelDeComplexidade, SEM_CAMINHO } from './trello.mjs';
import { criarCadastros, normalizarKey } from './cadastros.mjs';
import { criarAcervo } from './acervo.mjs';
import { escolhasDoPedido, regrasDasDecisoes } from './importacao-do-acervo.mjs';
import { criarImportacoes, criarTabelaDasImportacoes } from './importacoes.mjs';
import { criarRegrasDaAtracao, criarTabelaDasRegras } from './regras-da-atracao.mjs';
import { criarRedatorProvavel } from './redator.mjs';
import { criarFilmes } from './filmes.mjs';
import { criarDuplicadas, DIAS_MAXIMO, DIAS_PADRAO } from './duplicadas.mjs';
import { criarRegistroDasDuplicadas, MOTIVO_MAXIMO } from './registro-das-duplicadas.mjs';
import { criarProducoes } from './producoes.mjs';
import { ROTA_PUBLICA, criarAnexos, idDoCaminho, posterPublico } from './anexos.mjs';
import { RECUPERACAO, ROTA_DO_AVISO, acoesDesde, assinaturaConfere, avisoLigado, enderecoDoAviso, faltasDoAviso, garantirWebhook, lerCorpoDoAviso, listasDoQuadro, quadroDoAviso, segredoDoAviso } from './aviso-do-trello.mjs';
import { eventosDoAviso } from '../src/modelo/avisoDoTrello.ts';
import { ehSessaoDaTarde } from './exibicao.mjs';
// a chave da claquete é a do navegador (a mesma da "versão nova" na fila): o módulo é lido pelo Node sem os tipos
import { chaveDaClaquete } from '../src/modelo/vocabularios.ts';
import { MARCA_TODAS, pracasDaConfiguracao, pracasParaONavegador, pracasRegistradas, semPracaNoComeco, semPracaNoFim } from '../src/modelo/pracas.ts';
import { acertarNArtesUmaVez, artesComOEstado, subirComplexidade, versoesLidas } from './artes.mjs';
import { conferirSecaoPracas, criarOpcoesDasNovas, lerOQuadro, lerQuadro, lerSecaoPracas, mudancasDaSecao, pracasSalvas, secaoDoPedido } from './configuracao-pracas.mjs';
import { criarPessoas } from './configuracao-pessoas.mjs';
import { TIPOS_COM_EMAIL, criarLigacaoDePessoas } from './ligacao-de-pessoas.mjs';
import { criarNomesNovos, nomeNovoDoPedido } from './nomes-novos.mjs';
import { criarPreferencias } from './preferencias.mjs';
import { criarApelidos } from './apelidos.mjs';
import { CHAVE_DO_CODIGO_DAS_VERSOES, recusaDoCodigoDasVersoes, versoesDaChamada } from '../src/modelo/versoesDoRoteiro.ts';
import { criarAreas, deTodos, dosMeusRoteiros } from './areas.mjs';
import { criarEscala, posicoesDoPedido, recadoDoPedido } from './escala.mjs';
import { juntarODia } from '../src/modelo/juntarODia.ts';
import { criarIlhas } from './ilhas.mjs';
import { ilhasOcupadas } from '../src/modelo/ilhas.ts';
import { conferirTurnos, turnosArrumados, turnosDaConfiguracao, turnosDoDia } from '../src/modelo/turnos.ts';
import { CABECALHO_DA_CHAVE, criarPadeiros } from './padeiros.mjs';
import { DIAS_ANTES, DIAS_DEPOIS, diaEmBrasilia, filmesRecentes, horaDeBrasilia, somarDias } from './filmes-recentes.mjs';
import { DIAS_DO_TRELLO, criarIndiceDoBuscar, dasAtracoes, doTrello, montarIndice } from './indice-do-buscar.mjs';
import { criarProjetoDoPadeiro } from './projeto-do-padeiro.mjs';
import { designerSugerido } from '../src/modelo/padeiros.ts';
import { ausenciaDoPedido, criarAusencias } from './ausencias.mjs';
import { foraNaPauta, motivoDaAusencia } from '../src/modelo/ausencias.ts';
import { criarDistribuicao } from './distribuir.mjs';
import { diasDoRepetir, ehDeOndeRepetir, opcoesDoRepetir, repetirODia } from '../src/modelo/repetir.ts';
import { conferirODia, pendenciasQueFicaram } from '../src/modelo/conferenciaDaEscala.ts';
import { juntarAPublicada } from '../src/modelo/pautaPublicada.ts';
import { DIAS_DA_CONTINUIDADE, historicoDaPauta } from '../src/modelo/distribuir.ts';
import { areaDaChaveDeExibicao, ehArea, ehAreaDosRoteiros, ehExibicao } from '../src/modelo/areas.ts';
import { cicloDoRoteiro } from '../src/modelo/cicloDoRoteiro.ts';
import { CHAVE_DA_ORDEM, CHAVE_DOS_RECOLHIDOS, DIAS_DO_ENTREGUE, blocosDasProducoes, diaDoPrazo, recusaDaOrdem, recusaDosRecolhidos } from '../src/modelo/producoesPorPraca.ts';
import { SEM_LIGACAO, criarEtapaDaProducao } from './etapa-da-producao.mjs';
import { criarCardDaProducao } from './card-da-producao.mjs';
import { criarForaDoAr, lerOQuadroComCopia, recusaForaDoAr } from './configuracao-fora-do-ar.mjs';
import { listaDoPortainer } from './configuracao-portainer.mjs';
import { criarCartaoDoTeams } from './cartao-do-teams.mjs';
import { LIMITE_DA_FOTO, ROTA_DA_FOTO, criarFotosDaEdicao, fotoDoPedido, tokenBearerConfere } from './foto-da-edicao.mjs';
import { LIMITE_DA_PREVIA, ROTA_DA_PREVIA, linkDaAbaFilmes, previaDoPedido } from './previa-por-email.mjs';
import { diferencasDaFoto, lerAFoto } from '../src/modelo/fotoDaPlanilha.ts';
import { conferirHorarios, horariosArrumados, horariosDaConfiguracao } from '../src/modelo/horariosDoCartao.ts';
import { criarAndamento } from './andamento.mjs';
import { administradoresDaTela, administradoresSalvos, ehAdministrador, porAdministrador, tirarAdministrador } from '../src/modelo/pessoas.ts';
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { chaveDeArte } from '../src/modelo/diferencas.ts';
import { confirmaATroca, conexoesDaTela, lerQuadros, mudancasDaBaseNova, religarNoQuadroNovo } from './configuracao-conexoes.mjs';
import { VARIAVEIS_DO_CARD, cardDoPedido, conferirSecaoDoCard, mudancasDoCard, secaoDoCard } from './configuracao-card.mjs';
import { cardDaConfiguracao } from '../src/modelo/ligarOCard.ts';
import { conferirAVolta, descreverMudanca, secoesDe } from './configuracao-historico.mjs';
import { CHAVE_DA_VIRADA, criarPautaNoTeable } from './pauta-no-teable.mjs';
import { VARIAVEIS_DOS_FILMES, conferirSecaoDosFilmes, filmesDoPedido, filmesSalvos, mudancasDosFilmes, secaoDosFilmes, sessoesDoCadastro } from './configuracao-filmes.mjs';

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
  // as versões da chamada lidas nas artes do roteiro (#120), em JSON, refeitas a cada gravação: a fila as mostra
  if (!tem('roteiros', 'versoes_lidas')) db.exec('ALTER TABLE roteiros ADD COLUMN versoes_lidas TEXT');
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
 * longa no começo (também depois da praça escrita na frente, "RIO"); sem key, o nome da atração (8 letras ou mais) no meio.
 * @param programas [{ nome, chaves }]  @returns o nome, ou '' se nenhuma reconhece
 */
export function atracaoPelaClaquete(claquete, programas, pracas = pracasRegistradas()) {
  const n = semAcentoMin(claquete);
  if (!n) return '';
  const comeco = [n, semPracaNoComeco(n, pracas)];
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

export function keysSemCadastro(claquetes, programas, ignoradas = new Set(), pracas = pracasRegistradas()) {
  return semCadastro(claquetes, programas, ignoradas, pracas).keys;
}

/** Quantas claquetes reconhecidas a amostra leva (as mais recentes): as tiras da comemoração do Sem cadastro zerado. */
const AMOSTRA_RECONHECIDAS = 20;

/**
 * O Sem cadastro inteiro: as keys sem atração (keysSemCadastro) e as claquetes que têm atração, contadas uma vez
 * cada (a mesma claquete na fila e na produção conta uma vez, com a data mais recente). As claquetes das keys
 * ignoradas não são de nenhuma atração: ficam fora das duas.
 * @returns {{ keys: object[], reconhecidas: { total: number, amostra: string[] } }}
 */
export function semCadastro(claquetes, programas, ignoradas = new Set(), pracas = pracasRegistradas()) {
  const lista = programas.map((p) => ({ nome: p.nome, n: semAcentoMin(p.nome), chaves: (p.chaves ?? []).map(semAcentoMin).filter(Boolean) }));
  // compara a claquete inteira e também a key dela (sem a praça na frente: "Rio Fut(...)" → FUT)
  const reconhece = (claquete) => {
    const n = semAcentoMin(claquete);
    const k = semAcentoMin(chaveDaAtracao(claquete, pracas));
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
    const key = semAcentoMin(chaveDaAtracao(claquete, pracas)).toUpperCase();
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

/**
 * O pedido é de um caminho fora do login (o do Padeiro, #137; o do pôster público, #145)? Vale o que o Bypass do Access
 * pode ter deixado passar: o caminho como veio (com %2e%2e, barras repetidas ou outra caixa, que o endereço já arrumado
 * esconderia: /api/publico/%2e%2e/roteiros vira /api/roteiros) e o arrumado, os dois sem a barra no fim
 * (/api/padeiro, /api/padeiros…). Nada disso pode chegar às rotas com login, onde o cabeçalho do Access que veio junto
 * valeria.
 * @param prefixo o caminho fora do login, sem a barra no fim e em minúsculas
 */
function debaixoDoCaminho(prefixo, cru, caminho) {
  const comeco = (c) => c.replace(/\/+/g, '/').toLowerCase().startsWith(prefixo);
  let veio = String(cru ?? '').split(/[?#]/)[0];
  try {
    veio = decodeURIComponent(veio);
  } catch {
    /* um % solto: vale o que veio */
  }
  return comeco(veio) || comeco(String(caminho ?? ''));
}

const json = (res, status, corpo) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(corpo));
};
/** O JSON grande (o índice do buscar do Padeiro, #143), comprimido em gzip para quem aceita. */
const jsonComprimido = (req, res, status, corpo) => {
  if (!/\bgzip\b/i.test(String(req.headers['accept-encoding'] ?? ''))) return json(res, status, corpo);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-encoding': 'gzip', vary: 'accept-encoding' });
  res.end(gzipSync(JSON.stringify(corpo)));
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
    const grandeDemais = () => Object.assign(new Error(`Arquivo grande demais para guardar (até ${Math.round(limite / 1048576)} MB).`), { status: 413 });
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

/**
 * Como cada módulo nasce da configuração de agora. Cada um pode ser trocado em criarApp por uma fábrica
 * (env, deps) => módulo, que é chamada de novo quando a configuração muda, ou por um módulo pronto, que fica o mesmo.
 */
const FABRICAS = {
  trello: (env, { abrirPg, anexos }) => criarTrello(env, { abrirPg, anexos }),
  acervo: (env, { abrirPg, trello, buscar }) => criarAcervo(env, { abrirPg, buscar, artesDoCard: (card) => trello.artesDoCard?.(card) ?? [] }),
  cadastros: (env, { vocabulario }) => criarCadastros(env, { vocabulario }),
  redatorProvavel: (env, { abrirPg }) => criarRedatorProvavel(env, { abrirPg }),
  duplicadas: (env, { trello, acervo, registro, promeiro }) => criarDuplicadas({ trello, acervo, registro, promeiro, soOlhar: soOlharNasDuplicadas(env) }),
  // a aba Filmes nasce uma vez (a fila de leitura da prévia não para); na mudança, só o envio e a conferência mudam
  filmes: (env, { db, trello, abrirPg, anexos }) => criarFilmes(env, { db, pasta: env.FILMES_PASTA, trello, abrirPg, anexos }),
};
/** Os módulos que são refeitos quando a configuração muda (e fechados, os antigos, quando terminam o que faziam). */
const RECRIADOS = ['trello', 'acervo', 'vocabulario', 'pauta', 'cadastros', 'redatorProvavel', 'duplicadas', 'correcoes', 'juntarAtracoes', 'indiceDoBuscar'];
const fazer = (f, env, deps) => (typeof f === 'function' ? f(env, deps) : f);
/** O modo só olhar das Duplicadas (#67): ligado até alguém desligar (DUPLICADAS_SO_OLHAR=0), para os primeiros dias
    da comparação com o relatório do n8n. */
export const soOlharNasDuplicadas = (env) => !/^(0|nao|não|false|off)$/i.test(String(env?.DUPLICADAS_SO_OLHAR ?? '').trim());

/** De quanto em quanto tempo o servidor olha os membros do quadro (a seção Pessoas, #77): uma vez por dia. */
const UM_DIA = 24 * 60 * 60 * 1000;

/** De quanto em quanto tempo o servidor confere se o webhook do quadro (#87) existe e está ativo: uma vez por hora. */
const UMA_HORA = 60 * 60 * 1000;

/** A releitura da produção da arte (ADR 0006): de minuto em minuto, até 2000 linhas por vez, nunca antes de 30 dias,
    e cada vez desde 2 minutos antes da modificação mais nova da anterior (a marca fica guardada no SQLite). */
const UM_MINUTO = 60 * 1000;
const LIMITE_DA_RELEITURA = 2000;
const JANELA_DA_RELEITURA = 30 * UM_DIA;
const MARGEM_DA_RELEITURA = 2 * 60 * 1000;
const MARCA_DA_RELEITURA = 'releitura-da-producao';

/** Os dias de claquetes recentes que a conferência das praças conta (os mesmos da aba Sem cadastro). */
const DIAS_DA_CONTAGEM = 90;

/**
 * @param env as variáveis do Portainer; o que foi salvo na configuração do PROMeiro vale por cima delas
 * @param abrirPg abre o Postgres do Teable (os módulos abrem cada um a sua conexão, na primeira consulta)
 * @param agendar (f, ms) repete f de ms em ms (a verificação diária dos membros do quadro); os testes trocam
 * @param esperaDoAviso quanto esperar, na subida, antes de conferir o webhook do quadro (#87): o Trello confere o
 *   endereço com um HEAD ao registrar, e o servidor precisa já estar ouvindo
 * @param recuperacao os limites da recuperação do que faltou (#88): { porPagina, paginas, dias }; os testes trocam
 * @param buscarNoTeams o fetch do cartão da pauta no Teams (#135); relogio () => o instante de agora, para os horários
 *   dele: os testes trocam pelo Teams falso e por um relógio parado
 */
export function criarApp({ db, env: portainer = process.env, estaticos = null, cache = criarCache(portainer), configuracao = criarConfiguracao(db, portainer), abrirPg: abrir = abrirPg, buscarNoTeable = fetch, buscarNoGitHub = fetch, agendar = (f, ms) => setInterval(f, ms), esperaDoAviso = 5000, recuperacao: limitesDaRecuperacao = {}, buscarNoTeams = fetch, relogio = () => new Date(), ...modulos }) {
  const fabricas = { ...FABRICAS };
  for (const [nome, m] of Object.entries(modulos)) if (m !== undefined && m !== null) fabricas[nome] = m;
  // cópia local do Teable: o que foi lido por último continua valendo com ele fora do ar, mesmo depois de reiniciar
  const importacoes = criarImportacoes(db);
  const regrasDaAtracao = criarRegrasDaAtracao(db);
  // o registro da aba Duplicadas (#66) é do SQLite: o mesmo em todas as gerações da configuração
  const registroDasDuplicadas = criarRegistroDasDuplicadas(db);
  // as Produções (#86): o trabalho da arte com id próprio do PROMeiro, no SQLite
  const producoes = criarProducoes(db);
  // pegar e voltar para a Entrada pela tela de produções (#110): o Trello só escrito, a Produção na hora
  const etapaDaProducao = criarEtapaDaProducao({ producoes });
  // o card aberto da tela de produções (#160): o prazo, a atração, os designers e as artes
  const cardDaProducao = criarCardDaProducao({ producoes });
  // os anexos guardados pelo PROMeiro (#90): o PDF do roteiro do envio e os pôsteres dos filmes, no SQLite (no backup)
  const anexos = criarAnexos(db, { buscar: buscarNoTeable });
  /* O que o PROMeiro guarda de um card, para apagar uma duplicada (#67): a cópia leva os envios dos roteiros, a lista
     dos anexos (o PDF continua guardado, pelo id) e as Produções com a linha do tempo; o envio do roteiro passa ao card
     que fica (e volta, se o apagar parar antes do DELETE). Recriar da cópia (#68) desfaz isso: o envio e o PDF guardado
     voltam a apontar para o card novo. Nada lido do Trello. */
  const doCardNoPROMeiro = {
    envios: db.prepare('SELECT roteiro_id, estado, card_id, url, em, por_nome FROM envios WHERE card_id = ? ORDER BY em'),
    anexos: db.prepare('SELECT id, tipo, chave, nome, mime, em FROM anexos WHERE card = ? ORDER BY em'),
    mudar: db.prepare('UPDATE envios SET card_id = ?, url = ? WHERE roteiro_id = ? AND card_id = ?'),
    devolver: db.prepare('UPDATE envios SET card_id = ?, url = ? WHERE roteiro_id = ?'),
    ligarPdf: db.prepare("UPDATE anexos SET card = ? WHERE tipo = 'roteiro' AND id = ? AND card = ?"),
  };
  const emTransacao = (f) => {
    db.exec('BEGIN');
    try {
      f();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  const promeiroDasDuplicadas = {
    doCard: (card) => ({
      roteiros: doCardNoPROMeiro.envios.all(card).map((e) => ({ id: String(e.roteiro_id), estado: e.estado, card: e.card_id, url: e.url ?? null, em: e.em, por: e.por_nome ?? '' })),
      anexos: doCardNoPROMeiro.anexos.all(card).map((a) => ({ id: a.id, tipo: a.tipo, chave: a.chave, nome: a.nome, mime: a.mime, em: a.em })),
      producoes: producoes.buscar({ card }),
    }),
    reapontar: (roteiros, card, url = `https://trello.com/c/${card}`) => emTransacao(() => roteiros.forEach((r) => doCardNoPROMeiro.mudar.run(card, url, r.id, r.card))),
    devolver: (roteiros) => emTransacao(() => roteiros.forEach((r) => doCardNoPROMeiro.devolver.run(r.card, r.url, r.id))),
    /** O PDF do roteiro mais recente da lista dos anexos da cópia que o PROMeiro ainda guarda: { id, nome, dados } ou null. */
    pdfDe: (lista) => {
      for (const a of [...lista].filter((x) => x.tipo === 'roteiro').sort((x, y) => String(y.em).localeCompare(String(x.em)))) {
        const pdf = anexos.pdf(a.id);
        if (pdf) return { id: a.id, nome: pdf.nome, dados: pdf.dados };
      }
      return null;
    },
    /** A ligação dos PDFs guardados com o card da Produção passa de um card a outro. */
    religarPdfs: (ids, de, para) => emTransacao(() => ids.forEach((id) => doCardNoPROMeiro.ligarPdf.run(para, id, de))),
  };
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
  // o Trello e o Teable fora do ar (#79): desde quando cada um não responde (guardado: vale depois de reiniciar)
  const fora = criarForaDoAr(copia);
  // o Andamento do projeto (#92): o GitHub lido com o GITHUB_TOKEN, guardado alguns minutos e, a última leitura, na cópia
  const andamentoDoProjeto = criarAndamento({ copia, buscar: buscarNoGitHub });

  /* ---------- os módulos da configuração de agora ---------- */
  // as tabelas do Teable (#76): achadas pelo nome na base; a última descoberta fica guardada (vale com o Teable fora)
  const descoberta = criarDescoberta({ copia, buscar: buscarNoTeable });
  let tabelas = descoberta.guardada(configuracao.valores());
  /** Uma geração: os módulos feitos de uma configuração, e quantos pedidos ainda estão usando ela. */
  function montar(valores) {
    const env = envDosModulos(valores, tabelas);
    // as praças da configuração (a coleção salva ou as de fábrica): o servidor passa estas a cada reconhecimento
    const g = { env, pracas: pracasDaConfiguracao(env), emCurso: 0, drenou: null };
    g.trello = fazer(fabricas.trello, env, { abrirPg: abrir, anexos });
    g.acervo = fazer(fabricas.acervo, env, { abrirPg: abrir, trello: g.trello, buscar: buscarNoTeable });
    g.vocabulario = criarVocabulario(env, fetch, cache, copia, null, abrir);
    g.pauta = criarPauta(env, g.vocabulario, abrir, cache, copia);
    // a correção de grafia (#114): a pauta inteira, lida do Postgres do Teable; aplicar e desfazer pela API (#115)
    g.correcoes = criarCorrecoes(env, abrir, { buscar: buscarNoTeable });
    // juntar atrações (#117): a escrita no Teable (só na base do PROMeiro), pelo caminho das Duplicadas para o acervo
    g.juntarAtracoes = criarJuntarAtracoes(env, { buscar: buscarNoTeable, abrir, acervo: g.acervo, regras: regrasDaAtracao });
    // o índice do buscar do Padeiro (#143): os filmes e as mensagens do Teams, do Postgres do Teable (só leitura)
    g.indiceDoBuscar = criarIndiceDoBuscar(env, { abrirPg: abrir });
    g.cadastros = fazer(fabricas.cadastros, env, { vocabulario: g.vocabulario });
    g.redatorProvavel = fazer(fabricas.redatorProvavel, env, { abrirPg: abrir });
    g.duplicadas = fazer(fabricas.duplicadas, env, { trello: g.trello, acervo: g.acervo, registro: registroDasDuplicadas, promeiro: promeiroDasDuplicadas });
    return g;
  }
  let geracao = montar(configuracao.valores());
  let { env, pracas, trello, acervo, vocabulario, pauta, cadastros, redatorProvavel, duplicadas } = geracao;
  const filmes = fazer(fabricas.filmes, env, { db, trello, abrirPg: abrir, anexos });

  /* Os nomes conhecidos para o histórico (#78): o último quadro lido (as listas, os campos, as opções e as
     etiquetas) e os nomes dos quadros e das bases que o PROMeiro já leu. */
  const conhecidos = { quadro: null, quadros: new Map(), bases: new Map() };
  const conhecerQuadro = (lido) => {
    if (lido?.quadro) {
      conhecidos.quadro = lido.quadro;
      if (lido.quadro.nome) conhecidos.quadros.set(lido.quadro.id, lido.quadro.nome);
    }
    return lido;
  };
  const conhecer = (mapa, itens) => {
    for (const x of itens ?? []) if (x?.id && x.nome) mapa.set(x.id, x.nome);
    return itens;
  };
  const nomeDoUsuario = db.prepare('SELECT nome FROM usuarios WHERE email = ?');
  /** O nome de quem já entrou no PROMeiro ou, senão, o da tabela designers (a última verificação); ou o e-mail. */
  const nomeDaPessoa = (email) => {
    const e = String(email ?? '').trim().toLowerCase();
    const designer = () => pessoas.guardada()?.designers?.find((d) => String(d.email ?? '').trim().toLowerCase() === e)?.nome;
    return nomeDoUsuario.get(e)?.nome || designer() || email;
  };
  /**
   * Muda a configuração e ela vale na hora, sem reiniciar: os módulos são refeitos com os valores novos, e o próximo
   * pedido já usa eles. O que estava em curso (um envio ao Trello, os filmes que estão indo) termina com a
   * configuração antiga; depois disso os módulos antigos são fechados (e a conexão deles com o Postgres).
   * A fila de leitura da prévia dos filmes continua a mesma.
   * @param mudancas { NOME: 'valor' | null } (null volta ao Portainer)
   * @param voltouDe a linha do histórico de que esta gravação voltou; quadro o quadro lido, para os nomes do histórico
   * @returns { valores, antigaFechada }: os valores novos, e a promessa de quando a configuração antiga foi fechada
   */
  function mudarConfiguracao(mudancas, { por = '', voltouDe = null, quadro = null } = {}) {
    const antes = configuracao.valores().TEABLE_PG_ESQUEMA;
    // o histórico (#78): toda gravação entra, com os nomes do quadro lido por último (ou o dado por quem grava)
    const descrever = (a, d, nomes) => descreverMudanca(a, d, nomes, { quadro: quadro ?? conhecidos.quadro, nomeDaPessoa, nomeDoQuadro: (id) => conhecidos.quadros.get(id) ?? '', nomeDaBase: (id) => conhecidos.bases.get(id) ?? '' });
    const valores = configuracao.salvar(mudancas, { por, voltouDe, descrever });
    // a base trocou: as tabelas guardadas são da outra (a descoberta nova vem em seguida)
    if (valores.TEABLE_PG_ESQUEMA !== antes) tabelas = descoberta.guardada(valores);
    const r = trocarGeracao(valores);
    if (valores.TEABLE_PG_ESQUEMA !== antes) void redescobrir();
    return r;
  }
  /** Refaz os módulos com estes valores (a configuração salva e as tabelas descobertas de agora). */
  function trocarGeracao(valores) {
    const velha = geracao;
    geracao = montar(valores);
    ({ env, pracas, trello, acervo, vocabulario, pauta, cadastros, redatorProvavel, duplicadas } = geracao);
    // o quadro trocou: o webhook vai para o novo (o do quadro antigo sai)
    if (String(velha.env.TRELLO_QUADRO ?? '').trim() !== String(env.TRELLO_QUADRO ?? '').trim()) void garantirOAviso();
    const filmesVelho = filmes.reconfigurar?.(env, { trello }) ?? null;
    // a lista de atrações guardada é da configuração antiga: a próxima leitura vai ao Teable
    void Promise.resolve(cache.guardar('vocabulario', null, 1)).catch(() => {});
    return { valores, antigaFechada: aposentar(velha, filmesVelho) };
  }
  /**
   * Descobre de novo as tabelas na base (na partida, ao abrir a Configuração, ao trocar a base). Se mudou o id ou o
   * nome no Postgres de alguma, os módulos são refeitos (vale na hora, como salvar a configuração). Com o Teable fora,
   * vale a última descoberta, e uma nova tentativa fica marcada para daqui a alguns minutos.
   */
  let descobrindo = null;
  let tentarDeNovo = null;
  function redescobrir() {
    descobrindo ??= (async () => {
      const daBase = (v) => String(v.TEABLE_PG_ESQUEMA ?? '').trim();
      for (;;) {
        const base = daBase(configuracao.valores());
        const d = await descoberta.descobrir(configuracao.valores()).catch(() => null);
        // a base trocou enquanto lia: descobre de novo, na nova
        if (daBase(configuracao.valores()) !== base) continue;
        if (d === null) return null;
        const muda = !mesmasTabelas(d, tabelas);
        tabelas = d;
        if (d.foraDoAr) fora.caiu('teable', d.foraDoAr);
        else fora.voltou('teable');
        // sem esperar a geração antiga fechar: quem pediu a descoberta pode ser um pedido dela
        if (muda) trocarGeracao(configuracao.valores());
        clearTimeout(tentarDeNovo);
        if (d.foraDoAr) (tentarDeNovo = setTimeout(() => void redescobrir(), 5 * 60_000)).unref?.();
        return d;
      }
    })().finally(() => (descobrindo = null));
    return descobrindo;
  }
  const primeiraDescoberta = redescobrir();

  /**
   * A correção de grafia das atrações (#116), só para administradores: GET /api/correcoes/atracoes?pagina= devolve uma
   * página dos grupos de fichas que parecem a mesma atração, cada ficha com quantas artes do acervo, Produções e regras
   * tem; POST /api/correcoes/atracoes/nao-sao-a-mesma { ids } guarda "não são a mesma" para as fichas de um grupo (nada
   * é gravado no Teable); POST /api/correcoes/atracoes/juntar { ids, fica, nome } junta o grupo (#117) na ficha que fica,
   * com o nome final, e responde o id da junção no registro das correções (para desfazer).
   */
  async function rotaDasAtracoesParecidas(req, res, eu, caminho) {
    const marcar = caminho.endsWith('/nao-sao-a-mesma');
    const juntar = caminho.endsWith('/juntar');
    if (req.method !== (marcar || juntar ? 'POST' : 'GET')) return json(res, 405, { erro: 'Método não permitido.' });
    if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores veem a correção de grafia.' });
    const corpo = marcar || juntar ? ((await lerCorpo(req)) ?? {}) : null;
    const ids = corpo ? idsDoGrupo(corpo.ids) : null;
    if (corpo && !ids) return json(res, 400, { erro: 'Quais fichas do grupo?' });
    if (juntar) return juntarAtracoes(res, eu, ids, corpo);
    const lido = await cadastros.ler();
    if (!lido.ligado) return json(res, 503, { erro: 'Os cadastros de atrações não estão ligados ao Teable.' });
    const fichas = lido.atracoes.map(({ id, nome, categoria }) => ({ id, nome, categoria }));
    if (marcar) {
      const grupo = atracoesParecidas.naoSaoAMesma(fichas, ids, eu.email);
      if (!grupo) return json(res, 409, { erro: 'O grupo mudou desde que a tela leu as atrações. Leia de novo.' });
      console.log(`[correcoes] ${eu.email} disse que não são a mesma: ${grupo.fichas.map((f) => f.nome).join(', ')}`);
      return json(res, 200, { ok: true });
    }
    const busca = new URL(req.url, 'http://x').searchParams;
    const pagina = /^\d{1,5}$/.test(busca.get('pagina') ?? '') ? Math.max(1, Number(busca.get('pagina'))) : 1;
    // as Produções pela atração do Roteiro ou pela key da claquete, com as keys destas fichas
    const programas = lido.atracoes.map((a) => ({ nome: a.nome, chaves: a.keys.map((k) => k.key) }));
    const artes = acervo.ligado ? await acervo.totaisPorFicha().catch((e) => (console.warn(`[correcoes] não li o acervo: ${e instanceof Error ? e.message : e}`), null)) : null;
    const contas = { artes, producoes: producoes.porAtracao((claquete) => atracaoPelaClaquete(claquete, programas, pracas)), regras: regrasDaAtracao.porAtracao() };
    return json(res, 200, atracoesParecidas.grupos(fichas, contas, pagina));
  }

  /** As fichas sendo juntadas agora (dois pedidos ao mesmo tempo não juntam a mesma ficha duas vezes). */
  const juntando = new Set();
  /** Depois de juntar ou desfazer: os cadastros e o reconhecimento das atrações leem o Teable de novo. */
  const depoisDeJuntar = async () => {
    await cadastros.ler(true).catch(() => {});
    await vocabulario.renovar?.(null).catch(() => {});
  };
  /**
   * Juntar atrações (#117): o grupo tem de ser o que a tela mostra agora (as mesmas fichas, lidas de novo do Teable), a
   * ficha que fica é dele e o nome final não é de outra atração. Só na base do PROMeiro (de outra, 409).
   */
  async function juntarAtracoes(res, eu, ids, corpo) {
    const nome = String(corpo.nome ?? '').replace(/\s+/g, ' ').trim();
    if (!nome || nome.length > 80) return json(res, 400, { erro: 'Qual o nome final da atração? (até 80 letras)' });
    if (typeof corpo.fica !== 'string' || !ids.includes(corpo.fica)) return json(res, 400, { erro: 'A ficha que fica tem de ser do grupo.' });
    const junta = geracao.juntarAtracoes;
    const pode = junta.escrita();
    if (!pode.pode) return json(res, 409, { erro: pode.aviso });
    if (ids.some((id) => juntando.has(id))) return json(res, 409, { erro: 'Já há uma junção destas fichas em curso.' });
    ids.forEach((id) => juntando.add(id));
    try {
      const lido = await cadastros.ler(true);
      if (!lido.ligado) return json(res, 503, { erro: 'Os cadastros de atrações não estão ligados ao Teable.' });
      const fichas = lido.atracoes.map(({ id, nome: n, categoria }) => ({ id, nome: n, categoria }));
      if (!atracoesParecidas.grupoAtual(fichas, ids)) return json(res, 409, { erro: 'O grupo mudou desde que a tela leu as atrações. Leia de novo.' });
      const outra = lido.atracoes.find((a) => !ids.includes(a.id) && a.nome.toLowerCase() === nome.toLowerCase());
      if (outra) return json(res, 409, { erro: `${outra.nome} é o nome de outra atração.` });
      const doGrupo = (id) => lido.atracoes.find((a) => a.id === id);
      const r = await junta.juntar({ fica: doGrupo(corpo.fica), saem: ids.filter((id) => id !== corpo.fica).map(doGrupo), nome, por: eu.email, registro: registroDeCorrecoes });
      await depoisDeJuntar();
      if (!r.ok) {
        console.warn(`[correcoes] ${eu.email} não juntou ${ids.join(', ')}: ${r.erro}`);
        const nao = r.naoDesfeito.length ? ` Não consegui desfazer: ${r.naoDesfeito.join('; ')}.` : ' O que tinha sido feito foi desfeito.';
        return json(res, 502, { erro: `Parei ao ${r.erro}. Nada foi juntado.${nao}`, naoDesfeito: r.naoDesfeito });
      }
      console.log(`[correcoes] ${eu.email} juntou atrações: ${r.resumo}`);
      return json(res, 200, { registro: r.registro, fica: corpo.fica, nome, resumo: r.resumo, passaram: r.passaram });
    } finally {
      ids.forEach((id) => juntando.delete(id));
    }
  }

  /**
   * Aplicar e desfazer a correção de grafia (#115), só para administradores:
   * - POST /api/correcoes/pauta/aplicar { propostas: [{ id, de, mudouEm }] } grava as marcadas no Teable (só na base do
   *   PROMeiro; de outra base, 409) e responde quantas deram certo e quantas falharam (a linha que mudou desde a proposta);
   * - GET /api/correcoes/registro?pagina= lista as correções aplicadas (a mais recente primeiro), com o nome de quem aplicou;
   * - POST /api/correcoes/desfazer { ids } desfaz as correções do registro, com a conferência de "mudou desde então".
   */
  async function rotaDoRegistroDeCorrecoes(req, res, eu, caminho) {
    const ler = caminho === '/api/correcoes/registro';
    if (req.method !== (ler ? 'GET' : 'POST')) return json(res, 405, { erro: 'Método não permitido.' });
    if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores aplicam e desfazem a correção de grafia.' });
    if (ler) {
      const busca = new URL(req.url, 'http://x').searchParams;
      const pagina = /^\d{1,5}$/.test(busca.get('pagina') ?? '') ? Math.max(1, Number(busca.get('pagina'))) : 1;
      const lido = registroDeCorrecoes.listar(pagina);
      const nomes = (c) => ({ ...c, porNome: nomeDaPessoa(c.por), ...(c.desfeita ? { desfeita: { ...c.desfeita, porNome: nomeDaPessoa(c.desfeita.por) } } : {}) });
      return json(res, 200, { ...lido, itens: lido.itens.map(nomes) });
    }
    const corpo = (await lerCorpo(req)) ?? {};
    if (caminho === '/api/correcoes/desfazer') {
      const ids = idsParaDesfazer(corpo.ids);
      if (!ids) return json(res, 400, { erro: 'Quais correções desfazer?' });
      const r = await registroDeCorrecoes.desfazer(ids, eu.email);
      console.log(`[correcoes] ${eu.email} desfez ${r.certas.length} correção(ões)${r.falhas.length ? `; ${r.falhas.length} não` : ''}`);
      return json(res, 200, r);
    }
    const pedidas = propostasParaAplicar(corpo.propostas);
    if (!pedidas) return json(res, 400, { erro: 'Quais propostas aplicar? (de 1 a 100)' });
    const correcoes = geracao.correcoes;
    const pode = correcoes.escrita();
    if (!pode.pode) return json(res, 409, { erro: pode.aviso });
    const r = await correcoes.aplicar(pedidas, eu.email, registroDeCorrecoes);
    console.log(`[correcoes] ${eu.email} aplicou ${r.certas.length} correção(ões) na pauta${r.falhas.length ? `; ${r.falhas.length} falharam` : ''}`);
    return json(res, 200, r);
  }

  /* ---------- a seção Pessoas (#77): os designers da produção da arte × a tabela designers (nada do Trello) ---------- */
  const pessoas = criarPessoas({ db, copia, buscar: buscarNoTeable });
  // ligar pessoa e cadastro pelo e-mail (#106): as sugestões "É" e o "Não é" guardado
  const ligacaoDePessoas = criarLigacaoDePessoas({ db });
  // as atrações parecidas da correção de grafia (#116): o "não são a mesma" guardado
  const atracoesParecidas = criarAtracoesParecidas({ db });
  // o registro da correção de grafia (#115): cada correção aplicada, para desfazer; cada tipo dá o seu desfazer (a
  // pauta e juntar atrações, #117)
  const registroDeCorrecoes = criarRegistroDeCorrecoes({
    db,
    desfazedores: {
      [TIPO_DA_PAUTA]: (c) => geracao.correcoes.desfazer(c),
      [TIPO_DAS_ATRACOES]: async (c) => {
        const r = await geracao.juntarAtracoes.desfazer(c);
        await depoisDeJuntar();
        return r;
      },
    },
  });
  // as preferências de cada pessoa (#101), no SQLite: a última área usada, o arranjo da Pauta da edição…
  const preferencias = criarPreferencias(db);
  // o apelido da claquete (#120), um por claquete (#154), no SQLite: só para mostrar, o envio continua com a claquete
  // original; a chave tira a praça do fim, com as praças de agora
  const apelidos = criarApelidos(db, () => pracas);
  /** O card da tela de produções com as versões da chamada (#121), prontas: as à mão no apelido da claquete (#152, #154),
      ou o código do apelido ou da claquete (sem a praça no fim), ou as do roteiro dele; o dia das etiquetas sem data na
      claquete é o do prazo. */
  const comAsVersoes = (card) => {
    if (!card) return card;
    const doRoteiro = apelidos.roteiroDaProducao(card.id);
    // as versões lidas vão junto (#154): a Produção aberta edita as versões à mão e refaz a conta na hora
    return { ...card, versoesLidas: doRoteiro.lidas, versoesDaChamada: versoesDaChamada({ ...doRoteiro, claquete: semPracaNoFim(card.claquete ?? '', pracas), dia: card.prazo ? diaDoPrazo(card.prazo) : '' }) };
  };
  // as áreas de trabalho (#101): quem é quem pelo e-mail nos cadastros
  const areas = criarAreas();
  // montar a pauta (#123): o papel de coordenação e o rascunho do dia, no SQLite (nada vai ao Teable)
  const escala = criarEscala(db);
  // o cadastro das ilhas (#124), também no SQLite: a montagem da pauta é quem usa
  const ilhas = criarIlhas(db);
  // o caminho do Padeiro (#137): a chave do Padeiro (só o hash), no SQLite
  const padeiros = criarPadeiros(db);
  // o projeto criado, aberto ou alterado no Padeiro (#144), no lugar do fluxo "PROMO - PROJETO" do n8n
  const projetoDoPadeiro = criarProjetoDoPadeiro({ buscar: buscarNoTeable });
  // as ausências com período (#128) e as demandas para distribuir, no SQLite, junto da escala
  const ausencias = criarAusencias(db);
  // os nomes novos da pauta (#132), pendentes nos Cadastros
  const nomesNovos = criarNomesNovos(db);
  // a coluna lateral (#126): "Para distribuir", mover a demanda e escalar quem está sem escala
  const distribuicao = criarDistribuicao(db, escala);
  // o cartão da pauta no Teams (#135): nos horários da Configuração e ao republicar; o último envio fica no SQLite
  const cartaoDoTeams = criarCartaoDoTeams({ db, escala, ilhas, valores: () => configuracao.valores(), enviar: buscarNoTeams, relogio });
  // a semana lado a lado com a planilha (#133): a foto crua das abas, que o n8n manda, no SQLite (só quando a aba muda)
  const fotosDaEdicao = criarFotosDaEdicao(db, { agora: relogio });
  // a virada (#134): com a chave da Configuração ligada, publicar grava o dia na pauta da edição do Teable (o vínculo de
  // cada item com o registro fica no SQLite); os editores do cadastro dão o link, e o Postgres, as linhas do dia
  const pautaNoTeable = criarPautaNoTeable(db, {
    escala,
    env: () => env,
    buscar: buscarNoTeable,
    editores: async () => {
      const lido = await cadastros.ler();
      if (!lido?.ligado) throw new Error('não li os editores do cadastro');
      return lido.editores;
    },
    idsDoDia: async (dia) => {
      const lido = await pauta.dia(dia);
      return lido.origem === 'banco' ? lido.linhas.map((l) => l.id).filter(Boolean) : null;
    },
  });
  const conferenciaDoCartao = agendar(() => cartaoDoTeams.conferir(), 30 * 1000);
  conferenciaDoCartao?.unref?.();
  /** As áreas da pessoa e o resto do que a rota de quem está logado devolve delas (a coordenação tem a do Editor). */
  const daPessoa = (email, admin) => areas.daPessoa(email, { cadastros, admin, preferencias, coordenacao: escala.ehCoordenacao(email) });
  /** Olha a produção da arte e a tabela designers, com os módulos de agora (nunca lança: o erro vem no resultado). */
  // a última verificação desta partida (com o erro e o que não respondeu); sem nenhuma, a guardada
  let ultimaVerificacao = null;
  const ultimaDasPessoas = () => ultimaVerificacao ?? pessoas.guardada();
  const verificarPessoas = async () => {
    const r = await pessoas.verificar(trello, env);
    // #79: o Teable fora do ar fica marcado (desde quando); respondeu, volta. As Pessoas não leem o Trello (ADR 0006)
    for (const servico of ['teable'])
      if (r.falhou?.includes(servico)) fora.caiu(servico, r.motivo);
      else if (r.falhou) fora.voltou(servico);
    ultimaVerificacao = r;
    return r;
  };
  // na partida (depois de achar as tabelas) e uma vez por dia, sem depender de alguém abrir a Configuração
  const primeiraVerificacao = primeiraDescoberta.then(() => verificarPessoas()).catch(() => null);
  // a carga inicial das Produções (#86): na subida, só quando não há nenhuma (depois de achar as tabelas); de novo,
  // pela rota do administrador. Quem mantém em dia é a releitura da produção da arte (logo abaixo), de minuto em minuto
  const cargaInicial = primeiraDescoberta
    .then(() => (producoes.vazia() ? producoes.carregar(trello, pracas) : null))
    .catch((e) => console.warn(`[producoes] a carga inicial não rodou: ${e instanceof Error ? e.message : e}`));
  const verificacaoDiaria = agendar(() => verificarPessoas(), UM_DIA);
  verificacaoDiaria?.unref?.();

  /* ---------- a releitura da produção da arte (ADR 0006): os eventos da Produção nascem do Teable ---------- */
  // por enquanto o PROMeiro só ESCREVE no Trello: o que ele lê vem do Teable. De minuto em minuto, as linhas que o
  // Teable mudou desde a última releitura (__last_modified_time) são comparadas com as Produções guardadas. Com o
  // aviso do Trello ligado (TRELLO_AVISO=1, o modo antigo), a releitura não roda: os eventos vêm de uma fonte só
  let relendo = null;
  let ultimaReleitura = null;
  let cargaFeita = false;
  /** Relê as linhas mudadas desde a marca guardada (nunca antes da janela) e anota o que mudou. Sem nenhuma Produção,
      faz a carga inteira no lugar. Nunca lança. @returns { em, desde, lidas, novas, mudadas, anotados } ou null */
  function relerAProducao() {
    relendo ??= (async () => {
      // com o aviso do Trello ligado (TRELLO_AVISO), a fonte dos eventos é ele: uma fonte por vez
      if (!cargaFeita || !trello.producaoAlteradaDesde || avisoLigado(env)) return null;
      const inicio = Date.now();
      const janela = new Date(inicio - JANELA_DA_RELEITURA).toISOString();
      const guardada = copia.ler(MARCA_DA_RELEITURA)?.dados?.ate ?? null;
      const desde = guardada && guardada > janela ? guardada : janela;
      try {
        // nenhuma Produção e nenhuma carga que deu certo (a da subida falhou: o Teable estava fora): a carga inteira
        if (producoes.vazia() && !producoes.contagem().ultimaCarga) {
          const carga = await producoes.carregar(trello, pracas);
          if (carga) copia.guardar(MARCA_DA_RELEITURA, { ate: new Date(inicio - MARGEM_DA_RELEITURA).toISOString() });
          return carga ? (ultimaReleitura = { em: new Date(inicio).toISOString(), desde, lidas: carga.linhas, novas: carga.novas, mudadas: carga.atualizadas, anotados: 0 }) : null;
        }
        const linhas = await trello.producaoAlteradaDesde(desde, LIMITE_DA_RELEITURA);
        if (!linhas) return null;
        const r = producoes.reler(linhas, pracas);
        // a próxima continua da modificação mais nova lida, com uma margem (a linha relida de novo, igual, não muda
        // nada); no limite, dela mesma, para andar
        const maisNova = linhas.reduce((m, l) => (l.modificadoEm && l.modificadoEm > m ? l.modificadoEm : m), '');
        const ate = !maisNova ? desde : linhas.length >= LIMITE_DA_RELEITURA ? maisNova : new Date(Math.max(Date.parse(desde), Date.parse(maisNova) - MARGEM_DA_RELEITURA)).toISOString();
        copia.guardar(MARCA_DA_RELEITURA, { ate });
        ultimaReleitura = { em: new Date(inicio).toISOString(), desde, ...r };
        if (r.novas || r.anotados) console.log(`[producoes] releitura do Teable: ${r.lidas} linhas mudadas, ${r.novas} Produções novas, ${r.anotados} eventos`);
        return ultimaReleitura;
      } catch (e) {
        console.warn(`[producoes] não consegui reler a produção da arte: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    })().finally(() => (relendo = null));
    return relendo;
  }
  // depois da carga inicial (a releitura não cria Produção antes dela: a carga só roda com nenhuma) e de minuto em minuto
  const releituraPronta = cargaInicial.then(() => {
    cargaFeita = true;
    return relerAProducao();
  });
  const releitura = agendar(() => relerAProducao(), UM_MINUTO);
  releitura?.unref?.();

  /* ---------- o aviso do Trello (#87): o webhook do quadro e a fila do que chegou ---------- */
  let garantindo = null;
  let faltasAvisadas = '';
  /** Confere o webhook do PROMeiro no quadro (registra, liga de novo, tira o do quadro antigo). Nunca lança. */
  function garantirOAviso() {
    garantindo ??= (async () => {
      // desligado por padrão (ADR 0006): sem TRELLO_AVISO, nenhum webhook é registrado nem conferido
      if (!avisoLigado(env)) {
        if (faltasAvisadas !== 'desligado') console.log('[aviso do trello] desligado (TRELLO_AVISO): os eventos vêm da releitura do Teable');
        faltasAvisadas = 'desligado';
        return null;
      }
      const faltam = faltasDoAviso(env);
      if (faltam.length) {
        // o log diz o que falta uma vez (e de novo se mudar), não a cada hora
        if (faltam.join() !== faltasAvisadas) console.log(`[aviso do trello] desligado: falta ${faltam.join(', ')}`);
        faltasAvisadas = faltam.join();
        return null;
      }
      faltasAvisadas = '';
      try {
        const r = await garantirWebhook(trello.webhooks, { callbackURL: enderecoDoAviso(env), quadro: listasDoQuadro(env).quadro });
        if (r.feito !== 'existe') console.log(`[aviso do trello] webhook do quadro ${r.feito === 'criado' ? 'registrado' : 'ligado de novo'}`);
        return r;
      } catch (e) {
        console.warn(`[aviso do trello] não consegui conferir o webhook: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    })().finally(() => (garantindo = null));
    return garantindo;
  }
  let esperaDoWebhook = null;
  const avisoPronto = new Promise((ok) => {
    esperaDoWebhook = setTimeout(() => void garantirOAviso().then(ok), esperaDoAviso);
    esperaDoWebhook.unref?.();
  });
  // os avisos aceitos (e o que a recuperação leu) são processados um de cada vez, na ordem em que chegaram
  let filaDosAvisos = Promise.resolve();
  const naFilaDosAvisos = (f) => (filaDosAvisos = filaDosAvisos.then(f));

  /* ---------- o que a tradução lê do quadro (#88): as listas, os campos ligados e os designers ---------- */
  // os campos personalizados do quadro lidos por último (o nome de cada opção); sem eles, os nomes de fábrica
  let camposDoQuadro = [];
  const quadroDeAgora = () => quadroDoAviso(env, { camposDoQuadro, designers: pessoas.guardada()?.designers ?? [] });

  /* ---------- recuperar o que faltou (#88): as ações do quadro desde o último evento ---------- */
  const limites = { ...RECUPERACAO, ...limitesDaRecuperacao };
  // desde quando ler: na subida, o evento mais novo guardado (antes de chegar qualquer aviso novo); depois, o começo
  // da última recuperação que deu certo, com uma margem. Nunca antes da janela (limites.dias)
  let desdeAMarca = producoes.ultimoEvento();
  const MARGEM = 5 * 60 * 1000;
  let recuperando = null;
  let ultimaRecuperacao = null;
  /**
   * Lê as ações do quadro desde a marca (só os tipos que a tradução lê, paginando até o limite) e anota pela mesma
   * tradução do aviso, na fila dos avisos: o id da ação não repete, então o que já chegou pelo aviso não duplica.
   * Não cria Produção: as ações só viram eventos das Produções que já existem (da carga do Teable ou do aviso ao vivo).
   * Nunca lança. @returns { desde, lidas, paginas, noLimite, anotados, repetidos, ignorados } ou null (sem o Trello)
   */
  function recuperarOQueFaltou() {
    recuperando ??= (async () => {
      const quadro = listasDoQuadro(env).quadro;
      if (!avisoLigado(env)) return null;
      if (!quadro || !trello.config?.chave || !trello.config?.token || !trello.ler) return null;
      const inicio = Date.now();
      const janela = new Date(inicio - limites.dias * UM_DIA).toISOString();
      const desde = desdeAMarca && desdeAMarca > janela ? desdeAMarca : janela;
      try {
        // os nomes das opções dos campos (prioridade, complexidade, praça): sem o quadro, ficam os de antes
        const campos = await Promise.resolve(trello.ler(`/boards/${encodeURIComponent(quadro)}/customFields`)).catch(() => null);
        if (Array.isArray(campos)) camposDoQuadro = campos;
        const { acoes, paginas, noLimite } = await acoesDesde(trello, { quadro, desde, porPagina: limites.porPagina, paginas: limites.paginas });
        const doQuadro = quadroDeAgora();
        const pracasDeAgora = pracas;
        const r = await naFilaDosAvisos(() => producoes.anotar(acoes.flatMap((a) => eventosDoAviso(a, doQuadro)), pracasDeAgora, { criar: false }));
        desdeAMarca = new Date(inicio - MARGEM).toISOString();
        ultimaRecuperacao = { em: new Date(inicio).toISOString(), desde, lidas: acoes.length, paginas, noLimite, ...r };
        if (r.anotados || noLimite) console.log(`[aviso do trello] recuperei ${r.anotados} eventos de ${acoes.length} ações desde ${desde}${noLimite ? ` (parei no limite de ${paginas} páginas: as mais velhas ficaram de fora)` : ''}`);
        return ultimaRecuperacao;
      } catch (e) {
        console.warn(`[aviso do trello] não consegui recuperar as ações do quadro: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    })().finally(() => (recuperando = null));
    return recuperando;
  }
  // na subida (depois do webhook, da carga inicial e das Pessoas) e de hora em hora, junto da conferência do webhook
  const recuperacaoPronta = Promise.all([avisoPronto, cargaInicial, primeiraVerificacao]).then(() => recuperarOQueFaltou());
  const conferenciaDoAviso = agendar(() => garantirOAviso().then(() => recuperarOQueFaltou()), UMA_HORA);
  conferenciaDoAviso?.unref?.();
  /**
   * A rota do aviso (pública: a única fora do Cloudflare Access). HEAD responde 200 (o Trello confere o endereço
   * assim); POST só com a assinatura certa, e responde 200 antes de processar.
   */
  async function rotaDoAviso(req, res) {
    // desligado (o padrão, ADR 0006): a rota não existe
    if (!avisoLigado(env)) {
      req.resume();
      return json(res, 404, { erro: 'Não encontrado.' });
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'cache-control': 'no-store' });
      return res.end();
    }
    if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
    const segredo = segredoDoAviso(env);
    const callbackURL = enderecoDoAviso(env);
    const corpo = await lerCorpoDoAviso(req);
    if (!segredo || !callbackURL) return json(res, 503, { erro: 'O aviso do Trello não está configurado.' });
    if (!assinaturaConfere(corpo, req.headers['x-trello-webhook'], segredo, callbackURL)) {
      console.warn('[aviso do trello] aviso recusado: assinatura ausente ou errada');
      return json(res, 401, { erro: 'Assinatura inválida.' });
    }
    json(res, 200, { ok: true });
    // a configuração de quando chegou: o quadro (listas, campos, designers) e as praças
    const doQuadro = quadroDeAgora();
    const pracasDeAgora = pracas;
    naFilaDosAvisos(() => {
      let acao = null;
      try {
        acao = JSON.parse(corpo.toString('utf8'))?.action ?? null;
        const r = producoes.anotar(eventosDoAviso(acao, doQuadro), pracasDeAgora);
        if (r.anotados || r.ignorados) console.log(`[aviso do trello] ${String(acao?.type ?? '?').slice(0, 40)}: ${r.anotados} anotados, ${r.repetidos} repetidos, ${r.ignorados} fora do domínio`);
      } catch (e) {
        // só o tipo e o id da ação: o corpo não vai para o log
        console.warn(`[aviso do trello] não processei ${String(acao?.type ?? 'o aviso').slice(0, 40)} ${String(acao?.id ?? '').slice(0, 40)}: ${e instanceof Error ? e.message : e}`);
      }
    });
  }
  async function aposentar(velha, filmesVelho) {
    if (velha.emCurso) await new Promise((ok) => (velha.drenou = ok));
    await Promise.all([
      filmesVelho?.fechar(),
      // o módulo pronto que veio de fora é o mesmo nas duas gerações: esse fica aberto
      ...RECRIADOS.filter((n) => velha[n] !== geracao[n]).map((n) => velha[n]?.parar?.()),
    ]);
  }
  const q = {
    lista: db.prepare(
      `SELECT id, dono_email, dono_nome, publico, meta, n_artes, versoes_lidas, atualizado_em, revisado_email, revisado_nome,
              EXISTS (SELECT 1 FROM compartilhamentos c WHERE c.roteiro_id = roteiros.id) AS compartilhado,
              COALESCE((SELECT pode_editar FROM compartilhamentos c WHERE c.roteiro_id = roteiros.id AND c.email = ?), 0) AS pode_editar,
              e.estado AS envio_estado, e.card_id AS envio_card, e.url AS envio_url, e.erro AS envio_erro, e.em AS envio_em, e.por_nome AS envio_por,
              EXISTS (SELECT 1 FROM originais o WHERE o.roteiro_id = roteiros.id) AS tem_original
       FROM roteiros LEFT JOIN envios e ON e.roteiro_id = roteiros.id
       WHERE dono_email = ? OR publico = 1 OR id IN (SELECT roteiro_id FROM compartilhamentos WHERE email = ?)
       ORDER BY atualizado_em DESC LIMIT 2000`,
    ),
    listaTudo: db.prepare(
      `SELECT id, dono_email, dono_nome, publico, meta, n_artes, versoes_lidas, atualizado_em, revisado_email, revisado_nome,
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
    // o ciclo do roteiro (#102): quando o roteiro chegou à fila
    chegou: db.prepare('SELECT criado_em FROM roteiros WHERE id = ?'),
    guardarArtesNovas: db.prepare('UPDATE envios SET artes_novas = ?, atracao = ?, exibicao = ?, acervo_em = NULL WHERE roteiro_id = ?'),
    paraOAcervo: db.prepare(
      `SELECT e.roteiro_id, e.card_id, e.artes_novas, e.atracao, e.exibicao, json_extract(r.meta, '$.claquete') AS claquete
       FROM envios e LEFT JOIN roteiros r ON r.id = e.roteiro_id
       WHERE e.estado = 'enviado' AND e.artes_novas IS NOT NULL AND e.acervo_em IS NULL AND e.card_id IS NOT NULL`,
    ),
    noAcervo: db.prepare('UPDATE envios SET acervo_em = ?, atracao = ? WHERE roteiro_id = ?'),
    marcarEnvio: db.prepare('INSERT OR REPLACE INTO envios (roteiro_id, estado, card_id, url, erro, avisos, em, por_email, por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    // as da fila, das mais novas para as mais velhas (a contagem das claquetes que mudariam de praça, #73)
    claquetesRecentesDaFila: db.prepare("SELECT json_extract(meta, '$.claquete') AS claquete FROM roteiros WHERE atualizado_em >= ? ORDER BY atualizado_em DESC, rowid DESC"),
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
    // o fogo da arte pela janela do After (#147): só a meta muda
    soMeta: db.prepare('UPDATE roteiros SET meta = ?, atualizado_em = ? WHERE id = ?'),
    revisou: db.prepare('UPDATE roteiros SET revisado_email = ?, revisado_nome = ? WHERE id = ?'),
    versoesLidas: db.prepare('UPDATE roteiros SET versoes_lidas = ? WHERE id = ?'),
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
    todosOsUsuarios: db.prepare('SELECT email, nome FROM usuarios ORDER BY nome COLLATE NOCASE LIMIT 1000'),
    cores: db.prepare("SELECT email, cor FROM usuarios WHERE cor IS NOT NULL AND cor <> '' LIMIT 2000"),
    mudarCor: db.prepare('UPDATE usuarios SET cor = ? WHERE email = ?'),
    tourDe: db.prepare('SELECT tour_revisao_em FROM usuarios WHERE email = ?'),
    viuTour: db.prepare('UPDATE usuarios SET tour_revisao_em = ? WHERE email = ?'),
    compartilhadoCom: db.prepare('SELECT email, pode_editar FROM compartilhamentos WHERE roteiro_id = ? ORDER BY email'),
    temAcesso: db.prepare('SELECT pode_editar FROM compartilhamentos WHERE roteiro_id = ? AND email = ?'),
    limparCompartilhamento: db.prepare('DELETE FROM compartilhamentos WHERE roteiro_id = ?'),
    compartilhar: db.prepare('INSERT OR REPLACE INTO compartilhamentos (roteiro_id, email, pode_editar) VALUES (?, ?, ?)'),
    // o roteiro guardado que foi para este card (a aba Duplicadas)
    roteiroDoCard: db.prepare(
      `SELECT e.roteiro_id AS id, json_extract(r.meta, '$.claquete') AS claquete, e.por_nome AS por
       FROM envios e JOIN roteiros r ON r.id = e.roteiro_id WHERE e.card_id = ? ORDER BY e.em DESC LIMIT 1`,
    ),
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

  /** Os roteiros que esta pessoa vê, como a fila os recebe (o mesmo para "meus roteiros", #101). */
  const resumosPara = (eu) => {
    const apelidoDe = apelidos.porChave();
    return (aberto ? q.listaTudo.all(eu.email) : q.lista.all(eu.email, eu.email, eu.email)).map((l) => {
      const meta = JSON.parse(l.meta);
      const lidas = l.versoes_lidas ? JSON.parse(l.versoes_lidas) : [];
      return {
        id: l.id, meta, nArtes: l.n_artes, versoesLidas: lidas, atualizadoEm: l.atualizado_em,
        // as versões da chamada do card da agenda (#121), prontas: as à mão (#152), ou o código do apelido ou da claquete,
        // ou as do roteiro
        versoesDaChamada: (() => {
          // o apelido pela claquete do roteiro (#154)
          const a = apelidoDe.get(apelidos.chave(meta?.claquete));
          return versoesDaChamada({ lidas, claquete: String(meta?.claquete ?? ''), apelido: a?.apelido ?? '', mao: a?.mao ?? '', dia: String(meta?.dataExibicao ?? '') });
        })(),
        dono: { nome: l.dono_nome, email: l.dono_email }, publico: !!l.publico, meu: l.dono_email === eu.email,
        compartilhado: !!l.compartilhado,
        podeEditar: aberto || l.dono_email === eu.email || !!l.pode_editar,
        revisadoPor: l.revisado_email ? { nome: l.revisado_nome, email: l.revisado_email } : null,
        ...(l.envio_estado ? { trello: { estado: l.envio_estado, card: l.envio_card || undefined, url: l.envio_url ?? undefined, erro: l.envio_erro ?? undefined, em: l.envio_em, por: l.envio_por ?? undefined } } : {}),
        temOriginal: !!l.tem_original,
        ...(aberto ? { aberto: true } : {}),
      };
    });
  };

  /* ---------- edição simultânea ---------- */

  const salas = new Map(); // id → { doc, presenca, conexoes: Map<ws, { eu, editar, clientes:Set }>, gravar }
  /* Montar a pauta: duas pessoas ao mesmo tempo (#131). A sala de colaboração de um dia de montar a pauta é a mesma do
     editor de roteiros, com o id `montar-AAAA-MM-DD`: só a coordenação entra, a presença (quem está e em que campo) é
     repassada como no editor, e nada dela é guardado (o dia fica no SQLite da escala). O documento compartilhado só
     leva o aviso de que o dia mudou: `dia.versao`, a versão de montar a pauta, que só cresce; quem está na sala lê o
     dia de novo e junta com o que tem (src/modelo/juntarODia.ts). */
  const SALA_DO_DIA = /^montar-(\d{4}-\d{2}-\d{2})$/;
  // começa da hora da partida, para não voltar depois de reiniciar
  let versaoDoMontar = Date.now();
  /** Algum dia de montar a pauta mudou: a versão cresce e as salas abertas dos dias ficam sabendo (devolve a nova). */
  function mudouOMontar() {
    versaoDoMontar++;
    for (const [id, sala] of salas) if (SALA_DO_DIA.test(id)) sala.doc.getMap('dia').set('versao', versaoDoMontar);
    return versaoDoMontar;
  }
  const reservas = new Map(); // id → prazo: quem abriu primeiro preenche o documento compartilhado

  const enviar = (ws, encoder) => {
    if (ws.readyState === 1) ws.send(cod.toUint8Array(encoder), { binary: true });
  };
  function abrirSala(id) {
    let sala = salas.get(id);
    if (sala) return sala;
    const doc = new Y.Doc();
    const doDia = SALA_DO_DIA.test(id);
    const guardado = doDia ? null : q.ydoc.get(id)?.ydoc;
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
      if (!doDia && !sala.prazo) sala.prazo = setTimeout(gravar, 1500);
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
  /**
   * O fogo da arte mudado pela janela do After (#147): com `nivel` (1, 2 ou 3), a arte fica nesse nível (repetir não
   * muda nada); sem ele, sobe um nível, como o clique no fogo do editor (subirComplexidade). Pelo caminho do editor: a
   * complexidade no mapa "meta" do documento compartilhado (o da sala aberta, que quem está no editor vê na hora, ou o
   * guardado) e na meta do roteiro no banco; a BAIXA não é guardada. Com o documento, vale o que ele tem agora. Com
   * `gravar: false` (a ação atrasada), só diz o que seria.
   * @returns { antes, depois } (1, 2 ou 3), ou null sem o roteiro
   */
  function fogoNoRoteiro(id, chave, { nivel: desejado = null, gravar = true } = {}) {
    const linha = q.um.get(id);
    if (!linha) return null;
    const meta = JSON.parse(linha.meta);
    const sala = salas.get(id);
    let doc = sala?.doc;
    if (!doc) {
      const guardado = q.ydoc.get(id)?.ydoc;
      if (guardado) Y.applyUpdate((doc = new Y.Doc()), guardado);
    }
    const m = doc?.getMap('meta');
    const atual = m?.size ? m.get('complexidade') : meta.complexidade;
    const marcas = atual && typeof atual === 'object' ? atual : {};
    const noNivel = () => {
      const resto = { ...marcas };
      delete resto[chave];
      const novas = desejado === 1 ? resto : { ...resto, [chave]: desejado };
      return Object.keys(novas).length ? novas : undefined;
    };
    const complexidade = desejado ? noNivel() : subirComplexidade({ complexidade: marcas }, chave).complexidade;
    const nivel = (c) => ([2, 3].includes(c?.[chave]) ? c[chave] : 1);
    if (gravar) {
      if (complexidade) meta.complexidade = complexidade;
      else delete meta.complexidade;
      q.soMeta.run(JSON.stringify(meta), new Date().toISOString(), id);
      if (m?.size) {
        doc.transact(() => (complexidade ? m.set('complexidade', complexidade) : m.delete('complexidade')));
        // a sala aberta grava sozinha (o documento mudou); a fechada, aqui
        if (!sala) q.salvarYdoc.run(Y.encodeStateAsUpdate(doc), id);
      }
    }
    return { antes: nivel(marcas), depois: nivel(complexidade) };
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
      if (SALA_DO_DIA.test(id)) continue;
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
      // a sala de um dia de montar a pauta (#131): só a coordenação, sempre editando
      const doDia = SALA_DO_DIA.exec(m[1]);
      if (doDia) {
        if (!escala.ehCoordenacao(eu.email) || diaOuHoje(doDia[1], '') !== doDia[1]) return recusar('404 Not Found');
        return wss.handleUpgrade(req, socket, head, (ws) => conectar(ws, m[1], eu, true));
      }
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
    const doDia = SALA_DO_DIA.test(id);
    if (!doDia) avisarNoRoteiro(id);
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
      if (!doDia) avisarNoRoteiro(id);
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
        roteiro: id,
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
  // (a condição é olhada a cada vez: a configuração pode mudar com o servidor de pé)
  {
    const conferirFilmes = () => {
      if (!(trello.filmesProximos && acervo.ligado && acervo.grava)) return;
      void trello.filmesProximos(14).then(filmesNoAcervo).catch((e) => console.warn(`[filmes] ${e instanceof Error ? e.message : e}`));
    };
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
    return (e) => ligadas[e.card_id] || atracaoPelaClaquete(e.claquete ?? '', programas, pracas);
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

  /**
   * Montar a pauta (#123), só para a coordenação: GET /api/montar-pauta?dia= (sem ele, amanhã, em São Paulo) lê o
   * rascunho do dia, com as abas da semana (o estado de cada dia), os turnos e a lista dos editores cadastrados; PUT
   * { posicoes, recado } troca o rascunho do dia inteiro (o horário e a claquete vão para o padrão; os avisos de cada
   * posição e o recado do dia, #125, como foram escritos) e devolve o mesmo que o GET.
   * Conferir e publicar (#127), todos POST e devolvendo o mesmo que o GET: /conferida { chave, certo } dispensa (ou
   * reabre) uma pendência da conferência; /publicar publica o rascunho gravado, mesmo com pendências, e guarda quantas
   * "para olhar" ficaram; /desfazer tira a última publicação. Fica no SQLite do PROMeiro; com a chave da virada ligada
   * (#134), publicar e desfazer também deixam o dia no Teable igual à publicação que vale (`noTeable` diz como foi).
   * O rascunho nunca vai ao Teable. Os turnos são os da Configuração (#124) e, no fim, os que saíram
   * dela e ainda têm posição no dia; a ilha sai do cadastro das ilhas (a que já estava na posição continua, mesmo
   * removida do cadastro); vêm junto as ilhas, a de costume de cada editor e as ilhas ocupadas naquele turno.
   * A coluna lateral (#126), todos POST e devolvendo o mesmo que o GET (que traz também a lista "Para distribuir"):
   * /para-distribuir { texto } junta a lista escrita ou colada (uma claquete por linha); /levar { id, posicao, antesDe }
   * leva uma claquete da lista para a posição; /mover { demanda, posicao, antesDe } move a demanda; /devolver
   * { demanda } a devolve para a lista; /escalar { editor, posicao } ou { editor, turno, id? } escala quem está sem escala
   * (numa posição, ou numa nova do turno, com o id que a tela já mostrou, #131), e recusa quem está fora no dia.
   * Distribuir sozinho (#151): /distribuir põe a lista "Para distribuir" inteira nos editores escalados (e não fora) do
   * rascunho, numa gravação só, e devolve também `distribuidas` (cada claquete com a posição, o editor, o motivo e de
   * quem era); /desfazer-distribuicao { itens: [{ id, deQuem }] } as devolve para a lista, de uma vez.
   * Duas pessoas ao mesmo tempo (#131): o PUT com `base` ({ posicoes, recado }, o dia como a pessoa o leu) junta o que
   * ela mudou desde a base com o que está gravado (src/modelo/juntarODia.ts); toda resposta traz a `versao` e toda
   * mudança avisa a sala do dia (`montar-AAAA-MM-DD`).
   * Repetir (#129): POST /repetir { de } copia para o dia vazio a escala do mesmo dia na semana passada ('semana-passada'),
   * a de ontem ('ontem') ou, em cada dia vazio da semana, a do mesmo dia na semana passada ('semana-inteira'): a ilha
   * (a que ainda está no cadastro), o editor, o horário e as tarefas, nunca as claquetes, os avisos nem o recado. Quem
   * está fora no dia de destino vira vaga, com o motivo. Devolve o mesmo que o GET e `repetido`, um item por dia
   * preenchido, com as vagas. O dia vazio vem com `repetir`, o que cada opção traz (null no dia que já tem escala).
   * O colar da planilha (#130) é lido no navegador; o GET traz as keys de cada editor (`apelidos`) para ele reconhecer
   * o apelido da planilha, e o aplicar usa o PUT e as ausências.
   */
  /**
   * A semana lado a lado com a planilha (#133), só para a coordenação: GET /api/montar-pauta/foto?dia= (sem ele, amanhã)
   * devolve a foto mais nova da planilha para o dia ({ aba, lidaEm, recebidaEm, confirmadaEm, todasAsAbas, linhas,
   * mesclas }, ou null), o que o colar da planilha (#130) leu dela (`daFoto`: as posições e quem está fora) e as
   * diferenças com o rascunho gravado, posição por posição (diferencasDaFoto). Só lê.
   */
  async function rotaDaFotoDoDia(req, res, eu) {
    if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
    if (!escala.ehCoordenacao(eu.email)) return json(res, 403, { erro: 'Só a coordenação monta a pauta.' });
    const pedido = new URL(req.url, 'http://x').searchParams.get('dia') ?? '';
    const dia = pedido ? diaOuHoje(pedido, '') : diaVizinho(diaEmSaoPaulo(), 1);
    if (!dia) return json(res, 400, { erro: 'Dia inválido.' });
    const foto = fotosDaEdicao.doDia(dia);
    if (!foto) return json(res, 200, { dia, foto: null, daFoto: null, diferencas: null });
    const { posicoes } = escala.lerDia(dia);
    const ctx = {
      dia,
      turnos: turnosDoDia(turnosDaConfiguracao(configuracao.valores()), posicoes),
      editores: (await areas.nomesDosCadastros(cadastros)).editor,
      apelidos: await areas.apelidosDosEditores(cadastros),
      ilhas: ilhas.todas(),
    };
    const daFoto = lerAFoto(foto.linhas, ctx, posicoes);
    const foraNoPromeiro = ausencias.noPeriodo(dia, dia).map((a) => a.editor);
    const diferencas = diferencasDaFoto(posicoes, daFoto.posicoes, { dia, foraNoPromeiro, foraNaPlanilha: daFoto.fora, ilhas: ctx.ilhas });
    return json(res, 200, { dia, foto, daFoto, diferencas });
  }

  async function rotaDeMontarAPauta(req, res, eu, acao = '') {
    const metodos = acao ? ['POST'] : ['GET', 'PUT'];
    if (!metodos.includes(req.method)) return json(res, 405, { erro: 'Método não permitido.' });
    if (!escala.ehCoordenacao(eu.email)) return json(res, 403, { erro: 'Só a coordenação monta a pauta.' });
    const pedido = new URL(req.url, 'http://x').searchParams.get('dia') ?? '';
    const dia = pedido ? diaOuHoje(pedido, '') : diaVizinho(diaEmSaoPaulo(), 1);
    if (!dia) return json(res, 400, { erro: 'Dia inválido.' });
    const editores = (await areas.nomesDosCadastros(cadastros)).editor.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const turnos = turnosDaConfiguracao(configuracao.valores());
    let repetido;
    let distribuidas;
    try {
      if (req.method === 'PUT') {
        const corpo = (await lerCorpo(req)) ?? {};
        // a ilha juntada (#165) vale pela que ficou: a tela aberta antes de juntar ainda manda a que saiu
        const juntadas = ilhas.juntadas();
        const naQueFicou = (lista) => (Array.isArray(lista) ? lista.map((p) => (p && typeof p === 'object' && typeof p.ilha === 'string' && juntadas[p.ilha] ? { ...p, ilha: juntadas[p.ilha] } : p)) : lista);
        if (corpo && typeof corpo === 'object') {
          corpo.posicoes = naQueFicou(corpo.posicoes);
          if (corpo.base && typeof corpo.base === 'object') corpo.base.posicoes = naQueFicou(corpo.base.posicoes);
        }
        // o que está gravado agora, lido depois do pedido chegar inteiro (o que vem daqui até gravar não espera nada)
        const gravado = escala.lerDia(dia);
        const antes = gravado.posicoes;
        // a ilha do cadastro; a que saiu dele, só na posição que já a tinha
        const cadastradas = new Set(ilhas.todas().map((i) => i.id));
        const validos = {
          turnos: new Set(turnosDoDia(turnos, antes).map((t) => t.id)),
          ilhaVale: (ilha, posicao) => cadastradas.has(ilha) || antes.some((p) => p.id === posicao && p.ilha === ilha),
        };
        // o recado do dia (#125): sem ele no pedido, fica o que estava
        const recado = typeof corpo === 'object' && 'recado' in corpo ? recadoDoPedido(corpo.recado) : undefined;
        let posicoes = posicoesDoPedido(corpo.posicoes, dia, validos);
        let recadoGravado = recado;
        // duas pessoas ao mesmo tempo (#131): com a base (o dia como a pessoa o leu), o que ela mudou desde a base vai
        // por cima do que está gravado agora, sem desfazer o que a outra fez; sem a base, troca o dia inteiro
        const deBase = corpo?.base;
        if (deBase !== undefined) {
          if (!deBase || typeof deBase !== 'object' || !Array.isArray(deBase.posicoes)) throw Object.assign(new Error('Base do dia inválida.'), { status: 400 });
          // a base só serve para comparar: vale o formato, com qualquer turno e ilha (o que a pessoa leu pode ter mudado)
          const qualquer = { turnos: { has: (t) => typeof t === 'string' && t.length > 0 }, ilhaVale: () => true };
          const baseDoDia = { posicoes: posicoesDoPedido(deBase.posicoes, dia, qualquer), recado: recadoDoPedido(deBase.recado) };
          const juntado = juntarODia(baseDoDia, { posicoes, recado: recado ?? baseDoDia.recado }, { posicoes: antes, recado: gravado.recado ?? '' }, dia, { ilhas: ilhas.todas() });
          posicoes = posicoesDoPedido(juntado.posicoes, dia, validos);
          recadoGravado = juntado.recado;
        }
        escala.gravarDia(dia, posicoes, eu.email, recadoGravado);
      }
      if (acao === 'conferida') {
        const { chave, certo } = (await lerCorpo(req)) ?? {};
        escala.conferida(dia, chave, !!certo, eu.email);
      }
      if (acao === 'publicar') {
        const { posicoes, dispensadas, publicacao } = escala.lerDia(dia);
        escala.publicar(dia, pendenciasQueFicaram(conferirODia({ dia, posicoes, editores, turnos: turnosDoDia(turnos, posicoes) }), dispensadas), eu.email);
        console.log(`[montar-pauta] ${eu.email} publicou ${dia}`);
        // com a chave da virada ligada (#134), o dia vai ao Teable; o erro fica no dia, a publicação vale mesmo assim
        await pautaNoTeable.gravar(dia);
        // republicar o dia que já foi ao Teams manda a "pauta alterada" (#135), sem segurar a resposta
        if (publicacao) void cartaoDoTeams.republicado(dia);
      }
      if (acao === 'repetir') {
        const { de } = (await lerCorpo(req)) ?? {};
        if (!ehDeOndeRepetir(de)) throw Object.assign(new Error('Repetir de onde?'), { status: 400 });
        repetido = repetirAEscala(dia, de, eu.email);
        console.log(`[montar-pauta] ${eu.email} repetiu a escala em ${repetido.map((r) => r.destino).join(', ')}`);
      }
      if (acao === 'desfazer') {
        escala.desfazer(dia);
        console.log(`[montar-pauta] ${eu.email} desfez a publicação de ${dia}`);
        // o Teable volta para a publicação anterior, ou o dia sai dele (#134, com a chave ligada)
        await pautaNoTeable.gravar(dia);
      }
      if (acao === 'distribuir') {
        // distribuir sozinho (#151): pela continuidade nos 14 dias antes do dia, pela carga e pelo sorteio; só quem está
        // escalado e não está fora recebe. Nada é publicado: as claquetes vão para o rascunho
        distribuidas = distribuicao.distribuir(dia, { historico: await historicoDaContinuidade(dia), fora: ausencias.noPeriodo(dia, dia).map((a) => a.editor), sortear: Math.random }, eu.email);
        console.log(`[montar-pauta] ${eu.email} distribuiu ${distribuidas.length} claquete(s) em ${dia}`);
      }
      if (acao === 'desfazer-distribuicao') distribuicao.recolher(dia, ((await lerCorpo(req)) ?? {}).itens, eu.email);
      if (['para-distribuir', 'levar', 'mover', 'devolver', 'escalar'].includes(acao)) {
        const corpo = (await lerCorpo(req)) ?? {};
        if (acao === 'para-distribuir') distribuicao.acrescentar(dia, corpo.texto, eu.email);
        if (acao === 'levar') distribuicao.levar(dia, corpo.id, corpo.posicao, corpo.antesDe, eu.email);
        if (acao === 'mover') distribuicao.mover(dia, corpo.demanda, corpo.posicao, corpo.antesDe, eu.email);
        if (acao === 'devolver') distribuicao.devolver(dia, corpo.demanda, eu.email);
        if (acao === 'escalar') {
          const foraNoDia = ausencias.noPeriodo(dia, dia);
          const fora = (nome) => {
            const a = foraNoDia.find((x) => nomeComparavel(x.editor) === nomeComparavel(nome));
            return a ? motivoDaAusencia(a) : '';
          };
          distribuicao.escalar(dia, corpo, { turnos: turnosDoDia(turnos, escala.lerDia(dia).posicoes), fora }, eu.email);
        }
      }
    } catch (e) {
      return json(res, e.status ?? 400, { erro: e instanceof Error ? e.message : 'Pedido inválido.' });
    }
    // a versão vai junto do dia lido no mesmo instante (#131): quem está na sala sabe se já tem o mais novo
    const versao = req.method === 'GET' ? versaoDoMontar : mudouOMontar();
    const lido = escala.lerDia(dia);
    const semana = escala.estados(diasDaSemana(segundaDaSemana(dia)));
    return json(res, 200, {
      dia,
      ...lido,
      versao,
      semana,
      // o que cada opção do Repetir traz (#129), só no dia vazio
      repetir: lido.estado === 'vazio' ? opcoesDoRepetir(dia, semana, escala.quantas) : null,
      ...(repetido ? { repetido } : {}),
      // depois de distribuir (#151): cada claquete com a posição, o editor, o motivo e de quem era (para o desfazer)
      ...(distribuidas ? { distribuidas } : {}),
      turnos: turnosDoDia(turnos, lido.posicoes),
      editores,
      // as keys dos editores, para reconhecer o apelido no colar da planilha (#130)
      apelidos: await areas.apelidosDosEditores(cadastros),
      ilhas: ilhas.todas(),
      costume: ilhas.deCostume(dia),
      ocupadas: ilhasOcupadas(lido.posicoes, ilhas.sala()),
      paraDistribuir: distribuicao.paraDistribuir(dia),
      // a virada (#134): a chave, quando o dia foi gravado no Teable e o erro da última vez
      noTeable: pautaNoTeable.estado(dia),
    });
  }

  /**
   * O histórico da continuidade do distribuir (#151): as claquetes da pauta dos 14 dias antes do dia, com o editor, da
   * mesma junção da Pauta da edição (a do Teable e a publicada no PROMeiro, src/modelo/pautaPublicada.ts). Com o Teable
   * fora do ar (e sem a cópia local), só a publicada.
   */
  async function historicoDaContinuidade(dia) {
    const dias = Array.from({ length: DIAS_DA_CONTINUIDADE }, (_, i) => diaVizinho(dia, i - DIAS_DA_CONTINUIDADE));
    const doTeable = await pauta.dias(dias).then(
      (r) => r.linhas,
      (e) => (console.error('[montar-pauta] sem a pauta do Teable para distribuir:', e.message), []),
    );
    const gravados = pautaNoTeable.gravados(dias[0], dias.at(-1));
    const publicadas = escala.publicadas(dias[0], dias.at(-1)).map((p) => (gravados.has(p.dia) ? { ...p, vale: true } : p));
    return historicoDaPauta(juntarAPublicada(doTeable, publicadas));
  }

  /**
   * Repetir (#129): a escala de outro dia nos dias de destino, cada um gravado como rascunho. Lança (400) o dia que já
   * tem escala e a origem sem nada montado; na semana inteira, esses dias ficam de fora (e lança se nenhum sobrar).
   */
  function repetirAEscala(dia, de, por) {
    const semana = escala.estados(diasDaSemana(segundaDaSemana(dia)));
    const recusa = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });
    const dias = diasDoRepetir(dia, de, semana);
    if (de !== 'semana-inteira') {
      if (escala.lerDia(dia).estado !== 'vazio') throw recusa('O dia já tem escala: o Repetir só preenche o dia vazio.');
      if (!escala.quantas(dias[0].origem)) throw recusa(`Nada montado em ${Number(dias[0].origem.slice(8))}/${Number(dias[0].origem.slice(5, 7))} para repetir.`);
    }
    const comOrigem = dias.filter((r) => escala.quantas(r.origem) > 0);
    if (!comOrigem.length) throw recusa('Nada montado na semana passada para repetir nos dias vazios.');
    const cadastradas = new Set(ilhas.todas().map((i) => i.id));
    return comOrigem.map(({ origem, destino }) => {
      const { posicoes, vagas } = repetirODia(escala.lerDia(origem).posicoes, destino, ausencias.noPeriodo(destino, destino), (prefixo) => `${prefixo}-${randomUUID()}`, { ilhaVale: (id) => cadastradas.has(id) });
      escala.gravarDia(destino, posicoes, por, undefined);
      return { origem, destino, posicoes: posicoes.length, vagas };
    });
  }

  /**
   * O cadastro das ilhas (#124), no SQLite do PROMeiro: GET para qualquer pessoa logada (com o que ela pode fazer);
   * POST { tipo, numero, nome } cadastra e PUT /:id muda, pela coordenação e pelos administradores (a mesma sala de
   * outra é recusada, #165); DELETE /:id tira, só administradores (as posições que já tinham a ilha continuam com ela).
   * As repetidas de antes da regra vêm com quantas posições têm (`usos`); POST /juntar { fica, sai } junta a que sai
   * na que fica, só administradores, depois da conferência na tela.
   */
  async function rotaDasIlhas(req, res, eu, caminho) {
    const id = decodeURIComponent(caminho.slice('/api/cadastros/ilhas/'.length));
    const admin = cadastros.podeApagar(eu.email);
    const podeCadastrar = admin || escala.ehCoordenacao(eu.email);
    try {
      if (caminho === '/api/cadastros/ilhas') {
        if (req.method === 'GET') return json(res, 200, { ilhas: ilhas.todas(), podeCadastrar, podeRemover: admin, usos: ilhas.usos() });
        if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
        if (!podeCadastrar) return json(res, 403, { erro: 'Só a coordenação e os administradores cadastram ilhas.' });
        const ilha = ilhas.criar((await lerCorpo(req)) ?? {}, eu.email);
        console.log(`[cadastros] ${eu.email} cadastrou a ilha ${ilha.tipo} ${ilha.numero}`);
        return json(res, 201, { ilha });
      }
      if (caminho === '/api/cadastros/ilhas/juntar') {
        if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
        if (!admin) return json(res, 403, { erro: 'Só administradores juntam ilhas.' });
        const { fica, sai } = (await lerCorpo(req)) ?? {};
        const r = ilhas.juntar(String(fica ?? ''), String(sai ?? ''), eu.email);
        console.log(`[cadastros] ${eu.email} juntou a ilha ${sai} na ${fica} (${r.posicoes} posições)`);
        return json(res, 200, r);
      }
      if (req.method === 'PUT') {
        if (!podeCadastrar) return json(res, 403, { erro: 'Só a coordenação e os administradores mudam ilhas.' });
        return json(res, 200, { ilha: ilhas.mudar(id, (await lerCorpo(req)) ?? {}, eu.email) });
      }
      if (req.method === 'DELETE') {
        if (!admin) return json(res, 403, { erro: 'Só administradores removem ilhas.' });
        ilhas.remover(id);
        console.log(`[cadastros] ${eu.email} removeu a ilha ${id}`);
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { erro: 'Método não permitido.' });
    } catch (e) {
      return json(res, e.status ?? 400, { erro: e instanceof Error ? e.message : 'Pedido inválido.' });
    }
  }

  /**
   * A aba Padeiros dos Cadastros (#137), só para administradores. GET /api/cadastros/padeiros: os Padeiros (usuário,
   * computador, sistema, sigla, estado, designer ligado, a sugestão pela sigla e o último aviso) e os designers
   * cadastrados ativos (a tabela designers da última verificação das Pessoas). POST …/<id>/ligar { designer: registro }
   * liga a chave (ou troca o designer); POST …/<id>/revogar revoga. A chave nunca sai daqui.
   */
  async function rotaDosPadeiros(req, res, eu, caminho) {
    if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores veem e mudam os Padeiros.' });
    const ativos = (pessoas.guardada()?.designers ?? []).filter((d) => d.ativo !== false && d.nome && d.registro);
    const designers = ativos.map((d) => ({ registro: d.registro, nome: d.nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (caminho === '/api/cadastros/padeiros') {
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      const lista = padeiros.lista();
      // o pedido novo do mesmo computador sugere o designer da chave que ele vai trocar; o resto, o da sigla
      const daChaveDeAntes = (p) => ativos.find((d) => d.registro === lista.find((x) => x.id === p.substitui)?.designer?.registro);
      const comSugestao = lista.map((p) => {
        const s = p.estado === 'pendente' ? ((p.substitui && daChaveDeAntes(p)) || designerSugerido(p.sigla, p.usuario, ativos)) : null;
        return { ...p, sugestao: s ? { registro: s.registro, nome: s.nome } : null };
      });
      return json(res, 200, { padeiros: comSugestao, designers });
    }
    const [, id, acao] = /^\/api\/cadastros\/padeiros\/([\w-]{1,64})\/(ligar|revogar)$/.exec(caminho) ?? [];
    if (!id) return json(res, 404, { erro: 'Não encontrado.' });
    if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
    try {
      if (acao === 'revogar') {
        const feito = padeiros.revogar(id, eu.email);
        console.log(`[padeiros] ${eu.email} revogou a chave de ${feito.usuario} em ${feito.computador}`);
        return json(res, 200, { padeiro: feito });
      }
      const registro = String(((await lerCorpo(req)) ?? {}).designer ?? '');
      const designer = designers.find((d) => d.registro === registro);
      if (!designer) return json(res, 400, { erro: 'Escolha um designer cadastrado (e ativo) na tabela designers.' });
      const feito = padeiros.ligar(id, designer, eu.email);
      console.log(`[padeiros] ${eu.email} ligou a chave de ${feito.usuario} em ${feito.computador} a ${designer.nome}`);
      return json(res, 200, { padeiro: feito });
    } catch (e) {
      if (!e.status) throw e;
      return json(res, e.status, { erro: e.message });
    }
  }

  /**
   * As ausências (#128), só para a coordenação. GET /api/montar-pauta/ausencias?dia= é o painel do dia (as ausências
   * que valem a partir da semana dele, as do dia, a oferta de tirar quem continua num dia publicado e as demandas para
   * distribuir); /ausencias/onde?editor=&de=&ate= diz onde a pessoa está escalada no período, antes de marcar;
   * /ausencias/historico?editor= tem também as apagadas. Os POST devolvem o painel: /ausencias { editor, tipo, de,
   * ate, observacao } marca (e, nos rascunhos, a posição vira vaga; volta também `marcada` e `escalada`);
   * /ausencias/apagar { id }; /tirar { editor } tira a pessoa do dia (as demandas vão para distribuir);
   * /para-distribuir/tirar { id } tira a demanda da lista. Nada vai ao Teable.
   */
  async function rotaDasAusencias(req, res, eu, acao) {
    const leitura = ['ausencias', 'ausencias/onde', 'ausencias/historico'].includes(acao) && req.method === 'GET';
    if (!leitura && req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
    if (!escala.ehCoordenacao(eu.email)) return json(res, 403, { erro: 'Só a coordenação marca as ausências.' });
    const busca = new URL(req.url, 'http://x').searchParams;
    const dia = diaOuHoje(busca.get('dia') ?? '', '') || diaVizinho(diaEmSaoPaulo(), 1);
    try {
      if (acao === 'ausencias/onde') return json(res, 200, { escalada: ausencias.onde(busca.get('editor'), busca.get('de'), busca.get('ate')) });
      if (acao === 'ausencias/historico') return json(res, 200, { historico: ausencias.historico(busca.get('editor')) });
      let marcou = {};
      if (req.method === 'POST') {
        const corpo = (await lerCorpo(req)) ?? {};
        if (acao === 'ausencias') {
          marcou = ausencias.marcar(ausenciaDoPedido(corpo), eu.email);
          console.log(`[montar-pauta] ${eu.email} marcou uma ausência (${marcou.marcada.de} a ${marcou.marcada.ate})`);
        }
        if (acao === 'ausencias/apagar') ausencias.apagar(corpo.id, eu.email);
        if (acao === 'tirar') {
          ausencias.tirar(dia, corpo.editor, eu.email);
          console.log(`[montar-pauta] ${eu.email} tirou uma pessoa de ${dia}`);
        }
        if (acao === 'para-distribuir/tirar') ausencias.distribuida(dia, corpo.id);
        // a ausência muda os rascunhos e a caixa "Fora": quem está na sala de um dia lê de novo (#131)
        mudouOMontar();
      }
      return json(res, 200, { ...ausencias.painel(dia, segundaDaSemana(dia)), ...marcou });
    } catch (e) {
      return json(res, e.status ?? 400, { erro: e instanceof Error ? e.message : 'Pedido inválido.' });
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
        const lido = await cadastros.ler(forcar);
        const admin = cadastros.podeApagar(eu.email);
        // as sugestões "É Fulana, dos redatores?" (#106): só para administradores
        // coordenacao: os e-mails de quem monta a pauta (#123), marcados nos Editores
        // nomesNovos: os editores da pauta que não estão nos Cadastros (#132), só para administradores
        return json(res, 200, {
          ...lido,
          podeApagar: admin,
          sugestoes: admin ? ligacaoDePessoas.sugestoes(q.todosOsUsuarios.all(), lido) : [],
          coordenacao: escala.coordenacao(),
          nomesNovos: admin && lido.ligado ? nomesNovos.pendentes(lido.editores) : [],
        });
      }
      if (tipo === 'coordenacao' && !id) {
        // o papel de coordenação (#123), só por administradores: POST { email } marca, DELETE ?email= tira. Guardado no
        // SQLite do PROMeiro, pelo e-mail do login (não vai ao Teable)
        if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores marcam a coordenação.' });
        const email = req.method === 'DELETE' ? new URL(req.url, 'http://x').searchParams.get('email') : req.method === 'POST' ? ((await lerCorpo(req)) ?? {}).email : null;
        if (email === null) return json(res, 405, { erro: 'Método não permitido.' });
        const feito = req.method === 'POST' ? escala.marcar(email, eu.email) : escala.tirar(email);
        console.log(`[cadastros] ${eu.email} ${req.method === 'POST' ? 'pôs' : 'tirou'} ${feito} ${req.method === 'POST' ? 'na' : 'da'} coordenação`);
        return json(res, 200, { ok: true, coordenacao: escala.coordenacao() });
      }
      if (tipo === 'nao-e' && !id) {
        // "Não é" (#106): guardado no SQLite, a sugestão não volta; DELETE desfaz
        if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores ligam pessoas e cadastros.' });
        const de = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url, 'http://x').searchParams) : req.method === 'POST' ? ((await lerCorpo(req)) ?? {}) : null;
        if (!de) return json(res, 405, { erro: 'Método não permitido.' });
        if (!TIPOS_COM_EMAIL.includes(de.tipo) || !REC.test(String(de.id ?? '')) || !String(de.email ?? '').includes('@')) return json(res, 400, { erro: 'Faltam o cadastro e o e-mail.' });
        if (req.method === 'POST') ligacaoDePessoas.naoE(de.tipo, de.id, de.email, eu.email);
        else ligacaoDePessoas.desfazer(de.tipo, de.id, de.email);
        console.log(`[cadastros] ${eu.email} ${req.method === 'POST' ? 'disse que não é' : 'desfez o "não é" de'} ${de.email} (${de.tipo} ${de.id})`);
        return json(res, 200, { ok: true });
      }
      if (tipo === 'nomes-novos' && ['ligar', 'ignorar'].includes(id) && !sub) {
        // o nome novo da pauta (#132), só por administradores: POST /ligar { nome, editor } liga ao editor que já existe
        // (o nome vira key dele, no Teable, e a escala passa a ter o nome do cadastro); POST /ignorar { nome } o tira
        // da lista, DELETE /ignorar?nome= o traz de volta. Cadastrar como editor novo é o POST /editores de sempre
        if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores ligam os nomes novos da pauta.' });
        if (id === 'ignorar') {
          const pedido = req.method === 'DELETE' ? new URL(req.url, 'http://x').searchParams.get('nome') : req.method === 'POST' ? ((await lerCorpo(req)) ?? {}).nome : undefined;
          if (pedido === undefined) return json(res, 405, { erro: 'Método não permitido.' });
          const nome = nomeNovoDoPedido(pedido);
          if (req.method === 'POST') nomesNovos.ignorar(nome, eu.email);
          else nomesNovos.desfazer(nome);
          console.log(`[cadastros] ${eu.email} ${req.method === 'POST' ? 'ignorou' : 'desfez o ignorar d'}o nome novo ${nome}`);
          return json(res, 200, { ok: true });
        }
        if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
        const corpo = (await lerCorpo(req)) ?? {};
        const nome = nomeNovoDoPedido(corpo.nome);
        const editor = (await cadastros.ler(true)).editores.find((e) => e.id === corpo.editor);
        if (!editor) return json(res, 400, { erro: 'Escolha um editor cadastrado.' });
        // o nome vira key do editor (a key da pauta), para ser reconhecido; a que já é dele não é gravada de novo
        if (!editor.keys.some((k) => k.key === normalizarKey(nome))) await cadastros.novaKey('editor', editor.id, nome);
        const trocas = nomesNovos.ligar(nome, editor.nome);
        console.log(`[cadastros] ${eu.email} ligou o nome novo ${nome} a ${editor.nome} (${trocas} na escala)`);
        if (trocas) mudouOMontar();
        return json(res, 200, { ok: true, nome: editor.nome, trocas });
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
      if (req.method === 'PATCH' && tipo !== 'atracoes' && id && !sub) {
        // o e-mail do login no cadastro (#106): à mão ou pelo "É"; o desfazer grava o de antes
        const corpo = (await lerCorpo(req)) ?? {};
        if (!('email' in corpo)) return json(res, 405, { erro: 'Método não permitido.' });
        if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores mudam o e-mail dos cadastros.' });
        const feito = await cadastros.mudarEmail(singular, id, corpo.email);
        console.log(`[cadastros] ${eu.email} mudou o e-mail de ${feito.nome}: ${feito.antes || '(nenhum)'} → ${feito.email || '(nenhum)'}`);
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

  /**
   * As claquetes recentes para a conferência das praças (#73): as dos roteiros que passaram pelo PROMeiro (a fila) e as
   * da produção da arte (todo card que entrou, também pelo n8n), sem repetir, das mais novas para as mais velhas. A
   * produção fora do ar não impede a conferência: conta só a fila.
   */
  async function claquetesParaConferir(dias = DIAS_DA_CONTAGEM) {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
    const daFila = q.claquetesRecentesDaFila.all(desde).map((l) => String(l.claquete ?? ''));
    const daProducao = ((await trello.claquetesRecentes?.(dias).catch(() => [])) ?? []).sort((a, b) => String(b.em).localeCompare(String(a.em))).map((l) => l.claquete);
    return { dias, claquetes: [...daFila, ...daProducao].filter((c) => c.trim()) };
  }

  /** O quadro do Trello de agora, com a cópia da última leitura (#79): com o Trello fora, valem os nomes dela. */
  const lerOQuadroDeAgora = () => lerOQuadroComCopia(trello, env, { copia, fora }).then(conhecerQuadro);
  /** O Teable fora do ar, como a tela lê: desde quando, e de quando são as tabelas que valem. */
  const teableForaDoAr = () => {
    const f = tabelas?.foraDoAr ? fora.estado('teable') : null;
    return f && { servico: f.servico, desde: f.desde, lidoEm: tabelas.em ?? '' };
  };

  /**
   * As seções da tela de Configuração como a tela lê, com o quadro do Trello lido uma vez só. Com o Trello fora do ar
   * (#79), Praças, Card e Filmes vêm com o salvo e os nomes da última leitura, `foraDoAr` (desde quando) e nada ligado
   * de novo pelo nome: a proposta é o salvo, e salvar é recusado até ele voltar.
   */
  async function lerAsSecoes() {
    const [lido, doCadastro] = await Promise.all([lerOQuadroDeAgora(), sessoesDoCadastro(cadastros)]);
    const salvos = configuracao.salvos();
    // o que a tela mostra do Trello fora do ar (o motivo fica no log)
    const trelloForaDoAr = lido.foraDoAr && { servico: lido.foraDoAr.servico, desde: lido.foraDoAr.desde, lidoEm: lido.foraDoAr.lidoEm };
    const travada = (secao) => {
      const comErro = lido.erro ? { ...secao, erro: lido.erro } : secao;
      return trelloForaDoAr ? { ...comErro, proposta: comErro.salvo, foraDoAr: trelloForaDoAr } : comErro;
    };
    const card = secaoDoCard(env, lido.quadro, { primeiraVez: !VARIAVEIS_DO_CARD.some((n) => salvos.has(n)) });
    const filmes = secaoDosFilmes(env, lido.quadro, { primeiraVez: !VARIAVEIS_DOS_FILMES.some((n) => salvos.has(n)), pracas, sessoes: doCadastro.sessoes, erroDasSessoes: doCadastro.erro });
    const daPraca = await lerSecaoPracas(trello, env, lido);
    const teable = teableForaDoAr();
    return {
      // os turnos (#124): não dependem do Trello, nem travam com ele fora
      turnos: { salvo: turnosDaConfiguracao(configuracao.valores()), deFabrica: !salvos.has('TURNOS') },
      // os turnos da arte (#175): as mesmas regras, guardados à parte
      turnosDaArte: { salvo: turnosDaConfiguracao(configuracao.valores(), 'arte'), deFabrica: !salvos.has('TURNOS_DA_ARTE') },
      // o cartão da pauta no Teams (#135): os horários, o segredo que falta no Portainer e o último envio
      teams: { horarios: horariosDaConfiguracao(configuracao.valores()), deFabrica: !salvos.has('TEAMS_HORARIOS'), ...cartaoDoTeams.secao() },
      // a virada (#134): a chave e se a tabela da pauta foi achada na base
      virada: secaoDaVirada(),
      pracas: travada(daPraca),
      card: travada(card),
      filmes: travada(filmes),
      conexoes: {
        ...conexoesDaTela(lido, tabelas, env),
        ...(trelloForaDoAr ? { trelloForaDoAr } : {}),
        ...(teable ? { teableForaDoAr: teable } : {}),
      },
    };
  }

  /**
   * Trocar o quadro do Trello ou a base do Teable (#76): o nome do novo, digitado, confirma. O quadro novo fica salvo
   * (TRELLO_QUADRO) e as seções são ligadas de novo pelo nome nele; a base nova (TEABLE_PG_ESQUEMA) tem as tabelas
   * descobertas de novo. Devolve as seções, com as exceções do que o nome não achou.
   */
  async function trocarAConexao(res, eu, corpo) {
    const confirmacao = String(corpo?.confirmacao ?? '');
    const id = String(corpo?.quadro ?? corpo?.base ?? '').trim();
    if (!id || !/^[\w-]{1,64}$/.test(id) || (corpo.quadro !== undefined) === (corpo.base !== undefined)) return json(res, 400, { erro: 'Diga o quadro ou a base nova.' });
    // com o serviço fora do ar (#79), a troca é recusada: sem ler o novo, nada é ligado de novo pelo nome
    const ouForaDoAr = async (servico, ler) => {
      try {
        return { lidos: await ler() };
      } catch (e) {
        return { recusa: recusaForaDoAr(fora.caiu(servico, e instanceof Error ? e.message : String(e))) };
      }
    };
    if (corpo.quadro !== undefined) {
      const quadros = await ouForaDoAr('trello', () => lerQuadros(trello));
      if (quadros.recusa) return json(res, 503, { erro: quadros.recusa });
      const novo = conhecer(conhecidos.quadros, quadros.lidos).find((q) => q.id === id);
      if (!novo) return json(res, 404, { erro: 'Esse quadro não está entre os que o token do Trello enxerga.' });
      if (!confirmaATroca(confirmacao, novo.nome)) return json(res, 422, { erro: `Para trocar, digite o nome do quadro novo: ${novo.nome}.` });
      if (novo.id === String(env.TRELLO_QUADRO ?? '').trim()) return json(res, 200, await lerAsSecoes());
      const velho = (await lerOQuadro(trello, env).catch(() => null))?.quadro ?? null;
      const quadroNovo = await lerQuadro(trello, { ...env, TRELLO_QUADRO: id }, []);
      const { sessoes } = await sessoesDoCadastro(cadastros);
      mudarConfiguracao({ TRELLO_QUADRO: id, ...religarNoQuadroNovo(env, quadroNovo, velho, { sessoes }) }, { por: eu.email, quadro: velho });
      console.log(`[configuração] ${eu.email} trocou o quadro do Trello para "${novo.nome}": tudo ligado de novo pelo nome`);
    } else {
      const bases = await ouForaDoAr('teable', () => descoberta.bases(configuracao.valores()));
      if (bases.recusa) return json(res, 503, { erro: bases.recusa });
      const nova = conhecer(conhecidos.bases, bases.lidos).find((b) => b.id === id);
      if (!nova) return json(res, 404, { erro: 'Essa base não está entre as que o token do Teable enxerga.' });
      if (!confirmaATroca(confirmacao, nova.nome)) return json(res, 422, { erro: `Para trocar, digite o nome da base nova: ${nova.nome}.` });
      if (nova.id !== String(env.TEABLE_PG_ESQUEMA ?? '').trim()) {
        mudarConfiguracao(mudancasDaBaseNova(id, configuracao.salvos()), { por: eu.email });
        await redescobrir();
        console.log(`[configuração] ${eu.email} trocou a base do Teable para "${nova.nome}": tabelas achadas de novo pelo nome`);
      }
    }
    return json(res, 200, await lerAsSecoes());
  }

  /**
   * O histórico (#78) e, para cada linha, se dá para voltar: os valores de antes dela passam pela mesma conferência da
   * seção que ela mexe (com o quadro do Trello que valeria, os quadros e as bases que o token enxerga, as sessões do
   * cadastro e quem está voltando). As leituras são feitas uma vez só para todas as linhas.
   */
  function lerParaVoltar() {
    const uma = (f) => {
      let p = null;
      return () => (p ??= f().catch(() => null));
    };
    const lidos = new Map();
    return {
      quadros: uma(async () => conhecer(conhecidos.quadros, await lerQuadros(trello))),
      bases: uma(async () => conhecer(conhecidos.bases, await descoberta.bases(configuracao.valores()))),
      sessoes: uma(async () => (await sessoesDoCadastro(cadastros)).sessoes),
      quadro(alvo) {
        const chave = String(alvo.TRELLO_QUADRO ?? '').trim();
        if (!lidos.has(chave)) lidos.set(chave, lerOQuadro(trello, alvo).catch((e) => ({ quadro: null, erro: `não consegui ler o quadro do Trello (${e instanceof Error ? e.message : e}).` })));
        return lidos.get(chave);
      },
    };
  }
  /** Os valores que valeriam voltando à linha, e a conferência deles. */
  async function aVoltaDe(entrada, eu, leitura) {
    const mudancas = Object.fromEntries(entrada.mudancas.map((m) => [m.nome, m.antes]));
    const nomes = Object.keys(mudancas);
    const alvo = configuracao.simular(mudancas);
    const s = secoesDe(nomes);
    const doQuadro = s.pracas || s.card || s.filmes;
    const [quadros, bases, sessoes, lido] = await Promise.all([
      s.quadro ? leitura.quadros() : null,
      s.base ? leitura.bases() : null,
      s.filmes ? leitura.sessoes() : null,
      doQuadro ? leitura.quadro(alvo) : null,
    ]);
    return { mudancas, lido, voltar: conferirAVolta(configuracao.valores(), alvo, nomes, { lido, quadros, bases, sessoes, eu: eu.email }) };
  }
  async function historicoDaTela(eu) {
    const leitura = lerParaVoltar();
    return Promise.all(
      configuracao.historico({ limite: 50 }).map(async (e) => ({
        id: e.id,
        em: e.em,
        por: e.por,
        quem: e.por ? nomeDaPessoa(e.por) : 'sistema',
        linhas: e.linhas,
        voltouDe: e.voltouDe,
        voltar: (await aVoltaDe(e, eu, leitura)).voltar,
      })),
    );
  }
  /** Voltar a uma linha: aplica na hora os valores de antes dela (se a conferência passa) e entra no histórico. */
  async function voltarNoHistorico(res, eu, corpo) {
    const entrada = configuracao.entradaDoHistorico(Number(corpo?.id));
    if (!entrada) return json(res, 404, { erro: 'Essa linha não está no histórico.' });
    const { mudancas, lido, voltar } = await aVoltaDe(entrada, eu, lerParaVoltar());
    if (!voltar.pode) return json(res, 422, { erro: `Não dá para voltar: ${voltar.motivo}` });
    mudarConfiguracao(mudancas, { por: eu.email, voltouDe: entrada.id, quadro: lido?.quadro ?? null });
    console.log(`[configuração] ${eu.email} voltou à linha ${entrada.id} do histórico (${entrada.linhas.map((l) => l.oque).join(', ')})`);
    // as praças de agora vão junto: o navegador reconhece a praça da claquete com elas
    return json(res, 200, { entradas: await historicoDaTela(eu), pracas: pracasParaONavegador(pracas) });
  }

  /**
   * A tela de Configuração (#72), só para administradores: GET lê as seções Praças, Card (#74) e Filmes (#75) (o salvo,
   * o que o nome liga, o estado de cada ligação e as listas, campos e etiquetas do quadro); POST conferir
   * { pracas?, card?, filmes? } confere sem salvar nada; POST salvar { pracas?, card?, filmes? } confere de novo e, sem
   * erro, salva na configuração viva (vale na hora: o próximo card de filme já sai com a lista, a praça e as
   * etiquetas novas). Vem só
   * a seção que mudou; as duas juntas passam ou não passam juntas. Com erro, 422 e nada salvo.
   * A conferência das praças conta as claquetes recentes que mudariam de praça; a praça nova (#73) ganha a opção no
   * campo Praça do Trello depois da conferência e antes de salvar: se o Trello recusa, 502 e nada salvo. No card, a
   * opção que não é do campo ligado (o campo foi trocado) sai e o nome liga a do campo novo, antes da conferência.
   */
  const secaoDaVirada = () => ({ ligada: pautaNoTeable.ligada(), tabela: pautaNoTeable.temTabela() });
  /**
   * A chave da virada (#134), POST /api/configuracao/virada { ligada }: liga (ou desliga) a gravação da pauta publicada
   * no Teable. Vale na hora e entra no histórico; não grava nada agora (só a próxima publicação vai). Ligar sem a tabela
   * da pauta na base é recusado. Devolve { virada }.
   */
  function mudarAVirada(res, eu, corpo) {
    if (typeof corpo?.ligada !== 'boolean') return json(res, 400, { erro: 'Diga se a chave fica ligada ou desligada.' });
    if (corpo.ligada && !pautaNoTeable.temTabela()) return json(res, 422, { erro: 'A tabela da pauta da edição (EDICAO_producao) não foi achada na base do Teable: nada foi ligado.' });
    mudarConfiguracao({ [CHAVE_DA_VIRADA]: corpo.ligada ? '1' : '0' }, { por: eu.email });
    console.log(`[configuração] ${eu.email} ${corpo.ligada ? 'ligou' : 'desligou'} a gravação da pauta no Teable (a virada)`);
    return json(res, 200, { virada: secaoDaVirada() });
  }

  async function rotaDaConfiguracao(req, res, eu, caminho) {
    const acao = caminho.slice('/api/configuracao'.length);
    const leituras = ['', '/quadros', '/bases', '/historico', '/portainer'];
    if (![...leituras, '/conferir', '/salvar', '/trocar', '/voltar', '/virada'].includes(acao)) return json(res, 404, { erro: 'Não encontrado.' });
    if (req.method !== (leituras.includes(acao) ? 'GET' : 'POST')) return json(res, 405, { erro: 'Método não permitido.' });
    if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores veem e mudam a Configuração.' });
    try {
      if (!acao) {
        // abrir a Configuração descobre as tabelas de novo (com o Teable fora, vale a última descoberta)
        await redescobrir();
        return json(res, 200, await lerAsSecoes());
      }
      if (acao === '/quadros') return json(res, 200, { quadros: conhecer(conhecidos.quadros, await lerQuadros(trello)) });
      if (acao === '/bases') return json(res, 200, { bases: conhecer(conhecidos.bases, await descoberta.bases(configuracao.valores())) });
      if (acao === '/historico') return json(res, 200, { entradas: await historicoDaTela(eu) });
      // "Pode apagar do Portainer" (#79): o que já tem valor salvo na tela (ou não é mais lido), o que ainda não e o que fica
      if (acao === '/portainer') return json(res, 200, listaDoPortainer({ portainer, salvos: configuracao.salvos(), valores: configuracao.valores(), descoberta: tabelas }));
      const corpo = await lerCorpo(req).catch(() => null);
      if (acao === '/trocar') return await trocarAConexao(res, eu, corpo);
      if (acao === '/voltar') return await voltarNoHistorico(res, eu, corpo);
      if (acao === '/virada') return mudarAVirada(res, eu, corpo);
      if (corpo?.pracas === undefined && corpo?.card === undefined && corpo?.filmes === undefined && corpo?.turnos === undefined && corpo?.turnosDaArte === undefined && corpo?.teams === undefined) return json(res, 400, { erro: 'Nada veio para conferir.' });
      // os turnos (#124): sem o Trello; vindo só eles, o quadro nem é lido
      if (corpo.turnos !== undefined && !Array.isArray(corpo.turnos)) return json(res, 400, { erro: 'Os turnos vieram incompletos.' });
      const turnosNovos = corpo.turnos === undefined ? null : turnosArrumados(corpo.turnos.slice(0, 20));
      const dosTurnos = turnosNovos && conferirTurnos(turnosNovos, turnosDaConfiguracao(configuracao.valores()));
      // os turnos da arte (#175): as mesmas regras, também sem o Trello
      if (corpo.turnosDaArte !== undefined && !Array.isArray(corpo.turnosDaArte)) return json(res, 400, { erro: 'Os turnos da arte vieram incompletos.' });
      const daArteNovos = corpo.turnosDaArte === undefined ? null : turnosArrumados(corpo.turnosDaArte.slice(0, 20));
      const dosDaArte = daArteNovos && conferirTurnos(daArteNovos, turnosDaConfiguracao(configuracao.valores(), 'arte'), 'arte');
      const comOsTurnos = { ...(turnosNovos ? { TURNOS: JSON.stringify(turnosNovos) } : {}), ...(daArteNovos ? { TURNOS_DA_ARTE: JSON.stringify(daArteNovos) } : {}) };
      const nomesDosTurnos = [turnosNovos && 'os turnos da edição', daArteNovos && 'os turnos da arte'];
      // os horários do cartão do Teams (#135): também sem o Trello
      if (corpo.teams !== undefined && !Array.isArray(corpo.teams)) return json(res, 400, { erro: 'Os horários do cartão vieram incompletos.' });
      const horariosNovos = corpo.teams === undefined ? null : horariosArrumados(corpo.teams.slice(0, 40));
      const dosHorarios = horariosNovos && conferirHorarios(horariosNovos, horariosDaConfiguracao(configuracao.valores()));
      const semTrello = corpo.pracas === undefined && corpo.card === undefined && corpo.filmes === undefined;
      if (semTrello) {
        const partes = [dosTurnos, dosDaArte, dosHorarios].filter(Boolean);
        const conferencia = partes.length === 1 ? partes[0] : { ok: partes.every((c) => c.ok), itens: partes.flatMap((c) => c.itens), muda: partes.flatMap((c) => c.muda) };
        if (acao === '/conferir') return json(res, 200, conferencia);
        if (!conferencia.ok) return json(res, 422, { erro: 'A conferência não passou: nada foi salvo.', conferencia });
        mudarConfiguracao({ ...comOsTurnos, ...(horariosNovos ? { TEAMS_HORARIOS: JSON.stringify(horariosNovos) } : {}) }, { por: eu.email });
        console.log(`[configuração] ${eu.email} salvou ${[...nomesDosTurnos, horariosNovos && 'os horários do cartão do Teams'].filter(Boolean).join(' e ')}: ${conferencia.muda.map((m) => m.oque).join(', ') || 'sem mudança'}`);
        return json(res, 200, await lerAsSecoes());
      }
      const pracas = corpo.pracas === undefined ? null : secaoDoPedido(corpo);
      if (corpo.pracas !== undefined && !pracas) return json(res, 400, { erro: 'As praças vieram incompletas.' });
      const card = corpo.card === undefined ? null : cardDoPedido(corpo);
      if (corpo.card !== undefined && !card) return json(res, 400, { erro: 'O card veio incompleto.' });
      const filmesNovos = corpo.filmes === undefined ? null : filmesDoPedido(corpo);
      if (corpo.filmes !== undefined && !filmesNovos) return json(res, 400, { erro: 'Os filmes vieram incompletos.' });
      const lido = await lerOQuadroDeAgora();
      // com o Trello fora do ar (#79), Praças, Card e Filmes ficam travados: nada é conferido nem salvo
      if (lido.foraDoAr) return json(res, 503, { erro: recusaForaDoAr(lido.foraDoAr) });
      const daPraca = pracas && (await conferirSecaoPracas(trello, env, pracas, await claquetesParaConferir(), lido));
      const doCard = card && conferirSecaoDoCard(env, lido.quadro, card);
      // a praça dos filmes é uma das praças que vão valer: as do pedido, quando as praças mudam junto
      const sessoes = filmesNovos && (await sessoesDoCadastro(cadastros)).sessoes;
      const dosFilmes = filmesNovos && conferirSecaoDosFilmes(env, lido.quadro, filmesNovos, { pracas: pracas ? pracas.pracas : geracao.pracas, sessoes });
      const partes = [daPraca, doCard?.conferencia, dosFilmes, dosTurnos, dosDaArte, dosHorarios].filter(Boolean);
      const conferencia = {
        ok: partes.every((c) => c.ok),
        itens: partes.flatMap((c) => c.itens),
        muda: partes.flatMap((c) => c.muda),
        ...(daPraca?.claquetes ? { claquetes: daPraca.claquetes } : {}),
      };
      if (acao === '/conferir') return json(res, 200, conferencia);
      if (!conferencia.ok) return json(res, 422, { erro: 'A conferência não passou: nada foi salvo.', conferencia });
      // a opção da praça nova no campo Praça: só depois da conferência; se o Trello recusa, nada é salvo
      let completa = null;
      if (pracas)
        try {
          completa = await criarOpcoesDasNovas(trello, env, pracas);
        } catch (e) {
          console.warn(`[configuração] a opção da praça nova não foi criada: ${e instanceof Error ? e.message : e}`);
          return json(res, 502, { erro: `Não consegui criar a opção da praça nova no campo Praça do Trello: nada foi salvo. (${e instanceof Error ? e.message : e})` });
        }
      // o ligado à mão é um só (LIGADO_A_MAO): a seção que não veio fica com o que já estava salvo
      const aMao = [
        ...(completa ? completa.secao.aMao : pracasSalvas(env).aMao),
        ...(doCard ? doCard.secao.aMao : cardDaConfiguracao(env).aMao),
        ...(filmesNovos ? filmesNovos.aMao : filmesSalvos(env, geracao.pracas, []).aMao),
      ];
      mudarConfiguracao(
        {
          ...(completa ? mudancasDaSecao(completa.secao) : {}),
          ...(doCard ? mudancasDoCard(doCard.secao) : {}),
          ...(filmesNovos ? mudancasDosFilmes(filmesNovos) : {}),
          ...comOsTurnos,
          ...(horariosNovos ? { TEAMS_HORARIOS: JSON.stringify(horariosNovos) } : {}),
          LIGADO_A_MAO: JSON.stringify(aMao),
        },
        { por: eu.email, quadro: lido.quadro },
      );
      const criadas = completa?.criadas.length ? ` (opção criada no Trello: ${completa.criadas.join(', ')})` : '';
      console.log(`[configuração] ${eu.email} salvou ${[pracas && 'as praças', card && 'o card', filmesNovos && 'os filmes', ...nomesDosTurnos, horariosNovos && 'os horários do cartão do Teams'].filter(Boolean).join(' e ')}: ${conferencia.muda.map((m) => m.oque).join(', ') || 'sem mudança'}${criadas}`);
      return json(res, 200, await lerAsSecoes());
    } catch (e) {
      console.warn(`[configuração] ${e instanceof Error ? e.message : e}`);
      return json(res, 502, { erro: `Não consegui ler o quadro do Trello ou salvar: ${e instanceof Error ? e.message : e}` });
    }
  }

  /** Pessoas com o Trello ou o Teable fora do ar (#79): qual (ou os dois) e desde quando (a primeira falha). */
  function foraDasPessoas(verificacao) {
    const caidos = (verificacao?.falhou ?? []).map((s) => fora.estado(s)).filter(Boolean);
    if (!caidos.length) return null;
    return { servico: caidos.map((f) => f.servico).join(' e '), desde: caidos.map((f) => f.desde).sort()[0] };
  }

  /**
   * A seção Pessoas como a tela lê: os administradores (a chave-mestra marcada), quem já entrou no PROMeiro (para
   * escolher), as novidades do quadro (as pendentes e as ignoradas), quando foi a verificação e o erro dela. Cada
   * novidade diz se a pessoa é administradora (pelo e-mail da tabela, do Trello ou de quem entrou com o mesmo nome).
   */
  function estadoDasPessoas(eu, verificacao) {
    const foraDoAr = foraDasPessoas(verificacao);
    const usuarios = q.todosOsUsuarios.all();
    // o nome de cada administrador: o de quem já entrou no PROMeiro ou, senão, o da tabela designers (pelo e-mail)
    const designers = (verificacao?.designers ?? []).filter((d) => d.email && d.nome).map((d) => ({ email: d.email, nome: d.nome }));
    const administradores = administradoresDaTela(env, [...usuarios, ...designers]);
    const salvos = administradoresSalvos(env);
    const peloNome = (nome) => usuarios.find((u) => nomeComparavel(u.nome) === nomeComparavel(nome))?.email ?? '';
    const comoATelaVe = (n) => {
      const email = n.tipo === 'entrou' ? pessoas.emailDe(n) || peloNome(n.nome) : n.email;
      return { ...n, emailSugerido: email, administrador: !!email && ehAdministrador(email, env), salvo: salvos.includes(email) };
    };
    const { pendentes, ignoradas } = pessoas.separar(verificacao?.novidades ?? []);
    return {
      eu: eu.email,
      administradores,
      quemJaEntrou: usuarios.filter((u) => !administradores.some((a) => a.email === u.email)).map((u) => ({ email: u.email, nome: u.nome })),
      novidades: pendentes.map(comoATelaVe),
      ignoradas: ignoradas.map(comoATelaVe),
      verificadoEm: verificacao?.em ?? '',
      ...(verificacao?.erro ? { erro: verificacao.erro } : {}),
      ...(foraDoAr ? { foraDoAr } : {}),
    };
  }

  /**
   * A seção Pessoas da Configuração (#77), só para administradores. GET verifica de novo (os designers da produção da
   * arte × a tabela designers, os dois no Teable) e devolve o estado. POST { acao, chave?, email? }: "administrador" e
   * "tirar" mudam os administradores salvos na tela (vale na hora no app inteiro; a chave-mestra não sai e ninguém tira a si mesmo);
   * "cadastrar" (quem entrou vira designer ativo no Teable), "inativar" (quem saiu fica inativo), "ignorar" e
   * "desfazer". Cadastrar, inativar e ignorar valem só para a novidade de agora (404 se não é mais).
   */
  async function rotaDasPessoas(req, res, eu) {
    if (req.method === 'GET') return json(res, 200, estadoDasPessoas(eu, await verificarPessoas()));
    if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
    const corpo = (await lerCorpo(req).catch(() => null)) ?? {};
    const acao = String(corpo.acao ?? '');
    const chave = String(corpo.chave ?? '').slice(0, 200);
    if (acao === 'administrador' || acao === 'tirar') {
      const r = acao === 'administrador' ? porAdministrador(env, String(corpo.email ?? '')) : tirarAdministrador(env, String(corpo.email ?? ''), eu.email);
      if ('erro' in r) return json(res, 422, r);
      // tornar administrador quem entrou: o e-mail fica lembrado (pela chave) para o cadastro de designer
      const entrou = acao === 'administrador' && chave.startsWith('entrou:') ? (pessoas.guardada()?.novidades ?? []).find((n) => n.chave === chave) : null;
      if (entrou) pessoas.lembrarEmail(entrou.chave, corpo.email);
      mudarConfiguracao({ ADMINISTRADORES: JSON.stringify(r.salvos) }, { por: eu.email });
      console.log(`[pessoas] ${eu.email} ${acao === 'tirar' ? 'tirou' : 'pôs'} ${String(corpo.email).trim().toLowerCase()} ${acao === 'tirar' ? 'dos' : 'nos'} administradores`);
      return json(res, 200, estadoDasPessoas(eu, ultimaDasPessoas()));
    }
    if (acao === 'desfazer') {
      pessoas.desfazer(chave);
      return json(res, 200, estadoDasPessoas(eu, ultimaDasPessoas()));
    }
    if (!['cadastrar', 'inativar', 'ignorar'].includes(acao)) return json(res, 400, { erro: 'Ação desconhecida.' });
    const agora = await verificarPessoas();
    const novidade = agora.novidades.find((n) => n.chave === chave);
    const tipo = { cadastrar: 'entrou', inativar: 'saiu' }[acao];
    if (!novidade || (tipo && novidade.tipo !== tipo)) return json(res, 404, { erro: 'Essa pessoa não é mais novidade.' });
    if (agora.erro && acao !== 'ignorar') return json(res, 502, { erro: agora.erro });
    try {
      if (acao === 'ignorar') pessoas.ignorar(novidade, eu.email);
      else await pessoas[acao](env, novidade);
    } catch (e) {
      console.warn(`[pessoas] ${e instanceof Error ? e.message : e}`);
      return json(res, 502, { erro: `Não consegui gravar na tabela designers do Teable: ${e instanceof Error ? e.message : e}.` });
    }
    console.log(`[pessoas] ${eu.email} ${{ cadastrar: 'cadastrou como designer', inativar: 'marcou como inativo', ignorar: 'ignorou' }[acao]} ${novidade.nome}`);
    return json(res, 200, estadoDasPessoas(eu, acao === 'ignorar' ? agora : await verificarPessoas()));
  }

  /**
   * Aba Duplicadas dos Cadastros (#65), só para administradores: a lista dos casos do período (?dias=, 1 a 730, 90 sem
   * dizer; ?busca=; ?renovar=1 lê a produção da arte de novo), o detalhe de um caso (?id=) e o registro; nada é lido
   * do Trello. Ignorar e reabrir (#66, POST { id, dias, motivo }) só anotam no registro do PROMeiro: nada muda no Trello
   * nem no Teable. Apagar (#67, POST { caso, dias, sai, fica, codigo, vistos }) relê os cards no Teable e só escreve no
   * Trello (o comentário e o DELETE); a cópia fica em GET /api/duplicadas/copia?id=; POST /api/duplicadas/modo
   * { soOlhar } liga ou desliga o modo só olhar (DUPLICADAS_SO_OLHAR). Recriar (#68, POST { id }, o apagar do
   * registro) faz um card novo da cópia, sem ler o Trello.
   */
  /**
   * As Produções (#86), só para administradores, para conferir a carga: GET /api/producoes dá quantas há em cada etapa
   * (e com card, Roteiro e filme) e a última carga desta partida; com ?card= ou ?registro=, as Produções daquele card
   * ou daquele registro do Teable. POST /api/producoes/recarregar roda a carga de novo (atualiza, não duplica).
   */
  async function rotaDasProducoes(req, res, eu, caminho) {
    const recarregar = caminho === '/api/producoes/recarregar';
    if (req.method !== (recarregar ? 'POST' : 'GET')) return json(res, 405, { erro: 'Método não permitido.' });
    if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: recarregar ? 'Só administradores recarregam as Produções.' : 'Só administradores veem as Produções.' });
    const ligado = !!trello.temProducao;
    if (recarregar) {
      if (!ligado) return json(res, 404, { erro: 'A produção da arte do Teable não está configurada.' });
      try {
        console.log(`[producoes] ${eu.email} pediu a carga de novo`);
        return json(res, 200, await producoes.carregar(trello, pracas));
      } catch (e) {
        console.warn(`[producoes] ${e instanceof Error ? e.message : e}`);
        return json(res, 502, { erro: `Não consegui ler a produção da arte: ${e instanceof Error ? e.message : e}` });
      }
    }
    const busca = new URL(req.url, 'http://x').searchParams;
    const card = (busca.get('card') ?? '').trim().slice(0, 100);
    const registro = (busca.get('registro') ?? '').trim().slice(0, 100);
    if (card || registro) return json(res, 200, { producoes: producoes.buscar({ card, registro }) });
    return json(res, 200, { ligado, ...producoes.contagem(), ultimaReleitura, ultimaRecuperacao });
  }

  async function rotaDasDuplicadas(req, res, eu, caminho) {
    const acao = caminho === '/api/duplicadas/ignorar' || caminho === '/api/duplicadas/reabrir';
    const escreve = acao || ['/api/duplicadas/apagar', '/api/duplicadas/modo', '/api/duplicadas/recriar'].includes(caminho);
    if (req.method !== (escreve ? 'POST' : 'GET')) return json(res, 405, { erro: 'Método não permitido.' });
    if (!cadastros.podeApagar(eu.email))
      return json(res, 403, { erro: caminho === '/api/duplicadas/apagar' ? 'Só administradores apagam duplicadas.' : caminho === '/api/duplicadas/recriar' ? 'Só administradores recriam cards apagados.' : escreve ? 'Só administradores ignoram, reabrem e apagam duplicadas.' : 'Só administradores veem as duplicadas.' });
    if (caminho === '/api/duplicadas/registro') return json(res, 200, { registro: duplicadas.registro() });
    const busca = new URL(req.url, 'http://x').searchParams;
    // a cópia guardada de um card apagado (#67), para conferir e para o #68 recriar
    if (caminho === '/api/duplicadas/copia') {
      const copia = /^\d{1,12}$/.test(busca.get('id') ?? '') ? duplicadas.copia(Number(busca.get('id'))) : null;
      return copia ? json(res, 200, { copia }) : json(res, 404, { erro: 'Não há cópia guardada com este número.' });
    }
    // o modo só olhar (#67): a chave DUPLICADAS_SO_OLHAR da configuração (vale na hora e entra no histórico)
    if (caminho === '/api/duplicadas/modo') {
      const corpo = (await lerCorpo(req).catch(() => null)) ?? {};
      if (typeof corpo.soOlhar !== 'boolean') return json(res, 400, { erro: 'Diga se a aba fica só olhando (soOlhar: true ou false).' });
      mudarConfiguracao({ DUPLICADAS_SO_OLHAR: corpo.soOlhar ? '1' : '0' }, { por: eu.email });
      console.log(`[duplicadas] ${eu.email} ${corpo.soOlhar ? 'ligou o modo só olhar' : 'liberou o apagar'}`);
      return json(res, 200, { soOlhar: corpo.soOlhar });
    }
    // recriar o card apagado da cópia (#68): o número do apagar no registro
    if (caminho === '/api/duplicadas/recriar') {
      const corpo = (await lerCorpo(req).catch(() => null)) ?? {};
      if (!Number.isInteger(corpo.id) || corpo.id < 1) return json(res, 400, { erro: 'Diga qual apagar do Registro recriar.' });
      try {
        const r = await duplicadas.recriar(corpo.id, { por: { email: eu.email, nome: eu.nome } });
        if (r.ok) return json(res, 200, r.resultado);
        const { status, ...resto } = r;
        return json(res, status, resto);
      } catch (e) {
        console.warn(`[duplicadas] ${e instanceof Error ? e.message : e}`);
        return json(res, 502, { erro: `Não consegui recriar o card: ${e instanceof Error ? e.message : e}.` });
      }
    }
    if (caminho === '/api/duplicadas/apagar') {
      const corpo = (await lerCorpo(req).catch(() => null)) ?? {};
      const textoDias = corpo.dias == null ? '' : String(corpo.dias);
      const dias = textoDias === '' ? DIAS_PADRAO : /^\d{1,4}$/.test(textoDias) ? Number(textoDias) : NaN;
      if (!(dias >= 1 && dias <= DIAS_MAXIMO)) return json(res, 400, { erro: `O período vai de 1 a ${DIAS_MAXIMO} dias.` });
      const id24 = (v) => typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v);
      if (typeof corpo.caso !== 'string' || !corpo.caso || corpo.caso.length > 400) return json(res, 400, { erro: 'Falta o caso.' });
      if (!id24(corpo.sai) || !id24(corpo.fica)) return json(res, 400, { erro: 'Falta o card que sai ou o card que fica.' });
      const vistos = corpo.vistos && typeof corpo.vistos === 'object' && !Array.isArray(corpo.vistos) ? corpo.vistos : {};
      try {
        const r = await duplicadas.apagar(corpo.caso, { dias, sai: corpo.sai, fica: corpo.fica, codigo: typeof corpo.codigo === 'string' ? corpo.codigo : '', vistos, por: { email: eu.email, nome: eu.nome } });
        if (r.ok) return json(res, 200, r.resultado);
        const { status, ...resto } = r;
        return json(res, status, resto);
      } catch (e) {
        console.warn(`[duplicadas] ${e instanceof Error ? e.message : e}`);
        return json(res, 502, { erro: `Não consegui reler os cards na produção da arte: ${e instanceof Error ? e.message : e}. Nada foi apagado.` });
      }
    }
    const corpo = acao ? ((await lerCorpo(req).catch(() => null)) ?? {}) : {};
    const textoDias = acao ? (corpo.dias == null ? null : String(corpo.dias)) : busca.get('dias');
    const dias = textoDias === null || textoDias === '' ? DIAS_PADRAO : /^\d{1,4}$/.test(textoDias) ? Number(textoDias) : NaN;
    if (!(dias >= 1 && dias <= DIAS_MAXIMO)) return json(res, 400, { erro: `O período vai de 1 a ${DIAS_MAXIMO} dias.` });
    if (acao) {
      if (typeof corpo.id !== 'string' || !corpo.id || corpo.id.length > 400) return json(res, 400, { erro: 'Falta o caso.' });
      if (corpo.motivo != null && typeof corpo.motivo !== 'string') return json(res, 400, { erro: 'O motivo é um texto.' });
      if ((corpo.motivo ?? '').trim().length > MOTIVO_MAXIMO) return json(res, 400, { erro: `O motivo vai até ${MOTIVO_MAXIMO} letras.` });
    }
    try {
      const por = { email: eu.email, nome: eu.nome };
      if (acao) {
        const r = caminho === '/api/duplicadas/ignorar' ? await duplicadas.ignorar(corpo.id, { dias, motivo: corpo.motivo ?? '', por }) : duplicadas.reabrir(corpo.id, { por });
        return r.ok ? json(res, 200, { ok: true }) : json(res, r.status, { erro: r.erro });
      }
      if (caminho === '/api/duplicadas')
        return json(res, 200, await duplicadas.listar({ dias, busca: (busca.get('busca') ?? '').slice(0, 200), renovar: busca.get('renovar') === '1' }));
      const roteiroDoCard = (card) => {
        const l = q.roteiroDoCard.get(card);
        return l ? { id: String(l.id), claquete: String(l.claquete ?? ''), por: String(l.por ?? '') } : null;
      };
      const caso = await duplicadas.detalhe((busca.get('id') ?? '').slice(0, 400), { dias, roteiroDoCard });
      return caso ? json(res, 200, caso) : json(res, 404, { erro: 'Este caso não está mais entre as duplicadas do período.' });
    } catch (e) {
      console.warn(`[duplicadas] ${e instanceof Error ? e.message : e}`);
      return json(res, 502, { erro: `Não consegui ler as duplicadas (produção da arte ou Trello): ${e instanceof Error ? e.message : e}` });
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
    // o PDF inteiro da prévia que chegou por e-mail (#157): o navegador baixa para preparar
    const doPdf = /^\/api\/filmes\/previas\/([\w-]{6,80})\/pdf$/.exec(caminho);
    if (doPdf && req.method === 'GET') {
      const dados = filmes.pdf(doPdf[1]);
      if (!dados) return json(res, 404, { erro: 'Esta prévia não tem o PDF inteiro guardado.' });
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': dados.length, 'cache-control': 'private, no-store' });
      return res.end(dados);
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
        // as praças vão junto: o navegador reconhece a praça da claquete com elas (sem os ids do Trello)
        // admin: o menu do perfil mostra a Configuração (só para administradores: a chave-mestra ou o salvo na tela);
        // novidades: quantas há no quadro (o pontinho no menu), da última verificação, sem ir ao Trello
        const admin = cadastros.podeApagar(eu.email);
        const novidades = admin ? pessoas.separar(pessoas.guardada()?.novidades ?? []).pendentes.length : undefined;
        // as áreas de trabalho (#101): as da pessoa (pelo e-mail nos cadastros), a de entrada e as preferências
        // coordenacao: a pessoa monta a pauta (#123); a entrada "Montar a pauta" só aparece para ela
        const dela = await daPessoa(eu.email, admin);
        return json(res, 200, { ...eu, trello: trello.ligado, filmes: filmes.ligado, tour, pracas: pracasParaONavegador(pracas), admin, coordenacao: escala.ehCoordenacao(eu.email), ...(admin ? { novidades } : {}), ...dela });
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
        postgres: { esquema: env.TEABLE_PG_ESQUEMA || '', atracoes: tabelaNoPg(env, 'atracoes'), url: env.TEABLE_PG_URL ? 'configurada' : 'faltando' },
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
      itens.push({ item: 'Acervo de artes', ok: acervo.ligado && acervo.grava, detalhe: acervo.ligado ? (acervo.grava ? 'lê e grava' : 'só lê (falta TEABLE_ACERVO)') : 'desligado (falta a tabela ARTES_acervo na base do Teable)' });
      if (trello.conferir) itens.push(...(await trello.conferir()));
      // o reconhecimento de atração com dados reais: a mesma regra do navegador (key no começo; senão, o nome no meio)
      if (trello.ultimasClaquetes) {
        try {
          const achar = (claquete) => atracaoPelaClaquete(claquete, voc.programas ?? [], pracas);
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
    if (caminho === '/api/apelidos') {
      // o apelido da claquete (#120), um por claquete (#154): qualquer pessoa logada lê, dá, troca e tira o apelido
      // ("voltar ao original", o apelido vazio) e as versões à mão (#152, as vazias voltam ao valor inicial); o que não
      // vem no pedido fica como está. O alvo é o roteiro (que a pessoa lê), a Produção ou a claquete (a da pauta, sem
      // roteiro no PROMeiro): todos dão a chave da claquete
      const lidos = () => apelidos.todos((id) => acesso(id, eu).ler);
      if (req.method === 'GET') return json(res, 200, lidos());
      if (req.method !== 'PUT') return json(res, 405, { erro: 'Método não permitido.' });
      const corpo = (await lerCorpo(req).catch(() => null)) ?? {};
      let claquete;
      if (typeof corpo.roteiro === 'string') {
        const { linha, ler } = ID_VALIDO.test(corpo.roteiro) ? acesso(corpo.roteiro, eu) : { linha: null, ler: false };
        if (!linha || !ler) return json(res, 404, { erro: 'Roteiro não encontrado.' });
        claquete = JSON.parse(linha.meta)?.claquete;
      } else if (typeof corpo.producao === 'string') {
        claquete = apelidos.claqueteDaProducao(corpo.producao);
        if (claquete === null) return json(res, 404, { erro: 'Produção não encontrada.' });
      } else if (typeof corpo.claquete === 'string') claquete = corpo.claquete;
      else return json(res, 400, { erro: 'Falta o roteiro, a Produção ou a claquete.' });
      const recusa = apelidos.gravar(claquete, { apelido: corpo.apelido, versoes: corpo.versoes }, eu);
      if (recusa) return json(res, 400, { erro: recusa });
      // os colegas com a fila aberta passam a ver o apelido na hora
      void cache.publicar(FILA, { tipo: 'apelido', por: eu.email }).catch(() => {});
      return json(res, 200, lidos());
    }
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
    if (caminho === '/api/eu/preferencias') {
      // as preferências da pessoa (#101), uma chave por vez ou várias: { area: 'redator' } ou a exibição de uma área dos
      // roteiros (#103): { 'exibicao.redator': 'quadro' }, ou a visão e os arranjos da Pauta da edição (#98), que é de
      // todo mundo: { 'pauta.visao': 'dia' }, ou os blocos recolhidos da tela de produções (#113), também de todo mundo:
      // { 'producoes.recolhidos': ['RJ'] }, e a ordem das praças arrumada arrastando (#159): { 'producoes.ordem': ['SP', 'RJ'] }.
      // Cada chave é conferida aqui; uma ruim recusa o pedido inteiro
      if (req.method !== 'PUT') return json(res, 405, { erro: 'Método não permitido.' });
      const corpo = (await lerCorpo(req).catch(() => null)) ?? {};
      const entradas = Object.entries(typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {});
      if (!entradas.length) return json(res, 400, { erro: 'Nenhuma preferência para guardar.' });
      const minhas = (await daPessoa(eu.email, cadastros.podeApagar(eu.email))).areas;
      for (const [chave, valor] of entradas) {
        if (ehChaveDaPauta(chave)) {
          const recusa = recusaDaPreferenciaDaPauta(chave, valor);
          if (recusa) return json(res, 400, { erro: recusa });
          continue;
        }
        if (chave === CHAVE_DO_CODIGO_DAS_VERSOES) {
          // "Mostrar o código das versões" (#152), de todo mundo, para o PROMeiro todo
          const recusa = recusaDoCodigoDasVersoes(valor);
          if (recusa) return json(res, 400, { erro: recusa });
          continue;
        }
        if (chave === CHAVE_DOS_RECOLHIDOS || chave === CHAVE_DA_ORDEM) {
          const recusa = chave === CHAVE_DA_ORDEM ? recusaDaOrdem(valor) : recusaDosRecolhidos(valor);
          if (recusa) return json(res, 400, { erro: recusa });
          continue;
        }
        const daExibicao = areaDaChaveDeExibicao(chave);
        if (daExibicao) {
          if (!ehExibicao(valor)) return json(res, 400, { erro: 'Exibição desconhecida: escolha por dia, quadro ou por estado.' });
          // como a área: a exibição da área que a pessoa não tem não é guardada
          if (!minhas.includes(daExibicao)) return json(res, 400, { erro: `Você não tem a área ${daExibicao}.` });
          continue;
        }
        if (chave !== 'area') return json(res, 400, { erro: `Preferência desconhecida: ${chave}.` });
        if (!ehArea(valor)) return json(res, 400, { erro: 'Área desconhecida.' });
        if (!minhas.includes(valor)) return json(res, 400, { erro: `Você não tem a área ${valor}.` });
      }
      q.verUsuario.run(eu.email, eu.nome, new Date().toISOString());
      for (const [chave, valor] of entradas) preferencias.gravar(eu.email, chave, valor);
      return json(res, 200, { ok: true, preferencias: preferencias.ler(eu.email) });
    }
    if (caminho === '/api/meus-roteiros') {
      // "meus roteiros" do Redator e do Editor (#101): os roteiros guardados no PROMeiro em que a pessoa é o redator
      // ou o editor, pelo nome do cadastro ligado ao e-mail dela. Nada é lido do Trello
      const area = new URL(req.url, 'http://x').searchParams.get('area');
      if (!ehAreaDosRoteiros(area)) return json(res, 400, { erro: 'Escolha a área: redator ou editor.' });
      // o administrador vê os roteiros de todos (#105): "de=todos" ou "de=<nome>"; para os outros, o pedido é recusado
      const de = new URL(req.url, 'http://x').searchParams.get('de');
      if (de !== null && !cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores veem os roteiros de todos.' });
      const nome = (await areas.quemE(eu.email, cadastros))[area]?.nome ?? null;
      // cada um com o ciclo (#102): o estado e os passos com data, e quem da arte está com ele (os designers da Produção)
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD no horário de Brasília
      // e as artes do roteiro aberto (#104): as da revisão e as do designer, com o estado, pela Produção
      const artesDe = (r, producao) => {
        try {
          return artesComOEstado(r.meta, JSON.parse(q.um.get(r.id)?.doc ?? 'null') ?? { type: 'doc', content: [] }, producao);
        } catch (e) {
          console.warn(`[meus-roteiros] as artes de ${r.id}: ${e instanceof Error ? e.message : e}`);
          return { lista: [], aProduzir: r.nArtes ?? 0, entregues: 0 };
        }
      };
      const comOCiclo = (r) => {
        const enviado = r.trello?.estado === 'enviado' || r.trello?.estado === 'duplicado' ? r.trello : null;
        const producao = producoes.doRoteiro({ roteiro: r.id, card: enviado?.card });
        const fatos = { chegouEm: q.chegou.get(r.id)?.criado_em ?? null, enviadoEm: enviado?.em ?? null, producao, dataExibicao: r.meta?.dataExibicao };
        return { ...r, ciclo: cicloDoRoteiro(fatos, hoje), daArte: producao?.designers ?? [], artes: artesDe(r, producao) };
      };
      if (de !== null) {
        const todos = deTodos(resumosPara(eu), area, de || 'todos', (await areas.nomesDosCadastros(cadastros))[area]);
        return json(res, 200, { area, nome, de: de || 'todos', pessoas: todos.pessoas, roteiros: todos.roteiros.map(comOCiclo) });
      }
      return json(res, 200, { area, nome, roteiros: nome ? dosMeusRoteiros(resumosPara(eu), area, nome).map(comOCiclo) : [] });
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
      if (!acervo.ligado || !acervo.grava) return json(res, 503, { erro: 'O acervo de artes não está configurado para gravar (a tabela ARTES_acervo na base do Teable).' });
      const corpo = (await lerCorpo(req, LIMITE_CORPO, 'CSV')) ?? {};
      const atracao = typeof corpo.atracao === 'string' ? corpo.atracao.trim().slice(0, 200) : '';
      if (!atracao) return json(res, 400, { erro: 'Qual atração?' });
      try {
        const qual = await acervo.acervoDe(atracao);
        if (qual !== 'proprio') return json(res, 422, { erro: `${atracao} não tem acervo próprio: a importação é só para atração de acervo próprio.` });
        if (typeof corpo.csv !== 'string' || !corpo.csv.trim()) return json(res, 400, { erro: 'O CSV veio vazio.' });
        if (caminho === '/api/acervo/importar/previa') {
          const arquivo = typeof corpo.arquivo === 'string' ? corpo.arquivo.slice(0, 200) : '';
          // os avisos (#62): a pasta de output e o já importado, pelo histórico desta atração
          return json(res, 200, { atracao, arquivo, ...(await acervo.previaDaImportacao(atracao, corpo.csv, regrasDaAtracao.daAtracao(atracao), { arquivo, historico: importacoes.historicoDe(atracao) })) });
        }
        // o gravar recebe o mesmo CSV e as escolhas da conferência, e classifica de novo contra o acervo relido; o
        // registro de cada passo vai para o histórico (#61), para desfazer e para retomar se parar no meio. O CSV de
        // fora da pasta de output da atração só grava com confirmouAtracao (#62)
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
          const { registro, ...feito } = await acervo.gravarImportacao(atracao, corpo.csv, escolhas, { anotar, regras: regrasDaAtracao.daAtracao(atracao), lembrar, confirmouAtracao: corpo.confirmouAtracao === true });
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
      if (!acervo.ligado || !acervo.grava) return json(res, 503, { erro: 'O acervo de artes não está configurado para gravar (a tabela ARTES_acervo na base do Teable).' });
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
      // o pôster do filme (#90): a cópia guardada pelo PROMeiro; sem ela, o do Teable (campo poster da tabela de
      // filmes), que vira a cópia. Sem os dois, 404 (e o "não tem" fica guardado, sem ir ao Teable a cada pedido)
      return servirPoster(res, await anexos.poster(posterDe[1], env), 'private');
    }
    const doAnexo = idDoCaminho(caminho);
    if (doAnexo && req.method === 'GET') {
      // o PDF do roteiro que foi ao card (#90), pelo endereço fixo que a produção da arte guarda; o id não muda
      const pdf = anexos.pdf(doAnexo);
      if (!pdf) return json(res, 404, { erro: 'Este PDF não está guardado no PROMeiro.' });
      const ascii = pdf.nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      res.writeHead(200, {
        'content-type': pdf.mime,
        'content-length': pdf.dados.length,
        'content-disposition': `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(pdf.nome)}`,
        'cache-control': 'private, max-age=31536000, immutable',
      });
      return res.end(pdf.dados);
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
      const key = semAcentoMin(chaveDaAtracao(claquete, pracas)).toUpperCase();
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
      const r = semCadastro(claquetes, voc.programas ?? [], new Set(q.ignoradas.all().map((l) => l.key)), pracas);
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
    if (caminho === '/api/configuracao/pessoas') {
      if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores veem e mudam as pessoas.' });
      return rotaDasPessoas(req, res, eu);
    }
    if (caminho === '/api/configuracao' || caminho.startsWith('/api/configuracao/')) return rotaDaConfiguracao(req, res, eu, caminho);
    if (caminho === '/api/andamento-do-projeto') {
      // o Andamento do projeto (#92), só para administradores (a mesma regra do app); ?deNovo=1 vai ao GitHub
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores veem o Andamento.' });
      const deNovo = new URL(req.url, 'http://x').searchParams.get('deNovo') === '1';
      return json(res, 200, await andamentoDoProjeto.ler(configuracao.valores(), { deNovo }));
    }
    if (caminho === '/api/producoes/por-praca') {
      // a tela de produções (#109): para qualquer pessoa logada (é o trabalho que a equipe toda vê no Trello), as
      // Produções abertas num bloco por praça, na ordem das praças da Configuração; o Entregue, só os dos últimos dias.
      // Só o que o PROMeiro guarda (e o vocabulário, para a atração pela claquete): nada do Trello
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      const desde = new Date(Date.now() - DIAS_DO_ENTREGUE * 86_400_000).toISOString();
      const programas = (await vocabulario.ler().catch(() => null))?.programas ?? [];
      const cards = producoes.naTela(desde, (claquete) => atracaoPelaClaquete(claquete, programas, pracas)).map(comAsVersoes);
      // quem está logado e o designer dele (#110): sem a ligação, vê a tela, mas não pega, e a tela diz a quem pedir
      const designer = pessoas.designerDoEmail(eu.email);
      const voce = designer ? { designer: designer.nome } : { designer: null, porQue: SEM_LIGACAO };
      return json(res, 200, { entregueDias: DIAS_DO_ENTREGUE, blocos: blocosDasProducoes(cards, pracas), voce });
    }
    if (caminho === '/api/producoes/busca') {
      // a busca da tela de produções (#161): para qualquer pessoa logada, ?q=<termo>&pagina=<n, de 0>, no histórico
      // todo (também os entregues que a tela já não mostra), pela claquete, pela atração e pelas pessoas, em páginas.
      // Só o que o PROMeiro guarda: nada do Trello
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      const busca = new URL(req.url, 'http://x').searchParams;
      const programas = (await vocabulario.ler().catch(() => null))?.programas ?? [];
      const r = producoes.naBusca((busca.get('q') ?? '').slice(0, 100), { pagina: busca.get('pagina') ?? 0, atracaoDaClaquete: (claquete) => atracaoPelaClaquete(claquete, programas, pracas) });
      return json(res, 200, { ...r, cards: r.cards.map(comAsVersoes) });
    }
    if (caminho === '/api/producoes/etapa') {
      // pegar, voltar para a Entrada (#110) e entregar (#111), para quem está ligado a um designer: { producao, etapa
      // (produzindo, entrada ou entregue), assimMesmo }. Entregar com arte faltando, sem assimMesmo, devolve as que
      // faltam e nada muda. Escreve no Trello (o membro do card, mover de lista), nunca lê; nada vai ao Teable
      if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
      const corpo = (await lerCorpo(req, 4096, 'Pedido')) ?? {};
      const programas = (await vocabulario.ler().catch(() => null))?.programas ?? [];
      const aTela = (id) => comAsVersoes(producoes.umaNaTela(id, (claquete) => atracaoPelaClaquete(claquete, programas, pracas)));
      const r = await etapaDaProducao.mudar({ producao: corpo.producao, etapa: corpo.etapa, assimMesmo: corpo.assimMesmo === true }, { trello, pracas, email: eu.email, designer: pessoas.designerDoEmail(eu.email), aTela });
      return json(res, r.status, r.corpo);
    }
    if (caminho === '/api/producoes/desfazer') {
      // desfazer (#112): a ação contrária da última mudança da etapa de quem pede, naquele card ({ producao }), gravada
      // como eventos novos. Só se ninguém mudou a etapa depois; escreve no Trello, nunca lê; nada vai ao Teable
      if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
      const corpo = (await lerCorpo(req, 4096, 'Pedido')) ?? {};
      const programas = (await vocabulario.ler().catch(() => null))?.programas ?? [];
      const aTela = (id) => comAsVersoes(producoes.umaNaTela(id, (claquete) => atracaoPelaClaquete(claquete, programas, pracas)));
      const r = await etapaDaProducao.desfazer({ producao: corpo.producao }, { trello, pracas, email: eu.email, designer: pessoas.designerDoEmail(eu.email), aTela });
      return json(res, r.status, r.corpo);
    }
    if (caminho === '/api/producoes/aberta') {
      // abrir a Produção na tela de produções (#113): a linha do tempo, as artes do checklist e o link do card no Trello,
      // para qualquer pessoa logada (é o trabalho que a equipe toda vê no card). Só o que o PROMeiro guarda: nada do Trello
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      const id = (new URL(req.url, 'http://x').searchParams.get('producao') ?? '').trim().slice(0, 100);
      if (!id) return json(res, 400, { erro: 'Falta a Produção.' });
      const aberta = await abertaNaTela(id);
      return aberta ? json(res, 200, aberta) : json(res, 404, { erro: 'Essa Produção não existe mais.' });
    }
    const doCardAberto = /^\/api\/producoes\/(prazo|atracao|designer|arte|fogo)$/.exec(caminho);
    if (doCardAberto) {
      // o card aberto (#160), para quem está ligado a um designer: o prazo { producao, prazo }, a atração { producao,
      // atracao ('' desliga) }, o designer { producao, designer, entra }, a arte { producao, arte, acao (marcar,
      // desmarcar, apagar, voltar, incluir) } e o fogo { producao, arte, nivel? }. Escreve no Trello (o prazo, o membro,
      // o checklist; a única leitura é a do checklist do card que muda), grava os eventos; nada vai ao Teable. Responde
      // { feito, producao (o card da tela), aberta (como /api/producoes/aberta) }
      if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido.' });
      const corpo = (await lerCorpo(req, 4096, 'Pedido')) ?? {};
      const programas = (await vocabulario.ler().catch(() => null))?.programas ?? [];
      const aTela = (id) => comAsVersoes(producoes.umaNaTela(id, (claquete) => atracaoPelaClaquete(claquete, programas, pracas)));
      const ctx = { trello, email: eu.email, designer: pessoas.designerDoEmail(eu.email), aTela };
      const o = doCardAberto[1];
      let r;
      if (o === 'prazo') r = await cardDaProducao.prazo(corpo, ctx);
      else if (o === 'atracao') r = await cardDaProducao.atracao(corpo, { ...ctx, atracoes: (await atracoesDoCadastro()).map((a) => a.nome) });
      else if (o === 'designer') r = await cardDaProducao.designer(corpo, { ...ctx, designers: pessoas.designersAtivos() });
      else if (o === 'arte') r = await cardDaProducao.arte(corpo, ctx);
      else r = fogoNaTela(corpo, ctx);
      if (r.status !== 200) return json(res, r.status, r.corpo);
      return json(res, 200, { ...r.corpo, aberta: await abertaNaTela(r.corpo.producao?.id ?? corpo.producao) });
    }
    if (caminho === '/api/producoes' || caminho === '/api/producoes/recarregar') return rotaDasProducoes(req, res, eu, caminho);
    if (caminho === '/api/linha-do-tempo') {
      // a Linha do tempo (#89): para qualquer pessoa logada, porque é só a leitura do trabalho (quando entrou, quem
      // pegou, quando saiu), o mesmo que a equipe toda vê no card do Trello; sem os ids do Trello. As Produções inteiras
      // (a carga, os ids) continuam só para administradores, em /api/producoes
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      const busca = new URL(req.url, 'http://x').searchParams;
      const card = (busca.get('card') ?? '').trim().slice(0, 100);
      const producao = (busca.get('producao') ?? '').trim().slice(0, 100);
      if (!card && !producao) return json(res, 400, { erro: 'Falta o card ou a Produção.' });
      return json(res, 200, producoes.linhaDoTempo({ card, producao }));
    }
    if (caminho === '/api/duplicadas' || ['caso', 'registro', 'ignorar', 'reabrir', 'apagar', 'modo', 'copia', 'recriar'].some((r) => caminho === `/api/duplicadas/${r}`)) return rotaDasDuplicadas(req, res, eu, caminho);
    if (caminho === '/api/cadastros/ilhas' || caminho.startsWith('/api/cadastros/ilhas/')) return rotaDasIlhas(req, res, eu, caminho);
    if (caminho === '/api/cadastros/padeiros' || caminho.startsWith('/api/cadastros/padeiros/')) return rotaDosPadeiros(req, res, eu, caminho);
    if (caminho === '/api/cadastros' || caminho.startsWith('/api/cadastros/')) return rotaDosCadastros(req, res, eu, caminho);
    if (caminho === '/api/pauta/semana' || caminho === '/api/pauta/dia') {
      // a Semana (#94) e o Dia (#97) da pauta da edição, para qualquer pessoa logada: lidos do Postgres do Teable (só
      // leitura), nada do Trello. Na Semana, ?inicio= é qualquer dia dela; no Dia, ?dia= (sem eles, hoje, em São Paulo).
      // Com o banco fora do ar, da última cópia local (#99: `origem` e `copiaEm` dizem)
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      const busca = new URL(req.url, 'http://x').searchParams;
      const ehDia = caminho === '/api/pauta/dia';
      const doTeable = ehDia ? await pauta.dia(diaOuHoje(busca.get('dia') ?? '')) : await pauta.semana(segundaDaSemana(busca.get('inicio') ?? ''));
      // o dia publicado no PROMeiro (#127) entra junto (a regra em src/modelo/pautaPublicada.ts): antes da virada, a do
      // Teable fica inteira e do publicado entra só o que o Teable ainda não tem no dia; depois (#134), no dia que o
      // PROMeiro gravou no Teable vale o publicado, e as linhas do Teable daquele dia (o espelho) saem
      const dias = ehDia ? [doTeable.dia] : doTeable.dias;
      const gravados = pautaNoTeable.gravados(dias[0], dias.at(-1));
      const publicadas = escala.publicadas(dias[0], dias.at(-1)).map((p) => (gravados.has(p.dia) ? { ...p, vale: true } : p));
      const juntas = juntarAPublicada(doTeable.linhas, publicadas);
      const s = !publicadas.length ? doTeable : { ...doTeable, linhas: juntas, editores: ehDia ? colunasDoDia(juntas).map((c) => c.editor) : ordemDosEditores(juntas) };
      // a claquete com a produção da arte (#96): as Produções do PROMeiro (sem ler o Teable de novo), pela chave, com a
      // tolerância da busca do editor (sem a versão, sem a praça)
      const desde = new Date(Date.parse(`${s.inicio ?? s.dia}T12:00:00Z`) - 120 * 86_400_000).toISOString();
      const semPraca = (chave) => semPracaNoFim(chave, pracas, [MARCA_TODAS]);
      // cada Produção com as versões lidas do roteiro dela (#152), o valor inicial da claquete sem código no nome
      const comAsLidas = producoes.naPauta(desde).map((p) => {
        const { lidas } = apelidos.roteiroDaProducao(p.id);
        return lidas.length ? { ...p, versoesLidas: lidas } : p;
      });
      const linhas = cruzarComAProducao(s.linhas, comAsLidas, semPraca);
      // os filtros pessoais (#99): "Só as minhas" pelo editor ligado ao e-mail (#106), "Com arte minha" pelo designer
      // do e-mail (#110); o resumo, da pauta inteira, só para administradores
      const voce = { editor: (await areas.quemE(eu.email, cadastros)).editor?.nome ?? null, designer: pessoas.designerDoEmail(eu.email)?.nome ?? null };
      const filtro = ehFiltroDaPauta(busca.get('filtro')) ? busca.get('filtro') : null;
      const vistas = filtro ? filtrarAPauta(linhas, filtro, voce) : linhas;
      const editores = !filtro ? s.editores : ehDia ? colunasDoDia(vistas).map((c) => c.editor) : ordemDosEditores(vistas);
      const resumo = cadastros.podeApagar(eu.email) ? { resumo: resumoDaPauta(linhas, s.alteradoEm) } : {};
      // quem está fora (#128): todos veem "fora"; o motivo e a observação, só a coordenação e os administradores
      const fora = foraNaPauta(ausencias.noPeriodo(dias[0], dias.at(-1)), dias, escala.ehCoordenacao(eu.email) || cadastros.podeApagar(eu.email));
      return json(res, 200, { ...s, editores, linhas: vistas, filtro, voce, fora, ...resumo });
    }
    if (caminho === '/api/montar-pauta') return rotaDeMontarAPauta(req, res, eu);
    if (caminho === '/api/montar-pauta/foto') return rotaDaFotoDoDia(req, res, eu);
    const acaoDasAusencias = /^\/api\/montar-pauta\/(ausencias|ausencias\/onde|ausencias\/historico|ausencias\/apagar|tirar|para-distribuir\/tirar)$/.exec(caminho);
    if (acaoDasAusencias) return rotaDasAusencias(req, res, eu, acaoDasAusencias[1]);
    const acaoDoMontar = /^\/api\/montar-pauta\/(conferida|publicar|desfazer|repetir|para-distribuir|levar|mover|devolver|escalar|distribuir|desfazer-distribuicao)$/.exec(caminho);
    if (acaoDoMontar) return rotaDeMontarAPauta(req, res, eu, acaoDoMontar[1]);
    if (caminho === '/api/correcoes/pauta') {
      // a correção de grafia da pauta da edição (#114), só para administradores e só leitura: uma página das propostas
      // de um grupo (?grupo=corrigir, o padrão, ou nao-reconhecido; ?pagina= a partir de 1) e quantas há em cada um
      if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
      if (!cadastros.podeApagar(eu.email)) return json(res, 403, { erro: 'Só administradores veem a correção de grafia.' });
      const busca = new URL(req.url, 'http://x').searchParams;
      const grupo = GRUPOS_DAS_CORRECOES.includes(busca.get('grupo')) ? busca.get('grupo') : 'corrigir';
      const pagina = /^\d{1,5}$/.test(busca.get('pagina') ?? '') ? Math.max(1, Number(busca.get('pagina'))) : 1;
      return json(res, 200, await geracao.correcoes.propostas({ grupo, pagina }));
    }
    if (caminho === '/api/correcoes/atracoes' || caminho === '/api/correcoes/atracoes/nao-sao-a-mesma' || caminho === '/api/correcoes/atracoes/juntar') return rotaDasAtracoesParecidas(req, res, eu, caminho);
    if (caminho === '/api/correcoes/pauta/aplicar' || caminho === '/api/correcoes/registro' || caminho === '/api/correcoes/desfazer') return rotaDoRegistroDeCorrecoes(req, res, eu, caminho);
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
        resumosPara(eu),
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
        // as versões da chamada que as artes do roteiro dizem (#120), pela mesma regra do editor
        q.versoesLidas.run(JSON.stringify(versoesLidas(r.meta, r.doc)), id);
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

  /** O pôster (ou o 404 limpo, que o navegador guarda 10 minutos). */
  function servirPoster(res, img, quem) {
    if (!img) {
      res.writeHead(404, { 'cache-control': `${quem}, max-age=600` });
      return res.end();
    }
    res.writeHead(200, { 'content-type': img.mime, 'content-length': img.dados.length, 'cache-control': `${quem}, max-age=86400` });
    return res.end(img.dados);
  }

  /**
   * O que está embaixo de /api/publico/ (#90): fora do login. O pôster com o token certo, para o Padeiro; a foto da
   * planilha da edição (#133) e a prévia de filmes do e-mail (#157), para o n8n; o resto, 404.
   */
  async function rotaPublica(req, res, url) {
    if (req.method === 'POST' && url.pathname === ROTA_DA_FOTO) return rotaDaFoto(req, res);
    if (req.method === 'POST' && url.pathname === ROTA_DA_PREVIA) return rotaDaPrevia(req, res);
    const rec = req.method === 'GET' ? posterPublico(url.pathname, url.searchParams, env.POSTER_PUBLICO_TOKEN) : null;
    if (!rec) return json(res, 404, { erro: 'Não encontrado.' });
    return servirPoster(res, await anexos.poster(rec, env), 'public');
  }

  /**
   * A foto crua da planilha da edição (#133): POST /api/publico/edicao/foto, com `Authorization: Bearer
   * <EDICAO_FOTO_TOKEN>` e o pacote do n8n (o formato 1, até 1 MB). Guarda só as abas que mudaram desde a última foto
   * delas e responde { gravadas, iguais }. Sem o EDICAO_FOTO_TOKEN, a rota fica desligada (404); sem o token, ou com o
   * errado, 401. O caminho tem de vir exatamente assim (o torto, com %2e%2e ou barras repetidas, é 404).
   */
  async function rotaDaFoto(req, res) {
    const esperado = String(env.EDICAO_FOTO_TOKEN ?? '').trim();
    if (!esperado || String(req.url ?? '').split(/[?#]/)[0] !== ROTA_DA_FOTO) return json(res, 404, { erro: 'Não encontrado.' });
    if (!tokenBearerConfere(req.headers.authorization, esperado)) {
      req.resume();
      return json(res, 401, { erro: 'Token da foto da edição errado.' });
    }
    const foto = fotoDoPedido(await lerCorpo(req, LIMITE_DA_FOTO, 'Foto da planilha'));
    const r = fotosDaEdicao.receber(foto);
    console.log(`[foto da edição] ${r.gravadas} ${r.gravadas === 1 ? 'aba nova' : 'abas novas'}, ${r.iguais} ${r.iguais === 1 ? 'igual' : 'iguais'} (execução ${foto.origem.execucao || '?'})`);
    return json(res, 200, r);
  }

  /**
   * A prévia de filmes que chegou por e-mail (#157): POST /api/publico/filmes/previa, com `Authorization: Bearer
   * <FILMES_PREVIA_TOKEN>` e o multipart do n8n (o campo `pdf`, até 30 MB, e o `chegou_em`). Só guarda o PDF, como prévia
   * por preparar (o navegador prepara ao abrir), e responde { id, existente, nome, link }: o mesmo PDF de novo é
   * `existente: true` e não cria nada. Sem o FILMES_PREVIA_TOKEN, a rota fica desligada (404); sem o token, ou com o
   * errado, 401; com a aba Filmes desligada, 503. O caminho tem de vir exatamente assim (o torto é 404).
   */
  async function rotaDaPrevia(req, res) {
    const esperado = String(env.FILMES_PREVIA_TOKEN ?? '').trim();
    if (!esperado || String(req.url ?? '').split(/[?#]/)[0] !== ROTA_DA_PREVIA) return json(res, 404, { erro: 'Não encontrado.' });
    if (!tokenBearerConfere(req.headers.authorization, esperado)) {
      req.resume();
      return json(res, 401, { erro: 'Token da prévia de filmes errado.' });
    }
    if (!filmes.ligado) {
      req.resume();
      return json(res, 503, { erro: `A aba Filmes está desligada: falta ${filmes.faltando.join(', ')}.` });
    }
    const previa = await previaDoPedido(await lerBinario(req, LIMITE_DA_PREVIA), req.headers['content-type']);
    const r = filmes.receberPorEmail(previa);
    console.log(`[filmes] prévia por e-mail ${r.existente ? 'repetida' : 'nova'}: ${previa.nome} (${Math.round(previa.pdf.length / 1024)} KB)`);
    return json(res, 200, { ...r, link: linkDaAbaFilmes(env) });
  }

  /** O pôster do filme para o Padeiro (#142): o endereço público do PROMeiro (PROMEIRO_URL/api/publico/poster/<filme>?t=
      <POSTER_PUBLICO_TOKEN>), quando o filme tem pôster no Teable ou a cópia guardada pelo PROMeiro; null sem o
      PROMEIRO_URL ou sem o token (o endereço público fica desligado). */
  function posterDoPadeiro(filme, temNoTeable) {
    const base = String(env.PROMEIRO_URL ?? '').trim().replace(/\/+$/, '');
    const token = String(env.POSTER_PUBLICO_TOKEN ?? '').trim();
    if (!base || !token || !/^rec[A-Za-z0-9]{6,32}$/.test(String(filme ?? ''))) return null;
    if (!temNoTeable && !anexos.temPoster(filme)) return null;
    return `${base}/api/publico/poster/${filme}?t=${encodeURIComponent(token)}`;
  }

  /** O Padeiro da chave do pedido, quando ela está ligada a um designer: só a ligada lê (a lista e a Produção) e age
      (#146). Senão, responde a recusa (401 sem a chave ou com a errada; 403 com a pendente, que espera um administrador
      ligar e é o que a janela do After mostra, ou com a revogada, com o estado) e devolve null. */
  function padeiroLigado(req, res) {
    const p = padeiros.daChave(req.headers[CABECALHO_DA_CHAVE]);
    if (!p) json(res, 401, { erro: 'Chave do Padeiro desconhecida: faça o cadastro de novo.' });
    else if (p.estado === 'ligada') return p;
    else json(res, 403, { erro: p.estado === 'pendente' ? 'A chave do Padeiro está aguardando um administrador do PROMeiro ligar ao designer.' : 'A chave do Padeiro foi revogada: faça o cadastro de novo.', estado: p.estado });
    return null;
  }

  /** O designer da chave ligada como a tabela designers diz agora (o membro do Trello vem dela). */
  const designerDoPadeiro = (p) => {
    const doCadastro = (pessoas.guardada()?.designers ?? []).find((d) => d.registro === p.designer.registro);
    return { nome: doCadastro?.nome || p.designer.nome, membro: doCadastro?.idNoTrello || '' };
  };

  /** As atrações do cadastro (o Teable), para o "pronto para abrir"; [] com o Teable fora (fica "sem atração"). */
  const atracoesDoCadastro = async () => {
    const lido = await cadastros.ler().catch((e) => (console.warn(`[padeiro] não li o cadastro das atrações: ${e instanceof Error ? e.message : e}`), null));
    return lido?.ligado ? lido.atracoes : [];
  };
  /** As pastas do projeto dos filmes do cadastro ({ id: pasta }); {} com o Teable fora (os filmes ficam "sem pasta"). */
  const projetosDosFilmes = async (ids) => {
    try {
      return (await trello.projetosDosFilmes?.(ids)) ?? {};
    } catch (e) {
      console.warn(`[padeiro] não li as pastas dos filmes: ${e instanceof Error ? e.message : e}`);
      return {};
    }
  };
  /** Um caminho de verdade: o que o cadastro escreve quando não sabe o caminho (SEM_CAMINHO) não é pasta. */
  const temCaminho = (v) => !!String(v ?? '').trim() && !SEM_CAMINHO.test(String(v).trim());
  /**
   * O "pronto para abrir" da janela do After (#146): só a pasta do projeto conta (a do output não).
   * - O filme usa os caminhos do filme (`projetos`, de projetosDosFilmes: a fórmula projeto_win do cadastro de filmes,
   *   a mesma do card do filme), e não o cadastro de atrações: com a pasta, pronto; sem ela (ou sem o filme), "sem pasta".
   * - A atração da Produção (a do card da tela de produções) está no `cadastro` e tem a pasta do projeto (o campo de
   *   TEABLE_CAMPOS_CAMINHO que é o do projeto: projeto_win). Senão, "sem atração" ou "sem pasta".
   * O Mac não tem um campo à parte na atração: o Padeiro converte o caminho do Windows (o mesmo do card).
   */
  function prontoParaAbrir({ atracao, filme, ehFilme }, { cadastro, projetos }) {
    const comPasta = (pasta) => (temCaminho(pasta) ? { pronto: true, estado: 'pronto para abrir' } : { pronto: false, estado: 'sem pasta' });
    if (ehFilme) return comPasta(filme ? projetos[filme] : '');
    const a = atracao ? cadastro.find((x) => nomeComparavel(x.nome) === nomeComparavel(atracao)) : null;
    if (!a) return { pronto: false, estado: 'sem atração' };
    return comPasta(Object.entries(a.caminhos ?? {}).find(([campo]) => /^projeto/i.test(campo.trim()))?.[1]);
  }

  /**
   * A Produção como a janela do After mostra (#146): a praça e a etapa, a claquete, a versão da chamada só como o código
   * (a do card da tela de produções), o "pronto para abrir", os designers (e se o da chave está entre eles) e as artes
   * (`producoes.naJanela`), cada uma com o fogo da complexidade que o editor marcou no Roteiro ligado (BAIXA sem marca;
   * null sem Roteiro), se está feita e quem marcou, e a contagem. null sem a Produção (ou arquivada).
   */
  /** O fogo de cada arte (1 a 3) pela meta do Roteiro ligado, como a janela do After (#146) e o card aberto (#160)
      mostram; sem Roteiro, null. @param j a Produção de producoes.naJanela */
  const fogoDasArtes = ({ producao, meta }) => {
    const complexidade = meta?.complexidade && typeof meta.complexidade === 'object' ? meta.complexidade : {};
    return (a) => (producao.roteiroId ? ([1, 2, 3].includes(complexidade[chaveDeArte(a.nome)]) ? complexidade[chaveDeArte(a.nome)] : 1) : null);
  };

  /**
   * A Produção aberta na tela de produções (#113, #160): a de `producoes.aberta` (a linha do tempo, as artes do
   * checklist, o link do card) e, para o card aberto, as artes como a janela do After mostra (`artesDoCard`: cada arte
   * uma vez, feita ou não, com o fogo do Roteiro ligado; null sem ele), a versão do Roteiro (V1 sem versão nova) e
   * quando ele chegou, e as listas para escolher: os designers ativos e as atrações do cadastro. null sem a Produção.
   */
  async function abertaNaTela(id) {
    const aberta = typeof id === 'string' ? producoes.aberta(id) : null;
    if (!aberta) return null;
    const j = producoes.naJanela(id);
    const fogo = j ? fogoDasArtes(j) : () => null;
    const roteiro = producoes.roteiroDe(id);
    return {
      ...aberta,
      artesDoCard: (j?.artes ?? []).map((a) => ({ nome: a.nome, itens: a.itens, feita: a.feita, fogo: fogo(a) })),
      // a versão do Roteiro, pela regra de versaoDoRoteiro (src/modelo/versoes.ts): V1 sem versão nova
      roteiro: roteiro ? { versao: Math.max(Number(roteiro.meta.versao) || 1, roteiro.meta.v2De ? 2 : 1), em: roteiro.criadoEm } : null,
      designersAtivos: pessoas.designersAtivos().map((d) => d.nome),
      atracoes: (await atracoesDoCadastro()).map((a) => a.nome),
    };
  }

  /** O fogo da arte pelo card aberto (#160): como o da janela do After (fogoNoRoteiro), com a origem PROMeiro. */
  function fogoNaTela({ producao, arte, nivel = null }, { email, designer, aTela }) {
    if (!designer) return { status: 403, corpo: { erro: SEM_LIGACAO } };
    if (nivel !== null && ![1, 2, 3].includes(nivel)) return { status: 400, corpo: { erro: 'O nível do fogo é 1, 2 ou 3.' } };
    const j = typeof producao === 'string' ? producoes.naJanela(producao.trim().slice(0, 100)) : null;
    if (!j) return { status: 404, corpo: { erro: 'Essa Produção não está mais na tela.' } };
    if (j.producao.etapa === 'entregue') return { status: 409, corpo: { erro: 'A Produção já está Entregue: o fogo das artes não muda mais.' } };
    if (!j.producao.roteiroId) return { status: 409, corpo: { erro: 'Essa Produção não tem Roteiro ligado: as artes dela não têm fogo.' } };
    const a = typeof arte === 'string' ? j.artes.find((x) => chaveDeArte(x.nome) === chaveDeArte(arte)) : null;
    if (!a) return { status: 404, corpo: { erro: 'Essa arte não está na Produção.' } };
    const n = fogoNoRoteiro(j.producao.roteiroId, chaveDeArte(a.nome), { nivel });
    if (!n) return { status: 409, corpo: { erro: 'Essa Produção não tem Roteiro ligado: as artes dela não têm fogo.' } };
    producoes.doPROMeiro(j.producao.id, [{ tipo: 'fogo', campo: a.nome, antes: String(n.antes), depois: String(n.depois) }], { email, nome: designer.nome });
    return { status: 200, corpo: { feito: { eventos: ['fogo'], trello: [] }, producao: aTela(j.producao.id) } };
  }

  async function producaoDaJanela(id, padeiro) {
    const j = producoes.naJanela(id);
    if (!j) return null;
    const { producao: p, artes } = j;
    const programas = (await vocabulario.ler().catch(() => null))?.programas ?? [];
    const card = comAsVersoes(producoes.umaNaTela(p.id, (claquete) => atracaoPelaClaquete(claquete, programas, pracas)));
    const nome = padeiro.designer ? designerDoPadeiro(padeiro).nome : '';
    // o filme (como o `fil` da lista): o do cadastro ou só o título
    const ehFilme = !!(p.filmeId || p.filmeTitulo);
    const fogo = fogoDasArtes(j);
    return {
      id: p.id,
      praca: p.praca,
      etapa: p.etapa,
      claquete: p.claquete,
      versao: codigoDasVersoes(card?.versoesDaChamada?.lista ?? []),
      ...prontoParaAbrir(
        { atracao: card?.atracao ?? '', filme: p.filmeId, ehFilme },
        { cadastro: ehFilme ? [] : await atracoesDoCadastro(), projetos: p.filmeId ? await projetosDosFilmes([p.filmeId]) : {} },
      ),
      designers: p.designers,
      comVoce: !!nome && p.designers.some((d) => nomeComparavel(d) === nomeComparavel(nome)),
      artes: artes.map((a) => ({ nome: a.nome, fogo: fogo(a), feita: a.feita, marcada: a.marcada })),
      contagem: { feitas: artes.filter((a) => a.feita).length, total: artes.length },
    };
  }

  /** O identificador da ação do Padeiro (o aviso, a arte marcada): '' quando não serve. */
  const identificador = (v) => (typeof v === 'string' && /^[\w.:-]{1,100}$/.test(v.trim()) ? v.trim() : '');
  /** A hora da ação do Padeiro (ISO): o relógio adiantado do computador não passa à frente do que acontecer depois;
      null quando não é uma hora. */
  const horaDoPadeiro = (v) => {
    const t = Date.parse(typeof v === 'string' ? v.trim() : '');
    return Number.isNaN(t) ? null : new Date(Math.min(t, Date.now())).toISOString();
  };

  /** O identificador e a hora de uma ação da janela do After (#147), do corpo; sem eles, responde o 400 e devolve null. */
  function pedidoDaJanela(res, corpo) {
    const acao = identificador(corpo.acao);
    const quando = horaDoPadeiro(corpo.feitaEm);
    if (!acao) json(res, 400, { erro: 'Falta o identificador da ação (até 100 letras, números, ponto, dois-pontos, hífen ou sublinhado).' });
    else if (!quando) json(res, 400, { erro: 'Falta a hora da ação (ISO).' });
    else return { acao, quando };
    return null;
  }

  /**
   * O caminho do Padeiro (#137), embaixo de /api/padeiro/: fora do login (o Padeiro roda dentro do After Effects, sem o
   * Cloudflare Access, que tem um Bypass só para este caminho). Só vale a chave do Padeiro no cabeçalho; o cabeçalho do
   * Access, aqui, pode ter vindo de qualquer um e nunca é lido. O que não é uma rota daqui responde 404.
   * - POST /api/padeiro/cadastro { usuario, computador, sistema, sigla } (a única sem chave): 201 { chave, estado }
   * - GET /api/padeiro/eu: { estado, usuario, computador, sigla, designer } da chave; sem ela, ou com a errada, 401
   * - GET /api/padeiro/producoes (#138): { trello: [...] }, as Produções em Entrada e Produzindo no formato `trello` do
   *   Padeiro (producoes.paraOPadeiro), cada uma com o "pronto para abrir" (#146: `pronto`, `estado`), os `designers` e
   *   o `comVoce` (#153: a pessoa da chave está nela), como na rota da Produção. Só a chave
   *   ligada lê; a pendente e a revogada, 403 { erro, estado } (a janela do After mostra só o aviso da pendente)
   * - GET /api/padeiro/producoes/<id> (#146): { producao }, a Produção como a janela do After mostra
   *   (producaoDaJanela). Lê como a lista; a que não existe (ou arquivada), 404
   * - POST /api/padeiro/arte (#146) { acao, feitaEm, producao, arte, feita }: marca (feita: true) ou desmarca a arte da
   *   Produção, só com a chave ligada e só para o designer que está na Produção (senão, 403). `acao` é o identificador
   *   (a repetida responde { repetido: true } e não grava de novo, antes do 403); `feitaEm`, a hora (a atrasada segue
   *   a regra do conflito: vale o mais recente). Responde { feito: { eventos }, producao }
   * - POST /api/padeiro/aviso (#139) { aviso, abertoEm, producao | card | filme }: o aviso do Padeiro, o Peguei feito
   *   ao abrir ou criar o projeto (etapaDaProducao.peloPadeiro). `aviso` é o identificador (o repetido responde
   *   { repetido: true } e não grava de novo); `abertoEm`, a hora da abertura (ISO; a do futuro vale como agora). Só
   *   com a chave ligada, como a lista
   * - As ações da janela do After (#147), só com a chave ligada, no formato da arte: `acao` é o identificador (a repetida
   *   responde { repetido: true, producao } e não grava de novo, antes das recusas de estado, #155; a recusada não o
   *   ocupa) e `feitaEm`, a hora (a atrasada segue a regra do conflito: fica no histórico, e nada vai ao Trello por
   *   ela). Respondem { feito: { eventos, trello }, producao } (a Produção como a janela mostra); o 409 traz a
   *   `producao` também.
   *   - POST /api/padeiro/fogo { acao, feitaEm, producao, arte, nivel? }: o fogo da arte no Roteiro ligado, para
   *     qualquer designer (fogoNoRoteiro): com `nivel` (1, 2 ou 3), fica nesse nível (à prova de repetição); sem ele,
   *     sobe um nível (1, 2, 3 e volta). O `nivel` que não é 1, 2 ou 3, 400; a Entregue e a sem Roteiro, 409; a arte que
   *     não está na Produção, 404. Gravada a meta, o identificador fica ocupado mesmo se o evento falhar (a nova
   *     tentativa responde { repetido: true } e não muda o nível de novo)
   *   - POST /api/padeiro/entregar { acao, feitaEm, producao }: etapaDaProducao.entregarPeloPadeiro (a Entregue, 409)
   *   - POST /api/padeiro/voltar { acao, feitaEm, producao }: etapaDaProducao.voltarPeloPadeiro (a em Produzindo sem o
   *     designer, 403; a que já está na Entrada, 409)
   *   - POST /api/padeiro/desfazer { acao, feitaEm, producao, desfaz? }: etapaDaProducao.desfazerPeloPadeiro (`desfaz`, o
   *     identificador da ação a desfazer, opcional; sem o que desfazer, 409)
   * - GET /api/padeiro/filmes (#142): { atualizado_em, filmes }, os filmes recentes no formato do fluxo filmes-recentes
   *   do n8n (servidor/filmes-recentes.mjs), com o pôster no endereço público do PROMeiro (posterDoPadeiro). A chave
   *   pendente também lê (o n8n dava a mesma lista sem chave); a revogada, 403; sem a chave, ou com a errada, 401. Com o
   *   Postgres do Teable fora, 503 (o Padeiro volta ao n8n)
   * - POST /api/padeiro/projeto (#144) { momento, atracao, card, designer, versao }: o projeto criado, aberto ou alterado
   *   no Padeiro, o mesmo envio que ia ao fluxo "PROMO - PROJETO" do n8n (docs/webhook-projeto.md do Padeiro), e a
   *   mesma resposta: sempre 200 { itens: [{ codigo, texto }] } (servidor/projeto-do-padeiro.mjs). Só com a chave
   *   ligada; o designer no card é o da chave
   */
  async function rotaDoPadeiro(req, res, caminho) {
    if (caminho === '/api/padeiro/cadastro' && req.method === 'POST') {
      const feito = padeiros.cadastrar(await lerCorpo(req, 16_384, 'Cadastro'));
      console.log(`[padeiro] cadastro pendente: ${feito.usuario} em ${feito.computador}`);
      return json(res, 201, { chave: feito.chave, estado: feito.estado });
    }
    if (caminho === '/api/padeiro/eu' && req.method === 'GET') {
      const p = padeiros.daChave(req.headers[CABECALHO_DA_CHAVE]);
      if (!p) return json(res, 401, { erro: 'Chave do Padeiro desconhecida: faça o cadastro de novo.' });
      return json(res, 200, { estado: p.estado, usuario: p.usuario, computador: p.computador, sigla: p.sigla, designer: p.designer ? { nome: p.designer.nome } : null });
    }
    if (caminho === '/api/padeiro/filmes' && req.method === 'GET') {
      const p = padeiros.daChave(req.headers[CABECALHO_DA_CHAVE]);
      if (!p) return json(res, 401, { erro: 'Chave do Padeiro desconhecida: faça o cadastro de novo.' });
      if (p.estado === 'revogada') return json(res, 403, { erro: 'A chave do Padeiro foi revogada: faça o cadastro de novo.', estado: p.estado });
      const hoje = diaEmBrasilia(new Date());
      let linhas;
      try {
        linhas = await trello.linhasDosFilmesRecentes?.(somarDias(hoje, -DIAS_ANTES), somarDias(hoje, DIAS_DEPOIS));
      } catch (e) {
        console.warn(`[padeiro] não li os filmes recentes: ${e instanceof Error ? e.message : e}`);
        return json(res, 503, { erro: 'O PROMeiro não conseguiu ler os filmes agora.' });
      }
      if (!linhas) return json(res, 503, { erro: 'O PROMeiro está sem as tabelas exibicoes e filmes do Teable.' });
      const filmes = filmesRecentes({ ...linhas, hoje, poster: posterDoPadeiro });
      return json(res, 200, { atualizado_em: horaDeBrasilia(), filmes });
    }
    if (caminho === '/api/padeiro/producoes' && req.method === 'GET') {
      const p = padeiroLigado(req, res);
      if (!p) return;
      const programas = (await vocabulario.ler().catch(() => null))?.programas ?? [];
      const lista = producoes.paraOPadeiro((claquete) => atracaoPelaClaquete(claquete, programas, pracas));
      const [cadastro, projetos] = await Promise.all([atracoesDoCadastro(), projetosDosFilmes(lista.filter((c) => c.fil).map((c) => c.filme))]);
      // #153: se a pessoa da chave está na Produção, como na rota da Produção (a aba "Minhas" sem ler uma a uma)
      const nome = nomeComparavel(designerDoPadeiro(p).nome);
      const comVoce = (c) => !!nome && c.designers.some((d) => nomeComparavel(d) === nome);
      return json(res, 200, { trello: lista.map((c) => ({ ...c, comVoce: comVoce(c), ...prontoParaAbrir({ atracao: c.atr, filme: c.filme, ehFilme: c.fil }, { cadastro, projetos }) })) });
    }
    const daJanela = /^\/api\/padeiro\/producoes\/([^/]{1,100})$/.exec(caminho);
    if (daJanela && req.method === 'GET') {
      const p = padeiroLigado(req, res);
      if (!p) return;
      const producao = await producaoDaJanela(decodeURIComponent(daJanela[1]), p);
      return producao ? json(res, 200, { producao }) : json(res, 404, { erro: 'Essa Produção não está mais aberta no PROMeiro.' });
    }
    if (caminho === '/api/padeiro/arte' && req.method === 'POST') {
      const p = padeiroLigado(req, res);
      if (!p) return;
      const corpo = (await lerCorpo(req, 4096, 'Arte')) ?? {};
      const acao = identificador(corpo.acao);
      if (!acao) return json(res, 400, { erro: 'Falta o identificador da ação (até 100 letras, números, ponto, dois-pontos, hífen ou sublinhado).' });
      const quando = horaDoPadeiro(corpo.feitaEm);
      if (!quando) return json(res, 400, { erro: 'Falta a hora em que a arte foi marcada (ISO).' });
      if (typeof corpo.feita !== 'boolean') return json(res, 400, { erro: 'Falta dizer se a arte está feita (true ou false).' });
      if (typeof corpo.arte !== 'string' || !corpo.arte.trim()) return json(res, 400, { erro: 'Falta a arte.' });
      const producao = typeof corpo.producao === 'string' ? producoes.uma(corpo.producao.trim().slice(0, 100)) : null;
      if (!producao || producao.arquivada) return json(res, 404, { erro: 'Essa Produção não está mais aberta no PROMeiro.' });
      // #155: a repetida responde antes das recusas de estado (a arte marcada por quem saiu da Produção logo depois)
      if (!padeiros.reservarAviso(p.id, acao, producao.id, quando)) return json(res, 200, { repetido: true, producao: await producaoDaJanela(producao.id, p) });
      const designer = designerDoPadeiro(p);
      if (!producao.designers.some((d) => nomeComparavel(d) === nomeComparavel(designer.nome))) {
        padeiros.soltarAviso(p.id, acao);
        return json(res, 403, { erro: 'Só quem está na Produção marca as artes dela.' });
      }
      let eventos;
      try {
        eventos = producoes.arteDoPadeiro(producao.id, corpo.arte, corpo.feita, { id: `padeiro:${p.id}`, nome: designer.nome }, quando, acao);
      } catch (e) {
        padeiros.soltarAviso(p.id, acao);
        throw e;
      }
      if (!eventos) {
        padeiros.soltarAviso(p.id, acao);
        return json(res, 404, { erro: 'Essa arte não está na Produção.' });
      }
      padeiros.avisou(p.id);
      console.log(`[padeiro] ${p.usuario} em ${p.computador} ${corpo.feita ? 'marcou' : 'desmarcou'} uma arte de ${producao.claquete} (${eventos.join(', ') || 'nada novo'})`);
      return json(res, 200, { feito: { eventos }, producao: await producaoDaJanela(producao.id, p) });
    }
    if (caminho === '/api/padeiro/fogo' && req.method === 'POST') {
      const p = padeiroLigado(req, res);
      if (!p) return;
      const corpo = (await lerCorpo(req, 4096, 'Fogo')) ?? {};
      const pedido = pedidoDaJanela(res, corpo);
      if (!pedido) return;
      if (typeof corpo.arte !== 'string' || !corpo.arte.trim()) return json(res, 400, { erro: 'Falta a arte.' });
      const nivelPedido = corpo.nivel ?? null;
      if (nivelPedido !== null && ![1, 2, 3].includes(nivelPedido)) return json(res, 400, { erro: 'O nível do fogo é 1, 2 ou 3.' });
      const j = typeof corpo.producao === 'string' ? producoes.naJanela(corpo.producao.trim().slice(0, 100)) : null;
      if (!j) return json(res, 404, { erro: 'Essa Produção não está mais aberta no PROMeiro.' });
      const id = j.producao.id;
      // #155: a repetida responde antes das recusas de estado (o fogo gravado numa Produção entregue logo depois)
      if (!padeiros.reservarAviso(p.id, pedido.acao, id, pedido.quando)) return json(res, 200, { repetido: true, producao: await producaoDaJanela(id, p) });
      // a recusada não ocupa o identificador
      const recusar = async (status, erro, comAProducao = true) => {
        padeiros.soltarAviso(p.id, pedido.acao);
        return json(res, status, comAProducao ? { erro, producao: await producaoDaJanela(id, p) } : { erro });
      };
      if (j.producao.etapa === 'entregue') return recusar(409, 'A Produção já está Entregue: o fogo das artes não muda mais.');
      if (!j.producao.roteiroId) return recusar(409, 'Essa Produção não tem Roteiro ligado: as artes dela não têm fogo.');
      const arte = j.artes.find((a) => chaveDeArte(a.nome) === chaveDeArte(corpo.arte));
      if (!arte) return recusar(404, 'Essa arte não está na Produção.', false);
      const designer = designerDoPadeiro(p);
      // gravada a meta, o identificador fica ocupado: a nova tentativa da fila sem rede não muda o nível de novo
      let gravouAMeta = false;
      try {
        const gravar = !producoes.atrasado(id, { tipo: 'fogo', campo: arte.nome, quando: pedido.quando });
        const nivel = fogoNoRoteiro(j.producao.roteiroId, chaveDeArte(arte.nome), { nivel: nivelPedido, gravar });
        if (!nivel) return recusar(409, 'Essa Produção não tem Roteiro ligado: as artes dela não têm fogo.');
        gravouAMeta = gravar;
        producoes.doPadeiro(id, [{ tipo: 'fogo', campo: arte.nome, antes: String(nivel.antes), depois: String(nivel.depois) }], { id: `padeiro:${p.id}`, nome: designer.nome }, pedido.quando, { acao: pedido.acao });
      } catch (e) {
        if (gravouAMeta) console.warn(`[padeiro] o fogo de ${j.producao.claquete} foi gravado no Roteiro, mas o evento não: ${e instanceof Error ? e.message : e}`);
        else padeiros.soltarAviso(p.id, pedido.acao);
        throw e;
      }
      padeiros.avisou(p.id);
      console.log(`[padeiro] ${p.usuario} em ${p.computador} mudou o fogo de uma arte de ${j.producao.claquete}`);
      return json(res, 200, { feito: { eventos: ['fogo'], trello: [] }, producao: await producaoDaJanela(id, p) });
    }
    const daAcao = /^\/api\/padeiro\/(entregar|voltar|desfazer)$/.exec(caminho);
    if (daAcao && req.method === 'POST') {
      const p = padeiroLigado(req, res);
      if (!p) return;
      const corpo = (await lerCorpo(req, 4096, 'Ação')) ?? {};
      const pedido = pedidoDaJanela(res, corpo);
      if (!pedido) return;
      const producao = typeof corpo.producao === 'string' ? producoes.uma(corpo.producao.trim().slice(0, 100)) : null;
      if (!producao || producao.arquivada) return json(res, 404, { erro: 'Essa Produção não está mais aberta no PROMeiro.' });
      if (!padeiros.reservarAviso(p.id, pedido.acao, producao.id, pedido.quando)) return json(res, 200, { repetido: true, producao: await producaoDaJanela(producao.id, p) });
      const designer = designerDoPadeiro(p);
      const ctx = { trello, pracas, designer, quem: { id: `padeiro:${p.id}`, nome: designer.nome }, quando: pedido.quando, acao: pedido.acao };
      let r;
      try {
        if (daAcao[1] === 'entregar') r = await etapaDaProducao.entregarPeloPadeiro(producao, ctx);
        else if (daAcao[1] === 'voltar') r = await etapaDaProducao.voltarPeloPadeiro(producao, ctx);
        else r = await etapaDaProducao.desfazerPeloPadeiro(producao, { ...ctx, desfaz: identificador(corpo.desfaz) });
      } catch (e) {
        padeiros.soltarAviso(p.id, pedido.acao);
        throw e;
      }
      if (r.status !== 200) {
        padeiros.soltarAviso(p.id, pedido.acao);
        return json(res, r.status, r.status === 409 ? { ...r.corpo, producao: await producaoDaJanela(producao.id, p) } : r.corpo);
      }
      padeiros.avisou(p.id);
      console.log(`[padeiro] ${p.usuario} em ${p.computador}: ${daAcao[1]} ${producao.claquete} (${r.corpo.feito.eventos.join(', ') || 'nada novo'})`);
      return json(res, 200, { feito: r.corpo.feito, producao: await producaoDaJanela(producao.id, p) });
    }
    if (caminho === '/api/padeiro/aviso' && req.method === 'POST') {
      const p = padeiroLigado(req, res);
      if (!p) return;
      const corpo = (await lerCorpo(req, 4096, 'Aviso')) ?? {};
      const texto = (v) => (typeof v === 'string' ? v.trim() : '');
      const aviso = identificador(corpo.aviso);
      if (!aviso) return json(res, 400, { erro: 'Falta o identificador do aviso (até 100 letras, números, ponto, dois-pontos, hífen ou sublinhado).' });
      const quando = horaDoPadeiro(corpo.abertoEm);
      if (!quando) return json(res, 400, { erro: 'Falta a hora da abertura do projeto (ISO).' });
      const qual = { producao: texto(corpo.producao).slice(0, 100), card: texto(corpo.card).slice(0, 100), filme: texto(corpo.filme).slice(0, 100) };
      if (!qual.producao && !qual.card && !qual.filme) return json(res, 400, { erro: 'Falta a Produção (ou o card, ou o filme).' });
      const producao = producoes.doAviso(qual);
      if (!producao) return json(res, 404, { erro: 'Essa Produção não existe no PROMeiro.' });
      if (!padeiros.reservarAviso(p.id, aviso, producao.id, quando)) return json(res, 200, { repetido: true, producao: producao.id });
      const designer = designerDoPadeiro(p);
      let r;
      try {
        r = await etapaDaProducao.peloPadeiro({ producao, quando, acao: aviso }, { trello, designer, quem: { id: `padeiro:${p.id}`, nome: designer.nome } });
      } catch (e) {
        padeiros.soltarAviso(p.id, aviso);
        throw e;
      }
      if (r.status === 200) {
        padeiros.avisou(p.id);
        console.log(`[padeiro] aviso de ${p.usuario} em ${p.computador}: ${producao.claquete} (${r.corpo.eventos.join(', ') || 'nada novo'})`);
      } else padeiros.soltarAviso(p.id, aviso);
      return json(res, r.status, r.corpo);
    }
    if (caminho === '/api/padeiro/buscar' && req.method === 'GET') {
      const p = padeiroLigado(req, res);
      if (!p) return;
      return jsonComprimido(req, res, 200, await indiceDoBuscar());
    }
    if (caminho === '/api/padeiro/projeto' && req.method === 'POST') {
      const p = padeiroLigado(req, res);
      if (!p) return;
      const corpo = await lerCorpo(req, 32_768, 'Projeto');
      const d = designerDoPadeiro(p);
      const naTabela = (pessoas.guardada()?.designers ?? []).find((x) => x.registro === p.designer.registro);
      const { itens, envio } = await projetoDoPadeiro.receber(corpo, { env, cadastros, trello, designer: { ...d, registro: p.designer.registro, inativo: naTabela?.ativo === false } });
      padeiros.avisou(p.id);
      console.log(`[padeiro] projeto de ${p.usuario} em ${p.computador}${envio?.momento ? ` (${envio.momento})` : ''}: ${itens.map((i) => i.codigo).join(', ')}`);
      return json(res, 200, { itens });
    }
    return json(res, 404, { erro: 'Não encontrado.' });
  }

  /**
   * O índice do buscar do Padeiro (#143, servidor/indice-do-buscar.mjs), no formato do fluxo PROMO - BUSCAR do n8n: as
   * atrações do cadastro, as Produções dos últimos 15 dias e, do Postgres do Teable, os filmes e as pastas citadas no
   * Teams. Sem o cadastro das atrações, ou com o Teable fora do ar, 503: o Padeiro fica com o webhook do n8n ou com a
   * cópia que já tem.
   */
  async function indiceDoBuscar() {
    const indisponivel = (motivo) => Object.assign(new Error(`O índice do buscar não está disponível agora: ${motivo}`), { status: 503 });
    const lido = await cadastros.ler().catch((e) => {
      throw indisponivel(e instanceof Error ? e.message : String(e));
    });
    if (!lido?.ligado) throw indisponivel('falta o cadastro das atrações (o Teable).');
    const doTeable = await geracao.indiceDoBuscar.doTeable().catch((e) => {
      console.warn(`[padeiro] não li o Postgres do Teable para o índice do buscar: ${e instanceof Error ? e.message : e}`);
      throw indisponivel('o Teable não respondeu.');
    });
    const programas = (await vocabulario.ler().catch(() => null))?.programas ?? [];
    const desde = new Date(Date.now() - DIAS_DO_TRELLO * 86_400_000).toISOString();
    const lista = producoes.noIndice(desde, (claquete) => atracaoPelaClaquete(claquete, programas, pracas));
    return montarIndice({ teams: doTeable.teams, trello: doTrello(lista, lido.atracoes), atracoes: dasAtracoes(lido.atracoes), filmes: doTeable.filmes });
  }

  const app = async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const caminho = url.pathname;
    // o pedido conta na configuração em que começou: ela só é fechada depois que ele termina
    const g = geracao;
    g.emCurso += 1;
    try {
      // o aviso do Trello (#87) é a única rota fora do login (o Cloudflare Access): confere a assinatura dele
      if (caminho === ROTA_DO_AVISO) await rotaDoAviso(req, res);
      // o que está embaixo dela também pode ter passado pelo Bypass do Access (o caminho cobre os de baixo): não é nada,
      // e nunca chega às rotas com login (o cabeçalho do Access, ali, pode ter vindo de qualquer um)
      else if (caminho.startsWith(`${ROTA_DO_AVISO}/`)) json(res, 404, { erro: 'Não encontrado.' });
      // o pôster público (#90): outra exceção ao Access, só com o token do Padeiro; nada daqui (nem o caminho torto,
      // #145) chega às rotas com login
      else if (debaixoDoCaminho(ROTA_PUBLICA.replace(/\/$/, ''), req.url, caminho)) await rotaPublica(req, res, url);
      // o caminho do Padeiro (#137): também fora do login, só com a chave do Padeiro
      else if (debaixoDoCaminho('/api/padeiro', req.url, caminho)) await rotaDoPadeiro(req, res, caminho);
      else if (caminho.startsWith('/api/')) await api(req, res, caminho);
      else arquivo(req, res, caminho);
    } catch (e) {
      if (!res.headersSent) json(res, e.status ?? 500, { erro: e.status ? e.message : 'Algo deu errado no servidor.' });
      if (!e.status) console.error(e);
    } finally {
      g.emCurso -= 1;
      if (!g.emCurso) g.drenou?.();
    }
  };
  /** Ligue em `server.on('upgrade', app.upgrade)` para a edição simultânea e a fila ao vivo. */
  app.upgrade = upgrade;
  app.cache = cache;
  app.mudarConfiguracao = mudarConfiguracao;
  /** Os módulos de agora (para os avisos da partida). */
  app.modulos = () => ({ ...geracao, filmes });
  /** A descoberta das tabelas do Teable feita na partida (os testes esperam por ela). */
  app.tabelasProntas = primeiraDescoberta;
  /** Descobre as tabelas de novo (ou espera a descoberta que já está indo). */
  app.descobrirAsTabelas = redescobrir;
  /** A verificação dos membros do quadro feita na partida (os testes esperam por ela); e verificar de novo. */
  app.pessoasProntas = primeiraVerificacao;
  app.verificarPessoas = verificarPessoas;
  /** A primeira conferência do webhook do quadro (#87), e conferir de novo; a fila dos avisos aceitos (os testes esperam). */
  app.avisoPronto = avisoPronto;
  app.garantirOAviso = garantirOAviso;
  app.avisosEmDia = () => filaDosAvisos;
  /** A primeira recuperação do que faltou (#88), e recuperar de novo. */
  app.recuperacaoPronta = recuperacaoPronta;
  app.recuperarOQueFaltou = recuperarOQueFaltou;
  /** A primeira releitura da produção da arte (depois da carga inicial), e reler de novo. */
  app.releituraPronta = releituraPronta;
  app.relerAProducao = relerAProducao;
  /** O cartão da pauta no Teams (#135): conferir os horários agora, e esperar os envios em curso. */
  app.conferirOCartao = () => cartaoDoTeams.conferir();
  app.cartaoEmDia = () => cartaoDoTeams.emDia();
  app.fechar = async () => {
    clearInterval(releitura);
    clearInterval(batimento);
    clearInterval(verificacaoDiaria);
    clearInterval(conferenciaDoAviso);
    clearInterval(conferenciaDoCartao);
    clearTimeout(esperaDoWebhook);
    clearTimeout(tentarDeNovo);
    for (const n of RECRIADOS) await geracao[n]?.parar?.();
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
