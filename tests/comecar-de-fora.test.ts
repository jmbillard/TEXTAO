/* Começar o Roteiro de um arquivo ou de um texto colado (#195): a mesma leitura da fila, com o tipo guardado em cada
   trecho. A arte e a etiqueta que cobrem o trecho inteiro ficam confirmadas; o resto fica com o palpite. As artes são
   as mesmas que a fila acha no mesmo arquivo. Os colados são inventados. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { interpretar, lerArquivo } from '../src/importar';
import { brutoDoHtml, brutoDoTexto, comecoDaImportacao, comecoDoColado, docDaImportacao, textoDoOriginal } from '../src/importar/paraEscrever';
import { exportar } from '../src/modelo/exportar';
import { artesDoTexto, comOsTiposGuardados, textoDoTrecho, TIPOS_DO_TRECHO } from '../src/modelo/trecho';
import type { NoJSON } from '../src/modelo/tipos';
import { chaveDeArte } from '../src/modelo/diferencas';

async function abrir(nome: string) {
  const imp = interpretar(await lerArquivo(new Uint8Array(readFileSync(join(__dirname, 'fixtures', nome))), nome), { anoPadrao: 2026 });
  return { imp, comeco: comecoDaImportacao(imp) };
}
const trechos = (doc: NoJSON) => doc.content ?? [];
const tipos = (doc: NoJSON) => trechos(doc).filter((p) => textoDoTrecho(p).trim()).map((p) => `${p.attrs?.tipo}${p.attrs?.confirmado ? '' : '?'}`);
/** As artes que a fila acha no mesmo arquivo (a exportação do roteiro da fila). */
const artesDaFila = (imp: Awaited<ReturnType<typeof abrir>>['imp']) =>
  exportar({ id: 't', meta: { ...imp.meta, layout: 'coluna_unica' }, doc: docDaImportacao(imp), revisao: 1, criadoEm: '', atualizadoEm: '' }).artes.map((a) => a.texto);
const temArteInteira = (p: NoJSON) => {
  const pedacos = (p.content ?? []).filter((n) => n.type === 'text' && n.text?.trim());
  return pedacos.length > 0 && pedacos.every((n) => n.marks?.some((m) => m.type === 'arte'));
};

describe.each(['Encontro_27_10.docx', 'Quem_AmaPrologo26_10_Rede.docx', 'Eliana_20_9.rtf', 'Ficticio_Tabela_10-12-1.rtf'])('%s', (nome) => {
  it('todo trecho guarda o tipo; a arte inteira fica confirmada, o resto sem marca é o palpite', async () => {
    const { comeco } = await abrir(nome);
    expect(comeco.doc.type).toBe('doc');
    // texto corrido, como na folha
    expect(trechos(comeco.doc).every((p) => p.type === 'paragraph')).toBe(true);
    for (const p of trechos(comeco.doc)) {
      expect(TIPOS_DO_TRECHO).toContain(p.attrs?.tipo);
      expect(typeof p.attrs?.confirmado).toBe('boolean');
      if (temArteInteira(p)) expect(p.attrs).toMatchObject({ tipo: 'arte', confirmado: true });
      const marcado = (p.content ?? []).some((n) => n.marks?.some((m) => m.type === 'arte' || m.type === 'etiqueta'));
      if (!marcado) expect(p.attrs?.confirmado).toBe(false);
    }
  });
  it('as artes são as que a fila acha no mesmo arquivo, sem repetir', async () => {
    const { imp, comeco } = await abrir(nome);
    const daFila = artesDaFila(imp);
    expect(daFila.length).toBeGreaterThan(0);
    // sem repetir: a mesma arte (pela chave do acervo) conta uma vez, com o texto da primeira aparição
    const unicas = daFila.filter((t, i) => daFila.findIndex((x) => chaveDeArte(x) === chaveDeArte(t)) === i).map((t) => t.trim());
    expect(artesDoTexto(comeco.doc).map((a) => a.texto)).toEqual(unicas);
    expect(comeco.nArtes).toBe(artesDoTexto(comeco.doc).length);
  });
  it('a meta traz só os campos de fora: sem claquete, sem redator, sem as pendências da fila', async () => {
    const { comeco } = await abrir(nome);
    for (const k of ['claquete', 'redator', 'status', 'layout', 'revisar', 'titulo']) expect(comeco.meta).not.toHaveProperty(k);
    expect(comeco.titulo.trim()).not.toBe('');
  });
});

describe('Encontro (.docx): os tipos pela etiqueta e pela arte', () => {
  it('a etiqueta da sonoplastia é trilha, a da edição é edição, confirmadas; a arte inteira é arte; a locução é palpite', async () => {
    const { imp, comeco } = await abrir('Encontro_27_10.docx');
    expect(comeco.titulo).toBe('Encontro · Chamada de 27/10');
    expect(comeco.meta).toMatchObject({ programa: 'Encontro', tipoPrograma: 'ao_vivo', dataExibicao: '2026-10-27', locutor: 'WALMIR' });
    const t = tipos(comeco.doc);
    expect(t[0]).toBe('trilha');
    expect(t).toContain('arte');
    expect(t).toContain('edicao');
    expect(t).toContain('locucao?');
    // o mesmo texto do original, para o PDF do card
    expect(textoDoOriginal(imp.bruto).length).toBeGreaterThan(5);
  });
});

describe('o texto colado', () => {
  const WORD = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body>
    <p class=MsoNormal><span style='text-decoration:underline'>DESAFIO DA BRASA</span><o:p></o:p></p>
    <p class=MsoNormal>NESTE SÁBADO, <u>OITO CHURRASQUEIROS</u> DISPUTAM O TÍTULO.</p>
    <p class=MsoNormal>Dona Zélia, de Pelotas: Aqui ninguém leva carne crua.</p>
    <p class=MsoNormal>&nbsp;</p>
    <p class=MsoNormal>((plim plim))</p>
    <p class=MsoNormal><b>TRILHA</b> SOBE COM O FOGO</p>
    </body></html>`;

  it('do Word: o sublinhado vira arte (confirmada quando é o trecho inteiro), a etiqueta vira o tipo, o resto é palpite', () => {
    const c = comecoDoColado(WORD, '');
    expect(tipos(c.doc)).toEqual(['arte', 'locucao?', 'sonora?', 'trilha', 'trilha']);
    expect(artesDoTexto(c.doc).map((a) => a.texto)).toEqual(['DESAFIO DA BRASA', 'OITO CHURRASQUEIROS']);
    expect(c.nArtes).toBe(2);
    // sem arquivo, nada de título tirado do nome
    expect(c.titulo).toBe('');
  });

  it('linha a linha: a quebra de linha do Word (Shift+Enter) é um trecho novo, como na fila', () => {
    const c = comecoDoColado('<p>A FINAL É NESTE SÁBADO.<br>Seu Arlindo, de Bagé: O fogo é de chão.<br><span style="text-decoration: underline">BRASA</span></p>', '');
    expect(tipos(c.doc)).toEqual(['locucao?', 'sonora?', 'arte']);
  });

  it('o "text-decoration: none" do Word desfaz o sublinhado de fora; o negrito e o itálico vêm', () => {
    const b = brutoDoHtml('<p><u>UM <span style="text-decoration:none">DOIS</span></u> <span style="font-weight:700">três</span> <i>quatro</i></p>');
    const [bloco] = b.blocos as { par: { t: string; u?: boolean; b?: boolean; i?: boolean }[] }[];
    expect(bloco.par.map((r) => [r.t, !!r.u, !!r.b, !!r.i])).toEqual([['UM ', true, false, false], ['DOIS ', false, false, false], ['três', false, true, false], [' ', false, false, false], ['quatro', false, false, true]]);
  });

  it('a tabela do Word chega como tabela, e o texto puro chega uma linha por trecho', () => {
    const b = brutoDoHtml('<p>Antes</p><table><tr><td><p>VÍDEO</p></td><td><p>ÁUDIO</p></td></tr><tr><td>Imagem do fogo</td><td><p>A BRASA DECIDE.</p></td></tr></table><p>Depois</p>');
    expect(b.blocos.map((x) => x.tipo)).toEqual(['p', 'tabela', 'p']);
    const tabela = b.blocos[1] as { linhas: { t: string }[][][][] };
    expect(tabela.linhas.map((l) => l.map((c) => c.map((p) => p.map((r) => r.t).join('')).join('|')))).toEqual([['VÍDEO', 'ÁUDIO'], ['Imagem do fogo', 'A BRASA DECIDE.']]);
    expect(brutoDoTexto('UM\nDois, de Três: quatro\n\nTRILHA alta').blocos.map((x) => (x.tipo === 'p' ? x.par.map((r) => r.t).join('') : ''))).toEqual(['UM', 'Dois, de Três: quatro', '', 'TRILHA alta']);
    // e a etiqueta que a fila reconhece pelo texto ("Trilha alta" é sonoplastia) já chega confirmada
    expect(tipos(comecoDoColado('', 'A BRASA DECIDE.\nTrilha alta\nSeu Arlindo, de Bagé: O fogo é de chão.').doc)).toEqual(['locucao?', 'trilha', 'sonora?']);
  });
});

describe('comOsTiposGuardados', () => {
  it('o trecho que já tem tipo fica como está; dentro das colunas também ganha', () => {
    const doc: NoJSON = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { tipo: 'producao', confirmado: true }, content: [{ type: 'text', text: 'A BRASA DECIDE.' }] },
        { type: 'linha', content: [{ type: 'celula', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A BRASA DECIDE.' }] }] }, { type: 'celula', content: [{ type: 'paragraph' }] }] },
      ],
    };
    const out = comOsTiposGuardados(doc);
    expect(out.content![0].attrs).toEqual({ tipo: 'producao', confirmado: true });
    expect(out.content![1].content![0].content![0].attrs).toEqual({ tipo: 'locucao', confirmado: false });
    expect(out.content![1].content![1].content![0].attrs).toEqual({ tipo: 'texto', confirmado: false });
  });
});
