import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useDeslize } from './movimentoDasProducoes';
import { Vazio } from './pecas';
import './listaDeAchados.css';
import { CASCATA_MS, NA_CASCATA } from './cena';

/* A lista dos achados da lupa, no lugar do que a tela mostrava (a busca de Produções, #161, e a da agenda de filmes,
   #182): o topo com o que foi achado, a dica e o fio (que corre enquanto busca), o "nada" e as linhas. A lista chega e
   sai esmaecendo e subindo de leve, as linhas em cascata; ao refinar o termo, as que ficam deslizam para o lugar novo
   (o deslize da tela, #159) e as que chegam sobem. Cada tela dá as linhas dela (o botão que abre o card). */


interface Props<T> {
  itens: readonly T[];
  chave: (x: T) => string;
  /** o conteúdo de cada linha (o botão que abre o card) */
  linha: (x: T) => ReactNode;
  /** os atributos de cada linha (o estado na bolinha: data-etapa, data-quando…) */
  dados?: (x: T) => Record<string, string>;
  /** o que foi achado, no título ("3 produções com «festa»"), ou a falha */
  titulo: ReactNode;
  dica: ReactNode;
  /** o que escrever quando nada foi achado, à mão (o Vazio); null enquanto não há resposta ou quando há achados */
  nada: ReactNode | null;
  saindo: boolean;
  buscando?: boolean;
  /** o "Mais resultados", quando há */
  mais?: ReactNode;
  /** a classe da tela (o lugar e as colunas das linhas) */
  classe?: string;
}

export function ListaDeAchados<T>({ itens, chave, linha, dados, titulo, dica, nada, saindo, buscando = false, mais, classe = '' }: Props<T>) {
  const lista = useRef<HTMLOListElement>(null);
  const ids = itens.map(chave);
  // ao refinar o termo, as linhas que ficam deslizam para o lugar novo (#159); as que chegam sobem pelo CSS, em cascata
  useDeslize(lista, '.prod-achado', 'data-achado', ids.join(','), { chegada: false });
  // o atraso de cada linha na cascata, dado quando ela chega e guardado (mudar no meio pularia a animação)
  const atrasos = useRef(new Map<string, number>());
  const agora = new Set(ids);
  for (const id of [...atrasos.current.keys()]) if (!agora.has(id)) atrasos.current.delete(id);
  let chegando = 0;
  for (const id of ids) if (!atrasos.current.has(id)) atrasos.current.set(id, Math.min(chegando++, NA_CASCATA) * CASCATA_MS);

  return (
    <section className={`prod-busca ${classe}${saindo ? ' saindo' : ''}${buscando ? ' buscando' : ''}`} aria-label="Resultados da busca" aria-busy={buscando}>
      <header className="prod-busca-topo">
        <h2 aria-live="polite">{titulo}</h2>
        <span className="prod-busca-dica">{dica}</span>
        <i className="prod-busca-fio" aria-hidden="true" />
      </header>
      {nada != null && <Vazio className="prod-busca-nada">{nada}</Vazio>}
      <ol ref={lista} className="prod-achados">
        {itens.map((x, i) => (
          <li key={ids[i]} className="prod-achado" data-achado={ids[i]} {...dados?.(x)} style={{ '--atraso': `${atrasos.current.get(ids[i]) ?? 0}ms` } as CSSProperties}>
            {linha(x)}
          </li>
        ))}
      </ol>
      {mais}
    </section>
  );
}
