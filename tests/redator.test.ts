import { describe, expect, it } from 'vitest';
import { autorEhRedator, estadoDoRedator, motivoDoHistorico, recusarPalpite, redatorNoTexto, sugeridosDoMenu, sugestoesDoRedator, type RedatorVocab } from '../src/modelo/redator';
import { metaVazia, type Meta } from '../src/modelo/tipos';

/* Sugestão de redator: o roteiro chega sem redator e o PROMeiro sugere um nome, sem preencher sozinho. */

const REDATORES: RedatorVocab[] = [
  { nome: 'Fulana Prado', keys: ['FPRADO'], ativo: true },
  { nome: 'Sicrana Lopes', keys: ['SICRANA LOPES'], ativo: true },
  { nome: 'Beltrano Reis', keys: [], ativo: true },
  { nome: 'Joana Vidal', keys: [], ativo: true },
  { nome: 'Joana Mattos', keys: [], ativo: true },
  { nome: 'Cicrano Dias', keys: ['CDIAS'], ativo: false },
];

/** Um roteiro de mentira: o cabeçalho, o corpo e o fim. */
const roteiro = ({ cabecalho = ['CALDEIRÃO 29/11', 'LOC: LOCUTOR FICTÍCIO'], corpo = ['IMAGENS DO PROGRAMA', 'NESTE SÁBADO, TEM FESTA.', 'TEXTO DA LOCUÇÃO.', 'MAIS TEXTO.', 'E MAIS.'], fim = ['FECHA COM A MARCA'] } = {}) => [...cabecalho, ...corpo, ...fim];

describe('o redator pelo texto do roteiro', () => {
  it('a assinatura no fim, pelo nome inteiro, sem acento e sem diferenciar maiúsculas', () => {
    expect(redatorNoTexto(roteiro({ fim: ['FECHA COM A MARCA', 'fulána PRADO'] }), REDATORES)).toEqual({ nome: 'Fulana Prado', motivo: 'assinado no fim', fonte: 'texto' });
  });

  it('pela key do redator (o login, o autor do Word)', () => {
    expect(redatorNoTexto(roteiro({ fim: ['Texto: fprado'] }), REDATORES)).toMatchObject({ nome: 'Fulana Prado', motivo: 'assinado no fim' });
  });

  it('no cabeçalho, quando o fim não diz', () => {
    expect(redatorNoTexto(roteiro({ cabecalho: ['CALDEIRÃO 29/11', 'Texto de Sicrana Lopes'] }), REDATORES)).toEqual({ nome: 'Sicrana Lopes', motivo: 'no texto', fonte: 'texto' });
  });

  it('no meio do texto, quando nem o fim nem o cabeçalho dizem', () => {
    expect(redatorNoTexto(roteiro({ corpo: ['IMAGENS', 'SONORA', 'TEXTO', 'OUTRO TEXTO', 'Revisado por Beltrano Reis.', 'MAIS', 'E MAIS'] }), REDATORES)).toMatchObject({ nome: 'Beltrano Reis', motivo: 'no texto' });
  });

  it('só palavra inteira: "Fulana Pradoso" não é a Fulana Prado', () => {
    expect(redatorNoTexto(roteiro({ cabecalho: ['TEXTO DE FULANA PRADOSO'] }), REDATORES)).toBeNull();
    expect(redatorNoTexto(roteiro({ cabecalho: ['TEXTO DE FPRADOS'] }), REDATORES)).toBeNull();
  });

  it('a assinatura vale antes do cabeçalho', () => {
    expect(redatorNoTexto(roteiro({ cabecalho: ['Sicrana Lopes'], fim: ['Fulana Prado'] }), REDATORES)).toMatchObject({ nome: 'Fulana Prado', motivo: 'assinado no fim' });
  });

  it('dois redatores na mesma zona: não sugere', () => {
    expect(redatorNoTexto(roteiro({ fim: ['Fulana Prado e Beltrano Reis'] }), REDATORES)).toBeNull();
    expect(redatorNoTexto(roteiro({ cabecalho: ['Fulana Prado', 'Beltrano Reis'] }), REDATORES)).toBeNull();
  });

  it('a assinatura só com o primeiro nome vale quando um único redator tem esse nome', () => {
    expect(redatorNoTexto(roteiro({ fim: ['FECHA COM A MARCA', 'Beltrano'] }), REDATORES)).toMatchObject({ nome: 'Beltrano Reis', motivo: 'assinado no fim' });
    // duas Joanas cadastradas: o primeiro nome sozinho não diz qual
    expect(redatorNoTexto(roteiro({ fim: ['Joana'] }), REDATORES)).toBeNull();
  });

  it('o primeiro nome sozinho só vale na assinatura', () => {
    expect(redatorNoTexto(roteiro({ cabecalho: ['Beltrano'] }), REDATORES)).toBeNull();
  });

  it('redator inativo não é sugerido', () => {
    expect(redatorNoTexto(roteiro({ fim: ['Cicrano Dias'] }), REDATORES)).toBeNull();
    expect(redatorNoTexto(roteiro({ fim: ['cdias'] }), REDATORES)).toBeNull();
  });

  it('sem nenhum redator no texto, não sugere', () => {
    expect(redatorNoTexto(roteiro(), REDATORES)).toBeNull();
    expect(redatorNoTexto([], REDATORES)).toBeNull();
  });
});

describe('o autor do arquivo', () => {
  it('vale quando é um redator cadastrado, pelo nome ou pela key, sem acento e sem diferenciar maiúsculas', () => {
    expect(autorEhRedator('FULANA PRADO', REDATORES)).toBe(true);
    expect(autorEhRedator('fprado', REDATORES)).toBe(true);
    expect(autorEhRedator('Sicraná Lopes', REDATORES)).toBe(true);
  });
  it('quem não é redator cadastrado não vale (o estagiário, o dono do modelo do Word)', () => {
    expect(autorEhRedator('Usuario Generico', REDATORES)).toBe(false);
    expect(autorEhRedator('', REDATORES)).toBe(false);
  });
  it('sem a lista de redatores (servidor sem Teable), o autor continua valendo', () => {
    expect(autorEhRedator('Usuario Generico', [])).toBe(true);
  });
});

describe('o redator pelas últimas claquetes da atração', () => {
  it('o motivo: "últimos 4" quando são todos dela; "3 dos últimos 5" quando não', () => {
    expect(motivoDoHistorico({ vezes: 4, de: 4 }, 'Caldeirão')).toBe('últimos 4 do Caldeirão');
    expect(motivoDoHistorico({ vezes: 3, de: 5 }, 'Novela em Sinfonia')).toBe('3 dos últimos 5 da Novela em Sinfonia');
    expect(motivoDoHistorico({ vezes: 4, de: 5 }, 'Tarde Animada')).toBe('4 dos últimos 5 da Tarde Animada');
  });
});

describe('juntar as fontes', () => {
  const historico = { nome: 'Sicrana Lopes', vezes: 4, de: 4 };
  const texto = { nome: 'Beltrano Reis', motivo: 'no texto', fonte: 'texto' as const };

  it('quando as fontes discordam, vale o texto; o histórico vem depois', () => {
    expect(sugestoesDoRedator({ texto, historico, atracao: 'Caldeirão', redatores: REDATORES })).toEqual([
      texto,
      { nome: 'Sicrana Lopes', motivo: 'últimos 4 do Caldeirão', fonte: 'historico' },
    ]);
  });
  it('as duas concordam: uma sugestão só, a do texto', () => {
    expect(sugestoesDoRedator({ texto: { ...texto, nome: 'Sicrana Lopes' }, historico, atracao: 'Caldeirão', redatores: REDATORES })).toHaveLength(1);
  });
  it('o histórico só sugere redator ativo (e com o nome do cadastro)', () => {
    expect(sugestoesDoRedator({ texto: null, historico: { nome: 'Cicrano Dias', vezes: 5, de: 5 }, atracao: 'Caldeirão', redatores: REDATORES })).toEqual([]);
    expect(sugestoesDoRedator({ texto: null, historico: { nome: 'SICRANA LOPES', vezes: 3, de: 5 }, atracao: 'Caldeirão', redatores: REDATORES })[0].nome).toBe('Sicrana Lopes');
  });
  it('o palpite recusado não volta', () => {
    expect(sugestoesDoRedator({ texto, historico, atracao: 'Caldeirão', redatores: REDATORES, recusados: ['Beltrano Reis'] }).map((s) => s.nome)).toEqual(['Sicrana Lopes']);
  });
});

describe('os estados do palpite e a recusa guardada', () => {
  const comSugestao = (meta: Partial<Meta> = {}): Meta => ({
    ...metaVazia(),
    sugestoesRedator: [
      { nome: 'Beltrano Reis', motivo: 'no texto', fonte: 'texto' },
      { nome: 'Sicrana Lopes', motivo: 'últimos 4 do Caldeirão', fonte: 'historico' },
    ],
    ...meta,
  });

  it('sugerido: o primeiro palpite, à espera de um toque', () => {
    expect(estadoDoRedator(comSugestao())).toEqual({ estado: 'sugerido', sugestao: { nome: 'Beltrano Reis', motivo: 'no texto', fonte: 'texto' } });
  });
  it('aceito: com o redator preenchido (pelo palpite ou pelo Escolher)', () => {
    expect(estadoDoRedator(comSugestao({ redator: 'Beltrano Reis' }))?.estado).toBe('aceito');
    expect(estadoDoRedator(comSugestao({ redator: 'Joana Vidal' }))?.estado).toBe('aceito');
  });
  it('recusado: o × guarda o nome no roteiro e o palpite não volta; o Escolher fica com o outro em cima', () => {
    const meta = comSugestao();
    const depois = { ...meta, ...recusarPalpite(meta) };
    expect(depois.redatorRecusado).toEqual(['Beltrano Reis']);
    expect(estadoDoRedator(depois)?.estado).toBe('recusado');
    expect(sugeridosDoMenu(depois).map((s) => s.nome)).toEqual(['Sicrana Lopes']);
    // recusar de novo não repete o nome
    expect({ ...depois, ...recusarPalpite(depois) }.redatorRecusado).toEqual(['Beltrano Reis']);
  });
  it('sem sugestão, não há palpite', () => {
    expect(estadoDoRedator(metaVazia())).toBeNull();
    expect(sugeridosDoMenu(metaVazia())).toEqual([]);
  });
});
