import { useMemo, useState } from 'react';
import type { Run } from '../importar/bruto';
import type { Importacao, Resposta } from '../importar';
import { ETIQUETAS } from '../modelo/tipos';
import { Icone } from './icones';
import { dataPorExtenso, plural } from './util';

const NOMES: Record<Resposta, string> = {
  cortavel: 'Pode cortar', producao: 'Recado para a produção', sonoplastia: 'Sonoplastia', locutor: 'Para o locutor',
  edicao: 'Para a edição', comentario: 'Comentário', ignorar: 'É texto normal',
};
const COR_WORD: Record<string, string> = { yellow: '#fff200', cyan: '#00ffff', green: '#00ff00', magenta: '#ff00ff', lightGray: '#d9d9d9' };

function Trecho({ r }: { r: Run }) {
  return (
    <span
      style={{
        fontWeight: r.b ? 700 : undefined,
        fontStyle: r.i ? 'italic' : undefined,
        textDecoration: r.u ? 'underline' : undefined,
        background: r.hl ? (COR_WORD[r.hl] ?? `#${r.hl}`) : undefined,
        color: r.cor ? `#${r.cor}` : undefined,
      }}
    >
      {r.t}
    </span>
  );
}
const Par = ({ par }: { par: Run[] }) => <p>{par.length ? par.map((r, i) => <Trecho key={i} r={r} />) : ' '}</p>;

export function TelaImportar({ imp, concluir, cancelar }: { imp: Importacao; concluir: (r: Record<number, Resposta>) => void; cancelar: () => void }) {
  const [respostas, setRespostas] = useState<Record<number, Resposta>>(() => Object.fromEntries(imp.perguntas.map((p) => [p.id, p.sugestao])));
  const [abrindo, setAbrindo] = useState(false);
  const n = imp.perguntas.length;
  const m = imp.meta;

  const resumo = useMemo(() => {
    const partes = [
      m.locutor && `locução de ${m.locutor}`,
      m.selo && `selo ${m.selo === 'Verifique a classificação indicativa' ? '“Verifique”' : m.selo}`,
      m.duracaoAlvoSeg && `${m.duracaoModo === 'max' ? 'no máximo ' : ''}${m.duracaoAlvoSeg}''`,
    ].filter(Boolean);
    return partes.length ? `, com ${partes.join(', ')}` : '';
  }, [m]);
  const contagens = imp.entendido.filter((e) => /→ \d+ (arte|sonora)/.test(e)).map((e) => e.split('→ ')[1]);

  return (
    <div className="pagina">
      <main className="importar">
        <header className="imp-topo">
          <div className="rotulo imp-arquivo"><Icone nome="arquivo" tam={14} />{imp.bruto.arquivo}</div>
          <h1 className="titulo-serifa grande">
            Tudo no lugar. {n ? <>Só {n === 1 ? 'falta' : 'faltam'} <em>{n === 1 ? 'uma confirmação' : `${n} confirmações`}</em>.</> : <em>Nenhuma dúvida.</em>}
          </h1>
          <p className="imp-resumo">
            Li o arquivo inteiro: <strong>{[m.programa, m.titulo].filter(Boolean).join(' · ') || 'um roteiro'}</strong>
            {m.dataExibicao && `, para ${dataPorExtenso(m.dataExibicao)}`}{resumo}.
            {contagens.length > 0 && ` Encontrei ${contagens.join(' e ')}.`}
            {n > 0 && ' Só não sei o que significam algumas cores que foram usadas.'}
          </p>
        </header>

        <div className="imp-corpo">
          <section aria-label="Como estava no Word">
            <h2 className="rotulo">Como estava no Word</h2>
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
            <p className="suave pequeno">Nada do arquivo original é alterado.</p>
          </section>

          <section aria-label="Confirmações" className="imp-perguntas">
            {n > 0 && <h2 className="rotulo">{plural(n, 'confirmação rápida', 'confirmações rápidas')}</h2>}
            {imp.perguntas.map((p, i) => (
              <article key={p.id} className="pergunta">
                <span className="pergunta-n">{i + 1}</span>
                <div className="pergunta-corpo">
                  <h3>{p.pergunta}</h3>
                  <ul className="pergunta-trechos">
                    {p.trechos.slice(0, 4).map((t, k) => (
                      <li key={k}><span style={p.estilo === 'marca-texto' ? { background: p.corCss } : { color: p.corCss }}>{t}</span></li>
                    ))}
                    {p.trechos.length > 4 && <li className="suave">e mais {p.trechos.length - 4}</li>}
                  </ul>
                  <div className="opcoes" role="radiogroup" aria-label={p.pergunta}>
                    {[p.sugestao, ...(['ignorar', ...ETIQUETAS.map((e) => e.id)] as Resposta[]).filter((o) => o !== p.sugestao)].map((o) => (
                      <button key={o} role="radio" aria-checked={respostas[p.id] === o} className="opcao" onClick={() => setRespostas({ ...respostas, [p.id]: o })}>
                        {NOMES[o]}
                      </button>
                    ))}
                  </div>
                  <p className="suave pequeno">{p.porque} A sugestão já vem marcada.</p>
                </div>
              </article>
            ))}

            {imp.bruto.avisos?.map((a) => <p key={a} className="imp-faltando">{a}</p>)}

            {imp.faltando.length > 0 && (
              <p className="imp-faltando">
                Não encontrei <strong>{imp.faltando.join(', ').replace(/, ([^,]*)$/, ' e $1')}</strong>. Dá para completar direto no roteiro.
              </p>
            )}

            <details className="entendido" open={n === 0}>
              <summary>O que entendi sozinho ({imp.entendido.length})</summary>
              <ul>{imp.entendido.map((e) => <li key={e}>{e}</li>)}</ul>
            </details>
          </section>
        </div>

        <footer className="imp-rodape">
          <button className="botao" onClick={cancelar}>Descartar</button>
          <button
            className="botao primario"
            disabled={abrindo}
            onClick={() => {
              setAbrindo(true);
              concluir(respostas);
            }}
          >
            Abrir o roteiro <Icone nome="seta" tam={14} traco={2.2} />
          </button>
        </footer>
      </main>
    </div>
  );
}
