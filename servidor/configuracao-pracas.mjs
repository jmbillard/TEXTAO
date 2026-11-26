/* A seção Praças da tela de Configuração (#72): o que está salvo (ou, na primeira vez, o que vem do Portainer), o
   quadro do Trello lido (as listas e os campos), o que o PROMeiro liga pelo nome e o estado de cada ligação. Conferir
   e salvar passam pela mesma conferência; com erro, nada é salvo. As regras de ligar e conferir são as do módulo
   compartilhado com o navegador (src/modelo/ligarPeloNome.ts). */
import { pracasDaConfiguracao } from '../src/modelo/pracas.ts';
import { CAMPO_PRACA, CHAVE_DO_CAMPO, PONTAS, acharOpcao, chaveDa, conferirPracas, estadoDasPracas, ligarPeloNome, pracasNovas } from '../src/modelo/ligarPeloNome.ts';
import { eDoCard } from '../src/modelo/ligarOCard.ts';
import { eDosFilmes } from '../src/modelo/ligarOsFilmes.ts';

const ID_DO_TRELLO = /^[\w-]{1,64}$/;
/** O Trello responde (a chave e o token no Portainer), mesmo sem nenhuma lista configurada ainda. */
const falaComOTrello = (trello) => !!(trello?.ler && trello.config?.chave && trello.config?.token);
const limpo = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '');

/** As praças salvas (a coleção PRACAS) ou, sem ela, as de fábrica com as variáveis do Portainer; o campo Praça; o
    que foi ligado à mão (LIGADO_A_MAO, em JSON). */
export function pracasSalvas(env) {
  let aMao = [];
  try {
    aMao = JSON.parse(env.LIGADO_A_MAO || '[]');
  } catch {
    aMao = [];
  }
  return {
    pracas: pracasDaConfiguracao(env),
    campoPraca: limpo(env.TRELLO_CAMPO_PRACA),
    // o LIGADO_A_MAO é um só para a tela: o do card (#74) fica com a seção Card, o dos filmes (#75) com a Filmes
    aMao: Array.isArray(aMao) ? aMao.filter((k) => typeof k === 'string' && !eDoCard(k) && !eDosFilmes(k)) : [],
  };
}

/**
 * O quadro do Trello: o de TRELLO_QUADRO ou, sem ele, o da primeira lista já configurada (a entrada ou a saída de uma
 * praça, a reserva, o VT), pelo idBoard dela. Lê as listas (também as arquivadas), os campos personalizados e as
 * etiquetas (as dos cards de filme, #75).
 * @returns { id, de: 'variavel' | 'lista', listas, campos, etiquetas } ou null quando não há como saber o quadro
 */
export async function lerQuadro(trello, env, pracas) {
  let id = limpo(env.TRELLO_QUADRO);
  let de = 'variavel';
  if (!id) {
    de = 'lista';
    const configuradas = [...pracas.flatMap((p) => [p.entrada, p.saida]), limpo(env.TRELLO_LISTA), limpo(env.TRELLO_LISTA_VT)].filter((x) => ID_DO_TRELLO.test(x));
    for (const lista of [...new Set(configuradas)]) {
      const l = await trello.lerSeExistir(`/lists/${lista}`, { fields: 'idBoard' });
      if (l?.idBoard) {
        id = String(l.idBoard);
        break;
      }
    }
  }
  if (!id || !ID_DO_TRELLO.test(id)) return null;
  const [listas, campos, etiquetas] = await Promise.all([
    trello.ler(`/boards/${id}/lists`, { filter: 'all', fields: 'name,closed' }),
    trello.ler(`/boards/${id}/customFields`),
    trello.lerSeExistir(`/boards/${id}/labels`, { fields: 'name,color', limit: '1000' }),
  ]);
  return {
    id,
    de,
    listas: (Array.isArray(listas) ? listas : []).map((l) => ({ id: String(l.id), nome: String(l.name ?? ''), arquivada: !!l.closed })),
    campos: (Array.isArray(campos) ? campos : []).map((c) => ({
      id: String(c.id),
      nome: String(c.name ?? ''),
      tipo: String(c.type ?? ''),
      // a cor diz qual é qual quando duas opções têm o mesmo nome
      opcoes: (c.options ?? []).map((o) => ({ id: String(o.id), nome: String(o.value?.text ?? ''), ...(o.color ? { cor: String(o.color) } : {}) })),
    })),
    etiquetas: (Array.isArray(etiquetas) ? etiquetas : []).map((e) => ({ id: String(e.id), nome: String(e.name ?? ''), ...(e.color ? { cor: String(e.color) } : {}) })),
  };
}

/** O quadro do Trello para as seções da tela; sem como ler, `erro` diz o que falta. */
export async function lerOQuadro(trello, env) {
  if (!falaComOTrello(trello)) return { quadro: null, erro: 'O Trello não está configurado (TRELLO_KEY e TRELLO_TOKEN no Portainer).' };
  const quadro = await lerQuadro(trello, env, pracasSalvas(env).pracas);
  if (!quadro) return { quadro: null, erro: 'Não sei qual é o quadro do Trello: falta TRELLO_QUADRO no Portainer (ou uma lista já configurada).' };
  return { quadro };
}

/** A seção como a tela lê: o salvo, a proposta (o salvo com o que o nome acha um só), o estado e o quadro lido.
    `lido` é o quadro já lido (lerOQuadro), para as seções lerem o Trello uma vez só. */
export async function lerSecaoPracas(trello, env, lido) {
  const salvo = pracasSalvas(env);
  const primeiraVez = !env.PRACAS;
  const { quadro, erro } = lido ?? (await lerOQuadro(trello, env));
  if (!quadro) return { primeiraVez, salvo, proposta: salvo, estado: null, quadro: null, erro };
  const proposta = ligarPeloNome(salvo, quadro, { primeiraVez });
  return { primeiraVez, salvo, proposta, estado: estadoDasPracas(proposta, quadro), quadro };
}

/** A seção que veio do navegador, limpa: as praças (com sigla), o campo e as chaves do ligado à mão. null se não vale.
    A sigla repetida passa (uma praça por vez): é a conferência que diz o erro. */
export function secaoDoPedido(corpo) {
  const bruto = corpo?.pracas;
  if (!bruto || !Array.isArray(bruto.pracas) || !bruto.pracas.length) return null;
  const pracas = bruto.pracas.map((p) => pracasDaConfiguracao({ PRACAS: JSON.stringify([p]) })[0]);
  if (!pracas.every((p, i) => p && p.sigla === String(bruto.pracas[i]?.sigla ?? '').trim().toUpperCase())) return null;
  // cada uma lida sozinha vira a padrão: a padrão é a marcada (ou a primeira)
  const padrao = Math.max(0, bruto.pracas.findIndex((p) => p?.padrao === true));
  pracas.forEach((p, i) => (p.padrao = i === padrao));
  const ids = [bruto.campoPraca, ...pracas.flatMap((p) => PONTAS.map((ponta) => p[ponta]))];
  if (!ids.every((x) => x === undefined || x === '' || ID_DO_TRELLO.test(String(x)))) return null;
  const chaves = new Set([CHAVE_DO_CAMPO, ...pracas.flatMap((p) => PONTAS.map((ponta) => chaveDa(p.sigla, ponta)))]);
  const aMao = Array.isArray(bruto.aMao) ? [...new Set(bruto.aMao.filter((k) => chaves.has(k)))] : [];
  return { pracas, campoPraca: String(bruto.campoPraca ?? '').trim(), aMao };
}

/** Confere a seção nova contra o quadro de agora e contra o salvo; com as claquetes recentes ({ dias, claquetes }),
    conta as que mudariam de praça. */
export async function conferirSecaoPracas(trello, env, nova, recentes, lido) {
  const salvo = pracasSalvas(env);
  const { quadro } = lido ?? (await lerOQuadro(trello, env));
  if (!quadro) return { ok: false, itens: [{ tipo: 'erro', titulo: 'Trello', detalhe: 'não consegui ler o quadro do Trello.' }], muda: [] };
  return conferirPracas(nova, salvo, quadro, recentes);
}

/**
 * A opção de cada praça nova no campo Praça (#73), depois da conferência e antes de salvar: a que o nome acha (uma só:
 * a de uma tentativa anterior que não chegou a salvar) é usada; senão, o PROMeiro cria a opção com a sigla. Se o
 * Trello recusa, lança: quem chama não salva nada.
 * @returns a seção com as opções preenchidas, e as siglas cuja opção foi criada agora
 */
export async function criarOpcoesDasNovas(trello, env, nova) {
  const novas = pracasNovas(nova, pracasSalvas(env)).filter((sigla) => !nova.pracas.find((p) => p.sigla === sigla).opcao);
  if (!novas.length || !nova.campoPraca) return { secao: nova, criadas: [] };
  const quadro = await lerQuadro(trello, env, nova.pracas);
  const campo = quadro?.campos.find((c) => c.id === nova.campoPraca);
  if (!campo || campo.tipo !== CAMPO_PRACA.tipo) throw new Error('o campo Praça não está mais no quadro.');
  const criadas = [];
  const pracas = [];
  for (const p of nova.pracas) {
    if (!novas.includes(p.sigla)) {
      pracas.push(p);
      continue;
    }
    const achado = acharOpcao(campo, p);
    if (achado.como === 'dobro') throw new Error(`o campo Praça tem duas opções "${p.sigla}".`);
    let opcao = achado.como === 'um' ? achado.id : '';
    if (!opcao) {
      opcao = String((await trello.criarOpcao(campo.id, p.sigla))?.id ?? '');
      if (!ID_DO_TRELLO.test(opcao)) throw new Error(`o Trello não devolveu a opção "${p.sigla}".`);
      criadas.push(p.sigla);
    }
    pracas.push({ ...p, opcao });
  }
  return { secao: { ...nova, pracas }, criadas };
}

/** O que vai para a configuração viva quando a seção é salva. */
export const mudancasDaSecao = (nova) => ({
  PRACAS: JSON.stringify(nova.pracas),
  TRELLO_CAMPO_PRACA: nova.campoPraca,
  LIGADO_A_MAO: JSON.stringify(nova.aMao),
});
