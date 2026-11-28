// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';

/* Os caminhos da arte (#202) pela API: a Produção ligada ao registro do projeto do Padeiro (a tabela `projetos`, #144)
   pelo card. A Pauta (Semana e Dia) e o card aberto de Produções trazem a pasta de saída e o projeto, em Windows e Mac,
   do registro mais novo de cada caminho; sem projeto, nada. O Teable e o Trello são de mentira; servidores, volumes,
   pastas, cards e e-mails inventados. */

const DIA = 86_400_000;
const ha = (n: number) => new Date(Date.now() - n * DIA).toISOString();
const card = (n: number) => `ca11ed${String(n).padStart(18, '0')}`;
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg', atracoes: 'atracoes_pg', EDICAO_producao: 'pauta_pg', projetos: 'projetos_pg' };
const ENV = { ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso', TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso-do-trello' };
const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const arte = () => [
  registro('recArte1', { card_ID: card(1), claquete: 'Festa da Vila 20/12', status: '["PRODUZINDO"]', designers: '["Ana Souza"]', artes: 'HOJE', data_entrada: ha(2) }),
  registro('recArte2', { card_ID: card(2), claquete: 'Cozinha de Vó 20/12', status: '["PRODUZINDO"]', designers: null, artes: 'HOJE', data_entrada: ha(1) }),
];
const naPauta = (id: string, claquete: string) =>
  registro(id, { claquete, key: claquete.toUpperCase(), editor: { id: 'recEdEva', title: 'Eva Manhã' }, data: new Date(`${HOJE}T00:00:00-03:00`).toISOString(), expediente_inicio: new Date(`${HOJE}T06:00:00-03:00`).toISOString(), expediente_fim: new Date(`${HOJE}T15:00:00-03:00`).toISOString(), anotacao: null, alterado_em: ha(0) });
/** O registro do projeto como o projeto do Padeiro grava (linhaDoProjeto). */
const projeto = (id: string, fields: Record<string, unknown>) => registro(id, { atracao: 'FESTA DA VILA', tipo: 'SHOWS', designer_login: 'ana.souza', momento: 'criado', versao: '2.0', ...fields });
const projetos = () => [
  // o primeiro, criado no Windows, com a pasta de saída
  projeto('recPj1', { card_ID: card(1), aep: '\\\\servidor-falso\\ARTE\\SHOWS\\FESTA DA VILA\\01_PROJETOS\\FESTA DA VILA V1.aep', output: '\\\\servidor-falso\\SAIDA\\SHOWS\\FESTA DA VILA', data: ha(3) }),
  // o mais novo, aberto no Mac (sem a pasta de saída, com o volume montado de novo)
  projeto('recPj2', { card_ID: card(1), aep: '/Volumes/ARTE-1/SHOWS/FESTA DA VILA/01_PROJETOS/FESTA DA VILA V2.aep', momento: 'aberto', data: ha(1) }),
  // de outro card que não é Produção
  projeto('recPj3', { card_ID: card(9), aep: '\\\\servidor-falso\\ARTE\\OUTRA\\OUTRA.aep', data: ha(1) }),
];

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function preparado({ comProjetos = true, fora = false } = {}) {
  const db = abrirBanco(':memory:');
  const { projetos: _semEla, ...semProjetos } = NOMES;
  const teable = teableFalso(comProjetos ? NOMES : semProjetos, {
    registros: { ARTE_producao: arte(), exibicoes: [], designers: [], atracoes: [], EDICAO_producao: [naPauta('recPtFesta', 'Festa da Vila 20/12'), naPauta('recPtCozinha', 'Cozinha de Vó 20/12')], projetos: projetos() },
  });
  const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, trello: (env: unknown, deps: Record<string, unknown>) => criarTrello(env, { ...deps, buscar: async () => Response.json({}) }) });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  await app.tabelasProntas;
  await app.releituraPronta;
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const ler = async (caminho: string) => (await fetch(base + caminho, { headers: { 'cf-access-authenticated-user-email': 'davi@empresa.com' } })).json();
  const idDe = (claquete: string) => (db.prepare('SELECT id FROM producoes WHERE claquete = ?').get(claquete) as { id: string }).id;
  if (fora) teable.estado.fora = true;
  return { ler, idDe, teable };
}

const DA_FESTA = {
  projeto: { win: '\\\\servidor-falso\\ARTE\\SHOWS\\FESTA DA VILA\\01_PROJETOS\\FESTA DA VILA V2.aep', mac: '/Volumes/ARTE/SHOWS/FESTA DA VILA/01_PROJETOS/FESTA DA VILA V2.aep' },
  saida: { win: '\\\\servidor-falso\\SAIDA\\SHOWS\\FESTA DA VILA', mac: '/Volumes/SAIDA/SHOWS/FESTA DA VILA' },
};

type Producao = { id: string; caminhos?: unknown };
type Linha = { id: string; producoes?: Producao[] };

describe('os caminhos da arte (#202)', () => {
  it('na Pauta (Semana e Dia): a Produção com projeto do Padeiro traz a pasta de saída e o projeto, pelo card; a sem projeto, nada', async () => {
    const { ler, idDe } = await preparado();
    for (const caminho of [`/api/pauta/dia?dia=${HOJE}`, `/api/pauta/semana?inicio=${HOJE}`]) {
      const { linhas } = (await ler(caminho)) as { linhas: Linha[] };
      const festa = linhas.find((l) => l.id === 'recPtFesta')!.producoes!;
      expect(festa, caminho).toEqual([expect.objectContaining({ id: idDe('Festa da Vila 20/12'), caminhos: DA_FESTA })]);
      const cozinha = linhas.find((l) => l.id === 'recPtCozinha')!.producoes!;
      expect(cozinha[0], caminho).not.toHaveProperty('caminhos');
    }
  });

  it('no card aberto de Produções: os mesmos caminhos; sem projeto, nada', async () => {
    const { ler, idDe } = await preparado();
    expect(((await ler(`/api/producoes/aberta?producao=${idDe('Festa da Vila 20/12')}`)) as Producao).caminhos).toEqual(DA_FESTA);
    expect(await ler(`/api/producoes/aberta?producao=${idDe('Cozinha de Vó 20/12')}`)).not.toHaveProperty('caminhos');
  });

  it('o registro é lido pelo card das Produções, no Postgres do Teable (só leitura)', async () => {
    const { ler, idDe, teable } = await preparado();
    await ler(`/api/producoes/aberta?producao=${idDe('Festa da Vila 20/12')}`);
    const i = teable.estado.consultas.findIndex((s: string) => /FROM "bseFalso"\."projetos_pg" WHERE "card_ID" = ANY/.test(s));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(teable.estado.parametros[i]).toEqual([[card(1)]]);
    expect(teable.estado.pedidos.filter((p: string) => !p.startsWith('GET'))).toEqual([]);
  });

  it('sem a tabela de projetos, ou com o Postgres fora do ar, a Pauta e o card aberto vêm sem caminhos (e não quebram)', async () => {
    const sem = await preparado({ comProjetos: false });
    const aberta = await sem.ler(`/api/producoes/aberta?producao=${sem.idDe('Festa da Vila 20/12')}`);
    expect(aberta).not.toHaveProperty('caminhos');
    expect(aberta).toHaveProperty('eventos');
    await parar?.();
    parar = null;
    const fora = await preparado({ fora: true });
    const r = await fora.ler(`/api/producoes/aberta?producao=${fora.idDe('Festa da Vila 20/12')}`);
    expect(r).toHaveProperty('eventos');
    expect(r).not.toHaveProperty('caminhos');
  });
});
