// @vitest-environment node
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { chaveDeArte, criarAcervo } from '../servidor/acervo.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';

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
const W = 'e'.repeat(24); // o card da semana da Sessão da Tarde
const FLORES = { id: 'recFlores', title: 'FLORES DE AÇO (2012)' };
const COMITE = { id: 'recComite', title: 'O COMITÊ DA VIDA (2021)' };
const TARDE = { id: 's2', title: 'Sessão da Tarde' };

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
    // o card da semana da Sessão da Tarde: dois filmes, um card só
    { filme: FLORES, sessao: TARDE, data_de_exibicao: '2026-11-30T03:00:00.000Z', dia: '2026-11-30', card_ID: W, labels: null },
    { filme: COMITE, sessao: TARDE, data_de_exibicao: '2026-12-03T03:00:00.000Z', dia: '2026-12-03', card_ID: W, labels: null },
  ];
  const consultas: { sql: string; params: unknown[] }[] = [];
  const consultar = async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    if (sql.includes('"acervo"')) return linhas;
    if (sql.includes('"atracoes"') && sql.includes('"tipo"')) return tipos;
    if (sql.includes('"atracoes"')) return ({ encontro: [{ id: 'recEnc' }], 'tela quente': [{ id: 'recTQ' }], 'sessão da tarde': [{ id: 'recTarde' }] } as Record<string, { id: string }[]>)[String(params[0]).toLowerCase()] ?? [];
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
  const previas: Record<string, string[]> = { [A]: ['RIVAIS', 'HOJE', 'AMANHÃ', 'SEGUNDA', 'PRÓXIMA SEGUNDA', 'TELA QUENTE APRESENTA'], [B]: ['HOJE', 'QUARTA'], [D]: ['NÃO É ESTE'], [W]: ['30/11 SEG · FLORES DE AÇO (2012)', '03/12 QUI · O COMITÊ DA VIDA (2021)'] };
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
    const n = await a.registrar({ atracao: 'Encontro', card: 'card9', artes: [{ texto: 'Amanhã', tipo: 'RDP' }, { texto: 'Hoje', tipo: 'CRT' }, { texto: 'HOJE', tipo: 'RDP' }, { texto: 'Domingo', tipo: 'LETT' }, 'Domingo', { texto: 'Sexta', tipos: ['FOTO', 'LETT'] }] });
    expect(n).toBe(5);
    const post = pedidos.find((p) => p.metodo === 'POST')!.corpo!.records.map((r) => r.fields);
    expect(post).toEqual([
      { arte: 'HOJE', tipo: 'RDP', atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] },
      { arte: 'Domingo', tipo: 'LETT', atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] },
      { arte: 'Sexta', tipo: 'FOTO', atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] }, // dois tipos: uma linha de cada
      { arte: 'Sexta', tipo: 'LETT', atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] },
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

  it('o acervo de um filme da Sessão da Tarde traz o título dele do card da semana, e não os dos outros filmes', async () => {
    const { consultar, artesDoCard } = falsos();
    const a = criarAcervo(ENV, { consultar, artesDoCard });
    const artes: Arte[] = await a.paraRevisao('Sessão da Tarde', '2026-12-03');
    expect(artes.map((x) => [x.chave, x.claquete])).toEqual([['O COMITE DA VIDA', 'Prévia: Sessão da Tarde 03/12']]);
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

  it('o card da semana da Sessão da Tarde que sai põe no acervo o título de cada filme, uma vez por filme', async () => {
    const { consultar, buscar, pedidos, artesDoCard } = falsos();
    const acervo = criarAcervo(ENV, { consultar, buscar, artesDoCard });
    // as exibições do card da semana: a do PROMeiro guarda o título; a do n8n vem sem artes (o título é a arte dela)
    const exibicao = (filme: { id: string }, titulo: string, data: string, artes: string[]) => ({ id: `rec${data}`, filme: filme.id, card: W, data, sessao: 'Sessão da Tarde', titulo, ano: null, status: ['FINALIZADO'], entregue: false, artes, existentes: [] });
    const filmesProximos = async () => [exibicao(FLORES, 'FLORES DE AÇO', '2026-11-30', ['FLORES DE AÇO']), exibicao(COMITE, 'O Comitê da Vida', '2026-12-03', [])];
    const trello = { ligado: false, filmesProximos, parar: async () => {} };
    const servidor = createServer(criarApp({ db: abrirBanco(':memory:'), env: {}, trello, acervo }));
    await new Promise<void>((ok) => servidor.listen(0, ok));
    const filmes = () => fetch(`http://localhost:${(servidor.address() as { port: number }).port}/api/filmes`, { headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com' } });
    try {
      expect((await filmes()).status).toBe(200);
      await new Promise((ok) => setTimeout(ok, 50));
      const gravadas = () => pedidos.filter((p) => p.metodo === 'POST').flatMap((p) => p.corpo!.records.map((r) => r.fields));
      expect(gravadas()).toEqual([
        { arte: 'FLORES DE AÇO', atracao: [{ id: 'recTarde' }], claquete: [{ id: 'recCard9' }], filme: { id: 'recFlores' } },
        { arte: 'O COMITÊ DA VIDA', atracao: [{ id: 'recTarde' }], claquete: [{ id: 'recCard9' }], filme: { id: 'recComite' } },
      ]);
      // da próxima conferência, o card da semana não vai de novo
      await filmes();
      await new Promise((ok) => setTimeout(ok, 50));
      expect(gravadas()).toHaveLength(2);
    } finally {
      servidor.close();
    }
  });
});
