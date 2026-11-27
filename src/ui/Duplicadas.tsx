import { useEffect, useRef, useState } from 'react';
import { apelidoDoCard, comApelido, useApelidos } from '../dados/apelidos';
import {
  apagarDuplicada,
  ignorarDuplicada,
  lerCasoDeDuplicada,
  lerDuplicadas,
  lerRegistroDasDuplicadas,
  mudarModoDasDuplicadas,
  reabrirDuplicada,
  recriarDuplicada,
  type AcaoDoRegistro,
  type ApagadoDaDuplicada,
  type ApagarDuplicada,
  type CardDaDuplicada,
  type CasoDaDuplicada,
  type ListaDasDuplicadas,
  type RecriadoDaDuplicada,
  type ResolvidaDaDuplicada,
  type ResumoDaDuplicada,
  type SecaoDaDuplicada,
} from '../dados/armazenamento';
import { codigoDoCard } from '../modelo/duplicadas';
import { Icone } from './icones';
import { plural } from './util';
import { LinhaDoTempoDoCard } from './LinhaDoTempo';

/* Aba Duplicadas dos Cadastros (#65): as linhas da produção da arte (cada uma de um card) com a mesma claquete, praça
   e versão. A lista sai só da produção; só o caso aberto lê do Trello os cards dele. Só administradores: a lista por
   seção, com o período e a busca, e o caso aberto na própria lista, com os cards lado a lado (empilhados no celular),
   as diferenças destacadas e a sugestão de qual fica, que a pessoa troca.
   Ignorar (#66), na linha e no caso aberto, com motivo opcional: o caso vai para Resolvidas e para o Registro (o painel
   da direita), e Reabrir devolve. Nada muda no Trello nem no Teable. No celular, só consulta (sem os botões).
   Apagar (#67), no caso aberto e fora do modo só olhar: um card por vez, com a confirmação à prova de engano (os dois
   cards lado a lado, o que acontece em cada sistema, "Conferi" e o código do card que sai digitado).
   Recriar (#68), no Registro, no computador e fora do modo só olhar: o card apagado vira um card novo, feito só da
   cópia, com a confirmação que diz o que volta e o que não volta (o que só existia no Trello). */

export const PERIODOS = [30, 60, 90, 180, 365];
const PERIODO_PADRAO = 90;
const CHAVE_DO_PERIODO = 'promeiro:duplicadas-dias';

const lerPeriodo = () => {
  try {
    const n = Number(localStorage.getItem(CHAVE_DO_PERIODO));
    return PERIODOS.includes(n) ? n : PERIODO_PADRAO;
  } catch {
    return PERIODO_PADRAO;
  }
};

/**
 * A lista das duplicadas: lida quando a pessoa é administradora (o número de casos vai na aba mesmo com ela fechada),
 * de novo quando muda o período ou a busca (com a aba aberta) e quando pede para ler a produção de novo.
 */
/** O nome do caso que a tela mostra: o apelido do roteiro de um dos cards (#120), ou o da claquete; senão, a claquete. */
const nomeDoCaso = (caso: { claquete: string; cards: { id: string }[] }) => caso.cards.map((c) => apelidoDoCard(c.id)).find(Boolean) || comApelido(caso.claquete);
/** Com o apelido no lugar, a claquete da produção aparece ao passar o mouse. */
const tituloDoOriginal = (claquete: string, mostrado: string) => (mostrado !== claquete ? `Claquete: ${claquete}` : undefined);

export function useDuplicadas(pode: boolean, aberta: boolean, busca: string) {
  const [dias, setDias] = useState(lerPeriodo);
  const [lista, setLista] = useState<ListaDasDuplicadas | null>(null);
  const [falha, setFalha] = useState('');
  const [lendo, setLendo] = useState(false);
  const termo = aberta ? busca.trim() : '';
  const pedido = useRef(0);
  const [registro, setRegistro] = useState<AcaoDoRegistro[] | null>(null);
  // a ação que acabou de entrar no registro (pisca no painel)
  const [recente, setRecente] = useState<number | null>(null);
  const lerRegistro = () =>
    lerRegistroDasDuplicadas().then(
      (r) => setRegistro(r),
      () => setRegistro((r) => r ?? []),
    );
  const ler = (renovar = false) => {
    const n = ++pedido.current;
    setLendo(true);
    lerDuplicadas(dias, termo, renovar).then(
      (l) => {
        if (n !== pedido.current) return;
        setLista(l);
        setFalha('');
        setLendo(false);
      },
      (e: Error) => {
        if (n !== pedido.current) return;
        setFalha(e.message);
        setLendo(false);
      },
    );
  };
  useEffect(() => {
    if (pode && aberta) void lerRegistro();
  }, [pode, aberta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pode) return;
    // a busca espera a pessoa parar de digitar
    const t = setTimeout(() => ler(), termo ? 250 : 0);
    return () => clearTimeout(t);
  }, [pode, dias, termo]); // eslint-disable-line react-hooks/exhaustive-deps
  const mudarDias = (d: number) => {
    setDias(d);
    try {
      localStorage.setItem(CHAVE_DO_PERIODO, String(d));
    } catch {
      /* sem o armazenamento do navegador, o período vale só agora */
    }
  };
  /** Depois de ignorar ou reabrir: a lista (do que já foi lido da produção) e o registro de novo. */
  const depoisDaAcao = async () => {
    ler();
    const antes = registro?.[0]?.id ?? 0;
    const r = await lerRegistroDasDuplicadas().catch(() => null);
    if (!r) return;
    setRegistro(r);
    setRecente(r[0] && r[0].id > antes ? r[0].id : null);
  };
  const ignorar = async (id: string, motivo: string) => {
    await ignorarDuplicada(id, dias, motivo);
    await depoisDaAcao();
  };
  const reabrir = async (id: string) => {
    try {
      await reabrirDuplicada(id);
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não consegui reabrir o caso.');
      return;
    }
    await depoisDaAcao();
  };
  /** O modo só olhar (#67): liga ou desliga o Apagar (a chave da configuração) e lê a lista de novo. */
  const mudarModo = async (soOlhar: boolean) => {
    try {
      await mudarModoDasDuplicadas(soOlhar);
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não consegui mudar o modo da aba.');
      return;
    }
    ler();
  };
  return { dias, mudarDias, lista, falha, lendo, renovar: () => ler(true), registro, recente, ignorar, reabrir, depoisDeApagar: depoisDaAcao, mudarModo };
}

/* ---------- textos ---------- */

const SECOES: { id: SecaoDaDuplicada; titulo: string; nota: string }[] = [
  { id: 'misto', titulo: 'Com arquivado e aberto', nota: 'O caso de sempre: um reenvio arquivado na entrada.' },
  { id: 'abertos', titulo: 'Todos abertos', nota: 'Nenhum foi arquivado.' },
  { id: 'arquivados', titulo: 'Todos arquivados', nota: 'Já foram todos arquivados.' },
];

const quantoTempo = (iso: string | null, agora: number) => {
  if (!iso) return '';
  const min = Math.floor((agora - Date.parse(iso)) / 60_000);
  return min < 1 ? 'agora' : min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)} h`;
};
/** A hora de agora, de 30 em 30 s e quando `mudou` muda (o "há N min" anda sozinho). */
function useAgora(mudou: unknown) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setAgora(Date.now()), [mudou]);
  return agora;
}
/** "agora", "há 12 min", "hoje, 14:02", "ontem, 17:10", "24/11, 10:02" */
function quando(iso: string, agora: number) {
  const d = new Date(iso);
  const min = Math.floor((agora - d.getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dia = (t: number) => new Date(t).toDateString();
  if (dia(agora) === d.toDateString()) return `hoje, ${hora}`;
  if (dia(agora - 86_400_000) === d.toDateString()) return `ontem, ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`;
}
const haDias = (n: number) => (n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`);
const diaMes = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
const diaHora = (iso: string) => `${diaMes(iso)} ${new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
/** "26 min depois", "3 h depois", "2 dias depois" (do primeiro card do caso). */
function depois(de: string, ate: string) {
  const min = Math.round((Date.parse(ate) - Date.parse(de)) / 60_000);
  if (min <= 0) return '';
  if (min < 60) return `${min} min depois`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h depois`;
  return `${Math.round(min / 1440)} dias depois`;
}

/* ---------- a lista ---------- */

interface PropsDaLista {
  lista: ListaDasDuplicadas | null;
  falha: string;
  lendo: boolean;
  dias: number;
  mudarDias: (d: number) => void;
  renovar: () => void;
  busca: string;
  celular: boolean;
  ignorar: (id: string, motivo: string) => Promise<void>;
  reabrir: (id: string) => Promise<void>;
  /** depois de apagar um card: a lista e o registro de novo */
  depoisDeApagar: () => Promise<void>;
}

type Vista = 'pendentes' | 'resolvidas';

export function ListaDeDuplicadas({ lista, falha, lendo, dias, mudarDias, renovar, busca, celular, ignorar, reabrir, depoisDeApagar }: PropsDaLista) {
  // o apelido da claquete (#120) no lugar dela: só para mostrar, o caso é achado pela claquete da produção
  useApelidos();
  const [aberto, setAberto] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('pendentes');
  // o caso que está sendo ignorado (o diálogo do motivo aberto)
  const [ignorando, setIgnorando] = useState<{ id: string; claquete: string } | null>(null);
  const pedirIgnorar = celular ? undefined : (c: { id: string; claquete: string }) => setIgnorando({ id: c.id, claquete: c.claquete });
  // apagar só no computador e fora do modo só olhar; o caso apagado fecha (o de três cards abre de novo, com dois)
  const apagar = celular || !lista || lista.soOlhar ? undefined : { depois: depoisDeApagar, fechar: () => setAberto(null) };
  // o "há N min" da leitura anda sozinho
  const agora = useAgora(lista?.lidoEm);

  return (
    <>
      <div className="filtros-dup">
        <span className="rotulo-dup">Entraram na produção em</span>
        <div className="periodo-dup" role="radiogroup" aria-label="Período">
          {PERIODOS.map((d, i) => (
            <button key={d} type="button" role="radio" aria-checked={dias === d} onClick={() => mudarDias(d)}>
              {i === 0 ? `${d} dias` : d}
            </button>
          ))}
        </div>
        {lista?.ligado && (
          <div className="vista-dup" role="radiogroup" aria-label="Situação">
            <button type="button" role="radio" aria-checked={vista === 'pendentes'} onClick={() => setVista('pendentes')}>
              Para olhar<b>{lista.pendentes}</b>
            </button>
            <button type="button" role="radio" aria-checked={vista === 'resolvidas'} onClick={() => setVista('resolvidas')}>
              Resolvidas<b>{lista.totalResolvidas}</b>
            </button>
          </div>
        )}
        {lista?.ligado && lista.lidoEm && (
          <p className="lido-dup">
            Lido da produção {quantoTempo(lista.lidoEm, agora)} · {lista.linhasLidas.toLocaleString('pt-BR')} {lista.linhasLidas === 1 ? 'linha' : 'linhas'}
            <button type="button" className="botao-texto" onClick={renovar} disabled={lendo} title="Ler a produção da arte de novo">
              {lendo ? 'lendo…' : 'ler de novo'}
            </button>
          </p>
        )}
      </div>
      {falha && <p className="cad-falha dup-falha">{falha}</p>}
      {!lista && !falha && <p className="cad-vazio">Lendo a produção da arte…</p>}
      {lista && !lista.ligado && (
        <p className="cad-vazio dup-desligada">
          A aba Duplicadas ainda não está configurada: falta a produção da arte (<code>TEABLE_PG_URL</code> e a tabela ARTE_producao na base do Teable) no servidor.
        </p>
      )}
      {lista?.ligado && vista === 'pendentes' && !lista.casos.length && (
        <p className="cad-vazio">{busca.trim() ? `Nenhuma duplicada com “${busca.trim()}”.` : `Nenhuma duplicada nas linhas que entraram em ${dias} dias.`}</p>
      )}
      {lista?.ligado &&
        vista === 'pendentes' &&
        SECOES.map((s) => {
          const casos = lista.casos.filter((c) => c.secao === s.id);
          if (!casos.length) return null;
          const cards = casos.reduce((n, c) => n + c.cards, 0);
          return (
            <section key={s.id} className="secao-dup" aria-label={s.titulo}>
              <header>
                <h3>{s.titulo}</h3>
                <span className="qtd">
                  {plural(casos.length, 'caso', 'casos')} · {plural(cards, 'card', 'cards')}
                </span>
                <span className="nota">{s.nota}</span>
              </header>
              {casos.map((c) => (
                <LinhaDoCaso
                  key={c.id}
                  caso={c}
                  aberto={aberto === c.id}
                  alternar={() => setAberto((a) => (a === c.id ? null : c.id))}
                  dias={dias}
                  celular={celular}
                  ignorar={pedirIgnorar && (() => pedirIgnorar(c))}
                  apagar={apagar}
                />
              ))}
            </section>
          );
        })}
      {lista?.ligado && vista === 'resolvidas' && (
        <section className="secao-dup" aria-label="Resolvidas">
          <header>
            <h3>Resolvidas</h3>
            <span className="qtd">no período</span>
            <span className="nota">Não voltam enquanto os mesmos cards estiverem no grupo.</span>
          </header>
          {lista.resolvidas.map((r) => (
            <LinhaResolvida key={r.id} r={r} agora={agora} reabrir={celular ? undefined : () => reabrir(r.id)} />
          ))}
          {!lista.resolvidas.length && (
            <p className="cad-vazio">{busca.trim() ? `Nenhuma resolvida com “${busca.trim()}”.` : `Nenhum caso ignorado nas linhas que entraram em ${dias} dias.`}</p>
          )}
        </section>
      )}
      {ignorando && (
        <DialogoIgnorar
          claquete={ignorando.claquete}
          fechar={() => setIgnorando(null)}
          confirmar={async (motivo) => {
            await ignorar(ignorando.id, motivo);
            setIgnorando(null);
            setAberto((a) => (a === ignorando.id ? null : a));
          }}
        />
      )}
    </>
  );
}

/** Um caso ignorado: a claquete, "Não é duplicada", o motivo, quem e quando, e Reabrir (no computador). */
function LinhaResolvida({ r, agora, reabrir }: { r: ResolvidaDaDuplicada; agora: number; reabrir?: () => Promise<void> }) {
  const [indo, setIndo] = useState(false);
  return (
    <div className="caso-dup resolvida-dup">
      <div className="topo-dup">
        <span className="claquete-dup" title={tituloDoOriginal(r.claquete, comApelido(r.claquete))}>{comApelido(r.claquete)}</span>
        <span className="praca-dup">{r.praca}</span>
        {reabrir && (
          <span className="lado-dup">
            <button
              type="button"
              className="botao-texto"
              disabled={indo}
              onClick={() => {
                setIndo(true);
                void reabrir().finally(() => setIndo(false));
              }}
            >
              {indo ? 'Reabrindo…' : 'Reabrir'}
            </button>
          </span>
        )}
      </div>
      <span className="sinais-dup">
        <span className="s">Não é duplicada</span>
        {r.motivo && <span className="s">{r.motivo}</span>}
        <span className="s">{plural(r.cards, 'card', 'cards')}</span>
        <span className="s">
          {r.por}, {quando(r.em, agora)}
        </span>
      </span>
    </div>
  );
}

/** Os motivos de sempre, para não digitar; o campo curto fica para o resto. */
const MOTIVOS = ['São exibições diferentes', 'Praças diferentes', 'Uma é versão da outra', 'Pedido de propósito'];
const MOTIVO_MAXIMO = 200;

/** O diálogo de ignorar: o motivo é opcional (um dos de sempre, uma observação curta, ou os dois). */
function DialogoIgnorar({ claquete, fechar, confirmar }: { claquete: string; fechar: () => void; confirmar: (motivo: string) => Promise<void> }) {
  const [escolhido, setEscolhido] = useState('');
  const [obs, setObs] = useState('');
  const [indo, setIndo] = useState(false);
  const [falha, setFalha] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => campo.current?.focus(), []);
  const motivo = [escolhido, obs.trim()].filter(Boolean).join(': ').slice(0, MOTIVO_MAXIMO);
  const ir = () => {
    if (indo) return;
    setIndo(true);
    setFalha('');
    confirmar(motivo).catch((e: unknown) => {
      setFalha(e instanceof Error ? e.message : 'Não consegui ignorar o caso.');
      setIndo(false);
    });
  };
  return (
    <div className="veu-dup" onMouseDown={(e) => e.target === e.currentTarget && !indo && fechar()} onKeyDown={(e) => e.key === 'Escape' && !indo && fechar()}>
      <div className="dialogo-dup" role="dialog" aria-modal="true" aria-labelledby="titulo-ignorar">
        <h2 id="titulo-ignorar">Não é duplicada</h2>
        <p className="dica">
          <b className="claquete-dup" title={tituloDoOriginal(claquete, comApelido(claquete))}>{comApelido(claquete)}</b> sai da lista e não volta enquanto os mesmos cards estiverem no grupo. Nada muda no Trello nem no Teable.
        </p>
        <span className="rotulo-dup">Por quê (opcional)</span>
        <div className="motivos-dup" role="group" aria-label="Motivo">
          {MOTIVOS.map((m) => (
            <button key={m} type="button" aria-pressed={escolhido === m} onClick={() => setEscolhido((e) => (e === m ? '' : m))}>
              {m}
            </button>
          ))}
        </div>
        <input
          ref={campo}
          className="obs-dup"
          value={obs}
          maxLength={120}
          onChange={(e) => setObs(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ir()}
          placeholder="Observação (opcional)"
          aria-label="Observação (opcional)"
        />
        {falha && <p className="cad-falha">{falha}</p>}
        <div className="rodape-dup">
          <span className="quem-dup">Fica no registro com o seu nome e a hora. Dá para reabrir.</span>
          <button type="button" className="botao-texto" onClick={fechar} disabled={indo}>
            Cancelar
          </button>
          <button type="button" className="botao primario" onClick={ir} disabled={indo}>
            {indo ? 'Ignorando…' : 'Ignorar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** O que o caso aberto precisa para apagar: depois de apagar (a lista e o registro de novo) e fechar o caso. */
type ParaApagar = { depois: () => Promise<void>; fechar: () => void };

function LinhaDoCaso({ caso, aberto, alternar, dias, celular, ignorar, apagar }: { caso: ResumoDaDuplicada; aberto: boolean; alternar: () => void; dias: number; celular: boolean; ignorar?: () => void; apagar?: ParaApagar }) {
  return (
    <div className={`caso-dup${aberto ? ' aberto' : ''}${ignorar ? ' com-acao' : ''}`}>
      <div className="envolta-dup">
        <button type="button" className="linha-dup" aria-expanded={aberto} onClick={alternar}>
          <span className="topo-dup">
            <span className="claquete-dup" title={tituloDoOriginal(caso.claquete, comApelido(caso.claquete))}>{comApelido(caso.claquete)}</span>
            <span className="praca-dup">{caso.praca}</span>
            <span className="lado-dup">
              <span>{plural(caso.cards, 'card', 'cards')}</span>
              <span>{haDias(caso.dias)}</span>
              <Icone nome={aberto ? 'baixo' : 'direita'} tam={15} />
            </span>
          </span>
          <span className="sinais-dup">
            {caso.abertos > 0 && <span className="s aberto">{plural(caso.abertos, 'aberto', 'abertos')}</span>}
            {caso.arquivados > 0 && <span className="s arquivado">{plural(caso.arquivados, 'arquivado', 'arquivados')}</span>}
            {caso.artesNoAcervo > 0 && <span className="s">{plural(caso.artesNoAcervo, 'arte', 'artes')} no acervo</span>}
          </span>
        </button>
        {ignorar && (
          <button type="button" className="botao-texto ignorar-dup" onClick={ignorar} title="Não é duplicada: tirar da lista sem apagar nada">
            Ignorar
          </button>
        )}
      </div>
      {aberto && <DetalheDoCaso id={caso.id} dias={dias} celular={celular} ignorar={ignorar} apagar={apagar} />}
    </div>
  );
}

/* ---------- o caso aberto ---------- */

type Linha = { rotulo: string; valor: (c: CardDaDuplicada, i: number, todos: CardDaDuplicada[]) => React.ReactNode; texto?: (c: CardDaDuplicada) => string; compara?: boolean };
const LINHAS: Linha[] = [
  { rotulo: 'Claquete na produção', valor: (c) => c.claquete || '—', texto: (c) => c.claquete },
  { rotulo: 'Estado', valor: (c) => (c.arquivado ? 'arquivado' : 'aberto'), texto: (c) => String(c.arquivado) },
  { rotulo: 'Criado', valor: (c, i, todos) => (c.criado ? [diaHora(c.criado), i > 0 && todos[0].criado ? depois(todos[0].criado, c.criado) : ''].filter(Boolean).join(' · ') : '—'), compara: false },
  { rotulo: 'Entrada', valor: (c) => diaMes(c.entrada), texto: (c) => diaMes(c.entrada) },
  { rotulo: 'Entrega', valor: (c) => diaMes(c.entrega), texto: (c) => diaMes(c.entrega) },
  { rotulo: 'Status', valor: (c) => (c.status.length ? c.status.map((s) => <span key={s} className="status-dup">{s}</span>) : '—'), texto: (c) => c.status.join() },
  { rotulo: 'Designers', valor: (c) => c.designers.join(', ') || '—', texto: (c) => c.designers.join() },
  { rotulo: 'Artes', valor: (c) => (c.artes ? `${c.artes} na produção` : '—'), texto: (c) => String(c.artes ?? '') },
  { rotulo: 'Acervo ligado', valor: (c) => (c.acervo ? plural(c.acervo, 'arte', 'artes') : '—'), texto: (c) => String(c.acervo) },
  // a Linha do tempo da Produção do card (#89), lida quando o caso abre
  { rotulo: 'Linha do tempo', valor: (c) => <LinhaDoTempoDoCard card={c.id} vazio="—" />, compara: false },
  { rotulo: 'Roteiro no PROMeiro', valor: (c) => (c.roteiro ? [c.roteiro.claquete, c.roteiro.por].filter(Boolean).join(' · ') : '—'), texto: (c) => c.roteiro?.id ?? '' },
  {
    rotulo: 'Trello',
    valor: (c) => (
      <a href={c.url} target="_blank" rel="noreferrer" className="link-dup">
        {c.url.replace(/^https?:\/\//, '')}
      </a>
    ),
    compara: false,
  },
];
/** A linha difere entre os cards? (a criação e o link sempre diferem: não contam) */
const difere = (l: Linha, cards: CardDaDuplicada[]) => l.compara !== false && !!l.texto && new Set(cards.map(l.texto)).size > 1;

/** Quem fica e quem sai, começando pela sugestão; a pessoa troca. Sempre fica um. */
function useEscolha(caso: CasoDaDuplicada | null) {
  const [saem, setSaem] = useState<string[]>([]);
  useEffect(() => setSaem(caso?.sugestao.saem ?? []), [caso]);
  const ficar = (id: string) =>
    setSaem((s) => {
      if (!caso || !s.includes(id)) return s;
      // com dois cards, ficar com um é tirar o outro
      return caso.cards.length === 2 ? caso.cards.filter((c) => c.id !== id).map((c) => c.id) : s.filter((x) => x !== id);
    });
  const sair = (id: string) =>
    setSaem((s) => {
      if (!caso || s.includes(id)) return s;
      const novo = [...s, id];
      if (novo.length < caso.cards.length) return novo;
      // sempre fica um: com dois cards, tirar um é ficar com o outro; com mais, o último que fica não sai
      return caso.cards.length === 2 ? [id] : s;
    });
  return { saem, ficar, sair };
}

function DetalheDoCaso({ id, dias, celular, ignorar, apagar }: { id: string; dias: number; celular: boolean; ignorar?: () => void; apagar?: ParaApagar }) {
  const [caso, setCaso] = useState<CasoDaDuplicada | null>(null);
  const [falha, setFalha] = useState('');
  // o card que está sendo apagado (a confirmação aberta); `leitura` relê o caso depois de a confirmação fechar
  const [apagando, setApagando] = useState<string | null>(null);
  const [leitura, setLeitura] = useState(0);
  useEffect(() => {
    let vivo = true;
    setCaso(null);
    setFalha('');
    lerCasoDeDuplicada(id, dias).then(
      (c) => vivo && setCaso(c),
      (e: Error) => vivo && setFalha(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [id, dias, leitura]);
  const { saem, ficar, sair } = useEscolha(caso);
  if (falha) return <p className="cad-falha dup-falha">{falha}</p>;
  if (!caso) return <p className="cad-vazio detalhe-dup carregando">Lendo o caso na produção…</p>;
  const sugestao = (c: CardDaDuplicada) => (
    <p className="sugestao-dup">
      <b>{caso.sugestao.fica === c.id ? 'Sugestão: fica.' : 'Provável duplicado.'}</b> {c.motivo === 'Sugestão: fica.' ? '' : c.motivo}
    </p>
  );
  const rodape = (
    <div className="acoes-dup">
      <p className="explica-dup">
        A sugestão usa os sinais da produção da arte: arquivado na entrada, designers, quem entrou primeiro na produção, saída ou entregue.
        {celular ? ' Ignorar só no computador.' : ' Você pode trocar.'}
      </p>
      {ignorar && (
        <button type="button" className="botao" onClick={ignorar}>
          Ignorar
        </button>
      )}
      {apagar &&
        saem.map((sai) => {
          const c = caso.cards.find((x) => x.id === sai);
          return (
            c && (
              <button key={sai} type="button" className="botao perigo apagar-dup" onClick={() => setApagando(sai)} title="Apagar este card do Trello, com confirmação">
                Apagar …{c.codigo}
              </button>
            )
          );
        })}
      {apagar && apagando && (
        <DialogoApagar
          caso={caso}
          dias={dias}
          sai={apagando}
          fica={quemFica(caso, saem)}
          depois={apagar.depois}
          fechar={(apagou, mudou) => {
            setApagando(null);
            // apagou com dois cards: o caso sai da lista; com mais, ou se algo mudou, o caso é lido de novo
            if (apagou && caso.cards.length === 2) apagar.fechar();
            else if (apagou || mudou) setLeitura((n) => n + 1);
          }}
        />
      )}
    </div>
  );
  if (celular)
    return (
      <div className="detalhe-dup empilhado">
        {caso.cards.map((c, i) => (
          <article key={c.id} className={`card-dup ${caso.sugestao.fica === c.id ? 'fica' : 'sai'}`} aria-label={`Card ${i + 1}: ${c.claquete}`}>
            <span className="selo-dup">{caso.sugestao.fica === c.id ? 'Sugestão: fica' : 'Sugestão: duplicado'}</span>
            {sugestao(c)}
            <dl>
              {LINHAS.map((l) => (
                <div key={l.rotulo} className={difere(l, caso.cards) ? 'difere' : undefined}>
                  <dt>{l.rotulo}</dt>
                  <dd>{l.valor(c, i, caso.cards)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
        {rodape}
      </div>
    );
  return (
    <div className="detalhe-dup">
      <div className="tabela-dup" role="table" aria-label={`Cards de ${caso.claquete}`} style={{ gridTemplateColumns: `minmax(120px, 0.8fr) repeat(${caso.cards.length}, minmax(0, 1fr))` }}>
        <div role="row" className="cabeca">
          <span role="columnheader" />
          {caso.cards.map((c, i) => {
            const sai = saem.includes(c.id);
            return (
              <div key={c.id} role="columnheader" className={`col-dup ${sai ? 'sai' : 'fica'}`}>
                <div className="fica-sai" role="radiogroup" aria-label={`O card ${i + 1}: ${c.claquete}`}>
                  <button type="button" role="radio" aria-checked={!sai} onClick={() => ficar(c.id)}>
                    Fica
                  </button>
                  <button type="button" role="radio" aria-checked={sai} onClick={() => sair(c.id)}>
                    Sai
                  </button>
                </div>
                {sugestao(c)}
              </div>
            );
          })}
        </div>
        {LINHAS.map((l) => {
          const d = difere(l, caso.cards);
          return (
            <div key={l.rotulo} role="row" className={d ? 'difere' : undefined}>
              <span role="rowheader">{l.rotulo}</span>
              {caso.cards.map((c, i) => (
                <span key={c.id} role="cell" className={`col-dup ${saem.includes(c.id) ? 'sai' : 'fica'}`}>
                  {l.valor(c, i, caso.cards)}
                  {d && <i className="ne" aria-label="diferente">≠</i>}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {rodape}
    </div>
  );
}

/* ---------- apagar um card (#67) ---------- */

/** O card que fica quando `saem` saem: a sugestão, se ela não sai; senão, o primeiro que não sai. */
const quemFica = (caso: CasoDaDuplicada, saem: string[]) => (!saem.includes(caso.sugestao.fica) ? caso.sugestao.fica : caso.cards.find((c) => !saem.includes(c.id))?.id ?? caso.sugestao.fica);
const CONFERI = 'Conferi: é a mesma claquete, na mesma praça e na mesma versão, e o card que fica é o certo';
// na confirmação, os dois cards lado a lado: as linhas do caso sem a linha do tempo
const LINHAS_DA_CONFIRMACAO = LINHAS.filter((l) => l.rotulo !== 'Linha do tempo');

/**
 * A confirmação de apagar, à prova de engano: o card que fica e o que sai lado a lado (as diferenças destacadas), o que
 * acontece em cada sistema e o que dá ou não para desfazer, a caixa "Conferi" e o código do card que sai digitado. O
 * botão só acende com as duas. O card aberto pode sair, com um aviso em vermelho. Depois: o resultado, ou o que mudou.
 */
function DialogoApagar({ caso, dias, sai, fica, depois, fechar }: { caso: CasoDaDuplicada; dias: number; sai: string; fica: string; depois: () => Promise<void>; fechar: (apagou: boolean, mudou: boolean) => void }) {
  const [conferi, setConferi] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [indo, setIndo] = useState(false);
  const [resposta, setResposta] = useState<ApagarDuplicada | null>(null);
  const caixa = useRef<HTMLInputElement>(null);
  useEffect(() => caixa.current?.focus(), []);
  const cSai = caso.cards.find((c) => c.id === sai)!;
  const cFica = caso.cards.find((c) => c.id === fica)!;
  const par = [cFica, cSai];
  const pronto = conferi && codigo.trim().toLowerCase() === cSai.codigo && !indo;
  const apagou = resposta?.ok ? resposta.apagado : null;
  const recusa = resposta && !resposta.ok ? resposta : null;
  const sair = () => {
    if (indo) return;
    fechar(!!apagou, !!recusa?.mudou?.length);
    // a lista e o registro de novo só depois de fechar: com dois cards, o caso (e esta confirmação) sai da lista
    if (apagou) void depois();
  };
  const ir = () => {
    if (!pronto) return;
    setIndo(true);
    apagarDuplicada(caso, dias, sai, fica, codigo.trim()).then(
      (r) => {
        setResposta(r);
        setIndo(false);
      },
      (e: unknown) => {
        setResposta({ ok: false, erro: e instanceof Error ? e.message : 'Não consegui falar com o servidor. Nada foi apagado.' });
        setIndo(false);
      },
    );
  };
  return (
    <div className="veu-dup" onMouseDown={(e) => e.target === e.currentTarget && sair()} onKeyDown={(e) => e.key === 'Escape' && sair()}>
      <div className="dialogo-dup largo" role="dialog" aria-modal="true" aria-labelledby="titulo-apagar">
        {apagou ? (
          <ResultadoDoApagar apagado={apagou} claquete={caso.claquete} fechar={sair} />
        ) : (
          <>
            <h2 id="titulo-apagar">Apagar o card …{cSai.codigo}</h2>
            <p className="dica">
              <b className="claquete-dup" title={tituloDoOriginal(caso.claquete, nomeDoCaso(caso))}>{nomeDoCaso(caso)}</b> {caso.praca && <span className="praca-dup">{caso.praca}</span>} Um card por vez. Confira os dois uma última vez.
            </p>
            {!cSai.arquivado && (
              <p className="aviso-dup" role="alert">
                <b>O card que sai está aberto</b> (não foi arquivado){cSai.designers.length ? `, com ${cSai.designers.join(', ')}` : ''}. Ele pode sair, mas confira se não é nele que estão trabalhando.
              </p>
            )}
            <div className="comparar-dup" role="table" aria-label="O card que fica e o que sai">
              <div role="row" className="cabeca">
                <span role="columnheader" />
                {par.map((c) => (
                  <span key={c.id} role="columnheader" className={`col-dup ${c.id === sai ? 'sai' : 'fica'}`}>
                    {c.id === sai ? 'Sai' : 'Fica'} <code>…{c.codigo}</code>
                  </span>
                ))}
              </div>
              {LINHAS_DA_CONFIRMACAO.map((l) => {
                const d = difere(l, par);
                return (
                  <div key={l.rotulo} role="row" className={d ? 'difere' : undefined}>
                    <span role="rowheader">{l.rotulo}</span>
                    {par.map((c) => (
                      <span key={c.id} role="cell" className={`col-dup ${c.id === sai ? 'sai' : 'fica'}`}>
                        {l.valor(c, caso.cards.indexOf(c), caso.cards)}
                        {d && <i className="ne" aria-label="diferente">≠</i>}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
            <h3 className="sub-dup">O que acontece</h3>
            <table className="efeitos-dup">
              <thead>
                <tr>
                  <th scope="col">Onde</th>
                  <th scope="col">O que acontece</th>
                  <th scope="col">Dá para desfazer?</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Trello</th>
                  <td>
                    O card …{cSai.codigo} é apagado. O card …{cFica.codigo}, que fica, ganha o comentário “Duplicado …{cSai.codigo} apagado por você pelo PROMeiro”.
                  </td>
                  <td className="nao">Não. Recriar da cópia faz um card novo, com outro número e link e sem o histórico.</td>
                </tr>
                <tr>
                  <th scope="row">Produção da arte</th>
                  <td>A linha do card que sai é apagada pelo fluxo PROMO: DB do n8n quando o card some. O PROMeiro não apaga a linha: guarda uma cópia dela no Registro.</td>
                  <td className="nao">Não a linha. A cópia fica guardada.</td>
                </tr>
                <tr>
                  <th scope="row">Acervo</th>
                  <td>{cSai.acervo ? `${plural(cSai.acervo, 'arte passa', 'artes passam')} para o card que fica.` : 'Nenhuma arte do acervo está ligada ao card que sai.'}</td>
                  <td className="sim">{cSai.acervo ? 'Sim: as artes só trocam de card.' : '—'}</td>
                </tr>
                <tr>
                  <th scope="row">Roteiro no PROMeiro</th>
                  <td>{cSai.roteiro ? `O roteiro guardado (${cSai.roteiro.claquete}) passa a apontar para o card que fica.` : 'Nenhum roteiro guardado aponta para o card que sai.'}</td>
                  <td className="sim">{cSai.roteiro ? 'Sim: o envio só troca de card.' : '—'}</td>
                </tr>
              </tbody>
            </table>
            <label className="conferi-dup">
              <input type="checkbox" checked={conferi} onChange={(e) => setConferi(e.target.checked)} disabled={indo} />
              <span>{CONFERI}</span>
            </label>
            <label className="codigo-dup">
              <span>
                Para confirmar, digite o código do card que sai: <code>{cSai.codigo}</code>
              </span>
              <input
                ref={caixa}
                value={codigo}
                maxLength={8}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ir()}
                disabled={indo}
                autoComplete="off"
                spellCheck={false}
                aria-label="Código do card que sai"
              />
            </label>
            {recusa && (
              <div className="cad-falha recusa-dup" role="alert">
                <p>{recusa.erro}</p>
                {!!recusa.mudou?.length && (
                  <ul>
                    {recusa.mudou.map((m) => (
                      <li key={`${m.card}-${m.campo}`}>
                        <b>…{m.codigo}</b> {m.campo}: {m.campo === 'Grupo' || m.campo === 'Linha da produção' ? m.depois : `${m.antes || '—'} → ${m.depois || '—'}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="rodape-dup">
              <span className="quem-dup">Fica no Registro com o seu nome, a hora e a cópia do card.</span>
              <button type="button" className="botao-texto" onClick={sair} disabled={indo}>
                {recusa?.mudou?.length ? 'Fechar e ver de novo' : 'Cancelar'}
              </button>
              <button type="button" className="botao perigo-cheio" onClick={ir} disabled={!pronto || !!recusa?.mudou?.length || !!recusa?.bloqueado}>
                {indo ? 'Apagando…' : `Apagar o card …${cSai.codigo}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Depois de apagar: o que foi feito em cada sistema. */
function ResultadoDoApagar({ apagado, claquete, fechar }: { apagado: ApagadoDaDuplicada; claquete: string; fechar: () => void }) {
  const fechar1 = useRef<HTMLButtonElement>(null);
  useEffect(() => fechar1.current?.focus(), []);
  return (
    <div className="resultado-dup" role="status">
      <h2 id="titulo-apagar">Card …{apagado.codigo} apagado</h2>
      <p className="dica">
        <b className="claquete-dup" title={tituloDoOriginal(claquete, comApelido(claquete))}>{comApelido(claquete)}</b>
      </p>
      <ul className="feito-dup">
        <li>O card …{apagado.codigo} saiu do Trello{apagado.comentou ? `, e o card …${codigoDoCard(apagado.fica)} ganhou o comentário.` : '.'}</li>
        <li>{apagado.religadas ? `${plural(apagado.religadas, 'arte do acervo passou', 'artes do acervo passaram')} para o card que fica.` : 'Nenhuma arte do acervo para religar.'}</li>
        <li>{apagado.roteiros ? `${plural(apagado.roteiros, 'roteiro guardado aponta', 'roteiros guardados apontam')} para o card que fica.` : 'Nenhum roteiro guardado para reapontar.'}</li>
        <li>A linha da produção sai pelo n8n. A cópia do card ficou no Registro.</li>
      </ul>
      <div className="rodape-dup">
        <button ref={fechar1} type="button" className="botao primario" onClick={fechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}

/** Uma ação do registro em uma frase: quem fez o quê. */
function fraseDoRegistro(a: AcaoDoRegistro) {
  const caso = <b>{a.claquete}</b>;
  if (a.acao === 'ignorar')
    return (
      <>
        <b>{a.por}</b> ignorou {caso} ({plural(a.cards.length, 'card', 'cards')}){a.motivo ? `: ${a.motivo}` : ', sem motivo'}.
      </>
    );
  if (a.acao === 'reabrir')
    return (
      <>
        <b>{a.por}</b> reabriu {caso}.
      </>
    );
  if (a.acao === 'apagar') {
    const codigo = a.apagado?.codigo ? `…${a.apagado.codigo}` : '';
    const fica = a.fica ? `…${codigoDoCard(a.fica)}` : 'o outro';
    if (a.estado === 'falhou')
      return (
        <>
          <b>{a.por}</b> tentou apagar o card {codigo} de {caso} e parou{a.apagado?.erro ? ` ao ${a.apagado.erro}` : ''}. Nada foi apagado
          {a.apagado?.naoDesfeito.length ? `; não deu para desfazer: ${a.apagado.naoDesfeito.join('; ')}` : ''}.
        </>
      );
    if (a.estado === 'em-curso')
      return (
        <>
          <b>{a.por}</b> está apagando o card {codigo} de {caso}.
        </>
      );
    const passaram = [a.apagado?.religadas ? plural(a.apagado.religadas, 'arte', 'artes') : '', a.apagado?.roteiros ? plural(a.apagado.roteiros, 'roteiro', 'roteiros') : ''].filter(Boolean).join(' e ');
    return (
      <>
        <b>{a.por}</b> apagou o card {codigo} de {caso} (ficou {fica}{passaram ? `, que recebeu ${passaram}` : ''}).{a.estado === 'recriado' ? ' Já foi recriado.' : ''}
      </>
    );
  }
  const r = a.recriado;
  const codigo = r?.codigo ? `…${r.codigo}` : '';
  if (a.estado === 'falhou')
    return (
      <>
        <b>{a.por}</b> tentou recriar o card {codigo} de {caso} e parou{r?.erro ? ` ao ${r.erro}` : ''}. Nada ficou no Trello
        {r?.naoDesfeito.length ? `; não deu para desfazer: ${r.naoDesfeito.join('; ')}` : ''}.
      </>
    );
  if (a.estado === 'em-curso')
    return (
      <>
        <b>{a.por}</b> está recriando o card {codigo} de {caso}.
      </>
    );
  const voltaram = [r?.religadas ? plural(r.religadas, 'arte', 'artes') : '', r?.roteiros ? plural(r.roteiros, 'roteiro', 'roteiros') : ''].filter(Boolean).join(' e ');
  return (
    <>
      <b>{a.por}</b> recriou o card {codigo} de {caso}: card novo{' '}
      {r?.url ? (
        <a href={r.url} target="_blank" rel="noreferrer">
          …{r.novo}
        </a>
      ) : (
        `…${r?.novo ?? ''}`
      )}
      {voltaram ? `, com ${voltaram}` : ''}.
    </>
  );
}

/** O que só existia no Trello e não volta no card recriado (a cópia é do PROMeiro e do Teable, ADR 0006). */
const NAO_VOLTA = [
  'O número e o link do card apagado: o card novo tem outros.',
  'A descrição editada à mão, as etiquetas, os comentários e os membros: só existiam no Trello, e o PROMeiro não lê o Trello.',
  'O histórico do card, as marcas da checklist e os anexos postos à mão no Trello (só o PDF do roteiro volta).',
];
const ENTENDI = 'Entendi: é um card novo, sem o que só existia no Trello';

/**
 * A confirmação de recriar (#68): o que volta em cada sistema, o que não volta e a caixa "Entendi"; o botão só acende
 * com ela. Depois: o resultado (o card novo, com o link) ou o erro.
 */
function DialogoRecriar({ a, depois, fechar }: { a: AcaoDoRegistro; depois: () => Promise<void>; fechar: () => void }) {
  const [entendi, setEntendi] = useState(false);
  const [indo, setIndo] = useState(false);
  const [recriado, setRecriado] = useState<RecriadoDaDuplicada | null>(null);
  const [erro, setErro] = useState('');
  const caixa = useRef<HTMLInputElement>(null);
  useEffect(() => caixa.current?.focus(), []);
  const codigo = a.apagado?.codigo ?? '';
  const fica = a.fica ? codigoDoCard(a.fica) : '';
  const sair = () => {
    if (indo) return;
    fechar();
    if (recriado) void depois();
  };
  const ir = () => {
    if (!entendi || indo) return;
    setIndo(true);
    setErro('');
    recriarDuplicada(a.id).then(
      (r) => {
        if (r.ok) setRecriado(r.recriado);
        else setErro(r.erro);
        setIndo(false);
      },
      (e: unknown) => {
        setErro(e instanceof Error ? e.message : 'Não consegui falar com o servidor. Nada foi recriado.');
        setIndo(false);
      },
    );
  };
  return (
    <div className="veu-dup" onMouseDown={(e) => e.target === e.currentTarget && sair()} onKeyDown={(e) => e.key === 'Escape' && sair()}>
      <div className="dialogo-dup largo recriar-dup" role="dialog" aria-modal="true" aria-labelledby="titulo-recriar">
        {recriado ? (
          <ResultadoDoRecriar recriado={recriado} codigo={codigo} claquete={a.claquete} fechar={sair} />
        ) : (
          <>
            <h2 id="titulo-recriar">Recriar o card …{codigo}</h2>
            <p className="dica">
              <b className="claquete-dup" title={tituloDoOriginal(a.claquete, comApelido(a.claquete))}>{comApelido(a.claquete)}</b> {a.praca && <span className="praca-dup">{a.praca}</span>} O card apagado não volta: o PROMeiro faz um card novo só com a cópia guardada e o que ele e o Teable sabem. Nada é lido do Trello.
            </p>
            <h3 className="sub-dup">O que volta</h3>
            <table className="efeitos-dup">
              <tbody>
                <tr>
                  <th scope="row">Trello</th>
                  <td>
                    Um card novo na entrada{a.praca ? ` de ${a.praca}` : ''}, com a claquete, a checklist das artes, os campos que o envio preenche{a.apagado?.pdfs ? ' e o PDF do roteiro guardado' : ''}. O card …{fica}, que tinha ficado, ganha o comentário “Card …{codigo} recriado por você pelo PROMeiro”.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Produção da arte</th>
                  <td>A linha do card novo nasce como no envio, com a entrada de antes (se o n8n já tiver criado a linha, vale a dele). O caso volta à lista das duplicadas.</td>
                </tr>
                <tr>
                  <th scope="row">Acervo</th>
                  <td>{a.apagado?.religadas ? `${plural(a.apagado.religadas, 'arte volta', 'artes voltam')} do card …${fica} para o card novo.` : 'Nenhuma arte do acervo tinha passado para o card que ficou.'}</td>
                </tr>
                <tr>
                  <th scope="row">Roteiro no PROMeiro</th>
                  <td>{a.apagado?.roteiros || a.apagado?.pdfs ? 'O roteiro guardado e o PDF dele voltam a apontar para o card novo.' : 'Nenhum roteiro guardado apontava para o card apagado.'}</td>
                </tr>
              </tbody>
            </table>
            <h3 className="sub-dup">O que não volta</h3>
            <ul className="aviso-dup nao-volta-dup">
              {NAO_VOLTA.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <label className="conferi-dup">
              <input ref={caixa} type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} disabled={indo} />
              <span>{ENTENDI}</span>
            </label>
            {erro && (
              <div className="cad-falha recusa-dup" role="alert">
                <p>{erro}</p>
              </div>
            )}
            <div className="rodape-dup">
              <span className="quem-dup">Fica no Registro com o seu nome e a hora.</span>
              <button type="button" className="botao-texto" onClick={sair} disabled={indo}>
                Cancelar
              </button>
              <button type="button" className="botao primario" onClick={ir} disabled={!entendi || indo}>
                {indo ? 'Recriando…' : 'Recriar o card'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Depois de recriar: o card novo (com o link) e o que voltou para ele. */
function ResultadoDoRecriar({ recriado, codigo, claquete, fechar }: { recriado: RecriadoDaDuplicada; codigo: string; claquete: string; fechar: () => void }) {
  const fechar1 = useRef<HTMLButtonElement>(null);
  useEffect(() => fechar1.current?.focus(), []);
  return (
    <div className="resultado-dup" role="status">
      <h2 id="titulo-recriar">Card novo …{recriado.codigo} criado</h2>
      <p className="dica">
        <b className="claquete-dup" title={tituloDoOriginal(claquete, comApelido(claquete))}>{comApelido(claquete)}</b> No lugar do card …{codigo}.{' '}
        <a href={recriado.url} target="_blank" rel="noreferrer">
          Abrir no Trello
        </a>
      </p>
      <ul className="feito-dup">
        <li>O card novo está na entrada{recriado.comentou ? `, e o card …${codigoDoCard(recriado.fica)} ganhou o comentário.` : '.'}</li>
        <li>{recriado.linha ? 'A linha da produção do card novo está no Teable.' : 'Sem a linha da produção do card novo: ela aparece quando o n8n ler o card.'}</li>
        <li>
          {recriado.religadas
            ? `${plural(recriado.religadas, 'arte do acervo voltou', 'artes do acervo voltaram')} para o card novo.`
            : recriado.artesSemLinha
              ? `${plural(recriado.artesSemLinha, 'arte do acervo ficou', 'artes do acervo ficaram')} no card …${codigoDoCard(recriado.fica)}: sem a linha nova, não há onde ligar.`
              : 'Nenhuma arte do acervo para devolver.'}
        </li>
        <li>{recriado.roteiros || recriado.pdfs ? 'O roteiro guardado e o PDF apontam para o card novo.' : 'Nenhum roteiro guardado para reapontar.'}</li>
      </ul>
      {!!recriado.avisos.length && (
        <div className="aviso-dup avisos-recriar-dup">
          <b>Não entrou no card:</b>
          <ul>
            {recriado.avisos.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="rodape-dup">
        <button ref={fechar1} type="button" className="botao primario" onClick={fechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}

/** O modo só olhar (#67): nos primeiros dias, a aba não apaga, para comparar com o relatório do n8n. */
function ModoSoOlhar({ soOlhar, mudar, celular }: { soOlhar: boolean; mudar: (soOlhar: boolean) => Promise<void>; celular: boolean }) {
  const [indo, setIndo] = useState(false);
  const trocar = () => {
    setIndo(true);
    void mudar(!soOlhar).finally(() => setIndo(false));
  };
  return (
    <div className={`modo-dup${soOlhar ? ' so-olhar' : ''}`}>
      <p>
        <b>{soOlhar ? 'Só olhar' : 'Apagar liberado'}</b>{' '}
        {soOlhar ? 'O Apagar fica escondido enquanto a aba é comparada com o relatório do n8n.' : 'Os administradores apagam pelo caso aberto, no computador.'}
      </p>
      {!celular && (
        <button type="button" className="botao-texto" onClick={trocar} disabled={indo}>
          {indo ? 'Mudando…' : soOlhar ? 'Liberar o Apagar' : 'Voltar a só olhar'}
        </button>
      )}
    </div>
  );
}

/**
 * O painel ao lado da lista: o Registro (quem ignorou, reabriu, apagou ou recriou o quê e quando, com Recriar no card
 * apagado, #68) e como o PROMeiro acha as duplicadas.
 */
export function PainelDasDuplicadas({
  registro,
  recente,
  reabrir,
  celular,
  soOlhar,
  mudarModo,
  depoisDeRecriar,
}: {
  registro: AcaoDoRegistro[] | null;
  recente: number | null;
  reabrir: (id: string) => Promise<void>;
  celular: boolean;
  soOlhar: boolean | null;
  mudarModo: (soOlhar: boolean) => Promise<void>;
  depoisDeRecriar: () => Promise<void>;
}) {
  const agora = useAgora(registro);
  const [recriando, setRecriando] = useState<AcaoDoRegistro | null>(null);
  // recriar como o apagar: no computador e fora do modo só olhar
  const podeRecriar = (a: AcaoDoRegistro) => a.acao === 'apagar' && a.estado === 'feito' && !celular && soOlhar === false;
  return (
    <aside className="form-cad painel-dup" aria-label="Registro das duplicadas">
      <h2>
        <span className="bolha">
          <Icone nome="historico" tam={18} />
        </span>
        Registro
      </h2>
      <p className="dica">Quem ignorou, reabriu, apagou ou recriou cada caso, e quando. Fica guardado no PROMeiro, com a cópia de cada card apagado, de onde ele pode ser recriado.</p>
      {soOlhar !== null && <ModoSoOlhar soOlhar={soOlhar} mudar={mudarModo} celular={celular} />}
      {registro === null ? (
        <p className="vazio-registro-dup">Lendo o registro…</p>
      ) : registro.length ? (
        <ul className="registro-dup">
          {registro.map((a) => (
            <li key={a.id} className={a.id === recente ? 'novo' : undefined}>
              {fraseDoRegistro(a)}
              <span className="quando-dup">
                {quando(a.em, agora)}
                {a.podeReabrir && !celular && (
                  <>
                    {' · '}
                    <button type="button" className="botao-texto" onClick={() => void reabrir(a.caso)}>
                      Reabrir
                    </button>
                  </>
                )}
                {podeRecriar(a) && (
                  <>
                    {' · '}
                    <button type="button" className="botao-texto recriar-registro-dup" onClick={() => setRecriando(a)}>
                      Recriar
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vazio-registro-dup">Nada ainda: quem ignorar ou apagar aparece aqui.</p>
      )}
      {recriando && <DialogoRecriar a={recriando} depois={depoisDeRecriar} fechar={() => setRecriando(null)} />}
      <p className="regra-dup">
        <b>Como o PROMeiro acha:</b> as linhas da produção da arte com card (sem as de filme) que entraram no período, abertas e arquivadas, agrupadas
        pela claquete sem acento, caixa e pontuação, pela praça e pela versão. Nada é lido do Trello: apagar e recriar só escrevem nele. Versões diferentes (-2, V2, B, Opção) não contam como duplicadas. Só administradores veem esta aba.
      </p>
    </aside>
  );
}
