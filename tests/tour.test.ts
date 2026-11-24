import { describe, expect, it } from 'vitest';
import { aceita, comecar, convidar, passoAtual, PASSOS, pular, seguir, terminar, type Acao, type Tour } from '../src/tour/passos';

const noPasso = (i: number): Tour => ({ fase: 'passo', i });

describe('tour da revisão: a sequência de passos', () => {
  it('começa no convite e, ao começar, vai para o passo 1 (chegar)', () => {
    const t = comecar(convidar());
    expect(passoAtual(t)?.id).toBe('chegar');
  });

  it('são sete passos, sem o do tipo', () => {
    expect(PASSOS.map((p) => p.id)).toEqual(['chegar', 'fila', 'ficha', 'bolinha', 'fogo', 'enviar', 'no-trello']);
  });

  it('chegar: colar ou escolher o arquivo avança para a fila', () => {
    const t = comecar(convidar());
    expect(aceita(t, 'colar')).toBe(true);
    expect(passoAtual(seguir(t, 'colar'))?.id).toBe('fila');
    expect(passoAtual(seguir(t, 'escolher-arquivo'))?.id).toBe('fila');
  });

  it('a ação errada não avança: o tour fica no mesmo passo', () => {
    const t = comecar(convidar());
    expect(aceita(t, 'revisar')).toBe(false);
    expect(seguir(t, 'revisar')).toEqual(t);
    expect(seguir(t, 'enviar')).toEqual(t);
  });

  it('a fila: clicar em Revisar avança para a ficha', () => {
    expect(passoAtual(seguir(noPasso(1), 'revisar'))?.id).toBe('ficha');
    expect(passoAtual(seguir(noPasso(1), 'colar'))?.id).toBe('fila');
  });

  it('fazendo cada passo, chega ao fim; Terminar no último leva à despedida', () => {
    const acoes: Acao[] = ['colar', 'revisar', 'escolher-editor', 'bolinha', 'fogo-alta', 'enviar', 'terminar'];
    let t = comecar(convidar());
    for (const a of acoes) t = seguir(t, a);
    expect(t).toEqual({ fase: 'fim' });
    expect(passoAtual(t)).toBeNull();
  });

  it('no convite e no fim, nenhuma ação de passo avança', () => {
    expect(seguir(convidar(), 'colar')).toEqual({ fase: 'convite' });
    expect(seguir({ fase: 'fim' }, 'terminar')).toEqual({ fase: 'fim' });
  });

  it('pular: do convite ("Agora não") ou de qualquer passo, o tour sai', () => {
    expect(pular(convidar())).toEqual({ fase: 'fora', como: 'pulou' });
    expect(pular(noPasso(4))).toEqual({ fase: 'fora', como: 'pulou' });
    expect(passoAtual(pular(noPasso(1)))).toBeNull();
  });

  it('terminar: só a despedida termina; num passo, nada muda', () => {
    expect(terminar({ fase: 'fim' })).toEqual({ fase: 'fora', como: 'terminou' });
    expect(terminar(noPasso(2))).toEqual(noPasso(2));
  });
});
