import { describe, expect, it } from 'vitest';
import { chaveDaClaquete, claqueteComBarra, claqueteDoArquivo, claquetePadrao, dataDaClaquete, lerDataDaClaquete } from '../src/modelo/vocabularios';
import { reconhecerPraca as pracaDaClaquete } from '../src/modelo/pracas';
// @ts-expect-error módulo JS sem tipos
import { chaveN8n } from '../servidor/trello.mjs';

/* Nomes fictícios ou genéricos: o repositório é público. */

describe('claqueteComBarra: a data do nome da claquete sempre com "/"', () => {
  it.each([
    ['DONA 27-11', 'DONA 27/11'],
    ['TERRA 26-11-2', 'TERRA 26/11-2'],
    ['Festa na Praça 19-11 SP', 'Festa na Praça 19/11 SP'],
    ['RIO FESTA 3-12 (AH)', 'RIO FESTA 3/12 (AH)'],
    ['Novela das Seis 5-12-V2', 'Novela das Seis 5/12-V2'],
    ['CHAMADA 8-1 B', 'CHAMADA 8/1 B'],
    ['Quem Ama(Prologo)26-10 Rede', 'Quem Ama(Prologo)26/10 Rede'],
    ['PRAIA 26_11', 'PRAIA 26/11'],
    ['PRAIA 26.11 SP', 'PRAIA 26/11 SP'],
    ['Sertanejo 2 20-9 SP', 'Sertanejo 2 20/9 SP'],
    ['Tempo 21 A 26-9', 'Tempo 21 A 26/9'],
    ['Tempo 18 a 25-11-2', 'Tempo 18 a 25/11-2'],
    ['F1(Compacto Catar) 29-11', 'F1(Compacto Catar) 29/11'],
    ['PREMIO 2027 4-12', 'PREMIO 2027 4/12'],
    ['FUTEBOL 21H30 30-11', 'FUTEBOL 21H30 30/11'],
    ['SHOW 6S 2-12', 'SHOW 6S 2/12'],
    ['V2-26-10 CHEF', 'V2-26/10 CHEF'],
  ])('%s → %s', (antes, depois) => {
    expect(claqueteComBarra(antes)).toBe(depois);
  });

  it.each([
    'DONA 27/11',
    'TERRA 26/11-2',
    'Tempo 21 A 26/9',
    'Sertanejo 2',
    'PREMIO 2027',
    'FUTEBOL 21H30',
    'SHOW 6S',
    'CHAMADA ESPECIAL',
    '',
    // 31-13 não é data: fica como está
    'TESTE 31-13',
    // número grudado em letras não abre a data
    'SP2-3',
  ])('fica igual: %s', (claquete) => {
    expect(claqueteComBarra(claquete)).toBe(claquete);
  });

  it('é idempotente', () => {
    for (const c of ['TERRA 26-11-2', 'Tempo 21 A 26-9', 'PRAIA 26.11 SP']) expect(claqueteComBarra(claqueteComBarra(c))).toBe(claqueteComBarra(c));
  });

  it('com uma data já com barra, não mexe nos traços de antes', () => {
    expect(claqueteComBarra('SEMANA 23-11 A 29/11')).toBe('SEMANA 23-11 A 29/11');
  });

  it('a chave, a data de exibição e a praça ficam iguais', () => {
    const hoje = new Date('2026-11-20T12:00:00');
    for (const c of ['DONA 27-11', 'TERRA 26-11-2', 'Tempo 21 A 26-9', 'RIO FESTA 3-12 (AH)', 'Festa na Praça 19-11 SP', 'PRAIA 26.11 SP', 'Novela das Seis 5-12-V2']) {
      const nova = claqueteComBarra(c);
      expect(chaveDaClaquete(nova)).toBe(chaveDaClaquete(c));
      expect(chaveN8n(nova)).toBe(chaveN8n(c));
      expect(pracaDaClaquete(nova)).toBe(pracaDaClaquete(c));
      // a claquete digitada com "-" já dava a data; com "_" ou "." não dava, e agora dá
      if (lerDataDaClaquete(c)) expect(dataDaClaquete(nova, hoje)).toBe(dataDaClaquete(c, hoje));
    }
    expect(dataDaClaquete(claqueteComBarra('PRAIA 26.11 SP'), hoje)).toBe('2026-11-26');
  });
});

describe('claqueteComBarra: a data colada em outra barra', () => {
  // "A/D-M": quando "A/D" não é data e "D-M" é, a "/" separava o número da data
  it.each([
    ['Copa Jogo 2 E 3/14-6', 'Copa Jogo 2 E 3 14/6'],
    ['Copa Jogo 1 E 2/13-6', 'Copa Jogo 1 E 2 13/6'],
    ['TORNEIO 2/15-3 SP', 'TORNEIO 2 15/3 SP'],
    ['TORNEIO 4/20-11-2', 'TORNEIO 4 20/11-2'],
  ])('%s → %s', (antes, depois) => {
    expect(claqueteComBarra(antes)).toBe(depois);
  });

  it.each([
    // "3/12" já é data: não mexe
    'JOGO 3/12-6',
    // "14-13" não é data
    'JOGO 3/14-13',
    // antes da barra não vem número
    'JOGO X/14-6',
  ])('fica igual: %s', (claquete) => {
    expect(claqueteComBarra(claquete)).toBe(claquete);
  });

  it('a chave, a chave do n8n, a praça e a data ficam iguais', () => {
    const hoje = new Date('2026-05-20T12:00:00');
    for (const c of ['Copa Jogo 2 E 3/14-6', 'TORNEIO 2/15-3 SP']) {
      const nova = claqueteComBarra(c);
      expect(chaveDaClaquete(nova)).toBe(chaveDaClaquete(c));
      expect(chaveN8n(nova)).toBe(chaveN8n(c));
      expect(pracaDaClaquete(nova)).toBe(pracaDaClaquete(c));
      expect(dataDaClaquete(nova, hoje)).toBe(dataDaClaquete(c, hoje));
      expect(claqueteComBarra(nova)).toBe(nova);
    }
  });
});

describe('claqueteComBarra: a data separada por espaço no fim do nome', () => {
  it.each([
    ['Eliana(Reperc)7 6', 'Eliana(Reperc)7/6'],
    ['ESPORTE 15 3 SP', 'ESPORTE 15/3 SP'],
    ['DONA 27 11', 'DONA 27/11'],
    ['NOVELA 5 12-V2', 'NOVELA 5/12-V2'],
    ['FESTA (AH) 3 12 INTER', 'FESTA (AH) 3/12 INTER'],
  ])('%s → %s', (antes, depois) => {
    expect(claqueteComBarra(antes)).toBe(depois);
  });

  it.each([
    // não é data válida
    'TESTE 31 2',
    'TESTE 5 13',
    // depois de "/" ou de outro número
    'SHOW 17/9 3',
    'JOGO 1 2 3',
    // o número colado na letra
    'Nome7 6',
    // depois do par, só a versão e a praça
    'PRAIA 3 12 ESPECIAL',
    // a atração com número no fim do nome: o primeiro número pode ser dela
    'Viver Sertanejo 2 5',
    // episódio, capítulo, temporada
    'Novela Cap 3 5',
    'Serie Ep 2 4',
    'Serie Temp 1 3',
  ])('fica igual: %s', (claquete) => {
    expect(claqueteComBarra(claquete)).toBe(claquete);
  });

  it('a chave, a chave do n8n e a praça ficam iguais, e a data passa a ser lida', () => {
    const hoje = new Date('2026-05-20T12:00:00');
    for (const [c, data] of [['Eliana(Reperc)7 6', '2026-06-07'], ['ESPORTE 15 3 SP', '2026-03-15'], ['NOVELA 5 12-V2', '2026-12-05']]) {
      const nova = claqueteComBarra(c);
      expect(chaveDaClaquete(nova)).toBe(chaveDaClaquete(c));
      expect(chaveN8n(nova)).toBe(chaveN8n(c));
      expect(pracaDaClaquete(nova)).toBe(pracaDaClaquete(c));
      expect(dataDaClaquete(nova, hoje)).toBe(data);
      expect(claqueteComBarra(nova)).toBe(nova);
    }
  });

  it('no padrão da casa, junto com os parênteses', () => {
    expect(claquetePadrao('ELIANA (REPERC) 7 6')).toBe('ELIANA(REPERC)7/6');
  });
});

describe('claquetePadrao: a barra na data e sem espaço em volta dos parênteses', () => {
  it.each([
    ['ELIANA (REPERC) 29-11', 'ELIANA(REPERC)29/11'],
    ['VERT (CALDEIRAO-LIBERTA) 28/11', 'VERT(CALDEIRAO-LIBERTA)28/11'],
    ['CASA(ESCALADA)28-11', 'CASA(ESCALADA)28/11'],
    ['NOVELA (PROLOGO DO CAP 1) 2-12 REDE', 'NOVELA(PROLOGO DO CAP 1)2/12 REDE'],
    ['RIO (CHEF) 3-12', 'RIO(CHEF)3/12'],
    ['DONA 27-11 (AH)', 'DONA 27/11(AH)'],
    ['FESTA (AH) SP', 'FESTA(AH) SP'],
    ['FESTA (AH) 3-12', 'FESTA(AH) 3/12'],
    ['SHOW (A) (B) 1-12', 'SHOW(A)(B)1/12'],
    ['TERRA 26-11-2', 'TERRA 26/11-2'],
    ['CHAMADA ESPECIAL', 'CHAMADA ESPECIAL'],
  ])('%s → %s', (antes, depois) => {
    expect(claquetePadrao(antes)).toBe(depois);
  });

  it('a chave, a chave do n8n, a comparação sem espaços, a data e a praça ficam iguais', () => {
    const hoje = new Date('2026-11-20T12:00:00');
    const casos = ['ELIANA (REPERC) 29-11', 'VERT (CALDEIRAO-LIBERTA) 28/11', 'NOVELA (PROLOGO DO CAP 1) 2-12 REDE', 'RIO (CHEF) 3-12', 'FESTA (AH) SP', 'FESTA (AH) 3-12', 'DONA 27-11 (AH)', 'SHOW (DIA) 4-12 SP'];
    for (const c of casos) {
      const nova = claquetePadrao(c);
      expect(chaveDaClaquete(nova)).toBe(chaveDaClaquete(c));
      expect(chaveN8n(nova)).toBe(chaveN8n(c));
      expect(chaveN8n(nova).replace(/ /g, '')).toBe(chaveN8n(c).replace(/ /g, ''));
      expect(pracaDaClaquete(nova)).toBe(pracaDaClaquete(c));
      expect(dataDaClaquete(nova, hoje)).toBe(dataDaClaquete(c, hoje));
      expect(claquetePadrao(nova)).toBe(nova);
    }
  });
});

describe('o roteiro que entra já tem a claquete no padrão', () => {
  it('a claquete tirada do nome do arquivo', () => {
    expect(claqueteDoArquivo('Eliana_(Reperc)_29_11.docx')).toBe('ELIANA(REPERC)29/11');
    expect(claqueteDoArquivo('Terra_26_11_2.docx')).toBe('TERRA 26/11-2');
    for (const a of ['Eliana_(Reperc)_29_11.docx', 'Festa (AH) 3_12 SP.docx', 'Passeio_No_Parque_11_07_Rede.docx']) expect(claquetePadrao(claqueteDoArquivo(a))).toBe(claqueteDoArquivo(a));
  });
});
