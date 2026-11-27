import { useCallback, useEffect, useState } from "react";
import { lerCorrecoesDaPauta } from "../dados/armazenamento";
import type {
  GrupoDaPauta,
  PaginaDaCorrecao,
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
   computador e no celular (no celular, cada linha vira um cartão). */

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
            </p>
            <p className="cor-linha">
              A pauta inteira, lida do Teable. O padrão das versões é uma letra
              por versão, maiúscula, entre parênteses, no fim da claquete: (A)
              amanhã, (H) hoje, (N) nesta, (P) próxima, (D) dia, (M) mês, e
              (MNT) manutenção da grade. Só o código muda; o resto da claquete
              fica como está. Por enquanto, só para conferir.
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
      </main>
    </div>
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
          {paginas > 1 && (
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
          )}
        </>
      )}
    </section>
  );
}
