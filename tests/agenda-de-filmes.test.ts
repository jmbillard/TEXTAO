import { describe, expect, it } from 'vitest';
import { SEM_SESSAO, buscarNaAgenda, caminhoNoSistema, formaDaAgenda, porData, porSessao, quandoPassa, recusaDaFormaDaAgenda, semanaDosFilmes, somarDias, type ExibicaoDoFilme, type FilmeDaAgenda } from '../src/modelo/agendaDeFilmes';

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

describe('a semana da agenda de filmes (#182)', () => {
  it('sete dias a partir de ontem, como a agenda No Trello, com os dias sem filme e o que já passou', () => {
    const s = semanaDosFilmes(FILMES, HOJE, -1);
    expect(s.dias.map((d) => d.dia)).toEqual(['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    // ontem (já passou) fica, com o que passou
    expect(s.dias[0].itens.map((x) => x.exibicao.id)).toEqual(['a1']);
    expect(s.dias[1].itens).toEqual([]);
    expect(s.dias[2].itens.map((x) => x.exibicao.id)).toEqual(['b1', 'c1', 'a2']);
    expect(s.exibicoes).toBe(5);
    expect(s.ineditas).toBe(0);
  });

  it('a semana seguinte e a anterior; as inéditas contam no resumo', () => {
    const comInedito = [filme('recD', 'Ilha do Vento', [ex('d1', '2026-12-04', 'Supercine', { inedito: true }), ex('d2', '2026-11-19', 'Supercine')])];
    const seguinte = semanaDosFilmes([...FILMES, ...comInedito], HOJE, 6);
    expect(seguinte.dias[0].dia).toBe('2026-12-03');
    expect(seguinte.dias.flatMap((d) => d.itens.map((x) => x.exibicao.id))).toEqual(['a3', 'd1']);
    expect(seguinte).toMatchObject({ exibicoes: 2, ineditas: 1 });
    expect(semanaDosFilmes(comInedito, HOJE, -8).dias.flatMap((d) => d.itens.map((x) => x.exibicao.id))).toEqual(['d2']);
  });

  it('o dia diante de hoje e a soma de dias na virada do mês', () => {
    expect([quandoPassa('2026-11-26', HOJE), quandoPassa(HOJE, HOJE), quandoPassa('2026-11-28', HOJE)]).toEqual(['passou', 'hoje', 'vai-passar']);
    expect(somarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('a busca da agenda de filmes (#182)', () => {
  it('pelo título, sem diferença de caixa e acento, em todas as semanas, em ordem de dia', () => {
    expect(buscarNaAgenda(FILMES, 'viagem').map((x) => x.exibicao.id)).toEqual(['a1', 'a2', 'a3']);
    expect(buscarNaAgenda(FILMES, 'CORRIDA no gélo').map((x) => x.exibicao.id)).toEqual(['b1', 'b2']);
  });

  it('pela sessão e pelo ano; todas as palavras têm de estar', () => {
    expect(buscarNaAgenda(FILMES, 'corujao').map((x) => x.exibicao.id)).toEqual(['b1', 'a3']);
    expect(buscarNaAgenda(FILMES, 'sessão da tarde').map((x) => x.exibicao.id)).toEqual(['c1']);
    expect(buscarNaAgenda(FILMES, '2020 farol corujão').map((x) => x.exibicao.id)).toEqual(['a3']);
    expect(buscarNaAgenda(FILMES, 'farol gelo')).toEqual([]);
  });

  it('sem termo (ou só espaços e pontuação), nada', () => {
    expect(buscarNaAgenda(FILMES, '')).toEqual([]);
    expect(buscarNaAgenda(FILMES, '  · ')).toEqual([]);
  });
});
