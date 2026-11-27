/* A sequência de filmes do celular (#81): a prévia aberta vira uma fila única de filmes, sem paginar o PDF. Primeiro
   os de sessão própria (Supercine, Tela Quente, Corujão…) por data, depois os da Sessão da Tarde por data; no mesmo
   dia, a ordem da página (a página no PDF e o filme nela). Os dados lidos não têm hora. */
import type { CaixaDaPagina, FilmeLido, PaginaDaPrevia } from '../dados/armazenamento';
import { ehSessaoDaTarde } from './fileiras';

export interface FilmeNaSequencia {
  /** a página no PDF e o índice do filme nela */
  numero: number;
  util: number;
  i: number;
  filme: FilmeLido;
  /** da Sessão da Tarde, pela mesma regra que separa as fileiras */
  tarde: boolean;
  /** pede a pessoa: a marca com pergunta (qual filme, ano, sessão…) ou o não achado; o que está no Trello, não */
  pendente: boolean;
  /** a caixa do pôster em proporção da página (0 a 1), ou null: sem pôster */
  caixa: CaixaDaPagina | null;
  enquadramento: Enquadramento;
  /** saiu da prévia durante a revisão (o não achado que sai): fica riscado no lugar até reabrir */
  saiu?: boolean;
}

/**
 * Onde a imagem de cima olha: o ponto da página (em proporção dela) no centro da janela e o zoom, em que 1 é a página
 * inteira cabendo na janela.
 */
export interface Enquadramento {
  x: number;
  y: number;
  zoom: number;
}

/** A janela de cima (largura / altura): a mesma do CSS (`.sequencia-imagem`). */
export const JANELA = 4 / 3;
/** O pôster ocupa dois terços da janela no lado que aperta. */
const FOLGA = 1.5;
const ZOOM_MAXIMO = 4;
export const PAGINA_INTEIRA: Enquadramento = { x: 0.5, y: 0.5, zoom: 1 };

/**
 * Quanto da página aparece na janela com zoom 1, em proporção dela: a página cabe inteira, e sobra no lado em que ela
 * é mais estreita que a janela (a página larga numa janela 4:3 sobra em altura).
 */
export function vistaInteira(pagina: { width: number; height: number }, janela: number) {
  const a = pagina.width / pagina.height;
  return a >= janela ? { largura: 1, altura: a / janela } : { largura: janela / a, altura: 1 };
}

/** O enquadramento do pôster: centrado e ampliado até a folga, sem mostrar além da borda da página. */
export function enquadrar(caixa: CaixaDaPagina | null, pagina: { width: number; height: number } | null, janela: number): Enquadramento {
  if (!caixa || !pagina) return PAGINA_INTEIRA;
  const v = vistaInteira(pagina, janela);
  const zoom = Math.min(ZOOM_MAXIMO, Math.max(1, Math.min(v.largura / (caixa.width * FOLGA), v.altura / (caixa.height * FOLGA))));
  const preso = (c: number, vista: number) => (vista >= 1 ? 0.5 : Math.min(1 - vista / 2, Math.max(vista / 2, c)));
  return { x: preso(caixa.x + caixa.width / 2, v.largura / zoom), y: preso(caixa.y + caixa.height / 2, v.altura / zoom), zoom };
}

/** "05/12/2026" → 20261205; sem data (ou fora do formato), depois de todas. */
function dia(data: string) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(data.trim());
  return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : Infinity;
}

/** O que vale para o filme onde quer que ele esteja na sequência (e o que muda quando o filme muda no lugar). */
function doFilme(p: PaginaDaPrevia, f: FilmeLido, janela: number) {
  const c = f.poster !== null ? p.posteres[f.poster]?.caixa : undefined;
  const t = p.tamanho;
  const caixa = c && t?.width && t.height ? { x: c.x / t.width, y: c.y / t.height, width: c.width / t.width, height: c.height / t.height } : null;
  return {
    tarde: ehSessaoDaTarde(f.sessao),
    pendente: !!f.naoAchado || f.conferencia?.marca === 'atencao',
    caixa,
    enquadramento: enquadrar(caixa, t, janela),
  };
}

export function montarSequencia(paginas: PaginaDaPrevia[], janela = JANELA): FilmeNaSequencia[] {
  const todos = paginas.flatMap((p) =>
    p.estado !== 'lida' ? [] : p.filmes.map((filme, i) => ({ numero: p.numero, util: p.util, i, filme, ...doFilme(p, filme, janela) })),
  );
  const chave = (s: FilmeNaSequencia) => [s.tarde ? 1 : 0, dia(s.filme.data), s.numero, s.i];
  return todos.sort((a, b) => {
    const [ka, kb] = [chave(a), chave(b)];
    const k = ka.findIndex((v, j) => v !== kb[j]);
    return k < 0 ? 0 : ka[k] - kb[k];
  });
}

/** Quem o filme é na página, para achá-lo de novo depois de uma mudança: o pôster dele ou, sem pôster, o que a leitura
    trouxe (o título lido antes de corrigido, a sessão e a data). */
const quem = (f: FilmeLido) => (f.poster !== null ? `p${f.poster}` : `t${f.tituloLido ?? f.titulo}|${f.sessao}|${f.data}`);

/**
 * A prévia mudou durante a revisão (a resposta de alguém, uma página lida): cada filme é atualizado no lugar, sem mudar
 * de posição; o que sumiu da página fica riscado (saiu), e o que apareceu vai para o fim. A ordem nova só vale quando a
 * prévia é aberta de novo (montarSequencia).
 */
export function atualizarSequencia(seq: FilmeNaSequencia[], paginas: PaginaDaPrevia[], janela = JANELA): FilmeNaSequencia[] {
  const usados = new Set<string>();
  const achar = (s: FilmeNaSequencia) => {
    const p = paginas.find((g) => g.numero === s.numero && g.estado === 'lida');
    const i = p ? p.filmes.findIndex((f, k) => !usados.has(`${p.numero}:${k}`) && quem(f) === quem(s.filme)) : -1;
    if (!p || i < 0) return null;
    usados.add(`${p.numero}:${i}`);
    return { p, i };
  };
  const mantidos = seq.map((s): FilmeNaSequencia => {
    const achado = s.saiu ? null : achar(s);
    if (!achado) return { ...s, saiu: true };
    const { p, i } = achado;
    const filme = p.filmes[i];
    return { numero: p.numero, util: p.util, i, filme, ...doFilme(p, filme, janela) };
  });
  const novos = montarSequencia(paginas, janela).filter((s) => !usados.has(`${s.numero}:${s.i}`));
  return [...mantidos, ...novos];
}

/** O que a imagem de cima mostra numa posição da rolagem (em filmes: 2,5 é o meio do caminho entre o 3º e o 4º). */
export interface QuadroDaRolagem {
  de: number;
  para: number;
  /** quanto do caminho de `de` a `para` já foi (0 a 1) */
  t: number;
  /** na mesma página, a imagem desliza de um pôster ao outro; entre páginas (ou sem movimento), esmaece */
  modo: 'deslizar' | 'esmaecer';
  /** o enquadramento do caminho, quando desliza; esmaecendo, cada imagem fica no enquadramento do filme dela */
  enquadramento: Enquadramento;
}

const entre = (a: number, b: number, t: number) => a + (b - a) * t;

export function quadroNaRolagem(seq: FilmeNaSequencia[], pos: number, semMovimento: boolean): QuadroDaRolagem {
  const ultimo = Math.max(0, seq.length - 1);
  const p = Math.min(ultimo, Math.max(0, pos));
  const de = Math.floor(p);
  // parado num filme, o caminho não vai a lugar nenhum
  const para = p > de ? de + 1 : de;
  const t = p - de;
  const [a, b] = [seq[de]?.enquadramento ?? PAGINA_INTEIRA, seq[para]?.enquadramento ?? PAGINA_INTEIRA];
  const mesma = seq[de]?.numero === seq[para]?.numero;
  if (!mesma || semMovimento) return { de, para, t, modo: 'esmaecer', enquadramento: a };
  return { de, para, t, modo: 'deslizar', enquadramento: { x: entre(a.x, b.x, t), y: entre(a.y, b.y, t), zoom: entre(a.zoom, b.zoom, t) } };
}

/**
 * Como pôr a página na janela para um enquadramento: a folha (a página com zoom 1, em proporção da janela) e o
 * deslocamento (em proporção da janela) e a escala que levam o ponto do enquadramento ao centro.
 */
export function transformar(e: Enquadramento, pagina: { width: number; height: number } | null, janela: number) {
  const v = pagina?.width && pagina.height ? vistaInteira(pagina, janela) : { largura: 1, altura: 1 };
  return {
    largura: 1 / v.largura,
    altura: 1 / v.altura,
    x: 0.5 - (e.zoom * e.x) / v.largura,
    y: 0.5 - (e.zoom * e.y) / v.altura,
    zoom: e.zoom,
  };
}
