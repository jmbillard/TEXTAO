import { useCallback, useEffect, useState } from "react";
import {
  lerAtracoesParecidas,
  lerCorrecoesDaPauta,
  naoSaoAMesma,
} from "../dados/armazenamento";
import type {
  FichaParecida,
  GrupoDaPauta,
  MotivoDoGrupo,
  PaginaDaCorrecao,
  PaginaDasAtracoes,
  PropostaDaPauta,
} from "../modelo/correcaoDeGrafia";
import { Icone } from "./icones";
import { Marca } from "./pecas";
import { useTelaDeCelular } from "./faixa";
import "./configuracao.css";
import "./correcoes.css";

/* A correção de grafia (#114), só para administradores (menu do perfil, junto de Cadastros e Configuração): as
   claquetes da pauta da edição inteira com o código de versão fora do padrão, "de → para", com o dia e o editor da
   linha, em páginas; os códigos que a pauta não reconhece, à parte, sem correção. Nesta fatia, só para conferir. No
   computador e no celular (no celular, cada linha vira um cartão).
   As atrações (#116): as fichas que parecem ser a mesma atração, juntas num grupo com o motivo e, em cada ficha,
   quantas artes do acervo, Produções e regras ela tem. "Não são a mesma" guarda a decisão e o grupo sai (no
   computador; no celular, a tela só mostra). */

interface Props {
  voltar: () => void;
}

/** "27/11/2026, sex" */
const quando = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? dia
    : d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        weekday: "short",
        timeZone: "UTC",
      });
};

const plural = (n: number, um: string, varios: string) =>
  `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** A claquete com o código destacado: o que fica igual e o código (o "(...)" do fim ou a palavra solta). */
function partes(p: PropostaDaPauta): {
  de: [string, string];
  para: [string, string] | null;
} {
  if (p.para) {
    // a proposta sempre termina em "(CÓDIGO)", e o começo é o mesmo nas duas
    const fixo = p.para.slice(0, p.para.lastIndexOf("("));
    return {
      de: [fixo, p.de.slice(fixo.length)],
      para: [fixo, p.para.slice(fixo.length)],
    };
  }
  const i = p.de.lastIndexOf("(");
  return {
    de: i >= 0 ? [p.de.slice(0, i), p.de.slice(i)] : [p.de, ""],
    para: null,
  };
}

const Claquete = ({
  parte,
  classe,
}: {
  parte: [string, string];
  classe: string;
}) => (
  <span className="cor-claquete">
    {parte[0]}
    <mark className={classe}>{parte[1]}</mark>
  </span>
);

export function CorrecaoDeGrafia({ voltar }: Props) {
  const celular = useTelaDeCelular();
  const [paginas, setPaginas] = useState<Record<GrupoDaPauta, number>>({
    corrigir: 1,
    "nao-reconhecido": 1,
  });
  const [dados, setDados] = useState<
    Partial<Record<GrupoDaPauta, PaginaDaCorrecao>>
  >({});
  const [falha, setFalha] = useState("");

  const carregar = useCallback((grupo: GrupoDaPauta, pagina: number) => {
    setFalha("");
    lerCorrecoesDaPauta(grupo, pagina)
      .then((d) => setDados((antes) => ({ ...antes, [grupo]: d })))
      .catch((e) => setFalha(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(
    () => carregar("corrigir", paginas.corrigir),
    [carregar, paginas.corrigir],
  );
  useEffect(
    () => carregar("nao-reconhecido", paginas["nao-reconhecido"]),
    [carregar, paginas["nao-reconhecido"]],
  );
  const irPara = (grupo: GrupoDaPauta, pagina: number) =>
    setPaginas((p) => ({ ...p, [grupo]: pagina }));

  const resumo =
    dados.corrigir?.resumo ?? dados["nao-reconhecido"]?.resumo ?? null;

  // as atrações parecidas: lidas dos cadastros, à parte da pauta (uma não espera a outra)
  const [paginaAtr, setPaginaAtr] = useState(1);
  const [atracoes, setAtracoes] = useState<PaginaDasAtracoes | null>(null);
  const [falhaAtr, setFalhaAtr] = useState("");
  const carregarAtracoes = useCallback((pagina: number) => {
    setFalhaAtr("");
    lerAtracoesParecidas(pagina)
      .then(setAtracoes)
      .catch((e) => setFalhaAtr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => carregarAtracoes(paginaAtr), [carregarAtracoes, paginaAtr]);

  return (
    <div
      className={`pagina configuracao correcoes ${celular ? "no-celular" : ""}`}
    >
      <header className="cad-topo">
        <button className="voltar-cad" onClick={voltar}>
          <Icone nome="voltar" tam={16} /> Fila
        </button>
        <Marca />
        <span />
      </header>
      <main className="cfg">
        <div className="cfg-cabeca">
          <h1>Correção de grafia</h1>
          <span className="cfg-so-admin">
            <Icone nome="cadeado" tam={13} /> administradores
          </span>
        </div>
        {falha ? (
          <p className="cfg-falha" role="alert">
            {falha}{" "}
            <button
              className="botao-texto"
              onClick={() => (
                carregar("corrigir", paginas.corrigir),
                carregar("nao-reconhecido", paginas["nao-reconhecido"])
              )}
            >
              Tentar de novo
            </button>
          </p>
        ) : !resumo ? (
          <p className="cfg-lendo">Lendo a pauta da edição…</p>
        ) : (
          <>
            <p className="cor-resumo">
              {resumo.corrigir ? (
                <>
                  <b>{plural(resumo.corrigir, "proposta", "propostas")}</b> de
                  correção na pauta da edição
                </>
              ) : (
                "Nenhuma proposta de correção na pauta da edição"
              )}
              {resumo.naoReconhecido > 0 && (
                <>
                  {" "}
                  e <b>
                    {plural(resumo.naoReconhecido, "código", "códigos")}
                  </b>{" "}
                  não{" "}
                  {resumo.naoReconhecido === 1 ? "reconhecido" : "reconhecidos"}
                </>
              )}
              .
              {atracoes && (
                <>
                  {" "}
                  {atracoes.total ? (
                    <>
                      <b>
                        {plural(
                          atracoes.total,
                          "grupo de atrações parecidas",
                          "grupos de atrações parecidas",
                        )}
                      </b>
                      .
                    </>
                  ) : (
                    "Nenhuma atração parecida com outra."
                  )}
                </>
              )}
            </p>
            <p className="cor-linha">
              A pauta inteira, lida do Teable. O padrão das versões é uma letra
              por versão, maiúscula, entre parênteses, no fim da claquete: (A)
              amanhã, (H) hoje, (N) nesta, (P) próxima, (D) dia, (M) mês, e
              (MNT) manutenção da grade. Só o código muda; o resto da claquete
              fica como está. Por enquanto, a pauta é só para conferir.
            </p>
            <Grupo
              grupo="corrigir"
              titulo="Pauta da edição"
              total={resumo.corrigir}
              dados={dados.corrigir}
              irPara={(n) => irPara("corrigir", n)}
              vazio="Todas as claquetes da pauta estão no padrão."
            />
            {resumo.naoReconhecido > 0 && (
              <Grupo
                grupo="nao-reconhecido"
                titulo="Não reconhecido"
                explicacao="O código no fim destas claquetes não é uma versão conhecida. Fica como está: nada é corrigido."
                total={resumo.naoReconhecido}
                dados={dados["nao-reconhecido"]}
                irPara={(n) => irPara("nao-reconhecido", n)}
              />
            )}
          </>
        )}
        <Atracoes
          dados={atracoes}
          falha={falhaAtr}
          celular={celular}
          irPara={setPaginaAtr}
          tentarDeNovo={() => carregarAtracoes(paginaAtr)}
          marcada={(id) => {
            // o grupo sai da lista; a página relê para trazer o próximo
            setAtracoes((d) =>
              d
                ? {
                    ...d,
                    total: d.total - 1,
                    grupos: d.grupos.filter((g) => g.id !== id),
                  }
                : d,
            );
            carregarAtracoes(paginaAtr);
          }}
        />
      </main>
    </div>
  );
}

/** As páginas de uma lista: "Anteriores", "página N de M" e "Próximas" (nada com uma página só). */
function Paginas({
  titulo,
  pagina,
  paginas,
  irPara,
}: {
  titulo: string;
  pagina: number;
  paginas: number;
  irPara: (n: number) => void;
}) {
  if (paginas <= 1) return null;
  return (
    <nav className="cor-paginas" aria-label={`Páginas: ${titulo}`}>
      <button
        type="button"
        className="botao"
        disabled={pagina <= 1}
        onClick={() => irPara(pagina - 1)}
      >
        Anteriores
      </button>
      <span className="cor-pagina">
        página {pagina} de {paginas}
      </span>
      <button
        type="button"
        className="botao"
        disabled={pagina >= paginas}
        onClick={() => irPara(pagina + 1)}
      >
        Próximas
      </button>
    </nav>
  );
}

/** Por que as fichas parecem a mesma, na tela. */
const MOTIVO: Record<MotivoDoGrupo, string> = {
  "mesmo-nome": "O mesmo nome sem maiúsculas, acentos e artigos",
  "uma-letra": "Uma letra de diferença no nome",
};

/** Uma conta da ficha: o número, com o zero apagado; sem o acervo ligado, "—". */
const Conta = ({ n }: { n: number | null }) =>
  n === null ? (
    <span className="cor-sem">—</span>
  ) : (
    <span className={n ? "" : "cor-zero"}>{n.toLocaleString("pt-BR")}</span>
  );

function Atracoes({
  dados,
  falha,
  celular,
  irPara,
  tentarDeNovo,
  marcada,
}: {
  dados: PaginaDasAtracoes | null;
  falha: string;
  celular: boolean;
  irPara: (n: number) => void;
  tentarDeNovo: () => void;
  marcada: (id: string) => void;
}) {
  // o grupo que está sendo marcado agora, e o erro de um grupo
  const [marcando, setMarcando] = useState("");
  const [erro, setErro] = useState<{ id: string; texto: string } | null>(null);
  const [guardado, setGuardado] = useState("");
  const marcar = (id: string, fichas: FichaParecida[]) => {
    setMarcando(id);
    setErro(null);
    naoSaoAMesma(fichas.map((f) => f.id))
      .then(() => {
        setGuardado(
          `Guardado: ${fichas.map((f) => f.nome).join(", ")} não são a mesma atração.`,
        );
        marcada(id);
      })
      .catch((e) =>
        setErro({ id, texto: e instanceof Error ? e.message : String(e) }),
      )
      .finally(() => setMarcando(""));
  };
  const paginas = dados
    ? Math.max(1, Math.ceil(dados.total / dados.porPagina))
    : 1;
  return (
    <section
      className="cfg-secao cor-secao"
      aria-labelledby="cor-atracoes"
      data-grupo="atracoes"
    >
      <div className="cfg-secao-topo">
        <h2 id="cor-atracoes">Atrações</h2>
        {dados && (
          <span className="cor-conta">
            {dados.total.toLocaleString("pt-BR")}
          </span>
        )}
      </div>
      <p className="cor-linha">
        As fichas que parecem ser a mesma atração: o mesmo nome sem maiúsculas,
        acentos e artigos, ou uma letra de diferença numa palavra longa. Cada
        ficha mostra quantas artes do acervo, Produções e regras ela tem.
        {!celular &&
          " Quando não forem a mesma, diga “Não são a mesma”, e o grupo não volta."}
      </p>
      {guardado && (
        <p className="cor-guardado" role="status">
          {guardado}
        </p>
      )}
      {falha ? (
        <p className="cfg-falha" role="alert">
          {falha}{" "}
          <button className="botao-texto" onClick={tentarDeNovo}>
            Tentar de novo
          </button>
        </p>
      ) : !dados ? (
        <p className="cfg-lendo">Lendo as atrações…</p>
      ) : !dados.total ? (
        <p className="cor-linha cor-vazio">
          Nenhuma ficha parece ser a mesma atração que outra.
        </p>
      ) : (
        <>
          <ul className="cor-grupos">
            {dados.grupos.map((g) => (
              <li key={g.id} className="cor-grupo" data-id={g.id}>
                <div className="cor-grupo-topo">
                  <span className="cor-motivo" data-motivo={g.motivo}>
                    {MOTIVO[g.motivo]}
                  </span>
                  {!celular && (
                    <button
                      type="button"
                      className="botao"
                      disabled={!!marcando}
                      onClick={() => marcar(g.id, g.fichas)}
                    >
                      {marcando === g.id ? "Guardando…" : "Não são a mesma"}
                    </button>
                  )}
                </div>
                {erro?.id === g.id && (
                  <p className="cfg-falha" role="alert">
                    {erro.texto}
                  </p>
                )}
                <table className="cor-tabela cor-fichas">
                  <thead>
                    <tr>
                      <th>Ficha</th>
                      <th className="cor-num">Artes do acervo</th>
                      <th className="cor-num">Produções</th>
                      <th className="cor-num">Regras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.fichas.map((f) => (
                      <tr key={f.id} data-id={f.id}>
                        <td className="cor-ficha">
                          <span className="cor-nome">{f.nome}</span>{" "}
                          {f.categoria && (
                            <span className="cor-categoria">{f.categoria}</span>
                          )}
                        </td>
                        <td
                          className="cor-num"
                          data-conta="artes"
                          data-rotulo="Artes"
                        >
                          <Conta n={f.artes} />
                        </td>
                        <td
                          className="cor-num"
                          data-conta="producoes"
                          data-rotulo="Produções"
                        >
                          <Conta n={f.producoes} />
                        </td>
                        <td
                          className="cor-num"
                          data-conta="regras"
                          data-rotulo="Regras"
                        >
                          <Conta n={f.regras} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            ))}
          </ul>
          <Paginas
            titulo="Atrações"
            pagina={dados.pagina}
            paginas={paginas}
            irPara={irPara}
          />
        </>
      )}
    </section>
  );
}

function Grupo({
  grupo,
  titulo,
  explicacao,
  total,
  dados,
  irPara,
  vazio,
}: {
  grupo: GrupoDaPauta;
  titulo: string;
  explicacao?: string;
  total: number;
  dados?: PaginaDaCorrecao;
  irPara: (n: number) => void;
  vazio?: string;
}) {
  const id = `cor-${grupo}`;
  const paginas = dados ? Math.max(1, Math.ceil(total / dados.porPagina)) : 1;
  const pagina = dados?.pagina ?? 1;
  return (
    <section
      className="cfg-secao cor-secao"
      aria-labelledby={id}
      data-grupo={grupo}
    >
      <div className="cfg-secao-topo">
        <h2 id={id}>{titulo}</h2>
        <span className="cor-conta">{total.toLocaleString("pt-BR")}</span>
      </div>
      {explicacao && <p className="cor-linha">{explicacao}</p>}
      {!total ? (
        <p className="cor-linha cor-vazio">{vazio}</p>
      ) : !dados ? (
        <p className="cfg-lendo">Lendo…</p>
      ) : (
        <>
          <table className="cor-tabela">
            <thead>
              <tr>
                <th className="cor-dia">Dia</th>
                <th className="cor-editor">Editor</th>
                <th>{grupo === "corrigir" ? "De → para" : "Claquete"}</th>
              </tr>
            </thead>
            <tbody>
              {dados.propostas.map((p) => {
                const { de, para } = partes(p);
                return (
                  <tr key={p.id} data-id={p.id}>
                    <td className="cor-dia">{quando(p.dia)}</td>
                    <td className="cor-editor">
                      {p.editor || <span className="cor-sem">sem editor</span>}
                    </td>
                    <td className="cor-claquetes">
                      <div className="cor-de-para">
                        <Claquete
                          parte={de}
                          classe={para ? "cor-antes" : "cor-desconhecido"}
                        />
                        {para && (
                          <>
                            {" "}
                            <span className="cor-seta">→</span>{" "}
                            <Claquete parte={para} classe="cor-depois" />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Paginas
            titulo={titulo}
            pagina={pagina}
            paginas={paginas}
            irPara={irPara}
          />
        </>
      )}
    </section>
  );
}
