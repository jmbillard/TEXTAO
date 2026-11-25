/* O envio de um filme da prévia (aba Filmes): o card no Trello e a exibição no Teable, como o fluxo CARDS do n8n
   fazia (ADR 0004). Para cada filme pronto e de identidade própria:

   1. o filme novo entra no cadastro (título como no cadastro, ano), antes do card, para o card levar os caminhos dele;
   2. o card: na lista dos filmes, com o nome "SESSÃO DD/MM - TÍTULO (ANO) INÉDITO", a descrição com as artes e os
      caminhos, as etiquetas, a data, a checklist das artes novas, os campos (BOT, praça, projeto, output, entrada e a
      prioridade MÉDIA do inédito) e o pôster anexado como capa;
   3. depois do card: a exibição (filme, sessão, dia, card e artes; nada na ARTE_producao, ADR 0001), o ano que
      faltava (ou o escolhido no !) e o pôster no cadastro do filme, quando ele não tem ou o da prévia é mais atual.

   O que der errado depois do card vira aviso: o card já existe e não pode ir de novo. Os IDs vêm do ambiente.

   A Sessão da Tarde não tem identidade própria do filme: os filmes de uma semana (de segunda a domingo) viram um card
   só, como o "card resumo" do CARDS: "SESSÃO DA TARDE DD/MM A DD/MM - TÍTULOS", todos os títulos na descrição, os que
   faltam produzir (o título não está no acervo do filme) na checklist "TÍTULOS A PRODUZIR", sem campos e sem pôster.
   Cada filme ganha a sua exibição, ligada ao card e com as artes dele (o título), que vão ao acervo do filme quando o
   card sai. Um segundo Envio na mesma semana (desta prévia ou de outra) acrescenta ao card que já existe, achado pelas
   exibições da semana. */

import { chaveDeArte, vinculos } from './acervo.mjs';
import { nomesDoPg } from './pauta.mjs';
import { acervoDaAtracao } from './cadastros.mjs';
import { diaDaPrevia } from './conferencia.mjs';
import { chaveDoTitulo } from './titulo.mjs';

const NOME_SQL = /^[A-Za-z0-9_]+$/;
export const ehSessaoDaTarde = (sessao) => /^sess[aã]o\s*da\s*tarde$/i.test(String(sessao ?? '').trim());
/** A segunda-feira da semana do dia ("AAAA-MM-DD"): a semana do card da Sessão da Tarde vai de segunda a domingo. */
export function segundaDaSemana(dia) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia ?? ''))) return '';
  return maisDias(dia, -((new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7));
}
function maisDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
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

/** O "tentar" do envio: o que der errado vira aviso (na lista dada) e devolve null. */
const tentarCom = (avisos) => async (o_que, f) => {
  try {
    return await f();
  } catch (e) {
    avisos.push(`${o_que}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
};

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
  const t = { filmes: tabela(env.TEABLE_PG_FILMES), atracoes: tabela(env.TEABLE_PG_ATRACOES), exibicoes: tabela(env.TEABLE_PG_EXIBICOES) };
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

  /** As sessões de filme do cadastro de atrações (o nome certo e o vínculo), pela chave sem acento: as de acervo do
      filme, mais a Sessão da Tarde. SELECT *: a coluna é acervo ou, antes da troca no Teable, tipo. */
  async function sessoes() {
    if (!t.atracoes) return new Map();
    const linhas = await consultar(`SELECT * FROM ${t.atracoes}`);
    const daSessao = (l) => acervoDaAtracao(l) === 'filme' || ehSessaoDaTarde(l.atracao);
    return new Map(linhas.filter(daSessao).map((l) => [chaveDaSessao(l.atracao), { id: String(l.__id), nome: String(l.atracao ?? '') }]));
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
    const tentar = tentarCom(avisos);
    lote.sessoes ??= await tentar('ler as sessões', sessoes) ?? new Map();
    const sessao = lote.sessoes.get(chaveDaSessao(lido.sessao)) ?? { id: '', nome: String(lido.sessao).trim() };
    const ano = conferencia.ano ?? null;

    const filme = await filmeDoEnvio(lido, conferencia, lote, agora);
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
        etiquetas: etiquetasDa(sessao),
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
    await depoisDoCard({ conferencia, poster, dia, filme, titulo }, lote, tentar);
    return { card, filme: filme.id, avisos };
  }

  /** As etiquetas do card de filme: as de todos e as da sessão ("SUPERCINE=id", escrita de qualquer jeito). */
  const etiquetasDa = (sessao) => [...c.filmes.etiquetas, ...Object.entries(c.filmes.etiquetasDaSessao).filter(([s]) => chaveDaSessao(s) === chaveDaSessao(sessao.nome)).map(([, id]) => id)];

  /** O filme do envio: o do banco ou o novo (cadastrado uma vez só no Envio, mesmo que passe em duas sessões). */
  async function filmeDoEnvio(lido, conferencia, lote, agora) {
    if (conferencia.filme) return doCadastro(conferencia.filme.id);
    const ano = conferencia.ano ?? null;
    const chave = `${chaveDoTitulo(lido.titulo)}|${ano ?? ''}`;
    let filme = lote.novos.get(chave);
    if (!filme) {
      filme = await cadastrar(lido, ano, agora);
      lote.novos.set(chave, filme);
      lote.aoCadastrar?.();
    }
    return filme;
  }

  /** O cadastro depois do card: o ano que faltava (ou o da prévia escolhido no "ano diferente") e o pôster. */
  async function depoisDoCard({ conferencia, poster, dia, filme, titulo }, lote, tentar) {
    const ano = conferencia.ano ?? null;
    if (conferencia.filme && ano && ano !== conferencia.filme.ano) await tentar('completar o ano', () => trello.teableAtualizar(c.teable.filmes, filme.id, { ano_de_producao: ano }));
    // um pôster por filme no Envio, mesmo que ele passe em duas sessões
    if (poster && c.teable.posterDoFilme && !lote.posteres.has(filme.id)) {
      lote.posteres.add(filme.id);
      await tentar('pôr o pôster no cadastro', () => posterNoCadastro(filme, poster, titulo, dia.slice(0, 7)));
    }
  }

  /* ---------- a Sessão da Tarde: o card da semana ---------- */
  const DIAS_CURTOS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const ddmm = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  const comDia = (dia) => `${ddmm(dia)} ${DIAS_CURTOS[new Date(`${dia}T12:00:00Z`).getUTCDay()]}`;
  const CHECKLIST_DA_TARDE = 'TÍTULOS A PRODUZIR';

  /** O nome, a descrição, a data e a checklist do card da semana, a regra do nó "Sessão da Tarde" do CARDS.
      @param linhas [{ dia, nome, fazer, novo }] */
  function cardDaSemana(linhas) {
    const ordem = [...linhas].sort((a, b) => a.dia.localeCompare(b.dia));
    const fazer = ordem.filter((l) => l.fazer);
    const ja = ordem.filter((l) => !l.fazer);
    const de = ordem[0].dia;
    const ate = ordem.at(-1).dia;
    return {
      nome: `SESSÃO DA TARDE ${ddmm(de)}${ate !== de ? ` A ${ddmm(ate)}` : ''} - TÍTULOS`,
      desc: [
        `**TÍTULOS IDENTIFICADOS (${ordem.length}):**`,
        ...ordem.map((l) => `\`${comDia(l.dia)}\` ${l.nome}${l.fazer ? (l.novo ? ' · filme novo' : '') : ' · ✓ já existe'}`),
        '',
        `**A PRODUZIR (${fazer.length}):** no checklist.`,
        ...(ja.length ? ['', `**JÁ EXISTEM (não produzir):** ${ja.map((l) => l.nome).join(', ')}`] : []),
      ].join('\n'),
      data: `${de}T03:00:00.000Z`,
      itens: fazer.map((l) => `${comDia(l.dia)} · ${l.nome}`),
    };
  }

  /** Os títulos que a descrição do card da semana já lista (a linha "`DD/MM DIA` TÍTULO (ANO)[ · …]"), com o dia: o
      DD/MM no ano mais perto da semana. O card do n8n pode pegar mais de uma semana, e nenhum título se perde. */
  function linhasDoCard(desc, segunda) {
    const perto = (dm) => {
      const ano = Number(segunda.slice(0, 4));
      const dias = [ano - 1, ano, ano + 1].map((a) => `${a}-${dm.slice(3, 5)}-${dm.slice(0, 2)}`);
      const longe = (d) => Math.abs(Date.parse(`${d}T12:00:00Z`) - Date.parse(`${segunda}T12:00:00Z`));
      return dias.sort((a, b) => longe(a) - longe(b))[0];
    };
    return String(desc ?? '')
      .split('\n')
      .map((l) => /^`(\d{2}\/\d{2}) [^`]*` (.+?)( · filme novo| · ✓ já existe)?$/.exec(l.trim()))
      .filter(Boolean)
      .map(([, dm, nome, marca]) => ({ dia: perto(dm), nome, fazer: !marca?.includes('já existe'), novo: !!marca?.includes('filme novo') }));
  }

  /** O card da Sessão da Tarde da semana que começa na segunda dada, pelas exibições dela que têm card: o ID ou null. */
  async function cardJaDaSemana(segunda) {
    if (!t.exibicoes) return null;
    const linhas = await consultar(
      `SELECT "card_ID", "sessao", "exibicao", "labels" FROM ${t.exibicoes}
       WHERE ("data_de_exibicao" AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date`,
      [segunda, maisDias(segunda, 6)],
    );
    const daTarde = (l) => ehSessaoDaTarde(vinculos(l.sessao)[0]?.title) || chaveDaSessao(l.exibicao).startsWith(chaveDaSessao('Sessão da Tarde'));
    const l = linhas.find((x) => x.card_ID && daTarde(x) && !JSON.stringify(x.labels ?? '').toUpperCase().includes('CANCELADO'));
    return l ? String(l.card_ID) : null;
  }

  /**
   * Envia os filmes da Sessão da Tarde de uma semana: o cadastro (filme novo, ano, pôster), como nos outros, o card da
   * semana (novo, ou o que já existe com os filmes acrescentados) e a exibição de cada um, ligada ao card. Sem título a
   * produzir e sem card na semana, não há card, como no CARDS: as exibições ficam sem ele.
   * @param itens [{ lido, conferencia, poster }] da mesma semana
   * @returns na mesma ordem: { card: { id, url } | null, filme, avisos } ou { erro } (o filme que não pôde ir)
   */
  async function enviarSemanaDaTarde(itens, lote) {
    const agora = new Date().toISOString();
    const avisos = [];
    lote.sessoes ??= (await tentarCom(avisos)('ler as sessões', sessoes)) ?? new Map();
    const sessao = lote.sessoes.get(chaveDaSessao('Sessão da Tarde')) ?? { id: '', nome: 'Sessão da Tarde' };
    const resultados = itens.map(() => null);
    const vao = [];
    for (const [k, { lido, conferencia, poster }] of itens.entries()) {
      const dia = diaDaPrevia(lido.data);
      if (!dia) resultados[k] = { erro: 'falta a data' };
      else if (!String(lido.titulo ?? '').trim()) resultados[k] = { erro: 'falta o título' };
      else
        try {
          const filme = await filmeDoEnvio(lido, conferencia, lote, agora);
          // a arte do filme é o título dele no template: a produzir, ou já no acervo do filme
          const arte = String(filme.titulo || lido.titulo).toUpperCase();
          const fazer = !conferencia.artes.existentes.some((a) => chaveDeArte(a) === chaveDeArte(arte));
          vao.push({ k, lido, conferencia, poster, dia, filme, arte, fazer });
        } catch (e) {
          resultados[k] = { erro: e instanceof Error ? e.message : String(e) };
        }
    }
    if (!vao.length) return resultados;
    const linhas = vao.map(({ conferencia, dia, filme, arte, fazer }) => {
      const ano = conferencia.ano ?? null;
      return { dia, nome: `${arte}${ano ? ` (${ano})` : ''}`, fazer, novo: !!filme.novo };
    });
    const segunda = segundaDaSemana(vao[0].dia);

    let card = null;
    const existente = await cardJaDaSemana(segunda);
    if (existente) {
      // o card que já existe (de um Envio anterior, desta prévia ou de outra) recebe os filmes novos
      const atual = await trello.lerCard(existente);
      const antes = linhasDoCard(atual.desc, segunda);
      const semana = cardDaSemana([...antes, ...linhas.filter((l) => !antes.some((a) => a.dia === l.dia && a.nome === l.nome))]);
      const lista = atual.checklists.find((l) => /T[IÍ]TULOS/i.test(l.nome));
      const itensNovos = cardDaSemana(linhas).itens.filter((i) => !(lista?.itens ?? []).includes(i));
      // a descrição que não segue o formato (mexida à mão) fica, com a lista nova embaixo
      const desc = antes.length || !atual.desc.trim() ? semana.desc : `${atual.desc}\n\n---\n${semana.desc}`;
      await trello.mudarCard(atual.id, { nome: semana.nome, desc, data: semana.data, checklist: { id: lista?.id, nome: CHECKLIST_DA_TARDE, itens: itensNovos } }, avisos);
      card = { id: atual.id, url: atual.url };
    } else {
      const semana = cardDaSemana(linhas);
      if (semana.itens.length)
        card = await trello.criarCard(
          {
            lista: c.filmes.lista,
            nome: semana.nome,
            desc: semana.desc,
            etiquetas: etiquetasDa(sessao),
            data: semana.data,
            posicao: 'top',
            checklist: { nome: CHECKLIST_DA_TARDE, itens: semana.itens },
          },
          avisos,
        );
    }

    // a exibição de cada filme, ligada ao card, com as artes dele (o título: a produzir ou que já existe), para o card
    // da semana levar ao acervo de cada filme o título dele; e o cadastro depois do card
    for (const { k, lido, conferencia, poster, dia, filme, arte, fazer } of vao) {
      const seus = [...avisos];
      const tentar = tentarCom(seus);
      const titulo = filme.titulo || lido.titulo;
      await tentar('gravar a exibição', () =>
        trello.teableCriar(c.teable.exibicoes, {
          exibicao: `${sessao.nome.toUpperCase()} ${ddmm(dia)} - ${titulo.toUpperCase()}`,
          data_de_exibicao: `${dia}T03:00:00.000Z`,
          inedito: !!lido.inedito,
          output: filme.output_win || '',
          criado_em: agora,
          artes: fazer ? arte : '',
          ...(fazer ? {} : { artes_existentes: arte }),
          ...(card ? { card_ID: card.id, link: card.url } : {}),
          filme: { id: filme.id },
          ...(sessao.id ? { sessao: { id: sessao.id } } : {}),
        }),
      );
      await depoisDoCard({ conferencia, poster, dia, filme, titulo }, lote, tentar);
      resultados[k] = { card, filme: filme.id, avisos: seus };
    }
    return resultados;
  }

  const novoLote = (aoCadastrar) => ({ sessoes: null, novos: new Map(), posteres: new Set(), aoCadastrar });
  return { ligado: true, faltando: [], enviarUm, enviarSemanaDaTarde, novoLote };
}
