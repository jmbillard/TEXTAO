import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { duracaoDoPeriodo, periodoNaContagem, valorNaContagem } from './fila';
import { semMovimento } from './util';

/* O topo da agenda no celular (#41): o período do seletor, o resumo dos dias à vista e o "voltar para hoje". Quando a
   faixa para, os números contam do valor antigo até o novo, a prioridade se escreve à mão e o "voltar para hoje"
   desliza no sentido em que a agenda andou. Nada disso acontece no meio do arrasto: quem decide quando o topo muda é
   o useFaixa (só quando a rolagem termina). Com o movimento reduzido, tudo é só a troca.

   Todo o movimento roda no relógio das animações da página (Web Animations), nunca em temporizadores nem no horário do
   quadro: assim nada salta quando a página desacelera as animações (o CDP, nos quadros em câmera lenta). */

/** A curva --suave dos estilos, para as animações feitas daqui. */
const SUAVE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const CONTA_RESUMO_MS = 360;

/** Uma contagem em andamento: de onde, para onde e em que instante (de 0 a 1). Parada, `de` e `para` são o alvo. */
export interface Contagem {
  de: number;
  para: number;
  p: number;
}

/** Conta até `alvo` sempre que ele muda, partindo do valor que estava à vista (uma contagem interrompida continua de
    onde estava), em `duracao(de, para)` ms. Na primeira vez, e com o movimento reduzido, só troca. */
function useContagem(alvo: number, duracao: (de: number, para: number) => number): Contagem {
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

/** Um item que abre a vaga de lado ao aparecer e a fecha ao sair, com opacidade, sem a linha pular. Enquanto fecha,
    continua mostrando o que tinha; fechado, sai da página. Na primeira vez, e com o movimento reduzido, só troca. */
function ItemQueAbre({ ver, classe, ms = 300, opacidadeMs = 200, children }: { ver: boolean; classe: string; ms?: number; opacidadeMs?: number; children: ReactNode }) {
  const [montado, setMontado] = useState(ver);
  const ultimo = useRef(children);
  if (ver) ultimo.current = children;
  const el = useRef<HTMLSpanElement>(null);
  const animacoes = useRef<Animation[]>([]);
  // o elemento que já estava na tela: o que acabou de entrar abre do zero
  const naTela = useRef<HTMLSpanElement | null>(null);
  const primeira = useRef(true);
  if (ver && !montado) setMontado(true);
  useLayoutEffect(() => {
    const e = el.current;
    const novo = naTela.current !== e;
    naTela.current = e;
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    if (!e) return;
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

/** O número que conta, com algarismos de largura fixa, e a palavra que acompanha o número à vista ("1 card", "2 cards"). */
function NumeroQueConta({ valor, um, varios }: { valor: number; um: string; varios: string }) {
  const c = useContagem(valor, () => CONTA_RESUMO_MS);
  const v = valorNaContagem(c.de, c.para, c.p);
  return (
    <>
      <span className="ct-num">{v}</span> {v === 1 ? um : varios}
    </>
  );
}

/** A escrita à mão: o traço aparece da esquerda para a direita, como a caneta. */
const escrever = (e: HTMLElement) =>
  e.animate([{ clipPath: 'inset(-40% 100% -40% -8%)' }, { clipPath: 'inset(-40% -8% -40% -8%)' }], { duration: 360, easing: 'cubic-bezier(0.45, 0, 0.3, 1)', fill: 'backwards' });

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
      {mostrado} prioridade
    </span>
  );
}

/** O resumo dos dias à vista: "4 cards · 1 entregue · 1 prioridade". Os números contam; os itens que aparecem ou
    somem abrem ou fecham a vaga; a prioridade se escreve. */
export function ResumoQueConta({ total, entregues, comPrioridade }: { total: number; entregues: number; comPrioridade: number }) {
  const montado = useRef(false);
  useEffect(() => {
    montado.current = true;
  }, []);
  return (
    <span>
      <span className="ct-item">
        <NumeroQueConta valor={total} um="card" varios="cards" />
      </span>
      <ItemQueAbre ver={entregues > 0} classe="ct-entregues">
        {' · '}
        <NumeroQueConta valor={entregues} um="entregue" varios="entregues" />
      </ItemQueAbre>
      <ItemQueAbre ver={comPrioridade > 0} classe="ct-prio" ms={220} opacidadeMs={130}>
        {' · '}
        <PrioridadeAMao n={comPrioridade} escreverAoAparecer={montado.current} />
      </ItemQueAbre>
    </span>
  );
}

/** O maior período que o seletor escreve: a largura dele, fixa, para as setas nunca se mexerem. */
const MAIOR_PERIODO = '<span class="p-dia p-d1">30</span><span class="p-mes">/12</span> – <span class="p-dia p-d2">31</span><span class="p-mes">/12</span>';

/** O período do seletor ("25 – 26/11"): os dias contam até os novos; na virada do mês, os meses somem no começo e
    voltam no fim, e o "/11" da esquerda abre ou fecha a vaga só no fim. A largura é a do maior período. */
export function PeriodoQueConta({ isos, k }: { isos: string[]; k: number }) {
  const contagem = useContagem(k, (de, para) => duracaoDoPeriodo(isos, de, para));
  // na renderização em que os dias à vista mudam, a contagem já começa (parada no instante zero): os meses começam a
  // apagar antes de o relógio andar, e os dias só contam depois que eles somem
  const c = contagem.para === k ? contagem : { de: valorNaContagem(contagem.de, contagem.para, contagem.p), para: k, p: 0 };
  const { dia1, mes1, dia2, mes2, mesesApagados } = periodoNaContagem(isos, c.de, c.para, c.p);
  const el = useRef<HTMLElement>(null);
  const [largura, setLargura] = useState<number>();
  useLayoutEffect(() => {
    const medir = () => {
      const b = el.current;
      if (!b?.parentElement) return;
      const copia = b.cloneNode(false) as HTMLElement;
      copia.removeAttribute('style');
      Object.assign(copia.style, { position: 'absolute', visibility: 'hidden', width: 'auto', minWidth: '0' });
      copia.innerHTML = MAIOR_PERIODO;
      b.parentElement.appendChild(copia);
      setLargura(Math.ceil(copia.getBoundingClientRect().width) + 2);
      copia.remove();
    };
    medir();
    // a letra pode chegar depois: mede de novo
    let vivo = true;
    void document.fonts?.ready.then(() => vivo && medir());
    return () => {
      vivo = false;
    };
  }, []);
  const apagado = mesesApagados ? ' apagado' : '';
  return (
    <b ref={el} style={largura ? { width: largura } : undefined}>
      <span className="p-dia p-d1">{dia1}</span>
      <ItemQueAbre ver={!!mes1} classe="p-m1">
        <span className={`p-mes${apagado}`}>{mes1}</span>
      </ItemQueAbre>
      {' – '}
      <span className="p-dia p-d2">{dia2}</span>
      <span className={`p-mes${apagado}`}>{mes2}</span>
    </b>
  );
}

/** O "voltar para hoje", com o lugar guardado: entra e sai deslizando 10px no sentido em que a agenda andou
    (`sentido`: 1 para a frente, -1 para trás), com opacidade. */
export function VoltarParaHoje({ ver, sentido, voltar }: { ver: boolean; sentido: number; voltar: () => void }) {
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
  return (
    <button ref={el} type="button" className={`botao-texto voltar-hoje ${ver ? '' : 'fora'}`} onClick={voltar}>
      voltar para hoje
    </button>
  );
}
