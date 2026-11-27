/* Os turnos como dado da Configuração (#124), como as praças: cada turno tem um id (que a posição guarda e que não
   muda quando o nome muda), o nome e o horário padrão de uma posição nova. Sem nada salvo, valem os de fábrica. A
   ordem é a da grade. São duas listas com as mesmas regras (#175): os turnos da edição (madrugada, manhã, tarde e
   noite: os da escala, do Montar a pauta e da Pauta) e os turnos da arte (manhã e noite), que por enquanto só ficam
   guardados. O mesmo módulo serve ao navegador e ao servidor: só sintaxe que o Node apaga. */
import { horarioEntendido, horarioNoPadrao, lerHorario, TURNOS_DE_FABRICA, type TurnoDaEscala } from './escala.ts';

type Ambiente = Record<string, string | undefined>;

/** Qual das duas listas de turnos da Configuração (#175). */
export type QualTurno = 'edicao' | 'arte';

/** Os dois de fábrica da arte (#175): a manhã e a noite, que vira o dia. */
export const TURNOS_DA_ARTE_DE_FABRICA: readonly TurnoDaEscala[] = [
  { id: 'manha', nome: 'Manhã', horario: '7h às 16h' },
  { id: 'noite', nome: 'Noite', horario: '16h às 0h30' },
];

/** O que muda de uma lista para a outra: a variável da Configuração, o nome da seção e os de fábrica. */
export const DOS_TURNOS: Record<QualTurno, { variavel: string; titulo: string; fabrica: readonly TurnoDaEscala[] }> = {
  edicao: { variavel: 'TURNOS', titulo: 'Turnos da edição', fabrica: TURNOS_DE_FABRICA },
  arte: { variavel: 'TURNOS_DA_ARTE', titulo: 'Turnos da arte', fabrica: TURNOS_DA_ARTE_DE_FABRICA },
};

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
export const turnosDeFabrica = (qual: QualTurno = 'edicao'): TurnoDaEscala[] => DOS_TURNOS[qual].fabrica.map((t) => ({ ...t }));

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

/**
 * Os turnos que valem: os salvos na Configuração (TURNOS ou TURNOS_DA_ARTE, em JSON) ou, sem eles (ou ilegíveis), os
 * de fábrica.
 */
export function turnosDaConfiguracao(env: Ambiente = {}, qual: QualTurno = 'edicao'): TurnoDaEscala[] {
  const bruto = env[DOS_TURNOS[qual].variavel];
  let salvos: unknown = null;
  try {
    salvos = bruto ? JSON.parse(bruto) : null;
  } catch {
    salvos = null;
  }
  const lidos = Array.isArray(salvos) ? turnosArrumados(salvos).filter((t) => t.nome) : [];
  const unicos = lidos.filter((t, i) => lidos.findIndex((o) => o.id === t.id) === i);
  return unicos.length ? unicos : turnosDeFabrica(qual);
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
 * erros (nada é salvo); tirar um turno da edição é aviso (os dias já montados com ele continuam com as posições). Os
 * da arte não estão em nenhuma tela ainda: tirar não avisa nada, e o que muda leva o nome da seção, para não se
 * confundir com a Manhã e a Noite da edição na mesma conferência.
 */
export function conferirTurnos(novos: readonly TurnoDaEscala[], salvos: readonly TurnoDaEscala[], qual: QualTurno = 'edicao'): { ok: boolean; itens: ItemDosTurnos[]; muda: MudancaNosTurnos[] } {
  const titulo = DOS_TURNOS[qual].titulo;
  const itens: ItemDosTurnos[] = [];
  const erro = (detalhe: string) => itens.push({ tipo: 'erro', titulo, detalhe });
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
  if (saem.length && qual === 'edicao') itens.push({ tipo: 'aviso', titulo, detalhe: `${saem.map((t) => t.nome).join(' e ')} sai${saem.length > 1 ? 'em' : ''} da grade; os dias já montados continuam com as posições.` });
  const ok = !itens.some((i) => i.tipo === 'erro');
  if (ok) itens.push({ tipo: 'ok', titulo, detalhe: `${novos.length} ${novos.length === 1 ? 'turno' : 'turnos'}, cada um com o horário padrão.` });
  const muda = ok ? oQueMudaNosTurnos(novos, salvos) : [];
  return { ok, itens, muda: qual === 'edicao' ? muda : muda.map((m) => ({ ...m, oque: `${titulo} · ${m.oque}` })) };
}
