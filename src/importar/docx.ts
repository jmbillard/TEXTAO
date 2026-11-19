import JSZip from 'jszip';
import { empurrar, type BlocoBruto, type DocBruto, type Par, type Run } from './bruto';

/* Leitura de .docx direto do XML (o mammoth descarta sublinhado, marca-texto e cor).
   Lê w:u, w:b, w:i, w:highlight, w:shd, w:color, w:caps, quebras e tabelas,
   com herança de estilos de caractere e de parágrafo. */

type Fmt = Pick<Run, 'u' | 'b' | 'i' | 'hl' | 'cor'> & { caps?: boolean };

const filhos = (el: Element, nome?: string): Element[] => {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling)
    if (n.nodeType === 1 && (!nome || (n as Element).nodeName === nome)) out.push(n as Element);
  return out;
};
const filho = (el: Element | null | undefined, nome: string) => (el ? filhos(el, nome)[0] : undefined);
const val = (el: Element | undefined) => el?.getAttribute('w:val') ?? null;
const ligado = (el: Element | undefined): boolean | undefined => {
  if (!el) return undefined;
  const v = val(el);
  return !(v === '0' || v === 'false' || v === 'none');
};

function lerFmt(rPr: Element | undefined): Fmt {
  const f: Fmt = {};
  if (!rPr) return f;
  const u = filho(rPr, 'w:u');
  if (u) f.u = val(u) !== 'none' && val(u) !== '0';
  const b = ligado(filho(rPr, 'w:b'));
  if (b !== undefined) f.b = b;
  const i = ligado(filho(rPr, 'w:i'));
  if (i !== undefined) f.i = i;
  const caps = ligado(filho(rPr, 'w:caps'));
  if (caps !== undefined) f.caps = caps;
  const hl = val(filho(rPr, 'w:highlight'));
  if (hl) f.hl = hl === 'none' ? undefined : hl;
  const shd = filho(rPr, 'w:shd')?.getAttribute('w:fill');
  if (!f.hl && shd && !/^(auto|ffffff)$/i.test(shd)) f.hl = shd.toUpperCase();
  const cor = val(filho(rPr, 'w:color'));
  if (cor) f.cor = /^(auto|000000)$/i.test(cor) ? undefined : cor.toUpperCase();
  return f;
}

const juntar = (...fs: (Fmt | undefined)[]): Fmt => Object.assign({}, ...fs.filter(Boolean));

function lerEstilos(xml: Document | null) {
  const mapa = new Map<string, { base: string | null; fmt: Fmt }>();
  if (xml)
    for (const st of Array.from(xml.getElementsByTagName('w:style'))) {
      const id = st.getAttribute('w:styleId');
      if (id) mapa.set(id, { base: val(filho(st, 'w:basedOn')), fmt: lerFmt(filho(st, 'w:rPr')) });
    }
  const resolver = (id: string | null, visto = new Set<string>()): Fmt => {
    if (!id || visto.has(id)) return {};
    visto.add(id);
    const st = mapa.get(id);
    return st ? juntar(resolver(st.base, visto), st.fmt) : {};
  };
  return resolver;
}

const parseXml = (texto: string) => new DOMParser().parseFromString(texto, 'application/xml');

export async function lerDocx(dados: ArrayBuffer | Uint8Array, arquivo: string): Promise<DocBruto> {
  const zip = await JSZip.loadAsync(dados);
  const ler = async (nome: string) => {
    const f = zip.file(nome);
    return f ? parseXml(await f.async('string')) : null;
  };
  const documento = await ler('word/document.xml');
  if (!documento) throw new Error('Este arquivo não parece ser um .docx válido.');
  const estilo = lerEstilos(await ler('word/styles.xml'));
  const core = await ler('docProps/core.xml');
  const autor =
    core?.getElementsByTagName('dc:creator')[0]?.textContent?.trim() ||
    core?.getElementsByTagName('cp:lastModifiedBy')[0]?.textContent?.trim() ||
    '';

  function lerParagrafo(p: Element): Par {
    const par: Par = [];
    const pPr = filho(p, 'w:pPr');
    const fmtPar = juntar(estilo(val(filho(pPr, 'w:pStyle'))));

    const lerRun = (r: Element, link: boolean) => {
      const rPr = filho(r, 'w:rPr');
      const f = juntar(fmtPar, estilo(val(filho(rPr, 'w:rStyle'))), lerFmt(rPr));
      const base: Omit<Run, 't'> = {};
      if (f.u) base.u = true;
      if (f.b) base.b = true;
      if (f.i) base.i = true;
      if (f.hl) base.hl = f.hl;
      if (f.cor) base.cor = f.cor;
      if (link) base.link = true;
      for (const n of filhos(r)) {
        let t = '';
        if (n.nodeName === 'w:t') t = n.textContent ?? '';
        else if (n.nodeName === 'w:tab') t = '\t';
        else if (n.nodeName === 'w:br' || n.nodeName === 'w:cr') t = '\n';
        else if (n.nodeName === 'w:noBreakHyphen') t = '-';
        if (t) empurrar(par, { ...base, t: f.caps ? t.toUpperCase() : t });
      }
    };
    const andar = (el: Element, link: boolean) => {
      for (const n of filhos(el)) {
        if (n.nodeName === 'w:r') lerRun(n, link);
        else if (n.nodeName === 'w:hyperlink') andar(n, true);
        // campo de link (w:fldSimple HYPERLINK) conta como link; o resto só embrulha o texto.
        // w:del e w:moveFrom ficam de fora: é o texto apagado ou o lugar de onde ele saiu.
        else if (n.nodeName === 'w:fldSimple') andar(n, link || /HYPERLINK/i.test(n.getAttribute('w:instr') ?? ''));
        else if (['w:ins', 'w:moveTo', 'w:smartTag', 'w:customXml', 'w:sdt', 'w:sdtContent'].includes(n.nodeName)) andar(n, link);
      }
    };
    andar(p, false);
    return par;
  }

  function lerCelula(tc: Element): Par[] {
    const pars: Par[] = [];
    for (const n of filhos(tc)) {
      if (n.nodeName === 'w:p') pars.push(lerParagrafo(n));
      else if (n.nodeName === 'w:tbl')
        for (const tr of filhos(n, 'w:tr')) for (const c of filhos(tr, 'w:tc')) pars.push(...lerCelula(c));
    }
    return pars;
  }

  const blocos: BlocoBruto[] = [];
  const corpo = documento.getElementsByTagName('w:body')[0];
  const andarCorpo = (el: Element) => {
    for (const n of filhos(el)) {
      if (n.nodeName === 'w:p') blocos.push({ tipo: 'p', par: lerParagrafo(n) });
      else if (n.nodeName === 'w:tbl')
        blocos.push({ tipo: 'tabela', linhas: filhos(n, 'w:tr').map((tr) => filhos(tr, 'w:tc').map(lerCelula)) });
      else if (n.nodeName === 'w:sdt' || n.nodeName === 'w:sdtContent') andarCorpo(n);
    }
  };
  if (corpo) andarCorpo(corpo);

  const paginas = Number((await ler('docProps/app.xml'))?.getElementsByTagName('Pages')[0]?.textContent) || undefined;
  return { arquivo, formato: 'docx', autor, blocos, ...(paginas ? { paginas } : {}) };
}
