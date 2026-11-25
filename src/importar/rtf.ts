import { empurrar, type BlocoBruto, type DocBruto, type Par, type Run } from './bruto';

/* Leitor de RTF. Preserva \ul/\ulnone, \b, \i, \highlight, \cf, decodifica
   \'xx na página de código do arquivo (cp1252 nos roteiros) e \uN.
   As tabelas (\intbl, \cell, \row) viram blocos de tabela, como no .docx: o roteiro em duas colunas.
   Adaptado do extrator do app de upload de roteiros. */

const PULAR = new Set([
  'fonttbl', 'stylesheet', 'listtable', 'listoverridetable', 'revtbl', 'rsidtbl', 'generator', 'pict',
  'object', 'objdata', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl',
  'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf', 'footnote',
  'pntext', 'pntxta', 'pntxtb', 'filetbl', 'bkmkstart', 'bkmkend', 'nonshppict', 'mmathPr',
  'operator', 'title', 'subject', 'company', 'creatim', 'revtim', 'printim', 'buptim', 'keywords', 'doccomm',
]);
const UL_LIGA = /^ul(?:d|db|dash|dashd|dashdd|hair|hwave|ldash|th|thd|thdash|thdashd|thdashdd|thldash|ulwave|w|wave)?$/;
const SIMBOLOS: Record<string, string> = {
  emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”',
  bullet: '•', emspace: ' ', enspace: ' ', qmspace: ' ',
};

const ehLetra = (b: number) => (b >= 0x61 && b <= 0x7a) || (b >= 0x41 && b <= 0x5a);
const ehDigito = (b: number) => b >= 0x30 && b <= 0x39;

function decodificador(cp: number): TextDecoder {
  const rotulos = cp === 65001 ? ['utf-8'] : cp === 10000 ? ['macintosh'] : [`windows-${cp}`, `cp${cp}`, `ibm${cp}`];
  for (const r of rotulos) {
    try {
      return new TextDecoder(r);
    } catch {
      /* tenta o próximo */
    }
  }
  return new TextDecoder('windows-1252');
}

interface Estado {
  ul: boolean; b: boolean; i: boolean; hl: number; cf: number;
  pular: boolean; uc: number; link: boolean; primeira: boolean; estrela: boolean;
  captura: { tipo: 'author' | 'fldinst' | 'colortbl'; texto: string } | null;
  campo: { link: boolean } | null;
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();

export function lerRtf(dados: ArrayBuffer | Uint8Array, arquivo: string): DocBruto {
  const bytes = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
  const len = bytes.length;
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== '{\\rtf') throw new Error('Este arquivo não parece ser um .rtf válido.');

  let dec = new TextDecoder('windows-1252');
  const blocos: BlocoBruto[] = [];
  let par: Par = [];
  // a tabela que está sendo lida: as linhas fechadas, as células da linha aberta e os parágrafos da célula aberta
  let tabela: Par[][][] = [];
  let linha: Par[][] = [];
  let celula: Par[] = [];
  // o parágrafo está numa célula (\intbl): vale até o próximo \pard
  let naTabela = false;
  let autor = '';
  const cores: (string | null)[] = [];
  let corAtual: [number, number, number] | null = null;

  let st: Estado = {
    ul: false, b: false, i: false, hl: 0, cf: 0, pular: false, uc: 1, link: false,
    primeira: false, estrela: false, captura: null, campo: null,
  };
  const pilha: Estado[] = [];
  let pularUc = 0;
  let pendentes: number[] = [];

  const corDe = (n: number): string | undefined => {
    const c = cores[n];
    return c && c !== '000000' ? c : undefined;
  };

  const emitir = (texto: string) => {
    if (st.captura) {
      if (st.captura.tipo === 'colortbl') {
        for (const ch of texto)
          if (ch === ';') {
            cores.push(corAtual ? corAtual.map(hex2).join('') : null);
            corAtual = null;
          }
      } else st.captura.texto += texto;
      return;
    }
    if (st.pular) return;
    const run: Run = { t: texto };
    if (st.ul) run.u = true;
    if (st.b) run.b = true;
    if (st.i) run.i = true;
    const hl = corDe(st.hl);
    if (hl && hl !== 'FFFFFF') run.hl = hl;
    const cf = corDe(st.cf);
    if (cf) run.cor = cf;
    if (st.link) run.link = true;
    empurrar(par, run);
  };
  const descarregar = () => {
    if (!pendentes.length) return;
    const texto = dec.decode(new Uint8Array(pendentes));
    pendentes = [];
    emitir(texto);
  };
  const fecharCelula = () => {
    if (par.length) celula.push(par);
    par = [];
    if (celula.length) linha.push(celula);
    celula = [];
  };
  // a célula sem \cell no fim (arquivo cortado) ainda entra na linha
  const fecharTabela = () => {
    if (celula.length) linha.push(celula);
    celula = [];
    if (linha.length) tabela.push(linha);
    if (tabela.length) blocos.push({ tipo: 'tabela', linhas: tabela });
    tabela = [];
    linha = [];
  };
  const fimParagrafo = () => {
    descarregar();
    if (st.pular || st.captura) return;
    if (naTabela) celula.push(par);
    else {
      fecharTabela();
      blocos.push({ tipo: 'p', par });
    }
    par = [];
  };

  let i = 0;
  while (i < len) {
    const b = bytes[i];
    if (b === 0x7b) {
      descarregar();
      pilha.push(st);
      st = { ...st, primeira: true, estrela: false };
      i++;
      continue;
    }
    if (b === 0x7d) {
      descarregar();
      const fechando = st;
      st = pilha.pop() ?? st;
      if (fechando.captura && fechando.captura !== st.captura) {
        const cap = fechando.captura;
        if (cap.tipo === 'author' && !autor) autor = cap.texto.trim();
        if (cap.tipo === 'fldinst' && fechando.campo) fechando.campo.link = /^\s*HYPERLINK\b/i.test(cap.texto);
      }
      i++;
      continue;
    }
    if (b === 0x0d || b === 0x0a || b === 0x00) {
      i++;
      continue;
    }
    if (b === 0x5c) {
      const n = bytes[i + 1];
      if (n === undefined) break;
      if (n === 0x27) {
        const h = String.fromCharCode(bytes[i + 2], bytes[i + 3]);
        i += 4;
        if (pularUc > 0) {
          pularUc--;
          continue;
        }
        pendentes.push(parseInt(h, 16));
        continue;
      }
      if (!ehLetra(n)) {
        i += 2;
        const ch = String.fromCharCode(n);
        if (ch === '*') {
          st.estrela = true;
          continue;
        }
        if (pularUc > 0) {
          pularUc--;
          continue;
        }
        descarregar();
        if (ch === '\\' || ch === '{' || ch === '}') emitir(ch);
        else if (ch === '~') emitir(' ');
        else if (ch === '_') emitir('-');
        else if (ch === '\n' || ch === '\r') fimParagrafo();
        continue;
      }
      let j = i + 1;
      while (j < len && ehLetra(bytes[j])) j++;
      const palavra = String.fromCharCode(...bytes.subarray(i + 1, j));
      let param: number | null = null;
      let k = j;
      if (bytes[k] === 0x2d || ehDigito(bytes[k])) {
        k++;
        while (k < len && ehDigito(bytes[k])) k++;
        param = parseInt(String.fromCharCode(...bytes.subarray(j, k)), 10);
      }
      if (bytes[k] === 0x20) k++;
      i = k;

      if (palavra === 'bin' && param && param > 0) {
        descarregar();
        i += param;
        continue;
      }
      if (palavra === 'u' && param !== null) {
        descarregar();
        emitir(String.fromCharCode(param < 0 ? param + 65536 : param));
        pularUc = st.uc;
        continue;
      }
      if (pularUc > 0 && palavra !== 'uc') pularUc = 0;

      const primeira = st.primeira;
      st.primeira = false;
      if (primeira) {
        if (palavra === 'fldinst' || palavra === 'author' || palavra === 'colortbl') {
          descarregar();
          st.captura = { tipo: palavra, texto: '' };
          st.estrela = false;
          continue;
        }
        if (palavra === 'info') continue; // entra para achar \author
        if (st.estrela || PULAR.has(palavra)) {
          descarregar();
          st.pular = true;
          continue;
        }
      }
      st.estrela = false;

      if (st.captura?.tipo === 'colortbl') {
        if (palavra === 'red' || palavra === 'green' || palavra === 'blue') {
          corAtual ??= [0, 0, 0];
          corAtual[palavra === 'red' ? 0 : palavra === 'green' ? 1 : 2] = param ?? 0;
        }
        continue;
      }

      switch (palavra) {
        case 'ansicpg':
          if (param) dec = decodificador(param);
          break;
        case 'uc':
          st.uc = param ?? 1;
          break;
        case 'par': case 'sect': case 'nestcell': case 'page':
          fimParagrafo();
          break;
        case 'pard':
          if (!st.pular && !st.captura) naTabela = false;
          break;
        case 'intbl':
          if (!st.pular && !st.captura) naTabela = true;
          break;
        case 'cell':
          descarregar();
          if (st.pular || st.captura) break;
          // a célula vazia também conta: as colunas não andam
          celula.push(par);
          par = [];
          fecharCelula();
          naTabela = true;
          break;
        case 'row':
          descarregar();
          if (st.pular || st.captura) break;
          fecharCelula();
          if (linha.length) tabela.push(linha);
          linha = [];
          break;
        case 'line':
          descarregar();
          emitir('\n');
          break;
        case 'tab':
          descarregar();
          emitir('\t');
          break;
        case 'plain':
          descarregar();
          st.ul = st.b = st.i = false;
          st.hl = st.cf = 0;
          break;
        case 'ulnone':
          descarregar();
          st.ul = false;
          break;
        case 'b':
          descarregar();
          st.b = param !== 0;
          break;
        case 'i':
          descarregar();
          st.i = param !== 0;
          break;
        case 'highlight':
          descarregar();
          st.hl = param ?? 0;
          break;
        case 'cf':
          descarregar();
          st.cf = param ?? 0;
          break;
        case 'field':
          st.campo = { link: false };
          break;
        case 'fldrslt':
          st.link = st.link || !!st.campo?.link;
          break;
        default:
          if (UL_LIGA.test(palavra)) {
            descarregar();
            st.ul = param !== 0;
          } else if (SIMBOLOS[palavra]) {
            descarregar();
            emitir(SIMBOLOS[palavra]);
          }
      }
      continue;
    }
    if (pularUc > 0) {
      pularUc--;
      i++;
      continue;
    }
    if (b < 0x80) {
      descarregar();
      emitir(String.fromCharCode(b));
    } else pendentes.push(b);
    i++;
  }
  descarregar();
  if (par.length) {
    if (naTabela) celula.push(par);
    else {
      fecharTabela();
      blocos.push({ tipo: 'p', par });
    }
  }
  fecharTabela();

  return { arquivo, formato: 'rtf', autor, blocos };
}

export function lerTxt(dados: ArrayBuffer | Uint8Array, arquivo: string): DocBruto {
  const bytes = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  const blocos = texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => ({ tipo: 'p' as const, par: l ? [{ t: l }] : [] }));
  return { arquivo, formato: 'txt', autor: '', blocos };
}
