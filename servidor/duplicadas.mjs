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
 *
 * Apagar (#67), um card por pedido e só fora do modo só olhar: relê na hora as linhas dos cards do caso no Teable (e
 * não no Trello), para se algo mudou desde que a tela abriu, e então guarda a cópia → religa as artes do acervo ao
 * card que fica → reaponta o roteiro guardado → comenta no card que fica → apaga o card no Trello. Antes do DELETE,
 * a falha desfaz o que foi feito (e diz o que não deu). A linha da produção sai pelo fluxo PROMO: DB do n8n: o
 * PROMeiro não apaga a linha, e o card apagado sai da lista pelo registro, sem esperar o n8n.
 */
import { codigoDoCard, duplicadasDaProducao, grupoDoCard, linhasDoPeriodo, mudancasDoCard } from '../src/modelo/duplicadas.ts';
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
 * @param deps.soOlhar o modo só olhar (#67): a aba não apaga (para comparar com o relatório do n8n nos primeiros dias)
 * @param deps.promeiro o que o PROMeiro guarda do card no SQLite (servidor/app.mjs): doCard(card) → { roteiros,
 *   anexos, producoes }, reapontar(roteiros, card) e devolver(roteiros), os envios dos roteiros guardados
 */
export function criarDuplicadas({ trello, acervo, registro = null, guardarMs = 5 * 60_000, soOlhar = true, promeiro = null }) {
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
    // o card que o PROMeiro apagou não conta, mesmo antes de o n8n tirar a linha da produção
    const apagados = registro?.apagados?.() ?? new Set();
    const linhas = apagados.size ? lido.linhas.filter((l) => !apagados.has(l.card)) : lido.linhas;
    const casos = duplicadasDaProducao(linhas, { desde, pracas });
    const porId = new Map(linhasDoPeriodo(linhas, desde).map((l) => [l.card, l]));
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
    if (!ligado) return { ligado: false, soOlhar, dias, lidoEm: null, linhasLidas: 0, pendentes: 0, casos: [], resolvidas: [], totalResolvidas: 0 };
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
      soOlhar,
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
        // para apagar (#67): o código que a confirmação pede e a última mudança da linha que a tela viu
        codigo: codigoDoCard(cardId),
        modificadoEm: l.modificadoEm ?? null,
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

  /* ---------- apagar um card do caso (#67) ---------- */
  const apagando = new Set(); // os casos com um apagar em curso nesta instância
  const erroDe = (e) => (e instanceof Error ? e.message : String(e));
  const doRegistro = (l) => ({ claquete: l.claquete, arquivado: l.arquivado, status: l.status, designers: l.designers, entrada: l.entrada, entrega: l.entrega ?? null, artes: l.artesQuantidade ?? null, modificadoEm: l.modificadoEm ?? null });
  const daTela = (v = {}) => ({
    claquete: String(v.claquete ?? ''),
    arquivado: !!v.arquivado,
    status: Array.isArray(v.status) ? v.status.map(String) : [],
    designers: Array.isArray(v.designers) ? v.designers.map(String) : [],
    entrada: v.entrada ?? null,
    entrega: v.entrega ?? null,
    artes: v.artes ?? null,
    modificadoEm: v.modificadoEm ?? null,
  });

  /**
   * Apaga um card do caso: `sai` sai e `fica` fica, os dois do caso `id`; `codigo` é o que a pessoa digitou (o do card
   * que sai) e `vistos` o que a tela mostrou de cada card do caso ({ [card]: CardDaDuplicada }).
   * @returns { ok, resultado } | { status, erro, mudou?, bloqueado?, naoDesfeito? }
   */
  async function apagar(id, { dias = DIAS_PADRAO, sai, fica, codigo, vistos = {}, por }) {
    if (!ligado || !registro || !trello?.producaoDosCards) return { status: 404, erro: 'A aba Duplicadas não está configurada.' };
    if (soOlhar) return { status: 403, erro: 'A aba está no modo só olhar: apagar fica desligado enquanto o PROMeiro é comparado com o relatório do n8n.' };
    if (!trello.ligado || !trello.apagarCard) return { status: 503, erro: 'O Trello não está configurado neste servidor.' };
    if (!sai || !fica || sai === fica) return { status: 400, erro: 'Diga o card que sai e o card que fica (dois cards diferentes).' };
    if (String(codigo ?? '').trim().toLowerCase() !== codigoDoCard(sai)) return { status: 400, erro: `O código digitado não é o do card que sai (${codigoDoCard(sai)}).` };
    if (registro.apagados().has(sai)) return { status: 409, erro: 'Este card já foi apagado pelo PROMeiro.' };
    const { casos } = await casosDo(dias, false);
    const caso = casos.find((k) => k.id === id);
    if (!caso) return { status: 404, erro: 'Este caso não está mais entre as duplicadas do período.' };
    if (!caso.cards.includes(sai) || !caso.cards.includes(fica)) return { status: 400, erro: 'O card que sai e o que fica têm de ser do caso.' };
    if (apagando.has(caso.id)) return { status: 409, erro: 'Já há um card deste caso sendo apagado.' };
    apagando.add(caso.id);
    try {
      return await apagarDoCaso(caso, { sai, fica, vistos, por });
    } finally {
      apagando.delete(caso.id);
    }
  }

  async function apagarDoCaso(caso, { sai, fica, vistos, por }) {
    // relê na hora, no Teable (não no Trello): os cards existem? são do mesmo grupo? mudaram desde que a tela abriu?
    const relidas = new Map(((await trello.producaoDosCards(caso.cards)) ?? []).map((l) => [l.card, l]));
    const mudou = [];
    if (!relidas.has(sai)) mudou.push({ card: sai, campo: 'Linha da produção', antes: 'na produção', depois: 'não está mais na produção' });
    const comLinha = caso.cards.filter((c) => c !== sai && relidas.has(c));
    if (relidas.has(sai) && !comLinha.length) {
      guardadas.clear();
      return { status: 409, bloqueado: true, erro: 'O card que sai é o único do grupo com linha na produção da arte: apagar levaria a produção junto. Nada foi apagado.' };
    }
    if (!relidas.has(fica)) mudou.push({ card: fica, campo: 'Linha da produção', antes: 'na produção', depois: 'não está mais na produção' });
    for (const card of caso.cards) {
      const l = relidas.get(card);
      if (!l) continue;
      if (grupoDoCard({ nome: l.claquete, praca: l.praca }, pracas).id !== caso.id) mudou.push({ card, campo: 'Grupo', antes: caso.id, depois: 'outra claquete, praça ou versão' });
      else mudou.push(...mudancasDoCard(card, daTela(vistos[card]), doRegistro(l)));
    }
    // a leitura guardada ficou velha: o caso aberto de novo mostra o que a produção tem agora
    if (mudou.length) guardadas.clear();
    if (mudou.length) return { status: 409, mudou: mudou.map((m) => ({ ...m, codigo: codigoDoCard(m.card) })), erro: 'Os cards mudaram desde que o caso abriu. Nada foi apagado: confira de novo.' };

    const linhaSai = relidas.get(sai);
    const linhaFica = relidas.get(fica);
    const doPROMeiro = promeiro?.doCard(sai) ?? { roteiros: [], anexos: [], producoes: [] };
    // 1. a cópia completa do que o PROMeiro e o Teable têm do card, no registro, antes de mexer em qualquer coisa
    const copia = {
      codigo: codigoDoCard(sai),
      card: sai,
      url: `https://trello.com/c/${sai}`,
      fica,
      claquete: linhaSai.claquete,
      praca: caso.praca,
      versao: caso.versao,
      // a linha da produção da arte inteira, como o Postgres do Teable tem
      producaoDaArte: linhaSai.inteira ?? null,
      registro: linhaSai.registro,
      registroQueFica: linhaFica.registro,
      // o que o PROMeiro guarda do card no SQLite: os envios dos roteiros, os anexos (o PDF fica guardado, pelo id) e as
      // Produções com a linha do tempo
      ...doPROMeiro,
      feito: { religadas: [], roteiros: [], comentario: null },
    };
    const claquete = claqueteDoCaso(caso, relidas);
    const anotado = registro.anotar({ acao: 'apagar', caso: caso.id, claquete, praca: caso.praca, cards: caso.cards, card: sai, fica, por, copia, estado: 'em-curso' });
    const desfazer = async () => {
      const nao = [];
      if (copia.feito.comentario)
        await trello.apagarComentario(copia.feito.comentario).catch((e) => nao.push(`o comentário no card que fica (${erroDe(e)})`));
      if (copia.feito.roteiros.length)
        try {
          promeiro.devolver(copia.feito.roteiros);
        } catch (e) {
          nao.push(`o roteiro guardado (${erroDe(e)})`);
        }
      if (copia.feito.religadas.length)
        await acervo.religar({ de: linhaFica.registro, para: linhaSai.registro, ids: copia.feito.religadas }).catch((e) => nao.push(`${copia.feito.religadas.length === 1 ? 'a arte do acervo' : `as ${copia.feito.religadas.length} artes do acervo`} (${erroDe(e)})`));
      return nao;
    };
    let passo = '';
    try {
      // 2. as artes do acervo do card que sai passam para o card que fica (ADR 0003)
      passo = 'religar as artes do acervo';
      if (acervo?.religar)
        try {
          copia.feito.religadas = await acervo.religar({ de: linhaSai.registro, para: linhaFica.registro });
        } catch (e) {
          copia.feito.religadas = e?.religadas ?? [];
          throw e;
        }
      // 3. o roteiro guardado no PROMeiro passa a apontar para o card que fica
      passo = 'reapontar o roteiro guardado';
      if (copia.roteiros.length) {
        promeiro.reapontar(copia.roteiros, fica);
        copia.feito.roteiros = copia.roteiros;
      }
      // 4. o comentário no card que fica
      passo = 'comentar no card que fica';
      copia.feito.comentario = await trello.comentar(fica, `Duplicado …${codigoDoCard(sai)} (${linhaSai.claquete}) apagado por ${por.nome} pelo PROMeiro.`);
      // 5. o card sai do Trello (a linha da produção sai pelo fluxo PROMO: DB do n8n)
      passo = 'apagar o card no Trello';
      await trello.apagarCard(sai);
    } catch (e) {
      copia.erro = `${passo}: ${erroDe(e)}`;
      copia.naoDesfeito = await desfazer();
      registro.concluir(anotado.id, 'falhou', copia);
      console.warn(`[duplicadas] ${por.email} não apagou um card de ${claquete}: ${copia.erro}`);
      const nao = copia.naoDesfeito.length ? ` Não consegui desfazer: ${copia.naoDesfeito.join('; ')}.` : ' O que tinha sido feito foi desfeito.';
      return { status: 502, erro: `Parei ao ${copia.erro}. Nada foi apagado.${nao}`, naoDesfeito: copia.naoDesfeito };
    }
    registro.concluir(anotado.id, 'feito', copia);
    console.log(`[duplicadas] ${por.email} apagou o card …${codigoDoCard(sai)} de ${claquete} (ficou …${codigoDoCard(fica)})`);
    return { ok: true, resultado: { registro: anotado.id, card: sai, codigo: codigoDoCard(sai), fica, religadas: copia.feito.religadas.length, roteiros: copia.feito.roteiros.length, comentou: !!copia.feito.comentario } };
  }
  /** A claquete do caso, como a lista mostra (a do card que a sugestão deixa ficar). */
  const claqueteDoCaso = (caso, relidas) => relidas.get(caso.sugestao.fica)?.claquete ?? [...relidas.values()][0]?.claquete ?? '';

  return { ligado, soOlhar, listar, detalhe, ignorar, reabrir, apagar, registro: () => registro?.lista() ?? [], copia: (id) => registro?.copiaDe?.(id) ?? null };
}
