import { useMemo, useState } from 'react';
import type { Run } from '../importar/bruto';
import { montarDoc, type Importacao } from '../importar';
import { exportar } from '../modelo/exportar';
import { Icone } from './icones';
import { Claquete, Marca } from './pecas';

const COR_WORD: Record<string, string> = { yellow: '#fff200', cyan: '#00ffff', green: '#00ff00', magenta: '#ff00ff', lightGray: '#d9d9d9' };

function Trecho({ r }: { r: Run }) {
  // o sublinhado do original é o que vira arte: aparece em destaque
  if (r.u && r.t.trim()) return <span className="achou">{r.t}</span>;
  return (
    <span
      style={{
        fontWeight: r.b ? 700 : undefined,
        fontStyle: r.i ? 'italic' : undefined,
        background: r.hl ? (COR_WORD[r.hl] ?? `#${r.hl}`) : undefined,
        color: r.cor ? `#${r.cor}` : undefined,
      }}
    >
      {r.t}
    </span>
  );
}
const Par = ({ par }: { par: Run[] }) => <p>{par.length ? par.map((r, i) => <Trecho key={i} r={r} />) : ' '}</p>;

/** Tela 1: o arquivo como veio, com o que foi identificado ao lado. Nada é reescrito aqui. */
export function TelaImportar({ imp, concluir, cancelar }: { imp: Importacao; concluir: () => void; cancelar: () => void }) {
  const [abrindo, setAbrindo] = useState(false);
  const m = imp.meta;
  const artes = useMemo(() => exportar({ id: 'previa', meta: imp.meta, doc: montarDoc(imp), revisao: 1, criadoEm: '', atualizadoEm: '' }).artes, [imp]);

  return (
    <div className="pagina conferir">
      <header className="topo">
        <div className="topo-esq">
          <button className="botao-icone" aria-label="Descartar e voltar" title="Descartar" onClick={cancelar}><Icone nome="voltar" tam={18} /></button>
          <Marca />
        </div>
        <ol className="passos" aria-label="Etapas">
          <li aria-current="step"><i>1</i>Arquivo</li>
          <li><i>2</i>Roteiro</li>
        </ol>
        <div className="topo-dir" />
      </header>

      <div className="mesa">
        <div className="area">
            <article className="folha folha-original">
              {(m.programa || m.praca) && (
                <header className="topo-folha">
                  {m.programa ? <div className="atracao"><span className="rotulo">Atração</span><h2>{m.programa}</h2></div> : <span />}
                  {m.praca && <div className="praca"><span className="rotulo">Praça</span><div className="pracas"><b>{m.praca}</b></div></div>}
                </header>
              )}
              <div className="original">
              <div className="word">
                {imp.bruto.blocos.map((b, i) =>
                  b.tipo === 'p' ? (
                    <Par key={i} par={b.par} />
                  ) : (
                    <table key={i}>
                      <tbody>
                        {b.linhas.map((linha, j) => (
                          <tr key={j}>{linha.map((cel, k) => <td key={k}>{cel.map((p, x) => <Par key={x} par={p} />)}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  ),
                )}
              </div>
              <p className="legenda"><span className="achou">sublinhado</span> no arquivo vira arte. Nada do original é alterado.</p>
              {imp.bruto.avisos?.map((a) => <p key={a} className="imp-faltando">{a}</p>)}
              </div>
              <footer className="rodape-arquivo"><Icone nome="arquivo" tam={15} /><span>{imp.bruto.arquivo}</span></footer>
            </article>

          <aside className="lado" aria-label="O que foi identificado">
            <Claquete dados={m} />
            <section className="cartao">
              <div className="cab-artes"><b><i>{artes.length}</i> {artes.length === 1 ? 'arte' : 'artes'}</b><span className="rotulo">na ordem</span></div>
              {artes.length ? (
                <ol className="artes">
                  {artes.map((a) => <li key={a.id}><span className="b">{a.ordem}</span><span className="txt"><b>{a.texto}</b></span></li>)}
                </ol>
              ) : (
                <p className="suave pequeno">Nenhum trecho sublinhado no arquivo. Dá para marcar as artes no roteiro.</p>
              )}
            </section>
            <button
              className="botao primario grande"
              disabled={abrindo}
              onClick={() => {
                setAbrindo(true);
                concluir();
              }}
            >
              Está certo, abrir roteiro <Icone nome="seta" tam={15} traco={2.2} />
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
