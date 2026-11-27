/* Os turnos como dado da Configuração (#124), como as praças: cada turno tem um id (que a posição guarda e que não
   muda quando o nome muda), o nome e o horário padrão de uma posição nova. Sem nada salvo, valem os de fábrica
   (madrugada, manhã, tarde e noite). A ordem é a da grade. O mesmo módulo serve ao navegador e ao servidor: só
   sintaxe que o Node apaga. */
import { horarioEntendido, horarioNoPadrao, lerHorario, TURNOS_DE_FABRICA, type TurnoDaEscala } from './escala.ts';

type Ambiente = Record<string, string | undefined>;

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '');
/** "Manhã" → "manha"; "Plantão 2" → "plantao-2". */
const idDoNome = (nome: string) =>
  semAcento(nome)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
const comparavel = (nome: string) => semAcento(String(nome ?? '')).toUpperCase().replace(/\s+/g, ' ').trim();
const ID = /^[a-z0-9-]{1,30}$/;

/** Uma cópia dos de fábrica (para ninguém mexer na constante). */
export const turnosDeFabrica = (): TurnoDaEscala[] => TURNOS_DE_FABRICA.map((t) => ({ ...t }));

/**
 * Os turnos como vieram (da Configuração ou do navegador), arrumados: o nome sem os espaços das pontas, o horário no
 * padrão quando o PROMeiro entende e, no turno novo (sem id), o id tirado do nome, sem repetir. Não confere nada: o
 * nome vazio e o horário que não é horário continuam, para a conferência dizer.
 */
export function turnosArrumados(lista: readonly unknown[]): TurnoDaEscala[] {
  const brutos = lista.filter((t): t is Record<string, unknown> => !!t && typeof t === 'object');
  const usados = new Set(brutos.map((t) => String(t.id ?? '')).filter((id) => ID.test(id)));
  return brutos.map((t) => {
    const nome = String(t.nome ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    let id = String(t.id ?? '');
    if (!ID.test(id)) {
      const base = idDoNome(nome) || 'turno';
      id = base;
      for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
      usados.add(id);
    }
    return { id, nome, horario: horarioNoPadrao(String(t.horario ?? '').slice(0, 40)) };
  });
}

/** Os turnos que valem: os salvos na Configuração (TURNOS, em JSON) ou, sem eles (ou ilegíveis), os de fábrica. */
export function turnosDaConfiguracao(env: Ambiente = {}): TurnoDaEscala[] {
  let salvos: unknown = null;
  try {
    salvos = env.TURNOS ? JSON.parse(env.TURNOS) : null;
  } catch {
    salvos = null;
  }
  const lidos = Array.isArray(salvos) ? turnosArrumados(salvos).filter((t) => t.nome) : [];
  const unicos = lidos.filter((t, i) => lidos.findIndex((o) => o.id === t.id) === i);
  return unicos.length ? unicos : turnosDeFabrica();
}

/**
 * Os turnos de um dia: os da Configuração e, no fim, os que saíram dela e ainda têm posição no dia (o nome, o de
 * fábrica ou o id; sem horário padrão), para a posição não sumir da grade.
 */
export function turnosDoDia(turnos: readonly TurnoDaEscala[], posicoes: readonly { turno: string }[]): TurnoDaEscala[] {
  const sobra = [...new Set(posicoes.map((p) => p.turno))].filter((id) => !turnos.some((t) => t.id === id));
  return [...turnos, ...sobra.map((id) => ({ id, nome: TURNOS_DE_FABRICA.find((t) => t.id === id)?.nome ?? id, horario: '' }))];
}

/** Um item da conferência, no formato das outras seções. */
export interface ItemDosTurnos {
  tipo: 'erro' | 'aviso' | 'ok';
  titulo: string;
  detalhe: string;
}
export interface MudancaNosTurnos {
  oque: string;
  antes: string;
  depois: string;
}

/** O que muda dos turnos salvos para os novos (pelo id): o horário de cada um, o nome, o que entra, o que sai, a ordem. */
export function oQueMudaNosTurnos(novos: readonly TurnoDaEscala[], salvos: readonly TurnoDaEscala[]): MudancaNosTurnos[] {
  const muda: MudancaNosTurnos[] = [];
  for (const t of novos) {
    const antes = salvos.find((s) => s.id === t.id);
    if (!antes) muda.push({ oque: t.nome, antes: '—', depois: t.horario || '—' });
    else {
      if (antes.nome !== t.nome) muda.push({ oque: `Nome de ${antes.nome}`, antes: antes.nome, depois: t.nome });
      if (antes.horario !== t.horario) muda.push({ oque: t.nome, antes: antes.horario || '—', depois: t.horario || '—' });
    }
  }
  for (const s of salvos) if (!novos.some((t) => t.id === s.id)) muda.push({ oque: s.nome, antes: s.horario || '—', depois: '—' });
  const ordem = (l: readonly TurnoDaEscala[]) => l.filter((t) => novos.some((n) => n.id === t.id) && salvos.some((s) => s.id === t.id)).map((t) => t.id);
  if (ordem(novos).join() !== ordem(salvos).join()) muda.push({ oque: 'Ordem', antes: salvos.map((t) => t.nome).join(', '), depois: novos.map((t) => t.nome).join(', ') });
  return muda;
}

/**
 * A conferência dos turnos novos: o nome vazio, o nome repetido (sem caixa e acento) e o horário que não é horário são
 * erros (nada é salvo); tirar um turno é aviso (os dias já montados com ele continuam com as posições).
 */
export function conferirTurnos(novos: readonly TurnoDaEscala[], salvos: readonly TurnoDaEscala[]): { ok: boolean; itens: ItemDosTurnos[]; muda: MudancaNosTurnos[] } {
  const itens: ItemDosTurnos[] = [];
  const erro = (detalhe: string) => itens.push({ tipo: 'erro', titulo: 'Turnos', detalhe });
  if (!novos.length) erro('precisa de ao menos um turno.');
  const vistos = new Set<string>();
  for (const t of novos) {
    const c = comparavel(t.nome);
    if (c && vistos.has(c)) erro(`dois turnos chamados "${novos.find((o) => comparavel(o.nome) === c)?.nome}".`);
    vistos.add(c);
  }
  if (novos.some((t) => !t.nome)) erro('um turno está sem nome.');
  for (const t of novos)
    if (t.nome && !t.horario) erro(`o turno ${t.nome} está sem horário.`);
    else if (t.nome && !horarioEntendido(lerHorario(t.horario))) erro(`o horário do turno ${t.nome} não é um horário ("${t.horario}").`);
  const saem = salvos.filter((s) => !novos.some((t) => t.id === s.id));
  if (saem.length) itens.push({ tipo: 'aviso', titulo: 'Turnos', detalhe: `${saem.map((t) => t.nome).join(' e ')} sai${saem.length > 1 ? 'em' : ''} da grade; os dias já montados continuam com as posições.` });
  const ok = !itens.some((i) => i.tipo === 'erro');
  if (ok) itens.push({ tipo: 'ok', titulo: 'Turnos', detalhe: `${novos.length} ${novos.length === 1 ? 'turno' : 'turnos'}, cada um com o horário padrão.` });
  return { ok, itens, muda: ok ? oQueMudaNosTurnos(novos, salvos) : [] };
}
