/* Um Teable de mentira para a descoberta das tabelas (#76): as bases, as tabelas da base (com o nome no Postgres) e os
   campos de cada uma (por padrão, todas as colunas que o PROMeiro usa, do mapa src/modelo/tabelasDoTeable.ts). Os ids
   e nomes são inventados. Serve aos testes do Vitest e aos e2e (import dinâmico). Com `opcoes.registros`, as tabelas
   dadas também têm linhas, que se leem, criam e mudam pela API (a tabela designers da seção Pessoas, #77), e que o
   Postgres de mentira (`.consultar`, ou `.abrirPg` para o criarApp) devolve inteiras (a carga das Produções, #86). */
import { TABELAS_DO_TEABLE } from '../../src/modelo/tabelasDoTeable.ts';

/** O endereço e o token do Teable falso (vão no env do teste). */
export const TEABLE_FALSO = { TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'token-falso' };

const resposta = (status, dados) => ({ ok: status < 400, status, json: async () => dados, text: async () => JSON.stringify(dados) });

/**
 * @param nomes { [tabela do PROMeiro]: nome no Postgres } (as tabelas que existem na base)
 * @param opcoes.base o id da base (o esquema); opcoes.nomeDaBase; opcoes.bases as outras bases ({ [id]: { nome, nomes } });
 *   opcoes.faltando { [tabela]: [colunas que não existem] }; opcoes.ids { [tabela]: id na API } (padrão tblFalso_<tabela>);
 *   opcoes.url o endereço (padrão o de TEABLE_FALSO); opcoes.outro o fetch para o que não é do Teable;
 *   opcoes.registros { [tabela]: [{ id, fields }] } as linhas (o array é o mesmo: o teste vê o que foi gravado)
 * @returns fetch, com `.estado` (`fora = true` derruba o Teable; `pedidos` guarda o que foi pedido), `.consultar` e
 *   `.abrirPg` (o Postgres do Teable: o SELECT de uma tabela da base devolve as linhas dela, com o "__id", sem olhar o
 *   WHERE; `estado.consultas` guarda o SQL e `estado.parametros`, os parâmetros de cada uma)
 */
export function teableFalso(nomes, opcoes = {}) {
  const bases = { [opcoes.base ?? 'bseFalso']: { nome: opcoes.nomeDaBase ?? 'Base falsa', nomes, faltando: opcoes.faltando ?? {}, ids: opcoes.ids ?? {} }, ...(opcoes.bases ?? {}) };
  const estado = { fora: false, pedidos: [], consultas: [], parametros: [] };
  const idDe = (b, nome) => bases[b].ids?.[nome] ?? `tblFalso_${b}_${nome}`;
  const buscar = async (endereco, init = {}) => {
    const url = new URL(endereco);
    if (url.origin !== new URL(opcoes.url ?? TEABLE_FALSO.TEABLE_URL).origin) {
      if (opcoes.outro) return opcoes.outro(endereco, init);
      throw new Error(`pedido inesperado: ${url.href}`);
    }
    const metodo = init.method ?? 'GET';
    estado.pedidos.push(`${metodo} ${url.pathname}`);
    if (estado.fora) throw new Error('fetch failed (Teable fora do ar)');
    const deRegistros = /^\/api\/table\/([^/]+)\/record(?:\/([^/]+))?$/.exec(url.pathname);
    if (deRegistros) {
      const id = decodeURIComponent(deRegistros[1]);
      const nome = Object.entries(bases).flatMap(([b, base]) => Object.keys(base.nomes).filter((n) => idDe(b, n) === id))[0];
      const linhas = nome && opcoes.registros?.[nome];
      if (!linhas) return resposta(404, { message: 'tabela sem registros no Teable falso' });
      if (metodo === 'GET' && !deRegistros[2]) {
        const pular = Number(url.searchParams.get('skip') ?? 0);
        const tomar = Number(url.searchParams.get('take') ?? 100);
        return resposta(200, { records: linhas.slice(pular, pular + tomar) });
      }
      const corpo = JSON.parse(String(init.body ?? '{}'));
      if (metodo === 'POST' && !deRegistros[2]) {
        const novos = (corpo.records ?? []).map((r) => ({ id: `recFalso${linhas.length + 1}`, fields: { ...r.fields } }));
        linhas.push(...novos);
        return resposta(200, { records: novos });
      }
      if (metodo === 'PATCH' && deRegistros[2]) {
        const linha = linhas.find((l) => l.id === decodeURIComponent(deRegistros[2]));
        if (!linha) return resposta(404, { message: 'registro não encontrado' });
        Object.assign(linha.fields, corpo.record?.fields ?? {});
        return resposta(200, linha);
      }
    }
    if (metodo !== 'GET') throw new Error(`a descoberta só lê: ${metodo} ${url.pathname}`);
    if (url.pathname === '/api/base/access/all') return resposta(200, Object.entries(bases).map(([id, b]) => ({ id, name: b.nome })));
    let m = /^\/api\/base\/([^/]+)\/table$/.exec(url.pathname);
    if (m) {
      const b = bases[decodeURIComponent(m[1])];
      if (!b) return resposta(404, { message: 'not found' });
      return resposta(200, Object.entries(b.nomes).map(([nome, pg]) => ({ id: idDe(m[1], nome), name: nome, dbTableName: `${m[1]}.${pg}` })));
    }
    m = /^\/api\/base\/([^/]+)$/.exec(url.pathname);
    if (m) return bases[m[1]] ? resposta(200, { id: m[1], name: bases[m[1]].nome }) : resposta(404, {});
    m = /^\/api\/table\/([^/]+)\/field$/.exec(url.pathname);
    if (m) {
      const id = decodeURIComponent(m[1]);
      for (const [b, base] of Object.entries(bases))
        for (const nome of Object.keys(base.nomes)) {
          if (idDe(b, nome) !== id) continue;
          const t = TABELAS_DO_TEABLE.find((x) => x.nome === nome);
          const faltam = base.faltando?.[nome] ?? [];
          const colunas = [...new Set([...(t?.api ?? []), ...(t?.pg ?? [])])].filter((c) => !faltam.includes(c));
          return resposta(200, colunas.map((c, i) => ({ id: `fld${i}`, name: c, dbFieldName: c, type: c === 'poster' ? 'attachment' : 'singleLineText' })));
        }
      return resposta(404, {});
    }
    if (opcoes.outro) return opcoes.outro(endereco, init);
    return resposta(404, { message: `rota falsa sem resposta: ${url.pathname}` });
  };
  buscar.estado = estado;
  buscar.consultar = async (sql, params = []) => {
    estado.consultas.push(sql);
    estado.parametros.push(params);
    if (estado.fora) throw new Error('connect ECONNREFUSED (Teable fora do ar)');
    const m = /FROM\s+"([^"]+)"\."([^"]+)"/i.exec(sql);
    const base = m && bases[m[1]];
    const nome = base && Object.keys(base.nomes).find((n) => base.nomes[n] === m[2]);
    return (opcoes.registros?.[nome] ?? []).map((r) => ({ __id: r.id, ...r.fields }));
  };
  buscar.abrirPg = async () => ({ query: async (sql, params) => ({ rows: await buscar.consultar(sql, params) }), end: async () => {} });
  return buscar;
}
