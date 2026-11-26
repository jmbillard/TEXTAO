import { useMemo, useRef, useState } from 'react';
import { gravarImportacao, type EstadoDaImportacao, type LinhaDaImportacao, type MudancaDaImportacao, type PreviaDaImportacao, type ResultadoDaImportacao } from '../dados/armazenamento';
import { Icone } from './icones';
import { chaveDeBusca, plural } from './util';

/* A importação do acervo por CSV (ADR 0005), na ficha da atração: a área "Importar CSV" (o botão ou o arquivo solto),
   a conferência antes de gravar (o placar, os filtros por estado, a busca e o ✕ que tira e devolve uma linha) e o
   resultado (o total antes → depois). Só administradores, só acervo próprio; no celular, só a nota. */

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
const ROTULO: Record<EstadoDaImportacao, string> = { decidir: 'decidir', nova: 'nova', completa: 'ganha o tipo', ja: 'já no acervo', copia: 'cópia', fora: 'fora' };
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
/** Quantas linhas a tabela mostra de uma vez: o resto aparece pelo filtro ou pela busca. */
const MAXIMO = 400;
/** O que a linha faz no acervo ao gravar: só a nova e a que completa o acervo gravam; essas a pessoa pode tirar. */
const grava = (e: EstadoDaImportacao) => e === 'nova' || e === 'completa';

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

/** A conferência antes de gravar: o placar, os filtros, a busca, as linhas e o pé com o Gravar. */
export function ConferenciaDaImportacao({ previa, cancelar, gravado }: { previa: PreviaDaImportacao; cancelar: () => void; gravado: (r: ResultadoDaImportacao) => void }) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');
  const [tiradas, setTiradas] = useState<Set<number>>(() => new Set());
  const [gravando, setGravando] = useState(false);
  const [falha, setFalha] = useState('');

  // a linha tirada vale como "fora" no placar e nos filtros
  const efetivo = (l: LinhaDaImportacao): EstadoDaImportacao => (tiradas.has(l.n) ? 'fora' : l.estado);
  const conta = useMemo(() => {
    const c: Record<EstadoDaImportacao, number> = { nova: 0, completa: 0, ja: 0, copia: 0, fora: 0, decidir: 0 };
    for (const l of previa.linhas) c[tiradas.has(l.n) ? 'fora' : l.estado]++;
    return c;
  }, [previa, tiradas]);
  const termo = chaveDeBusca(busca);
  // as "para decidir" primeiro, depois a ordem do arquivo
  const visiveis = previa.linhas
    .filter((l) => (filtro === 'todas' || efetivo(l) === filtro) && (!termo || chaveDeBusca(`${l.nome} ${l.arte}`).includes(termo)))
    .sort((a, b) => Number(b.estado === 'decidir') - Number(a.estado === 'decidir') || a.n - b.n);
  const aGravar = previa.linhas.filter((l) => grava(efetivo(l)));
  const faltam = conta.decidir;
  const outras = previa.linhas.length - aGravar.length;
  const alternar = (n: number) =>
    setTiradas((t) => {
      const novo = new Set(t);
      if (!novo.delete(n)) novo.add(n);
      return novo;
    });

  const gravar = async () => {
    setGravando(true);
    setFalha('');
    try {
      gravado(await gravarImportacao(previa.atracao, previa.arquivo, aGravar.map(({ arte, tipo }) => ({ arte, tipo }))));
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
            {previa.arquivo || 'CSV'} · {plural(previa.linhas.length, 'linha', 'linhas')}
          </span>
        </div>
        <button type="button" className="botao" onClick={cancelar} disabled={gravando}>
          Cancelar
        </button>
        <p className="conf-placar">
          <b>{conta.nova}</b> {conta.nova === 1 ? 'nova' : 'novas'}
          {' '}<i>·</i>{' '}
          <b>{conta.completa}</b> {conta.completa === 1 ? 'completa' : 'completam'} o acervo
          {' '}<i>·</i>{' '}
          <b>{conta.ja}</b> já no acervo
          {' '}<i>·</i>{' '}
          <b>{conta.copia + conta.fora}</b> {conta.copia + conta.fora === 1 ? 'fica' : 'ficam'} de fora
          {conta.decidir > 0 && (
            <>
              {' '}<i>·</i>{' '}
              <b className="dec">{conta.decidir}</b> para decidir
            </>
          )}
        </p>
      </div>
      <div className="conf-filtros" role="toolbar" aria-label="Filtrar por estado">
        {FILTROS.filter(([v]) => v !== 'decidir' || conta.decidir > 0).map(([v, rotulo]) => (
          <button key={v} type="button" aria-pressed={filtro === v} className={v === 'decidir' ? 'dec' : ''} onClick={() => setFiltro(v)}>
            {rotulo} <b>{v === 'todas' ? previa.linhas.length : conta[v]}</b>
          </button>
        ))}
        <input className="conf-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no arquivo ou na arte" aria-label="Buscar no arquivo ou na arte" />
      </div>
      <div className="conf-cab" aria-hidden="true">
        <span>No arquivo</span>
        <span />
        <span>Arte</span>
        <span>Tipo</span>
        <span>Estado</span>
        <span />
      </div>
      {visiveis.slice(0, MAXIMO).map((l) => {
        const e = efetivo(l);
        const tirada = tiradas.has(l.n);
        return (
          <div key={l.n} className={`conf-linha e-${e}`} data-n={l.n}>
            <span className="arq" title={l.caminho}>
              <span className="n">{l.n}</span>
              {l.nome}
            </span>
            <span className="seta">→</span>
            <span className="arte-col">
              <span className="arte">{l.arte || '—'}</span>
              {l.mudancas.length > 0 && <RegrasDaLinha mudancas={l.mudancas} />}
            </span>
            <span className="tipo">{l.tipo}</span>
            <span className="est">
              <span className={`etq ${e}`}>{e === 'copia' && l.versao ? 'versão' : ROTULO[e]}</span>
              {(tirada ? 'tirada da importação' : l.motivo) && <span className="mot">{tirada ? 'tirada da importação' : l.motivo}</span>}
            </span>
            {grava(l.estado) ? (
              <button type="button" className={`tirar ${tirada ? 'volta' : ''}`} onClick={() => alternar(l.n)} disabled={gravando} title={tirada ? 'Voltar a importar' : 'Não importar'} aria-label={`${tirada ? 'Voltar a importar' : 'Não importar'} a linha ${l.n}`}>
                <Icone nome={tirada ? 'desfazer' : 'fechar'} tam={14} />
              </button>
            ) : (
              <span />
            )}
          </div>
        );
      })}
      {!visiveis.length && <p className="conf-mais">{termo ? `Nada com “${busca.trim()}”.` : 'Nada neste filtro.'}</p>}
      {visiveis.length > MAXIMO && <p className="conf-mais">E mais {visiveis.length - MAXIMO}: filtre ou busque para achar.</p>}
      <div className="conf-pe">
        {faltam > 0 && <span className="falta">Faltam {plural(faltam, 'decisão', 'decisões')}</span>}
        <span className="efeito">
          Cria {conta.nova} no acervo{conta.completa ? `, dá o tipo a ${conta.completa}` : ''}. {outras === 1 ? 'A outra linha não muda' : `As ${outras} outras não mudam`} nada.
        </span>
        {falha && <span className="cad-falha">{falha}</span>}
        <button type="button" className="botao primario" disabled={gravando || faltam > 0 || !aGravar.length} onClick={() => void gravar()}>
          {gravando ? 'Gravando…' : aGravar.length ? `Gravar ${aGravar.length} no acervo` : 'Nada a gravar'}
        </button>
      </div>
    </section>
  );
}

/** Depois de gravar: o total do acervo antes → depois e o resumo. */
export function ResultadoDaImportacaoNaTela({ previa, resultado, verFicha, verAcervo }: { previa: PreviaDaImportacao; resultado: ResultadoDaImportacao; verFicha: () => void; verAcervo: () => void }) {
  const semMudanca = previa.linhas.length - resultado.novas - resultado.ganharamTipo;
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
        <b>+{resultado.novas}</b> {resultado.novas === 1 ? 'nova' : 'novas'} · <b>{resultado.ganharamTipo}</b> {resultado.ganharamTipo === 1 ? 'ganhou' : 'ganharam'} o tipo · {plural(semMudanca, 'linha', 'linhas')} sem mudança
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
