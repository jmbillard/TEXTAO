import { iniciais } from '../dados/colaboracao';
import type { ForaNaPauta } from '../modelo/ausencias';
import { Vazio } from './pecas';

/* Quem está fora no dia, na Pauta da edição (#128, no desenho do #162): uma folha ao lado do "Minha pauta", com cada
   pessoa uma vez e a etiqueta "fora". Todos veem só "fora"; o motivo e a observação vêm do servidor só para a coordenação
   e os administradores, e aí aparecem no lugar da etiqueta. */

/**
 * @param fora quem está fora, como a rota da pauta devolve
 * @param dia o dia da folha
 */
export function ForaNaPautaTela({ fora, dia }: { fora: readonly ForaNaPauta[] | undefined; dia: string }) {
  const doDia = (fora ?? []).filter((f) => f.dia === dia);
  return (
    <section className="pauta-folha pauta-fora desliza" aria-label="Fora no dia">
      <div className="pauta-folha-topo">
        <span className="rotulo">
          Fora no dia <span className="pauta-qtd">{doDia.length}</span>
        </span>
      </div>
      {doDia.length ? (
        <ul className="pauta-fora-lista">
          {doDia.map((p) => (
            <li key={p.editor} className="pauta-fora-pessoa">
              <span className="pauta-avatar" aria-hidden="true">
                {iniciais(p.editor)}
              </span>
              <span className="pauta-fora-nome">{p.editor}</span>
              <span className="pauta-etiqueta" title={p.observacao}>
                {p.motivo ?? 'fora'}
                {p.observacao && ` · ${p.observacao}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio className="pauta-nada">ninguém</Vazio>
      )}
    </section>
  );
}
