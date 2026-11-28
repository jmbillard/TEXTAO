/* Os comentários do Roteiro escrito (#192): a âncora por citação, o fio, a menção @nome e quem ganha o aviso. Nomes
   inventados. */
import { describe, expect, it } from 'vitest';
import { acharAncora, ancoraDe, ancoraValida, fiosDosComentarios, mencaoSendoDigitada, mencoesDoTexto, pedacosComMencoes, quemAvisar, quemCombina, type Comentario } from '../src/modelo/comentarios';

const TEXTO = 'NESTE SÁBADO, A BRASA DECIDE.\nOITO CHURRASQUEIROS. UM SÓ TÍTULO.\nE A FINAL TEM JURADO NOVO.';

describe('a âncora por citação', () => {
  const de = TEXTO.indexOf('UM SÓ TÍTULO');
  const ancora = ancoraDe(TEXTO, de, de + 'UM SÓ TÍTULO'.length);

  it('guarda o trecho, o contexto e o lugar', () => {
    expect(ancora.trecho).toBe('UM SÓ TÍTULO');
    expect(ancora.antes.endsWith('CHURRASQUEIROS. ')).toBe(true);
    expect(ancora.depois.startsWith('.\nE A FINAL')).toBe(true);
    expect(acharAncora(TEXTO, ancora)).toEqual({ de, ate: de + 12 });
  });

  it('sobrevive ao texto reescrito em volta (antes e depois)', () => {
    const novo = 'AGORA É SÁBADO QUE VEM.\nUM PARÁGRAFO NOVO AQUI.\nDOZE CHURRASQUEIROS. UM SÓ TÍTULO! NOVIDADE.';
    const achado = acharAncora(novo, ancora)!;
    expect(novo.slice(achado.de, achado.ate)).toBe('UM SÓ TÍTULO');
  });

  it('com o trecho repetido, fica o de contexto mais parecido, mesmo longe do lugar guardado', () => {
    const novo = 'UM SÓ TÍTULO NO COMEÇO.\n'.repeat(3) + 'OITO CHURRASQUEIROS. UM SÓ TÍTULO.\nE A FINAL';
    const achado = acharAncora(novo, ancora)!;
    expect(achado.de).toBe(novo.lastIndexOf('UM SÓ TÍTULO'));
  });

  it('empatado no contexto, fica o mais perto do lugar guardado', () => {
    const t = 'ARTE. ARTE. ARTE.';
    expect(acharAncora(t, { trecho: 'ARTE', antes: '', depois: '', pos: 12 })).toEqual({ de: 12, ate: 16 });
  });

  it('acha sem caixa quando a caixa mudou; sem o trecho, null', () => {
    expect(acharAncora(TEXTO.replace('UM SÓ TÍTULO', 'Um só título'), ancora)).not.toBeNull();
    expect(acharAncora(TEXTO.replace('UM SÓ TÍTULO', 'OUTRA COISA'), ancora)).toBeNull();
  });

  it('a âncora de fora é limpa; sem trecho não vale', () => {
    expect(ancoraValida({ trecho: '' })).toBeNull();
    expect(ancoraValida(null)).toBeNull();
    expect(ancoraValida({ trecho: 'x', antes: 'a'.repeat(99), pos: -3 })).toEqual({ trecho: 'x', antes: 'a'.repeat(32), depois: '', pos: 0 });
  });
});

describe('o fio', () => {
  const c = (id: string, fio: string | null, criadoEm: string): Comentario => ({ id, fio, autor: { nome: 'A', email: 'a@x' }, papel: '', texto: id, criadoEm, ancora: null, resolvido: null });
  it('junta as respostas ao comentário de cima, na ordem em que chegaram', () => {
    const fios = fiosDosComentarios([c('r2', 'c1', '2026-11-28T10:03'), c('c2', null, '2026-11-28T10:02'), c('c1', null, '2026-11-28T10:00'), c('r1', 'c1', '2026-11-28T10:01')]);
    expect(fios.map((f) => [f.id, f.respostas.map((r) => r.id)])).toEqual([
      ['c1', ['r1', 'r2']],
      ['c2', []],
    ]);
  });
});

describe('a menção @nome', () => {
  const pessoas = [
    { nome: 'Marina Teles', email: 'marina@x' },
    { nome: 'Ana Paula Reis', email: 'anapaula@x' },
    { nome: 'Ana Lima', email: 'ana@x' },
    { nome: 'Júlio César Pires', email: 'julio@x' },
  ];
  it('acha pelo nome inteiro, pelo primeiro e último, e pelo primeiro sem xará, sem caixa e sem acento', () => {
    expect(mencoesDoTexto('@Marina Teles, dá uma olhada', pessoas).map((p) => p.email)).toEqual(['marina@x']);
    expect(mencoesDoTexto('falei com @marina e @JULIO pires', pessoas).map((p) => p.email)).toEqual(['marina@x', 'julio@x']);
    expect(mencoesDoTexto('@Ana Paula Reis e @ana lima', pessoas).map((p) => p.email)).toEqual(['anapaula@x', 'ana@x']);
  });
  it('o primeiro nome com xará não acha ninguém; e-mail não é menção; cada pessoa uma vez', () => {
    expect(mencoesDoTexto('@Ana, veja', pessoas)).toEqual([]);
    expect(mencoesDoTexto('mande para marina@x.com', pessoas)).toEqual([]);
    expect(mencoesDoTexto('@Marina @marina teles', pessoas)).toHaveLength(1);
  });
  it('separa as menções do texto, só o nome achado', () => {
    expect(pedacosComMencoes('oi @Marina Teles disse', pessoas)).toEqual([{ texto: 'oi ' }, { texto: '@Marina Teles', mencao: pessoas[0] }, { texto: ' disse' }]);
    expect(pedacosComMencoes('sem ninguém', pessoas)).toEqual([{ texto: 'sem ninguém' }]);
  });
  it('o @ sendo digitado e quem combina', () => {
    expect(mencaoSendoDigitada('olha isso @ma')).toBe('ma');
    expect(mencaoSendoDigitada('olha isso')).toBeNull();
    expect(mencaoSendoDigitada('a@ma')).toBeNull();
    expect(quemCombina('ana', pessoas).map((p) => p.email)).toEqual(['ana@x', 'anapaula@x']);
    expect(quemCombina('reis', pessoas).map((p) => p.email)).toEqual(['anapaula@x']);
  });
});

describe('quem ganha o aviso', () => {
  it('as citadas e o autor do roteiro, menos quem escreveu; a menção vale mais', () => {
    expect(quemAvisar({ autor: 'davi@x', donoDoRoteiro: 'marina@x', citadas: ['julio@x'] })).toEqual([
      { email: 'julio@x', motivo: 'mencao' },
      { email: 'marina@x', motivo: 'no-seu' },
    ]);
    expect(quemAvisar({ autor: 'marina@x', donoDoRoteiro: 'marina@x', citadas: ['marina@x'] })).toEqual([]);
    expect(quemAvisar({ autor: 'davi@x', donoDoRoteiro: 'marina@x', citadas: ['marina@x'] })).toEqual([{ email: 'marina@x', motivo: 'mencao' }]);
  });
});
