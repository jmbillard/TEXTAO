import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { desfazerAPublicacao, devolverADemanda, escalarNoDia, gravarRascunhoDoDia, jaDistribuida, juntarParaDistribuir, lerRascunhoDoDia, levarParaAPosicao, marcarAusencia, marcarPendencia, moverADemanda, publicarODia, repetirAEscala } from '../dados/armazenamento';
import { iniciais } from '../dados/colaboracao';
import { demandaNoPadrao, horarioEntendido, horarioNoPadrao, lerDemanda, lerHorario, situacaoNoDia, type DiaDaEscala, type PosicaoDaEscala, type SituacaoNoDia, type TurnoDaEscala } from '../modelo/escala';
import { nomeComparavel } from '../modelo/ligarPeloNome';
import { acrescentarDemanda, escalarNa, moverDemanda, semEscala, tirarDemanda } from '../modelo/distribuir';
import type { DemandaParaDistribuir } from '../modelo/ausencias';
import { useArrastar, type ItemArrastado, type LugarDeSoltar } from './arrastar';
import { Alca, EscolherDestino, ParaDistribuir, SemEscala, type Arraste, type Destino } from './ColunaDaPauta';
import { diaEmSaoPaulo, diaVizinho } from '../modelo/pauta';
import { CampoDaIlha } from './CampoDaIlha';
import type { Ilha } from '../modelo/ilhas';
import { Icone } from './icones';
import { Marca } from './pecas';
import { ConferirODia, DiaPublicado, FaixaDaPublicacao } from './ConferirPauta';
import { AusenciasDoDia } from './AusenciasDaPauta';
import { ColarDaPlanilha, type ColadoParaAplicar } from './ColarDaPlanilha';
import { LadoALado } from './LadoALado';
import { DiaVazio, textoDoRepetido } from './DiaVazio';
import type { DeOndeRepetir } from '../modelo/repetir';
import { DIAS_DA_SEMANA, MESES, partes } from './pecasDaPauta';
import { campoDoElemento, MarcasDosOutros, QuemMaisEsta, useSalaDoDia } from './JuntosNoDia';
import { juntarODia } from '../modelo/juntarODia';
import type { Pessoa } from '../modelo/tipos';
import './pauta.css';
import './montarPauta.css';

/* Montar a pauta (#123): a tela em que a coordenação monta o rascunho do dia, numa grade parecida com a planilha
   (a alternativa A do protótipo aprovado). Abas com os dias da semana, cada uma com o estado do dia (vazio ou
   rascunho); um bloco por turno; em cada posição, o editor (da lista dos cadastrados, com a situação de cada um no dia),
   o horário (escrito de qualquer jeito, gravado no padrão) e as demandas, texto livre: cada linha mostra na hora o que o
   PROMeiro entendeu (a atração, a data, as versões como etiquetas e, discretamente, a grafia no padrão). Tudo pelo
   teclado: Tab, Enter cria uma linha, as setas andam entre as linhas, Backspace na linha vazia apaga. O rascunho é
   gravado sozinho no SQLite do PROMeiro, só a coordenação vê; nada vai ao Teable.
   Conferir e publicar (#127): "Conferir e publicar" leva à conferência (ConferirPauta.tsx), em que cada pendência tem
   o "Corrigir", que volta à grade com o foco no campo, e o "está certo"; publicar mostra a tela "publicada". Na grade,
   a faixa da publicação diz se o dia está publicado ou alterado, com o Desfazer e o histórico.
   Os avisos e o recado do dia (#125): cada posição tem os seus avisos (⚑), linhas à parte das demandas, abertas pelo
   "+ aviso" (Enter cria outra, Backspace na vazia apaga); o recado do dia, para todos, fica num campo próprio, acima da
   grade. Os dois são gravados com o rascunho e, publicados, aparecem na Pauta como os avisos de hoje.
   A coluna lateral (#126, a alternativa B do protótipo): ao lado da grade (em cima, no tablet em pé; embaixo, no
   celular), as caixas "Para distribuir" (escrever ou colar as claquetes), "Sem escala" (quem não está em nenhuma
   posição nem fora) e "Fora" (as ausências do dia). Arrasta-se a claquete da lista para uma posição, a demanda de uma
   posição para outra (ou de volta para a lista) e a pessoa para uma posição ou para um turno (uma posição nova); no
   celular e pelo teclado, o "Mover para…" e o "Escalar na…". Cada uma dessas ações vai ao servidor, que grava o dia;
   a tela já mostra o resultado antes da resposta e fica com o que o servidor gravou.
   Colar da planilha (#130): o "⎘ Colar da planilha" abre o diálogo (ColarDaPlanilha.tsx); aplicar troca (ou junta)
   as posições do rascunho, grava, marca as ausências lidas e lê o dia de novo.

   O dia vazio (#129, DiaVazio.tsx) oferece Repetir a escala de outro dia, Colar da planilha (o mesmo diálogo) ou Começar do
   zero; a posição que o Repetir deixou vaga diz o motivo, até ganhar editor.
   A semana lado a lado (#133, LadoALado.tsx): acima da grade, as diferenças entre o dia montado e a foto da planilha.

   Duas pessoas ao mesmo tempo (#131, JuntosNoDia.tsx): a tela entra na sala do dia (a mesma sala de colaboração do
   editor de roteiros). No topo, quem mais está no dia; na grade, o campo em que a outra pessoa está, com a cor dela.
   Ninguém trava nada. A gravação leva a base (o dia como a tela o leu por último) e o servidor junta o que mudou
   desde ela com o que a outra gravou; o dia que volta (da gravação, de uma ação da coluna ou relido porque a sala
   avisou a versão nova) é juntado com o que está na tela (src/modelo/juntarODia.ts): o que a pessoa ainda está
   digitando fica, o que a outra fez aparece. A versão do dia só cresce: um dia lido antes de outro mais novo não volta
   a tela para trás. */

interface Props {
  /** o dia (AAAA-MM-DD); '' é amanhã */
  dia: string;
  irPara: (dia: string) => void;
  voltar: () => void;
  /** quem está na tela, para a sala do dia (#131) */
  pessoa?: Pessoa;
}

const GRAVAR_DEPOIS_MS = 600;
const novoId = (prefixo: string) => `${prefixo}-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24)}`;
const linhaVazia = () => ({ id: novoId('d'), texto: '' });
const avisoVazio = () => ({ id: novoId('a'), texto: '' });
/** Toda posição mostra ao menos uma linha de demanda, para digitar; a vazia não é gravada. */
const comLinha = (p: PosicaoDaEscala): PosicaoDaEscala => (p.demandas.length ? p : { ...p, demandas: [linhaVazia()] });

/** "sexta, 27 de novembro". */
function diaEscrito(iso: string) {
  const p = partes(iso);
  const semana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][p.semana];
  return `${semana}, ${p.dia} de ${MESES[p.mes]}`;
}
/** "hoje", "amanhã", "ontem" ou ''. */
function perto(iso: string, hoje: string) {
  return iso === hoje ? 'hoje' : iso === diaVizinho(hoje, 1) ? 'amanhã' : iso === diaVizinho(hoje, -1) ? 'ontem' : '';
}
const minutosEscritos = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;
const nomeDoTurno = (turnos: readonly TurnoDaEscala[], id: string) => turnos.find((t) => t.id === id)?.nome.toLowerCase() ?? id;
const textoDaSituacao = (s: SituacaoNoDia, turnos: readonly TurnoDaEscala[]) => (s.tipo === 'livre' ? 'livre' : `já na ${s.turnos.map((t) => nomeDoTurno(turnos, t)).join(' e na ')}`);

/** Onde o foco vai depois de desenhar: um campo de uma posição (e, nas demandas, a linha). */
type Foco = { posicao: string; campo: 'editor' | 'ilha' | 'horario' | 'demanda' | 'aviso'; demanda?: string; aviso?: string; fim?: boolean } | null;

/** O dia como a tela o leu por último do servidor (#131): a base da gravação seguinte e a versão dele. */
type BaseDoDia = { dia: string; posicoes: PosicaoDaEscala[]; recado: string; versao: number };

export function MontarPauta({ dia, irPara, voltar, pessoa }: Props) {
  const [hoje] = useState(() => diaEmSaoPaulo());
  const [dados, setDados] = useState<DiaDaEscala | null>(null);
  const [posicoes, setPosicoes] = useState<PosicaoDaEscala[]>([]);
  // o recado do dia (#125); os dois refs são o que há de mais novo, para a gravação levar os dois juntos
  const [recado, setRecado] = useState('');
  const posicoesAgora = useRef<PosicaoDaEscala[]>([]);
  const recadoAgora = useRef('');
  const [falha, setFalha] = useState('');
  const [gravacao, setGravacao] = useState<'gravado' | 'esperando' | 'gravando' | 'erro'>('gravado');
  const [erroAoGravar, setErroAoGravar] = useState('');
  const [foco, setFoco] = useState<Foco>(null);
  const grade = useRef<HTMLDivElement>(null);
  // a tela: a grade, a conferência ou a pauta recém-publicada (#127)
  const [vista, setVista] = useState<'montar' | 'conferir' | 'publicada'>('montar');
  const [publicando, setPublicando] = useState(false);
  const [erroAoPublicar, setErroAoPublicar] = useState('');
  // a coluna lateral (#126): quem está fora (da caixa "Fora"), com o dia dessa leitura, e o erro da última ação dela
  const [fora, setFora] = useState<{ dia: string; nomes: string[] } | null>(null);
  const avisarFora = useCallback((dia: string, nomes: string[]) => setFora({ dia, nomes }), []);
  const [erroDaColuna, setErroDaColuna] = useState('');
  // colar da planilha (#130): o diálogo aberto, o que foi aplicado e a releitura da caixa "Fora" depois de marcar
  const [colando, setColando] = useState(false);
  const [colado, setColado] = useState('');
  const [leituraDoFora, setLeituraDoFora] = useState(0);
  // depois de Repetir (#129): o que veio e quem ficou de fora; sai ao trocar de dia
  const [repetido, setRepetido] = useState('');
  useEffect(() => setRepetido(''), [dia]);

  // o que falta gravar: o dia e as posições de agora (a gravação usa estes, não os da renderização velha)
  const pendente = useRef<{ dia: string; posicoes: PosicaoDaEscala[]; recado: string } | null>(null);
  const prazo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emCurso = useRef<Promise<void> | null>(null);
  const base = useRef<BaseDoDia | null>(null);
  const pagina = useRef<HTMLElement>(null);
  // a caixa "Fora" lê de novo quando a sala avisa que o dia mudou (#131)
  const [releitura, setReleitura] = useState(0);

  /**
   * O dia que voltou do servidor (#131), juntado com o que está na tela: o que mudou na tela desde a base fica, o resto
   * vem do servidor; o dia vira a nova base. O dia mais velho que a base não mexe nas posições.
   */
  const chegou = useCallback((d: DiaDaEscala) => {
    const b = base.current;
    if (!b || b.dia !== d.dia || (d.versao ?? 0) < b.versao) return false;
    const juntado = juntarODia(b, { posicoes: posicoesAgora.current, recado: recadoAgora.current }, { posicoes: d.posicoes, recado: d.recado ?? '' }, d.dia);
    base.current = { dia: d.dia, posicoes: d.posicoes, recado: d.recado ?? '', versao: d.versao ?? 0 };
    // a linha vazia da tela só fica onde não chegou nada, ou se a pessoa está nela
    const focada = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.demanda : undefined;
    const doServidor = new Set(d.posicoes.flatMap((p) => p.demandas.map((x) => x.id)));
    posicoesAgora.current = juntado.posicoes.map((p) => comLinha({ ...p, demandas: p.demandas.filter((x) => x.texto.trim() || doServidor.has(x.id) || x.id === focada) }));
    setPosicoes(posicoesAgora.current);
    recadoAgora.current = juntado.recado;
    setRecado(juntado.recado);
    setDados((x) => (x?.dia === d.dia ? { ...x, estado: d.estado, semana: d.semana, turnos: d.turnos, ocupadas: d.ocupadas, publicacao: d.publicacao, historico: d.historico, dispensadas: d.dispensadas, gravadoEm: d.gravadoEm, gravadoPor: d.gravadoPor, paraDistribuir: d.paraDistribuir, versao: d.versao } : x));
    return true;
  }, []);

  const gravarAgora = useCallback(async () => {
    if (prazo.current) clearTimeout(prazo.current);
    prazo.current = null;
    // uma gravação por vez: a seguinte espera a de agora e leva o que houver de mais novo
    while (emCurso.current) await emCurso.current;
    const p = pendente.current;
    if (!p) return;
    pendente.current = null;
    setGravacao('gravando');
    // a base e a tela vão juntas, as de agora: o dia que chegou depois de a mudança ficar pendente já está nas duas
    // (mandar a tela de antes com a base de agora desfaria o que a outra pessoa fez, #131)
    const b = base.current?.dia === p.dia ? base.current : null;
    emCurso.current = gravarRascunhoDoDia(p.dia, b ? posicoesAgora.current : p.posicoes, b ? recadoAgora.current : p.recado, b ? { posicoes: b.posicoes, recado: b.recado } : undefined)
      .then((d) => {
        // o dia gravado (com o que outra pessoa gravou nesse meio-tempo) juntado com o que está na tela: o que a pessoa
        // digitou depois de mandar fica (#131)
        if (!chegou(d)) setDados((antes) => (antes?.dia === d.dia ? { ...antes, estado: d.estado, semana: d.semana, gravadoEm: d.gravadoEm, gravadoPor: d.gravadoPor } : antes));
        setErroAoGravar('');
        setGravacao(pendente.current ? 'esperando' : 'gravado');
      })
      .catch((e) => {
        // não perde o que foi digitado: volta a ficar pendente, para a próxima mudança (ou o "tentar de novo")
        pendente.current ??= p;
        setErroAoGravar(e instanceof Error ? e.message : String(e));
        setGravacao('erro');
      })
      .finally(() => (emCurso.current = null));
    await emCurso.current;
  }, [chegou]);

  /** Grava o que há de mais novo (as posições e o recado) daqui a pouco, ou na hora, com `agora`. */
  const gravarDepois = useCallback(
    (dia: string, agora: boolean) => {
      pendente.current = { dia, posicoes: posicoesAgora.current, recado: recadoAgora.current };
      setGravacao('esperando');
      if (prazo.current) clearTimeout(prazo.current);
      prazo.current = setTimeout(() => void gravarAgora(), agora ? 0 : GRAVAR_DEPOIS_MS);
    },
    [gravarAgora],
  );
  /** Muda as posições do dia e grava daqui a pouco (ou na hora, com `agora`). */
  const mudar = useCallback(
    (f: (ps: PosicaoDaEscala[]) => PosicaoDaEscala[], agora = false) => {
      if (!dados) return;
      posicoesAgora.current = f(posicoesAgora.current);
      setPosicoes(posicoesAgora.current);
      gravarDepois(dados.dia, agora);
    },
    [dados, gravarDepois],
  );
  /** Muda o recado do dia e grava daqui a pouco. */
  const mudarRecado = (texto: string) => {
    if (!dados) return;
    recadoAgora.current = texto;
    setRecado(texto);
    gravarDepois(dados.dia, false);
  };

  /** O dia como veio do servidor, na tela: as posições, o recado e o resto. */
  const mostrar = useCallback((d: DiaDaEscala) => {
    setDados(d);
    base.current = { dia: d.dia, posicoes: d.posicoes, recado: d.recado ?? '', versao: d.versao ?? 0 };
    posicoesAgora.current = d.posicoes.map(comLinha);
    setPosicoes(posicoesAgora.current);
    recadoAgora.current = d.recado ?? '';
    setRecado(recadoAgora.current);
    setGravacao('gravado');
  }, []);
  // o dia: o que falta gravar do outro vai antes; depois, lê
  const carregar = useCallback(() => {
    let vivo = true;
    setFalha('');
    setVista('montar');
    void gravarAgora()
      .then(() => lerRascunhoDoDia(dia))
      .then((d) => vivo && mostrar(d))
      .catch((e) => vivo && setFalha(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [dia, gravarAgora, mostrar]);
  useEffect(() => carregar(), [carregar]);

  /* ---------- duas pessoas ao mesmo tempo (#131) ---------- */
  // uma releitura por vez; a versão que chegar no meio dela pede outra no fim
  const relendo = useRef(false);
  const relerDeNovo = useRef(false);
  /** A sala avisou uma versão nova: o que falta gravar vai antes (a gravação já volta com o dia juntado); senão, lê. */
  const versaoNova = useCallback(
    async (versao: number) => {
      const b = base.current;
      if (!b || versao <= b.versao) return;
      if (relendo.current) {
        relerDeNovo.current = true;
        return;
      }
      relendo.current = true;
      try {
        do {
          relerDeNovo.current = false;
          if (pendente.current) await gravarAgora();
          else {
            while (emCurso.current) await emCurso.current;
            chegou(await lerRascunhoDoDia(b.dia));
          }
        } while (relerDeNovo.current);
        setReleitura((n) => n + 1);
      } catch {
        // sem rede agora: a próxima gravação ou o próximo aviso da sala acertam
      } finally {
        relendo.current = false;
      }
    },
    [chegou, gravarAgora],
  );
  const { outros, estarEm } = useSalaDoDia(dados?.dia ?? null, pessoa, (v) => void versaoNova(v));
  // ao sair da tela (ou fechar a aba), o que falta vai na hora
  useEffect(() => {
    const sair = () => void gravarAgora();
    window.addEventListener('pagehide', sair);
    return () => {
      window.removeEventListener('pagehide', sair);
      sair();
    };
  }, [gravarAgora]);

  // o foco pedido, depois de desenhar (a linha nova, a posição nova, a linha de cima depois de apagar)
  useLayoutEffect(() => {
    if (!foco) return;
    const sel = `[data-posicao="${foco.posicao}"][data-campo="${foco.campo}"]${foco.demanda ? `[data-demanda="${foco.demanda}"]` : ''}${foco.aviso ? `[data-aviso="${foco.aviso}"]` : ''}`;
    const el = grade.current?.querySelector<HTMLInputElement>(sel);
    if (el) {
      el.focus();
      if (foco.fim !== false) el.setSelectionRange(el.value.length, el.value.length);
    }
    setFoco(null);
  }, [foco]);

  const turnos = dados?.turnos ?? [];
  const editores = dados?.editores ?? [];
  const daPosicao = (id: string, f: (p: PosicaoDaEscala) => PosicaoDaEscala) => mudar((ps) => ps.map((p) => (p.id === id ? f(p) : p)));
  const novaPosicao = (turno: TurnoDaEscala) => {
    const p: PosicaoDaEscala = { id: novoId('p'), turno: turno.id, editor: '', ilha: '', horario: turno.horario, demandas: [linhaVazia()], avisos: [] };
    // a posição nova entra depois da última do turno (a ordem da grade é a dos turnos)
    mudar((ps) => {
      const ultima = ps.map((x) => x.turno).lastIndexOf(turno.id);
      const onde = ultima >= 0 ? ultima + 1 : ps.length;
      return [...ps.slice(0, onde), p, ...ps.slice(onde)];
    }, true);
    setFoco({ posicao: p.id, campo: 'editor' });
  };
  const tirarPosicao = (id: string) => mudar((ps) => ps.filter((p) => p.id !== id), true);
  /** Repetir (#129): a escala de outro dia no dia vazio (ou nos vazios da semana); o que falta gravar vai antes. */
  const repetir = async (de: DeOndeRepetir) => {
    if (!dados) return;
    await gravarAgora();
    const d = await repetirAEscala(dados.dia, de);
    mostrar(d);
    setRepetido(d.repetido?.length ? textoDoRepetido(d.repetido, de) : '');
  };
  /** Começar do zero: uma posição vazia em cada turno, com o foco no editor da primeira. */
  const doZero = () => {
    const novas = turnos.map((t): PosicaoDaEscala => ({ id: novoId('p'), turno: t.id, editor: '', ilha: '', horario: t.horario, demandas: [linhaVazia()], avisos: [] }));
    if (!novas.length) return;
    mudar((ps) => [...ps, ...novas], true);
    setFoco({ posicao: novas[0].id, campo: 'editor' });
  };

  /* ---------- a coluna lateral (#126) ---------- */
  // as ações da coluna vão ao servidor uma de cada vez, na ordem; só a resposta da última vale para a tela
  const filaDaColuna = useRef<Promise<unknown>>(Promise.resolve());
  const ultimaDaColuna = useRef(0);
  /**
   * Uma ação da coluna: grava antes o que falta, mostra já o resultado (`local`, nas posições sem as linhas vazias;
   * `lista`, em "Para distribuir") e vai ao servidor; fica com o dia que ele gravou (ou volta ao de antes, no erro).
   * Com outra ação feita enquanto esta ia, a resposta desta é velha (não tem a outra): a tela espera a da última.
   */
  const naColuna = async (local: ((ps: PosicaoDaEscala[]) => PosicaoDaEscala[] | null) | null, lista: ((l: DemandaParaDistribuir[]) => DemandaParaDistribuir[]) | null, servidor: (dia: string) => Promise<DiaDaEscala>) => {
    if (!dados) return false;
    const dia = dados.dia;
    setErroDaColuna('');
    await gravarAgora();
    const antes = { posicoes: posicoesAgora.current, lista: dados.paraDistribuir ?? [], base: base.current };
    const novas = local?.(posicoesAgora.current.map((p) => ({ ...p, demandas: p.demandas.filter((d) => d.texto.trim()) })));
    if (novas) {
      posicoesAgora.current = novas.map(comLinha);
      setPosicoes(posicoesAgora.current);
      // o resultado mostrado antes da resposta também vai para a base (#131): não é mudança da pessoa, e o dia que o
      // servidor gravar fica no lugar dele (a posição nova que o servidor cria tem outro id)
      const b = base.current;
      const naBase = b?.dia === dia ? local?.(b.posicoes) : null;
      if (b && naBase) base.current = { ...b, posicoes: naBase };
    }
    if (lista) setDados((d) => (d?.dia === dia ? { ...d, paraDistribuir: lista(d.paraDistribuir ?? []) } : d));
    const esta = ++ultimaDaColuna.current;
    const resposta = filaDaColuna.current.then(() => servidor(dia));
    filaDaColuna.current = resposta.catch(() => undefined);
    try {
      const d = await resposta;
      if (esta !== ultimaDaColuna.current) return true;
      // o dia que o servidor gravou, juntado com a tela: quem digitou enquanto isso fica com o que digitou (#131)
      chegou(d);
      return true;
    } catch (e) {
      if (esta === ultimaDaColuna.current) {
        if (base.current?.dia === dia && base.current.versao === antes.base?.versao) base.current = antes.base;
        if (!pendente.current) {
          posicoesAgora.current = antes.posicoes;
          setPosicoes(antes.posicoes);
        }
        setDados((d) => (d?.dia === dia ? { ...d, paraDistribuir: antes.lista } : d));
      }
      setErroDaColuna(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const listaDoDia = dados?.paraDistribuir ?? [];
  const escalar = (editor: string, alvo: { posicao: string } | { turno: string }) => {
    const t = 'turno' in alvo ? turnos.find((x) => x.id === alvo.turno) : null;
    // o mesmo id na tela e na base (o resultado mostrado antes da resposta vai para as duas)
    const idNovo = novoId('p');
    const local = (ps: PosicaoDaEscala[]) =>
      'posicao' in alvo ? escalarNa(ps, editor, alvo) : t ? escalarNa(ps, editor, { turno: t.id, nova: { id: idNovo, turno: t.id, editor: '', ilha: '', horario: t.horario, demandas: [], avisos: [] } }) : null;
    void naColuna(local, null, (dia) => escalarNoDia(dia, editor, 'turno' in alvo ? { ...alvo, id: idNovo } : alvo));
  };
  const levar = (id: string, posicao: string, antesDe: string | null) => {
    const item = listaDoDia.find((d) => d.id === id);
    if (!item) return;
    void naColuna((ps) => acrescentarDemanda(ps, posicao, { id: item.id, texto: item.texto }, antesDe), (l) => l.filter((d) => d.id !== id), (dia) => levarParaAPosicao(dia, id, posicao, antesDe));
  };
  const mover = (id: string, posicao: string, antesDe: string | null) => void naColuna((ps) => moverDemanda(ps, id, posicao, antesDe), null, (dia) => moverADemanda(dia, id, posicao, antesDe));
  const devolver = (id: string) => {
    const tirada = tirarDemanda(posicoesAgora.current, id);
    if (!tirada) return;
    void naColuna((ps) => tirarDemanda(ps, id)?.posicoes ?? null, (l) => [...l, { id, texto: tirada.demanda.texto, deQuem: tirada.de }], (dia) => devolverADemanda(dia, id));
  };
  const tirarDaLista = (id: string) => void naColuna(null, (l) => l.filter((d) => d.id !== id), (dia) => jaDistribuida(dia, id).then(() => lerRascunhoDoDia(dia)));
  const juntar = (texto: string) => naColuna(null, null, (dia) => juntarParaDistribuir(dia, texto));

  const { arrastado, sobre, iniciar } = useArrastar(
    (item, lugar) => (item.tipo === 'pessoa' ? lugar.tipo !== 'lista' : item.tipo === 'lista' ? lugar.tipo === 'posicao' : lugar.tipo === 'lista' || (lugar.tipo === 'posicao' && lugar.antesDe !== item.id)),
    (item: ItemArrastado, lugar: LugarDeSoltar) => {
      if (item.tipo === 'pessoa') escalar(item.id, lugar.tipo === 'turno' ? { turno: lugar.id } : { posicao: lugar.id });
      else if (item.tipo === 'lista') levar(item.id, lugar.id, lugar.antesDe);
      else if (lugar.tipo === 'lista') devolver(item.id);
      else mover(item.id, lugar.id, lugar.antesDe);
    },
  );
  /** Os destinos de uma demanda: as posições do dia, por turno (sem a dela) e, para a demanda, a volta à lista. */
  const destinosDaDemanda = (fora: string | null, comLista: boolean): Destino[] => [
    ...turnos.flatMap((t) => posicoes.filter((p) => p.turno === t.id && p.id !== fora).map((p) => ({ valor: `posicao:${p.id}`, grupo: t.nome, rotulo: `${t.nome}: ${p.editor.trim() || 'vaga'}` }))),
    ...(comLista ? [{ valor: 'lista', grupo: 'Coluna', rotulo: 'Para distribuir' }] : []),
  ];
  /** Os destinos de quem está sem escala: as vagas de cada turno e uma posição nova nele. */
  const destinosDaPessoa: Destino[] = turnos.flatMap((t) => [
    ...posicoes.filter((p) => p.turno === t.id && !p.editor.trim()).map((p, i, vagas) => ({ valor: `posicao:${p.id}`, grupo: t.nome, rotulo: `${t.nome}: vaga${vagas.length > 1 ? ` ${i + 1}` : ''}` })),
    { valor: `turno:${t.id}`, grupo: t.nome, rotulo: `${t.nome}: nova posição` },
  ]);
  /** O destino escolhido no "Escalar na…" ou no "Mover para…": "posicao:id", "turno:id" ou "lista". */
  const lerDestino = (valor: string) => {
    const [tipo, id = ''] = valor.split(':');
    return { tipo, id };
  };
  const escalarPeloMenu = (editor: string, valor: string) => {
    const d = lerDestino(valor);
    escalar(editor, d.tipo === 'turno' ? { turno: d.id } : { posicao: d.id });
  };
  const moverPeloMenu = (tipo: 'lista' | 'demanda', id: string, valor: string) => {
    const d = lerDestino(valor);
    if (tipo === 'lista') levar(id, d.id, null);
    else if (d.tipo === 'lista') devolver(id);
    else mover(id, d.id, null);
  };
  // só com o "Fora" deste dia lido: antes disso, quem está fora apareceria como sem escala (e daria para escalar)
  const foraNoDia = dados && fora?.dia === dados.dia ? fora.nomes : null;
  const pessoasSemEscala = foraNoDia && semEscala(editores, posicoes, foraNoDia);

  /** Aplica o colado: as posições vão para o rascunho (gravado na hora), as ausências são marcadas e o dia é lido de novo. */
  const aplicarOColado = async (r: ColadoParaAplicar) => {
    if (!dados) return;
    const dia = dados.dia;
    posicoesAgora.current = r.posicoes.map(comLinha);
    setPosicoes(posicoesAgora.current);
    gravarDepois(dia, true);
    await gravarAgora();
    if (pendente.current) throw new Error('Não consegui gravar o rascunho; nada foi marcado.');
    for (const a of r.ausencias) await marcarAusencia(dia, a);
    setColando(false);
    setColado(`Colado da planilha: ${r.resumo}.`);
    setLeituraDoFora((n) => n + 1);
    carregar();
  };

  // ← e → trocam de semana, fora dos campos
  const segunda = dados?.semana[0]?.dia ?? '';
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!segunda || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest('input, textarea, select, [role="listbox"]')) return;
      if (e.key === 'ArrowLeft') irPara(diaVizinho(dados!.dia, -7));
      if (e.key === 'ArrowRight') irPara(diaVizinho(dados!.dia, 7));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [segunda, dados, irPara]);

  /** O que o servidor diz da publicação, sem mexer nas posições da tela. */
  const daPublicacao = (d: DiaDaEscala) => setDados((antes) => (antes?.dia === d.dia ? { ...antes, estado: d.estado, semana: d.semana, publicacao: d.publicacao, historico: d.historico, dispensadas: d.dispensadas } : antes));
  const conferir = async () => {
    setErroAoPublicar('');
    await gravarAgora();
    setVista('conferir');
    window.scrollTo(0, 0);
  };
  const publicar = async () => {
    if (!dados) return;
    setPublicando(true);
    setErroAoPublicar('');
    try {
      // publica o que está gravado: o que falta gravar vai antes
      await gravarAgora();
      daPublicacao(await publicarODia(dados.dia));
      setVista('publicada');
      window.scrollTo(0, 0);
    } catch (e) {
      setErroAoPublicar(e instanceof Error ? e.message : String(e));
    } finally {
      setPublicando(false);
    }
  };
  const desfazer = async () => {
    if (!dados) return;
    try {
      daPublicacao(await desfazerAPublicacao(dados.dia));
      setVista('montar');
    } catch (e) {
      setErroAoGravar(e instanceof Error ? e.message : String(e));
      setGravacao('erro');
    }
  };
  const marcar = (chave: string, certo: boolean) => {
    if (!dados) return;
    marcarPendencia(dados.dia, chave, certo).then(daPublicacao, (e) => setErroAoPublicar(e instanceof Error ? e.message : String(e)));
  };

  const atual = dados && (!dia || dados.dia === dia) ? dados : null;
  const rel = atual ? perto(atual.dia, hoje) : '';
  return (
    <div className="pagina pauta montar-pauta">
      <header className="cad-topo">
        <button className="voltar-cad" onClick={voltar}>
          <Icone nome="voltar" tam={16} /> Pauta da edição
        </button>
        <Marca />
        <span className="montar-estado" role="status">
          {atual && gravacao === 'erro' ? (
            <span className="montar-erro">
              Não consegui gravar: {erroAoGravar}{' '}
              <button type="button" className="botao-texto" onClick={() => void gravarAgora()}>
                tentar de novo
              </button>
            </span>
          ) : atual && gravacao !== 'gravado' ? (
            'gravando…'
          ) : atual?.estado === 'rascunho' ? (
            <>
              <span className="ponto" aria-hidden="true" /> rascunho guardado · só a coordenação vê
            </>
          ) : atual?.estado === 'publicado' ? (
            <>
              <span className="ponto" aria-hidden="true" /> publicada
            </>
          ) : atual?.estado === 'alterado' ? (
            'alterada depois de publicar'
          ) : null}
        </span>
      </header>
      <main
        className="pauta-pagina montar-pagina"
        ref={pagina}
        // o campo em que a pessoa está vai para a sala, para a outra ver (#131)
        onFocus={(e) => estarEm(campoDoElemento(e.target))}
        onBlur={(e) => {
          if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) estarEm(null);
        }}
      >
        <MarcasDosOutros outros={outros} dentro={pagina} versao={posicoes} />
        {atual && vista === 'conferir' ? (
          <ConferirODia dados={atual} posicoes={posicoes} recado={recado} hoje={hoje} publicando={publicando} erro={erroAoPublicar} voltar={() => setVista('montar')} corrigir={(alvo) => (setVista('montar'), setFoco(alvo))} marcar={marcar} publicar={() => void publicar()} />
        ) : atual && vista === 'publicada' ? (
          <DiaPublicado dados={atual} posicoes={posicoes} recado={recado} voltar={() => setVista('montar')} desfazer={() => void desfazer()} irPara={irPara} />
        ) : (
        <>
        <div className="pauta-cabeca montar-cabeca">
          <div>
            <h1>Montar a pauta</h1>
            {atual && (
              <p className="pauta-sub">
                {diaEscrito(atual.dia)}
                {rel && (
                  <>
                    {' · '}
                    <span className="montar-rel">{rel}</span>
                  </>
                )}
                {' · '}
                {atual.estado === 'vazio' ? 'vazio' : <span className={`montar-${atual.estado}`}>{atual.estado}</span>}
              </p>
            )}
            <QuemMaisEsta outros={outros} />
          </div>
          <div className="montar-acoes">
            {atual && (
              <button type="button" className="botao" onClick={() => (setColado(''), setColando(true))}>
                ⎘ Colar da planilha
              </button>
            )}
            {atual && posicoes.length > 0 && (
              <button type="button" className="botao primario" onClick={() => void conferir()}>
                Conferir e publicar →
              </button>
            )}
          </div>
        </div>
        {atual && <AbasDaSemana dados={atual} hoje={hoje} irPara={irPara} />}
        {atual && <FaixaDaPublicacao dados={atual} desfazer={() => void desfazer()} />}
        {/* a semana lado a lado com a planilha (#133): as diferenças com a foto do mesmo dia */}
        {atual && <LadoALado dados={atual} posicoes={posicoes} foraNoDia={foraNoDia ?? []} />}
        {falha ? (
          <p className="pauta-falha" role="alert">
            {falha}{' '}
            <button className="botao-texto" onClick={() => carregar()}>
              Tentar de novo
            </button>
          </p>
        ) : !atual ? (
          <p className="pauta-lendo">Lendo o rascunho…</p>
        ) : (
          <>
          <RecadoDoDia texto={recado} mudar={mudarRecado} />
          {colado && (
            <p className="colar-feito" role="status">
              {colado}
              <button type="button" className="botao-texto" onClick={() => setColado('')}>
                ok
              </button>
            </p>
          )}
          {colando && <ColarDaPlanilha dados={atual} posicoes={posicoes} jaFora={foraNoDia ?? []} novoId={novoId} fechar={() => setColando(false)} aplicar={aplicarOColado} />}
          <div className={`montar-corpo${arrastado ? ` arrastando-${arrastado.tipo}` : ''}`}>
          {/* a coluna lateral (#126): para distribuir, sem escala e fora (as ausências, #128) */}
          <aside className="montar-coluna" aria-label="Coluna lateral">
            {erroDaColuna && (
              <p className="aus-erro" role="alert">
                {erroDaColuna}
              </p>
            )}
            <ParaDistribuir dia={atual.dia} itens={listaDoDia} juntar={juntar} tirar={tirarDaLista} destinos={destinosDaDemanda(null, false)} mover={(id, v) => moverPeloMenu('lista', id, v)} arraste={{ iniciar, arrastado, sobre }} />
            <SemEscala pessoas={pessoasSemEscala} destinos={destinosDaPessoa} escalar={escalarPeloMenu} arraste={{ iniciar, arrastado, sobre }} />
            <AusenciasDoDia key={leituraDoFora} releitura={releitura} dia={atual.dia} turnos={turnos} editores={editores} antes={gravarAgora} mudou={() => void carregar()} foraNoDia={avisarFora} />
          </aside>
          <div className="montar-grade" ref={grade}>
            {repetido && (
              <p className="repetido" role="status">
                {repetido}
              </p>
            )}
            {!posicoes.length && (atual.repetir ? <DiaVazio dados={atual} repetir={repetir} doZero={doZero} colar={() => (setColado(''), setColando(true))} /> : <p className="montar-vazio">Nada montado para {diaEscrito(atual.dia).split(',')[0]} ainda. Comece por uma posição num turno.</p>)}
            {turnos.map((t) => {
              const doTurno = posicoes.filter((p) => p.turno === t.id);
              return (
                <section key={t.id} className={`montar-turno${sobre === `turno:${t.id}` ? ' sobre' : ''}`} aria-label={t.nome} data-solta={`turno:${t.id}`}>
                  <div className="montar-turno-cab">
                    <h2>{t.nome}</h2>
                    <span className="montar-turno-h">
                      {t.horario} · {doTurno.length} {doTurno.length === 1 ? 'posição' : 'posições'}
                    </span>
                    <span className="espaco" />
                    <button type="button" className="botao-texto" onClick={() => novaPosicao(t)}>
                      + posição
                    </button>
                  </div>
                  {doTurno.length > 0 && (
                    <div className="montar-celulas">
                      {doTurno.map((p) => (
                        <CelulaDaPosicao
                          key={p.id}
                          p={p}
                          dia={atual.dia}
                          posicoes={posicoes}
                          turnos={turnos}
                          editores={editores}
                          ilhas={atual.ilhas}
                          costume={atual.costume}
                          mudar={(f) => daPosicao(p.id, f)}
                          tirar={() => tirarPosicao(p.id)}
                          focar={setFoco}
                          arraste={{ iniciar, sobre, arrastado, destinos: destinosDaDemanda(p.id, true), mover: (id, v) => moverPeloMenu('demanda', id, v) }}
                        />
                      ))}
                    </div>
                  )}
                  {arrastado?.tipo === 'pessoa' && <p className="montar-solte">solte aqui: uma posição nova na {t.nome.toLowerCase()}</p>}
                </section>
              );
            })}
            <p className="montar-teclas">
              <span><kbd>Tab</kbd> próximo campo</span>
              <span><kbd>Enter</kbd> nova linha</span>
              <span><kbd>↑</kbd> <kbd>↓</kbd> entre as linhas</span>
              <span><kbd>⌫</kbd> na linha vazia apaga</span>
              <span><Alca /> arraste para outra posição</span>
            </p>
          </div>
          </div>
          </>
        )}
        </>
        )}
      </main>
    </div>
  );
}

/** O recado do dia (#125): um aviso para todos naquele dia, sem posição, num campo próprio acima da grade. */
function RecadoDoDia({ texto, mudar }: { texto: string; mudar: (t: string) => void }) {
  return (
    <label className="montar-recado">
      <span className="montar-recado-rotulo">Recado do dia</span>
      <textarea
        className="montar-recado-in"
        data-campo="recado"
        value={texto}
        rows={Math.min(4, Math.max(1, texto.split('\n').length))}
        maxLength={500}
        placeholder="um recado para todos neste dia (aparece na Pauta, como aviso)"
        onChange={(e) => mudar(e.target.value)}
      />
    </label>
  );
}

/** As abas com os dias da semana, cada uma com o estado do dia, e a troca de semana. */
function AbasDaSemana({ dados, hoje, irPara }: { dados: DiaDaEscala; hoje: string; irPara: (dia: string) => void }) {
  const abas = useRef<HTMLElement>(null);
  // no celular as abas rolam para o lado: a do dia aparece (sem mexer na rolagem da página)
  useLayoutEffect(() => {
    const nav = abas.current;
    const aba = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && aba && nav.scrollWidth > nav.clientWidth) nav.scrollLeft += aba.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - aba.offsetWidth) / 2;
  }, [dados.dia]);
  return (
    <nav className="montar-abas" aria-label="Dias da semana" ref={abas}>
      <button type="button" className="botao-icone" aria-label="Semana anterior" title="Semana anterior (←)" onClick={() => irPara(diaVizinho(dados.dia, -7))}>
        <Icone nome="voltar" tam={15} traco={2.2} />
      </button>
      {dados.semana.map((s) => {
        const p = partes(s.dia);
        const rel = perto(s.dia, hoje);
        return (
          <button key={s.dia} type="button" className="montar-aba" aria-current={s.dia === dados.dia ? 'page' : undefined} data-estado={s.estado} title={`${diaEscrito(s.dia)}: ${s.estado}`} onClick={() => irPara(s.dia)}>
            <span className={`est est-${s.estado}`} aria-hidden="true" />
            {DIAS_DA_SEMANA[p.semana].toUpperCase()} <span className="n">{p.dia}/{p.mes + 1}</span>
            {rel && <i>{rel}</i>}
            <span className="montar-sr">, {s.estado}</span>
          </button>
        );
      })}
      <button type="button" className="botao-icone" aria-label="Próxima semana" title="Próxima semana (→)" onClick={() => irPara(diaVizinho(dados.dia, 7))}>
        <Icone nome="direita" tam={15} traco={2.2} />
      </button>
    </nav>
  );
}

interface PropsDaCelula {
  p: PosicaoDaEscala;
  dia: string;
  posicoes: PosicaoDaEscala[];
  turnos: readonly TurnoDaEscala[];
  editores: readonly string[];
  ilhas: readonly Ilha[];
  costume: Readonly<Record<string, string>>;
  mudar: (f: (p: PosicaoDaEscala) => PosicaoDaEscala) => void;
  tirar: () => void;
  focar: (f: Foco) => void;
  /** o arrastar (#126): quem arrasta, onde está, e o "Mover para…" das demandas (no celular) */
  arraste: Arraste & { destinos: readonly Destino[]; mover: (id: string, destino: string) => void };
}

/** Uma posição: o editor, o horário e as demandas, cada campo com o que o PROMeiro entendeu embaixo. */
function CelulaDaPosicao({ p, dia, posicoes, turnos, editores, ilhas, costume, mudar, tirar, focar, arraste }: PropsDaCelula) {
  const horario = lerHorario(p.horario);
  const situacao = p.editor.trim() ? situacaoNoDia(p.editor, posicoes, p.id) : null;
  const naLista = !p.editor.trim() || editores.some((e) => nomeComparavel(e) === nomeComparavel(p.editor));
  const linha = (id: string, texto: string) => mudar((x) => ({ ...x, demandas: x.demandas.map((d) => (d.id === id ? { ...d, texto } : d)) }));

  const teclaNaDemanda = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    const d = p.demandas[i];
    if (e.key === 'Enter') {
      // Enter cria uma linha logo abaixo (a de agora vai para o padrão)
      e.preventDefault();
      const nova = linhaVazia();
      mudar((x) => {
        const ds = x.demandas.map((y) => (y.id === d.id ? { ...y, texto: demandaNoPadrao(y.texto, dia) || y.texto.trim() } : y));
        return { ...x, demandas: [...ds.slice(0, i + 1), nova, ...ds.slice(i + 1)] };
      });
      focar({ posicao: p.id, campo: 'demanda', demanda: nova.id });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focar(i > 0 ? { posicao: p.id, campo: 'demanda', demanda: p.demandas[i - 1].id } : { posicao: p.id, campo: 'horario' });
    } else if (e.key === 'ArrowDown' && (i < p.demandas.length - 1 || p.avisos.length)) {
      e.preventDefault();
      focar(i < p.demandas.length - 1 ? { posicao: p.id, campo: 'demanda', demanda: p.demandas[i + 1].id } : { posicao: p.id, campo: 'aviso', aviso: p.avisos[0].id });
    } else if (e.key === 'Backspace' && !e.currentTarget.value && p.demandas.length > 1) {
      // Backspace na linha vazia apaga a linha; o foco sobe (ou desce, na primeira)
      e.preventDefault();
      const vai = p.demandas[i - 1] ?? p.demandas[i + 1];
      mudar((x) => ({ ...x, demandas: x.demandas.filter((y) => y.id !== d.id) }));
      focar({ posicao: p.id, campo: 'demanda', demanda: vai.id });
    }
  };

  /** Os avisos da posição (#125): Enter cria outro, as setas andam (de cima, as demandas), Backspace na vazia apaga. */
  const textoDoAviso = (id: string, texto: string) => mudar((x) => ({ ...x, avisos: x.avisos.map((a) => (a.id === id ? { ...a, texto } : a)) }));
  const novoAviso = (depois = p.avisos.length - 1) => {
    const novo = avisoVazio();
    mudar((x) => ({ ...x, avisos: [...x.avisos.slice(0, depois + 1), novo, ...x.avisos.slice(depois + 1)] }));
    focar({ posicao: p.id, campo: 'aviso', aviso: novo.id });
  };
  const teclaNoAviso = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    const a = p.avisos[i];
    if (e.key === 'Enter') {
      e.preventDefault();
      novoAviso(i);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focar(i > 0 ? { posicao: p.id, campo: 'aviso', aviso: p.avisos[i - 1].id } : { posicao: p.id, campo: 'demanda', demanda: p.demandas.at(-1)?.id });
    } else if (e.key === 'ArrowDown' && i < p.avisos.length - 1) {
      e.preventDefault();
      focar({ posicao: p.id, campo: 'aviso', aviso: p.avisos[i + 1].id });
    } else if (e.key === 'Backspace' && !e.currentTarget.value) {
      // a vazia sai; o foco vai ao aviso de cima (ou ao de baixo; sem nenhum, à última demanda)
      e.preventDefault();
      const vai = p.avisos[i - 1] ?? p.avisos[i + 1];
      mudar((x) => ({ ...x, avisos: x.avisos.filter((y) => y.id !== a.id) }));
      focar(vai ? { posicao: p.id, campo: 'aviso', aviso: vai.id } : { posicao: p.id, campo: 'demanda', demanda: p.demandas.at(-1)?.id });
    }
  };

  return (
    <div className={`montar-celula${arraste.sobre.split(':')[1] === p.id && /^(posicao|demanda):/.test(arraste.sobre) ? ' sobre' : ''}`} data-posicao-id={p.id} data-solta={`posicao:${p.id}`}>
      <div className="montar-celula-topo">
        {/* a vaga que o Repetir deixou (#129) perde o motivo quando ganha editor */}
        <CampoDoEditor p={p} posicoes={posicoes} turnos={turnos} editores={editores} mudar={(editor) => mudar(({ vaga, ...x }) => (editor.trim() ? { ...x, editor } : { ...x, editor, ...(vaga ? { vaga } : {}) }))} depois={() => focar({ posicao: p.id, campo: 'ilha' })} />
        {/* fora do Tab: do editor, o Tab vai direto ao horário */}
        <button type="button" tabIndex={-1} className="botao-icone pequeno montar-tirar" title="Tirar esta posição" aria-label="Tirar esta posição" onClick={tirar}>
          <Icone nome="fechar" tam={13} />
        </button>
      </div>
      <div className="montar-sob">
        {situacao?.tipo === 'escalado' && <span className="montar-alerta">{textoDaSituacao(situacao, turnos)}</span>}
        {!naLista && <span className="montar-tag" title="Não está nos Cadastros: fica pendente, para um administrador cadastrar ou ligar a quem já existe">nome novo</span>}
        {p.vaga && !p.editor.trim() && (
          <span className="montar-vaga">
            <b>vaga</b> · {p.vaga}
          </span>
        )}
      </div>
      <CampoDaIlha
        p={p}
        posicoes={posicoes}
        turnos={turnos}
        ilhas={ilhas}
        costume={costume}
        mudar={(ilha) => mudar((x) => ({ ...x, ilha }))}
        depois={() => focar({ posicao: p.id, campo: 'horario' })}
        antes={() => focar({ posicao: p.id, campo: 'editor' })}
      />
      <input
        className="montar-in hora"
        data-posicao={p.id}
        data-campo="horario"
        value={p.horario}
        placeholder="horário"
        spellCheck={false}
        autoComplete="off"
        aria-label="Horário"
        onChange={(e) => mudar((x) => ({ ...x, horario: e.target.value }))}
        onBlur={(e) => horarioNoPadrao(e.target.value) !== e.target.value && mudar((x) => ({ ...x, horario: horarioNoPadrao(x.horario) }))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            focar({ posicao: p.id, campo: 'demanda', demanda: p.demandas[0]?.id });
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focar({ posicao: p.id, campo: 'ilha' });
          }
        }}
      />
      <div className="montar-sob">
        {horario &&
          (horarioEntendido(horario) ? (
            <span className="montar-leve">
              {minutosEscritos(horario.minutos)}
              {horario.viraODia && ' · vira o dia'}
              {horario.padrao !== p.horario.trim() && (
                <>
                  {' · grava '}
                  <b>{horario.padrao}</b>
                </>
              )}
            </span>
          ) : (
            <span className="montar-alerta">{horario.erro}</span>
          ))}
      </div>
      <ul className="montar-demandas" aria-label="Demandas">
        {p.demandas.map((d, i) => (
          <LinhaDaDemanda key={d.id} posicao={p.id} id={d.id} texto={d.texto} dia={dia} mudar={(t) => linha(d.id, t)} tecla={(e) => teclaNaDemanda(e, i)} arraste={arraste} />
        ))}
      </ul>
      {p.avisos.length > 0 && (
        <ul className="montar-avisos" aria-label="Avisos">
          {p.avisos.map((a, i) => (
            <li key={a.id} className="montar-aviso">
              <span className="montar-aviso-marca" aria-hidden="true">
                ⚑
              </span>
              <input
                className="montar-in"
                data-posicao={p.id}
                data-campo="aviso"
                data-aviso={a.id}
                value={a.texto}
                placeholder="aviso para o editor, Enter"
                autoComplete="off"
                aria-label="Aviso"
                maxLength={200}
                onChange={(e) => textoDoAviso(a.id, e.target.value)}
                onKeyDown={(e) => teclaNoAviso(e, i)}
              />
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="botao-texto montar-mais-aviso" onClick={() => novoAviso()}>
        + aviso
      </button>
    </div>
  );
}

/** Uma linha de demanda: o texto livre e, embaixo, o que o PROMeiro entendeu. Ao sair, a claquete vai para o padrão. */
function LinhaDaDemanda({ posicao, id, texto, dia, mudar, tecla, arraste }: { posicao: string; id: string; texto: string; dia: string; mudar: (t: string) => void; tecla: (e: React.KeyboardEvent<HTMLInputElement>) => void; arraste: PropsDaCelula['arraste'] }) {
  const l = lerDemanda(texto, dia);
  const preenchida = !!texto.trim();
  const indo = arraste.arrastado?.tipo === 'demanda' && arraste.arrastado.id === id;
  return (
    <li className={`montar-demanda t-${l.tipo}${preenchida ? ' arrastavel' : ''}${indo ? ' indo' : ''}${arraste.sobre === `demanda:${posicao}:${id}` ? ' sobre' : ''}`} data-solta={`demanda:${posicao}:${id}`} data-demanda-id={id} onPointerDown={preenchida ? arraste.iniciar({ tipo: 'demanda', id }) : undefined}>
      {preenchida && <Alca />}
      {preenchida && <EscolherDestino className="montar-mover" rotulo="⋯" titulo={`Mover ${texto.trim()} para…`} destinos={arraste.destinos} escolher={(v) => arraste.mover(id, v)} />}
      <input
        className="montar-in"
        data-posicao={posicao}
        data-campo="demanda"
        data-demanda={id}
        value={texto}
        placeholder="claquete ou tarefa, Enter"
        spellCheck={false}
        autoComplete="off"
        aria-label="Demanda"
        onChange={(e) => mudar(e.target.value)}
        onBlur={(e) => l.tipo === 'claquete' && l.mudou && e.target.value === texto && mudar(l.padrao)}
        onKeyDown={tecla}
      />
      {l.tipo === 'claquete' && (
        <span className="montar-leitura">
          {l.data ? (
            <span className="montar-data">
              {l.atracao} · {DIAS_DA_SEMANA[partes(l.data).semana]} {partes(l.data).dia}/{partes(l.data).mes + 1}
            </span>
          ) : (
            <span className="montar-alerta">sem data</span>
          )}
          {l.versoes.length > 0 && (
            <span className="pauta-versoes">
              {l.versoes.map((v, i) => (
                <span key={i} className={`pauta-versao${v.conhecida ? '' : ' desconhecida'}`}>
                  {v.rotulo}
                  {v.conhecida && <small>{v.codigo.toUpperCase()}</small>}
                </span>
              ))}
            </span>
          )}
          {l.mudou && (
            <span className="montar-grava">
              grava <b>{l.padrao}</b>
            </span>
          )}
        </span>
      )}
    </li>
  );
}

/** As opções da lista dos editores: os cadastrados que casam com o que foi escrito, os livres primeiro. */
function opcoesDoEditor(escrito: string, p: PosicaoDaEscala, posicoes: readonly PosicaoDaEscala[], editores: readonly string[]) {
  const q = nomeComparavel(escrito);
  const casa = (nome: string) => !q || nomeComparavel(nome).startsWith(q) || nomeComparavel(nome).split(' ').some((w) => w.startsWith(q));
  return editores
    .filter(casa)
    .map((nome) => ({ nome, situacao: situacaoNoDia(nome, posicoes, p.id) }))
    .sort((a, b) => Number(a.situacao.tipo !== 'livre') - Number(b.situacao.tipo !== 'livre'));
}

/**
 * O editor da posição: o campo com a lista dos cadastrados (a situação de cada um no dia), pelo teclado. O nome que não
 * está na lista ganha, no fim dela, o "usar como nome novo" (#132): fica como foi escrito, publica assim e aparece nos
 * Cadastros como pendente, para um administrador cadastrar ou ligar a quem já existe.
 */
function CampoDoEditor({ p, posicoes, turnos, editores, mudar, depois }: { p: PosicaoDaEscala; posicoes: PosicaoDaEscala[]; turnos: readonly TurnoDaEscala[]; editores: readonly string[]; mudar: (editor: string) => void; depois: () => void }) {
  const [aberta, setAberta] = useState(false);
  // filtrar: a pessoa digitou desde que entrou no campo (antes disso, a lista mostra todos)
  const [filtrar, setFiltrar] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const opcoes = aberta ? opcoesDoEditor(filtrar ? p.editor : '', p, posicoes, editores) : [];
  const escrito = p.editor.trim().replace(/\s+/g, ' ');
  const nomeNovo = aberta && filtrar && !!escrito && !editores.some((e) => nomeComparavel(e) === nomeComparavel(escrito));
  // a última opção, depois dos cadastrados, é o nome novo
  const total = opcoes.length + (nomeNovo ? 1 : 0);
  const i = Math.min(ativo, Math.max(0, total - 1));
  const noNomeNovo = nomeNovo && i === opcoes.length;
  const escolher = (nome: string) => {
    mudar(nome);
    setAberta(false);
    setFiltrar(false);
  };
  const lista = `editores-${p.id}`;
  return (
    <div className="montar-campo">
      <input
        className={`montar-in editor${p.editor ? '' : ' sem-editor'}`}
        data-posicao={p.id}
        data-campo="editor"
        value={p.editor}
        placeholder="sem editor"
        spellCheck={false}
        autoComplete="off"
        aria-label="Editor"
        role="combobox"
        aria-expanded={aberta && total > 0}
        aria-controls={lista}
        aria-autocomplete="list"
        onFocus={() => (setAberta(true), setFiltrar(false), setAtivo(0))}
        onBlur={() => (setAberta(false), p.editor !== p.editor.trim().replace(/\s+/g, ' ') && mudar(p.editor.trim().replace(/\s+/g, ' ')))}
        onChange={(e) => (mudar(e.target.value), setAberta(true), setFiltrar(true), setAtivo(0))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!aberta) return setAberta(true);
            setAtivo(Math.max(0, Math.min(total - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
          } else if (e.key === 'Escape') {
            setAberta(false);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (aberta && total && (filtrar || !p.editor)) escolher(noNomeNovo ? escrito : opcoes[i].nome);
            depois();
          } else if (e.key === 'Tab' && !e.shiftKey && aberta && filtrar && escrito && total && (noNomeNovo || nomeComparavel(opcoes[i].nome) !== nomeComparavel(p.editor))) {
            // Tab completa com a opção da lista (e segue para o horário); no nome novo, fica o escrito
            escolher(noNomeNovo ? escrito : opcoes[i].nome);
          }
        }}
      />
      {aberta && total > 0 && (
        <div className="menu montar-lista" id={lista} role="listbox" aria-label="Editores cadastrados">
          {opcoes.map((o, k) => (
            <div
              key={o.nome}
              role="option"
              aria-selected={k === i}
              className={`menu-item${k === i ? ' ativo' : ''}`}
              // sem tirar o foco do campo
              onMouseDown={(e) => (e.preventDefault(), escolher(o.nome))}
            >
              <span className="pauta-avatar">{iniciais(o.nome)}</span>
              <span className="menu-texto">
                <strong>{o.nome}</strong>
                <small className={o.situacao.tipo === 'livre' ? '' : 'escalado'}>{textoDaSituacao(o.situacao, turnos)}</small>
              </span>
            </div>
          ))}
          {nomeNovo && (
            <div
              role="option"
              aria-selected={noNomeNovo}
              className={`menu-item montar-nome-novo${noNomeNovo ? ' ativo' : ''}`}
              onMouseDown={(e) => (e.preventDefault(), escolher(escrito))}
            >
              <span className="pauta-avatar">+</span>
              <span className="menu-texto">
                <strong>usar “{escrito}” como nome novo</strong>
                <small>fica pendente nos Cadastros</small>
              </span>
            </div>
          )}
          <p className="montar-lista-pe">
            <kbd>↑</kbd> <kbd>↓</kbd> escolhe · <kbd>Enter</kbd> ou <kbd>Tab</kbd> confirma · <kbd>Esc</kbd> fecha
          </p>
        </div>
      )}
    </div>
  );
}

