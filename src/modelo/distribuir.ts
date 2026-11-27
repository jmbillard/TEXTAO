/* Montar a pauta, a coluna lateral (#126): as regras puras de arrastar, as mesmas no servidor e no navegador (só
   sintaxe que o Node apaga), e a de distribuir sozinho (#151, no fim). Nenhuma muda a lista recebida: cada uma devolve
   as posições novas, ou null quando o que foi pedido não existe mais (a demanda, a posição). */
import { nomeSemArtigos } from './correcaoDeGrafia.ts';
import { lerDemanda, type DemandaDaEscala, type PosicaoDaEscala } from './escala.ts';
import { nomeComparavel } from './ligarPeloNome.ts';
import type { DemandaParaDistribuir } from './ausencias.ts';

/** A lista escrita ou colada em "Para distribuir": uma claquete por linha, sem as vazias e sem os espaços das pontas. */
export const linhasParaDistribuir = (texto: string): string[] =>
  texto
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

/** Põe a demanda na posição, antes de `antesDe` (uma demanda dela) ou no fim. */
export function acrescentarDemanda(posicoes: readonly PosicaoDaEscala[], posicao: string, demanda: DemandaDaEscala, antesDe: string | null = null): PosicaoDaEscala[] | null {
  if (!posicoes.some((p) => p.id === posicao)) return null;
  return posicoes.map((p) => {
    if (p.id !== posicao) return p;
    const onde = antesDe ? p.demandas.findIndex((d) => d.id === antesDe) : -1;
    const i = onde >= 0 ? onde : p.demandas.length;
    return { ...p, demandas: [...p.demandas.slice(0, i), demanda, ...p.demandas.slice(i)] };
  });
}

/** Tira a demanda da posição em que está: as posições sem ela, a demanda e de quem ela era ('' na vaga). */
export function tirarDemanda(posicoes: readonly PosicaoDaEscala[], demanda: string): { posicoes: PosicaoDaEscala[]; demanda: DemandaDaEscala; de: string } | null {
  const dona = posicoes.find((p) => p.demandas.some((d) => d.id === demanda));
  if (!dona) return null;
  return {
    posicoes: posicoes.map((p) => (p === dona ? { ...p, demandas: p.demandas.filter((d) => d.id !== demanda) } : p)),
    demanda: dona.demandas.find((d) => d.id === demanda)!,
    de: dona.editor,
  };
}

/** Move a demanda para a posição (pode ser a mesma), antes de `antesDe` ou no fim. */
export function moverDemanda(posicoes: readonly PosicaoDaEscala[], demanda: string, posicao: string, antesDe: string | null = null): PosicaoDaEscala[] | null {
  if (antesDe === demanda) return posicoes.slice();
  const tirada = tirarDemanda(posicoes, demanda);
  return tirada && acrescentarDemanda(tirada.posicoes, posicao, tirada.demanda, antesDe);
}

/** Onde escalar: numa posição que já existe (a vaga, ou no lugar de quem está nela) ou numa posição nova do turno. */
export type AlvoDeEscalar = { posicao: string } | { turno: string; nova: PosicaoDaEscala };

/** Escala o editor: na posição do alvo, ou na posição nova, depois da última do turno. */
export function escalarNa(posicoes: readonly PosicaoDaEscala[], editor: string, alvo: AlvoDeEscalar): PosicaoDaEscala[] | null {
  if ('posicao' in alvo) {
    if (!posicoes.some((p) => p.id === alvo.posicao)) return null;
    return posicoes.map((p) => (p.id === alvo.posicao ? { ...p, editor } : p));
  }
  const nova = { ...alvo.nova, turno: alvo.turno, editor };
  const ultima = posicoes.map((p) => p.turno).lastIndexOf(alvo.turno);
  const onde = ultima >= 0 ? ultima + 1 : posicoes.length;
  return [...posicoes.slice(0, onde), nova, ...posicoes.slice(onde)];
}

/**
 * Quem está "Sem escala" no dia: os editores cadastrados que não estão em nenhuma posição e não estão fora (pelo nome
 * sem caixa, acento e pontuação), na ordem da lista.
 */
export function semEscala(editores: readonly string[], posicoes: readonly Pick<PosicaoDaEscala, 'editor'>[], fora: readonly string[]): string[] {
  const ocupados = new Set([...posicoes.map((p) => p.editor), ...fora].map(nomeComparavel).filter(Boolean));
  return editores.filter((e) => !ocupados.has(nomeComparavel(e)));
}

/* ---------- distribuir sozinho (#151) ---------- */

/** Quantos dias antes do dia montado contam para a continuidade. */
export const DIAS_DA_CONTINUIDADE = 14;

/** Uma claquete do histórico: o editor pegou a atração naquele dia (AAAA-MM-DD). */
export interface PegouAAtracao {
  dia: string;
  editor: string;
  atracao: string;
}

/** Uma claquete que a distribuição pôs numa posição, com de quem era antes (para o desfazer) e o motivo da escolha. */
export interface ClaqueteDistribuida extends DemandaParaDistribuir {
  posicao: string;
  editor: string;
  /** "pegou a atração em 25/11", "menos demandas", "sorteio" */
  motivo: string;
}

interface PedidoDeDistribuir {
  /** o dia que está sendo montado (AAAA-MM-DD) */
  dia: string;
  posicoes: readonly PosicaoDaEscala[];
  /** o que está em "Para distribuir", na ordem */
  itens: readonly DemandaParaDistribuir[];
  /** as claquetes da pauta antes do dia; só contam as dos DIAS_DA_CONTINUIDADE dias antes dele */
  historico: readonly PegouAAtracao[];
  /** quem está fora no dia (ausência): nunca recebe, mesmo escalado */
  fora: readonly string[];
  /** o sorteio, um número em [0, 1) como o Math.random; o teste o fixa */
  sortear: () => number;
}

const diasEntre = (antes: string, depois: string) => Math.round((Date.parse(`${depois}T12:00:00Z`) - Date.parse(`${antes}T12:00:00Z`)) / 86_400_000);
const diaEMes = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const cheias = (p: PosicaoDaEscala) => p.demandas.filter((d) => d.texto.trim()).length;

/**
 * Distribui as claquetes de "Para distribuir" nos editores escalados do dia, uma a uma, na ordem da lista. Para cada
 * uma, o editor sai, nesta ordem:
 * 1. da continuidade: quem pegou a atração (pelo nome sem caixa, acento e artigos) nos 14 dias antes do dia; cada dia
 *    em que pegou soma um peso que cresce com a proximidade (o dia anterior vale 14; o de 14 dias antes, 1);
 * 2. da carga: no empate, ou sem ninguém com a atração, quem tem menos demandas no dia, contando as que a própria
 *    distribuição já pôs;
 * 3. do sorteio, entre os que ainda empatam.
 * Só recebe quem está escalado numa posição e não está fora. O editor com duas posições recebe na que tem menos
 * demandas (no empate, a primeira). Sem ninguém para receber, nada muda e tudo sobra.
 */
export function distribuirAsClaquetes({ dia, posicoes, itens, historico, fora, sortear }: PedidoDeDistribuir): { posicoes: PosicaoDaEscala[]; distribuidas: ClaqueteDistribuida[]; sobraram: DemandaParaDistribuir[] } {
  const foraDoDia = new Set(fora.map(nomeComparavel));
  const editores = [...new Set(posicoes.map((p) => nomeComparavel(p.editor)).filter((e) => e && !foraDoDia.has(e)))];
  if (!editores.length) return { posicoes: posicoes.slice(), distribuidas: [], sobraram: [...itens] };
  // a continuidade: o peso de cada editor em cada atração e o dia mais recente em que a pegou
  const continuidade = new Map<string, Map<string, { peso: number; ultimo: string }>>();
  const contados = new Set<string>();
  for (const h of historico) {
    const longe = diasEntre(h.dia, dia);
    const atracao = nomeSemArtigos(h.atracao);
    const editor = nomeComparavel(h.editor);
    const chave = `${h.dia}|${editor}|${atracao}`;
    if (longe < 1 || longe > DIAS_DA_CONTINUIDADE || !atracao || !editor || contados.has(chave)) continue;
    contados.add(chave);
    const daAtracao = continuidade.get(atracao) ?? new Map();
    continuidade.set(atracao, daAtracao);
    const antes = daAtracao.get(editor);
    daAtracao.set(editor, { peso: (antes?.peso ?? 0) + DIAS_DA_CONTINUIDADE + 1 - longe, ultimo: antes && antes.ultimo > h.dia ? antes.ultimo : h.dia });
  }

  let agora = posicoes.slice();
  const distribuidas: ClaqueteDistribuida[] = [];
  const carga = (editor: string) => agora.filter((p) => nomeComparavel(p.editor) === editor).reduce((n, p) => n + cheias(p), 0);
  for (const it of itens) {
    const lida = lerDemanda(it.texto, dia);
    const daAtracao = lida.tipo === 'claquete' ? continuidade.get(nomeSemArtigos(lida.atracao)) : undefined;
    const peso = (e: string) => daAtracao?.get(e)?.peso ?? 0;
    const maior = Math.max(...editores.map(peso));
    let empatados = editores.filter((e) => peso(e) === maior);
    const motivos: string[] = [];
    if (empatados.length > 1) {
      const menor = Math.min(...empatados.map(carga));
      empatados = empatados.filter((e) => carga(e) === menor);
      if (empatados.length === 1) motivos.push('menos demandas');
    }
    if (empatados.length > 1) motivos.push('sorteio');
    const editor = empatados[Math.min(empatados.length - 1, Math.max(0, Math.floor(sortear() * empatados.length)))];
    // o dia mais recente em que o escolhido pegou a atração vem antes do que desempatou
    if (maior > 0) motivos.unshift(`pegou a atração em ${diaEMes(daAtracao!.get(editor)!.ultimo)}`);
    if (!motivos.length) motivos.push('a única pessoa escalada');
    const dele = agora.filter((p) => nomeComparavel(p.editor) === editor);
    const alvo = dele.reduce((a, p) => (cheias(p) < cheias(a) ? p : a));
    agora = acrescentarDemanda(agora, alvo.id, { id: it.id, texto: it.texto })!;
    distribuidas.push({ ...it, posicao: alvo.id, editor: alvo.editor, motivo: motivos.join(' · ') });
  }
  return { posicoes: agora, distribuidas, sobraram: [] };
}

/** O histórico da continuidade tirado das linhas da pauta (a do Teable junto da publicada): as claquetes, com o editor. */
export const historicoDaPauta = (linhas: readonly { dia: string; editor: string; tipo: string; texto: string }[]): PegouAAtracao[] =>
  linhas.flatMap((l) => {
    const lida = l.tipo === 'claquete' && l.editor.trim() ? lerDemanda(l.texto, l.dia) : null;
    return lida?.tipo === 'claquete' && lida.atracao ? [{ dia: l.dia, editor: l.editor, atracao: lida.atracao }] : [];
  });
