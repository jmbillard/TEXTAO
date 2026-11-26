/* O histórico da Configuração (#78): cada gravação (servidor/configuracao.mjs guarda quem, quando e o antigo → o novo
   de cada variável) ganha aqui as linhas legíveis, com os nomes do Trello em vez dos ids, pelas mesmas regras do
   "o que muda" das seções; e voltar a uma linha passa pela mesma conferência da seção que ela mexe. O que não passa
   fica travado, com o porquê. */
import { conferirPracas, oQueMuda } from '../src/modelo/ligarPeloNome.ts';
import { cardDaConfiguracao, conferirCard, oQueMudaNoCard } from '../src/modelo/ligarOCard.ts';
import { conferirFilmes, oQueMudaNosFilmes } from '../src/modelo/ligarOsFilmes.ts';
import { pracasDaConfiguracao } from '../src/modelo/pracas.ts';
import { administradoresSalvos, ehAdministrador } from '../src/modelo/pessoas.ts';
import { pracasSalvas } from './configuracao-pracas.mjs';
import { VARIAVEIS_DO_CARD } from './configuracao-card.mjs';
import { VARIAVEIS_DOS_FILMES, filmesSalvos } from './configuracao-filmes.mjs';

/** As variáveis que cada seção lê (o LIGADO_A_MAO é das três seções do quadro). */
const DAS_PRACAS = new Set(['PRACAS', 'TRELLO_CAMPO_PRACA', 'TRELLO_PRACAS', ...['SP', 'RJ', 'G5', 'INTER'].flatMap((p) => [`TRELLO_LISTA_${p}`, `TRELLO_SAIDA_${p}`])]);
const DO_CARD = new Set(VARIAVEIS_DO_CARD);
const DOS_FILMES = new Set(VARIAVEIS_DOS_FILMES);
const DO_QUADRO = (n) => DAS_PRACAS.has(n) || DO_CARD.has(n) || DOS_FILMES.has(n) || n === 'LIGADO_A_MAO';
/** O nome legível das variáveis que nenhuma seção descreve. */
const ROTULOS = {
  TRELLO_LISTA: 'Lista reserva',
  TRELLO_LISTA_ENTREGUES: 'Lista dos entregues',
  TEABLE_FILMES_POSTER: 'Pôster dos filmes',
  LIGADO_A_MAO: 'Ligado à mão',
};
const QUADRO_VAZIO = { id: '', nome: '', listas: [], campos: [], etiquetas: [] };
const limpo = (v) => String(v ?? '').trim();
const prefixar = (secao, linhas) => linhas.map((l) => ({ oque: `${secao} · ${l.oque}`, antes: String(l.antes), depois: String(l.depois) }));

/**
 * As linhas legíveis de uma gravação: [{ oque, antes, depois }].
 * @param antes, depois os valores da configuração antes e depois (o Portainer com o salvo por cima)
 * @param nomes as variáveis que mudaram
 * @param o.quadro o quadro do Trello lido por último (os nomes das listas, campos, opções e etiquetas)
 * @param o.nomeDaPessoa (email) → o nome de quem já entrou no PROMeiro, ou o e-mail
 * @param o.nomeDoQuadro, o.nomeDaBase (id) → o nome conhecido, ou ''
 */
export function descreverMudanca(antes, depois, nomes, { quadro = null, nomeDaPessoa = (e) => e, nomeDoQuadro = () => '', nomeDaBase = () => '' } = {}) {
  const q = quadro ?? QUADRO_VAZIO;
  const mudou = new Set(nomes);
  // trocar o quadro ou a base liga tudo de novo pelo nome: a linha diz a troca, não cada id
  if (mudou.has('TRELLO_QUADRO')) {
    const nome = (id) => (id ? nomeDoQuadro(id) || (q.id === id ? q.nome : '') || id : q.id && q.nome ? q.nome : 'o da lista de uma praça');
    const linhas = [{ oque: 'Quadro do Trello', antes: nome(limpo(antes.TRELLO_QUADRO)), depois: nome(limpo(depois.TRELLO_QUADRO)) }];
    if (nomes.some(DO_QUADRO)) linhas.push({ oque: 'Ligações', antes: 'as do quadro antigo', depois: 'ligadas de novo pelo nome no quadro novo' });
    return linhas;
  }
  if (mudou.has('TEABLE_PG_ESQUEMA')) {
    const nome = (id) => (id ? nomeDaBase(id) || id : '—');
    const linhas = [{ oque: 'Base do Teable', antes: nome(limpo(antes.TEABLE_PG_ESQUEMA)), depois: nome(limpo(depois.TEABLE_PG_ESQUEMA)) }];
    if (nomes.some((n) => n.startsWith('TEABLE_') && n !== 'TEABLE_PG_ESQUEMA')) linhas.push({ oque: 'Tabelas', antes: 'as da base antiga', depois: 'achadas de novo pelo nome na base nova' });
    return linhas;
  }
  const linhas = [];
  const s = secoesDe(nomes);
  if (s.pracas) linhas.push(...prefixar('Praças', oQueMuda(pracasSalvas(depois), pracasSalvas(antes), q)));
  if (s.card) linhas.push(...prefixar('Card', oQueMudaNoCard(cardDaConfiguracao(depois), cardDaConfiguracao(antes), q)));
  if (s.filmes) {
    const filmes = (env) => filmesSalvos(env, pracasDaConfiguracao(env), []);
    linhas.push(...prefixar('Filmes', oQueMudaNosFilmes(filmes(depois), filmes(antes), q)));
  }
  if (s.pessoas) {
    const a = administradoresSalvos(antes);
    const d = administradoresSalvos(depois);
    const saiu = a.filter((e) => !d.includes(e)).map(nomeDaPessoa);
    const entrou = d.filter((e) => !a.includes(e)).map((e) => `+ ${nomeDaPessoa(e)}`);
    if (saiu.length || entrou.length) linhas.push({ oque: 'Administradores', antes: saiu.join(', ') || '—', depois: entrou.join(', ') || '—' });
  }
  // o que nenhuma seção descreve: o nome da variável e o valor (o nome da lista, quando é uma do quadro)
  const valor = (v) => {
    const id = limpo(v);
    return id ? (q.listas.find((l) => l.id === id)?.nome ?? q.campos.find((c) => c.id === id)?.nome ?? id) : '—';
  };
  for (const n of nomes)
    if (!DO_QUADRO(n) && n !== 'ADMINISTRADORES' && limpo(antes[n]) !== limpo(depois[n])) linhas.push({ oque: ROTULOS[n] ?? n, antes: valor(antes[n]), depois: valor(depois[n]) });
  // nada mudou no que vale (o valor do Portainer passou a ser guardado na tela, ou só a marca do ligado à mão)
  if (!linhas.length) linhas.push({ oque: 'Guardado na tela', antes: 'Portainer', depois: 'os mesmos valores' });
  return linhas;
}

/** As seções que uma gravação mexe, pelas variáveis. */
export function secoesDe(nomes) {
  return {
    quadro: nomes.includes('TRELLO_QUADRO'),
    base: nomes.includes('TEABLE_PG_ESQUEMA'),
    pracas: nomes.some((n) => DAS_PRACAS.has(n) || n === 'LIGADO_A_MAO'),
    card: nomes.some((n) => DO_CARD.has(n) || n === 'LIGADO_A_MAO'),
    filmes: nomes.some((n) => DOS_FILMES.has(n) || n === 'LIGADO_A_MAO' || DAS_PRACAS.has(n)),
    pessoas: nomes.includes('ADMINISTRADORES'),
  };
}

/**
 * Voltar a uma linha do histórico: os valores de antes dela passam pela mesma conferência da seção que ela mexe.
 * @param atual os valores de agora; alvo os valores que valeriam voltando; nomes as variáveis da linha
 * @param o.lido o quadro do alvo, lido ({ quadro, erro }); o.quadros os quadros que o token enxerga (null: não leu);
 *   o.bases as bases do Teable (null: não leu); o.sessoes as sessões do cadastro; o.eu quem está voltando
 * @returns { pode: true } ou { pode: false, motivo } (com jaVale quando os valores de antes já são os de agora)
 */
export function conferirAVolta(atual, alvo, nomes, { lido = null, quadros = null, bases = null, sessoes = null, eu = '' } = {}) {
  if (nomes.every((n) => limpo(atual[n]) === limpo(alvo[n]))) return { pode: false, jaVale: true, motivo: 'é o que vale agora.' };
  const s = secoesDe(nomes);
  const motivos = [];
  const quadro = limpo(alvo.TRELLO_QUADRO);
  if (s.quadro && quadro && quadros && !quadros.some((x) => x.id === quadro)) motivos.push('o quadro não está mais entre os que o token do Trello enxerga.');
  else if (s.quadro && quadro && !quadros) motivos.push('não consegui ler os quadros do Trello.');
  const base = limpo(alvo.TEABLE_PG_ESQUEMA);
  if (s.base && base && bases && !bases.some((x) => x.id === base)) motivos.push('a base não está mais entre as que o token do Teable enxerga.');
  else if (s.base && base && !bases) motivos.push('não consegui ler as bases do Teable.');
  if ((s.pracas || s.card || s.filmes) && !motivos.length) {
    const q = lido?.quadro;
    if (!q) motivos.push(lido?.erro || 'não consegui ler o quadro do Trello.');
    else {
      // só conta o erro que voltar traz: o que já está errado agora (e continua) não trava a volta; voltando a outro
      // quadro, os ids de agora nem são dele, e todo erro conta
      const erros = (env) => {
        const itens = [];
        if (s.pracas) itens.push(...conferirPracas(pracasSalvas(env), pracasSalvas(atual), q).itens);
        if (s.card) itens.push(...conferirCard(cardDaConfiguracao(env), cardDaConfiguracao(atual), q).itens);
        if (s.filmes) {
          const pracas = pracasDaConfiguracao(env);
          itens.push(...conferirFilmes(filmesSalvos(env, pracas, sessoes), filmesSalvos(atual, pracasDaConfiguracao(atual), sessoes), q, pracas).itens);
        }
        return itens.filter((i) => i.tipo === 'erro').map((i) => `${i.titulo}: ${i.detalhe}`);
      };
      const agora = new Set(s.quadro ? [] : erros(atual));
      motivos.push(...erros(alvo).filter((m) => !agora.has(m)));
    }
  }
  if (s.pessoas && ehAdministrador(eu, atual) && !ehAdministrador(eu, alvo)) motivos.push('voltar tiraria você dos administradores.');
  return motivos.length ? { pode: false, motivo: [...new Set(motivos)].join(' ') } : { pode: true };
}
