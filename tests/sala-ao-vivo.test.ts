/* A sala ao vivo (`useSalaAoVivo`): a mesma regra de preencher e liberar no editor de revisão e na folha de escrita.
   A sala vazia (sem texto e sem metadados) é preenchida só pela aba da vez (`semear`); as outras esperam o texto chegar
   e perguntam de novo ao servidor. Preencher e liberar não são edições (o `onUpdate` não é avisado). A sala aqui é um
   Y.Doc de verdade com um provedor de mentira; o editor é de mentira (só o que o hook chama). */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { Editor } from '@tiptap/react';
import type { Sala } from '../src/dados/colaboracao';
import { metaVazia, type Meta, type Roteiro } from '../src/modelo/tipos';

const servidor = vi.hoisted(() => ({ roteiro: undefined as unknown, ler: 0 }));
vi.mock('../src/dados/armazenamento', () => ({
  armazenamento: {
    ler: async () => {
      servidor.ler++;
      return servidor.roteiro ? { estado: 'ok', roteiro: servidor.roteiro } : { estado: 'erro' };
    },
  },
  roteiroDa: (l: { estado: string; roteiro?: unknown }) => (l.estado === 'ok' ? l.roteiro : undefined),
}));

import { useSalaAoVivo } from '../src/ui/salaAoVivo';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Uma sala com o Y.Doc de verdade e um provedor que só guarda os ouvintes (o teste dispara o "sync"). */
function salaDeMentira() {
  const doc = new Y.Doc();
  const ouvintes = new Map<string, Set<(...a: unknown[]) => void>>();
  const provedor = {
    on: (ev: string, f: (...a: unknown[]) => void) => void (ouvintes.get(ev) ?? ouvintes.set(ev, new Set()).get(ev)!).add(f),
    off: (ev: string, f: (...a: unknown[]) => void) => void ouvintes.get(ev)?.delete(f),
    connect: vi.fn(),
    disconnect: vi.fn(),
    awareness: { on: () => {}, off: () => {}, setLocalStateField: () => {}, getStates: () => new Map() },
  };
  const sala = { doc, provedor, meta: doc.getMap('meta'), comentarios: doc.getMap('comentarios'), aoGravar: () => () => {}, pendente: () => false } as unknown as Sala;
  const sincronizar = () => ouvintes.get('sync')?.forEach((f) => f(true));
  return { sala, sincronizar };
}
/** Põe um parágrafo no texto da sala, como se outra aba já o tivesse preenchido. */
const comTexto = (sala: Sala) => sala.doc.getXmlFragment('doc').insert(0, [new Y.XmlElement('paragraph')]);

function editorDeMentira() {
  return { commands: { setContent: vi.fn(), focus: vi.fn() }, setEditable: vi.fn(), state: {} };
}

const roteiro = (extra: Partial<Roteiro> = {}): Roteiro => ({
  id: 'r1',
  meta: { ...metaVazia(), titulo: 'O título' },
  doc: { type: 'doc', content: [{ type: 'paragraph' }] },
  revisao: 1,
  criadoEm: '',
  atualizadoEm: '',
  ...extra,
});

type Props = Parameters<typeof useSalaAoVivo>[2] & { sala: Sala | null; editor: ReturnType<typeof editorDeMentira> | null };
let visto: ReturnType<typeof useSalaAoVivo>;
function Sonda({ sala, editor, ...opcoes }: Props) {
  visto = useSalaAoVivo(sala, editor as unknown as Editor | null, opcoes);
  return null;
}

let caixa: HTMLDivElement;
let raiz: Root;
beforeEach(() => {
  vi.useFakeTimers();
  servidor.roteiro = undefined;
  servidor.ler = 0;
  caixa = document.createElement('div');
  raiz = createRoot(caixa);
});
afterEach(() => {
  act(() => raiz.unmount());
  vi.useRealTimers();
});
const montar = (p: Props) => act(() => raiz.render(createElement(Sonda, p)));
const esperar = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('a sala ao vivo', () => {
  it('sem sala, já está sincronizada e liberada, e não mexe no editor', () => {
    const editor = editorDeMentira();
    montar({ sala: null, editor, inicial: roteiro(), escreve: true, aoMudarMeta: () => {} });
    expect(visto).toMatchObject({ sincronizado: true, liberado: true });
    expect(editor.setEditable).not.toHaveBeenCalled();
  });

  it('com texto na sala, libera sem preencher, e mudar o modo não avisa o onUpdate', () => {
    const { sala, sincronizar } = salaDeMentira();
    comTexto(sala);
    const editor = editorDeMentira();
    montar({ sala, editor, inicial: roteiro({ semear: true }), escreve: true, aoMudarMeta: () => {} });
    expect(visto).toMatchObject({ sincronizado: false, liberado: false });
    act(sincronizar);
    expect(visto).toMatchObject({ sincronizado: true, liberado: true });
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(editor.setEditable).toHaveBeenCalledWith(true, false);
    expect(editor.commands.focus).not.toHaveBeenCalled();
  });

  it('só com os metadados a sala não está vazia: libera sem preencher de novo, e manda os metadados para a tela', () => {
    const { sala, sincronizar } = salaDeMentira();
    sala.meta.set('titulo', 'Já na sala');
    const editor = editorDeMentira();
    const aoMudarMeta = vi.fn();
    montar({ sala, editor, inicial: roteiro({ semear: true }), escreve: true, aoMudarMeta });
    act(sincronizar);
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(aoMudarMeta).toHaveBeenCalledWith({ titulo: 'Já na sala' });
    expect(visto.liberado).toBe(true);
  });

  it('vazia e com a vez desta aba: preenche o texto e os metadados (sem os indefinidos) e foca no fim, se pedido', () => {
    const { sala, sincronizar } = salaDeMentira();
    const editor = editorDeMentira();
    const inicial = roteiro({ semear: true, meta: { ...metaVazia(), titulo: 'O título', editor: undefined } as unknown as Meta });
    montar({ sala, editor, inicial, escreve: true, focarAoLiberar: true, aoMudarMeta: () => {} });
    act(sincronizar);
    expect(editor.commands.setContent).toHaveBeenCalledWith(inicial.doc, false);
    expect(sala.meta.get('titulo')).toBe('O título');
    expect(sala.meta.has('editor')).toBe(false);
    expect(editor.commands.focus).toHaveBeenCalledWith('end');
    expect(visto.liberado).toBe(true);
  });

  it('o editável é o da tela na hora de liberar (o celular trava a revisão), e sem editável não foca', () => {
    const { sala, sincronizar } = salaDeMentira();
    comTexto(sala);
    const editor = editorDeMentira();
    const props = { sala, editor, inicial: roteiro(), escreve: true, focarAoLiberar: true, aoMudarMeta: () => {} };
    montar({ ...props, editavel: true });
    montar({ ...props, editavel: false });
    act(sincronizar);
    expect(editor.setEditable).toHaveBeenCalledWith(false, false);
    expect(editor.commands.focus).not.toHaveBeenCalled();
  });

  it('vazia e a vez é de outra aba: espera, pergunta ao servidor e tenta de novo; libera quando o texto chega', async () => {
    const { sala, sincronizar } = salaDeMentira();
    const editor = editorDeMentira();
    montar({ sala, editor, inicial: roteiro(), escreve: false, aoMudarMeta: () => {} });
    act(sincronizar);
    expect(visto.liberado).toBe(false);
    // quem só lê espera mais para perguntar
    await esperar(1900);
    expect(servidor.ler).toBe(0);
    await esperar(100);
    expect(servidor.ler).toBe(1);
    await esperar(2000);
    expect(servidor.ler).toBe(2);
    expect(visto.liberado).toBe(false);
    act(() => comTexto(sala));
    await esperar(2000);
    expect(visto.liberado).toBe(true);
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(editor.setEditable).toHaveBeenCalledWith(false, false);
  });

  it('se a aba da vez desistiu, o servidor passa a vez: quem escreve pergunta logo e preenche', async () => {
    const { sala, sincronizar } = salaDeMentira();
    const editor = editorDeMentira();
    servidor.roteiro = roteiro({ semear: true });
    montar({ sala, editor, inicial: roteiro(), escreve: true, aoMudarMeta: () => {} });
    act(sincronizar);
    await esperar(600);
    expect(servidor.ler).toBe(1);
    expect(editor.commands.setContent).toHaveBeenCalledTimes(1);
    expect(visto.liberado).toBe(true);
  });

  it('ao sair no meio da espera, para de perguntar (a nova tentativa não fica para trás)', async () => {
    const { sala, sincronizar } = salaDeMentira();
    const editor = editorDeMentira();
    montar({ sala, editor, inicial: roteiro(), escreve: true, aoMudarMeta: () => {} });
    act(sincronizar);
    await esperar(600);
    expect(servidor.ler).toBe(1);
    act(() => raiz.unmount());
    raiz = createRoot(caixa);
    await esperar(10000);
    expect(servidor.ler).toBe(1);
    expect(sala.provedor.disconnect).toHaveBeenCalled();
  });
});
