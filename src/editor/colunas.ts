import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { gradeDasColunas } from '../modelo/trecho';
import { tipoDoNo } from './escrita';

/* As colunas da folha de escrita (#193, spec #186): o mesmo documento, visto como roteiro de TV, vídeo | áudio. Não há
   documento à parte: cada trecho ganha, por decoração, o lugar dele na grade (a regra pura `gradeDasColunas`, a mesma
   dos grupos do .docx), e a coluna sem trecho no grupo ganha uma célula vazia. Por isso editar nas colunas é editar o
   texto, também na sala ao vivo (a decoração é de cada um; o documento é o da sala).

   A troca de visão e o trecho que muda de coluna enquanto se digita (o palpite que vira sonora, o Tab no tipo) andam
   até o lugar novo numa animação FLIP; com o movimento reduzido, vão direto. */

export type Visao = 'texto' | 'colunas';

interface Estado {
  ativo: boolean;
  decos: DecorationSet;
  /** a grade em texto, para saber quando um trecho mudou de lugar */
  assinatura: string;
}

const chave = new PluginKey<Estado>('colunasDaEscrita');

/** Os trechos da folha (os parágrafos do primeiro nível), com a posição e o tipo. */
function trechos(state: EditorState) {
  const out: { pos: number; fim: number; tipo: ReturnType<typeof tipoDoNo>['tipo'] }[] = [];
  state.doc.forEach((no, pos) => {
    if (no.type.name === 'paragraph') out.push({ pos, fim: pos + no.nodeSize, tipo: tipoDoNo(no).tipo });
  });
  return out;
}

const celulaVazia = (linha: number, coluna: string, vao: number) => () => {
  const el = document.createElement('div');
  el.className = 'celula-vazia';
  el.dataset.coluna = coluna;
  el.style.gridRow = `${linha} / span ${vao}`;
  el.contentEditable = 'false';
  el.setAttribute('aria-hidden', 'true');
  return el;
};

function decorar(state: EditorState, ativo: boolean): Estado {
  if (!ativo) return { ativo, decos: DecorationSet.empty, assinatura: '' };
  const lista = trechos(state);
  const { lugares, vazios } = gradeDasColunas(lista.map((t) => t.tipo));
  const decos = lista.map((t, i) => {
    const l = lugares[i];
    return Decoration.node(t.pos, t.fim, {
      'data-coluna': l.coluna,
      class: ['na-grade', l.abre ? 'abre' : '', l.fecha ? 'fecha' : ''].filter(Boolean).join(' '),
      style: `grid-row: ${l.linha} / span ${l.vao}`,
    });
  });
  for (const v of vazios)
    decos.push(Decoration.widget(lista[v.depoisDo].fim, celulaVazia(v.linha, v.coluna, v.vao), { side: 1, key: `vazio:${v.linha}:${v.coluna}:${v.vao}`, ignoreSelection: true }));
  return { ativo, decos: DecorationSet.create(state.doc, decos), assinatura: JSON.stringify([lugares, vazios]) };
}

/* ---------- o FLIP ---------- */

const semMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Onde cada trecho (e cada célula vazia) está na tela agora, com a animação que estiver no meio. */
const medir = (view: EditorView) => new Map([...view.dom.children].filter((el): el is HTMLElement => el instanceof HTMLElement).map((el) => [el, el.getBoundingClientRect()] as const));

/** Leva cada elemento de onde estava (`antes`) ao lugar novo, como se andasse até lá. */
function animar(antes: Map<HTMLElement, DOMRect>) {
  if (semMovimento()) return;
  let i = 0;
  for (const [el, a] of antes) {
    if (!el.isConnected || typeof el.animate !== 'function') continue;
    el.getAnimations().forEach((x) => x.cancel());
    const d = el.getBoundingClientRect();
    const dx = a.left - d.left;
    const dy = a.top - d.top;
    if (Math.abs(dx) + Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.85 }, { transform: 'none', opacity: 1 }], {
      duration: 520,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      delay: Math.min(220, i++ * 18),
      fill: 'backwards',
    });
  }
}

/**
 * Troca a visão da folha. `junto` roda logo depois da troca, ainda antes da animação (a tela que muda junto, com o
 * `flushSync` do React), para o FLIP medir o lugar final de tudo.
 */
export function mudarVisao(editor: Editor, visao: Visao, junto?: () => void) {
  const { view } = editor;
  if ((chave.getState(view.state)?.ativo ?? false) === (visao === 'colunas')) return junto?.();
  const antes = medir(view);
  view.dispatch(view.state.tr.setMeta(chave, visao === 'colunas').setMeta('addToHistory', false));
  junto?.();
  animar(antes);
}

/** A visão de agora. */
export const visaoDe = (editor: Editor): Visao => (chave.getState(editor.state)?.ativo ? 'colunas' : 'texto');

export const Colunas = Extension.create<{ inicial: Visao }>({
  name: 'colunasDaEscrita',
  // a visão em que a folha abre: o envio que a edição lê pela Pauta (#197) já abre nas colunas
  addOptions: () => ({ inicial: 'texto' as Visao }),
  addProseMirrorPlugins() {
    const inicial = this.options.inicial === 'colunas';
    return [
      new Plugin<Estado>({
        key: chave,
        state: {
          init: (_, state) => decorar(state, inicial),
          apply: (tr, antigo, _velho, novo) => {
            const meta = tr.getMeta(chave) as boolean | undefined;
            const ativo = meta ?? antigo.ativo;
            return meta !== undefined || (ativo && tr.docChanged) ? decorar(novo, ativo) : antigo;
          },
        },
        props: {
          decorations: (state) => chave.getState(state)?.decos,
          // a grade vale já na raiz do editor, no mesmo instante da troca (a medida do FLIP depende disso)
          attributes: (state): Record<string, string> => ({ 'data-visao': chave.getState(state)?.ativo ? 'colunas' : 'texto' }),
        },
        // nas colunas, o trecho que muda de lugar enquanto se digita (ou chega da sala) anda até o lugar novo
        view: () => {
          let antes = new Map<HTMLElement, DOMRect>();
          let assinatura = '';
          return {
            update: (view) => {
              const st = chave.getState(view.state);
              if (!st?.ativo) {
                antes = new Map();
                assinatura = '';
                return;
              }
              if (assinatura && st.assinatura !== assinatura) animar(antes);
              assinatura = st.assinatura;
              antes = medir(view);
            },
          };
        },
      }),
    ];
  },
});
