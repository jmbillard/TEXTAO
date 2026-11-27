import { chaveDaClaqueteNoPadrao } from './vocabularios.ts';
import { alternativa, normalizarPraca, palavrasDoFim, pracasRegistradas, reconhecerPraca, semPracaNoComeco, type Praca } from './pracas.ts';

/* Claquetes duplicadas: as linhas da produção da arte (ARTE_producao) com a mesma claquete, praça e versão. A regra do
   relatório "PROMO: CLAQUETES DUPLICADAS" do n8n, com a chave da claquete do PROMeiro (`chaveDaClaqueteNoPadrao`, a da
   fórmula do Teable, com o (M) do padrão das versões como o (MES)). Versões diferentes (-2, V2, B, Opção N) não contam
   como duplicadas. A lista e o caso aberto saem só da produção (não do quadro do Trello: um card qualquer do quadro,
   que não é de roteiro, não é caso; e o PROMeiro não lê o Trello, ADR 0006). Módulo puro: o servidor lê a produção
   e chama daqui. */

/** Uma linha da produção da arte, com o que o agrupamento e a sugestão precisam. */
export interface LinhaDaProducao {
  /** o id da linha no Teable (liga as artes do acervo) */
  registro: string;
  /** o card_ID ('' quando a linha não tem card) */
  card: string;
  claquete: string;
  /** a praça da coluna praca ('' quando a linha não tem): vale mais que a da claquete */
  praca: string;
  /** data_entrada (ISO); sem ela, a linha fica fora do período */
  entrada: string | null;
  /** a coluna arquivado */
  arquivado: boolean;
  /** a linha é de filme (a coluna filme preenchida): não entra */
  filme: boolean;
  status: string[];
  designers: string[];
  entregue: boolean;
  /** data_entrega (ISO), para o caso aberto */
  entrega?: string | null;
  /** artes_quantidade, para o caso aberto */
  artesQuantidade?: number | null;
}

/** Um card do caso, com os sinais da sugestão: saem da linha da produção. */
export interface CardDoCaso {
  /** o card_ID */
  id: string;
  arquivado: boolean;
  /** ainda na entrada: a linha sem andamento (sem status ou só ENTRADA/AGUARDANDO MATERIAL) */
  naEntrada: boolean;
  /** quantos designers (da linha) */
  pessoas: number;
  /** quando entrou na produção (ms) */
  entrada: number;
  /** saiu: entregue ou finalizado */
  saiu: boolean;
}

/** As três seções da lista: com arquivado e aberto (o caso de sempre), todos abertos, todos arquivados. */
export type SecaoDaDuplicada = 'misto' | 'abertos' | 'arquivados';
export const SECOES: SecaoDaDuplicada[] = ['misto', 'abertos', 'arquivados'];

export interface CasoDeDuplicada {
  /** chave + praça + versão: o que identifica o caso */
  id: string;
  chave: string;
  praca: string;
  /** '' para a primeira; '2', 'B', 'OPCAO 2'… */
  versao: string;
  /** os card_IDs, da linha que entrou primeiro à mais nova */
  cards: string[];
  secao: SecaoDaDuplicada;
  /** quando a linha mais nova do caso entrou na produção (ms) */
  recente: number;
  /** qual fica e quais saem, com o motivo de cada um; a pessoa pode trocar */
  sugestao: { fica: string; saem: string[]; motivos: Record<string, string> };
}

const semAcentoMaiusculo = (s: string) =>
  s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
const DATA = String.raw`\d{1,2}\/\d{1,2}(?:\/\d{2,4})?`;
// as marcas do fim da claquete que não mudam o caso: "(AH)", "(N)", "(DIA)", "(MES)"
const MARCA_NO_FIM = /\s*\((?:[PNAH/+D\s]+|DIA|MES)\)\s*$/;
// a praça escrita no fim do nome: entra pelo campo ou pelo nome, não pela chave
const pracaNoFimDas = new WeakMap<readonly Praca[], RegExp>();
const pracaNoFim = (pracas: readonly Praca[]) => {
  let re = pracaNoFimDas.get(pracas);
  if (!re) pracaNoFimDas.set(pracas, (re = new RegExp(`[\\s_]+(?:${alternativa(palavrasDoFim(pracas)) || '(?!)'})$`, 'i')));
  return re;
};

/**
 * A versão escrita no nome e o nome sem ela: "-2", "V2" e o "2" depois da data são a versão 2; "B", "C"… depois da
 * data são outra versão; "Opção N", em qualquer lugar, também. A versão 1 é a primeira (''). As marcas "(AH)" e a
 * praça no fim saem junto.
 */
export function versaoDaClaquete(nome: string, pracas: readonly Praca[] = pracasRegistradas()): { base: string; versao: string } {
  let s = semAcentoMaiusculo(nome).trim();
  const praca = pracaNoFim(pracas);
  let versao = '';
  const opcao = /\bOPCAO[\s_]*(\d+)\b/.exec(s);
  if (opcao) {
    versao = `OPCAO ${opcao[1]}`;
    s = s.replace(opcao[0], ' ');
  }
  for (let volta = 0; volta < 4; volta++) {
    const antes = s;
    s = s.replace(MARCA_NO_FIM, '').replace(praca, '').trim();
    if (!versao) {
      const hifen = /^(.*?)\s*-\s*(\d)$/.exec(s);
      // "19-1" é uma data, não a versão 1 de "19"
      const v = /^(.*?)(?:^|[\s_)])V(\d{1,2})$/.exec(s);
      const depoisDaData = new RegExp(String.raw`^(.*${DATA})[\s_]+(\d)$`).exec(s);
      const letra = new RegExp(String.raw`^(.*\d)[\s_-]*([B-H])$`).exec(s);
      const achou = hifen && !/(?:^|[^\d/])\d{1,2}$/.test(hifen[1]) ? hifen : v ?? depoisDaData ?? letra;
      if (achou) {
        versao = achou[2] === '1' ? '' : achou[2];
        s = achou[1].trim() || s;
      }
    }
    if (s === antes) break;
  }
  return { base: s, versao };
}

/** O grupo do card: a chave da claquete (sem a versão, a praça do fim e a do começo, "RIO"), a praça e a versão. */
export function grupoDoCard(card: { nome: string; praca: string }, pracas: readonly Praca[] = pracasRegistradas()): { id: string; chave: string; praca: string; versao: string } {
  const { base, versao } = versaoDaClaquete(card.nome, pracas);
  // o (M) do padrão (#118) é a mesma versão da chamada que o (MES)
  const chave = semPracaNoComeco(chaveDaClaqueteNoPadrao(base), pracas);
  const praca = card.praca ? normalizarPraca(card.praca, pracas) : reconhecerPraca(card.nome, pracas);
  return { id: `${chave}|${praca}|${versao}`, chave, praca, versao };
}

/* ---------- a sugestão: do sinal mais forte ao mais fraco ---------- */

type Sinal = { sai: (c: CardDoCaso, outro: CardDoCaso) => boolean; motivo: string; fica: string };
const SINAIS: Sinal[] = [
  { sai: (c) => c.arquivado && c.naEntrada, motivo: 'Arquivado sem sair da entrada.', fica: 'não foi arquivado na entrada' },
  { sai: (c) => c.pessoas === 0, motivo: 'Sem designers.', fica: 'tem designers' },
  { sai: (c, outro) => c.entrada > outro.entrada, motivo: 'Entrou depois na produção.', fica: 'entrou primeiro na produção' },
  { sai: (c) => !c.saiu, motivo: 'Não saiu nem foi entregue.', fica: 'saiu ou foi entregue' },
];
/** O primeiro sinal (o mais forte) em que `a` e `b` se separam, e qual dos dois ele manda sair. */
function decisivo(a: CardDoCaso, b: CardDoCaso): { sinal: Sinal; sai: CardDoCaso } | null {
  for (const sinal of SINAIS) {
    const saiA = sinal.sai(a, b);
    const saiB = sinal.sai(b, a);
    if (saiA !== saiB) return { sinal, sai: saiA ? a : b };
  }
  return null;
}
const frase = (partes: string[]) => (partes.length ? `${partes.join('; ').replace(/^./, (l) => l.toUpperCase())}.` : 'Sugestão: fica.');

/** Qual card fica e quais saem, com o motivo de cada um. `cards` na ordem do caso: no empate, fica o primeiro. */
export function sugestaoDoCaso(cards: CardDoCaso[]): CasoDeDuplicada['sugestao'] {
  // fica o card que nenhum outro manda sair; no empate, o primeiro
  const fica = cards.reduce((melhor, c) => (decisivo(melhor, c)?.sai === melhor ? c : melhor));
  const saem = cards.filter((c) => c !== fica);
  const motivos: Record<string, string> = {};
  const aFavor: Sinal[] = [];
  for (const c of saem) {
    const d = decisivo(c, fica);
    motivos[c.id] = d ? d.sinal.motivo : 'Igual ao que fica em todos os sinais.';
    if (d && !aFavor.includes(d.sinal)) aFavor.push(d.sinal);
  }
  motivos[fica.id] = frase(SINAIS.filter((s) => aFavor.includes(s)).map((s) => s.fica));
  return { fica: fica.id, saem: saem.map((c) => c.id), motivos };
}

// o andamento que ainda é a entrada: a linha sem status, ou só com estes
const STATUS_DA_ENTRADA = new Set(['ENTRADA', 'AGUARDANDO MATERIAL']);
const quando = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/** Os sinais da linha, para a sugestão (sem o Trello). */
export function cardDaLinha(l: LinhaDaProducao): CardDoCaso {
  const status = l.status.map((s) => semAcentoMaiusculo(s).trim()).map((s) => (s === 'EM APROVACAO' ? 'EM APROVAÇÃO' : s));
  return {
    id: l.card,
    arquivado: l.arquivado,
    naEntrada: !l.entregue && status.every((s) => STATUS_DA_ENTRADA.has(s)),
    pessoas: l.designers.length,
    entrada: quando(l.entrada),
    saiu: l.entregue || status.includes('FINALIZADO'),
  };
}

/** As linhas que contam: com card, que não são de filme e que entraram desde `desde`; uma por card (a primeira). */
export function linhasDoPeriodo(linhas: LinhaDaProducao[], desde: number): LinhaDaProducao[] {
  const vistos = new Set<string>();
  return linhas.filter((l) => {
    if (!l.card || l.filme || vistos.has(l.card) || !(quando(l.entrada) >= desde)) return false;
    vistos.add(l.card);
    return true;
  });
}

/**
 * Os casos de duplicada da produção da arte: as linhas com card, que não são de filme e que entraram desde `desde`,
 * com o mesmo grupo (chave + praça + versão), duas ou mais. Em ordem: as seções (com arquivado e aberto, todos
 * abertos, todos arquivados) e, em cada uma, o caso mais recente primeiro.
 */
export function duplicadasDaProducao(linhas: LinhaDaProducao[], { desde, pracas = pracasRegistradas() }: { desde: number; pracas?: readonly Praca[] }): CasoDeDuplicada[] {
  const porGrupo = new Map<string, { grupo: ReturnType<typeof grupoDoCard>; linhas: LinhaDaProducao[] }>();
  for (const l of linhasDoPeriodo(linhas, desde)) {
    const grupo = grupoDoCard({ nome: l.claquete, praca: l.praca }, pracas);
    if (!grupo.chave) continue;
    const ja = porGrupo.get(grupo.id);
    if (ja) ja.linhas.push(l);
    else porGrupo.set(grupo.id, { grupo, linhas: [l] });
  }
  const casos: CasoDeDuplicada[] = [];
  for (const { grupo, linhas: doGrupo } of porGrupo.values()) {
    if (doGrupo.length < 2) continue;
    const ordem = doGrupo.map(cardDaLinha).sort((a, b) => a.entrada - b.entrada || a.id.localeCompare(b.id));
    const arquivados = ordem.filter((c) => c.arquivado).length;
    casos.push({
      ...grupo,
      cards: ordem.map((c) => c.id),
      secao: arquivados === 0 ? 'abertos' : arquivados === ordem.length ? 'arquivados' : 'misto',
      recente: ordem[ordem.length - 1].entrada,
      sugestao: sugestaoDoCaso(ordem),
    });
  }
  return casos.sort((a, b) => SECOES.indexOf(a.secao) - SECOES.indexOf(b.secao) || b.recente - a.recente);
}

/* ---------- apagar um card do caso (#67) ---------- */

/** O código do card, que a confirmação pede para digitar: os 4 últimos caracteres do card_ID (o fim do link do card).
    Sai do id, sem ler o Trello (o número do card só o Trello tem, ADR 0006). */
export const codigoDoCard = (id: string) => String(id ?? '').trim().slice(-4).toLowerCase();

/** O que a tela viu de um card quando o caso abriu, e o que o servidor relê na hora de apagar. */
export interface CardVisto {
  claquete: string;
  arquivado: boolean;
  status: string[];
  designers: string[];
  entrada: string | null;
  entrega?: string | null;
  artes?: number | null;
  /** a última mudança da linha no Teable */
  modificadoEm: string | null;
}
export interface Mudanca {
  card: string;
  campo: string;
  antes: string;
  depois: string;
}
const CAMPOS_VISTOS: { campo: string; valor: (c: CardVisto) => string }[] = [
  { campo: 'Claquete', valor: (c) => c.claquete ?? '' },
  { campo: 'Estado', valor: (c) => (c.arquivado ? 'arquivado' : 'aberto') },
  { campo: 'Status', valor: (c) => (c.status ?? []).join(', ') },
  { campo: 'Designers', valor: (c) => (c.designers ?? []).join(', ') },
  { campo: 'Entrada', valor: (c) => c.entrada ?? '' },
  { campo: 'Entrega', valor: (c) => c.entrega ?? '' },
  { campo: 'Artes', valor: (c) => (c.artes == null ? '' : String(c.artes)) },
];

/**
 * O que mudou num card desde que a tela abriu o caso: cada campo que a tela mostrou e está diferente agora. Se só a
 * última mudança da linha no Teable é outra (mexeram em algo que a tela não mostra), ela mesma é a mudança.
 */
export function mudancasDoCard(card: string, visto: CardVisto, agora: CardVisto): Mudanca[] {
  const mudou = CAMPOS_VISTOS.filter((c) => c.valor(visto) !== c.valor(agora)).map((c) => ({ card, campo: c.campo, antes: c.valor(visto), depois: c.valor(agora) }));
  if (!mudou.length && (visto.modificadoEm ?? '') !== (agora.modificadoEm ?? '')) mudou.push({ card, campo: 'Linha da produção', antes: visto.modificadoEm ?? '', depois: agora.modificadoEm ?? '' });
  return mudou;
}
