/* Os filmes recentes do Padeiro (#142): o que o fluxo "filmes-recentes" do n8n (PROMO: FILMES PARA O PADEIRO) fazia,
   agora no PROMeiro. Um item por filme com exibição não cancelada de 2 dias atrás a 45 dias à frente (a próxima
   exibição; sem ela, a mais recente), os próximos primeiro (do mais perto ao mais longe) e depois os dos últimos dias.
   Cada um leva o título, o ano, a pasta padronizada "TÍTULO (ANO)", os caminhos de projeto e output (com essa pasta no
   lugar do último nível), a sessão, o inédito, o card e o pôster. O formato é o mesmo do n8n, para o Padeiro mudar o
   mínimo. Aqui só a regra, sem banco: as linhas vêm do Postgres do Teable (trello.mjs, filmesRecentes). */
import { vinculos } from './acervo.mjs';

/** Quantos dias para trás e para a frente de hoje (o mesmo do n8n). */
export const DIAS_ANTES = 2;
export const DIAS_DEPOIS = 45;

const BRASILIA = 'America/Sao_Paulo';

/** O dia de Brasília de um instante (AAAA-MM-DD), ou '' quando não é uma data. */
export function diaEmBrasilia(v) {
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v ?? ''));
  if (Number.isNaN(t)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: BRASILIA }).format(new Date(t));
}

/** O dia AAAA-MM-DD somado de `n` dias (sem fuso: conta só o calendário). */
export function somarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A hora de Brasília em ISO, sem os milissegundos, com o -03:00 (o `atualizado_em` do n8n). */
export function horaDeBrasilia(agora = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: BRASILIA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(agora)
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second);
  const minutos = Math.round((local - Math.floor(agora.getTime() / 1000) * 1000) / 60_000);
  const sinal = minutos < 0 ? '-' : '+';
  const fuso = `${sinal}${String(Math.floor(Math.abs(minutos) / 60)).padStart(2, '0')}:${String(Math.abs(minutos) % 60).padStart(2, '0')}`;
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}${fuso}`;
}

/** Uma lista do Postgres do Teable (jsonb, ou o texto JSON dele): os rótulos, o anexo do pôster. */
function lista(v) {
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    try {
      return lista(JSON.parse(v));
    } catch {
      return [v];
    }
  }
  return Array.isArray(v) ? v : [v];
}

const cancelada = (labels) => lista(labels).some((l) => String(typeof l === 'object' && l ? (l.title ?? l.name ?? '') : l).trim().toUpperCase() === 'CANCELADO');
const anoDe = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const sim = (v) => v === true || v === 1 || /^(t|true|1|sim)$/i.test(String(v ?? '').trim());

/** O caminho do cadastro com a pasta nova no lugar do último nível (o nome da pasta do cadastro), como no n8n. */
function troca(caminho, antigo, novo) {
  const c = String(caminho ?? '');
  if (!c) return '';
  return antigo && c.endsWith(antigo) ? c.slice(0, c.length - antigo.length) + novo : c;
}

/** O filme tem pôster no Teable (o campo de anexo `poster` com um arquivo)? */
export const temPosterNoTeable = (poster) => lista(poster).length > 0;

/**
 * Os filmes recentes, no formato do n8n.
 * @param exibicoes as linhas da tabela exibicoes ({ __id, filme, data_de_exibicao, sessao, inedito, link, labels })
 * @param filmes as linhas da tabela filmes ({ __id, titulo, ano_de_producao, nome_da_pasta, projeto_win, projeto_mac,
 *   output_win, output_mac, poster })
 * @param hoje o dia de Brasília (AAAA-MM-DD)
 * @param poster (filmeId, temNoTeable) => o endereço do pôster, ou null
 * @returns [{ exibicao_id, filme_id, titulo, ano, pasta, projeto: { win, mac }, output: { win, mac }, exibicao, sessao,
 *   inedito, trello, poster }]
 */
export function filmesRecentes({ exibicoes = [], filmes = [], hoje, poster = () => null }) {
  const de = somarDias(hoje, -DIAS_ANTES);
  const ate = somarDias(hoje, DIAS_DEPOIS);
  const porId = new Map(filmes.map((f) => [String(f.__id), f]));
  // a exibição que vale de cada filme: a próxima (de hoje em diante); sem ela, a mais recente
  const escolhida = new Map();
  for (const e of exibicoes) {
    const dia = diaEmBrasilia(e.data_de_exibicao);
    const filmeId = vinculos(e.filme)[0]?.id ?? '';
    if (!e.__id || !dia || dia < de || dia > ate || cancelada(e.labels) || !porId.has(filmeId)) continue;
    const x = { e, dia, filmeId, passou: dia < hoje };
    const atual = escolhida.get(filmeId);
    const melhor = !atual || (atual.passou && !x.passou) || (atual.passou === x.passou && (x.passou ? x.dia > atual.dia : x.dia < atual.dia));
    if (melhor) escolhida.set(filmeId, x);
  }
  const itens = [...escolhida.values()].map(({ e, dia, filmeId, passou }) => {
    const f = porId.get(filmeId);
    const nomeDaPasta = String(f.nome_da_pasta ?? '');
    const base = nomeDaPasta.replace(/\s*\(\d{4}\)\s*$/, '');
    const ano = anoDe(f.ano_de_producao);
    const pasta = ano !== null ? `${base} (${ano})` : base;
    return {
      passou,
      item: {
        exibicao_id: String(e.__id),
        filme_id: filmeId,
        titulo: String(f.titulo ?? ''),
        ano,
        pasta,
        projeto: { win: troca(f.projeto_win, nomeDaPasta, pasta), mac: troca(f.projeto_mac, nomeDaPasta, pasta) },
        output: { win: troca(f.output_win, nomeDaPasta, pasta), mac: troca(f.output_mac, nomeDaPasta, pasta) },
        exibicao: dia,
        sessao: vinculos(e.sessao)[0]?.title || '',
        inedito: sim(e.inedito),
        trello: String(e.link ?? '').trim() || null,
        poster: poster(filmeId, temPosterNoTeable(f.poster)) ?? null,
      },
    };
  });
  // os próximos primeiro (do mais perto ao mais longe), depois os dos últimos dias (do mais recente ao mais velho)
  const comparar = (a, b) => String(a).localeCompare(String(b), 'pt-BR');
  itens.sort(
    (a, b) =>
      Number(a.passou) - Number(b.passou) ||
      (a.passou ? comparar(b.item.exibicao, a.item.exibicao) : comparar(a.item.exibicao, b.item.exibicao)) ||
      comparar(a.item.sessao, b.item.sessao) ||
      comparar(a.item.titulo, b.item.titulo),
  );
  return itens.map((x) => x.item);
}
