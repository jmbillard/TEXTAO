import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import History from '@tiptap/extension-history';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { armazenamento, type Leitura } from '../dados/armazenamento';
import { abrirSala, corDe } from '../dados/colaboracao';
import { extensoesDoRoteiro, prepararColagem, Teclado } from '../editor/extensoes';
import { Escrita, type PonteDaEscrita } from '../editor/escrita';
import { metaVazia, type Meta, type Pessoa, type Roteiro } from '../modelo/tipos';
import { casoDaLeitura, LinkQuebrado } from './LinkQuebrado';
import { Compartilhar, type Convite } from './Compartilhar';
import { ComentariosDaFolha } from './ComentariosDaFolha';
import { ComentariosNoTexto } from '../editor/comentarios';
import { ArtesDaEscrita, EscritaNaFolha, RodapeDaEscrita } from './EscritaNaFolha';
import { BolinhaDeEstado } from './pecas';
import { Icone } from './icones';
import { ATALHO_DE_COMENTAR, atalho, quandoComecou } from './util';
import { Presentes } from './Filmes';
import { useSalaDaEscrita } from './salaDaEscrita';
import { EnviosDaEscrita, PainelDoEnviar } from './EnviarDaEscrita';
import type { EnvioDoEscrito, EnvioFeito } from '../dados/armazenamento';
import type { ClaqueteConferida } from '../modelo/enviar';
import { letraEVersaoDoRoteiro, marcaDaLetraEVersao } from '../modelo/letraEVersao';
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
   sala e a presença no topo (#191), os comentários (#192), Texto/Colunas e o modo limpo (#193) e o Enviar (#194). */

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
  /** o Enviar (#194): o caminho da fila (App), com a claquete conferida no painel */
  enviar?: EnviarDaFolha;
}
/** O Enviar da folha (#194): o roteiro como está, a claquete conferida, o motivo e, no reenvio, a resposta da liberação. */
export type EnviarDaFolha = (escrito: Roteiro, conferida: ClaqueteConferida, opcoes: { motivo: string; liberada?: boolean; jaEnviado: boolean }) => Promise<EnvioFeito>;

export function TelaDeEscrita({ id, voltar, abrirNaRevisao, avisar, pessoa, topo, enviar }: Props) {
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
  return <Folha key={leitura.roteiro.id} inicial={leitura.roteiro} voltar={voltar} avisar={avisar} pessoa={pessoa} topo={topo} enviar={enviar} />;
}

/** O que a folha salva agora. */
type Salvamento = 'salvo' | 'salvando' | 'erro';

function Folha({ inicial, voltar, avisar, pessoa, topo, enviar }: { inicial: Roteiro; voltar: () => void; avisar: (t: string) => void; pessoa?: Pessoa; topo: ReactNode; enviar?: EnviarDaFolha }) {
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
  // o Ctrl+Enter do Enviar (#194), à parte da ponte que a margem preenche
  const enviarPelaTecla = useRef<PonteDaEscrita['enviar']>(undefined);
  const [arteAberta, setArteAberta] = useState<string | null>(null);
  // a sala ao vivo (#191): só existe com o servidor; o exemplo do tour não chega aqui (ele não é escrito no PROMeiro)
  // quem só lê o roteiro que nunca teve sala (o salvo antes do #191) lê o texto guardado, sem esperar quem escreve (#194)
  const [sala] = useState(() => (armazenamento.tipo === 'servidor' && !inicial.semSala ? abrirSala(inicial.id) : null));
  // o Enviar (#194): o estado do escrito, o último envio, o painel aberto (e o botão de onde ele cresce)
  const [estadoDoEscrito, setEstadoDoEscrito] = useState(inicial.escrito ?? 'sendo-escrito');
  const [ultimoEnvio, setUltimoEnvio] = useState<EnvioDoEscrito | null>(null);
  const [vezDosEnvios, setVezDosEnvios] = useState(0);
  const [enviando, setEnviando] = useState<Roteiro | null>(null);
  const botaoEnviar = useRef<HTMLButtonElement>(null);

  const editor = useEditor({
    extensions: [
      ...extensoesDoRoteiro(),
      // o teclado da escrita (#190) vem antes do da revisão: o "/", o Tab nos tipos, o Ctrl+U no trecho, as fichas
      Escrita.configure({ ponte: () => ({ ...ponte.current, enviar: enviarPelaTecla.current }), programa: () => estado.current.meta.programa }),
      Teclado.configure({ programa: () => estado.current.meta.programa }),
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

  // o Enviar (#194): o botão e o Ctrl+Enter abrem o painel com o roteiro como está agora
  const podeEnviar = escreve && !!enviar && armazenamento.tipo === 'servidor';
  const abrirEnviar = useCallback(() => {
    if (podeEnviar && liberado) setEnviando(roteiroAtual());
  }, [podeEnviar, liberado, roteiroAtual]);
  // no texto, a tecla chega pela ponte da escrita (antes da quebra de linha do editor); fora dele, pela janela
  enviarPelaTecla.current = podeEnviar && !enviando ? () => (abrirEnviar(), true) : undefined;
  useEffect(() => {
    if (!podeEnviar || enviando) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.defaultPrevented) return;
      e.preventDefault();
      abrirEnviar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [podeEnviar, enviando, abrirEnviar]);
  const aoEnviar = (feito: EnvioFeito) => {
    setEstadoDoEscrito('enviado');
    // a claquete, a letra e a versão são do envio; o resto da meta continua o da folha
    const { claquete, programa, tipoPrograma, dataExibicao, editor: ed, letra, versao, status } = feito.escrito.meta;
    setMeta((m) => ({ ...m, claquete, programa, tipoPrograma, dataExibicao, editor: ed, letra, versao, status }));
    setVezDosEnvios((n) => n + 1);
    const marca = marcaDaLetraEVersao(feito.envio) || 'V1';
    avisar(feito.substituiu ? `${feito.envio.claquete} · ${marca} está na fila, no lugar do envio anterior${feito.cardHerdado ? ', com o card dele' : ''}.` : `${feito.envio.claquete} está na fila da arte.`);
  };

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
        {/* #194: o Enviar (e o Ctrl+Enter), na ponta */}
        {podeEnviar && (
          <button type="button" ref={botaoEnviar} className="botao primario escrita-enviar" disabled={!liberado} aria-keyshortcuts="Control+Enter" title={`${estadoDoEscrito === 'enviado' ? 'Enviar a versão nova' : 'Enviar para a fila'} (${atalho('Mod-Enter')})`} onClick={abrirEnviar}>
            <Icone nome="subir" tam={14} traco={2} />
            <span className="escrita-enviar-nome">Enviar</span>
          </button>
        )}
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
        <article className={`folha-escrita${vazia ? ' vazia' : ''}${escreve ? '' : ' so-leitura'}${liberado ? '' : ' chegando'}`} aria-label="Roteiro sendo escrito" aria-busy={!liberado}>
          <header className="folha-escrita-cabeca">
            <p className="folha-escrita-sobre">
              Roteiro <span aria-hidden="true">·</span> {estadoDoEscrito === 'enviado' ? <>enviado <span aria-hidden="true">·</span> <span className="folha-escrita-claquete">{meta.claquete}{marcaDaLetraEVersao(letraEVersaoDoRoteiro(meta)) ? ` ${marcaDaLetraEVersao(letraEVersaoDoRoteiro(meta))}` : ''}</span></> : 'sendo escrito'}
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
          {/* a margem fica à esquerda do texto, com o tipo de cada trecho (e o "?" do palpite, #190); os balões de
              comentário (#192) ficam à direita */}
          <div className="folha-escrita-corpo" data-margem="tipos">
            <EditorContent editor={editor} />
            <ComentariosDaFolha id={inicial.id} editor={editor} eu={pessoa} avisar={avisar} pedido={pedidoDeComentario} contar={setAbertos} />
            {editor && <EscritaNaFolha editor={editor} escreve={escreve} ponte={ponte} arteAberta={arteAberta} abrirArte={setArteAberta} />}
          </div>
        </article>
        {/* ao lado da folha: a lista das artes (#190) */}
        <aside className="escrita-lado" aria-label="Ao lado do roteiro">
          {/* o andamento da arte e os envios (#194), depois do primeiro Enviar */}
          {estadoDoEscrito === 'enviado' && <EnviosDaEscrita id={inicial.id} vez={vezDosEnvios} aoLer={(e) => setUltimoEnvio(e.envios[0] ?? null)} />}
          {editor && <ArtesDaEscrita editor={editor} escreve={escreve} arteAberta={arteAberta} abrirArte={setArteAberta} />}
        </aside>
      </main>
      {editor && <RodapeDaEscrita editor={editor} />}
      {enviando && enviar && (
        <PainelDoEnviar
          origem={botaoEnviar.current}
          escrito={enviando}
          // o último envio ainda não lido: a letra e a versão que a folha já sabe
          ultimo={estadoDoEscrito === 'enviado' ? (ultimoEnvio ?? { n: 0, em: '', por: { nome: '', email: '' }, motivo: '', claquete: meta.claquete, ...letraEVersaoDoRoteiro(meta) }) : null}
          comentariosAbertos={abertos}
          enviar={(conferida, opcoes) => enviar(enviando, conferida, { ...opcoes, jaEnviado: estadoDoEscrito === 'enviado' })}
          aoEnviar={aoEnviar}
          fechar={() => setEnviando(null)}
        />
      )}
    </div>
  );
}
