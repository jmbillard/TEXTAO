import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { conferirConfiguracao, lerConfiguracao, salvarConfiguracao, type SecaoPracas } from '../dados/armazenamento';
import {
  CHAVE_DO_CAMPO,
  FLUXOS_DO_N8N,
  PONTAS,
  CAMPO_PRACA,
  chaveDa,
  desfazerAMao,
  estadoDasPracas,
  oQueMuda,
  pracasNovas,
  type ConferenciaDasPracas,
  type Ligacao,
  type LigacoesDasPracas,
  type Ponta,
  type QuadroLido,
} from '../modelo/ligarPeloNome';
import { reconhecerPraca, type Praca, type RegraDaPraca } from '../modelo/pracas';
import { Icone } from './icones';
import { Marca } from './pecas';
import { useTelaDeCelular } from './faixa';
import './configuracao.css';

/* A tela de Configuração (#72), só para administradores: a seção Praças. O PROMeiro liga pelo nome; a tela mostra só
   as exceções (o que não achou, o que achou em dobro, o que sumiu e o ligado à mão), e o resto num "ver tudo". As
   regras de cada praça ficam sempre à mostra e editáveis; a ordem é arrastável; uma é a padrão. Tudo o que muda
   fica num rascunho até "Conferir e salvar". "+ Nova praça" (#73) cria uma praça: sigla, nome e regra; a entrada, a
   saída e a opção ligam pelo nome (ou à mão); a opção que não existe o PROMeiro cria ao salvar. No celular, só
   consulta. */

interface Props {
  voltar: () => void;
  avisar: (texto: string) => void;
}

const NOME_DA_PONTA: Record<Ponta, string> = { entrada: 'entrada', saida: 'saída', opcao: 'opção' };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** A claquete de exemplo de cada praça: a palavra da regra na ponta certa; a padrão, sem palavra nenhuma. */
function exemploDa(p: Praca): string {
  const base = 'FESTA 3/11';
  if (p.regra?.palavras.length) return p.regra.onde === 'fim' ? `${base} ${p.regra.palavras[0]}` : `${p.regra.palavras[0]} ${base}`;
  return !p.padrao && p.tambem.length ? `${base} ${p.tambem[0]}` : base;
}
/** "SP RIO" ou "SP, RIO" → ['SP', 'RIO'] */
const palavrasDoTexto = (t: string) =>
  t
    .split(/[\s,]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);

/** A praça nova, como está sendo escrita: a regra vem do texto das palavras (que segue a sigla até ser mexido). */
interface Nova {
  sigla: string;
  nome: string;
  onde: RegraDaPraca['onde'];
  palavras: string;
  tambem: string;
  /** as palavras acompanham a sigla enquanto ninguém mexeu nelas */
  palavrasSeguem: boolean;
  /** o que foi escolhido à mão (as chaves à mão ficam no rascunho) */
  entrada: string;
  saida: string;
  opcao: string;
}
const NOVA_VAZIA: Nova = { sigla: '', nome: '', onde: 'fim', palavras: '', tambem: '', palavrasSeguem: true, entrada: '', saida: '', opcao: '' };
const siglaDoTexto = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const pracaDaNova = (n: Nova): Praca => {
  const palavras = palavrasDoTexto(n.palavras);
  return {
    sigla: n.sigla,
    nome: n.nome.trim() || n.sigla,
    padrao: false,
    regra: palavras.length ? { onde: n.onde, palavras } : null,
    tambem: palavrasDoTexto(n.tambem),
    entrada: n.entrada,
    saida: n.saida,
    opcao: n.opcao,
  };
};
/** O rascunho com a praça nova no fim: o que não foi ligado à mão, o PROMeiro liga pelo nome (um só) ou deixa vazio. */
function comANova(r: LigacoesDasPracas, nova: Nova | null, quadro: QuadroLido | null): LigacoesDasPracas {
  if (!nova?.sigla) return r;
  const p = pracaDaNova(nova);
  const pelaMao = new Set(r.aMao);
  const comEla = { ...r, pracas: [...r.pracas, p] };
  return quadro ? desfazerAMao(comEla, quadro, PONTAS.map((ponta) => chaveDa(p.sigla, ponta)).filter((k) => !pelaMao.has(k))) : comEla;
}

/** O que se escolhe à mão: a lista (entrada ou saída de uma praça), a opção da praça ou o campo Praça. */
interface Escolha {
  chave: string;
  sigla: string;
  ponta: Ponta | 'campo';
  ancora: DOMRect;
}

export function Configuracao({ voltar, avisar }: Props) {
  const celular = useTelaDeCelular();
  const [secao, setSecao] = useState<SecaoPracas | null>(null);
  const [falha, setFalha] = useState('');
  const [rascunho, setRascunho] = useState<LigacoesDasPracas | null>(null);
  const [verTudo, setVerTudo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [conferencia, setConferencia] = useState<{ estado: 'conferindo' } | { estado: 'pronta'; r: ConferenciaDasPracas; salvando?: boolean } | null>(null);
  const [nova, setNova] = useState<Nova | null>(null);
  // as praças salvas agora que o n8n ainda não conhece (o aviso fica até sair da tela)
  const [n8nPendente, setN8nPendente] = useState<string[]>([]);

  const fecharEscolha = useCallback(() => setEscolha(null), []);
  const carregar = useCallback(() => {
    setFalha('');
    lerConfiguracao()
      .then((s) => {
        setSecao(s);
        setRascunho(s.proposta);
      })
      .catch((e) => setFalha(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(carregar, [carregar]);

  const quadro = secao?.quadro ?? null;
  // o rascunho com a praça nova (o que vai para a conferência)
  const completo = useMemo(() => rascunho && comANova(rascunho, nova, quadro), [rascunho, nova, quadro]);
  const novas = useMemo(() => (completo && secao ? pracasNovas(completo, secao.salvo) : []), [completo, secao]);
  const estado = useMemo(() => (completo && quadro ? estadoDasPracas(completo, quadro, novas) : null), [completo, quadro, novas]);
  // a praça nova conta como uma mudança só (mesmo sem sigla ainda: "Conferir" pede a sigla), com as das outras
  const mudancasDasOutras = useMemo(() => (rascunho && secao && quadro ? oQueMuda(rascunho, secao.salvo, quadro).length : 0), [rascunho, secao, quadro]);
  const nMudancas = mudancasDasOutras + (nova ? 1 : 0);
  // no celular, só consulta: nada muda
  const podeMudar = !celular && !!quadro;

  const mudarPraca = (sigla: string, m: Partial<Praca>) =>
    setRascunho((r) => r && { ...r, pracas: r.pracas.map((p) => (p.sigla === sigla ? { ...p, ...m } : p)) });
  const tornarPadrao = (sigla: string) => setRascunho((r) => r && { ...r, pracas: r.pracas.map((p) => ({ ...p, padrao: p.sigla === sigla })) });
  const mover = (de: number, para: number) =>
    setRascunho((r) => {
      if (!r || de === para || para < 0 || para >= r.pracas.length) return r;
      const pracas = [...r.pracas];
      const [p] = pracas.splice(de, 1);
      pracas.splice(para, 0, p);
      return { ...r, pracas };
    });
  /** A praça nova: a sigla nova leva junto o que foi ligado à mão. */
  const mudarNova = (m: Partial<Nova>) => {
    if (!nova) return;
    const n = { ...nova, ...m };
    if (m.sigla !== undefined && n.palavrasSeguem) n.palavras = n.sigla;
    if (m.palavras !== undefined) n.palavrasSeguem = false;
    const deOutra = (sigla: string) => !!rascunho?.pracas.some((p) => p.sigla === sigla);
    if (m.sigla !== undefined && m.sigla !== nova.sigla && !deOutra(nova.sigla) && !deOutra(n.sigla))
      setRascunho((r) => r && { ...r, aMao: r.aMao.map((k) => (nova.sigla && k.startsWith(`${nova.sigla}.`) ? `${n.sigla}${k.slice(nova.sigla.length)}` : k)) });
    setNova(n);
  };
  const desistirDaNova = () => {
    // a sigla repetida (a conferência recusa) não leva junto o ligado à mão da praça que já tem essa sigla
    if (nova?.sigla && !rascunho?.pracas.some((p) => p.sigla === nova.sigla)) setRascunho((r) => r && { ...r, aMao: r.aMao.filter((k) => !k.startsWith(`${nova.sigla}.`)) });
    setNova(null);
  };
  /** Ligar à mão: o id escolhido, marcado como "ligado à mão". */
  const ligar = (e: Escolha, id: string) => {
    if (nova?.sigla && e.sigla === nova.sigla && e.ponta !== 'campo') setNova({ ...nova, [e.ponta]: id });
    setRascunho((r) => {
      if (!r) return r;
      const aMao = [...new Set([...r.aMao, e.chave])];
      if (e.ponta === 'campo') return { ...r, campoPraca: id, aMao };
      return { ...r, aMao, pracas: r.pracas.map((p) => (p.sigla === e.sigla ? { ...p, [e.ponta]: id } : p)) };
    });
    setEscolha(null);
  };
  /** Desfazer o ligado à mão: volta o que o nome acha (um só), ou fica vazio (vira exceção). */
  const desfazer = (chaves: string[]) => setRascunho((r) => (r && quadro ? desfazerAMao(r, quadro, chaves) : r));

  const conferir = async () => {
    if (!completo) return;
    if (nova && !nova.sigla) return avisar('Falta a sigla da praça nova.');
    setConferencia({ estado: 'conferindo' });
    try {
      setConferencia({ estado: 'pronta', r: await conferirConfiguracao(completo) });
    } catch (e) {
      setConferencia(null);
      avisar(e instanceof Error ? e.message : String(e));
    }
  };
  const salvar = async () => {
    if (!completo || conferencia?.estado !== 'pronta') return;
    setConferencia({ ...conferencia, salvando: true });
    try {
      const r = await salvarConfiguracao(completo);
      if ('conferencia' in r) return setConferencia({ estado: 'pronta', r: r.conferencia });
      setSecao(r.pracas);
      setRascunho(r.pracas.proposta);
      setConferencia(null);
      setEditando(null);
      setNova(null);
      if (novas.length) setN8nPendente((p) => [...new Set([...p, ...novas])]);
      avisar('Salvo. Já vale.');
    } catch (e) {
      setConferencia({ ...conferencia, salvando: false });
      avisar(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className={`pagina configuracao ${celular ? 'no-celular' : ''}`}>
      <header className="cad-topo">
        <button className="voltar-cad" onClick={voltar}>
          <Icone nome="voltar" tam={16} /> Fila
        </button>
        <Marca />
        <span />
      </header>
      <main className="cfg">
        <div className="cfg-cabeca">
          <h1>Configuração</h1>
          <span className="cfg-so-admin">
            <Icone nome="cadeado" tam={13} /> administradores
          </span>
        </div>
        {celular && <p className="cfg-so-consulta">No celular, só consulta. Mudar é no computador.</p>}
        {falha ? (
          <p className="cfg-falha" role="alert">
            {falha} <button className="botao-texto" onClick={carregar}>Tentar de novo</button>
          </p>
        ) : !secao || !rascunho || !completo ? (
          <p className="cfg-lendo">Lendo o quadro do Trello…</p>
        ) : (
          <SecaoDasPracas
            secao={secao}
            rascunho={completo}
            salvas={rascunho.pracas}
            nova={nova}
            novaPraca={() => setNova(NOVA_VAZIA)}
            mudarNova={mudarNova}
            desistirDaNova={desistirDaNova}
            n8n={[...new Set([...n8nPendente, ...novas])].filter(Boolean)}
            estado={estado}
            quadro={quadro}
            podeMudar={podeMudar}
            verTudo={verTudo}
            alternarVerTudo={() => setVerTudo((v) => !v)}
            editando={editando}
            editar={setEditando}
            mudarPraca={mudarPraca}
            tornarPadrao={tornarPadrao}
            mover={mover}
            escolher={setEscolha}
            desfazer={desfazer}
          />
        )}
      </main>

      {podeMudar && nMudancas > 0 && !conferencia && (
        <div className="cfg-barra" role="region" aria-label="Mudanças">
          <span className="cfg-barra-n">{plural(nMudancas, 'mudança', 'mudanças')}</span>
          <button
            type="button"
            className="cfg-barra-descartar"
            onClick={() => {
              setRascunho(secao?.proposta ?? null);
              setEditando(null);
              setNova(null);
            }}
          >
            Descartar
          </button>
          <button type="button" className="cfg-barra-salvar" onClick={() => void conferir()}>
            Conferir e salvar
          </button>
        </div>
      )}
      {escolha && quadro && completo && <Escolher escolha={escolha} quadro={quadro} rascunho={completo} estado={estado} ligar={(id) => ligar(escolha, id)} fechar={fecharEscolha} />}
      {conferencia && <DialogoDeConferir conferencia={conferencia} novas={novas} voltar={() => setConferencia(null)} salvar={() => void salvar()} />}
    </div>
  );
}

/* ---------- a seção Praças ---------- */

interface PropsDaSecao {
  secao: SecaoPracas;
  /** o rascunho inteiro, com a praça nova */
  rascunho: LigacoesDasPracas;
  /** as praças que já existem (sem a nova): as que se arrastam e se editam */
  salvas: Praca[];
  nova: Nova | null;
  novaPraca: () => void;
  mudarNova: (m: Partial<Nova>) => void;
  desistirDaNova: () => void;
  /** as siglas que o n8n ainda não conhece: a praça nova e as salvas agora */
  n8n: string[];
  estado: ReturnType<typeof estadoDasPracas> | null;
  quadro: QuadroLido | null;
  podeMudar: boolean;
  verTudo: boolean;
  alternarVerTudo: () => void;
  editando: string | null;
  editar: (sigla: string | null) => void;
  mudarPraca: (sigla: string, m: Partial<Praca>) => void;
  tornarPadrao: (sigla: string) => void;
  mover: (de: number, para: number) => void;
  escolher: (e: Escolha) => void;
  desfazer: (chaves: string[]) => void;
}

const AJUDA_DAS_PRACAS =
  'O PROMeiro liga pelo nome a entrada de cada praça (a sigla ou uma palavra da regra + ENTRADA), a saída (+ SAÍDA, ENTREGUE ou PRONTO) e a opção no campo Praça. Aqui só aparece o que precisa de você. A ordem decide quando duas regras batem; a padrão vale quando a claquete não diz a praça.';

function SecaoDasPracas(props: PropsDaSecao) {
  const { secao, rascunho, estado, podeMudar, verTudo, alternarVerTudo } = props;
  const temProblema = !!estado?.excecoes.length;
  return (
    <section className="cfg-secao" aria-labelledby="cfg-pracas">
      <header className="cfg-secao-topo">
        <h2 id="cfg-pracas">Praças</h2>
        <Ajuda texto={AJUDA_DAS_PRACAS} />
        <span className={`cfg-estado ${secao.erro ? 'falta' : temProblema ? 'tem' : 'ok'}`}>{estado?.resumo ?? `${plural(rascunho.pracas.length, 'praça', 'praças')} · sem o quadro do Trello`}</span>
        <span className="espaco" />
        {estado && (
          <button type="button" className="cfg-ver-tudo" aria-expanded={verTudo} onClick={alternarVerTudo}>
            {verTudo ? 'esconder' : 'ver tudo'} <Icone nome="baixo" tam={13} style={{ transform: verTudo ? 'rotate(180deg)' : undefined }} />
          </button>
        )}
      </header>
      <div className="cfg-secao-corpo">
        {secao.erro && <p className="cfg-falha">{secao.erro}</p>}
        {estado && estado.excecoes.length > 0 && <Excecoes {...props} estado={estado} />}
        <ListaDasPracas {...props} podeMudar={podeMudar} />
        {props.n8n.length > 0 && <AvisoDoN8n siglas={props.n8n} />}
        {podeMudar && !props.nova && (
          <div className="cfg-mais">
            <button type="button" className="botao-texto" onClick={props.novaPraca}>
              + Nova praça
            </button>
          </div>
        )}
        {verTudo && estado && <TudoDasPracas {...props} estado={estado} />}
      </div>
    </section>
  );
}

/** A praça nova ainda não está nos fluxos do n8n (eles têm as praças escritas dentro). */
function AvisoDoN8n({ siglas }: { siglas: string[] }) {
  return (
    <div className="cfg-exc problema cfg-n8n" role="note">
      <span className="cfg-exc-ico" aria-hidden>
        <Icone nome="atencao" tam={14} traco={2.2} />
      </span>
      <span className="cfg-exc-texto">
        <strong>O n8n ainda não conhece {siglas.join(' e ')}</strong>
        <span>ajustar: {FLUXOS_DO_N8N.join(' · ')}</span>
      </span>
    </div>
  );
}

/** Fecha o balão no clique fora dele e no Esc. */
function useFecharFora(caixa: RefObject<HTMLElement | null>, aberto: boolean, fechar: () => void) {
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && fechar();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    window.addEventListener('pointerdown', fora, true);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('keydown', tecla);
    };
  }, [caixa, aberto, fechar]);
}

/** O "?" de cada seção: a explicação fica aqui, não na tela. */
function Ajuda({ texto }: { texto: string }) {
  const [aberta, setAberta] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  const fechar = useCallback(() => setAberta(false), []);
  useFecharFora(caixa, aberta, fechar);
  return (
    <span className="cfg-ajuda" ref={caixa}>
      <button type="button" aria-label="O que é isto?" aria-expanded={aberta} onClick={() => setAberta((v) => !v)}>
        ?
      </button>
      {aberta && (
        <span className="cfg-ajuda-texto" role="note">
          {texto}
        </span>
      )}
    </span>
  );
}

/* ---------- as exceções ---------- */

const nomeDaLigacao = (l: Ligacao) => (l.nome ? `"${l.nome}"` : '');
function tituloDaExcecao(sigla: string, ponta: Ponta | 'campo', l: Ligacao): { titulo: string; detalhe: string } {
  if (ponta === 'campo') {
    if (l.problema === 'dobro') return { titulo: 'Dois campos "Praça"', detalhe: 'Qual vale?' };
    if (l.problema === 'nenhum') return { titulo: 'Sem o campo Praça', detalhe: 'nenhum campo de lista "Praça" no quadro' };
    if (l.problema === 'tipo') return { titulo: 'O campo Praça não é de lista', detalhe: `${nomeDaLigacao(l)} é de outro tipo` };
    if (l.problema === 'sumiu') return { titulo: 'O campo Praça sumiu', detalhe: 'não está mais no quadro' };
    return { titulo: `Campo Praça: ${l.nome}`, detalhe: 'ligado à mão' };
  }
  const oQue = ponta === 'opcao' ? 'opção no campo Praça' : `lista de ${NOME_DA_PONTA[ponta]}`;
  if (l.problema === 'dobro') return { titulo: `${sigla}: ${ponta === 'opcao' ? 'duas opções' : `duas listas de ${NOME_DA_PONTA[ponta]}`}`, detalhe: 'Qual vale?' };
  if (l.problema === 'nenhum') return { titulo: `${sigla}: sem ${oQue}`, detalhe: 'não achei pelo nome' };
  if (l.problema === 'sumiu') return { titulo: `${sigla}: a ${oQue} sumiu`, detalhe: 'não está mais no quadro' };
  if (l.problema === 'arquivada') return { titulo: `${sigla}: a ${NOME_DA_PONTA[ponta]} está arquivada`, detalhe: `${nomeDaLigacao(l)} está arquivada no Trello` };
  return { titulo: `${sigla} usa ${nomeDaLigacao(l)} na ${NOME_DA_PONTA[ponta]}`, detalhe: ['ligada à mão', l.divididaCom && `dividida com ${l.divididaCom}`].filter(Boolean).join(' · ') };
}

function Excecoes({ estado, rascunho, podeMudar, escolher, desfazer, quadro }: PropsDaSecao & { estado: NonNullable<PropsDaSecao['estado']> }) {
  const cartoes: ReactNode[] = [];
  const nomesDoDobro = (l: Ligacao, ponta: Ponta | 'campo') => {
    const nomes = l.candidatos.map((id) => (ponta === 'opcao' ? quadro?.campos.find((c) => c.id === rascunho.campoPraca)?.opcoes.find((o) => o.id === id)?.nome : ponta === 'campo' ? quadro?.campos.find((c) => c.id === id)?.nome : quadro?.listas.find((x) => x.id === id)?.nome) ?? id);
    return nomes.map((n) => `"${n}"`).join(' e ') + '. Qual vale?';
  };
  const cartao = (chave: string, sigla: string, ponta: Ponta | 'campo', l: Ligacao, mao: string[] | null, texto?: { titulo: string; detalhe: string }) => {
    const t = texto ?? tituloDaExcecao(sigla, ponta, l);
    const detalhe = l.problema === 'dobro' ? nomesDoDobro(l, ponta) : t.detalhe;
    cartoes.push(
      <li key={chave} className={`cfg-exc ${mao ? 'mao' : 'problema'}`} data-chave={chave}>
        <span className="cfg-exc-ico" aria-hidden>
          <Icone nome={mao ? 'mao' : l.problema === 'dobro' ? 'duplicar' : 'atencao'} tam={14} traco={2.2} />
        </span>
        <span className="cfg-exc-texto">
          <strong>{t.titulo}</strong>
          <span>{detalhe}</span>
        </span>
        {podeMudar &&
          (mao ? (
            <button type="button" className="botao-texto" onClick={() => desfazer(mao)}>
              desfazer
            </button>
          ) : (
            <button type="button" className="botao" onClick={(e) => escolher({ chave, sigla, ponta, ancora: e.currentTarget.getBoundingClientRect() })}>
              Escolher
            </button>
          ))}
      </li>,
    );
  };
  const exc = new Set(estado.excecoes.map((l) => l.chave));
  if (exc.has(CHAVE_DO_CAMPO)) cartao(CHAVE_DO_CAMPO, '', 'campo', estado.campo, estado.campo.problema ? null : [CHAVE_DO_CAMPO]);
  for (const p of estado.pracas) {
    // a praça que usa as duas listas de outra, à mão: um cartão só ("G5 usa as listas do RJ")
    const { entrada: e, saida: s } = p;
    const juntas = exc.has(e.chave) && exc.has(s.chave) && !e.problema && !s.problema && e.como === 'mao' && s.como === 'mao' && e.divididaCom && e.divididaCom === s.divididaCom;
    if (juntas) cartao(`${p.sigla}.listas`, p.sigla, 'entrada', e, [e.chave, s.chave], { titulo: `${p.sigla} usa as listas do ${e.divididaCom}`, detalhe: `ligada à mão · dividida com ${e.divididaCom}` });
    for (const ponta of PONTAS) {
      const l = p[ponta];
      if (!exc.has(l.chave) || (juntas && ponta !== 'opcao')) continue;
      cartao(l.chave, p.sigla, ponta, l, l.problema ? null : [l.chave]);
    }
  }
  return <ul className="cfg-excecoes">{cartoes}</ul>;
}

/* ---------- as praças, com as regras sempre à mostra ---------- */

function ListaDasPracas({ rascunho, salvas, nova, mudarNova, desistirDaNova, estado, podeMudar, editando, editar, mudarPraca, tornarPadrao, mover }: PropsDaSecao) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const pracas = salvas;
  // o exemplo de cada praça é reconhecido com todas, a nova junto
  const todas = rascunho.pracas;
  const dica =
    arrastando !== null && sobre !== null && sobre !== arrastando
      ? `soltando aqui, ${pracas[arrastando].sigla} passa a valer ${sobre < arrastando ? `antes de ${pracas[sobre].sigla}` : `depois de ${pracas[sobre].sigla}`}`
      : '';
  return (
    <>
      <ol className="cfg-pracas" aria-label="Praças, na ordem em que as regras valem">
        {pracas.map((p, i) => {
          const ex = exemploDa(p);
          const daLinha = estado?.pracas.find((x) => x.sigla === p.sigla);
          const aMao = daLinha && [daLinha.entrada, daLinha.saida, daLinha.opcao].some((l) => l.como === 'mao');
          const aberta = editando === p.sigla && podeMudar;
          return (
            <li
              key={p.sigla}
              className={`cfg-praca ${arrastando === i ? 'arrastando' : ''} ${sobre === i && arrastando !== null && arrastando !== i ? 'alvo' : ''} ${aberta ? 'aberta' : ''}`}
              data-sigla={p.sigla}
              draggable={podeMudar}
              onDragStart={(e) => {
                setArrastando(i);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', p.sigla);
              }}
              onDragOver={(e) => {
                if (arrastando === null) return;
                e.preventDefault();
                setSobre(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (arrastando !== null) mover(arrastando, i);
                setArrastando(null);
                setSobre(null);
              }}
              onDragEnd={() => {
                setArrastando(null);
                setSobre(null);
              }}
            >
              <div className="cfg-praca-linha">
                {podeMudar && (
                  <button
                    type="button"
                    className="cfg-alca"
                    title="Arraste para mudar a ordem (ou use as setas)"
                    aria-label={`Mover ${p.sigla} (setas para cima e para baixo)`}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        mover(i, i + (e.key === 'ArrowUp' ? -1 : 1));
                      }
                    }}
                  >
                    <Icone nome="alca" tam={14} traco={3} />
                  </button>
                )}
                <span className="cfg-sigla">{p.sigla}</span>
                <span className="cfg-regra">
                  {p.padrao && !p.regra ? (
                    <span className="cfg-regra-padrao">quando a claquete não diz</span>
                  ) : (
                    <Editavel podeMudar={podeMudar} abrir={() => editar(aberta ? null : p.sigla)} classe="regra">
                      {p.regra ? (
                        <>
                          {p.regra.onde === 'fim' ? 'termina em' : 'começa com'}{' '}
                          {p.regra.palavras.map((w, k) => (
                            <span key={w}>
                              {k > 0 && ' ou '}
                              <code>{w}</code>
                            </span>
                          ))}
                        </>
                      ) : (
                        'sem regra'
                      )}
                    </Editavel>
                  )}
                  {p.tambem.length > 0 && (
                    <Editavel podeMudar={podeMudar} abrir={() => editar(aberta ? null : p.sigla)} classe="tambem">
                      também <code>{p.tambem.join(' ')}</code>
                    </Editavel>
                  )}
                  <span className="cfg-exemplo">
                    {ex} → <b>{reconhecerPraca(ex, todas)}</b>
                  </span>
                </span>
                <span className="cfg-marcas">
                  {p.padrao && (
                    <span className="cfg-marca padrao">
                      <Icone nome="estrela" tam={11} traco={2.2} /> padrão
                    </span>
                  )}
                  {aMao && <span className="cfg-marca mao">à mão</span>}
                  {podeMudar && p.padrao && !p.regra && (
                    <button type="button" className="botao-texto cfg-editar" onClick={() => editar(aberta ? null : p.sigla)}>
                      regra
                    </button>
                  )}
                </span>
              </div>
              {aberta && <EditorDaRegra praca={p} mudar={(m) => mudarPraca(p.sigla, m)} tornarPadrao={() => tornarPadrao(p.sigla)} fechar={() => editar(null)} />}
            </li>
          );
        })}
        {nova && podeMudar && <LinhaDaNova nova={nova} todas={todas} mudar={mudarNova} desistir={desistirDaNova} />}
      </ol>
      {dica && <p className="cfg-dica-ordem">{dica}</p>}
    </>
  );
}

/** A linha da praça nova: a sigla, a regra (termina em / começa com e as palavras) e o exemplo; embaixo, o nome e o
    "também lida como". */
function LinhaDaNova({ nova, todas, mudar, desistir }: { nova: Nova; todas: Praca[]; mudar: (m: Partial<Nova>) => void; desistir: () => void }) {
  const p = pracaDaNova(nova);
  const ex = p.regra ? exemploDa(p) : 'FESTA 3/11 …';
  return (
    <li className="cfg-praca nova aberta" data-sigla="nova">
      <div className="cfg-praca-linha">
        <span className="cfg-alca" aria-hidden>
          <Icone nome="alca" tam={14} traco={3} />
        </span>
        <input className="cfg-sigla-nova" autoFocus value={nova.sigla} placeholder="sigla" maxLength={8} aria-label="Sigla da praça nova" onChange={(e) => mudar({ sigla: siglaDoTexto(e.target.value) })} />
        <span className="cfg-regra">
          <span className="cfg-editor-onde" role="radiogroup" aria-label="Onde a praça aparece">
            {(
              [
                ['fim', 'termina em'],
                ['comeco', 'começa com'],
              ] as const
            ).map(([v, rotulo]) => (
              <button key={v} type="button" role="radio" aria-checked={nova.onde === v} onClick={() => mudar({ onde: v })}>
                {rotulo}
              </button>
            ))}
          </span>
          <input className="cfg-palavras-nova" value={nova.palavras} placeholder="palavras" aria-label="Palavras da regra" onChange={(e) => mudar({ palavras: e.target.value })} />
          <span className="cfg-exemplo">
            {ex} → <b>{nova.sigla && p.regra ? reconhecerPraca(ex, todas) : '?'}</b>
          </span>
        </span>
        <span className="cfg-marcas">
          <button type="button" className="botao-texto" onClick={desistir}>
            desistir
          </button>
        </span>
      </div>
      <div className="cfg-editor" role="group" aria-label="A praça nova">
        <label className="cfg-editor-campo">
          <span>nome</span>
          <input className="cfg-nome-nova" value={nova.nome} placeholder={nova.sigla || 'Minas Gerais'} onChange={(e) => mudar({ nome: e.target.value })} aria-label="Nome da praça nova" />
        </label>
        <label className="cfg-editor-campo">
          <span>também lida como</span>
          <input value={nova.tambem} placeholder="nenhuma" onChange={(e) => mudar({ tambem: e.target.value })} aria-label="Também lida como (praça nova)" />
        </label>
      </div>
    </li>
  );
}

function Editavel({ podeMudar, abrir, classe, children }: { podeMudar: boolean; abrir: () => void; classe: string; children: ReactNode }) {
  return podeMudar ? (
    <button type="button" className={`cfg-ed ${classe}`} onClick={abrir}>
      {children}
    </button>
  ) : (
    <span className={`cfg-ed ${classe}`}>{children}</span>
  );
}

/** A regra da praça, editável: termina em / começa com / sem regra, as palavras, o "também lida como" e a padrão. */
function EditorDaRegra({ praca, mudar, tornarPadrao, fechar }: { praca: Praca; mudar: (m: Partial<Praca>) => void; tornarPadrao: () => void; fechar: () => void }) {
  const [palavras, setPalavras] = useState(praca.regra?.palavras.join(' ') ?? '');
  const [tambem, setTambem] = useState(praca.tambem.join(' '));
  const [onde, setOnde] = useState<RegraDaPraca['onde'] | 'nenhuma'>(praca.regra?.onde ?? 'nenhuma');
  const aplicar = (o: typeof onde, w: string) => {
    const lista = palavrasDoTexto(w);
    mudar({ regra: o === 'nenhuma' || !lista.length ? null : { onde: o, palavras: lista } });
  };
  return (
    <div className="cfg-editor" role="group" aria-label={`Regra de ${praca.sigla}`}>
      <div className="cfg-editor-onde" role="radiogroup" aria-label="Onde a praça aparece">
        {(
          [
            ['fim', 'termina em'],
            ['comeco', 'começa com'],
            ['nenhuma', 'sem regra'],
          ] as const
        ).map(([v, rotulo]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={onde === v}
            onClick={() => {
              setOnde(v);
              aplicar(v, palavras || praca.sigla);
              if (v !== 'nenhuma' && !palavras) setPalavras(praca.sigla);
            }}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {onde !== 'nenhuma' && (
        <label className="cfg-editor-campo">
          <span>palavras</span>
          <input
            value={palavras}
            placeholder={praca.sigla}
            onChange={(e) => {
              setPalavras(e.target.value);
              aplicar(onde, e.target.value);
            }}
            aria-label="Palavras da regra"
          />
        </label>
      )}
      <label className="cfg-editor-campo">
        <span>também lida como</span>
        <input
          value={tambem}
          placeholder="nenhuma"
          onChange={(e) => {
            setTambem(e.target.value);
            mudar({ tambem: palavrasDoTexto(e.target.value) });
          }}
          aria-label="Também lida como"
        />
      </label>
      <span className="espaco" />
      {!praca.padrao && (
        <button type="button" className="botao-texto" onClick={tornarPadrao}>
          tornar padrão
        </button>
      )}
      <button type="button" className="botao" onClick={fechar}>
        Pronto
      </button>
    </div>
  );
}

/* ---------- ver tudo ---------- */

function TudoDasPracas({ estado, podeMudar, escolher }: PropsDaSecao & { estado: NonNullable<PropsDaSecao['estado']> }) {
  const linha = (rotulo: string, l: Ligacao, sigla: string, ponta: Ponta | 'campo') => (
    <div className="cfg-tudo-l" key={l.chave} data-chave={l.chave}>
      <span className="cfg-tudo-rotulo">{rotulo}</span>
      <span className="cfg-tudo-valor">{l.nome || '—'}</span>
      <span className={`cfg-tudo-como ${l.problema ? 'problema' : l.como === 'mao' ? 'mao' : ''}`}>
        {l.problema
          ? { nenhum: 'não achado', dobro: 'em dobro', sumiu: 'sumiu', arquivada: 'arquivada', tipo: 'tipo errado' }[l.problema]
          : l.como === 'mao'
            ? 'ligado à mão'
            : l.como === 'criar'
              ? 'o PROMeiro cria ao salvar'
              : 'achado pelo nome'}
        {l.divididaCom && ` · dividida com ${l.divididaCom}`}
        {podeMudar && (
          <>
            {' · '}
            <button type="button" className="botao-texto" onClick={(e) => escolher({ chave: l.chave, sigla, ponta, ancora: e.currentTarget.getBoundingClientRect() })}>
              trocar
            </button>
          </>
        )}
      </span>
    </div>
  );
  return (
    <div className="cfg-tudo" aria-label="Tudo o que está ligado">
      {linha('Campo Praça', estado.campo, '', 'campo')}
      {estado.pracas.map((p) => (
        <div className="cfg-tudo-praca" key={p.sigla}>
          <h3>{p.sigla}</h3>
          {linha('Entrada', p.entrada, p.sigla, 'entrada')}
          {linha('Saída', p.saida, p.sigla, 'saida')}
          {linha('No campo Praça', p.opcao, p.sigla, 'opcao')}
        </div>
      ))}
    </div>
  );
}

/* ---------- escolher à mão ---------- */

function Escolher({ escolha, quadro, rascunho, estado, ligar, fechar }: { escolha: Escolha; quadro: QuadroLido; rascunho: LigacoesDasPracas; estado: PropsDaSecao['estado']; ligar: (id: string) => void; fechar: () => void }) {
  const [busca, setBusca] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  useFecharFora(caixa, true, fechar);
  const ligacao = [estado?.campo, ...(estado?.pracas.flatMap((p) => [p.entrada, p.saida, p.opcao]) ?? [])].find((l) => l?.chave === escolha.chave);
  const candidatos = new Set(ligacao?.candidatos ?? []);
  const atual = ligacao?.id ?? '';
  // o que cada lista já é: "é a entrada de SP"
  const usoDa = (id: string) =>
    rascunho.pracas.flatMap((p) => (['entrada', 'saida'] as const).filter((x) => p[x] === id && !(p.sigla === escolha.sigla && x === escolha.ponta)).map((x) => `é a ${NOME_DA_PONTA[x]} de ${p.sigla}`))[0] ?? '';
  const titulo = escolha.ponta === 'campo' ? 'Campo Praça' : escolha.ponta === 'opcao' ? `Opção de ${escolha.sigla} no campo Praça` : `${escolha.ponta === 'entrada' ? 'Entrada' : 'Saída'} de ${escolha.sigla}`;
  const opcoes =
    escolha.ponta === 'campo'
      ? quadro.campos.map((c) => ({ id: c.id, nome: c.nome, nota: c.tipo === CAMPO_PRACA.tipo ? 'campo de lista' : 'não é de lista', desligada: c.tipo !== CAMPO_PRACA.tipo }))
      : escolha.ponta === 'opcao'
        ? (quadro.campos.find((c) => c.id === rascunho.campoPraca)?.opcoes ?? []).map((o) => ({ id: o.id, nome: o.nome, nota: '', desligada: false }))
        : quadro.listas.filter((l) => !l.arquivada).map((l) => ({ id: l.id, nome: l.nome, nota: usoDa(l.id), desligada: false }));
  const termo = busca.trim().toLowerCase();
  const vistas = opcoes
    .filter((o) => !termo || o.nome.toLowerCase().includes(termo))
    .sort((a, b) => Number(candidatos.has(b.id)) - Number(candidatos.has(a.id)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const largura = 360;
  const left = Math.max(12, Math.min(escolha.ancora.right - largura, window.innerWidth - largura - 12));
  const top = escolha.ancora.bottom + 6;
  // no corpo da página (fora da seção), na altura do botão que abriu
  return createPortal(
    <div className="cfg-escolher" ref={caixa} role="dialog" aria-label={titulo} style={{ left, top: top + window.scrollY, width: largura }}>
      <label className="cfg-escolher-busca">
        <Icone nome="lupa" tam={15} />
        <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" aria-label="Buscar" />
      </label>
      <div className="cfg-escolher-titulo">{titulo}</div>
      <ul>
        {vistas.map((o) => (
          <li key={o.id}>
            <button type="button" disabled={o.desligada} aria-current={o.id === atual || undefined} onClick={() => ligar(o.id)}>
              <span className="n">{o.nome}</span>
              {o.nota && <span className="nota">{o.nota}</span>}
            </button>
          </li>
        ))}
        {!vistas.length && <li className="cfg-escolher-vazio">Nada com esse nome.</li>}
      </ul>
    </div>,
    document.body,
  );
}

/* ---------- conferir e salvar ---------- */

function DialogoDeConferir({
  conferencia,
  novas,
  voltar,
  salvar,
}: {
  conferencia: { estado: 'conferindo' } | { estado: 'pronta'; r: ConferenciaDasPracas; salvando?: boolean };
  novas: string[];
  voltar: () => void;
  salvar: () => void;
}) {
  useEffect(() => {
    const salvando = conferencia.estado === 'pronta' && conferencia.salvando;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !salvando && voltar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [voltar, conferencia]);
  const r = conferencia.estado === 'pronta' ? conferencia.r : null;
  return (
    <div className="cfg-veu">
      <div className="cfg-modal" role="dialog" aria-modal="true" aria-labelledby="cfg-conferir-titulo">
        <div className="cfg-modal-corpo">
          <span className="cfg-modal-rotulo">Conferir</span>
          <h2 id="cfg-conferir-titulo">{!r ? 'Conferindo…' : r.ok ? 'Tudo confere' : 'Não dá para salvar'}</h2>
          {r && (
            <ul className="cfg-checks">
              {r.itens.map((i, k) => (
                  <li key={k} className={i.tipo}>
                    <span className="ico" aria-hidden>
                      <Icone nome={i.tipo === 'erro' ? 'fechar' : i.tipo === 'aviso' ? 'atencao' : 'certo'} tam={12} traco={2.6} />
                    </span>
                    <span>
                      <strong>{i.titulo}</strong>
                      <small>{i.detalhe}</small>
                    </span>
                  </li>
                ))}
            </ul>
          )}
          {r && r.claquetes && r.claquetes.mudam.length > 0 && (
            <>
              <h3 className="cfg-modal-rotulo">Claquetes que mudam de praça</h3>
              <ul className="cfg-claquetes">
                {r.claquetes.mudam.slice(0, 5).map((c) => (
                  <li key={c.claquete}>
                    <code>{c.claquete}</code>
                    <span>
                      {c.antes} → <b>{c.depois}</b>
                    </span>
                  </li>
                ))}
                {r.claquetes.mudam.length > 5 && <li className="mais">e mais {r.claquetes.mudam.length - 5}</li>}
              </ul>
            </>
          )}
          {r && r.ok && r.muda.length > 0 && (
            <>
              <h3 className="cfg-modal-rotulo">O que muda</h3>
              <table className="cfg-muda">
                <tbody>
                  {r.muda.map((m, k) => (
                    <tr key={k}>
                      <th scope="row">{m.oque}</th>
                      <td className="antes">{m.antes}</td>
                      <td className="seta" aria-hidden>
                        <Icone nome="seta" tam={14} />
                      </td>
                      <td className="depois">{m.depois}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {r && r.ok && novas.length > 0 && (
            <p className="cfg-alerta" role="note">
              <b>O n8n ainda não conhece {novas.join(' e ')}.</b> Ajustar: {FLUXOS_DO_N8N.join(', ')}.
            </p>
          )}
        </div>
        <footer>
          <span className="espaco" />
          <button type="button" className="botao" onClick={voltar}>
            Voltar
          </button>
          <button type="button" className="botao primario" disabled={!r?.ok || (conferencia.estado === 'pronta' && conferencia.salvando)} onClick={salvar}>
            {conferencia.estado === 'pronta' && conferencia.salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
