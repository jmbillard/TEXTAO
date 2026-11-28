import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { apelidoDoRoteiro, useApelidos } from '../dados/apelidos';
import { NomeDaClaquete, versoesDoResumo } from './Apelido';
import { comecarRoteiro, exibicaoLembrada, lembrarExibicao, lerMeusRoteiros, lerRoteirosEscritos, type MeuRoteiro, type MeusRoteiros as Lidos, type Resumo, type RoteirosEscritos } from '../dados/armazenamento';
import { EXIBICOES, type AreaDosRoteiros, type Exibicao } from '../modelo/areas';
import { CICLO, frasesDoCiclo, type CicloDoRoteiro, type EstadoDoCiclo as Estado } from '../modelo/cicloDoRoteiro';
import { agruparPorDia, LER_ANDAMENTO_MS, type GrupoDia } from './fila';
import { Icone, type NomeIcone } from './icones';
import { plural } from './util';
import { RoteiroAberto } from './RoteiroAberto';
import './areas.css';
import { AbaComRabisco, BolinhaDeEstado, NadaNaBusca, Vazio } from './pecas';
import { BuscaNaLupa } from './BuscaNaLupa';
import { ABAS_DOS_ROTEIROS, bateComABusca, escritosDaAba, tituloParaMostrar, type AbaDosRoteiros } from '../modelo/escrito';
import { CASCATA_MS, NA_CASCATA } from './cena';
import { quandoComecou } from './util';
import type { CSSProperties } from 'react';

/* "Meus roteiros" do Redator e do Editor (#101): a lista simples, por dia, dos roteiros guardados no PROMeiro em que a
   pessoa é o redator (ou o editor), pelo nome do cadastro ligado ao e-mail dela. Cada roteiro mostra o seu estado no
   ciclo (#102), os passos com a data e quem da arte está com ele; a lista se lê de novo na cadência da agenda. A pessoa
   escolhe no topo da lista como ver (#103): por dia, em quadro (uma coluna por estado do ciclo) ou por estado (uma
   lista agrupada, boa no celular); o PROMeiro lembra a escolha por pessoa e por área. Um toque abre o roteiro, só para
   leitura (#104, RoteiroAberto). O administrador vê os roteiros de todos, com o filtro "de quem" (#105). Nada vem do
   Trello.

   No Redator, é a tela de "Roteiros" (#189): a busca (BuscaNaLupa), o Novo roteiro e as abas meus, da equipe, sendo
   escritos e enviados. A aba "meus" é a lista do ciclo, com os Roteiros que a pessoa escreve no PROMeiro no Escrevendo;
   as outras listam os escritos no PROMeiro que ela lê. Um toque num escrito abre a folha de escrita. A mesma tela é o
   caminho "Roteiros" da Designer e da coordenação (#/roteiros). */

interface Props {
  area: AreaDosRoteiros;
  /** a linha do logo: o caminho "PROMeiro / redator ▾", a Pauta da edição e o perfil */
  topo: ReactNode;
  /** o roteiro aberto, só para leitura (#104): a lista lida serve à navegação dele */
  aberto?: string;
  abrir: (id: string) => void;
  /** do roteiro aberto de volta à lista */
  voltar: () => void;
  /** o administrador (#105): vê os roteiros de todos, com o filtro "de quem" */
  admin?: boolean;
  /** "Roteiros" (#189), só no Redator: abre a folha de escrita de um escrito no PROMeiro; a aba de entrada */
  escrita?: { abrir: (id: string) => void; aba?: AbaDosRoteiros };
}

const OUTRO: Record<AreaDosRoteiros, { campo: 'redator' | 'editor'; rotulo: string }> = {
  redator: { campo: 'editor', rotulo: 'edição' },
  editor: { campo: 'redator', rotulo: 'redator' },
};
/** O rótulo do próprio campo da área, quando a lista é de todos (#105): "redator: Fulana · edição: Sicrano". */
const ROTULO_DA_AREA: Record<AreaDosRoteiros, string> = { redator: 'redator', editor: 'edição' };

/** Um ponto por passo do ciclo (os de antes do PROMeiro, vazados), ligados por um traço. */
function TrilhaDoCiclo({ ciclo }: { ciclo: CicloDoRoteiro }) {
  return (
    <span className="trilha-ciclo" aria-hidden="true">
      {ciclo.passos.map((p, i) => (
        <span key={p.id} className="trilha-passo">
          {i > 0 && <u className={p.situacao === 'feito' || p.situacao === 'agora' ? 'feito' : ''} />}
          <i className={p.situacao} />
        </span>
      ))}
    </span>
  );
}

/** O nome do roteiro na lista: o apelido ou a claquete; o Roteiro escrito no PROMeiro, sem claquete até o Enviar, pelo
    título (#189). */
function nomeNaFicha(r: Resumo) {
  const nome = apelidoDoRoteiro(r.id) || r.meta.claquete;
  if (nome) return <NomeDaClaquete nome={nome} versoes={versoesDoResumo(r)} />;
  return r.escrito ? <span className="titulo-escrito">{tituloParaMostrar(r.meta)}</span> : 'Sem claquete';
}

const nomeDoEstado = (id: Estado) => CICLO.find((c) => c.id === id)?.nome ?? '';

/** A trilha curta do ciclo e o nome do estado. */
function EstadoDoCiclo({ ciclo }: { ciclo: CicloDoRoteiro }) {
  return (
    <span className="estado-ciclo">
      <TrilhaDoCiclo ciclo={ciclo} />
      <b className={`estado-nome e-${ciclo.estado}`}>{nomeDoEstado(ciclo.estado)}</b>
    </span>
  );
}

/** Os estados do PROMeiro, um por coluna do quadro e um por grupo da exibição por estado; os da aprovação ficam "em
    breve", logo depois do Escrevendo (#189). */
const ESTADOS = CICLO.filter((c) => !c.antes);
const ANTES = CICLO.filter((c) => c.antes);
/** O estado do roteiro no ciclo; o roteiro ainda sem ciclo está na revisão (chegou à fila). */
const estadoDe = (r: MeuRoteiro): Estado => r.ciclo?.estado ?? 'revisao';

const ICONE_DA_EXIBICAO: Record<Exibicao, NomeIcone> = { dia: 'calendario', quadro: 'quadro', estado: 'lista' };
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** A data de exibição curta: "qui, 3/12"; sem data completa, "sem data". */
function diaCurto(iso: string | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return 'sem data';
  const [a, m, d] = (iso as string).split('-').map(Number);
  return `${DIAS_CURTOS[new Date(a, m - 1, d).getDay()]}, ${d}/${m}`;
}
/** Os roteiros de um estado, na ordem da lista (pela data de exibição); os que já foram ao ar, o mais recente primeiro. */
function doEstado(roteiros: MeuRoteiro[], estado: Estado) {
  const deles = roteiros.filter((r) => estadoDe(r) === estado);
  return estado === 'exibido' ? deles.reverse() : deles;
}

/** A escolha da exibição, no topo da lista. "lembrado" aparece um instante depois que o servidor guardou. */
function EscolhaDaExibicao({ atual, escolher, lembrado }: { atual: Exibicao; escolher: (e: Exibicao) => void; lembrado: boolean }) {
  return (
    <span className="exibir" role="group" aria-label="Exibir" title="O PROMeiro lembra a sua escolha">
      <span className="exibir-rotulo">exibir</span>
      {EXIBICOES.map((e) => (
        <button key={e.id} type="button" data-exibir={e.id} aria-pressed={atual === e.id} aria-label={e.nome} onClick={() => escolher(e.id)}>
          <Icone nome={ICONE_DA_EXIBICAO[e.id]} tam={14} />
          <span className="exibir-nome">{e.nome}</span>
        </button>
      ))}
      {lembrado && (
        <span className="exibir-lembrado" role="status">
          lembrado
        </span>
      )}
    </span>
  );
}

/** O filtro "de quem" do administrador (#105): "de todos" ou de uma pessoa, com quantos roteiros cada uma tem. */
function FiltroDeQuem({ de, pessoas, escolher }: { de: string; pessoas: { nome: string; roteiros: number }[]; escolher: (de: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const tecla = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('pointerdown', fora, true);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('keydown', tecla);
    };
  }, [aberto]);
  const total = pessoas.reduce((n, p) => n + p.roteiros, 0);
  const item = (valor: string, rotulo: string, n: number) => (
    <button
      key={valor}
      type="button"
      className="menu-item"
      role="menuitemradio"
      aria-checked={de === valor}
      onClick={() => {
        setAberto(false);
        if (valor !== de) escolher(valor);
      }}
    >
      <span className="de-quem-nome">{rotulo}</span>
      <span className="de-quem-conta">{n}</span>
    </button>
  );
  return (
    <span className="de-quem-ancora" ref={caixa}>
      <button type="button" className="de-quem" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        <Icone nome="pessoas" tam={14} /> de <b>{de === 'todos' ? 'todos' : de}</b>
        <Icone nome="baixo" tam={13} traco={2.2} />
      </button>
      {aberto && (
        <div className="menu de-quem-menu" role="menu" aria-label="De quem">
          {item('todos', 'De todos', total)}
          <hr />
          {pessoas.map((p) => item(p.nome, p.nome, p.roteiros))}
        </div>
      )}
    </span>
  );
}

export function MeusRoteiros({ area, topo, aberto, abrir, voltar, admin = false, escrita }: Props) {
  // o apelido da claquete (#120) aparece no lugar dela: redesenha quando ele muda
  useApelidos();
  const [lido, setLido] = useState<Lidos | null>(null);
  // o administrador vê os de todos (#105); o filtro vale nesta visita (e no roteiro aberto, que usa a mesma lista)
  const [deQuem, setDeQuem] = useState('todos');
  const de = admin ? deQuem : undefined;
  const [erro, setErro] = useState('');
  // a exibição lembrada da área (o App remonta a tela a cada área); o estado escolhido na faixa vale só nesta visita
  const [exibicao, setExibicao] = useState<Exibicao>(() => exibicaoLembrada(area));
  const [soEstado, setSoEstado] = useState<Estado | null>(null);
  // "Roteiros" (#189): a busca, a aba e os escritos no PROMeiro que a pessoa lê
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<AbaDosRoteiros>(escrita?.aba ?? 'meus');
  const [escritos, setEscritos] = useState<RoteirosEscritos | null>(null);
  const [comecando, setComecando] = useState(false);
  const comEscrita = !!escrita;
  const [lembrado, setLembrado] = useState(false);
  const prazoDoLembrado = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(prazoDoLembrado.current), []);
  const escolher = (e: Exibicao) => {
    if (e === exibicao) return;
    setExibicao(e);
    setSoEstado(null);
    setLembrado(false);
    clearTimeout(prazoDoLembrado.current);
    lembrarExibicao(area, e).then(
      (guardou) => {
        if (!guardou) return;
        setLembrado(true);
        prazoDoLembrado.current = setTimeout(() => setLembrado(false), 2400);
      },
      // sem guardar, a lista troca do mesmo jeito; volta à de antes só na próxima visita
      () => {},
    );
  };
  useEffect(() => {
    let vivo = true;
    setLido(null);
    setErro('');
    const ler = (primeira: boolean) => {
      if (comEscrita) void lerRoteirosEscritos().then((d) => vivo && setEscritos(d), () => vivo && primeira && setEscritos({ podeComecar: false, roteiros: [] }));
      return lerMeusRoteiros(area, de).then(
        (d) => {
          if (!vivo) return;
          setLido(d);
          setErro('');
        },
        // na releitura, o erro não apaga a lista que já está à vista
        (e) => vivo && primeira && setErro(e instanceof Error ? e.message : 'Não deu para ler os roteiros.'),
      );
    };
    void ler(true);
    // o ciclo muda sozinho (o envio, a Produção, a data): na cadência da agenda, a cada minuto com a aba à vista, e de
    // novo quando a aba volta à vista ou ganha o foco
    const deNovo = () => {
      if (document.visibilityState === 'visible') void ler(false);
    };
    const t = setInterval(deNovo, LER_ANDAMENTO_MS);
    document.addEventListener('visibilitychange', deNovo);
    window.addEventListener('focus', deNovo);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', deNovo);
      window.removeEventListener('focus', deNovo);
    };
  }, [area, de, comEscrita]);

  if (aberto) return <RoteiroAberto area={area} id={aberto} lido={lido} topo={topo} abrir={abrir} voltar={voltar} />;

  // a busca (#189) vale para a lista inteira, em qualquer exibição
  const vistos = (lido?.roteiros ?? []).filter((r) => !comEscrita || bateComABusca(r, busca));
  const { proximos, exibidos } = agruparPorDia(vistos);
  // cada roteiro, em qualquer exibição, abre com um toque ou com Enter; o escrito no PROMeiro abre na folha de escrita
  const abrirUm = (r: { id: string; escrito?: string }) => (r.escrito && escrita ? escrita.abrir(r.id) : abrir(r.id));
  const abreCom = (r: { id: string; escrito?: string }) => ({
    tabIndex: 0,
    onClick: () => abrirUm(r),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter') abrirUm(r);
    },
  });
  const outro = OUTRO[area];
  // na lista de todos, cada roteiro diz também quem é o redator (ou o editor); na de uma pessoa, só o outro campo
  const deTodos = lido?.de === 'todos';
  const quem = (r: MeuRoteiro) => `${deTodos ? `${ROTULO_DA_AREA[area]}: ${r.meta[area] || '—'} · ` : ''}${outro.rotulo}: ${r.meta[outro.campo] || '—'}`;
  // agruparPorDia devolve os resumos; o ciclo vem do roteiro lido
  const porId = new Map((lido?.roteiros ?? []).map((r) => [r.id, r]));
  const ficha = (resumo: Resumo) => {
    const r = porId.get(resumo.id) as MeuRoteiro;
    const passos = r.ciclo ? frasesDoCiclo(r.ciclo.passos) : [];
    return (
      <li key={r.id} className="ficha ficha-minha" data-estado={r.ciclo?.estado} {...abreCom(r)}>
        <span className="ficha-claquete">
          <b>{nomeNaFicha(r)}</b>
          <span>
            {r.meta.programa || 'sem atração'}
            {r.meta.praca && <span className="ficha-praca">{r.meta.praca}</span>}
          </span>
          <span className="ficha-de">{quem(r)}</span>
        </span>
        {r.ciclo && (
          <span className="ficha-ciclo">
            <EstadoDoCiclo ciclo={r.ciclo} />
            {passos.length > 0 && (
              <small className="passos-ciclo">
                {/* cada passo inteiro numa linha: a quebra fica entre eles, nunca no meio da data */}
                {passos.map((f, i) => (
                  <span key={f}>
                    {i > 0 && ' · '}
                    <span className="passo-ciclo">{f}</span>
                  </span>
                ))}
              </small>
            )}
            {r.daArte?.length > 0 && <small className="com-quem">com {r.daArte.join(' e ')}</small>}
          </span>
        )}
        <span className="ficha-artes-minha">{plural(r.nArtes, 'arte', 'artes')}</span>
      </li>
    );
  };
  const dia = (g: GrupoDia) => (
    <section key={g.chave} className="dia" aria-label={`${g.titulo}, ${g.subtitulo}`}>
      <div className="dia-topo">
        <h3>
          {g.titulo}
          <span>{g.subtitulo}</span>
        </h3>
      </div>
      <ul className="fichas">{g.itens.map(ficha)}</ul>
    </section>
  );
  // sem gênero, como a sugestão dos Cadastros (#106)
  const papel = area === 'redator' ? 'redator' : 'editor';
  const roteiros = vistos;
  const total = (lido?.roteiros ?? []).length;

  // quadro: uma coluna por estado do ciclo; os passos da aprovação numa coluna apagada, "em breve". O Escrevendo (#189)
  // só no Redator: no Editor, o roteiro chega depois dele
  const estadosDaArea = ESTADOS.filter((c) => c.id !== 'escrevendo' || area === 'redator');
  const cartao = (r: MeuRoteiro) => (
    <li key={r.id} className="cartao-meu" data-estado={estadoDe(r)} {...abreCom(r)}>
      <b>{nomeNaFicha(r)}</b>
      <span>
        {r.meta.programa || 'sem atração'} · {diaCurto(r.meta.dataExibicao)}
      </span>
      <span>
        {plural(r.nArtes, 'arte', 'artes')} · {quem(r)}
      </span>
      {r.daArte?.length > 0 && <small className="com-quem">com {r.daArte.join(' e ')}</small>}
    </li>
  );
  const quadro = (
    <div className="quadro-rolar">
      <div className={`quadro-meus${area === 'redator' ? ' com-escrevendo' : ''}`}>
        {estadosDaArea.map((c) => {
          const deles = doEstado(roteiros, c.id);
          return [
            // a aprovação, em breve, entre o Escrevendo e a revisão (no Editor, que não tem o Escrevendo, na frente)
            c.id === 'revisao' && (
              <section key="antes" className="coluna-meus antes" aria-label="Aprovação, em breve">
                <h4>Aprovação</h4>
                <ol>
                  {ANTES.map((a) => (
                    <li key={a.id}>{a.nome}</li>
                  ))}
                </ol>
                <p>em breve no PROMeiro</p>
              </section>
            ),
            <section key={c.id} className="coluna-meus" data-estado={c.id} aria-label={`${c.nome}, ${plural(deles.length, 'roteiro', 'roteiros')}`}>
              <h4>
                {c.nome}
                <span>{deles.length}</span>
              </h4>
              {deles.length ? <ul className="cartoes-meus">{deles.map(cartao)}</ul> : <Vazio como="span" pequeno className="coluna-vazia">nenhum</Vazio>}
            </section>,
          ];
        })}
      </div>
    </div>
  );

  // por estado: a faixa do ciclo com quantos há em cada estado (um toque mostra só aquele) e a lista agrupada
  const linha = (r: MeuRoteiro) => (
    <li key={r.id} className="linha-meu" data-estado={estadoDe(r)} {...abreCom(r)}>
      <span className="linha-meu-quem">
        <b>{nomeNaFicha(r)}</b>
        <small>
          {r.meta.programa || 'sem atração'} · {quem(r)}
        </small>
      </span>
      {r.ciclo && <TrilhaDoCiclo ciclo={r.ciclo} />}
      <span className="linha-meu-dia">{diaCurto(r.meta.dataExibicao)}</span>
    </li>
  );
  const porEstado = (
    <>
      <div className={`faixa-ciclo${area === 'redator' ? ' com-escrevendo' : ''}`}>
        <span className="seg-ciclo antes" aria-hidden="true">
          <b>—</b>
          <span>{ANTES.map((c) => c.nome).join(' · ')} (em breve)</span>
        </span>
        {estadosDaArea.map((c) => (
          <button key={c.id} type="button" className="seg-ciclo" data-estado={c.id} aria-pressed={soEstado === c.id} onClick={() => setSoEstado((e) => (e === c.id ? null : c.id))}>
            <b>{doEstado(roteiros, c.id).length}</b>
            <span>{c.nome}</span>
          </button>
        ))}
      </div>
      <p className="faixa-nota">O ciclo de um roteiro, da esquerda para a direita. Toque num estado para ver só ele.</p>
      {estadosDaArea.filter((c) => !soEstado || soEstado === c.id).map((c) => {
        const deles = doEstado(roteiros, c.id);
        if (!deles.length) return soEstado ? <Vazio key={c.id} pequeno className="coluna-vazia">nenhum roteiro {c.nome.toLowerCase()} agora</Vazio> : null;
        return (
          <section key={c.id} className="grupo-estado" data-estado={c.id} aria-label={`${c.nome}, ${plural(deles.length, 'roteiro', 'roteiros')}`}>
            <div className="dia-topo">
              <h3>
                {c.nome}
                <span>{plural(deles.length, 'roteiro', 'roteiros')}</span>
              </h3>
            </div>
            <ul className="linhas-meus">{deles.map(linha)}</ul>
          </section>
        );
      })}
    </>
  );

  const porDia = (
    <>
      {proximos.length > 0 && <div className="dias">{proximos.map(dia)}</div>}
      {exibidos.length > 0 && (
        <details className="exibidos">
          <summary>
            Já foram ao ar <span>{plural(exibidos.reduce((n, g) => n + g.itens.length, 0), 'roteiro', 'roteiros')}</span>
          </summary>
          {exibidos.map(dia)}
        </details>
      )}
    </>
  );

  // "Roteiros" (#189): os escritos de cada aba, com a busca; o Novo roteiro abre a folha já com o cursor
  const dosEscritos = escritos?.roteiros ?? [];
  const naAba = (a: Exclude<AbaDosRoteiros, 'meus'>) => escritosDaAba(dosEscritos, a).filter((r) => bateComABusca(r, busca));
  const totalDaAba = (a: AbaDosRoteiros) => (a === 'meus' ? roteiros.length : naAba(a).length);
  const comecar = () => {
    if (!escrita || comecando) return;
    setComecando(true);
    comecarRoteiro().then(
      (r) => escrita.abrir(r.id),
      (e) => {
        setComecando(false);
        setErro(e instanceof Error ? e.message : 'Não deu para começar o roteiro.');
      },
    );
  };
  const abasDaEscrita = escrita && (
    <div className="abas-cad abas-roteiros" role="tablist" aria-label="Roteiros">
      {ABAS_DOS_ROTEIROS.map((a) => (
        <AbaComRabisco key={a.id} nome={a.nome} mostrarNome classe={`aba-${a.id}`} aba={{ ativa: aba === a.id, total: totalDaAba(a.id), abrir: () => setAba(a.id) }} />
      ))}
    </div>
  );
  const listaDaAba = escrita && aba !== 'meus' && (
    <ListaDosEscritos
      roteiros={naAba(aba)}
      lendo={!escritos}
      busca={busca}
      vazio={aba === 'equipe' ? 'ninguém da equipe escrevendo por aqui ainda' : aba === 'sendo' ? 'nenhum roteiro sendo escrito agora' : 'nenhum roteiro enviado ainda: o Enviar chega em breve'}
      abrir={escrita.abrir}
    />
  );

  return (
    <div className="pagina">
      {topo}
      <main className={`biblioteca meus-roteiros exibe-${exibicao}${escrita ? ` roteiros-escritos aba-${aba}` : ''}`} aria-busy={!erro && (!lido || (admin && lido.de !== deQuem))}>
        <div className={`fila-topo${escrita ? ' cabeca-com-lupa' : ''}`}>
          <div className="fila-titulo">
            <h2 className="titulo-serifa">{escrita ? 'Roteiros' : admin ? 'Roteiros' : 'Meus roteiros'}</h2>
            {lido && admin && (
              <p className="fila-conta">
                <span>
                  {total ? `${plural(total, 'roteiro', 'roteiros')} · ` : ''}
                  {deTodos ? `de todos os ${papel}es` : `${papel}: ${lido.de}`}
                </span>
              </p>
            )}
            {lido?.nome && !admin && (
              <p className="fila-conta">
                <span>{total ? `${plural(total, 'roteiro', 'roteiros')} · ` : ''}como {papel}: {lido.nome}</span>
              </p>
            )}
          </div>
          {escrita && (
            <span className="roteiros-acoes ao-lado-da-lupa">
              {escritos?.podeComecar && (
                <button type="button" className="botao primario novo-roteiro" onClick={comecar} disabled={comecando}>
                  <Icone nome="mais" tam={14} traco={2.2} /> Novo roteiro
                </button>
              )}
              <BuscaNaLupa className="lupa-da-cabeca" valor={busca} mudar={setBusca} ativa dica="Buscar título, claquete, atração ou pessoa" rotulo="Buscar nos roteiros" />
            </span>
          )}
        </div>
        {abasDaEscrita}
        {listaDaAba}
        {erro && <p className="aviso-meus erro" role="alert">{erro}</p>}
        {(!escrita || aba === 'meus') && conteudoDosMeus()}
      </main>
    </div>
  );

  function conteudoDosMeus() {
    // em "Roteiros" (#189), quem não tem cadastro de redator (a coordenação, o administrador) vê os que começou
    const semCadastro = lido && !admin && !lido.nome;
    const vazioDaEscrita = escrita && lido && !total;
    return (
      <>
        {vazioDaEscrita && <Vazio className="meus-vazio">{escritos?.podeComecar ? 'nenhum roteiro seu ainda: aperte “Novo roteiro” e saia escrevendo' : 'nenhum roteiro seu por aqui'}</Vazio>}
        {escrita && lido && total > 0 && !roteiros.length && busca.trim() && <NadaNaBusca termo={busca.trim()} onde="nos seus roteiros" />}
        {semCadastro && !escrita && (
          <p className="aviso-meus" role="status">
            O seu e-mail ainda não está ligado a um cadastro de {papel}. Quando um administrador puser o seu e-mail nos Cadastros, os seus roteiros como {papel} aparecem aqui.
          </p>
        )}
        {lido && !escrita && !admin && lido.nome && !total && (
          <p className="aviso-meus" role="status">
            Nenhum roteiro seu como {papel} por enquanto. Quando um roteiro seu chegar à fila da arte, ele aparece aqui.
          </p>
        )}
        {/* o administrador escolhe "de quem" (#105) no topo da lista, à esquerda da exibição */}
        {lido && ((admin && lido.pessoas) || ((lido.nome || escrita) && total > 0)) && (
          <div className="lista-meus">
            <div className="lista-meus-topo">
              {admin && lido.pessoas && <FiltroDeQuem de={deQuem} pessoas={lido.pessoas} escolher={setDeQuem} />}
              {total > 0 && <EscolhaDaExibicao atual={exibicao} escolher={escolher} lembrado={lembrado} />}
            </div>
            {total > 0 ? (
              exibicao === 'quadro' ? quadro : exibicao === 'estado' ? porEstado : porDia
            ) : (
              <p className="aviso-meus" role="status">
                {deTodos ? `Nenhum roteiro com ${papel} por enquanto.` : `Nenhum roteiro de ${lido.de} como ${papel} por enquanto.`} Quando um roteiro chegar à fila da arte, ele aparece aqui.
              </p>
            )}
          </div>
        )}
      </>
    );
  }
}

/** Os Roteiros escritos no PROMeiro de uma aba de "Roteiros" (#189): a mesma ficha da lista do ciclo, com o título, quem
    escreve, quando começou, a bolinha do estado, quem vê e se a pessoa escreve ou só lê. Entram em cascata. */
function ListaDosEscritos({ roteiros, lendo, busca, vazio, abrir }: { roteiros: (Resumo & { escrito: string })[]; lendo: boolean; busca: string; vazio: string; abrir: (id: string) => void }) {
  if (lendo) return <p className="aviso-meus" role="status">Lendo os roteiros…</p>;
  if (!roteiros.length) return busca.trim() ? <NadaNaBusca termo={busca.trim()} onde="nesta aba" /> : <Vazio className="meus-vazio">{vazio}</Vazio>;
  return (
    <ul className="fichas fichas-escritas">
      {roteiros.map((r, i) => (
        <li
          key={r.id}
          className="ficha ficha-minha ficha-escrita"
          data-estado={r.escrito}
          tabIndex={0}
          style={{ '--atraso': `${Math.min(i, NA_CASCATA) * CASCATA_MS}ms` } as CSSProperties}
          onClick={() => abrir(r.id)}
          onKeyDown={(e) => e.key === 'Enter' && abrir(r.id)}
        >
          <span className="ficha-claquete">
            <b>{nomeNaFicha(r)}</b>
            <span>
              {r.dono?.nome ? `por ${r.dono.nome}` : 'sem autor'}
              {r.criadoEm && ` · ${quandoComecou(r.criadoEm)}`}
            </span>
            <span className="ficha-de">{r.meu ? 'você escreve' : r.podeEditar ? (r.convidado ? 'convidado: você escreve' : 'você também escreve') : 'você lê'}</span>
          </span>
          <span className="ficha-ciclo">
            <span className="estado-ciclo">
              <BolinhaDeEstado estado={r.escrito === 'sendo-escrito' ? 'escrevendo' : 'entrada'} tam="ficha" />
              <b className={`estado-nome e-${r.escrito === 'sendo-escrito' ? 'escrevendo' : 'revisao'}`}>{r.escrito === 'sendo-escrito' ? 'Sendo escrito' : 'Enviado'}</b>
            </span>
            <small className="visto-por">
              <Icone nome={r.publico ? 'olho' : 'cadeado'} tam={12} traco={2} /> {r.publico ? 'visível para a equipe' : 'fechado'}
            </small>
          </span>
          <span className="ficha-artes-minha">{plural(r.nArtes, 'arte', 'artes')}</span>
        </li>
      ))}
    </ul>
  );
}
