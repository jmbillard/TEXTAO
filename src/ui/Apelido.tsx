import { useState } from 'react';
import { apelidoDoRoteiro, mudarApelido, mudarVersoes, useApelidos, versoesAMaoDoRoteiro } from '../dados/apelidos';
import { codigoAMao, sufixoDasVersoes, versoesDaChamada, type ConflitoDasVersoes, type FonteDasVersoes, type VersoesDaChamada } from '../modelo/versoesDoRoteiro';
import type { Resumo } from '../dados/armazenamento';
import { codigoDasVersoes, type Versao } from '../modelo/pauta';
import { DE_ONDE, dicaDasVersoes, NomeComVersoes, useCodigoDasVersoes } from './CodigoDasVersoes';
import './apelido.css';

/* O apelido da claquete e as versões que ela sabe (#120, #152), na ficha da revisão e no editor. O apelido é um por
   roteiro e vale só dentro do PROMeiro: o Trello e o Teable continuam com a claquete original, que fica guardada (e o
   campo Claquete da ficha continua sendo ela). As versões ficam no apelido: o valor inicial é o código do nome (o do
   apelido ou o da claquete) ou, sem ele, as artes do roteiro; o que foi feito à mão vale sobre os dois. */

/** O texto do aviso discreto do conflito, com os dois códigos: o roteiro diz uma coisa, o que vale diz outra. */
const textoDoConflito = (c: ConflitoDasVersoes, de: FonteDasVersoes | null) =>
  `o roteiro diz ${c.doRoteiro}, ${c.daClaquete ? `${de === 'mao' ? 'as versões à mão dizem' : 'a claquete diz'} ${c.daClaquete}` : 'a claquete não diz a versão'}`;

/** As versões que a claquete do roteiro sabe, como a agenda mostra: as feitas à mão no apelido, o código do nome ou as
    lidas do roteiro, pela mesma regra do servidor (versoesDaChamada), na hora em que o apelido muda. */
export function versoesDoResumo(r: Pick<Resumo, 'id' | 'meta' | 'versoesLidas' | 'versoesDaChamada'>): VersoesDaChamada {
  if (!r.versoesLidas && r.versoesDaChamada) return r.versoesDaChamada;
  return versoesDaChamada({ lidas: r.versoesLidas ?? [], claquete: r.meta.claquete ?? '', apelido: apelidoDoRoteiro(r.id), mao: versoesAMaoDoRoteiro(r.id), dia: r.meta.dataExibicao ?? '' });
}

/** O nome da claquete com o sufixo das versões que ela sabe (#152), colado no fim: o código uma vez só, no padrão, com a
    dica do significado e de onde veio. Com a opção desligada, só o nome. */
export function NomeDaClaquete({ nome, versoes }: { nome: string; versoes?: VersoesDaChamada }) {
  return <NomeComVersoes nome={nome} versoes={versoes?.lista ?? []} de={versoes?.de ? DE_ONDE[versoes.de] : undefined} />;
}

/** O aviso discreto, no card da agenda e no da tela de produções (#121), quando o roteiro diz outra versão; só com o
    código das versões ligado (#152). Não é etiqueta: o código fica no fim do nome. */
export function ConflitoDoCard({ versoes }: { versoes?: VersoesDaChamada }) {
  const ligado = useCodigoDasVersoes();
  if (!ligado || !versoes?.conflito) return null;
  return <span className="conflito-versoes conflito-do-card">{textoDoConflito(versoes.conflito, versoes.de)}</span>;
}

/**
 * O apelido editável do roteiro e as versões que a claquete sabe: o código e de onde veio, editável à mão (as vazias
 * voltam ao valor inicial) e, num conflito com o roteiro, a opção de usar as dele. Sem `podeMudar` (fora do servidor, o
 * roteiro de exemplo), só mostra.
 * @param versoes as versões lidas do roteiro
 * @param dia AAAA-MM-DD, a exibição: o dia das etiquetas sem data na claquete
 */
export function ApelidoDaClaquete({ roteiro, claquete, versoes, podeMudar, dia = '' }: { roteiro: string; claquete: string; versoes: readonly Versao[]; podeMudar: boolean; dia?: string }) {
  useApelidos();
  const apelido = apelidoDoRoteiro(roteiro);
  const aMao = versoesAMaoDoRoteiro(roteiro);
  const [editando, setEditando] = useState<string | null>(null);
  const [editandoVersoes, setEditandoVersoes] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const valem = versoesDaChamada({ lidas: versoes, claquete, apelido, mao: aMao, dia });
  const conflito = valem.conflito;
  const guardar = async (mudar: () => Promise<void>, fechar: () => void, oQue: string) => {
    setErro('');
    try {
      await mudar();
      fechar();
    } catch (e) {
      setErro(`Não guardou ${oQue}: ${e instanceof Error ? e.message : 'o servidor não respondeu.'}`);
    }
  };
  const guardarNome = (novo: string) => guardar(() => mudarApelido(roteiro, novo), () => setEditando(null), 'o apelido');
  const guardarVersoes = (novo: string) => {
    const lido = codigoAMao(novo);
    if ('recusa' in lido) return void setErro(lido.recusa);
    void guardar(() => mudarVersoes(roteiro, lido.codigo), () => setEditandoVersoes(null), 'as versões');
  };
  if (!claquete.trim() || (!podeMudar && !apelido && !valem.lista.length)) return null;
  const tecla = (fechar: () => void) => (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    fechar();
  };
  return (
    <div className="apelido-claquete">
      {editando !== null ? (
        <form
          className="apelido-linha"
          onSubmit={(e) => {
            e.preventDefault();
            void guardarNome(editando);
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
            onKeyDown={tecla(() => setEditando(null))}
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
              <button type="button" className="apelido-botao" onClick={() => void guardarNome('')}>voltar ao original</button>
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
      {editandoVersoes !== null ? (
        <form
          className="apelido-linha"
          onSubmit={(e) => {
            e.preventDefault();
            guardarVersoes(editandoVersoes);
          }}
        >
          <small>versões</small>
          <input
            autoFocus
            className="apelido-versoes-campo"
            value={editandoVersoes}
            aria-label="Código das versões"
            placeholder="AH, PN, MNT…"
            autoComplete="off"
            spellCheck={false}
            maxLength={10}
            onChange={(e) => setEditandoVersoes(e.target.value)}
            onKeyDown={tecla(() => setEditandoVersoes(null))}
          />
          <button type="submit" className="apelido-botao">guardar</button>
          <button type="button" className="apelido-botao" onClick={() => setEditandoVersoes(null)}>cancelar</button>
        </form>
      ) : (
        (valem.lista.length > 0 || podeMudar) && (
          <span className="apelido-linha">
            <small>versões</small>
            {valem.lista.length ? (
              <>
                <b className="apelido-versoes" title={dicaDasVersoes(valem.lista)}>
                  {sufixoDasVersoes(valem.lista)}
                </b>
                {valem.de && <span className="apelido-de">{DE_ONDE[valem.de]}</span>}
              </>
            ) : (
              <span className="apelido-de">o nome e o roteiro não dizem</span>
            )}
            {podeMudar && (
              <>
                <button type="button" className="apelido-botao" aria-label="Editar as versões" onClick={() => setEditandoVersoes(aMao || codigoDasVersoes(valem.lista).slice(1, -1))}>
                  {valem.lista.length ? 'editar' : 'dar as versões'}
                </button>
                {aMao && (
                  <button type="button" className="apelido-botao" title="O código do nome ou, sem ele, as artes do roteiro" onClick={() => guardarVersoes('')}>
                    voltar ao inicial
                  </button>
                )}
              </>
            )}
            {conflito && (
              <span className="conflito-versoes">
                {textoDoConflito(conflito, valem.de)}
                {podeMudar && (
                  <button type="button" className="apelido-botao" onClick={() => guardarVersoes(conflito.doRoteiro)}>
                    usar {conflito.doRoteiro} do roteiro
                  </button>
                )}
              </span>
            )}
          </span>
        )
      )}
      {erro && <span className="apelido-erro" role="alert">{erro}</span>}
    </div>
  );
}

