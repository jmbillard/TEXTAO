import { useEffect, useMemo, useRef, useState } from 'react';
import type { Falha } from '../App';
import { armazenamento, type Resumo } from '../dados/armazenamento';
import { corDe } from '../dados/colaboracao';
import { ouvirFila, type Fila } from '../dados/eventos';
import { exportar, pendencias } from '../modelo/exportar';
import { herdarTipos } from '../modelo/versoes';
import type { Roteiro } from '../modelo/tipos';
import { agruparPorDia, type GrupoDia } from './fila';
import { Ponteiros, useMeuPonteiro, type PonteiroDeAlguem, type PosicaoPonteiro } from './ponteiros';
import { CURSORES, Cursor, escolherCursor, meuCursor } from './cursores';
import { SAIR_DO_ACESSO, type Identidade } from '../dados/identidade';
import type { Pessoa } from '../modelo/tipos';
import { Icone } from './icones';
import { Marca } from './pecas';
import { semAcento } from '../modelo/vocabularios';
import { copiarTexto, dataCurtaComDia, plural } from './util';

/** Roteiros de demonstração, lidos de ./exemplos.json (arquivo → base64) quando o build é feito com VITE_EXEMPLOS=1. */
const EXEMPLOS: [string, string][] = import.meta.env.VITE_EXEMPLOS
  ? [
      ['Quem Ama Cuida (colunas)', 'Quem_AmaPrologo26_10_Rede.docx'],
      ['Eliana (.rtf)', 'Eliana_20_9.rtf'],
      ['Encontro', 'Encontro_27_10.docx'],
      ['Nobreza do Amor', 'Nobreza_27_10.docx'],
      ['Futebol', 'FutBrasileirao28_10_Sp.docx'],
    ]
  : [];

interface Props {
  abrir: (id: string) => void;
  abrirArquivo: (arquivo: File) => void;
  /** Folha nova para colar do Word, a partir da claquete. */
  criar: (claquete: string) => void;
  avisar: (texto: string) => void;
  identidade: Identidade | null;
  definirPerfil: (p: Pessoa) => void;
  /** Roteiros que acabaram de chegar: a ficha deles se monta com animação. */
  novos: string[];
  /** Arquivos soltos que não deu para ler. */
  falhas: Falha[];
  tirarFalha: (nome: string) => void;
  /** Muda a cada arquivo processado, para a fila se atualizar. */
  chegou: number;
  /** Arquivo sendo lido agora, quando a leitura demora (OCR). */
  lendo: { nome: string; detalhe: string } | null;
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')
    .toUpperCase();

/** O desenho do meu ponteiro, como os colegas o veem. Times só por escolha. */
function EscolhaDeCursor({ email }: { email: string }) {
  const [atual, setAtual] = useState(() => meuCursor(email));
  useEffect(() => setAtual(meuCursor(email)), [email]);
  const cor = corDe(email);
  return (
    <div className="escolha-cursor">
      <div className="rotulo">Seu cursor, para os colegas</div>
      <div className="escolha-cursor-grade" role="radiogroup" aria-label="Seu cursor">
        {CURSORES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={atual === c.id}
            title={c.nome}
            onClick={() => {
              escolherCursor(c.id);
              setAtual(c.id);
            }}
          >
            <Cursor id={c.id} cor={cor} tamanho={34} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Quem está usando. Com login na porta, só mostra; sem ele, deixa a pessoa se identificar. */
function Perfil({ identidade, definirPerfil }: Pick<Props, 'identidade' | 'definirPerfil'>) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setNome(identidade?.nome ?? '');
    setEmail(identidade?.email ?? '');
  }, [identidade]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('pointerdown', fora, true);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  return (
    <div className="perfil" ref={caixa}>
      <button className={`perfil-botao ${identidade ? '' : 'falta'}`} aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        {identidade ? (
          <>
            <span className="perfil-avatar">{iniciais(identidade.nome)}</span>
            <span className="perfil-nome">{identidade.nome}</span>
          </>
        ) : (
          'Quem é você?'
        )}
      </button>
      {aberto && (
        <div className="perfil-painel" role="dialog" aria-label="Seu perfil">
          {identidade?.origem === 'acesso' ? (
            <>
              <strong>{identidade.nome}</strong>
              <span className="suave">{identidade.email}</span>
              <p className="suave pequeno">Você entrou com a conta da empresa. Seus roteiros saem assinados com este nome.</p>
              <a className="botao-texto" href={SAIR_DO_ACESSO}>Sair</a>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!nome.trim()) return;
                definirPerfil({ nome, email });
                setAberto(false);
              }}
            >
              <label htmlFor="perfil-nome">Seu nome</label>
              <input id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como assina os roteiros" autoFocus autoComplete="name" />
              <label htmlFor="perfil-email">E-mail da empresa</label>
              <input id="perfil-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" autoComplete="email" />
              <p className="suave pequeno">Fica só neste navegador e assina os roteiros que você escrever.</p>
              <button className="botao primario" disabled={!nome.trim()}>Salvar</button>
            </form>
          )}
          <EscolhaDeCursor email={identidade?.email ?? ''} />
        </div>
      )}
    </div>
  );
}

/* ---------- ficha da fila ---------- */

const primeiro = (nome: string) => nome.split(/\s+/)[0];
const nomes = (pessoas: { nome: string }[]) =>
  pessoas.length <= 2 ? pessoas.map((p) => primeiro(p.nome)).join(' e ') : `${primeiro(pessoas[0].nome)} e mais ${pessoas.length - 1}`;

const RABISCOS = [
  'M13 25 C 9 11, 27 4, 43 6 C 60 9, 61 31, 42 37 C 25 42, 5 37, 8 22 C 10 11, 23 5, 38 4',
  'M50 9 C 30 2, 6 9, 6 23 C 6 37, 30 42, 46 38 C 62 33, 62 12, 44 7 C 34 4, 22 5, 15 9',
  'M10 18 C 14 6, 36 2, 50 8 C 63 14, 58 34, 40 38 C 22 42, 4 34, 7 20 C 9 12, 18 7, 28 5',
];

/** "#7 artes". Só a ficha que pede revisão ganha o círculo à caneta; na ficha nova, ele é desenhado por último. */
function Contagem({ n, traco, desenhar, circular }: { n: number; traco: number; desenhar: boolean; circular: boolean }) {
  return (
    <span className={`contagem ${desenhar ? 'desenhar' : ''}`}>
      #{n} <em>{n === 1 ? 'arte' : 'artes'}</em>
      {circular && <svg viewBox="0 0 64 44" preserveAspectRatio="none" aria-hidden="true"><path pathLength={1} d={RABISCOS[traco % RABISCOS.length]} /></svg>}
    </span>
  );
}

/** A claquete aparece como se fosse digitada; quando termina, o resto da ficha surge. */
function useDigitacao(texto: string, ligar: boolean): [string, boolean] {
  const [n, setN] = useState(ligar ? 0 : texto.length);
  useEffect(() => {
    if (!ligar) return setN(texto.length);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setN(texto.length);
    setN(0);
    const passo = Math.max(14, Math.min(42, 900 / Math.max(1, texto.length)));
    const t = setInterval(() => setN((v) => (v >= texto.length ? (clearInterval(t), v) : v + 1)), passo);
    return () => clearInterval(t);
  }, [texto, ligar]);
  return [texto.slice(0, n), n >= texto.length];
}

interface VersaoNova {
  anterior: Resumo;
  substituir: () => void;
  manter: () => void;
}

function Ficha({ r, nova, ordem, abrir, acoes, agora, eu, versao }: { r: Resumo; nova: boolean; ordem: number; abrir: () => void; acoes: React.ReactNode; agora: { nome: string; email: string }[]; eu?: string; versao?: VersaoNova }) {
  const claquete = r.meta.claquete || r.meta.titulo || r.meta.programa || 'Sem claquete';
  const [digitado, terminou] = useDigitacao(claquete, nova);
  const revisar = r.meta.revisar ?? [];
  const semEditor = !r.meta.editor;
  // alguém com o roteiro aberto: a orelha dobra, a claquete é selecionada e o nome é anotado à mão.
  // Depois que a pessoa sai, ficam a orelha pequena, um grifo e a rubrica.
  const ocupada = agora.length > 0;
  const revisada = !ocupada && !!r.revisadoPor;
  const quem = ocupada ? agora[0] : r.revisadoPor;
  return (
    <li
      className={`ficha ${revisar.length ? 'revisar' : 'pronta'} ${nova ? 'nova' : ''} ${terminou ? 'montada' : 'digitando'} ${ocupada ? 'ocupada' : ''} ${revisada ? 'revisada' : ''}`}
      data-ancora={`ficha:${r.id}`}
      style={quem ? ({ '--cor': corDe(quem.email) } as React.CSSProperties) : undefined}
    >
      {(ocupada || revisada) && (
        <span className="orelha" aria-hidden="true">
          <i>{ocupada ? primeiro(agora[0].nome)[0] : ''}</i>
        </span>
      )}
      <span className={`ficha-marca ${revisar.length ? 'revisar' : 'ok'}`} aria-hidden="true">{revisar.length ? <Icone nome="atencao" tam={12} traco={3} /> : <Icone nome="certo" tam={12} traco={3} />}</span>
      <button className="ficha-claquete" onClick={abrir} aria-label={`Abrir ${claquete}`}>
        <b>
          <span className="claquete-alvo">
            <span className="claquete-texto">{digitado}</span>
            {ocupada && <svg className="ibeam" viewBox="0 0 12 28" aria-hidden="true"><path d="M2 2 Q6 2 6 6 V22 Q6 26 2 26 M10 2 Q6 2 6 6 M10 26 Q6 26 6 22 M3.5 14 H8.5" /></svg>}
          </span>
          {nova && !terminou && <i className="cursor" />}
          {ocupada ? (
            <span className="rubrica agora" title={`${agora.map((p) => p.nome).join(', ')} com o roteiro aberto agora`}>
              {nomes(agora)} {agora.length === 1 ? 'tá vendo' : 'tão vendo'}
            </span>
          ) : (
            r.revisadoPor && (
              <span className="rubrica some" title={`Revisado por ${r.revisadoPor.nome}`}>
                rev. {r.revisadoPor.email === eu ? 'você' : primeiro(r.revisadoPor.nome)} ✓
              </span>
            )
          )}
        </b>
        <span className="some">
          {r.meta.programa || 'atração não reconhecida'}
          {r.meta.praca && <span className="ficha-praca">{r.meta.praca}</span>}
          {r.meta.dataExibicao ? ` · ${dataCurtaComDia(r.meta.dataExibicao)}` : ' · sem data'}
        </span>
      </button>
      <span className="ficha-gente some">
        {r.meta.redator || 'sem redator'}
        <small className={semEditor ? 'falta' : ''}>{semEditor ? 'edição: não está na pauta' : `edição: ${r.meta.editor}`}</small>
      </span>
      <span className="ficha-artes some"><Contagem n={r.nArtes} traco={ordem} desenhar={nova && terminou} circular={revisar.length > 0} /></span>
      <span className="ficha-acoes some">
        {acoes}
        <button className={`botao ${revisar.length ? 'primario' : ''}`} onClick={abrir}>{revisar.length ? 'Revisar' : 'Abrir'}</button>
      </span>
      {versao && (
        <span className="ficha-versao some">
          <span>
            <Icone nome="duplicar" tam={14} /> Versão nova de <b>{versao.anterior.meta.claquete || 'um roteiro'}</b>, que já está na fila.
          </span>
          <button className="botao primario" onClick={versao.substituir}>Substituir a anterior</button>
          <button className="botao-texto" onClick={versao.manter}>Manter as duas</button>
        </span>
      )}
      {revisar.length > 0 && <span className="ficha-pendencias some">{revisar.map((m) => <span key={m} className="pendencia">{m}</span>)}</span>}
    </li>
  );
}

export function Biblioteca({ abrir, abrirArquivo, criar, avisar, identidade, definirPerfil, novos, falhas, tirarFalha, chegou, lendo }: Props) {
  const [roteiros, setRoteiros] = useState<Resumo[] | null>(null);
  const [busca, setBusca] = useState('');
  // tirar da fila: some na hora, mas só é apagado depois de alguns segundos, para dar tempo de desfazer
  const [saindo, setSaindo] = useState<Resumo | null>(null);
  const prazoSaida = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [filtroEstado, setFiltroEstado] = useState<'prontos' | 'revisar' | null>(null);
  const [colando, setColando] = useState(false);
  const [claqueteNova, setClaqueteNova] = useState('');

  const carregar = () => armazenamento.listar().then(setRoteiros, () => setRoteiros([]));
  useEffect(() => {
    void carregar();
  }, [chegou]);

  // fila ao vivo: o que os colegas sobem aparece aqui na hora, com a mesma animação
  const [deOutros, setDeOutros] = useState<string[]>([]);
  const [colegas, setColegas] = useState<{ nome: string; email: string }[]>([]);
  const [noRoteiro, setNoRoteiro] = useState<Record<string, { nome: string; email: string }[]>>({});
  const [ponteiros, setPonteiros] = useState<Record<string, PonteiroDeAlguem>>({});
  const [fila, setFila] = useState<Fila | null>(null);
  const eu = identidade?.email;
  useEffect(() => {
    let prazo: ReturnType<typeof setTimeout> | undefined;
    const recarregar = () => {
      clearTimeout(prazo);
      prazo = setTimeout(() => void carregar(), 350);
    };
    const f = ouvirFila((e) => {
      if (e.tipo === 'ponteiro') {
        if (e.por === eu) return;
        return setPonteiros((atual) => {
          const novo = { ...atual };
          if (e.saiu || !e.ancora) delete novo[e.por];
          else novo[e.por] = { email: e.por, nome: e.nome, cor: corDe(e.por), cursor: e.cursor, p: { ancora: e.ancora, fx: e.fx ?? 0, fy: e.fy ?? 0 } };
          return novo;
        });
      }
      if (e.tipo === 'no-roteiro') {
        setNoRoteiro((atual) => ({ ...atual, [e.id]: e.pessoas.filter((p) => p.email !== eu) }));
        // alguém saiu do roteiro: a ficha pode ter ganhado a rubrica de quem revisou
        if (!e.pessoas.length) recarregar();
        return;
      }
      if (e.tipo === 'reconectou') {
        // a conexão caiu: o que se sabia de quem estava onde pode estar velho; o servidor manda tudo de novo
        setNoRoteiro({});
        setPonteiros({});
      }
      if (e.tipo === 'presenca') {
        return setColegas(e.pessoas.filter((p) => p.email !== eu));
      }
      if (e.tipo === 'criado' && e.por !== eu) setDeOutros((d) => [...d, e.id]);
      recarregar();
    });
    setFila(f);
    return () => {
      f.parar();
      clearTimeout(prazo);
      setFila(null);
    };
  }, [eu]); // eslint-disable-line react-hooks/exhaustive-deps
  const enviarPonteiro = useMemo(
    () => (fila ? (p: PosicaoPonteiro | null) => fila.enviar(p ? { tipo: 'ponteiro', ...p, cursor: meuCursor(eu ?? '') } : { tipo: 'ponteiro', saiu: true }) : null),
    [fila, eu],
  );
  useMeuPonteiro(enviarPonteiro);

  const apagarDeVez = (r: Resumo) =>
    armazenamento.apagar(r.id).then(
      () => void carregar(),
      () => avisar('Não consegui tirar esse roteiro da fila.'),
    );
  const tirar = (r: Resumo) => {
    if (saindo) {
      clearTimeout(prazoSaida.current);
      void apagarDeVez(saindo);
    }
    setSaindo(r);
    prazoSaida.current = setTimeout(() => {
      setSaindo(null);
      void apagarDeVez(r);
    }, 6000);
  };
  // quem volta com "desfazer" não repete a animação de chegada
  const [devolvidos, setDevolvidos] = useState<string[]>([]);
  const desfazer = () => {
    clearTimeout(prazoSaida.current);
    if (saindo) setDevolvidos((d) => [...d, saindo.id]);
    setSaindo(null);
  };
  // saiu da tela com um "tirar" pendente: apaga de vez
  const saindoRef = useRef(saindo);
  saindoRef.current = saindo;
  useEffect(
    () => () => {
      clearTimeout(prazoSaida.current);
      if (saindoRef.current) void armazenamento.apagar(saindoRef.current.id).catch(() => {});
    },
    [],
  );

  /** Versão nova de uma claquete que já estava na fila: fica a nova, com os tipos de arte da anterior. */
  const substituir = async (nova: Resumo) => {
    try {
      const [rn, ra] = await Promise.all([armazenamento.ler(nova.id), nova.meta.substitui ? armazenamento.ler(nova.meta.substitui) : undefined]);
      if (!rn) return;
      if (!ra) {
        await armazenamento.salvar({ ...rn, meta: { ...rn.meta, substitui: undefined } });
        return void carregar();
      }
      const { doc, herdadas } = herdarTipos(rn.doc, ra.doc);
      const atualizado: Roteiro = { ...rn, doc, meta: { ...rn.meta, substitui: undefined, editor: rn.meta.editor || ra.meta.editor } };
      atualizado.meta.revisar = pendencias(exportar(atualizado));
      await armazenamento.salvar(atualizado, 'substituiu a versão anterior');
      await armazenamento.apagar(ra.id);
      avisar(herdadas ? `Versão anterior substituída. ${plural(herdadas, 'tipo de arte foi mantido', 'tipos de arte foram mantidos')}.` : 'Versão anterior substituída.');
      void carregar();
    } catch {
      avisar('Não consegui substituir a versão anterior.');
    }
  };
  const manterAsDuas = async (nova: Resumo) => {
    const rn = await armazenamento.ler(nova.id).catch(() => undefined);
    if (rn) await armazenamento.salvar({ ...rn, meta: { ...rn.meta, substitui: undefined } }).catch(() => {});
    void carregar();
  };

  /** Lista de artes de todos os roteiros de um dia, para planejar a produção. */
  const copiarArtesDoDia = async (g: GrupoDia) => {
    try {
      const completos = (await Promise.all(g.itens.map((r) => armazenamento.ler(r.id)))).filter((r): r is Roteiro => !!r);
      const blocos = completos
        .map((r) => exportar(r))
        .filter((x) => x.artes.length)
        .map((x) => {
          const cab = [x.roteiro.claquete || x.roteiro.titulo, [x.roteiro.programa, x.roteiro.praca].filter(Boolean).join(' · ')].filter(Boolean).join('  —  ');
          return [cab, ...x.artes.map((a) => `${a.ordem}\t${a.subtipo ? a.subtipoNome : 'sem tipo'}\t${a.texto}${a.observacao ? `\t(${a.observacao})` : ''}`)].join('\n');
        });
      if (!blocos.length) return avisar('Nenhuma arte nos roteiros desse dia.');
      const total = completos.reduce((n, r) => n + exportar(r).artes.length, 0);
      await copiarTexto([`ARTES · ${g.titulo.toUpperCase()}${g.chave !== 'sem-data' ? ` (${g.subtitulo})` : ''}`, '', blocos.join('\n\n')].join('\n'));
      avisar(`${plural(total, 'arte copiada', 'artes copiadas')}, de ${plural(blocos.length, 'roteiro', 'roteiros')}. É só colar.`);
    } catch {
      avisar('Não consegui copiar as artes do dia.');
    }
  };

  const termo = semAcento(busca.trim());
  const aberto = (roteiros ?? []).some((r) => r.aberto);
  const todos = (roteiros ?? []).filter((r) => r.id !== saindo?.id);
  const paraRevisar = todos.filter((r) => r.meta.revisar?.length).length;
  const visiveis = todos
    .filter((r) => !termo || semAcento([r.meta.claquete, r.meta.programa, r.meta.redator, r.meta.editor, r.meta.titulo].join(' ')).includes(termo))
    .filter((r) => !filtroEstado || (filtroEstado === 'revisar' ? !!r.meta.revisar?.length : !r.meta.revisar?.length));
  const { proximos, exibidos } = agruparPorDia(visiveis);
  const porId = new Map(todos.map((r) => [r.id, r]));
  const vazio = roteiros !== null && !todos.length && !falhas.length && !lendo && !saindo;
  let ordem = 0;

  const ficha = (r: Resumo) => {
    const anterior = r.meta.substitui ? porId.get(r.meta.substitui) : undefined;
    return (
      <Ficha
        key={r.id}
        r={r}
        nova={(novos.includes(r.id) || deOutros.includes(r.id)) && !devolvidos.includes(r.id)}
        agora={noRoteiro[r.id] ?? []}
        eu={eu}
        ordem={ordem++}
        abrir={() => abrir(r.id)}
        versao={anterior ? { anterior, substituir: () => substituir(r), manter: () => manterAsDuas(r) } : undefined}
        acoes={
          (r.meu || aberto) && (
            <button className="botao-icone ficha-lixo" title="Tirar da fila" aria-label={`Tirar ${r.meta.claquete || r.meta.titulo} da fila`} onClick={() => tirar(r)}>
              <Icone nome="lixo" />
            </button>
          )
        }
      />
    );
  };
  const cabecalhoDoDia = (g: GrupoDia) => (
    <div className="dia-topo">
      <h3>
        {g.titulo}
        <span>{g.subtitulo}</span>
      </h3>
      <span className="dia-conta">{plural(g.itens.length, 'roteiro', 'roteiros')}</span>
      <button className="botao-texto" onClick={() => copiarArtesDoDia(g)} title="Copia a lista de artes de todos os roteiros deste dia">
        <Icone nome="copiar" tam={14} /> Copiar artes do dia
      </button>
    </div>
  );
  const filtro = (id: 'prontos' | 'revisar', conteudo: React.ReactNode) => (
    <button className="conta-filtro" aria-pressed={filtroEstado === id} onClick={() => setFiltroEstado((f) => (f === id ? null : id))} title={filtroEstado === id ? 'Mostrar todos' : 'Mostrar só estes'}>
      {conteudo}
    </button>
  );
  const colar = (
    <form
      className="colar-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!claqueteNova.trim()) return;
        criar(claqueteNova.trim());
        setColando(false);
        setClaqueteNova('');
      }}
    >
      <label>
        <span className="rotulo">Claquete do roteiro</span>
        <input autoFocus value={claqueteNova} onChange={(e) => setClaqueteNova(e.target.value)} placeholder="Quem Ama(Prologo)26/10 Rede" aria-label="Claquete do roteiro" />
      </label>
      <small className="suave">É pela claquete que vêm o editor, a praça e a data. Depois é só colar o texto do Word na folha.</small>
      <div className="colar-acoes">
        <button type="button" className="botao-texto" onClick={() => setColando(false)}>Cancelar</button>
        <button className="botao primario" disabled={!claqueteNova.trim()}>Abrir a folha</button>
      </div>
    </form>
  );

  return (
    <div className="pagina">
      <main className="biblioteca fila" data-ancora="pagina">
        <header className="bib-topo">
          <h1 className="bib-marca"><Marca /></h1>
          <span className="espaco" />
          {colegas.length > 0 && (
            <div className="na-fila" title={`Também com a fila aberta: ${colegas.map((c) => c.nome).join(', ')}`}>
              {colegas.slice(0, 5).map((c) => (
                <span key={c.email} className="presente" style={{ background: corDe(c.email) }}>{iniciais(c.nome)}</span>
              ))}
              {colegas.length > 5 && <span className="presente mais">+{colegas.length - 5}</span>}
              <span className="na-fila-texto">{colegas.length === 1 ? `${colegas[0].nome.split(/\s+/)[0]} também está aqui` : `mais ${colegas.length} aqui`}</span>
            </div>
          )}
          <Perfil identidade={identidade} definirPerfil={definirPerfil} />
        </header>

        {EXEMPLOS.length > 0 && (
          <section className="exemplos">
            <span className="rotulo">Exemplos</span>
            {EXEMPLOS.map(([nome, arquivo]) => (
              <button
                key={arquivo}
                className="opcao"
                onClick={async () => {
                  try {
                    const resposta = await fetch('./exemplos.json');
                    if (!resposta.ok) throw new Error();
                    const b64 = ((await resposta.json()) as Record<string, string>)[arquivo];
                    abrirArquivo(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], arquivo));
                  } catch {
                    avisar('Não consegui abrir o exemplo.');
                  }
                }}
              >
                {nome}
              </button>
            ))}
          </section>
        )}

        {vazio ? (
          <section className="fila-vazia">
            <span className="fila-vazia-icone"><Icone nome="importar" tam={26} /></span>
            <h2 className="titulo-serifa">Arraste os roteiros para cá</h2>
            <p className="suave">Quantos quiser de uma vez: .docx, .rtf ou .pdf. Cada um vira uma ficha na fila.</p>
            {colando ? colar : <button className="botao-texto" onClick={() => setColando(true)}>ou cole o texto copiado do Word</button>}
          </section>
        ) : (
          roteiros && (
            <section className="lista">
              <div className="fila-topo">
                <div>
                  <h2 className="titulo-serifa">
                    {todos.length || !lendo ? (
                      <><em>{todos.length}</em> {todos.length === 1 ? 'roteiro na fila' : 'roteiros na fila'}</>
                    ) : (
                      <>Lendo <em>1</em> roteiro</>
                    )}
                  </h2>
                  <p className="fila-conta">
                    {filtro('prontos', <><i className="ponto ok" />{plural(todos.length - paraRevisar, 'pronto', 'prontos')}</>)}
                    {paraRevisar > 0 && filtro('revisar', <><i className="ponto revisar" />{paraRevisar} para revisar</>)}
                    {falhas.length > 0 && <span><i className="ponto erro" />{plural(falhas.length, 'não lido', 'não lidos')}</span>}
                    {lendo && <span><i className="ponto lendo" />lendo 1</span>}
                  </p>
                </div>
                {todos.length > 6 && (
                  <label className="busca">
                    <Icone nome="lupa" tam={15} traco={2} />
                    <input type="search" placeholder="Buscar por atração, claquete ou redator" aria-label="Buscar roteiros" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  </label>
                )}
              </div>

              {(lendo || falhas.length > 0) && (
                <ul className="fichas">
                  {lendo && (
                    <li className="ficha lendo" aria-live="polite">
                      <span className="ficha-marca lendo" aria-hidden="true" />
                      <span className="ficha-claquete">
                        <b>{lendo.nome.replace(/\.[^.]+$/, '')}</b>
                        <span>{lendo.detalhe}</span>
                      </span>
                    </li>
                  )}
                  {falhas.map((f) => (
                    <li key={f.nome} className="ficha erro montada" data-ancora={`falha:${f.nome}`}>
                      <span className="ficha-marca erro" aria-hidden="true"><Icone nome="fechar" tam={11} traco={3} /></span>
                      <span className="ficha-claquete"><b>{f.nome.replace(/\.[^.]+$/, '')}</b><span>Não consegui ler este arquivo</span></span>
                      <span className="ficha-acoes"><button className="botao" onClick={() => tirarFalha(f.nome)}>Tirar da fila</button></span>
                      <span className="ficha-pendencias"><span className="pendencia erro">{f.motivo}</span></span>
                    </li>
                  ))}
                </ul>
              )}

              {proximos.map((g) => (
                <section key={g.chave} className="dia" aria-label={`${g.titulo}, ${g.subtitulo}`}>
                  {cabecalhoDoDia(g)}
                  <ul className="fichas">{g.itens.map(ficha)}</ul>
                </section>
              ))}

              {exibidos.length > 0 && (
                <details className="exibidos">
                  <summary>
                    Já foram ao ar <span>{plural(exibidos.reduce((n, g) => n + g.itens.length, 0), 'roteiro', 'roteiros')}</span>
                  </summary>
                  {exibidos.map((g) => (
                    <section key={g.chave} className="dia" aria-label={`${g.titulo}, ${g.subtitulo}`}>
                      {cabecalhoDoDia(g)}
                      <ul className="fichas">{g.itens.map(ficha)}</ul>
                    </section>
                  ))}
                </details>
              )}

              {!visiveis.length && (termo || filtroEstado) && (
                <p className="suave vazio">
                  {termo ? `Nada encontrado para “${busca}”.` : filtroEstado === 'revisar' ? 'Nada para revisar.' : 'Nenhum roteiro pronto ainda.'}
                </p>
              )}
              {colando ? colar : (
                <p className="fila-rodape">Arraste mais roteiros para qualquer ponto da tela. <button className="botao-texto" onClick={() => setColando(true)}>Colar do Word</button></p>
              )}
            </section>
          )
        )}
      </main>
      {saindo && (
        <div className="desfazer" role="status">
          <span><b>{saindo.meta.claquete || saindo.meta.titulo || 'Roteiro'}</b> saiu da fila.</span>
          <button className="botao-texto" onClick={desfazer}>Desfazer</button>
        </div>
      )}
      <Ponteiros lista={Object.values(ponteiros)} />
    </div>
  );
}
