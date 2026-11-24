import { useCallback, useEffect, useRef, useState } from "react";
import {
  abrirPrevia,
  imagemDaPagina,
  listarPrevias,
  relerPagina,
  type PaginaDaPrevia,
  type Previa,
  type PreviaNaLista,
} from "../dados/armazenamento";
import { montarFileiras, type ItemDaFileira } from "../filmes/fileiras";
import { Icone } from "./icones";
import { Marca } from "./pecas";

/* A aba Filmes: as prévias de filmes. Solta-se o PDF, o navegador prepara as páginas e o servidor lê cada uma
   com a IA (dá para fechar a aba). Em cada página, os cards em cima, alinhados com os pôsteres (identidade
   própria em cima, Sessão da Tarde embaixo), e a página grande embaixo. A conferência e o envio vêm depois. */

interface Props {
  aberta?: string;
  abrir: (id?: string) => void;
  voltar: () => void;
  avisar: (t: string) => void;
}

const lendo = (p: PaginaDaPrevia) =>
  p.estado === "esperando" || p.estado === "fila" || p.estado === "lendo";

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
    () => abrirPrevia(id).then(setPrevia, (e: Error) => avisar(e.message)),
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
        previaId={previa.id}
        p={p}
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
}: {
  previaId: string;
  p: PaginaDaPrevia;
  destaque: number | null;
  destacar: (i: number | null) => void;
  reler: () => void;
}) {
  const f = montarFileiras(p);
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
        className={`cartao-filme ${baixo ? "baixo" : ""} ${destaque === filme.poster && filme.poster !== null ? "destaque" : ""}`}
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
          <span className="cf-titulo">{filme.titulo}</span>
        ) : (
          <div className="cf-corpo">
            <span className="cf-sessao">{filme.sessao || "???"}</span>
            <span className="cf-titulo">{filme.titulo}</span>
            <span className="cf-linha">
              {filme.ano ?? "—"} <span>{filme.data.slice(0, 5)}</span>
              {filme.inedito && <b className="cf-inedito">INÉDITO</b>}
            </span>
          </div>
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
          {!pronta && p.estado !== "erro" && <div className="lendo-pagina" />}
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
