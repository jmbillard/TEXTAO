/* O Trello ou o Teable fora do ar na Configuração (#79). Cada leitura que dá certo guarda o que leu no SQLite (o
   quadro do Trello: as listas, os campos, as opções e as etiquetas; as tabelas do Teable já são guardadas pela
   descoberta, servidor/tabelas-do-teable.mjs). Com o serviço fora, a tela mostra o salvo com os nomes dessa última
   leitura, diz desde quando ele não responde e trava a edição daquela parte; a API recusa salvar. O "desde" é o da
   primeira falha e também fica guardado (vale depois de reiniciar); a primeira leitura que dá certo apaga. */
import { lerOQuadro } from './configuracao-pracas.mjs';

const FORA = 'fora-do-ar';
const QUADRO = 'quadro-do-trello';
const NOME = { trello: 'Trello', teable: 'Teable' };
const limpo = (v) => String(v ?? '').trim();

/**
 * @param copia { ler(chave), guardar(chave, dados) }: a cópia local no SQLite
 * @returns caiu(servico, motivo), voltou(servico), estado(servico) → { servico, desde, motivo } | null
 */
export function criarForaDoAr(copia) {
  const ler = () => copia.ler(FORA)?.dados ?? {};
  return {
    /** Marca o serviço como fora (o "desde" fica o da primeira falha). */
    caiu(servico, motivo) {
      const t = ler();
      if (!t[servico]) {
        t[servico] = { desde: new Date().toISOString(), motivo: String(motivo ?? '') };
        copia.guardar(FORA, t);
      }
      return { servico: NOME[servico], ...t[servico] };
    },
    voltou(servico) {
      const t = ler();
      if (!t[servico]) return;
      delete t[servico];
      copia.guardar(FORA, t);
    },
    estado(servico) {
      const s = ler()[servico];
      return s ? { servico: NOME[servico], ...s } : null;
    },
  };
}

/**
 * O quadro do Trello para as seções, com a cópia: a leitura que dá certo é guardada; com o Trello fora, vale a última
 * guardada deste quadro, com `foraDoAr` { servico, desde, motivo, lidoEm } (sem nenhuma guardada, o quadro vem null,
 * com `erro`). Nunca lança por o Trello não responder.
 * @returns { quadro, erro?, foraDoAr? }
 */
export async function lerOQuadroComCopia(trello, env, { copia, fora }) {
  let lido;
  try {
    lido = await lerOQuadro(trello, env);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    const estado = fora.caiu('trello', motivo);
    const guardado = copia.ler(QUADRO);
    const doQuadro = limpo(env.TRELLO_QUADRO);
    const quadro = guardado?.dados && (!doQuadro || guardado.dados.id === doQuadro) ? guardado.dados : null;
    const foraDoAr = { servico: estado.servico, desde: estado.desde, motivo, lidoEm: quadro ? guardado.em : '' };
    console.warn(`[configuração] o Trello não respondeu: ${motivo}${quadro ? ` (valem os nomes da leitura de ${guardado.em})` : ''}`);
    return quadro ? { quadro, foraDoAr } : { quadro: null, foraDoAr, erro: 'O Trello não responde e não há nenhuma leitura do quadro guardada: os nomes voltam quando ele voltar.' };
  }
  if (lido.quadro) {
    copia.guardar(QUADRO, lido.quadro);
    fora.voltou('trello');
  }
  return lido;
}

/** A recusa de salvar a parte que depende do serviço fora do ar. */
export const recusaForaDoAr = (f) =>
  `O ${f.servico} está fora do ar desde ${new Date(f.desde).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })}: o que depende dele fica travado até ele voltar. Nada foi salvo.`;
