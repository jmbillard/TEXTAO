import { describe, expect, it } from 'vitest';
import { atualizarSequencia, montarSequencia, quadroNaRolagem } from '../src/filmes/sequencia';
import type { Conferencia, FilmeLido, PaginaDaPrevia } from '../src/dados/armazenamento';

/* A sequência de filmes do celular (#81): a regra pura que recebe a prévia aberta e devolve os filmes em ordem, um
   atrás do outro, sem paginar o PDF. */

const conf = (marca: Conferencia['marca'], pergunta?: Conferencia['pergunta']): Conferencia => ({
  marca, ...(pergunta ? { pergunta } : {}), filme: null, novo: false, ano: null, artes: { novas: [], existentes: [] },
});
const filme = (titulo: string, sessao: string, data: string, mais: Partial<FilmeLido> = {}): FilmeLido => ({
  titulo, ano: 2020, sessao, data, inedito: false, poster: null, conferencia: conf('ok'), ...mais,
});
const pagina = (numero: number, filmes: FilmeLido[], mais: Partial<PaginaDaPrevia> = {}): PaginaDaPrevia => ({
  numero, util: numero - 1, estado: 'lida', erro: '', filmes, sessoes: [], posteres: [], vagas: [], tamanho: null, ...mais,
});
const titulos = (paginas: PaginaDaPrevia[]) => montarSequencia(paginas).map((s) => s.filme.titulo);

describe('a sequência de filmes', () => {
  it('as sessões próprias por data, depois a Sessão da Tarde por data; no mesmo dia, a ordem da página', () => {
    const paginas = [
      pagina(2, [
        filme('TARDE DIA 9', 'SESSÃO DA TARDE', '09/12/2026'),
        filme('SUPERCINE DIA 6', 'SUPERCINE', '06/12/2026'),
        filme('TELA QUENTE DIA 8', 'TELA QUENTE', '08/12/2026'),
      ]),
      pagina(3, [
        filme('CORUJÃO DIA 8', 'CORUJÃO', '08/12/2026'),
        filme('TARDE DIA 2', 'Sessão da Tarde', '02/12/2026'),
        filme('SUPERCINE DIA 30/11', 'SUPERCINE', '30/11/2026'),
      ]),
      pagina(4, [filme('TELA QUENTE DIA 8 (OUTRA PÁGINA)', 'TELA QUENTE', '08/12/2026'), filme('TARDE DIA 9 (OUTRA PÁGINA)', 'SESSAO DA TARDE', '09/12/2026')]),
    ];
    expect(titulos(paginas)).toEqual([
      'SUPERCINE DIA 30/11',
      'SUPERCINE DIA 6',
      'TELA QUENTE DIA 8',
      'CORUJÃO DIA 8',
      'TELA QUENTE DIA 8 (OUTRA PÁGINA)',
      'TARDE DIA 2',
      'TARDE DIA 9',
      'TARDE DIA 9 (OUTRA PÁGINA)',
    ]);
  });

  it('pendente é a marca com pergunta (qual filme, ano, sessão) e o não achado; o pronto e o que está no Trello não são', () => {
    const seq = montarSequencia([
      pagina(2, [
        filme('QUAL FILME', 'SUPERCINE', '01/12/2026', { conferencia: conf('atencao', 'qual-filme') }),
        filme('QUAL ANO', 'SUPERCINE', '02/12/2026', { conferencia: conf('atencao', 'ano-diferente') }),
        filme('QUAL SESSÃO', '', '03/12/2026', { conferencia: conf('atencao', 'sessao'), subiu: true }),
        filme('NÃO ACHADO', 'SUPERCINE', '04/12/2026', { naoAchado: true, conferencia: conf('atencao', 'nao-achado'), envio: { estado: 'enviado' } }),
        filme('PRONTO', 'SUPERCINE', '05/12/2026'),
        filme('NO TRELLO', 'SUPERCINE', '06/12/2026', { conferencia: conf('trello') }),
        filme('SEM CONFERÊNCIA', 'SUPERCINE', '07/12/2026', { conferencia: undefined }),
      ]),
    ]);
    expect(seq.map((s) => [s.filme.titulo, s.pendente])).toEqual([
      ['QUAL FILME', true],
      ['QUAL ANO', true],
      ['QUAL SESSÃO', true],
      ['NÃO ACHADO', true],
      ['PRONTO', false],
      ['NO TRELLO', false],
      ['SEM CONFERÊNCIA', false],
    ]);
  });

  it('a vaga cancelada e as páginas que não foram lidas não entram', () => {
    const vaga = { caixa: { x: 10, y: 10, width: 100, height: 150 }, texto: 'CANCELADO' };
    const seq = montarSequencia([
      pagina(2, [filme('O ÚNICO', 'SUPERCINE', '01/12/2026')], { vagas: [vaga, vaga] }),
      pagina(3, [], { estado: 'lendo' }),
      pagina(4, [filme('DA PÁGINA COM ERRO', 'SUPERCINE', '01/12/2026')], { estado: 'erro', erro: 'a leitura respondeu 500' }),
    ]);
    expect(seq.map((s) => [s.numero, s.i, s.filme.titulo])).toEqual([[2, 0, 'O ÚNICO']]);
  });

  /* a página de 1000 × 600 e a janela de cima em 4:3: a página cabe pela largura, e sobra altura (1,25 da página) */
  const posteres = [
    { caixa: { x: 100, y: 150, width: 150, height: 225 } },
    { caixa: { x: 500, y: 300, width: 100, height: 150 } },
  ];
  const tamanho = { width: 1000, height: 600 };

  it('a caixa do pôster vai em proporção da página, e o enquadramento centra e amplia o pôster sem sair da página', () => {
    const [a, b] = montarSequencia(
      [pagina(2, [filme('NO CANTO', 'SUPERCINE', '01/12/2026', { poster: 0 }), filme('NO MEIO', 'SUPERCINE', '02/12/2026', { poster: 1 })], { posteres, tamanho })],
      4 / 3,
    );
    expect(a.caixa).toEqual({ x: 0.1, y: 0.25, width: 0.15, height: 0.375 });
    // o pôster ocupa dois terços da altura da janela; o centro encosta na borda esquerda da página, sem passar dela
    expect(a.enquadramento.zoom).toBeCloseTo(2.2222, 3);
    expect(a.enquadramento.x).toBeCloseTo(0.225, 3);
    expect(a.enquadramento.y).toBeCloseTo(0.4375, 3);
    // no meio da página, o centro é o do pôster
    expect(b.enquadramento.zoom).toBeCloseTo(3.3333, 3);
    expect(b.enquadramento.x).toBeCloseTo(0.55, 3);
    expect(b.enquadramento.y).toBeCloseTo(0.625, 3);
  });

  it('o filme sem pôster pega a página inteira e não é pendente por isso', () => {
    const seq = montarSequencia(
      [
        pagina(2, [filme('SEM PÔSTER', 'SUPERCINE', '01/12/2026'), filme('PÔSTER QUE SUMIU', 'SUPERCINE', '02/12/2026', { poster: 7 })], { posteres, tamanho }),
        pagina(3, [filme('PÁGINA SEM TAMANHO', 'SUPERCINE', '03/12/2026', { poster: 0 })], { posteres }),
      ],
      4 / 3,
    );
    expect(seq.map((s) => [s.filme.titulo, s.caixa, s.enquadramento, s.pendente])).toEqual([
      ['SEM PÔSTER', null, { x: 0.5, y: 0.5, zoom: 1 }, false],
      ['PÔSTER QUE SUMIU', null, { x: 0.5, y: 0.5, zoom: 1 }, false],
      ['PÁGINA SEM TAMANHO', null, { x: 0.5, y: 0.5, zoom: 1 }, false],
    ]);
  });

  it('a mudança durante a revisão atualiza o filme no lugar: nada muda de posição, e o que sai fica riscado', () => {
    const antes = [
      pagina(2, [
        filme('TARDE QUE SOBE', 'SESSÃO DA TARDE', '01/12/2026', { poster: 0, conferencia: conf('atencao', 'sessao') }),
        filme('O QUE SAI', 'SUPERCINE', '09/12/2026', { poster: 1, naoAchado: true, conferencia: conf('atencao', 'nao-achado') }),
        filme('SEM PÔSTER', 'CORUJÃO', '10/12/2026'),
      ], { posteres, tamanho }),
    ];
    const seq = montarSequencia(antes);
    expect(seq.map((s) => s.filme.titulo)).toEqual(['O QUE SAI', 'SEM PÔSTER', 'TARDE QUE SOBE']);
    // no computador, alguém sobe o da Tarde (e corrige o título), tira o não achado e a página lida de novo traz um novo
    const depois = [
      pagina(2, [
        filme('TARDE QUE SUBIU', 'SUPERCINE', '01/12/2026', { poster: 0, subiu: true, tituloLido: 'TARDE QUE SOBE' }),
        filme('SEM PÔSTER', 'CORUJÃO', '10/12/2026', { conferencia: conf('trello') }),
        filme('NOVO NA PÁGINA', 'TELA QUENTE', '02/12/2026'),
      ], { posteres, tamanho }),
    ];
    const nova = atualizarSequencia(seq, depois);
    expect(nova.map((s) => [s.filme.titulo, s.i, s.tarde, s.pendente, !!s.saiu])).toEqual([
      ['O QUE SAI', 1, false, true, true],
      ['SEM PÔSTER', 1, false, false, false],
      ['TARDE QUE SUBIU', 0, false, false, false],
      // o filme novo vai para o fim, sem empurrar ninguém
      ['NOVO NA PÁGINA', 2, false, false, false],
    ]);
  });

  it('a imagem acompanha a rolagem: desliza entre pôsteres da mesma página, esmaece entre páginas e, sem movimento, só esmaece', () => {
    const seq = montarSequencia(
      [
        pagina(2, [filme('A', 'SUPERCINE', '01/12/2026', { poster: 0 }), filme('B', 'SUPERCINE', '02/12/2026', { poster: 1 })], { posteres, tamanho }),
        pagina(3, [filme('C', 'SUPERCINE', '03/12/2026', { poster: 0 })], { posteres, tamanho }),
      ],
      4 / 3,
    );
    const [a, b] = seq.map((s) => s.enquadramento);
    // no meio do caminho entre A e B (a mesma página): o enquadramento é o do meio
    const meio = quadroNaRolagem(seq, 0.5, false);
    expect(meio).toMatchObject({ de: 0, para: 1, t: 0.5, modo: 'deslizar' });
    expect(meio.enquadramento.x).toBeCloseTo((a.x + b.x) / 2, 6);
    expect(meio.enquadramento.zoom).toBeCloseTo((a.zoom + b.zoom) / 2, 6);
    // entre B e C (outra página): esmaece
    expect(quadroNaRolagem(seq, 1.25, false)).toMatchObject({ de: 1, para: 2, t: 0.25, modo: 'esmaecer' });
    // sem movimento, até na mesma página
    expect(quadroNaRolagem(seq, 0.5, true)).toMatchObject({ de: 0, para: 1, modo: 'esmaecer' });
    // parado num filme, e além das pontas (o elástico do fim da rolagem)
    expect(quadroNaRolagem(seq, 1, false)).toMatchObject({ de: 1, para: 1, t: 0 });
    expect(quadroNaRolagem(seq, 2.4, false)).toMatchObject({ de: 2, para: 2, t: 0 });
    expect(quadroNaRolagem(seq, -0.3, false)).toMatchObject({ de: 0, para: 0, t: 0 });
  });
});
