/*
 * Acervo de artes: o que cada atração já tem pronto. Uma linha por arte, ligada à atração e ao card
 * (produção da arte) em que foi pedida. Vale até trocar o pacote gráfico: aí as artes da atração são apagadas.
 *
 * Tabela ARTES_acervo: arte (texto), key (fórmula, só para ver: o app calcula a sua), tipo (seleção: a sigla; vem do
 * envio, da importação por CSV conferida na ficha da atração (ADR 0005) ou da mão; o PROMeiro só grava uma opção que o
 * campo já tem), atracao (vínculo → atracoes), claquete (vínculo → ARTE_producao), filme (vínculo → filmes).
 *
 * O acervo da atração (campo acervo em atracoes) diz como o acervo funciona:
 *   próprio (vazio também vale próprio): as artes são da atração.
 *   do filme: o pacote gráfico é do filme, em qualquer sessão. Pela sessão e pelo dia, exibicoes diz o filme; o que ele
 *     tem pronto são os checklists das prévias dele (o card_ID de cada exibição, usado ou não) e as artes gravadas com
 *     ele aqui.
 *   sem acervo (VTs, EVENTOS, Shows Diversos…): o que tem linguagem própria ganha atração própria.
 *
 * Lê pelo Postgres do Teable (só leitura) e grava pela API (TEABLE_TOKEN). A data de modificação de cada linha
 * (__last_modified_time, que o Teable mantém em toda tabela) diz se alguém mexeu nela depois de uma importação.
 */
import { acervoDaAtracao } from './cadastros.mjs';
import { classificar } from './importacao-do-acervo.mjs';
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
  // os roteiros enviados (as artes da produção da arte), para a grafia da importação: na convivência com o n8n, a
  // base de leitura (TEABLE_PG_ARTE_LEITURA, "esquema.tabela"), como o andamento; sem ela, a produção do app
  const leitura = env.TEABLE_PG_ARTE_LEITURA ? nomesDoPg(env, env.TEABLE_PG_ARTE_LEITURA) : null;
  t.roteiros = leitura?.esquema && leitura.tabela ? `"${leitura.esquema}"."${leitura.tabela}"` : t.producao;
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
    const linhas = await consultar(`SELECT "__id" AS id, "arte", "tipo", "atracao", "claquete", "filme", "__last_modified_time" AS modificado FROM ${t.acervo} LIMIT 50000`);
    memo = {
      em: Date.now(),
      linhas: linhas.map((l) => {
        const atr = vinculos(l.atracao)[0] ?? { id: '', title: '' };
        const prod = vinculos(l.claquete)[0] ?? { id: '', title: '' };
        const fil = vinculos(l.filme)[0] ?? { id: '', title: '' };
        // a chave sai da arte, aqui: o key do Teable é só para ver na tabela
        const modificado = l.modificado ? new Date(l.modificado) : null;
        return { id: l.id, arte: String(l.arte ?? ''), chave: chaveDeArte(l.arte), tipo: String(lerTipo(l.tipo) ?? ''), atracao: atr.title, claquete: prod.title, filmeId: fil.id, modificado: modificado && !isNaN(modificado) ? modificado.toISOString() : '' };
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

  /** A ficha da atração (Cadastros): o acervo dela linha a linha, sem juntar a mesma arte em tipos diferentes (em ordem
      alfabética, sem caixa; o empate pelo tipo), com o total e a contagem por tipo (a maior primeiro; "sem tipo" no fim). A do filme e a sem acervo não guardam arte aqui. */
  async function fichaDa(atracao) {
    const acervo = await acervoDe(atracao);
    const n = nomeComparavel(atracao);
    const linhas = acervo === 'proprio' && n ? (await todas()).filter((l) => !l.filmeId && nomeComparavel(l.atracao) === n) : [];
    const artes = linhas.map(({ id, arte, tipo }) => ({ id, arte, tipo })).sort((a, b) => a.arte.localeCompare(b.arte, 'pt-BR', { sensitivity: 'base' }) || a.tipo.localeCompare(b.tipo, 'pt-BR'));
    const contagem = new Map();
    for (const l of artes) contagem.set(l.tipo, (contagem.get(l.tipo) ?? 0) + 1);
    const porTipo = [...contagem].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => !a.tipo - !b.tipo || b.n - a.n || a.tipo.localeCompare(b.tipo, 'pt-BR'));
    return { acervo, total: artes.length, porTipo, artes };
  }

  /** Quantas linhas cada atração tem no acervo, pelo nome do vínculo (a lista dos Cadastros); as dos filmes não contam. */
  async function totais() {
    const saida = {};
    for (const l of await todas()) if (!l.filmeId && l.atracao) saida[l.atracao] = (saida[l.atracao] ?? 0) + 1;
    return saida;
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
    const a = { id: await idDaAtracao(atracao) };
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

  /** As opções do campo tipo do acervo (as siglas), lidas na hora pela API: a importação só grava um tipo daqui. */
  async function tiposDoAcervo() {
    const r = await buscar(`${api.url}/api/table/${encodeURIComponent(api.tabela)}/field`, { headers: { authorization: `Bearer ${api.token}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`Teable respondeu ${r.status} nos campos do acervo.`);
    const campos = await r.json();
    const tipo = (Array.isArray(campos) ? campos : []).find((c) => c?.name === 'tipo');
    return (tipo?.options?.choices ?? []).map((c) => String(c?.name ?? '')).filter(Boolean);
  }
  /** O id da atração nos cadastros (para o vínculo); a que não está lá é um erro de quem pediu (422). */
  async function idDaAtracao(atracao) {
    const [a] = t.atracoes ? await consultar(`SELECT "__id" AS id FROM ${t.atracoes} WHERE LOWER("atracao") = LOWER($1) LIMIT 1`, [atracao]) : [];
    if (!a?.id) throw Object.assign(new Error(`A atração ${atracao} não está nos cadastros.`), { status: 422 });
    return a.id;
  }
  /** As linhas do acervo próprio da atração (sem as de filme), com o id. */
  const linhasDa = async (atracao) => (await todas()).filter((l) => !l.filmeId && nomeComparavel(l.atracao) === nomeComparavel(atracao));

  // as artes de cada roteiro enviado, com a atração, guardadas por 10 min (só para a grafia da importação)
  let memoRoteiros = { em: 0, linhas: null };
  async function artesDosRoteiros() {
    if (!t.roteiros || !consultar) return [];
    if (memoRoteiros.linhas && Date.now() - memoRoteiros.em < 600_000) return memoRoteiros.linhas;
    let linhas = [];
    try {
      linhas = (await consultar(`SELECT "atracao", "artes" FROM ${t.roteiros} WHERE "artes" IS NOT NULL`)).map((l) => ({
        atracao: titulo(l.atracao),
        // "A | B"; a arte de dois tipos vem uma vez por tipo, com a sigla entre parênteses no fim ("HOJE (RDP)"): vale
        // também o texto sem ela ("ELIANA (AO VIVO)" fica com as duas formas: a grafia só casa pela chave inteira)
        artes: String(l.artes ?? '')
          .split(/\s*\|\s*|\n+/)
          .flatMap((a) => [...new Set([a.trim(), a.replace(/\s*\([A-Z]{2,}(?: [A-Z]+)*\)$/, '').trim()])])
          .filter(Boolean),
      }));
    } catch (e) {
      console.warn(`[acervo] não li os roteiros para a grafia: ${e instanceof Error ? e.message : e}`);
    }
    memoRoteiros = { em: Date.now(), linhas };
    return linhas;
  }

  /**
   * As fontes da grafia da importação, além do acervo da atração: as artes dos roteiros dela, as dos roteiros das
   * outras e o acervo das outras (os filmes também).
   */
  async function grafiasPara(atracao) {
    const n = nomeComparavel(atracao);
    const roteiros = await artesDosRoteiros();
    return {
      roteirosDaAtracao: roteiros.filter((r) => nomeComparavel(r.atracao) === n).flatMap((r) => r.artes),
      roteiros: roteiros.filter((r) => nomeComparavel(r.atracao) !== n).flatMap((r) => r.artes),
      acervo: (await todas()).filter((l) => l.filmeId || nomeComparavel(l.atracao) !== n).map((l) => l.arte),
    };
  }

  /** O acervo da atração para a conferência: { id, arte, tipo } de cada linha. */
  const paraConferir = (linhas) => linhas.map(({ id, arte, tipo }) => ({ id, arte, tipo }));

  /**
   * A prévia da importação por CSV (ADR 0005): cada linha do CSV classificada contra o acervo da atração, com as
   * regras de conversão (a grafia pelas fontes, na ordem), as perguntas para quem confere, o placar e as opções de
   * tipo. Vai junto o acervo da atração, para a tela conferir de novo a cada escolha. Nada é gravado.
   * @param regras as regras desta atração (as decisões lembradas, #63), que quem chama lê do SQLite
   * @returns { antes, tipos, acervo, linhas, placar, faltam }
   */
  async function previaDaImportacao(atracao, csv, regras = {}) {
    await idDaAtracao(atracao);
    const tipos = await tiposDoAcervo();
    const acervo = paraConferir(await linhasDa(atracao));
    const { linhas, placar, faltam } = classificar({ csv, acervo, tipos, grafias: await grafiasPara(atracao), regras });
    return { antes: acervo.length, tipos, acervo, linhas, placar, faltam };
  }

  /**
   * Grava a importação conferida (ADR 0005, #60): o CSV é classificado de novo contra o acervo relido logo antes, com
   * as escolhas de quem conferiu (o nome e o tipo editados, as respostas, as linhas tiradas). Com decisão pendente,
   * nada é gravado. O tipo tem de ser uma opção do campo (o typecast nunca cria opção nova). Cria as novas, dá o tipo
   * às que completam e renomeia no lugar (o mesmo id) a linha do acervo que estava errada, em lotes de 100.
   *
   * O registro da importação (#61) é o que permite desfazer e retomar: os lotes, cada um com o estado (pendente,
   * gravado, falhou), os ids criados, o tipo e o nome antigos das linhas alteradas e, no fim, a data de modificação de
   * cada linha tocada. anotar(registro) é chamado antes do primeiro lote e depois de cada um; o lote que falha para a
   * gravação (o erro tem interrompida: true) e o registro fica até onde foi.
   *
   * As regras desta atração (#63) valem como na prévia; lembrar(linhas), quando vem, recebe as linhas conferidas logo
   * depois de a conferência passar (sem decisão pendente, os tipos no campo) e antes do primeiro lote: as decisões
   * ficam lembradas mesmo se a gravação parar no meio.
   * @returns { antes, depois, novas, ganharamTipo, renomeadas: [{ id, antes, depois }], semMudanca }
   */
  async function gravarImportacao(atracao, csv, escolhas = {}, { anotar = () => {}, regras = {}, lembrar = () => {} } = {}) {
    if (!ligado || !grava) throw new Error('O acervo de artes não está configurado (TEABLE_ACERVO e TEABLE_PG_ACERVO).');
    const id = await idDaAtracao(atracao);
    const tipos = await tiposDoAcervo();
    esquecer();
    const linhas = await linhasDa(atracao);
    const acervo = paraConferir(linhas);
    const { faltam, plano, linhas: conferidas } = classificar({ csv, acervo, tipos, grafias: await grafiasPara(atracao), regras, escolhas });
    // o tipo escolhido (e o que vai ser gravado) que não é opção do campo: o erro diz qual, antes da decisão pendente
    // que ele mesmo causa
    const gravados = [...plano.criar, ...plano.tipar, ...plano.renomear].map((x) => x.tipo);
    const invalidos = [...new Set([...Object.values(escolhas).map((e) => e.tipo), ...gravados].filter((tipo) => tipo && !tipos.includes(tipo)))];
    if (invalidos.length) throw Object.assign(new Error(`Tipo que não está no campo tipo do acervo: ${invalidos.join(', ')}. Nada foi gravado.`), { status: 422 });
    if (faltam) throw Object.assign(new Error(`${faltam === 1 ? 'Falta 1 decisão' : `Faltam ${faltam} decisões`} na conferência: nada foi gravado.`), { status: 422 });
    await lembrar(conferidas);
    const tipoAntigo = (linha) => linhas.find((l) => l.id === linha)?.tipo ?? '';
    const emLotes = (acao, lista) => Array.from({ length: Math.ceil(lista.length / 100) }, (_, i) => ({ acao, estado: 'pendente', registros: lista.slice(i * 100, i * 100 + 100) }));
    const registro = {
      atracao,
      atracaoId: id,
      antes: acervo.length,
      // as linhas que já estavam: o que aparecer além delas (e dos ids gravados) veio de um lote que falhou no meio
      antesIds: linhas.map((l) => l.id),
      lotes: [
        ...emLotes('criar', plano.criar.map(({ arte, tipo }) => ({ arte, tipo }))),
        ...emLotes('tipar', plano.tipar.map(({ id: linha, tipo }) => ({ id: linha, tipo, tipoAntigo: tipoAntigo(linha) }))),
        ...emLotes('renomear', plano.renomear.map(({ id: linha, arte, antigo, tipo }) => ({ id: linha, arte, antigo, ...(tipo ? { tipo } : {}), tipoAntigo: tipoAntigo(linha) }))),
      ],
      modificados: {},
      resumo: {
        novas: plano.criar.length,
        ganharamTipo: plano.tipar.length,
        renomeadas: plano.renomear.map((x) => ({ id: x.id, antes: x.antigo, depois: x.arte })),
        semMudanca: plano.semMudanca,
      },
    };
    const resumo = { antes: acervo.length, depois: acervo.length + plano.criar.length, ...registro.resumo };
    if (!registro.lotes.length) return { ...resumo, registro: null };
    await executar(registro, anotar);
    return { ...resumo, registro };
  }

  /** Os lotes da importação que ainda não foram gravados, um a um; no fim, a data de modificação de cada linha tocada. */
  async function executar(registro, anotar) {
    await anotar(registro);
    try {
      for (const [i, lote] of registro.lotes.entries()) {
        if (lote.estado === 'gravado') continue;
        try {
          if (lote.acao === 'criar') {
            const faltam = lote.registros.filter((r) => !r.id);
            if (faltam.length) {
              const r = await teable('POST', '', { fieldKeyType: 'name', typecast: false, records: faltam.map(({ arte, tipo }) => ({ fields: { arte, ...(tipo ? { tipo } : {}), atracao: [{ id: registro.atracaoId }] } })) });
              // o Teable devolve os registros criados na ordem do pedido
              (r.records ?? []).forEach((x, k) => faltam[k] && x?.id && (faltam[k].id = x.id));
            }
          } else
            await teable('PATCH', '', {
              fieldKeyType: 'name',
              typecast: false,
              records: lote.registros.map((r) => ({ id: r.id, fields: lote.acao === 'tipar' ? { tipo: r.tipo } : { arte: r.arte, ...(r.tipo ? { tipo: r.tipo } : {}) } })),
            });
          lote.estado = 'gravado';
          delete lote.erro;
        } catch (e) {
          lote.estado = 'falhou';
          lote.erro = e instanceof Error ? e.message : String(e);
          await anotar(registro);
          const feitos = registro.lotes.filter((l) => l.estado === 'gravado').length;
          throw Object.assign(new Error(`A gravação parou no lote ${i + 1} de ${registro.lotes.length} (${lote.erro}). ${feitos ? `${feitos === 1 ? 'O lote anterior ficou gravado' : `Os ${feitos} lotes anteriores ficaram gravados`}: dá para desfazer ou retomar em Importações, na ficha.` : 'Dá para retomar ou desfazer em Importações, na ficha.'}`), { interrompida: true });
        }
        await anotar(registro);
      }
    } finally {
      esquecer();
    }
    // a data de modificação de cada linha logo depois de gravada: a que mudar depois é de alguém que mexeu no Teable
    const agora = new Map((await linhasDa(registro.atracao)).map((l) => [l.id, l.modificado]));
    for (const id of idsTocados(registro)) registro.modificados[id] = agora.get(id) ?? '';
    await anotar(registro);
  }

  const idsTocados = (registro) => registro.lotes.flatMap((l) => l.registros.map((r) => r.id)).filter(Boolean);

  /** O lote de criar que falhou pode ter gravado no Teable sem a resposta chegar: a linha nova da atração (fora das
      que já estavam e das conhecidas) com a mesma arte e o mesmo tipo de um registro sem id é dele. */
  function adotar(registro, linhas) {
    const conhecidas = new Set([...registro.antesIds, ...idsTocados(registro)]);
    for (const lote of registro.lotes.filter((l) => l.acao === 'criar' && l.estado !== 'gravado'))
      for (const r of lote.registros.filter((x) => !x.id)) {
        const achada = linhas.find((l) => !conhecidas.has(l.id) && l.chave === chaveDeArte(r.arte) && l.tipo === (r.tipo ?? ''));
        if (achada) (r.id = achada.id, conhecidas.add(achada.id));
      }
  }

  /**
   * Retoma a importação interrompida (#61): os lotes que faltam, sem duplicar o que o lote que falhou já tinha criado.
   * @returns { antes, depois, novas, ganharamTipo, renomeadas, semMudanca }
   */
  async function retomarImportacao(registro, { anotar = () => {} } = {}) {
    if (!ligado || !grava) throw new Error('O acervo de artes não está configurado (TEABLE_ACERVO e TEABLE_PG_ACERVO).');
    esquecer();
    adotar(registro, await linhasDa(registro.atracao));
    await executar(registro, anotar);
    return { antes: registro.antes, depois: (await linhasDa(registro.atracao)).length, ...registro.resumo };
  }

  /**
   * Desfaz a importação (#61): apaga as linhas criadas e devolve o tipo e o nome antigos das alteradas. A linha que
   * alguém mexeu no Teable depois (a data de modificação mudou; no lote sem a data, o valor não é o gravado) não volta:
   * fica como está e vai na lista. A que já está como era fica quieta, então desfazer de novo depois de uma falha não
   * repete nada.
   * @returns { apagadas, devolvidas, naoVoltaram: [{ id, arte, tipo, motivo }], depois }; o motivo diz o que ficou
   *   ("continua no acervo", "não voltou a “X”", "o tipo não voltou")
   */
  async function desfazerImportacao(registro) {
    if (!ligado || !grava) throw new Error('O acervo de artes não está configurado (TEABLE_ACERVO e TEABLE_PG_ACERVO).');
    esquecer();
    const linhas = await linhasDa(registro.atracao);
    adotar(registro, linhas);
    const atual = new Map(linhas.map((l) => [l.id, l]));
    // mexeram depois: a data de modificação não é a de logo depois da importação; sem ela, o valor não é o gravado
    const mexeram = (l, gravado) => (registro.modificados[l.id] ? l.modificado !== registro.modificados[l.id] : !gravado(l));
    const naoVoltaram = [];
    const fica = (l, motivo) => naoVoltaram.push({ id: l.id, arte: l.arte, tipo: l.tipo, motivo });
    const apagar = [];
    const devolver = [];
    for (const lote of registro.lotes)
      for (const r of lote.registros) {
        const l = r.id && atual.get(r.id);
        if (!l) continue; // já não está no acervo (ou nunca foi criada)
        if (lote.acao === 'criar') {
          if (mexeram(l, (x) => x.chave === chaveDeArte(r.arte) && x.tipo === (r.tipo ?? ''))) fica(l, 'continua no acervo');
          else apagar.push(l.id);
          continue;
        }
        const antes = { arte: lote.acao === 'renomear' ? r.antigo : l.arte, tipo: r.tipoAntigo ?? '' };
        const depois = { arte: lote.acao === 'renomear' ? r.arte : l.arte, tipo: r.tipo ?? r.tipoAntigo ?? '' };
        if (l.arte === antes.arte && l.tipo === antes.tipo) continue; // já está como era
        if (mexeram(l, (x) => x.arte === depois.arte && x.tipo === depois.tipo)) fica(l, lote.acao === 'renomear' ? `não voltou a “${r.antigo}”` : 'o tipo não voltou');
        else devolver.push({ id: l.id, fields: { ...(lote.acao === 'renomear' ? { arte: r.antigo } : {}), tipo: r.tipoAntigo || null } });
      }
    try {
      await apagarLinhas(apagar);
      for (let i = 0; i < devolver.length; i += 100) await teable('PATCH', '', { fieldKeyType: 'name', typecast: false, records: devolver.slice(i, i + 100) });
    } finally {
      esquecer();
    }
    return { apagadas: apagar.length, devolvidas: devolver.length, naoVoltaram, depois: (await linhasDa(registro.atracao)).length };
  }

  /** Apaga as linhas do acervo pelo id, em lotes de 100. */
  async function apagarLinhas(ids) {
    for (let i = 0; i < ids.length; i += 100)
      await teable('DELETE', '?' + ids.slice(i, i + 100).map((id, n) => `recordIds[${n}]=${encodeURIComponent(id)}`).join('&'));
  }

  /** Pacote gráfico novo: todas as artes da atração saem do acervo (apagadas). @returns quantas */
  async function zerar(atracao) {
    if (!ligado || !grava) throw new Error('O acervo de artes não está configurado (TEABLE_ACERVO e TEABLE_PG_ACERVO).');
    esquecer();
    const n = nomeComparavel(atracao);
    const ids = (await todas()).filter((l) => !l.filmeId && nomeComparavel(l.atracao) === n).map((l) => l.id);
    await apagarLinhas(ids);
    esquecer();
    return ids.length;
  }

  return { ligado, grava, acervoDe, previaDaImportacao, gravarImportacao, retomarImportacao, desfazerImportacao, semAcervo, ehSessao, esquecerAcervos, filmeDe, doFilme, daAtracao, fichaDa, totais, paraRevisao, registrar, zerar, parar: () => banco?.end?.().catch(() => {}) };
}
