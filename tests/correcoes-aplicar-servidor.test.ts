// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* Aplicar e desfazer a correção de grafia da pauta da edição (#115) pela API, com o Teable de mentira: o administrador
   marca as propostas e aplica; o PROMeiro confere a hora da última mudança da linha, grava a claquete no padrão pela
   API do Teable (só na base do PROMeiro), guarda no SQLite o que era e o que ficou, e desfaz depois, com a mesma
   conferência. Só administradores. Nomes e claquetes fictícios. */

const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const NOMES = { EDICAO_producao: 'pauta_pg' };
const ANTES = '2026-11-24T12:00:00.000Z';

type Linha = { id: string; fields: Record<string, unknown>; lastModifiedTime: string | null };
/** Uma linha da pauta: a claquete, o editor e o dia (AAAA-MM-DD, em São Paulo), mudada pela última vez em ANTES. */
function linha(id: string, claquete: string, editor: string | null, dia: string, extra: Record<string, unknown> = {}): Linha {
  const meiaNoite = new Date(`${dia}T00:00:00-03:00`).toISOString();
  return {
    id,
    lastModifiedTime: ANTES,
    fields: {
      claquete,
      key: claquete.toUpperCase(),
      editor: editor ? { id: `rec${editor.replace(/\W/g, '')}`, title: editor } : null,
      data: meiaNoite,
      expediente_inicio: meiaNoite,
      expediente_fim: null,
      anotacao: null,
      alterado_em: ANTES,
      ...extra,
    },
  };
}

const PAUTA = () => [
  linha('recC1', 'Show da Tarde 4/12 Dp', 'Beto Tarde', '2026-11-27'),
  linha('recC2', 'Festival 3/1 (DIA)', 'Ana Manhã', '2025-12-20'),
  linha('recC3', 'Novela Sol 28/11 H', null, '2026-11-27'),
  linha('recC4', 'Festa 3/1 (MÊS)', 'Ana Manhã', '2025-12-20'),
  linha('recOk1', 'Novela Sol 28/11 (AH)', 'Ana Manhã', '2026-11-27'),
];

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function comServidor({ env = ENV, opcoes = {}, db = abrirBanco(':memory:') }: { env?: Record<string, string>; opcoes?: Record<string, unknown>; db?: unknown } = {}) {
  const pauta = PAUTA();
  const teable = teableFalso(NOMES, { registros: { EDICAO_producao: pauta }, ...opcoes });
  const app = criarApp({ db, env, buscarNoTeable: teable, abrirPg: teable.abrirPg });
  await app.tabelasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, corpo?: unknown) =>
    fetch(base + caminho, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: { ...(email ? { 'cf-access-authenticated-user-email': email } : {}), ...(corpo === undefined ? {} : { 'content-type': 'application/json' }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  const da = (id: string) => pauta.find((l) => l.id === id)!;
  return { teable, pauta, da, ana: como('ana@empresa.com'), chefe: como('chefe@empresa.com'), ninguem: como('') };
}

type Proposta = { id: string; de: string; para?: string; mudouEm: string | null; esperaAKey?: boolean };
type Pagina = { propostas: Proposta[]; escrita: { pode: boolean; aviso?: string } };
type Aplicacao = { certas: { id: string; registro: string; de: string; para: string }[]; falhas: { id: string; motivo: string; texto: string }[] };
type Registro = { total: number; itens: { id: string; tipo: string; alvo: string; antes: { claquete: string }; depois: { claquete: string }; detalhes: { dia: string; editor: string }; por: string; porNome: string; em: string; desfeita: { por: string; em: string } | null }[] };

const ler = async <T,>(r: Response, status = 200) => {
  expect(r.status).toBe(status);
  return (await r.json()) as T;
};
/** As propostas de agora, como a tela leu (com a hora da última mudança de cada linha). */
async function propostas(chefe: (c: string, corpo?: unknown) => Promise<Response>) {
  return ler<Pagina>(await chefe('/api/correcoes/pauta'));
}
const marcadas = (p: Pagina, ids: string[]) => p.propostas.filter((x) => ids.includes(x.id)).map(({ id, de, mudouEm }) => ({ id, de, mudouEm }));
const gravacoes = (teable: { estado: { pedidos: string[] } }) => teable.estado.pedidos.filter((x) => x.startsWith('PATCH '));

describe('aplicar as marcadas', () => {
  it('grava só as marcadas no Teable, com a claquete no padrão, e diz quantas deram certo', async () => {
    const { chefe, teable, da } = await comServidor();
    const p = await propostas(chefe);
    expect(p.escrita).toEqual({ pode: true });
    expect(p.propostas.find((x) => x.id === 'recC1')?.mudouEm).toBe(ANTES);
    const r = await ler<Aplicacao>(await chefe('/api/correcoes/pauta/aplicar', { propostas: marcadas(p, ['recC1', 'recC2']) }));
    expect(r.falhas).toEqual([]);
    expect(r.certas.map(({ id, de, para }) => ({ id, de, para }))).toEqual([
      { id: 'recC1', de: 'Show da Tarde 4/12 Dp', para: 'Show da Tarde 4/12 (DP)' },
      { id: 'recC2', de: 'Festival 3/1 (DIA)', para: 'Festival 3/1 (D)' },
    ]);
    expect(da('recC1').fields.claquete).toBe('Show da Tarde 4/12 (DP)');
    expect(da('recC2').fields.claquete).toBe('Festival 3/1 (D)');
    // a que não foi marcada fica como está; só a claquete muda (o alterado_em da publicação também fica)
    expect(da('recC3').fields.claquete).toBe('Novela Sol 28/11 H');
    expect(da('recC1').fields.alterado_em).toBe(ANTES);
    expect(gravacoes(teable)).toEqual(['PATCH /api/table/tblFalso_bseFalso_EDICAO_producao/record/recC1', 'PATCH /api/table/tblFalso_bseFalso_EDICAO_producao/record/recC2']);
    // aplicada, a proposta sai da lista
    expect((await propostas(chefe)).propostas.map((x) => x.id).sort()).toEqual(['recC3', 'recC4']);
  });

  it('a claquete gravada é a da regra, não a que o pedido manda', async () => {
    const { chefe, da } = await comServidor();
    const r = await ler<Aplicacao>(await chefe('/api/correcoes/pauta/aplicar', { propostas: [{ id: 'recC1', de: 'Show da Tarde 4/12 Dp', mudouEm: ANTES, para: 'OUTRA COISA' }] }));
    expect(r.certas).toHaveLength(1);
    expect(da('recC1').fields.claquete).toBe('Show da Tarde 4/12 (DP)');
  });

  it('a linha que mudou depois da proposta não é gravada e volta como "mudou desde a proposta"', async () => {
    const { chefe, da, teable } = await comServidor();
    const p = await propostas(chefe);
    // alguém mexeu no editor de uma (a claquete é a mesma) e na claquete de outra, no Teable, depois da tela ler
    Object.assign(da('recC1'), { lastModifiedTime: '2026-11-27T10:00:00.000Z' });
    da('recC1').fields.editor = { id: 'recCarla', title: 'Carla Noite' };
    da('recC3').fields.claquete = 'Novela Sol 29/11 H';
    const r = await ler<Aplicacao>(await chefe('/api/correcoes/pauta/aplicar', { propostas: marcadas(p, ['recC1', 'recC2', 'recC3']) }));
    expect(r.certas.map((c) => c.id)).toEqual(['recC2']);
    expect(r.falhas.map(({ id, motivo }) => ({ id, motivo }))).toEqual([
      { id: 'recC1', motivo: 'mudou' },
      { id: 'recC3', motivo: 'mudou' },
    ]);
    expect(r.falhas[0].texto).toMatch(/mudou desde a proposta/);
    expect(da('recC1').fields.claquete).toBe('Show da Tarde 4/12 Dp');
    expect(da('recC3').fields.claquete).toBe('Novela Sol 29/11 H');
    expect(gravacoes(teable)).toEqual(['PATCH /api/table/tblFalso_bseFalso_EDICAO_producao/record/recC2']);
  });

  it('a linha apagada no Teable volta como falha; o Teable fora do ar também', async () => {
    const { chefe, pauta, teable } = await comServidor();
    const p = await propostas(chefe);
    pauta.splice(
      pauta.findIndex((l) => l.id === 'recC1'),
      1,
    );
    const r = await ler<Aplicacao>(await chefe('/api/correcoes/pauta/aplicar', { propostas: marcadas(p, ['recC1']) }));
    expect(r.falhas.map((f) => f.motivo)).toEqual(['sumiu']);
    teable.estado.fora = true;
    const fora = await ler<Aplicacao>(await chefe('/api/correcoes/pauta/aplicar', { propostas: marcadas(p, ['recC2']) }));
    expect(fora.falhas.map((f) => f.motivo)).toEqual(['erro']);
    expect(fora.certas).toEqual([]);
  });

  it('o (M) espera a fórmula nova da key do Teable: a proposta vem marcada e não é gravada', async () => {
    const { chefe, da } = await comServidor();
    const p = await propostas(chefe);
    expect(p.propostas.find((x) => x.id === 'recC4')).toMatchObject({ para: 'Festa 3/1 (M)', esperaAKey: true });
    expect(p.propostas.find((x) => x.id === 'recC1')?.esperaAKey).toBeUndefined();
    const r = await ler<Aplicacao>(await chefe('/api/correcoes/pauta/aplicar', { propostas: marcadas(p, ['recC4']) }));
    expect(r.falhas.map((f) => f.motivo)).toEqual(['key']);
    expect(da('recC4').fields.claquete).toBe('Festa 3/1 (MÊS)');
  });

  it('o pedido sem propostas, ou com mais de 100, é recusado', async () => {
    const { chefe } = await comServidor();
    expect((await chefe('/api/correcoes/pauta/aplicar', { propostas: [] })).status).toBe(400);
    expect((await chefe('/api/correcoes/pauta/aplicar', { propostas: Array.from({ length: 101 }, (_, i) => ({ id: `rec${i}`, de: 'x', mudouEm: null })) })).status).toBe(400);
    expect((await chefe('/api/correcoes/pauta/aplicar', { propostas: [{ id: '../x', de: 'x' }] })).status).toBe(400);
  });
});

describe('o registro e o desfazer', () => {
  it('cada correção aplicada fica registrada: o que era, o que ficou, quem aplicou e quando', async () => {
    const { chefe } = await comServidor();
    const p = await propostas(chefe);
    await chefe('/api/correcoes/pauta/aplicar', { propostas: marcadas(p, ['recC1', 'recC3']) });
    const reg = await ler<Registro>(await chefe('/api/correcoes/registro'));
    expect(reg.total).toBe(2);
    expect(reg.itens.map(({ tipo, alvo, antes, depois, detalhes, por, desfeita }) => ({ tipo, alvo, de: antes.claquete, para: depois.claquete, detalhes, por, desfeita })).sort((a, b) => a.alvo.localeCompare(b.alvo))).toEqual([
      { tipo: 'pauta', alvo: 'recC1', de: 'Show da Tarde 4/12 Dp', para: 'Show da Tarde 4/12 (DP)', detalhes: { dia: '2026-11-27', editor: 'Beto Tarde' }, por: 'chefe@empresa.com', desfeita: null },
      { tipo: 'pauta', alvo: 'recC3', de: 'Novela Sol 28/11 H', para: 'Novela Sol 28/11 (H)', detalhes: { dia: '2026-11-27', editor: '' }, por: 'chefe@empresa.com', desfeita: null },
    ]);
    expect(Date.now() - Date.parse(reg.itens[0].em)).toBeLessThan(60_000);
  });

  it('o registro fica no SQLite: vale depois de reiniciar', async () => {
    const db = abrirBanco(':memory:');
    const um = await comServidor({ db });
    await um.chefe('/api/correcoes/pauta/aplicar', { propostas: marcadas(await propostas(um.chefe), ['recC1']) });
    await parar?.();
    const dois = await comServidor({ db });
    expect((await ler<Registro>(await dois.chefe('/api/correcoes/registro'))).itens.map((i) => i.alvo)).toEqual(['recC1']);
  });

  it('desfazer grava o valor antigo de volta e marca a correção como desfeita', async () => {
    const { chefe, da } = await comServidor();
    const r = await ler<Aplicacao>(await chefe('/api/correcoes/pauta/aplicar', { propostas: marcadas(await propostas(chefe), ['recC1', 'recC2']) }));
    const d = await ler<{ certas: string[]; falhas: unknown[] }>(await chefe('/api/correcoes/desfazer', { ids: r.certas.map((c) => c.registro) }));
    expect(d).toEqual({ certas: r.certas.map((c) => c.registro), falhas: [] });
    expect(da('recC1').fields.claquete).toBe('Show da Tarde 4/12 Dp');
    expect(da('recC2').fields.claquete).toBe('Festival 3/1 (DIA)');
    const reg = await ler<Registro>(await chefe('/api/correcoes/registro'));
    expect(reg.itens.every((i) => i.desfeita?.por === 'chefe@empresa.com')).toBe(true);
    // desfeita, a proposta volta para a lista; desfazer de novo não grava nada
    expect((await propostas(chefe)).propostas.map((x) => x.id)).toContain('recC1');
    const outra = await ler<{ certas: string[]; falhas: { motivo: string }[] }>(await chefe('/api/correcoes/desfazer', { ids: [r.certas[0].registro] }));
    expect(outra.falhas.map((f) => f.motivo)).toEqual(['desfeita']);
  });

  it('a linha que mudou depois da correção não é desfeita: volta como "mudou desde então"', async () => {
    const { chefe, da, teable } = await comServidor();
    const r = await ler<Aplicacao>(await chefe('/api/correcoes/pauta/aplicar', { propostas: marcadas(await propostas(chefe), ['recC1', 'recC2']) }));
    // alguém mudou a claquete de uma, e o turno da outra, no Teable
    da('recC1').fields.claquete = 'Show da Tarde 5/12 (DP)';
    Object.assign(da('recC2'), { lastModifiedTime: new Date(Date.now() + 60_000).toISOString() });
    const antes = gravacoes(teable).length;
    const d = await ler<{ certas: string[]; falhas: { id: string; motivo: string; texto: string }[] }>(await chefe('/api/correcoes/desfazer', { ids: r.certas.map((c) => c.registro) }));
    expect(d.certas).toEqual([]);
    expect(d.falhas.map((f) => f.motivo)).toEqual(['mudou', 'mudou']);
    expect(d.falhas[0].texto).toMatch(/mudou desde então/);
    expect(gravacoes(teable).length).toBe(antes);
    expect(da('recC1').fields.claquete).toBe('Show da Tarde 5/12 (DP)');
    expect((await ler<Registro>(await chefe('/api/correcoes/registro'))).itens.every((i) => i.desfeita === null)).toBe(true);
  });

  it('a correção que não existe vem como falha', async () => {
    const { chefe } = await comServidor();
    const d = await ler<{ falhas: { motivo: string }[] }>(await chefe('/api/correcoes/desfazer', { ids: ['nao-existe'] }));
    expect(d.falhas.map((f) => f.motivo)).toEqual(['nao-existe']);
  });
});

describe('só na base do PROMeiro', () => {
  it('a tabela da pauta de outra base: a tela só mostra as propostas, com o aviso, e nada é gravado', async () => {
    const { chefe, teable, da } = await comServidor({ opcoes: { esquemas: { EDICAO_producao: 'bseOutra' } } });
    const p = await propostas(chefe);
    expect(p.propostas.length).toBeGreaterThan(0);
    expect(p.escrita.pode).toBe(false);
    expect(p.escrita.aviso).toMatch(/não está na base do PROMeiro/);
    const r = await chefe('/api/correcoes/pauta/aplicar', { propostas: marcadas(p, ['recC1']) });
    expect(r.status).toBe(409);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/não está na base do PROMeiro/);
    expect(gravacoes(teable)).toEqual([]);
    expect(da('recC1').fields.claquete).toBe('Show da Tarde 4/12 Dp');
  });
});

describe('só administradores', () => {
  it('quem não é administrador não aplica, não vê o registro e não desfaz', async () => {
    const { ana, ninguem, chefe, teable } = await comServidor();
    const p = await propostas(chefe);
    expect((await ana('/api/correcoes/pauta/aplicar', { propostas: marcadas(p, ['recC1']) })).status).toBe(403);
    expect((await ana('/api/correcoes/registro')).status).toBe(403);
    expect((await ana('/api/correcoes/desfazer', { ids: ['x'] })).status).toBe(403);
    expect((await ninguem('/api/correcoes/pauta/aplicar', { propostas: marcadas(p, ['recC1']) })).status).toBe(401);
    expect(gravacoes(teable)).toEqual([]);
  });
});
