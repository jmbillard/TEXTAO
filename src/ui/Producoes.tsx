import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { lerProducoesPorPraca, mudarEtapaDaProducao } from '../dados/armazenamento';
import { COLUNAS_DO_BLOCO, ETAPA_DO_BOTAO, ROTULO_DA_COLUNA, comOCard, diaDoPrazo, type CardDaProducao, type BlocoDaPraca, type TelaDeProducoes } from '../modelo/producoesPorPraca';
import { nomeComparavel } from '../modelo/ligarPeloNome';
import { LER_ANDAMENTO_MS } from './fila';
import { MarcaTexto, tracoDe } from './pecas';
import { plural } from './util';
import './producoes.css';

/* A tela de produções (#109), na área Designer, ao lado da agenda No Trello: um bloco por praça (na ordem das praças
   da Configuração), cada um com as colunas Entrada · Produzindo · Entregue e a contagem de cada coluna. O card traz a
   claquete (com o marca-texto da prioridade ALTA, como na agenda), a atração, as artes, os designers e o prazo; a ordem
   é o prazo e, no mesmo prazo, a ALTA primeiro. O Entregue mostra só os entregues dos últimos dias. As Produções vêm
   do PROMeiro, nada do Trello; a tela se lê de novo na cadência da agenda.
   #119: no computador e no tablet, cada praça é um bloco vertical, e os blocos ficam lado a lado na largura toda; quando
   não cabem, a área dos blocos rola para o lado, e o topo de cada bloco (e o das colunas) fica à vista ao rolar para
   baixo. No celular, as praças e as etapas ficam uma embaixo da outra.
   #110: quem está ligado a um designer pega o card da Entrada ("Peguei") e volta o de Produzindo ou de Entregue para a
   Entrada. A mudança aparece na hora; se o servidor (o Trello) recusa, a tela volta atrás e diz o motivo. Quem não
   está ligado vê a tela, sem os botões, e a explicação de a quem pedir. Entregar, arrastar e recolher o bloco vêm
   depois (#111 a #113). */

interface Props {
  /** a linha do logo: o caminho "PROMeiro / designer ▾", a agenda No Trello, a Pauta da edição e o perfil */
  topo: ReactNode;
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const hojeEmSaoPaulo = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const vizinho = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** O prazo como o card mostra: "hoje", "amanhã", "sex 20/11"; com a hora quando a exibição traz ("sex 20/11 21h30"). */
function prazoEscrito(prazo: string, hoje = hojeEmSaoPaulo()) {
  const dia = diaDoPrazo(prazo);
  const d = new Date(`${dia}T12:00:00Z`);
  const nome = dia === hoje ? 'hoje' : dia === vizinho(hoje, 1) ? 'amanhã' : dia === vizinho(hoje, -1) ? 'ontem' : `${DIAS_CURTOS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return nome;
  const [h, m] = new Date(prazo).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).split(':');
  return `${nome} ${Number(h)}h${m}`;
}

/** "3 artes"; com arte marcada no checklist, "1 de 3 artes"; sem a lista, nada. */
function artesEscritas({ aProduzir, entregues }: CardDaProducao['artes']) {
  if (aProduzir === null) return '';
  return entregues ? `${entregues} de ${plural(aProduzir, 'arte', 'artes')}` : plural(aProduzir, 'arte', 'artes');
}

/** O botão do card: para onde ele leva e o que fazer. */
interface Botao {
  rotulo: string;
  indo: boolean;
  fazer: () => void;
}

function CardDaTela({ c, hoje, botao }: { c: CardDaProducao; hoje: string; botao: Botao | null }) {
  const claquete = <span className="prod-claquete-texto">{c.claquete || 'Sem claquete'}</span>;
  const artes = artesEscritas(c.artes);
  const passou = !!c.prazo && c.etapa !== 'entregue' && diaDoPrazo(c.prazo) < hoje;
  return (
    <li className={`prod-card${c.alta ? ' alta' : ''}`} data-producao={c.id} data-etapa={c.etapa}>
      <span className="prod-claquete" title={c.alta ? 'prioridade ALTA' : undefined}>{c.alta ? <MarcaTexto traco={tracoDe(c.id)}>{claquete}</MarcaTexto> : claquete}</span>
      <span className="prod-atracao">{c.atracao || 'sem atração'}</span>
      <span className="prod-linha">
        {artes && <span className="prod-artes">{artes}</span>}
        {c.prazo ? (
          <span className={`prod-prazo${passou ? ' passou' : ''}`} title="O prazo: a exibição">
            ao ar <b>{prazoEscrito(c.prazo, hoje)}</b>
          </span>
        ) : (
          <span className="prod-prazo sem">sem prazo</span>
        )}
      </span>
      {(c.designers.length > 0 || c.marcador || c.semCard) && (
        <span className="prod-pe">
          {c.designers.length > 0 && <span className="prod-designers">{c.designers.join(', ')}</span>}
          {c.marcador && <span className="prod-marcador">{c.marcador}</span>}
          {c.semCard && <span className="prod-sem-card">sem card</span>}
        </span>
      )}
      {botao && (
        <span className="prod-acoes">
          <button type="button" className={`botao prod-mudar${c.etapa === 'entrada' ? ' pegar' : ' voltar'}`} disabled={botao.indo} onClick={botao.fazer}>
            {botao.rotulo}
          </button>
        </span>
      )}
    </li>
  );
}

function Bloco({ b, entregueDias, hoje, botao }: { b: BlocoDaPraca; entregueDias: number; hoje: string; botao: (c: CardDaProducao) => Botao | null }) {
  const total = COLUNAS_DO_BLOCO.reduce((n, k) => n + b.colunas[k].length, 0);
  const id = `bloco-${b.praca || 'sem-praca'}`;
  return (
    <section className="prod-bloco" data-praca={b.praca} aria-labelledby={id}>
      <header className="prod-bloco-topo">
        <h2 id={id}>
          <span className="prod-sigla">{b.praca || '—'}</span>
          {b.nome !== b.praca && <span className="prod-nome">{b.nome}</span>}
        </h2>
        <span className="prod-total">{plural(total, 'produção', 'produções')}</span>
      </header>
      <div className="prod-colunas">
        {COLUNAS_DO_BLOCO.map((k) => (
          <section key={k} className="prod-coluna" data-coluna={k} aria-label={`${b.praca} · ${ROTULO_DA_COLUNA[k]}`}>
            <h3>
              <i aria-hidden="true" />
              <span className="prod-coluna-nome">{ROTULO_DA_COLUNA[k]}</span>
              <span className="prod-conta" aria-label={plural(b.colunas[k].length, 'card', 'cards')}>
                {b.colunas[k].length}
              </span>
              {k === 'entregue' && <small className="prod-recente">últimos {entregueDias} dias</small>}
            </h3>
            {b.colunas[k].length ? (
              <ul className="prod-cards">
                {b.colunas[k].map((c) => (
                  <CardDaTela key={c.id} c={c} hoje={hoje} botao={botao(c)} />
                ))}
              </ul>
            ) : (
              <p className="prod-nada">nada aqui</p>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

export function Producoes({ topo }: Props) {
  const [lido, setLido] = useState<TelaDeProducoes | null>(null);
  const [erro, setErro] = useState('');
  const [hoje, setHoje] = useState(hojeEmSaoPaulo);
  // a recusa da última mudança (o motivo), e os cards com a mudança a caminho do servidor
  const [recusa, setRecusa] = useState('');
  const [indo, setIndo] = useState<ReadonlySet<string>>(new Set());
  const reler = useRef<() => void>(() => {});
  useEffect(() => {
    let vivo = true;
    const ler = (primeira: boolean) =>
      lerProducoesPorPraca().then(
        (d) => {
          if (!vivo) return;
          setLido(d);
          setErro('');
          setHoje(hojeEmSaoPaulo());
        },
        // na releitura, o erro não apaga os blocos que já estão à vista
        (e) => vivo && primeira && setErro(e instanceof Error ? e.message : 'Não deu para ler as produções.'),
      );
    void ler(true);
    reler.current = () => void ler(false);
    // como a agenda: a cada minuto com a aba à vista, e de novo quando a aba volta à vista ou ganha o foco
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
  }, []);

  const designer = lido?.voce.designer ?? null;
  /** Pegar ou voltar: a tela muda na hora; com a resposta, fica o card que o servidor diz; recusado, volta atrás. */
  const mudar = useCallback(
    (c: CardDaProducao) => {
      if (!designer) return;
      const etapa = ETAPA_DO_BOTAO[c.etapa];
      const eu = nomeComparavel(designer);
      const outros = c.designers.filter((d) => nomeComparavel(d) !== eu);
      const naHora: CardDaProducao = { ...c, etapa, designers: etapa === 'produzindo' ? [...outros, designer] : outros };
      setRecusa('');
      setIndo((s) => new Set(s).add(c.id));
      setLido((t) => t && comOCard(t, naHora));
      mudarEtapaDaProducao(c.id, etapa)
        .then(
          (r) => setLido((t) => t && comOCard(t, r.producao ?? naHora)),
          (e) => {
            setLido((t) => t && comOCard(t, c));
            setRecusa(`Não mudou ${c.claquete || 'a Produção'}: ${e instanceof Error ? e.message : 'o servidor não respondeu.'}`);
            // o motivo pode ser a tela velha (alguém mudou antes): lê de novo
            reler.current();
          },
        )
        .finally(() =>
          setIndo((s) => {
            const n = new Set(s);
            n.delete(c.id);
            return n;
          }),
        );
    },
    [designer],
  );
  const botao = (c: CardDaProducao): Botao | null => (designer ? { rotulo: c.etapa === 'entrada' ? 'Peguei' : 'Voltar para a Entrada', indo: indo.has(c.id), fazer: () => mudar(c) } : null);

  return (
    <div className="pagina producoes">
      {topo}
      <main className="prod-pagina">
        <div className="prod-cabeca">
          <h1>Produções</h1>
          <p className="prod-sub">Um bloco por praça: o que entrou, o que está em produção e o que saiu nos últimos {lido?.entregueDias ?? 3} dias.</p>
        </div>
        {erro ? (
          <p className="prod-falha" role="alert">
            {erro}
          </p>
        ) : !lido ? (
          <p className="prod-lendo">Lendo as produções…</p>
        ) : (
          <>
            {!designer && lido.voce.porQue && (
              <p className="prod-sem-ligacao" role="note">
                {lido.voce.porQue}
              </p>
            )}
            {recusa && (
              <p className="prod-recusa" role="alert">
                <span>{recusa}</span>
                <button type="button" className="botao-texto" onClick={() => setRecusa('')}>
                  Fechar
                </button>
              </p>
            )}
            <div className="prod-blocos">
              {lido.blocos.map((b) => (
                <Bloco key={b.praca || '—'} b={b} entregueDias={lido.entregueDias} hoje={hoje} botao={botao} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
