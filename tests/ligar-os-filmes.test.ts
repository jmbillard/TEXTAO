import { describe, expect, it } from 'vitest';
import { conferirFilmes, desfazerAMaoDosFilmes, estadoDosFilmes, filmesDaConfiguracao, ligarAMaoNosFilmes, ligarOsFilmesPeloNome, mudancasDosFilmes, opcaoDaPracaDosFilmes, type LigacoesDosFilmes } from '../src/modelo/ligarOsFilmes';
import type { QuadroLido } from '../src/modelo/ligarPeloNome';
import { pracasDaConfiguracao } from '../src/modelo/pracas';

/* A seção Filmes da Configuração (#75): a praça dos cards de filme (uma das praças), a lista dos cards de filme, a
   etiqueta de todo card de filme e a de cada sessão, ligadas pelo nome. Listas, etiquetas e sessões fictícias. */

const QUADRO: QuadroLido = {
  listas: [
    { id: 'lSP', nome: 'SP ENTRADA', arquivada: false },
    { id: 'lFilmes', nome: 'Cards de filme', arquivada: false },
    { id: 'lFilmesVelha', nome: 'FILMES 2024', arquivada: true },
    { id: 'lFilmagem', nome: 'FILMAGEM', arquivada: false },
  ],
  campos: [],
  etiquetas: [
    { id: 'eFilme', nome: 'FILME', cor: 'purple' },
    { id: 'eSuper', nome: 'SUPERCINE', cor: 'blue' },
    { id: 'eCoruja', nome: 'CORUJAO', cor: 'black' },
    { id: 'eTarde', nome: 'Sessão da Tarde', cor: 'yellow' },
    { id: 'eSemNome', nome: '', cor: 'red' },
  ],
};
const PRACAS = pracasDaConfiguracao({});
const SESSOES = ['Supercine', 'Corujão', 'Sessão da Tarde', 'Tela Quente'];
const vazio = (): LigacoesDosFilmes => filmesDaConfiguracao({}, { pracas: PRACAS, sessoes: SESSOES });

describe('ligar os filmes pelo nome', () => {
  it('sem nada salvo: a lista com FILME no nome, a etiqueta FILME e a de cada sessão pelo nome da sessão', () => {
    const c = ligarOsFilmesPeloNome(vazio(), QUADRO, { primeiraVez: true });
    expect(c.lista).toBe('lFilmes');
    expect(c.etiquetas).toEqual(['eFilme']);
    expect(c.sessoes).toEqual([
      { nome: 'Supercine', etiqueta: 'eSuper' },
      { nome: 'Corujão', etiqueta: 'eCoruja' },
      { nome: 'Sessão da Tarde', etiqueta: 'eTarde' },
      { nome: 'Tela Quente', etiqueta: '' },
    ]);
    expect(c.aMao).toEqual([]);
  });

  it('a sessão sem etiqueta com o nome dela é exceção, e a linha de estado conta as sessões', () => {
    const c = ligarOsFilmesPeloNome({ ...vazio(), praca: 'G5' }, QUADRO, { primeiraVez: false });
    const e = estadoDosFilmes(c, QUADRO, PRACAS);
    expect(e.excecoes.map((l) => `${l.chave}:${l.problema}`)).toEqual(['filmes.sessao.TELA QUENTE:nenhum']);
    expect(e.resumo).toBe('4 sessões · 1 não achado');
  });
});

describe('ligar os filmes: em dobro, à mão e na primeira vez', () => {
  it('duas listas com FILME no nome, ou duas etiquetas com o nome da sessão: exceção em dobro, com os candidatos', () => {
    const dobro: QuadroLido = {
      ...QUADRO,
      listas: [...QUADRO.listas, { id: 'lFilmes2', nome: 'FILMES', arquivada: false }],
      etiquetas: [...QUADRO.etiquetas!, { id: 'eSuper2', nome: 'Supercine', cor: 'green' }],
    };
    const c = ligarOsFilmesPeloNome({ ...vazio(), praca: 'G5' }, dobro, { primeiraVez: false });
    expect(c.lista).toBe('');
    const e = estadoDosFilmes(c, dobro, PRACAS);
    expect(e.excecoes.map((l) => [l.chave, l.problema, l.candidatos.join(',')])).toEqual([
      ['filmes.lista', 'dobro', 'lFilmes,lFilmes2'],
      ['filmes.sessao.SUPERCINE', 'dobro', 'eSuper,eSuper2'],
      ['filmes.sessao.TELA QUENTE', 'nenhum', ''],
    ]);
    expect(e.resumo).toBe('4 sessões · 1 não achado · 2 em dobro');
  });

  it('na primeira vez, o Portainer vale: a praça pela opção do campo Praça, a sessão escrita de outro jeito, e o id que o nome não acharia fica à mão', () => {
    const pracas = pracasDaConfiguracao({ TRELLO_PRACAS: 'G5=oG5,RJ=oRJ' });
    const env = { TRELLO_FILMES_PRACA: 'oRJ', TRELLO_LISTA_FILMES: 'lSP', TRELLO_FILMES_ETIQUETAS: 'eFilme', TRELLO_FILMES_ETIQUETAS_SESSAO: 'SUPERCINE=eSuper,CORUJAO=eTarde,Intercine=eFilme' };
    const salvo = filmesDaConfiguracao(env, { pracas, sessoes: SESSOES });
    expect(salvo.praca).toBe('RJ');
    // a sessão que não está no cadastro fica no fim, com a etiqueta dela
    expect(salvo.sessoes.map((s) => `${s.nome}=${s.etiqueta}`)).toEqual(['Supercine=eSuper', 'Corujão=eTarde', 'Sessão da Tarde=', 'Tela Quente=', 'Intercine=eFilme']);
    const c = ligarOsFilmesPeloNome(salvo, QUADRO, { primeiraVez: true });
    expect(c.aMao).toEqual(['filmes.lista', 'filmes.sessao.CORUJAO', 'filmes.sessao.INTERCINE']);
    const e = estadoDosFilmes(c, QUADRO, pracas);
    expect(e.praca).toMatchObject({ nome: 'RJ', problema: '' });
    expect(e.resumo).toBe('5 sessões · 1 não achado · 3 à mão');
  });

  it('desfazer o à mão volta o que o nome acha; ligar à mão marca', () => {
    const c = ligarOsFilmesPeloNome({ ...vazio(), lista: 'lSP', aMao: ['filmes.lista'] }, QUADRO, { primeiraVez: false });
    expect(desfazerAMaoDosFilmes(c, QUADRO, ['filmes.lista'])).toMatchObject({ lista: 'lFilmes', aMao: [] });
    const m = ligarAMaoNosFilmes(c, 'filmes.sessao.TELA QUENTE', 'eSuper');
    expect(m.sessoes.find((s) => s.nome === 'Tela Quente')!.etiqueta).toBe('eSuper');
    expect(m.aMao).toEqual(['filmes.lista', 'filmes.sessao.TELA QUENTE']);
  });

  it('a praça que não é de nenhuma praça é exceção', () => {
    const c = ligarOsFilmesPeloNome(filmesDaConfiguracao({ TRELLO_FILMES_PRACA: 'opcaoPerdida' }, { pracas: PRACAS, sessoes: [] }), QUADRO, { primeiraVez: false });
    const e = estadoDosFilmes(c, QUADRO, PRACAS);
    expect(e.excecoes.map((l) => `${l.chave}:${l.problema}`)).toEqual(['filmes.praca:sumiu']);
    expect(e.resumo).toBe('0 sessões · sem a praça dos cards');
  });
});

describe('conferir e salvar os filmes', () => {
  const pracas = pracasDaConfiguracao({ TRELLO_PRACAS: 'G5=oG5,SP=oSP' });
  const ligado = () => ligarOsFilmesPeloNome({ ...filmesDaConfiguracao({}, { pracas, sessoes: SESSOES }), praca: 'G5' }, QUADRO, { primeiraVez: false });

  it('a lista arquivada, a etiqueta que sumiu e o número fora do limite não passam', () => {
    const errado = { ...ligado(), lista: 'lFilmesVelha', etiquetas: ['eApagada'], pausaMs: '-5', esperaMs: '500', praca: 'MG' };
    const r = conferirFilmes(errado, ligado(), QUADRO, pracas);
    expect(r.ok).toBe(false);
    expect(r.itens.filter((i) => i.tipo === 'erro')).toEqual([
      { tipo: 'erro', titulo: 'Praça dos cards', detalhe: 'não é uma das praças. Escolha uma.' },
      { tipo: 'erro', titulo: 'Lista dos cards de filme', detalhe: '"FILMES 2024" está arquivada no Trello.' },
      { tipo: 'erro', titulo: 'Etiqueta de todos', detalhe: 'a etiqueta não existe mais no quadro.' },
      { tipo: 'erro', titulo: 'Pausa entre páginas', detalhe: 'de 0 s a 10 min.' },
      { tipo: 'erro', titulo: 'Espera por página', detalhe: 'de 1 s a 30 min.' },
    ]);
  });

  it('a sessão sem etiqueta é aviso (passa); o que muda vem com os nomes do Trello', () => {
    const novo = { ...ligarAMaoNosFilmes(ligado(), 'filmes.sessao.TELA QUENTE', 'eSuper'), praca: 'SP', pausaMs: '5000' };
    const sem = { ...ligado(), sessoes: ligado().sessoes.map((s) => (s.nome === 'Corujão' ? { ...s, etiqueta: '' } : s)) };
    const r = conferirFilmes(novo, sem, QUADRO, pracas);
    expect(r.ok).toBe(true);
    expect(r.muda).toEqual([
      { oque: 'Praça dos cards de filme', antes: 'G5', depois: 'SP' },
      { oque: 'Etiqueta de Corujão', antes: '—', depois: 'CORUJAO' },
      { oque: 'Etiqueta de Tela Quente', antes: '—', depois: 'SUPERCINE (à mão)' },
      { oque: 'Pausa entre páginas', antes: '2,5 s (padrão)', depois: '5 s' },
    ]);
    const aviso = conferirFilmes(ligado(), ligado(), QUADRO, pracas).itens.filter((i) => i.tipo === 'aviso');
    expect(aviso).toEqual([{ tipo: 'aviso', titulo: 'Etiqueta de Tela Quente', detalhe: 'nada ligado: o card dessa sessão vai só com a etiqueta de todos.' }]);
  });

  it('o que vai para a configuração: a praça pela sigla, as etiquetas de cada sessão pelo nome; o card leva a opção da praça', () => {
    expect(mudancasDosFilmes(ligado())).toEqual({
      TRELLO_FILMES_PRACA: 'G5',
      TRELLO_LISTA_FILMES: 'lFilmes',
      TRELLO_FILMES_ETIQUETAS: 'eFilme',
      TRELLO_FILMES_ETIQUETAS_SESSAO: 'Supercine=eSuper,Corujão=eCoruja,Sessão da Tarde=eTarde',
      FILMES_INTERVALO_MS: '',
      FILMES_TEMPO_MS: '',
    });
    expect(opcaoDaPracaDosFilmes('G5', pracas)).toBe('oG5');
    // o id de opção do Portainer de hoje continua valendo
    expect(opcaoDaPracaDosFilmes('oSP', pracas)).toBe('oSP');
  });
});
