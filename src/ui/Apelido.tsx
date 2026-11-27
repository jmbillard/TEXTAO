import { useState } from 'react';
import { apelidoDoRoteiro, mudarApelido, useApelidos } from '../dados/apelidos';
import { conflitoDasVersoes, versoesDaChamada, type ConflitoDasVersoes, type FonteDasVersoes, type VersoesDaChamada } from '../modelo/versoesDoRoteiro';
import type { Resumo } from '../dados/armazenamento';
import type { Versao } from '../modelo/pauta';
import { CodigoDasVersoes } from './CodigoDasVersoes';
import './apelido.css';

/* O apelido da claquete e as versões lidas do roteiro (#120), na ficha da revisão e no card da agenda. O apelido é um
   por roteiro e vale só dentro do PROMeiro: o Trello e o Teable continuam com a claquete original, que fica guardada (e
   o campo Claquete da ficha continua sendo ela). */

/** De onde vieram as versões: no fim da dica do código. */
const DE_ONDE: Record<FonteDasVersoes, string> = {
  roteiro: 'das artes do roteiro',
  apelido: 'do código do apelido',
  claquete: 'do código da claquete',
};

/** As versões da chamada só como o código no padrão ("(AH)"), com o que ele quer dizer e de onde veio na dica (as lidas
    do roteiro, sem `de`). A que veio só do dia da semana ("SÁBADO, 22H") leva um "?". */
export function EtiquetasDasVersoes({ versoes, de = 'roteiro' }: { versoes: readonly Versao[]; de?: FonteDasVersoes }) {
  if (!versoes.length) return null;
  return (
    <span className="versoes-lidas">
      <CodigoDasVersoes versoes={versoes} de={DE_ONDE[de]} />
    </span>
  );
}

/** O texto do aviso discreto do conflito, com os dois códigos: vale o roteiro; a claquete diz outra coisa. */
const textoDoConflito = (c: ConflitoDasVersoes) => `o roteiro diz ${c.doRoteiro}, ${c.daClaquete ? `a claquete diz ${c.daClaquete}` : 'a claquete não diz a versão'}`;

/** As versões do roteiro como o card mostra: as prontas da API; fora do servidor (o roteiro de exemplo), calculadas
    aqui com a mesma regra (versoesDaChamada). Com o código fora do nome, a etiqueta é o único lugar dele. */
export function versoesDoResumo(r: Pick<Resumo, 'id' | 'meta' | 'versoesLidas' | 'versoesDaChamada'>): VersoesDaChamada {
  return r.versoesDaChamada ?? versoesDaChamada({ lidas: r.versoesLidas ?? [], claquete: r.meta.claquete ?? '', apelido: apelidoDoRoteiro(r.id), dia: r.meta.dataExibicao ?? '' });
}

/** As versões da chamada no card da agenda e no da tela de produções (#121), como a API manda: o código e, num
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
