import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportar } from '../src/modelo/exportar';
import { gerarDocx } from '../src/ui/exportarDocx';
import { metaVazia, type NoJSON, type Roteiro } from '../src/modelo/tipos';

/* O .docx do modo limpo (#193): o Roteiro escrito no PROMeiro sai com a cara dos .docx de hoje, igual ao que a folha
   mostra no modo limpo, em texto corrido ou na tabela de bordas pretas das colunas. Arial 11; a locução em caixa alta
   (no arquivo, não só na tela); a arte sublinhada em negrito; a sonora em negrito; a locação sublinhada. Dados
   inventados. */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const t = (texto: string, marks?: NoJSON['marks']): NoJSON => ({ type: 'text', text: texto, ...(marks ? { marks } : {}) });
const p = (tipo: string, ...content: NoJSON[]): NoJSON => ({ type: 'paragraph', attrs: { tipo, confirmado: true }, content });
const arte = (id: string, obs = '') => [{ type: 'arte', attrs: { id, subtipo: '', obs } }];

const roteiro: Roteiro = {
  id: 'escrito-docx-1',
  meta: { ...metaVazia(), titulo: 'Desafio da Brasa, a final', programa: 'Desafio da Brasa', redator: 'Marina Teles', status: 'rascunho' },
  doc: {
    type: 'doc',
    content: [
      p('locacao', t('Galpão da final')),
      p('edicao', t('Abre no fogo acendendo.')),
      p('trilha', t('Batida da casa entrando.')),
      p('locucao', t('neste sábado, a brasa decide.')),
      p('arte', t('DESAFIO DA BRASA', arte('a1', 'com o logo novo'))),
      p('locucao', t('oito churrasqueiros', arte('a2')), t('. Um só título.')),
      p('sonora', t('Dona Zélia, de Pelotas: aqui ninguém leva carne crua.')),
    ],
  },
  revisao: 1,
  criadoEm: '2026-11-20T10:00:00Z',
  atualizadoEm: '2026-11-20T11:00:00Z',
  escrito: 'sendo-escrito',
};

interface Run {
  texto: string;
  negrito: boolean;
  sublinhado: boolean;
  fonte: string | null;
  tamanho: string | null;
}
const runs = (el: Element): Run[] =>
  [...el.getElementsByTagNameNS(W, 'r')]
    .map((r) => {
      const pr = r.getElementsByTagNameNS(W, 'rPr')[0];
      const filho = (nome: string) => pr?.getElementsByTagNameNS(W, nome)[0];
      return {
        texto: [...r.getElementsByTagNameNS(W, 't')].map((x) => x.textContent).join(''),
        negrito: !!filho('b') && filho('b')!.getAttributeNS(W, 'val') !== 'false',
        sublinhado: (filho('u')?.getAttributeNS(W, 'val') ?? 'none') !== 'none',
        fonte: filho('rFonts')?.getAttributeNS(W, 'ascii') ?? null,
        tamanho: filho('sz')?.getAttributeNS(W, 'val') ?? null,
      };
    })
    .filter((r) => r.texto);
const textoDe = (el: Element) => runs(el).map((r) => r.texto).join('');

async function abrir(visao: 'texto' | 'colunas') {
  const zip = await JSZip.loadAsync(await (await gerarDocx(exportar(roteiro, new Date('2026-11-20T12:00:00Z')), { limpo: visao })).arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  return { zip, xml, d: new DOMParser().parseFromString(xml, 'application/xml') };
}
const corpo = (d: Document) => d.getElementsByTagNameNS(W, 'body')[0];
const run = (d: Document, texto: string) => runs(corpo(d)).find((r) => r.texto === texto);

describe('o .docx do modo limpo, em texto', () => {
  it('Arial 11 em todo o texto, com o título em caixa alta e negrito, sem a lista de artes nem o cabeçalho da revisão', async () => {
    const { d } = await abrir('texto');
    const todos = runs(corpo(d));
    expect(todos.every((r) => r.fonte === 'Arial' && r.tamanho === '22')).toBe(true);
    expect(todos[0]).toMatchObject({ texto: 'DESAFIO DA BRASA, A FINAL', negrito: true });
    expect(d.getElementsByTagNameNS(W, 'tbl')).toHaveLength(0);
    expect(textoDe(corpo(d))).not.toContain('Lista de artes');
  });

  it('a locução em caixa alta no arquivo; a arte, também a do meio da frase, sublinhada em negrito', async () => {
    const { d } = await abrir('texto');
    expect(run(d, 'NESTE SÁBADO, A BRASA DECIDE.')).toMatchObject({ negrito: false, sublinhado: false });
    expect(run(d, 'DESAFIO DA BRASA')).toMatchObject({ negrito: true, sublinhado: true });
    expect(run(d, 'OITO CHURRASQUEIROS')).toMatchObject({ negrito: true, sublinhado: true });
    expect(run(d, '. UM SÓ TÍTULO.')).toMatchObject({ negrito: false, sublinhado: false });
  });

  it('a sonora em negrito, a locação sublinhada e o resto como foi escrito', async () => {
    const { d } = await abrir('texto');
    expect(run(d, 'Dona Zélia, de Pelotas: aqui ninguém leva carne crua.')).toMatchObject({ negrito: true, sublinhado: false });
    expect(run(d, 'Galpão da final')).toMatchObject({ sublinhado: true });
    expect(run(d, 'Abre no fogo acendendo.')).toMatchObject({ negrito: false, sublinhado: false });
    const paragrafos = [...corpo(d).getElementsByTagNameNS(W, 'p')].map(textoDe).filter(Boolean);
    expect(paragrafos).toEqual([
      'DESAFIO DA BRASA, A FINAL',
      'Galpão da final',
      'Abre no fogo acendendo.',
      'Batida da casa entrando.',
      'NESTE SÁBADO, A BRASA DECIDE.',
      'DESAFIO DA BRASA',
      'OITO CHURRASQUEIROS. UM SÓ TÍTULO.',
      'Dona Zélia, de Pelotas: aqui ninguém leva carne crua.',
    ]);
  });

  it('continua levando os dados: a observação da arte como comentário e o XML do PROMeiro', async () => {
    const { zip, xml } = await abrir('texto');
    expect(await zip.file('word/comments.xml')!.async('string')).toContain('com o logo novo');
    expect(xml).toMatch(/<w:commentRangeStart w:id="0"\/>.*DESAFIO DA BRASA.*<w:commentRangeEnd w:id="0"\/>/s);
    expect(await zip.file('customXml/item1.xml')!.async('string')).toContain('<texto>DESAFIO DA BRASA</texto>');
  });
});

describe('o .docx do modo limpo, em colunas', () => {
  it('uma tabela de bordas pretas: a locação na linha inteira e cada grupo numa linha, vídeo | áudio', async () => {
    const { d } = await abrir('colunas');
    const tabelas = d.getElementsByTagNameNS(W, 'tbl');
    expect(tabelas).toHaveLength(1);
    const bordas = [...tabelas[0].getElementsByTagNameNS(W, 'tcBorders')].flatMap((b) => [...b.children]);
    expect(bordas.length).toBeGreaterThan(0);
    expect(bordas.every((b) => b.getAttributeNS(W, 'val') === 'single' && b.getAttributeNS(W, 'color') === '000000')).toBe(true);

    const linhas = [...tabelas[0].getElementsByTagNameNS(W, 'tr')].map((tr) =>
      [...tr.getElementsByTagNameNS(W, 'tc')].map((tc) => ({
        juntas: tc.getElementsByTagNameNS(W, 'gridSpan')[0]?.getAttributeNS(W, 'val') ?? '1',
        trechos: [...tc.getElementsByTagNameNS(W, 'p')].map(textoDe).filter(Boolean),
      })),
    );
    expect(linhas).toEqual([
      [{ juntas: '2', trechos: ['Galpão da final'] }],
      [
        { juntas: '1', trechos: ['Abre no fogo acendendo.'] },
        { juntas: '1', trechos: ['Batida da casa entrando.', 'NESTE SÁBADO, A BRASA DECIDE.'] },
      ],
      [
        { juntas: '1', trechos: ['DESAFIO DA BRASA'] },
        { juntas: '1', trechos: ['OITO CHURRASQUEIROS. UM SÓ TÍTULO.', 'Dona Zélia, de Pelotas: aqui ninguém leva carne crua.'] },
      ],
    ]);
  });

  it('nas células, a mesma cara do texto: Arial 11, a arte sublinhada em negrito, a sonora em negrito', async () => {
    const { d } = await abrir('colunas');
    expect(runs(corpo(d)).every((r) => r.fonte === 'Arial' && r.tamanho === '22')).toBe(true);
    expect(run(d, 'OITO CHURRASQUEIROS')).toMatchObject({ negrito: true, sublinhado: true });
    expect(run(d, 'Dona Zélia, de Pelotas: aqui ninguém leva carne crua.')).toMatchObject({ negrito: true });
    expect(run(d, 'Galpão da final')).toMatchObject({ sublinhado: true });
  });

  it('o grupo sem vídeo leva a célula do vídeo vazia', async () => {
    const r: Roteiro = { ...roteiro, doc: { type: 'doc', content: [p('locucao', t('só a locução.')), p('arte', t('E A ARTE', arte('a9')))] } };
    const zip = await JSZip.loadAsync(await (await gerarDocx(exportar(r), { limpo: 'colunas' })).arrayBuffer());
    const d = new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'), 'application/xml');
    const linhas = [...d.getElementsByTagNameNS(W, 'tr')].map((tr) => [...tr.getElementsByTagNameNS(W, 'tc')].map(textoDe));
    expect(linhas).toEqual([
      ['', 'SÓ A LOCUÇÃO.'],
      ['E A ARTE', ''],
    ]);
  });
});
