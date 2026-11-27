/* Pauta da edição: quem está com cada claquete.
   Com TEABLE_PG_URL, pergunta direto ao Postgres do Teable (só leitura): uma consulta por chave, sem depender
   de visão nem de paginação. Se o banco não responder, vale a pauta lida pela API (vocabulario.mjs). */

import { tabelaNoPg } from './tabelas-do-teable.mjs';
import { MARCA_TODAS, pracasDaConfiguracao, semPracaNoFim } from '../src/modelo/pracas.ts';
import { colunasDoDia, diasDaSemana, linhaDaPauta, ordemDosEditores, periodoDosDias } from '../src/modelo/pauta.ts';

const NOME = /^[A-Za-z0-9_]+$/;
const DIAS = 45; // a mesma chave volta a existir no ano seguinte ("QUEM AMA 20 11"); só vale a pauta recente

export async function abrirPg(url) {
  const { default: pg } = await import('pg');
  return new pg.Pool({ connectionString: url, max: 2, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
}

/** Tolera aspas, espaços e "esquema.tabela" numa variável só, como aparece no Postgres. */
export const nomeLimpoPg = (v) => String(v || '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/"/g, '');
/** O esquema (TEABLE_PG_ESQUEMA) e uma tabela, já limpos; "esquema.tabela" na tabela vale pelos dois. */
export function nomesDoPg(env, tabelaBruta) {
  let esquema = nomeLimpoPg(env.TEABLE_PG_ESQUEMA);
  let tabela = nomeLimpoPg(tabelaBruta);
  if (tabela.includes('.')) [esquema, tabela] = [tabela.split('.')[0] || esquema, tabela.split('.').pop()];
  return { esquema, tabela };
}

/** A pauta não pôde ser lida (sem o Postgres, ou ele não respondeu): a rota responde 503 com a mensagem. */
export class ForaDaPauta extends Error {
  status = 503;
}

export function criarPauta(env, vocabulario, abrir = abrirPg, cache = null, copia = null) {
  const { esquema, tabela } = nomesDoPg(env, tabelaNoPg(env, 'EDICAO_producao'));
  const comBanco = !!(env.TEABLE_PG_URL && NOME.test(esquema) && NOME.test(tabela));
  // a chave sem a praça do fim ("QUEM AMA 20 11 SP" → "QUEM AMA 20 11") ainda acha o editor
  const pracas = pracasDaConfiguracao(env);
  const semPraca = (chave) => semPracaNoFim(chave, pracas, [MARCA_TODAS]);
  let banco = null;

  // to_jsonb: se a coluna "claquete" mudar de nome numa atualização do Teable, o editor continua vindo
  const sql = `SELECT t."editor"->>'title' AS editor, to_jsonb(t)->>'claquete' AS claquete
    FROM "${esquema}"."${tabela}" t
    WHERE UPPER(t."key") = UPPER($1) AND t."data"::date >= CURRENT_DATE - ${DIAS}
    ORDER BY t."data" DESC NULLS LAST LIMIT 1`;

  async function noBanco(chave) {
    banco ??= await abrir(env.TEABLE_PG_URL);
    const r = await banco.query(sql, [chave]);
    return r.rows[0] ?? null;
  }
  async function naApi(chave) {
    const linha = (await vocabulario.ler()).pauta.find((p) => p.chave === chave);
    return linha ? { editor: linha.editor, claquete: linha.claquete ?? '' } : null;
  }
  // cópia da pauta recente do Postgres, renovada a cada 10 minutos, para quando o banco do Teable cair
  async function copiarPauta() {
    banco ??= await abrir(env.TEABLE_PG_URL);
    const r = await banco.query(`SELECT UPPER(t."key") AS chave, t."editor"->>'title' AS editor, to_jsonb(t)->>'claquete' AS claquete
      FROM "${esquema}"."${tabela}" t WHERE t."data"::date >= CURRENT_DATE - ${DIAS} ORDER BY t."data" ASC NULLS FIRST`);
    const porChave = new Map();
    for (const l of r.rows) if (l.chave && l.editor) porChave.set(l.chave, { editor: l.editor, claquete: l.claquete ?? '' });
    copia.guardar('pauta-pg', [...porChave].map(([chave, v]) => ({ chave, ...v })));
    return porChave.size;
  }
  let relogio = null;
  let primeira = null;
  if (comBanco && copia) {
    const renovar = () => copiarPauta().catch((e) => console.error('[pauta] não consegui copiar a pauta do Postgres:', e.message));
    primeira = setTimeout(renovar, 3000);
    primeira.unref?.();
    relogio = setInterval(renovar, 10 * 60 * 1000);
    relogio.unref?.();
  }
  function naCopia(chave) {
    const linha = copia?.ler('pauta-pg')?.dados?.find((p) => p.chave === chave.toUpperCase());
    return linha ? { editor: linha.editor, claquete: linha.claquete } : null;
  }

  async function procurar(chave) {
    if (comBanco) {
      try {
        return await noBanco(chave);
      } catch (e) {
        console.error('[pauta] o Postgres não respondeu, usando a cópia local e a API:', e.message);
        const guardada = naCopia(chave);
        if (guardada) return guardada;
      }
    }
    return naApi(chave);
  }

  /* A Semana (#94) e o Dia (#97): as linhas da pauta do período, direto do Postgres (só leitura), com o editor do link,
     o expediente e a caixinha de anotação. O Postgres de mentira dos testes não olha o WHERE: o filtro vale de novo
     aqui, pelo dia da pauta. */
  const sqlDoPeriodo = `SELECT t."__id" AS id, to_jsonb(t)->>'claquete' AS claquete, t."editor", t."data", t."expediente_inicio",
      t."expediente_fim", t."anotacao", t."alterado_em"
    FROM "${esquema}"."${tabela}" t
    WHERE t."data" >= $1::timestamptz AND t."data" < $2::timestamptz
    ORDER BY t."data", t."expediente_inicio" NULLS LAST, t."__auto_number"`;
  /** As linhas da pauta de alguns dias seguidos, já lidas (#94, #97), e a hora da última alteração entre elas. */
  async function lerDias(dias) {
    if (!comBanco) throw new ForaDaPauta('A pauta da edição é lida do Postgres do Teable, que não está ligado (TEABLE_PG_URL e a tabela EDICAO_producao na base).');
    let rows;
    try {
      banco ??= await abrir(env.TEABLE_PG_URL);
      ({ rows } = await banco.query(sqlDoPeriodo, periodoDosDias(dias[0], dias.length)));
    } catch (e) {
      console.error('[pauta] o Postgres não respondeu à pauta:', e.message);
      throw new ForaDaPauta('O Postgres do Teable não respondeu. Tente de novo em instantes.');
    }
    const noPeriodo = new Set(dias);
    const linhas = [];
    let alteradoEm = null;
    for (const bruta of rows) {
      const l = linhaDaPauta({ ...bruta, id: bruta.id ?? bruta.__id });
      if (!l || !noPeriodo.has(l.dia)) continue;
      linhas.push(l);
      const alterada = bruta.alterado_em ? new Date(bruta.alterado_em) : null;
      if (alterada && !Number.isNaN(alterada.getTime()) && (!alteradoEm || alterada > alteradoEm)) alteradoEm = alterada;
    }
    // na ordem dos dias; dentro do dia, a da pauta (a ordenação é estável)
    linhas.sort((a, b) => a.dia.localeCompare(b.dia));
    return { linhas, alteradoEm: alteradoEm?.toISOString() ?? null };
  }
  async function semana(segunda) {
    const dias = diasDaSemana(segunda);
    const { linhas, alteradoEm } = await lerDias(dias);
    return { inicio: segunda, dias, editores: ordemDosEditores(linhas), linhas, alteradoEm };
  }
  /* O Dia (#97): as linhas de um dia só, com os editores na ordem de início do turno daquele dia. */
  async function dia(qual) {
    const { linhas, alteradoEm } = await lerDias([qual]);
    return { dia: qual, editores: colunasDoDia(linhas).map((c) => c.editor), linhas, alteradoEm };
  }

  return {
    comBanco,
    semana,
    dia,
    parar: () => {
      clearTimeout(primeira);
      clearInterval(relogio);
      const b = banco;
      banco = null;
      return b?.end?.().catch(() => {});
    },
    /** Quem está com a claquete. A grafia só vem quando a chave bate inteira. */
    async achar(chave) {
      chave = String(chave || '').trim().slice(0, 200);
      if (!chave) return { editor: '', claquete: '' };
      // a pauta muda ao longo do dia: o que achou vale 5 minutos; o que não achou, 1 minuto
      const guardado = await cache?.ler(`pauta:${chave}`);
      if (guardado) return guardado;
      const achado = await this.consultar(chave);
      await cache?.guardar(`pauta:${chave}`, achado, achado.editor ? 300 : 60);
      return achado;
    },
    async consultar(chave) {
      const exata = await procurar(chave);
      if (exata?.editor) return { editor: exata.editor, claquete: exata.claquete ?? '' };
      const curta = semPraca(chave);
      const outra = curta !== chave ? await procurar(curta) : null;
      return { editor: outra?.editor ?? '', claquete: '' };
    },
    /** Para o log da partida. */
    async testar() {
      if (!comBanco) {
        if (!env.TEABLE_PG_URL) return null;
        const falta = [
          !NOME.test(esquema) && `TEABLE_PG_ESQUEMA ${esquema ? `inválido ("${esquema}")` : 'vazio'}`,
          !NOME.test(tabela) && 'a tabela EDICAO_producao não foi achada na base do Teable',
        ].filter(Boolean);
        return `Postgres desligado: ${falta.join(' e ')}. Use só letras, números e _ (ex.: bseXXXX e demandasXXXX).`;
      }
      try {
        banco ??= await abrir(env.TEABLE_PG_URL);
        const r = await banco.query(`SELECT count(*)::int AS n FROM "${esquema}"."${tabela}" t WHERE t."data"::date >= CURRENT_DATE - ${DIAS}`);
        return `Postgres do Teable ligado: ${r.rows[0].n} linhas de pauta nos últimos ${DIAS} dias`;
      } catch (e) {
        return `não consegui consultar o Postgres do Teable: ${e.message}`;
      }
    },
  };
}
