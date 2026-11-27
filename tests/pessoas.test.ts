import { describe, expect, it } from 'vitest';
import { administradoresDaTela, ehAdministrador, juntarNaProducao, novidadesDaProducao, porAdministrador, separarPessoas, tirarAdministrador } from '../src/modelo/pessoas';

/* A seção Pessoas (#77), pelas funções puras: quem entrou e quem saiu (os designers que aparecem na produção da arte
   do Teable × a tabela designers; nada do Trello, ADR 0006) e os administradores (a chave-mestra do Portainer e o
   salvo na tela). Nomes e ids fictícios. */

const naProducao = (nome: string) => ({ nome, ultima: '2026-11-20T12:00:00.000Z' });
const designer = (registro: string, nome: string, idNoTrello: string, ativo = true, email = '', criadoEm: string | null = null) => ({ registro, nome, idNoTrello, ativo, email, criadoEm });
const DESDE = Date.parse('2026-09-27T00:00:00.000Z');

describe('quem entrou e quem saiu, pela produção da arte', () => {
  it('entrou: quem aparece na produção e não está na tabela; saiu: o designer ativo sem nenhuma produção nos últimos dias', () => {
    const producao = [naProducao('Ana Prado'), naProducao('Bruno Sá'), naProducao('Caio Reis')];
    const designers = [designer('r1', 'Ana Prado', 'm1'), designer('r3', 'Caio Reis', ''), designer('r4', 'Duda Lima', 'm4', true, 'duda@empresa.com'), designer('r5', 'Eva Luz', 'm5', false)];
    expect(novidadesDaProducao(producao, designers, { desde: DESDE })).toEqual([
      { chave: 'entrou:BRUNO SA', tipo: 'entrou', nome: 'Bruno Sá', email: '', membro: '', vezes: 1 },
      { chave: 'saiu:r4', tipo: 'saiu', nome: 'Duda Lima', email: 'duda@empresa.com', membro: 'm4', registro: 'r4' },
    ]);
  });

  it('pelo nome sem caixa e acento; o inativo que voltou à produção não é novidade; o cadastrado há pouco ainda não saiu', () => {
    const producao = [naProducao('JOÃO NEVES'), naProducao('Eva Luz')];
    const designers = [designer('r1', 'Joao Neves', ''), designer('r2', 'Fábio Dias', ''), designer('r5', 'Eva Luz', 'm5', false), designer('r6', 'Gil Novo', '', true, '', '2026-11-25T10:00:00.000Z')];
    expect(novidadesDaProducao(producao, designers, { desde: DESDE })).toEqual([{ chave: 'saiu:r2', tipo: 'saiu', nome: 'Fábio Dias', email: '', membro: '', registro: 'r2' }]);
  });
});

describe('cada pessoa uma vez: o campo dos designers separado (#176)', () => {
  it('dois e três nomes juntados pela vírgula viram pessoas', () => {
    expect(separarPessoas('Ana Prado, Bruno Sá')).toEqual(['Ana Prado', 'Bruno Sá']);
    expect(separarPessoas('Ana Prado, Bruno Sá, Caio Reis')).toEqual(['Ana Prado', 'Bruno Sá', 'Caio Reis']);
  });

  it('o "e" e o ponto e vírgula também separam; o hífen do nome não', () => {
    expect(separarPessoas('Ana Prado, Bruno Sá e Caio Reis')).toEqual(['Ana Prado', 'Bruno Sá', 'Caio Reis']);
    expect(separarPessoas('Ana Prado; Jean-Luc Dias E Caio Reis')).toEqual(['Ana Prado', 'Jean-Luc Dias', 'Caio Reis']);
    // o "e" dentro de um nome (Elisa, Teles) não separa
    expect(separarPessoas('Elisa Teles')).toEqual(['Elisa Teles']);
  });

  it('sem os espaços a mais, e o vazio fica de fora', () => {
    expect(separarPessoas('  Ana   Prado ,Bruno  Sá ;; , ')).toEqual(['Ana Prado', 'Bruno Sá']);
    expect(separarPessoas('')).toEqual([]);
    expect(separarPessoas(null)).toEqual([]);
  });

  it('a lista (o campo de lista ou de link) também passa, e cada pessoa aparece uma vez, sem caixa e acento', () => {
    expect(separarPessoas(['Ana Prado', 'Bruno Sá'])).toEqual(['Ana Prado', 'Bruno Sá']);
    expect(separarPessoas(['Ana Prado, Bruno Sá', 'ANA PRADO', 'bruno sa'])).toEqual(['Ana Prado', 'Bruno Sá']);
  });

  it('as repetidas da produção se juntam: a entrada mais recente, a grafia dela e quantas vezes apareceu', () => {
    const lidos = [
      { nome: 'Ana Prado, Bruno Sá', ultima: '2026-11-20T12:00:00.000Z' },
      { nome: 'Bruno Sa e Ana Prado', ultima: '2026-11-22T12:00:00.000Z' },
      { nome: 'ANA PRADO; Caio Reis', ultima: '2026-11-21T12:00:00.000Z' },
      { nome: 'Caio Reis', ultima: null },
    ];
    expect(juntarNaProducao(lidos)).toEqual([
      { nome: 'Ana Prado', ultima: '2026-11-22T12:00:00.000Z', vezes: 3 },
      { nome: 'Bruno Sa', ultima: '2026-11-22T12:00:00.000Z', vezes: 2 },
      { nome: 'Caio Reis', ultima: '2026-11-21T12:00:00.000Z', vezes: 2 },
    ]);
  });

  it('quem já está cadastrado não é novidade, mesmo vindo junto com outro nome', () => {
    const producao = [naProducao('Ana Prado, Bruno Sá, Caio Reis'), naProducao('Bruno Sá, Ana Prado'), naProducao('Caio Reis e Bruno Sá')];
    const designers = [designer('r1', 'Ana Prado', 'm1'), designer('r3', 'CAIO REIS', '')];
    expect(novidadesDaProducao(producao, designers, { desde: DESDE })).toEqual([{ chave: 'entrou:BRUNO SA', tipo: 'entrou', nome: 'Bruno Sá', email: '', membro: '', vezes: 3 }]);
  });

  it('o designer que só aparecia junto com outro nome não "saiu"', () => {
    const designers = [designer('r1', 'Ana Prado', 'm1'), designer('r2', 'Bruno Sá', 'm2')];
    expect(novidadesDaProducao([naProducao('Ana Prado, Bruno Sá')], designers, { desde: DESDE })).toEqual([]);
  });
});

describe('os administradores', () => {
  const env = { CADASTRO_ADMINS: 'Chefe@Empresa.com, outra@empresa.com', ADMINISTRADORES: '["ana@empresa.com"]' };

  it('a chave-mestra do Portainer e o salvo na tela; o resto não', () => {
    expect(ehAdministrador('chefe@empresa.com', env)).toBe(true);
    expect(ehAdministrador('ANA@empresa.com', env)).toBe(true);
    expect(ehAdministrador('bia@empresa.com', env)).toBe(false);
    expect(ehAdministrador('', env)).toBe(false);
    expect(ehAdministrador('ana@empresa.com', { CADASTRO_ADMINS: 'chefe@empresa.com' })).toBe(false);
  });

  it('a lista da tela: a chave-mestra marcada, com o nome de quem já entrou no PROMeiro', () => {
    const usuarios = [{ email: 'ana@empresa.com', nome: 'Ana Prado' }];
    expect(administradoresDaTela(env, usuarios)).toEqual([
      { email: 'ana@empresa.com', nome: 'Ana Prado', mestra: false },
      { email: 'chefe@empresa.com', nome: '', mestra: true },
      { email: 'outra@empresa.com', nome: '', mestra: true },
    ]);
  });

  it('pôr: o e-mail limpo, sem repetir; o que não é e-mail é recusado', () => {
    expect(porAdministrador(env, ' Bia@Empresa.com ')).toEqual({ salvos: ['ana@empresa.com', 'bia@empresa.com'] });
    expect(porAdministrador(env, 'ana@empresa.com')).toEqual({ salvos: ['ana@empresa.com'] });
    expect(porAdministrador(env, 'bia')).toEqual({ erro: 'Escreva um e-mail.' });
  });

  it('tirar: ninguém tira a si mesmo, e a chave-mestra só sai pelo Portainer', () => {
    expect(tirarAdministrador(env, 'ana@empresa.com', 'chefe@empresa.com')).toEqual({ salvos: [] });
    expect(tirarAdministrador(env, 'ana@empresa.com', 'ana@empresa.com')).toEqual({ erro: 'Não dá para tirar você mesmo.' });
    expect(tirarAdministrador(env, 'outra@empresa.com', 'chefe@empresa.com')).toEqual({ erro: 'outra@empresa.com está no CADASTRO_ADMINS do Portainer (chave-mestra): só sai por lá.' });
  });
});
