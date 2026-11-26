import { describe, expect, it } from 'vitest';
import { etapaDaProducao } from '../src/modelo/producao.ts';

/* A etapa da Produção (#86) a partir do que a produção da arte do Teable diz, sem o Trello: arquivada vence tudo,
   entregue (ou FINALIZADO) vem depois, designer ou status de trabalho é Produzindo e o resto é Entrada. O status
   detalhado vira o marcador, só dentro de Produzindo. */

const linha = (o: Partial<Parameters<typeof etapaDaProducao>[0]> = {}) => ({ arquivado: false, entregue: false, status: [] as string[], designers: [] as string[], ...o });

describe('a etapa da Produção', () => {
  it('sem designer e sem status (ou só ENTRADA) é Entrada', () => {
    expect(etapaDaProducao(linha())).toEqual({ etapa: 'entrada', marcador: '' });
    expect(etapaDaProducao(linha({ status: ['ENTRADA'] }))).toEqual({ etapa: 'entrada', marcador: '' });
  });

  it('com designer, ou com status de trabalho, é Produzindo', () => {
    expect(etapaDaProducao(linha({ designers: ['Designer Um'] }))).toEqual({ etapa: 'produzindo', marcador: '' });
    expect(etapaDaProducao(linha({ status: ['PRODUZINDO'] }))).toEqual({ etapa: 'produzindo', marcador: '' });
  });

  it('o status detalhado vira o marcador de Produzindo, por extenso', () => {
    expect(etapaDaProducao(linha({ status: ['AGUARDANDO MATERIAL'] }))).toEqual({ etapa: 'produzindo', marcador: 'Aguardando material' });
    expect(etapaDaProducao(linha({ status: ['PRODUZINDO', 'em aprovacao'], designers: ['Designer Um'] }))).toEqual({ etapa: 'produzindo', marcador: 'Em aprovação' });
    expect(etapaDaProducao(linha({ status: ['EM APROVAÇÃO', 'PEDIDO DE ALTERAÇÃO'] }))).toEqual({ etapa: 'produzindo', marcador: 'Em aprovação, Pedido de alteração' });
  });

  it('entregue ou FINALIZADO é Entregue, mesmo com designer (e sem marcador)', () => {
    expect(etapaDaProducao(linha({ entregue: true, designers: ['Designer Um'], status: ['PRODUZINDO'] }))).toEqual({ etapa: 'entregue', marcador: '' });
    expect(etapaDaProducao(linha({ status: ['Finalizado', 'EM APROVAÇÃO'] }))).toEqual({ etapa: 'entregue', marcador: '' });
  });

  it('arquivada vence tudo', () => {
    expect(etapaDaProducao(linha({ arquivado: true, entregue: true }))).toEqual({ etapa: 'arquivada', marcador: '' });
    expect(etapaDaProducao(linha({ arquivado: true, status: ['AGUARDANDO MATERIAL'], designers: ['Designer Um'] }))).toEqual({ etapa: 'arquivada', marcador: '' });
  });

  it('a etiqueta FILME não é status de trabalho', () => {
    expect(etapaDaProducao(linha({ status: ['FILME'] }))).toEqual({ etapa: 'entrada', marcador: '' });
  });
});
