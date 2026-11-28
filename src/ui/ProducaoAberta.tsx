import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apelidoDaProducao, useApelidos } from '../dados/apelidos';
import {
  armazenamento,
  lerProducaoAberta,
  mudarArteDaProducao,
  mudarAtracaoDaProducao,
  mudarCampanhaDaProducao,
  mudarDesignerDaProducao,
  mudarPrazoDaProducao,
  novaCampanhaNaProducao,
  subirFogoDaProducao,
  type ArteDoCard,
  type ProducaoAberta as Lida,
  type RespostaDoCardAberto,
} from '../dados/armazenamento';
import { ApelidoDaClaquete, NomeDaClaquete, versoesDoCard } from './Apelido';
import { CardAberto, FecharOCardAberto } from './CardAberto';
import { CaixinhaDoDesfazer, PRAZO_DO_DESFAZER } from './desfazer';
import { EtiquetaDaCampanha } from './EtiquetaDaCampanha';
import { campanhasParaLigar, type CampanhaDoCard } from '../modelo/campanhas';
import { MenuLigar } from './Cadastros';
import { Riscado } from './Comparar';
import { FogoComTroca } from './fogo';
import { linhaDoTempoDoCard } from '../modelo/linhaDoTempo';
import { ROTULO_DA_COLUNA, diaDoPrazo, type CardDaProducao } from '../modelo/producoesPorPraca';
import { semPracaNoFim } from '../modelo/pracas';
import { useDesdeDaMarca } from './riscos';
import { Icone } from './icones';
import { Vagas } from './vagas';
import { nomeComparavel } from '../modelo/ligarPeloNome';

/* O card aberto da tela de produções (#113; #160, a alternativa A escolhida pelo usuário): um clique no card abre a
   Produção no CardAberto, o painel de 720 px no centro, que cresce do card clicado e volta para ele (Esc, o X ou o
   clique fora); no celular, a tela toda.
   Em cima, a claquete (o apelido, se tem), a praça e a etapa; no detalhe, a versão do Roteiro (V1 sem versão nova; não
   vai para o título), com o lápis do apelido (#156), quando o Roteiro chegou e o link do card no Trello. Quem está
   ligado a um designer muda ali: a atração (a busca do cadastro), o prazo e os designers (atribuir e tirar). As artes
   seguem a janela do After: a bolinha laranja numerada, a feita riscada (o risco se escreve na hora), o fogo da
   complexidade (o clique sobe um nível), apagar com desfazer e "+ arte". A linha do tempo começa fechada, num link.
   As campanhas (#178): as etiquetas (EtiquetaDaCampanha, a mesma do card), a busca para ligar (o MenuLigar da atração)
   com "+ Nova campanha", e tirar com a caixinha de desfazer (a CaixinhaDoDesfazer, a mesma do apagar a arte). Mudam
   o administrador, a coordenação, os designers e os redatores (o servidor diz em `podeLigarCampanhas`).
   Cada mudança aparece na hora e vai ao servidor (o Trello e o evento); recusada, volta atrás e diz o motivo. */

interface Props {
  card: CardDaProducao;
  /** o card clicado: o painel cresce dele e volta para ele */
  origem: HTMLElement | null;
  /** a Produção já lida antes de abrir (o painel cresce já com a altura certa); sem ela, lê ao abrir */
  inicial?: Lida | null;
  hoje: string;
  /** o prazo como o card escreve ("sex 20/11") */
  prazoEscrito: (prazo: string) => string;
  /** o designer de quem está logado; null sem a ligação (só olha) */
  voce: string | null;
  /** os botões da etapa (Peguei, Entreguei, Voltar), os mesmos do card */
  etapa?: ReactNode;
  /** a recusa da mudança de etapa, para aparecer aqui também */
  recusa?: string;
  /** o card mudou no servidor: a tela mostra o novo */
  mudou: (c: CardDaProducao) => void;
  fechar: () => void;
}

export function ProducaoAberta(props: Props) {
  return (
    <CardAberto origem={props.origem} titulo="prod-aberta-titulo" fechar={props.fechar}>
      <ConteudoDaProducao {...props} />
    </CardAberto>
  );
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Os dias do menu do prazo: de hoje em diante, sem os domingos. */
const diasDoPrazo = (hoje: string, n = 12) => {
  const dias: string[] = [];
  for (let d = hoje; dias.length < n; d = somarDias(d, 1)) if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) dias.push(d);
  return dias;
};
/** "26/11 14:02", no fuso de São Paulo. */
const instanteCurto = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const diaCurto = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const NIVEL = { 1: 'BAIXA', 2: 'MÉDIA', 3: 'ALTA' } as const;
/** O campo que acabou de mudar pisca de leve (a troca), esse tempo. */
const TROCA_MS = 450;

type Menu = 'atracao' | 'prazo' | 'designer' | 'campanha' | null;
/** O que a caixinha de desfazer do card aberto oferece agora (o apagar da arte, o tirar da campanha). */
interface Desfazivel {
  texto: ReactNode;
  vez: number;
  /** o que volta: a arte apagada (com o lugar dela) ou a campanha tirada */
  arte?: { arte: ArteDoCard; lugar: number; vez: number };
  campanha?: CampanhaDoCard;
}

function ConteudoDaProducao({ card, inicial = null, hoje, prazoEscrito, voce, etapa, recusa: recusaDaTela, mudou }: Props) {
  useApelidos();
  const [lida, setLida] = useState<Lida | null>(inicial);
  const [erro, setErro] = useState('');
  const [recusa, setRecusa] = useState('');
  const [menu, setMenu] = useState<Menu>(null);
  const [tempo, setTempo] = useState(false);
  const [trocou, setTrocou] = useState<string | null>(null);
  const [apagada, setApagada] = useState<{ arte: ArteDoCard; lugar: number; vez: number } | null>(null);
  const [novaArte, setNovaArte] = useState<string | null>(null);
  const [pedidoDoLapis, setPedidoDoLapis] = useState(0);
  const [desfazivel, setDesfazivel] = useState<Desfazivel | null>(null);
  const cardAgora = useRef(card);
  cardAgora.current = card;
  const podeMudar = !!voce && armazenamento.tipo === 'servidor';
  // lida de novo quando a mudança da tela (ou a releitura) traz outra etapa ou outros designers: há eventos novos
  const versao = `${card.id}|${card.etapa}|${card.designers.join('|')}`;
  useEffect(() => {
    let vivo = true;
    lerProducaoAberta(card.id).then(
      (l) => {
        if (!vivo) return;
        setLida(l);
        setErro('');
      },
      (e) => vivo && setErro(e instanceof Error ? e.message : 'Não deu para ler a Produção.'),
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao]);
  useEffect(() => {
    if (!apagada) return;
    const t = setTimeout(() => setApagada(null), PRAZO_DO_DESFAZER);
    return () => clearTimeout(t);
  }, [apagada]);
  useEffect(() => {
    if (!trocou) return;
    const t = setTimeout(() => setTrocou(null), TROCA_MS);
    return () => clearTimeout(t);
  }, [trocou]);

  const artes = lida?.artesDoCard ?? [];
  // o risco se escreve só na arte que acabou de ser marcada (a que abre já feita vem riscada, parada)
  const desde = useDesdeDaMarca(artes.filter((a) => a.feita).map((a) => a.nome));

  /** Uma mudança: na hora (`naHora`), e com a resposta, o que o servidor diz; recusada, volta atrás e diz o motivo. */
  const agir = async (oQue: string, pedir: () => Promise<RespostaDoCardAberto>, naHora?: (l: Lida) => Lida) => {
    const antes = lida;
    setRecusa('');
    if (naHora && lida) setLida(naHora(lida));
    try {
      const r = await pedir();
      if (r.aberta) setLida(r.aberta);
      if (r.producao) mudou(r.producao);
      return true;
    } catch (e) {
      if (antes) setLida(antes);
      setRecusa(`Não ${oQue}: ${e instanceof Error ? e.message : 'o servidor não respondeu.'}`);
      return false;
    }
  };
  const comArtes = (f: (a: ArteDoCard[]) => ArteDoCard[]) => (l: Lida) => ({ ...l, artesDoCard: f(l.artesDoCard ?? []) });

  const marcar = (a: ArteDoCard) =>
    void agir(a.feita ? 'desmarcou a arte' : 'marcou a arte', () => mudarArteDaProducao(card.id, a.nome, a.feita ? 'desmarcar' : 'marcar'), comArtes((l) => l.map((x) => (x.nome === a.nome ? { ...x, feita: !a.feita } : x))));
  const apagar = (a: ArteDoCard) => {
    const lugar = artes.findIndex((x) => x.nome === a.nome);
    const d = { arte: a, lugar, vez: Date.now() };
    setApagada(d);
    setDesfazivel({
      texto: (
        <>
          Apagou <b>{a.nome}</b> · saiu do checklist
        </>
      ),
      arte: d,
      vez: d.vez,
    });
    void agir('apagou a arte', () => mudarArteDaProducao(card.id, a.nome, 'apagar'), comArtes((l) => l.filter((x) => x.nome !== a.nome))).then((ok) => !ok && (setApagada(null), setDesfazivel(null)));
  };
  const desfazerApagar = (d: NonNullable<typeof apagada>) => {
    setApagada(null);
    setDesfazivel(null);
    void agir('devolveu a arte', () => mudarArteDaProducao(card.id, d.arte.nome, 'voltar'), comArtes((l) => [...l.slice(0, d.lugar), d.arte, ...l.slice(d.lugar)]));
  };
  const subirFogo = (a: ArteDoCard) =>
    void agir('mudou o fogo', () => subirFogoDaProducao(card.id, a.nome), comArtes((l) => l.map((x) => (x.nome === a.nome ? { ...x, fogo: x.fogo === 3 ? 1 : ((x.fogo + 1) as 2 | 3) } : x))));
  const incluir = (nome: string) => {
    const n = nome.trim();
    if (!n) return void setNovaArte(null);
    setNovaArte(null);
    void agir('incluiu a arte', () => mudarArteDaProducao(card.id, n, 'incluir'), comArtes((l) => [...l, { nome: n, itens: [n], feita: false, fogo: 1 }]));
  };
  const ligarAtracao = (nome: string) => {
    setMenu(null);
    if (nome === card.atracao) return;
    mudou({ ...card, atracao: nome });
    void agir(nome ? 'ligou a atração' : 'desligou a atração', () => mudarAtracaoDaProducao(card.id, nome)).then((ok) => (ok ? setTrocou('atracao') : mudou(card)));
  };
  const mudarPrazo = (dia: string) => {
    setMenu(null);
    if (card.prazo && diaDoPrazo(card.prazo) === dia) return;
    mudou({ ...card, prazo: dia });
    void agir('mudou o prazo', () => mudarPrazoDaProducao(card.id, dia)).then((ok) => (ok ? setTrocou('prazo') : mudou(card)));
  };
  /** Ligar (`entra`) ou tirar a Produção de uma campanha (#178): a etiqueta muda na hora; tirar abre a caixinha. */
  const campanha = (c: CampanhaDoCard, entra: boolean) => {
    setMenu(null);
    // o card de agora: o desfazer da caixinha chega depois de o card ter mudado
    const atual = cardAgora.current;
    const antes = atual.campanhas ?? [];
    if (entra === antes.some((x) => x.id === c.id)) return;
    mudou({ ...atual, campanhas: entra ? [...antes, c] : antes.filter((x) => x.id !== c.id) });
    if (!entra)
      setDesfazivel({
        texto: (
          <>
            Tirou da campanha <b>{c.nome}</b>
          </>
        ),
        campanha: c,
        vez: Date.now(),
      });
    else setDesfazivel(null);
    void agir(entra ? `ligou à campanha ${c.nome}` : `tirou da campanha ${c.nome}`, () => mudarCampanhaDaProducao(card.id, c.id, entra)).then((ok) => {
      if (ok) return;
      mudou({ ...cardAgora.current, campanhas: antes });
      setDesfazivel(null);
    });
  };
  /** "+ Nova campanha" (#178): cria com o nome buscado e liga (o nome que já existe liga a que existe). */
  const novaCampanha = (nome: string) => {
    const n = nome.trim().replace(/\s+/g, ' ');
    if (!n) return;
    setMenu(null);
    void agir(`criou a campanha ${n}`, () => novaCampanhaNaProducao(card.id, n));
  };
  const designer = (nome: string, entra: boolean) => {
    setMenu(null);
    const designers = entra ? [...card.designers, nome] : card.designers.filter((d) => d !== nome);
    mudou({ ...card, designers });
    void agir(entra ? `atribuiu ${nome}` : `tirou ${nome}`, () => mudarDesignerDaProducao(card.id, nome, entra)).then((ok) => !ok && mudou(card));
  };

  const apelido = apelidoDaProducao(card.id);
  const versoes = versoesDoCard(card);
  const feitas = artes.filter((a) => a.feita).length;
  const passou = !!card.prazo && card.etapa !== 'entregue' && diaDoPrazo(card.prazo) < hoje;
  const livres = (lida?.designersAtivos ?? []).filter((d) => !card.designers.some((x) => nomeComparavel(x) === nomeComparavel(d)));
  const itensDoTempo = lida ? linhaDoTempoDoCard(lida.eventos) : [];
  const podeCampanhas = !!lida?.podeLigarCampanhas && armazenamento.tipo === 'servidor';
  const campanhasDoCard = card.campanhas ?? [];
  const paraLigar = campanhasParaLigar(lida?.todasAsCampanhas ?? [], campanhasDoCard);
  const nomeDoLapis = apelido ? 'Editar o apelido' : 'Dar um apelido';
  /** O menu aberto fecha no Esc antes do card aberto (que fecha no Esc seguinte). */
  const escDoMenu = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || !menu) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu(null);
  };
  const alternar = (m: Exclude<Menu, null>) => setMenu((x) => (x === m ? null : m));
  useFecharFora(menu !== null && menu !== 'atracao' && menu !== 'campanha', () => setMenu(null));

  return (
    <div className="pa" data-producao={card.id} onKeyDown={escDoMenu}>
      <header className="pa-topo">
        <span className="pa-etapa" data-etapa={card.etapa}>
          <i aria-hidden="true" />
          {card.praca || 'sem praça'} · {ROTULO_DA_COLUNA[card.etapa]}
        </span>
        <FecharOCardAberto rotulo="Fechar a Produção" />
        <h2 id="prod-aberta-titulo" title={apelido ? `Claquete: ${card.claquete}` : undefined}>
          {apelido || card.claquete ? <NomeDaClaquete nome={apelido || card.claquete} versoes={versoes} marca={card.letraEVersao} /> : 'Sem claquete'}
        </h2>
        <p className="pa-detalhe">
          {/* a versão do Roteiro (#156): sempre aqui, V1 sem versão nova; nunca no título */}
          <span className="pa-versao" title={lida?.roteiro ? 'A versão do roteiro' : 'Sem roteiro no PROMeiro: vale a V1'}>
            V{lida?.roteiro?.versao ?? 1}
            {podeMudar && !!card.claquete.trim() && (
              <button type="button" className="pa-lapis" title={nomeDoLapis} aria-label={`${nomeDoLapis}: ${card.claquete}`} onClick={() => setPedidoDoLapis((n) => n + 1)}>
                <Icone nome="lapis" tam={12} traco={1.9} />
              </button>
            )}
          </span>
          {lida?.roteiro?.em && <span>roteiro de {diaCurto(lida.roteiro.em)}</span>}
          {lida?.trello ? (
            <a href={lida.trello} target="_blank" rel="noopener noreferrer">
              card no Trello
            </a>
          ) : (
            card.semCard && <span>sem card no Trello</span>
          )}
          {card.marcador && <span className="prod-marcador">{card.marcador}</span>}
        </p>
        {/* o apelido da claquete (#154), pelo lápis (#156); "dar as versões" fica escondido (DAR_AS_VERSOES) */}
        <ApelidoDaClaquete alvo={{ producao: card.id }} claquete={semPracaNoFim(card.claquete)} versoes={card.versoesLidas ?? []} dia={card.prazo ? diaDoPrazo(card.prazo) : ''} podeMudar={armazenamento.tipo === 'servidor'} pedidoDoLapis={pedidoDoLapis} />
      </header>

      {(recusa || recusaDaTela) && (
        <p className="pa-recusa" role="alert">
          {recusa || recusaDaTela}
        </p>
      )}

      <div className="pa-campos">
        <div className="pa-campo">
          <span className="pa-rotulo" id="pa-rotulo-atracao">Atração</span>
          <button type="button" className={`pa-valor${trocou === 'atracao' ? ' trocou' : ''}`} aria-labelledby="pa-rotulo-atracao" aria-expanded={menu === 'atracao'} disabled={!podeMudar || !lida} onClick={() => alternar('atracao')}>
            <span>{card.atracao || <span className="vazio">{podeMudar ? 'ligar uma atração' : 'sem atração'}</span>}</span>
            {podeMudar && <Icone nome="baixo" tam={12} traco={2} />}
          </button>
          {menu === 'atracao' && (
            <div className="pa-menu-atracao">
              <MenuLigar atracoes={lida?.atracoes ?? []} ligar={ligarAtracao} fechar={() => setMenu(null)} />
              {card.atracao && (
                <button type="button" className="pa-desligar" onMouseDown={(e) => e.preventDefault()} onClick={() => ligarAtracao('')}>
                  Desligar a atração
                </button>
              )}
            </div>
          )}
        </div>
        <div className="pa-campo">
          <span className="pa-rotulo" id="pa-rotulo-prazo">Prazo</span>
          <button type="button" className={`pa-valor${passou ? ' passou' : ''}${trocou === 'prazo' ? ' trocou' : ''}`} aria-labelledby="pa-rotulo-prazo" aria-expanded={menu === 'prazo'} disabled={!podeMudar} onClick={() => alternar('prazo')}>
            <span>{card.prazo ? prazoEscrito(card.prazo) : <span className="vazio">sem prazo</span>}</span>
            {podeMudar && <Icone nome="baixo" tam={12} traco={2} />}
          </button>
          {menu === 'prazo' && (
            <div className="menu pa-menu" data-menu-do-card>
              <div className="pa-datas">
                {diasDoPrazo(hoje).map((d) => {
                  const dt = new Date(`${d}T12:00:00Z`);
                  const esse = !!card.prazo && diaDoPrazo(card.prazo) === d;
                  return (
                    <button key={d} type="button" className={`menu-item${esse ? ' ativo' : ''}`} aria-pressed={esse} onClick={() => mudarPrazo(d)}>
                      <small>{d === hoje ? 'hoje' : DIAS_CURTOS[dt.getUTCDay()]}</small>
                      {dt.getUTCDate()}/{dt.getUTCMonth() + 1}
                    </button>
                  );
                })}
              </div>
              <label className="pa-outro-dia">
                outro dia
                <input type="date" min={hoje} onChange={(e) => e.target.value && mudarPrazo(e.target.value)} />
              </label>
            </div>
          )}
        </div>
        <div className="pa-campo direita">
          <span className="pa-rotulo">Designers</span>
          <span className="pa-chips">
            <Vagas eixo="x" itens={card.designers} chave={(d) => d}>
              {(d) => (
                <span className={`pa-chip${voce && nomeComparavel(d) === nomeComparavel(voce) ? ' voce' : ''}`}>
                  <span className="pa-av" aria-hidden="true">
                    {iniciais(d)}
                  </span>
                  {d.split(' ')[0]}
                  {podeMudar && (
                    <button type="button" aria-label={`Tirar ${d}`} title={`Tirar ${d}`} onClick={() => designer(d, false)}>
                      <Icone nome="fechar" tam={11} traco={2.2} />
                    </button>
                  )}
                </span>
              )}
            </Vagas>
            {podeMudar ? (
              <button type="button" className="pa-mais" aria-expanded={menu === 'designer'} aria-label="Atribuir um designer" title="Atribuir um designer" onClick={() => alternar('designer')}>
                <Icone nome="mais" tam={11} traco={2.2} />
                {!card.designers.length && 'atribuir'}
              </button>
            ) : (
              !card.designers.length && <span className="vazio">ninguém</span>
            )}
          </span>
          {menu === 'designer' && (
            <div className="menu pa-menu" data-menu-do-card>
              <div className="pa-menu-lista">
                {livres.length ? (
                  livres.map((d) => (
                    <button key={d} type="button" className="menu-item" onClick={() => designer(d, true)}>
                      <span className="pa-av" aria-hidden="true">
                        {iniciais(d)}
                      </span>
                      {d}
                      {voce && nomeComparavel(d) === nomeComparavel(voce) && <small>você</small>}
                    </button>
                  ))
                ) : (
                  <p className="pa-menu-vazio">todo mundo já está</p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="pa-campo campanhas-do-card">
          <span className="pa-rotulo" id="pa-rotulo-campanhas">
            Campanhas
          </span>
          <span className="pa-chips" role="group" aria-labelledby="pa-rotulo-campanhas">
            <EtiquetaDaCampanha modo="todas" campanhas={campanhasDoCard} tirar={podeCampanhas ? (c) => campanha(c, false) : undefined} />
            {podeCampanhas ? (
              <button type="button" className="pa-mais" aria-expanded={menu === 'campanha'} aria-label="Ligar a uma campanha" title="Ligar a uma campanha" onClick={() => setMenu('campanha')}>
                <Icone nome="mais" tam={11} traco={2.2} />
                {!campanhasDoCard.length && 'ligar a uma campanha'}
              </button>
            ) : (
              !campanhasDoCard.length && <span className="vazio">nenhuma</span>
            )}
          </span>
          {menu === 'campanha' && (
            <div className="pa-menu-campanha">
              <MenuLigar
                atracoes={paraLigar.map((c) => c.nome)}
                ligar={(nome) => {
                  const c = paraLigar.find((x) => x.nome === nome);
                  if (c) campanha(c, true);
                }}
                nova={novaCampanha}
                fechar={() => setMenu(null)}
                dica="Buscar campanha"
                rotuloDaNova="+ Nova campanha"
              />
            </div>
          )}
        </div>
      </div>

      {erro ? (
        <p className="pa-falha" role="alert">
          {erro}
        </p>
      ) : !lida ? (
        <p className="pa-lendo">Lendo a Produção…</p>
      ) : (
        <>
          <section className="pa-parte" aria-labelledby="pa-artes-titulo">
            <h3 id="pa-artes-titulo">
              Artes
              {artes.length > 0 && (
                <small>
                  {feitas} de {artes.length} {artes.length === 1 ? 'feita' : 'feitas'}
                </small>
              )}
            </h3>
            {artes.length || apagada ? (
              <ol className="artes so-lista pa-artes">
                <Vagas itens={artes} chave={(a) => a.nome}>
                  {(a) => {
                    const n = artes.findIndex((x) => x.nome === a.nome) + 1;
                    return (
                      <li className={`pa-arte${a.feita ? ' marcada existe' : ''}`} data-arte={a.nome}>
                        <button
                          type="button"
                          className="arte-linha"
                          disabled={!podeMudar}
                          title={podeMudar ? (a.feita ? 'Feita · clique para voltar a fazer' : 'Clique: feita') : undefined}
                          aria-pressed={a.feita}
                          onClick={() => marcar(a)}
                        >
                          <span className="b" data-marca={a.feita ? 'existe' : 'produzir'}>
                            <span className="num">{n || ''}</span>
                            <Icone nome="certo" tam={11} traco={2.8} />
                          </span>
                          <span className="txt">
                            <b>
                              {a.feita ? (
                                <Riscado semente={n} desde={desde.get(a.nome)}>
                                  {a.nome}
                                </Riscado>
                              ) : (
                                a.nome
                              )}
                            </b>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="cx"
                          disabled={!podeMudar || card.etapa === 'entregue'}
                          aria-label={`Complexidade ${NIVEL[a.fogo]}`}
                          title={`Complexidade: ${NIVEL[a.fogo]}${podeMudar && card.etapa !== 'entregue' ? ' · clique sobe um nível' : ''}`}
                          onClick={() => subirFogo(a)}
                        >
                          <FogoComTroca n={a.fogo} />
                        </button>
                        {podeMudar && (
                          <button type="button" className="tirar-arte" aria-label={`Apagar ${a.nome}`} title="Apagar a arte (sai do checklist)" onClick={() => apagar(a)}>
                            <Icone nome="lixo" tam={15} traco={1.7} />
                          </button>
                        )}
                      </li>
                    );
                  }}
                </Vagas>
              </ol>
            ) : (
              <p className="pa-nada">sem a lista de artes</p>
            )}
            {podeMudar &&
              (novaArte === null ? (
                <button type="button" className="botao-texto pa-nova-arte" onClick={() => setNovaArte('')}>
                  + arte
                </button>
              ) : (
                <form
                  className="pa-nova-arte-campo"
                  onSubmit={(e) => {
                    e.preventDefault();
                    incluir(novaArte);
                  }}
                >
                  <input
                    autoFocus
                    value={novaArte}
                    maxLength={120}
                    placeholder="o nome da arte"
                    aria-label="O nome da arte nova"
                    onChange={(e) => setNovaArte(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key !== 'Escape') return;
                      e.preventDefault();
                      setNovaArte(null);
                    }}
                  />
                  <button type="submit" className="botao">
                    incluir
                  </button>
                  <button type="button" className="botao-texto" onClick={() => setNovaArte(null)}>
                    cancelar
                  </button>
                </form>
              ))}
          </section>

          <section className="pa-tempo">
            <button type="button" className="botao-texto pa-tempo-link" aria-expanded={tempo} aria-controls="pa-tempo-lista" onClick={() => setTempo((t) => !t)}>
              linha do tempo
              <Icone nome="baixo" tam={12} traco={2} />
            </button>
            <Vagas itens={tempo ? ['tempo'] : []} chave={(k) => k}>
              {() =>
                itensDoTempo.length ? (
                  <ol className="pa-tempo-lista" id="pa-tempo-lista">
                    <Vagas itens={itensDoTempo} chave={(i) => `${i.quando}|${i.texto}`}>
                      {(i) => (
                        <li className={i.doPROMeiro ? 'promeiro' : undefined}>
                          <i aria-hidden="true" />
                          <time dateTime={i.quando}>{instanteCurto(i.quando)}</time>
                          <span>{i.texto}</span>
                        </li>
                      )}
                    </Vagas>
                  </ol>
                ) : (
                  <p className="pa-nada" id="pa-tempo-lista">
                    nada ainda
                  </p>
                )
              }
            </Vagas>
          </section>
        </>
      )}

      <footer className="pa-pe">
        {etapa}
        <span className="pa-espaco" />
        {lida?.trello && (
          <a className="botao-texto pa-trello" href={lida.trello} target="_blank" rel="noopener noreferrer">
            Abrir no Trello
            <Icone nome="seta" tam={13} />
          </a>
        )}
      </footer>

      <CaixinhaDoDesfazer caixinha={desfazivel && { id: desfazivel.vez, texto: desfazivel.texto, desfazer: () => (desfazivel.arte ? desfazerApagar(desfazivel.arte) : desfazivel.campanha && campanha(desfazivel.campanha, true)), fechar: () => setDesfazivel(null) }} />
    </div>
  );
}

/** As iniciais do nome ("Ana Souza" → "AS"). */
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** Fecha o menu do card (o do prazo e o dos designers) com o clique fora dele. */
function useFecharFora(aberto: boolean, fechar: () => void) {
  const f = useRef(fechar);
  f.current = fechar;
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Element;
      if (!alvo.closest('[data-menu-do-card], .pa-valor, .pa-mais')) f.current();
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
}
