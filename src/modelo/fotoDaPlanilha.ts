/* Montar a pauta, a semana lado a lado com a planilha (#133): as regras puras da foto crua da planilha da edição, as
   mesmas no servidor e no navegador (só sintaxe que o Node apaga). Durante a transição (ADR 0006), o n8n manda ao
   PROMeiro, de hora em hora, a grade de cada aba como a API do Google devolve (o formato 1, veja o README). Quem lê a
   grade é o colar da planilha (#130): a foto vira o mesmo texto que a pessoa colaria (as células por tab) e passa pelo
   mesmo leitor (lerOColado e aplicarOColado), sem um segundo jeito de ler a planilha. Aqui ficam só o que é da foto:
   o texto, o dia da aba, a leitura e a comparação do dia montado com o que a foto diz, posição por posição. */
import { aplicarOColado, lerOColado, type ContextoDoColado } from './colarDaPlanilha.ts';
import { demandaNoPadrao, type IdDoTurno, type PosicaoDaEscala } from './escala.ts';
import { nomeComparavel } from './ligarPeloNome.ts';

/** O formato do pacote que o n8n manda (o campo `formato`); outro número é recusado. */
export const FORMATO_DA_FOTO = 1;

/** Uma aba da foto, como o n8n manda: a grade crua (FORMATTED_VALUE), as mesclas e a pista do dia. */
export interface AbaDaFoto {
  aba: string;
  intervalo?: string | null;
  sheetId?: number | null;
  /** só uma pista (a 1ª dd/mm/aaaa das primeiras linhas, lida no n8n): o PROMeiro lê de novo */
  data_da_aba?: string | null;
  linhas: string[][];
  /** [linha inicial, coluna inicial, linha final, coluna final), contando a partir de 0 */
  mesclas: number[][];
}
/** O pacote do n8n (formato 1). */
export interface PacoteDaFoto {
  formato: number;
  origem?: { fluxo?: string; execucao?: string } | null;
  lida_em: string;
  todas_as_abas?: string[];
  abas: AbaDaFoto[];
}

/** A foto guardada, como a rota da coordenação devolve (GET /api/montar-pauta/foto). */
export interface FotoGuardada {
  aba: string;
  dia: string | null;
  /** quando o n8n leu a planilha com esta grade pela primeira vez */
  lidaEm: string;
  recebidaEm: string;
  /** a última vez que o n8n mandou a mesma grade (a planilha continuava assim) */
  confirmadaEm: string;
  origem: { fluxo: string; execucao: string };
  todasAsAbas: string[];
  linhas: string[][];
  mesclas: number[][];
}
/** O que a foto diz do dia, lido pelo colar da planilha: as posições e quem está fora. */
export interface DiaDaFoto {
  posicoes: PosicaoDaEscala[];
  fora: string[];
}
/** A resposta de GET /api/montar-pauta/foto: tudo null quando não há foto do dia. */
export interface FotoDoDia {
  dia: string;
  foto: FotoGuardada | null;
  daFoto: DiaDaFoto | null;
  /** contra o rascunho gravado (a tela compara de novo com o que está sendo digitado) */
  diferencas: DiferencasDaFoto | null;
}

/** A célula como texto de uma linha só: a quebra e o tab de dentro dela viram espaço. */
const celula = (c: unknown) => (typeof c === 'string' ? c.replace(/[\t\r\n]+/g, ' ') : '');

/** A grade da foto como o texto colado da planilha (uma linha por linha, as células por tab): o que o #130 lê. */
export function textoDaFoto(linhas: readonly (readonly string[])[]): string {
  return linhas.map((l) => (Array.isArray(l) ? l.map(celula).join('\t') : '')).join('\n');
}

const dois = (n: number) => String(n).padStart(2, '0');
/** A data AAAA-MM-DD, se ela existe no calendário. */
const dataQueExiste = (a: number, m: number, d: number) => {
  const iso = `${a}-${dois(m)}-${dois(d)}`;
  return m >= 1 && m <= 12 && d >= 1 && new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
};

/** O dia da aba: a primeira dd/mm/aaaa de verdade nas 6 primeiras linhas; sem ela, a pista do n8n (se for data). */
export function diaDaFoto(linhas: readonly (readonly string[])[], pista: string | null | undefined): string | null {
  for (const l of linhas.slice(0, 6))
    for (const c of Array.isArray(l) ? l : []) {
      for (const m of String(c ?? '').matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)) {
        const iso = dataQueExiste(+m[3], +m[2], +m[1]);
        if (iso) return iso;
      }
    }
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(pista ?? ''));
  return p ? dataQueExiste(+p[1], +p[2], +p[3]) : null;
}

/**
 * O dia que a foto diz, lido pelo colar da planilha (#130), como se a aba inteira tivesse sido colada no dia vazio:
 * as posições (quem está fora deixa a vaga só quando tem demanda embaixo) e quem está fora. O nome parecido ou
 * ambíguo, que no colar vira pergunta, fica com a opção que já está escalada no dia montado (`montado`), se houver.
 */
export function lerAFoto(linhas: readonly (readonly string[])[], ctx: ContextoDoColado, montado: readonly PosicaoDaEscala[]): DiaDaFoto {
  const leitura = lerOColado(textoDaFoto(linhas), ctx);
  const escalados = new Set(montado.map((p) => nomeComparavel(p.editor)).filter(Boolean));
  const respostas: Record<string, string> = {};
  for (const b of leitura.blocos) {
    const escolhida = b.editor.opcoes.find((o) => escalados.has(nomeComparavel(o)));
    if (escolhida) respostas[b.id] = escolhida;
  }
  let n = 0;
  const { posicoes } = aplicarOColado(leitura, { dia: ctx.dia, turnos: ctx.turnos, posicoes: [], modo: 'substituir', respostas, jaFora: [], novoId: (prefixo) => `foto-${prefixo}-${++n}` });
  const fora: string[] = [];
  for (const b of leitura.blocos) {
    const nome = (respostas[b.id] ?? b.editor.nome).trim();
    if (b.ausencia && nome && !fora.some((f) => nomeComparavel(f) === nomeComparavel(nome))) fora.push(nome);
  }
  return { posicoes, fora };
}

/* ---------- a comparação ---------- */

export type CampoDaDiferenca = 'turno' | 'ilha' | 'horario' | 'demandas' | 'avisos';
/** Uma posição que não bate: onde ela está e, nos dois lados, o que difere (nas demandas e nos avisos, o que só um lado tem). */
export interface DiferencaDaPosicao {
  /** o editor ('' na vaga) e o turno como o PROMeiro tem; a que só a planilha tem, como a planilha tem */
  editor: string;
  turno: IdDoTurno;
  onde: 'nos-dois' | 'so-no-promeiro' | 'so-na-planilha';
  /** o campo, o valor do PROMeiro e o da planilha (a ilha é o id do cadastro; '' fica de fora) */
  campos: { campo: CampoDaDiferenca; promeiro: string[]; planilha: string[] }[];
}
export interface DiferencasDaFoto {
  /** as que não batem: as do PROMeiro na ordem dele, depois as que só a planilha tem */
  posicoes: DiferencaDaPosicao[];
  /** quantas posições batem por inteiro */
  iguais: number;
  /** quem está fora só de um lado (como cada lado escreveu) */
  fora: { soNoPromeiro: string[]; soNaPlanilha: string[] };
}

const umValor = (v: string) => (v ? [v] : []);
/** O que só a lista `a` tem, contando as repetições (a lista `b` "gasta" cada igual uma vez). */
function soEm(a: readonly string[], b: readonly string[], chave: (t: string) => string) {
  const resto = b.map(chave);
  return a.filter((t) => {
    const i = resto.indexOf(chave(t));
    if (i < 0) return true;
    resto.splice(i, 1);
    return false;
  });
}

/**
 * O dia montado no PROMeiro e o dia que a foto da planilha diz (as posições que o colar da planilha leu dela),
 * posição por posição. A posição com editor casa pelo editor (sem caixa, acento e pontuação) e pelo turno; sobrando,
 * só pelo editor (aí o turno é a diferença). A vaga casa pelo turno e pela ilha, depois pelo turno; a vaga vazia que
 * sobra (sem demanda nem aviso) não conta. A demanda é comparada no padrão (a grafia não é diferença); o horário, como
 * está (os dois lados já vêm no padrão).
 * @param o.foraNoPromeiro e o.foraNaPlanilha: quem está fora no dia em cada lado
 */
export function diferencasDaFoto(
  montado: readonly PosicaoDaEscala[],
  foto: readonly PosicaoDaEscala[],
  o: { dia: string; foraNoPromeiro?: readonly string[]; foraNaPlanilha?: readonly string[] },
): DiferencasDaFoto {
  const daDemanda = (t: string) => nomeComparavel(demandaNoPadrao(t, o.dia) || t);
  const doEditor = (p: PosicaoDaEscala) => nomeComparavel(p.editor);
  const sobra = [...foto];
  const pares: [PosicaoDaEscala, PosicaoDaEscala | null][] = montado.map((p) => [p, null]);
  const casar = (cond: (m: PosicaoDaEscala, f: PosicaoDaEscala) => boolean) => {
    for (const par of pares) {
      if (par[1]) continue;
      const i = sobra.findIndex((f) => cond(par[0], f));
      if (i >= 0) par[1] = sobra.splice(i, 1)[0];
    }
  };
  casar((m, f) => !!doEditor(m) && doEditor(m) === doEditor(f) && m.turno === f.turno);
  casar((m, f) => !!doEditor(m) && doEditor(m) === doEditor(f));
  casar((m, f) => !doEditor(m) && !doEditor(f) && m.turno === f.turno && m.ilha === f.ilha);
  casar((m, f) => !doEditor(m) && !doEditor(f) && m.turno === f.turno);

  const comparar = (m: PosicaoDaEscala, f: PosicaoDaEscala) => {
    const campos: DiferencaDaPosicao['campos'] = [];
    const simples = (campo: CampoDaDiferenca, a: string, b: string) => a !== b && campos.push({ campo, promeiro: umValor(a), planilha: umValor(b) });
    simples('turno', m.turno, f.turno);
    simples('ilha', m.ilha, f.ilha);
    simples('horario', m.horario, f.horario);
    const listas = (campo: CampoDaDiferenca, a: string[], b: string[], chave: (t: string) => string) => {
      const promeiro = soEm(a, b, chave);
      const planilha = soEm(b, a, chave);
      if (promeiro.length || planilha.length) campos.push({ campo, promeiro, planilha });
    };
    listas('demandas', m.demandas.map((d) => d.texto), f.demandas.map((d) => d.texto), daDemanda);
    listas('avisos', m.avisos.map((a) => a.texto), f.avisos.map((a) => a.texto), nomeComparavel);
    return campos;
  };
  const vazia = (p: PosicaoDaEscala) => !p.editor.trim() && !p.demandas.length && !p.avisos.length;
  const deUmLado = (p: PosicaoDaEscala, onde: 'so-no-promeiro' | 'so-na-planilha'): DiferencaDaPosicao => {
    const vazio = posicaoVazia(p);
    const campos = comparar(onde === 'so-no-promeiro' ? p : vazio, onde === 'so-no-promeiro' ? vazio : p).filter((c) => c.campo !== 'turno');
    return { editor: p.editor, turno: p.turno, onde, campos };
  };

  const posicoes: DiferencaDaPosicao[] = [];
  let iguais = 0;
  for (const [m, f] of pares) {
    if (!f) {
      if (!vazia(m)) posicoes.push(deUmLado(m, 'so-no-promeiro'));
      continue;
    }
    const campos = comparar(m, f);
    if (campos.length) posicoes.push({ editor: m.editor, turno: m.turno, onde: 'nos-dois', campos });
    else iguais++;
  }
  for (const f of sobra) if (!vazia(f)) posicoes.push(deUmLado(f, 'so-na-planilha'));

  const promeiro = o.foraNoPromeiro ?? [];
  const planilha = o.foraNaPlanilha ?? [];
  return { posicoes, iguais, fora: { soNoPromeiro: soEm(promeiro, planilha, nomeComparavel), soNaPlanilha: soEm(planilha, promeiro, nomeComparavel) } };
}

/** A posição sem nada, no mesmo turno: o outro lado de quem só um lado tem. */
const posicaoVazia = (p: PosicaoDaEscala): PosicaoDaEscala => ({ id: '', turno: p.turno, editor: '', ilha: '', horario: '', demandas: [], avisos: [] });
