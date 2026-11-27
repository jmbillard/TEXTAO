/* A correção de grafia (#108), só leitura nesta fatia (#114): as propostas da pauta da edição, lidas da pauta inteira
   no Postgres do Teable (só SELECT), como a Semana da pauta. A pauta tem milhares de linhas: o Postgres separa as
   linhas com código de versão fora do padrão, conta e devolve uma página; a regra pura (propostaDaClaquete) faz a
   claquete no padrão e confirma cada linha. */

import { tabelaNoPg } from './tabelas-do-teable.mjs';
import { ForaDaPauta, nomesDoPg } from './pauta.mjs';
import { linhaDaPauta } from '../src/modelo/pauta.ts';
import { propostaDaClaquete } from '../src/modelo/correcaoDeGrafia.ts';

const NOME = /^[A-Za-z0-9_]+$/;
/** Quantas propostas por página. */
export const POR_PAGINA = 50;
export const GRUPOS = ['corrigir', 'nao-reconhecido'];
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
      t."anotacao", t."__auto_number"
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

export function criarCorrecoes(env, abrir) {
  const { esquema, tabela } = nomesDoPg(env, tabelaNoPg(env, 'EDICAO_producao'));
  const comBanco = !!(env.TEABLE_PG_URL && NOME.test(esquema) && NOME.test(tabela));
  const grupos = sqlDosGrupos(esquema, tabela);
  const sqlDaContagem = `${grupos}
    SELECT count(*) FILTER (WHERE g.grupo = 'corrigir')::int AS corrigir, count(*) FILTER (WHERE g.grupo = 'nao-reconhecido')::int AS nao_reconhecido FROM g`;
  // a mais recente primeiro; a ordem de criação desempata, para a página não mudar de uma leitura para a outra
  const sqlDaPagina = `${grupos}
    SELECT g.id, g.claquete, g."editor", g."data", g."expediente_inicio", g."anotacao" FROM g
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
    const base = { id: l.id, dia: l.dia, editor: l.editor, de: p.de };
    return p.tipo === 'corrigir' ? { grupo: 'corrigir', ...base, para: p.para } : { grupo: 'nao-reconhecido', ...base, codigo: p.codigo };
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
    return { grupo, pagina, porPagina: POR_PAGINA, resumo, propostas: doGrupo };
  }

  return {
    comBanco,
    propostas,
    parar: () => {
      const b = banco;
      banco = null;
      return b?.end?.().catch(() => {});
    },
  };
}
