import { useRef, useState } from 'react';
import { ilhaDeCostume, ilhasQueCasam, quemEstaNaIlha, reconhecerIlha, rotuloDaIlha, salaPeloId, type Ilha } from '../modelo/ilhas';
import type { PosicaoDaEscala, TurnoDaEscala } from '../modelo/escala';
import './campoDaIlha.css';

/* A ilha da posição (#124): a lista das ilhas cadastradas, pelo teclado, como a dos editores. A de costume do editor
   (tirada do histórico) vem primeiro, marcada, e já escolhida quando o campo está vazio: Enter a confirma. Cada ilha
   diz se está livre ou com quem naquele turno; a escolhida já ocupada vira um aviso embaixo. Escrever "46" ou
   "avid46" acha a ilha; o que não é ilha do cadastro não fica (a ilha sai da lista). */

interface Props {
  p: PosicaoDaEscala;
  posicoes: readonly PosicaoDaEscala[];
  turnos: readonly TurnoDaEscala[];
  ilhas: readonly Ilha[];
  costume: Readonly<Record<string, string>>;
  mudar: (ilha: string) => void;
  /** Enter: vai ao campo seguinte; ↑: ao de cima */
  depois: () => void;
  antes: () => void;
}

const nomes = (ps: readonly PosicaoDaEscala[]) => ps.map((o) => o.editor.trim() || 'uma posição sem editor').join(' e ');

export function CampoDaIlha({ p, posicoes, turnos, ilhas, costume, mudar, depois, antes }: Props) {
  const [aberta, setAberta] = useState(false);
  // o que está sendo escrito; null: o campo mostra a ilha escolhida
  const [escrito, setEscritoAgora] = useState<string | null>(null);
  // o mesmo, para o blur que vem logo depois de escolher (o estado ainda é o de antes)
  const escritoAgora = useRef<string | null>(null);
  const setEscrito = (t: string | null) => {
    escritoAgora.current = t;
    setEscritoAgora(t);
  };
  const [ativo, setAtivo] = useState(0);
  // andou pela lista com as setas: Enter escolhe a ativa, mesmo sem nada escrito
  const [navegou, setNavegou] = useState(false);
  const atual = ilhas.find((i) => i.id === p.ilha) ?? null;
  const deCostume = ilhaDeCostume(p.editor, costume);
  const sugerida = ilhas.find((i) => i.id === deCostume) ?? null;
  // a de costume primeiro; depois, as que casam com o que foi escrito
  const casam = ilhasQueCasam(escrito ?? '', ilhas);
  const opcoes = aberta ? (sugerida && casam.includes(sugerida) ? [sugerida, ...casam.filter((i) => i !== sugerida)] : casam) : [];
  const i = Math.min(ativo, Math.max(0, opcoes.length - 1));
  // a mesma sala (#165): a AVID 46 e a ILHA 46 repetidas no cadastro
  const sala = salaPeloId(ilhas);
  const ocupada = quemEstaNaIlha(p.ilha, p.turno, posicoes, p.id, sala);
  const turno = turnos.find((t) => t.id === p.turno)?.nome.toLowerCase() ?? p.turno;
  const lista = `ilhas-${p.id}`;

  const escolher = (ilha: Ilha | null) => {
    mudar(ilha?.id ?? '');
    setEscrito(null);
    setAberta(false);
  };
  /** Ao sair: o escrito que é uma ilha fica; o vazio tira a ilha; o resto volta ao que estava. */
  const assentar = () => {
    const t = escritoAgora.current;
    if (t === null) return;
    if (!t.trim()) escolher(null);
    else {
      const achada = reconhecerIlha(t, ilhas);
      if (achada) escolher(achada);
      else setEscrito(null);
    }
  };

  return (
    <div className="montar-campo campo-ilha">
      <input
        className={`montar-in ilha${p.ilha ? '' : ' sem-ilha'}`}
        data-posicao={p.id}
        data-campo="ilha"
        value={escrito ?? (atual ? rotuloDaIlha(atual) : p.ilha ? 'ilha fora do cadastro' : '')}
        placeholder={sugerida ? `${rotuloDaIlha(sugerida)}, de costume` : 'ilha'}
        spellCheck={false}
        autoComplete="off"
        aria-label="Ilha"
        role="combobox"
        aria-expanded={aberta && opcoes.length > 0}
        aria-controls={lista}
        aria-autocomplete="list"
        onFocus={() => (setAberta(true), setAtivo(0), setNavegou(false))}
        onBlur={() => (assentar(), setAberta(false))}
        onChange={(e) => (setEscrito(e.target.value), setAberta(true), setAtivo(0))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || (e.key === 'ArrowUp' && aberta && i > 0)) {
            e.preventDefault();
            if (!aberta) return setAberta(true);
            setNavegou(true);
            setAtivo(Math.max(0, Math.min(opcoes.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            antes();
          } else if (e.key === 'Escape') {
            setEscrito(null);
            setAberta(false);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            // escrevendo, ou com o campo vazio: a opção ativa (a de costume, quando há); senão, fica a que estava
            if (escrito !== null && !escrito.trim()) escolher(null);
            else if (aberta && opcoes.length && (escrito !== null || navegou || (!p.ilha && sugerida))) escolher(opcoes[i]);
            else setEscrito(null);
            depois();
          } else if (e.key === 'Tab' && !e.shiftKey && escrito?.trim() && aberta && opcoes.length) {
            // Tab completa com a opção da lista (e segue para o horário)
            escolher(reconhecerIlha(escrito, ilhas) ?? opcoes[i]);
          } else if (e.key === 'Backspace' && escrito === null && p.ilha) {
            // apagar a ilha escolhida começa do vazio
            e.preventDefault();
            setEscrito('');
          }
        }}
      />
      <div className="montar-sob">
        {ocupada.length > 0 && (
          <span className="montar-alerta">
            ocupada: {nomes(ocupada)} na {turno}
          </span>
        )}
        {atual?.nome && !ocupada.length && <span className="montar-leve">{atual.nome}</span>}
        {!p.ilha && sugerida && !aberta && <span className="montar-leve">de costume: <b>{rotuloDaIlha(sugerida)}</b></span>}
      </div>
      {aberta && opcoes.length > 0 && (
        <div className="menu montar-lista lista-ilhas" id={lista} role="listbox" aria-label="Ilhas cadastradas">
          {opcoes.map((o, k) => {
            const com = quemEstaNaIlha(o.id, p.turno, posicoes, p.id, sala);
            return (
              <div key={o.id} role="option" aria-selected={k === i} className={`menu-item${k === i ? ' ativo' : ''}`} onMouseDown={(e) => (e.preventDefault(), escolher(o))}>
                <span className="ilha-rotulo">{rotuloDaIlha(o)}</span>
                <span className="menu-texto">
                  {o.nome && <strong>{o.nome}</strong>}
                  <small className={com.length ? 'escalado' : ''}>{com.length ? `com ${nomes(com)}` : 'livre'}</small>
                </span>
                {o === sugerida && <span className="montar-tag">de costume</span>}
              </div>
            );
          })}
          <p className="montar-lista-pe">
            <kbd>↑</kbd> <kbd>↓</kbd> escolhe · <kbd>Enter</kbd> confirma · <kbd>Esc</kbd> fecha
          </p>
        </div>
      )}
    </div>
  );
}
