/* A descoberta das tabelas do Teable (#76). Na base escolhida (TEABLE_PG_ESQUEMA: o id da base, que é também o esquema
   do Postgres), o PROMeiro acha cada tabela pelo nome (src/modelo/tabelasDoTeable.ts) e pega dela, no próprio Teable,
   o id da API e o nome no Postgres (o dbTableName). Os módulos do servidor leem o nome no Postgres por `tabelaNoPg`,
   nunca de uma variável de ambiente. A descoberta acontece por geração da configuração (na partida, ao abrir a
   Configuração, ao trocar a base) e fica guardada no SQLite: com o Teable fora do ar, vale a última. */
import { CAMPO_DO_POSTER, TABELAS_DO_TEABLE, avisosDasTabelas, ligarAsTabelas } from '../src/modelo/tabelasDoTeable.ts';
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';

const NOME_SQL = /^[A-Za-z0-9_]+$/;
const GUARDADA = 'tabelas-do-teable';
const limpo = (v) => String(v ?? '').trim().replace(/^["'`]+|["'`]+$/g, '');

/** O nome no Postgres (sem o esquema) de uma tabela do PROMeiro, como a descoberta achou; '' quando não achou. */
export const tabelaNoPg = (env, nome) => {
  const pg = env?.tabelas?.[nome]?.pg ?? '';
  return typeof pg === 'string' && NOME_SQL.test(pg) ? pg : '';
};

/**
 * O env que os módulos recebem: a configuração com as tabelas descobertas. O id de cada tabela na API é o que a
 * descoberta ligou (a variável, quando está na base; senão o nome); sem descoberta, vale a variável. O campo do pôster
 * dos filmes (TEABLE_FILMES_POSTER) também vem da descoberta (a variável, se é um campo da tabela; senão pelo nome).
 * @param descoberta o resultado de `descobrir` (ou o guardado), ou null
 */
export function envDosModulos(valores, descoberta) {
  const tabelas = {};
  const env = { ...valores };
  for (const t of descoberta?.tabelas ?? []) if (t.id || t.pg) tabelas[t.nome] = Object.freeze({ id: t.id, pg: t.pg });
  for (const t of TABELAS_DO_TEABLE) if (t.variavel && tabelas[t.nome]?.id) env[t.variavel] = tabelas[t.nome].id;
  if (descoberta?.poster) env.TEABLE_FILMES_POSTER = descoberta.poster;
  env.tabelas = Object.freeze(tabelas);
  return Object.freeze(env);
}

/** Para os testes e para quem monta um módulo à mão: { ARTE_producao: 'producao' } → o pedaço do env com as tabelas. */
export const comTabelas = (nomes) => ({ tabelas: Object.fromEntries(Object.entries(nomes).map(([nome, pg]) => [nome, { id: '', pg }])) });

/**
 * @param copia { ler(chave), guardar(chave, dados) }: a cópia local do Teable no SQLite
 * @param buscar fetch (o Teable de verdade ou um falso)
 */
export function criarDescoberta({ copia, buscar = fetch }) {
  const doTeable = (valores) => ({ url: limpo(valores.TEABLE_URL).replace(/\/+$/, ''), token: limpo(valores.TEABLE_TOKEN || valores.TEABLE_TOKEN_ESCRITA), base: limpo(valores.TEABLE_PG_ESQUEMA) });
  async function pedir(valores, caminho) {
    const { url, token } = doTeable(valores);
    const r = await buscar(`${url}/api${caminho}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`o Teable respondeu ${r.status} em ${caminho.replace(/\/(bse|tbl)\w+/g, '/…')}`);
    return r.json();
  }
  /** A última descoberta guardada, se é desta base. */
  function guardada(valores) {
    const g = copia?.ler(GUARDADA)?.dados ?? null;
    return g && g.base === doTeable(valores).base ? g : null;
  }

  return {
    guardada,
    /** O Teable está configurado (endereço e token no Portainer)? */
    configurado: (valores) => !!(doTeable(valores).url && doTeable(valores).token),

    /** As bases que o token enxerga, pelo nome: [{ id, nome }]. */
    async bases(valores) {
      const lidas = await pedir(valores, '/base/access/all');
      return (Array.isArray(lidas) ? lidas : []).map((b) => ({ id: String(b.id ?? ''), nome: String(b.name ?? '') })).filter((b) => b.id);
    },

    /**
     * Acha as tabelas na base, lê os campos de cada uma e confere as colunas. Guarda o resultado (sem os campos).
     * Com o Teable fora do ar, devolve a última guardada desta base, com `foraDoAr`.
     * @returns { base, nomeDaBase, tabelas: TabelaLigada[], avisos, poster, posterPeloNome (o que o nome acha, sem a variável), em, foraDoAr? } ou null sem o Teable/a base
     */
    async descobrir(valores) {
      const { url, token, base } = doTeable(valores);
      if (!url || !token || !base) return null;
      const antes = guardada(valores);
      try {
        const lidas = await pedir(valores, `/base/${encodeURIComponent(base)}/table`);
        const tabelasLidas = (Array.isArray(lidas) ? lidas : []).map((t) => ({ id: String(t.id ?? ''), nome: String(t.name ?? ''), dbTableName: String(t.dbTableName ?? '') })).filter((t) => t.id);
        const configurados = Object.fromEntries(TABELAS_DO_TEABLE.filter((t) => t.variavel && limpo(valores[t.variavel])).map((t) => [t.nome, limpo(valores[t.variavel])]));
        const lembrados = Object.fromEntries((antes?.tabelas ?? []).filter((t) => t.id).map((t) => [t.nome, t.id]));
        const tabelas = ligarAsTabelas(tabelasLidas, { configurados, lembrados });
        const campos = {};
        await Promise.all(
          tabelas
            .filter((t) => t.id)
            .map(async (t) => {
              try {
                const lista = await pedir(valores, `/table/${encodeURIComponent(t.id)}/field`);
                campos[t.nome] = (Array.isArray(lista) ? lista : []).map((c) => ({ id: String(c.id ?? ''), name: String(c.name ?? ''), dbFieldName: String(c.dbFieldName ?? ''), type: String(c.type ?? '') }));
              } catch (e) {
                console.warn(`[tabelas] não li os campos de ${t.nome}: ${e instanceof Error ? e.message : e}`);
              }
            }),
        );
        // o campo do pôster: o da variável, se é um campo da tabela filmes; senão o de anexo chamado "poster"
        const doPoster = (campos.filmes ?? []).filter((c) => c.type === 'attachment');
        const posterPeloNome = doPoster.find((c) => nomeComparavel(c.name) === nomeComparavel(CAMPO_DO_POSTER))?.id ?? '';
        const poster = doPoster.find((c) => c.id === limpo(valores.TEABLE_FILMES_POSTER))?.id ?? posterPeloNome;
        let nomeDaBase = antes?.nomeDaBase ?? '';
        try {
          nomeDaBase = (await pedir(valores, `/base/${encodeURIComponent(base)}`))?.name ?? nomeDaBase;
        } catch {
          // o nome da base é só para a tela
        }
        const feita = { base, nomeDaBase: String(nomeDaBase), tabelas, avisos: avisosDasTabelas(tabelas, campos), poster, posterPeloNome, em: new Date().toISOString() };
        for (const t of tabelas) if (t.variavelFora) console.warn(`[tabelas] ${TABELAS_DO_TEABLE.find((x) => x.nome === t.nome).variavel} aponta para uma tabela que não está na base: ${t.id ? 'achei pelo nome' : 'não achei'} a ${t.nome}.`);
        copia?.guardar(GUARDADA, feita);
        return feita;
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        console.warn(`[tabelas] não consegui ler as tabelas do Teable: ${motivo}${antes ? ` (vale a última leitura, de ${antes.em})` : ''}`);
        return antes ? { ...antes, foraDoAr: motivo } : { base, nomeDaBase: '', tabelas: [], avisos: [], poster: '', em: '', foraDoAr: motivo };
      }
    },
  };
}

/** A mesma descoberta (os mesmos ids e nomes no Postgres)? Então a geração dos módulos não precisa ser refeita. */
export const mesmasTabelas = (a, b) =>
  JSON.stringify((a?.tabelas ?? []).map((t) => [t.nome, t.id, t.pg]).concat([[a?.poster ?? '']])) === JSON.stringify((b?.tabelas ?? []).map((t) => [t.nome, t.id, t.pg]).concat([[b?.poster ?? '']]));
