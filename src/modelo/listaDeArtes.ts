/* A lista das artes ao lado do texto, recolhida ou aberta: a da folha de escrita (#190) e a da revisão são a mesma peça,
   e a escolha é uma só, lembrada por pessoa em qualquer aparelho (as preferências, #101). Regras puras, as mesmas no
   servidor (que confere a chave) e no navegador. */

/** A preferência da pessoa: true quando ela recolheu a lista das artes. */
export const CHAVE_DA_LISTA_DE_ARTES = 'artes.recolhida';

/** Sem escolha, a lista fica aberta. */
export const listaDeArtesRecolhida = (preferencias: Record<string, unknown> | undefined): boolean => preferencias?.[CHAVE_DA_LISTA_DE_ARTES] === true;

/** O motivo de recusar o valor da preferência, ou null quando ele vale (só true ou false). */
export const recusaDaListaDeArtes = (valor: unknown): string | null => (typeof valor === 'boolean' ? null : 'A lista das artes fica recolhida (true) ou aberta (false).');
