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
  TEABLE_PG_LOG_BOT: 'log_bot',
};

/** O Postgres do Teable (acervo, atrações, produção) e a API, de mentira. */
function falsos() {
  const linhas = [
    { id: 'recH', arte: 'HOJE', key: 'HOJE', tipo: '["Lettering com alpha"]', atracao: '[{"id":"recEnc","title":"Encontro"}]', claquete: '[{"id":"recP1","title":"ENCONTRO 02/01 REDE"}]' },
    { id: 'recA', arte: 'Amanhã!', key: null, tipo: null, atracao: [{ id: 'recEnc', title: 'Encontro' }], claquete: [] },
    { id: 'recS', arte: 'SÁBADO', key: 'SABADO', tipo: 'Rodapé', atracao: [{ id: 'recShow', title: 'Show da Noite' }], claquete: [] },
    { id: 'recF', arte: 'Frase de efeito', key: 'FRASE DE EFEITO', tipo: null, atracao: [{ id: 'recTQ', title: 'Tela Quente' }], claquete: [{ id: 'recP2', title: 'TELA QUENTE 02/03' }], filme: 'RIVAIS 2024' },
    { id: 'recM', arte: 'Outro filme', key: 'OUTRO FILME', tipo: null, atracao: [{ id: 'recTQ', title: 'Tela Quente' }], claquete: [], filme: 'A MUMIA 1999' },
  ];
  // o log do bot: o mesmo filme em duas sessões, outro com o mesmo título e outro ano, e um cancelado no mesmo dia
  const logBot = [
    { key: 'RIVAIS', ano_de_producao: 2024, titulo: 'RIVAIS', sessao: { id: 's1', title: 'TELA QUENTE' }, data_de_exibicao: '2026-11-16', card_ID: 'a'.repeat(24), labels: null },
    { key: 'OUTRO', ano_de_producao: 2020, titulo: 'OUTRO', sessao: { id: 's1', title: 'TELA QUENTE' }, data_de_exibicao: '2026-11-16', card_ID: 'c'.repeat(24), labels: ['CANCELADO'] },
    { key: 'RIVAIS', ano_de_producao: 0, titulo: 'RIVAIS', sessao: { id: 's2', title: 'SESSÃO DA TARDE' }, data_de_exibicao: '2027-02-03', card_ID: 'b'.repeat(24), labels: null },
    { key: 'RIVAIS', ano_de_producao: 1990, titulo: 'RIVAIS', sessao: { id: 's3', title: 'CORUJÃO' }, data_de_exibicao: '2025-01-01', card_ID: 'd'.repeat(24), labels: null },
  ];
  const consultas: { sql: string; params: unknown[] }[] = [];
  const consultar = async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    if (sql.includes('"acervo"')) return linhas;
    if (sql.includes('"atracoes"')) return params[0] === 'Encontro' ? [{ id: 'recEnc' }] : [];
    if (sql.includes('"producao"')) return [{ id: 'recCard9' }];
    if (sql.includes('"log_bot"') && sql.includes('data_de_exibicao"::date = $1')) return params[0] === '2026-11-16' ? logBot.filter((l) => l.data_de_exibicao === '2026-11-16') : [];
    if (sql.includes('"log_bot"')) return logBot.filter((l) => l.key === params[0]);
    if (sql.includes('"sessoes"')) return [{ sessao: 'Sessão da Tarde' }, { sessao: 'Temperatura Máxima' }, { sessao: 'TELA QUENTE' }];
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

  it('filme: a prévia (em qualquer sessão, o mesmo ano) e as claquetes dele contam; outro ano é outro filme', async () => {
    const { consultar } = falsos();
    const lidos: string[] = [];
    const artesDoCard = async (card: string) => (lidos.push(card), card === 'a'.repeat(24) ? ['RIVAIS', 'HOJE', 'AMANHÃ', 'SEGUNDA', 'PRÓXIMA SEGUNDA', 'TELA QUENTE APRESENTA'] : card === 'b'.repeat(24) ? ['HOJE', 'QUARTA'] : ['NÃO É ESTE']);
    const a = criarAcervo(ENV, { consultar, artesDoCard });
    expect(await a.filmeDe('Tela Quente', '2026-11-16')).toEqual({ key: 'RIVAIS', ano: 2024, titulo: 'RIVAIS' });
    expect(await a.filmeDe('Tela Quente', '2026-11-17')).toBeNull();
    const artes = await a.paraRevisao('Tela Quente', '2026-11-16');
    expect(artes.map((x: { chave: string }) => x.chave).sort()).toEqual(['AMANHA', 'FRASE DE EFEITO', 'HOJE', 'PROXIMA SEGUNDA', 'QUARTA', 'RIVAIS', 'SEGUNDA', 'TELA QUENTE APRESENTA']);
    expect(artes.find((x: { chave: string }) => x.chave === 'HOJE').claquete).toBe('Prévia: TELA QUENTE 16/11');
    expect(artes.find((x: { chave: string }) => x.chave === 'FRASE DE EFEITO').claquete).toBe('TELA QUENTE 02/03');
    expect(lidos).not.toContain('d'.repeat(24)); // RIVAIS de 1990 é outro filme
    expect(await a.daAtracao('Tela Quente')).toEqual([]); // a sessão em si não tem acervo
  });

  it('o card de uma sessão que sai grava as artes novas no filme', async () => {
    const { consultar, buscar, pedidos } = falsos();
    const a = criarAcervo({ ...ENV }, { consultar, buscar, artesDoCard: async () => ['HOJE'] });
    // atração cadastrada com esse nome
    const consultar2 = async (sql: string, params: unknown[] = []) => (sql.includes('"atracoes"') ? [{ id: 'recTQ' }] : consultar(sql, params));
    const b = criarAcervo(ENV, { consultar: consultar2, buscar, artesDoCard: async () => ['HOJE'] });
    expect(await b.registrar({ atracao: 'TELA QUENTE', data: '2026-11-16', card: 'card9', artes: ['Hoje', 'Zendaya'] })).toBe(1);
    expect(pedidos[0].corpo!.records.map((r) => r.fields)).toEqual([{ arte: 'Zendaya', atracao: [{ id: 'recTQ' }], claquete: [{ id: 'recCard9' }], filme: 'RIVAIS 2024' }]);
    expect(await a.registrar({ atracao: 'TELA QUENTE', data: '2026-11-17', card: 'c', artes: ['X'] })).toBe(0); // sem filme no dia
  });

  it('sem configuração, fica desligado e não lê nada', async () => {
    const a = criarAcervo({});
    expect(a.ligado).toBe(false);
    expect(await a.daAtracao('Encontro')).toEqual([]);
  });
});
