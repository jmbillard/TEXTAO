import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { apelidoDoRoteiro, useApelidos } from '../dados/apelidos';
import { NomeDaClaquete, versoesDoResumo } from './Apelido';
import { exibicaoLembrada, lembrarExibicao, lerMeusRoteiros, type MeuRoteiro, type MeusRoteiros as Lidos, type Resumo } from '../dados/armazenamento';
import { EXIBICOES, type AreaDosRoteiros, type Exibicao } from '../modelo/areas';
import { CICLO, frasesDoCiclo, type CicloDoRoteiro, type EstadoDoCiclo as Estado } from '../modelo/cicloDoRoteiro';
import { agruparPorDia, LER_ANDAMENTO_MS, type GrupoDia } from './fila';
import { Icone, type NomeIcone } from './icones';
import { plural } from './util';
import { RoteiroAberto } from './RoteiroAberto';
import './areas.css';
import { Vazio } from './pecas';

/* "Meus roteiros" do Redator e do Editor (#101): a lista simples, por dia, dos roteiros guardados no PROMeiro em que a
   pessoa é o redator (ou o editor), pelo nome do cadastro ligado ao e-mail dela. Cada roteiro mostra o seu estado no
   ciclo (#102), os passos com a data e quem da arte está com ele; a lista se lê de novo na cadência da agenda. A pessoa
   escolhe no topo da lista como ver (#103): por dia, em quadro (uma coluna por estado do ciclo) ou por estado (uma
   lista agrupada, boa no celular); o PROMeiro lembra a escolha por pessoa e por área. Um toque abre o roteiro, só para
   leitura (#104, RoteiroAberto). O administrador vê os roteiros de todos, com o filtro "de quem" (#105). Nada vem do
   Trello. */

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

/** Os estados do PROMeiro, um por coluna do quadro e um por grupo da exibição por estado; os de antes ficam "em breve". */
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

export function MeusRoteiros({ area, topo, aberto, abrir, voltar, admin = false }: Props) {
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
    const ler = (primeira: boolean) =>
      lerMeusRoteiros(area, de).then(
        (d) => {
          if (!vivo) return;
          setLido(d);
          setErro('');
        },
        // na releitura, o erro não apaga a lista que já está à vista
        (e) => vivo && primeira && setErro(e instanceof Error ? e.message : 'Não deu para ler os roteiros.'),
      );
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
  }, [area, de]);

  if (aberto) return <RoteiroAberto area={area} id={aberto} lido={lido} topo={topo} abrir={abrir} voltar={voltar} />;

  const { proximos, exibidos } = agruparPorDia(lido?.roteiros ?? []);
  // cada roteiro, em qualquer exibição, abre com um toque ou com Enter
  const abreCom = (r: { id: string }) => ({
    tabIndex: 0,
    onClick: () => abrir(r.id),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter') abrir(r.id);
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
          <b>{apelidoDoRoteiro(r.id) || r.meta.claquete ? <NomeDaClaquete nome={apelidoDoRoteiro(r.id) || r.meta.claquete} versoes={versoesDoResumo(r)} /> : 'Sem claquete'}</b>
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
  const roteiros = lido?.roteiros ?? [];
  const total = roteiros.length;

  // quadro: uma coluna por estado do ciclo; os passos de antes do PROMeiro numa coluna apagada, "em breve"
  const cartao = (r: MeuRoteiro) => (
    <li key={r.id} className="cartao-meu" data-estado={estadoDe(r)} {...abreCom(r)}>
      <b>{apelidoDoRoteiro(r.id) || r.meta.claquete ? <NomeDaClaquete nome={apelidoDoRoteiro(r.id) || r.meta.claquete} versoes={versoesDoResumo(r)} /> : 'Sem claquete'}</b>
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
      <div className="quadro-meus">
        <section className="coluna-meus antes" aria-label="Antes, em breve">
          <h4>Antes</h4>
          <ol>
            {ANTES.map((c) => (
              <li key={c.id}>{c.nome}</li>
            ))}
          </ol>
          <p>em breve, quando o roteiro nascer aqui</p>
        </section>
        {ESTADOS.map((c) => {
          const deles = doEstado(roteiros, c.id);
          return (
            <section key={c.id} className="coluna-meus" data-estado={c.id} aria-label={`${c.nome}, ${plural(deles.length, 'roteiro', 'roteiros')}`}>
              <h4>
                {c.nome}
                <span>{deles.length}</span>
              </h4>
              {deles.length ? <ul className="cartoes-meus">{deles.map(cartao)}</ul> : <Vazio como="span" pequeno className="coluna-vazia">nenhum</Vazio>}
            </section>
          );
        })}
      </div>
    </div>
  );

  // por estado: a faixa do ciclo com quantos há em cada estado (um toque mostra só aquele) e a lista agrupada
  const linha = (r: MeuRoteiro) => (
    <li key={r.id} className="linha-meu" data-estado={estadoDe(r)} {...abreCom(r)}>
      <span className="linha-meu-quem">
        <b>{apelidoDoRoteiro(r.id) || r.meta.claquete ? <NomeDaClaquete nome={apelidoDoRoteiro(r.id) || r.meta.claquete} versoes={versoesDoResumo(r)} /> : 'Sem claquete'}</b>
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
      <div className="faixa-ciclo">
        <span className="seg-ciclo antes" aria-hidden="true">
          <b>—</b>
          <span>{ANTES.map((c) => c.nome).join(' · ')} (em breve)</span>
        </span>
        {ESTADOS.map((c) => (
          <button key={c.id} type="button" className="seg-ciclo" data-estado={c.id} aria-pressed={soEstado === c.id} onClick={() => setSoEstado((e) => (e === c.id ? null : c.id))}>
            <b>{doEstado(roteiros, c.id).length}</b>
            <span>{c.nome}</span>
          </button>
        ))}
      </div>
      <p className="faixa-nota">O ciclo de um roteiro, da esquerda para a direita. Toque num estado para ver só ele.</p>
      {ESTADOS.filter((c) => !soEstado || soEstado === c.id).map((c) => {
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

  return (
    <div className="pagina">
      {topo}
      <main className={`biblioteca meus-roteiros exibe-${exibicao}`} aria-busy={!erro && (!lido || (admin && lido.de !== deQuem))}>
        <div className="fila-topo">
          <div className="fila-titulo">
            <h2 className="titulo-serifa">{admin ? 'Roteiros' : 'Meus roteiros'}</h2>
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
        </div>
        {erro && <p className="aviso-meus erro" role="alert">{erro}</p>}
        {lido && !admin && !lido.nome && (
          <p className="aviso-meus" role="status">
            O seu e-mail ainda não está ligado a um cadastro de {papel}. Quando um administrador puser o seu e-mail nos Cadastros, os seus roteiros como {papel} aparecem aqui.
          </p>
        )}
        {lido && !admin && lido.nome && !total && (
          <p className="aviso-meus" role="status">
            Nenhum roteiro seu como {papel} por enquanto. Quando um roteiro seu chegar à fila da arte, ele aparece aqui.
          </p>
        )}
        {/* o administrador escolhe "de quem" (#105) no topo da lista, à esquerda da exibição */}
        {lido && ((admin && lido.pessoas) || (lido.nome && total > 0)) && (
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
      </main>
    </div>
  );
}
