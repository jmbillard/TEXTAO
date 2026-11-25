// @vitest-environment node
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { chaveDeArte, criarAcervo } from '../servidor/acervo.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { acervoDaAtracao } from '../servidor/cadastros.mjs';

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
type LinhaDaAtracao = { atracao: string; acervo?: string | null };
// a coluna acervo, com os três valores e o vazio (vale próprio)
const ATRACOES: LinhaDaAtracao[] = [
  { atracao: 'Encontro', acervo: 'próprio' },
  { atracao: 'Tela Quente', acervo: 'do filme' },
  { atracao: 'Sessão da Tarde', acervo: '["do filme"]' },
  { atracao: 'Shows Diversos', acervo: 'sem acervo' },
  { atracao: 'VTs', acervo: 'sem acervo' },
  { atracao: 'VT Upfront 2026', acervo: null },
];

function falsos(atracoes: LinhaDaAtracao[] = ATRACOES) {
  const linhas = [
    { id: 'recH', arte: 'HOJE', key: 'HOJE', tipo: '["Lettering com alpha"]', atracao: '[{"id":"recEnc","title":"Encontro"}]', claquete: '[{"id":"recP1","title":"ENCONTRO 02/01 REDE"}]', filme: null },
    { id: 'recH2', arte: 'Hoje', key: 'HOJE', tipo: 'CRT', atracao: [{ id: 'recEnc', title: 'Encontro' }], claquete: [], filme: null },
    { id: 'recA', arte: 'Amanhã!', key: null, tipo: null, atracao: [{ id: 'recEnc', title: 'Encontro' }], claquete: [], filme: null },
    { id: 'recS', arte: 'SÁBADO', key: 'SABADO', tipo: 'Rodapé', atracao: [{ id: 'recShow', title: 'Show da Noite' }], claquete: [], filme: null },
    { id: 'recF', arte: 'Frase de efeito', key: 'FRASE DE EFEITO', tipo: null, atracao: [{ id: 'recTQ', title: 'Tela Quente' }], claquete: [{ id: 'recP2', title: 'TELA QUENTE 02/03' }], filme: RIVAIS },
    { id: 'recM', arte: 'Outro filme', key: 'OUTRO FILME', tipo: null, atracao: [{ id: 'recTQ', title: 'Tela Quente' }], claquete: [], filme: { id: 'recMumia', title: 'A MÚMIA (1999)' } },
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
    if (sql.includes('"bseBase"."acervo"')) return linhas;
    if (sql.includes('"atracoes"') && sql.includes('"acervo"')) return atracoes;
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
    const doAcervo = (c: { sql: string }) => c.sql.includes('"bseBase"."acervo"');
    expect(consultas.find(doAcervo)!.sql).toMatch(/"claquete", "filme"/);
    await a.daAtracao('Show da Noite');
    expect(consultas.filter(doAcervo)).toHaveLength(1); // guardado por 1 min
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

  describe('a complexidade da arte (1, 2 ou 3) entra com ela no acervo', () => {
    const registrar = async (artes: unknown[]) => {
      const { consultar, buscar, pedidos } = falsos();
      const a = criarAcervo(ENV, { consultar, buscar });
      await a.registrar({ atracao: 'Encontro', card: 'card9', artes });
      return {
        post: pedidos.filter((p) => p.metodo === 'POST').flatMap((p) => p.corpo!.records.map((r) => r.fields)),
        patch: pedidos.filter((p) => p.metodo === 'PATCH').flatMap((p) => p.corpo!.records),
      };
    };

    it('a arte nova entra com o seu nível', async () => {
      const { post } = await registrar([{ texto: 'Sexta', tipos: ['RDP'], complexidade: 3 }, { texto: 'Domingo', tipos: [], complexidade: 2 }]);
      expect(post).toEqual([
        { arte: 'Sexta', tipo: 'RDP', complexidade: 3, atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] },
        { arte: 'Domingo', complexidade: 2, atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] },
      ]);
    });

    it('a arte sem marca entra com 1', async () => {
      const { post } = await registrar([{ texto: 'Sexta', tipos: [], complexidade: 1 }, { texto: 'Domingo', tipos: [], complexidade: 'alta' }]);
      expect(post.map((f) => f.complexidade)).toEqual([1, 1]);
    });

    it('a arte com dois tipos leva o mesmo nível nas duas linhas', async () => {
      const { post } = await registrar([{ texto: 'Sexta', tipos: ['FOTO', 'LETT'], complexidade: 2 }]);
      expect(post.map((f) => [f.tipo, f.complexidade])).toEqual([
        ['FOTO', 2],
        ['LETT', 2],
      ]);
    });

    it('a arte que já estava no acervo não muda de complexidade, nem quando só ganha o tipo', async () => {
      const { post, patch } = await registrar([{ texto: 'Hoje', tipos: ['CRT'], complexidade: 3 }, { texto: 'Amanhã', tipos: ['RDP'], complexidade: 3 }]);
      expect(post).toEqual([]);
      expect(patch).toEqual([{ id: 'recA', fields: { tipo: 'RDP' } }]);
    });

    it('a arte que ninguém marcou (o card de filme, a ✓) entra sem complexidade, sem inventar', async () => {
      const { post } = await registrar(['Sexta', { texto: 'Domingo', tipos: ['RDP'] }]);
      expect(post).toEqual([
        { arte: 'Sexta', atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] },
        { arte: 'Domingo', tipo: 'RDP', atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] },
      ]);
    });

    it('do envio ao card que sai: o nível guardado no envio é o que entra; o envio guardado antes entra com 1', async () => {
      const { consultar, buscar, pedidos } = falsos();
      const acervo = criarAcervo(ENV, { consultar, buscar });
      const db = abrirBanco(':memory:');
      const andamento = async (linhas: { id: string }[]) => Object.fromEntries(linhas.map((l) => [l.id, { status: ['FINALIZADO'], entregue: false }]));
      const trello = { ligado: true, parar: async () => {}, andamento, enviar: async () => ({ card: { id: 'card9', url: 'https://trello.com/c/C9' }, avisos: [] }) };
      const servidor = createServer(criarApp({ db, env: {}, trello, acervo }));
      await new Promise<void>((ok) => servidor.listen(0, ok));
      const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
      const ana = (caminho: string, init: RequestInit = {}) =>
        fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com', 'content-type': 'application/json', ...init.headers } });
      const gravadas = () => pedidos.filter((p) => p.metodo === 'POST').flatMap((p) => p.corpo!.records.map((r) => [r.fields.arte, r.fields.complexidade]));
      try {
        const roteiro = { meta: { claquete: 'Encontro 19/11', programa: 'Encontro' }, doc: { type: 'doc', content: [] } };
        await ana('/api/roteiros/rot-cx-1', { method: 'PUT', body: JSON.stringify({ roteiro, nArtes: 2 }) });
        await ana('/api/roteiros/rot-cx-1/trello', { method: 'POST', body: JSON.stringify({ artes: [{ texto: 'Sexta', tipo: '', complexidade: 3 }, { texto: 'Domingo', tipo: '' }], texto: 'x' }) });
        await ana('/api/andamento');
        await new Promise((ok) => setTimeout(ok, 50));
        expect(gravadas()).toEqual([
          ['Sexta', 3],
          ['Domingo', 1],
        ]);
        // o envio guardado antes desta mudança, sem a complexidade ({ texto, tipos }, ou só o texto, o formato mais antigo)
        db.prepare('UPDATE envios SET artes_novas = ?, acervo_em = NULL WHERE roteiro_id = ?').run(JSON.stringify([{ texto: 'Segunda', tipos: ['RDP'] }, 'Terça']), 'rot-cx-1');
        await ana('/api/andamento');
        await new Promise((ok) => setTimeout(ok, 50));
        expect(gravadas().slice(2)).toEqual([
          ['Segunda', 1],
          ['Terça', 1],
        ]);
      } finally {
        servidor.close();
      }
    });
  });

  it('pacote gráfico novo: apaga todas as artes da atração (as de filme, não)', async () => {
    const { consultar, buscar, pedidos } = falsos();
    const a = criarAcervo(ENV, { consultar, buscar });
    expect(await a.zerar('Encontro')).toBe(3);
    expect(pedidos[0].metodo).toBe('DELETE');
    expect(pedidos[0].url).toBe('http://teable:3000/api/table/tblAcervo/record?recordIds[0]=recH&recordIds[1]=recH2&recordIds[2]=recA');
  });

  it('o acervo da atração manda: do filme usa o filme, sem acervo não tem, VT com atração própria tem', async () => {
    const { consultar, buscar, pedidos } = falsos();
    const a = criarAcervo(ENV, { consultar, buscar });
    expect(await a.acervoDe('TELA QUENTE')).toBe('filme');
    expect(await a.acervoDe('Sessão da Tarde')).toBe('filme');
    expect(await a.ehSessao('Tela Quente')).toBe(true);
    expect(await a.semAcervo('Shows Diversos')).toBe(true);
    expect(await a.acervoDe('Encontro')).toBe('proprio');
    expect(await a.acervoDe('VT Upfront 2026')).toBe('proprio'); // vazio: próprio
    expect(await a.acervoDe('Atração sem cadastro')).toBe('proprio');
    expect(await a.daAtracao('Tela Quente')).toEqual([]); // a sessão em si não tem acervo
    expect(await a.paraRevisao('VTs', '')).toEqual([]);
    expect(await a.registrar({ atracao: 'Shows Diversos', card: 'c', artes: ['HOJE'] })).toBe(0);
    expect(pedidos).toHaveLength(0);
    expect((await a.paraRevisao('Encontro', '')).length).toBe(2);
  });

  it('o acervo de cada linha: os três valores e o vazio (próprio); a coluna tipo não conta mais', () => {
    expect(['próprio', 'do filme', 'sem acervo', 'Do Filme', '["sem acervo"]'].map((acervo) => acervoDaAtracao({ acervo }))).toEqual(['proprio', 'filme', 'sem', 'filme', 'sem']);
    expect([{}, { acervo: null }, { acervo: '' }, { acervo: [] }, null].map(acervoDaAtracao)).toEqual(['proprio', 'proprio', 'proprio', 'proprio', 'proprio']);
    expect(acervoDaAtracao({ acervo: null, tipo: 'Sessão de filme' })).toBe('proprio');
  });

  it('o acervo das atrações é guardado; mudar nos cadastros faz reler', async () => {
    const { consultar, consultas } = falsos();
    const a = criarAcervo(ENV, { consultar });
    await a.acervoDe('Encontro');
    await a.acervoDe('Tela Quente');
    expect(consultas.filter((c) => c.sql.includes('"atracoes"'))).toHaveLength(1);
    a.esquecerAcervos();
    await a.acervoDe('Encontro');
    expect(consultas.filter((c) => c.sql.includes('"atracoes"'))).toHaveLength(2);
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

describe('a atração do envio ao registrar no acervo (#54)', () => {
  /**
   * Um envio de verdade pela API (com ou sem a atração na ficha), o card no andamento e o acervo de mentira.
   * `ligadas`: a atração ligada na produção da arte de cada card; `programas`: as atrações e keys dos cadastros.
   */
  async function cenario({ programa = '', claquete = 'ENCONTRO 19/11', ligadas = {} as Record<string, string>, programas = [] as { nome: string; chaves: string[] }[], saiu = true }) {
    const { consultar, buscar, pedidos } = falsos();
    const acervo = criarAcervo(ENV, { consultar, buscar });
    const db = abrirBanco(':memory:');
    // a cópia do vocabulário no banco do app: as keys de agora, mesmo sem o Teable ligado
    db.prepare('INSERT INTO teable_copia (chave, dados, em) VALUES (?, ?, ?)').run('vocabulario', JSON.stringify({ programas }), new Date().toISOString());
    const procurados: string[][] = [];
    const andamento = async (linhas: { id: string }[]) => Object.fromEntries(linhas.map((l) => [l.id, { status: [saiu ? 'FINALIZADO' : 'PRODUZINDO'], entregue: false }]));
    const atracoesDosCards = async (cards: string[]) => (procurados.push(cards), Object.fromEntries(cards.filter((c) => ligadas[c]).map((c) => [c, ligadas[c]])));
    const trello = { ligado: true, parar: async () => {}, andamento, atracoesDosCards, enviar: async () => ({ card: { id: 'card9', url: 'https://trello.com/c/C9' }, avisos: [] }) };
    const servidor = createServer(criarApp({ db, env: {}, trello, acervo }));
    await new Promise<void>((ok) => servidor.listen(0, ok));
    const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    const ana = (caminho: string, init: RequestInit = {}) =>
      fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com', 'content-type': 'application/json', ...init.headers } });
    try {
      const roteiro = { meta: { claquete, programa }, doc: { type: 'doc', content: [] } };
      await ana('/api/roteiros/rot-54', { method: 'PUT', body: JSON.stringify({ roteiro, nArtes: 1 }) });
      await ana('/api/roteiros/rot-54/trello', { method: 'POST', body: JSON.stringify({ artes: [{ texto: 'Sexta', tipo: '', complexidade: 2 }], texto: 'x' }) });
      await ana('/api/andamento');
      await new Promise((ok) => setTimeout(ok, 50));
    } finally {
      servidor.close();
    }
    const envio = db.prepare('SELECT atracao, acervo_em FROM envios WHERE roteiro_id = ?').get('rot-54') as { atracao: string; acervo_em: string | null };
    const gravadas = pedidos.filter((p) => p.metodo === 'POST').flatMap((p) => p.corpo!.records.map((r) => r.fields));
    return { envio, gravadas, procurados };
  }

  it('o envio com a atração: entra por ela, sem procurar na produção da arte', async () => {
    const { envio, gravadas, procurados } = await cenario({ programa: 'Encontro', ligadas: { card9: 'Tela Quente' } });
    expect(gravadas).toEqual([{ arte: 'Sexta', complexidade: 2, atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] }]);
    expect(envio.atracao).toBe('Encontro');
    expect(envio.acervo_em).not.toBeNull();
    expect(procurados).toEqual([]);
  });

  it('o envio sem atração, com o link na produção da arte: entra e o envio guarda a atração', async () => {
    const { envio, gravadas, procurados } = await cenario({ claquete: 'XPTO 19/11', ligadas: { card9: 'Encontro' } });
    expect(gravadas).toEqual([{ arte: 'Sexta', complexidade: 2, atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] }]);
    expect(envio.atracao).toBe('Encontro');
    expect(envio.acervo_em).not.toBeNull();
    expect(procurados).toEqual([['card9']]);
  });

  it('o link na produção da arte vale mais que a claquete', async () => {
    const { envio } = await cenario({ claquete: 'TELA QUENTE 19/11', ligadas: { card9: 'Encontro' }, programas: [{ nome: 'Tela Quente', chaves: ['TELA QUENTE'] }] });
    expect(envio.atracao).toBe('Encontro');
  });

  it('o envio sem atração e sem link, com a claquete reconhecida pelas keys de agora: entra', async () => {
    const { envio, gravadas } = await cenario({ claquete: 'Rio Enc(Festa) 19/11', programas: [{ nome: 'Tela Quente', chaves: ['TELA QUENTE'] }, { nome: 'Encontro', chaves: ['ENC'] }] });
    expect(gravadas).toEqual([{ arte: 'Sexta', complexidade: 2, atracao: [{ id: 'recEnc' }], claquete: [{ id: 'recCard9' }] }]);
    expect(envio.atracao).toBe('Encontro');
    expect(envio.acervo_em).not.toBeNull();
  });

  it('o envio sem nada: continua esperando, sem ser marcado como registrado', async () => {
    const { envio, gravadas } = await cenario({ claquete: 'XPTO 19/11', programas: [{ nome: 'Encontro', chaves: ['ENC'] }] });
    expect(gravadas).toEqual([]);
    expect(envio.atracao).toBe('');
    expect(envio.acervo_em).toBeNull();
  });

  it('o card que ainda não saiu: nada muda e nada é procurado', async () => {
    const { envio, gravadas, procurados } = await cenario({ ligadas: { card9: 'Encontro' }, programas: [{ nome: 'Encontro', chaves: ['ENCONTRO'] }], saiu: false });
    expect(gravadas).toEqual([]);
    expect(envio).toEqual({ atracao: '', acervo_em: null });
    expect(procurados).toEqual([]);
  });
});
