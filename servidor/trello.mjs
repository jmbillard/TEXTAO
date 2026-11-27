/* Envio do roteiro para o Trello, no lugar do fluxo "upload_roteiros" do n8n.
   Cria o card na lista certa, com a checklist das artes, os campos (praça, redator, editor, prioridade,
   projeto, output, BOT, entrada), o PDF anexo e, quando a atração é uma sessão de filmes, o vínculo com
   o card do filme. Depois registra a entrada na tabela de produção da arte do Teable.
   Tudo o que é ID do quadro e das tabelas vem do ambiente: este repositório é público. */

import { abrirPg, nomeLimpoPg, nomesDoPg } from './pauta.mjs';
import { tabelaNoPg } from './tabelas-do-teable.mjs';
import { TABELAS_DO_TEABLE } from '../src/modelo/tabelasDoTeable.ts';
import { gerarPdf } from './pdf.mjs';
import { normalizarKey } from './cadastros.mjs';
import { claquetePadrao, jaFoiExibida } from '../src/modelo/vocabularios.ts';
import { claqueteNoPadrao } from '../src/modelo/correcaoDeGrafia.ts';
import { alternativa, palavrasDoComeco, palavrasDoFim, pracaDaSigla, pracaPadrao, pracasDaConfiguracao, pracasRegistradas } from '../src/modelo/pracas.ts';
import { chaveDeArte } from '../src/modelo/diferencas.ts';
import { opcaoDaPracaDosFilmes } from '../src/modelo/ligarOsFilmes.ts';
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';

const NOME_SQL = /^[A-Za-z0-9_]+$/;
const API_PADRAO = 'https://api.trello.com/1';

/** Chave da claquete como o n8n e a pauta escrevem: "Quem Ama(Prologo)26/10 Rede" → "QUEM AMA PROLOGO 26 10 REDE". */
export const chaveN8n = (claquete) =>
  String(claquete || '')
    .toUpperCase()
    .replaceAll('&', 'E')
    .replace(/MNT/, '')
    .replaceAll(/[-()/_+.]/g, ' ')
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();

/** As regex da praça na claquete, para a chave da atração: a do começo com a atração no parêntese ("RIO(CHEF)") e a do
    começo ou do fim ("RIO CHEF", "RIO-CHEF", "CHEF SP"). Uma vez por lista de praças. */
const pracaNaAtracao = new WeakMap();
function regexDaPracaNaAtracao(pracas) {
  let re = pracaNaAtracao.get(pracas);
  if (!re) {
    const comeco = alternativa(palavrasDoComeco(pracas));
    const fim = alternativa(palavrasDoFim(pracas));
    const nada = /(?!)/;
    re = {
      parentese: comeco ? new RegExp(`^(?:${comeco})\\s*\\(([^)]*)\\)\\s*`) : nada,
      pontas: new RegExp([comeco && `^(?:${comeco})[\\s-]+`, fim && `\\s+(?:${fim})$`].filter(Boolean).join('|') || nada.source),
    };
    pracaNaAtracao.set(pracas, re);
  }
  return re;
}

/** A atração dentro da claquete, para casar com os padrões do cadastro (a mesma regra do n8n). */
export const chaveDaAtracao = (claquete, pracas = pracasRegistradas()) =>
  String(claquete || '')
    .toUpperCase()
    .replaceAll(/_/g, ' ')
    // a praça na frente: "RIO CHEF...", "RIO-CHEF..." ou com a atração no parêntese, "RIO(CHEF)MANUT"; ou no fim, "CHEF SP"
    .replace(regexDaPracaNaAtracao(pracas).parentese, '$1 ')
    .replace(regexDaPracaNaAtracao(pracas).pontas, '')
    .replace(/\sOPÇÃO|\sOPCAO/, ' ')
    .replace(/\).*$/, ')')
    .replace(/FUT[\s(]+COPA BR.*/, 'FUT COPA BR')
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/\s+(DAI|PRACAS|ESCALADA|EMMY|TESTE|SEMANA|AESP|CAMPEAO|ESTREIA|MANUT|\d+SEG)\b.*$/i, '')
    .replace(/\d+ [EA] /, '')
    .replace(/\s+\d+\/\d+.*$/, '')
    .replace(/^VT.*/, 'VT')
    .replace(/^FANT.*/, 'FANT')
    .replace(/^TRIBUTO.*/, 'TRIBUTO')
    .replace(/^VERT.*/, 'VERT')
    .replace(/^3GRACAS.*/, '3GRACAS')
    .replace(/^VALE.*/, 'VALE')
    .replace(/^S\sGPLAY.*/, 'S GPLAY')
    .replace(/^CALDEIRAO.*/, 'CALDEIRAO')
    .replace(/^NOSTRA.*/, 'NOSTRA')
    .replace(/^MILTON.*/, 'MILTON')
    .replace(/^NIP\s|\sNIP\s|\sNIP$/, ' ')
    .replace(/-.*$/, '')
    .replaceAll(/[.-]/g, ' ')
    .replaceAll('&', 'E')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s[A-Z]{1}$/, '')
    .replaceAll(/\s+/g, ' ')
    .trim();

/** Comparação de claquetes escritas de jeitos diferentes ("Festa_19_11" e "Festa 19/11"; "(DIA)" e "(D)", #118: o
    PROMeiro grava o código de versão no padrão, e o que veio antes, ou de fora, pode estar em outra grafia). */
const comparavel = (claquete) => chaveN8n(claqueteNoPadrao(String(claquete || '').trim())).replace(/ /g, '');
const mesmaClaquete = (a, b) => comparavel(a) === comparavel(b);

/** O que o cadastro escreve quando não sabe o caminho (o card fica sem; a importação do acervo também ignora). */
export const SEM_CAMINHO = /^(cole_aqui_o_caminho|caminho_nao_encontrado)$/;
const caminho = (v) => (v && !SEM_CAMINHO.test(String(v).trim()) ? String(v).trim() : '');

/** "G5=abc,SP=def" → { G5: 'abc', SP: 'def' } */
const pares = (v) =>
  Object.fromEntries(
    String(v || '')
      .split(',')
      .map((p) => p.split('=').map((x) => x.trim()))
      .filter(([k, val]) => k && val),
  );

export function configDoTrello(env) {
  const c = {
    // colado com espaço, quebra de linha ou aspas no Portainer: vale só o valor
    chave: nomeLimpoPg(env.TRELLO_KEY),
    token: nomeLimpoPg(env.TRELLO_TOKEN),
    // as praças, cada uma com a sua entrada, a sua saída e a sua opção do campo Praça (RJ e G5 podem repetir a mesma
    // lista): a coleção salva na Configuração ou, sem ela, as de fábrica com as variáveis de hoje
    pracas: pracasDaConfiguracao(env),
    // a reserva de quem não tiver entrada (TRELLO_LISTA) e a lista do VT
    listas: { padrao: env.TRELLO_LISTA || '', VT: env.TRELLO_LISTA_VT || '' },
    // o quadro da promo (opcional: a aba Duplicadas não precisa dele) e a lista dos projetos entregues, que no caso
    // aberto da aba Duplicadas conta como saída
    quadro: nomeLimpoPg(env.TRELLO_QUADRO),
    entregues: nomeLimpoPg(env.TRELLO_LISTA_ENTREGUES),
    campos: {
      praca: env.TRELLO_CAMPO_PRACA || '',
      redator: env.TRELLO_CAMPO_REDATOR || '',
      editor: env.TRELLO_CAMPO_EDITOR || '',
      prioridade: env.TRELLO_CAMPO_PRIORIDADE || '',
      projeto: env.TRELLO_CAMPO_PROJETO || '',
      output: env.TRELLO_CAMPO_OUTPUT || '',
      bot: env.TRELLO_CAMPO_BOT || '',
      entrada: env.TRELLO_CAMPO_ENTRADA || '',
      complexidade: nomeLimpoPg(env.TRELLO_CAMPO_COMPLEXIDADE),
      // campos copiados do card do filme (complexidade, uso de IA)
      doFilme: String(env.TRELLO_CAMPOS_FILME || '').split(',').map((s) => s.trim()).filter(Boolean),
    },
    prioridadeAlta: env.TRELLO_PRIORIDADE_ALTA || '',
    // as opções do campo Complexidade, na ordem BAIXA, MÉDIA, ALTA (o nível 1 é a primeira)
    complexidades: String(env.TRELLO_COMPLEXIDADE_OPCOES || '').split(',').map((s) => s.trim()),
    // os cards de filme da prévia (aba Filmes), como o fluxo CARDS do n8n: a lista dos filmes, as etiquetas (todas
    // ou por sessão, "SUPERCINE=id"), a opção da praça e a prioridade MÉDIA do inédito. A praça é a sigla de uma das
    // praças (a Configuração, #75: o card leva a opção dela no campo Praça) ou, como no Portainer de hoje, o id da opção
    filmes: {
      lista: nomeLimpoPg(env.TRELLO_LISTA_FILMES),
      etiquetas: String(env.TRELLO_FILMES_ETIQUETAS || '').split(',').map((s) => s.trim()).filter(Boolean),
      etiquetasDaSessao: pares(env.TRELLO_FILMES_ETIQUETAS_SESSAO),
      praca: opcaoDaPracaDosFilmes(nomeLimpoPg(env.TRELLO_FILMES_PRACA), pracasDaConfiguracao(env)),
      prioridadeMedia: nomeLimpoPg(env.TRELLO_PRIORIDADE_MEDIA),
    },
    teable: {
      url: (env.TEABLE_URL || '').replace(/\/+$/, ''),
      token: env.TEABLE_TOKEN || env.TEABLE_TOKEN_ESCRITA || '',
      producao: env.TEABLE_ARTE_PRODUCAO || '',
      redatores: env.TEABLE_REDATORES || '',
      editores: env.TEABLE_EDITORES || '',
      keysRedatores: env.TEABLE_KEY_REDATORES || '',
      // os filmes (o cadastro e o campo do pôster, pelo ID) e as exibições: onde o envio da aba Filmes grava
      filmes: env.TEABLE_FILMES || '',
      posterDoFilme: env.TEABLE_FILMES_POSTER || '',
      exibicoes: env.TEABLE_EXIBICOES || '',
    },
    pg: {
      url: env.TEABLE_PG_URL || '',
      // limpos do mesmo jeito que a pauta (aspas, espaços, "esquema.tabela")
      esquema: nomesDoPg(env, '').esquema,
      // os nomes no Postgres vêm do Teable (#76: as tabelas achadas pelo nome na base, servidor/tabelas-do-teable.mjs)
      producao: tabelaNoPg(env, 'ARTE_producao'),
      redatores: tabelaNoPg(env, 'redatores'),
      editores: tabelaNoPg(env, 'editores'),
      atracoes: tabelaNoPg(env, 'atracoes'),
      prioridade: tabelaNoPg(env, 'prioridade'),
      // exibições de filme (filme + sessão + dia + card da prévia), na mesma base
      exibicoes: tabelaNoPg(env, 'exibicoes'),
      // o cadastro dos filmes, com os caminhos que o Teable calcula (as fórmulas projeto_win, output_win…)
      filmes: tabelaNoPg(env, 'filmes'),
    },
    // conversão fiel do original (Word, RTF) para PDF, com LibreOffice; sem ele, o PDF sai do roteiro como chegou
    stirling: { url: (env.STIRLING_URL || '').replace(/\/+$/, ''), chave: env.STIRLING_CHAVE || '' },
    sftp: {
      host: env.SFTP_HOST || '',
      porta: Number(env.SFTP_PORTA) || 22,
      usuario: env.SFTP_USUARIO || '',
      senha: env.SFTP_SENHA || '',
      pasta: (env.SFTP_PASTA || '/PROMO/WORKFLOWS/ROTEIROS').replace(/\/+$/, ''),
    },
    endereco: (env.PROMEIRO_URL || '').replace(/\/+$/, ''),
  };
  c.ligado = !!(c.chave && c.token && (c.listas.padrao || c.pracas.some((p) => p.entrada)));
  // nomes que entram no SQL: só letras, números e _; o que sobrar inválido é avisado na partida
  c.pgInvalidos = [];
  for (const k of Object.keys(c.pg))
    if (!['url', 'pgInvalidos'].includes(k) && c.pg[k] && !NOME_SQL.test(c.pg[k])) {
      c.pgInvalidos.push(k);
      c.pg[k] = '';
    }
  return c;
}

/** O que falta configurar, para o log da partida. */
export function faltasDoTrello(c) {
  if (!c.chave && !c.token) return null;
  const f = [];
  if (!c.chave) f.push('TRELLO_KEY');
  if (!c.token) f.push('TRELLO_TOKEN');
  if (!c.listas.padrao && !c.pracas.some((p) => p.entrada)) f.push(`a entrada de uma praça (${c.pracas.map((p) => `TRELLO_LISTA_${p.sigla}`).join(', ')})`);
  return f;
}

/** A checklist das artes do card: a que o envio cria (e o card recriado, #68). */
const CHECKLIST_DAS_ARTES = 'ARTES PRODUZIDAS';

/** A descrição do card que o envio cria: as artes identificadas, as que já existem e os caminhos a preencher. */
function descricaoDoCard(artes, existentes) {
  return [
    '**ARTES IDENTIFICADAS:**',
    artes.length ? '`' + artes.join('`, `') + '`' : '—',
    ...(existentes.length ? ['', '**JÁ EXISTEM (não produzir):**', '`' + existentes.join('`, `') + '`'] : []),
    '',
    '---',
    '**CAMINHO DO PROJETO:**',
    '``',
    '',
    '---',
    '**CAMINHO DAS ARTES:**',
    '``',
    '',
  ].join('\n');
}

/** A complexidade da arte que chegou no envio: 1, 2 ou 3 (BAIXA, MÉDIA, ALTA); o resto vale BAIXA. */
export const nivelDeComplexidade = (v) => ([1, 2, 3].includes(Number(v)) ? Number(v) : 1);

/** A complexidade do card: a maior das artes a produzir (a que já existe não conta); sem nenhuma, BAIXA. */
export const complexidadeDoCard = (lista) => Math.max(1, ...lista.filter((a) => !a.existe).map((a) => nivelDeComplexidade(a.complexidade)));

/** Os itens do checklist: um por arte, ou um por tipo quando a arte tem mais de um ("HOJE (RDP)", "HOJE (CRT)"),
    porque cada tipo é uma produção. A que já existe fica de fora. */
export function itensDoChecklist(lista) {
  return lista.filter((a) => !a.existe).flatMap((a) => (a.tipos?.length > 1 ? a.tipos.map((t) => `${a.texto} (${t})`) : [a.texto]));
}

/**
 * Quantas artes a coluna "artes" da produção da arte tem, cada uma uma vez (a conta de `artesUnicas`, a da lista do
 * editor): a mesma chave de arte (`chaveDeArte`: sem acento, caixa e pontuação) conta uma vez, e a arte com mais de um
 * tipo, que o envio escreve uma vez por tipo ("HOJE (RDP) | HOJE (CRT)", veja `itensDoChecklist`), também. Os
 * parênteses só são tipo quando o mesmo começo aparece com dois ou mais: "ELIANA (AO VIVO)" sozinho é o texto da arte.
 * Vazio ou nulo: null (fica a contagem do PROMeiro).
 */
export function artesDaProducao(texto) {
  const itens = String(texto ?? '').split(/\s*\|\s*|\n+/);
  return artesAgrupadas(itens).length || null;
}

/**
 * As artes dos itens da coluna "artes" (ou do checklist), cada uma uma vez, na ordem, pela regra de `artesDaProducao`
 * (#146): a arte de vários tipos ("HOJE (RDP)", "HOJE (CRT)") é uma só, com o nome sem o tipo e os itens dela.
 * @returns [{ nome, itens }]
 */
export function artesAgrupadas(itens) {
  const lista = (itens ?? []).map((a) => String(a ?? '').trim()).filter((a) => chaveDeArte(a));
  const comTipo = lista.map((a) => /^(.*\S)\s*\([^()]*\)$/.exec(a)?.[1] ?? '');
  const vezes = new Map();
  for (const b of comTipo) if (b) vezes.set(chaveDeArte(b), (vezes.get(chaveDeArte(b)) ?? 0) + 1);
  const grupos = new Map();
  lista.forEach((a, i) => {
    const junta = comTipo[i] && vezes.get(chaveDeArte(comTipo[i])) > 1;
    const k = junta ? chaveDeArte(comTipo[i]) : chaveDeArte(a);
    if (!grupos.has(k)) grupos.set(k, { nome: junta ? comTipo[i] : a, itens: [] });
    const g = grupos.get(k);
    if (!g.itens.some((x) => chaveDeArte(x) === chaveDeArte(a))) g.itens.push(a);
  });
  return [...grupos.values()];
}

/**
 * @param env variáveis de ambiente
 * @param deps.buscar fetch
 * @param deps.consultar (sql, params) => linhas; sem ele, abre o Postgres de TEABLE_PG_URL (com deps.abrirPg, se vier)
 * @param deps.sftp (caminho, buffer) => Promise; sem ele, usa ssh2-sftp-client quando SFTP_HOST existe
 * @param deps.agora () => Date; o relógio da lista de prioridade no andamento (o envio usa o `agora` do próprio envio)
 * @param deps.anexos os anexos guardados pelo PROMeiro (servidor/anexos.mjs, #90): o PDF do envio fica lá, ligado ao
 *   card da Produção (nenhum link do PDF vai ao Teable)
 */
export function criarTrello(env, deps = {}) {
  const c = configDoTrello(env);
  const buscar = deps.buscar ?? fetch;
  const relogio = deps.agora ?? (() => new Date());
  const API = (env.TRELLO_API || API_PADRAO).replace(/\/+$/, '');
  let banco = null;
  const consultar =
    deps.consultar ??
    (c.pg.url
      ? async (sql, params = []) => {
          banco ??= await (deps.abrirPg ?? abrirPg)(c.pg.url);
          return (await banco.query(sql, params)).rows;
        }
      : null);
  const tabela = (esquema, nome) => (esquema && nome ? `"${esquema}"."${nome}"` : null);
  const t = {
    producao: tabela(c.pg.esquema, c.pg.producao),
    redatores: tabela(c.pg.esquema, c.pg.redatores),
    editores: tabela(c.pg.esquema, c.pg.editores),
    atracoes: tabela(c.pg.esquema, c.pg.atracoes),
    prioridade: tabela(c.pg.esquema, c.pg.prioridade),
    exibicoes: tabela(c.pg.esquema, c.pg.exibicoes),
    filmes: tabela(c.pg.esquema, c.pg.filmes),
  };
  async function sql(texto, params) {
    if (!consultar) return [];
    return consultar(texto, params);
  }

  /* ---------- Trello ---------- */
  const autenticar = (url) => `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(c.chave)}&token=${encodeURIComponent(c.token)}`;
  async function trello(metodo, rota, { consulta, corpo, form } = {}) {
    const qs = consulta ? `?${new URLSearchParams(Object.entries(consulta).filter(([, v]) => v !== undefined && v !== ''))}` : '';
    const r = await buscar(autenticar(`${API}${rota}${qs}`), {
      method: metodo,
      headers: corpo ? { 'content-type': 'application/json' } : undefined,
      body: form ?? (corpo ? JSON.stringify(corpo) : undefined),
      signal: AbortSignal.timeout(30_000),
    });
    // a rota pode ter o token (os webhooks do token, #87): nem ele nem os ids vão para a mensagem
    if (!r.ok) throw new Error(`Trello respondeu ${r.status} em ${metodo} ${(c.token ? rota.split(c.token).join('…') : rota).replace(/\/[0-9a-f]{24}/g, '/…')}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
    return r.json().catch(() => ({}));
  }
  /** Um GET que devolve null quando o Trello não tem mais o que foi pedido (o card apagado: 404; o id que não vale: 400). */
  async function lerSeExistir(rota, consulta) {
    try {
      return await trello('GET', rota, { consulta });
    } catch (e) {
      if (/^Trello respondeu (404|400) /.test(e instanceof Error ? e.message : '')) return null;
      throw e;
    }
  }
  const campo = (card, idCampo, corpo) => (idCampo ? trello('PUT', `/cards/${card}/customField/${idCampo}/item`, { corpo }) : null);
  // a sessão de filme copia o campo Complexidade do card do filme (TRELLO_CAMPOS_FILME)?
  const copiaComplexidadeDoFilme = !!c.campos.complexidade && c.campos.doFilme.includes(c.campos.complexidade);
  /** A complexidade do card do filme (1–3), pela ordem de TRELLO_COMPLEXIDADE_OPCOES; sem o campo, ou com uma opção
      fora das três configuradas, 0 (vale a da revisão). */
  const nivelDoFilme = (doFilme) => {
    if (!copiaComplexidadeDoFilme) return 0;
    const item = (doFilme?.customFieldItems ?? []).find((i) => i.idCustomField === c.campos.complexidade);
    return item?.idValue ? c.complexidades.slice(0, 3).indexOf(item.idValue) + 1 : 0;
  };

  /**
   * Um card com o que vier: lista, nome, descrição, etiquetas, data, checklist, campos e anexos (por URL ou arquivo).
   * Sem o card, falha; o resto que der errado vira aviso. É o mesmo caminho do envio de roteiros, para outros usos
   * (os cards de filme da prévia, por exemplo).
   */
  async function criarCard({ lista, nome, desc = '', etiquetas = [], data, posicao, checklist, campos = {}, anexos = [] }, avisos = []) {
    const tentar = async (o_que, f) => {
      try {
        return await f();
      } catch (e) {
        avisos.push(`${o_que}: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    };
    // no corpo, não no endereço: muitas artes estourariam o tamanho da URL
    const card = await trello('POST', '/cards', {
      corpo: { idList: lista, name: nome, desc, ...(etiquetas.length ? { idLabels: etiquetas.join(',') } : {}), ...(data ? { due: data } : {}), ...(posicao ? { pos: posicao } : {}) },
    });
    if (!card?.id) throw new Error('O Trello não devolveu o card criado.');
    if (checklist?.itens?.length)
      await tentar('criar a checklist', async () => {
        const l = await trello('POST', '/checklists', { consulta: { idCard: card.id, name: checklist.nome } });
        for (const item of checklist.itens) await trello('POST', `/checklists/${l.id}/checkItems`, { consulta: { name: item } });
      });
    await Promise.all(Object.entries(campos).map(([id, corpo]) => tentar(`preencher o campo ${id}`, () => campo(card.id, id, corpo))));
    const anexados = [];
    for (const a of anexos)
      anexados.push(
        await tentar(`anexar ${a.nome ?? a.url}`, () => {
          if (a.url) return trello('POST', `/cards/${card.id}/attachments`, { consulta: { url: a.url } });
          const form = new FormData();
          form.append('name', a.nome);
          form.append('mimeType', a.tipo);
          form.append('file', new Blob([a.dados], { type: a.tipo }), a.nome);
          if (a.capa) form.append('setCover', 'true');
          return trello('POST', `/cards/${card.id}/attachments`, { form });
        }),
      );
    return { id: card.id, url: card.shortUrl || card.url || `https://trello.com/c/${card.id}`, anexos: anexados, avisos };
  }

  /** Um card que já existe: o nome, a descrição, o link e as checklists (com os nomes dos itens). */
  async function lerCard(id) {
    const card = await trello('GET', `/cards/${id}`, { consulta: { fields: 'id,name,desc,due,shortUrl,url' } });
    if (!card?.id) throw new Error('O card não foi encontrado no Trello.');
    const listas = await trello('GET', `/cards/${id}/checklists`, { consulta: { fields: 'name', checkItem_fields: 'name' } });
    return {
      id: card.id,
      url: card.shortUrl || card.url || `https://trello.com/c/${card.id}`,
      nome: String(card.name ?? ''),
      desc: String(card.desc ?? ''),
      checklists: (Array.isArray(listas) ? listas : []).map((l) => ({ id: l.id, nome: String(l.name ?? ''), itens: (l.checkItems ?? []).map((i) => String(i.name ?? '')) })),
    };
  }

  /**
   * Muda um card que já existe: o nome, a descrição e a data (os que vierem) e os itens novos na checklist (criada
   * quando não há uma com esse nome). Sem mudar o card, falha; os itens que não entrarem viram aviso.
   */
  async function mudarCard(id, { nome, desc, data, checklist }, avisos = []) {
    await trello('PUT', `/cards/${id}`, { corpo: { ...(nome !== undefined ? { name: nome } : {}), ...(desc !== undefined ? { desc } : {}), ...(data ? { due: data } : {}) } });
    if (!checklist?.itens?.length) return;
    try {
      let lista = checklist.id ? { id: checklist.id } : null;
      lista ??= await trello('POST', '/checklists', { consulta: { idCard: id, name: checklist.nome } });
      for (const item of checklist.itens) await trello('POST', `/checklists/${lista.id}/checkItems`, { consulta: { name: item } });
    } catch (e) {
      avisos.push(`acrescentar à checklist: ${e instanceof Error ? e.message : e}`);
    }
  }

  /* ---------- Teable (escrita pela API) ---------- */
  async function teableCriar(tabelaId, campos) {
    if (!c.teable.url || !c.teable.token || !tabelaId) return null;
    const r = await buscar(`${c.teable.url}/api/table/${encodeURIComponent(tabelaId)}/record`, {
      method: 'POST',
      headers: { authorization: `Bearer ${c.teable.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ typecast: true, records: [{ fields: campos }] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Teable respondeu ${r.status} ao gravar em ${tabelaId}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
    return r.json().catch(() => ({}));
  }

  async function teableAtualizar(tabelaId, recId, campos) {
    if (!c.teable.url || !c.teable.token || !tabelaId || !recId) return null;
    const r = await buscar(`${c.teable.url}/api/table/${encodeURIComponent(tabelaId)}/record/${encodeURIComponent(recId)}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${c.teable.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fieldKeyType: 'name', typecast: true, record: { fields: campos } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Teable respondeu ${r.status} ao atualizar ${tabelaId}`);
    return r.json().catch(() => ({}));
  }

  /** Sobe um arquivo para um campo de anexo do Teable (o pôster no cadastro do filme): o registro volta com o campo. */
  async function teableAnexar(tabelaId, recId, campoId, { nome, tipo, dados }) {
    if (!c.teable.url || !c.teable.token) throw new Error('O Teable não está configurado (TEABLE_URL e TEABLE_TOKEN).');
    const form = new FormData();
    form.append('file', new Blob([dados], { type: tipo }), nome);
    const r = await buscar(`${c.teable.url}/api/table/${encodeURIComponent(tabelaId)}/record/${encodeURIComponent(recId)}/${encodeURIComponent(campoId)}/uploadAttachment`, {
      method: 'POST',
      headers: { authorization: `Bearer ${c.teable.token}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`Teable respondeu ${r.status} ao anexar em ${tabelaId}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
    return r.json().catch(() => ({}));
  }

  /* ---------- o que o n8n descobria no Postgres ---------- */

  /** Já entrou hoje na produção da arte (pelo PROMeiro ou pelo upload antigo)? */
  async function jaEntrouHoje(claquete) {
    if (!t.producao) return false;
    // "hoje" é o dia de Brasília, não o do relógio UTC do banco
    const linhas = await sql(
      `SELECT "claquete" FROM ${t.producao} WHERE ("data_entrada" AT TIME ZONE 'America/Sao_Paulo')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
    );
    return linhas.some((l) => mesmaClaquete(l.claquete, claquete));
  }

  async function acharRedator(nome) {
    if (!nome) return null;
    let campoId = c.campos.redator;
    let existente = null;
    if (t.redatores) {
      // pelo nome ou por uma das keys (KEY_redatores: o autor do Word, o login); a linha que já tem opção no Trello vem primeiro
      const [l] = await sql(
        `SELECT "__id" AS id, "redator", "redator_ID", "customField_ID" FROM ${t.redatores}
         WHERE UPPER("redator") = UPPER($1)
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE("key", '[]')::jsonb) AS k WHERE k->>'title' = $2)
         ORDER BY ("redator_ID" IS NULL OR "redator_ID" = '') LIMIT 1`,
        [nome, normalizarKey(nome)],
      );
      if (l?.redator_ID) {
        if (!deOutroCampo(l.customField_ID, c.campos.redator)) return { idValue: l.redator_ID, nome: l.redator, campo: l.customField_ID || campoId };
        return recriarOpcao(c.campos.redator, l.redator, (op) => (l.id ? teableAtualizar(c.teable.redatores, l.id, { redator_ID: op, customField_ID: c.campos.redator }) : null));
      }
      if (!campoId) campoId = (await sql(`SELECT MAX("customField_ID") AS id FROM ${t.redatores}`))[0]?.id || '';
      if (l) existente = l;
    }
    if (!campoId) return null;
    // sem opção no Trello: cria a opção; a linha que já existia é completada, senão nasce uma nova
    const nomeNoCard = existente?.redator || nome;
    const op = await trello('POST', `/customField/${campoId}/options`, { corpo: { pos: 'bottom', value: { text: nomeNoCard } } });
    if (!op?.id) return null;
    if (existente?.id) await teableAtualizar(c.teable.redatores, existente.id, { redator_ID: op.id, customField_ID: campoId }).catch(() => {});
    else {
      const novo = await teableCriar(c.teable.redatores, { redator: nome, redator_ID: op.id, customField_ID: campoId }).catch(() => null);
      const id = novo?.records?.[0]?.id;
      if (id && normalizarKey(nome)) await teableCriar(c.teable.keysRedatores, { key: normalizarKey(nome), redator: [{ id }] }).catch(() => {});
    }
    return { idValue: op.id, nome: nomeNoCard, campo: campoId };
  }

  async function acharEditor(nome) {
    if (!nome || !t.editores) return null;
    const [l] = await sql(`SELECT "__id" AS id, "editor", "editor_ID", "customField_ID" FROM ${t.editores} WHERE "editor" = $1 LIMIT 1`, [nome]);
    if (!l?.editor_ID) return null;
    if (!deOutroCampo(l.customField_ID, c.campos.editor)) return { idValue: l.editor_ID, nome: l.editor, campo: l.customField_ID || c.campos.editor };
    return recriarOpcao(c.campos.editor, l.editor, (op) => (l.id && c.teable.editores ? teableAtualizar(c.teable.editores, l.id, { editor_ID: op, customField_ID: c.campos.editor }) : null));
  }

  /* Trocado o quadro (#76), o redator e o editor guardam no Teable a opção do campo do quadro velho (customField_ID
     é outro campo). A opção é recriada no campo de agora quando a pessoa vai para um card (nada em massa): a que já
     existe com o nome dela é usada; senão, o PROMeiro cria. A linha do Teable passa a guardar a opção nova. */
  const deOutroCampo = (guardado, atual) => !!(atual && guardado && guardado !== atual);
  async function recriarOpcao(campoId, nome, gravarNoTeable) {
    const lido = await lerSeExistir(`/customFields/${campoId}`);
    const igual = (lido?.options ?? []).filter((o) => nomeComparavel(o.value?.text) === nomeComparavel(nome));
    const op = igual.length === 1 ? igual[0].id : (await criarOpcao(campoId, nome))?.id;
    if (!op) return null;
    await Promise.resolve(gravarNoTeable(op)).catch((e) => console.warn(`[trello] a opção nova de ${nome} não foi guardada no Teable: ${e instanceof Error ? e.message : e}`));
    return { idValue: op, nome, campo: campoId };
  }

  async function acharAtracao(claquete, nome) {
    if (!t.atracoes) return null;
    // a atração escolhida na revisão vale mais que a key da claquete (DONA serve a mais de uma novela)
    if (nome) {
      const [n] = await sql(`SELECT "atracao", "projeto_win", "output_win" FROM ${t.atracoes} WHERE LOWER("atracao") = LOWER($1) LIMIT 1`, [nome]);
      if (n) return { nome: n.atracao, projeto: caminho(n.projeto_win), output: caminho(n.output_win) };
    }
    const chave = chaveDaAtracao(claquete, c.pracas);
    if (!chave) return null;
    const [l] = await sql(
      `SELECT "atracao", "projeto_win", "output_win" FROM ${t.atracoes}
       WHERE EXISTS (SELECT 1 FROM jsonb_array_elements("pattern"::jsonb) AS e WHERE UPPER(e->>'title') LIKE UPPER($1) || '%')
       ORDER BY "atracao" DESC LIMIT 1`,
      [chave],
    );
    return l ? { nome: l.atracao, projeto: caminho(l.projeto_win), output: caminho(l.output_win) } : null;
  }

  /**
   * As chaves (dentre estas) que são prioridade agora, como no fluxo PRIORIDADE do n8n: a key está numa lista de hoje em
   * diante (a tabela guarda uma lista por dia, o histórico inteiro) e a claquete dela ainda não foi exibida.
   */
  async function chavesPrioritarias(chaves, agora) {
    const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD no horário de Brasília
    const linhas = await sql(
      `SELECT "key", "claquete" FROM ${t.prioridade}
       WHERE "key" = ANY($1::text[]) AND ("data" AT TIME ZONE 'America/Sao_Paulo')::date >= $2::date`,
      [chaves, hoje],
    );
    return new Set(linhas.filter((l) => !jaFoiExibida(l.claquete ?? '', agora)).map((l) => l.key));
  }

  /** Alguma das keys está na lista de prioridade (a da claquete como chegou e a dela no padrão, #118). */
  async function prioridadeAlta(chaves, agora) {
    const validas = [...new Set(chaves.filter(Boolean))];
    if (!t.prioridade || !c.prioridadeAlta || !validas.length) return false;
    const na = await chavesPrioritarias(validas, agora);
    return validas.some((k) => na.has(k));
  }

  /** Atração que é sessão de filme: a exibição do dia (exibicoes) dá o card da prévia e o filme. */
  async function cardDoFilme(atracao, dataExibicao) {
    if (!atracao || !dataExibicao || !t.exibicoes) return null;
    const [l] = await sql(
      `SELECT "card_ID", "output", "filme" FROM ${t.exibicoes}
       WHERE UPPER("sessao"::jsonb->>'title') = UPPER($1) AND "data_de_exibicao"::date = $2::date
         AND NOT (COALESCE("labels"::jsonb, '[]'::jsonb) @> '["CANCELADO"]'::jsonb) LIMIT 1`,
      [atracao, dataExibicao],
    );
    if (!l?.card_ID) return null;
    let filme = l.filme;
    try {
      if (typeof filme === 'string') filme = JSON.parse(filme);
    } catch {
      filme = null;
    }
    return { card: l.card_ID, output: caminho(l.output), filmeId: (Array.isArray(filme) ? filme[0] : filme)?.id ?? '' };
  }

  /* ---------- arquivo ---------- */

  /** O Trello só mostra PDF: o PDF que subiu vai como veio; Word, RTF, texto e colado viram PDF aqui mesmo. */
  async function emPdf(r, artes) {
    // o PDF do card é sempre o roteiro como chegou: nada da revisão entra nele (só no checklist e nos campos)
    if (r.original && /\.pdf$/i.test(r.original.nome)) return { ...r.original, tipo: 'application/pdf' };
    const base = (r.original?.nome ?? String(r.meta.claquete || 'roteiro')).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_');
    if (r.original && c.stirling.url) {
      try {
        return { nome: `${base}.pdf`, tipo: 'application/pdf', dados: await converterNoStirling(r.original) };
      } catch (e) {
        console.warn(`[trello] o Stirling não converteu ${r.original.nome}: ${e instanceof Error ? e.message : e}; vai o PDF do roteiro como chegou`);
      }
    }
    // sem conversão fiel: o texto do original, com o sublinhado exatamente como o redator deixou
    if (Array.isArray(r.textoOriginal) && r.textoOriginal.length)
      return { nome: `${base}.pdf`, tipo: 'application/pdf', dados: await gerarPdf({ meta: r.metaOriginal ?? r.meta, pars: r.textoOriginal, artes: [] }) };
    // roteiro guardado antes disso: o que foi importado (a primeira versão), sem a lista de artes que o original não tem
    if (r.docOriginal) return { nome: `${base}.pdf`, tipo: 'application/pdf', dados: await gerarPdf({ meta: r.metaOriginal ?? r.meta, doc: r.docOriginal, artes: [] }) };
    return { nome: `${base}.pdf`, tipo: 'application/pdf', dados: await gerarPdf({ meta: r.meta, doc: r.doc, artes }) };
  }

  async function converterNoStirling(original) {
    const form = new FormData();
    form.append('fileInput', new Blob([original.dados], { type: original.tipo || 'application/octet-stream' }), original.nome);
    const r = await buscar(`${c.stirling.url}/api/v1/convert/file/pdf`, {
      method: 'POST',
      headers: c.stirling.chave ? { 'X-API-KEY': c.stirling.chave } : undefined,
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`o Stirling respondeu ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }

  async function guardarNoOneDrive(original, hoje) {
    if (!original || !c.sftp.host) return false;
    const destino = `${c.sftp.pasta}/${hoje}/${original.nome.replace(/[/\\]/g, '_')}`;
    if (deps.sftp) return deps.sftp(destino, original.dados).then(() => true);
    const { default: Cliente } = await import('ssh2-sftp-client');
    const s = new Cliente();
    try {
      await s.connect({ host: c.sftp.host, port: c.sftp.porta, username: c.sftp.usuario, password: c.sftp.senha, readyTimeout: 15_000 });
      await s.mkdir(`${c.sftp.pasta}/${hoje}`, true).catch(() => {});
      await s.put(original.dados, destino);
      return true;
    } finally {
      await s.end().catch(() => {});
    }
  }

  /**
   * Guarda o PDF do roteiro no PROMeiro (#90), ligado ao card da Produção: é por ele que a comparação acha o PDF. O
   * Teable não recebe link nenhum do PDF (o campo doc da produção da arte não é escrito nem mudado).
   */
  async function guardarNoPROMeiro(r, card, pdf, tentar) {
    if (!pdf || !deps.anexos) return;
    await tentar('guardar o PDF no PROMeiro', () => deps.anexos.guardarPdf({ chave: r.roteiro ?? r.meta?.claquete ?? '', card, nome: pdf.nome, dados: pdf.dados }));
  }

  /**
   * Manda um roteiro.
   * @param r.meta meta do roteiro (claquete, praca, redator, editor, dataExibicao, programa)
   * @param r.artes artes na ordem: texto, ou { texto, tipo }
   * @param r.doc documento do editor, para o PDF
   * @param r.texto texto corrido
   * @param r.original { nome, tipo, dados: Buffer } | null
   * @param r.endereco link do roteiro no PROMeiro
   * @param r.roteiro o id do roteiro no PROMeiro (a chave do PDF guardado)
   * @returns { card: { id, url }, avisos: string[] } ou { duplicado: true }
   */
  async function enviar(r, agora = new Date()) {
    if (!c.ligado) throw new Error('O Trello não está configurado (TRELLO_KEY, TRELLO_TOKEN e TRELLO_LISTA).');
    const m = r.meta;
    // sem claquete, o card leva o título ou o nome do arquivo: nada impede o envio. A data vai sempre com barra
    // ("DONA 27-11" → "DONA 27/11"), no card e na produção da arte; a chave não muda com isso
    const comoChegou = claquetePadrao(String(m.claquete || m.titulo || (r.original?.nome ?? '').replace(/\.[^.]+$/, '').replace(/_/g, ' ') || 'Roteiro sem claquete').trim(), c.pracas);
    // e o código de versão vai no padrão (#118: "Dp" → "(DP)", "(DIA)" → "(D)"); a key continua a da claquete como
    // chegou, a que a lista de prioridade e o n8n conhecem
    const claquete = claquetePadrao(claqueteNoPadrao(comoChegou), c.pracas);
    const avisos = [];
    const tentar = async (o_que, f) => {
      try {
        return await f();
      } catch (e) {
        avisos.push(`${o_que}: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    };

    const listaDeArtes = (r.artes ?? [])
      .map((a) => (typeof a === 'string' ? { texto: a, tipo: '' } : { texto: String(a?.texto ?? ''), tipo: String(a?.tipo ?? ''), tipos: a?.tipos, existe: !!a?.existe, complexidade: a?.complexidade }))
      .map((a) => ({ texto: a.texto.trim(), tipo: a.tipo.trim(), tipos: Array.isArray(a.tipos) ? a.tipos.map((t) => String(t).trim()).filter(Boolean) : [], existe: !!a.existe, complexidade: nivelDeComplexidade(a.complexidade) }))
      .filter((a) => a.texto);
    // a que já existe no acervo da atração vai no PDF (sublinhada, como no roteiro), mas não no checklist nem na conta
    const artes = itensDoChecklist(listaDeArtes);
    const existentes = listaDeArtes.filter((a) => a.existe).map((a) => a.texto);

    // versão nova de um roteiro que já está na produção: o card antigo recebe as artes novas e o roteiro novo
    r.v2De ??= m.v2De;
    if (r.v2De?.card) return atualizarCard(r, claquete, listaDeArtes, avisos, tentar);

    // "é outro roteiro" (a pessoa respondeu na fila): não é o mesmo da produção de hoje
    if (!(r.outro ?? m.outroRoteiro) && (await tentar('conferir a produção de hoje', () => jaEntrouHoje(claquete)))) return { duplicado: true, avisos };

    const hoje = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD no horário de Brasília
    const chave = chaveN8n(comoChegou);
    // a praça que a revisão escolheu; a que não é de nenhuma (ou falta) vai como a padrão
    const daPraca = pracaDaSigla(c.pracas, m.praca) ?? pracaPadrao(c.pracas);
    const praca = daPraca.sigla;
    const vt = /\bVt\b/i.test(claquete) || /\bVt\b/i.test(r.original?.nome ?? '');
    const lista = (vt && c.listas.VT) || daPraca.entrada || c.listas.padrao;
    if (!lista) throw new Error(`Não há lista de entrada para ${praca} no Trello (TRELLO_LISTA_${praca}).`);
    if (!(vt && c.listas.VT) && !daPraca.entrada) avisos.push(`sem TRELLO_LISTA_${praca}: o card de ${praca} foi para a lista padrão (TRELLO_LISTA)`);

    const [redator, editor, atracao, alta] = await Promise.all([
      tentar('achar o redator', () => acharRedator(m.redator)),
      tentar('achar o editor', () => acharEditor(m.editor)),
      tentar('achar a atração', () => acharAtracao(claquete, m.programa)),
      tentar('conferir a prioridade', () => prioridadeAlta([chave, chaveN8n(claquete)], agora)),
    ]);
    const filme = await tentar('achar o card do filme', () => cardDoFilme(atracao?.nome, m.dataExibicao));
    // o card do filme é lido antes dos campos: a complexidade do card é a maior entre a dele e a da revisão
    const doFilme = filme ? await tentar('ler o card do filme', () => trello('GET', `/cards/${filme.card}`, { consulta: { fields: 'id,idMembers', customFieldItems: 'true' } })) : null;
    const complexidade = Math.max(complexidadeDoCard(listaDeArtes), nivelDoFilme(doFilme));

    // o card é o que importa: sem ele, o envio falhou (a checklist que falhar vira aviso)
    const card = await criarCard({ lista, nome: claquete, desc: descricaoDoCard(artes, existentes), checklist: { nome: CHECKLIST_DAS_ARTES, itens: artes } }, avisos);
    const output = filme?.output || atracao?.output || '';
    const opcaoDaComplexidade = c.campos.complexidade ? c.complexidades[complexidade - 1] : '';
    await Promise.all([
      tentar('marcar o BOT', () => campo(card.id, c.campos.bot, { value: { checked: 'true' } })),
      daPraca.opcao && tentar('preencher a praça', () => campo(card.id, c.campos.praca, { idValue: daPraca.opcao })),
      redator && tentar('preencher o redator', () => campo(card.id, redator.campo, { idValue: redator.idValue })),
      editor && tentar('preencher o editor', () => campo(card.id, editor.campo, { idValue: editor.idValue })),
      alta && tentar('preencher a prioridade', () => campo(card.id, c.campos.prioridade, { idValue: c.prioridadeAlta })),
      atracao?.projeto && tentar('preencher o projeto', () => campo(card.id, c.campos.projeto, { value: { text: atracao.projeto } })),
      output && tentar('preencher o output', () => campo(card.id, c.campos.output, { value: { text: output } })),
      // sem o campo ou sem a opção do nível, o card sai sem ele (a produção da arte grava o número do mesmo jeito)
      opcaoDaComplexidade && tentar('preencher a complexidade', () => campo(card.id, c.campos.complexidade, { idValue: opcaoDaComplexidade })),
    ]);

    if (filme)
      await tentar('ligar ao card do filme', async () => {
        await trello('POST', `/cards/${card.id}/attachments`, { consulta: { url: `https://trello.com/c/${filme.card}` } });
        if (!doFilme) return;
        if (doFilme.idMembers?.length) await trello('PUT', `/cards/${card.id}`, { consulta: { idMembers: doFilme.idMembers.join(',') } });
        for (const item of doFilme.customFieldItems ?? []) {
          if (!c.campos.doFilme.includes(item.idCustomField)) continue;
          // a complexidade já foi ao card, a maior entre a do filme e a da revisão: o card fica igual à produção da arte
          if (opcaoDaComplexidade && item.idCustomField === c.campos.complexidade) continue;
          const corpo = item.idValue ? { idValue: item.idValue } : item.value && Object.keys(item.value).length ? { value: item.value } : null;
          if (corpo) await campo(card.id, item.idCustomField, corpo);
        }
      });

    // o roteiro em PDF, guardado no PROMeiro (#90) e anexado ao card; e o original guardado no OneDrive, como o n8n fazia
    const pdf = await tentar('gerar o PDF', () => emPdf(r, listaDeArtes));
    await guardarNoPROMeiro(r, card.id, pdf, tentar);
    if (pdf)
      await tentar('anexar o PDF', () => {
        const form = new FormData();
        form.append('name', pdf.nome);
        form.append('mimeType', 'application/pdf');
        form.append('file', new Blob([pdf.dados], { type: 'application/pdf' }), pdf.nome);
        return trello('POST', `/cards/${card.id}/attachments`, { form });
      });
    if (r.original) await tentar('guardar no OneDrive', () => guardarNoOneDrive(r.original, hoje));

    const entrada = agora.toISOString();
    await tentar('marcar a data de entrada', () => campo(card.id, c.campos.entrada, { value: { date: entrada } }));
    await tentar('registrar na produção da arte', () =>
      teableCriar(c.teable.producao, {
        claquete,
        artes_quantidade: artes.length,
        artes: artes.join(' | '),
        // a coluna só é escrita quando há o que escrever: sem acervo, nada muda na tabela
        ...(existentes.length ? { artes_existentes: existentes.join(' | ') } : {}),
        redator: redator?.nome ?? m.redator ?? '',
        card_ID: card.id,
        data_entrada: entrada,
        texto: String(r.texto ?? '').replaceAll('\u0000', ''),
        atracao: atracao?.nome ?? m.programa ?? '',
        editor: editor?.nome ?? m.editor ?? '',
        key: chave,
        ...(filme?.filmeId ? { filme: { id: filme.filmeId } } : {}),
        praca,
        prioridade: alta ? 'ALTA' : '',
        workflow: r.endereco || c.endereco || 'PROMeiro',
        urgencia: 1,
        complexidade,
      }),
    );

    return { card: { id: card.id, url: card.shortUrl || card.url || `https://trello.com/c/${card.id}` }, avisos };
  }

  /**
   * Recria um card apagado de uma duplicada (#68) só com o que o PROMeiro e o Teable sabem, sem ler nada do Trello: a
   * linha da produção da arte guardada na cópia (claquete, praça, artes, redator, editor, atração, prioridade,
   * complexidade, entrada) e o PDF do roteiro guardado no PROMeiro. É o caminho do envio: o card com a descrição e a
   * checklist das artes, os campos e o anexo. Vai para a entrada da praça, como o card que chega. A descrição editada à
   * mão, as etiquetas, os comentários, os membros e as marcas da checklist só existiam no Trello: não voltam.
   * @param linha a linha da produção da arte da cópia (as colunas do Postgres do Teable)
   * @param praca a praça do caso, quando a linha não tem a dela
   * @param pdf { nome, dados } | null
   * @returns { id, url, avisos }: sem o card, lança; o resto que der errado vira aviso
   */
  async function recriarCard({ linha, praca = '', pdf = null }) {
    if (!c.ligado) throw new Error('O Trello não está configurado (TRELLO_KEY, TRELLO_TOKEN e TRELLO_LISTA).');
    const claquete = String(linha?.claquete ?? '').trim() || 'Card recriado';
    const daPraca = pracaDaSigla(c.pracas, String(linha?.praca || praca || '')) ?? pracaPadrao(c.pracas);
    const vt = /\bVt\b/i.test(claquete);
    const lista = (vt && c.listas.VT) || daPraca.entrada || c.listas.padrao;
    if (!lista) throw new Error(`Não há lista de entrada para ${daPraca.sigla} no Trello (TRELLO_LISTA_${daPraca.sigla}).`);
    const avisos = [];
    const tentar = async (o_que, f) => {
      try {
        return await f();
      } catch (e) {
        avisos.push(`${o_que}: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    };
    const separar = (v) => String(v ?? '').split('|').map((a) => a.trim()).filter(Boolean);
    const artes = separar(linha?.artes);
    const anexos = pdf ? [{ nome: pdf.nome, tipo: 'application/pdf', dados: pdf.dados }] : [];
    const card = await criarCard({ lista, nome: claquete, desc: descricaoDoCard(artes, separar(linha?.artes_existentes)), checklist: { nome: CHECKLIST_DAS_ARTES, itens: artes }, anexos }, avisos);
    // a opção do redator e do editor só como o Teable guarda (sem criar nem procurar opção no Trello)
    const [redator, editor, atracao] = await Promise.all([
      tentar('achar o redator', () => opcaoGuardada(t.redatores, 'redator', linha?.redator, c.campos.redator)),
      tentar('achar o editor', () => opcaoGuardada(t.editores, 'editor', linha?.editor, c.campos.editor)),
      tentar('achar a atração', () => acharAtracao(claquete, linha?.atracao || '')),
    ]);
    const nivel = [1, 2, 3].includes(Number(linha?.complexidade)) ? Number(linha.complexidade) : 0;
    const opcaoDaComplexidade = nivel && c.campos.complexidade ? c.complexidades[nivel - 1] : '';
    const entrada = linha?.data_entrada ? new Date(linha.data_entrada) : null;
    await Promise.all([
      tentar('marcar o BOT', () => campo(card.id, c.campos.bot, { value: { checked: 'true' } })),
      daPraca.opcao && tentar('preencher a praça', () => campo(card.id, c.campos.praca, { idValue: daPraca.opcao })),
      redator && tentar('preencher o redator', () => campo(card.id, redator.campo, { idValue: redator.idValue })),
      editor && tentar('preencher o editor', () => campo(card.id, editor.campo, { idValue: editor.idValue })),
      /ALTA/i.test(String(linha?.prioridade ?? '')) && c.prioridadeAlta && tentar('preencher a prioridade', () => campo(card.id, c.campos.prioridade, { idValue: c.prioridadeAlta })),
      atracao?.projeto && tentar('preencher o projeto', () => campo(card.id, c.campos.projeto, { value: { text: atracao.projeto } })),
      atracao?.output && tentar('preencher o output', () => campo(card.id, c.campos.output, { value: { text: atracao.output } })),
      opcaoDaComplexidade && tentar('preencher a complexidade', () => campo(card.id, c.campos.complexidade, { idValue: opcaoDaComplexidade })),
      entrada && !Number.isNaN(entrada.getTime()) && tentar('marcar a data de entrada', () => campo(card.id, c.campos.entrada, { value: { date: entrada.toISOString() } })),
    ]);
    return { id: card.id, url: card.url, avisos };
  }

  /** A opção do campo (redator ou editor) que o Teable guarda para este nome; a do campo de outro quadro não vale. */
  async function opcaoGuardada(tabela, coluna, nome, campoAtual) {
    if (!tabela || !nome) return null;
    const [l] = await sql(`SELECT "${coluna}_ID" AS op, "customField_ID" AS campo FROM ${tabela} WHERE UPPER("${coluna}") = UPPER($1) AND "${coluna}_ID" IS NOT NULL AND "${coluna}_ID" <> '' LIMIT 1`, [String(nome)]);
    if (!l?.op || deOutroCampo(l.campo, campoAtual)) return null;
    const campoId = l.campo || campoAtual;
    return campoId ? { idValue: l.op, campo: campoId } : null;
  }

  /** As colunas da produção da arte que o envio grava: o card recriado (#68) as leva da cópia. */
  const COLUNAS_DO_ENVIO = ['claquete', 'artes_quantidade', 'artes', 'artes_existentes', 'redator', 'data_entrada', 'texto', 'atracao', 'editor', 'key', 'praca', 'prioridade', 'workflow', 'urgencia', 'complexidade'];

  /**
   * A linha da produção da arte do card recriado (#68), pelo caminho do envio (a API do Teable), com as colunas que o
   * envio grava, tiradas da cópia (a entrada de antes). Não nasce em dobro: se o n8n já criou a linha do card novo, vale
   * a dele. Sem a produção configurada para escrever, nenhuma.
   * @returns { registro, criada } (registro null: sem linha)
   */
  async function linhaDoCardRecriado(linha, card) {
    if (!c.teable.url || !c.teable.token || !c.teable.producao) return { registro: null, criada: false };
    const ja = (await producaoDosCards([card]))?.[0];
    if (ja) return { registro: ja.registro, criada: false };
    const campos = Object.fromEntries(COLUNAS_DO_ENVIO.filter((k) => linha?.[k] !== null && linha?.[k] !== undefined && linha?.[k] !== '').map((k) => [k, linha[k]]));
    let filme = linha?.filme;
    try {
      if (typeof filme === 'string') filme = JSON.parse(filme);
    } catch {
      filme = null;
    }
    const filmeId = (Array.isArray(filme) ? filme[0] : filme)?.id;
    const r = await teableCriar(c.teable.producao, { ...campos, card_ID: card, ...(filmeId ? { filme: { id: filmeId } } : {}) });
    const registro = r?.records?.[0]?.id ?? null;
    if (!registro) throw new Error('O Teable não devolveu a linha criada.');
    return { registro: String(registro), criada: true };
  }

  /** Tira a linha que o PROMeiro criou para o card recriado, quando recriar para no meio (#68). */
  async function apagarLinhaDaProducao(registro) {
    const r = await buscar(`${c.teable.url}/api/table/${encodeURIComponent(c.teable.producao)}/record/${encodeURIComponent(registro)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${c.teable.token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Teable respondeu ${r.status} ao tirar a linha da produção da arte`);
  }

  /** Versão nova: artes que faltam no checklist, o roteiro novo anexado, um comentário e a linha do Teable em dia. */
  async function atualizarCard(r, claquete, listaDeArtes, avisos, tentar) {
    const id = r.v2De.card;
    const artes = itensDoChecklist(listaDeArtes);
    const card = await trello('GET', `/cards/${id}`, { consulta: { fields: 'id,shortUrl,url,name' } });
    if (!card?.id) throw new Error('O card da versão anterior não foi encontrado no Trello.');
    const listas = (await tentar('ler as checklists', () => trello('GET', `/cards/${id}/checklists`))) ?? [];
    let lista = listas.find((l) => /ARTES/i.test(l.name)) ?? null;
    const ja = new Set((lista?.checkItems ?? []).map((i) => chaveN8n(i.name)));
    const novas = artes.filter((a) => !ja.has(chaveN8n(a)));
    if (novas.length) {
      lista ??= await tentar('criar a checklist', () => trello('POST', '/checklists', { consulta: { idCard: id, name: CHECKLIST_DAS_ARTES } }));
      if (lista?.id) for (const a of novas) await tentar(`incluir a arte ${a}`, () => trello('POST', `/checklists/${lista.id}/checkItems`, { consulta: { name: a } }));
    }
    const pdf = await tentar('gerar o PDF', () => emPdf(r, listaDeArtes));
    // o roteiro novo também fica no PROMeiro, ligado ao mesmo card: a comparação passa a achar ele
    await guardarNoPROMeiro(r, id, pdf && { ...pdf, nome: pdf.nome.replace(/(\.pdf)$/i, ' V2$1') }, tentar);
    if (pdf) {
      const nome = pdf.nome.replace(/(\.pdf)$/i, ' V2$1');
      await tentar('anexar o roteiro novo', () => {
        const form = new FormData();
        form.append('name', nome);
        form.append('mimeType', 'application/pdf');
        form.append('file', new Blob([pdf.dados], { type: 'application/pdf' }), nome);
        return trello('POST', `/cards/${id}/attachments`, { form });
      });
    }
    await tentar('comentar no card', () =>
      trello('POST', `/cards/${id}/actions/comments`, {
        consulta: { text: `Versão nova do roteiro pelo PROMeiro: ${novas.length ? `${novas.length === 1 ? '1 arte nova' : `${novas.length} artes novas`} no checklist (${novas.join(', ')})` : 'nenhuma arte nova'}, roteiro anexado.` },
      }),
    );
    // a complexidade do card: a maior das artes do roteiro novo; na sessão de filme, a maior entre ela e a do card do
    // filme, como no card novo (o filme só é procurado quando o campo dele é copiado)
    let doFilme = null;
    if (copiaComplexidadeDoFilme) {
      const filme = await tentar('achar o card do filme', async () => cardDoFilme((await acharAtracao(claquete, r.meta.programa))?.nome, r.meta.dataExibicao));
      if (filme) doFilme = await tentar('ler o card do filme', () => trello('GET', `/cards/${filme.card}`, { consulta: { fields: 'id', customFieldItems: 'true' } }));
    }
    const complexidade = Math.max(complexidadeDoCard(listaDeArtes), nivelDoFilme(doFilme));
    if (c.teable.producao)
      await tentar('atualizar a produção da arte', async () => {
        const registro = r.v2De.registro;
        if (!registro) return;
        // a leitura que falha vira aviso: as artes e o texto vão do mesmo jeito, só sem a complexidade
        const [linha] =
          (await tentar('ler a complexidade da produção da arte', () => sql(`SELECT "__id" AS id, "complexidade" FROM ${t.producao} WHERE "__id" = $1 LIMIT 1`, [registro]))) ?? [];
        // a complexidade só é escrita quando muda em relação à da produção da arte (sem a linha lida, não há com o que
        // comparar, e nada de complexidade é escrito)
        const mudou = !!linha && Number(linha.complexidade) !== complexidade;
        const opcao = mudou && c.campos.complexidade ? c.complexidades[complexidade - 1] : '';
        if (opcao) await tentar('atualizar a complexidade', () => campo(id, c.campos.complexidade, { idValue: opcao }));
        await teableAtualizar(c.teable.producao, registro, { artes: artes.join(' | '), artes_quantidade: artes.length, texto: String(r.texto ?? '').replaceAll('\u0000', ''), ...(mudou ? { complexidade } : {}) });
      });
    return { card: { id: card.id, url: card.shortUrl || card.url || `https://trello.com/c/${card.id}` }, avisos, v2: true, novas: novas.length };
  }

  /**
   * A claquete já está na produção da arte? Procura pela key (como o n8n grava) e, sem key igual, pela claquete.
   * Só nos últimos 3 meses: a key não tem o ano, e a claquete do ano que vem bateria com a deste ano sem ser a mesma.
   * @returns { card, url, registro, claquete, entrada, status: string[], artes: number, listaDeArtes: string[], texto } | null
   */
  async function naProducao(claquete) {
    if (!t.producao || !claquete) return null;
    // a key como chegou e a da claquete no padrão (#118): a linha gravada antes ou depois do padrão
    const chaves = [chaveN8n(claquete), chaveN8n(claqueteNoPadrao(String(claquete).trim()))];
    const linhas = await sql(
      `SELECT "__id" AS registro, "card_ID", "claquete", "key", "status", "data_entrada", "artes_quantidade", "artes", "texto", "doc", "redator", "editor" FROM ${t.producao}
       WHERE "data_entrada" >= now() - interval '3 months' ORDER BY "data_entrada" DESC NULLS LAST LIMIT 5000`,
    );
    const l = linhas.find((x) => chaves.includes(x.key)) ?? linhas.find((x) => mesmaClaquete(x.claquete, claquete));
    if (!l?.card_ID) return null;
    return {
      card: l.card_ID,
      url: `https://trello.com/c/${l.card_ID}`,
      registro: l.registro ?? null,
      claquete: l.claquete,
      entrada: quando(l.data_entrada) ? new Date(l.data_entrada).toISOString() : null,
      status: lerLista(l.status),
      artes: Number(l.artes_quantidade) || 0,
      // para comparar com o roteiro novo: as artes ("A | B", ou uma por linha) e o texto como entraram
      listaDeArtes: String(l.artes ?? '').split(/\s*\|\s*|\n+/).map((a) => a.trim()).filter(Boolean),
      texto: String(l.texto ?? ''),
      doc: String(l.doc ?? ''),
      // redator e editor são vínculos no Teable: vem o nome
      redator: lerLista(l.redator)[0] ?? '',
      editor: lerLista(l.editor)[0] ?? '',
    };
  }

  // anexos do Trello: só destes endereços (o link vem do Teable; nada de buscar endereço qualquer)
  const anexoConfiavel = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && (u.hostname === 'trello.com' || u.hostname.endsWith('.trello.com') || u.hostname === 'trello-attachments.s3.amazonaws.com' || url.startsWith(API));
    } catch {
      return false;
    }
  };

  /**
   * O PDF do roteiro da Produção (#90): o que o PROMeiro guardou para o card dela (o mais recente, a V2 no lugar da
   * anterior), sem depender do Teable. Só a Produção antiga, sem PDF guardado, cai no doc que já está no Teable: um
   * endereço do PROMeiro é lido daqui; o link do anexo do Trello, o último recurso, baixa do Trello. Os anexos do card
   * não são lidos no Trello (ADR 0006).
   */
  async function pdfDaProducao(claquete) {
    const p = await naProducao(claquete);
    if (!p) return null;
    const guardado = deps.anexos?.pdfDoCard(p.card) ?? deps.anexos?.pdfDoEndereco(p.doc);
    if (guardado) return { nome: guardado.nome, dados: guardado.dados };
    if (!c.ligado) return null;
    const url = p.doc && /\.pdf($|\?)/i.test(p.doc) ? p.doc : '';
    if (!url || !anexoConfiavel(url)) return null;
    const r = await buscar(url, {
      headers: { authorization: `OAuth oauth_consumer_key="${c.chave}", oauth_token="${c.token}"` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`Trello respondeu ${r.status} ao baixar o anexo`);
    const dados = Buffer.from(await r.arrayBuffer());
    if (dados.length > 30 * 1024 * 1024) throw new Error('PDF grande demais');
    return { nome: url.split('/').pop() || 'roteiro.pdf', dados };
  }

  /* ---------- como anda cada card: lido da produção da arte no Teable (o n8n sincroniza com o Trello) ---------- */

  // status (seleção múltipla) e designers (fórmula) chegam do Postgres como texto JSON, lista ou objeto
  const lerLista = (v) => {
    if (v == null || v === '') return [];
    if (typeof v === 'string') {
      try {
        return lerLista(JSON.parse(v));
      } catch {
        return [v];
      }
    }
    if (Array.isArray(v)) return v.flatMap(lerLista);
    if (typeof v === 'object') return [v.title ?? v.name ?? ''].filter(Boolean);
    return [String(v)];
  };
  const quando = (v) => (v ? new Date(v).getTime() || 0 : 0);
  let memo = { em: 0, chave: '', dados: {} };
  let avisouFalha = false;
  let avisouFalhaPrioridade = false;

  /**
   * @param itens [{ id, card, claquete, naFila? }]: os roteiros que já estão no Trello e, com `naFila`, os da fila de
   *   revisão (só para a prioridade). Enviado sem card (veio pelo upload antigo): procura pela claquete nos últimos 30 dias.
   * @returns { [id]: { status: string[], designers: string[], entregue: boolean, entrega: string|null, entrada: string|null, claquete?: string, artes?: number, prioridade?: true } }
   *   `artes`: quantas artes foram para a produção, sem as repetidas (`artesDaProducao`).
   *   `claquete`: o nome de hoje na produção da arte, só para mostrar (a chave da prioridade é a da claquete guardada).
   *   `prioridade`: a claquete está na lista de prioridade (a mesma que dá a prioridade ALTA no envio). O roteiro da fila
   *   que é prioridade vem com o andamento vazio.
   */
  async function andamento(itens) {
    if (!itens.length) return {};
    const chave = itens.map((i) => `${i.id}:${i.card ?? ''}:${i.naFila ? chaveN8n(i.claquete) : ''}`).sort().join(',');
    if (memo.chave === chave && Date.now() - memo.em < 30_000) return memo.dados; // menos que o minuto da agenda: a etapa nova não espera duas leituras
    const enviados = itens.filter((i) => !i.naFila);
    const [producao, prioridade] = await Promise.all([lerProducao(enviados), listaDePrioridade(itens.map((i) => chaveN8n(i.claquete)))]);
    if (!producao) return {};
    const dados = {};
    for (const i of itens) {
      const prio = prioridade.has(chaveN8n(i.claquete));
      const a = producao[i.id] ?? (prio ? { status: [], designers: [], entregue: false, entrega: null } : null);
      if (a) dados[i.id] = prio ? { ...a, prioridade: true } : a;
    }
    memo = { em: Date.now(), chave, dados };
    return dados;
  }

  /** O andamento dos enviados na produção da arte; null quando a leitura falhou. */
  async function lerProducao(itens) {
    if (!t.producao || !itens.length) return {};
    try {
      const semCard = itens.some((i) => !i.card);
      const ler = (tabela, cards) =>
        sql(
          `SELECT "card_ID", "claquete", "artes", "status", "designers", "entregue", "data_entrega", "data_entrada" FROM ${tabela}
         WHERE "card_ID" = ANY($1::text[])${semCard ? ` OR "data_entrada" >= now() - interval '30 days'` : ''}`,
          [cards],
        );
      const cards = itens.map((i) => i.card).filter(Boolean);
      const linhas = await ler(t.producao, cards);
      const dados = {};
      for (const i of itens) {
        const l = i.card
          ? linhas.find((x) => x.card_ID === i.card)
          : linhas.filter((x) => mesmaClaquete(x.claquete, i.claquete)).sort((a, b) => quando(b.data_entrada) - quando(a.data_entrada))[0];
        if (!l) continue;
        dados[i.id] = {
          status: lerLista(l.status),
          designers: lerLista(l.designers),
          entregue: !!l.entregue,
          entrega: quando(l.data_entrega) ? new Date(l.data_entrega).toISOString() : null,
          entrada: quando(l.data_entrada) ? new Date(l.data_entrada).toISOString() : null,
          // o nome de hoje na produção da arte (o card renomeado para o padrão): é o que a agenda mostra
          ...(typeof l.claquete === 'string' && l.claquete.trim() ? { claquete: l.claquete.trim() } : {}),
          // e quantas artes foram para a produção, cada uma uma vez; sem a coluna preenchida, fica a do PROMeiro
          ...(artesDaProducao(l.artes) !== null ? { artes: artesDaProducao(l.artes) } : {}),
        };
      }
      avisouFalha = false;
      return dados;
    } catch (e) {
      if (!avisouFalha) console.warn(`[andamento] não consegui ler a produção da arte: ${e instanceof Error ? e.message : e}`);
      avisouFalha = true;
      return null;
    }
  }

  // um campo de ligação do Teable (o filme): texto JSON, objeto ou lista de { id, title } → o primeiro, ou null
  const primeiroLigado = (v) => {
    if (typeof v === 'string') {
      try {
        return primeiroLigado(JSON.parse(v));
      } catch {
        return null;
      }
    }
    const x = Array.isArray(v) ? v[0] : v;
    return x && typeof x === 'object' && x.id ? { id: String(x.id), titulo: String(x.title ?? x.name ?? '').trim() } : null;
  };
  const instante = (v) => (quando(v) ? new Date(v).toISOString() : null);
  /** Um número da coluna, ou null (vazia ou o que não é número). */
  const numeroOuNada = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const sim = (v) => v === true || v === 1 || /^(t|true|1|sim)$/i.test(String(v ?? '').trim());

  /**
   * As linhas da produção da arte que entraram nos últimos `dias` dias e têm card (a aba Duplicadas): o que o
   * agrupamento precisa, já lido (src/modelo/duplicadas.ts, LinhaDaProducao). Sem a produção configurada, null.
   */
  async function producaoDoPeriodo(dias) {
    if (!t.producao || !consultar) return null;
    const ler = (tabela) =>
      sql(
        `SELECT "__id" AS registro, "card_ID", "claquete", "praca", "data_entrada", "data_entrega", "status", "arquivado", "designers", "entregue", "filme", "artes_quantidade", "__last_modified_time" FROM ${tabela}
         WHERE "data_entrada" >= now() - ($1 || ' days')::interval AND "card_ID" IS NOT NULL AND "card_ID" <> ''`,
        [String(dias | 0)],
      );
    const linhas = await ler(t.producao);
    return linhas.map((l) => ({
      registro: String(l.registro ?? ''),
      card: String(l.card_ID ?? '').trim(),
      claquete: String(l.claquete ?? '').trim(),
      praca: String(lerLista(l.praca)[0] ?? '').trim(),
      entrada: quando(l.data_entrada) ? new Date(l.data_entrada).toISOString() : null,
      arquivado: sim(l.arquivado),
      filme: lerLista(l.filme).some((f) => String(f).trim()),
      status: lerLista(l.status),
      designers: lerLista(l.designers),
      entregue: sim(l.entregue),
      // para o caso aberto (só o que o Teable tem, ADR 0006)
      entrega: instante(l.data_entrega),
      artesQuantidade: numeroOuNada(l.artes_quantidade),
      // a última mudança da linha no Teable: apagar uma duplicada (#67) confere que ela não mudou desde que a tela abriu
      modificadoEm: instante(l.__last_modified_time),
    }));
  }

  /**
   * As linhas da produção da arte destes cards, lidas na hora (apagar uma duplicada, #67): o que o agrupamento precisa
   * (LinhaDaProducao), a última mudança no Teable e a linha inteira como o Postgres tem (`inteira`, para a cópia).
   * Sem a produção configurada, null; com o Postgres fora, lança.
   */
  async function producaoDosCards(ids) {
    if (!t.producao || !consultar) return null;
    const cards = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
    if (!cards.length) return [];
    const linhas = await sql(`SELECT ${COLUNAS_DA_CARGA}, to_jsonb(p) AS "inteira" FROM ${t.producao} p WHERE p."card_ID" = ANY($1::text[])`, [cards]);
    return linhas
      .filter((l) => l.__id)
      .map((l) => {
        const lida = linhaDaCarga(l);
        return { ...lida, filme: !!lida.filme, inteira: l.inteira && typeof l.inteira === 'object' ? l.inteira : null };
      });
  }

  /* ---------- apagar uma duplicada (#67): escritas no Trello, sem ler nada dele ---------- */
  /** Comenta no card; devolve o id do comentário (a ação), para desfazer. */
  async function comentar(card, texto) {
    const acao = await trello('POST', `/cards/${encodeURIComponent(card)}/actions/comments`, { consulta: { text: texto } });
    return acao?.id ? String(acao.id) : null;
  }
  const apagarComentario = (acao) => trello('DELETE', `/actions/${encodeURIComponent(acao)}`);
  /** Apaga o card do Trello (não volta: recriar faz um card novo). */
  const apagarCard = (card) => trello('DELETE', `/cards/${encodeURIComponent(card)}`);

  /* ---------- a tela de produções (#110): pegar e voltar para a Entrada, só escrevendo no Trello ---------- */
  /** O Trello disse que já estava assim (o membro já no card, ou já fora dele): não é recusa. */
  const jaEstava = (e, padrao) => padrao.test(e instanceof Error ? e.message : '');
  /** Põe o membro no card (o card fica na lista em que está). @returns true se entrou agora; false se já estava */
  async function entrarNoCard(card, membro) {
    try {
      await trello('POST', `/cards/${encodeURIComponent(card)}/idMembers`, { consulta: { value: membro } });
      return true;
    } catch (e) {
      if (jaEstava(e, /^Trello respondeu 400 .*already/is)) return false;
      throw e;
    }
  }
  /** Tira o membro do card. @returns true se saiu agora; false se já não estava */
  async function sairDoCard(card, membro) {
    try {
      await trello('DELETE', `/cards/${encodeURIComponent(card)}/idMembers/${encodeURIComponent(membro)}`);
      return true;
    } catch (e) {
      if (jaEstava(e, /^Trello respondeu 400 .*not (a )?member|^Trello respondeu 400 .*not on (the )?card/is)) return false;
      throw e;
    }
  }
  /** Move o card para a lista. */
  const moverCard = (card, lista) => trello('PUT', `/cards/${encodeURIComponent(card)}`, { consulta: { idList: lista } });

  /** A linha da produção da arte como a carga e a releitura leem (src/modelo/eventosDoTeable.ts, LinhaRelida). */
  const linhaDaCarga = (l) => ({
    registro: String(l.__id),
    card: String(l.card_ID ?? '').trim(),
    claquete: String(l.claquete ?? '').trim(),
    praca: String(lerLista(l.praca)[0] ?? '').trim(),
    status: lerLista(l.status).map((s) => String(s).trim()).filter(Boolean),
    designers: lerLista(l.designers).map((s) => String(s).trim()).filter(Boolean),
    entregue: sim(l.entregue),
    arquivado: sim(l.arquivado),
    entrada: instante(l.data_entrada),
    entrega: instante(l.data_entrega),
    // as artes como a coluna traz (separadas por | ou por linha)
    artes: String(l.artes ?? '').split(/\s*\|\s*|\n+/).map((s) => s.trim()).filter(Boolean),
    artesQuantidade: numeroOuNada(l.artes_quantidade),
    filme: primeiroLigado(l.filme),
    // a prioridade (seleção ou texto) e a complexidade (1 a 3), para os eventos da releitura
    prioridade: String(lerLista(l.prioridade)[0] ?? '').trim(),
    complexidade: String(l.complexidade ?? '').trim(),
    modificadoEm: instante(l.__last_modified_time),
  });
  // a prioridade pelo to_jsonb (a coluna pode não existir na base: vem null); __last_modified_time é do Teable (toda
  // tabela tem)
  const COLUNAS_DA_CARGA = `p."__id", p."card_ID", p."claquete", p."praca", p."status", p."designers", p."entregue", p."arquivado", p."data_entrada", p."data_entrega", p."artes", p."artes_quantidade", p."filme", p."complexidade", to_jsonb(p)->>'prioridade' AS "prioridade", p."__last_modified_time"`;

  /**
   * A produção da arte INTEIRA (a carga das Produções, #86): todas as linhas, abertas e arquivadas, com e sem card,
   * de filme ou não (src/modelo/producao.ts, LinhaDaCarga). Sem a produção configurada, null; com o Postgres fora, lança.
   */
  async function producaoInteira() {
    if (!t.producao || !consultar) return null;
    const linhas = await sql(`SELECT ${COLUNAS_DA_CARGA} FROM ${t.producao} p`, []);
    return linhas.filter((l) => l.__id).map(linhaDaCarga);
  }

  /**
   * As linhas da produção da arte que o Teable mudou desde `desde` (ISO), das mais velhas às mais novas, até `limite`
   * (a releitura, ADR 0006: os eventos da Produção nascem do Teable). A próxima releitura continua da última lida.
   * Sem a produção configurada, null; com o Postgres fora, lança.
   */
  async function producaoAlteradaDesde(desde, limite = 2000) {
    if (!t.producao || !consultar) return null;
    const linhas = await sql(
      `SELECT ${COLUNAS_DA_CARGA} FROM ${t.producao} p WHERE p."__last_modified_time" >= $1::timestamptz ORDER BY p."__last_modified_time" LIMIT ${Math.min(5000, Math.max(1, limite | 0))}`,
      [desde],
    );
    return linhas.filter((l) => l.__id).map(linhaDaCarga);
  }

  /**
   * Os designers que aparecem na produção da arte das linhas que entraram nos últimos `dias` dias (a seção Pessoas:
   * as novidades vêm do Teable, não do quadro do Trello), cada um com a entrada mais recente: [{ nome, ultima }].
   * Sem a produção configurada, null; com o Postgres fora, lança.
   */
  async function designersDaProducao(dias) {
    if (!t.producao || !consultar) return null;
    const linhas = await sql(`SELECT "designers", "data_entrada" FROM ${t.producao} WHERE "data_entrada" >= now() - ($1 || ' days')::interval`, [String(dias | 0)]);
    const porNome = new Map();
    for (const l of linhas)
      for (const nome of lerLista(l.designers).map((x) => String(x).trim()).filter(Boolean)) {
        const chave = nomeComparavel(nome);
        const ultima = instante(l.data_entrada);
        const ja = porNome.get(chave);
        if (!ja || (ultima && (!ja.ultima || ultima > ja.ultima))) porNome.set(chave, { nome, ultima });
      }
    return [...porNome.values()];
  }

  /** As exibições com card (a carga das Produções): card → { data, filme }. Sem a tabela, vazio. */
  async function exibicoesDosCards() {
    if (!t.exibicoes || !consultar) return new Map();
    const linhas = await sql(`SELECT "card_ID", "data_de_exibicao", "filme" FROM ${t.exibicoes} WHERE "card_ID" IS NOT NULL AND "card_ID" <> ''`, []);
    const porCard = new Map();
    for (const l of linhas) {
      const cardId = String(l.card_ID ?? '').trim();
      if (cardId && !porCard.has(cardId)) porCard.set(cardId, { data: instante(l.data_de_exibicao), filme: primeiroLigado(l.filme) });
    }
    return porCard;
  }

  /** As chaves (dentre estas) que são prioridade (veja chavesPrioritarias); sem a lista configurada ou fora do ar, nenhuma. */
  async function listaDePrioridade(chaves) {
    const validas = [...new Set(chaves.filter(Boolean))];
    if (!t.prioridade || !c.prioridadeAlta || !validas.length) return new Set();
    try {
      const chavesNaLista = await chavesPrioritarias(validas, relogio());
      avisouFalhaPrioridade = false;
      return chavesNaLista;
    } catch (e) {
      if (!avisouFalhaPrioridade) console.warn(`[andamento] não consegui ler a lista de prioridade: ${e instanceof Error ? e.message : e}`);
      avisouFalhaPrioridade = true;
      return new Set();
    }
  }

  /**
   * Os filmes da fila: as exibições de ontem até `dias` à frente (sem as canceladas), com o andamento do card na
   * produção da arte, que é a mesma das claquetes (o PROMO: DB cuida do status, dos designers e da entrega).
   * Base sem o vínculo exibição → produção (antes da virada): os filmes vêm sem o andamento.
   */
  /**
   * O andamento de cada card de filme é o próprio card no Trello: as etiquetas (PRODUZINDO, FINALIZADO…), os membros
   * (quem faz) e o "concluído". Os cards de filme não entram na ARTE_producao (lá só as claquetes dos roteiros).
   * Em lotes de 10 (o /batch do Trello) e guardado por 2 min (a fila pede de tempos em tempos).
   */
  const andamentos = new Map();
  async function andamentoDosCards(ids) {
    const validos = [...new Set(ids.filter((id) => /^[0-9a-f]{24}$/i.test(String(id ?? ''))))];
    const faltam = validos.filter((id) => !(Date.now() - (andamentos.get(id)?.em ?? 0) < 120_000));
    if (faltam.length && c.chave && c.token) {
      for (let i = 0; i < faltam.length; i += 10) {
        const grupo = faltam.slice(i, i + 10);
        const urls = grupo.map((id) => `/cards/${id}?members=true&member_fields=fullName`).join(',');
        const r = await trello('GET', '/batch', { consulta: { urls } }).catch((e) => (console.warn(`[filmes] andamento no Trello: ${e instanceof Error ? e.message : e}`), []));
        (Array.isArray(r) ? r : []).forEach((x, k) => {
          const card = x?.['200'];
          if (!card) return;
          andamentos.set(grupo[k], {
            em: Date.now(),
            // a etiqueta FILME é de todos os cards da coluna: não é andamento
            status: (card.labels ?? []).map((l) => String(l?.name ?? '').trim()).filter((n) => n && !/^FILME$/i.test(n)),
            designers: (card.members ?? []).map((m) => String(m?.fullName ?? '').trim()).filter(Boolean),
            entregue: !!card.dueComplete,
          });
        });
      }
    }
    if (andamentos.size > 2000) andamentos.clear();
    return (id) => andamentos.get(id) ?? null;
  }

  async function filmesProximos(dias = 14) {
    if (!t.exibicoes) return [];
    const base = `SELECT e."__id" AS id, e."card_ID" AS card, e."link", e."inedito", e."labels",
        ((e."data_de_exibicao" AT TIME ZONE 'America/Sao_Paulo')::date)::text AS data,
        e."filme"->>'title' AS filme, e."filme"->>'id' AS filme_id, e."sessao"->>'title' AS sessao`;
    const onde = `WHERE (e."data_de_exibicao" AT TIME ZONE 'America/Sao_Paulo')::date
          BETWEEN (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1 AND (now() AT TIME ZONE 'America/Sao_Paulo')::date + $1::int
        AND NOT (COALESCE(e."labels", '[]'::jsonb) @> '["CANCELADO"]'::jsonb)
        ORDER BY data, sessao`;
    let linhas;
    try {
      // as artes do card ficam na própria exibição
      linhas = await sql(`${base}, e."artes", e."artes_existentes" FROM ${t.exibicoes} e ${onde}`, [String(dias | 0)]);
    } catch {
      linhas = await sql(`${base} FROM ${t.exibicoes} e ${onde}`, [String(dias | 0)]);
    }
    const andamento = await andamentoDosCards(linhas.map((l) => String(l.card ?? '')));
    const pipe = (v) => String(v ?? '').split('|').map((x) => x.trim()).filter(Boolean);
    return linhas.map((l) => {
      const m = /^(.*?)\s*\((\d{4})\)\s*$/.exec(String(l.filme ?? ''));
      const a = l.card ? andamento(String(l.card)) : null;
      return {
        id: String(l.id),
        filme: l.filme_id ? String(l.filme_id) : '',
        card: l.card ? String(l.card) : '',
        link: l.link || (l.card ? `https://trello.com/c/${l.card}` : ''),
        data: String(l.data ?? ''),
        sessao: String(l.sessao ?? ''),
        titulo: m ? m[1] : String(l.filme ?? ''),
        ano: m ? Number(m[2]) : null,
        inedito: !!l.inedito,
        status: a?.status ?? [],
        designers: a?.designers ?? [],
        entregue: !!a?.entregue,
        entrega: null,
        artes: pipe(l.artes),
        existentes: pipe(l.artes_existentes),
      };
    });
  }

  /**
   * A pasta do projeto de cada filme do cadastro (#146: o "pronto para abrir" do filme na janela do After): a mesma
   * fórmula projeto_win que vai ao campo projeto do card do filme (servidor/exibicao.mjs), sem o que o cadastro escreve
   * quando não sabe o caminho. { id: pasta }, só os filmes que têm; {} sem a tabela filmes. Lança com o Postgres fora.
   */
  async function projetosDosFilmes(ids) {
    const pedidos = [...new Set(ids.filter(Boolean).map(String))];
    if (!t.filmes || !pedidos.length) return {};
    const linhas = await sql(`SELECT "__id", "projeto_win" FROM ${t.filmes} WHERE "__id" = ANY($1::text[])`, [pedidos]);
    return Object.fromEntries(linhas.filter((l) => pedidos.includes(String(l.__id)) && caminho(l.projeto_win)).map((l) => [String(l.__id), caminho(l.projeto_win)]));
  }

  /** As artes de um card (os itens dos checklists dele), feitas ou não: o card da prévia de um filme, por exemplo. */
  async function artesDoCard(card) {
    if (!c.chave || !c.token || !/^[0-9a-f]{24}$/i.test(String(card ?? ''))) return [];
    const listas = await trello('GET', `/cards/${card}/checklists`, { consulta: { fields: 'name', checkItem_fields: 'name' } });
    return (Array.isArray(listas) ? listas : []).flatMap((l) => (l.checkItems ?? []).map((i) => String(i.name ?? '').trim())).filter(Boolean);
  }

  /**
   * A atração ligada (o campo link `atracao`) na produção da arte de cada card, numa leitura só, de onde vem o
   * andamento: { card: nome }, só os cards que têm. Para o acervo achar a atração do envio que saiu sem ela (#54).
   */
  let memoAtracoes = { em: 0, chave: '', dados: {} };
  async function atracoesDosCards(cards) {
    const ids = [...new Set(cards.filter(Boolean))].sort();
    if (!t.producao || !ids.length) return {};
    // o andamento é pedido por cada navegador aberto: o envio que espera a atração não relê a cada pedido
    if (memoAtracoes.chave === ids.join() && Date.now() - memoAtracoes.em < 30_000) return memoAtracoes.dados;
    const linhas = await sql(`SELECT "card_ID", "atracao" FROM ${t.producao} WHERE "card_ID" = ANY($1::text[])`, [ids]);
    const dados = {};
    for (const l of linhas) {
      const nome = lerLista(l.atracao)[0];
      if (nome && !dados[l.card_ID]) dados[l.card_ID] = nome;
    }
    memoAtracoes = { em: Date.now(), chave: ids.join(), dados };
    return dados;
  }

  /** A atração da claquete pelas keys no Postgres (o mesmo que o envio usa): o nome, ou '' se não achar. */
  const atracaoDaClaquete = async (claquete) => (await acharAtracao(claquete).catch(() => null))?.nome ?? '';
  /**
   * Conferência no ambiente de verdade: cada tabela do Postgres com as colunas que o app usa, o Trello (chave,
   * listas e campos) e o Stirling. Só lê; nada é criado nem alterado. @returns [{ item, ok, detalhe }]
   */
  async function conferir() {
    const out = [];
    const item = async (nome, fn) => {
      try {
        const d = await fn();
        out.push({ item: nome, ok: d !== false && !(d && d.ok === false), detalhe: typeof d === 'string' ? d : d?.detalhe ?? '' });
      } catch (e) {
        out.push({ item: nome, ok: false, detalhe: e instanceof Error ? e.message : String(e) });
      }
    };
    // as colunas do Postgres que o código usa: o mapa único (src/modelo/tabelasDoTeable.ts)
    const doMapa = (n) => TABELAS_DO_TEABLE.find((x) => x.nome === n)?.pg ?? [];
    const colunas = { producao: doMapa('ARTE_producao'), redatores: doMapa('redatores'), editores: doMapa('editores'), atracoes: doMapa('atracoes'), prioridade: doMapa('prioridade'), exibicoes: doMapa('exibicoes') };
    for (const [nome, cols] of Object.entries(colunas)) {
      if (!t[nome]) {
        out.push({ item: `Postgres: ${nome}`, ok: nome === 'exibicoes' || nome === 'prioridade', detalhe: 'não achada na base do Teable' });
        continue;
      }
      await item(`Postgres: ${nome}`, async () => {
        const [esq, tab] = t[nome].replaceAll('"', '').split('.');
        const tem = (await sql(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`, [esq, tab])).map((l) => l.column_name);
        if (!tem.length) return { ok: false, detalhe: `a tabela ${t[nome]} não existe (ou o usuário não lê)` };
        const faltam = cols.filter((c) => !tem.includes(c));
        const [{ n }] = await sql(`SELECT count(*)::int AS n FROM ${t[nome]}`);
        if (faltam.length) return { ok: false, detalhe: `faltam colunas: ${faltam.join(', ')}` };
        // a produção que parou (a base de antes da virada): os cards novos ficam sem andamento
        if (nome === 'producao') {
          const ultima = quando((await sql(`SELECT max("data_entrada") AS ultima FROM ${t.producao}`))[0]?.ultima);
          const dias = Math.floor((Date.now() - ultima) / 86_400_000);
          if (ultima && dias >= 3)
            return {
              ok: false,
              detalhe: `a última entrada é de ${new Date(ultima).toISOString().slice(0, 10)}, há ${dias} dias: a produção da arte parou aqui? Escolha em Configuração → Conexões a base em que o n8n grava`,
            };
        }
        return `${n} linhas`;
      });
    }
    if (!c.chave || !c.token) out.push({ item: 'Trello', ok: false, detalhe: 'sem TRELLO_KEY ou TRELLO_TOKEN' });
    else {
      await item('Trello: chave e token', async () => `conta ${(await trello('GET', '/members/me', { consulta: { fields: 'username' } })).username}`);
      const listas = {
        ...Object.fromEntries(c.pracas.map((p) => [`lista ${p.sigla}`, p.entrada])),
        ...Object.fromEntries(Object.entries(c.listas).map(([k, v]) => [`lista ${k}`, v])),
        ...Object.fromEntries(c.pracas.map((p) => [`saída ${p.sigla}`, p.saida])),
      };
      for (const [nome, idLista] of Object.entries(listas))
        if (idLista) await item(`Trello: ${nome}`, async () => `"${(await trello('GET', `/lists/${idLista}`, { consulta: { fields: 'name,closed' } })).name}"`);
      const campos = Object.entries(c.campos).filter(([, v]) => typeof v === 'string' && v);
      for (const [nome, idCampo] of campos) await item(`Trello: campo ${nome}`, async () => `"${(await trello('GET', `/customFields/${idCampo}`)).name}"`);
    }
    if (c.stirling.url)
      await item('Stirling-PDF', async () => {
        const r = await buscar(`${c.stirling.url}/api/v1/info/status`, { headers: c.stirling.chave ? { 'X-API-KEY': c.stirling.chave } : undefined, signal: AbortSignal.timeout(8000) });
        return r.ok || r.status === 404 ? `respondeu ${r.status}` : { ok: false, detalhe: `respondeu ${r.status}` };
      });
    else out.push({ item: 'Stirling-PDF', ok: true, detalhe: 'não configurado (o PDF sai do texto do original)' });
    return out;
  }

  /** As claquetes que entraram na produção nos últimos `dias` dias (para a aba Sem cadastro). */
  async function claquetesRecentes(dias = 90) {
    if (!t.producao) return [];
    const linhas = await sql(`SELECT "claquete", "data_entrada" FROM ${t.producao} WHERE "data_entrada" >= now() - ($1 || ' days')::interval AND "claquete" IS NOT NULL`, [String(dias | 0)]);
    return linhas.map((l) => ({ claquete: String(l.claquete ?? ''), em: quando(l.data_entrada) ? new Date(l.data_entrada).toISOString() : '' }));
  }

  /** As últimas claquetes da produção com a atração registrada (para conferir o reconhecimento com dados reais). */
  async function ultimasClaquetes(n = 500) {
    if (!t.producao) return [];
    const linhas = await sql(`SELECT "claquete", "atracao" FROM ${t.producao} WHERE "claquete" IS NOT NULL ORDER BY "data_entrada" DESC NULLS LAST LIMIT ${Math.min(2000, Math.max(1, n | 0))}`);
    return linhas.map((l) => ({ claquete: String(l.claquete ?? ''), atracao: lerLista(l.atracao)[0] ?? '' })).filter((l) => l.claquete && l.atracao);
  }

  /** Cria uma opção no fim de um campo de lista do Trello (a praça nova da Configuração, #73). */
  const criarOpcao = (campoId, texto) => trello('POST', `/customField/${campoId}/options`, { corpo: { pos: 'bottom', value: { text: texto } } });

  /** Para o diagnóstico: a busca da atração com a chave usada e o erro, se houver. */
  const diagnosticarAtracao = async (claquete) => {
    try {
      return { chave: chaveDaAtracao(claquete, c.pracas), tabela: t.atracoes ?? null, atracao: (await acharAtracao(claquete))?.nome ?? '' };
    } catch (e) {
      return { chave: chaveDaAtracao(claquete, c.pracas), tabela: t.atracoes ?? null, erro: e instanceof Error ? e.message : String(e) };
    }
  };

  /* ---------- o webhook do quadro (#87): o Trello avisa o PROMeiro direto ---------- */
  const webhooks = {
    /** Os webhooks deste token (de todos os quadros): { id, callbackURL, idModel, active }. */
    listar: () => trello('GET', `/tokens/${encodeURIComponent(c.token)}/webhooks`),
    /** Registra um (o Trello confere o endereço com um HEAD antes de aceitar). */
    criar: ({ callbackURL, idModel, description }) => trello('POST', '/webhooks', { corpo: { callbackURL, idModel, description } }),
    /** Liga de novo o que o Trello desligou (depois de muitas falhas de entrega). */
    ligar: (id) => trello('PUT', `/webhooks/${encodeURIComponent(id)}`, { corpo: { active: true } }),
    apagar: (id) => trello('DELETE', `/webhooks/${encodeURIComponent(id)}`),
  };

  return { ligado: c.ligado, config: c, webhooks, ler: (rota, consulta) => trello('GET', rota, { consulta }), lerSeExistir, criarOpcao, temProducao: !!(t.producao && consultar), producaoDoPeriodo, producaoDosCards, comentar, apagarComentario, apagarCard, entrarNoCard, sairDoCard, moverCard, recriarCard, linhaDoCardRecriado, apagarLinhaDaProducao, producaoInteira, producaoAlteradaDesde, designersDaProducao, exibicoesDosCards, enviar, criarCard, lerCard, mudarCard, teableCriar, teableAtualizar, teableAnexar, andamento, atracoesDosCards, filmesProximos, projetosDosFilmes, artesDoCard, atracaoDaClaquete, diagnosticarAtracao, conferir, ultimasClaquetes, claquetesRecentes, naProducao, pdfDaProducao, pdfDoRoteiro: emPdf, parar: () => banco?.end?.().catch(() => {}) };
}
