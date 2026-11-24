// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { acharPosteres } from '../src/filmes/posteres';

/* Uma página com o desenho de uma prévia de filmes (sem os pôsteres de verdade: o repositório é público):
   um fundo de página inteira, um logo pequeno, uma sessão cancelada e dez pôsteres em duas fileiras, cada
   um com o título embaixo. A página tem 1000 × 600 pontos; a função mede em pixels da imagem (escala 2). */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const TITULOS = ['DESPEDIDA EM GRANDE ESTILO (2017)', 'CIDADE PERDIDA (2022)', 'PERSEGUIÇÃO NAS ALTURAS (2022)', 'UM SONHO DE LIBERDADE (1994)', 'TREZE VIDAS (2022)', 'PAI, A GENTE SÓ TEM UM 3 (2021)', 'KONG: ILHA DA CAVEIRA (2017)', 'O JOGO DE UMA VIDA (2014)', 'CAINDO NA REAL (2024)', 'BONS COMPANHEIROS (2023)'];
const COLUNAS_CIMA = [210, 370, 530, 690, 850];
const COLUNAS_BAIXO = [60, 250, 440, 630, 820];

async function paginaDePrevia(): Promise<Uint8Array> {
  // @ts-expect-error pdfkit sem tipos
  const { default: PDFDocument } = await import('../servidor/node_modules/pdfkit/js/pdfkit.js');
  const doc = new PDFDocument({ size: [1000, 600], margin: 0 });
  const partes: Buffer[] = [];
  doc.on('data', (p: Buffer) => partes.push(p));
  const fim = new Promise<void>((ok) => doc.on('end', ok));
  doc.image(PNG, 0, 0, { width: 1000, height: 600 }); // o fundo: grande demais para ser pôster
  doc.image(PNG, 900, 20, { width: 60, height: 30 }); // o logo: pequeno e deitado
  doc.fontSize(9).text('CANCELADO', 70, 200);
  COLUNAS_CIMA.forEach((x, i) => {
    doc.image(PNG, x, 80, { width: 120, height: 180 });
    doc.fontSize(8).text(TITULOS[i], x, 266, { lineBreak: false });
  });
  COLUNAS_BAIXO.forEach((x, i) => {
    doc.image(PNG, x, 340, { width: 120, height: 180 });
    doc.fontSize(8).text(TITULOS[5 + i], x, 526, { lineBreak: false });
  });
  doc.end();
  await fim;
  return new Uint8Array(Buffer.concat(partes));
}

describe('os pôsteres de uma página da prévia', () => {
  it('acha os dez pôsteres, em ordem de leitura, sem o fundo nem o logo; e a vaga cancelada', async () => {
    const pdf = await pdfjs.getDocument({ data: await paginaDePrevia(), isEvalSupported: false }).promise;
    const pagina = await pdf.getPage(1);
    const r = await acharPosteres(pdfjs, pagina, 2);

    expect(r.tamanho).toEqual({ width: 2000, height: 1200 });
    expect(r.posteres.map((c) => [Math.round(c.x / 2), Math.round(c.y / 2)])).toEqual([
      ...COLUNAS_CIMA.map((x) => [x, 80]),
      ...COLUNAS_BAIXO.map((x) => [x, 340]),
    ]);
    expect(r.posteres.every((c) => Math.round(c.width) === 240 && Math.round(c.height) === 360)).toBe(true);
    // o título de cada pôster está nas linhas de texto, logo abaixo dele
    const kong = r.textos.find((l) => l.str.startsWith('KONG'))!;
    expect(Math.round(kong.x / 2)).toBe(250);
    expect(kong.top).toBeGreaterThan(r.posteres[6].y + r.posteres[6].height - 10);
    // "CANCELADO" no lugar de um pôster vira uma vaga do tamanho de um pôster, na fileira de cima
    expect(r.vagas).toHaveLength(1);
    expect(r.vagas[0].texto).toBe('CANCELADO');
    expect(Math.round(r.vagas[0].caixa.y / 2)).toBe(80);
  });
});
