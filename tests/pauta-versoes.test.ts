import { describe, expect, it } from 'vitest';
import { codigoDasVersoes, leituraDasVersoes, lerVersoes, nomeSemAsVersoes } from '../src/modelo/pauta';

/* As versões da chamada na pauta da edição (#95): o código no fim da claquete, uma letra por versão (A amanhã, H hoje,
   N nesta <dia>, P próxima <dia>, D dia X) ou um código inteiro (DIA, MES/MÊS, MNT). O dia da semana, o número e o
   mês saem da data escrita na claquete; sem ela, do dia da linha da pauta. Claquetes fictícias. A semana de 23/11/2026
   começa numa segunda: 27/11 é sexta, 28/11 sábado, 29/11 domingo, 4/12 sexta. */

const rotulos = (claquete: string, dia = '2026-11-26') => lerVersoes(claquete, dia).versoes.map((v) => v.rotulo);
const codigos = (claquete: string, dia = '2026-11-26') => lerVersoes(claquete, dia).versoes.map((v) => v.codigo);

describe('lerVersoes: uma letra por versão', () => {
  it('A é amanhã', () => {
    expect(lerVersoes('Novela Sol 28/11 (A)', '2026-11-26').versoes).toEqual([{ codigo: 'A', rotulo: 'amanhã', conhecida: true }]);
  });

  it('H é hoje', () => {
    expect(rotulos('Novela Sol 28/11 (H)')).toEqual(['hoje']);
  });

  it('N é nesta <dia da semana>, o da data da claquete', () => {
    expect(rotulos('Show da Tarde 27/11 (N)')).toEqual(['nesta sex']);
  });

  it('P é próxima <dia da semana>', () => {
    expect(rotulos('Show da Tarde 27/11 (P)')).toEqual(['próxima sex']);
  });

  it('sábado e domingo são "neste" e "próximo"', () => {
    expect(rotulos('Show da Tarde 28/11 (N)')).toEqual(['neste sáb']);
    expect(rotulos('Show da Tarde 29/11 (P)')).toEqual(['próximo dom']);
  });

  it('D é dia X, o número da data da claquete', () => {
    expect(rotulos('Show da Tarde 28/11 (D)')).toEqual(['dia 28']);
  });
});

describe('lerVersoes: os códigos inteiros', () => {
  it('DIA é dia X, a mesma versão do D', () => {
    expect(lerVersoes('Show da Tarde 28/11 (DIA)', '2026-11-26').versoes).toEqual([{ codigo: 'DIA', rotulo: 'dia 28', conhecida: true }]);
  });

  it('MES e MÊS são "em <mês>", o mês da data da claquete', () => {
    expect(rotulos('Festival 3/1 (MES)', '2026-12-20')).toEqual(['em janeiro']);
    expect(lerVersoes('Festival 3/3 (MÊS)', '2026-12-20').versoes).toEqual([{ codigo: 'MÊS', rotulo: 'em março', conhecida: true }]);
  });

  it('MNT é manutenção da grade', () => {
    expect(rotulos('Grade da Noite 28/11 (MNT)')).toEqual(['manutenção da grade']);
  });
});

describe('lerVersoes: as combinações saem na ordem das letras', () => {
  it.each([
    ['Novela Sol 28/11 (AH)', ['amanhã', 'hoje']],
    ['Show da Tarde 4/12 (NAH)', ['nesta sex', 'amanhã', 'hoje']],
    ['Show da Tarde 4/12 (DP)', ['dia 4', 'próxima sex']],
    ['Show da Tarde 4/12 (PNAH)', ['próxima sex', 'nesta sex', 'amanhã', 'hoje']],
  ])('%s', (claquete, esperado) => {
    expect(rotulos(claquete)).toEqual(esperado);
  });

  it('cada versão traz a letra dela', () => {
    expect(codigos('Show da Tarde 4/12 (PNAH)')).toEqual(['P', 'N', 'A', 'H']);
  });
});

describe('lerVersoes: as datas', () => {
  it('o dia da semana é o da data escrita na claquete, não o da linha da pauta', () => {
    // a linha é de terça (24/11); a claquete é de sexta
    expect(rotulos('Show da Tarde 27/11 (N)', '2026-11-24')).toEqual(['nesta sex']);
  });

  it('sem data na claquete, valem o dia, o número e o mês da linha da pauta', () => {
    expect(rotulos('Especial de Verão (MES)', '2026-11-24')).toEqual(['em novembro']);
    expect(rotulos('Especial de Verão (ND)', '2026-11-24')).toEqual(['nesta ter', 'dia 24']);
  });

  it('a claquete de janeiro numa pauta de dezembro é do ano seguinte', () => {
    // 2/1/2027 é sábado (2/1/2026 era sexta)
    expect(rotulos('Show da Virada 2/1 (N)', '2026-12-30')).toEqual(['neste sáb']);
  });

  it('num período, vale o primeiro dia', () => {
    expect(rotulos('Maratona 8 a 12/12 (D)')).toEqual(['dia 8']);
  });
});

describe('lerVersoes: as grafias fora do padrão valem a mesma versão', () => {
  it('em minúsculas, guardando a grafia de cada letra', () => {
    expect(lerVersoes('Show da Tarde 4/12 (Dp)', '2026-11-26').versoes).toEqual([
      { codigo: 'D', rotulo: 'dia 4', conhecida: true },
      { codigo: 'p', rotulo: 'próxima sex', conhecida: true },
    ]);
    expect(rotulos('Novela Sol 28/11 (ah)')).toEqual(['amanhã', 'hoje']);
  });

  it('DIA por extenso, em qualquer caixa', () => {
    expect(lerVersoes('Show da Tarde 28/11 (Dia)', '2026-11-26').versoes).toEqual([{ codigo: 'Dia', rotulo: 'dia 28', conhecida: true }]);
  });

  it('MÊS com acento e mes em minúsculas', () => {
    expect(rotulos('Festival 3/1 (mês)', '2026-12-20')).toEqual(['em janeiro']);
    expect(rotulos('Festival 3/1 (mes)', '2026-12-20')).toEqual(['em janeiro']);
  });

  it('sem parênteses, depois da data', () => {
    expect(rotulos('Novela Sol 28/11 H')).toEqual(['hoje']);
    expect(rotulos('Show da Tarde 4/12 NAH')).toEqual(['nesta sex', 'amanhã', 'hoje']);
    expect(rotulos('Show da Tarde 4/12 PNAH')).toEqual(['próxima sex', 'nesta sex', 'amanhã', 'hoje']);
    expect(rotulos('Show da Tarde 4/12-2 Dp')).toEqual(['dia 4', 'próxima sex']);
  });

  it('com espaços dentro dos parênteses', () => {
    expect(rotulos('Novela Sol 28/11 ( AH )')).toEqual(['amanhã', 'hoje']);
  });
});

describe('lerVersoes: o resto da claquete', () => {
  it('a claquete sem o código, para a etiqueta ficar no lugar dele', () => {
    expect(lerVersoes('Festa do Bairro(Prologo)26/11 (AH)', '2026-11-24').semVersao).toBe('Festa do Bairro(Prologo)26/11');
    expect(lerVersoes('Novela Sol 28/11 H', '2026-11-26').semVersao).toBe('Novela Sol 28/11');
  });

  it('sem código, nenhuma versão e a claquete inteira', () => {
    expect(lerVersoes('Novela Sol 24/11-2', '2026-11-24')).toEqual({ versoes: [], semVersao: 'Novela Sol 24/11-2' });
    // a praça e a versão da arte no fim não são versão da chamada; o parêntese antes da data também não
    expect(rotulos('Quem Ama 20/11 SP')).toEqual([]);
    expect(rotulos('Chamada 8/1 B')).toEqual([]);
    expect(rotulos('Festa(AH)Rede 3/12')).toEqual([]);
    expect(rotulos('COMUNICAÇÃO')).toEqual([]);
    expect(rotulos('')).toEqual([]);
  });
});

describe('lerVersoes: o código desconhecido aparece cru', () => {
  it('entre parênteses no fim, vira uma versão crua, sem quebrar', () => {
    expect(lerVersoes('Show da Tarde 28/11 (XYZ)', '2026-11-26')).toEqual({ versoes: [{ codigo: 'XYZ', rotulo: 'XYZ', conhecida: false }], semVersao: 'Show da Tarde 28/11' });
    // a letra repetida não é uma combinação
    expect(lerVersoes('Show da Tarde 28/11 (AA)', '2026-11-26').versoes).toEqual([{ codigo: 'AA', rotulo: 'AA', conhecida: false }]);
  });

  it('sem parênteses, uma palavra desconhecida não é código', () => {
    expect(rotulos('Show da Tarde 28/11 Rede')).toEqual([]);
  });

  it('com um dia da linha que não é data, ainda responde', () => {
    expect(rotulos('Especial (N)', '')).toEqual(['nesta …']);
    expect(rotulos('Especial (AH)', 'xx')).toEqual(['amanhã', 'hoje']);
  });
});

describe('codigoDasVersoes: a tela mostra só o código no padrão', () => {
  const codigo = (claquete: string) => codigoDasVersoes(lerVersoes(claquete, '2026-11-26').versoes);

  it('uma letra maiúscula por versão, na ordem escrita, entre parênteses', () => {
    expect(codigo('Show da Tarde 27/11 (AH)')).toBe('(AH)');
    expect(codigo('Show da Tarde 27/11 (pnah)')).toBe('(PNAH)');
    expect(codigo('Show da Tarde 27/11 ( há )')).toBe('(HA)');
    expect(codigo('Show da Tarde 27/11 nah')).toBe('(NAH)');
  });

  it('DIA vira D, MES e MÊS viram M, MNT fica inteiro', () => {
    expect(codigo('Show da Tarde 27/11 (dia)')).toBe('(D)');
    expect(codigo('Festival 3/1 (MÊS)')).toBe('(M)');
    expect(codigo('Festival 3/1 (mes)')).toBe('(M)');
    expect(codigo('Grade da Noite 27/11 (mnt)')).toBe('(MNT)');
  });

  it('o desconhecido aparece cru; sem versão, nada', () => {
    expect(codigo('Show da Tarde 28/11 (XyZ)')).toBe('(XyZ)');
    expect(codigo('Show da Tarde 28/11')).toBe('');
  });

  it('a dica diz o que o código quer dizer', () => {
    expect(leituraDasVersoes(lerVersoes('Show da Tarde 27/11 (AH)', '2026-11-26').versoes)).toBe('amanhã e hoje');
    expect(leituraDasVersoes(lerVersoes('Show da Tarde 27/11 (AHN)', '2026-11-26').versoes)).toBe('amanhã, hoje e nesta sex');
    expect(leituraDasVersoes(lerVersoes('Show da Tarde 27/11 (MNT)', '2026-11-26').versoes)).toBe('manutenção da grade');
  });
});

describe('nomeSemAsVersoes: o nome mostrado sai sem o código, que fica só na etiqueta', () => {
  it('tira o código no fim, com ou sem parênteses, pela mesma leitura da Pauta', () => {
    expect(nomeSemAsVersoes('Novela Sinfonia 4/12 (AH)')).toBe('Novela Sinfonia 4/12');
    expect(nomeSemAsVersoes('CHAMADA_CODIGO_27/11(AH)')).toBe('CHAMADA_CODIGO_27/11');
    expect(nomeSemAsVersoes('Jogo Final 30/11 Dp')).toBe('Jogo Final 30/11');
    expect(nomeSemAsVersoes('Show da Tarde 28/11 (XYZ)')).toBe('Show da Tarde 28/11');
  });

  it('sem código, o nome como está; a praça no fim não é código', () => {
    expect(nomeSemAsVersoes('Festa na Praça 4/12 SP')).toBe('Festa na Praça 4/12 SP');
    expect(nomeSemAsVersoes('SÉRIE FICTÍCIA, O FINAL')).toBe('SÉRIE FICTÍCIA, O FINAL');
    expect(nomeSemAsVersoes('')).toBe('');
  });
});
