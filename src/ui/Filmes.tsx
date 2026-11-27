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
  type CardDaPrevia,
  type PessoaNaPrevia,
  type Previa,
  type PreviaNaLista,
} from "../dados/armazenamento";
import { corDe, iniciais, nomesCurtos, primeiroNome as primeiro } from "../dados/colaboracao";
import { montarFileiras, podeSubir, type ItemDaFileira } from "../filmes/fileiras";
import { opcoesDaPergunta } from "../filmes/perguntas";
import { useTelaDeCelular } from "./faixa";
import { EntradaDoCelular } from "./FilmesCelular";
import { SequenciaDeFilmes } from "./SequenciaDeFilmes";
import { Icone } from "./icones";
import { LinkQuebrado } from "./LinkQuebrado";
import { Duvida, Marca, RABISCOS } from "./pecas";

/* A aba Filmes: as prévias de filmes. Solta-se o PDF, o navegador prepara as páginas e o servidor lê cada uma
   com a IA (dá para fechar a aba). Em cada página, os cards em cima, alinhados com os pôsteres (identidade
   própria em cima, Sessão da Tarde embaixo), e a página grande embaixo. Cada card tem uma marca só, da conferência
   com o banco: ✓ pronto, ! pede atenção (abre o balão com a pergunta) ou o Trello (já tem card). O filme que a leitura
   pôs por engano na Sessão da Tarde deixa "???" na vaga do pôster dele em cima: arrastado até lá, ele pede a sessão,
   a da coluna dele na página primeiro (só de baixo para cima). O Enviar, o mesmo do editor de roteiros, manda os
   prontos de toda a prévia; o que der erro mostra o motivo e vai no próximo Enviar. "Ler de novo" lê a página outra
   vez com a IA e guarda o que foi corrigido à mão; o filme corrigido (ou enviado) que a leitura nova não achou fica com
   um !, e a pessoa decide se ele fica ou sai.
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
export const LISTA_MS = 5000;
/** "Ana tá vendo", "Ana e Bruno tão vendo", "Ana e mais 2 tão vendo". */
export const taoVendo = (pessoas: { nome: string }[]) =>
  `${nomesCurtos(pessoas)} ${pessoas.length === 1 ? "tá vendo" : "tão vendo"}`;

/** Quem mais está na prévia: as bolinhas com as iniciais, na cor de cada um. */
export function Presentes({ pessoas, texto }: { pessoas: PessoaNaPrevia[]; texto?: boolean }) {
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

/** A anotação à mão logo abaixo do título do card que pede atenção: a pergunta do ! ou o envio que não foi. */
export const anotacao = (f: FilmeLido) => {
  const c = f.conferencia;
  // o que a leitura nova não achou pede a decisão mesmo depois de enviado
  if (c?.pergunta === "nao-achado") return "não achado";
  if (!c || f.envio?.estado === "enviando" || f.envio?.estado === "enviado") return null;
  if (f.envio?.estado === "erro" && c.marca === "ok") return "não foi";
  if (c.marca !== "atencao") return null;
  if (c.pergunta === "qual-filme") return "qual filme?";
  if (c.pergunta === "ano-diferente") return c.anos ? `${c.anos[0]} ou ${c.anos[1]}?` : "qual ano?";
  if (c.pergunta === "sessao") return "sessão: ???";
  if (c.pergunta === "sem-titulo") return "sem título";
  return null;
};

/** O círculo à caneta em volta do pôster da página (os traços da contagem de artes da fila). */
export const Circulo = ({ traco, className }: { traco: number; className: string }) => (
  <svg className={className} viewBox="0 0 64 44" preserveAspectRatio="none" aria-hidden="true">
    <path pathLength={1} d={RABISCOS[traco % RABISCOS.length]} />
  </svg>
);

/** O card abre o balão: a pergunta do ! ou o motivo do erro no envio. */
const temBalao = (f?: FilmeLido) =>
  !!f?.conferencia?.pergunta || f?.envio?.estado === "erro";

export function Filmes({ aberta, abrir, voltar, avisar }: Props) {
  // no celular (até 600px), a entrada é a das prévias empilhadas com o "Subir prévia" (#80), e a prévia aberta é a
  // sequência de filmes (#81)
  const celular = useTelaDeCelular();
  if (celular)
    return (
      <div className={`pagina filmes filmes-no-celular ${aberta ? "na-sequencia" : ""}`}>
        <header className="topo-filmes-celular">
          <button
            className="voltar-celular"
            onClick={aberta ? () => abrir() : voltar}
            aria-label={aberta ? "Voltar para as prévias" : "Voltar para a fila"}
          >
            <Icone nome="voltar" tam={20} traco={2} />
          </button>
          <Marca />
        </header>
        {aberta ? (
          <SequenciaDeFilmes id={aberta} avisar={avisar} verPrevias={() => abrir()} voltar={voltar} />
        ) : (
          <EntradaDoCelular abrir={abrir} avisar={avisar} />
        )}
      </div>
    );
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
        <PreviaAberta id={aberta} avisar={avisar} verPrevias={() => abrir()} voltar={voltar} />
      ) : (
        <ListaDePrevias abrir={abrir} avisar={avisar} />
      )}
    </div>
  );
}

/** "em 38 dias", "amanhã" ou "hoje": quando a prévia toda enviada é apagada. */
export const quandoSome = (dias: number) =>
  dias <= 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`;

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
    // quem está em cada prévia: a lista pergunta de novo de tempos em tempos (barato: só consulta o banco pela prévia que mudou)
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
            {typeof p.diasParaApagar === "number" &&
              ` · toda enviada, some ${quandoSome(p.diasParaApagar)}`}
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

/**
 * A prévia aberta, do computador e do celular: abre, reabre quando a versão dela muda no servidor (a batida, que também
 * diz quem mais está nela e o card em que esta pessoa mexe) e grava as mudanças nos filmes.
 */
export function usePreviaAberta(id: string, avisar: (t: string) => void) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  // o link não abriu: a prévia vencida (o servidor já apagou) ou o servidor fora do ar
  const [falha, setFalha] = useState<"vencida" | "erro" | null>(null);
  // quem mais está na prévia, e o card em que eu estou mexendo (vai no aviso, para os outros verem)
  const [pessoas, setPessoas] = useState<PessoaNaPrevia[]>([]);
  const [meuCard, setMeuCard] = useState<CardDaPrevia | null>(null);
  // a versão da prévia que está na tela; uma reabertura por vez
  const versaoNaTela = useRef<string | undefined>(undefined);
  const reabrindo = useRef<Promise<void> | null>(null);
  const carregar = useCallback(
    () =>
      (reabrindo.current ??= abrirPrevia(id)
        .then(
          (p) => {
            versaoNaTela.current = p.versao;
            setFalha(null);
            setPrevia(p);
            if (p.erroDaConferencia)
              avisar(`Não consegui conferir com o banco: ${p.erroDaConferencia}`);
          },
          (e: Error & { status?: number }) => {
            // a prévia já na tela continua; sem ela, a tela de link quebrado
            if (versaoNaTela.current === undefined)
              return setFalha(e.status === 404 ? "vencida" : "erro");
            avisar(e.message);
          },
        )
        .finally(() => (reabrindo.current = null))),
    [id, avisar],
  );
  // a mudança grava na hora; o filme volta conferido de novo e entra no lugar do antigo
  const mudar = useCallback(
    (numero: number, i: number, m: MudancaNoFilme) =>
      mudarFilme(id, numero, i, m).then(
        ({ filme, erroDaConferencia }) => {
          // o filme saiu da página: os outros mudam de posição, a prévia é reaberta
          if (!filme) return void carregar();
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
          // uma reabertura que saiu antes desta mudança chega sem ela: reabre de novo logo depois
          if (reabrindo.current) void reabrindo.current.then(carregar);
        },
        (e: Error) => avisar(e.message),
      ),
    [id, avisar, carregar],
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
  return { previa, falha, pessoas, carregar, mudar, mexer: setMeuCard };
}

function PreviaAberta({
  id,
  avisar,
  verPrevias,
  voltar,
}: {
  id: string;
  avisar: (t: string) => void;
  verPrevias: () => void;
  voltar: () => void;
}) {
  const { previa, falha, pessoas, carregar, mudar, mexer: setMeuCard } = usePreviaAberta(id, avisar);
  const [pag, setPag] = useState(0);
  const [destaque, setDestaque] = useState<number | null>(null);
  const [mandando, setMandando] = useState(false);
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
  if (!previa && falha)
    return (
      <LinkQuebrado
        caso={{ tipo: falha }}
        voltar={voltar}
        verPrevias={verPrevias}
        tentar={() => void carregar()}
      />
    );
  if (!previa) return <main className="previa" />;
  const p = previa.paginas[Math.min(pag, previa.paginas.length - 1)];
  const algumPronto = previa.paginas.some(
    (g) => g.estado === "lida" && g.filmes.some(vaiNoEnvio),
  );
  const envioLigado = previa.envio?.ligado !== false;
  const relerEsta = () =>
    relerPagina(previa.id, p.numero).then(carregar, (e: Error) => avisar(e.message));

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
        {p.estado === "lida" && (
          <button
            className="botao reler-pagina"
            disabled={p.filmes.some((f) => f.envio?.estado === "enviando")}
            title="Lê esta página outra vez com a IA; o que foi corrigido à mão fica"
            onClick={() => void relerEsta()}
          >
            Ler de novo
          </button>
        )}
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
        reler={() => void relerEsta()}
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
  mexer: (card: CardDaPrevia | null) => void;
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
        <div key={`v${it.i}`} className="cartao-filme vaga cancelada" style={pos(it.x)}>
          <svg className="risco" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M4 8 C 30 34, 62 62, 97 93" />
            <path d="M95 6 C 66 30, 36 64, 3 95" />
          </svg>
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
    // embaixo do título, uma anotação só: quem está mexendo no card ou, sem ninguém, o que ele pede
    const nota = anotacao(filme);
    const rubrica =
      ali.length > 0 ? (
        <span className="rubrica agora" title={`${ali.map((o) => o.nome).join(", ")} mexendo neste filme agora`}>
          {taoVendo(ali)}
        </span>
      ) : (
        nota && <span className="cf-nota">{nota}</span>
      );
    const poster =
      filme.poster !== null
        ? imagemDaPagina(previaId, p.numero, filme.poster + 1)
        : "";
    return (
      <div
        key={`f${it.i}`}
        className={`cartao-filme ${baixo ? "baixo" : ""} ${nota ? "atencao" : ""} ${filme.envio?.estado === "enviado" && !nota ? "enviado" : ""} ${sobe ? "sobe" : ""} ${arrastando === it.i ? "arrastando" : ""} ${destaque === filme.poster && filme.poster !== null ? "destaque" : ""} ${aberto === it.i ? "aberto" : ""} ${ali.length ? "ocupado" : ""}`}
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
              <span className="cf-sessao">
                <Duvida semente={`${p.numero}-${it.i}`} rotulo="Sem sessão" />
              </span>
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
  // o filme de cada pôster da página: o que pede atenção ganha o círculo à caneta; o enviado, o ✓ à mão
  const filmeDoPoster = (k: number) => p.filmes.find((x) => x.poster === k);
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
            p.posteres.map(({ caixa: c }, i) => {
              const dele = filmeDoPoster(i);
              const pede = !!dele && !!anotacao(dele);
              return (
                <span
                  key={i}
                  className="caixa-poster"
                  style={{
                    left: `${(c.x / p.tamanho!.width) * 100}%`,
                    top: `${(c.y / p.tamanho!.height) * 100}%`,
                    width: `${(c.width / p.tamanho!.width) * 100}%`,
                    height: `${(c.height / p.tamanho!.height) * 100}%`,
                  }}
                  onMouseEnter={() => destacar(i)}
                  onMouseLeave={() => destacar(null)}
                >
                  {destaque === i && <Circulo traco={i} className="circulo mouse" />}
                  {pede && <Circulo traco={i + 1} className="circulo atencao" />}
                  {dele?.envio?.estado === "enviado" && (
                    <svg className="visto" viewBox="0 0 32 26" role="img" aria-label="Foi para o Trello">
                      <path d="M3 14 C 6 16, 9 19, 11 23 C 15 14, 21 7, 30 2" />
                    </svg>
                  )}
                  <i>{i + 1}</i>
                </span>
              );
            })}
        </div>
      </div>
    </>
  );
}

/** O título do card: o único campo editável. Clique para editar; Enter (ou sair do campo) grava, Esc desiste. */
export function Titulo({
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
        <span className="cf-grifo">
          {filme.titulo || <Duvida semente={filme.data + filme.sessao} rotulo="Sem título" />}
        </span>
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
                : c.pergunta === "nao-achado"
                  ? "A leitura nova não achou"
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

/** O balão do !: "qual filme?" (os candidatos lado a lado e "outro filme (novo)"), "ano diferente" (os dois anos),
    "qual sessão?" (o filme que subiu da Sessão da Tarde: a sessão da coluna dele primeiro, depois as outras da página)
    ou "não achado" (a leitura nova não achou o filme corrigido ou enviado: ele fica ou sai).
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
  // as mesmas opções do card do celular; o pôster é o do filme do banco ("" no "outro filme (novo)")
  const opcoes = opcoesDaPergunta(filme).map((o) => ({
    ...o,
    poster: o.poster === undefined ? undefined : o.poster ? posterDoFilme(o.poster) : "",
  }));
  const escolher = useRef<(k: number) => void>(() => {});
  escolher.current = (k) => {
    const m = opcoes[k]?.m;
    // o que sai da página leva o balão junto (a posição dele passa a ser de outro filme)
    if (m) void mudar(m).then(() => void ("sai" in m && fechar()));
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
            : c.pergunta === "nao-achado"
              ? "não achado"
              : "ano diferente"}
      </b>
      {c.pergunta === "nao-achado" && (
        <p>
          A leitura nova não achou este filme na página
          {filme.envio?.estado === "enviado" ? " (ele já foi para o Trello)" : ""}. Ele fica ou sai?
        </p>
      )}
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
