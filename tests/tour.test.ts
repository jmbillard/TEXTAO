import { describe, expect, it } from 'vitest';
import { aceita, comecar, convidar, passoAtual, PASSOS, pular, recomecar, segura, seguir, terminar, type Acao, type Tour } from '../src/tour/passos';
import { colocarExemplo, comExemplo, enviarExemplo, exemploNoTrello, ID_DO_EXEMPLO, roteiroDeExemplo } from '../src/tour/exemplo';
import type { Armazenamento } from '../src/dados/armazenamento';
import { noTrello } from '../src/ui/fila';

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

  it('a ficha: escolher o editor avança para a bolinha; clicar na bolinha antes, não', () => {
    expect(passoAtual(noPasso(2))?.id).toBe('ficha');
    expect(passoAtual(seguir(noPasso(2), 'escolher-editor'))?.id).toBe('bolinha');
    expect(seguir(noPasso(2), 'bolinha')).toEqual(noPasso(2));
  });

  it('a bolinha: clicar nela avança para o fogo; o fogo antes, não', () => {
    expect(passoAtual(seguir(noPasso(3), 'bolinha'))?.id).toBe('fogo');
    expect(seguir(noPasso(3), 'fogo-alta')).toEqual(noPasso(3));
  });

  it('o fogo: chegar a ALTA avança para enviar; enviar antes, não', () => {
    expect(passoAtual(seguir(noPasso(4), 'fogo-alta'))?.id).toBe('enviar');
    expect(seguir(noPasso(4), 'enviar')).toEqual(noPasso(4));
  });

  it('o Enviar fica seguro até o passo de enviar; nele, e fora do tour, não', () => {
    for (const i of [2, 3, 4]) expect(segura(noPasso(i), 'enviar')).toBe(true);
    expect(segura(noPasso(5), 'enviar')).toBe(false);
    expect(segura({ fase: 'fora', como: 'pulou' }, 'enviar')).toBe(false);
    expect(segura(convidar(), 'enviar')).toBe(false);
  });

  it('a ficha, a bolinha, o fogo e o enviar ficam no editor; os outros, na fila', () => {
    expect(PASSOS.map((p) => p.tela)).toEqual(['fila', 'fila', 'editor', 'editor', 'editor', 'editor', 'fila']);
  });

  it('a ficha e o fogo têm uma segunda tela, com os textos do rascunho', () => {
    const meio = Object.fromEntries(PASSOS.filter((p) => p.meio).map((p) => [p.id, p.meio]));
    expect(meio).toEqual({ ficha: 'Quem vai editar esta chamada? Escolha um nome.', fogo: 'Mais um clique.' });
  });

  it('enviar: o Enviar avança para no Trello; Terminar antes, não', () => {
    expect(passoAtual(seguir(noPasso(5), 'enviar'))?.id).toBe('no-trello');
    expect(seguir(noPasso(5), 'terminar')).toEqual(noPasso(5));
  });

  it('no Trello: Terminar leva à despedida; o Enviar de novo, não', () => {
    expect(seguir(noPasso(6), 'terminar')).toEqual({ fase: 'fim' });
    expect(seguir(noPasso(6), 'enviar')).toEqual(noPasso(6));
  });

  it('o envio e o Terminar têm os textos do rascunho', () => {
    expect(PASSOS[5].texto).toBe('Sem pendências, é só enviar. No tour é de mentira: nada vai ao Trello.');
    expect(PASSOS[6].texto).toBe('De verdade, o card iria para o Trello e entraria aqui, na agenda. Este foi só de exemplo.');
  });

  it('recomeçar ("Fazer o tour" no "?"): volta ao primeiro passo, sem passar pelo convite', () => {
    expect(recomecar()).toEqual(noPasso(0));
    expect(passoAtual(recomecar())?.id).toBe('chegar');
  });

  it('recomeçado, o tour anda de novo até o fim', () => {
    const acoes: Acao[] = ['colar', 'revisar', 'escolher-editor', 'bolinha', 'fogo-alta', 'enviar', 'terminar'];
    let t = recomecar();
    for (const a of acoes) t = seguir(t, a);
    expect(terminar(t)).toEqual({ fase: 'fora', como: 'terminou' });
  });
});

describe('tour da revisão: o envio simulado do exemplo', () => {
  const base: Armazenamento = {
    tipo: 'servidor',
    listar: async () => [],
    ler: async () => undefined,
    salvar: async () => {
      throw new Error('o exemplo não pode ir ao servidor');
    },
    apagar: async () => {},
    versoes: async () => [],
    lerVersao: async () => {
      throw new Error('sem histórico');
    },
    usuarios: async () => [],
    andamento: async () => ({}),
  };
  const arm = comExemplo(base);
  const doExemplo = async () => (await arm.listar()).find((r) => r.id === ID_DO_EXEMPLO);

  it('enviado, o exemplo some da fila a caminho e entra na agenda No Trello depois, sem ir ao servidor', async () => {
    const r = roteiroDeExemplo();
    colocarExemplo(r);
    expect(noTrello((await doExemplo())!)).toBe(false);
    const envio = await enviarExemplo({ ...r, meta: { ...r.meta, editor: 'Editora Fictícia' } });
    expect(envio.estado).toBe('enviado');
    expect(await doExemplo()).toBeUndefined();
    expect(exemploNoTrello()).toBe(true);
    const noCard = await doExemplo();
    expect(noCard && noTrello(noCard)).toBe(true);
    expect(noCard?.meta.editor).toBe('Editora Fictícia');
  });

  it('no fim, o exemplo sai da fila e da agenda; recolocado, chega sem envio', async () => {
    colocarExemplo(roteiroDeExemplo());
    await enviarExemplo(roteiroDeExemplo());
    exemploNoTrello();
    expect(colocarExemplo(null)).toBe(true);
    expect(await doExemplo()).toBeUndefined();
    expect(exemploNoTrello()).toBe(false);
    colocarExemplo(roteiroDeExemplo());
    expect((await doExemplo())?.trello).toBeUndefined();
    colocarExemplo(null);
  });
});
