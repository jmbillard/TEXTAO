// @vitest-environment node
import type { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { acertarNArtesUmaVez, recalcularNArtes } from '../servidor/artes.mjs';

/* Os roteiros guardados antes da lista sem repetição (f4fb6ea) têm o n_artes antigo, que contava as repetidas. Ao subir,
   o servidor refaz a conta pela regra de hoje e grava só a coluna n_artes: a agenda e a fila passam a mostrar a lista
   sem duplicatas, sem o roteiro parecer alterado. */

const arte = (texto: string, k: number) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: 'Locução ' }, { type: 'text', text: texto, marks: [{ type: 'arte', attrs: { id: `a${k}`, subtipo: '', obs: '' } }] }, { type: 'text', text: '.' }],
});
const doc = (artes: string[]) => ({ type: 'doc', content: artes.map(arte) });
const meta = { claquete: 'TESTE', titulo: 'Teste', programa: 'Teste', redator: 'Fulana', editor: 'Fulano', dataExibicao: '2026-11-29' };
const QUANDO = '2026-01-02T03:04:05.000Z';

const guardar = (db: DatabaseSync, id: string, d: unknown, nArtes: number, m: unknown = meta) =>
  db
    .prepare(`INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, n_artes, criado_em, atualizado_em) VALUES (?, 'ana@empresa.com', 'Ana', ?, ?, ?, ?, ?)`)
    .run(id, JSON.stringify(m), typeof d === 'string' ? d : JSON.stringify(d), nArtes, QUANDO, QUANDO);
const linha = (db: DatabaseSync, id: string) =>
  db.prepare('SELECT meta, doc, n_artes, atualizado_em FROM roteiros WHERE id = ?').get(id) as { meta: string; doc: string; n_artes: number; atualizado_em: string };

const silencioso = { log: vi.fn(), error: vi.fn() };
let pasta = '';
afterEach(() => {
  if (pasta) rmSync(pasta, { recursive: true, force: true });
  pasta = '';
});

describe('recalcular n_artes ao subir', () => {
  it('o roteiro guardado com as repetidas passa a contar cada arte uma vez, sem mudar o resto', () => {
    const db = abrirBanco(':memory:');
    guardar(db, 'r1', doc(['IZA', '6:10', 'IZA', 'DOMINGO', 'IZA']), 5);
    const antes = linha(db, 'r1');
    expect(recalcularNArtes(db, silencioso)).toMatchObject({ mudaram: 1, erros: 0 });
    const depois = linha(db, 'r1');
    expect(depois.n_artes).toBe(3);
    expect(depois.atualizado_em).toBe(QUANDO);
    expect(depois.meta).toBe(antes.meta);
    expect(depois.doc).toBe(antes.doc);
  });

  it('rodar de novo não muda nada', () => {
    const db = abrirBanco(':memory:');
    guardar(db, 'r1', doc(['IZA', 'IZA', 'HOJE']), 3);
    guardar(db, 'r2', doc(['HOJE']), 1);
    expect(recalcularNArtes(db, silencioso).mudaram).toBe(1);
    expect(recalcularNArtes(db, silencioso)).toMatchObject({ mudaram: 0, erros: 0 });
    expect(linha(db, 'r1').n_artes).toBe(2);
    expect(linha(db, 'r2').n_artes).toBe(1);
  });

  it('um roteiro que não dá para ler fica como está e não derruba os outros', () => {
    const db = abrirBanco(':memory:');
    guardar(db, 'ruim', '{não é json', 7);
    guardar(db, 'bom', doc(['IZA', 'IZA']), 2);
    const log = { log: vi.fn(), error: vi.fn() };
    expect(recalcularNArtes(db, log)).toMatchObject({ mudaram: 1, erros: 1 });
    expect(linha(db, 'ruim').n_artes).toBe(7);
    expect(linha(db, 'bom').n_artes).toBe(1);
    expect(log.error).toHaveBeenCalled();
  });

  it('o banco acerta a conta ao ser aberto (a subida do servidor)', () => {
    pasta = mkdtempSync(join(tmpdir(), 'promeiro-artes-'));
    const arquivo = join(pasta, 'roteirista.db');
    const db = abrirBanco(arquivo);
    guardar(db, 'r1', doc(['IZA', '6:10', 'IZA']), 3);
    // um banco de antes do acerto: sem a marca
    db.exec('DELETE FROM acertos');
    db.close();
    const reaberto = abrirBanco(arquivo);
    expect(linha(reaberto, 'r1')).toMatchObject({ n_artes: 2, atualizado_em: QUANDO });
    reaberto.close();
  });

  it('o acerto da subida roda uma vez só por banco', () => {
    pasta = mkdtempSync(join(tmpdir(), 'promeiro-artes-'));
    const arquivo = join(pasta, 'roteirista.db');
    const db = abrirBanco(arquivo);
    guardar(db, 'r1', doc(['IZA', 'IZA']), 2);
    // o banco já foi acertado ao abrir: a subida seguinte não relê os roteiros
    expect(acertarNArtesUmaVez(db, silencioso)).toBeNull();
    db.close();
    const reaberto = abrirBanco(arquivo);
    expect(linha(reaberto, 'r1').n_artes).toBe(2);
    reaberto.close();
  });
});
