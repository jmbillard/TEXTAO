/* Ligar pelo nome: o PROMeiro acha no quadro do Trello o que tem o nome esperado (o campo "Praça", a opção de cada
   praça, a entrada e a saída de cada uma) e guarda o id. A comparação é sem caixa, acento e pontuação. Achou um só:
   liga ("achado pelo nome"); não achou, ou achou mais de um: vira exceção, e alguém escolhe à mão.
   O mesmo módulo serve ao servidor (o estado, a conferência) e ao navegador (a tela refaz o estado a cada mudança):
   só sintaxe que o Node apaga. */
import type { Praca } from './pracas';

export interface ListaDoTrello {
  id: string;
  nome: string;
  arquivada: boolean;
}
export interface OpcaoDoTrello {
  id: string;
  nome: string;
}
export interface CampoDoTrello {
  id: string;
  nome: string;
  /** o tipo do campo personalizado no Trello: list, text, date, checkbox, number */
  tipo: string;
  opcoes: OpcaoDoTrello[];
}
/** O que se lê do quadro para ligar pelo nome. */
export interface QuadroLido {
  listas: ListaDoTrello[];
  campos: CampoDoTrello[];
}

/** O resultado de procurar pelo nome. */
export type Achado = { como: 'um'; id: string } | { como: 'nenhum' } | { como: 'dobro'; ids: string[] };

/** Sem caixa, acento e pontuação, com os espaços em um só: "PROMO SP · Entrada" → "PROMO SP ENTRADA". */
export const nomeComparavel = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

const palavrasDe = (s: string) => nomeComparavel(s).split(' ').filter(Boolean);

/** Um só que aceita: liga; nenhum ou mais de um: exceção. */
export function casar<T extends { id: string }>(itens: readonly T[], aceita: (item: T) => boolean): Achado {
  const ids = itens.filter(aceita).map((i) => i.id);
  if (ids.length === 1) return { como: 'um', id: ids[0] };
  return ids.length ? { como: 'dobro', ids } : { como: 'nenhum' };
}

/** As palavras que marcam a entrada e a saída no nome da lista. */
export const PALAVRAS_DO_LADO = { entrada: ['ENTRADA'], saida: ['SAIDA', 'ENTREGUE', 'PRONTO'] } as const;
export type Lado = keyof typeof PALAVRAS_DO_LADO;

/** As palavras que dizem a praça no nome de uma lista: a sigla e as palavras da regra. */
const palavrasDaPraca = (p: Praca) => [p.sigla, ...(p.regra?.palavras ?? [])].map(nomeComparavel).filter(Boolean);

/** A entrada ou a saída da praça entre as listas abertas: o nome tem a sigla (ou uma palavra da regra) e a palavra do
    lado (ENTRADA; SAÍDA, ENTREGUE ou PRONTO), como palavras inteiras. */
export function acharLista(listas: readonly ListaDoTrello[], praca: Praca, lado: Lado): Achado {
  const daPraca = palavrasDaPraca(praca);
  const doLado: readonly string[] = PALAVRAS_DO_LADO[lado];
  return casar(listas, (l) => {
    if (l.arquivada) return false;
    const ps = palavrasDe(l.nome);
    return ps.some((p) => daPraca.includes(p)) && ps.some((p) => doLado.includes(p));
  });
}

/** O campo pelo nome e pelo tipo: um campo com o nome certo e o tipo errado não liga. */
export const acharCampo = (campos: readonly CampoDoTrello[], nome: string, tipo: string): Achado =>
  casar(campos, (c) => c.tipo === tipo && nomeComparavel(c.nome) === nomeComparavel(nome));

/** A opção da praça no campo: a sigla ou o nome da praça. */
export function acharOpcao(campo: CampoDoTrello | undefined, praca: Praca): Achado {
  const nomes = [praca.sigla, praca.nome].map(nomeComparavel).filter(Boolean);
  return casar(campo?.opcoes ?? [], (o) => nomes.includes(nomeComparavel(o.nome)));
}

/* ---------- as praças ---------- */

/** O que a seção Praças liga: as praças (com os ids da entrada, da saída e da opção), o campo Praça e o que foi
    ligado à mão (as chaves: "campo", "SP.entrada", "SP.saida", "SP.opcao"). */
export interface LigacoesDasPracas {
  pracas: Praca[];
  campoPraca: string;
  aMao: string[];
}
export type Ponta = 'entrada' | 'saida' | 'opcao';
export const PONTAS: readonly Ponta[] = ['entrada', 'saida', 'opcao'];
export const chaveDa = (sigla: string, ponta: Ponta) => `${sigla}.${ponta}`;
export const CHAVE_DO_CAMPO = 'campo';
/** O nome e o tipo do campo Praça no Trello. */
export const CAMPO_PRACA = { nome: 'Praça', tipo: 'list' };

export type Problema = '' | 'nenhum' | 'dobro' | 'sumiu' | 'arquivada' | 'tipo';
export interface Ligacao {
  chave: string;
  /** o id guardado ('' = nada ligado) */
  id: string;
  /** o nome lido agora no Trello ('' quando não há ou sumiu) */
  nome: string;
  como: 'nome' | 'mao' | '';
  problema: Problema;
  /** no dobro: os que o nome achou, para escolher */
  candidatos: string[];
  /** a outra praça que usa a mesma lista */
  divididaCom?: string;
}
export interface EstadoDasPracas {
  campo: Ligacao;
  pracas: { sigla: string; entrada: Ligacao; saida: Ligacao; opcao: Ligacao }[];
  /** o que a tela mostra: os problemas e o ligado à mão */
  excecoes: Ligacao[];
  /** a linha de estado da seção ("4 praças · tudo ligado") */
  resumo: string;
}

/** O que o nome acha para cada ponta da praça. */
function achadoDa(ponta: Ponta, praca: Praca, quadro: QuadroLido, campo: CampoDoTrello | undefined): Achado {
  return ponta === 'opcao' ? acharOpcao(campo, praca) : acharLista(quadro.listas, praca, ponta);
}

/**
 * Liga pelo nome o que está vazio (achou um só: guarda o id). O que já tem id fica como está: renomear no Trello não
 * quebra. Na primeira vez (nada salvo ainda; os ids vêm do Portainer), o id que o nome não acharia fica marcado como
 * ligado à mão (a G5 nas listas do RJ).
 */
export function ligarPeloNome(c: LigacoesDasPracas, quadro: QuadroLido, { primeiraVez }: { primeiraVez: boolean }): LigacoesDasPracas {
  const aMao = new Set(c.aMao);
  const pelaPrimeira = (chave: string, id: string, achado: Achado) => {
    if (primeiraVez && id && !(achado.como === 'um' && achado.id === id)) aMao.add(chave);
  };
  const doCampo = acharCampo(quadro.campos, CAMPO_PRACA.nome, CAMPO_PRACA.tipo);
  pelaPrimeira(CHAVE_DO_CAMPO, c.campoPraca, doCampo);
  const campoPraca = c.campoPraca || (doCampo.como === 'um' ? doCampo.id : '');
  const campo = quadro.campos.find((x) => x.id === campoPraca);
  const pracas = c.pracas.map((p) => {
    const nova = { ...p };
    for (const ponta of PONTAS) {
      const achado = achadoDa(ponta, p, quadro, campo);
      pelaPrimeira(chaveDa(p.sigla, ponta), p[ponta], achado);
      if (!p[ponta] && achado.como === 'um') nova[ponta] = achado.id;
    }
    return nova;
  });
  const chaves = [CHAVE_DO_CAMPO, ...c.pracas.flatMap((p) => PONTAS.map((ponta) => chaveDa(p.sigla, ponta)))];
  return { pracas, campoPraca, aMao: chaves.filter((k) => aMao.has(k)) };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O estado de cada ligação (como foi ligada, o que há de errado), as exceções e a linha de estado. */
export function estadoDasPracas(c: LigacoesDasPracas, quadro: QuadroLido): EstadoDasPracas {
  const aMao = new Set(c.aMao);
  const montar = (chave: string, id: string, achado: Achado, existe: { nome: string; problema: Problema } | null): Ligacao => {
    const base = { chave, id, candidatos: [] as string[] };
    if (!id) return { ...base, nome: '', como: '', problema: achado.como === 'dobro' ? 'dobro' : 'nenhum', candidatos: achado.como === 'dobro' ? achado.ids : [] };
    if (!existe) return { ...base, nome: '', como: aMao.has(chave) ? 'mao' : 'nome', problema: 'sumiu' };
    return { ...base, nome: existe.nome, como: aMao.has(chave) ? 'mao' : 'nome', problema: existe.problema };
  };
  const campoLido = quadro.campos.find((x) => x.id === c.campoPraca);
  const campo = montar(CHAVE_DO_CAMPO, c.campoPraca, acharCampo(quadro.campos, CAMPO_PRACA.nome, CAMPO_PRACA.tipo), campoLido ? { nome: campoLido.nome, problema: campoLido.tipo === CAMPO_PRACA.tipo ? '' : 'tipo' } : null);
  const pracas = c.pracas.map((p) => {
    const lig = (ponta: Ponta) => {
      const id = p[ponta];
      let existe: { nome: string; problema: Problema } | null = null;
      if (ponta === 'opcao') {
        const o = campoLido?.opcoes.find((x) => x.id === id);
        existe = o ? { nome: o.nome, problema: '' } : null;
      } else {
        const l = quadro.listas.find((x) => x.id === id);
        existe = l ? { nome: l.nome, problema: l.arquivada ? 'arquivada' : '' } : null;
      }
      const l = montar(chaveDa(p.sigla, ponta), id, achadoDa(ponta, p, quadro, campoLido), existe);
      const outra = ponta !== 'opcao' && id ? c.pracas.find((o) => o !== p && o[ponta] === id) : undefined;
      return outra ? { ...l, divididaCom: outra.sigla } : l;
    };
    return { sigla: p.sigla, entrada: lig('entrada'), saida: lig('saida'), opcao: lig('opcao') };
  });
  const todas = [campo, ...pracas.flatMap((p) => [p.entrada, p.saida, p.opcao])];
  const excecoes = todas.filter((l) => l.problema || l.como === 'mao');
  const conta = (f: (l: Ligacao) => boolean) => todas.filter(f).length;
  const nenhum = conta((l) => l.problema === 'nenhum');
  const dobro = conta((l) => l.problema === 'dobro');
  const sumiu = conta((l) => l.problema === 'sumiu' || l.problema === 'arquivada');
  const tipo = conta((l) => l.problema === 'tipo');
  const mao = conta((l) => l.como === 'mao');
  const partes = [
    plural(c.pracas.length, 'praça', 'praças'),
    ...(nenhum || dobro || sumiu || tipo
      ? [nenhum && plural(nenhum, 'não achado', 'não achados'), sumiu && plural(sumiu, 'sumiu', 'sumiram'), dobro && `${dobro} em dobro`, tipo && plural(tipo, 'de tipo errado', 'de tipo errado')]
      : ['tudo ligado']),
    mao && `${mao} à mão`,
  ].filter(Boolean);
  return { campo, pracas, excecoes, resumo: partes.join(' · ') };
}

/* ---------- conferir antes de salvar ---------- */

export interface ItemDaConferencia {
  tipo: 'ok' | 'aviso' | 'erro';
  titulo: string;
  detalhe: string;
}
export interface Mudanca {
  oque: string;
  antes: string;
  depois: string;
}
export interface ConferenciaDasPracas {
  /** sem erro: pode salvar (aviso não impede) */
  ok: boolean;
  itens: ItemDaConferencia[];
  muda: Mudanca[];
}

/** "termina em SP ou PAULISTA", "começa com RIO", "sem regra". */
export const descreverRegra = (r: Praca['regra']) => (r?.palavras.length ? `${r.onde === 'fim' ? 'termina em' : 'começa com'} ${r.palavras.join(' ou ')}` : 'sem regra');
const NOME_DA_PONTA: Record<Ponta, string> = { entrada: 'entrada', saida: 'saída', opcao: 'opção no campo Praça' };
const SEM_NADA: Record<Ponta, string> = {
  entrada: 'nada ligado: o card vai para a lista reserva.',
  saida: 'nada ligado: o card fica na entrada.',
  opcao: 'nada ligado: o card vai sem a praça.',
};

/**
 * Confere a seção Praças antes de salvar: o campo Praça é um campo de lista; cada lista existe e não está arquivada;
 * cada opção existe no campo; nenhuma palavra de regra é a mesma de outra praça. Diz também o que muda, com os nomes
 * lidos no Trello. Nada aqui salva.
 */
export function conferirPracas(novo: LigacoesDasPracas, antes: LigacoesDasPracas, quadro: QuadroLido): ConferenciaDasPracas {
  const itens: ItemDaConferencia[] = [];
  const campo = quadro.campos.find((c) => c.id === novo.campoPraca);
  if (!novo.campoPraca) itens.push({ tipo: 'aviso', titulo: 'Campo Praça', detalhe: 'nada ligado: os cards vão sem a praça.' });
  else if (!campo) itens.push({ tipo: 'erro', titulo: 'Campo Praça', detalhe: 'o campo não existe mais no quadro.' });
  else if (campo.tipo !== CAMPO_PRACA.tipo) itens.push({ tipo: 'erro', titulo: 'Campo Praça', detalhe: `"${campo.nome}" não é um campo de lista.` });
  else itens.push({ tipo: 'ok', titulo: 'Campo Praça', detalhe: `"${campo.nome}", campo de lista` });

  for (const p of novo.pracas) {
    const minhas = new Set((p.regra?.palavras ?? []).map(nomeComparavel));
    for (const o of novo.pracas) {
      if (o === p || o.regra?.onde !== p.regra?.onde) continue;
      const repetida = (o.regra?.palavras ?? []).find((x) => minhas.has(nomeComparavel(x)) && novo.pracas.indexOf(o) < novo.pracas.indexOf(p));
      if (repetida) itens.push({ tipo: 'erro', titulo: `${p.sigla}: ${descreverRegra(p.regra)}`, detalhe: `"${repetida}" já é a regra de ${o.sigla}. Use outra palavra.` });
    }
  }

  let listasOk = true;
  let opcoesOk = true;
  for (const p of novo.pracas)
    for (const ponta of PONTAS) {
      const id = p[ponta];
      const titulo = `${p.sigla}: ${NOME_DA_PONTA[ponta]}`;
      if (!id) {
        itens.push({ tipo: 'aviso', titulo, detalhe: SEM_NADA[ponta] });
        continue;
      }
      if (ponta === 'opcao') {
        if (campo?.opcoes.some((o) => o.id === id)) continue;
        opcoesOk = false;
        itens.push({ tipo: 'erro', titulo, detalhe: 'a opção não existe mais no campo Praça.' });
        continue;
      }
      const l = quadro.listas.find((x) => x.id === id);
      if (l && !l.arquivada) continue;
      listasOk = false;
      itens.push({ tipo: 'erro', titulo, detalhe: l ? `"${l.nome}" está arquivada no Trello.` : 'a lista não existe mais no quadro.' });
    }
  if (listasOk) itens.push({ tipo: 'ok', titulo: 'Listas', detalhe: 'todas existem e estão abertas no quadro' });
  if (opcoesOk && campo) itens.push({ tipo: 'ok', titulo: 'Opções no campo Praça', detalhe: 'todas existem no campo' });

  return { ok: !itens.some((i) => i.tipo === 'erro'), itens, muda: oQueMuda(novo, antes, quadro) };
}

/** O que muda de `antes` para `novo`, com os nomes do Trello: a ordem, a padrão, as regras e as ligações. */
export function oQueMuda(novo: LigacoesDasPracas, antes: LigacoesDasPracas, quadro: QuadroLido): Mudanca[] {
  const muda: Mudanca[] = [];
  const siglas = (c: LigacoesDasPracas) => c.pracas.map((p) => p.sigla).join(', ');
  if (siglas(novo) !== siglas(antes)) muda.push({ oque: 'Ordem', antes: siglas(antes), depois: siglas(novo) });
  const padrao = (c: LigacoesDasPracas) => c.pracas.find((p) => p.padrao)?.sigla ?? c.pracas[0]?.sigla ?? '';
  if (padrao(novo) !== padrao(antes)) muda.push({ oque: 'Praça padrão', antes: padrao(antes), depois: padrao(novo) });
  const campoNome = (id: string) => (id ? (quadro.campos.find((c) => c.id === id)?.nome ?? '(sumiu)') : '—');
  const campoNovo = quadro.campos.find((c) => c.id === novo.campoPraca);
  const nomeDe = (ponta: Ponta, id: string, c: LigacoesDasPracas) => {
    if (!id) return '—';
    if (ponta !== 'opcao') return quadro.listas.find((l) => l.id === id)?.nome ?? '(sumiu)';
    const doCampo = quadro.campos.find((x) => x.id === c.campoPraca) ?? campoNovo;
    return doCampo?.opcoes.find((o) => o.id === id)?.nome ?? '(sumiu)';
  };
  const mao = (c: LigacoesDasPracas, chave: string) => (c.aMao.includes(chave) ? ' (à mão)' : '');
  if (novo.campoPraca !== antes.campoPraca)
    muda.push({ oque: 'Campo Praça', antes: campoNome(antes.campoPraca), depois: campoNome(novo.campoPraca) + mao(novo, CHAVE_DO_CAMPO) });
  const lista = (xs: string[]) => xs.join(', ') || '—';
  for (const p of novo.pracas) {
    const a = antes.pracas.find((x) => x.sigla === p.sigla);
    if (!a) {
      muda.push({ oque: `Praça nova ${p.sigla}`, antes: '—', depois: descreverRegra(p.regra) });
      continue;
    }
    if (descreverRegra(a.regra) !== descreverRegra(p.regra)) muda.push({ oque: `${p.sigla}: regra`, antes: descreverRegra(a.regra), depois: descreverRegra(p.regra) });
    if (lista(a.tambem) !== lista(p.tambem)) muda.push({ oque: `${p.sigla}: também lida como`, antes: lista(a.tambem), depois: lista(p.tambem) });
    for (const ponta of PONTAS)
      if (a[ponta] !== p[ponta])
        muda.push({ oque: `${p.sigla}: ${NOME_DA_PONTA[ponta]}`, antes: nomeDe(ponta, a[ponta], antes), depois: nomeDe(ponta, p[ponta], novo) + mao(novo, chaveDa(p.sigla, ponta)) });
  }
  return muda;
}
