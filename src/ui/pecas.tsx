import { useEffect, useMemo, useRef, useState } from 'react';
import { SUBTIPOS_ARTE, normalizarSubtipo, type Meta, type SubtipoArte } from '../modelo/tipos';
import { PRACAS, editoresConhecidos, programasConhecidos, redatoresConhecidos, semAcento } from '../modelo/vocabularios';
import { dataPorExtenso } from './util';
import { Icone } from './icones';

export /** "???" escritos à mão, cada um meio torto e fora do lugar; sempre do mesmo jeito para o mesmo roteiro. */
function Duvida({ semente, rotulo }: { semente: string; rotulo: string }) {
  let h = 2166136261;
  for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const sorteio = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 1000) / 1000;
  return (
    <span className="duvida" role="img" aria-label={rotulo} title={rotulo}>
      {[0, 1, 2].map((i) => (
        <i key={i} style={{ transform: `translate(${(sorteio() * 1.2 - 0.6).toFixed(1)}px, ${(sorteio() * 2 - 1).toFixed(1)}px) rotate(${(sorteio() * 12 - 6).toFixed(0)}deg)` }}>?</i>
      ))}
    </span>
  );
}

/** Quando tudo já foi ao ar: convites que se revezam, digitados e apagados à máquina. */
/** O quadro tracejado de arrastar: título que se escreve sozinho, formatos riscados à mão e o colar do Word. */
export function ConviteDeArrastar({ frases, extra, className = '' }: { frases: string[]; extra: React.ReactNode; className?: string }) {
  return (
    <section className={`fila-vazia ${className}`}>
      <span className="fila-vazia-icone"><Icone nome="importar" tam={26} /></span>
      <h2 className="titulo-serifa"><TituloQueSeEscreve frases={frases} /></h2>
      <p className="suave">
        <span className="formatos-riscados">
          .docx, .rtf ou .pdf
          <svg viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><path pathLength={1} d="M2 8 C 22 4, 52 5, 97 6 C 70 8, 38 10, 12 11" /></svg>
        </span>
        , quantos quiser de uma vez.
      </p>
      {extra}
    </section>
  );
}

/** Fila vazia de verdade: ainda não chegou nada. */
export const CONVITES_FILA_VAZIA = [
  'Arraste os roteiros para cá',
  'Bora começar?',
  'Fila vazia, por enquanto',
  'Chegou roteiro?',
  'Tem novidade por aí?',
  'Mais textos para a arte?',
  'Pode mandar',
];

export const CONVITES = [
  'Fila em dia!',
  'Tem novidade por aí?',
  'Bora pra próxima leva?',
  'Chegou roteiro novo?',
  'Mais textos para a arte?',
  'Tudo no ar. E agora?',
  'Pode mandar mais',
  'Vamos revisar o que vem aí?',
];

function TituloQueSeEscreve({ frases }: { frases: string[] }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * frases.length));
  const [n, setN] = useState(0);
  const [apagando, setApagando] = useState(false);
  const calmo = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const frase = frases[i % frases.length];
  useEffect(() => {
    if (calmo) {
      const t = setTimeout(() => setI((v) => v + 1), 6000);
      return () => clearTimeout(t);
    }
    let t: ReturnType<typeof setTimeout>;
    // digita; espera; seleciona tudo (o grifo corre pelo texto) e apaga de uma vez; a próxima
    if (!apagando && n < frase.length) t = setTimeout(() => setN(n + 1), 55 + Math.random() * 45);
    else if (!apagando) t = setTimeout(() => setApagando(true), 3200);
    else if (n > 0) t = setTimeout(() => setN(0), 950);
    else
      t = setTimeout(() => {
        setApagando(false);
        setI((v) => v + 1 + Math.floor(Math.random() * (frases.length - 1)));
      }, 300);
    return () => clearTimeout(t);
  }, [n, apagando, frase, calmo, frases.length]);
  return (
    <span className="titulo-maquina" aria-live="off" aria-label={frase}>
      {calmo ? frase : <span className={`texto-maquina ${apagando && n > 0 ? 'selecionado' : ''}`}>{frase.slice(0, n)}</span>}
      {/* durante a seleção o cursor só fica invisível: tirá-lo encurtaria a linha e o texto centralizado pularia */}
      {!calmo && <i className="cursor" aria-hidden="true" style={apagando && n > 0 ? { visibility: 'hidden', animation: 'none' } : undefined} />}
    </span>
  );
}

/** A marca do app. */
export const Marca = () => (
  <span className="logo-app" aria-label="PROMeiro">
    <b>PROM</b>eiro
  </span>
);

/** Uma telinha que mostra onde a arte entra no quadro. Sem tipo, fica tracejada. */
export function Miniatura({ subtipo }: { subtipo: string }) {
  return <span className="mini" data-subtipo={normalizarSubtipo(subtipo) || 'vazio'} aria-hidden="true" />;
}

/** Grade para escolher o tipo da arte. Clicar no tipo já escolhido volta a deixar em branco. */
export function EscolhaDeTipo({ valor, escolher, atalhos }: { valor: SubtipoArte; escolher: (s: SubtipoArte) => void; atalhos?: boolean }) {
  return (
    <div className="escolha-bloco">
      <div className="escolha" role="radiogroup" aria-label="Tipo da arte">
        {SUBTIPOS_ARTE.map((s, k) => (
          <button key={s.id} role="radio" aria-checked={valor === s.id} aria-keyshortcuts={atalhos ? String(k + 1) : undefined} onClick={() => escolher(valor === s.id ? '' : s.id)}>
            <Miniatura subtipo={s.id} />
            <span>{atalhos && <kbd>{k + 1}</kbd>}{s.curto}</span>
          </button>
        ))}
      </div>
      {atalhos && <p className="escolha-dica"><kbd>1</kbd>–<kbd>9</kbd> escolhe · <kbd>↑</kbd><kbd>↓</kbd> troca de arte · <kbd>Esc</kbd> fecha</p>}
    </div>
  );
}

type DadosClaquete = Pick<Meta, 'claquete' | 'redator' | 'editor' | 'dataExibicao'> & Partial<Pick<Meta, 'programa' | 'praca'>>;

/** A claquete da chamada: nome, equipe e exibição. Com `mudar`, os campos são editáveis. */
/** Com `comAtracao`, a claquete também mostra (e edita) a atração e a praça, como na revisão. */
export function Claquete({ dados, mudar, comAtracao = false, cadastrarAtracao }: { dados: DadosClaquete; mudar?: (m: Partial<Meta>) => void; comAtracao?: boolean; cadastrarAtracao?: () => void }) {
  const data = useRef<HTMLInputElement>(null);
  const campo = (rotulo: string, chave: 'claquete' | 'redator' | 'editor', vazio: string, lista?: () => string[]) =>
    mudar && lista ? (
      <EscolhaDeNome rotulo={rotulo} valor={dados[chave] ?? ''} opcoes={lista} mudar={(v) => mudar({ [chave]: v })} semente={(dados.claquete || '') + chave} />
    ) : mudar ? (
      <input
        value={dados[chave] ?? ''}
        placeholder={vazio}
        aria-label={rotulo}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => mudar({ [chave]: e.target.value })}
      />
    ) : (
      <div>{dados[chave]}</div>
    );
  // na conferência do arquivo, o que não foi identificado não aparece
  const mostra = (v: string) => !!mudar || !!v;
  return (
    <section className="claquete" aria-label="Claquete">
      <div className="ripa" aria-hidden="true" />
      <div className="quadro">
        {mostra(dados.claquete) && (
          <label className="campo-c nome">
            <small>Claquete</small>
            {campo('Claquete', 'claquete', 'NOME DA CHAMADA')}
          </label>
        )}
        {(mostra(dados.redator) || mostra(dados.editor)) && (
          <div className="dupla">
            {mostra(dados.redator) && (
              <div className="campo-c">
                <small>Redator</small>
                {campo('Redator', 'redator', 'quem escreveu', redatoresConhecidos)}
              </div>
            )}
            {mostra(dados.editor) && (
              <div className="campo-c">
                <small>Editor</small>
                {campo('Editor', 'editor', 'escolher…', editoresConhecidos)}
              </div>
            )}
          </div>
        )}
        {mostra(dados.dataExibicao) && (
          <div className={`campo-c ${comAtracao ? '' : 'ultimo'}`}>
            <small>Exibição</small>
            {mudar ? (
              <span className="campo-data">
                <button className={dados.dataExibicao ? '' : 'vago'} onClick={() => data.current?.showPicker?.()}>
                  {dataPorExtenso(dados.dataExibicao) || 'escolher a data'}
                </button>
                <input ref={data} type="date" tabIndex={-1} aria-label="Data de exibição" value={dados.dataExibicao} onChange={(e) => mudar({ dataExibicao: e.target.value })} />
              </span>
            ) : (
              <div>{dataPorExtenso(dados.dataExibicao)}</div>
            )}
          </div>
        )}
        {comAtracao && (
          <div className="campo-c ultimo atracao-c">
            <small>Atração</small>
            <span className="linha-atracao">
              {mudar ? (
                <EscolhaDeNome
                  rotulo="Atração"
                  valor={dados.programa ?? ''}
                  opcoes={() => programasConhecidos().map((p) => p.nome)}
                  semente={(dados.claquete || '') + 'atracao'}
                  mudar={(v) => {
                    // a key às vezes engana (DONA serve a mais de uma novela): aqui se corrige à mão
                    const p = programasConhecidos().find((x) => x.nome.toLowerCase() === v.trim().toLowerCase()) ?? null;
                    mudar({ programa: v, ...(p ? { tipoPrograma: p.tipo } : {}) });
                  }}
                />
              ) : (
                <span>{dados.programa}</span>
              )}
              {mudar && cadastrarAtracao && !programasConhecidos().some((p) => p.nome.toLowerCase() === (dados.programa ?? '').trim().toLowerCase()) && (
                <button type="button" className="cadastrar-c" onClick={cadastrarAtracao}>cadastrar</button>
              )}
              <span className="pracas-c" role="radiogroup" aria-label="Praça">
                {PRACAS.map((p) => (
                  <button key={p} role="radio" aria-checked={dados.praca === p} disabled={!mudar} onClick={() => mudar?.({ praca: p })}>{p}</button>
                ))}
              </span>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

/** Um menu de opções curto (sem busca), no visual dos outros menus do app: no lugar do seletor nativo do sistema. */
export function MenuDeOpcoes({ rotulo, valor, opcoes, mudar }: { rotulo: string; valor: string; opcoes: { id: string; nome: string }[]; mudar: (v: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const atual = opcoes.find((o) => o.id === valor) ?? opcoes[0];
  useEffect(() => {
    if (!aberto) return;
    setMarcado(Math.max(0, opcoes.findIndex((o) => o.id === valor)));
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const escolher = (id: string) => {
    mudar(id);
    setAberto(false);
  };
  const teclado = (e: React.KeyboardEvent) => {
    if (!aberto) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') (e.preventDefault(), setAberto(true));
      return;
    }
    if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), setAberto(false));
    else if (e.key === 'ArrowDown') (e.preventDefault(), setMarcado((m) => Math.min(opcoes.length - 1, m + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setMarcado((m) => Math.max(0, m - 1)));
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), escolher(opcoes[marcado].id));
  };
  return (
    <div className="menu-opcoes" ref={caixa} onKeyDown={teclado}>
      <button type="button" className="menu-opcoes-botao" aria-label={rotulo} aria-haspopup="listbox" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <span>{atual?.nome}</span>
        <Icone nome="baixo" tam={13} traco={2} />
      </button>
      {aberto && (
        <ul className="escolha-nome-menu menu-opcoes-lista" role="listbox" aria-label={rotulo}>
          {opcoes.map((o, k) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.id === valor}
              className={k === marcado ? 'marcado' : ''}
              onMouseEnter={() => setMarcado(k)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolher(o.id)}
            >
              {o.nome}
              {o.id === valor && <Icone nome="certo" tam={13} traco={2.2} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Escolher um nome da lista do Teable (redatores, editores), com busca; vazio mostra os ??? à mão.
    Também aceita um nome que não está na lista. */
export function EscolhaDeNome({ rotulo, valor, opcoes, mudar, semente }: { rotulo: string; valor: string; opcoes: () => string[]; mudar: (v: string) => void; semente: string }) {
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState('');
  const [marcado, setMarcado] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const filtradas = useMemo(() => {
    const t = semAcento(busca.trim());
    return opcoes().filter((o) => !t || semAcento(o).includes(t));
  }, [busca, opcoes, aberta]); // eslint-disable-line react-hooks/exhaustive-deps
  const livre = busca.trim() && !filtradas.some((o) => o.toLowerCase() === busca.trim().toLowerCase()) ? busca.trim() : '';
  const itens = livre ? [...filtradas, livre] : filtradas;
  useEffect(() => {
    if (!aberta) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberta(false);
    window.addEventListener('pointerdown', fora, true);
    return () => window.removeEventListener('pointerdown', fora, true);
  }, [aberta]);
  useEffect(() => setMarcado(0), [busca]);
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${marcado}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [marcado]);
  const escolher = (v: string) => {
    mudar(v);
    setAberta(false);
    setBusca('');
  };
  return (
    <div className="escolha-nome" ref={caixa}>
      <button
        type="button"
        className={`escolha-nome-valor ${valor ? '' : 'vago'}`}
        aria-label={`${rotulo}: ${valor || 'não preenchido'}`}
        aria-haspopup="listbox"
        aria-expanded={aberta}
        onClick={() => setAberta((v) => !v)}
      >
        {valor || <Duvida semente={semente} rotulo={`${rotulo} não preenchido`} />}
      </button>
      {aberta && (
        <div className="escolha-nome-menu" role="dialog" aria-label={`Escolher ${rotulo.toLowerCase()}`}>
          <input
            autoFocus
            value={busca}
            placeholder={`Buscar ${rotulo.toLowerCase()}`}
            aria-label={`Buscar ${rotulo.toLowerCase()}`}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado((m) => Math.min(itens.length - 1, m + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado((m) => Math.max(0, m - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); if (itens[marcado]) escolher(itens[marcado]); }
              else if (e.key === 'Escape') { e.preventDefault(); setAberta(false); }
            }}
          />
          <ul role="listbox" ref={lista}>
            {itens.map((o, i) => (
              <li
                key={o + i}
                data-i={i}
                role="option"
                aria-selected={o === valor}
                className={`${i === marcado ? 'marcado' : ''} ${o === livre ? 'livre' : ''}`}
                onPointerEnter={() => setMarcado(i)}
                onClick={() => escolher(o)}
              >
                {o === livre ? <>Usar “{o}”</> : o}
                {o === valor && <span className="atual">atual</span>}
              </li>
            ))}
            {!itens.length && <li className="nada">Ninguém com esse nome</li>}
          </ul>
          {valor && (
            <button type="button" className="escolha-nome-limpar" onClick={() => escolher('')}>
              Deixar em branco
            </button>
          )}
        </div>
      )}
    </div>
  );
}
