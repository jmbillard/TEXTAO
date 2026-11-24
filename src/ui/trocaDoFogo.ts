import type { Complexidade } from '../modelo/exportar';

/*
  A troca de nível do fogo, como camadas sobrepostas no mesmo lugar: o desenho velho sai, crescendo ou encolhendo até
  o tamanho aparente do novo, enquanto o novo entra a partir do tamanho do velho (troca cruzada, a partir do chão).
  Cada camada tem uma chave estável, para o elemento continuar o mesmo do começo ao fim da troca: o tremor da chama
  não reinicia quando ela deixa de entrar e passa a ficar.
*/

/** O tamanho aparente de cada nível, em relação ao incêndio. */
const TAMANHO: Record<Complexidade, number> = { 1: 0.62, 2: 0.8, 3: 1 };

/** Quanto dura o brilho do desenho que entra (menos de um segundo; a troca cruzada, de 300 ms, cabe dentro dele). */
export const DURACAO_BRILHO = 800;

export type Camada =
  | { k: number; n: Complexidade; papel: 'fica' }
  /** `escala`: onde a camada que sai termina, ou de onde a camada que entra começa. */
  | { k: number; n: Complexidade; papel: 'sai' | 'entra'; escala: number };

export interface EstadoDoFogo {
  n: Complexidade;
  camadas: Camada[];
  proxima: number;
}

const razao = (de: Complexidade, para: Complexidade) => Math.round((TAMANHO[para] / TAMANHO[de]) * 1000) / 1000;

export function comecarFogo(n: Complexidade): EstadoDoFogo {
  return { n, camadas: [{ k: 0, n, papel: 'fica' }], proxima: 1 };
}

/** O nível mudou: a camada de agora sai e uma nova entra; a que já estava saindo some. */
export function trocarFogo(e: EstadoDoFogo, n: Complexidade): EstadoDoFogo {
  if (n === e.n) return e;
  const atual = e.camadas[e.camadas.length - 1];
  return {
    n,
    camadas: [
      { k: atual.k, n: atual.n, papel: 'sai', escala: razao(atual.n, n) },
      { k: e.proxima, n, papel: 'entra', escala: razao(n, atual.n) },
    ],
    proxima: e.proxima + 1,
  };
}

/** Passou a troca (e o brilho): fica só o desenho do nível, o mesmo elemento que entrou. */
export function acabarTroca(e: EstadoDoFogo): EstadoDoFogo {
  if (e.camadas.length === 1 && e.camadas[0].papel === 'fica') return e;
  const atual = e.camadas[e.camadas.length - 1];
  return { ...e, camadas: [{ k: atual.k, n: atual.n, papel: 'fica' }] };
}
