import { useMemo, useRef, useState } from 'react';
import { conferir, emLote } from '../../servidor/importacao-do-acervo.mjs';
import {
  gravarImportacao,
  type Escolha,
  type Escolhas,
  type EstadoDaImportacao,
  type LinhaDaImportacao,
  type MudancaDaImportacao,
  type PerguntaDaImportacao,
  type PreviaDaImportacao,
  type ResultadoDaImportacao,
} from '../dados/armazenamento';
import { Icone } from './icones';
import { chaveDeBusca, plural } from './util';

/* A importação do acervo por CSV (ADR 0005), na ficha da atração: a área "Importar CSV" (o botão ou o arquivo solto),
   a conferência antes de gravar (o placar, os filtros por estado, a busca, o ✕ que tira e devolve uma linha, as
   perguntas na linha, o nome e o tipo editáveis e as decisões em lote) e o resultado (o total antes → depois). Só administradores, só acervo próprio; no celular, só a nota. */

/** A área da ficha que recebe o CSV: o botão ou o arquivo solto em cima. Quem não é administrador vê o botão travado. */
export function AreaDeImportar({ pode, lendo, falha, abrir }: { pode: boolean; lendo: boolean; falha: string; abrir: (arquivo: File) => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  const soltar = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // o soltar da janela (roteiros para a fila) não leva o CSV
    setSobre(false);
    const arquivo = e.dataTransfer.files[0];
    if (arquivo && pode && !lendo) abrir(arquivo);
  };
  return (
    <div
      className={`area-importar ${sobre ? 'sobre' : ''} ${pode ? '' : 'travada'}`}
      data-soltar-aqui=""
      onDragOver={(e) => {
        e.preventDefault();
        if (pode) setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={soltar}
    >
      <button type="button" className="botao primario" disabled={!pode || lendo} onClick={() => entrada.current?.click()} title={pode ? undefined : 'Só administradores importam o acervo.'}>
        <Icone nome={pode ? 'importar' : 'cadeado'} tam={15} />
        {lendo ? 'Lendo o CSV…' : 'Importar CSV'}
      </button>
      {pode ? (
        <p>
          ou solte aqui o CSV da pasta de output
          <small>(nome;caminho;criado em). Nada entra antes da conferência.</small>
        </p>
      ) : (
        <p className="so-admin">só administradores</p>
      )}
      <input
        ref={entrada}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = '';
          if (arquivo) abrir(arquivo);
        }}
      />
      {falha && <p className="cad-falha">{falha}</p>}
    </div>
  );
}

/** A nota da ficha no celular: importar é no computador. */
export function ImportarNoComputador() {
  return (
    <p className="importar-no-computador">
      <Icone nome="arquivo" tam={16} />
      <span>
        <b>Importar CSV é no computador.</b> A conferência pede a tabela larga e o arquivo da pasta de output, que não está no celular.
      </span>
    </p>
  );
}


/** O rótulo de cada estado na linha e nos filtros. */
const ROTULO: Record<EstadoDaImportacao, string> = { decidir: 'decidir', nova: 'nova', completa: 'ganha o tipo', corrige: 'corrige o acervo', ja: 'já no acervo', copia: 'cópia', fora: 'fora' };
type Filtro = 'todas' | 'decidir' | 'nova' | 'completa' | 'ja' | 'copia' | 'fora';
const FILTROS: [Filtro, string][] = [
  ['todas', 'Todas'],
  ['decidir', 'Para decidir'],
  ['nova', 'Novas'],
  ['completa', 'Completam o acervo'],
  ['ja', 'Já no acervo'],
  ['copia', 'Versões e cópias'],
  ['fora', 'Fora'],
];
/** O filtro da linha: a que corrige o nome no acervo também completa o acervo. */
const filtroDe = (e: EstadoDaImportacao): Filtro => (e === 'corrige' ? 'completa' : e);
/** Quantas linhas a tabela mostra de uma vez: o resto aparece pelo filtro ou pela busca. */
const MAXIMO = 400;
/** A linha que a pessoa pode tirar: a que grava e a que ainda pergunta. */
const podeTirar = (e: EstadoDaImportacao) => e === 'nova' || e === 'completa' || e === 'corrige' || e === 'decidir';

/** O que as regras de conversão mudaram do nome para a arte: "antes → depois · regra", uma depois da outra. */
function RegrasDaLinha({ mudancas }: { mudancas: MudancaDaImportacao[] }) {
  return (
    <span className="regras">
      {mudancas.map((m, i) => (
        <span key={i} className="regra">
          {m.depois ? (
            <>
              {m.antes} → <i>{m.depois}</i>
            </>
          ) : (
            <>
              <i>{m.antes}</i> sai
            </>
          )}{' '}
          · {m.regra}
        </span>
      ))}
    </span>
  );
}

/** O nome da arte, editável na linha: vale ao sair do campo ou com Enter; Esc desiste. */
function CampoDaArte({ n, valor, travado, mudar }: { n: number; valor: string; travado: boolean; mudar: (arte: string) => void }) {
  const [texto, setTexto] = useState<string | null>(null); // null: sem edição em curso
  const desistiu = useRef(false);
  const confirmar = () => {
    const novo = (texto ?? '').trim().toLocaleUpperCase('pt-BR');
    setTexto(null);
    if (desistiu.current) return void (desistiu.current = false);
    if (novo && novo !== valor) mudar(novo);
  };
  return (
    <input
      className="arte"
      value={texto ?? valor}
      disabled={travado}
      aria-label={`Arte da linha ${n}`}
      spellCheck={false}
      onFocus={() => setTexto(valor)}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') (desistiu.current = true), e.currentTarget.blur();
      }}
    />
  );
}

/** A resposta já dada, em palavras: a opção, o tipo escolhido na linha ou o nome editado. */
function respondida(q: PerguntaDaImportacao) {
  const opcao = q.opcoes.find((o) => o.valor === q.resposta);
  if (opcao) return opcao.rotulo;
  return q.resposta === 'à mão' ? 'o nome editado na linha' : `tipo ${q.resposta}`;
}

/** As perguntas da linha: as abertas com as opções; as respondidas com "Decidido: … mudar". */
function PerguntasDaLinha({ linha, desligado, responder, mudar }: { linha: LinhaDaImportacao; desligado: boolean; responder: (q: PerguntaDaImportacao, valor: string) => void; mudar: (q: PerguntaDaImportacao) => void }) {
  return (
    <div className="conf-perguntas">
      {linha.perguntas.map((q) =>
        q.resposta ? (
          <span key={q.tipo} className="resolvida">
            Decidido: <b>{respondida(q)}</b>{' '}
            <button type="button" className="botao-texto" disabled={desligado} onClick={() => mudar(q)}>
              mudar
            </button>
          </span>
        ) : (
          <span key={q.tipo} className="conf-pergunta">
            <span className="q">{q.texto}</span>
            <span className="cats">
              {q.opcoes.map((o) => (
                <button key={o.valor} type="button" disabled={desligado} onClick={() => responder(q, o.valor)}>
                  {o.rotulo}
                </button>
              ))}
            </span>
            {q.tipo === 'sigla' && <span className="dica-tipo">ou escolha o tipo na linha</span>}
          </span>
        ),
      )}
    </div>
  );
}

/** A conferência antes de gravar: o placar, os filtros, a busca, o lote, as linhas (com as perguntas, o nome e o tipo
    editáveis) e o pé com o Gravar, que só libera sem decisão pendente. */
export function ConferenciaDaImportacao({ previa, cancelar, gravado }: { previa: PreviaDaImportacao; cancelar: () => void; gravado: (r: ResultadoDaImportacao) => void }) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');
  const [escolhas, setEscolhas] = useState<Escolhas>({});
  const [marcadas, setMarcadas] = useState<Set<number>>(() => new Set());
  const [gravando, setGravando] = useState(false);
  const [falha, setFalha] = useState('');

  // a mesma conta do servidor, a cada escolha: o estado de cada linha recalculado pela chave
  const conf = useMemo(() => conferir({ linhas: previa.linhas, acervo: previa.acervo, tipos: previa.tipos, escolhas }), [previa, escolhas]);
  // as que perguntavam na prévia vêm primeiro, e ficam no lugar depois de decididas
  const perguntavam = useMemo(() => new Set(previa.linhas.filter((l) => l.estado === 'decidir').map((l) => l.n)), [previa]);
  const conta = conf.placar;
  const termo = chaveDeBusca(busca);
  const visiveis = conf.linhas
    .filter((l) => (filtro === 'todas' || filtroDe(l.estado) === filtro) && (!termo || chaveDeBusca(`${l.nome} ${l.arte}`).includes(termo)))
    .sort((a, b) => Number(perguntavam.has(b.n)) - Number(perguntavam.has(a.n)) || a.n - b.n);
  const { criar, tipar, renomear } = conf.plano;
  const aGravar = criar.length + tipar.length + renomear.length;
  const outras = conf.linhas.length - aGravar;
  const faltam = conf.faltam;

  const escolher = (n: number, mudar: (e: Escolha) => Escolha) => setEscolhas((es) => ({ ...es, [n]: mudar(es[n] ?? {}) }));
  const responder = (n: number) => (q: PerguntaDaImportacao, valor: string) => escolher(n, (e) => ({ ...e, respostas: { ...e.respostas, [q.tipo]: valor } }));
  // mudar a decisão: some a resposta e a edição que respondia
  const desfazer = (n: number) => (q: PerguntaDaImportacao) =>
    escolher(n, ({ respostas = {}, ...e }) => {
      const { [q.tipo]: _, ...resto } = respostas;
      if (q.resposta === 'à mão') delete e.arte;
      else if (!q.opcoes.some((o) => o.valor === q.resposta)) delete e.tipo;
      return { ...e, respostas: resto };
    });
  const emLoteAgora = (acao: Parameters<typeof emLote>[2]) => {
    setEscolhas((es) => emLote(conferir({ linhas: previa.linhas, acervo: previa.acervo, tipos: previa.tipos, escolhas: es }).linhas, es, acao));
    if ('ns' in acao) setMarcadas(new Set());
  };
  const marcar = (n: number) =>
    setMarcadas((m) => {
      const novo = new Set(m);
      if (!novo.delete(n)) novo.add(n);
      return novo;
    });
  const marcaveis = visiveis.slice(0, MAXIMO).filter((l) => !l.origem.fora);
  const todasMarcadas = marcaveis.length > 0 && marcaveis.every((l) => marcadas.has(l.n));

  // o que o lote resolve de uma vez: os acentos sugeridos e cada sigla que não é tipo
  const abertas = (tipo: string) => conf.linhas.filter((l) => l.perguntas.some((q) => q.tipo === tipo && !q.resposta) && !escolhas[l.n]?.tirada);
  const acentos = abertas('acento').length;
  const siglas = [...abertas('sigla').reduce((m, l) => {
    const s = l.perguntas.find((q) => q.tipo === 'sigla')!.sigla!;
    return m.set(s, (m.get(s) ?? 0) + 1);
  }, new Map<string, number>())];

  const gravar = async () => {
    setGravando(true);
    setFalha('');
    try {
      gravado(await gravarImportacao(previa, escolhas));
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não consegui gravar no acervo.');
      setGravando(false);
    }
  };

  return (
    <section className="conferencia" aria-label={`Conferir a importação em ${previa.atracao}`}>
      <div className="conf-topo">
        <div>
          <h2>
            Conferir antes de gravar no acervo de <em>{previa.atracao}</em>
          </h2>
          <span className="conf-arquivo">
            <Icone nome="arquivo" tam={14} />
            {previa.arquivo || 'CSV'} · {plural(conf.linhas.length, 'linha', 'linhas')}
          </span>
        </div>
        <button type="button" className="botao" onClick={cancelar} disabled={gravando}>
          Cancelar
        </button>
        <p className="conf-placar">
          <b>{conta.nova}</b> {conta.nova === 1 ? 'nova' : 'novas'}
          {' '}<i>·</i>{' '}
          <b>{conta.completa + conta.corrige}</b> {conta.completa + conta.corrige === 1 ? 'completa' : 'completam'} o acervo
          {' '}<i>·</i>{' '}
          <b>{conta.ja}</b> já no acervo
          {' '}<i>·</i>{' '}
          <b>{conta.copia + conta.fora}</b> {conta.copia + conta.fora === 1 ? 'fica' : 'ficam'} de fora
          {perguntavam.size > 0 && (
            <>
              {' '}<i>·</i>{' '}
              <b className="dec">{conta.decidir}</b> para decidir
            </>
          )}
        </p>
      </div>
      <div className="conf-filtros" role="toolbar" aria-label="Filtrar por estado">
        {FILTROS.filter(([v]) => v !== 'decidir' || perguntavam.size > 0).map(([v, rotulo]) => (
          <button key={v} type="button" aria-pressed={filtro === v} className={v === 'decidir' && conta.decidir ? 'dec' : ''} onClick={() => setFiltro(v)}>
            {rotulo} <b>{v === 'todas' ? conf.linhas.length : v === 'completa' ? conta.completa + conta.corrige : conta[v]}</b>
          </button>
        ))}
        <input className="conf-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no arquivo ou na arte" aria-label="Buscar no arquivo ou na arte" />
      </div>
      {(acentos > 0 || siglas.length > 0 || marcadas.size > 0 || faltam > 0) && (
        <div className="conf-lote" role="toolbar" aria-label="Decidir em lote">
          <span className="rot">Em lote</span>
          {acentos > 0 && (
            <button type="button" className="pilula" disabled={gravando} onClick={() => emLoteAgora({ acentos: true })}>
              Aceitar {acentos === 1 ? 'o acento sugerido' : `os ${acentos} acentos sugeridos`}
            </button>
          )}
          {siglas.map(([sigla, n]) => (
            <button key={sigla} type="button" className="pilula" disabled={gravando} onClick={() => emLoteAgora({ siglaFora: sigla })}>
              {n === 1 ? `A com ${sigla} fica fora` : `As ${n} com ${sigla} ficam fora`}
            </button>
          ))}
          {marcadas.size > 0 ? (
            <>
              <span>
                <b>{marcadas.size}</b> {marcadas.size === 1 ? 'marcada' : 'marcadas'}:
              </span>
              <select aria-label="Dar o tipo às marcadas" value="" disabled={gravando} onChange={(e) => e.target.value && emLoteAgora({ tipo: e.target.value, ns: [...marcadas] })}>
                <option value="">dar o tipo…</option>
                {previa.tipos.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <button type="button" className="pilula" disabled={gravando} onClick={() => emLoteAgora({ tirar: true, ns: [...marcadas] })}>
                não importar
              </button>
              <button type="button" className="botao-texto" onClick={() => setMarcadas(new Set())}>
                desmarcar
              </button>
            </>
          ) : (
            <span>ou marque linhas para dar o tipo e tirar várias de uma vez</span>
          )}
        </div>
      )}
      <div className="conf-cab">
        <input
          type="checkbox"
          className="marcar"
          aria-label="Marcar as linhas visíveis"
          checked={todasMarcadas}
          disabled={!marcaveis.length || gravando}
          onChange={() => setMarcadas(todasMarcadas ? new Set() : new Set([...marcadas, ...marcaveis.map((l) => l.n)]))}
        />
        <span aria-hidden="true">No arquivo</span>
        <span />
        <span aria-hidden="true">Arte (como o roteiro escreve)</span>
        <span aria-hidden="true">Tipo</span>
        <span aria-hidden="true">Estado</span>
        <span />
      </div>
      {visiveis.slice(0, MAXIMO).map((l) => {
        const e = l.estado;
        const fixa = !!l.origem.fora;
        const tirada = !!escolhas[l.n]?.tirada;
        const opcoes = l.tipo && !previa.tipos.includes(l.tipo) ? [...previa.tipos, l.tipo] : previa.tipos;
        return (
          <div key={l.n} className={`conf-linha e-${e} ${marcadas.has(l.n) ? 'marcada' : ''}`} data-n={l.n}>
            <input type="checkbox" className="marcar" checked={marcadas.has(l.n)} disabled={fixa || gravando} onChange={() => marcar(l.n)} aria-label={`Marcar a linha ${l.n}`} />
            <span className="arq" title={l.caminho}>
              <span className="n">{l.n}</span>
              {l.nome}
            </span>
            <span className="seta">→</span>
            <span className="arte-col">
              {fixa ? <span className="arte">—</span> : <CampoDaArte key={l.arte} n={l.n} valor={l.arte} travado={gravando || tirada} mudar={(arte) => escolher(l.n, (x) => ({ ...x, arte }))} />}
              {l.mudancas.length > 0 && <RegrasDaLinha mudancas={l.mudancas} />}
            </span>
            <span className="tipo">
              {!fixa && (
                <select className={l.tipo ? '' : 'vazio'} value={l.tipo} disabled={gravando || tirada} aria-label={`Tipo da linha ${l.n}`} onChange={(ev) => escolher(l.n, (x) => ({ ...x, tipo: ev.target.value }))}>
                  {!l.tipo && <option value="">sem tipo</option>}
                  {opcoes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              )}
            </span>
            <span className="est">
              <span className={`etq ${e}`}>{e === 'copia' && l.versao ? 'versão' : ROTULO[e]}</span>
              {l.motivo && !(e === 'decidir' && l.perguntas.some((q) => !q.resposta)) && <span className="mot">{l.motivo}</span>}
            </span>
            {tirada || podeTirar(e) ? (
              <button type="button" className={`tirar ${tirada ? 'volta' : ''}`} onClick={() => escolher(l.n, (x) => ({ ...x, tirada: !tirada }))} disabled={gravando} title={tirada ? 'Voltar a importar' : 'Não importar'} aria-label={`${tirada ? 'Voltar a importar' : 'Não importar'} a linha ${l.n}`}>
                <Icone nome={tirada ? 'desfazer' : 'fechar'} tam={14} />
              </button>
            ) : (
              <span />
            )}
            {l.perguntas.length > 0 && !tirada && <PerguntasDaLinha linha={l} desligado={gravando} responder={responder(l.n)} mudar={desfazer(l.n)} />}
          </div>
        );
      })}
      {!visiveis.length && <p className="conf-mais">{termo ? `Nada com “${busca.trim()}”.` : 'Nada neste filtro.'}</p>}
      {visiveis.length > MAXIMO && <p className="conf-mais">E mais {visiveis.length - MAXIMO}: filtre ou busque para achar.</p>}
      <div className="conf-pe">
        {faltam > 0 && <span className="falta">{faltam === 1 ? 'Falta 1 decisão' : `Faltam ${faltam} decisões`}</span>}
        <span className="efeito">
          Cria {criar.length} no acervo{tipar.length ? `, dá o tipo a ${tipar.length}` : ''}
          {renomear.length ? `, renomeia ${renomear.length} (o nome errado no acervo, na mesma linha)` : ''}. {outras === 1 ? 'A outra linha não muda' : `As ${outras} outras não mudam`} nada.
        </span>
        {falha && <span className="cad-falha">{falha}</span>}
        <button type="button" className="botao primario" disabled={gravando || faltam > 0 || !aGravar} onClick={() => void gravar()} title={faltam > 0 ? 'Decida as linhas que faltam para gravar.' : undefined}>
          {gravando ? 'Gravando…' : faltam > 0 ? 'Gravar' : aGravar ? `Gravar ${aGravar} no acervo` : 'Nada a gravar'}
        </button>
      </div>
    </section>
  );
}

/** Depois de gravar: o total do acervo antes → depois e o resumo. */
export function ResultadoDaImportacaoNaTela({ previa, resultado, verFicha, verAcervo }: { previa: PreviaDaImportacao; resultado: ResultadoDaImportacao; verFicha: () => void; verAcervo: () => void }) {
  return (
    <section className="resultado-importacao" aria-label="Importação gravada">
      <span className="conf-arquivo">
        <Icone nome="arquivo" tam={14} />
        {previa.arquivo || 'CSV'} · gravado agora por você
      </span>
      <div className="grande">
        <span className="de">{resultado.antes}</span>
        <span className="seta">→</span>
        <span className="ate">{resultado.depois}</span>
      </div>
      <p className="det">
        artes no acervo de {previa.atracao}
        <br />
        <b>+{resultado.novas}</b> {resultado.novas === 1 ? 'nova' : 'novas'} · <b>{resultado.ganharamTipo}</b> {resultado.ganharamTipo === 1 ? 'ganhou' : 'ganharam'} o tipo
        {resultado.renomeadas.length > 0 && (
          <>
            {' '}· <b>{resultado.renomeadas.length}</b> {resultado.renomeadas.length === 1 ? 'nome corrigido' : 'nomes corrigidos'}
          </>
        )}{' '}
        · {plural(resultado.semMudanca, 'linha', 'linhas')} sem mudança
      </p>
      <div className="acoes">
        <button type="button" className="botao" onClick={verFicha}>
          Ver a ficha
        </button>
        <button type="button" className="botao primario" onClick={verAcervo}>
          Ver o acervo
        </button>
      </div>
    </section>
  );
}
