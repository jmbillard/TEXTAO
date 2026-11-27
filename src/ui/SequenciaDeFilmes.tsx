import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  imagemDaPagina,
  posterDoFilme,
  type CardDaPrevia,
  type MudancaNoFilme,
  type PaginaDaPrevia,
  type PessoaNaPrevia,
  type Previa,
} from '../dados/armazenamento';
import { corDe } from '../dados/colaboracao';
import { podeSubir } from '../filmes/fileiras';
import { opcoesDaPergunta } from '../filmes/perguntas';
import {
  atualizarSequencia,
  avancaDepoisDaResposta,
  JANELA,
  montarSequencia,
  PAGINA_INTEIRA,
  paginaInteira,
  quadroNaRolagem,
  telaFinal,
  transformar,
  type FilmeNaSequencia,
} from '../filmes/sequencia';
import { anotacao, Circulo, Presentes, taoVendo, Titulo, usePreviaAberta } from './Filmes';
import { Icone } from './icones';
import { LinkQuebrado } from './LinkQuebrado';
import { semMovimento } from './util';
import './sequenciaDeFilmes.css';

/* A prévia aberta no celular (até 600px, #81): a sequência única de filmes, sem paginar o PDF. Em cima, a página
   ampliada no pôster do filme atual, com o contorno à mão; embaixo, o card do filme, em que se responde (#82).
   Arrastar para o lado é a rolagem nativa com encaixe (estilos.css): passar da metade ou um gesto rápido troca de
   filme. A imagem de cima acompanha a rolagem a cada quadro: desliza entre pôsteres da mesma página e esmaece entre
   páginas (sem movimento, só esmaece). A sequência é montada quando a prévia abre; o que muda depois (a resposta de
   alguém no computador, uma página lida) atualiza o filme no lugar, e o que sai fica riscado.
   Responder no card (#82): as perguntas do ! são opções tocáveis, com as mesmas mudanças de filme do balão do
   computador; o título se corrige no próprio card; o filme da Sessão da Tarde com a vaga do pôster dele em cima sobe
   por um botão. Respondida a pergunta, a marca nova aparece por um instante e a sequência anda sozinha, só se a pessoa
   ainda estiver naquele filme. A presença é a mesma do computador: quem mais está na prévia, e o card em que cada um
   está (o filme à vista, para quem está no celular) com o título grifado na cor da pessoa e a rubrica.
   A página inteira (#83): um toque na imagem de cima mostra a página do filme atual inteira, com ele contornado e os
   outros pendentes da página com o círculo menor; tocar num pôster leva até o filme dele, tocar fora volta ao atual. O
   filme sem pôster já mostra a página inteira, com a nota à mão "sem pôster": um aviso só, sem pergunta.
   A tela final (#84): depois do último filme, o resumo, que é o último item da faixa (cobre a imagem de cima ao entrar):
   "N prontos · M com pergunta", quantos já estão no Trello, as pendências (tocadas, voltam ao filme), o resultado do
   envio em cada filme e o Enviar embaixo, ao alcance do polegar, o mesmo do computador: leva os prontos de todas as
   páginas, e os com pergunta ficam para o próximo envio. A barra diz "resumo". */

/** Quanto tempo a marca nova fica à vista antes de a sequência andar sozinha. */
const MARCA_MS = 550;

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
  const { previa, falha, carregar, pessoas, mudar, mexer, enviar, mandando } = usePreviaAberta(id, avisar);
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
  return (
    <Sequencia
      previaId={previa.id}
      paginas={previa.paginas}
      seq={seq}
      pessoas={pessoas}
      mudar={mudar}
      mexer={mexer}
      envio={previa.envio}
      enviar={enviar}
      mandando={mandando}
    />
  );
}

function Sequencia({
  previaId,
  paginas,
  seq,
  pessoas,
  mudar,
  mexer,
  envio,
  enviar,
  mandando,
}: {
  previaId: string;
  paginas: PaginaDaPrevia[];
  seq: FilmeNaSequencia[];
  /** quem mais está na prévia, com o card em que está */
  pessoas: PessoaNaPrevia[];
  mudar: (numero: number, i: number, m: MudancaNoFilme) => Promise<void>;
  /** o card em que esta pessoa está: o filme à vista */
  mexer: (card: CardDaPrevia | null) => void;
  /** o envio ao Trello está ligado? (o que falta, quando não está) */
  envio: Previa['envio'];
  enviar: () => Promise<void>;
  mandando: boolean;
}) {
  const faixa = useRef<HTMLDivElement>(null);
  const imagem = useRef<HTMLDivElement>(null);
  // o filme da barra ("12/34"): o que está mais à vista; seq.length é a tela final ("resumo")
  const [atual, setAtual] = useState(0);
  const noFim = atual === seq.length;
  // os dois filmes entre os quais a rolagem está: as duas camadas da imagem mostram as páginas deles
  const [par, setPar] = useState<[number, number]>([0, 0]);
  const tamanhoDe = useCallback((numero: number) => paginas.find((p) => p.numero === numero)?.tamanho ?? null, [paginas]);
  // o que vale agora, para o avanço sozinho decidir depois do instante da marca nova
  const agora = useRef({ seq, atual });
  agora.current = { seq, atual };
  const avanco = useRef(0);
  useEffect(() => () => window.clearTimeout(avanco.current), []);
  const irPara = (k: number, pulo = false) => {
    const el = faixa.current;
    if (el) el.scrollTo({ left: k * el.clientWidth, behavior: pulo || semMovimento() ? 'auto' : 'smooth' });
  };
  // a página inteira aberta (do filme atual)
  const [inteira, setInteira] = useState(false);
  /** O toque na página inteira: num pôster, vai até o filme dele (de um pulo: a página some por cima); fora, fica. */
  const fecharInteira = (k?: number) => {
    setInteira(false);
    if (k !== undefined && k !== atual) irPara(k, true);
  };
  /** Grava a resposta no filme k; depois do instante da marca nova, anda (do último, para a tela final) se ele parou de
      perguntar e se a pessoa ainda está nele. */
  const responder = async (k: number, m: MudancaNoFilme) => {
    const antes = agora.current.seq[k];
    if (!antes || antes.saiu) return;
    await mudar(antes.numero, antes.i, m);
    window.clearTimeout(avanco.current);
    avanco.current = window.setTimeout(() => {
      const { seq: s, atual: a } = agora.current;
      if (a === k && avancaDepoisDaResposta(antes, s[k], m)) irPara(k + 1);
    }, MARCA_MS);
  };
  // o filme à vista é o card em que esta pessoa está: os outros veem o título grifado na cor dela
  const naVista = seq[atual] && !seq[atual].saiu ? seq[atual] : null;
  const [vistaNumero, vistaI] = [naVista?.numero, naVista?.i];
  useEffect(() => mexer(vistaNumero === undefined || vistaI === undefined ? null : { numero: vistaNumero, i: vistaI }), [mexer, vistaNumero, vistaI]);

  // pinta a imagem de cima na posição da rolagem: sem o React, a cada quadro
  const pintar = useCallback(() => {
    const el = faixa.current;
    const caixa = imagem.current;
    if (!el || !caixa || !el.clientWidth) return;
    const pos = el.scrollLeft / el.clientWidth;
    const q = quadroNaRolagem(seq, pos, semMovimento());
    setAtual(Math.min(seq.length, Math.max(0, Math.round(pos))));
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
    for (const c of caixa.querySelectorAll<HTMLElement>('.contorno, .sem-poster')) {
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
    // o contorno (ou, sem pôster, a nota) dos dois filmes do caminho que estão nesta página (o de e o para)
    const marcas = [par[0], par[1]].flatMap((j, n) =>
      (n === 0 || j !== par[0]) && seq[j].numero === s.numero ? [{ j, papel: n === 0 ? 'de' : 'para', c: seq[j].caixa }] : [],
    );
    return (
      <div className="camada">
        <div className="folha">
          <img src={imagemDaPagina(previaId, s.numero)} alt="" draggable={false} />
          {marcas.map(({ j, papel, c }) =>
            c ? (
              <span key={papel} className="contorno" data-papel={papel} style={emCaixa(c)}>
                <Circulo traco={seq[j].filme.poster ?? 0} className="circulo" />
              </span>
            ) : null,
          )}
        </div>
        {/* a nota não amplia com a página: fica no canto da janela */}
        {marcas.map(({ papel, c }) => (c ? null : <SemPoster key={papel} papel={papel} />))}
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
        {seq.map((s, k) => {
          const pagina = paginas.find((p) => p.numero === s.numero);
          return (
            <section className="sequencia-item" key={k} aria-label={`Filme ${k + 1} de ${seq.length}`} aria-current={k === atual || undefined}>
              <button type="button" className="janela" aria-label="Ver a página inteira" onClick={() => setInteira(true)} />
              <CardDoFilme
                previaId={previaId}
                s={s}
                ali={pessoas.filter((o) => !s.saiu && o.card?.numero === s.numero && o.card?.i === s.i)}
                sobe={!s.saiu && !!pagina && podeSubir(pagina, s.i)}
                responder={(m) => responder(k, m)}
              />
            </section>
          );
        })}
        <TelaFinal
          previaId={previaId}
          seq={seq}
          atual={noFim}
          envio={envio}
          enviar={enviar}
          mandando={mandando}
          voltar={(k) => irPara(k, true)}
        />
      </div>
      <div className="sequencia-gente">
        <Presentes pessoas={pessoas} />
      </div>
      {inteira && seq[atual] && (
        <PaginaInteira previaId={previaId} seq={seq} k={atual} tamanho={tamanhoDe(seq[atual].numero)} fechar={fecharInteira} />
      )}
      <footer className="sequencia-barra">
        <span className="posicao" aria-live="polite">
          {noFim ? 'resumo' : `${atual + 1}/${seq.length}`}
        </span>
      </footer>
    </main>
  );
}

/** A caixa do pôster (em proporção da página) como posição na folha. */
const emCaixa = (c: { x: number; y: number; width: number; height: number }) => ({
  left: `${c.x * 100}%`,
  top: `${c.y * 100}%`,
  width: `${c.width * 100}%`,
  height: `${c.height * 100}%`,
});

/** A nota à mão do filme sem pôster: um aviso só, sem pergunta. */
const SemPoster = ({ papel }: { papel?: string }) => (
  <span className="sem-poster" data-papel={papel}>
    sem pôster
  </span>
);

/**
 * A página inteira do filme na posição k, na janela de cima, por cima de tudo: o atual contornado, os outros pendentes
 * da página com o círculo menor, cada pôster um alvo que leva ao filme dele; o toque fora (na página ou fora dela) volta
 * ao atual. O filme sem pôster leva a nota.
 */
function PaginaInteira({
  previaId,
  seq,
  k,
  tamanho,
  fechar,
}: {
  previaId: string;
  seq: FilmeNaSequencia[];
  k: number;
  tamanho: { width: number; height: number } | null;
  /** com a posição de um filme, vai até ele; sem, volta ao atual */
  fechar: (k?: number) => void;
}) {
  const p = paginaInteira(seq, k);
  const t = transformar(PAGINA_INTEIRA, tamanho, JANELA);
  return (
    <div className="pagina-inteira" role="dialog" aria-modal="true" aria-label="A página inteira" onClick={() => fechar()}>
      <div className="pi-janela">
        <div className="pi-folha" style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${t.largura * 100}%`, height: `${t.altura * 100}%` }}>
          <img src={imagemDaPagina(previaId, seq[k].numero)} alt="" draggable={false} />
          {p.posteres.map((o) =>
            o.papel === 'outro' ? null : (
              <span key={`m${o.k}`} className={o.papel === 'atual' ? 'contorno' : 'pi-pendente'} style={emCaixa(o.caixa)}>
                <Circulo traco={(seq[o.k].filme.poster ?? 0) + (o.papel === 'atual' ? 0 : 1)} className={`circulo ${o.papel}`} />
              </span>
            ),
          )}
          {/* o alvo do toque: o pôster, com pelo menos 44px em volta do centro dele */}
          {p.posteres.map((o) => (
            <button
              key={o.k}
              type="button"
              className="pi-poster"
              data-papel={o.papel}
              aria-label={seq[o.k].filme.titulo || 'sem título'}
              aria-current={o.papel === 'atual' || undefined}
              style={{
                left: `${(o.caixa.x + o.caixa.width / 2) * 100}%`,
                top: `${(o.caixa.y + o.caixa.height / 2) * 100}%`,
                width: `max(44px, ${o.caixa.width * 100}%)`,
                height: `max(44px, ${o.caixa.height * 100}%)`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                fechar(o.k);
              }}
            />
          ))}
        </div>
        {p.semPoster && <SemPoster />}
      </div>
      <p className="pi-dica">Toque num pôster para ir até o filme. Fora, volta.</p>
    </div>
  );
}

const prontos = (n: number) => `${n} ${n === 1 ? 'pronto' : 'prontos'}`;

/**
 * A tela final, o último item da faixa: a conta, as pendências (o toque volta ao filme, de um pulo), o resultado do
 * envio em cada filme e o Enviar embaixo. O Enviar é o do computador: os prontos de todas as páginas.
 */
function TelaFinal({
  previaId,
  seq,
  atual,
  envio,
  enviar,
  mandando,
  voltar,
}: {
  previaId: string;
  seq: FilmeNaSequencia[];
  /** a tela final está à vista */
  atual: boolean;
  envio: Previa['envio'];
  enviar: () => Promise<void>;
  mandando: boolean;
  voltar: (k: number) => void;
}) {
  const fim = telaFinal(seq);
  const ligado = envio?.ligado !== false;
  const indo = mandando || fim.envio.some((e) => e.estado === 'enviando');
  const titulo = (k: number) => seq[k].filme.titulo || 'sem título';
  return (
    <section className="sequencia-fim" aria-label="O resumo da prévia" aria-current={atual || undefined}>
      <div className="sf-corpo">
        <h2 className="sf-conta">
          {prontos(fim.prontos)} · {fim.pergunta} com pergunta
        </h2>
        <p className="sf-trello">
          <Icone nome="quadro" tam={15} traco={2.2} />
          {fim.trello ? `${fim.trello} já no Trello` : 'nenhum no Trello ainda'}
        </p>
        {fim.pendencias.length > 0 && (
          <>
            <h3 className="sf-sub">Com pergunta</h3>
            <ul className="sf-pendencias">
              {fim.pendencias.map((k) => {
                const f = seq[k].filme;
                return (
                  <li key={k}>
                    <button type="button" onClick={() => voltar(k)} aria-label={`${titulo(k)}: ${anotacao(f) ?? 'pede atenção'}`}>
                      {f.poster !== null ? <img src={imagemDaPagina(previaId, seq[k].numero, f.poster + 1)} alt="" /> : <span className="sem" />}
                      <span className="sf-titulo">{titulo(k)}</span>
                      <span className="sf-nota">{anotacao(f)}</span>
                      <span className="sf-ir" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {fim.envio.length > 0 && (
          <>
            <h3 className="sf-sub">O envio</h3>
            <ul className="sf-envio">
              {fim.envio.map((e) => (
                <li key={e.k} data-estado={e.estado}>
                  <span className="sf-titulo">{titulo(e.k)}</span>
                  {e.estado === 'enviando' ? (
                    <span className="sf-estado">enviando…</span>
                  ) : e.estado === 'enviado' ? (
                    e.link ? (
                      <a className="sf-estado" href={e.link} target="_blank" rel="noreferrer">
                        enviado
                      </a>
                    ) : (
                      <span className="sf-estado">enviado</span>
                    )
                  ) : (
                    <span className="sf-estado">não foi: {e.erro || 'erro sem motivo'}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="sf-enviar">
        {!ligado ? (
          <p className="sf-dica">O envio está desligado: falta {envio?.faltando.join(', ')}</p>
        ) : (
          fim.pergunta > 0 && <p className="sf-dica">Os com pergunta ficam para o próximo envio.</p>
        )}
        <button className="botao primario" disabled={!ligado || !fim.prontos || indo} onClick={() => void enviar()}>
          <Icone nome="quadro" tam={17} traco={2.2} />
          {indo ? 'Mandando…' : fim.prontos ? `Enviar ${prontos(fim.prontos)}` : 'Enviar'}
        </button>
      </div>
    </section>
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
 * O card do filme: o recorte do pôster, a sessão, o título (corrige-se tocando nele), a anotação à mão (ou a rubrica de
 * quem está no card), o ano, a data, o inédito e a marca; embaixo, as opções da pergunta (logo à mão, antes das artes),
 * as artes (as novas e as que já existem) e o link do card no Trello, quando o filme já está lá. O da Sessão da Tarde mostra só o pôster, o nome e a
 * marca, mais a pergunta, quando há, e o "Subir para a vaga", quando o pôster dele está na fileira de cima.
 */
function CardDoFilme({
  previaId,
  s,
  ali,
  sobe,
  responder,
}: {
  previaId: string;
  s: FilmeNaSequencia;
  /** quem mais está neste card agora */
  ali: PessoaNaPrevia[];
  /** o filme da Sessão da Tarde que pode subir para a vaga do pôster dele em cima */
  sobe: boolean;
  responder: (m: MudancaNoFilme) => Promise<void>;
}) {
  const f = s.filme;
  const nota = anotacao(f);
  const artes = f.conferencia?.artes;
  // uma resposta por vez: a opção tocada espera o servidor
  const [respondendo, setRespondendo] = useState(false);
  // o "Subir para a vaga" aberto: mostra a vaga "???" do pôster dele em cima
  const [vaga, setVaga] = useState(false);
  const responda = async (m: MudancaNoFilme) => {
    if (respondendo) return;
    setRespondendo(true);
    try {
      await responder(m);
    } finally {
      setRespondendo(false);
      setVaga(false);
    }
  };
  const opcoes = s.saiu || f.envio?.estado === 'enviando' ? [] : opcoesDaPergunta(f);
  const pergunta = f.conferencia?.pergunta;
  const trello = f.conferencia?.marca === 'trello' ? f.conferencia.link : f.envio?.estado === 'enviado' ? f.envio.link : undefined;
  return (
    <article
      className={`card-celular ${s.tarde ? 'tarde' : ''} ${s.saiu ? 'saiu' : ''} ${s.pendente ? 'pendente' : ''} ${ali.length ? 'ocupado' : ''}`}
      style={ali.length ? ({ '--cor': corDe(ali[0].email) } as React.CSSProperties) : undefined}
    >
      {f.poster !== null ? (
        <img className="cc-poster" src={imagemDaPagina(previaId, s.numero, f.poster + 1)} alt="" />
      ) : (
        <span className="cc-poster sem" />
      )}
      <div className="cc-corpo">
        {!s.tarde && <span className="cc-sessao">{f.sessao || 'sem sessão'}</span>}
        <h2 className="cc-titulo">{s.saiu ? f.titulo || 'sem título' : <Titulo filme={f} gravar={(titulo) => responda({ titulo })} />}</h2>
        {s.saiu ? (
          <span className="cc-nota">saiu da prévia</span>
        ) : ali.length ? (
          <span className="rubrica agora" title={`${ali.map((o) => o.nome).join(', ')} neste filme agora`}>
            {taoVendo(ali)}
          </span>
        ) : (
          nota && <span className="cc-nota">{nota}</span>
        )}
        {!s.tarde && (
          <span className="cc-linha">
            {f.conferencia?.ano ?? f.ano ?? '—'} <span>{f.data.slice(0, 5)}</span>
            {f.inedito && <b className="cf-inedito">INÉDITO</b>}
          </span>
        )}
      </div>
      <MarcaDoCard s={s} />
      {!s.saiu && pergunta === 'nao-achado' && (
        <p className="cc-explica">
          A leitura nova não achou este filme na página{f.envio?.estado === 'enviado' ? ' (ele já foi para o Trello)' : ''}. Ele fica ou sai?
        </p>
      )}
      {!s.saiu && pergunta === 'sem-titulo' && <p className="cc-explica">Toque no título para escrever.</p>}
      {!s.saiu && !pergunta && f.envio?.estado === 'erro' && (
        <p className="cc-explica">Não foi para o Trello: {f.envio.erro || 'erro sem motivo'}. Vai no próximo Enviar.</p>
      )}
      {opcoes.length > 0 && (
        <div className={`cc-opcoes ${pergunta}`} role="group" aria-label={nota ?? 'A pergunta'}>
          {opcoes.map((o, k) => (
            <button key={k} disabled={respondendo} onClick={() => void responda(o.m)}>
              {o.poster !== undefined &&
                (o.poster ? (
                  <img src={posterDoFilme(o.poster)} alt="" onError={(e) => e.currentTarget.classList.add('sem')} />
                ) : (
                  <span className="sem" />
                ))}
              <span>{o.rotulo}</span>
              {o.ano !== undefined && <small>{o.ano ?? '—'}</small>}
              {o.nota && <small>({o.nota})</small>}
            </button>
          ))}
        </div>
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
      {sobe && (
        <button className="botao cc-subir" aria-expanded={vaga} disabled={respondendo} onClick={() => setVaga((v) => !v)}>
          Subir para a vaga
        </button>
      )}
      {sobe && vaga && (
        <div className="cc-opcoes vagas" role="group" aria-label="A vaga do pôster dele em cima">
          <button disabled={respondendo} onClick={() => void responda({ subir: true })} aria-label="A vaga ??? do pôster dele em cima">
            <span className="mao">???</span>
            <small>a vaga do pôster dele em cima</small>
          </button>
        </div>
      )}
      {trello && (
        <a className="cc-trello" href={trello} target="_blank" rel="noreferrer">
          <Icone nome="quadro" tam={15} traco={2.2} />
          Abrir o card no Trello
        </a>
      )}
    </article>
  );
}
