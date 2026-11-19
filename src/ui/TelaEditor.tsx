import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import History from '@tiptap/extension-history';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { redoDepth, undoDepth } from '@tiptap/pm/history';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { ySyncPluginKey, yUndoPluginKey } from 'y-prosemirror';
import { abrirSala, corDe, presentes as listarPresentes, type Presente } from '../dados/colaboracao';
import { armazenamento, type Versao } from '../dados/armazenamento';
import {
  Arte, atualizarMarca, Celula, Etiqueta, limparMarcas, Linha, listarMarcas, marcaEm, marcarArte,
  Reconhecimento, Teclado, type MarcaNoDoc,
} from '../editor/extensoes';
import { exportar, listaDeArtes, type Saida } from '../modelo/exportar';
import {
  ETIQUETAS, metaVazia, NOMES_COLUNAS, nomeSubtipo, normalizarSubtipo, novoId, SUBTIPOS_ARTE, type Meta, type Pessoa, type Roteiro,
} from '../modelo/tipos';
import { PRACAS, programasConhecidos } from '../modelo/vocabularios';
import { Claquete, EscolhaDeTipo, Marca, Miniatura } from './pecas';
import { Icone, Selo, type NomeIcone } from './icones';
import { atalho, baixar, copiarTexto, haQuantoTempo, nomeDoArquivo, plural } from './util';


/* ---------- topo da folha: atração e praça ---------- */

function TopoFolha({ meta, mudar }: { meta: Meta; mudar: (m: Partial<Meta>) => void }) {
  const outra = !!meta.praca && !PRACAS.includes(meta.praca);
  return (
    <header className="topo-folha">
      <label className="atracao">
        <span className="rotulo">Atração</span>
        <input
          value={meta.programa}
          placeholder="Qual atração?"
          aria-label="Atração"
          list="lista-programas"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value;
            const p = programasConhecidos().find((x) => x.nome.toLowerCase() === v.trim().toLowerCase()) ?? null;
            mudar({ programa: v, ...(p ? { tipoPrograma: p.tipo } : {}) });
          }}
        />
      </label>
      <div className="praca">
        <span className="rotulo">Praça</span>
        <div className="pracas" role="radiogroup" aria-label="Praça">
          {PRACAS.map((p) => (
            <button key={p} role="radio" aria-checked={meta.praca === p} onClick={() => mudar({ praca: meta.praca === p ? '' : p })}>{p}</button>
          ))}
          <input className={outra ? 'cheio' : ''} value={outra ? meta.praca : ''} placeholder="outra" aria-label="Outra praça" size={5} maxLength={12} onChange={(e) => mudar({ praca: e.target.value.toUpperCase() })} />
        </div>
      </div>
      <datalist id="lista-programas">{programasConhecidos().map((p) => <option key={p.nome} value={p.nome} />)}</datalist>
    </header>
  );
}

/** Origem, timecode e fala de cada sonora: o que a edição precisa, fora do caminho da Arte. */
function Decupagem({ saida, noTexto, alternar }: { saida: Saida; noTexto: boolean; alternar: () => void }) {
  if (!saida.sonoras.length) return null;
  return (
    <section className="decupagem" aria-label="Decupagem">
      <div className="decupagem-topo">
        <div>
          <div className="rotulo">Para a edição</div>
          <h2>Decupagem</h2>
        </div>
        <button className="botao-texto" onClick={alternar}>{noTexto ? 'Recolher no texto' : 'Mostrar no texto'}</button>
      </div>
      <div className="rola">
        <table>
          <thead><tr><th /><th>TC</th><th>Origem</th><th>Fala</th></tr></thead>
          <tbody>
            {saida.sonoras.map((s) => (
              <tr key={s.ordem}>
                <td className="n">{s.ordem}</td>
                <td className="tc">{s.timecodeEntrada && <span>{s.timecodeEntrada}</span>}</td>
                <td className="orig">{s.origemOriginal || s.origem}</td>
                <td className="fala">{s.fala}<small>{[s.personagem, s.descricaoImagem].filter(Boolean).join(' · ')}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
function MenuEtiquetas({ editor, x, y, fechar }: { editor: Editor; x: number; y: number; fechar: () => void }) {
  const [ativo, setAtivo] = useState(0);
  const fazer = (f: () => void) => () => {
    f();
    fechar();
  };
  const itens: ItemMenu[] = [
    { id: 'arte', texto: 'Arte', icone: 'arte', atalho: atalho('Mod-u'), acao: fazer(() => marcarArte(editor)) },
    { id: 'limpar', texto: 'Limpar marcações', icone: 'borracha', separar: true, acao: fazer(() => limparMarcas(editor)) },
  ];
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const usar = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === 'Escape') return usar(), fechar();
      if (e.key === 'ArrowDown') return usar(), setAtivo((i) => (i + 1) % itens.length);
      if (e.key === 'ArrowUp') return usar(), setAtivo((i) => (i <= 0 ? itens.length - 1 : i - 1));
      if (e.key === 'Enter') return usar(), itens[ativo].acao();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  });
  return (
    <div className="menu" role="menu" aria-label="Marcar trecho" style={{ left: x, top: y }} onMouseDown={(e) => e.preventDefault()}>
      {itens.map((it, i) => (
        <div key={it.id} className="menu-grupo">
          {it.separar && <div className="menu-sep" />}
          <button role="menuitem" className={`menu-item ${ativo === i ? 'ativo' : ''}`} onMouseEnter={() => setAtivo(i)} onClick={it.acao}>
            <Selo nome={it.icone!} />
            <span className="menu-texto">{it.texto}</span>
            <span className="menu-atalho">{it.atalho}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

/** Barra que aparece sobre a seleção. */
function BarraFlutuante({ editor, x, y }: { editor: Editor; x: number; y: number }) {
  return (
    <div className="barra-flutuante" role="toolbar" aria-label="Marcar trecho selecionado" style={{ left: x, top: y }} onMouseDown={(e) => e.preventDefault()}>
      <button className="bf-arte" title={`Arte (${atalho('Mod-u')})`} onClick={() => marcarArte(editor)}>
        <Icone nome="arte" tam={15} /> Arte
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
            <select value={normalizarSubtipo(marca.attrs.subtipo)} aria-label="Tipo de arte" onChange={(e) => atualizarMarca(editor, marca, { subtipo: e.target.value, sugerido: false })}>
              <option value="">Sem tipo</option>
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
        placeholder={arte ? 'Observação para a Arte (opcional)' : 'Observação (opcional)'}
        aria-label="Observação"
        value={marca.attrs.obs ?? ''}
        onChange={(e) => atualizarMarca(editor, marca, { obs: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && fechar()}
      />
      <div className="popover-acoes">
        <span className="espaco" />
        <button className="botao-texto perigo" onClick={() => (atualizarMarca(editor, marca, null), fechar())}>Remover</button>
      </div>
    </div>
  );
}

/* ---------- compartilhar ---------- */

type Convite = { email: string; editar: boolean };

function Compartilhar({ publico, pessoas, mudar }: { publico: boolean; pessoas: Convite[]; mudar: (todos: boolean, lista: Convite[]) => void }) {
  const [usuarios, setUsuarios] = useState<Pessoa[] | null>(null);
  const [busca, setBusca] = useState('');
  useEffect(() => {
    armazenamento.usuarios().then(setUsuarios, () => setUsuarios([]));
  }, []);

  const papel = (email: string) => pessoas.find((p) => p.email === email);
  const definir = (email: string, valor: 'nao' | 'ver' | 'editar') =>
    mudar(publico, [...pessoas.filter((p) => p.email !== email), ...(valor === 'nao' ? [] : [{ email, editar: valor === 'editar' }])]);
  const termo = busca.trim().toLowerCase();
  // quem já foi escolhido aparece mesmo que não esteja mais na lista
  const lista = [...(usuarios ?? []), ...pessoas.filter((p) => !(usuarios ?? []).some((u) => u.email === p.email)).map((p) => ({ nome: p.email.split('@')[0], email: p.email }))]
    .filter((u) => !termo || `${u.nome} ${u.email}`.toLowerCase().includes(termo));
  const privado = !publico && !pessoas.length;

  return (
    <div className="painel-compartilhar" role="dialog" aria-label="Quem tem acesso a este roteiro">
      <div className="rotulo">Quem tem acesso</div>
      <div className="modos">
        <button className="modo" role="switch" aria-checked={privado} onClick={() => mudar(false, [])}>
          <Selo nome="cadeado" />
          <span className="menu-texto"><strong>Só eu</strong><small>100% privado: ninguém mais vê</small></span>
          <span className="modo-marca">{privado && <Icone nome="certo" tam={12} traco={3} />}</span>
        </button>
        <button className="modo" role="switch" aria-checked={publico} onClick={() => mudar(!publico, pessoas)}>
          <Selo nome="olho" />
          <span className="menu-texto"><strong>Todos podem ver</strong><small>Qualquer colega lê; só edita quem você escolher</small></span>
          <span className="modo-marca">{publico && <Icone nome="certo" tam={12} traco={3} />}</span>
        </button>
      </div>
      <div className="quem">
        <div className="rotulo">Pessoas</div>
        {(usuarios?.length ?? 0) > 6 && <input className="popover-obs" placeholder="Buscar pessoa" aria-label="Buscar pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} />}
        <ul>
          {lista.map((u) => {
            const p = papel(u.email);
            const valor = p ? (p.editar ? 'editar' : 'ver') : 'nao';
            return (
              <li key={u.email} className={p ? 'com-acesso' : ''}>
                <span className="quem-pessoa">
                  <span className="quem-nome">{u.nome}</span>
                  <span className="suave pequeno">{u.email}</span>
                </span>
                <select className="quem-papel" data-valor={valor} value={valor} aria-label={`Acesso de ${u.nome}`} onChange={(e) => definir(u.email, e.target.value as 'nao' | 'ver' | 'editar')}>
                  <option value="nao">{publico ? 'Só vê' : 'Sem acesso'}</option>
                  {!publico && <option value="ver">Pode ver</option>}
                  <option value="editar">Pode editar</option>
                </select>
              </li>
            );
          })}
        </ul>
        {usuarios && !lista.length && <p className="suave pequeno">{termo ? 'Ninguém com esse nome.' : 'Ainda não há outras pessoas por aqui. Elas aparecem depois do primeiro acesso.'}</p>}
      </div>
      <p className="suave pequeno">Quem edita escreve junto com você, ao mesmo tempo. Só você muda o acesso e apaga o roteiro.</p>
    </div>
  );
}

/* ---------- linha do tempo ---------- */

/** Arrastar para trás desfaz as edições desta sessão; para frente, refaz até o ponto atual. */
function LinhaDoTempo({ editor, versao }: { editor: Editor; versao: number }) {
  void versao; // recalcula a cada mudança no texto
  // com edição simultânea, a pilha é a do documento compartilhado e só guarda as edições desta pessoa
  const profundidade = (): [number, number] => {
    const gerente = (yUndoPluginKey.getState(editor.state) as { undoManager?: { undoStack: unknown[]; redoStack: unknown[] } } | undefined)?.undoManager;
    return gerente ? [gerente.undoStack.length, gerente.redoStack.length] : [undoDepth(editor.state), redoDepth(editor.state)];
  };
  const [feitas, refaziveis] = profundidade();
  const total = feitas + refaziveis;
  if (!total) return null;
  const ir = (alvo: number) => {
    let atual = profundidade()[0];
    for (let i = 0; i < 500 && atual !== alvo; i++) {
      if (!(alvo < atual ? editor.commands.undo() : editor.commands.redo())) break;
      const novo = profundidade()[0];
      if (novo === atual) break;
      atual = novo;
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
  // roteiros de antes da claquete não têm os campos novos
  const [meta, setMeta] = useState<Meta>(() => ({ ...metaVazia(), ...inicial.meta }));
  const [docVersao, setDocVersao] = useState(0);
  const [selVersao, setSelVersao] = useState(0);
  const [salvo, setSalvo] = useState(true);
  const sou = inicial.meu !== false; // dono (ou modo sem servidor)
  const leitura = !sou && !inicial.podeEditar; // recebido só para ver
  const comServidor = armazenamento.tipo === 'servidor';
  // edição simultânea: só existe com servidor
  const [sala] = useState(() => (comServidor ? abrirSala(inicial.id) : null));
  const [sincronizado, setSincronizado] = useState(!sala);
  const [presentes, setPresentes] = useState<Presente[]>([]);
  const [publico, setPublico] = useState(!!inicial.publico);
  const [pessoas, setPessoas] = useState<Convite[]>(inicial.compartilhadoCom ?? []);
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
  const [aberta, setAberta] = useState<string | null>(null);
  const [sonorasNoTexto, setSonorasNoTexto] = useState(false);
  const [medida, setMedida] = useState(0);

  const area = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);
  const revisao = useRef(inicial.revisao);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const aoClicar = useRef<(pos: number) => void>(() => {});

  const editor = useEditor({
    extensions: [
      Document, Paragraph, Text, Bold, Italic, HardBreak,
      Arte, Etiqueta, Linha, Celula, Reconhecimento, Teclado.configure({ programa: () => metaRef.current.programa }),
      ...(sala
        ? [
            Collaboration.configure({ document: sala.doc, field: 'doc' }),
            CollaborationCursor.configure({
              provider: sala.provedor,
              user: { name: pessoa?.nome ?? 'Alguém', email: pessoa?.email ?? '', color: corDe(pessoa?.email ?? '') },
            }),
          ]
        : [History.configure({ depth: 500 })]),
    ],
    // com edição simultânea, o texto vem do documento compartilhado
    content: sala ? undefined : inicial.doc,
    // e só libera a digitação depois de sincronizar, para nunca salvar por cima com uma folha vazia
    editable: !leitura && !sala,
    editorProps: {
      attributes: { class: 'texto', spellcheck: 'true', lang: 'pt-BR', 'aria-label': 'Texto do roteiro' },
      handleClick: (_view, pos) => {
        aoClicar.current(pos);
        return false;
      },
    },
    onUpdate: ({ transaction }) => {
      setDocVersao((v) => v + 1);
      // o que chega dos colegas atualiza a tela, mas quem salva é quem digitou
      if (transaction.getMeta(ySyncPluginKey)?.isChangeOrigin) return;
      mexeu.current = true;
      setSalvo(false);
    },
    onSelectionUpdate: () => setSelVersao((v) => v + 1),
  });

  // conexão com a sala
  useEffect(() => {
    if (!sala) return;
    const aoSincronizar = (ok: boolean) => ok && setSincronizado(true);
    const aoMudarPresenca = () => setPresentes(listarPresentes(sala, pessoaRef.current?.email ?? ''));
    const aoMudarMeta = (e: { transaction: { local: boolean } }) => {
      if (!e.transaction.local) setMeta((m) => ({ ...m, ...(sala.meta.toJSON() as Partial<Meta>) }));
    };
    sala.provedor.on('sync', aoSincronizar);
    sala.provedor.awareness.on('change', aoMudarPresenca);
    sala.meta.observe(aoMudarMeta);
    sala.provedor.connect();
    const p = pessoaRef.current;
    sala.provedor.awareness.setLocalStateField('user', { name: p?.nome ?? 'Alguém', email: p?.email ?? '', color: corDe(p?.email ?? '') });
    return () => {
      sala.provedor.off('sync', aoSincronizar);
      sala.provedor.awareness.off('change', aoMudarPresenca);
      sala.meta.unobserve(aoMudarMeta);
      sala.provedor.disconnect();
    };
  }, [sala]);
  // depois de sincronizar: preenche o documento na primeira vez e libera a digitação
  useEffect(() => {
    if (!sala || !editor || !sincronizado) return;
    const vazio = () => sala.doc.getXmlFragment('doc').length === 0;
    const preencher = (r: Roteiro) => {
      editor.commands.setContent(r.doc, false);
      sala.doc.transact(() => Object.entries(r.meta).forEach(([k, v]) => sala.meta.set(k, v)));
      // preencher não é uma edição: a linha do tempo começa depois disso
      (yUndoPluginKey.getState(editor.state) as { undoManager?: { clear: () => void } } | undefined)?.undoManager?.clear();
    };
    const liberar = () => {
      if (sala.meta.size) setMeta((m) => ({ ...m, ...(sala.meta.toJSON() as Partial<Meta>) }));
      editor.setEditable(!leitura);
      setDocVersao((v) => v + 1);
    };
    if (!vazio()) return liberar();
    if (inicial.semear) {
      preencher(inicial);
      return liberar();
    }
    // Vazio, mas a vez de preencher é de outra sessão. Espera o texto chegar; se quem ia preencher
    // desistiu, o servidor passa a vez. Enquanto isso a folha fica travada, para nada ser salvo por cima.
    let ativo = true;
    const tentar = async () => {
      if (!ativo) return;
      if (!vazio()) return liberar();
      const r = await armazenamento.ler(inicial.id).catch(() => undefined);
      if (!ativo) return;
      if (!vazio()) return liberar();
      if (r?.semear) {
        preencher(r);
        return liberar();
      }
      setTimeout(tentar, 2000);
    };
    const prazo = setTimeout(tentar, leitura ? 2000 : 600);
    return () => {
      ativo = false;
      clearTimeout(prazo);
    };
  }, [sala, editor, sincronizado]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudarMeta = useCallback((parte: Partial<Meta>) => {
    mexeu.current = true;
    if (sala) sala.doc.transact(() => Object.entries(parte).forEach(([k, v]) => sala.meta.set(k, v)));
    try {
      if (parte.redator !== undefined) localStorage.setItem('roteirista.redator', parte.redator);
    } catch {
      /* sem armazenamento local, segue sem lembrar o nome */
    }
    setMeta((m) => ({ ...m, ...parte }));
    setSalvo(false);
  }, [sala]);

  const roteiroAtual = useCallback(
    (): Roteiro => ({ ...inicial, meta: metaRef.current, doc: editor ? (editor.getJSON() as Roteiro['doc']) : inicial.doc, revisao: revisao.current, atualizadoEm: new Date().toISOString(), publico: publicoRef.current, ...(sou ? { compartilhadoCom: pessoasRef.current } : {}),
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
  const marcasArte = useMemo(() => (editor ? listarMarcas(editor.state.doc, 'arte') : []), [editor, docVersao]); // eslint-disable-line react-hooks/exhaustive-deps
  // a lista segue a exportação: um "depois de…" sublinhado entra no texto de cada dia e não conta sozinho
  const artes = useMemo(
    () => saida.artes.flatMap((a) => {
      const marca = marcasArte.find((m) => m.id === a.id);
      return marca ? [{ ...marca, texto: a.texto, ordem: a.ordem }] : [];
    }),
    [saida, marcasArte],
  );

  // posição relativa à área da folha (para menus e cartões)
  const relativo = useCallback((left: number, top: number) => {
    const r = area.current!.getBoundingClientRect();
    return { x: left - r.left, y: top - r.top };
  }, []);

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

  const irParaArte = (a: MarcaNoDoc) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection({ from: a.from, to: a.to }).run();
    editor.view.dom.querySelector(`u.arte[data-id="${a.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
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

  const compartilhar = (todos: boolean, lista: Convite[]) => {
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
      mudarMeta(c.meta);
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
  const semTipo = artes.filter((a) => !normalizarSubtipo(a.attrs.subtipo)).length;

  return (
    <div className="pagina editor">
      <header className="topo">
        <div className="topo-esq">
          <button className="botao-icone" aria-label="Voltar para os roteiros" title="Roteiros" onClick={voltar}><Icone nome="voltar" tam={18} /></button>
          <Marca />
          <span className="trilha"><strong>{meta.claquete || meta.programa || 'Roteiro'}</strong></span>
          {leitura ? (
            <span className="salvo">somente leitura</span>
          ) : (
            <span className={`salvo ${salvo ? 'ok' : ''}`} aria-live="polite">
              <Icone nome="certo" tam={12} traco={2.6} />
              {salvo ? 'salvo' : 'salvando'}
            </span>
          )}
        </div>

        <span />

        <div className="topo-dir">
          {presentes.length > 0 && (
            <div className="presentes" aria-label={`Também neste roteiro: ${presentes.map((x) => x.nome).join(', ')}`}>
              {presentes.slice(0, 4).map((x) => (
                <span key={x.email} className="presente" style={{ background: x.cor }} title={`${x.nome} está neste roteiro`}>
                  {x.nome.split(/\s+/).map((n) => n[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase()}
                </span>
              ))}
              {presentes.length > 4 && <span className="presente mais">+{presentes.length - 4}</span>}
            </div>
          )}
          {comServidor && sou && (
            <>
              <button className="botao-icone" title="Histórico de versões" aria-label="Histórico de versões" aria-expanded={!!historico} onClick={abrirHistorico}>
                <Icone nome="historico" tam={18} />
              </button>
              <div className="compartilhar">
                <button className={`visibilidade ${publico || pessoas.length ? 'publico' : ''}`} aria-haspopup="dialog" aria-expanded={compartilhando} onClick={() => setCompartilhando((v) => !v)}>
                  <Icone nome={publico ? 'olho' : pessoas.length ? 'pessoas' : 'cadeado'} tam={14} traco={2} />
                  {publico ? 'Todos veem' : pessoas.length ? plural(pessoas.length, 'pessoa', 'pessoas') : 'Só eu'}
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
            {!sou && !leitura && (
              <div className="faixa-leitura">
                <span>Roteiro de <strong>{inicial.criadoPor?.nome ?? 'um colega'}</strong>. Você pode editar junto.</span>
              </div>
            )}
            {leitura && (
              <div className="faixa-leitura">
                <span>Roteiro de <strong>{inicial.criadoPor?.nome ?? 'um colega'}</strong>. Você pode ler e exportar.</span>
                <button className="botao" onClick={duplicarParaEditar}><Icone nome="duplicar" tam={14} /> Duplicar para editar</button>
              </div>
            )}
            <div inert={leitura || undefined}>
              <TopoFolha meta={meta} mudar={mudarMeta} />
            </div>
            {colunas && (
              <div className="colunas-topo rotulo">
                <span>{colunas[0]}</span>
                <span>{colunas[1]}</span>
              </div>
            )}
            <div
              className={`${colunas ? 'corpo em-colunas' : 'corpo'} ${sincronizado ? '' : 'chegando'} ${sonorasNoTexto ? '' : 'sonoras-recolhidas'}`}
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
                <span><kbd>CAIXA ALTA</kbd> é locução</span>
              </p>
            </footer>
            <Decupagem saida={saida} noTexto={sonorasNoTexto} alternar={() => setSonorasNoTexto((v) => !v)} />
          </article>

          <aside className="lado" aria-label="Claquete e artes" inert={leitura || undefined}>
            <Claquete dados={meta} mudar={mudarMeta} />
            <section className="cartao">
              <div className="cab-artes">
                <b><i>{artes.length}</i> {artes.length === 1 ? 'arte' : 'artes'}</b>
                {semTipo > 0 && <span className="rotulo">falta o tipo de {semTipo}</span>}
              </div>
              {artes.length === 0 && <p className="suave pequeno">Selecione um trecho e use <kbd>{atalho('Mod-u')}</kbd>: a arte aparece aqui.</p>}
              <ol className="artes">
                {artes.map((a) => {
                  const subtipo = normalizarSubtipo(a.attrs.subtipo);
                  const esta = aberta === a.id;
                  return (
                    <li key={a.id} className={`${esta ? 'aberta' : ''} ${ativa?.id === a.id ? 'ativa' : ''}`} onMouseEnter={() => setRealce(a.id)} onMouseLeave={() => setRealce(null)}>
                      <button
                        className="arte-linha"
                        aria-expanded={esta}
                        onClick={() => {
                          setAberta(esta ? null : a.id);
                          if (!esta) irParaArte(a);
                        }}
                      >
                        <Miniatura subtipo={subtipo} />
                        <span className="txt"><b>{a.texto}</b><span className={subtipo ? '' : 'pede'}>{subtipo ? nomeSubtipo(subtipo) : esta ? 'escolha o tipo' : 'sem tipo'}</span></span>
                        <span className="b">{a.ordem}</span>
                      </button>
                      {esta && editor && (
                        <EscolhaDeTipo
                          valor={subtipo}
                          escolher={(novo) => {
                            atualizarMarca(editor, a, { subtipo: novo, sugerido: false });
                            if (novo) setAberta(null);
                          }}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          </aside>

          {/* só em roteiro individual: com mais gente, desfazer pelo controle ficaria confuso */}
          {editor && sou && !publico && pessoas.length === 0 && <LinhaDoTempo editor={editor} versao={docVersao} />}

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

          {editor && barra && !leitura && !menu && !popover && <BarraFlutuante editor={editor} x={barra.x} y={barra.y} />}
          {editor && menu && <MenuEtiquetas editor={editor} x={menu.x} y={menu.y} fechar={() => setMenu(null)} />}
          {editor && marcaDoPopover && posPopover && <PopoverMarca editor={editor} marca={marcaDoPopover} x={posPopover.x} y={posPopover.y} fechar={() => setPopover(null)} />}
        </div>
      </div>

      {/* anexo que só aparece na impressão / PDF */}
      <section className="so-impressao">
        <h2>Lista de artes</h2>
        <table>
          <thead><tr><th>Nº</th><th>Tipo</th><th>Texto</th><th>Observação</th></tr></thead>
          <tbody>{saida.artes.map((a) => <tr key={a.id}><td>{a.ordem}</td><td>{a.subtipo ? nomeSubtipo(a.subtipo) : ''}</td><td>{a.texto}</td><td>{a.observacao}</td></tr>)}</tbody>
        </table>
        {saida.comentarios.length > 0 && <p>Comentários: {saida.comentarios.map((c) => c.texto).join(' · ')}</p>}
      </section>

      {realce && <style>{`.texto u.arte[data-id="${realce}"]{background:color-mix(in srgb,var(--ultra) 22%,var(--ultra-suave))}`}</style>}
    </div>
  );
}
