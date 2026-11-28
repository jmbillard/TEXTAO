import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from './icones';
import { semMovimento } from './util';

/* A caixinha do desfazer, uma só em todas as telas (#171): a caixinha preta embaixo, no meio da janela, com a frase do
   que acabou de acontecer, o "Desfazer" em texto sublinhado e o × que fecha. Fica 8 s à vista (também onde a ação vai
   ao Trello ou ao Teable), com o trilho do tempo embaixo encolhendo até o fim; no fim do prazo, ou no ×, chama
   `fechar`. Sobe com o `surgir` e desce esmaecendo. Vai para o corpo da página, por cima do card aberto. */

/** Quanto tempo a caixinha fica à vista, esperando o desfazer. */
export const PRAZO_DO_DESFAZER = 8000;
/** A descida da caixinha ao fechar. */
const SAIDA_MS = 180;

/** A caixinha aberta: `id` novo a cada abertura (o prazo e o trilho recomeçam). */
export interface Desfazivel {
  id: string | number;
  texto: ReactNode;
  desfazer: () => void;
  /** O ×, e o fim do prazo. */
  fechar: () => void;
  /** Desfazendo: o botão diz "Desfazendo…" e o prazo para. */
  ocupado?: boolean;
}

/** A caixinha do desfazer; `caixinha` nula fecha (com a descida). */
export function CaixinhaDoDesfazer({ caixinha, className = '' }: { caixinha: Desfazivel | null; className?: string }) {
  // a última aberta continua à vista enquanto desce
  const ultima = useRef<{ c: Desfazivel; className: string } | null>(null);
  if (caixinha) ultima.current = { c: caixinha, className };
  const saindo = !caixinha && !!ultima.current;
  const [, redesenhar] = useState(0);
  useEffect(() => {
    if (!saindo) return;
    const t = setTimeout(() => ((ultima.current = null), redesenhar((n) => n + 1)), semMovimento() ? 0 : SAIDA_MS);
    return () => clearTimeout(t);
  }, [saindo]);
  // o prazo: recomeça a cada abertura e para enquanto desfaz
  const fechar = useRef(caixinha?.fechar);
  fechar.current = caixinha?.fechar;
  const id = caixinha?.id;
  const ocupado = !!caixinha?.ocupado;
  useEffect(() => {
    if (id === undefined || ocupado) return;
    const t = setTimeout(() => fechar.current?.(), PRAZO_DO_DESFAZER);
    return () => clearTimeout(t);
  }, [id, ocupado]);
  const mostrada = ultima.current;
  if (!mostrada || typeof document === 'undefined') return null;
  const { c } = mostrada;
  return createPortal(
    <div key={c.id} className={`desfazer${saindo ? ' saindo' : ''} ${mostrada.className}`.trim()} role="status" inert={saindo || undefined}>
      <span className="desfazer-texto">{c.texto}</span>
      <button type="button" className="botao-texto desfazer-botao" disabled={c.ocupado} onClick={c.desfazer}>
        {c.ocupado ? 'Desfazendo…' : 'Desfazer'}
      </button>
      <button type="button" className="desfazer-fechar" aria-label="Fechar" onClick={c.fechar}>
        <Icone nome="fechar" tam={14} traco={2} />
      </button>
      {/* o trilho do tempo: recomeça quando o prazo recomeça (depois de um desfazer que não deu) */}
      <i key={String(c.ocupado)} className={`desfazer-trilho${c.ocupado ? ' parado' : ''}`} style={{ animationDuration: `${PRAZO_DO_DESFAZER}ms` }} aria-hidden="true" />
    </div>,
    document.body,
  );
}

type Pendente = { id: string; executar: () => Promise<void> };

/* O desfazer adiado dos Cadastros e das Pessoas (#176): o que se apaga, remove ou ignora some na hora (a vaga fecha), a
   caixinha oferece desfazer e só no fim do prazo (ou no ×) vai para o servidor. Outra ação no meio executa a anterior
   na hora; sair da tela não cancela (o que foi apagado é apagado). */
export function useDesfazerAdiado() {
  // o que sumiu da lista e ainda não foi para o servidor (ou está indo)
  const [escondidos, setEscondidos] = useState<string[]>([]);
  const [aberto, setAberto] = useState<{ texto: ReactNode; id: string } | null>(null);
  const pendente = useRef<Pendente | null>(null);
  /** Executa já o que estava esperando o desfazer (o fim do prazo, o ×, outra ação, ou a tela vai fechar). */
  const concluir = () => {
    const p = pendente.current;
    if (!p) return;
    pendente.current = null;
    setAberto(null);
    void p.executar().finally(() => setEscondidos((l) => l.filter((x) => x !== p.id)));
  };
  /** Some com `id` na hora e oferece desfazer; sem desfazer, `executar` vai para o servidor no fim do prazo. */
  const comDesfazer = (id: string, texto: ReactNode, executar: () => Promise<void>) => {
    concluir();
    setEscondidos((l) => [...l, id]);
    setAberto({ texto, id });
    pendente.current = { id, executar };
  };
  /** O Desfazer da caixinha: nada vai para o servidor e a vaga abre de novo. */
  const desfazerAgora = () => {
    const p = pendente.current;
    if (!p) return;
    pendente.current = null;
    setAberto(null);
    setEscondidos((l) => l.filter((x) => x !== p.id));
  };
  // sair da tela não cancela: o que foi apagado é apagado
  useEffect(
    () => () => {
      const p = pendente.current;
      if (p) void p.executar();
    },
    [],
  );
  const desfazer: Desfazivel | null = aberto && { id: aberto.id, texto: aberto.texto, desfazer: desfazerAgora, fechar: concluir };
  return { escondidos, desfazer, comDesfazer, desfazerAgora, concluir };
}
