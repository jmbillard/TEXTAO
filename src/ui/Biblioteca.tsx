import { useEffect, useMemo, useRef, useState } from 'react';
import type { Falha } from '../App';
import { apagarAoSair, armazenamento, escolherMinhaCor, herdarEnvio, mandarParaTrello, temCadastros, temTrello, type Andamento, type Resumo, type TipoCadastro } from '../dados/armazenamento';
import { corDe, PALETA, registrarCores } from '../dados/colaboracao';
import { ouvirFila, type Fila } from '../dados/eventos';
import { exportar, pendencias, travamTrello } from '../modelo/exportar';
import { herdarTipos } from '../modelo/versoes';
import type { Roteiro } from '../modelo/tipos';
import { Vagas } from './vagas';
import { agruparPorDia, noTrello, pedeRevisao, pendentes, type GrupoDia } from './fila';
import { Ponteiros, useMeuPonteiro, type PonteiroDeAlguem, type PosicaoPonteiro } from './ponteiros';
import { avisarCursorMudou, CURSORES, Cursor, cursorNoMouse, escolherCursor, meuCursor, usarCursorNoMouse, usarVerPonteiros, verPonteiros } from './cursores';
import { aplicarTema, temaSalvo, type Tema } from './tema';
import { SAIR_DO_ACESSO, type Identidade } from '../dados/identidade';
import type { Pessoa } from '../modelo/tipos';
import { Icone } from './icones';
import { CONVITES, CONVITES_FILA_VAZIA, ConviteDeArrastar, Duvida, Marca } from './pecas';
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
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')
    .toUpperCase();

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
function Perfil({ identidade, definirPerfil, cadastros, aoMudarCor }: Pick<Props, 'identidade' | 'definirPerfil'> & { cadastros?: () => void; aoMudarCor?: () => void }) {
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

const primeiro = (nome: string) => nome.split(/\s+/)[0];
const nomes = (pessoas: { nome: string }[]) =>
  pessoas.length <= 2 ? pessoas.map((p) => primeiro(p.nome)).join(' e ') : `${primeiro(pessoas[0].nome)} e mais ${pessoas.length - 1}`;

const RABISCOS = [
  'M13 25 C 9 11, 27 4, 43 6 C 60 9, 61 31, 42 37 C 25 42, 5 37, 8 22 C 10 11, 23 5, 38 4',
  'M50 9 C 30 2, 6 9, 6 23 C 6 37, 30 42, 46 38 C 62 33, 62 12, 44 7 C 34 4, 22 5, 15 9',
  'M10 18 C 14 6, 36 2, 50 8 C 63 14, 58 34, 40 38 C 22 42, 4 34, 7 20 C 9 12, 18 7, 28 5',
];

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

const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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

function Ficha({ r, nova, ordem, abrir, acoes, agora, eu, versao, producao, mandar, cadastrarAtracao }: { r: Resumo; nova: boolean; ordem: number; abrir: () => void; acoes: React.ReactNode; agora: { nome: string; email: string }[]; eu?: string; versao?: VersaoNova; producao?: JaNaProducao; mandar?: () => Promise<void>; cadastrarAtracao?: () => void }) {
  const claquete = r.meta.claquete || r.meta.titulo || r.meta.programa || 'Sem claquete';
  const [digitado, terminou] = useDigitacao(claquete, nova);
  // já no Trello: a ficha descansa (sem alerta, sem pendências, "Abrir" discreto)
  const mandada = noTrello(r);
  const revisar = mandada ? [] : r.meta.revisar ?? [];
  // a pergunta da v2 também pede atenção
  const np = !mandada && producao ? r.meta.naProducao : undefined;
  const alerta = revisar.length > 0 || !!np;
  const semEditor = !r.meta.editor;
  // alguém com o roteiro aberto: a orelha dobra, a claquete é selecionada e o nome é anotado à mão.
  // Depois que a pessoa sai, ficam a orelha pequena, um grifo e a rubrica.
  const ocupada = agora.length > 0;
  const revisada = !ocupada && !!r.revisadoPor;
  const quem = ocupada ? agora[0] : r.revisadoPor;
  // a folha de quem está revisando cobre só as linhas de cima (sem a do Trello): a principal, a versão, a produção e as pendências
  const avisoTrello = r.trello?.estado === 'enviando' || r.trello?.estado === 'erro';
  const comPendencias = revisar.length > 0 || (!r.meta.programa && !!cadastrarAtracao && !mandada) || avisoTrello;
  const linhasDaFolha = 1 + (versao ? 1 : 0) + (np && producao && !versao ? 1 : 0) + (comPendencias ? 1 : 0);
  return (
    <div
      className={`ficha ${alerta ? 'revisar' : 'pronta'} ${nova ? 'nova' : ''} ${terminou ? 'montada' : 'digitando'} ${ocupada ? 'ocupada' : ''} ${revisada ? 'revisada' : ''} ${mandada ? 'mandada' : ''}`}
      data-ancora={`ficha:${r.id}`}
      style={quem ? ({ '--cor': corDe(quem.email), '--fim-folha': linhasDaFolha + 1 } as React.CSSProperties) : undefined}
    >
      {(ocupada || revisada) && (
        <span className="orelha" aria-hidden="true">
          <i>{ocupada ? primeiro(agora[0].nome)[0] : ''}</i>
        </span>
      )}
      {mandada && r.trello?.url ? (
        <a className="ficha-marca trello" href={r.trello.url} target="_blank" rel="noreferrer" title="Abrir o card no Trello" aria-label="Abrir o card no Trello">
          <Icone nome="quadro" tam={12} traco={2.4} />
        </a>
      ) : (
        <span className={`ficha-marca ${mandada ? 'trello' : alerta ? 'revisar' : 'ok'}`} aria-hidden="true">
          {mandada ? <Icone nome="quadro" tam={12} traco={2.4} /> : alerta ? <Icone nome="atencao" tam={12} traco={3} /> : <Icone nome="certo" tam={12} traco={3} />}
        </span>
      )}
      <button className="ficha-claquete" onClick={np && producao ? producao.comparar : abrir} aria-label={`Abrir ${claquete}`}>
        <b>
          <span className="claquete-alvo">
            <span className="claquete-texto">{digitado}</span>
            {ocupada && <svg className="ibeam" viewBox="0 0 12 28" aria-hidden="true"><path d="M2 2 Q6 2 6 6 V22 Q6 26 2 26 M10 2 Q6 2 6 6 M10 26 Q6 26 6 22 M3.5 14 H8.5" /></svg>}
          </span>
          {nova && !terminou && <i className="cursor" />}
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
        {r.meta.redator ? <span><small className="rotulo-gente">redator:</small> {r.meta.redator}</span> : mandada ? <span className="suave">redator: —</span> : <span className="falta">redator: <Duvida semente={r.id + 'r'} rotulo="sem redator" /></span>}
        <small className={semEditor && !mandada ? 'falta' : ''}>
          edição: {!semEditor ? r.meta.editor : mandada ? 'a definir' : <Duvida semente={r.id + 'e'} rotulo="o editor não está na pauta" />}
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
          <button className={mandada ? 'botao-texto' : `botao ${alerta ? 'primario' : ''}`} onClick={abrir}>{alerta ? 'Revisar' : 'Abrir'}</button>
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
          <a className="card-existente" href={np.url} target="_blank" rel="noreferrer" title={np.status.length ? np.status.map((x) => etapaDe(x).nome).join(', ') : undefined}>
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
          {!r.meta.programa && cadastrarAtracao && !mandada && (
            <button type="button" className="atalho-cadastro" onClick={cadastrarAtracao}>
              <Icone nome="mais" tam={12} traco={2.4} /> cadastrar a atração
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/** O que já está no Trello vira um card pequeno, numa grade no fim do dia: ser card já diz que está lá. */
// a etapa do card na produção da arte (status do Teable, que o n8n traz do Trello)
const ETAPAS: Record<string, { nome: string; tom: string }> = {
  'AGUARDANDO MATERIAL': { nome: 'Aguardando material', tom: 'espera' },
  PRODUZINDO: { nome: 'Produzindo', tom: 'produzindo' },
  'EM APROVAÇÃO': { nome: 'Em aprovação', tom: 'aprovacao' },
  'PEDIDO DE ALTERAÇÃO': { nome: 'Pedido de alteração', tom: 'alteracao' },
  FINALIZADO: { nome: 'Finalizado', tom: 'finalizado' },
  FILME: { nome: 'Filme', tom: 'espera' },
  CAIU: { nome: 'Caiu', tom: 'caiu' },
};
const etapaDe = (st: string) => ETAPAS[st.toUpperCase()] ?? { nome: st[0] + st.slice(1).toLowerCase(), tom: 'espera' };

function CardTrello({ r, abrir, andamento, tirar }: { r: Resumo; abrir: () => void; andamento?: Andamento; tirar?: () => void }) {
  const claquete = r.meta.claquete || r.meta.titulo || 'Sem claquete';
  const e = r.trello!;
  const etapas = (andamento?.status ?? []).map(etapaDe);
  const caiu = etapas.some((x) => x.tom === 'caiu');
  // a entrega vem em UTC; o dia que vale é o de Brasília
  const prazo = !andamento?.entregue && andamento?.entrega && !caiu ? new Date(andamento.entrega).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
  return (
    <li className={`card-trello ${caiu ? 'caiu' : ''}`} data-card={r.id}>
      {tirar && (
        <button className="card-lixo" title="Tirar da fila (o card no Trello continua lá)" aria-label={`Tirar ${claquete} da fila`} onClick={tirar}>
          <Icone nome="fechar" tam={11} traco={2.4} />
        </button>
      )}
      <span className="card-etiquetas">
        {r.meta.praca && <i className="etq praca" aria-hidden="true">{r.meta.praca}</i>}
        <i className="etq artes" aria-hidden="true">{plural(r.nArtes, 'arte', 'artes')}</i>
        {r.meta.v2De && <i className="etq v2" title="Versão nova: atualizou o card que já existia">v2</i>}
        {andamento?.entregue && !caiu ? (
          <i className="etq etapa entregue"><Icone nome="certo" tam={10} traco={3} /> Entregue</i>
        ) : (
          etapas.map((x) => <i key={x.nome} className={`etq etapa ${x.tom}`}>{x.nome}</i>)
        )}
        {prazo && <small className="card-prazo" title={`Entrega ${dataCurtaComDia(new Date(andamento!.entrega!).toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' }))}`}>até {prazo}</small>}
      </span>
      <button className="card-claquete" onClick={abrir} title={`Abrir ${claquete}`}>{claquete}</button>
      <span className="card-rodape">
        <span className="card-gente">
          {r.meta.redator && <span>redator: {r.meta.redator}</span>}
          {r.meta.editor && <small>edição: {r.meta.editor}</small>}
          {!!andamento?.designers.length && <small>arte: {andamento.designers.join(', ')}</small>}
        </span>
        {e.url && (
          <a className="card-link" href={e.url} target="_blank" rel="noreferrer" title="Abrir o card no Trello" aria-label={`Abrir ${claquete} no Trello`}>
            <Icone nome="quadro" tam={13} />
          </a>
        )}
        {e.estado === 'enviado' && e.por && (
          <span className="card-quem" style={{ '--cor': corDe(e.por) } as React.CSSProperties} title={`Mandado por ${e.por}, ${horaCurta(e.em)}`}>
            {iniciais(e.por)}
          </span>
        )}
      </span>
    </li>
  );
}

export function Biblioteca({ abrir, aoFundo = false, comparar, abrirArquivo, criar, avisar, identidade, definirPerfil, novos, falhas, tirarFalha, chegou, lendo, cadastros }: Props) {
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
  const temNoTrello = (roteiros ?? []).some(noTrello);
  useEffect(() => {
    if (!temNoTrello) return;
    const ler = () => void armazenamento.andamento().then(setAndamento);
    ler();
    const t = setInterval(ler, 120_000);
    return () => clearInterval(t);
  }, [temNoTrello, roteiros]);
  useEffect(() => {
    void carregar();
  }, [chegou]);

  // fila ao vivo: o que os colegas sobem aparece aqui na hora, com a mesma animação
  const [deOutros, setDeOutros] = useState<string[]>([]);
  const [colegas, setColegas] = useState<{ nome: string; email: string }[]>([]);
  const [noRoteiro, setNoRoteiro] = useState<Record<string, { nome: string; email: string }[]>>({});
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

  const apagarDeVez = (r: Resumo) =>
    armazenamento.apagar(r.id).then(
      () => void carregar(),
      () => avisar('Não consegui tirar esse roteiro da fila.'),
    );
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
  const todos = (roteiros ?? []).filter((r) => r.id !== saindo?.id);
  // a conta do topo e os filtros olham só o que ainda pede trabalho: o que foi ao ar ou já está no Trello fica de fora
  const pendente = new Set(pendentes(todos).map((r) => r.id));
  const nPendentes = pendente.size;
  const paraRevisar = todos.filter((r) => pendente.has(r.id) && pedeRevisao(r)).length;
  const visiveis = todos
    .filter((r) => !termo || semAcento([r.meta.claquete, r.meta.programa, r.meta.redator, r.meta.editor, r.meta.titulo].join(' ')).includes(termo))
    .filter((r) => !filtroEstado || (pendente.has(r.id) && (filtroEstado === 'revisar' ? pedeRevisao(r) : !pedeRevisao(r))));
  const { proximos, exibidos } = agruparPorDia(visiveis);
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
        abrir={() => abrir(r.id)}
        versao={anterior ? { anterior, substituir: () => substituir(r), manter: () => manterAsDuas(r) } : undefined}
        producao={r.meta.naProducao && (r.podeEditar || r.meu || aberto) ? { comparar: () => comparar(r.id) } : undefined}
        mandar={temTrello() && (r.podeEditar || r.meu || aberto) ? () => mandar(r) : undefined}
        cadastrarAtracao={temCadastros() && r.meta.claquete ? () => cadastros({ aba: 'atracoes', claquete: r.meta.claquete }) : undefined}
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
      <span className="dia-conta">{plural(g.itens.length, 'roteiro', 'roteiros')}</span>
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
      <main className="biblioteca fila" data-ancora="pagina">
        <header className="bib-topo">
          <h1 className="bib-marca"><Marca /></h1>
          <span className="espaco" />
          {colegas.length > 0 && (
            <div className="na-fila" title={`Também com a fila aberta: ${colegas.map((c) => c.nome).join(', ')}`}>
              {colegas.slice(0, 5).map((c) => (
                <span key={c.email} className="presente" style={{ background: corDe(c.email) }}>{iniciais(c.nome)}</span>
              ))}
              {colegas.length > 5 && <span className="presente mais">+{colegas.length - 5}</span>}
              <span className="na-fila-texto">{colegas.length === 1 ? `${colegas[0].nome.split(/\s+/)[0]} também está aqui` : `mais ${colegas.length} aqui`}</span>
            </div>
          )}
          <Perfil identidade={identidade} definirPerfil={definirPerfil} cadastros={temCadastros() ? () => cadastros() : undefined} aoMudarCor={() => setCores((n) => n + 1)} />
        </header>

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
              extra={colando ? colar : <button className="botao-texto" onClick={() => setColando(true)}>ou cole o texto copiado do Word</button>}
            />
          </div>
        ) : (
          roteiros && (
            <section className="lista">
              <div className="fila-topo">
                <div>
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
                    {falhas.length > 0 && <span><i className="ponto erro" />{plural(falhas.length, 'não lido', 'não lidos')}</span>}
                    {lendo && <span><i className="ponto lendo" />lendo 1</span>}
                  </p>
                </div>
                {todos.length > 6 && (
                  <label className="busca">
                    <Icone nome="lupa" tam={15} traco={2} />
                    <input type="search" placeholder="Buscar claquete, atração ou redator" aria-label="Buscar roteiros" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  </label>
                )}
              </div>

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

              {/* nada para ir ao ar (tudo já foi exibido): o convite para arrastar volta para o lugar dele */}
              {!proximos.length && !lendo && !falhas.length && !termo && !filtroEstado && (
                <ConviteDeArrastar
                  className="nada-pela-frente"
                  frases={CONVITES}
                  extra={colando ? colar : <button className="botao-texto" onClick={() => setColando(true)}>ou cole o texto copiado do Word</button>}
                />
              )}

              <div className="dias">
              <Vagas itens={proximos} chave={(g) => g.chave}>
                {(g) => (
                <section className="dia" aria-label={`${g.titulo}, ${g.subtitulo}`}>
                  {cabecalhoDoDia(g)}
                  {(
                    <>
                      <ul className="fichas">
                        <Vagas como="li" itens={g.itens.filter((r) => !noTrello(r))} chave={(r) => r.id}>{ficha}</Vagas>
                      </ul>
                      {g.itens.some(noTrello) && (
                        <div className="cards-trello-bloco">
                        <p className="cards-rotulo">já no Trello</p>
                        <ul className="cards-trello" aria-label="Já no Trello">
                          {g.itens.filter(noTrello).map((r) => <CardTrello key={r.id} r={r} abrir={() => abrir(r.id)} andamento={andamento[r.id]} tirar={() => tirar(r)} />)}
                        </ul>
                        </div>
                      )}
                    </>
                  )}
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
              {proximos.length > 0 || lendo || falhas.length > 0 || termo || filtroEstado ? (colando ? colar : (
                <p className="fila-rodape">Arraste mais roteiros para qualquer ponto da tela. <button className="botao-texto" onClick={() => setColando(true)}>Colar do Word</button></p>
              )) : null}
            </section>
          )
        )}
      </main>
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
