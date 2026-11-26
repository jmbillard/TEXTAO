import { useCallback, useEffect, useState } from 'react';
import { lerHistoricoDaConfiguracao, voltarNoHistorico, type EntradaDoHistorico } from '../dados/armazenamento';
import { Icone } from './icones';
import { Marca } from './pecas';
import { useTelaDeCelular } from './faixa';
import './configuracao.css';

/* O Histórico da Configuração (#78), a página ligada pelo rodapé: quem mudou o quê e quando, o antigo → o novo com os
   nomes do Trello (o servidor descreve cada gravação, de qualquer seção). "Voltar" aplica na hora os valores de antes
   daquela mudança, depois da mesma conferência da seção; o que não passa fica travado e diz o porquê. No celular, só
   consulta. */

interface Props {
  voltar: () => void;
  avisar: (texto: string) => void;
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');
/** "hoje, 10:12", "ontem, 16:05", "21/11, 09:30" (de outro ano, "21/11/2025, 09:30"). */
export function quandoFoi(em: string, agora = new Date()): string {
  const d = new Date(em);
  if (Number.isNaN(d.getTime())) return '';
  const hora = `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(agora) - dia(d)) / 86_400_000);
  if (dias === 0) return `hoje, ${hora}`;
  if (dias === 1) return `ontem, ${hora}`;
  const data = `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}${d.getFullYear() === agora.getFullYear() ? '' : `/${d.getFullYear()}`}`;
  return `${data}, ${hora}`;
}

export function HistoricoDaConfiguracao({ voltar, avisar }: Props) {
  const celular = useTelaDeCelular();
  const [entradas, setEntradas] = useState<EntradaDoHistorico[] | null>(null);
  const [falha, setFalha] = useState('');
  const [voltando, setVoltando] = useState<number | null>(null);
  const carregar = useCallback(() => {
    setFalha('');
    lerHistoricoDaConfiguracao()
      .then(setEntradas)
      .catch((e) => setFalha(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(carregar, [carregar]);

  const voltarA = async (e: EntradaDoHistorico) => {
    setVoltando(e.id);
    try {
      setEntradas(await voltarNoHistorico(e.id));
      avisar('Voltou. Já vale.');
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : String(erro));
      carregar();
    } finally {
      setVoltando(null);
    }
  };
  const porId = new Map((entradas ?? []).map((e) => [e.id, e]));
  const travadas = (entradas ?? []).some((e) => !e.voltar.pode && !e.voltar.jaVale);

  return (
    <div className={`pagina configuracao ${celular ? 'no-celular' : ''}`}>
      <header className="cad-topo">
        <button className="voltar-cad" onClick={voltar}>
          <Icone nome="voltar" tam={16} /> Configuração
        </button>
        <Marca />
        <span />
      </header>
      <main className="cfg">
        <div className="cfg-cabeca">
          <h1>Histórico</h1>
        </div>
        {celular && <p className="cfg-so-consulta">No celular, só consulta. Voltar é no computador.</p>}
        {falha ? (
          <p className="cfg-falha" role="alert">
            {falha} <button className="botao-texto" onClick={carregar}>Tentar de novo</button>
          </p>
        ) : !entradas ? (
          <p className="cfg-lendo">Lendo o histórico…</p>
        ) : !entradas.length ? (
          <p className="cfg-lendo">Nada mudou na Configuração ainda.</p>
        ) : (
          <section className="cfg-secao cfg-historico" aria-label="Histórico">
            <table className="cfg-hist">
              <tbody>
                {entradas.map((e) => {
                  const de = e.voltouDe !== null ? porId.get(e.voltouDe) : undefined;
                  return (
                    <tr key={e.id} data-id={e.id} className={e.voltouDe !== null ? 'voltou' : ''}>
                      <td className="cfg-hist-q">
                        {quandoFoi(e.em)} <small>{e.quem}</small>
                      </td>
                      <td className="cfg-hist-c">
                        {e.linhas.map((l, i) => (
                          <div className="cfg-hist-l" key={i}>
                            <b>{l.oque}</b>{' '}
                            <small>
                              <span className="velho">{l.antes}</span>{' '}
                              <span className="seta" aria-label="para">
                                →
                              </span>{' '}
                              <span className="novo">{l.depois}</span>
                            </small>
                          </div>
                        ))}
                        {e.voltouDe !== null && <span className="cfg-hist-etq">voltou{de ? ` a ${quandoFoi(de.em)}` : ''}</span>}
                        {!celular && !e.voltar.pode && !e.voltar.jaVale && (
                          <p className="cfg-hist-motivo">
                            <Icone nome="cadeado" tam={12} /> {e.voltar.motivo}
                          </p>
                        )}
                      </td>
                      {!celular && (
                        <td className="cfg-hist-acao">
                          {e.voltar.jaVale ? (
                            <span className="cfg-hist-etq">vale agora</span>
                          ) : (
                            <button
                              type="button"
                              className="botao"
                              disabled={!e.voltar.pode || voltando !== null}
                              title={e.voltar.pode ? 'Voltar aos valores de antes desta mudança' : e.voltar.motivo}
                              onClick={() => void voltarA(e)}
                            >
                              <Icone nome={e.voltar.pode ? 'desfazer' : 'cadeado'} tam={14} /> {voltando === e.id ? 'Voltando…' : 'Voltar'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
        {travadas && !celular && (
          <p className="cfg-hist-nota">
            <Icone nome="cadeado" tam={12} /> “Voltar” travado: o valor antigo não passa mais na conferência.
          </p>
        )}
      </main>
    </div>
  );
}
