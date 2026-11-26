import { useEffect, useRef, useState } from 'react';
import {
  ignorarDuplicada,
  lerCasoDeDuplicada,
  lerDuplicadas,
  lerRegistroDasDuplicadas,
  reabrirDuplicada,
  type AcaoDoRegistro,
  type CardDaDuplicada,
  type CasoDaDuplicada,
  type ListaDasDuplicadas,
  type ResolvidaDaDuplicada,
  type ResumoDaDuplicada,
  type SecaoDaDuplicada,
} from '../dados/armazenamento';
import { Icone } from './icones';
import { plural } from './util';

/* Aba Duplicadas dos Cadastros (#65): as linhas da produção da arte (cada uma de um card) com a mesma claquete, praça
   e versão. A lista sai só da produção; só o caso aberto lê do Trello os cards dele. Só administradores: a lista por
   seção, com o período e a busca, e o caso aberto na própria lista, com os cards lado a lado (empilhados no celular),
   as diferenças destacadas e a sugestão de qual fica, que a pessoa troca.
   Ignorar (#66), na linha e no caso aberto, com motivo opcional: o caso vai para Resolvidas e para o Registro (o painel
   da direita), e Reabrir devolve. Nada muda no Trello nem no Teable. No celular, só consulta (sem os botões). */

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
  return { dias, mudarDias, lista, falha, lendo, renovar: () => ler(true), registro, recente, ignorar, reabrir };
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
}

type Vista = 'pendentes' | 'resolvidas';

export function ListaDeDuplicadas({ lista, falha, lendo, dias, mudarDias, renovar, busca, celular, ignorar, reabrir }: PropsDaLista) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('pendentes');
  // o caso que está sendo ignorado (o diálogo do motivo aberto)
  const [ignorando, setIgnorando] = useState<{ id: string; claquete: string } | null>(null);
  const pedirIgnorar = celular ? undefined : (c: { id: string; claquete: string }) => setIgnorando({ id: c.id, claquete: c.claquete });
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
          A aba Duplicadas ainda não está configurada: falta a produção da arte (<code>TEABLE_PG_URL</code> e <code>TEABLE_PG_ARTE</code>) no servidor.
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
        <span className="claquete-dup">{r.claquete}</span>
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
          <b className="claquete-dup">{claquete}</b> sai da lista e não volta enquanto os mesmos cards estiverem no grupo. Nada muda no Trello nem no Teable.
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

function LinhaDoCaso({ caso, aberto, alternar, dias, celular, ignorar }: { caso: ResumoDaDuplicada; aberto: boolean; alternar: () => void; dias: number; celular: boolean; ignorar?: () => void }) {
  return (
    <div className={`caso-dup${aberto ? ' aberto' : ''}${ignorar ? ' com-acao' : ''}`}>
      <div className="envolta-dup">
        <button type="button" className="linha-dup" aria-expanded={aberto} onClick={alternar}>
          <span className="topo-dup">
            <span className="claquete-dup">{caso.claquete}</span>
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
      {aberto && <DetalheDoCaso id={caso.id} dias={dias} celular={celular} ignorar={ignorar} />}
    </div>
  );
}

/* ---------- o caso aberto ---------- */

type Linha = { rotulo: string; valor: (c: CardDaDuplicada, i: number, todos: CardDaDuplicada[]) => React.ReactNode; texto?: (c: CardDaDuplicada) => string; compara?: boolean };
const LINHAS: Linha[] = [
  { rotulo: 'Claquete na produção', valor: (c) => c.claquete || '—', texto: (c) => c.claquete },
  { rotulo: 'Nome no Trello', valor: (c) => (c.noTrello === false ? <span className="sem-dup">não está mais no Trello</span> : c.nome || '—'), texto: (c) => `${c.noTrello}|${c.nome}` },
  { rotulo: 'Lista', valor: (c) => c.lista || '—', texto: (c) => c.lista },
  { rotulo: 'Estado', valor: (c) => (c.arquivado ? 'arquivado' : 'aberto'), texto: (c) => String(c.arquivado) },
  { rotulo: 'Criado', valor: (c, i, todos) => (c.criado ? [diaHora(c.criado), i > 0 && todos[0].criado ? depois(todos[0].criado, c.criado) : ''].filter(Boolean).join(' · ') : '—'), compara: false },
  { rotulo: 'Entrada', valor: (c) => diaMes(c.entrada), texto: (c) => diaMes(c.entrada) },
  { rotulo: 'Exibição', valor: (c) => diaMes(c.exibicao), texto: (c) => diaMes(c.exibicao) },
  { rotulo: 'Status', valor: (c) => (c.status.length ? c.status.map((s) => <span key={s} className="status-dup">{s}</span>) : '—'), texto: (c) => c.status.join() },
  { rotulo: 'Designers', valor: (c) => c.designers.join(', ') || '—', texto: (c) => c.designers.join() },
  { rotulo: 'Membros', valor: (c) => c.membros.join(', ') || '—', texto: (c) => c.membros.join() },
  { rotulo: 'Artes', valor: (c) => (c.checklist ? `${c.checklist} no checklist` : '—'), texto: (c) => String(c.checklist) },
  { rotulo: 'Anexos', valor: (c) => c.anexos || '—', texto: (c) => c.anexos },
  { rotulo: 'Acervo ligado', valor: (c) => (c.acervo ? plural(c.acervo, 'arte', 'artes') : '—'), texto: (c) => String(c.acervo) },
  { rotulo: 'Roteiro no PROMeiro', valor: (c) => (c.roteiro ? [c.roteiro.claquete, c.roteiro.por].filter(Boolean).join(' · ') : '—'), texto: (c) => c.roteiro?.id ?? '' },
  {
    rotulo: 'Trello',
    valor: (c) =>
      c.noTrello === false ? (
        <span className="sem-dup">não está mais no Trello</span>
      ) : (
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

function DetalheDoCaso({ id, dias, celular, ignorar }: { id: string; dias: number; celular: boolean; ignorar?: () => void }) {
  const [caso, setCaso] = useState<CasoDaDuplicada | null>(null);
  const [falha, setFalha] = useState('');
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
  }, [id, dias]);
  const { saem, ficar, sair } = useEscolha(caso);
  if (falha) return <p className="cad-falha dup-falha">{falha}</p>;
  if (!caso) return <p className="cad-vazio detalhe-dup carregando">Lendo os cards no Trello…</p>;
  const sugestao = (c: CardDaDuplicada) => (
    <p className="sugestao-dup">
      <b>{caso.sugestao.fica === c.id ? 'Sugestão: fica.' : 'Provável duplicado.'}</b> {c.motivo === 'Sugestão: fica.' ? '' : c.motivo}
    </p>
  );
  const rodape = (
    <div className="acoes-dup">
      <p className="explica-dup">
        A sugestão usa os sinais do relatório do n8n: fora do Trello, arquivado na entrada, designers e membros, quem entrou primeiro na produção, saída ou entregue.
        {celular ? ' Ignorar só no computador.' : ' Você pode trocar.'}
      </p>
      {ignorar && (
        <button type="button" className="botao" onClick={ignorar}>
          Ignorar
        </button>
      )}
    </div>
  );
  if (celular)
    return (
      <div className="detalhe-dup empilhado">
        {caso.cards.map((c, i) => (
          <article key={c.id} className={`card-dup ${caso.sugestao.fica === c.id ? 'fica' : 'sai'}`} aria-label={`Card ${c.numero ? `#${c.numero}` : c.nome}`}>
            <span className="selo-dup">{caso.sugestao.fica === c.id ? 'Sugestão: fica' : 'Sugestão: duplicado'}</span>
            {c.numero != null && <b className="numero-dup">#{c.numero}</b>}
            {c.noTrello === false && <span className="fora-dup">Não está mais no Trello</span>}
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
          {caso.cards.map((c) => {
            const sai = saem.includes(c.id);
            return (
              <div key={c.id} role="columnheader" className={`col-dup ${sai ? 'sai' : 'fica'}`}>
                <div className="fica-sai" role="radiogroup" aria-label={`O card ${c.numero ? `#${c.numero}` : c.nome}`}>
                  <button type="button" role="radio" aria-checked={!sai} onClick={() => ficar(c.id)}>
                    Fica
                  </button>
                  <button type="button" role="radio" aria-checked={sai} onClick={() => sair(c.id)}>
                    Sai
                  </button>
                </div>
                {c.numero != null && <b className="numero-dup">#{c.numero}</b>}
                {c.noTrello === false && <span className="fora-dup">Não está mais no Trello</span>}
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
  return (
    <>
      <b>{a.por}</b> {a.acao === 'apagar' ? 'apagou um card de' : 'recriou um card de'} {caso}
      {a.motivo ? `: ${a.motivo}` : ''}.
    </>
  );
}

/** O painel ao lado da lista: o Registro (quem ignorou ou reabriu o quê e quando) e como o PROMeiro acha as duplicadas. */
export function PainelDasDuplicadas({ registro, recente, reabrir, celular }: { registro: AcaoDoRegistro[] | null; recente: number | null; reabrir: (id: string) => Promise<void>; celular: boolean }) {
  const agora = useAgora(registro);
  return (
    <aside className="form-cad painel-dup" aria-label="Registro das duplicadas">
      <h2>
        <span className="bolha">
          <Icone nome="historico" tam={18} />
        </span>
        Registro
      </h2>
      <p className="dica">Quem ignorou ou reabriu cada caso, e quando. Fica guardado no PROMeiro; nada disso muda o Trello nem o Teable.</p>
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
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vazio-registro-dup">Nada ainda: quem ignorar um caso aparece aqui.</p>
      )}
      <p className="regra-dup">
        <b>Como o PROMeiro acha:</b> as linhas da produção da arte com card (sem as de filme) que entraram no período, abertas e arquivadas, agrupadas
        pela claquete sem acento, caixa e pontuação, pela praça e pela versão. O Trello só é lido no caso aberto, e só os cards dele. Versões diferentes (-2, V2, B, Opção) não contam como duplicadas. Só administradores veem esta aba.
      </p>
    </aside>
  );
}
