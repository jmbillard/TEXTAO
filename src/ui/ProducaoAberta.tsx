import { useEffect, useRef, useState } from 'react';
import { apelidoDaProducao, useApelidos } from '../dados/apelidos';
import { armazenamento, lerProducaoAberta, type ProducaoAberta as Lida } from '../dados/armazenamento';
import { ApelidoDaClaquete, NomeDaClaquete, versoesDoCard } from './Apelido';
import { frasesDaLinhaDoTempo } from '../modelo/linhaDoTempo';
import { ROTULO_DA_COLUNA, diaDoPrazo, type CardDaProducao } from '../modelo/producoesPorPraca';
import { semPracaNoFim } from '../modelo/pracas';
import { Icone } from './icones';

/* A Produção aberta na tela de produções (#113): um clique no card abre, na própria tela, o painel da Produção, com a
   linha do tempo (as frases do dia a dia, src/modelo/linhaDoTempo.ts), as artes do checklist (marcadas ou não) e o link
   do card no Trello. O apelido da claquete e as versões à mão (#154) se editam aqui, com ou sem roteiro. O topo (a
   claquete, a atração, a praça e a etapa, os designers e o prazo) vem do card, na hora; o resto é lido do PROMeiro quando abre, e de novo quando o card muda de etapa ou de designers. Nada é lido do Trello.
   Fecha pelo ×, pelo Esc ou clicando fora. No celular, o painel ocupa a tela. */

interface Props {
  card: CardDaProducao;
  /** o prazo como o card escreve ("ao ar sex 20/11"), ou null sem prazo */
  prazo: string | null;
  fechar: () => void;
}

export function ProducaoAberta({ card, prazo, fechar }: Props) {
  useApelidos();
  const [lida, setLida] = useState<Lida | null>(null);
  const [erro, setErro] = useState('');
  const fecho = useRef<HTMLButtonElement>(null);
  // lida de novo quando a mudança da tela (ou a releitura) traz outra etapa ou outros designers: há eventos novos
  const versao = `${card.id}|${card.etapa}|${card.designers.join('|')}`;
  useEffect(() => {
    let vivo = true;
    lerProducaoAberta(card.id).then(
      (l) => {
        if (!vivo) return;
        setLida(l);
        setErro('');
      },
      (e) => vivo && setErro(e instanceof Error ? e.message : 'Não deu para ler a Produção.'),
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao]);
  useEffect(() => {
    fecho.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fechar]);

  const frases = lida?.producao ? frasesDaLinhaDoTempo(lida.producao, lida.eventos) : [];
  const marcadas = lida?.artes.filter((a) => a.marcada).length ?? 0;
  return (
    <div className="prod-veu" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <aside className="prod-aberta" role="dialog" aria-modal="true" aria-labelledby="prod-aberta-titulo" data-producao={card.id}>
        <header className="prod-aberta-topo">
          <span className="prod-aberta-rotulo">
            {card.praca || 'sem praça'} · {ROTULO_DA_COLUNA[card.etapa]}
          </span>
          <button ref={fecho} type="button" className="botao-texto prod-aberta-fechar" aria-label="Fechar" onClick={fechar}>
            <Icone nome="fechar" tam={18} />
          </button>
          <h2 id="prod-aberta-titulo" title={apelidoDaProducao(card.id) ? `Claquete: ${card.claquete}` : undefined}>
            {apelidoDaProducao(card.id) || card.claquete ? <NomeDaClaquete nome={apelidoDaProducao(card.id) || card.claquete} versoes={versoesDoCard(card)} marca={card.letraEVersao} /> : 'Sem claquete'}
          </h2>
          <p className="prod-aberta-sobre">
            <span>{card.atracao || 'sem atração'}</span>
            <span>{prazo ? `ao ar ${prazo}` : 'sem prazo'}</span>
            {card.designers.length > 0 && <span>{card.designers.join(', ')}</span>}
            {card.marcador && <span className="prod-marcador">{card.marcador}</span>}
          </p>
          <ApelidoDaClaquete alvo={{ producao: card.id }} claquete={semPracaNoFim(card.claquete)} versoes={card.versoesLidas ?? []} dia={card.prazo ? diaDoPrazo(card.prazo) : ''} podeMudar={armazenamento.tipo === 'servidor'} />
        </header>
        {erro ? (
          <p className="prod-aberta-falha" role="alert">
            {erro}
          </p>
        ) : !lida ? (
          <p className="prod-aberta-lendo">Lendo a Produção…</p>
        ) : (
          <>
            <section className="prod-aberta-parte" aria-labelledby="prod-aberta-tempo">
              <h3 id="prod-aberta-tempo">Linha do tempo</h3>
              {frases.length ? (
                <ol className="prod-aberta-tempo">
                  {frases.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ol>
              ) : (
                <p className="prod-aberta-nada">nada ainda</p>
              )}
            </section>
            <section className="prod-aberta-parte" aria-labelledby="prod-aberta-artes">
              <h3 id="prod-aberta-artes">
                Artes
                {lida.artes.length > 0 && (
                  <small>
                    {marcadas} de {lida.artes.length} marcadas no checklist
                  </small>
                )}
              </h3>
              {lida.artes.length ? (
                <ul className="prod-aberta-artes">
                  {lida.artes.map((a) => (
                    <li key={a.nome} className={a.marcada ? 'marcada' : undefined}>
                      <span className="prod-arte-marca" aria-hidden="true">
                        {a.marcada && <Icone nome="certo" tam={11} traco={2.6} />}
                      </span>
                      <span className="nome">{a.nome}</span>
                      <span className="estado">{a.marcada ? 'marcada' : 'falta'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="prod-aberta-nada">sem a lista de artes</p>
              )}
            </section>
            <footer className="prod-aberta-pe">
              {lida.trello ? (
                <a className="botao prod-aberta-trello" href={lida.trello} target="_blank" rel="noopener noreferrer">
                  Abrir o card no Trello
                  <Icone nome="seta" tam={14} />
                </a>
              ) : (
                <span className="prod-aberta-sem-card">Sem card no Trello: esta Produção muda só no PROMeiro.</span>
              )}
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
