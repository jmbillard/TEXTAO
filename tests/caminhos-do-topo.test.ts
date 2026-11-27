/* Os caminhos do topo (#168): só os ícones, sempre na mesma ordem e no mesmo lugar; o da tela atual se abre com o
   texto, como as abas dos Cadastros. A bolinha separadora fica só antes da Pauta, e o aviso de filme para revisar vai
   no ícone dos Filmes. */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const previas = vi.hoisted(() => ({ lista: [] as { paginas: number; diasParaApagar: number | null }[] }));
vi.mock('../src/dados/armazenamento', () => ({ listarPrevias: () => Promise.resolve(previas.lista) }));

import { CaminhosDoTopo } from '../src/ui/SeletorDeArea';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let caixa: HTMLDivElement;
let raiz: Root;
beforeEach(() => {
  previas.lista = [];
  caixa = document.createElement('div');
  document.body.append(caixa);
  raiz = createRoot(caixa);
});
afterEach(() => {
  act(() => raiz.unmount());
  caixa.remove();
});

const nada = () => {};
const todos = { agenda: nada, producoes: nada, filmes: nada, pauta: nada };
type Props = Parameters<typeof CaminhosDoTopo>[0];
/** Espera os quadros da troca do aberto (para a largura animar) e a resposta da lista das prévias. */
async function quadros(ate: () => boolean = () => false) {
  for (let i = 0; i < 40 && !ate(); i++) await act(async () => new Promise((r) => setTimeout(r, 20)));
}
async function montar(props: Props) {
  await act(async () => raiz.render(createElement(CaminhosDoTopo, props)));
  await quadros(() => abertos()[0] === (props.atual ? `topo-${props.atual}` : undefined) && caixa.querySelector('nav') !== null);
  await act(async () => new Promise((r) => setTimeout(r, 30)));
}
const filhos = () => [...caixa.querySelectorAll('nav > *')].map((e) => (e.tagName === 'A' ? e.classList[0] : '•'));
function abertos() {
  return [...caixa.querySelectorAll('nav a.aberto')].map((e) => e.classList[0]);
}

describe('os caminhos do topo', () => {
  it('ficam sempre na mesma ordem, com o da tela atual no lugar e marcado', async () => {
    for (const atual of ['agenda', 'producoes', 'filmes', 'pauta'] as const) {
      await montar({ ...todos, atual });
      expect(filhos()).toEqual(['topo-agenda', 'topo-producoes', 'topo-filmes', '•', 'topo-pauta']);
      const marcados = [...caixa.querySelectorAll('nav a[aria-current="page"]')].map((e) => e.classList[0]);
      expect(marcados).toEqual([`topo-${atual}`]);
      expect(abertos()).toEqual([`topo-${atual}`]);
    }
  });

  it('a bolinha fica só antes da Pauta; sem nada antes, não há bolinha', async () => {
    await montar({ ...todos, montar: nada, atual: 'agenda' });
    expect(filhos()).toEqual(['topo-agenda', 'topo-producoes', 'topo-filmes', '•', 'topo-pauta', 'topo-montar']);
    await montar({ pauta: nada, montar: nada });
    expect(filhos()).toEqual(['topo-pauta', 'topo-montar']);
  });

  it('cada caminho tem o nome na dica e no aria-label', async () => {
    await montar({ ...todos, atual: 'producoes' });
    const as = [...caixa.querySelectorAll('nav a')];
    expect(as.map((a) => a.getAttribute('aria-label'))).toEqual(['No Trello', 'Produções', 'Filmes', 'Pauta da edição']);
    expect(as.map((a) => a.getAttribute('data-dica'))).toEqual(['No Trello', 'Produções', 'Filmes', 'Pauta da edição']);
  });

  it('o caminho que estava aberto na tela de antes se fecha, e o da tela nova se abre', async () => {
    await montar({ ...todos, atual: 'producoes' });
    act(() => raiz.unmount());
    raiz = createRoot(caixa);
    await act(async () => raiz.render(createElement(CaminhosDoTopo, { ...todos, atual: 'pauta' })));
    expect(abertos()).toEqual(['topo-producoes']);
    await quadros(() => abertos()[0] === 'topo-pauta');
    expect(abertos()).toEqual(['topo-pauta']);
  });

  it('o aviso de filme para revisar fica no ícone dos Filmes', async () => {
    previas.lista = [{ paginas: 4, diasParaApagar: null }];
    await montar({ ...todos, atual: 'agenda' });
    const filmes = caixa.querySelector('nav a.topo-filmes')!;
    expect(filmes.querySelector('.caminho-icone .caminho-aviso')).not.toBeNull();
    expect(filmes.getAttribute('aria-label')).toBe('Filmes, com filme para revisar');
    expect(filmes.getAttribute('data-dica')).toBe('Filmes: há filme esperando revisão');
    expect(caixa.querySelectorAll('.caminho-aviso')).toHaveLength(1);
  });

  it('sem filme para revisar, não há aviso', async () => {
    previas.lista = [{ paginas: 4, diasParaApagar: 30 }];
    await montar({ ...todos, atual: 'agenda' });
    expect(caixa.querySelector('.caminho-aviso')).toBeNull();
    expect(caixa.querySelector('nav a.topo-filmes')!.getAttribute('aria-label')).toBe('Filmes');
  });
});
