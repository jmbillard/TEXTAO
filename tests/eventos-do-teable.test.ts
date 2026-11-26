import { describe, expect, it } from 'vitest';
import { eventosDaReleitura, type EstadoGuardado, type LinhaRelida } from '../src/modelo/eventosDoTeable.ts';
import { PRACAS_DE_FABRICA } from '../src/modelo/pracas.ts';

/* Os eventos da Produção que nascem da produção da arte do Teable (a fonte oficial: o PROMeiro só escreve no Trello).
   A cada releitura, a linha relida é comparada com a Produção guardada, e o que mudou vira evento: a etapa (pela regra
   da etapa), o designer que entrou ou saiu, a praça, a prioridade e a complexidade. Linha nova vira "criada". Cada
   evento tem uma chave estável (registro + tipo + campo + valor + quando): a mesma releitura duas vezes não duplica.
   Nomes e registros fictícios. */

const QUANDO = '2026-11-26T13:05:00.000Z';
const AGORA = '2026-11-26T13:06:00.000Z';
const linha = (o: Partial<LinhaRelida> = {}): LinhaRelida => ({
  registro: 'recUm',
  card: 'c0ffee000000000000000001',
  claquete: 'Show da Noite 20/11 SP',
  praca: '',
  status: [],
  designers: [],
  entregue: false,
  arquivado: false,
  entrada: '2026-11-26T12:00:00.000Z',
  entrega: null,
  artes: ['HOJE'],
  artesQuantidade: 1,
  filme: null,
  prioridade: '',
  complexidade: '',
  modificadoEm: QUANDO,
  ...o,
});
const guardado = (o: Partial<EstadoGuardado> = {}): EstadoGuardado => ({ etapa: 'entrada', designers: [], praca: 'SP', prioridade: '', complexidade: '', ...o });
const reler = (antes: EstadoGuardado | null, l: LinhaRelida) => eventosDaReleitura(antes, l, { pracas: PRACAS_DE_FABRICA, agora: AGORA });
const resumo = (evs: ReturnType<typeof reler>) => evs.map((e) => [e.tipo, e.campo ?? '', e.antes, e.depois]);

describe('os eventos da releitura da produção da arte', () => {
  it('nada mudou: nenhum evento', () => {
    expect(reler(guardado(), linha())).toEqual([]);
  });

  it('a linha nova vira "criada", na etapa dela, quando entrou', () => {
    const [e, ...resto] = reler(null, linha({ designers: ['Designer Um'] }));
    expect(resto).toEqual([]);
    expect(e).toMatchObject({ tipo: 'criada', antes: null, depois: 'produzindo', quando: '2026-11-26T12:00:00.000Z' });
  });

  it('a linha nova sem data de entrada: "criada" quando o Teable mudou', () => {
    expect(reler(null, linha({ entrada: null }))[0]).toMatchObject({ tipo: 'criada', quando: QUANDO });
  });

  it('a etapa mudou pela regra da etapa: designer ou status → Produzindo; entregue → Entregue', () => {
    expect(resumo(reler(guardado(), linha({ status: ['PRODUZINDO'] })))).toEqual([['etapa', '', 'entrada', 'produzindo']]);
    expect(resumo(reler(guardado({ etapa: 'produzindo' }), linha({ entregue: true })))).toEqual([['etapa', '', 'produzindo', 'entregue']]);
    expect(resumo(reler(guardado({ etapa: 'entregue' }), linha({ status: ['PEDIDO DE ALTERAÇÃO'] })))).toEqual([['etapa', '', 'entregue', 'produzindo']]);
  });

  it('arquivada e desarquivada', () => {
    expect(resumo(reler(guardado({ etapa: 'produzindo', designers: ['Designer Um'] }), linha({ arquivado: true, designers: ['Designer Um'] })))).toEqual([['arquivada', '', 'produzindo', 'arquivada']]);
    expect(resumo(reler(guardado({ etapa: 'arquivada' }), linha()))).toEqual([['desarquivada', '', 'arquivada', 'entrada']]);
  });

  it('o designer que entrou e o que saiu (sem caixa nem acento); a etapa que mudou junto vem antes', () => {
    const evs = reler(guardado({ etapa: 'produzindo', designers: ['Designer Um', 'JOÃO NEVES'] }), linha({ designers: ['joao neves', 'Designer Dois'] }));
    expect(resumo(evs)).toEqual([
      ['designer-entrou', '', null, 'Designer Dois'],
      ['designer-saiu', '', 'Designer Um', null],
    ]);
    expect(resumo(reler(guardado(), linha({ designers: ['Designer Um'] })))).toEqual([
      ['etapa', '', 'entrada', 'produzindo'],
      ['designer-entrou', '', null, 'Designer Um'],
    ]);
  });

  it('a praça: a da coluna (pela sigla) ou, sem ela, a da claquete', () => {
    expect(resumo(reler(guardado({ praca: 'SP' }), linha({ praca: 'REDE' })))).toEqual([['campo', 'praca', 'SP', 'G5']]);
    expect(resumo(reler(guardado({ praca: 'G5' }), linha({ praca: '' })))).toEqual([['campo', 'praca', 'G5', 'SP']]);
  });

  it('a prioridade e a complexidade (o nível pelo nome); vazio é null', () => {
    expect(resumo(reler(guardado(), linha({ prioridade: 'ALTA', complexidade: '3' })))).toEqual([
      ['campo', 'prioridade', null, 'ALTA'],
      ['campo', 'complexidade', null, 'ALTA'],
    ]);
    expect(resumo(reler(guardado({ prioridade: 'ALTA', complexidade: '1' }), linha({ prioridade: '', complexidade: '2' })))).toEqual([
      ['campo', 'prioridade', 'ALTA', null],
      ['campo', 'complexidade', 'BAIXA', 'MÉDIA'],
    ]);
    // a mesma, escrita de outro jeito, não é mudança
    expect(reler(guardado({ prioridade: 'alta', complexidade: 'MÉDIA' }), linha({ prioridade: 'ALTA', complexidade: '2' }))).toEqual([]);
  });

  it('a prioridade e a complexidade que a Produção ainda não guardava (null) não viram evento', () => {
    expect(reler(guardado({ prioridade: null, complexidade: null }), linha({ prioridade: 'ALTA', complexidade: '3' }))).toEqual([]);
  });

  it('quando: a modificação da linha no Teable; sem ela, agora; quem fica vazio', () => {
    const [e] = reler(guardado(), linha({ status: ['PRODUZINDO'] }));
    expect(e.quando).toBe(QUANDO);
    expect(e.quem).toBeNull();
    expect(reler(guardado(), linha({ status: ['PRODUZINDO'], modificadoEm: null }))[0].quando).toBe(AGORA);
  });

  it('a chave é estável (registro + tipo + campo + valor + quando): a mesma releitura dá a mesma chave', () => {
    const a = reler(guardado(), linha({ designers: ['Designer Um'], prioridade: 'ALTA' }));
    const b = reler(guardado(), linha({ designers: ['Designer Um'], prioridade: 'ALTA' }));
    expect(a.map((e) => e.chave)).toEqual(b.map((e) => e.chave));
    expect(new Set(a.map((e) => e.chave)).size).toBe(a.length);
    expect(a[1].chave).toBe(`teable:recUm:designer-entrou::Designer Um:${QUANDO}`);
    // outra modificação, outra chave
    expect(reler(guardado(), linha({ designers: ['Designer Um'], modificadoEm: '2026-11-26T14:00:00.000Z' }))[1].chave).not.toBe(a[1].chave);
  });
});
