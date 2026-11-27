/* O andamento da prévia na entrada do celular (#80): o que a ficha de cada prévia conta e o estado de cada página
   na subida, do navegador (preparando, subindo) ao servidor (na fila, lendo, lida). A subida é a mesma do computador
   (preparar.ts): aqui só se junta o que esta tela está mandando com o que o servidor diz de cada página. */
import type { FilmeLido, PaginaDaPrevia } from '../dados/armazenamento';

export interface AndamentoDaPrevia {
  lidas: number;
  total: number;
  /** os ✓ que vão no próximo Enviar (o que deu erro no envio vai de novo) */
  prontos: number;
  /** os ! (qual filme, ano, sessão, não achado…) */
  pergunta: number;
  /** os que já têm card, enviados ou indo agora */
  trello: number;
}

/** Onde o filme entra na conta: com pergunta (!), no Trello (enviado ou indo agora), pronto (✓, o que deu erro vai de
    novo) ou em nenhuma (sem conferência). A mesma conta da ficha da prévia e da tela final da sequência (#84). */
export function contaDoFilme(f: FilmeLido): 'pergunta' | 'trello' | 'prontos' | null {
  const marca = f.conferencia?.marca;
  if (marca === 'atencao') return 'pergunta';
  if (marca === 'trello' || f.envio?.estado === 'enviando' || f.envio?.estado === 'enviado') return 'trello';
  return marca === 'ok' ? 'prontos' : null;
}

/** O que a ficha da prévia conta: as páginas lidas e, nelas, os prontos, os com pergunta e os que já estão no Trello. */
export function andamentoDaPrevia(paginas: PaginaDaPrevia[]): AndamentoDaPrevia {
  const a: AndamentoDaPrevia = { lidas: 0, total: paginas.length, prontos: 0, pergunta: 0, trello: 0 };
  for (const p of paginas) {
    if (p.estado !== 'lida') continue;
    a.lidas++;
    for (const f of p.filmes) {
      const conta = contaDoFilme(f);
      if (conta) a[conta]++;
    }
  }
  return a;
}

/** Onde está a página que esta tela está subindo: sendo preparada, subindo ou já entregue ao servidor. */
export type PassoNoNavegador = 'preparando' | 'subindo' | 'subiu';
export type EstadoNaSubida = 'falta' | 'esperando' | 'preparando' | 'subindo' | 'fila' | 'lendo' | 'lida' | 'erro';
export interface PaginaNaSubida {
  numero: number;
  util: number;
  estado: EstadoNaSubida;
  texto: string;
}

const NO_NAVEGADOR: EstadoNaSubida[] = ['esperando', 'preparando', 'subindo'];

const textoDe = (estado: EstadoNaSubida, filmes: number) =>
  ({
    falta: 'não chegou: suba o mesmo PDF',
    esperando: 'esperando a vez',
    preparando: 'preparando no navegador',
    subindo: 'subindo',
    fila: 'na fila da leitura',
    lendo: 'lendo com a IA…',
    lida: `lida · ${filmes} ${filmes === 1 ? 'filme' : 'filmes'}`,
    erro: 'a leitura deu erro',
  })[estado];

/**
 * O estado de cada página: o do servidor para a que já chegou; para a que não chegou, o passo desta tela, se ela está
 * subindo o PDF (null quando não está: a página espera o mesmo PDF de novo, que só sobe o que falta).
 */
export function paginasNaSubida(
  paginas: Pick<PaginaDaPrevia, 'numero' | 'util' | 'estado' | 'filmes'>[],
  noNavegador: Partial<Record<number, PassoNoNavegador>> | null,
): PaginaNaSubida[] {
  return paginas.map((p) => {
    let estado: EstadoNaSubida;
    if (p.estado !== 'esperando') estado = p.estado;
    else if (!noNavegador) estado = 'falta';
    else {
      const passo = noNavegador[p.numero];
      // entregue, mas o servidor ainda não respondeu com a página nova: ela já está na fila
      estado = passo === 'subiu' ? 'fila' : (passo ?? 'esperando');
    }
    return { numero: p.numero, util: p.util, estado, texto: textoDe(estado, p.filmes.length) };
  });
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A linha de cima da ficha na subida, e se já dá para fechar a aba (tudo chegou ao servidor e a leitura continua lá). */
export function resumoDaSubida(paginas: PaginaNaSubida[]): { texto: string; podeFechar: boolean } {
  const n = paginas.length;
  const lidas = paginas.filter((p) => p.estado === 'lida').length;
  const k = paginas.findIndex((p) => NO_NAVEGADOR.includes(p.estado));
  if (k >= 0) return { texto: `Preparando a página ${k + 1} de ${n}`, podeFechar: false };
  const faltam = paginas.filter((p) => p.estado === 'falta').length;
  if (faltam)
    return { texto: `${faltam === 1 ? 'Falta' : 'Faltam'} ${plural(faltam, 'página', 'páginas')}: suba o mesmo PDF`, podeFechar: false };
  if (paginas.some((p) => p.estado === 'fila' || p.estado === 'lendo'))
    return { texto: `Lendo no servidor · ${lidas} de ${n} lidas`, podeFechar: true };
  const erros = n - lidas;
  return { texto: `${lidas} de ${n} páginas lidas${erros ? ` · ${erros} com erro` : ''}`, podeFechar: false };
}

/** A subida acabou: toda página foi lida ou deu erro. Até lá, a ficha mostra as páginas uma por uma. */
export const subidaTerminada = (paginas: Pick<PaginaDaPrevia, 'estado'>[]) =>
  paginas.length > 0 && paginas.every((p) => p.estado === 'lida' || p.estado === 'erro');
