/*
 * Acervo de artes: o que cada atração já tem pronto. Uma linha por arte, ligada à atração e ao card
 * (produção da arte) em que foi pedida. Vale até trocar o pacote gráfico: aí as artes da atração são apagadas.
 *
 * Tabela ARTES_acervo no Teable: arte (texto), key (texto), tipo (seleção; preenchido à mão ou por script,
 * nunca pelo PROMeiro), atracao (vínculo → atrações), claquete (vínculo → ARTE_producao).
 *
 * Lê pelo Postgres do Teable (só leitura) e grava pela API (TEABLE_TOKEN).
 */
import { abrirPg, nomeLimpoPg, nomesDoPg } from './pauta.mjs';

/** A arte do jeito de comparar: sem acento, sem caixa, sem pontuação nas pontas, espaços simples. */
export function chaveDeArte(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
const nomeComparavel = (s) => chaveDeArte(s);

// vínculo do Teable no Postgres: lista (ou objeto, ou texto JSON) com { id, title }
function vinculos(v) {
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    try {
      return vinculos(JSON.parse(v));
    } catch {
      return [{ id: '', title: v }];
    }
  }
  if (Array.isArray(v)) return v.flatMap(vinculos);
  if (typeof v === 'object') return [{ id: v.id ?? '', title: v.title ?? v.name ?? '' }];
  return [{ id: '', title: String(v) }];
}
const lerTipo = (v) => (Array.isArray(v) ? v[0] : typeof v === 'string' && v.startsWith('[') ? (JSON.parse(v)[0] ?? '') : v) || '';

/**
 * @param env TEABLE_ACERVO (id da tabela, para gravar), TEABLE_PG_ACERVO (nome no Postgres, para ler),
 *   TEABLE_PG_URL, TEABLE_PG_ESQUEMA, TEABLE_PG_ATRACOES, TEABLE_PG_ARTE, TEABLE_URL, TEABLE_TOKEN
 * @param deps.consultar (sql, params) => linhas; deps.buscar fetch
 */
export function criarAcervo(env, deps = {}) {
  const esquema = nomesDoPg(env, '').esquema;
  const tabela = (nome) => (esquema && nome ? `"${esquema}"."${nome}"` : null);
  const t = { acervo: tabela(nomeLimpoPg(env.TEABLE_PG_ACERVO)), atracoes: tabela(nomeLimpoPg(env.TEABLE_PG_ATRACOES)), producao: tabela(nomeLimpoPg(env.TEABLE_PG_ARTE)) };
  const api = { url: (env.TEABLE_URL || '').replace(/\/+$/, ''), token: env.TEABLE_TOKEN || env.TEABLE_TOKEN_ESCRITA || '', tabela: env.TEABLE_ACERVO || '' };
  const buscar = deps.buscar ?? fetch;
  let banco = null;
  const consultar =
    deps.consultar ??
    (env.TEABLE_PG_URL
      ? async (sql, params = []) => {
          banco ??= await abrirPg(env.TEABLE_PG_URL);
          return (await banco.query(sql, params)).rows;
        }
      : null);
  const ligado = !!(consultar && t.acervo);
  const grava = !!(api.url && api.token && api.tabela);

  // o acervo inteiro, guardado por 1 min (é pequeno: algumas centenas de artes por atração)
  let memo = { em: 0, linhas: null };
  async function ativas() {
    if (!ligado) return [];
    if (memo.linhas && Date.now() - memo.em < 60_000) return memo.linhas;
    const linhas = await consultar(`SELECT "__id" AS id, "arte", "key", "tipo", "atracao", "claquete" FROM ${t.acervo} LIMIT 50000`);
    memo = {
      em: Date.now(),
      linhas: linhas.map((l) => {
        const atr = vinculos(l.atracao)[0] ?? { id: '', title: '' };
        const prod = vinculos(l.claquete)[0] ?? { id: '', title: '' };
        return { id: l.id, arte: String(l.arte ?? ''), chave: l.key ? String(l.key) : chaveDeArte(l.arte), tipo: String(lerTipo(l.tipo) ?? ''), atracao: atr.title, atracaoId: atr.id, claquete: prod.title, producaoId: prod.id };
      }),
    };
    return memo.linhas;
  }
  const esquecer = () => (memo = { em: 0, linhas: null });

  /** As artes de uma atração (pelo nome). */
  async function daAtracao(atracao) {
    const n = nomeComparavel(atracao);
    if (!n) return [];
    return (await ativas()).filter((l) => nomeComparavel(l.atracao) === n).map(({ arte, chave, tipo, claquete }) => ({ arte, chave, tipo, claquete }));
  }

  async function teable(metodo, caminho, corpo) {
    const r = await buscar(`${api.url}/api/table/${encodeURIComponent(api.tabela)}/record${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${api.token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`Teable respondeu ${r.status} no acervo: ${(await r.text().catch(() => '')).slice(0, 160)}`);
    return r.json().catch(() => ({}));
  }

  /**
   * O card saiu (finalizado/entregue): as artes novas dele entram no acervo da atração. As que já estão lá, não.
   * @returns quantas entraram
   */
  async function registrar({ atracao, card, artes }) {
    if (!ligado || !grava || !atracao || !artes?.length) return 0;
    const [a] = t.atracoes ? await consultar(`SELECT "__id" AS id FROM ${t.atracoes} WHERE "atracao" = $1 LIMIT 1`, [atracao]) : [];
    if (!a?.id) throw new Error(`A atração ${atracao} não está nos cadastros.`);
    const [p] = card && t.producao ? await consultar(`SELECT "__id" AS id FROM ${t.producao} WHERE "card_ID" = $1 LIMIT 1`, [card]) : [];
    const ja = new Set((await daAtracao(atracao)).map((x) => x.chave));
    const vistas = new Set();
    const novas = artes
      .map((arte) => ({ arte: String(arte).trim(), chave: chaveDeArte(arte) }))
      .filter((x) => x.chave && !ja.has(x.chave) && !vistas.has(x.chave) && vistas.add(x.chave));
    if (!novas.length) return 0;
    await teable('POST', '', {
      fieldKeyType: 'name',
      typecast: true,
      records: novas.map((x) => ({ fields: { arte: x.arte, key: x.chave, atracao: [{ id: a.id }], ...(p?.id ? { claquete: [{ id: p.id }] } : {}) } })),
    });
    esquecer();
    return novas.length;
  }

  /** Pacote gráfico novo: todas as artes da atração saem do acervo (apagadas). @returns quantas */
  async function zerar(atracao) {
    if (!ligado || !grava) throw new Error('O acervo de artes não está configurado (TEABLE_ACERVO e TEABLE_PG_ACERVO).');
    esquecer();
    const n = nomeComparavel(atracao);
    const ids = (await ativas()).filter((l) => nomeComparavel(l.atracao) === n).map((l) => l.id);
    for (let i = 0; i < ids.length; i += 100)
      await teable('DELETE', '?' + ids.slice(i, i + 100).map((id, n) => `recordIds[${n}]=${encodeURIComponent(id)}`).join('&'));
    esquecer();
    return ids.length;
  }

  return { ligado, grava, daAtracao, registrar, zerar, parar: () => banco?.end?.().catch(() => {}) };
}
