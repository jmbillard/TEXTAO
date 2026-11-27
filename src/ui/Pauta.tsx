import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { escolhaLembradaDaPauta, lembrarNaPauta, lerSemanaDaPauta } from '../dados/armazenamento';
import { iniciais } from '../dados/colaboracao';
import { PERIODOS, colunasDaSemana, diaEmSaoPaulo, diasDaSemana, gradeDaSemana, segundaDaSemana, semanaVizinha, type ArranjoDaSemana, type ArranjoDoDia, type CelulaDaSemana, type ColunaDaSemana, type ColunaDoDia, type EscolhaDaPauta, type LinhaDaPauta, type SemanaDaPauta } from '../modelo/pauta';
import { Icone } from './icones';
import { Marca } from './pecas';
import { DIAS_DA_SEMANA, FichaDaClaquete, ItemDaPauta, MESES, VisaoDaPauta, contagem, hashDaPauta, partes, type EnderecoDaPauta } from './pecasDaPauta';
import { PautaDoDia } from './PautaDoDia';
import './pauta.css';

/* A Pauta da edição (#94): a Semana editor × dia, para qualquer pessoa logada. Uma linha por editor (na ordem do turno
   de costume; "sem editor" no fim), uma coluna por dia, de segunda a domingo. A célula traz o turno e as linhas da
   pauta daquele editor naquele dia: as claquetes, as tarefas (com outro visual) e, no lugar dos avisos, só o ⚑ com o
   número deles, que abre o texto ao passar o mouse ou ao tocar. As versões da chamada (#95) viram etiquetas legíveis,
   com o código pequeno ao lado. A claquete traz o que o PROMeiro sabe da produção da arte dela (#96): a etapa, as
   artes, os designers, a praça e o marca-texto da prioridade ALTA, ou "sem card"; um clique abre a ficha da claquete,
   por cima da Semana. Lida do Teable pelo servidor (nada do Trello). No
   celular e no tablet, a grade rola para o lado com a coluna dos nomes fixa e abre em hoje. Um clique num dia abre o
   Dia (#97, em PautaDoDia.tsx), com cada editor numa coluna.
   A Semana tem um segundo arranjo (#98), um dia por coluna: em cada dia, os cards agrupados pelo período do turno
   (manhã, tarde, noite, madrugada), cada card com o editor e, no primeiro dele, o ⚑ dos avisos. A visão e o arranjo de
   cada uma ficam lembrados por pessoa, em qualquer aparelho. */

interface Props extends EnderecoDaPauta {
  /** vai para outra semana ou outro dia (sem a data: a de hoje) */
  irPara: (e: EnderecoDaPauta) => void;
  voltar: () => void;
}


/** "23 a 29 de novembro", "30 de novembro a 6 de dezembro". */
function periodoEscrito(dias: string[]) {
  const a = partes(dias[0]);
  const b = partes(dias[dias.length - 1]);
  return a.mes === b.mes ? `${a.dia} a ${b.dia} de ${MESES[b.mes]}` : `${a.dia} de ${MESES[a.mes]} a ${b.dia} de ${MESES[b.mes]}`;
}

/** O ⚑ com o número de avisos daquele editor naquele dia; o texto abre ao passar o mouse ou ao tocar. */
function Avisos({ avisos, rotulo }: { avisos: LinhaDaPauta[]; rotulo: string }) {
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
                <ItemDaPauta key={l.id} linha={l} abrir={abrir} />
              ))}
            </ul>
          )}
        </>
      )}
    </td>
  );
}

/** A Pauta da edição: a Semana ou o Dia (#97), pelo endereço, cada uma no arranjo que a pessoa escolheu (#98; sem
    escolha, a Semana editor × dia e o Dia empilhado). A troca vale na hora e o servidor guarda. */
export function Pauta({ semana, dia, irPara, voltar }: Props) {
  const [escolha, setEscolha] = useState<EscolhaDaPauta>(() => escolhaLembradaDaPauta());
  const mudar = <K extends 'semana' | 'dia'>(parte: K, valor: EscolhaDaPauta[K]) => {
    setEscolha((e) => ({ ...e, [parte]: valor }));
    void lembrarNaPauta(parte, valor);
  };
  if (dia !== undefined) return <PautaDoDia dia={dia} arranjo={escolha.dia} mudarArranjo={(a: ArranjoDoDia) => mudar('dia', a)} irPara={irPara} voltar={voltar} />;
  return <SemanaDaPautaTela semana={semana} arranjo={escolha.semana} mudarArranjo={(a) => mudar('semana', a)} irPara={irPara} voltar={voltar} />;
}

/** O card do arranjo um dia por coluna: o editor no pé e, no primeiro card dele no período, o ⚑ dos avisos. Quem só tem
    aviso naquele dia aparece só com o pé. */
function CardsDoEditor({ e, dia, abrir }: { e: ColunaDoDia; dia: string; abrir: (l: LinhaDaPauta) => void }) {
  const { dia: num, semana } = partes(dia);
  const nome = e.editor || 'sem editor';
  const pe = (comAvisos: boolean) => (
    <span className={`pauta-card-pe${e.editor ? '' : ' sem-editor'}`} title={e.turno ? `${e.turno.inicio}${e.turno.fim ? `–${e.turno.fim}` : ''}` : 'sem horário'}>
      <span className="pauta-card-editor">{nome}</span>
      {comAvisos && e.avisos.length > 0 && <Avisos avisos={e.avisos} rotulo={`${nome}, ${DIAS_DA_SEMANA[semana]} ${num}`} />}
    </span>
  );
  if (!e.itens.length)
    return (
      <li className="pauta-item pauta-so-aviso" data-tipo="aviso">
        {pe(true)}
      </li>
    );
  return (
    <>
      {e.itens.map((l, i) => (
        <ItemDaPauta key={l.id} linha={l} abrir={abrir} pe={pe(i === 0)} />
      ))}
    </>
  );
}

/** Um dia da Semana no arranjo um dia por coluna: no topo, o dia (que abre o Dia) e a conta; os cards por turno. */
function DiaEmColuna({ c, hoje, irPara, abrir }: { c: ColunaDaSemana; hoje: boolean; irPara: Props['irPara']; abrir: (l: LinhaDaPauta) => void }) {
  const p = partes(c.dia);
  return (
    <section className={`pauta-dia-coluna${hoje ? ' hoje' : ''}`} data-dia={c.dia} aria-label={`${DIAS_DA_SEMANA[p.semana]} ${p.dia}`}>
      <header className="pauta-dia-coluna-topo">
        <a className="pauta-dia-link" href={hashDaPauta({ dia: c.dia })} title="Abrir o dia, com cada editor numa coluna" onClick={(e) => (e.preventDefault(), irPara({ dia: c.dia }))}>
          <span className="pauta-dia-sem">{DIAS_DA_SEMANA[p.semana]}</span> <span className="pauta-dia-num">{p.dia}</span>
          {hoje && <span className="pauta-dia-rel"> hoje</span>}
          <span className="pauta-dia-ver" aria-hidden="true">
            ver o dia →
          </span>
        </a>
        {c.turnos.length > 0 && <span className="pauta-dia-conta">{[contagem(c.editores, 'editor', 'editores'), contagem(c.claquetes, 'claquete', 'claquetes')].join(' · ')}</span>}
      </header>
      {c.turnos.length ? (
        c.turnos.map((t) => (
          <section key={t.periodo} className="pauta-periodo" data-periodo={t.periodo}>
            <h3 className="pauta-periodo-nome">{PERIODOS.find((x) => x.id === t.periodo)?.nome}</h3>
            <ul className="pauta-cards">
              {t.editores.map((e) => (
                <CardsDoEditor key={e.editor || '(sem editor)'} e={e} dia={c.dia} abrir={abrir} />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="pauta-dia-sem-pauta">sem pauta</p>
      )}
    </section>
  );
}

const ARRANJOS_DA_SEMANA: readonly { id: ArranjoDaSemana; nome: string; dica: string; sub: string }[] = [
  { id: 'editor-dia', nome: 'Editor × dia', dica: 'Um editor por linha, um dia por coluna', sub: 'A semana inteira: um editor por linha, um dia por coluna.' },
  { id: 'dia-por-coluna', nome: 'Um dia por coluna', dica: 'Os cards de cada dia agrupados por turno', sub: 'A semana inteira: um dia por coluna, os cards por turno.' },
];

function SemanaDaPautaTela({ semana, arranjo, mudarArranjo, irPara, voltar }: Omit<Props, 'dia'> & { arranjo: ArranjoDaSemana; mudarArranjo: (a: ArranjoDaSemana) => void }) {
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
  const ir = useCallback((s: string) => irPara({ semana: s === desta ? undefined : s }), [irPara, desta]);
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
  // a grade mais larga que a tela (celular, tablet): abre em hoje, logo depois da coluna dos nomes (no arranjo um dia por
  // coluna, logo na borda)
  useLayoutEffect(() => {
    const r = rolagem.current;
    if (!r || !atual) return;
    const coluna = r.querySelector<HTMLElement>('th.pauta-dia.hoje, .pauta-dia-coluna.hoje');
    const nomes = r.querySelector<HTMLElement>('th.pauta-canto');
    const borda = nomes ? nomes.getBoundingClientRect().right : r.getBoundingClientRect().left + parseFloat(getComputedStyle(r).paddingLeft);
    r.scrollLeft = coluna && r.scrollWidth > r.clientWidth ? r.scrollLeft + coluna.getBoundingClientRect().left - borda : 0;
  }, [atual, arranjo]);

  const grade = atual && arranjo === 'editor-dia' ? gradeDaSemana(atual) : [];
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
            <p className="pauta-sub">{ARRANJOS_DA_SEMANA.find((a) => a.id === arranjo)?.sub}</p>
          </div>
          {/* o Dia abre em hoje, quando hoje é desta semana; senão, na segunda */}
          <div className="pauta-controles">
            <VisaoDaPauta visao="semana" semana={() => undefined} dia={() => irPara({ dia: segunda === desta ? '' : segunda })} />
            <div className="segmento pauta-arranjo pauta-arranjo-semana" role="radiogroup" aria-label="Arranjo da semana">
              {ARRANJOS_DA_SEMANA.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={arranjo === a.id} title={a.dica} onClick={() => mudarArranjo(a.id)}>
                  {a.nome}
                </button>
              ))}
            </div>
            <nav className="pauta-nav" aria-label="Semana">
              {segunda !== desta && (
                <button type="button" className="botao-texto pauta-hoje" onClick={() => irPara({})}>
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
        ) : !atual.linhas.length ? (
          <p className="pauta-vazia">Nada na pauta desta semana.</p>
        ) : arranjo === 'dia-por-coluna' ? (
          <div className="pauta-faixa" ref={rolagem}>
            <div className="pauta-dias">
              {colunasDaSemana(atual).map((c) => (
                <DiaEmColuna key={c.dia} c={c} hoje={c.dia === hoje} irPara={irPara} abrir={(l) => setFicha(l.id)} />
              ))}
            </div>
          </div>
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
                        {/* um clique no dia abre aquele Dia (#97) */}
                        <a className="pauta-dia-link" href={hashDaPauta({ dia: d })} title="Abrir o dia, com cada editor numa coluna" onClick={(e) => (e.preventDefault(), irPara({ dia: d }))}>
                          <span className="pauta-dia-sem">{DIAS_DA_SEMANA[p.semana]}</span> <span className="pauta-dia-num">{p.dia}</span>
                          {ehHoje && <span className="pauta-dia-rel"> hoje</span>}
                        </a>
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
      {atual && aberta && <FichaDaClaquete linha={aberta} linhas={atual.linhas} hoje={hoje} fechar={fecharFicha} />}
    </div>
  );
}
