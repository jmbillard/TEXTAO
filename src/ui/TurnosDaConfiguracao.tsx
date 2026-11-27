import { horarioEntendido, horarioNoPadrao, lerHorario, type TurnoDaEscala } from '../modelo/escala';
import { Icone } from './icones';
import './turnosDaConfiguracao.css';

/* A lista da seção Turnos da Configuração (#124), como a das praças: cada turno com o nome e o horário padrão de uma
   posição nova (escrito de qualquer jeito, gravado no padrão), a ordem da grade (↑ ↓), tirar e "+ Novo turno". O
   que muda fica no rascunho da tela até "Conferir e salvar". O id do turno (que as posições guardam) não aparece: o
   nome muda sem mexer nas posições. No celular, só consulta. */

interface Props {
  turnos: TurnoDaEscala[];
  podeMudar: boolean;
  mudar: (turnos: TurnoDaEscala[]) => void;
}

export function ListaDosTurnos({ turnos, podeMudar, mudar }: Props) {
  const trocar = (i: number, m: Partial<TurnoDaEscala>) => mudar(turnos.map((t, k) => (k === i ? { ...t, ...m } : t)));
  const mover = (de: number, para: number) => {
    if (para < 0 || para >= turnos.length) return;
    const novos = [...turnos];
    const [t] = novos.splice(de, 1);
    novos.splice(para, 0, t);
    mudar(novos);
  };
  return (
    <>
      <ul className="cfg-turnos" aria-label="Turnos">
        {turnos.map((t, i) => {
          const h = lerHorario(t.horario);
          const padrao = horarioNoPadrao(t.horario);
          return (
            <li key={t.id || `novo-${i}`} className={`cfg-turno${t.id ? '' : ' novo'}`}>
              {podeMudar ? (
                <>
                  <span className="cfg-turno-ordem">
                    <button type="button" className="botao-icone pequeno" aria-label={`Subir ${t.nome || 'o turno'}`} disabled={i === 0} onClick={() => mover(i, i - 1)}>
                      <Icone nome="baixo" tam={13} style={{ transform: 'rotate(180deg)' }} />
                    </button>
                    <button type="button" className="botao-icone pequeno" aria-label={`Descer ${t.nome || 'o turno'}`} disabled={i === turnos.length - 1} onClick={() => mover(i, i + 1)}>
                      <Icone nome="baixo" tam={13} />
                    </button>
                  </span>
                  <input className="entrada-cad cfg-turno-nome" aria-label="Nome do turno" value={t.nome} placeholder="nome do turno" onChange={(e) => trocar(i, { nome: e.target.value })} />
                  <span className="cfg-turno-h">
                    <input
                      className="entrada-cad"
                      aria-label={`Horário padrão${t.nome ? ` de ${t.nome}` : ''}`}
                      value={t.horario}
                      placeholder="ex.: 6h às 15h"
                      spellCheck={false}
                      onChange={(e) => trocar(i, { horario: e.target.value })}
                      onBlur={() => padrao !== t.horario && trocar(i, { horario: padrao })}
                    />
                    <small className={h && !horarioEntendido(h) ? 'erro' : ''}>{!h ? 'sem horário' : horarioEntendido(h) ? (h.padrao !== t.horario.trim() ? `grava ${h.padrao}` : h.viraODia ? 'vira o dia' : '') : h.erro}</small>
                  </span>
                  <button type="button" className="botao-icone pequeno" aria-label={`Tirar ${t.nome || 'o turno'}`} title="Tirar (os dias já montados continuam com as posições)" onClick={() => mudar(turnos.filter((_, k) => k !== i))}>
                    <Icone nome="fechar" tam={13} />
                  </button>
                </>
              ) : (
                <>
                  <b className="cfg-turno-nome">{t.nome}</b>
                  <span className="cfg-turno-h">{t.horario}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {podeMudar && (
        <div className="cfg-turnos-mais">
          <button type="button" className="botao-texto" onClick={() => mudar([...turnos, { id: '', nome: '', horario: '' }])}>
            + Novo turno
          </button>
        </div>
      )}
    </>
  );
}
