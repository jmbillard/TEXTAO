/* A seção Card da Configuração (#74): os campos que o card leva no Trello (prioridade, complexidade, redator, editor,
   projeto, output, BOT, entrada), as opções que dependem de um campo (ALTA e MÉDIA da prioridade; BAIXA, MÉDIA e ALTA
   da complexidade, em ordem) e a lista do VT, todos ligados pelo nome. Um campo só liga com o tipo certo; a opção é
   sempre do campo dela: trocar o campo limpa as opções que não são do campo novo, e o nome liga de novo as que acha.
   Do mesmo jeito que as praças (ligarPeloNome.ts): o mesmo módulo serve ao servidor e ao navegador. */
import { casar, nomeComparavel, resumoDasLigacoes, type Achado, type ItemDaConferencia, type Ligacao, type Mudanca, type Problema, type QuadroLido } from './ligarPeloNome.ts';

/** O que se liga: um campo personalizado (pelo nome e pelo tipo), uma opção de um campo, ou uma lista. */
export type ItemDoCard =
  | { chave: string; o: 'campo'; rotulo: string; nome: string; tipo: string; variavel: string }
  | { chave: string; o: 'opcao'; rotulo: string; nome: string; de: string }
  | { chave: string; o: 'lista'; rotulo: string; nome: string; variavel: string };

/** Os nomes dos tipos de campo do Trello. */
export const NOME_DO_TIPO: Record<string, string> = { list: 'campo de lista', text: 'campo de texto', date: 'campo de data', checkbox: 'caixa de marcar', number: 'campo de número' };

export const ITENS_DO_CARD: readonly ItemDoCard[] = [
  { chave: 'prioridade', o: 'campo', rotulo: 'Prioridade', nome: 'Prioridade', tipo: 'list', variavel: 'TRELLO_CAMPO_PRIORIDADE' },
  { chave: 'prioridade.ALTA', o: 'opcao', rotulo: 'Prioridade ALTA', nome: 'ALTA', de: 'prioridade' },
  { chave: 'prioridade.MEDIA', o: 'opcao', rotulo: 'Prioridade MÉDIA', nome: 'MÉDIA', de: 'prioridade' },
  { chave: 'complexidade', o: 'campo', rotulo: 'Complexidade', nome: 'Complexidade', tipo: 'list', variavel: 'TRELLO_CAMPO_COMPLEXIDADE' },
  { chave: 'complexidade.BAIXA', o: 'opcao', rotulo: 'Complexidade BAIXA', nome: 'BAIXA', de: 'complexidade' },
  { chave: 'complexidade.MEDIA', o: 'opcao', rotulo: 'Complexidade MÉDIA', nome: 'MÉDIA', de: 'complexidade' },
  { chave: 'complexidade.ALTA', o: 'opcao', rotulo: 'Complexidade ALTA', nome: 'ALTA', de: 'complexidade' },
  { chave: 'redator', o: 'campo', rotulo: 'Redator', nome: 'Redator', tipo: 'list', variavel: 'TRELLO_CAMPO_REDATOR' },
  { chave: 'editor', o: 'campo', rotulo: 'Editor', nome: 'Editor', tipo: 'list', variavel: 'TRELLO_CAMPO_EDITOR' },
  { chave: 'projeto', o: 'campo', rotulo: 'Projeto', nome: 'Projeto', tipo: 'text', variavel: 'TRELLO_CAMPO_PROJETO' },
  { chave: 'output', o: 'campo', rotulo: 'Output', nome: 'Output', tipo: 'text', variavel: 'TRELLO_CAMPO_OUTPUT' },
  { chave: 'bot', o: 'campo', rotulo: 'BOT', nome: 'BOT', tipo: 'checkbox', variavel: 'TRELLO_CAMPO_BOT' },
  { chave: 'entrada', o: 'campo', rotulo: 'Entrada', nome: 'Entrada', tipo: 'date', variavel: 'TRELLO_CAMPO_ENTRADA' },
  { chave: 'vt', o: 'lista', rotulo: 'Lista do VT', nome: 'VT', variavel: 'TRELLO_LISTA_VT' },
];
const ITEM = new Map(ITENS_DO_CARD.map((i) => [i.chave, i]));
/** As opções da complexidade, na ordem de TRELLO_COMPLEXIDADE_OPCOES (o nível 1 é a primeira). */
const ORDEM_DA_COMPLEXIDADE = ['complexidade.BAIXA', 'complexidade.MEDIA', 'complexidade.ALTA'];

/** A chave do ligado à mão (em LIGADO_A_MAO, junto com as das praças): "card.prioridade.ALTA". */
export const chaveDoCard = (chave: string) => `card.${chave}`;
const DO_CARD = /^card\./;
export const eDoCard = (k: string) => DO_CARD.test(k);

/** O que a seção Card liga: os ids (pela chave do item), os campos copiados do card do filme e o ligado à mão. */
export interface LigacoesDoCard {
  ids: Record<string, string>;
  /** os campos copiados do card do filme nas sessões (TRELLO_CAMPOS_FILME): não se ligam pelo nome */
  doFilme: string[];
  /** as chaves do ligado à mão ("card.prioridade") */
  aMao: string[];
}

const limpo = (v: unknown) => String(v ?? '').trim().replace(/^["']|["']$/g, '');
const listaDoTexto = (v: unknown) =>
  String(v ?? '')
    .split(',')
    .map((s) => limpo(s));

/** A seção como está na configuração (o salvo, ou o Portainer): as variáveis de sempre. */
export function cardDaConfiguracao(env: Record<string, string | undefined>): LigacoesDoCard {
  const ids: Record<string, string> = {};
  const complexidades = listaDoTexto(env.TRELLO_COMPLEXIDADE_OPCOES);
  for (const i of ITENS_DO_CARD) {
    if (i.o !== 'opcao') ids[i.chave] = limpo(env[i.variavel]);
    else if (i.de === 'prioridade') ids[i.chave] = limpo(i.chave === 'prioridade.ALTA' ? env.TRELLO_PRIORIDADE_ALTA : env.TRELLO_PRIORIDADE_MEDIA);
    else ids[i.chave] = complexidades[ORDEM_DA_COMPLEXIDADE.indexOf(i.chave)] ?? '';
  }
  let aMao: unknown = [];
  try {
    aMao = JSON.parse(env.LIGADO_A_MAO || '[]');
  } catch {
    aMao = [];
  }
  const chaves = new Set(ITENS_DO_CARD.map((i) => chaveDoCard(i.chave)));
  return {
    ids,
    doFilme: listaDoTexto(env.TRELLO_CAMPOS_FILME).filter(Boolean),
    aMao: Array.isArray(aMao) ? aMao.filter((k): k is string => typeof k === 'string' && chaves.has(k)) : [],
  };
}

/** O que vai para a configuração viva quando a seção é salva (o LIGADO_A_MAO junta com o das praças, em quem salva). */
export function mudancasDoCard(c: LigacoesDoCard): Record<string, string> {
  const m: Record<string, string> = {};
  for (const i of ITENS_DO_CARD) if (i.o !== 'opcao') m[i.variavel] = c.ids[i.chave] ?? '';
  m.TRELLO_PRIORIDADE_ALTA = c.ids['prioridade.ALTA'] ?? '';
  m.TRELLO_PRIORIDADE_MEDIA = c.ids['prioridade.MEDIA'] ?? '';
  const cx = ORDEM_DA_COMPLEXIDADE.map((k) => c.ids[k] ?? '');
  m.TRELLO_COMPLEXIDADE_OPCOES = cx.some(Boolean) ? cx.join(',') : '';
  m.TRELLO_CAMPOS_FILME = c.doFilme.join(',');
  return m;
}

/** O campo de que a opção depende, no quadro (pelo id ligado agora). */
const campoDe = (c: LigacoesDoCard, quadro: QuadroLido, de: string) => quadro.campos.find((x) => x.id === c.ids[de]);

/** O que o nome acha para o item: o campo pelo nome e pelo tipo; a opção no campo de que depende; a lista aberta. */
function acharDoCard(i: ItemDoCard, c: LigacoesDoCard, quadro: QuadroLido): Achado {
  const nome = nomeComparavel(i.nome);
  if (i.o === 'campo') return casar(quadro.campos, (x) => x.tipo === i.tipo && nomeComparavel(x.nome) === nome);
  if (i.o === 'lista') return casar(quadro.listas, (l) => !l.arquivada && nomeComparavel(l.nome) === nome);
  return casar(campoDe(c, quadro, i.de)?.opcoes ?? [], (o) => nomeComparavel(o.nome) === nome);
}

/**
 * Liga pelo nome o que está vazio (achou um só: guarda o id), os campos antes das opções que dependem deles. O que já
 * tem id fica como está (renomear no Trello não quebra). Na primeira vez (os ids vêm do Portainer), o id que o nome não
 * acharia fica marcado como ligado à mão.
 */
export function ligarOCardPeloNome(c: LigacoesDoCard, quadro: QuadroLido, { primeiraVez }: { primeiraVez: boolean }): LigacoesDoCard {
  const aMao = new Set(c.aMao);
  const novo: LigacoesDoCard = { ...c, ids: { ...c.ids } };
  for (const i of ITENS_DO_CARD) {
    const achado = acharDoCard(i, novo, quadro);
    const id = novo.ids[i.chave];
    if (primeiraVez && id && !(achado.como === 'um' && achado.id === id)) aMao.add(chaveDoCard(i.chave));
    if (!id && achado.como === 'um') novo.ids[i.chave] = achado.id;
  }
  return { ...novo, aMao: ITENS_DO_CARD.map((i) => chaveDoCard(i.chave)).filter((k) => aMao.has(k)) };
}

/**
 * A opção é sempre do campo dela: a opção que não está no campo ligado agora (o campo foi trocado) sai, deixa de ser
 * ligada à mão e o nome liga de novo a que acha no campo novo (um só); sem achar, fica vazia e vira exceção. Sem campo
 * ligado, as opções ficam vazias. O campo que sumiu do quadro não mexe nas opções (a exceção é o campo).
 */
export function acertarDependentes(c: LigacoesDoCard, quadro: QuadroLido): LigacoesDoCard {
  const ids = { ...c.ids };
  const tirar = new Set<string>();
  for (const i of ITENS_DO_CARD) {
    if (i.o !== 'opcao' || !ids[i.chave]) continue;
    const doCampo = ids[i.de];
    const campo = quadro.campos.find((x) => x.id === doCampo);
    if (doCampo && !campo) continue;
    if (campo?.opcoes.some((o) => o.id === ids[i.chave])) continue;
    ids[i.chave] = '';
    tirar.add(chaveDoCard(i.chave));
  }
  if (!tirar.size) return c;
  const limpoDoCard = { ...c, ids, aMao: c.aMao.filter((k) => !tirar.has(k)) };
  return ligarOCardPeloNome(limpoDoCard, quadro, { primeiraVez: false });
}

/** Desfaz o ligado à mão destes itens: volta o que o nome acha (um só) ou fica vazio. Trocar o campo acerta as opções. */
export function desfazerAMaoDoCard(c: LigacoesDoCard, quadro: QuadroLido, chaves: readonly string[]): LigacoesDoCard {
  const ids = { ...c.ids };
  for (const i of ITENS_DO_CARD) if (chaves.includes(chaveDoCard(i.chave))) ids[i.chave] = '';
  const religado = ligarOCardPeloNome({ ...c, ids, aMao: c.aMao.filter((k) => !chaves.includes(k)) }, quadro, { primeiraVez: false });
  return acertarDependentes(religado, quadro);
}

/** Liga à mão: o id escolhido, marcado; trocar o campo acerta as opções que dependem dele. */
export function ligarAMaoNoCard(c: LigacoesDoCard, quadro: QuadroLido, chave: string, id: string): LigacoesDoCard {
  const k = chaveDoCard(chave);
  return acertarDependentes({ ...c, ids: { ...c.ids, [chave]: id }, aMao: [...new Set([...c.aMao, k])] }, quadro);
}

/* ---------- o estado ---------- */

export interface EstadoDoCard {
  /** uma por item, na ordem da seção */
  itens: (Ligacao & { item: string })[];
  /** os campos copiados do card do filme, cada um com o nome lido (ou "sumiu") */
  doFilme: Ligacao[];
  excecoes: (Ligacao & { item: string })[];
  resumo: string;
}

/** O estado de cada ligação, as exceções (o problema e o ligado à mão) e a linha de estado da seção. A opção de um
    campo com problema não vira exceção à parte: a exceção é o campo. */
export function estadoDoCard(c: LigacoesDoCard, quadro: QuadroLido): EstadoDoCard {
  const aMao = new Set(c.aMao);
  const itens = ITENS_DO_CARD.map((i) => {
    const chave = chaveDoCard(i.chave);
    const id = c.ids[i.chave] ?? '';
    const base = { item: i.chave, chave, id, candidatos: [] as string[] };
    const como = aMao.has(chave) ? ('mao' as const) : ('nome' as const);
    if (!id) {
      const achado = acharDoCard(i, c, quadro);
      return { ...base, nome: '', como: '' as const, problema: (achado.como === 'dobro' ? 'dobro' : 'nenhum') as Problema, candidatos: achado.como === 'dobro' ? achado.ids : [] };
    }
    let existe: { nome: string; problema: Problema } | null = null;
    if (i.o === 'campo') {
      const x = quadro.campos.find((y) => y.id === id);
      existe = x ? { nome: x.nome, problema: x.tipo === i.tipo ? '' : 'tipo' } : null;
    } else if (i.o === 'lista') {
      const l = quadro.listas.find((y) => y.id === id);
      existe = l ? { nome: l.nome, problema: l.arquivada ? 'arquivada' : '' } : null;
    } else {
      // a opção com o nome repetido no campo diz qual é: "ALTA (a 3ª do campo)"
      const o = campoDe(c, quadro, i.de)?.opcoes.find((y) => y.id === id);
      existe = o ? { nome: nomeNoQuadro(i, id, c, quadro), problema: '' } : null;
    }
    return existe ? { ...base, como, ...existe } : { ...base, nome: '', como, problema: 'sumiu' as Problema };
  });
  const porItem = new Map(itens.map((l) => [l.item, l]));
  // a opção de um campo que não está ligado (ou que sumiu, ou é de outro tipo) espera o campo
  const conta = itens.filter((l) => {
    const i = ITEM.get(l.item)!;
    return i.o !== 'opcao' || !porItem.get(i.de)?.problema;
  });
  const doFilme = c.doFilme.map((id, n) => {
    const x = quadro.campos.find((y) => y.id === id);
    return { chave: `card.doFilme.${n}`, id, nome: x?.nome ?? '', como: 'nome' as const, problema: (x ? '' : 'sumiu') as Problema, candidatos: [] };
  });
  const excecoes = conta.filter((l) => l.problema || l.como === 'mao');
  return { itens, doFilme, excecoes, resumo: resumoDasLigacoes([...conta, ...doFilme]).join(' · ') };
}

/* ---------- conferir antes de salvar ---------- */

export interface ConferenciaDoCard {
  ok: boolean;
  itens: ItemDaConferencia[];
  muda: Mudanca[];
}

const SEM_NADA: Record<string, string> = {
  prioridade: 'nada ligado: o card vai sem a prioridade.',
  'prioridade.ALTA': 'nada ligado: o card da lista de prioridade vai sem a ALTA.',
  'prioridade.MEDIA': 'nada ligado: o card do filme inédito vai sem a MÉDIA.',
  complexidade: 'nada ligado: o card vai sem a complexidade.',
  'complexidade.BAIXA': 'nada ligado: o card de complexidade BAIXA vai sem ela.',
  'complexidade.MEDIA': 'nada ligado: o card de complexidade MÉDIA vai sem ela.',
  'complexidade.ALTA': 'nada ligado: o card de complexidade ALTA vai sem ela.',
  redator: 'nada ligado: o card vai sem o redator.',
  editor: 'nada ligado: o card vai sem o editor.',
  projeto: 'nada ligado: o card vai sem o projeto.',
  output: 'nada ligado: o card vai sem o output.',
  bot: 'nada ligado: o card vai sem o BOT.',
  entrada: 'nada ligado: o card vai sem a data de entrada.',
  vt: 'nada ligado: o VT segue a praça.',
};

/** O nome de um id do item, lido no quadro (a opção, no campo de `c`). */
function nomeNoQuadro(i: ItemDoCard, id: string, c: LigacoesDoCard, quadro: QuadroLido): string {
  if (!id) return '—';
  if (i.o === 'campo') return quadro.campos.find((x) => x.id === id)?.nome ?? '(sumiu)';
  if (i.o === 'lista') return quadro.listas.find((x) => x.id === id)?.nome ?? '(sumiu)';
  const campo = campoDe(c, quadro, i.de);
  const n = campo?.opcoes.findIndex((o) => o.id === id) ?? -1;
  if (!campo || n < 0) return '(sumiu)';
  // a opção que tem o nome repetido no campo diz qual é
  const nome = campo.opcoes[n].nome;
  const iguais = campo.opcoes.filter((o) => nomeComparavel(o.nome) === nomeComparavel(nome)).length;
  return iguais > 1 ? `${nome} (a ${n + 1}ª do campo)` : nome;
}

/**
 * Confere a seção Card antes de salvar: cada campo existe e tem o tipo certo; cada opção é do campo dela; a lista do
 * VT existe e está aberta; os campos copiados do filme existem. O que está vazio é aviso (o card vai sem aquilo). Diz
 * também o que muda, com os nomes do Trello. Nada aqui salva.
 */
export function conferirCard(novo: LigacoesDoCard, antes: LigacoesDoCard, quadro: QuadroLido): ConferenciaDoCard {
  const itens: ItemDaConferencia[] = [];
  let camposOk = true;
  let opcoesOk = true;
  for (const i of ITENS_DO_CARD) {
    const id = novo.ids[i.chave] ?? '';
    const titulo = i.rotulo;
    if (!id) {
      const achado = acharDoCard(i, novo, quadro);
      const semCampo = i.o === 'opcao' && !novo.ids[i.de];
      if (!semCampo) itens.push({ tipo: 'aviso', titulo, detalhe: achado.como === 'dobro' ? `${achado.ids.length} com o nome "${i.nome}": escolha um.` : SEM_NADA[i.chave] });
      continue;
    }
    if (i.o === 'campo') {
      const x = quadro.campos.find((y) => y.id === id);
      if (x && x.tipo === i.tipo) continue;
      camposOk = false;
      itens.push({ tipo: 'erro', titulo, detalhe: x ? `"${x.nome}" não é ${NOME_DO_TIPO[i.tipo]}.` : 'o campo não existe mais no quadro.' });
    } else if (i.o === 'lista') {
      const l = quadro.listas.find((y) => y.id === id);
      if (l && !l.arquivada) continue;
      camposOk = false;
      itens.push({ tipo: 'erro', titulo, detalhe: l ? `"${l.nome}" está arquivada no Trello.` : 'a lista não existe mais no quadro.' });
    } else {
      const campo = campoDe(novo, quadro, i.de);
      if (campo?.opcoes.some((o) => o.id === id)) continue;
      opcoesOk = false;
      itens.push({ tipo: 'erro', titulo, detalhe: campo ? `a opção não é do campo "${campo.nome}".` : 'a opção não tem campo.' });
    }
  }
  for (const id of novo.doFilme)
    if (!quadro.campos.some((x) => x.id === id)) {
      camposOk = false;
      itens.push({ tipo: 'erro', titulo: 'Copiados do filme', detalhe: 'um dos campos não existe mais no quadro.' });
    }
  if (camposOk) itens.push({ tipo: 'ok', titulo: 'Campos do card', detalhe: 'todos existem e têm o tipo certo' });
  if (opcoesOk) itens.push({ tipo: 'ok', titulo: 'Opções da prioridade e da complexidade', detalhe: 'cada uma é do seu campo' });
  return { ok: !itens.some((i) => i.tipo === 'erro'), itens, muda: oQueMudaNoCard(novo, antes, quadro) };
}

/** O que muda de `antes` para `novo`, com os nomes do Trello. */
export function oQueMudaNoCard(novo: LigacoesDoCard, antes: LigacoesDoCard, quadro: QuadroLido): Mudanca[] {
  const muda: Mudanca[] = [];
  const mao = (chave: string) => (novo.aMao.includes(chaveDoCard(chave)) ? ' (à mão)' : '');
  for (const i of ITENS_DO_CARD) {
    const a = antes.ids[i.chave] ?? '';
    const n = novo.ids[i.chave] ?? '';
    if (a !== n) muda.push({ oque: i.rotulo, antes: nomeNoQuadro(i, a, antes, quadro), depois: nomeNoQuadro(i, n, novo, quadro) + mao(i.chave) });
  }
  const nomes = (xs: string[]) => xs.map((id) => quadro.campos.find((x) => x.id === id)?.nome ?? '(sumiu)').join(', ') || '—';
  if (novo.doFilme.join(',') !== antes.doFilme.join(',')) muda.push({ oque: 'Copiados do filme', antes: nomes(antes.doFilme), depois: nomes(novo.doFilme) });
  return muda;
}

