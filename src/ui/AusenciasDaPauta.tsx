import { useCallback, useEffect, useRef, useState } from 'react';
import { apagarAusencia, lerAusencias, marcarAusencia, ondeEstaEscalada, tirarDoDia } from '../dados/armazenamento';
import { iniciais } from '../dados/colaboracao';
import { motivoDaAusencia, nomeDoTipo, temPeriodo, TIPOS_DE_AUSENCIA, type Ausencia, type EscaladaNoDia, type PainelDasAusencias, type TipoDeAusencia } from '../modelo/ausencias';
import type { TurnoDaEscala } from '../modelo/escala';
import { Icone } from './icones';
import { DIAS_DA_SEMANA, partes } from './pecasDaPauta';
import './ausenciasDaPauta.css';

/* Montar a pauta, ausências (#128): a caixa "Fora" da coluna lateral (#126). Ela mostra quem está fora no dia, com o
   motivo (só a coordenação vê esta tela), e o "marcar ausência". O diálogo de marcar tem quem, o tipo, o período (de e
   até, nas férias e na licença) e a observação, e diz antes onde a pessoa está escalada: nos rascunhos a posição vira
   vaga; num dia já publicado, a caixa oferece tirar a pessoa, e tirar manda as demandas dela para "Para distribuir" e
   deixa o dia alterado. */

interface Props {
  dia: string;
  turnos: readonly TurnoDaEscala[];
  editores: readonly string[];
  /** grava o que falta do rascunho antes de mexer nele no servidor */
  antes: () => Promise<void>;
  /** o servidor mexeu nos rascunhos: a tela lê o dia de novo */
  mudou: () => void;
  /** quem está fora no dia, a cada leitura, com o dia lido (para a caixa "Sem escala") */
  foraNoDia: (dia: string, nomes: string[]) => void;
  /** muda quando a outra pessoa da coordenação mexeu no dia (#131): o painel lê de novo */
  releitura?: number;
}

type Formulario = Omit<Ausencia, 'id'>;
const diaCurto = (iso: string) => {
  const p = partes(iso);
  return `${DIAS_DA_SEMANA[p.semana]} ${p.dia}/${p.mes + 1}`;
};
const nomeDoTurno = (turnos: readonly TurnoDaEscala[], id: string) => turnos.find((t) => t.id === id)?.nome.toLowerCase() ?? id;
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;
const ondeEscrito = (es: readonly EscaladaNoDia[], turnos: readonly TurnoDaEscala[]) => es.map((e) => `${diaCurto(e.dia)} (${e.turnos.map((t) => nomeDoTurno(turnos, t)).join(' e ')})`).join(', ');
const diasDoPeriodo = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;
const erroDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AusenciasDoDia({ dia, turnos, editores, antes, mudou, foraNoDia, releitura = 0 }: Props) {
  const [painel, setPainel] = useState<PainelDasAusencias | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // a leitura do painel; só vale a mais recente (a de um dia anterior, ou uma releitura velha, que chega depois é jogada fora)
  const leitura = useRef(0);
  const ler = useCallback(() => {
    const esta = ++leitura.current;
    lerAusencias(dia).then(
      (p) => esta === leitura.current && setPainel(p),
      (e) => esta === leitura.current && setErro(erroDe(e)),
    );
  }, [dia]);
  useEffect(() => {
    setAviso('');
    setErro('');
    ler();
  }, [ler]);
  // a outra pessoa da coordenação mudou o dia (#131): lê de novo, sem fechar o que está aberto aqui
  const lida = useRef(releitura);
  useEffect(() => {
    if (lida.current === releitura) return;
    lida.current = releitura;
    ler();
  }, [releitura, ler]);
  const doDia = painel?.dia === dia ? painel : null;
  const nomesFora = doDia ? doDia.fora.map((a) => a.editor).join('\n') : null;
  useEffect(() => {
    if (nomesFora !== null) foraNoDia(dia, nomesFora ? nomesFora.split('\n') : []);
  }, [dia, nomesFora, foraNoDia]);

  /** Uma ação no servidor: grava o rascunho antes, e depois a tela lê o dia de novo. */
  const fazer = async (f: () => Promise<PainelDasAusencias>, depois?: (p: PainelDasAusencias) => string) => {
    setOcupado(true);
    setErro('');
    try {
      await antes();
      const p = await f();
      // a resposta da ação é mais nova que uma leitura ainda em curso
      leitura.current += 1;
      setPainel(p);
      setAviso(depois?.(p) ?? '');
      mudou();
      return true;
    } catch (e) {
      setErro(erroDe(e));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const marcar = async (f: Formulario) => {
    const feito = await fazer(
      () => marcarAusencia(dia, f),
      (p) => {
        const r = p as PainelDasAusencias & { marcada: Ausencia; escalada: EscaladaNoDia[] };
        const vagas = r.escalada.filter((e) => !e.publicado);
        const publicados = r.escalada.filter((e) => e.publicado);
        return [
          `${r.marcada.editor}: ${motivoDaAusencia(r.marcada)}.`,
          vagas.length ? `A posição ficou vaga em ${ondeEscrito(vagas, turnos)}.` : '',
          publicados.length ? `${publicados.map((e) => diaCurto(e.dia)).join(', ')} já ${publicados.length === 1 ? 'foi publicado' : 'foram publicados'}: veja abaixo.` : '',
        ]
          .filter(Boolean)
          .join(' ');
      },
    );
    if (feito) setForm(null);
  };

  if (!doDia) return erro ? <p className="aus-erro" role="alert">{erro}</p> : null;
  return (
    <section className="coluna-caixa coluna-fora aus-painel" aria-label="Fora">
      <h2 className="coluna-rotulo">
        Fora no dia <span className="coluna-n">{doDia.fora.length}</span>
      </h2>
      {doDia.fora.length ? (
        <ul className="aus-fora">
          {doDia.fora.map((a) => (
            <li key={a.id} className="aus-pessoa">
              <span className="pauta-avatar" aria-hidden="true">
                {iniciais(a.editor)}
              </span>
              <span className="aus-quem">
                <strong>{a.editor}</strong>
                <span className="aus-motivo">
                  {motivoDaAusencia(a)}
                  {a.observacao && ` · ${a.observacao}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="coluna-ninguem">ninguém</p>
      )}
      {aviso && (
        <p className="aus-aviso" role="status">
          {aviso}
        </p>
      )}
      {erro && !form && (
        <p className="aus-erro" role="alert">
          {erro}
        </p>
      )}
      {doDia.noPublicado.map((o) => (
        <div key={`${o.ausencia}:${o.dia}`} className="aus-oferta">
          <span>
            <strong>{o.editor}</strong> está fora, mas está na pauta publicada de {diaCurto(o.dia)} ({o.turnos.map((t) => nomeDoTurno(turnos, t)).join(' e ')}).
          </span>
          <button type="button" className="botao" disabled={ocupado} onClick={() => void fazer(() => tirarDoDia(o.dia, o.editor).then(() => lerAusencias(dia)), () => `${o.editor} saiu de ${diaCurto(o.dia)}: as demandas foram para "Para distribuir", e o dia ficou alterado. Publique de novo para a equipe ver.`)}>
            Tirar {primeiroNome(o.editor)} de {diaCurto(o.dia)}
          </button>
        </div>
      ))}
      <button type="button" className="botao-texto aus-marcar" onClick={() => (setErro(''), setForm({ editor: '', tipo: 'folga', de: dia, ate: dia, observacao: '' }))}>
        + marcar ausência
      </button>
      {form && (
        <DialogoDaAusencia
          form={form}
          mudar={setForm}
          dia={dia}
          turnos={turnos}
          editores={editores}
          marcadas={doDia.ausencias}
          ocupado={ocupado}
          erro={erro}
          fechar={() => setForm(null)}
          marcar={() => void marcar(form)}
          apagar={(id) => void fazer(() => apagarAusencia(dia, id), () => 'Ausência apagada.')}
        />
      )}
    </section>
  );
}

interface PropsDoDialogo {
  form: Formulario;
  mudar: (f: Formulario) => void;
  dia: string;
  turnos: readonly TurnoDaEscala[];
  editores: readonly string[];
  marcadas: readonly Ausencia[];
  ocupado: boolean;
  erro: string;
  fechar: () => void;
  marcar: () => void;
  apagar: (id: string) => void;
}

/** O diálogo de marcar: quem, o tipo, o período e a observação; e, antes de marcar, onde a pessoa está escalada. */
function DialogoDaAusencia({ form, mudar, dia, turnos, editores, marcadas, ocupado, erro, fechar, marcar, apagar }: PropsDoDialogo) {
  const periodo = temPeriodo(form.tipo);
  const ate = periodo ? form.ate : form.de;
  const valido = !!form.editor.trim() && !!form.de && !!ate && ate >= form.de;
  const [escalada, setEscalada] = useState<EscaladaNoDia[] | null>(null);
  // onde a pessoa está escalada no período, um instante depois de parar de digitar
  useEffect(() => {
    setEscalada(null);
    if (!valido) return;
    let vivo = true;
    const t = setTimeout(() => ondeEstaEscalada(form.editor.trim(), form.de, ate).then((r) => vivo && setEscalada(r.escalada), () => undefined), 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [form.editor, form.de, ate, valido]);
  // Esc fecha
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fechar]);

  const n = valido ? diasDoPeriodo(form.de, ate) : 0;
  const vagas = escalada?.filter((e) => !e.publicado) ?? [];
  const publicados = escalada?.filter((e) => e.publicado) ?? [];
  const quem = primeiroNome(form.editor) || 'A pessoa';
  const tipo = (t: TipoDeAusencia) => mudar({ ...form, tipo: t, ate: temPeriodo(t) ? (form.ate < form.de ? form.de : form.ate) : form.de });
  return (
    <div className="aus-veu" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="aus-dlg" role="dialog" aria-modal="true" aria-label="Marcar ausência">
        <div className="aus-dlg-topo">
          <h2>Marcar ausência</h2>
          <button type="button" className="botao-icone" aria-label="Fechar" onClick={fechar}>
            <Icone nome="fechar" tam={15} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valido && !ocupado) marcar();
          }}
        >
          <label className="aus-rot">
            Quem
            <input className="aus-in" list="aus-editores" value={form.editor} autoFocus autoComplete="off" spellCheck={false} placeholder="o nome do editor" onChange={(e) => mudar({ ...form, editor: e.target.value })} />
            <datalist id="aus-editores">
              {editores.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </label>
          <div className="segmento aus-tipos" role="radiogroup" aria-label="Tipo">
            {TIPOS_DE_AUSENCIA.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={form.tipo === t.id} onClick={() => tipo(t.id)}>
                {t.nome === 'DM' ? 'DM' : t.nome.charAt(0).toUpperCase() + t.nome.slice(1)}
              </button>
            ))}
          </div>
          <div className="aus-datas">
            <label className="aus-rot">
              {periodo ? 'De' : 'Dia'}
              <input className="aus-in" type="date" value={form.de} onChange={(e) => mudar({ ...form, de: e.target.value, ate: form.ate < e.target.value ? e.target.value : form.ate })} />
            </label>
            {periodo && (
              <label className="aus-rot">
                Até (o último dia fora)
                <input className="aus-in" type="date" value={form.ate} min={form.de} onChange={(e) => mudar({ ...form, ate: e.target.value })} />
              </label>
            )}
          </div>
          <label className="aus-rot">
            Observação
            <input className="aus-in" value={form.observacao} maxLength={200} placeholder="comp, aniversário, volta dia 2…" onChange={(e) => mudar({ ...form, observacao: e.target.value })} />
          </label>
          <p className="aus-efeito" aria-live="polite">
            {valido && (periodo ? `Cobre ${n} ${n === 1 ? 'dia' : 'dias'}, de ${diaCurto(form.de)} a ${diaCurto(ate)}: marcada uma vez, vale para todas as pautas do período.` : `Só ${diaCurto(form.de)}.`)}
            {vagas.length > 0 && ` ${quem} está na escala em ${ondeEscrito(vagas, turnos)}: lá a posição vira vaga.`}
            {publicados.length > 0 && ` ${publicados.map((e) => diaCurto(e.dia)).join(', ')} já ${publicados.length === 1 ? 'foi publicado' : 'foram publicados'} com ${quem}: depois de marcar, dá para tirar de lá.`}
            {escalada && !escalada.length && ` ${quem} não está na escala no período.`}
          </p>
          {erro && (
            <p className="aus-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="aus-dlg-pe">
            <button type="button" className="botao" onClick={fechar}>
              Cancelar
            </button>
            <button type="submit" className="botao primario" disabled={!valido || ocupado}>
              Marcar {nomeDoTipo(form.tipo)}
            </button>
          </div>
        </form>
        {marcadas.length > 0 && (
          <div className="aus-ja">
            <span className="aus-rotulo">Já marcadas</span>
            <ul>
              {marcadas.map((a) => (
                <li key={a.id}>
                  <span className="pauta-avatar" aria-hidden="true">
                    {iniciais(a.editor)}
                  </span>
                  <span className="aus-ja-nome">{a.editor}</span>
                  <span className="aus-motivo">
                    {nomeDoTipo(a.tipo)}
                    {a.observacao && ` ${a.observacao}`} · {a.de === a.ate ? diaCurto(a.de) : `${diaCurto(a.de)} a ${diaCurto(a.ate)}`}
                    {a.de <= dia && dia <= a.ate && ' · no dia'}
                  </span>
                  <button type="button" className="botao-texto perigo" disabled={ocupado} onClick={() => apagar(a.id)}>
                    apagar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
