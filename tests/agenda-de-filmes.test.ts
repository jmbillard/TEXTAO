import { describe, expect, it } from 'vitest';
import { SEM_SESSAO, caminhoNoSistema, formaDaAgenda, porData, porSessao, recusaDaFormaDaAgenda, type ExibicaoDoFilme, type FilmeDaAgenda } from '../src/filmes/agenda';

/* A agenda de filmes da aba Filmes (#169): os filmes agrupados por data de exibição ou por sessão. Títulos inventados. */

const HOJE = '2026-11-27';
const ex = (id: string, dia: string, sessao: string, o: Partial<ExibicaoDoFilme> = {}): ExibicaoDoFilme => ({ id, dia, hora: null, sessao, inedito: false, trello: null, producao: null, ...o });
const filme = (id: string, titulo: string, exibicoes: ExibicaoDoFilme[]): FilmeDaAgenda => ({
  id,
  titulo,
  ano: 2020,
  pasta: titulo.toUpperCase(),
  projeto: { win: `P:\\${titulo}`, mac: `/Volumes/P/${titulo}` },
  output: { win: '', mac: '' },
  poster: null,
  exibicoes,
});

const FILMES = [
  filme('recA', 'Viagem ao Farol', [ex('a1', '2026-11-26', 'Tela Quente'), ex('a2', '2026-11-28', 'Tela Quente'), ex('a3', '2026-12-03', 'Corujão', { hora: '01:10' })]),
  filme('recB', 'Corrida no Gelo', [ex('b1', '2026-11-28', 'Corujão', { hora: '23:50' }), ex('b2', '2026-11-29', '')]),
  filme('recC', 'Noite Antiga', [ex('c1', '2026-11-28', 'Sessão da Tarde')]),
];

describe('a agenda de filmes (#169)', () => {
  it('por data: os dias com filme, de hoje em diante; no dia, os com hora primeiro, depois pela sessão', () => {
    const dias = porData(FILMES, HOJE);
    expect(dias.map((d) => d.dia)).toEqual(['2026-11-28', '2026-11-29', '2026-12-03']);
    expect(dias[0].itens.map((x) => x.exibicao.id)).toEqual(['b1', 'c1', 'a2']);
  });

  it('por sessão: uma faixa por sessão, na ordem da próxima exibição; a sem sessão por último', () => {
    const faixas = porSessao(FILMES, HOJE);
    expect(faixas.map((f) => f.sessao)).toEqual(['Corujão', 'Sessão da Tarde', 'Tela Quente', SEM_SESSAO]);
    expect(faixas[0].itens.map((x) => x.exibicao.id)).toEqual(['b1', 'a3']);
    // o que já passou fica de fora
    expect(faixas[2].itens.map((x) => x.exibicao.id)).toEqual(['a2']);
  });

  it('a forma lembrada: por data sem escolha; só "data" e "sessao" valem', () => {
    expect(formaDaAgenda({})).toBe('data');
    expect(formaDaAgenda({ 'filmes.agenda': 'sessao' })).toBe('sessao');
    expect(formaDaAgenda({ 'filmes.agenda': 'outra' })).toBe('data');
    expect(recusaDaFormaDaAgenda('sessao')).toBeNull();
    expect(recusaDaFormaDaAgenda('quadro')).toMatch(/desconhecida/);
  });

  it('o caminho no sistema da pessoa, com o outro quando falta', () => {
    expect(caminhoNoSistema({ win: 'P:\\X', mac: '/Volumes/P/X' }, true)).toBe('/Volumes/P/X');
    expect(caminhoNoSistema({ win: 'P:\\X', mac: '' }, true)).toBe('P:\\X');
    expect(caminhoNoSistema({ win: '', mac: '/Volumes/P/X' }, false)).toBe('/Volumes/P/X');
  });
});
