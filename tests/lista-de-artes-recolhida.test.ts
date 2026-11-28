// @vitest-environment node
/* A lista das artes que recolhe (a da folha de escrita e a da revisão): a escolha é da pessoa, guardada nas
   preferências (/api/eu/preferencias), em qualquer aparelho; o servidor confere a chave. E-mails inventados. */
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
import { CHAVE_DA_LISTA_DE_ARTES, listaDeArtesRecolhida, recusaDaListaDeArtes } from '../src/modelo/listaDeArtes';
import { createServer } from 'node:http';

describe('a regra da lista das artes recolhida', () => {
  it('sem escolha, aberta; só true recolhe', () => {
    expect(listaDeArtesRecolhida({})).toBe(false);
    expect(listaDeArtesRecolhida(undefined)).toBe(false);
    expect(listaDeArtesRecolhida({ [CHAVE_DA_LISTA_DE_ARTES]: true })).toBe(true);
    expect(listaDeArtesRecolhida({ [CHAVE_DA_LISTA_DE_ARTES]: 'sim' })).toBe(false);
  });
  it('só aceita true ou false', () => {
    expect(recusaDaListaDeArtes(true)).toBeNull();
    expect(recusaDaListaDeArtes(false)).toBeNull();
    expect(recusaDaListaDeArtes('true')).toMatch(/recolhida/);
    expect(recusaDaListaDeArtes(null)).toMatch(/recolhida/);
  });
});

describe('a lista das artes recolhida nas preferências da pessoa', () => {
  async function subir() {
    const app = criarApp({ db: abrirBanco(':memory:'), env: {} });
    const servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
      fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' } });
    const parar = async () => {
      await app.fechar?.();
      await new Promise<void>((ok) => servidor.close(() => ok()));
    };
    return { como, parar };
  }

  it('cada pessoa recolhe a dela, e um valor que não é true nem false é recusado sem mudar nada', async () => {
    const { como, parar } = await subir();
    try {
      const ana = como('ana.lima@empresa.com');
      const beto = como('beto.reis@empresa.com');
      const lembrar = (valor: unknown) => ana('/api/eu/preferencias', { method: 'PUT', body: JSON.stringify({ [CHAVE_DA_LISTA_DE_ARTES]: valor }) });
      const prefs = async (quem: typeof ana) => ((await (await quem('/api/eu')).json()) as { preferencias?: Record<string, unknown> }).preferencias ?? {};

      expect((await lembrar(true)).status).toBe(200);
      expect((await prefs(ana))[CHAVE_DA_LISTA_DE_ARTES]).toBe(true);
      // a do Beto continua sem escolha (aberta)
      expect(listaDeArtesRecolhida(await prefs(beto))).toBe(false);

      const ruim = await lembrar('recolhida');
      expect(ruim.status).toBe(400);
      expect(((await ruim.json()) as { erro: string }).erro).toMatch(/recolhida/);
      expect((await prefs(ana))[CHAVE_DA_LISTA_DE_ARTES]).toBe(true);

      expect((await lembrar(false)).status).toBe(200);
      expect(listaDeArtesRecolhida(await prefs(ana))).toBe(false);
    } finally {
      await parar();
    }
  });
});
