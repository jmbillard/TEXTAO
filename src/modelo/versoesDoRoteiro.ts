/* As versões lidas do roteiro e o apelido da claquete (#120). Regras puras, as mesmas no servidor e no navegador (só
   sintaxe que o Node apaga).

   As versões da chamada saem das artes marcadas na revisão, que dizem quando o programa vai ao ar: "NESTA QUARTA" é N,
   "AMANHÃ, 22H30" é A, "HOJE" é H, "PRÓXIMA SEXTA" é P, "DIA 28" é D e "EM JANEIRO" é M, nas letras do padrão da pauta
   (GLOSSARY, "Versão da chamada"). O dia sozinho ("SÁBADO, 22H") é N ou P pela data da claquete, a conferir; o horário
   sozinho ("22H30") não é versão. Quando o roteiro e o código da claquete discordam, vale o roteiro.

   O apelido é o nome que o PROMeiro mostra no lugar da claquete, só dentro dele, um por roteiro: o Trello e o Teable
   continuam com a claquete original, e o apelido nunca entra na chave dos cruzamentos (a pauta com as Produções, as
   Duplicadas). */
import { dataDaVersao, lerVersoes, MESES, SEMANA_CURTA, type Versao } from './pauta.ts';
import { claqueteNoPadrao } from './correcaoDeGrafia.ts';
import { chaveDaClaqueteNoPadrao, lerDataDaClaquete } from './vocabularios.ts';

/** A ordem das letras do padrão: as versões lidas vêm sempre nela. */
const ORDEM = ['A', 'H', 'N', 'P', 'D', 'M'] as const;
type Letra = (typeof ORDEM)[number];

/** Sem acento e em maiúsculas; o "ª" e o "º" viram letra ("4ª" → "4A"). */
const comparavel = (t: string) => t.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase();

/** O dia da semana escrito na arte (domingo é 0): por extenso, abreviado ou pelo número ("4ª" é quarta). */
const DIA_DA_SEMANA = '(SEGUNDA|TERCA|QUARTA|QUINTA|SEXTA|SABADO|DOMINGO|SEG|TER|QUA|QUI|SEX|SAB|DOM|[2-6][AO]?)';
const NUMERO_DO_DIA: Record<string, number> = { DOM: 0, SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6 };
const diaDaSemana = (escrito: string) => (/^\d/.test(escrito) ? Number(escrito[0]) - 1 : NUMERO_DO_DIA[escrito.slice(0, 3)]);
const MESES_SEM_ACENTO = MESES.map((m) => comparavel(m));

/** Como cada versão aparece numa arte; o grupo 1, quando há, é o dia da semana, o número do dia ou o mês. */
const NA_ARTE: Record<Letra, RegExp> = {
  A: /\bAMANHA\b/,
  H: /\bHOJE\b/,
  N: new RegExp(`\\bNEST[AE]\\s+${DIA_DA_SEMANA}\\b`, 'g'),
  P: new RegExp(`\\bPROXIM[AO]\\s+${DIA_DA_SEMANA}\\b`, 'g'),
  D: /\bDIA\s+(\d{1,2})\b/,
  M: new RegExp(`\\bEM\\s+(${MESES_SEM_ACENTO.join('|')})\\b`),
};

/** Só o dia da semana, por extenso, sem "nesta" nem "próxima" antes ("SÁBADO, 22H"). */
const SO_O_DIA = /(?<!\b(?:NEST[AE]|PROXIM[AO])\s+)\b(SEGUNDA|TERCA|QUARTA|QUINTA|SEXTA|SABADO|DOMINGO)\b/g;
/** Até quantos dias depois de hoje o dia sozinho é "nesta"; a partir daí, "próxima". */
const DIAS_DO_NESTA = 6;
const DIA_MS = 86_400_000;

/** A etiqueta do dia da semana: "nesta qua", "neste sáb", "próxima sex", "próximo dom". */
function rotuloDaSemana(letra: 'N' | 'P', dia: number): string {
  const masculino = dia % 6 === 0;
  const palavra = letra === 'N' ? (masculino ? 'neste' : 'nesta') : masculino ? 'próximo' : 'próxima';
  return `${palavra} ${SEMANA_CURTA[dia]}`;
}

/** A etiqueta da versão numa arte, ou null quando a arte não diz esta versão (ou diz um dia da semana que não bate). */
function lerNaArte(letra: Letra, arte: string, diaDaClaquete: number | null): string | null {
  const re = NA_ARTE[letra];
  if (letra === 'N' || letra === 'P') {
    for (const m of arte.matchAll(re)) {
      const dia = diaDaSemana(m[1]);
      // o dia da semana conferido pela data da claquete: o que não bate fala de outro dia
      if (diaDaClaquete === null || dia === diaDaClaquete) return rotuloDaSemana(letra, dia);
    }
    return null;
  }
  const m = re.exec(arte);
  if (!m) return null;
  if (letra === 'A') return 'amanhã';
  if (letra === 'H') return 'hoje';
  if (letra === 'D') return +m[1] >= 1 && +m[1] <= 31 ? `dia ${+m[1]}` : null;
  return `em ${MESES[MESES_SEM_ACENTO.indexOf(m[1])]}`;
}

/**
 * As versões da chamada que as artes do roteiro dizem, na ordem das letras do padrão (A H N P D M), uma vez cada. Aceita
 * qualquer caixa, com ou sem acento, e as grafias da casa ("NESTA 4ª", "AMANHA", "DIA 28/11"). Com data na claquete, o
 * dia da semana de "NESTA" e "PRÓXIMA" é conferido por ela (no ano mais perto de `hoje`); sem data, vale o da arte.
 * @param artes os textos das artes da revisão (as do envio)
 * @param hoje AAAA-MM-DD: só escolhe o ano da data da claquete
 */
export function versoesDoRoteiro(artes: readonly string[], claquete: string, hoje: string): Versao[] {
  const data = lerDataDaClaquete(claquete) ? dataDaVersao(claquete, hoje) : null;
  const diaDaClaquete = data ? data.getUTCDay() : null;
  const textos = artes.map(comparavel);
  const escritas = ORDEM.flatMap((letra): Versao[] => {
    for (const t of textos) {
      const rotulo = lerNaArte(letra, t, diaDaClaquete);
      if (rotulo) return [{ codigo: letra, rotulo, conhecida: true }];
    }
    return [];
  });
  // o dia sozinho só vale quando o roteiro não escreveu "nesta" nem "próxima"
  const soODia = data && !escritas.some((v) => v.codigo === 'N' || v.codigo === 'P') ? soODiaDaSemana(textos, data, hoje) : null;
  return soODia ? ORDEM.flatMap((letra) => escritas.filter((v) => v.codigo === letra).concat(soODia.codigo === letra ? [soODia] : [])) : escritas;
}

/**
 * O dia da semana sozinho numa arte ("SÁBADO, 22H"), quando bate com a data da claquete: N se ela cai nos próximos 7
 * dias (contando hoje), P se cai depois. Vem a conferir: o roteiro não disse "nesta" nem "próxima".
 */
function soODiaDaSemana(textos: readonly string[], data: Date, hoje: string): Versao | null {
  const dia = data.getUTCDay();
  const achou = textos.some((t) => [...t.matchAll(SO_O_DIA)].some((m) => diaDaSemana(m[1]) === dia));
  if (!achou) return null;
  const faltam = Math.round((data.getTime() - Date.parse(`${hoje}T12:00:00Z`)) / DIA_MS);
  const letra = faltam > DIAS_DO_NESTA ? 'P' : 'N';
  return { codigo: letra, rotulo: rotuloDaSemana(letra, dia), conhecida: true, aConferir: true };
}

/** As letras de um código, na ordem do padrão ("ha" → "AH", "DIA" → "D", "MÊS" → "M"); null para MNT e o desconhecido. */
function letrasDoCodigo(versoes: readonly Versao[]): string | null {
  const lidas = versoes.map((v) => comparavel(v.codigo));
  if (versoes.some((v) => !v.conhecida) || lidas.includes('MNT')) return null;
  const letras = new Set(lidas.map((c) => (c === 'DIA' ? 'D' : c === 'MES' ? 'M' : c)));
  return ORDEM.filter((l) => letras.has(l)).join('');
}

/** As duas leituras, quando o roteiro e a claquete discordam, e o apelido com as versões do roteiro. */
export interface ConflitoDasVersoes {
  /** o código da claquete, no padrão ("(A)"); '' quando ela não tem código */
  daClaquete: string;
  /** as versões lidas do roteiro, no padrão ("(AH)") */
  doRoteiro: string;
  /** a claquete com o código do roteiro: a proposta de apelido ("usar as do roteiro") */
  apelido: string;
}

/**
 * O conflito entre as versões lidas do roteiro e o código da claquete (vale o roteiro), ou null quando concordam (as
 * mesmas letras, em qualquer ordem e grafia). Sem versão no roteiro, ou com o código da claquete desconhecido ou de
 * manutenção (MNT), não há o que comparar.
 */
export function conflitoDasVersoes(claquete: string, lidas: readonly Versao[]): ConflitoDasVersoes | null {
  if (!lidas.length) return null;
  const daClaquete = letrasDoCodigo(lerVersoes(claquete.trim(), '').versoes);
  const doRoteiro = letrasDoCodigo(lidas);
  if (daClaquete === null || !doRoteiro || daClaquete === doRoteiro) return null;
  return { daClaquete: daClaquete && `(${daClaquete})`, doRoteiro: `(${doRoteiro})`, apelido: claqueteComAsVersoes(claquete, doRoteiro) };
}

/** A claquete com outro código de versão, no padrão (entre parênteses, no fim): o resto dela fica como está. */
export function claqueteComAsVersoes(claquete: string, codigo: string): string {
  const texto = claqueteNoPadrao(claquete.trim());
  const { versoes, semVersao } = lerVersoes(texto, '');
  const espaco = versoes.length ? /^\s*/.exec(texto.slice(semVersao.length))![0] : ' ';
  return `${semVersao}${espaco}(${codigo})`;
}

/**
 * A chave do apelido pela claquete, para a tela que não sabe o roteiro (a lista das Duplicadas): a claquete original do
 * roteiro sem pontuação, caixa e acento (a chave do PROMeiro) e o código de versão no padrão. Junta as grafias da mesma
 * claquete, mas versões diferentes são claquetes diferentes. Só acha o apelido: os cruzamentos continuam pela chave da
 * claquete original.
 */
export function chaveDoApelido(claquete: string): string {
  const texto = claqueteNoPadrao(claquete.trim());
  if (!texto) return '';
  const codigo = lerVersoes(texto, '').versoes.map((v) => comparavel(v.codigo));
  return `${chaveDaClaqueteNoPadrao(texto)}|${[...codigo].sort().join('')}`;
}

/** O nome que o PROMeiro mostra: o apelido da claquete, quando há; senão, a claquete como está. */
export function nomeComApelido(claquete: string, apelidos: ReadonlyMap<string, string>): string {
  return (claquete && apelidos.get(chaveDoApelido(claquete))) || claquete;
}

/** De onde vieram as versões que o card mostra (#121). */
export type FonteDasVersoes = 'roteiro' | 'apelido' | 'claquete';

/** As versões da chamada como o card da agenda e o da tela de produções mostram (#121), prontas da API. */
export interface VersoesDaChamada {
  /** as etiquetas, na ordem; vazia quando nem o roteiro nem o nome dizem a versão */
  lista: Versao[];
  /** null com a lista vazia */
  de: FonteDasVersoes | null;
  /** o roteiro e o código do nome discordam (vale o roteiro): o aviso discreto */
  conflito: ConflitoDasVersoes | null;
}

/**
 * As versões que o card mostra: as lidas do roteiro, quando ele está no PROMeiro e as artes dizem; senão, o código no fim
 * do apelido (o nome que a tela mostra) ou, sem código nele, o da claquete. O aviso compara o roteiro com esse mesmo
 * código: o apelido que já leva as versões do roteiro desfaz o conflito.
 * @param lidas as versões lidas do roteiro (vazia sem roteiro)
 * @param claquete a claquete original, sem a praça no fim
 * @param dia AAAA-MM-DD: o dia das etiquetas quando a claquete não tem data (a exibição); '' sem ele
 */
export function versoesDaChamada({ lidas, claquete, apelido, dia }: { lidas: readonly Versao[]; claquete: string; apelido: string; dia: string }): VersoesDaChamada {
  const doApelido = apelido.trim() ? lerVersoes(apelido, dia).versoes : [];
  const nome = doApelido.length ? apelido : claquete;
  if (lidas.length) return { lista: [...lidas], de: 'roteiro', conflito: conflitoDasVersoes(nome, lidas) };
  const lista = doApelido.length ? doApelido : lerVersoes(claquete, dia).versoes;
  return { lista, de: lista.length ? (doApelido.length ? 'apelido' : 'claquete') : null, conflito: null };
}
