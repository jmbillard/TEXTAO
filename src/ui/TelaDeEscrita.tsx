import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import History from '@tiptap/extension-history';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { armazenamento, type Leitura } from '../dados/armazenamento';
import { abrirSala, corDe } from '../dados/colaboracao';
import { extensoesDoRoteiro, prepararColagem, Teclado } from '../editor/extensoes';
import { metaVazia, type Meta, type Pessoa, type Roteiro } from '../modelo/tipos';
import { casoDaLeitura, LinkQuebrado } from './LinkQuebrado';
import { Compartilhar, type Convite } from './Compartilhar';
import { BolinhaDeEstado } from './pecas';
import { Icone } from './icones';
import { quandoComecou } from './util';
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

   Os ganchos dos próximos tickets ficam marcados: a margem dos tipos e o "/" (#190), a sala e a presença no topo
   (#191), os comentários (#192), Texto/Colunas e o modo limpo (#193) e o Enviar (#194). */

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
  // a sala ao vivo (#191): só existe com o servidor; o exemplo do tour não chega aqui (ele não é escrito no PROMeiro)
  const [sala] = useState(() => (armazenamento.tipo === 'servidor' ? abrirSala(inicial.id) : null));

  const editor = useEditor({
    extensions: [
      ...extensoesDoRoteiro(),
      // Ctrl+U marca a arte, como na revisão; o resto do teclado da escrita (o "/", Tab nos tipos) chega no #190
      Teclado.configure({ programa: () => estado.current.meta.programa }),
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
  }, [meta.titulo]);

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
    <div className="pagina pagina-escrita">
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
            Você está <b>só lendo</b>: quem escreve é {autor || 'o redator'} e quem {autor ? 'ele ou ela' : 'ele'} convidar.
          </span>
        </p>
      )}
      <main className="escrita">
        <article className={`folha-escrita${vazia ? ' vazia' : ''}${escreve ? '' : ' so-leitura'}${liberado ? '' : ' chegando'}`} aria-label="Roteiro sendo escrito" aria-busy={!liberado}>
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
            {/* #193: Texto/Colunas e o modo limpo entram aqui, embaixo do título */}
          </header>
          {/* a margem fica à esquerda do texto: é nela que o #190 põe o tipo de cada trecho (com o "?" do palpite); os
              balões de comentário (#192) ficam à direita */}
          <div className="folha-escrita-corpo" data-margem="tipos">
            <EditorContent editor={editor} />
          </div>
        </article>
      </main>
    </div>
  );
}
