import { describe, expect, it } from 'vitest';
import { atracaoParecida, atracoesParecidas, claqueteNoPadrao, parDeFichas, propostaDaClaquete } from '../src/modelo/correcaoDeGrafia';
import { cruzarComAProducao, linhaDaPauta, lerVersoes, type ProducaoNaPauta } from '../src/modelo/pauta';
import { duplicadasDaProducao, type LinhaDaProducao } from '../src/modelo/duplicadas';

/* A correção de grafia da pauta da edição (#114): o código de versão no fim da claquete passa para o padrão, uma letra
   por versão, maiúscula, entre parênteses, no fim e na ordem escrita (DIA vira D, MES e MÊS viram M, MNT continua
   inteiro). Só o código muda. Claquetes fictícias. */

const para = (claquete: string) => {
  const p = propostaDaClaquete(claquete);
  return p?.tipo === 'corrigir' ? p.para : p;
};

describe('propostaDaClaquete: a grafia fora do padrão vai para o padrão', () => {
  it('minúsculas sem parênteses viram maiúsculas entre parênteses', () => {
    expect(propostaDaClaquete('Show da Tarde 4/12 Dp')).toEqual({ tipo: 'corrigir', de: 'Show da Tarde 4/12 Dp', para: 'Show da Tarde 4/12 (DP)' });
  });
});

describe('lerVersoes: a letra M é "em <mês>"', () => {
  it('sozinha e combinada, como as outras letras', () => {
    expect(lerVersoes('Festival 3/1 (M)', '2026-12-20').versoes).toEqual([{ codigo: 'M', rotulo: 'em janeiro', conhecida: true }]);
    expect(lerVersoes('Festival 3/1 (MA)', '2026-12-20').versoes.map((v) => v.rotulo)).toEqual(['em janeiro', 'amanhã']);
    expect(lerVersoes('Festival 3/1 m', '2026-12-20').versoes.map((v) => v.rotulo)).toEqual(['em janeiro']);
  });

  it('repetida não é combinação', () => {
    expect(lerVersoes('Festival 3/1 (MM)', '2026-12-20').versoes).toEqual([{ codigo: 'MM', rotulo: 'MM', conhecida: false }]);
  });
});

describe('propostaDaClaquete: cada letra', () => {
  it.each(['A', 'H', 'N', 'P', 'D', 'M'])('%s em minúscula vira maiúscula', (letra) => {
    expect(para(`Novela Sol 28/11 (${letra.toLowerCase()})`)).toBe(`Novela Sol 28/11 (${letra})`);
  });

  it.each(['A', 'H', 'N', 'P', 'D', 'M'])('(%s) já está no padrão', (letra) => {
    expect(propostaDaClaquete(`Novela Sol 28/11 (${letra})`)).toBeNull();
  });
});

describe('propostaDaClaquete: os códigos inteiros', () => {
  it('DIA vira (D), em qualquer caixa', () => {
    expect(para('Show da Tarde 28/11 (DIA)')).toBe('Show da Tarde 28/11 (D)');
    expect(para('Show da Tarde 28/11 (Dia)')).toBe('Show da Tarde 28/11 (D)');
  });

  it('MES e MÊS viram (M), com ou sem acento', () => {
    expect(para('Festival 3/1 (MES)')).toBe('Festival 3/1 (M)');
    expect(para('Festival 3/1 (MÊS)')).toBe('Festival 3/1 (M)');
    expect(para('Festival 3/1 (mês)')).toBe('Festival 3/1 (M)');
  });

  it('MNT continua (MNT)', () => {
    expect(propostaDaClaquete('Grade da Noite 28/11 (MNT)')).toBeNull();
    expect(para('Grade da Noite 28/11 (mnt)')).toBe('Grade da Noite 28/11 (MNT)');
    expect(para('Grade da Noite 28/11 MNT')).toBe('Grade da Noite 28/11 (MNT)');
  });
});

describe('propostaDaClaquete: as combinações ficam na ordem escrita', () => {
  it.each([
    ['Novela Sol 28/11 (ah)', 'Novela Sol 28/11 (AH)'],
    ['Show da Tarde 4/12 NAH', 'Show da Tarde 4/12 (NAH)'],
    ['Show da Tarde 4/12 (Dp)', 'Show da Tarde 4/12 (DP)'],
    ['Show da Tarde 4/12 pnah', 'Show da Tarde 4/12 (PNAH)'],
  ])('%s → %s', (de, esperado) => {
    expect(para(de)).toBe(esperado);
  });

  it.each(['Novela Sol 28/11 (AH)', 'Show da Tarde 4/12 (NAH)', 'Show da Tarde 4/12 (DP)', 'Show da Tarde 4/12 (PNAH)'])('%s já está no padrão', (claquete) => {
    expect(propostaDaClaquete(claquete)).toBeNull();
  });
});

describe('propostaDaClaquete: as outras grafias fora do padrão', () => {
  it('a letra sem parênteses, depois da data', () => {
    expect(para('Novela Sol 28/11 H')).toBe('Novela Sol 28/11 (H)');
  });

  it('com espaços dentro dos parênteses', () => {
    expect(para('Novela Sol 28/11 ( AH )')).toBe('Novela Sol 28/11 (AH)');
  });
});

describe('propostaDaClaquete: só o código de versão muda', () => {
  it('o resto da claquete fica como está, até o parêntese do meio e o espaço antes do código', () => {
    expect(para('Festa do Bairro(Prologo)26/11 (ah)')).toBe('Festa do Bairro(Prologo)26/11 (AH)');
    expect(para('Show da Tarde 4/12-2 Dp')).toBe('Show da Tarde 4/12-2 (DP)');
    expect(para('festa   da vila 28/11(dia)')).toBe('festa   da vila 28/11(D)');
  });

  it('sem código, sem correção (a praça e a versão da arte no fim não são código)', () => {
    expect(propostaDaClaquete('Novela Sol 24/11-2')).toBeNull();
    expect(propostaDaClaquete('Quem Ama 20/11 SP')).toBeNull();
    expect(propostaDaClaquete('Chamada 8/1 B')).toBeNull();
    expect(propostaDaClaquete('COMUNICAÇÃO')).toBeNull();
    expect(propostaDaClaquete('')).toBeNull();
  });
});

describe('propostaDaClaquete: o código desconhecido não é corrigido', () => {
  it('fica sem correção e é apontado como não reconhecido, cru', () => {
    expect(propostaDaClaquete('Show da Tarde 28/11 (XYZ)')).toEqual({ tipo: 'nao-reconhecido', de: 'Show da Tarde 28/11 (XYZ)', codigo: 'XYZ' });
    expect(propostaDaClaquete('Show da Tarde 28/11 (aa)')).toEqual({ tipo: 'nao-reconhecido', de: 'Show da Tarde 28/11 (aa)', codigo: 'aa' });
  });
});

/* As atrações parecidas (#116): as fichas que parecem a mesma atração, juntas num grupo com o motivo. A comparação é a
   da busca de atração: sem caixa, acento e artigos, com uma letra de diferença numa palavra longa. Nomes fictícios. */

const ficha = (id: string, nome: string) => ({ id, nome });
/** Os grupos como os ids de cada um, e o motivo. */
const grupos = (fichas: { id: string; nome: string }[], diferentes?: Set<string>) => atracoesParecidas(fichas, diferentes).map((g) => ({ motivo: g.motivo, ids: g.fichas.map((f) => f.id) }));

describe('atracoesParecidas: o mesmo nome sem caixa, acento e artigos', () => {
  it('o acento e a caixa não contam', () => {
    expect(grupos([ficha('rec1', 'Clínica Geral'), ficha('rec2', 'CLINICA GERAL'), ficha('rec3', 'Novela Sol')])).toEqual([{ motivo: 'mesmo-nome', ids: ['rec2', 'rec1'] }]);
  });

  it('o artigo não conta, no começo ou no meio', () => {
    expect(grupos([ficha('rec1', 'A Clínica'), ficha('rec2', 'Clínica')])).toEqual([{ motivo: 'mesmo-nome', ids: ['rec1', 'rec2'] }]);
    expect(grupos([ficha('rec1', 'Os Donos da Bola'), ficha('rec2', 'Donos da Bola')])).toEqual([{ motivo: 'mesmo-nome', ids: ['rec2', 'rec1'] }]);
  });

  it('a pontuação e os espaços a mais não contam', () => {
    expect(grupos([ficha('rec1', 'Show - da Tarde'), ficha('rec2', 'Show da  Tarde')])).toEqual([{ motivo: 'mesmo-nome', ids: ['rec1', 'rec2'] }]);
  });

  it('a mesma atração cadastrada duas vezes com o mesmo nome também é um grupo', () => {
    expect(grupos([ficha('rec1', 'Festival de Verão'), ficha('rec2', 'Festival de Verão')])).toEqual([{ motivo: 'mesmo-nome', ids: ['rec1', 'rec2'] }]);
  });
});

describe('atracoesParecidas: uma letra de diferença numa palavra longa', () => {
  it('uma letra trocada, a mais ou a menos', () => {
    expect(grupos([ficha('rec1', 'Antártida'), ficha('rec2', 'Antartica')])).toEqual([{ motivo: 'uma-letra', ids: ['rec2', 'rec1'] }]);
    expect(grupos([ficha('rec1', 'Festival de Verão'), ficha('rec2', 'Festivall de Verão')])).toEqual([{ motivo: 'uma-letra', ids: ['rec1', 'rec2'] }]);
    expect(grupos([ficha('rec1', 'Marta e o Mar'), ficha('rec2', 'Mart e o Mar')])).toEqual([]);
    expect(grupos([ficha('rec1', 'Cozinha da Vila'), ficha('rec2', 'Cozina da Vila')])).toEqual([{ motivo: 'uma-letra', ids: ['rec2', 'rec1'] }]);
  });

  it('duas letras de diferença, ou uma letra em duas palavras, já é outra atração', () => {
    expect(grupos([ficha('rec1', 'Antártida'), ficha('rec2', 'Antartiko')])).toEqual([]);
    expect(grupos([ficha('rec1', 'Festival de Verão'), ficha('rec2', 'Festivai de Verao Rio')])).toEqual([]);
    expect(grupos([ficha('rec1', 'Cozinha Nobre'), ficha('rec2', 'Cozinho Nobra')])).toEqual([]);
  });
});

describe('atracoesParecidas: nomes curtos e diferentes não se juntam', () => {
  it('uma letra de diferença numa palavra curta é outro nome', () => {
    expect(grupos([ficha('rec1', 'Gol'), ficha('rec2', 'Sol')])).toEqual([]);
    expect(grupos([ficha('rec1', 'Casa'), ficha('rec2', 'Caso')])).toEqual([]);
    expect(grupos([ficha('rec1', 'Mais Você'), ficha('rec2', 'Mais Voz')])).toEqual([]);
  });

  it('o nome que só tem artigo não junta com nada', () => {
    expect(grupos([ficha('rec1', 'A'), ficha('rec2', 'O')])).toEqual([]);
  });
});

describe('atracoesParecidas: os grupos', () => {
  it('três fichas parecidas viram um grupo só; o motivo é o mais fraco (uma letra) quando não são todas o mesmo nome', () => {
    expect(grupos([ficha('rec3', 'Antartica'), ficha('rec1', 'Antártida'), ficha('rec2', 'A Antártida'), ficha('rec9', 'Novela Sol')])).toEqual([{ motivo: 'uma-letra', ids: ['rec2', 'rec3', 'rec1'] }]);
  });

  it('cada grupo em ordem de nome (o empate pelo id), e os grupos também', () => {
    const g = atracoesParecidas([ficha('rec4', 'Zebra Show'), ficha('rec3', 'ZEBRA SHOW'), ficha('rec2', 'Bela Tarde'), ficha('rec1', 'Belá Tarde')]);
    expect(g.map((x) => x.fichas.map((f) => f.nome))).toEqual([
      ['Bela Tarde', 'Belá Tarde'],
      ['Zebra Show', 'ZEBRA SHOW'],
    ]);
  });

  it('as outras informações da ficha vêm junto', () => {
    const [g] = atracoesParecidas([{ id: 'rec1', nome: 'Clínica', artes: 3 }, { id: 'rec2', nome: 'Clinica', artes: 0 }]);
    expect(g.fichas).toEqual([{ id: 'rec2', nome: 'Clinica', artes: 0 }, { id: 'rec1', nome: 'Clínica', artes: 3 }]);
  });
});

describe('atracoesParecidas: "não são a mesma"', () => {
  it('o par marcado não junta, nos dois sentidos', () => {
    const fichas = [ficha('rec1', 'Clínica'), ficha('rec2', 'Clinica')];
    expect(grupos(fichas, new Set([parDeFichas('rec2', 'rec1')]))).toEqual([]);
    expect(parDeFichas('rec2', 'rec1')).toBe(parDeFichas('rec1', 'rec2'));
  });

  it('a ficha nova parecida com uma marcada volta num grupo novo, só com ela', () => {
    const fichas = [ficha('rec1', 'Clínica'), ficha('rec2', 'Clinica'), ficha('rec3', 'A Clínica')];
    expect(grupos(fichas, new Set([parDeFichas('rec1', 'rec2')]))).toEqual([{ motivo: 'mesmo-nome', ids: ['rec3', 'rec2', 'rec1'] }]);
  });
});

/* Daqui para frente (#118): o PROMeiro grava a claquete no padrão, e o que ainda está na grafia antiga (a pauta da
   edição, as linhas da produção da arte de antes) continua cruzando com ela. */
describe('claqueteNoPadrao: a claquete como o PROMeiro grava', () => {
  it('com o código corrigido; sem o que corrigir, como está', () => {
    expect(claqueteNoPadrao('Show da Tarde 4/12 Dp')).toBe('Show da Tarde 4/12 (DP)');
    expect(claqueteNoPadrao('Show da Tarde 4/12 (MÊS)')).toBe('Show da Tarde 4/12 (M)');
    expect(claqueteNoPadrao('Show da Tarde 4/12 (DP)')).toBe('Show da Tarde 4/12 (DP)');
    expect(claqueteNoPadrao('Show da Tarde 4/12 (REPERC)')).toBe('Show da Tarde 4/12 (REPERC)');
    expect(claqueteNoPadrao('Show da Tarde 4/12')).toBe('Show da Tarde 4/12');
  });
});

describe('a claquete gravada no padrão cruza com a grafia antiga', () => {
  const producao = (id: string, claquete: string): ProducaoNaPauta => ({ id, claquete, praca: 'G5', etapa: 'entrada', artes: 1, designers: [], alta: false, entradaEm: '2026-11-25T12:00:00.000Z', entregaEm: null });
  const naPauta = (claquete: string) => linhaDaPauta({ id: 'recL', claquete, editor: 'Ana', data: '2026-11-27' })!;
  const achadas = (pauta: string, gravada: string) => cruzarComAProducao([naPauta(pauta)], [producao('p1', gravada)], (c) => c)[0].producoes?.map((p) => p.id);

  it.each([
    ['Especial 29/11 (MES)', 'Especial 29/11(M)'],
    ['Especial 29/11 (MÊS)', 'Especial 29/11(M)'],
    ['Especial 29/11 (DIA)', 'Especial 29/11(D)'],
    ['Especial 29/11 Dp', 'Especial 29/11(DP)'],
    ['Especial 29/11 (M)', 'Especial 29/11(MES)'],
  ])('na pauta da edição: %s acha a Produção %s', (pauta, gravada) => {
    expect(achadas(pauta, gravada)).toEqual(['p1']);
  });

  it('nas Duplicadas: a mesma claquete com o código antigo e com o do padrão é caso', () => {
    const linha = (n: number, claquete: string): LinhaDaProducao => ({ registro: `rec${n}`, card: `card${n}`, claquete, praca: '', entrada: new Date(Date.UTC(2026, 10, 10, 12, n)).toISOString(), arquivado: false, filme: false, status: ['PRODUZINDO'], designers: ['Designer Um'], entregue: false });
    const casos = duplicadasDaProducao([linha(1, 'Terra 20/11 (MES)'), linha(2, 'Terra 20/11(M)'), linha(3, 'Mar 20/11(M)'), linha(4, 'Mar 20/11')], { desde: Date.UTC(2026, 7, 1) });
    expect(casos.map((c) => c.cards)).toEqual([['card3', 'card4'], ['card1', 'card2']]);
  });
});

describe('atracaoParecida: a ficha que já existe para um nome escrito de outro jeito (#118)', () => {
  const fichas = [
    { id: 'recA', nome: 'Casa da Colina' },
    { id: 'recB', nome: 'Tela Quente' },
    { id: 'recC', nome: 'Tela Quentes' },
    { id: 'recD', nome: 'Gol' },
  ];
  it('o mesmo nome sem caixa, acento e artigos vem antes da uma letra de diferença', () => {
    expect(atracaoParecida('A CASA DA COLINA', fichas)).toEqual({ ficha: fichas[0], motivo: 'mesmo-nome' });
    expect(atracaoParecida('tela quente', fichas)).toEqual({ ficha: fichas[1], motivo: 'mesmo-nome' });
    expect(atracaoParecida('Tela Quenti', fichas)).toEqual({ ficha: fichas[1], motivo: 'uma-letra' });
  });
  it('nome curto só vale igual; o que não parece nenhuma é null', () => {
    expect(atracaoParecida('Gols', fichas)).toBeNull();
    expect(atracaoParecida('Cine Inventado', fichas)).toBeNull();
  });
});
