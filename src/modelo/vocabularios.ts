import type { TipoPrograma } from './tipos';
import type { RedatorVocab } from './redator';
import { MARCA_TODAS, alternativa, palavrasDoFim, pracasRegistradas, reconhecerPraca, semPracaNoComeco, semPracaNoFim, type Praca } from './pracas.ts';

/* Vocabulários padrão. Servem de sugestão nos campos do cabeçalho e de
   dicionário para o importador reconhecer o programa pelo texto ou pelo nome do arquivo. */

export interface ProgramaVocab {
  nome: string;
  tipo: TipoPrograma;
  /** Trechos (sem acento, minúsculos) que identificam o programa. */
  pistas: string[];
}

export const PROGRAMAS: ProgramaVocab[] = [
  { nome: 'Quem Ama Cuida', tipo: 'novela', pistas: ['quem ama cuida', 'quem ama', 'quem_ama'] },
  { nome: 'Nobreza do Amor', tipo: 'novela', pistas: ['nobreza do amor', 'nobreza'] },
  { nome: 'Por Você', tipo: 'novela', pistas: ['por voce'] },
  { nome: 'Encontro', tipo: 'ao_vivo', pistas: ['encontro'] },
  { nome: 'Mais Você', tipo: 'ao_vivo', pistas: ['mais voce'] },
  { nome: 'Eliana', tipo: 'auditorio', pistas: ['eliana'] },
  { nome: 'Futebol Brasileirão', tipo: 'esporte', pistas: ['brasileirao', 'futbrasileira', 'futebol'] },
  { nome: 'Futebol Libertadores', tipo: 'esporte', pistas: ['libertadores', 'fut liberta', 'fut_liberta', 'futliberta'] },
  { nome: 'Estrelas da Casa', tipo: 'auditorio', pistas: ['estrelas da casa', 'estrelas'] },
  { nome: 'Viver Sertanejo', tipo: 'auditorio', pistas: ['viver sertanejo', 'sertanejo 2', 'sertanejo_2'] },
  { nome: 'Circuito Sertanejo', tipo: 'auditorio', pistas: ['circuito sertanejo', 'circuito'] },
  { nome: 'Caldeirão', tipo: 'auditorio', pistas: ['caldeirao com mion', 'caldeirao'] },
  { nome: 'Globo Repórter', tipo: 'outro', pistas: ['globo reporter', 'g.reporter', 'g reporter'] },
  { nome: 'Fantástico', tipo: 'outro', pistas: ['fantastico', 'fant'] },
  { nome: 'Altas Horas', tipo: 'auditorio', pistas: ['altas horas', 'altas'] },
  { nome: 'Esporte Espetacular', tipo: 'esporte', pistas: ['esporte espetacular', 'esporte'] },
  { nome: 'Jornal Hoje', tipo: 'outro', pistas: ['jornal hoje', 'jh'] },
  { nome: 'Dança dos Famosos', tipo: 'auditorio', pistas: ['danca dos famosos', 'danca'] },
  { nome: 'Sessão da Tarde', tipo: 'outro', pistas: ['sessao da tarde', 's.tarde', 's tarde'] },
  { nome: 'Temperatura Máxima', tipo: 'outro', pistas: ['temperatura maxima', 'temperatura'] },
  { nome: 'Globo Sessions', tipo: 'outro', pistas: ['globo sessions', 'sessions'] },
  { nome: 'Justiça', tipo: 'outro', pistas: ['justica'] },
];

export const LOCUTORES = ['DIRCEU', 'DIRCEU VIRTUAL', 'WALMIR', 'MCK', 'TATI', 'GIL'];
export const SELOS = ['Verifique a classificação indicativa', 'Sem selo', 'Livre', 'A10', 'A12', 'A14', 'A16', 'A18'];
/** A forma curta do selo, para a ficha (a coluna do selo é estreita). O que não tem forma curta fica como está. */
const SELOS_CURTOS: Record<string, string> = { 'Verifique a classificação indicativa': 'Verifique' };
export const seloCurto = (selo: string) => SELOS_CURTOS[selo] ?? selo;
/** A data achada numa claquete ou num nome de arquivo, e onde ela está no texto. */
export interface DataLida {
  /** O dia da exibição: num período ("8 a 20/9"), o primeiro dia. */
  dia: number;
  mes: number;
  inicio: number;
  fim: number;
  /** O trecho reescrito com a barra, em caixa alta: "5/12-2", "8 A 20/9-2". */
  comBarra: string;
  /** Onde está, no texto, o separador entre o dia e o mês (a barra, o traço…). */
  separador: number;
}

/* A claquete original é "D/M", com a versão opcional "-V" ("5/12-2"), ou um período "D a D/M" ("8 a 20/9-2").
   Nome de arquivo não aceita barra: ela vira traço, underline ou espaço, e o hífen da versão às vezes também.
   Cada candidato é um par "dia separador mês" que começa em qualquer número; os candidatos se sobrepõem. */
const RE_PAR =
  /(?<!\d)(?=(((\d{1,2})[ _.-]+A[ _.-]+)?(\d{1,2})([/ _.-])(\d{1,2})(?!\d)(-[\p{L}\d]+|[ _](\d{1,2})(?![\p{L}\d]))?))/giu;

/**
 * A data da claquete ou do nome do arquivo.
 * - Com barra, vale o último "D/M" válido, como sempre foi ("Terra 20/11-2 (AH)" → 20/11).
 * - Sem barra, valem os primeiros números do grupo: em "5-12-2" ou "5_12_2" o par é 5/12 e o 2 é a versão;
 *   o número que já é o mês de um par válido não abre outro par. Entre grupos, vale o último.
 * - Um número grudado em letras não abre par ("SP2_3_4" → 3/4, "V2-26-10" → 26/10).
 * - Os números do nome da atração no começo do texto não entram na data: com "Fórmula 1" cadastrada,
 *   "FORMULA 1 5-12-2" é 5/12, versão 2 (sem o cadastro, vale a regra dos primeiros números: 1/5).
 * @param semBarra se o traço, o underline, o espaço e o ponto também separam dia e mês (nome de arquivo); na
 *   claquete digitada, só o traço; no nome do card ('nome'), o traço, o underline e o ponto, mas não o espaço.
 * @param atracoes nomes de atração além dos cadastros que o navegador já tem (a que o servidor achou depois da leitura).
 */
export function lerDataDaClaquete(texto: string, semBarra: 'arquivo' | 'claquete' | 'nome' = 'claquete', atracoes: string[] = []): DataLida | null {
  const depoisDaAtracao = fimDosNumerosDaAtracao(texto, atracoes);
  const cands = [...texto.matchAll(RE_PAR)].filter((m) => m.index! >= depoisDaAtracao).map((m) => {
    const [, todo, periodo = '', ini, d, sep, mes, versao = '', versaoSolta] = m;
    const posDia = m.index! + periodo.length;
    return { m, todo, periodo, ini, dTexto: d, mesTexto: mes, d: +d, sep, mes: +mes, versao, versaoSolta, posDia, posMes: posDia + d.length + sep.length };
  });
  const validos = cands.filter(
    (c) =>
      c.d >= 1 && c.d <= 31 && c.mes >= 1 && c.mes <= 12 &&
      (!c.ini || (+c.ini >= 1 && +c.ini <= 31)) &&
      (c.sep === '/' || c.sep === '-' || semBarra === 'arquivo' || (semBarra === 'nome' && c.sep !== ' ')) &&
      // a versão solta (sem hífen) só existe no nome do arquivo, onde o hífen pode ter virado underline ou espaço
      (!c.versaoSolta || semBarra === 'arquivo') &&
      (c.sep === '/' || !/\p{L}/u.test(texto[(c.periodo ? c.m.index! : c.posDia) - 1] ?? '')),
  );
  const comBarra = validos.filter((c) => c.sep === '/');
  const escolhidos = comBarra.length ? comBarra : validos.filter((c) => !validos.some((o) => o.posMes === c.posDia));
  // o mesmo par com e sem o período na frente: fica o do período
  const c = escolhidos.filter((x) => !escolhidos.some((o) => o !== x && o.periodo && o.posDia === x.posDia)).at(-1);
  if (!c) return null;
  return {
    dia: c.ini ? +c.ini : c.d,
    mes: c.mes,
    inicio: c.m.index!,
    fim: c.m.index! + c.todo.length,
    comBarra: `${c.ini ? `${c.ini} A ` : ''}${c.dTexto}/${c.mesTexto}${c.versaoSolta ? `-${c.versaoSolta}` : c.versao}`,
    separador: c.posMes - 1,
  };
}

const DIAS_DO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const dataValida = (dia: number, mes: number) => mes >= 1 && mes <= 12 && dia >= 1 && dia <= DIAS_DO_MES[mes - 1];
// o último par "D M" do texto, depois de um nome (terminado em letra ou ")"), com a versão ("-2") e a praça (ou a
// marca de todas as praças) opcionais; montada das praças, uma vez por lista de praças
const reDataComEspaco = new WeakMap<readonly Praca[], RegExp>();
function dataComEspacoDas(pracas: readonly Praca[]): RegExp {
  let re = reDataComEspaco.get(pracas);
  if (!re) {
    re = new RegExp(String.raw`^(.*?[\p{L})])(\s*)(\d{1,2}) (\d{1,2})((?:-[\p{L}\d]+)?)((?:\s+(?:${alternativa([...palavrasDoFim(pracas), MARCA_TODAS])}))?\s*)$`, 'iu');
    reDataComEspaco.set(pracas, re);
  }
  return re;
}

/** A data "D M" separada por espaço no fim do nome, com barra; null quando não é seguro dizer que é data. */
function dataComEspacoComBarra(claquete: string, pracas: readonly Praca[]): string | null {
  const m = dataComEspacoDas(pracas).exec(claquete);
  if (!m) return null;
  const [, nome, espaco, dia, mes, versao, fim] = m;
  // "Nome7 6": o número colado na letra não abre a data
  if (!espaco && !nome.endsWith(')')) return null;
  if (!dataValida(+dia, +mes)) return null;
  const n = semAcento(nome);
  // "Viver Sertanejo 2 5": o primeiro número pode ser da atração
  const pistasComNumero = PROGRAMAS.flatMap((p) => p.pistas).filter((p) => /\d/.test(p));
  if (pistasComNumero.some((p) => n.endsWith(p.replace(/\d+$/, '').trim()))) return null;
  // "Cap 3 5", "Ep 2 4", "Temp 1 3": o número pode ser do episódio, do capítulo ou da temporada
  if (/\b(ep|cap|episodio|capitulo|temp|t)\s*$/i.test(n)) return null;
  return `${nome}${espaco}${dia}/${mes}${versao}${fim}`;
}

/**
 * A claquete com a data de exibição escrita com barra: "DONA 27-11" → "DONA 27/11", "TERRA 26-11-2" → "TERRA 26/11-2".
 * Lê a data como `lerDataDaClaquete` (a última "D-M", "D_M" ou "D.M"; com uma "D/M" já escrita, vale ela) e troca só o
 * separador entre o dia e o mês: a versão ("-2", "-V2", " B"), o período ("21 A 26-9") e os outros números ficam como
 * estão. Com a data colada em outra barra ("A/D-M"), a "/" só separava o número da data quando "A/D" não é data e
 * "D-M" é: "JOGO 3/14-6" → "JOGO 3 14/6"; senão, fica como está.
 * Sem data assim, a última "D M" separada por espaço no fim do nome também ganha a barra ("ESPORTE 15 3 SP" →
 * "ESPORTE 15/3 SP"), só quando é seguro (veja `dataComEspacoComBarra`).
 * A chave da claquete e a praça não mudam: a pontuação não conta nelas.
 */
export function claqueteComBarra(claquete: string, pracas: readonly Praca[] = pracasRegistradas()): string {
  const lida = lerDataDaClaquete(claquete, 'nome');
  if (lida) {
    if (claquete[lida.separador] === '/') return claquete;
    const comBarra = (texto: string) => texto.slice(0, lida.separador) + '/' + texto.slice(lida.separador + 1);
    if (claquete[lida.inicio - 1] === '/') {
      // "JOGO 3/14-6": "3/14" não é data e "14-6" é, então a "/" separava o número da data → "JOGO 3 14/6"
      const antes = /(?<!\d)(\d{1,2})\/$/.exec(claquete.slice(0, lida.inicio));
      if (!antes || dataValida(+antes[1], lida.dia) || !/^\d+$/.test(claquete.slice(lida.inicio, lida.separador)) || !dataValida(lida.dia, lida.mes)) return claquete;
      return comBarra(claquete.slice(0, lida.inicio - 1) + ' ' + claquete.slice(lida.inicio));
    }
    if (/\d/.test(claquete[lida.inicio - 1] ?? '')) return claquete;
    return comBarra(claquete);
  }
  const comEspaco = dataComEspacoComBarra(claquete, pracas);
  if (!comEspaco || chaveDaClaquete(comEspaco) !== chaveDaClaquete(claquete) || reconhecerPraca(comEspaco, pracas) !== reconhecerPraca(claquete, pracas)) return claquete;
  return comEspaco;
}

/**
 * A claquete sem o espaço antes do "(" e depois do ")": "ELIANA (REPERC) 29/11" → "ELIANA(REPERC)29/11". O espaço de
 * dentro dos parênteses fica ("(PROLOGO DO CAP 1)"). Só tira o espaço que não muda a chave da claquete, a data nem a
 * praça: "FESTA (AH) SP" fica "FESTA(AH) SP" (sem o espaço, o "SP" deixaria de ser a praça), e "FESTA (AH) 3/12" fica
 * "FESTA(AH) 3/12" (a chave tira o "(AH)" e colaria o nome na data).
 */
export function claqueteSemEspacoNosParenteses(claquete: string, pracas: readonly Praca[] = pracasRegistradas()): string {
  const igual = (a: string, b: string) => {
    const da = lerDataDaClaquete(a);
    const db = lerDataDaClaquete(b);
    return chaveDaClaquete(a) === chaveDaClaquete(b) && reconhecerPraca(a, pracas) === reconhecerPraca(b, pracas) && da?.dia === db?.dia && da?.mes === db?.mes;
  };
  let texto = claquete;
  const re = /(\s*)(\([^()]*\))(\s*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const [todo, antes, par, depois] = m;
    const ini = m.index;
    // tira os dois espaços; se não der, só o de antes ou só o de depois
    const resto = texto.slice(ini + todo.length);
    const trecho = [par, par + depois, antes + par].find((o) => o !== todo && igual(texto.slice(0, ini) + o + resto, claquete)) ?? todo;
    texto = texto.slice(0, ini) + trecho + resto;
    re.lastIndex = ini + trecho.length;
  }
  return texto;
}

/**
 * O nome da claquete no padrão da casa, como vai para o card do Trello e para a produção da arte: a data com barra
 * (`claqueteComBarra`) e sem espaço em volta dos parênteses (`claqueteSemEspacoNosParenteses`).
 * "ELIANA (REPERC) 29-11" → "ELIANA(REPERC)29/11".
 */
export const claquetePadrao = (claquete: string, pracas: readonly Praca[] = pracasRegistradas()): string =>
  claqueteSemEspacoNosParenteses(claqueteComBarra(claquete, pracas), pracas);

/** A data da claquete, no ano corrente (ou no seguinte, se já passou há mais de seis meses). */
export function dataDaClaquete(claquete: string, hoje = new Date(), atracoes: string[] = []): string {
  const m = lerDataDaClaquete(claquete, 'claquete', atracoes);
  if (!m) return '';
  let ano = hoje.getFullYear();
  if (new Date(ano, m.mes - 1, m.dia).getTime() < hoje.getTime() - 183 * 864e5) ano++;
  return diaIso(ano, m.mes, m.dia);
}

/**
 * A claquete já foi exibida: a data de exibição (no fim da claquete) é anterior a hoje, no horário de Brasília. Num
 * período ("Tempo 18 A 25/11") vale o último dia, e o ano é o mais perto de hoje (em dezembro, "2/1" é de janeiro
 * seguinte; em janeiro, "30/12" é do dezembro passado). Sem data reconhecível, não foi exibida. É a regra do fluxo
 * PRIORIDADE do n8n, que tira da lista de prioridade a claquete já exibida.
 */
export function jaFoiExibida(claquete: string, agora = new Date()): boolean {
  const lida = lerDataDaClaquete(String(claquete ?? ''));
  if (!lida) return false;
  const ultimoDia = Number(/(\d{1,2})\//.exec(lida.comBarra)![1]); // "18 A 25/11" → 25
  const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
  const [anoHoje, mesHoje] = hoje.split('-').map(Number);
  const ano = lida.mes - mesHoje > 6 ? anoHoje - 1 : mesHoje - lida.mes > 6 ? anoHoje + 1 : anoHoje;
  return diaIso(ano, lida.mes, ultimoDia) < hoje;
}

const diaIso = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/** "Expedicao_Rio_11_07_Rede.docx" → "EXPEDICAO RIO 11/07 REDE": a barra da data não cabe em nome de arquivo. Sai no
    padrão da casa (`claquetePadrao`): "Eliana_(Reperc)_29_11.docx" → "ELIANA(REPERC)29/11". */
export function claqueteDoArquivo(arquivo: string, atracoes: string[] = []): string {
  const texto = arquivo
    .replace(/\.[^.]+$/, '')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2') // "AmaPrologo" → "Ama Prologo"
    .replace(/(\p{L}{3,})(\d{1,2})(?=[ _.-]\d{1,2}(?:\D|$))/u, '$1 $2') // dia colado no nome: "Prologo26_10"
    .replace(/[_\s]+/g, ' ')
    .trim()
    .toUpperCase();
  const data = lerDataDaClaquete(texto, 'arquivo', atracoes);
  return claqueteSemEspacoNosParenteses(data ? texto.slice(0, data.inicio) + data.comBarra + texto.slice(data.fim) : texto);
}

/**
 * A atração que só chegou depois da importação (o servidor achou pelas keys do Teable) conserta a claquete e a data
 * tiradas do nome do arquivo: "Formula_1_5-12-2" foi lido como "FORMULA 1/5-12-2", 1/5; com "Fórmula 1", é 5/12.
 * Só mexe na claquete que ainda é a do nome do arquivo (não na da pauta) e na data que saiu dela (não na do texto).
 * Devolve null quando não há o que mudar.
 */
export function refazerPelaAtracao(
  meta: { claquete: string; dataExibicao: string },
  arquivo: string,
  atracao: string,
): { claquete: string; dataExibicao: string } | null {
  if (!/\d/.test(atracao) || meta.claquete !== claqueteDoArquivo(arquivo)) return null;
  const claquete = claqueteDoArquivo(arquivo, [atracao]);
  if (claquete === meta.claquete) return null;
  const antes = lerDataDaClaquete(meta.claquete);
  const depois = lerDataDaClaquete(claquete);
  const [ano, mes, dia] = meta.dataExibicao.split('-').map(Number);
  const daClaquete = !!antes && mes === antes.mes && dia === antes.dia;
  return { claquete, dataExibicao: daClaquete && depois ? diaIso(ano, depois.mes, depois.dia) : meta.dataExibicao };
}

export const NOMES_TIPO_PROGRAMA: Record<TipoPrograma, string> = {
  novela: 'Novela',
  ao_vivo: 'Ao vivo',
  esporte: 'Esporte',
  auditorio: 'Auditório',
  outro: 'Outro',
};

export const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/* ---------- vocabulário da casa (vem do servidor, quando ele está ligado ao Teable) ---------- */

export interface VocabularioExterno {
  programas: { nome: string; chaves: string[]; categoria?: string }[];
  /** Os redatores do cadastro, com as keys e se estão ativos. O servidor antigo (e a cópia local de antes) mandava só
      os nomes: valem como ativos, sem keys. */
  redatores: (string | { nome: string; keys?: string[]; ativo?: boolean })[];
  editores?: string[];
  /** Pauta da edição: chave da claquete → quem está editando. */
  pauta?: { chave: string; editor: string; claquete?: string }[];
}

interface Externo {
  p: ProgramaVocab;
  /** Chaves de claquete, normalizadas. Só valem no começo do texto. */
  chaves: string[];
  /** Nome normalizado; vale em qualquer ponto do texto quando é longo o bastante. */
  nome: string;
}

let externos: Externo[] = [];
let redatores: RedatorVocab[] = [];
let editores: string[] = [];
let pauta = new Map<string, { editor: string; claquete: string }>();

const normal = (s: string) =>
  semAcento(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function registrarVocabulario(v: VocabularioExterno | null) {
  externos = (v?.programas ?? []).map(({ nome, chaves, categoria }) => {
    const n = normal(nome);
    // o tipo (novela, esporte…) não vem do Teable: aproveita o do programa embutido parecido
    const embutido = PROGRAMAS.find((p) => p.pistas.some((pista) => ` ${n} `.includes(` ${pista} `)));
    const ch = chaves.map(normal).filter(Boolean);
    const daCategoria = ({ novelas: 'novela', esportes: 'esporte' } as Record<string, TipoPrograma>)[normal(categoria ?? '')];
    return { p: { nome, tipo: daCategoria ?? embutido?.tipo ?? 'outro', pistas: [...new Set([n, ...ch])] }, chaves: ch, nome: n };
  });
  redatores = (v?.redatores ?? [])
    .map((r) => (typeof r === 'string' ? { nome: r, keys: [], ativo: true } : { nome: String(r?.nome ?? ''), keys: (r?.keys ?? []).map(String), ativo: r?.ativo !== false }))
    .filter((r) => r.nome);
  editores = v?.editores ?? [];
  pauta = new Map((v?.pauta ?? []).map((p) => [p.chave, { editor: p.editor, claquete: p.claquete ?? '' }]));
}

/** Quantas atrações da casa o navegador tem agora (0 = a lista do Teable não chegou). */
export const quantasAtracoes = () => externos.length;

/** A atração está no cadastro do Teable (e não é só um nome da lista embutida)? */
export const atracaoCadastrada = (nome: string) => externos.some((e) => e.p.nome === nome);

/** Programas para sugerir no cabeçalho: os da casa, quando existem; senão, os embutidos. */
export const programasConhecidos = (): ProgramaVocab[] => (externos.length ? externos.map((e) => e.p) : PROGRAMAS);
export const redatoresConhecidos = (): string[] => redatores.map((r) => r.nome);
/** Os redatores do cadastro, com as keys e o "ativo", para reconhecer o autor e sugerir o redator. */
export const redatoresDoCadastro = (): RedatorVocab[] => redatores;
export const editoresConhecidos = (): string[] => editores;

/** A claquete como chave de cruzamento: sem acento, sem versão ("(AH)", "V2", "(DIA)") e sem pontuação. Igual à fórmula do Teable. */
export function chaveDaClaquete(claquete: string): string {
  return claquete
    .toUpperCase()
    .replace(/&/g, 'E')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([PNAH/+D\s]+\)/g, '')
    .replace(/V[2-9]+|MNT|\sCLIPE$/g, '')
    .replace(/\((?:DIA|MES)\)/g, ' ')
    .replace(/[-+_/().,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** O que a pauta da edição sabe desta claquete: quem está editando e, se a chave bate inteira, como ela é escrita lá. */
export function naPauta(claquete: string): { editor: string; claquete: string } {
  const chave = chaveDaClaquete(claquete);
  const exata = pauta.get(chave);
  if (exata) return exata;
  // sem a praça no fim, ainda serve para achar o editor, mas a grafia já não é desta claquete
  return { editor: pauta.get(semPracaNoFim(chave, pracasRegistradas(), [MARCA_TODAS]))?.editor ?? '', claquete: '' };
}
export const editorDaPauta = (claquete: string): string => naPauta(claquete).editor;

/**
 * Onde terminam, no texto, os números do nome da atração que abre a claquete ("FORMULA 1 5-12-2" → logo depois do 1);
 * 0 quando ela não abre por uma atração com número. Vale o mesmo começo que o acharPrograma aceita (a key, com a praça
 * do Rio na frente), e também o nome e as pistas dos cadastros e da lista embutida, mais os nomes de `extras`.
 */
function fimDosNumerosDaAtracao(texto: string, extras: string[] = []): number {
  const n = normal(texto);
  const comeco = [n, semPracaNoComeco(n)];
  const trechos = [...externos.flatMap((e) => [e.nome, ...e.chaves]), ...PROGRAMAS.flatMap((p) => [p.nome, ...p.pistas]), ...extras].map(normal);
  // vale o trecho mais longo que abre o texto; só os com número importam
  const numeros = Math.max(
    0,
    ...trechos
      .filter((t) => /\d/.test(t) && comeco.some((x) => x === t || x.startsWith(t + ' ')))
      .map((t) => t.match(/\d+/g)!.length),
  );
  if (!numeros) return 0;
  // os números do texto normalizado são os mesmos do original, na mesma ordem: o n-ésimo grupo de dígitos fecha o trecho
  const grupo = [...texto.matchAll(/\d+/g)][numeros - 1];
  return grupo ? grupo.index! + grupo[0].length : 0;
}

export function acharPrograma(texto: string): ProgramaVocab | null {
  // A claquete começa pela chave ("QUEM AMA 12/3 REDE"); chaves curtas ("CASA", "VT") não valem no meio de uma frase.
  const n = normal(texto.replace(/^\s*PGM\s*:/i, ''));
  let melhor: { p: ProgramaVocab; tam: number } | null = null;
  // a key no começo da claquete decide: o que vem nos parênteses é detalhe ("CHEF(QUEM AMA)17-11" é do Chef,
  // numa chamada que fala de Quem Ama); só sem key no começo vale procurar o nome no meio do texto
  // a praça do Rio vem na frente ("Rio Fut(Brasileirao)21/11"): a key vale também depois dela
  const comeco = [n, semPracaNoComeco(n)];
  for (const e of externos)
    for (const c of e.chaves)
      if (comeco.some((x) => x === c || x.startsWith(c + ' ')) && (!melhor || c.length > melhor.tam)) melhor = { p: e.p, tam: c.length };
  if (melhor) return melhor.p;
  for (const e of externos) {
    if (e.nome.length >= 8 && ` ${n} `.includes(` ${e.nome} `) && (!melhor || e.nome.length > melhor.tam))
      melhor = { p: e.p, tam: e.nome.length };
  }
  const t = semAcento(texto);
  for (const p of PROGRAMAS)
    for (const pista of p.pistas)
      if (t.includes(pista) && (!melhor || pista.length > melhor.tam)) melhor = { p, tam: pista.length };
  return melhor?.p ?? null;
}
