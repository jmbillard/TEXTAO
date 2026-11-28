import { AlignmentType, BorderStyle, CommentRangeEnd, CommentRangeStart, CommentReference, Document, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, UnderlineType, WidthType } from 'docx';
import JSZip from 'jszip';
import type { Saida } from '../modelo/exportar';
import { nomeEtiqueta, NOMES_COLUNAS, type NoJSON } from '../modelo/tipos';
import { gruposDasColunas, tipoDoTrecho, type TipoDoTrecho } from '../modelo/trecho';

/* O Word como formato de saída: o mesmo roteiro, limpo e padronizado,
   com a lista de artes em anexo. Arte continua sendo o que está sublinhado.
   Dentro do arquivo vão também os dados, para qualquer ferramenta ler sem interpretar o texto:
   - autores nas propriedades do documento;
   - a observação de cada arte como comentário do Word, preso ao trecho;
   - um XML próprio (customXml, urn:promeiro:roteiro:1) com o roteiro e a lista de artes,
     que o Word guarda intacto quando alguém edita e salva.

   O modo limpo do Roteiro escrito no PROMeiro (#193) sai pelo mesmo gerador, com a cara dos .docx de hoje e igual ao
   que a folha mostra: Arial 11, o título em caixa alta e negrito; a locução em caixa alta (aqui no texto do arquivo,
   não só na aparência); a arte sublinhada em negrito; a sonora em negrito; a locação sublinhada. Em texto corrido ou,
   nas colunas, numa tabela de bordas pretas (a regra dos grupos, `gruposDasColunas`). Sem o cabeçalho da revisão e
   sem a lista de artes anexa; os dados (os autores, os comentários das artes e o XML) continuam indo. */

/** Como o .docx sai: o da revisão (o padrão) ou o do modo limpo da folha de escrita, em texto ou em colunas. */
export interface ComoSai {
  limpo?: 'texto' | 'colunas';
}

const FONTE = 'Arial';
const CINZA = '6B6860';
const CORES: Record<string, string> = { edicao: '2F6B47', locutor: '8A4B14', sonoplastia: '8A3A62', producao: '7A5A12', comentario: '6B6860', cortavel: '8A8578' };

const borda = { style: BorderStyle.SINGLE, size: 4, color: 'CFCABF' };
const bordas = { top: borda, bottom: borda, left: borda, right: borda };
const semBorda = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const semBordas = { top: semBorda, bottom: semBorda, left: semBorda, right: semBorda };

const rotulo = (t: string) => new TextRun({ text: t.toUpperCase(), font: FONTE, size: 15, color: CINZA, bold: true, characterSpacing: 20 });
const texto = (t: string, extra: object = {}) => new TextRun({ text: t, font: FONTE, size: 22, ...extra });

/** Arte com observação vira comentário do Word: o id da marca da arte → o número do comentário.
    `usados`: cada comentário é preso a um trecho só (a primeira vez que a arte aparece), senão o Word
    acusa o arquivo de corrompido quando a mesma arte atravessa dois parágrafos. */
interface Comentarios {
  ids: Map<string, number>;
  usados: Set<string>;
}

/** A cara de cada tipo do trecho no modo limpo (a mesma do CSS da folha, `.folha-escrita.limpo`); o resto sai como foi
    escrito. */
const NO_LIMPO: Partial<Record<TipoDoTrecho, { caixaAlta?: boolean; negrito?: boolean; sublinhado?: boolean; italico?: boolean }>> = {
  locucao: { caixaAlta: true },
  sonora: { negrito: true },
  locacao: { sublinhado: true },
  comentario: { italico: true },
};
const caixaAlta = (s: string) => s.toLocaleUpperCase('pt-BR');

function paragrafo(p: NoJSON, comentarios: Comentarios = { ids: new Map(), usados: new Set() }, limpo = false): Paragraph {
  const cara = limpo ? (NO_LIMPO[tipoDoTrecho(p).tipo] ?? {}) : {};
  const filhos: (TextRun | CommentRangeStart | CommentRangeEnd)[] = [];
  let etqAnterior: unknown = null;
  const nos = (p.content ?? []).filter((n) => n.type === 'hardBreak' || (n.type === 'text' && n.text));
  const idArte = (n?: NoJSON) => String(n?.marks?.find((m) => m.type === 'arte')?.attrs?.id ?? '');
  const abertos = new Set<string>();
  for (const [k, n] of nos.entries()) {
    const id = idArte(n);
    const comentario = comentarios.ids.get(id);
    if (comentario !== undefined && idArte(nos[k - 1]) !== id && !comentarios.usados.has(id)) {
      filhos.push(new CommentRangeStart(comentario));
      comentarios.usados.add(id);
      abertos.add(id);
    }
    if (n.type === 'hardBreak') {
      filhos.push(new TextRun({ break: 1 }));
      continue;
    }
    if (n.type !== 'text' || !n.text) continue;
    const arte = n.marks?.find((m) => m.type === 'arte');
    const etq = n.marks?.find((m) => m.type === 'etiqueta')?.attrs;
    const negrito = !!n.marks?.some((m) => m.type === 'bold');
    if (limpo) {
      // no limpo, as etiquetas da revisão não aparecem: quem dá a cara é o tipo do trecho
      filhos.push(
        texto(cara.caixaAlta ? caixaAlta(n.text) : n.text, {
          bold: negrito || !!arte || !!cara.negrito,
          underline: arte || cara.sublinhado ? { type: UnderlineType.SINGLE } : undefined,
          italics: !!cara.italico,
        }),
      );
      if (comentario !== undefined && abertos.has(id) && idArte(nos[k + 1]) !== id) {
        filhos.push(new CommentRangeEnd(comentario), new TextRun({ children: [new CommentReference(comentario)] }));
        abertos.delete(id);
      }
      continue;
    }
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
    if (comentario !== undefined && abertos.has(id) && idArte(nos[k + 1]) !== id) {
      filhos.push(new CommentRangeEnd(comentario), new TextRun({ children: [new CommentReference(comentario)] }));
      abertos.delete(id);
    }
  }
  return new Paragraph({ children: filhos, spacing: limpo ? { after: 160, line: 276 } : { after: 140, line: 320 } });
}

const celula = (filhos: (Paragraph | Table)[], largura: number, fundo?: string) =>
  new TableCell({
    children: filhos,
    width: { size: largura, type: WidthType.PERCENTAGE },
    borders: bordas,
    margins: { top: 100, bottom: 60, left: 140, right: 140 },
    shading: fundo ? { type: ShadingType.CLEAR, fill: fundo, color: 'auto' } : undefined,
  });

const escapar = (s: unknown) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

/** Quem escreveu e mexeu no roteiro, sem repetir. */
export function autoresDe(saida: Saida): { nome: string; papel: string }[] {
  const r = saida.roteiro;
  const lista = [
    { nome: r.redator, papel: 'redação' },
    { nome: r.criadoPor?.nome ?? '', papel: 'subiu' },
    { nome: r.alteradoPor?.nome ?? '', papel: 'revisou' },
  ].filter((a) => a.nome?.trim());
  return lista.filter((a, i) => lista.findIndex((b) => b.nome.toLowerCase() === a.nome.toLowerCase()) === i);
}

/** O XML do PROMeiro que vai dentro do .docx: o roteiro e as artes, com tipo, duração e comentários. */
export function xmlDoRoteiro(saida: Saida): string {
  const r = saida.roteiro;
  const campo = (nome: string, v: unknown) => (v || v === 0 ? `  <${nome}>${escapar(v)}</${nome}>\n` : '');
  const autor = autoresDe(saida)[0]?.nome ?? '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<roteiro xmlns="urn:promeiro:roteiro:1" versao="1" id="${escapar(r.id)}" exportadoEm="${escapar(saida.exportadoEm)}">\n` +
    campo('claquete', r.claquete) +
    campo('atracao', r.programa) +
    campo('praca', r.praca) +
    campo('exibicao', r.dataExibicao) +
    campo('editor', r.editor) +
    campo('duracaoEstimadaSeg', r.duracaoEstimadaSeg) +
    '  <autores>\n' +
    autoresDe(saida).map((a) => `    <autor papel="${escapar(a.papel)}">${escapar(a.nome)}</autor>\n`).join('') +
    '  </autores>\n' +
    `  <artes total="${saida.artes.length}">\n` +
    saida.artes
      .map(
        (a) =>
          `    <arte ordem="${a.ordem}" id="${escapar(a.id)}" tipo="${escapar(a.subtipo)}" tipoNome="${escapar(a.subtipo ? a.subtipoNome : '')}" duracaoEstimadaSeg="${a.duracaoEstimadaSeg}">\n` +
          `      <texto>${escapar(a.texto)}</texto>\n` +
          (a.observacao ? `      <comentarios>\n        <comentario autor="${escapar(autor)}">${escapar(a.observacao)}</comentario>\n      </comentarios>\n` : '      <comentarios/>\n') +
          '    </arte>\n',
      )
      .join('') +
    '  </artes>\n' +
    '</roteiro>\n'
  );
}

/** Põe o XML do PROMeiro dentro do .docx como parte customXml, do jeito que o Word preserva. */
async function embutirXml(docx: Blob, xml: string): Promise<Blob> {
  const zip = await JSZip.loadAsync(await docx.arrayBuffer());
  const guid = '{6E0F6C2A-5B1D-4C55-9C7E-50524F4D4549}';
  zip.file('customXml/item1.xml', xml);
  zip.file(
    'customXml/itemProps1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<ds:datastoreItem ds:itemID="${guid}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="urn:promeiro:roteiro:1"/></ds:schemaRefs></ds:datastoreItem>`,
  );
  zip.file(
    'customXml/_rels/item1.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/></Relationships>',
  );
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
  zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', '<Relationship Id="rIdPromeiro" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>'));
  let tipos = await zip.file('[Content_Types].xml')!.async('string');
  if (!/Extension="xml"/.test(tipos)) tipos = tipos.replace('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">', '$&<Default Extension="xml" ContentType="application/xml"/>');
  tipos = tipos.replace('</Types>', '<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/></Types>');
  zip.file('[Content_Types].xml', tipos);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}

const bordaPreta = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const bordasPretas = { top: bordaPreta, bottom: bordaPreta, left: bordaPreta, right: bordaPreta };
const celulaLimpa = (filhos: Paragraph[], largura: number, juntas = 1) =>
  new TableCell({
    children: filhos.length ? filhos : [new Paragraph({})],
    width: { size: largura, type: WidthType.PERCENTAGE },
    columnSpan: juntas > 1 ? juntas : undefined,
    borders: bordasPretas,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });

/** O corpo do modo limpo: o título e os trechos, em texto corrido ou na tabela de bordas pretas das colunas (a locação
    na linha inteira; cada grupo numa linha, o vídeo à esquerda e o áudio à direita). */
function corpoLimpo(saida: Saida, visao: 'texto' | 'colunas', comentarios: Comentarios): (Paragraph | Table)[] {
  const trechos = (saida.blocos.content ?? []).filter((n) => n.type === 'paragraph');
  const titulo = saida.roteiro.titulo || saida.roteiro.claquete || 'Roteiro';
  const cabeca = new Paragraph({ children: [texto(caixaAlta(titulo), { bold: true })], spacing: { after: 240, line: 276 } });
  const um = (i: number) => paragrafo(trechos[i], comentarios, true);
  if (visao === 'texto') return [cabeca, ...trechos.map((_, i) => um(i))];
  const grupos = gruposDasColunas(trechos.map((p) => tipoDoTrecho(p).tipo));
  if (!grupos.length) return [cabeca];
  return [
    cabeca,
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [4513, 4513],
      rows: grupos.map((g) => new TableRow({ children: g.tipo === 'linha' ? [celulaLimpa([um(g.trecho)], 100, 2)] : [celulaLimpa(g.video.map(um), 50), celulaLimpa(g.audio.map(um), 50)] })),
    }),
  ];
}

export async function gerarDocx(saida: Saida, como: ComoSai = {}): Promise<Blob> {
  const r = saida.roteiro;
  const autores = autoresDe(saida);
  // a observação de cada arte vira comentário do Word, preso ao trecho sublinhado
  // as observações saem das próprias marcas do texto: o id da marca é o mesmo em todos os pedaços da arte
  const notas: { id: string; observacao: string }[] = [];
  const visitar = (n: NoJSON) => {
    for (const m of n.marks ?? [])
      if (m.type === 'arte' && String(m.attrs?.obs ?? '').trim() && !notas.some((x) => x.id === String(m.attrs?.id)))
        notas.push({ id: String(m.attrs?.id), observacao: String(m.attrs?.obs).trim() });
    (n.content ?? []).forEach(visitar);
  };
  visitar(saida.blocos);
  const comentarios: Comentarios = { ids: new Map(notas.map((a, i) => [a.id, i])), usados: new Set() };
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
              .map((l) => new TableRow({ children: (l.content ?? []).map((c, i) => celula((c.content ?? []).map((p) => paragrafo(p, comentarios)), i ? 66 : 34)) })),
          ],
        }),
      ]
    : blocos.filter((n) => n.type === 'paragraph').map((p) => paragrafo(p, comentarios));

  const linhaArtes = (cols: string[], cab = false) =>
    new TableRow({
      tableHeader: cab,
      children: cols.map((c, i) => celula([new Paragraph({ children: [cab ? rotulo(c) : texto(c, { size: 20, bold: i === 2 })] })], [7, 19, 37, 13, 24][i], cab ? 'F4F2EC' : undefined)),
    });

  const doc = new Document({
    creator: autores.map((a) => a.nome).join('; ') || 'PROMeiro',
    lastModifiedBy: r.alteradoPor?.nome || autores[0]?.nome || 'PROMeiro',
    title: r.claquete || [r.programa, r.titulo].filter(Boolean).join(' · '),
    subject: [r.programa, r.praca].filter(Boolean).join(' · '),
    keywords: ['PROMeiro', r.praca, ...new Set(saida.artes.filter((a) => a.subtipo).map((a) => a.subtipoNome))].filter(Boolean).join(', '),
    description: `${saida.artes.length} ${saida.artes.length === 1 ? 'arte' : 'artes'}; leitura estimada em ${r.duracaoEstimadaSeg}s`,
    comments: {
      children: notas.map((a, i) => ({
        id: i,
        author: autores[0]?.nome || 'PROMeiro',
        date: new Date(saida.exportadoEm),
        children: [new Paragraph({ children: [new TextRun(a.observacao)] })],
      })),
    },
    sections: [
      {
        // o modo limpo (#193): a página do Word de sempre, só o roteiro (os comentários das artes se prendem de novo nele)
        properties: { page: { margin: como.limpo ? { top: 1440, bottom: 1440, left: 1440, right: 1440 } : { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        children: como.limpo
          ? corpoLimpo(saida, como.limpo, { ids: comentarios.ids, usados: new Set() })
          : [
          new Paragraph({ children: [rotulo([r.programa, data].filter(Boolean).join(' · '))], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: r.titulo || 'Roteiro', font: FONTE, size: 40, bold: true })], spacing: { after: 240 } }),
          ...(preenchidos.length ? [cabecalho] : []),
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
            rows: [
              linhaArtes(['Nº', 'Tipo', 'Texto', 'Duração', 'Observação'], true),
              ...saida.artes.map((a) => linhaArtes([String(a.ordem), a.subtipo ? a.subtipoNome : '—', a.texto, `≈ ${a.duracaoEstimadaSeg}s`, a.observacao])),
            ],
          }),
        ],
      },
    ],
  });
  return embutirXml(await Packer.toBlob(doc), xmlDoRoteiro(saida));
}
