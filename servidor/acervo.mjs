/*
 * Acervo de artes: o que cada atração já tem pronto. Uma linha por arte, ligada à atração e ao card
 * (produção da arte) em que foi pedida. Vale até trocar o pacote gráfico: aí as artes da atração são apagadas.
 *
 * Tabela ARTES_acervo no Teable: arte (texto), key (fórmula: a arte sem acento, caixa e pontuação, igual a
 * chaveDeArte), tipo (seleção; preenchido à mão ou por script, nunca pelo PROMeiro), atracao (vínculo → atrações),
 * claquete (vínculo → ARTE_producao), filme (texto: o filme, nas sessões).
 *
 * Sessões de filme (Tela Quente, Temperatura Máxima…) são diferentes: o pacote gráfico é do filme, não da sessão.
 * O HOJE de um filme não é o de outro, e vale para o mesmo filme em qualquer sessão. O filme sai do log do bot
 * (sessão + dia de exibição → key e ano do título), e o que ele tem pronto é:
 *   - tudo o que está nos checklists dos cards da prévia dele (os que o bot cria), usado ou não;
 *   - as artes dos cards de claquete do filme que já saíram (gravadas aqui com o campo filme).
 *
 * Sem acervo: as categorias genéricas, que juntam coisas de pacotes diferentes (ACERVO_FORA; por padrão VTs, EVENTOS,
 * Shows Diversos, Mood Mensal, Produções Estúdios Globo, Filmes Diversos). O que tem linguagem própria ganha uma
 * atração própria (VT Upfront 2026, Dezembro na Globo, o show tal) e, com ela, o seu acervo.
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
const FORA_PADRAO = 'VTs, VT, EVENTOS, Shows Diversos, Mood Mensal, Produções Estúdios Globo, Filmes Diversos';

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
const titulo = (v) => vinculos(v)[0]?.title ?? '';

/** O filme como ele fica gravado no acervo: a key do título e o ano ("A MUMIA 2017"); sem ano, só a key. */
export const nomeDoFilme = (f) => (f ? `${f.key}${Number(f.ano) > 0 ? ` ${Number(f.ano)}` : ''}` : '');

/**
 * @param env TEABLE_ACERVO (id da tabela, para gravar), TEABLE_PG_ACERVO (nome no Postgres, para ler),
 *   TEABLE_PG_URL, TEABLE_PG_ESQUEMA, TEABLE_PG_ATRACOES, TEABLE_PG_ARTE, TEABLE_URL, TEABLE_TOKEN,
 *   e para os filmes TEABLE_PG_FILMES_ESQUEMA, TEABLE_PG_SESSOES, TEABLE_PG_LOG_BOT
 * @param deps.consultar (sql, params) => linhas; deps.buscar fetch; deps.artesDoCard (card) => itens dos checklists
 */
export function criarAcervo(env, deps = {}) {
  const esquema = nomesDoPg(env, '').esquema;
  const tabela = (nome) => (esquema && nome ? `"${esquema}"."${nome}"` : null);
  const t = { acervo: tabela(nomeLimpoPg(env.TEABLE_PG_ACERVO)), atracoes: tabela(nomeLimpoPg(env.TEABLE_PG_ATRACOES)), producao: tabela(nomeLimpoPg(env.TEABLE_PG_ARTE)) };
  const filmes = nomeLimpoPg(env.TEABLE_PG_FILMES_ESQUEMA);
  const deFilmes = (nome) => (filmes && nomeLimpoPg(nome) ? `"${filmes}"."${nomeLimpoPg(nome)}"` : null);
  const sessoes = deFilmes(env.TEABLE_PG_SESSOES);
  const logBot = deFilmes(env.TEABLE_PG_LOG_BOT);
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
  const fora = new Set(String(env.ACERVO_FORA || FORA_PADRAO).split(',').map(nomeComparavel).filter(Boolean));
  /** Categoria genérica, sem acervo: cada coisa dentro dela tem o seu pacote (VTs, eventos, shows, moods…). */
  const semAcervo = (atracao) => fora.has(nomeComparavel(atracao));
  const grava = !!(api.url && api.token && api.tabela);

  // o acervo inteiro, guardado por 1 min (é pequeno: algumas centenas de artes por atração)
  let memo = { em: 0, linhas: null };
  let temFilme = true; // a coluna filme pode ainda não existir na tabela: aí lê sem ela
  async function todas() {
    if (!ligado) return [];
    if (memo.linhas && Date.now() - memo.em < 60_000) return memo.linhas;
    const ler = (comFilme) => consultar(`SELECT "__id" AS id, "arte", "key", "tipo", "atracao", "claquete"${comFilme ? ', "filme"' : ''} FROM ${t.acervo} LIMIT 50000`);
    let linhas;
    try {
      linhas = await ler(temFilme);
    } catch (e) {
      if (!temFilme || !/filme/i.test(String(e?.message ?? e))) throw e;
      temFilme = false;
      linhas = await ler(false);
    }
    memo = {
      em: Date.now(),
      linhas: linhas.map((l) => {
        const atr = vinculos(l.atracao)[0] ?? { id: '', title: '' };
        const prod = vinculos(l.claquete)[0] ?? { id: '', title: '' };
        // a chave sai da arte, aqui: o key do Teable é só para ver na tabela (e uma fórmula errada não estraga a revisão)
        return { id: l.id, arte: String(l.arte ?? ''), chave: chaveDeArte(l.arte), tipo: String(lerTipo(l.tipo) ?? ''), atracao: atr.title, atracaoId: atr.id, claquete: prod.title, producaoId: prod.id, filme: String(l.filme ?? '').trim() };
      }),
    };
    return memo.linhas;
  }
  const esquecer = () => (memo = { em: 0, linhas: null });
  const publica = ({ arte, chave, tipo, claquete }) => ({ arte, chave, tipo, claquete });

  // as sessões de filme, guardadas por 10 min; se a consulta falhar, ninguém é tratado como sessão
  let memoSessoes = { em: 0, nomes: null };
  async function ehSessao(atracao) {
    if (!sessoes || !consultar) return false;
    if (!memoSessoes.nomes || Date.now() - memoSessoes.em > 600_000) {
      try {
        const linhas = await consultar(`SELECT "sessao" FROM ${sessoes}`);
        memoSessoes = { em: Date.now(), nomes: new Set(linhas.map((l) => nomeComparavel(l.sessao)).filter(Boolean)) };
      } catch {
        return false;
      }
    }
    return memoSessoes.nomes.has(nomeComparavel(atracao));
  }

  /** O filme que a sessão exibe naquele dia, pelo log do bot: { key, ano, titulo } ou null. */
  async function filmeDe(atracao, data) {
    if (!logBot || !consultar || !atracao || !/^\d{4}-\d{2}-\d{2}/.test(String(data ?? ''))) return null;
    const linhas = await consultar(`SELECT "key", "ano_de_producao", "titulo", "sessao", "labels" FROM ${logBot} WHERE "data_de_exibicao"::date = $1::date`, [String(data).slice(0, 10)]);
    const l = linhas.find((x) => nomeComparavel(titulo(x.sessao)) === nomeComparavel(atracao) && x.key && !JSON.stringify(x.labels ?? '').includes('CANCELADO'));
    return l ? { key: String(l.key).trim(), ano: Number(l.ano_de_producao) || 0, titulo: String(l.titulo ?? '') } : null;
  }

  // o mesmo filme: a mesma key e, quando os dois lados têm ano, o mesmo ano (A MÚMIA de 1999 não é a de 2017)
  const mesmoFilme = (f, key, ano) => String(key ?? '').trim() === f.key && (!f.ano || !Number(ano) || Number(ano) === f.ano);

  // as artes da prévia, por card, guardadas por 10 min
  const memoPrevia = new Map();
  async function artesDaPrevia(card) {
    if (!deps.artesDoCard) return [];
    const m = memoPrevia.get(card);
    if (m && Date.now() - m.em < 600_000) return m.artes;
    const artes = await deps.artesDoCard(card);
    memoPrevia.set(card, { em: Date.now(), artes });
    return artes;
  }

  /** O que o filme já tem pronto: os checklists das prévias dele (em qualquer sessão) e as artes gravadas com ele. */
  async function doFilme(f) {
    if (!f) return [];
    const nome = nomeDoFilme(f);
    const saida = new Map();
    for (const l of await todas()) if (l.filme && (l.filme === nome || l.filme === f.key)) saida.set(l.chave, publica(l));
    if (logBot) {
      const exibicoes = (await consultar(`SELECT "key", "ano_de_producao", "sessao", "data_de_exibicao", "card_ID" FROM ${logBot} WHERE "key" = $1`, [f.key])).filter((l) => mesmoFilme(f, l.key, l.ano_de_producao) && l.card_ID);
      for (const l of exibicoes) {
        const dia = String(l.data_de_exibicao ?? '').slice(0, 10).split('-').reverse().slice(0, 2).join('/');
        const origem = `Prévia: ${titulo(l.sessao)} ${dia}`.trim();
        let artes = [];
        try {
          artes = await artesDaPrevia(l.card_ID);
        } catch (e) {
          console.warn(`[acervo] não li a prévia ${l.card_ID}: ${e instanceof Error ? e.message : e}`);
        }
        for (const arte of artes) {
          const chave = chaveDeArte(arte);
          if (chave && !saida.has(chave)) saida.set(chave, { arte, chave, tipo: '', claquete: origem });
        }
      }
    }
    return [...saida.values()];
  }

  /** As artes de uma atração (pelo nome). Sessão de filme não tem acervo próprio: ver paraRevisao. */
  async function daAtracao(atracao) {
    const n = nomeComparavel(atracao);
    if (!n || semAcervo(atracao) || (await ehSessao(atracao))) return [];
    return (await todas()).filter((l) => !l.filme && nomeComparavel(l.atracao) === n).map(publica);
  }

  /** O que já existe para o roteiro: o acervo da atração ou, numa sessão, o do filme daquele dia. */
  async function paraRevisao(atracao, data) {
    if (semAcervo(atracao)) return [];
    if (!(await ehSessao(atracao))) return daAtracao(atracao);
    return doFilme(await filmeDe(atracao, data));
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
   * O card saiu (finalizado/entregue): as artes novas dele entram no acervo da atração ou, numa sessão, do filme
   * do dia (data = exibição). As que já estão lá, não.
   * @returns quantas entraram
   */
  async function registrar({ atracao, data, card, artes }) {
    if (!ligado || !grava || !atracao || !artes?.length || semAcervo(atracao)) return 0;
    let filme = null;
    if (await ehSessao(atracao)) {
      filme = await filmeDe(atracao, data);
      if (!filme) return 0; // sem saber o filme, não dá para guardar
    }
    const [a] = t.atracoes ? await consultar(`SELECT "__id" AS id FROM ${t.atracoes} WHERE "atracao" = $1 LIMIT 1`, [atracao]) : [];
    if (!a?.id) throw new Error(`A atração ${atracao} não está nos cadastros.`);
    const [p] = card && t.producao ? await consultar(`SELECT "__id" AS id FROM ${t.producao} WHERE "card_ID" = $1 LIMIT 1`, [card]) : [];
    const ja = new Set((filme ? await doFilme(filme) : await daAtracao(atracao)).map((x) => x.chave));
    const vistas = new Set();
    const novas = artes
      .map((arte) => ({ arte: String(arte).trim(), chave: chaveDeArte(arte) }))
      .filter((x) => x.chave && !ja.has(x.chave) && !vistas.has(x.chave) && vistas.add(x.chave));
    if (!novas.length) return 0;
    await teable('POST', '', {
      fieldKeyType: 'name',
      typecast: true,
      records: novas.map((x) => ({ fields: { arte: x.arte, atracao: [{ id: a.id }], ...(p?.id ? { claquete: [{ id: p.id }] } : {}), ...(filme ? { filme: nomeDoFilme(filme) } : {}) } })),
    });
    esquecer();
    return novas.length;
  }

  /** Pacote gráfico novo: todas as artes da atração saem do acervo (apagadas). @returns quantas */
  async function zerar(atracao) {
    if (!ligado || !grava) throw new Error('O acervo de artes não está configurado (TEABLE_ACERVO e TEABLE_PG_ACERVO).');
    esquecer();
    const n = nomeComparavel(atracao);
    const ids = (await todas()).filter((l) => !l.filme && nomeComparavel(l.atracao) === n).map((l) => l.id);
    for (let i = 0; i < ids.length; i += 100)
      await teable('DELETE', '?' + ids.slice(i, i + 100).map((id, n) => `recordIds[${n}]=${encodeURIComponent(id)}`).join('&'));
    esquecer();
    return ids.length;
  }

  return { ligado, grava, semAcervo, ehSessao, filmeDe, doFilme, daAtracao, paraRevisao, registrar, zerar, parar: () => banco?.end?.().catch(() => {}) };
}
