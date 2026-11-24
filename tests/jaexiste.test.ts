import { describe, expect, it } from 'vitest';
import { alternarJaExiste, artesQueJaExistem, chavesQueExistem } from '../src/modelo/exportar';
import type { Saida } from '../src/modelo/exportar';

const saida = (jaExiste?: string[], naoProduzir?: string[], produzir?: string[]) =>
  ({
    roteiro: { jaExistem: [{ arte: 'HOJE', chave: 'HOJE', tipo: 'RDP', claquete: 'X' }, { arte: 'AMANHÃ', chave: 'AMANHA', tipo: '', claquete: 'Y' }], jaExiste, naoProduzir, produzir },
    artes: [{ texto: 'Hoje' }, { texto: 'Amanhã!' }, { texto: 'Sexta' }],
  }) as unknown as Saida;

describe('já existe', () => {
  it('a arte que está no acervo da atração já vem riscada (existe), sem virar pendência', () => {
    expect([...chavesQueExistem(saida().roteiro)].sort()).toEqual(['AMANHA', 'HOJE']);
    expect(artesQueJaExistem(saida())).toEqual([]);
  });
  it('↺ (produzir) tira a do acervo do riscado; ✕ (não produzir) também; ✓ vale para qualquer arte', () => {
    expect([...chavesQueExistem(saida(undefined, undefined, ['HOJE']).roteiro)]).toEqual(['AMANHA']);
    expect([...chavesQueExistem(saida(undefined, ['AMANHA']).roteiro)]).toEqual(['HOJE']);
    expect([...chavesQueExistem(saida(['SEXTA']).roteiro)].sort()).toEqual(['AMANHA', 'HOJE', 'SEXTA']);
    // a que quem revisa mandou produzir não volta como pendência
    expect(artesQueJaExistem(saida(undefined, undefined, ['HOJE']))).toEqual([]);
  });
});

import { juntarTipos, nomesDosTipos, normalizarSubtipo, siglaDoTipo, tiposDaArte } from '../src/modelo/tipos';

describe('mais de um tipo por arte', () => {
  it('guarda juntos, na ordem da lista, sem repetir; o primeiro serve onde só cabe um', () => {
    expect(tiposDaArte('lettering,foto,lettering')).toEqual(['lettering', 'foto']);
    expect(juntarTipos(['cartao', 'rodape', 'xxx'])).toBe('rodape,cartao');
    expect(normalizarSubtipo('foto,lettering')).toBe('lettering');
    expect(normalizarSubtipo('tela_cheia')).toBe('cartao'); // roteiro antigo
    expect(nomesDosTipos('rodape,cartao')).toBe('Rodapé + Cartão');
    expect(nomesDosTipos('')).toBe('Sem tipo');
    expect(tiposDaArte('rodape,cartao').map(siglaDoTipo)).toEqual(['RDP', 'CRT']);
  });
});

import { partesDaArte } from '../src/editor/extensoes';

describe('dividir a arte', () => {
  it('pelas pontuações, sem os separadores', () => {
    expect(partesDaArte('SÁBADO/AMANHÃ/HOJE').map((p) => p.texto)).toEqual(['SÁBADO', 'AMANHÃ', 'HOJE']);
    expect(partesDaArte('Cartão tela cheia: 3 COZINHAS').map((p) => p.texto)).toEqual(['Cartão tela cheia', '3 COZINHAS']);
    expect(partesDaArte('HOJE... DEPOIS DO JORNAL, 9:45').map((p) => p.texto)).toEqual(['HOJE', 'DEPOIS DO JORNAL', '9:45']);
    expect(partesDaArte('FLAMENGO X VASCO - AO VIVO').map((p) => p.texto)).toEqual(['FLAMENGO X VASCO', 'AO VIVO']);
    expect(partesDaArte('3 COZINHAS')).toHaveLength(1);
    const t = 'A, B';
    expect(partesDaArte(t).map((p) => t.slice(p.ini, p.fim))).toEqual(['A', 'B']);
  });
});

import { remarcar } from '../src/modelo/exportar';

describe('a bolinha do índice marca e devolve a arte', () => {
  const meta = (m: { jaExiste?: string[]; naoProduzir?: string[]; produzir?: string[] } = {}) => ({ ...saida(m.jaExiste, m.naoProduzir, m.produzir).roteiro });
  it('a arte a produzir passa a existir, e volta a produzir no segundo clique', () => {
    const marcada = { ...meta(), ...remarcar(meta(), ['SEXTA'], 'existe') };
    expect(marcada.jaExiste).toEqual(['SEXTA']);
    expect(chavesQueExistem(marcada).has('SEXTA')).toBe(true);
    const devolvida = { ...marcada, ...remarcar(marcada, ['SEXTA'], null) };
    expect(devolvida.jaExiste).toBeUndefined();
    expect(chavesQueExistem(devolvida).has('SEXTA')).toBe(false);
  });
  it('a arte fora (✕) volta para a lista', () => {
    const fora = meta({ naoProduzir: ['SEXTA'] });
    expect(remarcar(fora, ['SEXTA'], null)).toEqual({ jaExiste: undefined, naoProduzir: undefined, produzir: undefined });
  });
  it('a arte do acervo volta a produzir e fica lembrada como "produzir"', () => {
    const devolvida = { ...meta(), ...remarcar(meta(), ['HOJE'], null) };
    expect(devolvida.produzir).toEqual(['HOJE']);
    expect([...chavesQueExistem(devolvida)]).toEqual(['AMANHA']);
  });
  it('o ✕ tira a arte que já existia da lista de "já existe"', () => {
    expect(remarcar(meta({ jaExiste: ['SEXTA', 'DOMINGO'] }), ['SEXTA'], 'fora')).toEqual({ jaExiste: ['DOMINGO'], naoProduzir: ['SEXTA'], produzir: undefined });
  });
});

describe('já existe pelo teclado', () => {
  it('como a bolinha: a arte a produzir vira "já existe"; a que já existe ou está fora volta para a lista', () => {
    expect(alternarJaExiste({}, ['HOJE'])).toEqual({ jaExiste: ['HOJE'], naoProduzir: undefined, produzir: undefined });
    expect(alternarJaExiste({ jaExiste: ['HOJE'] }, ['HOJE'])).toEqual({ jaExiste: undefined, naoProduzir: undefined, produzir: undefined });
    expect(alternarJaExiste({ naoProduzir: ['HOJE'] }, ['HOJE'])).toEqual({ jaExiste: undefined, naoProduzir: undefined, produzir: undefined });
  });

  it('na seleção: se alguma ainda vai ser produzida, todas viram "já existe"; se todas já saíram, todas voltam', () => {
    expect(alternarJaExiste({ jaExiste: ['HOJE'] }, ['HOJE', 'AMANHA']).jaExiste?.sort()).toEqual(['AMANHA', 'HOJE']);
    expect(alternarJaExiste({ jaExiste: ['HOJE'], naoProduzir: ['AMANHA'] }, ['HOJE', 'AMANHA'])).toEqual({ jaExiste: undefined, naoProduzir: undefined, produzir: undefined });
  });
});
