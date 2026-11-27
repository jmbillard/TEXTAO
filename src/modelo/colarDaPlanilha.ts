/* Montar a pauta, colar da planilha (#130): a regra pura que lê o que foi copiado da planilha da edição (uma aba
   inteira ou só um turno), as mesmas no servidor e no navegador (só sintaxe que o Node apaga). A planilha é uma grade
   visual, sem colunas fixas, e cada aba tem um jeito; por isso a leitura é ancorada em cada célula "EDITOR:": o nome
   fica à direita; o horário, na linha de baixo, à direita de "HORÁRIO:"; a ilha, na linha de cima, na mesma coluna; as
   demandas, nas linhas seguintes (nas duas colunas do bloco), até o próximo bloco; e o turno, pelo último rótulo acima
   (MADRUGADA, MANHÃ, TARDE, NOITE ou um turno da Configuração). Um bloco das 20h, sem rótulo próprio, conta como
   Noite. Ela é tolerante: a ausência no horário ou na primeira demanda vira ausência; a linha em maiúsculas sem data
   vira aviso, e as linhas de uma frase quebrada se juntam; o nome é reconhecido pelo cadastro, pelo apelido (as keys
   dos editores) ou pelo primeiro nome, e o erro de digitação vira pergunta; a ilha, pelo número. Cada bloco leva as
   notas do que foi interpretado, para a pessoa conferir antes de aplicar. */
import { demandaNoPadrao, horarioEntendido, lerDemanda, lerHorario, type IdDoTurno, type PosicaoDaEscala, type TurnoDaEscala } from './escala.ts';
import type { Ausencia, TipoDeAusencia } from './ausencias.ts';
import { TIPOS_DE_ILHA, emOrdem, reconhecerIlha, rotuloDaIlha, salaDaIlha, salaDe, type Ilha } from './ilhas.ts';
import { continua } from './frasePartida.ts';
import { nomeComparavel, umaLetraDeDiferenca } from './ligarPeloNome.ts';

/** O que a regra precisa saber do dia: os turnos, os editores (com os apelidos) e as ilhas cadastradas. */
export interface ContextoDoColado {
  dia: string;
  turnos: readonly TurnoDaEscala[];
  editores: readonly string[];
  /** as keys de cada editor no cadastro (o apelido da planilha), pelo nome */
  apelidos?: Readonly<Record<string, readonly string[]>>;
  ilhas: readonly Ilha[];
}

/**
 * O nome lido: exato (o nome do cadastro), pelo apelido (a key, o primeiro nome ou o começo do nome), parecido (uma
 * letra de diferença: pergunta), ambíguo (serve para mais de um: pergunta), novo (fora dos cadastros) ou vazio.
 * `nome` é o que vai para a posição: sem a resposta da pergunta, o que foi escrito.
 */
export interface NomeLido {
  escrito: string;
  como: 'exato' | 'apelido' | 'parecido' | 'ambiguo' | 'novo' | 'vazio';
  nome: string;
  /** as opções da pergunta (parecido e ambíguo) */
  opcoes: string[];
}
/** A ausência lida: o tipo, o último dia fora (AAAA-MM-DD; null: só o dia), a observação e o texto como estava. */
export interface AusenciaLida {
  tipo: TipoDeAusencia;
  ate: string | null;
  observacao: string;
  escrito: string;
}
/** Um bloco de "EDITOR:", como o PROMeiro entendeu. */
export interface BlocoDoColado {
  /** o lugar do bloco no colado (para a resposta da pergunta) */
  id: string;
  turno: IdDoTurno;
  editor: NomeLido;
  /** a ilha como escrita e a do cadastro ('' sem ilha) */
  ilha: { escrito: string; id: string };
  /** o horário como escrito e no padrão ('' quando não é horário) */
  horario: { escrito: string; padrao: string };
  ausencia: AusenciaLida | null;
  /** as claquetes e as tarefas, como escritas e no padrão */
  demandas: { texto: string; padrao: string; mudou: boolean }[];
  avisos: string[];
  /** o que foi interpretado, para conferir */
  notas: string[];
}
export interface ResumoDoColado {
  posicoes: number;
  demandas: number;
  avisos: number;
  ausencias: number;
  /** as grafias que vão para o padrão: claquetes, horários, nomes e ilhas */
  grafias: number;
  /** os nomes que esperam uma resposta */
  perguntas: number;
  /** os blocos sem editor e sem nada embaixo (não viram posição) */
  vazias: number;
}
export interface LeituraDoColado {
  /** a data da aba (a linha do dia, no alto), quando veio junto */
  diaDaAba: string | null;
  blocos: BlocoDoColado[];
  resumo: ResumoDoColado;
}

/* ---------- a grade ---------- */

const ROTULO_EDITOR = /^EDITOR\s*:?$/;
const ROTULO_HORARIO = /^HORARIO\s*:?$/;
const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
const celulaLimpa = (c: string) => c.replace(/\s+/g, ' ').trim();
const ehEditor = (c: string) => ROTULO_EDITOR.test(semAcento(c));
const dois = (n: number) => String(n).padStart(2, '0');
const somar = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** O texto colado em linhas de células (o Google Sheets copia as células por tab). */
const emLinhas = (texto: string) =>
  String(texto ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.split('\t').map(celulaLimpa));

/** O turno de uma linha de rótulo: a linha só com o nome de um turno (com os espaços da célula mesclada). */
function turnoDoRotulo(linha: readonly string[], turnos: readonly TurnoDaEscala[]): IdDoTurno | null {
  const cheias = linha.filter(Boolean);
  if (cheias.length !== 1) return null;
  const alvo = nomeComparavel(cheias[0]);
  return turnos.find((t) => nomeComparavel(t.nome) === alvo || nomeComparavel(t.id) === alvo)?.id ?? null;
}

/** O turno pelo início do horário, entre os do dia: madrugada (22h–5h), manhã (até 12h), tarde (até 20h), noite. */
function turnoDoHorario(inicio: string, turnos: readonly TurnoDaEscala[]): IdDoTurno | null {
  const h = Number(inicio.slice(0, 2));
  const id = h >= 22 || h < 5 ? 'madrugada' : h < 12 ? 'manha' : h < 20 ? 'tarde' : 'noite';
  return turnos.some((t) => t.id === id) ? id : null;
}

/** A data da aba: a primeira dd/mm/aaaa das primeiras linhas. */
function diaDaAba(linhas: readonly string[][]): string | null {
  for (const l of linhas.slice(0, 6))
    for (const c of l) {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(c);
      if (m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) return `${m[3]}-${dois(+m[2])}-${dois(+m[1])}`;
    }
  return null;
}

/* ---------- a ausência ---------- */

/** A data "d/m" no primeiro ano que a deixa no dia ou depois dele (a volta das férias é para a frente). */
function dataDaFrente(d: number, m: number, dia: string): string | null {
  const ano = Number(dia.slice(0, 4));
  for (const a of [ano, ano + 1]) {
    const iso = `${a}-${dois(m)}-${dois(d)}`;
    if (new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso && iso >= dia) return iso;
  }
  return null;
}

/**
 * A ausência escrita de qualquer jeito: FÉRIAS (ou FERIAS), FOLGA* (FOLGA COMP, FOLGA ANIVER), DM, LICENÇA; o fim de
 * "ATÉ 29/6" ou, de "RETORNO DIA 2/2", o dia antes. O resto do texto vai para a observação. null: não é ausência.
 */
export function lerAusenciaEscrita(texto: string, dia: string): AusenciaLida | null {
  const escrito = celulaLimpa(String(texto ?? ''));
  const n = semAcento(escrito);
  const tipo: TipoDeAusencia | null = /^FERIAS\b/.test(n) ? 'ferias' : /^FOLGA/.test(n) ? 'folga' : /^DM\b/.test(n) ? 'dm' : /^LICENCA\b/.test(n) ? 'licenca' : null;
  if (!tipo) return null;
  const fim = /\b(ATE|RETORNO|VOLTA)\b(?:\s+(?:NO\s+)?DIA)?\s*(\d{1,2})\/(\d{1,2})/.exec(n);
  let ate = fim ? dataDaFrente(+fim[2], +fim[3], dia) : null;
  if (ate && fim && fim[1] !== 'ATE') ate = somar(ate, -1);
  const resto = (fim ? escrito.slice(0, fim.index) + escrito.slice(fim.index + fim[0].length) : escrito)
    .replace(/^\S+/, '')
    .replace(/^[\s\-–:,.]+|[\s\-–:,.]+$/g, '')
    .toLowerCase();
  return { tipo, ate: ate && ate > dia ? ate : null, observacao: resto, escrito };
}

/* ---------- o nome ---------- */

/** O nome do editor pelos cadastros: o nome, a key, o primeiro nome ou o começo de cada palavra; o erro de uma letra. */
export function lerNome(escrito: string, editores: readonly string[], apelidos: Readonly<Record<string, readonly string[]>> = {}): NomeLido {
  const e = celulaLimpa(escrito);
  const alvo = nomeComparavel(e);
  if (!alvo) return { escrito: e, como: 'vazio', nome: '', opcoes: [] };
  const so = (como: NomeLido['como'], nomes: readonly string[]): NomeLido | null => {
    const unicos = [...new Set(nomes)];
    if (!unicos.length) return null;
    if (unicos.length > 1) return { escrito: e, como: 'ambiguo', nome: e, opcoes: unicos.sort((a, b) => a.localeCompare(b, 'pt-BR')) };
    return como === 'parecido' ? { escrito: e, como, nome: e, opcoes: unicos } : { escrito: e, como, nome: unicos[0], opcoes: [] };
  };
  const keys = (nome: string) => (apelidos[nome] ?? []).map(nomeComparavel).filter(Boolean);
  const palavras = (s: string) => nomeComparavel(s).split(' ').filter(Boolean);
  const pelo = (t: string) => {
    const ps = t.split(' ');
    return (
      so('exato', editores.filter((x) => nomeComparavel(x) === t)) ??
      so('apelido', editores.filter((x) => keys(x).includes(t))) ??
      // o começo de cada palavra: "CAIO M" é Caio Mendes; "PAULO" serve para os dois Paulos
      so('apelido', editores.filter((x) => { const w = palavras(x); return ps.length <= w.length && ps.every((p, i) => w[i].startsWith(p)) && (ps.length > 1 || w[0] === ps[0]); }))
    );
  };
  const achado = pelo(alvo);
  if (achado) return achado;
  // a ilha grudada no nome ("GIL 16")
  const semNumero = alvo.replace(/\s+\d+$/, '');
  if (semNumero !== alvo && semNumero) {
    const sem = pelo(semNumero);
    if (sem) return { ...sem, escrito: e, como: sem.como === 'exato' ? 'apelido' : sem.como, nome: sem.como === 'ambiguo' ? e : sem.nome };
  }
  // o erro de digitação: uma letra de diferença no nome, no primeiro nome ou numa key
  if (semNumero.length >= 3) {
    const parecidos = editores.filter((x) => [nomeComparavel(x), palavras(x)[0], ...keys(x)].some((k) => k && k !== semNumero && umaLetraDeDiferenca(k, semNumero)));
    const p = so('parecido', parecidos);
    if (p) return p.como === 'ambiguo' ? { ...p, como: 'parecido', nome: e } : p;
  }
  return { escrito: e, como: 'novo', nome: e, opcoes: [] };
}

/* ---------- a ilha ---------- */

/**
 * A ilha pelo rótulo inteiro, pela sala (AVID 46, ILHA 46 e 46 são a mesma, #165), pelo número (se só uma sala tem)
 * ou pelo nome; a nota diz como foi lida. A ilha escrita com outro tipo do cadastro ("VDI 46" sem a VDI 46) não é
 * lida como a do mesmo número: é outra ilha.
 */
function lerIlha(escrito: string, ilhas: readonly Ilha[]): { id: string; nota: string } {
  if (!escrito) return { id: '', nota: '' };
  const lida = (i: Ilha) => ({ id: i.id, nota: nomeComparavel(rotuloDaIlha(i)).replace(/\s+/g, '') === nomeComparavel(escrito).replace(/\s+/g, '') ? '' : `“${escrito}” lida como ${rotuloDaIlha(i)}` });
  const inteira = reconhecerIlha(escrito, ilhas);
  if (inteira) return lida(inteira);
  const t = nomeComparavel(escrito);
  const numero = /\d+/.exec(t)?.[0];
  if (numero) {
    // o que vem antes do número é o tipo ("AVID 29 - COMUNICAÇÃO")
    const tipo = t.slice(0, t.indexOf(numero)).trim();
    const daSala = emOrdem(ilhas.filter((i) => salaDe(i) === salaDaIlha(`${tipo} ${numero}`)));
    if (daSala.length) return lida(daSala[0]);
    const tipos = new Set([...TIPOS_DE_ILHA, ...ilhas.map((i) => nomeComparavel(i.tipo))]);
    if (tipos.has(tipo)) return { id: '', nota: `“${escrito}” não está no cadastro das ilhas` };
    const doNumero = emOrdem(ilhas.filter((i) => nomeComparavel(i.numero).replace(/^0+/, '') === numero.replace(/^0+/, '')));
    // uma ilha por sala (a primeira das repetidas)
    const porSala = doNumero.filter((i, n) => doNumero.findIndex((x) => salaDe(x) === salaDe(i)) === n);
    if (porSala.length === 1) return lida(porSala[0]);
    if (porSala.length > 1) return { id: '', nota: `“${escrito}” serve para ${porSala.map(rotuloDaIlha).join(' e ')}: escolha na grade` };
    return { id: '', nota: `“${escrito}” não está no cadastro das ilhas` };
  }
  const peloNome = ilhas.filter((i) => i.nome && t.includes(nomeComparavel(i.nome)));
  if (peloNome.length === 1) return lida(peloNome[0]);
  return { id: '', nota: `“${escrito}” não está no cadastro das ilhas` };
}

/* ---------- as demandas e os avisos ---------- */

/** As tarefas que se escrevem em maiúsculas e não são aviso. */
const TAREFAS_EM_MAIUSCULAS = new Set(['COMUNICACAO', 'CALHAUS', 'VINHETAS', 'ARQUIVO GERAL']);
/** A linha com a ilha (do bloco de baixo, ou sobrando): "AVID 22", "ILHA 46", "VDI 5", "AVID 29 - COMUNICAÇÃO". */
const ehLinhaDeIlha = (t: string) => t.length < 26 && /^(AVID|ILHA|VDI)\b\s*(\d|COMUNIC)/.test(semAcento(t));
/** Em maiúsculas: as letras todas maiúsculas, e ao menos três. */
const emMaiusculas = (t: string) => (t.match(/\p{L}/gu) ?? []).length >= 3 && t === t.toLocaleUpperCase('pt-BR');
/* A frase partida em duas linhas (continua): em frasePartida.ts, a mesma regra da info da pauta (#172). */

/* ---------- a leitura ---------- */

/**
 * Lê o que foi colado da planilha: um bloco por "EDITOR:", na ordem da grade (de cima para baixo, da esquerda para a
 * direita), com o resumo. Sem "EDITOR:", nenhum bloco.
 */
export function lerOColado(texto: string, ctx: ContextoDoColado): LeituraDoColado {
  const linhas = emLinhas(texto);
  const blocos: BlocoDoColado[] = [];
  let rotulo: IdDoTurno | null = null;
  const celula = (i: number, j: number) => linhas[i]?.[j] ?? '';
  const fimDoBloco = (i: number) => {
    for (let k = i + 2; k < linhas.length; k++) if (turnoDoRotulo(linhas[k], ctx.turnos) || linhas[k].some(ehEditor) || linhas[k + 1]?.some(ehEditor)) return k;
    return linhas.length;
  };
  linhas.forEach((linha, i) => {
    const t = turnoDoRotulo(linha, ctx.turnos);
    if (t) {
      rotulo = t;
      return;
    }
    linha.forEach((c, j) => {
      if (!ehEditor(c)) return;
      const temHorario = ROTULO_HORARIO.test(semAcento(celula(i + 1, j)));
      const brutas: string[] = [];
      for (let k = i + 2; k < fimDoBloco(i); k++) for (const v of [celula(k, j), celula(k, j + 1)]) if (v) brutas.push(v);
      blocos.push(lerBloco(`b${blocos.length + 1}`, { rotulo, ilha: celula(i - 1, j), nome: celula(i, j + 1), hora: temHorario ? celula(i + 1, j + 1) : '', brutas }, ctx));
    });
  });
  return { diaDaAba: diaDaAba(linhas), blocos, resumo: resumir(blocos) };
}

function lerBloco(id: string, b: { rotulo: IdDoTurno | null; ilha: string; nome: string; hora: string; brutas: string[] }, ctx: ContextoDoColado): BlocoDoColado {
  const notas: string[] = [];
  const editor = lerNome(b.nome, ctx.editores, ctx.apelidos);
  const ilha = lerIlha(b.ilha, ctx.ilhas);
  if (ilha.nota) notas.push(ilha.nota);

  // o horário, ou a ausência no lugar dele
  let ausencia = lerAusenciaEscrita(b.hora, ctx.dia);
  const h = ausencia ? null : lerHorario(b.hora);
  const horario = { escrito: b.hora, padrao: horarioEntendido(h) ? h.padrao : '' };
  if (ausencia) notas.push(`“${b.hora}” no horário: ausência`);
  else if (b.hora && !horario.padrao) notas.push(`“${b.hora}”: não entendi o horário`);

  // as linhas: a ilha que sobra sai, a ausência na primeira, a claquete, a tarefa e o aviso (juntando as quebradas)
  const demandas: BlocoDoColado['demandas'] = [];
  const avisos: { texto: string; linhas: number }[] = [];
  let anterior: 'aviso' | 'outra' | null = null;
  for (const v of b.brutas) {
    if (ehLinhaDeIlha(v)) {
      notas.push(`“${v}” saiu: é uma ilha`);
      continue;
    }
    const fora = anterior === null && !demandas.length && !avisos.length ? lerAusenciaEscrita(v, ctx.dia) : null;
    if (fora) {
      if (!ausencia) {
        ausencia = fora;
        notas.push(`“${v}” na primeira demanda: ausência`);
      }
      anterior = 'outra';
      continue;
    }
    const l = lerDemanda(v, ctx.dia);
    if (l.tipo === 'tarefa' && emMaiusculas(v) && !TAREFAS_EM_MAIUSCULAS.has(nomeComparavel(v))) {
      const ult = avisos.at(-1);
      if (anterior === 'aviso' && ult && continua(ult.texto, v, ult.linhas === 1)) {
        ult.texto = `${ult.texto} ${v}`;
        ult.linhas++;
      } else avisos.push({ texto: v, linhas: 1 });
      anterior = 'aviso';
      continue;
    }
    anterior = 'outra';
    if (l.tipo !== 'vazia') demandas.push({ texto: v, padrao: demandaNoPadrao(v, ctx.dia) || v, mudou: l.padrao !== v });
  }
  const juntados = avisos.filter((a) => a.linhas > 1);
  if (juntados.length) {
    const n = juntados.reduce((s, a) => s + a.linhas, 0);
    notas.push(`${n} linhas juntadas em ${juntados.length} ${juntados.length === 1 ? 'aviso' : 'avisos'}`);
  }

  // o turno: o do rótulo; o bloco das 20h sem rótulo próprio é a noite; sem rótulo nenhum, pelo horário
  let turno = b.rotulo;
  const inicio = horarioEntendido(h) ? h.inicio : '';
  const noite = ctx.turnos.find((t) => t.id === 'noite');
  if (inicio && noite && turno !== 'noite' && /^2[01]:/.test(inicio)) {
    turno = 'noite';
    notas.push(`sem rótulo de turno, das ${Number(inicio.slice(0, 2))}h: lido como ${noite.nome}`);
  }
  if (!turno) {
    turno = (inicio && turnoDoHorario(inicio, ctx.turnos)) || ctx.turnos[0]?.id || 'manha';
    notas.push(`sem rótulo de turno: lido como ${ctx.turnos.find((t) => t.id === turno)?.nome ?? turno}${inicio ? ' pelo horário' : ''}`);
  }
  return { id, turno, editor, ilha: { escrito: b.ilha, id: ilha.id }, horario, ausencia, demandas, avisos: avisos.map((a) => a.texto), notas };
}

/** O bloco vira posição quando tem alguém presente ou alguma coisa embaixo. */
const viraPosicao = (b: BlocoDoColado) => b.demandas.length > 0 || b.avisos.length > 0 || (!b.ausencia && b.editor.como !== 'vazio');

function resumir(blocos: readonly BlocoDoColado[]): ResumoDoColado {
  const conta = (f: (b: BlocoDoColado) => number) => blocos.reduce((n, b) => n + f(b), 0);
  return {
    posicoes: blocos.filter(viraPosicao).length,
    demandas: conta((b) => b.demandas.length),
    avisos: conta((b) => b.avisos.length),
    ausencias: blocos.filter((b) => b.ausencia).length,
    // as grafias que vão para algum lugar: o horário e a ilha de um bloco vazio não vão
    grafias: conta((b) => {
      const vai = viraPosicao(b);
      const ilhaLida = b.notas.some((n) => n.startsWith(`“${b.ilha.escrito}” lida como`));
      return b.demandas.filter((d) => d.mudou).length + +(vai && !!b.horario.padrao && b.horario.padrao !== b.horario.escrito) + +(b.editor.como === 'apelido') + +(vai && !!b.ilha.id && ilhaLida);
    }),
    perguntas: blocos.filter((b) => b.editor.como === 'parecido' || b.editor.como === 'ambiguo').length,
    vazias: blocos.filter((b) => !viraPosicao(b) && !b.ausencia).length,
  };
}

/* ---------- aplicar ---------- */

export interface ComoAplicar {
  dia: string;
  /** os turnos do dia (a vaga de quem está fora fica com o horário do turno) */
  turnos: readonly TurnoDaEscala[];
  /** as posições do rascunho de agora */
  posicoes: readonly PosicaoDaEscala[];
  /** substituir o rascunho, ou juntar a ele */
  modo: 'substituir' | 'juntar';
  /** a resposta de cada pergunta, pelo id do bloco: o nome escolhido ('' ou sem resposta: como foi escrito) */
  respostas: Readonly<Record<string, string>>;
  /** quem já está fora no dia (não é marcado de novo) */
  jaFora: readonly string[];
  novoId: (prefixo: string) => string;
}

/** O nome que vai para a posição: o do cadastro, a resposta da pergunta ou o escrito. */
const nomeFinal = (b: BlocoDoColado, respostas: Readonly<Record<string, string>>) => {
  const r = respostas[b.id];
  return r && b.editor.opcoes.includes(r) ? r : b.editor.nome;
};
const cadastrado = (b: BlocoDoColado, respostas: Readonly<Record<string, string>>) => b.editor.como === 'exato' || b.editor.como === 'apelido' || b.editor.opcoes.includes(respostas[b.id] ?? '');

/**
 * O rascunho depois de aplicar o colado, e as ausências a marcar. Substituir troca as posições; juntar põe as novas
 * depois das de agora, e a posição do mesmo editor no mesmo turno ganha só as demandas e os avisos que ela não tem.
 * Quem está fora deixa a posição vaga (com as demandas, quando tem) e entra nas ausências, se é dos cadastros e ainda
 * não está fora no dia.
 */
export function aplicarOColado(leitura: LeituraDoColado, como: ComoAplicar): { posicoes: PosicaoDaEscala[]; ausencias: Omit<Ausencia, 'id'>[] } {
  const { dia, respostas, novoId } = como;
  const horarioDoTurno = (id: string) => como.turnos.find((t) => t.id === id)?.horario ?? '';
  const novas: PosicaoDaEscala[] = leitura.blocos.filter(viraPosicao).map((b) => ({
    id: novoId('p'),
    turno: b.turno,
    editor: b.ausencia ? '' : nomeFinal(b, respostas),
    ilha: b.ilha.id,
    horario: b.horario.padrao || (b.ausencia ? horarioDoTurno(b.turno) : b.horario.escrito),
    demandas: b.demandas.map((d) => ({ id: novoId('d'), texto: d.padrao })),
    avisos: b.avisos.map((texto) => ({ id: novoId('a'), texto })),
  }));

  let posicoes: PosicaoDaEscala[];
  if (como.modo === 'substituir') posicoes = novas;
  else {
    posicoes = como.posicoes.map((p) => ({ ...p, demandas: [...p.demandas], avisos: [...p.avisos] }));
    for (const n of novas) {
      const mesma = n.editor.trim() && posicoes.find((p) => p.turno === n.turno && nomeComparavel(p.editor) === nomeComparavel(n.editor));
      if (!mesma) {
        posicoes.push(n);
        continue;
      }
      const tem = (lista: readonly { texto: string }[], texto: string) => lista.some((x) => nomeComparavel(demandaNoPadrao(x.texto, dia)) === nomeComparavel(texto));
      mesma.demandas.push(...n.demandas.filter((d) => !tem(mesma.demandas, d.texto)));
      mesma.avisos.push(...n.avisos.filter((a) => !tem(mesma.avisos, a.texto)));
      if (!mesma.ilha) mesma.ilha = n.ilha;
    }
  }

  const fora = new Set(como.jaFora.map(nomeComparavel));
  const ausencias: Omit<Ausencia, 'id'>[] = [];
  for (const b of leitura.blocos) {
    if (!b.ausencia || !cadastrado(b, respostas)) continue;
    const editor = nomeFinal(b, respostas);
    if (fora.has(nomeComparavel(editor))) continue;
    fora.add(nomeComparavel(editor));
    const comPeriodo = b.ausencia.tipo === 'ferias' || b.ausencia.tipo === 'licenca';
    ausencias.push({ editor, tipo: b.ausencia.tipo, de: dia, ate: comPeriodo && b.ausencia.ate ? b.ausencia.ate : dia, observacao: b.ausencia.observacao });
  }
  return { posicoes, ausencias };
}

