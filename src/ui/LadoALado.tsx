import { useEffect, useMemo, useState } from 'react';
import { lerAFotoDoDia } from '../dados/armazenamento';
import { horarioNoPadrao, type DiaDaEscala, type PosicaoDaEscala } from '../modelo/escala';
import { diferencasDaFoto, type CampoDaDiferenca, type DiferencaDaPosicao, type FotoDoDia } from '../modelo/fotoDaPlanilha';
import { rotuloDaIlha } from '../modelo/ilhas';
import { partes } from './pecasDaPauta';
import './ladoALado.css';

/* A semana lado a lado com a planilha (#133): na tela de montar, acima da grade, a faixa que compara o dia montado no
   PROMeiro com a foto mais nova da planilha do mesmo dia (que o n8n manda de hora em hora). Diz de quando é a foto e
   quantas posições diferem; aberta, lista as diferenças posição por posição (ilha, horário, turno, demandas e avisos
   que só um lado tem, e quem está fora só de um lado) e, à parte, a foto crua, como a planilha estava. A comparação é
   refeita com o que está sendo digitado (o servidor manda o que leu da foto). Só lê: nada vai para a planilha. */

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(':', 'h');
const diaMes = (iso: string) => {
  const p = partes(new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
  return `${p.dia}/${p.mes + 1}`;
};
const quando = (iso: string) => `${diaMes(iso)} às ${hora(iso)}`;
const NOME_DO_CAMPO: Record<CampoDaDiferenca, string> = { turno: 'Turno', ilha: 'Ilha', horario: 'Horário', demandas: 'Demandas', avisos: 'Avisos' };

/** As posições como o servidor grava: o horário no padrão, sem as linhas de demanda e de aviso vazias. */
const comoGravadas = (ps: readonly PosicaoDaEscala[]) =>
  ps.map((p) => ({ ...p, horario: horarioNoPadrao(p.horario), demandas: p.demandas.filter((d) => d.texto.trim()), avisos: p.avisos.filter((a) => a.texto.trim()) }));

interface Props {
  dados: DiaDaEscala;
  /** as posições de agora, ainda sem gravar */
  posicoes: readonly PosicaoDaEscala[];
  /** quem está fora no dia, no PROMeiro (a caixa "Fora") */
  foraNoDia: readonly string[];
}

export function LadoALado({ dados, posicoes, foraNoDia }: Props) {
  const [lido, setLido] = useState<FotoDoDia | null>(null);
  const [falha, setFalha] = useState('');
  const [aberto, setAberto] = useState(false);
  const dia = dados.dia;
  useEffect(() => {
    let vale = true;
    setLido(null);
    setFalha('');
    lerAFotoDoDia(dia).then(
      (r) => vale && setLido(r),
      (e: unknown) => vale && setFalha(e instanceof Error ? e.message : 'não consegui ler a foto'),
    );
    return () => {
      vale = false;
    };
  }, [dia]);

  const diferencas = useMemo(
    () => (lido?.daFoto ? diferencasDaFoto(comoGravadas(posicoes), lido.daFoto.posicoes, { dia, foraNoPromeiro: foraNoDia, foraNaPlanilha: lido.daFoto.fora, ilhas: dados.ilhas }) : null),
    [lido, posicoes, foraNoDia, dia, dados.ilhas],
  );

  if (falha) return <p className="lado lado-falha">Lado a lado com a planilha: {falha}.</p>;
  if (!lido) return null;
  if (!lido.foto || !diferencas)
    return (
      <p className="lado lado-sem" role="status">
        <b>Lado a lado com a planilha</b> · ainda não chegou foto da planilha para este dia (o n8n manda de hora em hora).
      </p>
    );
  const { foto } = lido;
  const fora = diferencas.fora.soNoPromeiro.length + diferencas.fora.soNaPlanilha.length;
  const total = diferencas.posicoes.length + fora;
  const nomeDoTurno = (id: string) => dados.turnos.find((t) => t.id === id)?.nome ?? id;
  const valor = (campo: CampoDaDiferenca, v: string) => {
    if (campo === 'turno') return nomeDoTurno(v);
    if (campo === 'ilha') {
      const i = dados.ilhas.find((x) => x.id === v);
      return i ? rotuloDaIlha(i) : v;
    }
    return v;
  };
  return (
    <section className={`lado${total ? ' com-diferencas' : ' igual'}`} aria-label="Lado a lado com a planilha">
      <div className="lado-cab">
        <span className={`lado-ponto${total ? ' difere' : ''}`} aria-hidden="true" />
        <span className="lado-texto">
          <b>Lado a lado com a planilha</b> · aba {foto.aba}, lida {quando(foto.lidaEm)}
          {foto.confirmadaEm !== foto.recebidaEm && <> (igual até {quando(foto.confirmadaEm)})</>}
          {' · '}
          {total ? (
            <span className="lado-conta">
              {total} {total === 1 ? 'diferença' : 'diferenças'}
            </span>
          ) : (
            'tudo igual'
          )}
          {diferencas.iguais > 0 && ` · ${diferencas.iguais} ${diferencas.iguais === 1 ? 'posição igual' : 'posições iguais'}`}
        </span>
        <button type="button" className="botao-texto" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
          {aberto ? 'esconder' : total ? 'ver as diferenças' : 'ver a foto'}
        </button>
      </div>
      {aberto && (
        <div className="lado-corpo">
          {diferencas.posicoes.length > 0 && (
            <ul className="lado-lista" aria-label="Diferenças por posição">
              {diferencas.posicoes.map((d, i) => (
                <Posicao key={`${d.turno}-${d.editor}-${i}`} d={d} nomeDoTurno={nomeDoTurno} valor={valor} />
              ))}
            </ul>
          )}
          {diferencas.fora.soNaPlanilha.length > 0 && (
            <p className="lado-fora">
              <span className="lado-onde planilha">fora só na planilha</span> {diferencas.fora.soNaPlanilha.join(', ')}
            </p>
          )}
          {diferencas.fora.soNoPromeiro.length > 0 && (
            <p className="lado-fora">
              <span className="lado-onde promeiro">fora só no PROMeiro</span> {diferencas.fora.soNoPromeiro.join(', ')}
            </p>
          )}
          <details className="lado-foto">
            <summary>A foto crua da aba {foto.aba}</summary>
            <div className="lado-grade">
              <table>
                <tbody>
                  {foto.linhas.map((l, i) => (
                    <tr key={i}>
                      {l.map((c, j) => (
                        <td key={j}>{c.trim()}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

function Posicao({ d, nomeDoTurno, valor }: { d: DiferencaDaPosicao; nomeDoTurno: (id: string) => string; valor: (campo: CampoDaDiferenca, v: string) => string }) {
  const lista = (campo: CampoDaDiferenca, vs: string[]) => (vs.length ? vs.map((v) => valor(campo, v)).join(' · ') : '—');
  return (
    <li className="lado-pos">
      <div className="lado-pos-cab">
        <b>{d.editor || 'vaga'}</b>
        <span className="lado-turno">{nomeDoTurno(d.turno)}</span>
        {d.onde === 'so-no-promeiro' && <span className="lado-onde promeiro">só no PROMeiro</span>}
        {d.onde === 'so-na-planilha' && <span className="lado-onde planilha">só na planilha</span>}
      </div>
      {d.campos.length > 0 && (
        <table className="lado-campos">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">PROMeiro</th>
              <th scope="col">Planilha</th>
            </tr>
          </thead>
          <tbody>
            {d.campos.map((c) => (
              <tr key={c.campo}>
                <th scope="row">{NOME_DO_CAMPO[c.campo]}</th>
                <td>{lista(c.campo, c.promeiro)}</td>
                <td>{lista(c.campo, c.planilha)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}
