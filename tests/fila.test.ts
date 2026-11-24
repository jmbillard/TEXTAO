import { describe, expect, it } from 'vitest';
import { agruparPorDia, filaVisivel, pendentes } from '../src/ui/fila';
import { herdarTipos } from '../src/modelo/versoes';
import { dataDaClaquete, pracaDaClaquete } from '../src/modelo/vocabularios';
import { exportar, pendencias, pendenciasDetalhadas } from '../src/modelo/exportar';
import { metaVazia, type Meta, type NoJSON } from '../src/modelo/tipos';
import type { Andamento, Resumo } from '../src/dados/armazenamento';

const resumo = (id: string, data: string, revisar: string[] = [], atualizadoEm = '2026-11-19T10:00:00Z'): Resumo => ({
  id, meta: { ...metaVazia(), dataExibicao: data, revisar }, nArtes: 1, atualizadoEm, dono: null, publico: false, meu: true,
});

describe('fila por dia de exibição', () => {
  const agora = new Date(2026, 10, 19, 15, 0); // qui, 19/11
  it('próximos dias em ordem, revisar primeiro, sem data no fim, exibidos à parte', () => {
    const { proximos, exibidos } = agruparPorDia(
      [resumo('a', '2026-11-21'), resumo('b', '2026-11-19'), resumo('c', '2026-11-19', ['Sem editor']), resumo('d', ''), resumo('e', '2026-11-18'), resumo('f', '2026-11-20')],
      agora,
    );
    expect(proximos.map((g) => [g.titulo, g.itens.map((r) => r.id)])).toEqual([
      ['Hoje', ['c', 'b']],
      ['Amanhã', ['f']],
      ['Sábado', ['a']],
      ['Sem data', ['d']],
    ]);
    expect(proximos[0].subtitulo).toBe('quinta, 19 de novembro');
    expect(exibidos.map((g) => g.itens.map((r) => r.id))).toEqual([['e']]);
  });
});

describe('claquete', () => {
  it('data e praça saem da claquete', () => {
    const hoje = new Date(2026, 10, 19);
    expect(dataDaClaquete('Quem Ama(Prologo)26/10 Rede', hoje)).toBe('2026-10-26');
    expect(dataDaClaquete('Terra 20/11-2 (AH)', hoje)).toBe('2026-11-20');
    expect(dataDaClaquete('Reveillon 2/1', hoje)).toBe('2027-01-02'); // virada do ano
    expect(dataDaClaquete('FILME INÉDITO', hoje)).toBe('');
    expect([pracaDaClaquete('Rio Fut 21/11'), pracaDaClaquete('Encontro 19/11 SP'), pracaDaClaquete('Encontro 19/11')]).toEqual(['RJ', 'SP', 'G5']);
  });
});

describe('versão nova de um roteiro', () => {
  const doc = (artes: [string, string][]): NoJSON => ({
    type: 'doc',
    content: artes.map(([texto, subtipo], k) => ({ type: 'paragraph', content: [{ type: 'text', text: texto, marks: [{ type: 'arte', attrs: { id: `x${k}-${subtipo}`, subtipo, obs: '' } }] }] })),
  });
  it('as artes que continuam iguais herdam o tipo escolhido na versão anterior', () => {
    const anterior = doc([['A GRANDE FESTA', 'cartao'], ['HOJE', 'assinatura'], ['ARTE QUE SAIU', 'logo']]);
    const nova = doc([['A grande festa', ''], ['HOJE', ''], ['ARTE NOVA', '']]);
    const { doc: resultado, herdadas } = herdarTipos(nova, anterior);
    const artes = exportar({ id: 't', meta: metaVazia(), doc: resultado, revisao: 1, criadoEm: '', atualizadoEm: '' }).artes;
    expect(artes.map((a) => [a.texto, a.subtipo])).toEqual([['A grande festa', 'cartao'], ['HOJE', 'assinatura'], ['ARTE NOVA', '']]);
    expect(herdadas).toBe(2);
  });
});

describe('pendências conferidas', () => {
  const comArtes = (n: number, meta: Partial<Meta> = {}) =>
    exportar({
      id: 't',
      meta: { ...metaVazia(), editor: 'Fulano', dataExibicao: '2026-11-20', ...meta },
      doc: { type: 'doc', content: Array.from({ length: n }, (_, k) => ({ type: 'paragraph', content: [{ type: 'text', text: `ARTE ${k}`, marks: [{ type: 'arte', attrs: { id: `a${k}`, subtipo: '' } }] }] })) },
      revisao: 1, criadoEm: '', atualizadoEm: '',
    });
  it('"está certo" tira a pendência; o que falta preencher não dá para dispensar', () => {
    expect(pendencias(comArtes(12))).toEqual(['Muitas artes: 12']);
    expect(pendencias(comArtes(12, { conferidos: ['muitas-artes'] }))).toEqual([]);
    expect(pendenciasDetalhadas(comArtes(2, { editor: '', conferidos: ['sem-editor'] })).map((p) => p.id)).toEqual(['sem-editor']);
  });
});

describe('o que segura o envio para o Trello', () => {
  it('sem editor não segura (o n8n preenche depois); o resto segura', async () => {
    const { travamTrello, TEXTO_SEM_EDITOR } = await import('../src/modelo/exportar');
    expect(travamTrello([TEXTO_SEM_EDITOR])).toEqual([]);
    expect(travamTrello([TEXTO_SEM_EDITOR, 'Muitas artes: 13'])).toEqual(['Muitas artes: 13']);
    expect(travamTrello(undefined)).toEqual([]);
  });
});

describe('data com a versão grudada por hífen', () => {
  it('"Chef_25_12-2": a claquete é CHEF 25/12-2 e a exibição, 25/12', async () => {
    const { claqueteDoArquivo, dataDaClaquete } = await import('../src/modelo/vocabularios');
    const { interpretar } = await import('../src/importar');
    expect(claqueteDoArquivo('Chef_25_12-2.docx')).toBe('CHEF 25/12-2');
    expect(dataDaClaquete('CHEF 25/12-2', new Date('2026-11-19'))).toBe('2026-12-25');
    const imp = interpretar({ arquivo: 'Chef_25_12-2.rtf', formato: 'rtf', autor: '', blocos: [] }, { anoPadrao: 2026 });
    expect(imp.meta.claquete).toBe('CHEF 25/12-2');
    expect(imp.meta.dataExibicao).toBe('2026-12-25');
    // sem outro par, o hífen ainda vale como separador
    expect(interpretar({ arquivo: 'Festa_19-11.rtf', formato: 'rtf', autor: '', blocos: [] }, { anoPadrao: 2026 }).meta.dataExibicao).toBe('2026-11-19');
  });
});

describe('o que a fila conta', () => {
  it('deixa de fora o que já foi ao ar e o que já está no Trello', () => {
    const agora = new Date(2026, 10, 19, 15);
    const lista = [
      resumo('amanha', '2026-11-20', ['sem-editor']),
      resumo('hoje', '2026-11-19'),
      resumo('ontem', '2026-11-18', ['data']),
      { ...resumo('mandado', '2026-11-21'), trello: { estado: 'enviado', url: 'https://trello.com/c/x', em: '2026-11-19T12:00:00Z' } },
      { ...resumo('antigo', '2026-11-21'), trello: { estado: 'duplicado', em: '2026-11-19T12:00:00Z' } },
      { ...resumo('falhou', '2026-11-21'), trello: { estado: 'erro', erro: 'fora do ar', em: '2026-11-19T12:00:00Z' } },
      resumo('sem-data', ''),
    ] as Resumo[];
    expect(pendentes(lista, agora).map((r) => r.id)).toEqual(['amanha', 'hoje', 'falhou', 'sem-data']);
  });
});

describe('claquete repetida fica marcada', () => {
  const rot = (meta: Partial<Meta>) =>
    exportar({ id: 'x', meta: { ...metaVazia(), editor: 'Jorge', dataExibicao: '2026-11-20', ...meta }, doc: { type: 'doc', content: [] }, revisao: 1, criadoEm: '', atualizadoEm: '' } as never);
  it('v2 e card novo viram pendência; conferida, sai', () => {
    expect(pendencias(rot({ v2De: { card: 'c', url: 'u' } }))).toContain('Versão nova (v2)');
    expect(pendencias(rot({ outroRoteiro: true }))).toContain('Claquete repetida');
    expect(pendencias(rot({ v2De: { card: 'c', url: 'u' }, conferidos: ['v2'] }))).not.toContain('Versão nova (v2)');
    expect(pendenciasDetalhadas(rot({ outroRoteiro: true })).find((p) => p.id === 'repetida')?.dispensavel).toBe(true);
  });
});

describe('nada impede o envio', () => {
  it('sem editor e sem data não seguram (o n8n completa; VT de evento não tem data)', async () => {
    const { travamTrello } = await import('../src/modelo/exportar');
    expect(travamTrello(['Sem editor', 'Sem data', 'Sem data de exibição', 'Sem editor: a claquete não está na pauta'])).toEqual([]);
    expect(travamTrello(['Sem data', 'Muitas artes: 13'])).toEqual(['Muitas artes: 13']);
  });
});

describe('acervo: a que já existe vem riscada; quem revisa devolve ao checklist (↺)', () => {
  it('as artes do roteiro que estão no acervo da atração já contam como existentes, sem pendência', async () => {
    const { artesQueJaExistem } = await import('../src/modelo/exportar');
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: ['HOJE', 'AMANHÃ', 'SÁBADO'].flatMap((t, i) => [{ type: 'text', text: t, marks: [{ type: 'arte', attrs: { id: 'a' + i } }] }, { type: 'text', text: ' ' }]) }] };
    const s = (meta: Partial<Meta>) => exportar({ id: 'x', meta: { ...metaVazia(), ...meta }, doc, revisao: 1, criadoEm: '', atualizadoEm: '' } as never);
    const jaExistem = [{ arte: 'HOJE', chave: 'HOJE', tipo: '', claquete: 'C' }, { arte: 'Amanhã', chave: 'AMANHA', tipo: '', claquete: 'C' }];
    expect(artesQueJaExistem(s({ jaExistem }))).toEqual([]);
    expect(pendencias(s({ jaExistem }))).not.toContain('Já existem: 2');
  });
});

describe('No Trello: a semana de agenda', () => {
  const agora = new Date(2026, 10, 24, 15, 0); // ter, 24/11
  const enviado = (id: string, data: string, claquete = id.toUpperCase()): Resumo => ({
    ...resumo(id, data),
    meta: { ...metaVazia(), dataExibicao: data, claquete },
    trello: { estado: 'enviado', url: 'https://trello.com/c/x', em: '2026-11-20T12:00:00Z' },
  });

  it('sete colunas fixas a partir de ontem: hoje na segunda, com ontem, hoje e amanhã marcados', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const s = montarSemana([], {}, agora);
    expect(s.dias.map((d) => [d.diaDaSemana, d.numero])).toEqual([['seg', 23], ['ter', 24], ['qua', 25], ['qui', 26], ['sex', 27], ['sáb', 28], ['dom', 29]]);
    expect(s.dias.map((d) => d.marca)).toEqual(['ontem', 'hoje', 'amanhã', '', '', '', '']);
    expect(s.dias.filter((d) => d.fimDeSemana).map((d) => d.numero)).toEqual([28, 29]);
    expect(s.periodo).toBe('23 – 29 de novembro');
  });

  it('ontem no mês anterior: a semana começa no último dia do mês que passou', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const s = montarSemana([], {}, new Date(2026, 11, 1, 9, 0)); // ter, 1/12
    expect(s.dias.map((d) => d.iso)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
    expect(s.dias.map((d) => d.marca).slice(0, 3)).toEqual(['ontem', 'hoje', 'amanhã']);
    expect(s.periodo).toBe('30 de novembro – 6 de dezembro');
  });

  it('as setas andam de sete em sete dias, atravessando o mês', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const seguinte = montarSemana([], {}, agora, 1);
    expect(seguinte.dias.map((d) => d.iso)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
    expect(seguinte.dias.some((d) => d.marca)).toBe(false);
    expect(seguinte.periodo).toBe('30 de novembro – 6 de dezembro');
    const anterior = montarSemana([], {}, agora, -1);
    expect([anterior.dias[0].iso, anterior.dias[6].iso]).toEqual(['2026-11-16', '2026-11-22']);
    expect(anterior.dias.some((d) => d.marca)).toBe(false);
    expect(montarSemana([], {}, new Date(2026, 10, 27), 0).periodo).toBe('26 de novembro – 2 de dezembro');
  });

  it('cada card enviado fica no dia de exibição dele; o que não foi ao Trello fica de fora', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const lista = [
      enviado('festa', '2026-11-26', 'FESTA 26/11'),
      enviado('chef', '2026-11-24', 'CHEF 24/11'),
      enviado('bolo', '2026-11-26', 'BOLO 26/11'),
      enviado('longe', '2026-12-10'),
      enviado('ontem', '2026-11-23'),
      resumo('na-revisao', '2026-11-24'),
    ];
    const s = montarSemana(lista, {}, agora);
    expect(s.dias.map((d) => d.cards.map((c) => c.r.id))).toEqual([['ontem'], ['chef'], [], ['bolo', 'festa'], [], [], []]);
    expect(montarSemana(lista, {}, agora, 2).dias[3].cards.map((c) => c.r.id)).toEqual(['longe']);
  });

  it('o roteiro sem data fica à parte, fora das colunas, em qualquer semana', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const lista = [enviado('vt', '', 'VT EVENTO'), enviado('chef', '2026-11-24')];
    for (const n of [0, 1]) {
      const s = montarSemana(lista, {}, agora, n);
      expect(s.semData.map((c) => c.r.id)).toEqual(['vt']);
      expect(s.dias.flatMap((d) => d.cards).map((c) => c.r.id)).not.toContain('vt');
    }
  });

  it('a etapa sai das etiquetas do andamento: caiu vence tudo; finalizado ou entregue é entregue', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const andamento = (status: string[], entregue = false): Andamento => ({ status, designers: [], entregue, entrega: null });
    const ids = ['prod', 'aprov', 'final', 'entregue', 'caiu', 'caiu-entregue', 'esperando', 'sem-andamento', 'alteracao'];
    const s = montarSemana(ids.map((id) => enviado(id, '2026-11-24')), {
      prod: andamento(['PRODUZINDO']),
      aprov: andamento(['Em aprovação']),
      final: andamento(['FINALIZADO']),
      entregue: andamento([], true),
      caiu: andamento(['CAIU']),
      'caiu-entregue': andamento(['PRODUZINDO', 'CAIU'], true),
      esperando: andamento(['AGUARDANDO MATERIAL']),
      alteracao: andamento(['PEDIDO DE ALTERAÇÃO']),
    }, agora);
    const etapa = Object.fromEntries(s.dias[1].cards.map((c) => [c.r.id, c.etapa]));
    expect(etapa).toEqual({
      prod: 'produzindo', aprov: 'aprovacao', final: 'entregue', entregue: 'entregue', caiu: 'caiu', 'caiu-entregue': 'caiu',
      esperando: null, 'sem-andamento': null, alteracao: null,
    });
    // o que caiu desce para o fim do dia
    expect(s.dias[1].cards.slice(-2).map((c) => c.r.id)).toEqual(['caiu', 'caiu-entregue']);
  });

  it('o título conta os cards da semana mostrada e quantos foram entregues', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const pronto: Andamento = { status: ['FINALIZADO'], designers: [], entregue: true, entrega: null };
    const caiu: Andamento = { status: ['CAIU'], designers: [], entregue: true, entrega: null };
    const lista = [enviado('a', '2026-11-24'), enviado('b', '2026-11-25'), enviado('c', '2026-11-29'), enviado('d', '2026-11-30'), enviado('e', '2026-11-22')];
    const s = montarSemana(lista, { a: pronto, b: caiu, d: pronto }, agora);
    expect([s.total, s.entregues]).toEqual([3, 1]);
    expect([montarSemana(lista, { a: pronto, d: pronto }, agora, 1).total, montarSemana(lista, { d: pronto }, agora, 1).entregues]).toEqual([1, 1]);
  });

  it('o título conta quantos cards da semana mostrada estão na lista de prioridade, e cada card diz se está', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const prio: Andamento = { status: ['PRODUZINDO'], designers: [], entregue: false, entrega: null, prioridade: true };
    const lista = [enviado('a', '2026-11-24'), enviado('b', '2026-11-25'), enviado('c', '2026-11-26'), enviado('fora', '2026-12-05'), resumo('fila', '2026-11-24')];
    const andamento = { a: prio, c: { ...prio, status: ['CAIU'] }, fora: prio, fila: prio, b: { ...prio, prioridade: undefined } };
    const s = montarSemana(lista, andamento, agora);
    expect(s.comPrioridade).toBe(2);
    expect(s.dias.flatMap((d) => d.cards).filter((c) => c.prioridade).map((c) => c.r.id)).toEqual(['a', 'c']);
    expect(montarSemana(lista, {}, agora).comPrioridade).toBe(0);
  });

  it('os dias anteriores a ontem, do mais recente para o mais antigo, para achar o card que já passou', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const lista = [enviado('a', '2026-11-20'), enviado('b', '2026-11-22'), enviado('c', '2026-11-20'), enviado('ontem', '2026-11-23'), enviado('d', '2026-11-24'), enviado('e', '')];
    const { anteriores } = montarSemana(lista, {}, agora, 1);
    expect(anteriores.map((d) => [d.titulo, d.cards.map((c) => c.r.id)])).toEqual([
      ['domingo, 22 de novembro', ['b']],
      ['sexta, 20 de novembro', ['a', 'c']],
    ]);
  });
});

describe('No Trello: o card aberto', () => {
  const andamento = (status: string[], extra: Partial<Andamento> = {}): Andamento => ({ status, designers: [], entregue: false, entrega: null, ...extra });

  it('a etapa por extenso: o nome de cada etiqueta, com caiu e entregue vencendo as outras', async () => {
    const { etapaPorExtenso } = await import('../src/ui/fila');
    expect(etapaPorExtenso(andamento(['PRODUZINDO'])).nome).toBe('Produzindo');
    expect(etapaPorExtenso(andamento(['AGUARDANDO MATERIAL', 'PEDIDO DE ALTERAÇÃO'])).nome).toBe('Aguardando material, Pedido de alteração');
    expect(etapaPorExtenso(andamento(['NOVA ETIQUETA'])).nome).toBe('Nova etiqueta');
    expect(etapaPorExtenso(andamento(['PRODUZINDO'], { entregue: true })).nome).toBe('Entregue');
    expect(etapaPorExtenso(andamento(['FINALIZADO', 'PRODUZINDO'])).nome).toBe('Entregue');
    expect(etapaPorExtenso(andamento(['PRODUZINDO', 'CAIU'], { entregue: true })).nome).toBe('Caiu');
    expect(etapaPorExtenso(andamento([])).nome).toBe('');
    expect(etapaPorExtenso(undefined)).toEqual({ nome: '', ate: '' });
  });

  it('o prazo "até" é o dia da entrega em Brasília, só enquanto o card não foi entregue nem caiu', async () => {
    const { etapaPorExtenso } = await import('../src/ui/fila');
    // 25/11 às 23h em Brasília já é 26/11 em UTC
    expect(etapaPorExtenso(andamento(['PRODUZINDO'], { entrega: '2026-11-26T02:00:00.000Z' })).ate).toBe('25/11');
    expect(etapaPorExtenso(andamento([], { entrega: '2026-12-03T15:00:00.000Z' }))).toEqual({ nome: '', ate: '03/12' });
    expect(etapaPorExtenso(andamento(['PRODUZINDO'], { entrega: '2026-11-26T15:00:00.000Z', entregue: true })).ate).toBe('');
    expect(etapaPorExtenso(andamento(['CAIU'], { entrega: '2026-11-26T15:00:00.000Z' })).ate).toBe('');
    expect(etapaPorExtenso(andamento(['PRODUZINDO'])).ate).toBe('');
  });

  it('a rubrica de quem revisou: o primeiro nome e a inicial do último', async () => {
    const { rubrica } = await import('../src/ui/fila');
    expect(rubrica('Clara Vieira')).toBe('Clara V.');
    expect(rubrica('  Ana Maria da Costa ')).toBe('Ana C.');
    expect(rubrica('Bruno')).toBe('Bruno');
    expect(rubrica('')).toBe('');
  });
});

describe('No Trello: a semana encolhida', () => {
  const agora = new Date(2026, 10, 24, 15, 0); // ter, 24/11
  const pronto = resumo('pronto', '2026-11-25');
  const paraRevisar = resumo('revisar', '2026-11-25', ['falta o editor']);
  const jaFoiAoAr = resumo('antigo', '2026-11-20', ['falta o editor']);
  const enviadoComPendencia: Resumo = { ...resumo('enviado', '2026-11-25', ['falta o editor']), trello: { estado: 'enviado', url: 'https://trello.com/c/x', em: '2026-11-20T12:00:00Z' } };

  it('com roteiros para revisar, a semana encolhe', async () => {
    const { semanaEncolhida } = await import('../src/ui/fila');
    expect(semanaEncolhida([pronto, paraRevisar], false, agora)).toBe(true);
  });

  it('com a fila em dia, a semana fica no tamanho normal', async () => {
    const { semanaEncolhida } = await import('../src/ui/fila');
    expect(semanaEncolhida([pronto], false, agora)).toBe(false);
    expect(semanaEncolhida([], false, agora)).toBe(false);
    // o que já foi ao ar ou já está no Trello não conta como revisão pendente
    expect(semanaEncolhida([pronto, jaFoiAoAr, enviadoComPendencia], false, agora)).toBe(false);
  });

  it('quem escolheu "ver a semana inteira" vê a semana no tamanho normal mesmo com revisão', async () => {
    const { semanaEncolhida } = await import('../src/ui/fila');
    expect(semanaEncolhida([pronto, paraRevisar], true, agora)).toBe(false);
  });
});

describe('a fila visível', () => {
  const lista = [resumo('a', ''), resumo('b', '2026-11-25'), resumo('c', '2026-11-26')];
  it('tira o que está saindo (no prazo do desfazer) e o que foi apagado há pouco', () => {
    expect(filaVisivel(lista, 'b', new Set(['c'])).map((r) => r.id)).toEqual(['a']);
  });
  it('o apagado há pouco continua fora mesmo se uma leitura antiga do servidor ainda o trouxer', () => {
    expect(filaVisivel(lista, undefined, new Set(['a'])).map((r) => r.id)).toEqual(['b', 'c']);
  });
  it('sem nada saindo, mostra tudo; antes da primeira leitura, nada', () => {
    expect(filaVisivel(lista, undefined, new Set()).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(filaVisivel(null, undefined, new Set())).toEqual([]);
  });
});
