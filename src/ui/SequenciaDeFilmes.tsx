import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { imagemDaPagina, type PaginaDaPrevia } from '../dados/armazenamento';
import {
  atualizarSequencia,
  JANELA,
  montarSequencia,
  quadroNaRolagem,
  transformar,
  type FilmeNaSequencia,
} from '../filmes/sequencia';
import { anotacao, Circulo, usePreviaAberta } from './Filmes';
import { Icone } from './icones';
import { LinkQuebrado } from './LinkQuebrado';
import { semMovimento } from './util';

/* A prévia aberta no celular (até 600px, #81): a sequência única de filmes, sem paginar o PDF. Em cima, a página
   ampliada no pôster do filme atual, com o contorno à mão; embaixo, o card do filme, só de leitura (responder é o #82).
   Arrastar para o lado é a rolagem nativa com encaixe (estilos.css): passar da metade ou um gesto rápido troca de
   filme. A imagem de cima acompanha a rolagem a cada quadro: desliza entre pôsteres da mesma página e esmaece entre
   páginas (sem movimento, só esmaece). A sequência é montada quando a prévia abre; o que muda depois (a resposta de
   alguém no computador, uma página lida) atualiza o filme no lugar, e o que sai fica riscado. */

export function SequenciaDeFilmes({
  id,
  avisar,
  verPrevias,
  voltar,
}: {
  id: string;
  avisar: (t: string) => void;
  verPrevias: () => void;
  voltar: () => void;
}) {
  const { previa, falha, carregar } = usePreviaAberta(id, avisar);
  const [seq, setSeq] = useState<FilmeNaSequencia[] | null>(null);
  // a primeira abertura monta a sequência; as reaberturas (a versão mudou) atualizam cada filme no lugar
  useEffect(() => {
    if (previa) setSeq((s) => (s ? atualizarSequencia(s, previa.paginas) : montarSequencia(previa.paginas)));
  }, [previa]);

  if (!previa && falha) return <LinkQuebrado caso={{ tipo: falha }} voltar={voltar} verPrevias={verPrevias} tentar={() => void carregar()} />;
  if (!previa || !seq) return <main className="sequencia" aria-busy="true" />;
  if (!seq.length)
    return (
      <main className="sequencia vazia">
        <p>Nenhum filme lido nesta prévia ainda.</p>
      </main>
    );
  return <Sequencia previaId={previa.id} paginas={previa.paginas} seq={seq} />;
}

function Sequencia({ previaId, paginas, seq }: { previaId: string; paginas: PaginaDaPrevia[]; seq: FilmeNaSequencia[] }) {
  const faixa = useRef<HTMLDivElement>(null);
  const imagem = useRef<HTMLDivElement>(null);
  // o filme da barra ("12/34"): o que está mais à vista
  const [atual, setAtual] = useState(0);
  // os dois filmes entre os quais a rolagem está: as duas camadas da imagem mostram as páginas deles
  const [par, setPar] = useState<[number, number]>([0, 0]);
  const tamanhoDe = useCallback((numero: number) => paginas.find((p) => p.numero === numero)?.tamanho ?? null, [paginas]);

  // pinta a imagem de cima na posição da rolagem: sem o React, a cada quadro
  const pintar = useCallback(() => {
    const el = faixa.current;
    const caixa = imagem.current;
    if (!el || !caixa || !el.clientWidth) return;
    const pos = el.scrollLeft / el.clientWidth;
    const q = quadroNaRolagem(seq, pos, semMovimento());
    setAtual(Math.min(seq.length - 1, Math.max(0, Math.round(pos))));
    if (q.de !== par[0] || q.para !== par[1]) return setPar([q.de, q.para]); // o efeito depois do render pinta de novo
    caixa.dataset.modo = q.modo;
    const [w, h] = [caixa.clientWidth, caixa.clientHeight];
    const [a, b] = caixa.querySelectorAll<HTMLElement>('.camada');
    const por = (camada: HTMLElement | undefined, k: number, enq = seq[k].enquadramento, opacidade = 1) => {
      if (!camada) return;
      const t = transformar(enq, tamanhoDe(seq[k].numero), JANELA);
      const folha = camada.firstElementChild as HTMLElement;
      folha.style.width = `${t.largura * 100}%`;
      folha.style.height = `${t.altura * 100}%`;
      folha.style.transform = `translate(${t.x * w}px, ${t.y * h}px) scale(${t.zoom})`;
      camada.style.opacity = String(opacidade);
    };
    const desliza = q.modo === 'deslizar';
    por(a, q.de, desliza ? q.enquadramento : undefined, desliza ? 1 : 1 - q.t);
    por(b, q.para, undefined, desliza ? 0 : q.t);
    // o contorno passa de um pôster ao outro junto com a imagem; esmaecendo, cada camada leva só o do filme dela
    const contorno = { a: { de: desliza ? 1 - q.t : 1, para: desliza ? q.t : 0 }, b: { de: 0, para: 1 } };
    for (const c of caixa.querySelectorAll<HTMLElement>('.contorno')) {
      const camada = c.closest('.camada') === a ? contorno.a : contorno.b;
      c.style.opacity = String(c.dataset.papel === 'de' ? camada.de : camada.para);
    }
  }, [seq, par, tamanhoDe]);

  useLayoutEffect(() => pintar());
  useEffect(() => {
    const el = faixa.current;
    if (!el) return;
    let quadro = 0;
    const rolou = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(pintar);
    };
    el.addEventListener('scroll', rolou, { passive: true });
    window.addEventListener('resize', rolou);
    return () => {
      cancelAnimationFrame(quadro);
      el.removeEventListener('scroll', rolou);
      window.removeEventListener('resize', rolou);
    };
  }, [pintar]);

  const camada = (k: number) => {
    const s = seq[k];
    // o contorno dos dois filmes do caminho que estão nesta página (o de e o para)
    const contornos = [par[0], par[1]].flatMap((j, n) =>
      (n === 0 || j !== par[0]) && seq[j].numero === s.numero && seq[j].caixa ? [{ j, papel: n === 0 ? 'de' : 'para', c: seq[j].caixa! }] : [],
    );
    return (
      <div className="camada">
        <div className="folha">
          <img src={imagemDaPagina(previaId, s.numero)} alt="" draggable={false} />
          {contornos.map(({ j, papel, c }) => (
            <span
              key={papel}
              className="contorno"
              data-papel={papel}
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.width * 100}%`, height: `${c.height * 100}%` }}
            >
              <Circulo traco={seq[j].filme.poster ?? 0} className="circulo" />
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <main className="sequencia">
      <div className="sequencia-imagem" ref={imagem} aria-hidden="true">
        {camada(par[0])}
        {camada(par[1])}
      </div>
      <div className="sequencia-faixa" ref={faixa} aria-label="Os filmes da prévia">
        {seq.map((s, k) => (
          <section className="sequencia-item" key={k} aria-label={`Filme ${k + 1} de ${seq.length}`} aria-current={k === atual || undefined}>
            <div className="janela" />
            <CardDoFilme previaId={previaId} s={s} />
          </section>
        ))}
      </div>
      <footer className="sequencia-barra">
        <span className="posicao" aria-live="polite">
          {atual + 1}/{seq.length}
        </span>
      </footer>
    </main>
  );
}

/** A marca do card, só de leitura: ✓ pronto, ! pede atenção, o Trello (já tem card) ou indo para o Trello. */
function MarcaDoCard({ s }: { s: FilmeNaSequencia }) {
  const f = s.filme;
  const c = f.conferencia;
  if (!c) return null;
  if (f.envio?.estado === 'enviando') return <span className="ficha-marca lendo" aria-label="Indo para o Trello" />;
  if (s.pendente || (f.envio?.estado === 'erro' && c.marca === 'ok'))
    return (
      <span className={`ficha-marca ${s.pendente ? 'revisar' : 'erro'}`} aria-label={s.pendente ? 'Pede atenção' : 'Não foi para o Trello'}>
        <Icone nome="atencao" tam={12} traco={3} />
      </span>
    );
  if (c.marca === 'trello')
    return (
      <span className="ficha-marca trello" aria-label="Já tem card">
        <Icone nome="quadro" tam={12} traco={2.4} />
      </span>
    );
  return (
    <span className="ficha-marca ok" aria-label="Pronto">
      <Icone nome="certo" tam={12} traco={3} />
    </span>
  );
}

/**
 * O card do filme, só de leitura: o recorte do pôster, a sessão, o título, a anotação à mão, o ano, a data, o inédito,
 * a marca e as artes (as novas e as que já existem). O da Sessão da Tarde mostra só o pôster, o nome e a marca.
 */
function CardDoFilme({ previaId, s }: { previaId: string; s: FilmeNaSequencia }) {
  const f = s.filme;
  const nota = anotacao(f);
  const artes = f.conferencia?.artes;
  return (
    <article className={`card-celular ${s.tarde ? 'tarde' : ''} ${s.saiu ? 'saiu' : ''} ${s.pendente ? 'pendente' : ''}`}>
      {f.poster !== null ? (
        <img className="cc-poster" src={imagemDaPagina(previaId, s.numero, f.poster + 1)} alt="" />
      ) : (
        <span className="cc-poster sem" />
      )}
      <div className="cc-corpo">
        {!s.tarde && <span className="cc-sessao">{f.sessao || 'sem sessão'}</span>}
        <h2 className="cc-titulo">{f.titulo || 'sem título'}</h2>
        {s.saiu ? <span className="cc-nota">saiu da prévia</span> : nota && <span className="cc-nota">{nota}</span>}
        {!s.tarde && (
          <span className="cc-linha">
            {f.conferencia?.ano ?? f.ano ?? '—'} <span>{f.data.slice(0, 5)}</span>
            {f.inedito && <b className="cf-inedito">INÉDITO</b>}
          </span>
        )}
        {!s.tarde && !!artes && (artes.novas.length > 0 || artes.existentes.length > 0) && (
          <ul className="cc-artes">
            {artes.novas.map((a) => (
              <li key={`n-${a}`}>{a}</li>
            ))}
            {artes.existentes.map((a) => (
              <li key={`e-${a}`} className="existe">
                {a}
              </li>
            ))}
          </ul>
        )}
      </div>
      <MarcaDoCard s={s} />
    </article>
  );
}
