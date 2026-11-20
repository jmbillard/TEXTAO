/* PDF do roteiro, gerado aqui mesmo, para anexar ao card do Trello (o único formato que o Trello mostra
   direto). Sai do texto como está no PROMeiro: a claquete e a equipe no alto, o texto corrido com as artes
   sublinhadas e, no fim, a lista das artes. Comentários não entram. */

import PDFDocument from 'pdfkit';

const MARGEM = 56;
const TINTA = '#1a1916';
const SUAVE = '#6b675f';
const ARTE = '#a83a18';

/** Parágrafos do documento do editor (ProseMirror), em pedaços com e sem arte. Colunas viram parágrafos seguidos. */
export function paragrafosDoDoc(doc) {
  const out = [];
  const paragrafo = (p) => {
    const pedacos = [];
    for (const n of p?.content ?? []) {
      if (n.type === 'hardBreak') pedacos.push({ t: '\n' });
      else if (n.type === 'text' && n.text) {
        const marcas = n.marks ?? [];
        const etq = marcas.find((m) => m.type === 'etiqueta')?.attrs?.tipo;
        if (etq === 'comentario') continue;
        pedacos.push({ t: n.text, arte: marcas.some((m) => m.type === 'arte'), etq: etq || null });
      }
    }
    // parágrafo que só tinha comentário some inteiro; o vazio de verdade vira espaço
    if (pedacos.length || !(p?.content ?? []).length) out.push(pedacos);
  };
  for (const n of doc?.content ?? []) {
    if (n.type === 'paragraph') paragrafo(n);
    else if (n.type === 'linha') for (const cel of n.content ?? []) for (const p of cel.content ?? []) paragrafo(p);
  }
  // sem linhas em branco repetidas
  return out.filter((p, i) => p.length || (out[i - 1]?.length ?? 0) > 0);
}

/** As fontes padrão do PDF só têm o alfabeto latino: o resto vira um equivalente ou some. */
const latino = (s) =>
  String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/[^\u0009\u000a -~ -ÿ]/g, '');

const dataBr = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/**
 * @param meta claquete, programa, praca, dataExibicao, redator, editor
 * @param doc documento do editor
 * @param artes [{ texto, tipo }]
 * @returns Buffer
 */
/**
 * @param pars em vez de doc: os parágrafos do arquivo original, trecho a trecho ({ t, u, b, i }), sem interpretação.
 *   Assim o sublinhado é exatamente o do redator (nem mais, nem menos).
 */
export function gerarPdf({ meta = {}, doc, pars = null, artes = [], agora = new Date() }) {
  return new Promise((ok, erro) => {
    const pdf = new PDFDocument({ size: 'A4', margin: MARGEM, bufferPages: true, info: { Title: latino(meta.claquete || 'Roteiro'), Creator: 'PROMeiro' } });
    const partes = [];
    pdf.on('data', (p) => partes.push(p));
    pdf.on('end', () => ok(Buffer.concat(partes)));
    pdf.on('error', erro);
    const largura = pdf.page.width - MARGEM * 2;

    // claquete e equipe
    pdf.font('Courier-Bold').fontSize(18).fillColor(TINTA).text(latino(meta.claquete || 'Sem claquete'), { width: largura });
    const linha1 = [meta.programa, meta.praca, dataBr(meta.dataExibicao) && `exibição ${dataBr(meta.dataExibicao)}`].filter(Boolean).join('  ·  ');
    const linha2 = [meta.redator && `redação: ${meta.redator}`, meta.editor && `edição: ${meta.editor}`].filter(Boolean).join('  ·  ');
    pdf.moveDown(0.3).font('Helvetica').fontSize(10).fillColor(SUAVE);
    if (linha1) pdf.text(latino(linha1), { width: largura });
    if (linha2) pdf.text(latino(linha2), { width: largura });
    pdf.moveDown(0.6);
    pdf.moveTo(MARGEM, pdf.y).lineTo(MARGEM + largura, pdf.y).lineWidth(0.6).strokeColor('#d6d1c5').stroke();
    pdf.moveDown(1);

    // texto corrido: do original (o sublinhado do redator) ou do roteiro (as artes sublinhadas)
    const paragrafos = pars
      ? pars.map((par) => (Array.isArray(par) ? par : []).filter((r) => r && typeof r.t === 'string' && r.t).map((r) => ({ t: r.t, u: !!r.u, b: !!r.b, i: !!r.i, cor: TINTA })))
      : paragrafosDoDoc(doc).map((ps) => ps.map((p) => ({ t: p.t, u: !!p.arte, b: !!p.arte, i: !!p.etq, cor: p.arte ? ARTE : p.etq ? SUAVE : TINTA })));
    const fonte = (b, i) => (b && i ? 'Helvetica-BoldOblique' : b ? 'Helvetica-Bold' : i ? 'Helvetica-Oblique' : 'Helvetica');
    pdf.fontSize(11.5).fillColor(TINTA);
    for (const pedacos of paragrafos) {
      if (!pedacos.length || !pedacos.some((p) => p.t.trim())) {
        pdf.moveDown(0.6);
        continue;
      }
      pedacos.forEach((p, i) => {
        const fim = i === pedacos.length - 1;
        pdf.font(fonte(p.b, p.i)).fillColor(p.cor).text(latino(p.t), { continued: !fim, underline: p.u, width: largura, lineGap: 3 });
      });
      pdf.moveDown(0.55);
    }

    // a lista das artes, para conferir
    if (artes.length) {
      if (pdf.y > pdf.page.height - MARGEM - 80) pdf.addPage();
      pdf.moveDown(0.8);
      pdf.moveTo(MARGEM, pdf.y).lineTo(MARGEM + largura, pdf.y).lineWidth(0.6).strokeColor('#d6d1c5').stroke();
      pdf.moveDown(0.8).font('Helvetica-Bold').fontSize(10).fillColor(SUAVE).text(`ARTES (${artes.length})`, { characterSpacing: 1 });
      pdf.moveDown(0.4).fontSize(10.5);
      artes.forEach((a, i) => {
        pdf.font('Helvetica').fillColor(SUAVE).text(`${String(i + 1).padStart(2, ' ')}.  `, { continued: true });
        if (a.tipo) pdf.font('Helvetica-Bold').fillColor(TINTA).text(`${latino(a.tipo)}  `, { continued: true });
        pdf.font('Helvetica').fillColor(TINTA).text(latino(a.texto), { width: largura, lineGap: 2 });
      });
    }

    // rodapé em todas as páginas
    const quando = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const paginas = pdf.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      pdf.switchToPage(paginas.start + i);
      pdf.page.margins.bottom = 0; // o rodapé fica dentro da margem, sem abrir página nova
      pdf.font('Helvetica').fontSize(8).fillColor(SUAVE).text(latino(`${meta.claquete || ''}  ·  gerado pelo PROMeiro em ${quando}  ·  ${i + 1}/${paginas.count}`), MARGEM, pdf.page.height - MARGEM / 1.6, { width: largura, align: 'center', lineBreak: false });
    }
    pdf.end();
  });
}
