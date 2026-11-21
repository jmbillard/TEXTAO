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
  TEABLE_PG_EXIBICOES: 'exibicoes',
};

const RIVAIS = { id: 'recRivais', title: 'RIVAIS (2024)' };
const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);
const D = 'd'.repeat(24);

/** O Postgres do Teable (acervo, atrações, exibições, produção) e a API, de mentira. */
function falsos() {
  const linhas = [
    { id: 'recH', arte: 'HOJE', key: 'HOJE', tipo: '["Lettering com alpha"]', atracao: '[{"id":"recEnc","title":"Encontro"}]', claquete: '[{"id":"recP1","title":"ENCONTRO 02/01 REDE"}]', filme: null },
    { id: 'recH2', arte: 'Hoje', key: 'HOJE', tipo: 'CRT', atracao: [{ id: 'recEnc', title: 'Encontro' }], claquete: [], filme: null },
    { id: 'recA', arte: 'Amanhã!', key: null, tipo: null, atracao: [{ id: 'recEnc', title: 'Encontro' }], claquete: [], filme: null },
    { id: 'recS', arte: 'SÁBADO', key: 'SABADO', tipo: 'Rodapé', atracao: [{ id: 'recShow', title: 'Show da Noite' }], claquete: [], filme: null },
    { id: 'recF', arte: 'Frase de efeito', key: 'FRASE DE EFEITO', tipo: null, atracao: [{ id: 'recTQ', title: 'Tela Quente' }], claquete: [{ id: 'recP2', title: 'TELA QUENTE 02/03' }], filme: RIVAIS },
    { id: 'recM', arte: 'Outro filme', key: 'OUTRO FILME', tipo: null, atracao: [{ id: 'recTQ', title: 'Tela Quente' }], claquete: [], filme: { id: 'recMumia', title: 'A MÚMIA (1999)' } },
  ];
  const tipos = [
    { atracao: 'Encontro', tipo: 'Atração' },
    { atracao: 'Tela Quente', tipo: 'Sessão de filme' },
    { atracao: 'Sessão da Tarde', tipo: 'Sessão de filme' },
    { atracao: 'Shows Diversos', tipo: 'Genérica' },
    { atracao: 'VTs', tipo: 'Genérica' },
    { atracao: 'VT Upfront 2026', tipo: 'VT' },
  ];
  // exibições: o mesmo filme em duas sessões, outro filme cancelado no mesmo dia, e um filme de mesmo título e outro ano
  const exibicoes = [
    { filme: RIVAIS, sessao: { id: 's1', title: 'Tela Quente' }, data_de_exibicao: '2026-11-17T03:00:00.000Z', dia: '2026-11-17', card_ID: A, labels: null },
    { filme: { id: 'recOutro', title: 'OUTRO (2020)' }, sessao: { id: 's1', title: 'Tela Quente' }, data_de_exibicao: '2026-11-17T03:00:00.000Z', dia: '2026-11-17', card_ID: C, labels: ['CANCELADO'] },
    { filme: RIVAIS, sessao: { id: 's2', title: 'Sessão da Tarde' }, data_de_exibicao: '2027-02-03T03:00:00.000Z', dia: '2027-02-03', card_ID: B, labels: null },
    { filme: { id: 'recRivais90', title: 'RIVAIS (1990)' }, sessao: { id: 's3', title: 'Corujão' }, data_de_exibicao: '2025-01-01T03:00:00.000Z', dia: '2025-01-01', card_ID: D, labels: null },
  ];
  const consultas: { sql: string; params: unknown[] }[] = [];
  const consultar = async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    if (sql.includes('"acervo"')) return linhas;
    if (sql.includes('"atracoes"') && sql.includes('"tipo"')) return tipos;
    if (sql.includes('"atracoes"')) return { Encontro: [{ id: 'recEnc' }], 'Tela Quente': [{ id: 'recTQ' }], '': [] }[String(params[0]).toLowerCase() === 'encontro' ? 'Encontro' : String(params[0]).toLowerCase() === 'tela quente' ? 'Tela Quente' : ''];
    if (sql.includes('"producao"')) return [{ id: 'recCard9' }];
    if (sql.includes('"exibicoes"') && sql.includes('::date = $1')) return exibicoes.filter((e) => e.dia === params[0]);
    if (sql.includes('"exibicoes"')) return exibicoes.filter((e) => e.filme.id === params[0]);
    return [];
  };
  const pedidos: { metodo: string; url: string; corpo: null | { records: { id?: string; fields: Record<string, unknown> }[] } }[] = [];
  const buscar = async (url: string, init: RequestInit = {}) => {
    pedidos.push({ metodo: init.method ?? 'GET', url, corpo: init.body ? JSON.parse(String(init.body)) : null });
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };
  const previas: Record<string, string[]> = { [A]: ['RIVAIS', 'HOJE', 'AMANHÃ', 'SEGUNDA', 'PRÓXIMA SEGUNDA', 'TELA QUENTE APRESENTA'], [B]: ['HOJE', 'QUARTA'], [D]: ['NÃO É ESTE'] };
  const lidos: string[] = [];
  const artesDoCard = async (card: string) => (lidos.push(card), previas[card] ?? []);
  return { consultar, consultas, buscar, pedidos, artesDoCard, lidos };
}

type Arte = { chave: string; claquete: string };

describe('acervo de artes', () => {
  it('chave: sem acento, caixa e pontuação', () => {
    expect(chaveDeArte(' Amanhã! ')).toBe('AMANHA');
    expect(chaveDeArte('sábado/domingo')).toBe('SABADO DOMINGO');
  });

  it('lê as artes da atração, com o tipo e a claquete em que foram pedidas (a chave sai da arte)', async () => {
    const { consultar, consultas } = falsos();
    const a = criarAcervo(ENV, { consultar });
    expect(a.ligado).toBe(true);
    expect(await a.daAtracao('ENCONTRO')).toEqual([
      { arte: 'HOJE', chave: 'HOJE', tipo: 'Lettering com alpha, CRT', claquete: 'ENCONTRO 02/01 REDE' }, // a mesma arte em dois tipos: uma entrada
      { arte: 'Amanhã!', chave: 'AMANHA', tipo: '', claquete: '' },
    ]);
    expect(consultas.find((c) => c.sql.includes('"acervo"'))!.sql).toMatch(/"claquete", "filme"/);
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

  it('com o tipo (sigla): a sem tipo ganha o tipo; o mesmo tipo não repete; outro tipo é outra arte', async () => {
    const { consultar, buscar, pedidos } = falsos();
    const a = criarAcervo(ENV, { consultar, buscar });
    const n = await a.registrar({ atracao: 'Encontro', card: 'card9', artes: [{ texto: 'Amanhã', tipo: 'RDP' }, { texto: 'Hoje', tipo: 'CRT' }, { texto: 'HOJE', tipo: 'RDP' }, { texto: 'Domingo', tipo: 'LETT' }, 'Domingo'] });
    expect(n).toBe(3);
    const post = pedidos.find((p) => p.metodo === 'POST')!.corpo!.records.map((r) => r.fields);
    expect(post).toEqual([
      { arte: 'HOJE', tipo: 'RDP', atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] },
      { arte: 'Domingo', tipo: 'LETT', atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] },
    ]);
    expect(pedidos.find((p) => p.metodo === 'PATCH')!.corpo!.records).toEqual([{ id: 'recA', fields: { tipo: 'RDP' } }]);
  });

  it('pacote gráfico novo: apaga todas as artes da atração (as de filme, não)', async () => {
    const { consultar, buscar, pedidos } = falsos();
    const a = criarAcervo(ENV, { consultar, buscar });
    expect(await a.zerar('Encontro')).toBe(3);
    expect(pedidos[0].metodo).toBe('DELETE');
    expect(pedidos[0].url).toBe('http://teable:3000/api/table/tblAcervo/record?recordIds[0]=recH&recordIds[1]=recH2&recordIds[2]=recA');
  });

  it('o tipo da atração manda: sessão usa o filme, genérica não tem acervo, VT com atração própria tem', async () => {
    const { consultar, buscar, pedidos } = falsos();
    const a = criarAcervo(ENV, { consultar, buscar });
    expect(await a.tipoDe('TELA QUENTE')).toBe('Sessão de filme');
    expect(await a.ehSessao('Tela Quente')).toBe(true);
    expect(await a.semAcervo('Shows Diversos')).toBe(true);
    expect(await a.tipoDe('Atração sem tipo')).toBe('Atração');
    expect(await a.daAtracao('Tela Quente')).toEqual([]); // a sessão em si não tem acervo
    expect(await a.paraRevisao('VTs', '')).toEqual([]);
    expect(await a.registrar({ atracao: 'Shows Diversos', card: 'c', artes: ['HOJE'] })).toBe(0);
    expect(pedidos).toHaveLength(0);
    expect((await a.paraRevisao('Encontro', '')).length).toBe(2);
  });

  it('filme: as prévias dele (em qualquer sessão) e as claquetes dele contam; outro ano é outro filme', async () => {
    const { consultar, artesDoCard, lidos } = falsos();
    const a = criarAcervo(ENV, { consultar, artesDoCard });
    expect(await a.filmeDe('TELA QUENTE', '2026-11-17')).toEqual({ id: 'recRivais', nome: 'RIVAIS (2024)' }); // o cancelado do dia não conta
    expect(await a.filmeDe('Tela Quente', '2026-11-18')).toBeNull();
    const artes: Arte[] = await a.paraRevisao('Tela Quente', '2026-11-17');
    expect(artes.map((x) => x.chave).sort()).toEqual(['AMANHA', 'FRASE DE EFEITO', 'HOJE', 'PROXIMA SEGUNDA', 'QUARTA', 'RIVAIS', 'SEGUNDA', 'TELA QUENTE APRESENTA']);
    expect(artes.find((x) => x.chave === 'HOJE')!.claquete).toBe('Prévia: Tela Quente 17/11');
    expect(artes.find((x) => x.chave === 'QUARTA')!.claquete).toBe('Prévia: Sessão da Tarde 03/02');
    expect(artes.find((x) => x.chave === 'FRASE DE EFEITO')!.claquete).toBe('TELA QUENTE 02/03');
    expect(lidos).not.toContain(D); // RIVAIS de 1990 é outro filme
  });

  it('o card de uma sessão que sai grava as artes novas no filme; sem filme no dia, não grava', async () => {
    const { consultar, buscar, pedidos, artesDoCard } = falsos();
    const a = criarAcervo(ENV, { consultar, buscar, artesDoCard });
    expect(await a.registrar({ atracao: 'TELA QUENTE', data: '2026-11-17', card: 'card9', artes: ['Hoje', 'Zendaya'] })).toBe(1);
    expect(pedidos[0].corpo!.records.map((r) => r.fields)).toEqual([{ arte: 'Zendaya', atracao: [{ id: 'recTQ' }], claquete: [{ id: 'recCard9' }], filme: { id: 'recRivais' } }]);
    expect(await a.registrar({ atracao: 'Tela Quente', data: '2026-11-18', card: 'c', artes: ['X'] })).toBe(0);
  });

  it('sem configuração, fica desligado e não lê nada', async () => {
    const a = criarAcervo({});
    expect(a.ligado).toBe(false);
    expect(await a.daAtracao('Encontro')).toEqual([]);
  });
});
