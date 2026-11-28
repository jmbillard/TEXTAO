import { describe, expect, it } from 'vitest';
import { colunasDoDia, contaDoEditor, cruzarComAProducao, linhaDaPauta, soAsQueCasam, type LinhaDaPauta, type ProducaoNaPauta } from '../src/modelo/pauta';

/* Só as claquetes que casam com uma Produção (#199, ADR 0008): a Pauta mostra a claquete que casa (pela chave do
   cruzamento: exata, sem a versão, sem a praça), a info e o aviso; a tarefa e a claquete sem Produção ficam de fora,
   listadas à parte. A info vai com a claquete de antes: a de uma claquete de fora sai com ela. Nomes inventados. */

let n = 0;
const linha = (texto: string, editor = 'Rita Fontes', dia = '2026-11-27', anotacao: unknown = null): LinhaDaPauta =>
  linhaDaPauta({ id: `r${++n}`, claquete: texto, editor: editor ? { id: `rec${editor}`, title: editor } : null, data: `${dia}T03:00:00.000Z`, expediente_inicio: `${dia}T09:00:00.000Z`, expediente_fim: `${dia}T18:00:00.000Z`, anotacao })!;
const producao = (claquete: string, etapa: ProducaoNaPauta['etapa'] = 'entrada', praca = ''): ProducaoNaPauta => ({ id: `p-${claquete}`, claquete, praca, etapa, artes: null, designers: [], alta: false, entradaEm: '2026-11-20T12:00:00.000Z', entregaEm: null });
const semPraca = (chave: string) => chave.replace(/ (SP|RJ|REDE)$/, '');
const cruzar = (ls: LinhaDaPauta[], ps: ProducaoNaPauta[]) => cruzarComAProducao(ls, ps, semPraca);

describe('só as claquetes que casam com uma Produção', () => {
  it('fica a claquete que casa; a tarefa e a claquete sem Produção vão para "de fora", na ordem', () => {
    const ls = cruzar([linha('Bola Cheia 29/11 (AH)'), linha('COMUNICAÇÃO'), linha('Terra Viva 30/11'), linha('Mundo Animal 28/11')], [producao('Bola Cheia 29/11'), producao('Mundo Animal 28/11')]);
    const r = soAsQueCasam(ls);
    expect(r.linhas.map((l) => l.texto)).toEqual(['Bola Cheia 29/11 (AH)', 'Mundo Animal 28/11']);
    expect(r.deFora.map((d) => [d.tipo, d.texto, d.editor])).toEqual([
      ['tarefa', 'COMUNICAÇÃO', 'Rita Fontes'],
      ['claquete', 'Terra Viva 30/11', 'Rita Fontes'],
    ]);
  });

  it('casa como o cruzamento: sem a versão e sem a praça', () => {
    const ls = cruzar([linha('Bola Cheia 29/11 (AH)'), linha('Show Rede 30/11 SP')], [producao('Bola Cheia 29/11 RJ', 'entrada', 'RJ'), producao('Show Rede 30/11')]);
    expect(soAsQueCasam(ls).linhas).toHaveLength(2);
  });

  it('o aviso e o recado do dia ficam, mesmo sem claquete', () => {
    const ls = cruzar([linha('VEM DE CARRO', 'Rita Fontes', '2026-11-27', true), linha('Reunião às 10h', '', '2026-11-27', true), linha('CALHAUS')], []);
    const r = soAsQueCasam(ls);
    expect(r.linhas.map((l) => [l.tipo, l.texto])).toEqual([
      ['aviso', 'VEM DE CARRO'],
      ['aviso', 'Reunião às 10h'],
    ]);
  });

  it('a info vai com a claquete de antes: a da claquete de fora sai com ela; a do começo e a depois da tarefa ficam na posição', () => {
    const ls = cruzar(
      [linha('REDATOR VAI ACOMPANHAR'), linha('Terra Viva 30/11'), linha('TRANSFORMAR DA A B'), linha('Bola Cheia 29/11'), linha('ENTRA SÁBADO'), linha('CALHAUS'), linha('PROMO VAI INDICAR')],
      [producao('Bola Cheia 29/11')],
    );
    const r = soAsQueCasam(ls);
    expect(r.deFora.find((d) => d.texto === 'Terra Viva 30/11')!.infos).toEqual(['TRANSFORMAR DA A B']);
    const [c] = colunasDoDia(r.linhas);
    expect(c.itens.map((l) => [l.texto, l.infos])).toEqual([['Bola Cheia 29/11', ['ENTRA SÁBADO']]]);
    expect(c.infos).toEqual(['REDATOR VAI ACOMPANHAR', 'PROMO VAI INDICAR']);
  });

  it('a frase partida segue a info de cima, mesmo com cara de tarefa', () => {
    const ls = cruzar([linha('Bola Cheia 29/11'), linha('DEVEMOS EDITAR SEGUNDO A'), linha('PREMIAÇÃO'), linha('Terra Viva 30/11'), linha('DEVEMOS EDITAR SEGUNDO A'), linha('PREMIAÇÃO')], [producao('Bola Cheia 29/11')]);
    const r = soAsQueCasam(ls);
    expect(r.deFora.map((d) => [d.texto, d.infos])).toEqual([['Terra Viva 30/11', ['DEVEMOS EDITAR SEGUNDO A PREMIAÇÃO']]]);
    const [c] = colunasDoDia(r.linhas);
    expect(c.itens.map((l) => [l.texto, l.infos])).toEqual([['Bola Cheia 29/11', ['DEVEMOS EDITAR SEGUNDO A PREMIAÇÃO']]]);
  });

  it('cada posição é uma: a claquete de fora de um editor não leva a info de outro', () => {
    const ls = cruzar([linha('Terra Viva 30/11', 'Rita Fontes'), linha('ENTRA SÁBADO', 'Otto Pires'), linha('Terra Viva 30/11', 'Rita Fontes', '2026-11-28'), linha('ENTRA SÁBADO', 'Rita Fontes', '2026-11-27')], []);
    const r = soAsQueCasam(ls);
    expect(r.linhas.map((l) => [l.editor, l.texto])).toEqual([['Otto Pires', 'ENTRA SÁBADO']]);
  });

  it('a contagem do dia conta só as claquetes que casam', () => {
    const ls = cruzar([linha('Bola Cheia 29/11'), linha('Terra Viva 30/11'), linha('COMUNICAÇÃO'), linha('Mundo Animal 28/11')], [producao('Bola Cheia 29/11', 'entregue'), producao('Mundo Animal 28/11', 'produzindo')]);
    const [c] = colunasDoDia(soAsQueCasam(ls).linhas);
    expect(contaDoEditor(c.itens)).toEqual({ feitas: 1, total: 2, bolinhas: [true, false] });
  });
});
