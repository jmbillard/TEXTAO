/*
 * Aba Duplicadas (#65): as linhas da produção da arte com a mesma claquete, praça e versão, no lugar do relatório
 * "PROMO: CLAQUETES DUPLICADAS" do n8n.
 *
 * A lista e o contador saem só da produção da arte (ARTE_producao, lida pelo Postgres do Teable como o andamento): as
 * linhas com card_ID que não são de filme e entraram no período (data_entrada), abertas e arquivadas (coluna
 * arquivado). A leitura fica guardada por alguns minutos. A lista não lê o Trello: um card qualquer do quadro, que não
 * é de roteiro, não vira caso. Só o caso aberto lê do Trello o que só ele tem (lista, membros, anexos, checklist, se
 * está arquivado), pelo card_ID de cada card do caso; o card que não existe mais lá aparece como "não está mais no
 * Trello". O agrupamento e a sugestão de quem sai são o módulo puro src/modelo/duplicadas.ts.
 *
 * Ignorar e reabrir (#66) só anotam no registro do PROMeiro (servidor/registro-das-duplicadas.mjs): o caso ignorado
 * sai da lista e vai para Resolvidas, e volta sozinho quando entra card novo no grupo. Nada muda no Trello nem no Teable.
 */
import { cardDaLinha, duplicadasDaProducao, linhasDoPeriodo, sugestaoDoCaso } from '../src/modelo/duplicadas.ts';
import { chaveDaClaquete, semAcento } from '../src/modelo/vocabularios.ts';
import { pracasDaConfiguracao } from '../src/modelo/pracas.ts';

const DIA = 86_400_000;
export const DIAS_PADRAO = 90;
export const DIAS_MAXIMO = 730;
const ID_DO_CARD = /^[0-9a-f]{24}$/i;

/** Quando o card foi criado: os 8 primeiros caracteres do id são o segundo da criação (null quando não é id do Trello). */
export const criadoEm = (id) => (ID_DO_CARD.test(String(id)) ? parseInt(String(id).slice(0, 8), 16) * 1000 : null);

/** "1 PDF, 2 imagens" a partir dos tipos dos anexos; sem anexo, ''. */
export function resumoDosAnexos(anexos) {
  const n = { pdf: 0, imagem: 0, outro: 0 };
  for (const a of anexos ?? []) {
    const tipo = String(a?.mimeType ?? '');
    const nome = String(a?.name ?? '');
    if (/pdf/i.test(tipo) || /\.pdf$/i.test(nome)) n.pdf++;
    else if (/^image\//i.test(tipo) || /\.(png|jpe?g|gif|webp)$/i.test(nome)) n.imagem++;
    else n.outro++;
  }
  return [n.pdf && `${n.pdf} PDF`, n.imagem && `${n.imagem} ${n.imagem === 1 ? 'imagem' : 'imagens'}`, n.outro && `${n.outro} ${n.outro === 1 ? 'outro' : 'outros'}`].filter(Boolean).join(', ');
}

/**
 * @param deps.trello o cliente do Trello e da produção (`temProducao`, `producaoDoPeriodo`; `lerSeExistir` e `config` para
 *   o caso aberto)
 * @param deps.acervo o acervo de artes (`artesPorRegistro`)
 * @param deps.registro o registro das ações (servidor/registro-das-duplicadas.mjs): os casos ignorados saem da lista
 * @param deps.guardarMs por quanto tempo a leitura da produção vale (5 min)
 */
export function criarDuplicadas({ trello, acervo, registro = null, guardarMs = 5 * 60_000 }) {
  const c = trello?.config ?? {};
  // a aba precisa só da produção da arte; o Trello (chave e token) é só para o caso aberto
  const ligado = !!(trello?.temProducao && trello.producaoDoPeriodo);
  const leTrello = !!(c.chave && c.token && trello?.lerSeExistir);
  const pracas = c.pracas ?? pracasDaConfiguracao();
  const entradas = new Set([...pracas.map((p) => p.entrada), ...Object.values(c.listas ?? {})].filter(Boolean));
  const saidas = new Set([...pracas.map((p) => p.saida), c.entregues].filter(Boolean));

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

  /** O card no Trello, com o que só ele tem; null quando não existe mais lá; undefined sem o Trello configurado. */
  async function noTrello(cardId) {
    if (!leTrello) return undefined;
    if (!ID_DO_CARD.test(cardId)) return null;
    return trello.lerSeExistir(`/cards/${cardId}`, {
      fields: 'id,idShort,name,closed,idList,idMembers,due,shortUrl,badges',
      list: 'true',
      list_fields: 'name',
      attachments: 'true',
      attachment_fields: 'name,mimeType',
      members: 'true',
      member_fields: 'fullName',
    });
  }

  /**
   * Um caso aberto: as linhas da produção do caso, cada card lido no Trello pelo card_ID (só os do caso: lista,
   * estado, anexos, membros, checklist), o acervo e a sugestão refeita com o que veio do Trello. O card que não existe
   * mais no Trello vem com noTrello: false. O roteiro guardado no PROMeiro vem de quem chama (`roteiroDoCard`).
   * null: o caso não está no período.
   */
  async function detalhe(id, { dias = DIAS_PADRAO, roteiroDoCard = () => null } = {}) {
    if (!ligado) return null;
    const { lido, casos, porId } = await casosDo(dias, false);
    const caso = casos.find((k) => k.id === id);
    if (!caso) return null;
    const [artes, lidos] = await Promise.all([artesNoAcervo(), Promise.all(caso.cards.map(noTrello))]);
    const cards = caso.cards.map((cardId, i) => {
      const l = porId.get(cardId);
      const x = lidos[i];
      const membros = (x?.members ?? []).map((m) => String(m?.fullName ?? '')).filter(Boolean);
      const criado = criadoEm(cardId);
      const daLinha = cardDaLinha(l);
      return {
        id: cardId,
        // null: sem o Trello configurado (chave e token), não deu para ler
        noTrello: x === undefined ? null : !!x,
        numero: x && Number.isFinite(Number(x.idShort)) && x.idShort != null ? Number(x.idShort) : null,
        nome: String(x?.name ?? ''),
        claquete: l.claquete,
        lista: String(x?.list?.name ?? ''),
        // o estado do Trello, quando o card está lá; senão, o da coluna arquivado
        arquivado: x ? !!x.closed : l.arquivado,
        criado: criado ? new Date(criado).toISOString() : null,
        entrada: l.entrada,
        exibicao: x?.due ?? null,
        status: l.status,
        designers: l.designers,
        membros,
        checklist: Number(x?.badges?.checkItems ?? 0),
        anexos: resumoDosAnexos(x?.attachments),
        acervo: artes[l.registro] ?? 0,
        roteiro: roteiroDoCard(cardId),
        url: String(x?.shortUrl || `https://trello.com/c/${cardId}`),
        // os sinais da sugestão: os da linha, com o que o Trello diz por cima
        sinais: {
          ...daLinha,
          ...(x ? { arquivado: !!x.closed, naEntrada: entradas.has(x.idList), saiu: daLinha.saiu || saidas.has(x.idList) } : {}),
          pessoas: l.designers.length + membros.length,
          sumiu: x === null,
        },
      };
    });
    const sugestao = sugestaoDoCaso(cards.map((k) => k.sinais));
    return {
      id: caso.id,
      claquete: cards.find((k) => k.id === sugestao.fica)?.claquete ?? '',
      praca: caso.praca,
      versao: caso.versao,
      secao: caso.secao,
      lidoEm: lido.em,
      sugestao: { fica: sugestao.fica, saem: sugestao.saem },
      cards: cards.map(({ sinais, ...k }) => ({ ...k, motivo: sugestao.motivos[k.id] })),
    };
  }

  return { ligado, listar, detalhe, ignorar, reabrir, registro: () => registro?.lista() ?? [] };
}
