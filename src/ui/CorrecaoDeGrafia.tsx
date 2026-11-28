import { useCallback, useEffect, useState } from "react";
import {
  aplicarCorrecoes,
  desfazerCorrecoes,
  juntarAtracoes,
  lerAtracoesParecidas,
  lerCorrecoesDaPauta,
  lerRegistroDeCorrecoes,
  naoSaoAMesma,
} from "../dados/armazenamento";
import type {
  CorrecaoAplicada,
  FalhaDaCorrecao,
  FichaParecida,
  GrupoDaPauta,
  JuncaoDeAtracoes,
  MotivoDoGrupo,
  PaginaDaCorrecao,
  PaginaDasAtracoes,
  PaginaDoRegistro,
  PropostaDaPauta,
} from "../modelo/correcaoDeGrafia";
import { Icone } from "./icones";
import { Marca } from "./pecas";
import { CaixinhaDoDesfazer } from "./desfazer";
import { useTelaDeCelular } from "./faixa";
import "./configuracao.css";
import "./correcoes.css";

/* A correção de grafia (#114), só para administradores (menu do perfil, junto de Cadastros e Configuração): as
   claquetes da pauta da edição inteira com o código de versão fora do padrão, "de → para", com o dia e o editor da
   linha, em páginas; os códigos que a pauta não reconhece, à parte, sem correção. Nesta fatia, só para conferir. No
   computador e no celular (no celular, cada linha vira um cartão).
   As atrações (#116): as fichas que parecem ser a mesma atração, juntas num grupo com o motivo e, em cada ficha,
   quantas artes do acervo, Produções e regras ela tem. "Não são a mesma" guarda a decisão e o grupo sai (no
   computador; no celular, a tela só mostra).
   Aplicar e desfazer (#115), no computador: marcar uma proposta por vez ou todas da página e aplicar só as marcadas
   (o resultado diz quantas deram certo e quantas falharam, e a linha que falhou ganha a etiqueta do motivo); depois, a
   caixinha de desfazer. O registro das correções aplicadas fica embaixo, e cada uma pode ser desfeita mais tarde. Com a
   tabela da pauta fora da base do PROMeiro, a tela só mostra as propostas, com o aviso.
   Juntar (#117), no computador: num grupo de atrações, "Juntar…" abre a escolha da ficha que fica e do nome final;
   juntar passa para ela as artes do acervo, as keys, as regras e as ligações das outras, que saem. O grupo sai da
   lista, e a caixinha de desfazer (e o registro) recria as fichas que saíram. */

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

/** "27/11/2026 14:05" (no fuso de quem vê) */
const quandoFoi = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

/** A etiqueta curta do motivo de uma falha (o texto inteiro vai na dica). */
const ETIQUETA: Record<string, string> = {
  mudou: "mudou desde a proposta",
  sumiu: "não existe mais",
  key: "espera a key nova",
  erro: "não gravou",
};

/** "2 deram certo e 1 falhou." */
const fraseDoResultado = (certas: number, falhas: number) =>
  [
    certas ? `${plural(certas, "deu certo", "deram certo")}` : "",
    falhas ? `${plural(falhas, "falhou", "falharam")}` : "",
  ]
    .filter(Boolean)
    .join(" e ") + ".";

/** O que o desfazer devolve, na frase do resultado. */
const VOLTOU_DA_PAUTA = "a claquete antiga voltou";
const VOLTOU_DAS_ATRACOES = "a ficha que saiu voltou, com as artes e as ligações";


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
  const escrita = dados.corrigir?.escrita ?? dados["nao-reconhecido"]?.escrita;
  const podeAplicar = !celular && escrita?.pode === true;

  // aplicar (#115): as marcadas da página, o resultado da última aplicação e a caixinha de desfazer
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<{
    texto: string;
    falhas: FalhaDaCorrecao[];
  } | null>(null);
  const [desfazivel, setDesfazivel] = useState<{
    ids: string[];
    texto: string;
    voltou?: string;
  } | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);
  // o registro relê quando muda (uma aplicação, um desfazer)
  const [mudou, setMudou] = useState(0);
  // trocou de página: as marcadas eram da outra
  useEffect(() => setMarcadas(new Set()), [paginas.corrigir]);
  const reler = () => {
    carregar("corrigir", paginas.corrigir);
    carregar("nao-reconhecido", paginas["nao-reconhecido"]);
    carregarAtracoes(paginaAtr);
    setMudou((n) => n + 1);
  };

  const aplicar = () => {
    const propostas = (dados.corrigir?.propostas ?? [])
      .filter((p) => marcadas.has(p.id))
      .map(({ id, de, mudouEm }) => ({ id, de, mudouEm }));
    if (!propostas.length) return;
    setAplicando(true);
    setResultado(null);
    setDesfazivel(null);
    aplicarCorrecoes(propostas)
      .then((r) => {
        setResultado({
          texto: fraseDoResultado(r.certas.length, r.falhas.length),
          falhas: r.falhas,
        });
        setMarcadas(new Set());
        if (r.certas.length)
          setDesfazivel({
            ids: r.certas.map((c) => c.registro),
            texto: `${plural(r.certas.length, "correção aplicada", "correções aplicadas")} na pauta.`,
          });
        reler();
      })
      .catch((e) =>
        setResultado({
          texto: e instanceof Error ? e.message : String(e),
          falhas: [],
        }),
      )
      .finally(() => setAplicando(false));
  };
  /** Desfaz pela caixinha ou pelo registro; o resultado vai para a mesma frase. */
  const desfazer = (ids: string[], voltou = VOLTOU_DA_PAUTA) => {
    setDesfazendo(true);
    return desfazerCorrecoes(ids)
      .then((r) => {
        setDesfazivel(null);
        setResultado({
          texto: r.falhas.length
            ? `${r.certas.length ? `${plural(r.certas.length, "desfeita", "desfeitas")}; ` : ""}${plural(r.falhas.length, "não foi desfeita", "não foram desfeitas")}: ${r.falhas[0].texto}`
            : `${plural(r.certas.length, "correção desfeita", "correções desfeitas")}: ${voltou}.`,
          falhas: [],
        });
        reler();
        return r;
      })
      .finally(() => setDesfazendo(false));
  };

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
              fica como está.
              {podeAplicar &&
                " Marque as que quer e aplique: o PROMeiro grava no Teable e guarda o valor antigo, para desfazer."}
            </p>
            {escrita && !escrita.pode && (
              <p className="cor-aviso" role="note">
                {escrita.aviso}
              </p>
            )}
            {resultado && (
              <p className="cor-resultado" role="status">
                {resultado.texto}
              </p>
            )}
            <Grupo
              grupo="corrigir"
              titulo="Pauta da edição"
              total={resumo.corrigir}
              dados={dados.corrigir}
              irPara={(n) => irPara("corrigir", n)}
              vazio="Todas as claquetes da pauta estão no padrão."
              marcar={
                podeAplicar
                  ? {
                      marcadas,
                      mudar: setMarcadas,
                      aplicar,
                      aplicando,
                      falhas: resultado?.falhas ?? [],
                    }
                  : undefined
              }
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
        <CaixinhaDoDesfazer
          caixinha={
            desfazivel && {
              id: desfazivel.ids.join(","),
              texto: desfazivel.texto,
              ocupado: desfazendo,
              desfazer: () => void desfazer(desfazivel.ids, desfazivel.voltou).catch((e) => setResultado({ texto: e instanceof Error ? e.message : String(e), falhas: [] })),
              fechar: () => setDesfazivel(null),
            }
          }
        />
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
          juntada={(id, j) => {
            // o grupo sai da lista, e a caixinha de desfazer recria as fichas que saíram
            setAtracoes((d) =>
              d
                ? {
                    ...d,
                    total: d.total - 1,
                    grupos: d.grupos.filter((g) => g.id !== id),
                  }
                : d,
            );
            setResultado({ texto: `Juntadas: ${j.resumo}.`, falhas: [] });
            setDesfazivel({
              ids: [j.registro],
              texto: `Atrações juntadas em ${j.nome}.`,
              voltou: VOLTOU_DAS_ATRACOES,
            });
            carregarAtracoes(paginaAtr);
            setMudou((n) => n + 1);
          }}
        />
        <Registro
          mudou={mudou}
          celular={celular}
          desfazer={desfazer}
          ocupado={desfazendo || aplicando}
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
  juntada,
}: {
  dados: PaginaDasAtracoes | null;
  falha: string;
  celular: boolean;
  irPara: (n: number) => void;
  tentarDeNovo: () => void;
  marcada: (id: string) => void;
  juntada: (id: string, j: JuncaoDeAtracoes) => void;
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
  // juntar (#117): o grupo aberto para juntar, a ficha que fica e o nome final
  const [escolha, setEscolha] = useState<{
    id: string;
    fica: string;
    nome: string;
  } | null>(null);
  const [juntando, setJuntando] = useState("");
  const abrirJuntar = (id: string, fichas: FichaParecida[]) => {
    // sugere a ficha com mais artes do acervo e Produções
    const fica = [...fichas].sort(
      (a, b) =>
        (b.artes ?? 0) + b.producoes - ((a.artes ?? 0) + a.producoes),
    )[0];
    setErro(null);
    setEscolha({ id, fica: fica.id, nome: fica.nome });
  };
  const escolherFica = (f: FichaParecida, fichas: FichaParecida[]) =>
    setEscolha((e) =>
      e
        ? {
            ...e,
            fica: f.id,
            // o nome segue a ficha escolhida, até alguém mudar à mão
            nome:
              e.nome === fichas.find((x) => x.id === e.fica)?.nome
                ? f.nome
                : e.nome,
          }
        : e,
    );
  const juntar = (fichas: FichaParecida[]) => {
    if (!escolha) return;
    const { id, fica, nome } = escolha;
    setJuntando(id);
    setErro(null);
    juntarAtracoes(
      fichas.map((f) => f.id),
      fica,
      nome,
    )
      .then((j) => {
        setEscolha(null);
        setGuardado("");
        juntada(id, j);
      })
      .catch((e) =>
        setErro({ id, texto: e instanceof Error ? e.message : String(e) }),
      )
      .finally(() => setJuntando(""));
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
          " Quando forem a mesma, junte: escolha a ficha que fica e o nome final, e as artes, as keys, as regras e as ligações das outras passam para ela. Quando não forem, diga “Não são a mesma”, e o grupo não volta."}
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
                  {!celular && escolha?.id !== g.id && (
                    <span className="cor-grupo-acoes">
                      <button
                        type="button"
                        className="botao"
                        disabled={!!marcando || !!juntando}
                        onClick={() => abrirJuntar(g.id, g.fichas)}
                      >
                        Juntar…
                      </button>
                      <button
                        type="button"
                        className="botao"
                        disabled={!!marcando || !!juntando}
                        onClick={() => marcar(g.id, g.fichas)}
                      >
                        {marcando === g.id ? "Guardando…" : "Não são a mesma"}
                      </button>
                    </span>
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
                      {escolha?.id === g.id && (
                        <th className="cor-marcar">Fica</th>
                      )}
                      <th>Ficha</th>
                      <th className="cor-num">Artes do acervo</th>
                      <th className="cor-num">Produções</th>
                      <th className="cor-num">Regras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.fichas.map((f) => (
                      <tr
                        key={f.id}
                        data-id={f.id}
                        className={
                          escolha?.id === g.id && escolha.fica === f.id
                            ? "marcada"
                            : ""
                        }
                      >
                        {escolha?.id === g.id && (
                          <td className="cor-marcar">
                            <input
                              type="radio"
                              name={`fica-${g.id}`}
                              aria-label={`Fica ${f.nome}`}
                              checked={escolha.fica === f.id}
                              disabled={!!juntando}
                              onChange={() => escolherFica(f, g.fichas)}
                            />
                          </td>
                        )}
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
                {escolha?.id === g.id && (
                  <div className="cor-juntar">
                    <label className="cor-nome-final">
                      <span>Nome final</span>
                      <input
                        type="text"
                        list={`nomes-${g.id}`}
                        value={escolha.nome}
                        maxLength={80}
                        disabled={!!juntando}
                        onChange={(e) =>
                          setEscolha({ ...escolha, nome: e.target.value })
                        }
                      />
                      <datalist id={`nomes-${g.id}`}>
                        {g.fichas.map((f) => (
                          <option key={f.id} value={f.nome} />
                        ))}
                      </datalist>
                    </label>
                    <p className="cor-juntar-texto">
                      {(() => {
                        const saem = g.fichas.filter(
                          (f) => f.id !== escolha.fica,
                        );
                        return `${saem.map((f) => f.nome).join(", ")} ${saem.length === 1 ? "sai" : "saem"}: as artes do acervo, as keys, as regras e as ligações passam para a que fica.`;
                      })()}
                    </p>
                    <span className="cor-grupo-acoes">
                      <button
                        type="button"
                        className="botao-texto"
                        disabled={!!juntando}
                        onClick={() => setEscolha(null)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="botao primario"
                        disabled={!!juntando || !escolha.nome.trim()}
                        onClick={() => juntar(g.fichas)}
                      >
                        {juntando === g.id ? "Juntando…" : "Juntar"}
                      </button>
                    </span>
                  </div>
                )}
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
  marcar,
}: {
  grupo: GrupoDaPauta;
  titulo: string;
  explicacao?: string;
  total: number;
  dados?: PaginaDaCorrecao;
  irPara: (n: number) => void;
  vazio?: string;
  /** marcar e aplicar (#115): só no computador, com a tabela da pauta na base do PROMeiro */
  marcar?: {
    marcadas: Set<string>;
    mudar: (m: Set<string>) => void;
    aplicar: () => void;
    aplicando: boolean;
    falhas: FalhaDaCorrecao[];
  };
}) {
  const id = `cor-${grupo}`;
  // as que podem ser marcadas: as da página, menos as que esperam a key nova
  const marcaveis = (dados?.propostas ?? []).filter((p) => !p.esperaAKey);
  const todas =
    !!marcar &&
    marcaveis.length > 0 &&
    marcaveis.every((p) => marcar.marcadas.has(p.id));
  const falhaDe = (pid: string) => marcar?.falhas.find((f) => f.id === pid);
  const alternar = (pid: string) => {
    if (!marcar) return;
    const m = new Set(marcar.marcadas);
    if (m.has(pid)) m.delete(pid);
    else m.add(pid);
    marcar.mudar(m);
  };
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
          {marcar && (
            <div className="cor-aplicar">
              <span className="cor-marcadas">
                {marcar.marcadas.size
                  ? plural(marcar.marcadas.size, "marcada", "marcadas")
                  : "Marque as propostas para aplicar"}
              </span>
              {marcar.marcadas.size > 0 && (
                <button
                  type="button"
                  className="botao-texto"
                  disabled={marcar.aplicando}
                  onClick={() => marcar.mudar(new Set())}
                >
                  desmarcar
                </button>
              )}
              <button
                type="button"
                className="botao primario"
                disabled={!marcar.marcadas.size || marcar.aplicando}
                onClick={marcar.aplicar}
              >
                {marcar.aplicando
                  ? "Aplicando…"
                  : marcar.marcadas.size
                    ? `Aplicar ${plural(marcar.marcadas.size, "marcada", "marcadas")}`
                    : "Aplicar"}
              </button>
            </div>
          )}
          <table className="cor-tabela">
            <thead>
              <tr>
                {marcar && (
                  <th className="cor-marcar">
                    <input
                      type="checkbox"
                      aria-label="Marcar todas da página"
                      checked={todas}
                      disabled={!marcaveis.length || marcar.aplicando}
                      onChange={() =>
                        marcar.mudar(
                          todas
                            ? new Set()
                            : new Set(marcaveis.map((p) => p.id)),
                        )
                      }
                    />
                  </th>
                )}
                <th className="cor-dia">Dia</th>
                <th className="cor-editor">Editor</th>
                <th>{grupo === "corrigir" ? "De → para" : "Claquete"}</th>
              </tr>
            </thead>
            <tbody>
              {dados.propostas.map((p) => {
                const { de, para } = partes(p);
                const falha = falhaDe(p.id);
                return (
                  <tr
                    key={p.id}
                    data-id={p.id}
                    className={marcar?.marcadas.has(p.id) ? "marcada" : ""}
                  >
                    {marcar && (
                      <td className="cor-marcar">
                        <input
                          type="checkbox"
                          aria-label={`Marcar ${p.de}`}
                          checked={marcar.marcadas.has(p.id)}
                          disabled={!!p.esperaAKey || marcar.aplicando}
                          onChange={() => alternar(p.id)}
                        />
                      </td>
                    )}
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
                      <span className="cor-etiquetas">
                        {p.esperaAKey && (
                          <span
                            className="cor-etiqueta"
                            data-motivo="key"
                            title="A fórmula da key no Teable ainda não entende o (M): gravar mudaria a key da linha."
                          >
                            espera a key nova
                          </span>
                        )}
                        {falha && !p.esperaAKey && (
                          <span
                            className="cor-etiqueta"
                            data-motivo={falha.motivo}
                            title={falha.texto}
                          >
                            {ETIQUETA[falha.motivo] ?? falha.texto}
                          </span>
                        )}
                      </span>
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

/** O registro das correções aplicadas (#115): a mais recente primeiro, com quem aplicou e quando; cada uma pode ser
    desfeita (no computador), com a conferência de "mudou desde então". */
function Registro({
  mudou,
  celular,
  desfazer,
  ocupado,
}: {
  mudou: number;
  celular: boolean;
  desfazer: (ids: string[], voltou?: string) => Promise<{ falhas: FalhaDaCorrecao[] }>;
  ocupado: boolean;
}) {
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<PaginaDoRegistro | null>(null);
  const [falha, setFalha] = useState("");
  const [erro, setErro] = useState<{ id: string; texto: string } | null>(null);
  const [indo, setIndo] = useState("");
  useEffect(() => {
    setFalha("");
    lerRegistroDeCorrecoes(pagina)
      .then(setDados)
      .catch((e) => setFalha(e instanceof Error ? e.message : String(e)));
  }, [pagina, mudou]);
  const desfazerUma = (c: CorrecaoAplicada) => {
    setIndo(c.id);
    setErro(null);
    desfazer([c.id], c.tipo === "pauta" ? VOLTOU_DA_PAUTA : VOLTOU_DAS_ATRACOES)
      .then((r) => r.falhas.length && setErro({ id: c.id, texto: r.falhas[0].texto }))
      .catch((e) => setErro({ id: c.id, texto: e instanceof Error ? e.message : String(e) }))
      .finally(() => setIndo(""));
  };
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1;
  return (
    <section className="cfg-secao cor-secao" aria-labelledby="cor-registro" data-grupo="registro">
      <div className="cfg-secao-topo">
        <h2 id="cor-registro">Correções aplicadas</h2>
        {dados && <span className="cor-conta">{dados.total.toLocaleString("pt-BR")}</span>}
      </div>
      <p className="cor-linha">
        O registro de cada correção gravada no Teable: o que era, o que ficou, quem aplicou e quando.
        {!celular && " Desfazer grava o valor antigo de volta, se a linha não mudou desde então; numa junção de atrações, recria a ficha que saiu e religa as artes."}
      </p>
      {falha ? (
        <p className="cfg-falha" role="alert">
          {falha}
        </p>
      ) : !dados ? (
        <p className="cfg-lendo">Lendo o registro…</p>
      ) : !dados.total ? (
        <p className="cor-linha cor-vazio">Nenhuma correção aplicada ainda.</p>
      ) : (
        <>
          <table className="cor-tabela cor-registro">
            <thead>
              <tr>
                <th className="cor-dia">Quando</th>
                <th className="cor-editor">Quem</th>
                <th>De → para</th>
                <th className="cor-estado" />
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((c) => {
                const p = { id: c.alvo, dia: c.detalhes.dia ?? "", editor: c.detalhes.editor ?? "", de: c.antes.claquete ?? "", para: c.depois.claquete ?? "", mudouEm: null };
                const { de, para } = partes(p);
                return (
                  <tr key={c.id} data-id={c.id} className={c.desfeita ? "desfeita" : ""}>
                    <td className="cor-dia">{quandoFoi(c.em)}</td>
                    <td className="cor-editor">{c.porNome}</td>
                    <td className="cor-claquetes">
                      {c.tipo === "pauta" ? (
                        <div className="cor-de-para">
                          <Claquete parte={de} classe="cor-antes" />{" "}
                          <span className="cor-seta">→</span>{" "}
                          {para && <Claquete parte={para} classe="cor-depois" />}
                        </div>
                      ) : (
                        // os outros tipos (juntar atrações, #117) dizem o que fizeram no resumo dos detalhes
                        <div className="cor-de-para">{String(c.detalhes.resumo ?? c.tipo)}</div>
                      )}
                      {p.dia && (
                        <span className="cor-da-linha">
                          pauta de {quando(p.dia)}
                          {p.editor ? `, ${p.editor}` : ""}
                        </span>
                      )}
                      {erro?.id === c.id && (
                        <p className="cfg-falha" role="alert">
                          {erro.texto}
                        </p>
                      )}
                    </td>
                    <td className="cor-estado">
                      {c.desfeita ? (
                        <span className="cor-etiqueta" data-motivo="desfeita" title={`Desfeita por ${c.desfeita.porNome} em ${quandoFoi(c.desfeita.em)}`}>
                          desfeita por {c.desfeita.porNome}, {quandoFoi(c.desfeita.em)}
                        </span>
                      ) : (
                        !celular && (
                          <button type="button" className="botao" disabled={ocupado || !!indo} onClick={() => desfazerUma(c)}>
                            {indo === c.id ? "Desfazendo…" : "Desfazer"}
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Paginas titulo="Correções aplicadas" pagina={dados.pagina} paginas={paginas} irPara={setPagina} />
        </>
      )}
    </section>
  );
}
