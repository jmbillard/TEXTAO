/* A revisão que volta como sugestão (#196): a sugestão de um trecho mudado (por palavra inteira), a troca mínima, o
   rastro do designer no editor de verdade (a mudança com o cadeado aberto, juntar, desfazer, o texto que chega da sala)
   e o aceitar no escrito, com a arte guardada. Texto inventado. */
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { ySyncPluginKey } from 'y-prosemirror';
import { extensoesDoRoteiro } from '../src/editor/extensoes';
import { textoCorrido } from '../src/editor/comentarios';
import { acompanhar, aplicarSugestao, esquecer, indiceNoTexto, novoRastro, registrarMudanca, sugestoesDoRastro, type Rastro } from '../src/editor/sugestoes';
import { acharAncora, ancoraDe } from '../src/modelo/comentarios';
import { sugestaoDoTrecho, sugestoesAbertas, trocaMinima } from '../src/modelo/sugestoes';

describe('a sugestão de um trecho mudado', () => {
  it('cresce até as palavras inteiras', () => {
    const texto = 'NESTE SÁBADO, OITO CHURRASQUEIROS NA BRASA.';
    const de = texto.indexOf('RR') + 1; // o R que entrou
    expect(sugestaoDoTrecho(texto, de, de + 1, '')).toEqual({
      ancora: { trecho: 'CHURASQUEIROS', antes: 'NESTE SÁBADO, OITO ', depois: ' NA BRASA.', pos: 19 },
      texto: 'CHURRASQUEIROS',
    });
  });
  it('o que só entrou leva a palavra de antes; no começo, a de depois', () => {
    const texto = 'OITO GRANDES CHURRASQUEIROS';
    const de = texto.indexOf(' GRANDES');
    expect(sugestaoDoTrecho(texto, de, de + 8, '')).toMatchObject({ ancora: { trecho: 'OITO' }, texto: 'OITO GRANDES' });
    expect(sugestaoDoTrecho('JÁ OITO', 0, 3, '')).toMatchObject({ ancora: { trecho: 'OITO' }, texto: 'JÁ OITO' });
  });
  it('o que só saiu também vira sugestão (o sugerido sem a palavra)', () => {
    const texto = 'OITO CHURRASQUEIROS';
    expect(sugestaoDoTrecho(texto, 4, 4, ' GRANDES')).toMatchObject({ ancora: { trecho: 'OITO GRANDES' }, texto: 'OITO' });
  });
  it('nada mudou de fato: nada a sugerir', () => {
    expect(sugestaoDoTrecho('OITO', 0, 4, 'OITO')).toBeNull();
  });
  it('a troca mínima guarda o começo e o fim iguais', () => {
    expect(trocaMinima('CHURASQUEIROS', 'CHURRASQUEIROS')).toEqual({ de: 4, ate: 4, entra: 'R' });
    expect(trocaMinima('22H', '23H')).toEqual({ de: 1, ate: 2, entra: '3' });
    expect(trocaMinima('OITO GRANDES', 'OITO')).toEqual({ de: 4, ate: 12, entra: '' });
  });
  it('conta as sugestões abertas', () => {
    const base = { autor: { nome: 'A', email: 'a' }, papel: '', texto: '', criadoEm: '', ancora: null, resolvido: null };
    expect(
      sugestoesAbertas([
        { ...base, id: '1', fio: null, sugestao: { texto: 'x', decisao: null } },
        { ...base, id: '2', fio: null, sugestao: { texto: 'x', decisao: 'aceita' } },
        { ...base, id: '3', fio: null },
        { ...base, id: '4', fio: '1' },
      ]),
    ).toBe(1);
  });
});

const par = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
let editor: Editor;
afterEach(() => editor?.destroy());
let n = 0;
const id = () => `trecho-${++n}`;

/** O editor com o rastro ligado: as mudanças com `cadeado` entram nele; as outras só andam com o texto. */
function montar(doc: object) {
  const rastro: Rastro = novoRastro();
  const cadeado = new WeakSet<object>();
  editor = new Editor({ extensions: extensoesDoRoteiro(), content: doc });
  editor.on('transaction', ({ transaction }) => {
    if (cadeado.has(transaction)) registrarMudanca(rastro, transaction, id);
    else acompanhar(rastro, transaction);
  });
  const comCadeado = (f: (tr: ReturnType<typeof editor.state.tr.insertText>) => void) => {
    const tr = editor.state.tr;
    f(tr);
    cadeado.add(tr);
    editor.view.dispatch(tr);
  };
  const posDe = (s: string) => {
    const { texto, pos } = textoCorrido(editor.state.doc);
    return pos[texto.indexOf(s)];
  };
  return { rastro, comCadeado, posDe };
}

describe('o rastro do designer', () => {
  const DOC = { type: 'doc', content: [par('NESTE SÁBADO, OITO CHURASQUEIROS NA BRASA.'), par('AMANHÃ, 22H.')] };

  it('cada letra digitada junta no mesmo trecho; vira uma sugestão por palavra', () => {
    const { rastro, comCadeado, posDe } = montar(DOC);
    const p = posDe('ASQUEIROS');
    comCadeado((tr) => tr.insertText('R', p));
    expect(rastro.trechos).toHaveLength(1);
    const p2 = posDe('22H') + 1;
    comCadeado((tr) => tr.insertText('3', p2, p2 + 1));
    expect(sugestoesDoRastro(rastro, editor.state.doc).map((s) => [s.ancora.trecho, s.texto])).toEqual([
      ['CHURASQUEIROS', 'CHURRASQUEIROS'],
      ['22H.', '23H.'],
    ]);
    // continua digitando ali: o mesmo trecho (o mesmo id), com o original de antes de tudo
    const ids = rastro.trechos.map((t) => t.id);
    comCadeado((tr) => tr.insertText('!', posDe('23H.') + 4));
    expect(rastro.trechos.map((t) => t.id)).toEqual(ids);
    expect(sugestoesDoRastro(rastro, editor.state.doc)[1]).toMatchObject({ ancora: { trecho: '22H.' }, texto: '23H.!' });
  });

  it('desfeita à mão (o texto volta ao de antes), a mudança sai do rastro', () => {
    const { rastro, comCadeado, posDe } = montar(DOC);
    const p = posDe('ASQUEIROS');
    comCadeado((tr) => tr.insertText('R', p));
    comCadeado((tr) => tr.delete(p, p + 1));
    expect(rastro.trechos).toEqual([]);
  });

  it('o que muda sem o cadeado (a marca, o colega) só anda com o texto', () => {
    const { rastro, comCadeado, posDe } = montar(DOC);
    comCadeado((tr) => tr.insertText('R', posDe('ASQUEIROS')));
    editor.commands.insertContentAt(1, 'AGORA: ');
    expect(rastro.trechos).toHaveLength(1);
    expect(sugestoesDoRastro(rastro, editor.state.doc)[0]).toMatchObject({ ancora: { trecho: 'CHURASQUEIROS', antes: 'AGORA: NESTE SÁBADO, OITO ' }, texto: 'CHURRASQUEIROS' });
  });

  it('o texto que chega da sala troca o documento inteiro: o trecho é achado de novo pelo texto', () => {
    const { rastro, comCadeado, posDe } = montar(DOC);
    comCadeado((tr) => tr.insertText('R', posDe('ASQUEIROS')));
    const doc = editor.state.doc;
    const novo = editor.schema.nodeFromJSON({ type: 'doc', content: [par('OUTRA LINHA.'), ...doc.toJSON().content] });
    editor.view.dispatch(editor.state.tr.replaceWith(0, doc.content.size, novo.content).setMeta(ySyncPluginKey, { isChangeOrigin: true }));
    expect(sugestoesDoRastro(rastro, editor.state.doc)).toMatchObject([{ ancora: { trecho: 'CHURASQUEIROS' }, texto: 'CHURRASQUEIROS' }]);
    // e o desfazer, que também chega pela sala: o texto de antes volta, a mudança sai
    const volta = editor.schema.nodeFromJSON({ type: 'doc', content: [par('OUTRA LINHA.'), ...DOC.content] });
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, volta.content).setMeta(ySyncPluginKey, { isChangeOrigin: true }));
    expect(rastro.trechos).toEqual([]);
  });

  it('o decidido sai do rastro', () => {
    const { rastro, comCadeado, posDe } = montar(DOC);
    comCadeado((tr) => tr.insertText('R', posDe('ASQUEIROS')));
    esquecer(rastro, [rastro.trechos[0].id]);
    expect(rastro.trechos).toEqual([]);
  });

  it('a posição no texto corrido', () => {
    montar(DOC);
    const { texto, pos } = textoCorrido(editor.state.doc);
    const i = texto.indexOf('22H');
    expect(indiceNoTexto(editor.state.doc, pos[i])).toBe(i);
  });
});

describe('aceitar no escrito', () => {
  it('acha o trecho pela âncora mesmo com o texto mudado em volta, e guarda a arte', () => {
    editor = new Editor({
      extensions: extensoesDoRoteiro(),
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'NESTE DOMINGO, ' }, { type: 'text', text: 'OITO CHURASQUEIROS', marks: [{ type: 'arte', attrs: { id: 'a1' } }] }, { type: 'text', text: ' NA BRASA.' }] },
        ],
      },
    });
    const ancora = { trecho: 'CHURASQUEIROS', antes: 'NESTE SÁBADO, OITO ', depois: ' NA BRASA.', pos: 19 };
    const feita = aplicarSugestao(editor.view, ancora, 'CHURRASQUEIROS')!;
    expect(editor.state.doc.textContent).toBe('NESTE DOMINGO, OITO CHURRASQUEIROS NA BRASA.');
    // a arte continua cobrindo a frase inteira
    const arte: string[] = [];
    editor.state.doc.descendants((nd) => {
      if (nd.isText && nd.marks.some((m) => m.type.name === 'arte')) arte.push(nd.text!);
    });
    expect(arte.join('')).toBe('OITO CHURRASQUEIROS');
    // o desfazer acha o sugerido e troca de volta
    expect(feita.trecho).toBe('CHURRASQUEIROS');
    aplicarSugestao(editor.view, feita, 'CHURASQUEIROS');
    expect(editor.state.doc.textContent).toBe('NESTE DOMINGO, OITO CHURASQUEIROS NA BRASA.');
  });

  it('o trecho que saiu do texto não se aceita', () => {
    editor = new Editor({ extensions: extensoesDoRoteiro(), content: { type: 'doc', content: [par('OUTRA COISA.')] } });
    const { texto } = textoCorrido(editor.state.doc);
    expect(acharAncora(texto, ancoraDe('OITO CHURASQUEIROS', 5, 18))).toBeNull();
    expect(aplicarSugestao(editor.view, ancoraDe('OITO CHURASQUEIROS', 5, 18), 'CHURRASQUEIROS')).toBeNull();
  });

  it('o sugerido com quebra de linha vira um trecho novo', () => {
    editor = new Editor({ extensions: extensoesDoRoteiro(), content: { type: 'doc', content: [par('OITO CHURRASQUEIROS NA BRASA.')] } });
    aplicarSugestao(editor.view, { trecho: 'NA', antes: 'CHURRASQUEIROS ', depois: ' BRASA.', pos: 20 }, 'NA\nGRANDE');
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(1).textContent).toBe('GRANDE BRASA.');
  });
});
