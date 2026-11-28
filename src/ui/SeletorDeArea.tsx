import { Fragment, useEffect, useRef, useState } from 'react';
import { listarPrevias } from '../dados/armazenamento';
import { haFilmeParaRevisar } from '../filmes/andamento';
import { AREAS, type Area } from '../modelo/areas';
import { RABISCO } from './cena';
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
      <button type="button" className="seletor-area" aria-haspopup="menu" aria-expanded={aberto} aria-label={`Área: ${atual}. Trocar de área`} title="Trocar de área" onClick={() => setAberto((v) => !v)}>
        {/* no celular, o ícone da área no lugar do nome, para os caminhos do topo caberem (#168) */}
        <span className="seletor-area-icone" aria-hidden="true"><Icone nome={ICONE[atual]} tam={20} /></span>
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

/** Os caminhos do topo, pela ordem fixa (#168). */
export type IdDoCaminho = 'agenda' | 'producoes' | 'campanhas' | 'filmes' | 'roteiros' | 'pauta' | 'montar';

interface Caminho {
  id: IdDoCaminho;
  href: string;
  nome: string;
  icone: NomeIcone;
  ir: () => void;
}

/** O caminho aberto na última linha do logo montada: a tela nova abre com ele e anima a troca (#168). Cada tela monta o
    próprio topo, então a memória fica fora do componente. */
let abertoAntes: IdDoCaminho | undefined;

/**
 * Os caminhos da linha do logo (#105, #156, #168): só os ícones, sempre na mesma ordem e no mesmo lugar — na Designer,
 * "No Trello · Produções · Campanhas (#180) · Filmes · Pauta da edição"; no Redator e no Editor, só a Pauta. O da tela atual não some: se
 * abre com o texto, como as abas dos Cadastros, e a largura anima (a tela nova começa com o caminho da anterior aberto e
 * troca no quadro seguinte). Só para a coordenação, "Montar a pauta" (#123) vem depois da Pauta. A única bolinha
 * separadora fica antes da Pauta, que é de todo mundo. O aviso de filme para revisar é uma bolinha laranja no ícone dos
 * Filmes. O nome de cada um vai na dica (hover e foco) e no `aria-label`. No celular, só os ícones. Os Roteiros (#189),
 * os escritos no PROMeiro, vêm por último entre os da área: na Designer (a equipe toda e a coordenação) em #/roteiros e,
 * no Redator, a própria área (`roteirosEm` "#/redator").
 */
export function CaminhosDoTopo({ agenda, producoes, campanhas, filmes, roteiros, roteirosEm = '#/roteiros', pauta, montar, atual }: { agenda?: () => void; producoes?: () => void; campanhas?: () => void; filmes?: () => void; roteiros?: () => void; roteirosEm?: string; pauta?: () => void; montar?: () => void; atual?: IdDoCaminho }) {
  const revisar = useFilmesParaRevisar(!!filmes);
  const [aberto, setAberto] = useState(() => abertoAntes ?? atual);
  useEffect(() => {
    abertoAntes = atual;
    if (aberto === atual) return;
    // dois quadros: o primeiro pinta o caminho de antes aberto, o segundo troca e a transição corre
    let q = requestAnimationFrame(() => (q = requestAnimationFrame(() => setAberto(atual))));
    return () => cancelAnimationFrame(q);
  }, [atual]);
  const caminhos: Caminho[] = [
    ...(agenda ? [{ id: 'agenda' as const, href: '#/designer', nome: 'No Trello', icone: 'quadro' as const, ir: agenda }] : []),
    ...(producoes ? [{ id: 'producoes' as const, href: '#/designer/producoes', nome: 'Produções', icone: 'colunas' as const, ir: producoes }] : []),
    // as campanhas (#180), logo depois das Produções que elas juntam
    ...(campanhas ? [{ id: 'campanhas' as const, href: '#/campanhas', nome: 'Campanhas', icone: 'etiqueta' as const, ir: campanhas }] : []),
    ...(filmes ? [{ id: 'filmes' as const, href: '#/filmes', nome: 'Filmes', icone: 'filme' as const, ir: filmes }] : []),
    // os Roteiros escritos no PROMeiro (#189)
    ...(roteiros ? [{ id: 'roteiros' as const, href: roteirosEm, nome: 'Roteiros', icone: 'lapis' as const, ir: roteiros }] : []),
    ...(pauta ? [{ id: 'pauta' as const, href: '#/pauta', nome: 'Pauta da edição', icone: 'edicao' as const, ir: pauta }] : []),
    ...(montar ? [{ id: 'montar' as const, href: '#/pauta/montar', nome: 'Montar a pauta', icone: 'ajustes' as const, ir: montar }] : []),
  ];
  if (!caminhos.length) return null;
  return (
    <nav className="caminhos-do-topo" aria-label="Caminhos">
      {caminhos.map((c, i) => {
        const aviso = c.id === 'filmes' && revisar;
        const agora = c.id === atual;
        const classe = c.id === 'montar' ? 'topo-montar topo-pauta' : `topo-${c.id}`;
        return (
          <Fragment key={c.id}>
            {/* a Pauta é de todo mundo: a bolinha a separa dos caminhos da área */}
            {c.id === 'pauta' && i > 0 && <i className="caminho-bolinha" aria-hidden="true" />}
            <a
              className={`${classe}${c.id === aberto ? ' aberto' : ''}`}
              href={c.href}
              aria-label={aviso ? 'Filmes, com filme para revisar' : c.nome}
              aria-current={agora ? 'page' : undefined}
              data-dica={aviso ? 'Filmes: há filme esperando revisão' : c.nome}
              onClick={(e) => {
                e.preventDefault();
                if (!agora) c.ir();
              }}
            >
              <span className="caminho-icone">
                <Icone nome={c.icone} tam={17} traco={1.7} />
                {aviso && <i className="caminho-aviso" aria-hidden="true" />}
              </span>
              <span className="caminho-nome" aria-hidden="true">
                <span>
                  <span className="caminho-texto">
                    {c.nome}
                    {c.id === aberto && (
                      <svg className="sub" viewBox="0 0 100 14" preserveAspectRatio="none">
                        <path pathLength={1} d={RABISCO} />
                      </svg>
                    )}
                  </span>
                </span>
              </span>
            </a>
          </Fragment>
        );
      })}
    </nav>
  );
}
