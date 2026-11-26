import { useEffect, useState, type ReactNode } from 'react';
import { armazenamento, lerLinhaDoTempo } from '../dados/armazenamento';
import { frasesDaLinhaDoTempo } from '../modelo/linhaDoTempo';

/** A Linha do tempo (#89) da Produção do card, discreta e só de leitura: as frases em ordem, separadas por "·"
    ("entrou 26/11 9h40 · Rafael pegou 10h02 · 3 de 5 artes · entregue 15h20"). Lida sob demanda: só quando o card abre
    (aberto), de novo a cada vez que ele abre, sem apagar a que já estava à vista. Chega abrindo a vaga (a altura vai de
    0 ao tamanho dela), como o card aberto; sem Produção, sem eventos e sem data, ou com o servidor fora, não mostra
    nada (ou o `vazio`, quando dado). */
export function LinhaDoTempoDoCard({ card, aberto = true, vazio }: { card: string | null | undefined; aberto?: boolean; vazio?: ReactNode }) {
  const [frases, setFrases] = useState<string[] | null>(null);
  useEffect(() => {
    if (!aberto || !card || armazenamento.tipo !== 'servidor') return;
    let vivo = true;
    lerLinhaDoTempo(card).then(
      (l) => vivo && setFrases(l.producao ? frasesDaLinhaDoTempo(l.producao, l.eventos) : []),
      // a linha do tempo é só um detalhe do card: sem ela, o card continua igual
      () => vivo && setFrases((f) => f ?? []),
    );
    return () => {
      vivo = false;
    };
  }, [card, aberto]);
  if (frases && !frases.length && vazio !== undefined) return <>{vazio}</>;
  return (
    <div className={`tempo-da-producao ${frases?.length ? 'chegou' : ''}`}>
      <div>
        {!!frases?.length && (
          <ol aria-label="Linha do tempo">
            {frases.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
