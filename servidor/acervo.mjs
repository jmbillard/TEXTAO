/*
 * Acervo de artes: o que cada atração já tem pronto. Uma linha por arte, ligada à atração e ao card
 * (produção da arte) em que foi pedida. Vale até trocar o pacote gráfico: aí as artes da atração são apagadas.
 *
 * Tabela ARTES_acervo: arte (texto), key (fórmula, só para ver: o app calcula a sua), tipo (seleção; à mão, nunca
 * pelo PROMeiro), atracao (vínculo → atracoes), claquete (vínculo → ARTE_producao), filme (vínculo → filmes).
 *
 * O acervo da atração (campo acervo em atracoes) diz como o acervo funciona:
 *   próprio (vazio também vale próprio): as artes são da atração.
 *   do filme: o pacote gráfico é do filme, em qualquer sessão. Pela sessão e pelo dia, exibicoes diz o filme; o que ele
 *     tem pronto são os checklists das prévias dele (o card_ID de cada exibição, usado ou não) e as artes gravadas com
 *     ele aqui.
 *   sem acervo (VTs, EVENTOS, Shows Diversos…): o que tem linguagem própria ganha atração própria.
 *
 * Lê pelo Postgres do Teable (só leitura) e grava pela API (TEABLE_TOKEN).
 */
import { acervoDaAtracao } from './cadastros.mjs';
import { abrirPg, nomeLimpoPg, nomesDoPg } from './pauta.mjs';
import { chaveDoTitulo } from './titulo.mjs';
import { nivelDeComplexidade } from './trello.mjs';

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
export function vinculos(v) {
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
const semAno = (t) => String(t ?? '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
// o item do card da semana da Sessão da Tarde: "DD/MM DIA · TÍTULO (ANO)", um por filme
const ITEM_DA_SEMANA = /^\d{2}\/\d{2} \S+ · (.+)$/;
/** A arte do item do checklist para o filme: o item do card da semana é o título de um filme só (o deste filme vira o
    título, sem o dia nem o ano; o de outro filme, nada); os outros itens valem como estão. */
function arteDoItem(item, filme) {
  const m = ITEM_DA_SEMANA.exec(String(item ?? '').trim());
  if (!m) return item;
  const nome = semAno(m[1]);
  return chaveDoTitulo(nome) && chaveDoTitulo(nome) === chaveDoTitulo(semAno(filme?.nome)) ? nome : null;
}

/**
 * @param env TEABLE_ACERVO (id da tabela, para gravar), TEABLE_PG_ACERVO (nome no Postgres, para ler),
 *   TEABLE_PG_URL, TEABLE_PG_ESQUEMA, TEABLE_PG_ATRACOES, TEABLE_PG_ARTE, TEABLE_URL, TEABLE_TOKEN,
 *   e TEABLE_PG_EXIBICOES (filme + sessão + dia + card da prévia), para as sessões de filme
 * @param deps.consultar (sql, params) => linhas; deps.buscar fetch; deps.artesDoCard (card) => itens dos checklists
 */
export function criarAcervo(env, deps = {}) {
  const esquema = nomesDoPg(env, '').esquema;
  const tabela = (nome) => (esquema && nome ? `"${esquema}"."${nome}"` : null);
  const t = {
    acervo: tabela(nomeLimpoPg(env.TEABLE_PG_ACERVO)),
    atracoes: tabela(nomeLimpoPg(env.TEABLE_PG_ATRACOES)),
    producao: tabela(nomeLimpoPg(env.TEABLE_PG_ARTE)),
    exibicoes: tabela(nomeLimpoPg(env.TEABLE_PG_EXIBICOES)),
  };
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
  async function todas() {
    if (!ligado) return [];
    if (memo.linhas && Date.now() - memo.em < 60_000) return memo.linhas;
    const linhas = await consultar(`SELECT "__id" AS id, "arte", "tipo", "atracao", "claquete", "filme" FROM ${t.acervo} LIMIT 50000`);
    memo = {
      em: Date.now(),
      linhas: linhas.map((l) => {
        const atr = vinculos(l.atracao)[0] ?? { id: '', title: '' };
        const prod = vinculos(l.claquete)[0] ?? { id: '', title: '' };
        const fil = vinculos(l.filme)[0] ?? { id: '', title: '' };
        // a chave sai da arte, aqui: o key do Teable é só para ver na tabela
        return { id: l.id, arte: String(l.arte ?? ''), chave: chaveDeArte(l.arte), tipo: String(lerTipo(l.tipo) ?? ''), atracao: atr.title, claquete: prod.title, filmeId: fil.id };
      }),
    };
    return memo.linhas;
  }
  const esquecer = () => (memo = { em: 0, linhas: null });
  const publica = ({ arte, chave, tipo, claquete }) => ({ arte, chave, tipo, claquete });
  // a mesma arte pode estar em mais de um tipo (HOJE em rodapé e em cartão): uma entrada só, com os tipos juntos
  const juntar = (lista) => {
    const m = new Map();
    for (const x of lista) {
      const ja = m.get(x.chave);
      if (!ja) m.set(x.chave, { ...x });
      else if (x.tipo && !ja.tipo.split(', ').includes(x.tipo)) ja.tipo = ja.tipo ? `${ja.tipo}, ${x.tipo}` : x.tipo;
    }
    return [...m.values()];
  };

  // o acervo de cada atração ('proprio' | 'filme' | 'sem'), guardado por 10 min; sem a coluna (ou sem a tabela), toda
  // atração tem acervo próprio
  let memoAcervos = { em: 0, acervos: null };
  async function acervoDe(atracao) {
    if (!t.atracoes || !consultar) return 'proprio';
    if (!memoAcervos.acervos || Date.now() - memoAcervos.em > 600_000) {
      try {
        const linhas = await consultar(`SELECT "atracao", "acervo" FROM ${t.atracoes}`);
        memoAcervos = { em: Date.now(), acervos: new Map(linhas.map((l) => [nomeComparavel(l.atracao), acervoDaAtracao(l)])) };
      } catch (e) {
        console.warn(`[acervo] não li o acervo das atrações: ${e instanceof Error ? e.message : e}`);
        memoAcervos = { em: Date.now(), acervos: new Map() };
      }
    }
    return memoAcervos.acervos.get(nomeComparavel(atracao)) ?? 'proprio';
  }
  const ehSessao = async (atracao) => (await acervoDe(atracao)) === 'filme';
  const semAcervo = async (atracao) => (await acervoDe(atracao)) === 'sem';
  /** O acervo de uma atração mudou nos cadastros: a próxima consulta relê. */
  const esquecerAcervos = () => {
    memoAcervos = { em: 0, acervos: null };
  };

  /** O filme que a sessão exibe naquele dia (exibicoes): { id, nome } ou null. */
  async function filmeDe(atracao, data) {
    if (!t.exibicoes || !consultar || !atracao || !/^\d{4}-\d{2}-\d{2}/.test(String(data ?? ''))) return null;
    const linhas = await consultar(`SELECT "filme", "sessao", "labels" FROM ${t.exibicoes} WHERE "data_de_exibicao"::date = $1::date`, [String(data).slice(0, 10)]);
    const l = linhas.find((x) => nomeComparavel(titulo(x.sessao)) === nomeComparavel(atracao) && vinculos(x.filme)[0]?.id && !JSON.stringify(x.labels ?? '').includes('CANCELADO'));
    const f = l ? vinculos(l.filme)[0] : null;
    return f ? { id: f.id, nome: f.title } : null;
  }

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

  /** O que o filme já tem pronto: as artes gravadas com ele e os checklists das prévias dele (em qualquer sessão).
      @param fora o card que não conta como prévia (o que está saindo: as artes dele são as que vão ao acervo) */
  async function doFilme(f, fora = '') {
    if (!f?.id) return [];
    const saida = new Map();
    for (const l of juntar((await todas()).filter((x) => x.filmeId === f.id).map(publica))) saida.set(l.chave, l);
    if (t.exibicoes) {
      const exibicoes = await consultar(`SELECT "sessao", "data_de_exibicao", "card_ID" FROM ${t.exibicoes} WHERE "filme"::jsonb->>'id' = $1`, [f.id]);
      for (const l of exibicoes.filter((x) => x.card_ID && x.card_ID !== fora)) {
        const d = new Date(l.data_de_exibicao);
        const dia = isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
        const origem = `Prévia: ${titulo(l.sessao)} ${dia}`.trim();
        let artes = [];
        try {
          artes = await artesDaPrevia(l.card_ID);
        } catch (e) {
          console.warn(`[acervo] não li a prévia ${l.card_ID}: ${e instanceof Error ? e.message : e}`);
        }
        for (const item of artes) {
          const arte = arteDoItem(item, f);
          const chave = chaveDeArte(arte);
          if (chave && !saida.has(chave)) saida.set(chave, { arte, chave, tipo: '', claquete: origem });
        }
      }
    }
    return [...saida.values()];
  }

  /** As artes de uma atração (pelo nome). A do filme e a sem acervo não têm acervo próprio. */
  async function daAtracao(atracao) {
    const n = nomeComparavel(atracao);
    if (!n || (await semAcervo(atracao)) || (await ehSessao(atracao))) return [];
    return juntar((await todas()).filter((l) => !l.filmeId && nomeComparavel(l.atracao) === n).map(publica));
  }

  /** O que já existe para o roteiro: o acervo da atração ou, numa sessão, o do filme daquele dia. */
  async function paraRevisao(atracao, data) {
    if (await semAcervo(atracao)) return [];
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
   * O card saiu (finalizado/entregue): as artes novas dele (texto, ou { texto, tipos, complexidade } com as siglas e o
   * nível 1–3) entram no acervo da atração ou, numa sessão, do filme do dia (data = exibição). As que já estão lá, não,
   * nem mudam de complexidade. A que vem sem nível (os cards de filme e as ✓, que ninguém marcou) entra sem complexidade.
   * @returns quantas entraram
   */
  async function registrar({ atracao, data, card, artes }) {
    if (!ligado || !grava || !atracao || !artes?.length || (await semAcervo(atracao))) return 0;
    let filme = null;
    if (await ehSessao(atracao)) {
      filme = await filmeDe(atracao, data);
      if (!filme) return 0; // sem saber o filme, não dá para guardar
    }
    const [a] = t.atracoes ? await consultar(`SELECT "__id" AS id FROM ${t.atracoes} WHERE LOWER("atracao") = LOWER($1) LIMIT 1`, [atracao]) : [];
    if (!a?.id) throw new Error(`A atração ${atracao} não está nos cadastros.`);
    const [p] = card && t.producao ? await consultar(`SELECT "__id" AS id FROM ${t.producao} WHERE "card_ID" = $1 LIMIT 1`, [card]) : [];
    // o que já existe, linha a linha (com o tipo): do filme, ou da atração; numa sessão, a prévia conta de qualquer tipo
    const n = nomeComparavel(atracao);
    const linhas = (await todas()).filter((l) => (filme ? l.filmeId === filme.id : !l.filmeId && nomeComparavel(l.atracao) === n));
    const daPrevia = new Set(filme ? (await doFilme(filme, card)).map((x) => x.chave).filter((k) => !linhas.some((l) => l.chave === k)) : []);
    const entradas = artes
      // uma entrada por tipo: a arte com mais de um tipo (foto com lettering) vira uma linha de cada no acervo
      .flatMap((x) => {
        if (typeof x === 'string') return [{ arte: x, tipo: '', complexidade: null }];
        const tipos = (Array.isArray(x?.tipos) && x.tipos.length ? x.tipos : [x?.tipo ?? '']).map((t) => String(t ?? '').trim());
        const complexidade = x?.complexidade == null ? null : nivelDeComplexidade(x.complexidade); // cada tipo, o mesmo nível
        return tipos.map((tipo) => ({ arte: String(x?.texto ?? ''), tipo, complexidade }));
      })
      .map((x) => ({ ...x, arte: x.arte.trim(), chave: chaveDeArte(x.arte) }))
      .filter((x) => x.chave);
    const comTipo = new Set(entradas.filter((x) => x.tipo).map((x) => x.chave));
    const novas = [];
    const tipar = [];
    const vistas = new Set();
    for (const x of entradas) {
      if (!x.tipo && comTipo.has(x.chave)) continue; // a mesma arte veio com tipo: vale a com tipo
      if (vistas.has(`${x.chave}|${x.tipo}`) || daPrevia.has(x.chave)) continue;
      vistas.add(`${x.chave}|${x.tipo}`);
      const mesmas = linhas.filter((l) => l.chave === x.chave);
      if (!mesmas.length) novas.push(x);
      else if (!x.tipo || mesmas.some((l) => l.tipo === x.tipo)) continue;
      else {
        // já estava sem tipo: ganha o tipo; já estava com outro: é outra arte (HOJE em cartão não é HOJE em rodapé)
        const semTipo = mesmas.find((l) => !l.tipo && !tipar.some((t) => t.id === l.id));
        if (semTipo) tipar.push({ id: semTipo.id, fields: { tipo: x.tipo } });
        else novas.push(x);
      }
    }
    if (!novas.length && !tipar.length) return 0;
    if (novas.length)
      await teable('POST', '', {
        fieldKeyType: 'name',
        typecast: true,
        records: novas.map((x) => ({ fields: { arte: x.arte, ...(x.tipo ? { tipo: x.tipo } : {}), ...(x.complexidade ? { complexidade: x.complexidade } : {}), atracao: [{ id: a.id }], ...(p?.id ? { claquete: [{ id: p.id }] } : {}), ...(filme ? { filme: { id: filme.id } } : {}) } })),
      });
    if (tipar.length) await teable('PATCH', '', { fieldKeyType: 'name', typecast: true, records: tipar });
    esquecer();
    return novas.length + tipar.length;
  }

  /** Pacote gráfico novo: todas as artes da atração saem do acervo (apagadas). @returns quantas */
  async function zerar(atracao) {
    if (!ligado || !grava) throw new Error('O acervo de artes não está configurado (TEABLE_ACERVO e TEABLE_PG_ACERVO).');
    esquecer();
    const n = nomeComparavel(atracao);
    const ids = (await todas()).filter((l) => !l.filmeId && nomeComparavel(l.atracao) === n).map((l) => l.id);
    for (let i = 0; i < ids.length; i += 100)
      await teable('DELETE', '?' + ids.slice(i, i + 100).map((id, n) => `recordIds[${n}]=${encodeURIComponent(id)}`).join('&'));
    esquecer();
    return ids.length;
  }

  return { ligado, grava, acervoDe, semAcervo, ehSessao, esquecerAcervos, filmeDe, doFilme, daAtracao, paraRevisao, registrar, zerar, parar: () => banco?.end?.().catch(() => {}) };
}
