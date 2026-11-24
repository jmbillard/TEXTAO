import { useCallback, useEffect, useRef, useState } from "react";
import {
  abrirPrevia,
  avisarNaPrevia,
  enviarPrevia,
  imagemDaPagina,
  listarPrevias,
  mudarFilme,
  posterDoFilme,
  relerPagina,
  sairDaPrevia,
  type FilmeLido,
  type MudancaNoFilme,
  type PaginaDaPrevia,
  type PessoaNaPrevia,
  type Previa,
  type PreviaNaLista,
} from "../dados/armazenamento";
import { corDe } from "../dados/colaboracao";
import { montarFileiras, podeSubir, type ItemDaFileira } from "../filmes/fileiras";
import { Icone } from "./icones";
import { Marca } from "./pecas";

/* A aba Filmes: as prévias de filmes. Solta-se o PDF, o navegador prepara as páginas e o servidor lê cada uma
   com a IA (dá para fechar a aba). Em cada página, os cards em cima, alinhados com os pôsteres (identidade
   própria em cima, Sessão da Tarde embaixo), e a página grande embaixo. Cada card tem uma marca só, da conferência
   com o banco: ✓ pronto, ! pede atenção (abre o balão com a pergunta) ou o Trello (já tem card). O filme que a leitura
   pôs por engano na Sessão da Tarde deixa "???" na vaga do pôster dele em cima: arrastado até lá, ele pede a sessão,
   a da coluna dele na página primeiro (só de baixo para cima). O Enviar, o mesmo do editor de roteiros, manda os
   prontos de toda a prévia; o que der erro mostra o motivo e vai no próximo Enviar.
   Várias pessoas na mesma prévia: cada tela avisa o servidor a cada poucos segundos (e diz o card em que mexe) e
   reabre a prévia só quando a versão dela muda. O card em que outra pessoa mexe fica com o título grifado na cor
   dela e a rubrica do nome, como na fila. Não há trava: vale a última mudança. */

interface Props {
  aberta?: string;
  abrir: (id?: string) => void;
  voltar: () => void;
  avisar: (t: string) => void;
}

// a página que ainda não chegou (a aba fechou no meio da subida) não está sendo lida: não adianta esperar
const lendo = (p: PaginaDaPrevia) =>
  p.estado === "fila" || p.estado === "lendo";
/** Vai no próximo Enviar: pronto (✓) e ainda não mandado (o que deu erro vai de novo). Os de identidade própria
    ganham um card cada; os da Sessão da Tarde, o card da semana. */
const vaiNoEnvio = (f: FilmeLido) =>
  f.conferencia?.marca === "ok" &&
  f.envio?.estado !== "enviando" &&
  f.envio?.estado !== "enviado";
/** De quanto em quanto tempo a prévia aberta avisa que está ali e pergunta se mudou (e a lista, quem está em cada uma). */
const BATIDA_MS = 2500;
const LISTA_MS = 5000;
const primeiro = (nome: string) => nome.split(/\s+/)[0];
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join("")
    .toUpperCase();
/** "Ana tá vendo", "Ana e Bruno tão vendo", "Ana e mais 2 tão vendo". */
const taoVendo = (pessoas: { nome: string }[]) =>
  `${pessoas.length <= 2 ? pessoas.map((p) => primeiro(p.nome)).join(" e ") : `${primeiro(pessoas[0].nome)} e mais ${pessoas.length - 1}`} ${pessoas.length === 1 ? "tá vendo" : "tão vendo"}`;

/** Quem mais está na prévia: as bolinhas com as iniciais, na cor de cada um. */
function Presentes({ pessoas, texto }: { pessoas: PessoaNaPrevia[]; texto?: boolean }) {
  if (!pessoas.length) return null;
  return (
    <span
      className="na-fila"
      title={`Também nesta prévia: ${pessoas.map((c) => c.nome).join(", ")}`}
    >
      {pessoas.slice(0, 5).map((c) => (
        <span key={c.email} className="presente" style={{ background: corDe(c.email) }}>
          {iniciais(c.nome)}
        </span>
      ))}
      {pessoas.length > 5 && <span className="presente mais">+{pessoas.length - 5}</span>}
      {texto && (
        <span className="na-fila-texto">
          {pessoas.length === 1 ? `${primeiro(pessoas[0].nome)} também está aqui` : `mais ${pessoas.length} aqui`}
        </span>
      )}
    </span>
  );
}

/** O card abre o balão: a pergunta do ! ou o motivo do erro no envio. */
const temBalao = (f?: FilmeLido) =>
  !!f?.conferencia?.pergunta || f?.envio?.estado === "erro";

export function Filmes({ aberta, abrir, voltar, avisar }: Props) {
  return (
    <div className="pagina filmes">
      <header className="cad-topo">
        <button
          className="voltar-cad"
          onClick={aberta ? () => abrir() : voltar}
        >
          <Icone nome="voltar" tam={16} /> {aberta ? "Prévias" : "Fila"}
        </button>
        <Marca />
        <span />
      </header>
      {aberta ? (
        <PreviaAberta id={aberta} avisar={avisar} />
      ) : (
        <ListaDePrevias abrir={abrir} avisar={avisar} />
      )}
    </div>
  );
}

function ListaDePrevias({
  abrir,
  avisar,
}: {
  abrir: (id: string) => void;
  avisar: (t: string) => void;
}) {
  const [previas, setPrevias] = useState<PreviaNaLista[] | null>(null);
  const [subindo, setSubindo] = useState<{
    nome: string;
    feito: number;
    total: number;
  } | null>(null);
  const [soltando, setSoltando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  useEffect(() => {
    listarPrevias().then(
      setPrevias,
      (e: Error) => (setPrevias([]), avisar(e.message)),
    );
    // quem está em cada prévia: a lista pergunta de novo de tempos em tempos (barato: não consulta o banco)
    const t = setInterval(
      () => void listarPrevias().then(setPrevias, () => {}),
      LISTA_MS,
    );
    return () => clearInterval(t);
  }, [avisar]);

  const subir = async (arquivo?: File) => {
    if (!arquivo) return;
    if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== "application/pdf")
      return avisar("A prévia é um PDF.");
    setSubindo({ nome: arquivo.name, feito: 0, total: 0 });
    try {
      const { subirPrevia } = await import("../filmes/preparar");
      const id = await subirPrevia(arquivo, (feito, total) =>
        setSubindo({ nome: arquivo.name, feito, total }),
      );
      abrir(id);
    } catch (e) {
      avisar(
        `Não deu para subir a prévia: ${e instanceof Error ? e.message : e}`,
      );
      setSubindo(null);
    }
  };

  return (
    <main
      className="filmes-inicio"
      onDragOver={(e) => (e.preventDefault(), setSoltando(true))}
      onDragLeave={() => setSoltando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSoltando(false);
        void subir(e.dataTransfer.files[0]);
      }}
    >
      <h1>Filmes</h1>
      <button
        className={`solta-previa ${soltando ? "soltando" : ""}`}
        onClick={() => entrada.current?.click()}
        disabled={!!subindo}
      >
        {subindo ? (
          <>
            <strong>Preparando {subindo.nome}</strong>
            <span>
              {subindo.total
                ? `página ${Math.min(subindo.feito + 1, subindo.total)} de ${subindo.total}`
                : "abrindo o PDF…"}
            </span>
          </>
        ) : (
          <>
            <strong>Solte aqui o PDF da prévia</strong>
            <span>ou escolha o arquivo</span>
          </>
        )}
      </button>
      <input
        ref={entrada}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(e) => void subir(e.target.files?.[0])}
      />
      {previas?.map((p) => (
        <button key={p.id} className="ficha-previa" onClick={() => abrir(p.id)}>
          <b>{p.nome.replace(/\.pdf$/i, "").replaceAll("_", " ")}</b>
          <span className="some">
            {p.paginas} {p.paginas === 1 ? "página" : "páginas"} · subida por{" "}
            {p.por || "—"} em {new Date(p.criada).toLocaleDateString("pt-BR")}
          </span>
          {!!p.pessoas?.length && (
            <span
              className="ficha-previa-gente"
              style={{ "--cor": corDe(p.pessoas[0].email) } as React.CSSProperties}
            >
              <Presentes pessoas={p.pessoas} />
              <span className="rubrica agora">{taoVendo(p.pessoas)}</span>
            </span>
          )}
        </button>
      ))}
    </main>
  );
}

function PreviaAberta({
  id,
  avisar,
}: {
  id: string;
  avisar: (t: string) => void;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [pag, setPag] = useState(0);
  const [destaque, setDestaque] = useState<number | null>(null);
  const [mandando, setMandando] = useState(false);
  // quem mais está na prévia, e o card em que eu estou mexendo (vai no aviso, para os outros verem)
  const [pessoas, setPessoas] = useState<PessoaNaPrevia[]>([]);
  const [meuCard, setMeuCard] = useState<{ numero: number; i: number } | null>(null);
  // a versão da prévia que está na tela; uma reabertura por vez
  const versaoNaTela = useRef<string | undefined>(undefined);
  const reabrindo = useRef<Promise<void> | null>(null);
  const carregar = useCallback(
    () =>
      (reabrindo.current ??= abrirPrevia(id)
        .then(
          (p) => {
            versaoNaTela.current = p.versao;
            setPrevia(p);
            if (p.erroDaConferencia)
              avisar(`Não consegui conferir com o banco: ${p.erroDaConferencia}`);
          },
          (e: Error) => avisar(e.message),
        )
        .finally(() => (reabrindo.current = null))),
    [id, avisar],
  );
  // a mudança grava na hora; o filme volta conferido de novo e entra no lugar do antigo
  const mudar = useCallback(
    (numero: number, i: number, m: MudancaNoFilme) =>
      mudarFilme(id, numero, i, m).then(
        ({ filme, erroDaConferencia }) => {
          setPrevia((p) =>
            p && {
              ...p,
              paginas: p.paginas.map((g) =>
                g.numero === numero
                  ? { ...g, filmes: g.filmes.map((f, k) => (k === i ? filme : f)) }
                  : g,
              ),
            },
          );
          if (erroDaConferencia)
            avisar(`Não consegui conferir com o banco: ${erroDaConferencia}`);
        },
        (e: Error) => avisar(e.message),
      ),
    [id, avisar],
  );
  useEffect(() => void carregar(), [carregar]);
  // a batida: a cada poucos segundos a tela avisa que está aqui (com o card em que mexe) e fica sabendo quem mais
  // está; a prévia só é reaberta (com a conferência no banco) quando a versão dela muda: a leitura de uma página,
  // o envio ou a mudança de outra pessoa
  const cardAgora = useRef(meuCard);
  cardAgora.current = meuCard;
  const bater = useRef<() => void>(() => {});
  useEffect(() => {
    let vivo = true;
    let prazo = 0;
    const umaBatida = async () => {
      try {
        const r = await avisarNaPrevia(id, cardAgora.current);
        if (!vivo) return;
        setPessoas(r.pessoas);
        if (versaoNaTela.current !== undefined && r.versao !== versaoNaTela.current)
          void carregar();
      } catch {
        // sem servidor por um instante: tenta na próxima batida
      }
      // uma batida fora de hora (mudou o card) não abre um segundo relógio: fica só o último
      window.clearTimeout(prazo);
      if (vivo) prazo = window.setTimeout(umaBatida, BATIDA_MS);
    };
    bater.current = () => void umaBatida();
    void umaBatida();
    const sair = () => sairDaPrevia(id);
    window.addEventListener("pagehide", sair);
    return () => {
      vivo = false;
      window.clearTimeout(prazo);
      window.removeEventListener("pagehide", sair);
      sair();
    };
  }, [id, carregar]);
  // mexi em outro card: os outros ficam sabendo já, sem esperar a próxima batida
  useEffect(() => bater.current(), [meuCard?.numero, meuCard?.i]);
  const algumEnviando = !!previa?.paginas.some((g) =>
    g.filmes.some((f) => f.envio?.estado === "enviando"),
  );
  const enviar = async () => {
    if (mandando) return;
    setMandando(true);
    try {
      await enviarPrevia(id);
      await carregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e));
    } finally {
      setMandando(false);
    }
  };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (
        !previa ||
        (e.target as HTMLElement)?.isContentEditable ||
        (e.target as HTMLElement)?.tagName === "INPUT"
      )
        return;
      if (e.key === "ArrowRight")
        setPag((n) => Math.min(previa.paginas.length - 1, n + 1));
      if (e.key === "ArrowLeft") setPag((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [previa]);
  if (!previa) return <main className="previa" />;
  const p = previa.paginas[Math.min(pag, previa.paginas.length - 1)];
  const algumPronto = previa.paginas.some(
    (g) => g.estado === "lida" && g.filmes.some(vaiNoEnvio),
  );
  const envioLigado = previa.envio?.ligado !== false;

  return (
    <main className="previa">
      <div className="previa-cab">
        <h1>
          {previa.nome
            .replace(/\.pdf$/i, "")
            .replaceAll("_", " ")
            .toUpperCase()}
        </h1>
        <nav className="previa-paginas" aria-label="Páginas da prévia">
          <button
            className="seta"
            disabled={pag === 0}
            onClick={() => setPag(pag - 1)}
            aria-label="Página anterior"
          >
            ‹
          </button>
          {previa.paginas.map((g, i) => (
            <button
              key={g.numero}
              className={`bolinha ${i === pag ? "atual" : ""}`}
              onClick={() => setPag(i)}
              title={`Página ${g.util}`}
              aria-label={`Página ${g.util}`}
            />
          ))}
          <button
            className="seta"
            disabled={pag >= previa.paginas.length - 1}
            onClick={() => setPag(pag + 1)}
            aria-label="Próxima página"
          >
            ›
          </button>
        </nav>
        <Presentes pessoas={pessoas} texto />
        <button
          className="botao primario enviar-previa"
          disabled={!envioLigado || !algumPronto || mandando || algumEnviando}
          title={
            !envioLigado
              ? `O envio está desligado: falta ${previa.envio?.faltando.join(", ")}`
              : "Cria no Trello os cards dos filmes prontos de toda a prévia"
          }
          onClick={() => void enviar()}
        >
          <Icone nome="quadro" tam={15} traco={2.2} />
          {mandando || algumEnviando ? "Mandando…" : "Enviar"}
        </button>
      </div>
      <Pagina
        key={p.numero}
        previaId={previa.id}
        p={p}
        mudar={(i, m) => mudar(p.numero, i, m)}
        destaque={destaque}
        destacar={setDestaque}
        outros={pessoas}
        mexer={setMeuCard}
        reler={() =>
          relerPagina(previa.id, p.numero).then(carregar, (e: Error) =>
            avisar(e.message),
          )
        }
      />
    </main>
  );
}

function Pagina({
  previaId,
  p,
  destaque,
  destacar,
  outros,
  mexer,
  reler,
  mudar,
}: {
  previaId: string;
  p: PaginaDaPrevia;
  destaque: number | null;
  destacar: (i: number | null) => void;
  /** quem mais está na prévia, com o card em que mexe */
  outros: PessoaNaPrevia[];
  /** o card em que esta pessoa está mexendo (o título sendo corrigido, o balão aberto ou o arrasto) */
  mexer: (card: { numero: number; i: number } | null) => void;
  reler: () => void;
  mudar: (i: number, m: MudancaNoFilme) => Promise<void>;
}) {
  const f = montarFileiras(p);
  // o card com o balão do ! aberto (o índice do filme na página)
  const [aberto, setAberto] = useState<number | null>(null);
  // o filme da Sessão da Tarde sendo arrastado para a vaga dele em cima, e o título sendo editado (não arrasta)
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const mexendo = editando ?? aberto ?? arrastando;
  useEffect(
    () => mexer(mexendo === null ? null : { numero: p.numero, i: mexendo }),
    [mexer, mexendo, p.numero],
  );
  const subir = (i: number) => {
    setArrastando(null);
    if (podeSubir(p, i)) void mudar(i, { subir: true }).then(() => setAberto(i));
  };
  const balao = aberto !== null && temBalao(p.filmes[aberto]);
  useEffect(() => {
    if (aberto !== null && !balao) setAberto(null);
  }, [aberto, balao]);
  const pos = (x: number) => ({
    left: `${x * 100}%`,
    width: `${f.largura * 100}%`,
  });
  const card = (it: ItemDaFileira, baixo: boolean) => {
    if (it.tipo === "vaga")
      return (
        <div key={`v${it.i}`} className="cartao-filme vaga" style={pos(it.x)}>
          <span className="mao">{it.texto?.toLowerCase()}</span>
        </div>
      );
    if (it.tipo === "lugar")
      return (
        <div
          key={`l${it.i}`}
          className={`cartao-filme vaga lugar ${arrastando === it.i ? "alvo" : ""}`}
          style={pos(it.x)}
          aria-label={`A vaga de ${it.filme!.titulo || "um filme"}`}
        >
          <span className="mao">???</span>
        </div>
      );
    const filme = it.filme!;
    const sobe = baixo && podeSubir(p, it.i);
    // outra pessoa mexendo neste card: o título grifado na cor dela e a rubrica do nome, dentro do card
    const ali = outros.filter((o) => o.card?.numero === p.numero && o.card?.i === it.i);
    const titulo = (
      <Titulo
        filme={filme}
        gravar={(titulo) => mudar(it.i, { titulo })}
        aoEditar={(sim) => setEditando((e) => (sim ? it.i : e === it.i ? null : e))}
      />
    );
    const rubrica = ali.length > 0 && (
      <span className="rubrica agora" title={`${ali.map((o) => o.nome).join(", ")} mexendo neste filme agora`}>
        {taoVendo(ali)}
      </span>
    );
    const poster =
      filme.poster !== null
        ? imagemDaPagina(previaId, p.numero, filme.poster + 1)
        : "";
    return (
      <div
        key={`f${it.i}`}
        className={`cartao-filme ${baixo ? "baixo" : ""} ${sobe ? "sobe" : ""} ${arrastando === it.i ? "arrastando" : ""} ${destaque === filme.poster && filme.poster !== null ? "destaque" : ""} ${aberto === it.i ? "aberto" : ""} ${ali.length ? "ocupado" : ""}`}
        style={
          ali.length
            ? ({ ...pos(it.x), "--cor": corDe(ali[0].email) } as React.CSSProperties)
            : pos(it.x)
        }
        onMouseEnter={() => destacar(filme.poster)}
        onMouseLeave={() => destacar(null)}
        draggable={sobe && editando === null}
        onDragStart={
          sobe
            ? (e) => {
                e.dataTransfer.setData("text/plain", String(it.i));
                e.dataTransfer.effectAllowed = "move";
                setAberto(null);
                setArrastando(it.i);
              }
            : undefined
        }
        onDragEnd={sobe ? () => setArrastando(null) : undefined}
      >
        {poster ? (
          <img className="cf-poster" src={poster} alt="" />
        ) : (
          <span className="cf-poster sem" />
        )}
        {baixo ? (
          <div className="cf-corpo">
            {titulo}
            {rubrica}
          </div>
        ) : (
          <div className="cf-corpo">
            {filme.sessao ? (
              <span className="cf-sessao">{filme.sessao}</span>
            ) : (
              <span className="cf-sessao falta">sessão: ???</span>
            )}
            {titulo}
            {rubrica}
            <span className="cf-linha">
              {filme.conferencia?.ano ?? filme.ano ?? "—"}{" "}
              <span>{filme.data.slice(0, 5)}</span>
              {filme.inedito && <b className="cf-inedito">INÉDITO</b>}
            </span>
          </div>
        )}
        <MarcaDoFilme
          filme={filme}
          aberto={aberto === it.i}
          alternar={() => setAberto(aberto === it.i ? null : it.i)}
        />
        {aberto === it.i && temBalao(filme) && (
          <Balao
            filme={filme}
            fechar={() => setAberto(null)}
            mudar={(m) => mudar(it.i, m)}
          />
        )}
      </div>
    );
  };
  const pronta = p.estado === "lida";
  return (
    <>
      {pronta ? (
        <div className="fileiras">
          <div
            className="fileira cima"
            onDragOver={(e) => {
              if (arrastando !== null) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (arrastando !== null) subir(arrastando);
            }}
          >
            {f.cima.map((it) => card(it, false))}
          </div>
          <div className="fileira baixo">
            {f.baixo.map((it) => card(it, true))}
          </div>
        </div>
      ) : p.estado === "esperando" ? (
        <div className="pagina-erro">
          <span>
            Esta página não chegou ao servidor (a aba fechou no meio da subida).
            Solte o mesmo PDF de novo na lista de prévias: só sobe o que falta.
          </span>
        </div>
      ) : p.estado === "erro" ? (
        <div className="pagina-erro">
          <span>A leitura desta página deu erro: {p.erro}</span>
          <button className="botao" onClick={reler}>
            Ler de novo
          </button>
        </div>
      ) : (
        <div className="fileiras esperando" aria-label="Lendo esta página">
          <div className="fileira cima" />
          <div className="fileira baixo" />
        </div>
      )}
      <div className="folha-previa">
        <div className="folha-dentro">
          {p.estado !== "esperando" ? (
            <img
              src={imagemDaPagina(previaId, p.numero)}
              alt={`Página ${p.util} da prévia`}
            />
          ) : (
            <div className="folha-vazia" />
          )}
          {lendo(p) && <div className="lendo-pagina" />}
          {pronta &&
            p.tamanho &&
            p.posteres.map(({ caixa: c }, i) => (
              <span
                key={i}
                className={`caixa-poster ${destaque === i ? "destaque" : ""}`}
                style={{
                  left: `${(c.x / p.tamanho!.width) * 100}%`,
                  top: `${(c.y / p.tamanho!.height) * 100}%`,
                  width: `${(c.width / p.tamanho!.width) * 100}%`,
                  height: `${(c.height / p.tamanho!.height) * 100}%`,
                }}
                onMouseEnter={() => destacar(i)}
                onMouseLeave={() => destacar(null)}
              >
                <i>{i + 1}</i>
              </span>
            ))}
        </div>
      </div>
    </>
  );
}

/** O título do card: o único campo editável. Clique para editar; Enter (ou sair do campo) grava, Esc desiste. */
function Titulo({
  filme,
  gravar,
  aoEditar,
}: {
  filme: FilmeLido;
  gravar: (titulo: string) => Promise<void>;
  /** avisa o card enquanto o campo está aberto (o card de baixo não arrasta, para o mouse selecionar o texto) */
  aoEditar?: (sim: boolean) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const editandoAgora = texto !== null;
  const avisa = useRef(aoEditar);
  avisa.current = aoEditar;
  useEffect(() => {
    if (!editandoAgora) return;
    avisa.current?.(true);
    return () => avisa.current?.(false);
  }, [editandoAgora]);
  // o campo some depois do Enter ou do Esc: o blur que vem junto não pode gravar de novo (nem o que foi desistido)
  const terminado = useRef(false);
  const editar = () => {
    terminado.current = false;
    setTexto(filme.titulo);
  };
  const fim = (salvar: boolean) => {
    if (terminado.current) return;
    terminado.current = true;
    const novo = texto?.replace(/\s+/g, " ").trim() ?? "";
    setTexto(null);
    if (salvar && novo && novo !== filme.titulo) void gravar(novo);
  };
  if (texto === null)
    return (
      <span
        className="cf-titulo editavel"
        role="button"
        tabIndex={0}
        title="Corrigir o título"
        onClick={editar}
        onKeyDown={(e) => e.key === "Enter" && editar()}
      >
        <span className="cf-grifo">{filme.titulo || "???"}</span>
      </span>
    );
  return (
    <input
      className="cf-titulo"
      autoFocus
      value={texto}
      aria-label="Título do filme"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => fim(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") fim(true);
        if (e.key === "Escape") fim(false);
      }}
    />
  );
}

/** A marca do card, uma só: ✓ pronto, ! pede atenção (abre o balão) ou o Trello com o link do card que já existe. */
function MarcaDoFilme({
  filme,
  aberto,
  alternar,
}: {
  filme: FilmeLido;
  aberto: boolean;
  alternar: () => void;
}) {
  const c = filme.conferencia;
  if (!c) return null;
  if (filme.envio?.estado === "enviando")
    return <span className="ficha-marca lendo" aria-label="Indo para o Trello" />;
  if (filme.envio?.estado === "erro" && c.marca === "ok")
    return (
      <button
        className="ficha-marca erro"
        onClick={alternar}
        aria-expanded={aberto}
        aria-label="Não foi para o Trello"
        title={filme.envio.erro}
      >
        <Icone nome="atencao" tam={12} traco={3} />
      </button>
    );
  if (c.marca === "trello")
    return c.link ? (
      <a
        className="ficha-marca trello"
        href={c.link}
        target="_blank"
        rel="noreferrer"
        title="Abrir o card no Trello"
        aria-label="Abrir o card no Trello"
      >
        <Icone nome="quadro" tam={12} traco={2.4} />
      </a>
    ) : (
      <span className="ficha-marca trello" aria-label="Já tem card">
        <Icone nome="quadro" tam={12} traco={2.4} />
      </span>
    );
  if (c.marca === "atencao")
    return (
      <button
        className="ficha-marca revisar"
        onClick={alternar}
        aria-expanded={aberto}
        aria-label={
          c.pergunta === "qual-filme"
            ? "Qual filme?"
            : c.pergunta === "sem-titulo"
              ? "Sem título"
              : c.pergunta === "sessao"
                ? "Qual sessão?"
                : "Ano diferente"
        }
      >
        <Icone nome="atencao" tam={12} traco={3} />
      </button>
    );
  return (
    <span className="ficha-marca ok" aria-label="Pronto">
      <Icone nome="certo" tam={12} traco={3} />
    </span>
  );
}

/** O balão do !: "qual filme?" (os candidatos lado a lado e "outro filme (novo)"), "ano diferente" (os dois anos) ou
    "qual sessão?" (o filme que subiu da Sessão da Tarde: a sessão da coluna dele primeiro, depois as outras da página).
    As teclas 1, 2, 3… escolhem; Esc fecha. A escolha grava na hora. */
function Balao({
  filme,
  fechar,
  mudar,
}: {
  filme: FilmeLido;
  fechar: () => void;
  mudar: (m: MudancaNoFilme) => Promise<void>;
}) {
  const c = filme.conferencia!;
  // o motivo do erro no envio (o filme vai de novo no próximo Enviar) ou o título que falta: nada para escolher
  const nota =
    filme.envio?.estado === "erro" && !c.pergunta
      ? { titulo: "não foi", texto: filme.envio.erro ?? "" }
      : c.pergunta === "sem-titulo"
        ? { titulo: "sem título", texto: "clique no título para escrever" }
        : null;
  const opcoes: { rotulo: string; ano?: number | null; poster?: string; nota?: string; m: MudancaNoFilme }[] =
    c.pergunta === "qual-filme"
      ? [
          ...(c.candidatos ?? []).map((f) => ({
            rotulo: f.titulo,
            ano: f.ano,
            poster: posterDoFilme(f.id),
            m: { filme: f.id },
          })),
          { rotulo: "outro filme (novo)", poster: "", m: { filme: "novo" } },
        ]
      : c.pergunta === "ano-diferente"
        ? (c.anos ?? []).map((ano) => ({ rotulo: String(ano), m: { ano } }))
        : c.pergunta === "sessao"
          ? (c.sessoes ?? []).map((s) => ({
              rotulo: s.data ? `${s.sessao} · ${s.data.slice(0, 5)}` : s.sessao,
              nota: s.coluna ? "a coluna dele na página" : undefined,
              m: { sessao: s.sessao },
            }))
          : [];
  const escolher = useRef<(k: number) => void>(() => {});
  escolher.current = (k) => {
    if (opcoes[k]) void mudar(opcoes[k].m);
  };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo?.tagName === "INPUT" || alvo?.isContentEditable) return;
      if (e.key === "Escape") return fechar();
      const k = Number(e.key);
      if (Number.isInteger(k) && k >= 1 && k <= 9) {
        e.preventDefault();
        escolher.current(k - 1);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fechar]);
  if (nota)
    return (
      <div className="balao-filme nota" role="dialog">
        <b>{nota.titulo}</b>
        <p>{nota.texto}</p>
      </div>
    );
  return (
    <div className={`balao-filme ${c.pergunta}`} role="dialog">
      <b>
        {c.pergunta === "qual-filme"
          ? "qual filme?"
          : c.pergunta === "sessao"
            ? "qual sessão?"
            : "ano diferente"}
      </b>
      <div className="balao-opcoes">
        {opcoes.map((o, k) => (
          <button key={k} onClick={() => escolher.current(k)}>
            <i>{k + 1}</i>
            {o.poster !== undefined &&
              (o.poster ? (
                <img
                  src={o.poster}
                  alt=""
                  onError={(e) => e.currentTarget.classList.add("sem")}
                />
              ) : (
                <span className="sem" />
              ))}
            <span>{o.rotulo}</span>
            {o.ano !== undefined && <small>{o.ano ?? "—"}</small>}
            {o.nota && <small>({o.nota})</small>}
          </button>
        ))}
      </div>
    </div>
  );
}
