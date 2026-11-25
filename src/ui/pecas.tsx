import { useEffect, useMemo, useRef, useState } from 'react';
import { SUBTIPOS_ARTE, normalizarSubtipo, type Meta, type SubtipoArte } from '../modelo/tipos';
import { PRACAS, editoresConhecidos, seloCurto, programasConhecidos, redatoresConhecidos, semAcento } from '../modelo/vocabularios';
import { atalho, dataCurtaComDia, dataPorExtenso, ehMac } from './util';
import { Icone } from './icones';

/** Os traços do círculo à caneta (viewBox 0 0 64 44, pathLength 1): a contagem de artes da fila e o pôster da prévia. */
export const RABISCOS = [
  'M13 25 C 9 11, 27 4, 43 6 C 60 9, 61 31, 42 37 C 25 42, 5 37, 8 22 C 10 11, 23 5, 38 4',
  'M50 9 C 30 2, 6 9, 6 23 C 6 37, 30 42, 46 38 C 62 33, 62 12, 44 7 C 34 4, 22 5, 15 9',
  'M10 18 C 14 6, 36 2, 50 8 C 63 14, 58 34, 40 38 C 22 42, 4 34, 7 20 C 9 12, 18 7, 28 5',
];

/** Os riscos à caneta sob um texto (viewBox 0 0 100 14, pathLength 1): os formatos do convite e a claquete prioridade. */
export const RISCOS = ['M2 8 C 22 4, 52 5, 97 6 C 70 8, 38 10, 12 11', 'M3 6 C 30 9, 60 4, 98 7', 'M2 7 C 35 4, 70 9, 97 5 C 75 8, 40 9, 20 10'];

/** Os riscos à caneta por cima de um texto riscado, um por linha (mesmo viewBox, o meio em y = 7, de um traço só): a arte
 *  "já existe" na lista e no texto, e a que saiu na comparação. Veja `riscos.ts`. */
export const RISCOS_DE_LINHA = ['M3 6 C 30 9, 60 4, 98 7', 'M2 7 C 28 5, 62 8.5, 98 5.5', 'M2 6.5 C 25 8.5, 55 4.5, 98 7'];

/** Um risco à mão sob o texto de dentro; `traco` escolhe qual dos riscos. */
export function Riscado({ children, traco = 0, className = '' }: { children: React.ReactNode; traco?: number; className?: string }) {
  return (
    <span className={`riscado ${className}`}>
      {children}
      <svg viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><path pathLength={1} d={RISCOS[traco % RISCOS.length]} /></svg>
    </span>
  );
}

export /** "???" escritos à mão, cada um meio torto e fora do lugar; sempre do mesmo jeito para o mesmo roteiro. */
function Duvida({ semente, rotulo, n = 3 }: { semente: string; rotulo: string; n?: number }) {
  let h = 2166136261;
  for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const sorteio = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 1000) / 1000;
  return (
    <span className="duvida" role="img" aria-label={rotulo} title={rotulo}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ transform: `translate(${(sorteio() * 1.2 - 0.6).toFixed(1)}px, ${(sorteio() * 2 - 1).toFixed(1)}px) rotate(${(sorteio() * 12 - 6).toFixed(0)}deg)` }}>?</i>
      ))}
    </span>
  );
}

/** O seletor de arquivos escondido do convite: `abrir` chama o diálogo do sistema e `escolher` recebe o que veio. */
function useSeletorDeArquivos(escolher?: (arquivos: File[]) => void) {
  const seletor = useRef<HTMLInputElement>(null);
  const abrir = () => seletor.current?.click();
  const elemento = escolher && (
    <input
      ref={seletor}
      type="file"
      multiple
      hidden
      accept=".docx,.rtf,.pdf,.txt,.json"
      onChange={(e) => {
        const arquivos = [...(e.target.files ?? [])];
        e.target.value = '';
        if (arquivos.length) escolher(arquivos);
      }}
    />
  );
  // a área toda abre o seletor; os botões de dentro seguem com a própria ação
  const clicarNaArea = escolher ? (e: React.MouseEvent) => !(e.target as HTMLElement).closest('button, textarea, input, a') && abrir() : undefined;
  return { abrir, elemento, clicarNaArea };
}

/** Os formatos que o convite aceita, riscados à mão. */
const Formatos = () => (
  <>
    <Riscado className="formatos-riscados">.docx, .rtf ou .pdf</Riscado>
    <span className="formatos-resto">, quantos quiser de uma vez.</span>
  </>
);

/** O texto da claquete em pedaços, cada um terminando no seu sublinhado (`CHAMADA_` `NOVELA_` `25/11`), na ficha e no
    card. No computador os pedaços correm juntos, como texto corrido; no celular (estilos.css) a claquete quebra depois
    de cada sublinhado, e o pedaço que não cabe na linha termina em reticências. */
export function TextoDaClaquete({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(?<=_)/).map((pedaco, i) => (
        <span key={i} className="seg">{pedaco}</span>
      ))}
    </>
  );
}

/** O quadro tracejado de arrastar: título que se escreve sozinho, formatos riscados à mão e o colar do Word. */
export function ConviteDeArrastar({ frases, extra, className = '', escolher }: { frases: string[]; extra: React.ReactNode; className?: string; escolher?: (arquivos: File[]) => void }) {
  const seletor = useSeletorDeArquivos(escolher);
  return (
    <section className={`fila-vazia ${escolher ? 'clicavel' : ''} ${className}`} onClick={seletor.clicarNaArea}>
      <span className="fila-vazia-icone"><Icone nome="importar" tam={26} /></span>
      <h2 className="titulo-serifa"><TituloQueSeEscreve frases={frases} /></h2>
      <p className="suave"><Formatos /></p>
      {escolher ? (
        <div className="convite-acoes">
          <button type="button" className="botao-texto escolher" onClick={seletor.abrir}>escolher arquivos</button>
          <span className="ponto" aria-hidden="true">·</span>
          {extra}
        </div>
      ) : (
        extra
      )}
      {seletor.elemento}
    </section>
  );
}

/** O mesmo convite, deitado numa linha ao lado do título da fila: ícone, frase, formatos e os dois botões dentro. */
export function ConviteCompacto({ frases, escolher, colar, colando }: { frases: string[]; escolher: (arquivos: File[]) => void; colar: () => void; colando: boolean }) {
  const seletor = useSeletorDeArquivos(escolher);
  return (
    <section className="convite-compacto" aria-label="Mandar roteiros" onClick={seletor.clicarNaArea}>
      <span className="fila-vazia-icone"><Icone nome="importar" tam={21} /></span>
      <span className="convite-compacto-texto">
        <span className="titulo-serifa"><TituloQueSeEscreve frases={frases} /></span>
        <span className="suave"><Formatos /></span>
      </span>
      <span className="convite-compacto-acoes">
        <button type="button" className="botao primario" onClick={seletor.abrir}>Escolher arquivos</button>
        <button type="button" className="botao" aria-expanded={colando} aria-keyshortcuts={ehMac ? 'Meta+V' : 'Control+V'} onClick={colar}>
          Colar do Word <kbd>{atalho('Mod-V')}</kbd>
        </button>
      </span>
      {seletor.elemento}
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

/** O selo na ficha, que é estreita: vazio, "??" à mão; o nome longo ("Verifique a classificação indicativa") fica na
    forma curta ("Verifique") até a pessoa clicar para mudar, e o inteiro vai no title. */
function CampoSelo({ selo, semente, mudar }: { selo: string; semente: string; mudar: (selo: string) => void }) {
  const [editando, setEditando] = useState(false);
  return (
    <span className="campo-selo" title={selo || 'Selo não reconhecido'}>
      <input
        value={editando ? selo : seloCurto(selo)}
        aria-label="Selo"
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setEditando(true)}
        onBlur={() => setEditando(false)}
        onChange={(e) => mudar(e.target.value)}
      />
      {!selo && !editando && <Duvida semente={semente + 'selo'} rotulo="Selo não reconhecido" n={2} />}
    </span>
  );
}

type DadosClaquete = Pick<Meta, 'claquete' | 'redator' | 'editor' | 'dataExibicao'> & Partial<Pick<Meta, 'programa' | 'praca' | 'locutor' | 'selo' | 'duracaoAlvoSeg' | 'duracaoModo'>>;

/** A claquete da chamada: nome, equipe e exibição. Com `mudar`, os campos são editáveis. */
/** Com `comAtracao`, a claquete também mostra (e edita) a atração e a praça, como na revisão. */
/** A ficha que recolhe (o editor no celular): recolhida mostra o editor, a exibição e o tempo; aberta, a ficha inteira. */
export interface FichaRecolhivel {
  aberta: boolean;
  mudar: (aberta: boolean) => void;
}

export function Claquete({ dados, mudar, comAtracao = false, cadastrarAtracao, balaoLigar, estimadaSeg, recolhivel }: { dados: DadosClaquete; mudar?: (m: Partial<Meta>) => void; comAtracao?: boolean; cadastrarAtracao?: () => void; balaoLigar?: (fechar: () => void) => React.ReactNode; estimadaSeg?: number | null; recolhivel?: FichaRecolhivel }) {
  const [ligando, setLigando] = useState(false);
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
  const quadro = (
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
        <div className="trio">
          <div className="campo-c">
            <small>Locutor</small>
            {mudar ? <input value={dados.locutor ?? ''} placeholder="???" aria-label="Locutor" autoComplete="off" spellCheck={false} onChange={(e) => mudar({ locutor: e.target.value })} /> : <div>{dados.locutor}</div>}
          </div>
          <div className="campo-c">
            <small>Selo</small>
            {mudar ? <CampoSelo selo={dados.selo ?? ''} semente={dados.claquete || ''} mudar={(selo) => mudar({ selo })} /> : <div title={dados.selo}>{seloCurto(dados.selo ?? '')}</div>}
          </div>
          <div className="campo-c tempo-c">
            <small>Tempo</small>
            <span className="linha-tempo">
              <button
                type="button"
                className="modo-tempo"
                title="Alternar entre fechar com e no máximo"
                disabled={!mudar}
                onClick={() => mudar?.({ duracaoModo: dados.duracaoModo === 'max' ? 'fechar' : 'max' })}
              >
                {dados.duracaoModo === 'max' ? 'máx.' : 'fecha'}
              </button>
              {mudar ? (
                <input
                  className="segundos"
                  inputMode="numeric"
                  value={dados.duracaoAlvoSeg ?? ''}
                  placeholder="??"
                  aria-label="Tempo da chamada, em segundos"
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                    mudar({ duracaoAlvoSeg: Number.isFinite(n) ? n : null });
                  }}
                />
              ) : (
                <span>{dados.duracaoAlvoSeg ?? ''}</span>
              )}
              <span className="aspas">''</span>
            </span>
            {estimadaSeg != null && dados.duracaoAlvoSeg ? (
              <span className={`estimada ${estimadaSeg > dados.duracaoAlvoSeg * 1.1 ? 'estourou' : ''}`} title="Leitura estimada da locução e das sonoras">
                ≈ {estimadaSeg}'' lidos
              </span>
            ) : null}
          </div>
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
              <span className="ancora-balao">
                <button type="button" className="cadastrar-c" aria-expanded={ligando} onClick={() => (balaoLigar ? setLigando((x) => !x) : cadastrarAtracao())}>cadastrar</button>
                {ligando && balaoLigar?.(() => setLigando(false))}
              </span>
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
  );
  if (!recolhivel)
    return (
      <section className="claquete" aria-label="Claquete">
        <div className="ripa" aria-hidden="true" />
        {quadro}
      </section>
    );
  // recolhível: as duas dobras se revezam com a animação de altura; a que está fechada sai do foco (inert)
  const { aberta, mudar: abrir } = recolhivel;
  return (
    <section className={`claquete ficha-celular ${aberta ? 'aberta' : ''}`} aria-label="Claquete">
      <div className="ripa" aria-hidden="true" />
      <div className="dobra resumo" inert={aberta || undefined}>
        <div>
          <button type="button" className="ficha-resumo" aria-label="Abrir a ficha" onClick={() => abrir(true)}>
            <span className="campo-c">
              <small>Editor</small>
              <b>{dados.editor || <Duvida semente={(dados.claquete || '') + 'editor'} rotulo="Editor não preenchido" />}</b>
            </span>
            <span className="campo-c">
              <small>Exibição</small>
              <b>{dataCurtaComDia(dados.dataExibicao) || <Duvida semente={(dados.claquete || '') + 'data'} rotulo="Exibição não preenchida" />}</b>
            </span>
            <span className="campo-c">
              <small>Tempo</small>
              <b>{dados.duracaoAlvoSeg != null ? `${dados.duracaoAlvoSeg}''` : <Duvida semente={(dados.claquete || '') + 'tempo'} rotulo="Tempo não preenchido" />}</b>
            </span>
          </button>
        </div>
      </div>
      <div className="dobra inteira" inert={!aberta || undefined}>
        <div>{quadro}</div>
      </div>
      <button type="button" className="ripa-botao" aria-label={aberta ? 'Recolher a ficha' : 'Abrir a ficha inteira'} aria-expanded={aberta} onClick={() => abrir(!aberta)}>
        <span><Icone nome="baixo" tam={16} traco={2.4} /></span>
      </button>
    </section>
  );
}

/** Um menu de opções curto (sem busca), no visual dos outros menus do app: no lugar do seletor nativo do sistema. */
/** Com `multiplo`, valor é uma lista separada por vírgula: cada clique liga ou desliga, o menu fica aberto, e a opção
    de id vazio ("Sem tipo") limpa tudo. */
export function MenuDeOpcoes({ rotulo, valor, opcoes, mudar, multiplo = false }: { rotulo: string; valor: string; opcoes: { id: string; nome: string }[]; mudar: (v: string) => void; multiplo?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const escolhidos = multiplo ? valor.split(',').filter(Boolean) : [valor];
  const ligado = (id: string) => (multiplo && !id ? escolhidos.length === 0 : escolhidos.includes(id));
  const rotuloAtual = multiplo
    ? opcoes.filter((o) => o.id && escolhidos.includes(o.id)).map((o) => o.nome).join(' + ') || (opcoes.find((o) => !o.id)?.nome ?? '')
    : (opcoes.find((o) => o.id === valor) ?? opcoes[0])?.nome;
  useEffect(() => {
    if (!aberto) return;
    setMarcado(Math.max(0, opcoes.findIndex((o) => ligado(o.id))));
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const escolher = (id: string) => {
    if (multiplo && id) {
      const s = new Set(escolhidos);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      mudar(opcoes.filter((o) => o.id && s.has(o.id)).map((o) => o.id).join(','));
      return; // com vários, o menu fica aberto para escolher o próximo
    }
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
        <span>{rotuloAtual}</span>
        <Icone nome="baixo" tam={13} traco={2} />
      </button>
      {aberto && (
        <ul className="escolha-nome-menu menu-opcoes-lista" role="listbox" aria-label={rotulo} aria-multiselectable={multiplo || undefined}>
          {opcoes.map((o, k) => (
            <li
              key={o.id}
              role="option"
              aria-selected={ligado(o.id)}
              className={k === marcado ? 'marcado' : ''}
              onMouseEnter={() => setMarcado(k)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolher(o.id)}
            >
              {o.nome}
              {ligado(o.id) && <Icone nome="certo" tam={13} traco={2.2} />}
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
