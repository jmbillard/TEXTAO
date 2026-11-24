/* O envio de um filme da prévia (aba Filmes): o card no Trello e a exibição no Teable, como o fluxo CARDS do n8n
   fazia (ADR 0004). Para cada filme pronto e de identidade própria:

   1. o filme novo entra no cadastro (título como no cadastro, ano), antes do card, para o card levar os caminhos dele;
   2. o card: na lista dos filmes, com o nome "SESSÃO DD/MM - TÍTULO (ANO) INÉDITO", a descrição com as artes e os
      caminhos, as etiquetas, a data, a checklist das artes novas, os campos (BOT, praça, projeto, output, entrada e a
      prioridade MÉDIA do inédito) e o pôster anexado como capa;
   3. depois do card: a exibição (filme, sessão, dia, card e artes; nada na ARTE_producao, ADR 0001), o ano que
      faltava (ou o escolhido no !) e o pôster no cadastro do filme, quando ele não tem ou o da prévia é mais atual.

   O que der errado depois do card vira aviso: o card já existe e não pode ir de novo. Os IDs vêm do ambiente. */

import { nomesDoPg } from './pauta.mjs';
import { diaDaPrevia } from './conferencia.mjs';
import { chaveDoTitulo } from './titulo.mjs';

const NOME_SQL = /^[A-Za-z0-9_]+$/;
export const ehSessaoDaTarde = (sessao) => /^sess[aã]o\s*da\s*tarde$/i.test(String(sessao ?? '').trim());
const chaveDaSessao = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/* O título do filme novo no cadastro, em "title case", a regra do fluxo CARDS (nó "Cadastro: novos e anos"). */
const MENORES = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'num', 'numa', 'por', 'para', 'pra', 'pro', 'com', 'sem', 'à', 'às', 'ao', 'aos', 'pelo', 'pela', 'pelos', 'pelas', 'ou', 'que', 'se', 'of', 'the', 'and', 'in', 'on', 'at', 'to', 'for', 'with', 'an', 'or', 'vs', 'vs.', 'x']);
const ROMANO = /^(II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/i;
export function tituloDoCadastro(t) {
  const partes = String(t || '').trim().replace(/\s+/g, ' ').split(/(\s[-–]\s|:\s*|\s+)/);
  let i = 0;
  let quebra = false;
  return partes
    .map((p) => {
      if (!p) return p;
      if (/^(\s[-–]\s|:\s*|\s+)$/.test(p)) {
        quebra = /[:\-–]/.test(p);
        return p;
      }
      const m = p.match(/^(["'(¿¡]*)(.*?)(["'),.!?…]*)$/);
      const w = m[2];
      let out;
      if (ROMANO.test(w) || /^([A-Za-z]\.)+[A-Za-z]?\.?$/.test(w) || /\d/.test(w)) out = w.toUpperCase();
      else {
        const lo = w.toLocaleLowerCase('pt-BR');
        if (i > 0 && !quebra && MENORES.has(lo)) out = lo;
        else if (/^mc[a-z]{2,}$/.test(lo)) out = 'Mc' + lo[2].toUpperCase() + lo.slice(3);
        else out = lo.split('-').map((s) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1)).join('-');
      }
      i += 1;
      quebra = false;
      return m[1] + out + m[3];
    })
    .join('');
}

/** A descrição do card, a mesma do card de roteiro e do CARDS: as artes, as que já existem e os caminhos. */
function descricao(artes, c) {
  return [
    '**ARTES IDENTIFICADAS:**',
    artes.novas.length ? '`' + artes.novas.join('`, `') + '`' : '—',
    ...(artes.existentes.length ? ['', '**JÁ EXISTEM (não produzir):**', '`' + artes.existentes.join('`, `') + '`'] : []),
    '',
    '---',
    '**CAMINHO DO PROJETO:**',
    '`' + (c.projeto_win || '') + '`',
    '`' + (c.projeto_mac || '') + '`',
    '',
    '---',
    '**CAMINHO DAS ARTES:**',
    '`' + (c.output_win || '') + '`',
    '`' + (c.output_mac || '') + '`',
    '',
  ].join('\n');
}

const nomeDeArquivo = (t) => String(t || 'poster').replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.jpg';
// o pôster que o PROMeiro põe no cadastro leva o mês da prévia no nome: é assim que se sabe se o da prévia é mais atual
const MARCA_DA_PREVIA = /\(prévia (\d{4}-\d{2})\)/;

/**
 * @param env as variáveis do servidor (as do Trello e do Teable; TEABLE_PG_* para ler os filmes e as sessões)
 * @param deps.trello o módulo do Trello (criarCard e a escrita no Teable)
 * @param deps.consultar (sql, params) => linhas, no Postgres do Teable
 */
export function criarEnvioDeFilmes(env, { trello, consultar } = {}) {
  const c = trello?.config;
  const esquema = nomesDoPg(env, '').esquema;
  const tabela = (v) => {
    const nome = nomesDoPg(env, v).tabela;
    return esquema && NOME_SQL.test(esquema) && nome && NOME_SQL.test(nome) ? `"${esquema}"."${nome}"` : null;
  };
  const t = { filmes: tabela(env.TEABLE_PG_FILMES), atracoes: tabela(env.TEABLE_PG_ATRACOES) };
  const faltando = [
    !c?.chave && 'TRELLO_KEY',
    !c?.token && 'TRELLO_TOKEN',
    !c?.filmes.lista && 'TRELLO_LISTA_FILMES',
    !c?.teable.url && 'TEABLE_URL',
    !c?.teable.token && 'TEABLE_TOKEN',
    !c?.teable.filmes && 'TEABLE_FILMES',
    !c?.teable.exibicoes && 'TEABLE_EXIBICOES',
    (!consultar || !t.filmes) && 'TEABLE_PG_FILMES',
  ].filter(Boolean);
  if (faltando.length) return { ligado: false, faltando };

  /** As sessões de filme do cadastro de atrações (o nome certo e o vínculo), pela chave sem acento. */
  async function sessoes() {
    if (!t.atracoes) return new Map();
    const linhas = await consultar(`SELECT "__id", "atracao" FROM ${t.atracoes} WHERE "tipo" = 'Sessão de filme' OR "atracao" ILIKE 'sess_o da tarde'`);
    return new Map(linhas.map((l) => [chaveDaSessao(l.atracao), { id: String(l.__id), nome: String(l.atracao ?? '') }]));
  }

  async function doCadastro(id) {
    const linhas = await consultar(`SELECT "__id", "titulo", "projeto_win", "projeto_mac", "output_win", "output_mac", "poster" FROM ${t.filmes} WHERE "__id" = $1`, [id]);
    const l = linhas.find((x) => String(x.__id) === id);
    if (!l) throw new Error(`o filme ${id} não está mais no cadastro`);
    return { id, titulo: String(l.titulo ?? ''), projeto_win: l.projeto_win ?? '', projeto_mac: l.projeto_mac ?? '', output_win: l.output_win ?? '', output_mac: l.output_mac ?? '', poster: Array.isArray(l.poster) ? l.poster : [] };
  }

  /** O filme novo entra no cadastro; o Teable devolve os caminhos (fórmulas) junto. */
  async function cadastrar(lido, ano, agora) {
    const titulo = tituloDoCadastro(lido.titulo);
    const r = await trello.teableCriar(c.teable.filmes, { titulo, cadastrado_em: agora, ...(ano ? { ano_de_producao: ano } : {}) });
    const rec = r?.records?.[0];
    if (!rec?.id) throw new Error('o Teable não devolveu o filme novo');
    const f = rec.fields ?? {};
    return { id: rec.id, titulo, projeto_win: f['projeto win'] ?? '', projeto_mac: f['projeto mac'] ?? '', output_win: f['output win'] ?? '', output_mac: f['output mac'] ?? '', poster: [], novo: true };
  }

  /** O pôster da prévia vai para o cadastro quando ele não tem um, ou quando o que tem veio de uma prévia mais antiga
      (ou de fora do PROMeiro): o da prévia substitui o antigo. */
  async function posterNoCadastro(filme, poster, titulo, mes) {
    const meses = filme.poster.map((a) => MARCA_DA_PREVIA.exec(String(a?.name ?? ''))?.[1] ?? '');
    if (filme.poster.length && meses.some((m) => m >= mes)) return;
    const nome = nomeDeArquivo(titulo).replace(/\.jpg$/, ` (prévia ${mes}).jpg`);
    const r = await trello.teableAnexar(c.teable.filmes, filme.id, c.teable.posterDoFilme, { nome, tipo: 'image/jpeg', dados: poster });
    if (!filme.poster.length) return;
    const lista = r?.fields?.[c.teable.posterDoFilme] ?? r?.fields?.poster ?? [];
    const novo = lista.at(-1);
    if (novo) await trello.teableAtualizar(c.teable.filmes, filme.id, { poster: [novo] });
  }

  /**
   * Envia um filme: o card e o registro. Falha (sem card) quando falta o essencial ou o Trello recusa o card.
   * @param lido o filme lido (com a escolha); conferencia a conferência dele com o banco; poster o recorte (Buffer)
   * @param lote o que vale para o Envio inteiro: { sessoes (Map), novos (Map chave → filme cadastrado agora),
   *   posteres (Set dos filmes que já receberam o pôster), aoCadastrar () (um filme novo entrou no cadastro) }
   * @returns { card: { id, url }, filme: id do filme no cadastro, avisos }
   */
  async function enviarUm({ lido, conferencia, poster }, lote) {
    const dia = diaDaPrevia(lido.data);
    if (!String(lido.sessao ?? '').trim()) throw new Error('falta a sessão');
    if (!dia) throw new Error('falta a data');
    if (!String(lido.titulo ?? '').trim()) throw new Error('falta o título');
    const agora = new Date().toISOString();
    const avisos = [];
    const tentar = async (o_que, f) => {
      try {
        return await f();
      } catch (e) {
        avisos.push(`${o_que}: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    };
    lote.sessoes ??= await tentar('ler as sessões', sessoes) ?? new Map();
    const sessao = lote.sessoes.get(chaveDaSessao(lido.sessao)) ?? { id: '', nome: String(lido.sessao).trim() };
    const ano = conferencia.ano ?? null;

    // o filme: o do banco ou o novo (cadastrado uma vez só no Envio, mesmo que passe em duas sessões)
    let filme;
    if (conferencia.filme) filme = await doCadastro(conferencia.filme.id);
    else {
      const chave = `${chaveDoTitulo(lido.titulo)}|${ano ?? ''}`;
      filme = lote.novos.get(chave);
      if (!filme) {
        filme = await cadastrar(lido, ano, agora);
        lote.novos.set(chave, filme);
        lote.aoCadastrar?.();
      }
    }
    const titulo = filme.titulo || lido.titulo;
    const ddmm = `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
    const exibicao = `${sessao.nome.toUpperCase()} ${ddmm} - ${titulo.toUpperCase()}`;
    // o CARDS cadastra o filme novo antes de montar o card: na prática, a MÉDIA vai só no inédito
    const prioridade = !!lido.inedito;
    const f = c.filmes;
    const campos = {
      ...(c.campos.bot ? { [c.campos.bot]: { value: { checked: 'true' } } } : {}),
      ...(c.campos.output ? { [c.campos.output]: { value: { text: filme.output_win || '' } } } : {}),
      ...(prioridade && c.campos.prioridade && f.prioridadeMedia ? { [c.campos.prioridade]: { idValue: f.prioridadeMedia, value: { text: 'MÉDIA' } } } : {}),
      ...(c.campos.projeto ? { [c.campos.projeto]: { value: { text: filme.projeto_win || '' } } } : {}),
      ...(c.campos.praca && f.praca ? { [c.campos.praca]: { idValue: f.praca } } : {}),
      ...(c.campos.entrada ? { [c.campos.entrada]: { value: { date: agora } } } : {}),
    };
    const card = await trello.criarCard(
      {
        lista: f.lista,
        nome: `${exibicao}${ano ? ` (${ano})` : ''}${lido.inedito ? ' INÉDITO' : ''}`,
        desc: descricao(conferencia.artes, filme),
        etiquetas: [...f.etiquetas, ...Object.entries(f.etiquetasDaSessao).filter(([s]) => chaveDaSessao(s) === chaveDaSessao(sessao.nome)).map(([, id]) => id)],
        data: `${dia}T03:00:00.000Z`,
        posicao: 'top',
        checklist: { nome: 'ARTES PRODUZIDAS', itens: conferencia.artes.novas },
        campos,
        anexos: poster ? [{ nome: nomeDeArquivo(titulo), tipo: 'image/jpeg', dados: poster, capa: true }] : [],
      },
      avisos,
    );

    await tentar('gravar a exibição', () =>
      trello.teableCriar(c.teable.exibicoes, {
        exibicao,
        data_de_exibicao: `${dia}T03:00:00.000Z`,
        card_ID: card.id,
        link: card.url,
        inedito: !!lido.inedito,
        output: filme.output_win || '',
        criado_em: agora,
        artes: conferencia.artes.novas.join(' | '),
        ...(conferencia.artes.existentes.length ? { artes_existentes: conferencia.artes.existentes.join(' | ') } : {}),
        filme: { id: filme.id },
        ...(sessao.id ? { sessao: { id: sessao.id } } : {}),
      }),
    );
    // o ano que faltava no cadastro, ou o da prévia escolhido no "ano diferente"
    if (conferencia.filme && ano && ano !== conferencia.filme.ano) await tentar('completar o ano', () => trello.teableAtualizar(c.teable.filmes, filme.id, { ano_de_producao: ano }));
    // um pôster por filme no Envio, mesmo que ele passe em duas sessões
    if (poster && c.teable.posterDoFilme && !lote.posteres.has(filme.id)) {
      lote.posteres.add(filme.id);
      await tentar('pôr o pôster no cadastro', () => posterNoCadastro(filme, poster, titulo, dia.slice(0, 7)));
    }
    return { card, filme: filme.id, avisos };
  }

  const novoLote = (aoCadastrar) => ({ sessoes: null, novos: new Map(), posteres: new Set(), aoCadastrar });
  return { ligado: true, faltando: [], enviarUm, novoLote };
}
