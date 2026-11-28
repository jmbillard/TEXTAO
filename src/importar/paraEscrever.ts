/* Começar o Roteiro de um arquivo ou de um texto colado (#195, spec #186): a mesma leitura que a fila já faz (lerArquivo,
   interpretar, montarDoc, no navegador), para o roteiro começar sendo escrito com os tipos e as artes já marcados. O que
   a arte ou a etiqueta cobre inteiro fica confirmado; o resto fica com o palpite (`comOsTiposGuardados`). */
import { empurrar, type BlocoBruto, type DocBruto, type Par, type Run } from './bruto';
import { interpretar, montarDoc, type Importacao } from './interpretar';
import { lerArquivo } from './index';
import { converterLayout } from '../editor/extensoes';
import { metaDeFora } from '../modelo/escrito';
import { artesDoTexto, comOsTiposGuardados } from '../modelo/trecho';
import type { Meta, NoJSON } from '../modelo/tipos';
import type { TextoOriginal } from '../dados/armazenamento';


/** O texto do arquivo como chegou, parágrafo a parágrafo, com o sublinhado do redator (para o PDF do card). */
export const textoDoOriginal = (bruto: DocBruto): TextoOriginal =>
  bruto.blocos
    .flatMap((b) => (b.tipo === 'p' ? [b.par] : b.linhas.flatMap((linha) => linha.flatMap((celula) => celula))))
    .map((par) => par.filter((r) => r.t).map((r) => ({ t: r.t, ...(r.u ? { u: 1 as const } : {}), ...(r.b ? { b: 1 as const } : {}), ...(r.i ? { i: 1 as const } : {}) })));

/** O documento da importação em texto corrido: as cores do Word ficam com o significado que o app deduziu. É o mesmo
    da fila (`lerRoteiro`) e da folha de escrita. */
export const docDaImportacao = (imp: Importacao): NoJSON => converterLayout(montarDoc(imp), 'coluna_unica');

/** O que a folha recebe para começar: o título, os campos de fora da meta, o texto com os tipos e quantas artes. */
export interface ComecoDeFora {
  titulo: string;
  meta: Partial<Meta>;
  doc: NoJSON;
  nArtes: number;
}

/** O título do roteiro aberto de fora: a atração e o título que a leitura achou ("Encontro · Chamada de 27/10"); sem
    a atração, o nome que o redator deu ao arquivo ("Desafio Brasa 14 11"); sem arquivo (o colado), o título lido. */
export function tituloDaImportacao(imp: Importacao): string {
  const programa = imp.meta.programa?.trim();
  if (programa) return [programa, imp.meta.titulo?.trim()].filter(Boolean).join(' · ');
  const doArquivo = imp.bruto.arquivo.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return doArquivo || imp.meta.titulo?.trim() || '';
}

/** O começo da folha a partir do que a fila leu. */
export function comecoDaImportacao(imp: Importacao): ComecoDeFora {
  const doc = comOsTiposGuardados(docDaImportacao(imp));
  return { titulo: tituloDaImportacao(imp), meta: metaDeFora(imp.meta), doc, nArtes: artesDoTexto(doc).length };
}

/** O motivo de o arquivo não ter sido lido, para quem abriu: as mensagens das bibliotecas de leitura vêm em inglês e
    não ajudam. O mesmo da fila. */
export function motivoDaLeitura(e: unknown): string {
  const bruto = e instanceof Error ? e.message : '';
  return !bruto || /zip|central directory|xml|undefined|null|cannot|unexpected|invalid|password/i.test(bruto) ? 'O arquivo parece corrompido, ou não é do tipo que o nome diz.' : bruto;
}

/** Lê o arquivo aberto (.docx, RTF, PDF ou .txt) pela leitura da fila: o começo da folha e o texto do original, que vai
    guardado junto com ele. `aoProgredir`: o andamento do que demora (o OCR do PDF digitalizado). */
export async function comecoDoArquivo(arquivo: File, aoProgredir?: (texto: string) => void): Promise<{ comeco: ComecoDeFora; original: TextoOriginal }> {
  const bruto = await lerArquivo(await arquivo.arrayBuffer(), arquivo.name, aoProgredir);
  return { comeco: comecoDaImportacao(interpretar(bruto)), original: textoDoOriginal(bruto) };
}

/* ---------- o texto colado ---------- */

const BLOCOS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'UL', 'OL', 'DL', 'DT', 'DD']);
const FORA = new Set(['STYLE', 'SCRIPT', 'HEAD', 'META', 'TITLE', 'LINK', 'XML', 'TEMPLATE']);

/** A cor do CSS em hex sem "#", sem o preto e o automático (como os leitores de arquivo guardam). */
function hexDaCor(css: string | undefined): string | undefined {
  if (!css) return undefined;
  const c = css.trim().toLowerCase();
  let hex = '';
  const curto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c);
  const longo = /^#([0-9a-f]{6})$/.exec(c);
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
  if (curto) hex = curto.slice(1).map((x) => x + x).join('');
  else if (longo) hex = longo[1];
  else if (rgb) hex = rgb.slice(1, 4).map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('');
  else return undefined;
  return hex === '000000' ? undefined : hex.toUpperCase();
}

type Estilo = Omit<Run, 't'>;

/** O estilo do elemento sobre o que vem de fora: a tag e o `style` do Word (o `text-decoration: none` desfaz o sublinhado). */
function estiloDe(el: HTMLElement, fora: Estilo): Estilo {
  const e: Estilo = { ...fora };
  const tag = el.tagName;
  if (tag === 'U' || tag === 'INS') e.u = true;
  if (tag === 'B' || tag === 'STRONG') e.b = true;
  if (tag === 'I' || tag === 'EM') e.i = true;
  if (tag === 'A') e.link = true;
  const s = el.style;
  const deco = `${s.textDecoration} ${s.textDecorationLine}`;
  if (/underline/.test(deco)) e.u = true;
  else if (/\bnone\b/.test(deco)) e.u = false;
  if (/^(bold|bolder|[6-9]00)$/.test(s.fontWeight)) e.b = true;
  else if (/^(normal|lighter|[1-5]00)$/.test(s.fontWeight)) e.b = false;
  if (s.fontStyle === 'italic') e.i = true;
  else if (s.fontStyle === 'normal') e.i = false;
  const cor = hexDaCor(s.color);
  if (cor) e.cor = cor;
  // o marca-texto do Word vem como "mso-highlight" ou no fundo do trecho
  const destaque = /mso-highlight\s*:\s*([\w#]+)/i.exec(el.getAttribute('style') ?? '')?.[1] ?? s.backgroundColor;
  const hl = destaque && !/^(transparent|white|#fff(fff)?|none|initial|inherit)$/i.test(destaque) ? (hexDaCor(destaque) ?? (/^[a-z]+$/i.test(destaque) ? destaque.toLowerCase() : undefined)) : undefined;
  if (hl) e.hl = hl;
  return e;
}

/** Lê o HTML colado (do Word, do navegador) no mesmo modelo intermediário dos arquivos: os parágrafos com o sublinhado,
    o negrito, o itálico, as cores e o marca-texto; a quebra de linha como "\n"; as tabelas como tabelas. */
export function brutoDoHtml(html: string, arquivo = ''): DocBruto {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocos: BlocoBruto[] = [];
  const pre = (el: Element | null) => !!el?.closest('pre');

  /** Lê um pedaço em parágrafos; as tabelas de dentro saem para `tabela` (só no nível de cima). */
  function lerPars(raiz: Node, tabela?: (b: BlocoBruto, antes: Par[]) => void): Par[] {
    const pars: Par[] = [];
    let atual: Par = [];
    const fechar = () => {
      if (atual.some((r) => r.t.trim())) pars.push(atual);
      atual = [];
    };
    const andar = (no: Node, estilo: Estilo) => {
      if (no.nodeType === Node.TEXT_NODE) {
        const bruto = (no as Text).data.replace(/ /g, ' ');
        const t = pre(no.parentElement) ? bruto : bruto.replace(/\s+/g, ' ');
        if (t && (t.trim() || atual.length)) empurrar(atual, { t, ...estilo });
        return;
      }
      if (no.nodeType !== Node.ELEMENT_NODE) return;
      const el = no as HTMLElement;
      // o que não é texto, e os desenhos do Word (VML: "v:shape")
      if (FORA.has(el.tagName) || /^V:/i.test(el.tagName)) return;
      if (el.tagName === 'BR') return void empurrar(atual, { t: '\n', ...estilo });
      if (el.tagName === 'TABLE' && tabela) {
        fechar();
        tabela({ tipo: 'tabela', linhas: [...el.querySelectorAll('tr')].filter((tr) => tr.closest('table') === el).map((tr) => [...tr.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH').map((td) => lerPars(td))) }, pars.splice(0));
        return;
      }
      const e = estiloDe(el, estilo);
      const bloco = BLOCOS.has(el.tagName) || el.tagName === 'TR' || el.tagName === 'TD' || el.tagName === 'TH';
      if (bloco) fechar();
      const antes = pars.length;
      el.childNodes.forEach((c) => andar(c, e));
      if (bloco) {
        const vazio = !atual.some((r) => r.t.trim());
        fechar();
        // o parágrafo em branco do Word (<p>&nbsp;</p>) é uma linha em branco, como no arquivo
        if (vazio && pars.length === antes && el.tagName === 'P') pars.push([]);
      }
    };
    raiz.childNodes.forEach((c) => andar(c, {}));
    fechar();
    // a linha que termina no "\n" da quebra não deixa um parágrafo vazio sobrando
    return pars.map((p) => {
      const u = p[p.length - 1];
      if (u && /\n\s*$/.test(u.t)) u.t = u.t.replace(/\n\s*$/, '');
      return p.filter((r) => r.t);
    });
  }
  const resto = lerPars(doc.body, (tabela, antes) => {
    blocos.push(...antes.map((par) => ({ tipo: 'p' as const, par })));
    blocos.push(tabela);
  });
  blocos.push(...resto.map((par) => ({ tipo: 'p' as const, par })));
  return { arquivo, formato: 'txt', autor: '', blocos };
}

/** O texto puro colado: uma linha por parágrafo, como o .txt. */
export const brutoDoTexto = (texto: string, arquivo = ''): DocBruto => ({
  arquivo,
  formato: 'txt',
  autor: '',
  blocos: texto.replace(/^﻿/, '').split(/\r?\n/).map((l) => ({ tipo: 'p' as const, par: l ? [{ t: l }] : [] })),
});

/** O que foi colado tem texto de verdade (não é só espaço nem uma imagem solta). */
export const temTextoColado = (html: string, texto: string) => !!texto.trim() || (!!html && !!new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim());

/** O começo da folha a partir do que foi colado: o HTML do Word, quando há; senão, o texto puro. */
export function comecoDoColado(html: string, texto: string): ComecoDeFora {
  const bruto = html && /<\w/.test(html) ? brutoDoHtml(html) : brutoDoTexto(texto);
  // sem arquivo, o título é só o que a leitura achou (a atração, a data), nunca um nome de arquivo
  return comecoDaImportacao(interpretar(bruto));
}
