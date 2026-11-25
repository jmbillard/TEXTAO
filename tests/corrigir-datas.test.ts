// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { corrigirDatas, listarDatasErradas } from '../servidor/corrigir-datas.mjs';

/* Manutenção do #47: os roteiros importados antes da correção do "D-M-V" ("5-12-2" lido como 12/02) ficaram com a
   data errada no banco. O comando lista os errados e, com --aplicar, grava só esses. Tudo num banco temporário. */

type Db = { prepare: (sql: string) => { run: (...a: unknown[]) => unknown; get: (...a: unknown[]) => Record<string, unknown> | undefined; all: (...a: unknown[]) => Record<string, unknown>[] } };
type Item = { id: string; claquete: string; gravada: string; nova: string; claqueteNova: string; aviso: string };

const CRIADO = '2026-11-20T12:00:00.000Z';
let pasta = '';
let db: Db;

function roteiro(
  id: string,
  meta: { claquete: string; dataExibicao: string },
  o: { original?: string; envio?: string; importado?: { dataExibicao: string }; semVersao?: boolean; ydoc?: boolean } = {},
) {
  const m = { titulo: 'Teste', programa: '', ...meta };
  const doc = JSON.stringify({ type: 'doc', content: [] });
  db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'ana@exemplo.com', 'Ana', JSON.stringify(m), doc, CRIADO, CRIADO);
  if (!o.semVersao)
    db.prepare('INSERT INTO versoes (roteiro_id, n, criado_em, por_email, por_nome, motivo, meta, doc) VALUES (?, 1, ?, ?, ?, ?, ?, ?)').run(id, CRIADO, 'ana@exemplo.com', 'Ana', 'criação', JSON.stringify({ ...m, ...o.importado }), doc);
  if (o.original) db.prepare('INSERT INTO originais (roteiro_id, nome, tipo, dados, em) VALUES (?, ?, ?, ?, ?)').run(id, o.original, 'application/octet-stream', Buffer.from('x'), CRIADO);
  if (o.envio) db.prepare('INSERT INTO envios (roteiro_id, estado, em) VALUES (?, ?, ?)').run(id, o.envio, CRIADO);
  if (o.ydoc) {
    const y = new Y.Doc();
    const mapa = y.getMap('meta');
    for (const [k, v] of Object.entries(m)) mapa.set(k, v);
    db.prepare('UPDATE roteiros SET ydoc = ? WHERE id = ?').run(Y.encodeStateAsUpdate(y), id);
  }
}

const metas = () => Object.fromEntries(db.prepare('SELECT id, meta FROM roteiros ORDER BY id').all().map((l) => [l.id, JSON.parse(l.meta as string)]));
const tudo = () => JSON.stringify([db.prepare('SELECT * FROM roteiros ORDER BY id').all(), db.prepare('SELECT roteiro_id, n, meta FROM versoes ORDER BY roteiro_id, n').all()]);

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'corrigir-datas-'));
  db = abrirBanco(join(pasta, 'roteirista.db'));
  // a cópia do Teable que o servidor guarda: "Fórmula 1" cadastrada
  db.prepare('INSERT INTO teable_copia (chave, dados, em) VALUES (?, ?, ?)').run(
    'vocabulario',
    JSON.stringify({ programas: [{ nome: 'Fórmula 1', chaves: ['FORMULA 1'] }], redatores: [], editores: [], pauta: [] }),
    CRIADO,
  );
  // os errados
  roteiro('do-arquivo', { claquete: 'SHOW 5-12-2', dataExibicao: '2026-02-12' }, { original: 'Show_5-12-2.docx', ydoc: true });
  roteiro('rio-sem-original', { claquete: 'RIO SUMMER BEATS 5-12-2', dataExibicao: '2026-02-12' });
  roteiro('espaco-no-arquivo', { claquete: 'SITIO 26 11/2', dataExibicao: '2026-02-11' }, { original: 'Sitio_26_11_2.docx' });
  roteiro('formula', { claquete: 'FORMULA 1/5-12-2', dataExibicao: '2026-05-01' }, { original: 'Formula_1_5-12-2.docx' });
  roteiro('sem-data-gravada', { claquete: 'SHOW 26-11-2', dataExibicao: '' });
  roteiro('sem-historico', { claquete: 'CHEF 7-12-3', dataExibicao: '2026-03-12' }, { semVersao: true });
  // os que ficam de fora
  roteiro('certo', { claquete: 'CHEF 25/12-2', dataExibicao: '2026-12-25' }, { original: 'Chef_25_12-2.docx' });
  roteiro('enviado', { claquete: 'SHOW 5-12-2', dataExibicao: '2026-02-12' }, { envio: 'enviado' });
  roteiro('duplicado', { claquete: 'SHOW 5-12-2', dataExibicao: '2026-02-12' }, { envio: 'duplicado' });
  roteiro('sem-data-na-claquete', { claquete: 'ESPECIAL DE NATAL', dataExibicao: '2026-02-12' });
  roteiro('mudada-a-mao', { claquete: 'SHOW 5-12-2', dataExibicao: '2026-02-12' }, { importado: { dataExibicao: '2026-12-06' } });
  roteiro('data-do-texto', { claquete: 'SHOW 5-12-2', dataExibicao: '2026-12-06' });
});

describe('corrigir as datas da fila (#47)', () => {
  it('a listagem acha só os errados, com a data nova e a claquete com a barra', () => {
    const lista: Item[] = listarDatasErradas(db).lista;
    expect(lista.map((i) => i.id).sort()).toEqual(['do-arquivo', 'espaco-no-arquivo', 'formula', 'rio-sem-original', 'sem-data-gravada', 'sem-historico']);
    const por = Object.fromEntries(lista.map((i) => [i.id, i]));
    expect(por['do-arquivo']).toMatchObject({ claquete: 'SHOW 5-12-2', gravada: '2026-02-12', nova: '2026-12-05', claqueteNova: 'SHOW 5/12-2' });
    expect(por['rio-sem-original']).toMatchObject({ nova: '2026-12-05', claqueteNova: 'RIO SUMMER BEATS 5/12-2' });
    expect(por['espaco-no-arquivo']).toMatchObject({ nova: '2026-11-26', claqueteNova: 'SITIO 26/11-2' });
    // o "1" de "Fórmula 1" (cadastrada no Teable) não entra na data
    expect(por.formula).toMatchObject({ nova: '2026-12-05', claqueteNova: 'FORMULA 1 5/12-2' });
    expect(por['sem-data-gravada']).toMatchObject({ gravada: '', nova: '2026-11-26', claqueteNova: 'SHOW 26/11-2' });
    // sem a versão da importação, não dá para saber se a data foi mudada à mão: entra, com o aviso
    expect(por['sem-historico']).toMatchObject({ nova: '2026-12-07', claqueteNova: 'CHEF 7/12-3' });
    expect(por['sem-historico'].aviso).toMatch(/histórico/);
    expect(por['do-arquivo'].aviso).toBe('');
  });

  it('conta os que ficaram de fora, por motivo', () => {
    expect(listarDatasErradas(db).fora).toEqual({ enviados: 2, semData: 1, mudadaAMao: 1, outraFonte: 1, certos: 1 });
  });

  it('sem --aplicar, só lista: nada muda no banco', async () => {
    const antes = tudo();
    const saida: string[] = [];
    const r = await corrigirDatas({ db, argv: [], escrever: (l: string) => saida.push(l), avisar: async () => 'avisado' });
    expect(r.gravados).toBe(0);
    expect(tudo()).toBe(antes);
    const texto = saida.join('\n');
    expect(texto).toMatch(/do-arquivo .*SHOW 5-12-2.*2026-02-12 → 2026-12-05.*SHOW 5\/12-2/);
    expect(texto).toMatch(/--aplicar/);
    expect(texto).not.toMatch(/mudada-a-mao|data-do-texto|enviado\b/);
  });

  it('com --aplicar, grava só os listados: a data, a claquete com a barra, a versão e o documento compartilhado', async () => {
    const antes = metas();
    const avisados: string[] = [];
    const saida: string[] = [];
    const r = await corrigirDatas({ db, argv: ['--aplicar'], escrever: (l: string) => saida.push(l), avisar: async (ids: string[]) => (avisados.push(...ids), 'avisado') });
    expect(r.gravados).toBe(6);
    expect(saida.join('\n')).toMatch(/Gravei 6 roteiros/);
    const depois = metas();
    expect(depois['do-arquivo']).toEqual({ ...antes['do-arquivo'], dataExibicao: '2026-12-05', claquete: 'SHOW 5/12-2' });
    expect(depois.formula).toMatchObject({ dataExibicao: '2026-12-05', claquete: 'FORMULA 1 5/12-2' });
    expect(depois['sem-data-gravada']).toMatchObject({ dataExibicao: '2026-11-26', claquete: 'SHOW 26/11-2' });
    for (const id of ['certo', 'enviado', 'duplicado', 'sem-data-na-claquete', 'mudada-a-mao', 'data-do-texto']) expect(depois[id]).toEqual(antes[id]);
    expect(avisados.sort()).toEqual(['do-arquivo', 'espaco-no-arquivo', 'formula', 'rio-sem-original', 'sem-data-gravada', 'sem-historico']);
    // o histórico registra a correção
    expect(db.prepare("SELECT motivo FROM versoes WHERE roteiro_id = 'do-arquivo' ORDER BY n DESC").get()?.motivo).toMatch(/data corrigida/);
    // o documento compartilhado não traz a data antiga de volta na próxima abertura do editor
    const y = new Y.Doc();
    Y.applyUpdate(y, db.prepare("SELECT ydoc FROM roteiros WHERE id = 'do-arquivo'").get()!.ydoc as Uint8Array);
    expect(y.getMap('meta').get('dataExibicao')).toBe('2026-12-05');
    expect(y.getMap('meta').get('claquete')).toBe('SHOW 5/12-2');
    // rodar de novo não acha mais nada
    expect(listarDatasErradas(db).lista).toEqual([]);
  });

  it('sem como avisar a fila, diz que ela atualiza ao recarregar', async () => {
    const saida: string[] = [];
    await corrigirDatas({ db, argv: ['--aplicar'], env: {}, escrever: (l: string) => saida.push(l) });
    expect(saida.join('\n')).toMatch(/recarregar/);
  });

  it('roda pelo node, no banco da pasta DADOS', () => {
    const r = spawnSync(process.execPath, ['--experimental-strip-types', 'servidor/corrigir-datas.mjs'], {
      env: { ...process.env, DADOS: pasta, REDIS_URL: '', NODE_NO_WARNINGS: '1' },
      encoding: 'utf8',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/do-arquivo/);
    expect(r.stdout).toMatch(/6 roteiros/);
  });
});
