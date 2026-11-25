import { afterEach, describe, expect, it, vi } from 'vitest';
import { lerDoServidor } from '../src/dados/armazenamento';
import { partesDaClaquete, sortearVariante, VARIANTES } from '../src/ui/linkQuebrado';

/** O servidor responde com este status e corpo, ou a rede cai (null). */
const responder = (status: number | null, corpo: unknown = {}) =>
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (status === null) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
  }));

describe('link quebrado: o que a leitura do roteiro diz', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('o roteiro que existe vem inteiro', async () => {
    responder(200, { id: 'rota-sabor-01', meta: { claquete: 'Rota do Sabor 20/11' } });
    expect(await lerDoServidor('rota-sabor-01')).toMatchObject({ estado: 'ok', roteiro: { id: 'rota-sabor-01' } });
  });

  it('410 é apagado, com a lápide (e a versão nova, se houver)', async () => {
    responder(410, { claquete: 'Rota do Sabor 20/11', por: 'Marina Lopes', em: '2026-11-24T13:00:00Z', substituto: 'rota-sabor-v2' });
    expect(await lerDoServidor('rota-sabor-01')).toEqual({
      estado: 'apagado',
      lapide: { claquete: 'Rota do Sabor 20/11', por: 'Marina Lopes', em: '2026-11-24T13:00:00Z', substituto: 'rota-sabor-v2' },
    });
  });

  it('410 sem os dados é apagado sem lápide', async () => {
    responder(410, { erro: 'Apagado.' });
    expect(await lerDoServidor('rota-sabor-01')).toEqual({ estado: 'apagado' });
  });

  it('403 é sem permissão; 404 e 400 são "não existe"', async () => {
    responder(403);
    expect(await lerDoServidor('segredo-0001')).toEqual({ estado: 'sem-permissao' });
    responder(404);
    expect(await lerDoServidor('nunca-existiu')).toEqual({ estado: 'nao-existe' });
    responder(400);
    expect(await lerDoServidor('x')).toEqual({ estado: 'nao-existe' });
  });

  it('a rede caída e o erro do servidor são "erro", não "apagado"', async () => {
    responder(null);
    expect((await lerDoServidor('rota-sabor-01')).estado).toBe('erro');
    responder(502);
    expect((await lerDoServidor('rota-sabor-01')).estado).toBe('erro');
  });
});

describe('link quebrado: o sorteio da variante', () => {
  it('nunca repete a última', () => {
    for (const ultima of VARIANTES) for (let i = 0; i < 20; i++) expect(sortearVariante(ultima)).not.toBe(ultima);
  });

  it('sem a última, qualquer uma das três pode sair', () => {
    expect(new Set([0, 0.5, 0.99].map((x) => sortearVariante(null, () => x)))).toEqual(new Set(VARIANTES));
  });
});

describe('link quebrado: a claquete na lousa', () => {
  it('separa o nome (o que se busca na fila) da data', () => {
    expect(partesDaClaquete('Rota do Sabor 20/11')).toEqual({ nome: 'Rota do Sabor', data: '20/11' });
    expect(partesDaClaquete('Chef(Fut)3/11 Rede')).toEqual({ nome: 'Chef(Fut)', data: '3/11' });
    expect(partesDaClaquete('Vinheta Fim de Ano')).toEqual({ nome: 'Vinheta Fim de Ano', data: '' });
  });
});
