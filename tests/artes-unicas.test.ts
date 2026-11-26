import { describe, expect, it } from 'vitest';
import { artesDoEnvio, artesUnicas, exportar, pendencias } from '../src/modelo/exportar';
import { metaVazia, type Meta, type NoJSON, type Roteiro } from '../src/modelo/tipos';

/* O redator sublinha a mesma arte várias vezes no roteiro (IZA, HOJE, DOMINGÃO…): a lista, as contas e o checklist
   levam cada arte uma vez só. */

const doc = (artes: (string | [string, string])[]): NoJSON => ({
  type: 'doc',
  content: artes.map((a, k) => {
    const [texto, subtipo] = typeof a === 'string' ? [a, ''] : a;
    return { type: 'paragraph', content: [{ type: 'text', text: 'Locução ' }, { type: 'text', text: texto, marks: [{ type: 'arte', attrs: { id: `a${k}`, subtipo, obs: '' } }] }, { type: 'text', text: '.' }] };
  }),
});
const roteiro = (artes: (string | [string, string])[], meta: Partial<Meta> = {}): Roteiro => ({
  id: 't',
  meta: { ...metaVazia(), redator: 'Fulana', editor: 'Fulano', dataExibicao: '2026-11-29', ...meta },
  doc: doc(artes),
  revisao: 1,
  criadoEm: '',
  atualizadoEm: '',
});

describe('artes únicas', () => {
  it('a mesma arte repetida aparece uma vez, na ordem da primeira aparição, numerada de novo', () => {
    const s = exportar(roteiro(['IZA', '6:10', 'IZA', 'DOMINGO', '6:10', 'IZA', 'HOJE']));
    const u = artesUnicas(s.artes);
    expect(u.map((a) => [a.ordem, a.texto])).toEqual([[1, 'IZA'], [2, '6:10'], [3, 'DOMINGO'], [4, 'HOJE']]);
    // cada uma lembra onde aparece no texto (a primeira é a que a lista aponta)
    expect(u[0].ids).toEqual(['a0', 'a2', 'a5']);
    expect(u[0].id).toBe('a0');
  });

  it('é a mesma arte com outra caixa, acento ou pontuação (a chave do acervo); palavras juntas são outra', () => {
    const s = exportar(roteiro(['DOMINGÃO COM HUCK', 'Domingão com Huck!', 'domingao  com   huck', 'AO VIVO!', 'Ao vivo', 'AOVIVO']));
    expect(artesUnicas(s.artes).map((a) => a.texto)).toEqual(['DOMINGÃO COM HUCK', 'AO VIVO!', 'AOVIVO']);
  });

  it('os tipos das repetidas se somam: cada tipo é uma produção', () => {
    const s = exportar(roteiro([['HOJE', 'rodape'], ['HOJE', 'cartao'], ['HOJE', 'rodape']]));
    const [hoje] = artesUnicas(s.artes);
    expect(hoje.subtipos).toEqual(['rodape', 'cartao']);
    expect(hoje.subtipo).toBe('rodape');
    expect(hoje.subtipoNome).toBe('Rodapé + Cartão');
  });

  it('"Muitas artes" conta as artes únicas', () => {
    const nove = Array.from({ length: 9 }, (_, k) => `ARTE ${k}`);
    expect(pendencias(exportar(roteiro([...nove, ...nove, ...nove])))).toEqual([]);
    expect(pendencias(exportar(roteiro([...nove, 'ARTE 9', ...nove])))).toEqual(['Muitas artes: 10']);
  });
});

describe('as artes que vão ao Trello', () => {
  it('cada arte uma vez, com o estado dela (já existe, complexidade); a que não vai ser produzida fica de fora', () => {
    const r = roteiro(['IZA', 'HOJE', 'IZA', 'DOMINGO', 'HOJE', 'IZA'], { jaExiste: ['DOMINGO'], naoProduzir: ['HOJE'], complexidade: { IZA: 3 } });
    expect(artesDoEnvio(exportar(r), r.meta)).toEqual([
      { texto: 'IZA', tipo: '', tipos: [], existe: false, complexidade: 3 },
      { texto: 'DOMINGO', tipo: '', tipos: [], existe: true, complexidade: 1 },
    ]);
  });

  it('a do acervo da atração repetida vai uma vez, como já existe', () => {
    const r = roteiro(['IZA', 'Iza', 'IZA.'], { jaExistem: [{ arte: 'IZA', chave: 'IZA', tipo: 'CRT', claquete: 'X' }] });
    expect(artesDoEnvio(exportar(r), r.meta)).toEqual([{ texto: 'IZA', tipo: '', tipos: [], existe: true, complexidade: 1 }]);
  });

  it('os tipos somados das repetidas vão em siglas', () => {
    const r = roteiro([['HOJE', 'rodape'], ['hoje', 'cartao']]);
    expect(artesDoEnvio(exportar(r), r.meta)).toEqual([{ texto: 'HOJE', tipo: 'RDP, CRT', tipos: ['RDP', 'CRT'], existe: false, complexidade: 1 }]);
  });
});
