import { useState } from 'react';
import { apelidoDoRoteiro, mudarApelido, useApelidos } from '../dados/apelidos';
import { conflitoDasVersoes, type ConflitoDasVersoes, type FonteDasVersoes, type VersoesDaChamada } from '../modelo/versoesDoRoteiro';
import type { Versao } from '../modelo/pauta';
import './apelido.css';

/* O apelido da claquete e as versões lidas do roteiro (#120), na ficha da revisão e no card da agenda. O apelido é um
   por roteiro e vale só dentro do PROMeiro: o Trello e o Teable continuam com a claquete original, que fica guardada (e
   o campo Claquete da ficha continua sendo ela). */

/** De onde vieram as versões: na dica de cada etiqueta e no nome do grupo. */
const DE_ONDE: Record<FonteDasVersoes, { dica: string; grupo: string }> = {
  roteiro: { dica: 'lida nas artes do roteiro', grupo: 'lidas do roteiro' },
  apelido: { dica: 'do código do apelido', grupo: 'do apelido' },
  claquete: { dica: 'do código da claquete', grupo: 'da claquete' },
};

/** As versões da chamada como etiquetas ("amanhã", "hoje", "nesta qua"), com o código e de onde vieram na dica (as
    lidas do roteiro, sem `de`). A que veio só do dia da semana ("SÁBADO, 22H") leva um "?": a pessoa confere se é
    "nesta" ou "próxima". */
export function EtiquetasDasVersoes({ versoes, de = 'roteiro' }: { versoes: readonly Versao[]; de?: FonteDasVersoes }) {
  if (!versoes.length) return null;
  return (
    <span className="versoes-lidas" aria-label={`Versões ${DE_ONDE[de].grupo}: ${versoes.map((v) => v.rotulo).join(', ')}`}>
      {versoes.map((v) => (
        <span key={v.codigo} className={`versao-lida${v.aConferir ? ' a-conferir' : ''}`} title={v.aConferir ? `(${v.codigo})? O roteiro diz só o dia da semana: confira se é "nesta" ou "próxima"` : `(${v.codigo}), ${DE_ONDE[de].dica}`}>
          {v.rotulo}
          {v.aConferir && '?'}
        </span>
      ))}
    </span>
  );
}

/** O texto do aviso discreto do conflito: vale o roteiro; a claquete diz outra coisa. */
const textoDoConflito = (c: ConflitoDasVersoes) => (c.daClaquete ? `a claquete diz ${c.daClaquete}` : 'a claquete não diz a versão');

/** O aviso discreto do conflito: vale o roteiro; a claquete diz outra coisa. */
export function AvisoDasVersoes({ claquete, versoes }: { claquete: string; versoes: readonly Versao[] }) {
  const conflito = conflitoDasVersoes(claquete, versoes);
  return conflito && <span className="conflito-versoes">{textoDoConflito(conflito)}</span>;
}

/** As versões da chamada no card da agenda e no da tela de produções (#121), como a API manda: as etiquetas e, num
    conflito com o código do nome, o aviso discreto. Numa linha própria, que quebra: a claquete nunca encolhe por elas. */
export function VersoesDoCard({ versoes }: { versoes?: VersoesDaChamada }) {
  if (!versoes?.lista.length) return null;
  return (
    <span className="versoes-do-card">
      <EtiquetasDasVersoes versoes={versoes.lista} de={versoes.de ?? 'roteiro'} />
      {versoes.conflito && <span className="conflito-versoes">{textoDoConflito(versoes.conflito)}</span>}
    </span>
  );
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
              {textoDoConflito(conflito)}
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
