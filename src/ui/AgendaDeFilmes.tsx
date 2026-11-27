import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { formaDaAgendaDeFilmes, lembrarFormaDaAgendaDeFilmes, lerAgendaDeFilmes } from '../dados/armazenamento';
import { FORMAS_DA_AGENDA, caminhoNoSistema, porData, porSessao, type AgendaDeFilmes as Agenda, type ExibicaoDoFilme, type FilmeDaAgenda, type FilmeNaAgenda, type FormaDaAgenda } from '../modelo/agendaDeFilmes';
import { ROTULO_DA_ETAPA } from '../modelo/pauta';
import type { DiaDaSemana } from './fila';
import { CardAberto, FecharOCardAberto } from './CardAberto';
import { RABISCO } from './cena';
import { Icone } from './icones';
import { relativoA } from './pecasDaPauta';
import { TopoDoDia } from './topoDaAgenda';
import { copiarTexto, dataCurtaComDia, dataPorExtenso, ehMac } from './util';
import './agendaDeFilmes.css';

/* A agenda de filmes da aba Filmes (#169), embaixo das prévias: os filmes com exibição de hoje em diante, com os
   pôsteres, no padrão da agenda No Trello (as colunas dos dias, o card de borda fina e o mesmo hover). Duas formas de
   ver, lembradas por pessoa: por data de exibição (um dia por coluna, a faixa corre para o lado) e por sessão ou atração
   (uma faixa por sessão). Os pôsteres chegam em cascata; um clique abre o card no centro (CardAberto, o mesmo da Pauta e
   de Produções), que cresce a partir do pôster, com o que o cadastro tem do filme: as exibições, as pastas com o
   "Copiar caminho" e a Produção de cada card. O filme sem pôster ganha uma capa com o título, nunca a imagem quebrada. */

const NOME_DA_FORMA: Record<FormaDaAgenda, string> = { data: 'por data', sessao: 'por sessão' };
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** Quantos pôsteres entram em cascata, um atrás do outro; os de depois chegam com o último. */
const CASCATA_MAX = 16;

/** "hoje", "amanhã", "ontem" ou '' (a marca à mão da agenda), como na Pauta. */
const marcaDoDia = (hoje: string, dia: string) => relativoA(hoje, dia) as DiaDaSemana['marca'];
/** O cabeçalho do dia da agenda (TopoDoDia) para um dia da agenda de filmes. */
function diaDaSemana(hoje: string, iso: string): DiaDaSemana {
  const d = new Date(`${iso}T12:00:00`);
  return { iso, diaDaSemana: DIAS_CURTOS[d.getDay()], numero: d.getDate(), marca: marcaDoDia(hoje, iso), fimDeSemana: d.getDay() === 0 || d.getDay() === 6, cards: [] };
}

/** O filme aberto no card do centro: a exibição clicada e o pôster de onde o card cresce. */
interface FilmeAberto {
  filme: FilmeDaAgenda;
  exibicao: ExibicaoDoFilme;
  origem: HTMLElement | null;
}

export function AgendaDeFilmes({ avisar }: { avisar: (t: string) => void }) {
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [falha, setFalha] = useState('');
  const [forma, setForma] = useState<FormaDaAgenda>(formaDaAgendaDeFilmes);
  const [aberto, setAberto] = useState<FilmeAberto | null>(null);
  useEffect(() => {
    lerAgendaDeFilmes().then(setAgenda, (e: Error) => setFalha(e.message));
  }, []);
  const mudar = (f: FormaDaAgenda) => {
    if (f === forma) return;
    setForma(f);
    void lembrarFormaDaAgendaDeFilmes(f);
  };
  const abrir = useCallback((x: FilmeNaAgenda, origem: HTMLElement | null) => setAberto({ ...x, origem }), []);
  const fechar = useCallback(() => setAberto(null), []);

  const dias = agenda ? porData(agenda.filmes, agenda.hoje) : [];
  const sessoes = agenda ? porSessao(agenda.filmes, agenda.hoje) : [];
  const total = dias.reduce((n, d) => n + d.itens.length, 0);
  return (
    <section className="agenda-filmes" aria-label="Agenda de filmes">
      <div className="agenda-filmes-topo">
        <h2>
          <Icone nome="filme" tam={22} traco={1.7} />
          Agenda de filmes
        </h2>
        <span className="linha-criterio">
          <AbasDaForma forma={forma} mudar={mudar} />
          {agenda && (
            <span className="agenda-filmes-conta">
              {total ? `${total} ${total === 1 ? 'exibição' : 'exibições'} nos próximos dias` : 'nada nos próximos dias'}
            </span>
          )}
        </span>
      </div>
      {falha ? (
        <p className="agenda-filmes-falha">Não deu para ler a agenda de filmes: {falha}</p>
      ) : !agenda ? (
        <div className="agenda-filmes-esperando" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <span key={i} className="poster-esperando" style={{ '--i': i } as React.CSSProperties} />)}
        </div>
      ) : !total ? (
        <p className="nada agenda-filmes-nada">nenhum filme na grade dos próximos dias</p>
      ) : forma === 'data' ? (
        <div className="filmes-dias" key="data">
          {dias.map((d, k) => {
            const dia = diaDaSemana(agenda.hoje, d.dia);
            return (
              <section key={d.dia} className={`coluna ${dia.marca === 'hoje' ? 'hoje' : ''} ${dia.fimDeSemana ? 'fim-de-semana' : ''}`} aria-label={dataPorExtenso(d.dia)}>
                <TopoDoDia d={dia} />
                <ul className="coluna-corpo">
                  {d.itens.map((x, i) => (
                    <PosterNaAgenda key={x.exibicao.id} x={x} ordem={k + i} linha={[x.exibicao.sessao, x.exibicao.hora].filter(Boolean).join(' · ')} abrir={abrir} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="filmes-sessoes" key="sessao">
          {sessoes.map((s, k) => (
            <section key={s.sessao} className="faixa-sessao" aria-label={s.sessao}>
              <h3>
                {s.sessao}
                <span className="faixa-sessao-conta">{s.itens.length}</span>
              </h3>
              <ul>
                {s.itens.map((x, i) => {
                  const marca = marcaDoDia(agenda.hoje, x.exibicao.dia);
                  return <PosterNaAgenda key={x.exibicao.id} x={x} ordem={k * 2 + i} marca={marca} linha={[dataCurtaComDia(x.exibicao.dia), x.exibicao.hora].filter(Boolean).join(' · ')} abrir={abrir} />;
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {aberto && (
        <CardAberto origem={aberto.origem} titulo="ficha-filme-titulo" fechar={fechar}>
          <FichaDoFilme filme={aberto.filme} exibicao={aberto.exibicao} hoje={agenda?.hoje ?? ''} avisar={avisar} />
        </CardAberto>
      )}
    </section>
  );
}

/** As abas da forma de ver ("por data · por sessão"), iguais às do critério da agenda No Trello. */
function AbasDaForma({ forma, mudar }: { forma: FormaDaAgenda; mudar: (f: FormaDaAgenda) => void }) {
  const abas = useRef<HTMLSpanElement>(null);
  const tecla = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const nova = FORMAS_DA_AGENDA[(FORMAS_DA_AGENDA.indexOf(forma) + 1) % FORMAS_DA_AGENDA.length];
    mudar(nova);
    abas.current?.querySelector<HTMLElement>(`[data-forma="${nova}"]`)?.focus();
  };
  return (
    <span ref={abas} className="abas-criterio" role="tablist" aria-label="Ver a agenda de filmes" onKeyDown={tecla}>
      {FORMAS_DA_AGENDA.map((f) => (
        <button key={f} type="button" role="tab" data-forma={f} aria-selected={f === forma} tabIndex={f === forma ? 0 : -1} onClick={() => mudar(f)}>
          <span className="rot">
            {NOME_DA_FORMA[f]}
            {f === forma && (
              <svg className="sub" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
                <path pathLength={1} d={RABISCO} />
              </svg>
            )}
          </span>
        </button>
      ))}
    </span>
  );
}

/** A capa do filme: o pôster ou, sem ele (ou se a imagem não vier), o título sobre o papel tingido. */
export function CapaDoFilme({ filme, grande = false }: { filme: FilmeDaAgenda; grande?: boolean }) {
  const [quebrou, setQuebrou] = useState(false);
  const [carregou, setCarregou] = useState(false);
  if (!filme.poster || quebrou)
    return (
      <span className={`capa-sem-poster ${grande ? 'grande' : ''}`} aria-hidden="true">
        <Icone nome="filme" tam={grande ? 22 : 16} traco={1.6} />
        <span className="capa-sem-poster-titulo">{filme.titulo}</span>
        {filme.ano !== null && <span className="capa-sem-poster-ano">{filme.ano}</span>}
      </span>
    );
  return <img className={carregou ? 'carregou' : ''} src={filme.poster} alt="" loading="lazy" decoding="async" onLoad={() => setCarregou(true)} onError={() => setQuebrou(true)} />;
}

/** Um pôster na agenda: o card de borda fina da agenda, com a capa, o título e a linha da sessão (ou do dia). O botão é a
    capa (o card aberto cresce dela); o clique no resto do card também abre. */
function PosterNaAgenda({ x, ordem, linha, marca = '', abrir }: { x: FilmeNaAgenda; ordem: number; linha: string; marca?: DiaDaSemana['marca']; abrir: (x: FilmeNaAgenda, origem: HTMLElement | null) => void }) {
  const capa = useRef<HTMLButtonElement>(null);
  const { filme, exibicao } = x;
  const rotulo = `${filme.titulo}${filme.ano !== null ? ` (${filme.ano})` : ''}, ${dataPorExtenso(exibicao.dia)}${exibicao.sessao ? `, ${exibicao.sessao}` : ''}`;
  return (
    <li className="poster-filme" style={{ '--i': Math.min(ordem, CASCATA_MAX) } as React.CSSProperties} onClick={(e: MouseEvent) => !(e.target as HTMLElement).closest('button') && capa.current?.click()}>
      <button ref={capa} type="button" className="poster-filme-capa" aria-label={rotulo} title={rotulo} onClick={(e) => abrir(x, e.currentTarget)}>
        <CapaDoFilme filme={filme} />
        {exibicao.inedito && <span className="etiqueta-inedito">inédito</span>}
      </button>
      <span className="poster-filme-titulo">{filme.titulo}</span>
      <span className="poster-filme-linha">
        {marca && <span className="poster-filme-rel">{marca}</span>}
        {linha}
      </span>
    </li>
  );
}

/** A etapa da Produção ligada pelo card da exibição, numa bolinha; sem Produção, o card no Trello ou "sem card". */
function ProducaoDaExibicao({ e }: { e: ExibicaoDoFilme }) {
  const p = e.producao;
  return (
    <span className="ficha-filme-producao" data-etapa={p?.etapa ?? (e.trello ? 'card' : 'sem-card')}>
      <i aria-hidden="true" />
      {p ? (
        <>
          <b>{ROTULO_DA_ETAPA[p.etapa]}</b>
          {p.designers.length > 0 && <span> · {p.designers.join(', ')}</span>}
        </>
      ) : e.trello ? (
        'Card sem Produção'
      ) : (
        'Sem card'
      )}
      {e.trello && (
        <a href={e.trello} target="_blank" rel="noreferrer" className="ficha-filme-trello">
          Trello
        </a>
      )}
    </span>
  );
}

/** Um caminho de pasta com o "Copiar caminho" (o do sistema da pessoa). */
function Caminho({ rotulo, caminho, avisar }: { rotulo: string; caminho: string; avisar: (t: string) => void }) {
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 1800);
    return () => clearTimeout(t);
  }, [copiado]);
  return (
    <div className="ficha-filme-caminho">
      <span className="ficha-filme-caminho-rotulo">{rotulo}</span>
      {caminho ? <code title={caminho}>{caminho}</code> : <span className="ficha-filme-vazio">sem caminho no cadastro</span>}
      {caminho && (
        <button
          type="button"
          className={`botao ficha-filme-copiar ${copiado ? 'copiado' : ''}`}
          onClick={() =>
            void copiarTexto(caminho).then(
              () => (setCopiado(true), avisar(`Caminho ${rotulo === 'Projeto' ? 'do projeto' : 'do output'} copiado`)),
              () => avisar('Não consegui copiar o caminho.'),
            )
          }
        >
          <Icone nome="copiar" tam={14} traco={1.8} />
          <span className="ficha-filme-copiar-texto" key={String(copiado)}>{copiado ? 'Copiado' : 'Copiar caminho'}</span>
        </button>
      )}
    </div>
  );
}

/** O card aberto do filme: o pôster, o título e o ano, as exibições (a clicada em destaque), as pastas e a Produção. */
function FichaDoFilme({ filme, exibicao, hoje, avisar }: { filme: FilmeDaAgenda; exibicao: ExibicaoDoFilme; hoje: string; avisar: (t: string) => void }) {
  return (
    <div className="ficha-filme">
      <div className="pauta-ficha-topo">
        <span className="rotulo">Filme{exibicao.sessao ? ` · ${exibicao.sessao}` : ''}</span>
        <FecharOCardAberto rotulo="Fechar o filme" />
      </div>
      <div className="ficha-filme-corpo">
        <div className="ficha-filme-capa">
          <CapaDoFilme filme={filme} grande />
        </div>
        <div className="ficha-filme-dados">
          <h2 id="ficha-filme-titulo">
            {filme.titulo}
            {filme.ano !== null && <span className="ficha-filme-ano">{filme.ano}</span>}
          </h2>
          {filme.pasta && <p className="ficha-filme-pasta">{filme.pasta}</p>}
          <h3>Exibições</h3>
          <ul className="ficha-filme-exibicoes">
            {filme.exibicoes.map((e) => {
              const rel = marcaDoDia(hoje, e.dia);
              return (
                <li key={e.id} className={`${e.id === exibicao.id ? 'esta' : ''} ${e.dia < hoje ? 'passou' : ''}`}>
                  <span className="ficha-filme-quando">
                    <b>{dataCurtaComDia(e.dia)}</b>
                    {e.hora && <span> · {e.hora}</span>}
                    {rel && <span className="ficha-filme-rel">{rel}</span>}
                  </span>
                  <span className="ficha-filme-sessao">
                    {e.sessao || 'Sem sessão'}
                    {e.inedito && <span className="etiqueta-inedito">inédito</span>}
                  </span>
                  <ProducaoDaExibicao e={e} />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <h3>Pastas</h3>
      <div className="ficha-filme-pastas">
        <Caminho rotulo="Projeto" caminho={caminhoNoSistema(filme.projeto, ehMac)} avisar={avisar} />
        <Caminho rotulo="Output" caminho={caminhoNoSistema(filme.output, ehMac)} avisar={avisar} />
      </div>
    </div>
  );
}
