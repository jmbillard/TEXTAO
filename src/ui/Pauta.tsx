import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { lembrarCodigoDasVersoes, lerSemanaDaPauta, souCoordenacao } from '../dados/armazenamento';
import { apelidoDaClaquete, useApelidos } from '../dados/apelidos';
import { iniciais } from '../dados/colaboracao';
import { buscarNaPauta, diaDaPautaAgora, diaEmSaoPaulo, diaOuHoje, diasDaSemana, diaVizinho, ehDaPessoa, gradeDaSemana, segundaDaSemana, semanaVizinha, veOQueSobrou, type CelulaDaSemana, type LeituraDaPauta, type LinhaDaPauta, type SemanaDaPauta } from '../modelo/pauta';
import { BalaoDeInfo } from './BalaoDeInfo';
import { BuscaNaLupa } from './BuscaNaLupa';
import { useCodigoDasVersoes } from './CodigoDasVersoes';
import { Icone } from './icones';
import { ListaDaPauta, MesaDaPauta, RecadoDoDia } from './MesaDaPauta';
import { ColunasDoDia, FitaDosDias } from './PautaDoDia';
import { Marca, NadaNaBusca, NumeroCirculado, useSaida, Vazio, VoceAMao } from './pecas';
import { posicaoNaContagem } from './fila';
import { escrever, Periodo, useContagemDoPeriodo, useEsmaeceAoMudar } from './topoDaAgenda';
import { semMovimento } from './util';
import { Avisos, ClaqueteAberta, DIAS_DA_SEMANA, MESES, SobreALeitura, VisaoDaPauta, diaEscrito, diaPorExtenso, hashDaPauta, partes, relativoA, turnoEscrito, useReleitura, type AbrirClaquete, type ClaqueteNaTela, type EnderecoDaPauta } from './pecasDaPauta';
import { diaDoNumero, EIXO_DA_SEMANA, EIXO_DO_DIA, numeroDoDia, periodoDaPautaNaContagem, SemanaQueConta, useDiaQueConta, useTrocaDaPauta } from './trocaDaPauta';
import './pauta.css';

/* A Pauta da edição (#94), no desenho do mock-up que o usuário aprovou (#162). No alto, o título e os controles: a
   Semana ou o Dia, a busca, "Mostrar o código das versões", Hoje e o anterior e o próximo (← →). Embaixo, a mesa do dia
   (MesaDaPauta: o recado, o "Minha pauta" de quem é editor, o que sobrou e quem está fora) e a visão:
   - a Semana: um editor por linha, um dia por coluna, "sem editor · sobrou" no fim; a célula traz o turno, o ⚑ dos
     avisos e as claquetes compactas (a produção da arte só em hoje); um clique no dia abre o Dia;
   - o Dia (PautaDoDia.tsx): a fita dos dias e um editor por coluna, você primeiro.
   As claquetes são os cards da agenda: o hover sem sublinhado, o clique que abre a ficha no card aberto do centro
   (CardAberto, a alternativa A do #160), o lápis do apelido e o clique direito. Trocar de dia ou de semana desliza o
   conteúdo para o lado da navegação (trocaDaPauta.ts); a entrada e a troca de visão chegam em cascata curta.
   A pauta é lida por semana (do Teable, pelo servidor; nada do Trello), com a semana à vista e as vizinhas guardadas
   para a busca; a releitura é a cada minuto (#99), com a cópia de reserva e o resumo do administrador. */

interface Props extends EnderecoDaPauta {
  /** vai para outra semana ou outro dia (sem a data: a de hoje) */
  irPara: (e: EnderecoDaPauta) => void;
  voltar: () => void;
  /** a linha do logo (#159), a mesma da fila; sem ela, o "Fila" de volta */
  topo?: ReactNode;
}

type Semana = SemanaDaPauta & LeituraDaPauta;

/** "23 a 29 de novembro", "30 de novembro a 6 de dezembro". */
function periodoEscrito(dias: string[]) {
  const a = partes(dias[0]);
  const b = partes(dias[dias.length - 1]);
  return a.mes === b.mes ? `${a.dia} a ${b.dia} de ${MESES[b.mes]}` : `${a.dia} de ${MESES[a.mes]} a ${b.dia} de ${MESES[b.mes]}`;
}

/** A semana na tela conta até `segunda` (SemanaQueConta): o período da Semana, os números do cabeçalho da grade e os
    da fita do Dia contam juntos, como o período e os dias da agenda no computador (#170). Só quem lê a contagem
    renderiza a cada quadro; o resto da página não. */
function ContagemDaSemana({ segunda, children }: { segunda: string; children: ReactNode }) {
  const contagem = useContagemDoPeriodo(EIXO_DA_SEMANA, numeroDoDia(segunda));
  const { de, para, p } = contagem;
  const valor = useMemo(() => ({ contagem: { de, para, p }, inicio: posicaoNaContagem(EIXO_DA_SEMANA, de, para, p), contando: p < 1 }), [de, para, p]);
  return <SemanaQueConta.Provider value={valor}>{children}</SemanaQueConta.Provider>;
}

/** O seletor de datas da Pauta, com o período da agenda (topoDaAgenda.tsx: Periodo): na Semana, "16 a 22 de
    novembro", contando junto com a grade; no Dia, "sexta, 27 de novembro", com o dia contando. Os dias contam pelas
    datas; na virada do mês, os meses apagam e voltam; a largura acompanha o texto, e as setas andam até o lugar. Com
    o movimento reduzido, só esmaece. O texto parado vai para o leitor de tela à parte (a contagem não é anunciada). */
function PeriodoDaPauta({ visao, dia }: { visao: 'semana' | 'dia'; dia: string }) {
  const semana = useContext(SemanaQueConta);
  // na Semana, a contagem do dia fica parada (o período conta pela da semana)
  const doDia = useContagemDoPeriodo(EIXO_DO_DIA, visao === 'dia' ? numeroDoDia(dia) : 0);
  const c = visao === 'dia' || !semana ? doDia : semana.contagem;
  const el = useRef<HTMLSpanElement>(null);
  useEsmaeceAoMudar(el, dia);
  return (
    <>
      <span ref={el} className="pauta-periodo" aria-hidden="true">
        <Periodo {...periodoDaPautaNaContagem(visao, c.de, c.para, c.p)} largura="suave" entre=" a " />
      </span>
      <span className="pauta-leitor" aria-live="polite">
        {visao === 'dia' ? diaPorExtenso(dia) : periodoEscrito(diasDaSemana(dia))}
      </span>
    </>
  );
}

/** A pauta lida por semana: a semana à vista e, para a busca e a troca sem espera, as vizinhas. A releitura (#99) não
    apaga a que está à vista quando falha. */
function useSemanas(segunda: string) {
  const [semanas, setSemanas] = useState<Record<string, Semana>>({});
  const [falha, setFalha] = useState('');
  const pedidas = useRef(new Set<string>());
  const ler = useCallback((s: string, releitura = false) => {
    if (!releitura && pedidas.current.has(s)) return;
    pedidas.current.add(s);
    return lerSemanaDaPauta(s).then(
      (d) => (setSemanas((t) => ({ ...t, [s]: d })), releitura || setFalha('')),
      (e: unknown) => {
        pedidas.current.delete(s);
        throw e;
      },
    );
  }, []);
  const carregar = useCallback(
    (releitura = false) => {
      if (!releitura) setFalha('');
      void ler(segunda, releitura)
        ?.then(() => {
          // as vizinhas, depois da semana à vista
          void ler(semanaVizinha(segunda, -1), releitura)?.catch(() => undefined);
          void ler(semanaVizinha(segunda, 1), releitura)?.catch(() => undefined);
        })
        .catch((e) => releitura || setFalha(e instanceof Error ? e.message : String(e)));
    },
    [segunda, ler],
  );
  useEffect(() => carregar(), [carregar]);
  useReleitura(useCallback(() => carregar(true), [carregar]));
  const tentar = useCallback(() => {
    pedidas.current.delete(segunda);
    carregar();
  }, [segunda, carregar]);
  return { semanas, falha, tentar };
}

/** A célula da Semana: o turno e o ⚑ dos avisos, e as claquetes compactas (a produção só em hoje); fora, "fora". */
function Celula({ c, editor, hoje, foraNoDia, abrir }: { c: CelulaDaSemana; editor: string; hoje: boolean; foraNoDia: boolean; abrir: AbrirClaquete }) {
  const { dia, semana } = partes(c.dia);
  const avisos = editor ? c.avisos : [];
  const infos = editor ? c.infos : [];
  const vazia = !c.turno && !c.itens.length && !avisos.length && !infos.length;
  return (
    <td className={`pauta-celula${hoje ? ' hoje' : ''}`} data-dia={c.dia}>
      <div className="desliza">
        {foraNoDia && vazia ? (
          <span className="pauta-cel-fora">fora</span>
        ) : vazia ? (
          editor ? <span className="pauta-cel-fora" aria-label="sem pauta">–</span> : hoje ? <Vazio como="span" pequeno className="pauta-nada">nada sobrando</Vazio> : null
        ) : (
          <>
            {(c.turno || avisos.length > 0 || infos.length > 0) && (
              <div className="pauta-celula-topo">
                {c.turno && <span className="pauta-turno">{turnoEscrito(c.turno)}</span>}
                {avisos.length > 0 && <Avisos avisos={avisos} rotulo={`${editor || 'sem editor'}, ${DIAS_DA_SEMANA[semana]} ${dia}`} />}
                {/* a info que não é de claquete fica na posição (#172) */}
                {infos.length > 0 && <BalaoDeInfo textos={infos} rotulo={`${editor}, ${DIAS_DA_SEMANA[semana]} ${dia}`} />}
              </div>
            )}
            <ListaDaPauta itens={c.itens} abrir={abrir} compacta comProducao={hoje} />
          </>
        )}
      </div>
    </td>
  );
}

/** O cabeçalho de um dia da Semana: "SEG 16", e "hoje" à mão. Como as colunas da agenda no computador (#170), ele
    fica no lugar quando a semana troca: o número conta junto com o período (SemanaQueConta) e o "hoje" (com o fundo
    da coluna) só volta quando a contagem termina, escrevendo-se à mão. */
function TopoDoDiaDaGrade({ d, i, hoje, irPara }: { d: string; i: number; hoje: boolean; irPara: Props['irPara'] }) {
  const { contado, contando } = useDiaQueConta(d, i);
  const ehHoje = hoje && !contando;
  const marca = useRef<HTMLSpanElement>(null);
  const antes = useRef(ehHoje);
  useLayoutEffect(() => {
    const era = antes.current;
    antes.current = ehHoje;
    if (!ehHoje || era || !marca.current || semMovimento()) return;
    const a = escrever(marca.current);
    return () => a.cancel();
  }, [ehHoje]);
  return (
    <th scope="col" className={`pauta-dia${ehHoje ? ' hoje' : ''}`} data-dia={d}>
      {/* um clique no dia abre aquele Dia (#97) */}
      <a className="pauta-dia-link" href={hashDaPauta({ dia: d })} title="Abrir o dia, com cada editor numa coluna" onClick={(e) => (e.preventDefault(), irPara({ dia: d }))}>
        <span className="pauta-dia-sem">{DIAS_DA_SEMANA[partes(d).semana]}</span> {/* hoje, o número circulado à caneta, como na agenda (#171) */}
        {ehHoje ? <NumeroCirculado traco={1} className="pauta-dia-num">{Number(contado.slice(8))}</NumeroCirculado> : <span className="pauta-dia-num">{Number(contado.slice(8))}</span>}
        {ehHoje && (
          <span ref={marca} className="pauta-dia-rel">
            {' '}
            hoje
          </span>
        )}
      </a>
    </th>
  );
}

/** A Semana editor × dia, como no mock-up: a pessoa com "você" e a linha tingida; "sem editor · sobrou" no fim. */
function GradeDaSemana({ dados, hoje, voce, irPara, abrir, comSobra }: { dados: Semana; hoje: string; voce: string | null | undefined; irPara: Props['irPara']; abrir: AbrirClaquete; comSobra: boolean }) {
  const rolagem = useRef<HTMLDivElement>(null);
  const grade = gradeDaSemana(dados);
  // "sem editor · sobrou" no fim, só para a coordenação e os editores (#172, veOQueSobrou)
  const fileiras = !comSobra ? grade.filter((f) => f.editor) : grade.some((f) => !f.editor) ? grade : [...grade, { editor: '', celulas: dados.dias.map((dia) => ({ dia, turno: null, itens: [], infos: [], avisos: [] })) }];
  const fora = (editor: string, dia: string) => (dados.fora ?? []).some((f) => f.dia === dia && ehDaPessoa(f.editor, editor));
  // a grade mais larga que a tela (celular, tablet): abre em hoje, logo depois da coluna dos nomes
  useLayoutEffect(() => {
    const r = rolagem.current;
    if (!r) return;
    const coluna = r.querySelector<HTMLElement>('th.pauta-dia.hoje');
    const nomes = r.querySelector<HTMLElement>('th.pauta-canto');
    if (!coluna || !nomes || r.scrollWidth <= r.clientWidth) return;
    r.scrollLeft = r.scrollLeft + coluna.getBoundingClientRect().left - nomes.getBoundingClientRect().right;
  }, [dados.inicio]);
  return (
    <div className="pauta-rolagem" ref={rolagem}>
      <table className="pauta-grade">
        <thead>
          <tr>
            <th className="pauta-canto" scope="col">
              <span className="rotulo">Editor</span>
            </th>
            {dados.dias.map((d, i) => (
              <TopoDoDiaDaGrade key={i} d={d} i={i} hoje={d === hoje} irPara={irPara} />
            ))}
          </tr>
        </thead>
        <tbody>
          {fileiras.map((f, i) => {
            const eu = ehDaPessoa(f.editor, voce);
            const claquetes = f.celulas.reduce((n, c) => n + c.itens.filter((l) => l.tipo === 'claquete').length, 0);
            return (
              <tr key={f.editor || '(sem editor)'} className={`${f.editor ? '' : 'sem-editor'}${eu ? ' eu' : ''}`} style={{ '--i': i } as CSSProperties}>
                <th scope="row" className="pauta-editor">
                  <div className="desliza">
                    <span className="pauta-editor-linha">
                      <span className="pauta-avatar" aria-hidden="true">
                        {f.editor ? iniciais(f.editor) : '–'}
                      </span>
                      <span className="pauta-nome">{f.editor || 'sem editor'}</span>
                      {eu && <VoceAMao />}
                    </span>
                    <span className="pauta-editor-meta">{f.editor ? `${claquetes} ${claquetes === 1 ? 'claquete' : 'claquetes'}` : 'sobrou'}</span>
                  </div>
                </th>
                {f.celulas.map((c) => (
                  <Celula key={c.dia} c={c} editor={f.editor} hoje={c.dia === hoje} foraNoDia={!!f.editor && fora(f.editor, c.dia)} abrir={abrir} />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Os achados da busca, na semana à vista e nas vizinhas: por dia, com o editor de cada um. Aparece e some recolhendo. */
function AchadosDaBusca({ termo, linhas, hoje, irPara, abrir }: { termo: string; linhas: readonly LinhaDaPauta[]; hoje: string; irPara: Props['irPara']; abrir: AbrirClaquete }) {
  useApelidos();
  const limpo = termo.trim();
  const saindo = useSaida(!!limpo, 260);
  // enquanto recolhe, o painel guarda o último termo
  const [ultimo, setUltimo] = useState(limpo);
  if (limpo && limpo !== ultimo) setUltimo(limpo);
  const mostrado = limpo || ultimo;
  const achados = useMemo(() => buscarNaPauta(linhas, mostrado, (l) => (l.tipo === 'claquete' ? apelidoDaClaquete(l.texto) : '')), [linhas, mostrado]);
  if (!limpo && !saindo) return null;
  const porDia = [...new Set(achados.map((l) => l.dia))].sort();
  return (
    <section className={`pauta-achados${saindo ? ' saindo' : ''}`} aria-label="Achados da busca" aria-live="polite">
      <div className="pauta-achados-dentro">
        <div className="pauta-folha">
          <div className="pauta-folha-topo">
            <span className="rotulo">
              Busca · {achados.length ? `${achados.length} ${achados.length === 1 ? 'achada' : 'achadas'}` : 'nada'} para “{mostrado}”
            </span>
            <span className="pauta-achados-onde">na semana à vista e nas vizinhas</span>
          </div>
          {porDia.length ? (
            <ol className="pauta-achados-dias">
              {porDia.map((d, i) => (
                <li key={d} className="pauta-achados-dia" style={{ '--i': i } as CSSProperties}>
                  <a className="pauta-achados-data" href={hashDaPauta({ dia: d })} onClick={(e) => (e.preventDefault(), irPara({ dia: d }))}>
                    {diaEscrito(d)}
                    {relativoA(hoje, d) && <span className="pauta-dia-rel"> {relativoA(hoje, d)}</span>}
                  </a>
                  <ul className="pauta-achados-linhas">
                    {achados
                      .filter((l) => l.dia === d)
                      .map((l) => (
                        <li key={l.id} className="pauta-achado">
                          <span className="pauta-achado-editor">{l.editor || <em>sem editor</em>}</span>
                          <ListaDaPauta itens={[l]} abrir={abrir} />
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <NadaNaBusca termo={mostrado} onde="por aqui" className="pauta-nada" />
          )}
        </div>
      </div>
    </section>
  );
}

/** O que desliza na troca de dia ou de semana: a mesa do dia e a visão, do período `mostrado`. */
function CorpoDaPauta({ visao, alvo, semanas, hojeDaGrade, hoje, irPara, abrir, aoMostrar }: { visao: 'semana' | 'dia'; alvo: string; semanas: Record<string, Semana>; hojeDaGrade: string; hoje: string; irPara: Props['irPara']; abrir: AbrirClaquete; aoMostrar: (dia: string) => void }) {
  const raiz = useRef<HTMLDivElement>(null);
  const mostrado = diaDoNumero(useTrocaDaPauta(raiz, numeroDoDia(alvo)));
  // o período e o resumo do alto contam quando o período novo entra (como a agenda: depois que o antigo sai)
  useLayoutEffect(() => aoMostrar(mostrado), [mostrado, aoMostrar]);
  const segunda = segundaDaSemana(mostrado, hoje);
  const dados = semanas[segunda];
  // a estreia (a pauta que chega, a troca de visão): os cards em cascata pelo CSS; depois, quem mexe é a troca
  const [estreia, setEstreia] = useState<'antes' | 'agora' | 'depois'>('antes');
  useEffect(() => {
    if (!dados || estreia !== 'antes') return;
    setEstreia('agora');
    const t = setTimeout(() => setEstreia('depois'), 700);
    return () => clearTimeout(t);
  }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps
  // o dia da mesa: no Dia, o dia aberto; na Semana, hoje (quando é da semana) ou a segunda
  const dia = visao === 'dia' ? mostrado : diasDaSemana(segunda).includes(hoje) ? hoje : segunda;
  // o que sobrou sem editor (a folha, a linha da Semana e a coluna do Dia), só para a coordenação e os editores (#172)
  const comSobra = !!dados && veOQueSobrou({ coordenacao: souCoordenacao(), editor: dados.voce.editor });
  return (
    <div className={`pauta-corpo pauta-corpo-${visao}${estreia === 'depois' ? '' : ' estreia'}`} ref={raiz}>
      {visao === 'dia' && <FitaDosDias dia={mostrado} hoje={hoje} ir={(d) => irPara({ dia: d })} />}
      {!dados ? (
        <p className="pauta-lendo">Lendo a pauta…</p>
      ) : (
        <>
          <RecadoDoDia linhas={dados.linhas} dia={dia} hoje={hoje} />
          <MesaDaPauta linhas={dados.linhas} dia={dia} hoje={hoje} voce={dados.voce.editor} fora={dados.fora} abrir={abrir} comSobra={comSobra} />
          {visao === 'dia' ? (
            <ColunasDoDia linhas={dados.linhas} dia={mostrado} voce={dados.voce.editor} abrir={abrir} comSobra={comSobra} />
          ) : !dados.linhas.length ? (
            <p className="pauta-vazia desliza">Nada na pauta desta semana.</p>
          ) : (
            <GradeDaSemana dados={dados} hoje={hojeDaGrade} voce={dados.voce.editor} irPara={irPara} abrir={abrir} comSobra={comSobra} />
          )}
        </>
      )}
    </div>
  );
}

/** "Mostrar o código das versões" (#152), na própria Pauta: a mesma opção do menu do perfil, lembrada por pessoa. */
function InterruptorDoCodigo() {
  const ligado = useCodigoDasVersoes();
  return (
    <button type="button" className="pauta-interruptor" role="switch" aria-checked={ligado} onClick={() => void lembrarCodigoDasVersoes(!ligado)}>
      <span className="pauta-trilho" aria-hidden="true" />
      Mostrar o código das versões
    </button>
  );
}

/** A Pauta da edição: a Semana ou o Dia (#97), pelo endereço. */
export function Pauta({ semana, dia, irPara, voltar, topo }: Props) {
  const visao = dia !== undefined ? 'dia' : 'semana';
  // "hoje" do Dia é o dia da pauta que está correndo (às 2h, ainda o de ontem); a grade da Semana marca o do calendário
  const [hojeDaGrade, setHojeDaGrade] = useState(() => diaEmSaoPaulo());
  const [hoje, setHoje] = useState(() => diaDaPautaAgora());
  useReleitura(useCallback(() => (setHoje(diaDaPautaAgora()), setHojeDaGrade(diaEmSaoPaulo())), []));
  const segunda = visao === 'dia' ? segundaDaSemana(diaOuHoje(dia ?? '', hoje), hoje) : segundaDaSemana(semana ?? '', hojeDaGrade);
  const qual = visao === 'dia' ? diaOuHoje(dia ?? '', hoje) : segunda;
  const desta = segundaDaSemana(hojeDaGrade, hojeDaGrade);
  const { semanas, falha, tentar } = useSemanas(segunda);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<ClaqueteNaTela | null>(null);
  const fecharFicha = useCallback(() => setAberta(null), []);
  const abrir: AbrirClaquete = useCallback((linha, origem, peloLapis = false) => setAberta({ linha, origem, peloLapis }), []);

  // ← e → trocam de dia ou de semana (fora dos campos de digitar e com a ficha fechada)
  const ir = useCallback(
    (n: -1 | 1) => {
      if (visao === 'dia') irPara({ dia: diaVizinho(qual, n) });
      else {
        const s = semanaVizinha(segunda, n);
        irPara({ semana: s === desta ? undefined : s });
      }
    },
    [visao, qual, segunda, desta, irPara],
  );
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (aberta || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest('input, textarea, select, [role="dialog"], [role="menu"]')) return;
      if (e.key === 'ArrowLeft') ir(-1);
      if (e.key === 'ArrowRight') ir(1);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ir, aberta]);

  const atual = semanas[segunda] ?? null;
  // o período na tela (o que a troca já mostra, #170): o seletor de datas e o resumo contam até ele quando o novo
  // entra. A troca de visão monta o corpo de novo, já no período pedido
  const [naTela, setNaTela] = useState({ visao, dia: qual });
  const aoMostrar = useCallback((d: string) => setNaTela((t) => (t.visao === visao && t.dia === d ? t : { visao, dia: d })), [visao]);
  const diaNaTela = !falha && naTela.visao === visao ? naTela.dia : qual;
  const segundaNaTela = segundaDaSemana(diaNaTela, hoje);
  // o resumo é o da semana na tela; enquanto ela ainda não chegou, o de antes fica (e conta quando ela chega)
  const ultimaLida = useRef<Semana | null>(null);
  const lidaNaTela = semanas[segundaNaTela] ?? ultimaLida.current;
  ultimaLida.current = lidaNaTela;
  // a busca e a ficha olham a pauta lida: a semana à vista e as vizinhas
  const lidas = useMemo(() => [-1, 0, 1].flatMap((n) => semanas[semanaVizinha(segunda, n)]?.linhas ?? []), [semanas, segunda]);
  const ehHoje = visao === 'dia' ? qual === hoje : segunda === desta;
  return (
    <div className="pagina pauta">
      {/* a linha do logo da fila, parada entre as telas (#159); sem ela, a volta para a fila */}
      {topo ?? (
        <header className="cad-topo">
          <button className="voltar-cad" onClick={voltar}>
            <Icone nome="voltar" tam={16} /> Fila
          </button>
          <Marca />
          <span />
        </header>
      )}
      <main className="pauta-pagina">
        <ContagemDaSemana segunda={segundaNaTela}>
          <div className="pauta-cabeca">
            <h1>Pauta da edição</h1>
            <div className="pauta-controles">
              {/* o Dia abre em hoje, quando hoje é desta semana; senão, na segunda */}
              <VisaoDaPauta visao={visao} semana={() => irPara({ semana: segunda === desta ? undefined : segunda })} dia={() => irPara({ dia: visao === 'dia' ? qual : diasDaSemana(segunda).includes(hoje) ? '' : segunda })} />
              <BuscaNaLupa valor={busca} mudar={setBusca} ativa={!aberta} dica="Buscar claquete, atração ou editor" rotulo="Buscar na pauta" />
              <InterruptorDoCodigo />
              <nav className="pauta-nav" aria-label={visao === 'dia' ? 'Dia' : 'Semana'}>
                <button type="button" className="botao pauta-hoje" disabled={ehHoje} onClick={() => irPara(visao === 'dia' ? { dia: '' } : {})}>
                  Hoje
                </button>
                <button type="button" className="botao-icone" aria-label={visao === 'dia' ? 'Dia anterior' : 'Semana anterior'} title={`${visao === 'dia' ? 'Dia anterior' : 'Semana anterior'} (←)`} onClick={() => ir(-1)}>
                  <Icone nome="voltar" tam={16} traco={2.2} />
                </button>
                <PeriodoDaPauta key={visao} visao={visao} dia={visao === 'dia' ? diaNaTela : segundaNaTela} />
                <button type="button" className="botao-icone" aria-label={visao === 'dia' ? 'Próximo dia' : 'Próxima semana'} title={`${visao === 'dia' ? 'Próximo dia' : 'Próxima semana'} (→)`} onClick={() => ir(1)}>
                  <Icone nome="direita" tam={16} traco={2.2} />
                </button>
              </nav>
            </div>
          </div>
          {!falha && <SobreALeitura leitura={lidaNaTela} />}
          <AchadosDaBusca termo={busca} linhas={lidas} hoje={hoje} irPara={irPara} abrir={abrir} />
          {falha ? (
            <p className="pauta-falha" role="alert">
              {falha}{' '}
              <button className="botao-texto" onClick={tentar}>
                Tentar de novo
              </button>
            </p>
          ) : (
            <CorpoDaPauta key={visao} visao={visao} alvo={qual} semanas={semanas} hojeDaGrade={hojeDaGrade} hoje={hoje} irPara={irPara} abrir={abrir} aoMostrar={aoMostrar} />
          )}
        </ContagemDaSemana>
      </main>
      {aberta && <ClaqueteAberta aberta={aberta} linhas={lidas.length ? lidas : [aberta.linha]} hoje={hoje} voce={atual?.voce.editor} fechar={fecharFicha} />}
    </div>
  );
}
