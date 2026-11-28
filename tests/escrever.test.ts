import { describe, expect, it } from 'vitest';
import { barraNoTexto, CICLO_DOS_TIPOS, COMANDOS_DA_BARRA, comandosQueBatem, contagemDoTexto, duracaoLegivel, nomeDoArquivo, TIPOS_DO_TRECHO, tipoVizinho } from '../src/modelo/trecho';
import type { NoJSON } from '../src/modelo/tipos';

/* Escrever na folha (#190): o "/" e o menu que filtra, o Tab que troca o tipo, os números do rodapé e o nome curto da
   ficha do arquivo. Regras puras; o editor só chama. Textos inventados. */

const par = (texto: string, attrs?: Record<string, unknown>): NoJSON => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: texto ? [{ type: 'text', text: texto }] : [] });
const doc = (...ps: NoJSON[]): NoJSON => ({ type: 'doc', content: ps });

describe('o "/" no texto', () => {
  it('abre no começo do trecho ou depois de um espaço, com o que se digitou depois dele', () => {
    expect(barraNoTexto('/')).toBe('');
    expect(barraNoTexto('/lo')).toBe('lo');
    expect(barraNoTexto('NESTE SÁBADO /loc')).toBe('loc');
    expect(barraNoTexto('a brasa /locação')).toBe('locação');
  });

  it('não abre no meio de uma data, de um caminho ou de uma palavra, nem depois de um espaço digitado no comando', () => {
    expect(barraNoTexto('no dia 3/11')).toBeNull();
    expect(barraNoTexto('smb://srv')).toBeNull();
    expect(barraNoTexto('e/ou')).toBeNull();
    expect(barraNoTexto('/lo cu')).toBeNull();
    expect(barraNoTexto('/Volumes/PROMO')).toBeNull();
    expect(barraNoTexto('')).toBeNull();
  });
});

describe('o menu do "/"', () => {
  it('tem os doze comandos da spec, na ordem', () => {
    expect(COMANDOS_DA_BARRA.map((c) => c.id)).toEqual(['locucao', 'arte', 'sonora', 'edicao', 'trilha', 'locutor', 'producao', 'locacao', 'comentario', 'timecode', 'arquivo', 'texto']);
  });

  it('todo tipo do trecho tem o seu comando', () => {
    const comTipo = COMANDOS_DA_BARRA.flatMap((c) => (c.tipo ? [c.tipo] : []));
    expect([...comTipo].sort()).toEqual([...TIPOS_DO_TRECHO].sort());
  });

  it('filtra pelo começo do comando e pelo nome, sem caixa e sem acento; o que começa vem antes', () => {
    expect(comandosQueBatem('lo').map((c) => c.id)).toEqual(['locucao', 'locutor', 'locacao']);
    expect(comandosQueBatem('LOCAÇ').map((c) => c.id)).toEqual(['locacao']);
    expect(comandosQueBatem('edi').map((c) => c.id)).toEqual(['edicao']);
    expect(comandosQueBatem('rede').map((c) => c.id)).toEqual(['arquivo']);
    expect(comandosQueBatem('').length).toBe(12);
    expect(comandosQueBatem('xyz')).toEqual([]);
  });
});

describe('o Tab troca o tipo', () => {
  it('anda no ciclo, para a frente e para trás, dando a volta', () => {
    expect(tipoVizinho('locucao', 1)).toBe('arte');
    expect(tipoVizinho('locucao', -1)).toBe('texto');
    expect(tipoVizinho('texto', 1)).toBe('locucao');
    expect(new Set(CICLO_DOS_TIPOS)).toEqual(new Set(TIPOS_DO_TRECHO));
  });
});

describe('os números do rodapé', () => {
  it('as palavras, as da locução e o tempo de leitura (locução e a fala das sonoras)', () => {
    const c = contagemDoTexto(
      doc(
        par('Galpão da final', { tipo: 'locacao', confirmado: true }),
        par('Neste sábado, a brasa decide.', { tipo: 'locucao', confirmado: true }),
        par('Dona Zélia, de Pelotas: Aqui ninguém leva carne crua 00:12:41:08', { tipo: 'sonora', confirmado: false }),
        par('Abre no fogo acendendo.', { tipo: 'edicao', confirmado: true }),
        par('OITO CHURRASQUEIROS, UM SÓ TÍTULO.'),
      ),
    );
    // o timecode é ficha, não palavra
    expect(c.palavras).toBe(3 + 5 + 9 + 4 + 5);
    // a locução confirmada e a adivinhada pelo texto (caixa alta)
    expect(c.locucao).toBe(10);
    // 10 palavras de locução a 2,6 por segundo e 5 da fala (sem o "Nome, de onde:" e sem o timecode) a 3 por segundo
    expect(c.segundos).toBe(Math.round(10 / 2.6 + 5 / 3));
  });

  it('a folha vazia é zero', () => {
    expect(contagemDoTexto(doc(par('')))).toEqual({ palavras: 0, locucao: 0, segundos: 0 });
  });

  it('o tempo legível, como o do rodapé da revisão', () => {
    expect(duracaoLegivel(12)).toBe('12s');
    expect(duracaoLegivel(60)).toBe('1min');
    expect(duracaoLegivel(75)).toBe('1min15s');
  });
});

describe('a ficha do arquivo', () => {
  it('mostra o nome do arquivo, sem as pastas', () => {
    expect(nomeDoArquivo('\\\\srv-promo\\brutos\\DESAFIO\\CAM_A_014.mxf')).toBe('CAM_A_014.mxf');
    expect(nomeDoArquivo('/Volumes/PROMO/trilhas/tema_v3.wav')).toBe('tema_v3.wav');
    expect(nomeDoArquivo('smb://srv/brutos/')).toBe('brutos');
    expect(nomeDoArquivo('CAM_B_002.mov')).toBe('CAM_B_002.mov');
  });
});
