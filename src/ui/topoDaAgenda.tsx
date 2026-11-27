import { useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { CRITERIOS, duracaoDoPeriodo, NOME_DO_CRITERIO, periodoNaContagem, valorNaContagem, type CriterioDaAgenda, type DiaDaSemana, type EixoDoPeriodo, type PartesDoPeriodo } from './fila';
import { RABISCO } from './cena';
import { RABISCOS } from './pecas';
import { semMovimento } from './util';
import { AnoNovoNaAgenda } from './Enfeites';

/* O topo da agenda No Trello, no celular (#41) e no computador: o período do seletor, o resumo dos dias à vista, o
   "voltar para hoje" e, no computador, o cabeçalho de cada dia. Quando os dias à vista mudam, os números contam do
   valor antigo até o novo, a prioridade e as marcas do dia ("ontem", "hoje" com o círculo, "amanhã") se escrevem à mão
   e o "voltar para hoje" desliza no sentido em que a agenda andou. No celular, nada disso acontece no meio do arrasto:
   quem decide quando o topo muda é o useFaixa (só quando a rolagem termina); no computador, é a troca de semana
   (useTrocaDeSemana). Com o movimento reduzido, tudo é só a troca.

   Todo o movimento roda no relógio das animações da página (Web Animations), nunca em temporizadores nem no horário do
   quadro: assim nada salta quando a página desacelera as animações (o CDP, nos quadros em câmera lenta). */

/** A curva --suave dos estilos, para as animações feitas daqui. */
export const SUAVE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const CONTA_RESUMO_MS = 360;

/** Uma contagem em andamento: de onde, para onde e em que instante (de 0 a 1). Parada, `de` e `para` são o alvo. */
export interface Contagem {
  de: number;
  para: number;
  p: number;
}

/** Conta até `alvo` sempre que ele muda, partindo do valor que estava à vista (uma contagem interrompida continua de
    onde estava), em `duracao(de, para)` ms. Na primeira vez, e com o movimento reduzido, só troca. */
export function useContagem(alvo: number, duracao: (de: number, para: number) => number): Contagem {
  const [c, setC] = useState<Contagem>({ de: alvo, para: alvo, p: 1 });
  const agora = useRef(c);
  agora.current = c;
  useEffect(() => {
    const atual = agora.current;
    if (atual.para === alvo && atual.p >= 1) return;
    const de = valorNaContagem(atual.de, atual.para, atual.p);
    if (de === alvo || semMovimento() || typeof Animation === 'undefined') {
      setC({ de: alvo, para: alvo, p: 1 });
      return;
    }
    const ms = duracao(de, alvo);
    // o relógio: uma animação sem efeito visível, que anda (e desacelera) com as outras da página
    const relogio = new Animation(new KeyframeEffect(null, [], { duration: ms }), document.timeline);
    relogio.play();
    let quadro = 0;
    const passo = () => {
      const p = relogio.playState === 'finished' ? 1 : Math.min(1, Number(relogio.currentTime ?? 0) / ms);
      setC({ de, para: alvo, p });
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(quadro);
      relogio.cancel();
    };
    // a duração é lida na troca do alvo: só ela começa uma contagem
  }, [alvo]); // eslint-disable-line react-hooks/exhaustive-deps
  return c;
}

const ESMAECE_MS = 140;

/** Com o movimento reduzido, o que conta só troca; com este gancho, `el` esmaece de volta quando `chave` muda (fora da
    primeira vez). Com o movimento, nada: quem anima é a contagem. A Pauta usa no período e no resumo (#170). */
export function useEsmaeceAoMudar(el: RefObject<HTMLElement | null>, chave: unknown) {
  const antes = useRef(chave);
  useLayoutEffect(() => {
    if (antes.current === chave) return;
    antes.current = chave;
    if (!semMovimento() || !el.current || typeof el.current.animate !== 'function') return;
    const a = el.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ESMAECE_MS, easing: 'ease-out' });
    return () => a.cancel();
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Um item que abre a vaga de lado ao aparecer e a fecha ao sair, com opacidade, sem a linha pular. Enquanto fecha,
    continua mostrando o que tinha; fechado, sai da página. Na primeira vez, e com o movimento reduzido, só troca. */
export function ItemQueAbre({ ver, classe, ms = 300, opacidadeMs = 200, children }: { ver: boolean; classe: string; ms?: number; opacidadeMs?: number; children: ReactNode }) {
  const [montado, setMontado] = useState(ver);
  const ultimo = useRef(children);
  if (ver) ultimo.current = children;
  const el = useRef<HTMLSpanElement>(null);
  const animacoes = useRef<Animation[]>([]);
  // o elemento que já estava na tela: o que acabou de entrar abre do zero
  const naTela = useRef<HTMLSpanElement | null>(null);
  const primeira = useRef(true);
  // o `ver` que o elemento na tela já mostra: o efeito que roda de novo sem mudança (o StrictMode monta duas vezes na
  // primeira carga) não anima nada
  const mostrado = useRef(ver);
  if (ver && !montado) setMontado(true);
  useLayoutEffect(() => {
    const e = el.current;
    const novo = naTela.current !== e;
    naTela.current = e;
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    if (!e || (!novo && mostrado.current === ver)) return;
    mostrado.current = ver;
    const largura = novo ? 0 : e.getBoundingClientRect().width;
    const opacidade = novo ? '0' : getComputedStyle(e).opacity;
    animacoes.current.forEach((a) => a.cancel());
    animacoes.current = [];
    if (semMovimento()) {
      if (!ver) setMontado(false);
      return;
    }
    const tempo = { easing: SUAVE };
    if (ver) {
      // abre do tamanho em que estava (zero, ou o meio de um fechamento) até o inteiro
      const inteiro = e.scrollWidth;
      animacoes.current = [
        e.animate([{ maxWidth: `${largura}px` }, { maxWidth: `${inteiro}px` }], { ...tempo, duration: ms }),
        e.animate([{ opacity: opacidade }, { opacity: 1 }], { ...tempo, duration: opacidadeMs }),
      ];
    } else {
      animacoes.current = [
        e.animate([{ maxWidth: `${largura}px` }, { maxWidth: '0px' }], { ...tempo, duration: ms, fill: 'forwards' }),
        e.animate([{ opacity: opacidade }, { opacity: 0 }], { duration: opacidadeMs, easing: 'ease-out', fill: 'forwards' }),
      ];
      const estas = animacoes.current;
      void Promise.all(estas.map((a) => a.finished)).then(
        () => {
          if (animacoes.current === estas) setMontado(false);
        },
        () => undefined,
      );
    }
  }, [ver, ms, opacidadeMs]);
  useEffect(() => () => animacoes.current.forEach((a) => a.cancel()), []);
  if (!montado) return null;
  return (
    <span ref={el} className={`ct-item ${classe}`} aria-hidden={!ver || undefined}>
      {ver ? children : ultimo.current}
    </span>
  );
}

/** O número que conta, com algarismos de largura fixa, e a palavra que acompanha o número à vista ("1 card", "2 cards").
    A Pauta conta o resumo por ele também ("1 linha sem editor", #170). */
export function NumeroQueConta({ valor, um, varios }: { valor: number; um: string; varios: string }) {
  const c = useContagem(valor, () => CONTA_RESUMO_MS);
  // com o movimento reduzido, o número novo já sai junto com a palavra nova (a contagem só troca um quadro depois)
  const v = semMovimento() ? valor : valorNaContagem(c.de, c.para, c.p);
  return (
    <>
      <span className="ct-num">{v}</span> {v === 1 ? um : varios}
    </>
  );
}

/** A escrita à mão: o tempo e a curva da caneta. */
const ESCREVER_MS = 360;
const CANETA = 'cubic-bezier(0.45, 0, 0.3, 1)';

/** A escrita à mão: o traço aparece da esquerda para a direita, como a caneta (depois de `atraso` ms). A Pauta escreve o
    "hoje" da grade por ela (#170). */
export const escrever = (e: HTMLElement, atraso = 0) =>
  e.animate([{ clipPath: 'inset(-40% 100% -40% -8%)' }, { clipPath: 'inset(-40% -8% -40% -8%)' }], { duration: ESCREVER_MS, delay: atraso, easing: CANETA, fill: 'backwards' });

/** A prioridade à mão: ao aparecer (`escreverAoAparecer`), se escreve; quando só o número muda, apaga rápido e se
    escreve de novo. Ela não conta: a letra à mão não tem algarismos de largura fixa. */
function PrioridadeAMao({ n, escreverAoAparecer }: { n: number; escreverAoAparecer: boolean }) {
  const [mostrado, setMostrado] = useState(n);
  const nota = useRef<HTMLSpanElement>(null);
  const reescrever = useRef(false);
  useLayoutEffect(() => {
    // só na entrada: quem decide é quem abriu o item
    if (escreverAoAparecer && nota.current && !semMovimento()) escrever(nota.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const e = nota.current;
    if (n === mostrado || !e) return;
    if (semMovimento()) {
      setMostrado(n);
      return;
    }
    const apagar = e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-out', fill: 'forwards' });
    apagar.finished.then(
      () => {
        reescrever.current = true;
        setMostrado(n);
      },
      () => undefined,
    );
    return () => apagar.cancel();
  }, [n, mostrado]);
  useLayoutEffect(() => {
    if (!reescrever.current || !nota.current) return;
    reescrever.current = false;
    escrever(nota.current);
  }, [mostrado]);
  return (
    <span ref={nota} className="prio-nota">
      {mostrado} {mostrado === 1 ? 'prioridade' : 'prioridades'}
    </span>
  );
}

/** As palavras do resumo: o primeiro número e o segundo (que só aparece quando não é zero), no singular e no plural. */
export type PalavrasDoResumo = [[string, string], [string, string]];
/** As palavras do resumo em cada critério da agenda No Trello. */
const PALAVRAS: Record<CriterioDaAgenda, PalavrasDoResumo> = {
  exibicao: [['card', 'cards'], ['entregue', 'entregues']],
  entrada: [['entrou', 'entraram'], ['já saiu', 'já saíram']],
  entrega: [['entregue', 'entregues'], ['a entregar', 'a entregar']],
};

/** O filtro das prioridades: o "N prioridades" vira um botão que liga e desliga, com o risco à mão embaixo enquanto
    está ligado (como a aba ativa). */
export interface FiltroDasPrioridades {
  ligado: boolean;
  alternar: () => void;
}

/** O resumo dos dias à vista, no critério da agenda: "17 cards · 9 entregues · 2 prioridades" (por exibição), "22
    entraram · 12 já saíram" (por entrada), "10 entregues · 7 a entregar" (por entrega). Os números contam; os itens que
    aparecem ou somem abrem ou fecham a vaga; a prioridade se escreve. Com o `filtro`, a prioridade é o botão que mostra
    só os cards de prioridade; o resumo continua contando todos os cards dos dias à vista. Outra agenda (a de filmes,
    #182) dá as `palavras` dela: "12 exibições · 3 inéditas". */
export function ResumoQueConta({ total, entregues, aEntregar = 0, comPrioridade, criterio = 'exibicao', filtro, palavras }: { total: number; entregues: number; aEntregar?: number; comPrioridade: number; criterio?: CriterioDaAgenda; filtro?: FiltroDasPrioridades; palavras?: PalavrasDoResumo }) {
  const montado = useRef(false);
  useEffect(() => {
    montado.current = true;
  }, []);
  const [[um1, varios1], [um2, varios2]] = palavras ?? PALAVRAS[criterio];
  const [primeiro, segundo] = criterio === 'entrega' ? [entregues, aEntregar] : [total, entregues];
  return (
    <span>
      <span className="ct-item">
        <NumeroQueConta valor={primeiro} um={um1} varios={varios1} />
      </span>
      <ItemQueAbre ver={segundo > 0} classe="ct-entregues">
        {' · '}
        <NumeroQueConta valor={segundo} um={um2} varios={varios2} />
      </ItemQueAbre>
      <ItemQueAbre ver={comPrioridade > 0} classe="ct-prio" ms={220} opacidadeMs={130}>
        {' · '}
        {filtro ? (
          <button type="button" className="prio-filtro" aria-pressed={filtro.ligado} title={filtro.ligado ? 'Mostrar todos os cards' : 'Mostrar só as prioridades'} onClick={filtro.alternar}>
            <span className="prio-rot">
              <PrioridadeAMao n={comPrioridade} escreverAoAparecer={montado.current} />
              {filtro.ligado && (
                <svg className="sub" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
                  <path pathLength={1} d={RABISCO} />
                </svg>
              )}
            </span>
          </button>
        ) : (
          <PrioridadeAMao n={comPrioridade} escreverAoAparecer={montado.current} />
        )}
      </ItemQueAbre>
    </span>
  );
}

/** As abas do critério da agenda: "exibição · entrada · entrega", em texto, com o risco à mão sob a ativa (como as abas
    dos Cadastros). As setas do teclado trocam de aba. */
export function AbasDoCriterio({ criterio, mudar }: { criterio: CriterioDaAgenda; mudar: (c: CriterioDaAgenda) => void }) {
  const abas = useRef<HTMLSpanElement>(null);
  const tecla = (e: KeyboardEvent) => {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -CRITERIOS.indexOf(criterio) : e.key === 'End' ? CRITERIOS.length - 1 - CRITERIOS.indexOf(criterio) : null;
    if (passo === null) return;
    e.preventDefault();
    const novo = CRITERIOS[(CRITERIOS.indexOf(criterio) + passo + CRITERIOS.length) % CRITERIOS.length];
    mudar(novo);
    abas.current?.querySelector<HTMLElement>(`[data-criterio="${novo}"]`)?.focus();
  };
  return (
    <span ref={abas} className="abas-criterio" role="tablist" aria-label="Organizar a agenda por" onKeyDown={tecla}>
      {CRITERIOS.map((k) => (
        <button key={k} type="button" role="tab" data-criterio={k} aria-selected={k === criterio} tabIndex={k === criterio ? 0 : -1} onClick={() => mudar(k)}>
          <span className="rot">
            {NOME_DO_CRITERIO[k]}
            {k === criterio && (
              <svg className="sub" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
                <path pathLength={1} d={RABISCO} />
              </svg>
            )}
          </span>
        </button>
      ))}
    </span>
  );
}

/** O maior período que o seletor escreve: a largura dele, fixa, para as setas nunca se mexerem. */
const MAIOR_PERIODO = '<span class="p-dia p-d1">30</span><span class="p-mes">/12</span> – <span class="p-dia p-d2">31</span><span class="p-mes">/12</span>';

/** A contagem do período até a posição `k` do eixo (os dias à vista). Na renderização em que a posição muda, a
    contagem já começa (parada no instante zero): os meses começam a apagar antes de o relógio andar, e os dias só
    contam depois que eles somem. No computador, os números dos dias contam por ela também, junto com o período. */
export function useContagemDoPeriodo(eixo: EixoDoPeriodo | string[], k: number): Contagem {
  const contagem = useContagem(k, (de, para) => duracaoDoPeriodo(eixo, de, para));
  return contagem.para === k ? contagem : { de: valorNaContagem(contagem.de, contagem.para, contagem.p), para: k, p: 0 };
}

/** O período do seletor ("25 – 26/11") no celular: os dias contam até os novos; na virada do mês, os meses somem no
    começo e voltam no fim, e o "/11" da esquerda abre ou fecha a vaga só no fim. A largura é a do maior período. */
export function PeriodoQueConta({ isos, k }: { isos: string[]; k: number }) {
  const c = useContagemDoPeriodo(isos, k);
  return <Periodo {...periodoNaContagem(isos, c.de, c.para, c.p)} largura="fixa" />;
}

/** O período em partes, enquanto conta (ou parado): os dias com algarismos de largura fixa, os meses apagados durante
    a virada e o mês da esquerda, que abre ou fecha a vaga. A largura: "fixa" é a do maior período do celular, para as
    setas nunca se mexerem; "suave" (o computador, onde o período é por extenso e varia muito) acompanha o texto, e o
    que muda de uma vez (um algarismo a mais, o nome do mês) não empurra as setas de estalo: elas andam até o lugar.
    A Pauta (#170) escreve "16 a 22 de novembro" (`entre`) e, no Dia, um dia só, com o dia da semana (`semana`: "sexta,
    27 de novembro"; os dois lados do período são o mesmo dia). */
export function Periodo({ dia1, mes1, dia2, mes2, mesesApagados, largura, entre = ' – ', semana }: PartesDoPeriodo & { mesesApagados: boolean; largura: 'fixa' | 'suave'; entre?: string; semana?: string }) {
  const el = useRef<HTMLElement>(null);
  const [fixa, setFixa] = useState<number>();
  useLayoutEffect(() => {
    if (largura !== 'fixa') return;
    const medir = () => {
      const b = el.current;
      if (!b?.parentElement) return;
      const copia = b.cloneNode(false) as HTMLElement;
      copia.removeAttribute('style');
      Object.assign(copia.style, { position: 'absolute', visibility: 'hidden', width: 'auto', minWidth: '0' });
      copia.innerHTML = MAIOR_PERIODO;
      b.parentElement.appendChild(copia);
      setFixa(Math.ceil(copia.getBoundingClientRect().width) + 2);
      copia.remove();
    };
    medir();
    // a letra pode chegar depois: mede de novo
    let vivo = true;
    void document.fonts?.ready.then(() => vivo && medir());
    return () => {
      vivo = false;
    };
  }, [largura]);
  // "suave": a largura de antes desta renderização (a que está na tela) e a margem que compensa o salto
  const antes = useRef<number | undefined>(undefined);
  const margem = useRef<Animation | undefined>(undefined);
  if (largura === 'suave') antes.current = el.current?.getBoundingClientRect().width;
  useLayoutEffect(() => {
    const b = el.current;
    const de = antes.current;
    if (largura !== 'suave' || !b || de === undefined) return;
    const salto = b.getBoundingClientRect().width - de;
    if (Math.abs(salto) < 0.5 || semMovimento()) return;
    // o período cresceu (ou encolheu) de uma vez: a margem devolve o que mudou e vai a zero, e o que está à esquerda
    // (a seta, o "voltar para hoje") anda até o lugar novo
    const atual = parseFloat(getComputedStyle(b).marginLeft) || 0;
    margem.current?.cancel();
    margem.current = b.animate([{ marginLeft: `${atual - salto}px` }, { marginLeft: '0px' }], { duration: 220, easing: SUAVE });
  });
  useEffect(() => () => margem.current?.cancel(), []);
  const apagado = mesesApagados ? ' apagado' : '';
  return (
    <b ref={el} style={fixa ? { width: fixa } : undefined}>
      {semana !== undefined ? (
        <span className="p-sem">{`${semana}, `}</span>
      ) : (
        <>
          <span className="p-dia p-d1">{dia1}</span>
          <ItemQueAbre ver={!!mes1} classe="p-m1">
            <span className={`p-mes${apagado}`}>{mes1}</span>
          </ItemQueAbre>
          {entre}
        </>
      )}
      <span className="p-dia p-d2">{dia2}</span>
      <span className={`p-mes${apagado}`}>{mes2}</span>
    </b>
  );
}

/** O cabeçalho de um dia da agenda: "QUA 25 hoje", com o hoje circulado à mão. No computador, o número é o da contagem
    (conta junto com o período) e as marcas ("ontem", "hoje" com o círculo, "amanhã") só aparecem quando a contagem
    termina (`marcas`); então se escrevem à mão (`escrever`): o círculo primeiro, a palavra logo atrás. */
export function TopoDoDia({ d, numero = d.numero, marcas = true, escrever: escreve = false }: { d: DiaDaSemana; numero?: number; marcas?: boolean; escrever?: boolean }) {
  const marca = marcas ? d.marca : '';
  // os enfeites de Ano Novo: o dia 1º, quando é "amanhã" (no dia 31) ou "hoje", vira "2027!" à mão
  const anoNovo = useContext(AnoNovoNaAgenda);
  const virada = anoNovo && d.iso === `${anoNovo}-01-01` && (marca === 'amanhã' || marca === 'hoje') ? `${anoNovo}!` : undefined;
  const circulo = useRef<SVGPathElement>(null);
  const rel = useRef<HTMLSpanElement>(null);
  const antes = useRef(marca);
  useLayoutEffect(() => {
    const era = antes.current;
    antes.current = marca;
    if (!escreve || !marca || marca === era || semMovimento()) return;
    const tracos: Animation[] = [];
    if (circulo.current) tracos.push(circulo.current.animate([{ strokeDasharray: '1', strokeDashoffset: 1 }, { strokeDasharray: '1', strokeDashoffset: 0 }], { duration: ESCREVER_MS, easing: CANETA, fill: 'backwards' }));
    if (rel.current) tracos.push(escrever(rel.current, circulo.current ? ESCREVER_MS / 2 : 0));
    return () => tracos.forEach((a) => a.cancel());
  }, [marca]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="coluna-topo">
      {/* por dentro, para a coluna estreita (estilos.css: @container dia) levar o "hoje" para baixo do número */}
      <div className="coluna-topo-dentro">
        <span className="dia-sem">{d.diaDaSemana}</span>
        <span className="dia-num">
          {numero}
          {marca === 'hoje' && <svg viewBox="0 0 64 44" preserveAspectRatio="none" aria-hidden="true"><path ref={circulo} pathLength={1} d={RABISCOS[1]} /></svg>}
        </span>
        {marca && (
          <span ref={rel} className={`dia-rel${virada ? ' virada' : ''}`} data-virada={virada}>
            {marca}
          </span>
        )}
      </div>
    </div>
  );
}

/** O "voltar para hoje", com o lugar guardado: entra e sai deslizando 10px no sentido em que a agenda andou
    (`sentido`: 1 para a frente, -1 para trás), com opacidade. Com `abreVaga` (o computador, onde ele fica entre os
    outros links), o lugar não fica guardado: ele abre e fecha a vaga de lado enquanto desliza. */
export function VoltarParaHoje({ ver, sentido, voltar, abreVaga = false }: { ver: boolean; sentido: number; voltar: () => void; abreVaga?: boolean }) {
  const el = useRef<HTMLButtonElement>(null);
  const primeira = useRef(true);
  useLayoutEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const e = el.current;
    if (!e || semMovimento()) return;
    // o conteúdo andou para o lado contrário do sentido; o botão anda junto com ele
    const d = 10 * sentido;
    const a = e.animate(
      ver
        ? [{ opacity: 0, transform: `translateX(${d}px)` }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 1, transform: 'none', visibility: 'visible' }, { opacity: 0, transform: `translateX(${-d}px)`, visibility: 'visible' }],
      { duration: 220, easing: SUAVE },
    );
    return () => a.cancel();
    // o sentido vem junto com a troca: só ela anima
  }, [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const botao = (
    <button ref={el} type="button" className={`botao-texto voltar-hoje ${ver ? '' : 'fora'}`} onClick={voltar}>
      voltar para hoje
    </button>
  );
  return abreVaga ? (
    <ItemQueAbre ver={ver} classe="ct-voltar">
      {botao}
    </ItemQueAbre>
  ) : (
    botao
  );
}
