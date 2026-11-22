import type { Resumo } from '../dados/armazenamento';

/* A fila organizada pela data de exibição: o que vai ao ar primeiro vem primeiro, e o que já foi ao ar
   desce para um grupo recolhido. Dentro de cada dia, o que pede revisão vem antes. */

export interface GrupoDia {
  chave: string;
  titulo: string;
  subtitulo: string;
  itens: Resumo[];
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const maiuscula = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Já tem card no Trello (mandado pelo PROMeiro ou pelo upload antigo). */
export const noTrello = (r: Resumo) => r.trello?.estado === 'enviado' || r.trello?.estado === 'duplicado';

/** Pede alguém olhar: tem pendência, ou falta responder se é uma v2 do que já está na produção. */
export const pedeRevisao = (r: Resumo) => !!r.meta.revisar?.length || !!r.meta.naProducao;

// dentro do dia: o que pede revisão, depois os prontos, e por último o que já está no Trello
const ordemNoDia = (a: Resumo, b: Resumo) =>
  +noTrello(a) - +noTrello(b) || +pedeRevisao(b) - +pedeRevisao(a) || b.atualizadoEm.localeCompare(a.atualizadoEm);

function nomear(iso: string, hoje: string, amanha: string): Pick<GrupoDia, 'titulo' | 'subtitulo'> {
  const [a, m, d] = iso.split('-').map(Number);
  const data = new Date(a, m - 1, d);
  const extenso = `${d} de ${MESES[m - 1]}`;
  if (iso === hoje) return { titulo: 'Hoje', subtitulo: `${DIAS[data.getDay()]}, ${extenso}` };
  if (iso === amanha) return { titulo: 'Amanhã', subtitulo: `${DIAS[data.getDay()]}, ${extenso}` };
  return { titulo: maiuscula(DIAS[data.getDay()]), subtitulo: extenso };
}

/** O que ainda pede trabalho: nem foi ao ar, nem já está no Trello. É isso que a fila conta. */
export function pendentes(lista: Resumo[], agora = new Date()): Resumo[] {
  const hoje = isoLocal(agora);
  return lista.filter((r) => !noTrello(r) && !(/^\d{4}-\d{2}-\d{2}$/.test(r.meta.dataExibicao) && r.meta.dataExibicao < hoje));
}

/** diasExtras: dias que aparecem mesmo sem roteiro (os dias que só têm filme). */
export function agruparPorDia(lista: Resumo[], agora = new Date(), diasExtras: string[] = []): { proximos: GrupoDia[]; exibidos: GrupoDia[] } {
  const hoje = isoLocal(agora);
  const amanha = isoLocal(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1));
  const porDia = new Map<string, Resumo[]>();
  for (const r of lista) {
    const k = /^\d{4}-\d{2}-\d{2}$/.test(r.meta.dataExibicao) ? r.meta.dataExibicao : '';
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k)!.push(r);
  }
  for (const k of diasExtras) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k >= hoje && !porDia.has(k)) porDia.set(k, []);
  const grupo = (k: string): GrupoDia => ({
    chave: k || 'sem-data',
    ...(k ? nomear(k, hoje, amanha) : { titulo: 'Sem data', subtitulo: 'a data de exibição não veio no arquivo' }),
    itens: porDia.get(k)!.sort(ordemNoDia),
  });
  const datas = [...porDia.keys()].filter(Boolean);
  const proximos = datas.filter((k) => k >= hoje).sort().map(grupo);
  if (porDia.has('')) proximos.push(grupo(''));
  const exibidos = datas.filter((k) => k < hoje).sort().reverse().map(grupo);
  return { proximos, exibidos };
}
