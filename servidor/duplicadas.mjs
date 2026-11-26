/*
 * Aba Duplicadas (#65): as linhas da produção da arte com a mesma claquete, praça e versão, no lugar do relatório
 * "PROMO: CLAQUETES DUPLICADAS" do n8n.
 *
 * A lista e o contador saem só da produção da arte (ARTE_producao, lida pelo Postgres do Teable como o andamento): as
 * linhas com card_ID que não são de filme e entraram no período (data_entrada), abertas e arquivadas (coluna
 * arquivado). A leitura fica guardada por alguns minutos. Nada é lido do Trello (ADR 0006: por enquanto o PROMeiro só
 * ESCREVE no Trello; lê do Teable): nem a lista (um card qualquer do quadro, que não é de roteiro, não vira caso) nem o
 * caso aberto, que mostra só o que a produção da arte tem (e o link do card, feito do card_ID). O agrupamento e a
 * sugestão de quem sai são o módulo puro src/modelo/duplicadas.ts.
 *
 * Ignorar e reabrir (#66) só anotam no registro do PROMeiro (servidor/registro-das-duplicadas.mjs): o caso ignorado
 * sai da lista e vai para Resolvidas, e volta sozinho quando entra card novo no grupo. Nada muda no Trello nem no Teable.
 */
import { duplicadasDaProducao, linhasDoPeriodo } from '../src/modelo/duplicadas.ts';
import { chaveDaClaquete, semAcento } from '../src/modelo/vocabularios.ts';
import { pracasDaConfiguracao } from '../src/modelo/pracas.ts';

const DIA = 86_400_000;
export const DIAS_PADRAO = 90;
export const DIAS_MAXIMO = 730;
const ID_DO_CARD = /^[0-9a-f]{24}$/i;

/** Quando o card foi criado: os 8 primeiros caracteres do id são o segundo da criação (null quando não é id do Trello). */
export const criadoEm = (id) => (ID_DO_CARD.test(String(id)) ? parseInt(String(id).slice(0, 8), 16) * 1000 : null);

/**
 * @param deps.trello o cliente da produção da arte (`temProducao`, `producaoDoPeriodo`; `config` para as praças)
 * @param deps.acervo o acervo de artes (`artesPorRegistro`)
 * @param deps.registro o registro das ações (servidor/registro-das-duplicadas.mjs): os casos ignorados saem da lista
 * @param deps.guardarMs por quanto tempo a leitura da produção vale (5 min)
 */
export function criarDuplicadas({ trello, acervo, registro = null, guardarMs = 5 * 60_000 }) {
  const c = trello?.config ?? {};
  // a aba precisa só da produção da arte
  const ligado = !!(trello?.temProducao && trello.producaoDoPeriodo);
  const pracas = c.pracas ?? pracasDaConfiguracao();

  /* ---------- a produção do período, guardada por alguns minutos (uma leitura por período) ---------- */
  const guardadas = new Map(); // dias → { em, linhas } ou a promessa da leitura em curso
  async function lerProducao(dias) {
    const linhas = (await trello.producaoDoPeriodo(dias)) ?? [];
    return { em: new Date().toISOString(), linhas };
  }
  async function producao(dias, renovar) {
    const ja = guardadas.get(dias);
    if (ja && !renovar && (ja.then || Date.now() - Date.parse(ja.em) < guardarMs)) return ja;
    const lendo = lerProducao(dias).then(
      (lido) => (guardadas.set(dias, lido), lido),
      (erro) => (guardadas.delete(dias), Promise.reject(erro)),
    );
    guardadas.set(dias, lendo);
    return lendo;
  }

  /** Os casos do período e as linhas que contam (com card, sem filme, no período), pelo card. */
  async function casosDo(dias, renovar) {
    const lido = await producao(dias, renovar);
    const desde = Date.now() - dias * DIA;
    const casos = duplicadasDaProducao(lido.linhas, { desde, pracas });
    const porId = new Map(linhasDoPeriodo(lido.linhas, desde).map((l) => [l.card, l]));
    return { lido, casos, porId };
  }

  /** O caso ainda ignorado (a última ação dele é ignorar e não entrou card novo), ou null. */
  const ignoradoAgora = (caso, ignorados) => {
    const ignorado = ignorados.get(caso.id);
    return registro?.continuaIgnorado(ignorado, caso.cards) ? ignorado : null;
  };

  /**
   * A lista: os casos pendentes do período (com o filtro da busca, que não muda o contador), os resolvidos (ignorados)
   * do período, a data da leitura e quantas linhas da produção contaram. Não lê o Trello.
   * @returns { ligado, dias, lidoEm, linhasLidas, pendentes, casos: [resumo], resolvidas: [resolvida], totalResolvidas }
   */
  async function listar({ dias = DIAS_PADRAO, busca = '', renovar = false } = {}) {
    if (!ligado) return { ligado: false, dias, lidoEm: null, linhasLidas: 0, pendentes: 0, casos: [], resolvidas: [], totalResolvidas: 0 };
    const { lido, casos, porId } = await casosDo(dias, renovar);
    const artes = await artesNoAcervo();
    const ignorados = registro?.ignorados() ?? new Map();
    const termo = semAcento(busca.trim());
    const termoChave = chaveDaClaquete(busca);
    const acha = (k) => !termo || k.cards.some((id) => semAcento(porId.get(id)?.claquete ?? '').includes(termo)) || (!!termoChave && k.chave.includes(termoChave));
    const pendentes = [];
    const resolvidas = [];
    for (const k of casos) {
      const ignorado = ignoradoAgora(k, ignorados);
      if (ignorado) resolvidas.push({ k, ignorado });
      else pendentes.push(k);
    }
    const claquete = (k) => porId.get(k.sugestao.fica)?.claquete ?? '';
    const resumo = (k) => {
      const cards = k.cards.map((id) => porId.get(id));
      return {
        id: k.id,
        claquete: claquete(k),
        praca: k.praca,
        versao: k.versao,
        secao: k.secao,
        cards: cards.length,
        abertos: cards.filter((x) => !x.arquivado).length,
        arquivados: cards.filter((x) => x.arquivado).length,
        artesNoAcervo: cards.reduce((n, x) => n + (artes[x.registro] ?? 0), 0),
        dias: Math.floor((Date.now() - k.recente) / DIA),
      };
    };
    return {
      ligado: true,
      dias,
      lidoEm: lido.em,
      linhasLidas: porId.size,
      pendentes: pendentes.length,
      casos: pendentes.filter(acha).map(resumo),
      // a ignorada mais recente primeiro
      resolvidas: resolvidas
        .filter(({ k }) => acha(k))
        .sort((a, b) => b.ignorado.id - a.ignorado.id)
        .map(({ k, ignorado }) => ({ id: k.id, claquete: claquete(k), praca: k.praca, versao: k.versao, cards: k.cards.length, por: ignorado.por, em: ignorado.em, motivo: ignorado.motivo })),
      totalResolvidas: resolvidas.length,
    };
  }

  /**
   * Ignorar ("não é duplicada"): anota no registro a assinatura do grupo de agora (os ids dos cards), o motivo, quem e
   * quando. Nada muda no Trello nem no Teable.
   * @returns { ok: true } | { erro, status }
   */
  async function ignorar(id, { dias = DIAS_PADRAO, motivo = '', por }) {
    if (!ligado || !registro) return { status: 404, erro: 'A aba Duplicadas não está configurada.' };
    const { casos, porId } = await casosDo(dias, false);
    const caso = casos.find((k) => k.id === id);
    if (!caso) return { status: 404, erro: 'Este caso não está mais entre as duplicadas do período.' };
    if (ignoradoAgora(caso, registro.ignorados())) return { status: 409, erro: 'Este caso já está em Resolvidas.' };
    registro.anotar({ acao: 'ignorar', caso: caso.id, claquete: porId.get(caso.sugestao.fica)?.claquete ?? '', praca: caso.praca, cards: caso.cards, por, motivo });
    return { ok: true };
  }

  /** Reabrir: o caso ignorado volta para a lista (fica no registro quem reabriu). Não lê a produção nem o Trello. */
  function reabrir(id, { por }) {
    const ignorado = registro?.ignorados().get(id);
    if (!ignorado) return { status: 404, erro: 'Este caso não está ignorado.' };
    registro.anotar({ acao: 'reabrir', caso: id, claquete: ignorado.claquete, praca: ignorado.praca, cards: ignorado.cards, por });
    return { ok: true };
  }

  async function artesNoAcervo() {
    try {
      return (await acervo?.artesPorRegistro?.()) ?? {};
    } catch (e) {
      console.warn(`[duplicadas] não li o acervo: ${e instanceof Error ? e.message : e}`);
      return {};
    }
  }

  /**
   * Um caso aberto: as linhas da produção do caso (só o que o Teable tem: a claquete, o estado, as datas, o status, os
   * designers, as artes), o acervo, o link do card (feito do card_ID, sem ler o Trello) e a sugestão, a mesma da lista.
   * O roteiro guardado no PROMeiro vem de quem chama (`roteiroDoCard`). null: o caso não está no período.
   */
  async function detalhe(id, { dias = DIAS_PADRAO, roteiroDoCard = () => null } = {}) {
    if (!ligado) return null;
    const { lido, casos, porId } = await casosDo(dias, false);
    const caso = casos.find((k) => k.id === id);
    if (!caso) return null;
    const artes = await artesNoAcervo();
    const cards = caso.cards.map((cardId) => {
      const l = porId.get(cardId);
      const criado = criadoEm(cardId);
      return {
        id: cardId,
        claquete: l.claquete,
        arquivado: l.arquivado,
        criado: criado ? new Date(criado).toISOString() : null,
        entrada: l.entrada,
        entrega: l.entrega ?? null,
        status: l.status,
        designers: l.designers,
        artes: l.artesQuantidade ?? null,
        acervo: artes[l.registro] ?? 0,
        roteiro: roteiroDoCard(cardId),
        url: `https://trello.com/c/${encodeURIComponent(cardId)}`,
        motivo: caso.sugestao.motivos[cardId],
      };
    });
    return {
      id: caso.id,
      claquete: porId.get(caso.sugestao.fica)?.claquete ?? '',
      praca: caso.praca,
      versao: caso.versao,
      secao: caso.secao,
      lidoEm: lido.em,
      sugestao: { fica: caso.sugestao.fica, saem: caso.sugestao.saem },
      cards,
    };
  }

  return { ligado, listar, detalhe, ignorar, reabrir, registro: () => registro?.lista() ?? [] };
}
