import type { TipoPrograma } from './tipos';
import type { RedatorVocab } from './redator';

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
/** Praças oferecidas no app. "REDE" nos roteiros e nos nomes de arquivo é a G5. */
export const PRACAS = ['G5', 'SP', 'RJ', 'INTER'];
/** Como a praça aparece escrita nos arquivos. */
export const PRACAS_LIDAS = ['REDE', 'G5', 'SP', 'RJ', 'INTER', 'INTERNACIONAL', 'MG', 'DF', 'PE'];
/** Só existem três praças: o que não é Rio nem São Paulo é G5. */
export const normalizarPraca = (p: string) => (/^(SP|RJ)$/i.test(p) ? p.toUpperCase() : /^INTER/i.test(p) ? 'INTER' : 'G5');

/** Claquete do Rio começa por "RIO" e um separador ("RIO ", "Rio(", "Rio_"; não "RIOS"); a de São Paulo termina em
    "SP"; o resto é G5. */
export const pracaDaClaquete = (claquete: string) =>
  /^RIO[^\p{L}\d]/iu.test(claquete.trim()) ? 'RJ' : / SP$/i.test(claquete.trim()) ? 'SP' : / INTER(?:NACIONAL)?$/i.test(claquete.trim()) ? 'INTER' : 'G5';

/** A data achada numa claquete ou num nome de arquivo, e onde ela está no texto. */
export interface DataLida {
  /** O dia da exibição: num período ("8 a 20/9"), o primeiro dia. */
  dia: number;
  mes: number;
  inicio: number;
  fim: number;
  /** O trecho reescrito com a barra, em caixa alta: "5/12-2", "8 A 20/9-2". */
  comBarra: string;
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
 *   claquete digitada, só o traço.
 * @param atracoes nomes de atração além dos cadastros que o navegador já tem (a que o servidor achou depois da leitura).
 */
export function lerDataDaClaquete(texto: string, semBarra: 'arquivo' | 'claquete' = 'claquete', atracoes: string[] = []): DataLida | null {
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
      (c.sep === '/' || c.sep === '-' || semBarra === 'arquivo') &&
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
  };
}

/** A data da claquete, no ano corrente (ou no seguinte, se já passou há mais de seis meses). */
export function dataDaClaquete(claquete: string, hoje = new Date(), atracoes: string[] = []): string {
  const m = lerDataDaClaquete(claquete, 'claquete', atracoes);
  if (!m) return '';
  let ano = hoje.getFullYear();
  if (new Date(ano, m.mes - 1, m.dia).getTime() < hoje.getTime() - 183 * 864e5) ano++;
  return diaIso(ano, m.mes, m.dia);
}

const diaIso = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/** "Expedicao_Rio_11_07_Rede.docx" → "EXPEDICAO RIO 11/07 REDE": a barra da data não cabe em nome de arquivo. */
export function claqueteDoArquivo(arquivo: string, atracoes: string[] = []): string {
  const texto = arquivo
    .replace(/\.[^.]+$/, '')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2') // "AmaPrologo" → "Ama Prologo"
    .replace(/(\p{L}{3,})(\d{1,2})(?=[ _.-]\d{1,2}(?:\D|$))/u, '$1 $2') // dia colado no nome: "Prologo26_10"
    .replace(/[_\s]+/g, ' ')
    .trim()
    .toUpperCase();
  const data = lerDataDaClaquete(texto, 'arquivo', atracoes);
  return data ? texto.slice(0, data.inicio) + data.comBarra + texto.slice(data.fim) : texto;
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
  return { editor: pauta.get(chave.replace(/ (?:REDE|G5|SP|PRACAS)$/, ''))?.editor ?? '', claquete: '' };
}
export const editorDaPauta = (claquete: string): string => naPauta(claquete).editor;

/**
 * Onde terminam, no texto, os números do nome da atração que abre a claquete ("FORMULA 1 5-12-2" → logo depois do 1);
 * 0 quando ela não abre por uma atração com número. Vale o mesmo começo que o acharPrograma aceita (a key, com a praça
 * do Rio na frente), e também o nome e as pistas dos cadastros e da lista embutida, mais os nomes de `extras`.
 */
function fimDosNumerosDaAtracao(texto: string, extras: string[] = []): number {
  const n = normal(texto);
  const comeco = [n, n.replace(/^rio /, '')];
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
  const comeco = [n, n.replace(/^rio /, '')];
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
