// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { interpretar, montarDoc } from '../src/importar/interpretar';
import { lerPdf, type PdfJs } from '../src/importar/pdf';
import { exportar } from '../src/modelo/exportar';

/* Futebol e Eliana: PDFs gerados por "imprimir em PDF" com o mesmo texto e sublinhado dos roteiros reais.
   Nobreza e Quem Ama Cuida: os .docx reais convertidos para PDF pelo LibreOffice.
   Afropunk: tabela de duas colunas montada a partir de um roteiro real em PDF. */
async function importar(nome: string) {
  const bruto = await lerPdf(new Uint8Array(readFileSync(join(__dirname, 'fixtures', nome))), nome, pdfjs as unknown as PdfJs);
  const imp = interpretar(bruto, { anoPadrao: 2026 });
  return { bruto, imp, saida: exportar({ id: 't', meta: imp.meta, doc: montarDoc(imp), revisao: 1, criadoEm: '', atualizadoEm: '' }) };
}

describe('PDF', () => {
  it('Futebol: sublinhado desenhado vira arte, uma por versão', async () => {
    const { bruto, saida } = await importar('FutBrasileirao28_10_Sp.pdf');
    expect(bruto.avisos?.[0]).toMatch(/reconhecidos pelo desenho da página/);
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

  it('Afropunk: colunas pelas bordas da tabela, marca-texto, título e versões quebradas em duas linhas', async () => {
    const { bruto, imp, saida } = await importar('Afropunk_8_11.pdf');
    expect(bruto.blocos.some((b) => b.tipo === 'tabela')).toBe(true);
    expect(saida.roteiro).toMatchObject({ programa: 'Festival Afropunk 2026', dataExibicao: '2026-11-08', locutor: 'KENYA SADE', layout: 'instrucoes_texto' });
    // o marca-texto amarelo vira pergunta, e só ele: o resto da coluna não herda a cor
    expect(imp.perguntas.map((p) => [p.estilo, p.nomeCor, p.sugestao, p.trechos])).toEqual([
      ['marca-texto', 'amarelo', 'sonoplastia', ['Atenção sonoplasta: encerrar chamada com o plim plim']],
    ]);
    expect(saida.artes.map((a) => a.texto)).toEqual([
      'MÚSICA', 'PERTENCIMENTO', 'DIVERSIDADE', 'LIBERDADE', 'PRÓXIMO DOMINGO', 'DOMINGO', 'AMANHÃ', 'HOJE (DEPOIS DO FANTÁSTICO)',
      'AFROPUNK 2026.', 'GILBERTO GIL', 'EMICIDA', 'GABY AMARANTOS', 'CRIOULO',
    ]);
    // a coluna da esquerda (alinhada à direita) volta a ser parágrafos inteiros, e não entra na locução
    const esquerda = imp.linhas.flatMap((l) => l.e).map((p) => p.map((t) => t.t).join(''));
    expect(esquerda).toContain('Abre take aos 10:19(mulher dançando e sorrindo, fechado nela) enchendo toda tela, dentro da moldura. Moldura vai se fechando, como na referência.');
    expect(saida.texto.locucao).toMatch(/^O ENCONTRO DA MÚSICA COM O PERTENCIMENTO\./);
    expect(saida.texto.locucao).not.toMatch(/moldura/i);
  });

  it('Quem Ama Cuida (convertido do Word): duas colunas, cabeçalho e marca-textos', async () => {
    const { imp, saida } = await importar('Quem_AmaPrologo26_10_Rede.pdf');
    expect(saida.roteiro).toMatchObject({
      programa: 'Quem Ama Cuida', capitulo: 137, praca: 'REDE', locutor: 'DIRCEU VIRTUAL', selo: 'A12', duracaoAlvoSeg: 60, duracaoModo: 'max', layout: 'ilustracao_audio',
    });
    expect(imp.perguntas.map((p) => [p.nomeCor, p.sugestao])).toEqual([['amarelo', 'producao'], ['azul', 'producao']]);
    expect(saida.artes.map((a) => a.texto)).toEqual(['NO CAPÍTULO ANTERIOR...', 'EM DEZ SEGUNDOS, FIQUE COM O CAPÍTULO DE HOJE...']);
    expect(saida.sonoras.map((x) => x.personagem)).toEqual(['Pedro', 'Pedro', 'Adriana', 'Pedro', 'Pilar', 'Ademir']);
  });

  it('Eliana: cabeçalho, artes com acento e sonoras', async () => {
    const { saida } = await importar('Eliana_20_9.pdf');
    expect(saida.roteiro).toMatchObject({ programa: 'Eliana', locutor: 'MCK', duracaoAlvoSeg: 30, selo: 'Verifique a classificação indicativa', edicao: 'PGM 23' });
    expect(saida.artes.map((a) => a.texto)).toEqual(['DOMINGO', 'AMANHÃ', 'HOJE', 'PRISCILLA', 'GUILHERME & BENUTO', 'TAÍS ARAUJO', '2:30', 'EM FAMÍLIA COM ELIANA']);
    expect(saida.sonoras.map((s) => [s.timecodeEntrada, s.personagem])).toEqual([['00:00:14', 'Eliana'], ['00:03:04', 'Benuto']]);
  });
});
