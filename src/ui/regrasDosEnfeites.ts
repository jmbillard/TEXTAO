/* Os enfeites de fim de ano da tela inicial (fila e agenda): o Natal de 1º a 25 de dezembro e o Ano Novo de 26 de
   dezembro a 1º de janeiro, sempre pelo relógio de Brasília. No dia 2 de janeiro tudo some. Quem não quiser desliga
   no perfil ("Enfeites"); a escolha fica só neste navegador. */

export type TemaDeFimDeAno = 'natal' | 'ano-novo';

export interface TemaDaData {
  tema: TemaDeFimDeAno;
  /** No dia 31 e no dia 1º: o ano que começa (o "2027!" à mão no dia 1º da agenda). */
  anoNovo?: number;
  /** Só no dia 31: quanto falta para a meia-noite de Brasília (o minuto começado conta inteiro). */
  faltam?: { horas: number; minutos: number };
}

const FUSO = 'America/Sao_Paulo';
const relogio = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });

/** O dia e a hora de agora em Brasília. */
function emBrasilia(agora: Date) {
  const p: Record<string, number> = {};
  for (const { type, value } of relogio.formatToParts(agora)) if (type !== 'literal') p[type] = Number(value);
  return { ano: p.year, mes: p.month, dia: p.day, segundos: p.hour * 3600 + p.minute * 60 + p.second + (agora.getTime() % 1000) / 1000 };
}

/** O enfeite que vale agora, ou null. */
export function temaDaData(agora: Date): TemaDaData | null {
  const { ano, mes, dia, segundos } = emBrasilia(agora);
  if (mes === 12 && dia <= 25) return { tema: 'natal' };
  if (mes === 12 && dia === 31) {
    const minutos = Math.ceil((24 * 3600 - segundos) / 60);
    return { tema: 'ano-novo', anoNovo: ano + 1, faltam: { horas: Math.floor(minutos / 60), minutos: minutos % 60 } };
  }
  if (mes === 12) return { tema: 'ano-novo' };
  if (mes === 1 && dia === 1) return { tema: 'ano-novo', anoNovo: ano };
  return null;
}

/* ---------- a escolha de desligar, guardada no navegador ---------- */

const CHAVE = 'promeiro.enfeites';
const AVISO = 'promeiro:enfeites';

export function enfeitesLigados(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== 'desligados';
  } catch {
    return true;
  }
}

export function ligarEnfeites(ligados: boolean) {
  try {
    if (ligados) localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, 'desligados');
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
  window.dispatchEvent(new CustomEvent(AVISO, { detail: ligados }));
}

/** Avisa quando a escolha muda no perfil. */
export function ouvirEnfeites(mudou: (ligados: boolean) => void) {
  const f = (e: Event) => mudou((e as CustomEvent<boolean>).detail);
  window.addEventListener(AVISO, f);
  return () => window.removeEventListener(AVISO, f);
}
