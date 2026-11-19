import { AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, UnderlineType, WidthType } from 'docx';
import type { Saida } from '../modelo/exportar';
import { nomeEtiqueta, NOMES_COLUNAS, type NoJSON } from '../modelo/tipos';

/* O Word como formato de saída: o mesmo roteiro, limpo e padronizado,
   com a lista de artes em anexo. Arte continua sendo o que está sublinhado. */

const FONTE = 'Arial';
const CINZA = '6B6860';
const CORES: Record<string, string> = { edicao: '2F6B47', locutor: '8A4B14', sonoplastia: '8A3A62', producao: '7A5A12', comentario: '6B6860', cortavel: '8A8578' };

const borda = { style: BorderStyle.SINGLE, size: 4, color: 'CFCABF' };
const bordas = { top: borda, bottom: borda, left: borda, right: borda };
const semBorda = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const semBordas = { top: semBorda, bottom: semBorda, left: semBorda, right: semBorda };

const rotulo = (t: string) => new TextRun({ text: t.toUpperCase(), font: FONTE, size: 15, color: CINZA, bold: true, characterSpacing: 20 });
const texto = (t: string, extra: object = {}) => new TextRun({ text: t, font: FONTE, size: 22, ...extra });

function paragrafo(p: NoJSON): Paragraph {
  const filhos: TextRun[] = [];
  let etqAnterior: unknown = null;
  for (const n of p.content ?? []) {
    if (n.type === 'hardBreak') {
      filhos.push(new TextRun({ break: 1 }));
      continue;
    }
    if (n.type !== 'text' || !n.text) continue;
    const arte = n.marks?.find((m) => m.type === 'arte');
    const etq = n.marks?.find((m) => m.type === 'etiqueta')?.attrs;
    const negrito = !!n.marks?.some((m) => m.type === 'bold');
    if (etq && etq.id !== etqAnterior)
      filhos.push(new TextRun({ text: `[${nomeEtiqueta(String(etq.tipo))}] `, font: FONTE, size: 16, bold: true, color: CORES[String(etq.tipo)] ?? CINZA }));
    etqAnterior = etq?.id ?? null;
    filhos.push(
      texto(n.text, {
        bold: negrito,
        underline: arte ? { type: UnderlineType.SINGLE } : undefined,
        italics: !!etq && etq.tipo !== 'cortavel',
        strike: etq?.tipo === 'cortavel',
        color: etq ? (CORES[String(etq.tipo)] ?? CINZA) : undefined,
      }),
    );
  }
  return new Paragraph({ children: filhos, spacing: { after: 140, line: 320 } });
}

const celula = (filhos: (Paragraph | Table)[], largura: number, fundo?: string) =>
  new TableCell({
    children: filhos,
    width: { size: largura, type: WidthType.PERCENTAGE },
    borders: bordas,
    margins: { top: 100, bottom: 60, left: 140, right: 140 },
    shading: fundo ? { type: ShadingType.CLEAR, fill: fundo, color: 'auto' } : undefined,
  });

export async function gerarDocx(saida: Saida): Promise<Blob> {
  const r = saida.roteiro;
  const data = r.dataExibicao ? r.dataExibicao.split('-').reverse().join('/') : '';
  const duracao = r.duracaoAlvoSeg ? `${r.duracaoModo === 'max' ? 'no máximo ' : 'fechar com '}${r.duracaoAlvoSeg}''` : '';
  const campos: [string, string][] = [
    ['Exibição', [data, r.praca].filter(Boolean).join(' · ')],
    ['Capítulo', r.capitulo ? String(r.capitulo) : r.edicao],
    ['Locução', r.locutor],
    ['Duração', duracao],
    ['Selo', r.selo],
    ['Versões', r.versoes.join(' / ')],
    ['Redação', r.redator],
  ];
  const preenchidos = campos.filter(([, v]) => v);

  const cabecalho = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: preenchidos.map(
          ([k, v]) =>
            new TableCell({
              borders: semBordas,
              margins: { top: 40, bottom: 40, right: 120 },
              children: [new Paragraph({ children: [rotulo(k)], spacing: { after: 30 } }), new Paragraph({ children: [texto(v, { size: 20, bold: true })] })],
            }),
        ),
      }),
    ],
  });

  const blocos = saida.blocos.content ?? [];
  const nomes = NOMES_COLUNAS[r.layout];
  const corpo: (Paragraph | Table)[] = nomes
    ? [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: nomes.map((n, i) => celula([new Paragraph({ children: [rotulo(n)] })], i ? 66 : 34, 'F4F2EC')) }),
            ...blocos
              .filter((n) => n.type === 'linha')
              .map((l) => new TableRow({ children: (l.content ?? []).map((c, i) => celula((c.content ?? []).map(paragrafo), i ? 66 : 34)) })),
          ],
        }),
      ]
    : blocos.filter((n) => n.type === 'paragraph').map(paragrafo);

  const linhaArtes = (cols: string[], cab = false) =>
    new TableRow({
      tableHeader: cab,
      children: cols.map((c, i) => celula([new Paragraph({ children: [cab ? rotulo(c) : texto(c, { size: 20, bold: i === 2 })] })], [8, 24, 40, 28][i], cab ? 'F4F2EC' : undefined)),
    });

  const doc = new Document({
    creator: r.redator || 'PROMeiro',
    title: [r.programa, r.titulo].filter(Boolean).join(' · '),
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        children: [
          new Paragraph({ children: [rotulo([r.programa, data].filter(Boolean).join(' · '))], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: r.titulo || 'Roteiro', font: FONTE, size: 40, bold: true })], spacing: { after: 240 } }),
          cabecalho,
          new Paragraph({ spacing: { after: 320 } }),
          ...corpo,
          new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: 'Lista de artes', font: FONTE, size: 30, bold: true })], spacing: { after: 80 } }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [texto(`${saida.artes.length} ${saida.artes.length === 1 ? 'arte' : 'artes'} · ${[r.programa, r.titulo].filter(Boolean).join(' · ')}`, { size: 18, color: CINZA })],
            spacing: { after: 200 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [linhaArtes(['Nº', 'Tipo', 'Texto', 'Observação'], true), ...saida.artes.map((a) => linhaArtes([String(a.ordem), a.subtipoNome, a.texto, a.observacao]))],
          }),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}
