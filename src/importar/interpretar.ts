import { textoDoPar, type DocBruto, type Par } from './bruto';
import { analisarSonoras, ehCaixaAlta, ehLocucao, RE_LINHA_LOC } from '../modelo/sonora';
import { metaVazia, novoId, type Layout, type Meta, type NoJSON, type MarcaJSON, type SubtipoArte, type TipoEtiqueta } from '../modelo/tipos';
import { acharPrograma, claqueteDoArquivo, normalizarPraca, PRACAS_LIDAS as PRACAS, semAcento } from '../modelo/vocabularios';

/* Interpretação do arquivo: do "o que estava escrito" para "o que isso significa".
   Tudo o que é certo é resolvido sozinho e listado em `entendido`;
   só o que depende de quem escreveu vira `perguntas`. */

export type Resposta = TipoEtiqueta | 'ignorar';

export interface Trecho {
  t: string;
  b?: boolean;
  i?: boolean;
  arte?: { subtipo: SubtipoArte; grupo?: string };
  etq?: TipoEtiqueta;
  /** Índice da pergunta que decide a etiqueta deste trecho. */
  legado?: number;
}
export type ParI = Trecho[];
export interface LinhaI {
  e: ParI[];
  d: ParI[];
}

export interface Pergunta {
  id: number;
  estilo: 'marca-texto' | 'cor';
  /** Cor CSS para mostrar o trecho como estava no Word. */
  corCss: string;
  nomeCor: string;
  trechos: string[];
  pergunta: string;
  porque: string;
  sugestao: Resposta;
}

export interface Importacao {
  bruto: DocBruto;
  meta: Meta;
  /** Corpo em coluna única… */
  corrido: ParI[];
  /** …ou em duas colunas (quando `meta.layout` não é coluna_unica). */
  linhas: LinhaI[];
  perguntas: Pergunta[];
  entendido: string[];
  faltando: string[];
}

export interface OpcoesImportacao {
  /** Ano usado quando o arquivo traz só dia e mês. */
  anoPadrao?: number;
}

/* ---------- cores do Word ---------- */

const CORES_WORD: Record<string, [string, string]> = {
  yellow: ['#fff200', 'amarelo'], green: ['#00ff00', 'verde'], cyan: ['#00ffff', 'azul'], magenta: ['#ff00ff', 'rosa'],
  blue: ['#6f8cff', 'azul'], red: ['#ff5a5a', 'vermelho'], darkYellow: ['#c9b200', 'amarelo-escuro'], lightGray: ['#d9d9d9', 'cinza'],
  darkGray: ['#a6a6a6', 'cinza'], darkCyan: ['#5fbfbf', 'azul'], darkGreen: ['#6fbf6f', 'verde'], darkMagenta: ['#bf6fbf', 'roxo'],
  darkRed: ['#bf5a5a', 'vermelho'], darkBlue: ['#6f6fbf', 'azul'],
};

function nomearCor(hexOuNome: string): [string, string] {
  if (CORES_WORD[hexOuNome]) return CORES_WORD[hexOuNome];
  const h = hexOuNome.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return ['#fff200', 'colorido'];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let nome = 'colorido';
  if (max - min < 30) nome = 'cinza';
  else if (r === max && g < 140 && b < 140) nome = 'vermelho';
  else if (r === max && g > 140 && b < 120) nome = g > 200 ? 'amarelo' : 'laranja';
  else if (g === max && r > 200) nome = 'amarelo';
  else if (g === max) nome = b > 200 ? 'azul' : 'verde';
  else if (b === max) nome = r > 150 ? 'roxo' : 'azul';
  return ['#' + h, nome];
}

/* ---------- cabeçalho ---------- */

const ASPAS = String.raw`[”"'’′″“]`;
const RE_LOC = /^\**\s*LOC(?:UTOR[A]?|U[CÇ][AÃ]O)?\s*[:-]?\s+(.+?)\s*\**$/i;
const RE_SEM_LOC = /^SEM\s+LOC\w*\.?$/i;
const RE_SEM_SELO = /^SEM\s+SELO\.?$/i;
const RE_COM_SELO = /^COM\s+SELO\.?$/i;
const RE_VERSOES = /^VERS[ÕO]ES\s*:/i;
const RE_CAP_SO = /^CAP(?:[IÍ]TULO)?\.?\s*(\d+)$/i;
/** Nome de locutor: curto, sem pontuação de frase. "LOC: No dia do gaúcho…" é texto de locução, não cabeçalho. */
const pareceNome = (v: string) => v.length <= 40 && v.split(/\s+/).length <= 6 && !/[.!?…,;:]/.test(v) && !/\p{Ll}{2,}\s+\p{Ll}{2,}\s+\p{Ll}{2,}/u.test(v);
const RE_SELO = /^(?:COM\s+)?SELO(?:\s+DE)?\s*:?\s*(.+)$/i;
const RE_FECHAR = new RegExp(String.raw`^\(?\s*FECHAR\s+(?:COM|C\/)\s*(\d{1,3})\s*${ASPAS}*\s*(NO\s+M[AÁ]X\w*)?\.?\s*\)?$`, 'i');
const RE_MAX = new RegExp(String.raw`^\(?\s*M[AÁ]X\w*\.?\s*(\d{1,3})\s*${ASPAS}*\s*\)?$`, 'i');
const RE_DUR = new RegExp(String.raw`^[\s(/]*(?:ESTIMADA\s+|(?:TEMPO|DURA[CÇ][AÃ]O)(?:\s+ESTIMAD[OA])?\s*:?\s*)?(?:\d{1,3}\s*\/\s*)?(\d{1,3})\s*${ASPAS}{1,2}[\s)/]*$`, 'i');
const RE_MIN_SEG = new RegExp(String.raw`\b(\d)\s*[’'′]\s*(\d{2})\s*${ASPAS}{1,2}`);
const RE_REDATOR = /^REDATOR[A]?\s*:\s*(.+)$/i;
const RE_DATA_SO = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/;
const RE_DATA = /(?<![\d:.])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?![\d:.]*\d)/;
const RE_CAP = /\bCAP(?:[IÍ]TULO)?\.?\s*(\d+)/i;
const RE_LEGENDA_VERMELHO = /em vermelho.*cort/i;

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'em', 'no', 'na', 'a', 'o', 'para', 'por']);
const tituloCaso = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s/(-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/(?<=\s)\p{L}+(?=\s)/gu, (w) => (MINUSCULAS.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .trim();

const iso = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/* ---------- artes ---------- */

/** "AMANHÃ/HOJE" são versões; "15/11" é uma data. Só separa quando toda barra fica entre letras. */
export const ehVersoes = (texto: string) => /\//.test(texto) && [...texto.matchAll(/\//g)].every((m) => {
  const antes = texto.slice(0, m.index).trimEnd();
  const depois = texto.slice(m.index! + 1).trimStart();
  return /\p{L}$/u.test(antes) && /^\p{L}/u.test(depois);
});

/** Link ou caminho de rede: costuma vir sublinhado, mas não é arte. */
export const RE_LINK = /\\\\|https?:|www\.|\b[a-z]:\\|servicos\.corp|\.com\.br\b|\S\\\S/i;

const RE_DIA = /^(PR[ÓO]XIM[OA]\s+)?(HOJE|AMANH[ÃA]|DOMINGO|SEGUNDA|TER[ÇC]A|QUARTA|QUINTA|SEXTA|S[ÁA]BADO)(-FEIRA)?(\s+QUE\s+VEM)?$/i;
const RE_HORA = /^\d{1,2}\s?[:h]\s?\d{2}$/i;

/** Dia ou horário: a pontuação que vem depois não faz parte da arte. */
const ehDiaOuHora = (texto: string) => {
  const t = texto.trim().replace(/[\s.…,!?:;]+$/, '');
  return RE_DIA.test(t) || RE_HORA.test(t);
};

/** O tipo só é preenchido quando o próprio roteiro diz ("LETTERING: …", "GC: …"). Fora isso, fica em branco. */
export function sugerirSubtipo(_texto: string, antes: string): SubtipoArte {
  const dito = antes.match(/\b(lettering|gc|rodap[eé]|cart[aã]o|cartela|tela\s+cheia|vinheta|assinatura|logo|passagem|foto|moldura)\s*:?\s*$/i)?.[1].toLowerCase();
  if (!dito) return '';
  if (dito === 'gc' || dito.startsWith('rodap')) return 'rodape';
  if (dito.startsWith('cart') || dito.startsWith('tela')) return 'cartao';
  return dito as SubtipoArte;
}

/* ---------- etiquetas reconhecidas pelo texto ---------- */

const INFERENCIAS: { re: RegExp; etq: TipoEtiqueta; nota: string }[] = [
  { re: /^\s*\(?\s*(?:lettering|gc|arte|cartela|rodap[eé]|tela\s+cheia)\s*:.*$/i, etq: 'edicao', nota: 'Linha que pede uma arte ("LETTERING: …", "(ARTE: …)") → orientação, fora da locução' },
  { re: /\(\s*(?:arte|lettering|gc|cartela|logo)\b[^()]*\)/gi, etq: 'edicao', nota: '"(Arte: …)" e "(logo …)" no meio do texto → orientação, fora da locução' },
  { re: /^\s*caminho\s*:.*$/i, etq: 'producao', nota: '"CAMINHO: …" → nota de produção' },
  { re: /^(?=.*\p{Ll})\s*\(*\s*(?:(?:bate|assina\s+com|fecha\s+com|encerra\s+com|abre\s+com|abrir\s+com)\s+)?logo\b[^.!?]{0,60}\)*\s*$/iu, etq: 'edicao', nota: '"Logo …", "Fecha com logo …" → orientação para a edição' },
  { re: /^\s*\/*\s*passagem\s*\/*\s*$/i, etq: 'edicao', nota: '"Passagem//" → orientação para a edição' },
  { re: /^(?=.*\p{Ll})\s*(?:respiro|sobe\s+som|trilha)\b.{0,60}$/iu, etq: 'sonoplastia', nota: '"Respiro trilha", "Sobe som" → sonoplastia' },
  { re: /^\s*aten[cç][aã]o,?\s+sonoplast\w*\s*:?.*$/i, etq: 'sonoplastia', nota: 'Recado ao sonoplasta → sonoplastia' },
  { re: /^\s*\(*\s*plim[\s-]?plim\s*\)*\s*$/i, etq: 'sonoplastia', nota: '"Plim plim" → sonoplastia' },
  { re: /\(\(?[^()]*\b(?:plim|sonoplast\w*|trilha|m[uú]sica|sobe som)\b[^()]*\)\)?/gi, etq: 'sonoplastia', nota: 'Instrução de som entre parênteses → sonoplastia' },
  { re: /\(l[eê]-se\s[^()]*\)/gi, etq: 'locutor', nota: '"(lê-se…)" → pronúncia para o locutor' },
  { re: /\(\(?[^()]*\b(?:encerra|abre com|ilustra\w*|cobrir|fakear|bate logo|tk)\b[^()]*\)\)?/gi, etq: 'edicao', nota: 'Instrução de imagem entre parênteses → edição' },
  { re: /\/\s*ed(?:i)?t\b[^/]{3,}\//gi, etq: 'edicao', nota: 'Instrução entre barras ("/EDT …/") → edição' },
];

/** Aplica um patch a uma faixa de caracteres do parágrafo, dividindo os trechos nas bordas. */
function aplicarFaixa(par: ParI, ini: number, fim: number, patch: (t: Trecho) => void): ParI {
  const out: ParI = [];
  let pos = 0;
  for (const tr of par) {
    const a = pos;
    const b = pos + tr.t.length;
    pos = b;
    if (b <= ini || a >= fim) {
      out.push(tr);
      continue;
    }
    const i0 = Math.max(ini, a) - a;
    const i1 = Math.min(fim, b) - a;
    if (i0 > 0) out.push({ ...tr, t: tr.t.slice(0, i0) });
    const meio = { ...tr, t: tr.t.slice(i0, i1) };
    patch(meio);
    out.push(meio);
    if (i1 < tr.t.length) out.push({ ...tr, t: tr.t.slice(i1) });
  }
  return out;
}

const textoI = (par: ParI) => par.map((t) => t.t).join('');

/* ---------- interpretação ---------- */

interface Item {
  e: Par[];
  d: Par[];
  duas: boolean;
}

export function interpretar(bruto: DocBruto, opcoes: OpcoesImportacao = {}): Importacao {
  const meta = metaVazia();
  const entendido: string[] = [];
  const anotar = (s: string) => {
    if (!entendido.includes(s)) entendido.push(s);
  };

  /* 1. Sequência de itens (parágrafos soltos e linhas de tabela), cortando em "DECUPAGEM". */
  const itens: Item[] = [];
  let parou = false;
  const cortar = (pars: Par[]): Par[] => {
    const out: Par[] = [];
    for (const p of pars) {
      if (parou) break;
      if (textoDoPar(p).includes('DECUPAGEM')) {
        parou = true;
        break;
      }
      // quebra manual (Shift+Enter) vale como parágrafo: o roteiro é escrito linha a linha
      let linha: Par = [];
      for (const r of p) {
        r.t.replace(/\t/g, ' ').split('\n').forEach((pedaco, k) => {
          if (k > 0) {
            out.push(linha);
            linha = [];
          }
          if (pedaco) linha.push({ ...r, t: pedaco });
        });
      }
      out.push(linha);
    }
    return out;
  };
  for (const b of bruto.blocos) {
    if (parou) break;
    if (b.tipo === 'p') itens.push({ e: [], d: cortar([b.par]), duas: false });
    else
      for (const linha of b.linhas) {
        if (linha.length >= 2) itens.push({ e: cortar(linha[0]), d: cortar(linha.slice(1).flat()), duas: true });
        else itens.push({ e: [], d: cortar(linha.flat()), duas: false });
      }
  }
  if (parou) anotar('Tudo a partir de "DECUPAGEM" ficou de fora');

  /* 2. Cabeçalho: linhas que são metadado saem do corpo. */
  let dataRedacao: { dia: number; mes: number; ano?: number } | null = null;
  let dataExib: { dia: number; mes: number; ano?: number } | null = null;
  let tituloExtra = '';
  let legendaVermelho = false;
  let cabecalhoColunas: string | null = null;

  const lerData = (m: RegExpMatchArray) => {
    const ano = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : undefined;
    return { dia: parseInt(m[1], 10), mes: parseInt(m[2], 10), ano };
  };

  const definir = <K extends keyof Meta>(campo: K, valor: Meta[K]) => {
    // num arquivo com mais de uma chamada, vale o cabeçalho da primeira
    if (meta[campo] === '' || meta[campo] === null) meta[campo] = valor;
  };

  const lerLinhaTitulo = (s: string): boolean => {
    const comPgm = /^PGM\s*:/i.test(s);
    const prog = acharPrograma(s);
    if (!comPgm && !prog) return false;
    const data = s.match(RE_DATA);
    const cap = s.match(RE_CAP);
    if (!comPgm && !data && !cap) return false;
    if (s.length > 110 || analisarSonoras(s).length) return false;
    // sem "PGM:", só vale uma linha curta que começa pelo programa ("NOBREZA 27-10 (CAP 184)"), não uma frase que o cita
    if (!comPgm && (s.length > 45 || !prog!.pistas.some((p) => semAcento(s.split(/\s+/).slice(0, 3).join(' ')).includes(p)))) return false;
    const duracao = s.match(RE_MIN_SEG);
    if (duracao) definir('duracaoAlvoSeg', parseInt(duracao[1], 10) * 60 + parseInt(duracao[2], 10));
    if (data && !dataExib) dataExib = lerData(data);
    if (cap) definir('capitulo', parseInt(cap[1], 10));
    const praca = PRACAS.find((p) => new RegExp(`\\b${p}\\b`).test(s));
    if (praca) definir('praca', normalizarPraca(praca));
    // o que sobra da linha, tirando data, capítulo, praça e duração, é o nome do programa e/ou da chamada
    let resto = s.replace(/^PGM\s*:\s*/i, '');
    if (duracao) resto = resto.replace(duracao[0], ' ');
    if (data) resto = resto.replace(data[0], ' ');
    resto = resto.replace(/\(?\s*CAP(?:[IÍ]TULO)?\.?\s*\d+\s*\)?/gi, ' ');
    if (praca) resto = resto.replace(new RegExp(`\\b${praca}\\b`), ' ');
    const entre = [...resto.matchAll(/\(([^()]+)\)/g)].map((m) => m[1].trim()).filter(Boolean);
    resto = resto.replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s–—-]+|[\s–—.-]+$/g, '');
    const [antes, ...depois] = resto.split(/\s+[–—-]\s+/);
    if (prog) {
      definir('programa', prog.nome);
      if (meta.programa === prog.nome) meta.tipoPrograma = prog.tipo;
    } else if (antes) definir('programa', tituloCaso(antes));
    const sobra = [
      // "VERT ESTRELAS/THIS IS US": quando a linha diz mais do que o nome do programa, é o nome da chamada
      prog && antes && !prog.pistas.some((p) => semAcento(antes) === p) && semAcento(antes) !== semAcento(prog.nome) ? tituloCaso(antes) : '',
      ...depois.map(tituloCaso),
      ...entre.map((x) => (/^pr[oó]logo$/i.test(x) ? 'Prólogo' : tituloCaso(x))),
    ].filter(Boolean);
    if (sobra.length && !tituloExtra) tituloExtra = sobra.join(' · ');
    anotar('Linha de título → programa, data e capítulo no cabeçalho');
    return true;
  };

  const consumirSegmento = (s: string): boolean => {
    let m: RegExpMatchArray | null;
    if (RE_SEM_LOC.test(s)) {
      definir('locutor', 'SEM LOC');
      anotar(`"${s}" → sem locução, no cabeçalho`);
      return true;
    }
    if ((m = s.match(RE_LOC)) && pareceNome(m[1].trim())) {
      definir('locutor', m[1].trim().toUpperCase());
      anotar(`"${s}" → locutor no cabeçalho`);
      return true;
    }
    if (RE_SEM_SELO.test(s) || RE_COM_SELO.test(s)) {
      definir('selo', RE_SEM_SELO.test(s) ? 'Sem selo' : 'Com selo');
      anotar(`"${s}" → selo no cabeçalho`);
      return true;
    }
    if (RE_VERSOES.test(s)) {
      anotar('"VERSÕES: …" saiu do texto: as versões vêm das artes marcadas');
      return true;
    }
    if ((m = s.match(RE_CAP_SO))) {
      definir('capitulo', parseInt(m[1], 10));
      return true;
    }
    if ((m = s.match(RE_FECHAR))) {
      if (meta.duracaoAlvoSeg === null) meta.duracaoModo = m[2] ? 'max' : 'fechar';
      definir('duracaoAlvoSeg', parseInt(m[1], 10));
      anotar(`"${s}" → duração-alvo: ${m[2] ? 'no máximo' : 'fechar com'} ${m[1]}''`);
      return true;
    }
    if ((m = s.match(RE_MAX))) {
      if (meta.duracaoAlvoSeg === null) meta.duracaoModo = 'max';
      definir('duracaoAlvoSeg', parseInt(m[1], 10));
      anotar(`"${s}" → duração-alvo: no máximo ${m[1]}''`);
      return true;
    }
    if ((m = s.match(RE_DUR))) {
      definir('duracaoAlvoSeg', parseInt(m[1], 10));
      anotar(`"${s}" → duração-alvo: ${m[1]}''`);
      return true;
    }
    if ((m = s.match(RE_SELO))) {
      const v = m[1].trim().replace(/\.$/, '');
      definir('selo', /verifi/i.test(v) ? 'Verifique a classificação indicativa' : v.toUpperCase());
      anotar(`"${s}" → selo no cabeçalho`);
      return true;
    }
    if ((m = s.match(RE_REDATOR))) {
      definir('redator', tituloCaso(m[1]));
      anotar(`"${s}" → redação no cabeçalho`);
      return true;
    }
    if ((m = s.match(RE_DATA_SO))) {
      dataRedacao ??= lerData(m);
      return true;
    }
    if (lerLinhaTitulo(s)) return true;
    if (naZonaDoCabecalho && s.length <= 30 && (m = s.match(RE_DATA)) && !analisarSonoras(s).length) {
      if (!dataExib) dataExib = lerData(m);
      const nome = s.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
      if (nome && !tituloExtra) tituloExtra = tituloCaso(nome);
      anotar(`"${s}" → nome da chamada e data no cabeçalho`);
      return true;
    }
    return false;
  };

  /** Antes da linha ILUSTRAÇÃO | ÁUDIO tudo é cabeçalho. */
  let naZonaDoCabecalho = false;
  const ehMeta = (par: Par): boolean => {
    const texto = textoDoPar(par).replace(/\s+/g, ' ').trim();
    if (!texto || texto.length > 120) return false;
    const segs = texto.split('//').map((x) => x.trim()).filter(Boolean);
    if (!segs.length) return false;
    // só consome se a linha inteira for cabeçalho
    const copia = { ...meta };
    const estado = { dataRedacao, dataExib, tituloExtra, n: entendido.length };
    if (segs.every(consumirSegmento)) return true;
    Object.assign(meta, copia);
    ({ dataRedacao, dataExib, tituloExtra } = estado);
    entendido.length = estado.n;
    return false;
  };

  const ehCabecalhoColuna = (par: Par): string | null => {
    const s = semAcento(textoDoPar(par)).trim();
    return ['ilustracao', 'audio', 'instrucoes', 'texto'].includes(s) ? s : null;
  };

  const linhaDasColunas = itens.findIndex((it) => [...it.e, ...it.d].some((p) => ehCabecalhoColuna(p)));
  itens.forEach((item, idx) => {
    naZonaDoCabecalho = idx < linhaDasColunas;
    for (const lado of ['e', 'd'] as const) {
      item[lado] = item[lado].filter((par) => {
        const col = ehCabecalhoColuna(par);
        if (col) {
          cabecalhoColunas = col === 'ilustracao' || col === 'audio' ? 'ilustracao_audio' : 'instrucoes_texto';
          return false;
        }
        if (RE_LEGENDA_VERMELHO.test(textoDoPar(par))) {
          legendaVermelho = true;
          anotar('"Em vermelho se precisar cortar" é uma legenda: saiu do texto');
          return false;
        }
        return !ehMeta(par);
      });
    }
  });

  // Uma linha curta, sozinha, acima das colunas e que não é cabeçalho conhecido: é o nome do programa ou da chamada.
  const primeiraDupla = itens.findIndex((it) => it.duas);
  if (primeiraDupla > 0 && (!meta.programa || !tituloExtra)) {
    for (const item of itens.slice(0, primeiraDupla)) {
      const candidatos = item.d.filter((p) => textoDoPar(p).trim());
      const texto = candidatos.length === 1 ? textoDoPar(candidatos[0]).replace(/\s+/g, ' ').trim() : '';
      if (!texto || texto.length > 70 || candidatos[0].some((r) => r.u || r.hl)) continue;
      if (!meta.programa && !acharPrograma(bruto.arquivo.replace(/[_.]+/g, ' '))) meta.programa = tituloCaso(texto);
      else if (!tituloExtra) tituloExtra = tituloCaso(texto);
      else continue;
      item.d = [];
      anotar(`"${texto}" acima das colunas → nome no cabeçalho`);
      break;
    }
  }

  /* 3. Dados que vêm do nome do arquivo e do autor. */
  meta.claquete = claqueteDoArquivo(bruto.arquivo);
  const nome = bruto.arquivo.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
  if (!meta.programa) {
    const prog = acharPrograma(nome) ?? acharPrograma(bruto.arquivo);
    if (prog) {
      meta.programa = prog.nome;
      meta.tipoPrograma = prog.tipo;
      anotar('Programa reconhecido pelo nome do arquivo');
    }
  }
  if (!dataExib) {
    // como na claquete, vale o último par dia/mês válido do nome ("Quem_Ama_V2_26_10" → 26/10)
    const m = [...nome.matchAll(/(?<!\d)(\d{1,2})[ .-](?=(\d{1,2})(?!\d))/g)].reverse().find((x) => +x[1] >= 1 && +x[1] <= 31 && +x[2] >= 1 && +x[2] <= 12);
    if (m) {
      dataExib = lerData(m);
      anotar('Data de exibição tirada do nome do arquivo');
    }
  }
  if (!meta.praca) {
    const p = PRACAS.find((x) => new RegExp(`(^|[ _])${x}($|[ _.])`, 'i').test(bruto.arquivo.replace(/\.[^.]+$/, '')));
    if (p) {
      meta.praca = normalizarPraca(p);
      anotar('Praça tirada do nome do arquivo');
    }
  }
  const exib = (dataExib ?? dataRedacao) as { dia: number; mes: number; ano?: number } | null;
  if (exib && exib.mes >= 1 && exib.mes <= 12 && exib.dia >= 1 && exib.dia <= 31) {
    const ano = exib.ano ?? (dataRedacao as { ano?: number } | null)?.ano ?? opcoes.anoPadrao ?? new Date().getFullYear();
    meta.dataExibicao = iso(ano, exib.mes, exib.dia);
  }
  // claquete do Rio começa por "RIO", a de São Paulo termina em "SP"; o resto é G5
  if (!meta.praca) meta.praca = /^RIO /.test(meta.claquete) ? 'RJ' : / SP$/.test(meta.claquete) ? 'SP' : 'G5';
  if (!meta.redator && bruto.autor) {
    meta.redator = bruto.autor.replace(/_[A-Z0-9]+$/, '').trim();
    anotar('Redação: autor do arquivo');
  }

  /* 4. Layout. */
  const temEsquerda = itens.some((it) => it.e.some((p) => textoDoPar(p).trim()));
  const layout: Layout = temEsquerda ? ((cabecalhoColunas as Layout | null) ?? 'instrucoes_texto') : 'coluna_unica';
  meta.layout = layout;
  if (layout !== 'coluna_unica')
    anotar(`Tabela de 2 colunas → layout ${layout === 'ilustracao_audio' ? 'Ilustração | Áudio' : 'Instruções | Texto'}`);
  else if (itens.some((it) => it.duas)) anotar('Tabela com a coluna da esquerda vazia → texto corrido');

  /* 5. Parágrafos → trechos com significado. */
  const perguntas: Pergunta[] = [];
  const chavePergunta = new Map<string, number>();
  let contexto = ''; // texto anterior no mesmo parágrafo, para sugerir o subtipo

  const pergunta = (estilo: Pergunta['estilo'], cor: string, texto: string, naEsquerda: boolean): number => {
    const [corCss, nomeCor] = nomearCor(cor);
    let sugestao: Resposta;
    let porque: string;
    if (/plim|sonoplast|trilha|m[uú]sica/i.test(texto)) {
      sugestao = 'sonoplastia';
      porque = 'Fala de som ou de trilha.';
    } else if (/^\(?\s*l[eê]-se/i.test(texto)) {
      sugestao = 'locutor';
      porque = '"Lê-se" é uma pronúncia para quem grava.';
    } else if (estilo === 'cor' && nomeCor === 'vermelho') {
      sugestao = 'cortavel';
      porque = 'Vermelho costuma marcar o que pode sair se a chamada estourar.';
    } else if (naEsquerda || /utilizado|cap[ií]tulo|caminho|arquivos?|produ[cç][aã]o|m[ií]dia|frame|contato/i.test(texto)) {
      sugestao = 'producao';
      porque = 'Parece origem do material ou contato, não texto da chamada.';
    } else {
      sugestao = 'comentario';
      porque = 'Não parece texto para ser lido.';
    }
    const chave = `${estilo}|${corCss}|${sugestao}`;
    let id = chavePergunta.get(chave);
    if (id === undefined) {
      id = perguntas.length;
      chavePergunta.set(chave, id);
      const oque = estilo === 'marca-texto' ? `marca-texto ${nomeCor}` : `texto em ${nomeCor}`;
      const frases: Record<Resposta, string> = {
        cortavel: `Esse ${oque} pode sair se a chamada estourar?`,
        producao: `Esse ${oque} é um recado para a produção?`,
        sonoplastia: `Esse ${oque} é para a sonoplastia?`,
        locutor: `Esse ${oque} é uma orientação para o locutor?`,
        edicao: `Esse ${oque} é uma orientação para a edição?`,
        comentario: `Esse ${oque} é um comentário?`,
        ignorar: `O que significa esse ${oque}?`,
      };
      perguntas.push({ id, estilo, corCss, nomeCor, trechos: [], pergunta: frases[sugestao], porque, sugestao });
    }
    return id;
  };

  const converter = (par: Par, naEsquerda: boolean): ParI => {
    let out: ParI = [];
    contexto = '';
    const total = textoDoPar(par);

    // marca-texto num rótulo ("ARQUIVOS:") vale para o resto do parágrafo
    let hlHerdado: string | undefined;
    // (só quando o rótulo é a única parte destacada; se a frase inteira está em marca-texto, não é rótulo)
    const destacados = par.filter((r) => r.hl && r.t.trim());
    const runs = par.map((r) => {
      if (r.hl && destacados.length === 1 && /:\s*$/.test(r.t)) hlHerdado = r.hl;
      return !r.hl && hlHerdado ? { ...r, hl: hlHerdado } : r;
    });

    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      const base: Trecho = { t: r.t };
      if (r.b) base.b = true;
      if (r.i) base.i = true;

      const ehLink = (t: string, cor?: string) => RE_LINK.test(t) || /^(0563C1|0000FF|1155CC)$/i.test(cor ?? '');
      // instrução de imagem sublinhada ("Ilustrar com imagens de…") é para a edição, não é arte
      if (r.u && !r.link && /^\s*(?:ilustrar|cobrir)\s+com\s+(?:imagens?|sequ[eê]ncia|takes?)\b/i.test(r.t)) {
        out.push({ ...base, etq: 'edicao' });
        anotar('"Ilustrar com imagens…" sublinhado → orientação para a edição');
        contexto += r.t;
        continue;
      }
      if (r.u && !r.link && r.t.trim() && !ehLink(r.t, r.cor)) {
        // junta sublinhados vizinhos (inclusive com espaços entre eles)
        let texto = r.t;
        let j = i + 1;
        while (j < runs.length) {
          const prox = runs[j];
          if (prox.u && !prox.link && !ehLink(prox.t, prox.cor)) texto += prox.t;
          else if (!prox.t.trim() && runs[j + 1]?.u && runs[j + 1].t.trim()) texto += prox.t;
          else break;
          j++;
        }
        i = j - 1;
        const partes = ehVersoes(texto) ? texto.split('/') : [texto];
        const grupo = partes.filter((p) => p.trim()).length > 1 ? novoId() : undefined;
        if (grupo) anotar('Versões sublinhadas juntas ("AMANHÃ/HOJE") → uma arte por versão');
        partes.forEach((parte, k) => {
          if (k > 0) out.push({ t: '/' });
          if (!parte.trim()) {
            if (parte) out.push({ t: parte });
            return;
          }
          const ini = parte.match(/^\s*/)![0];
          const fim = parte.match(/\s*$/)![0];
          const miolo = parte.slice(ini.length, parte.length - fim.length);
          if (ini) out.push({ t: ini });
          const subtipo = sugerirSubtipo(miolo, contexto);
          const rabo = ehDiaOuHora(miolo) ? (miolo.match(/[\s.…,!?:;]+$/)?.[0] ?? '') : '';
          out.push({ t: rabo ? miolo.slice(0, -rabo.length) : miolo, arte: { subtipo, grupo } });
          if (rabo + fim) out.push({ t: rabo + fim });
        });
        contexto += texto;
        continue;
      }

      if (ehLink(r.t, r.cor) && !r.hl) {
        out.push({ ...base, ...(naEsquerda ? { etq: 'producao' as const } : {}) });
        contexto += r.t;
        continue;
      }
      if (r.t.trim() && (r.hl || r.cor)) {
        if (r.cor && !r.hl && legendaVermelho && nomearCor(r.cor)[1] === 'vermelho') {
          base.etq = 'cortavel';
          anotar('Texto vermelho → "pode cortar" (o próprio roteiro avisa)');
        } else {
          base.legado = pergunta(r.hl ? 'marca-texto' : 'cor', (r.hl ?? r.cor)!, r.t.trim(), naEsquerda);
        }
        // uma barra de pausa no fim do trecho colorido não faz parte da marcação
        const barra = base.t.match(/\s*\/+\s*$/);
        if (barra && barra[0].length < base.t.length) {
          out.push({ ...base, t: base.t.slice(0, -barra[0].length) }, { t: barra[0] });
          contexto += r.t;
          continue;
        }
      }
      out.push(base);
      contexto += r.t;
    }

    // versões sublinhadas uma a uma ("DOMINGO/AMANHÃ/HOJE") são versões da mesma arte
    for (let i = 0; i + 2 < out.length; i++) {
      const [a, barra, b] = [out[i], out[i + 1], out[i + 2]];
      if (a.arte && b.arte && barra.t.trim() === '/' && !barra.arte) {
        const grupo = a.arte.grupo ?? b.arte.grupo ?? novoId();
        a.arte.grupo = b.arte.grupo = grupo;
        anotar('Versões sublinhadas juntas ("AMANHÃ/HOJE") → uma arte por versão');
      }
    }

    // etiquetas reconhecidas só pelo texto
    for (const inf of INFERENCIAS) {
      const texto = textoI(out);
      const re = new RegExp(inf.re.source, inf.re.flags.includes('g') ? inf.re.flags : inf.re.flags + 'g');
      for (let m; (m = re.exec(texto)); ) {
        if (!m[0].trim()) break;
        const ini = m.index + (m[0].length - m[0].trimStart().length);
        const fim = m.index + m[0].trimEnd().length;
        let livre = true;
        let pos = 0;
        for (const tr of out) {
          if (pos < fim && pos + tr.t.length > ini && (tr.etq || tr.legado !== undefined)) livre = false;
          pos += tr.t.length;
        }
        if (!livre) continue;
        out = aplicarFaixa(out, ini, fim, (t) => {
          t.etq = inf.etq;
        });
        anotar(inf.nota);
      }
    }

    // negrito só faz sentido nas falas das sonoras; no resto, o padrão é texto limpo
    if (RE_LINHA_LOC.test(total) || !analisarSonoras(total).length) out = out.map(({ b: _b, ...resto }) => resto);

    // limpa espaços das pontas
    while (out.length && !out[0].t.trim()) out.shift();
    while (out.length && !out[out.length - 1].t.trim()) out.pop();
    if (out.length) {
      out[0] = { ...out[0], t: out[0].t.trimStart() };
      out[out.length - 1] = { ...out[out.length - 1], t: out[out.length - 1].t.trimEnd() };
    }
    return out.filter((t) => t.t);
  };

  const corrido: ParI[] = [];
  const linhas: LinhaI[] = [];
  for (const item of itens) {
    // na coluna da esquerda, um rótulo com marca-texto ("ARQUIVOS:") vale para as linhas logo abaixo
    let rotulo: string | undefined;
    const esquerda = item.e.map((par) => {
      const texto = textoDoPar(par).trim();
      const primeiro = par.find((r) => r.t.trim());
      if (!texto) rotulo = undefined;
      else if (primeiro?.hl && /:\s*$/.test(primeiro.t) && par.filter((r) => r.hl && r.t.trim()).length === 1) rotulo = primeiro.hl;
      else if (par.some((r) => r.hl || r.u)) rotulo = undefined;
      else if (rotulo) return par.map((r) => ({ ...r, hl: rotulo }));
      return par;
    });
    const e = esquerda.map((p) => converter(p, true)).filter((p) => p.length);
    const d = item.d.map((p) => converter(p, false));
    if (layout === 'coluna_unica') {
      corrido.push(...d.filter((p) => p.length));
      continue;
    }
    // cada grupo de parágrafos (separado por linha em branco) vira uma linha da tabela
    const grupos: ParI[][] = [];
    let atual: ParI[] = [];
    const fechar = () => {
      if (atual.length) grupos.push(atual);
      atual = [];
    };
    for (const p of d) {
      if (!p.length) {
        fechar();
        continue;
      }
      const texto = textoI(p);
      const corte = /^\s*\/\/\s*$/.test(texto);
      const locucao = !corte && (RE_LINHA_LOC.test(texto) || !analisarSonoras(texto).length) && ehLocucao(p.filter((t) => !t.etq && t.legado === undefined).map((t) => t.t).join(''));
      // locução abre uma linha nova; "//" fecha a linha em que está
      if (locucao && atual.length && !ehLocucao(textoI(atual[atual.length - 1]))) fechar();
      atual.push(p);
      if (corte) fechar();
    }
    fechar();
    if (!grupos.length && e.length) grupos.push([]);
    grupos.forEach((g, i) => linhas.push({ e: i === 0 ? e : [], d: g }));
  }

  // Sem a linha ILUSTRAÇÃO | ÁUDIO, confere de que lado está o texto falado: o padrão é à direita.
  if (layout !== 'coluna_unica' && !cabecalhoColunas) {
    // só conta o que não foi etiquetado: rótulo de produção em CAIXA ALTA não é locução
    const limpo = (p: ParI) => p.filter((t) => !t.etq && t.legado === undefined).map((t) => t.t).join('');
    const falado = (pars: ParI[]) => pars.reduce((n, p) => n + (analisarSonoras(limpo(p)).length ? 2 : ehLocucao(limpo(p)) && limpo(p).trim().length > 12 ? 1 : 0), 0);
    const esq = linhas.reduce((n, l) => n + falado(l.e), 0);
    const dir = linhas.reduce((n, l) => n + falado(l.d), 0);
    if (esq > dir) {
      for (const l of linhas) [l.e, l.d] = [l.d, l.e];
      anotar('O texto falado estava na coluna da esquerda → colunas trocadas para o padrão (texto à direita)');
    }
  }

  // textos das perguntas, na ordem do documento
  const coletar = (p: ParI) => {
    let ultimo = -1;
    for (const t of p) {
      if (t.legado === undefined) {
        if (t.t.trim()) ultimo = -1;
        else if (ultimo >= 0) perguntas[ultimo].trechos[perguntas[ultimo].trechos.length - 1] += ' ';
        continue;
      }
      const lista = perguntas[t.legado].trechos;
      if (ultimo === t.legado) lista[lista.length - 1] += t.t;
      else lista.push(t.t);
      ultimo = t.legado;
    }
  };
  corrido.forEach(coletar);
  linhas.forEach((l) => [...l.e, ...l.d].forEach(coletar));
  perguntas.forEach((p) => (p.trechos = p.trechos.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)));

  /* 6. Dados derivados do corpo. */
  const todos = layout === 'coluna_unica' ? corrido : linhas.flatMap((l) => [...l.e, ...l.d]);
  const nArtes = todos.reduce((n, p) => n + p.filter((t) => t.arte).length, 0);
  if (nArtes) anotar(`Sublinhados → ${nArtes} ${nArtes === 1 ? 'arte' : 'artes'}`);
  let nSonoras = 0;
  for (const p of todos) {
    const s = RE_LINHA_LOC.test(textoI(p)) ? [] : analisarSonoras(textoI(p));
    nSonoras += s.length;
    if (!meta.edicao && s[0]?.origem === 'PGM') {
      const m = s[0].origemOriginal.match(/PGM\s*(\d+)/i);
      if (m) meta.edicao = `PGM ${m[1]}`;
    }
  }
  if (nSonoras) anotar(`Timecodes → ${nSonoras} ${nSonoras === 1 ? 'sonora' : 'sonoras'}`);
  if (todos.some((p) => ehCaixaAlta(textoI(p)))) anotar('CAIXA ALTA → locução');
  if (todos.some((p) => RE_LINHA_LOC.test(textoI(p)))) anotar('Linhas com "LOC:" ou "OFF:" → locução');

  const partesTitulo = [tituloExtra, meta.capitulo ? `cap. ${meta.capitulo}` : '', meta.edicao].filter(Boolean);
  if (partesTitulo.length) meta.titulo = partesTitulo.join(' · ').replace(/^cap\./, 'Cap.');
  else if (meta.dataExibicao) {
    const [, mes, dia] = meta.dataExibicao.split('-');
    meta.titulo = `Chamada de ${dia}/${mes}`;
  }

  const faltando: string[] = [];
  if (!meta.locutor) faltando.push('locutor');
  if (!meta.selo) faltando.push('selo');
  if (!meta.duracaoAlvoSeg) faltando.push('duração');
  if (!meta.redator) faltando.push('quem escreveu');

  return { bruto, meta, corrido, linhas, perguntas, entendido, faltando };
}

/* ---------- montagem do documento do editor ---------- */

export function montarDoc(imp: Importacao, respostas: Record<number, Resposta> = {}): NoJSON {
  const paragrafo = (par: ParI): NoJSON => {
    const content: NoJSON[] = [];
    const etqs = par.map((tr) => {
      const resposta = tr.legado !== undefined ? (respostas[tr.legado] ?? imp.perguntas[tr.legado].sugestao) : undefined;
      return tr.etq ?? (resposta && resposta !== 'ignorar' ? resposta : undefined);
    });
    // espaços entre dois trechos da mesma etiqueta não a interrompem
    par.forEach((tr, i) => {
      if (!etqs[i] && !tr.t.trim() && etqs[i - 1] && etqs[i - 1] === etqs[i + 1]) etqs[i] = etqs[i - 1];
    });
    let etqId = '';
    for (let i = 0; i < par.length; i++) {
      const tr = par[i];
      const etq = etqs[i];
      if (etq && etq !== etqs[i - 1]) etqId = novoId();
      const marks: MarcaJSON[] = [];
      if (tr.b) marks.push({ type: 'bold' });
      if (tr.i && !etq && !tr.arte) marks.push({ type: 'italic' });
      if (tr.arte)
        marks.push({ type: 'arte', attrs: { id: novoId(), subtipo: tr.arte.subtipo, grupo: tr.arte.grupo ?? null, obs: '', sugerido: false } });
      if (etq) marks.push({ type: 'etiqueta', attrs: { id: etqId, tipo: etq, obs: '' } });
      tr.t.split('\n').forEach((pedaco, i) => {
        if (i > 0) content.push({ type: 'hardBreak', ...(marks.length ? { marks: marks.filter((m) => m.type !== 'bold') } : {}) });
        if (pedaco) content.push({ type: 'text', text: pedaco, ...(marks.length ? { marks } : {}) });
      });
    }
    return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
  };
  const celula = (pars: ParI[]): NoJSON => ({ type: 'celula', content: pars.length ? pars.map(paragrafo) : [{ type: 'paragraph' }] });

  if (imp.meta.layout === 'coluna_unica')
    return { type: 'doc', content: imp.corrido.length ? imp.corrido.map(paragrafo) : [{ type: 'paragraph' }] };
  return {
    type: 'doc',
    content: imp.linhas.length
      ? imp.linhas.map((l) => ({ type: 'linha', content: [celula(l.e), celula(l.d)] }))
      : [{ type: 'linha', content: [celula([]), celula([])] }],
  };
}
