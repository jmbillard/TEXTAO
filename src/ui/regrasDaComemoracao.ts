/* A comemoração do Sem cadastro zerado: as regras puras (quando dispara, as tiras do confete, a linha do número).
   A cena desenhada fica em Comemoracao.tsx. */

/** Uma linha do Sem cadastro: a key e as claquetes de exemplo dela. */
export interface LinhaDoSem {
  key: string;
  exemplos: string[];
}

/**
 * A comemoração dispara quando o que sai agora (as keys que a pessoa acabou de cadastrar ou ligar nesta tela) leva
 * a última linha que ainda aparece no Sem cadastro. Devolve os exemplos dessas linhas, que viram as tiras
 * destacadas; chame antes de tirar as linhas da lista. Null quando não dispara.
 * @param visiveis as linhas que aparecem agora (sem as que esperam o desfazer do ignorar, sem filtro de busca)
 * @param saem as keys que saem, já no formato das linhas
 */
export function festaDoSemCadastro(visiveis: readonly LinhaDoSem[], saem: readonly string[]): { destacadas: string[] } | null {
  if (!visiveis.length || !visiveis.every((l) => saem.includes(l.key))) return null;
  return { destacadas: visiveis.flatMap((l) => l.exemplos) };
}

/** Uma tira de papel do confete: uma claquete. As destacadas (as que acabaram de ganhar atração) voam por cima. */
export interface Tira {
  texto: string;
  destacada: boolean;
}

/** As tiras do confete: as destacadas primeiro, depois as comuns, sem repetir claquete, até o limite. */
export function montarTiras(destacadas: readonly string[], comuns: readonly string[], limite = 16): Tira[] {
  const vistas = new Set<string>();
  const tiras: Tira[] = [];
  const por = (lista: readonly string[], destacada: boolean) => {
    for (const bruto of lista) {
      const texto = bruto.trim();
      if (!texto || vistas.has(texto) || tiras.length >= limite) continue;
      vistas.add(texto);
      tiras.push({ texto, destacada });
    }
  };
  por(destacadas, true);
  por(comuns, false);
  return tiras;
}

/** A linha de baixo do Sem cadastro zerado, em três pedaços (o número vai em destaque). */
export function linhaDoTotal(total: number): { antes: string; numero: string; depois: string } {
  if (total <= 0) return { antes: '', numero: 'Nenhuma', depois: ' claquete nos últimos 90 dias.' };
  const numero = total.toLocaleString('pt-BR');
  return total === 1
    ? { antes: 'A ', numero, depois: ' claquete dos últimos 90 dias tem atração.' }
    : { antes: 'As ', numero, depois: ' claquetes dos últimos 90 dias têm atração.' };
}
