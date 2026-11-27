import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { desfazerEtapaDaProducao, lerProducoesPorPraca, mudarEtapaDaProducao } from '../dados/armazenamento';
import { ARRASTA_PARA, BOTOES_DO_CARD, COLUNAS_DO_BLOCO, ROTULO_DA_COLUNA, comOCard, diaDoPrazo, faltaArte, type CardDaProducao, type BlocoDaPraca, type ColunaDoBloco, type TelaDeProducoes } from '../modelo/producoesPorPraca';
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
   está ligado vê a tela, sem os botões, e a explicação de a quem pedir.
   #111: o card de Produzindo ganha "Entreguei": o card vai para Entregue (e, no Trello, para a saída da praça). Se
   alguma arte do checklist não está marcada, o card fica onde está e mostra o aviso com as que faltam, com "Entregar
   assim mesmo" e "Voltar". O card que já mostra arte faltando (a conta das artes) espera o servidor antes de mudar,
   para não ir e voltar; o resto muda na hora.
   #112: no computador e no tablet, o card também muda arrastando, entre as colunas do mesmo bloco, com o mesmo efeito
   dos botões (e o mesmo aviso de arte faltando). Depois de cada mudança, a caixinha de desfazer: desfazer é a ação
   contrária, no servidor, só da última mudança da pessoa; a tela mostra na hora e volta atrás se o servidor recusa. No
   celular, nada de arrastar: os botões, no tamanho do dedo. Recolher o bloco vem depois (#113). */

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

/** O que o botão diz e a classe dele, pela etapa para onde leva. */
const DO_BOTAO: Record<ColunaDoBloco, { rotulo: string; classe: string }> = {
  produzindo: { rotulo: 'Peguei', classe: 'pegar' },
  entregue: { rotulo: 'Entreguei', classe: 'entregar' },
  entrada: { rotulo: 'Voltar para a Entrada', classe: 'voltar' },
};

/** Os botões do card (para onde cada um leva), com a mudança a caminho, e o aviso de arte faltando aberto. */
interface Acoes {
  para: readonly ColunaDoBloco[];
  indo: boolean;
  fazer: (etapa: ColunaDoBloco) => void;
  aviso: { faltam: string[]; entregar: () => void; voltar: () => void } | null;
  /** começar a arrastar o card (#112); null quando não dá (celular, mudança a caminho, aviso aberto) */
  arrastar: ((sim: boolean) => void) | null;
}

/** O arrasto em curso (#112): o card e, se está sobre uma, a coluna de destino. */
interface Arrasto {
  card: CardDaProducao;
  sobre: ColunaDoBloco | null;
}

/** A caixinha de desfazer (#112): a última mudança da pessoa (o card antes e depois) e a frase. */
interface Desfazivel {
  antes: CardDaProducao;
  depois: CardDaProducao;
  texto: string;
}
/** Quanto tempo a caixinha de desfazer fica aberta. */
const DESFAZER_MS = 10_000;

/** A frase da caixinha: o que a mudança fez. */
function fraseDaMudanca(c: CardDaProducao, etapa: ColunaDoBloco) {
  const nome = c.claquete || 'A Produção';
  if (etapa === 'produzindo') return `Você pegou ${nome}.`;
  if (etapa === 'entregue') return `${nome} foi entregue.`;
  return `${nome} voltou para a Entrada.`;
}

/** O celular (#112): ali, a mudança é só pelos botões. A mesma largura do CSS. */
const NO_CELULAR = '(max-width: 600px)';
function useNoCelular() {
  const [sim, setSim] = useState(() => typeof matchMedia === 'function' && matchMedia(NO_CELULAR).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(NO_CELULAR);
    const mudou = () => setSim(m.matches);
    m.addEventListener('change', mudou);
    return () => m.removeEventListener('change', mudou);
  }, []);
  return sim;
}

/** O aviso ao entregar (#111): as artes do checklist que não estão marcadas, e as duas saídas. */
function AvisoDeFalta({ aviso, indo }: { aviso: NonNullable<Acoes['aviso']>; indo: boolean }) {
  const n = aviso.faltam.length;
  return (
    <div className="prod-aviso" role="alert" aria-label="Arte faltando no checklist">
      <p className="prod-aviso-texto">
        {n === 1 ? 'Falta marcar 1 arte no checklist:' : `Faltam marcar ${n} artes no checklist:`}
      </p>
      <ul className="prod-aviso-artes">
        {aviso.faltam.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <span className="prod-aviso-botoes">
        <button type="button" className="botao prod-aviso-botao assim-mesmo" disabled={indo} onClick={aviso.entregar}>
          Entregar assim mesmo
        </button>
        <button type="button" className="botao prod-aviso-botao" disabled={indo} onClick={aviso.voltar}>
          Voltar
        </button>
      </span>
    </div>
  );
}

function CardDaTela({ c, hoje, acoes }: { c: CardDaProducao; hoje: string; acoes: Acoes | null }) {
  const claquete = <span className="prod-claquete-texto">{c.claquete || 'Sem claquete'}</span>;
  const artes = artesEscritas(c.artes);
  const passou = !!c.prazo && c.etapa !== 'entregue' && diaDoPrazo(c.prazo) < hoje;
  const arrastar = acoes?.arrastar ?? null;
  return (
    <li
      className={`prod-card${c.alta ? ' alta' : ''}${arrastar ? ' arrastavel' : ''}`}
      data-producao={c.id}
      data-etapa={c.etapa}
      draggable={!!arrastar}
      onDragStart={
        arrastar
          ? (e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', c.id);
              arrastar(true);
            }
          : undefined
      }
      onDragEnd={arrastar ? () => arrastar(false) : undefined}
    >
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
      {acoes?.aviso ? (
        <AvisoDeFalta aviso={acoes.aviso} indo={acoes.indo} />
      ) : (
        acoes && (
          <span className="prod-acoes">
            {acoes.para.map((etapa) => (
              <button key={etapa} type="button" className={`botao prod-mudar ${DO_BOTAO[etapa].classe}`} disabled={acoes.indo} onClick={() => acoes.fazer(etapa)}>
                {DO_BOTAO[etapa].rotulo}
              </button>
            ))}
          </span>
        )
      )}
    </li>
  );
}

/** O que a coluna faz com o arrasto em curso (#112): aceita o card (do mesmo bloco, para onde ele pode ir) e solta. */
interface Soltar {
  arrasto: Arrasto | null;
  sobre: (k: ColunaDoBloco | null) => void;
  soltar: (k: ColunaDoBloco) => void;
}

function Bloco({ b, entregueDias, hoje, acoes, solta }: { b: BlocoDaPraca; entregueDias: number; hoje: string; acoes: (c: CardDaProducao) => Acoes | null; solta: Soltar }) {
  const arrasto = solta.arrasto?.card.praca === b.praca ? solta.arrasto : null;
  const aceita = (k: ColunaDoBloco) => !!arrasto && ARRASTA_PARA[arrasto.card.etapa].includes(k);
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
          <section
            key={k}
            className={`prod-coluna${aceita(k) ? ' aceita' : ''}${aceita(k) && arrasto?.sobre === k ? ' sobre' : ''}`}
            data-coluna={k}
            aria-label={`${b.praca} · ${ROTULO_DA_COLUNA[k]}`}
            onDragOver={(e) => {
              if (!aceita(k)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (arrasto?.sobre !== k) solta.sobre(k);
            }}
            onDragLeave={(e) => {
              if (arrasto?.sobre === k && !e.currentTarget.contains(e.relatedTarget as Node | null)) solta.sobre(null);
            }}
            onDrop={(e) => {
              if (!aceita(k)) return;
              e.preventDefault();
              solta.soltar(k);
            }}
          >
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
                  <CardDaTela key={c.id} c={c} hoje={hoje} acoes={acoes(c)} />
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
  // o aviso de arte faltando (#111) aberto em cada card: as artes que faltam
  const [avisos, setAvisos] = useState<ReadonlyMap<string, string[]>>(new Map());
  // o arrasto em curso e a caixinha de desfazer (#112)
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [desfazivel, setDesfazivel] = useState<Desfazivel | null>(null);
  const noCelular = useNoCelular();
  const reler = useRef<() => void>(() => {});
  useEffect(() => {
    if (!desfazivel) return;
    const t = setTimeout(() => setDesfazivel(null), DESFAZER_MS);
    return () => clearTimeout(t);
  }, [desfazivel]);
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
  const comAviso = (id: string, faltam: string[] | null) =>
    setAvisos((m) => {
      const n = new Map(m);
      if (faltam) n.set(id, faltam);
      else n.delete(id);
      return n;
    });
  const comIndo = (id: string, sim: boolean) =>
    setIndo((s) => {
      const n = new Set(s);
      if (sim) n.add(id);
      else n.delete(id);
      return n;
    });
  /** Pegar, voltar ou entregar: a tela muda na hora; com a resposta, fica o card que o servidor diz; recusado, volta
      atrás. A entrega com arte faltando volta com as que faltam: o card fica onde estava, com o aviso. Feita, a
      caixinha de desfazer abre com ela (#112). */
  const mudar = useCallback(
    (c: CardDaProducao, etapa: ColunaDoBloco, assimMesmo = false) => {
      if (!designer) return;
      const eu = nomeComparavel(designer);
      const outros = c.designers.filter((d) => nomeComparavel(d) !== eu);
      const designers = etapa === 'produzindo' ? [...outros, designer] : etapa === 'entrada' ? outros : c.designers;
      const naHora: CardDaProducao = { ...c, etapa, designers };
      // o card que já mostra arte faltando espera o servidor (que pode devolver o aviso), para não ir e voltar
      const naHoraMesmo = etapa !== 'entregue' || assimMesmo || !faltaArte(c);
      setRecusa('');
      setDesfazivel(null);
      comAviso(c.id, null);
      comIndo(c.id, true);
      if (naHoraMesmo) setLido((t) => t && comOCard(t, naHora));
      mudarEtapaDaProducao(c.id, etapa, assimMesmo)
        .then(
          (r) => {
            if (r.faltam?.length) {
              setLido((t) => t && comOCard(t, r.producao ?? c));
              comAviso(c.id, r.faltam);
            } else {
              const depois = r.producao ?? naHora;
              setLido((t) => t && comOCard(t, depois));
              setDesfazivel({ antes: c, depois, texto: fraseDaMudanca(c, etapa) });
            }
          },
          (e) => {
            setLido((t) => t && comOCard(t, c));
            setRecusa(`Não mudou ${c.claquete || 'a Produção'}: ${e instanceof Error ? e.message : 'o servidor não respondeu.'}`);
            // o motivo pode ser a tela velha (alguém mudou antes): lê de novo
            reler.current();
          },
        )
        .finally(() => comIndo(c.id, false));
    },
    [designer],
  );
  /** Desfazer (#112): o card volta na hora para onde estava; o servidor faz a ação contrária. Recusado, o card fica
      como estava depois da mudança, e a tela diz o motivo. */
  const desfazer = (d: Desfazivel) => {
    setDesfazivel(null);
    setRecusa('');
    comIndo(d.antes.id, true);
    setLido((t) => t && comOCard(t, d.antes));
    desfazerEtapaDaProducao(d.antes.id)
      .then(
        (r) => setLido((t) => t && comOCard(t, r.producao ?? d.antes)),
        (e) => {
          setLido((t) => t && comOCard(t, d.depois));
          setRecusa(`Não desfez ${d.antes.claquete || 'a Produção'}: ${e instanceof Error ? e.message : 'o servidor não respondeu.'}`);
          reler.current();
        },
      )
      .finally(() => comIndo(d.antes.id, false));
  };
  const acoes = (c: CardDaProducao): Acoes | null => {
    if (!designer) return null;
    // o aviso fica só enquanto o card não foi entregue (a releitura pode trazer a entrega feita por outra pessoa)
    const faltam = c.etapa === 'entregue' ? undefined : avisos.get(c.id);
    const vai = indo.has(c.id);
    return {
      para: BOTOES_DO_CARD[c.etapa],
      indo: vai,
      fazer: (etapa) => mudar(c, etapa),
      aviso: faltam ? { faltam, entregar: () => mudar(c, 'entregue', true), voltar: () => comAviso(c.id, null) } : null,
      // no celular, só os botões; e nada de arrastar o card com a mudança a caminho ou com o aviso aberto
      arrastar: noCelular || vai || faltam ? null : (sim) => setArrasto(sim ? { card: c, sobre: null } : null),
    };
  };
  const solta: Soltar = {
    arrasto,
    sobre: (k) => setArrasto((a) => a && { ...a, sobre: k }),
    soltar: (k) => {
      const a = arrasto;
      setArrasto(null);
      if (a && a.card.etapa !== k) mudar(a.card, k);
    },
  };

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
                <Bloco key={b.praca || '—'} b={b} entregueDias={lido.entregueDias} hoje={hoje} acoes={acoes} solta={solta} />
              ))}
            </div>
            {desfazivel && (
              <div className="prod-desfazer" role="status">
                <span className="prod-desfazer-texto">{desfazivel.texto}</span>
                <button type="button" className="botao prod-desfazer-botao" onClick={() => desfazer(desfazivel)}>
                  Desfazer
                </button>
                <button type="button" className="botao-texto prod-desfazer-fechar" aria-label="Fechar" onClick={() => setDesfazivel(null)}>
                  ×
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
