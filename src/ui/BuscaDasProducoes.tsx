import { useEffect, useState } from 'react';
import { apelidoDaProducao, useApelidos } from '../dados/apelidos';
import { buscarProducoes } from '../dados/armazenamento';
import { ROTULO_DA_COLUNA, diaDoPrazo, type CardDaProducao } from '../modelo/producoesPorPraca';
import { ListaDeAchados } from './ListaDeAchados';
import { plural, semMovimento } from './util';

/* A busca da tela de produções (#161): o que a lupa do topo acha no histórico todo (também os entregues de mais de 3
   dias, que os blocos não mostram), pela claquete, pela atração e pelas pessoas, numa lista no lugar dos blocos. Cada
   linha diz a etapa (na bolinha), a praça, os designers e o dia: o da entrega, para as entregues; o prazo, para as
   outras. Um clique abre a Produção. A lista e os movimentos dela são os da ListaDeAchados (a mesma da agenda de filmes,
   #182). As páginas seguintes chegam pelo "Mais resultados". */

/** Quanto a busca espera a pessoa parar de digitar. */
const ESPERA_MS = 220;
/** Quanto dura a saída da lista (o CSS tem o mesmo tempo). */
export const SAIDA_DA_BUSCA_MS = 200;

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
  return (
    <ListaDeAchados
      itens={cards}
      chave={(c) => c.id}
      dados={(c) => ({ 'data-etapa': c.etapa })}
      saindo={saindo}
      buscando={buscando}
      titulo={
        erro ? (
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
        )
      }
      dica="também as entregues há mais tempo · Esc limpa"
      nada={achados && !achados.total && !erro ? <p className="prod-nada prod-busca-nada">nenhuma Produção com isso, nem nas antigas</p> : null}
      linha={(c) => {
        const apelido = apelidoDaProducao(c.id);
        const quando = c.etapa === 'entregue' ? (c.entregaEm ? `entregue ${diaEscrito(diaDoPrazo(c.entregaEm))}` : 'entregue') : c.prazo ? `ao ar ${prazoEscrito(c.prazo)}` : 'sem prazo';
        return (
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
        );
      }}
      mais={
        achados?.mais && (
          <button type="button" className="botao prod-busca-mais" disabled={buscando} onClick={maisUma}>
            {buscando ? 'Buscando…' : `Mais resultados (${achados.total - cards.length})`}
          </button>
        )
      }
    />
  );
}
