import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import History from '@tiptap/extension-history';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { redoDepth, undoDepth } from '@tiptap/pm/history';
import { armazenamento, type Versao } from '../dados/armazenamento';
import {
  Arte, atualizarMarca, Celula, converterLayout, Etiqueta, limparMarcas, Linha, listarMarcas, marcaEm, marcarArte,
  marcarEtiqueta, Reconhecimento, sugestaoParaSelecao, Teclado, trocarPorEtiqueta, type MarcaNoDoc,
} from '../editor/extensoes';
import { exportar, listaDeArtes, type Saida } from '../modelo/exportar';
import {
  ETIQUETAS, NOMES_COLUNAS, nomeSubtipo, novoId, SUBTIPOS_ARTE, type Layout, type Meta, type Pessoa, type Roteiro, type SubtipoArte, type TipoPrograma,
} from '../modelo/tipos';
import { LOCUTORES, NOMES_TIPO_PROGRAMA, PRACAS, PROGRAMAS, SELOS } from '../modelo/vocabularios';
import { Icone, Selo, type NomeIcone } from './icones';
import { atalho, baixar, copiarTexto, dataPorExtenso, haQuantoTempo, nomeDoArquivo, plural } from './util';

const ALTURA_CARTAO = 62;

/* ---------- campos do cabeçalho ---------- */

function Campo(props: {
  valor: string;
  aoMudar: (v: string) => void;
  rotulo: string;
  vazio: string;
  lista?: string;
  falta?: boolean;
  classe?: string;
  modo?: 'numeric' | 'text';
}) {
  return (
    <span className={`campo ${props.falta && !props.valor ? 'falta' : ''} ${props.classe ?? ''}`} data-valor={props.valor || props.vazio}>
      <input
        size={1}
        value={props.valor}
        placeholder={props.vazio}
        aria-label={props.rotulo}
        list={props.lista}
        inputMode={props.modo}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => props.aoMudar(e.target.value)}
      />
    </span>
  );
}

function Cabecalho({ meta, mudar }: { meta: Meta; mudar: (m: Partial<Meta>) => void }) {
  const data = useRef<HTMLInputElement>(null);
  return (
    <header className="cab">
      <div className="cab-linha rotulo">
        <Campo
          valor={meta.programa}
          rotulo="Programa"
          vazio="Programa"
          lista="lista-programas"
          aoMudar={(v) => {
            const p = PROGRAMAS.find((x) => x.nome.toLowerCase() === v.trim().toLowerCase()) ?? null;
            mudar({ programa: v, ...(p ? { tipoPrograma: p.tipo } : {}) });
          }}
        />
        <span className="ponto">·</span>
        <span className="campo-select">
          <select value={meta.tipoPrograma} aria-label="Tipo de programa" onChange={(e) => mudar({ tipoPrograma: e.target.value as TipoPrograma })}>
            {Object.entries(NOMES_TIPO_PROGRAMA).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </span>
        <span className="ponto">·</span>
        <span className="campo-data">
          <button className={meta.dataExibicao ? '' : 'falta'} onClick={() => data.current?.showPicker?.()}>
            {dataPorExtenso(meta.dataExibicao) || 'data de exibição'}
          </button>
          <input ref={data} type="date" tabIndex={-1} aria-label="Data de exibição" value={meta.dataExibicao} onChange={(e) => mudar({ dataExibicao: e.target.value })} />
        </span>
        <span className="ponto">·</span>
        <Campo valor={meta.praca} rotulo="Praça" vazio="praça" lista="lista-pracas" aoMudar={(v) => mudar({ praca: v.toUpperCase() })} />
      </div>

      <Campo classe="cab-titulo" valor={meta.titulo} rotulo="Título da chamada" vazio="Título da chamada" aoMudar={(v) => mudar({ titulo: v })} />

      <p className="cab-frase">
        Locução <Campo valor={meta.locutor} rotulo="Locutor" vazio="quem grava?" lista="lista-locutores" falta aoMudar={(v) => mudar({ locutor: v.toUpperCase() })} />,{' '}
        <button className="alternar" title="Alternar entre “fecha em” e “no máximo”" onClick={() => mudar({ duracaoModo: meta.duracaoModo === 'max' ? 'fechar' : 'max' })}>
          {meta.duracaoModo === 'max' ? 'no máximo' : 'fecha em'}
        </button>{' '}
        <Campo
          valor={meta.duracaoAlvoSeg ? String(meta.duracaoAlvoSeg) : ''}
          rotulo="Duração em segundos"
          vazio="quantos"
          modo="numeric"
          falta
          aoMudar={(v) => mudar({ duracaoAlvoSeg: parseInt(v.replace(/\D/g, ''), 10) || null })}
        />
        ’’, selo <Campo valor={meta.selo} rotulo="Selo" vazio="qual selo?" lista="lista-selos" falta aoMudar={(v) => mudar({ selo: v })} />.{' '}
        {meta.tipoPrograma === 'novela' ? (
          <>
            Capítulo{' '}
            <Campo valor={meta.capitulo ? String(meta.capitulo) : ''} rotulo="Capítulo" vazio="nº" modo="numeric" aoMudar={(v) => mudar({ capitulo: parseInt(v.replace(/\D/g, ''), 10) || null })} />.{' '}
          </>
        ) : (
          <>
            Edição <Campo valor={meta.edicao} rotulo="Edição do programa" vazio="opcional" aoMudar={(v) => mudar({ edicao: v })} />.{' '}
          </>
        )}
        Redação: <Campo valor={meta.redator} rotulo="Redator" vazio="quem escreveu?" falta aoMudar={(v) => mudar({ redator: v })} />.
      </p>

      <datalist id="lista-programas">{PROGRAMAS.map((p) => <option key={p.nome} value={p.nome} />)}</datalist>
      <datalist id="lista-locutores">{LOCUTORES.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="lista-selos">{SELOS.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="lista-pracas">{PRACAS.map((p) => <option key={p} value={p} />)}</datalist>
    </header>
  );
}

/* ---------- menus ---------- */

interface ItemMenu {
  id: string;
  texto: string;
  icone?: NomeIcone;
  atalho?: string;
  separar?: boolean;
  sub?: boolean;
  acao: () => void;
}

/** Menu do botão direito. O foco continua no texto: as setas e o Enter são capturados aqui. */
function MenuEtiquetas({ editor, x, y, programa, fechar }: { editor: Editor; x: number; y: number; programa: string; fechar: () => void }) {
  const sugestao = useMemo(() => sugestaoParaSelecao(editor, programa), [editor, programa]);
  const [ativo, setAtivo] = useState(-1);
  const [sub, setSub] = useState(false);
  const [subAtivo, setSubAtivo] = useState(0);

  const subtipos = useMemo(() => [...SUBTIPOS_ARTE].sort((a, b) => +(b.id === sugestao) - +(a.id === sugestao)), [sugestao]);
  const fazer = (f: () => void) => () => {
    f();
    fechar();
  };
  const itens: ItemMenu[] = [
    { id: 'arte', texto: 'Arte', icone: 'arte', atalho: atalho('Mod-u'), sub: true, acao: fazer(() => marcarArte(editor, sugestao, programa)) },
    ...ETIQUETAS.filter((e) => e.id !== 'comentario').map((e): ItemMenu => ({
      id: e.id, texto: e.nome, icone: e.id, atalho: atalho(e.atalho), acao: fazer(() => marcarEtiqueta(editor, e.id)),
    })),
    { id: 'comentario', texto: 'Transformar em comentário', icone: 'comentario', atalho: atalho('Mod-Shift-m'), separar: true, acao: fazer(() => marcarEtiqueta(editor, 'comentario')) },
    { id: 'limpar', texto: 'Limpar marcações', icone: 'borracha', separar: true, acao: fazer(() => limparMarcas(editor)) },
  ];

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const usar = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === 'Escape') return usar(), fechar();
      if (sub) {
        if (e.key === 'ArrowDown') return usar(), setSubAtivo((i) => (i + 1) % subtipos.length);
        if (e.key === 'ArrowUp') return usar(), setSubAtivo((i) => (i - 1 + subtipos.length) % subtipos.length);
        if (e.key === 'ArrowLeft') return usar(), setSub(false);
        if (e.key === 'Enter') return usar(), marcarArte(editor, subtipos[subAtivo].id, programa), fechar();
        return;
      }
      if (e.key === 'ArrowDown') return usar(), setAtivo((i) => (i + 1) % itens.length);
      if (e.key === 'ArrowUp') return usar(), setAtivo((i) => (i <= 0 ? itens.length - 1 : i - 1));
      if (e.key === 'ArrowRight' && itens[ativo]?.sub) return usar(), setSub(true), setSubAtivo(0);
      if (e.key === 'Enter' && ativo >= 0) return usar(), itens[ativo].acao();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  });

  return (
    <div className="menu" role="menu" aria-label="Marcar trecho" style={{ left: x, top: y }} onMouseDown={(e) => e.preventDefault()}>
      {itens.map((it, i) => (
        <div key={it.id} className="menu-grupo">
          {it.separar && <div className="menu-sep" />}
          <button
            role="menuitem"
            className={`menu-item ${ativo === i ? 'ativo' : ''}`}
            aria-haspopup={it.sub || undefined}
            onMouseEnter={() => {
              setAtivo(i);
              setSub(!!it.sub);
            }}
            onClick={it.acao}
          >
            <Selo nome={it.icone!} />
            <span className="menu-texto">{it.texto}</span>
            <span className="menu-atalho">{it.atalho}</span>
            {it.sub && <Icone nome="direita" tam={12} traco={2.2} />}
          </button>
          {it.sub && sub && (
            <div className="menu submenu" role="menu" aria-label="Tipo de arte">
              {subtipos.map((s, k) => (
                <button key={s.id} role="menuitem" className={`menu-item ${subAtivo === k ? 'ativo' : ''}`} onMouseEnter={() => setSubAtivo(k)} onClick={fazer(() => marcarArte(editor, s.id, programa))}>
                  <Miniatura subtipo={s.id} />
                  <span className="menu-texto">{s.nome}</span>
                  {s.id === sugestao && <span className="menu-sugerido">sugerido</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Barra que aparece sobre a seleção. */
function BarraFlutuante({ editor, x, y, programa, abrirMenu }: { editor: Editor; x: number; y: number; programa: string; abrirMenu: () => void }) {
  return (
    <div className="barra-flutuante" role="toolbar" aria-label="Marcar trecho selecionado" style={{ left: x, top: y }} onMouseDown={(e) => e.preventDefault()}>
      <button className="bf-arte" title={`Arte (${atalho('Mod-u')})`} onClick={() => marcarArte(editor, undefined, programa)}>
        <Icone nome="arte" tam={15} /> <u>Arte</u>
      </button>
      <span className="bf-sep" />
      {ETIQUETAS.map((e) => (
        <button key={e.id} title={`${e.nome} (${atalho(e.atalho)})`} aria-label={e.nome} onClick={() => marcarEtiqueta(editor, e.id)}>
          <Icone nome={e.id} tam={15} />
        </button>
      ))}
      <span className="bf-sep" />
      <button title="Mais opções" aria-label="Mais opções" onClick={abrirMenu}>
        <Icone nome="baixo" tam={13} traco={2.2} />
      </button>
    </div>
  );
}

/** Edição de uma marcação já feita. */
function PopoverMarca({ editor, marca, x, y, fechar }: { editor: Editor; marca: MarcaNoDoc; x: number; y: number; fechar: () => void }) {
  const arte = marca.nome === 'arte';
  return (
    <div className="popover" role="dialog" aria-label="Editar marcação" style={{ left: x, top: y }}>
      <div className="popover-topo">
        <Selo nome={arte ? 'arte' : (marca.attrs.tipo as NomeIcone)} />
        <span className="rotulo">{arte ? 'Arte' : 'Etiqueta'}</span>
        <span className="campo-select forte">
          {arte ? (
            <select value={marca.attrs.subtipo} aria-label="Tipo de arte" onChange={(e) => atualizarMarca(editor, marca, { subtipo: e.target.value, sugerido: false })}>
              {SUBTIPOS_ARTE.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          ) : (
            <select value={marca.attrs.tipo} aria-label="Tipo de etiqueta" onChange={(e) => atualizarMarca(editor, marca, { tipo: e.target.value })}>
              {ETIQUETAS.map((s) => <option key={s.id} value={s.id}>{s.id === 'comentario' ? 'Comentário' : s.nome}</option>)}
            </select>
          )}
        </span>
        <button className="botao-icone pequeno" aria-label="Fechar" onClick={fechar}><Icone nome="fechar" tam={14} /></button>
      </div>
      <input
        className="popover-obs"
        placeholder={arte ? 'Observação para o Motion (opcional)' : 'Observação (opcional)'}
        aria-label="Observação"
        value={marca.attrs.obs ?? ''}
        onChange={(e) => atualizarMarca(editor, marca, { obs: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && fechar()}
      />
      <div className="popover-acoes">
        {arte && (
          <button className="botao-texto" onClick={() => (trocarPorEtiqueta(editor, marca, 'comentario'), fechar())}>Transformar em comentário</button>
        )}
        <span className="espaco" />
        <button className="botao-texto perigo" onClick={() => (atualizarMarca(editor, marca, null), fechar())}>Remover</button>
      </div>
    </div>
  );
}

/* ---------- artes na margem ---------- */

/** Como a arte vai ao ar, em miniatura. Lettering em alpha aparece sobre o xadrez de transparência. */
export function Miniatura({ subtipo, texto }: { subtipo: string; texto?: string }) {
  return (
    <span className="mini" data-subtipo={subtipo} aria-hidden="true">
      <span className="mini-forma">{subtipo === 'versao' && texto ? texto.slice(0, 7) : ''}</span>
    </span>
  );
}

function Checklist({ saida, confirmarTodas }: { saida: Saida; confirmarTodas: () => void }) {
  const r = saida.roteiro;
  const conferidas = saida.artes.filter((a) => a.conferida).length;
  const est = r.duracaoEstimadaSeg;
  const estouro = r.duracaoAlvoSeg ? est - r.duracaoAlvoSeg : 0;
  const folga = Math.max(1, Math.round((r.duracaoAlvoSeg ?? 0) * 0.1)); // a estimativa é aproximada
  const linhas: { ok: boolean; nome: string; valor: ReactNode }[] = [
    { ok: !!r.locutor, nome: 'Locução', valor: r.locutor || 'falta' },
    { ok: !!r.selo, nome: 'Selo', valor: r.selo ? (r.selo.startsWith('Verifique') ? 'Verifique' : r.selo) : 'falta' },
    {
      ok: !!r.duracaoAlvoSeg && estouro <= folga,
      nome: 'Tempo',
      valor: !r.duracaoAlvoSeg ? 'falta a duração' : estouro > folga ? `passa uns ${estouro}''` : `≈ ${est}'' de ${r.duracaoAlvoSeg}''`,
    },
    {
      ok: conferidas === saida.artes.length,
      nome: 'Tipos das artes',
      valor:
        conferidas === saida.artes.length ? (
          saida.artes.length ? 'conferidos' : 'sem artes'
        ) : (
          <button className="botao-texto" onClick={confirmarTodas} title="Aceitar os tipos sugeridos">confirmar {saida.artes.length - conferidas}</button>
        ),
    },
    { ok: !!r.redator, nome: 'Redação', valor: r.redator || 'falta' },
  ];
  return (
    <div className="checklist">
      <div className="rotulo">Antes de exportar</div>
      {linhas.map((l) => (
        <div key={l.nome} className={`check ${l.ok ? 'ok' : ''}`}>
          <span className="check-marca">{l.ok && <Icone nome="certo" tam={11} traco={3} />}</span>
          <span className="check-nome">{l.nome}</span>
          <span className="check-valor">{l.valor}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- compartilhar ---------- */

function Compartilhar({ publico, pessoas, mudar }: { publico: boolean; pessoas: string[]; mudar: (todos: boolean, lista: string[]) => void }) {
  const [usuarios, setUsuarios] = useState<Pessoa[] | null>(null);
  const [busca, setBusca] = useState('');
  const [modo, setModo] = useState<'eu' | 'algumas' | 'todos'>(publico ? 'todos' : pessoas.length ? 'algumas' : 'eu');
  useEffect(() => {
    armazenamento.usuarios().then(setUsuarios, () => setUsuarios([]));
  }, []);

  const escolher = (m: typeof modo) => {
    setModo(m);
    mudar(m === 'todos', m === 'algumas' ? pessoas : []);
  };
  const alternar = (email: string) => mudar(false, pessoas.includes(email) ? pessoas.filter((e) => e !== email) : [...pessoas, email]);
  const termo = busca.trim().toLowerCase();
  // quem já foi escolhido aparece mesmo que não esteja mais na lista
  const lista = [...(usuarios ?? []), ...pessoas.filter((e) => !(usuarios ?? []).some((u) => u.email === e)).map((e) => ({ nome: e.split('@')[0], email: e }))]
    .filter((u) => !termo || `${u.nome} ${u.email}`.toLowerCase().includes(termo));

  return (
    <div className="painel-compartilhar" role="dialog" aria-label="Quem pode ler este roteiro">
      <div className="rotulo">Quem pode ler</div>
      <div className="modos" role="radiogroup" aria-label="Quem pode ler">
        {([['eu', 'cadeado', 'Só eu', 'Ninguém mais vê'], ['algumas', 'pessoas', 'Algumas pessoas', 'Você escolhe quem'], ['todos', 'olho', 'Todos', 'Qualquer colega que entrar']] as const).map(([id, icone, nome, dica]) => (
          <button key={id} role="radio" aria-checked={modo === id} className="modo" onClick={() => escolher(id)}>
            <Selo nome={icone} />
            <span className="menu-texto"><strong>{nome}</strong><small>{dica}</small></span>
            <span className="modo-marca">{modo === id && <Icone nome="certo" tam={12} traco={3} />}</span>
          </button>
        ))}
      </div>
      {modo === 'algumas' && (
        <div className="quem">
          {(usuarios?.length ?? 0) > 6 && <input className="popover-obs" placeholder="Buscar pessoa" aria-label="Buscar pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} />}
          <ul>
            {lista.map((u) => (
              <li key={u.email}>
                <label>
                  <input type="checkbox" checked={pessoas.includes(u.email)} onChange={() => alternar(u.email)} />
                  <span className="quem-nome">{u.nome}</span>
                  <span className="suave pequeno">{u.email}</span>
                </label>
              </li>
            ))}
          </ul>
          {usuarios && !lista.length && <p className="suave pequeno">{termo ? 'Ninguém com esse nome.' : 'Ainda não há outras pessoas por aqui. Elas aparecem depois do primeiro acesso.'}</p>}
        </div>
      )}
      <p className="suave pequeno">Quem recebe pode ler, exportar e duplicar. Só você edita.</p>
    </div>
  );
}

/* ---------- linha do tempo ---------- */

/** Arrastar para trás desfaz as edições desta sessão; para frente, refaz até o ponto atual. */
function LinhaDoTempo({ editor, versao }: { editor: Editor; versao: number }) {
  void versao; // recalcula a cada mudança no texto
  const feitas = undoDepth(editor.state);
  const total = feitas + redoDepth(editor.state);
  if (!total) return null;
  const ir = (alvo: number) => {
    let atual = undoDepth(editor.state);
    for (let i = 0; i < 500 && atual !== alvo; i++) {
      if (!(alvo < atual ? editor.commands.undo() : editor.commands.redo())) break;
      atual = undoDepth(editor.state);
    }
  };
  return (
    <div className="linha-do-tempo" role="group" aria-label="Linha do tempo das edições">
      <button className="botao-icone pequeno" title={`Desfazer (${atalho('Mod-z')})`} aria-label="Desfazer" disabled={!feitas} onClick={() => ir(feitas - 1)}><Icone nome="desfazer" tam={15} /></button>
      <input
        type="range"
        min={0}
        max={total}
        step={1}
        value={feitas}
        aria-label="Voltar ou avançar nas edições"
        aria-valuetext={feitas === total ? 'ponto atual' : `${total - feitas} ${total - feitas === 1 ? 'edição' : 'edições'} atrás`}
        style={{ '--pos': `${(feitas / total) * 100}%` } as React.CSSProperties}
        onChange={(e) => ir(Number(e.target.value))}
      />
      <button className="botao-icone pequeno" title="Refazer" aria-label="Refazer" disabled={feitas === total} onClick={() => ir(feitas + 1)}><Icone nome="refazer" tam={15} /></button>
      <span className="ldt-texto">{feitas === total ? 'agora' : `${total - feitas} atrás`}</span>
    </div>
  );
}

/* ---------- tela ---------- */

export function TelaEditor({ id, voltar, avisar, pessoa }: { id: string; voltar: () => void; avisar: (t: string) => void; pessoa?: Pessoa }) {
  const [roteiro, setRoteiro] = useState<Roteiro | null | undefined>(undefined);
  useEffect(() => {
    armazenamento.ler(id).then((r) => setRoteiro(r ?? null), () => setRoteiro(null));
  }, [id]);

  if (roteiro === undefined) return <div className="pagina" />;
  if (roteiro === null)
    return (
      <div className="pagina">
        <main className="biblioteca">
          <h1 className="titulo-serifa">Este roteiro não está neste navegador.</h1>
          <p className="suave">Ele pode ter sido apagado, ou foi criado em outro computador. Se você tem o .json, é só arrastar para cá.</p>
          <p><button className="botao" onClick={voltar}><Icone nome="voltar" tam={14} /> Ver os roteiros</button></p>
        </main>
      </div>
    );
  return <Folha inicial={roteiro} voltar={voltar} avisar={avisar} pessoa={pessoa} />;
}

function Folha({ inicial, voltar, avisar, pessoa }: { inicial: Roteiro; voltar: () => void; avisar: (t: string) => void; pessoa?: Pessoa }) {
  const pessoaRef = useRef(pessoa);
  pessoaRef.current = pessoa;
  const mexeu = useRef(false);
  const [meta, setMeta] = useState<Meta>(inicial.meta);
  const [docVersao, setDocVersao] = useState(0);
  const [selVersao, setSelVersao] = useState(0);
  const [salvo, setSalvo] = useState(true);
  const leitura = inicial.meu === false; // roteiro público de outra pessoa
  const comServidor = armazenamento.tipo === 'servidor';
  const [publico, setPublico] = useState(!!inicial.publico);
  const [pessoas, setPessoas] = useState<string[]>(inicial.compartilhadoCom ?? []);
  const [compartilhando, setCompartilhando] = useState(false);
  const publicoRef = useRef(publico);
  publicoRef.current = publico;
  const pessoasRef = useRef(pessoas);
  pessoasRef.current = pessoas;
  const marco = useRef<string | undefined>(undefined);
  const [historico, setHistorico] = useState<Versao[] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [popover, setPopover] = useState<{ nome: 'arte' | 'etiqueta'; id: string } | null>(null);
  const [exportando, setExportando] = useState(false);
  const [realce, setRealce] = useState<string | null>(null);
  const [tops, setTops] = useState<Record<string, number>>({});
  const [medida, setMedida] = useState(0);

  const area = useRef<HTMLDivElement>(null);
  const checklist = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);
  const revisao = useRef(inicial.revisao);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const aoClicar = useRef<(pos: number) => void>(() => {});

  const editor = useEditor({
    extensions: [
      Document, Paragraph, Text, Bold, Italic, HardBreak, History.configure({ depth: 500 }),
      Arte, Etiqueta, Linha, Celula, Reconhecimento, Teclado.configure({ programa: () => metaRef.current.programa }),
    ],
    content: inicial.doc,
    editable: inicial.meu !== false,
    editorProps: {
      attributes: { class: 'texto', spellcheck: 'true', lang: 'pt-BR', 'aria-label': 'Texto do roteiro' },
      handleClick: (_view, pos) => {
        aoClicar.current(pos);
        return false;
      },
    },
    onUpdate: () => {
      mexeu.current = true;
      setDocVersao((v) => v + 1);
      setSalvo(false);
    },
    onSelectionUpdate: () => setSelVersao((v) => v + 1),
  });

  const mudarMeta = useCallback((parte: Partial<Meta>) => {
    mexeu.current = true;
    try {
      if (parte.redator !== undefined) localStorage.setItem('roteirista.redator', parte.redator);
    } catch {
      /* sem armazenamento local, segue sem lembrar o nome */
    }
    setMeta((m) => ({ ...m, ...parte }));
    setSalvo(false);
  }, []);

  const roteiroAtual = useCallback(
    (): Roteiro => ({ ...inicial, meta: metaRef.current, doc: editor ? (editor.getJSON() as Roteiro['doc']) : inicial.doc, revisao: revisao.current, atualizadoEm: new Date().toISOString(), publico: publicoRef.current, compartilhadoCom: pessoasRef.current,
      // só quem alterou assina; abrir para ler não muda a autoria
      ...(mexeu.current && pessoaRef.current ? { alteradoPor: pessoaRef.current, criadoPor: inicial.criadoPor ?? pessoaRef.current } : {}) }),
    [editor, inicial],
  );

  // salvamento automático
  useEffect(() => {
    if (salvo || !editor || leitura) return;
    const t = setTimeout(() => {
      const m = marco.current;
      marco.current = undefined;
      armazenamento.salvar(roteiroAtual(), m).then(() => setSalvo(true), (e: Error) => avisar(comServidor ? e.message : 'Não consegui salvar neste navegador.'));
    }, 500);
    return () => clearTimeout(t);
  }, [salvo, docVersao, meta, publico, pessoas, editor, roteiroAtual, avisar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const antesDeSair = () => {
      if (editor && mexeu.current && !leitura) void armazenamento.salvar(roteiroAtual(), marco.current).catch(() => {});
    };
    window.addEventListener('pagehide', antesDeSair);
    return () => {
      window.removeEventListener('pagehide', antesDeSair);
      antesDeSair();
    };
  }, [editor, roteiroAtual]);

  const saida = useMemo(() => exportar(roteiroAtual()), [roteiroAtual, docVersao, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const artes = useMemo(() => (editor ? listarMarcas(editor.state.doc, 'arte') : []), [editor, docVersao]); // eslint-disable-line react-hooks/exhaustive-deps

  // posição relativa à área da folha (para menus e cartões)
  const relativo = useCallback((left: number, top: number) => {
    const r = area.current!.getBoundingClientRect();
    return { x: left - r.left, y: top - r.top };
  }, []);

  // cartões das artes alinhados ao texto, como comentários do Word
  useLayoutEffect(() => {
    if (!editor || !area.current) return;
    const base = area.current.getBoundingClientRect().top;
    let piso = checklist.current ? checklist.current.offsetTop + checklist.current.offsetHeight + 14 : 0;
    const novo: Record<string, number> = {};
    for (const a of artes) {
      let y = piso;
      try {
        y = Math.max(piso, editor.view.coordsAtPos(a.from).top - base - 8);
      } catch {
        /* a vista ainda não foi montada */
      }
      novo[a.id] = Math.round(y);
      piso = y + ALTURA_CARTAO + 8;
    }
    setTops((antigo) => (JSON.stringify(antigo) === JSON.stringify(novo) ? antigo : novo));
  }, [editor, artes, meta, medida]);
  useEffect(() => {
    const medir = () => setMedida((m) => m + 1);
    window.addEventListener('resize', medir);
    void document.fonts?.ready.then(medir);
    const t = setTimeout(medir, 300);
    return () => {
      window.removeEventListener('resize', medir);
      clearTimeout(t);
    };
  }, []);

  // seleção: barra flutuante e arte ativa
  const selecao = editor?.state.selection;
  const [barra, setBarra] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!editor || !selecao || selecao.empty || arrastando.current || menu || !editor.isFocused) return setBarra(null);
    try {
      const a = editor.view.coordsAtPos(selecao.from);
      const p = relativo(a.left, a.top);
      setBarra({ x: Math.max(0, p.x - 6), y: p.y - 46 });
    } catch {
      setBarra(null);
    }
  }, [editor, selVersao, docVersao, menu]); // eslint-disable-line react-hooks/exhaustive-deps
  const ativa = editor && selecao ? marcaEm(editor, selecao.from) : null;

  aoClicar.current = (pos) => {
    if (!editor) return;
    const m = leitura ? null : marcaEm(editor, pos);
    setPopover(m && editor.state.selection.empty ? { nome: m.nome, id: m.id } : null);
  };
  const marcaDoPopover = useMemo(
    () => (editor && popover ? (listarMarcas(editor.state.doc, popover.nome).find((m) => m.id === popover.id) ?? null) : null),
    [editor, popover, docVersao], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const posPopover = useMemo(() => {
    if (!editor || !marcaDoPopover) return null;
    try {
      const c = editor.view.coordsAtPos(marcaDoPopover.from);
      const p = relativo(c.left, c.bottom);
      return { x: Math.max(0, p.x - 8), y: p.y + 8 };
    } catch {
      return null;
    }
  }, [editor, marcaDoPopover, relativo, medida]);

  // fechar com Esc ou clicando fora
  useEffect(() => {
    if (!menu && !popover && !exportando && !compartilhando) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenu(null);
      setPopover(null);
      setExportando(false);
      setCompartilhando(false);
    };
    const fora = (e: PointerEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.closest('.menu, .popover, .exportar, .compartilhar')) return;
      setMenu(null);
      setExportando(false);
      setCompartilhando(false);
      if (!alvo.closest('.texto')) setPopover(null);
    };
    window.addEventListener('keydown', tecla);
    window.addEventListener('pointerdown', fora, true);
    return () => {
      window.removeEventListener('keydown', tecla);
      window.removeEventListener('pointerdown', fora, true);
    };
  }, [menu, popover, exportando, compartilhando]);

  const aoMenuDeContexto = (e: React.MouseEvent) => {
    if (!editor || leitura) return;
    const { from, to, empty } = editor.state.selection;
    const p = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
    if (!p) return;
    if (!empty && p.pos >= from && p.pos <= to) {
      e.preventDefault();
      setPopover(null);
      setMenu(relativo(e.clientX + 2, e.clientY + 2));
      return;
    }
    const m = marcaEm(editor, p.pos);
    if (m) {
      e.preventDefault();
      setPopover({ nome: m.nome, id: m.id });
    }
  };

  const mudarLayout = (layout: Layout) => {
    if (!editor || layout === meta.layout) return;
    editor.commands.setContent(converterLayout(editor.getJSON() as Roteiro['doc'], layout), true);
    mudarMeta({ layout });
  };
  const irParaArte = (a: MarcaNoDoc) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection({ from: a.from, to: a.to }).run();
    editor.view.dom.querySelector(`u.arte[data-id="${a.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const confirmarTodas = () => {
    if (!editor) return;
    const tr = editor.state.tr;
    for (const a of artes) if (a.attrs.sugerido) tr.removeMark(a.from, a.to, editor.schema.marks.arte).addMark(a.from, a.to, editor.schema.marks.arte.create({ ...a.attrs, sugerido: false }));
    editor.view.dispatch(tr);
  };

  const exportarComo = async (formato: 'docx' | 'json' | 'lista' | 'pdf') => {
    setExportando(false);
    revisao.current += formato === 'json' || formato === 'docx' ? 1 : 0;
    const s = exportar(roteiroAtual());
    const nome = nomeDoArquivo(meta);
    try {
      if (formato === 'json') baixar(JSON.stringify(s, null, 2), `${nome}.json`, 'application/json');
      else if (formato === 'docx') baixar(await (await import('./exportarDocx')).gerarDocx(s), `${nome}.docx`);
      else if (formato === 'lista') {
        await copiarTexto(listaDeArtes(s));
        avisar(`Lista com ${plural(s.artes.length, 'arte copiada', 'artes copiadas')}. É só colar.`);
      } else window.print();
      if (!leitura) {
        // exportar é um marco: fica registrado no histórico
        mexeu.current = true;
        marco.current = 'exportou';
        setSalvo(false);
      }
    } catch {
      avisar('Não consegui exportar. Tente de novo.');
    }
  };

  const compartilhar = (todos: boolean, lista: string[]) => {
    mexeu.current = true;
    setPublico(todos);
    setPessoas(lista);
    setSalvo(false);
  };
  const abrirHistorico = async () => {
    if (historico) return setHistorico(null);
    try {
      setHistorico(await armazenamento.versoes(inicial.id));
    } catch {
      avisar('Não consegui abrir o histórico.');
    }
  };
  const restaurar = async (v: Versao) => {
    if (!editor) return;
    try {
      const c = await armazenamento.lerVersao(inicial.id, v.n);
      editor.commands.setContent(c.doc, true);
      mexeu.current = true;
      marco.current = `restaurou a versão ${v.n}`;
      setMeta(c.meta);
      setSalvo(false);
      setHistorico(null);
      avisar(`Versão ${v.n} restaurada. Dá para desfazer com ${atalho('Mod-z')}.`);
    } catch {
      avisar('Não consegui restaurar essa versão.');
    }
  };
  const duplicarParaEditar = async () => {
    const agora = new Date().toISOString();
    const copia: Roteiro = { ...roteiroAtual(), id: novoId(), revisao: 1, criadoEm: agora, atualizadoEm: agora, criadoPor: pessoa, alteradoPor: pessoa, publico: false, compartilhadoCom: [], meu: true };
    try {
      await armazenamento.salvar(copia);
      location.hash = `#/r/${encodeURIComponent(copia.id)}`;
      location.reload();
    } catch {
      avisar('Não consegui duplicar.');
    }
  };

  const colunas = NOMES_COLUNAS[meta.layout];
  const est = saida.roteiro.duracaoEstimadaSeg;
  const alvo = meta.duracaoAlvoSeg;
  const passou = !!alvo && est - alvo > Math.max(1, Math.round(alvo * 0.1));
  const fimMargem = artes.length ? (tops[artes[artes.length - 1].id] ?? 0) + ALTURA_CARTAO + 24 : 0;

  return (
    <div className="pagina editor">
      <header className="topo">
        <div className="topo-esq">
          <button className="botao-icone" aria-label="Voltar para os roteiros" title="Roteiros" onClick={voltar}><Icone nome="voltar" tam={18} /></button>
          <span className="trilha">
            <span>{meta.programa || 'Roteiro'}</span>
            <span className="trilha-sep">/</span>
            <strong>{meta.titulo || 'Sem título'}</strong>
          </span>
          {leitura ? (
            <span className="salvo">somente leitura</span>
          ) : (
            <span className={`salvo ${salvo ? 'ok' : ''}`} aria-live="polite">
              <Icone nome="certo" tam={12} traco={2.6} />
              {salvo ? 'salvo' : 'salvando'}
            </span>
          )}
        </div>

        <div className="segmento" role="radiogroup" aria-label="Formato do roteiro" inert={leitura || undefined}>
          {([['coluna_unica', 'corrido', 'Texto corrido'], ['ilustracao_audio', 'colunas', 'Ilustração | Áudio'], ['instrucoes_texto', 'colunas', 'Instruções | Texto']] as const).map(([l, ic, nome]) => (
            <button key={l} role="radio" aria-checked={meta.layout === l} onClick={() => mudarLayout(l)}>
              <Icone nome={ic} tam={14} traco={2} />
              {nome}
            </button>
          ))}
        </div>

        <div className="topo-dir">
          <div className={`relogio ${passou ? 'passou' : ''}`} title="Estimativa: locução e falas das sonoras em ritmo normal de leitura">
            <span><strong>≈ {est}’’</strong>{alvo ? ` de ${meta.duracaoModo === 'max' ? 'máx. ' : ''}${alvo}’’` : ''}</span>
            <span className="relogio-trilho"><span style={{ width: `${alvo ? Math.min(100, (est / alvo) * 100) : 0}%` }} /></span>
          </div>
          {comServidor && !leitura && (
            <>
              <button className="botao-icone" title="Histórico de versões" aria-label="Histórico de versões" aria-expanded={!!historico} onClick={abrirHistorico}>
                <Icone nome="historico" tam={18} />
              </button>
              <div className="compartilhar">
                <button className={`visibilidade ${publico || pessoas.length ? 'publico' : ''}`} aria-haspopup="dialog" aria-expanded={compartilhando} onClick={() => setCompartilhando((v) => !v)}>
                  <Icone nome={publico ? 'olho' : pessoas.length ? 'pessoas' : 'cadeado'} tam={14} traco={2} />
                  {publico ? 'Todos leem' : pessoas.length ? plural(pessoas.length, 'pessoa', 'pessoas') : 'Só eu'}
                </button>
                {compartilhando && <Compartilhar publico={publico} pessoas={pessoas} mudar={compartilhar} />}
              </div>
            </>
          )}
          <div className="exportar">
            <button className="botao primario" aria-haspopup="menu" aria-expanded={exportando} onClick={() => setExportando((v) => !v)}>
              Exportar <Icone nome="baixo" tam={13} traco={2.4} />
            </button>
            {exportando && (
              <div className="menu menu-exportar" role="menu">
                <button role="menuitem" className="menu-item alto" onClick={() => exportarComo('docx')}>
                  <Selo nome="arquivo" /><span className="menu-texto"><strong>Roteiro em Word</strong><small>Padronizado, com a lista de artes no fim</small></span>
                </button>
                <button role="menuitem" className="menu-item alto" onClick={() => exportarComo('json')}>
                  <Selo nome="baixar" /><span className="menu-texto"><strong>Dados (.json)</strong><small>Metadados, artes e o roteiro para reabrir</small></span>
                </button>
                <div className="menu-sep" />
                <button role="menuitem" className="menu-item" onClick={() => exportarComo('lista')}><Selo nome="copiar" /><span className="menu-texto">Copiar lista de artes</span></button>
                <button role="menuitem" className="menu-item" onClick={() => exportarComo('pdf')}><Selo nome="imprimir" /><span className="menu-texto">Imprimir ou salvar em PDF</span></button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mesa">
        <div className={`area ${colunas ? 'larga' : ''}`} ref={area}>
          <article className="folha">
            {leitura && (
              <div className="faixa-leitura">
                <span>Roteiro de <strong>{inicial.criadoPor?.nome ?? 'um colega'}</strong>. Você pode ler e exportar.</span>
                <button className="botao" onClick={duplicarParaEditar}><Icone nome="duplicar" tam={14} /> Duplicar para editar</button>
              </div>
            )}
            <div inert={leitura || undefined}>
              <Cabecalho meta={meta} mudar={mudarMeta} />
            </div>
            {colunas && (
              <div className="colunas-topo rotulo">
                <span>{colunas[0]}</span>
                <span>{colunas[1]}</span>
              </div>
            )}
            <div
              className={colunas ? 'corpo em-colunas' : 'corpo'}
              onContextMenu={aoMenuDeContexto}
              onPointerDown={() => {
                arrastando.current = true;
                setBarra(null);
              }}
              onPointerUp={() => {
                arrastando.current = false;
                setSelVersao((v) => v + 1);
              }}
            >
              <EditorContent editor={editor} />
            </div>
            <footer className="folha-fim">
              <div className="fim-linha"><span>fim da chamada</span></div>
              <p className="dicas">
                <span><kbd>{atalho('Mod-u')}</kbd> marca como arte</span>
                <span><kbd>botão direito</kbd> etiqueta o trecho</span>
                {colunas ? <span><kbd>Tab</kbd> troca de coluna</span> : <span><kbd>CAIXA ALTA</kbd> é locução</span>}
                {colunas && <span><kbd>{atalho('Mod-Enter')}</kbd> nova linha</span>}
              </p>
            </footer>
          </article>

          <aside className="margem" aria-label="Artes do roteiro" style={{ minHeight: fimMargem || undefined }} inert={leitura || undefined}>
            <div ref={checklist}>
              <Checklist saida={saida} confirmarTodas={confirmarTodas} />
              <p className="margem-titulo">
                {artes.length ? (
                  <><strong>{plural(artes.length, 'arte', 'artes')}</strong> para o Motion, na ordem em que aparecem.</>
                ) : (
                  <>Sublinhe um trecho com <kbd>{atalho('Mod-u')}</kbd> e a arte aparece aqui, ao lado do texto.</>
                )}
              </p>
            </div>
            {artes.map((a, i) => (
              <div
                key={a.id}
                className={`cartao-arte ${ativa?.id === a.id ? 'ativa' : ''}`}
                style={{ top: tops[a.id] ?? 0 }}
                onMouseEnter={() => setRealce(a.id)}
                onMouseLeave={() => setRealce(null)}
              >
                <button className="cartao-ir" onClick={() => irParaArte(a)} aria-label={`Ir para a arte ${i + 1}: ${a.texto}`}>
                  <Miniatura subtipo={a.attrs.subtipo} texto={a.texto} />
                  <span className="cartao-n">{i + 1}</span>
                </button>
                <span className="cartao-corpo">
                  <span className="cartao-texto" title={a.texto}>{a.texto}</span>
                  <span className="cartao-tipo">
                    <span className="campo-select">
                      <select
                        value={a.attrs.subtipo}
                        aria-label={`Tipo da arte ${i + 1}`}
                        onChange={(e) => editor && atualizarMarca(editor, a, { subtipo: e.target.value as SubtipoArte, sugerido: false })}
                      >
                        {SUBTIPOS_ARTE.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                      </select>
                    </span>
                    {a.attrs.sugerido && (
                      <button className="cartao-ok" title="Tipo sugerido. Clique para confirmar." onClick={() => editor && atualizarMarca(editor, a, { sugerido: false })}>
                        sugerido · ok?
                      </button>
                    )}
                  </span>
                </span>
              </div>
            ))}
          </aside>

          {editor && !leitura && <LinhaDoTempo editor={editor} versao={docVersao} />}

          {historico && (
            <aside className="historico" aria-label="Histórico de versões">
              <div className="historico-topo">
                <span className="rotulo">Histórico</span>
                <button className="botao-icone pequeno" aria-label="Fechar histórico" onClick={() => setHistorico(null)}><Icone nome="fechar" tam={14} /></button>
              </div>
              {historico.length === 0 && <p className="suave pequeno">A primeira versão aparece assim que o roteiro for salvo.</p>}
              <ol>
                {historico.map((v, i) => (
                  <li key={v.n}>
                    <span className="historico-n">{v.n}</span>
                    <span className="historico-corpo">
                      <strong>{v.motivo[0].toUpperCase() + v.motivo.slice(1)}</strong>
                      <span className="suave pequeno">{haQuantoTempo(v.criadoEm)}{v.por ? ` · ${v.por.nome}` : ''}</span>
                    </span>
                    {i === 0 ? <span className="suave pequeno">mais recente</span> : <button className="botao-texto" onClick={() => restaurar(v)}>Restaurar</button>}
                  </li>
                ))}
              </ol>
              <p className="suave pequeno">Uma versão é guardada a cada 5 minutos de edição e sempre que você exporta.</p>
            </aside>
          )}

          {editor && barra && !leitura && !menu && !popover && <BarraFlutuante editor={editor} x={barra.x} y={barra.y} programa={meta.programa} abrirMenu={() => setMenu({ x: barra.x, y: barra.y + 44 })} />}
          {editor && menu && <MenuEtiquetas editor={editor} x={menu.x} y={menu.y} programa={meta.programa} fechar={() => setMenu(null)} />}
          {editor && marcaDoPopover && posPopover && <PopoverMarca editor={editor} marca={marcaDoPopover} x={posPopover.x} y={posPopover.y} fechar={() => setPopover(null)} />}
        </div>
      </div>

      {/* anexo que só aparece na impressão / PDF */}
      <section className="so-impressao">
        <h2>Lista de artes</h2>
        <table>
          <thead><tr><th>Nº</th><th>Tipo</th><th>Texto</th><th>Observação</th></tr></thead>
          <tbody>{saida.artes.map((a) => <tr key={a.id}><td>{a.ordem}</td><td>{nomeSubtipo(a.subtipo)}</td><td>{a.texto}</td><td>{a.observacao}</td></tr>)}</tbody>
        </table>
        {saida.comentarios.length > 0 && <p>Comentários: {saida.comentarios.map((c) => c.texto).join(' · ')}</p>}
      </section>

      {realce && <style>{`.texto u.arte[data-id="${realce}"]{background:var(--ultra-suave)}`}</style>}
    </div>
  );
}
