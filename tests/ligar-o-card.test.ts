import { describe, expect, it } from 'vitest';
import { acertarDependentes, cardDaConfiguracao, conferirCard, desfazerAMaoDoCard, estadoDoCard, ligarAMaoNoCard, ligarOCardPeloNome, mudancasDoCard, type LigacoesDoCard } from '../src/modelo/ligarOCard';
import type { CampoDoTrello, QuadroLido } from '../src/modelo/ligarPeloNome';

/* A seção Card da Configuração (#74): os campos do card, as opções deles e a lista do VT, ligados pelo nome e pelo
   tipo. Campos, opções e listas fictícios. */

const opcoes = (...nomes: string[]) => nomes.map((nome, i) => ({ id: `${nome.toLowerCase().replace(/[^a-z]/g, '')}${i}`, nome }));
const campo = (id: string, nome: string, tipo: string, ops: { id: string; nome: string }[] = []): CampoDoTrello => ({ id, nome, tipo, opcoes: ops });
/** O quadro com tudo no nome certo: cada campo um só, do tipo certo. */
const QUADRO: QuadroLido = {
  listas: [
    { id: 'lVT', nome: 'VT', arquivada: false },
    { id: 'lSP', nome: 'SP ENTRADA', arquivada: false },
    { id: 'lVTvelha', nome: 'VT', arquivada: true },
  ],
  campos: [
    campo('cPraca', 'Praça', 'list', opcoes('G5', 'SP')),
    campo('cPrio', 'Prioridade', 'list', opcoes('Alta', 'Média', 'Baixa')),
    campo('cCx', 'Complexidade', 'list', opcoes('ALTA', 'BAIXA', 'MÉDIA')),
    campo('cRed', 'Redator', 'list', opcoes('Ana')),
    campo('cEd', 'Editor', 'list'),
    campo('cProj', 'Projeto', 'text'),
    campo('cOut', 'Output', 'text'),
    campo('cBot', 'BOT', 'checkbox'),
    campo('cEnt', 'Entrada', 'date'),
    campo('cIA', 'Uso de IA', 'checkbox'),
  ],
};
const vazio = (): LigacoesDoCard => cardDaConfiguracao({});
const ids = (c: LigacoesDoCard) => c.ids;

describe('ligar o card pelo nome e pelo tipo', () => {
  it('sem nada salvo, liga cada campo, as opções de cada um (complexidade em ordem) e a lista VT aberta', () => {
    const c = ligarOCardPeloNome(vazio(), QUADRO, { primeiraVez: true });
    expect(ids(c)).toEqual({
      prioridade: 'cPrio',
      'prioridade.ALTA': 'alta0',
      'prioridade.MEDIA': 'mdia1',
      complexidade: 'cCx',
      'complexidade.BAIXA': 'baixa1',
      'complexidade.MEDIA': 'mdia2',
      'complexidade.ALTA': 'alta0',
      redator: 'cRed',
      editor: 'cEd',
      projeto: 'cProj',
      output: 'cOut',
      bot: 'cBot',
      entrada: 'cEnt',
      vt: 'lVT',
    });
    expect(c.aMao).toEqual([]);
    expect(estadoDoCard(c, QUADRO).resumo).toBe('tudo ligado');
    expect(estadoDoCard(c, QUADRO).excecoes).toEqual([]);
  });

  it('o campo com o nome certo e o tipo errado não liga (Projeto de lista, BOT de texto)', () => {
    const quadro = { ...QUADRO, campos: QUADRO.campos.map((c) => (c.id === 'cProj' ? { ...c, tipo: 'list' } : c.id === 'cBot' ? { ...c, tipo: 'text' } : c)) };
    const c = ligarOCardPeloNome(vazio(), quadro, { primeiraVez: true });
    expect([c.ids.projeto, c.ids.bot]).toEqual(['', '']);
    const e = estadoDoCard(c, quadro);
    expect(e.excecoes.map((l) => `${l.chave}:${l.problema}`)).toEqual(['card.projeto:nenhum', 'card.bot:nenhum']);
    expect(e.resumo).toBe('2 não achados');
  });

  it('"ALTA" duas vezes no campo Prioridade vira exceção para escolher, com as duas como candidatas', () => {
    const quadro = { ...QUADRO, campos: QUADRO.campos.map((c) => (c.id === 'cPrio' ? { ...c, opcoes: [...c.opcoes, { id: 'alta9', nome: 'ALTA ' }] } : c)) };
    const c = ligarOCardPeloNome(vazio(), quadro, { primeiraVez: true });
    expect(c.ids['prioridade.ALTA']).toBe('');
    const e = estadoDoCard(c, quadro);
    expect(e.excecoes.map((l) => [l.chave, l.problema, l.candidatos.join(',')])).toEqual([['card.prioridade.ALTA', 'dobro', 'alta0,alta9']]);
    expect(e.resumo).toBe('1 em dobro');
  });

  it('dois campos "Redator" de lista: dobro; sem o campo Complexidade, as opções dele não viram exceções à parte', () => {
    const quadro = { ...QUADRO, campos: [...QUADRO.campos.filter((c) => c.id !== 'cCx'), campo('cRed2', 'REDATOR', 'list')] };
    const c = ligarOCardPeloNome(vazio(), quadro, { primeiraVez: true });
    const e = estadoDoCard(c, quadro);
    expect(e.excecoes.map((l) => `${l.chave}:${l.problema}`)).toEqual(['card.complexidade:nenhum', 'card.redator:dobro']);
    expect(e.resumo).toBe('1 não achado · 1 em dobro');
  });
});

describe('trocar um campo limpa as opções que dependem dele', () => {
  const comOutraPrioridade: QuadroLido = { ...QUADRO, campos: [...QUADRO.campos, campo('cPrio2', 'Prioridade 2026', 'list', [{ id: 'nAlta', nome: 'ALTA' }, { id: 'nUrg', nome: 'URGENTE' }])] };
  const ligado = () => ligarOCardPeloNome(vazio(), comOutraPrioridade, { primeiraVez: false });

  it('à mão, no campo novo: a ALTA liga de novo pelo nome no campo novo; a MÉDIA, que ele não tem, fica pedindo', () => {
    const c = ligarAMaoNoCard({ ...ligado(), aMao: ['card.prioridade.MEDIA'] }, comOutraPrioridade, 'prioridade', 'cPrio2');
    expect([c.ids.prioridade, c.ids['prioridade.ALTA'], c.ids['prioridade.MEDIA']]).toEqual(['cPrio2', 'nAlta', '']);
    // a complexidade, de outro campo, fica como estava
    expect(c.ids['complexidade.ALTA']).toBe('alta0');
    expect(c.aMao).toEqual(['card.prioridade']);
    const e = estadoDoCard(c, comOutraPrioridade);
    expect(e.excecoes.map((l) => `${l.chave}:${l.como}:${l.problema}`)).toEqual(['card.prioridade:mao:', 'card.prioridade.MEDIA::nenhum']);
  });

  it('voltar ao campo de antes religa as opções dele; desfazer o à mão do campo volta o que o nome acha', () => {
    const trocado = ligarAMaoNoCard(ligado(), comOutraPrioridade, 'prioridade', 'cPrio2');
    const desfeito = desfazerAMaoDoCard(trocado, comOutraPrioridade, ['card.prioridade']);
    expect([desfeito.ids.prioridade, desfeito.ids['prioridade.ALTA'], desfeito.ids['prioridade.MEDIA']]).toEqual(['cPrio', 'alta0', 'mdia1']);
    expect(desfeito.aMao).toEqual([]);
  });

  it('a opção que não é do campo ligado sai e o nome liga de novo; o campo que sumiu do quadro não mexe nas opções', () => {
    const errado = { ...ligado(), ids: { ...ligado().ids, 'prioridade.ALTA': 'nAlta' } };
    expect(acertarDependentes(errado, comOutraPrioridade).ids['prioridade.ALTA']).toBe('alta0');
    const semCampo = { ...QUADRO, campos: QUADRO.campos.filter((c) => c.id !== 'cPrio') };
    expect(acertarDependentes(ligado(), semCampo).ids['prioridade.ALTA']).toBe('alta0');
  });
});

describe('a primeira vez, com o Portainer', () => {
  it('os ids de hoje valem; o que o nome não acharia fica ligado à mão; a complexidade vem na ordem da variável', () => {
    const portainer = { TRELLO_CAMPO_PRIORIDADE: 'cPrio', TRELLO_PRIORIDADE_ALTA: 'baixa2', TRELLO_CAMPO_COMPLEXIDADE: 'cCx', TRELLO_COMPLEXIDADE_OPCOES: 'baixa1, mdia2 ,alta0', TRELLO_CAMPOS_FILME: 'cCx,cIA' };
    const c = ligarOCardPeloNome(cardDaConfiguracao(portainer), QUADRO, { primeiraVez: true });
    expect([c.ids['prioridade.ALTA'], c.ids['complexidade.BAIXA'], c.ids['complexidade.MEDIA'], c.ids['complexidade.ALTA']]).toEqual(['baixa2', 'baixa1', 'mdia2', 'alta0']);
    expect(c.aMao).toEqual(['card.prioridade.ALTA']);
    const e = estadoDoCard(c, QUADRO);
    expect(e.excecoes.map((l) => `${l.chave}:${l.nome}`)).toEqual(['card.prioridade.ALTA:Baixa']);
    expect(e.doFilme.map((l) => l.nome)).toEqual(['Complexidade', 'Uso de IA']);
    expect(e.resumo).toBe('tudo ligado · 1 à mão');
  });

  it('as variáveis de volta: a complexidade em ordem, numa variável só', () => {
    const c = ligarOCardPeloNome(vazio(), QUADRO, { primeiraVez: true });
    expect(mudancasDoCard({ ...c, doFilme: ['cCx'] })).toMatchObject({
      TRELLO_CAMPO_PRIORIDADE: 'cPrio',
      TRELLO_PRIORIDADE_ALTA: 'alta0',
      TRELLO_PRIORIDADE_MEDIA: 'mdia1',
      TRELLO_CAMPO_COMPLEXIDADE: 'cCx',
      TRELLO_COMPLEXIDADE_OPCOES: 'baixa1,mdia2,alta0',
      TRELLO_LISTA_VT: 'lVT',
      TRELLO_CAMPOS_FILME: 'cCx',
    });
    expect(mudancasDoCard(vazio()).TRELLO_COMPLEXIDADE_OPCOES).toBe('');
  });
});

describe('conferir o card', () => {
  const ligado = () => ligarOCardPeloNome(vazio(), QUADRO, { primeiraVez: false });
  it('sem mudança confere; o que muda vem com os nomes do Trello, e a opção repetida diz qual é', () => {
    const quadro = { ...QUADRO, campos: QUADRO.campos.map((c) => (c.id === 'cPrio' ? { ...c, opcoes: [...c.opcoes, { id: 'alta9', nome: 'ALTA' }] } : c)) };
    const antes = { ...ligado(), ids: { ...ligado().ids, 'prioridade.ALTA': '' } };
    expect(conferirCard(antes, antes, quadro)).toMatchObject({ ok: true, muda: [] });
    const novo = ligarAMaoNoCard(antes, quadro, 'prioridade.ALTA', 'alta9');
    const r = conferirCard(novo, antes, quadro);
    expect(r.ok).toBe(true);
    expect(r.muda).toEqual([{ oque: 'Prioridade ALTA', antes: '—', depois: 'ALTA (a 4ª do campo) (à mão)' }]);
  });

  it('campo de tipo errado, opção de outro campo e lista arquivada: erro; vazio é só aviso', () => {
    const errado = { ...ligado(), ids: { ...ligado().ids, bot: 'cProj', 'complexidade.ALTA': 'alta0x', vt: 'lVTvelha', editor: '' } };
    const r = conferirCard(errado, ligado(), QUADRO);
    expect(r.ok).toBe(false);
    expect(r.itens.filter((i) => i.tipo !== 'ok').map((i) => `${i.tipo} ${i.titulo}: ${i.detalhe}`)).toEqual([
      'erro Complexidade ALTA: a opção não é do campo "Complexidade".',
      'aviso Editor: nada ligado: o card vai sem o editor.',
      'erro BOT: "Projeto" não é caixa de marcar.',
      'erro Lista do VT: "VT" está arquivada no Trello.',
    ]);
  });
});
