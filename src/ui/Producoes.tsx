import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as PointerDoReact, type ReactNode } from 'react';
import { apelidoDaProducao, useApelidos } from '../dados/apelidos';
import { blocosRecolhidos, desfazerEtapaDaProducao, lembrarOrdemDasPracas, lembrarRecolhidos, lerProducoesPorPraca, mudarEtapaDaProducao, ordemDasPracas } from '../dados/armazenamento';
import { ARRASTA_PARA, BOTOES_DO_CARD, COLUNAS_DO_BLOCO, ROTULO_DA_COLUNA, abertasNoComeco, abrirAPraca, comOCard, diaDoPrazo, diasDoEntregue, faltaArte, naOrdem, type CardDaProducao, type BlocoDaPraca, type ColunaDoBloco, type TelaDeProducoes } from '../modelo/producoesPorPraca';
import { nomeComparavel } from '../modelo/ligarPeloNome';
import { LER_ANDAMENTO_MS } from './fila';
import { Icone } from './icones';
import { MarcaTexto, tracoDe } from './pecas';
import { ProducaoAberta } from './ProducaoAberta';
import { BuscaNaLupa, emCampo } from './BuscaNaLupa';
import { BuscaDasProducoes, usePresenca } from './BuscaDasProducoes';
import { useDeslize, useReordenar } from './movimentoDasProducoes';
import { plural } from './util';
import { ConflitoDoCard, NomeDaClaquete, versoesDoCard } from './Apelido';
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
   celular, nada de arrastar: os botões, no tamanho do dedo.
   #113: cada bloco se recolhe numa coluna estreita, só com a sigla e a contagem de cada coluna (no celular, uma linha);
   o PROMeiro lembra os recolhidos por pessoa, em qualquer aparelho (as preferências da pessoa). Um clique no card (fora
   dos botões; o arrasto não conta) abre a Produção na própria tela: a linha do tempo, as artes e o link do card no
   Trello (src/ui/ProducaoAberta.tsx).
   #159: o topo é o mesmo das outras telas e não se mexe; sem o texto de explicação. No máximo 3 praças abertas: abrir
   mais uma fecha a aberta há mais tempo. A pessoa arruma as praças arrastando pela faixa do nome, e a ordem fica
   lembrada como os recolhidos. A praça fechada mostra o nome na vertical. A Produzindo vazia fica fina e se abre com um
   card no ar (ou com o "Peguei"); o Entregue tem as divisórias por dia. E movimento em tudo: a praça que abre e fecha,
   o card que muda de coluna, a coluna que se abre e a ordem das praças deslizam (src/ui/movimentoDasProducoes.ts).
   #161: com o mouse sobre um card, o espaço faz o mesmo que o "Peguei" (como no Trello), com a caixinha de desfazer; no
   card que não tem o "Peguei" (o que já é da pessoa, o de Produzindo, o entregue), nada; num campo de texto, nada. E a
   lupa do topo busca no histórico todo, também os entregues antigos (src/ui/BuscaDasProducoes.tsx), numa lista no lugar
   dos blocos. */

interface Props {
  /** a linha do logo: o caminho "PROMeiro / designer ▾", a agenda No Trello, a Pauta da edição e o perfil */
  topo: ReactNode;
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const hojeEmSaoPaulo = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const vizinho = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** O dia como a tela escreve: "hoje", "amanhã", "ontem", "qua 25/11". */
function diaEscrito(dia: string, hoje: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  return dia === hoje ? 'hoje' : dia === vizinho(hoje, 1) ? 'amanhã' : dia === vizinho(hoje, -1) ? 'ontem' : `${DIAS_CURTOS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/** O prazo como o card mostra: "hoje", "amanhã", "sex 20/11"; com a hora quando a exibição traz ("sex 20/11 21h30"). */
function prazoEscrito(prazo: string, hoje = hojeEmSaoPaulo()) {
  const nome = diaEscrito(diaDoPrazo(prazo), hoje);
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

/** A contagem da coluna: quando muda, o número pula de leve (#159), para o olho ver onde o card foi. */
function Conta({ n, rotulo }: { n: number; rotulo: string }) {
  const antes = useRef(n);
  const [vez, setVez] = useState(0);
  const [pulando, setPulando] = useState(false);
  useEffect(() => {
    if (antes.current === n) return;
    antes.current = n;
    setVez((v) => v + 1);
    setPulando(true);
    // a classe sai depois do pulo: a praça que muda de lugar (o nó que anda no DOM) não pula de novo
    const t = setTimeout(() => setPulando(false), CHEGADA_MS);
    return () => clearTimeout(t);
  }, [n]);
  return (
    <span key={vez} className={`prod-conta${pulando ? ' mudou' : ''}`} aria-label={rotulo}>
      {n}
    </span>
  );
}

/** Quanto dura a chegada de um bloco (as colunas em cascata, o nome girando). */
const CHEGADA_MS = 600;
/** O bloco que acabou de aparecer (#159): a classe da chegada fica só o tempo dela. O navegador recomeça a animação de
    CSS do nó que muda de lugar no DOM (a praça arrastada), e a classe que já saiu não tem o que recomeçar. */
function useChegando() {
  const [sim, setSim] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSim(false), CHEGADA_MS);
    return () => clearTimeout(t);
  }, []);
  return sim;
}

/** A alça da faixa do nome (#159): por ela a praça se arrasta no dedo; no mouse, a faixa toda. */
const Alca = () => (
  <span className="prod-alca" aria-hidden="true" title="Arraste para mudar a ordem das praças">
    ⠿
  </span>
);

/** O clique que abre a Produção (#113): no card, fora dos botões, do link e do aviso de arte faltando. */
const cliqueDeAbrir = (e: { target: EventTarget }) => !(e.target as Element).closest('button, a, .prod-aviso');

function CardDaTela({ c, hoje, acoes, abrir }: { c: CardDaProducao; hoje: string; acoes: Acoes | null; abrir: () => void }) {
  // o apelido da claquete da Produção (#120, #154) no lugar da claquete: só para mostrar; a original, ao passar o mouse
  useApelidos();
  const apelido = apelidoDaProducao(c.id);
  // as versões refeitas com o apelido de agora (#154): a edição à mão na Produção aberta vale na hora
  const versoes = versoesDoCard(c);
  const claquete = <span className="prod-claquete-texto" title={apelido ? `Claquete: ${c.claquete}` : undefined}>{apelido || c.claquete ? <NomeDaClaquete nome={apelido || c.claquete} versoes={versoes} marca={c.letraEVersao} /> : 'Sem claquete'}</span>;
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
      // abrir a Produção (#113): o clique no card (o arrasto não vira clique) e o Enter com o card em foco
      tabIndex={0}
      aria-haspopup="dialog"
      onClick={(e) => cliqueDeAbrir(e) && abrir()}
      onKeyDown={(e) => {
        // o espaço com o mouse sobre o card é o "Peguei" (#161), não abrir
        if (e.target === e.currentTarget && (e.key === 'Enter' || (e.key === ' ' && !e.currentTarget.matches(':hover')))) {
          e.preventDefault();
          abrir();
        }
      }}
    >
      <span className="prod-claquete" title={c.alta ? 'prioridade ALTA' : undefined}>{c.alta ? <MarcaTexto traco={tracoDe(c.id)}>{claquete}</MarcaTexto> : claquete}</span>
      {/* as versões da chamada (#121, #152) vão no fim do nome; aqui, só o aviso quando o roteiro diz outra coisa */}
      <ConflitoDoCard versoes={versoes} />
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

/** Recolher e mostrar o bloco (#113), abrir a Produção de um card, e arrastar a praça pela faixa do nome (#159). */
interface DoBloco {
  recolhido: boolean;
  alternar: () => void;
  abrir: (c: CardDaProducao) => void;
  levantado: boolean;
  arrastar: (e: PointerDoReact<HTMLElement>) => void;
  /** a vez do bloco na cascata da primeira carga (#159): as colunas chegam uma depois da outra, de bloco em bloco */
  cascata: number;
}
/** O intervalo da cascata, de coluna em coluna. */
const CASCATA_MS = 35;

/** O bloco recolhido (#113): uma coluna estreita com a sigla e o nome na vertical (#159) e a contagem de cada coluna;
    um clique mostra de novo. */
function BlocoRecolhido({ b, id, bloco }: { b: BlocoDaPraca; id: string; bloco: DoBloco }) {
  const sigla = b.praca || '—';
  const chegando = useChegando();
  return (
    <section className={`prod-bloco recolhido${bloco.levantado ? ' levantado' : ''}${chegando ? ' chegando' : ''}`} data-praca={b.praca} aria-labelledby={id} onClick={bloco.alternar} title={`Mostrar ${b.nome}`}>
      <div className="prod-recolhido" onPointerDown={bloco.arrastar}>
        <Alca />
        <button type="button" className="prod-mostrar" aria-expanded={false} aria-label={`Mostrar o bloco ${sigla}`}>
          <Icone nome="direita" tam={16} traco={2.2} />
        </button>
        <h2 id={id}>
          <span className="prod-sigla">{sigla}</span>
          {b.nome !== b.praca && <span className="prod-nome">{b.nome}</span>}
        </h2>
        <ul className="prod-contas-recolhido" aria-label={`Os cards de ${sigla} em cada coluna`}>
          {COLUNAS_DO_BLOCO.map((k) => (
            <li key={k} data-coluna={k} title={ROTULO_DA_COLUNA[k]}>
              <i aria-hidden="true" />
              <Conta n={b.colunas[k].length} rotulo={`${ROTULO_DA_COLUNA[k]}: ${plural(b.colunas[k].length, 'card', 'cards')}`} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

interface PropsDoBloco {
  b: BlocoDaPraca;
  entregueDias: number;
  hoje: string;
  acoes: (c: CardDaProducao) => Acoes | null;
  solta: Soltar;
  bloco: DoBloco;
}
const idDoBloco = (b: BlocoDaPraca) => `bloco-${b.praca || 'sem-praca'}`;

/** O bloco da praça: o recolhido ou o aberto (cada um com a chegada dele, #159). */
function Bloco(props: PropsDoBloco) {
  return props.bloco.recolhido ? <BlocoRecolhido b={props.b} id={idDoBloco(props.b)} bloco={props.bloco} /> : <BlocoAberto {...props} />;
}

function BlocoAberto({ b, entregueDias, hoje, acoes, solta, bloco }: PropsDoBloco) {
  const arrasto = solta.arrasto?.card.praca === b.praca ? solta.arrasto : null;
  const aceita = (k: ColunaDoBloco) => !!arrasto && ARRASTA_PARA[arrasto.card.etapa].includes(k);
  const total = COLUNAS_DO_BLOCO.reduce((n, k) => n + b.colunas[k].length, 0);
  const id = idDoBloco(b);
  const chegando = useChegando();
  // a Produzindo vazia fica fina (#159), e se abre quando um card do bloco que pode ir para ela está no ar
  const fina = !b.colunas.produzindo.length && !aceita('produzindo');
  const cardsDe = (cs: CardDaProducao[]) => (
    <ul className="prod-cards">
      {cs.map((c) => (
        <CardDaTela key={c.id} c={c} hoje={hoje} acoes={acoes(c)} abrir={() => bloco.abrir(c)} />
      ))}
    </ul>
  );
  return (
    <section className={`prod-bloco${bloco.levantado ? ' levantado' : ''}${chegando ? ' chegando' : ''}`} data-praca={b.praca} aria-labelledby={id}>
      <header className="prod-bloco-topo" onPointerDown={bloco.arrastar}>
        <Alca />
        <h2 id={id}>
          <span className="prod-sigla">{b.praca || '—'}</span>
          {b.nome !== b.praca && <span className="prod-nome">{b.nome}</span>}
        </h2>
        <span className="prod-total">{plural(total, 'produção', 'produções')}</span>
        <button type="button" className="prod-recolher" aria-expanded={true} aria-label={`Recolher o bloco ${b.praca || '—'}`} title="Recolher" onClick={bloco.alternar}>
          <Icone nome="voltar" tam={16} traco={2.2} />
        </button>
      </header>
      <div className={`prod-colunas${fina ? ' fina' : ''}`}>
        {COLUNAS_DO_BLOCO.map((k, i) => (
          <section
            key={k}
            style={{ '--atraso': `${(bloco.cascata + i) * CASCATA_MS}ms` } as CSSProperties}
            className={`prod-coluna${k === 'produzindo' && fina ? ' fina' : ''}${aceita(k) ? ' aceita' : ''}${aceita(k) && arrasto?.sobre === k ? ' sobre' : ''}`}
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
              <Conta n={b.colunas[k].length} rotulo={plural(b.colunas[k].length, 'card', 'cards')} />
              {k === 'entregue' && <small className="prod-recente">últimos {entregueDias} dias</small>}
            </h3>
            {!b.colunas[k].length ? (
              <p className="prod-nada">nada aqui</p>
            ) : k === 'entregue' ? (
              // as divisórias por dia (#159): o dia da entrega, do mais novo para o mais velho
              diasDoEntregue(b.colunas[k], hoje).map((d) => (
                <div key={d.dia} className="prod-dia" data-dia={d.dia}>
                  <h4 className="prod-dia-nome">{diaEscrito(d.dia, hoje)}</h4>
                  {cardsDe(d.cards)}
                </div>
              ))
            ) : (
              cardsDe(b.colunas[k])
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
  // os blocos recolhidos (#113), lembrados por pessoa; as praças abertas (no máximo 3, #159), da aberta há mais tempo
  // para a mais nova, que valem depois do primeiro clique; e a Produção aberta (o card como estava ao abrir)
  const [recolhidosLembrados] = useState(blocosRecolhidos);
  const [abertas, setAbertas] = useState<readonly string[] | null>(null);
  const [aberta, setAberta] = useState<CardDaProducao | null>(null);
  // a ordem das praças, arrumada arrastando (#159) e lembrada por pessoa
  const [ordem, setOrdem] = useState<readonly string[]>(ordemDasPracas);
  // a busca no histórico (#161): com o termo, a lista dos achados fica no lugar dos blocos (e sai animando)
  const [busca, setBusca] = useState('');
  const buscaAtiva = !!busca.trim();
  const presenca = usePresenca(buscaAtiva);
  // fechada a busca, os blocos voltam subindo de leve (só nessa volta, não na primeira carga)
  const [voltando, setVoltando] = useState(false);
  const buscouAntes = useRef(false);
  useEffect(() => {
    if (presenca.montado) {
      buscouAntes.current = true;
      return;
    }
    if (!buscouAntes.current) return;
    buscouAntes.current = false;
    setVoltando(true);
    const t = setTimeout(() => setVoltando(false), CHEGADA_MS);
    return () => clearTimeout(t);
  }, [presenca.montado]);
  const area = useRef<HTMLDivElement>(null);
  // a primeira carga (#159): as colunas chegam em cascata curta; depois, cada bloco que abre só com a dele
  const [chegando, setChegando] = useState(true);
  useEffect(() => {
    if (!lido || !chegando) return;
    const t = setTimeout(() => setChegando(false), CHEGADA_MS);
    return () => clearTimeout(t);
  }, [lido, chegando]);
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
  const blocos = lido ? naOrdem(lido.blocos, ordem) : [];
  const pracas = blocos.map((b) => b.praca);
  // (a praça que saiu da tela, numa releitura, não conta entre as abertas)
  const abertasAgora = (abertas ?? abertasNoComeco(pracas, recolhidosLembrados)).filter((p) => pracas.includes(p));
  /** Recolher ou mostrar o bloco da praça (#113): muda na hora, e o servidor guarda para a pessoa. Abrir a quarta fecha
      a aberta há mais tempo (#159); as fechadas são as recolhidas. */
  const alternar = (praca: string) => {
    const n = abertasAgora.includes(praca) ? abertasAgora.filter((p) => p !== praca) : abrirAPraca(abertasAgora, praca);
    setAbertas(n);
    void lembrarRecolhidos(pracas.filter((p) => !n.includes(p)));
  };
  // arrumar as praças arrastando (#159): a ordem muda na hora; solta, o servidor guarda
  const reordenar = useReordenar(area, pracas, noCelular ? 'y' : 'x', setOrdem, (o) => {
    setOrdem(o);
    void lembrarOrdemDasPracas(o);
  });
  // o deslize (#159): a praça que muda de lugar, e o card que muda de coluna (e os vizinhos que abrem o espaço)
  useDeslize(area, ':scope > .prod-bloco:not(.levantado)', 'data-praca', pracas.join('\n'));
  useDeslize(area, '.prod-card', 'data-producao', blocos.map((b) => (abertasAgora.includes(b.praca) ? COLUNAS_DO_BLOCO.map((k) => b.colunas[k].map((c) => c.id).join(',')).join('/') : '')).join('|'));
  // a Produção aberta acompanha a tela (a mudança e a releitura); a que saiu da tela fica como estava
  const cardAberto = aberta && (lido?.blocos.flatMap((b) => COLUNAS_DO_BLOCO.flatMap((k) => b.colunas[k])).find((c) => c.id === aberta.id) ?? aberta);
  const fecharAberta = useCallback(() => {
    setAberta((a) => {
      // o foco volta para o card que abriu (ou para a linha da busca que abriu, #161)
      if (a) requestAnimationFrame(() => document.querySelector<HTMLElement>(`.prod-card[data-producao="${CSS.escape(a.id)}"], .prod-achado[data-achado="${CSS.escape(a.id)}"] button`)?.focus());
      return null;
    });
  }, []);
  /* O espaço pega o card (#161): o card sob o mouse, se ele tem o "Peguei" à mão (a pessoa ligada a um designer, o card
     na Entrada, sem mudança a caminho nem aviso aberto). Num campo de texto, num diálogo (a Produção aberta) ou com o
     foco num botão ou num link, o espaço é do que tem o foco. */
  const pegarPeloEspaco = useRef<(id: string) => void>(() => {});
  pegarPeloEspaco.current = (id) => {
    const c = lido?.blocos.flatMap((b) => b.colunas.entrada).find((x) => x.id === id);
    const a = c && acoes(c);
    if (c && a && !a.indo && !a.aviso && a.para.includes('produzindo')) mudar(c, 'produzindo');
  };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.altKey || emCampo(e)) return;
      const sob = [...document.querySelectorAll<HTMLElement>('.prod-card:hover')].pop();
      if (!sob) return;
      // com o foco num botão ou num link, o espaço aperta ele, como sempre
      if ((e.target as HTMLElement | null)?.closest?.('button, a, summary')) return;
      // a página não rola: o espaço é o "Peguei"
      e.preventDefault();
      if (!e.repeat) pegarPeloEspaco.current(sob.dataset.producao ?? '');
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
  // com a busca aberta, o Esc fora do campo também limpa (o do campo já limpa, e o da Produção aberta só fecha ela)
  useEffect(() => {
    if (!buscaAtiva || aberta) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !emCampo(e) && setBusca('');
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [buscaAtiva, aberta]);
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
          {lido && <BuscaNaLupa valor={busca} mudar={setBusca} ativa={!aberta} dica="Buscar claquete, atração ou pessoa" rotulo="Buscar nas produções" />}
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
            {/* a largura de cada bloco: o aberto cresce para ocupar a sobra; o recolhido, uma coluna estreita (#113). As
                duas formas têm o mesmo jeito (o mínimo e a fração), para a largura deslizar ao abrir e fechar (#159) */}
            {presenca.montado && <BuscaDasProducoes termo={busca} saindo={presenca.saindo} diaEscrito={(d) => diaEscrito(d, hoje)} prazoEscrito={(p) => prazoEscrito(p, hoje)} abrir={setAberta} />}
            <div
              ref={area}
              hidden={presenca.montado}
              className={`prod-blocos${reordenar.levantada ? ' reordenando' : ''}${voltando ? ' voltando' : ''}`}
              style={{ gridTemplateColumns: blocos.map((b) => (abertasAgora.includes(b.praca) ? 'minmax(var(--bloco-min), 1fr)' : 'minmax(var(--bloco-recolhido), 0fr)')).join(' ') }}
            >
              {blocos.map((b, i) => (
                <Bloco
                  key={b.praca || '—'}
                  b={b}
                  entregueDias={lido.entregueDias}
                  hoje={hoje}
                  acoes={acoes}
                  solta={solta}
                  bloco={{ recolhido: !abertasAgora.includes(b.praca), alternar: () => alternar(b.praca), abrir: setAberta, levantado: reordenar.levantada === b.praca, arrastar: reordenar.iniciar(b.praca), cascata: chegando ? i : 0 }}
                />
              ))}
            </div>
            {cardAberto && <ProducaoAberta card={cardAberto} prazo={cardAberto.prazo ? prazoEscrito(cardAberto.prazo, hoje) : null} fechar={fecharAberta} />}
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
