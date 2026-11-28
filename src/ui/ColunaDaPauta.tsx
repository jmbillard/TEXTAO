import { createContext, useContext, useState } from 'react';
import { semAcento } from '../modelo/vocabularios';
import { iniciais, primeiroNome } from '../dados/colaboracao';
import { lerDemanda } from '../modelo/escala';
import type { DemandaParaDistribuir } from '../modelo/ausencias';
import type { ItemArrastado } from './arrastar';
import { DIAS_DA_SEMANA, partes } from './pecasDaPauta';
import { Vazio } from './pecas';

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
  /** junta a lista escrita ou colada; devolve se deu certo (aí o campo esvazia) */
  juntar: (texto: string) => Promise<boolean>;
  tirar: (id: string) => void;
  destinos: readonly Destino[];
  mover: (id: string, destino: string) => void;
  arraste: Arraste;
  /** o Distribuir (#151): põe a lista nos editores escalados; `porQueNao` desliga o botão e diz o motivo */
  distribuir: () => void;
  porQueNao: string;
}

/** "Para distribuir": escrever ou colar as claquetes (uma por linha) e depois arrastar cada uma para um editor. */
export function ParaDistribuir({ dia, itens, juntar, tirar, destinos, mover, arraste: { iniciar, arrastado, sobre }, distribuir, porQueNao }: PropsDoParaDistribuir) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const termo = useContext(BuscaNoMontar);
  const enviar = async (t: string) => {
    if (!t.trim() || ocupado) return;
    setOcupado(true);
    if (await juntar(t)) setTexto('');
    setOcupado(false);
  };
  return (
    <section className={`coluna-caixa coluna-distribuir${sobre === 'lista' ? ' sobre' : ''}${arrastado?.tipo === 'demanda' ? ' recebe' : ''}`} aria-label="Para distribuir" data-solta="lista">
      <h2 className="coluna-rotulo">
        Para distribuir <span className="coluna-n">{itens.length}</span>
      </h2>
      <textarea
        className="coluna-escrever"
        value={texto}
        rows={Math.min(6, Math.max(1, texto.split('\n').length))}
        placeholder="escreva ou cole as claquetes"
        aria-label="Escrever ou colar as claquetes"
        spellCheck={false}
        disabled={ocupado}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void enviar(texto);
          }
        }}
        onPaste={(e) => {
          // a lista colada (mais de uma linha) entra na hora
          const colado = e.clipboardData.getData('text');
          if (!colado.includes('\n')) return;
          e.preventDefault();
          void enviar(`${texto}\n${colado}`);
        }}
      />
      <p className="coluna-dica">uma por linha, Enter junta; depois arraste cada uma para um editor</p>
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
