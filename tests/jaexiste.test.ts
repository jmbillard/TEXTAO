import { describe, expect, it } from 'vitest';
import { artesQueJaExistem } from '../src/modelo/exportar';
import type { Saida } from '../src/modelo/exportar';

const saida = (jaExiste?: string[], naoProduzir?: string[]) =>
  ({
    roteiro: { jaExistem: [{ arte: 'HOJE', chave: 'HOJE', tipo: 'RDP', claquete: 'X' }, { arte: 'AMANHÃ', chave: 'AMANHA', tipo: '', claquete: 'Y' }], jaExiste, naoProduzir },
    artes: [{ texto: 'Hoje' }, { texto: 'Amanhã!' }, { texto: 'Sexta' }],
  }) as unknown as Saida;

describe('já existe', () => {
  it('a arte do acervo que quem revisa marcou como "já existe" deixa de contar como pendência', () => {
    expect(artesQueJaExistem(saida())).toEqual(['HOJE', 'AMANHA']);
    expect(artesQueJaExistem(saida(['HOJE']))).toEqual(['AMANHA']);
    expect(artesQueJaExistem(saida(['HOJE', 'AMANHA']))).toEqual([]);
    expect(artesQueJaExistem(saida(['HOJE'], ['AMANHA']))).toEqual([]); // não produzir também resolve
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
