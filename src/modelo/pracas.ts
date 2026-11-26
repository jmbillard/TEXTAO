/* As praças como dado: cada uma diz como aparece no nome da claquete, como pode vir escrita (no "PGM:", no nome do
   arquivo, na opção do campo Praça do Trello) e para onde o card dela vai (a entrada, a saída e a opção do campo
   Praça). Uma é a padrão: a que vale quando nenhuma regra bate. A ordem decide quando duas regras batem.
   O mesmo módulo serve ao navegador e ao servidor (o servidor importa este .ts direto): só sintaxe que o Node apaga,
   sem importar nada. */

/** Como a praça aparece no nome da claquete: termina em uma das palavras (" SP") ou começa por uma delas ("RIO "). */
export interface RegraDaPraca {
  onde: 'fim' | 'comeco';
  palavras: string[];
}

export interface Praca {
  sigla: string;
  nome: string;
  /** A que vale quando nenhuma regra bate (uma só). */
  padrao: boolean;
  /** Sem regra, a praça só é reconhecida pela sigla e pelo "também lida como" (a padrão, em geral). */
  regra: RegraDaPraca | null;
  /** Outras grafias da praça no "PGM:", no nome do arquivo e na opção do Trello ("REDE" é a G5). */
  tambem: string[];
  /** A lista de entrada no Trello (id). */
  entrada: string;
  /** A lista de saída no Trello (id): para onde o card vai quando a arte fica pronta. */
  saida: string;
  /** A opção da praça no campo Praça do Trello (id). */
  opcao: string;
}

/** A palavra que, no fim da claquete, diz "todas as praças" ("QUEM AMA 20/11 PRACAS"): não é uma praça. */
export const MARCA_TODAS = 'PRACAS';

const sem = { entrada: '', saida: '', opcao: '' };

/** As praças de fábrica: as de sempre, na ordem em que as regras são conferidas (o Rio antes de SP: "RIO SHOW SP" é
    do Rio). Valem enquanto nenhuma coleção de praças foi salva na Configuração. */
export const PRACAS_DE_FABRICA: readonly Praca[] = Object.freeze([
  { sigla: 'G5', nome: 'Rede (G5)', padrao: true, regra: null, tambem: ['REDE', 'MG', 'DF', 'PE'], ...sem },
  { sigla: 'RJ', nome: 'Rio', padrao: false, regra: { onde: 'comeco', palavras: ['RIO'] }, tambem: [], ...sem },
  { sigla: 'SP', nome: 'São Paulo', padrao: false, regra: { onde: 'fim', palavras: ['SP'] }, tambem: [], ...sem },
  { sigla: 'INTER', nome: 'Internacional', padrao: false, regra: { onde: 'fim', palavras: ['INTER', 'INTERNACIONAL'] }, tambem: ['INTERNACIONAL'], ...sem },
] satisfies Praca[]);

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const comparavel = (s: string) =>
  String(s ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** A alternativa de regex das palavras ("INTERNACIONAL|INTER"), escapadas, as mais longas primeiro. */
export const alternativa = (palavras: string[]) =>
  [...new Set(palavras.filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map(escapar)
    .join('|');

/** A praça padrão: a marcada, ou a primeira. */
export const pracaPadrao = (pracas: readonly Praca[]): Praca => pracas.find((p) => p.padrao) ?? pracas[0];

/** As siglas, na ordem das praças (o seletor da claquete). */
export const siglasDasPracas = (pracas: readonly Praca[]) => pracas.map((p) => p.sigla);

/** A praça desta sigla (sem caixa), ou undefined. */
export const pracaDaSigla = (pracas: readonly Praca[], sigla: string) => pracas.find((p) => comparavel(p.sigla) === comparavel(sigla));

/** Como a praça pode vir escrita num texto (o "PGM:", o nome do arquivo): a sigla e o "também lida como" de cada uma,
    na ordem das praças. */
export const comoAsPracasAparecem = (pracas: readonly Praca[]) => [...new Set(pracas.flatMap((p) => [p.sigla, ...p.tambem]))];

/** As palavras que, no começo da claquete, dizem a praça ("RIO"). */
export const palavrasDoComeco = (pracas: readonly Praca[]) => pracas.flatMap((p) => (p.regra?.onde === 'comeco' ? p.regra.palavras : []));

/** As palavras que, no fim da claquete, dizem a praça: as regras "termina em", as siglas e o "também lida como". */
export const palavrasDoFim = (pracas: readonly Praca[]) => [
  ...new Set(pracas.flatMap((p) => [...(p.regra?.onde === 'fim' ? p.regra.palavras : []), p.sigla, ...p.tambem])),
];

/** A regra bate na claquete? "Começa com": a palavra e um separador ("RIO ", "Rio(", "Rio_"; não "RIOS");
    "termina em": um espaço e a palavra (" SP"). */
function bate(regra: RegraDaPraca, claquete: string): boolean {
  const palavras = alternativa(regra.palavras);
  if (!palavras) return false;
  return regra.onde === 'comeco' ? new RegExp(`^(?:${palavras})[^\\p{L}\\d]`, 'iu').test(claquete) : new RegExp(` (?:${palavras})$`, 'iu').test(claquete);
}

/** A praça da claquete (a sigla): a primeira, na ordem, cuja regra bate; sem regra que bata, a primeira cujo "também
    lida como" termina a claquete (" BH"); nenhuma, a padrão. (Com as de fábrica, só a padrão tem "também lida como":
    "RIO SHOW REDE" continua do Rio.) */
export function reconhecerPraca(claquete: string, pracas: readonly Praca[] = pracasRegistradas()): string {
  const c = String(claquete ?? '').trim();
  const pelaRegra = pracas.find((p) => p.regra && bate(p.regra, c));
  const peloTambem = pelaRegra ? null : pracas.find((p) => bate({ onde: 'fim', palavras: p.tambem }, c));
  return (pelaRegra ?? peloTambem ?? pracaPadrao(pracas)).sigla;
}

/** A praça de uma grafia lida ("REDE", "sp", a opção "Internacional" do Trello): a praça da sigla ou do "também lida
    como"; o que não é de nenhuma vira a padrão. */
export function normalizarPraca(lida: string, pracas: readonly Praca[] = pracasRegistradas()): string {
  const t = comparavel(lida);
  return (pracas.find((p) => [p.sigla, ...p.tambem].some((x) => comparavel(x) === t)) ?? pracaPadrao(pracas)).sigla;
}

/** O texto sem a praça escrita no começo ("RIO FESTA 19 11" → "FESTA 19 11"): a palavra e os espaços depois dela. */
export function semPracaNoComeco(texto: string, pracas: readonly Praca[] = pracasRegistradas()): string {
  const palavras = alternativa(palavrasDoComeco(pracas));
  return palavras ? texto.replace(new RegExp(`^(?:${palavras})\\s+`, 'i'), '') : texto;
}

/** O texto sem a praça escrita no fim ("FESTA 19 11 SP" → "FESTA 19 11"): os espaços e a palavra. `extras`: outras
    palavras que também saem (a `MARCA_TODAS`). */
export function semPracaNoFim(texto: string, pracas: readonly Praca[] = pracasRegistradas(), extras: string[] = []): string {
  const palavras = alternativa([...palavrasDoFim(pracas), ...extras]);
  return palavras ? texto.replace(new RegExp(`\\s+(?:${palavras})$`, 'i'), '') : texto;
}

/* ---------- as praças da configuração ---------- */

type Ambiente = Record<string, string | undefined>;

/** "G5=abc,SP=def" → { G5: 'abc', SP: 'def' } */
const pares = (v: string | undefined) =>
  Object.fromEntries(
    String(v || '')
      .split(',')
      .map((p) => p.split('=').map((x) => x.trim()))
      .filter(([k, val]) => k && val),
  ) as Record<string, string>;

/** As praças de fábrica com a entrada, a saída e a opção das variáveis de hoje: TRELLO_LISTA_<SIGLA>,
    TRELLO_SAIDA_<SIGLA> e TRELLO_PRACAS ("G5=opção,SP=opção"). */
export function pracasDeFabrica(env: Ambiente = {}): Praca[] {
  const opcoes = pares(env.TRELLO_PRACAS);
  return PRACAS_DE_FABRICA.map((p) => ({
    ...p,
    regra: p.regra && { ...p.regra, palavras: [...p.regra.palavras] },
    tambem: [...p.tambem],
    entrada: String(env[`TRELLO_LISTA_${p.sigla}`] ?? '').trim(),
    saida: String(env[`TRELLO_SAIDA_${p.sigla}`] ?? '').trim(),
    opcao: opcoes[p.sigla] ?? '',
  }));
}

const textos = (v: unknown) => (Array.isArray(v) ? v.map((x) => comparavel(String(x ?? ''))).filter(Boolean) : []);

/** Uma praça salva, com o que faltar preenchido; null se não tem sigla. */
function pracaSalva(v: unknown): Praca | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const sigla = comparavel(String(o.sigla ?? ''));
  if (!sigla) return null;
  const r = o.regra as Record<string, unknown> | null | undefined;
  const palavras = textos(r?.palavras);
  return {
    sigla,
    nome: String(o.nome ?? '').trim() || sigla,
    padrao: o.padrao === true,
    regra: r && (r.onde === 'fim' || r.onde === 'comeco') && palavras.length ? { onde: r.onde, palavras } : null,
    tambem: textos(o.tambem),
    entrada: String(o.entrada ?? '').trim(),
    saida: String(o.saida ?? '').trim(),
    opcao: String(o.opcao ?? '').trim(),
  };
}

/**
 * As praças que valem: a coleção salva na Configuração (PRACAS, em JSON), ou, sem ela (ou ilegível), as de fábrica
 * montadas das variáveis de hoje. Sigla repetida fica só a primeira; sem padrão marcada, a primeira é a padrão.
 */
export function pracasDaConfiguracao(env: Ambiente = {}): Praca[] {
  let salvas: unknown = null;
  try {
    salvas = env.PRACAS ? JSON.parse(env.PRACAS) : null;
  } catch {
    salvas = null;
  }
  const lidas = (Array.isArray(salvas) ? salvas : []).map(pracaSalva).filter((p): p is Praca => !!p);
  const unicas = lidas.filter((p, i) => lidas.findIndex((o) => o.sigla === p.sigla) === i);
  if (!unicas.length) return pracasDeFabrica(env);
  const padrao = unicas.find((p) => p.padrao) ?? unicas[0];
  return unicas.map((p) => ({ ...p, padrao: p === padrao }));
}

/** O que o navegador precisa saber das praças (sem os ids do Trello). */
export const pracasParaONavegador = (pracas: readonly Praca[]): Praca[] => pracas.map((p) => ({ ...p, ...sem }));

/* ---------- as praças do navegador ---------- */

/* O reconhecimento é síncrono e chamado em muitos pontos (a claquete digitada, a leitura do roteiro, a comparação de
   claquetes). O navegador registra as praças que o servidor mandou (no /api/eu, a primeira coisa que ele pede) e, até
   elas chegarem ou sem servidor, valem as de fábrica. O servidor não registra nada: passa as praças da configuração
   de agora a cada chamada. */
let registradas: readonly Praca[] = PRACAS_DE_FABRICA;

/** Registra as praças (as do servidor); null ou vazio volta às de fábrica. */
export function registrarPracas(pracas: readonly unknown[] | null | undefined) {
  const lidas = pracasDaConfiguracao({ PRACAS: JSON.stringify(pracas ?? []) });
  registradas = pracas?.length && lidas.length ? lidas : PRACAS_DE_FABRICA;
}

/** As praças registradas no navegador (as de fábrica, até o servidor mandar as dele). */
export const pracasRegistradas = (): readonly Praca[] => registradas;
