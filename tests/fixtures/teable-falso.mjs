/* Um Teable de mentira para a descoberta das tabelas (#76): as bases, as tabelas da base (com o nome no Postgres) e os
   campos de cada uma (por padrão, todas as colunas que o PROMeiro usa, do mapa src/modelo/tabelasDoTeable.ts). Os ids
   e nomes são inventados. Serve aos testes do Vitest e aos e2e (import dinâmico). */
import { TABELAS_DO_TEABLE } from '../../src/modelo/tabelasDoTeable.ts';

/** O endereço e o token do Teable falso (vão no env do teste). */
export const TEABLE_FALSO = { TEABLE_URL: 'http://teable-falso', TEABLE_TOKEN: 'token-falso' };

const resposta = (status, dados) => ({ ok: status < 400, status, json: async () => dados, text: async () => JSON.stringify(dados) });

/**
 * @param nomes { [tabela do PROMeiro]: nome no Postgres } (as tabelas que existem na base)
 * @param opcoes.base o id da base (o esquema); opcoes.nomeDaBase; opcoes.bases as outras bases ({ [id]: { nome, nomes } });
 *   opcoes.faltando { [tabela]: [colunas que não existem] }; opcoes.ids { [tabela]: id na API } (padrão tblFalso_<tabela>);
 *   opcoes.url o endereço (padrão o de TEABLE_FALSO); opcoes.outro o fetch para o que não é do Teable
 * @returns fetch, com `.estado` (`fora = true` derruba o Teable; `pedidos` guarda o que foi pedido)
 */
export function teableFalso(nomes, opcoes = {}) {
  const bases = { [opcoes.base ?? 'bseFalso']: { nome: opcoes.nomeDaBase ?? 'Base falsa', nomes, faltando: opcoes.faltando ?? {}, ids: opcoes.ids ?? {} }, ...(opcoes.bases ?? {}) };
  const estado = { fora: false, pedidos: [] };
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
  return buscar;
}
