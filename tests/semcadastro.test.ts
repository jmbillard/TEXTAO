// @vitest-environment node
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, keysSemCadastro, semCadastro, sugerirAtracao } from '../servidor/app.mjs';

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
    expect(keysSemCadastro([c('Rio Fut(Brasileirao)21/11'), c('Rio Roque (Pilula) 10'), c('Rio Roque(Pilula)15'), c('Fut(Brasileirao)21/11 SP'), c('Roque SP'), c('Rio(Chef)manut_')], comKeys)).toEqual([]);
  });
  it('sugere a atração parecida para uma key (o balão de ligar usa a mesma regra)', () => {
    expect(sugerirAtracao('ROQUE', programas)).toBe('Roque Santeiro');
    expect(sugerirAtracao('STARDE', programas)).toBe('Sessão da Tarde');
    expect(sugerirAtracao('UPFRONT', programas)).toBe('');
  });
  it('as ignoradas não voltam', () => {
    expect(keysSemCadastro([c('UPFRONT 2/12')], programas, new Set(['UPFRONT']))).toEqual([]);
  });
});

describe('as claquetes reconhecidas (a comemoração do Sem cadastro zerado)', () => {
  it('conta cada claquete reconhecida uma vez só, mesmo na fila e na produção, e devolve as mais recentes', () => {
    const r = semCadastro(
      [
        c('CHEF 25/12-2', '2026-11-10'),
        c(' CHEF 25/12-2 ', '2026-11-22'), // a mesma claquete, na produção, mais nova
        c('Sessão da Tarde 19/11', '2026-11-19'),
        c('VERTICAL(TEASER) 3/12', '2026-11-24'),
        c('UPFRONT 2/12', '2026-11-25'), // sem atração: fica no Sem cadastro, fora do total
      ],
      programas,
    );
    expect(r.keys.map((k: { key: string }) => k.key)).toEqual(['UPFRONT']);
    expect(r.reconhecidas).toEqual({ total: 3, amostra: ['VERTICAL(TEASER) 3/12', 'CHEF 25/12-2', 'Sessão da Tarde 19/11'] });
  });
  it('a amostra para nas 20 mais recentes; o total conta todas', () => {
    const muitas = Array.from({ length: 25 }, (_, i) => c(`CHEF ${i + 1}/12`, `2026-11-${String(i + 1).padStart(2, '0')}`));
    const r = semCadastro(muitas, programas);
    expect(r.reconhecidas.total).toBe(25);
    expect(r.reconhecidas.amostra).toHaveLength(20);
    expect(r.reconhecidas.amostra[0]).toBe('CHEF 25/12');
    expect(r.reconhecidas.amostra[19]).toBe('CHEF 6/12');
  });
  it('as claquetes das keys ignoradas não contam', () => {
    const r = semCadastro([c('UPFRONT 2/12'), c('CHEF 1/12')], programas, new Set(['UPFRONT']));
    expect(r).toEqual({ keys: [], reconhecidas: { total: 1, amostra: ['CHEF 1/12'] } });
  });
});

describe('a rota do Sem cadastro', () => {
  it('sem pedir, continua a lista de keys; com ?com=reconhecidas, vêm as keys e as reconhecidas', async () => {
    // sem Teable, nenhuma atração: as claquetes da produção (o Trello de mentira) ficam todas no Sem cadastro
    const trello = { claquetesRecentes: async () => [c('UPFRONT 2/12', '2026-11-24'), c('UPFRONT 3/12', '2026-11-25')] };
    const app = criarApp({ db: abrirBanco(':memory:'), env: {}, trello });
    const s = createServer(app);
    await new Promise<void>((ok) => s.listen(0, ok));
    const url = `http://localhost:${(s.address() as { port: number }).port}/api/cadastros/sem-cadastro`;
    const pedir = (q = '') => fetch(url + q, { headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com' } }).then((r) => r.json());
    try {
      const keys = [{ key: 'UPFRONT', roteiros: 2, exemplos: ['UPFRONT 3/12', 'UPFRONT 2/12'], sugestao: '' }];
      expect(await pedir()).toEqual(keys);
      expect(await pedir('?com=reconhecidas')).toEqual({ keys, reconhecidas: { total: 0, amostra: [] } });
    } finally {
      s.close();
    }
  });
});
