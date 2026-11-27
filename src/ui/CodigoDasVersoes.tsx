import { codigoDasVersoes, leituraDasVersoes, type Versao } from '../modelo/pauta';
import './codigoDasVersoes.css';

/* As versões da chamada em todo o PROMeiro: só o código no padrão, uma etiqueta discreta por claquete ("(AH)",
   "(PNAH)", "(MNT)"). O que ele quer dizer e de onde veio ficam na dica ao passar o mouse. */

/**
 * O código das versões numa etiqueta. A versão que veio só do dia da semana (as lidas do roteiro, "SÁBADO, 22H") leva
 * um "?" depois do código: a pessoa confere se é "nesta" ou "próxima". O código desconhecido aparece cru, tracejado.
 * @param de de onde veio, no fim da dica ("das artes do roteiro", "da claquete")
 */
export function CodigoDasVersoes({ versoes, de }: { versoes: readonly Versao[]; de?: string }) {
  const codigo = codigoDasVersoes(versoes);
  if (!codigo) return null;
  const desconhecido = versoes.some((v) => !v.conhecida);
  const aConferir = !desconhecido && versoes.some((v) => v.aConferir);
  const dica = desconhecido
    ? `código ${versoes.map((v) => v.codigo).join('')}: o PROMeiro não conhece`
    : `${leituraDasVersoes(versoes)}${de ? `, ${de}` : ''}${aConferir ? '. O roteiro diz só o dia da semana: confira se é "nesta" ou "próxima"' : ''}`;
  return (
    <span className={`codigo-versoes${desconhecido ? ' desconhecido' : ''}${aConferir ? ' a-conferir' : ''}`} title={dica}>
      {codigo}
      {aConferir && '?'}
    </span>
  );
}
