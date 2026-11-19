import { describe, expect, it } from 'vitest';
import type { DocBruto, Par } from '../src/importar/bruto';
import { interpretar, montarDoc } from '../src/importar/interpretar';
import { exportar } from '../src/modelo/exportar';
import { analisarSonoras } from '../src/modelo/sonora';

/* Formatos vistos em dezenas de roteiros reais, reproduzidos com textos e nomes inventados.
   Os arquivos originais e os trechos deles não entram no repositório. */

const p = (t: string): Par => [{ t }];
const u = (t: string) => ({ t, u: true, b: true });
function importar(blocos: DocBruto['blocos'], arquivo = 'Teste_1_1.docx') {
  const imp = interpretar({ arquivo, formato: 'docx', autor: 'Fulana de Tal', blocos }, { anoPadrao: 2026 });
  return { imp, saida: exportar({ id: 't', meta: imp.meta, doc: montarDoc(imp), revisao: 1, criadoEm: '', atualizadoEm: '' }) };
}
const soltos = (...linhas: (string | Par)[]) => linhas.map((l) => ({ tipo: 'p' as const, par: typeof l === 'string' ? p(l) : l }));
const tabela = (...linhas: (string | Par)[][][]) => ({ tipo: 'tabela' as const, linhas: linhas.map((l) => l.map((c) => c.map((x) => (typeof x === 'string' ? p(x) : x)))) });

describe('sonoras: formatos', () => {
  const um = (t: string) => analisarSonoras(t)[0];
  it('timecode com quadros, sem traço', () => {
    expect(um('00:01:36:16 MARIA LUZ: HOJE TEM FESTA NA PRAÇA')).toMatchObject({ timecodeEntrada: '00:01:36', timecodeOriginal: '00:01:36:16', personagem: 'MARIA LUZ', fala: 'HOJE TEM FESTA NA PRAÇA' });
  });
  it('origem livre com entrada//saída', () => {
    expect(um('BL1 XY DIA DE FESTA CUT09 00:03:30//00:03:38 – JOCA CANTA: Lá vem a banda tocando')).toMatchObject({
      origemOriginal: 'BL1 XY DIA DE FESTA CUT09', bloco: 1, timecodeEntrada: '00:03:30', timecodeSaida: '00:03:38', fala: 'Lá vem a banda tocando',
    });
    expect(um('QUADRO DA SEMANA EP 5 – 00:03:30//00:03:43 TONHO ON: Eu queria ter mais tempo')).toMatchObject({ timecodeEntrada: '00:03:30', timecodeSaida: '00:03:43', fala: 'Eu queria ter mais tempo' });
  });
  it('IN … OUT', () => {
    expect(um('SHOW DA NOITE - 1276 - BLOCO 05 PGM – IN 00:05:30 – Dalva: Hoje a noite é nossa.... OUT 00:05:34 (seguir com a música)')).toMatchObject({
      origem: 'PGM', bloco: 5, timecodeEntrada: '00:05:30', timecodeSaida: '00:05:34', personagem: 'Dalva',
    });
  });
  it('episódio e bloco, capítulo no caminho, retrô', () => {
    expect(um('EP.1 - 00.03.19 – Lina p/ Teo: É tão curioso, não é?')).toMatchObject({ origemOriginal: 'EP.1', timecodeEntrada: '00:03:19', personagem: 'Lina' });
    expect(um('EP21/B1/25.57 Otto p/ Nina: Só penso em voltar pra casa')).toMatchObject({ bloco: 1, timecodeEntrada: '00:25:57', personagem: 'Otto' });
    expect(um('MC/CAP.83/BL01/09.20 Clara p/ Beto: Talvez eu também vá')).toMatchObject({ origem: 'MC', bloco: 1, timecodeEntrada: '00:09:20', personagem: 'Clara' });
    expect(um('RETRÔ/FRAME.IO/CAP 16/BL02/02.31 – Davi: Tião, achar a chave pode demorar')).toMatchObject({ origem: 'FRAME_IO', bloco: 2, timecodeEntrada: '00:02:31' });
  });
  it('VT e fala sem timecode', () => {
    expect(um('VT 3/4 03:07 Pesquisadora Convidada: Existe uma pressão enorme')).toMatchObject({ origemOriginal: 'VT 3/4', timecodeEntrada: '00:03:07', personagem: 'Pesquisadora Convidada' });
    expect(um('Sílvia: Vamos colocar a turma pra dançar?')).toMatchObject({ timecodeEntrada: '', personagem: 'Sílvia' });
  });
  it('não confunde instrução nem locução com sonora', () => {
    expect(analisarSonoras('Abre com logo: A CASA DA COLINA')).toEqual([]);
    expect(analisarSonoras('Atenção sonoplasta: usa plim plim no final')).toEqual([]);
    expect(analisarSonoras('E AINDA TEM MAIS: A BANDA TÁ NA ÁREA!')).toEqual([]);
    expect(analisarSonoras('ÀS 21:30 TEM JORNAL')).toEqual([]);
    expect(analisarSonoras('/edit/ 08.41 – Nando: Se o vizinho reclamar do barulho')).toHaveLength(1);
  });
});

describe('cabeçalho e corpo: variações', () => {
  it('quebras manuais, "SEM SELO", tempo estimado e respiro de trilha', () => {
    const { saida } = importar(
      soltos(
        [{ t: 'LOC: FULANO / BELTRANO\nSEM SELO\n//\n(Tempo estimado: 30”)\nCHEGA MAIS, VISITANTE.\nRespiro trilha\nISSO AQUI NÃO É PASSEIO.' }],
        [u('QUARTA/AMANHÃ/HOJE…'), { t: '\n“A TORCIDA ESTÁ AQUI”.' }],
      ),
      'Fut_Liberta_16_9_Sp.docx',
    );
    expect(saida.roteiro).toMatchObject({ programa: 'Futebol Libertadores', praca: 'SP', locutor: 'FULANO / BELTRANO', selo: 'Sem selo', duracaoAlvoSeg: 30, versoes: ['QUARTA', 'AMANHÃ', 'HOJE'] });
    expect(saida.artes.map((a) => a.texto)).toEqual(['QUARTA', 'AMANHÃ', 'HOJE']);
    expect(saida.orientacoes.sonoplastia.map((o) => o.texto)).toEqual(['Respiro trilha']);
    expect(saida.texto.locucao.split('\n')).toEqual(['CHEGA MAIS, VISITANTE.', 'ISSO AQUI NÃO É PASSEIO.', 'QUARTA/AMANHÃ/HOJE…', '“A TORCIDA ESTÁ AQUI”.']);
  });

  it('"LOC:" no corpo é linha de locução, não troca o locutor', () => {
    const { saida } = importar([
      tabela(
        [['PGM: Viver Sertanejo 20/09', 'VERSÕES: DOMINGO/AMANHÃ/HOJE'], ['LOC: SICRANO', 'COM SELO']],
        [['ILUSTRAÇÃO'], ['ÁUDIO']],
        [[[u('CARTELA DO PROGRAMA VIVER SERTANEJO')]], ['BL1 XY CUT09 00:03:30//00:03:38 – JOCA CANTA: Lá vem a banda tocando', 'LOC: No dia da festa, a tradição encontra gente nova...', 'LOC: VIVER SERTANEJO!']],
      ),
    ]);
    expect(saida.roteiro).toMatchObject({ programa: 'Viver Sertanejo', dataExibicao: '2026-09-20', locutor: 'SICRANO', selo: 'Com selo', layout: 'ilustracao_audio' });
    expect(saida.texto.locucao.split('\n')).toEqual(['No dia da festa, a tradição encontra gente nova...', 'VIVER SERTANEJO!']);
    expect(saida.sonoras).toHaveLength(1);
    expect(saida.artes.map((a) => [a.texto, a.subtipo])).toEqual([['CARTELA DO PROGRAMA VIVER SERTANEJO', '']]);
  });

  it('programa fora do vocabulário, nome da chamada, duração em minutos e timecode sozinho na linha', () => {
    const { saida } = importar([
      tabela(
        [['PGM: BAILE DO BAIRRO – PÍLULA DE VERÃO 1’20”', 'MANUT 12/9'], ['**LOC MCK**']],
        [['ILUSTRAÇÃO'], ['ÁUDIO']],
        [[], ['CAMINHO: PROMOCOES\\ENTRETENIMENTO\\CABEÇA', '00:03:40:01', 'MARIA LUZ: É HOJE. NÃO VAI FALTAR, NÉ?', [{ t: 'LETTERING: ' }, u('DEPOIS DA NOVELA')], 'Fecha com logo do programa']],
      ),
    ]);
    expect(saida.roteiro).toMatchObject({ programa: 'Baile do Bairro', titulo: 'Pílula de Verão', dataExibicao: '2026-09-12', locutor: 'MCK', duracaoAlvoSeg: 80 });
    expect(saida.sonoras.map((s) => [s.timecodeEntrada, s.personagem])).toEqual([['00:03:40', 'MARIA LUZ']]);
    expect(saida.artes.map((a) => [a.texto, a.subtipo])).toEqual([['DEPOIS DA NOVELA', '']]);
    expect(saida.orientacoes.edicao.map((o) => o.texto)).toEqual(['LETTERING: DEPOIS DA NOVELA', 'Fecha com logo do programa']);
    expect(saida.orientacoes.producao).toHaveLength(1);
    expect(saida.texto.locucao).toBe(''); // a linha do lettering é pedido de arte, não é lida
  });

  it('texto na coluna da esquerda: colunas trocadas para o padrão; "Off Fulano:" é locução', () => {
    const { imp, saida } = importar([
      tabela(
        [['Tempo 50"', 'Loc: Fulano'], []],
        [['Off Fulano: DAS RUAS ÀS PRAÇAS.'], ['VT 1/2 13:57 Zoom in drone na praça central']],
        [['VT 3/4 03:07 Pesquisadora Convidada: Existe uma pressão enorme'], []],
        [['Off Fulano: NO JORNAL DA TARDE. (logo JT)'], []],
      ),
    ]);
    expect(imp.entendido.some((e) => e.includes('colunas trocadas'))).toBe(true);
    expect(saida.roteiro).toMatchObject({ locutor: 'FULANO', duracaoAlvoSeg: 50, layout: 'instrucoes_texto' });
    expect(saida.texto.locucao.split('\n')).toEqual(['DAS RUAS ÀS PRAÇAS.', 'NO JORNAL DA TARDE.']);
    expect(saida.sonoras.map((s) => s.personagem)).toEqual(['Pesquisadora Convidada']);
    expect(saida.orientacoes.edicao.map((o) => o.texto)).toEqual(['(logo JT)']);
  });

  it('caminho de rede sublinhado não é arte; instrução de imagem sublinhada vai para a edição', () => {
    const { saida } = importar([
      tabela(
        [['PGM: POR VOCE 7/9 (cap 19)'], ['COM SELO // FECHAR COM 30’’ NO MÁX', 'LOC: DIRCEU VIRTUAL']],
        [['ILUSTRAÇÃO'], ['ÁUDIO']],
        [
          [[{ t: 'Locs: ' }, { t: '\\\\servidor-exemplo.rede.local\\PASTA\\', u: true, cor: '0563C1' }], [u('Ilustrar com imagens de Tião entrando na estação (CAP 14 00:03:54)')]],
          ['O SEGREDO DE TIÃO PODE CUSTAR CARO', [u('AMANHÃ/HOJE')]],
        ],
      ),
    ]);
    expect(saida.roteiro).toMatchObject({ programa: 'Por Você', capitulo: 19, selo: 'Com selo', duracaoAlvoSeg: 30, duracaoModo: 'max' });
    expect(saida.artes.map((a) => a.texto)).toEqual(['AMANHÃ', 'HOJE']);
    expect(saida.orientacoes.edicao.map((o) => o.texto)).toEqual(['Ilustrar com imagens de Tião entrando na estação (CAP 14 00:03:54)']);
  });

  it('uma frase que só cita um programa não vira cabeçalho', () => {
    const { saida } = importar(soltos('LOC: BELTRANA', 'MUDAR APENAS O JOGO DO BRASILEIRÃO. USAR A CHAMADA DO FUTEBOL DE 29/8 SP', 'HOJE TEM PROGRAMA.'), 'Vert_29_8.docx');
    expect(saida.texto.completo).toContain('MUDAR APENAS O JOGO');
    expect(saida.roteiro.locutor).toBe('BELTRANA');
  });
});

describe('vocabulário da casa', () => {
  it('a chave da claquete vale no começo do texto; nomes longos valem em qualquer ponto', async () => {
    const { acharPrograma, registrarVocabulario, programasConhecidos } = await import('../src/modelo/vocabularios');
    registrarVocabulario({
      programas: [
        { nome: 'É de Casa', chaves: ['CASA'] },
        { nome: 'A Nobreza do Amor', chaves: ['NOBREZA'] },
        { nome: 'Libertadores', chaves: ['FUT LIBERTA', 'LIBERTA'] },
        { nome: 'Futebol', chaves: ['FUT'] },
      ],
      redatores: [],
    });
    try {
      expect(acharPrograma('PGM: CASA 12/3 REDE')?.nome).toBe('É de Casa');
      expect(acharPrograma('HOJE TEM FESTA EM CASA 12/3')).toBeNull();
      expect(acharPrograma('FUT_LIBERTA_20_8_SP.docx'.replace(/[_.]+/g, ' '))?.nome).toBe('Libertadores');
      expect(acharPrograma('NOBREZA 7/9 cap 19')).toMatchObject({ nome: 'A Nobreza do Amor', tipo: 'novela' });
      expect(acharPrograma('Chamada de A Nobreza do Amor')?.nome).toBe('A Nobreza do Amor');
      expect(programasConhecidos().length).toBe(4);
    } finally {
      registrarVocabulario(null);
    }
  });
});

describe('o que a Arte precisa', () => {
  it('claquete vem do nome do arquivo, com a data em dd/mm; REDE é a praça G5', async () => {
    const { claqueteDoArquivo } = await import('../src/modelo/vocabularios');
    expect(claqueteDoArquivo('Passeio_No_Parque_11_07_Rede.docx')).toBe('PASSEIO NO PARQUE 11/07 REDE');
    expect(claqueteDoArquivo('SERTANEJO 2 20 9 SP.rtf')).toBe('SERTANEJO 2 20/9 SP');
    expect(claqueteDoArquivo('Chamada especial.pdf')).toBe('CHAMADA ESPECIAL');
    expect(claqueteDoArquivo('Festa_NaPraca26_10_Rede.docx')).toBe('FESTA NA PRACA 26/10 REDE');
    expect(claqueteDoArquivo('SP2_3_4.docx')).toBe('SP2 3/4');
    const { saida } = importar(soltos('HOJE TEM FESTA NA PRAÇA.'), 'Passeio_No_Parque_11_07_Rede.docx');
    expect(saida.roteiro).toMatchObject({ claquete: 'PASSEIO NO PARQUE 11/07 REDE', praca: 'G5', editor: '' });
  });
  it('o tipo da arte nunca é sugerido, nem pelo texto em volta ("GC:", "BATE LOGO")', () => {
    const { saida } = importar(soltos([{ t: 'VEM AÍ ' }, u('A GRANDE FESTA')], [{ t: 'GC: ' }, u('MARIA LUZ')], [u('SEXTA'), { t: ' TEM MAIS.' }]));
    expect(saida.artes.map((a) => [a.texto, a.subtipo])).toEqual([['A GRANDE FESTA', ''], ['MARIA LUZ', ''], ['SEXTA', '']]);
  });
  it('"depois de" sublinhado no fim dos dias vale para cada dia; o horário continua arte separada', () => {
    const { saida } = importar(soltos([u('SÁBADO/AMANHÃ/HOJE'), { t: ', ' }, u('LOGO APÓS O JORNAL DA NOITE'), { t: ' (' }, u('2:45'), { t: ').' }]));
    expect(saida.artes.map((a) => a.texto)).toEqual(['SÁBADO, LOGO APÓS O JORNAL DA NOITE', 'AMANHÃ, LOGO APÓS O JORNAL DA NOITE', 'HOJE, LOGO APÓS O JORNAL DA NOITE', '2:45']);
    expect(saida.artes.map((a) => a.ordem)).toEqual([1, 2, 3, 4]);
    expect(saida.roteiro.versoes).toEqual(['SÁBADO', 'AMANHÃ', 'HOJE']);
    // sem sublinhado, o complemento não entra
    const sem = importar(soltos([u('SÁBADO/HOJE'), { t: ', DEPOIS DA NOVELA.' }])).saida;
    expect(sem.artes.map((a) => a.texto)).toEqual(['SÁBADO', 'HOJE']);
  });
});

describe('claquete, praça e editor', () => {
  it('a chave da claquete segue a fórmula do Teable', async () => {
    const { chaveDaClaquete } = await import('../src/modelo/vocabularios');
    expect(chaveDaClaquete('Fut(Brasileirao)21/11 (N)')).toBe('FUT BRASILEIRAO 21 11');
    expect(chaveDaClaquete('Terra 20/11-2 (AH)')).toBe('TERRA 20 11 2');
    expect(chaveDaClaquete('S.Tarde 20/11 (H)')).toBe('S TARDE 20 11');
    expect(chaveDaClaquete('Rio Silva(Teaser)12/12 (MÊS)')).toBe('RIO SILVA TEASER 12 12');
    expect(chaveDaClaquete('F1(Las Vegas)21/11 (N) V2')).toBe('F1 LAS VEGAS 21 11');
    expect(chaveDaClaquete('LANÇAMENTO DONA DO PEDAÇO')).toBe('LANCAMENTO DONA DO PEDACO');
    expect(chaveDaClaquete('Rio(Vim De La)clip 14/11 AH')).toBe('RIO VIM DE LA CLIP 14 11 AH');
  });
  it('o editor vem da pauta, pela claquete; a praça, do começo ou do fim dela', async () => {
    const { registrarVocabulario, editorDaPauta, naPauta } = await import('../src/modelo/vocabularios');
    registrarVocabulario({ programas: [], redatores: [], editores: ['Fulano Silva'], pauta: [{ chave: 'FESTA NA PRACA 26 10', editor: 'Fulano Silva', claquete: 'Festa(Na Praca)26/10 (AH)' }] });
    try {
      expect(editorDaPauta('FESTA NA PRACA 26/10')).toBe('Fulano Silva');
      expect(editorDaPauta('FESTA NA PRACA 26/10 REDE')).toBe('Fulano Silva');
      expect(editorDaPauta('OUTRA COISA 1/1')).toBe('');
      // a grafia da pauta só vale quando a chave bate inteira
      expect(naPauta('FESTA NA PRACA 26/10').claquete).toBe('Festa(Na Praca)26/10 (AH)');
      expect(naPauta('FESTA NA PRACA 26/10 REDE').claquete).toBe('');
    } finally {
      registrarVocabulario(null);
    }
    expect(importar(soltos('TEXTO.'), 'Rio_Festa_Na_Praca_26_10.docx').saida.roteiro.praca).toBe('RJ');
    expect(importar(soltos('TEXTO.'), 'Festa_Na_Praca_26_10_SP.docx').saida.roteiro.praca).toBe('SP');
    expect(importar(soltos('TEXTO.'), 'Festa_Na_Praca_26_10.docx').saida.roteiro.praca).toBe('G5');
  });
});

describe('colar do Word', () => {
  it('o sublinhado vira arte; link e texto comum ficam como estão', async () => {
    const { prepararColagem } = await import('../src/editor/extensoes');
    const div = document.createElement('div');
    div.innerHTML = prepararColagem('<p>VEM AÍ <u>A GRANDE <b>FESTA</b></u>, <span style="text-decoration:underline">SÁBADO/HOJE</span> <a href="x"><u>link</u></a></p>');
    const artes = [...div.querySelectorAll('u.arte')].map((u) => [u.textContent, u.getAttribute('data-id'), u.getAttribute('data-grupo')]);
    expect(artes.map((a) => a[0])).toEqual(['A GRANDE ', 'FESTA', 'SÁBADO', 'HOJE']);
    expect(artes[0][1]).toBe(artes[1][1]); // partido pelo negrito, mas é a mesma arte
    expect(artes[2][1]).not.toBe(artes[3][1]);
    expect(artes[2][2]).toBeTruthy();
    expect(artes[2][2]).toBe(artes[3][2]); // versões do mesmo lugar
    div.innerHTML = prepararColagem('<p><u>\\\\servidor-exemplo\\PASTA\\ARQUIVO.mxf</u> e <u>https://exemplo.com.br/x</u> e <u>HOJE</u></p>');
    expect([...div.querySelectorAll('u.arte')].map((u) => u.textContent)).toEqual(['HOJE']);
  });
});

describe('correções da revisão geral', () => {
  it('barra só separa versões entre palavras; data sublinhada continua uma arte só', async () => {
    const { ehVersoes } = await import('../src/importar/interpretar');
    expect([ehVersoes('AMANHÃ/HOJE'), ehVersoes('AMANHÃ / HOJE'), ehVersoes('SÁBADO 15/11'), ehVersoes('2/3'), ehVersoes('HOJE')]).toEqual([true, true, false, false, false]);
    const { saida } = importar(soltos([u('SÁBADO 15/11'), { t: ' TEM ' }, u('AMANHÃ/HOJE')]));
    expect(saida.artes.map((a) => a.texto)).toEqual(['SÁBADO 15/11', 'AMANHÃ', 'HOJE']);
  });
  it('a data do nome do arquivo é o último par válido', () => {
    expect(importar(soltos('TEXTO.'), 'Festa_V2_26_10.docx').saida.roteiro.dataExibicao).toBe('2026-10-26');
  });
  it('etiqueta de tipo desconhecido não derruba a exportação', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nota estranha', marks: [{ type: 'etiqueta', attrs: { id: 'e1', tipo: 'xyz' } }] }] }] };
    const saida = exportar({ id: 't', meta: importar(soltos('x')).imp.meta, doc, revisao: 1, criadoEm: '', atualizadoEm: '' });
    expect(saida.comentarios.map((c) => c.texto)).toEqual(['nota estranha']);
  });
  it('arte copiada e colada aqui mesmo ganha identidade própria', async () => {
    const { prepararColagem } = await import('../src/editor/extensoes');
    const div = document.createElement('div');
    div.innerHTML = prepararColagem('<p><u class="arte" data-id="a1" data-grupo="g1">AMANHÃ</u>/<u class="arte" data-id="a2" data-grupo="g1">HOJE</u></p>');
    const [x, y] = [...div.querySelectorAll('u.arte')];
    expect([x.getAttribute('data-id'), y.getAttribute('data-id')]).not.toContain('a1');
    expect(x.getAttribute('data-id')).not.toBe(y.getAttribute('data-id'));
    expect(x.getAttribute('data-grupo')).toBe(y.getAttribute('data-grupo'));
    expect(x.getAttribute('data-grupo')).not.toBe('g1');
  });
});
