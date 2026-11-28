// @vitest-environment node
/* Começar o Roteiro de um PDF (#195): a mesma leitura da fila (lerPdf), com o tipo guardado em cada trecho e as artes
   que a fila acha no mesmo arquivo. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { interpretar } from '../src/importar/interpretar';
import { lerPdf, type PdfJs } from '../src/importar/pdf';
import { comecoDaImportacao, docDaImportacao } from '../src/importar/paraEscrever';
import { exportar } from '../src/modelo/exportar';
import { artesDoTexto, TIPOS_DO_TRECHO } from '../src/modelo/trecho';
import { chaveDeArte } from '../src/modelo/diferencas';

describe.each(['Nobreza_27_10.pdf', 'FutBrasileirao28_10_Sp.pdf'])('%s', (nome) => {
  it('começa com o tipo em todo trecho e as artes da fila', async () => {
    const bruto = await lerPdf(new Uint8Array(readFileSync(join(__dirname, 'fixtures', nome))), nome, pdfjs as unknown as PdfJs);
    const imp = interpretar(bruto, { anoPadrao: 2026 });
    const comeco = comecoDaImportacao(imp);
    for (const p of comeco.doc.content ?? []) {
      expect(p.type).toBe('paragraph');
      expect(TIPOS_DO_TRECHO).toContain(p.attrs?.tipo);
    }
    const daFila = exportar({ id: 't', meta: { ...imp.meta, layout: 'coluna_unica' }, doc: docDaImportacao(imp), revisao: 1, criadoEm: '', atualizadoEm: '' }).artes.map((a) => a.texto);
    const unicas = daFila.filter((t, i) => daFila.findIndex((x) => chaveDeArte(x) === chaveDeArte(t)) === i).map((t) => t.trim());
    expect(unicas.length).toBeGreaterThan(0);
    expect(artesDoTexto(comeco.doc).map((a) => a.texto)).toEqual(unicas);
    expect(comeco.meta.dataExibicao).toMatch(/^2026-10-2\d$/);
  });
});
