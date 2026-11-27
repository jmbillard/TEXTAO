import { useEffect, useRef, useState } from 'react';
import { AREAS, type Area } from '../modelo/areas';
import { Icone, type NomeIcone } from './icones';
import './areas.css';

const ICONE: Record<Area, NomeIcone> = { designer: 'arte', redator: 'arquivo', editor: 'edicao' };

/** O caminho "PROMeiro / designer ▾" na linha do logo (#101): o clique em "designer ▾" abre a lista das áreas da
    pessoa, cada uma com o que mostra e o endereço dela. Para quem tem uma área só, nada aparece. */
export function SeletorDeArea({ areas, atual, admin, trocar }: { areas: readonly Area[]; atual: Area; admin?: boolean; trocar: (area: Area) => void }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('pointerdown', fora, true);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('keydown', tecla);
    };
  }, [aberto]);
  if (areas.length < 2) return null;
  return (
    <span className="caminho-area" ref={caixa}>
      <span className="caminho-area-barra" aria-hidden="true">/</span>
      <button type="button" className="seletor-area" aria-haspopup="menu" aria-expanded={aberto} title="Trocar de área" onClick={() => setAberto((v) => !v)}>
        <span className="seletor-area-nome">{atual}</span>
        <Icone nome="baixo" tam={16} traco={2.2} />
      </button>
      {aberto && (
        <div className="areas-menu" role="menu" aria-label="Áreas">
          {AREAS.filter((a) => areas.includes(a.id)).map((a) => (
            <button
              key={a.id}
              type="button"
              className="area-item"
              role="menuitemradio"
              aria-checked={a.id === atual}
              onClick={() => {
                setAberto(false);
                if (a.id !== atual) trocar(a.id);
              }}
            >
              <span className="area-bolha"><Icone nome={ICONE[a.id]} tam={17} /></span>
              <b>
                {a.nome}
                <code>/{a.id}</code>
              </b>
              <small>{a.mostra}</small>
              {a.id === atual && <span className="area-certo"><Icone nome="certo" tam={16} traco={2.4} /></span>}
            </button>
          ))}
          <p className="areas-menu-pe">{admin ? 'Como administrador, você vê as três. ' : ''}O PROMeiro abre na última que você usou.</p>
        </div>
      )}
    </span>
  );
}

/** O grupo "De todo mundo" na linha do logo (#105): o que não é de uma área só, o mesmo em todas elas. Hoje, a Pauta
    da edição. No celular, só o ícone. */
export function DeTodoMundo({ pauta }: { pauta: () => void }) {
  return (
    <nav className="de-todo-mundo" aria-label="De todo mundo">
      <span className="de-todo-mundo-rotulo" aria-hidden="true">de todo mundo</span>
      <a className="topo-pauta" href="#/pauta" aria-label="Pauta da edição" onClick={(e) => (e.preventDefault(), pauta())}>
        <Icone nome="edicao" tam={17} traco={1.7} />
        <span>Pauta da edição</span>
      </a>
    </nav>
  );
}
