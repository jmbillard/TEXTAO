import { useEffect, useState, type ReactNode } from 'react';
import { lerMeusRoteiros, type MeusRoteiros as Lidos, type Resumo } from '../dados/armazenamento';
import type { AreaDosRoteiros } from '../modelo/areas';
import { agruparPorDia, type GrupoDia } from './fila';
import { plural } from './util';
import './areas.css';

/* "Meus roteiros" do Redator e do Editor (#101): a lista simples, por dia, dos roteiros guardados no PROMeiro em que a
   pessoa é o redator (ou o editor), pelo nome do cadastro ligado ao e-mail dela. Só leitura: o ciclo, as exibições e
   o roteiro aberto chegam depois (#102 a #104). Nada vem do Trello. */

interface Props {
  area: AreaDosRoteiros;
  /** a linha do logo: o caminho "PROMeiro / redator ▾", a Pauta da edição e o perfil */
  topo: ReactNode;
}

const OUTRO: Record<AreaDosRoteiros, { campo: 'redator' | 'editor'; rotulo: string }> = {
  redator: { campo: 'editor', rotulo: 'edição' },
  editor: { campo: 'redator', rotulo: 'redator' },
};

export function MeusRoteiros({ area, topo }: Props) {
  const [lido, setLido] = useState<Lidos | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    setLido(null);
    setErro('');
    lerMeusRoteiros(area).then(
      (d) => vivo && setLido(d),
      (e) => vivo && setErro(e instanceof Error ? e.message : 'Não deu para ler os roteiros.'),
    );
    return () => {
      vivo = false;
    };
  }, [area]);

  const { proximos, exibidos } = agruparPorDia(lido?.roteiros ?? []);
  const outro = OUTRO[area];
  const ficha = (r: Resumo) => (
    <li key={r.id} className="ficha ficha-minha">
      <span className="ficha-claquete">
        <b>{r.meta.claquete || 'Sem claquete'}</b>
        <span>
          {r.meta.programa || 'sem atração'}
          {r.meta.praca && <span className="ficha-praca">{r.meta.praca}</span>}
        </span>
      </span>
      <span className="ficha-gente">
        <span>{r.meta[outro.campo] || '—'}</span>
        <small>{outro.rotulo}</small>
      </span>
      <span className="ficha-artes-minha">{plural(r.nArtes, 'arte', 'artes')}</span>
    </li>
  );
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
