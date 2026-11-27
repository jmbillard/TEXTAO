import { Fragment, useEffect, useRef, useState } from 'react';
import { listarPrevias } from '../dados/armazenamento';
import { haFilmeParaRevisar } from '../filmes/andamento';
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

/** De quanto em quanto tempo o topo pergunta se há filme esperando revisão na aba Filmes. */
const FILMES_MS = 30_000;

/** Há filme esperando revisão na aba Filmes (#156), pela lista das prévias: pergunta de tempos em tempos enquanto o
    topo mostra o caminho dos Filmes. Sem resposta, fica como estava. */
function useFilmesParaRevisar(ligado: boolean) {
  const [revisar, setRevisar] = useState(false);
  useEffect(() => {
    if (!ligado) return;
    let vivo = true;
    const perguntar = () => void listarPrevias().then((l) => vivo && setRevisar(haFilmeParaRevisar(l)), () => {});
    perguntar();
    const t = setInterval(perguntar, FILMES_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [ligado]);
  return ligado && revisar;
}

interface Caminho {
  classe: string;
  href: string;
  nome: string;
  icone: NomeIcone;
  ir: () => void;
}

/**
 * Os caminhos da linha do logo (#105, #156), em texto, separados por bolinhas: na Designer, "Produções · Filmes · Pauta
 * da edição"; na tela de produções, "No Trello" no lugar das Produções; no Redator e no Editor, só a Pauta. Só para a
 * coordenação, "Montar a pauta" (#123) vem depois da Pauta. A bolinha logo depois de Filmes fica laranja quando há
 * filme esperando revisão na aba Filmes. No celular, só os ícones.
 */
export function CaminhosDoTopo({ producoes, agenda, filmes, pauta, montar }: { producoes?: () => void; agenda?: () => void; filmes?: () => void; pauta?: () => void; montar?: () => void }) {
  const revisar = useFilmesParaRevisar(!!filmes);
  const caminhos: Caminho[] = [
    ...(producoes ? [{ classe: 'topo-producoes', href: '#/designer/producoes', nome: 'Produções', icone: 'colunas' as const, ir: producoes }] : []),
    ...(agenda ? [{ classe: 'topo-agenda', href: '#/designer', nome: 'No Trello', icone: 'quadro' as const, ir: agenda }] : []),
    ...(filmes ? [{ classe: 'topo-filmes', href: '#/filmes', nome: 'Filmes', icone: 'filme' as const, ir: filmes }] : []),
    ...(pauta ? [{ classe: 'topo-pauta', href: '#/pauta', nome: 'Pauta da edição', icone: 'edicao' as const, ir: pauta }] : []),
    ...(montar ? [{ classe: 'topo-pauta topo-montar', href: '#/pauta/montar', nome: 'Montar a pauta', icone: 'ajustes' as const, ir: montar }] : []),
  ];
  if (!caminhos.length) return null;
  return (
    <nav className="caminhos-do-topo" aria-label="Caminhos">
      {caminhos.map((c, i) => {
        const deFilmes = c.classe === 'topo-filmes';
        // a bolinha depois de Filmes é a dele: laranja com filme para revisar (no fim da linha, só quando é laranja)
        const bolinha = i < caminhos.length - 1 || (deFilmes && revisar);
        return (
          <Fragment key={c.classe}>
            <a
              className={c.classe}
              href={c.href}
              aria-label={deFilmes && revisar ? 'Filmes, com filme para revisar' : c.nome}
              title={deFilmes && revisar ? 'Há filme esperando revisão na aba Filmes' : undefined}
              onClick={(e) => (e.preventDefault(), c.ir())}
            >
              <Icone nome={c.icone} tam={17} traco={1.7} />
              <span>{c.nome}</span>
            </a>
            {bolinha && <i className={`caminho-bolinha${deFilmes ? ' de-filmes' : ''}${deFilmes && revisar ? ' revisar' : ''}`} aria-hidden="true" />}
          </Fragment>
        );
      })}
    </nav>
  );
}
