import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { SUBTIPOS_ARTE, normalizarSubtipo, type Meta, type SubtipoArte, type SugestaoRedator } from '../modelo/tipos';
import type { EstadoDoRedator } from '../modelo/redator';
import { claquetePadrao, editoresConhecidos, seloCurto, programasConhecidos, redatoresConhecidos, semAcento } from '../modelo/vocabularios';
import { pracasRegistradas, siglasDasPracas } from '../modelo/pracas';
import { atalho, dataCurtaComDia, dataPorExtenso, ehMac } from './util';
import { Icone } from './icones';
import { RABISCO } from './cena';

/** Os traços do círculo à caneta (viewBox 0 0 64 44, pathLength 1): a contagem de artes da fila e o pôster da prévia. */
export const RABISCOS = [
  'M13 25 C 9 11, 27 4, 43 6 C 60 9, 61 31, 42 37 C 25 42, 5 37, 8 22 C 10 11, 23 5, 38 4',
  'M50 9 C 30 2, 6 9, 6 23 C 6 37, 30 42, 46 38 C 62 33, 62 12, 44 7 C 34 4, 22 5, 15 9',
  'M10 18 C 14 6, 36 2, 50 8 C 63 14, 58 34, 40 38 C 22 42, 4 34, 7 20 C 9 12, 18 7, 28 5',
];

/** Os riscos à caneta sob um texto (viewBox 0 0 100 14, pathLength 1): os formatos do convite. */
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

/** Qual das formas (do risco ou do marca-texto) vai na claquete: sempre a mesma para o mesmo roteiro. */
export const tracoDe = (id: string) => [...id].reduce((h, c) => h + c.charCodeAt(0), 0);

/**
 * A bolinha de estado (#172, #171): o pontinho cheio da etapa, a mesma em todas as telas (a agenda No Trello, a Pauta,
 * as Produções, a busca, o card aberto e a ficha do filme). A cor vem do estado: a entrada neutra, produzindo em
 * --ultra, aprovação, entregue em --ok, arquivada; o resto é a bolinha neutra. Na ficha, o "card" e o "sem card" vêm
 * vazados. Fora das etapas, o estado "ok" (pronto, confere, pode) é a mesma bolinha em --ok: é ela, e nunca um ✓
 * verde, que diz que está tudo certo (#171).
 * @param tam 'pequena' (6 px, nas linhas e nos cards) ou 'ficha' (8 px, na ficha e no card aberto)
 */
export function BolinhaDeEstado({ estado, tam = 'pequena', className = '' }: { estado: string; tam?: 'pequena' | 'ficha'; className?: string }) {
  return <i className={`bolinha-estado ${estado}${tam === 'ficha' ? ' tam-ficha' : ''}${className ? ` ${className}` : ''}`} data-estado={estado} aria-hidden="true" />;
}

/**
 * A bolinha de aviso (#192): o pontinho laranja que surge com um pulo e uma onda, o mesmo do aviso dos Filmes no topo
 * (`caminho-aviso`). Marca o que é novo para a pessoa: o comentário que a cita ou que chegou no roteiro dela, na lista
 * de "Roteiros" e no balão. Some quando ela vê.
 */
export function BolinhaDeAviso({ rotulo, className = '' }: { rotulo?: string; className?: string }) {
  return <i className={`bolinha-aviso${className ? ` ${className}` : ''}`} {...(rotulo ? { role: 'img', 'aria-label': rotulo, title: rotulo } : { 'aria-hidden': true })} />;
}

/**
 * O vazio à mão (#171): o texto curto em Caveat, meio torto, no lugar de uma lista, de uma coluna ou de uma busca que
 * não tem nada ("nada aqui", "ninguém", "nada com “x”"). Um só desenho em todas as telas; os vazios que explicam
 * (os de formulário) ficam no texto comum.
 * @param pequeno a medida das células e das colunas estreitas
 * @param como a marca (p, li ou span), para caber na lista de quem usa
 */
export function Vazio({ children, pequeno = false, como: Como = 'p', className = '' }: { children: React.ReactNode; pequeno?: boolean; como?: 'p' | 'li' | 'span'; className?: string }) {
  return <Como className={`vazio-a-mao${pequeno ? ' pequeno' : ''}${className ? ` ${className}` : ''}`}>{children}</Como>;
}

/**
 * O número da sua tarefa, circulado à caneta em `--ultra` (#171): um por tela (o "5 de 11" do Andamento, o da Minha
 * pauta, os pendentes dos Padeiros). O traço é o da contagem de artes da fila; ao chegar, o círculo se escreve.
 */
export function NumeroCirculado({ children, traco = 0, className = '' }: { children: React.ReactNode; traco?: number; className?: string }) {
  return (
    <span className={`numero-circulado${className ? ` ${className}` : ''}`}>
      {children}
      <svg viewBox="0 0 64 44" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength={1} d={RABISCOS[traco % RABISCOS.length]} />
      </svg>
    </span>
  );
}

/** O "você" à mão, em --ultra, ao lado do que é seu (a sua linha na Pauta, o seu card em Produções, #171). */
export function VoceAMao() {
  return <span className="voce-a-mao">você</span>;
}

/** "hoje", "amanhã" ou "ontem" à mão, em --ultra, ao lado do dia (a fita do Dia da Pauta, o Montar a pauta, #171). */
export function RelativoAMao({ rel, className = '' }: { rel: string; className?: string }) {
  return rel ? <span className={`rel-a-mao${className ? ` ${className}` : ''}`}>{rel}</span> : null;
}

/** O vazio da busca, à mão: "nada com “x”", e onde se buscou ("na fila"). */
export function NadaNaBusca({ termo, onde, className = '' }: { termo: string; onde?: string; className?: string }) {
  return (
    <Vazio className={`nada-na-busca${className ? ` ${className}` : ''}`}>
      nada com “{termo.trim()}”{onde ? ` ${onde}` : ''}
    </Vazio>
  );
}

/** A dica da palavra "prioridade" ao lado da claquete marcada (a ficha da fila e o topo da revisão). */
export const NA_PRIORIDADE = 'Na lista de prioridade: vai para o Trello com prioridade ALTA';

/** A passada de marca-texto da claquete na lista de prioridade (a agenda, a fila e o topo da revisão): em linha, uma
 *  passada por linha que quebra; `traco` escolhe qual das três formas do pincel (veja `.marca-texto` em estilos.css). */
export function MarcaTexto({ children, traco = 0 }: { children: React.ReactNode; traco?: number }) {
  return <span className={`marca-texto forma-${traco % 3}`}>{children}</span>;
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

/** O seletor de arquivos escondido do convite: `abrir` chama o diálogo do sistema e `escolher` recebe o que veio. Com
    `um`, um arquivo só, e só os de texto (o roteiro que começa a ser escrito, #195). */
export function useSeletorDeArquivos(escolher?: (arquivos: File[]) => void, um = false) {
  const seletor = useRef<HTMLInputElement>(null);
  const abrir = () => seletor.current?.click();
  const elemento = escolher && (
    <input
      ref={seletor}
      type="file"
      multiple={!um}
      hidden
      accept={um ? '.docx,.rtf,.pdf,.txt' : '.docx,.rtf,.pdf,.txt,.json'}
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

/** O cartão que aparece com um arquivo sendo arrastado sobre a tela: "Pode soltar" e o que ela faz com ele. */
export function AvisoDeSoltar({ texto }: { texto: string }) {
  return (
    <div className="soltar" aria-hidden="true">
      <div className="soltar-cartao">
        <span className="soltar-titulo">Pode soltar</span>
        <span>{texto}</span>
      </div>
    </div>
  );
}

/** Os formatos que o convite aceita, riscados à mão. */
const Formatos = () => (
  <>
    <Riscado className="formatos-riscados">.docx, .rtf ou .pdf</Riscado>
    <span className="formatos-resto">, quantos quiser de uma vez.</span>
  </>
);

/** Os pedaços de uma palavra da claquete onde ela pode quebrar: depois do sublinhado, antes de "(", depois de ")" e
    antes da data ("FANT(INTERPOL)29-11" → `FANT` `(INTERPOL)` `29-11`). Nunca no meio de uma palavra nem da data. */
export function pedacosDaClaquete(palavra: string): string[] {
  return palavra
    .replace(/_/g, '_\u0000')
    .replace(/\(/g, '\u0000(')
    .replace(/\)/g, ')\u0000')
    .replace(/([^\d\u0000/-])(?=\d{1,2}[-/]\d{1,2})/g, '$1\u0000')
    .split('\u0000')
    .filter(Boolean);
}

/** O texto da claquete em pedaços, cada um terminando no seu sublinhado (`CHAMADA_` `NOVELA_` `25/11`), na ficha e no
    card. No computador os pedaços correm juntos, como texto corrido; no celular (estilos.css) a claquete quebra depois
    de cada sublinhado, e o pedaço que não cabe na linha termina em reticências. Com `quebras` (o card da agenda), a
    claquete também quebra nos espaços, antes de "(", depois de ")" e antes da data (pedacosDaClaquete). */
export function TextoDaClaquete({ texto, quebras = false }: { texto: string; quebras?: boolean }) {
  if (quebras)
    return (
      <>
        {texto.split(' ').map((palavra, i) => (
          <Fragment key={i}>
            {i > 0 && ' '}
            {pedacosDaClaquete(palavra).map((pedaco, j) => (
              <Fragment key={j}>
                {j > 0 && <wbr />}
                <span className={/^\d{1,2}[-/]\d{1,2}/.test(pedaco) ? 'seg data' : 'seg'}>{pedaco}</span>
              </Fragment>
            ))}
          </Fragment>
        ))}
      </>
    );
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

export function TituloQueSeEscreve({ frases }: { frases: string[] }) {
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

export function Claquete({ dados, mudar, comAtracao = false, cadastrarAtracao, balaoLigar, estimadaSeg, recolhivel, palpiteRedator, apelido }: { dados: DadosClaquete; mudar?: (m: Partial<Meta>) => void; comAtracao?: boolean; cadastrarAtracao?: () => void; balaoLigar?: (fechar: () => void) => React.ReactNode; estimadaSeg?: number | null; recolhivel?: FichaRecolhivel; palpiteRedator?: PalpiteNoCampo; /** o apelido e as versões lidas do roteiro (#120), embaixo da claquete */ apelido?: React.ReactNode }) {
  const [ligando, setLigando] = useState(false);
  const data = useRef<HTMLInputElement>(null);
  const campo = (rotulo: string, chave: 'claquete' | 'redator' | 'editor', vazio: string, lista?: () => string[]) =>
    mudar && lista ? (
      <EscolhaDeNome rotulo={rotulo} valor={dados[chave] ?? ''} opcoes={lista} mudar={(v) => mudar({ [chave]: v })} semente={(dados.claquete || '') + chave} palpite={chave === 'redator' ? palpiteRedator : undefined} />
    ) : mudar ? (
      <input
        value={dados[chave] ?? ''}
        placeholder={vazio}
        aria-label={rotulo}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => mudar({ [chave]: e.target.value })}
        // a data da claquete vai com barra ("DONA 27-11" → "DONA 27/11"): ao sair do campo, para não pular o cursor
        onBlur={chave === 'claquete' ? (e) => claquetePadrao(e.target.value) !== e.target.value && mudar({ claquete: claquetePadrao(e.target.value) }) : undefined}
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
      {apelido}
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
              {siglasDasPracas(pracasRegistradas()).map((p) => (
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

/** Um item que sai de uma lista (a pendência "Sem redator" quando o palpite é aceito) continua na tela enquanto
    recolhe: `saindo` fica ligado por `ms` depois que `presente` vira false. Nada teleporta. */
export function useSaida(presente: boolean, ms = 900) {
  const [antes, setAntes] = useState(presente);
  const [saindo, setSaindo] = useState(false);
  if (antes !== presente) {
    setAntes(presente);
    setSaindo(antes && !presente);
  }
  useEffect(() => {
    if (!saindo) return;
    const t = setTimeout(() => setSaindo(false), ms);
    return () => clearTimeout(t);
  }, [saindo, ms]);
  return saindo;
}

/** O palpite do redator (a sugestão do PROMeiro) no lugar dos ??? à mão: o estado, o nome com o motivo, os sugeridos
    que vão no topo do menu e o × que recusa. Veja `modelo/redator.ts`. */
export interface PalpiteNoCampo {
  estado: EstadoDoRedator;
  sugestao: SugestaoRedator;
  sugeridos: SugestaoRedator[];
  recusar: () => void;
}

/**
 * O palpite à mão: "Fulana Prado?" (um toque aceita), o × (recusa) e, embaixo, o motivo. É o mesmo na ficha da fila,
 * no campo Redator da claquete e em "Para revisar".
 */
export function PalpiteAMao({ sugestao, aceitar, recusar, comMotivo = true, escondido = false }: { sugestao: SugestaoRedator; aceitar: (nome: string) => void; recusar: () => void; comMotivo?: boolean; escondido?: boolean }) {
  const fora = escondido ? { tabIndex: -1, 'aria-hidden': true } : {};
  return (
    <span className="palpite" aria-hidden={escondido || undefined}>
      <button type="button" className="sug" title={`Usar ${sugestao.nome} como redator`} onClick={() => aceitar(sugestao.nome)} {...fora}>
        {sugestao.nome}?
      </button>
      <button type="button" className="nao" aria-label={`Não é ${sugestao.nome}`} title={`Não é ${sugestao.nome}`} onClick={recusar} {...fora}>
        <Icone nome="fechar" tam={11} traco={2.6} />
      </button>
      {comMotivo && <span className="motivo">{sugestao.motivo}</span>}
    </span>
  );
}

/** Escolher um nome da lista do Teable (redatores, editores), com busca; vazio mostra os ??? à mão.
    Também aceita um nome que não está na lista. Com `palpite` (o redator sugerido), o palpite à mão ocupa o lugar dos
    ???, e os três estados (sugerido, aceito, recusado) trocam no mesmo lugar, com fade. `soLeitura`: o valor aceito é
    só texto (a ficha da fila). */
export function EscolhaDeNome({ rotulo, valor, opcoes, mudar, semente, palpite, soLeitura = false }: { rotulo: string; valor: string; opcoes: () => string[]; mudar: (v: string) => void; semente: string; palpite?: PalpiteNoCampo; soLeitura?: boolean }) {
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState('');
  const [marcado, setMarcado] = useState(0);
  // o carimbo "ok!" só aparece no toque que aceitou o palpite, não em quem abre um roteiro já aceito
  const [carimbo, setCarimbo] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const sugeridos = useMemo(() => (busca.trim() ? [] : (palpite?.sugeridos ?? [])), [busca, palpite?.sugeridos]);
  const filtradas = useMemo(() => {
    const t = semAcento(busca.trim());
    const ja = new Set(sugeridos.map((s) => s.nome));
    return opcoes().filter((o) => (!t || semAcento(o).includes(t)) && !ja.has(o));
  }, [busca, opcoes, aberta, sugeridos]); // eslint-disable-line react-hooks/exhaustive-deps
  const livre = busca.trim() && !filtradas.some((o) => o.toLowerCase() === busca.trim().toLowerCase()) ? busca.trim() : '';
  const itens = [...sugeridos.map((s) => s.nome), ...filtradas, ...(livre ? [livre] : [])];
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
  const item = (o: string, i: number, por?: string) => (
    <li
      key={o + i}
      data-i={i}
      role="option"
      aria-selected={o === valor}
      className={`${i === marcado ? 'marcado' : ''} ${o === livre ? 'livre' : ''} ${por ? 'sugerido' : ''}`}
      onPointerEnter={() => setMarcado(i)}
      onClick={() => escolher(o)}
    >
      {o === livre ? <>Usar “{o}”</> : por ? <span className="com-por"><span>{o}</span><span className="por">{por}</span></span> : o}
      {o === valor && <span className="atual">atual</span>}
    </li>
  );
  const gatilho = (escondido = false) => (
    <button
      type="button"
      className={`escolha-nome-valor ${valor ? '' : 'vago'}`}
      aria-label={`${rotulo}: ${valor || 'não preenchido'}`}
      aria-haspopup="listbox"
      aria-expanded={aberta}
      onClick={() => setAberta((v) => !v)}
      {...(escondido ? { tabIndex: -1, 'aria-hidden': true } : {})}
    >
      {valor || <Duvida semente={semente} rotulo={`${rotulo} não preenchido`} />}
    </button>
  );
  const estado: EstadoDoRedator | null = palpite ? (valor ? 'aceito' : palpite.estado === 'recusado' ? 'recusado' : 'sugerido') : null;
  return (
    <div className={`escolha-nome ${estado ? `com-palpite ${estado}` : ''}`} ref={caixa}>
      {!palpite ? (
        gatilho()
      ) : (
        // as três camadas ocupam a mesma célula: só a do estado aparece, e a troca é um fade no mesmo lugar
        <span className="troca">
          <span className="troca-valor" aria-hidden={estado !== 'aceito' || undefined}>
            {soLeitura ? <span className="nome-aceito">{valor}</span> : gatilho(estado !== 'aceito')}
            {carimbo && estado === 'aceito' && <span className="carimbo" aria-hidden="true">ok!</span>}
          </span>
          <PalpiteAMao sugestao={palpite.sugestao} aceitar={(n) => (setCarimbo(true), escolher(n))} recusar={palpite.recusar} escondido={estado !== 'sugerido'} />
          <span className="troca-vazio" aria-hidden={estado !== 'recusado' || undefined}>
            {gatilho(estado !== 'recusado')}
            <button type="button" className="botao-texto escolher" onClick={() => setAberta((v) => !v)} {...(estado !== 'recusado' ? { tabIndex: -1 } : {})}>
              Escolher
            </button>
          </span>
        </span>
      )}
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
            {sugeridos.length > 0 && <li className="grupo" role="presentation">Sugeridos</li>}
            {sugeridos.map((s, i) => item(s.nome, i, s.motivo))}
            {sugeridos.length > 0 && filtradas.length > 0 && <li className="sep" role="presentation" />}
            {filtradas.map((o, i) => item(o, sugeridos.length + i))}
            {livre && item(livre, sugeridos.length + filtradas.length)}
            {!itens.length && <Vazio como="li" pequeno className="nada">ninguém com esse nome</Vazio>}
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

/** Uma aba das listas com abas (os Cadastros, os Roteiros, #189). */
export type AbaDaLista = { ativa: boolean; total: number; abrir: () => void };
/**
 * A aba com o rabisco (#171): fechada, o ícone e o número pequeno; ativa, o nome com o número em laranja e o rabisco
 * que se escreve embaixo (`abas-cad`). A mesma nos Cadastros e nos Roteiros (#189).
 * @param mostrarNome o nome também com a aba fechada (as abas com texto, sem ícone que as diga)
 */
export function AbaComRabisco({ nome, icone, aba, classe, mostrarNome = false }: { nome: string; icone?: React.ReactNode; aba: AbaDaLista; classe?: string; mostrarNome?: boolean }) {
  return (
    <button role="tab" className={classe} aria-selected={aba.ativa} title={aba.ativa || mostrarNome ? undefined : nome} onClick={aba.abrir}>
      {icone}
      {aba.ativa ? (
        <span className="rot">
          {nome} <b>{aba.total}</b>
          <svg className="sub" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength={1} d={RABISCO} />
          </svg>
        </span>
      ) : mostrarNome ? (
        <span className="rot-fechada">
          {nome} <sup>{aba.total}</sup>
        </span>
      ) : (
        <sup>{aba.total}</sup>
      )}
    </button>
  );
}
