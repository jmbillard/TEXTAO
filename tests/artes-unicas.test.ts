import { describe, expect, it } from 'vitest';
import { artesDoEnvio, artesUnicas, exportar, pendencias, quantasAProduzir } from '../src/modelo/exportar';
import { metaVazia, type Meta, type NoJSON, type Roteiro } from '../src/modelo/tipos';
// @ts-expect-error módulo JS sem tipos
import { artesDaProducao, itensDoChecklist } from '../servidor/trello.mjs';

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

  it('"Muitas artes" conta as artes únicas a produzir', () => {
    const nove = Array.from({ length: 9 }, (_, k) => `ARTE ${k}`);
    expect(pendencias(exportar(roteiro([...nove, ...nove, ...nove])))).toEqual([]);
    expect(pendencias(exportar(roteiro([...nove, 'ARTE 9', ...nove])))).toEqual(['Muitas artes: 10']);
    // a que já existe e a que não vai ser produzida não pesam no trabalho da equipe
    expect(pendencias(exportar(roteiro([...nove, 'ARTE 9', 'ARTE 10'], { jaExiste: ['ARTE 9'], naoProduzir: ['ARTE 10'] })))).toEqual([]);
    expect(pendencias(exportar(roteiro([...nove, 'ARTE 9', 'ARTE 10', 'ARTE 11'], { jaExiste: ['ARTE 11'] })))).toEqual(['Muitas artes: 11']);
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

describe('as artes a produzir (o "N artes" da fila, da agenda e do editor)', () => {
  it('6 artes únicas, 2 já existem e 1 não vai ser produzida: 3', () => {
    const r = roteiro(['IZA', 'HOJE', 'DOMINGO', 'IZA', '6:10', 'ELIANA', 'AO VIVO', 'HOJE'], {
      jaExiste: ['DOMINGO'],
      jaExistem: [{ arte: '6:10', chave: '6 10', tipo: 'CRT', claquete: 'X' }],
      naoProduzir: ['ELIANA'],
    });
    const s = exportar(r);
    expect(artesUnicas(s.artes)).toHaveLength(6);
    expect(quantasAProduzir(s, r.meta)).toBe(3);
  });

  it('a repetida com tipos diferentes conta uma', () => {
    const r = roteiro([['HOJE', 'rodape'], ['hoje', 'cartao'], ['IZA', 'cartao']]);
    expect(quantasAProduzir(exportar(r), r.meta)).toBe(2);
  });

  it('sem a meta, usa a do próprio roteiro exportado', () => {
    const r = roteiro(['IZA', 'HOJE'], { naoProduzir: ['HOJE'] });
    expect(quantasAProduzir(exportar(r))).toBe(1);
  });

  it('a arte do acervo devolvida à lista (produzir) volta a contar', () => {
    const r = roteiro(['IZA', 'HOJE'], { jaExistem: [{ arte: 'IZA', chave: 'IZA', tipo: 'CRT', claquete: 'X' }], produzir: ['IZA'] });
    expect(quantasAProduzir(exportar(r), r.meta)).toBe(2);
  });

  it('bate com o que o envio põe no checklist e o Teable conta (artesDaProducao)', () => {
    const r = roteiro([['HOJE', 'rodape'], ['hoje', 'cartao'], 'IZA', 'DOMINGO', 'ELIANA (AO VIVO)', 'IZA', 'FIM'], { jaExiste: ['DOMINGO'], naoProduzir: ['FIM'] });
    const s = exportar(r);
    const checklist: string[] = itensDoChecklist(artesDoEnvio(s, r.meta));
    expect(checklist).toEqual(['HOJE (RDP)', 'HOJE (CRT)', 'IZA', 'ELIANA (AO VIVO)']);
    expect(artesDaProducao(checklist.join(' | '))).toBe(quantasAProduzir(s, r.meta));
    expect(quantasAProduzir(s, r.meta)).toBe(3);
  });
});
