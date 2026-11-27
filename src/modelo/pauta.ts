/* A pauta da edição (#94): as regras puras da Semana, as mesmas no servidor e no navegador (só sintaxe que o Node
   apaga). Cada linha da tabela EDICAO_producao do Teable vira uma claquete, uma tarefa ou um aviso; o turno sai do
   início e do fim do expediente, no fuso de São Paulo; o dia da pauta é o campo data (um turno que passa da
   meia-noite conta no dia em que começou). Os editores vêm na ordem do turno de costume; sem editor, no fim. As versões
   da chamada (#95) saem do código no fim da claquete, já resolvidas em etiquetas legíveis. A claquete cruza com as
   Produções (#96) pela chave. Os filtros pessoais e o resumo do administrador (#99) também moram aqui. */
import type { ForaNaPauta } from './ausencias.ts';
import { PARADAS, continua } from './frasePartida.ts';
import { nomeComparavel } from './ligarPeloNome.ts';
import type { Etapa } from './producao.ts';
import { chaveDaClaquete, chaveDaClaqueteNoPadrao, lerDataDaClaquete } from './vocabularios.ts';

export type TipoDaLinha = 'claquete' | 'tarefa' | 'aviso' | 'info';

/** O turno, em horas de São Paulo ("22:00" a "06:00": passa da meia-noite). */
export interface Turno {
  inicio: string;
  fim: string;
}

/** Uma linha da pauta, como a rota da Semana devolve. */
export interface LinhaDaPauta {
  id: string;
  /** o dia da pauta (AAAA-MM-DD) */
  dia: string;
  /** o editor; '' é o grupo "sem editor" */
  editor: string;
  tipo: TipoDaLinha;
  /** a claquete, a tarefa ou o texto do aviso, como está no Teable */
  texto: string;
  turno: Turno | null;
  /** as versões da chamada, já resolvidas (#95), na ordem do código; [] sem código */
  versoes: Versao[];
  /** o texto sem o código das versões (o texto inteiro, sem versões) */
  semVersao: string;
  /** só na claquete (#96): a chave da ficha, a mesma nas linhas da mesma atração com versões diferentes */
  chave?: string;
  /** só na claquete (#96): as Produções achadas pela chave, uma por praça; [] é "sem card" */
  producoes?: ProducaoNaPauta[];
  /** só na claquete da posição (#172, colunasDoDia e gradeDaSemana): as infos que vieram logo depois dela */
  infos?: string[];
}

/** O que a pauta mostra de uma Produção (#96). */
export interface ProducaoNaPauta {
  id: string;
  claquete: string;
  /** a sigla da praça ('' sem ela) */
  praca: string;
  etapa: Etapa;
  /** quantas artes a produzir, cada uma uma vez; null sem a lista */
  artes: number | null;
  designers: string[];
  /** a prioridade ALTA da produção da arte (o marca-texto, como na agenda) */
  alta: boolean;
  entradaEm: string | null;
  entregaEm: string | null;
  /** as versões lidas do roteiro da Produção (#152), quando ele está no PROMeiro e as artes dizem */
  versoesLidas?: Versao[];
}

/** A Semana da pauta: a rota GET /api/pauta/semana. */
export interface SemanaDaPauta {
  /** a segunda-feira (AAAA-MM-DD) */
  inicio: string;
  /** de segunda a domingo */
  dias: string[];
  /** na ordem do turno de costume; '' (sem editor) no fim, quando há */
  editores: string[];
  linhas: LinhaDaPauta[];
  /** a hora da última alteração da pauta na semana (ISO), ou null */
  alteradoEm: string | null;
}

/** O que a rota da pauta devolve além do período (#99): o filtro, quem a pessoa é, o resumo e de onde veio a pauta. */
export interface LeituraDaPauta {
  /** o filtro aplicado (null: todas as linhas) */
  filtro: FiltroDaPauta | null;
  /** o editor ligado ao e-mail da pessoa e o designer dela (null: sem ligação); dizem que filtros ela tem */
  voce: { editor: string | null; designer: string | null };
  /** só para administradores: da pauta inteira do período, sem o filtro */
  resumo?: ResumoDaPauta;
  /** 'copia': o Postgres do Teable não respondeu, e a pauta saiu da última cópia local, tirada em `copiaEm` */
  origem: 'banco' | 'copia';
  copiaEm: string | null;
  /** quem está fora em cada dia (#128): o motivo e a observação só para a coordenação e os administradores */
  fora?: ForaNaPauta[];
}

const FUSO = 'America/Sao_Paulo';
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;
/** São Paulo não tem horário de verão desde 2019: a semana começa às 00:00 de -03:00. */
const DESLOCAMENTO = '-03:00';

const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** O dia (AAAA-MM-DD) de um instante, em São Paulo. */
export const diaEmSaoPaulo = (instante: Date | number = Date.now()) => new Date(instante).toLocaleDateString('en-CA', { timeZone: FUSO });
const horaEmSaoPaulo = (instante: Date) => instante.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** O dia (AAAA-MM-DD) pedido; um dia que não é data vale hoje. */
export function diaOuHoje(dia: string, hoje = diaEmSaoPaulo()): string {
  const d = DIA_ISO.test(dia) ? new Date(`${dia}T12:00:00Z`) : null;
  // "2026-02-30" não é data (o Date passaria para março)
  return d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia ? dia : hoje;
}

/** A segunda-feira da semana de um dia (AAAA-MM-DD); um dia que não é data vale hoje. */
export function segundaDaSemana(dia: string, hoje = diaEmSaoPaulo()): string {
  const iso = DIA_ISO.test(dia) && !Number.isNaN(Date.parse(`${dia}T12:00:00Z`)) ? dia : hoje;
  const semana = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 domingo
  return somarDias(iso, -((semana + 6) % 7));
}

/** Os sete dias da semana, de segunda a domingo. */
export const diasDaSemana = (segunda: string) => Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
export const semanaVizinha = (segunda: string, n: number) => somarDias(segunda, 7 * n);

/** O período de alguns dias para a consulta: [00:00 do primeiro, 00:00 do dia depois do último), em São Paulo, como ISO. */
export const periodoDosDias = (primeiro: string, n: number): [string, string] => [new Date(`${primeiro}T00:00:00${DESLOCAMENTO}`).toISOString(), new Date(`${somarDias(primeiro, n)}T00:00:00${DESLOCAMENTO}`).toISOString()];
/** O período da semana para a consulta: [00:00 de segunda, 00:00 da segunda seguinte), em São Paulo, como ISO. */
export const periodoDaSemana = (segunda: string) => periodoDosDias(segunda, 7);
export const diaVizinho = (dia: string, n: number) => somarDias(dia, n);

/**
 * Claquete é a linha com a forma de claquete: o nome da atração e, depois dele, a data ("Terra 24/11-2",
 * "Fut(Copabr)6/12"), pela mesma leitura da data das claquetes do roteiro. Com a caixinha de anotação marcada, é
 * um aviso para o editor. Do resto, a instrução para o editor é info (#172, ehInfo); o trabalho (COMUNICAÇÃO,
 * CALHAUS, uma peça sem data) é tarefa.
 */
export function tipoDaLinha(texto: string, anotacao: unknown): TipoDaLinha {
  if (anotacao === true || anotacao === 'true' || anotacao === 1) return 'aviso';
  const data = lerDataDaClaquete(texto);
  if (data && /\p{L}/u.test(texto.slice(0, data.inicio))) return 'claquete';
  return ehInfo(texto) ? 'info' : 'tarefa';
}

/** Os verbos conjugados que abrem uma instrução ("ENTRA SÁBADO", "VIRA B", "REDUZ DA ..."); o infinitivo (-AR, -ER,
    -IR) vale por si. */
const VERBOS = new Set(['VAI', 'VAO', 'VEM', 'VEEM', 'ENTRA', 'ENTRAM', 'VIRA', 'VIRAM', 'DEVE', 'DEVEM', 'DEVEMOS', 'VAMOS', 'PRECISA', 'TRANSFORMA', 'REDUZ', 'TROCA', 'FICA', 'SAI', 'TIRA', 'USA', 'PEGA', 'CONTINUA', 'FAZ', 'MUDA', 'MANDA', 'ACOMPANHA', 'TEM']);
/** O que vem logo depois do sujeito numa instrução ("REDATOR VAI ACOMPANHAR", "PROMO VAI INDICAR"). */
const DEPOIS_DO_SUJEITO = new Set(['VAI', 'VAO', 'VEM', 'DEVE', 'DEVEM', 'PRECISA', 'VAMOS']);
/** O que abre um recado sem verbo ("INFORMAÇÕES COM ...", "OBS: ..."). */
const RECADOS = new Set(['INFO', 'INFORMACAO', 'INFORMACOES', 'OBS', 'OBSERVACAO', 'ATENCAO']);

/**
 * A linha (que não é claquete) é uma instrução para o editor, e não trabalho (#172): começa por um verbo (no infinitivo,
 * "TRANSFORMAR DA A B", ou conjugado, "ENTRA SÁBADO"), tem "vai", "vem" ou "deve" logo depois do sujeito ("REDATOR
 * VAI ACOMPANHAR"), ou começa por uma palavra que continua a frase de cima ("DA ANA PRADO") ou de recado. O resto
 * (COMUNICAÇÃO, PROJETO CALHAUS, LANÇAMENTO ..., uma peça sem data) é tarefa.
 */
export function ehInfo(texto: string): boolean {
  const [primeira = '', segunda = ''] = nomeComparavel(texto).split(' ');
  if (!/^\p{L}+$/u.test(primeira)) return false;
  return (primeira.length >= 3 && /(AR|ER|IR)$/.test(primeira)) || VERBOS.has(primeira) || DEPOIS_DO_SUJEITO.has(segunda) || PARADAS.has(primeira) || RECADOS.has(primeira);
}

/**
 * As claquetes e as tarefas de uma posição (um editor num dia), na ordem da pauta, com as infos (#172) separadas: a info
 * vai com a claquete de antes (o aviso marcado no meio não conta); sem claquete antes (no começo, ou depois de uma
 * tarefa), fica na posição. A frase partida em duas linhas volta a ser uma (continua, a regra do colar da planilha): a
 * linha que continua a info de cima entra nela, mesmo que sozinha parecesse tarefa ("... SEGUNDO A" e "PREMIAÇÃO").
 */
export function separarAsInfos(ls: readonly LinhaDaPauta[]): { itens: LinhaDaPauta[]; infos: string[] } {
  const itens: LinhaDaPauta[] = [];
  const infos: string[] = [];
  let ultima: string[] | null = null; // a lista em que a última info entrou
  let dono: LinhaDaPauta | null = null; // a claquete que leva as infos que vierem
  for (const l of ls) {
    if (l.tipo === 'aviso') continue;
    const anterior = ultima?.at(-1);
    if (ultima && anterior !== undefined && l.tipo !== 'claquete' && continua(anterior, l.texto, false)) {
      ultima[ultima.length - 1] = `${anterior} ${l.texto}`;
      continue;
    }
    if (l.tipo === 'info') {
      ultima = dono ? (dono.infos ??= []) : infos;
      ultima.push(l.texto);
      continue;
    }
    ultima = null;
    const item: LinhaDaPauta = l.tipo === 'claquete' ? { ...l, infos: [] } : l;
    dono = l.tipo === 'claquete' ? item : null;
    itens.push(item);
  }
  return { itens, infos };
}

/** O nome do editor, do link do Teable ({ title }, a lista deles ou o texto, também em JSON). */
export function nomeDoEditor(v: unknown): string {
  if (typeof v === 'string') {
    const t = v.trim();
    if (/^[[{]/.test(t)) {
      try {
        return nomeDoEditor(JSON.parse(t));
      } catch {
        return t;
      }
    }
    return t;
  }
  if (Array.isArray(v)) return nomeDoEditor(v[0]);
  if (v && typeof v === 'object' && 'title' in v) return nomeDoEditor((v as { title: unknown }).title);
  return '';
}

const instante = (v: unknown): Date | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** O dia da pauta do campo data: o dia só ("2026-11-24") ou o instante, lido em São Paulo. */
function diaDoCampo(v: unknown): string {
  if (typeof v === 'string' && DIA_ISO.test(v.trim())) return v.trim();
  const d = instante(v);
  return d ? diaEmSaoPaulo(d) : '';
}

/** Uma linha como vem do Postgres do Teable. */
export interface LinhaBruta {
  id?: unknown;
  claquete?: unknown;
  editor?: unknown;
  data?: unknown;
  expediente_inicio?: unknown;
  expediente_fim?: unknown;
  anotacao?: unknown;
}

/** A linha bruta como a Semana mostra; null quando não tem dia (nem a data nem o início do expediente). */
export function linhaDaPauta(b: LinhaBruta): LinhaDaPauta | null {
  const inicio = instante(b.expediente_inicio);
  const fim = instante(b.expediente_fim);
  // o dia é o da data; sem ela, o do início do expediente (o turno conta no dia em que começou)
  const dia = diaDoCampo(b.data) || (inicio ? diaEmSaoPaulo(inicio) : '');
  if (!dia) return null;
  const texto = String(b.claquete ?? '').trim();
  const tipo = tipoDaLinha(texto, b.anotacao);
  // a claquete mostra qualquer código (o desconhecido, cru); a tarefa sem data ("ESPECIAL (MES)"), só o conhecido; o
  // aviso é um recado, não tem versão
  const lidas = tipo === 'aviso' || tipo === 'info' ? null : lerVersoes(texto, dia);
  const { versoes, semVersao } = lidas && (tipo === 'claquete' || lidas.versoes.every((v) => v.conhecida)) ? lidas : { versoes: [], semVersao: texto };
  return {
    id: String(b.id ?? ''),
    dia,
    editor: nomeDoEditor(b.editor),
    tipo,
    texto,
    turno: inicio ? { inicio: horaEmSaoPaulo(inicio), fim: fim ? horaEmSaoPaulo(fim) : '' } : null,
    versoes,
    semVersao,
  };
}

/* ---------- as versões da chamada (#95) ---------- */

/** Uma versão da chamada: o código dela, como está escrito na claquete, e o que ele quer dizer (a tela mostra só o
    código no padrão, codigoDasVersoes; o rótulo vai na dica). */
export interface Versao {
  /** a letra ("A", "p") ou o código inteiro ("DIA", "MÊS", "MNT"), na grafia da claquete */
  codigo: string;
  /** "amanhã", "hoje", "nesta sex", "próxima sex", "dia 28", "em janeiro", "manutenção da grade"; o desconhecido, cru */
  rotulo: string;
  /** false: um código que o PROMeiro não conhece, que aparece cru */
  conhecida: boolean;
  /** só nas versões lidas do roteiro (#120): veio só do dia da semana, sem "nesta" nem "próxima"; a tela pede conferir */
  aConferir?: true;
}

/** Os dias da semana curtos (domingo é 0) e os meses por extenso, nas etiquetas das versões (também as do roteiro, #120). */
export const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
/** Uma combinação de letras, cada uma uma versão, sem repetir. */
const LETRAS = /^(?!.*(.).*\1)[AHNPDM]{1,6}$/;
const INTEIROS = new Set(['DIA', 'MES', 'MNT']);
const conhecido = (bruto: string) => LETRAS.test(semAcento(bruto)) || INTEIROS.has(semAcento(bruto));

/**
 * A data da versão: a escrita na claquete (dia e mês), no ano que a deixa mais perto do dia da linha (a claquete de
 * janeiro numa pauta de dezembro é do ano seguinte); sem ela, o dia da linha. null quando nenhum dos dois é data.
 */
export function dataDaVersao(claquete: string, diaDaLinha: string): Date | null {
  const linha = DIA_ISO.test(diaDaLinha) ? new Date(`${diaDaLinha}T12:00:00Z`) : null;
  const daLinha = linha && !Number.isNaN(linha.getTime()) ? linha : null;
  const lida = lerDataDaClaquete(claquete);
  if (!lida) return daLinha;
  const ano = daLinha?.getUTCFullYear() ?? new Date().getUTCFullYear();
  const perto = (d: Date) => Math.abs(d.getTime() - (daLinha ?? d).getTime());
  return (
    [ano - 1, ano, ano + 1]
      .map((a) => new Date(Date.UTC(a, lida.mes - 1, lida.dia, 12)))
      // 29/2 fora do ano bissexto não é data
      .filter((d) => d.getUTCDate() === lida.dia)
      .sort((a, b) => perto(a) - perto(b))[0] ?? daLinha
  );
}

/** A etiqueta de uma letra ou de um código inteiro (já sem acento e em maiúsculas). */
function rotuloDaVersao(codigo: string, data: Date | null): string {
  const semana = data ? SEMANA_CURTA[data.getUTCDay()] : '…';
  // sábado e domingo: "neste", "próximo"
  const masculino = data ? data.getUTCDay() % 6 === 0 : false;
  switch (codigo) {
    case 'A':
      return 'amanhã';
    case 'H':
      return 'hoje';
    case 'N':
      return `${masculino ? 'neste' : 'nesta'} ${semana}`;
    case 'P':
      return `${masculino ? 'próximo' : 'próxima'} ${semana}`;
    case 'M':
    case 'MES':
      return `em ${data ? MESES[data.getUTCMonth()] : '…'}`;
    case 'MNT':
      return 'manutenção da grade';
    default: // D e DIA
      return `dia ${data ? data.getUTCDate() : '…'}`;
  }
}

/**
 * As versões da chamada no fim da claquete, na ordem em que aparecem, e a claquete sem o código.
 * - O código vem entre parênteses no fim ("(AH)", "( AH )"); depois da data, também sem parênteses ("4/12 NAH"), mas
 *   aí só um código conhecido (a praça e a versão da arte no fim, "SP", "B", não são código).
 * - Cada letra é uma versão: A amanhã, H hoje, N nesta <dia da semana>, P próxima <dia da semana>, D dia X, M em <mês>
 *   (#114). DIA (= D), MES/MÊS (= M) e MNT (manutenção da grade) são inteiros. Em qualquer caixa, com ou sem acento.
 * - O dia da semana, o número e o mês saem da data escrita na claquete; sem ela, do dia da linha da pauta.
 * - Um código entre parênteses que não é nada disso aparece cru (conhecida: false).
 */
export function lerVersoes(claquete: string, diaDaLinha: string): { versoes: Versao[]; semVersao: string } {
  const texto = claquete.trim();
  const data = lerDataDaClaquete(texto);
  const depoisDaData = (i: number) => !data || i >= data.fim;
  const entreParenteses = /\(\s*([^()]*?)\s*\)$/u.exec(texto);
  const solto = /(?<=\s)(\p{L}+)$/u.exec(texto);
  let achado: RegExpExecArray | null = null;
  if (entreParenteses) {
    if (entreParenteses[1] && depoisDaData(entreParenteses.index)) achado = entreParenteses;
  } else if (solto && data && depoisDaData(solto.index) && conhecido(solto[1])) achado = solto;
  if (!achado) return { versoes: [], semVersao: texto };
  const bruto = achado[1];
  const semVersao = texto.slice(0, achado.index).trimEnd();
  const codigo = semAcento(bruto);
  if (!conhecido(bruto)) return { versoes: [{ codigo: bruto, rotulo: bruto, conhecida: false }], semVersao };
  const quando = dataDaVersao(texto, diaDaLinha);
  if (INTEIROS.has(codigo)) return { versoes: [{ codigo: bruto, rotulo: rotuloDaVersao(codigo, quando), conhecida: true }], semVersao };
  return { versoes: [...bruto].map((letra) => ({ codigo: letra, rotulo: rotuloDaVersao(semAcento(letra), quando), conhecida: true })), semVersao };
}

/**
 * O código das versões como o PROMeiro mostra: o do padrão, uma letra maiúscula por versão, na ordem escrita, entre
 * parênteses ("(AH)", "(PNAH)"); DIA vira D, MES e MÊS viram M, MNT fica inteiro. O código desconhecido aparece cru,
 * entre parênteses. '' sem versão.
 */
export function codigoDasVersoes(versoes: readonly Versao[]): string {
  if (!versoes.length) return '';
  if (versoes.some((v) => !v.conhecida)) return `(${versoes.map((v) => v.codigo).join('')})`;
  const letra = (c: string) => (c === 'DIA' ? 'D' : c === 'MES' ? 'M' : c);
  return `(${versoes.map((v) => letra(semAcento(v.codigo))).join('')})`;
}

/** O nome que a tela mostra, sem o código de versão no fim (a mesma leitura da Pauta, lerVersoes): o código volta,
    uma vez só e no padrão, como o sufixo das versões (#152), se a pessoa liga. Só para mostrar: a claquete guardada, a chave e o que vai ao Trello e ao Teable não
    mudam. Sem código, o nome como está. */
export const nomeSemAsVersoes = (nome: string): string => lerVersoes(nome, '').semVersao;

/** O que o código quer dizer, para a dica ao passar o mouse: "amanhã e hoje", "amanhã, hoje e nesta sex". */
export function leituraDasVersoes(versoes: readonly Versao[]): string {
  const rotulos = versoes.map((v) => (v.conhecida ? `${v.rotulo}${v.aConferir ? '?' : ''}` : `${v.codigo}, que o PROMeiro não conhece`));
  return rotulos.length > 1 ? `${rotulos.slice(0, -1).join(', ')} e ${rotulos[rotulos.length - 1]}` : (rotulos[0] ?? '');
}

/** Os minutos do início do turno, num dia que começa às 6h (a madrugada vem depois da noite). */
const minutosNoDia = (hora: string) => {
  const [h, m] = hora.split(':').map(Number);
  return ((h + 18) % 24) * 60 + m;
};
const chaveDoTurno = (t: Turno) => `${t.inicio}-${t.fim}`;

/** O turno que mais se repete; no empate, o que começa mais cedo (num dia que começa às 6h). */
function turnoQueMaisSeRepete(turnos: Iterable<Turno>): Turno | null {
  const conta = new Map<string, { t: Turno; n: number }>();
  for (const t of turnos) conta.set(chaveDoTurno(t), { t, n: (conta.get(chaveDoTurno(t))?.n ?? 0) + 1 });
  return [...conta.values()].sort((a, b) => b.n - a.n || minutosNoDia(a.t.inicio) - minutosNoDia(b.t.inicio))[0]?.t ?? null;
}

/**
 * Os editores da semana na ordem do turno de costume (o turno que mais se repete nos dias dele; no empate, o que
 * começa mais cedo), de manhã à madrugada; depois, pelo nome. Quem não tem turno vem depois; sem editor (''), no fim.
 */
export function ordemDosEditores(linhas: readonly LinhaDaPauta[]): string[] {
  const turnos = new Map<string, Map<string, Turno>>(); // editor → dia → turno
  for (const l of linhas) {
    if (!turnos.has(l.editor)) turnos.set(l.editor, new Map());
    if (l.turno && !turnos.get(l.editor)!.has(l.dia)) turnos.get(l.editor)!.set(l.dia, l.turno);
  }
  const nomes = [...turnos.keys()].filter((e) => e !== '');
  const costume = new Map(nomes.map((e) => [e, turnoQueMaisSeRepete(turnos.get(e)!.values())]));
  nomes.sort((a, b) => {
    const ta = costume.get(a);
    const tb = costume.get(b);
    if (!ta || !tb) return ta ? -1 : tb ? 1 : a.localeCompare(b, 'pt-BR');
    return minutosNoDia(ta.inicio) - minutosNoDia(tb.inicio) || minutosNoDia(ta.fim || ta.inicio) - minutosNoDia(tb.fim || tb.inicio) || a.localeCompare(b, 'pt-BR');
  });
  return turnos.has('') ? [...nomes, ''] : nomes;
}

/** Uma célula da Semana editor × dia: o turno e as linhas daquele editor naquele dia. */
export interface CelulaDaSemana {
  dia: string;
  /** o turno que mais aparece nas linhas da célula */
  turno: Turno | null;
  /** as claquetes e as tarefas, na ordem da pauta (a claquete com as infos dela, #172) */
  itens: LinhaDaPauta[];
  /** as infos sem claquete antes (#172): ficam na posição */
  infos: string[];
  avisos: LinhaDaPauta[];
}

/** A grade editor × dia: uma fileira por editor (na ordem da semana), uma célula por dia. */
export function gradeDaSemana(s: Pick<SemanaDaPauta, 'dias' | 'editores' | 'linhas'>): { editor: string; celulas: CelulaDaSemana[] }[] {
  return s.editores.map((editor) => ({
    editor,
    celulas: s.dias.map((dia) => {
      const doDia = s.linhas.filter((l) => l.editor === editor && l.dia === dia);
      const turno = turnoQueMaisSeRepete(doDia.flatMap((l) => (l.turno ? [l.turno] : [])));
      return { dia, turno, ...separarAsInfos(doDia), avisos: doDia.filter((l) => l.tipo === 'aviso') };
    }),
  }));
}

/* ---------- o Dia (#97): cada editor numa coluna ---------- */

/** O Dia da pauta: a rota GET /api/pauta/dia. */
export interface DiaDaPauta {
  /** o dia (AAAA-MM-DD) */
  dia: string;
  /** na ordem de início do turno daquele dia; '' (sem editor) no fim, quando há */
  editores: string[];
  linhas: LinhaDaPauta[];
  /** a hora da última alteração da pauta no dia (ISO), ou null */
  alteradoEm: string | null;
}

/** Uma coluna do Dia: o editor, o turno dele naquele dia, as claquetes e tarefas e, à parte, os avisos. */
export interface ColunaDoDia {
  editor: string;
  turno: Turno | null;
  itens: LinhaDaPauta[];
  /** as infos sem claquete antes (#172): ficam na posição */
  infos: string[];
  avisos: LinhaDaPauta[];
}

/** Quantos minutos depois das 6h da régua do Dia (das 6h às 6h) fica uma hora ("05:00" vem no fim, às 23h da régua). */
export const naRegua = (hora: string) => minutosNoDia(hora);
/** O fim do turno na régua: o que passa das 6h do dia seguinte (ou não tem fim) para no fim da régua. */
export const fimNaRegua = (t: Turno) => {
  const fim = t.fim ? minutosNoDia(t.fim) : 24 * 60;
  return fim > minutosNoDia(t.inicio) ? fim : 24 * 60;
};

/**
 * As colunas do Dia: uma por editor, na ordem de início do turno daquele dia (o dia começa às 6h, a madrugada vem
 * depois da noite); no empate, quem sai antes, depois pelo nome. Quem não tem turno vem depois; sem editor (''), no fim.
 */
export function colunasDoDia(linhas: readonly LinhaDaPauta[]): ColunaDoDia[] {
  const doEditor = new Map<string, LinhaDaPauta[]>();
  for (const l of linhas) doEditor.set(l.editor, [...(doEditor.get(l.editor) ?? []), l]);
  const colunas = [...doEditor].map(([editor, ls]) => ({
    editor,
    turno: turnoQueMaisSeRepete(ls.flatMap((l) => (l.turno ? [l.turno] : []))),
    ...separarAsInfos(ls),
    avisos: ls.filter((l) => l.tipo === 'aviso'),
  }));
  return colunas.sort((a, b) => {
    if (!a.editor || !b.editor) return a.editor ? -1 : b.editor ? 1 : 0;
    if (!a.turno || !b.turno) return a.turno ? -1 : b.turno ? 1 : a.editor.localeCompare(b.editor, 'pt-BR');
    return naRegua(a.turno.inicio) - naRegua(b.turno.inicio) || fimNaRegua(a.turno) - fimNaRegua(b.turno) || a.editor.localeCompare(b.editor, 'pt-BR');
  });
}

/** Quantos minutos da régua do Dia (das 6h às 6h do dia seguinte, em São Paulo) já passaram; null fora dela. */
export function agoraNaRegua(dia: string, agora: Date | number = Date.now()): number | null {
  const seis = Date.parse(`${dia}T06:00:00${DESLOCAMENTO}`);
  const minutos = (new Date(agora).getTime() - seis) / 60_000;
  return Number.isNaN(minutos) || minutos < 0 || minutos >= 24 * 60 ? null : minutos;
}

/** O dia da pauta de agora: o da régua que está correndo (antes das 6h, a madrugada ainda é do dia anterior). */
export const diaDaPautaAgora = (agora: Date | number = Date.now()) => diaEmSaoPaulo(new Date(agora).getTime() - 6 * 3_600_000);

/** O turno está no ar agora (na régua do dia: das 6h às 6h). */
export function noArAgora(dia: string, turno: Turno | null, agora: Date | number = Date.now()): boolean {
  const m = agoraNaRegua(dia, agora);
  return !!turno && m !== null && m >= naRegua(turno.inicio) && m < fimNaRegua(turno);
}

/* ---------- o cruzamento com a produção da arte (#96) ---------- */

/** Até quantos dias antes do dia da pauta a Produção ainda é desta claquete (a mesma chave volta no ano seguinte), e
    quantos depois (a arte que entrou depois da edição marcada). */
const ANTES = 90;
const DEPOIS = 14;
const DIA_MS = 86_400_000;

/** A chave da claquete sem o código das versões no fim ("Novela Sol 27/11 NAH" → "NOVELA SOL 27 11"). */
const chaveSemVersao = (l: Pick<LinhaDaPauta, 'semVersao'>) => chaveDaClaquete(l.semVersao);

/**
 * As claquetes da pauta com as Produções delas, pela chave da claquete, com a tolerância da busca do editor pela
 * pauta, nesta ordem: a chave exata; a chave sem a versão no fim; a chave sem a praça (dos dois lados: a pauta escreve
 * "Rede", a produção tem uma linha por praça). Vale a primeira tentativa que acha. Só as Produções que entraram perto
 * do dia da linha, e uma por praça (a que entrou por último). A tarefa e o aviso ficam como estão.
 * @param semPraca a chave sem a praça escrita no fim (as praças da configuração)
 */
export function cruzarComAProducao(linhas: readonly LinhaDaPauta[], producoes: readonly ProducaoNaPauta[], semPraca: (chave: string) => string): LinhaDaPauta[] {
  const exatas = new Map<string, ProducaoNaPauta[]>();
  const semAPraca = new Map<string, ProducaoNaPauta[]>();
  const juntar = (mapa: Map<string, ProducaoNaPauta[]>, chave: string, p: ProducaoNaPauta) => chave && mapa.set(chave, [...(mapa.get(chave) ?? []), p]);
  for (const p of producoes) {
    // a Produção gravada no padrão (#118) tem "(M)" onde a pauta escreve "(MES)"
    const chave = chaveDaClaqueteNoPadrao(p.claquete);
    juntar(exatas, chave, p);
    juntar(semAPraca, semPraca(chave), p);
  }
  const perto = (dia: string) => (p: ProducaoNaPauta) => {
    const entrada = p.entradaEm ? Date.parse(p.entradaEm) : NaN;
    if (Number.isNaN(entrada)) return true;
    const doDia = Date.parse(`${dia}T12:00:00Z`);
    return entrada >= doDia - ANTES * DIA_MS && entrada <= doDia + DEPOIS * DIA_MS;
  };
  /** Uma por praça: a que entrou por último. */
  const umaPorPraca = (lista: ProducaoNaPauta[]) => {
    const porPraca = new Map<string, ProducaoNaPauta>();
    for (const p of lista) {
      const ja = porPraca.get(p.praca);
      if (!ja || (p.entradaEm ?? '') > (ja.entradaEm ?? '')) porPraca.set(p.praca, p);
    }
    return [...porPraca.values()].sort((a, b) => a.praca.localeCompare(b.praca));
  };
  return linhas.map((l) => {
    if (l.tipo !== 'claquete') return l;
    const exata = chaveDaClaquete(l.texto);
    const curta = chaveSemVersao(l);
    const tentativas: [Map<string, ProducaoNaPauta[]>, string][] = [
      [exatas, exata],
      [exatas, curta],
      [semAPraca, semPraca(curta)],
    ];
    let achadas: ProducaoNaPauta[] = [];
    for (const [mapa, chave] of tentativas) {
      achadas = umaPorPraca((mapa.get(chave) ?? []).filter(perto(l.dia)));
      if (achadas.length) break;
    }
    return { ...l, chave: semPraca(curta), producoes: achadas };
  });
}

const ORDEM_DA_ETAPA: Etapa[] = ['entrada', 'produzindo', 'entregue'];

/** O resumo das Produções de uma claquete, para a célula: a etapa mais atrasada (Arquivada só quando todas estão),
    as artes somadas, os designers e as praças sem repetir e a prioridade ALTA de alguma. null: sem card. */
export function resumoDaProducao(producoes: readonly ProducaoNaPauta[] | undefined) {
  if (!producoes?.length) return null;
  const abertas = producoes.filter((p) => p.etapa !== 'arquivada');
  const etapa: Etapa = abertas.length ? ORDEM_DA_ETAPA[Math.min(...abertas.map((p) => ORDEM_DA_ETAPA.indexOf(p.etapa)))] : 'arquivada';
  const comArtes = producoes.filter((p) => p.artes !== null);
  return {
    etapa,
    artes: comArtes.length ? comArtes.reduce((n, p) => n + (p.artes ?? 0), 0) : null,
    designers: [...new Set(producoes.flatMap((p) => p.designers))],
    pracas: [...new Set(producoes.map((p) => p.praca).filter(Boolean))],
    alta: producoes.some((p) => p.alta),
  };
}

/** A etapa por extenso, como a pauta mostra. */
export const ROTULO_DA_ETAPA: Record<Etapa, string> = { entrada: 'Entrada', produzindo: 'Produzindo', entregue: 'Entregue', arquivada: 'Arquivada' };

/* ---------- a escolha da visão e do arranjo, lembrada por pessoa (#98) ---------- */

export type VisaoDaPauta = 'semana' | 'dia';
/** Os arranjos da Semana: editor × dia (uma linha por editor) ou um dia por coluna (os cards agrupados por turno). */
export type ArranjoDaSemana = 'editor-dia' | 'dia-por-coluna';
/** Os arranjos do Dia: empilhado (cards de altura livre) ou por hora (a régua das 6h às 6h). */
export type ArranjoDoDia = 'empilhado' | 'por-hora';

/** A escolha de cada pessoa: a visão em que a pauta abre e o arranjo de cada visão. */
export interface EscolhaDaPauta {
  visao: VisaoDaPauta;
  semana: ArranjoDaSemana;
  dia: ArranjoDoDia;
}

/** As chaves das preferências da pessoa (no SQLite, pela rota de quem está logado), cada uma com os valores que valem,
    o padrão de quem não escolheu (a Semana editor × dia e o Dia empilhado) e a recusa do valor desconhecido. */
const CHAVES_DA_PAUTA = {
  'pauta.visao': { campo: 'visao', valores: ['semana', 'dia'], recusa: 'Visão da pauta desconhecida: escolha Semana ou Dia.' },
  'pauta.arranjo.semana': { campo: 'semana', valores: ['editor-dia', 'dia-por-coluna'], recusa: 'Arranjo da Semana desconhecido: escolha editor × dia ou um dia por coluna.' },
  'pauta.arranjo.dia': { campo: 'dia', valores: ['empilhado', 'por-hora'], recusa: 'Arranjo do Dia desconhecido: escolha empilhado ou por hora.' },
} as const satisfies Record<string, { campo: keyof EscolhaDaPauta; valores: readonly string[]; recusa: string }>;
export type ChaveDaPauta = keyof typeof CHAVES_DA_PAUTA;
/** A chave de cada parte da escolha. */
export const CHAVE_DA_ESCOLHA = { visao: 'pauta.visao', semana: 'pauta.arranjo.semana', dia: 'pauta.arranjo.dia' } as const satisfies Record<keyof EscolhaDaPauta, ChaveDaPauta>;

export const ehChaveDaPauta = (chave: string): chave is ChaveDaPauta => Object.hasOwn(CHAVES_DA_PAUTA, chave);

/** A recusa de uma preferência da pauta: '' quando o valor vale para a chave. */
export const recusaDaPreferenciaDaPauta = (chave: ChaveDaPauta, valor: unknown): string => ((CHAVES_DA_PAUTA[chave].valores as readonly unknown[]).includes(valor) ? '' : CHAVES_DA_PAUTA[chave].recusa);

/** A escolha lembrada da pessoa; o que ela não escolheu (ou já não vale) fica no padrão. */
export function escolhaDaPauta(preferencias: Record<string, unknown> | undefined): EscolhaDaPauta {
  const parte = <K extends keyof EscolhaDaPauta>(campo: K): EscolhaDaPauta[K] => {
    const chave = CHAVE_DA_ESCOLHA[campo];
    const lembrada = preferencias?.[chave];
    return (recusaDaPreferenciaDaPauta(chave, lembrada) ? CHAVES_DA_PAUTA[chave].valores[0] : lembrada) as EscolhaDaPauta[K];
  };
  return { visao: parte('visao'), semana: parte('semana'), dia: parte('dia') };
}

/* ---------- a Semana com um dia por coluna (#98) ---------- */

/** O período do dia em que o turno começa: manhã (6h–12h), tarde (12h–18h), noite (18h–0h), madrugada (0h–6h); o
    editor sem horário fica à parte. */
export type PeriodoDoTurno = 'manha' | 'tarde' | 'noite' | 'madrugada' | 'sem-horario';
/** Os períodos na ordem do dia da pauta (que começa às 6h), com o nome que a Semana mostra. */
export const PERIODOS: readonly { id: PeriodoDoTurno; nome: string }[] = [
  { id: 'manha', nome: 'manhã' },
  { id: 'tarde', nome: 'tarde' },
  { id: 'noite', nome: 'noite' },
  { id: 'madrugada', nome: 'madrugada' },
  { id: 'sem-horario', nome: 'sem horário' },
];
/** O período do turno, pela hora de início. */
export function periodoDoTurno(turno: Turno | null): PeriodoDoTurno {
  if (!turno) return 'sem-horario';
  const h = Number(turno.inicio.split(':')[0]);
  return h < 6 ? 'madrugada' : h < 12 ? 'manha' : h < 18 ? 'tarde' : 'noite';
}

/** Um dia da Semana com um dia por coluna: os editores daquele dia agrupados pelo período do turno, e a conta do dia. */
export interface ColunaDaSemana {
  dia: string;
  /** quantos editores (sem contar "sem editor") e quantas claquetes no dia */
  editores: number;
  claquetes: number;
  /** só os períodos com alguém, na ordem do dia da pauta */
  turnos: { periodo: PeriodoDoTurno; editores: ColunaDoDia[] }[];
}

/**
 * A Semana com um dia por coluna: um dia por coluna, na ordem da semana; em cada dia, os editores (como as colunas do
 * Dia: o turno, as claquetes e tarefas e, à parte, os avisos) agrupados pelo período em que o turno começa. No período,
 * pela hora de entrada; "sem editor" no fim dele.
 */
export function colunasDaSemana(s: Pick<SemanaDaPauta, 'dias' | 'linhas'>): ColunaDaSemana[] {
  return s.dias.map((dia) => {
    const doDia = s.linhas.filter((l) => l.dia === dia);
    const editores = colunasDoDia(doDia);
    return {
      dia,
      editores: editores.filter((e) => e.editor).length,
      claquetes: doDia.filter((l) => l.tipo === 'claquete').length,
      turnos: PERIODOS.map(({ id }) => ({ periodo: id, editores: editores.filter((e) => periodoDoTurno(e.turno) === id) })).filter((t) => t.editores.length),
    };
  });
}

/* ---------- os filtros pessoais e o resumo do administrador (#99) ---------- */

/** "Só as minhas" (as linhas do editor ligado ao e-mail da pessoa) e "Com arte minha" (as claquetes em que o designer
    da pessoa está na produção da arte). */
export type FiltroDaPauta = 'minhas' | 'arte';
export const ehFiltroDaPauta = (v: unknown): v is FiltroDaPauta => v === 'minhas' || v === 'arte';

/**
 * As linhas do filtro, comparando os nomes sem caixa, acento e pontuação. "Só as minhas" fica com tudo do editor (as
 * claquetes, as tarefas e os avisos dele); "Com arte minha", só com as claquetes em que o designer está em alguma
 * Produção. Sem o editor (ou o designer) da pessoa, nada.
 */
export function filtrarAPauta(linhas: readonly LinhaDaPauta[], filtro: FiltroDaPauta, voce: LeituraDaPauta['voce']): LinhaDaPauta[] {
  const alvo = nomeComparavel((filtro === 'minhas' ? voce.editor : voce.designer) ?? '');
  if (!alvo) return [];
  if (filtro === 'minhas') return linhas.filter((l) => nomeComparavel(l.editor) === alvo);
  return linhas.filter((l) => l.tipo === 'claquete' && (l.producoes ?? []).some((p) => p.designers.some((d) => nomeComparavel(d) === alvo)));
}

/** O resumo discreto do administrador. */
export interface ResumoDaPauta {
  /** as claquetes e as tarefas sem editor (o aviso e a info não contam: são recados) */
  semEditor: number;
  /** as claquetes sem nenhuma Produção achada pela chave */
  semCard: number;
  /** a hora da última alteração da pauta (ISO), ou null */
  alteradoEm: string | null;
}
export function resumoDaPauta(linhas: readonly LinhaDaPauta[], alteradoEm: string | null): ResumoDaPauta {
  return {
    semEditor: linhas.filter((l) => (l.tipo === 'claquete' || l.tipo === 'tarefa') && !l.editor).length,
    semCard: linhas.filter((l) => l.tipo === 'claquete' && !l.producoes?.length).length,
    alteradoEm,
  };
}

/* ---------- a mesa do dia e a busca (#162) ---------- */

/** O editor da linha é a pessoa (o editor ligado ao e-mail dela), comparando os nomes sem caixa, acento e pontuação. */
export const ehDaPessoa = (editor: string, voceEditor: string | null | undefined): boolean => !!editor && !!voceEditor && nomeComparavel(editor) === nomeComparavel(voceEditor);

/** Quem vê o "Sobrou · sem editor" na mesa do dia (#172): a coordenação (quem monta a pauta) e os editores; para os
    outros perfis (designer, redator), o que sobrou não ajuda. */
export const veOQueSobrou = ({ coordenacao, editor }: { coordenacao: boolean; editor: string | null | undefined }): boolean => coordenacao || !!editor;

/** A contagem do dia de um editor ("N de M"): as claquetes com a arte entregue (ou já arquivada), uma bolinha por
    claquete na ordem da pauta. A tarefa e o aviso não contam. */
export function contaDoEditor(itens: readonly LinhaDaPauta[]): { feitas: number; total: number; bolinhas: boolean[] } {
  const bolinhas = itens.filter((l) => l.tipo === 'claquete').map((l) => {
    const etapa = resumoDaProducao(l.producoes)?.etapa;
    return etapa === 'entregue' || etapa === 'arquivada';
  });
  return { feitas: bolinhas.filter(Boolean).length, total: bolinhas.length, bolinhas };
}

/** O recado do dia (#125): o aviso sem editor daquele dia. */
export const recadoDoDia = (linhas: readonly LinhaDaPauta[], dia: string): LinhaDaPauta[] => linhas.filter((l) => l.tipo === 'aviso' && !l.editor && l.dia === dia);

/**
 * A busca da pauta: as claquetes e as tarefas cujo texto (a claquete, que traz a atração), o apelido ou o editor têm
 * todas as palavras do termo, sem caixa, acento e pontuação. O aviso não é resultado. Sem termo, nada.
 * @param apelido o apelido da claquete, quando há (a tela sabe)
 */
export function buscarNaPauta(linhas: readonly LinhaDaPauta[], termo: string, apelido: (l: LinhaDaPauta) => string = () => ''): LinhaDaPauta[] {
  const palavras = nomeComparavel(termo).split(' ').filter(Boolean);
  if (!palavras.length) return [];
  return linhas.filter((l) => {
    if (l.tipo === 'aviso' || l.tipo === 'info') return false;
    const onde = nomeComparavel([l.texto, apelido(l), l.editor].join(' '));
    return palavras.every((p) => onde.includes(p));
  });
}
