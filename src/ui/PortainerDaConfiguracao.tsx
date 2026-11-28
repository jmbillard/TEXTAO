import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { lerListaDoPortainer, type ListaDoPortainer, type VariavelDoPortainer } from '../dados/armazenamento';
import { Icone } from './icones';
import { BolinhaDeEstado, Marca } from './pecas';
import { useTelaDeCelular } from './faixa';
import './configuracao.css';

/* "Pode apagar do Portainer" (#79), a página ligada pelo rodapé da Configuração: as variáveis que o Portainer ainda
   tem, em três grupos, cada um com uma linha curta. Pode apagar (o valor já está salvo na tela, ou o PROMeiro não lê
   mais), com "Copiar os nomes"; ainda não (sem valor salvo: continuam valendo), com o porquê de cada uma; e as que
   ficam (segredos e infraestrutura). Só aparecem as que o Portainer tem com valor. */

interface Props {
  voltar: () => void;
  avisar: (texto: string) => void;
}

/** Copia o texto (a API da área de transferência, ou o jeito antigo onde ela não existe). */
async function copiar(texto: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texto);
  const area = document.createElement('textarea');
  area.value = texto;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('Não consegui copiar.');
}

export function PortainerDaConfiguracao({ voltar, avisar }: Props) {
  const celular = useTelaDeCelular();
  const [lista, setLista] = useState<ListaDoPortainer | null>(null);
  const [falha, setFalha] = useState('');
  const carregar = useCallback(() => {
    setFalha('');
    lerListaDoPortainer()
      .then(setLista)
      .catch((e) => setFalha(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(carregar, [carregar]);

  const copiarOsNomes = () => {
    if (!lista?.podeApagar.length) return;
    const n = lista.podeApagar.length;
    copiar(lista.podeApagar.map((v) => v.nome).join('\n'))
      .then(() => avisar(`${n} ${n === 1 ? 'nome copiado' : 'nomes copiados'}.`))
      .catch((e) => avisar(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className={`pagina configuracao ${celular ? 'no-celular' : ''}`}>
      <header className="cad-topo">
        <button className="voltar-cad" onClick={voltar}>
          <Icone nome="voltar" tam={16} /> Configuração
        </button>
        <Marca />
        <span />
      </header>
      <main className="cfg">
        <div className="cfg-cabeca">
          <h1>Portainer</h1>
        </div>
        {falha ? (
          <p className="cfg-falha" role="alert">
            {falha} <button className="botao-texto" onClick={carregar}>Tentar de novo</button>
          </p>
        ) : !lista ? (
          <p className="cfg-lendo">Lendo as variáveis…</p>
        ) : (
          <section className="cfg-secao cfg-port" aria-label="Variáveis do Portainer">
            <Grupo id="cfg-port-pode" titulo="Pode apagar" variaveis={lista.podeApagar} linha="O valor já está salvo na tela, ou o PROMeiro não lê mais." vazio="Nada para apagar agora." classe="pode">
              {lista.podeApagar.length > 0 && (
                <button type="button" className="botao cfg-port-copiar" onClick={copiarOsNomes}>
                  <Icone nome="copiar" tam={14} /> Copiar os nomes
                </button>
              )}
            </Grupo>
            <Grupo id="cfg-port-ainda" titulo="Ainda não" variaveis={lista.aindaNao} linha="Sem valor salvo na tela: a do Portainer continua valendo." vazio="Nenhuma: tudo o que a tela guarda já está salvo." classe="nao-ainda" comPorque />
            <Grupo id="cfg-port-ficam" titulo="Ficam" variaveis={lista.ficam} linha="Segredos e infraestrutura: o lugar delas é o Portainer." vazio="Nenhuma." classe="fica" />
          </section>
        )}
      </main>
    </div>
  );
}

function Grupo({ id, titulo, variaveis, linha, vazio, classe, comPorque = false, children }: { id: string; titulo: string; variaveis: VariavelDoPortainer[]; linha: string; vazio: string; classe: string; comPorque?: boolean; children?: ReactNode }) {
  return (
    <div className="cfg-port-grupo" aria-labelledby={id} data-grupo={classe}>
      <h3 id={id}>
        {titulo} · {variaveis.length}
        <span className="espaco" />
        {children}
      </h3>
      <p className="cfg-port-linha">{variaveis.length ? linha : vazio}</p>
      {variaveis.length > 0 &&
        (comPorque ? (
          // juntas pelo porquê: "sem valor salvo em Card", a reserva de quem não tem entrada…
          <ul className="cfg-port-lista">
            {[...new Set(variaveis.map((v) => v.porque))].map((porque) => (
              <li key={porque}>
                <small>{porque}</small>
                <span className="cfg-vars">
                  {variaveis
                    .filter((v) => v.porque === porque)
                    .map((v) => (
                      <code key={v.nome} className={classe}>
                        {v.nome}
                      </code>
                    ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="cfg-vars">
            {variaveis.map((v) => (
              <code key={v.nome} className={classe} title={v.porque}>
                {classe === 'pode' && <BolinhaDeEstado estado="ok" />}
                {v.porque === 'segredo' && <Icone nome="cadeado" tam={11} />}
                {v.nome}
              </code>
            ))}
          </div>
        ))}
    </div>
  );
}
