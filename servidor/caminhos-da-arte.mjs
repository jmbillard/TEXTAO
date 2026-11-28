/* Os caminhos da arte (#202): a pasta de saída e o projeto de cada Produção, do registro do projeto do Padeiro (a tabela
   `projetos` da base do PROMeiro, #144), lido no Postgres do Teable (só leitura). A ligação é pelo card: a Produção tem o
   card dela (card_id) e o registro guarda o card do envio (card_ID). Com vários registros do card, vale o mais novo de
   cada caminho (src/modelo/caminhosDaArte.ts). Sem a tabela, sem o Postgres ou com ele fora do ar, nenhum caminho: a
   tela não mostra nada (e nada quebra). */
import { abrirPg as abrirPgPadrao, nomesDoPg } from './pauta.mjs';
import { tabelaNoPg } from './tabelas-do-teable.mjs';
import { caminhosPorCard } from '../src/modelo/caminhosDaArte.ts';

const NOME_SQL = /^[A-Za-z0-9_]+$/;
/** Quanto tempo vale a lista dos servidores (os caminhos de rede de todos os registros, para o Windows do Mac). */
const SERVIDORES_VALEM_POR = 5 * 60_000;
/** Quantos caminhos de rede dos registros mais novos ensinam o servidor de cada volume. */
const CONHECIDOS = 300;

const texto = (v) => (v === null || v === undefined || typeof v === 'object' ? '' : String(v));

/**
 * @param env a configuração de agora (TEABLE_PG_URL, TEABLE_PG_ESQUEMA e as tabelas descobertas)
 * @returns { dosCards(cards) → { card: CaminhosDaArte } (só os que têm; nunca lança), parar }
 */
export function criarCaminhosDaArte(env, { abrirPg = abrirPgPadrao, agora = () => Date.now() } = {}) {
  const { esquema, tabela: nome } = nomesDoPg(env, tabelaNoPg(env, 'projetos'));
  const tabela = env.TEABLE_PG_URL && NOME_SQL.test(esquema) && NOME_SQL.test(nome) ? `"${esquema}"."${nome}"` : '';
  let banco = null;
  let servidores = null;
  let avisou = false;
  async function sql(t, params = []) {
    banco ??= await abrirPg(env.TEABLE_PG_URL);
    return (await banco.query(t, params)).rows;
  }
  async function conhecidos() {
    if (servidores && agora() - servidores.em < SERVIDORES_VALEM_POR) return servidores.caminhos;
    const linhas = await sql(`SELECT "aep", "output", "data" FROM ${tabela} WHERE left("aep", 2) = ANY($1::text[]) OR left("output", 2) = ANY($1::text[]) ORDER BY "data" DESC NULLS LAST LIMIT ${CONHECIDOS}`, [['\\\\', '//']]);
    const caminhos = linhas.flatMap((l) => [texto(l.aep), texto(l.output)]).filter((c) => /^(\\\\|\/\/)/.test(c));
    servidores = { em: agora(), caminhos };
    return caminhos;
  }
  return {
    async dosCards(cards) {
      const pedidos = [...new Set((cards ?? []).filter((c) => typeof c === 'string' && c))];
      if (!tabela || !pedidos.length) return {};
      try {
        const [linhas, outros] = await Promise.all([sql(`SELECT "card_ID", "aep", "output", "data" FROM ${tabela} WHERE "card_ID" = ANY($1::text[])`, [pedidos]), conhecidos()]);
        const registros = linhas.map((l) => ({ card: texto(l.card_ID), aep: texto(l.aep), output: texto(l.output), data: l.data instanceof Date ? l.data.toISOString() : texto(l.data) }));
        avisou = false;
        return caminhosPorCard(registros, pedidos, outros);
      } catch (e) {
        if (!avisou) console.warn(`[caminhos da arte] não deu para ler os projetos do Padeiro: ${e instanceof Error ? e.message : e}`);
        avisou = true;
        return {};
      }
    },
    parar: () => banco?.end?.().catch(() => {}),
  };
}
