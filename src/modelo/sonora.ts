/* eslint-disable prefer-const */
/* Reconhecimento de sonoras e de locução pelo texto, sem transformar o que foi digitado.
   Formatos reais cobertos:
     MC/BL02/10.53 – Pedro no tribunal: fala
     FRAME.IO/BL01/06.06 – descrição + Gabriel: fala
     05:02 – Fortunato: fala                         (origem herdada de "FRAME IO ONLINE BLOCO 01")
     (PGM 23 - Bloco 1) 00.00.14 Eliana: fala
     00:01:36:16 MARIA LUZ: fala                     (timecode com quadros, sem traço)
     BL1 VS DIA DO GAUCHO CUT09 00:03:30//00:03:38 – descrição: fala   (entrada//saída)
     EP.1 - 00.03.19 – Lina p/ Teo: fala
     Débora: fala                                    (sem timecode)
     00:03:40:01  ↵  MARIA LUZ: fala                 (timecode sozinho na linha de cima) */

export type Origem = 'MC' | 'FRAME_IO' | 'PGM' | 'outro';

export interface Sonora {
  /** Posição do início da sonora no texto analisado. */
  ini: number;
  /** Tamanho do prefixo (origem + timecode + separador). */
  prefixo: number;
  /** Faixa de "Personagem descrição:" no texto analisado (fim exclusivo, inclui os dois-pontos). */
  quemIni: number;
  quemFim: number;
  origem: Origem;
  origemOriginal: string;
  bloco: number | null;
  /** Vazio quando o roteiro não informa. */
  timecodeEntrada: string;
  timecodeSaida: string | null;
  timecodeOriginal: string;
  personagem: string;
  descricaoImagem: string;
  fala: string;
}

export interface ContextoSonora {
  origem: Origem;
  origemOriginal: string;
  bloco: number | null;
  /** Timecode que veio sozinho na linha anterior e vale para a próxima fala. */
  tcPendente?: string;
}

const TC = String.raw`\d{1,2}[.:]\d{2}(?:[.:]\d{2})?`;
/** Timecode "cheio": pares de dois dígitos, com ou sem quadros (00:01:36:16). */
const TC2 = String.raw`\d{2}[.:]\d{2}(?:[.:]\d{2}){0,2}`;
const TC3 = String.raw`\d{2}[.:]\d{2}[.:]\d{2}(?:[.:]\d{2})?`;
const FONTE = String.raw`(?:MC|M[IÍ]DIA\s+CENTRAL|FRAME\.?\s?IO)`;
/** MC/BL02/10.53 – …   MC/CAP.83/BL01/09.20 Adriana…   RETRÔ/FRAME.IO/CAP 16/BL02/02.31 – … */
const RE_A = new RegExp(String.raw`(?:RETR[ÔO]\s*\/\s*)?(${FONTE}|EP\.?\s*\d+)\s*\/\s*(?:CAP\.?\s*\d+\s*\/\s*)?B(?:L(?:OCO)?)?\s*(\d+)\s*\/\s*(${TC})\s*(?:[–—-]\s*|\s+(?=\p{Lu}))`, 'iuy');
const RE_B = new RegExp(String.raw`\(([^()]{2,90})\)\s*(${TC})\s+`, 'y');
const RE_C = new RegExp(String.raw`(${TC})\s*[–—-]\s+`, 'y');
/** 00:01:36:16 MARIA LUZ: … */
const RE_D = new RegExp(String.raw`(${TC3})\s+(?=\p{L})`, 'uy');
/** Origem livre + timecode (+ //saída) + traço:  "BL1 … CUT09 00:03:30//00:03:38 – "  ou  "EP.1 - 00.03.19 – " */
const RE_E = new RegExp(String.raw`([^:\n]{2,80}?)\s*(?:[-–—]\s*)?(?:IN\s+)?(${TC2})(?:\s*\/\/\s*(${TC2}))?\s*(?:[–—-]\s+|\s+(?=\p{Lu}))`, 'uy');
/** VT 3/4 03:07 Pesquisador: …   VT3e4 Homem on: … */
const RE_VT = new RegExp(String.raw`(VT\s*\d(?:\s*[\/e]\s*\d)?)\s+(?:(${TC})\s+)?(?=\p{Lu})`, 'iuy');
/** Nome próprio (com minúsculas) seguido de dois-pontos e fala. */
const RE_NOME = /((?:\p{Lu}\p{Ll}[\p{L}'’.]*)(?:\s+(?:(?:p\/|e|de|da|do|dos|das)\s*)?\p{Lu}[\p{L}'’.]*){0,3})\s*:\s+(?=\S)/uy;
/** NOME (qualquer caixa) seguido de dois-pontos: só vale quando há um timecode pendente da linha de cima. */
const RE_NOME_LIVRE = /(\p{Lu}[\p{L}'’.]*(?:\s+(?:p\/\s*)?[\p{L}'’.]+){0,5})\s*:\s*(?=\S)/uy;
const NAO_E_NOME = /^(abre|fecha|encerra|assina|ilustr\w*|cobr\w*|aten[cç][aã]o|refer[eê]ncia|caminho|obs|loc|locu[cç][aã]o|lettering|arte|cartela|selo|vers[oõ]es|redator[a]?|produ[cç][aã]o|arquivos?|chamada|tempo)$/i;
const RE_INICIOS = new RegExp(
  String.raw`(?:RETR[ÔO]\s*\/\s*)?(?:${FONTE}|EP\.?\s*\d+)\s*\/\s*(?:CAP\.?\s*\d+\s*\/\s*)?B(?:L(?:OCO)?)?\s*\d+\s*\/\s*${TC}|\([^()]{2,90}\)\s*${TC}\s|\/edit\/\s*(?=${TC}\s*[–—-]\s)`,
  'gi',
);
const RE_CONTEXTO = new RegExp(String.raw`^\s*(${FONTE})\b.*\bBLOCO\s*(\d+)\s*$`, 'i');
const RE_TC_SOLTO = new RegExp(String.raw`^\s*(${TC3})\s*$`);
/** Linha de locução marcada à mão: "LOC: No dia do gaúcho…" */
export const RE_LINHA_LOC = /^\s*(?:LOC|OFF)(?:\s+\p{L}+)?\s*:\s*/iu;

/** "10.53" → "00:10:53";  "00:01:36:16" → "00:01:36" (os quadros ficam só no original). */
export function normalizarTimecode(tc: string): string {
  const p = tc.split(/[.:]/).map((x) => x.padStart(2, '0'));
  return (p.length === 2 ? ['00', ...p] : p.slice(0, 3)).join(':');
}

const origemDe = (s: string): Origem =>
  /^MC|M[IÍ]DIA/i.test(s) ? 'MC' : /FRAME/i.test(s) ? 'FRAME_IO' : /PGM|PROGRAMA/i.test(s) ? 'PGM' : 'outro';

/** "FRAME IO ONLINE BLOCO 01" → contexto das sonoras seguintes. */
export function lerContexto(texto: string): ContextoSonora | null {
  const m = RE_CONTEXTO.exec(texto);
  return m ? { origem: origemDe(m[1]), origemOriginal: texto.trim(), bloco: parseInt(m[2], 10) } : null;
}

/** Uma linha que é só um timecode: vale para a fala da linha seguinte. */
export function lerTimecodeSolto(texto: string): string | null {
  return RE_TC_SOLTO.exec(texto)?.[1] ?? null;
}

/** Separa "Pedro no tribunal" em personagem ("Pedro") e descrição ("no tribunal"). */
function separarQuem(s: string): { personagem: string; descricao: string } {
  const palavras = s.trim().split(/\s+/);
  const nome: string[] = [];
  for (const p of palavras) {
    if (/^\p{Lu}/u.test(p) && !/^p\//i.test(p)) nome.push(p);
    else break;
  }
  if (!nome.length) return { personagem: '', descricao: s.trim() };
  return { personagem: nome.join(' '), descricao: palavras.slice(nome.length).join(' ') };
}

export function analisarSonoras(texto: string, ctx?: ContextoSonora | null): Sonora[] {
  const inicios = new Set<number>([0]);
  RE_INICIOS.lastIndex = 0;
  for (let m; (m = RE_INICIOS.exec(texto)); ) {
    inicios.add(m[0].toLowerCase().startsWith('/edit/') ? m.index + m[0].length : m.index);
    if (m[0].length === 0) RE_INICIOS.lastIndex++;
  }
  const pontos = [...inicios].sort((a, b) => a - b);
  const out: Sonora[] = [];
  let anterior: ContextoSonora | null = ctx ?? null;

  pontos.forEach((ini0, idx) => {
    const fim = pontos[idx + 1] ?? texto.length;
    let ini = ini0;
    while (ini < fim && /\s/.test(texto[ini])) ini++;
    type Base = Pick<Sonora, 'origem' | 'origemOriginal' | 'bloco' | 'timecodeOriginal' | 'timecodeSaida'>;
    let base: Base | null = null;
    let prefixo = 0;
    let m: RegExpExecArray | null;
    const herdado = () => ({ origem: anterior?.origem ?? ('outro' as Origem), origemOriginal: anterior?.origemOriginal ?? '', bloco: anterior?.bloco ?? null });
    const tentar = (re: RegExp) => {
      re.lastIndex = ini;
      const achado = re.exec(texto);
      // o prefixo tem de caber no trecho: o que vem depois de um "/edit/" é outra sonora
      return achado && achado.index + achado[0].length <= fim ? achado : null;
    };

    if ((m = tentar(RE_A))) {
      base = { origem: origemDe(m[1]), origemOriginal: m[0].replace(/\s*[–—-]\s*$/, ''), bloco: parseInt(m[2], 10), timecodeOriginal: m[3], timecodeSaida: null };
      prefixo = m[0].length;
    } else if ((m = tentar(RE_B))) {
      const bl = /BLOCO\s*(\d+)/i.exec(m[1]);
      base = { origem: origemDe(m[1]), origemOriginal: m[1].trim(), bloco: bl ? parseInt(bl[1], 10) : null, timecodeOriginal: m[2], timecodeSaida: null };
      prefixo = m[0].length;
    } else if ((m = tentar(RE_C))) {
      base = { ...herdado(), timecodeOriginal: m[1], timecodeSaida: null };
      prefixo = m[0].length;
    } else if ((m = tentar(RE_D))) {
      base = { ...herdado(), timecodeOriginal: m[1], timecodeSaida: null };
      prefixo = m[0].length;
    } else if (idx === 0 && (m = tentar(RE_VT))) {
      base = { origem: 'outro', origemOriginal: m[1].trim(), bloco: null, timecodeOriginal: m[2] ?? '', timecodeSaida: null };
      prefixo = m[0].length;
    } else if (
      idx === 0 &&
      (m = tentar(RE_E)) &&
      !/\/\/\s*$/.test(m[1]) &&
      // sem traço depois do timecode, só vale se ele for inequívoco: entrada//saída ou hh:mm:ss
      (/[–—-]\s+$/.test(m[0]) || !!m[3] || m[2].split(/[.:]/).length >= 3)
    ) {
      const bl = /\bBL(?:OCO)?\s*(\d+)/i.exec(m[1]);
      base = { origem: origemDe(m[1]), origemOriginal: m[1].trim(), bloco: bl ? parseInt(bl[1], 10) : null, timecodeOriginal: m[2], timecodeSaida: m[3] ? normalizarTimecode(m[3]) : null };
      prefixo = m[0].length;
    } else if (idx === 0 && ctx?.tcPendente && tentar(RE_NOME_LIVRE)) {
      base = { ...herdado(), timecodeOriginal: ctx.tcPendente, timecodeSaida: null };
    } else if (idx === 0 && (m = tentar(RE_NOME)) && !NAO_E_NOME.test(m[1].split(/\s+/)[0])) {
      // fala sem timecode: "Débora: Vamos botar a sessentona pra jogo?"
      base = { ...herdado(), timecodeOriginal: '', timecodeSaida: null };
    }
    if (!base) return;

    let resto = texto.slice(ini + prefixo, fim).replace(/\s*\/edit\/\s*$/i, '');
    // "fala. + cara de Pilar": depois do fim da frase, um "+" com minúscula é imagem, não fala
    let imagemDepois = '';
    const depois = /([.!?…])\s+\+\s+(\p{Ll}[^:]*?)\s*$/u.exec(resto);
    if (depois && resto.indexOf(':') !== -1 && depois.index > resto.indexOf(':')) {
      imagemDepois = depois[2];
      resto = resto.slice(0, depois.index + 1);
    }
    // "… OUT 00:05:34": o ponto de saída vem depois da fala
    const saida = /\s+OUT\s+(\d{2}[.:]\d{2}(?:[.:]\d{2}){0,2})\b/.exec(resto);
    if (saida && !base.timecodeSaida) {
      base.timecodeSaida = normalizarTimecode(saida[1]);
      resto = resto.slice(0, saida.index) + ' '.repeat(saida[0].length) + resto.slice(saida.index + saida[0].length);
    }
    const dois = resto.indexOf(':');
    let personagem = '';
    let descricao = '';
    let fala = '';
    let quemFim = ini + prefixo;
    if (dois === -1) descricao = resto.trim();
    else {
      // "descrição + Personagem: fala" — o personagem é o que vem depois do último "+"
      const antes = resto.slice(0, dois);
      const mais = antes.lastIndexOf(' + ');
      const q = separarQuem(mais === -1 ? antes : antes.slice(mais + 3));
      personagem = q.personagem;
      descricao = [mais === -1 ? '' : antes.slice(0, mais).trim().replace(/\.$/, ''), q.descricao, imagemDepois].filter(Boolean).join(' · ');
      fala = resto.slice(dois + 1).trim();
      quemFim = ini + prefixo + dois + 1;
    }
    out.push({
      ini,
      prefixo,
      quemIni: ini + prefixo,
      quemFim,
      ...base,
      timecodeEntrada: base.timecodeOriginal ? normalizarTimecode(base.timecodeOriginal) : '',
      personagem,
      descricaoImagem: descricao,
      fala,
    });
    // a próxima (depois de um /edit/, por exemplo) herda a fonte e o bloco, nunca o timecode desta
    const semTc = base.timecodeOriginal ? base.origemOriginal.replace(new RegExp(String.raw`\s*\/\s*${TC}\s*$`), '') : base.origemOriginal;
    anterior = { origem: base.origem, origemOriginal: semTc, bloco: base.bloco };
  });
  return out;
}

export const ehCaixaAlta = (texto: string): boolean => {
  const letras = texto.match(/\p{L}/gu);
  return !!letras && letras.length >= 2 && texto === texto.toUpperCase();
};

/** Texto que o locutor lê: tudo em CAIXA ALTA, ou uma linha marcada com "LOC:". */
export const ehLocucao = (texto: string): boolean => RE_LINHA_LOC.test(texto) || ehCaixaAlta(texto);
/** O texto da locução, sem o "LOC:" da frente. */
export const textoDaLocucao = (texto: string): string => texto.replace(RE_LINHA_LOC, '');
