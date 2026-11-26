import { chaveDaClaquete } from './vocabularios.ts';
import { alternativa, normalizarPraca, palavrasDoFim, pracasRegistradas, reconhecerPraca, semPracaNoComeco, type Praca } from './pracas.ts';

/* Claquetes duplicadas (#65): os cards do quadro do Trello com a mesma claquete, praça e versão. A mesma regra do
   relatório "PROMO: CLAQUETES DUPLICADAS" do n8n, com a chave da claquete do PROMeiro (`chaveDaClaquete`, a da fórmula
   do Teable). Versões diferentes (-2, V2, B, Opção N) não contam como duplicadas. Módulo puro: o servidor lê o Trello e
   a produção da arte e chama daqui. */

/** Um card do quadro, com o que o agrupamento e a sugestão precisam. */
export interface CardDoQuadro {
  id: string;
  /** o nome do card no Trello */
  nome: string;
  /** a praça do campo PRAÇA do card ('' quando o card não tem): vale mais que a do nome */
  praca: string;
  arquivado: boolean;
  /** o tipo da lista em que o card está: a entrada de uma praça, a saída (ou os projetos entregues) ou outra */
  lista: 'entrada' | 'saida' | 'outra';
  /** quando o card foi criado (ms; vem do id do card) */
  criado: number;
  /** quantos membros o card tem */
  membros: number;
  /** o card tem linha na produção da arte (ARTE_producao) */
  temProducao: boolean;
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
  /** os ids dos cards, do mais antigo ao mais novo */
  cards: string[];
  secao: SecaoDaDuplicada;
  /** quando o card mais novo do caso foi criado (ms) */
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
export function grupoDoCard(card: Pick<CardDoQuadro, 'nome' | 'praca'>, pracas: readonly Praca[] = pracasRegistradas()): { id: string; chave: string; praca: string; versao: string } {
  const { base, versao } = versaoDaClaquete(card.nome, pracas);
  const chave = semPracaNoComeco(chaveDaClaquete(base), pracas);
  const praca = card.praca ? normalizarPraca(card.praca, pracas) : reconhecerPraca(card.nome, pracas);
  return { id: `${chave}|${praca}|${versao}`, chave, praca, versao };
}

/* ---------- a sugestão: do sinal mais forte ao mais fraco ---------- */

type Sinal = { sai: (c: CardDoQuadro, outro: CardDoQuadro) => boolean; motivo: string; fica: string };
const SINAIS: Sinal[] = [
  { sai: (c) => c.arquivado && c.lista === 'entrada', motivo: 'Arquivado na lista de entrada.', fica: 'não foi arquivado na entrada' },
  { sai: (c) => !c.temProducao, motivo: 'Sem linha na produção da arte.', fica: 'tem linha na produção da arte' },
  { sai: (c) => c.membros === 0, motivo: 'Sem membros.', fica: 'tem membros' },
  { sai: (c, outro) => c.criado > outro.criado, motivo: 'Criado depois.', fica: 'foi criado primeiro' },
  { sai: (c) => c.lista !== 'saida', motivo: 'Fora das listas de saída.', fica: 'está na saída' },
];
/** O primeiro sinal (o mais forte) em que `a` e `b` se separam, e qual dos dois ele manda sair. */
function decisivo(a: CardDoQuadro, b: CardDoQuadro): { sinal: Sinal; sai: CardDoQuadro } | null {
  for (const sinal of SINAIS) {
    const saiA = sinal.sai(a, b);
    const saiB = sinal.sai(b, a);
    if (saiA !== saiB) return { sinal, sai: saiA ? a : b };
  }
  return null;
}
const frase = (partes: string[]) => (partes.length ? `${partes.join('; ').replace(/^./, (l) => l.toUpperCase())}.` : 'Sugestão: fica.');

function sugerir(cards: CardDoQuadro[]): CasoDeDuplicada['sugestao'] {
  // fica o card que nenhum outro manda sair; no empate, o mais antigo
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

/**
 * Os casos de duplicada: os cards com o mesmo grupo (chave + praça + versão), dois ou mais. Em ordem: as seções (com
 * arquivado e aberto, todos abertos, todos arquivados) e, em cada uma, o caso mais recente primeiro.
 */
export function agruparDuplicadas(cards: CardDoQuadro[], pracas: readonly Praca[] = pracasRegistradas()): CasoDeDuplicada[] {
  const porGrupo = new Map<string, { grupo: ReturnType<typeof grupoDoCard>; cards: CardDoQuadro[] }>();
  for (const c of cards) {
    const grupo = grupoDoCard(c, pracas);
    if (!grupo.chave) continue;
    const ja = porGrupo.get(grupo.id);
    if (ja) ja.cards.push(c);
    else porGrupo.set(grupo.id, { grupo, cards: [c] });
  }
  const casos: CasoDeDuplicada[] = [];
  for (const { grupo, cards: doGrupo } of porGrupo.values()) {
    if (doGrupo.length < 2) continue;
    const ordem = [...doGrupo].sort((a, b) => a.criado - b.criado || a.id.localeCompare(b.id));
    const arquivados = ordem.filter((c) => c.arquivado).length;
    casos.push({
      ...grupo,
      cards: ordem.map((c) => c.id),
      secao: arquivados === 0 ? 'abertos' : arquivados === ordem.length ? 'arquivados' : 'misto',
      recente: ordem[ordem.length - 1].criado,
      sugestao: sugerir(ordem),
    });
  }
  return casos.sort((a, b) => SECOES.indexOf(a.secao) - SECOES.indexOf(b.secao) || b.recente - a.recente);
}
