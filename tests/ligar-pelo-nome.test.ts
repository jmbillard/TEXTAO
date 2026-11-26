import { describe, expect, it } from 'vitest';
import { acharCampo, acharLista, acharOpcao, casar, conferirPracas, estadoDasPracas, ligarPeloNome, nomeComparavel } from '../src/modelo/ligarPeloNome';
import { PRACAS_DE_FABRICA } from '../src/modelo/pracas';

/* Listas, campos e opções fictícios: os ids e os nomes de verdade ficam só no Trello. */
const lista = (id: string, nome: string, arquivada = false) => ({ id, nome, arquivada });
const praca = (sigla: string) => PRACAS_DE_FABRICA.find((p) => p.sigla === sigla)!;

describe('o nome comparável', () => {
  it('sem caixa, acento, pontuação e espaços repetidos', () => {
    expect(nomeComparavel('  Praça ')).toBe('PRACA');
    expect(nomeComparavel('PROMO SP · ENTRADA')).toBe('PROMO SP ENTRADA');
    expect(nomeComparavel('Saída-SP!!')).toBe('SAIDA SP');
  });
});

describe('casar: um, nenhum, dobro', () => {
  const itens = [{ id: 'a', nome: 'X' }, { id: 'b', nome: 'Y' }, { id: 'c', nome: 'Y' }];
  it('um só liga; nenhum e mais de um viram exceção', () => {
    expect(casar(itens, (i) => i.nome === 'X')).toEqual({ como: 'um', id: 'a' });
    expect(casar(itens, (i) => i.nome === 'Z')).toEqual({ como: 'nenhum' });
    expect(casar(itens, (i) => i.nome === 'Y')).toEqual({ como: 'dobro', ids: ['b', 'c'] });
  });
});

describe('as listas da praça', () => {
  const listas = [
    lista('l1', 'SP ENTRADA'),
    lista('l2', 'SP Entregue'),
    lista('l3', 'RIO ENTRADA'),
    lista('l4', 'Rio · Pronto'),
    lista('l5', 'INTER ENTRADA'),
    lista('l6', 'INTER ENTREGUE'),
    lista('l7', 'INTER ENTREGUE (2025)'),
    lista('l8', 'ESPECIAL ENTRADA'),
    lista('l9', 'SP ENTRADA antiga', true),
    lista('l10', 'SAÍDA RIO'),
  ];
  it('a entrada: a sigla ou uma palavra da regra, e ENTRADA; só listas abertas', () => {
    expect(acharLista(listas, praca('SP'), 'entrada')).toEqual({ como: 'um', id: 'l1' });
    expect(acharLista(listas, praca('RJ'), 'entrada')).toEqual({ como: 'um', id: 'l3' });
    expect(acharLista(listas, praca('INTER'), 'entrada')).toEqual({ como: 'um', id: 'l5' });
  });
  it('a saída: com SAÍDA, ENTREGUE ou PRONTO; duas viram dobro', () => {
    expect(acharLista(listas, praca('SP'), 'saida')).toEqual({ como: 'um', id: 'l2' });
    expect(acharLista(listas, praca('RJ'), 'saida')).toEqual({ como: 'dobro', ids: ['l4', 'l10'] });
    expect(acharLista(listas, praca('INTER'), 'saida')).toEqual({ como: 'dobro', ids: ['l6', 'l7'] });
  });
  it('a palavra inteira: "ESPECIAL" não é SP; a G5 (sem regra) não acha lista com G5', () => {
    expect(acharLista([lista('x', 'ESPECIAL ENTRADA')], praca('SP'), 'entrada')).toEqual({ como: 'nenhum' });
    expect(acharLista(listas, praca('G5'), 'entrada')).toEqual({ como: 'nenhum' });
  });
});

describe('o campo, pelo nome e pelo tipo, e as opções', () => {
  const campos = [
    { id: 'c1', nome: 'Praça', tipo: 'list', opcoes: [{ id: 'o1', nome: 'G5' }, { id: 'o2', nome: 'SP' }, { id: 'o3', nome: 'Rio' }, { id: 'o4', nome: 'Internacional' }, { id: 'o5', nome: 'sp ' }] },
    { id: 'c2', nome: 'Prioridade', tipo: 'list', opcoes: [] },
    { id: 'c3', nome: 'Projeto', tipo: 'text', opcoes: [] },
    { id: 'c4', nome: 'Projeto', tipo: 'list', opcoes: [] },
  ];
  it('o campo só liga com o tipo certo', () => {
    expect(acharCampo(campos, 'PRACA', 'list')).toEqual({ como: 'um', id: 'c1' });
    expect(acharCampo(campos, 'Projeto', 'text')).toEqual({ como: 'um', id: 'c3' });
    expect(acharCampo(campos, 'Prioridade', 'text')).toEqual({ como: 'nenhum' });
    expect(acharCampo([...campos, { id: 'c5', nome: 'praca', tipo: 'list', opcoes: [] }], 'Praça', 'list')).toEqual({ como: 'dobro', ids: ['c1', 'c5'] });
  });
  it('a opção: a sigla ou o nome da praça', () => {
    const campo = campos[0];
    expect(acharOpcao(campo, praca('G5'))).toEqual({ como: 'um', id: 'o1' });
    expect(acharOpcao(campo, praca('RJ'))).toEqual({ como: 'um', id: 'o3' });
    expect(acharOpcao(campo, praca('INTER'))).toEqual({ como: 'um', id: 'o4' });
    expect(acharOpcao(campo, praca('SP'))).toEqual({ como: 'dobro', ids: ['o2', 'o5'] });
    expect(acharOpcao(undefined, praca('SP'))).toEqual({ como: 'nenhum' });
  });
});

/* ---------- o estado da seção Praças ---------- */

const QUADRO = {
  listas: [
    lista('lSP', 'SP ENTRADA'),
    lista('lSPs', 'SP ENTREGUE'),
    lista('lRJ', 'RIO ENTRADA'),
    lista('lRJs', 'RIO ENTREGUE'),
    lista('lIN', 'INTER ENTRADA'),
    lista('lINs', 'INTER ENTREGUE'),
    lista('lINs2', 'INTER ENTREGUE (2025)'),
    lista('lVelha', 'SP ENTRADA 2024', true),
  ],
  campos: [{ id: 'cPraca', nome: 'Praça', tipo: 'list', opcoes: [{ id: 'oG5', nome: 'G5' }, { id: 'oSP', nome: 'SP' }, { id: 'oRJ', nome: 'RJ' }, { id: 'oIN', nome: 'INTER' }] }],
};
/** As praças de fábrica com os ids dados (o que veio do Portainer ou foi salvo). */
const comIds = (ids: Record<string, Partial<Record<'entrada' | 'saida' | 'opcao', string>>>) =>
  PRACAS_DE_FABRICA.map((p) => ({ ...p, entrada: '', saida: '', opcao: '', ...ids[p.sigla] }));
const ligacao = (e: ReturnType<typeof estadoDasPracas>, chave: string) => [e.campo, ...e.pracas.flatMap((p) => [p.entrada, p.saida, p.opcao])].find((l) => l.chave === chave)!;

describe('ligar pelo nome as praças', () => {
  it('na primeira vez, sem nada do Portainer: liga o que acha um só; o resto fica vazio', () => {
    const r = ligarPeloNome({ pracas: comIds({}), campoPraca: '', aMao: [] }, QUADRO, { primeiraVez: true });
    expect(r.campoPraca).toBe('cPraca');
    expect(r.pracas.map((p) => [p.sigla, p.entrada, p.saida, p.opcao])).toEqual([
      ['G5', '', '', 'oG5'],
      ['RJ', 'lRJ', 'lRJs', 'oRJ'],
      ['SP', 'lSP', 'lSPs', 'oSP'],
      ['INTER', 'lIN', '', 'oIN'],
    ]);
    expect(r.aMao).toEqual([]);
  });

  it('na primeira vez, com o Portainer: o id que o nome não acharia (a G5 nas listas do RJ) fica ligado à mão', () => {
    const portainer = comIds({ G5: { entrada: 'lRJ', saida: 'lRJs', opcao: 'oG5' }, SP: { entrada: 'lSP' } });
    const r = ligarPeloNome({ pracas: portainer, campoPraca: 'cPraca', aMao: [] }, QUADRO, { primeiraVez: true });
    expect(r.pracas[0]).toMatchObject({ entrada: 'lRJ', saida: 'lRJs', opcao: 'oG5' });
    expect(r.aMao).toEqual(['G5.entrada', 'G5.saida']);
  });

  it('depois de salvo, o id guardado vale mesmo que o nome tenha mudado (renomear não quebra)', () => {
    const renomeado = { ...QUADRO, listas: QUADRO.listas.map((l) => (l.id === 'lSP' ? { ...l, nome: 'SÃO PAULO · CHEGOU' } : l)) };
    const r = ligarPeloNome({ pracas: comIds({ SP: { entrada: 'lSP' } }), campoPraca: 'cPraca', aMao: [] }, renomeado, { primeiraVez: false });
    expect(r.pracas[2].entrada).toBe('lSP');
    expect(r.aMao).toEqual([]);
    expect(ligacao(estadoDasPracas(r, renomeado), 'SP.entrada')).toMatchObject({ como: 'nome', problema: '', nome: 'SÃO PAULO · CHEGOU' });
  });
});

describe('o estado: só as exceções à mostra', () => {
  const salvo = {
    pracas: comIds({ G5: { entrada: 'lRJ', saida: 'lRJs', opcao: 'oG5' }, RJ: { entrada: 'lRJ', saida: 'lRJs', opcao: 'oRJ' }, SP: { entrada: 'lVelha', saida: 'lSumiu', opcao: 'oSP' }, INTER: { entrada: 'lIN', opcao: 'oIN' } }),
    campoPraca: 'cPraca',
    aMao: ['G5.entrada', 'G5.saida'],
  };
  const e = estadoDasPracas(salvo, QUADRO);

  it('cada ligação diz como foi ligada e o que há de errado', () => {
    expect(ligacao(e, 'campo')).toMatchObject({ id: 'cPraca', nome: 'Praça', como: 'nome', problema: '' });
    expect(ligacao(e, 'G5.entrada')).toMatchObject({ nome: 'RIO ENTRADA', como: 'mao', problema: '', divididaCom: 'RJ' });
    expect(ligacao(e, 'RJ.entrada')).toMatchObject({ como: 'nome', divididaCom: 'G5' });
    expect(ligacao(e, 'SP.entrada')).toMatchObject({ problema: 'arquivada', nome: 'SP ENTRADA 2024' });
    expect(ligacao(e, 'SP.saida')).toMatchObject({ problema: 'sumiu', nome: '' });
    expect(ligacao(e, 'INTER.saida')).toMatchObject({ id: '', como: '', problema: 'dobro', candidatos: ['lINs', 'lINs2'] });
  });

  it('as exceções: o problema e o ligado à mão; a linha de estado conta', () => {
    expect(e.excecoes.map((l) => l.chave)).toEqual(['G5.entrada', 'G5.saida', 'SP.entrada', 'SP.saida', 'INTER.saida']);
    expect(e.resumo).toBe('4 praças · 2 sumiram · 1 em dobro · 2 à mão');
    const tudo = estadoDasPracas(ligarPeloNome({ ...salvo, pracas: comIds({ G5: { entrada: 'lRJ', saida: 'lRJs' }, SP: { entrada: 'lSP' } }) }, { ...QUADRO, listas: QUADRO.listas.filter((l) => l.id !== 'lINs2') }, { primeiraVez: false }), QUADRO);
    expect(tudo.resumo).toBe('4 praças · tudo ligado · 2 à mão');
  });

  it('sem o campo Praça, a opção de cada praça não acha nada', () => {
    const semCampo = estadoDasPracas({ ...salvo, campoPraca: '' }, { ...QUADRO, campos: [] });
    expect(ligacao(semCampo, 'campo')).toMatchObject({ problema: 'nenhum' });
    expect(ligacao(semCampo, 'SP.opcao')).toMatchObject({ problema: 'sumiu' });
  });
});

/* ---------- conferir antes de salvar ---------- */

describe('conferir: o que não passa e o que muda', () => {
  const antes = { pracas: comIds({ G5: { entrada: 'lRJ', saida: 'lRJs', opcao: 'oG5' }, RJ: { entrada: 'lRJ', saida: 'lRJs', opcao: 'oRJ' }, SP: { entrada: 'lSP', saida: 'lSPs', opcao: 'oSP' }, INTER: { entrada: 'lIN', saida: 'lINs', opcao: 'oIN' } }), campoPraca: 'cPraca', aMao: ['G5.entrada', 'G5.saida'] };
  const com = (sigla: string, mudar: Record<string, unknown>) => ({ ...antes, pracas: antes.pracas.map((p) => (p.sigla === sigla ? { ...p, ...mudar } : p)) });

  it('sem mudança, confere e não muda nada', () => {
    const r = conferirPracas(antes, antes, QUADRO);
    expect(r.ok).toBe(true);
    expect(r.muda).toEqual([]);
    expect(r.itens.every((i) => i.tipo === 'ok')).toBe(true);
  });

  it('a regra, a padrão, a ordem e a lista nova aparecem no que muda, com os nomes do Trello', () => {
    const depois = com('SP', { regra: { onde: 'fim', palavras: ['SP', 'PAULISTA'] }, tambem: ['SAMPA'], entrada: 'lIN' });
    depois.pracas = [depois.pracas[0], depois.pracas[2], depois.pracas[1], depois.pracas[3]].map((p) => ({ ...p, padrao: p.sigla === 'SP' }));
    const r = conferirPracas({ ...depois, aMao: [...antes.aMao, 'SP.entrada'] }, antes, QUADRO);
    expect(r.ok).toBe(true);
    expect(r.muda).toEqual([
      { oque: 'Ordem', antes: 'G5, RJ, SP, INTER', depois: 'G5, SP, RJ, INTER' },
      { oque: 'Praça padrão', antes: 'G5', depois: 'SP' },
      { oque: 'SP: regra', antes: 'termina em SP', depois: 'termina em SP ou PAULISTA' },
      { oque: 'SP: também lida como', antes: '—', depois: 'SAMPA' },
      { oque: 'SP: entrada', antes: 'SP ENTRADA', depois: 'INTER ENTRADA (à mão)' },
    ]);
  });

  it('lista arquivada, lista e opção que sumiram, palavra de outra regra: erro, não salva', () => {
    const depois = { ...com('SP', { entrada: 'lVelha', saida: 'lNada', opcao: 'oNada' }) };
    depois.pracas = depois.pracas.map((p) => (p.sigla === 'INTER' ? { ...p, regra: { onde: 'fim' as const, palavras: ['INTER', 'SP'] } } : p));
    const r = conferirPracas(depois, antes, QUADRO);
    expect(r.ok).toBe(false);
    expect(r.itens.filter((i) => i.tipo === 'erro').map((i) => `${i.titulo}: ${i.detalhe}`)).toEqual([
      'INTER: termina em INTER ou SP: "SP" já é a regra de SP. Use outra palavra.',
      'SP: entrada: "SP ENTRADA 2024" está arquivada no Trello.',
      'SP: saída: a lista não existe mais no quadro.',
      'SP: opção no campo Praça: a opção não existe mais no campo Praça.',
    ]);
  });

  it('o campo Praça precisa ser um campo de lista; vazio é só aviso', () => {
    const quadro = { ...QUADRO, campos: [...QUADRO.campos, { id: 'cTexto', nome: 'Praça', tipo: 'text', opcoes: [] }] };
    const r = conferirPracas({ ...antes, campoPraca: 'cTexto' }, antes, quadro);
    expect(r.itens.find((i) => i.tipo === 'erro')).toMatchObject({ titulo: 'Campo Praça', detalhe: '"Praça" não é um campo de lista.' });
    const semSaida = conferirPracas(com('INTER', { saida: '' }), antes, QUADRO);
    expect(semSaida.ok).toBe(true);
    expect(semSaida.itens.find((i) => i.tipo === 'aviso')).toMatchObject({ titulo: 'INTER: saída', detalhe: 'nada ligado: o card fica na entrada.' });
  });
});
