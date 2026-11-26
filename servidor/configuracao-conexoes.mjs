/* As Conexões da Configuração (#76): o quadro do Trello e a base do Teable. Trocar um ou outro pede o nome do novo,
   digitado (a confirmação forte), e depois o PROMeiro liga de novo pelo nome: com o quadro novo, as listas, os campos,
   as opções e as etiquetas de todas as seções (Praças, Card, Filmes); com a base nova, as tabelas (a descoberta,
   servidor/tabelas-do-teable.mjs). O que o nome não acha vira exceção na seção, como sempre. */
import { casar, ligarPeloNome, nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { cardDaConfiguracao, ligarOCardPeloNome, mudancasDoCard } from '../src/modelo/ligarOCard.ts';
import { ligarOsFilmesPeloNome, mudancasDosFilmes } from '../src/modelo/ligarOsFilmes.ts';
import { pracasDaConfiguracao } from '../src/modelo/pracas.ts';
import { TABELAS_DO_TEABLE } from '../src/modelo/tabelasDoTeable.ts';
import { mudancasDaSecao, pracasSalvas } from './configuracao-pracas.mjs';
import { filmesSalvos } from './configuracao-filmes.mjs';

const ID = /^[\w-]{1,64}$/;

/** O nome digitado confirma a troca: igual ao do novo, sem caixa, acento e pontuação. */
export const confirmaATroca = (digitado, nome) => !!nomeComparavel(nome) && nomeComparavel(digitado) === nomeComparavel(nome);

/** Os quadros abertos que o token do Trello enxerga: [{ id, nome }]. */
export async function lerQuadros(trello) {
  const lidos = await trello.ler('/members/me/boards', { filter: 'open', fields: 'name' });
  return (Array.isArray(lidos) ? lidos : []).map((q) => ({ id: String(q.id ?? ''), nome: String(q.name ?? '') })).filter((q) => ID.test(q.id));
}

/** O mesmo item no quadro novo, pelo nome que ele tinha no velho (um só): as listas e os campos que não se ligam
    pelo nome esperado (a reserva, os entregues, os campos copiados do filme). */
function peloNomeAntigo(id, velhos, novos) {
  const nome = velhos?.find((x) => x.id === id)?.nome;
  if (!nome) return '';
  const achado = casar(novos, (x) => !x.arquivada && nomeComparavel(x.nome) === nomeComparavel(nome));
  return achado.como === 'um' ? achado.id : '';
}

/**
 * Liga de novo pelo nome, no quadro novo, tudo o que era do quadro velho: os ids guardados (e o ligado à mão) são do
 * quadro velho e saem; o que o nome acha (um só) entra; o resto fica vazio e vira exceção na seção.
 * @param quadroVelho o quadro de antes, lido (para levar pelo nome o que não tem nome esperado); null se não deu
 * @returns as mudanças para a configuração viva
 */
export function religarNoQuadroNovo(env, quadroNovo, quadroVelho, { sessoes }) {
  const salvo = pracasSalvas(env);
  const pracas = ligarPeloNome({ pracas: salvo.pracas.map((p) => ({ ...p, entrada: '', saida: '', opcao: '' })), campoPraca: '', aMao: [] }, quadroNovo, { primeiraVez: false });
  const card = cardDaConfiguracao(env);
  const doFilme = card.doFilme.map((id) => peloNomeAntigo(id, quadroVelho?.campos, quadroNovo.campos)).filter(Boolean);
  const novoCard = ligarOCardPeloNome({ ids: Object.fromEntries(Object.keys(card.ids).map((k) => [k, ''])), doFilme, aMao: [] }, quadroNovo, { primeiraVez: false });
  const filmes = filmesSalvos(env, pracasDaConfiguracao(env), sessoes);
  const novosFilmes = ligarOsFilmesPeloNome({ ...filmes, lista: '', etiquetas: [], sessoes: filmes.sessoes.map((s) => ({ ...s, etiqueta: '' })), aMao: [] }, quadroNovo, { primeiraVez: false });
  const limpo = (v) => String(v ?? '').trim();
  return {
    ...mudancasDaSecao(pracas),
    ...mudancasDoCard(novoCard),
    ...mudancasDosFilmes(novosFilmes),
    // a reserva e os entregues não têm nome esperado: vão pelo nome que tinham no quadro velho
    TRELLO_LISTA: peloNomeAntigo(limpo(env.TRELLO_LISTA), quadroVelho?.listas, quadroNovo.listas),
    TRELLO_LISTA_ENTREGUES: peloNomeAntigo(limpo(env.TRELLO_LISTA_ENTREGUES), quadroVelho?.listas, quadroNovo.listas),
    LIGADO_A_MAO: '[]',
  };
}

/** Ao trocar a base: os ids de tabela salvos na tela são da base velha e saem (os do Portainer ficam, e a descoberta
    não os usa enquanto não estiverem na base); o pôster dos filmes também. */
export function mudancasDaBaseNova(base, salvos) {
  const sair = [...TABELAS_DO_TEABLE.map((t) => t.variavel).filter(Boolean), 'TEABLE_FILMES_POSTER'].filter((n) => salvos.has(n));
  return { TEABLE_PG_ESQUEMA: base, ...Object.fromEntries(sair.map((n) => [n, null])) };
}

/** As Conexões como a tela lê: o quadro e a base de agora, as tabelas achadas e o aviso do topo. */
export function conexoesDaTela(lido, descoberta, env) {
  return {
    quadro: lido.quadro ? { id: lido.quadro.id, nome: lido.quadro.nome ?? '', de: lido.quadro.de } : null,
    ...(lido.erro ? { erroDoQuadro: lido.erro } : {}),
    base: env.TEABLE_PG_ESQUEMA ? { id: String(env.TEABLE_PG_ESQUEMA).trim(), nome: descoberta?.nomeDaBase ?? '' } : null,
    tabelas: (descoberta?.tabelas ?? []).map((t) => ({ nome: t.nome, id: t.id, pg: t.pg, nomeLido: t.nomeLido, como: t.como, problema: t.problema })),
    avisos: descoberta?.avisos ?? [],
    ...(descoberta?.em ? { lidasEm: descoberta.em } : {}),
    ...(descoberta?.foraDoAr ? { foraDoAr: descoberta.foraDoAr } : {}),
    ...(!descoberta ? { semTeable: 'O Teable não está configurado (TEABLE_URL, TEABLE_TOKEN e a base).' } : {}),
  };
}
