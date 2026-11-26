import { describe, expect, it } from 'vitest';
import { agruparPorDia, filaVisivel, pendentes, proximoParaRevisar } from '../src/ui/fila';
import { herdarTipos, manterAsDuas, substituirVersao } from '../src/modelo/versoes';
import { dataDaClaquete, pracaDaClaquete } from '../src/modelo/vocabularios';
import { exportar, pendencias, pendenciasDetalhadas } from '../src/modelo/exportar';
import { metaVazia, type Meta, type NoJSON, type Roteiro } from '../src/modelo/tipos';
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
  it('a praça do Rio vale com qualquer separador depois de "RIO", não com palavra que só começa por ele', () => {
    expect(pracaDaClaquete('Rio(Vim De La)21/11-2')).toBe('RJ');
    expect(pracaDaClaquete('RIO SHOW 5/12')).toBe('RJ');
    expect(pracaDaClaquete('Rio_Show')).toBe('RJ');
    expect(pracaDaClaquete('RIOS DO BRASIL 5/12')).toBe('G5');
    expect(pracaDaClaquete('RIOGRANDENSE')).toBe('G5');
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

  const roteiro = (id: string, artes: [string, string][], meta: Partial<Meta> = {}): Roteiro => ({
    id, meta: { ...metaVazia(), dataExibicao: '2026-11-20', ...meta }, doc: doc(artes), revisao: 1, criadoEm: '', atualizadoEm: '',
  });

  it('substituir: fica a nova, sem a pergunta, com os tipos e o editor da anterior', () => {
    const anterior = roteiro('a', [['VEM AÍ', 'cartao']], { editor: 'Fulano' });
    const nova = roteiro('n', [['Vem ai', '']], { substitui: 'a' });
    const { roteiro: r, herdadas } = substituirVersao(nova, anterior);
    expect(r.id).toBe('n');
    expect(r.meta.substitui).toBeUndefined();
    expect(r.meta.editor).toBe('Fulano');
    expect(exportar(r).artes.map((a) => a.subtipo)).toEqual(['cartao']);
    expect(herdadas).toBe(1);
    expect(r.meta.revisar).toEqual(pendencias(exportar(r)));
  });

  it('substituir: o editor que a nova já tem não é trocado', () => {
    const { roteiro: r } = substituirVersao(roteiro('n', [['HOJE', '']], { editor: 'Beltrano', substitui: 'a' }), roteiro('a', [['HOJE', '']], { editor: 'Fulano' }));
    expect(r.meta.editor).toBe('Beltrano');
  });

  it('substituir: as artes que continuam herdam já existe, não produzir, produzir e a complexidade', () => {
    const anterior = roteiro('a', [['VEM AÍ', 'cartao'], ['HOJE', 'assinatura'], ['DOMINGO', 'cartao'], ['NO PLAY', 'logo'], ['SAIU', 'logo']], {
      jaExiste: ['VEM AI', 'SAIU'],
      naoProduzir: ['HOJE'],
      produzir: ['NO PLAY'],
      complexidade: { DOMINGO: 3, SAIU: 2 },
    });
    const nova = roteiro('n', [['Vem aí', ''], ['Hoje', ''], ['Domingo', ''], ['No play', ''], ['ARTE NOVA', '']], { substitui: 'a' });
    const { roteiro: r } = substituirVersao(nova, anterior);
    expect(r.meta.jaExiste).toEqual(['VEM AI']);
    expect(r.meta.naoProduzir).toEqual(['HOJE']);
    expect(r.meta.produzir).toEqual(['NO PLAY']);
    expect(r.meta.complexidade).toEqual({ DOMINGO: 3 });
  });

  it('substituir: a marca que a nova já tem vale mais que a da anterior', () => {
    const anterior = roteiro('a', [['HOJE', ''], ['DOMINGO', '']], { naoProduzir: ['HOJE'], complexidade: { DOMINGO: 3 } });
    const nova = roteiro('n', [['HOJE', ''], ['DOMINGO', '']], { jaExiste: ['HOJE'], complexidade: { DOMINGO: 2 }, substitui: 'a' });
    const { roteiro: r } = substituirVersao(nova, anterior);
    expect(r.meta.jaExiste).toEqual(['HOJE']);
    expect(r.meta.naoProduzir).toBeUndefined();
    expect(r.meta.complexidade).toEqual({ DOMINGO: 2 });
  });

  it('substituir: sem marcas na anterior, a nova fica sem marcas', () => {
    const { roteiro: r } = substituirVersao(roteiro('n', [['HOJE', '']], { substitui: 'a' }), roteiro('a', [['HOJE', '']]));
    expect([r.meta.jaExiste, r.meta.naoProduzir, r.meta.produzir, r.meta.complexidade]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('manter as duas: a nova só perde a pergunta', () => {
    const nova = roteiro('n', [['HOJE', '']], { substitui: 'a', editor: 'Fulano' });
    const r = manterAsDuas(nova);
    expect(r.meta.substitui).toBeUndefined();
    expect(r.doc).toBe(nova.doc);
    expect(r.meta.editor).toBe('Fulano');
  });
});

describe('pendências conferidas', () => {
  const comArtes = (n: number, meta: Partial<Meta> = {}) =>
    exportar({
      id: 't',
      meta: { ...metaVazia(), redator: 'Fulana', editor: 'Fulano', dataExibicao: '2026-11-20', ...meta },
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

describe('data no padrão dia-mês-versão, tudo com hífen', () => {
  const hoje = new Date('2026-11-25');
  it('o nome do arquivo "D-M-V" vira a claquete "D/M-V" e a exibição D/M, não M/V', async () => {
    const { claqueteDoArquivo } = await import('../src/modelo/vocabularios');
    const { interpretar } = await import('../src/importar');
    const casos: [string, string, string][] = [
      ['Show_De_Verao_5-12-2.docx', 'SHOW DE VERAO 5/12-2', '2026-12-05'],
      ['Sitio_26-11-2.docx', 'SITIO 26/11-2', '2026-11-26'],
      ['Sitio 25-11-2.rtf', 'SITIO 25/11-2', '2026-11-25'],
      ['Sitio_5_12-2.docx', 'SITIO 5/12-2', '2026-12-05'],
      ['Sitio 5 12-2.docx', 'SITIO 5/12-2', '2026-12-05'],
      ['Sitio_5-12-V2.docx', 'SITIO 5/12-V2', '2026-12-05'],
      ['Sitio_5-12.docx', 'SITIO 5/12', '2026-12-05'],
      // a versão antes da data, grudada nas letras, não rouba o dia
      ['Sitio_V2-26-11.docx', 'SITIO V2-26/11', '2026-11-26'],
      // a barra e o hífen da versão viram underline ou espaço: valem os primeiros números
      ['Sitio_5_12_2.docx', 'SITIO 5/12-2', '2026-12-05'],
      ['Sitio_5-12_2.docx', 'SITIO 5/12-2', '2026-12-05'],
      ['Sitio 5 12 2.docx', 'SITIO 5/12-2', '2026-12-05'],
      // período "dia a dia/mês": a data é o primeiro dia
      ['Sitio_8_a_20_12.docx', 'SITIO 8 A 20/12', '2026-12-08'],
      ['Sitio 8 A 20 12-2.docx', 'SITIO 8 A 20/12-2', '2026-12-08'],
      ['Sitio 8 a 20-12.docx', 'SITIO 8 A 20/12', '2026-12-08'],
      ['Sitio_8_a_20_12_2.docx', 'SITIO 8 A 20/12-2', '2026-12-08'],
      ['Sitio_8-a-20-12-2.docx', 'SITIO 8 A 20/12-2', '2026-12-08'],
    ];
    for (const [arquivo, claquete, data] of casos) {
      expect(claqueteDoArquivo(arquivo), arquivo).toBe(claquete);
      const imp = interpretar({ arquivo, formato: 'rtf', autor: '', blocos: [] }, { anoPadrao: 2026 });
      expect(imp.meta.claquete, arquivo).toBe(claquete);
      expect(imp.meta.dataExibicao, arquivo).toBe(data);
    }
  });
  it('a claquete digitada com hífen também dá a data', async () => {
    const { dataDaClaquete } = await import('../src/modelo/vocabularios');
    expect(dataDaClaquete('SHOW DE VERÃO 5-12-2', hoje)).toBe('2026-12-05');
    expect(dataDaClaquete('SITIO 26-11-2', hoje)).toBe('2026-11-26');
    expect(dataDaClaquete('SITIO 26-11', hoje)).toBe('2026-11-26');
    // a barra continua valendo antes do hífen
    expect(dataDaClaquete('SITIO 26/11-2', hoje)).toBe('2026-11-26');
    // período: o primeiro dia
    expect(dataDaClaquete('SITIO 8 a 20/12-2', hoje)).toBe('2026-12-08');
    expect(dataDaClaquete('SITIO 8 A 20/12', hoje)).toBe('2026-12-08');
    expect(dataDaClaquete('SITIO 8 A 20-12-2', hoje)).toBe('2026-12-08');
  });

  describe('o número do nome da atração não entra na data (#46)', () => {
    // atrações fictícias com número no nome: uma pela key da claquete, outra só pelo nome
    const cadastro = {
      programas: [
        { nome: 'Fórmula 1', chaves: ['FORMULA 1', 'F1'] },
        { nome: 'Copa 2', chaves: [] },
      ],
      redatores: [],
    };
    const comCadastro = async <T,>(fazer: () => T | Promise<T>): Promise<T> => {
      const { registrarVocabulario } = await import('../src/modelo/vocabularios');
      registrarVocabulario(cadastro);
      try {
        return await fazer();
      } finally {
        registrarVocabulario(null);
      }
    };

    it('com a atração cadastrada, o número dela fica fora da data', async () => {
      const { claqueteDoArquivo, dataDaClaquete } = await import('../src/modelo/vocabularios');
      const { interpretar } = await import('../src/importar');
      const casos: [string, string, string][] = [
        ['Formula_1_5-12-2.docx', 'FORMULA 1 5/12-2', '2026-12-05'],
        ['Fórmula 1 5-12.docx', 'FÓRMULA 1 5/12', '2026-12-05'],
        ['Formula_1_5_12_2.docx', 'FORMULA 1 5/12-2', '2026-12-05'],
        ['Copa_2_8_a_20_12-2.docx', 'COPA 2 8 A 20/12-2', '2026-12-08'],
        ['Rio_Copa_2_5-12.docx', 'RIO COPA 2 5/12', '2026-12-05'],
      ];
      await comCadastro(() => {
        for (const [arquivo, claquete, data] of casos) {
          expect(claqueteDoArquivo(arquivo), arquivo).toBe(claquete);
          const imp = interpretar({ arquivo, formato: 'rtf', autor: '', blocos: [] }, { anoPadrao: 2026 });
          expect(imp.meta.claquete, arquivo).toBe(claquete);
          expect(imp.meta.dataExibicao, arquivo).toBe(data);
        }
        // na claquete digitada, só o traço separa dia e mês
        expect(dataDaClaquete('COPA 2-5-12-2', hoje)).toBe('2026-12-05');
        expect(dataDaClaquete('FORMULA 1 5/12-2', hoje)).toBe('2026-12-05');
      });
    });

    it('o nome só parecido com a atração não perde o número', async () => {
      const { claqueteDoArquivo } = await import('../src/modelo/vocabularios');
      await comCadastro(() => {
        // "Copa 25" não é "Copa 2": o 25 é o dia
        expect(claqueteDoArquivo('Copa_25-12-2.docx')).toBe('COPA 25/12-2');
        // a atração no meio do nome não conta: só o começo
        expect(claqueteDoArquivo('Chamada_Copa_2_5-12.docx')).toBe('CHAMADA COPA 2/5-12');
      });
    });

    it('sem cadastro, vale a regra dos primeiros números', async () => {
      const { claqueteDoArquivo, dataDaClaquete } = await import('../src/modelo/vocabularios');
      expect(claqueteDoArquivo('Formula_1_5-12-2.docx')).toBe('FORMULA 1/5-12-2');
      expect(claqueteDoArquivo('Copa_2_5-12.docx')).toBe('COPA 2/5-12');
      expect(dataDaClaquete('COPA 2-5-12', hoje)).toBe('2027-05-02');
    });

    it('o cadastro que chega depois da leitura vai como parâmetro', async () => {
      const { claqueteDoArquivo, dataDaClaquete, lerDataDaClaquete, refazerPelaAtracao } = await import('../src/modelo/vocabularios');
      expect(claqueteDoArquivo('Formula_1_5-12-2.docx', ['Fórmula 1'])).toBe('FORMULA 1 5/12-2');
      expect(lerDataDaClaquete('FORMULA 1 5 12 2', 'arquivo', ['Fórmula 1'])).toMatchObject({ dia: 5, mes: 12 });
      expect(dataDaClaquete('COPA 2-5-12', hoje, ['Copa 2'])).toBe('2026-12-05');
      // a atração que o servidor achou depois da importação conserta a claquete e a data tiradas do nome
      expect(refazerPelaAtracao({ claquete: 'FORMULA 1/5-12-2', dataExibicao: '2026-05-01' }, 'Formula_1_5-12-2.docx', 'Fórmula 1')).toEqual({
        claquete: 'FORMULA 1 5/12-2',
        dataExibicao: '2026-12-05',
      });
      // a data que veio do texto do roteiro fica
      expect(refazerPelaAtracao({ claquete: 'FORMULA 1/5-12-2', dataExibicao: '2026-12-07' }, 'Formula_1_5-12-2.docx', 'Fórmula 1')).toEqual({
        claquete: 'FORMULA 1 5/12-2',
        dataExibicao: '2026-12-07',
      });
      // a claquete que veio da pauta, ou uma atração sem número: nada muda
      expect(refazerPelaAtracao({ claquete: 'Formula 1 5/12-2', dataExibicao: '2026-12-05' }, 'Formula_1_5-12-2.docx', 'Fórmula 1')).toBeNull();
      expect(refazerPelaAtracao({ claquete: 'SITIO 5/12-2', dataExibicao: '2026-12-05' }, 'Sitio_5-12-2.docx', 'Sítio')).toBeNull();
    });
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

describe('sem redator', () => {
  const rot = (meta: Partial<Meta>) =>
    exportar({ id: 'x', meta: { ...metaVazia(), redator: 'Fulana Prado', editor: 'Jorge', dataExibicao: '2026-11-20', ...meta }, doc: { type: 'doc', content: [] }, revisao: 1, criadoEm: '', atualizadoEm: '' } as never);
  it('vira pendência ao lado de "Sem editor", e não dá para dispensar', () => {
    expect(pendenciasDetalhadas(rot({ redator: '', editor: '' })).map((p) => p.id).filter((id) => id.startsWith('sem-'))).toEqual(['sem-arte', 'sem-redator', 'sem-editor']);
    expect(pendenciasDetalhadas(rot({ redator: '', conferidos: ['sem-redator'] })).find((p) => p.id === 'sem-redator')).toMatchObject({ texto: 'Sem redator', dispensavel: false });
  });
  it('com o redator preenchido (o palpite aceito), a pendência cai', () => {
    expect(pendencias(rot({ redator: 'Fulana Prado' }))).not.toContain('Sem redator');
  });
  it('não segura o envio ao Trello', async () => {
    const { travamTrello, TEXTO_SEM_REDATOR } = await import('../src/modelo/exportar');
    expect(TEXTO_SEM_REDATOR).toBe('Sem redator');
    expect(travamTrello(['Sem redator', 'Sem editor'])).toEqual([]);
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

describe('No Trello: a agenda ao vivo', () => {
  const agora = new Date(2026, 10, 24, 15, 0); // ter, 24/11
  const enviado = (id: string, data: string): Resumo => ({
    ...resumo(id, data),
    meta: { ...metaVazia(), dataExibicao: data, claquete: id.toUpperCase() },
    trello: { estado: 'enviado', url: 'https://trello.com/c/x', em: '2026-11-20T12:00:00Z' },
  });
  const semana = async (lista: Resumo[], andamento: Record<string, Andamento> = {}) => (await import('../src/ui/fila')).montarSemana(lista, andamento, agora);

  it('o card sem data que ganha data muda de coluna: do "sem data" para o dia', async () => {
    const { mudancasDaSemana } = await import('../src/ui/fila');
    const antes = await semana([enviado('vt', ''), enviado('chef', '2026-11-24')]);
    const depois = await semana([enviado('vt', '2026-11-26'), enviado('chef', '2026-11-24')]);
    expect(mudancasDaSemana(antes, depois)).toEqual({ sairam: [], entraram: [], moveram: [{ id: 'vt', de: 'sem-data', para: '2026-11-26' }] });
  });

  it('o card apagado sai, e o enviado agora entra; quem fica no lugar não aparece', async () => {
    const { mudancasDaSemana } = await import('../src/ui/fila');
    const antes = await semana([enviado('chef', '2026-11-24'), enviado('vt', ''), enviado('bolo', '2026-11-25')]);
    const depois = await semana([enviado('bolo', '2026-11-25'), enviado('festa', '2026-11-27'), enviado('evento', '')]);
    expect(mudancasDaSemana(antes, depois)).toEqual({ sairam: ['chef', 'vt'], entraram: ['festa', 'evento'], moveram: [] });
  });

  it('o card que só muda de etapa (e desce para o fim do dia ao cair) não aparece em nada', async () => {
    const { mudancasDaSemana } = await import('../src/ui/fila');
    const lista = [enviado('a', '2026-11-24'), enviado('b', '2026-11-24')];
    const caiu: Andamento = { status: ['CAIU'], designers: [], entregue: false, entrega: null };
    expect(mudancasDaSemana(await semana(lista), await semana(lista, { a: caiu }))).toEqual({ sairam: [], entraram: [], moveram: [] });
  });

  it('o card que muda de dia dentro da semana vai de uma coluna para a outra; o que vai para fora dela sai', async () => {
    const { mudancasDaSemana } = await import('../src/ui/fila');
    const antes = await semana([enviado('a', '2026-11-24'), enviado('b', '2026-11-25')]);
    const depois = await semana([enviado('a', '2026-11-28'), enviado('b', '2026-12-10')]);
    expect(mudancasDaSemana(antes, depois)).toEqual({ sairam: ['b'], entraram: [], moveram: [{ id: 'a', de: '2026-11-24', para: '2026-11-28' }] });
  });
});

describe('No Trello: o card aberto', () => {
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

describe('No Trello no celular: a faixa de dias', () => {
  const agora = new Date(2026, 10, 25, 15, 0); // qua, 25/11
  const enviado = (id: string, data: string): Resumo => ({
    ...resumo(id, data),
    meta: { ...metaVazia(), dataExibicao: data, claquete: id.toUpperCase() },
    trello: { estado: 'enviado', url: 'https://trello.com/c/x', em: '2026-11-20T12:00:00Z' },
  });

  it('vai das duas semanas de agenda antes da de agora até as duas depois: 35 dias, e abre em hoje', async () => {
    const { montarFaixa } = await import('../src/ui/fila');
    const f = montarFaixa([], {}, agora);
    expect(f.dias).toHaveLength(35);
    expect([f.dias[0].iso, f.dias[34].iso]).toEqual(['2026-11-10', '2026-12-14']);
    expect(f.dias[f.hoje].iso).toBe('2026-11-25');
    expect(f.dias.slice(f.hoje - 1, f.hoje + 2).map((d) => d.marca)).toEqual(['ontem', 'hoje', 'amanhã']);
  });

  it('cada card cai no seu dia; o que está fora das pontas não entra na faixa, e o sem data fica à parte', async () => {
    const { montarFaixa } = await import('../src/ui/fila');
    const lista = [enviado('primeiro', '2026-11-10'), enviado('ultimo', '2026-12-14'), enviado('antes', '2026-11-09'), enviado('depois', '2026-12-15'), enviado('vt', '')];
    const f = montarFaixa(lista, {}, agora);
    expect(f.dias.flatMap((d) => d.cards.map((c) => [d.iso, c.r.id]))).toEqual([['2026-11-10', 'primeiro'], ['2026-12-14', 'ultimo']]);
    expect(f.semData.map((c) => c.r.id)).toEqual(['vt']);
  });

  it('os dias à vista saem da posição da rolagem: o dia na ponta esquerda e o seguinte, parando nas pontas', async () => {
    const { diasAVista } = await import('../src/ui/fila');
    // cada dia ocupa 183 px (meia largura mais o vão)
    expect(diasAVista(15 * 183, 183, 35)).toEqual([15, 16]);
    expect(diasAVista(15 * 183 + 80, 183, 35)).toEqual([15, 16]); // menos de meio dia: fica
    expect(diasAVista(15 * 183 + 100, 183, 35)).toEqual([16, 17]); // mais de meio dia: o seguinte
    expect(diasAVista(-40, 183, 35)).toEqual([0, 1]); // o puxão além da ponta (iOS)
    expect(diasAVista(40 * 183, 183, 35)).toEqual([33, 34]);
    expect(diasAVista(500, 0, 35)).toEqual([0, 1]); // ainda sem medida
  });

  it('o período escrito curto: o mês uma vez só, ou nos dois lados na virada do mês e do ano', async () => {
    const { periodoCurto } = await import('../src/ui/fila');
    expect(periodoCurto('2026-11-25', '2026-11-26')).toBe('25 – 26/11');
    expect(periodoCurto('2026-11-30', '2026-12-01')).toBe('30/11 – 1/12');
    expect(periodoCurto('2026-12-31', '2027-01-01')).toBe('31/12 – 1/1');
    expect(periodoCurto('2026-12-01', '2026-12-02')).toBe('1 – 2/12');
  });

  it('o contador vai do valor antigo ao novo sempre em inteiros, rápido no começo e devagar no fim', async () => {
    const { valorNaContagem } = await import('../src/ui/fila');
    expect(valorNaContagem(0, 4, 0)).toBe(0);
    expect(valorNaContagem(0, 4, 1)).toBe(4);
    // na metade do tempo já passou bem da metade do caminho (a curva --suave)
    expect(valorNaContagem(0, 10, 0.5)).toBe(9);
    expect(valorNaContagem(4, 1, 0.25)).toBe(2); // para baixo também
    expect(valorNaContagem(3, 3, 0.5)).toBe(3);
    // nunca passa do alvo nem volta antes da partida, mesmo com o instante fora de 0 a 1
    expect(valorNaContagem(2, 5, 1.4)).toBe(5);
    expect(valorNaContagem(2, 5, -0.2)).toBe(2);
  });

  it('o período em partes: o dia e o mês de cada lado, com o mês da esquerda só na virada', async () => {
    const { partesDoPeriodo } = await import('../src/ui/fila');
    expect(partesDoPeriodo('2026-11-25', '2026-11-26')).toEqual({ dia1: 25, mes1: '', dia2: 26, mes2: '/11' });
    expect(partesDoPeriodo('2026-12-31', '2027-01-01')).toEqual({ dia1: 31, mes1: '/12', dia2: 1, mes2: '/1' });
  });

  it('o período contando na virada do mês: os dias passam pelas datas e os meses somem até o fim, sem nunca mostrar um mês errado', async () => {
    const { montarFaixa, periodoNaContagem } = await import('../src/ui/fila');
    const isos = montarFaixa([], {}, agora).dias.map((d) => d.iso);
    const hoje = isos.indexOf('2026-11-25');
    const virada = isos.indexOf('2026-11-30');
    const instantes = [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 0.99];
    // 25 – 26/11 → 30/11 – 1/12: os dias contam 25, 26… 30 (e 26, 27… 1, pelas datas); os meses ficam apagados, com a
    // vaga do mês da esquerda como estava (fechada)
    const indo = instantes.map((p) => periodoNaContagem(isos, hoje, virada, p));
    expect(indo[0]).toEqual({ dia1: 25, mes1: '', dia2: 26, mes2: '/11', mesesApagados: true });
    expect(indo.every((q) => q.mesesApagados && q.mes1 === '' && q.mes2 === '/11')).toBe(true);
    expect([...new Set(indo.map((q) => `${q.dia1}-${q.dia2}`))]).toEqual(['25-26', '27-28', '29-30', '30-1']);
    expect(periodoNaContagem(isos, hoje, virada, 1)).toEqual({ dia1: 30, mes1: '/11', dia2: 1, mes2: '/12', mesesApagados: false });
    // de volta: a vaga do "/11" da esquerda fica aberta durante a contagem e só fecha no fim
    const voltando = instantes.map((p) => periodoNaContagem(isos, virada, hoje, p));
    expect(voltando.every((q) => q.mesesApagados && q.mes1 === '/11' && q.mes2 === '/12')).toBe(true);
    expect(voltando.map((q) => q.dia1)).toEqual([...voltando.map((q) => q.dia1)].sort((a, b) => b - a));
    expect(periodoNaContagem(isos, virada, hoje, 1)).toEqual({ dia1: 25, mes1: '', dia2: 26, mes2: '/11', mesesApagados: false });
  });

  it('o período na virada do mês: os dias esperam parados até os meses terminarem de apagar, e só então contam', async () => {
    const { montarFaixa, periodoNaContagem, duracaoDoPeriodo, MESES_APAGAM_MS } = await import('../src/ui/fila');
    const isos = montarFaixa([], {}, agora).dias.map((d) => d.iso);
    const hoje = isos.indexOf('2026-11-25');
    const virada = isos.indexOf('2026-11-30');
    for (const [de, para, partida] of [[hoje, virada, '25-26'], [virada, hoje, '30-1']] as const) {
      const total = duracaoDoPeriodo(isos, de, para);
      // enquanto algum mês ainda está à vista (mesmo apagando), os dias são os de partida
      for (let ms = 0; ms <= MESES_APAGAM_MS; ms += 5) {
        const q = periodoNaContagem(isos, de, para, ms / total);
        expect(`${q.dia1}-${q.dia2}`).toBe(partida);
        expect(q.mesesApagados).toBe(true);
      }
      // depois, os dias contam até a chegada com os meses ainda apagados
      const contando = periodoNaContagem(isos, de, para, (MESES_APAGAM_MS + 60) / total);
      expect(`${contando.dia1}-${contando.dia2}`).not.toBe(partida);
      expect(contando.mesesApagados).toBe(true);
    }
    // sem virada, os dias contam desde o começo, no tempo de sempre
    expect(duracaoDoPeriodo(isos, hoje, hoje + 3)).toBeLessThan(duracaoDoPeriodo(isos, hoje, virada));
  });

  it('o período contando sem virada: os meses ficam à vista o tempo todo', async () => {
    const { montarFaixa, periodoNaContagem } = await import('../src/ui/fila');
    const isos = montarFaixa([], {}, agora).dias.map((d) => d.iso);
    const hoje = isos.indexOf('2026-11-25');
    for (const p of [0, 0.3, 0.6, 1]) expect(periodoNaContagem(isos, hoje, hoje + 3, p)).toMatchObject({ mes1: '', mes2: '/11', mesesApagados: false });
    expect(periodoNaContagem(isos, hoje, hoje + 3, 0.1)).toMatchObject({ dia1: 26, dia2: 27 }); // 25 + 3 × 0,34 ≈ 26
  });

  it('o resumo conta só os dois dias à vista: os cards, os entregues e os que estão na lista de prioridade', async () => {
    const { montarFaixa, resumoDosDias } = await import('../src/ui/fila');
    const pronto: Andamento = { status: ['FINALIZADO'], designers: [], entregue: true, entrega: null };
    const prio: Andamento = { status: ['PRODUZINDO'], designers: [], entregue: false, entrega: null, prioridade: true };
    const lista = [enviado('a', '2026-11-25'), enviado('b', '2026-11-25'), enviado('c', '2026-11-26'), enviado('d', '2026-11-27'), enviado('vt', '')];
    const f = montarFaixa(lista, { a: pronto, c: prio, d: prio }, agora);
    expect(resumoDosDias(f.dias.slice(f.hoje, f.hoje + 2))).toEqual({ total: 3, entregues: 1, aEntregar: 0, comPrioridade: 1 });
    expect(resumoDosDias(f.dias.slice(0, 2))).toEqual({ total: 0, entregues: 0, aEntregar: 0, comPrioridade: 0 });
  });
});


describe('No Trello no computador: a semana que conta', () => {
  const agora = new Date(2026, 10, 25, 15, 0); // qua, 25/11

  it('o período da semana em partes: o mês por extenso, o da esquerda só na virada', async () => {
    const { partesDoPeriodo, mesPorExtenso, montarSemana } = await import('../src/ui/fila');
    expect(partesDoPeriodo('2026-11-24', '2026-11-30', mesPorExtenso)).toEqual({ dia1: 24, mes1: '', dia2: 30, mes2: ' de novembro' });
    expect(partesDoPeriodo('2026-12-29', '2027-01-04', mesPorExtenso)).toEqual({ dia1: 29, mes1: ' de dezembro', dia2: 4, mes2: ' de janeiro' });
    // o período escrito da semana sai das mesmas partes
    expect(montarSemana([], {}, agora).periodo).toBe('24 – 30 de novembro');
    expect(montarSemana([], {}, agora, 1).periodo).toBe('1 – 7 de dezembro');
    expect(montarSemana([], {}, agora, 5).periodo).toBe('29 de dezembro – 4 de janeiro');
  });

  it('a semana no eixo: a posição é o primeiro dia contado de hoje, e o período tem sete dias', async () => {
    const { eixoDaSemana, inicioDaSemana, periodoNaContagem } = await import('../src/ui/fila');
    const eixo = eixoDaSemana(agora);
    expect([inicioDaSemana(0), inicioDaSemana(1), inicioDaSemana(-1)]).toEqual([-1, 6, -8]);
    expect(eixo.dia(inicioDaSemana(0))).toBe('2026-11-24');
    expect(periodoNaContagem(eixo, inicioDaSemana(0), inicioDaSemana(0), 1)).toEqual({ dia1: 24, mes1: '', dia2: 30, mes2: ' de novembro', mesesApagados: false });
  });

  it('trocar de semana na virada do mês: os meses apagam primeiro, os dias contam pelas datas e o mês errado nunca aparece', async () => {
    const { eixoDaSemana, inicioDaSemana, periodoNaContagem, posicaoNaContagem, duracaoDoPeriodo, MESES_APAGAM_MS } = await import('../src/ui/fila');
    const eixo = eixoDaSemana(agora);
    const [de, para] = [inicioDaSemana(0), inicioDaSemana(1)]; // 24 – 30 de novembro → 1 – 7 de dezembro
    const total = duracaoDoPeriodo(eixo, de, para);
    expect(total).toBe(MESES_APAGAM_MS + 340);
    const quadros = Array.from({ length: 41 }, (_, i) => periodoNaContagem(eixo, de, para, i / 40));
    // enquanto conta, os meses ficam apagados, com o "de novembro" da partida guardando a vaga
    expect(quadros.slice(0, -1).every((q) => q.mesesApagados && q.mes1 === '' && q.mes2 === ' de novembro')).toBe(true);
    // os dias ficam parados enquanto os meses apagam
    for (let ms = 0; ms <= MESES_APAGAM_MS; ms += 10) expect(posicaoNaContagem(eixo, de, para, ms / total)).toBe(de);
    // e depois passam pelas datas, sempre para a frente: 24, 25… 30, 1
    const primeiros = [...new Set(quadros.map((q) => q.dia1))];
    expect(primeiros[0]).toBe(24);
    expect(primeiros[primeiros.length - 1]).toBe(1);
    expect(quadros[40]).toEqual({ dia1: 1, mes1: '', dia2: 7, mes2: ' de dezembro', mesesApagados: false });
    // de volta para trás, a mesma coisa ao contrário
    const voltando = Array.from({ length: 41 }, (_, i) => posicaoNaContagem(eixo, para, de, i / 40));
    expect(voltando).toEqual([...voltando].sort((a, b) => b - a));
    expect(periodoNaContagem(eixo, para, de, 1)).toMatchObject({ dia1: 24, dia2: 30, mes2: ' de novembro', mesesApagados: false });
  });

  it('voltar para hoje de longe: conta todas as datas do caminho, no mesmo tempo', async () => {
    const { eixoDaSemana, inicioDaSemana, posicaoNaContagem, duracaoDoPeriodo } = await import('../src/ui/fila');
    const eixo = eixoDaSemana(agora);
    const [de, para] = [inicioDaSemana(3), inicioDaSemana(0)];
    expect(duracaoDoPeriodo(eixo, de, para)).toBe(80 + 340); // 15 – 21 de dezembro → novembro: há virada
    expect(posicaoNaContagem(eixo, de, para, 0)).toBe(de);
    expect(posicaoNaContagem(eixo, de, para, 1)).toBe(para);
    // sem virada, conta desde o primeiro instante
    expect(posicaoNaContagem(eixo, inicioDaSemana(2), inicioDaSemana(3), 0.1)).toBeGreaterThan(inicioDaSemana(2));
  });
});

describe('No Trello: o critério da agenda (exibição, entrada ou entrega)', () => {
  const agora = new Date(2026, 10, 25, 15, 0); // qua, 25/11
  const enviado = (id: string, data: string, em = '2026-11-20T12:00:00Z', estado: 'enviado' | 'duplicado' = 'enviado'): Resumo => ({
    ...resumo(id, data),
    meta: { ...metaVazia(), dataExibicao: data, claquete: id.toUpperCase() },
    trello: { estado, url: 'https://trello.com/c/x', em },
  });
  const anda = (o: Partial<Andamento> = {}): Andamento => ({ status: ['PRODUZINDO'], designers: [], entregue: false, entrega: null, ...o });
  const saiu = (entrega: string, o: Partial<Andamento> = {}) => anda({ status: ['FINALIZADO'], entregue: true, entrega, ...o });
  const ids = (cards: { r: Resumo }[]) => cards.map((c) => c.r.id);
  const porDia = (dias: { cards: { r: Resumo }[] }[]) => dias.map((d) => ids(d.cards));

  it('o dia do card em cada critério: a exibição, a entrada na produção ou a entrega', async () => {
    const { montarSemana, diaDe } = await import('../src/ui/fila');
    const andamento = { a: saiu('2026-11-24T22:05:00Z', { entrada: '2026-11-23T21:59:00Z' }) };
    const [c] = montarSemana([enviado('a', '2026-11-29')], andamento, agora).dias[5].cards;
    expect(c.r.id).toBe('a');
    expect([diaDe(c, 'exibicao'), diaDe(c, 'entrada'), diaDe(c, 'entrega')]).toEqual(['2026-11-29', '2026-11-23', '2026-11-24']);
  });

  it('por entrega, o card que ainda não saiu fica no dia da exibição, como um prazo; o que saiu fica no dia em que saiu', async () => {
    const { montarSemana, diaDe } = await import('../src/ui/fila');
    const lista = [enviado('falta', '2026-11-27'), enviado('pronto', '2026-11-27'), enviado('caiu', '2026-11-28'), enviado('vt', '')];
    const andamento = { falta: anda(), pronto: saiu('2026-11-25T10:12:00Z'), caiu: anda({ status: ['CAIU'] }), vt: anda() };
    const s = montarSemana(lista, andamento, agora, 0, 'entrega');
    expect(porDia(s.dias)).toEqual([[], ['pronto'], [], ['falta'], ['caiu'], [], []]);
    const cards = Object.fromEntries([...s.dias.flatMap((d) => d.cards), ...s.semData].map((c) => [c.r.id, c]));
    // só o que ainda tem prazo fica "a entregar" (o que caiu, não)
    expect(Object.fromEntries(Object.entries(cards).map(([k, c]) => [k, c.aEntregar]))).toEqual({ pronto: false, falta: true, caiu: false, vt: true });
    // o que não saiu e não tem exibição fica no "sem data"
    expect(ids(s.semData)).toEqual(['vt']);
    expect(diaDe(cards.vt, 'entrega')).toBe('');
    // nos outros critérios, ninguém está "a entregar"
    expect(montarSemana(lista, andamento, agora).dias.flatMap((d) => d.cards).some((c) => c.aEntregar)).toBe(false);
  });

  it('o resumo de cada critério: por entrega, os entregues e os que faltam entregar', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const lista = [enviado('a', '2026-11-27'), enviado('b', '2026-11-27'), enviado('c', '2026-11-26')];
    const andamento = { a: anda(), b: saiu('2026-11-25T10:00:00Z'), c: saiu('2026-11-24T18:30:00Z', { prioridade: true }) };
    const s = montarSemana(lista, andamento, agora, 0, 'entrega');
    expect([s.total, s.entregues, s.aEntregar, s.comPrioridade]).toEqual([3, 2, 1, 1]);
    expect(montarSemana(lista, andamento, agora).aEntregar).toBe(0);
  });

  it('a entrada é a da produção; sem ela, vale a hora do envio, menos no card que já estava lá (duplicado): esse fica sem data', async () => {
    const { montarSemana, diaDe } = await import('../src/ui/fila');
    const lista = [enviado('producao', '2026-11-29', '2026-11-25T09:00:00Z'), enviado('envio', '2026-11-29', '2026-11-24T10:20:00Z'), enviado('dup', '2026-11-29', '2026-11-25T09:00:00Z', 'duplicado'), enviado('dup-com', '2026-11-29', '2026-11-25T09:00:00Z', 'duplicado')];
    const andamento = { producao: anda({ entrada: '2026-11-21T11:00:00Z' }), 'dup-com': anda({ entrada: '2026-11-22T14:00:00Z' }) };
    const s = montarSemana(lista, andamento, agora, 0, 'entrada');
    const todos = Object.fromEntries([...s.dias.flatMap((d) => d.cards), ...s.semData].map((c) => [c.r.id, diaDe(c, 'entrada')]));
    expect(todos).toEqual({ producao: '2026-11-21', envio: '2026-11-24', dup: '', 'dup-com': '2026-11-22' });
    expect(ids(s.semData)).toEqual(['dup']);
  });

  it('por entrada, a semana termina hoje (ninguém entra amanhã); as setas andam de sete em sete a partir dela', async () => {
    const { montarSemana, inicioDaSemana } = await import('../src/ui/fila');
    const s = montarSemana([], {}, agora, 0, 'entrada');
    expect(s.dias.map((d) => d.iso)).toEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']);
    expect(s.dias.map((d) => d.marca)).toEqual(['', '', '', '', '', 'ontem', 'hoje']);
    expect(s.periodo).toBe('19 – 25 de novembro');
    expect(montarSemana([], {}, agora, 1, 'entrada').periodo).toBe('26 de novembro – 2 de dezembro');
    expect([inicioDaSemana(0, 'entrada'), inicioDaSemana(-1, 'entrada'), inicioDaSemana(0, 'entrega'), inicioDaSemana(0, 'exibicao')]).toEqual([-6, -13, -1, -1]);
  });

  it('por entrada, dentro do dia os cards vêm na ordem em que entraram; o que caiu desce para o fim', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const lista = [enviado('b', '2026-11-29'), enviado('a', '2026-11-29'), enviado('c', '2026-11-30'), enviado('caiu', '2026-11-30')];
    const andamento = { a: anda({ entrada: '2026-11-24T21:59:00Z' }), b: anda({ entrada: '2026-11-24T10:20:00Z' }), c: anda({ entrada: '2026-11-24T22:30:00Z' }), caiu: anda({ status: ['CAIU'], entrada: '2026-11-24T08:00:00Z' }) };
    expect(montarSemana(lista, andamento, agora, 0, 'entrada').dias[5].cards.map((c) => c.r.id)).toEqual(['b', 'a', 'c', 'caiu']);
  });

  it('os dias anteriores começam antes da semana de agora de cada critério', async () => {
    const { montarSemana } = await import('../src/ui/fila');
    const lista = [enviado('a', '2026-11-29'), enviado('b', '2026-11-29')];
    const andamento = { a: anda({ entrada: '2026-11-18T10:00:00Z' }), b: anda({ entrada: '2026-11-20T10:00:00Z' }) };
    expect(montarSemana(lista, andamento, agora, 0, 'entrada').anteriores.map((d) => [d.iso, ids(d.cards)])).toEqual([['2026-11-18', ['a']]]);
  });

  it('no celular, a faixa tem os mesmos 35 dias; por entrada, abre em ontem e hoje, e os cards caem no dia em que entraram', async () => {
    const { montarFaixa } = await import('../src/ui/fila');
    const lista = [enviado('a', '2026-11-29'), enviado('b', '2026-12-01')];
    const andamento = { a: anda({ entrada: '2026-11-24T21:59:00Z' }), b: anda({ entrada: '2026-11-25T12:30:00Z' }) };
    const f = montarFaixa(lista, andamento, agora, 'entrada');
    expect([f.dias[0].iso, f.dias[34].iso, f.dias[f.hoje].iso]).toEqual(['2026-11-10', '2026-12-14', '2026-11-25']);
    expect(f.dias.slice(f.abre, f.abre + 2).map((d) => d.iso)).toEqual(['2026-11-24', '2026-11-25']);
    expect(f.dias.flatMap((d) => d.cards.map((c) => [d.iso, c.r.id]))).toEqual([['2026-11-24', 'a'], ['2026-11-25', 'b']]);
    // nos outros critérios, abre em hoje e amanhã, como sempre
    expect([montarFaixa(lista, andamento, agora).abre, montarFaixa(lista, andamento, agora, 'entrega').abre]).toEqual([f.hoje, f.hoje]);
  });
});

describe('No Trello: a outra data no pé do card', () => {
  const agora = new Date(2026, 10, 25, 15, 0); // qua, 25/11
  const card = (exibicao: string, a: Partial<Andamento> = {}) => {
    const r: Resumo = { ...resumo('x', exibicao), trello: { estado: 'enviado', url: 'https://trello.com/c/x', em: '2026-11-24T21:59:00Z' } };
    return { r, andamento: { status: [], designers: [], entregue: false, entrega: null, ...a }, entrada: '2026-11-24T21:59:00Z' };
  };

  it('por exibição, quando entrou; por entrada, a hora e quando vai ao ar', async () => {
    const { peDoCard } = await import('../src/ui/fila');
    expect(peDoCard(card('2026-11-29'), 'exibicao', agora)).toEqual({ hora: '', rotulo: 'entrou', dia: 'ontem', depoisDoAr: false });
    expect(peDoCard(card('2026-11-29'), 'entrada', agora)).toEqual({ hora: '21h59', rotulo: 'ao ar', dia: 'dom 29', depoisDoAr: false });
    expect(peDoCard(card(''), 'entrada', agora)).toEqual({ hora: '21h59', rotulo: 'sem exibição', dia: '', depoisDoAr: false });
    expect(peDoCard({ ...card('2026-11-29'), entrada: '' }, 'exibicao', agora)).toBeNull();
  });

  it('por entrega, o que saiu: a hora e quando vai ao ar, com "depois do ar" quando saiu tarde; o que não saiu, quando entrou', async () => {
    const { peDoCard } = await import('../src/ui/fila');
    expect(peDoCard(card('2026-12-01', { entrega: '2026-11-24T22:09:00Z' }), 'entrega', agora)).toEqual({ hora: '22h09', rotulo: 'ao ar', dia: 'ter 1', depoisDoAr: false });
    expect(peDoCard(card('2026-11-23', { entrega: '2026-11-24T09:30:00Z' }), 'entrega', agora)).toEqual({ hora: '9h30', rotulo: 'ao ar', dia: 'seg 23', depoisDoAr: true });
    expect(peDoCard(card('2026-11-26'), 'entrega', agora)).toEqual({ hora: '', rotulo: 'entrou', dia: 'ontem', depoisDoAr: false });
  });
});

describe('No Trello: onde a claquete do card quebra', () => {
  it('antes de "(", depois de ")" e antes da data; nunca no meio da palavra nem da data', async () => {
    const { pedacosDaClaquete } = await import('../src/ui/pecas');
    expect(pedacosDaClaquete('FANT(INTERPOL)29-11')).toEqual(['FANT', '(INTERPOL)', '29-11']);
    expect(pedacosDaClaquete('AMA(PROLOGO)25-11')).toEqual(['AMA', '(PROLOGO)', '25-11']);
    expect(pedacosDaClaquete('25-11-2')).toEqual(['25-11-2']);
    expect(pedacosDaClaquete('CHAMADA_AUDITORIO_25/11')).toEqual(['CHAMADA_', 'AUDITORIO_', '25/11']);
    expect(pedacosDaClaquete('ELIANA29-11')).toEqual(['ELIANA', '29-11']);
  });
});

describe('o próximo para revisar (proximoParaRevisar)', () => {
  const agora = new Date(2026, 10, 19, 15, 0); // qui, 19/11
  const EU = 'bia@exemplo.com';
  const comRevisor = (r: Resumo, email: string): Resumo => ({ ...r, revisadoPor: { nome: 'Caio Prado', email } });
  // a fila de hoje: 1, 2 e 3 pedem revisão, na ordem
  const fila = [resumo('r1', '2026-11-19', ['Sem editor'], '2026-11-19T12:00:00Z'), resumo('r2', '2026-11-19', ['Sem editor'], '2026-11-19T11:00:00Z'), resumo('r3', '2026-11-20', ['Sem editor'])];
  const proximo = (lista: Resumo[], presenca: Record<string, { nome: string; email: string }[]> = {}, atual = 'r1') =>
    proximoParaRevisar(lista, { email: EU, roteiro: atual }, presenca, agora)?.id;

  it('pula o roteiro atual e segue a ordem da fila', () => {
    expect(proximo(fila)).toBe('r2');
    expect(proximo(fila, {}, 'r2')).toBe('r1');
  });

  it('pula o roteiro aberto agora por outra pessoa', () => {
    expect(proximo(fila, { r2: [{ nome: 'Ana Lima', email: 'ana@exemplo.com' }] })).toBe('r3');
  });

  it('o roteiro aberto só por mim (outra aba) não conta como ocupado', () => {
    expect(proximo(fila, { r2: [{ nome: 'Bia Souza', email: 'Bia@Exemplo.com' }] })).toBe('r2');
  });

  it('pula o roteiro que alguém já revisou, eu inclusive', () => {
    expect(proximo([fila[0], comRevisor(fila[1], 'ana@exemplo.com'), fila[2]])).toBe('r3');
    expect(proximo([fila[0], comRevisor(fila[1], EU), fila[2]])).toBe('r3');
  });

  it('pula o que não pede revisão, o que já está no Trello e o que já foi ao ar', () => {
    const lista = [
      fila[0],
      resumo('pronto', '2026-11-19'),
      { ...resumo('enviado', '2026-11-19', ['Sem editor']), trello: { estado: 'enviado' as const, em: '2026-11-19T10:00:00Z' } },
      resumo('ontem', '2026-11-18', ['Sem editor']),
      fila[2],
    ];
    expect(proximo(lista)).toBe('r3');
  });

  it('ninguém sobrando: não há próximo', () => {
    expect(proximo(fila, { r2: [{ nome: 'Ana Lima', email: 'ana@exemplo.com' }], r3: [{ nome: 'Caio Prado', email: 'caio@exemplo.com' }] })).toBeUndefined();
    expect(proximo([fila[0]])).toBeUndefined();
  });
});

describe('No Trello: o filtro das prioridades', () => {
  const agora = new Date(2026, 10, 24, 15, 0); // ter, 24/11
  const enviado = (id: string, data: string): Resumo => ({
    ...resumo(id, data),
    meta: { ...metaVazia(), dataExibicao: data, claquete: id.toUpperCase() },
    trello: { estado: 'enviado', url: 'https://trello.com/c/x', em: '2026-11-20T12:00:00Z' },
  });
  const prio: Andamento = { status: ['PRODUZINDO'], designers: [], entregue: false, entrega: null, prioridade: true };
  const comum: Andamento = { status: ['PRODUZINDO'], designers: [], entregue: false, entrega: null };
  const lista = [enviado('a', '2026-11-24'), enviado('b', '2026-11-24'), enviado('c', '2026-11-26'), enviado('d', '2026-11-27'), enviado('vt1', ''), enviado('vt2', ''), enviado('velho1', '2026-11-20'), enviado('velho2', '2026-11-18')];
  const andamento = { a: prio, b: comum, c: comum, d: prio, vt1: prio, vt2: comum, velho1: prio, velho2: comum };
  const ids = (cs: { r: Resumo }[]) => cs.map((c) => c.r.id);

  it('na semana, só os cards com o grifo de prioridade ficam, cada um no seu dia; o dia sem nenhuma fica vazio', async () => {
    const { montarSemana, soAsPrioridades } = await import('../src/ui/fila');
    const s = soAsPrioridades(montarSemana(lista, andamento, agora));
    expect(s.dias.map((d) => ids(d.cards))).toEqual([[], ['a'], [], [], ['d'], [], []]);
    expect(s.dias.map((d) => d.iso)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
  });

  it('o sem data e os dias anteriores também ficam só com as prioridades; o dia anterior sem nenhuma sai da lista', async () => {
    const { montarSemana, soAsPrioridades } = await import('../src/ui/fila');
    const s = soAsPrioridades(montarSemana(lista, andamento, agora));
    expect(ids(s.semData)).toEqual(['vt1']);
    expect(s.anteriores.map((d) => [d.titulo, ids(d.cards)])).toEqual([['sexta, 20 de novembro', ['velho1']]]);
  });

  it('na faixa do celular, vale o mesmo, e a faixa continua com os mesmos dias e no mesmo lugar', async () => {
    const { montarFaixa, soAsPrioridades } = await import('../src/ui/fila');
    const f = montarFaixa(lista, andamento, agora);
    const so = soAsPrioridades(f);
    expect(so.dias.map((d) => d.iso)).toEqual(f.dias.map((d) => d.iso));
    expect([so.hoje, so.abre]).toEqual([f.hoje, f.abre]);
    expect(so.dias.flatMap((d) => ids(d.cards))).toEqual(['velho1', 'a', 'd']);
  });

  it('em qualquer critério, a prioridade é a do card, onde quer que ele caia', async () => {
    const { montarSemana, soAsPrioridades } = await import('../src/ui/fila');
    const entrou = (dia: string, a: Andamento): Andamento => ({ ...a, entrada: `${dia}T12:00:00Z` });
    const and = { a: entrou('2026-11-23', prio), b: entrou('2026-11-23', comum), d: entrou('2026-11-24', prio) };
    const s = soAsPrioridades(montarSemana(lista, and, agora, 0, 'entrada'));
    expect(s.dias.flatMap((d) => ids(d.cards))).toEqual(['a', 'd']);
  });

  it('o resto da agenda (o período, o resumo) não muda: o filtro só escolhe os cards à vista', async () => {
    const { montarSemana, soAsPrioridades } = await import('../src/ui/fila');
    const s = montarSemana(lista, andamento, agora);
    const so = soAsPrioridades(s);
    expect([so.periodo, so.total, so.entregues, so.comPrioridade]).toEqual([s.periodo, s.total, s.entregues, s.comPrioridade]);
  });
});
