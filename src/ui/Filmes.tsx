import { useCallback, useEffect, useRef, useState } from "react";
import {
  abrirPrevia,
  imagemDaPagina,
  listarPrevias,
  mudarFilme,
  posterDoFilme,
  relerPagina,
  type FilmeLido,
  type MudancaNoFilme,
  type PaginaDaPrevia,
  type Previa,
  type PreviaNaLista,
} from "../dados/armazenamento";
import { montarFileiras, type ItemDaFileira } from "../filmes/fileiras";
import { Icone } from "./icones";
import { Marca } from "./pecas";

/* A aba Filmes: as prévias de filmes. Solta-se o PDF, o navegador prepara as páginas e o servidor lê cada uma
   com a IA (dá para fechar a aba). Em cada página, os cards em cima, alinhados com os pôsteres (identidade
   própria em cima, Sessão da Tarde embaixo), e a página grande embaixo. Cada card tem uma marca só, da conferência
   com o banco: ✓ pronto, ! pede atenção (abre o balão com a pergunta) ou o Trello (já tem card). O envio vem depois. */

interface Props {
  aberta?: string;
  abrir: (id?: string) => void;
  voltar: () => void;
  avisar: (t: string) => void;
}

// a página que ainda não chegou (a aba fechou no meio da subida) não está sendo lida: não adianta esperar
const lendo = (p: PaginaDaPrevia) =>
  p.estado === "fila" || p.estado === "lendo";

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
  const carregar = useCallback(
    () =>
      abrirPrevia(id).then(
        (p) => {
          setPrevia(p);
          if (p.erroDaConferencia)
            avisar(`Não consegui conferir com o banco: ${p.erroDaConferencia}`);
        },
        (e: Error) => avisar(e.message),
      ),
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
  // enquanto há página na fila ou sendo lida, a tela pergunta de novo de tempos em tempos
  const algumaLendo = !!previa?.paginas.some(lendo);
  useEffect(() => {
    if (!algumaLendo) return;
    const t = setInterval(() => void carregar(), 3000);
    return () => clearInterval(t);
  }, [algumaLendo, carregar]);
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
      </div>
      <Pagina
        key={p.numero}
        previaId={previa.id}
        p={p}
        mudar={(i, m) => mudar(p.numero, i, m)}
        destaque={destaque}
        destacar={setDestaque}
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
  reler,
  mudar,
}: {
  previaId: string;
  p: PaginaDaPrevia;
  destaque: number | null;
  destacar: (i: number | null) => void;
  reler: () => void;
  mudar: (i: number, m: MudancaNoFilme) => Promise<void>;
}) {
  const f = montarFileiras(p);
  // o card com o balão do ! aberto (o índice do filme na página)
  const [aberto, setAberto] = useState<number | null>(null);
  const pergunta = aberto !== null ? p.filmes[aberto]?.conferencia?.pergunta : undefined;
  useEffect(() => {
    if (aberto !== null && !pergunta) setAberto(null);
  }, [aberto, pergunta]);
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
    const filme = it.filme!;
    const poster =
      filme.poster !== null
        ? imagemDaPagina(previaId, p.numero, filme.poster + 1)
        : "";
    return (
      <div
        key={`f${it.i}`}
        className={`cartao-filme ${baixo ? "baixo" : ""} ${destaque === filme.poster && filme.poster !== null ? "destaque" : ""} ${aberto === it.i ? "aberto" : ""}`}
        style={pos(it.x)}
        onMouseEnter={() => destacar(filme.poster)}
        onMouseLeave={() => destacar(null)}
      >
        {poster ? (
          <img className="cf-poster" src={poster} alt="" />
        ) : (
          <span className="cf-poster sem" />
        )}
        {baixo ? (
          <Titulo filme={filme} gravar={(titulo) => mudar(it.i, { titulo })} />
        ) : (
          <div className="cf-corpo">
            <span className="cf-sessao">{filme.sessao || "???"}</span>
            <Titulo filme={filme} gravar={(titulo) => mudar(it.i, { titulo })} />
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
        {aberto === it.i && filme.conferencia?.pergunta && (
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
          <div className="fileira cima">
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
}: {
  filme: FilmeLido;
  gravar: (titulo: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState<string | null>(null);
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
        {filme.titulo || "???"}
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
        aria-label={c.pergunta === "qual-filme" ? "Qual filme?" : "Ano diferente"}
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

/** O balão do !: "qual filme?" (os candidatos lado a lado e "outro filme (novo)") ou "ano diferente" (os dois anos).
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
  const opcoes: { rotulo: string; ano?: number | null; poster?: string; m: MudancaNoFilme }[] =
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
      : (c.anos ?? []).map((ano) => ({ rotulo: String(ano), m: { ano } }));
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
  return (
    <div className={`balao-filme ${c.pergunta}`} role="dialog">
      <b>{c.pergunta === "qual-filme" ? "qual filme?" : "ano diferente"}</b>
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
          </button>
        ))}
      </div>
    </div>
  );
}
