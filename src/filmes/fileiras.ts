/* As duas fileiras de cards em cima da página da prévia: a de cima com os filmes de identidade própria (e as
   vagas canceladas), a de baixo com os da Sessão da Tarde. O filme lido na Sessão da Tarde com o pôster na fileira
   de cima da página deixa lá a vaga do pôster dele ("???"), para onde ele é arrastado. Cada card fica centrado sobre o seu pôster, sem
   encostar no vizinho; o filme sem pôster vai para o fim da fileira dele. Posições em frações da largura. */
import type { FilmeLido, PaginaDaPrevia } from '../dados/armazenamento';

export const ehSessaoDaTarde = (sessao: string) => /^SESS[ÃA]O\s*DA\s*TARDE$/i.test(sessao.trim());

export interface ItemDaFileira {
  /** vaga: a sessão cancelada; lugar: a vaga do pôster de um filme lido na Sessão da Tarde ("???") */
  tipo: 'filme' | 'vaga' | 'lugar';
  /** o índice do filme na página (também no lugar), ou da vaga */
  i: number;
  filme?: FilmeLido;
  texto?: string;
  x: number;
}
export interface Fileiras {
  largura: number;
  cima: ItemDaFileira[];
  baixo: ItemDaFileira[];
}

const VAO = 0.008;

function arrumar(itens: (ItemDaFileira & { c: number })[], w: number): ItemDaFileira[] {
  const ordem = [...itens].sort((a, b) => a.c - b.c);
  let fim = -1;
  for (const it of ordem) {
    it.x = Math.max(it.c - w / 2, fim + VAO, 0);
    fim = it.x + w;
  }
  for (let k = ordem.length - 1; k >= 0; k--) ordem[k].x = Math.min(ordem[k].x, k < ordem.length - 1 ? ordem[k + 1].x - w - VAO : 1 - w);
  return ordem.map(({ c: _c, ...it }) => it);
}

/** O filme da Sessão da Tarde que pode subir para a vaga do pôster dele na fileira de cima. */
export const podeSubir = (p: PaginaDaPrevia, i: number) => {
  const f = p.filmes[i];
  return !!f && ehSessaoDaTarde(f.sessao) && f.poster !== null && (p.fileiraDeCima ?? []).includes(f.poster) && f.envio?.estado !== 'enviando' && f.envio?.estado !== 'enviado';
};

export function montarFileiras(p: PaginaDaPrevia): Fileiras {
  const largura = p.tamanho?.width || 1;
  const centro = (poster: number | null) => {
    const c = poster !== null ? p.posteres[poster]?.caixa : undefined;
    return c ? (c.x + c.width / 2) / largura : 1.05;
  };
  const cima: (ItemDaFileira & { c: number })[] = [];
  const baixo: (ItemDaFileira & { c: number })[] = [];
  p.filmes.forEach((filme, i) => {
    (ehSessaoDaTarde(filme.sessao) ? baixo : cima).push({ tipo: 'filme', i, filme, x: 0, c: centro(filme.poster) });
    if (podeSubir(p, i)) cima.push({ tipo: 'lugar', i, filme, x: 0, c: centro(filme.poster) });
  });
  p.vagas.forEach((v, i) => cima.push({ tipo: 'vaga', i, texto: v.texto, x: 0, c: (v.caixa.x + v.caixa.width / 2) / largura }));
  const n = Math.max(cima.length, baixo.length, 1);
  const w = Math.min(0.19, (1 - VAO * (n - 1)) / n);
  return { largura: w, cima: arrumar(cima, w), baixo: arrumar(baixo, w) };
}
