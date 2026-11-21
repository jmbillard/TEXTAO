import { describe, expect, it } from 'vitest';
import { acharPrograma, registrarVocabulario } from '../src/modelo/vocabularios';

describe('atração pela claquete', () => {
  registrarVocabulario({
    programas: [
      { nome: 'Chef de Alto Nível', chaves: ['CHEF'], categoria: 'PROGRAMAS' },
      { nome: 'Quem Ama Cuida', chaves: ['QUEM AMA'], categoria: 'NOVELAS' },
      { nome: 'Coração Acelerado', chaves: ['CORACAO'], categoria: 'NOVELAS' },
    ],
  } as never);
  it('a key do começo decide; o que vem nos parênteses é detalhe', () => {
    expect(acharPrograma('CHEF(QUEM AMA)17-11')?.nome).toBe('Chef de Alto Nível');
    expect(acharPrograma('CHEF(MANUT) C')?.nome).toBe('Chef de Alto Nível');
    expect(acharPrograma('Coracao(Elenco)12/1')?.nome).toBe('Coração Acelerado');
    expect(acharPrograma('QUEM AMA 12/3 REDE')?.nome).toBe('Quem Ama Cuida');
  });
  it('sem key no começo, ainda acha o nome no meio do texto', () => {
    expect(acharPrograma('Chamada especial Quem Ama Cuida hoje')?.nome).toBe('Quem Ama Cuida');
  });
});
