import { iniciais } from '../dados/colaboracao';
import type { ForaNaPauta } from '../modelo/ausencias';
import { DIAS_DA_SEMANA, partes } from './pecasDaPauta';
import './foraNaPauta.css';

/* Quem está fora na Pauta da edição (#128): uma faixa logo acima da pauta, com cada pessoa uma vez e os dias em que
   está fora (na Semana). Todos veem só "fora"; o motivo e a observação vêm do servidor só para a coordenação e os
   administradores, e aí aparecem ao lado do nome. */

const diaCurto = (iso: string) => {
  const p = partes(iso);
  return `${DIAS_DA_SEMANA[p.semana]} ${p.dia}`;
};

/** Os dias seguidos viram "sex 27 a dom 29"; os soltos, separados por vírgula. */
function diasEscritos(dias: readonly string[], todos: readonly string[]) {
  const grupos: string[][] = [];
  for (const d of dias) {
    const ultimo = grupos.at(-1);
    if (ultimo && todos.indexOf(d) === todos.indexOf(ultimo.at(-1)!) + 1) ultimo.push(d);
    else grupos.push([d]);
  }
  return grupos.map((g) => (g.length === 1 ? diaCurto(g[0]) : `${diaCurto(g[0])} a ${diaCurto(g.at(-1)!)}`)).join(', ');
}

/**
 * @param fora quem está fora em cada dia, como a rota da pauta devolve
 * @param dias os dias da tela: com mais de um (a Semana), cada pessoa diz em quais está fora
 */
export function ForaNaPautaTela({ fora, dias }: { fora: readonly ForaNaPauta[] | undefined; dias: readonly string[] }) {
  if (!fora?.length) return null;
  const pessoas = new Map<string, { editor: string; dias: string[]; motivo?: string; observacao?: string }>();
  for (const f of fora) {
    const p = pessoas.get(f.editor) ?? { editor: f.editor, dias: [], motivo: f.motivo, observacao: f.observacao };
    p.dias.push(f.dia);
    pessoas.set(f.editor, p);
  }
  return (
    <section className="pauta-fora" aria-label="Fora">
      <span className="pauta-fora-rotulo">Fora</span>
      <ul>
        {[...pessoas.values()].map((p) => (
          <li key={p.editor} className="pauta-fora-pessoa">
            <span className="pauta-avatar" aria-hidden="true">
              {iniciais(p.editor)}
            </span>
            <span className="pauta-fora-nome">{p.editor}</span>
            <span className="pauta-fora-det">
              {p.motivo ?? 'fora'}
              {p.observacao && ` · ${p.observacao}`}
              {dias.length > 1 && ` · ${diasEscritos(p.dias, dias)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
