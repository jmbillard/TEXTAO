import { describe, expect, it } from 'vitest';
import { acharPrograma, registrarVocabulario } from '../src/modelo/vocabularios';

describe('atração pela claquete', () => {
  registrarVocabulario({
    programas: [
      { nome: 'Chef de Alto Nível', chaves: ['CHEF'], categoria: 'PROGRAMAS' },
      { nome: 'Quem Ama Cuida', chaves: ['QUEM AMA'], categoria: 'NOVELAS' },
      { nome: 'Coração Acelerado', chaves: ['CORACAO'], categoria: 'NOVELAS' },
      { nome: 'Futebol', chaves: ['FUT'], categoria: 'ESPORTES' },
    ],
  } as never);
  it('a key do começo decide; o que vem nos parênteses é detalhe', () => {
    expect(acharPrograma('CHEF(QUEM AMA)17-11')?.nome).toBe('Chef de Alto Nível');
    expect(acharPrograma('CHEF(MANUT) C')?.nome).toBe('Chef de Alto Nível');
    expect(acharPrograma('Coracao(Elenco)12/1')?.nome).toBe('Coração Acelerado');
    expect(acharPrograma('QUEM AMA 12/3 REDE')?.nome).toBe('Quem Ama Cuida');
  });
  it('a key vale depois da praça do Rio', () => {
    expect(acharPrograma('Rio Fut(Brasileirao)21/11')?.nome).toBe('Futebol');
    expect(acharPrograma('Rio Coracao (Pilula) 10')?.nome).toBe('Coração Acelerado');
  });
  it('o SP no fim não atrapalha', () => {
    expect(acharPrograma('Fut(Brasileirao)21/11 SP')?.nome).toBe('Futebol');
    expect(acharPrograma('Coracao SP')?.nome).toBe('Coração Acelerado');
    expect(acharPrograma('CHEF(MANUT) C SP')?.nome).toBe('Chef de Alto Nível');
  });
  it('sem key no começo, ainda acha o nome no meio do texto', () => {
    expect(acharPrograma('Chamada especial Quem Ama Cuida hoje')?.nome).toBe('Quem Ama Cuida');
  });
});

// @ts-expect-error módulo JS sem tipos
import { criarVocabulario } from '../servidor/vocabulario.mjs';

describe('vocabulário pelo Postgres', () => {
  it('monta as atrações com as keys (pattern) e a categoria, sem passar pela API', async () => {
    const env = { TEABLE_URL: 'http://teable', TEABLE_TOKEN: 't', TEABLE_ATRACOES: 'tblKey', TEABLE_PG_URL: 'pg', TEABLE_PG_ESQUEMA: 'bse', TEABLE_PG_ATRACOES: 'atracoes', TEABLE_PG_REDATORES: 'redatores' };
    const api: string[] = [];
    const buscar = async (u: string) => (api.push(u), { ok: false, status: 403, json: async () => ({}) });
    const consultar = async (sql: string) =>
      sql.includes('"atracoes"')
        ? [{ atracao: 'Em Família com Eliana', categoria: 'PROGRAMAS', pattern: [{ id: 'k1', title: 'ELIANA' }] }, { atracao: 'Chef de Alto Nível', categoria: null, pattern: '[{"id":"k2","title":"CHEF"}]' }]
        : [{ redator: 'Guilherme Heizer' }];
    const v = criarVocabulario(env, buscar, null, null, consultar);
    const r = await v.ler();
    expect(r.programas).toEqual([
      { nome: 'Chef de Alto Nível', chaves: ['CHEF'] },
      { nome: 'Em Família com Eliana', chaves: ['ELIANA'], categoria: 'PROGRAMAS' },
    ]);
    expect(r.redatores).toEqual(['Guilherme Heizer']);
    expect(api.filter((u) => u.includes('tblKey'))).toHaveLength(0); // as keys não foram pela API
  });
});
