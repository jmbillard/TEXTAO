import { describe, expect, it } from 'vitest';
import { agruparPorDia, pendentes } from '../src/ui/fila';
import { herdarTipos } from '../src/modelo/versoes';
import { dataDaClaquete, pracaDaClaquete } from '../src/modelo/vocabularios';
import { exportar, pendencias, pendenciasDetalhadas } from '../src/modelo/exportar';
import { metaVazia, type Meta, type NoJSON } from '../src/modelo/tipos';
import type { Resumo } from '../src/dados/armazenamento';

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

describe('acervo: a que já existe é marcada; quem revisa exclui da lista', () => {
  it('conta as artes do roteiro que estão no acervo da atração', async () => {
    const { artesQueJaExistem } = await import('../src/modelo/exportar');
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: ['HOJE', 'AMANHÃ', 'SÁBADO'].flatMap((t, i) => [{ type: 'text', text: t, marks: [{ type: 'arte', attrs: { id: 'a' + i } }] }, { type: 'text', text: ' ' }]) }] };
    const s = (meta: Partial<Meta>) => exportar({ id: 'x', meta: { ...metaVazia(), ...meta }, doc, revisao: 1, criadoEm: '', atualizadoEm: '' } as never);
    const jaExistem = [{ arte: 'HOJE', chave: 'HOJE', tipo: '', claquete: 'C' }, { arte: 'Amanhã', chave: 'AMANHA', tipo: '', claquete: 'C' }];
    expect(artesQueJaExistem(s({ jaExistem }))).toEqual(['HOJE', 'AMANHA']);
    expect(pendencias(s({ jaExistem }))).toContain('Já existem: 2');
  });
});
