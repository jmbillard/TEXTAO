import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { lerSemanaDaPauta } from '../dados/armazenamento';
import { iniciais } from '../dados/colaboracao';
import { ROTULO_DA_ETAPA, diaEmSaoPaulo, diasDaSemana, gradeDaSemana, resumoDaProducao, segundaDaSemana, semanaVizinha, type CelulaDaSemana, type LinhaDaPauta, type ProducaoNaPauta, type SemanaDaPauta } from '../modelo/pauta';
import { Icone } from './icones';
import { Marca, MarcaTexto, tracoDe } from './pecas';
import './pauta.css';

/* A Pauta da edição (#94): a Semana editor × dia, para qualquer pessoa logada. Uma linha por editor (na ordem do turno
   de costume; "sem editor" no fim), uma coluna por dia, de segunda a domingo. A célula traz o turno e as linhas da
   pauta daquele editor naquele dia: as claquetes, as tarefas (com outro visual) e, no lugar dos avisos, só o ⚑ com o
   número deles, que abre o texto ao passar o mouse ou ao tocar. As versões da chamada (#95) viram etiquetas legíveis,
   com o código pequeno ao lado. A claquete traz o que o PROMeiro sabe da produção da arte dela (#96): a etapa, as
   artes, os designers, a praça e o marca-texto da prioridade ALTA, ou "sem card"; um clique abre a ficha da claquete,
   por cima da Semana. Lida do Teable pelo servidor (nada do Trello). No
   celular e no tablet, a grade rola para o lado com a coluna dos nomes fixa e abre em hoje. */

interface Props {
  /** a segunda-feira da semana do endereço; sem ela, a semana de hoje */
  semana?: string;
  /** vai para outra semana (undefined: a de hoje) */
  irPara: (semana: string | undefined) => void;
  voltar: () => void;
}

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const partes = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return { dia: d.getUTCDate(), mes: d.getUTCMonth(), semana: d.getUTCDay() };
};

/** "23 a 29 de novembro", "30 de novembro a 6 de dezembro". */
function periodoEscrito(dias: string[]) {
  const a = partes(dias[0]);
  const b = partes(dias[dias.length - 1]);
  return a.mes === b.mes ? `${a.dia} a ${b.dia} de ${MESES[b.mes]}` : `${a.dia} de ${MESES[a.mes]} a ${b.dia} de ${MESES[b.mes]}`;
}

/** O ⚑ com o número de avisos daquele editor naquele dia; o texto abre ao passar o mouse ou ao tocar. */
function Avisos({ avisos, rotulo }: { avisos: CelulaDaSemana['avisos']; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [fixo, setFixo] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  // o balão fica por cima da grade (que rola para o lado e cortaria o balão): preso à tela, embaixo do ⚑
  const [onde, setOnde] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const r = botao.current?.getBoundingClientRect();
    setOnde(aberto && r ? { top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 10, innerWidth - 268)) } : null);
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

/** As versões da chamada como etiquetas ("amanhã", "nesta sex"), cada uma com o código pequeno ao lado; o código
    desconhecido aparece cru. */
function Versoes({ linha }: { linha: LinhaDaPauta }) {
  if (!linha.versoes.length) return null;
  const original = linha.texto.slice(linha.semVersao.length).trim();
  return (
    <span className="pauta-versoes" title={`versões da chamada: ${original}`}>
      {linha.versoes.map((v, i) =>
        v.conhecida ? (
          <span key={i} className="pauta-versao">
            {v.rotulo}
            <small>{v.codigo}</small>
          </span>
        ) : (
          <span key={i} className="pauta-versao desconhecida" title={`código ${v.codigo}: o PROMeiro não conhece`}>
            {v.codigo}
          </span>
        ),
      )}
    </span>
  );
}

/** "2 artes", "1 arte"; sem a lista, nada. */
const artesEscritas = (n: number | null) => (n === null ? '' : `${n} ${n === 1 ? 'arte' : 'artes'}`);

/** O que o PROMeiro sabe da produção da arte da claquete (#96): a etapa, as artes, os designers e a praça; ou "sem card". */
function ProducaoDaClaquete({ linha }: { linha: LinhaDaPauta }) {
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
function TextoDaClaquete({ linha }: { linha: LinhaDaPauta }) {
  const alta = !!resumoDaProducao(linha.producoes)?.alta;
  const texto = <span className="pauta-texto">{linha.semVersao}</span>;
  return alta ? <MarcaTexto traco={tracoDe(linha.chave ?? linha.id)}>{texto}</MarcaTexto> : texto;
}

function Celula({ c, editor, hoje, abrir }: { c: CelulaDaSemana; editor: string; hoje: boolean; abrir: (l: LinhaDaPauta) => void }) {
  const vazia = !c.turno && !c.itens.length && !c.avisos.length;
  const { dia, semana } = partes(c.dia);
  return (
    <td className={`pauta-celula${hoje ? ' hoje' : ''}`} data-dia={c.dia}>
      {!vazia && (
        <>
          <div className="pauta-celula-topo">
            {c.turno && (
              <span className="pauta-turno">
                {c.turno.inicio}
                {c.turno.fim && `–${c.turno.fim}`}
              </span>
            )}
            {c.avisos.length > 0 && <Avisos avisos={c.avisos} rotulo={`${editor || 'sem editor'}, ${DIAS_DA_SEMANA[semana]} ${dia}`} />}
          </div>
          {c.itens.length > 0 && (
            <ul className="pauta-itens">
              {c.itens.map((l) => (
                <li key={l.id} className={`pauta-item pauta-${l.tipo}`} data-tipo={l.tipo} data-etapa={l.tipo === 'claquete' ? (resumoDaProducao(l.producoes)?.etapa ?? 'sem-card') : undefined}>
                  {l.tipo === 'claquete' ? (
                    <button type="button" className="pauta-claquete-botao" aria-haspopup="dialog" onClick={() => abrir(l)}>
                      <TextoDaClaquete linha={l} />
                      <Versoes linha={l} />
                      <ProducaoDaClaquete linha={l} />
                    </button>
                  ) : (
                    <>
                      <span className="pauta-texto">{l.semVersao}</span>
                      <Versoes linha={l} />
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </td>
  );
}

/** "qua, 25/11". */
function diaEscrito(iso: string) {
  const p = partes(iso);
  return `${DIAS_DA_SEMANA[p.semana]}, ${String(p.dia).padStart(2, '0')}/${String(p.mes + 1).padStart(2, '0')}`;
}
/** "24/11 21:46", no fuso de São Paulo. */
const instanteEscrito = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const vizinho = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * A ficha da claquete (#96), por cima da Semana: as linhas da mesma atração com versões diferentes juntas (a mesma
 * chave), os dias em que ela aparece na pauta da semana e a produção da arte de cada praça.
 */
function FichaDaClaquete({ linha, semana, hoje, fechar }: { linha: LinhaDaPauta; semana: SemanaDaPauta; hoje: string; fechar: () => void }) {
  const linhas = semana.linhas.filter((l) => l.tipo === 'claquete' && (l.id === linha.id || (!!linha.chave && l.chave === linha.chave)));
  const producoes = [...new Map(linhas.flatMap((l) => l.producoes ?? []).map((p) => [p.id, p])).values()].sort((a, b) => a.praca.localeCompare(b.praca));
  const versoes = [...new Map(linhas.flatMap((l) => l.versoes).map((v) => [`${v.codigo.toUpperCase()}|${v.rotulo}`, v])).values()];
  const resumo = resumoDaProducao(producoes);
  const corpo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    corpo.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [fechar]);
  const relativo = (d: string) => (d === hoje ? 'hoje' : d === vizinho(hoje, -1) ? 'ontem' : d === vizinho(hoje, 1) ? 'amanhã' : '');
  const titulo = <span>{linha.semVersao}</span>;
  return (
    <div className="pauta-veu" onClick={fechar}>
      <div className="pauta-ficha" role="dialog" aria-modal="true" aria-labelledby="pauta-ficha-titulo" tabIndex={-1} ref={corpo} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="botao-texto pauta-ficha-voltar" onClick={fechar}>
          <Icone nome="voltar" tam={14} /> Pauta da edição
        </button>
        <h2 id="pauta-ficha-titulo">{resumo?.alta ? <MarcaTexto traco={tracoDe(linha.chave ?? linha.id)}>{titulo}</MarcaTexto> : titulo}</h2>
        {versoes.length > 0 && (
          <p className="pauta-ficha-versoes">
            {versoes.length} {versoes.length === 1 ? 'versão' : 'versões'} na pauta:{' '}
            {versoes.map((v, i) => (
              <span key={i} className={`pauta-versao${v.conhecida ? '' : ' desconhecida'}`}>
                {v.conhecida ? v.rotulo : v.codigo}
                {v.conhecida && <small>{v.codigo}</small>}
              </span>
            ))}
          </p>
        )}
        <p className="pauta-producao" data-etapa={resumo?.etapa ?? 'sem-card'}>
          {resumo ? <span className="pauta-etapa">{ROTULO_DA_ETAPA[resumo.etapa]}</span> : 'sem card na produção da arte'}
        </p>

        <h3>Na pauta</h3>
        <table className="pauta-ficha-tabela">
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Versão</th>
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
                <td>{l.versoes.length ? <Versoes linha={l} /> : '—'}</td>
                <td className="pauta-turno">{l.turno ? `${l.turno.inicio}${l.turno.fim ? `–${l.turno.fim}` : ''}` : '—'}</td>
                <td>{l.editor || <em>sem editor</em>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Produção da arte</h3>
        {producoes.length ? (
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
        ) : (
          <p className="pauta-ficha-sem-card">Nenhuma Produção achada pela claquete: sem card.</p>
        )}
      </div>
    </div>
  );
}

export function Pauta({ semana, irPara, voltar }: Props) {
  const [hoje, setHoje] = useState(() => diaEmSaoPaulo());
  const segunda = segundaDaSemana(semana ?? '', hoje);
  const [dados, setDados] = useState<SemanaDaPauta | null>(null);
  const [falha, setFalha] = useState('');
  const rolagem = useRef<HTMLDivElement>(null);
  // a ficha da claquete aberta (#96), pelo id da linha
  const [ficha, setFicha] = useState<string | null>(null);
  const fecharFicha = useCallback(() => setFicha(null), []);

  const carregar = useCallback(() => {
    setFalha('');
    setHoje(diaEmSaoPaulo());
    lerSemanaDaPauta(segunda)
      .then(setDados)
      .catch((e) => setFalha(e instanceof Error ? e.message : String(e)));
  }, [segunda]);
  useEffect(() => carregar(), [carregar]);

  // ← e → trocam de semana (fora dos campos de digitar)
  const desta = segundaDaSemana(hoje, hoje);
  const ir = useCallback((s: string) => irPara(s === desta ? undefined : s), [irPara, desta]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (ficha || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') ir(semanaVizinha(segunda, -1));
      if (e.key === 'ArrowRight') ir(semanaVizinha(segunda, 1));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ir, segunda, ficha]);

  const atual = dados?.inicio === segunda ? dados : null;
  // a grade mais larga que a tela (celular, tablet): abre em hoje, logo depois da coluna dos nomes
  useLayoutEffect(() => {
    const r = rolagem.current;
    if (!r || !atual) return;
    const coluna = r.querySelector<HTMLElement>('th.pauta-dia.hoje');
    const nomes = r.querySelector<HTMLElement>('th.pauta-canto');
    r.scrollLeft = coluna && r.scrollWidth > r.clientWidth ? coluna.offsetLeft - (nomes?.offsetWidth ?? 0) : 0;
  }, [atual]);

  const grade = atual ? gradeDaSemana(atual) : [];
  const aberta = ficha ? (atual?.linhas.find((l) => l.id === ficha) ?? null) : null;
  return (
    <div className="pagina pauta">
      <header className="cad-topo">
        <button className="voltar-cad" onClick={voltar}>
          <Icone nome="voltar" tam={16} /> Fila
        </button>
        <Marca />
        <span />
      </header>
      <main className="pauta-pagina">
        <div className="pauta-cabeca">
          <div>
            <h1>Pauta da edição</h1>
            <p className="pauta-sub">A semana inteira: um editor por linha, um dia por coluna.</p>
          </div>
          <nav className="pauta-nav" aria-label="Semana">
            {segunda !== desta && (
              <button type="button" className="botao-texto pauta-hoje" onClick={() => irPara(undefined)}>
                esta semana
              </button>
            )}
            <button type="button" className="botao-icone" aria-label="Semana anterior" title="Semana anterior (←)" onClick={() => ir(semanaVizinha(segunda, -1))}>
              <Icone nome="voltar" tam={16} traco={2.2} />
            </button>
            <span className="pauta-periodo" aria-live="polite">
              {periodoEscrito(atual?.dias ?? diasDaSemana(segunda))}
            </span>
            <button type="button" className="botao-icone" aria-label="Próxima semana" title="Próxima semana (→)" onClick={() => ir(semanaVizinha(segunda, 1))}>
              <Icone nome="direita" tam={16} traco={2.2} />
            </button>
          </nav>
        </div>
        {falha ? (
          <p className="pauta-falha" role="alert">
            {falha}{' '}
            <button className="botao-texto" onClick={carregar}>
              Tentar de novo
            </button>
          </p>
        ) : !atual ? (
          <p className="pauta-lendo">Lendo a pauta…</p>
        ) : !grade.length ? (
          <p className="pauta-vazia">Nada na pauta desta semana.</p>
        ) : (
          <div className="pauta-rolagem" ref={rolagem}>
            <table className="pauta-grade">
              <thead>
                <tr>
                  <th className="pauta-canto" scope="col">
                    <span className="sr">Editor</span>
                  </th>
                  {atual.dias.map((d) => {
                    const p = partes(d);
                    const ehHoje = d === hoje;
                    return (
                      <th key={d} scope="col" className={`pauta-dia${ehHoje ? ' hoje' : ''}`} data-dia={d}>
                        <span className="pauta-dia-sem">{DIAS_DA_SEMANA[p.semana]}</span> <span className="pauta-dia-num">{p.dia}</span>
                        {ehHoje && <span className="pauta-dia-rel"> hoje</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {grade.map((f) => (
                  <tr key={f.editor || '(sem editor)'} className={f.editor ? '' : 'sem-editor'}>
                    <th scope="row" className="pauta-editor">
                      <span className="pauta-avatar" aria-hidden="true">
                        {f.editor ? iniciais(f.editor) : '–'}
                      </span>
                      <span className="pauta-nome">{f.editor || 'sem editor'}</span>
                    </th>
                    {f.celulas.map((c) => (
                      <Celula key={c.dia} c={c} editor={f.editor} hoje={c.dia === hoje} abrir={(l) => setFicha(l.id)} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {atual && aberta && <FichaDaClaquete linha={aberta} semana={atual} hoje={hoje} fechar={fecharFicha} />}
    </div>
  );
}
