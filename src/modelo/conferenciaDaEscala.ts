/* Montar a pauta, conferir (#127): a regra pura que aponta as pendências do dia antes de publicar, a mesma no servidor
   (que conta as que ficaram ao publicar) e no navegador (a tela de conferir). As pendências avisam, não travam (ADR
   0006): publicar funciona com elas. Dois grupos:
   - para olhar: editor em dois lugares, turno sem editor, demanda sem editor, claquete sem data, horário estranho e
     nome parecido;
   - só para saber: nome novo, horário fora do turno e linha que parece aviso.
   Cada pendência tem uma chave estável (o "está certo" a dispensa pela chave) e o campo que o "Corrigir" abre. */
import { lerDemanda, lerHorario, horarioEntendido, type PosicaoDaEscala, type TurnoDaEscala } from './escala.ts';
import { nomeComparavel, umaLetraDeDiferenca } from './ligarPeloNome.ts';

/** O campo da grade que o "Corrigir" abre (a demanda, pela linha). */
export interface AlvoDaPendencia {
  posicao: string;
  campo: 'editor' | 'horario' | 'demanda';
  demanda?: string;
}
export type TipoDePendencia = 'Editor em dois lugares' | 'Turno sem editor' | 'Demanda sem editor' | 'Claquete sem data' | 'Horário estranho' | 'Nome parecido' | 'Nome novo' | 'Horário fora do turno' | 'Parece aviso';
export interface Pendencia {
  /** estável enquanto a coisa apontada existir: o "está certo" a guarda */
  chave: string;
  tipo: TipoDePendencia;
  titulo: string;
  detalhe: string;
  alvo: AlvoDaPendencia;
}
export interface ConferenciaDoDia {
  paraOlhar: Pendencia[];
  soParaSaber: Pendencia[];
}

/** Abaixo disto ou acima disto, o expediente é estranho. */
const MINIMO = 4 * 60;
const MAXIMO = 12 * 60;
/** Quantas demandas o detalhe da "demanda sem editor" mostra. */
const AMOSTRA = 3;

const duracao = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;
const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
/** A distância entre duas horas do dia, dando a volta na meia-noite. */
const distancia = (a: number, b: number) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b));

/** O turno cujo horário padrão começa mais perto desta hora ("HH:MM"). */
function turnoDaHora(hora: string, turnos: readonly TurnoDaEscala[]): TurnoDaEscala | null {
  let melhor: TurnoDaEscala | null = null;
  let menor = Infinity;
  for (const t of turnos) {
    const h = lerHorario(t.horario);
    if (!horarioEntendido(h)) continue;
    const d = distancia(minutos(h.inicio), minutos(hora));
    if (d < menor) [melhor, menor] = [t, d];
  }
  return melhor;
}

/**
 * O editor escrito em relação aos cadastrados: o mesmo nome; parecido (uma letra de diferença no nome ou no primeiro
 * nome, ou só o primeiro nome de alguém); ou novo.
 */
function editorNaLista(escrito: string, editores: readonly string[]): { como: 'cadastrado' } | { como: 'parecido'; nome: string } | { como: 'novo' } {
  const alvo = nomeComparavel(escrito);
  if (editores.some((e) => nomeComparavel(e) === alvo)) return { como: 'cadastrado' };
  const parecido = editorParecido(escrito, editores);
  return parecido ? { como: 'parecido', nome: parecido } : { como: 'novo' };
}

/**
 * O cadastrado que parece o nome escrito (uma letra de diferença no nome ou no primeiro nome, ou só o primeiro nome de
 * alguém), ou undefined. É o "nome parecido" da conferência e o "é a mesma pessoa?" do nome novo nos Cadastros (#132).
 */
export function editorParecido(escrito: string, editores: readonly string[]): string | undefined {
  const alvo = nomeComparavel(escrito);
  const palavras = alvo.split(' ');
  return editores.find((e) => {
    const nome = nomeComparavel(e);
    const primeiro = nome.split(' ')[0];
    if (palavras.length === 1) return primeiro === alvo || (alvo.length >= 3 && umaLetraDeDiferenca(primeiro, alvo));
    return alvo.length >= 3 && umaLetraDeDiferenca(nome, alvo);
  });
}

/** A linha em maiúsculas, de três palavras ou mais, que a planilha usava como aviso ("REDATOR VEM ACOMPANHAR"). */
const pareceAviso = (texto: string) => texto === texto.toLocaleUpperCase('pt-BR') && texto.split(/\s+/).filter((w) => /\p{L}{2}/u.test(w)).length >= 3;

/**
 * As pendências do dia, na ordem da grade (o "editor em dois lugares" primeiro, uma vez por pessoa).
 * @param editores os nomes dos editores cadastrados (a lista do montar)
 * @param turnos os turnos do dia, com o horário padrão de cada um (o "fora do turno" é pelo mais perto)
 */
export function conferirODia({ dia, posicoes, editores, turnos }: { dia: string; posicoes: readonly PosicaoDaEscala[]; editores: readonly string[]; turnos: readonly TurnoDaEscala[] }): ConferenciaDoDia {
  const paraOlhar: Pendencia[] = [];
  const soParaSaber: Pendencia[] = [];
  const nomeDoTurno = (id: string) => turnos.find((t) => t.id === id)?.nome ?? id;
  const turnoMinusculo = (id: string) => nomeDoTurno(id).toLowerCase();

  // editor em dois lugares: o mesmo nome em mais de uma posição; o "Corrigir" vai à última
  const porNome = new Map<string, PosicaoDaEscala[]>();
  for (const p of posicoes) {
    const nome = nomeComparavel(p.editor);
    if (nome) porNome.set(nome, [...(porNome.get(nome) ?? []), p]);
  }
  for (const [nome, ps] of porNome) {
    if (ps.length < 2) continue;
    const ultima = ps[ps.length - 1];
    paraOlhar.push({ chave: `dois-lugares:${nome}`, tipo: 'Editor em dois lugares', titulo: ps[0].editor.trim().replace(/\s+/g, ' '), detalhe: ps.map((p) => `${turnoMinusculo(p.turno)} ${p.horario}`.trim()).join(' e '), alvo: { posicao: ultima.id, campo: 'editor' } });
  }

  for (const p of posicoes) {
    const editor = p.editor.trim().replace(/\s+/g, ' ');
    const turno = turnoMinusculo(p.turno);
    const quem = editor || 'sem editor';
    const naPosicao = (campo: AlvoDaPendencia['campo'], demanda?: string): AlvoDaPendencia => (demanda ? { posicao: p.id, campo, demanda } : { posicao: p.id, campo });

    // sem editor: a posição vazia é turno sem editor; com demandas, elas esperam um editor
    if (!editor) {
      if (!p.demandas.length) paraOlhar.push({ chave: `sem-editor:${p.id}`, tipo: 'Turno sem editor', titulo: [nomeDoTurno(p.turno), p.horario].filter(Boolean).join(' · '), detalhe: 'posição vazia', alvo: naPosicao('editor') });
      else {
        const amostra = p.demandas.slice(0, AMOSTRA).map((d) => d.texto);
        const n = p.demandas.length;
        paraOlhar.push({ chave: `demandas-sem-editor:${p.id}`, tipo: 'Demanda sem editor', titulo: `${n} ${n === 1 ? 'demanda esperando' : 'demandas esperando'} um editor`, detalhe: [turno, ...amostra].join(' · ') + (n > AMOSTRA ? ' …' : ''), alvo: naPosicao('editor') });
      }
    } else {
      const lista = editorNaLista(editor, editores);
      if (lista.como === 'parecido') paraOlhar.push({ chave: `parecido:${p.id}`, tipo: 'Nome parecido', titulo: `“${editor}” é ${lista.nome}?`, detalhe: `na ${turno}`, alvo: naPosicao('editor') });
      if (lista.como === 'novo') soParaSaber.push({ chave: `nome-novo:${p.id}`, tipo: 'Nome novo', titulo: editor, detalhe: 'não está na lista dos editores', alvo: naPosicao('editor') });
    }

    // o horário: falta, não é horário, dura demais ou de menos; ou começa no horário de outro turno
    const h = lerHorario(p.horario);
    const horario = (titulo: string, detalhe: string) => paraOlhar.push({ chave: `horario:${p.id}`, tipo: 'Horário estranho', titulo, detalhe, alvo: naPosicao('horario') });
    if (!h) horario(`${quem} · ${turno}`, 'falta o horário');
    else if (!horarioEntendido(h)) horario(`${quem}: “${p.horario.trim()}”`, h.erro);
    else if (h.minutos < MINIMO || h.minutos > MAXIMO) horario(`${quem}: ${h.padrao}${h.viraODia ? ' do dia seguinte' : ''}`, `${h.minutos < MINIMO ? 'só ' : ''}${duracao(h.minutos)} de expediente na ${turno}`);
    else {
      const doHorario = turnoDaHora(h.inicio, turnos);
      if (doHorario && doHorario.id !== p.turno) soParaSaber.push({ chave: `fora-do-turno:${p.id}`, tipo: 'Horário fora do turno', titulo: `${quem}: ${h.padrao}`, detalhe: `começa na ${doHorario.nome.toLowerCase()}, mas está na ${turno}`, alvo: naPosicao('horario') });
    }

    // as demandas: a claquete sem data; a linha que parece aviso
    for (const d of p.demandas) {
      const l = lerDemanda(d.texto, dia);
      if (l.tipo === 'claquete' && !l.data) paraOlhar.push({ chave: `sem-data:${d.id}`, tipo: 'Claquete sem data', titulo: d.texto.trim(), detalhe: `${quem} · ${turno}`, alvo: naPosicao('demanda', d.id) });
      if (l.tipo === 'tarefa' && pareceAviso(l.padrao)) soParaSaber.push({ chave: `parece-aviso:${d.id}`, tipo: 'Parece aviso', titulo: l.padrao, detalhe: `está entre as demandas de ${quem}; vai como tarefa se ficar ali`, alvo: naPosicao('demanda', d.id) });
    }
  }
  return { paraOlhar, soParaSaber };
}

/** Quantas "para olhar" ficaram: as que ninguém disse que estão certas (o "só para saber" não conta). */
export const pendenciasQueFicaram = (c: ConferenciaDoDia, dispensadas: readonly string[]) => c.paraOlhar.filter((p) => !dispensadas.includes(p.chave)).length;
