// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { keysSemCadastro } from '../servidor/app.mjs';

const programas = [
  { nome: 'Sessão da Tarde', chaves: ['S.TARDE', 'S TARDE'] },
  { nome: 'Roque Santeiro', chaves: [] },
  { nome: 'Vertical', chaves: ['VERTICAL'] },
  { nome: 'Chef de Alto Nível', chaves: ['CHEF'] },
  { nome: 'Lollapalooza', chaves: ['LOLLAPALOOZA'] },
];
const c = (claquete: string, em = '2026-11-01') => ({ claquete, em });

describe('keys sem cadastro', () => {
  it('agrupa as claquetes não reconhecidas pela key, com contagem, exemplos (os mais novos) e sugestão', () => {
    const r = keysSemCadastro(
      [c('STARDE 25/11', '2026-11-20'), c('STARDE 21/11 RIO', '2026-11-18'), c('STARDE 2/11', '2026-11-01'), c('CHEF(MANUT) C'), c('ROQUE 23/10'), c('ROQUE(CAPITULO) 30/10', '2026-10-30'), c('TARJAS VERT DOMINGO'), c('UPFRONT(ABERTURA) 2/12'), c('12/11')],
      programas,
    );
    expect(r.map((x: { key: string }) => x.key)).toEqual(['STARDE', 'ROQUE', 'TARJAS VERT DOMINGO', 'UPFRONT']);
    expect(r[0]).toEqual({ key: 'STARDE', roteiros: 3, exemplos: ['STARDE 25/11', 'STARDE 21/11 RIO'], sugestao: 'Sessão da Tarde' });
    expect(r.find((x: { key: string }) => x.key === 'ROQUE').sugestao).toBe('Roque Santeiro');
    expect(r.find((x: { key: string }) => x.key === 'TARJAS VERT DOMINGO').sugestao).toBe('Vertical');
    expect(r.find((x: { key: string }) => x.key === 'UPFRONT').sugestao).toBe('');
  });
  it('reconhece a key mesmo com a praça na frente da claquete', () => {
    const comKeys = [...programas, { nome: 'Futebol', chaves: ['FUT'] }, { nome: 'Roque Santeiro', chaves: ['ROQUE'] }];
    expect(keysSemCadastro([c('Rio Fut(Brasileirao)21/11'), c('Rio Roque (Pilula) 10'), c('Rio Roque(Pilula)15'), c('Fut(Brasileirao)21/11 SP'), c('Roque SP')], comKeys)).toEqual([]);
  });
  it('as ignoradas não voltam', () => {
    expect(keysSemCadastro([c('UPFRONT 2/12')], programas, new Set(['UPFRONT']))).toEqual([]);
  });
});
