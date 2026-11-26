// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { GITHUB_FALSO, githubFalso, pomar } from './fixtures/github-falso.mjs';

/* A rota do Andamento (#92), pela API, com um GitHub de mentira: só administradores; lê as specs, as sub-issues e os
   commits com o token (só leitura) e guarda a resposta por alguns minutos ("ler de novo" vai ao GitHub); sem token, diz
   o que falta; com o GitHub fora, mostra a última leitura guardada no SQLite (também depois de reiniciar). */

const CHEFE = 'chefe@empresa.com';
const ANA = 'ana@empresa.com';

type Resposta = {
  etapas: { etapa: string; situacao: string }[];
  andamento: { frentes: { spec: number; nome: string; feitos: number; total: number; situacao: string; tickets: { numero: number; situacao: string }[] }[]; avulsos: { numero: number; situacao: string }[]; resumo: { feitos: number; total: number } } | null;
  lidoEm: string | null;
  falta: string[];
  foraDoAr: { motivo: string; desde: string } | null;
  repo: string;
};

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

async function comServidor({ db = abrirBanco(':memory:'), env = { ...GITHUB_FALSO } as Record<string, string>, github = githubFalso() } = {}) {
  const abrirPg = async () => ({ query: async () => ({ rows: [] }), end: async () => {} });
  const app = criarApp({ db, env: { CADASTRO_ADMINS: CHEFE, ...env }, abrirPg, buscarNoGitHub: github });
  await app.tabelasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  fechar = async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await app.fechar();
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => async (caminho = '/api/andamento-do-projeto') => fetch(base + caminho, { headers: { 'cf-access-authenticated-user-email': email } });
  const ler = async (caminho?: string) => {
    const r = await como(CHEFE)(caminho);
    expect(r.status).toBe(200);
    return (await r.json()) as Resposta;
  };
  return { db, github, ler, ana: como(ANA) };
}

describe('a rota do Andamento', () => {
  it('só administradores: quem não é recebe 403 e o GitHub nem é lido', async () => {
    const { ana, github } = await comServidor();
    const r = await ana();
    expect(r.status).toBe(403);
    expect(github.estado.pedidos).toEqual([]);
  });

  it('com o token: as frentes das specs da lista e das novas, os avulsos e a trilha; o token não volta', async () => {
    const { ler } = await comServidor();
    const r = await ler();
    expect(r.falta).toEqual([]);
    expect(r.foraDoAr).toBeNull();
    expect(Date.parse(r.lidoEm!)).not.toBeNaN();
    expect(r.repo).toBe('exemplo/pomar');
    expect(r.etapas.map((e) => e.etapa)[0]).toBe('Espelho');
    // a ordem da lista fixa, e depois a spec nova (93); a antiga (33) não entra
    expect(r.andamento!.frentes.map((f) => [f.spec, f.feitos, f.total, f.situacao])).toEqual([
      [56, 2, 2, 'concluída'],
      [64, 2, 3, 'em andamento'],
      [69, 1, 2, 'em andamento'],
      [55, 0, 1, 'planejada'],
      [85, 0, 2, 'planejada'],
      [93, 0, 1, 'planejada'],
    ]);
    expect(r.andamento!.frentes.at(-1)!.nome).toBe('Pomar novo');
    expect(r.andamento!.frentes[1].tickets.map((t) => t.situacao)).toEqual(['fechada', 'pronta no código', 'aberta']);
    expect(r.andamento!.avulsos).toEqual([expect.objectContaining({ numero: 92, situacao: 'pronta no código' })]);
    expect(JSON.stringify(r)).not.toContain(GITHUB_FALSO.GITHUB_TOKEN);
  });

  it('guarda a resposta por alguns minutos; "ler de novo" vai ao GitHub', async () => {
    const { ler, github } = await comServidor();
    const primeira = await ler();
    const pedidos = github.estado.pedidos.length;
    expect(pedidos).toBeGreaterThan(0);
    const segunda = await ler();
    expect(github.estado.pedidos.length).toBe(pedidos);
    expect(segunda.lidoEm).toBe(primeira.lidoEm);
    await new Promise((ok) => setTimeout(ok, 5));
    const deNovo = await ler('/api/andamento-do-projeto?deNovo=1');
    expect(github.estado.pedidos.length).toBe(pedidos * 2);
    expect(Date.parse(deNovo.lidoEm!)).toBeGreaterThan(Date.parse(primeira.lidoEm!));
  });

  it('com a branch configurada, os commits vêm dela', async () => {
    const { ler, github } = await comServidor({ env: { ...GITHUB_FALSO, GITHUB_BRANCH: 'desenvolvimento' } });
    await ler();
    expect(github.estado.pedidos.filter((p: string) => p.includes('/commits')).every((p: string) => p.includes('sha=desenvolvimento'))).toBe(true);
  });

  it('sem token: diz o que falta e não vai ao GitHub', async () => {
    const { ler, github } = await comServidor({ env: { GITHUB_REPO: 'exemplo/pomar' } });
    const r = await ler();
    expect(r.falta).toEqual(['GITHUB_TOKEN']);
    expect(r.andamento).toBeNull();
    expect(github.estado.pedidos).toEqual([]);
    const sem = await comServidor({ env: {} });
    expect((await sem.ler()).falta).toEqual(['GITHUB_TOKEN', 'GITHUB_REPO']);
  });

  it('com o GitHub fora: a última leitura guardada no SQLite, com desde quando, também depois de reiniciar', async () => {
    const primeiro = await comServidor();
    const boa = await primeiro.ler();
    await fechar?.();
    fechar = null;

    const github = githubFalso();
    github.estado.fora = true;
    const { ler } = await comServidor({ db: primeiro.db, github });
    const r = await ler();
    expect(r.foraDoAr).toMatchObject({ motivo: expect.stringContaining('503') });
    expect(Date.parse(r.foraDoAr!.desde)).not.toBeNaN();
    expect(r.lidoEm).toBe(boa.lidoEm);
    expect(r.andamento).toEqual(boa.andamento);

    // voltou: "ler de novo" lê de novo e o aviso some
    github.estado.fora = false;
    const volta = await ler('/api/andamento-do-projeto?deNovo=1');
    expect(volta.foraDoAr).toBeNull();
    expect(Date.parse(volta.lidoEm!)).toBeGreaterThan(Date.parse(boa.lidoEm!));
  });

  it('com o GitHub fora, a página aberta de novo logo depois não espera por ele outra vez ("ler de novo" tenta)', async () => {
    const github = githubFalso();
    github.estado.fora = true;
    const { ler } = await comServidor({ github });
    const primeira = await ler();
    expect(primeira.foraDoAr).not.toBeNull();
    const pedidos = github.estado.pedidos.length;
    const segunda = await ler();
    expect(segunda.foraDoAr).toEqual(primeira.foraDoAr);
    expect(github.estado.pedidos.length).toBe(pedidos);
    await ler('/api/andamento-do-projeto?deNovo=1');
    expect(github.estado.pedidos.length).toBeGreaterThan(pedidos);
  });

  it('sem token, a última leitura guardada continua aparecendo', async () => {
    const primeiro = await comServidor();
    const boa = await primeiro.ler();
    await fechar?.();
    fechar = null;
    const { ler } = await comServidor({ db: primeiro.db, env: { GITHUB_REPO: 'exemplo/pomar' } });
    const r = await ler();
    expect(r.falta).toEqual(['GITHUB_TOKEN']);
    expect(r.andamento).toEqual(boa.andamento);
    expect(r.lidoEm).toBe(boa.lidoEm);
  });

  it('o token recusado (401) é dito, sem o token na mensagem', async () => {
    const { ler } = await comServidor({ env: { ...GITHUB_FALSO, GITHUB_TOKEN: 'outro-token' } });
    const r = await ler();
    expect(r.foraDoAr?.motivo).toMatch(/401|token/i);
    expect(JSON.stringify(r)).not.toContain('outro-token');
  });

  it('a leitura guardada de outro repositório não vale', async () => {
    const primeiro = await comServidor();
    await primeiro.ler();
    await fechar?.();
    fechar = null;
    const github = githubFalso(pomar('exemplo/outro'), { repo: 'exemplo/outro' });
    github.estado.fora = true;
    const { ler } = await comServidor({ db: primeiro.db, env: { ...GITHUB_FALSO, GITHUB_REPO: 'exemplo/outro' }, github });
    const r = await ler();
    expect(r.andamento).toBeNull();
    expect(r.foraDoAr).not.toBeNull();
  });
});
