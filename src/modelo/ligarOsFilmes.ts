/* A seção Filmes da Configuração (#75): para onde vai o card de filme que a aba Filmes cria. A praça dos cards
   (escolhida entre as praças: o card leva a opção dela no campo Praça), a lista dos cards de filme (a lista aberta com
   FILME no nome), a etiqueta de todo card de filme ("FILME") e a de cada sessão (a etiqueta com o nome da sessão), todas
   ligadas pelo nome. A sessão sem etiqueta é exceção (o card dela sairia só com a de todos). As sessões vêm do cadastro
   de atrações: as de acervo "do filme", mais a Sessão da Tarde. Os números da leitura da prévia (a pausa entre as
   páginas e a espera de uma página) ficam no "ver tudo". Do mesmo jeito que as praças e o card: o mesmo módulo serve
   ao servidor e ao navegador. */
import { casar, nomeComparavel, resumoDasLigacoes, type Achado, type ItemDaConferencia, type Ligacao, type Mudanca, type Problema, type QuadroLido } from './ligarPeloNome.ts';
import type { Praca } from './pracas.ts';

export interface SessaoDosFilmes {
  /** o nome da sessão como está no cadastro ("Corujão") */
  nome: string;
  /** a etiqueta dela no Trello (id; '' = nenhuma) */
  etiqueta: string;
}

/** O que a seção Filmes liga. */
export interface LigacoesDosFilmes {
  /** a sigla da praça dos cards de filme ('' = nenhuma; um id que não é de nenhuma praça fica como veio) */
  praca: string;
  /** a lista dos cards de filme (id) */
  lista: string;
  /** as etiquetas de todo card de filme (ids) */
  etiquetas: string[];
  /** uma por sessão, na ordem do cadastro */
  sessoes: SessaoDosFilmes[];
  /** a pausa entre as páginas e a espera de uma página da leitura da prévia, em ms ('' = o padrão) */
  pausaMs: string;
  esperaMs: string;
  /** as chaves do ligado à mão ("filmes.lista", "filmes.sessao.CORUJAO") */
  aMao: string[];
}

/** Os padrões da leitura da prévia (os mesmos de servidor/filmes.mjs). */
export const PAUSA_PADRAO_MS = 2500;
export const ESPERA_PADRAO_MS = 240_000;
/** O nome da etiqueta de todo card de filme. */
export const ETIQUETA_DOS_FILMES = 'FILME';

export const CHAVE_DA_LISTA = 'filmes.lista';
export const CHAVE_DA_ETIQUETA = 'filmes.etiqueta';
export const CHAVE_DA_PRACA = 'filmes.praca';
/** A chave da etiqueta de uma sessão: pelo nome comparável ("filmes.sessao.SESSAO DA TARDE"). */
export const chaveDaEtiquetaDaSessao = (nome: string) => `filmes.sessao.${nomeComparavel(nome)}`;
const DOS_FILMES = /^filmes\./;
export const eDosFilmes = (k: string) => DOS_FILMES.test(k);

const limpo = (v: unknown) => String(v ?? '').trim().replace(/^["']|["']$/g, '');
const lista = (v: unknown) =>
  String(v ?? '')
    .split(',')
    .map(limpo)
    .filter(Boolean);
/** "SUPERCINE=id,Corujão=id" → [['SUPERCINE', 'id'], ['Corujão', 'id']] */
const pares = (v: unknown) =>
  lista(v)
    .map((p) => p.split('=').map((x) => x.trim()))
    .filter(([k, id]) => k && id) as [string, string][];

/** A praça do Portainer pela sigla, ou pelo id da opção dela no campo Praça (o TRELLO_FILMES_PRACA de hoje). */
function siglaDaPraca(v: string, pracas: readonly Praca[]): string {
  if (!v) return '';
  return pracas.find((p) => p.sigla === v.toUpperCase())?.sigla ?? pracas.find((p) => p.opcao && p.opcao === v)?.sigla ?? v;
}

/** A opção do campo Praça que o card de filme leva: a da praça escolhida (pela sigla) ou, sendo um id, ele mesmo. */
export function opcaoDaPracaDosFilmes(valor: unknown, pracas: readonly Praca[]): string {
  const v = limpo(valor);
  const p = v && pracas.find((x) => x.sigla === v.toUpperCase());
  return p ? p.opcao : v;
}

/**
 * A seção como está na configuração (o salvo, ou o Portainer): as variáveis de sempre. As sessões são as do cadastro
 * (na ordem dele); a etiqueta guardada para uma sessão que não está no cadastro fica no fim, para não se perder.
 */
export function filmesDaConfiguracao(env: Record<string, string | undefined>, { pracas, sessoes }: { pracas: readonly Praca[]; sessoes: readonly string[] }): LigacoesDosFilmes {
  const guardadas = pares(env.TRELLO_FILMES_ETIQUETAS_SESSAO);
  const daSessao = (nome: string) => guardadas.filter(([k]) => nomeComparavel(k) === nomeComparavel(nome)).at(-1)?.[1] ?? '';
  const doCadastro = [...new Map(sessoes.filter((s) => s.trim()).map((s) => [nomeComparavel(s), s.trim()])).values()];
  const fora = guardadas.filter(([k], i) => !doCadastro.some((s) => nomeComparavel(s) === nomeComparavel(k)) && guardadas.findIndex(([o]) => nomeComparavel(o) === nomeComparavel(k)) === i).map(([k]) => k);
  let aMao: unknown = [];
  try {
    aMao = JSON.parse(env.LIGADO_A_MAO || '[]');
  } catch {
    aMao = [];
  }
  return {
    praca: siglaDaPraca(limpo(env.TRELLO_FILMES_PRACA), pracas),
    lista: limpo(env.TRELLO_LISTA_FILMES),
    etiquetas: [...new Set(lista(env.TRELLO_FILMES_ETIQUETAS))],
    sessoes: [...doCadastro, ...fora].map((nome) => ({ nome, etiqueta: daSessao(nome) })),
    pausaMs: limpo(env.FILMES_INTERVALO_MS),
    esperaMs: limpo(env.FILMES_TEMPO_MS),
    aMao: Array.isArray(aMao) ? aMao.filter((k): k is string => typeof k === 'string' && eDosFilmes(k)) : [],
  };
}

/** O que vai para a configuração viva quando a seção é salva (o LIGADO_A_MAO junta com o das outras, em quem salva). */
export function mudancasDosFilmes(c: LigacoesDosFilmes): Record<string, string> {
  return {
    TRELLO_FILMES_PRACA: c.praca,
    TRELLO_LISTA_FILMES: c.lista,
    TRELLO_FILMES_ETIQUETAS: c.etiquetas.join(','),
    TRELLO_FILMES_ETIQUETAS_SESSAO: c.sessoes
      .filter((s) => s.etiqueta)
      .map((s) => `${s.nome}=${s.etiqueta}`)
      .join(','),
    FILMES_INTERVALO_MS: c.pausaMs,
    FILMES_TEMPO_MS: c.esperaMs,
  };
}

/* ---------- ligar pelo nome ---------- */

const palavrasDe = (s: string) => nomeComparavel(s).split(' ').filter(Boolean);
/** A lista dos cards de filme: aberta, com FILME (ou FILMES) no nome, como palavra inteira. */
export const acharListaDosFilmes = (quadro: QuadroLido): Achado => casar(quadro.listas, (l) => !l.arquivada && palavrasDe(l.nome).some((p) => p === 'FILME' || p === 'FILMES'));
/** A etiqueta pelo nome exato (sem caixa, acento e pontuação); a etiqueta sem nome não liga. */
export const acharEtiqueta = (quadro: QuadroLido, nome: string): Achado => casar(quadro.etiquetas ?? [], (e) => !!nomeComparavel(e.nome) && nomeComparavel(e.nome) === nomeComparavel(nome));

/**
 * Liga pelo nome o que está vazio (achou um só: guarda o id). O que já tem id fica como está (renomear no Trello não
 * quebra). Na primeira vez (os ids vêm do Portainer), o id que o nome não acharia fica marcado como ligado à mão.
 */
export function ligarOsFilmesPeloNome(c: LigacoesDosFilmes, quadro: QuadroLido, { primeiraVez }: { primeiraVez: boolean }): LigacoesDosFilmes {
  const aMao = new Set(c.aMao);
  const doNome = (a: Achado) => (a.como === 'um' ? a.id : '');
  const naPrimeira = (chave: string, ids: string[], a: Achado) => {
    if (primeiraVez && ids.length && !(a.como === 'um' && ids.length === 1 && ids[0] === a.id)) aMao.add(chave);
  };
  const daLista = acharListaDosFilmes(quadro);
  naPrimeira(CHAVE_DA_LISTA, c.lista ? [c.lista] : [], daLista);
  const daEtiqueta = acharEtiqueta(quadro, ETIQUETA_DOS_FILMES);
  naPrimeira(CHAVE_DA_ETIQUETA, c.etiquetas, daEtiqueta);
  const sessoes = c.sessoes.map((s) => {
    const achado = acharEtiqueta(quadro, s.nome);
    naPrimeira(chaveDaEtiquetaDaSessao(s.nome), s.etiqueta ? [s.etiqueta] : [], achado);
    return s.etiqueta ? s : { ...s, etiqueta: doNome(achado) };
  });
  const chaves = [CHAVE_DA_LISTA, CHAVE_DA_ETIQUETA, ...c.sessoes.map((s) => chaveDaEtiquetaDaSessao(s.nome))];
  return {
    ...c,
    lista: c.lista || doNome(daLista),
    etiquetas: c.etiquetas.length ? c.etiquetas : doNome(daEtiqueta) ? [doNome(daEtiqueta)] : [],
    sessoes,
    aMao: chaves.filter((k) => aMao.has(k)),
  };
}

/** Liga à mão: a lista, a etiqueta de todos (uma só) ou a de uma sessão (pela chave). */
export function ligarAMaoNosFilmes(c: LigacoesDosFilmes, chave: string, id: string): LigacoesDosFilmes {
  const aMao = [...new Set([...c.aMao, chave])];
  if (chave === CHAVE_DA_LISTA) return { ...c, lista: id, aMao };
  if (chave === CHAVE_DA_ETIQUETA) return { ...c, etiquetas: [id], aMao };
  return { ...c, sessoes: c.sessoes.map((s) => (chaveDaEtiquetaDaSessao(s.nome) === chave ? { ...s, etiqueta: id } : s)), aMao };
}

/** Desfaz o ligado à mão destas chaves: volta o que o nome acha (um só) ou fica vazio (vira exceção). */
export function desfazerAMaoDosFilmes(c: LigacoesDosFilmes, quadro: QuadroLido, chaves: readonly string[]): LigacoesDosFilmes {
  const limpa: LigacoesDosFilmes = {
    ...c,
    lista: chaves.includes(CHAVE_DA_LISTA) ? '' : c.lista,
    etiquetas: chaves.includes(CHAVE_DA_ETIQUETA) ? [] : c.etiquetas,
    sessoes: c.sessoes.map((s) => (chaves.includes(chaveDaEtiquetaDaSessao(s.nome)) ? { ...s, etiqueta: '' } : s)),
    aMao: c.aMao.filter((k) => !chaves.includes(k)),
  };
  return ligarOsFilmesPeloNome(limpa, quadro, { primeiraVez: false });
}

/* ---------- o estado ---------- */

/** A ligação de uma sessão: a de sempre, com o nome da sessão. */
export type LigacaoDaSessao = Ligacao & { sessao: string };
/** Um número da leitura da prévia: o valor que vale (ms) e de onde vem. */
export interface NumeroDosFilmes {
  ms: number;
  como: 'padrao' | 'configurado';
}
export interface EstadoDosFilmes {
  /** a praça dos cards: 'nenhum' sem praça; 'sumiu' quando não é uma das praças */
  praca: Ligacao;
  lista: Ligacao;
  etiqueta: Ligacao;
  sessoes: LigacaoDaSessao[];
  pausa: NumeroDosFilmes;
  espera: NumeroDosFilmes;
  /** o que a tela mostra: os problemas e o ligado à mão */
  excecoes: Ligacao[];
  /** "4 sessões · tudo ligado" */
  resumo: string;
}

const msDe = (v: string, padrao: number): NumeroDosFilmes => (v === '' || !Number.isFinite(Number(v)) ? { ms: padrao, como: 'padrao' } : { ms: Number(v), como: 'configurado' });

/** O estado de cada ligação, as exceções (o problema e o ligado à mão) e a linha de estado da seção. */
export function estadoDosFilmes(c: LigacoesDosFilmes, quadro: QuadroLido, pracas: readonly Praca[]): EstadoDosFilmes {
  const aMao = new Set(c.aMao);
  const etiquetas = quadro.etiquetas ?? [];
  const montar = (chave: string, ids: string[], achado: Achado, ler: (id: string) => { nome: string; problema: Problema } | null): Ligacao => {
    const base = { chave, id: ids.join(','), candidatos: [] as string[] };
    if (!ids.length) return { ...base, nome: '', como: '', problema: achado.como === 'dobro' ? 'dobro' : 'nenhum', candidatos: achado.como === 'dobro' ? achado.ids : [] };
    const lidos = ids.map(ler);
    const como = aMao.has(chave) ? ('mao' as const) : ('nome' as const);
    if (lidos.some((l) => !l)) return { ...base, nome: lidos.filter(Boolean).map((l) => l!.nome).join(', '), como, problema: 'sumiu' };
    return { ...base, nome: lidos.map((l) => l!.nome).join(', '), como, problema: lidos.find((l) => l!.problema)?.problema ?? '' };
  };
  const lerEtiqueta = (id: string) => {
    const e = etiquetas.find((x) => x.id === id);
    return e ? { nome: e.nome, problema: '' as Problema } : null;
  };
  const lerLista = (id: string) => {
    const l = quadro.listas.find((x) => x.id === id);
    return l ? { nome: l.nome, problema: (l.arquivada ? 'arquivada' : '') as Problema } : null;
  };
  const daPraca = pracas.find((p) => p.sigla === c.praca);
  const praca: Ligacao = { chave: CHAVE_DA_PRACA, id: c.praca, nome: daPraca?.sigla ?? '', como: c.praca ? 'nome' : '', problema: !c.praca ? 'nenhum' : daPraca ? '' : 'sumiu', candidatos: [] };
  const listaL = montar(CHAVE_DA_LISTA, c.lista ? [c.lista] : [], acharListaDosFilmes(quadro), lerLista);
  const etiqueta = montar(CHAVE_DA_ETIQUETA, c.etiquetas, acharEtiqueta(quadro, ETIQUETA_DOS_FILMES), lerEtiqueta);
  const sessoes = c.sessoes.map((s) => ({ ...montar(chaveDaEtiquetaDaSessao(s.nome), s.etiqueta ? [s.etiqueta] : [], acharEtiqueta(quadro, s.nome), lerEtiqueta), sessao: s.nome }));
  const ligadas = [listaL, etiqueta, ...sessoes];
  const excecoes = [...(praca.problema ? [praca] : []), ...ligadas.filter((l) => l.problema || l.como === 'mao')];
  const resumo = [
    `${c.sessoes.length} ${c.sessoes.length === 1 ? 'sessão' : 'sessões'}`,
    ...(praca.problema ? ['sem a praça dos cards'] : []),
    ...resumoDasLigacoes(ligadas).filter((x) => !(praca.problema && x === 'tudo ligado')),
  ];
  return { praca, lista: listaL, etiqueta, sessoes, pausa: msDe(c.pausaMs, PAUSA_PADRAO_MS), espera: msDe(c.esperaMs, ESPERA_PADRAO_MS), excecoes, resumo: resumo.join(' · ') };
}

/** "2,5 s", "4 min", "1 min 30 s" */
export function duracao(ms: number): string {
  if (ms < 60_000) return `${String(Math.round(ms / 100) / 10).replace('.', ',')} s`;
  const min = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s ? `${min} min ${s} s` : `${min} min`;
}

/* ---------- conferir antes de salvar ---------- */

export interface ConferenciaDosFilmes {
  ok: boolean;
  itens: ItemDaConferencia[];
  muda: Mudanca[];
}

const nomeDaEtiqueta = (quadro: QuadroLido, id: string) => (id ? ((quadro.etiquetas ?? []).find((e) => e.id === id)?.nome ?? '(sumiu)') : '—');
const nomeDaLista = (quadro: QuadroLido, id: string) => (id ? (quadro.listas.find((l) => l.id === id)?.nome ?? '(sumiu)') : '—');

/**
 * Confere a seção Filmes antes de salvar: a praça é uma das praças (e tem a opção no campo Praça); a lista existe e
 * está aberta; cada etiqueta existe no quadro; a pausa é um número inteiro de 0 a 10 minutos e a espera de 1 segundo
 * a 30 minutos. O que está vazio é aviso (o card vai sem aquilo; o Enviar some sem a lista). Diz também o que muda,
 * com os nomes do Trello. Nada aqui salva.
 */
export function conferirFilmes(novo: LigacoesDosFilmes, antes: LigacoesDosFilmes, quadro: QuadroLido, pracas: readonly Praca[]): ConferenciaDosFilmes {
  const itens: ItemDaConferencia[] = [];
  const daPraca = pracas.find((p) => p.sigla === novo.praca);
  if (!novo.praca) itens.push({ tipo: 'aviso', titulo: 'Praça dos cards', detalhe: 'nenhuma escolhida: o card de filme vai sem a praça.' });
  else if (!daPraca) itens.push({ tipo: 'erro', titulo: 'Praça dos cards', detalhe: 'não é uma das praças. Escolha uma.' });
  else if (!daPraca.opcao) itens.push({ tipo: 'aviso', titulo: 'Praça dos cards', detalhe: `${daPraca.sigla} não tem a opção no campo Praça: o card de filme vai sem a praça.` });
  else itens.push({ tipo: 'ok', titulo: 'Praça dos cards', detalhe: daPraca.sigla });

  const l = quadro.listas.find((x) => x.id === novo.lista);
  if (!novo.lista) itens.push({ tipo: 'aviso', titulo: 'Lista dos cards de filme', detalhe: 'nada ligado: o Enviar da aba Filmes some.' });
  else if (!l) itens.push({ tipo: 'erro', titulo: 'Lista dos cards de filme', detalhe: 'a lista não existe mais no quadro.' });
  else if (l.arquivada) itens.push({ tipo: 'erro', titulo: 'Lista dos cards de filme', detalhe: `"${l.nome}" está arquivada no Trello.` });
  else itens.push({ tipo: 'ok', titulo: 'Lista dos cards de filme', detalhe: `"${l.nome}", aberta` });

  const existe = (id: string) => (quadro.etiquetas ?? []).some((e) => e.id === id);
  let etiquetasOk = true;
  if (!novo.etiquetas.length) itens.push({ tipo: 'aviso', titulo: 'Etiqueta de todos', detalhe: `nada ligado: o card de filme vai sem a etiqueta ${ETIQUETA_DOS_FILMES}.` });
  else if (!novo.etiquetas.every(existe)) {
    etiquetasOk = false;
    itens.push({ tipo: 'erro', titulo: 'Etiqueta de todos', detalhe: 'a etiqueta não existe mais no quadro.' });
  }
  for (const s of novo.sessoes) {
    if (!s.etiqueta) itens.push({ tipo: 'aviso', titulo: `Etiqueta de ${s.nome}`, detalhe: 'nada ligado: o card dessa sessão vai só com a etiqueta de todos.' });
    else if (!existe(s.etiqueta)) {
      etiquetasOk = false;
      itens.push({ tipo: 'erro', titulo: `Etiqueta de ${s.nome}`, detalhe: 'a etiqueta não existe mais no quadro.' });
    }
  }
  if (etiquetasOk && (novo.etiquetas.length || novo.sessoes.some((s) => s.etiqueta))) itens.push({ tipo: 'ok', titulo: 'Etiquetas', detalhe: 'todas existem no quadro' });

  const numero = (titulo: string, v: string, min: number, max: number) => {
    if (v === '') return;
    const n = Number(v);
    if (!/^\d+$/.test(v) || n < min || n > max) itens.push({ tipo: 'erro', titulo, detalhe: `de ${duracao(min)} a ${duracao(max)}.` });
  };
  numero('Pausa entre páginas', novo.pausaMs, 0, 600_000);
  numero('Espera por página', novo.esperaMs, 1000, 1_800_000);
  return { ok: !itens.some((i) => i.tipo === 'erro'), itens, muda: oQueMudaNosFilmes(novo, antes, quadro) };
}

/** O que muda de `antes` para `novo`, com os nomes do Trello. */
export function oQueMudaNosFilmes(novo: LigacoesDosFilmes, antes: LigacoesDosFilmes, quadro: QuadroLido): Mudanca[] {
  const muda: Mudanca[] = [];
  const mao = (chave: string) => (novo.aMao.includes(chave) ? ' (à mão)' : '');
  if (novo.praca !== antes.praca) muda.push({ oque: 'Praça dos cards de filme', antes: antes.praca || '—', depois: novo.praca || '—' });
  if (novo.lista !== antes.lista) muda.push({ oque: 'Lista dos cards de filme', antes: nomeDaLista(quadro, antes.lista), depois: nomeDaLista(quadro, novo.lista) + mao(CHAVE_DA_LISTA) });
  const nomes = (ids: string[]) => ids.map((id) => nomeDaEtiqueta(quadro, id)).join(', ') || '—';
  if (novo.etiquetas.join(',') !== antes.etiquetas.join(',')) muda.push({ oque: 'Etiqueta de todos', antes: nomes(antes.etiquetas), depois: nomes(novo.etiquetas) + mao(CHAVE_DA_ETIQUETA) });
  for (const s of novo.sessoes) {
    const a = antes.sessoes.find((x) => nomeComparavel(x.nome) === nomeComparavel(s.nome))?.etiqueta ?? '';
    if (a !== s.etiqueta) muda.push({ oque: `Etiqueta de ${s.nome}`, antes: nomeDaEtiqueta(quadro, a), depois: nomeDaEtiqueta(quadro, s.etiqueta) + mao(chaveDaEtiquetaDaSessao(s.nome)) });
  }
  const num = (v: string, padrao: number) => (v === '' ? `${duracao(padrao)} (padrão)` : Number.isFinite(Number(v)) ? duracao(Number(v)) : v);
  if (novo.pausaMs !== antes.pausaMs) muda.push({ oque: 'Pausa entre páginas', antes: num(antes.pausaMs, PAUSA_PADRAO_MS), depois: num(novo.pausaMs, PAUSA_PADRAO_MS) });
  if (novo.esperaMs !== antes.esperaMs) muda.push({ oque: 'Espera por página', antes: num(antes.esperaMs, ESPERA_PADRAO_MS), depois: num(novo.esperaMs, ESPERA_PADRAO_MS) });
  return muda;
}
