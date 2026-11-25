/* O redator provável de um roteiro que chegou sem redator, pelas últimas claquetes da atração na produção da arte
   (ARTE_producao), lidas do Postgres do Teable (só leitura). É uma das duas fontes da sugestão de redator; a outra, o
   texto do roteiro, fica no navegador (src/modelo/redator.ts). Sem TEABLE_PG_URL ou TEABLE_PG_ARTE, não sugere. */

import { abrirPg, nomeLimpoPg, nomesDoPg } from './pauta.mjs';

/** A regra: as últimas 5 claquetes da atração, na mesma praça, nos últimos 60 dias; sugere quem tiver pelo menos 3. */
const ULTIMAS = 5;
const MINIMO = 3;
const DIAS = 60;
/** Quantas linhas da atração o banco devolve, antes da praça e da janela (que ficam na regra, para testar). */
const LINHAS = 60;
const VALIDADE_MS = 5 * 60 * 1000;

const titulo = (v) => {
  if (!v) return '';
  if (typeof v === 'string') {
    try {
      return titulo(JSON.parse(v));
    } catch {
      return v.trim();
    }
  }
  if (Array.isArray(v)) return titulo(v[0]);
  return String(v.title ?? v.name ?? '').trim();
};
const comparavel = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * A regra do histórico, pura. `linhas`: as claquetes da atração ({ redator, praca, em }), em qualquer ordem. Só contam
 * as da mesma praça (sem praça, todas), dos últimos 60 dias e com redator; das 5 mais recentes, quem tiver pelo menos
 * 3 é o provável. Empate ou mistura: null.
 * @returns {{ nome: string, vezes: number, de: number } | null}
 */
export function redatorDoHistorico(linhas, { praca = '', hoje = new Date() } = {}) {
  const desde = hoje.getTime() - DIAS * 86_400_000;
  const p = comparavel(praca);
  const ultimas = (linhas ?? [])
    .map((l) => ({ nome: titulo(l.redator), praca: comparavel(titulo(l.praca)), em: new Date(l.em ?? 0).getTime() }))
    .filter((l) => l.nome && Number.isFinite(l.em) && l.em >= desde && l.em <= hoje.getTime() + 86_400_000 && (!p || l.praca === p))
    .sort((a, b) => b.em - a.em)
    .slice(0, ULTIMAS);
  const conta = new Map();
  for (const l of ultimas) conta.set(l.nome, (conta.get(l.nome) ?? 0) + 1);
  const ordem = [...conta].sort((a, b) => b[1] - a[1]);
  if (!ordem.length || ordem[0][1] < MINIMO || ordem[1]?.[1] === ordem[0][1]) return null;
  return { nome: ordem[0][0], vezes: ordem[0][1], de: ultimas.length };
}

/**
 * @param env TEABLE_PG_URL, TEABLE_PG_ESQUEMA e TEABLE_PG_ARTE (a ARTE_producao no Postgres)
 * @param deps.consultar (sql, params) => linhas; sem ele, abre o Postgres de TEABLE_PG_URL. deps.agora () => Date
 */
export function criarRedatorProvavel(env, deps = {}) {
  const { esquema } = nomesDoPg(env, '');
  const tabela = esquema && nomeLimpoPg(env.TEABLE_PG_ARTE) ? `"${esquema}"."${nomeLimpoPg(env.TEABLE_PG_ARTE)}"` : null;
  let banco = null;
  const consultar =
    deps.consultar ??
    (env.TEABLE_PG_URL
      ? async (sql, params = []) => {
          banco ??= await abrirPg(env.TEABLE_PG_URL);
          return (await banco.query(sql, params)).rows;
        }
      : null);
  const agora = deps.agora ?? (() => new Date());
  const ligado = !!(consultar && tabela);
  // a resposta de cada atração e praça, por 5 minutos: a fila sobe vários roteiros da mesma atração de uma vez
  const memo = new Map();

  // to_jsonb: o vínculo da atração (lista de { id, title }) e a data de entrada, tolerando a coluna que faltar
  const sql = `SELECT to_jsonb(t)->'redator' AS redator, to_jsonb(t)->>'praca' AS praca,
      COALESCE(to_jsonb(t)->>'data_entrada', to_jsonb(t)->>'__created_time') AS em
    FROM ${tabela} t
    WHERE (to_jsonb(t)->'atracao') @> jsonb_build_array(jsonb_build_object('title', $1::text))
    ORDER BY COALESCE(to_jsonb(t)->>'data_entrada', to_jsonb(t)->>'__created_time') DESC NULLS LAST
    LIMIT ${LINHAS}`;

  return {
    ligado,
    /** O redator provável da atração naquela praça, ou null (sem configuração, sem histórico, banco fora do ar). */
    async provavel(atracao, praca = '') {
      const a = String(atracao ?? '').trim();
      if (!ligado || !a) return null;
      const chave = `${comparavel(a)}|${comparavel(praca)}`;
      const guardado = memo.get(chave);
      const agoraMs = agora().getTime();
      if (guardado && agoraMs - guardado.em < VALIDADE_MS) return guardado.redator;
      try {
        const linhas = await consultar(sql, [a]);
        const redator = redatorDoHistorico(linhas, { praca, hoje: agora() });
        memo.set(chave, { em: agoraMs, redator });
        return redator;
      } catch (e) {
        console.warn(`[redator] não li o histórico da atração: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    },
  };
}
