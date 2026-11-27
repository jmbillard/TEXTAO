import { useState } from 'react';
import { apelidoDoRoteiro, mudarApelido, useApelidos } from '../dados/apelidos';
import { conflitoDasVersoes } from '../modelo/versoesDoRoteiro';
import type { Versao } from '../modelo/pauta';
import './apelido.css';

/* O apelido da claquete e as versões lidas do roteiro (#120), na ficha da revisão e no card da agenda. O apelido é um
   por roteiro e vale só dentro do PROMeiro: o Trello e o Teable continuam com a claquete original, que fica guardada (e
   o campo Claquete da ficha continua sendo ela). */

/** As versões lidas do roteiro como etiquetas ("amanhã", "hoje", "nesta qua"), com o código na dica. A que veio só do
    dia da semana ("SÁBADO, 22H") leva um "?": a pessoa confere se é "nesta" ou "próxima". */
export function EtiquetasDasVersoes({ versoes }: { versoes: readonly Versao[] }) {
  if (!versoes.length) return null;
  return (
    <span className="versoes-lidas" aria-label={`Versões lidas do roteiro: ${versoes.map((v) => v.rotulo).join(', ')}`}>
      {versoes.map((v) => (
        <span key={v.codigo} className={`versao-lida${v.aConferir ? ' a-conferir' : ''}`} title={v.aConferir ? `(${v.codigo})? O roteiro diz só o dia da semana: confira se é "nesta" ou "próxima"` : `(${v.codigo}), lida nas artes do roteiro`}>
          {v.rotulo}
          {v.aConferir && '?'}
        </span>
      ))}
    </span>
  );
}

/** O aviso discreto do conflito: vale o roteiro; a claquete diz outra coisa. */
export function AvisoDasVersoes({ claquete, versoes }: { claquete: string; versoes: readonly Versao[] }) {
  const conflito = conflitoDasVersoes(claquete, versoes);
  if (!conflito) return null;
  return <span className="conflito-versoes">{conflito.daClaquete ? `a claquete diz ${conflito.daClaquete}` : 'a claquete não diz a versão'}</span>;
}

/**
 * O apelido editável do roteiro, as versões lidas dele e, num conflito com a claquete, a opção de usar as do roteiro no
 * apelido. Sem `podeMudar` (fora do servidor, o roteiro de exemplo), só mostra.
 */
export function ApelidoDaClaquete({ roteiro, claquete, versoes, podeMudar }: { roteiro: string; claquete: string; versoes: readonly Versao[]; podeMudar: boolean }) {
  useApelidos();
  const apelido = apelidoDoRoteiro(roteiro);
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const conflito = conflitoDasVersoes(claquete, versoes);
  const guardar = async (novo: string) => {
    setErro('');
    try {
      await mudarApelido(roteiro, novo);
      setEditando(null);
    } catch (e) {
      setErro(`Não guardou o apelido: ${e instanceof Error ? e.message : 'o servidor não respondeu.'}`);
    }
  };
  if (!claquete.trim() || (!podeMudar && !apelido && !versoes.length)) return null;
  return (
    <div className="apelido-claquete">
      {editando !== null ? (
        <form
          className="apelido-linha"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(editando);
          }}
        >
          <input
            autoFocus
            value={editando}
            aria-label="Apelido da claquete"
            placeholder={claquete}
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            onChange={(e) => setEditando(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.stopPropagation();
              setEditando(null);
            }}
          />
          <button type="submit" className="apelido-botao">guardar</button>
          <button type="button" className="apelido-botao" onClick={() => setEditando(null)}>cancelar</button>
        </form>
      ) : apelido ? (
        <span className="apelido-linha">
          <small>apelido</small>
          <b className="apelido-nome" title={`No Trello e no Teable continua a claquete: ${claquete}`}>{apelido}</b>
          {podeMudar && (
            <>
              <button type="button" className="apelido-botao" aria-label="Editar o apelido" onClick={() => setEditando(apelido)}>editar</button>
              <button type="button" className="apelido-botao" onClick={() => void guardar('')}>voltar ao original</button>
            </>
          )}
        </span>
      ) : (
        podeMudar && (
          <span className="apelido-linha">
            <button type="button" className="apelido-botao" title="O nome que o PROMeiro mostra; o Trello e o Teable continuam com a claquete" onClick={() => setEditando(claquete)}>
              dar um apelido
            </button>
          </span>
        )
      )}
      {versoes.length > 0 && (
        <span className="apelido-linha">
          <small>versões</small>
          <EtiquetasDasVersoes versoes={versoes} />
          {conflito && apelido !== conflito.apelido && (
            <span className="conflito-versoes">
              {conflito.daClaquete ? `a claquete diz ${conflito.daClaquete}` : 'a claquete não diz a versão'}
              {podeMudar && (
                <button type="button" className="apelido-botao" title={conflito.apelido} onClick={() => void guardar(conflito.apelido)}>
                  usar {conflito.doRoteiro} no apelido
                </button>
              )}
            </span>
          )}
        </span>
      )}
      {erro && <span className="apelido-erro" role="alert">{erro}</span>}
    </div>
  );
}
