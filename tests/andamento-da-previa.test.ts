import { describe, expect, it } from 'vitest';
import { andamentoDaPrevia, haFilmeParaRevisar, paginasNaSubida, resumoDaSubida, subidaTerminada } from '../src/filmes/andamento';
import type { Conferencia, FilmeLido, PaginaDaPrevia } from '../src/dados/armazenamento';

/* O andamento da prévia na entrada do celular (#80): o que a ficha conta e o estado de cada página na subida. */

const conf = (marca: Conferencia['marca'], pergunta?: Conferencia['pergunta']): Conferencia => ({
  marca, ...(pergunta ? { pergunta } : {}), filme: null, novo: false, ano: null, artes: { novas: [], existentes: [] },
});
const filme = (c?: Conferencia, envio?: FilmeLido['envio']): FilmeLido => ({
  titulo: 'FILME FICTÍCIO', ano: 2020, sessao: 'SUPERCINE', data: '05/12/2026', inedito: false, poster: null,
  ...(c ? { conferencia: c } : {}), ...(envio ? { envio } : {}),
});
const pagina = (numero: number, estado: PaginaDaPrevia['estado'], filmes: FilmeLido[] = []): PaginaDaPrevia => ({
  numero, util: numero - 1, estado, erro: estado === 'erro' ? 'a leitura respondeu 500' : '', filmes, sessoes: [], posteres: [], vagas: [], tamanho: null,
});

describe('andamento da prévia', () => {
  it('conta as páginas lidas, os prontos, os com pergunta e os que já estão no Trello', () => {
    const a = andamentoDaPrevia([
      pagina(2, 'lida', [filme(conf('ok')), filme(conf('ok')), filme(conf('atencao', 'qual-filme')), filme(conf('trello'))]),
      pagina(3, 'lida', [filme(conf('atencao', 'nao-achado')), filme(conf('ok'))]),
      pagina(4, 'lendo'),
    ]);
    expect(a).toEqual({ lidas: 2, total: 3, prontos: 3, pergunta: 2, trello: 1 });
  });

  it('o que deu erro no envio continua pronto (vai no próximo Enviar); o que está indo conta como no Trello', () => {
    const a = andamentoDaPrevia([
      pagina(2, 'lida', [
        filme(conf('ok'), { estado: 'erro', erro: 'o Trello não respondeu' }),
        filme(conf('ok'), { estado: 'enviando' }),
      ]),
    ]);
    expect(a).toMatchObject({ prontos: 1, trello: 1 });
  });

  it('sem a conferência com o banco, o filme não conta como pronto nem como pergunta', () => {
    expect(andamentoDaPrevia([pagina(2, 'lida', [filme(), filme()])])).toEqual({ lidas: 1, total: 1, prontos: 0, pergunta: 0, trello: 0 });
  });
});

describe('as páginas na subida', () => {
  it('sem subida nesta tela, cada página mostra o estado do servidor; a que não chegou pede o mesmo PDF de novo', () => {
    const ps = paginasNaSubida(
      [pagina(2, 'lida', [filme(), filme(), filme()]), pagina(3, 'lendo'), pagina(4, 'fila'), pagina(5, 'esperando'), pagina(6, 'erro')],
      null,
    );
    expect(ps.map((p) => [p.numero, p.estado, p.texto])).toEqual([
      [2, 'lida', 'lida · 3 filmes'],
      [3, 'lendo', 'lendo com a IA…'],
      [4, 'fila', 'na fila da leitura'],
      [5, 'falta', 'não chegou: suba o mesmo PDF'],
      [6, 'erro', 'a leitura deu erro'],
    ]);
  });

  it('durante a subida, a página que ainda não chegou passa por preparando e subindo; a que subiu já está na fila', () => {
    const ps = paginasNaSubida(
      [pagina(2, 'esperando'), pagina(3, 'esperando'), pagina(4, 'esperando'), pagina(5, 'esperando')],
      { 2: 'subiu', 3: 'subindo', 4: 'preparando' },
    );
    expect(ps.map((p) => [p.numero, p.estado, p.texto])).toEqual([
      [2, 'fila', 'na fila da leitura'],
      [3, 'subindo', 'subindo'],
      [4, 'preparando', 'preparando no navegador'],
      [5, 'esperando', 'esperando a vez'],
    ]);
  });

  it('subir o mesmo PDF de novo: as páginas que já chegaram seguem o servidor, as que faltam sobem', () => {
    const ps = paginasNaSubida([pagina(2, 'lida', [filme()]), pagina(3, 'esperando')], { 3: 'preparando' });
    expect(ps.map((p) => [p.estado, p.texto])).toEqual([
      ['lida', 'lida · 1 filme'],
      ['preparando', 'preparando no navegador'],
    ]);
  });
});

describe('o resumo da subida', () => {
  const com = (...estados: PaginaDaPrevia['estado'][]) => estados.map((e, k) => pagina(k + 2, e));

  it('enquanto alguma página está no navegador, diz qual está sendo preparada; ainda não dá para fechar a aba', () => {
    const r = resumoDaSubida(paginasNaSubida(com('esperando', 'esperando', 'esperando'), { 2: 'subiu', 3: 'subindo' }));
    expect(r).toEqual({ texto: 'Preparando a página 2 de 3', podeFechar: false });
  });

  it('tudo no servidor e ainda lendo: quantas foram lidas, e já dá para fechar a aba', () => {
    const r = resumoDaSubida(paginasNaSubida(com('lida', 'lendo', 'fila'), null));
    expect(r).toEqual({ texto: 'Lendo no servidor · 1 de 3 lidas', podeFechar: true });
  });

  it('a página que não chegou: quantas faltam subir', () => {
    expect(resumoDaSubida(paginasNaSubida(com('lida', 'esperando', 'esperando'), null))).toEqual({
      texto: 'Faltam 2 páginas: suba o mesmo PDF', podeFechar: false,
    });
    expect(resumoDaSubida(paginasNaSubida(com('lida', 'esperando'), null)).texto).toBe('Falta 1 página: suba o mesmo PDF');
  });

  it('tudo lido (ou com erro): a conta das lidas', () => {
    expect(resumoDaSubida(paginasNaSubida(com('lida', 'lida'), null))).toEqual({ texto: '2 de 2 páginas lidas', podeFechar: false });
    expect(resumoDaSubida(paginasNaSubida(com('lida', 'erro'), null)).texto).toBe('1 de 2 páginas lidas · 1 com erro');
  });
});

describe('a subida terminou', () => {
  it('quando toda página foi lida ou deu erro; a que falta subir ou ainda está na leitura não terminou', () => {
    expect(subidaTerminada([pagina(2, 'lida'), pagina(3, 'erro')])).toBe(true);
    expect(subidaTerminada([pagina(2, 'lida'), pagina(3, 'lendo')])).toBe(false);
    expect(subidaTerminada([pagina(2, 'lida'), pagina(3, 'esperando')])).toBe(false);
    // a prévia que acabou de ser criada ainda não tem página nenhuma lida
    expect(subidaTerminada([])).toBe(false);
  });
});

describe('há filme para revisar (#156): a bolinha junto de Filmes, no topo', () => {
  it('laranja enquanto alguma prévia não está toda enviada', () => {
    expect(haFilmeParaRevisar([{ paginas: 4, diasParaApagar: 12 }, { paginas: 2, diasParaApagar: null }])).toBe(true);
  });
  it('neutra sem prévia, com todas enviadas, com a prévia sem página e com o servidor que não diz', () => {
    expect(haFilmeParaRevisar([])).toBe(false);
    expect(haFilmeParaRevisar([{ paginas: 4, diasParaApagar: 0 }, { paginas: 1, diasParaApagar: 60 }])).toBe(false);
    expect(haFilmeParaRevisar([{ paginas: 0, diasParaApagar: null }])).toBe(false);
    expect(haFilmeParaRevisar([{ paginas: 3 }])).toBe(false);
  });
  it('laranja com a prévia que chegou por e-mail e espera a preparação (#157), mesmo sem página', () => {
    expect(haFilmeParaRevisar([{ paginas: 0, diasParaApagar: null, porPreparar: true }])).toBe(true);
    expect(haFilmeParaRevisar([{ paginas: 4, diasParaApagar: 12 }, { paginas: 0, diasParaApagar: null, porPreparar: true }])).toBe(true);
  });
});
