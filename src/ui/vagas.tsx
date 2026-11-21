import { useEffect, useLayoutEffect, useReducer, useRef, type ReactNode } from 'react';

/* Vagas: o que entra ou sai de uma lista abre ou fecha o seu espaço, em vez de aparecer ou sumir de estalo.
   Quem sai continua desenhado no lugar onde estava enquanto a vaga fecha; quem volta (desfazer) abre a vaga de novo.
   Mudanças grandes de uma vez (trocar de aba, uma busca que muda a lista inteira) não animam: o olho não acompanha
   dezenas de vagas e o navegador também não. */

export const DURACAO_VAGA = 280;
const MAX_ANIMADAS = 12;

type Estado = '' | 'entrando' | 'saindo';
export interface ItemVaga<T> {
  k: string;
  item: T;
  estado: Estado;
}

export function useVagas<T>(itens: T[], chave: (x: T) => string): ItemVaga<T>[] {
  const [, tique] = useReducer((n: number) => n + 1, 0);
  const exibidos = useRef<{ k: string; item: T }[]>([]);
  const saindoDesde = useRef(new Map<string, number>());
  const entrou = useRef(new Set<string>());
  const montado = useRef(false);

  const agora = performance.now();
  const lista: ItemVaga<T>[] = itens.map((item) => ({ k: chave(item), item, estado: '' }));
  const vivos = new Set(lista.map((x) => x.k));
  const anteriores = exibidos.current;
  const conhecidos = new Set(anteriores.map((x) => x.k));
  const novos = lista.filter((x) => !conhecidos.has(x.k)).length;
  const sairiam = anteriores.filter((x) => !vivos.has(x.k)).length;
  const animar = montado.current && novos + sairiam <= MAX_ANIMADAS;

  if (animar) {
    // quem saiu fica onde estava: logo depois do vizinho de cima que ainda aparece
    anteriores.forEach((x, i) => {
      if (vivos.has(x.k)) return;
      let desde = saindoDesde.current.get(x.k);
      if (desde === undefined) {
        desde = agora;
        saindoDesde.current.set(x.k, agora);
      }
      if (agora - desde > DURACAO_VAGA) return;
      let pos = 0;
      for (let j = i - 1; j >= 0; j--) {
        const idx = lista.findIndex((y) => y.k === anteriores[j].k);
        if (idx >= 0) {
          pos = idx + 1;
          break;
        }
      }
      lista.splice(pos, 0, { k: x.k, item: x.item, estado: 'saindo' });
    });
  }
  for (const x of lista) {
    if (x.estado === 'saindo') continue;
    if (animar && (!conhecidos.has(x.k) || saindoDesde.current.has(x.k))) entrou.current.add(x.k);
    if (entrou.current.has(x.k)) x.estado = 'entrando';
  }

  useLayoutEffect(() => {
    montado.current = true;
    exibidos.current = lista.map(({ k, item }) => ({ k, item }));
    const naTela = new Set(lista.map((x) => x.k));
    for (const k of vivos) saindoDesde.current.delete(k);
    for (const [k, t] of saindoDesde.current) if (!naTela.has(k) || performance.now() - t > DURACAO_VAGA) saindoDesde.current.delete(k);
    for (const k of entrou.current) if (!naTela.has(k)) entrou.current.delete(k);
  });
  const temSaindo = lista.some((x) => x.estado === 'saindo');
  useEffect(() => {
    if (!temSaindo) return;
    const t = setTimeout(tique, DURACAO_VAGA + 30);
    return () => clearTimeout(t);
  });
  return lista;
}

/** Lista com vagas animadas. eixo "y" para linhas (a altura abre e fecha), "x" para chips lado a lado (a largura). */
export function Vagas<T>({ itens, chave, children, eixo = 'y', como }: { itens: T[]; chave: (x: T) => string; children: (x: T) => ReactNode; eixo?: 'x' | 'y'; como?: 'li' | 'div' | 'span' }) {
  const lista = useVagas(itens, chave);
  const Tag = como ?? (eixo === 'x' ? 'span' : 'div');
  return (
    <>
      {lista.map((x) => (
        <Tag key={x.k} className={`vaga-${eixo} ${x.estado}`} aria-hidden={x.estado === 'saindo' || undefined} inert={x.estado === 'saindo' || undefined}>
          {eixo === 'x' ? <span className="vaga-dentro">{children(x.item)}</span> : <div className="vaga-dentro">{children(x.item)}</div>}
        </Tag>
      ))}
    </>
  );
}
