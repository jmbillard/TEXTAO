import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type MutableRefObject } from 'react';
import type { Editor } from '@tiptap/core';
import { aplicarComando, barraNoCursor, definirTipo, tipoDoNo, trechoNoCursor, type PonteDaEscrita } from '../editor/escrita';
import { listarMarcas, marcaEm, type MarcaNoDoc } from '../editor/extensoes';
import { chaveDeArte } from '../modelo/diferencas';
import { CICLO_DOS_TIPOS, comandosQueBatem, contagemDoTexto, duracaoLegivel, artesDoTexto, nomeDoArquivo, SOBRE_O_TIPO, type ComandoDaBarra, type FichaNoTexto, type TipoDoTrecho } from '../modelo/trecho';
import { nomesDosTipos, normalizarSubtipo, type NoJSON } from '../modelo/tipos';
import { Atalhos } from './Atalhos';
import { Icone, Selo, type NomeIcone } from './icones';
import { PopoverMarca } from './TelaEditor';
import { ATALHO_DE_COMENTAR, atalho, copiarTexto } from './util';
import { Vagas } from './vagas';

/* Escrever na folha (#190, spec #186): o que a folha de escrita mostra por cima do editor. A margem dos tipos à
   esquerda (o rótulo de cada trecho, com o "?" do palpite, que se troca no clique ou no Tab), o menu do "/", o balão
   das fichas (timecode e arquivo, com o copiar), o balão da arte (o mesmo `PopoverMarca` da revisão), a lista das
   artes ao lado e o rodapé com os números e os atalhos. O teclado e o texto ficam na extensão `Escrita`
   (`editor/escrita.ts`); esta tela fala com ela pela ponte. */

/** O ícone de cada tipo do trecho e de cada comando do "/". */
export const ICONE_DO_TIPO: Record<TipoDoTrecho, NomeIcone> = {
  locucao: 'fala',
  arte: 'arte',
  sonora: 'aspas',
  edicao: 'edicao',
  trilha: 'sonoplastia',
  locutor: 'locutor',
  producao: 'producao',
  locacao: 'pino',
  comentario: 'comentario',
  texto: 'texto',
};
const iconeDoComando = (c: ComandoDaBarra): NomeIcone => (c.tipo ? ICONE_DO_TIPO[c.tipo] : c.id === 'timecode' ? 'relogio' : 'arquivo');

/** Redesenha a cada mudança do editor (o texto, a seleção). */
function useVersaoDoEditor(editor: Editor | null) {
  const [versao, mudar] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on('transaction', mudar);
    return () => void editor.off('transaction', mudar);
  }, [editor]);
  return versao;
}

/** Onde um ponto da tela fica dentro da folha (o corpo, que é a referência dos balões). */
const naFolha = (corpo: HTMLElement | null, x: number, y: number) => {
  const r = corpo?.getBoundingClientRect();
  return r ? { x: x - r.left, y: y - r.top } : { x, y };
};

/* ---------- a margem dos tipos ---------- */

interface TrechoNaMargem {
  chave: number;
  pos: number;
  tipo: TipoDoTrecho;
  confirmado: boolean;
  top: number;
  /** nas colunas (#193), o rótulo fica no começo do trecho, na coluna dele; no texto, na margem (0) */
  left: number;
  vazio: boolean;
}

/** A identidade de cada trecho na margem: o elemento do parágrafo, que o editor mantém enquanto o trecho existe. Assim,
    o rótulo do trecho que desce (um Enter acima dele) desliza junto, e só o do trecho novo aparece. */
let proximaChave = 1;
const CHAVES = new WeakMap<Element, number>();
const chaveDe = (el: Element) => {
  let k = CHAVES.get(el);
  if (!k) CHAVES.set(el, (k = proximaChave++));
  return k;
};

/** Onde o elemento fica dentro do corpo pelo lugar dele na página, sem a animação do momento (o FLIP das colunas move
    o trecho com `transform`; o rótulo vai direto ao lugar final e desliza na transição dele). */
function noCorpo(el: HTMLElement, corpo: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== corpo) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  if (n === corpo) return { x, y };
  const r = el.getBoundingClientRect();
  const b = corpo.getBoundingClientRect();
  return { x: r.left - b.left, y: r.top - b.top };
}

function trechosNaMargem(editor: Editor, corpo: HTMLElement): TrechoNaMargem[] {
  const out: TrechoNaMargem[] = [];
  editor.state.doc.forEach((no, pos) => {
    if (no.type.name !== 'paragraph') return;
    const el = editor.view.nodeDOM(pos);
    if (!(el instanceof HTMLElement)) return;
    const onde = noCorpo(el, corpo);
    const estilo = getComputedStyle(el);
    const linha = parseFloat(estilo.lineHeight) || 28;
    // o rótulo (20 px) no meio da primeira linha do trecho
    const top = onde.y + (parseFloat(estilo.paddingTop) || 0) + (linha - 20) / 2;
    // nas colunas (#193), o trecho tem a coluna dele (a decoração `data-coluna`): o rótulo vai junto
    const left = el.dataset.coluna ? Math.round(onde.x) : 0;
    out.push({ chave: chaveDe(el), pos, ...tipoDoNo(no), top: Math.round(top), left, vazio: !no.textContent.trim() });
  });
  return out;
}

function MargemDosTipos({ editor, escreve, abrir, aberto }: { editor: Editor; escreve: boolean; abrir: (t: TrechoNaMargem, el: HTMLElement) => void; aberto: number | null }) {
  const versao = useVersaoDoEditor(editor);
  const [trechos, setTrechos] = useState<TrechoNaMargem[]>([]);
  const [medida, remedir] = useReducer((n: number) => n + 1, 0);
  const corpo = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    corpo.current = editor.view.dom.closest('.folha-escrita-corpo');
    if (!corpo.current) return;
    const novos = trechosNaMargem(editor, corpo.current);
    setTrechos((velhos) => (JSON.stringify(velhos) === JSON.stringify(novos) ? velhos : novos));
  }, [editor, versao, medida]);
  // a largura muda a quebra das linhas: a margem acompanha
  useEffect(() => {
    const ro = new ResizeObserver(remedir);
    ro.observe(editor.view.dom);
    void document.fonts?.ready.then(remedir);
    return () => ro.disconnect();
  }, [editor]);
  const noCursor = trechoNoCursor(editor.state)?.pos;
  return (
    <div className="margem-dos-tipos" aria-label="O tipo de cada trecho">
      {trechos.map((t) => {
        const sobre = SOBRE_O_TIPO[t.tipo];
        const dica = `${sobre.nome}${t.confirmado ? '' : ', adivinhado pelo texto'}${escreve ? '. Clique para trocar (ou Tab no trecho)' : ''}`;
        return (
          <button
            key={t.chave}
            type="button"
            className={`tipo-na-margem${t.confirmado ? '' : ' palpite'}${t.pos === noCursor ? ' no-cursor' : ''}${t.vazio && t.tipo === 'texto' && !t.confirmado ? ' vazio' : ''}`}
            data-tipo={t.tipo}
            style={{ transform: `translate(${t.left}px, ${t.top}px)` }}
            disabled={!escreve}
            aria-haspopup="menu"
            aria-expanded={aberto === t.pos}
            aria-label={`Tipo do trecho: ${dica}`}
            title={dica}
            // o clique não tira o cursor do texto
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => abrir(t, e.currentTarget)}
          >
            {/* a troca do tipo reescreve o rótulo (o que muda é a chave de dentro) */}
            <span key={`${t.tipo}:${t.confirmado}`} className="tipo-na-margem-nome">
              {sobre.rotulo}
              {!t.confirmado && <i aria-hidden="true">?</i>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** O menu do tipo, aberto no clique da margem: os tipos na ordem do Tab, com os números, e a volta ao palpite. */
function MenuDoTipo({ editor, pos, x, y, fechar }: { editor: Editor; pos: number; x: number; y: number; fechar: () => void }) {
  const no = editor.state.doc.nodeAt(pos);
  const atual = no ? tipoDoNo(no) : null;
  const [ativo, setAtivo] = useState(() => Math.max(0, CICLO_DOS_TIPOS.indexOf(atual?.tipo ?? 'texto')));
  const escolher = useCallback(
    (tipo: TipoDoTrecho | null) => {
      definirTipo(editor, pos, tipo, tipo !== null);
      fechar();
      editor.commands.focus();
    },
    [editor, pos, fechar],
  );
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const n = CICLO_DOS_TIPOS.length;
      if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        return escolher(CICLO_DOS_TIPOS[(Number(e.key) + n - 1) % n]);
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setAtivo((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        escolher(CICLO_DOS_TIPOS[ativo]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        fechar();
        editor.commands.focus();
      }
    };
    // antes do editor: as teclas são do menu enquanto ele está aberto
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [ativo, escolher, fechar, editor]);
  if (!atual) return null;
  return (
    <div className="menu menu-do-tipo" role="menu" aria-label="Tipo do trecho" style={{ left: x, top: y }} onMouseDown={(e) => e.preventDefault()}>
      <div className="menu-cab-escrita">
        <span>Tipo do trecho</span>
        <span>{atual.confirmado ? 'escolhido' : 'adivinhado'}</span>
      </div>
      {CICLO_DOS_TIPOS.map((t, i) => (
        <button
          key={t}
          type="button"
          role="menuitemradio"
          aria-checked={atual.tipo === t && atual.confirmado}
          className={`menu-item${i === ativo ? ' ativo' : ''}`}
          data-tipo={t}
          onMouseEnter={() => setAtivo(i)}
          onClick={() => escolher(t)}
        >
          <Selo nome={ICONE_DO_TIPO[t]} />
          <span className="menu-texto">
            <strong>{SOBRE_O_TIPO[t].nome}</strong>
          </span>
          {atual.tipo === t && <span className="menu-sugerido">{atual.confirmado ? 'agora' : 'palpite'}</span>}
          <kbd className="menu-atalho">{(i + 1) % 10}</kbd>
        </button>
      ))}
      {atual.confirmado && (
        <>
          <div className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item" onClick={() => escolher(null)}>
            <Selo nome="lapis" />
            <span className="menu-texto">
              <strong>Deixar o PROMeiro adivinhar</strong>
              <small>volta ao palpite pelo texto, com o “?”</small>
            </span>
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- o menu do "/" ---------- */

/** O que se digitou marcado no nome do comando (o começo que bate). */
function Marcado({ texto, q }: { texto: string; q: string }) {
  const n = q.length;
  const bate = n && texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().startsWith(q.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase());
  return bate ? (
    <>
      <mark>{texto.slice(0, n)}</mark>
      {texto.slice(n)}
    </>
  ) : (
    <>{texto}</>
  );
}

function MenuDaBarra({ q, lista, ativo, x, y, escolher, apontar }: { q: string; lista: ComandoDaBarra[]; ativo: number; x: number; y: number; escolher: (c: ComandoDaBarra) => void; apontar: (i: number) => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  // a opção ativa fica à vista quando as setas descem além da borda
  useEffect(() => {
    caixa.current?.querySelector('.menu-item.ativo')?.scrollIntoView({ block: 'nearest' });
  }, [ativo]);
  return (
    <div ref={caixa} className="menu menu-da-barra" role="listbox" aria-label="Comandos" style={{ left: x, top: y }} onMouseDown={(e) => e.preventDefault()}>
      <div className="menu-cab-escrita">
        <span>Comandos</span>
        <code>/{q}</code>
      </div>
      {lista.map((c, i) => (
        <button key={c.id} type="button" role="option" aria-selected={i === ativo} className={`menu-item alto${i === ativo ? ' ativo' : ''}`} data-comando={c.id} data-tipo={c.tipo} onMouseEnter={() => apontar(i)} onClick={() => escolher(c)}>
          <Selo nome={iconeDoComando(c)} />
          <span className="menu-texto">
            <strong>
              <Marcado texto={c.nome} q={q} />
            </strong>
            <small>{c.dica}</small>
          </span>
          <code className="menu-atalho">/{c.id}</code>
        </button>
      ))}
    </div>
  );
}

/* ---------- o balão da ficha ---------- */

function BalaoDaFicha({ ficha, x, y }: { ficha: { tipo: FichaNoTexto['tipo']; texto: string }; x: number; y: number }) {
  const [copiado, setCopiado] = useState<'sim' | 'nao' | null>(null);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(null), 1800);
    return () => clearTimeout(t);
  }, [copiado]);
  const copiar = () => copiarTexto(ficha.texto).then(() => setCopiado('sim'), () => setCopiado('nao'));
  const arquivo = ficha.tipo === 'arquivo';
  return (
    <div className="popover balao-da-ficha" role="dialog" aria-label={arquivo ? 'Arquivo na rede' : 'Timecode'} style={{ left: x, top: y }} data-ficha={ficha.tipo}>
      <span className="rotulo">{arquivo ? 'Arquivo na rede' : 'Timecode'}</span>
      <h3>{arquivo ? nomeDoArquivo(ficha.texto) : ficha.texto}</h3>
      {arquivo && <code className="balao-da-ficha-caminho">{ficha.texto}</code>}
      <span className="suave">{arquivo ? 'A edição abre direto do servidor.' : 'O ponto do material, para a edição achar.'}</span>
      <div className="popover-acoes">
        <button type="button" className={`botao${arquivo ? ' primario' : ''}`} onClick={() => void copiar()} aria-live="polite">
          <Icone nome="copiar" tam={14} traco={2} />
          {copiado === 'sim' ? 'Copiado' : copiado === 'nao' ? 'Não consegui copiar' : arquivo ? 'Copiar o caminho' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

/* ---------- a folha: margem, menus e balões ---------- */

/**
 * O que a escrita mostra dentro da folha (no corpo, `data-margem="tipos"`): a margem, o menu do "/", o menu do tipo e os
 * balões. Liga a ponte da extensão `Escrita` a cada desenho.
 */
export function EscritaNaFolha({ editor, escreve, ponte, arteAberta, abrirArte }: { editor: Editor; escreve: boolean; ponte: MutableRefObject<PonteDaEscrita>; arteAberta: string | null; abrirArte: (id: string | null) => void }) {
  useVersaoDoEditor(editor);
  const corpo = useCallback(() => editor.view.dom.closest<HTMLElement>('.folha-escrita-corpo'), [editor]);

  // o "/": abre quando ele é digitado e fica enquanto o que vem depois for só letras
  const [barraEm, setBarraEm] = useState<number | null>(null);
  const [ativo, setAtivo] = useState(0);
  useEffect(() => {
    const aoMudar = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      const b = barraNoCursor(editor.state);
      setBarraEm((em) => (b && transaction.docChanged && b.q === '' ? b.from : b && b.from === em ? em : null));
    };
    editor.on('transaction', aoMudar);
    return () => void editor.off('transaction', aoMudar);
  }, [editor]);
  const barra = barraEm !== null ? barraNoCursor(editor.state) : null;
  const lista = barra && barra.from === barraEm ? comandosQueBatem(barra.q) : [];
  const menuAberto = escreve && !!barra && lista.length > 0;
  useEffect(() => setAtivo(0), [barra?.q]);
  const escolherComando = (c: ComandoDaBarra) => {
    if (!barra) return;
    setBarraEm(null);
    aplicarComando(editor, c, barra);
  };

  // o menu do tipo (clique na margem) e os balões
  const [menuDoTipo, setMenuDoTipo] = useState<{ pos: number; x: number; y: number } | null>(null);
  const [ficha, setFicha] = useState<{ tipo: FichaNoTexto['tipo']; texto: string; x: number; y: number } | null>(null);

  ponte.current = {
    teclaNoMenu: (e) => {
      if (!menuAberto) return false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setAtivo((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + lista.length) % lista.length);
        return true;
      }
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        escolherComando(lista[Math.min(ativo, lista.length - 1)]);
        return true;
      }
      if (e.key === 'Escape') {
        setBarraEm(null);
        return true;
      }
      return false;
    },
    abrirFicha: ({ tipo, texto, el }) => {
      const r = el.getBoundingClientRect();
      const p = naFolha(corpo(), r.left, r.bottom);
      abrirArte(null);
      setFicha({ tipo, texto, x: Math.max(0, p.x - 6), y: p.y + 8 });
    },
    aoClicar: (pos) => {
      setFicha(null);
      const m = escreve && editor.state.selection.empty ? marcaEm(editor, pos) : null;
      abrirArte(m?.nome === 'arte' ? m.id : null);
    },
    // #190 deixa o gancho: quando as sugestões de arte entrarem, o Tab aceita a sugestão do trecho antes de trocar o tipo
    aceitarSugestao: () => false,
  };

  // Esc e o clique fora fecham os balões (o clique no texto decide sozinho, pelo aoClicar)
  useEffect(() => {
    if (!ficha && !arteAberta && !menuDoTipo) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setFicha(null);
      abrirArte(null);
    };
    const fora = (e: PointerEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.closest('.popover, .menu, .tipo-na-margem, .ficha-do-texto, .artes-da-escrita')) return;
      setMenuDoTipo(null);
      setFicha(null);
      if (!alvo.closest('.texto-escrita')) abrirArte(null);
    };
    window.addEventListener('keydown', tecla);
    window.addEventListener('pointerdown', fora, true);
    return () => {
      window.removeEventListener('keydown', tecla);
      window.removeEventListener('pointerdown', fora, true);
    };
  }, [ficha, arteAberta, menuDoTipo, abrirArte]);

  const marca = useMemo(() => (arteAberta ? (listarMarcas(editor.state.doc, 'arte').find((m) => m.id === arteAberta) ?? null) : null), [editor, arteAberta, editor.state.doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const posDaMarca = (() => {
    if (!marca) return null;
    try {
      const c = editor.view.coordsAtPos(marca.from);
      const p = naFolha(corpo(), c.left, c.bottom);
      return { x: Math.max(0, p.x - 8), y: p.y + 8 };
    } catch {
      return null;
    }
  })();
  const posDaBarra = (() => {
    if (!menuAberto || !barra) return null;
    try {
      const c = editor.view.coordsAtPos(barra.from);
      return naFolha(corpo(), c.left - 10, c.bottom + 6);
    } catch {
      return null;
    }
  })();

  return (
    <>
      <MargemDosTipos
        editor={editor}
        escreve={escreve}
        aberto={menuDoTipo?.pos ?? null}
        abrir={(t, el) => {
          if (menuDoTipo?.pos === t.pos) return setMenuDoTipo(null);
          const r = el.getBoundingClientRect();
          const p = naFolha(corpo(), r.left, r.bottom);
          setMenuDoTipo({ pos: t.pos, x: p.x, y: p.y + 6 });
        }}
      />
      {menuDoTipo && <MenuDoTipo key={menuDoTipo.pos} editor={editor} pos={menuDoTipo.pos} x={menuDoTipo.x} y={menuDoTipo.y} fechar={() => setMenuDoTipo(null)} />}
      {menuAberto && barra && posDaBarra && <MenuDaBarra q={barra.q} lista={lista} ativo={Math.min(ativo, lista.length - 1)} x={posDaBarra.x} y={posDaBarra.y} escolher={escolherComando} apontar={setAtivo} />}
      {ficha && <BalaoDaFicha key={ficha.texto} ficha={ficha} x={ficha.x} y={ficha.y} />}
      {marca && posDaMarca && <PopoverMarca editor={editor} marca={marca} x={posDaMarca.x} y={posDaMarca.y} fechar={() => abrirArte(null)} />}
    </>
  );
}

/* ---------- a lista das artes ao lado ---------- */

interface ArteNaLista {
  ordem: number;
  texto: string;
  vezes: number;
  marca: MarcaNoDoc | null;
  onde: string;
  subtipo: string;
}

/** As artes do texto (numeradas, sem repetir) com a primeira marca de cada uma: onde ela está e o tipo da arte. */
function artesNaLista(editor: Editor): ArteNaLista[] {
  const marcas = listarMarcas(editor.state.doc, 'arte');
  return artesDoTexto(editor.getJSON() as NoJSON).map((a) => {
    const k = chaveDeArte(a.texto);
    const marca = marcas.find((m) => chaveDeArte(m.texto) === k) ?? null;
    let onde = '';
    if (marca) {
      const $m = editor.state.doc.resolve(marca.from);
      const tipo = $m.parent.type.name === 'paragraph' ? tipoDoNo($m.parent).tipo : 'texto';
      onde = tipo === 'arte' ? 'trecho de arte' : tipo === 'texto' ? 'marcada no texto' : `marcada na ${SOBRE_O_TIPO[tipo].nome.toLowerCase()}`;
    }
    return { ...a, marca, onde, subtipo: normalizarSubtipo(marca?.attrs.subtipo) };
  });
}

/** A lista das artes ao lado da folha, como a da revisão: numeradas e sem repetir. O clique leva à arte no texto e abre
    o balão dela (o tipo da arte, opcional, e a observação). */
export function ArtesDaEscrita({ editor, escreve, abrirArte, arteAberta }: { editor: Editor; escreve: boolean; abrirArte: (id: string | null) => void; arteAberta: string | null }) {
  useVersaoDoEditor(editor);
  const artes = artesNaLista(editor);
  const ir = (a: ArteNaLista) => {
    if (!a.marca) return;
    editor.chain().setTextSelection(a.marca.to).scrollIntoView().run();
    const el = editor.view.domAtPos(a.marca.from).node;
    (el instanceof HTMLElement ? el : el.parentElement)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (escreve) abrirArte(a.marca.id);
  };
  return (
    <section className="cartao artes-da-escrita" aria-label="As artes do roteiro">
      <div className="cab-artes">
        <b>
          <i>{artes.length}</i> {artes.length === 1 ? 'arte' : 'artes'}
        </b>
        <span className="rotulo">vão para a arte</span>
      </div>
      <ol className="artes so-lista">
        <Vagas
          itens={artes}
          chave={(a) => chaveDeArte(a.texto)}
          como="li"
          vazio={
            <p className="suave pequeno artes-da-escrita-vazio">
              Selecione um trecho e use <kbd>{atalho('Mod-u')}</kbd>: a arte aparece aqui.
            </p>
          }
        >
          {(a) => (
            <div className={`arte-da-escrita${a.marca && a.marca.id === arteAberta ? ' ativa' : ''}`}>
              <button type="button" className="arte-linha" onClick={() => ir(a)}>
                <span className="b">{a.ordem}</span>
                <span className="txt">
                  <b>{a.texto}</b>
                  <span className={a.subtipo ? '' : 'pede'}>
                    {[a.onde, a.subtipo ? nomesDosTipos(a.marca?.attrs.subtipo) : 'sem tipo', a.vezes > 1 ? `${a.vezes} vezes` : ''].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </div>
          )}
        </Vagas>
      </ol>
      <p className="artes-da-escrita-nota suave pequeno">As artes saem do texto: o trecho de arte e o que você marca com {atalho('Mod-u')}.</p>
    </section>
  );
}

/* ---------- o rodapé ---------- */

const numero = (n: number) => n.toLocaleString('pt-BR');

/** O rodapé da folha, o mesmo da revisão (`estatisticas`): as palavras, as da locução, o tempo de leitura e as artes; e
    os atalhos à vista, com o cartão "?". */
export function RodapeDaEscrita({ editor }: { editor: Editor }) {
  useVersaoDoEditor(editor);
  const doc = editor.getJSON() as NoJSON;
  const c = contagemDoTexto(doc);
  const nArtes = artesDoTexto(doc).length;
  return (
    <>
      <footer className="estatisticas rodape-da-escrita" aria-label="Números do roteiro">
        <span>
          <b>{numero(c.palavras)}</b> {c.palavras === 1 ? 'palavra' : 'palavras'}
        </span>
        <span>
          <b>{numero(c.locucao)}</b> na locução
        </span>
        <span className="tempo" title="Locução e sonoras, no ritmo médio de leitura de chamada">
          ≈ <b>{duracaoLegivel(c.segundos)}</b> de leitura
        </span>
        <span>
          <b>{nArtes}</b> {nArtes === 1 ? 'arte' : 'artes'}
        </span>
        {/* os atalhos à vista; os próximos tickets acrescentam os deles (comentar, #192) */}
        <span className="dir atalhos-da-escrita">
          <span>
            <kbd>/</kbd> comandos
          </span>
          <span>
            <kbd>Tab</kbd> confirma ou troca o tipo
          </span>
          <span>
            <kbd>{atalho('Mod-u')}</kbd> arte
          </span>
          <span>
            <kbd>{ATALHO_DE_COMENTAR}</kbd> comenta
          </span>
          <span>
            <kbd>{atalho('Mod-Shift-l')}</kbd> limpo
          </span>
          <span>
            <kbd>?</kbd> atalhos
          </span>
        </span>
      </footer>
      <Atalhos tela="escrita" />
    </>
  );
}
