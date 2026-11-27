import { describe, expect, it } from 'vitest';
import { conferirODia, pendenciasQueFicaram, type Pendencia } from '../src/modelo/conferenciaDaEscala';
import { TURNOS_DE_FABRICA, type PosicaoDaEscala } from '../src/modelo/escala';

/* Montar a pauta, conferir (#127): a regra pura que aponta as pendências do dia antes de publicar, em dois grupos.
   "Para olhar": editor em dois lugares, turno sem editor, claquete sem data, horário estranho, nome parecido e demanda
   sem editor. "Só para saber": nome novo, horário fora do turno e linha que parece aviso. Cada pendência diz o campo
   que o "Corrigir" abre. Nomes e claquetes fictícios; 27/11/2026 é uma sexta. */

const DIA = '2026-11-27';
const EDITORES = ['Rui Teixeira', 'Elis Furtado', 'Gil Moura'];
let n = 0;
/** Uma posição, com as demandas pelo texto (os ids saem em ordem). */
function pos(turno: PosicaoDaEscala['turno'], editor: string, horario: string, demandas: string[] = []): PosicaoDaEscala {
  n += 1;
  return { id: `p${n}`, turno, editor, ilha: '', horario, demandas: demandas.map((texto, i) => ({ id: `p${n}-d${i + 1}`, texto })), avisos: [] };
}
const conferir = (posicoes: PosicaoDaEscala[]) => conferirODia({ dia: DIA, posicoes, editores: EDITORES, turnos: TURNOS_DE_FABRICA });
const tipos = (ps: Pendencia[]) => ps.map((p) => p.tipo);

describe('conferirODia: o dia sem nada para olhar', () => {
  it('um dia certinho não tem pendência', () => {
    const c = conferir([pos('madrugada', 'Rui Teixeira', '22h às 6h', ['Noite de Gala 27/11 (DP)', 'COMUNICAÇÃO']), pos('tarde', 'Elis Furtado', '14h às 22h53', ['Mundo Animal 30/11 (P)'])]);
    expect(c).toEqual({ paraOlhar: [], soParaSaber: [] });
  });

  it('o dia vazio também não', () => {
    expect(conferir([])).toEqual({ paraOlhar: [], soParaSaber: [] });
  });
});

describe('conferirODia: para olhar', () => {
  it('editor em dois lugares: o mesmo nome (sem caixa nem acento) em duas posições, com onde está em cada uma', () => {
    const a = pos('madrugada', 'Rui Teixeira', '22h às 6h');
    const b = pos('tarde', 'RUI  teixeira', '14h às 20h');
    const c = conferir([a, b]);
    expect(c.paraOlhar).toEqual([{ chave: 'dois-lugares:RUI TEIXEIRA', tipo: 'Editor em dois lugares', titulo: 'Rui Teixeira', detalhe: 'madrugada 22h às 6h e tarde 14h às 20h', alvo: { posicao: b.id, campo: 'editor' } }]);
  });

  it('turno sem editor: a posição sem ninguém e sem demanda', () => {
    const p = pos('noite', '', '20h às 2h');
    expect(conferir([p]).paraOlhar).toEqual([{ chave: `sem-editor:${p.id}`, tipo: 'Turno sem editor', titulo: 'Noite · 20h às 2h', detalhe: 'posição vazia', alvo: { posicao: p.id, campo: 'editor' } }]);
  });

  it('demanda sem editor: a posição sem ninguém, com demandas esperando', () => {
    const p = pos('madrugada', '  ', '22h às 6h', ['Show da Virada 31/12', 'Vale a Pena Rever 30/11 (P)', 'CALHAUS', 'Corujão 28/11']);
    expect(conferir([p]).paraOlhar).toEqual([{ chave: `demandas-sem-editor:${p.id}`, tipo: 'Demanda sem editor', titulo: '4 demandas esperando um editor', detalhe: 'madrugada · Show da Virada 31/12 · Vale a Pena Rever 30/11 (P) · CALHAUS …', alvo: { posicao: p.id, campo: 'editor' } }]);
  });

  it('claquete sem data: a claquete com o código de versão e sem a data, apontando a linha', () => {
    const p = pos('manha', 'Gil Moura', '6h às 15h', ['Vale a Pena Rever (AH)', 'COMUNICAÇÃO']);
    expect(conferir([p]).paraOlhar).toEqual([{ chave: `sem-data:${p.id}-d1`, tipo: 'Claquete sem data', titulo: 'Vale a Pena Rever (AH)', detalhe: 'Gil Moura · manhã', alvo: { posicao: p.id, campo: 'demanda', demanda: `${p.id}-d1` } }]);
  });

  it.each([
    ['depois do almoço', 'Gil Moura: “depois do almoço”', 'não entendi o horário'],
    ['', 'Gil Moura · manhã', 'falta o horário'],
    ['6h às 22h', 'Gil Moura: 6h às 22h', '16h de expediente na manhã'],
    ['6h às 8h', 'Gil Moura: 6h às 8h', 'só 2h de expediente na manhã'],
  ])('horário estranho: "%s"', (horario, titulo, detalhe) => {
    const p = pos('manha', 'Gil Moura', horario);
    expect(conferir([p]).paraOlhar).toEqual([{ chave: `horario:${p.id}`, tipo: 'Horário estranho', titulo, detalhe, alvo: { posicao: p.id, campo: 'horario' } }]);
  });

  it('o turno que vira o dia diz "do dia seguinte"', () => {
    const p = pos('tarde', 'Elis Furtado', '14 as 4');
    expect(conferir([p]).paraOlhar[0]).toMatchObject({ tipo: 'Horário estranho', titulo: 'Elis Furtado: 14h às 4h do dia seguinte', detalhe: '14h de expediente na tarde' });
  });

  it.each([
    ['Eliz Furtado', '“Eliz Furtado” é Elis Furtado?'],
    ['Gil Mora', '“Gil Mora” é Gil Moura?'],
    ['elis', '“elis” é Elis Furtado?'],
    ['Rui', '“Rui” é Rui Teixeira?'],
  ])('nome parecido: "%s"', (escrito, titulo) => {
    const p = pos('tarde', escrito, '14h às 23h');
    expect(conferir([p]).paraOlhar).toEqual([{ chave: `parecido:${p.id}`, tipo: 'Nome parecido', titulo, detalhe: 'na tarde', alvo: { posicao: p.id, campo: 'editor' } }]);
    expect(conferir([p]).soParaSaber).toEqual([]);
  });
});

describe('conferirODia: só para saber', () => {
  it('nome novo: quem não está nos cadastros nem parece com ninguém', () => {
    const p = pos('manha', 'Otávio Reis', '6h às 15h');
    const c = conferir([p]);
    expect(c.paraOlhar).toEqual([]);
    expect(c.soParaSaber).toEqual([{ chave: `nome-novo:${p.id}`, tipo: 'Nome novo', titulo: 'Otávio Reis', detalhe: 'não está na lista dos editores', alvo: { posicao: p.id, campo: 'editor' } }]);
  });

  it('horário fora do turno: começa mais perto do horário de outro turno', () => {
    const p = pos('noite', 'Gil Moura', '8h às 17h');
    expect(conferir([p]).soParaSaber).toEqual([{ chave: `fora-do-turno:${p.id}`, tipo: 'Horário fora do turno', titulo: 'Gil Moura: 8h às 17h', detalhe: 'começa na manhã, mas está na noite', alvo: { posicao: p.id, campo: 'horario' } }]);
  });

  it('o horário quebrado do próprio turno não é fora do turno', () => {
    expect(conferir([pos('tarde', 'Elis Furtado', '16h às 0h38'), pos('madrugada', 'Gil Moura', '23h às 7h')]).soParaSaber).toEqual([]);
  });

  it('linha que parece aviso: a frase em maiúsculas, de três palavras ou mais, entre as demandas', () => {
    const p = pos('manha', 'Gil Moura', '6h às 15h', ['COMUNICAÇÃO', 'ARQUIVO GERAL', 'REDATOR VEM ACOMPANHAR A EDIÇÃO']);
    expect(conferir([p]).soParaSaber).toEqual([{ chave: `parece-aviso:${p.id}-d3`, tipo: 'Parece aviso', titulo: 'REDATOR VEM ACOMPANHAR A EDIÇÃO', detalhe: 'está entre as demandas de Gil Moura; vai como tarefa se ficar ali', alvo: { posicao: p.id, campo: 'demanda', demanda: `${p.id}-d3` } }]);
  });
});

describe('pendenciasQueFicaram: as "para olhar" que ninguém disse que estão certas', () => {
  it('o "está certo" dispensa; o "só para saber" não conta', () => {
    const a = pos('noite', '', '20h às 2h');
    const b = pos('manha', 'Gil Moura', '6h às 22h');
    const c = pos('manha', 'Otávio Reis', '6h às 15h');
    const conferencia = conferir([a, b, c]);
    expect(tipos(conferencia.paraOlhar)).toEqual(['Turno sem editor', 'Horário estranho']);
    expect(pendenciasQueFicaram(conferencia, [])).toBe(2);
    expect(pendenciasQueFicaram(conferencia, [`sem-editor:${a.id}`, 'uma-que-sumiu'])).toBe(1);
  });
});
