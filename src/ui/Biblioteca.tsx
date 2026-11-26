import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Falha } from '../App';
import { apagarAoSair, armazenamento, escolherMinhaCor, mandarParaTrello, roteiroDa, temCadastros, temFilmes, temTrello, type Andamento, type Resumo, type TipoCadastro, versaoNova } from '../dados/armazenamento';
import { corDe, iniciais, nomesCurtos as nomes, PALETA, primeiroNome as primeiro, registrarCores } from '../dados/colaboracao';
import { ouvirFila, type Fila } from '../dados/eventos';
import { exportar, pendencias, TEXTO_SEM_REDATOR, travamTrello } from '../modelo/exportar';
import { estadoDoRedator, recusarPalpite, sugeridosDoMenu } from '../modelo/redator';
import type { Meta, Roteiro } from '../modelo/tipos';
import { useDeslize, Vagas } from './vagas';
import { BalaoLigar } from './BalaoLigar';
import type { AtracaoNova } from './Cadastros';
import { agruparPorDia, CRITERIOS, eixoDaSemana, filaVisivel, inicioDaSemana, montarFaixa, montarSemana, mudancasDaSemana, noTrello, nomeDaEtiqueta, pedeRevisao, peDoCard, pendentes, periodoNaContagem, proximoParaRevisar as proximoDaFila, posicaoNaContagem, resumoDosDias, rubrica, semanaEncolhida, type CardDaSemana, type CriterioDaAgenda, type EtapaDoCard, type FaixaDeDias, type GrupoDia, type PeDoCard } from './fila';
import { useFaixa, useTelaDeCelular } from './faixa';
import { AbasDoCriterio, Periodo, PeriodoQueConta, ResumoQueConta, TopoDoDia, useContagemDoPeriodo, VoltarParaHoje } from './topoDaAgenda';
import { useTrocaDeCriterio, useTrocaDeSemana } from './trocaDeSemana';
import { Ponteiros, useMeuPonteiro, type PonteiroDeAlguem, type PosicaoPonteiro } from './ponteiros';
import { avisarCursorMudou, CURSORES, Cursor, cursorNoMouse, escolherCursor, meuCursor, usarCursorNoMouse, usarVerPonteiros, verPonteiros } from './cursores';
import { aplicarTema, temaSalvo, type Tema } from './tema';
import { SAIR_DO_ACESSO, type Identidade } from '../dados/identidade';
import type { Pessoa } from '../modelo/tipos';
import { avisoDaSubstituicao } from './Comparar';
import { Icone } from './icones';
import { CenaDaFilaZerada, TituloEmDia, useFilaZerada } from './FilaZerada';
import { CONVITES, CONVITES_FILA_VAZIA, ConviteCompacto, ConviteDeArrastar, Duvida, EscolhaDeNome, Marca, RABISCOS, Riscado, TextoDaClaquete, useSaida } from './pecas';
import { redatoresConhecidos, semAcento } from '../modelo/vocabularios';
import { dataCurtaComDia, ehCelular, plural } from './util';
import { ehDoTour } from '../tour/exemplo';

/** Roteiros de demonstração, lidos de ./exemplos.json (arquivo → base64) quando o build é feito com VITE_EXEMPLOS=1. */
const EXEMPLOS: [string, string][] = import.meta.env.VITE_EXEMPLOS
  ? [
      ['Quem Ama Cuida (colunas)', 'Quem_AmaPrologo26_10_Rede.docx'],
      ['Eliana (.rtf)', 'Eliana_20_9.rtf'],
      ['Encontro', 'Encontro_27_10.docx'],
      ['Nobreza do Amor', 'Nobreza_27_10.docx'],
      ['Futebol', 'FutBrasileirao28_10_Sp.docx'],
    ]
  : [];

interface Props {
  abrir: (id: string) => void;
  /** Coberta pela comparação: continua à vista, borrada, mas não responde. */
  aoFundo?: boolean;
  /** Roteiro cuja claquete já está na produção da arte: compara e decide antes da revisão. */
  comparar: (id: string) => void;
  abrirArquivo: (arquivo: File) => void;
  /** Arquivos escolhidos no seletor (clique na área de importação). */
  receberArquivos: (arquivos: File[]) => void;
  /** Folha nova para colar do Word, a partir da claquete. */
  criar: (claquete: string) => void;
  avisar: (texto: string) => void;
  identidade: Identidade | null;
  definirPerfil: (p: Pessoa) => void;
  /** Roteiros que acabaram de chegar: a ficha deles se monta com animação. */
  novos: string[];
  /** Arquivos soltos que não deu para ler. */
  falhas: Falha[];
  tirarFalha: (nome: string) => void;
  /** Muda a cada arquivo processado, para a fila se atualizar. */
  chegou: number;
  /** Arquivo sendo lido agora, quando a leitura demora (OCR). */
  lendo: { nome: string; detalhe: string } | null;
  /** Abre os cadastros (atrações, redatores, editores), opcionalmente já com uma claquete para cadastrar. */
  cadastros: (inicio?: { aba?: TipoCadastro; claquete?: string } & Partial<AtracaoNova>) => void;
  /** Abre a aba Filmes (as prévias de filmes). */
  filmes?: () => void;
  /** A fila abre já buscando isto (o "Buscar na fila" do link quebrado). */
  buscaInicial?: string;
}


/** O desenho do meu ponteiro, como os colegas o veem. Times só por escolha. */
function EscolhaDeCursor({ email, cor }: { email: string; cor: string }) {
  const [atual, setAtual] = useState(() => meuCursor(email));
  useEffect(() => setAtual(meuCursor(email)), [email]);
  const [noMouse, setNoMouse] = useState(cursorNoMouse);
  const [ver, setVer] = useState(verPonteiros);
  return (
    <div className="escolha-cursor">
      <div className="rotulo">Seu cursor, para os colegas</div>
      <div className="escolha-cursor-grade" role="radiogroup" aria-label="Seu cursor">
        {CURSORES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={atual === c.id}
            title={c.nome}
            onClick={() => {
              escolherCursor(c.id);
              setAtual(c.id);
              avisarCursorMudou();
            }}
          >
            <Cursor id={c.id} cor={cor} tamanho={34} />
          </button>
        ))}
      </div>
      <label className="no-mouse">
        <input type="checkbox" checked={noMouse} onChange={(e) => { setNoMouse(e.target.checked); usarCursorNoMouse(e.target.checked); }} />
        <span>Usar também no meu mouse</span>
      </label>
      <label className="no-mouse">
        <input type="checkbox" checked={ver} onChange={(e) => { setVer(e.target.checked); usarVerPonteiros(e.target.checked); }} />
        <span>Ver os ponteiros dos colegas</span>
      </label>
    </div>
  );
}

/** A minha cor de destaque: o grifo na claquete, a orelha, o "tá vendo", o cursor e a edição junto. */
function EscolhaDeCor({ email, cor, mudar }: { email: string; cor: string; mudar: (cor: string) => void }) {
  const primeiroNome = (email.split('@')[0].split(/[._-]/)[0] || 'você').replace(/^./, (c) => c.toUpperCase());
  return (
    <div className="escolha-cor">
      <div className="rotulo">Sua cor de destaque</div>
      <div className="amostra-cor" style={{ '--cor': cor } as React.CSSProperties} aria-hidden="true">
        <b>FESTA 19/11</b>
        <span>{primeiroNome} tá vendo</span>
      </div>
      <div className="escolha-cor-grade" role="radiogroup" aria-label="Sua cor de destaque">
        {PALETA.map((p) => (
          <button key={p.cor} type="button" role="radio" aria-checked={cor === p.cor} title={p.nome} aria-label={p.nome} style={{ '--cor': p.cor } as React.CSSProperties} onClick={() => mudar(p.cor)}>
            <Icone nome="certo" tam={13} traco={3} />
          </button>
        ))}
      </div>
    </div>
  );
}

const TEMAS: { id: Tema; nome: string }[] = [
  { id: 'sistema', nome: 'Sistema' },
  { id: 'claro', nome: 'Claro' },
  { id: 'escuro', nome: 'Escuro' },
];

function EscolhaDeTema() {
  const [atual, setAtual] = useState<Tema>(temaSalvo);
  return (
    <div className="escolha-tema">
      <div className="rotulo">Tema</div>
      <div className="escolha-tema-opcoes" role="radiogroup" aria-label="Tema">
        {TEMAS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={atual === t.id}
            onClick={() => {
              aplicarTema(t.id);
              setAtual(t.id);
            }}
          >
            <span className={`amostra-tema ${t.id}`} aria-hidden />
            {t.nome}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Quem está usando. Com login na porta, só mostra; sem ele, deixa a pessoa se identificar. */
function Perfil({ identidade, definirPerfil, cadastros, filmes, aoMudarCor }: Pick<Props, 'identidade' | 'definirPerfil'> & { cadastros?: () => void; filmes?: () => void; aoMudarCor?: () => void }) {
  const meuEmail = identidade?.email ?? '';
  const [minhaCor, setMinhaCor] = useState(() => corDe(meuEmail));
  useEffect(() => setMinhaCor(corDe(meuEmail)), [meuEmail]);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setNome(identidade?.nome ?? '');
    setEmail(identidade?.email ?? '');
  }, [identidade]);
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

  return (
    <div className="perfil" ref={caixa}>
      <button className={`perfil-botao ${identidade ? '' : 'falta'}`} aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        {identidade ? (
          <>
            <span className="perfil-avatar">{iniciais(identidade.nome)}</span>
            <span className="perfil-nome">{identidade.nome}</span>
          </>
        ) : (
          'Quem é você?'
        )}
      </button>
      {aberto && (
        <div className="perfil-painel" role="dialog" aria-label="Seu perfil">
          {identidade?.origem === 'acesso' ? (
            <>
              <strong>{identidade.nome}</strong>
              <span className="suave">{identidade.email}</span>
              <p className="suave pequeno">Você entrou com a conta da empresa. Seus roteiros saem assinados com este nome.</p>
              <a className="botao-texto" href={SAIR_DO_ACESSO}>Sair</a>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!nome.trim()) return;
                definirPerfil({ nome, email });
                setAberto(false);
              }}
            >
              <label htmlFor="perfil-nome">Seu nome</label>
              <input id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como assina os roteiros" autoFocus autoComplete="name" />
              <label htmlFor="perfil-email">E-mail da empresa</label>
              <input id="perfil-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" autoComplete="email" />
              <p className="suave pequeno">Fica só neste navegador e assina os roteiros que você escrever.</p>
              <button className="botao primario" disabled={!nome.trim()}>Salvar</button>
            </form>
          )}
          {cadastros && (
            <button type="button" className="perfil-link" onClick={cadastros}>
              <Icone nome="pessoas" tam={16} /> Cadastros <small>atrações, redatores, editores</small>
            </button>
          )}
          {filmes && (
            <button type="button" className="perfil-link" onClick={filmes}>
              <Icone nome="quadro" tam={16} /> Filmes <small>as prévias de filmes</small>
            </button>
          )}
          <EscolhaDeTema />
          {meuEmail && (
            <EscolhaDeCor
              email={meuEmail}
              cor={minhaCor}
              mudar={(c) => {
                setMinhaCor(c);
                aoMudarCor?.();
                avisarCursorMudou();
                void escolherMinhaCor(meuEmail, c).catch(() => {});
              }}
            />
          )}
          <EscolhaDeCursor email={meuEmail} cor={minhaCor} />
        </div>
      )}
    </div>
  );
}

/* ---------- ficha da fila ---------- */


/** "#7 artes". Só a ficha que pede revisão ganha o círculo à caneta; na ficha nova, ele é desenhado por último. */
function Contagem({ n, traco, desenhar, circular }: { n: number; traco: number; desenhar: boolean; circular: boolean }) {
  return (
    <span className={`contagem ${desenhar ? 'desenhar' : ''}`}>
      #{n} <em>{n === 1 ? 'arte' : 'artes'}</em>
      {circular && <svg viewBox="0 0 64 44" preserveAspectRatio="none" aria-hidden="true"><path pathLength={1} d={RABISCOS[traco % RABISCOS.length]} /></svg>}
    </span>
  );
}

/** A claquete aparece como se fosse digitada; quando termina, o resto da ficha surge. */
function useDigitacao(texto: string, ligar: boolean): [string, boolean] {
  const [n, setN] = useState(ligar ? 0 : texto.length);
  useEffect(() => {
    if (!ligar) return setN(texto.length);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setN(texto.length);
    setN(0);
    const passo = Math.max(14, Math.min(42, 900 / Math.max(1, texto.length)));
    const t = setInterval(() => setN((v) => (v >= texto.length ? (clearInterval(t), v) : v + 1)), passo);
    return () => clearInterval(t);
  }, [texto, ligar]);
  return [texto.slice(0, n), n >= texto.length];
}

/** O envio ao Trello na ficha: só quando está indo ou deu erro, como uma pendência (com o botão para tentar de novo).
    Antes de ir não há aviso (o caminho é a revisão); depois de ir, a ficha vira card e a marca leva até ele. */
function AvisoTrello({ r, mandar }: { r: Resumo; mandar?: () => Promise<void> }) {
  const e = r.trello;
  if (e?.estado === 'enviando')
    return (
      <span className="pendencia trello-indo">
        <Icone nome="quadro" tam={12} /> Mandando para o Trello…
      </span>
    );
  if (e?.estado === 'erro')
    return (
      <span className="pendencia erro" title={e.erro || undefined}>
        Não foi para o Trello
        {mandar && (
          <button type="button" className="tentar-trello" onClick={() => void mandar()}>
            Tentar de novo
          </button>
        )}
      </span>
    );
  return null;
}

/** Versão nova de um roteiro que já está na fila. No computador, o Revisar abre a comparação com a anterior e a
 *  decisão fica lá; no celular, que não comporta os dois lado a lado, o aviso da ficha traz os dois botões. */
interface VersaoNova {
  anterior: Resumo;
  comparar: () => void;
  substituir: () => void;
  manter: () => void;
}

/** A claquete já está na produção da arte: antes de revisar, comparar com o que está lá e decidir. */
interface JaNaProducao {
  comparar: () => void;
}

/** Qual dos riscos à mão vai sob a claquete: sempre o mesmo para o mesmo roteiro. */
const tracoDe = (id: string) => [...id].reduce((h, c) => h + c.charCodeAt(0), 0);

/** O palpite do redator na ficha: aceitar (um toque no nome, ou o Escolher) e recusar (o ×). */
interface RedatorNaFicha {
  mudar: (parte: Partial<Meta>) => void;
}

function Ficha({ r, nova, ordem, prioridade, abrir, acoes, agora, eu, versao, producao, mandar, cadastrarAtracao, avisar, ligou, redator }: { r: Resumo; nova: boolean; ordem: number; prioridade?: boolean; abrir: () => void; acoes: React.ReactNode; agora: { nome: string; email: string }[]; eu?: string; versao?: VersaoNova; producao?: JaNaProducao; mandar?: () => Promise<void>; cadastrarAtracao?: (nova?: AtracaoNova) => void; avisar?: (t: string) => void; ligou?: () => void; redator?: RedatorNaFicha }) {
  const [ligando, setLigando] = useState(false);
  const claquete = r.meta.claquete || r.meta.titulo || r.meta.programa || 'Sem claquete';
  const [digitado, terminou] = useDigitacao(claquete, nova);
  // o que já está no Trello não vira ficha: vai para a seção No Trello
  const revisarAgora = r.meta.revisar ?? [];
  // aceito o palpite do redator, a etiqueta "Sem redator" recolhe no lugar antes de sair
  const semRedator = revisarAgora.includes(TEXTO_SEM_REDATOR);
  const lugarDoRedator = useRef(0);
  if (semRedator) lugarDoRedator.current = revisarAgora.indexOf(TEXTO_SEM_REDATOR);
  const redatorSaindo = useSaida(semRedator, 1000);
  const revisar = redatorSaindo ? [...revisarAgora.slice(0, lugarDoRedator.current), TEXTO_SEM_REDATOR, ...revisarAgora.slice(lugarDoRedator.current)] : revisarAgora;
  const palpite = redator ? estadoDoRedator(r.meta) : null;
  // a pergunta da v2 e a da versão nova também pedem atenção
  const np = producao ? r.meta.naProducao : undefined;
  const alerta = revisar.length > 0 || !!np || !!versao;
  // o que o Revisar (e a claquete) abre: a comparação com a versão anterior ou com a produção, ou a revisão
  const entrar = () => (versao && !ehCelular() ? versao.comparar() : np && producao ? producao.comparar() : abrir());
  const semEditor = !r.meta.editor;
  // alguém com o roteiro aberto: a orelha dobra, a claquete é selecionada e o nome é anotado à mão.
  // Depois que a pessoa sai, ficam a orelha pequena, um grifo e a rubrica.
  const ocupada = agora.length > 0;
  const revisada = !ocupada && !!r.revisadoPor;
  const quem = ocupada ? agora[0] : r.revisadoPor;
  // a folha de quem está revisando cobre só as linhas de cima (sem a do Trello): a principal, a versão, a produção e as pendências
  const avisoTrello = r.trello?.estado === 'enviando' || r.trello?.estado === 'erro';
  const comPendencias = revisar.length > 0 || (!r.meta.programa && !!cadastrarAtracao) || avisoTrello;
  const linhasDaFolha = 1 + (versao ? 1 : 0) + (np && producao && !versao ? 1 : 0) + (comPendencias ? 1 : 0);
  return (
    <div
      className={`ficha ${alerta ? 'revisar' : 'pronta'} ${nova ? 'nova' : ''} ${terminou ? 'montada' : 'digitando'} ${ocupada ? 'ocupada' : ''} ${revisada ? 'revisada' : ''}`}
      data-ancora={`ficha:${r.id}`}
      style={quem ? ({ '--cor': corDe(quem.email), '--fim-folha': linhasDaFolha + 1 } as React.CSSProperties) : undefined}
    >
      {(ocupada || revisada) && (
        <span className="orelha" aria-hidden="true">
          <i>{ocupada ? primeiro(agora[0].nome)[0] : ''}</i>
        </span>
      )}
      <span className={`ficha-marca ${alerta ? 'revisar' : 'ok'}`} aria-hidden="true">
        {alerta ? <Icone nome="atencao" tam={12} traco={3} /> : <Icone nome="certo" tam={12} traco={3} />}
      </span>
      <button className="ficha-claquete" onClick={entrar} aria-label={`Abrir ${claquete}`}>
        <b>
          <span className="claquete-alvo">
            {prioridade && terminou ? <Riscado traco={tracoDe(r.id)}><span className="claquete-texto"><TextoDaClaquete texto={digitado} /></span></Riscado> : <span className="claquete-texto"><TextoDaClaquete texto={digitado} /></span>}
            {ocupada && <svg className="ibeam" viewBox="0 0 12 28" aria-hidden="true"><path d="M2 2 Q6 2 6 6 V22 Q6 26 2 26 M10 2 Q6 2 6 6 M10 26 Q6 26 6 22 M3.5 14 H8.5" /></svg>}
          </span>
          {nova && !terminou && <i className="cursor" />}
          {prioridade && terminou && <span className="prio-nota" title="Na lista de prioridade: vai para o Trello com prioridade ALTA">prioridade</span>}
          {ocupada ? (
            <span className="rubrica agora" title={`${agora.map((p) => p.nome).join(', ')} com o roteiro aberto agora`}>
              {nomes(agora)} {agora.length === 1 ? 'tá vendo' : 'tão vendo'}
            </span>
          ) : (
            r.revisadoPor && (
              <span className="rubrica some" title={`Revisado por ${r.revisadoPor.nome}`}>
                rev. {r.revisadoPor.email === eu ? 'você' : primeiro(r.revisadoPor.nome)} ✓
              </span>
            )
          )}
        </b>
        <span className="some">
          {r.meta.programa || 'atração não reconhecida'}
          {r.meta.praca && <span className="ficha-praca">{r.meta.praca}</span>}
          {r.meta.dataExibicao ? ` · ${dataCurtaComDia(r.meta.dataExibicao)}` : ' · sem data'}
        </span>
      </button>
      <span className="ficha-gente some">
        {palpite && redator ? (
          <span className="redator-palpite">
            <small className="rotulo-gente">redator:</small>{' '}
            <EscolhaDeNome
              rotulo="Redator"
              valor={r.meta.redator}
              opcoes={redatoresConhecidos}
              mudar={(nome) => redator.mudar({ redator: nome })}
              semente={r.id + 'r'}
              soLeitura
              palpite={{ ...palpite, sugeridos: sugeridosDoMenu(r.meta), recusar: () => redator.mudar(recusarPalpite(r.meta)) }}
            />
          </span>
        ) : r.meta.redator ? (
          <span><small className="rotulo-gente">redator:</small> {r.meta.redator}</span>
        ) : (
          <span className="falta">redator: <Duvida semente={r.id + 'r'} rotulo="sem redator" /></span>
        )}
        <small className={semEditor ? 'falta' : ''}>
          editor: {!semEditor ? r.meta.editor : <Duvida semente={r.id + 'e'} rotulo="o editor não está na pauta" />}
        </small>
      </span>
      <span className="ficha-artes some">
        <Contagem n={r.nArtes} traco={ordem} desenhar={nova && terminou} circular={revisar.length > 0} />
      </span>
      <span className="ficha-acoes some">
        {acoes}
        {versao ? (
          <button className="botao primario" onClick={entrar} title="Comparar com a versão anterior e decidir antes de revisar">Revisar</button>
        ) : np && producao ? (
          <button className="botao primario" onClick={producao.comparar} title="Comparar com o que já está no Trello e decidir antes de revisar">Comparar</button>
        ) : (
          <button className={`botao ${alerta ? 'primario' : ''}`} onClick={abrir}>{alerta ? 'Revisar' : 'Abrir'}</button>
        )}
      </span>
      {versao && (
        <span className="ficha-versao some">
          <span>
            <Icone nome="duplicar" tam={14} /> Versão nova de <b>{versao.anterior.meta.claquete || 'um roteiro'}</b>, que já está na fila.
          </span>
          {/* só no celular: no computador, a decisão fica na comparação */}
          <button className="botao-texto so-celular" onClick={versao.manter}>Manter as duas</button>
          <button className="botao primario so-celular" onClick={versao.substituir}>Substituir a anterior</button>
        </span>
      )}
      {np && producao && !versao && (
        <span className="ficha-producao some">
          <span className="rotulo-gente">já no Trello</span>
          <a className="card-existente" href={np.url} target="_blank" rel="noreferrer" title={np.status.length ? np.status.map(nomeDaEtiqueta).join(', ') : undefined}>
            <Icone nome="quadro" tam={14} traco={2.2} />
            <b>{np.claquete}</b>
            {np.entrada && <small>{dataCurtaComDia(new Date(np.entrada).toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' }))}</small>}
          </a>
        </span>
      )}
      {comPendencias && (
        <span className="ficha-pendencias some">
          <AvisoTrello r={r} mandar={mandar} />
          {revisar.map((m) => (
            <span key={m} className={`pendencia ${m === TEXTO_SEM_REDATOR ? `de-redator ${redatorSaindo ? 'saindo' : ''}` : ''}`} aria-hidden={(m === TEXTO_SEM_REDATOR && redatorSaindo) || undefined}>
              {m}
            </span>
          ))}
          {ehDoTour(r.id) && <span className="nota-exemplo">exemplo do tour</span>}
          {!r.meta.programa && cadastrarAtracao && (
            <span className="ancora-balao">
              <button type="button" className="atalho-cadastro" aria-expanded={ligando} onClick={() => (avisar ? setLigando((x) => !x) : cadastrarAtracao())}>
                <Icone nome="mais" tam={12} traco={2.4} /> cadastrar a atração
              </button>
              {ligando && avisar && r.meta.claquete && (
                <BalaoLigar
                  claquete={r.meta.claquete}
                  avisar={avisar}
                  fechar={() => setLigando(false)}
                  nova={(n) => (setLigando(false), cadastrarAtracao(n))}
                  ligado={() => (setLigando(false), ligou?.())}
                />
              )}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/* ---------- No Trello: a semana de agenda ---------- */

const ETAPA_NO_CARD: Record<NonNullable<EtapaDoCard>, string> = { produzindo: 'produzindo', aprovacao: 'em aprovação', entregue: 'entregue', caiu: 'caiu' };

/** Uma pessoa no card aberto: o rótulo discreto e o nome lado a lado, numa linha só; o nome longo termina em
    reticências e vai inteiro na dica. Sem nome, fica a falta ("sem editor"). */
function PessoaNoCard({ rotulo, nome, falta }: { rotulo: string; nome: string; falta?: string }) {
  return (
    <div className="card-semana-pessoa">
      <dt>{rotulo}</dt>
      <dd title={nome || undefined}>{nome || <small>{falta}</small>}</dd>
    </div>
  );
}

/** A outra data no pé do card (peDoCard): "entrou ter 24", "21h59 · ao ar dom 29", "22h09 · ao ar ter 1 depois do ar". */
function OutraData({ pe }: { pe: PeDoCard }) {
  // cada pedaço traz o "·" antes dele; o do começo de cada linha fica escondido (estilos.css), e a linha que quebra
  // não termina nem começa num separador
  return (
    <span className="card-outra">
      <span className="card-outra-dentro">
        {pe.hora && <span className="pd hr">{pe.hora}</span>}
        <span className="pd">
          {pe.rotulo}
          {pe.dia && <> <b>{pe.dia}</b></>}
        </span>
        {pe.depoisDoAr && <span className="mao">depois do ar</span>}
      </span>
    </span>
  );
}

/** O card da semana (formato A). Fechado: a claquete em cima; embaixo, discretas, a praça e as artes à mão; à direita,
    a etapa (se não couber, ela desce); no pé, a outra data do critério (OutraData). Por entrega, o card que ainda não
    saiu fica tracejado, como um prazo. Um clique abre (com animação de altura) a ficha do card: uma pessoa por linha
    (redator, editor, designer), a rubrica de quem revisou e os atalhos para o roteiro e para o card no Trello. A etapa
    não se repete na ficha. */
function CardNoTrello({ c, pe, aberto, alternar, abrir, tirar }: { c: CardDaSemana; pe: PeDoCard | null; aberto: boolean; alternar: () => void; abrir: () => void; tirar?: () => void }) {
  const { r, etapa, andamento } = c;
  const claquete = r.meta.claquete || r.meta.titulo || 'Sem claquete';
  const idMais = `card-mais-${r.id}`;
  // o card simulado do roteiro de exemplo, no fim do tour: não é um card do Trello
  const doTour = ehDoTour(r.id);
  return (
    <div className={`card-semana ${etapa === 'caiu' ? 'caiu' : ''} ${aberto ? 'aberto' : ''} ${doTour ? 'exemplo' : ''} ${c.aEntregar ? 'a-entregar' : ''}`} data-card={r.id}>
      <button type="button" className="card-semana-abrir" onClick={alternar} aria-expanded={aberto} aria-controls={idMais}>
        <span className="card-semana-claquete">{c.prioridade ? <Riscado traco={tracoDe(r.id)}><TextoDaClaquete texto={claquete} quebras /></Riscado> : <TextoDaClaquete texto={claquete} quebras />}</span>
        <span className="card-semana-linha">
          <span className="card-quem">
            {r.meta.praca && <><span>{r.meta.praca}</span><span className="sep" aria-hidden="true">·</span></>}
            <span className="card-semana-artes">{plural(r.nArtes, 'arte', 'artes')}</span>
          </span>
          {etapa && (
            <span key={etapa} className={`card-semana-etapa ${etapa}`}>
              {etapa === 'entregue' ? <Icone nome="certo" tam={11} traco={3} /> : etapa !== 'caiu' && <i aria-hidden="true" />}
              <span className="etapa-nome">{ETAPA_NO_CARD[etapa]}</span>
            </span>
          )}
        </span>
        {pe && <OutraData pe={pe} />}
        {doTour && <span className="nota-exemplo">só de exemplo</span>}
        {/* na semana encolhida, a etapa vira só o pontinho à direita da claquete */}
        {etapa && etapa !== 'caiu' && <i key={etapa} className={`card-semana-sinal ${etapa}`} aria-hidden="true" />}
      </button>
      <div className="card-semana-mais" id={idMais} inert={!aberto || undefined}>
        <div>
          <div className="card-semana-mais-dentro">
            <dl className="card-semana-dados">
              <PessoaNoCard rotulo="redator" nome={r.meta.redator} falta="sem redator" />
              <PessoaNoCard rotulo="editor" nome={r.meta.editor} falta="sem editor" />
              {!!andamento?.designers.length && <PessoaNoCard rotulo="designer" nome={andamento.designers.join(', ')} />}
            </dl>
            <div className="card-semana-pe">
              {r.revisadoPor && (
                <span className="card-semana-rubrica" title={`Revisado por ${r.revisadoPor.nome}`}>
                  <small>rev.</small> {rubrica(r.revisadoPor.nome)}
                </span>
              )}
              <span className="card-semana-links">
                <button type="button" onClick={abrir} title="Abrir o roteiro" aria-label={`Abrir o roteiro ${claquete}`}>
                  <Icone nome="arquivo" tam={15} traco={1.9} />
                </button>
                {r.trello?.url && (
                  <a href={r.trello.url} target="_blank" rel="noreferrer" title="Abrir o card no Trello" aria-label={`Abrir ${claquete} no Trello`}>
                    <Icone nome="quadro" tam={15} traco={1.9} />
                  </a>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
      {tirar && (
        <button type="button" className="card-lixo" title="Tirar da fila (o card no Trello continua lá)" aria-label={`Tirar ${claquete} da fila`} onClick={tirar}>
          <Icone nome="fechar" tam={11} traco={2.4} />
        </button>
      )}
    </div>
  );
}

const CHAVE_SEMANA = 'promeiro:semana';
const CHAVE_CRITERIO = 'promeiro:criterio';
/** De quanto em quanto tempo a etapa dos cards é lida de novo, com a aba à vista. */
const LER_ANDAMENTO_MS = 60_000;

/** Os roteiros já enviados: uma seção só, abaixo da revisão, com a semana de agenda a partir de ontem. Com roteiros
    para revisar na fila, a semana encolhe; "ver a semana inteira" volta ao tamanho normal (a escolha fica no navegador).
    No celular (até 600px), a semana vira a faixa de dias arrastada com o dedo, dois dias à vista, abrindo em hoje. */
function NoTrello({ lista, fila, andamento, abrir, tirar }: { lista: Resumo[]; fila: Resumo[]; andamento: Record<string, Andamento>; abrir: (id: string) => void; tirar: (r: Resumo) => void }) {
  const [inteira, setInteira] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_SEMANA) === 'inteira';
    } catch {
      return false;
    }
  });
  const alternarInteira = () => {
    const nova = !inteira;
    setInteira(nova);
    try {
      localStorage.setItem(CHAVE_SEMANA, nova ? 'inteira' : 'encolhida');
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  };
  // o critério da agenda (exibição, entrada ou entrega): a escolha fica no navegador, como a semana inteira
  const [criterio, setCriterio] = useState<CriterioDaAgenda>(() => {
    try {
      const c = localStorage.getItem(CHAVE_CRITERIO);
      return CRITERIOS.includes(c as CriterioDaAgenda) ? (c as CriterioDaAgenda) : 'exibicao';
    } catch {
      return 'exibicao';
    }
  });
  const mudarCriterio = (c: CriterioDaAgenda) => {
    if (c === criterio) return;
    setCriterio(c);
    try {
      localStorage.setItem(CHAVE_CRITERIO, c);
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  };
  const haRevisao = semanaEncolhida(fila, false);
  const encolhida = semanaEncolhida(fila, inteira);
  const [deslocamento, setDeslocamento] = useState(0);
  const [verAnteriores, setVerAnteriores] = useState(false);
  // só um card aberto por vez; Esc fecha (e devolve o foco ao card, se ele estava lá dentro)
  const [aberto, setAberto] = useState<string | null>(null);
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const li = document.querySelector<HTMLElement>(`.secao-trello [data-card="${CSS.escape(aberto)}"]`);
      if (li?.contains(document.activeElement)) li.querySelector<HTMLElement>('.card-semana-abrir')?.focus();
      setAberto(null);
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aberto]);
  // no celular, a faixa de dias; no computador, a semana das setas
  const celular = useTelaDeCelular();
  // no computador, a semana na tela chega à que as setas pediram depois que a anterior sai (useTrocaDeSemana)
  const grade = useRef<HTMLDivElement>(null);
  const troca = useTrocaDeSemana(grade, deslocamento, '.coluna-corpo > *, .coluna-topo .dia-num svg, .coluna-topo .dia-rel', '.coluna-corpo > *', !celular);
  const agora = new Date();
  const s = montarSemana(lista, andamento, agora, troca.mostrada, criterio);
  // os números dos dias e o período contam juntos, pelas datas, até a semana na tela (também quando o critério muda o
  // começo da semana: por entrada, ela termina hoje)
  const eixo = eixoDaSemana(agora);
  const inicio = inicioDaSemana(troca.mostrada, criterio);
  const contagem = useContagemDoPeriodo(eixo, inicio);
  const contando = contagem.p < 1;
  const inicioNaContagem = posicaoNaContagem(eixo, contagem.de, contagem.para, contagem.p);
  const f = celular ? montarFaixa(lista, andamento, agora, criterio) : null;
  const agenda = f ?? s;
  const trilho = useRef<HTMLDivElement>(null);
  // a faixa abre onde o critério da hora em que ela aparece manda (por entrada, em ontem e hoje); trocar de critério não
  // a leva para outro lugar (os cards é que voam)
  const abertura = useRef<{ iso: string; k: number } | null>(null);
  if (!f) abertura.current = null;
  else if (abertura.current?.iso !== f.dias[0].iso) abertura.current = { iso: f.dias[0].iso, k: f.abre };
  const faixa = useFaixa(trilho, f?.dias.length ?? 0, abertura.current?.k ?? 0, f?.dias[0].iso ?? '');
  // no computador estreito (a semana rola de lado), hoje fica à vista: com ontem antes dele; por entrada, no fim
  const rolarAteHoje = () => {
    const el = grade.current;
    if (celular || !el) return;
    if (el.scrollWidth <= el.clientWidth + 1) return;
    const cols = [...el.children] as HTMLElement[];
    const i = s.dias.findIndex((d) => d.marca === 'hoje');
    if (troca.mostrada !== 0 || i < 0 || cols.length < 2) {
      el.scrollLeft = 0;
      return;
    }
    el.scrollLeft = criterio === 'entrada' ? el.scrollWidth : Math.max(0, (i - 1) * (cols[1].offsetLeft - cols[0].offsetLeft));
  };
  const rolar = useRef(rolarAteHoje);
  rolar.current = rolarAteHoje;
  useLayoutEffect(() => rolar.current(), [celular, criterio, troca.mostrada]);
  useEffect(() => {
    if (celular) return;
    let largura = grade.current?.clientWidth;
    const ver = new ResizeObserver(() => {
      const nova = grade.current?.clientWidth;
      if (nova !== largura) rolar.current();
      largura = nova;
    });
    if (grade.current) ver.observe(grade.current);
    return () => ver.disconnect();
  }, [celular]);
  // ao vivo: o que sai fecha a vaga, o que entra abre a sua, e o que troca de coluna (o sem data que ganhou data)
  // desliza até o lugar novo. Outra semana (as setas, a virada do dia) ou a semana encolhendo não abrem vagas: no
  // computador, a troca de semana tem o movimento dela (useTrocaDeSemana).
  const secao = useRef<HTMLElement>(null);
  const camadaDoVoo = useRef<HTMLDivElement>(null);
  // a troca de critério: os cards voam da coluna antiga para a nova (useTrocaDeCriterio); nela, nenhuma vaga abre ou
  // fecha e o deslize ao vivo não entra
  const trocandoCriterio = useTrocaDeCriterio(secao, camadaDoVoo, criterio, f ? 0 : inicio);
  const vista = useRef<{ agenda: typeof agenda; encolhida: boolean; criterio: CriterioDaAgenda } | null>(null);
  const antes = vista.current;
  const mesmaVista = !!antes && antes.agenda.dias.length === agenda.dias.length && antes.agenda.dias[0].iso === agenda.dias[0].iso && antes.encolhida === encolhida && antes.criterio === criterio;
  const todos = (a: typeof agenda) => [...a.dias.flatMap((d) => d.cards), ...a.semData, ...a.anteriores.flatMap((d) => d.cards)].map((c) => c.r.id);
  const deslizam = new Set(trocandoCriterio ? [...todos(agenda), ...(antes ? todos(antes.agenda) : [])] : mesmaVista ? mudancasDaSemana(antes.agenda, agenda).moveram.map((m) => m.id) : []);
  const disposicao = [...agenda.dias.map((d) => d.cards), agenda.semData].map((cs) => cs.map((c) => c.r.id).join(',')).join('|');
  useDeslize(secao, '.semana [data-card], .sem-data [data-card]', disposicao, mesmaVista);
  useLayoutEffect(() => {
    vista.current = { agenda, encolhida, criterio };
  });
  const card = (c: CardDaSemana) => (
    <CardNoTrello
      c={c}
      pe={peDoCard(c, criterio, agora)}
      aberto={aberto === c.r.id}
      alternar={() => setAberto((a) => (a === c.r.id ? null : c.r.id))}
      abrir={() => abrir(c.r.id)}
      tirar={() => tirar(c.r)}
    />
  );
  const abas = <AbasDoCriterio criterio={criterio} mudar={mudarCriterio} />;
  const avulsa = (titulo: string, cards: CardDaSemana[], chave: string) => (
    <section key={chave} className={`semana-avulsa ${chave === 'sem-data' ? 'sem-data' : ''}`} aria-label={titulo}>
      <h3>{titulo}</h3>
      <ul data-grade="">
        <Vagas como="li" itens={cards} chave={(c) => c.r.id} deslizam={deslizam}>{card}</Vagas>
      </ul>
    </section>
  );
  const verInteira = haRevisao && (
    <button type="button" className="botao-texto" onClick={alternarInteira}>
      {inteira ? 'recolher a semana' : 'ver a semana inteira'}
    </button>
  );
  const verDiasAnteriores = agenda.anteriores.length > 0 && (
    <button type="button" className="botao-texto" aria-expanded={verAnteriores} onClick={() => setVerAnteriores((v) => !v)}>
      dias anteriores
    </button>
  );
  const titulo = (
    <h2>
      <Icone nome="quadro" tam={22} traco={1.7} />
      No Trello
    </h2>
  );
  // no celular: o título e o seletor de dois dias na primeira linha; o resumo dos dias à vista e o "voltar para hoje"
  // (com o lugar guardado) na segunda. Tudo isso só muda quando a rolagem termina, e então conta até os valores novos.
  const topoDoCelular = (f: FaixaDeDias) => {
    const [k] = faixa.vista;
    const resumo = resumoDosDias(f.dias.slice(k, k + 2));
    return (
      <div className="secao-trello-topo">
        {titulo}
        <span className="semana-nav">
          <button type="button" className="botao-icone" aria-label="Dia anterior" title="Dia anterior" disabled={k <= 0} onClick={() => faixa.andar(-1)}>
              <Icone nome="voltar" tam={16} traco={2.2} />
          </button>
          <PeriodoQueConta isos={f.dias.map((d) => d.iso)} k={k} />
          <button type="button" className="botao-icone" aria-label="Próximo dia" title="Próximo dia" disabled={k >= f.dias.length - 2} onClick={() => faixa.andar(1)}>
            <Icone nome="direita" tam={16} traco={2.2} />
          </button>
        </span>
        <span className="linha-criterio">{abas}</span>
        <span className="secao-trello-conta">
          <ResumoQueConta {...resumo} criterio={criterio} />
          <VoltarParaHoje ver={k !== f.abre && k !== f.hoje} sentido={faixa.sentido} voltar={() => faixa.ir(f.abre)} />
        </span>
      </div>
    );
  };
  // no computador: a mesma contagem do celular, para a semana inteira; o "voltar para hoje" abre a vaga entre os links
  const topoDoComputador = (
    <div className="secao-trello-topo">
      {titulo}
      <span className="linha-criterio">
        {abas}
        <span className="secao-trello-conta">
          <ResumoQueConta total={s.total} entregues={s.entregues} aEntregar={s.aEntregar} comPrioridade={s.comPrioridade} criterio={criterio} />
        </span>
      </span>
      <span className="semana-nav">
        {verInteira}
        <VoltarParaHoje ver={troca.mostrada !== 0} sentido={troca.sentido} voltar={() => setDeslocamento(0)} abreVaga />
        {verDiasAnteriores}
        {/* as setas e o período andam juntos: na agenda estreita, a linha quebra entre os links, nunca entre eles */}
        <span className="semana-setas">
          <button type="button" className="botao-icone" aria-label="Semana anterior" title="Semana anterior" onClick={() => setDeslocamento((n) => n - 1)}>
            <Icone nome="voltar" tam={16} traco={2.2} />
          </button>
          <Periodo {...periodoNaContagem(eixo, contagem.de, contagem.para, contagem.p)} largura="suave" />
          <button type="button" className="botao-icone" aria-label="Próxima semana" title="Próxima semana" onClick={() => setDeslocamento((n) => n + 1)}>
            <Icone nome="direita" tam={16} traco={2.2} />
          </button>
        </span>
      </span>
    </div>
  );
  return (
    <section ref={secao} className={`secao-trello ${encolhida ? 'encolhida' : ''} por-${criterio}`} aria-label="No Trello">
      {f ? topoDoCelular(f) : topoDoComputador}
      {/* no celular, cada dia é uma coluna da faixa; no computador, as sete colunas ficam no lugar quando a semana troca:
          os números contam e as marcas do dia (o hoje circulado) se escrevem quando a contagem termina */}
      <div className="semana" ref={f ? trilho : grade}>
        {agenda.dias.map((d, i) => {
          const hoje = d.marca === 'hoje' && (!!f || !contando);
          return (
            <section key={f ? d.iso : i} className={`coluna ${hoje ? 'hoje' : ''} ${d.fimDeSemana ? 'fim-de-semana' : ''}`} aria-label={`${d.diaDaSemana} ${d.numero}${d.marca ? `, ${d.marca}` : ''}`}>
              {f ? <TopoDoDia d={d} /> : <TopoDoDia d={d} numero={Number(eixo.dia(inicioNaContagem + i).slice(8))} marcas={!contando} escrever />}
              <ul className="coluna-corpo">
                <Vagas key={d.iso} como="li" itens={d.cards} chave={(c) => c.r.id} deslizam={deslizam}>{card}</Vagas>
                {!d.cards.length && <li className="nada entra-suave">nada ainda</li>}
              </ul>
            </section>
          );
        })}
      </div>
      {/* a faixa do sem data também fecha a vaga quando o último card dela sai (ou ganha data, ou o critério muda) */}
      <Vagas itens={agenda.semData.length ? ['sem-data'] : []} chave={(k) => k}>{() => avulsa('sem data', agenda.semData, 'sem-data')}</Vagas>
      {/* no celular, o "ver a semana inteira" e os "dias anteriores" ficam no pé da agenda */}
      {f && (verInteira || verDiasAnteriores) && (
        <div className="pe-agenda">
          {verInteira}
          {verDiasAnteriores}
        </div>
      )}
      {/* no computador, os dias anteriores abrem e fecham a vaga, como o "sem data" */}
      {f ? verAnteriores && agenda.anteriores.map((d) => avulsa(d.titulo, d.cards, d.iso)) : <Vagas itens={verAnteriores ? agenda.anteriores : []} chave={(d) => d.iso}>{(d) => avulsa(d.titulo, d.cards, d.iso)}</Vagas>}
      {/* os fantasmas dos cards que saem da agenda à vista na troca de critério */}
      <div className="camada-voo" ref={camadaDoVoo} aria-hidden="true" />
    </section>
  );
}

/** A tecla foi num campo de texto ou num diálogo: os atalhos da fila não valem ali. */
const emCampo = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]');

/** A busca da fila recolhida numa lupa na barra do topo: "/" ou um clique abrem o campo; Esc limpa e recolhe; sem texto, perder o foco recolhe. */
function BuscaNaLupa({ valor, mudar, ativa }: { valor: string; mudar: (v: string) => void; ativa: boolean }) {
  const campo = useRef<HTMLInputElement>(null);
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    if (!ativa) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || emCampo(e)) return;
      e.preventDefault();
      campo.current?.focus();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ativa]);
  return (
    <label className={`busca lupa ${aberta || valor ? 'aberta' : ''}`} title="Buscar (/)">
      <Icone nome="lupa" tam={15} traco={2} />
      <input
        ref={campo}
        type="search"
        placeholder="Buscar claquete, atração ou redator"
        aria-label="Buscar roteiros"
        aria-keyshortcuts="/"
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        onFocus={() => setAberta(true)}
        onBlur={() => setAberta(false)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          mudar('');
          e.currentTarget.blur();
        }}
      />
    </label>
  );
}

/** As frases do convite ao lado do título: as de hoje, menos a que repetiria o título "Fila em dia". */
const CONVITES_AO_LADO = CONVITES.filter((f) => f !== 'Fila em dia!');

export function Biblioteca({ abrir, aoFundo = false, comparar, abrirArquivo, receberArquivos, criar, avisar, identidade, definirPerfil, novos, falhas, tirarFalha, chegou, lendo, cadastros, filmes, buscaInicial = '' }: Props) {
  const [roteiros, setRoteiros] = useState<Resumo[] | null>(null);
  const [busca, setBusca] = useState(buscaInicial);
  // tirar da fila: some na hora, mas só é apagado depois de alguns segundos, para dar tempo de desfazer
  const [saindo, setSaindo] = useState<Resumo | null>(null);
  const prazoSaida = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [filtroEstado, setFiltroEstado] = useState<'prontos' | 'revisar' | null>(null);
  const [colando, setColando] = useState(false);
  const [claqueteNova, setClaqueteNova] = useState('');

  const carregar = () => armazenamento.listar().then(setRoteiros, () => setRoteiros([]));
  // o andamento na produção da arte (a etapa dos cards): junto com a fila, a cada minuto só com a aba à vista, e de
  // novo quando a aba volta à vista ou ganha o foco (o servidor guarda por 30 s)
  const [andamento, setAndamento] = useState<Record<string, Andamento>>({});
  // vem também para a fila de revisão: quais roteiros estão na lista de prioridade
  const temRoteiros = !!roteiros?.length;
  useEffect(() => {
    if (!temRoteiros) return;
    const ler = () => {
      if (document.visibilityState === 'visible') void armazenamento.andamento().then(setAndamento);
    };
    ler();
    const t = setInterval(ler, LER_ANDAMENTO_MS);
    document.addEventListener('visibilitychange', ler);
    window.addEventListener('focus', ler);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', ler);
      window.removeEventListener('focus', ler);
    };
  }, [temRoteiros, roteiros]);
  useEffect(() => {
    void carregar();
  }, [chegou]);

  // fila ao vivo: o que os colegas sobem aparece aqui na hora, com a mesma animação
  const [deOutros, setDeOutros] = useState<string[]>([]);
  const [colegas, setColegas] = useState<{ nome: string; email: string }[]>([]);
  const [noRoteiro, setNoRoteiro] = useState<Record<string, { nome: string; email: string }[]>>({});
  // R: abre o próximo roteiro que pede revisão, que ninguém revisou e que ninguém está vendo (o primeiro da fila, na
  // ordem da tela: proximoParaRevisar)
  const proximoParaRevisar = useRef<string | null>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'r' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (emCampo(e)) return;
      if (!proximoParaRevisar.current) return;
      e.preventDefault();
      abrir(proximoParaRevisar.current);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abrir]);
  // Ctrl/⌘+V fora dos campos: o mesmo que o botão "Colar do Word" (a folha começa pela claquete)
  useEffect(() => {
    if (aoFundo) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'v' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.repeat) return;
      if (emCampo(e)) return;
      setColando(true);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFundo]);
  const [ponteiros, setPonteiros] = useState<Record<string, PonteiroDeAlguem>>({});
  const [fila, setFila] = useState<Fila | null>(null);
  // muda quando alguém troca a cor de destaque: as fichas e os ponteiros se redesenham
  const [, setCores] = useState(0);
  const eu = identidade?.email;
  useEffect(() => {
    let prazo: ReturnType<typeof setTimeout> | undefined;
    const recarregar = () => {
      clearTimeout(prazo);
      prazo = setTimeout(() => void carregar(), 350);
    };
    const f = ouvirFila((e) => {
      if (e.tipo === 'cor') {
        registrarCores([{ email: e.por, cor: e.cor }]);
        return setCores((n) => n + 1);
      }
      if (e.tipo === 'ponteiro') {
        if (e.por === eu) return;
        return setPonteiros((atual) => {
          const novo = { ...atual };
          if (e.saiu || !e.ancora) delete novo[e.por];
          else novo[e.por] = { email: e.por, nome: e.nome, cor: corDe(e.por), cursor: e.cursor, p: { ancora: e.ancora, fx: e.fx ?? 0, fy: e.fy ?? 0, parado: !!e.parado } };
          return novo;
        });
      }
      if (e.tipo === 'no-roteiro') {
        setNoRoteiro((atual) => ({ ...atual, [e.id]: e.pessoas.filter((p) => p.email !== eu) }));
        // alguém saiu do roteiro: a ficha pode ter ganhado a rubrica de quem revisou
        if (!e.pessoas.length) recarregar();
        return;
      }
      if (e.tipo === 'reconectou') {
        // a conexão caiu: o que se sabia de quem estava onde pode estar velho; o servidor manda tudo de novo
        setNoRoteiro({});
        setPonteiros({}); // o servidor manda de novo onde cada um está
      }
      if (e.tipo === 'presenca') {
        return setColegas(e.pessoas.filter((p) => p.email !== eu));
      }
      if (e.tipo === 'criado' && e.por !== eu) setDeOutros((d) => [...d, e.id]);
      recarregar();
    });
    setFila(f);
    return () => {
      f.parar();
      clearTimeout(prazo);
      setFila(null);
    };
  }, [eu]); // eslint-disable-line react-hooks/exhaustive-deps
  const enviarPonteiro = useMemo(
    () => (fila ? (p: PosicaoPonteiro | null) => fila.enviar(p ? { tipo: 'ponteiro', ...p, cursor: meuCursor(eu ?? '') } : { tipo: 'ponteiro', saiu: true }) : null),
    [fila, eu],
  );
  useMeuPonteiro(enviarPonteiro);

  // o que já foi apagado sai da tela na hora, sem esperar o servidor (senão pisca de volta no fim do desfazer);
  // fica fora até o fim da sessão: uma leitura da fila que já estava a caminho ainda pode trazê-lo
  const [apagados, setApagados] = useState<ReadonlySet<string>>(() => new Set());
  const apagarDeVez = (r: Resumo) => {
    setApagados((a) => new Set(a).add(r.id));
    return armazenamento.apagar(r.id).then(
      () => void carregar(),
      () => {
        // o servidor não apagou: o roteiro volta para a fila
        setApagados((a) => {
          const sem = new Set(a);
          sem.delete(r.id);
          return sem;
        });
        avisar('Não consegui tirar esse roteiro da fila.');
        void carregar();
      },
    );
  };
  // tirar da fila: a ficha (ou o card da agenda) fecha a vaga na hora, esmaecendo junto. Antes, a ficha sumia
  // primeiro e só depois fechava a vaga: na virada ela piscava de volta por alguns quadros (#32)
  const tirar = (r: Resumo) => {
    if (saindo) {
      clearTimeout(prazoSaida.current);
      void apagarDeVez(saindo);
    }
    setSaindo(r);
    prazoSaida.current = setTimeout(() => {
      setSaindo(null);
      void apagarDeVez(r);
    }, 6000);
  };
  // quem volta com "desfazer" não repete a animação de chegada
  const [devolvidos, setDevolvidos] = useState<string[]>([]);
  const desfazer = () => {
    clearTimeout(prazoSaida.current);
    if (saindo) setDevolvidos((d) => [...d, saindo.id]);
    setSaindo(null);
  };
  // saiu da tela com um "tirar" pendente: apaga de vez
  const saindoRef = useRef(saindo);
  saindoRef.current = saindo;
  useEffect(() => {
    // recarregar ou fechar a página durante o "desfazer" também apaga (antes, o roteiro voltava)
    const aoSair = () => {
      clearTimeout(prazoSaida.current);
      if (saindoRef.current) apagarAoSair(saindoRef.current.id);
      saindoRef.current = null;
    };
    window.addEventListener('pagehide', aoSair);
    return () => {
      window.removeEventListener('pagehide', aoSair);
      aoSair();
    };
  }, []);

  /** Cria o card no Trello. A ficha mostra "mandando" na hora; o resultado chega pela fila ao vivo. */
  const mandar = async (r: Resumo | Roteiro) => {
    setRoteiros((l) => l?.map((x) => (x.id === r.id ? { ...x, trello: { estado: 'enviando', em: new Date().toISOString() } } : x)) ?? l);
    try {
      const completo = 'doc' in r ? r : roteiroDa(await armazenamento.ler(r.id));
      if (!completo) throw new Error('Roteiro não encontrado.');
      const res = await mandarParaTrello(completo);
      const nome = completo.meta.claquete || 'O roteiro';
      if (res.estado === 'duplicado') avisar(`${nome} já tinha entrado hoje pelo upload antigo. Não criei outro card.`);
      else if (res.avisos?.length) avisar(`${nome} foi para o Trello, mas: ${res.avisos[0]}${res.avisos.length > 1 ? ` (e mais ${res.avisos.length - 1})` : ''}.`);
    } catch (e) {
      avisar(`Não foi para o Trello: ${e instanceof Error ? e.message : 'o servidor não respondeu'}`);
    }
    void carregar();
  };

  /** O palpite do redator na ficha: aceitar (o nome) ou recusar (o ×). A ficha muda na hora; o roteiro é gravado com
      as pendências refeitas, e o servidor leva a mudança para quem está com ele aberto (edição simultânea). */
  const mudarRedator = async (r: Resumo, parte: Partial<Meta>) => {
    const sai = parte.redator ? (m: string) => m !== TEXTO_SEM_REDATOR : () => true;
    setRoteiros((l) => l?.map((x) => (x.id === r.id ? { ...x, meta: { ...x.meta, ...parte, revisar: (x.meta.revisar ?? []).filter(sai) } } : x)) ?? l);
    try {
      const completo = roteiroDa(await armazenamento.ler(r.id));
      if (!completo) throw new Error('Roteiro não encontrado.');
      const meta = { ...completo.meta, ...parte };
      meta.revisar = pendencias(exportar({ ...completo, meta }));
      await armazenamento.salvar({ ...completo, meta });
    } catch (e) {
      avisar(`Não consegui guardar o redator: ${e instanceof Error ? e.message : 'o servidor não respondeu'}`);
    }
    void carregar();
  };

  /** Versão nova de uma claquete que já estava na fila (o aviso da ficha, no celular): fica a nova, com o trabalho da anterior. */
  const substituir = async (nova: Resumo) => {
    try {
      const feito = await versaoNova.substituir(nova.id);
      if (!feito) return;
      const { roteiro, cardHerdado } = feito;
      avisar(avisoDaSubstituicao(feito));
      // a anterior não tinha ido para o Trello: a nova vai, se não tiver pendência
      if (temTrello() && !cardHerdado && !travamTrello(roteiro.meta.revisar).length) void mandar(roteiro);
      else void carregar();
    } catch {
      avisar('Não consegui substituir a versão anterior.');
    }
  };
  const manterAsDuas = async (nova: Resumo) => {
    const rn = await versaoNova.manter(nova.id).catch(() => undefined);
    if (rn && temTrello() && !travamTrello(rn.meta.revisar).length) void mandar(rn);
    else void carregar();
  };

  const termo = semAcento(busca.trim());
  const aberto = (roteiros ?? []).some((r) => r.aberto);
  const todos = filaVisivel(roteiros, saindo?.id, apagados);
  // a conta do topo e os filtros olham só o que ainda pede trabalho: o que foi ao ar ou já está no Trello fica de fora
  const pendente = new Set(pendentes(todos).map((r) => r.id));
  const nPendentes = pendente.size;
  // a fila zerou: comemora (a regra e a memória ficam em filaZerada.ts)
  const unico = nPendentes === 1 ? todos.find((r) => pendente.has(r.id)) : undefined;
  const filaZerada = useFilaZerada(nPendentes, { pronto: roteiros !== null && !lendo, saindo, aoFundo, ultima: unico && (unico.meta.claquete || unico.meta.titulo) });
  const paraRevisar = todos.filter((r) => pendente.has(r.id) && pedeRevisao(r)).length;
  const achado = (r: Resumo) => !termo || semAcento([r.meta.claquete, r.meta.programa, r.meta.redator, r.meta.editor, r.meta.titulo].join(' ')).includes(termo);
  const visiveis = todos
    .filter(achado)
    .filter((r) => !filtroEstado || (pendente.has(r.id) && (filtroEstado === 'revisar' ? pedeRevisao(r) : !pedeRevisao(r))));
  // a fila é a revisão dos roteiros: os filmes da grade não entram (os cards deles ficam no Trello e no FilmeBOT)
  const { proximos, exibidos } = agruparPorDia(visiveis.filter((r) => !noTrello(r)));
  // os enviados vão para a seção No Trello: a busca vale para eles, os filtros de revisão não
  const enviados = todos.filter((r) => noTrello(r) && achado(r));
  proximoParaRevisar.current = proximoDaFila(visiveis, { email: eu }, noRoteiro)?.id ?? null;
  const porId = new Map(todos.map((r) => [r.id, r]));
  // durante o "desfazer" a fila já fica como vai ficar (sem trocar de tela de novo quando o prazo acaba)
  const vazio = roteiros !== null && !todos.length && !falhas.length && !lendo;
  let ordem = 0;

  const ficha = (r: Resumo) => {
    const anterior = r.meta.substitui ? porId.get(r.meta.substitui) : undefined;
    return (
      <Ficha
        key={r.id}
        r={r}
        nova={(novos.includes(r.id) || deOutros.includes(r.id)) && !devolvidos.includes(r.id)}
        agora={noRoteiro[r.id] ?? []}
        eu={eu}
        ordem={ordem++}
        prioridade={!!andamento[r.id]?.prioridade}
        abrir={() => abrir(r.id)}
        versao={anterior ? { anterior, comparar: () => comparar(r.id), substituir: () => substituir(r), manter: () => manterAsDuas(r) } : undefined}
        producao={r.meta.naProducao && (r.podeEditar || r.meu || aberto) ? { comparar: () => comparar(r.id) } : undefined}
        mandar={temTrello() && (r.podeEditar || r.meu || aberto) ? () => mandar(r) : undefined}
        cadastrarAtracao={temCadastros() && r.meta.claquete ? (nova) => cadastros({ aba: 'atracoes', claquete: r.meta.claquete, ...nova }) : undefined}
        avisar={avisar}
        ligou={() => void carregar()}
        redator={(r.podeEditar || r.meu || aberto) && !ehDoTour(r.id) ? { mudar: (parte) => void mudarRedator(r, parte) } : undefined}
        acoes={
          // o exemplo do tour só sai da fila pelo próprio tour
          (r.meu || aberto) && !ehDoTour(r.id) && (
            <button className="botao-icone ficha-lixo" title="Tirar da fila" aria-label={`Tirar ${r.meta.claquete || r.meta.titulo} da fila`} onClick={() => tirar(r)}>
              <Icone nome="lixo" />
            </button>
          )
        }
      />
    );
  };
  const cabecalhoDoDia = (g: GrupoDia) => (
    <div className="dia-topo">
      <h3>
        {g.titulo}
        <span>{g.subtitulo}</span>
      </h3>
      <span className="dia-conta">
        {g.itens.length ? plural(g.itens.length, 'roteiro', 'roteiros') : ''}
      </span>
    </div>
  );
  const filtro = (id: 'prontos' | 'revisar', conteudo: React.ReactNode) => (
    <button className="conta-filtro" aria-pressed={filtroEstado === id} onClick={() => setFiltroEstado((f) => (f === id ? null : id))} title={filtroEstado === id ? 'Mostrar todos' : 'Mostrar só estes'}>
      {conteudo}
    </button>
  );
  const colar = (
    <form
      className="colar-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!claqueteNova.trim()) return;
        criar(claqueteNova.trim());
        setColando(false);
        setClaqueteNova('');
      }}
    >
      <label>
        <span className="rotulo">Claquete do roteiro</span>
        <input autoFocus value={claqueteNova} onChange={(e) => setClaqueteNova(e.target.value)} placeholder="Quem Ama(Prologo)26/10 Rede" aria-label="Claquete do roteiro" />
      </label>
      <small className="suave">É pela claquete que vêm o editor, a praça e a data. Depois é só colar o texto do Word na folha.</small>
      <div className="colar-acoes">
        <button type="button" className="botao-texto" onClick={() => setColando(false)}>Cancelar</button>
        <button className="botao primario" disabled={!claqueteNova.trim()}>Abrir a folha</button>
      </div>
    </form>
  );

  return (
    <div className="pagina" inert={aoFundo || undefined} aria-hidden={aoFundo || undefined}>
      <header className="barra-topo">
        <h1 className="bib-marca"><Marca /></h1>
        <span className="espaco" />
        {(todos.length > 6 || !!busca) && <BuscaNaLupa valor={busca} mudar={setBusca} ativa={!aoFundo} />}
        {colegas.length > 0 && (
          <div className="na-fila" title={`Também com a fila aberta: ${colegas.map((c) => c.nome).join(', ')}`}>
            {colegas.slice(0, 5).map((c) => (
              <span key={c.email} className="presente" style={{ background: corDe(c.email) }}>{iniciais(c.nome)}</span>
            ))}
            {colegas.length > 5 && <span className="presente mais">+{colegas.length - 5}</span>}
            <span className="na-fila-texto">{colegas.length === 1 ? `${colegas[0].nome.split(/\s+/)[0]} também está aqui` : `mais ${colegas.length} aqui`}</span>
          </div>
        )}
        <Perfil identidade={identidade} definirPerfil={definirPerfil} cadastros={temCadastros() ? () => cadastros() : undefined} filmes={temFilmes() && filmes ? filmes : undefined} aoMudarCor={() => setCores((n) => n + 1)} />
      </header>
      <main className="biblioteca fila" data-ancora="pagina">
        {EXEMPLOS.length > 0 && (
          <section className="exemplos">
            <span className="rotulo">Exemplos</span>
            {EXEMPLOS.map(([nome, arquivo]) => (
              <button
                key={arquivo}
                className="opcao"
                onClick={async () => {
                  try {
                    const resposta = await fetch('./exemplos.json');
                    if (!resposta.ok) throw new Error();
                    const b64 = ((await resposta.json()) as Record<string, string>)[arquivo];
                    abrirArquivo(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], arquivo));
                  } catch {
                    avisar('Não consegui abrir o exemplo.');
                  }
                }}
              >
                {nome}
              </button>
            ))}
          </section>
        )}

        {vazio ? (
          <div className="entra-suave">
            <ConviteDeArrastar
              frases={CONVITES_FILA_VAZIA}
              escolher={colando ? undefined : receberArquivos}
              extra={colando ? colar : <button className="botao-texto" onClick={() => setColando(true)}>ou cole o texto copiado do Word</button>}
            />
          </div>
        ) : (
          roteiros && (
            <section className="lista">
              <div className="fila-topo">
                <div className="fila-titulo">
                  <h2 className="titulo-serifa">
                    {nPendentes || !lendo ? (
                      nPendentes ? <><em>{nPendentes}</em> {nPendentes === 1 ? 'roteiro na fila' : 'roteiros na fila'}</> : <TituloEmDia z={filaZerada} />
                    ) : (
                      <>Lendo <em>1</em> roteiro</>
                    )}
                  </h2>
                  <p className="fila-conta">
                    {nPendentes - paraRevisar > 0 && filtro('prontos', <><i className="ponto ok" />{plural(nPendentes - paraRevisar, 'pronto', 'prontos')}</>)}
                    {paraRevisar > 0 && filtro('revisar', <><i className="ponto revisar" />{paraRevisar} para revisar</>)}
                    {proximoParaRevisar.current && (
                      <button type="button" className="tecla-proximo" onClick={() => proximoParaRevisar.current && abrir(proximoParaRevisar.current)} title="Abre o próximo roteiro para revisar">
                        <kbd>R</kbd> revisar o próximo
                      </button>
                    )}
                    {falhas.length > 0 && <span><i className="ponto erro" />{plural(falhas.length, 'não lido', 'não lidos')}</span>}
                    {lendo && <span><i className="ponto lendo" />lendo 1</span>}
                  </p>
                </div>
                <ConviteCompacto frases={CONVITES_AO_LADO} escolher={receberArquivos} colar={() => setColando(true)} colando={colando} />
              </div>
              {colando && colar}

              {(lendo || falhas.length > 0) && (
                <ul className="fichas">
                  {lendo && (
                    <li className="ficha lendo" aria-live="polite">
                      <span className="ficha-marca lendo" aria-hidden="true" />
                      <span className="ficha-claquete">
                        <b>{lendo.nome.replace(/\.[^.]+$/, '')}</b>
                        <span>{lendo.detalhe}</span>
                      </span>
                    </li>
                  )}
                  {falhas.map((f) => (
                    <li key={f.nome} className="ficha erro montada" data-ancora={`falha:${f.nome}`}>
                      <span className="ficha-marca erro" aria-hidden="true"><Icone nome="fechar" tam={11} traco={3} /></span>
                      <span className="ficha-claquete"><b>{f.nome.replace(/\.[^.]+$/, '')}</b><span>Não consegui ler este arquivo</span></span>
                      <span className="ficha-acoes"><button className="botao" onClick={() => tirarFalha(f.nome)}>Tirar da fila</button></span>
                      <span className="ficha-pendencias"><span className="pendencia erro">{f.motivo}</span></span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="dias">
              <Vagas itens={proximos} chave={(g) => g.chave}>
                {(g) => (
                <section className="dia" aria-label={`${g.titulo}, ${g.subtitulo}`}>
                  {cabecalhoDoDia(g)}
                  <ul className="fichas">
                    <Vagas como="li" itens={g.itens} chave={(r) => r.id}>{ficha}</Vagas>
                  </ul>
                </section>
                )}
              </Vagas>
              </div>
              <CenaDaFilaZerada z={filaZerada} />

              {exibidos.length > 0 && (
                <details className="exibidos">
                  <summary>
                    Já foram ao ar <span>{plural(exibidos.reduce((n, g) => n + g.itens.length, 0), 'roteiro', 'roteiros')}</span>
                  </summary>
                  {exibidos.map((g) => (
                    <section key={g.chave} className="dia" aria-label={`${g.titulo}, ${g.subtitulo}`}>
                      {cabecalhoDoDia(g)}
                      <ul className="fichas">
                        <Vagas como="li" itens={g.itens} chave={(r) => r.id}>{ficha}</Vagas>
                      </ul>
                    </section>
                  ))}
                </details>
              )}

              {!visiveis.length && (termo || filtroEstado) && (
                <p className="suave vazio">
                  {termo ? `Nada encontrado para “${busca}”.` : filtroEstado === 'revisar' ? 'Nada para revisar.' : 'Nenhum roteiro pronto ainda.'}
                </p>
              )}
            </section>
          )
        )}
      </main>
      {!vazio && roteiros && enviados.length > 0 && <NoTrello lista={enviados} fila={todos} andamento={andamento} abrir={abrir} tirar={tirar} />}
      {saindo && (
        <div className="desfazer" role="status">
          <span><b>{saindo.meta.claquete || saindo.meta.titulo || 'Roteiro'}</b> saiu da fila.</span>
          <button className="botao-texto" onClick={desfazer}>Desfazer</button>
        </div>
      )}
      <Ponteiros lista={Object.values(ponteiros)} />
    </div>
  );
}
