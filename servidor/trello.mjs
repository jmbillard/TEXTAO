/* Envio do roteiro para o Trello, no lugar do fluxo "upload_roteiros" do n8n.
   Cria o card na lista certa, com a checklist das artes, os campos (praça, redator, editor, prioridade,
   projeto, output, BOT, entrada), o PDF anexo e, quando a atração é uma sessão de filmes, o vínculo com
   o card do filme. Depois registra a entrada na tabela de produção da arte do Teable.
   Tudo o que é ID do quadro e das tabelas vem do ambiente: este repositório é público. */

import { abrirPg, nomeLimpoPg, nomesDoPg } from './pauta.mjs';
import { gerarPdf } from './pdf.mjs';
import { normalizarKey } from './cadastros.mjs';

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

/** A atração dentro da claquete, para casar com os padrões do cadastro (a mesma regra do n8n). */
export const chaveDaAtracao = (claquete) =>
  String(claquete || '')
    .toUpperCase()
    .replaceAll(/_/g, ' ')
    // a praça do Rio na frente: "RIO CHEF..." ou com a atração no parêntese, "RIO(CHEF)MANUT"
    .replace(/^RIO\s*\(([^)]*)\)\s*/, '$1 ')
    .replace(/^RIO\s+|\s+SP$/, '')
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

/** Comparação de claquetes escritas de jeitos diferentes ("Festa_19_11" e "Festa 19/11"). */
const mesmaClaquete = (a, b) => chaveN8n(a).replace(/ /g, '') === chaveN8n(b).replace(/ /g, '');

const SEM_CAMINHO = /^(cole_aqui_o_caminho|caminho_nao_encontrado)$/;
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
    // entrada de cada praça (RJ e G5 podem repetir a mesma lista); TRELLO_LISTA é a reserva de quem não tiver a sua
    listas: {
      padrao: env.TRELLO_LISTA || '',
      SP: env.TRELLO_LISTA_SP || '',
      RJ: env.TRELLO_LISTA_RJ || '',
      G5: env.TRELLO_LISTA_G5 || '',
      INTER: env.TRELLO_LISTA_INTER || '',
      VT: env.TRELLO_LISTA_VT || '',
    },
    // saída de cada praça (para onde o card vai quando a arte fica pronta)
    saidas: { SP: env.TRELLO_SAIDA_SP || '', RJ: env.TRELLO_SAIDA_RJ || '', G5: env.TRELLO_SAIDA_G5 || '', INTER: env.TRELLO_SAIDA_INTER || '' },
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
    pracas: pares(env.TRELLO_PRACAS),
    prioridadeAlta: env.TRELLO_PRIORIDADE_ALTA || '',
    // as opções do campo Complexidade, na ordem BAIXA, MÉDIA, ALTA (o nível 1 é a primeira)
    complexidades: String(env.TRELLO_COMPLEXIDADE_OPCOES || '').split(',').map((s) => s.trim()),
    // os cards de filme da prévia (aba Filmes), como o fluxo CARDS do n8n: a lista dos filmes, as etiquetas (todas
    // ou por sessão, "SUPERCINE=id"), a opção da praça e a prioridade MÉDIA do inédito
    filmes: {
      lista: nomeLimpoPg(env.TRELLO_LISTA_FILMES),
      etiquetas: String(env.TRELLO_FILMES_ETIQUETAS || '').split(',').map((s) => s.trim()).filter(Boolean),
      etiquetasDaSessao: pares(env.TRELLO_FILMES_ETIQUETAS_SESSAO),
      praca: nomeLimpoPg(env.TRELLO_FILMES_PRACA),
      prioridadeMedia: nomeLimpoPg(env.TRELLO_PRIORIDADE_MEDIA),
    },
    teable: {
      url: (env.TEABLE_URL || '').replace(/\/+$/, ''),
      token: env.TEABLE_TOKEN || env.TEABLE_TOKEN_ESCRITA || '',
      producao: env.TEABLE_ARTE_PRODUCAO || '',
      redatores: env.TEABLE_REDATORES || '',
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
      producao: nomeLimpoPg(env.TEABLE_PG_ARTE),
      // de onde ler a produção (andamento, claquete repetida, "já entrou hoje"), quando não é a mesma em que o app grava:
      // na convivência com o n8n, a base de produção (esquema.tabela); vazia = a mesma de TEABLE_PG_ARTE
      leituraEsquema: env.TEABLE_PG_ARTE_LEITURA ? nomesDoPg(env, env.TEABLE_PG_ARTE_LEITURA).esquema : '',
      leitura: env.TEABLE_PG_ARTE_LEITURA ? nomesDoPg(env, env.TEABLE_PG_ARTE_LEITURA).tabela : '',
      redatores: nomeLimpoPg(env.TEABLE_PG_REDATORES),
      editores: nomeLimpoPg(env.TEABLE_PG_EDITORES),
      atracoes: nomeLimpoPg(env.TEABLE_PG_ATRACOES),
      prioridade: nomeLimpoPg(env.TEABLE_PG_PRIORIDADE),
      // exibições de filme (filme + sessão + dia + card da prévia), na mesma base
      exibicoes: nomeLimpoPg(env.TEABLE_PG_EXIBICOES),
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
  c.ligado = !!(c.chave && c.token && (c.listas.padrao || PRACAS_TRELLO.some((p) => c.listas[p])));
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
/** As praças do quadro, cada uma com a sua entrada e a sua saída. */
export const PRACAS_TRELLO = ['SP', 'RJ', 'G5', 'INTER'];

export function faltasDoTrello(c) {
  if (!c.chave && !c.token) return null;
  const f = [];
  if (!c.chave) f.push('TRELLO_KEY');
  if (!c.token) f.push('TRELLO_TOKEN');
  if (!c.listas.padrao && !PRACAS_TRELLO.some((p) => c.listas[p])) f.push('TRELLO_LISTA_SP / _RJ / _G5 / _INTER (ao menos uma entrada)');
  return f;
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
 * @param env variáveis de ambiente
 * @param deps.buscar fetch
 * @param deps.consultar (sql, params) => linhas; sem ele, abre o Postgres de TEABLE_PG_URL
 * @param deps.sftp (caminho, buffer) => Promise; sem ele, usa ssh2-sftp-client quando SFTP_HOST existe
 */
export function criarTrello(env, deps = {}) {
  const c = configDoTrello(env);
  const buscar = deps.buscar ?? fetch;
  const API = (env.TRELLO_API || API_PADRAO).replace(/\/+$/, '');
  let banco = null;
  const consultar =
    deps.consultar ??
    (c.pg.url
      ? async (sql, params = []) => {
          banco ??= await abrirPg(c.pg.url);
          return (await banco.query(sql, params)).rows;
        }
      : null);
  const tabela = (esquema, nome) => (esquema && nome ? `"${esquema}"."${nome}"` : null);
  const t = {
    producao: tabela(c.pg.esquema, c.pg.producao),
    leitura: c.pg.leitura ? tabela(c.pg.leituraEsquema || c.pg.esquema, c.pg.leitura) : tabela(c.pg.esquema, c.pg.producao),
    redatores: tabela(c.pg.esquema, c.pg.redatores),
    editores: tabela(c.pg.esquema, c.pg.editores),
    atracoes: tabela(c.pg.esquema, c.pg.atracoes),
    prioridade: tabela(c.pg.esquema, c.pg.prioridade),
    exibicoes: tabela(c.pg.esquema, c.pg.exibicoes),
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
    if (!r.ok) throw new Error(`Trello respondeu ${r.status} em ${metodo} ${rota.replace(/\/[0-9a-f]{24}/g, '/…')}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
    return r.json().catch(() => ({}));
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
    if (!t.leitura) return false;
    // "hoje" é o dia de Brasília, não o do relógio UTC do banco
    const linhas = await sql(
      `SELECT "claquete" FROM ${t.leitura} WHERE ("data_entrada" AT TIME ZONE 'America/Sao_Paulo')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
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
      if (l?.redator_ID) return { idValue: l.redator_ID, nome: l.redator, campo: l.customField_ID || campoId };
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
    const [l] = await sql(`SELECT "editor", "editor_ID", "customField_ID" FROM ${t.editores} WHERE "editor" = $1 LIMIT 1`, [nome]);
    return l?.editor_ID ? { idValue: l.editor_ID, nome: l.editor, campo: l.customField_ID || c.campos.editor } : null;
  }

  async function acharAtracao(claquete, nome) {
    if (!t.atracoes) return null;
    // a atração escolhida na revisão vale mais que a key da claquete (DONA serve a mais de uma novela)
    if (nome) {
      const [n] = await sql(`SELECT "atracao", "projeto_win", "output_win" FROM ${t.atracoes} WHERE LOWER("atracao") = LOWER($1) LIMIT 1`, [nome]);
      if (n) return { nome: n.atracao, projeto: caminho(n.projeto_win), output: caminho(n.output_win) };
    }
    const chave = chaveDaAtracao(claquete);
    if (!chave) return null;
    const [l] = await sql(
      `SELECT "atracao", "projeto_win", "output_win" FROM ${t.atracoes}
       WHERE EXISTS (SELECT 1 FROM jsonb_array_elements("pattern"::jsonb) AS e WHERE UPPER(e->>'title') LIKE UPPER($1) || '%')
       ORDER BY "atracao" DESC LIMIT 1`,
      [chave],
    );
    return l ? { nome: l.atracao, projeto: caminho(l.projeto_win), output: caminho(l.output_win) } : null;
  }

  async function prioridadeAlta(chave) {
    if (!t.prioridade || !c.prioridadeAlta) return false;
    return (await sql(`SELECT 1 FROM ${t.prioridade} WHERE "key" = $1 LIMIT 1`, [chave])).length > 0;
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
   * Manda um roteiro.
   * @param r.meta meta do roteiro (claquete, praca, redator, editor, dataExibicao, programa)
   * @param r.artes artes na ordem: texto, ou { texto, tipo }
   * @param r.doc documento do editor, para o PDF
   * @param r.texto texto corrido
   * @param r.original { nome, tipo, dados: Buffer } | null
   * @param r.endereco link do roteiro no PROMeiro
   * @returns { card: { id, url }, avisos: string[] } ou { duplicado: true }
   */
  async function enviar(r, agora = new Date()) {
    if (!c.ligado) throw new Error('O Trello não está configurado (TRELLO_KEY, TRELLO_TOKEN e TRELLO_LISTA).');
    const m = r.meta;
    // sem claquete, o card leva o título ou o nome do arquivo: nada impede o envio
    const claquete = String(m.claquete || m.titulo || (r.original?.nome ?? '').replace(/\.[^.]+$/, '').replace(/_/g, ' ') || 'Roteiro sem claquete').trim();
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
    const chave = chaveN8n(claquete);
    const praca = PRACAS_TRELLO.includes(m.praca) ? m.praca : 'G5';
    const vt = /\bVt\b/i.test(claquete) || /\bVt\b/i.test(r.original?.nome ?? '');
    const lista = (vt && c.listas.VT) || c.listas[praca] || c.listas.padrao;
    if (!lista) throw new Error(`Não há lista de entrada para ${praca} no Trello (TRELLO_LISTA_${praca}).`);
    if (!(vt && c.listas.VT) && !c.listas[praca]) avisos.push(`sem TRELLO_LISTA_${praca}: o card de ${praca} foi para a lista padrão (TRELLO_LISTA)`);

    const [redator, editor, atracao, alta] = await Promise.all([
      tentar('achar o redator', () => acharRedator(m.redator)),
      tentar('achar o editor', () => acharEditor(m.editor)),
      tentar('achar a atração', () => acharAtracao(claquete, m.programa)),
      tentar('conferir a prioridade', () => prioridadeAlta(chave)),
    ]);
    const filme = await tentar('achar o card do filme', () => cardDoFilme(atracao?.nome, m.dataExibicao));
    // o card do filme é lido antes dos campos: a complexidade do card é a maior entre a dele e a da revisão
    const doFilme = filme ? await tentar('ler o card do filme', () => trello('GET', `/cards/${filme.card}`, { consulta: { fields: 'id,idMembers', customFieldItems: 'true' } })) : null;
    const complexidade = Math.max(complexidadeDoCard(listaDeArtes), nivelDoFilme(doFilme));

    const desc = [
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

    // o card é o que importa: sem ele, o envio falhou (a checklist que falhar vira aviso)
    const card = await criarCard({ lista, nome: claquete, desc, checklist: { nome: 'ARTES PRODUZIDAS', itens: artes } }, avisos);
    const output = filme?.output || atracao?.output || '';
    const opcaoDaComplexidade = c.campos.complexidade ? c.complexidades[complexidade - 1] : '';
    await Promise.all([
      tentar('marcar o BOT', () => campo(card.id, c.campos.bot, { value: { checked: 'true' } })),
      c.pracas[praca] && tentar('preencher a praça', () => campo(card.id, c.campos.praca, { idValue: c.pracas[praca] })),
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

    // o roteiro em PDF, anexado ao card; e o original guardado no OneDrive, como o n8n fazia
    let anexo = null;
    const pdf = await tentar('gerar o PDF', () => emPdf(r, listaDeArtes));
    if (pdf)
      anexo = await tentar('anexar o PDF', () => {
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
        doc: anexo?.url ?? '',
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
      lista ??= await tentar('criar a checklist', () => trello('POST', '/checklists', { consulta: { idCard: id, name: 'ARTES PRODUZIDAS' } }));
      if (lista?.id) for (const a of novas) await tentar(`incluir a arte ${a}`, () => trello('POST', `/checklists/${lista.id}/checkItems`, { consulta: { name: a } }));
    }
    const pdf = await tentar('gerar o PDF', () => emPdf(r, listaDeArtes));
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
        // lendo de outra base (convivência com o n8n), o registro dela não existe aqui: acha o daqui pelo card
        const mesmaBase = t.leitura === t.producao;
        if (mesmaBase && !r.v2De.registro) return;
        // a leitura que falha vira aviso: na mesma base, as artes e o texto vão do mesmo jeito, só sem a complexidade
        const [linha] =
          (await tentar('ler a complexidade da produção da arte', () =>
            sql(`SELECT "__id" AS id, "complexidade" FROM ${t.producao} WHERE ${mesmaBase ? '"__id"' : '"card_ID"'} = $1 LIMIT 1`, [mesmaBase ? r.v2De.registro : id]),
          )) ?? [];
        const registro = mesmaBase ? r.v2De.registro : linha?.id;
        if (!registro) return;
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
    if (!t.leitura || !claquete) return null;
    const chave = chaveN8n(claquete);
    const linhas = await sql(
      `SELECT "__id" AS registro, "card_ID", "claquete", "key", "status", "data_entrada", "artes_quantidade", "artes", "texto", "doc", "redator", "editor" FROM ${t.leitura}
       WHERE "data_entrada" >= now() - interval '3 months' ORDER BY "data_entrada" DESC NULLS LAST LIMIT 5000`,
    );
    const l = linhas.find((x) => x.key === chave) ?? linhas.find((x) => mesmaClaquete(x.claquete, claquete));
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

  /** O PDF que está no card da produção da arte: o do link guardado no Teable, ou o último PDF anexado ao card. */
  async function pdfDaProducao(claquete) {
    if (!c.ligado) return null;
    const p = await naProducao(claquete);
    if (!p) return null;
    let url = p.doc && /\.pdf($|\?)/i.test(p.doc) ? p.doc : '';
    if (!url) {
      const anexos = (await trello('GET', `/cards/${p.card}/attachments`).catch(() => [])) ?? [];
      url = [...anexos].reverse().find((a) => /pdf/i.test(a.mimeType ?? '') || /\.pdf$/i.test(a.name ?? ''))?.url ?? '';
    }
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
   * @returns { [id]: { status: string[], designers: string[], entregue: boolean, entrega: string|null, prioridade?: true } }
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
    if (!t.leitura || !itens.length) return {};
    try {
      const semCard = itens.some((i) => !i.card);
      const linhas = await sql(
        `SELECT "card_ID", "claquete", "status", "designers", "entregue", "data_entrega", "data_entrada" FROM ${t.leitura}
         WHERE "card_ID" = ANY($1::text[])${semCard ? ` OR "data_entrada" >= now() - interval '30 days'` : ''}`,
        [itens.map((i) => i.card).filter(Boolean)],
      );
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

  /** As chaves (dentre estas) que estão na lista de prioridade; sem a lista configurada ou fora do ar, nenhuma. */
  async function listaDePrioridade(chaves) {
    const validas = [...new Set(chaves.filter(Boolean))];
    if (!t.prioridade || !c.prioridadeAlta || !validas.length) return new Set();
    try {
      const chavesNaLista = new Set((await sql(`SELECT "key" FROM ${t.prioridade} WHERE "key" = ANY($1::text[])`, [validas])).map((l) => l.key));
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
    if (!t.leitura || !ids.length) return {};
    // o andamento é pedido por cada navegador aberto: o envio que espera a atração não relê a cada pedido
    if (memoAtracoes.chave === ids.join() && Date.now() - memoAtracoes.em < 30_000) return memoAtracoes.dados;
    const linhas = await sql(`SELECT "card_ID", "atracao" FROM ${t.leitura} WHERE "card_ID" = ANY($1::text[])`, [ids]);
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
    const colunas = {
      producao: ['card_ID', 'claquete', 'key', 'status', 'designers', 'entregue', 'data_entrega', 'data_entrada', 'artes', 'texto', 'doc', 'redator', 'editor', 'atracao', 'filme'],
      leitura: ['card_ID', 'claquete', 'key', 'status', 'designers', 'entregue', 'data_entrega', 'data_entrada'],
      redatores: ['redator', 'redator_ID', 'customField_ID'],
      editores: ['editor', 'editor_ID', 'customField_ID'],
      atracoes: ['atracao', 'pattern', 'projeto_win', 'output_win', 'acervo'],
      prioridade: ['key'],
      exibicoes: ['filme', 'sessao', 'data_de_exibicao', 'card_ID', 'output', 'labels'],
    };
    for (const [nome, cols] of Object.entries(colunas)) {
      if (!t[nome]) {
        out.push({ item: `Postgres: ${nome}`, ok: nome === 'leitura' || nome === 'exibicoes' || nome === 'prioridade', detalhe: 'não configurada' });
        continue;
      }
      await item(`Postgres: ${nome}`, async () => {
        const [esq, tab] = t[nome].replaceAll('"', '').split('.');
        const tem = (await sql(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`, [esq, tab])).map((l) => l.column_name);
        if (!tem.length) return { ok: false, detalhe: `a tabela ${t[nome]} não existe (ou o usuário não lê)` };
        const faltam = cols.filter((c) => !tem.includes(c));
        const [{ n }] = await sql(`SELECT count(*)::int AS n FROM ${t[nome]}`);
        return faltam.length ? { ok: false, detalhe: `faltam colunas: ${faltam.join(', ')}` } : `${n} linhas`;
      });
    }
    if (!c.chave || !c.token) out.push({ item: 'Trello', ok: false, detalhe: 'sem TRELLO_KEY ou TRELLO_TOKEN' });
    else {
      await item('Trello: chave e token', async () => `conta ${(await trello('GET', '/members/me', { consulta: { fields: 'username' } })).username}`);
      const listas = { ...Object.fromEntries(Object.entries(c.listas).map(([k, v]) => [`lista ${k}`, v])), ...Object.fromEntries(Object.entries(c.saidas ?? {}).map(([k, v]) => [`saída ${k}`, v])) };
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
    if (!t.leitura) return [];
    const linhas = await sql(`SELECT "claquete", "data_entrada" FROM ${t.leitura} WHERE "data_entrada" >= now() - ($1 || ' days')::interval AND "claquete" IS NOT NULL`, [String(dias | 0)]);
    return linhas.map((l) => ({ claquete: String(l.claquete ?? ''), em: quando(l.data_entrada) ? new Date(l.data_entrada).toISOString() : '' }));
  }

  /** As últimas claquetes da produção com a atração registrada (para conferir o reconhecimento com dados reais). */
  async function ultimasClaquetes(n = 500) {
    if (!t.leitura) return [];
    const linhas = await sql(`SELECT "claquete", "atracao" FROM ${t.leitura} WHERE "claquete" IS NOT NULL ORDER BY "data_entrada" DESC NULLS LAST LIMIT ${Math.min(2000, Math.max(1, n | 0))}`);
    return linhas.map((l) => ({ claquete: String(l.claquete ?? ''), atracao: lerLista(l.atracao)[0] ?? '' })).filter((l) => l.claquete && l.atracao);
  }

  /** Para o diagnóstico: a busca da atração com a chave usada e o erro, se houver. */
  const diagnosticarAtracao = async (claquete) => {
    try {
      return { chave: chaveDaAtracao(claquete), tabela: t.atracoes ?? null, atracao: (await acharAtracao(claquete))?.nome ?? '' };
    } catch (e) {
      return { chave: chaveDaAtracao(claquete), tabela: t.atracoes ?? null, erro: e instanceof Error ? e.message : String(e) };
    }
  };

  return { ligado: c.ligado, config: c, enviar, criarCard, lerCard, mudarCard, teableCriar, teableAtualizar, teableAnexar, andamento, atracoesDosCards, filmesProximos, artesDoCard, atracaoDaClaquete, diagnosticarAtracao, conferir, ultimasClaquetes, claquetesRecentes, naProducao, pdfDaProducao, pdfDoRoteiro: emPdf, parar: () => banco?.end?.().catch(() => {}) };
}
