import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { lerDiaDaPauta } from '../dados/armazenamento';
import { iniciais } from '../dados/colaboracao';
import { agoraNaRegua, colunasDoDia, diaDaPautaAgora, diaOuHoje, diaVizinho, fimNaRegua, naRegua, noArAgora, resumoDaProducao, segundaDaSemana, type ArranjoDoDia as Arranjo, type ColunaDoDia, type DiaDaPauta, type LeituraDaPauta, type LinhaDaPauta } from '../modelo/pauta';
import { ForaNaPautaTela } from './ForaNaPauta';
import { Icone } from './icones';
import { Marca } from './pecas';
import { DIAS_DA_SEMANA, FichaDaClaquete, FiltroDaPautaTela, ItemDaPauta, MESES, SobreALeitura, VisaoDaPauta, artesEscritas, contagem, partes, useReleitura, type EnderecoDaPauta } from './pecasDaPauta';
import type { FiltroNaTela } from './Pauta';

/* O Dia da pauta da edição (#97): um dia só, com cada editor numa coluna, na ordem de início do turno daquele dia
   ("sem editor" no fim). No topo da coluna, o nome, o horário do turno e "no ar agora" ou o total de artes; logo
   abaixo, os avisos daquele turno num balão "aviso", separados da pauta. Dois arranjos, trocados na página (e
   lembrados por pessoa, #98):
   - empilhado: os cards de altura livre, um embaixo do outro;
   - por hora: as colunas alinhadas numa régua das 6h às 6h do dia seguinte, o turno como um bloco do início ao fim,
     com a linha do "agora" quando o dia está no ar.
   Anterior e próximo (← →) trocam de dia; o endereço é #/pauta/dia/AAAA-MM-DD (sem a data, hoje: o dia da pauta que
   está correndo, que antes das 6h ainda é o anterior). No celular e no
   tablet as colunas rolam para o lado e a faixa começa no turno que está no ar. O filtro pessoal, o resumo do
   administrador, a cópia de reserva e a releitura a cada minuto (#99) são os mesmos da Semana. */

interface Props extends FiltroNaTela {
  /** o dia do endereço; '' é hoje */
  dia: string;
  arranjo: Arranjo;
  mudarArranjo: (a: Arranjo) => void;
  irPara: (e: EnderecoDaPauta) => void;
  voltar: () => void;
}

const DIAS_POR_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** A altura de uma hora na régua, em px. */
const HORA = 46;
/** As marcas da régua, de duas em duas horas: 06h, 08h… 04h, 06h. */
const MARCAS = Array.from({ length: 13 }, (_, i) => (6 + 2 * i) % 24);
const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** "quinta, 26 de novembro". */
function diaPorExtenso(iso: string) {
  const p = partes(iso);
  return `${DIAS_POR_EXTENSO[p.semana]}, ${p.dia} de ${MESES[p.mes]}`;
}
/** "qui, 26/11". */
function diaCurto(iso: string) {
  const p = partes(iso);
  return `${DIAS_DA_SEMANA[p.semana]}, ${p.dia}/${doisDigitos(p.mes + 1)}`;
}

/** O resumo do topo da coluna fora do ar: o total de artes e quantas claquetes já têm a arte entregue. */
function totalDaColuna(c: ColunaDoDia) {
  const claquetes = c.itens.filter((l) => l.tipo === 'claquete').map((l) => resumoDaProducao(l.producoes));
  const comArtes = claquetes.filter((r) => r?.artes !== null && r?.artes !== undefined);
  const artes = comArtes.length ? comArtes.reduce((n, r) => n + (r?.artes ?? 0), 0) : null;
  const entregues = claquetes.filter((r) => r?.etapa === 'entregue' || r?.etapa === 'arquivada').length;
  if (!claquetes.length) return '';
  return [artes === null ? contagem(claquetes.length, 'claquete', 'claquetes') : artesEscritas(artes), `${entregues}/${claquetes.length} entregues`].join(' · ');
}

function Coluna({ c, dia, agora, arranjo, abrir }: { c: ColunaDoDia; dia: string; agora: number; arranjo: Arranjo; abrir: (l: LinhaDaPauta) => void }) {
  const noAr = noArAgora(dia, c.turno, agora);
  const total = totalDaColuna(c);
  const minutoDoAgora = agoraNaRegua(dia, agora);
  const itens = c.itens.length ? (
    <ul className="pauta-cards">
      {c.itens.map((l) => (
        <ItemDaPauta key={l.id} linha={l} abrir={abrir} />
      ))}
    </ul>
  ) : null;
  return (
    <section className={`pauta-coluna${noAr ? ' no-ar' : ''}${c.editor ? '' : ' sem-editor'}`} data-editor={c.editor} aria-label={c.editor || 'sem editor'}>
      <header className="pauta-coluna-topo">
        <span className="pauta-coluna-nome">
          <span className="pauta-avatar" aria-hidden="true">
            {c.editor ? iniciais(c.editor) : '–'}
          </span>
          <span className="pauta-nome">{c.editor || 'sem editor'}</span>
        </span>
        <span className="pauta-coluna-linha">
          <span className="pauta-turno">{c.turno ? `${c.turno.inicio}${c.turno.fim ? `–${c.turno.fim}` : ''}` : 'sem horário'}</span>
          {noAr ? <span className="pauta-no-ar">no ar agora</span> : total && <span className="pauta-coluna-total">{total}</span>}
        </span>
      </header>
      {/* os avisos daquele turno: um balão no topo da coluna, fora da pauta */}
      <div className="pauta-coluna-avisos">
        {c.avisos.length > 0 && (
          <div className="pauta-balao-aviso" role="note" aria-label={`${c.avisos.length === 1 ? 'aviso' : 'avisos'} para ${c.editor || 'sem editor'}`}>
            <span className="pauta-balao-titulo">{c.avisos.length === 1 ? 'aviso' : 'avisos'}</span>
            {c.avisos.map((a) => (
              <span key={a.id} className="pauta-aviso-texto">
                {a.texto}
              </span>
            ))}
          </div>
        )}
      </div>
      {arranjo === 'empilhado' ? (
        <div className="pauta-coluna-corpo">{itens}</div>
      ) : (
        <div className="pauta-coluna-corpo pauta-horas" style={{ minHeight: 24 * HORA }}>
          {MARCAS.slice(0, -1).map((_, i) => (
            <span key={i} className="pauta-hora-traco" style={{ top: i * 2 * HORA }} aria-hidden="true" />
          ))}
          {minutoDoAgora !== null && <span className="pauta-agora" style={{ top: (minutoDoAgora / 60) * HORA }} aria-hidden="true" />}
          {(itens || c.turno) && (
            <div className="pauta-bloco" style={c.turno ? { top: (naRegua(c.turno.inicio) / 60) * HORA, minHeight: ((fimNaRegua(c.turno) - naRegua(c.turno.inicio)) / 60) * HORA } : { top: 0 }}>
              {itens}
              {c.turno?.fim && <span className="pauta-ate">até {c.turno.fim}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** A régua do arranjo por hora: das 6h às 6h, com a hora do "agora" quando o dia está no ar. */
function Regua({ dia, agora }: { dia: string; agora: number }) {
  const m = agoraNaRegua(dia, agora);
  const quando = new Date(agora).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return (
    <div className="pauta-regua" aria-hidden="true">
      <div className="pauta-coluna-topo" />
      <div className="pauta-coluna-avisos" />
      <div className="pauta-coluna-corpo" style={{ minHeight: 24 * HORA }}>
        {MARCAS.map((h, i) => (
          <span key={i} className="pauta-hora" style={{ top: i * 2 * HORA }}>
            {doisDigitos(h)}h
          </span>
        ))}
        {m !== null && (
          <span className="pauta-hora agora" style={{ top: (m / 60) * HORA }}>
            {quando}
          </span>
        )}
      </div>
    </div>
  );
}

export function PautaDoDia({ dia, arranjo, mudarArranjo, irPara, voltar, filtro, mudarFiltro }: Props) {
  // "hoje" é o dia da pauta que está correndo: às 2h, ainda o de ontem, com o turno da noite no ar
  const [hoje, setHoje] = useState(() => diaDaPautaAgora());
  const [agora, setAgora] = useState(() => Date.now());
  const qual = diaOuHoje(dia, hoje);
  const [dados, setDados] = useState<(DiaDaPauta & LeituraDaPauta) | null>(null);
  const [falha, setFalha] = useState('');
  const faixa = useRef<HTMLDivElement>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  const fecharFicha = useCallback(() => setFicha(null), []);

  // na releitura (#99), o erro não apaga a pauta que já está à vista
  const carregar = useCallback(
    (releitura = false) => {
      if (!releitura) setFalha('');
      setHoje(diaDaPautaAgora());
      lerDiaDaPauta(qual, filtro)
        .then((d) => (setDados(d), setFalha('')))
        .catch((e) => releitura || setFalha(e instanceof Error ? e.message : String(e)));
    },
    [qual, filtro],
  );
  useEffect(() => carregar(), [carregar]);
  useReleitura(useCallback(() => carregar(true), [carregar]));
  // o "agora" anda: a linha da régua e o "no ar agora" a cada minuto
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(relogio);
  }, []);

  // ← e → trocam de dia (fora dos campos de digitar); o endereço leva a data, para mandar a um colega
  const ir = useCallback((d: string) => irPara({ dia: d }), [irPara]);
  const segunda = segundaDaSemana(qual, hoje);
  const semanaDoDia = () => irPara({ semana: segunda === segundaDaSemana(hoje, hoje) ? undefined : segunda });
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (ficha || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') ir(diaVizinho(qual, -1));
      if (e.key === 'ArrowRight') ir(diaVizinho(qual, 1));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ir, qual, ficha]);

  const atual = dados?.dia === qual && dados.filtro === filtro ? dados : null;
  const colunas = atual ? colunasDoDia(atual.linhas) : [];
  // a faixa mais larga que a tela (celular, tablet): começa no turno que está no ar (no por hora, depois da régua)
  useLayoutEffect(() => {
    const f = faixa.current;
    if (!f || !atual) return;
    const noAr = f.querySelector<HTMLElement>('.pauta-coluna.no-ar');
    const regua = f.querySelector<HTMLElement>('.pauta-regua');
    // a coluna logo depois da borda (no por hora, logo depois da régua, que fica fixa)
    const borda = regua ? regua.getBoundingClientRect().right + 6 : f.getBoundingClientRect().left + 8;
    f.scrollLeft = noAr && f.scrollWidth > f.clientWidth ? f.scrollLeft + noAr.getBoundingClientRect().left - borda : 0;
    // só quando chega o dia ou troca o arranjo: o relógio não puxa a faixa de volta
  }, [atual, arranjo]);

  const conta = (tipo: LinhaDaPauta['tipo']) => atual?.linhas.filter((l) => l.tipo === tipo).length ?? 0;
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
            <h1>{diaPorExtenso(qual)}</h1>
            <p className="pauta-sub">
              Pauta da edição
              {atual && ` · ${[contagem(colunas.filter((c) => c.editor).length, 'editor', 'editores'), contagem(conta('claquete'), 'claquete', 'claquetes'), contagem(conta('tarefa'), 'tarefa', 'tarefas'), contagem(conta('aviso'), 'aviso', 'avisos')].join(' · ')}`}
              {' · um editor por coluna, pela hora de entrada'}
            </p>
          </div>
          <div className="pauta-controles">
            <VisaoDaPauta visao="dia" semana={semanaDoDia} dia={() => undefined} />
            <FiltroDaPautaTela voce={dados?.voce} filtro={filtro} mudar={mudarFiltro} />
            <div className="segmento pauta-arranjo" role="radiogroup" aria-label="Arranjo do dia">
              <button type="button" role="radio" aria-checked={arranjo === 'empilhado'} title="Os cards um embaixo do outro" onClick={() => mudarArranjo('empilhado')}>
                Empilhado
              </button>
              <button type="button" role="radio" aria-checked={arranjo === 'por-hora'} title="As colunas numa régua das 6h às 6h" onClick={() => mudarArranjo('por-hora')}>
                Por hora
              </button>
            </div>
            <nav className="pauta-nav" aria-label="Dia">
              {qual !== hoje && (
                <button type="button" className="botao-texto pauta-hoje" onClick={() => irPara({ dia: '' })}>
                  hoje
                </button>
              )}
              <button type="button" className="botao-icone" aria-label="Dia anterior" title="Dia anterior (←)" onClick={() => ir(diaVizinho(qual, -1))}>
                <Icone nome="voltar" tam={16} traco={2.2} />
              </button>
              <span className="pauta-periodo pauta-periodo-dia" aria-live="polite">
                {diaCurto(qual)}
                {qual === hoje && <span className="pauta-dia-rel"> hoje</span>}
              </span>
              <button type="button" className="botao-icone" aria-label="Próximo dia" title="Próximo dia (→)" onClick={() => ir(diaVizinho(qual, 1))}>
                <Icone nome="direita" tam={16} traco={2.2} />
              </button>
            </nav>
          </div>
        </div>
        {!falha && <SobreALeitura leitura={atual} />}
        {!falha && atual && <ForaNaPautaTela fora={atual.fora} dias={[atual.dia]} />}
        {falha ? (
          <p className="pauta-falha" role="alert">
            {falha}{' '}
            <button className="botao-texto" onClick={() => carregar()}>
              Tentar de novo
            </button>
          </p>
        ) : !atual ? (
          <p className="pauta-lendo">Lendo a pauta…</p>
        ) : !colunas.length ? (
          <p className="pauta-vazia">{filtro ? 'Nada seu na pauta deste dia.' : 'Nada na pauta deste dia.'}</p>
        ) : (
          <div className="pauta-faixa" ref={faixa}>
            <div className={`pauta-colunas ${arranjo}`} data-arranjo={arranjo}>
              {arranjo === 'por-hora' && <Regua dia={qual} agora={agora} />}
              {colunas.map((c) => (
                <Coluna key={c.editor || '(sem editor)'} c={c} dia={qual} agora={agora} arranjo={arranjo} abrir={(l) => setFicha(l.id)} />
              ))}
            </div>
          </div>
        )}
      </main>
      {atual && aberta && <FichaDaClaquete linha={aberta} linhas={atual.linhas} hoje={hoje} fechar={fecharFicha} />}
    </div>
  );
}
