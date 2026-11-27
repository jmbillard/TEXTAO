/*
 * As Produções (#86, ADR 0006) no SQLite do PROMeiro: o trabalho da arte de uma claquete numa praça, com id próprio.
 * O card do Trello (card_id) e o registro da produção da arte no Teable (teable_registro) são só referências, as duas
 * opcionais; o Roteiro e o filme ligados também.
 *
 * O SQL é o comum ao SQLite e ao Postgres (para a troca futura): texto, inteiro, CHECK, UNIQUE, REFERENCES e
 * INSERT … ON CONFLICT … DO UPDATE; o id é um UUID gerado aqui, as datas são texto ISO, as listas são texto JSON lido
 * aqui (sem json_extract) e o booleano é 0/1.
 *
 * A carga inicial lê a produção da arte INTEIRA (todas as linhas: abertas e arquivadas, com e sem card, filmes
 * incluídos; nada do Trello) e grava uma Produção por linha, pela chave natural (o registro do Teable): rodar de novo
 * atualiza, não duplica, e a Produção guarda o seu id. Roda na subida, quando não há nenhuma Produção, e quando um
 * administrador pede "recarregar". As Produções carregadas entram com o estado de agora, sem eventos passados.
 *
 * A releitura (ADR 0006: por enquanto o PROMeiro só ESCREVE no Trello; lê do Teable) mantém em dia: de minuto em
 * minuto, o servidor relê as linhas da produção da arte que o Teable mudou desde a última vez (__last_modified_time) e
 * passa cada uma por `reler`: a linha nova vira Produção ("criada"), e o que mudou na que já existe vira evento
 * (src/modelo/eventosDoTeable.ts) e muda a Produção. A chave do evento (registro + tipo + campo + valor + quando) não
 * repete. O aviso do Trello (#87, #88) fica desligado por padrão (TRELLO_AVISO).
 *
 * Os eventos (#87) são a memória da Produção: o que o aviso do Trello disse que aconteceu (criada, mudou de etapa,
 * arquivada, desarquivada), com quem e quando (a data da ação no Trello) e o id da ação do Trello, único: o mesmo
 * aviso duas vezes não vira dois eventos. O aviso muda a etapa da Produção, a não ser que chegue atrasado (mais velho
 * que o último evento dela): esse entra no histórico e não volta a etapa. O tipo, o antes e o depois são texto livre
 * (sem CHECK).
 *
 * #88: o designer que entra ou sai (designers), a arte marcada ou desmarcada no checklist (artes_marcadas), a praça
 * mudada no campo do card e a entrega concluída (a etapa Entregue) também mudam a Produção; a prioridade, a
 * complexidade e o prazo de entrega do card ficam só no histórico (a Produção não os guarda). O "atrasado" é contado
 * dentro da mesma família: a etapa com a etapa, o mesmo designer com ele, a mesma arte com ela, o mesmo campo com ele.
 */
import { randomUUID } from 'node:crypto';
import { ETAPAS, producaoDaLinha } from '../src/modelo/producao.ts';
import { normalizarPraca, pracasRegistradas, reconhecerPraca } from '../src/modelo/pracas.ts';
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { eventosDaReleitura } from '../src/modelo/eventosDoTeable.ts';
import { artesAgrupadas, artesDaProducao } from './trello.mjs';
import { chaveDeArte } from '../src/modelo/diferencas.ts';
import { dataDaClaquete } from '../src/modelo/vocabularios.ts';
import { letraEVersaoDoRoteiro, marcaDaLetraEVersao } from '../src/modelo/letraEVersao.ts';
import { fogoNoNivel } from './artes.mjs';

export function criarTabelaDasProducoes(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS producoes (
    id TEXT PRIMARY KEY,
    claquete TEXT NOT NULL,
    praca TEXT NOT NULL DEFAULT '',
    etapa TEXT NOT NULL CHECK (etapa IN (${ETAPAS.map((e) => `'${e}'`).join(', ')})),
    marcador TEXT NOT NULL DEFAULT '',
    designers TEXT NOT NULL DEFAULT '[]',
    artes TEXT NOT NULL DEFAULT '[]',
    artes_marcadas TEXT NOT NULL DEFAULT '[]',
    artes_quantidade INTEGER,
    entrada_em TEXT,
    entrega_em TEXT,
    exibicao_em TEXT,
    card_id TEXT,
    teable_registro TEXT UNIQUE,
    roteiro_id TEXT REFERENCES roteiros (id) ON DELETE SET NULL,
    filme_id TEXT,
    filme_titulo TEXT,
    arquivada INTEGER NOT NULL DEFAULT 0,
    prioridade TEXT,
    complexidade TEXT,
    criada_em TEXT NOT NULL,
    atualizada_em TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS producoes_card ON producoes (card_id)');
  db.exec('CREATE INDEX IF NOT EXISTS producoes_etapa ON producoes (etapa)');
  // o ciclo do roteiro (#102) procura a Produção pelo Roteiro
  db.exec('CREATE INDEX IF NOT EXISTS producoes_roteiro ON producoes (roteiro_id)');
  db.exec(`CREATE TABLE IF NOT EXISTS eventos (
    id TEXT PRIMARY KEY,
    producao_id TEXT NOT NULL REFERENCES producoes (id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    campo TEXT,
    antes TEXT,
    depois TEXT,
    quem_id TEXT,
    quem_nome TEXT,
    quando TEXT NOT NULL,
    trello_acao TEXT UNIQUE,
    chave TEXT,
    anotado_em TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS eventos_producao ON eventos (producao_id, quando)');
  // as colunas que chegaram com o #88, no banco que já tinha as tabelas (a consulta vazia diz se a coluna existe, sem
  // nada que só o SQLite tenha)
  const tem = (tabela, coluna) => {
    try {
      db.prepare(`SELECT ${coluna} FROM ${tabela} LIMIT 0`).all();
      return true;
    } catch {
      return false;
    }
  };
  if (!tem('producoes', 'artes_marcadas')) db.exec(`ALTER TABLE producoes ADD COLUMN artes_marcadas TEXT NOT NULL DEFAULT '[]'`);
  if (!tem('eventos', 'campo')) db.exec('ALTER TABLE eventos ADD COLUMN campo TEXT');
  // a releitura do Teable: a prioridade e a complexidade guardadas (null: ainda não lidas) e a chave do evento
  if (!tem('producoes', 'prioridade')) db.exec('ALTER TABLE producoes ADD COLUMN prioridade TEXT');
  if (!tem('producoes', 'complexidade')) db.exec('ALTER TABLE producoes ADD COLUMN complexidade TEXT');
  if (!tem('eventos', 'chave')) db.exec('ALTER TABLE eventos ADD COLUMN chave TEXT');
  // a origem do evento (#110): 'PROMeiro' no que foi feito na tela de produções; vazia nos do Teable e do Trello
  if (!tem('eventos', 'origem')) db.exec('ALTER TABLE eventos ADD COLUMN origem TEXT');
  // o desfazer da tela de produções (#112): o id do evento da etapa que o evento desfez; vazio nos outros
  if (!tem('eventos', 'desfaz')) db.exec('ALTER TABLE eventos ADD COLUMN desfaz TEXT');
  // as ações da janela do After (#147): o identificador da ação do Padeiro que gravou o evento (o mesmo nos eventos de
  // uma ação, com o quem_id da chave), para o desfazer achar a última; vazio nos outros
  if (!tem('eventos', 'acao_do_padeiro')) db.exec('ALTER TABLE eventos ADD COLUMN acao_do_padeiro TEXT');
  // o card aberto da tela de produções (#160): o que o PROMeiro muda e que vale sobre a produção da arte (a releitura do
  // Teable não apaga): a atração escolhida (null: a de sempre, do Roteiro, do filme ou da claquete; '': desligada), o
  // prazo (AAAA-MM-DD; null: a exibição) e as artes apagadas e incluídas (os itens do checklist, em JSON)
  if (!tem('producoes', 'atracao')) db.exec('ALTER TABLE producoes ADD COLUMN atracao TEXT');
  if (!tem('producoes', 'prazo_em')) db.exec('ALTER TABLE producoes ADD COLUMN prazo_em TEXT');
  if (!tem('producoes', 'artes_apagadas')) db.exec(`ALTER TABLE producoes ADD COLUMN artes_apagadas TEXT NOT NULL DEFAULT '[]'`);
  if (!tem('producoes', 'artes_novas')) db.exec(`ALTER TABLE producoes ADD COLUMN artes_novas TEXT NOT NULL DEFAULT '[]'`);
  // o fogo das artes da Produção sem Roteiro (#174): as marcas de complexidade { chave da arte: 2 | 3 } em JSON, como as
  // da meta do Roteiro (a BAIXA não é guardada); quando um Roteiro é ligado, passam para ele (e a coluna se esvazia)
  if (!tem('producoes', 'fogo_das_artes')) db.exec(`ALTER TABLE producoes ADD COLUMN fogo_das_artes TEXT NOT NULL DEFAULT '{}'`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS eventos_chave ON eventos (chave)');
}

/** O fogo guardado na Produção (#174): as marcas { chave da arte: 2 | 3 }; {} sem nenhuma ou ilegível. */
function fogosDaLinha(l) {
  try {
    const f = JSON.parse(l?.fogo_das_artes ?? '{}');
    return f && typeof f === 'object' && !Array.isArray(f) ? Object.fromEntries(Object.entries(f).filter(([, n]) => n === 2 || n === 3)) : {};
  } catch {
    return {};
  }
}

/** As famílias de evento: o atrasado só não muda a Produção diante de um mais novo da mesma família. */
const DA_ETAPA = ['criada', 'etapa', 'arquivada', 'desarquivada'];
const DO_DESIGNER = ['designer-entrou', 'designer-saiu'];
const DA_ARTE = ['arte-marcada', 'arte-desmarcada'];
/** O fogo da arte mudado pela janela do After (#147): `campo` é a arte; antes e depois, o nível (1, 2 ou 3). A família
    é a mesma arte. */
const DO_FOGO = 'fogo';
/** O que o desfazer da janela do After (#147) olha: a etapa e os designers. */
const DO_DESFAZER = [...DA_ETAPA, ...DO_DESIGNER];

/** As artes apagadas e incluídas no card aberto (#160): `campo` é o item do checklist. */
const DAS_ARTES_DO_CARD = ['arte-apagada', 'arte-incluida'];

/** Uma lista guardada em JSON ([] quando não é). */
const lista = (json) => {
  try {
    const l = JSON.parse(json ?? '[]');
    return Array.isArray(l) ? l.map(String) : [];
  } catch {
    return [];
  }
};

/**
 * As artes da Produção (os itens do checklist) como valem agora (#160): as da coluna de artes da produção da arte e as
 * incluídas no card aberto, sem as apagadas nele (comparadas sem caixa, acento e pontuação).
 * @param l a linha do SQLite (artes, artes_novas, artes_apagadas)
 */
export function artesQueValem(l) {
  const apagadas = new Set(lista(l.artes_apagadas).map(chaveDeArte));
  const novas = lista(l.artes_novas).filter((a) => !lista(l.artes).some((x) => chaveDeArte(x) === chaveDeArte(a)));
  return [...lista(l.artes), ...novas].filter((a) => !apagadas.has(chaveDeArte(a)));
}

/** A lista guardada em JSON com o item (sem repetir pelo nome comparável) ou sem ele. */
function comOuSem(json, item, com) {
  let lista = [];
  try {
    lista = JSON.parse(json ?? '[]');
  } catch {
    lista = [];
  }
  const chave = nomeComparavel(item);
  const sem = (Array.isArray(lista) ? lista : []).filter((x) => nomeComparavel(String(x)) !== chave);
  return JSON.stringify(com ? [...sem, item] : sem);
}

const COLUNAS = ['claquete', 'praca', 'etapa', 'marcador', 'designers', 'artes', 'artes_quantidade', 'entrada_em', 'entrega_em', 'exibicao_em', 'card_id', 'roteiro_id', 'filme_id', 'filme_titulo', 'arquivada', 'prioridade', 'complexidade', 'atualizada_em'];
/** As colunas que a releitura do Teable muda (a exibição, o Roteiro e o filme ficam se a linha não trouxer). */
const DA_RELEITURA = ['claquete', 'praca', 'etapa', 'marcador', 'designers', 'artes', 'artes_quantidade', 'entrada_em', 'entrega_em', 'card_id', 'arquivada', 'prioridade', 'complexidade'];
/** A prioridade e a complexidade como a Produção guarda ('' sem nada; a linha sem a coluna, null). */
const texto = (v) => (v === undefined || v === null ? null : String(v).trim());
/** As colunas da Produção (COLUNAS) de uma linha da produção da arte: a da carga e a da releitura. */
const colunasDa = (p, l, em) => ({ claquete: p.claquete, praca: p.praca, etapa: p.etapa, marcador: p.marcador, designers: JSON.stringify(p.designers), artes: JSON.stringify(p.artes), artes_quantidade: p.artesQuantidade, entrada_em: p.entradaEm, entrega_em: p.entregaEm, exibicao_em: p.exibicaoEm, card_id: p.cardId, roteiro_id: p.roteiroId, filme_id: p.filmeId, filme_titulo: p.filmeTitulo, arquivada: p.arquivada ? 1 : 0, prioridade: texto(l.prioridade), complexidade: texto(l.complexidade), atualizada_em: em });

/** A prioridade ALTA da produção da arte (sem caixa nem acento). */
const ehAlta = (prioridade) => String(prioridade ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() === 'ALTA';
/** As artes a produzir sem repetir (a conta da agenda, `artesDaProducao`); sem a lista, a quantidade da coluna. */
const artesAProduzir = (l) => artesDaProducao(artesQueValem(l).join(' | ')) ?? (lista(l.artes_apagadas).length || lista(l.artes_novas).length ? null : l.artes_quantidade) ?? null;

/** O que o card da tela de produções (#109) lê da Produção, com a atração do Roteiro ligado. */
const DA_TELA = `SELECT p.id, p.claquete, p.praca, p.etapa, p.marcador, p.designers, p.artes, p.artes_marcadas, p.artes_novas, p.artes_apagadas, p.artes_quantidade, p.prioridade, p.entrada_em, p.entrega_em, p.exibicao_em, p.prazo_em, p.atracao, p.card_id, p.filme_titulo, r.meta AS roteiro_meta
  FROM producoes p LEFT JOIN roteiros r ON r.id = p.roteiro_id`;

/** O evento como a API mostra. */
const doEvento = (e) => ({ tipo: e.tipo, ...(e.campo ? { campo: e.campo } : {}), antes: e.antes ?? null, depois: e.depois ?? null, quem: e.quem_id ? { id: e.quem_id, nome: e.quem_nome ?? '' } : null, quando: e.quando, acao: e.trello_acao ?? null, ...(e.origem ? { origem: e.origem } : {}), ...(e.desfaz ? { desfez: true } : {}) });

/** As artes do checklist da Produção (#111, #113): os itens da coluna de artes, cada um uma vez e na ordem, e se já
    estão nas artes marcadas, comparados sem caixa, acento e pontuação. */
export function artesDoChecklist({ artes, artesMarcadas }) {
  const marcadas = new Set(artesMarcadas.map(chaveDeArte));
  const vistas = new Set();
  return artes.flatMap((a) => {
    const k = chaveDeArte(a);
    if (!k || vistas.has(k)) return [];
    vistas.add(k);
    return [{ nome: a.trim(), marcada: marcadas.has(k) }];
  });
}

/** As artes da Produção como a janela do After e a contagem da tela de produções mostram (#146): cada arte uma vez (a
    de vários tipos junta os itens dela, a regra de `artesDaProducao`), feita quando ela, ou todos os itens dela, estão
    nas artes marcadas. */
export function artesFeitas({ artes, artesMarcadas }) {
  const marcadas = new Set(artesMarcadas.map(chaveDeArte));
  return artesAgrupadas(artes).map((a) => ({ ...a, feita: marcadas.has(chaveDeArte(a.nome)) || a.itens.every((i) => marcadas.has(chaveDeArte(i))) }));
}

/** Quantas Produções cada página da busca da tela de produções traz (#161). */
export const POR_PAGINA_DA_BUSCA = 30;

/** A origem dos eventos feitos na tela de produções (#110). */
export const ORIGEM_PROMEIRO = 'PROMeiro';
/** A origem dos eventos do aviso do Padeiro (#139). */
export const ORIGEM_PADEIRO = 'Padeiro';

/** A letra e a versão do Roteiro ligado (#166), como o título mostra ("B", "V2", "B V2"): só quando não é o início
    (a A V1, o roteiro de antes sem letra e a Produção sem roteiro não levam nada). */
function comALetraEVersao(l) {
  let meta = null;
  try {
    meta = JSON.parse(l.roteiro_meta ?? 'null');
  } catch {
    // meta ilegível: sem letra nem versão
  }
  const marca = meta ? marcaDaLetraEVersao(letraEVersaoDoRoteiro(meta)) : '';
  return marca ? { letraEVersao: marca } : {};
}

/** A Produção como a API mostra. */
const daLinha = (l) => ({
  id: l.id,
  claquete: l.claquete,
  praca: l.praca,
  etapa: l.etapa,
  marcador: l.marcador,
  designers: JSON.parse(l.designers),
  // as que valem (#160): sem as apagadas no card aberto, com as incluídas nele
  artes: artesQueValem(l),
  artesMarcadas: JSON.parse(l.artes_marcadas ?? '[]'),
  artesQuantidade: l.artes_quantidade ?? null,
  entradaEm: l.entrada_em ?? null,
  entregaEm: l.entrega_em ?? null,
  exibicaoEm: l.exibicao_em ?? null,
  cardId: l.card_id ?? null,
  teableRegistro: l.teable_registro ?? null,
  roteiroId: l.roteiro_id ?? null,
  filmeId: l.filme_id ?? null,
  filmeTitulo: l.filme_titulo ?? null,
  atracao: l.atracao ?? null,
  prazoEm: l.prazo_em ?? null,
  arquivada: !!l.arquivada,
  criadaEm: l.criada_em,
  atualizadaEm: l.atualizada_em,
});

/**
 * @param db o SQLite do PROMeiro
 * @returns vazia (nenhuma Produção guardada?), carregar (a carga inicial, uma por vez), contagem (por etapa, para
 *   conferir) e buscar (pelo card ou pelo registro do Teable)
 */
export function criarProducoes(db) {
  criarTabelaDasProducoes(db);
  const q = {
    total: db.prepare('SELECT COUNT(*) AS n FROM producoes'),
    porEtapa: db.prepare('SELECT etapa, COUNT(*) AS n FROM producoes GROUP BY etapa'),
    contas: db.prepare(
      `SELECT SUM(CASE WHEN card_id IS NOT NULL THEN 1 ELSE 0 END) AS com_card, SUM(CASE WHEN roteiro_id IS NOT NULL THEN 1 ELSE 0 END) AS com_roteiro,
              SUM(CASE WHEN filme_id IS NOT NULL THEN 1 ELSE 0 END) AS com_filme FROM producoes`,
    ),
    existe: db.prepare('SELECT 1 FROM producoes WHERE teable_registro = ?'),
    gravar: db.prepare(
      `INSERT INTO producoes (id, teable_registro, criada_em, ${COLUNAS.join(', ')}) VALUES (?, ?, ?, ${COLUNAS.map(() => '?').join(', ')})
       ON CONFLICT (teable_registro) DO UPDATE SET ${COLUNAS.map((c) => (c === 'roteiro_id' ? 'roteiro_id = COALESCE(excluded.roteiro_id, producoes.roteiro_id)' : `${c} = excluded.${c}`)).join(', ')}`,
    ),
    // o envio liga o Roteiro ao card; o mais recente vale (o Roteiro reenviado para o mesmo card)
    envios: db.prepare(`SELECT e.card_id, e.roteiro_id, r.meta FROM envios e JOIN roteiros r ON r.id = e.roteiro_id WHERE e.card_id IS NOT NULL AND e.card_id <> '' ORDER BY e.em`),
    doCard: db.prepare('SELECT * FROM producoes WHERE card_id = ? ORDER BY entrada_em'),
    doRegistro: db.prepare('SELECT * FROM producoes WHERE teable_registro = ?'),
    doId: db.prepare('SELECT * FROM producoes WHERE id = ?'),
    // a pauta da edição (#96): as que entraram desde a data (e as sem data de entrada)
    daPauta: db.prepare('SELECT p.id, p.claquete, p.praca, p.etapa, p.designers, p.artes, p.artes_novas, p.artes_apagadas, p.artes_quantidade, p.prioridade, p.entrada_em, p.entrega_em, r.meta AS roteiro_meta FROM producoes p LEFT JOIN roteiros r ON r.id = p.roteiro_id WHERE p.entrada_em IS NULL OR p.entrada_em >= ?'),
    // a carga adota a Produção que o aviso do Trello criou para o card (ainda sem o registro do Teable): não duplica
    adotar: db.prepare(
      `UPDATE producoes SET teable_registro = ? WHERE id = (SELECT id FROM producoes WHERE card_id = ? AND teable_registro IS NULL ORDER BY criada_em LIMIT 1)`,
    ),
    // a tela de produções (#109): as abertas (Entrada e Produzindo) e as entregues desde a data, sem as arquivadas, com
    // a atração do Roteiro ligado
    naTela: db.prepare(`${DA_TELA} WHERE p.arquivada = 0 AND (p.etapa IN ('entrada', 'produzindo') OR (p.etapa = 'entregue' AND p.entrega_em >= ?))`),
    // a lista do Padeiro (#138): as abertas (Entrada e Produzindo), sem as arquivadas, as mais novas primeiro, com o
    // Roteiro ligado (a atração, o redator e o editor)
    doPadeiro: db.prepare(
      `SELECT p.id, p.claquete, p.praca, p.etapa, p.designers, p.artes, p.artes_marcadas, p.artes_novas, p.artes_apagadas, p.atracao, p.entrada_em, p.card_id, p.filme_id, p.filme_titulo, r.meta AS roteiro_meta
       FROM producoes p LEFT JOIN roteiros r ON r.id = p.roteiro_id
       WHERE p.arquivada = 0 AND p.etapa IN ('entrada', 'produzindo') ORDER BY COALESCE(p.entrada_em, p.criada_em) DESC, p.criada_em DESC`,
    ),
    // o índice do buscar do Padeiro (#143): as que entraram desde a data, também as entregues e as arquivadas, as mais
    // novas primeiro, com o Roteiro ligado
    doIndice: db.prepare(
      `SELECT p.id, p.claquete, p.praca, p.etapa, p.designers, p.artes, p.artes_marcadas, p.artes_novas, p.artes_apagadas, p.atracao, p.entrada_em, p.card_id, p.filme_id, p.filme_titulo, p.arquivada, r.meta AS roteiro_meta
       FROM producoes p LEFT JOIN roteiros r ON r.id = p.roteiro_id
       WHERE COALESCE(p.entrada_em, p.criada_em) >= ? ORDER BY COALESCE(p.entrada_em, p.criada_em) DESC, p.criada_em DESC`,
    ),
    // o aviso do Padeiro (#139) pelo filme: a Produção mais recente dele, sem as arquivadas
    daUltimaDoFilme: db.prepare('SELECT id FROM producoes WHERE filme_id = ? AND arquivada = 0 ORDER BY COALESCE(entrada_em, criada_em) DESC, criada_em DESC LIMIT 1'),
    // a busca da tela de produções (#161): o histórico todo, também os entregues antigos, sem as arquivadas, das mais
    // recentes (pela entrega ou, sem ela, pela entrada) para as mais antigas
    daBusca: db.prepare(`${DA_TELA} WHERE p.arquivada = 0 ORDER BY COALESCE(p.entrega_em, p.entrada_em, p.criada_em) DESC, p.criada_em DESC`),
    // a Produção mudada na tela (#110), para a tela mostrar sem reler tudo
    umaNaTela: db.prepare(`${DA_TELA} WHERE p.id = ? AND p.arquivada = 0`),
    // a correção de grafia (#116): todas as Produções, para contar as de cada atração
    paraContar: db.prepare('SELECT p.claquete, r.meta AS roteiro_meta FROM producoes p LEFT JOIN roteiros r ON r.id = p.roteiro_id'),
    /* ---------- os eventos (#87) ---------- */
    eventosDe: db.prepare('SELECT * FROM eventos WHERE producao_id = ? ORDER BY quando, anotado_em'),
    temAcao: db.prepare('SELECT 1 FROM eventos WHERE trello_acao = ?'),
    // o card pode ter mais de uma Produção (linhas repetidas na produção da arte): vale a mais recente
    daUltimaDoCard: db.prepare('SELECT id FROM producoes WHERE card_id = ? ORDER BY COALESCE(entrada_em, criada_em) DESC, criada_em DESC LIMIT 1'),
    // o ciclo do roteiro (#102): a Produção mais recente ligada ao Roteiro (o envio liga pelo card; a carga, pelo Roteiro)
    daUltimaDoRoteiro: db.prepare('SELECT * FROM producoes WHERE roteiro_id = ? ORDER BY COALESCE(entrada_em, criada_em) DESC, criada_em DESC LIMIT 1'),
    // o último evento da mesma família (a etapa; o mesmo designer ou a mesma arte; o mesmo campo)
    ultimoDaEtapa: db.prepare(`SELECT MAX(quando) AS quando FROM eventos WHERE producao_id = ? AND tipo IN (${DA_ETAPA.map(() => '?').join(', ')})`),
    ultimoDoItem: db.prepare('SELECT MAX(quando) AS quando FROM eventos WHERE producao_id = ? AND tipo IN (?, ?) AND COALESCE(depois, antes) = ?'),
    ultimoDoCampo: db.prepare("SELECT MAX(quando) AS quando FROM eventos WHERE producao_id = ? AND tipo = 'campo' AND campo = ?"),
    ultimoDoFogo: db.prepare(`SELECT MAX(quando) AS quando FROM eventos WHERE producao_id = ? AND tipo = '${DO_FOGO}' AND campo = ?`),
    // o evento mais novo de todos: a recuperação lê o quadro desde ele
    ultimoDeTodos: db.prepare('SELECT MAX(quando) AS quando FROM eventos'),
    daProducao: db.prepare('SELECT designers, artes, artes_marcadas, artes_novas, artes_apagadas FROM producoes WHERE id = ?'),
    mudarFogos: db.prepare('UPDATE producoes SET fogo_das_artes = ?, atualizada_em = ? WHERE id = ?'),
    comFogoParaPassar: db.prepare("SELECT id FROM producoes WHERE roteiro_id IS NOT NULL AND fogo_das_artes <> '{}'"),
    mudarArtesDoCard: db.prepare('UPDATE producoes SET artes_novas = ?, artes_apagadas = ?, atualizada_em = ? WHERE id = ?'),
    mudarAtracao: db.prepare('UPDATE producoes SET atracao = ?, atualizada_em = ? WHERE id = ?'),
    mudarPrazo: db.prepare('UPDATE producoes SET prazo_em = ?, atualizada_em = ? WHERE id = ?'),
    // o desfazer do apagar (#160): o último "arte-apagada" do item, que o evento da volta marca como desfeito
    ultimaApagada: db.prepare("SELECT id FROM eventos WHERE producao_id = ? AND tipo = 'arte-apagada' AND antes = ? ORDER BY quando DESC, anotado_em DESC LIMIT 1"),
    roteiroDaProducao: db.prepare('SELECT r.meta, r.criado_em FROM producoes p JOIN roteiros r ON r.id = p.roteiro_id WHERE p.id = ?'),
    mudarDesigners: db.prepare('UPDATE producoes SET designers = ?, atualizada_em = ? WHERE id = ?'),
    mudarArtesMarcadas: db.prepare('UPDATE producoes SET artes_marcadas = ?, atualizada_em = ? WHERE id = ?'),
    mudarPraca: db.prepare('UPDATE producoes SET praca = ?, atualizada_em = ? WHERE id = ?'),
    criarDoAviso: db.prepare(
      `INSERT INTO producoes (id, claquete, praca, etapa, card_id, entrada_em, arquivada, criada_em, atualizada_em) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ),
    anotar: db.prepare(
      `INSERT INTO eventos (id, producao_id, tipo, campo, antes, depois, quem_id, quem_nome, quando, trello_acao, anotado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (trello_acao) DO NOTHING`,
    ),
    mudarEtapa: db.prepare(
      `UPDATE producoes SET etapa = ?, arquivada = ?, entrega_em = CASE WHEN ? = 'entregue' AND entrega_em IS NULL THEN ? ELSE entrega_em END, atualizada_em = ? WHERE id = ?`,
    ),
    // a entrega feita na tela (#111) é a de agora, também a de novo depois de voltar para a Entrada
    entregueAgora: db.prepare('UPDATE producoes SET entrega_em = ? WHERE id = ?'),
    /* ---------- a releitura do Teable ---------- */
    // a Produção relida: o que o Teable diz vale; a exibição, o Roteiro e o filme só mudam se a linha trouxer
    relida: db.prepare(
      `INSERT INTO producoes (id, teable_registro, criada_em, ${COLUNAS.join(', ')}) VALUES (?, ?, ?, ${COLUNAS.map(() => '?').join(', ')})
       ON CONFLICT (teable_registro) DO UPDATE SET ${[...DA_RELEITURA.map((c) => `${c} = excluded.${c}`), ...['roteiro_id', 'exibicao_em', 'filme_id', 'filme_titulo'].map((c) => `${c} = COALESCE(excluded.${c}, producoes.${c})`), 'atualizada_em = excluded.atualizada_em'].join(', ')}`,
    ),
    // o que foi feito na tela de produções (#110): quem é o e-mail e o nome do designer, sem ação do Trello
    anotarDoPROMeiro: db.prepare(
      `INSERT INTO eventos (id, producao_id, tipo, campo, antes, depois, quem_id, quem_nome, quando, origem, desfaz, anotado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    // o desfazer (#112): o último evento da etapa da Produção (de onde vier), as mudanças feitas junto com ele (o mesmo
    // instante e a mesma pessoa) e o instante do último evento do PROMeiro
    ultimaDaEtapa: db.prepare(`SELECT * FROM eventos WHERE producao_id = ? AND tipo IN (${DA_ETAPA.map(() => '?').join(', ')}) ORDER BY quando DESC, anotado_em DESC LIMIT 1`),
    juntoCom: db.prepare('SELECT * FROM eventos WHERE producao_id = ? AND origem = ? AND quem_id = ? AND quando = ? ORDER BY anotado_em'),
    ultimoDoPROMeiro: db.prepare('SELECT MAX(quando) AS quando FROM eventos WHERE producao_id = ? AND origem = ?'),
    // o que o Padeiro fez (#139, #146, #147): com o identificador da ação
    anotarDoPadeiro: db.prepare(
      `INSERT INTO eventos (id, producao_id, tipo, campo, antes, depois, quem_id, quem_nome, quando, origem, desfaz, acao_do_padeiro, anotado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    // o desfazer da janela do After (#147): o último evento da etapa ou dos designers, de onde vier, e os da mesma ação
    ultimoDoDesfazer: db.prepare(`SELECT * FROM eventos WHERE producao_id = ? AND tipo IN (${DO_DESFAZER.map(() => '?').join(', ')}) ORDER BY quando DESC, anotado_em DESC LIMIT 1`),
    daAcao: db.prepare(`SELECT * FROM eventos WHERE producao_id = ? AND quem_id = ? AND acao_do_padeiro = ? AND tipo IN (${DO_DESFAZER.map(() => '?').join(', ')})`),
    // a janela do After (#146): a meta do Roteiro ligado (a complexidade das artes) e quem marcou cada arte, e quando
    metaDoRoteiro: db.prepare('SELECT meta FROM roteiros WHERE id = ?'),
    marcadasDe: db.prepare("SELECT depois, quem_nome, quando FROM eventos WHERE producao_id = ? AND tipo = 'arte-marcada' ORDER BY quando, anotado_em"),
    anotarDoTeable: db.prepare(
      `INSERT INTO eventos (id, producao_id, tipo, campo, antes, depois, quem_id, quem_nome, quando, chave, anotado_em) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    ),
  };

  /** card → { id, exibicao }: o Roteiro guardado que foi enviado para o card, e a data de exibição dele. */
  function roteirosDosCards() {
    const porCard = new Map();
    for (const e of q.envios.all()) {
      let exibicao = null;
      try {
        exibicao = String(JSON.parse(e.meta)?.dataExibicao ?? '').trim() || null;
      } catch {
        // meta ilegível: o Roteiro liga, sem a data
      }
      porCard.set(e.card_id, { id: e.roteiro_id, exibicao });
    }
    return porCard;
  }

  let emCurso = null;
  let ultima = null;

  /**
   * A carga inicial (ou de novo): lê a produção da arte inteira e as exibições dos cards, e grava uma Produção por
   * linha numa transação só. Uma carga por vez: quem pede durante uma recebe o resultado dela.
   * @param trello o módulo de agora (producaoInteira, exibicoesDosCards)
   * @param pracas as praças da configuração de agora
   * @returns { em, linhas, novas, atualizadas } ou null sem a produção da arte configurada; lança com o Teable fora
   */
  function carregar(trello, pracas) {
    emCurso ??= (async () => {
      const linhas = await trello?.producaoInteira?.();
      if (!linhas) return null;
      // as exibições só completam (a data e o filme dos cards de filme): sem elas, a carga segue
      const exibicoes = await Promise.resolve(trello.exibicoesDosCards?.())
        .catch((e) => console.warn(`[producoes] não li as exibições: ${e instanceof Error ? e.message : e}`))
        .then((m) => m ?? new Map());
      const roteiros = roteirosDosCards();
      const em = new Date().toISOString();
      let novas = 0;
      db.exec('BEGIN');
      try {
        for (const l of linhas) {
          const p = producaoDaLinha(l, { roteiro: l.card ? roteiros.get(l.card) : null, exibicao: l.card ? exibicoes.get(l.card) : null }, pracas);
          if (p.cardId && !q.existe.get(p.teableRegistro)) q.adotar.run(p.teableRegistro, p.cardId);
          if (!q.existe.get(p.teableRegistro)) novas++;
          const valores = colunasDa(p, l, em);
          q.gravar.run(randomUUID(), p.teableRegistro, em, ...COLUNAS.map((c) => valores[c]));
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      ultima = { em, linhas: linhas.length, novas, atualizadas: linhas.length - novas };
      console.log(`[producoes] carga da produção da arte: ${linhas.length} linhas, ${novas} Produções novas`);
      return ultima;
    })().finally(() => (emCurso = null));
    return emCurso;
  }

  /** Quantas Produções há em cada etapa (e com card, Roteiro e filme), para conferir com a produção da arte. */
  function contagem() {
    const porEtapa = Object.fromEntries(ETAPAS.map((e) => [e, 0]));
    for (const l of q.porEtapa.all()) porEtapa[l.etapa] = Number(l.n);
    const total = Number(q.total.get().n);
    const c = q.contas.get();
    const comCard = Number(c.com_card ?? 0);
    return { total, porEtapa, comCard, semCard: total - comCard, comRoteiro: Number(c.com_roteiro ?? 0), comFilme: Number(c.com_filme ?? 0), carregando: !!emCurso, ultimaCarga: ultima };
  }

  /** O último evento já anotado da família do evento (null sem nenhum). */
  function ultimoDaFamilia(id, ev) {
    if (DO_DESIGNER.includes(ev.tipo)) return q.ultimoDoItem.get(id, ...DO_DESIGNER, ev.depois ?? ev.antes)?.quando ?? null;
    if (DA_ARTE.includes(ev.tipo)) return q.ultimoDoItem.get(id, ...DA_ARTE, ev.depois ?? ev.antes)?.quando ?? null;
    if (DAS_ARTES_DO_CARD.includes(ev.tipo)) return q.ultimoDoItem.get(id, ...DAS_ARTES_DO_CARD, ev.depois ?? ev.antes)?.quando ?? null;
    if (ev.tipo === 'campo') return q.ultimoDoCampo.get(id, ev.campo)?.quando ?? null;
    if (ev.tipo === DO_FOGO) return q.ultimoDoFogo.get(id, ev.campo)?.quando ?? null;
    return q.ultimoDaEtapa.get(id, ...DA_ETAPA)?.quando ?? null;
  }

  /** O que o evento muda na Produção. "criada" de uma que já existia (a carga chegou antes) não muda nada; a
      prioridade, a complexidade e o prazo de entrega ficam só no histórico. */
  function mudarAProducao(id, ev, em, pracas) {
    const atual = () => q.daProducao.get(id) ?? {};
    if (['etapa', 'arquivada', 'desarquivada'].includes(ev.tipo)) q.mudarEtapa.run(ev.depois, ev.depois === 'arquivada' ? 1 : 0, ev.depois, ev.quando, em, id);
    else if (DO_DESIGNER.includes(ev.tipo)) q.mudarDesigners.run(comOuSem(atual().designers, ev.depois ?? ev.antes, ev.tipo === 'designer-entrou'), em, id);
    else if (DA_ARTE.includes(ev.tipo)) q.mudarArtesMarcadas.run(comOuSem(atual().artes_marcadas, ev.depois ?? ev.antes, ev.tipo === 'arte-marcada'), em, id);
    else if (DAS_ARTES_DO_CARD.includes(ev.tipo)) {
      // #160: a apagada que foi incluída no card sai das incluídas; a da produção da arte entra nas apagadas. A que
      // volta (o desfazer) sai das apagadas; a que não está na produção da arte entra nas incluídas
      const a = atual();
      const item = String(ev.depois ?? ev.antes ?? '');
      const daProducao = lista(a.artes).some((x) => chaveDeArte(x) === chaveDeArte(item));
      const apagar = ev.tipo === 'arte-apagada';
      const novas = comOuSem(a.artes_novas, item, !apagar && !daProducao);
      const apagadas = comOuSem(a.artes_apagadas, item, apagar);
      q.mudarArtesDoCard.run(novas, apagadas, em, id);
    } else if (ev.tipo === 'campo' && ev.campo === 'atracao') q.mudarAtracao.run(ev.depois ?? '', em, id);
    else if (ev.tipo === 'campo' && ev.campo === 'prazo') q.mudarPrazo.run(ev.depois || null, em, id);
    // a praça vazia no card não apaga a da Produção (a claquete ainda diz qual é)
    else if (ev.tipo === 'campo' && ev.campo === 'praca' && ev.depois) {
      // só a opção que é uma das praças (pela sigla ou pelo "também lida como"): a desconhecida não vira a padrão
      const sigla = normalizarPraca(ev.depois, pracas);
      const p = pracas.find((x) => x.sigla === sigla);
      const bate = (t) => nomeComparavel(t) === nomeComparavel(ev.depois);
      if (p && (bate(p.sigla) || p.tambem.some(bate))) q.mudarPraca.run(sigla, em, id);
    }
  }

  /**
   * Anota os eventos do aviso do Trello (src/modelo/avisoDoTrello.ts), numa transação: "criada" faz a Produção do card
   * quando ainda não há nenhuma (a claquete é o nome do card; a praça, a que a claquete indica); os outros só valem
   * para o card que já é Produção (o resto é card fora do domínio e é ignorado). O id da ação do Trello não repete.
   * Com `criar: false` (a recuperação das ações do quadro), nem o "criada" faz Produção: o quadro tem muito card
   * avulso, e a carga vem do Teable; só o aviso ao vivo cria.
   * Depois de anotado, o evento muda a Produção (se não é atrasado na família dele): a etapa, os designers, as artes
   * marcadas, a praça.
   * @returns { anotados, repetidos, ignorados }
   */
  function anotar(eventos, pracas = pracasRegistradas(), { criar = true } = {}) {
    const r = { anotados: 0, repetidos: 0, ignorados: 0 };
    if (!eventos?.length) return r;
    const em = new Date().toISOString();
    db.exec('BEGIN');
    try {
      for (const ev of eventos) {
        if (q.temAcao.get(ev.acao)) {
          r.repetidos++;
          continue;
        }
        let id = q.daUltimaDoCard.get(ev.cardId)?.id;
        if (!id && (ev.tipo !== 'criada' || !criar)) {
          r.ignorados++;
          continue;
        }
        if (!id) {
          id = randomUUID();
          const claquete = String(ev.claquete ?? '').trim();
          q.criarDoAviso.run(id, claquete, reconhecerPraca(claquete, pracas), ev.depois, ev.cardId, ev.quando, em, em);
        }
        const ultimo = ultimoDaFamilia(id, ev);
        q.anotar.run(randomUUID(), id, ev.tipo, ev.campo ?? null, ev.antes ?? null, ev.depois ?? null, ev.quem?.id ?? null, ev.quem?.nome ?? null, ev.quando, ev.acao, em);
        r.anotados++;
        // o atrasado (mais velho que o último da família) fica só no histórico
        if (!ultimo || ev.quando >= ultimo) mudarAProducao(id, ev, em, pracas);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return r;
  }

  /** O evento é mais velho que o último já anotado da família dele? */
  function atrasado(id, ev) {
    const ultimo = ultimoDaFamilia(id, ev);
    return !!ultimo && ev.quando < ultimo;
  }

  /**
   * A linha relida que ficou para trás de uma mudança mais nova (#110): a etapa e os designers guardados ficam onde a
   * releitura não trouxe evento deles (o atrasado foi tirado). Muda `valores` (as colunas que a releitura grava).
   */
  function manterOMaisRecente(atual, valores, l, pracas, eventos) {
    const p = producaoDaLinha(l, {}, pracas);
    if (p.etapa !== atual.etapa && !eventos.some((ev) => DA_ETAPA.includes(ev.tipo))) {
      valores.etapa = atual.etapa;
      valores.arquivada = atual.arquivada;
      valores.entrega_em = atual.entrega_em ?? null;
    }
    const nomes = (lista) => new Set(lista.map((x) => nomeComparavel(String(x))));
    const guardados = JSON.parse(atual.designers ?? '[]');
    const [doTeable, daqui] = [nomes(p.designers), nomes(guardados)];
    const comEvento = nomes(eventos.filter((ev) => DO_DESIGNER.includes(ev.tipo)).map((ev) => ev.depois ?? ev.antes));
    // cada designer: o da linha quando ela trouxe o evento dele; senão, o guardado
    const fica = (nome) => (comEvento.has(nomeComparavel(nome)) ? doTeable.has(nomeComparavel(nome)) : daqui.has(nomeComparavel(nome)));
    const designers = [...guardados, ...p.designers].filter((d, i, todos) => fica(d) && todos.findIndex((x) => nomeComparavel(x) === nomeComparavel(d)) === i);
    if (doTeable.size !== designers.length || designers.some((d) => !doTeable.has(nomeComparavel(d)))) valores.designers = JSON.stringify(designers);
  }

  /**
   * O que foi feito na tela de produções (#110), numa transação: os eventos (a etapa, o designer que entrou ou saiu),
   * com quem, agora e a origem PROMeiro, e a Produção mudada na hora. Nada vai ao Teable (a produção da arte continua
   * com o n8n).
   * O desfazer (#112) é a mesma coisa, com `desfaz` (o id do evento da etapa desfeito) em cada evento novo; a entrega
   * que ele traz de volta é a de antes (a guardada), não a de agora.
   * As mudanças de uma vez têm o mesmo instante, sempre depois do último evento do PROMeiro na Produção (o desfazer
   * acha a mudança pelo instante).
   * @param mudancas [{ tipo: 'etapa' | 'designer-entrou' | 'designer-saiu', antes, depois }]
   * @param quem { email, nome } (o nome do designer)
   */
  function doPROMeiro(id, mudancas, quem, { desfaz = null } = {}) {
    let em = new Date().toISOString();
    const ultimo = q.ultimoDoPROMeiro.get(id, ORIGEM_PROMEIRO)?.quando;
    if (ultimo && ultimo >= em) em = new Date(Date.parse(ultimo) + 1).toISOString();
    db.exec('BEGIN');
    try {
      for (const ev of mudancas) {
        q.anotarDoPROMeiro.run(randomUUID(), id, ev.tipo, ev.campo ?? null, ev.antes ?? null, ev.depois ?? null, quem.email, quem.nome, em, ORIGEM_PROMEIRO, desfaz, em);
        mudarAProducao(id, { ...ev, quando: em }, em, []);
        if (ev.tipo === 'etapa' && ev.depois === 'entregue' && !desfaz) q.entregueAgora.run(em, id);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  /**
   * O aviso do Padeiro (#139), numa transação: os eventos (a etapa, o designer que entrou ou "abriu-o-projeto"), com
   * quem (o Padeiro e o nome do designer da chave), a hora da abertura (`quando`) e a origem Padeiro. A regra do
   * conflito é a da releitura e do aviso do Trello: o evento mais velho que o último da mesma família fica só no
   * histórico; os outros mudam a Produção. Nada vai ao Teable.
   * As ações da janela do After (#147) também passam por aqui: o fogo (que fica só no evento; o nível muda fora), a
   * entrega (a data da entrega é a da ação), a volta e o desfazer (`desfaz`: o id do evento desfeito). `acao` é o
   * identificador da ação do Padeiro, o mesmo nos eventos dela.
   * @param mudancas [{ tipo: 'etapa' | 'designer-entrou' | 'designer-saiu' | 'abriu-o-projeto' | 'arte-…' | 'fogo', campo?, antes, depois }]
   * @param quem { id, nome }
   */
  function doPadeiro(id, mudancas, quem, quando, { acao = null, desfaz = null } = {}) {
    const em = new Date().toISOString();
    db.exec('BEGIN');
    try {
      for (const ev of mudancas) {
        const vale = ev.tipo !== 'abriu-o-projeto' && !atrasado(id, { ...ev, quando });
        q.anotarDoPadeiro.run(randomUUID(), id, ev.tipo, ev.campo ?? null, ev.antes ?? null, ev.depois ?? null, quem.id, quem.nome, quando, ORIGEM_PADEIRO, desfaz, acao, em);
        if (vale) mudarAProducao(id, { ...ev, quando }, em, []);
        if (vale && ev.tipo === 'etapa' && ev.depois === 'entregue' && !desfaz) q.entregueAgora.run(quando, id);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  /**
   * A Produção como a janela do After mostra (#146): a Produção, a meta do Roteiro ligado ({} sem ele), o fogo guardado
   * nela (#174: as marcas { chave: 2 | 3 } da Produção sem Roteiro, ou as que ainda não passaram para ele) e as artes de
   * `artesFeitas`, cada feita com quem a marcou por último e quando (null quando o PROMeiro não sabe: a marcada antes
   * dos eventos). null sem a Produção ou arquivada.
   * @returns { producao, meta, fogos, artes: [{ nome, itens, feita, marcada: { por, em } | null }] } | null
   */
  function naJanela(id) {
    const l = typeof id === 'string' && id ? q.doId.get(id) : null;
    if (!l || l.arquivada) return null;
    const p = daLinha(l);
    let meta = {};
    try {
      meta = (p.roteiroId ? JSON.parse(q.metaDoRoteiro.get(p.roteiroId)?.meta ?? 'null') : null) ?? {};
    } catch {
      // meta ilegível: as artes ficam sem o fogo
    }
    const ultima = new Map();
    for (const e of q.marcadasDe.all(p.id)) ultima.set(chaveDeArte(String(e.depois ?? '')), { por: e.quem_nome ?? '', em: e.quando });
    const artes = artesFeitas(p).map((a) => {
      const vezes = a.feita ? [a.nome, ...a.itens].map((x) => ultima.get(chaveDeArte(x))).filter(Boolean) : [];
      return { ...a, marcada: vezes.sort((x, y) => (x.em < y.em ? 1 : -1))[0] ?? null };
    });
    return { producao: p, meta, fogos: fogosDaLinha(l), artes };
  }

  /**
   * O fogo de uma arte da Produção sem Roteiro (#174), guardado nela, pela regra do Roteiro (fogoNoNivel): com `nivel`,
   * fica nesse nível; sem ele, sobe um. Com `gravar: false` (a ação atrasada), só diz o que seria.
   * @returns { antes, depois } (1, 2 ou 3), ou null sem a Produção
   */
  function fogoNaProducao(id, chave, { nivel = null, gravar = true } = {}) {
    const l = q.doId.get(id);
    if (!l) return null;
    const { marcas, antes, depois } = fogoNoNivel(fogosDaLinha(l), chave, nivel);
    if (gravar) q.mudarFogos.run(JSON.stringify(marcas ?? {}), new Date().toISOString(), id);
    return { antes, depois };
  }

  /** Esvazia o fogo guardado na Produção (#174): o fogo passou para o Roteiro ligado, ou a arte mudou nele. Só a
      arte `chave`, quando dada. */
  function soltarFogos(id, chave = null) {
    const l = q.doId.get(id);
    if (!l) return;
    const resto = chave === null ? {} : Object.fromEntries(Object.entries(fogosDaLinha(l)).filter(([k]) => k !== chave));
    if (JSON.stringify(resto) !== JSON.stringify(fogosDaLinha(l))) q.mudarFogos.run(JSON.stringify(resto), new Date().toISOString(), id);
  }

  /** As Produções com Roteiro ligado que ainda guardam fogo (#174): o fogo delas ainda tem de passar para o Roteiro. */
  const comFogoParaPassar = () => q.comFogoParaPassar.all().map((l) => l.id);

  /**
   * Marca ou desmarca uma arte pela janela do After (#146): os itens dela que mudam (marcar: os que não estão marcados;
   * desmarcar: os marcados, e o nome dela, quando é ele que está), como eventos do aviso do Padeiro (`doPadeiro`, a
   * origem Padeiro, a regra do conflito na família de cada item). Nada vai ao Trello nem ao Teable.
   * @returns os eventos gravados ([] quando a arte já estava assim), ou null quando a Produção não tem essa arte
   */
  function arteDoPadeiro(id, nome, feita, quem, quando, acao = null) {
    const p = q.doId.get(id) ? daLinha(q.doId.get(id)) : null;
    const arte = p && artesFeitas(p).find((a) => chaveDeArte(a.nome) === chaveDeArte(String(nome ?? '')));
    if (!arte) return null;
    const marcadas = new Set(p.artesMarcadas.map(chaveDeArte));
    const desmarcar = [...new Set([arte.nome, ...arte.itens])].filter((x) => marcadas.has(chaveDeArte(x)));
    const itens = feita ? arte.itens.filter((x) => !marcadas.has(chaveDeArte(x))) : desmarcar;
    const mudancas = itens.map((x) => (feita ? { tipo: 'arte-marcada', antes: null, depois: x } : { tipo: 'arte-desmarcada', antes: x, depois: null }));
    if (mudancas.length) doPadeiro(p.id, mudancas, quem, quando, { acao });
    return mudancas.map((m) => m.tipo);
  }

  /**
   * O que muda na Produção quando a arte é marcada, desmarcada, apagada, devolvida ou incluída no card aberto da tela
   * de produções (#160), sem gravar nada: a arte (a de vários tipos é uma só, como na janela do After, `artesFeitas`) e
   * os eventos de cada item dela. Marcar e desmarcar são os da janela; apagar tira todos os itens da arte (a apagada
   * guarda as marcas, para o desfazer); `voltar` (o desfazer do apagar) devolve os itens apagados da arte; `incluir`
   * põe uma arte nova (o nome vira um item).
   * @param acao 'marcar' | 'desmarcar' | 'apagar' | 'voltar' | 'incluir'
   * @returns { arte: { nome, itens, feita }, mudancas: [{ tipo, antes, depois }] } ([] quando já estava assim), ou null
   *   quando a Produção não tem essa arte (ou, no `voltar`, não a tem apagada; no `incluir`, já a tem)
   */
  function mudancasDaArte(id, nome, acao) {
    const l = q.doId.get(id);
    if (!l) return null;
    const p = daLinha(l);
    const k = chaveDeArte(String(nome ?? ''));
    if (!k) return null;
    if (acao === 'incluir') {
      if (artesAgrupadas(p.artes).some((a) => chaveDeArte(a.nome) === k || a.itens.some((i) => chaveDeArte(i) === k))) return null;
      const item = String(nome).trim();
      return { arte: { nome: item, itens: [item], feita: false }, mudancas: [{ tipo: 'arte-incluida', antes: null, depois: item }] };
    }
    if (acao === 'voltar') {
      // as artes de antes do apagar: as da produção da arte e as incluídas, com as apagadas
      const todas = artesAgrupadas([...lista(l.artes), ...lista(l.artes_novas), ...lista(l.artes_apagadas)]);
      const arte = todas.find((a) => chaveDeArte(a.nome) === k);
      const apagadas = new Set(lista(l.artes_apagadas).map(chaveDeArte));
      const itens = arte ? arte.itens.filter((i) => apagadas.has(chaveDeArte(i))) : [];
      if (!itens.length) return null;
      return { arte: { ...arte, feita: false }, mudancas: itens.map((i) => ({ tipo: 'arte-incluida', antes: null, depois: i })) };
    }
    const arte = artesFeitas(p).find((a) => chaveDeArte(a.nome) === k);
    if (!arte) return null;
    const marcadas = new Set(p.artesMarcadas.map(chaveDeArte));
    if (acao === 'apagar') return { arte, mudancas: arte.itens.map((i) => ({ tipo: 'arte-apagada', antes: i, depois: null })) };
    const feita = acao === 'marcar';
    const desmarcar = [...new Set([arte.nome, ...arte.itens])].filter((x) => marcadas.has(chaveDeArte(x)));
    const itens = feita ? arte.itens.filter((x) => !marcadas.has(chaveDeArte(x))) : desmarcar;
    return { arte, mudancas: itens.map((x) => (feita ? { tipo: 'arte-marcada', antes: null, depois: x } : { tipo: 'arte-desmarcada', antes: x, depois: null })) };
  }

  /** A Produção do aviso do Padeiro (#139): pelo id dela, pelo card (a mais recente, como o aviso do Trello) ou pelo
      filme (a mais recente, sem as arquivadas). null sem nenhuma. */
  function doAviso({ producao, card, filme }) {
    const id = producao || (card ? q.daUltimaDoCard.get(card)?.id : null) || (filme ? q.daUltimaDoFilme.get(filme)?.id : null);
    const l = id ? q.doId.get(id) : null;
    return l ? daLinha(l) : null;
  }

  /**
   * A última mudança da etapa da Produção (#112), para o desfazer: o evento da etapa mais recente, de onde vier, e as
   * mudanças feitas junto com ele (quando é do PROMeiro). null sem nenhum evento da etapa.
   * @returns { id, tipo, antes, depois, quem, origem, desfaz, quando, junto: [{ tipo, antes, depois }] } ou null
   */
  function ultimaMudanca(id) {
    const e = q.ultimaDaEtapa.get(id, ...DA_ETAPA);
    if (!e) return null;
    const junto = e.origem === ORIGEM_PROMEIRO && e.quem_id ? q.juntoCom.all(id, ORIGEM_PROMEIRO, e.quem_id, e.quando) : [e];
    const doEv = (x) => ({ tipo: x.tipo, antes: x.antes ?? null, depois: x.depois ?? null });
    return { id: e.id, ...doEv(e), quem: e.quem_id ?? null, origem: e.origem ?? null, desfaz: e.desfaz ?? null, quando: e.quando, junto: junto.map(doEv) };
  }

  /**
   * A última mudança da etapa ou dos designers da Produção (#147), para o desfazer da janela do After: o evento mais
   * recente dessas famílias, de onde vier, e os da mesma ação do Padeiro (quando é dele). null sem nenhum.
   * @returns { id, quem, origem, acao, desfaz, quando, junto: [{ tipo, antes, depois }] } ou null
   */
  function ultimaDaJanela(id) {
    const e = q.ultimoDoDesfazer.get(id, ...DO_DESFAZER);
    if (!e) return null;
    const doEv = (x) => ({ tipo: x.tipo, antes: x.antes ?? null, depois: x.depois ?? null });
    const junto = e.origem === ORIGEM_PADEIRO && e.quem_id && e.acao_do_padeiro ? q.daAcao.all(id, e.quem_id, e.acao_do_padeiro, ...DO_DESFAZER) : [e];
    // a etapa primeiro, como a ação gravou
    junto.sort((a, b) => Number(b.tipo === 'etapa') - Number(a.tipo === 'etapa'));
    return { id: e.id, quem: e.quem_id ?? null, origem: e.origem ?? null, acao: e.acao_do_padeiro ?? null, desfaz: e.desfaz ?? null, quando: e.quando, junto: junto.map(doEv) };
  }

  /**
   * A releitura da produção da arte (ADR 0006: lê do Teable): cada linha relida é comparada com a Produção guardada
   * (src/modelo/eventosDoTeable.ts), numa transação. A linha nova vira Produção, com o evento "criada"; a que já existe
   * recebe os eventos do que mudou e passa a ser o que o Teable diz (a linha igual não é regravada). A chave do evento
   * não repete: a mesma linha relida duas vezes não duplica.
   * @param linhas as linhas da produção da arte relidas (servidor/trello.mjs, producaoAlteradaDesde)
   * @returns { lidas, novas, mudadas, anotados }
   */
  function reler(linhas, pracas = pracasRegistradas(), agora = new Date().toISOString()) {
    const r = { lidas: linhas?.length ?? 0, novas: 0, mudadas: 0, anotados: 0 };
    if (!linhas?.length) return r;
    const roteiros = roteirosDosCards();
    db.exec('BEGIN');
    try {
      for (const l of linhas) {
        if (!l?.registro) continue;
        const p = producaoDaLinha(l, { roteiro: l.card ? roteiros.get(l.card) : null }, pracas);
        if (p.cardId && !q.existe.get(p.teableRegistro)) q.adotar.run(p.teableRegistro, p.cardId);
        const atual = q.doRegistro.get(p.teableRegistro);
        const antes = atual ? { etapa: atual.etapa, designers: JSON.parse(atual.designers ?? '[]'), praca: atual.praca, prioridade: atual.prioridade ?? null, complexidade: atual.complexidade ?? null } : null;
        // conflito (#110): o que a linha diz e que é mais velho que o último evento da mesma família (o "pegar" do
        // PROMeiro que o n8n ainda não levou ao Teable) não volta a Produção nem vira evento; vale o mais recente
        const eventos = eventosDaReleitura(antes, l, { pracas, agora }).filter((ev) => !atual || !atrasado(atual.id, ev));
        const valores = colunasDa(p, l, agora);
        if (atual) manterOMaisRecente(atual, valores, l, pracas, eventos);
        // a linha igual à guardada (a releitura pega de novo as do fim da janela) não é regravada
        const igual = atual && DA_RELEITURA.every((c) => (atual[c] ?? null) === (valores[c] ?? null)) && (!valores.filme_id || atual.filme_id === valores.filme_id);
        if (!igual) {
          q.relida.run(randomUUID(), p.teableRegistro, agora, ...COLUNAS.map((c) => valores[c]));
          if (atual) r.mudadas++;
          else r.novas++;
        }
        const id = atual?.id ?? q.doRegistro.get(p.teableRegistro)?.id;
        for (const ev of eventos) r.anotados += Number(q.anotarDoTeable.run(randomUUID(), id, ev.tipo, ev.campo ?? null, ev.antes ?? null, ev.depois ?? null, ev.quando, ev.chave, agora).changes ?? 0);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return r;
  }

  /**
   * A Linha do tempo (#89) de uma Produção, pelo id dela ou pelo card (o card com mais de uma: a mais recente, como o
   * aviso). Só o que a leitura precisa, para qualquer pessoa logada: o estado de agora e os eventos em ordem, com o
   * nome de quem fez; sem os ids do Trello (o do membro e o da ação).
   * @returns { producao, eventos }; sem Produção, { producao: null, eventos: [] }
   */
  function linhaDoTempo({ card, producao }) {
    const id = producao || (card ? q.daUltimaDoCard.get(card)?.id : null);
    const l = id ? q.doId.get(id) : null;
    if (!l) return { producao: null, eventos: [] };
    const p = daLinha(l);
    return {
      producao: { id: p.id, claquete: p.claquete, etapa: p.etapa, entradaEm: p.entradaEm, entregaEm: p.entregaEm, artes: p.artes, artesQuantidade: p.artesQuantidade, arquivada: p.arquivada },
      eventos: q.eventosDe.all(l.id).map((linha) => {
        const { quem, acao, ...e } = doEvento(linha);
        return { ...e, quem: quem?.nome || null };
      }),
    };
  }

  /**
   * A Produção aberta na tela de produções (#113): a linha do tempo (o estado de agora e os eventos, como em
   * `linhaDoTempo`), as artes do checklist (marcadas ou não) e o link do card no Trello (o endereço pelo id do card,
   * sem ler o Trello; null sem card). Para qualquer pessoa logada, como a linha do tempo.
   * @returns { producao, eventos, artes, trello } | null sem a Produção
   */
  function aberta(id) {
    const l = id ? q.doId.get(id) : null;
    if (!l) return null;
    const p = daLinha(l);
    return { ...linhaDoTempo({ producao: l.id }), artes: artesDoChecklist(p), trello: p.cardId ? `https://trello.com/c/${encodeURIComponent(p.cardId)}` : null };
  }

  /**
   * As Produções que entraram desde `desde` (ISO), como a pauta da edição mostra (#96, src/modelo/pauta.ts,
   * ProducaoNaPauta): as artes a produzir sem repetir (a conta da agenda, `artesDaProducao`; sem a lista, a quantidade
   * da coluna) e a prioridade ALTA da produção da arte.
   */
  function naPauta(desde) {
    return q.daPauta.all(desde).map((l) => {
      return {
        id: l.id,
        claquete: l.claquete,
        praca: l.praca ?? '',
        etapa: l.etapa,
        artes: artesAProduzir(l),
        designers: JSON.parse(l.designers ?? '[]'),
        alta: String(l.prioridade ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() === 'ALTA',
        entradaEm: l.entrada_em ?? null,
        entregaEm: l.entrega_em ?? null,
        ...comALetraEVersao(l),
      };
    });
  }

  /**
   * Quantas Produções cada atração tem (a correção de grafia, #116), todas (as arquivadas também): a atração vem do
   * Roteiro ligado ou, sem ele, de `atracaoDaClaquete`.
   * @param atracaoDaClaquete (claquete) => nome, ou ''
   * @returns { [nome da atração]: n }
   */
  function porAtracao(atracaoDaClaquete = () => '') {
    const saida = {};
    for (const l of q.paraContar.all()) {
      let programa = '';
      try {
        programa = String(JSON.parse(l.roteiro_meta ?? 'null')?.programa ?? '').trim();
      } catch {
        // meta ilegível: a atração sai da claquete
      }
      const nome = programa || atracaoDaClaquete(l.claquete);
      if (nome) saida[nome] = (saida[nome] ?? 0) + 1;
    }
    return saida;
  }

  /**
   * As Produções da tela de produções (#109, src/modelo/producoesPorPraca.ts, CardDaProducao): as de Entrada e
   * Produzindo e as entregues desde `desde` (ISO), sem as arquivadas. As artes a produzir são a conta da agenda
   * (`artesDaProducao`; sem a lista, a quantidade da coluna); o prazo é a exibição ou, sem ela, o dia da claquete. A
   * atração vem do Roteiro ligado, do filme ou, sem os dois, de `atracaoDaClaquete`. Nada do Trello: o card só diz se
   * existe (sem o id).
   * @param atracaoDaClaquete (claquete) => nome, ou ''
   */
  function naTela(desde, atracaoDaClaquete = () => '') {
    return q.naTela.all(desde).map(paraATela(atracaoDaClaquete));
  }

  /** Uma Produção como o card da tela de produções mostra (a de `naTela`); null sem ela ou arquivada. */
  function umaNaTela(id, atracaoDaClaquete = () => '') {
    const l = q.umaNaTela.get(id);
    return l ? paraATela(atracaoDaClaquete)(l) : null;
  }

  /**
   * A busca da tela de produções (#161): as Produções do histórico todo (também as entregues há mais de 3 dias, que a
   * tela não mostra; sem as arquivadas) que têm todas as palavras do termo na claquete, na atração ou numa pessoa (os
   * designers, e o redator e o editor do Roteiro ligado), cada palavra pelo começo de uma palavra e sem diferença de
   * caixa, acento e pontuação (`nomeComparavel`). As mais recentes primeiro, em páginas de `porPagina`, como o card da
   * tela mostra (o de `naTela`, com o dia da entrega em `entregaEm`).
   * @returns { cards, total (as achadas, em todas as páginas), pagina, mais (há a página seguinte) }
   */
  function naBusca(termo, { pagina = 0, porPagina = POR_PAGINA_DA_BUSCA, atracaoDaClaquete = () => '' } = {}) {
    const palavras = nomeComparavel(termo).split(' ').filter(Boolean);
    const n = Math.max(0, Math.floor(Number(pagina)) || 0);
    if (!palavras.length) return { cards: [], total: 0, pagina: 0, mais: false };
    const aTela = paraATela(atracaoDaClaquete);
    const achadas = q.daBusca.all().flatMap((l) => {
      const c = aTela(l);
      const meta = metaDaLinha(l);
      const onde = ` ${nomeComparavel([c.claquete, c.atracao, ...c.designers, meta.redator, meta.editor].join(' '))}`;
      return palavras.every((p) => onde.includes(` ${p}`)) ? [c] : [];
    });
    const cards = achadas.slice(n * porPagina, (n + 1) * porPagina);
    return { cards, total: achadas.length, pagina: n, mais: (n + 1) * porPagina < achadas.length };
  }

  /** O redator e o editor do Roteiro ligado ('' sem eles, ou com a meta ilegível). */
  function metaDaLinha(l) {
    try {
      const m = JSON.parse(l.roteiro_meta ?? 'null') ?? {};
      return { redator: String(m.redator ?? '').trim(), editor: String(m.editor ?? '').trim() };
    } catch {
      return { redator: '', editor: '' };
    }
  }

  /** A linha de `naTela` como o card mostra. */
  function paraATela(atracaoDaClaquete) {
    return (l) => {
      let programa = '';
      try {
        programa = String(JSON.parse(l.roteiro_meta ?? 'null')?.programa ?? '').trim();
      } catch {
        // meta ilegível: a atração sai da claquete
      }
      const daClaquete = dataDaClaquete(l.claquete, new Date(l.entrada_em ?? Date.now()));
      return {
        id: l.id,
        claquete: l.claquete,
        // a escolhida no card aberto (#160) vale sobre as outras; '' é a desligada
        atracao: l.atracao ?? (programa || String(l.filme_titulo ?? '').trim() || atracaoDaClaquete(l.claquete)),
        praca: l.praca ?? '',
        etapa: l.etapa,
        marcador: l.marcador ?? '',
        designers: JSON.parse(l.designers ?? '[]'),
        // a contagem da janela do After (#146): as artes feitas de cada uma vez, pela mesma regra
        artes: { aProduzir: artesAProduzir(l), entregues: artesFeitas({ artes: artesQueValem(l), artesMarcadas: lista(l.artes_marcadas) }).filter((a) => a.feita).length },
        alta: ehAlta(l.prioridade),
        // o prazo mudado no card aberto (#160) vale sobre a exibição
        prazo: l.prazo_em || l.exibicao_em || daClaquete || null,
        semCard: !l.card_id,
        entregaEm: l.entrega_em ?? null,
        ...comALetraEVersao(l),
      };
    };
  }

  /**
   * As Produções para o grupo NO TRELLO do Padeiro (#138), no formato `trello` que ele já entende (o do índice do buscar
   * do n8n, docs/webhook-trello.md do repositório do Padeiro): a claquete (`claq`), o redator e o editor do Roteiro ligado
   * (`red`, `ed`; '' sem ele), o card (`card`; '' sem card), a entrada (`at`, ISO; null sem data), `fim` (sempre false:
   * só as abertas), a atração (`atr`: a do Roteiro, o título do filme ou a da claquete; '' sem nenhuma) e se é filme
   * (`fil`). A mais, que o Padeiro de antes ignora: o filme do cadastro (`filme`, o id; '' sem ele), a praça, a Produção
   * (o id, para o aviso do Padeiro, #139), a etapa e as artes do checklist (`artes`: as feitas e as a fazer, na ordem
   * do checklist) e os designers (`designers`, os nomes da coluna, #153). Nada do Trello.
   * @param atracaoDaClaquete (claquete) => nome, ou ''
   */
  function paraOPadeiro(atracaoDaClaquete = () => '') {
    return q.doPadeiro.all().map((l) => doPadeiroDaLinha(l, atracaoDaClaquete));
  }

  /**
   * O `trello` do índice do buscar do Padeiro (#143): as Produções que entraram desde a data (ISO), as mais novas
   * primeiro, no formato da lista do Padeiro (paraOPadeiro). A Entregue e a arquivada vêm com `fim: true`, como o card
   * FINALIZADO ou arquivado do índice do n8n.
   * @param atracaoDaClaquete (claquete) => nome, ou ''
   */
  function noIndice(desde, atracaoDaClaquete = () => '') {
    return q.doIndice.all(desde).map((l) => ({ ...doPadeiroDaLinha(l, atracaoDaClaquete), fim: l.etapa === 'entregue' || l.etapa === 'arquivada' || !!l.arquivada }));
  }

  /** Uma linha das Produções no formato da lista do Padeiro (paraOPadeiro). */
  function doPadeiroDaLinha(l, atracaoDaClaquete) {
    let meta = {};
    try {
      meta = JSON.parse(l.roteiro_meta ?? 'null') ?? {};
    } catch {
      // meta ilegível: sem redator nem editor, e a atração sai da claquete
    }
    const doMeta = (campo) => String(meta?.[campo] ?? '').trim();
    const artes = artesDoChecklist({ artes: artesQueValem(l), artesMarcadas: lista(l.artes_marcadas) });
    return {
      claq: l.claquete,
      red: doMeta('redator'),
      ed: doMeta('editor'),
      card: l.card_id ?? '',
      at: l.entrada_em ?? null,
      fim: false,
      atr: l.atracao ?? (doMeta('programa') || String(l.filme_titulo ?? '').trim() || atracaoDaClaquete(l.claquete)),
      fil: !!(l.filme_id || l.filme_titulo),
      filme: l.filme_id ?? '',
      praca: l.praca ?? '',
      producao: l.id,
      etapa: l.etapa,
      designers: JSON.parse(l.designers ?? '[]'),
      artes: { feitas: artes.filter((a) => a.marcada).map((a) => a.nome), aFazer: artes.filter((a) => !a.marcada).map((a) => a.nome) },
    };
  }

  /**
   * O que o ciclo do roteiro (#102) lê da Produção do Roteiro: pelo card do envio (o mais recente, como o aviso) ou,
   * sem ele, pelo Roteiro ligado. null sem nenhuma. As artes (a coluna da produção da arte) e as marcadas no checklist
   * são das artes do roteiro aberto (#104).
   * @returns { etapa, entradaEm, entregaEm, designers, artes, artesMarcadas } | null
   */
  function doRoteiro({ roteiro, card }) {
    const id = card ? q.daUltimaDoCard.get(card)?.id : null;
    const l = (id ? q.doId.get(id) : null) ?? (roteiro ? q.daUltimaDoRoteiro.get(roteiro) : null);
    if (!l) return null;
    const p = daLinha(l);
    return { etapa: p.etapa, entradaEm: p.entradaEm, entregaEm: p.entregaEm, designers: p.designers, artes: p.artes, artesMarcadas: p.artesMarcadas };
  }

  return {
    linhaDoTempo,
    aberta,
    doRoteiro,
    naTela,
    umaNaTela,
    naBusca,
    paraOPadeiro,
    noIndice,
    doPROMeiro,
    doPadeiro,
    doAviso,
    naJanela,
    fogoNaProducao,
    soltarFogos,
    comFogoParaPassar,
    arteDoPadeiro,
    mudancasDaArte,
    /** O id do último "arte-apagada" do item na Produção (#160), ou null. */
    ultimaApagada: (id, item) => q.ultimaApagada.get(id, item)?.id ?? null,
    /** O Roteiro ligado à Produção (#160): a meta (o objeto) e quando foi criado; null sem ele. */
    roteiroDe: (id) => {
      const r = q.roteiroDaProducao.get(id);
      if (!r) return null;
      try {
        return { meta: JSON.parse(r.meta) ?? {}, criadoEm: r.criado_em };
      } catch {
        return { meta: {}, criadoEm: r.criado_em };
      }
    },
    /** O evento ({ tipo, campo, antes, depois, quando }) é mais velho que o último já anotado da família dele (#139)? */
    atrasado,
    ultimaMudanca,
    ultimaDaJanela,
    /** A Produção pelo id (como a API mostra), ou null. */
    uma: (id) => {
      const l = q.doId.get(id);
      return l ? daLinha(l) : null;
    },
    naPauta,
    porAtracao,
    vazia: () => Number(q.total.get().n) === 0,
    /** A data do evento mais novo (ISO), de onde a recuperação lê o quadro; null sem nenhum. */
    ultimoEvento: () => q.ultimoDeTodos.get()?.quando ?? null,
    anotar,
    reler,
    carregar,
    contagem,
    /** As Produções de um card ou de um registro do Teable, com os eventos de cada uma (do mais velho ao mais novo). */
    buscar: ({ card, registro }) => (card ? q.doCard.all(card) : registro ? q.doRegistro.all(registro) : []).map((l) => ({ ...daLinha(l), eventos: q.eventosDe.all(l.id).map(doEvento) })),
  };
}
