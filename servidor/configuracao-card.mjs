/* A seção Card da tela de Configuração (#74): os campos do card, as opções da prioridade e da complexidade e a lista do
   VT. O que está salvo (ou, na primeira vez, o que vem do Portainer), o que o nome liga e o estado de cada ligação.
   Conferir e salvar passam pela mesma conferência; a opção que não é do campo ligado (o campo foi trocado) sai antes,
   e o nome liga de novo a do campo novo. As regras são as do módulo compartilhado com o navegador
   (src/modelo/ligarOCard.ts); o quadro é lido como na seção Praças. */
import { ITENS_DO_CARD, acertarDependentes, cardDaConfiguracao, chaveDoCard, conferirCard, estadoDoCard, ligarOCardPeloNome, mudancasDoCard } from '../src/modelo/ligarOCard.ts';

const ID_DO_TRELLO = /^[\w-]{1,64}$/;

/**
 * A seção como a tela lê: o salvo, a proposta (o salvo com o que o nome acha um só) e o estado, com o quadro já lido.
 * @param primeiraVez nenhuma variável do card foi salva na tela ainda (os ids vêm do Portainer)
 */
export function secaoDoCard(env, quadro, { primeiraVez }) {
  const salvo = cardDaConfiguracao(env);
  if (!quadro) return { primeiraVez, salvo, proposta: salvo, estado: null };
  const proposta = ligarOCardPeloNome(salvo, quadro, { primeiraVez });
  return { primeiraVez, salvo, proposta, estado: estadoDoCard(proposta, quadro) };
}

/** As variáveis do card que, salvas na tela, dizem que a seção já não é da primeira vez. */
export const VARIAVEIS_DO_CARD = Object.keys(mudancasDoCard(cardDaConfiguracao({})));

/** A seção que veio do navegador, limpa: os ids (só os itens do card, cada um um id do Trello ou vazio), os campos
    copiados do filme e as chaves do ligado à mão. null se não vale. */
export function cardDoPedido(corpo) {
  const bruto = corpo?.card;
  if (!bruto || typeof bruto !== 'object' || !bruto.ids || typeof bruto.ids !== 'object') return null;
  const ids = {};
  for (const i of ITENS_DO_CARD) {
    const id = String(bruto.ids[i.chave] ?? '').trim();
    if (id && !ID_DO_TRELLO.test(id)) return null;
    ids[i.chave] = id;
  }
  const doFilme = Array.isArray(bruto.doFilme) ? bruto.doFilme.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
  if (!doFilme.every((x) => ID_DO_TRELLO.test(x))) return null;
  const chaves = new Set(ITENS_DO_CARD.map((i) => chaveDoCard(i.chave)));
  const aMao = Array.isArray(bruto.aMao) ? [...new Set(bruto.aMao.filter((k) => chaves.has(k)))] : [];
  return { ids, doFilme: [...new Set(doFilme)], aMao };
}

/** Acerta as opções ao campo ligado (a troca de campo) e confere contra o quadro de agora e o salvo. */
export function conferirSecaoDoCard(env, quadro, nova) {
  if (!quadro) return { secao: nova, conferencia: { ok: false, itens: [{ tipo: 'erro', titulo: 'Trello', detalhe: 'não consegui ler o quadro do Trello.' }], muda: [] } };
  const secao = acertarDependentes(nova, quadro);
  return { secao, conferencia: conferirCard(secao, cardDaConfiguracao(env), quadro) };
}

export { mudancasDoCard };
