/* A correção de grafia (#108) da pauta da edição: as propostas (#114), lidas da pauta inteira no Postgres do Teable (só
   SELECT), como a Semana da pauta. A pauta tem milhares de linhas: o Postgres separa as linhas com código de versão fora
   do padrão, conta e devolve uma página; a regra pura (propostaDaClaquete) faz a claquete no padrão e confirma cada
   linha. Cada proposta leva a hora da última mudança da linha (o "__last_modified_time" do Teable).
   Aplicar e desfazer (#115): pela API do Teable, só na base do PROMeiro (a tabela da pauta achada na base em que o
   PROMeiro trabalha; de outra base, a tela só mostra). Antes de gravar, a linha é lida de novo pela API: a que mudou
   depois da proposta (a hora da última mudança, ou a claquete) não é gravada. Só a claquete muda. O registro de cada
   correção aplicada (o que era e o que ficou) fica no SQLite (registro-de-correcoes.mjs); o desfazer daqui confere
   "mudou desde então" e grava o valor antigo de volta. */

import { tabelaNoPg } from './tabelas-do-teable.mjs';
import { ForaDaPauta, nomesDoPg } from './pauta.mjs';
import { linhaDaPauta } from '../src/modelo/pauta.ts';
import { propostaDaClaquete } from '../src/modelo/correcaoDeGrafia.ts';
import { chaveDaClaquete, chaveDaClaqueteNoPadrao } from '../src/modelo/vocabularios.ts';

const NOME = /^[A-Za-z0-9_]+$/;
/** Quantas propostas por página. */
export const POR_PAGINA = 50;
export const GRUPOS = ['corrigir', 'nao-reconhecido'];
/** Quantas propostas um pedido de aplicar leva (uma página inteira cabe). */
export const MAX_APLICAR = 100;
/** O tipo das correções da pauta no registro. */
export const TIPO_DA_PAUTA = 'pauta';
const REC = /^rec\w{1,40}$/;
const limpo = (v) => String(v ?? '').trim();
/** A hora como texto ISO (o Postgres devolve Date; a API, texto), ou null. */
const hora = (v) => {
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v ?? ''));
  return Number.isNaN(t) || v === null || v === undefined || v === '' ? null : new Date(t).toISOString();
};
/** A linha mudou depois desta hora? Sem uma das duas, não dá para saber pela hora (vale a claquete). */
const mudouDepois = (atual, vista) => !!(hora(atual) && hora(vista) && Date.parse(hora(atual)) > Date.parse(hora(vista)));

/** Por que uma correção não foi aplicada ou desfeita, na tela. */
export const TEXTOS = {
  mudou: 'A linha mudou desde a proposta: leia a pauta de novo.',
  'mudou-desde-entao': 'A linha mudou desde então no Teable: o valor antigo não foi gravado de volta.',
  sumiu: 'A linha não existe mais na pauta do Teable.',
  key: 'Espera a fórmula nova da key no Teable, que ainda não entende o (M).',
  base: 'A tabela da pauta da edição não está na base do PROMeiro: a correção só mostra as propostas.',
  teable: 'O Teable não está configurado para gravar (o endereço e o token).',
};
/** As letras com acento e sem ele, na mesma ordem (o Postgres do Teable pode não ter a extensão unaccent). */
const ACENTOS = 'áàâãäéèêëíìîïóòôõöúùûüÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜ';
const SEM_ACENTOS = 'aaaaaeeeeiiiiooooouuuuAAAAAEEEEIIIIOOOOOUUUU';

/**
 * As linhas da pauta com um código de versão, cada uma no seu grupo, na mesma leitura da regra das versões (lerVersoes):
 * o código entre parênteses no fim ou, depois da data, a última palavra. "corrigir" é o código conhecido fora do padrão
 * (o padrão é a letra maiúscula entre parênteses, sem espaço dentro, ou MNT); "nao-reconhecido" é o código desconhecido
 * entre parênteses numa claquete (o nome e a data antes). O aviso (a caixinha de anotação) é um recado: fica de fora.
 */
const sqlDosGrupos = (esquema, tabela) => `WITH c AS MATERIALIZED (
    SELECT t."__id" AS id, btrim(to_jsonb(t)->>'claquete') AS claquete, t."editor", t."data", t."expediente_inicio",
      t."anotacao", t."__auto_number", t."__last_modified_time"
    FROM "${esquema}"."${tabela}" t
    WHERE coalesce(to_jsonb(t)->>'anotacao', '') <> 'true'
  ), v0 AS (
    SELECT c.*, CASE
        WHEN c.claquete ~ '\\)$' THEN btrim(substring(c.claquete from '\\(([^()]*)\\)$'))
        WHEN c.claquete ~ '[0-9]{1,2}/[0-9]{1,2}.*\\s\\S+$' THEN substring(c.claquete from '\\s(\\S+)$')
      END AS codigo
    FROM c
  ), v AS MATERIALIZED (
    -- o código sem acento e em maiúsculas, para comparar ("Mês" é MES)
    SELECT v0.*, upper(translate(v0.codigo, '${ACENTOS}', '${SEM_ACENTOS}')) AS lido FROM v0
  ), g AS (
    SELECT v.*, CASE
        WHEN coalesce(v.codigo, '') = '' THEN NULL
        WHEN v.lido ~ '^(DIA|MES|MNT|[AHNPDM]{1,6})$' AND v.lido !~ '(.).*\\1' THEN
          CASE WHEN v.codigo ~ '^(MNT|[AHNPDM]{1,6})$' AND right(v.claquete, length(v.codigo) + 2) = '(' || v.codigo || ')' THEN NULL ELSE 'corrigir' END
        WHEN v.claquete ~ '[[:alpha:]].*[0-9]{1,2}/[0-9]{1,2}[^()]*\\([^()]*\\)$' THEN 'nao-reconhecido'
      END AS grupo
    FROM v
  )`;

/**
 * @param env o env dos módulos de agora (o Postgres, o Teable e a tabela da pauta descoberta na base)
 * @param abrir abre o Postgres do Teable
 * @param o.buscar fetch (o Teable de verdade ou um falso), para aplicar e desfazer
 */
export function criarCorrecoes(env, abrir, { buscar = fetch } = {}) {
  const { esquema, tabela } = nomesDoPg(env, tabelaNoPg(env, 'EDICAO_producao'));
  const comBanco = !!(env.TEABLE_PG_URL && NOME.test(esquema) && NOME.test(tabela));
  const grupos = sqlDosGrupos(esquema, tabela);
  const sqlDaContagem = `${grupos}
    SELECT count(*) FILTER (WHERE g.grupo = 'corrigir')::int AS corrigir, count(*) FILTER (WHERE g.grupo = 'nao-reconhecido')::int AS nao_reconhecido FROM g`;
  // a mais recente primeiro; a ordem de criação desempata, para a página não mudar de uma leitura para a outra
  const sqlDaPagina = `${grupos}
    SELECT g.id, g.claquete, g."editor", g."data", g."expediente_inicio", g."anotacao", g."__last_modified_time" FROM g
    WHERE g.grupo = $1
    ORDER BY g."data" DESC NULLS LAST, g."__auto_number" DESC
    LIMIT $2 OFFSET $3`;
  let banco = null;

  /** O grupo da linha pela regra pura: a claquete no padrão, ou o código desconhecido (só numa claquete). */
  function proposta(bruta) {
    const l = linhaDaPauta({ ...bruta, id: bruta.id ?? bruta.__id });
    if (!l || l.tipo === 'aviso') return null;
    const p = propostaDaClaquete(l.texto);
    if (!p || (p.tipo === 'nao-reconhecido' && l.tipo !== 'claquete')) return null;
    const base = { id: l.id, dia: l.dia, editor: l.editor, de: p.de, mudouEm: hora(bruta.__last_modified_time ?? bruta.lastModifiedTime) };
    if (p.tipo !== 'corrigir') return { grupo: 'nao-reconhecido', ...base, codigo: p.codigo };
    // a fórmula da key no Teable (a de chaveDaClaquete) ainda não tira o (M): gravar mudaria a key da linha
    const esperaAKey = chaveDaClaquete(p.para) !== chaveDaClaqueteNoPadrao(p.para);
    return { grupo: 'corrigir', ...base, para: p.para, ...(esperaAKey ? { esperaAKey } : {}) };
  }

  /* ---------- a escrita no Teable (#115) ---------- */
  const doTeable = () => ({ url: limpo(env.TEABLE_URL).replace(/\/+$/, ''), token: limpo(env.TEABLE_TOKEN || env.TEABLE_TOKEN_ESCRITA), tabela: env.tabelas?.EDICAO_producao ?? null });
  /** Pode gravar? Só com o Teable configurado e a tabela da pauta achada na base do PROMeiro. */
  function escrita() {
    const { url, token, tabela } = doTeable();
    if (!tabela?.id || !limpo(env.TEABLE_PG_ESQUEMA) || tabela.esquema !== limpo(env.TEABLE_PG_ESQUEMA)) return { pode: false, aviso: TEXTOS.base };
    if (!url || !token) return { pode: false, aviso: TEXTOS.teable };
    return { pode: true };
  }
  /** Um pedido à API do Teable, na tabela da pauta; null é 404 (a linha não existe). */
  async function pedir(metodo, registro, corpo) {
    const { url, token, tabela } = doTeable();
    const r = await buscar(`${url}/api/table/${encodeURIComponent(tabela.id)}/record/${encodeURIComponent(registro)}${metodo === 'GET' ? '?fieldKeyType=name' : ''}`, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'o token do Teable não tem permissão para gravar na pauta da edição' : `o Teable respondeu ${r.status}`);
    return r.json().catch(() => ({}));
  }
  const gravarClaquete = (registro, claquete) => pedir('PATCH', registro, { fieldKeyType: 'name', typecast: true, record: { fields: { claquete } } });

  /**
   * Aplica as propostas marcadas, uma por vez: lê a linha de novo, confere que não mudou desde a proposta (a hora da
   * última mudança e a claquete), grava a claquete no padrão (a da regra, nunca a do pedido) e registra.
   * @param pedidas [{ id, de, mudouEm }] como a tela leu; por o e-mail de quem aplica
   * @param registro o registro das correções (registrar)
   * @returns { certas: [{ id, registro, de, para }], falhas: [{ id, de, motivo, texto }] }
   */
  async function aplicar(pedidas, por, registro) {
    const certas = [];
    const falhas = [];
    for (const pedida of pedidas) {
      const falha = (motivo, texto = TEXTOS[motivo]) => falhas.push({ id: pedida.id, de: pedida.de, motivo, texto });
      try {
        const atual = await pedir('GET', pedida.id);
        if (!atual) {
          falha('sumiu');
          continue;
        }
        const p = proposta({ ...(atual.fields ?? {}), id: pedida.id });
        if (p?.grupo !== 'corrigir' || p.de !== limpo(pedida.de) || mudouDepois(atual.lastModifiedTime, pedida.mudouEm)) {
          falha('mudou');
          continue;
        }
        if (p.esperaAKey) {
          falha('key');
          continue;
        }
        const antes = { claquete: String(atual.fields.claquete ?? ''), mudouEm: hora(atual.lastModifiedTime) };
        const gravada = await gravarClaquete(pedida.id, p.para);
        if (!gravada) {
          falha('sumiu');
          continue;
        }
        const id = registro.registrar({
          tipo: TIPO_DA_PAUTA,
          alvo: pedida.id,
          antes,
          depois: { claquete: p.para, mudouEm: hora(gravada.lastModifiedTime) },
          detalhes: { dia: p.dia, editor: p.editor },
          por,
        });
        certas.push({ id: pedida.id, registro: id, de: p.de, para: p.para });
      } catch (e) {
        console.warn(`[correcoes] não gravei ${pedida.id}: ${e instanceof Error ? e.message : e}`);
        falha('erro', `Não gravei no Teable: ${e instanceof Error ? e.message : e}.`);
      }
    }
    return { certas, falhas };
  }

  /**
   * O desfazer de uma correção da pauta (o do registro): a linha tem de estar como a correção deixou (a claquete e a
   * hora da última mudança); então a claquete antiga volta. @returns null (desfeita) ou { motivo, texto }
   */
  async function desfazer(c) {
    const pode = escrita();
    if (!pode.pode) return { motivo: 'base', texto: pode.aviso };
    const atual = await pedir('GET', c.alvo);
    if (!atual) return { motivo: 'sumiu', texto: TEXTOS.sumiu };
    if (limpo(atual.fields?.claquete) !== c.depois.claquete || mudouDepois(atual.lastModifiedTime, c.depois.mudouEm)) return { motivo: 'mudou', texto: TEXTOS['mudou-desde-entao'] };
    if (!(await gravarClaquete(c.alvo, c.antes.claquete))) return { motivo: 'sumiu', texto: TEXTOS.sumiu };
    return null;
  }

  /**
   * Uma página de um grupo e quantas propostas há em cada um.
   * @param grupo 'corrigir' ou 'nao-reconhecido'; pagina a partir de 1
   */
  async function propostas({ grupo, pagina }) {
    if (!comBanco) throw new ForaDaPauta('A pauta da edição é lida do Postgres do Teable, que não está ligado (TEABLE_PG_URL e a tabela EDICAO_producao na base).');
    let contagem;
    let rows;
    try {
      banco ??= await abrir(env.TEABLE_PG_URL);
      contagem = (await banco.query(sqlDaContagem)).rows[0];
      ({ rows } = await banco.query(sqlDaPagina, [grupo, POR_PAGINA, (pagina - 1) * POR_PAGINA]));
    } catch (e) {
      console.error('[correcoes] o Postgres não respondeu às propostas da pauta:', e.message);
      throw new ForaDaPauta('O Postgres do Teable não respondeu. Tente de novo em instantes.');
    }
    // o Postgres de mentira dos testes não olha o WHERE, a página nem a contagem: a regra confirma cada linha aqui, e
    // a contagem, sem a do banco, sai das linhas
    const lidas = rows.map(proposta).filter(Boolean);
    const contadas = Number.isInteger(contagem?.corrigir) && Number.isInteger(contagem?.nao_reconhecido);
    const resumo = contadas
      ? { corrigir: contagem.corrigir, naoReconhecido: contagem.nao_reconhecido }
      : { corrigir: lidas.filter((p) => p.grupo === 'corrigir').length, naoReconhecido: lidas.filter((p) => p.grupo === 'nao-reconhecido').length };
    const doGrupo = lidas
      .filter((p) => p.grupo === grupo)
      .slice(0, POR_PAGINA)
      .map(({ grupo: _, ...p }) => p);
    return { grupo, pagina, porPagina: POR_PAGINA, resumo, escrita: escrita(), propostas: doGrupo };
  }

  return {
    comBanco,
    propostas,
    escrita,
    aplicar,
    desfazer,
    parar: () => {
      const b = banco;
      banco = null;
      return b?.end?.().catch(() => {});
    },
  };
}

/** As propostas de um pedido de aplicar: de 1 a 100, cada uma com o id da linha, a claquete lida e a hora; ou null. */
export function propostasParaAplicar(v) {
  if (!Array.isArray(v) || !v.length || v.length > MAX_APLICAR) return null;
  const ok = v.every((p) => p && typeof p.id === 'string' && REC.test(p.id) && typeof p.de === 'string' && p.de.length <= 500 && (p.mudouEm === null || p.mudouEm === undefined || typeof p.mudouEm === 'string'));
  return ok ? v.map((p) => ({ id: p.id, de: p.de, mudouEm: p.mudouEm ?? null })) : null;
}
