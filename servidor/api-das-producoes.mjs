/* A API das Produções (#185): GET /api/publico/producoes?de=AAAA-MM-DD&ate=AAAA-MM-DD, só de leitura, fora do login,
   com `Authorization: Bearer <PRODUCOES_API_TOKEN>`, para o dashboard de um produtor da arte (veja o README). Aqui
   ficam as regras puras: o período do pedido, os tempos tirados da linha do tempo, quem entra no período, o formato de
   cada Produção e o limite de pedidos por minuto. Quem lê o SQLite e responde é o servidor (app.mjs). */
import { diaEmSaoPaulo, diaVizinho, diasDaSemana, periodoDosDias, segundaDaSemana } from '../src/modelo/pauta.ts';
import { letraEVersaoDoRoteiro } from '../src/modelo/letraEVersao.ts';
import { dataDaClaquete } from '../src/modelo/vocabularios.ts';

/** O endereço da API, embaixo de /api/publico/ (o Bypass do Access é só para `api/publico/producoes`). */
export const ROTA_DAS_PRODUCOES = '/api/publico/producoes';
/** O período mais longo de um pedido. */
export const DIAS_NO_MAXIMO = 31;
/** Os pedidos aceitos (com o token certo) em cada minuto; passados eles, 429 até o minuto virar. */
export const PEDIDOS_POR_MINUTO = 30;

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const ehDia = (d) => DIA_ISO.test(d) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
const erro = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });

/**
 * O período do pedido: `de` e `ate` (AAAA-MM-DD, os dois inclusive, no dia de São Paulo) ou, sem nenhum dos dois, a
 * semana de hoje (de segunda a domingo). Lança (400) a data que não é data, só uma das duas, `de` depois de `ate` e o
 * período de mais de 31 dias.
 * @returns { de, ate, inicio, fim } (inicio e fim: o intervalo [00:00 de `de`, 00:00 do dia depois de `ate`), ISO)
 */
export function periodoDoPedido(busca, hoje = diaEmSaoPaulo()) {
  const de0 = String(busca.get('de') ?? '').trim();
  const ate0 = String(busca.get('ate') ?? '').trim();
  let de = de0;
  let ate = ate0;
  if (!de && !ate) {
    const dias = diasDaSemana(segundaDaSemana(hoje, hoje));
    [de, ate] = [dias[0], dias[6]];
  } else if (!de || !ate) throw erro('Mande as duas datas (de e ate, AAAA-MM-DD), ou nenhuma para a semana atual.');
  if (!ehDia(de) || !ehDia(ate)) throw erro('As datas são AAAA-MM-DD (de e ate).');
  if (de > ate) throw erro('A data de (o começo) vem antes da ate (o fim).');
  const dias = Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;
  if (dias > DIAS_NO_MAXIMO) throw erro(`O período vai até ${DIAS_NO_MAXIMO} dias por pedido (este tem ${dias}).`);
  const [inicio, fim] = periodoDosDias(de, dias);
  return { de, ate, inicio, fim };
}

/** O instante (ISO) no fuso de São Paulo, "2026-11-26T09:40:00-03:00"; null sem ele. São Paulo não tem horário de
    verão desde 2019: o deslocamento é sempre -03:00 (como em src/modelo/pauta.ts). */
export function emSaoPaulo(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  return `${new Date(t - 3 * 3_600_000).toISOString().slice(0, 19)}-03:00`;
}

const valido = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? iso : null);
const maisCedo = (a, b) => (!a ? b : !b ? a : Date.parse(a) <= Date.parse(b) ? a : b);

/**
 * Os tempos da Produção, tirados da linha do tempo (os eventos, do mais velho ao mais novo):
 * - entrou: o evento "criada" (o card que entrou); sem ele, a entrada da produção da arte; sem ela, a criação no PROMeiro;
 * - pegou: a primeira vez que um designer entrou ou que a etapa foi para Produzindo (a que vier antes); null sem nenhuma;
 * - entregue: só na Produção que está Entregue: a última vez que a etapa foi para Entregue; sem o evento, a entrega
 *   guardada.
 * @param p { etapa, entradaEm, entregaEm, criadaEm }
 * @returns { entrouEm, pegouEm, entregueEm } (ISO, como vieram)
 */
export function temposDaLinhaDoTempo(p, eventos) {
  const criada = eventos.find((e) => e.tipo === 'criada' && valido(e.quando));
  const entrouEm = valido(criada?.quando) ?? valido(p.entradaEm) ?? valido(p.criadaEm);
  const designer = eventos.find((e) => e.tipo === 'designer-entrou' && valido(e.quando))?.quando ?? null;
  const produzindo = eventos.find((e) => e.tipo === 'etapa' && e.depois === 'produzindo' && valido(e.quando))?.quando ?? null;
  const pegouEm = maisCedo(designer, produzindo);
  let entregueEm = null;
  if (p.etapa === 'entregue') entregueEm = valido(eventos.filter((e) => e.tipo === 'etapa' && e.depois === 'entregue').at(-1)?.quando) ?? valido(p.entregaEm);
  return { entrouEm, pegouEm, entregueEm };
}

/** A Produção esteve no período? Entrou antes do fim e não foi entregue antes do começo (a que ainda não foi entregue
    esteve em produção). */
export const esteveNoPeriodo = ({ entrouEm, entregueEm }, { inicio, fim }) => !!entrouEm && Date.parse(entrouEm) < Date.parse(fim) && (!entregueEm || Date.parse(entregueEm) >= Date.parse(inicio));

/** Os minutos de quando um designer pegou até a entrega; null sem uma das duas. */
export function tempoEmProducao({ pegouEm, entregueEm }) {
  if (!pegouEm || !entregueEm) return null;
  return Math.max(0, Math.round((Date.parse(entregueEm) - Date.parse(pegouEm)) / 60_000));
}

/** O dia em que vai ao ar (AAAA-MM-DD): a exibição ligada (o dia, em São Paulo) ou, sem ela, a data da claquete. */
export function diaNoAr(exibicaoEm, claquete, entradaEm) {
  if (typeof exibicaoEm === 'string' && ehDia(exibicaoEm)) return exibicaoEm;
  const t = exibicaoEm ? Date.parse(exibicaoEm) : NaN;
  if (!Number.isNaN(t)) return diaEmSaoPaulo(t);
  return dataDaClaquete(String(claquete ?? ''), new Date(valido(entradaEm) ?? Date.now())) || null;
}

/**
 * Uma Produção como a API devolve.
 * @param o.producao a Produção (producoes.naJanela: id, claquete, praca, etapa, designers, exibicaoEm, cardId,
 *   roteiroId, entradaEm, entregaEm, criadaEm)
 * @param o.meta a meta do Roteiro ligado ({} sem ele)
 * @param o.artes as artes (cada uma uma vez) com `feita` e o `fogo` (1 a 3)
 * @param o.atracao a atração (a do card da tela de produções)
 * @param o.eventos a linha do tempo
 * @param o.campanhas as campanhas da Produção (#178), [{ id, nome }]
 */
export function producaoDaApi({ producao: p, meta = {}, artes, atracao, eventos, campanhas = [] }) {
  const tempos = temposDaLinhaDoTempo(p, eventos);
  const lv = p.roteiroId ? letraEVersaoDoRoteiro(meta ?? {}) : null;
  const conta = (n) => artes.filter((a) => a.fogo === n).length;
  return {
    id: p.id,
    claquete: p.claquete,
    letra_e_versao: lv ? `${lv.letra} V${lv.versao}` : null,
    atracao: atracao || null,
    praca: p.praca || null,
    campanhas: campanhas.map((c) => ({ id: c.id, nome: c.nome })),
    etapa: p.etapa,
    entrou_em: emSaoPaulo(tempos.entrouEm),
    pegou_em: emSaoPaulo(tempos.pegouEm),
    entregue_em: emSaoPaulo(tempos.entregueEm),
    ao_ar: diaNoAr(p.exibicaoEm, p.claquete, p.entradaEm),
    designers: [...p.designers],
    artes: { total: artes.length, feitas: artes.filter((a) => a.feita).length, fogo: { baixa: conta(1), media: conta(2), alta: conta(3) } },
    tempo_em_producao_min: tempoEmProducao(tempos),
    trello: p.cardId ? `https://trello.com/c/${encodeURIComponent(p.cardId)}` : null,
  };
}

/** As Produções do período (as de `producaoDaApi` mais os tempos crus), das que entraram antes às de depois. */
export function producoesDoPeriodo(itens, periodo) {
  return itens
    .map((i) => ({ i, tempos: temposDaLinhaDoTempo(i.producao, i.eventos) }))
    .filter(({ tempos }) => esteveNoPeriodo(tempos, periodo))
    .sort((a, b) => Date.parse(a.tempos.entrouEm) - Date.parse(b.tempos.entrouEm) || String(a.i.producao.id).localeCompare(String(b.i.producao.id)))
    .map(({ i }) => producaoDaApi(i));
}

/** A margem da consulta no SQLite (um dia de cada lado): a linha do tempo pode dizer outra hora que as colunas. */
export const margemDaConsulta = ({ de, ate }) => ({ desde: periodoDosDias(diaVizinho(de, -1), 1)[0], antesDe: periodoDosDias(diaVizinho(ate, 2), 1)[0] });

/**
 * O limite de pedidos por minuto: a janela é o minuto do relógio; passados `porMinuto`, recusa até ele virar.
 * @returns conta() => { vale, espera (segundos até o minuto virar) }
 */
export function criarLimiteDePedidos({ porMinuto = PEDIDOS_POR_MINUTO, agora = () => new Date() } = {}) {
  let minuto = -1;
  let n = 0;
  return {
    conta() {
      const t = agora().getTime();
      const m = Math.floor(t / 60_000);
      if (m !== minuto) [minuto, n] = [m, 0];
      n += 1;
      return { vale: n <= porMinuto, espera: Math.max(1, Math.ceil(((m + 1) * 60_000 - t) / 1000)) };
    },
  };
}
