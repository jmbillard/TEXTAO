import { describe, expect, it } from 'vitest';
import { fichasDoTexto } from '../src/modelo/trecho';

/* Timecodes e caminhos de rede no texto (#187): viram fichas sozinhos, para a edição achar o material. Caminhos e
   servidores inventados. */

const achados = (texto: string) => fichasDoTexto(texto).map((f) => [f.tipo, f.texto]);

describe('os timecodes do texto', () => {
  it('com quadros, com horas e com minutos e segundos', () => {
    expect(achados('Abre no 00:12:41:08, corta no 00:12:45.')).toEqual([['timecode', '00:12:41:08'], ['timecode', '00:12:45']]);
    expect(achados('A fala começa em 00:12 e vai até 01:05.')).toEqual([['timecode', '00:12'], ['timecode', '01:05']]);
  });

  it('"aos 1\'20\'\'": a ficha é o tempo, e o "aos" fica no texto', () => {
    expect(achados("A Dona Cida chora aos 1'20'' da entrevista.")).toEqual([['timecode', "1'20''"]]);
    expect(achados('Aos 12’05’’ entra a risada; aos 2\'3" o corte.')).toEqual([['timecode', '12’05’’'], ['timecode', '2\'3"']]);
  });

  it('a duração da chamada, o horário e a data não são timecode', () => {
    expect(achados("Fechar com 30''. Dura no máximo 1'20''.")).toEqual([]);
    expect(achados('Às 6:10, no dia 12/11/2026, versão 1.0.12.')).toEqual([]);
  });
});

describe('os arquivos da rede', () => {
  it('caminho do Windows, do Mac e smb://, até o espaço, sem a pontuação do fim da frase', () => {
    expect(achados('O bruto está em \\\\servidor-falso\\promo\\brasa\\BRUTO_01.mov.')).toEqual([['arquivo', '\\\\servidor-falso\\promo\\brasa\\BRUTO_01.mov']]);
    expect(achados('Pasta: /Volumes/PROMO/Brasa/2026, e o resto em smb://nas-falso/promo/brasa/trilhas.')).toEqual([
      ['arquivo', '/Volumes/PROMO/Brasa/2026'],
      ['arquivo', 'smb://nas-falso/promo/brasa/trilhas'],
    ]);
    expect(achados('(ver \\\\servidor-falso\\promo\\)')).toEqual([['arquivo', '\\\\servidor-falso\\promo\\']]);
  });

  it('o nome do arquivo de vídeo ou de som, sozinho', () => {
    expect(achados('Usar CENA_12.MOV, o 0412_entrevista.mxf e a trilha forro-final.wav!')).toEqual([
      ['arquivo', 'CENA_12.MOV'],
      ['arquivo', '0412_entrevista.mxf'],
      ['arquivo', 'forro-final.wav'],
    ]);
    // o site e o documento não são material da edição
    expect(achados('Veja em globo.com ou no roteiro.docx.')).toEqual([]);
  });

  it('o timecode dentro do caminho é parte do arquivo', () => {
    expect(achados('/Volumes/PROMO/BL01_00:12:41.mov aos 1\'20\'\'')).toEqual([['arquivo', '/Volumes/PROMO/BL01_00:12:41.mov'], ['timecode', "1'20''"]]);
  });
});
