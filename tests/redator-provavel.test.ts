// @vitest-environment node
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarRedatorProvavel, redatorDoHistorico } from '../servidor/redator.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';

/* O redator provável pelas últimas claquetes da atração (ARTE_producao): a regra e a rota. */

const HOJE = new Date('2026-11-25T12:00:00Z');
const dias = (n: number) => new Date(HOJE.getTime() - n * 86_400_000).toISOString();
const linha = (redator: string | null, diasAtras: number, praca = 'RJ') => ({ redator: redator ? { id: 'rec' + redator.length, title: redator } : null, praca, em: dias(diasAtras) });

describe('a regra do histórico', () => {
  it('3 das últimas 5: sugere', () => {
    const linhas = [linha('Fulana Prado', 1), linha('Beltrano Reis', 2), linha('Fulana Prado', 3), linha('Sicrana Lopes', 4), linha('Fulana Prado', 5)];
    expect(redatorDoHistorico(linhas, { praca: 'RJ', hoje: HOJE })).toEqual({ nome: 'Fulana Prado', vezes: 3, de: 5 });
  });

  it('só as 5 mais recentes contam, em qualquer ordem de chegada', () => {
    const linhas = [linha('Beltrano Reis', 10), linha('Beltrano Reis', 9), linha('Beltrano Reis', 8), linha('Fulana Prado', 1), linha('Fulana Prado', 2), linha('Fulana Prado', 3), linha('Sicrana Lopes', 4), linha('Sicrana Lopes', 5)];
    expect(redatorDoHistorico(linhas, { praca: 'RJ', hoje: HOJE })).toEqual({ nome: 'Fulana Prado', vezes: 3, de: 5 });
  });

  it('todas da mesma pessoa, menos de 5 na janela: "últimos 4"', () => {
    const linhas = [1, 2, 3, 4].map((d) => linha('Sicrana Lopes', d));
    expect(redatorDoHistorico(linhas, { praca: 'RJ', hoje: HOJE })).toEqual({ nome: 'Sicrana Lopes', vezes: 4, de: 4 });
  });

  it('mistura, sem ninguém com 3: não sugere', () => {
    const linhas = [linha('Fulana Prado', 1), linha('Beltrano Reis', 2), linha('Fulana Prado', 3), linha('Beltrano Reis', 4), linha('Sicrana Lopes', 5)];
    expect(redatorDoHistorico(linhas, { praca: 'RJ', hoje: HOJE })).toBeNull();
  });

  it('empate: não sugere', () => {
    const linhas = [linha('Fulana Prado', 1), linha('Beltrano Reis', 2), linha('Fulana Prado', 3), linha('Beltrano Reis', 4)];
    expect(redatorDoHistorico(linhas, { praca: 'RJ', hoje: HOJE })).toBeNull();
  });

  it('menos de 3 claquetes: não sugere', () => {
    expect(redatorDoHistorico([linha('Fulana Prado', 1), linha('Fulana Prado', 2)], { praca: 'RJ', hoje: HOJE })).toBeNull();
  });

  it('só a mesma praça conta', () => {
    const linhas = [linha('Fulana Prado', 1, 'SP'), linha('Fulana Prado', 2, 'SP'), linha('Fulana Prado', 3, 'SP'), linha('Beltrano Reis', 4), linha('Beltrano Reis', 5), linha('Beltrano Reis', 6)];
    expect(redatorDoHistorico(linhas, { praca: 'RJ', hoje: HOJE })).toEqual({ nome: 'Beltrano Reis', vezes: 3, de: 3 });
    expect(redatorDoHistorico(linhas, { praca: 'SP', hoje: HOJE })).toEqual({ nome: 'Fulana Prado', vezes: 3, de: 3 });
  });

  it('só os últimos 60 dias contam', () => {
    const linhas = [linha('Fulana Prado', 1), linha('Fulana Prado', 59), linha('Fulana Prado', 61), linha('Fulana Prado', 90)];
    expect(redatorDoHistorico(linhas, { praca: 'RJ', hoje: HOJE })).toBeNull();
    expect(redatorDoHistorico([...linhas, linha('Fulana Prado', 30)], { praca: 'RJ', hoje: HOJE })).toEqual({ nome: 'Fulana Prado', vezes: 3, de: 3 });
  });

  it('claquete sem redator não entra na conta', () => {
    const linhas = [linha(null, 1), linha(null, 2), linha('Fulana Prado', 3), linha('Fulana Prado', 4), linha('Fulana Prado', 5)];
    expect(redatorDoHistorico(linhas, { praca: 'RJ', hoje: HOJE })).toEqual({ nome: 'Fulana Prado', vezes: 3, de: 3 });
  });
});

const ENV = { TEABLE_PG_URL: 'postgres://x', TEABLE_PG_ESQUEMA: 'bseBase', TEABLE_PG_ARTE: 'producao' };

/** O Postgres do Teable, de mentira: a ARTE_producao com o vínculo da atração em JSON, como o Teable grava. */
function falso() {
  const consultas: { sql: string; params: unknown[] }[] = [];
  const producao = [
    ...[1, 2, 3, 4].map((d) => ({ atracao: [{ id: 'recCal', title: 'Caldeirão' }], redator: { id: 'recS', title: 'Sicrana Lopes' }, praca: 'RJ', em: dias(d) })),
    { atracao: '[{"id":"recOutra","title":"Outra Atração"}]', redator: { id: 'recF', title: 'Fulana Prado' }, praca: 'RJ', em: dias(1) },
  ];
  const consultar = async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    return producao.filter((l) => JSON.stringify(l.atracao).includes(`\\"title\\":\\"${params[0]}\\"`) || JSON.stringify(l.atracao).includes(`"title":"${params[0]}"`));
  };
  return { consultar, consultas };
}

async function servir(redatorProvavel: unknown) {
  const s = createServer(criarApp({ db: abrirBanco(':memory:'), env: {}, redatorProvavel }));
  await new Promise<void>((ok) => s.listen(0, ok));
  const base = `http://localhost:${(s.address() as { port: number }).port}`;
  const pedir = async (q: string) => (await fetch(`${base}/api/redator-provavel${q}`, { headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com' } })).json();
  return { s, pedir };
}

describe('a rota /api/redator-provavel', () => {
  it('lê a ARTE_producao pelo Postgres e devolve quem escreveu as últimas claquetes da atração', async () => {
    const { consultar, consultas } = falso();
    const { s, pedir } = await servir(criarRedatorProvavel(ENV, { consultar, agora: () => HOJE }));
    try {
      expect(await pedir('?atracao=Caldeir%C3%A3o&praca=RJ')).toEqual({ redator: { nome: 'Sicrana Lopes', vezes: 4, de: 4 } });
      expect(consultas[0].sql).toContain('"bseBase"."producao"');
      expect(await pedir('?atracao=Outra%20Atra%C3%A7%C3%A3o&praca=RJ')).toEqual({ redator: null });
      // sem atração, nem pergunta ao banco
      const antes = consultas.length;
      expect(await pedir('?praca=RJ')).toEqual({ redator: null });
      expect(consultas.length).toBe(antes);
    } finally {
      s.close();
    }
  });

  it('guarda a resposta por pouco tempo: a mesma atração e praça não voltam ao banco logo em seguida', async () => {
    const { consultar, consultas } = falso();
    let agora = HOJE.getTime();
    const r = criarRedatorProvavel(ENV, { consultar, agora: () => new Date(agora) });
    await r.provavel('Caldeirão', 'RJ');
    await r.provavel('Caldeirão', 'RJ');
    expect(consultas).toHaveLength(1);
    agora += 10 * 60_000;
    await r.provavel('Caldeirão', 'RJ');
    expect(consultas).toHaveLength(2);
  });

  it('sem a configuração do Postgres, devolve vazio e o app segue sem a sugestão do histórico', async () => {
    const r = criarRedatorProvavel({});
    expect(r.ligado).toBe(false);
    const { s, pedir } = await servir(r);
    try {
      expect(await pedir('?atracao=Caldeir%C3%A3o&praca=RJ')).toEqual({ redator: null });
    } finally {
      s.close();
    }
  });

  it('o banco fora do ar também devolve vazio', async () => {
    const r = criarRedatorProvavel(ENV, { consultar: async () => { throw new Error('fora do ar'); } });
    expect(await r.provavel('Caldeirão', 'RJ')).toBeNull();
  });
});
