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
import { abrirSala, corDe, ponteirosDaSala, presentes as listarPresentes, type Presente, type Sala } from '../dados/colaboracao';
import { Ponteiros, useMeuPonteiro, type PonteiroDeAlguem, type PosicaoPonteiro } from './ponteiros';
import { meuCursor } from './cursores';
import { armazenamento, baixarOriginal, consultarAcervo, consultarPauta, mandarParaTrello, temTrello, type EnvioTrello, type Resumo, type Versao } from '../dados/armazenamento';
import {
  Arte, atualizarMarca, Celula, Etiqueta, limparMarcas, Linha, listarMarcas, marcaEm, marcarArte,
  prepararColagem, Reconhecimento, Teclado, type MarcaNoDoc,
} from '../editor/extensoes';
import { exportar, listaDeArtes, pendencias, pendenciasDetalhadas, type Saida } from '../modelo/exportar';
import { agruparPorDia, pedeRevisao, pendentes } from './fila';
import { chaveDeArte } from '../modelo/diferencas';
import {
  ETIQUETAS, metaVazia, NOMES_COLUNAS, nomeSubtipo, normalizarSubtipo, novoId, SUBTIPOS_ARTE, type ArteDoAcervo, type Meta, type Pessoa, type Roteiro, type SubtipoArte,
} from '../modelo/tipos';
import { Claquete, EscolhaDeTipo, Marca, Miniatura } from './pecas';
import { Icone, Selo, type NomeIcone } from './icones';
import { atalho, baixar, copiarTexto, dataCurtaComDia, haQuantoTempo, nomeDoArquivo, plural } from './util';


/* ---------- topo da folha: atração e praça ---------- */

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

/* ---------- ponteiros na sala ---------- */

function PonteirosDaSala({ sala, eu, editor }: { sala: Sala; eu: string; editor: Editor | null }) {
  const [lista, setLista] = useState<PonteiroDeAlguem[]>([]);
  useEffect(() => {
    const ler = () => setLista(ponteirosDaSala(sala, eu));
    // quem já estava na sala, parado, aparece logo ao entrar (sem esperar que mexa)
    ler();
    sala.provedor.awareness.on('change', ler);
    return () => sala.provedor.awareness.off('change', ler);
  }, [sala, eu]);
  // em cima do texto, o ponteiro vai junto da letra
  const resolver = useCallback(
    (p: PosicaoPonteiro) => {
      if (p.pos == null || !editor || editor.isDestroyed) return null;
      try {
        const c = editor.view.coordsAtPos(Math.max(0, Math.min(p.pos, editor.state.doc.content.size)));
        return { x: c.left + (p.dx ?? 0), y: c.top + (p.dy ?? 0) };
      } catch {
        return null;
      }
    },
    [editor],
  );
  const enviar = useMemo(() => (p: PosicaoPonteiro | null) => sala.provedor.awareness.setLocalStateField('ponteiro', p && { ...p, cursor: meuCursor(eu) }), [sala, eu]);
  const refinar = useCallback(
    (e: PointerEvent, p: PosicaoPonteiro): PosicaoPonteiro => {
      if (!editor || editor.isDestroyed || !(e.target as Element | null)?.closest?.('.texto')) return p;
      const achado = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (!achado) return p;
      try {
        const c = editor.view.coordsAtPos(achado.pos);
        return { ...p, pos: achado.pos, dx: Math.round(e.clientX - c.left), dy: Math.round(e.clientY - c.top) };
      } catch {
        return p;
      }
    },
    [editor],
  );
  useMeuPonteiro(enviar, refinar);
  return <Ponteiros lista={lista} resolver={resolver} />;
}

/* ---------- tela ---------- */

export function TelaEditor({ id, voltar, abrir, comparar, avisar, pessoa, cadastrarAtracao }: { id: string; voltar: () => void; abrir: (id: string) => void; comparar: (id: string) => void; avisar: (t: string) => void; pessoa?: Pessoa; cadastrarAtracao?: (claquete: string) => void }) {
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
  return <Folha inicial={roteiro} voltar={voltar} abrir={abrir} comparar={comparar} avisar={avisar} pessoa={pessoa} cadastrarAtracao={cadastrarAtracao} />;
}

function Folha({ inicial, voltar, abrir, comparar, avisar, pessoa, cadastrarAtracao }: { inicial: Roteiro; voltar: () => void; abrir: (id: string) => void; comparar: (id: string) => void; avisar: (t: string) => void; pessoa?: Pessoa; cadastrarAtracao?: (claquete: string) => void }) {
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
  // com edição simultânea, o texto só está aqui depois de sincronizar e preencher: antes disso, nada é salvo
  const [liberado, setLiberado] = useState(!sala);
  const alteracoes = useRef(0);
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
      transformPastedHTML: prepararColagem,
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
      alteracoes.current++;
      setSalvo(false);
    },
    onSelectionUpdate: () => setSelVersao((v) => v + 1),
  });

  // conexão com a sala
  useEffect(() => {
    if (!sala) return;
    const aoSincronizar = (ok: boolean) => ok && setSincronizado(true);
    // a presença muda a cada movimento de mouse dos colegas: só redesenha a tela quando muda quem está aqui
    const aoMudarPresenca = () => {
      const novo = listarPresentes(sala, pessoaRef.current?.email ?? '');
      setPresentes((antes) => (JSON.stringify(antes) === JSON.stringify(novo) ? antes : novo));
    };
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
      setLiberado(true);
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

  // sem editor: a pauta pode ter sido preenchida depois que o roteiro subiu; pergunta de novo ao abrir
  const perguntouPauta = useRef(false);
  useEffect(() => {
    if (!liberado || leitura || perguntouPauta.current || meta.editor || !meta.claquete) return;
    perguntouPauta.current = true;
    void consultarPauta(meta.claquete)
      .then((p) => {
        if (p.editor) mudarMetaRef.current?.({ editor: p.editor });
      })
      .catch(() => {});
  }, [liberado, leitura, meta.editor, meta.claquete]);
  const mudarMetaRef = useRef<((parte: Partial<Meta>, silencioso?: boolean) => void) | null>(null);

  /** `silencioso`: o app atualizando sozinho (ex.: o acervo); não conta como alguém ter mexido no roteiro. */
  const mudarMeta = useCallback((parte: Partial<Meta>, silencioso = false) => {
    if (!silencioso) mexeu.current = true;
    if (sala) sala.doc.transact(() => Object.entries(parte).forEach(([k, v]) => (v === undefined ? sala.meta.delete(k) : sala.meta.set(k, v))));
    try {
      if (parte.redator !== undefined) localStorage.setItem('roteirista.redator', parte.redator);
    } catch {
      /* sem armazenamento local, segue sem lembrar o nome */
    }
    setMeta((m) => ({ ...m, ...parte }));
    alteracoes.current++;
    setSalvo(false);
  }, [sala]);
  mudarMetaRef.current = mudarMeta;

  const roteiroAtual = useCallback(
    (): Roteiro => ({ ...inicial, meta: metaRef.current, doc: editor ? (editor.getJSON() as Roteiro['doc']) : inicial.doc, revisao: revisao.current, atualizadoEm: new Date().toISOString(), publico: publicoRef.current, ...(sou ? { compartilhadoCom: pessoasRef.current } : {}),
      // só quem alterou assina; abrir para ler não muda a autoria
      ...(mexeu.current && pessoaRef.current ? { alteradoPor: pessoaRef.current, criadoPor: inicial.criadoPor ?? pessoaRef.current } : {}) }),
    [editor, inicial],
  );

  // salvamento automático
  useEffect(() => {
    if (salvo || !editor || leitura || !liberado) return;
    const t = setTimeout(() => {
      const m = marco.current;
      marco.current = undefined;
      const marca = alteracoes.current;
      armazenamento.salvar(roteiroAtual(), m).then(
        // se algo mudou enquanto a gravação ia e voltava, ainda não está salvo: a próxima rodada grava
        () => alteracoes.current === marca && setSalvo(true),
        (e: Error) => avisar(comServidor ? e.message : 'Não consegui salvar neste navegador.'),
      );
    }, 500);
    return () => clearTimeout(t);
  }, [salvo, liberado, docVersao, meta, publico, pessoas, editor, roteiroAtual, avisar]); // eslint-disable-line react-hooks/exhaustive-deps
  const liberadoRef = useRef(liberado);
  liberadoRef.current = liberado;
  useEffect(() => {
    const antesDeSair = () => {
      if (editor && mexeu.current && !leitura && liberadoRef.current) void armazenamento.salvar(roteiroAtual(), marco.current).catch(() => {});
    };
    window.addEventListener('pagehide', antesDeSair);
    return () => {
      window.removeEventListener('pagehide', antesDeSair);
      antesDeSair();
    };
  }, [editor, roteiroAtual]);

  const saida = useMemo(() => exportar(roteiroAtual()), [roteiroAtual, docVersao, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  // o que pede revisão acompanha o roteiro: é o que a fila mostra
  useEffect(() => {
    if (leitura || !editor || !sincronizado) return;
    const agora = pendencias(saida);
    if (JSON.stringify(agora) === JSON.stringify(metaRef.current.revisar ?? [])) return;
    // recalcular não é uma edição: não muda quem assina o roteiro
    const jaMexeu = mexeu.current;
    mudarMeta({ revisar: agora });
    mexeu.current = jaMexeu;
  }, [saida]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // arte apontada na lista: selecionada no texto com a animação do cursor. Vai por uma regra de estilo
  // (não por classe no elemento), porque o editor redesenha o texto a cada mudança e a classe se perderia.
  // se a arte apontada está fora da tela, depois de um instante com o mouse parado ela rola para o meio
  // (a lista é fixa na lateral, então continua no lugar)
  useEffect(() => {
    if (!realce || !editor) return;
    const t = setTimeout(() => {
      const el = editor.view.dom.querySelector<HTMLElement>(`u.arte[data-id="${CSS.escape(realce)}"]`);
      const r = el?.getBoundingClientRect();
      if (el && r && (r.bottom < 80 || r.top > window.innerHeight - 50)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 350);
    return () => clearTimeout(t);
  }, [realce, editor]);

  /** Tipos de arte escondidos por enquanto: a lista é só das artes, com índice, e dá para tirar uma arte por ela. */
  const TIPOS_NA_LISTA = false;
  const tirarArte = (a: (typeof artes)[number]) => {
    if (!editor) return;
    atualizarMarca(editor, a, null);
    setRealce(null);
    // o foco volta ao texto, para o desfazer do teclado pegar a remoção
    editor.commands.focus(null, { scrollIntoView: false });
    avisar(`"${a.texto}" deixou de ser arte. ${atalho('Mod-z')} desfaz.`);
  };

  // com uma arte aberta na lista: 1–9 escolhe o tipo, setas trocam de arte, Esc fecha
  const tecladoArtes = useRef<(e: KeyboardEvent) => void>(() => {});
  tecladoArtes.current = (e: KeyboardEvent) => {
    if (!TIPOS_NA_LISTA || !aberta || leitura || e.metaKey || e.ctrlKey || e.altKey) return;
    const alvo = e.target as HTMLElement | null;
    if (alvo?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const k = artes.findIndex((a) => a.id === aberta);
    if (k < 0) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= SUBTIPOS_ARTE.length) {
      e.preventDefault();
      escolherTipo(artes[k], SUBTIPOS_ARTE[n - 1].id);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      abrirArte(artes[(k + (e.key === 'ArrowDown' ? 1 : artes.length - 1)) % artes.length]);
    } else if (e.key === 'Escape') setAberta(null);
  };
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => tecladoArtes.current(e);
    window.addEventListener('keydown', ouvir);
    return () => window.removeEventListener('keydown', ouvir);
  }, []);

  // o próximo roteiro para revisar, na ordem da fila
  const [fila, setFila] = useState<Resumo[]>([]);
  useEffect(() => {
    armazenamento.listar().then(setFila, () => setFila([]));
  }, [meta.revisar?.length]);
  const proximo = useMemo(() => {
    const { proximos } = agruparPorDia(pendentes(fila).filter((r) => r.id !== inicial.id && pedeRevisao(r)));
    return { r: proximos.flatMap((g) => g.itens)[0], total: proximos.reduce((n, g) => n + g.itens.length, 0) };
  }, [fila, inicial.id]);
  // o acervo da atração: artes que ela já tem prontas (conferidas aqui, fora do checklist do Trello)
  const [acervo, setAcervo] = useState<{ ligado: boolean; artes: ArteDoAcervo[] }>({ ligado: false, artes: [] });
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => void consultarAcervo(meta.programa).then((a) => vivo && setAcervo(a)), 400);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [meta.programa]);
  // o roteiro guarda quais das artes dele já existem (a fila e o envio usam); atualiza sem contar como revisão
  useEffect(() => {
    if (!acervo.ligado || leitura || !liberado) return;
    const noRoteiro = new Set(saida.artes.map((a) => chaveDeArte(a.texto)));
    const ja = acervo.artes.filter((a) => noRoteiro.has(a.chave));
    const chaves = (l: ArteDoAcervo[] | undefined) => (l ?? []).map((a) => a.chave).sort().join('|');
    if (chaves(ja) !== chaves(meta.jaExistem)) mudarMeta({ jaExistem: ja.length ? ja : undefined }, true);
  }, [acervo, saida.artes, liberado]); // eslint-disable-line react-hooks/exhaustive-deps
  const doAcervo = useMemo(() => new Map((meta.jaExistem ?? []).map((a) => [a.chave, a])), [meta.jaExistem]);
  // o padrão é produzir tudo; quem revisa confere no servidor e decide não produzir a que já existe
  const naoProduzir = useMemo(() => new Set(meta.naoProduzir ?? []), [meta.naoProduzir]);
  const alternarProduzir = (k: string) =>
    mudarMeta({ naoProduzir: naoProduzir.has(k) ? [...naoProduzir].filter((x) => x !== k) : [...naoProduzir, k] });
  // anterior e seguinte na ordem da fila de revisão (este roteiro incluído), para andar por ela
  const vizinhos = useMemo(() => {
    const { proximos } = agruparPorDia(pendentes(fila).filter((r) => r.id === inicial.id || pedeRevisao(r)));
    const ordem = proximos.flatMap((g) => g.itens);
    const i = ordem.findIndex((r) => r.id === inicial.id);
    return { anterior: i > 0 ? ordem[i - 1] : undefined, // no fim da fila, volta para o começo
      seguinte: i >= 0 ? (ordem[i + 1] ?? (i > 0 ? ordem[0] : undefined)) : proximo.r };
  }, [fila, inicial.id, proximo.r]);

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

  const irParaArte = (a: MarcaNoDoc, focar = true) => {
    if (!editor) return;
    if (focar) editor.chain().focus().setTextSelection({ from: a.from, to: a.to }).run();
    else editor.commands.setTextSelection({ from: a.from, to: a.to });
    editor.view.dom.querySelector(`u.arte[data-id="${CSS.escape(a.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
        alteracoes.current++;
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
    alteracoes.current++;
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
  const lista = pendenciasDetalhadas(saida);

  /** Abre uma arte na lista (sem levar o foco para o texto, para o teclado seguir escolhendo). */
  const abrirArte = (a: (typeof artes)[number] | undefined) => {
    setAberta(a?.id ?? null);
    if (a) irParaArte(a, false);
  };
  /** Depois de escolher o tipo, a próxima arte sem tipo já abre. */
  const escolherTipo = (a: (typeof artes)[number], novo: SubtipoArte) => {
    if (!editor) return;
    atualizarMarca(editor, a, { subtipo: novo, sugerido: false });
    if (!novo) return;
    const faltam = artes.filter((x) => x.id !== a.id && !normalizarSubtipo(x.attrs.subtipo));
    abrirArte(faltam.find((x) => x.ordem > a.ordem) ?? faltam[0]);
  };

  const original = inicial.original;
  const baixarODoc = async () => {
    if (!original) return;
    try {
      baixar(await baixarOriginal(inicial.id), original.nome, original.tipo);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui baixar o original.');
    }
  };

  /* ---------- Trello ---------- */
  const [envio, setEnvio] = useState<EnvioTrello | undefined>();
  const estadoTrello = envio ?? fila.find((r) => r.id === inicial.id)?.trello;
  const podeMandar = temTrello() && !leitura && liberado;
  const noTrello = estadoTrello?.estado === 'enviado' || estadoTrello?.estado === 'duplicado';
  /** Grava o que está na tela e cria o card. */
  const mandarTrello = async () => {
    setEnvio({ estado: 'enviando', em: new Date().toISOString() });
    try {
      const atual = roteiroAtual();
      await armazenamento.salvar(atual);
      const r = await mandarParaTrello(atual);
      setEnvio({ estado: r.estado, url: r.url, em: new Date().toISOString(), por: pessoa?.nome });
      if (r.estado === 'duplicado') avisar('Essa claquete já tinha entrado hoje pelo upload antigo. Não criei outro card.');
      else if (r.avisos?.length) avisar(`Foi para o Trello, mas: ${r.avisos[0]}${r.avisos.length > 1 ? ` (e mais ${r.avisos.length - 1})` : ''}.`);
      else avisar('Foi para o Trello.');
      return true;
    } catch (e) {
      const erro = e instanceof Error ? e.message : 'o servidor não respondeu';
      setEnvio({ estado: 'erro', erro, em: new Date().toISOString() });
      avisar(`Não foi para o Trello: ${erro}`);
      return false;
    }
  };

  const perguntaProducao = meta.naProducao && !noTrello && podeMandar ? meta.naProducao : undefined;

  /** O botão principal: manda (ou atualiza o card da v2) e vai para o próximo; já mandado, só vai para o próximo. */
  const vaiMandar = podeMandar && !noTrello;
  const rotuloPrincipal =
    estadoTrello?.estado === 'enviando'
      ? 'Mandando…'
      : !vaiMandar
        ? 'Próximo'
        : estadoTrello?.estado === 'erro'
          ? 'Tentar de novo'
          : meta.v2De
            ? 'Atualizar'
            : 'Enviar';
  const acaoPrincipal = async () => {
    if (!liberado || estadoTrello?.estado === 'enviando') return;
    if (!vaiMandar) return proximo.r && abrir(proximo.r.id);
    if (perguntaProducao) return comparar(inicial.id);
    // nada impede o envio: as pendências ficam à vista ao lado, e o que faltar o n8n completa depois
    if ((await mandarTrello()) && proximo.r) abrir(proximo.r.id);
  };
  const acaoRef = useRef(acaoPrincipal);
  acaoRef.current = acaoPrincipal;
  useEffect(() => {
    // na captura, antes do editor: senão o Ctrl+Enter também vira quebra de linha no texto
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) void acaoRef.current();
      }
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, []);

  return (
    <div className="pagina editor">
      {sala && sincronizado && <PonteirosDaSala sala={sala} eu={pessoa?.email ?? ''} editor={editor} />}
      <header className="topo" data-ancora="topo">
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
          {comServidor && (sou || inicial.aberto) && (
            <>
              {original && (
                <button className="botao-icone baixar-original" aria-label={`Baixar o original, ${original.nome}`} onClick={() => void baixarODoc()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z M14 3v5h5" />
                    <path className="seta-baixar" d="M12 11v6 M9.5 14.5L12 17l2.5-2.5" />
                  </svg>
                  <span className="dica" role="tooltip">Baixar o original<small>{original.nome} · {tamanhoLegivel(original.tamanho)}</small></span>
                </button>
              )}
              <button className="botao-icone" title="Histórico de versões" aria-label="Histórico de versões" aria-expanded={!!historico} onClick={abrirHistorico}>
                <Icone nome="historico" tam={18} />
              </button>
              {!inicial.aberto && (
              <div className="compartilhar">
                <button className={`visibilidade ${publico || pessoas.length ? 'publico' : ''}`} aria-haspopup="dialog" aria-expanded={compartilhando} onClick={() => setCompartilhando((v) => !v)}>
                  <Icone nome={publico ? 'olho' : pessoas.length ? 'pessoas' : 'cadeado'} tam={14} traco={2} />
                  {publico ? 'Todos veem' : pessoas.length ? plural(pessoas.length, 'pessoa', 'pessoas') : 'Só eu'}
                </button>
                {compartilhando && <Compartilhar publico={publico} pessoas={pessoas} mudar={compartilhar} />}
              </div>
              )}
            </>
          )}
          <div className="exportar">
            <button className="botao-icone mais-acoes" aria-haspopup="menu" aria-expanded={exportando} title="Exportar" aria-label="Exportar" onClick={() => setExportando((v) => !v)}>
              <span aria-hidden="true">···</span>
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
          {noTrello && (
            estadoTrello?.url ? (
              <a className="botao-icone no-trello" href={estadoTrello.url} target="_blank" rel="noreferrer" title={`No Trello${estadoTrello.por ? ` · mandado por ${estadoTrello.por}` : ''}`} aria-label="Abrir o card no Trello">
                <Icone nome="quadro" tam={17} traco={2.2} />
              </a>
            ) : (
              <span className="botao-icone no-trello" title="A claquete já tinha entrado pelo upload antigo"><Icone nome="quadro" tam={17} traco={2.2} /></span>
            )
          )}
          {(podeMandar && !noTrello) || proximo.r ? (
            <div className="acao-principal">
              <button
                className={`botao primario ${estadoTrello?.estado === 'erro' ? 'erro' : ''}`}
                disabled={!liberado || estadoTrello?.estado === 'enviando' || (podeMandar && !noTrello && !!perguntaProducao)}
                title={
                  podeMandar && !noTrello
                    ? perguntaProducao
                      ? 'Antes, compare com o que já está no Trello e decida'
                      : estadoTrello?.estado === 'erro'
                        ? estadoTrello.erro
                        : `${meta.v2De ? 'Põe as artes novas no card que já existe' : 'Cria o card com as artes, os campos e o PDF'}${proximo.r ? ` e abre ${proximo.r.meta.claquete || 'o próximo'}` : ''} (${atalho('Mod-Enter')})`
                    : `${proximo.r?.meta.claquete || 'Próximo roteiro'} (${atalho('Mod-Enter')})`
                }
                onClick={() => void acaoPrincipal()}
              >
                {podeMandar && !noTrello && <Icone nome="quadro" tam={15} traco={2.2} />}
                {rotuloPrincipal}
                {!podeMandar || noTrello ? <Icone nome="seta" tam={14} traco={2.2} /> : null}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mesa">
        <div className={`area ${colunas ? 'larga' : ''}`} ref={area}>
          <article className="folha" data-ancora="folha">
            {(vizinhos.anterior || vizinhos.seguinte || proximo.total > 0) && (
              <nav className="nav-folha" aria-label="Fila de revisão">
                {vizinhos.anterior ? (
                  <button className="botao-icone seta-nav voltar" title={`Anterior: ${vizinhos.anterior.meta.claquete || 'sem claquete'}`} aria-label="Roteiro anterior" onClick={() => abrir(vizinhos.anterior!.id)}>
                    <Icone nome="seta" tam={17} traco={2.2} />
                  </button>
                ) : (
                  <span />
                )}
                <span className="restam-mao">{proximo.total ? <><b>+{proximo.total}</b> para revisar</> : 'último da fila'}</span>
                {vizinhos.seguinte ? (
                  <button className="botao-icone seta-nav" title={`${vaiMandar ? 'Pular, sem mandar, para' : 'Próximo:'} ${vizinhos.seguinte.meta.claquete || 'o próximo'}`} aria-label={vaiMandar ? 'Pular para o próximo' : 'Próximo roteiro'} onClick={() => abrir(vizinhos.seguinte!.id)}>
                    <Icone nome="seta" tam={17} traco={2.2} />
                  </button>
                ) : (
                  <span />
                )}
              </nav>
            )}
            {leitura && (
              <div className="faixa-leitura">
                <span>Roteiro de <strong>{inicial.criadoPor?.nome ?? 'um colega'}</strong>. Você pode ler e exportar.</span>
                <button className="botao" onClick={duplicarParaEditar}><Icone nome="duplicar" tam={14} /> Duplicar para editar</button>
              </div>
            )}
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
              <div className="fim-linha"><span>fim</span></div>
              <p className="dicas">
                <span><kbd>{atalho('Mod-u')}</kbd> marca como arte</span>
                <span><kbd>CAIXA ALTA</kbd> é locução</span>
              </p>
            </footer>
            <Decupagem saida={saida} noTexto={sonorasNoTexto} alternar={() => setSonorasNoTexto((v) => !v)} />
          </article>

          <aside className="lado" data-ancora="lado" aria-label="Claquete e artes" inert={leitura || !liberado || undefined}>
            <Claquete dados={meta} mudar={mudarMeta} comAtracao cadastrarAtracao={cadastrarAtracao && meta.claquete ? () => cadastrarAtracao(meta.programa.trim() || meta.claquete) : undefined} />
            {perguntaProducao && (
              <section className="cartao trello-lado pergunta-producao" aria-label="Já na produção da arte">
                <a className="card-existente" href={perguntaProducao.url} target="_blank" rel="noreferrer" title="Já está no Trello">
                  <Icone nome="quadro" tam={15} traco={2.2} />
                  <b>{perguntaProducao.claquete}</b>
                  {perguntaProducao.entrada && <small>{dataCurtaComDia(new Date(perguntaProducao.entrada).toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' }))}</small>}
                </a>
                <button className="botao primario largo" onClick={() => comparar(inicial.id)}>Comparar e decidir</button>
              </section>
            )}
            {comServidor && !temTrello() && !leitura && (
              <section className="cartao trello-lado desligado" aria-label="Trello">
                <small><Icone nome="quadro" tam={13} /> O envio está desligado neste servidor: faltam TRELLO_KEY, TRELLO_TOKEN e TRELLO_LISTA nas variáveis do stack.</small>
              </section>
            )}
            <section className="cartao">
            {lista.length > 0 && (
              <div className="pendencias-editor" aria-label="Para revisar">
                <div className="cab-artes"><b>Para revisar</b><span className="rotulo">{lista.length}</span></div>
                <ul>
                  {lista.map((p) => (
                    <li key={p.id}>
                      <span>{p.texto}</span>
                      <span className="pendencia-acoes">
                        {p.id === 'sem-editor' && (
                          <button className="botao-texto" onClick={() => document.querySelector<HTMLButtonElement>('.claquete .escolha-nome-valor[aria-label^="Editor"]')?.click()}>Escolher</button>
                        )}
                        {p.id === 'sem-data' && (
                          <button className="botao-texto" onClick={() => document.querySelector<HTMLButtonElement>('.claquete .campo-data button')?.click()}>Escolher</button>
                        )}
                        {p.id === 'arte-longa' && p.arte && (
                          <button className="botao-texto" onClick={() => abrirArte(artes.find((a) => a.id === p.arte))}>Ver</button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <hr className="sep-artes" />
              </div>
            )}
              <div className="cab-artes">
                <b><i>{artes.length}</i> {artes.length === 1 ? 'arte' : 'artes'}</b>
                {TIPOS_NA_LISTA && semTipo > 0 && <span className="rotulo">falta o tipo de {semTipo}</span>}
              </div>
              {artes.length === 0 && <p className="suave pequeno">Selecione um trecho e use <kbd>{atalho('Mod-u')}</kbd>: a arte aparece aqui.</p>}
              <ol className={`artes ${TIPOS_NA_LISTA ? '' : 'so-lista'}`}>
                {!TIPOS_NA_LISTA &&
                  artes.map((a) => {
                    const k = chaveDeArte(a.texto);
                    const ja = doAcervo.get(k);
                    const pula = !!ja && naoProduzir.has(k);
                    return (
                    <li
                      key={a.id}
                      className={`${ativa?.id === a.id ? 'ativa' : ''} ${realce === a.id ? 'realcada' : ''} ${ja ? 'existe' : ''} ${pula ? 'pulada' : ''}`}
                      title={ja ? `${pula ? 'Não vai ser produzida. ' : ''}Já existe: ${ja.claquete || 'acervo da atração'}${ja.tipo ? ` · ${ja.tipo}` : ''}` : undefined}
                      onMouseEnter={() => setRealce(a.id)}
                      onMouseLeave={() => setRealce(null)}
                    >
                      <button className="arte-linha" onClick={() => irParaArte(a)} onFocus={() => setRealce(a.id)} onBlur={() => setRealce(null)}>
                        <span className="b">{a.ordem}</span>
                        <span className="txt"><b>{a.texto}</b></span>
                        {ja && !pula && <span className="marca-existe" aria-label="já existe"><Icone nome="copiar" tam={13} traco={2} /></span>}
                      </button>
                      {ja && !leitura && (
                        <button className="botao-texto alternar-acervo" title={pula ? 'Volta para o checklist' : 'Achou no servidor? Sai do checklist do Trello'} onClick={() => alternarProduzir(k)}>
                          {pula ? 'produzir' : 'não produzir'}
                        </button>
                      )}
                      {!leitura && (
                        <button className="tirar-arte" aria-label={`Tirar "${a.texto}" das artes`} title="Deixa de ser arte (o texto fica)" onClick={() => tirarArte(a)}>
                          <Icone nome="fechar" tam={13} traco={2.2} />
                        </button>
                      )}
                    </li>
                    );
                  })}
                {TIPOS_NA_LISTA && artes.map((a) => {
                  const subtipo = normalizarSubtipo(a.attrs.subtipo);
                  const esta = aberta === a.id;
                  return (
                    <li key={a.id} className={`${esta ? 'aberta' : ''} ${ativa?.id === a.id ? 'ativa' : ''}`} onMouseEnter={() => setRealce(a.id)} onMouseLeave={() => setRealce(null)}>
                      <button
                        className="arte-linha"
                        aria-expanded={esta}
                        onClick={() => (esta ? setAberta(null) : abrirArte(a))}
                      >
                        <Miniatura subtipo={subtipo} />
                        <span className="txt"><b>{a.texto}</b><span className={subtipo ? '' : 'pede'}>{subtipo ? nomeSubtipo(subtipo) : esta ? 'escolha o tipo' : 'sem tipo'}</span></span>
                        <span className="b">{a.ordem}</span>
                      </button>
                      {esta && editor && (
                        <EscolhaDeTipo valor={subtipo} atalhos escolher={(novo) => escolherTipo(a, novo)} />
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

      {realce && <style>{`.texto u.arte[data-id="${CSS.escape(realce)}"]{position:relative;animation:selecionar-arte .5s cubic-bezier(.45,0,.3,1) forwards}.texto u.arte[data-id="${CSS.escape(realce)}"]::after{content:'';position:absolute;top:-.2em;width:.5em;height:1.4em;margin-left:-.25em;pointer-events:none;background:var(--ibeam-arte) no-repeat center/contain;animation:arrastar-cursor-arte .5s cubic-bezier(.45,0,.3,1) forwards}`}</style>}
      <Estatisticas saida={saida} paginas={meta.paginasOriginal} original={original} />

    </div>
  );
}

const contarPalavras = (s: string) => (s.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? []).length;
const numero = (n: number) => n.toLocaleString('pt-BR');
export const tamanhoLegivel = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const duracao = (seg: number) => (seg < 60 ? `${seg}s` : `${Math.floor(seg / 60)}min${seg % 60 ? `${String(seg % 60).padStart(2, '0')}s` : ''}`);
const quandoSubiu = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === hoje.toDateString() ? `hoje às ${hora}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
};
/** Palavras por página de roteiro, para estimar quando o arquivo não diz. */
const PALAVRAS_POR_PAGINA = 250;

/** Rodapé com os números do roteiro, atualizados enquanto se edita. */
function Estatisticas({ saida, paginas, original }: { saida: Saida; paginas?: number; original?: Roteiro['original'] }) {
  const total = contarPalavras(saida.texto.completo);
  const locucao = contarPalavras(saida.texto.locucao);
  const caracteres = saida.texto.completo.replace(/\n/g, '').length;
  const estimadas = Math.max(1, Math.ceil(total / PALAVRAS_POR_PAGINA));
  const pags = paginas ?? estimadas;
  const formato = original?.nome.match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase();
  return (
    <footer className="estatisticas" aria-label="Números do roteiro">
      <span><b>{numero(total)}</b> {total === 1 ? 'palavra' : 'palavras'}</span>
      <span><b>{numero(locucao)}</b> na locução</span>
      <span className="tempo" title="Locução e sonoras, no ritmo médio de leitura de chamada">≈ <b>{duracao(saida.roteiro.duracaoEstimadaSeg)}</b> de leitura</span>
      <span><b>{numero(caracteres)}</b> caracteres</span>
      <span><b>{saida.artes.length}</b> {saida.artes.length === 1 ? 'arte' : 'artes'}</span>
      <span title={paginas ? 'Páginas do arquivo que subiu' : `Estimativa, ${PALAVRAS_POR_PAGINA} palavras por página`}>
        <b>{paginas ? '' : '~'}{pags}</b> {pags === 1 ? 'página' : 'páginas'}
      </span>
      {original && (
        <span className="dir">
          original: {formato ? `${formato}, ` : ''}{tamanhoLegivel(original.tamanho)} · subiu {quandoSubiu(original.em)}
        </span>
      )}
    </footer>
  );
}
