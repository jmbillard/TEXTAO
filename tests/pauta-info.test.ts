import { describe, expect, it } from 'vitest';
import { buscarNaPauta, colunasDoDia, ehInfo, gradeDaSemana, linhaDaPauta, resumoDaPauta, tipoDaLinha, type LinhaDaPauta } from '../src/modelo/pauta';

/* A info da pauta (#172): a linha que não é claquete nem aviso marcado no Teable, mas um recado, uma orientação ou uma
   transformação para o editor ("TRANSFORMAR DA A B", "REDATOR VAI ACOMPANHAR"), não é tarefa. A tarefa é trabalho que
   ocupa o editor (COMUNICAÇÃO, CALHAUS, PROJETO CALHAUS, uma peça sem data). A regra: a info começa por um verbo (ou
   tem "vai", "vem", "deve" logo depois do sujeito) ou por uma palavra que continua uma frase; o resto é tarefa. A info
   vai com a claquete de antes, na mesma posição; sem claquete antes, fica na posição. Nomes inventados. */

describe('a info e a tarefa', () => {
  it.each(['TRANSFORMAR DA A B', 'TRANSFORMA DA N', 'REDATOR VAI ACOMPANHAR', 'PROMO VAI INDICAR QUAIS PEÇAS', 'CONTINUAR', 'ENTRA SÁBADO', 'ENTRA DIA 4', 'VIRA B - TROCA 1 LUTADOR', 'INSERIR A SONOPLASTIA', 'DEVEMOS EDITAR SEGUNDO A', 'COLOCAR NO PA', 'CONFIRMAR FORMATO DE EXPORTAÇÃO', 'INFORMAÇÕES COM BETO', 'DA ANA PRADO', 'Transformar da N', 'REDUZ DA Festa Junina Teaser'])('"%s" é info', (texto) => {
    expect(ehInfo(texto)).toBe(true);
    expect(tipoDaLinha(texto, null)).toBe('info');
  });

  it.each(['COMUNICAÇÃO', 'CALHAUS', 'PROJETO CALHAUS', 'LANÇAMENTO NOVELA SOL 2', 'VT FESTIVAL VEM AÍ 2030', 'Vt Novelas 2030', 'Premio 2030 Ch Pgm Local G5', 'Novelas(Geral)', 'Festa Junina(Telao)classicos', 'MISSÃO PREMIO', 'PREMIAÇÃO', 'NOVA'])('"%s" é tarefa', (texto) => {
    expect(ehInfo(texto)).toBe(false);
    expect(tipoDaLinha(texto, null)).toBe('tarefa');
  });

  it('a claquete continua claquete, e a caixinha de anotação continua aviso', () => {
    expect(tipoDaLinha('Festa da Vila 28/11 (AH)', null)).toBe('claquete');
    expect(tipoDaLinha('TRANSFORMAR DA N B V2', true)).toBe('aviso');
    expect(tipoDaLinha('COMUNICAÇÃO', true)).toBe('aviso');
  });

  it('a info lida do Teable não tem versões', () => {
    const l = linhaDaPauta({ id: 'r1', claquete: 'TRANSFORMAR DA A B', editor: { id: 'recX', title: 'Rita Fontes' }, data: '2026-11-27T03:00:00.000Z' });
    expect(l).toMatchObject({ tipo: 'info', texto: 'TRANSFORMAR DA A B', versoes: [], semVersao: 'TRANSFORMAR DA A B' });
  });
});

let n = 0;
const linha = (texto: string, editor = 'Rita Fontes', dia = '2026-11-27', anotacao: unknown = null): LinhaDaPauta =>
  linhaDaPauta({ id: `r${++n}`, claquete: texto, editor: editor ? { id: `rec${editor}`, title: editor } : null, data: `${dia}T03:00:00.000Z`, expediente_inicio: `${dia}T09:00:00.000Z`, expediente_fim: `${dia}T18:00:00.000Z`, anotacao })!;
const textos = (ls: readonly LinhaDaPauta[]) => ls.map((l) => [l.texto, l.infos ?? []]);

describe('a info na posição', () => {
  // a forma da pauta real: a claquete, o aviso marcado, outra claquete e a instrução dela
  const posicao = [linha('Bola Cheia(Final)29/11 B (AH)'), linha('TRANSFORMAR DA N B V2', 'Rita Fontes', '2026-11-27', true), linha('Futebol Amistoso 29/11 B (H)'), linha('TRANSFORMAR DA A B')];

  it('vai com a claquete de antes (o aviso marcado no meio não conta), e sai das claquetes e tarefas', () => {
    const [c] = colunasDoDia(posicao);
    expect(textos(c.itens)).toEqual([
      ['Bola Cheia(Final)29/11 B (AH)', []],
      ['Futebol Amistoso 29/11 B (H)', ['TRANSFORMAR DA A B']],
    ]);
    expect(c.infos).toEqual([]);
    expect(c.avisos.map((l) => l.texto)).toEqual(['TRANSFORMAR DA N B V2']);
  });

  it('sem claquete antes (no começo, ou depois de uma tarefa), fica na posição; as seguidas vão juntas', () => {
    const [c] = colunasDoDia([linha('REDATOR VAI ACOMPANHAR'), linha('MISSÃO PREMIO'), linha('PROMO VAI INDICAR QUAIS PEÇAS'), linha('Festa da Vila 28/11 (AH)'), linha('ENTRA SÁBADO'), linha('VIRA B - TROCA 1 LUTADOR')]);
    expect(textos(c.itens)).toEqual([
      ['MISSÃO PREMIO', []],
      ['Festa da Vila 28/11 (AH)', ['ENTRA SÁBADO', 'VIRA B - TROCA 1 LUTADOR']],
    ]);
    expect(c.infos).toEqual(['REDATOR VAI ACOMPANHAR', 'PROMO VAI INDICAR QUAIS PEÇAS']);
  });

  it('a frase partida em duas linhas volta a ser uma ("... SEGUNDO A" e "PREMIAÇÃO"; "... E" e "DA ...")', () => {
    const [c] = colunasDoDia([linha('MISSÃO PREMIO'), linha('DEVEMOS EDITAR SEGUNDO A'), linha('PREMIAÇÃO'), linha('Festa da Vila 28/11 (AH)'), linha('DAR UM TAPA NA COR PARA AVALIAÇÃO E'), linha('DA ANA PRADO'), linha('INSERIR A SONOPLASTIA')]);
    expect(textos(c.itens)).toEqual([
      ['MISSÃO PREMIO', []],
      ['Festa da Vila 28/11 (AH)', ['DAR UM TAPA NA COR PARA AVALIAÇÃO E DA ANA PRADO', 'INSERIR A SONOPLASTIA']],
    ]);
    expect(c.infos).toEqual(['DEVEMOS EDITAR SEGUNDO A PREMIAÇÃO']);
  });

  it('na Semana, a célula do editor no dia separa igual', () => {
    const [f] = gradeDaSemana({ dias: ['2026-11-27'], editores: ['Rita Fontes'], linhas: [linha('COLOCAR NO PA'), ...posicao] });
    expect(textos(f.celulas[0].itens).map(([t, i]) => [t, i])).toEqual([
      ['Bola Cheia(Final)29/11 B (AH)', []],
      ['Futebol Amistoso 29/11 B (H)', ['TRANSFORMAR DA A B']],
    ]);
    expect(f.celulas[0].infos).toEqual(['COLOCAR NO PA']);
  });

  it('não conta como linha sem editor no resumo, e a busca não a devolve', () => {
    const ls = [linha('CALHAUS', ''), linha('REDATOR VAI ACOMPANHAR', '')];
    expect(resumoDaPauta(ls, null).semEditor).toBe(1);
    expect(buscarNaPauta([linha('REDATOR VAI ACOMPANHAR')], 'redator')).toEqual([]);
  });
});
