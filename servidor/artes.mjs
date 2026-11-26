// A conta das artes de um roteiro pela regra do navegador: cada arte uma vez (src/modelo/exportar.ts, artesUnicas).
// O Node lê o .ts sem os tipos, mas os módulos de src/modelo se importam sem extensão ('./sonora'), como o Vite
// aceita; o gancho abaixo completa o '.ts' só nesse caso (import relativo, vindo de um .ts, que não achou o arquivo).
import { registerHooks } from 'node:module';

registerHooks?.({
  resolve(especificador, contexto, proximo) {
    try {
      return proximo(especificador, contexto);
    } catch (e) {
      if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\.\.?\//.test(especificador) && contexto.parentURL?.endsWith('.ts'))
        return proximo(`${especificador}.ts`, contexto);
      throw e;
    }
  },
});

const { artesUnicas, exportar } = await import('../src/modelo/exportar.ts');
const { metaVazia } = await import('../src/modelo/tipos.ts');

/** Quantas artes o roteiro tem na lista sem repetição (a que o editor mostra e o cliente manda ao salvar). */
export function contarArtes(meta, doc) {
  const roteiro = { id: '', meta: { ...metaVazia(), ...meta }, doc, revisao: 1, criadoEm: '', atualizadoEm: '' };
  return artesUnicas(exportar(roteiro).artes).length;
}

/**
 * Acerto da subida: refaz o n_artes de cada roteiro guardado e grava só essa coluna, e só quando ela muda. Os roteiros
 * salvos antes da lista sem repetição contavam as repetidas. Não mexe em atualizado_em, meta nem doc, e não avisa a
 * fila: o roteiro não foi alterado, só a conta. Rodar de novo não muda nada. Um roteiro que não dá para ler fica como
 * está (loga e segue).
 */
export function recalcularNArtes(db, log = console) {
  const gravar = db.prepare('UPDATE roteiros SET n_artes = ? WHERE id = ?');
  let mudaram = 0;
  let erros = 0;
  for (const r of db.prepare('SELECT id, meta, doc, n_artes FROM roteiros').all()) {
    try {
      const n = contarArtes(JSON.parse(r.meta), JSON.parse(r.doc));
      if (n === r.n_artes) continue;
      gravar.run(n, r.id);
      mudaram++;
    } catch (e) {
      erros++;
      log.error(`[artes] ${r.id}: a conta das artes não foi refeita (${e?.message ?? e})`);
    }
  }
  if (mudaram || erros)
    log.log(`[artes] conta refeita sem repetição: ${mudaram} ${mudaram === 1 ? 'roteiro mudou' : 'roteiros mudaram'}${erros ? `, ${erros} com erro` : ''}`);
  return { mudaram, erros };
}

const ACERTO = 'n_artes sem repetição';

/**
 * O acerto roda uma vez por banco: a marca fica na tabela acertos, gravada junto com as contas. Depois dele, quem salva
 * já manda a conta certa, e a subida não relê todos os roteiros de novo.
 */
export function acertarNArtesUmaVez(db, log = console) {
  db.exec('CREATE TABLE IF NOT EXISTS acertos (nome TEXT PRIMARY KEY, em TEXT NOT NULL)');
  if (db.prepare('SELECT 1 FROM acertos WHERE nome = ?').get(ACERTO)) return null;
  db.exec('BEGIN');
  try {
    const feito = recalcularNArtes(db, log);
    db.prepare('INSERT INTO acertos (nome, em) VALUES (?, ?)').run(ACERTO, new Date().toISOString());
    db.exec('COMMIT');
    return feito;
  } catch (e) {
    db.exec('ROLLBACK');
    log.error(`[artes] o acerto da conta das artes não rodou (${e?.message ?? e})`);
    return null;
  }
}
