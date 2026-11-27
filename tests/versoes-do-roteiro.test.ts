import { describe, expect, it } from 'vitest';
import { chaveDoApelido, claqueteComAsVersoes, conflitoDasVersoes, nomeComApelido, versoesDoRoteiro } from '../src/modelo/versoesDoRoteiro';

/* As versões da chamada lidas no próprio roteiro (#120): as artes marcadas na revisão dizem quando o programa vai ao
   ar ("NESTA QUARTA" é N, "AMANHÃ, 22H30" é A…), nas letras do padrão da pauta. Num conflito com o código da claquete,
   vale o roteiro. Claquetes e artes fictícias. A semana de 23/11/2026 começa numa segunda: 25/11 é quarta, 27/11 sexta,
   28/11 sábado. */

const HOJE = '2026-11-23';
const letras = (artes: string[], claquete = 'Show da Tarde 25/11') => versoesDoRoteiro(artes, claquete, HOJE).map((v) => v.codigo).join('');
const rotulos = (artes: string[], claquete = 'Show da Tarde 25/11') => versoesDoRoteiro(artes, claquete, HOJE).map((v) => v.rotulo);

describe('versoesDoRoteiro: cada versão', () => {
  it('"AMANHÃ, 22H30" é A, amanhã', () => {
    expect(versoesDoRoteiro(['AMANHÃ, 22H30'], 'Show da Tarde 25/11', HOJE)).toEqual([{ codigo: 'A', rotulo: 'amanhã', conhecida: true }]);
  });

  it('"HOJE" é H', () => {
    expect(rotulos(['HOJE, DEPOIS DA NOVELA'])).toEqual(['hoje']);
  });

  it('"NESTA QUARTA" é N, com o dia da semana', () => {
    expect(letras(['NESTA QUARTA'])).toBe('N');
    expect(rotulos(['NESTA QUARTA'])).toEqual(['nesta qua']);
  });

  it('"PRÓXIMA SEXTA" é P', () => {
    expect(rotulos(['PRÓXIMA SEXTA, 21H'], 'Show da Tarde 27/11')).toEqual(['próxima sex']);
  });

  it('sábado e domingo são "neste" e "próximo"', () => {
    expect(rotulos(['NESTE SÁBADO'], 'Show da Tarde 28/11')).toEqual(['neste sáb']);
    expect(rotulos(['PRÓXIMO DOMINGO'], 'Show da Tarde 29/11')).toEqual(['próximo dom']);
  });

  it('"DIA 28" é D, dia 28', () => {
    expect(rotulos(['DIA 28'], 'Show da Tarde 28/11')).toEqual(['dia 28']);
  });

  it('"EM JANEIRO" é M, em janeiro', () => {
    expect(rotulos(['ESTREIA EM JANEIRO'], 'Série Nova 5/1')).toEqual(['em janeiro']);
  });

  it('as versões vêm na ordem das letras do padrão (A H N P D M), uma vez cada, seja qual for a ordem das artes', () => {
    expect(letras(['EM JANEIRO', 'DIA 28', 'HOJE', 'AMANHÃ', 'HOJE À NOITE'], 'Série 28/1')).toBe('AHDM');
  });

  it('as artes sem dia de exibição não dão versão', () => {
    expect(versoesDoRoteiro(['AO VIVO', 'VOTE PELO APLICATIVO', 'NESTA SEMANA', 'HOJEIRA', 'DIAS DE SOL'], 'Show 25/11', HOJE)).toEqual([]);
    expect(versoesDoRoteiro([], 'Show 25/11', HOJE)).toEqual([]);
  });
});

describe('versoesDoRoteiro: as grafias', () => {
  it('sem acento e em qualquer caixa: "AMANHA", "amanhã", "Hoje"', () => {
    expect(letras(['AMANHA'])).toBe('A');
    expect(letras(['amanhã às 22h'])).toBe('A');
    expect(letras(['Hoje'])).toBe('H');
    expect(letras(['PROXIMA SEXTA'], 'Show 27/11')).toBe('P');
  });

  it('o dia da semana pelo número ou abreviado: "NESTA 4ª", "NESTA QUA", "NESTA QUARTA-FEIRA"', () => {
    expect(rotulos(['NESTA 4ª'])).toEqual(['nesta qua']);
    expect(rotulos(['NESTA QUA'])).toEqual(['nesta qua']);
    expect(rotulos(['NESTA QUARTA-FEIRA'])).toEqual(['nesta qua']);
    expect(rotulos(['NESTA TERÇA'], 'Show 24/11')).toEqual(['nesta ter']);
  });

  it('"DIA 28/11" é D', () => {
    expect(rotulos(['DIA 28/11, 22H'], 'Show 28/11')).toEqual(['dia 28']);
  });

  it('o dia da semana é conferido pela data da claquete: o que não bate não é versão desta chamada', () => {
    // 25/11 é quarta: "NESTA SEXTA" fala de outro dia
    expect(versoesDoRoteiro(['NESTA SEXTA'], 'Show da Tarde 25/11', HOJE)).toEqual([]);
    expect(letras(['PRÓXIMA SEXTA', 'NESTA QUARTA'], 'Show da Tarde 25/11')).toBe('N');
  });

  it('sem data na claquete, o dia da semana vem da própria arte', () => {
    expect(rotulos(['NESTA SEXTA'], 'Show da Tarde')).toEqual(['nesta sex']);
    expect(rotulos(['DIA 28'], 'Show da Tarde')).toEqual(['dia 28']);
  });
});

describe('versoesDoRoteiro: só o dia da semana, sem "nesta" nem "próxima"', () => {
  it('"SÁBADO, 22H" com a data da claquete nos próximos 7 dias é N, a conferir', () => {
    expect(versoesDoRoteiro(['SÁBADO, 22H'], 'Show 28/11', HOJE)).toEqual([{ codigo: 'N', rotulo: 'neste sáb', conhecida: true, aConferir: true }]);
    expect(letras(['QUARTA-FEIRA, DEPOIS DA NOVELA'], 'Show 25/11')).toBe('N');
  });

  it('com a data depois dos próximos 7 dias é P, a conferir', () => {
    expect(versoesDoRoteiro(['SEGUNDA, 21H'], 'Show 30/11', HOJE)).toEqual([{ codigo: 'P', rotulo: 'próxima seg', conhecida: true, aConferir: true }]);
    expect(versoesDoRoteiro(['SÁBADO'], 'Show 5/12', HOJE)).toEqual([{ codigo: 'P', rotulo: 'próximo sáb', conhecida: true, aConferir: true }]);
  });

  it('o dia que não bate com a data da claquete, ou sem data na claquete, não é versão', () => {
    expect(versoesDoRoteiro(['SEXTA, 22H'], 'Show 28/11', HOJE)).toEqual([]);
    expect(versoesDoRoteiro(['SÁBADO, 22H'], 'Show da Tarde', HOJE)).toEqual([]);
  });

  it('com "nesta" ou "próxima" escrito, vale o escrito, sem conferir', () => {
    expect(versoesDoRoteiro(['NESTE SÁBADO', 'SÁBADO, 22H'], 'Show 28/11', HOJE)).toEqual([{ codigo: 'N', rotulo: 'neste sáb', conhecida: true }]);
  });

  it('o horário sozinho ("22H30") não é versão', () => {
    expect(versoesDoRoteiro(['22H30', 'ÀS 21H', '22:30'], 'Show 28/11', HOJE)).toEqual([]);
  });
});

describe('conflitoDasVersoes: vale o roteiro', () => {
  const lidas = (artes: string[], claquete: string) => versoesDoRoteiro(artes, claquete, HOJE);

  it('o roteiro e a claquete concordam: sem conflito, em qualquer ordem e grafia do código', () => {
    expect(conflitoDasVersoes('Show 25/11 (AH)', lidas(['HOJE', 'AMANHÃ'], 'Show 25/11 (AH)'))).toBeNull();
    expect(conflitoDasVersoes('Show 25/11 (ha)', lidas(['HOJE', 'AMANHÃ'], 'Show 25/11 (ha)'))).toBeNull();
    expect(conflitoDasVersoes('Show 28/11 (DIA)', lidas(['DIA 28'], 'Show 28/11 (DIA)'))).toBeNull();
  });

  it('discordam: as duas leituras e o apelido com as versões do roteiro', () => {
    expect(conflitoDasVersoes('Show 25/11 (A)', lidas(['HOJE'], 'Show 25/11 (A)'))).toEqual({ daClaquete: '(A)', doRoteiro: '(H)', apelido: 'Show 25/11 (H)' });
    expect(conflitoDasVersoes('Show 25/11(A)', lidas(['HOJE', 'AMANHÃ'], 'Show 25/11(A)'))).toEqual({ daClaquete: '(A)', doRoteiro: '(AH)', apelido: 'Show 25/11(AH)' });
  });

  it('a claquete sem código e o roteiro com versão: conflito, e o apelido ganha o código', () => {
    expect(conflitoDasVersoes('Show 25/11', lidas(['AMANHÃ'], 'Show 25/11'))).toEqual({ daClaquete: '', doRoteiro: '(A)', apelido: 'Show 25/11 (A)' });
  });

  it('o roteiro sem versão, a claquete com o código desconhecido ou de manutenção: nada a comparar', () => {
    expect(conflitoDasVersoes('Show 25/11 (A)', [])).toBeNull();
    expect(conflitoDasVersoes('Show 25/11 (XYZ)', lidas(['HOJE'], 'Show 25/11 (XYZ)'))).toBeNull();
    expect(conflitoDasVersoes('Grade 25/11 (MNT)', lidas(['HOJE'], 'Grade 25/11 (MNT)'))).toBeNull();
  });

  it('o código solto depois da data também é o da claquete', () => {
    expect(conflitoDasVersoes('Show 25/11 AH', lidas(['HOJE', 'AMANHÃ'], 'Show 25/11 AH'))).toBeNull();
    expect(conflitoDasVersoes('Show 25/11 A', lidas(['HOJE'], 'Show 25/11 A'))).toMatchObject({ daClaquete: '(A)', apelido: 'Show 25/11 (H)' });
  });
});

describe('claqueteComAsVersoes', () => {
  it('troca só o código, no padrão: o resto da claquete fica como está', () => {
    expect(claqueteComAsVersoes('Chef(Fut)3/11 (A)', 'AH')).toBe('Chef(Fut)3/11 (AH)');
    expect(claqueteComAsVersoes('Chef(Fut)3/11 (MES)', 'D')).toBe('Chef(Fut)3/11 (D)');
    expect(claqueteComAsVersoes('Chef(Fut)3/11', 'H')).toBe('Chef(Fut)3/11 (H)');
  });
});

describe('o apelido: só para mostrar, nunca a chave dos cruzamentos', () => {
  it('a chave do apelido junta as grafias da mesma claquete (pontuação, caixa, acento e o código no padrão)', () => {
    expect(chaveDoApelido('Chef(Fut)3/11 (MES)')).toBe(chaveDoApelido('CHEF (FUT) 3/11 (M)'));
    expect(chaveDoApelido('Show 25/11 (HA)')).toBe(chaveDoApelido('show 25/11 (ah)'));
    expect(chaveDoApelido('Show 25/11 AH')).toBe(chaveDoApelido('Show 25/11 (AH)'));
  });

  it('nomeComApelido mostra o apelido no lugar da claquete; sem apelido, a claquete como está', () => {
    const apelidos = new Map([[chaveDoApelido('Show 25/11 (A)'), 'Show 25/11 (H)']]);
    // a chave é a da claquete, sem o código (#154): as versões diferentes são a mesma claquete
    expect(nomeComApelido('SHOW 25/11 (A)', apelidos)).toBe('Show 25/11 (H)');
    expect(nomeComApelido('Outro 25/11', apelidos)).toBe('Outro 25/11');
    expect(nomeComApelido('', apelidos)).toBe('');
  });
});
