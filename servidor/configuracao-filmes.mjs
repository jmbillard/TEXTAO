/* A seção Filmes da tela de Configuração (#75): a praça dos cards de filme, a lista deles, a etiqueta de todos e a de
   cada sessão. O que está salvo (ou, na primeira vez, o que vem do Portainer), o que o nome liga e o estado de cada
   ligação. As sessões vêm do cadastro de atrações (as de acervo "do filme", mais a Sessão da Tarde), como no envio
   (servidor/exibicao.mjs). Conferir e salvar passam pela mesma conferência. As regras são as do módulo compartilhado
   com o navegador (src/modelo/ligarOsFilmes.ts); o quadro é lido como na seção Praças. */
import { conferirFilmes, eDosFilmes, estadoDosFilmes, filmesDaConfiguracao, ligarOsFilmesPeloNome, mudancasDosFilmes } from '../src/modelo/ligarOsFilmes.ts';
import { ehSessaoDaTarde } from './exibicao.mjs';
import { pracasDaConfiguracao } from '../src/modelo/pracas.ts';

const ID_DO_TRELLO = /^[\w-]{1,64}$/;

/**
 * As sessões de filme do cadastro de atrações, pelo nome: as de acervo "do filme" e a Sessão da Tarde.
 * @returns { sessoes: string[] | null, erro? }: null quando o cadastro não está ligado ou não respondeu
 */
export async function sessoesDoCadastro(cadastros) {
  try {
    const lido = await cadastros?.ler?.();
    if (!lido?.ligado) return { sessoes: null, erro: 'O cadastro de atrações não está ligado: as sessões são as já salvas.' };
    return { sessoes: lido.atracoes.filter((a) => a.acervo === 'filme' || ehSessaoDaTarde(a.nome)).map((a) => a.nome) };
  } catch (e) {
    return { sessoes: null, erro: `Não consegui ler as sessões do cadastro de atrações (${e instanceof Error ? e.message : e}): as sessões são as já salvas.` };
  }
}

/** A seção salva, com as sessões do cadastro (sem elas, as que já têm etiqueta salva). */
export const filmesSalvos = (env, pracas, sessoes) => filmesDaConfiguracao(env, { pracas, sessoes: sessoes ?? [] });

/**
 * A seção como a tela lê: o salvo, a proposta (o salvo com o que o nome acha um só) e o estado, com o quadro já lido.
 * @param primeiraVez nenhuma variável dos filmes foi salva na tela ainda (os ids vêm do Portainer)
 */
export function secaoDosFilmes(env, quadro, { primeiraVez, pracas, sessoes, erroDasSessoes }) {
  const salvo = filmesSalvos(env, pracas, sessoes);
  const extra = erroDasSessoes ? { avisoDasSessoes: erroDasSessoes } : {};
  if (!quadro) return { primeiraVez, salvo, proposta: salvo, estado: null, ...extra };
  const proposta = ligarOsFilmesPeloNome(salvo, quadro, { primeiraVez });
  return { primeiraVez, salvo, proposta, estado: estadoDosFilmes(proposta, quadro, pracas), ...extra };
}

/** As variáveis dos filmes que, salvas na tela, dizem que a seção já não é da primeira vez. */
export const VARIAVEIS_DOS_FILMES = Object.keys(mudancasDosFilmes(filmesDaConfiguracao({}, { pracas: [], sessoes: [] })));

const NUMERO = /^\d{0,9}$/;
const NOME_DA_SESSAO = /^[^=,]{1,80}$/;

/** A seção que veio do navegador, limpa: a praça (sigla), a lista, as etiquetas, as sessões (nome e etiqueta), os
    números e as chaves do ligado à mão. null se não vale. */
export function filmesDoPedido(corpo) {
  const b = corpo?.filmes;
  if (!b || typeof b !== 'object' || !Array.isArray(b.sessoes) || !Array.isArray(b.etiquetas)) return null;
  const texto = (v) => String(v ?? '').trim();
  const praca = texto(b.praca).toUpperCase();
  if (praca && !/^[A-Z0-9_-]{1,64}$/i.test(praca)) return null;
  const lista = texto(b.lista);
  const etiquetas = [...new Set(b.etiquetas.map(texto).filter(Boolean))];
  if ((lista && !ID_DO_TRELLO.test(lista)) || !etiquetas.every((x) => ID_DO_TRELLO.test(x))) return null;
  const sessoes = b.sessoes.map((s) => ({ nome: texto(s?.nome).replace(/\s+/g, ' '), etiqueta: texto(s?.etiqueta) }));
  if (!sessoes.every((s) => NOME_DA_SESSAO.test(s.nome) && (!s.etiqueta || ID_DO_TRELLO.test(s.etiqueta)))) return null;
  const pausaMs = texto(b.pausaMs);
  const esperaMs = texto(b.esperaMs);
  if (!NUMERO.test(pausaMs.replace(/^-/, '')) || !NUMERO.test(esperaMs.replace(/^-/, ''))) return null;
  const aMao = Array.isArray(b.aMao) ? [...new Set(b.aMao.filter((k) => typeof k === 'string' && eDosFilmes(k) && k.length <= 120))] : [];
  return { praca, lista, etiquetas, sessoes, pausaMs, esperaMs, aMao };
}

/** Confere contra o quadro de agora, as praças que vão valer (as do pedido, quando as praças mudam junto) e o salvo. */
export function conferirSecaoDosFilmes(env, quadro, nova, { pracas, sessoes }) {
  if (!quadro) return { ok: false, itens: [{ tipo: 'erro', titulo: 'Trello', detalhe: 'não consegui ler o quadro do Trello.' }], muda: [] };
  return conferirFilmes(nova, filmesSalvos(env, pracasDaConfiguracao(env), sessoes), quadro, pracas);
}

export { mudancasDosFilmes };
