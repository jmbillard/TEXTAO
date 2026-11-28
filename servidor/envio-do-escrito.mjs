// O Enviar do Roteiro escrito no PROMeiro (#194): as regras puras do navegador (src/modelo/enviar.ts e
// src/modelo/versoes.ts), lidas pelo gancho de `artes.mjs` (os módulos de src/modelo se importam sem extensão).
import './artes.mjs';

const { docParaAFila, ehEnvio, letraEVersaoDoEnvio, motivoDoEnvio, ORIGEM_DO_ENVIO, andamentoDaArte, textoDoMotivo } = await import('../src/modelo/enviar.ts');
const { substituirVersao } = await import('../src/modelo/versoes.ts');
const { comLetraEVersao, letraEVersaoDoRoteiro } = await import('../src/modelo/letraEVersao.ts');
const { exportar, pendencias } = await import('../src/modelo/exportar.ts');
const { metaVazia } = await import('../src/modelo/tipos.ts');

export { andamentoDaArte, ehEnvio, motivoDoEnvio, ORIGEM_DO_ENVIO, textoDoMotivo };

/** Os campos que o envio leva da cópia da fila de volta ao escrito: a claquete conferida, a letra e a versão. */
const DO_ENVIO = ['claquete', 'programa', 'tipoPrograma', 'dataExibicao', 'praca', 'editor', 'letra', 'versao'];

/**
 * O roteiro da fila de um envio, pronto para gravar: o texto e a meta que o navegador mandou (a claquete conferida e o
 * que o caminho da fila pôs), com o trecho do tipo arte coberto pela marca, na revisão. Com a cópia anterior ainda na
 * fila, fica com o trabalho dela e a letra e a versão seguintes (`substituirVersao`); sem ela (a anterior já saiu),
 * a letra e a versão seguem o último envio. As pendências são refeitas.
 * @param anterior a cópia anterior na fila ({ meta, doc }), ou null
 * @param ultimo a meta da foto do último envio, ou null no primeiro
 */
export function roteiroDaFila({ id, meta, doc, anterior, ultimo, liberada, agora }) {
  let roteiro = { id, meta: { ...metaVazia(), ...meta, layout: 'coluna_unica', status: 'revisao' }, doc: docParaAFila(doc), revisao: 1, criadoEm: agora, atualizadoEm: agora, origem: ORIGEM_DO_ENVIO };
  for (const k of ['letra', 'versao', 'substituiu', 'revisar']) delete roteiro.meta[k];
  if (anterior) roteiro = { ...roteiro, ...substituirVersao(roteiro, { id: 'anterior', revisao: 1, criadoEm: '', atualizadoEm: '', ...anterior }, { liberada }).roteiro };
  else if (ultimo) roteiro.meta = comLetraEVersao(roteiro.meta, letraEVersaoDoRoteiro(ultimo), liberada);
  roteiro.meta.revisar = pendencias(exportar(roteiro));
  return roteiro;
}

/** A meta do escrito depois do envio: a dele, com a claquete, a letra e a versão do envio, fora do rascunho. */
export function metaDoEscritoEnviado(metaDoEscrito, metaDoEnvio) {
  const meta = { ...metaDoEscrito, status: 'revisao' };
  for (const k of DO_ENVIO) {
    if (metaDoEnvio[k] === undefined) delete meta[k];
    else meta[k] = metaDoEnvio[k];
  }
  return meta;
}

/** A letra e a versão de um envio, pela meta da foto. */
export const letraEVersaoDaFoto = (meta) => letraEVersaoDoRoteiro(meta ?? {});
export { letraEVersaoDoEnvio };
