import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as TeclaReact } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { comentar, lerComentarios, marcarVisto, ouvirComentarios, refazerAncoras, resolverComentario, responder, type ComentariosLidos } from '../dados/comentarios';
import { corDe, iniciais } from '../dados/colaboracao';
import { ancorasGuardadas, ancorasRefeitas, ancoraDaSelecao, ativarComentario, definirAncoras, faixasDosComentarios } from '../editor/comentarios';
import { fiosDosComentarios, mencaoSendoDigitada, pedacosComMencoes, podeResolver, quemCombina, type Ancora, type Comentario, type Fio, type Quem } from '../modelo/comentarios';
import type { Pessoa } from '../modelo/tipos';
import { CaixinhaDoDesfazer, type Desfazivel } from './desfazer';
import { Icone } from './icones';
import { BolinhaDeAviso } from './pecas';
import { haQuantoTempo, TELA_DE_CELULAR } from './util';
import './areas.css';
import './comentarios.css';

/* Os comentários da folha de escrita (#192): os balões na margem direita, cada um à altura do trecho comentado, com o
   fio (autor, papel e hora de cada um), o responder e o resolver (com a CaixinhaDoDesfazer). Comentar é selecionar um
   trecho e apertar Comentar ou Ctrl+Alt+M: toda pessoa que lê o roteiro comenta, também quem só lê o texto, porque o
   comentário fica fora do documento (no servidor) e o trecho é achado pela âncora por citação. Chegam ao vivo pelo
   aviso da fila. Os que citam a pessoa (ou que chegaram no roteiro dela) levam a bolinha de aviso até ela mexer neles; ao
   abrir o roteiro, o aviso some da lista e do topo. Na tela estreita, só o balão aberto aparece, por cima da folha; no
   celular, ele é uma folha de baixo. */

/** O id do comentário que está sendo escrito (ainda sem id do servidor). */
const NOVO = 'novo';
/** A folha larga o bastante para a margem dos balões. */
const TELA_LARGA = '(min-width: 1440px)';
/** O respiro entre dois balões empilhados. */
const VAO = 10;
/** Quanto a folha espera, depois da última tecla, para guardar as âncoras refeitas. */
const ANCORAS_MS = 1500;

function useMedia(consulta: string) {
  const [bate, setBate] = useState(() => typeof matchMedia === 'function' && matchMedia(consulta).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(consulta);
    const mudou = () => setBate(m.matches);
    m.addEventListener('change', mudou);
    return () => m.removeEventListener('change', mudou);
  }, [consulta]);
  return bate;
}

interface Props {
  id: string;
  editor: Editor | null;
  eu?: Pessoa;
  avisar: (texto: string) => void;
  /** cresce a cada pedido de comentar (o botão Comentar da barra) */
  pedido: number;
  /** quantos comentários abertos há (para a barra) */
  contar?: (n: number) => void;
}

export function ComentariosDaFolha({ id, editor, eu, avisar, pedido, contar }: Props) {
  const [lidos, setLidos] = useState<ComentariosLidos | null>(null);
  const [novo, setNovo] = useState<{ ancora: Ancora } | null>(null);
  const [ativo, setAtivo] = useState<string | null>(null);
  // os balões com aviso em que a pessoa já mexeu aqui: a bolinha some
  const [mexidos, setMexidos] = useState<Set<string>>(() => new Set());
  const [caixinha, setCaixinha] = useState<Desfazivel | null>(null);
  const [, redesenhar] = useState(0);
  const larga = useMedia(TELA_LARGA);
  // no celular, o balão aberto é a folha de baixo: vai para o corpo da página, fora da folha que anima (o transform dela
  // prenderia o position: fixed)
  const celular = useMedia(TELA_DE_CELULAR);
  const avisarRef = useRef(avisar);
  avisarRef.current = avisar;

  // ler, e de novo a cada aviso ao vivo deste roteiro (e quando a conexão volta)
  const ler = useCallback(() => {
    void lerComentarios(id).then(setLidos, () => {});
  }, [id]);
  useEffect(() => {
    ler();
    return ouvirComentarios((a) => {
      if (a.tipo === 'reconectou' || (a.tipo === 'comentarios' && a.id === id)) ler();
    });
  }, [id, ler]);
  // a pessoa está vendo o roteiro: os avisos dela nele somem da lista e do topo (no roteiro, a bolinha fica até ela mexer)
  const novos = lidos?.novos ?? {};
  const chaveDosNovos = Object.keys(novos).sort().join(',');
  useEffect(() => {
    if (chaveDosNovos) void marcarVisto(id).catch(() => {});
  }, [id, chaveDosNovos]);
  // a hora de cada comentário anda sozinha
  useEffect(() => {
    const t = setInterval(() => redesenhar((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const fios = useMemo(() => fiosDosComentarios(lidos?.comentarios ?? []).filter((f) => !f.resolvido && f.ancora), [lidos]);
  useEffect(() => contar?.(fios.length), [fios.length, contar]);

  // as âncoras no texto: as dos abertos e a do que está sendo escrito
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    definirAncoras(editor.view, [...fios.map((f) => ({ id: f.id, ancora: f.ancora! })), ...(novo ? [{ id: NOVO, ancora: novo.ancora }] : [])]);
  }, [editor, fios, novo]);
  useEffect(() => {
    if (editor && !editor.isDestroyed) ativarComentario(editor.view, novo ? NOVO : ativo);
  }, [editor, ativo, novo]);

  // a cada mudança do texto os balões acompanham o trecho; quem escreve guarda as âncoras refeitas
  const escreve = !!lidos?.escreve;
  useEffect(() => {
    if (!editor) return;
    let prazo: ReturnType<typeof setTimeout> | undefined;
    const mudou = () => redesenhar((n) => n + 1);
    const guardar = () => {
      clearTimeout(prazo);
      if (!escreve) return;
      prazo = setTimeout(() => {
        if (editor.isDestroyed) return;
        const refeitas = ancorasRefeitas(editor.state);
        delete refeitas[NOVO];
        const ids = Object.keys(refeitas);
        if (ids.length)
          void refazerAncoras(id, refeitas).then(
            () => !editor.isDestroyed && ancorasGuardadas(editor.view, ids),
            () => {},
          );
      }, ANCORAS_MS);
    };
    editor.on('transaction', mudou);
    editor.on('update', guardar);
    window.addEventListener('resize', mudou);
    return () => {
      clearTimeout(prazo);
      editor.off('transaction', mudou);
      editor.off('update', guardar);
      window.removeEventListener('resize', mudou);
    };
  }, [editor, escreve, id]);

  // o clique no trecho grifado abre o balão dele
  useEffect(() => {
    const dom = editor && !editor.isDestroyed ? editor.view.dom : null;
    if (!dom) return;
    const clique = (e: MouseEvent) => {
      const alvo = (e.target as HTMLElement).closest?.('[data-comentario]');
      const c = alvo?.getAttribute('data-comentario');
      if (c && c !== NOVO) abrir(c);
    };
    dom.addEventListener('click', clique);
    return () => dom.removeEventListener('click', clique);
  });

  const abrir = (c: string | null) => {
    setAtivo(c);
    if (c) setMexidos((m) => (m.has(c) ? m : new Set(m).add(c)));
  };

  // comentar: o botão da barra e o Ctrl+Alt+M
  const comecar = useCallback(() => {
    if (!editor || editor.isDestroyed) return;
    const s = ancoraDaSelecao(editor.view);
    if (!s) return avisarRef.current('Selecione o trecho que quer comentar.');
    setAtivo(null);
    setNovo({ ancora: s.ancora });
  }, [editor]);
  const ultimoPedido = useRef(pedido);
  useEffect(() => {
    if (pedido === ultimoPedido.current) return;
    ultimoPedido.current = pedido;
    comecar();
  }, [pedido, comecar]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyM') {
        e.preventDefault();
        comecar();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [comecar]);
  // o Esc fecha o balão aberto
  useEffect(() => {
    if (!ativo) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAtivo(null);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ativo]);

  const juntar = (c: Comentario) =>
    setLidos((l) =>
      l
        ? {
            ...l,
            comentarios: [...l.comentarios.filter((x) => x.id !== c.id), c],
          }
        : l,
    );
  const enviarNovo = async (texto: string) => {
    if (!novo) return;
    const c = await comentar(id, texto, novo.ancora);
    juntar(c);
    setNovo(null);
    abrir(c.id);
  };
  const enviarResposta = async (fio: string, texto: string) => juntar(await responder(id, fio, texto));
  const resolver = (f: Fio) => {
    void resolverComentario(id, f.id).then(
      (c) => {
        juntar(c);
        setAtivo(null);
        const vez = Date.now();
        setCaixinha({
          id: vez,
          texto: 'Comentário resolvido.',
          desfazer: () => {
            setCaixinha((x) => x && { ...x, ocupado: true });
            resolverComentario(id, f.id, true).then(
              (r) => {
                juntar(r);
                setCaixinha(null);
                abrir(r.id);
              },
              (e: Error) => {
                setCaixinha((x) => x && { ...x, ocupado: false });
                avisarRef.current(e.message || 'Não consegui desfazer.');
              },
            );
          },
          fechar: () => setCaixinha(null),
        });
      },
      (e: Error) => avisarRef.current(e.message || 'Não consegui resolver o comentário.'),
    );
  };

  // onde cada balão fica: à altura do trecho; empilhados sem se cobrir, com o aberto no lugar dele
  const coluna = useRef<HTMLElement>(null);
  const baloes = useRef(new Map<string, HTMLElement>());
  const [tops, setTops] = useState<Record<string, number>>({});
  // os balões que já estão no lugar: só eles deslizam quando o lugar muda (o que chega aparece direto no lugar dele)
  const postos = useRef(new Set<string>());
  useEffect(() => {
    postos.current = new Set(Object.keys(tops));
  });
  const faixas = editor && !editor.isDestroyed ? faixasDosComentarios(editor.state) : new Map();
  const comTrecho = [...fios.filter((f) => faixas.has(f.id)).map((f) => f.id), ...(novo && faixas.has(NOVO) ? [NOVO] : [])];
  const semTrecho = fios.filter((f) => !faixas.has(f.id));
  const aberto = novo ? NOVO : ativo;
  useLayoutEffect(() => {
    const col = coluna.current;
    if (!editor || editor.isDestroyed || !col) return;
    const topo = col.getBoundingClientRect().top;
    const desejado = (c: string) => {
      const f = faixas.get(c);
      try {
        return f ? editor.view.coordsAtPos(f.de).top - topo : 0;
      } catch {
        return 0;
      }
    };
    const ordem = comTrecho
      .map((c) => ({
        c,
        d: desejado(c),
        h: baloes.current.get(c)?.offsetHeight ?? 0,
      }))
      .sort((a, b) => a.d - b.d);
    const novosTops: Record<string, number> = {};
    if (!larga) {
      // estreita: só o aberto, logo abaixo da linha do trecho
      const a = ordem.find((o) => o.c === aberto);
      if (a) novosTops[a.c] = a.d + 30;
    } else {
      const k = Math.max(
        0,
        ordem.findIndex((o) => o.c === aberto),
      );
      if (ordem.length) novosTops[ordem[k].c] = ordem[k].d;
      for (let i = k - 1; i >= 0; i--) novosTops[ordem[i].c] = Math.min(ordem[i].d, novosTops[ordem[i + 1].c] - ordem[i].h - VAO);
      for (let i = k + 1; i < ordem.length; i++) novosTops[ordem[i].c] = Math.max(ordem[i].d, novosTops[ordem[i - 1].c] + ordem[i - 1].h + VAO);
    }
    const igual = Object.keys(novosTops).length === Object.keys(tops).length && Object.entries(novosTops).every(([c, t]) => Math.abs((tops[c] ?? -1e9) - t) < 0.5);
    if (!igual) setTops(novosTops);
  });

  const pessoas = lidos?.pessoas ?? [];
  const quem = (c: string) => (c === NOVO ? null : (fios.find((f) => f.id === c) ?? null));
  const mostrar = larga ? comTrecho : comTrecho.filter((c) => c === aberto);

  const colunaDosBaloes = (
    <aside ref={coluna} className={`comentarios-da-folha${larga ? ' larga' : ' estreita'}`} aria-label="Comentários">
      {mostrar.map((c) => {
        const f = quem(c);
        const ref = (el: HTMLElement | null) => {
          if (el) baloes.current.set(c, el);
          else baloes.current.delete(c);
        };
        // até saber onde fica, transparente (não escondido: a caixa do comentário novo já recebe o foco)
        const estilo = {
          top: `${tops[c] ?? 0}px`,
          ...(tops[c] === undefined ? { opacity: 0 } : postos.current.has(c) ? {} : { transition: 'none' }),
        };
        if (!f)
          return (
            <article key={c} ref={ref} className="balao-comentario ativo escrevendo" style={estilo} aria-label="Comentário novo">
              <p className="balao-trecho">“{novo!.ancora.trecho}”</p>
              <CaixaDeComentario pessoas={pessoas} rotulo="Comentar" dica="Comente… use @ para chamar alguém" foco enviar={enviarNovo} cancelar={() => setNovo(null)} avisar={avisar} />
            </article>
          );
        return (
          <BalaoDoFio
            key={c}
            ref={ref}
            fio={f}
            estilo={estilo}
            aberto={aberto === c}
            novo={!!novos[c] && !mexidos.has(c)}
            pessoas={pessoas}
            resolve={podeResolver({
              autorDoComentario: f.autor.email === eu?.email,
              escreve,
            })}
            abrir={() => abrir(c)}
            fechar={() => setAtivo(null)}
            responder={(t) => enviarResposta(c, t)}
            resolver={() => resolver(f)}
            avisar={avisar}
          />
        );
      })}
    </aside>
  );
  return (
    <>
      {celular && typeof document !== 'undefined' ? createPortal(colunaDosBaloes, document.body) : colunaDosBaloes}
      {semTrecho.length > 0 && (
        <section className="comentarios-sem-trecho" aria-label="Comentários cujo trecho saiu do texto">
          <h3>O trecho destes comentários saiu do texto</h3>
          {semTrecho.map((f) => (
            <BalaoDoFio
              key={f.id}
              fio={f}
              aberto={ativo === f.id}
              novo={!!novos[f.id] && !mexidos.has(f.id)}
              pessoas={pessoas}
              resolve={podeResolver({
                autorDoComentario: f.autor.email === eu?.email,
                escreve,
              })}
              abrir={() => abrir(f.id)}
              fechar={() => setAtivo(null)}
              responder={(t) => enviarResposta(f.id, t)}
              resolver={() => resolver(f)}
              avisar={avisar}
              citacao
            />
          ))}
        </section>
      )}
      <CaixinhaDoDesfazer caixinha={caixinha} />
    </>
  );
}

/** Um comentário (ou resposta) do fio: a bolinha com as iniciais na cor da pessoa, o nome, o papel e a hora, e o texto
    com as menções destacadas. */
function ItemDoFio({ c, pessoas, novo }: { c: Comentario; pessoas: Quem[]; novo?: boolean }) {
  return (
    <div className="comentario-item">
      <span className="comentario-avatar" style={{ background: corDe(c.autor.email) }} aria-hidden="true">
        {iniciais(c.autor.nome)}
      </span>
      <div className="comentario-corpo">
        <p className="comentario-quem">
          <b>{c.autor.nome}</b>
          {novo && <BolinhaDeAviso rotulo="novo para você" />}
        </p>
        <p className="comentario-papel">
          {c.papel && `${c.papel} · `}
          <time dateTime={c.criadoEm} title={new Date(c.criadoEm).toLocaleString('pt-BR')}>
            {haQuantoTempo(c.criadoEm)}
          </time>
        </p>
        <p className="comentario-texto">
          {pedacosComMencoes(c.texto, pessoas).map((p, i) =>
            p.mencao ? (
              <span key={i} className="comentario-mencao">
                {p.texto}
              </span>
            ) : (
              <span key={i}>{p.texto}</span>
            ),
          )}
        </p>
      </div>
    </div>
  );
}

interface PropsDoBalao {
  fio: Fio;
  estilo?: React.CSSProperties;
  aberto: boolean;
  novo: boolean;
  pessoas: Quem[];
  resolve: boolean;
  abrir: () => void;
  fechar: () => void;
  responder: (texto: string) => Promise<void>;
  resolver: () => void;
  avisar: (t: string) => void;
  /** o trecho entre aspas no topo (o comentário cujo trecho saiu do texto) */
  citacao?: boolean;
  ref?: React.Ref<HTMLElement>;
}

/** O balão de um fio: o comentário e as respostas; aberto, o responder e o resolver. */
function BalaoDoFio({ fio, estilo, aberto, novo, pessoas, resolve, abrir, fechar, responder, resolver, avisar, citacao, ref }: PropsDoBalao) {
  const n = fio.respostas.length;
  return (
    <article
      ref={ref}
      className={`balao-comentario${aberto ? ' ativo' : ''}${novo ? ' novo' : ''}`}
      style={estilo}
      data-fio={fio.id}
      aria-label={`Comentário de ${fio.autor.nome}`}
      onClick={() => !aberto && abrir()}
    >
      {aberto && (
        <button type="button" className="balao-fechar" aria-label="Fechar o comentário" onClick={(e) => (e.stopPropagation(), fechar())}>
          <Icone nome="fechar" tam={13} traco={2} />
        </button>
      )}
      {citacao && fio.ancora && <p className="balao-trecho">“{fio.ancora.trecho}”</p>}
      <ItemDoFio c={fio} pessoas={pessoas} novo={novo} />
      {aberto || n <= 1 ? (
        fio.respostas.map((r) => <ItemDoFio key={r.id} c={r} pessoas={pessoas} />)
      ) : (
        <button type="button" className="botao-texto balao-respostas" onClick={abrir}>
          {n} respostas
        </button>
      )}
      {aberto && (
        <>
          <CaixaDeComentario pessoas={pessoas} rotulo="Responder" dica="Responder…" enviar={responder} avisar={avisar} />
          {resolve && (
            <button type="button" className="botao-texto balao-resolver" onClick={resolver}>
              <i className="anel" aria-hidden="true" /> Resolver
            </button>
          )}
        </>
      )}
    </article>
  );
}

/** A caixa de escrever um comentário ou uma resposta: cresce com o texto; Enter envia (Shift+Enter quebra a linha), Esc
    cancela; o @ abre a lista de quem chamar (setas e Enter, ou o clique). */
function CaixaDeComentario({
  pessoas,
  rotulo,
  dica,
  enviar,
  cancelar,
  foco,
  avisar,
}: {
  pessoas: Quem[];
  rotulo: string;
  dica: string;
  enviar: (texto: string) => Promise<void>;
  cancelar?: () => void;
  foco?: boolean;
  avisar: (t: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const [cursor, setCursor] = useState(0);
  const [escolha, setEscolha] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const caixa = useRef<HTMLTextAreaElement>(null);
  // o cursor depois do nome citado, posto junto com o texto novo (antes da próxima tecla)
  const cursorDepois = useRef<number | null>(null);
  useLayoutEffect(() => {
    const t = caixa.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
    if (cursorDepois.current !== null) {
      t.setSelectionRange(cursorDepois.current, cursorDepois.current);
      cursorDepois.current = null;
    }
  }, [texto]);
  useEffect(() => {
    if (foco) caixa.current?.focus({ preventScroll: true });
  }, [foco]);
  const digitado = mencaoSendoDigitada(texto.slice(0, cursor));
  const sugestoes = digitado === null ? [] : quemCombina(digitado, pessoas);
  const citar = (p: Quem) => {
    const antes = texto.slice(0, cursor).replace(/@[^@]*$/, `@${p.nome} `);
    const novo = antes + texto.slice(cursor);
    cursorDepois.current = antes.length;
    setTexto(novo);
    setCursor(antes.length);
    setEscolha(0);
    caixa.current?.focus();
  };
  const mandar = () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    enviar(t).then(
      () => {
        setTexto('');
        setEnviando(false);
      },
      (e: Error) => {
        setEnviando(false);
        avisar(e.message || 'Não consegui enviar o comentário.');
      },
    );
  };
  const tecla = (e: TeclaReact<HTMLTextAreaElement>) => {
    if (sugestoes.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setEscolha((i) => (i + (e.key === 'ArrowDown' ? 1 : sugestoes.length - 1)) % sugestoes.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        citar(sugestoes[Math.min(escolha, sugestoes.length - 1)]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      mandar();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (cancelar) cancelar();
      else (e.currentTarget as HTMLTextAreaElement).blur();
    }
  };
  return (
    <div className="caixa-de-comentario" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={caixa}
        rows={1}
        value={texto}
        placeholder={dica}
        aria-label={rotulo === 'Comentar' ? 'O seu comentário' : 'A sua resposta'}
        disabled={enviando}
        onChange={(e) => {
          setTexto(e.target.value);
          setCursor(e.target.selectionStart);
          setEscolha(0);
        }}
        onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
        onKeyDown={tecla}
      />
      {sugestoes.length > 0 && (
        <ul className="mencao-lista" role="listbox" aria-label="Chamar alguém">
          {sugestoes.map((p, i) => (
            <li
              key={p.email}
              role="option"
              aria-selected={i === escolha}
              onMouseDown={(e) => {
                e.preventDefault();
                citar(p);
              }}
            >
              <span className="comentario-avatar pequeno" style={{ background: corDe(p.email) }} aria-hidden="true">
                {iniciais(p.nome)}
              </span>
              {p.nome}
            </li>
          ))}
        </ul>
      )}
      <div className="caixa-de-comentario-acoes">
        <button type="button" className="botao" disabled={!texto.trim() || enviando} onClick={mandar}>
          {enviando ? 'Enviando…' : rotulo}
        </button>
        {cancelar && (
          <button type="button" className="botao-texto" onClick={cancelar}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
