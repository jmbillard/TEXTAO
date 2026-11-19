import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportar } from '../src/modelo/exportar';
import { gerarDocx } from '../src/ui/exportarDocx';
import type { Roteiro } from '../src/modelo/tipos';
import { metaVazia } from '../src/modelo/tipos';

const arte = (id: string, texto: string, attrs: Record<string, unknown> = {}) => ({ type: 'text', text: texto, marks: [{ type: 'arte', attrs: { id, subtipo: '', obs: '', ...attrs } }] });
const roteiro: Roteiro = {
  id: 'r1',
  meta: { ...metaVazia(), claquete: 'Festa na Praça 19/11 Rede', programa: 'Festa na Praça', praca: 'G5', dataExibicao: '2026-11-19', redator: 'Ana Lima', editor: 'Luiz Dutra' },
  doc: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'HOJE TEM ' }, arte('a1', 'A GRANDE FESTA', { subtipo: 'cartao', obs: 'usar a foto da praça' }), { type: 'text', text: ' NA PRAÇA DA MATRIZ, COM MÚSICA E COMIDA. ' }, arte('a2', 'NÃO PERCA'), { type: 'text', text: '!' }] },
    ],
  },
  revisao: 1,
  criadoEm: '2026-11-19T10:00:00Z',
  atualizadoEm: '2026-11-19T11:00:00Z',
  criadoPor: { nome: 'Beto Souza', email: 'beto@empresa.com' },
  alteradoPor: { nome: 'Carla Dias', email: 'carla@empresa.com' },
};

describe('docx com metadados', () => {
  it('cada arte tem a duração da frase em que aparece', () => {
    const s = exportar(roteiro);
    // "HOJE TEM A GRANDE FESTA NA PRAÇA DA MATRIZ, COM MÚSICA E COMIDA." = 12 palavras ≈ 5s; "NÃO PERCA!" fica no mínimo de 3s
    expect(s.artes.map((a) => a.duracaoEstimadaSeg)).toEqual([5, 3]);
  });

  it('leva autores, comentário na arte e o XML do PROMeiro', async () => {
    const zip = await JSZip.loadAsync(await (await gerarDocx(exportar(roteiro, new Date('2026-11-19T12:00:00Z')))).arrayBuffer());
    const core = await zip.file('docProps/core.xml')!.async('string');
    expect(core).toContain('<dc:creator>Ana Lima; Beto Souza; Carla Dias</dc:creator>');
    const comentarios = await zip.file('word/comments.xml')!.async('string');
    expect(comentarios).toContain('usar a foto da praça');
    const documento = await zip.file('word/document.xml')!.async('string');
    expect(documento).toMatch(/<w:commentRangeStart w:id="0"\/>.*A GRANDE FESTA.*<w:commentRangeEnd w:id="0"\/>/s);

    const xml = await zip.file('customXml/item1.xml')!.async('string');
    const d = new DOMParser().parseFromString(xml, 'application/xml');
    const ns = 'urn:promeiro:roteiro:1';
    expect(d.documentElement.namespaceURI).toBe(ns);
    expect(d.getElementsByTagNameNS(ns, 'claquete')[0].textContent).toBe('Festa na Praça 19/11 Rede');
    expect([...d.getElementsByTagNameNS(ns, 'autor')].map((a) => `${a.getAttribute('papel')}:${a.textContent}`)).toEqual(['redação:Ana Lima', 'subiu:Beto Souza', 'revisou:Carla Dias']);
    const artes = [...d.getElementsByTagNameNS(ns, 'arte')];
    expect(artes.map((a) => [a.getAttribute('tipoNome'), a.getAttribute('duracaoEstimadaSeg'), a.getElementsByTagNameNS(ns, 'texto')[0].textContent])).toEqual([
      ['Cartão', '5', 'A GRANDE FESTA'],
      ['', '3', 'NÃO PERCA'],
    ]);
    expect(artes[0].getElementsByTagNameNS(ns, 'comentario')[0].textContent).toBe('usar a foto da praça');
    // o Word só preserva a parte se ela estiver ligada ao documento e declarada
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('Target="../customXml/item1.xml"');
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('/customXml/itemProps1.xml');
    expect(zip.file('customXml/_rels/item1.xml.rels')).toBeTruthy();
  });
});

describe('comentário de arte que atravessa parágrafos', () => {
  it('prende o comentário uma vez só, com um número só', async () => {
    const marca = { type: 'arte', attrs: { id: 'a9', subtipo: '', obs: 'usar a foto' } };
    const r: Roteiro = {
      ...roteiro,
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'VEM AÍ A GRANDE', marks: [marca] }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'FESTA DA PRAÇA', marks: [marca] }, { type: 'text', text: ' HOJE.' }] },
        ],
      },
    };
    const zip = await JSZip.loadAsync(await (await gerarDocx(exportar(r))).arrayBuffer());
    const documento = await zip.file('word/document.xml')!.async('string');
    expect(documento.match(/<w:commentRangeStart /g)).toHaveLength(1);
    expect(documento.match(/<w:commentRangeEnd /g)).toHaveLength(1);
    expect(documento.match(/<w:commentReference /g)).toHaveLength(1);
    const comentarios = await zip.file('word/comments.xml')!.async('string');
    expect(comentarios.match(/<w:comment /g)).toHaveLength(1);
  });
});
