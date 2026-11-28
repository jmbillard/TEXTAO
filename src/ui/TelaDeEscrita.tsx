import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import History from '@tiptap/extension-history';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { armazenamento, guardarOriginal, type Leitura } from '../dados/armazenamento';
import { abrirSala, corDe } from '../dados/colaboracao';
import { extensoesDoRoteiro, prepararColagem, Teclado } from '../editor/extensoes';
import { Escrita, type PonteDaEscrita } from '../editor/escrita';
import { ColagemNaEscrita } from '../editor/colagem';
import { ComecarNaFolha, type ComecoLido } from './ComecarDeFora';
import { Colunas, mudarVisao, type Visao } from '../editor/colunas';
import { exportar } from '../modelo/exportar';
import { metaVazia, type Meta, type Pessoa, type Roteiro } from '../modelo/tipos';
import { casoDaLeitura, LinkQuebrado } from './LinkQuebrado';
import { Compartilhar, type Convite } from './Compartilhar';
import { ComentariosDaFolha } from './ComentariosDaFolha';
import { ComentariosNoTexto } from '../editor/comentarios';
import { ArtesDaEscrita, EscritaNaFolha, RodapeDaEscrita } from './EscritaNaFolha';
import { BolinhaDeEstado } from './pecas';
import { Icone } from './icones';
import { atalho, ATALHO_DE_COMENTAR, baixar, nomeDoArquivo, plural, quandoComecou, semMovimento } from './util';
import { Presentes } from './Filmes';
import { useSalaDaEscrita } from './salaDaEscrita';
import './escrita.css';

/* O editor de escrita (#189, spec #186): o Roteiro sendo escrito no PROMeiro, numa folha corrida com o título no topo e
   sem claquete (ela é proposta no Enviar, #194). É o mesmo documento da revisão (o schema de `extensoesDoRoteiro`, com o
   tipo do trecho guardado no parágrafo) num outro modo: aqui a digitação é livre (sem a trava `SoMarcas`), e o roteiro
   se salva sozinho. Com o servidor, pela sala ao vivo da revisão (#191, `useSalaDaEscrita`): duas pessoas escrevem
   juntas, com o cursor e o nome de cada uma, e a barra mostra quem está no roteiro; a sala grava e diz até onde gravou.
   Sem o servidor, pelo PUT. A marca de salvo é a bolinha laranja (`BolinhaDeEstado`), nunca um ✓. Quem não escreve lê
   (e recebe ao vivo), com a faixa que diz isso; o servidor descarta o que ele mandar pela sala. A visibilidade é o
   painel `Compartilhar` da revisão, com os textos do escrito, e ela sim vai pelo PUT (só ela: o texto é o da sala).

   O escrever (#190) mora em `editor/escrita.ts` (o teclado, o palpite, as fichas) e em `EscritaNaFolha.tsx` (a margem
   dos tipos, o menu do "/", os balões, a lista das artes e o rodapé). Os ganchos dos próximos tickets ficam marcados: a
   sala e a presença no topo (#191), os comentários (#192) e o Enviar (#194).

   Ver (#193): embaixo do título, "Texto" e "Colunas" (vídeo | áudio) são duas visões do mesmo documento: nas colunas,
   cada trecho ganha o lugar dele por decoração (`editor/colunas.ts`), e a troca anda numa animação FLIP. O modo limpo
   (o botão e Ctrl+Shift+L, numa transição) esconde tudo menos a folha e mostra a cara dos .docx de hoje; o "/" e os
   atalhos continuam, porque o editor é o mesmo. Em colunas, o limpo vira a tabela de bordas pretas. O .docx baixado
   sai igual ao limpo da visão de agora (`gerarDocx` com `limpo`). */

/** Quanto a folha espera depois da última tecla para salvar. */
const SALVAR_MS = 600;

interface Props {
  id: string;
  /** de volta à lista de "Roteiros" */
  voltar: () => void;
  /** o roteiro não é um escrito no PROMeiro (chegou de fora): abre na revisão */
  abrirNaRevisao: (id: string) => void;
  avisar: (texto: string) => void;
  pessoa?: Pessoa;
  /** a linha do logo, com o caminho de "Roteiros" */
  topo: ReactNode;
}

export function TelaDeEscrita({ id, voltar, abrirNaRevisao, avisar, pessoa, topo }: Props) {
  const [leitura, setLeitura] = useState<Leitura | undefined>(undefined);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    void armazenamento.ler(id).then((l) => vivo && setLeitura(l));
    return () => {
      vivo = false;
    };
  }, [id, tentativa]);
  const deFora = leitura?.estado === 'ok' && !leitura.roteiro.escrito;
  useEffect(() => {
    if (deFora) abrirNaRevisao(id);
  }, [deFora, id, abrirNaRevisao]);

  if (leitura === undefined || deFora) return <div className="pagina">{topo}</div>;
  if (leitura.estado !== 'ok')
    return (
      <div className="pagina">
        {topo}
        <LinkQuebrado caso={casoDaLeitura(leitura)} voltar={voltar} tentar={() => setTentativa((n) => n + 1)} />
      </div>
    );
  return <Folha key={leitura.roteiro.id} inicial={leitura.roteiro} voltar={voltar} avisar={avisar} pessoa={pessoa} topo={topo} />;
}

/** O que a folha salva agora. */
type Salvamento = 'salvo' | 'salvando' | 'erro';

function Folha({ inicial, voltar, avisar, pessoa, topo }: { inicial: Roteiro; voltar: () => void; avisar: (t: string) => void; pessoa?: Pessoa; topo: ReactNode }) {
  const meu = inicial.meu !== false;
  // a regra é do servidor (regraDoEscrito): o autor, o convidado que escreve, a coordenação e o administrador
  const escreve = meu || !!inicial.podeEditar;
  const [meta, setMeta] = useState<Meta>(() => ({ ...metaVazia(), ...inicial.meta }));
  const [publico, setPublico] = useState(!!inicial.publico);
  const [pessoas, setPessoas] = useState<Convite[]>(inicial.compartilhadoCom ?? []);
  const [compartilhando, setCompartilhando] = useState(false);
  const [salvamento, setSalvamento] = useState<Salvamento>('salvo');
  const [mudancas, setMudancas] = useState(0);
  const [vazia, setVazia] = useState(true);
  const estado = useRef({ meta, publico, pessoas });
  estado.current = { meta, publico, pessoas };
  const mexeu = useRef(false);
  const pessoaRef = useRef(pessoa);
  pessoaRef.current = pessoa;
  const titulo = useRef<HTMLTextAreaElement>(null);
  // os comentários (#192): o pedido do botão Comentar e quantos estão abertos
  const [pedidoDeComentario, setPedidoDeComentario] = useState(0);
  const [abertos, setAbertos] = useState(0);
  // a escrita (#190): a ponte entre o teclado do editor e a tela (o menu do "/", os balões), e a arte com o balão aberto
  const ponte = useRef<PonteDaEscrita>({});
  const [arteAberta, setArteAberta] = useState<string | null>(null);
  // a sala ao vivo (#191): só existe com o servidor; o exemplo do tour não chega aqui (ele não é escrito no PROMeiro)
  const [sala] = useState(() => (armazenamento.tipo === 'servidor' ? abrirSala(inicial.id) : null));
  // ver (#193): a visão (texto ou colunas) e o modo limpo são de cada um, não do roteiro
  const [visao, setVisao] = useState<Visao>('texto');
  const [limpo, setLimpo] = useState(false);

  const editor = useEditor({
    extensions: [
      ...extensoesDoRoteiro(),
      // o teclado da escrita (#190) vem antes do da revisão: o "/", o Tab nos tipos, o Ctrl+U no trecho, as fichas
      Escrita.configure({ ponte: () => ponte.current, programa: () => estado.current.meta.programa }),
      // as colunas (#193): o lugar de cada trecho na grade vídeo | áudio, só decoração sobre o mesmo documento
      Colunas,
      Teclado.configure({ programa: () => estado.current.meta.programa }),
      // colar do Word no meio do texto (#195): linha a linha, com a arte inteira já do tipo arte
      ColagemNaEscrita,
      // o grifo dos trechos comentados (#192): decoração, o documento não muda
      ComentariosNoTexto,
      // na sala, o texto é o do documento compartilhado (com o desfazer de cada um) e os cursores dos colegas
      ...(sala
        ? [
            Collaboration.configure({ document: sala.doc, field: 'doc' }),
            CollaborationCursor.configure({ provider: sala.provedor, user: { name: pessoa?.nome ?? 'Alguém', email: pessoa?.email ?? '', color: corDe(pessoa?.email ?? '') } }),
          ]
        : [History.configure({ depth: 500 })]),
    ],
    // na sala, o texto chega dela, e a folha só libera a digitação depois disso (useSalaDaEscrita)
    content: sala ? undefined : inicial.doc,
    editable: escreve && !sala,
    // a folha abre com o cursor no texto, pronta para digitar (o título fica no topo, opcional)
    autofocus: escreve && !sala ? 'end' : false,
    editorProps: {
      attributes: { class: 'texto texto-escrita', spellcheck: 'true', lang: 'pt-BR', 'aria-label': 'Texto do roteiro', ...(escreve ? {} : { 'aria-readonly': 'true' }) },
      transformPastedHTML: prepararColagem,
    },
    onCreate: ({ editor: e }) => setVazia(e.isEmpty),
    // o texto que chega da sala (o preenchimento, o colega digitando) não passa pelo onUpdate: a folha vazia também
    // deixa de ser vazia com ele (senão o convite do começo, #195, ficaria por cima do texto)
    onTransaction: ({ editor: e, transaction }) => transaction.docChanged && setVazia(e.isEmpty),
    onUpdate: ({ editor: e }) => {
      setVazia(e.isEmpty);
      // na sala, quem salva é ela
      if (!sala) mudou();
    },
  });
  const { liberado, presentes, gravacao } = useSalaDaEscrita(sala, editor, {
    inicial,
    pessoa,
    escreve,
    aoMudarMeta: (m) => setMeta((antes) => ({ ...antes, ...m })),
  });
  // a marca de salvo junta a sala (o texto) e o PUT (quem vê)
  const marca: Salvamento = salvamento === 'erro' || gravacao === 'sem-conexao' ? 'erro' : salvamento === 'salvando' || gravacao === 'salvando' ? 'salvando' : 'salvo';

  // o começo lido de um arquivo ou de um colado na folha vazia (#195): o texto com os tipos e as artes, o título (se
  // ainda não há) e os campos de fora da meta; o original fica guardado no roteiro
  const corpo = useRef<HTMLDivElement>(null);
  const receberDeFora = ({ comeco, arquivo, original }: ComecoLido) => {
    if (!editor) return;
    editor.chain().setContent(comeco.doc, true).focus('end').run();
    const novos: Partial<Meta> = { ...comeco.meta, ...(estado.current.meta.titulo.trim() || !comeco.titulo ? {} : { titulo: comeco.titulo }) };
    setMeta((m) => ({ ...m, ...novos }));
    if (sala) sala.doc.transact(() => Object.entries(novos).forEach(([k, v]) => v !== undefined && sala.meta.set(k, v)));
    else mudou();
    if (arquivo) void guardarOriginal(inicial.id, arquivo, original).catch(() => {});
    const trechos = (comeco.doc.content ?? []).filter((p) => (p.content ?? []).length).length;
    avisar(`${arquivo ? arquivo.name : 'O texto colado'} entrou na folha: ${plural(trechos, 'trecho', 'trechos')}, ${plural(comeco.nArtes, 'arte', 'artes')}.`);
  };

  const mudou = () => {
    mexeu.current = true;
    setSalvamento('salvando');
    setMudancas((n) => n + 1);
  };

  const roteiroAtual = useCallback(
    (): Roteiro => ({
      ...inicial,
      meta: estado.current.meta,
      doc: editor ? (editor.getJSON() as Roteiro['doc']) : inicial.doc,
      publico: estado.current.publico,
      atualizadoEm: new Date().toISOString(),
      // só o autor muda quem vê (o servidor também só aceita dele)
      ...(meu ? { compartilhadoCom: estado.current.pessoas } : {}),
      ...(pessoaRef.current ? { alteradoPor: pessoaRef.current } : {}),
    }),
    [editor, inicial, meu],
  );

  // salva sozinho, um instante depois da última mudança; o que muda enquanto a gravação vai e volta salva na próxima
  const mudancasAgora = useRef(0);
  mudancasAgora.current = mudancas;
  useEffect(() => {
    if (!mudancas || !escreve) return;
    const t = setTimeout(() => {
      const marca = mudancas;
      armazenamento.salvar(roteiroAtual()).then(
        () => mudancasAgora.current === marca && setSalvamento('salvo'),
        (e: Error) => {
          setSalvamento('erro');
          avisar(e.message || 'Não consegui salvar o roteiro.');
        },
      );
    }, SALVAR_MS);
    return () => clearTimeout(t);
  }, [mudancas, escreve, roteiroAtual, avisar]);
  // ao sair (fechar a aba, voltar à lista) com algo por salvar, salva de uma vez
  const pendente = useRef(false);
  pendente.current = salvamento !== 'salvo';
  useEffect(() => {
    const antesDeSair = () => {
      if (escreve && mexeu.current && pendente.current) void armazenamento.salvar(roteiroAtual()).catch(() => {});
    };
    window.addEventListener('pagehide', antesDeSair);
    return () => {
      window.removeEventListener('pagehide', antesDeSair);
      antesDeSair();
    };
  }, [escreve, roteiroAtual]);

  // o título cresce com o texto, sem barra de rolagem
  useLayoutEffect(() => {
    const t = titulo.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
    // no modo limpo (#193), a letra do título muda: a altura acompanha
  }, [meta.titulo, limpo]);

  const mudarTitulo = (valor: string) => {
    const t = valor.replace(/\n/g, ' ');
    setMeta((m) => ({ ...m, titulo: t }));
    // na sala, o título vai pelo mapa "meta" dela, ao vivo para quem está junto
    if (sala) sala.doc.transact(() => sala.meta.set('titulo', t));
    else mudou();
  };
  const compartilhar = (todos: boolean, lista: Convite[]) => {
    setPublico(todos);
    setPessoas(lista);
    mudou();
  };
  // Texto | Colunas: a grade vem da decoração e a tela muda junto, no mesmo instante, para o FLIP medir o lugar final
  const trocarVisao = (v: Visao) => {
    if (!editor || v === visao) return;
    mudarVisao(editor, v, () => flushSync(() => setVisao(v)));
  };
  // o modo limpo entra e sai numa transição da página (a folha muda de cara no lugar); com o movimento reduzido, direto
  const alternarLimpo = useCallback(() => {
    const trocar = () => flushSync(() => setLimpo((v) => !v));
    const doc = document as Document & { startViewTransition?: (f: () => void) => unknown };
    if (doc.startViewTransition && !semMovimento()) doc.startViewTransition(trocar);
    else trocar();
  }, []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      // Ctrl+Shift+L (⌘⇧L no Mac), também com o cursor no texto
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyL') {
        e.preventDefault();
        alternarLimpo();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alternarLimpo]);
  // o .docx sai igual ao limpo da visão de agora
  const baixarDocx = async () => {
    try {
      const r = roteiroAtual();
      const blob = await (await import('./exportarDocx')).gerarDocx(exportar(r), { limpo: visao });
      baixar(blob, `${nomeDoArquivo(r.meta)}.docx`);
    } catch (e) {
      avisar((e as Error).message || 'Não consegui gerar o .docx.');
    }
  };

  // o painel de quem vê fecha no clique fora e no Esc
  const caixaDoPainel = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!compartilhando) return;
    const fora = (e: PointerEvent) => !caixaDoPainel.current?.contains(e.target as Node) && setCompartilhando(false);
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setCompartilhando(false);
    window.addEventListener('pointerdown', fora, true);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('keydown', tecla);
    };
  }, [compartilhando]);

  const autor = inicial.criadoPor?.nome ?? meta.redator;
  const visibilidade = publico ? 'Visível para a equipe' : pessoas.length ? `Fechado · ${pessoas.length === 1 ? '1 convidado' : `${pessoas.length} convidados`}` : 'Fechado';

  return (
    <div className={`pagina pagina-escrita${limpo ? ' limpo' : ''}`} data-visao={visao}>
      {/* no limpo, só a folha: o topo, a barra, as artes e o rodapé saem; fica o caminho de volta */}
      {limpo && (
        <div className="sair-do-limpo" role="toolbar" aria-label="Modo limpo">
          <button type="button" className="botao-texto" onClick={() => void baixarDocx()} title={`Baixa o .docx igual a esta folha, em ${visao === 'colunas' ? 'colunas' : 'texto'}`}>
            <Icone nome="baixar" tam={14} traco={2} /> .docx
          </button>
          <button type="button" className="botao" onClick={alternarLimpo}>
            Sair do modo limpo <kbd>{atalho('Mod-Shift-l')}</kbd>
          </button>
        </div>
      )}
      {topo}
      <div className="escrita-barra" role="toolbar" aria-label="O roteiro">
        <button type="button" className="botao-texto escrita-voltar" onClick={voltar}>
          <Icone nome="voltar" tam={14} traco={2} /> Roteiros
        </button>
        {escreve ? (
          <span className="escrita-salvo" data-salvamento={marca} role="status" aria-live="polite" title={marca === 'salvo' ? 'O roteiro está salvo' : gravacao === 'sem-conexao' ? 'Sem conexão: o que você escreveu vai quando ela voltar' : undefined}>
            <BolinhaDeEstado estado={marca === 'salvo' ? 'salvou' : marca === 'erro' ? 'arquivada' : 'salvando'} />
            {marca === 'salvo' ? 'salvo' : gravacao === 'sem-conexao' ? 'sem conexão' : marca === 'erro' ? 'não salvou' : 'salvando'}
          </span>
        ) : (
          <span className="escrita-so-lendo-curto">só lendo</span>
        )}
        <span className="espaco" />
        {/* #192: comentar o trecho selecionado (também Ctrl+Alt+M), para toda pessoa que lê o roteiro */}
        <button
          type="button"
          className="botao escrita-comentar"
          title={`Comentar o trecho selecionado (${ATALHO_DE_COMENTAR})`}
          aria-keyshortcuts="Control+Alt+M"
          // o clique não tira a seleção do texto
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setPedidoDeComentario((n) => n + 1)}
        >
          <Icone nome="comentario" tam={14} traco={2} />
          <span className="escrita-comentar-nome">Comentar</span>
          {abertos > 0 && <span className="escrita-comentar-conta" aria-label={`${abertos} abertos`}>{abertos}</span>}
        </button>
        {/* quem mais está no roteiro agora (#191): as bolinhas da mesma peça da prévia, com as iniciais na cor de cada um */}
        <span className="escrita-presentes" aria-live="polite">
          <Presentes pessoas={presentes} texto />
        </span>
        {meu ? (
          <span className="compartilhar escrita-visibilidade" ref={caixaDoPainel}>
            <button type="button" className={`visibilidade ${publico ? 'publico' : ''}`} aria-haspopup="dialog" aria-expanded={compartilhando} onClick={() => setCompartilhando((v) => !v)}>
              <Icone nome={publico ? 'olho' : 'cadeado'} tam={14} traco={2} />
              <span className="visibilidade-nome">{visibilidade}</span>
            </button>
            {compartilhando && <Compartilhar escrito publico={publico} pessoas={pessoas} mudar={compartilhar} />}
          </span>
        ) : (
          <span className={`escrita-visivel ${publico ? 'publico' : ''}`}>
            <Icone nome={publico ? 'olho' : 'cadeado'} tam={14} traco={2} /> {publico ? 'Visível para a equipe' : 'Fechado'}
          </span>
        )}
        {/* #194: o Enviar (e o Ctrl+Enter) entra aqui, na ponta */}
      </div>
      {!escreve && (
        <p className="escrita-so-lendo" role="status">
          <Icone nome="olho" tam={15} traco={2} />
          <span>
            Você está <b>só lendo</b>: quem escreve é {autor || 'o redator'} e quem {autor ? 'ele ou ela' : 'ele'} convidar. Selecione um trecho para comentar.
          </span>
        </p>
      )}
      <main className="escrita">
        <article data-visao={visao} className={`folha-escrita${limpo ? ' limpo' : ''}${vazia ? ' vazia' : ''}${escreve ? '' : ' so-leitura'}${liberado ? '' : ' chegando'}`} aria-label="Roteiro sendo escrito" aria-busy={!liberado}>
          <header className="folha-escrita-cabeca">
            <p className="folha-escrita-sobre">
              Roteiro <span aria-hidden="true">·</span> sendo escrito
            </p>
            <textarea
              ref={titulo}
              className="folha-escrita-titulo"
              rows={1}
              value={meta.titulo}
              placeholder="Título do roteiro"
              aria-label="Título do roteiro"
              readOnly={!escreve || !liberado}
              spellCheck
              lang="pt-BR"
              onChange={(e) => mudarTitulo(e.target.value)}
              onKeyDown={(e) => {
                // Enter e a seta para baixo levam ao texto, como no fim de uma linha
                if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.currentTarget.selectionStart === e.currentTarget.value.length)) {
                  e.preventDefault();
                  editor?.commands.focus('start');
                }
              }}
            />
            <p className="folha-escrita-quem">
              {autor && <span>por {autor}</span>}
              {inicial.criadoEm && (
                <span>
                  <span aria-hidden="true"> · </span>{quandoComecou(inicial.criadoEm)}
                </span>
              )}
            </p>
            {/* ver (#193): Texto | Colunas, o modo limpo e o .docx igual a ele */}
            <div className="escrita-ver" role="toolbar" aria-label="Ver o roteiro">
              <div className="segmento" role="radiogroup" aria-label="Texto ou colunas">
                <button type="button" role="radio" aria-checked={visao === 'texto'} onClick={() => trocarVisao('texto')} title="O texto corrido">
                  <Icone nome="corrido" tam={14} traco={2} /> Texto
                </button>
                <button type="button" role="radio" aria-checked={visao === 'colunas'} onClick={() => trocarVisao('colunas')} title="Vídeo | áudio, como roteiro de TV">
                  <Icone nome="colunas" tam={14} traco={2} /> Colunas
                </button>
              </div>
              <button type="button" className="botao escrita-ver-limpo" aria-pressed={limpo} onClick={alternarLimpo} title={`Só a folha, com a cara do .docx (${atalho('Mod-Shift-l')})`}>
                <Icone nome="arquivo" tam={14} traco={2} /> Limpo
              </button>
              <button type="button" className="botao-texto escrita-ver-docx" onClick={() => void baixarDocx()} title={`Baixa o .docx igual ao modo limpo, em ${visao === 'colunas' ? 'colunas' : 'texto'}`}>
                <Icone nome="baixar" tam={14} traco={2} /> .docx
              </button>
            </div>
          </header>
          {/* a margem fica à esquerda do texto, com o tipo de cada trecho (e o "?" do palpite, #190); os balões de
              comentário (#192) ficam à direita */}
          <div className="folha-escrita-corpo" data-margem="tipos" ref={corpo}>
            {visao === 'colunas' && (
              <div className="cabeca-das-colunas" aria-hidden="true">
                <span>Vídeo</span>
                <span>Áudio</span>
              </div>
            )}
            <EditorContent editor={editor} />
            {/* #195: na folha vazia, começar de um arquivo ou de um texto colado */}
            {escreve && <ComecarNaFolha corpo={corpo} vazia={vazia} pode={liberado && !!editor} receber={receberDeFora} falhou={avisar} />}
            <ComentariosDaFolha id={inicial.id} editor={editor} eu={pessoa} avisar={avisar} pedido={pedidoDeComentario} contar={setAbertos} />
            {editor && <EscritaNaFolha editor={editor} escreve={escreve} ponte={ponte} arteAberta={arteAberta} abrirArte={setArteAberta} />}
          </div>
        </article>
        {/* ao lado da folha: a lista das artes (#190) */}
        <aside className="escrita-lado" aria-label="Ao lado do roteiro">
          {editor && <ArtesDaEscrita editor={editor} escreve={escreve} arteAberta={arteAberta} abrirArte={setArteAberta} />}
        </aside>
      </main>
      {editor && <RodapeDaEscrita editor={editor} />}
    </div>
  );
}
