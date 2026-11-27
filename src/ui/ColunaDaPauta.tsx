import { useState } from 'react';
import { iniciais, primeiroNome } from '../dados/colaboracao';
import { lerDemanda } from '../modelo/escala';
import type { DemandaParaDistribuir } from '../modelo/ausencias';
import type { ItemArrastado } from './arrastar';
import { DIAS_DA_SEMANA, partes } from './pecasDaPauta';

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
}

/** "Para distribuir": escrever ou colar as claquetes (uma por linha) e depois arrastar cada uma para um editor. */
export function ParaDistribuir({ dia, itens, juntar, tirar, destinos, mover, arraste: { iniciar, arrastado, sobre } }: PropsDoParaDistribuir) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
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
        <ul className="coluna-itens">
          {itens.map((d) => {
            const l = lerDemanda(d.texto, dia);
            return (
              <li key={d.id} className={`coluna-claquete${arrastado?.tipo === 'lista' && arrastado.id === d.id ? ' indo' : ''}`} data-id={d.id} onPointerDown={iniciar({ tipo: 'lista', id: d.id })}>
                <Alca />
                <span className="coluna-claquete-corpo">
                  <span className="mono">{d.texto}</span>
                  <span className="coluna-leitura">
                    {l.tipo === 'claquete' && (l.data ? `${l.atracao} · ${DIAS_DA_SEMANA[partes(l.data).semana]} ${partes(l.data).dia}/${partes(l.data).mes + 1}` : <span className="montar-alerta">sem data</span>)}
                    {d.deQuem && <span className="coluna-de"> era de {primeiroNome(d.deQuem)}</span>}
                  </span>
                  <span className="coluna-acoes">
                    <EscolherDestino rotulo="Mover para…" titulo={`Mover ${d.texto} para…`} destinos={destinos} escolher={(v) => mover(d.id, v)} />
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
        <p className="coluna-ninguem">todos escalados</p>
      )}
    </section>
  );
}
