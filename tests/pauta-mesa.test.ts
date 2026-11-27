import { describe, expect, it } from 'vitest';
import { buscarNaPauta, contaDoEditor, ehDaPessoa, recadoDoDia, veOQueSobrou, type LinhaDaPauta, type ProducaoNaPauta } from '../src/modelo/pauta';

/* A Pauta da edição como no mock-up (#162): o "Minha pauta" de quem é editor, a contagem do dia (as claquetes com a
   arte entregue), o recado do dia (o aviso sem editor) e a busca por claquete, atração e editor. */

let n = 0;
const producao = (etapa: ProducaoNaPauta['etapa']): ProducaoNaPauta => ({ id: `p${++n}`, claquete: '', praca: '', etapa, artes: 1, designers: [], alta: false, entradaEm: null, entregaEm: null });
function linha(texto: string, editor: string, tipo: LinhaDaPauta['tipo'] = 'claquete', producoes: ProducaoNaPauta[] = [], dia = '2026-11-27'): LinhaDaPauta {
  return { id: `l${++n}`, dia, editor, tipo, texto, turno: null, versoes: [], semVersao: texto.replace(/\s*\([A-Z]+\)$/, ''), ...(tipo === 'claquete' ? { chave: texto, producoes } : {}) };
}

describe('quem é a pessoa na pauta', () => {
  it('compara o editor sem caixa, acento e pontuação; sem editor ligado, ninguém', () => {
    expect(ehDaPessoa('Carla Duarte', 'carla duarte')).toBe(true);
    expect(ehDaPessoa('Joao Lucio', 'João Lúcio')).toBe(true);
    expect(ehDaPessoa('Ana Ribeiro', 'Carla Duarte')).toBe(false);
    expect(ehDaPessoa('', null)).toBe(false);
    expect(ehDaPessoa('', '')).toBe(false);
  });
});

describe('quem vê o "Sobrou · sem editor" (#172)', () => {
  it('a coordenação e os editores; os outros perfis (designer, redator), não', () => {
    expect(veOQueSobrou({ coordenacao: true, editor: null })).toBe(true);
    expect(veOQueSobrou({ coordenacao: false, editor: 'Carla Duarte' })).toBe(true);
    expect(veOQueSobrou({ coordenacao: true, editor: 'Carla Duarte' })).toBe(true);
    expect(veOQueSobrou({ coordenacao: false, editor: null })).toBe(false);
    expect(veOQueSobrou({ coordenacao: false, editor: '' })).toBe(false);
    expect(veOQueSobrou({ coordenacao: false, editor: undefined })).toBe(false);
  });
});

describe('a contagem do dia', () => {
  it('conta as claquetes com a arte entregue (ou arquivada), na ordem da pauta; tarefa e aviso não contam', () => {
    const c = contaDoEditor([linha('A 27/11', 'X', 'claquete', [producao('entregue')]), linha('COMUNICAÇÃO', 'X', 'tarefa'), linha('B 27/11', 'X', 'claquete', [producao('produzindo')]), linha('C 27/11', 'X', 'claquete', [producao('arquivada')]), linha('D 27/11', 'X')]);
    expect(c).toEqual({ feitas: 2, total: 4, bolinhas: [true, false, true, false] });
  });
  it('sem claquete, zero de zero', () => {
    expect(contaDoEditor([linha('CALHAUS', '', 'tarefa')])).toEqual({ feitas: 0, total: 0, bolinhas: [] });
  });
});

describe('o recado do dia', () => {
  it('é o aviso sem editor daquele dia; os avisos de um editor ficam com ele', () => {
    const linhas = [linha('Reunião às 10h', '', 'aviso'), linha('Redator vem', 'Carla', 'aviso'), linha('Outro dia', '', 'aviso', [], '2026-11-28')];
    expect(recadoDoDia(linhas, '2026-11-27').map((l) => l.texto)).toEqual(['Reunião às 10h']);
    expect(recadoDoDia(linhas, '2026-11-26')).toEqual([]);
  });
});

describe('a busca na pauta', () => {
  const linhas = [
    linha('Festa da Vila(Prologo)29/11 (AH)', 'Carla Duarte'),
    linha('Novela Sol 28/11', 'Ana Ribeiro'),
    linha('COMUNICAÇÃO', 'Bruno Teixeira', 'tarefa'),
    linha('Redator vem acompanhar', 'Carla Duarte', 'aviso'),
  ];
  const textos = (termo: string, apelido?: (l: LinhaDaPauta) => string) => buscarNaPauta(linhas, termo, apelido).map((l) => l.texto);
  it('acha pela claquete e pela atração, sem caixa nem acento', () => {
    expect(textos('festa vila')).toEqual(['Festa da Vila(Prologo)29/11 (AH)']);
    expect(textos('comunicacao')).toEqual(['COMUNICAÇÃO']);
    expect(textos('prologo')).toEqual(['Festa da Vila(Prologo)29/11 (AH)']);
  });
  it('acha pelo editor: todas as linhas dele; o aviso não é resultado', () => {
    expect(textos('carla')).toEqual(['Festa da Vila(Prologo)29/11 (AH)']);
    expect(textos('ribeiro')).toEqual(['Novela Sol 28/11']);
  });
  it('acha pelo apelido da claquete', () => {
    expect(textos('vilinha', (l) => (l.texto.startsWith('Festa') ? 'Vilinha 29/11' : ''))).toEqual(['Festa da Vila(Prologo)29/11 (AH)']);
  });
  it('sem termo (ou só espaço), nada', () => {
    expect(textos('')).toEqual([]);
    expect(textos('   ')).toEqual([]);
  });
});
