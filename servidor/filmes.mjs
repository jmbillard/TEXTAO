/* A aba Filmes: a prévia mensal de filmes guardada no servidor e lida página por página pela IA do n8n.
   O navegador separa as páginas úteis e recorta os pôsteres; aqui ficam a prévia (no banco local), as imagens
   (em disco) e a fila de leitura, que manda uma página por vez para o mesmo webhook que o FilmeBOT usava,
   sem mudar o que ele recebe e devolve. O endereço do webhook vem do ambiente: este repositório é público. */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { vinculos } from './acervo.mjs';
import { conferirFilme, diaDaPrevia } from './conferencia.mjs';
import { criarEnvioDeFilmes, ehSessaoDaTarde, segundaDaSemana } from './exibicao.mjs';
import { abrirPg, nomesDoPg } from './pauta.mjs';
import { chaveDoTitulo } from './titulo.mjs';

/* ---------- o título lido pela IA e o texto do PDF (a regra do FilmeBOT) ---------- */
const compacto = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'e').replace(/[^a-z0-9]/gi, '').toLowerCase();
const MIUDAS = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'the', 'de', 'da', 'do', 'e']);
const palavras = (t) =>
  String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' e ').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !MIUDAS.has(w)).join('');
function distancia(a, b) {
  let ant = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = cur;
  }
  return ant[b.length];
}
/** O texto do PDF e o título lido são o mesmo filme? Tolera artigos e pequenas diferenças, mas não o número da continuação. */
export function mesmoTitulo(texto, titulo) {
  const a = compacto(texto);
  const b = compacto(titulo);
  if (!a || !b) return false;
  if (a === b || (a.startsWith(b) && b.length >= 4) || (b.startsWith(a) && a.length >= 6)) return true;
  const x = palavras(texto);
  const y = palavras(titulo);
  if (x.length < 6 || y.length < 6) return false;
  if (x === y) return true;
  if ((x.match(/\d+/g) || []).join() !== (y.match(/\d+/g) || []).join()) return false;
  return distancia(x, y) <= Math.floor(Math.max(x.length, y.length) * 0.12);
}

/** Cada filme vai para o pôster logo acima do seu título; sem achar o título, e com um pôster por filme, vai pela ordem. */
export function ligarPosteres(filmes, posteres, textos) {
  const usados = new Set();
  const peloTitulo = filmes.map((f) => {
    if (compacto(f.titulo).length < 2) return null;
    let melhor = null;
    for (const linha of textos.filter((l) => mesmoTitulo(l.str, f.titulo)))
      posteres.forEach(({ caixa: { x, y, width, height } }, i) => {
        const sobra = Math.min(x + width, linha.x + linha.width) - Math.max(x, linha.x);
        const vao = linha.top - (y + height);
        if (sobra <= 0 || vao < -height * 0.15 || vao > height * 0.6) return;
        const nota = vao - sobra * 0.01;
        if (!melhor || nota < melhor.nota) melhor = { i, nota };
      });
    return melhor ? melhor.i : null;
  });
  return filmes.map((f, i) => {
    let p = peloTitulo[i];
    if (p === null && posteres.length === filmes.length) p = i;
    if (p !== null && usados.has(p)) p = null;
    if (p !== null) usados.add(p);
    return { ...f, poster: p };
  });
}

/* ---------- as fileiras da página: o filme que a leitura pôs por engano na Sessão da Tarde ---------- */
/** Os pôsteres da fileira de cima (identidade própria): os da altura do pôster mais alto, se há outra fileira embaixo. */
export function fileiraDeCima(posteres) {
  if (!posteres.length) return [];
  const topo = posteres.reduce((a, p) => (p.caixa.y < a.caixa.y ? p : a)).caixa;
  const cima = posteres.flatMap((p, i) => (p.caixa.y + p.caixa.height / 2 <= topo.y + topo.height ? [i] : []));
  return cima.length < posteres.length ? cima : [];
}

/** O alto da coluna do pôster (a regra do FilmeBOT): as linhas de texto logo acima dele, da mais perto para a mais longe. */
function textoAcima({ x, y, width, height }, textos) {
  return textos
    .filter((l) => Math.min(x + width, l.x + l.width) - Math.max(x, l.x) > 0 && y - l.top > 0 && y - l.top < height * 0.7)
    .sort((a, b) => b.top - a.top);
}

/** "06/12" no alto da coluna vira "06/12/2026", no ano da data lida (na virada do ano, o ano ao lado). */
function dataDaColuna(linhas, dataLida) {
  const m = linhas.map((l) => /\b(\d{1,2})\/(\d{1,2})\b/.exec(l.str)).find(Boolean);
  const lida = /^\d{1,2}\/(\d{1,2})\/(\d{4})$/.exec(String(dataLida ?? '').trim());
  if (!m || !lida) return '';
  const [dia, mes] = [Number(m[1]), Number(m[2])];
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return '';
  const ano = Number(lida[2]) + (mes - Number(lida[1]) > 6 ? -1 : Number(lida[1]) - mes > 6 ? 1 : 0);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}

/**
 * As sessões para perguntar ao filme que subiu: primeiro a da coluna da vaga dele (com a data do alto da coluna), depois
 * as outras da página. A da coluna é o nome escrito acima do pôster; sem ele (o nome é logotipo), as sessões da página que
 * nenhum outro filme usa, na ordem da leitura, casadas com as colunas de cima sem sessão, da esquerda para a direita.
 * @param pagina { posteres, textos, sessoes (as da leitura), filmes }
 * @returns [{ sessao, data?, coluna? }]
 */
export function sessoesParaPerguntar(pagina, i) {
  const { posteres = [], textos = [], sessoes = [], filmes = [] } = pagina;
  const chave = compacto;
  const todas = [];
  for (const s of [...sessoes, ...filmes.map((f) => f.sessao)].map((s) => String(s ?? '').trim()))
    if (s && !ehSessaoDaTarde(s) && !todas.some((t) => chave(t) === chave(s))) todas.push(s);
  const f = filmes[i];
  const caixa = f && f.poster !== null && f.poster !== undefined ? posteres[f.poster]?.caixa : null;
  if (!caixa) return todas.map((sessao) => ({ sessao }));
  const linhas = textoAcima(caixa, textos);
  let daColuna = linhas.map((l) => todas.find((s) => chave(s) === chave(l.str))).find(Boolean);
  if (!daColuna) {
    const temSessao = (j) => j !== i && filmes[j].sessao && !ehSessaoDaTarde(filmes[j].sessao);
    const usadas = new Set(filmes.filter((_, j) => temSessao(j)).map((g) => chave(g.sessao)));
    const livres = todas.filter((s) => !usadas.has(chave(s)));
    const colunas = fileiraDeCima(posteres)
      .filter((p) => !filmes.some((g, j) => g.poster === p && temSessao(j)))
      .sort((a, b) => posteres[a].caixa.x - posteres[b].caixa.x);
    if (livres.length === colunas.length) daColuna = livres[colunas.indexOf(f.poster)];
  }
  if (!daColuna) return todas.map((sessao) => ({ sessao }));
  const data = dataDaColuna(linhas, f.data);
  return [{ sessao: daColuna, ...(data ? { data } : {}), coluna: true }, ...todas.filter((s) => s !== daColuna).map((sessao) => ({ sessao }))];
}

/** A resposta do fluxo de leitura: um objeto (ou uma lista com um) com "movies". */
function respostaDaLeitura(texto) {
  if (!texto.trim()) throw new Error('a leitura voltou vazia');
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error('a leitura voltou um JSON inválido');
  }
  const r = Array.isArray(dados) ? dados[0] : dados;
  if (!r || typeof r !== 'object' || !Array.isArray(r.movies)) throw new Error('a leitura não trouxe a lista "movies"');
  const ano = (v) => (/^\d{4}$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : null);
  return {
    filmes: r.movies.map((m) => ({
      titulo: typeof m?.titulo === 'string' ? m.titulo.trim() : '',
      ano: ano(m?.ano_de_producao),
      sessao: typeof m?.sessao === 'string' ? m.sessao.trim() : '',
      data: typeof m?.data === 'string' ? m.data.trim() : '',
      inedito: m?.inedito === true,
    })),
    sessoes: Array.isArray(r.sessoes) ? r.sessoes.filter((x) => typeof x === 'string') : [],
  };
}

const b64 = (v) => (typeof v === 'string' && v ? Buffer.from(v, 'base64') : null);
const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const umaCaixa = (c) => ({ x: numero(c?.x), y: numero(c?.y), width: numero(c?.width), height: numero(c?.height) });

/* ---------- o banco de filmes e as exibições, no Postgres do Teable (só leitura) ---------- */
const NOME_SQL = /^[A-Za-z0-9_]+$/;
const vinculo = (v) => vinculos(v)[0] ?? null;
const cancelada = (labels) => JSON.stringify(labels ?? '').toUpperCase().includes('CANCELADO');
const diaEmBrasilia = (v) => {
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
};

/**
 * A conferência dos filmes lidos com o banco: TEABLE_PG_FILMES (a tabela de filmes) liga; TEABLE_PG_EXIBICOES
 * (o card que já existe) e TEABLE_PG_ACERVO (as artes que o filme já tem) completam.
 * @param consultar (sql, params) => linhas, no Postgres do Teable
 */
function criarConferencia(env, consultar) {
  const esquema = nomesDoPg(env, '').esquema;
  const tabela = (v) => {
    const nome = nomesDoPg(env, v).tabela;
    return esquema && NOME_SQL.test(esquema) && nome && NOME_SQL.test(nome) ? `"${esquema}"."${nome}"` : null;
  };
  const t = { filmes: tabela(env.TEABLE_PG_FILMES), exibicoes: tabela(env.TEABLE_PG_EXIBICOES), acervo: tabela(env.TEABLE_PG_ACERVO) };
  if (!consultar || !t.filmes) return null;

  // o banco de filmes inteiro (alguns milhares), guardado por 1 min
  let memo = { em: 0, filmes: null };
  async function filmesDoBanco() {
    if (memo.filmes && Date.now() - memo.em < 60_000) return memo.filmes;
    const linhas = await consultar(`SELECT "__id", "titulo", "ano_de_producao" FROM ${t.filmes}`);
    const filmes = linhas.map((l) => {
      const ano = Number.parseInt(String(l.ano_de_producao ?? ''), 10);
      return { id: String(l.__id), titulo: String(l.titulo ?? ''), ano: Number.isInteger(ano) ? ano : null };
    });
    memo = { em: Date.now(), filmes };
    return filmes;
  }

  /** A conferência de cada filme lido (na mesma ordem). */
  async function conferir(lidos) {
    if (!lidos.length) return [];
    const filmes = await filmesDoBanco();
    const dias = [...new Set(lidos.map((l) => diaDaPrevia(l.data)).filter(Boolean))];
    const exibicoes =
      t.exibicoes && dias.length
        ? (
            await consultar(
              `SELECT "filme", "sessao", "data_de_exibicao", "card_ID", "link", "labels" FROM ${t.exibicoes}
               WHERE ("data_de_exibicao" AT TIME ZONE 'America/Sao_Paulo')::date = ANY($1::date[])`,
              [dias],
            )
          )
            .filter((e) => !cancelada(e.labels) && vinculo(e.filme)?.id)
            .map((e) => ({
              filme: vinculo(e.filme).id,
              sessao: vinculo(e.sessao)?.title ?? '',
              dia: diaEmBrasilia(e.data_de_exibicao),
              link: String(e.link || (e.card_ID ? `https://trello.com/c/${e.card_ID}` : '')),
            }))
        : [];
    // as artes no acervo dos filmes que podem ser estes (os da mesma chave e os escolhidos)
    const chaves = new Set(lidos.map((l) => chaveDoTitulo(l.titulo)));
    const ids = [...new Set([...filmes.filter((f) => chaves.has(chaveDoTitulo(f.titulo))).map((f) => f.id), ...lidos.map((l) => l.escolha?.filme).filter((x) => x && x !== 'novo')])];
    const acervo = new Map();
    if (t.acervo && ids.length)
      for (const l of await consultar(`SELECT "arte", "filme" FROM ${t.acervo} WHERE "filme"::jsonb->>'id' = ANY($1::text[])`, [ids])) {
        const id = vinculo(l.filme)?.id;
        if (id) acervo.set(id, [...(acervo.get(id) ?? []), String(l.arte ?? '')]);
      }
    return lidos.map((l) => conferirFilme(l, { filmes, exibicoes, acervo }));
  }
  // um filme novo entrou no cadastro: a próxima conferência relê o banco
  const esquecer = () => void (memo = { em: 0, filmes: null });
  return { conferir, esquecer };
}

/**
 * @param deps.consultar (sql, params) => linhas; sem ele, abre o Postgres de TEABLE_PG_URL
 * @param deps.trello o módulo do Trello (o card e a escrita no Teable), para o envio
 */
export function criarFilmes(env, { db, pasta, buscar = fetch, consultar, trello } = {}) {
  const enderecoDaLeitura = String(env.N8N_FILMES_LER || '').trim();
  const faltando = [!enderecoDaLeitura && 'N8N_FILMES_LER', !pasta && 'FILMES_PASTA'].filter(Boolean);
  const ligado = !faltando.length && !!db;
  if (!ligado) return { ligado, faltando };

  db.exec(`
    CREATE TABLE IF NOT EXISTS previas (
      id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, nome TEXT NOT NULL,
      por_email TEXT, por_nome TEXT, criada_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS previa_paginas (
      previa_id TEXT NOT NULL REFERENCES previas(id) ON DELETE CASCADE,
      numero INTEGER NOT NULL, util INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'esperando', erro TEXT, tentativas INTEGER NOT NULL DEFAULT 0,
      dados TEXT, filmes TEXT, sessoes TEXT, lida_em TEXT,
      PRIMARY KEY (previa_id, numero)
    );
  `);
  const q = {
    porHash: db.prepare('SELECT id FROM previas WHERE hash = ?'),
    criar: db.prepare('INSERT INTO previas (id, hash, nome, por_email, por_nome, criada_em) VALUES (?, ?, ?, ?, ?, ?)'),
    criarPagina: db.prepare('INSERT INTO previa_paginas (previa_id, numero, util) VALUES (?, ?, ?)'),
    lista: db.prepare(
      `SELECT p.id, p.nome, p.por_nome, p.criada_em, COUNT(g.numero) AS paginas
       FROM previas p LEFT JOIN previa_paginas g ON g.previa_id = p.id GROUP BY p.id ORDER BY p.criada_em DESC`,
    ),
    previa: db.prepare('SELECT id, nome, por_nome, criada_em FROM previas WHERE id = ?'),
    paginas: db.prepare('SELECT numero, util, estado, erro, dados, filmes, sessoes FROM previa_paginas WHERE previa_id = ? ORDER BY util'),
    pagina: db.prepare('SELECT p.nome, g.numero, g.util, g.estado, g.dados, (SELECT COUNT(*) FROM previa_paginas x WHERE x.previa_id = g.previa_id) AS total FROM previa_paginas g JOIN previas p ON p.id = g.previa_id WHERE g.previa_id = ? AND g.numero = ?'),
    receber: db.prepare("UPDATE previa_paginas SET dados = ?, estado = 'fila', erro = NULL, filmes = NULL WHERE previa_id = ? AND numero = ?"),
    proxima: db.prepare("SELECT g.previa_id, g.numero FROM previa_paginas g JOIN previas p ON p.id = g.previa_id WHERE g.estado = 'fila' ORDER BY p.criada_em, g.util LIMIT 1"),
    estado: db.prepare('UPDATE previa_paginas SET estado = ?, erro = ?, tentativas = tentativas + ? WHERE previa_id = ? AND numero = ?'),
    lida: db.prepare("UPDATE previa_paginas SET estado = 'lida', erro = NULL, filmes = ?, sessoes = ?, lida_em = ? WHERE previa_id = ? AND numero = ?"),
    filmesDaPagina: db.prepare("SELECT filmes FROM previa_paginas WHERE previa_id = ? AND numero = ? AND estado = 'lida'"),
    paginaLida: db.prepare("SELECT dados, filmes, sessoes FROM previa_paginas WHERE previa_id = ? AND numero = ? AND estado = 'lida'"),
    gravarFilmes: db.prepare('UPDATE previa_paginas SET filmes = ? WHERE previa_id = ? AND numero = ?'),
    retomar: db.prepare("UPDATE previa_paginas SET estado = 'fila' WHERE estado = 'lendo'"),
  };
  const intervalo = Math.max(0, Number(env.FILMES_INTERVALO_MS ?? 2500) || 0);
  const espera = Math.max(1000, Number(env.FILMES_TEMPO_MS ?? 240_000) || 240_000);
  const dir = (id) => join(pasta, id);
  const arquivo = (id, n, k = 0) => join(dir(id), k ? `p${n}_${k}.jpg` : `p${n}.jpg`);

  function criar({ nome, hash, paginas }, eu) {
    const ja = q.porHash.get(hash);
    if (ja) return { id: ja.id, existente: true };
    const id = randomUUID();
    q.criar.run(id, hash, nome, eu?.email ?? '', eu?.nome ?? '', new Date().toISOString());
    paginas.forEach((numero, i) => q.criarPagina.run(id, numero, i + 1));
    return { id, existente: false };
  }

  const listar = () => q.lista.all().map((l) => ({ id: l.id, nome: l.nome, por: l.por_nome, criada: l.criada_em, paginas: l.paginas }));

  if (!consultar && env.TEABLE_PG_URL) {
    let banco = null;
    consultar = async (sql, params = []) => {
      banco ??= await abrirPg(env.TEABLE_PG_URL);
      return (await banco.query(sql, params)).rows;
    };
  }
  const conferencia = criarConferencia(env, consultar);
  const envio = criarEnvioDeFilmes(env, { trello, consultar });

  /** Põe a conferência com o banco em cada filme (sem o banco configurado, os filmes ficam sem ela). */
  async function conferidos(filmes) {
    if (!conferencia || !filmes.length) return { filmes };
    try {
      const r = await conferencia.conferir(filmes);
      return { filmes: filmes.map((f, i) => ({ ...f, conferencia: r[i] })) };
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      console.warn(`[filmes] a conferência com o banco falhou: ${erro}`);
      return { filmes, erro };
    }
  }

  /** O filme que subiu sem sessão leva, na pergunta, as sessões para escolher (a da coluna dele primeiro). */
  const comPergunta = (f, pagina, i) =>
    f.conferencia?.pergunta === 'sessao' ? { ...f, conferencia: { ...f.conferencia, sessoes: sessoesParaPerguntar(pagina, i) } } : f;

  /** O filme enviado mostra o Trello, com o link do card que ele criou. */
  const comEnvio = (f) => (f.envio?.estado === 'enviado' && f.conferencia ? { ...f, conferencia: { ...f.conferencia, marca: 'trello', link: f.envio.link } } : f);

  async function abrir(id) {
    const p = q.previa.get(id);
    if (!p) return null;
    const paginas = q.paginas.all(id).map((g) => {
      const d = g.dados ? JSON.parse(g.dados) : null;
      return {
        numero: g.numero,
        util: g.util,
        estado: g.estado,
        erro: g.erro ?? '',
        filmes: g.filmes ? JSON.parse(g.filmes) : [],
        sessoes: g.sessoes ? JSON.parse(g.sessoes) : [],
        posteres: d?.posteres ?? [],
        vagas: d?.vagas ?? [],
        tamanho: d?.tamanho ?? null,
        fileiraDeCima: fileiraDeCima(d?.posteres ?? []),
        textos: d?.textos ?? [],
      };
    });
    // a conferência de todas as páginas de uma vez (uma consulta ao banco por prévia aberta)
    const r = await conferidos(paginas.flatMap((g) => g.filmes));
    let k = 0;
    for (const g of paginas) {
      const lidos = g.filmes;
      g.filmes = lidos.map((_, i) => comPergunta(comEnvio(r.filmes[k++]), { ...g, filmes: lidos }, i));
      delete g.textos;
    }
    return {
      id: p.id,
      nome: p.nome,
      por: p.por_nome,
      criada: p.criada_em,
      paginas,
      envio: { ligado: envio.ligado, faltando: envio.faltando },
      ...(r.erro ? { erroDaConferencia: r.erro } : {}),
    };
  }

  /**
   * Muda um filme lido e grava na hora: o título corrigido (e a conferência recomeça com ele), o candidato escolhido
   * ("rec…" ou "novo") ou o ano escolhido. @returns o filme conferido de novo
   */
  async function mudar(id, n, i, corpo) {
    const g = q.paginaLida.get(id, n);
    if (!g) return { erro: 'Página não encontrada.', status: 404 };
    const filmes = g.filmes ? JSON.parse(g.filmes) : [];
    const f = filmes[i];
    if (!f) return { erro: 'Filme não encontrado.', status: 404 };
    if (f.envio?.estado === 'enviando' || f.envio?.estado === 'enviado') return { erro: 'Este filme já foi para o Trello.', status: 409 };
    const dados = g.dados ? JSON.parse(g.dados) : {};
    const pagina = { posteres: dados.posteres ?? [], textos: dados.textos ?? [], sessoes: g.sessoes ? JSON.parse(g.sessoes) : [], filmes };
    if (corpo?.subir !== undefined) {
      if (corpo.subir !== true) return { erro: 'Nada para mudar.' };
      if (!ehSessaoDaTarde(f.sessao) || !fileiraDeCima(pagina.posteres).includes(f.poster))
        return { erro: 'Este filme não tem vaga na fileira de cima.', status: 409 };
      f.sessao = '';
      f.subiu = true;
    } else if (corpo?.sessao !== undefined) {
      if (!f.subiu) return { erro: 'A sessão só muda no filme que subiu da Sessão da Tarde.', status: 409 };
      const opcao = sessoesParaPerguntar(pagina, i).find((o) => typeof corpo.sessao === 'string' && compacto(o.sessao) === compacto(corpo.sessao));
      if (!opcao) return { erro: 'Sessão inválida.' };
      f.sessao = opcao.sessao;
      if (opcao.data) f.data = opcao.data;
    } else if (corpo?.titulo !== undefined) {
      const titulo = typeof corpo.titulo === 'string' ? corpo.titulo.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
      if (!titulo) return { erro: 'O título não pode ficar vazio.' };
      if (titulo !== f.titulo) {
        f.titulo = titulo;
        delete f.escolha;
      }
    } else if (corpo?.filme !== undefined) {
      if (typeof corpo.filme !== 'string' || !/^(novo|rec[A-Za-z0-9]{6,32})$/.test(corpo.filme)) return { erro: 'Escolha inválida.' };
      f.escolha = { filme: corpo.filme };
    } else if (corpo?.ano !== undefined) {
      if (!Number.isInteger(corpo.ano) || corpo.ano < 1900 || corpo.ano > 2100) return { erro: 'Ano inválido.' };
      f.escolha = { ...f.escolha, ano: corpo.ano };
    } else return { erro: 'Nada para mudar.' };
    q.gravarFilmes.run(JSON.stringify(filmes), id, n);
    const r = await conferidos([f]);
    return { filme: comPergunta(comEnvio(r.filmes[0]), pagina, i), ...(r.erro ? { erroDaConferencia: r.erro } : {}) };
  }

  /** A página que o navegador preparou: o PDF dela, a imagem, os pôsteres recortados (com as caixas) e as linhas de texto. */
  function receberPagina(id, n, corpo) {
    const g = q.pagina.get(id, n);
    if (!g) return { erro: 'Página não encontrada.', status: 404 };
    const pdf = b64(corpo?.pdf);
    const imagem = b64(corpo?.imagem);
    if (!pdf || !imagem) return { erro: 'Faltam o PDF ou a imagem da página.' };
    const posteres = (Array.isArray(corpo.posteres) ? corpo.posteres : []).slice(0, 40).map((p) => ({ dados: b64(p?.dados), caixa: umaCaixa(p?.caixa) }));
    if (posteres.some((p) => !p.dados)) return { erro: 'Pôster sem imagem.' };
    mkdirSync(dir(id), { recursive: true });
    writeFileSync(join(dir(id), `p${n}.pdf`), pdf);
    writeFileSync(arquivo(id, n), imagem);
    posteres.forEach((p, i) => writeFileSync(arquivo(id, n, i + 1), p.dados));
    const textos = (Array.isArray(corpo.textos) ? corpo.textos : []).slice(0, 400).map((l) => ({ str: String(l?.str ?? '').slice(0, 200), x: numero(l?.x), top: numero(l?.top), width: numero(l?.width), height: numero(l?.height) }));
    const vagas = (Array.isArray(corpo.vagas) ? corpo.vagas : []).slice(0, 20).map((v) => ({ caixa: umaCaixa(v?.caixa ?? v?.box), texto: String(v?.texto ?? v?.text ?? 'CANCELADO').slice(0, 40) }));
    const dados = { tamanho: { width: numero(corpo.tamanho?.width), height: numero(corpo.tamanho?.height) }, posteres: posteres.map((p) => ({ caixa: p.caixa })), textos, vagas };
    q.receber.run(JSON.stringify(dados), id, n);
    acordar();
    return { ok: true };
  }

  /* ---------- a fila de leitura: uma página por vez ---------- */
  let lendo = false;
  let parado = false;
  async function ler(id, n) {
    const g = q.pagina.get(id, n);
    const dados = JSON.parse(g.dados);
    const base = g.nome.replace(/\.pdf$/i, '');
    const form = new FormData();
    const jpg = (k) => new Blob([readFileSync(arquivo(id, n, k))], { type: 'image/jpeg' });
    form.append('page', new Blob([readFileSync(join(dir(id), `p${n}.pdf`))], { type: 'application/pdf' }), `${base}_pagina_${n}.pdf`);
    form.append('request_id', randomUUID());
    form.append('document_id', id);
    form.append('original_file_name', g.nome);
    form.append('original_page_number', String(n));
    form.append('useful_page_number', String(g.util));
    form.append('total_useful_pages', String(g.total));
    form.append('page_image', jpg(0), `${base}_pagina_${n}.jpg`);
    form.append('poster_count', String(dados.posteres.length));
    form.append('poster_boxes', JSON.stringify(dados.posteres.map((p) => p.caixa)));
    dados.posteres.forEach((_, i) => form.append(`poster_${i + 1}`, jpg(i + 1), `${base}_pagina_${n}_poster_${String(i + 1).padStart(2, '0')}.jpg`));
    const r = await buscar(enderecoDaLeitura, { method: 'POST', body: form, signal: AbortSignal.timeout(espera) });
    const texto = await r.text();
    if (!r.ok) throw new Error(`a leitura respondeu ${r.status}: ${texto.slice(0, 160)}`);
    const { filmes, sessoes } = respostaDaLeitura(texto);
    const ligados = ligarPosteres(filmes, dados.posteres, dados.textos);
    // na ordem dos pôsteres da página; os que ficaram sem pôster, no fim
    ligados.sort((a, b) => (a.poster ?? 1e9) - (b.poster ?? 1e9));
    q.lida.run(JSON.stringify(ligados), JSON.stringify(sessoes), new Date().toISOString(), id, n);
  }
  async function rodar() {
    if (lendo || parado) return;
    lendo = true;
    try {
      for (let prox = q.proxima.get(); prox && !parado; prox = q.proxima.get()) {
        q.estado.run('lendo', null, 1, prox.previa_id, prox.numero);
        try {
          await ler(prox.previa_id, prox.numero);
        } catch (e) {
          q.estado.run('erro', e instanceof Error ? e.message : String(e), 0, prox.previa_id, prox.numero);
        }
        if (intervalo) await new Promise((ok) => setTimeout(ok, intervalo));
      }
    } finally {
      lendo = false;
    }
  }
  const acordar = () => void rodar();
  // a leitura que ficou pela metade (o servidor reiniciou) volta para a fila
  q.retomar.run();
  // o envio que ficou pela metade não se sabe se criou o card: vira erro, para a pessoa conferir e mandar de novo
  for (const g of db.prepare(`SELECT previa_id, numero, filmes FROM previa_paginas WHERE filmes LIKE '%"enviando"%'`).all()) {
    const filmes = JSON.parse(g.filmes);
    for (const f of filmes)
      if (f.envio?.estado === 'enviando') f.envio = { ...f.envio, estado: 'erro', erro: 'o servidor reiniciou no meio do envio: confira no Trello antes de mandar de novo' };
    q.gravarFilmes.run(JSON.stringify(filmes), g.previa_id, g.numero);
  }
  setTimeout(acordar, 0);

  function reler(id, n) {
    const g = q.pagina.get(id, n);
    if (!g) return { erro: 'Página não encontrada.', status: 404 };
    if (!g.dados) return { erro: 'A página ainda não chegou.' };
    if (g.estado === 'lendo' || g.estado === 'fila') return { ok: true };
    q.estado.run('fila', null, 0, id, n);
    acordar();
    return { ok: true };
  }

  /* ---------- o envio: o card de cada filme pronto, e o registro no Teable ---------- */
  /** O resultado do envio de um filme, gravado na hora no filme da página. */
  function gravarEnvio(id, n, i, estado) {
    const g = q.filmesDaPagina.get(id, n);
    const filmes = g?.filmes ? JSON.parse(g.filmes) : [];
    if (!filmes[i]) return;
    filmes[i].envio = estado;
    q.gravarFilmes.run(JSON.stringify(filmes), id, n);
  }
  const mesmoFilme = (a, b) => a.titulo === b.titulo && JSON.stringify(a.escolha ?? null) === JSON.stringify(b.escolha ?? null);
  const indo = (f) => f.envio?.estado === 'enviando' || f.envio?.estado === 'enviado';

  /**
   * O Enviar: os filmes prontos (✓) e ainda não enviados, de todas as páginas, passam a "enviando" de uma vez (um
   * segundo Enviar no meio do caminho não pega os mesmos) e vão sem esperar a resposta: os de identidade própria um por
   * um, os da Sessão da Tarde semana por semana (um card por semana). O erro de um filme fica nele, com o motivo, e não
   * para os outros; ele pode ir de novo.
   * @returns { enviando: quantos foram }
   */
  async function enviar(id, eu) {
    if (!envio.ligado) return { erro: `O envio está desligado: falta ${envio.faltando.join(', ')}.`, status: 503 };
    const p = await abrir(id);
    if (!p) return { erro: 'Prévia não encontrada.', status: 404 };
    const prontos = p.paginas.flatMap((g) =>
      g.estado !== 'lida' ? [] : g.filmes.map((f, i) => ({ n: g.numero, i, f })).filter(({ f }) => f.conferencia?.marca === 'ok' && !indo(f)),
    );
    // daqui até marcar, nada espera: quem chegar depois já vê "enviando"
    const por = eu?.nome || eu?.email || '';
    const vao = [];
    for (const n of new Set(prontos.map((x) => x.n))) {
      const g = q.filmesDaPagina.get(id, n);
      const filmes = g?.filmes ? JSON.parse(g.filmes) : [];
      for (const x of prontos.filter((y) => y.n === n)) {
        const f = filmes[x.i];
        if (!f || indo(f) || !mesmoFilme(f, x.f)) continue;
        f.envio = { estado: 'enviando', por, em: new Date().toISOString() };
        vao.push(x);
      }
      q.gravarFilmes.run(JSON.stringify(filmes), id, n);
    }
    void enviarUmPorUm(id, vao, por);
    return { enviando: vao.length };
  }

  async function enviarUmPorUm(id, vao, por) {
    const lote = envio.novoLote(() => conferencia?.esquecer());
    const posterDe = ({ n, f }) => (f.poster !== null && f.poster !== undefined ? imagem(id, n, f.poster + 1) : null);
    const enviado = ({ n, i, f }, r) => {
      gravarEnvio(id, n, i, { estado: 'enviado', ...(r.card ? { card: r.card.id, link: r.card.url } : {}), filme: r.filme, por, em: new Date().toISOString(), ...(r.avisos.length ? { avisos: r.avisos } : {}) });
      if (r.avisos.length) console.warn(`[filmes] ${f.titulo}: ${r.avisos.join('; ')}`);
    };
    const falhou = ({ n, i, f }, e) => {
      const erro = e instanceof Error ? e.message : String(e);
      console.warn(`[filmes] não enviei ${f.titulo}: ${erro}`);
      gravarEnvio(id, n, i, { estado: 'erro', erro: erro.slice(0, 500), por, em: new Date().toISOString() });
    };
    for (const x of vao.filter(({ f }) => !ehSessaoDaTarde(f.sessao))) {
      try {
        enviado(x, await envio.enviarUm({ lido: x.f, conferencia: x.f.conferencia, poster: posterDe(x) }, lote));
      } catch (e) {
        falhou(x, e);
      }
    }
    // a Sessão da Tarde: um card por semana (o filme sem data vai sozinho, e volta com o motivo)
    const semanas = new Map();
    for (const x of vao.filter(({ f }) => ehSessaoDaTarde(f.sessao))) {
      const chave = segundaDaSemana(diaDaPrevia(x.f.data)) || `sem-data-${x.n}-${x.i}`;
      semanas.set(chave, [...(semanas.get(chave) ?? []), x]);
    }
    for (const doGrupo of semanas.values()) {
      try {
        const rs = await envio.enviarSemanaDaTarde(doGrupo.map((x) => ({ lido: x.f, conferencia: x.f.conferencia, poster: posterDe(x) })), lote);
        doGrupo.forEach((x, k) => (rs[k].erro ? falhou(x, rs[k].erro) : enviado(x, rs[k])));
      } catch (e) {
        for (const x of doGrupo) falhou(x, e);
      }
    }
  }

  function imagem(id, n, k = 0) {
    try {
      return readFileSync(arquivo(id, n, k));
    } catch {
      return null;
    }
  }

  return { ligado, faltando, conferindo: !!conferencia, envio: { ligado: envio.ligado, faltando: envio.faltando }, criar, listar, abrir, mudar, receberPagina, reler, enviar, imagem, parar: () => void (parado = true) };
}
