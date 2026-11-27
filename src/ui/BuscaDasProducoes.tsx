import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { apelidoDaProducao, useApelidos } from '../dados/apelidos';
import { buscarProducoes } from '../dados/armazenamento';
import { ROTULO_DA_COLUNA, diaDoPrazo, type CardDaProducao } from '../modelo/producoesPorPraca';
import { useDeslize } from './movimentoDasProducoes';
import { plural, semMovimento } from './util';

/* A busca da tela de produções (#161): o que a lupa do topo acha no histórico todo (também os entregues de mais de 3
   dias, que os blocos não mostram), pela claquete, pela atração e pelas pessoas, numa lista no lugar dos blocos. Cada
   linha diz a etapa (na bolinha), a praça, os designers e o dia: o da entrega, para as entregues; o prazo, para as
   outras. Um clique abre a Produção. A lista chega e sai esmaecendo e subindo de leve, as linhas em cascata; ao refinar
   o termo, as que ficam deslizam para o lugar novo (o deslize da tela, #159) e as que chegam sobem. As páginas seguintes
   chegam pelo "Mais resultados". */

/** Quanto a busca espera a pessoa parar de digitar. */
const ESPERA_MS = 220;
/** Quanto dura a saída da lista (o CSS tem o mesmo tempo). */
export const SAIDA_DA_BUSCA_MS = 200;
/** O intervalo da cascata das linhas que chegam, de uma para a outra, e quantas entram nela (as de baixo chegam com a
    última). */
const CASCATA_MS = 28;
const NA_CASCATA = 12;

interface Achados {
  termo: string;
  cards: CardDaProducao[];
  total: number;
  pagina: number;
  mais: boolean;
}

/**
 * Montado um pouco além do fim, para a saída animar: `montado` enquanto está ativo ou saindo, e `saindo` no tempo da
 * saída. Com prefers-reduced-motion, a saída também acontece, só esmaecendo (o CSS cuida).
 */
export function usePresenca(ativo: boolean, ms = SAIDA_DA_BUSCA_MS) {
  const [montado, setMontado] = useState(ativo);
  useEffect(() => {
    if (ativo) {
      setMontado(true);
      return;
    }
    const t = setTimeout(() => setMontado(false), semMovimento() ? 0 : ms);
    return () => clearTimeout(t);
  }, [ativo, ms]);
  return { montado: ativo || montado, saindo: !ativo && montado };
}

interface Props {
  /** o termo como a pessoa digitou ('' quando a lupa está vazia, na saída) */
  termo: string;
  saindo: boolean;
  /** o dia como a tela escreve ("hoje", "ontem", "qua 25/11") e o prazo como o card mostra */
  diaEscrito: (dia: string) => string;
  prazoEscrito: (prazo: string) => string;
  abrir: (c: CardDaProducao, origem: HTMLElement) => void;
}

export function BuscaDasProducoes({ termo, saindo, diaEscrito, prazoEscrito, abrir }: Props) {
  useApelidos();
  const [achados, setAchados] = useState<Achados | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const lista = useRef<HTMLOListElement>(null);
  const limpo = termo.trim();
  // a primeira página, quando a pessoa para de digitar; a resposta de um termo velho não vale
  useEffect(() => {
    if (!limpo) return;
    const pedido = new AbortController();
    setBuscando(true);
    const t = setTimeout(() => {
      buscarProducoes(limpo, 0, pedido.signal).then(
        (r) => {
          setAchados({ termo: limpo, ...r });
          setErro('');
          setBuscando(false);
        },
        (e) => {
          if (pedido.signal.aborted) return;
          setErro(e instanceof Error ? e.message : 'A busca não respondeu.');
          setBuscando(false);
        },
      );
    }, ESPERA_MS);
    return () => {
      clearTimeout(t);
      pedido.abort();
    };
  }, [limpo]);
  const maisUma = () => {
    if (!achados || buscando) return;
    const { termo: de, pagina } = achados;
    setBuscando(true);
    buscarProducoes(de, pagina + 1).then(
      (r) => {
        setAchados((a) => (a && a.termo === de ? { ...a, ...r, cards: [...a.cards, ...r.cards.filter((c) => !a.cards.some((x) => x.id === c.id))] } : a));
        setBuscando(false);
      },
      (e) => {
        setErro(e instanceof Error ? e.message : 'A busca não respondeu.');
        setBuscando(false);
      },
    );
  };
  const cards = achados?.cards ?? [];
  // ao refinar o termo, as linhas que ficam deslizam para o lugar novo (#159); as que chegam sobem pelo CSS, em cascata
  useDeslize(lista, '.prod-achado', 'data-achado', cards.map((c) => c.id).join(','), { chegada: false });
  // o atraso de cada linha na cascata, dado quando ela chega e guardado (mudar no meio pularia a animação)
  const atrasos = useRef(new Map<string, number>());
  const agora = new Set(cards.map((c) => c.id));
  for (const id of [...atrasos.current.keys()]) if (!agora.has(id)) atrasos.current.delete(id);
  let chegando = 0;
  for (const c of cards) if (!atrasos.current.has(c.id)) atrasos.current.set(c.id, Math.min(chegando++, NA_CASCATA) * CASCATA_MS);

  return (
    <section className={`prod-busca${saindo ? ' saindo' : ''}${buscando ? ' buscando' : ''}`} aria-label="Resultados da busca" aria-busy={buscando}>
      <header className="prod-busca-topo">
        <h2 aria-live="polite">
          {erro ? (
            <span className="prod-busca-falha">{erro}</span>
          ) : !achados ? (
            'Buscando…'
          ) : achados.total ? (
            <>
              {plural(achados.total, 'produção', 'produções')} com <q>{achados.termo}</q>
            </>
          ) : (
            <>
              Nada com <q>{achados.termo}</q>
            </>
          )}
        </h2>
        <span className="prod-busca-dica">também as entregues há mais tempo · Esc limpa</span>
        <i className="prod-busca-fio" aria-hidden="true" />
      </header>
      {achados && !achados.total && !erro && <p className="prod-nada prod-busca-nada">nenhuma Produção com isso, nem nas antigas</p>}
      <ol ref={lista} className="prod-achados">
        {cards.map((c) => {
          const apelido = apelidoDaProducao(c.id);
          const quando = c.etapa === 'entregue' ? (c.entregaEm ? `entregue ${diaEscrito(diaDoPrazo(c.entregaEm))}` : 'entregue') : c.prazo ? `ao ar ${prazoEscrito(c.prazo)}` : 'sem prazo';
          return (
            <li key={c.id} className="prod-achado" data-achado={c.id} data-etapa={c.etapa} style={{ '--atraso': `${atrasos.current.get(c.id) ?? 0}ms` } as CSSProperties}>
              <button type="button" className="prod-achado-abrir" aria-haspopup="dialog" onClick={(e) => abrir(c, e.currentTarget)}>
                <span className="prod-achado-etapa">
                  <i aria-hidden="true" />
                  {ROTULO_DA_COLUNA[c.etapa]}
                </span>
                <span className="prod-achado-nome">
                  <span className="prod-achado-claquete" title={apelido ? `Claquete: ${c.claquete}` : undefined}>
                    {apelido || c.claquete || 'Sem claquete'}
                  </span>
                  <span className="prod-achado-atracao">{c.atracao || 'sem atração'}</span>
                </span>
                <span className="prod-achado-praca">{c.praca || '—'}</span>
                <span className="prod-achado-designers">{c.designers.length ? c.designers.join(', ') : 'ninguém pegou'}</span>
                <span className={`prod-achado-quando${c.etapa === 'entregue' ? ' entregue' : ''}`}>{quando}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {achados?.mais && (
        <button type="button" className="botao prod-busca-mais" disabled={buscando} onClick={maisUma}>
          {buscando ? 'Buscando…' : `Mais resultados (${achados.total - cards.length})`}
        </button>
      )}
    </section>
  );
}
