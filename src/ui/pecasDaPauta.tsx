import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { escolhaLembradaDaPauta, lembrarNaPauta } from '../dados/armazenamento';
import { ROTULO_DA_ETAPA, diaEmSaoPaulo, ehDaPessoa, lerVersoes, nomeSemAsVersoes, resumoDaProducao, type LeituraDaPauta, type LinhaDaPauta, type ProducaoNaPauta } from '../modelo/pauta';
import { CardAberto, FecharOCardAberto } from './CardAberto';
import { MenuDeContexto } from './MenuDeContexto';
import { LER_ANDAMENTO_MS } from './fila';
import { Icone } from './icones';
import { MarcaTexto, tracoDe } from './pecas';
import { NumeroQueConta, useEsmaeceAoMudar } from './topoDaAgenda';
import { apelidoDaClaquete, apelidoDaProducao, useApelidos, versoesAMaoDaClaquete, versoesAMaoDaProducao } from '../dados/apelidos';
import { armazenamento } from '../dados/armazenamento';
import { ApelidoDaClaquete } from './Apelido';
import { DE_ONDE, dicaDasVersoes, SufixoDasVersoes, useCodigoDasVersoes } from './CodigoDasVersoes';
import { sufixoDasVersoes, versoesDaChamada, type FonteDasVersoes } from '../modelo/versoesDoRoteiro';

/* As peças da Pauta da edição que a Semana (#94) e o Dia (#97) usam igual: as datas escritas, as versões da chamada
   como o código no padrão (#95), a claquete com a produção da arte (#96), o item da pauta (claquete ou tarefa, com o
   comportamento dos cards da agenda, #162), a ficha da claquete no card aberto do centro (#160) e, do #99, o aviso da
   cópia de reserva, o resumo do administrador e a releitura. */

export const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const partes = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return { dia: d.getUTCDate(), mes: d.getUTCMonth(), semana: d.getUTCDay() };
};

/** A linha da pauta como a tela mostra: com o apelido e a origem das versões que a claquete sabe (#120, #152). */
type LinhaNaTela = LinhaDaPauta & { original?: string; de?: FonteDasVersoes | null };

/** De onde vieram as versões da linha, para a dica: a grafia da claquete quando vêm dela. */
const deOndeNaLinha = (linha: LinhaNaTela) => {
  if (linha.de && linha.de !== 'claquete') return DE_ONDE[linha.de];
  const escrito = linha.texto.slice(nomeSemAsVersoes(linha.texto).length).trim();
  return escrito ? `da claquete ${escrito}` : DE_ONDE.claquete;
};

/** As versões da chamada como o sufixo colado no fim do nome (#152): o código no padrão, uma vez só; o que ele quer
    dizer e de onde veio ficam na dica. Com a opção desligada, nada. */
export function Versoes({ linha }: { linha: LinhaNaTela }) {
  return <SufixoDasVersoes versoes={linha.versoes} de={deOndeNaLinha(linha)} />;
}

/** As versões lidas do roteiro das Produções da linha (#152), a primeira que diz alguma; vazia sem roteiro. */
const lidasDaLinha = (l: LinhaDaPauta) => (l.producoes ?? []).map((p) => p.versoesLidas ?? []).find((v) => v.length) ?? [];

/**
 * A linha com o apelido da claquete (#120, #154) no lugar do texto e as versões que a claquete sabe (#152): as feitas à
 * mão no apelido, o código do nome (o do apelido ou o da claquete) ou as lidas do roteiro. O apelido é o da claquete da
 * pauta, com ou sem roteiro; sem ele, o das Produções achadas (pela tolerância da busca). Só para mostrar: a chave e as
 * Produções achadas por ela ficam as da claquete da pauta; a original fica em `original`.
 */
function comApelidoNaPauta(l: LinhaDaPauta): LinhaNaTela {
  if (l.tipo !== 'claquete') return l;
  const producoes = l.producoes ?? [];
  const apelido = apelidoDaClaquete(l.texto) || (producoes.map((p) => apelidoDaProducao(p.id)).find(Boolean) ?? '');
  const mao = versoesAMaoDaClaquete(l.texto) || (producoes.map((p) => versoesAMaoDaProducao(p.id)).find(Boolean) ?? '');
  const lidas = lidasDaLinha(l);
  const v = versoesDaChamada({ lidas, claquete: l.texto, apelido, mao, dia: l.dia });
  const texto = apelido || l.texto;
  return { ...l, texto, semVersao: lerVersoes(texto, l.dia).semVersao, versoes: v.lista, de: v.de, ...(apelido ? { original: l.texto } : {}) };
}

/** "2 artes", "1 arte"; sem a lista, nada. */
export const artesEscritas = (n: number | null) => (n === null ? '' : `${n} ${n === 1 ? 'arte' : 'artes'}`);

/** O que o PROMeiro sabe da produção da arte da claquete (#96): a etapa, as artes, os designers e a praça; ou "sem card". */
export function ProducaoDaClaquete({ linha }: { linha: LinhaDaPauta }) {
  const r = resumoDaProducao(linha.producoes);
  if (!r) return <span className="pauta-producao sem-card">sem card</span>;
  const partes = [artesEscritas(r.artes), r.designers.join(', '), r.pracas.join(' · ')].filter(Boolean);
  return (
    <span className="pauta-producao" data-etapa={r.etapa}>
      <span className="pauta-etapa">{ROTULO_DA_ETAPA[r.etapa]}</span>
      {partes.map((p, i) => (
        <span key={i}> · {p}</span>
      ))}
    </span>
  );
}

/** O texto da claquete, com o marca-texto da prioridade ALTA da produção da arte (como na agenda). */
export function TextoDaClaquete({ linha }: { linha: LinhaNaTela }) {
  const alta = !!resumoDaProducao(linha.producoes)?.alta;
  // com o apelido da claquete (#120, #154), a claquete da pauta aparece ao passar o mouse
  const texto = <span className="pauta-texto" title={linha.original ? `Claquete: ${linha.original}` : undefined}>{linha.semVersao}</span>;
  // o código das versões colado no fim do nome (#152), fora do marca-texto
  return (
    <span className="pauta-nome-com-versoes">
      {alta ? <MarcaTexto traco={tracoDe(linha.chave ?? linha.id)}>{texto}</MarcaTexto> : texto}
      <Versoes linha={linha} />
    </span>
  );
}

/** Abre a claquete (#162): o card de onde ela veio (o painel cresce dele) e se veio pelo lápis do apelido. */
export type AbrirClaquete = (linha: LinhaDaPauta, origem: HTMLElement | null, peloLapis?: boolean) => void;

/** O nome do lápis e do item do menu: dar ou editar o apelido (o que a claquete já tem). */
const nomeDoLapis = (linha: LinhaDaPauta) => (apelidoDaClaquete(linha.texto) ? 'Editar o apelido' : 'Dar um apelido');

/**
 * Um item da pauta, como os cards da agenda (No Trello, #162): a claquete (com as versões e a produção da arte), que abre
 * a ficha num clique; o lápis do apelido aparece ao passar o mouse, e o clique direito tem "Dar um apelido". A tarefa
 * tem outro visual e não abre nada. Na grade da Semana, `compacta` (a produção só em hoje, `comProducao`).
 * @param i a posição do card na lista, para a entrada em cascata
 */
export function ItemDaPauta({ linha, abrir, compacta = false, comProducao = true, i = 0 }: { linha: LinhaDaPauta; abrir: AbrirClaquete; compacta?: boolean; comProducao?: boolean; i?: number }) {
  useApelidos();
  const l = comApelidoNaPauta(linha);
  const card = useRef<HTMLLIElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const fecharMenu = useCallback(() => setMenu(null), []);
  const claquete = l.tipo === 'claquete';
  const podeApelidar = claquete && armazenamento.tipo === 'servidor';
  const lapis = nomeDoLapis(linha);
  const etapa = claquete ? (resumoDaProducao(l.producoes)?.etapa ?? 'sem-card') : 'tarefa';
  return (
    <li
      ref={card}
      className={`pauta-item pauta-${l.tipo}${compacta ? ' compacta' : ''}`}
      data-tipo={l.tipo}
      data-etapa={etapa}
      style={{ '--i': Math.min(i, 8) } as CSSProperties}
      onContextMenu={
        podeApelidar
          ? (e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY });
            }
          : undefined
      }
    >
      {claquete ? (
        <button type="button" className="pauta-claquete-botao" aria-haspopup="dialog" onClick={() => abrir(linha, card.current)}>
          <TextoDaClaquete linha={l} />
          {comProducao && <ProducaoDaClaquete linha={l} />}
        </button>
      ) : (
        <span className="pauta-tarefa-corpo">
          <span className="pauta-nome-com-versoes">
            <span className="pauta-texto">{l.semVersao}</span>
            <Versoes linha={l} />
          </span>
          {comProducao && <span className="pauta-producao sem-card">tarefa</span>}
        </span>
      )}
      {/* com o mouse, o lápis do apelido aparece no canto do card, como na agenda */}
      {podeApelidar && (
        <button type="button" className="pauta-lapis" title={lapis} aria-label={`${lapis}: ${l.semVersao}`} onClick={() => abrir(linha, card.current, true)}>
          <Icone nome="lapis" tam={12} traco={1.9} />
        </button>
      )}
      {menu && <MenuDeContexto x={menu.x} y={menu.y} rotulo={`A claquete ${l.semVersao}`} itens={[{ nome: lapis, icone: 'lapis', fazer: () => abrir(linha, card.current, true) }]} fechar={fecharMenu} />}
    </li>
  );
}

/** O ⚑ com o número de avisos daquele editor naquele dia; o texto abre ao passar o mouse ou ao tocar. */
export function Avisos({ avisos, rotulo }: { avisos: LinhaDaPauta[]; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [fixo, setFixo] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  // o balão fica por cima da grade (que rola para o lado e cortaria o balão): preso à tela, embaixo do ⚑
  const [onde, setOnde] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const r = botao.current?.getBoundingClientRect();
    setOnde(
      aberto && r
        ? {
            top: r.bottom + 6,
            left: Math.max(8, Math.min(r.left - 10, innerWidth - 268)),
          }
        : null,
    );
  }, [aberto]);
  useEffect(() => {
    if (!aberto) return;
    const fechar = () => (setAberto(false), setFixo(false));
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) fechar();
    };
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    // rolou a página ou a grade: o balão sairia do lugar
    document.addEventListener('scroll', fechar, true);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
      document.removeEventListener('scroll', fechar, true);
    };
  }, [aberto]);
  const n = avisos.length;
  return (
    <span className="pauta-avisos" ref={caixa} onMouseEnter={() => setAberto(true)} onMouseLeave={() => fixo || setAberto(false)}>
      <button
        ref={botao}
        type="button"
        className="pauta-aviso-botao"
        aria-expanded={aberto}
        aria-label={`${n} ${n === 1 ? 'aviso' : 'avisos'} para ${rotulo}`}
        onClick={() => {
          // o toque fixa o balão (no celular não há o passar do mouse); o segundo toque fecha
          const abrir = !(aberto && fixo);
          setAberto(abrir);
          setFixo(abrir);
        }}
      >
        <span aria-hidden="true">⚑</span> {n}
      </button>
      {aberto && onde && (
        <span className="pauta-aviso-balao" role="tooltip" style={onde}>
          <span className="pauta-aviso-titulo">{n === 1 ? 'aviso' : 'avisos'}</span>
          {avisos.map((a) => (
            <span key={a.id} className="pauta-aviso-texto">
              {a.texto}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** "qua, 25/11". */
export function diaEscrito(iso: string) {
  const p = partes(iso);
  return `${DIAS_DA_SEMANA[p.semana]}, ${String(p.dia).padStart(2, '0')}/${String(p.mes + 1).padStart(2, '0')}`;
}
export const DIAS_POR_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** "sexta, 27 de novembro". */
export function diaPorExtenso(iso: string) {
  const p = partes(iso);
  return `${DIAS_POR_EXTENSO[p.semana]}, ${p.dia} de ${MESES[p.mes]}`;
}
/** "24/11 21:46", no fuso de São Paulo. */
const instanteEscrito = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const vizinho = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** "hoje", "ontem", "amanhã" ou ''. */
export const relativoA = (hoje: string, d: string) => (d === hoje ? 'hoje' : d === vizinho(hoje, -1) ? 'ontem' : d === vizinho(hoje, 1) ? 'amanhã' : '');
export const turnoEscrito = (t: LinhaDaPauta['turno']) => (t ? `${t.inicio}${t.fim ? `–${t.fim}` : ''}` : '');

/** A claquete aberta: a linha, o card de onde ela veio e o pedido do lápis (o campo do apelido já aberto). */
export interface ClaqueteNaTela {
  linha: LinhaDaPauta;
  origem: HTMLElement | null;
  peloLapis: boolean;
}

/**
 * Onde a claquete abre (#160, alternativa A, escolhida pelo usuário): o card aberto no centro (CardAberto), que cresce
 * do card clicado e volta para ele ao fechar; no celular, a tela toda. Dentro, a ficha da claquete.
 */
export function ClaqueteAberta({ aberta, linhas, hoje, voce, fechar }: { aberta: ClaqueteNaTela; linhas: readonly LinhaDaPauta[]; hoje: string; voce: string | null | undefined; fechar: () => void }) {
  return (
    <CardAberto origem={aberta.origem} titulo="pauta-ficha-titulo" fechar={fechar}>
      <FichaDaClaquete linha={aberta.linha} linhas={linhas} hoje={hoje} voce={voce} peloLapis={aberta.peloLapis} />
    </CardAberto>
  );
}

/**
 * A ficha da claquete (#96), no card aberto: onde ela está na pauta, a etapa, o apelido (pelo lápis ao lado do nome,
 * #156), as linhas da mesma atração com versões diferentes juntas (a mesma chave), os dias em que ela aparece na pauta
 * lida, a produção da arte de cada praça e os avisos da posição naquele dia.
 */
export function FichaDaClaquete({ linha: daPauta, linhas: todas, hoje, voce, peloLapis = false }: { linha: LinhaDaPauta; linhas: readonly LinhaDaPauta[]; hoje: string; voce?: string | null; peloLapis?: boolean }) {
  useApelidos();
  const linha = comApelidoNaPauta(daPauta);
  const linhas = todas.filter((l) => l.tipo === 'claquete' && (l.id === linha.id || (!!linha.chave && l.chave === linha.chave))).map(comApelidoNaPauta);
  const producoes = [...new Map(linhas.flatMap((l) => l.producoes ?? []).map((p) => [p.id, p])).values()].sort((a, b) => a.praca.localeCompare(b.praca));
  const avisos = todas.filter((l) => l.tipo === 'aviso' && l.dia === daPauta.dia && l.editor === daPauta.editor);
  const ligado = useCodigoDasVersoes();
  const resumo = resumoDaProducao(producoes);
  const podeMudar = armazenamento.tipo === 'servidor';
  // o lápis (o do card ou o daqui) pede o campo do apelido aberto
  const [pedidoDoLapis, setPedidoDoLapis] = useState(peloLapis ? 1 : 0);
  const relativo = (d: string) => relativoA(hoje, d);
  const rel = relativo(daPauta.dia);
  // o código das versões no fim do nome, uma vez só (#152), se a pessoa liga
  const titulo = (
    <span>
      {linha.semVersao}
      <Versoes linha={linha} />
    </span>
  );
  const lapis = nomeDoLapis(daPauta);
  return (
    <div className="pauta-ficha">
      <div className="pauta-ficha-topo">
        <span className="rotulo">
          Claquete · {diaPorExtenso(daPauta.dia)}
          {rel && <span className="pauta-ficha-rel"> {rel}</span>}
        </span>
        <FecharOCardAberto rotulo="Fechar a ficha" />
      </div>
      <h2 id="pauta-ficha-titulo">
        {resumo?.alta ? <MarcaTexto traco={tracoDe(linha.chave ?? linha.id)}>{titulo}</MarcaTexto> : titulo}
        {podeMudar && (
          <button type="button" className="pauta-ficha-lapis" title={lapis} aria-label={lapis} onClick={() => setPedidoDoLapis((n) => n + 1)}>
            <Icone nome="lapis" tam={14} traco={1.9} />
          </button>
        )}
      </h2>
      <p className="pauta-ficha-onde">
        {!daPauta.editor ? (
          <>
            Sobrou, <b>sem editor</b>
          </>
        ) : ehDaPessoa(daPauta.editor, voce) ? (
          <b>Na sua pauta</b>
        ) : (
          <>
            Na pauta de <b>{daPauta.editor}</b>
          </>
        )}
        {daPauta.turno && <> · {turnoEscrito(daPauta.turno)}</>}
      </p>
      {/* o apelido da claquete (#154), com ou sem roteiro no PROMeiro; o lápis abre o campo (#156) */}
      <ApelidoDaClaquete alvo={{ claquete: daPauta.texto }} claquete={daPauta.texto} versoes={lidasDaLinha(daPauta)} dia={daPauta.dia} podeMudar={podeMudar} pedidoDoLapis={pedidoDoLapis} />

      <h3>Produção da arte</h3>
      <div className="pauta-ficha-producao" data-etapa={resumo?.etapa ?? 'sem-card'}>
        <span className="pauta-ficha-ponto" aria-hidden="true" />
        <div>
          <div className="pauta-ficha-etapa">{resumo ? ROTULO_DA_ETAPA[resumo.etapa] : 'Sem card'}{resumo?.alta && ' · prioridade alta'}</div>
          <div className="pauta-ficha-mais">{resumo ? [resumo.designers.join(', ') || 'sem designer', ...resumo.pracas].join(' · ') : 'nenhuma Produção achada pela claquete'}</div>
        </div>
        <div className="pauta-ficha-artes">
          {resumo?.artes ?? '–'}
          <small>{resumo?.artes === 1 ? 'arte' : 'artes'}</small>
        </div>
      </div>
      {producoes.length > 1 || producoes.some((p) => p.praca) ? (
        <table className="pauta-ficha-tabela">
          <thead>
            <tr>
              <th scope="col">Praça</th>
              <th scope="col">Etapa</th>
              <th scope="col">Artes</th>
              <th scope="col">Designer</th>
            </tr>
          </thead>
          <tbody>
            {producoes.map((p: ProducaoNaPauta) => (
              <tr key={p.id} data-praca={p.praca}>
                <td className="pauta-ficha-praca">{p.praca || '—'}</td>
                <td>
                  <span className="pauta-producao" data-etapa={p.etapa}>
                    <span className="pauta-etapa">{ROTULO_DA_ETAPA[p.etapa]}</span>
                  </span>
                  {p.etapa === 'entregue' && p.entregaEm && <small className="pauta-ficha-quando">{instanteEscrito(p.entregaEm)}</small>}
                  {p.alta && <small className="pauta-ficha-quando">prioridade ALTA</small>}
                </td>
                <td>{p.artes ?? '—'}</td>
                <td>{p.designers.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <h3>Na pauta</h3>
      <table className="pauta-ficha-tabela">
        <thead>
          <tr>
            <th scope="col">Dia</th>
            {ligado && <th scope="col">Versão</th>}
            <th scope="col">Turno</th>
            <th scope="col">Editor</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className={l.dia === hoje ? 'hoje' : ''}>
              <td>
                {diaEscrito(l.dia)} {relativo(l.dia) && <span className="pauta-dia-rel">{relativo(l.dia)}</span>}
              </td>
              {/* as linhas da mesma atração com versões diferentes: o código de cada uma, só com a opção ligada */}
              {ligado && (
                <td className="pauta-ficha-versao" title={l.versoes.length ? dicaDasVersoes(l.versoes, deOndeNaLinha(l)) : undefined}>
                  {sufixoDasVersoes(l.versoes) || '—'}
                </td>
              )}
              <td className="pauta-turno">{turnoEscrito(l.turno) || '—'}</td>
              <td>{l.editor || <em>sem editor</em>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Avisos</h3>
      {avisos.length ? (
        <ul className="pauta-ficha-avisos">
          {avisos.map((a) => (
            <li key={a.id}>
              <small>{a.editor ? 'para a posição' : 'recado do dia'}</small>
              {a.texto}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pauta-nenhum">nenhum aviso</p>
      )}
    </div>
  );
}

/** O endereço da Pauta: a Semana (a segunda-feira; sem ela, a de hoje) ou, com `dia`, o Dia ('' é hoje). */
export interface EnderecoDaPauta {
  semana?: string;
  dia?: string;
}

/** O endereço da pauta no hash: #/pauta, #/pauta/semana/AAAA-MM-DD, #/pauta/dia e #/pauta/dia/AAAA-MM-DD; null fora dela. */
export function enderecoDaPauta(hash: string): EnderecoDaPauta | null {
  const d = /^#\/pauta\/dia(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/.exec(hash);
  if (d) return { dia: d[1] ?? '' };
  const s = /^#\/pauta(?:\/semana\/(\d{4}-\d{2}-\d{2}))?\/?$/.exec(hash);
  return s ? { semana: s[1] } : null;
}
export const hashDaPauta = (e: EnderecoDaPauta) => (e.dia !== undefined ? `#/pauta/dia${e.dia ? `/${e.dia}` : ''}` : `#/pauta${e.semana ? `/semana/${e.semana}` : ''}`);

/** Onde a entrada da pauta (no topo do PROMeiro) leva: a visão que a pessoa escolheu por último (#98), hoje. O endereço
    continua valendo como está: #/pauta é sempre a Semana, para o link mandado a um colega abrir igual. */
export const entradaDaPauta = (): EnderecoDaPauta => (escolhaLembradaDaPauta().visao === 'dia' ? { dia: '' } : {});

/** A Semana e o Dia (#97): a troca da visão, no topo das duas. A troca é a escolha da pessoa: o PROMeiro lembra (#98). */
export function VisaoDaPauta({ visao, semana, dia }: { visao: 'semana' | 'dia'; semana: () => void; dia: () => void }) {
  const escolher = (v: 'semana' | 'dia', ir: () => void) => {
    void lembrarNaPauta('visao', v);
    ir();
  };
  return (
    <div className="segmento pauta-visao" role="radiogroup" aria-label="Visão da pauta">
      <button type="button" role="radio" aria-checked={visao === 'semana'} onClick={() => escolher('semana', semana)}>
        Semana
      </button>
      <button type="button" role="radio" aria-checked={visao === 'dia'} onClick={() => escolher('dia', dia)}>
        Dia
      </button>
    </div>
  );
}

/* ---------- os filtros pessoais, a cópia de reserva, o resumo do administrador e a releitura (#99) ---------- */

/** "14:20" hoje; "14:20 de 26/11" em outro dia (em São Paulo). */
export function horaEscrita(iso: string) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dia = diaEmSaoPaulo(d);
  return dia === diaEmSaoPaulo() ? hora : `${hora} de ${Number(dia.slice(8))}/${dia.slice(5, 7)}`;
}

/** Um número do resumo do administrador, com o contador da agenda (#170): conta do valor antigo até o novo quando a
    semana na tela muda (ou a releitura traz outro), e a palavra acompanha o número à vista. Com o movimento reduzido, o
    número só troca e esmaece. */
function ContaDoResumo({ n, um, varios }: { n: number; um: string; varios: string }) {
  const el = useRef<HTMLSpanElement>(null);
  useEsmaeceAoMudar(el, n);
  return (
    <span ref={el} className={n ? 'pauta-resumo-conta falta' : 'pauta-resumo-conta'}>
      <NumeroQueConta valor={n} um={um} varios={varios} />
    </span>
  );
}

/** O aviso da cópia de reserva (o banco do Teable não respondeu) e, para o administrador, o resumo discreto. */
export function SobreALeitura({ leitura }: { leitura: (LeituraDaPauta & { alteradoEm: string | null }) | null }) {
  if (!leitura) return null;
  const r = leitura.resumo;
  return (
    <>
      {leitura.origem === 'copia' && leitura.copiaEm && (
        <p className="pauta-copia" role="status">
          O banco do Teable não respondeu: esta é a cópia da pauta das {horaEscrita(leitura.copiaEm)}. A página tenta de novo a cada minuto.
        </p>
      )}
      {r && (
        <p className="pauta-resumo" aria-label="Resumo do administrador">
          <ContaDoResumo n={r.semEditor} um="linha sem editor" varios="linhas sem editor" />
          <ContaDoResumo n={r.semCard} um="claquete sem card" varios="claquetes sem card" />
          <span>{r.alteradoEm ? `pauta alterada às ${horaEscrita(r.alteradoEm)}` : 'sem alteração registrada'}</span>
        </p>
      )}
    </>
  );
}

/** Relê a pauta a cada minuto com a aba à vista (a cadência da agenda), e de novo quando a aba volta à vista ou ganha
    o foco. */
export function useReleitura(reler: () => void) {
  useEffect(() => {
    const deNovo = () => {
      if (document.visibilityState === 'visible') reler();
    };
    const t = setInterval(deNovo, LER_ANDAMENTO_MS);
    document.addEventListener('visibilitychange', deNovo);
    window.addEventListener('focus', deNovo);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', deNovo);
      window.removeEventListener('focus', deNovo);
    };
  }, [reler]);
}
