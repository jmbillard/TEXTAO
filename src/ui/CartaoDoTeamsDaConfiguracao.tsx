import { DIAS_DA_SEMANA, ORDEM_NA_TELA, horaNoPadrao, type HorarioDoCartao } from '../modelo/horariosDoCartao';
import type { CartaoDoTeamsDaConfiguracao } from '../dados/armazenamento';
import { Icone } from './icones';
import './cartaoDoTeamsDaConfiguracao.css';

/* A seção "Cartão do Teams" da Configuração (#135): a linha de estado (o segredo que falta no Portainer, ou o último
   envio) e a lista dos horários, como a dos turnos: cada horário com a hora (no relógio de São Paulo), os dias da
   semana e a pauta que leva (a de hoje ou a de amanhã); tirar e "+ Novo horário". O que muda fica no rascunho da tela
   até "Conferir e salvar". No celular, só consulta. */

const LETRA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** "27/11 às 7h29" (no relógio de quem olha: a equipe está em São Paulo). */
function quando(iso: string) {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${dia} às ${hora}`;
}

/** A linha de estado: o que falta no Portainer (nada é mandado), ou o último envio. */
export function EstadoDoCartao({ teams }: { teams: CartaoDoTeamsDaConfiguracao }) {
  if (teams.falta.length)
    return (
      <p className="cfg-teams-estado falta" role="status">
        <Icone nome="atencao" tam={14} /> Falta {teams.falta.join(' e ')} no Portainer: nenhum cartão vai ao Teams.
      </p>
    );
  const u = teams.ultimo;
  return (
    <p className={`cfg-teams-estado ${u && !u.ok ? 'falta' : ''}`} role="status">
      {!u
        ? 'Ligado. Nenhum cartão mandado ainda.'
        : `Último cartão: ${u.tipo === 'alterada' ? 'pauta alterada' : 'pauta'} de ${u.dia.slice(8, 10)}/${u.dia.slice(5, 7)}, ${quando(u.em)}${u.ok ? '.' : ` — não foi (${u.erro ?? 'o Teams não respondeu'}); tenta de novo no minuto seguinte.`}`}
    </p>
  );
}

interface Props {
  horarios: HorarioDoCartao[];
  podeMudar: boolean;
  mudar: (horarios: HorarioDoCartao[]) => void;
}

export function ListaDosHorarios({ horarios, podeMudar, mudar }: Props) {
  const trocar = (i: number, m: Partial<HorarioDoCartao>) => mudar(horarios.map((h, k) => (k === i ? { ...h, ...m } : h)));
  const alternar = (i: number, d: number) => {
    const dias = horarios[i].dias.includes(d) ? horarios[i].dias.filter((x) => x !== d) : [...horarios[i].dias, d].sort((a, b) => a - b);
    trocar(i, { dias });
  };
  return (
    <>
      {horarios.length ? (
        <ul className="cfg-teams" aria-label="Horários do cartão">
          {horarios.map((h, i) => (
            <li key={i} className="cfg-teams-h">
              {podeMudar ? (
                <>
                  <input
                    className="entrada-cad cfg-teams-hora"
                    aria-label="Hora do cartão"
                    value={h.hora}
                    placeholder="7:29"
                    spellCheck={false}
                    onChange={(e) => trocar(i, { hora: e.target.value })}
                    onBlur={() => horaNoPadrao(h.hora) !== h.hora && trocar(i, { hora: horaNoPadrao(h.hora) })}
                  />
                  <span className="cfg-teams-dias" role="group" aria-label={`Dias das ${h.hora || 'horas'}`}>
                    {ORDEM_NA_TELA.map((d) => (
                      <button key={d} type="button" className="cfg-teams-dia" aria-pressed={h.dias.includes(d)} aria-label={DIAS_DA_SEMANA[d]} title={DIAS_DA_SEMANA[d]} onClick={() => alternar(i, d)}>
                        {LETRA[d]}
                      </button>
                    ))}
                  </span>
                  <select className="entrada-cad cfg-teams-pauta" aria-label={`Pauta das ${h.hora || 'horas'}`} value={h.pauta} onChange={(e) => trocar(i, { pauta: e.target.value === 'amanha' ? 'amanha' : 'hoje' })}>
                    <option value="hoje">a pauta de hoje</option>
                    <option value="amanha">a pauta de amanhã</option>
                  </select>
                  <button type="button" className="botao-icone pequeno" aria-label={`Tirar as ${h.hora || 'horas'}`} onClick={() => mudar(horarios.filter((_, k) => k !== i))}>
                    <Icone nome="fechar" tam={13} />
                  </button>
                </>
              ) : (
                <>
                  <b className="cfg-teams-hora">{h.hora}</b>
                  <span className="cfg-teams-dias">{ORDEM_NA_TELA.filter((d) => h.dias.includes(d)).map((d) => DIAS_DA_SEMANA[d].slice(0, 3)).join(', ')}</span>
                  <span className="cfg-teams-pauta">{h.pauta === 'amanha' ? 'a pauta de amanhã' : 'a pauta de hoje'}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="cfg-teams-vazio">Nenhum horário: o cartão não vai ao Teams.</p>
      )}
      {podeMudar && (
        <div className="cfg-teams-mais">
          <button type="button" className="botao-texto" onClick={() => mudar([...horarios, { hora: '', dias: [1, 2, 3, 4, 5], pauta: 'hoje' }])}>
            + Novo horário
          </button>
        </div>
      )}
    </>
  );
}
