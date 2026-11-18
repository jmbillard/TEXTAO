import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { interpretar, lerArquivo, montarDoc } from '../src/importar';
import { exportar, roteiroDoJson } from '../src/modelo/exportar';
import type { Roteiro } from '../src/modelo/tipos';

async function importar(nome: string) {
  const dados = new Uint8Array(readFileSync(join(__dirname, 'fixtures', nome)));
  const imp = interpretar(await lerArquivo(dados, nome), { anoPadrao: 2026 });
  const roteiro: Roteiro = { id: 'teste', meta: imp.meta, doc: montarDoc(imp), revisao: 1, criadoEm: '', atualizadoEm: '' };
  return { imp, saida: exportar(roteiro, new Date('2026-10-27T12:00:00Z')) };
}
const textos = (xs: { texto: string }[]) => xs.map((x) => x.texto);

describe('Quem Ama Cuida · Prólogo (.docx, Ilustração | Áudio)', async () => {
  const { imp, saida } = await importar('Quem_AmaPrologo26_10_Rede.docx');

  it('cabeçalho', () => {
    expect(saida.roteiro).toMatchObject({
      programa: 'Quem Ama Cuida', tipoPrograma: 'novela', dataExibicao: '2026-10-26', capitulo: 137, praca: 'REDE',
      locutor: 'DIRCEU VIRTUAL', selo: 'A12', duracaoAlvoSeg: 60, duracaoModo: 'max', layout: 'ilustracao_audio',
      redator: 'Juliana Amorim', titulo: 'Prólogo · cap. 137',
    });
  });
  it('artes', () => {
    expect(textos(saida.artes)).toEqual(['NO CAPÍTULO ANTERIOR...', 'EM DEZ SEGUNDOS, FIQUE COM O CAPÍTULO DE HOJE...']);
    expect(saida.artes.every((a) => a.subtipo === 'lettering')).toBe(true);
  });
  it('sonoras com origem, timecode e personagem', () => {
    expect(saida.sonoras.map((s) => [s.origem, s.bloco, s.timecodeEntrada, s.personagem])).toEqual([
      ['MC', 2, '00:10:53', 'Pedro'], ['MC', 2, '00:15:02', 'Pedro'], ['MC', 2, '00:14:50', 'Adriana'],
      ['MC', 3, '00:04:17', 'Pedro'], ['MC', 4, '00:09:42', 'Pilar'], ['MC', 4, '00:08:41', 'Ademir'],
    ]);
    expect(saida.sonoras[0].descricaoImagem).toBe('no tribunal');
    expect(saida.sonoras[0].fala).toMatch(/^A defesa pede que essa revisão/);
  });
  it('marcações do Word', () => {
    // vermelho resolvido sozinho pela legenda; marca-texto vira pergunta
    expect(textos(saida.trechosCortaveis)).toEqual(['14.50 - Adriana senta chorando em casa: Meu Deus, depois de tanto sofrimento,']);
    expect(imp.perguntas.map((p) => [p.estilo, p.nomeCor, p.sugestao])).toEqual([
      ['marca-texto', 'amarelo', 'producao'], ['marca-texto', 'azul', 'producao'],
    ]);
    expect(imp.perguntas[0].trechos).toEqual(['Utilizado CAP 136 (exibido: 24/10)']);
    expect(saida.orientacoes.producao.length).toBeGreaterThanOrEqual(4);
    expect(saida.texto.completo).not.toMatch(/Em vermelho se precisar cortar|FECHAR COM|LOC:/);
  });
});

describe('Encontro (.docx, Instruções | Texto)', async () => {
  const { imp, saida } = await importar('Encontro_27_10.docx');

  it('cabeçalho', () => {
    expect(saida.roteiro).toMatchObject({
      programa: 'Encontro', tipoPrograma: 'ao_vivo', dataExibicao: '2026-10-27', locutor: 'WALMIR',
      layout: 'instrucoes_texto', redator: 'Ana Flycariao', versoes: ['AMANHÃ', 'HOJE'],
    });
    expect(imp.faltando).toEqual(['selo', 'duração']);
  });
  it('artes: cada versão é uma arte', () => {
    expect(textos(saida.artes)).toEqual(['AMANHÃ', 'HOJE', '9:30', 'DEBORAH EVELYN']);
    expect(saida.artes.map((a) => a.subtipo)).toEqual(['versao', 'versao', 'versao', 'rodape']);
    expect(saida.artes[0].grupoVersoes).toBe(saida.artes[1].grupoVersoes);
    expect(saida.artes[0].grupoVersoes).not.toBeNull();
  });
  it('orientações', () => {
    expect(imp.perguntas.map((p) => [p.estilo, p.nomeCor, p.sugestao, p.trechos])).toEqual([['cor', 'vermelho', 'locutor', ['(lê-se vêipi)']]]);
    expect(textos(saida.orientacoes.locutor)).toEqual(['(lê-se vêipi)']);
    expect(textos(saida.orientacoes.sonoplastia)).toEqual(['Atenção sonoplasta: usa plim plim no final', '((plim plim))']);
    expect(textos(saida.orientacoes.edicao)).toEqual(['((Encerra logo Encontro))']);
    expect(saida.texto.locucao).toMatch(/^NO ENCONTRO DE AMANHÃ\.\.\./);
    expect(saida.texto.locucao).not.toMatch(/vêipi|plim/i);
  });
});

describe('Nobreza do Amor (.docx, coluna da esquerda vazia)', async () => {
  const { imp, saida } = await importar('Nobreza_27_10.docx');

  it('cabeçalho', () => {
    expect(saida.roteiro).toMatchObject({
      programa: 'Nobreza do Amor', dataExibicao: '2026-10-27', capitulo: 184, locutor: 'DIRCEU', duracaoAlvoSeg: 30,
      duracaoModo: 'fechar', selo: 'Verifique a classificação indicativa', redator: 'Mila Teixeira', layout: 'coluna_unica',
    });
    expect(imp.faltando).toEqual([]);
  });
  it('artes', () => {
    expect(saida.artes.map((a) => [a.texto, a.subtipo])).toEqual([
      ['A NOBREZA DO AMOR', 'logo'], ['ÚLTIMAS SEMANAS', 'lettering'], ['AMANHÃ', 'versao'], ['HOJE', 'versao'], ['A NOBREZA DO AMOR', 'logo'],
    ]);
  });
  it('sonoras herdam a origem de "FRAME IO ONLINE BLOCO 01"', () => {
    expect(saida.sonoras.map((s) => [s.origem, s.bloco, s.timecodeEntrada, s.personagem])).toEqual([
      ['FRAME_IO', 1, '00:05:02', 'Fortunato'], ['FRAME_IO', 1, '00:06:36', 'Manoel'], ['FRAME_IO', 2, '00:04:56', 'Jendal'],
    ]);
    expect(saida.sonoras[2].fala).toMatch(/\/enx\//);
    expect(textos(saida.orientacoes.sonoplastia)).toEqual(['PLIM PLIM']);
    expect(imp.perguntas).toEqual([]);
  });
});

describe('Futebol Brasileirão (.docx, coluna única)', async () => {
  const { saida } = await importar('FutBrasileirao28_10_Sp.docx');

  it('cabeçalho', () => {
    expect(saida.roteiro).toMatchObject({
      programa: 'Futebol Brasileirão', tipoPrograma: 'esporte', dataExibicao: '2026-10-28', praca: 'SP', locutor: 'WALMIR',
      duracaoAlvoSeg: 15, layout: 'coluna_unica', redator: 'Guilherme Heizer', versoes: ['QUARTA', 'AMANHÃ', 'HOJE'],
    });
  });
  it('artes', () => {
    expect(saida.artes.map((a) => [a.texto, a.subtipo])).toEqual([
      ['RETA FINAL', 'rodape'], ['QUARTA', 'versao'], ['AMANHÃ', 'versao'], ['HOJE', 'versao'],
      ['BAHIA X SÃO PAULO', 'tela_cheia'], ['BRASILEIRÃO', 'logo'], ['GLOBO', 'logo'],
    ]);
    expect(new Set(saida.artes.slice(1, 4).map((a) => a.grupoVersoes)).size).toBe(1);
  });
  it('locução sem o cabeçalho', () => {
    expect(saida.texto.locucao.split('\n')[0]).toBe('É RETA FINAL! CADA PONTO VALE MUITO.');
    expect(saida.texto.completo).not.toMatch(/LOC:|15”/);
    expect(saida.sonoras).toEqual([]);
  });
});

describe('Eliana (.rtf, cp1252)', async () => {
  const { imp, saida } = await importar('Eliana_20_9.rtf');

  it('cabeçalho', () => {
    expect(saida.roteiro).toMatchObject({
      programa: 'Eliana', tipoPrograma: 'auditorio', dataExibicao: '2026-09-20', edicao: 'PGM 23', locutor: 'MCK',
      selo: 'Verifique a classificação indicativa', duracaoAlvoSeg: 30, layout: 'coluna_unica',
      versoes: ['DOMINGO', 'AMANHÃ', 'HOJE'],
    });
    expect(imp.faltando).toEqual(['quem escreveu']);
  });
  it('artes com acentos corretos', () => {
    expect(saida.artes.map((a) => [a.texto, a.subtipo])).toEqual([
      ['DOMINGO', 'versao'], ['AMANHÃ', 'versao'], ['HOJE', 'versao'], ['PRISCILLA', 'rodape'], ['GUILHERME & BENUTO', 'rodape'],
      ['TAÍS ARAUJO', 'rodape'], ['2:30', 'versao'], ['EM FAMÍLIA COM ELIANA', 'logo'],
    ]);
    expect(new Set(saida.artes.slice(0, 3).map((a) => a.grupoVersoes)).size).toBe(1);
  });
  it('sonoras', () => {
    expect(saida.sonoras.map((s) => [s.origem, s.bloco, s.timecodeEntrada, s.personagem])).toEqual([
      ['PGM', 1, '00:00:14', 'Eliana'], ['PGM', 1, '00:03:04', 'Benuto'], ['PGM', 1, '00:10:52', 'Eliana'],
      ['outro', null, '00:05:59', 'Eliana'], ['outro', null, '00:01:26', 'Eliana'],
      ['outro', null, '00:00:57', 'Tio Silvinho'], ['outro', null, '00:04:00', 'Lázaro Ramos'],
    ]);
    expect(saida.sonoras[0].fala).toBe('Vai ter diversão, vai ter emoção do jeitinho que a gente ama');
  });
  it('orientações reconhecidas pelo texto', () => {
    expect(textos(saida.orientacoes.edicao)).toEqual(['/EDT e ilustra totalmente a fala seguinte/', '(BATE LOGO EM FAMÍLIA COM ELIANA)']);
    expect(textos(saida.orientacoes.sonoplastia)).toEqual(['(seguir com música até o final da chamada)']);
    expect(saida.texto.locucao).toContain('E AINDA TEM MAIS! TAÍS ARAUJO TÁ NA ÁREA!');
  });
});

describe('ida e volta pelo .json', async () => {
  it('reabre o roteiro como estava', async () => {
    const { saida } = await importar('Nobreza_27_10.docx');
    const de_volta = roteiroDoJson(JSON.parse(JSON.stringify(saida)));
    const de_novo = exportar(de_volta, new Date('2026-10-27T12:00:00Z'));
    expect(de_novo.artes).toEqual(saida.artes);
    expect(de_novo.roteiro).toEqual(saida.roteiro);
    expect(de_novo.blocos).toEqual(saida.blocos);
  });
});
