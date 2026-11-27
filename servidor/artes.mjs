// A conta das artes de um roteiro pela regra do navegador: as artes a produzir, cada uma uma vez
// (src/modelo/exportar.ts, quantasAProduzir).
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

const { artesDoEnvio, exportar, quantasAProduzir, subirComplexidade } = await import('../src/modelo/exportar.ts');
const { metaVazia } = await import('../src/modelo/tipos.ts');
const { artesDoRoteiro } = await import('../src/modelo/artesDoRoteiro.ts');
const { versoesDoRoteiro } = await import('../src/modelo/versoesDoRoteiro.ts');
const { diaEmSaoPaulo } = await import('../src/modelo/pauta.ts');

/** O clique no fogo da arte (BAIXA → MÉDIA → ALTA → BAIXA), pela regra do editor (#147: a janela do After também). */
export { subirComplexidade };

/**
 * O fogo novo de uma arte nas marcas de complexidade ({ chave: 2 | 3 }; a BAIXA não é guardada), como no editor: com
 * `nivel` (1, 2 ou 3), a arte fica nesse nível (repetir não muda nada); sem ele, sobe um nível (subirComplexidade).
 * Vale para as marcas do Roteiro (#147) e para as da Produção sem Roteiro (#174).
 * @returns { marcas (as novas; undefined sem nenhuma), antes, depois } (os níveis, 1 a 3)
 */
export function fogoNoNivel(marcas, chave, nivel = null) {
  const atuais = marcas && typeof marcas === 'object' ? marcas : {};
  let novas;
  if (nivel) {
    const resto = { ...atuais };
    delete resto[chave];
    novas = nivel === 1 ? resto : { ...resto, [chave]: nivel };
    if (!Object.keys(novas).length) novas = undefined;
  } else novas = subirComplexidade({ complexidade: atuais }, chave).complexidade;
  const de = (c) => ([2, 3].includes(c?.[chave]) ? c[chave] : 1);
  return { marcas: novas, antes: de(atuais), depois: de(novas) };
}

/**
 * As artes do roteiro aberto (#104), com o estado e a origem: as da revisão (as do envio, sem as que não vão ser
 * produzidas) cruzadas com a Produção (a etapa, a coluna de artes e o checklist marcado). Nada vem do Trello.
 * @param producao { etapa, artes, artesMarcadas } | null
 */
export function artesComOEstado(meta, doc, producao) {
  const roteiro = { id: '', meta: { ...metaVazia(), ...meta }, doc, revisao: 1, criadoEm: '', atualizadoEm: '' };
  const daRevisao = artesDoEnvio(exportar(roteiro), roteiro.meta).map((a) => ({ texto: a.texto, tipos: a.tipos, existe: a.existe }));
  return artesDoRoteiro(daRevisao, producao);
}

/** Quantas artes a produzir o roteiro tem (sem as que já existem e as que não vão ser produzidas, cada uma uma vez):
    a conta que o editor mostra e o cliente manda ao salvar. */
export function contarArtes(meta, doc) {
  const roteiro = { id: '', meta: { ...metaVazia(), ...meta }, doc, revisao: 1, criadoEm: '', atualizadoEm: '' };
  return quantasAProduzir(exportar(roteiro), roteiro.meta);
}

/** As versões da chamada que as artes da revisão (as do envio) dizem (#120), com as etiquetas: a regra do editor. */
export function versoesLidas(meta, doc, hoje = diaEmSaoPaulo()) {
  const roteiro = { id: '', meta: { ...metaVazia(), ...meta }, doc, revisao: 1, criadoEm: '', atualizadoEm: '' };
  const artes = artesDoEnvio(exportar(roteiro), roteiro.meta).map((a) => a.texto);
  return versoesDoRoteiro(artes, String(roteiro.meta.claquete ?? ''), hoje);
}

/**
 * Acerto da subida: refaz o n_artes de cada roteiro guardado e grava só essa coluna, e só quando ela muda. Os roteiros
 * salvos antes da lista sem repetição contavam as repetidas; os salvos antes da conta das artes a produzir contavam as
 * que já existem e as que não vão ser produzidas. Não mexe em atualizado_em, meta nem doc, e não avisa a
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
    log.log(`[artes] conta refeita (artes a produzir): ${mudaram} ${mudaram === 1 ? 'roteiro mudou' : 'roteiros mudaram'}${erros ? `, ${erros} com erro` : ''}`);
  return { mudaram, erros };
}

/** A marca do acerto, com a versão da regra: quando a regra da conta muda, a marca nova faz o acerto rodar de novo
    (a marca de antes, 'n_artes sem repetição', fica na tabela e não vale mais). */
const ACERTO = 'n_artes a produzir';

/**
 * O acerto roda uma vez por banco (por regra): a marca fica na tabela acertos, gravada junto com as contas. Depois dele,
 * quem salva já manda a conta certa, e a subida não relê todos os roteiros de novo.
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
