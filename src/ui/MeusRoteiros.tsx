import { useEffect, useState, type ReactNode } from 'react';
import { lerMeusRoteiros, type MeuRoteiro, type MeusRoteiros as Lidos, type Resumo } from '../dados/armazenamento';
import type { AreaDosRoteiros } from '../modelo/areas';
import { CICLO, frasesDoCiclo, type CicloDoRoteiro } from '../modelo/cicloDoRoteiro';
import { agruparPorDia, LER_ANDAMENTO_MS, type GrupoDia } from './fila';
import { plural } from './util';
import './areas.css';

/* "Meus roteiros" do Redator e do Editor (#101): a lista simples, por dia, dos roteiros guardados no PROMeiro em que a
   pessoa é o redator (ou o editor), pelo nome do cadastro ligado ao e-mail dela. Cada roteiro mostra o seu estado no
   ciclo (#102), os passos com a data e quem da arte está com ele; a lista se lê de novo na cadência da agenda. Só
   leitura: as exibições e o roteiro aberto chegam depois (#103, #104). Nada vem do Trello. */

interface Props {
  area: AreaDosRoteiros;
  /** a linha do logo: o caminho "PROMeiro / redator ▾", a Pauta da edição e o perfil */
  topo: ReactNode;
}

const OUTRO: Record<AreaDosRoteiros, { campo: 'redator' | 'editor'; rotulo: string }> = {
  redator: { campo: 'editor', rotulo: 'edição' },
  editor: { campo: 'redator', rotulo: 'redator' },
};

/** A trilha curta do ciclo: um ponto por passo (os de antes do PROMeiro, vazados) e o nome do estado. */
function EstadoDoCiclo({ ciclo }: { ciclo: CicloDoRoteiro }) {
  const nome = CICLO.find((c) => c.id === ciclo.estado)?.nome ?? '';
  return (
    <span className="estado-ciclo">
      <span className="trilha-ciclo" aria-hidden="true">
        {ciclo.passos.map((p, i) => (
          <span key={p.id} className="trilha-passo">
            {i > 0 && <u className={p.situacao === 'feito' || p.situacao === 'agora' ? 'feito' : ''} />}
            <i className={p.situacao} />
          </span>
        ))}
      </span>
      <b className={`estado-nome e-${ciclo.estado}`}>{nome}</b>
    </span>
  );
}

export function MeusRoteiros({ area, topo }: Props) {
  const [lido, setLido] = useState<Lidos | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    setLido(null);
    setErro('');
    const ler = (primeira: boolean) =>
      lerMeusRoteiros(area).then(
        (d) => {
          if (!vivo) return;
          setLido(d);
          setErro('');
        },
        // na releitura, o erro não apaga a lista que já está à vista
        (e) => vivo && primeira && setErro(e instanceof Error ? e.message : 'Não deu para ler os roteiros.'),
      );
    void ler(true);
    // o ciclo muda sozinho (o envio, a Produção, a data): na cadência da agenda, a cada minuto com a aba à vista, e de
    // novo quando a aba volta à vista ou ganha o foco
    const deNovo = () => {
      if (document.visibilityState === 'visible') void ler(false);
    };
    const t = setInterval(deNovo, LER_ANDAMENTO_MS);
    document.addEventListener('visibilitychange', deNovo);
    window.addEventListener('focus', deNovo);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', deNovo);
      window.removeEventListener('focus', deNovo);
    };
  }, [area]);

  const { proximos, exibidos } = agruparPorDia(lido?.roteiros ?? []);
  const outro = OUTRO[area];
  // agruparPorDia devolve os resumos; o ciclo vem do roteiro lido
  const porId = new Map((lido?.roteiros ?? []).map((r) => [r.id, r]));
  const ficha = (resumo: Resumo) => {
    const r = porId.get(resumo.id) as MeuRoteiro;
    const passos = r.ciclo ? frasesDoCiclo(r.ciclo.passos) : [];
    return (
      <li key={r.id} className="ficha ficha-minha" data-estado={r.ciclo?.estado}>
        <span className="ficha-claquete">
          <b>{r.meta.claquete || 'Sem claquete'}</b>
          <span>
            {r.meta.programa || 'sem atração'}
            {r.meta.praca && <span className="ficha-praca">{r.meta.praca}</span>}
          </span>
          <span className="ficha-de">
            {outro.rotulo}: {r.meta[outro.campo] || '—'}
          </span>
        </span>
        {r.ciclo && (
          <span className="ficha-ciclo">
            <EstadoDoCiclo ciclo={r.ciclo} />
            {passos.length > 0 && (
              <small className="passos-ciclo">
                {/* cada passo inteiro numa linha: a quebra fica entre eles, nunca no meio da data */}
                {passos.map((f, i) => (
                  <span key={f}>
                    {i > 0 && ' · '}
                    <span className="passo-ciclo">{f}</span>
                  </span>
                ))}
              </small>
            )}
            {r.daArte?.length > 0 && <small className="com-quem">com {r.daArte.join(' e ')}</small>}
          </span>
        )}
        <span className="ficha-artes-minha">{plural(r.nArtes, 'arte', 'artes')}</span>
      </li>
    );
  };
  const dia = (g: GrupoDia) => (
    <section key={g.chave} className="dia" aria-label={`${g.titulo}, ${g.subtitulo}`}>
      <div className="dia-topo">
        <h3>
          {g.titulo}
          <span>{g.subtitulo}</span>
        </h3>
      </div>
      <ul className="fichas">{g.itens.map(ficha)}</ul>
    </section>
  );
  // sem gênero, como a sugestão dos Cadastros (#106)
  const papel = area === 'redator' ? 'redator' : 'editor';
  const total = lido?.roteiros.length ?? 0;

  return (
    <div className="pagina">
      {topo}
      <main className="biblioteca meus-roteiros" aria-busy={!lido && !erro}>
        <div className="fila-topo">
          <div className="fila-titulo">
            <h2 className="titulo-serifa">Meus roteiros</h2>
            {lido?.nome && (
              <p className="fila-conta">
                <span>{total ? `${plural(total, 'roteiro', 'roteiros')} · ` : ''}como {papel}: {lido.nome}</span>
              </p>
            )}
          </div>
        </div>
        {erro && <p className="aviso-meus erro" role="alert">{erro}</p>}
        {lido && !lido.nome && (
          <p className="aviso-meus" role="status">
            O seu e-mail ainda não está ligado a um cadastro de {papel}. Quando um administrador puser o seu e-mail nos Cadastros, os seus roteiros como {papel} aparecem aqui.
          </p>
        )}
        {lido?.nome && !total && (
          <p className="aviso-meus" role="status">
            Nenhum roteiro seu como {papel} por enquanto. Quando um roteiro seu chegar à fila da arte, ele aparece aqui.
          </p>
        )}
        {proximos.length > 0 && <div className="dias">{proximos.map(dia)}</div>}
        {exibidos.length > 0 && (
          <details className="exibidos">
            <summary>
              Já foram ao ar <span>{plural(exibidos.reduce((n, g) => n + g.itens.length, 0), 'roteiro', 'roteiros')}</span>
            </summary>
            {exibidos.map(dia)}
          </details>
        )}
      </main>
    </div>
  );
}
