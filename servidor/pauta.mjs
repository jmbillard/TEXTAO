/* Pauta da edição: quem está com cada claquete.
   Com TEABLE_PG_URL, pergunta direto ao Postgres do Teable (só leitura): uma consulta por chave, sem depender
   de visão nem de paginação. Se o banco não responder, vale a pauta lida pela API (vocabulario.mjs). */

const NOME = /^[A-Za-z0-9_]+$/;
const DIAS = 45; // a mesma chave volta a existir no ano seguinte ("QUEM AMA 20 11"); só vale a pauta recente
const semPraca = (chave) => chave.replace(/ (?:REDE|G5|SP|PRACAS)$/, '');

async function abrirPg(url) {
  const { default: pg } = await import('pg');
  return new pg.Pool({ connectionString: url, max: 2, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
}

export function criarPauta(env, vocabulario, abrir = abrirPg, cache = null, copia = null) {
  // tolera aspas, espaços e "esquema.tabela" numa variável só, como aparece no Postgres
  const limpo = (v) => String(v || '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/"/g, '');
  let esquema = limpo(env.TEABLE_PG_ESQUEMA);
  let tabela = limpo(env.TEABLE_PG_PAUTA);
  if (tabela.includes('.')) [esquema, tabela] = [tabela.split('.')[0] || esquema, tabela.split('.').pop()];
  const comBanco = !!(env.TEABLE_PG_URL && NOME.test(esquema) && NOME.test(tabela));
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
  if (comBanco && copia) {
    const renovar = () => copiarPauta().catch((e) => console.error('[pauta] não consegui copiar a pauta do Postgres:', e.message));
    setTimeout(renovar, 3000).unref?.();
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

  return {
    comBanco,
    parar: () => clearInterval(relogio),
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
          !NOME.test(tabela) && `TEABLE_PG_PAUTA ${tabela ? `inválido ("${tabela}")` : 'vazio'}`,
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
