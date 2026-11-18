import { textoDoPar, type DocBruto, type Par } from './bruto';
import { analisarSonoras, ehCaixaAlta } from '../modelo/sonora';
import { metaVazia, novoId, type Layout, type Meta, type NoJSON, type MarcaJSON, type SubtipoArte, type TipoEtiqueta } from '../modelo/tipos';
import { acharPrograma, PRACAS, semAcento } from '../modelo/vocabularios';

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
const RE_LOC = /^LOC(?:UTOR[A]?|U[CÇ][AÃ]O)?\s*[:-]\s*(.+)$/i;
const RE_SELO = /^(?:COM\s+)?SELO(?:\s+DE)?\s*:?\s*(.+)$/i;
const RE_FECHAR = new RegExp(String.raw`^\(?\s*FECHAR\s+(?:COM|C\/)\s*(\d{1,3})\s*${ASPAS}*\s*(NO\s+M[AÁ]X\w*)?\.?\s*\)?$`, 'i');
const RE_MAX = new RegExp(String.raw`^\(?\s*M[AÁ]X\w*\.?\s*(\d{1,3})\s*${ASPAS}*\s*\)?$`, 'i');
const RE_DUR = new RegExp(String.raw`^\(?\s*(?:ESTIMADA\s+)?(\d{1,3})\s*${ASPAS}{1,2}\s*\)?$`, 'i');
const RE_REDATOR = /^REDATOR[A]?\s*:\s*(.+)$/i;
const RE_DATA_SO = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/;
const RE_DATA = /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/;
const RE_CAP = /\bCAP(?:[IÍ]TULO)?\.?\s*(\d+)/i;
const RE_LEGENDA_VERMELHO = /em vermelho.*cort/i;

const tituloCaso = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .trim();

const iso = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/* ---------- artes ---------- */

const RE_DIA = /^(HOJE|AMANH[ÃA]|DOMINGO|SEGUNDA|TER[ÇC]A|QUARTA|QUINTA|SEXTA|S[ÁA]BADO)(-FEIRA)?$/i;
const RE_HORA = /^\d{1,2}\s?[:h]\s?\d{2}$/i;

export function sugerirSubtipo(texto: string, antes: string, sozinha: boolean, programa: string): SubtipoArte {
  const t = texto.trim();
  if (RE_DIA.test(t) || RE_HORA.test(t)) return 'versao';
  if (/\blogo\b\s*:?\s*$/i.test(antes) || /\blogo\b/i.test(t)) return 'logo';
  const s = semAcento(t).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(tv )?globo$/.test(s)) return 'logo';
  const prog = acharPrograma(programa);
  if (prog && prog.pistas.some((p) => s === p || (s.includes(p) && s.length - p.length <= 6))) return 'logo';
  if (/\sX\s/.test(t)) return 'tela_cheia';
  return sozinha ? 'lettering' : 'rodape';
}

/* ---------- etiquetas reconhecidas pelo texto ---------- */

const INFERENCIAS: { re: RegExp; etq: TipoEtiqueta; nota: string }[] = [
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
      out.push(p.map((r) => ({ ...r, t: r.t.replace(/\t/g, ' ') })));
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

  const lerLinhaTitulo = (s: string): boolean => {
    const comPgm = /^PGM\s*:/i.test(s);
    const prog = acharPrograma(s);
    if (!comPgm && !prog) return false;
    const data = s.match(RE_DATA);
    const cap = s.match(RE_CAP);
    if (!comPgm && !data && !cap) return false;
    if (s.length > 90 || analisarSonoras(s).length) return false;
    if (prog) {
      meta.programa = prog.nome;
      meta.tipoPrograma = prog.tipo;
    }
    if (data) dataExib = lerData(data);
    if (cap) meta.capitulo = parseInt(cap[1], 10);
    const praca = PRACAS.find((p) => new RegExp(`\\b${p}\\b`).test(s));
    if (praca) meta.praca = praca;
    const par = [...s.matchAll(/\(([^()]+)\)/g)].map((m) => m[1]).find((x) => !RE_CAP.test(x));
    if (par) tituloExtra = /^pr[oó]logo$/i.test(par.trim()) ? 'Prólogo' : tituloCaso(par);
    anotar('Linha de título → programa, data e capítulo no cabeçalho');
    return true;
  };

  const consumirSegmento = (s: string): boolean => {
    let m: RegExpMatchArray | null;
    if ((m = s.match(RE_LOC))) {
      meta.locutor = m[1].trim().toUpperCase();
      anotar(`"${s}" → locutor no cabeçalho`);
      return true;
    }
    if ((m = s.match(RE_FECHAR))) {
      meta.duracaoAlvoSeg = parseInt(m[1], 10);
      meta.duracaoModo = m[2] ? 'max' : 'fechar';
      anotar(`"${s}" → duração-alvo: ${m[2] ? 'no máximo' : 'fechar com'} ${m[1]}''`);
      return true;
    }
    if ((m = s.match(RE_MAX))) {
      meta.duracaoAlvoSeg = parseInt(m[1], 10);
      meta.duracaoModo = 'max';
      anotar(`"${s}" → duração-alvo: no máximo ${m[1]}''`);
      return true;
    }
    if ((m = s.match(RE_DUR))) {
      meta.duracaoAlvoSeg = parseInt(m[1], 10);
      anotar(`"${s}" → duração-alvo: ${m[1]}''`);
      return true;
    }
    if ((m = s.match(RE_SELO))) {
      const v = m[1].trim().replace(/\.$/, '');
      meta.selo = /verifique/i.test(v) ? 'Verifique a classificação indicativa' : v.toUpperCase();
      anotar(`"${s}" → selo no cabeçalho`);
      return true;
    }
    if ((m = s.match(RE_REDATOR))) {
      meta.redator = tituloCaso(m[1]);
      anotar(`"${s}" → redação no cabeçalho`);
      return true;
    }
    if ((m = s.match(RE_DATA_SO))) {
      dataRedacao = lerData(m);
      return true;
    }
    return lerLinhaTitulo(s);
  };

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

  for (const item of itens) {
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
  }

  /* 3. Dados que vêm do nome do arquivo e do autor. */
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
    const m = nome.match(/(\d{1,2})[ .-](\d{1,2})(?!\d)/);
    if (m && +m[1] <= 31 && +m[2] <= 12) {
      dataExib = lerData(m);
      anotar('Data de exibição tirada do nome do arquivo');
    }
  }
  if (!meta.praca) {
    const p = PRACAS.find((x) => new RegExp(`(^|[ _])${x}($|[ _.])`, 'i').test(bruto.arquivo.replace(/\.[^.]+$/, '')));
    if (p) {
      meta.praca = p;
      anotar('Praça tirada do nome do arquivo');
    }
  }
  const exib = (dataExib ?? dataRedacao) as { dia: number; mes: number; ano?: number } | null;
  if (exib && exib.mes >= 1 && exib.mes <= 12 && exib.dia >= 1 && exib.dia <= 31) {
    const ano = exib.ano ?? (dataRedacao as { ano?: number } | null)?.ano ?? opcoes.anoPadrao ?? new Date().getFullYear();
    meta.dataExibicao = iso(ano, exib.mes, exib.dia);
  }
  if (!meta.redator && bruto.autor) {
    meta.redator = bruto.autor.replace(/_[A-Z0-9]+$/, '').trim();
    anotar('Redação: autor do arquivo');
  }

  /* 4. Layout. */
  const temEsquerda = itens.some((it) => it.e.some((p) => textoDoPar(p).trim()));
  const layout: Layout = temEsquerda ? ((cabecalhoColunas as Layout | null) ?? 'ilustracao_audio') : 'coluna_unica';
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
    const runs = par.map((r) => {
      if (r.hl && /:\s*$/.test(r.t)) hlHerdado = r.hl;
      return !r.hl && hlHerdado ? { ...r, hl: hlHerdado } : r;
    });

    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      const base: Trecho = { t: r.t };
      if (r.b) base.b = true;
      if (r.i) base.i = true;

      if (r.u && !r.link && r.t.trim()) {
        // junta sublinhados vizinhos (inclusive com espaços entre eles)
        let texto = r.t;
        let j = i + 1;
        while (j < runs.length) {
          const prox = runs[j];
          if (prox.u && !prox.link) texto += prox.t;
          else if (!prox.t.trim() && runs[j + 1]?.u && runs[j + 1].t.trim()) texto += prox.t;
          else break;
          j++;
        }
        i = j - 1;
        const sozinha = !total.replace(texto, '').replace(/[\s.…!?,;:()-]/g, '');
        const partes = texto.split('/');
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
          out.push({ t: miolo, arte: { subtipo: sugerirSubtipo(miolo, contexto, sozinha, meta.programa), grupo } });
          if (fim) out.push({ t: fim });
        });
        contexto += texto;
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
    if (!analisarSonoras(total).length) out = out.map(({ b: _b, ...resto }) => resto);

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
      else if (primeiro?.hl && /:\s*$/.test(primeiro.t)) rotulo = primeiro.hl;
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
      const locucao = !corte && !analisarSonoras(texto).length && ehCaixaAlta(p.filter((t) => !t.etq && t.legado === undefined).map((t) => t.t).join(''));
      // locução abre uma linha nova; "//" fecha a linha em que está
      if (locucao && atual.length && !ehCaixaAlta(textoI(atual[atual.length - 1]))) fechar();
      atual.push(p);
      if (corte) fechar();
    }
    fechar();
    if (!grupos.length && e.length) grupos.push([]);
    grupos.forEach((g, i) => linhas.push({ e: i === 0 ? e : [], d: g }));
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
    const s = analisarSonoras(textoI(p));
    nSonoras += s.length;
    if (!meta.edicao && s[0]?.origem === 'PGM') {
      const m = s[0].origemOriginal.match(/PGM\s*(\d+)/i);
      if (m) meta.edicao = `PGM ${m[1]}`;
    }
  }
  if (nSonoras) anotar(`Timecodes → ${nSonoras} ${nSonoras === 1 ? 'sonora' : 'sonoras'}`);
  if (todos.some((p) => ehCaixaAlta(textoI(p)))) anotar('CAIXA ALTA → locução');

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
        marks.push({ type: 'arte', attrs: { id: novoId(), subtipo: tr.arte.subtipo, grupo: tr.arte.grupo ?? null, obs: '', sugerido: true } });
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
