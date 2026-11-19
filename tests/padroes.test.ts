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
    expect(saida.artes.map((a) => [a.texto, a.subtipo])).toEqual([['CARTELA DO PROGRAMA VIVER SERTANEJO', 'tela_cheia']]);
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
    expect(saida.artes.map((a) => [a.texto, a.subtipo])).toEqual([['DEPOIS DA NOVELA', 'lettering']]);
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
