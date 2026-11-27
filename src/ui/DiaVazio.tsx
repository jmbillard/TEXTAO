import { useState } from 'react';
import type { DiaDaEscala } from '../modelo/escala';
import type { DeOndeRepetir } from '../modelo/repetir';
import { DIAS_DA_SEMANA, partes } from './pecasDaPauta';
import './diaVazio.css';

/* Montar a pauta, o dia vazio (#129): a escala costuma se repetir, então o dia vazio oferece começar de uma que já
   existe (Repetir: o mesmo dia na semana passada, o de ontem ou a semana passada inteira, nos dias vazios), colar da
   planilha (o #130; por enquanto desligado) ou começar do zero (uma posição vazia em cada turno). O Repetir traz a
   ilha, o editor, o horário e as tarefas, nunca as claquetes; quem está fora no dia vira vaga, com o motivo. */

/** "sex 20/11". */
export const diaCurto = (iso: string) => {
  const p = partes(iso);
  return `${DIAS_DA_SEMANA[p.semana]} ${p.dia}/${p.mes + 1}`;
};
const posicoesEscritas = (n: number) => `${n} ${n === 1 ? 'posição' : 'posições'}`;

/** O que a pessoa lê depois de Repetir: quantas posições e quem ficou de fora (a vaga). */
export function textoDoRepetido(repetido: NonNullable<DiaDaEscala['repetido']>, de: DeOndeRepetir): string {
  const fora = [...new Set(repetido.flatMap((r) => r.vagas.map((v) => v.editor)))];
  const deFora = fora.length ? ` ${fora.join(' e ')} ${fora.length > 1 ? 'estão fora: ficaram as vagas.' : 'está fora: ficou a vaga.'}` : '';
  if (de !== 'semana-inteira') return `Escala de ${diaCurto(repetido[0].origem)} repetida: ${posicoesEscritas(repetido[0].posicoes)}.${deFora}`;
  return `Semana passada repetida em ${repetido.map((r) => diaCurto(r.destino)).join(', ')}.${deFora}`;
}

interface Props {
  dados: DiaDaEscala;
  /** chamado com a opção escolhida; devolve quando acabou (o erro vem como exceção) */
  repetir: (de: DeOndeRepetir) => Promise<void>;
  doZero: () => void;
}

export function DiaVazio({ dados, repetir, doZero }: Props) {
  const [fazendo, setFazendo] = useState<DeOndeRepetir | null>(null);
  const [erro, setErro] = useState('');
  const o = dados.repetir;
  const escolher = async (de: DeOndeRepetir) => {
    setFazendo(de);
    setErro('');
    try {
      await repetir(de);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setFazendo(null);
    }
  };
  const nada = (origem: string) => `nada montado em ${diaCurto(origem)}`;
  const opcoes: { de: DeOndeRepetir; titulo: string; sub: string; vale: boolean }[] = o
    ? [
        { de: 'semana-passada', titulo: `A escala de ${diaCurto(o.semanaPassada.origem)}`, sub: o.semanaPassada.posicoes ? `o mesmo dia, na semana passada · ${posicoesEscritas(o.semanaPassada.posicoes)}` : nada(o.semanaPassada.origem), vale: o.semanaPassada.posicoes > 0 },
        { de: 'ontem', titulo: `A escala de ${diaCurto(o.ontem.origem)}`, sub: o.ontem.posicoes ? `o dia anterior · ${posicoesEscritas(o.ontem.posicoes)}` : nada(o.ontem.origem), vale: o.ontem.posicoes > 0 },
        { de: 'semana-inteira', titulo: 'A semana passada inteira', sub: o.semanaInteira.length ? `preenche os dias vazios: ${o.semanaInteira.map((r) => diaCurto(r.destino)).join(', ')}` : 'nenhum dia vazio com o que trazer', vale: o.semanaInteira.length > 0 },
      ]
    : [];
  const primeira = opcoes.find((x) => x.vale)?.de;
  return (
    <section className="dia-vazio" aria-label="Dia vazio">
      <p className="dia-vazio-titulo">{diaCurto(dados.dia)} ainda vazio</p>
      <p className="dia-vazio-sub">A escala costuma se repetir. Comece de uma que já existe e ajuste:</p>
      <div className="dia-vazio-opcoes">
        {opcoes.map((x) => (
          <button key={x.de} type="button" className={`dia-vazio-opcao${x.de === primeira ? ' primeira' : ''}`} disabled={!x.vale || !!fazendo} onClick={() => void escolher(x.de)}>
            <strong>↻ {x.titulo}</strong>
            <small>{fazendo === x.de ? 'repetindo…' : x.sub}</small>
          </button>
        ))}
        {/* o colar da planilha é o #130 */}
        <button type="button" className="dia-vazio-opcao" disabled title="Ainda não: vem logo">
          <strong>⎘ Colar da planilha</strong>
          <small>em breve: um bloco da aba do dia, como está hoje</small>
        </button>
        <button type="button" className="dia-vazio-opcao" disabled={!!fazendo} onClick={doZero}>
          <strong>Começar do zero</strong>
          <small>cada turno com uma posição vazia</small>
        </button>
      </div>
      <p className="dia-vazio-pe">Repete a ilha, o editor, o horário e as tarefas (COMUNICAÇÃO, CALHAUS), nunca as claquetes. Quem estiver fora no dia vira vaga.</p>
      {erro && (
        <p className="montar-erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
