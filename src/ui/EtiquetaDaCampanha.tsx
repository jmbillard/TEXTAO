import { useLayoutEffect, useRef, useState } from 'react';
import { etiquetasDoCard, tomDaCampanha, type CampanhaDoCard } from '../modelo/campanhas';
import { Icone } from './icones';
import { Vagas } from './vagas';
import './etiquetaDaCampanha.css';

/* A etiqueta da campanha (#178): o componente único da Campanha em todas as telas (o card de Produções e o card aberto
   agora; a agenda No Trello e a Pauta da edição depois, #181). Uma pílula com a bolinha no tom da campanha (o mesmo
   tom para a mesma campanha, em todas as telas) e o nome. Nada de faixa na borda: o tom vai na bolinha e no fundo
   levemente tingido.
   - compacta (o card): a primeira campanha ligada e "+N" das outras (o título diz quais);
   - todas (o card aberto): uma pílula por campanha, com o × de tirar quando a pessoa pode, abrindo e fechando a vaga
     (as Vagas, como os designers).
   O movimento: a etiqueta que chega depois da tela aberta entra carimbada (cresce, assenta e um brilho passa por ela),
   a bolinha pinga; o "+N" troca de número rolando. Sem nada disso com o movimento reduzido. */

interface Props {
  campanhas: readonly CampanhaDoCard[] | undefined;
  /** 'compacta' (padrão): a primeira e "+N"; 'todas': uma pílula por campanha */
  modo?: 'compacta' | 'todas';
  /** tirar a Produção da campanha (só no modo 'todas', para quem pode) */
  tirar?: (c: CampanhaDoCard) => void;
  /** abrir a campanha (a página dela, #179): com ele, a pílula é um botão */
  abrir?: (c: CampanhaDoCard) => void;
}

/** As campanhas que chegaram depois da montagem: só elas entram carimbadas (a tela que abre não carimba tudo). */
function useChegadas(ids: readonly string[]) {
  const vistos = useRef<Set<string> | null>(null);
  const [chegadas, setChegadas] = useState<ReadonlySet<string>>(new Set());
  const chave = ids.join('|');
  // antes de pintar: a etiqueta que chega já nasce com o carimbo, sem piscar parada
  useLayoutEffect(() => {
    if (!vistos.current) {
      vistos.current = new Set(ids);
      return;
    }
    const novas = ids.filter((id) => !vistos.current!.has(id));
    for (const id of ids) vistos.current.add(id);
    // quem saiu pode chegar de novo (o desfazer): carimba de novo
    for (const id of [...vistos.current]) if (!ids.includes(id)) vistos.current.delete(id);
    if (novas.length) setChegadas(new Set(novas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return chegadas;
}

export function EtiquetaDaCampanha({ campanhas, modo = 'compacta', tirar, abrir }: Props) {
  const todas = campanhas ?? [];
  const chegadas = useChegadas(todas.map((c) => c.id));
  const pilula = (c: CampanhaDoCard) => <Pilula key={c.id} c={c} chegou={chegadas.has(c.id)} tirar={modo === 'todas' ? tirar : undefined} abrir={abrir} />;
  if (modo === 'todas')
    return (
      <span className="campanhas todas">
        <Vagas eixo="x" itens={[...todas]} chave={(c) => c.id}>
          {pilula}
        </Vagas>
      </span>
    );
  const { vistas, mais, resto } = etiquetasDoCard(todas);
  if (!vistas.length) return null;
  return (
    <span className="campanhas compacta" aria-label={`Campanhas: ${todas.map((c) => c.nome).join(', ')}`}>
      {vistas.map(pilula)}
      {mais > 0 && (
        <span className="campanha-mais" title={resto.join(' · ')} aria-hidden="true">
          +<span key={mais} className="campanha-mais-n">{mais}</span>
        </span>
      )}
    </span>
  );
}

function Pilula({ c, chegou, tirar, abrir }: { c: CampanhaDoCard; chegou: boolean; tirar?: (c: CampanhaDoCard) => void; abrir?: (c: CampanhaDoCard) => void }) {
  const classe = `campanha${chegou ? ' chegou' : ''}${tirar ? ' com-tirar' : ''}`;
  const dentro = (
    <>
      <i className="campanha-bolinha" aria-hidden="true" />
      <span className="campanha-nome">{c.nome}</span>
    </>
  );
  return (
    <span className={classe} data-campanha={c.id} data-tom={tomDaCampanha(c.id)} title={c.nome}>
      {abrir ? (
        <button type="button" className="campanha-abrir" onClick={() => abrir(c)}>
          {dentro}
        </button>
      ) : (
        dentro
      )}
      {tirar && (
        <button type="button" className="campanha-tirar" aria-label={`Tirar da campanha ${c.nome}`} title={`Tirar da campanha ${c.nome}`} onClick={() => tirar(c)}>
          <Icone nome="fechar" tam={10} traco={2.4} />
        </button>
      )}
    </span>
  );
}
