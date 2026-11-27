import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { abrirSala, corDe, iniciais, nomesCurtos, primeiroNome, type Presente, type Sala } from '../dados/colaboracao';
import type { Pessoa } from '../modelo/tipos';

/* Montar a pauta: duas pessoas ao mesmo tempo (#131). A sala do dia é a mesma sala de colaboração do editor de
   roteiros (src/dados/colaboracao.ts), com o id `montar-AAAA-MM-DD`: a presença diz quem mais está no dia e em que
   campo; o documento compartilhado só traz `dia.versao`, a versão nova toda vez que alguém muda o dia no servidor (a
   tela lê o dia de novo e junta com o que tem, src/modelo/juntarODia.ts). Ninguém fica bloqueado: o campo em que a
   outra pessoa está ganha um contorno da cor dela e o primeiro nome, e continua livre para digitar. */

/** O campo em que alguém está: o de uma posição (com a linha, nas demandas e nos avisos) ou o recado do dia. */
export interface CampoNoDia {
  posicao?: string;
  campo: string;
  demanda?: string;
  aviso?: string;
}
export interface OutroNoDia extends Presente {
  campo: CampoNoDia | null;
}

const MONTAR = 'montar';
/** O campo do elemento focado, pelos data-* que a grade já usa para o foco (data-posicao, data-campo…). */
export function campoDoElemento(el: Element | null): CampoNoDia | null {
  const alvo = el?.closest<HTMLElement>('[data-campo]');
  if (!alvo) return null;
  const { posicao, campo = '', demanda, aviso } = alvo.dataset;
  return { campo, ...(posicao ? { posicao } : {}), ...(demanda ? { demanda } : {}), ...(aviso ? { aviso } : {}) };
}
const seletorDoCampo = (c: CampoNoDia) =>
  `[data-campo="${c.campo}"]${c.posicao ? `[data-posicao="${c.posicao}"]` : ''}${c.demanda ? `[data-demanda="${c.demanda}"]` : ''}${c.aviso ? `[data-aviso="${c.aviso}"]` : ''}`;

/**
 * Entra na sala do dia (sai ao trocar de dia ou de tela).
 * @param versaoNova chamada com a versão que a sala avisou (a tela decide se precisa ler o dia de novo)
 * @returns quem mais está no dia (sem a própria pessoa, nem a outra aba dela) e `estarEm`, que diz à sala o campo
 *   em que a pessoa está (null: em nenhum)
 */
export function useSalaDoDia(dia: string | null, eu: Pessoa | undefined, versaoNova: (versao: number) => void) {
  const [outros, setOutros] = useState<OutroNoDia[]>([]);
  const sala = useRef<Sala | null>(null);
  const aviso = useRef(versaoNova);
  aviso.current = versaoNova;
  const email = eu?.email ?? '';
  const nome = eu?.nome ?? '';
  useEffect(() => {
    if (!dia) return;
    const s = abrirSala(`${MONTAR}-${dia}`);
    sala.current = s;
    const mapa = s.doc.getMap('dia');
    const aoMudarPresenca = () => {
      const vistos = new Map<string, OutroNoDia>();
      s.provedor.awareness.getStates().forEach((estado, cliente) => {
        const { user: u, campo } = estado as { user?: { name?: string; email?: string; color?: string }; campo?: CampoNoDia | null };
        if (!u?.email || u.email === email || cliente === s.doc.clientID) return;
        vistos.set(u.email, { nome: u.name ?? u.email, email: u.email, cor: u.color ?? corDe(u.email), campo: campo ?? null });
      });
      const novo = [...vistos.values()];
      setOutros((antes) => (JSON.stringify(antes) === JSON.stringify(novo) ? antes : novo));
    };
    const aoMudarDia = () => {
      const v = mapa.get('versao');
      if (typeof v === 'number') aviso.current(v);
    };
    s.provedor.awareness.on('change', aoMudarPresenca);
    mapa.observe(aoMudarDia);
    s.provedor.awareness.setLocalStateField('user', { name: nome || 'Alguém', email, color: corDe(email) });
    s.provedor.connect();
    return () => {
      s.provedor.awareness.off('change', aoMudarPresenca);
      mapa.unobserve(aoMudarDia);
      s.provedor.disconnect();
      s.provedor.destroy();
      s.doc.destroy();
      sala.current = null;
      setOutros([]);
    };
  }, [dia, email, nome]);
  const estarEm = useCallback((campo: CampoNoDia | null) => {
    const s = sala.current;
    if (!s) return;
    const agora = s.provedor.awareness.getLocalState()?.campo ?? null;
    if (JSON.stringify(agora) !== JSON.stringify(campo)) s.provedor.awareness.setLocalStateField('campo', campo);
  }, []);
  return { outros, estarEm };
}

/** Quem mais está montando o dia: as bolinhas (como no editor) e "Ana também está neste dia". */
export function QuemMaisEsta({ outros }: { outros: readonly OutroNoDia[] }) {
  if (!outros.length) return null;
  return (
    <p className="juntos-no-dia" role="status">
      <span className="presentes" aria-hidden="true">
        {outros.slice(0, 4).map((x) => (
          <span key={x.email} className="presente" style={{ background: x.cor }} title={`${x.nome} está neste dia`}>
            {iniciais(x.nome)}
          </span>
        ))}
        {outros.length > 4 && <span className="presente mais">+{outros.length - 4}</span>}
      </span>
      <span>
        {nomesCurtos([...outros])} também {outros.length === 1 ? 'está' : 'estão'} montando este dia
      </span>
    </p>
  );
}

/**
 * O campo de cada outra pessoa, marcado por cima da tela: um contorno da cor dela em volta do campo e o primeiro
 * nome em cima. Não pega o clique: o campo continua livre.
 * @param dentro o elemento com `position: relative` em que as marcas são postas
 * @param versao muda quando a tela redesenha (as posições), para as marcas acompanharem
 */
export function MarcasDosOutros({ outros, dentro, versao }: { outros: readonly OutroNoDia[]; dentro: RefObject<HTMLElement | null>; versao: unknown }) {
  const [marcas, setMarcas] = useState<{ email: string; nome: string; cor: string; x: number; y: number; w: number; h: number }[]>([]);
  const medir = useCallback(() => {
    const raiz = dentro.current;
    if (!raiz) return setMarcas([]);
    const r0 = raiz.getBoundingClientRect();
    const novas = outros.flatMap((o) => {
      const el = o.campo ? raiz.querySelector<HTMLElement>(seletorDoCampo(o.campo)) : null;
      if (!el) return [];
      const r = el.getBoundingClientRect();
      return [{ email: o.email, nome: primeiroNome(o.nome), cor: o.cor, x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height }];
    });
    setMarcas((antes) => (JSON.stringify(antes) === JSON.stringify(novas) ? antes : novas));
  }, [outros, dentro]);
  useLayoutEffect(() => medir(), [medir, versao]);
  useEffect(() => {
    window.addEventListener('resize', medir);
    // a grade muda de altura sem a tela redesenhar (a lista do editor abre, a leitura da claquete aparece)
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(() => medir()) : null;
    if (dentro.current) obs?.observe(dentro.current);
    return () => {
      window.removeEventListener('resize', medir);
      obs?.disconnect();
    };
  }, [medir, dentro]);
  return (
    <>
      {marcas.map((m) => (
        <span key={m.email} className="marca-do-outro" aria-hidden="true" style={{ left: m.x - 3, top: m.y - 3, width: m.w + 6, height: m.h + 6, ['--cor-do-outro' as string]: m.cor }}>
          <span className="marca-do-outro-nome">{m.nome}</span>
        </span>
      ))}
    </>
  );
}
