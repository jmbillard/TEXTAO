import { describe, expect, it } from 'vitest';
import { administradoresDaTela, ehAdministrador, novidadesDoQuadro, porAdministrador, tirarAdministrador } from '../src/modelo/pessoas';

/* A seção Pessoas (#77), pelas funções puras: quem entrou e quem saiu do quadro (os membros do Trello × a tabela
   designers do Teable) e os administradores (a chave-mestra do Portainer e o salvo na tela). Nomes e ids fictícios. */

const membro = (id: string, nome: string, email = '') => ({ id, nome, email });
const designer = (registro: string, nome: string, idNoTrello: string, ativo = true, email = '') => ({ registro, nome, idNoTrello, ativo, email });

describe('quem entrou e quem saiu do quadro', () => {
  it('entrou: o membro que não está na tabela; saiu: o designer ativo que não está mais no quadro', () => {
    const membros = [membro('m1', 'Ana Prado'), membro('m2', 'Bruno Sá', 'bruno@empresa.com'), membro('m3', 'Caio Reis')];
    const designers = [designer('r1', 'Ana Prado', 'm1'), designer('r3', 'Caio R.', 'm3'), designer('r4', 'Duda Lima', 'm4'), designer('r5', 'Eva Luz', 'm5', false)];
    expect(novidadesDoQuadro(membros, designers)).toEqual([
      { chave: 'entrou:m2', tipo: 'entrou', nome: 'Bruno Sá', email: 'bruno@empresa.com', membro: 'm2' },
      { chave: 'saiu:r4', tipo: 'saiu', nome: 'Duda Lima', email: '', membro: 'm4', registro: 'r4' },
    ]);
  });

  it('o designer sem o id do Trello conta pelo nome (sem caixa e acento); o inativo de volta ao quadro não é novidade', () => {
    const membros = [membro('m1', 'JOÃO NEVES'), membro('m5', 'Eva Luz')];
    const designers = [designer('r1', 'Joao Neves', ''), designer('r2', 'Fábio Dias', ''), designer('r5', 'Eva Luz', 'm5', false)];
    expect(novidadesDoQuadro(membros, designers)).toEqual([{ chave: 'saiu:r2', tipo: 'saiu', nome: 'Fábio Dias', email: '', membro: '', registro: 'r2' }]);
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
