/*
 * Aba Duplicadas (#65): os cards do quadro da promo com a mesma claquete, praça e versão, no lugar do relatório
 * "PROMO: CLAQUETES DUPLICADAS" do n8n.
 *
 * Lê do Trello os cards do quadro (TRELLO_QUADRO), abertos e arquivados, criados no período (a data de criação sai do
 * id do card, como o n8n faz), em páginas, e as listas; a leitura fica guardada por alguns minutos. Da produção da arte
 * (o Postgres do Teable) vem a linha de cada card, e do acervo, as artes ligadas a cada linha. O agrupamento e a
 * sugestão de quem sai são o módulo puro src/modelo/duplicadas.ts.
 *
 * Ignorar e reabrir (#66) só anotam no registro do PROMeiro (servidor/registro-das-duplicadas.mjs): o caso ignorado
 * sai da lista e vai para Resolvidas, e volta sozinho quando entra card novo no grupo. Nada muda no Trello nem no Teable.
 */
import { agruparDuplicadas } from '../src/modelo/duplicadas.ts';
import { chaveDaClaquete, semAcento } from '../src/modelo/vocabularios.ts';
import { normalizarPraca, pracasDaConfiguracao } from '../src/modelo/pracas.ts';

const DIA = 86_400_000;
export const DIAS_PADRAO = 90;
export const DIAS_MAXIMO = 730;
// páginas de 1000 cards (o máximo do Trello); um quadro de dois anos cabe com folga
const POR_PAGINA = 1000;
const PAGINAS_NO_MAXIMO = 60;
const ID_DO_CARD = /^[0-9a-f]{24}$/i;

/** Quando o card foi criado: os 8 primeiros caracteres do id são o segundo da criação. */
export const criadoEm = (id) => parseInt(String(id).slice(0, 8), 16) * 1000;

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
 * @param deps.trello o cliente do Trello (`ler` para os GET, `config`, `producaoDosCards`)
 * @param deps.acervo o acervo de artes (`artesPorRegistro`)
 * @param deps.registro o registro das ações (servidor/registro-das-duplicadas.mjs): os casos ignorados saem da lista
 * @param deps.guardarMs por quanto tempo a leitura do quadro vale (5 min)
 */
export function criarDuplicadas({ trello, acervo, registro = null, guardarMs = 5 * 60_000 }) {
  const c = trello?.config ?? {};
  const ligado = !!(c.quadro && c.chave && c.token && trello?.ler);
  const pracas = c.pracas ?? pracasDaConfiguracao();
  const entradas = new Set([...pracas.map((p) => p.entrada), ...Object.values(c.listas ?? {})].filter(Boolean));
  const saidas = new Set([...pracas.map((p) => p.saida), c.entregues].filter(Boolean));
  // a opção do campo PRAÇA → a praça (a opção de cada praça)
  const pracaDaOpcao = Object.fromEntries(pracas.filter((p) => p.opcao).map((p) => [p.opcao, p.sigla]));
  const tipoDaLista = (id) => (saidas.has(id) ? 'saida' : entradas.has(id) ? 'entrada' : 'outra');

  /* ---------- o quadro, guardado por alguns minutos (uma leitura por período) ---------- */
  const guardadas = new Map(); // dias → { em, cards, listas } ou a promessa da leitura em curso
  async function lerQuadro(dias) {
    const desde = new Date(Date.now() - dias * DIA);
    const cards = new Map();
    let antes;
    for (let pagina = 0; pagina < PAGINAS_NO_MAXIMO; pagina++) {
      const lote = await trello.ler(`/boards/${c.quadro}/cards/all`, {
        fields: 'id,idShort,name,closed,idList,idMembers,due,shortUrl,badges',
        customFieldItems: 'true',
        limit: String(POR_PAGINA),
        since: desde.toISOString(),
        before: antes,
      });
      const novos = (Array.isArray(lote) ? lote : []).filter((x) => ID_DO_CARD.test(String(x?.id ?? '')) && !cards.has(x.id));
      if (!novos.length) break;
      for (const x of novos) cards.set(x.id, x);
      // a próxima página: antes do card mais antigo desta
      antes = novos.reduce((menor, x) => (x.id < menor ? x.id : menor), novos[0].id);
      if (criadoEm(antes) < desde.getTime()) break;
    }
    const [listas, campos] = await Promise.all([
      trello.ler(`/boards/${c.quadro}/lists`, { filter: 'all', fields: 'name,closed' }),
      c.campos?.praca ? trello.ler(`/boards/${c.quadro}/customFields`) : [],
    ]);
    // as opções do campo PRAÇA pelo texto ("SP", "REDE"…), para a opção que nenhuma praça diz
    const opcoes = (Array.isArray(campos) ? campos : []).find((f) => f?.id === c.campos.praca)?.options ?? [];
    return {
      em: new Date().toISOString(),
      cards: [...cards.values()].filter((x) => criadoEm(x.id) >= desde.getTime()),
      listas: new Map((Array.isArray(listas) ? listas : []).map((l) => [l.id, String(l.name ?? '')])),
      pracas: new Map(opcoes.filter((o) => o?.value?.text).map((o) => [o.id, normalizarPraca(String(o.value.text).trim(), pracas)])),
    };
  }
  async function quadro(dias, renovar) {
    const ja = guardadas.get(dias);
    if (ja && !renovar && (ja.then || Date.now() - Date.parse(ja.em) < guardarMs)) return ja;
    const lendo = lerQuadro(dias).then(
      (lido) => (guardadas.set(dias, lido), lido),
      (erro) => (guardadas.delete(dias), Promise.reject(erro)),
    );
    guardadas.set(dias, lendo);
    return lendo;
  }

  const pracaDoCard = (x, lido) => {
    const item = (x.customFieldItems ?? []).find((i) => i.idCustomField === c.campos?.praca);
    return item?.idValue ? (pracaDaOpcao[item.idValue] ?? lido.pracas.get(item.idValue) ?? '') : '';
  };

  /** Os casos do período, com a produção e o acervo dos cards que estão em algum. */
  async function casosDo(dias, renovar) {
    const lido = await quadro(dias, renovar);
    const comoCard = (x, producao) => ({
      id: x.id,
      nome: String(x.name ?? ''),
      praca: pracaDoCard(x, lido),
      arquivado: !!x.closed,
      lista: tipoDaLista(x.idList),
      criado: criadoEm(x.id),
      membros: (x.idMembers ?? []).length,
      temProducao: !!producao?.[x.id],
    });
    // primeiro sem a produção, para ler só a dos cards que estão em algum caso
    const candidatos = agruparDuplicadas(lido.cards.map((x) => comoCard(x, null)), pracas).flatMap((k) => k.cards);
    const producao = candidatos.length ? await trello.producaoDosCards(candidatos) : {};
    const porId = new Map(lido.cards.map((x) => [x.id, x]));
    const casos = agruparDuplicadas(candidatos.map((id) => comoCard(porId.get(id), producao)), pracas);
    return { lido, casos, producao, porId };
  }

  /** O caso ainda ignorado (a última ação dele é ignorar e não entrou card novo), ou null. */
  const ignoradoAgora = (caso, ignorados) => {
    const ignorado = ignorados.get(caso.id);
    return registro?.continuaIgnorado(ignorado, caso.cards) ? ignorado : null;
  };

  /**
   * A lista: os casos pendentes do período (com o filtro da busca, que não muda o contador), os resolvidos (ignorados)
   * do período, a data da leitura e quantos cards entraram.
   * @returns { ligado, dias, lidoEm, cardsLidos, pendentes, casos: [resumo], resolvidas: [resolvida], totalResolvidas }
   */
  async function listar({ dias = DIAS_PADRAO, busca = '', renovar = false } = {}) {
    if (!ligado) return { ligado: false, dias, lidoEm: null, cardsLidos: 0, pendentes: 0, casos: [], resolvidas: [], totalResolvidas: 0 };
    const { lido, casos, producao, porId } = await casosDo(dias, renovar);
    const artes = await artesNoAcervo();
    const ignorados = registro?.ignorados() ?? new Map();
    const termo = semAcento(busca.trim());
    const termoChave = chaveDaClaquete(busca);
    const acha = (k) => !termo || k.cards.some((id) => semAcento(String(porId.get(id)?.name ?? '')).includes(termo)) || (!!termoChave && k.chave.includes(termoChave));
    const pendentes = [];
    const resolvidas = [];
    for (const k of casos) {
      const ignorado = ignoradoAgora(k, ignorados);
      if (ignorado) resolvidas.push({ k, ignorado });
      else pendentes.push(k);
    }
    const claquete = (k) => String(porId.get(k.sugestao.fica)?.name ?? '');
    const resumo = (k) => {
      const cards = k.cards.map((id) => porId.get(id));
      return {
        id: k.id,
        claquete: claquete(k),
        praca: k.praca,
        versao: k.versao,
        secao: k.secao,
        cards: cards.length,
        abertos: cards.filter((x) => !x.closed).length,
        arquivados: cards.filter((x) => x.closed).length,
        comProducao: k.cards.filter((id) => producao[id]).length,
        artesNoAcervo: k.cards.reduce((n, id) => n + (artes[producao[id]?.registro] ?? 0), 0),
        dias: Math.floor((Date.now() - k.recente) / DIA),
      };
    };
    return {
      ligado: true,
      dias,
      lidoEm: lido.em,
      cardsLidos: lido.cards.length,
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
    registro.anotar({ acao: 'ignorar', caso: caso.id, claquete: String(porId.get(caso.sugestao.fica)?.name ?? ''), praca: caso.praca, cards: caso.cards, por, motivo });
    return { ok: true };
  }

  /** Reabrir: o caso ignorado volta para a lista (fica no registro quem reabriu). Não lê o Trello. */
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
   * Um caso aberto: cada card relido no Trello (lista, estado, anexos, membros), com a produção, o acervo e a
   * sugestão. O roteiro guardado no PROMeiro vem de quem chama (`roteiroDoCard`). null: o caso não está no período.
   */
  async function detalhe(id, { dias = DIAS_PADRAO, roteiroDoCard = () => null } = {}) {
    if (!ligado) return null;
    const { lido, casos, producao } = await casosDo(dias, false);
    const caso = casos.find((k) => k.id === id);
    if (!caso) return null;
    const artes = await artesNoAcervo();
    const cards = await Promise.all(
      caso.cards.map(async (cardId) => {
        const x = await trello.ler(`/cards/${cardId}`, {
          fields: 'id,idShort,name,closed,idList,idMembers,due,shortUrl,badges',
          customFieldItems: 'true',
          attachments: 'true',
          attachment_fields: 'name,mimeType',
          members: 'true',
          member_fields: 'fullName',
        });
        const p = producao[cardId];
        const entradaDoCampo = (x.customFieldItems ?? []).find((i) => i.idCustomField === c.campos?.entrada)?.value?.date ?? null;
        return {
          id: cardId,
          numero: Number.isFinite(Number(x.idShort)) && x.idShort != null ? Number(x.idShort) : null,
          nome: String(x.name ?? ''),
          lista: lido.listas.get(x.idList) ?? '',
          arquivado: !!x.closed,
          criado: new Date(criadoEm(cardId)).toISOString(),
          entrada: p?.entrada ?? entradaDoCampo,
          exibicao: x.due ?? null,
          status: p?.status ?? [],
          designers: p?.designers ?? [],
          membros: (x.members ?? []).map((m) => String(m?.fullName ?? '')).filter(Boolean),
          checklist: Number(x.badges?.checkItems ?? 0),
          anexos: resumoDosAnexos(x.attachments),
          producao: !!p,
          acervo: p ? (artes[p.registro] ?? 0) : 0,
          roteiro: roteiroDoCard(cardId),
          url: String(x.shortUrl || `https://trello.com/c/${cardId}`),
          motivo: caso.sugestao.motivos[cardId],
        };
      }),
    );
    return {
      id: caso.id,
      claquete: cards.find((x) => x.id === caso.sugestao.fica)?.nome ?? '',
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
