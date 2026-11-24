import { useEffect, useMemo, useRef, useState } from 'react';
import type { Falha } from '../App';
import { apagarAoSair, armazenamento, escolherMinhaCor, herdarEnvio, mandarParaTrello, temCadastros, temFilmes, temTrello, type Andamento, type Resumo, type TipoCadastro } from '../dados/armazenamento';
import { corDe, iniciais, nomesCurtos as nomes, PALETA, primeiroNome as primeiro, registrarCores } from '../dados/colaboracao';
import { ouvirFila, type Fila } from '../dados/eventos';
import { exportar, pendencias, travamTrello } from '../modelo/exportar';
import { herdarTipos } from '../modelo/versoes';
import type { Roteiro } from '../modelo/tipos';
import { Vagas } from './vagas';
import { BalaoLigar } from './BalaoLigar';
import { agruparPorDia, etapaPorExtenso, filaVisivel, montarSemana, noTrello, nomeDaEtiqueta, pedeRevisao, pendentes, rubrica, semanaEncolhida, type CardDaSemana, type EtapaDoCard, type GrupoDia } from './fila';
import { Ponteiros, useMeuPonteiro, type PonteiroDeAlguem, type PosicaoPonteiro } from './ponteiros';
import { avisarCursorMudou, CURSORES, Cursor, cursorNoMouse, escolherCursor, meuCursor, usarCursorNoMouse, usarVerPonteiros, verPonteiros } from './cursores';
import { aplicarTema, temaSalvo, type Tema } from './tema';
import { SAIR_DO_ACESSO, type Identidade } from '../dados/identidade';
import type { Pessoa } from '../modelo/tipos';
import { Icone } from './icones';
import { CONVITES, CONVITES_FILA_VAZIA, ConviteCompacto, ConviteDeArrastar, Duvida, Marca, RABISCOS, Riscado } from './pecas';
import { semAcento } from '../modelo/vocabularios';
import { dataCurtaComDia, plural } from './util';

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
  cadastros: (inicio?: { aba?: TipoCadastro; claquete?: string }) => void;
  /** Abre a aba Filmes (as prévias de filmes). */
  filmes?: () => void;
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

interface VersaoNova {
  anterior: Resumo;
  substituir: () => void;
  manter: () => void;
}

/** A claquete já está na produção da arte: antes de revisar, comparar com o que está lá e decidir. */
interface JaNaProducao {
  comparar: () => void;
}

/** Qual dos riscos à mão vai sob a claquete: sempre o mesmo para o mesmo roteiro. */
const tracoDe = (id: string) => [...id].reduce((h, c) => h + c.charCodeAt(0), 0);

function Ficha({ r, nova, ordem, prioridade, abrir, acoes, agora, eu, versao, producao, mandar, cadastrarAtracao, avisar, ligou }: { r: Resumo; nova: boolean; ordem: number; prioridade?: boolean; abrir: () => void; acoes: React.ReactNode; agora: { nome: string; email: string }[]; eu?: string; versao?: VersaoNova; producao?: JaNaProducao; mandar?: () => Promise<void>; cadastrarAtracao?: () => void; avisar?: (t: string) => void; ligou?: () => void }) {
  const [ligando, setLigando] = useState(false);
  const claquete = r.meta.claquete || r.meta.titulo || r.meta.programa || 'Sem claquete';
  const [digitado, terminou] = useDigitacao(claquete, nova);
  // o que já está no Trello não vira ficha: vai para a seção No Trello
  const revisar = r.meta.revisar ?? [];
  // a pergunta da v2 também pede atenção
  const np = producao ? r.meta.naProducao : undefined;
  const alerta = revisar.length > 0 || !!np;
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
      <button className="ficha-claquete" onClick={np && producao ? producao.comparar : abrir} aria-label={`Abrir ${claquete}`}>
        <b>
          <span className="claquete-alvo">
            {prioridade && terminou ? <Riscado traco={tracoDe(r.id)}><span className="claquete-texto">{digitado}</span></Riscado> : <span className="claquete-texto">{digitado}</span>}
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
        {r.meta.redator ? <span><small className="rotulo-gente">redator:</small> {r.meta.redator}</span> : <span className="falta">redator: <Duvida semente={r.id + 'r'} rotulo="sem redator" /></span>}
        <small className={semEditor ? 'falta' : ''}>
          edição: {!semEditor ? r.meta.editor : <Duvida semente={r.id + 'e'} rotulo="o editor não está na pauta" />}
        </small>
      </span>
      <span className="ficha-artes some">
        <Contagem n={r.nArtes} traco={ordem} desenhar={nova && terminou} circular={revisar.length > 0} />
      </span>
      <span className="ficha-acoes some">
        {acoes}
        {np && producao ? (
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
          <button className="botao-texto" onClick={versao.manter}>Manter as duas</button>
          <button className="botao primario" onClick={versao.substituir}>Substituir a anterior</button>
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
          {revisar.map((m) => <span key={m} className="pendencia">{m}</span>)}
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
                  nova={() => (setLigando(false), cadastrarAtracao())}
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

/** O card da semana (formato A). Fechado: a claquete em cima; embaixo, discretas, a praça e as artes à mão; à direita,
    a etapa. Um clique abre (com animação de altura) a ficha do card: redator, edição, arte, etapa com o prazo, a rubrica
    de quem revisou e os atalhos para o roteiro e para o card no Trello. */
function CardNoTrello({ c, aberto, alternar, abrir, tirar }: { c: CardDaSemana; aberto: boolean; alternar: () => void; abrir: () => void; tirar?: () => void }) {
  const { r, etapa, andamento } = c;
  const claquete = r.meta.claquete || r.meta.titulo || 'Sem claquete';
  const { nome: etapaNome, ate } = etapaPorExtenso(andamento);
  const idMais = `card-mais-${r.id}`;
  return (
    <li className={`card-semana ${etapa === 'caiu' ? 'caiu' : ''} ${aberto ? 'aberto' : ''}`} data-card={r.id}>
      <button type="button" className="card-semana-abrir" onClick={alternar} aria-expanded={aberto} aria-controls={idMais}>
        <span className="card-semana-claquete">{c.prioridade ? <Riscado traco={tracoDe(r.id)}>{claquete}</Riscado> : claquete}</span>
        <span className="card-semana-linha">
          {r.meta.praca && <><span>{r.meta.praca}</span><span className="sep" aria-hidden="true">·</span></>}
          <span className="card-semana-artes">{plural(r.nArtes, 'arte', 'artes')}</span>
          {etapa && (
            <span className={`card-semana-etapa ${etapa}`}>
              {etapa === 'entregue' ? <Icone nome="certo" tam={11} traco={3} /> : etapa !== 'caiu' && <i aria-hidden="true" />}
              {ETAPA_NO_CARD[etapa]}
            </span>
          )}
        </span>
        {/* na semana encolhida, a etapa vira só o pontinho à direita da claquete */}
        {etapa && etapa !== 'caiu' && <i className={`card-semana-sinal ${etapa}`} aria-hidden="true" />}
      </button>
      <div className="card-semana-mais" id={idMais} inert={!aberto || undefined}>
        <div>
          <div className="card-semana-mais-dentro">
            <dl className="card-semana-dados">
              <dt>redator</dt>
              <dd>{r.meta.redator || <small>sem redator</small>}</dd>
              <dt>edição</dt>
              <dd>{r.meta.editor || <small>sem editor</small>}</dd>
              {!!andamento?.designers.length && (
                <>
                  <dt>arte</dt>
                  <dd>{andamento.designers.join(', ')}</dd>
                </>
              )}
              {(etapaNome || ate) && (
                <>
                  <dt>etapa</dt>
                  <dd>
                    {etapaNome}
                    {ate && <small> até {ate}</small>}
                  </dd>
                </>
              )}
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
    </li>
  );
}

const CHAVE_SEMANA = 'promeiro:semana';

/** Os roteiros já enviados: uma seção só, abaixo da revisão, com a semana de agenda a partir de ontem. Com roteiros
    para revisar na fila, a semana encolhe; "ver a semana inteira" volta ao tamanho normal (a escolha fica no navegador). */
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
  const s = montarSemana(lista, andamento, new Date(), deslocamento);
  const card = (c: CardDaSemana) => (
    <CardNoTrello
      key={c.r.id}
      c={c}
      aberto={aberto === c.r.id}
      alternar={() => setAberto((a) => (a === c.r.id ? null : c.r.id))}
      abrir={() => abrir(c.r.id)}
      tirar={() => tirar(c.r)}
    />
  );
  const avulsa = (titulo: string, cards: CardDaSemana[], chave: string) => (
    <section key={chave} className="semana-avulsa" aria-label={titulo}>
      <h3>{titulo}</h3>
      <ul>{cards.map(card)}</ul>
    </section>
  );
  return (
    <section className={`secao-trello ${encolhida ? 'encolhida' : ''}`} aria-label="No Trello">
      <div className="secao-trello-topo">
        <h2>
          <Icone nome="quadro" tam={22} traco={1.7} />
          No Trello
        </h2>
        <span className="secao-trello-conta">
          {plural(s.total, 'card', 'cards')}
          {s.entregues > 0 && ` · ${plural(s.entregues, 'entregue', 'entregues')}`}
          {s.comPrioridade > 0 && <> · <span className="prio-nota">{s.comPrioridade} com prioridade</span></>}
        </span>
        <span className="semana-nav">
          {haRevisao && (
            <button type="button" className="botao-texto" onClick={alternarInteira}>
              {inteira ? 'recolher a semana' : 'ver a semana inteira'}
            </button>
          )}
          {deslocamento !== 0 && <button type="button" className="botao-texto" onClick={() => setDeslocamento(0)}>voltar para hoje</button>}
          {s.anteriores.length > 0 && (
            <button type="button" className="botao-texto" aria-expanded={verAnteriores} onClick={() => setVerAnteriores((v) => !v)}>
              dias anteriores
            </button>
          )}
          <button type="button" className="botao-icone" aria-label="Semana anterior" title="Semana anterior" onClick={() => setDeslocamento((n) => n - 1)}>
            <Icone nome="voltar" tam={16} traco={2.2} />
          </button>
          <b>{s.periodo}</b>
          <button type="button" className="botao-icone" aria-label="Próxima semana" title="Próxima semana" onClick={() => setDeslocamento((n) => n + 1)}>
            <Icone nome="direita" tam={16} traco={2.2} />
          </button>
        </span>
      </div>
      <div className="semana">
        {s.dias.map((d) => (
          <section key={d.iso} className={`coluna ${d.marca === 'hoje' ? 'hoje' : ''} ${d.fimDeSemana ? 'fim-de-semana' : ''}`} aria-label={`${d.diaDaSemana} ${d.numero}${d.marca ? `, ${d.marca}` : ''}`}>
            <div className="coluna-topo">
              <span className="dia-sem">{d.diaDaSemana}</span>
              <span className="dia-num">
                {d.numero}
                {d.marca === 'hoje' && <svg viewBox="0 0 64 44" preserveAspectRatio="none" aria-hidden="true"><path d={RABISCOS[1]} /></svg>}
              </span>
              {d.marca && <span className="dia-rel">{d.marca}</span>}
            </div>
            <ul className="coluna-corpo">{d.cards.length ? d.cards.map(card) : <li className="nada">nada ainda</li>}</ul>
          </section>
        ))}
      </div>
      {s.semData.length > 0 && avulsa('sem data', s.semData, 'sem-data')}
      {verAnteriores && s.anteriores.map((d) => avulsa(d.titulo, d.cards, d.iso))}
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

export function Biblioteca({ abrir, aoFundo = false, comparar, abrirArquivo, receberArquivos, criar, avisar, identidade, definirPerfil, novos, falhas, tirarFalha, chegou, lendo, cadastros, filmes }: Props) {
  const [roteiros, setRoteiros] = useState<Resumo[] | null>(null);
  const [busca, setBusca] = useState('');
  // tirar da fila: some na hora, mas só é apagado depois de alguns segundos, para dar tempo de desfazer
  const [saindo, setSaindo] = useState<Resumo | null>(null);
  const prazoSaida = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [filtroEstado, setFiltroEstado] = useState<'prontos' | 'revisar' | null>(null);
  const [colando, setColando] = useState(false);
  const [claqueteNova, setClaqueteNova] = useState('');

  const carregar = () => armazenamento.listar().then(setRoteiros, () => setRoteiros([]));
  // o andamento na produção da arte: junto com a fila e a cada 2 min (o servidor guarda por 1 min)
  const [andamento, setAndamento] = useState<Record<string, Andamento>>({});
  // vem também para a fila de revisão: quais roteiros estão na lista de prioridade
  const temRoteiros = !!roteiros?.length;
  useEffect(() => {
    if (!temRoteiros) return;
    const ler = () => void armazenamento.andamento().then(setAndamento);
    ler();
    const t = setInterval(ler, 120_000);
    return () => clearInterval(t);
  }, [temRoteiros, roteiros]);
  useEffect(() => {
    void carregar();
  }, [chegou]);

  // fila ao vivo: o que os colegas sobem aparece aqui na hora, com a mesma animação
  const [deOutros, setDeOutros] = useState<string[]>([]);
  const [colegas, setColegas] = useState<{ nome: string; email: string }[]>([]);
  const [noRoteiro, setNoRoteiro] = useState<Record<string, { nome: string; email: string }[]>>({});
  // R: abre o próximo roteiro que pede revisão e que ninguém está vendo (o primeiro da fila, na ordem da tela)
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
  // tirar da fila: primeiro o item some com uma animação curta, depois sai da lista (sem a tela pular de uma vez)
  const [sumindo, setSumindo] = useState<string | null>(null);
  const tirar = (r: Resumo) => {
    if (sumindo) return;
    setSumindo(r.id);
    setTimeout(() => {
      setSumindo(null);
      tirarJa(r);
    }, 260);
  };
  const tirarJa = (r: Resumo) => {
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
      const completo = 'doc' in r ? r : await armazenamento.ler(r.id);
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
  const jaNoTrello = (r?: Resumo) => r?.trello?.estado === 'enviado' || r?.trello?.estado === 'duplicado';

  /** Versão nova de uma claquete que já estava na fila: fica a nova, com os tipos de arte da anterior. */
  const substituir = async (nova: Resumo) => {
    const anterior = roteiros?.find((x) => x.id === nova.meta.substitui);
    try {
      const [rn, ra] = await Promise.all([armazenamento.ler(nova.id), nova.meta.substitui ? armazenamento.ler(nova.meta.substitui) : undefined]);
      if (!rn) return;
      if (!ra) {
        await armazenamento.salvar({ ...rn, meta: { ...rn.meta, substitui: undefined } });
        return void carregar();
      }
      const { doc, herdadas } = herdarTipos(rn.doc, ra.doc);
      const atualizado: Roteiro = { ...rn, doc, meta: { ...rn.meta, substitui: undefined, editor: rn.meta.editor || ra.meta.editor } };
      atualizado.meta.revisar = pendencias(exportar(atualizado));
      await armazenamento.salvar(atualizado, 'substituiu a versão anterior');
      // o card que a anterior já tinha fica com a nova, antes que ela saia
      if (jaNoTrello(anterior)) await herdarEnvio(rn.id, ra.id).catch(() => {});
      await armazenamento.apagar(ra.id);
      const card = jaNoTrello(anterior) ? ' O card no Trello continua o da versão anterior.' : '';
      avisar(herdadas ? `Versão anterior substituída. ${plural(herdadas, 'tipo de arte foi mantido', 'tipos de arte foram mantidos')}.${card}` : `Versão anterior substituída.${card}`);
      // a anterior não tinha ido para o Trello: a nova vai, se não tiver pendência
      if (temTrello() && !jaNoTrello(anterior) && !travamTrello(atualizado.meta.revisar).length) void mandar(atualizado);
      else void carregar();
    } catch {
      avisar('Não consegui substituir a versão anterior.');
    }
  };
  const manterAsDuas = async (nova: Resumo) => {
    const rn = await armazenamento.ler(nova.id).catch(() => undefined);
    if (rn) await armazenamento.salvar({ ...rn, meta: { ...rn.meta, substitui: undefined } }).catch(() => {});
    if (rn && temTrello() && !travamTrello(rn.meta.revisar).length) void mandar({ ...rn, meta: { ...rn.meta, substitui: undefined } });
    else void carregar();
  };

  const termo = semAcento(busca.trim());
  const aberto = (roteiros ?? []).some((r) => r.aberto);
  const todos = filaVisivel(roteiros, saindo?.id, apagados);
  // a conta do topo e os filtros olham só o que ainda pede trabalho: o que foi ao ar ou já está no Trello fica de fora
  const pendente = new Set(pendentes(todos).map((r) => r.id));
  const nPendentes = pendente.size;
  const paraRevisar = todos.filter((r) => pendente.has(r.id) && pedeRevisao(r)).length;
  const achado = (r: Resumo) => !termo || semAcento([r.meta.claquete, r.meta.programa, r.meta.redator, r.meta.editor, r.meta.titulo].join(' ')).includes(termo);
  const visiveis = todos
    .filter(achado)
    .filter((r) => !filtroEstado || (pendente.has(r.id) && (filtroEstado === 'revisar' ? pedeRevisao(r) : !pedeRevisao(r))));
  // a fila é a revisão dos roteiros: os filmes da grade não entram (os cards deles ficam no Trello e no FilmeBOT)
  const { proximos, exibidos } = agruparPorDia(visiveis.filter((r) => !noTrello(r)));
  // os enviados vão para a seção No Trello: a busca vale para eles, os filtros de revisão não
  const enviados = todos.filter((r) => noTrello(r) && achado(r));
  proximoParaRevisar.current =
    proximos.flatMap((g) => g.itens).find((r) => pendente.has(r.id) && pedeRevisao(r) && !noTrello(r) && !noRoteiro[r.id]?.length)?.id ?? null;
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
        versao={anterior ? { anterior, substituir: () => substituir(r), manter: () => manterAsDuas(r) } : undefined}
        producao={r.meta.naProducao && (r.podeEditar || r.meu || aberto) ? { comparar: () => comparar(r.id) } : undefined}
        mandar={temTrello() && (r.podeEditar || r.meu || aberto) ? () => mandar(r) : undefined}
        cadastrarAtracao={temCadastros() && r.meta.claquete ? () => cadastros({ aba: 'atracoes', claquete: r.meta.claquete }) : undefined}
        avisar={avisar}
        ligou={() => void carregar()}
        acoes={
          (r.meu || aberto) && (
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
        {todos.length > 6 && <BuscaNaLupa valor={busca} mudar={setBusca} ativa={!aoFundo} />}
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

        {sumindo && <style>{`[data-ancora="ficha:${sumindo}"], [data-card="${sumindo}"] { animation: sumir-da-fila 0.26s var(--suave) forwards; pointer-events: none; }`}</style>}
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
                      nPendentes ? <><em>{nPendentes}</em> {nPendentes === 1 ? 'roteiro na fila' : 'roteiros na fila'}</> : <>Fila em dia</>
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
