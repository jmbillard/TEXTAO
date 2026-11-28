import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { formaDaAgendaDeFilmes, lembrarFormaDaAgendaDeFilmes, lerAgendaDeFilmes } from '../dados/armazenamento';
import { FORMAS_DA_AGENDA, buscarNaAgenda, caminhoNoSistema, porSessao, quandoPassa, semanaDosFilmes, type AgendaDeFilmes as Agenda, type ExibicaoDoFilme, type FilmeDaAgenda, type FilmeNaAgenda, type FormaDaAgenda, type QuandoPassa } from '../modelo/agendaDeFilmes';
import { ROTULO_DA_ETAPA } from '../modelo/pauta';
import { eixoDaSemana, inicioDaSemana, isoLocal, periodoNaContagem, posicaoNaContagem, type DiaDaSemana } from './fila';
import { BuscaNaLupa, emCampo } from './BuscaNaLupa';
import { usePresenca } from './BuscaDasProducoes';
import { CardAberto, FecharOCardAberto } from './CardAberto';
import { RABISCO } from './cena';
import { Icone } from './icones';
import { lambeDe } from './lambe';
import { ListaDeAchados } from './ListaDeAchados';
import { BolinhaDeEstado, Vazio } from './pecas';
import { relativoA } from './pecasDaPauta';
import { ItemQueAbre, Periodo, ResumoQueConta, TopoDoDia, VoltarParaHoje, useContagemDoPeriodo, type PalavrasDoResumo } from './topoDaAgenda';
import { useTrocaDeSemana } from './trocaDeSemana';
import { copiarTexto, dataCurtaComDia, dataPorExtenso, ehMac, plural } from './util';
import './fontes/bebas-neue/bebas-neue.css';
import './agendaDeFilmes.css';

/* A agenda de filmes da aba Filmes (#169), embaixo das prévias, no padrão da agenda No Trello (as colunas dos dias, o
   card de borda fina e o mesmo hover). Duas formas de ver, lembradas por pessoa: por data de exibição e por sessão ou
   atração (uma faixa por sessão, de hoje em diante). Por data, é a semana da agenda No Trello (#182), com as peças dela:
   as setas e o período que conta, o "voltar para hoje", o resumo que conta ("12 exibições · 3 inéditas"), o cabeçalho
   do dia com o hoje circulado à mão e a troca de semana (useTrocaDeSemana). Os dias que já passaram ficam, com o que
   passou esmaecido; o que passa hoje fica em destaque. A lupa (BuscaNaLupa) acha pelo título, pelo ano e pela sessão,
   em todas as semanas lidas, numa lista no lugar da agenda (ListaDeAchados, a mesma da busca de Produções). Os pôsteres
   chegam em cascata, pelo caminho com login (/api/filmes/poster); um clique abre o card no centro (CardAberto), que
   cresce a partir do pôster. O filme sem pôster ganha uma capa com o título, nunca a imagem quebrada.
   O visual (#184) é o lambe-lambe colado no muro (a variação A aprovada, com os ajustes do usuário): o muro atrás da
   agenda, cada pôster um cartaz de papel com textura leve e rasgadinhas, às vezes uma fita, a rotação pequena, a tarja
   da data ("HOJE" em destaque), o selo "inédito" e o nome da sessão em estêncil. Sem dobra, sem sombra projetada (só
   uma linha fraquinha embaixo), sem sombra na fita. O cartaz entra "sendo colado"; o hover só acende a borda, pela
   silhueta do papel. */

const NOME_DA_FORMA: Record<FormaDaAgenda, string> = { data: 'por data', sessao: 'por sessão' };
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** Quantos pôsteres entram em cascata, um atrás do outro; os de depois chegam com o último. */
const CASCATA_MAX = 16;
/** As palavras do resumo da agenda de filmes. */
const PALAVRAS: PalavrasDoResumo = [
  ['exibição', 'exibições'],
  ['inédita', 'inéditas'],
];
/** Quanto a agenda leva voltando, depois que a busca fecha. */
const VOLTA_MS = 320;
/** O que sai da semana que troca (os pôsteres, o "nenhum filme", as marcas do dia) e o que entra (como No Trello). */
const SAI_DA_SEMANA = '.coluna-corpo > *, .coluna-topo .dia-num svg, .coluna-topo .dia-rel';
const ENTRA_NA_SEMANA = '.coluna-corpo > *';
/** Como a etiqueta diz o dia diante de hoje, na busca. */
const NOME_DO_QUANDO: Record<QuandoPassa, string> = { passou: 'passou', hoje: 'hoje', 'vai-passar': 'vai passar' };

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

  // a busca (#182): com o termo, os achados ficam no lugar da agenda (e saem animando); fechada, a agenda volta subindo
  const [busca, setBusca] = useState('');
  const buscaAtiva = !!busca.trim();
  const presenca = usePresenca(buscaAtiva);
  const [voltando, setVoltando] = useState(false);
  const buscouAntes = useRef(false);
  useEffect(() => {
    if (presenca.montado) {
      buscouAntes.current = true;
      return;
    }
    if (!buscouAntes.current) return;
    buscouAntes.current = false;
    setVoltando(true);
    const t = setTimeout(() => setVoltando(false), VOLTA_MS);
    return () => clearTimeout(t);
  }, [presenca.montado]);
  // com a busca aberta, o Esc fora do campo também limpa (o do card aberto só fecha o card)
  useEffect(() => {
    if (!buscaAtiva || aberto) return;
    const tecla = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && !emCampo(e) && setBusca('');
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [buscaAtiva, aberto]);

  // a semana, como a agenda No Trello: as setas pedem, e a semana na tela chega lá quando a anterior sai
  const hoje = agenda?.hoje ?? isoLocal(new Date());
  const [deslocamento, setDeslocamento] = useState(0);
  const grade = useRef<HTMLDivElement>(null);
  const troca = useTrocaDeSemana(grade, deslocamento, SAI_DA_SEMANA, ENTRA_NA_SEMANA, true);
  // os números dos dias e o período contam juntos, pelas datas, até a semana na tela
  const eixo = eixoDaSemana(new Date(`${hoje}T12:00:00`));
  const inicio = inicioDaSemana(troca.mostrada);
  const contagem = useContagemDoPeriodo(eixo, inicio);
  const contando = contagem.p < 1;
  const inicioNaContagem = posicaoNaContagem(eixo, contagem.de, contagem.para, contagem.p);
  // depois da primeira troca, os pôsteres que entram chegam com a troca, não com a cascata da primeira carga
  const [trocou, setTrocou] = useState(false);
  if (troca.mostrada !== 0 && !trocou) setTrocou(true);

  const filmes = agenda?.filmes ?? [];
  const semana = semanaDosFilmes(filmes, hoje, inicio);
  const sessoes = agenda ? porSessao(filmes, hoje) : [];
  const daquiEmDiante = sessoes.flatMap((s) => s.itens);
  const resumo = forma === 'data' ? { total: semana.exibicoes, entregues: semana.ineditas } : { total: daquiEmDiante.length, entregues: daquiEmDiante.filter((x) => x.exibicao.inedito).length };
  const temFilme = filmes.some((f) => f.exibicoes.length);
  const achados = buscarNaAgenda(filmes, busca);
  const porData = forma === 'data';

  return (
    <section className="agenda-filmes" aria-label="Agenda de filmes">
      <div className="secao-trello-topo agenda-filmes-topo cabeca-com-lupa">
        <h2 className="ao-lado-da-lupa">
          <Icone nome="filme" tam={22} traco={1.7} />
          Agenda de filmes
        </h2>
        <span className="linha-criterio">
          <AbasDaForma forma={forma} mudar={mudar} />
          {agenda && (
            <span className="secao-trello-conta agenda-filmes-conta">
              <ResumoQueConta total={resumo.total} entregues={resumo.entregues} comPrioridade={0} palavras={PALAVRAS} />
              {!porData && <span className="agenda-filmes-daqui"> daqui em diante</span>}
            </span>
          )}
        </span>
        <span className="semana-nav">
          {agenda && temFilme && <BuscaNaLupa className="lupa-da-cabeca" valor={busca} mudar={setBusca} ativa={!aberto} dica="Buscar filme, ano ou sessão" rotulo="Buscar na agenda de filmes" />}
          <VoltarParaHoje ver={porData && !buscaAtiva && troca.mostrada !== 0} sentido={troca.sentido} voltar={() => setDeslocamento(0)} abreVaga />
          {/* as setas e o período só na semana (por data); por sessão, fecham a vaga */}
          <ItemQueAbre ver={porData && !buscaAtiva} classe="ct-setas nav-do-tempo">
            <span className="semana-setas">
              <button type="button" className="botao-icone" aria-label="Semana anterior" title="Semana anterior" onClick={() => setDeslocamento((n) => n - 1)}>
                <Icone nome="voltar" tam={16} traco={2.2} />
              </button>
              <Periodo {...periodoNaContagem(eixo, contagem.de, contagem.para, contagem.p)} largura="suave" />
              <button type="button" className="botao-icone" aria-label="Próxima semana" title="Próxima semana" onClick={() => setDeslocamento((n) => n + 1)}>
                <Icone nome="direita" tam={16} traco={2.2} />
              </button>
            </span>
          </ItemQueAbre>
        </span>
      </div>
      {presenca.montado && (
        <ListaDeAchados
          classe="filmes-busca"
          itens={achados}
          chave={(x) => x.exibicao.id}
          dados={(x) => ({ 'data-quando': quandoPassa(x.exibicao.dia, hoje) })}
          saindo={presenca.saindo}
          titulo={
            achados.length ? (
              <>
                {plural(achados.length, 'exibição', 'exibições')} com <q>{busca.trim()}</q>
              </>
            ) : (
              <>
                Nada com <q>{busca.trim()}</q>
              </>
            )
          }
          dica="em todas as semanas · Esc limpa"
          nada={achados.length ? null : 'nenhum filme com isso na agenda'}
          linha={(x) => <AchadoDoFilme x={x} hoje={hoje} abrir={abrir} />}
        />
      )}
      <div className={`agenda-filmes-corpo${agenda ? ' muro' : ''}${voltando ? ' voltando' : ''}`} hidden={presenca.montado}>
        {falha ? (
          <p className="agenda-filmes-falha">Não deu para ler a agenda de filmes: {falha}</p>
        ) : !agenda ? (
          <div className="agenda-filmes-esperando" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => <span key={i} className="poster-esperando" style={{ '--i': i } as React.CSSProperties} />)}
          </div>
        ) : porData ? (
          // as sete colunas ficam no lugar quando a semana troca: os números contam e as marcas do dia (o hoje
          // circulado) se escrevem quando a contagem termina, como na agenda No Trello
          <div className={`semana filmes-dias${trocou ? ' trocou' : ''}`} ref={grade} key="data">
            {semana.dias.map((d, k) => {
              const dia = diaDaSemana(hoje, d.dia);
              const quando = contando ? '' : quandoPassa(d.dia, hoje);
              return (
                <section key={k} className={`coluna ${quando === 'hoje' ? 'hoje' : ''} ${quando === 'passou' ? 'passou' : ''} ${dia.fimDeSemana ? 'fim-de-semana' : ''}`} aria-label={dataPorExtenso(d.dia)}>
                  <TopoDoDia d={dia} numero={Number(eixo.dia(inicioNaContagem + k).slice(8))} marcas={!contando} escrever />
                  <ul className="coluna-corpo">
                    {d.itens.map((x, i) => (
                      <PosterNaAgenda key={x.exibicao.id} x={x} ordem={k + i} hoje={hoje} linha={[x.exibicao.sessao, x.exibicao.hora].filter(Boolean).join(' · ')} abrir={abrir} />
                    ))}
                    {!d.itens.length && <Vazio como="li" className="nada entra-suave">nenhum filme</Vazio>}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : !sessoes.length ? (
          <Vazio className="nada agenda-filmes-nada">nenhum filme na grade dos próximos dias</Vazio>
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
                    const marca = marcaDoDia(hoje, x.exibicao.dia);
                    return <PosterNaAgenda key={x.exibicao.id} x={x} ordem={k * 2 + i} hoje={hoje} marca={marca} linha={[dataCurtaComDia(x.exibicao.dia), x.exibicao.hora].filter(Boolean).join(' · ')} abrir={abrir} />;
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      {aberto && (
        <CardAberto origem={aberto.origem} titulo="ficha-filme-titulo" fechar={fechar}>
          <FichaDoFilme filme={aberto.filme} exibicao={aberto.exibicao} hoje={hoje} avisar={avisar} />
        </CardAberto>
      )}
    </section>
  );
}

/** Uma linha da busca: a capa pequena, o título e o ano, a sessão, o dia (com a hora) e, na bolinha, se já passou, se
    passa hoje ou se ainda vai passar. O clique abre o card do filme, que cresce da capa. */
function AchadoDoFilme({ x, hoje, abrir }: { x: FilmeNaAgenda; hoje: string; abrir: (x: FilmeNaAgenda, origem: HTMLElement | null) => void }) {
  const { filme, exibicao } = x;
  const quando = quandoPassa(exibicao.dia, hoje);
  const marca = marcaDoDia(hoje, exibicao.dia);
  return (
    <button type="button" className="prod-achado-abrir filme-achado" aria-haspopup="dialog" onClick={(e) => abrir(x, e.currentTarget.querySelector<HTMLElement>('.filme-achado-capa') ?? e.currentTarget)}>
      <span className="filme-achado-capa">
        <CapaDoFilme filme={filme} />
      </span>
      <span className="prod-achado-nome">
        <span className="filme-achado-titulo">
          {filme.titulo}
          {filme.ano !== null && <span className="filme-achado-ano">{filme.ano}</span>}
        </span>
        <span className="filme-achado-sessao">
          {exibicao.sessao || 'Sem sessão'}
          {exibicao.inedito && <span className="etiqueta-inedito">inédito</span>}
        </span>
      </span>
      <span className="filme-achado-dia">
        {marca && <span className="poster-filme-rel">{marca}</span>}
        {[dataCurtaComDia(exibicao.dia), exibicao.hora].filter(Boolean).join(' · ')}
      </span>
      <span className="prod-achado-etapa">
        <i aria-hidden="true" />
        {NOME_DO_QUANDO[quando]}
      </span>
    </button>
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

/** A tarja da data colada no cartaz, como o lambe de evento: "HOJE · 22:30", "SEX 27 · 15:00"; sem hora, só o dia. */
export function tarjaDaExibicao(e: ExibicaoDoFilme, marca: DiaDaSemana['marca']): string {
  const d = new Date(`${e.dia}T12:00:00`);
  const dia = marca || `${DIAS_CURTOS[d.getDay()]} ${d.getDate()}`;
  return [dia.toUpperCase(), e.hora].filter(Boolean).join(' · ');
}

/** O cartaz lambe-lambe (#184): o papel rasgado com a capa (o pôster, ou a capa reserva no mesmo papel), a textura, o
    selo "inédito", a fita e a tarja da data. Na agenda é o botão que abre o card (o card cresce dele); no card aberto,
    `grande`, só o cartaz. O sorteio é pelo filme e pela exibição: o mesmo pôster é sempre o mesmo cartaz. */
const CartazDoFilme = forwardRef<HTMLButtonElement, { filme: FilmeDaAgenda; exibicao: ExibicaoDoFilme; tarja?: string; hoje?: boolean; grande?: boolean; rotulo?: string; abrir?: (origem: HTMLElement) => void }>(function CartazDoFilme({ filme, exibicao, tarja, hoje = false, grande = false, rotulo, abrir }, ref) {
  const l = useMemo(() => lambeDe(`${filme.id}|${exibicao.id}`), [filme.id, exibicao.id]);
  const estilo = { '--r': `${l.rot}deg`, '--y': `${grande ? 0 : l.y}px` } as React.CSSProperties;
  const miolo = (
    <>
      <span className="papel" style={{ clipPath: l.clip }}>
        <CapaDoFilme filme={filme} grande={grande} />
        <span className="grao amassado" aria-hidden="true" />
        <span className="grao fibras" aria-hidden="true" />
        {exibicao.inedito && <span className="selo">inédito</span>}
        {!grande && <span className="cola" aria-hidden="true" />}
      </span>
      {l.fita && <span className={`fita ${l.fita}`} aria-hidden="true" />}
      {tarja && <span className={`tarja${hoje ? ' hoje' : ''}`}>{tarja}</span>}
    </>
  );
  if (grande) return <span className="lambe grande" style={estilo}>{miolo}</span>;
  return (
    <button ref={ref} type="button" className="poster-filme-capa lambe" style={estilo} aria-label={rotulo} title={rotulo} onClick={(e) => abrir?.(e.currentTarget)}>
      {miolo}
    </button>
  );
});

/** Um pôster na agenda: o card de borda fina da agenda, com a capa, o título e a linha da sessão (ou do dia). O botão é a
    capa (o card aberto cresce dela); o clique no resto do card também abre. O que já passou fica esmaecido; o que passa
    hoje, em destaque (`quando`). */
function PosterNaAgenda({ x, ordem, linha, marca = '', hoje, abrir }: { x: FilmeNaAgenda; ordem: number; linha: string; marca?: DiaDaSemana['marca']; hoje: string; abrir: (x: FilmeNaAgenda, origem: HTMLElement | null) => void }) {
  const capa = useRef<HTMLButtonElement>(null);
  const { filme, exibicao } = x;
  const rotulo = `${filme.titulo}${filme.ano !== null ? ` (${filme.ano})` : ''}, ${dataPorExtenso(exibicao.dia)}${exibicao.sessao ? `, ${exibicao.sessao}` : ''}`;
  const quando = quandoPassa(exibicao.dia, hoje);
  return (
    <li className={`poster-filme ${quando}`} data-quando={quando} style={{ '--i': Math.min(ordem, CASCATA_MAX) } as React.CSSProperties} onClick={(e: MouseEvent) => !(e.target as HTMLElement).closest('button') && capa.current?.click()}>
      <CartazDoFilme ref={capa} filme={filme} exibicao={exibicao} tarja={tarjaDaExibicao(exibicao, marcaDoDia(hoje, exibicao.dia))} hoje={quando === 'hoje'} rotulo={rotulo} abrir={(origem) => abrir(x, origem)} />
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
      <BolinhaDeEstado estado={p?.etapa ?? (e.trello ? 'card' : 'sem-card')} tam="ficha" />
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
          <CartazDoFilme filme={filme} exibicao={exibicao} grande />
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
