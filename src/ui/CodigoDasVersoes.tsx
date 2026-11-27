import { useSyncExternalStore } from 'react';
import { assinarPreferencias, codigoDasVersoesLigado } from '../dados/armazenamento';
import { leituraDasVersoes, lerVersoes, type Versao } from '../modelo/pauta';
import { sufixoDasVersoes, type FonteDasVersoes } from '../modelo/versoesDoRoteiro';
import './codigoDasVersoes.css';

/* As versões da chamada em todo o PROMeiro (#152): o código no padrão é um sufixo opcional colado no fim do nome, uma
   vez só ("CHAMADA_CODIGO_27/11 (AH)"), que cada pessoa liga ou desliga no menu do perfil ("Mostrar o código das
   versões"). O que ele quer dizer e de onde veio ficam na dica ao passar o mouse. Nunca há etiqueta embaixo do nome. */

/** De onde vieram as versões: no fim da dica do código. */
export const DE_ONDE: Record<FonteDasVersoes, string> = {
  mao: 'feitas à mão no apelido',
  apelido: 'do código do apelido',
  claquete: 'do código da claquete',
  roteiro: 'das artes do roteiro',
};

/** A opção "Mostrar o código das versões" da pessoa: redesenha quando ela muda, em qualquer tela. */
export function useCodigoDasVersoes(): boolean {
  return useSyncExternalStore(assinarPreferencias, codigoDasVersoesLigado, codigoDasVersoesLigado);
}

/** A dica do código: o que ele quer dizer e de onde veio; o desconhecido e o "?" a conferir dizem o que são. */
export function dicaDasVersoes(versoes: readonly Versao[], de?: string): string {
  const desconhecido = versoes.some((v) => !v.conhecida);
  if (desconhecido) return `código ${versoes.map((v) => v.codigo).join('')}: o PROMeiro não conhece`;
  const aConferir = versoes.some((v) => v.aConferir);
  return `${leituraDasVersoes(versoes)}${de ? `, ${de}` : ''}${aConferir ? '. O roteiro diz só o dia da semana: confira se é "nesta" ou "próxima"' : ''}`;
}

/**
 * O sufixo das versões, colado no fim do nome: o código no padrão, com o "?" da leitura só pelo dia da semana e o código
 * desconhecido cru. Com a opção desligada, ou sem versão, nada.
 * @param de de onde veio, no fim da dica ("das artes do roteiro", "da claquete")
 */
export function SufixoDasVersoes({ versoes, de }: { versoes: readonly Versao[]; de?: string }) {
  const ligado = useCodigoDasVersoes();
  const sufixo = sufixoDasVersoes(versoes);
  if (!ligado || !sufixo) return null;
  const desconhecido = versoes.some((v) => !v.conhecida);
  return (
    <span className={`sufixo-versoes${desconhecido ? ' desconhecido' : ''}`} title={dicaDasVersoes(versoes, de)}>
      {' '}
      {sufixo}
    </span>
  );
}

/** O nome sem o código que ele já traz no fim e, com a opção ligada, o sufixo das versões: o código aparece uma vez só. */
export function NomeComVersoes({ nome, versoes, de }: { nome: string; versoes: readonly Versao[]; de?: string }) {
  return (
    <>
      {lerVersoes(nome, '').semVersao}
      <SufixoDasVersoes versoes={versoes} de={de} />
    </>
  );
}
