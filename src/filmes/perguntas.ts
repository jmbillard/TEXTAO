/* As respostas do ! de um filme da prévia, as mesmas no balão do computador e no card do celular (#82): "qual filme?"
   (os candidatos do banco e "outro filme (novo)"), "ano diferente" (os dois anos), "qual sessão?" (o filme que subiu
   da Sessão da Tarde: a da coluna dele na página primeiro) e "não achado" (fica ou sai). Cada opção leva a mudança de
   filme que ela grava. "Sem título" não tem opção: responde-se corrigindo o título. */
import type { FilmeLido, MudancaNoFilme } from '../dados/armazenamento';

export interface OpcaoDaPergunta {
  rotulo: string;
  /** o ano do candidato do banco (null: o banco não sabe) */
  ano?: number | null;
  /** o filme do banco cujo pôster aparece na opção; null é "outro filme (novo)", sem pôster */
  poster?: string | null;
  nota?: string;
  m: MudancaNoFilme;
}

export function opcoesDaPergunta(f: FilmeLido): OpcaoDaPergunta[] {
  const c = f.conferencia;
  if (c?.pergunta === 'qual-filme')
    return [
      ...(c.candidatos ?? []).map((b) => ({ rotulo: b.titulo, ano: b.ano, poster: b.id, m: { filme: b.id } })),
      { rotulo: 'outro filme (novo)', poster: null, m: { filme: 'novo' } },
    ];
  if (c?.pergunta === 'ano-diferente') return (c.anos ?? []).map((ano) => ({ rotulo: String(ano), m: { ano } }));
  if (c?.pergunta === 'sessao')
    return (c.sessoes ?? []).map((s) => ({
      rotulo: s.data ? `${s.sessao} · ${s.data.slice(0, 5)}` : s.sessao,
      ...(s.coluna ? { nota: 'a coluna dele na página' } : {}),
      m: { sessao: s.sessao },
    }));
  if (c?.pergunta === 'nao-achado')
    return [
      { rotulo: 'fica', m: { fica: true } },
      { rotulo: 'sai', m: { sai: true } },
    ];
  return [];
}
