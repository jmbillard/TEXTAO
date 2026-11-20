/* Comparação de dois roteiros: palavra por palavra no texto, item por item nas artes.
   Serve para decidir se o roteiro que chegou é o mesmo que já está na produção, outro, ou uma versão nova. */

/** `antigo`: num trecho igual, como ele estava escrito no texto antigo (com as quebras de linha de lá). */
export type Trecho = { tipo: 'igual' | 'saiu' | 'entrou'; texto: string; antigo?: string };

// para comparar: sem acento, sem caixa e sem pontuação colada (VEM AÍ, == Vem ai)
const comparavel = (p: string) =>
  p
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .toUpperCase();

const palavras = (t: string) => t.split(/(\s+)/).filter(Boolean);

/** Junta trechos vizinhos do mesmo tipo (e o espaço entre eles) para marcar frases inteiras, não palavra a palavra. */
function juntar(lista: Trecho[]): Trecho[] {
  const saida: Trecho[] = [];
  for (const t of lista) {
    const ultimo = saida.at(-1);
    if (ultimo && ultimo.tipo === t.tipo) {
      ultimo.texto += t.texto;
      if (t.antigo !== undefined) ultimo.antigo = (ultimo.antigo ?? '') + t.antigo;
    }
    else saida.push({ ...t });
  }
  return saida;
}

/**
 * O texto antigo e o novo, como uma sequência de trechos iguais, que saíram (só no antigo) e que entraram (só no novo).
 * Palavra por palavra (maior subsequência comum); textos muito grandes caem para linha por linha.
 */
export function diferencasDeTexto(antigo: string, novo: string): Trecho[] {
  // cada palavra leva o espaço (ou a quebra de linha) que vinha depois dela no próprio texto
  const comEspaco = (t: string) => {
    const lista: string[] = [];
    for (const x of palavras(t)) {
      if (/^\s+$/.test(x)) {
        if (lista.length) lista[lista.length - 1] += x;
      } else lista.push(x);
    }
    return lista;
  };
  const sa = comEspaco(antigo);
  const sb = comEspaco(novo);
  const pa = sa.map((x) => x.trimEnd());
  const pb = sb.map((x) => x.trimEnd());
  if (pa.length * pb.length > 6_000_000) return diferencasDeLinhas(antigo, novo);
  const ka = pa.map(comparavel);
  const kb = pb.map(comparavel);
  const n = pa.length;
  const m = pb.length;
  // tabela da maior subsequência comum, de trás para frente
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ka[i] === kb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const lista: Trecho[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    // o que fica igual mostra o espaço do texto novo; o que saiu, o do antigo
    if (i < n && j < m && ka[i] === kb[j]) lista.push({ tipo: 'igual', texto: /\s$/.test(sb[j]) ? sb[j++] : sb[j++] + ' ', antigo: /\s$/.test(sa[i]) ? sa[i++] : sa[i++] + ' ' });
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) lista.push({ tipo: 'entrou', texto: /\s$/.test(sb[j]) ? sb[j++] : sb[j++] + ' ' });
    else lista.push({ tipo: 'saiu', texto: /\s$/.test(sa[i]) ? sa[i++] : sa[i++] + ' ' });
  }
  return juntar(lista);
}

function diferencasDeLinhas(antigo: string, novo: string): Trecho[] {
  const a = antigo.split('\n');
  const b = new Set(novo.split('\n').map(comparavel));
  const ka = new Set(a.map(comparavel));
  return juntar([
    ...a.map((l) => ({ tipo: (b.has(comparavel(l)) ? 'igual' : 'saiu') as Trecho['tipo'], texto: l + '\n' })),
    ...novo.split('\n').filter((l) => !ka.has(comparavel(l))).map((l) => ({ tipo: 'entrou' as const, texto: l + '\n' })),
  ]);
}

/** Quanto do texto ficou igual, de 0 a 1 (sobre o maior dos dois). */
export function semelhanca(trechos: Trecho[]): number {
  const conta = (tipo: Trecho['tipo']) => trechos.filter((t) => t.tipo === tipo).reduce((n, t) => n + t.texto.trim().split(/\s+/).filter(Boolean).length, 0);
  const igual = conta('igual');
  const total = Math.max(igual + conta('saiu'), igual + conta('entrou'));
  return total ? igual / total : 1;
}

export type ArteComparada = { texto: string; tipo: 'igual' | 'saiu' | 'entrou' };

/** As artes dos dois lados: as que continuam, as que saíram e as que entraram (na ordem do roteiro novo). */
export function diferencasDeArtes(antigas: string[], novas: string[]): { antigas: ArteComparada[]; novas: ArteComparada[] } {
  const ka = new Set(antigas.map(comparavel));
  const kn = new Set(novas.map(comparavel));
  return {
    antigas: antigas.map((t) => ({ texto: t, tipo: kn.has(comparavel(t)) ? 'igual' : 'saiu' })),
    novas: novas.map((t) => ({ texto: t, tipo: ka.has(comparavel(t)) ? 'igual' : 'entrou' })),
  };
}

const tokens = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[\s._-]+/).filter(Boolean);

/**
 * É a mesma pessoa? Aceita o login no lugar do nome ("ana.lima" ou "ana" e "Ana Lima"): basta o primeiro nome bater.
 * Sem nome de um dos lados, não dá para dizer que mudou.
 */
export function mesmaPessoa(a: string | undefined, b: string | undefined): boolean {
  const ta = tokens(a ?? '');
  const tb = tokens(b ?? '');
  if (!ta.length || !tb.length) return true;
  return ta[0] === tb[0];
}
