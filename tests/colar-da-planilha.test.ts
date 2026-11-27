import { describe, expect, it } from 'vitest';
import { aplicarOColado, lerOColado, type ContextoDoColado } from '../src/modelo/colarDaPlanilha';
import { TURNOS_DE_FABRICA, type PosicaoDaEscala } from '../src/modelo/escala';

/* Montar a pauta, colar da planilha (#130): a regra pura que lê o que foi copiado da planilha da edição (as células
   separadas por tab, as linhas por quebra de linha, como o Google Sheets copia). Os casos são versões fictícias dos
   erros mapeados no relatório da planilha: nomes, claquetes e ilhas inventados. A semana de 23/11/2026 começa numa
   segunda: 27/11 é sexta. */

const DIA = '2026-11-27';
const CTX: ContextoDoColado = {
  dia: DIA,
  turnos: [...TURNOS_DE_FABRICA],
  editores: ['Caio Mendes', 'Elis Furtado', 'Fernando Brasil', 'Gil Moura', 'Paulo Lima', 'Paulo Reis', 'Rui Teixeira'],
  apelidos: { 'Fernando Brasil': ['BRASIL'], 'Gil Moura': ['GUGA'] },
  ilhas: [
    { id: 'i22', tipo: 'AVID', numero: '22', nome: '' },
    { id: 'i29', tipo: 'AVID', numero: '29', nome: 'Comunicação' },
    { id: 'i46', tipo: 'AVID', numero: '46', nome: '' },
    { id: 'i53a', tipo: 'AVID', numero: '53', nome: '' },
    { id: 'i53i', tipo: 'ILHA', numero: '53', nome: '' },
    { id: 'v5', tipo: 'VDI', numero: '5', nome: '' },
  ],
};
/** A grade como a planilha copia: uma linha por linha, as células por tab. */
const grade = (linhas: string[][]) => linhas.map((l) => l.join('\t')).join('\n');
/** Um turno com os blocos lado a lado: a ilha em cima, "EDITOR:" e o nome, "HORÁRIO:" e o horário, as demandas. */
function turno(rotulo: string | null, blocos: { ilha: string; nome: string; hora: string; demandas: string[] }[]): string[][] {
  const linhas: string[][] = [];
  if (rotulo) linhas.push(['', `                         ${rotulo}`]);
  linhas.push(['', ...blocos.flatMap((b) => [b.ilha, ''])]);
  linhas.push(['', ...blocos.flatMap((b) => ['EDITOR: ', b.nome])]);
  linhas.push(['', ...blocos.flatMap((b) => ['HORÁRIO: ', b.hora])]);
  const max = Math.max(0, ...blocos.map((b) => b.demandas.length));
  for (let k = 0; k < max; k++) linhas.push(['', ...blocos.flatMap((b) => [b.demandas[k] ?? '', ''])]);
  linhas.push([]);
  return linhas;
}
const ler = (linhas: string[][], ctx = CTX) => lerOColado(grade(linhas), ctx);
const umBloco = (b: Partial<{ ilha: string; nome: string; hora: string; demandas: string[] }>, rotulo: string | null = 'MANHÃ') =>
  ler(turno(rotulo, [{ ilha: 'AVID 22', nome: 'RUI', hora: '8H AS 17H', demandas: [], ...b }])).blocos[0];

describe('lerOColado: ancorado em "EDITOR:"', () => {
  it('o nome à direita, o horário embaixo, a ilha em cima, as demandas até o próximo bloco e o turno pelo rótulo', () => {
    const l = ler([
      ['L'],
      ['', 'SEXTA', '27/11/2026', '', 'ESTEIRA DE PÓS PRODUÇÃO'],
      ...turno('MADRUGADA', [
        { ilha: 'AVID 22', nome: 'RUI TEIXEIRA', hora: '22H AS 6H', demandas: ['Terra(Prologo)28/11 Ah', 'Noite de Gala 27/11 (DP)'] },
        { ilha: 'AVID 46', nome: 'ELIS FURTADO', hora: '22h às 6h', demandas: ['Mundo Animal 30/11 (P)'] },
      ]),
      ...turno('MANHÃ', [{ ilha: 'AVID 53', nome: 'GIL MOURA', hora: '8H AS 17H', demandas: ['Cozinha de Raiz 28/11 (AH)'] }]),
    ]);
    expect(l.diaDaAba).toBe(DIA);
    expect(l.blocos.map((b) => [b.turno, b.editor.nome, b.ilha.id, b.horario.padrao, b.demandas.map((d) => d.padrao)])).toEqual([
      ['madrugada', 'Rui Teixeira', 'i22', '22h às 6h', ['Terra(Prologo)28/11 (AH)', 'Noite de Gala 27/11 (DP)']],
      ['madrugada', 'Elis Furtado', 'i46', '22h às 6h', ['Mundo Animal 30/11 (P)']],
      ['manha', 'Gil Moura', 'i53a', '8h às 17h', ['Cozinha de Raiz 28/11 (AH)']],
    ]);
  });

  it('a ilha do turno seguinte não vira demanda do editor de cima', () => {
    const l = ler([
      ...turno('MANHÃ', [{ ilha: 'AVID 22', nome: 'RUI', hora: '8H AS 17H', demandas: ['Corujão 28/11 (A)'] }]).slice(0, -1),
      ['', 'VDI 5', ''],
      ['', 'EDITOR: ', 'GIL'],
      ['', 'HORÁRIO: ', '8H AS 14H'],
    ]);
    expect(l.blocos.map((b) => [b.editor.nome, b.ilha.id, b.demandas.map((d) => d.texto)])).toEqual([
      ['Rui Teixeira', 'i22', ['Corujão 28/11 (A)']],
      ['Gil Moura', 'v5', []],
    ]);
  });

  it('a demanda também na coluna do valor, e a linha de ilha solta sai, com uma nota', () => {
    const l = ler([
      ['', 'MANHÃ'],
      ['', 'AVID 22', ''],
      ['', 'EDITOR:', 'RUI'],
      ['', 'HORÁRIO:', '8H AS 17H'],
      ['', 'Corujão 28/11 (A)', 'Sessão Especial 28/11 (H)'],
      ['', 'VDI 5', ''],
    ]);
    expect(l.blocos[0].demandas.map((d) => d.texto)).toEqual(['Corujão 28/11 (A)', 'Sessão Especial 28/11 (H)']);
    expect(l.blocos[0].notas).toContain('“VDI 5” saiu: é uma ilha');
  });

  it('o 4º bloco das 20h às 2h, sem rótulo, conta como noite, com uma nota', () => {
    const l = ler([
      ...turno('TARDE', [{ ilha: 'AVID 46', nome: 'ELIS', hora: '14H AS 22H53', demandas: ['Retrospectiva 2026 31/12 (M)'] }]),
      ...turno(null, [{ ilha: 'AVID 29 - COMUNICAÇÃO', nome: 'CAIO', hora: '20H AS 02H', demandas: ['COMUNICAÇÃO'] }]),
    ]);
    expect(l.blocos.map((b) => b.turno)).toEqual(['tarde', 'noite']);
    expect(l.blocos[1].notas).toContain('sem rótulo de turno, das 20h: lido como Noite');
    expect(l.blocos[1].ilha.id).toBe('i29');
  });

  it('sem nenhum rótulo, o turno vem do horário', () => {
    expect(umBloco({ hora: '22 AS 6' }, null).turno).toBe('madrugada');
    expect(umBloco({ hora: '14H AS 22H53' }, null).turno).toBe('tarde');
  });

  it('o rótulo de um turno da Configuração também vale', () => {
    const ctx = { ...CTX, turnos: [...TURNOS_DE_FABRICA, { id: 't-plantao', nome: 'Plantão', horario: '10h às 19h' }] };
    expect(ler(turno('PLANTÃO', [{ ilha: '', nome: 'RUI', hora: '10 AS 19H', demandas: [] }]), ctx).blocos[0].turno).toBe('t-plantao');
  });

  it('sem "EDITOR:", nenhum bloco', () => {
    expect(lerOColado('Noite de Gala 27/11 (DP)\nCorujão 28/11 (A)', CTX).blocos).toEqual([]);
  });
});

describe('lerOColado: o horário', () => {
  it.each([
    ['8H AS 17', '8h às 17h'],
    ['09 AS 18', '9h às 18h'],
    ['10 AS 19H', '10h às 19h'],
    ['06H AS 15H', '6h às 15h'],
    ['16H AS 00H38', '16h às 0h38'],
  ])('"%s" vai para "%s"', (hora, padrao) => {
    expect(umBloco({ hora }).horario).toEqual({ escrito: hora, padrao });
  });
});

describe('lerOColado: a ausência', () => {
  it('no horário: férias até a data escrita', () => {
    const b = umBloco({ nome: 'ELIS', hora: 'FÉRIAS ATÉ 4/12' });
    expect(b.ausencia).toEqual({ tipo: 'ferias', ate: '2026-12-04', observacao: '', escrito: 'FÉRIAS ATÉ 4/12' });
    expect(b.horario.padrao).toBe('');
  });

  it.each([
    ['FERIAS', { tipo: 'ferias', ate: null, observacao: '' }],
    ['DM', { tipo: 'dm', ate: null, observacao: '' }],
    ['FOLGA COMP', { tipo: 'folga', ate: null, observacao: 'comp' }],
    ['folga aniver', { tipo: 'folga', ate: null, observacao: 'aniver' }],
    ['LICENÇA MÉDICA', { tipo: 'licenca', ate: null, observacao: 'médica' }],
    ['FÉRIAS - RETORNO DIA 2/1.', { tipo: 'ferias', ate: '2027-01-01', observacao: '' }],
  ])('"%s" no horário', (hora, ausencia) => {
    expect(umBloco({ hora }).ausencia).toMatchObject(ausencia);
  });

  it('na primeira demanda, com o horário normal ao lado', () => {
    const b = umBloco({ nome: 'GIL', hora: '8H AS 17H', demandas: ['FOLGA'] });
    expect(b.ausencia).toMatchObject({ tipo: 'folga' });
    expect(b.demandas).toEqual([]);
    expect(b.notas).toContain('“FOLGA” na primeira demanda: ausência');
  });
});

describe('lerOColado: os avisos', () => {
  it('a linha em maiúsculas sem data vira aviso; as tarefas conhecidas continuam tarefas', () => {
    const b = umBloco({ demandas: ['Corujão 28/11 (A)', 'CONTINUAR', 'COMUNICAÇÃO', 'Novelas(Geral)'] });
    expect(b.demandas.map((d) => d.texto)).toEqual(['Corujão 28/11 (A)', 'COMUNICAÇÃO', 'Novelas(Geral)']);
    expect(b.avisos).toEqual(['CONTINUAR']);
  });

  it('as linhas quebradas se juntam num aviso só', () => {
    const b = umBloco({ demandas: ['A PROMO VAI DIZER QUAIS PEÇAS', 'DEVEMOS EDITAR SEGUNDO A', 'PREMIAÇÃO', 'TERRA VEM PRONTA DA PROMO,', 'SÓ FINALIZAR', 'CARD NA PD', 'FINALIZAR'] });
    expect(b.avisos).toEqual(['A PROMO VAI DIZER QUAIS PEÇAS DEVEMOS EDITAR SEGUNDO A PREMIAÇÃO', 'TERRA VEM PRONTA DA PROMO, SÓ FINALIZAR', 'CARD NA PD', 'FINALIZAR']);
    expect(b.notas).toContain('5 linhas juntadas em 2 avisos');
  });
});

describe('lerOColado: os nomes', () => {
  it('pelo nome, pelo apelido do cadastro e pelo primeiro nome', () => {
    expect(umBloco({ nome: 'RUI TEIXEIRA' }).editor).toMatchObject({ como: 'exato', nome: 'Rui Teixeira' });
    expect(umBloco({ nome: 'BRASIL' }).editor).toMatchObject({ como: 'apelido', nome: 'Fernando Brasil' });
    expect(umBloco({ nome: 'FERNANDO BRASIL' }).editor).toMatchObject({ como: 'exato', nome: 'Fernando Brasil' });
    expect(umBloco({ nome: 'GUGA' }).editor).toMatchObject({ como: 'apelido', nome: 'Gil Moura' });
    expect(umBloco({ nome: 'CAIO M' }).editor).toMatchObject({ como: 'apelido', nome: 'Caio Mendes' });
  });

  it('com a ilha grudada no nome', () => {
    expect(umBloco({ nome: 'GIL 16' }).editor).toMatchObject({ como: 'apelido', nome: 'Gil Moura' });
  });

  it('o erro de digitação vira pergunta, e o nome fica como escrito até a resposta', () => {
    expect(umBloco({ nome: 'GUIL' }).editor).toEqual({ escrito: 'GUIL', como: 'parecido', nome: 'GUIL', opcoes: ['Gil Moura'] });
    expect(umBloco({ nome: 'ELIZ' }).editor).toMatchObject({ como: 'parecido', opcoes: ['Elis Furtado'] });
  });

  it('o nome que serve para mais de um também vira pergunta', () => {
    expect(umBloco({ nome: 'PAULO' }).editor).toEqual({ escrito: 'PAULO', como: 'ambiguo', nome: 'PAULO', opcoes: ['Paulo Lima', 'Paulo Reis'] });
  });

  it('o nome que não está nos cadastros é nome novo; o vazio é vaga', () => {
    expect(umBloco({ nome: 'TOMÁS NOVO' }).editor).toMatchObject({ como: 'novo', nome: 'TOMÁS NOVO' });
    expect(umBloco({ nome: '' }).editor).toMatchObject({ como: 'vazio', nome: '' });
  });
});

describe('lerOColado: as ilhas, pelo número', () => {
  it.each([
    ['AVID 46', 'i46', ''],
    ['ILHA 46', 'i46', '“ILHA 46” lida como AVID 46'],
    ['46', 'i46', '“46” lida como AVID 46'],
    ['AVID 29 - COMUNICAÇÃO', 'i29', '“AVID 29 - COMUNICAÇÃO” lida como AVID 29'],
    ['AVID COMUNICAÇÃO', 'i29', '“AVID COMUNICAÇÃO” lida como AVID 29'],
    ['ILHA 53', 'i53i', ''],
    // AVID 53 e ILHA 53 repetidas no cadastro são a mesma sala (#165): só o número fica com a primeira
    ['53', 'i53a', '“53” lida como AVID 53'],
    ['Ilha 22', 'i22', '“Ilha 22” lida como AVID 22'],
    ['VDI 05', 'v5', '“VDI 05” lida como VDI 5'],
  ])('"%s"', (ilha, id, nota) => {
    const b = umBloco({ ilha });
    expect(b.ilha.id).toBe(id);
    if (nota) expect(b.notas).toContain(nota);
  });

  it('o número que não está no cadastro, ou que serve para duas salas, fica sem ilha, com a nota', () => {
    expect(umBloco({ ilha: 'AVID 99' })).toMatchObject({ ilha: { escrito: 'AVID 99', id: '' }, notas: expect.arrayContaining(['“AVID 99” não está no cadastro das ilhas']) });
    // a VDI 46 é outra ilha, não a AVID 46 (#165)
    expect(umBloco({ ilha: 'VDI 46' })).toMatchObject({ ilha: { id: '' }, notas: expect.arrayContaining(['“VDI 46” não está no cadastro das ilhas']) });
    expect(umBloco({ ilha: 'AVID 5' })).toMatchObject({ ilha: { id: '' }, notas: expect.arrayContaining(['“AVID 5” não está no cadastro das ilhas']) });
    const comVdi53 = { ...CTX, ilhas: [...CTX.ilhas, { id: 'v53', tipo: 'VDI', numero: '53', nome: '' }] };
    expect(ler(turno('MANHÃ', [{ ilha: 'SALA 53', nome: 'RUI', hora: '8H AS 17H', demandas: [] }]), comVdi53).blocos[0]).toMatchObject({
      ilha: { id: '' },
      notas: expect.arrayContaining(['“SALA 53” serve para AVID 53 e VDI 53: escolha na grade']),
    });
  });
});

describe('o resumo antes de aplicar', () => {
  it('conta as posições, as demandas, os avisos, as ausências e as grafias que vão para o padrão', () => {
    const l = ler([
      ...turno('MANHÃ', [
        { ilha: 'AVID 22', nome: 'RUI TEIXEIRA', hora: '8H AS 17H', demandas: ['Corujão 28/11 a', 'CONTINUAR'] },
        { ilha: 'ILHA 46', nome: 'BRASIL', hora: '8h às 17h', demandas: ['COMUNICAÇÃO'] },
        { ilha: 'AVID 53', nome: 'ELIS', hora: 'FÉRIAS', demandas: [] },
        { ilha: '', nome: '', hora: '8H AS 14H', demandas: [] },
      ]),
    ]);
    // grafias: a claquete, o horário do Rui, o Brasil, a ILHA 46 e a Elis (pelo primeiro nome)
    expect(l.resumo).toEqual({ posicoes: 2, demandas: 2, avisos: 1, ausencias: 1, grafias: 5, perguntas: 0, vazias: 1 });
  });
});

describe('aplicarOColado', () => {
  let n = 0;
  const novoId = (p: string) => `${p}${++n}`;
  const ja: PosicaoDaEscala = { id: 'p-ja', turno: 'manha', editor: 'Rui Teixeira', ilha: 'i22', horario: '8h às 17h', demandas: [{ id: 'd-ja', texto: 'Corujão 28/11 (A)' }], avisos: [] };
  const colado = () =>
    ler([
      ...turno('MANHÃ', [
        { ilha: 'AVID 22', nome: 'RUI', hora: '8H AS 17H', demandas: ['Corujão 28/11 a', 'Mundo Animal 30/11 (P)', 'CONTINUAR'] },
        { ilha: 'AVID 46', nome: 'PAULO', hora: '8H AS 14H', demandas: ['CALHAUS'] },
        { ilha: 'AVID 53', nome: 'ELIS', hora: 'FÉRIAS ATÉ 4/12', demandas: ['Cozinha de Raiz 28/11 (AH)'] },
        { ilha: 'VDI 5', nome: 'GIL', hora: 'DM', demandas: [] },
      ]),
    ]);

  it('substituir: as posições no padrão, a resposta da pergunta, a vaga de quem está fora e as ausências', () => {
    n = 0;
    const l = colado();
    const paulo = l.blocos[1].id;
    const r = aplicarOColado(l, { dia: DIA, turnos: CTX.turnos, posicoes: [ja], modo: 'substituir', respostas: { [paulo]: 'Paulo Reis' }, jaFora: [], novoId });
    expect(r.posicoes.map((p) => [p.turno, p.editor, p.ilha, p.horario, p.demandas.map((d) => d.texto), p.avisos.map((a) => a.texto)])).toEqual([
      ['manha', 'Rui Teixeira', 'i22', '8h às 17h', ['Corujão 28/11 (A)', 'Mundo Animal 30/11 (P)'], ['CONTINUAR']],
      ['manha', 'Paulo Reis', 'i46', '8h às 14h', ['CALHAUS'], []],
      ['manha', '', 'i53a', '6h às 15h', ['Cozinha de Raiz 28/11 (AH)'], []],
    ]);
    expect(r.ausencias).toEqual([
      { editor: 'Elis Furtado', tipo: 'ferias', de: DIA, ate: '2026-12-04', observacao: '' },
      { editor: 'Gil Moura', tipo: 'dm', de: DIA, ate: DIA, observacao: '' },
    ]);
  });

  it('sem resposta, o nome fica como escrito; quem já está fora no dia não é marcado de novo', () => {
    const r = aplicarOColado(colado(), { dia: DIA, turnos: CTX.turnos, posicoes: [], modo: 'substituir', respostas: {}, jaFora: ['GIL MOURA'], novoId });
    expect(r.posicoes[1].editor).toBe('PAULO');
    expect(r.ausencias.map((a) => a.editor)).toEqual(['Elis Furtado']);
  });

  it('juntar: o mesmo editor no mesmo turno ganha só o que falta; o resto entra depois', () => {
    const r = aplicarOColado(colado(), { dia: DIA, turnos: CTX.turnos, posicoes: [ja], modo: 'juntar', respostas: {}, jaFora: [], novoId });
    expect(r.posicoes.map((p) => [p.id, p.editor, p.demandas.map((d) => d.texto)])).toEqual([
      ['p-ja', 'Rui Teixeira', ['Corujão 28/11 (A)', 'Mundo Animal 30/11 (P)']],
      [expect.any(String), 'PAULO', ['CALHAUS']],
      [expect.any(String), '', ['Cozinha de Raiz 28/11 (AH)']],
    ]);
    expect(r.posicoes[0].avisos.map((a) => a.texto)).toEqual(['CONTINUAR']);
  });
});
