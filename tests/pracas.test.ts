import { describe, expect, it } from 'vitest';
import { interpretar } from '../src/importar/interpretar';
import { grupoDoCard } from '../src/modelo/duplicadas';
import {
  MARCA_TODAS,
  PRACAS_DE_FABRICA,
  comoAsPracasAparecem,
  normalizarPraca,
  pracaPadrao,
  pracasDaConfiguracao,
  pracasParaONavegador,
  pracasRegistradas,
  reconhecerPraca,
  registrarPracas,
  semPracaNoComeco,
  semPracaNoFim,
  siglasDasPracas,
  type Praca,
} from '../src/modelo/pracas';

describe('reconhecer a praça na claquete, com as praças de fábrica', () => {
  const r = (claquete: string) => reconhecerPraca(claquete, PRACAS_DE_FABRICA);

  it('o Rio começa por RIO e um separador; SP e INTER terminam com a sigla; o resto é a padrão (G5)', () => {
    expect(['Rio Fut 21/11', 'Rio(Vim De La)21/11-2', 'RIO SHOW 5/12', 'Rio_Show', 'rio-mira 21/11'].map(r)).toEqual(['RJ', 'RJ', 'RJ', 'RJ', 'RJ']);
    expect(['Encontro 19/11 SP', 'Festa 2/12 sp', 'Chamada 3/12 INTER', 'Chamada 3/12 Internacional'].map(r)).toEqual(['SP', 'SP', 'INTER', 'INTER']);
    expect(['Encontro 19/11', 'RIOS DO BRASIL 5/12', 'RIOGRANDENSE', 'RIO', 'FESTA_SP', 'FESTA 19/11 REDE', 'FESTA 19/11 MG'].map(r)).toEqual(['G5', 'G5', 'G5', 'G5', 'G5', 'G5', 'G5']);
  });
});

/** Uma configuração de teste: MG passa a ser praça (termina em MG) e sai do "também lida como" da G5. */
const COM_MG: Praca[] = [
  { ...PRACAS_DE_FABRICA[0], tambem: ['REDE', 'DF', 'PE'] },
  ...PRACAS_DE_FABRICA.slice(1),
  { sigla: 'MG', nome: 'Minas', padrao: false, regra: { onde: 'fim', palavras: ['MG', 'MINAS'] }, tambem: ['BH'], entrada: 'listaMG', saida: '', opcao: 'opMG' },
];

describe('uma praça nova, a ordem e a padrão', () => {
  it('a praça nova é reconhecida pela regra dela; as outras continuam iguais', () => {
    expect(['FESTA 19/11 MG', 'FESTA 19/11 Minas', 'FESTA 19/11 SP', 'RIO FESTA 19/11', 'FESTA 19/11'].map((c) => reconhecerPraca(c, COM_MG))).toEqual(['MG', 'MG', 'SP', 'RJ', 'G5']);
  });

  it('o "também lida como" no fim da claquete vale quando nenhuma regra bate', () => {
    expect(['FESTA 19/11 BH', 'RIO FESTA 19/11 BH'].map((c) => reconhecerPraca(c, COM_MG))).toEqual(['MG', 'RJ']);
    expect(reconhecerPraca('RIO SHOW 5/12 REDE', PRACAS_DE_FABRICA)).toBe('RJ');
  });

  it('quando duas regras batem, vale a primeira na ordem', () => {
    expect(reconhecerPraca('RIO SHOW 5/12 SP', PRACAS_DE_FABRICA)).toBe('RJ');
    const spAntes = [PRACAS_DE_FABRICA[0], PRACAS_DE_FABRICA[2], PRACAS_DE_FABRICA[1], PRACAS_DE_FABRICA[3]];
    expect(reconhecerPraca('RIO SHOW 5/12 SP', spAntes)).toBe('SP');
  });

  it('sem regra que bata, vale a padrão, esteja onde estiver na lista', () => {
    const rjPadrao = PRACAS_DE_FABRICA.map((p) => ({ ...p, padrao: p.sigla === 'RJ' }));
    expect(reconhecerPraca('FESTA 19/11', rjPadrao)).toBe('RJ');
    expect(normalizarPraca('XYZ', rjPadrao)).toBe('RJ');
    expect(reconhecerPraca('FESTA 19/11 SP', rjPadrao)).toBe('SP');
  });
});

describe('normalizar a praça lida (PGM:, nome do arquivo, opção do Trello)', () => {
  it('com as de fábrica: SP e RJ ficam; INTER e INTERNACIONAL são INTER; REDE, MG, DF, PE e o resto são G5', () => {
    expect(['SP', 'rj', 'INTER', 'Internacional', 'REDE', 'G5', 'MG', 'DF', 'PE', 'XX', ''].map((p) => normalizarPraca(p, PRACAS_DE_FABRICA))).toEqual([
      'SP', 'RJ', 'INTER', 'INTER', 'G5', 'G5', 'G5', 'G5', 'G5', 'G5', 'G5',
    ]);
  });

  it('com a praça nova, a sigla e o "também lida como" dela', () => {
    expect(['MG', 'bh', 'REDE', 'DF'].map((p) => normalizarPraca(p, COM_MG))).toEqual(['MG', 'MG', 'G5', 'G5']);
  });

  it('como as praças aparecem escritas: a sigla e o "também lida como" de cada uma', () => {
    expect([...comoAsPracasAparecem(PRACAS_DE_FABRICA)].sort()).toEqual(['DF', 'G5', 'INTER', 'INTERNACIONAL', 'MG', 'PE', 'REDE', 'RJ', 'SP']);
  });
});

describe('tirar a praça da chave', () => {
  it('do fim: as regras "termina em", as siglas e o "também lida como"; do começo: as regras "começa com"', () => {
    expect(['FESTA 19 11 SP', 'FESTA 19 11 REDE', 'FESTA 19 11 INTERNACIONAL', 'FESTA 19 11', 'FESTA SPA'].map((c) => semPracaNoFim(c, PRACAS_DE_FABRICA))).toEqual([
      'FESTA 19 11', 'FESTA 19 11', 'FESTA 19 11', 'FESTA 19 11', 'FESTA SPA',
    ]);
    expect(semPracaNoFim('QUEM AMA 20 11 PRACAS', PRACAS_DE_FABRICA, [MARCA_TODAS])).toBe('QUEM AMA 20 11');
    expect(['RIO FESTA 19 11', 'RIOS DO BRASIL'].map((c) => semPracaNoComeco(c, PRACAS_DE_FABRICA))).toEqual(['FESTA 19 11', 'RIOS DO BRASIL']);
    expect(semPracaNoFim('FESTA 19 11 MINAS', COM_MG)).toBe('FESTA 19 11');
  });
});

describe('as praças da configuração', () => {
  it('sem coleção salva, as de fábrica com a entrada, a saída e a opção das variáveis de hoje', () => {
    const pracas = pracasDaConfiguracao({ TRELLO_LISTA_SP: 'listaSP', TRELLO_SAIDA_SP: 'saidaSP', TRELLO_LISTA_G5: 'listaRJ', TRELLO_PRACAS: 'G5=opG5, SP=opSP' });
    expect(pracas.map((p) => [p.sigla, p.padrao, p.entrada, p.saida, p.opcao])).toEqual([
      ['G5', true, 'listaRJ', '', 'opG5'],
      ['RJ', false, '', '', ''],
      ['SP', false, 'listaSP', 'saidaSP', 'opSP'],
      ['INTER', false, '', '', ''],
    ]);
  });

  it('a coleção salva vale no lugar das de fábrica; sem padrão marcada, a primeira; ilegível, as de fábrica', () => {
    const salvas = [{ sigla: 'sp', regra: { onde: 'fim', palavras: ['sp'] }, entrada: 'l1' }, { sigla: 'G5', tambem: ['rede'] }];
    const pracas = pracasDaConfiguracao({ PRACAS: JSON.stringify(salvas), TRELLO_LISTA_SP: 'ignorada' });
    expect(pracas.map((p) => [p.sigla, p.padrao, p.entrada, p.tambem])).toEqual([['SP', true, 'l1', []], ['G5', false, '', ['REDE']]]);
    expect(siglasDasPracas(pracasDaConfiguracao({ PRACAS: '{quebrado' }))).toEqual(['G5', 'RJ', 'SP', 'INTER']);
    expect(pracaPadrao(pracasDaConfiguracao({ PRACAS: '[]' })).sigla).toBe('G5');
  });
});

describe('as praças do navegador', () => {
  it('até o servidor mandar, valem as de fábrica; depois, as dele; vazio volta às de fábrica', () => {
    expect(reconhecerPraca('FESTA 19/11 MG')).toBe('G5');
    registrarPracas(pracasParaONavegador(COM_MG));
    try {
      expect(reconhecerPraca('FESTA 19/11 MG')).toBe('MG');
      expect(pracasRegistradas().find((p) => p.sigla === 'MG')?.entrada).toBe('');
    } finally {
      registrarPracas(null);
    }
    expect(reconhecerPraca('FESTA 19/11 MG')).toBe('G5');
  });
});

describe('a leitura do roteiro usa as praças registradas', () => {
  const praca = (arquivo: string) => interpretar({ arquivo, formato: 'rtf', autor: '', blocos: [] }, { anoPadrao: 2026 }).meta.praca;

  it('o nome do arquivo e a claquete: com as de fábrica, MG é a G5; com MG registrada, é MG', () => {
    expect([praca('Festa_4_12_MG.rtf'), praca('Festa 4-12 Minas.rtf'), praca('Festa_4_12_SP.rtf')]).toEqual(['G5', 'G5', 'SP']);
    registrarPracas(pracasParaONavegador(COM_MG));
    try {
      expect([praca('Festa_4_12_MG.rtf'), praca('Festa 4-12 Minas.rtf'), praca('Festa_4_12_SP.rtf'), praca('Festa_4_12_BH.rtf')]).toEqual(['MG', 'MG', 'SP', 'MG']);
    } finally {
      registrarPracas(null);
    }
  });
});

describe('a chave das Duplicadas tira a praça escrita', () => {
  it('a praça do fim e a do começo saem da chave e a praça vai à parte; com MG registrada, MG é outra praça', () => {
    const g = (nome: string, pracas: readonly Praca[]) => grupoDoCard({ nome, praca: '' }, pracas).id;
    expect([g('Festa 19/11 SP', PRACAS_DE_FABRICA), g('RIO FESTA 19/11', PRACAS_DE_FABRICA), g('Festa 19/11 REDE', PRACAS_DE_FABRICA)]).toEqual([
      'FESTA 19 11|SP|', 'FESTA 19 11|RJ|', 'FESTA 19 11|G5|',
    ]);
    expect(g('Festa 19/11 MG', COM_MG)).toBe('FESTA 19 11|MG|');
    expect(g('Festa 19/11', COM_MG)).toBe('FESTA 19 11|G5|');
  });
});
