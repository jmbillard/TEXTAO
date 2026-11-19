import { useEffect, useRef, useState } from 'react';
import { Cursor, cursorDe } from './cursores';

/* Ponteiros do mouse dos colegas que estão na mesma tela.
   A posição é guardada em relação a um pedaço da tela marcado com data-ancora (uma ficha, a folha, a claquete),
   e não em pixels da janela: assim o ponteiro cai no mesmo lugar mesmo com telas de tamanhos diferentes. */

export interface PosicaoPonteiro {
  ancora: string;
  fx: number;
  fy: number;
  /** Em cima do texto: a posição no documento e a distância, em px, até a letra. Mais preciso que a fração. */
  pos?: number;
  dx?: number;
  dy?: number;
}
export interface PonteiroDeAlguem {
  email: string;
  nome: string;
  cor: string;
  /** O desenho que a pessoa escolheu (ou ganhou no sorteio). */
  cursor?: string;
  p: PosicaoPonteiro;
}

/** Onde está o meu ponteiro, em relação ao pedaço da tela sob ele. */
export function lerPosicao(e: PointerEvent | React.PointerEvent): PosicaoPonteiro | null {
  const alvo = (e.target as Element | null)?.closest?.('[data-ancora]') as HTMLElement | null;
  if (!alvo) return null;
  const r = alvo.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const arred = (v: number) => Math.round(v * 1000) / 1000;
  return { ancora: alvo.dataset.ancora!, fx: arred((e.clientX - r.left) / r.width), fy: arred((e.clientY - r.top) / r.height) };
}

/** Manda a posição do meu ponteiro no máximo 20 vezes por segundo, e avisa quando ele sai da tela. */
export function useMeuPonteiro(enviar: ((p: PosicaoPonteiro | null) => void) | null, refinar?: (e: PointerEvent, p: PosicaoPonteiro) => PosicaoPonteiro) {
  const refinarRef = useRef(refinar);
  refinarRef.current = refinar;
  const ultimo = useRef(0);
  const pendente = useRef<PosicaoPonteiro | null>(null);
  const prazo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!enviar || window.matchMedia?.('(pointer: coarse)').matches) return; // no celular não há ponteiro para mostrar
    const mandar = () => {
      ultimo.current = Date.now();
      enviar(pendente.current);
    };
    const mover = (e: PointerEvent) => {
      const p = lerPosicao(e);
      pendente.current = p && refinarRef.current ? refinarRef.current(e, p) : p;
      const falta = 50 - (Date.now() - ultimo.current);
      clearTimeout(prazo.current);
      if (falta <= 0) mandar();
      else prazo.current = setTimeout(mandar, falta);
    };
    const sair = () => {
      clearTimeout(prazo.current);
      pendente.current = null;
      enviar(null);
    };
    const visibilidade = () => document.hidden && sair();
    window.addEventListener('pointermove', mover, { passive: true });
    document.documentElement.addEventListener('pointerleave', sair);
    window.addEventListener('blur', sair);
    document.addEventListener('visibilitychange', visibilidade);
    return () => {
      clearTimeout(prazo.current);
      window.removeEventListener('pointermove', mover);
      document.documentElement.removeEventListener('pointerleave', sair);
      window.removeEventListener('blur', sair);
      document.removeEventListener('visibilitychange', visibilidade);
      enviar(null);
    };
  }, [enviar]);
}

/** Desenha os ponteiros. Acompanha a rolagem e o tamanho da janela; quem fica parado 20 s some. */
export function Ponteiros({ lista, resolver }: { lista: PonteiroDeAlguem[]; resolver?: (p: PosicaoPonteiro) => { x: number; y: number } | null }) {
  const [, redesenhar] = useState(0);
  const [agora, setAgora] = useState(Date.now());
  const vistos = useRef(new Map<string, { chave: string; quando: number }>());
  useEffect(() => {
    if (!lista.length) return;
    let quadro = 0;
    const pedir = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => redesenhar((n) => n + 1));
    };
    window.addEventListener('scroll', pedir, { passive: true, capture: true });
    window.addEventListener('resize', pedir);
    const relogio = setInterval(() => setAgora(Date.now()), 5000);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('scroll', pedir, { capture: true });
      window.removeEventListener('resize', pedir);
      clearInterval(relogio);
    };
  }, [lista.length]);

  return (
    <div className="ponteiros" aria-hidden="true">
      {lista.map((a) => {
        const chave = `${a.p.ancora}|${a.p.fx}|${a.p.fy}|${a.p.pos}|${a.p.dx}|${a.p.dy}`;
        const visto = vistos.current.get(a.email);
        if (!visto || visto.chave !== chave) vistos.current.set(a.email, { chave, quando: Date.now() });
        const parado = agora - (vistos.current.get(a.email)?.quando ?? agora) > 20_000;
        const exato = resolver?.(a.p);
        const alvo = exato ? null : document.querySelector<HTMLElement>(`[data-ancora="${CSS.escape(a.p.ancora)}"]`);
        if (!exato && !alvo) return null;
        const r = alvo?.getBoundingClientRect();
        const x = exato ? exato.x : r!.left + a.p.fx * r!.width;
        const y = exato ? exato.y : r!.top + a.p.fy * r!.height;
        return (
          <div key={a.email} className={`ponteiro ${parado ? 'parado' : ''}`} style={{ transform: `translate(${x}px, ${y}px)`, '--cor': a.cor } as React.CSSProperties}>
            <Cursor id={a.cursor ?? cursorDe(a.email)} cor={a.cor} />
            <span>{a.nome.split(/\s+/)[0]}</span>
          </div>
        );
      })}
    </div>
  );
}
