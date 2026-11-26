import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { Vagas } from './vagas';
import { BalaoLigar } from './BalaoLigar';
import type { AtracaoNova } from './Cadastros';
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
import { armazenamento, atracaoNoServidor, atualizarVocabulario, baixarOriginal, consultarAcervo, consultarPauta, mandarParaTrello, palpitesDoRedator, quemNosRoteiros, roteiroDa, temTrello, type EnvioTrello, type Leitura, type PresencaNosRoteiros, type Resumo, type Versao } from '../dados/armazenamento';
import { casoDaLeitura, LinkQuebrado } from './LinkQuebrado';
import {
  Arte, atualizarMarca, Celula, dividirArte, Etiqueta, Imagem, limparMarcas, Linha, listarMarcas, marcaEm, marcarArte,
  marcarArte as marcarArteNoTexto, partesDaArte, prepararColagem, Reconhecimento, SoMarcas, Teclado, type MarcaNoDoc,
} from '../editor/extensoes';
import { alternarJaExiste, alvosDoTeclado, chavesQueExistem, complexidadeDaArte, complexidadeDoRoteiro, exportar, listaDeArtes, marcarComplexidade, NOME_DA_COMPLEXIDADE, pendencias, pendenciasDetalhadas, remarcar, subirComplexidade, type Complexidade, type Saida } from '../modelo/exportar';
import { agruparPorDia, pedeRevisao, pendentes, proximoParaRevisar } from './fila';
import { chaveDeArte } from '../modelo/diferencas';
import {
  ETIQUETAS, juntarTipos, metaVazia, NOMES_COLUNAS, nomesDosTipos, normalizarSubtipo, tiposDaArte, novoId, SUBTIPOS_ARTE, type ArteDoAcervo, type Meta, type Pessoa, type Roteiro, type SubtipoArte,
} from '../modelo/tipos';
import { Claquete, EscolhaDeTipo, Marca, MenuDeOpcoes, Miniatura, PalpiteAMao, TextoDaClaquete, useSaida, type PalpiteNoCampo } from './pecas';
import { estadoDoRedator, paragrafosDoDoc, recusarPalpite, sugeridosDoMenu } from '../modelo/redator';
import { useTelaDeCelular } from './faixa';
import { Icone, Selo, type NomeIcone } from './icones';
import { Riscado } from './Comparar';
import { useCamadaDeRiscos, useDesdeDaMarca } from './riscos';
import { Fogo, FogoComTroca } from './fogo';
import { ehDocx, ehPdf, VisorOriginal } from './VisorOriginal';
import { acharPrograma, programasConhecidos } from '../modelo/vocabularios';
import { atalho, baixar, copiarTexto, dataCurtaComDia, haQuantoTempo, nomeDoArquivo, plural, semMovimento } from './util';
import { ehDoTour, enviarExemplo } from '../tour/exemplo';
import { ajustarSelecao } from '../editor/selecao';
import { gestoNaLista, SEGURAR_MS } from './gestoNaLista';
import { enviadoNoTour, enviarNoTour } from '../tour/TourDaRevisao';


/** No tour, quanto tempo o Enviar do exemplo mostra "Mandando…" antes de voltar para a fila. */
const MANDANDO_NO_TOUR_MS = 900;
/** No celular, quanto tempo a arte apontada na lista fica destacada no texto, e quanto leva para o destaque se desfazer. */
const DESTAQUE_NO_CELULAR_MS = 2200;
const DESFAZ_DESTAQUE_MS = 520;
/** No celular, o toque mais longo que ainda conta como toque (segurar é o começo da seleção do sistema). */
const TOQUE_MS = 400;

/* ---------- topo da folha: atração e praça ---------- */

/** Origem, timecode e fala de cada sonora: o que a edição precisa, fora do caminho da Arte. */
function Decupagem({ saida }: { saida: Saida }) {
  if (!saida.sonoras.length) return null;
  return (
    <section className="decupagem" aria-label="Decupagem">
      <div className="decupagem-topo">
        <div>
          <div className="rotulo">Para a edição</div>
          <h2>Decupagem</h2>
        </div>
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

/* ---------- no celular: marcar e desmarcar arte com o dedo ---------- */

/** Um trecho do texto, em posições do editor. */
type Trecho = { from: number; to: number };

/**
 * A seleção nativa do dedo, ajustada (palavras inteiras, um parágrafo só, sem a pontuação das pontas), em posições do
 * editor. O texto é só de leitura no celular, então a seleção vem do documento, não do estado do editor.
 */
function trechoDoDedo(editor: Editor): Trecho | null {
  const sel = document.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  const { view } = editor;
  if (!view.dom.contains(r.startContainer) || !view.dom.contains(r.endContainer)) return null;
  let from: number, to: number;
  try {
    from = view.posAtDOM(r.startContainer, r.startOffset);
    to = view.posAtDOM(r.endContainer, r.endOffset);
  } catch {
    return null;
  }
  if (from > to) [from, to] = [to, from];
  // o texto de cada parágrafo que a seleção toca, com uma posição do editor por caractere (imagem e quebra viram espaço)
  const blocos: { inicio: number; texto: string }[] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    let texto = '';
    node.forEach((filho) => void (texto += filho.isText ? filho.text! : ' '.repeat(filho.nodeSize)));
    blocos.push({ inicio: pos + 1, texto });
    return false;
  });
  if (!blocos.length) return null;
  const ponto = (i: number, pos: number) => ({ paragrafo: i, posicao: Math.max(0, Math.min(blocos[i].texto.length, pos - blocos[i].inicio)) });
  const t = ajustarSelecao(blocos.map((b) => b.texto), ponto(0, from), ponto(blocos.length - 1, to));
  if (!t) return null;
  const trecho = { from: blocos[t.paragrafo].inicio + t.ini, to: blocos[t.paragrafo].inicio + t.fim };
  // o trecho que já é arte não oferece "Arte" (desmarcar é tocando nela)
  const dentroDeUma = listarMarcas(editor.state.doc, 'arte').some((m) => m.from <= trecho.from && m.to >= trecho.to);
  return dentroDeUma ? null : trecho;
}

/**
 * O balão do celular (o botão "Arte" ou "Arte N · Desmarcar"): embaixo do trecho, centrado nele e dentro da tela.
 * Mora na área que rola com a página, então acompanha o trecho quando a página rola.
 */
function BalaoDoCelular({ editor, trecho, area, versao, rotulo, children }: { editor: Editor; trecho: Trecho; area: RefObject<HTMLDivElement | null>; versao: number; rotulo: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const caixaArea = area.current?.getBoundingClientRect();
    if (!el || !caixaArea) return;
    try {
      const ini = editor.view.domAtPos(trecho.from);
      const fim = editor.view.domAtPos(trecho.to);
      const r = document.createRange();
      r.setStart(ini.node, ini.offset);
      r.setEnd(fim.node, fim.offset);
      const linhas = [...r.getClientRects()].filter((c) => c.width > 0);
      const caixa = r.getBoundingClientRect();
      const ultima = linhas[linhas.length - 1] ?? caixa;
      const largura = el.offsetWidth;
      const x = Math.max(12, Math.min(caixa.left + caixa.width / 2 - largura / 2, document.documentElement.clientWidth - largura - 12));
      setPos({ x: x - caixaArea.left, y: ultima.bottom + 10 - caixaArea.top });
    } catch {
      setPos(null);
    }
  }, [editor, trecho.from, trecho.to, area, versao]);
  return (
    <div
      ref={ref}
      className="barra-flutuante balao-celular"
      role="toolbar"
      aria-label={rotulo}
      style={pos ? { left: pos.x, top: pos.y } : { left: 0, top: 0, visibility: 'hidden' }}
      // tocar no balão não desfaz a seleção do texto
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

/** Edição de uma marcação já feita. */
function PopoverMarca({ editor, marca, x, y, fechar }: { editor: Editor; marca: MarcaNoDoc; x: number; y: number; fechar: () => void }) {
  const arte = marca.nome === 'arte';
  const pedacos = arte ? partesDaArte(marca.texto) : [];
  return (
    <div className="popover" role="dialog" aria-label="Editar marcação" style={{ left: x, top: y }}>
      <div className="popover-topo">
        <Selo nome={arte ? 'arte' : (marca.attrs.tipo as NomeIcone)} />
        <span className="rotulo">{arte ? 'Arte' : 'Etiqueta'}</span>
        {arte ? (
          <MenuDeOpcoes
            rotulo="Tipo de arte"
            multiplo
            valor={juntarTipos(tiposDaArte(marca.attrs.subtipo))}
            opcoes={[{ id: '', nome: 'Sem tipo' }, ...SUBTIPOS_ARTE.map((s) => ({ id: s.id, nome: s.nome }))]}
            mudar={(v) => atualizarMarca(editor, marca, { subtipo: v, sugerido: false })}
          />
        ) : (
          <MenuDeOpcoes
            rotulo="Tipo de etiqueta"
            valor={String(marca.attrs.tipo)}
            opcoes={ETIQUETAS.map((s) => ({ id: s.id, nome: s.id === 'comentario' ? 'Comentário' : s.nome }))}
            mudar={(v) => atualizarMarca(editor, marca, { tipo: v })}
          />
        )}
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
        {pedacos.length > 1 && (
          <button className="botao-texto" title={pedacos.map((p) => p.texto).join(' · ')} onClick={() => (dividirArte(editor, marca), fechar())}>
            Dividir em {pedacos.length}
          </button>
        )}
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

export function TelaEditor({ id, voltar, abrir, comparar, avisar, pessoa, cadastrarAtracao, buscarNaFila }: { id: string; voltar: () => void; abrir: (id: string) => void; comparar: (id: string) => void; avisar: (t: string) => void; pessoa?: Pessoa; cadastrarAtracao?: (claquete: string, nova?: AtracaoNova) => void; buscarNaFila?: (termo: string) => void }) {
  const [leitura, setLeitura] = useState<Leitura | undefined>(undefined);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    void armazenamento.ler(id).then((l) => vivo && setLeitura(l));
    return () => {
      vivo = false;
    };
  }, [id, tentativa]);

  if (leitura === undefined) return <div className="pagina" />;
  if (leitura.estado !== 'ok')
    return (
      <div className="pagina">
        <LinkQuebrado caso={casoDaLeitura(leitura)} voltar={voltar} buscar={buscarNaFila} abrir={abrir} tentar={() => setTentativa((n) => n + 1)} />
      </div>
    );
  return <Folha inicial={leitura.roteiro} voltar={voltar} abrir={abrir} comparar={comparar} avisar={avisar} pessoa={pessoa} cadastrarAtracao={cadastrarAtracao} />;
}

function Folha({ inicial, voltar, abrir, comparar, avisar, pessoa, cadastrarAtracao }: { inicial: Roteiro; voltar: () => void; abrir: (id: string) => void; comparar: (id: string) => void; avisar: (t: string) => void; pessoa?: Pessoa; cadastrarAtracao?: (claquete: string, nova?: AtracaoNova) => void }) {
  const pessoaRef = useRef(pessoa);
  pessoaRef.current = pessoa;
  const mexeu = useRef(false);
  // roteiros de antes da claquete não têm os campos novos
  const [meta, setMeta] = useState<Meta>(() => ({ ...metaVazia(), ...inicial.meta }));
  // o original como chegou (Word ou PDF), ao lado do texto: para conferir o sublinhado do redator com as artes
  const temOriginal = ehDocx(inicial.original?.nome) || ehPdf(inicial.original?.nome);
  const [vista, setVista] = useState<'texto' | 'original'>('texto');
  // o texto da revisão não se digita: um aviso, no máximo a cada 6 s, para quem tentar
  const ultimoAvisoTexto = useRef(0);
  const avisoTexto = useRef(() => {});
  avisoTexto.current = () => {
    if (Date.now() - ultimoAvisoTexto.current < 6000) return;
    ultimoAvisoTexto.current = Date.now();
    avisar('Aqui o texto fica como chegou: dá para marcar e classificar as artes.');
  };
  const [docVersao, setDocVersao] = useState(0);
  const [selVersao, setSelVersao] = useState(0);
  const [salvo, setSalvo] = useState(true);
  const sou = inicial.meu !== false; // dono (ou modo sem servidor)
  const leitura = !sou && !inicial.podeEditar; // recebido só para ver
  // o exemplo do tour vive só neste navegador: sem a sala de edição simultânea, como no modo navegador, e sem perguntar
  // nada ao servidor sobre ele (pauta, acervo)
  const doTour = ehDoTour(inicial.id);
  const comServidor = armazenamento.tipo === 'servidor' && !doTour;
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
  // as falas aparecem no texto, a menos que a pessoa tenha recolhido (a escolha fica no navegador)
  const [sonorasNoTexto, setSonorasNoTexto] = useState(() => {
    try {
      return localStorage.getItem('promeiro:sonoras') !== 'recolhidas';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('promeiro:sonoras', sonorasNoTexto ? 'no-texto' : 'recolhidas');
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }, [sonorasNoTexto]);
  const [medida, setMedida] = useState(0);
  // o celular (até 600px): uma página só, com a ficha e o "Para revisar" recolhíveis e o texto só de leitura
  const celular = useTelaDeCelular();
  const [fichaAberta, setFichaAberta] = useState(false);
  const [pendenciasAbertas, setPendenciasAbertas] = useState(false);

  const area = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);
  const revisao = useRef(inicial.revisao);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const celularRef = useRef(celular);
  celularRef.current = celular;
  const aoClicar = useRef<(pos: number) => void>(() => {});

  const editor = useEditor({
    extensions: [
      Document, Paragraph, Text, Bold, Italic, HardBreak,
      Arte, Etiqueta, Imagem, Linha, Celula, Reconhecimento, Teclado.configure({ programa: () => metaRef.current.programa }),
      SoMarcas.configure({ aviso: () => avisoTexto.current() }),
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
      editor.setEditable(!leitura && !celularRef.current);
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
      const r = roteiroDa(await armazenamento.ler(inicial.id));
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

  // no celular, o texto é só de leitura: nada de digitar, mas a seleção continua (é por ela que se marca a arte).
  // Girar o aparelho troca o modo; isso não é uma edição, então não avisa o onUpdate
  useEffect(() => {
    if (editor && liberado) editor.setEditable(!leitura && !celular, false);
  }, [editor, liberado, leitura, celular]);

  // sem editor: a pauta pode ter sido preenchida depois que o roteiro subiu; pergunta de novo ao abrir
  const perguntouPauta = useRef(false);
  useEffect(() => {
    if (!liberado || leitura || doTour || perguntouPauta.current || meta.editor || !meta.claquete) return;
    perguntouPauta.current = true;
    void consultarPauta(meta.claquete)
      .then((p) => {
        if (p.editor) mudarMetaRef.current?.({ editor: p.editor });
      })
      .catch(() => {});
  }, [liberado, leitura, doTour, meta.editor, meta.claquete]);
  // sem redator e sem palpite guardado (o roteiro chegou antes da sugestão de redator, ou por outro caminho): procura
  // um, pelo texto e pelas últimas claquetes da atração. Fica guardado, para não perguntar de novo
  const procurouRedator = useRef(false);
  useEffect(() => {
    if (!liberado || leitura || doTour || procurouRedator.current || meta.redator || meta.sugestoesRedator) return;
    procurouRedator.current = true;
    void atualizarVocabulario()
      .then(() => palpitesDoRedator(metaRef.current, paragrafosDoDoc(editor ? (editor.getJSON() as Roteiro['doc']) : inicial.doc)))
      .then((sugestoesRedator) => {
        if (!metaRef.current.redator && !metaRef.current.sugestoesRedator) mudarMetaRef.current?.({ sugestoesRedator }, true);
      })
      .catch(() => {});
  }, [liberado, leitura, doTour, meta.redator, meta.sugestoesRedator, editor]); // eslint-disable-line react-hooks/exhaustive-deps
  // sem atração: a lista de keys pode não ter carregado quando o roteiro chegou; tenta reconhecer de novo pela claquete
  const procurouAtracao = useRef(false);
  useEffect(() => {
    if (!liberado || leitura || procurouAtracao.current || meta.programa || !meta.claquete) return;
    procurouAtracao.current = true;
    void atualizarVocabulario()
      .then(() => {
        const p = acharPrograma(meta.claquete) ?? (inicial.origem ? acharPrograma(inicial.origem.replace(/[_.]+/g, ' ')) : null);
        if (p) return mudarMetaRef.current?.({ programa: p.nome, tipoPrograma: p.tipo });
        // a lista do navegador não reconheceu: o servidor procura nas keys do Teable
        return atracaoNoServidor(meta.claquete).then((nome) => {
          if (nome) mudarMetaRef.current?.({ programa: nome, tipoPrograma: programasConhecidos().find((x) => x.nome === nome)?.tipo ?? 'outro' });
        });
      })
      .catch(() => {});
  }, [liberado, leitura, meta.programa, meta.claquete]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // no celular, a linha acende só com uma seleção de verdade (o cursor parado no fim do texto, ao abrir, não conta)
  const ativa = editor && selecao && !(celular && selecao.empty) ? marcaEm(editor, selecao.from) : null;

  // no celular: o botão "Arte" embaixo da seleção do dedo, e "Arte N · Desmarcar" embaixo da arte tocada (com a linha
  // dela acesa na lista). Os dois somem com um toque fora; a seleção que some leva o botão junto.
  const [balao, setBalao] = useState<({ tipo: 'selecao' } & Trecho) | { tipo: 'arte'; id: string } | null>(null);
  const podeMarcarNoCelular = !!editor && celular && !leitura && liberado;
  useEffect(() => {
    if (!podeMarcarNoCelular) return setBalao(null);
    // a seleção muda a cada passo do dedo: lê quando ela para
    let espera: ReturnType<typeof setTimeout> | undefined;
    const aoMudar = () => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        const t = trechoDoDedo(editor!);
        setBalao((b) => (t ? { tipo: 'selecao', ...t } : b?.tipo === 'selecao' ? null : b));
      }, 120);
    };
    document.addEventListener('selectionchange', aoMudar);
    return () => {
      clearTimeout(espera);
      document.removeEventListener('selectionchange', aoMudar);
    };
  }, [podeMarcarNoCelular, editor]);
  // o toque fora é um toque de verdade: rolar a página (o dedo que arrasta) ou segurar não fecha o balão
  const temBalao = !!balao;
  useEffect(() => {
    if (!temBalao) return;
    let inicio: { x: number; y: number; t: number } | null = null;
    const desceu = (e: PointerEvent) => void (inicio = { x: e.clientX, y: e.clientY, t: e.timeStamp });
    const subiu = (e: PointerEvent) => {
      const toque = inicio && e.timeStamp - inicio.t < TOQUE_MS && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < 10;
      inicio = null;
      if (toque && !(e.target as HTMLElement).closest?.('.balao-celular')) setBalao(null);
    };
    window.addEventListener('pointerdown', desceu, true);
    window.addEventListener('pointerup', subiu, true);
    return () => {
      window.removeEventListener('pointerdown', desceu, true);
      window.removeEventListener('pointerup', subiu, true);
    };
  }, [temBalao]);
  const tocarNoTexto = (e: React.MouseEvent) => {
    const id = (e.target as HTMLElement).closest('u.arte')?.getAttribute('data-id');
    if (podeMarcarNoCelular && id && document.getSelection()?.isCollapsed !== false) setBalao({ tipo: 'arte', id });
  };
  /** "Arte": a mesma marca do Ctrl+U no trecho ajustado. */
  const marcarNoCelular = (t: Trecho) => {
    if (!editor) return;
    editor.commands.setTextSelection(t);
    marcarArteNoTexto(editor, undefined, metaRef.current.programa);
    document.getSelection()?.removeAllRanges();
    setBalao(null);
  };
  const arteDoBalao = balao?.tipo === 'arte' ? artes.find((a) => a.id === balao.id) : undefined;
  // a arte desmarcada (aqui ou por um colega) leva o balão junto
  useEffect(() => {
    if (balao?.tipo === 'arte' && !arteDoBalao) setBalao(null);
  }, [balao, arteDoBalao]);

  aoClicar.current = (pos) => {
    if (!editor) return;
    const m = leitura || celular ? null : marcaEm(editor, pos);
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
    if (!realce || !editor || celular) return;
    const t = setTimeout(() => {
      const el = editor.view.dom.querySelector<HTMLElement>(`u.arte[data-id="${CSS.escape(realce)}"]`);
      const r = el?.getBoundingClientRect();
      if (el && r && (r.bottom < 80 || r.top > window.innerHeight - 50)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 350);
    return () => clearTimeout(t);
  }, [realce, editor, celular]);

  // no celular não há mouse: tocar no nome da arte (ou no "Ver") leva até ela no texto, com o mesmo destaque, que
  // depois de um tempo se desfaz devagar (`soltando`)
  const [soltando, setSoltando] = useState<string | null>(null);
  const apontou = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(apontou.current), []);
  const apontarNoTexto = (a: MarcaNoDoc) => {
    clearTimeout(apontou.current);
    setSoltando(null);
    setRealce(a.id);
    editor?.view.dom.querySelector(`u.arte[data-id="${CSS.escape(a.id)}"]`)?.scrollIntoView({ block: 'center', behavior: semMovimento() ? 'auto' : 'smooth' });
    apontou.current = setTimeout(() => {
      setRealce(null);
      setSoltando(a.id);
      apontou.current = setTimeout(() => setSoltando(null), DESFAZ_DESTAQUE_MS);
    }, DESTAQUE_NO_CELULAR_MS);
  };

  /** Tipos de arte escondidos por enquanto: a lista é só das artes, com índice, e dá para tirar uma arte por ela. */
  const TIPOS_NA_LISTA = false;
  // Tirar do checklist, de dois jeitos: "já existe" (✓: vai na linha JÁ EXISTEM do card e, no envio, entra no acervo da
  // atração) ou "não produzir" (✕: só sai). A arte que já está no acervo vem riscada sozinha. A bolinha do índice marca
  // "já existe" na arte a produzir e devolve ao checklist a que já existe ou está fora.
  // Nos dois a arte fica no texto (e no PDF). Deixar de ser arte de vez é no texto (tirar o sublinhado).
  const marcadasJa = useMemo(() => chavesQueExistem(meta), [meta.jaExiste, meta.jaExistem, meta.naoProduzir, meta.produzir]); // eslint-disable-line react-hooks/exhaustive-deps
  const marcadasFora = useMemo(() => new Set(meta.naoProduzir ?? []), [meta.naoProduzir]);
  const nJa = artes.filter((a) => marcadasJa.has(chaveDeArte(a.texto))).length;
  const nFora = artes.filter((a) => marcadasFora.has(chaveDeArte(a.texto))).length;
  const nAProduzir = artes.length - nJa - nFora;
  // o risco à mão se escreve só na marca nova; o que já vem marcado ao abrir aparece pronto
  const desdeDaMarca = useDesdeDaMarca([...marcadasJa, ...marcadasFora]);
  // "já existe" também no texto (#50): o trecho apaga, o sublinhado some e um risco à mão atravessa cada linha, numa
  // camada por cima da folha (o editor redesenha o texto a cada mudança, então nada vai dentro dele)
  const camadaDoTexto = useRef<SVGSVGElement>(null);
  const jaNoTexto = artes.filter((a) => marcadasJa.has(chaveDeArte(a.texto)));
  const redesenharRiscos = useCamadaDeRiscos(
    camadaDoTexto,
    () =>
      editor
        ? jaNoTexto.map((a) => ({
            elementos: [...editor.view.dom.querySelectorAll(`u.arte[data-id="${CSS.escape(a.id)}"]`)],
            semente: a.ordem,
            desde: desdeDaMarca.get(chaveDeArte(a.texto)),
          }))
        : [],
    `${editor ? 1 : 0}|${vista}|${sonorasNoTexto}|${jaNoTexto.map((a) => `${a.id}:${desdeDaMarca.get(chaveDeArte(a.texto)) ?? ''}`).join(',')}`,
  );
  useEffect(() => {
    if (!editor) return;
    editor.on('transaction', redesenharRiscos);
    return () => {
      editor.off('transaction', redesenharRiscos);
    };
  }, [editor, redesenharRiscos]);
  const marcarArte = (a: (typeof artes)[number], como: 'existe' | 'fora' | null) => {
    mudarMeta(remarcar(meta, [chaveDeArte(a.texto)], como));
    setRealce(null);
    avisar(como === 'existe' ? `"${a.texto}" já existe: sai do checklist e, no envio, entra no acervo.` : como === 'fora' ? `"${a.texto}" não vai ser produzida.` : `"${a.texto}" volta para o checklist.`);
  };
  // a complexidade da arte: o clique no fogo sobe um nível; o card leva a maior das artes a produzir
  const subirFogo = (a: (typeof artes)[number]) => mudarMeta(subirComplexidade(meta, chaveDeArte(a.texto)));
  const complexidadeDoCard = useMemo(() => complexidadeDoRoteiro(meta, saida.artes.map((a) => chaveDeArte(a.texto))), [meta, saida]);

  // várias de uma vez: Shift+clique seleciona um trecho da lista, Ctrl/⌘+clique soma uma; a barra marca todas juntas
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const ancoraSel = useRef<string | null>(null);
  const clicarArte = (a: (typeof artes)[number], e: React.MouseEvent) => {
    // no celular, o toque no nome leva até a arte no texto (o lote começa segurando a linha: dedoNaLista)
    if (celular) {
      setSelecionadas([]);
      ancoraSel.current = a.id;
      return apontarNoTexto(a);
    }
    if (leitura || !(e.shiftKey || e.metaKey || e.ctrlKey)) {
      setSelecionadas([]);
      ancoraSel.current = a.id;
      selDaLista.current = { from: a.from, to: a.to };
      return irParaArte(a);
    }
    e.preventDefault();
    // o foco sai do texto, para as teclas da lista valerem na seleção (e não caírem no roteiro)
    if (editor?.isFocused) editor.commands.blur();
    if (e.shiftKey && ancoraSel.current) {
      const i = artes.findIndex((x) => x.id === ancoraSel.current);
      const j = artes.findIndex((x) => x.id === a.id);
      const [de, ate] = i < 0 ? [j, j] : [Math.min(i, j), Math.max(i, j)];
      const trecho = artes.slice(de, ate + 1).map((x) => x.id);
      setSelecionadas((l) => [...new Set([...l, ...trecho])]);
    } else setSelecionadas((l) => (l.includes(a.id) ? l.filter((x) => x !== a.id) : [...l, a.id]));
    ancoraSel.current = a.id;
  };
  const marcarVarias = (como: 'existe' | 'fora' | null) => {
    const escolhidas = artes.filter((a) => selecionadas.includes(a.id));
    if (!escolhidas.length) return;
    mudarMeta(remarcar(meta, escolhidas.map((a) => chaveDeArte(a.texto)), como));
    setSelecionadas([]);
    const n = plural(escolhidas.length, 'arte', 'artes');
    avisar(como === 'existe' ? `${n} já existem: saem do checklist.` : como === 'fora' ? `${n} não vão ser produzidas.` : `${n} voltam para o checklist.`);
  };
  // a complexidade de várias de uma vez (a barra de lote e as teclas 1, 2 e 3): direto ao nível
  const nivelDasArtes = (ids: string[], n: Complexidade) => {
    const escolhidas = artes.filter((a) => ids.includes(a.id));
    if (!escolhidas.length) return;
    mudarMeta(marcarComplexidade(meta, escolhidas.map((a) => chaveDeArte(a.texto)), n));
    if (selecionadas.length) {
      // no celular, o lote continua depois do fogo (dá para seguir com "Já existem" ou mudar a seleção)
      if (!celular) setSelecionadas([]);
      avisar(`${plural(escolhidas.length, 'arte', 'artes')} com complexidade ${NOME_DA_COMPLEXIDADE[n]}.`);
    }
  };
  // no celular, o lote: segurar uma linha por meio segundo começa; depois, cada toque marca ou desmarca uma linha, e o
  // lote sai sozinho quando não sobra nenhuma. Rolar a página (o dedo que arrasta) não conta. No lote, a linha inteira
  // é o alvo: a bolinha, o nome, o fogo e o ✕ não respondem ao toque, e o clique que vem depois do gesto é engolido.
  const podeLote = celular && !leitura && liberado;
  const emLote = podeLote && selecionadas.length > 0;
  /** O dedo na lista: a linha, onde e quando encostou, o quanto mais se afastou, e se o gesto é do lote. */
  type Dedo = { id: string; x: number; y: number; t: number; afastou: number; segurar?: ReturnType<typeof setTimeout>; doLote: boolean };
  const dedo = useRef<Dedo | null>(null);
  useEffect(() => () => clearTimeout(dedo.current?.segurar), []);
  const dedoNaLista = {
    onPointerDown: (e: React.PointerEvent) => {
      clearTimeout(dedo.current?.segurar);
      const id = (e.target as HTMLElement).closest<HTMLElement>('li[data-id]')?.dataset.id;
      if (!id) return void (dedo.current = null);
      const d: Dedo = { id, x: e.clientX, y: e.clientY, t: e.timeStamp, afastou: 0, doLote: emLote };
      if (!emLote)
        d.segurar = setTimeout(() => {
          if (dedo.current !== d || gestoNaLista(SEGURAR_MS, d.afastou) !== 'segurar') return;
          d.doLote = true;
          setSelecionadas([id]);
        }, SEGURAR_MS);
      dedo.current = d;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = dedo.current;
      if (!d) return;
      d.afastou = Math.max(d.afastou, Math.hypot(e.clientX - d.x, e.clientY - d.y));
      if (gestoNaLista(e.timeStamp - d.t, d.afastou) === 'arrasto') clearTimeout(d.segurar);
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = dedo.current;
      if (!d) return;
      clearTimeout(d.segurar);
      if (emLote && gestoNaLista(e.timeStamp - d.t, d.afastou) === 'toque')
        setSelecionadas((l) => (l.includes(d.id) ? l.filter((x) => x !== d.id) : [...l, d.id]));
    },
    // o sistema assumiu o gesto (a rolagem): nada de segurar
    onPointerCancel: () => clearTimeout(dedo.current?.segurar),
    // o clique que o sistema manda depois do gesto do lote (uma vez só: o próximo gesto decide de novo)
    onClickCapture: (e: React.MouseEvent) => {
      if (!dedo.current?.doLote) return;
      dedo.current.doLote = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  useEffect(() => {
    if (!selecionadas.length) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setSelecionadas([]);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [selecionadas.length]);

  // as teclas da lista: 1, 2 e 3 levam a complexidade direto ao nível; E alterna "já existe" (como a bolinha).
  // Valem para a seleção, para a arte sob o mouse ou para a última clicada, e nunca enquanto se digita: num campo, ou no
  // texto do roteiro, a não ser que a seleção dele ainda seja a arte que o clique na lista apontou.
  const sobOMouse = useRef<string | null>(null);
  const selDaLista = useRef<{ from: number; to: number } | null>(null);
  const tecladoDaLista = useRef<(e: KeyboardEvent) => void>(() => {});
  tecladoDaLista.current = (e: KeyboardEvent) => {
    const n = ({ 1: 1, 2: 2, 3: 3 } as Record<string, Complexidade | undefined>)[e.key];
    const ja = e.key === 'e' || e.key === 'E';
    if ((!n && !ja) || leitura || !liberado || e.metaKey || e.ctrlKey || e.altKey) return;
    if (TIPOS_NA_LISTA && aberta) return; // com a arte aberta, os números escolhem o tipo
    const alvo = e.target as HTMLElement | null;
    if (alvo?.closest?.('input, textarea, select, [role="dialog"]')) return;
    if (alvo?.closest?.('[contenteditable="true"]')) {
      const sel = editor?.state.selection;
      const daLista = selDaLista.current;
      if (!editor?.view.dom.contains(alvo) || !sel || !daLista || sel.from !== daLista.from || sel.to !== daLista.to) return;
    }
    const ids = alvosDoTeclado(selecionadas, sobOMouse.current, ancoraSel.current);
    const escolhidas = artes.filter((a) => ids.includes(a.id));
    if (!escolhidas.length) return;
    e.preventDefault();
    if (n) return nivelDasArtes(ids, n);
    const chaves = escolhidas.map((a) => chaveDeArte(a.texto));
    const novas = alternarJaExiste(meta, chaves);
    mudarMeta(novas);
    if (selecionadas.length) setSelecionadas([]);
    const existe = chavesQueExistem({ ...meta, ...novas }).has(chaves[0]);
    if (escolhidas.length === 1) {
      const t = escolhidas[0].texto;
      avisar(existe ? `"${t}" já existe: sai do checklist e, no envio, entra no acervo.` : `"${t}" volta para o checklist.`);
    } else {
      const nArtes = plural(escolhidas.length, 'arte', 'artes');
      avisar(existe ? `${nArtes} já existem: saem do checklist.` : `${nArtes} voltam para o checklist.`);
    }
  };
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => tecladoDaLista.current(e);
    window.addEventListener('keydown', ouvir, true);
    return () => window.removeEventListener('keydown', ouvir, true);
  }, []);

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

  // o próximo roteiro para revisar, na ordem da fila: o que ninguém revisou e ninguém está com aberto agora
  // (proximoParaRevisar). O editor não ouve a fila ao vivo: quem está em cada roteiro vem de uma consulta ao servidor,
  // ao abrir (para o rótulo do botão e o aviso) e de novo na hora de ir ao próximo
  const [fila, setFila] = useState<Resumo[]>([]);
  const [presenca, setPresenca] = useState<PresencaNosRoteiros>({});
  useEffect(() => {
    armazenamento.listar().then(setFila, () => setFila([]));
  }, [meta.revisar?.length]);
  useEffect(() => {
    if (!doTour) void quemNosRoteiros().then(setPresenca);
  }, [doTour]);
  const proximo = useMemo(() => {
    const { proximos } = agruparPorDia(pendentes(fila).filter((r) => r.id !== inicial.id && pedeRevisao(r)));
    return { r: proximoParaRevisar(fila, { email: pessoa?.email, roteiro: inicial.id }, presenca), total: proximos.reduce((n, g) => n + g.itens.length, 0) };
  }, [fila, presenca, inicial.id, pessoa?.email]);
  /** Vai ao próximo para revisar, com a fila e a presença lidas agora (mudam enquanto se revisa: um colega pode ter
      aberto o que era o próximo). Sem nenhum livre, volta para a fila, que comemora se tiver zerado. */
  const irAoProximo = async () => {
    const [agoraNaFila, agoraNosRoteiros] = await Promise.all([armazenamento.listar().catch(() => fila), quemNosRoteiros()]);
    const r = proximoParaRevisar(agoraNaFila, { email: pessoa?.email, roteiro: inicial.id }, agoraNosRoteiros);
    if (r) abrir(r.id);
    else voltar();
  };
  // abrir à mão um roteiro em que um colega já está é livre (a edição simultânea): só um aviso discreto, uma vez
  const avisouQuemEsta = useRef(false);
  useEffect(() => {
    const outros = (presenca[inicial.id] ?? []).filter((p) => p.email.toLowerCase() !== (pessoa?.email ?? '').toLowerCase());
    if (avisouQuemEsta.current || !outros.length) return;
    avisouQuemEsta.current = true;
    const nomes = outros.map((p) => p.nome.split(/\s+/)[0]);
    avisar(`${nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]} estão` : `${nomes[0]} está`} revisando este roteiro.`);
  }, [presenca]); // eslint-disable-line react-hooks/exhaustive-deps
  // o acervo da atração: artes que ela já tem prontas (conferidas aqui, fora do checklist do Trello)
  const [acervo, setAcervo] = useState<{ ligado: boolean; artes: ArteDoAcervo[] }>({ ligado: false, artes: [] });
  useEffect(() => {
    if (doTour) return;
    let vivo = true;
    const t = setTimeout(() => void consultarAcervo(meta.programa, meta.dataExibicao ?? '').then((a) => vivo && setAcervo(a)), 400);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [meta.programa, meta.dataExibicao, doTour]);
  // o roteiro guarda quais das artes dele já existem (a fila e o envio usam); atualiza sem contar como revisão
  useEffect(() => {
    if (!acervo.ligado || leitura || !liberado) return;
    const noRoteiro = new Set(saida.artes.map((a) => chaveDeArte(a.texto)));
    const ja = acervo.artes.filter((a) => noRoteiro.has(a.chave));
    const chaves = (l: ArteDoAcervo[] | undefined) => (l ?? []).map((a) => a.chave).sort().join('|');
    if (chaves(ja) !== chaves(meta.jaExistem)) mudarMeta({ jaExistem: ja.length ? ja : undefined }, true);
  }, [acervo, saida.artes, liberado]); // eslint-disable-line react-hooks/exhaustive-deps
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
    if (!editor || leitura || celular) return;
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
  // o exemplo do tour tem o Enviar mesmo sem Trello: quem decide o que ele faz é o tour
  const podeMandar = (temTrello() || doTour) && !leitura && liberado;
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
    // o exemplo nunca vai ao Trello: o Enviar dele é do tour, que só aceita no passo de enviar. Aceito, o envio é
    // simulado, só na memória: "Mandando…" por um instante, e o tour leva de volta à fila
    if (doTour) {
      if (!enviarNoTour()) return;
      setEnvio({ estado: 'enviando', em: new Date().toISOString() });
      const [simulado] = await Promise.all([enviarExemplo(roteiroAtual()), new Promise((ok) => setTimeout(ok, MANDANDO_NO_TOUR_MS))]);
      setEnvio(simulado);
      return enviadoNoTour();
    }
    if (!vaiMandar) return proximo.r && irAoProximo();
    if (perguntaProducao) return comparar(inicial.id);
    // nada impede o envio: as pendências ficam à vista ao lado, e o que faltar o n8n completa depois
    if (await mandarTrello()) await irAoProximo();
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

  /* ---------- as peças: o computador e o celular arrumam cada um do seu jeito ---------- */
  const travado = leitura || !liberado || undefined;
  /** "Escolher" na pendência: abre o campo na ficha. No celular, abre a ficha antes, para o campo estar na tela. */
  const escolherNaFicha = (seletor: string) => {
    if (celular) {
      flushSync(() => setFichaAberta(true));
      document.querySelector('.claquete')?.scrollIntoView({ block: 'start', behavior: semMovimento() ? 'auto' : 'smooth' });
    }
    document.querySelector<HTMLButtonElement>(`.claquete ${seletor}`)?.click();
  };
  /** "Ver" na pendência: no computador, abre a arte na lista; no celular, leva até ela no texto. */
  const verArte = (id?: string) => {
    const a = artes.find((x) => x.id === id);
    if (!celular) return abrirArte(a);
    if (a) apontarNoTexto(a);
  };
  /* o palpite do redator: na claquete (o campo Redator) e em "Para revisar" */
  const estadoRedator = estadoDoRedator(meta);
  const recusarRedator = () => mudarMeta(recusarPalpite(metaRef.current));
  const palpiteRedator: PalpiteNoCampo | undefined = estadoRedator && !leitura ? { ...estadoRedator, sugeridos: sugeridosDoMenu(meta), recusar: recusarRedator } : undefined;
  const ficha = (
    <Claquete
      dados={meta}
      mudar={mudarMeta}
      estimadaSeg={saida.roteiro.duracaoEstimadaSeg}
      comAtracao
      cadastrarAtracao={cadastrarAtracao && meta.claquete ? () => cadastrarAtracao(meta.programa.trim() || meta.claquete) : undefined}
      balaoLigar={
        cadastrarAtracao && meta.claquete
          ? (fechar) => (
              <BalaoLigar
                claquete={meta.claquete}
                aberto={inicial.id}
                avisar={avisar}
                fechar={fechar}
                nova={(n) => (fechar(), cadastrarAtracao(meta.programa.trim() || meta.claquete, n))}
                ligado={(nome) => {
                  fechar();
                  const p = programasConhecidos().find((x) => x.nome === nome);
                  mudarMeta({ programa: nome, ...(p ? { tipoPrograma: p.tipo } : {}) });
                }}
              />
            )
          : undefined
      }
      recolhivel={celular ? { aberta: fichaAberta, mudar: setFichaAberta } : undefined}
      palpiteRedator={palpiteRedator}
    />
  );
  const avisosDoTrello = (
    <>
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
    </>
  );
  // aceito o palpite, a linha "Sem redator" recolhe pela altura antes de sair da lista
  const semRedatorNaLista = lista.some((p) => p.id === 'sem-redator');
  const lugarDoRedator = useRef(0);
  if (semRedatorNaLista) lugarDoRedator.current = lista.findIndex((p) => p.id === 'sem-redator');
  const redatorSaindo = useSaida(semRedatorNaLista, 1000);
  const listaNaTela = redatorSaindo ? [...lista.slice(0, lugarDoRedator.current), { id: 'sem-redator' as const, texto: 'Sem redator', dispensavel: false }, ...lista.slice(lugarDoRedator.current)] : lista;
  const escolherRedator = () => escolherNaFicha('.escolha-nome-valor[aria-label^="Redator"]');
  const acoesDoRedator = () => {
    const sugerido = estadoRedator?.estado === 'sugerido' && !leitura;
    // aceito: o nome aparece no lugar do palpite enquanto a linha recolhe
    if (redatorSaindo) return <span className="aceito-na-linha">{meta.redator}</span>;
    return (
      <>
        {sugerido && <PalpiteAMao sugestao={estadoRedator.sugestao} aceitar={(nome) => mudarMeta({ redator: nome })} recusar={recusarRedator} comMotivo={false} />}
        {(!sugerido || !celular) && <button className="botao-texto" onClick={escolherRedator}>Escolher</button>}
      </>
    );
  };
  const itensPendentes = (
    <ul>
      {listaNaTela.map((p) => (
        <li key={p.id} className={p.id === 'sem-redator' ? `linha-redator ${redatorSaindo ? 'saindo' : ''}` : undefined} aria-hidden={(p.id === 'sem-redator' && redatorSaindo) || undefined}>
          <span>{p.texto}</span>
          <span className="pendencia-acoes">
            {p.id === 'sem-redator' && acoesDoRedator()}
            {p.id === 'sem-editor' && (
              <button className="botao-texto" onClick={() => escolherNaFicha('.escolha-nome-valor[aria-label^="Editor"]')}>Escolher</button>
            )}
            {p.id === 'sem-data' && (
              <button className="botao-texto" onClick={() => escolherNaFicha('.campo-data button')}>Escolher</button>
            )}
            {p.id === 'arte-longa' && p.arte && (
              <button className="botao-texto" onClick={() => verArte(p.arte)}>Ver</button>
            )}
          </span>
          {p.id === 'sem-redator' && celular && estadoRedator?.estado === 'sugerido' && !redatorSaindo && <span className="motivo motivo-linha">{estadoRedator.sugestao.motivo}</span>}
        </li>
      ))}
    </ul>
  );
  const pendenciasNoComputador = listaNaTela.length > 0 && (
    <div className={`pendencias-editor ${lista.length ? '' : 'recolhendo'}`} aria-label="Para revisar">
      <div className="cab-artes"><b>Para revisar</b><span className="rotulo">{listaNaTela.length}</span></div>
      {itensPendentes}
      <hr className="sep-artes" />
    </div>
  );
  /** No celular, "Para revisar" recolhe: fechado, as pendências numa linha; aberto, a lista com "Ver" e "Escolher". */
  const pendenciasNoCelular = listaNaTela.length > 0 && (
    <section className={`cartao pendencias-editor pendencias-celular ${pendenciasAbertas ? 'aberta' : ''} ${lista.length ? '' : 'recolhendo'}`} aria-label="Para revisar">
      <button type="button" className="pend-topo" aria-expanded={pendenciasAbertas} onClick={() => setPendenciasAbertas((v) => !v)}>
        <span className="cab-artes"><b>Para revisar</b><span className="rotulo">{listaNaTela.length}</span></span>
        <span className="pend-linha-dobra"><span><span className="pend-linha">{listaNaTela.map((x) => x.texto).join(' · ')}</span></span></span>
        <span className="chev"><Icone nome="baixo" tam={16} traco={2.2} /></span>
      </button>
      <div className="pend-dobra" inert={!pendenciasAbertas || undefined}>
        <div>{itensPendentes}</div>
      </div>
    </section>
  );
  // a barra do lote: no computador, no alto da lista; no celular, no lugar da barra de baixo. As mesmas ações.
  const contaDoLote = <span className="conta"><b>{selecionadas.length}</b> {selecionadas.length === 1 ? 'selecionada' : 'selecionadas'}</span>;
  const acoesDoLote = (
    <>
      <button type="button" className="botao-texto" onClick={() => marcarVarias('existe')}><Icone nome="certo" tam={13} traco={2.2} /> Já existem</button>
      <button type="button" className="botao-texto" onClick={() => marcarVarias('fora')}><Icone nome="fechar" tam={13} traco={2.2} /> Não produzir</button>
      <button type="button" className="botao-texto" onClick={() => marcarVarias(null)}><Icone nome="desfazer" tam={13} traco={2.2} /> Produzir</button>
    </>
  );
  /** A complexidade das selecionadas: os três fogos lado a lado (no computador, cada um com a sua tecla). */
  const fogosDoLote = (
    <span className="cx-lote">
      {([1, 2, 3] as const).map((n) => (
        <button key={n} type="button" aria-label={`Complexidade ${NOME_DA_COMPLEXIDADE[n]} nas selecionadas`} title={celular ? undefined : `${NOME_DA_COMPLEXIDADE[n]} (${n})`} onClick={() => nivelDasArtes(selecionadas, n)}>
          <Fogo n={n} escala={n === 1 ? 1.2 : 1} />{!celular && <kbd>{n}</kbd>}
        </button>
      ))}
    </span>
  );
  const fecharLote = <button type="button" className="fechar-lote" aria-label="Limpar a seleção" title={celular ? undefined : 'Limpar (Esc)'} onClick={() => setSelecionadas([])}><Icone nome="fechar" tam={celular ? 14 : 12} traco={2.4} /></button>;
  const listaDasArtes = (
    <>
      <div className="cab-artes">
        <b><i>{nAProduzir}</i> {nAProduzir === 1 ? 'arte' : 'artes'}</b>
        {nFora > 0 && <span className="rotulo">+{nFora} fora</span>}
        {TIPOS_NA_LISTA && semTipo > 0 && <span className="rotulo">falta o tipo de {semTipo}</span>}
      </div>
      {artes.length === 0 && (celular ? <p className="suave pequeno">As artes sublinhadas no texto aparecem aqui.</p> : <p className="suave pequeno">Selecione um trecho e use <kbd>{atalho('Mod-u')}</kbd>: a arte aparece aqui.</p>)}
      {selecionadas.length > 0 && !leitura && !celular && (
        <div className="barra-lote" role="toolbar" aria-label="Marcar as artes selecionadas">
          {contaDoLote}
          {acoesDoLote}
          {fogosDoLote}
          {fecharLote}
        </div>
      )}
      <ol className={`artes ${TIPOS_NA_LISTA ? '' : 'so-lista'} ${emLote ? 'em-lote' : ''}`} {...(podeLote && dedoNaLista)}>
        {!TIPOS_NA_LISTA && (
          <Vagas itens={artes} chave={(a) => a.id}>
          {(a) => {
            const k = chaveDeArte(a.texto);
            const marcada = marcadasJa.has(k) ? 'existe' : marcadasFora.has(k) ? 'fora' : null;
            const cx = complexidadeDaArte(meta, k);
            return (
            <li
              key={a.id}
              data-id={a.id}
              className={`${ativa?.id === a.id ? 'ativa' : ''} ${realce === a.id || arteDoBalao?.id === a.id ? 'realcada' : ''} ${marcada ? `marcada ${marcada}` : ''} ${selecionadas.includes(a.id) ? 'selecionada' : ''}`}
              aria-selected={selecionadas.length ? selecionadas.includes(a.id) : undefined}
              // no celular não há mouse: o realce é o do toque no nome (apontarNoTexto)
              {...(!celular && {
                onMouseEnter: () => {
                  sobOMouse.current = a.id;
                  setRealce(a.id);
                },
                onMouseLeave: () => {
                  sobOMouse.current = null;
                  setRealce(null);
                },
              })}
            >
              <button className="arte-linha" onMouseDown={(e) => e.shiftKey && e.preventDefault()} onClick={(e) => clicarArte(a, e)} onFocus={celular ? undefined : () => setRealce(a.id)} onBlur={celular ? undefined : () => setRealce(null)}>
                {/* a bolinha do índice: na arte a produzir, marca "já existe"; na que existe ou está fora, devolve à lista.
                    Com Shift, Ctrl ou ⌘ o clique segue para a seleção da linha. */}
                <span
                  className="b"
                  data-marca={leitura ? undefined : (marcada ?? 'produzir')}
                  title={leitura ? undefined : marcada === 'existe' ? `Arte ${a.ordem} · já existe · clique para voltar a produzir`
                    : marcada === 'fora' ? `Arte ${a.ordem} · não produzir · clique para voltar a produzir` : `Arte ${a.ordem} · clique: já existe`}
                  onClick={(e) => {
                    if (leitura || e.shiftKey || e.metaKey || e.ctrlKey) return;
                    e.stopPropagation();
                    marcarArte(a, marcada ? null : 'existe');
                  }}
                >
                  <span className="num">{a.ordem}</span>
                  <Icone nome="certo" tam={11} traco={2.8} />
                </span>
                <span className="txt"><b>{marcada ? <Riscado semente={a.ordem} desde={desdeDaMarca.get(k)}>{a.texto}</Riscado> : a.texto}</b></span>
              </button>
              {/* na arte marcada (✓ ou ✕), o lugar do fogo e do × fica reservado e vazio: o texto não cresce para ele, e
                  marcar ou devolver a arte não muda a quebra das linhas nem a altura da linha */}
              {!leitura && marcada && (
                <>
                  <span className="cx-vaga" aria-hidden="true" />
                  <span className="acoes-arte" aria-hidden="true"><span className="tirar-vaga" /></span>
                </>
              )}
              {!leitura && !marcada && (
                <>
                  {/* a coluna da complexidade da arte: largura fixa, o fogo do nível centrado nela; o clique sobe um nível */}
                  <button className="cx" aria-label={`Complexidade ${NOME_DA_COMPLEXIDADE[cx]}`} title={`Complexidade: ${NOME_DA_COMPLEXIDADE[cx]} · clique sobe um nível (1, 2, 3)`} onClick={() => subirFogo(a)}>
                    <FogoComTroca n={cx} />
                  </button>
                  <span className="acoes-arte">
                    <button className="tirar-arte" aria-label={`Não produzir "${a.texto}"`} title="Não produzir (sai do checklist)" onClick={() => marcarArte(a, 'fora')}>
                      <Icone nome="fechar" tam={13} traco={2.2} />
                    </button>
                  </span>
                </>
              )}
            </li>
            );
          }}
          </Vagas>
        )}
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
                <span className="txt"><b>{a.texto}</b><span className={subtipo ? '' : 'pede'}>{subtipo ? nomesDosTipos(a.attrs.subtipo) : esta ? 'escolha o tipo' : 'sem tipo'}</span></span>
                <span className="b">{a.ordem}</span>
              </button>
              {esta && editor && (
                <EscolhaDeTipo valor={subtipo} atalhos escolher={(novo) => escolherTipo(a, novo)} />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
  const menuMais = (
    <div className="exportar">
      <button className="botao-icone mais-acoes" aria-haspopup="menu" aria-expanded={exportando} title="Exportar" aria-label="Exportar" onClick={() => setExportando((v) => !v)}>
        <span aria-hidden="true">···</span>
      </button>
      {exportando && (
        <div className="menu menu-exportar" role="menu">
          {/* no celular, o histórico mora aqui */}
          {celular && comServidor && (sou || inicial.aberto) && (
            <>
              <button role="menuitem" className="menu-item" onClick={() => (setExportando(false), void abrirHistorico())}><Selo nome="historico" /><span className="menu-texto">Histórico de versões</span></button>
              <div className="menu-sep" />
            </>
          )}
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
  );
  const noTrelloEl = noTrello && (
    estadoTrello?.url ? (
      <a className="botao-icone no-trello" href={estadoTrello.url} target="_blank" rel="noreferrer" title={`No Trello${estadoTrello.por ? ` · mandado por ${estadoTrello.por}` : ''}`} aria-label="Abrir o card no Trello">
        <Icone nome="quadro" tam={17} traco={2.2} />
      </a>
    ) : (
      <span className="botao-icone no-trello" title="A claquete já tinha entrado pelo upload antigo"><Icone nome="quadro" tam={17} traco={2.2} /></span>
    )
  );
  const botaoPrincipal = (podeMandar && !noTrello) || proximo.r ? (
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
                : `${meta.v2De ? 'Põe as artes novas no card que já existe' : 'Cria o card com as artes, os campos e o PDF'} · complexidade ${NOME_DA_COMPLEXIDADE[complexidadeDoCard]}${proximo.r ? ` e abre ${proximo.r.meta.claquete || 'o próximo'}` : ''} (${atalho('Mod-Enter')})`
            : `${proximo.r?.meta.claquete || 'Próximo roteiro'} (${atalho('Mod-Enter')})`
        }
        onClick={() => void acaoPrincipal()}
      >
        {podeMandar && !noTrello && <Icone nome="quadro" tam={15} traco={2.2} />}
        {rotuloPrincipal}
        {!podeMandar || noTrello ? <Icone nome="seta" tam={14} traco={2.2} /> : null}
      </button>
    </div>
  ) : null;

  // Texto | Original: no computador, quando a folha tem as setas da fila, ele entra na linha delas, depois da seta do
  // próximo (solto no canto, ficava por cima da seta e ela aparecia através do "Original")
  const comNav = !!(vizinhos.anterior || vizinhos.seguinte || proximo.total > 0);
  const seletorNaNav = temOriginal && comNav && !celular;
  const seletorDaVista = (
    <div className={`segmento vista-folha ${seletorNaNav ? 'na-nav' : ''}`} role="radiogroup" aria-label="Ver o roteiro">
      <button role="radio" aria-checked={vista === 'texto'} onClick={() => setVista('texto')}>Texto</button>
      <button role="radio" aria-checked={vista === 'original'} onClick={() => setVista('original')} title={`Como chegou: ${inicial.original?.nome ?? ''}`}>Original</button>
    </div>
  );
  const setaSeguinte = vizinhos.seguinte ? (
    <button className="botao-icone seta-nav" title={`${vaiMandar ? 'Pular, sem mandar, para' : 'Próximo:'} ${vizinhos.seguinte.meta.claquete || 'o próximo'}`} aria-label={vaiMandar ? 'Pular para o próximo' : 'Próximo roteiro'} onClick={() => abrir(vizinhos.seguinte!.id)}>
      <Icone nome="seta" tam={17} traco={2.2} />
    </button>
  ) : null;

  return (
    <div className="pagina editor">
      {sala && sincronizado && <PonteirosDaSala sala={sala} eu={pessoa?.email ?? ''} editor={editor} />}
      <header className="topo" data-ancora="topo">
        {celular ? (
          <>
            <button className="botao-icone" aria-label="Voltar para os roteiros" title="Roteiros" onClick={voltar}><Icone nome="voltar" tam={18} /></button>
            <span className="trilha"><strong><TextoDaClaquete texto={meta.claquete || meta.programa || 'Roteiro'} /></strong></span>
            {menuMais}
          </>
        ) : (
          <>
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
              {doTour && <span className="nota-exemplo">exemplo do tour</span>}
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
              {menuMais}
              {noTrelloEl}
              {botaoPrincipal}
            </div>
          </>
        )}
      </header>

      <div className="mesa">
        <div className={`area ${colunas ? 'larga' : ''}`} ref={area}>
          {/* no celular, uma página só: a ficha e o "Para revisar" antes do texto e a lista de artes depois dele.
              O texto fica no mesmo lugar da árvore nos dois arranjos, para o editor não ser montado de novo */}
          {celular && (
            <div className="antes-do-texto" inert={travado}>
              {ficha}
              {avisosDoTrello}
              {pendenciasNoCelular}
            </div>
          )}
          <article className="folha" data-ancora="folha">
            {temOriginal && !seletorNaNav && seletorDaVista}
            {comNav && (
              <nav className="nav-folha" aria-label="Fila de revisão">
                {vizinhos.anterior ? (
                  <button className="botao-icone seta-nav voltar" title={`Anterior: ${vizinhos.anterior.meta.claquete || 'sem claquete'}`} aria-label="Roteiro anterior" onClick={() => abrir(vizinhos.anterior!.id)}>
                    <Icone nome="seta" tam={17} traco={2.2} />
                  </button>
                ) : (
                  <span />
                )}
                <span className="restam-mao">{proximo.total ? <><b>+{proximo.total}</b> para revisar</> : 'último da fila'}</span>
                {seletorNaNav ? (
                  <span className="nav-direita">
                    {setaSeguinte}
                    {seletorDaVista}
                  </span>
                ) : (
                  setaSeguinte ?? <span />
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
              hidden={vista === 'original' && temOriginal}
              onContextMenu={aoMenuDeContexto}
              onClick={celular ? tocarNoTexto : undefined}
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
            <svg ref={camadaDoTexto} className="camada-riscos camada-do-texto" aria-hidden="true" />
            {vista === 'original' && temOriginal && (
              <div className="corpo-original">
                <VisorOriginal id={inicial.id} nome={inicial.original?.nome} artes={saida.artes.map((x) => x.texto)} />
              </div>
            )}
            <footer className="folha-fim">
              <div className="fim-linha"><span>fim</span></div>
              <p className="dicas">
                <span><kbd>{atalho('Mod-u')}</kbd> marca como arte</span>
                <span><kbd>CAIXA ALTA</kbd> é locução</span>
                {/* recolhe ou mostra as falas dentro do texto; sem sonoras, não aparece */}
                {saida.sonoras.length > 0 && (
                  <button type="button" className="botao-texto chave-sonoras" aria-pressed={!sonorasNoTexto} onClick={() => setSonorasNoTexto((v) => !v)}>
                    {sonorasNoTexto ? 'Esconder as sonoras' : 'Mostrar as sonoras'}
                  </button>
                )}
              </p>
            </footer>
            <Decupagem saida={saida} />
          </article>

          {celular ? (
            <section className="cartao artes-celular" aria-label="Artes" inert={travado}>
              {listaDasArtes}
            </section>
          ) : (
            <aside className="lado" data-ancora="lado" aria-label="Claquete e artes" inert={travado}>
              {ficha}
              {avisosDoTrello}
              <section className="cartao">
                {pendenciasNoComputador}
                {listaDasArtes}
              </section>
            </aside>
          )}

          {/* só em roteiro individual: com mais gente, desfazer pelo controle ficaria confuso */}
          {editor && sou && !publico && pessoas.length === 0 && !celular && <LinhaDoTempo editor={editor} versao={docVersao} />}

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
          {editor && balao?.tipo === 'selecao' && (
            <BalaoDoCelular editor={editor} trecho={balao} area={area} versao={docVersao + medida} rotulo="Marcar o trecho como arte">
              <button type="button" className="bf-arte" onClick={() => marcarNoCelular(balao)}><Icone nome="arte" tam={17} traco={1.9} /> Arte</button>
            </BalaoDoCelular>
          )}
          {editor && arteDoBalao && (
            <BalaoDoCelular editor={editor} trecho={arteDoBalao} area={area} versao={docVersao + medida} rotulo={`Arte ${arteDoBalao.ordem}`}>
              <span className="bf-num">Arte {arteDoBalao.ordem}</span>
              <button type="button" className="bf-desmarcar" onClick={() => (atualizarMarca(editor, arteDoBalao, null), setBalao(null))}><Icone nome="borracha" tam={17} traco={1.9} /> Desmarcar</button>
            </BalaoDoCelular>
          )}
          {editor && menu && <MenuEtiquetas editor={editor} x={menu.x} y={menu.y} fechar={() => setMenu(null)} />}
          {editor && marcaDoPopover && posPopover && <PopoverMarca editor={editor} marca={marcaDoPopover} x={posPopover.x} y={posPopover.y} fechar={() => setPopover(null)} />}
        </div>
      </div>

      {/* anexo que só aparece na impressão / PDF */}
      <section className="so-impressao">
        <h2>Lista de artes</h2>
        <table>
          <thead><tr><th>Nº</th><th>Tipo</th><th>Texto</th><th>Observação</th></tr></thead>
          <tbody>{saida.artes.map((a) => <tr key={a.id}><td>{a.ordem}</td><td>{a.subtipo ? a.subtipoNome : ''}</td><td>{a.texto}</td><td>{a.observacao}</td></tr>)}</tbody>
        </table>
        {saida.comentarios.length > 0 && <p>Comentários: {saida.comentarios.map((c) => c.texto).join(' · ')}</p>}
      </section>

      {realce && <style>{`.texto u.arte[data-id="${CSS.escape(realce)}"]{position:relative;animation:selecionar-arte .5s cubic-bezier(.45,0,.3,1) forwards}.texto u.arte[data-id="${CSS.escape(realce)}"]::after{content:'';position:absolute;top:-.2em;width:.5em;height:1.4em;margin-left:-.25em;pointer-events:none;background:var(--ibeam-arte) no-repeat center/contain;animation:arrastar-cursor-arte .5s cubic-bezier(.45,0,.3,1) forwards}`}</style>}
      {jaNoTexto.length > 0 && <style>{`.texto u.arte:is(${jaNoTexto.map((a) => `[data-id="${CSS.escape(a.id)}"]`).join(',')}){color:color-mix(in srgb,var(--tinta) 55%,transparent);text-decoration-color:transparent}`}</style>}
      {soltando && <style>{`.texto u.arte[data-id="${CSS.escape(soltando)}"]{background-size:100% 100%;animation:soltar-arte .5s cubic-bezier(.45,0,.3,1) forwards}`}</style>}
      {emLote ? (
        // no celular, o lote toma o lugar da barra de baixo: a contagem, os fogos e o ✕ em cima; as ações embaixo
        <div className="barra-lote no-celular" role="toolbar" aria-label="Marcar as artes selecionadas">
          {contaDoLote}
          {fogosDoLote}
          {fecharLote}
          <span className="acoes-lote">{acoesDoLote}</span>
        </div>
      ) : celular ? (
        // no celular, no lugar das estatísticas: a maior complexidade, as artes a produzir e o Enviar, ao alcance do polegar
        <footer className="barra-enviar" aria-label="Enviar ao Trello">
          <span className={`cx-card n${complexidadeDoCard}`} title="O card vai com a maior complexidade das artes"><span className="cx-pe"><FogoComTroca n={complexidadeDoCard} /></span><b>{NOME_DA_COMPLEXIDADE[complexidadeDoCard]}</b></span>
          <span className="conta"><b>{nAProduzir}</b> {nAProduzir === 1 ? 'arte' : 'artes'}</span>
          {noTrelloEl}
          {botaoPrincipal}
        </footer>
      ) : (
        <Estatisticas saida={saida} complexidade={complexidadeDoCard} paginas={meta.paginasOriginal} original={original} />
      )}

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
function Estatisticas({ saida, complexidade, paginas, original }: { saida: Saida; complexidade: Complexidade; paginas?: number; original?: Roteiro['original'] }) {
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
      {/* o card leva a maior complexidade das artes a produzir */}
      <span className={`cx-card n${complexidade}`} title="O card vai com a maior complexidade das artes"><span className="cx-pe"><FogoComTroca n={complexidade} /></span><b>{NOME_DA_COMPLEXIDADE[complexidade]}</b></span>
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
