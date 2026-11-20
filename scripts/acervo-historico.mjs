#!/usr/bin/env node
/*
 * Preenche o acervo de artes com o que já foi produzido: percorre a produção da arte (ARTE_producao) do mais
 * antigo para o mais novo e, para cada card finalizado ou entregue, registra as artes dele no acervo da atração.
 * Cada arte fica ligada à primeira claquete em que apareceu; as que já estão no acervo não se repetem.
 *
 * A contabilidade antiga não é exata (os checklists incluíam artes que já existiam), mas para o acervo isso não
 * importa: a arte que esteve num card finalizado da atração existe.
 *
 * Uso (com as mesmas variáveis do servidor: TEABLE_PG_URL, TEABLE_PG_ESQUEMA, TEABLE_PG_ARTE, TEABLE_PG_ATRACOES,
 * TEABLE_PG_ACERVO, TEABLE_ACERVO, TEABLE_URL, TEABLE_TOKEN):
 *   node scripts/acervo-historico.mjs                 mostra o que faria, sem gravar
 *   node scripts/acervo-historico.mjs --desde 2025-01-01 --gravar
 */
import { abrirPg, nomeLimpoPg, nomesDoPg } from '../servidor/pauta.mjs';
import { chaveDeArte, criarAcervo } from '../servidor/acervo.mjs';

const args = process.argv.slice(2);
const gravar = args.includes('--gravar');
const desde = args[args.indexOf('--desde') + 1] && args.includes('--desde') ? args[args.indexOf('--desde') + 1] : '2000-01-01';
const env = process.env;
const esquema = nomesDoPg(env, '').esquema;
const producao = `"${esquema}"."${nomeLimpoPg(env.TEABLE_PG_ARTE)}"`;
if (!env.TEABLE_PG_URL || !esquema || !env.TEABLE_PG_ARTE) {
  console.error('Faltam TEABLE_PG_URL, TEABLE_PG_ESQUEMA e TEABLE_PG_ARTE.');
  process.exit(1);
}
const banco = await abrirPg(env.TEABLE_PG_URL);
const consultar = async (sql, params = []) => (await banco.query(sql, params)).rows;
const acervo = criarAcervo(env, { consultar });
if (!acervo.ligado || (gravar && !acervo.grava)) {
  console.error('O acervo não está configurado: faltam TEABLE_PG_ACERVO (para ler) e TEABLE_ACERVO, TEABLE_URL, TEABLE_TOKEN (para gravar).');
  process.exit(1);
}

const titulo = (v) => {
  try {
    const x = typeof v === 'string' ? JSON.parse(v) : v;
    return (Array.isArray(x) ? x[0]?.title : x?.title) ?? '';
  } catch {
    return String(v ?? '');
  }
};
const finalizado = (l) => l.entregue || /FINALIZADO/i.test(String(l.status ?? ''));

const linhas = await consultar(
  `SELECT "card_ID", "claquete", "artes", "atracao", "status", "entregue", "data_entrada" FROM ${producao}
   WHERE "data_entrada" >= $1 ORDER BY "data_entrada" ASC NULLS LAST`,
  [desde],
);
const vistos = new Map(); // atração → chaves já contadas nesta rodada
let cards = 0;
let artes = 0;
for (const l of linhas.filter(finalizado)) {
  const atracao = titulo(l.atracao);
  const lista = String(l.artes ?? '').split(/\s*\|\s*|\n+/).map((a) => a.trim()).filter(Boolean);
  if (!atracao || !lista.length) continue;
  if (!vistos.has(atracao)) vistos.set(atracao, new Set((await acervo.daAtracao(atracao)).map((a) => a.chave)));
  const ja = vistos.get(atracao);
  const novas = lista.filter((a) => !ja.has(chaveDeArte(a)));
  if (!novas.length) continue;
  novas.forEach((a) => ja.add(chaveDeArte(a)));
  cards++;
  artes += new Set(novas.map(chaveDeArte)).size;
  console.log(`${atracao} · ${l.claquete}: ${novas.join(', ')}`);
  if (gravar) {
    try {
      await acervo.registrar({ atracao, card: l.card_ID, artes: novas });
    } catch (e) {
      console.warn(`  não gravei: ${e instanceof Error ? e.message : e}`);
    }
  }
}
console.log(`\n${artes} artes de ${cards} cards, em ${vistos.size} atrações.${gravar ? ' Gravado no acervo.' : ' Nada foi gravado (use --gravar).'}`);
await banco.end?.();
