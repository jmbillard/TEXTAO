import { describe, expect, it } from 'vitest';
import { chaveDaClaquete, claqueteComBarra, claqueteDoArquivo, claquetePadrao, dataDaClaquete, lerDataDaClaquete, pracaDaClaquete } from '../src/modelo/vocabularios';
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
