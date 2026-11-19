/* Envio do roteiro para o Trello, no lugar do fluxo "upload_roteiros" do n8n.
   Cria o card na lista certa, com a checklist das artes, os campos (praça, redator, editor, prioridade,
   projeto, output, BOT, entrada), o PDF anexo e, quando a atração é uma sessão de filmes, o vínculo com
   o card do filme. Depois registra a entrada na tabela de produção da arte do Teable.
   Tudo o que é ID do quadro e das tabelas vem do ambiente: este repositório é público. */

import { abrirPg, nomeLimpoPg, nomesDoPg } from './pauta.mjs';
import { gerarPdf } from './pdf.mjs';

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
    .replace(/^RIO\s+|\s+SP$/, '')
    .replace(/\sOPÇÃO|\sOPCAO/, ' ')
    .replace(/\).*$/, ')')
    .replace(/FUT[\s(]+COPA BR.*/, 'FUT COPA BR')
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/\s+(DAI|PRACAS|ESCALADA|EMMY|TESTE|SEMANA|AESP|CAMPEAO|ESTREIA|\d+SEG)\b.*$/i, '')
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
    chave: env.TRELLO_KEY || '',
    token: env.TRELLO_TOKEN || '',
    listas: { padrao: env.TRELLO_LISTA || '', SP: env.TRELLO_LISTA_SP || '', VT: env.TRELLO_LISTA_VT || '' },
    campos: {
      praca: env.TRELLO_CAMPO_PRACA || '',
      redator: env.TRELLO_CAMPO_REDATOR || '',
      editor: env.TRELLO_CAMPO_EDITOR || '',
      prioridade: env.TRELLO_CAMPO_PRIORIDADE || '',
      projeto: env.TRELLO_CAMPO_PROJETO || '',
      output: env.TRELLO_CAMPO_OUTPUT || '',
      bot: env.TRELLO_CAMPO_BOT || '',
      entrada: env.TRELLO_CAMPO_ENTRADA || '',
      // campos copiados do card do filme (complexidade, uso de IA)
      doFilme: String(env.TRELLO_CAMPOS_FILME || '').split(',').map((s) => s.trim()).filter(Boolean),
    },
    pracas: pares(env.TRELLO_PRACAS),
    prioridadeAlta: env.TRELLO_PRIORIDADE_ALTA || '',
    teable: {
      url: (env.TEABLE_URL || '').replace(/\/+$/, ''),
      token: env.TEABLE_TOKEN_ESCRITA || env.TEABLE_TOKEN || '',
      producao: env.TEABLE_ARTE_PRODUCAO || '',
      redatores: env.TEABLE_REDATORES || '',
    },
    pg: {
      url: env.TEABLE_PG_URL || '',
      // limpos do mesmo jeito que a pauta (aspas, espaços, "esquema.tabela")
      esquema: nomesDoPg(env, '').esquema,
      producao: nomeLimpoPg(env.TEABLE_PG_ARTE),
      redatores: nomeLimpoPg(env.TEABLE_PG_REDATORES),
      editores: nomeLimpoPg(env.TEABLE_PG_EDITORES),
      atracoes: nomeLimpoPg(env.TEABLE_PG_ATRACOES),
      prioridade: nomeLimpoPg(env.TEABLE_PG_PRIORIDADE),
      filmes: nomeLimpoPg(env.TEABLE_PG_FILMES_ESQUEMA),
      sessoes: nomeLimpoPg(env.TEABLE_PG_SESSOES),
      logBot: nomeLimpoPg(env.TEABLE_PG_LOG_BOT),
    },
    sftp: {
      host: env.SFTP_HOST || '',
      porta: Number(env.SFTP_PORTA) || 22,
      usuario: env.SFTP_USUARIO || '',
      senha: env.SFTP_SENHA || '',
      pasta: (env.SFTP_PASTA || '/PROMO/WORKFLOWS/ROTEIROS').replace(/\/+$/, ''),
    },
    endereco: (env.PROMEIRO_URL || '').replace(/\/+$/, ''),
  };
  c.ligado = !!(c.chave && c.token && c.listas.padrao);
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
  if (!c.listas.padrao) f.push('TRELLO_LISTA');
  return f;
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
    redatores: tabela(c.pg.esquema, c.pg.redatores),
    editores: tabela(c.pg.esquema, c.pg.editores),
    atracoes: tabela(c.pg.esquema, c.pg.atracoes),
    prioridade: tabela(c.pg.esquema, c.pg.prioridade),
    sessoes: tabela(c.pg.filmes, c.pg.sessoes),
    logBot: tabela(c.pg.filmes, c.pg.logBot),
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
      // a linha que já tem opção no Trello vem primeiro
      const [l] = await sql(
        `SELECT "__id" AS id, "redator", "redator_ID", "customField_ID" FROM ${t.redatores}
         WHERE UPPER("user") = UPPER($1) OR UPPER("redator") = UPPER($1)
         ORDER BY ("redator_ID" IS NULL OR "redator_ID" = '') LIMIT 1`,
        [nome],
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
    else await teableCriar(c.teable.redatores, { user: nome, redator: nome, redator_ID: op.id, customField_ID: campoId }).catch(() => {});
    return { idValue: op.id, nome: nomeNoCard, campo: campoId };
  }

  async function acharEditor(nome) {
    if (!nome || !t.editores) return null;
    const [l] = await sql(`SELECT "editor", "editor_ID", "customField_ID" FROM ${t.editores} WHERE "editor" = $1 LIMIT 1`, [nome]);
    return l?.editor_ID ? { idValue: l.editor_ID, nome: l.editor, campo: l.customField_ID || c.campos.editor } : null;
  }

  async function acharAtracao(claquete) {
    if (!t.atracoes) return null;
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

  /** Atração que é "sessão" (filmes): o card do filme no log do bot, do mesmo dia de exibição. */
  async function cardDoFilme(atracao, dataExibicao) {
    if (!atracao || !dataExibicao || !t.sessoes || !t.logBot) return null;
    const sessoes = (await sql(`SELECT "sessao" FROM ${t.sessoes}`)).map((l) => String(l.sessao || '').toUpperCase());
    if (!sessoes.includes(atracao.toUpperCase())) return null;
    const [l] = await sql(
      `SELECT "card_ID", "output" FROM ${t.logBot}
       WHERE "sessao"->>'title' = $1 AND "data_de_exibicao"::date = $2::date
         AND NOT (COALESCE("labels", '[]'::jsonb) @> '["CANCELADO"]'::jsonb) LIMIT 1`,
      [atracao.toUpperCase(), dataExibicao],
    );
    return l?.card_ID ? { card: l.card_ID, output: caminho(l.output) } : null;
  }

  /* ---------- arquivo ---------- */

  /** O Trello só mostra PDF: o PDF que subiu vai como veio; Word, RTF, texto e colado viram PDF aqui mesmo. */
  async function emPdf(r, artes) {
    if (r.original && /\.pdf$/i.test(r.original.nome)) return { ...r.original, tipo: 'application/pdf' };
    const base = (r.original?.nome ?? String(r.meta.claquete || 'roteiro')).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_');
    return { nome: `${base}.pdf`, tipo: 'application/pdf', dados: await gerarPdf({ meta: r.meta, doc: r.doc, artes }) };
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
    const claquete = String(m.claquete || '').trim();
    if (!claquete) throw new Error('O roteiro está sem claquete.');
    const avisos = [];
    const tentar = async (o_que, f) => {
      try {
        return await f();
      } catch (e) {
        avisos.push(`${o_que}: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    };

    if (await tentar('conferir a produção de hoje', () => jaEntrouHoje(claquete))) return { duplicado: true, avisos };

    const hoje = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD no horário de Brasília
    const chave = chaveN8n(claquete);
    const praca = ['SP', 'RJ', 'G5'].includes(m.praca) ? m.praca : 'G5';
    const vt = /\bVt\b/i.test(claquete) || /\bVt\b/i.test(r.original?.nome ?? '');
    const lista = (vt && c.listas.VT) || (praca === 'SP' && c.listas.SP) || c.listas.padrao;

    const [redator, editor, atracao, alta] = await Promise.all([
      tentar('achar o redator', () => acharRedator(m.redator)),
      tentar('achar o editor', () => acharEditor(m.editor)),
      tentar('achar a atração', () => acharAtracao(claquete)),
      tentar('conferir a prioridade', () => prioridadeAlta(chave)),
    ]);
    const filme = await tentar('achar o card do filme', () => cardDoFilme(atracao?.nome, m.dataExibicao));

    const listaDeArtes = (r.artes ?? [])
      .map((a) => (typeof a === 'string' ? { texto: a, tipo: '' } : { texto: String(a?.texto ?? ''), tipo: String(a?.tipo ?? '') }))
      .map((a) => ({ texto: a.texto.trim(), tipo: a.tipo.trim() }))
      .filter((a) => a.texto);
    const artes = listaDeArtes.map((a) => a.texto);
    const desc = [
      '**ARTES IDENTIFICADAS:**',
      artes.length ? '`' + artes.join('`, `') + '`' : '—',
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

    // o card é o que importa: sem ele, o envio falhou
    // no corpo, não no endereço: roteiro com muitas artes estouraria o tamanho da URL
    const card = await trello('POST', '/cards', { corpo: { idList: lista, name: claquete, desc } });
    if (!card?.id) throw new Error('O Trello não devolveu o card criado.');

    await tentar('criar a checklist', async () => {
      const lista = await trello('POST', '/checklists', { consulta: { idCard: card.id, name: 'ARTES PRODUZIDAS' } });
      for (const a of artes) await trello('POST', `/checklists/${lista.id}/checkItems`, { consulta: { name: a } });
    });
    const output = filme?.output || atracao?.output || '';
    await Promise.all([
      tentar('marcar o BOT', () => campo(card.id, c.campos.bot, { value: { checked: 'true' } })),
      c.pracas[praca] && tentar('preencher a praça', () => campo(card.id, c.campos.praca, { idValue: c.pracas[praca] })),
      redator && tentar('preencher o redator', () => campo(card.id, redator.campo, { idValue: redator.idValue })),
      editor && tentar('preencher o editor', () => campo(card.id, editor.campo, { idValue: editor.idValue })),
      alta && tentar('preencher a prioridade', () => campo(card.id, c.campos.prioridade, { idValue: c.prioridadeAlta })),
      atracao?.projeto && tentar('preencher o projeto', () => campo(card.id, c.campos.projeto, { value: { text: atracao.projeto } })),
      output && tentar('preencher o output', () => campo(card.id, c.campos.output, { value: { text: output } })),
    ]);

    if (filme)
      await tentar('ligar ao card do filme', async () => {
        await trello('POST', `/cards/${card.id}/attachments`, { consulta: { url: `https://trello.com/c/${filme.card}` } });
        const doFilme = await trello('GET', `/cards/${filme.card}`, { consulta: { fields: 'id,idMembers', customFieldItems: 'true' } });
        if (doFilme.idMembers?.length) await trello('PUT', `/cards/${card.id}`, { consulta: { idMembers: doFilme.idMembers.join(',') } });
        for (const item of doFilme.customFieldItems ?? []) {
          if (!c.campos.doFilme.includes(item.idCustomField)) continue;
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
        doc: anexo?.url ?? '',
        redator: redator?.nome ?? m.redator ?? '',
        card_ID: card.id,
        data_entrada: entrada,
        texto: String(r.texto ?? '').replaceAll('\u0000', ''),
        atracao: atracao?.nome ?? m.programa ?? '',
        editor: editor?.nome ?? m.editor ?? '',
        key: chave,
        praca,
        prioridade: alta ? 'ALTA' : '',
        workflow: r.endereco || c.endereco || 'PROMeiro',
        urgencia: 1,
        complexidade: 1,
      }),
    );

    return { card: { id: card.id, url: card.shortUrl || card.url || `https://trello.com/c/${card.id}` }, avisos };
  }

  return { ligado: c.ligado, config: c, enviar, parar: () => banco?.end?.().catch(() => {}) };
}
