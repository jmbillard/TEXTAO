// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { chaveDeArte, criarAcervo } from '../servidor/acervo.mjs';

const ENV = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'tok',
  TEABLE_ACERVO: 'tblAcervo',
  TEABLE_PG_URL: 'postgres://x',
  TEABLE_PG_ESQUEMA: 'bseBase',
  TEABLE_PG_ACERVO: 'acervo',
  TEABLE_PG_ATRACOES: 'atracoes',
  TEABLE_PG_ARTE: 'producao',
  TEABLE_PG_FILMES_ESQUEMA: 'bseFilmes',
  TEABLE_PG_SESSOES: 'sessoes',
};

/** O Postgres do Teable (acervo, atrações, produção) e a API, de mentira. */
function falsos() {
  const linhas = [
    { id: 'recH', arte: 'HOJE', key: 'HOJE', tipo: '["Lettering com alpha"]', atracao: '[{"id":"recEnc","title":"Encontro"}]', claquete: '[{"id":"recP1","title":"ENCONTRO 02/01 REDE"}]' },
    { id: 'recA', arte: 'Amanhã!', key: null, tipo: null, atracao: [{ id: 'recEnc', title: 'Encontro' }], claquete: [] },
    { id: 'recS', arte: 'SÁBADO', key: 'SABADO', tipo: 'Rodapé', atracao: [{ id: 'recShow', title: 'Show da Noite' }], claquete: [] },
  ];
  const consultas: { sql: string; params: unknown[] }[] = [];
  const consultar = async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    if (sql.includes('"acervo"')) return linhas;
    if (sql.includes('"atracoes"')) return params[0] === 'Encontro' ? [{ id: 'recEnc' }] : [];
    if (sql.includes('"producao"')) return [{ id: 'recCard9' }];
    if (sql.includes('"sessoes"')) return [{ sessao: 'Sessão da Tarde' }, { sessao: 'Temperatura Máxima' }];
    return [];
  };
  const pedidos: { metodo: string; url: string; corpo: null | { records: { id?: string; fields: Record<string, unknown> }[] } }[] = [];
  const buscar = async (url: string, init: RequestInit = {}) => {
    pedidos.push({ metodo: init.method ?? 'GET', url, corpo: init.body ? JSON.parse(String(init.body)) : null });
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };
  return { consultar, consultas, buscar, pedidos };
}

describe('acervo de artes', () => {
  it('chave: sem acento, caixa e pontuação', () => {
    expect(chaveDeArte(' Amanhã! ')).toBe('AMANHA');
    expect(chaveDeArte('sábado/domingo')).toBe('SABADO DOMINGO');
  });

  it('lê as artes da atração, com o tipo e a claquete em que foram pedidas', async () => {
    const { consultar, consultas } = falsos();
    const a = criarAcervo(ENV, { consultar });
    expect(a.ligado).toBe(true);
    expect(await a.daAtracao('ENCONTRO')).toEqual([
      { arte: 'HOJE', chave: 'HOJE', tipo: 'Lettering com alpha', claquete: 'ENCONTRO 02/01 REDE' },
      { arte: 'Amanhã!', chave: 'AMANHA', tipo: '', claquete: '' },
    ]);
    expect(consultas.find((c) => c.sql.includes('"acervo"'))!.sql).toMatch(/"key".*"claquete"/);
    await a.daAtracao('Show da Noite');
    expect(consultas.filter((c) => c.sql.includes('"acervo"'))).toHaveLength(1); // guardado por 1 min
  });

  it('registra só as artes novas, ligadas à atração e ao card; key (fórmula) e tipo ficam com o Teable', async () => {
    const { consultar, buscar, pedidos } = falsos();
    const a = criarAcervo(ENV, { consultar, buscar });
    expect(await a.registrar({ atracao: 'Encontro', card: 'card9', artes: ['Hoje', 'DOMINGO', 'domingo', 'Sexta'] })).toBe(2);
    expect(pedidos[0].metodo).toBe('POST');
    expect(pedidos[0].url).toBe('http://teable:3000/api/table/tblAcervo/record');
    expect(pedidos[0].corpo!.records.map((r) => r.fields)).toEqual([
      { arte: 'DOMINGO', atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] },
      { arte: 'Sexta', atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] },
    ]);
    await expect(a.registrar({ atracao: 'Sem Cadastro', card: 'c', artes: ['X'] })).rejects.toThrow('não está nos cadastros');
  });

  it('pacote gráfico novo: apaga todas as artes da atração', async () => {
    const { consultar, buscar, pedidos } = falsos();
    const a = criarAcervo(ENV, { consultar, buscar });
    expect(await a.zerar('Encontro')).toBe(2);
    expect(pedidos[0].metodo).toBe('DELETE');
    expect(pedidos[0].url).toBe('http://teable:3000/api/table/tblAcervo/record?recordIds[0]=recH&recordIds[1]=recA');
  });

  it('sessão de filme fica de fora: cada filme tem o seu pacote gráfico', async () => {
    const { consultar, buscar, pedidos } = falsos();
    const a = criarAcervo(ENV, { consultar, buscar });
    expect(await a.ehSessao('SESSAO DA TARDE')).toBe(true);
    expect(await a.ehSessao('Encontro')).toBe(false);
    expect(await a.daAtracao('Sessão da Tarde')).toEqual([]);
    expect(await a.registrar({ atracao: 'Temperatura Máxima', card: 'c', artes: ['HOJE'] })).toBe(0);
    expect(pedidos).toHaveLength(0);
  });

  it('sem configuração, fica desligado e não lê nada', async () => {
    const a = criarAcervo({});
    expect(a.ligado).toBe(false);
    expect(await a.daAtracao('Encontro')).toEqual([]);
  });
});
