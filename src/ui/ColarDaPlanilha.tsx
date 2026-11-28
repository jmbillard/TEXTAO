import { useEffect, useMemo, useState } from 'react';
import { aplicarOColado, demandasQueEntram, lerOColado, type BlocoDoColado } from '../modelo/colarDaPlanilha';
import { quaisCasam } from '../dados/armazenamento';
import { nomeDoTipo, type Ausencia } from '../modelo/ausencias';
import { rotuloDaIlha } from '../modelo/ilhas';
import { lerDemanda, type DiaDaEscala, type PosicaoDaEscala } from '../modelo/escala';
import { Icone } from './icones';
import { DIAS_DA_SEMANA, partes } from './pecasDaPauta';
import './colarDaPlanilha.css';

/* Montar a pauta, colar da planilha (#130, a cena "colar" do protótipo): o diálogo em que a coordenação cola uma aba
   (ou um turno) copiada da planilha da edição. À esquerda, o que foi colado; à direita, o que o PROMeiro entendeu
   (colarDaPlanilha.ts), por turno: cada posição com o editor, a ilha, o horário, as demandas e os avisos, as notas do
   que foi interpretado e, quando o nome tem um erro de digitação ou serve para mais de um, a pergunta. No alto, o
   resumo: posições, demandas, avisos, ausências e grafias que vão para o padrão. A pessoa escolhe entre substituir o
   rascunho e juntar a ele; quem estava fora vira ausência (marcada uma vez) e a posição dele fica vaga.
   Só entra o que casa com uma Produção (#199, ADR 0008): o PROMeiro pergunta ao servidor quais claquetes casam (a mesma
   chave da Pauta) e mostra riscadas as que ficam de fora, a tarefa e a claquete sem Produção (com a info dela); elas não
   vão para o rascunho. A planilha é o rascunho de quem a escreveu, e a Pauta não mostraria nada disso: pôr no Montar uma
   linha que a Pauta esconde só confundiria. */

export interface ColadoParaAplicar {
  posicoes: PosicaoDaEscala[];
  ausencias: Omit<Ausencia, 'id'>[];
  /** "3 posições, 5 demandas e 1 ausência" */
  resumo: string;
}

interface Props {
  dados: DiaDaEscala;
  /** as posições do rascunho de agora (para juntar) */
  posicoes: readonly PosicaoDaEscala[];
  /** quem já está fora no dia */
  jaFora: readonly string[];
  novoId: (prefixo: string) => string;
  fechar: () => void;
  /** aplica no rascunho; lança no erro (o diálogo mostra) */
  aplicar: (r: ColadoParaAplicar) => Promise<void>;
}

const diaCurto = (iso: string) => {
  const p = partes(iso);
  return `${DIAS_DA_SEMANA[p.semana]} ${p.dia}/${p.mes + 1}`;
};
const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const preenchidas = (ps: readonly PosicaoDaEscala[]) => ps.filter((p) => p.editor.trim() || p.demandas.some((d) => d.texto.trim()) || p.avisos.some((a) => a.texto.trim()));

export function ColarDaPlanilha({ dados, posicoes, jaFora, novoId, fechar, aplicar }: Props) {
  const [texto, setTexto] = useState('');
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const ctx = useMemo(() => ({ dia: dados.dia, turnos: dados.turnos, editores: dados.editores, apelidos: dados.apelidos ?? {}, ilhas: dados.ilhas }), [dados]);
  const leitura = useMemo(() => (texto.trim() ? lerOColado(texto, ctx) : null), [texto, ctx]);
  const temRascunho = preenchidas(posicoes).length > 0;
  // quais claquetes do colado casam com uma Produção (#199): perguntado ao servidor, um pouco depois de colar
  const textos = useMemo(() => [...new Set((leitura?.blocos ?? []).flatMap((b) => b.demandas.map((d) => d.padrao)))], [leitura]);
  const [casam, setCasam] = useState<{ chave: string; mapa: ReadonlyMap<string, boolean> } | null>(null);
  const [erroDaConferencia, setErroDaConferencia] = useState('');
  const chaveDosTextos = textos.join('\n');
  useEffect(() => {
    if (!textos.length) return;
    let vivo = true;
    setErroDaConferencia('');
    const t = setTimeout(
      () =>
        void quaisCasam(dados.dia, textos).then(
          (r) => vivo && setCasam({ chave: chaveDosTextos, mapa: new Map(textos.map((x, i) => [x, !!r[i]])) }),
          (e) => vivo && setErroDaConferencia(e instanceof Error ? e.message : String(e)),
        ),
      250,
    );
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [dados.dia, textos, chaveDosTextos]);
  const casa = casam?.chave === chaveDosTextos ? casam.mapa : textos.length ? null : new Map<string, boolean>();
  const casaComAProducao = (t: string) => casa?.get(t) === true;
  const nDeFora = casa ? (leitura?.blocos ?? []).reduce((n, b) => n + demandasQueEntram(b.demandas.map((d) => d.padrao), casaComAProducao).deFora.length, 0) : 0;

  // Esc fecha
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !ocupado && fechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fechar, ocupado]);

  const ir = async (modo: 'substituir' | 'juntar') => {
    if (!leitura) return;
    setOcupado(true);
    setErro('');
    try {
      if (!casa) throw new Error('Ainda conferindo as claquetes nas Produções.');
      const r = aplicarOColado(leitura, { dia: dados.dia, turnos: dados.turnos, posicoes: preenchidas(posicoes), modo, respostas, jaFora, novoId, casa: casaComAProducao });
      const s = leitura.resumo;
      const entraram = s.demandas - r.deFora.length;
      await aplicar({ ...r, resumo: `${contar(s.posicoes, 'posição', 'posições')}, ${contar(entraram, 'claquete', 'claquetes')}${r.deFora.length ? ` (${r.deFora.length} de fora)` : ''} e ${contar(r.ausencias.length, 'ausência marcada', 'ausências marcadas')}` });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setOcupado(false);
    }
  };

  const s = leitura?.resumo;
  // as perguntas ainda sem resposta (a resposta "como escrito" também é uma: é o padrão)
  const semResposta = leitura?.blocos.filter((b) => (b.editor.como === 'parecido' || b.editor.como === 'ambiguo') && !respostas[b.id]).length ?? 0;
  const outroDia = leitura?.diaDaAba && leitura.diaDaAba !== dados.dia ? leitura.diaDaAba : '';
  return (
    <div className="aus-veu colar-veu" onMouseDown={(e) => e.target === e.currentTarget && !ocupado && fechar()}>
      <div className="aus-dlg colar-dlg" role="dialog" aria-modal="true" aria-label="Colar da planilha">
        <div className="aus-dlg-topo">
          <h2>Colar da planilha</h2>
          <button type="button" className="botao-icone" aria-label="Fechar" onClick={fechar}>
            <Icone nome="fechar" tam={15} />
          </button>
        </div>
        <p className="colar-ajuda">
          Na planilha, selecione a aba do dia inteira (ou só um turno) e copie. O PROMeiro procura cada “EDITOR:” e lê a ilha em cima, o horário embaixo e as demandas na coluna. As ausências, os avisos e as ilhas que sobram são separados sozinhos.
        </p>
        <div className="colar-grade">
          <textarea className="colar-texto" aria-label="O que foi copiado da planilha" value={texto} spellCheck={false} wrap="off" autoFocus placeholder="Ctrl+V aqui" onChange={(e) => setTexto(e.target.value)} />
          <section className="colar-lido" aria-label="O que o PROMeiro entendeu">
            {!leitura ? (
              <p className="colar-nada">cole à esquerda e o PROMeiro organiza aqui</p>
            ) : !leitura.blocos.length ? (
              <p className="colar-alerta" role="alert">
                Não achei “EDITOR:” no que foi colado. Para uma lista de claquetes, use “Para distribuir”, na coluna.
              </p>
            ) : (
              <>
                <p className="colar-resumo" role="status">
                  Entendi <b>{contar(s!.posicoes, 'posição', 'posições')}</b>, <b>{contar(s!.demandas, 'demanda', 'demandas')}</b>, <b>{contar(s!.avisos, 'aviso', 'avisos')}</b> e <b>{contar(s!.ausencias, 'ausência', 'ausências')}</b>.{' '}
                  <b>{s!.grafias}</b> {s!.grafias === 1 ? 'grafia vai' : 'grafias vão'} para o padrão.
                  {s!.vazias > 0 && ` ${contar(s!.vazias, 'bloco vazio fica', 'blocos vazios ficam')} de fora.`}
                </p>
                {/* só o que casa com uma Produção entra (#199): o resto aparece riscado */}
                {erroDaConferencia ? (
                  <p className="colar-alerta" role="alert">
                    Não consegui conferir as claquetes nas Produções: {erroDaConferencia}
                  </p>
                ) : !casa ? (
                  <p className="colar-conferindo">conferindo as claquetes nas Produções…</p>
                ) : nDeFora > 0 ? (
                  <p className="colar-de-fora-resumo">
                    <b>{contar(nDeFora, 'linha fica', 'linhas ficam')} de fora</b>: as tarefas e as claquetes sem Produção (riscadas) não vão para o rascunho; a Pauta só mostra as claquetes que casam com uma Produção.
                  </p>
                ) : null}
                {outroDia && (
                  <p className="colar-alerta">
                    A aba colada é de {diaCurto(outroDia)}; vai para {diaCurto(dados.dia)}, o dia aberto.
                  </p>
                )}
                {semResposta > 0 && <p className="colar-alerta">{contar(semResposta, 'nome para confirmar', 'nomes para confirmar')}: sem resposta, fica como foi escrito.</p>}
                {dados.turnos
                  .filter((t) => leitura.blocos.some((b) => b.turno === t.id))
                  .map((t) => (
                    <div key={t.id} className="colar-turno">
                      <h3>{t.nome}</h3>
                      {leitura.blocos
                        .filter((b) => b.turno === t.id)
                        .map((b) => (
                          <BlocoLido key={b.id} b={b} dados={dados} casa={casa ? casaComAProducao : null} resposta={respostas[b.id] ?? ''} responder={(nome) => setRespostas((r) => ({ ...r, [b.id]: nome }))} />
                        ))}
                    </div>
                  ))}
              </>
            )}
          </section>
        </div>
        {erro && (
          <p className="aus-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="aus-dlg-pe">
          <button type="button" className="botao" disabled={ocupado} onClick={fechar}>
            Cancelar
          </button>
          {!!leitura?.blocos.length &&
            (temRascunho ? (
              <>
                <button type="button" className="botao" disabled={ocupado || !casa} onClick={() => void ir('juntar')}>
                  Juntar ao rascunho
                </button>
                <button type="button" className="botao primario" disabled={ocupado || !casa} onClick={() => void ir('substituir')}>
                  Substituir o rascunho
                </button>
              </>
            ) : (
              <button type="button" className="botao primario" disabled={ocupado || !casa} onClick={() => void ir('substituir')}>
                Pôr em {diaCurto(dados.dia)}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

/** Um bloco lido: o editor (ou a vaga, ou quem está fora), a ilha e o horário, as demandas, os avisos e as notas. */
function BlocoLido({ b, dados, casa, resposta, responder }: { b: BlocoDoColado; dados: DiaDaEscala; casa: ((t: string) => boolean) | null; resposta: string; responder: (nome: string) => void }) {
  // o que fica de fora (#199): a tarefa, a claquete sem Produção e a info dela; sem a conferência ainda, nada riscado
  const deFora = new Map(casa ? demandasQueEntram(b.demandas.map((d) => d.padrao), casa).deFora.map((x) => [x.i, x.tipo]) : []);
  const ilha = dados.ilhas.find((i) => i.id === b.ilha.id);
  const pergunta = b.editor.como === 'parecido' || b.editor.como === 'ambiguo';
  const nome = pergunta ? resposta || b.editor.escrito : b.editor.nome;
  const notas = [
    ...(b.editor.como === 'apelido' ? [`${b.editor.escrito} → ${b.editor.nome}`] : []),
    ...(b.editor.como === 'novo' ? [`“${b.editor.escrito}” não está nos cadastros: nome novo`] : []),
    ...(b.ausencia && !['exato', 'apelido'].includes(b.editor.como) && !resposta ? ['a ausência só é marcada para quem está nos cadastros'] : []),
    ...(!b.ilha.escrito ? ['sem ilha'] : []),
    ...b.notas,
  ];
  const fora = b.ausencia ? `${nomeDoTipo(b.ausencia.tipo)}${b.ausencia.ate ? ` até ${Number(b.ausencia.ate.slice(8))}/${Number(b.ausencia.ate.slice(5, 7))}` : ''}${b.ausencia.observacao ? ` ${b.ausencia.observacao}` : ''}` : '';
  return (
    <div className="colar-pos" data-bloco={b.id}>
      <div className="colar-pos-cab">
        {b.ausencia ? (
          <span className="colar-fora">
            {nome || 'sem nome'} · fora ({fora})
          </span>
        ) : (
          <strong>{nome || 'vaga'}</strong>
        )}
        <span className="colar-onde">{[ilha ? rotuloDaIlha(ilha) : '', b.horario.padrao || (b.ausencia ? '' : b.horario.escrito)].filter(Boolean).join(' · ')}</span>
      </div>
      {pergunta && (
        <div className="colar-pergunta" role="group" aria-label={`Quem é “${b.editor.escrito}”?`}>
          <span>{b.editor.como === 'parecido' ? `“${b.editor.escrito}” é` : `“${b.editor.escrito}” é qual?`}</span>
          {b.editor.opcoes.map((o) => (
            <button key={o} type="button" className="colar-opcao" aria-pressed={resposta === o} onClick={() => responder(resposta === o ? '' : o)}>
              {o}
            </button>
          ))}
          <button type="button" className="colar-opcao" aria-pressed={!resposta} onClick={() => responder('')}>
            {b.editor.como === 'parecido' ? 'não, nome novo' : 'como escrito'}
          </button>
        </div>
      )}
      {(b.demandas.length > 0 || b.avisos.length > 0) && (
        <div className="colar-itens">
          {b.demandas.map((d, i) => {
            const fora = deFora.get(i);
            return (
              <span
                key={`d${i}`}
                className={`${lerDemanda(d.padrao, dados.dia).tipo === 'claquete' ? 'colar-claquete' : 'colar-tarefa'}${fora ? ' colar-de-fora' : ''}`}
                title={fora === 'claquete' ? 'fica de fora: não casa com nenhuma Produção' : fora === 'tarefa' ? 'fica de fora: tarefa' : fora === 'info' ? 'fica de fora: é da claquete de fora' : undefined}>
                {d.padrao}
              </span>
            );
          })}
          {b.avisos.map((a, i) => (
            <span key={`a${i}`} className="colar-aviso">
              ⚑ {a}
            </span>
          ))}
        </div>
      )}
      {notas.length > 0 && (
        <ul className="colar-notas">
          {notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
