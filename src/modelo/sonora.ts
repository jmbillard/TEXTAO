/* Reconhecimento de sonoras pelo texto, sem transformar o que foi digitado.
   Formatos reais cobertos:
     MC/BL02/10.53 – Pedro no tribunal: fala
     FRAME.IO/BL01/06.06 – descrição + Gabriel: fala
     05:02 – Fortunato: fala            (origem herdada de "FRAME IO ONLINE BLOCO 01")
     (PGM 23 - Bloco 1) 00.00.14 Eliana: fala */

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
  timecodeEntrada: string;
  timecodeOriginal: string;
  personagem: string;
  descricaoImagem: string;
  fala: string;
}

export interface ContextoSonora {
  origem: Origem;
  origemOriginal: string;
  bloco: number | null;
}

const TC = String.raw`\d{1,2}[.:]\d{2}(?:[.:]\d{2})?`;
const FONTE = String.raw`(?:MC|M[IÍ]DIA\s+CENTRAL|FRAME\.?\s?IO)`;
const RE_A = new RegExp(String.raw`(${FONTE})\s*\/\s*BL(?:OCO)?\s*(\d+)\s*\/\s*(${TC})\s*[–—-]\s*`, 'iy');
const RE_B = new RegExp(String.raw`\(([^()]{2,90})\)\s*(${TC})\s+`, 'y');
const RE_C = new RegExp(String.raw`(${TC})\s*[–—-]\s+`, 'y');
const RE_INICIOS = new RegExp(
  String.raw`${FONTE}\s*\/\s*BL(?:OCO)?\s*\d+\s*\/\s*${TC}|\([^()]{2,90}\)\s*${TC}\s|\/edit\/\s*(?=${TC}\s*[–—-]\s)`,
  'gi',
);
const RE_CONTEXTO = new RegExp(String.raw`^\s*(${FONTE})\b.*\bBLOCO\s*(\d+)\s*$`, 'i');

export function normalizarTimecode(tc: string): string {
  const p = tc.split(/[.:]/).map((x) => x.padStart(2, '0'));
  return (p.length === 2 ? ['00', ...p] : p).join(':');
}

const origemDe = (s: string): Origem =>
  /^MC|M[IÍ]DIA/i.test(s) ? 'MC' : /FRAME/i.test(s) ? 'FRAME_IO' : /PGM|PROGRAMA/i.test(s) ? 'PGM' : 'outro';

/** "FRAME IO ONLINE BLOCO 01" → contexto das sonoras seguintes. */
export function lerContexto(texto: string): ContextoSonora | null {
  const m = RE_CONTEXTO.exec(texto);
  return m ? { origem: origemDe(m[1]), origemOriginal: texto.trim(), bloco: parseInt(m[2], 10) } : null;
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
    let base: Pick<Sonora, 'origem' | 'origemOriginal' | 'bloco' | 'timecodeOriginal'> | null = null;
    let prefixo = 0;
    let m: RegExpExecArray | null;

    RE_A.lastIndex = ini;
    RE_B.lastIndex = ini;
    RE_C.lastIndex = ini;
    if ((m = RE_A.exec(texto))) {
      base = { origem: origemDe(m[1]), origemOriginal: m[0].replace(/\s*[–—-]\s*$/, ''), bloco: parseInt(m[2], 10), timecodeOriginal: m[3] };
      prefixo = m[0].length;
    } else if ((m = RE_B.exec(texto))) {
      const bl = /BLOCO\s*(\d+)/i.exec(m[1]);
      base = { origem: origemDe(m[1]), origemOriginal: m[1].trim(), bloco: bl ? parseInt(bl[1], 10) : null, timecodeOriginal: m[2] };
      prefixo = m[0].length;
    } else if ((m = RE_C.exec(texto))) {
      base = {
        origem: anterior?.origem ?? 'outro',
        origemOriginal: anterior?.origemOriginal ?? '',
        bloco: anterior?.bloco ?? null,
        timecodeOriginal: m[1],
      };
      prefixo = m[0].length;
    }
    if (!base) return;

    const resto = texto.slice(ini + prefixo, fim).replace(/\s*\/edit\/\s*$/i, '');
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
      descricao = [mais === -1 ? '' : antes.slice(0, mais).trim().replace(/\.$/, ''), q.descricao].filter(Boolean).join(' · ');
      fala = resto.slice(dois + 1).trim();
      quemFim = ini + prefixo + dois + 1;
    }
    out.push({
      ini,
      prefixo,
      quemIni: ini + prefixo,
      quemFim,
      ...base,
      timecodeEntrada: normalizarTimecode(base.timecodeOriginal),
      personagem,
      descricaoImagem: descricao,
      fala,
    });
    anterior = { origem: base.origem, origemOriginal: base.origemOriginal, bloco: base.bloco };
  });
  return out;
}

export const ehCaixaAlta = (texto: string): boolean => {
  const letras = texto.match(/\p{L}/gu);
  return !!letras && letras.length >= 2 && texto === texto.toUpperCase();
};
