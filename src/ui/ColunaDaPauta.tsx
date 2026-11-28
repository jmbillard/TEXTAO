import { createContext, useContext, useState } from 'react';
import { semAcento } from '../modelo/vocabularios';
import { iniciais, primeiroNome } from '../dados/colaboracao';
import { lerDemanda } from '../modelo/escala';
import type { DemandaParaDistribuir } from '../modelo/ausencias';
import { ROTULO_DA_ETAPA, type ClaqueteParaEscolher, type DeForaDaPauta } from '../modelo/pauta';
import type { ItemArrastado } from './arrastar';
import { DIAS_DA_SEMANA, partes } from './pecasDaPauta';
import { BolinhaDeEstado, NadaNaBusca, Vazio } from './pecas';
import { Vagas } from './vagas';

/** A busca do Montar a pauta (#171), a lupa das outras telas: as claquetes que batem ficam, as outras esmaecem (a
    grade continua inteira, para arrastar e digitar). Vazia, nada esmaece. */
export const BuscaNoMontar = createContext('');
/** A claquete fica fora da busca de agora? */
export function useForaDaBusca(texto: string) {
  const termo = useContext(BuscaNoMontar);
  return !!termo && !semAcento(texto).includes(termo);
}
/** Quantas claquetes batem com a busca. */
export const batemNaBusca = (termo: string, textos: readonly string[]) => textos.filter((t) => t.trim() && semAcento(t).includes(termo)).length;

/* Montar a pauta, a coluna lateral (#126): as caixas "Para distribuir" e "Sem escala" (a "Fora" é a das ausências,
   AusenciasDaPauta.tsx). Cada item arrasta (no mouse, o item inteiro; no dedo, pela alça ⠿) e tem também o seu
   "Mover para…" ou "Escalar na…", uma lista do próprio aparelho: é o caminho no celular e pelo teclado. */

/** Um destino do "Mover para…" e do "Escalar na…": o valor ("posicao:id", "turno:id" ou "lista"), o grupo e o nome. */
export interface Destino {
  valor: string;
  grupo: string;
  rotulo: string;
}

/** A lista do aparelho com os destinos, agrupados (o turno), que age ao escolher. */
export function EscolherDestino({ rotulo, titulo, destinos, escolher, className = '' }: { rotulo: string; titulo: string; destinos: readonly Destino[]; escolher: (valor: string) => void; className?: string }) {
  const grupos = [...new Set(destinos.map((d) => d.grupo))];
  return (
    <select className={`coluna-destino ${className}`} aria-label={titulo} title={titulo} value="" onChange={(e) => e.target.value && escolher(e.target.value)}>
      <option value="">{rotulo}</option>
      {grupos.map((g) => (
        <optgroup key={g} label={g}>
          {destinos
            .filter((d) => d.grupo === g)
            .map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.rotulo}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

/** O arrastar da tela (useArrastar): quem está sendo arrastado, o lugar em que está e o começo do arrastar. */
export interface Arraste {
  iniciar: (item: ItemArrastado) => (e: React.PointerEvent<HTMLElement>) => void;
  arrastado: ItemArrastado | null;
  sobre: string;
}

/** A alça de arrastar: no dedo, é por ela que se arrasta (não rola a página). */
export const Alca = () => (
  <span className="arrasto-alca" aria-hidden="true">
    ⠿
  </span>
);

interface PropsDoParaDistribuir {
  dia: string;
  itens: readonly DemandaParaDistribuir[];
  tirar: (id: string) => void;
  destinos: readonly Destino[];
  mover: (id: string, destino: string) => void;
  arraste: Arraste;
  /** o Distribuir (#151): põe a lista nos editores escalados; `porQueNao` desliga o botão e diz o motivo */
  distribuir: () => void;
  porQueNao: string;
}

/**
 * "Para distribuir": as claquetes escolhidas das Produções (#199: não se escreve nem se cola uma linha livre), à espera
 * de ir para um editor, arrastando, pelo "Mover para…" ou pelo Distribuir.
 */
export function ParaDistribuir({ dia, itens, tirar, destinos, mover, arraste: { iniciar, arrastado, sobre }, distribuir, porQueNao }: PropsDoParaDistribuir) {
  const termo = useContext(BuscaNoMontar);
  const recebe = arrastado?.tipo === 'demanda' || arrastado?.tipo === 'producao';
  return (
    <section className={`coluna-caixa coluna-distribuir${sobre === 'lista' ? ' sobre' : ''}${recebe ? ' recebe' : ''}`} aria-label="Para distribuir" data-solta="lista">
      <h2 className="coluna-rotulo">
        Para distribuir <span className="coluna-n">{itens.length}</span>
      </h2>
      {!itens.length && <p className="coluna-dica">escolha as claquetes nas Produções (o + ou arrastando) e depois leve cada uma para um editor</p>}
      {itens.length > 0 && (
        <div className="coluna-distribuir-acao">
          <button type="button" className="botao" disabled={!!porQueNao} title={porQueNao || 'Põe as claquetes nos editores escalados: quem pegou a atração nos últimos 14 dias, depois quem tem menos demandas, depois um sorteio. Nada é publicado.'} onClick={distribuir}>
            Distribuir
          </button>
          <span className="coluna-dica">{porQueNao || 'pela continuidade, pela carga e pelo sorteio; você confere e arrasta'}</span>
        </div>
      )}
      {itens.length > 0 && (
        <ul className="coluna-itens">
          {itens.map((d) => {
            const l = lerDemanda(d.texto, dia);
            const fora = !!termo && !semAcento(d.texto).includes(termo);
            return (
              <li key={d.id} className={`coluna-claquete${arrastado?.tipo === 'lista' && arrastado.id === d.id ? ' indo' : ''}${fora ? ' fora-da-busca' : ''}`} data-id={d.id} onPointerDown={iniciar({ tipo: 'lista', id: d.id })}>
                <Alca />
                {/* o ⇄ discreto, à direita, no meio da claquete (#163): o mesmo das demandas da grade */}
                <EscolherDestino className="mover-menu" rotulo="⇄" titulo={`Mover ${d.texto} para…`} destinos={destinos} escolher={(v) => mover(d.id, v)} />
                <span className="coluna-claquete-corpo">
                  <span className="mono">{d.texto}</span>
                  <span className="coluna-leitura">
                    {l.tipo === 'claquete' && (l.data ? `${l.atracao} · ${DIAS_DA_SEMANA[partes(l.data).semana]} ${partes(l.data).dia}/${partes(l.data).mes + 1}` : <span className="montar-alerta">sem data</span>)}
                    {d.deQuem && <span className="coluna-de"> era de {primeiroNome(d.deQuem)}</span>}
                  </span>
                  <span className="coluna-acoes">
                    <button type="button" className="botao-texto" onClick={() => tirar(d.id)}>
                      {d.deQuem ? 'já distribuí' : 'tirar'}
                    </button>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface PropsDoSemEscala {
  /** null enquanto não se sabe quem está fora no dia: até lá, ninguém aparece como sem escala */
  pessoas: readonly string[] | null;
  destinos: readonly Destino[];
  escalar: (editor: string, destino: string) => void;
  arraste: Arraste;
}

/** "Sem escala": quem não está escalado no dia (nem fora); arrasta para uma posição ou "Escalar na…". */
export function SemEscala({ pessoas, destinos, escalar, arraste: { iniciar, arrastado } }: PropsDoSemEscala) {
  return (
    <section className="coluna-caixa coluna-sem-escala" aria-label="Sem escala">
      <h2 className="coluna-rotulo">
        Sem escala {pessoas && <span className="coluna-n">{pessoas.length}</span>}
      </h2>
      {!pessoas ? (
        <p className="coluna-ninguem">lendo quem está fora…</p>
      ) : pessoas.length ? (
        <ul className="coluna-itens">
          {pessoas.map((nome) => (
            <li key={nome} className={`coluna-pessoa${arrastado?.tipo === 'pessoa' && arrastado.id === nome ? ' indo' : ''}`} onPointerDown={iniciar({ tipo: 'pessoa', id: nome })}>
              <Alca />
              <span className="pauta-avatar" aria-hidden="true">
                {iniciais(nome)}
              </span>
              <strong>{nome}</strong>
              <EscolherDestino rotulo="Escalar na…" titulo={`Escalar ${nome} na…`} destinos={destinos} escolher={(v) => escalar(nome, v)} />
            </li>
          ))}
        </ul>
      ) : (
        <Vazio className="coluna-ninguem">todos escalados</Vazio>
      )}
    </section>
  );
}

/* ---------- as claquetes das Produções e o "de fora" (#199, ADR 0008) ---------- */

/** Quantas claquetes a lista mostra antes do "mostrar todas" (com a busca, todas as que batem). */
const NA_LISTA = 8;

interface PropsDasClaquetes {
  /** null enquanto lê */
  claquetes: readonly ClaqueteParaEscolher[] | null;
  erro: string;
  /** põe em "Para distribuir" */
  escolher: (c: ClaqueteParaEscolher) => void;
  /** o "Pôr em…": uma posição do dia ou "lista" */
  destinos: readonly Destino[];
  porEm: (c: ClaqueteParaEscolher, destino: string) => void;
  arraste: Arraste;
}

/**
 * As claquetes das Produções (#199): as que a coordenação pode pôr no dia, das Produções que entraram perto dele (do
 * Teable e do Trello), da que entrou por último para a mais velha. Cada uma arrasta para um editor ou para "Para
 * distribuir", tem o "+" (vai para "Para distribuir") e o "Pôr em…" (o caminho no celular e pelo teclado). A lupa da
 * tela filtra a lista: aqui o que não bate sai (é uma lista para achar), em vez de esmaecer.
 */
export function ClaquetesDasProducoes({ claquetes, erro, escolher, destinos, porEm, arraste: { iniciar, arrastado } }: PropsDasClaquetes) {
  const termo = useContext(BuscaNoMontar);
  const [todas, setTodas] = useState(false);
  const batem = (claquetes ?? []).filter((c) => !termo || semAcento(`${c.claquete} ${c.pracas.join(' ')}`).includes(termo));
  const vistas = termo || todas ? batem : batem.slice(0, NA_LISTA);
  return (
    <section className="coluna-caixa coluna-producoes" aria-label="Claquetes das Produções">
      <h2 className="coluna-rotulo">
        Das Produções {claquetes && <span className="coluna-n">{claquetes.length}</span>}
      </h2>
      {erro ? (
        <p className="aus-erro" role="alert">
          {erro}
        </p>
      ) : !claquetes ? (
        <p className="coluna-ninguem">lendo as Produções…</p>
      ) : !claquetes.length ? (
        <Vazio className="coluna-ninguem">nenhuma Produção perto do dia</Vazio>
      ) : !batem.length ? (
        <NadaNaBusca termo={termo} onde="nas Produções" className="coluna-ninguem" />
      ) : (
        <>
          <ul className="coluna-itens">
            <Vagas como="li" itens={vistas} chave={(c) => c.chave}>
              {(c) => (
                <div className={`coluna-claquete coluna-producao${arrastado?.tipo === 'producao' && arrastado.id === c.chave ? ' indo' : ''}`} data-chave={c.chave} onPointerDown={iniciar({ tipo: 'producao', id: c.chave })}>
                  <Alca />
                  <EscolherDestino className="mover-menu" rotulo="⇄" titulo={`Pôr ${c.claquete} em…`} destinos={destinos} escolher={(v) => porEm(c, v)} />
                  <span className="coluna-claquete-corpo">
                    <span className="mono">{c.claquete}</span>
                    <span className="coluna-leitura coluna-etapa">
                      <BolinhaDeEstado estado={c.etapa} />
                      {ROTULO_DA_ETAPA[c.etapa]}
                      {c.pracas.length > 0 && <> · {c.pracas.join(', ')}</>}
                      {c.noTrello && <> · no Trello</>}
                    </span>
                  </span>
                  <button type="button" className="botao-icone pequeno coluna-mais" aria-label={`Pôr ${c.claquete} em Para distribuir`} title="Pôr em Para distribuir" onClick={() => escolher(c)}>
                    +
                  </button>
                </div>
              )}
            </Vagas>
          </ul>
          {!termo && batem.length > NA_LISTA && (
            <button type="button" className="botao-texto coluna-todas" aria-expanded={todas} onClick={() => setTodas((x) => !x)}>
              {todas ? 'mostrar menos' : `mostrar todas (${batem.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * "N de fora" (#199), só para a coordenação: o que o Teable tem no dia e não aparece na Pauta (as tarefas e as claquetes
 * sem Produção, com as infos delas), para conferir. Nada disso é apagado ao publicar. A lista abre e fecha.
 */
export function DeForaDoDia({ deFora, erro }: { deFora: readonly DeForaDaPauta[] | null | undefined; erro: string }) {
  const [aberta, setAberta] = useState(false);
  const n = deFora?.length ?? 0;
  return (
    <section className="coluna-caixa coluna-de-fora" aria-label="De fora da Pauta">
      <h2 className="coluna-rotulo">
        {deFora ? (
          <>
            <span className="coluna-n">{n}</span> de fora
          </>
        ) : (
          'De fora'
        )}
      </h2>
      {erro ? (
        <p className="coluna-dica">não li o Teable deste dia: {erro}</p>
      ) : deFora === undefined ? (
        <p className="coluna-ninguem">lendo o Teable…</p>
      ) : !n ? (
        <Vazio className="coluna-ninguem">nada de fora</Vazio>
      ) : (
        <>
          <p className="coluna-dica">no Teable, fora da Pauta: tarefas e claquetes sem Produção. Publicar não apaga nada disso.</p>
          <button type="button" className="botao-texto coluna-ver" aria-expanded={aberta} onClick={() => setAberta((x) => !x)}>
            {aberta ? 'esconder a lista' : 'ver a lista'}
          </button>
          <div className={`de-fora-lista${aberta ? ' aberta' : ''}`} aria-hidden={!aberta}>
            <ul className="coluna-itens">
              {(deFora ?? []).map((d) => (
                <li key={d.id} className={`de-fora-item t-${d.tipo}`}>
                  <span className="mono">{d.texto}</span>
                  <span className="coluna-leitura">
                    <span className="etiqueta">{d.tipo === 'tarefa' ? 'tarefa' : 'sem Produção'}</span>
                    {d.editor ? ` ${primeiroNome(d.editor)}` : ' sem editor'}
                  </span>
                  {d.infos.map((info, i) => (
                    <span key={i} className="de-fora-info">
                      {info}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
