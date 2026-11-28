/* As regras puras do Roteiro escrito no PROMeiro (#189): quem lê e quem escreve, as abas da lista de "Roteiros" e a
   busca. Nomes inventados. */
import { describe, expect, it } from 'vitest';
import { bateComABusca, escritosDaAba, metaDoNovo, podeComecar, regraDoEscrito, tituloLimpo, tituloParaMostrar } from '../src/modelo/escrito';

const quem = (q: Partial<Parameters<typeof regraDoEscrito>[0]> = {}) => ({ autor: false, convite: null, visivel: true, coordenaOuAdministra: false, ...q });

describe('quem lê e quem escreve o roteiro sendo escrito', () => {
  it('visível: a equipe lê; escrevem o autor, a coordenação e o administrador', () => {
    expect(regraDoEscrito(quem())).toEqual({ ler: true, escrever: false });
    expect(regraDoEscrito(quem({ autor: true }))).toEqual({ ler: true, escrever: true });
    expect(regraDoEscrito(quem({ coordenaOuAdministra: true }))).toEqual({ ler: true, escrever: true });
  });

  it('fechado: só o autor e os convidados; a coordenação sem convite não vê', () => {
    expect(regraDoEscrito(quem({ visivel: false }))).toEqual({ ler: false, escrever: false });
    expect(regraDoEscrito(quem({ visivel: false, coordenaOuAdministra: true }))).toEqual({ ler: false, escrever: false });
    expect(regraDoEscrito(quem({ visivel: false, autor: true }))).toEqual({ ler: true, escrever: true });
    expect(regraDoEscrito(quem({ visivel: false, convite: 'ler' }))).toEqual({ ler: true, escrever: false });
    expect(regraDoEscrito(quem({ visivel: false, convite: 'escrever' }))).toEqual({ ler: true, escrever: true });
  });

  it('quem começa: o redator, a coordenação e o administrador', () => {
    expect(podeComecar({ redator: true, coordenacao: false, admin: false })).toBe(true);
    expect(podeComecar({ redator: false, coordenacao: true, admin: false })).toBe(true);
    expect(podeComecar({ redator: false, coordenacao: false, admin: true })).toBe(true);
    expect(podeComecar({ redator: false, coordenacao: false, admin: false })).toBe(false);
  });

  it('o roteiro novo: sem claquete, com o título limpo, o redator e o status de rascunho', () => {
    expect(tituloLimpo('  Desafio \n da   Brasa ')).toBe('Desafio da Brasa');
    expect(tituloLimpo(42)).toBe('');
    expect(metaDoNovo('Final', 'Marina Teles')).toMatchObject({ titulo: 'Final', claquete: '', redator: 'Marina Teles', status: 'rascunho' });
    expect(tituloParaMostrar({ titulo: ' ', claquete: '' })).toBe('Sem título');
    expect(tituloParaMostrar({ titulo: '', claquete: 'CHEF 3/12' })).toBe('CHEF 3/12');
  });
});

describe('a lista de "Roteiros"', () => {
  const lista = [
    { id: 'a', escrito: 'sendo-escrito' as const, meu: true },
    { id: 'b', escrito: 'sendo-escrito' as const, meu: false },
    { id: 'c', escrito: 'enviado' as const, meu: false },
  ];
  it('da equipe são os dos outros; sendo escritos e enviados, pelo estado, de todo mundo', () => {
    expect(escritosDaAba(lista, 'equipe').map((r) => r.id)).toEqual(['b', 'c']);
    expect(escritosDaAba(lista, 'sendo').map((r) => r.id)).toEqual(['a', 'b']);
    expect(escritosDaAba(lista, 'enviados').map((r) => r.id)).toEqual(['c']);
  });

  it('a busca acha pelo título, pela claquete, pela atração e por quem escreve, sem caixa nem acento', () => {
    const r = { meta: { titulo: 'Desafio da Brasa', claquete: '', programa: 'Chef do Futuro', redator: 'Marina Teles' }, dono: { nome: 'Marina Teles' } };
    expect(bateComABusca(r, '')).toBe(true);
    expect(bateComABusca(r, 'brasa')).toBe(true);
    expect(bateComABusca(r, 'DESAFIO marina')).toBe(true);
    expect(bateComABusca(r, 'futuro')).toBe(true);
    expect(bateComABusca(r, 'teles júlio')).toBe(false);
    expect(bateComABusca({ meta: { titulo: 'Ação' } }, 'acao')).toBe(true);
  });
});
