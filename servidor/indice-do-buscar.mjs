/* O índice do buscar do Padeiro (#143): o que o fluxo PROMO - BUSCAR do n8n devolvia (GET …/webhook/buscar), agora
   montado pelo PROMeiro e lido pelo Padeiro com a chave dele (GET /api/padeiro/buscar). O formato é o mesmo, para o
   Padeiro mudar o mínimo:

     { v: 2, stamp, generated, teams: [...], trello: [...], atracoes: [...], filmes: [...] }

   - atracoes: o cadastro das atrações (Cadastros, o mesmo que o PROMeiro já lê): { name, cat, pattern, proj, out },
     com as keys como padrões e as pastas do projeto e do output (os campos de TEABLE_CAMPOS_CAMINHO que começam com
     "projeto" e "output"); a atração sem pasta nenhuma fica de fora;
   - trello: as Produções do PROMeiro que entraram nos últimos 15 dias, as mais novas primeiro, no formato da lista do
     Padeiro ({ claq, red, ed, card, atr, at, des, fim, fil, producao }); a Entregue e a arquivada com `fim: true`;
   - filmes: o cadastro dos filmes (o Postgres do Teable), um por título: { name, year, out };
   - teams: as pastas citadas nas mensagens do Teams dos últimos 30 dias (a tabela mensagens, que o fluxo PROMO:
     MENSAGENS NO TEAMS do n8n grava), cada pasta uma vez (a citação mais recente): { from, role, at, chat, msg, path }.

   Como no n8n, o campo vazio não vai (nem o `false`), e o `stamp` muda só quando o conteúdo muda. Só leitura. */
import { createHash } from 'node:crypto';
import { abrirPg as abrirPgPadrao, nomesDoPg } from './pauta.mjs';
import { tabelaNoPg } from './tabelas-do-teable.mjs';
import { SEM_CAMINHO } from './trello.mjs';
import { nomeSemArtigos } from '../src/modelo/correcaoDeGrafia.ts';

const NOME_SQL = /^[A-Za-z0-9_]+$/;
const DIA = 86_400_000;
/** Quantos dias de Produções (o trello) e de mensagens do Teams (o teams) o índice traz, como o fluxo do n8n. */
export const DIAS_DO_TRELLO = 15;
export const DIAS_DO_TEAMS = 30;
/** Quanto tempo a leitura do Postgres vale: o Padeiro de cada computador pede o índice de tempos em tempos. */
const VALE_POR = 30_000;

const texto = (v) => (v == null ? '' : String(v).trim());
/** Sem os vazios e os `false` (o jsonb_strip_nulls e os NULLIF do fluxo do n8n). */
const semVazios = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false && !(Array.isArray(v) && !v.length)));
const porNome = (a, b) => a.localeCompare(b, 'pt-BR');

/** Uma pasta como o índice escreve: barras normais, sem espaço antes da barra nem barra no fim. O que o cadastro
    escreve quando não sabe o caminho (SEM_CAMINHO) não é pasta. */
export function pastaLimpa(v) {
  const t = texto(v);
  if (!t || SEM_CAMINHO.test(t)) return '';
  return t.replace(/\\/g, '/').replace(/\s+\//g, '/').replace(/\/+$/, '');
}

/* ---------- as pastas citadas no Teams ---------- */

// o caminho termina na quebra de linha ou em aspas, crase e <>
const FIM = `\\n\\r'"\`´‘’“”<>`;
// Mac '/Volumes/…', Mac com a barra invertida '\Volumes\…' ou Windows '\\servidor\…'
const CITADO = new RegExp(`(/Volumes/[^${FIM}]+|\\\\Volumes\\\\[^${FIM}]+|\\\\\\\\[A-Za-z0-9.-]+\\\\[^${FIM}]+)`, 'g');
const EXTENSOES = 'aep|aepx|aet|mov|mp4|m4v|mxf|avi|wav|mp3|aif|aiff|m4a|png|jpg|jpeg|gif|tif|tiff|exr|psd|psb|ai|eps|svg|pdf|jsx|jsxbin|txt|csv|json|zip|rar|ttf|otf|prproj|doc|docx|xls|xlsx|ppt|pptx';
// texto grudado depois do nome de um arquivo (mensagem sem crase/aspas): corta no fim da extensão ('.jsxO instalador…'
// → '.jsx'; 'ARTE.MOVIMENTO' fica: a extensão e o que vem depois na mesma caixa)
const GRUDADO = new RegExp(`^(.*?/[^/]*?\\.(?:${EXTENSOES})(?![a-z0-9])|.*?/[^/]*?\\.(?:${EXTENSOES.toUpperCase()})(?![A-Z0-9])).*$`);

/** As pastas citadas numa mensagem, como o índice escreve (o caminho de arquivo vira a pasta dele). */
export function pastasCitadas(conteudo) {
  return [...String(conteudo ?? '').matchAll(CITADO)].map(([bruto]) =>
    bruto
      .replace(/\\/g, '/')
      .replace(GRUDADO, '$1')
      .replace(/[\]).,;:\s]+$/, '')
      .replace(/\/+$/, '')
      .replace(/\/[^/]+\.[A-Za-z0-9]{2,5}$/, ''),
  );
}

/** A mesma pasta citada como Mac ou Windows, por qualquer servidor ou volume (-1 a -5): a mesma chave. */
const chaveDaPasta = (p) =>
  p
    .replace(/^\/\/[^/]+\//, '')
    .replace(/^\/Volumes\//i, '')
    .replace(/^([^/]+)-[1-5](\/|$)/, '$1$2')
    .toLowerCase();

const isoSemMs = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** As mensagens (as linhas da tabela) → o teams do índice: cada pasta uma vez, a citação mais recente primeiro. */
export function doTeams(linhas, agora = Date.now()) {
  const desde = agora - DIAS_DO_TEAMS * DIA;
  const porPasta = new Map();
  for (const m of linhas) {
    const t = Date.parse(texto(m.receivedDateTime));
    if (Number.isNaN(t) || t < desde) continue;
    for (const path of pastasCitadas(m.content)) {
      if (path.replace(/^\/+|\/+$/g, '').split('/').length < 3) continue;
      const k = chaveDaPasta(path);
      if (!porPasta.has(k) || porPasta.get(k).t < t) porPasta.set(k, { t, m, path });
    }
  }
  return [...porPasta.values()]
    .sort((a, b) => b.t - a.t)
    .map(({ t, m, path }) => semVazios({ from: texto(m.from), role: texto(m.jobTitle), at: isoSemMs(t), chat: texto(m.groupID), msg: texto(m.messageID), path }));
}

/* ---------- os filmes, as atrações e as Produções ---------- */

/** O cadastro dos filmes → um por título (o de key maior), com o output (o antigo, em texto, antes do calculado). */
export function dosFilmes(linhas) {
  const maior = (a, b) => {
    const [x, y] = [a.key, b.key].map((k) => (k == null || k === '' ? null : Number.isFinite(Number(k)) ? Number(k) : String(k)));
    if (x === y) return 0;
    if (x === null) return -1;
    if (y === null) return 1;
    return x < y ? -1 : 1;
  };
  const porTitulo = new Map();
  for (const l of linhas) {
    const name = texto(l.titulo);
    const out = pastaLimpa(l.output) || pastaLimpa(l.output_win) || pastaLimpa(l.output_mac);
    if (!name || !out) continue;
    const k = name.toUpperCase();
    if (!porTitulo.has(k) || maior(porTitulo.get(k).l, l) < 0) porTitulo.set(k, { l, f: semVazios({ name, year: texto(l.ano_de_producao), out }) });
  }
  return [...porTitulo.values()].map((x) => x.f).sort((a, b) => porNome(a.name, b.name));
}

/** O cadastro das atrações (Cadastros) → as atrações do índice. */
export function dasAtracoes(cadastro) {
  const campo = (caminhos, inicio) => pastaLimpa(Object.entries(caminhos ?? {}).find(([c]) => inicio.test(c.trim()))?.[1]);
  return cadastro
    .map((a) =>
      semVazios({
        name: texto(a.nome),
        cat: texto(a.categoria).toUpperCase(),
        pattern: (a.keys ?? []).map((k) => texto(k.key)).filter(Boolean),
        proj: campo(a.caminhos, /^projeto/i),
        out: campo(a.caminhos, /^output/i),
      }),
    )
    .filter((a) => a.name && (a.proj || a.out))
    .sort((a, b) => porNome(a.name, b.name));
}

/** As Produções (producoes.noIndice) → o trello do índice. A atração ligada ao nome do cadastro, quando é a mesma
    (sem caixa, acento e artigos): o Padeiro compara com o nome da atração do índice. */
export function doTrello(lista, cadastro = []) {
  const nomes = new Map(cadastro.map((a) => [nomeSemArtigos(a.nome), a.nome]));
  return lista
    .filter((c) => texto(c.claq))
    .map((c) =>
      semVazios({
        claq: texto(c.claq),
        red: texto(c.red),
        ed: texto(c.ed),
        card: texto(c.card),
        atr: nomes.get(nomeSemArtigos(c.atr ?? '')) ?? texto(c.atr),
        at: c.at ?? '',
        des: (c.designers ?? []).map(texto).filter(Boolean).join(', '),
        fim: !!c.fim,
        fil: !!c.fil,
        producao: texto(c.producao),
      }),
    );
}

/** O índice inteiro, com o stamp (muda só quando o conteúdo muda) e a hora em que foi montado. */
export function montarIndice({ teams, trello, atracoes, filmes }, agora = Date.now()) {
  const corpo = { teams, trello, atracoes, filmes };
  const stamp = createHash('md5').update(JSON.stringify(corpo)).digest('hex').slice(0, 10);
  return { v: 2, stamp, generated: isoSemMs(agora), ...corpo };
}

/**
 * O que o índice lê do Postgres do Teable (só leitura): os filmes e as mensagens do Teams. A tabela que a descoberta
 * não achou na base vem vazia. A leitura vale VALE_POR.
 * @param env o env dos módulos (TEABLE_PG_URL, TEABLE_PG_ESQUEMA e as tabelas descobertas)
 * @param deps.abrirPg abre o Postgres; deps.consultar (sql, params) => linhas (os testes)
 */
export function criarIndiceDoBuscar(env, { abrirPg = abrirPgPadrao, consultar = null, agora = () => Date.now() } = {}) {
  const esquema = nomesDoPg(env, '').esquema;
  const tabela = (nome) => (NOME_SQL.test(esquema) && tabelaNoPg(env, nome) ? `"${esquema}"."${tabelaNoPg(env, nome)}"` : '');
  const t = { filmes: tabela('filmes'), mensagens: tabela('mensagens') };
  const comBanco = !!(consultar || env.TEABLE_PG_URL);
  let banco = null;
  async function sql(texto, params = []) {
    if (consultar) return consultar(texto, params);
    banco ??= await abrirPg(env.TEABLE_PG_URL);
    return (await banco.query(texto, params)).rows;
  }
  let lido = null;
  return {
    /** → { filmes, teams } do índice; rejeita com o Postgres fora do ar. */
    async doTeable() {
      if (lido && agora() - lido.em < VALE_POR) return lido.dados;
      if (!comBanco) return { filmes: [], teams: [] };
      // to_jsonb: o output antigo e a key podem não existir na tabela (nos filmes novos, só o calculado)
      const [filmes, mensagens] = await Promise.all([
        t.filmes ? sql(`SELECT "titulo", "ano_de_producao", "output_win", "output_mac", to_jsonb(f)->>'output' AS "output", to_jsonb(f)->>'key' AS "key" FROM ${t.filmes} f WHERE "titulo" IS NOT NULL`) : [],
        t.mensagens
          ? sql(`SELECT "receivedDateTime", "from", "jobTitle", "groupID", "messageID", "content" FROM ${t.mensagens} WHERE "receivedDateTime"::timestamptz >= $1::timestamptz`, [new Date(agora() - DIAS_DO_TEAMS * DIA).toISOString()])
          : [],
      ]);
      const dados = { filmes: dosFilmes(filmes), teams: doTeams(mensagens, agora()) };
      lido = { em: agora(), dados };
      return dados;
    },
    parar: () => banco?.end?.().catch(() => {}),
  };
}
