// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { interpretar, montarDoc } from '../src/importar/interpretar';
import { lerPdf, type PdfJs } from '../src/importar/pdf';
import { exportar } from '../src/modelo/exportar';

/* Futebol e Eliana: PDFs gerados por "imprimir em PDF" com o mesmo texto e sublinhado dos roteiros reais.
   Nobreza: o .docx real convertido para PDF pelo LibreOffice. */
async function importar(nome: string) {
  const bruto = await lerPdf(new Uint8Array(readFileSync(join(__dirname, 'fixtures', nome))), nome, pdfjs as unknown as PdfJs);
  const imp = interpretar(bruto, { anoPadrao: 2026 });
  return { bruto, imp, saida: exportar({ id: 't', meta: imp.meta, doc: montarDoc(imp), revisao: 1, criadoEm: '', atualizadoEm: '' }) };
}

describe('PDF', () => {
  it('Futebol: sublinhado desenhado vira arte, uma por versão', async () => {
    const { bruto, saida } = await importar('FutBrasileirao28_10_Sp.pdf');
    expect(bruto.avisos?.[0]).toMatch(/não guarda colunas/);
    expect(saida.roteiro).toMatchObject({ programa: 'Futebol Brasileirão', dataExibicao: '2026-10-28', praca: 'SP', locutor: 'WALMIR', duracaoAlvoSeg: 15 });
    expect(saida.artes.map((a) => [a.texto, a.subtipo])).toEqual([
      ['RETA FINAL', 'rodape'], ['QUARTA', 'versao'], ['AMANHÃ', 'versao'], ['HOJE', 'versao'],
      ['BAHIA X SÃO PAULO', 'tela_cheia'], ['BRASILEIRÃO', 'logo'], ['GLOBO', 'logo'],
    ]);
    expect(saida.texto.locucao.split('\n')[0]).toBe('É RETA FINAL! CADA PONTO VALE MUITO.');
  });

  it('Nobreza (convertido do Word): cabeçalho, artes e as três sonoras em parágrafos próprios', async () => {
    const { saida } = await importar('Nobreza_27_10.pdf');
    expect(saida.roteiro).toMatchObject({ programa: 'Nobreza do Amor', dataExibicao: '2026-10-27', capitulo: 184, locutor: 'DIRCEU', duracaoAlvoSeg: 30 });
    expect(saida.artes.map((a) => [a.texto, a.subtipo])).toEqual([
      ['A NOBREZA DO AMOR', 'logo'], ['ÚLTIMAS SEMANAS', 'lettering'], ['AMANHÃ', 'versao'], ['HOJE', 'versao'], ['A NOBREZA DO AMOR', 'logo'],
    ]);
    expect(saida.sonoras.map((s) => [s.origem, s.bloco, s.timecodeEntrada, s.personagem])).toEqual([
      ['FRAME_IO', 1, '00:05:02', 'Fortunato'], ['FRAME_IO', 1, '00:06:36', 'Manoel'], ['FRAME_IO', 2, '00:04:56', 'Jendal'],
    ]);
  });

  it('Eliana: cabeçalho, artes com acento e sonoras', async () => {
    const { saida } = await importar('Eliana_20_9.pdf');
    expect(saida.roteiro).toMatchObject({ programa: 'Eliana', locutor: 'MCK', duracaoAlvoSeg: 30, selo: 'Verifique a classificação indicativa', edicao: 'PGM 23' });
    expect(saida.artes.map((a) => a.texto)).toEqual(['DOMINGO', 'AMANHÃ', 'HOJE', 'PRISCILLA', 'GUILHERME & BENUTO', 'TAÍS ARAUJO', '2:30', 'EM FAMÍLIA COM ELIANA']);
    expect(saida.sonoras.map((s) => [s.timecodeEntrada, s.personagem])).toEqual([['00:00:14', 'Eliana'], ['00:03:04', 'Benuto']]);
  });
});
