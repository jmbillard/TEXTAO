import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { apagarCampanha, buscarProducoes, criarCampanha, desfazerApagarCampanha, ligarNaCampanha, lerListaDasCampanhas, lerPaginaDaCampanha, lerProducaoAberta, renomearCampanha, type CardDaCampanha, type ClaqueteNaPautaDaCampanha, type PaginaDaCampanha as Pagina, type ProducaoAberta as ProducaoLida } from '../dados/armazenamento';
import { ETAPAS_DA_CAMPANHA, HASH_DAS_CAMPANHAS, campanhaCombina, hashDaCampanha, mexidaEscrita, tomDaCampanha, type CampanhaNaLista, type ContagensDaCampanha } from '../modelo/campanhas';
import { nomeComparavel } from '../modelo/ligarPeloNome';
import { ROTULO_DA_COLUNA, type CardDaProducao } from '../modelo/producoesPorPraca';
import { AchadoDaProducao } from './BuscaDasProducoes';
import { BuscaNaLupa, emCampo } from './BuscaNaLupa';
import { CaixinhaDoDesfazer } from './desfazer';
import { Icone } from './icones';
import { ListaDeAchados } from './ListaDeAchados';
import { useDeslize } from './movimentoDasProducoes';
import { tracoDe, Vazio } from './pecas';
import { ProducaoAberta } from './ProducaoAberta';
import { CardDaTela, Conta, diaEscrito, hojeEmSaoPaulo, prazoEscrito } from './Producoes';
import { NumeroQueConta, escrever } from './topoDaAgenda';
import { plural, semMovimento } from './util';
import './producoes.css';
import './campanhas.css';

/* As Campanhas (#180): a lista das campanhas e a página de cada uma, cada uma com o endereço próprio (#/campanhas e
   #/campanhas/<id>), abertas pelo caminho do topo e pela etiqueta da campanha em qualquer tela.
   Tudo com as peças que já existem, com o mesmo comportamento: a lupa (BuscaNaLupa), os números que contam
   (NumeroQueConta), as contagens à mão com a bolinha da etapa (a Conta das Produções), o card da Produção (o da agenda,
   CardDaTela) e o card aberto no centro (ProducaoAberta), a linha do achado da busca de Produções (AchadoDaProducao, na
   lista dos achados) e a caixinha do desfazer.
   - A lista: um cartão por campanha, com a bolinha no tom dela, as contagens por etapa e quando foi mexida; a lupa
     filtra pelo nome, e os cartões deslizam para o lugar novo (o FLIP das Produções). "+ Nova campanha" para quem cria.
   - A página: o nome (que se escreve à mão ao chegar e ao renomear), as contagens por etapa (sem as arquivadas), as
     Produções nas três colunas, cada card com o dia e o editor da claquete na Pauta da edição, o "ligar Produções"
     (várias de uma vez, buscando pela claquete ou pela atração), as sugestões da mesma atração e as arquivadas.
     Ligada, a sugestão voa até a coluna dela; tirada, o card sai e os outros fecham o espaço (o mesmo deslize).
     Apagar (o administrador ou quem criou) volta para a lista, com o Desfazer.
   Com o movimento reduzido, tudo só esmaece. */

/** O intervalo da cascata dos cartões e das colunas, de um para o outro, e quantos entram nela. */
const CASCATA_MS = 35;
const NA_CASCATA = 14;
/** Quanto o clique espera a Produção ser lida antes de abrir o card aberto (o mesmo das Produções). */
const ESPERA_PARA_ABRIR_MS = 350;

/** A campanha apagada agora há pouco na página: a lista abre com o Desfazer dela. */
let apagadaAgora: { id: string; nome: string } | null = null;

/** O Esc fora de um campo também limpa a busca aberta (como nas Produções). */
function useEscLimpa(ativa: boolean, limpar: () => void) {
  useEffect(() => {
    if (!ativa) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && !emCampo(e) && limpar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ativa, limpar]);
}

/** A caixinha de desfazer aberta, com a frase e o que desfaz; fecha sozinha no fim do prazo. */
interface Desfazivel {
  texto: ReactNode;
  desfazer: () => void;
  n: number;
}
function useCaixinha() {
  const [d, setD] = useState<Desfazivel | null>(null);
  const abrir = useCallback((texto: ReactNode, desfazer: () => void) => setD({ texto, desfazer, n: Date.now() }), []);
  const caixinha = (
    <CaixinhaDoDesfazer
      caixinha={
        d && {
          id: d.n,
          texto: d.texto,
          desfazer: () => {
            setD(null);
            d.desfazer();
          },
          fechar: () => setD(null),
        }
      }
    />
  );
  return { abrir, fechar: () => setD(null), caixinha };
}

/** As contagens por etapa, à mão, com a bolinha da etapa (as mesmas do bloco recolhido das Produções). */
function ContasPorEtapa({ contagens, id, rotulo }: { contagens: ContagensDaCampanha; id: string; rotulo: string }) {
  return (
    <ul className="prod-contas-recolhido camp-contas" aria-label={rotulo}>
      {ETAPAS_DA_CAMPANHA.map((k, i) => (
        <li key={k} data-coluna={k} title={ROTULO_DA_COLUNA[k]}>
          <i aria-hidden="true" />
          <Conta n={contagens[k]} traco={tracoDe(id) + i} rotulo={`${ROTULO_DA_COLUNA[k]}: ${plural(contagens[k], 'produção', 'produções')}`} />
          <span className="camp-conta-nome" aria-hidden="true">
            {ROTULO_DA_COLUNA[k]}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A bolinha no tom da campanha (o mesmo da etiqueta, em todas as telas). */
const BolinhaDaCampanha = ({ id }: { id: string }) => <i className="camp-bolinha" data-tom={tomDaCampanha(id)} aria-hidden="true" />;

/* ---------- a lista das campanhas ---------- */

export function ListaDasCampanhas({ topo, abrir }: { topo: ReactNode; abrir: (id: string) => void }) {
  const [lidas, setLidas] = useState<CampanhaNaLista[] | null>(null);
  const [podeCriar, setPodeCriar] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState<string | null>(null);
  const [recusa, setRecusa] = useState('');
  const desfazer = useCaixinha();
  const ler = useCallback(
    () =>
      lerListaDasCampanhas().then(
        (r) => {
          setLidas(r.campanhas);
          setPodeCriar(r.voce.podeMudar);
          setErro('');
        },
        (e) => setErro(e instanceof Error ? e.message : 'Não deu para ler as campanhas.'),
      ),
    [],
  );
  useEffect(() => {
    void ler();
    // a campanha apagada na página: o Desfazer vem junto para a lista
    const apagada = apagadaAgora;
    apagadaAgora = null;
    if (apagada)
      desfazer.abrir(<>A campanha <b>{apagada.nome}</b> foi apagada. As Produções continuam.</>, () =>
        desfazerApagarCampanha(apagada.id).then(
          () => void ler(),
          (e) => setRecusa(`Não desfez: ${e instanceof Error ? e.message : 'o servidor não respondeu.'}`),
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const limpar = useCallback(() => setBusca(''), []);
  useEscLimpa(!!busca.trim() && criando === null, limpar);
  const vistas = (lidas ?? []).filter((c) => campanhaCombina(c.nome, busca));
  const lista = useRef<HTMLOListElement>(null);
  useDeslize(lista, '.camp-cartao', 'data-campanha', vistas.map((c) => c.id).join(','));
  const total = vistas.reduce((n, c) => n + c.producoes, 0);
  const criar = (nome: string) => {
    setRecusa('');
    criarCampanha(nome).then(
      (r) => {
        setCriando(null);
        abrir(r.campanha.id);
      },
      (e) => setRecusa(e instanceof Error ? e.message : 'Não deu para criar a campanha.'),
    );
  };
  return (
    <div className="pagina producoes campanhas">
      {topo}
      <main className="prod-pagina camp-pagina">
        <div className="prod-cabeca">
          <h1>Campanhas</h1>
          <span className="camp-cabeca-acoes">
            {podeCriar && criando === null && (
              <button type="button" className="botao camp-nova" onClick={() => setCriando(busca.trim())}>
                <Icone nome="mais" tam={14} traco={2.2} /> Nova campanha
              </button>
            )}
            {lidas && <BuscaNaLupa valor={busca} mudar={setBusca} ativa={criando === null} dica="Buscar campanha" rotulo="Buscar nas campanhas" />}
          </span>
        </div>
        {criando !== null && <NomeNoCampo inicial={criando} rotulo="O nome da campanha nova" botao="Criar" salvar={criar} cancelar={() => (setCriando(null), setRecusa(''))} />}
        {recusa && (
          <p className="prod-recusa" role="alert">
            <span>{recusa}</span>
            <button type="button" className="botao-texto" onClick={() => setRecusa('')}>
              Fechar
            </button>
          </p>
        )}
        {erro ? (
          <p className="prod-falha" role="alert">
            {erro}
          </p>
        ) : !lidas ? (
          <p className="prod-lendo">Lendo as campanhas…</p>
        ) : (
          <>
            <p className="camp-resumo" aria-live="polite">
              <NumeroQueConta valor={vistas.length} um="campanha" varios="campanhas" />
              <span className="sep" aria-hidden="true">
                ·
              </span>
              <NumeroQueConta valor={total} um="produção" varios="produções" />
              {busca.trim() && (
                <span className="camp-resumo-busca">
                  com <q>{busca.trim()}</q>
                </span>
              )}
            </p>
            {!lidas.length ? (
              <Vazio className="prod-nada camp-nada">nenhuma campanha ainda: ela nasce no card aberto da Produção, ou no “Nova campanha”</Vazio>
            ) : (
              !vistas.length && <Vazio className="prod-nada camp-nada">nenhuma campanha com isso</Vazio>
            )}
            <ol ref={lista} className="camp-cartoes">
              {vistas.map((c, i) => (
                <li key={c.id} className="camp-cartao" data-campanha={c.id} style={{ '--atraso': `${Math.min(i, NA_CASCATA) * CASCATA_MS}ms` } as CSSProperties}>
                  <a
                    className="camp-cartao-abrir"
                    href={hashDaCampanha(c.id)}
                    onClick={(e) => {
                      e.preventDefault();
                      abrir(c.id);
                    }}
                  >
                    <span className="camp-cartao-nome">
                      <BolinhaDaCampanha id={c.id} />
                      <span>{c.nome}</span>
                    </span>
                    <ContasPorEtapa contagens={c.etapas} id={c.id} rotulo={`As Produções de ${c.nome} em cada etapa`} />
                    <span className="camp-cartao-pe">
                      <span>{plural(c.producoes, 'produção', 'produções')}</span>
                      <span className="sep" aria-hidden="true">
                        ·
                      </span>
                      <span title={new Date(c.mexidaEm).toLocaleString('pt-BR')}>mexida {mexidaEscrita(c.mexidaEm)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </>
        )}
        {desfazer.caixinha}
      </main>
    </div>
  );
}

/** O campo do nome (criar e renomear): Enter salva, Esc cancela. */
function NomeNoCampo({ inicial, rotulo, botao, salvar, cancelar, indo = false }: { inicial: string; rotulo: string; botao: string; salvar: (nome: string) => void; cancelar: () => void; indo?: boolean }) {
  const [nome, setNome] = useState(inicial);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, []);
  const vale = !!nomeComparavel(nome);
  return (
    <form
      className="camp-nome-campo"
      onSubmit={(e) => {
        e.preventDefault();
        if (vale && !indo) salvar(nome);
      }}
    >
      <input
        ref={campo}
        value={nome}
        maxLength={80}
        aria-label={rotulo}
        placeholder="Lançamento da novela, AESP, chamadas de elenco…"
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          e.stopPropagation();
          cancelar();
        }}
      />
      <button type="submit" className="botao primario" disabled={!vale || indo}>
        {botao}
      </button>
      <button type="button" className="botao-texto" onClick={cancelar}>
        Cancelar
      </button>
    </form>
  );
}

/* ---------- a página da campanha ---------- */

/** A ordem dos cards em cada coluna: o prazo (sem prazo no fim) e, no mesmo prazo, a ALTA primeiro (como nas Produções). */
const naOrdemDoPrazo = (a: CardDaProducao, b: CardDaProducao) => (a.prazo ?? '￿').localeCompare(b.prazo ?? '￿') || Number(b.alta) - Number(a.alta) || a.claquete.localeCompare(b.claquete, 'pt-BR');

/** O card combina com a busca da página: a claquete, a atração e as pessoas, como a busca de Produções. */
const cardCombina = (c: CardDaProducao, termo: string) => campanhaCombina([c.claquete, c.atracao, ...c.designers].join(' '), termo);

/** O dia e o editor da claquete na Pauta da edição, no pé do card. */
function NaPauta({ linhas, hoje }: { linhas: ClaqueteNaPautaDaCampanha[]; hoje: string }) {
  if (!linhas.length) return null;
  return (
    <ul className="camp-na-pauta" aria-label="Na Pauta da edição">
      {linhas.map((l) => (
        <li key={`${l.dia}|${l.editor}|${l.claquete}`} title={`Na Pauta: ${l.claquete}`}>
          <Icone nome="edicao" tam={12} traco={1.8} />
          <span className="camp-na-pauta-dia">{diaEscrito(l.dia, hoje)}</span>
          <span className="camp-na-pauta-editor">{l.editor || 'sem editor'}</span>
        </li>
      ))}
    </ul>
  );
}

export function PaginaDaCampanha({ id, topo, voltar }: { id: string; topo: ReactNode; voltar: () => void }) {
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [erro, setErro] = useState('');
  const [recusa, setRecusa] = useState('');
  const [hoje, setHoje] = useState(hojeEmSaoPaulo);
  const [busca, setBusca] = useState('');
  const [renomeando, setRenomeando] = useState(false);
  const [indo, setIndo] = useState(false);
  const [ligando, setLigando] = useState(false);
  const [aberta, setAberta] = useState<{ card: CardDaProducao; origem: HTMLElement | null; inicial: ProducaoLida | null } | null>(null);
  const desfazer = useCaixinha();
  const falhou = (o: string) => (e: unknown) => setRecusa(`${o}: ${e instanceof Error ? e.message : 'o servidor não respondeu.'}`);

  useEffect(() => {
    let vivo = true;
    lerPaginaDaCampanha(id).then(
      (p) => {
        if (!vivo) return;
        setPagina(p);
        setHoje(hojeEmSaoPaulo());
      },
      (e) => vivo && setErro(e instanceof Error ? e.message : 'Não deu para ler a campanha.'),
    );
    return () => {
      vivo = false;
    };
  }, [id]);

  // o nome se escreve à mão quando chega e quando muda (renomear)
  const titulo = useRef<HTMLSpanElement>(null);
  const nome = pagina?.campanha.nome ?? '';
  useLayoutEffect(() => {
    if (!nome || !titulo.current || semMovimento() || typeof titulo.current.animate !== 'function') return;
    const a = escrever(titulo.current);
    return () => a.cancel();
  }, [nome]);

  const limpar = useCallback(() => setBusca(''), []);
  useEscLimpa(!!busca.trim() && !aberta && !renomeando && !ligando, limpar);

  const producoes = pagina?.producoes ?? [];
  const pautaDe = useMemo(() => {
    const m = new Map<string, ClaqueteNaPautaDaCampanha[]>();
    for (const l of pagina?.pauta.linhas ?? []) m.set(l.producao, [...(m.get(l.producao) ?? []), l]);
    return m;
  }, [pagina]);
  const abertas = producoes.filter((c) => !c.arquivada);
  const arquivadas = producoes.filter((c) => c.arquivada);
  const vistas = abertas.filter((c) => cardCombina(c, busca)).sort(naOrdemDoPrazo);
  const colunas = ETAPAS_DA_CAMPANHA.map((k) => ({ k, cards: vistas.filter((c) => c.etapa === k) }));
  const sugestoes = (pagina?.sugestoes ?? []).filter((c) => cardCombina(c, busca));
  const naPauta = abertas.filter((c) => pautaDe.has(c.id)).length;

  // o deslize: o card que muda de coluna, o que sai, a sugestão que entra voando até a coluna
  const corpo = useRef<HTMLDivElement>(null);
  useDeslize(corpo, '.prod-card', 'data-producao', [...colunas.map((c) => c.cards.map((x) => x.id).join(',')), sugestoes.map((x) => x.id).join(','), arquivadas.map((x) => x.id).join(',')].join('|'));

  /** Ligar (`liga`) ou tirar Produções: tirar muda na hora; ligar espera o servidor (a sugestão voa quando ele diz). */
  const mudar = (ids: string[], liga: boolean, frase: (n: number) => ReactNode) => {
    if (!pagina || !ids.length) return Promise.resolve();
    setRecusa('');
    desfazer.fechar();
    const antes = pagina;
    if (!liga) setPagina({ ...pagina, producoes: pagina.producoes.filter((c) => !ids.includes(c.id)) });
    return ligarNaCampanha(id, ids, liga).then(
      (r) => {
        setPagina(r.pagina);
        if (r.feito.mudadas.length) desfazer.abrir(frase(r.feito.mudadas.length), () => void mudar(r.feito.mudadas, !liga, (n) => (liga ? `Desfeito: ${plural(n, 'Produção saiu', 'Produções saíram')} da campanha.` : `Desfeito: ${plural(n, 'Produção voltou', 'Produções voltaram')} para a campanha.`)));
      },
      (e) => {
        setPagina(antes);
        falhou(liga ? 'Não ligou' : 'Não tirou')(e);
      },
    );
  };
  const tirar = (c: CardDaProducao) => mudar([c.id], false, () => <><b>{c.claquete || 'A Produção'}</b> saiu da campanha.</>);
  const ligarUma = (c: CardDaProducao) => mudar([c.id], true, () => <><b>{c.claquete || 'A Produção'}</b> entrou na campanha.</>);

  const renomear = (novo: string) => {
    setIndo(true);
    setRecusa('');
    const de = pagina?.campanha.nome ?? '';
    renomearCampanha(id, novo)
      .then(
        (p) => {
          setPagina(p);
          setRenomeando(false);
          if (p.campanha.nome !== de) desfazer.abrir(<>Agora é <b>{p.campanha.nome}</b>.</>, () => renomearCampanha(id, de).then(setPagina, falhou('Não desfez')));
        },
        falhou('Não renomeou'),
      )
      .finally(() => setIndo(false));
  };
  const apagar = () => {
    if (!pagina) return;
    setIndo(true);
    setRecusa('');
    apagarCampanha(id).then(
      (r) => {
        apagadaAgora = r.apagada;
        voltar();
      },
      (e) => {
        setIndo(false);
        falhou('Não apagou')(e);
      },
    );
  };

  /** Abrir a Produção no card aberto (lida antes, até um instante, como nas Produções). */
  const abrir = (card: CardDaProducao, origem: HTMLElement) => {
    let inicial: ProducaoLida | null = null;
    const pedido = lerProducaoAberta(card.id).then((l) => (inicial = l), () => null);
    void Promise.race([pedido, new Promise((ok) => setTimeout(ok, ESPERA_PARA_ABRIR_MS))]).then(() => setAberta({ card, origem, inicial }));
  };
  const fecharAberta = useCallback(() => setAberta(null), []);
  /** O card mudou no card aberto: a página mostra na hora; tirado desta campanha ali, sai da página. */
  const mudouNoCard = useCallback(
    (c: CardDaProducao) =>
      setPagina((p) => {
        if (!p) return p;
        const fica = c.campanhas?.some((x) => x.id === p.campanha.id) ?? true;
        const producoes = fica ? p.producoes.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : p.producoes.filter((x) => x.id !== c.id);
        return { ...p, producoes, sugestoes: p.sugestoes.map((x) => (x.id === c.id ? { ...x, ...c } : x)) };
      }),
    [],
  );
  const cardAberto = aberta && ([...producoes, ...(pagina?.sugestoes ?? [])].find((c) => c.id === aberta.card.id) ?? aberta.card);
  // o card aberto volta para o card da página: o que mudou de coluna é outro elemento, achado de novo
  useLayoutEffect(() => {
    if (!aberta || aberta.origem?.isConnected) return;
    const el = document.querySelector<HTMLElement>(`.camp-pagina .prod-card[data-producao="${CSS.escape(aberta.card.id)}"]`);
    if (el) setAberta((a) => a && { ...a, origem: el });
  });

  const voce = pagina?.voce;
  const pe = (c: CardDaCampanha, sugestao = false) => (
    <>
      <NaPauta linhas={pautaDe.get(c.id) ?? []} hoje={hoje} />
      {voce?.podeMudar &&
        (sugestao ? (
          <span className="prod-acoes camp-acoes">
            <button type="button" className="botao prod-mudar camp-ligar-uma" onClick={() => void ligarUma(c)}>
              <Icone nome="mais" tam={12} traco={2.4} /> Ligar à campanha
            </button>
          </span>
        ) : (
          <button type="button" className="camp-tirar" aria-label={`Tirar ${c.claquete || 'a Produção'} da campanha`} title="Tirar da campanha" onClick={() => void tirar(c)}>
            <Icone nome="fechar" tam={11} traco={2.4} />
          </button>
        ))}
    </>
  );
  const cards = (cs: CardDaCampanha[], sugestao = false) => (
    <ul className="prod-cards">
      {cs.map((c) => (
        <CardDaTela key={c.id} c={c} hoje={hoje} acoes={null} abrir={(el) => abrir(c, el)} extra={pe(c, sugestao)} />
      ))}
    </ul>
  );

  return (
    <div className="pagina producoes campanhas">
      {topo}
      <main className="prod-pagina camp-pagina">
        <a
          className="camp-voltar"
          href={HASH_DAS_CAMPANHAS}
          onClick={(e) => {
            e.preventDefault();
            voltar();
          }}
        >
          <Icone nome="voltar" tam={14} traco={2.2} /> Campanhas
        </a>
        {erro ? (
          <p className="prod-falha" role="alert">
            {erro}{' '}
            <a href={HASH_DAS_CAMPANHAS} onClick={(e) => (e.preventDefault(), voltar())}>
              Ver as campanhas
            </a>
          </p>
        ) : !pagina ? (
          <p className="prod-lendo">Lendo a campanha…</p>
        ) : (
          <>
            <div className="prod-cabeca camp-cabeca">
              {renomeando ? (
                <NomeNoCampo inicial={pagina.campanha.nome} rotulo="O nome da campanha" botao="Renomear" indo={indo} salvar={renomear} cancelar={() => (setRenomeando(false), setRecusa(''))} />
              ) : (
                <h1 className="camp-titulo">
                  <BolinhaDaCampanha id={pagina.campanha.id} />
                  <span ref={titulo} className="camp-titulo-nome">
                    {pagina.campanha.nome}
                  </span>
                  {voce?.podeMudar && (
                    <button type="button" className="camp-lapis" title="Renomear" aria-label={`Renomear ${pagina.campanha.nome}`} onClick={() => setRenomeando(true)}>
                      <Icone nome="lapis" tam={15} traco={1.9} />
                    </button>
                  )}
                </h1>
              )}
              <span className="camp-cabeca-acoes">
                {voce?.podeMudar && (
                  <button type="button" className={`botao camp-abrir-ligar${ligando ? ' aberto' : ''}`} aria-expanded={ligando} onClick={() => setLigando((l) => !l)}>
                    <Icone nome="mais" tam={14} traco={2.2} /> Ligar Produções
                  </button>
                )}
                {voce?.podeApagar && (
                  <button type="button" className="botao camp-apagar" disabled={indo} title="Apagar a campanha (as Produções continuam)" aria-label={`Apagar a campanha ${pagina.campanha.nome}`} onClick={apagar}>
                    <Icone nome="lixo" tam={15} traco={1.9} />
                  </button>
                )}
                <BuscaNaLupa valor={busca} mudar={setBusca} ativa={!aberta && !renomeando && !ligando} dica="Buscar claquete, atração ou pessoa" rotulo="Buscar na campanha" />
              </span>
            </div>
            <div className="camp-resumo-linha">
              <ContasPorEtapa contagens={pagina.contagens} id={pagina.campanha.id} rotulo="As Produções da campanha em cada etapa (sem as arquivadas)" />
              <p className="camp-resumo" aria-live="polite">
                <NumeroQueConta valor={abertas.length} um="produção" varios="produções" />
                <span className="sep" aria-hidden="true">
                  ·
                </span>
                <NumeroQueConta valor={naPauta} um="na Pauta da edição" varios="na Pauta da edição" />
                {arquivadas.length > 0 && (
                  <>
                    <span className="sep" aria-hidden="true">
                      ·
                    </span>
                    {plural(arquivadas.length, 'arquivada', 'arquivadas')}
                  </>
                )}
                <span className="sep" aria-hidden="true">
                  ·
                </span>
                <span title={new Date(pagina.campanha.mexidaEm).toLocaleString('pt-BR')}>mexida {mexidaEscrita(pagina.campanha.mexidaEm)}</span>
              </p>
            </div>
            {pagina.pauta.erro && (
              <p className="prod-sem-ligacao" role="note">
                A Pauta da edição não respondeu agora: {pagina.pauta.erro}
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
            <LigarProducoes aberto={ligando} dentro={new Set(producoes.map((c) => c.id))} hoje={hoje} fechar={() => setLigando(false)} ligar={(ids) => mudar(ids, true, (n) => `${plural(n, 'Produção entrou', 'Produções entraram')} na campanha.`).then(() => setLigando(false))} />
            <div ref={corpo} className="camp-corpo">
              <section className="prod-bloco camp-bloco chegando" aria-label="As Produções da campanha">
                <div className="prod-colunas">
                  {colunas.map(({ k, cards: cs }, i) => (
                    <section key={k} className="prod-coluna" data-coluna={k} aria-label={ROTULO_DA_COLUNA[k]} style={{ '--atraso': `${i * CASCATA_MS * 2}ms` } as CSSProperties}>
                      <h3>
                        <i aria-hidden="true" />
                        <span className="prod-coluna-nome">{ROTULO_DA_COLUNA[k]}</span>
                        <Conta n={cs.length} traco={tracoDe(pagina.campanha.id) + i} rotulo={plural(cs.length, 'produção', 'produções')} />
                      </h3>
                      {cs.length ? cards(cs) : <Vazio className="prod-nada">{busca.trim() ? 'nada com isso' : 'nada aqui'}</Vazio>}
                    </section>
                  ))}
                </div>
              </section>
              {sugestoes.length > 0 && voce?.podeMudar && (
                <section className="camp-sugestoes" aria-labelledby="camp-sugestoes-titulo">
                  <header className="camp-secao-topo">
                    <h2 id="camp-sugestoes-titulo">Da mesma atração</h2>
                    <span className="camp-secao-dica">ainda não estão na campanha</span>
                    {sugestoes.length > 1 && (
                      <button type="button" className="botao-texto camp-ligar-todas" onClick={() => void mudar(sugestoes.map((c) => c.id), true, (n) => `${plural(n, 'Produção entrou', 'Produções entraram')} na campanha.`)}>
                        Ligar as {sugestoes.length}
                      </button>
                    )}
                  </header>
                  {cards(sugestoes, true)}
                </section>
              )}
              {arquivadas.length > 0 && (
                <details className="camp-arquivadas">
                  <summary>
                    <Icone nome="direita" tam={13} traco={2.2} /> {plural(arquivadas.length, 'arquivada', 'arquivadas')} <small>continuam na campanha, fora das contagens</small>
                  </summary>
                  {cards(arquivadas)}
                </details>
              )}
            </div>
            {cardAberto && aberta && (
              <ProducaoAberta card={cardAberto} origem={aberta.origem} inicial={aberta.inicial} hoje={hoje} prazoEscrito={(p) => prazoEscrito(p, hoje)} voce={voce?.designer ?? null} mudou={mudouNoCard} fechar={fecharAberta} />
            )}
          </>
        )}
        {desfazer.caixinha}
      </main>
    </div>
  );
}

/** Quanto o "ligar Produções" espera a pessoa parar de digitar (o mesmo da busca de Produções). */
const ESPERA_DA_BUSCA_MS = 220;

/** Ligar várias Produções de uma vez (#180): buscar pela claquete ou pela atração (a busca de Produções, no histórico
    todo), escolher na lista dos achados e ligar todas. Abre e fecha deslizando a altura. */
function LigarProducoes({ aberto, dentro, hoje, ligar, fechar }: { aberto: boolean; dentro: ReadonlySet<string>; hoje: string; ligar: (ids: string[]) => Promise<void>; fechar: () => void }) {
  const [termo, setTermo] = useState('');
  const [achados, setAchados] = useState<{ termo: string; cards: CardDaProducao[]; total: number } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [escolhidas, setEscolhidas] = useState<ReadonlyMap<string, CardDaProducao>>(new Map());
  const [indo, setIndo] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!aberto) {
      setTermo('');
      setAchados(null);
      setEscolhidas(new Map());
      return;
    }
    campo.current?.focus({ preventScroll: true });
  }, [aberto]);
  const limpo = termo.trim();
  useEffect(() => {
    if (!limpo) return;
    const pedido = new AbortController();
    setBuscando(true);
    const t = setTimeout(() => {
      buscarProducoes(limpo, 0, pedido.signal).then(
        (r) => {
          setAchados({ termo: limpo, cards: r.cards, total: r.total });
          setErro('');
          setBuscando(false);
        },
        (e) => {
          if (pedido.signal.aborted) return;
          setErro(e instanceof Error ? e.message : 'A busca não respondeu.');
          setBuscando(false);
        },
      );
    }, ESPERA_DA_BUSCA_MS);
    return () => {
      clearTimeout(t);
      pedido.abort();
    };
  }, [limpo]);
  const alternar = (c: CardDaProducao) =>
    setEscolhidas((m) => {
      const n = new Map(m);
      if (n.has(c.id)) n.delete(c.id);
      else n.set(c.id, c);
      return n;
    });
  const n = escolhidas.size;
  const vistos = limpo && achados ? achados.cards : [];
  return (
    <section className={`camp-ligar${aberto ? ' aberto' : ''}`} aria-label="Ligar Produções à campanha" inert={!aberto || undefined}>
      <div className="camp-ligar-dentro">
        <div className="camp-ligar-topo">
          <label className="busca aberta camp-ligar-busca">
            <Icone nome="lupa" tam={15} traco={2} />
            <input
              ref={campo}
              type="search"
              placeholder="Buscar claquete ou atração"
              aria-label="Buscar Produções para ligar"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                e.preventDefault();
                e.stopPropagation();
                if (termo) setTermo('');
                else fechar();
              }}
            />
          </label>
          <span className="camp-ligar-escolhidas" aria-live="polite">
            {n > 0 && [...escolhidas.values()].map((c) => (
              <button key={c.id} type="button" className="camp-escolhida" title="Tirar da escolha" onClick={() => alternar(c)}>
                {c.claquete || 'Sem claquete'} <Icone nome="fechar" tam={9} traco={2.6} />
              </button>
            ))}
          </span>
          <button type="button" className="botao primario" disabled={!n || indo} onClick={() => (setIndo(true), void ligar([...escolhidas.keys()]).finally(() => setIndo(false)))}>
            {n ? `Ligar ${plural(n, 'Produção', 'Produções')}` : 'Ligar'}
          </button>
          <button type="button" className="botao-texto" onClick={fechar}>
            Fechar
          </button>
        </div>
        {limpo ? (
          <ListaDeAchados
            classe="camp-ligar-achados"
            itens={vistos}
            chave={(c) => c.id}
            dados={(c) => ({ 'data-etapa': c.etapa })}
            saindo={false}
            buscando={buscando}
            titulo={erro ? <span className="prod-busca-falha">{erro}</span> : !achados ? 'Buscando…' : achados.total ? <>{plural(achados.total, 'produção', 'produções')} com <q>{achados.termo}</q></> : <>Nada com <q>{achados.termo}</q></>}
            dica="um clique escolhe · escolha quantas quiser, de várias buscas"
            nada={achados && !achados.total && !erro ? 'nenhuma Produção com isso' : null}
            linha={(c) => <AchadoDaProducao c={c} diaEscrito={(d) => diaEscrito(d, hoje)} prazoEscrito={(p) => prazoEscrito(p, hoje)} escolhida={escolhidas.has(c.id)} jaEsta={dentro.has(c.id)} aoClicar={() => alternar(c)} />}
          />
        ) : (
          <Vazio className="prod-nada camp-ligar-dica">busque pela claquete ou pela atração e escolha quantas quiser</Vazio>
        )}
      </div>
    </section>
  );
}
