// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* A correção de grafia da pauta da edição (#114) pela API, só leitura: a pauta inteira da tabela EDICAO_producao do
   Teable de mentira (achada pelo nome; o Postgres dele responde as linhas inteiras, sem olhar o WHERE nem a página),
   as propostas "de → para" em páginas e os códigos que a pauta não reconhece, à parte. Só administradores. Nada é
   gravado no Teable. Nomes e claquetes fictícios. */

const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const NOMES = { EDICAO_producao: 'pauta_pg' };

/** Uma linha da pauta: a claquete, o editor e o dia (AAAA-MM-DD, em São Paulo). */
function linha(id: string, claquete: string, editor: string | null, dia: string, extra: Record<string, unknown> = {}) {
  const meiaNoite = new Date(`${dia}T00:00:00-03:00`).toISOString();
  return {
    id,
    fields: {
      claquete,
      key: claquete.toUpperCase(),
      editor: editor ? { id: `rec${editor.replace(/\W/g, '')}`, title: editor } : null,
      data: meiaNoite,
      expediente_inicio: meiaNoite,
      expediente_fim: null,
      anotacao: null,
      alterado_em: '2026-11-24T12:00:00.000Z',
      ...extra,
    },
  };
}

const PAUTA = () => [
  linha('recC1', 'Show da Tarde 4/12 Dp', 'Beto Tarde', '2026-11-27'),
  linha('recC2', 'Festival 3/1 (MÊS)', 'Ana Manhã', '2025-12-20'),
  linha('recC3', 'Novela Sol 28/11 H', null, '2026-11-27'),
  // já no padrão, sem código, a praça no fim: nada a corrigir
  linha('recOk1', 'Novela Sol 28/11 (AH)', 'Ana Manhã', '2026-11-27'),
  linha('recOk2', 'Grade da Noite 28/11 (MNT)', 'Carla Noite', '2026-11-27'),
  linha('recOk3', 'Quem Ama 20/11 SP', 'Carla Noite', '2026-11-19'),
  linha('recOk4', 'COMUNICAÇÃO', 'Carla Noite', '2026-11-19'),
  // os códigos desconhecidos
  linha('recX1', 'Show Extra 28/11 (XYZ)', 'Beto Tarde', '2026-11-27'),
  // a tarefa e o aviso não ganham código desconhecido; o aviso é um recado, nem é corrigido
  linha('recT1', 'CALHAUS (VER LISTA)', null, '2026-11-27'),
  linha('recT2', 'TROCAR A GRADE (ah)', 'Carla Noite', '2026-11-27', { anotacao: true }),
];

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function comServidor({ env = ENV, registros = { EDICAO_producao: PAUTA() } }: { env?: Record<string, string>; registros?: Record<string, unknown[]> } = {}) {
  const teable = teableFalso(NOMES, { registros });
  const app = criarApp({ db: abrirBanco(':memory:'), env, buscarNoTeable: teable, abrirPg: teable.abrirPg });
  await app.tabelasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: email ? { 'cf-access-authenticated-user-email': email } : {} });
  return { teable, ana: como('ana@empresa.com'), chefe: como('chefe@empresa.com'), ninguem: como('') };
}

type Proposta = { id: string; dia: string; editor: string; de: string; para?: string; codigo?: string };
type Pagina = { grupo: string; pagina: number; porPagina: number; resumo: { corrigir: number; naoReconhecido: number }; propostas: Proposta[] };
const pagina = async (r: Response) => {
  expect(r.status).toBe(200);
  return (await r.json()) as Pagina;
};

describe('as propostas da pauta da edição', () => {
  it('cada claquete fora do padrão vem "de → para", com o dia e o editor da linha', async () => {
    const { chefe } = await comServidor();
    const p = await pagina(await chefe('/api/correcoes/pauta'));
    expect(p.grupo).toBe('corrigir');
    expect([...p.propostas].sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'recC1', dia: '2026-11-27', editor: 'Beto Tarde', de: 'Show da Tarde 4/12 Dp', para: 'Show da Tarde 4/12 (DP)' },
      { id: 'recC2', dia: '2025-12-20', editor: 'Ana Manhã', de: 'Festival 3/1 (MÊS)', para: 'Festival 3/1 (M)' },
      { id: 'recC3', dia: '2026-11-27', editor: '', de: 'Novela Sol 28/11 H', para: 'Novela Sol 28/11 (H)' },
    ]);
  });

  it('os códigos desconhecidos vêm num grupo à parte, sem correção, só da claquete (não da tarefa nem do aviso)', async () => {
    const { chefe } = await comServidor();
    const p = await pagina(await chefe('/api/correcoes/pauta?grupo=nao-reconhecido'));
    expect(p.grupo).toBe('nao-reconhecido');
    expect(p.propostas).toEqual([{ id: 'recX1', dia: '2026-11-27', editor: 'Beto Tarde', de: 'Show Extra 28/11 (XYZ)', codigo: 'XYZ' }]);
  });

  it('o resumo diz quantas propostas há em cada grupo; o aviso não é corrigido', async () => {
    const { chefe } = await comServidor();
    const p = await pagina(await chefe('/api/correcoes/pauta'));
    expect(p.resumo).toEqual({ corrigir: 3, naoReconhecido: 1 });
    expect(p.propostas.some((x) => x.id === 'recT2')).toBe(false);
  });

  it('lê a pauta inteira do Postgres do Teable, só leitura, e pede a página ao banco', async () => {
    const { chefe, teable } = await comServidor();
    await pagina(await chefe('/api/correcoes/pauta?grupo=nao-reconhecido&pagina=3'));
    const daPauta = teable.estado.consultas.map((sql: string, i: number) => ({ sql, params: teable.estado.parametros[i] })).filter((c: { sql: string }) => c.sql.includes('"bseFalso"."pauta_pg"') && c.sql.includes('grupo'));
    expect(daPauta.length).toBeGreaterThanOrEqual(2);
    for (const c of daPauta) {
      expect(c.sql).toMatch(/^\s*WITH\b[\s\S]*\bSELECT\b/);
      expect(c.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i);
      // a pauta inteira: nenhum recorte de dias
      expect(c.sql).not.toMatch(/CURRENT_DATE/);
    }
    // a página 3 do grupo, com 50 por página
    expect(daPauta.some((c: { params: unknown[] }) => JSON.stringify(c.params) === JSON.stringify(['nao-reconhecido', 50, 100]))).toBe(true);
    // nada vai à API do Teable para gravar
    expect(teable.estado.pedidos.filter((p: string) => !p.startsWith('GET '))).toEqual([]);
  });

  it('a página que não é número vale a primeira; o grupo desconhecido vale o de corrigir', async () => {
    const { chefe } = await comServidor();
    const p = await pagina(await chefe('/api/correcoes/pauta?grupo=tudo&pagina=abc'));
    expect(p).toMatchObject({ grupo: 'corrigir', pagina: 1, porPagina: 50 });
  });
});

describe('só administradores', () => {
  it('quem não é administrador recebe 403; quem não entrou, 401; e o Postgres nem é consultado', async () => {
    const { ana, ninguem, teable } = await comServidor();
    const r = await ana('/api/correcoes/pauta');
    expect(r.status).toBe(403);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/administradores/);
    expect((await ninguem('/api/correcoes/pauta')).status).toBe(401);
    expect(teable.estado.consultas.some((sql: string) => sql.includes('grupo'))).toBe(false);
  });

  it('só se lê: outro método não vale', async () => {
    const { chefe } = await comServidor();
    expect((await chefe('/api/correcoes/pauta', { method: 'POST' })).status).toBe(405);
  });
});

describe('sem o Postgres do Teable', () => {
  it('sem ele ligado, a tela fica sabendo por quê', async () => {
    const { chefe } = await comServidor({ env: { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_ESQUEMA: 'bseFalso' } });
    const r = await chefe('/api/correcoes/pauta');
    expect(r.status).toBe(503);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/Postgres do Teable/);
  });

  it('com ele fora do ar, diz que não respondeu', async () => {
    const { chefe, teable } = await comServidor();
    teable.estado.fora = true;
    const r = await chefe('/api/correcoes/pauta');
    expect(r.status).toBe(503);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/não respondeu/);
  });
});
