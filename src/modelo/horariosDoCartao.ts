/* Os horários do cartão da pauta no Teams (#135), como dado da Configuração (TEAMS_HORARIOS, em JSON), como os turnos:
   cada horário tem a hora (no relógio de São Paulo), os dias da semana (0 = domingo … 6 = sábado) e qual pauta leva,
   a de hoje ou a de amanhã. Sem nada salvo, valem os de fábrica: os do fluxo do n8n que manda o cartão hoje (MANHÃ e
   NOITE). O mesmo módulo serve ao navegador e ao servidor: só sintaxe que o Node apaga. */

type Ambiente = Record<string, string | undefined>;

export type PautaDoHorario = 'hoje' | 'amanha';
export interface HorarioDoCartao {
  /** "HH:MM", no relógio de São Paulo */
  hora: string;
  /** os dias da semana em que vale, em ordem: 0 = domingo … 6 = sábado */
  dias: number[];
  /** a pauta que o cartão leva: a do dia ou a do dia seguinte */
  pauta: PautaDoHorario;
}

const SEG_A_SEX = [1, 2, 3, 4, 5];
/** Os do n8n: 7h29 (seg a sex), 8h29 (sáb), 10h29 (dom), 16h29 (seg a sex) e, às 22h29, a pauta de amanhã. */
export const HORARIOS_DE_FABRICA: readonly HorarioDoCartao[] = [
  { hora: '07:29', dias: SEG_A_SEX, pauta: 'hoje' },
  { hora: '08:29', dias: [6], pauta: 'hoje' },
  { hora: '10:29', dias: [0], pauta: 'hoje' },
  { hora: '16:29', dias: SEG_A_SEX, pauta: 'hoje' },
  { hora: '22:29', dias: SEG_A_SEX, pauta: 'amanha' },
];
export const horariosDeFabrica = (): HorarioDoCartao[] => HORARIOS_DE_FABRICA.map((h) => ({ ...h, dias: [...h.dias] }));

/** Os nomes dos dias, de domingo a sábado (a conferência e o histórico). */
export const DIAS_DA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** As letras dos dias, na ordem da semana de trabalho (a tela mostra de segunda a domingo). */
export const ORDEM_NA_TELA = [1, 2, 3, 4, 5, 6, 0];

const HORA = /^(\d{1,2})\s*[:hH]\s*(\d{2})?$/;
/** "7:29", "7h29", "07:29", "7h" → "07:29"; o que não é hora fica como veio (sem os espaços), para a conferência dizer. */
export function horaNoPadrao(texto: string): string {
  const t = String(texto ?? '').trim();
  const m = HORA.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  return h > 23 || min > 59 ? t : `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
const ehHora = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);

/**
 * Os horários como vieram (da Configuração ou do navegador), arrumados: a hora no padrão, os dias sem repetir e em
 * ordem, a pauta de hoje quando não diz amanhã. Não confere nada: a hora que não é hora fica, para a conferência dizer.
 */
export function horariosArrumados(lista: readonly unknown[]): HorarioDoCartao[] {
  return lista
    .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
    .map((h) => ({
      hora: horaNoPadrao(String(h.hora ?? '').slice(0, 10)),
      dias: [...new Set((Array.isArray(h.dias) ? h.dias : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b),
      pauta: h.pauta === 'amanha' ? 'amanha' : 'hoje',
    }));
}

/** Os horários que valem: os salvos na Configuração (TEAMS_HORARIOS) ou, sem eles (ou ilegíveis), os de fábrica. */
export function horariosDaConfiguracao(env: Ambiente = {}): HorarioDoCartao[] {
  let salvos: unknown = null;
  try {
    salvos = env.TEAMS_HORARIOS ? JSON.parse(env.TEAMS_HORARIOS) : null;
  } catch {
    salvos = null;
  }
  // salvo vazio vale: a coordenação pode tirar todos (o cartão para de sair)
  if (!Array.isArray(salvos)) return horariosDeFabrica();
  return horariosArrumados(salvos).filter((h) => ehHora(h.hora) && h.dias.length);
}

/** "07:29 · seg a sex · a de hoje" (o histórico e a conferência). */
export function descricaoDoHorario(h: HorarioDoCartao): string {
  const curto = (d: number) => DIAS_DA_SEMANA[d].slice(0, 3);
  const seguidos = h.dias.length > 2 && h.dias.every((d, i) => i === 0 || d === h.dias[i - 1] + 1);
  const dias = h.dias.length === 7 ? 'todo dia' : seguidos ? `${curto(h.dias[0])} a ${curto(h.dias.at(-1) as number)}` : h.dias.map(curto).join(', ');
  return `${dias} · a pauta de ${h.pauta === 'amanha' ? 'amanhã' : 'hoje'}`;
}

export interface MudancaNosHorarios {
  oque: string;
  antes: string;
  depois: string;
}
/** O que muda dos horários salvos para os novos (pela hora): o que entra, o que sai e o que muda de dias ou de pauta. */
export function oQueMudaNosHorarios(novos: readonly HorarioDoCartao[], salvos: readonly HorarioDoCartao[]): MudancaNosHorarios[] {
  const chave = (h: HorarioDoCartao) => `${h.hora}|${h.dias.join()}|${h.pauta}`;
  const muda: MudancaNosHorarios[] = [];
  const restam = [...salvos];
  for (const n of novos) {
    const igual = restam.findIndex((s) => chave(s) === chave(n));
    if (igual >= 0) {
      restam.splice(igual, 1);
      continue;
    }
    const mesmaHora = restam.findIndex((s) => s.hora === n.hora);
    const antes = mesmaHora >= 0 ? restam.splice(mesmaHora, 1)[0] : null;
    muda.push({ oque: n.hora, antes: antes ? descricaoDoHorario(antes) : '—', depois: descricaoDoHorario(n) });
  }
  for (const s of restam) muda.push({ oque: s.hora, antes: descricaoDoHorario(s), depois: '—' });
  return muda;
}

export interface ItemDosHorarios {
  tipo: 'erro' | 'aviso' | 'ok';
  titulo: string;
  detalhe: string;
}
/**
 * A conferência dos horários novos: a hora que não é hora, o horário sem dia e dois horários na mesma hora do mesmo
 * dia são erros (nada é salvo). Nenhum horário é aviso: o cartão para de sair.
 */
export function conferirHorarios(novos: readonly HorarioDoCartao[], salvos: readonly HorarioDoCartao[]): { ok: boolean; itens: ItemDosHorarios[]; muda: MudancaNosHorarios[] } {
  const itens: ItemDosHorarios[] = [];
  const erro = (detalhe: string) => itens.push({ tipo: 'erro', titulo: 'Cartão do Teams', detalhe });
  const vistos = new Set<string>();
  for (const h of novos) {
    if (!ehHora(h.hora)) erro(`a hora "${h.hora}" não é uma hora.`);
    else if (!h.dias.length) erro(`o horário das ${h.hora} está sem dia da semana.`);
    else
      for (const d of h.dias) {
        const c = `${h.hora}|${d}`;
        if (vistos.has(c)) {
          erro(`dois horários às ${h.hora} na ${DIAS_DA_SEMANA[d]}.`);
          break;
        }
        vistos.add(c);
      }
  }
  if (!novos.length) itens.push({ tipo: 'aviso', titulo: 'Cartão do Teams', detalhe: 'sem nenhum horário, o cartão da pauta para de ir ao Teams.' });
  const ok = !itens.some((i) => i.tipo === 'erro');
  if (ok && novos.length) itens.push({ tipo: 'ok', titulo: 'Cartão do Teams', detalhe: `${novos.length} ${novos.length === 1 ? 'horário' : 'horários'} do cartão da pauta.` });
  return { ok, itens, muda: ok ? oQueMudaNosHorarios(novos, salvos) : [] };
}

/* ---------- o relógio de São Paulo ---------- */

const FUSO = 'America/Sao_Paulo';
/** O dia (AAAA-MM-DD), a hora ("HH:MM") e o dia da semana (0 = domingo) de um instante, em São Paulo. */
export function relogioDeSaoPaulo(instante: Date): { dia: string; hora: string; semana: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  const semana = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(partes.weekday);
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}`, semana };
}

const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
const diaSeguinte = (dia: string) => new Date(Date.parse(`${dia}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Um horário que chegou: a chave (o dia e a hora em São Paulo, a mesma depois de reiniciar) e o dia da pauta que leva. */
export interface HorarioVencido {
  chave: string;
  pautaDe: string;
  horario: HorarioDoCartao;
}
/**
 * Os horários que já chegaram hoje e ainda estão na janela (o horário perdido há mais tempo, com o servidor fora, não
 * vai atrasado). Não sabe o que já foi: quem chama confere pela chave.
 */
export function horariosVencidos(horarios: readonly HorarioDoCartao[], agora: Date, janelaEmMinutos = 30): HorarioVencido[] {
  const { dia, hora, semana } = relogioDeSaoPaulo(agora);
  const ja = minutos(hora);
  return horarios
    .filter((h) => ehHora(h.hora) && h.dias.includes(semana) && ja >= minutos(h.hora) && ja - minutos(h.hora) < janelaEmMinutos)
    .map((h) => ({ chave: `${dia} ${h.hora}`, pautaDe: h.pauta === 'amanha' ? diaSeguinte(dia) : dia, horario: h }));
}
