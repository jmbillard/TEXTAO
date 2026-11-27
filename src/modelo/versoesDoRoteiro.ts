/* As versões lidas do roteiro e o apelido da claquete (#120). Regras puras, as mesmas no servidor e no navegador (só
   sintaxe que o Node apaga).

   As versões da chamada saem das artes marcadas na revisão, que dizem quando o programa vai ao ar: "NESTA QUARTA" é N,
   "AMANHÃ, 22H30" é A, "HOJE" é H, "PRÓXIMA SEXTA" é P, "DIA 28" é D e "EM JANEIRO" é M, nas letras do padrão da pauta
   (GLOSSARY, "Versão da chamada"). O dia sozinho ("SÁBADO, 22H") é N ou P pela data da claquete, a conferir; o horário
   sozinho ("22H30") não é versão. Quando o roteiro e o código da claquete discordam, vale o roteiro.

   O apelido é o nome que o PROMeiro mostra no lugar da claquete, só dentro dele, um por roteiro: o Trello e o Teable
   continuam com a claquete original, e o apelido nunca entra na chave dos cruzamentos (a pauta com as Produções, as
   Duplicadas). */
import { codigoDasVersoes, dataDaVersao, lerVersoes, MESES, SEMANA_CURTA, type Versao } from './pauta.ts';
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

/** De onde vieram as versões da claquete (#121, #152): à mão no apelido, do código do nome (o do apelido ou o da
    claquete) ou das artes do roteiro. */
export type FonteDasVersoes = 'mao' | 'apelido' | 'claquete' | 'roteiro';

/** As versões que a claquete sabe (#121, #152), como as telas mostram, prontas da API. */
export interface VersoesDaChamada {
  /** as etiquetas, na ordem; vazia quando nem à mão, nem o nome, nem o roteiro dizem a versão */
  lista: Versao[];
  /** null com a lista vazia */
  de: FonteDasVersoes | null;
  /** o roteiro diz outra coisa: o aviso discreto, que compara com o roteiro */
  conflito: ConflitoDasVersoes | null;
}

/**
 * As versões que a claquete sabe (#152): as feitas à mão no apelido, quando há; senão, o valor inicial, que é o código no
 * fim do nome (o do apelido, ou, sem código nele, o da claquete) e, sem código no nome, as versões lidas das artes do
 * roteiro. O aviso compara o que vale com o roteiro: as versões à mão iguais às dele desfazem o conflito.
 * @param lidas as versões lidas do roteiro (vazia sem roteiro)
 * @param claquete a claquete original, sem a praça no fim
 * @param mao o código feito à mão no apelido ("AH", "MNT"); '' ou ausente sem ele
 * @param dia AAAA-MM-DD: o dia das etiquetas quando a claquete não tem data (a exibição); '' sem ele
 */
export function versoesDaChamada({ lidas, claquete, apelido, mao = '', dia }: { lidas: readonly Versao[]; claquete: string; apelido: string; mao?: string; dia: string }): VersoesDaChamada {
  const doApelido = apelido.trim() ? lerVersoes(apelido, dia).versoes : [];
  const nome = doApelido.length ? apelido : claquete;
  const aMao = mao ? lerVersoes(`${lerVersoes(nome, '').semVersao} (${mao})`, dia).versoes : [];
  const doNome = doApelido.length ? doApelido : lerVersoes(claquete, dia).versoes;
  const [lista, de]: [Versao[], FonteDasVersoes | null] = aMao.length
    ? [aMao, 'mao']
    : doNome.length
      ? [doNome, doApelido.length ? 'apelido' : 'claquete']
      : lidas.length
        ? [[...lidas], 'roteiro']
        : [[], null];
  const conflito = de && de !== 'roteiro' ? conflitoDasVersoes(`${lerVersoes(nome, '').semVersao} ${codigoDasVersoes(lista)}`, lidas) : null;
  return { lista, de, conflito };
}

/**
 * O código das versões digitado à mão no apelido (#152), no padrão em que fica guardado: maiúsculas, sem parênteses, uma
 * letra por versão na ordem escrita ("pnah" → "PNAH"), DIA vira D, MÊS vira M, MNT fica inteiro. O vazio ('' ou "()")
 * tira as versões à mão (volta ao valor inicial). O código que o PROMeiro não conhece é recusado.
 */
export function codigoAMao(texto: unknown): { codigo: string } | { recusa: string } {
  const recusa = { recusa: 'Código das versões desconhecido: use A, H, N, P, D e M (uma vez cada), DIA, MÊS ou MNT.' };
  if (typeof texto !== 'string') return recusa;
  const limpo = texto.trim().replace(/^\(\s*/, '').replace(/\s*\)$/, '').trim();
  if (!limpo) return { codigo: '' };
  if (limpo.length > 6) return recusa;
  const { versoes } = lerVersoes(`(${limpo})`, '');
  if (!versoes.length || versoes.some((v) => !v.conhecida)) return recusa;
  return { codigo: codigoDasVersoes(versoes).slice(1, -1) };
}

/**
 * O nome como a tela mostra (#152): sem o código que ele já traz no fim e, com a opção ligada, o código das versões no
 * padrão colado no fim, uma vez só ("CHAMADA_CODIGO_27/11 (AH)"). A versão que veio só do dia da semana leva o "?"
 * depois ("(N)?"); o código desconhecido aparece cru. Desligada, ou sem versão, só o nome.
 */
export function nomeComOSufixo(nome: string, versoes: readonly Versao[], mostrar: boolean): string {
  const semCodigo = lerVersoes(nome, '').semVersao;
  const sufixo = mostrar ? sufixoDasVersoes(versoes) : '';
  return sufixo ? `${semCodigo} ${sufixo}` : semCodigo;
}

/** O sufixo das versões: o código no padrão e o "?" da leitura só pelo dia; '' sem versão. */
export function sufixoDasVersoes(versoes: readonly Versao[]): string {
  const codigo = codigoDasVersoes(versoes);
  return codigo && `${codigo}${versoes.some((v) => v.conhecida && v.aConferir) && versoes.every((v) => v.conhecida) ? '?' : ''}`;
}

/** A preferência de cada pessoa (#152): "Mostrar o código das versões", no PROMeiro todo. */
export const CHAVE_DO_CODIGO_DAS_VERSOES = 'versoes.codigo';
/** A opção começa ligada; só o false guardado desliga. */
export const mostraOCodigoDasVersoes = (preferencias: Record<string, unknown> | undefined) => preferencias?.[CHAVE_DO_CODIGO_DAS_VERSOES] !== false;
/** A recusa do valor da opção: '' quando é ligada ou desligada. */
export const recusaDoCodigoDasVersoes = (valor: unknown) => (typeof valor === 'boolean' ? '' : 'Mostrar o código das versões: escolha ligada ou desligada.');
