import { conferirODia, type AlvoDaPendencia, type Pendencia } from '../modelo/conferenciaDaEscala';
import { NomeComVersoes } from './CodigoDasVersoes';
import { horarioNoPadrao, lerDemanda, type DiaDaEscala, type PosicaoDaEscala, type PublicacaoDoDia } from '../modelo/escala';
import { nomeComparavel } from '../modelo/ligarPeloNome';
import { diaVizinho } from '../modelo/pauta';
import { MESES, partes } from './pecasDaPauta';
import './conferirPauta.css';

/* Montar a pauta, conferir e publicar (#127): as telas "conferir" e "publicada" do protótipo aprovado, e a faixa da
   publicação na tela de montar (o estado, o Desfazer da última e o histórico). A conferência é a regra pura de
   src/modelo/conferenciaDaEscala.ts, sobre o que está na tela; as pendências avisam, não travam: publicar funciona com
   elas e guarda quantas "para olhar" ficaram. Com a chave da virada desligada, o dia publicado aparece na Pauta da edição
   junto com a do Teable; ligada (#134), publicar grava o dia no Teable, e a tela diz quando gravou (ou o erro). Os avisos de cada posição e o recado do dia (#125) entram no placar
   e na tela "publicada". */

/** A virada (#134): o dia no Teable, só com a chave ligada: quando foi gravado, ou o erro da última vez. */
function NoTeable({ dados }: { dados: DiaDaEscala }) {
  const t = dados.noTeable;
  if (!t?.ligada || (!t.erro && !t.gravadoEm) || !dados.publicacao) return null;
  return t.erro ? (
    <p className="pub-teable falha" role="alert">
      {t.erro}
    </p>
  ) : (
    <p className="pub-teable">gravada no Teable às {hora(t.gravadoEm!)}</p>
  );
}

/** "sexta, 27 de novembro". */
export function diaPorExtenso(iso: string) {
  const p = partes(iso);
  return `${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][p.semana]}, ${p.dia} de ${MESES[p.mes]}`;
}
const diaMes = (iso: string) => `${partes(iso).dia}/${partes(iso).mes + 1}`;
/** "18h42", no horário de São Paulo. */
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(':', 'h');
/** "27/11 às 18h42". */
const quando = (iso: string) => `${diaMes(new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))} às ${hora(iso)}`;
const quantas = (n: number, uma: string, varias: string) => `${n} ${n === 1 ? uma : varias}`;

/** As posições como o servidor grava: sem as linhas de demanda e de aviso vazias. */
const semLinhaVazia = (ps: readonly PosicaoDaEscala[]) => ps.map((p) => ({ ...p, demandas: p.demandas.filter((d) => d.texto.trim()), avisos: p.avisos.filter((a) => a.texto.trim()) }));

/** O placar do dia: posições, editores (cada nome uma vez), demandas e avisos (o recado do dia conta como um). */
function placar(posicoes: readonly PosicaoDaEscala[], recado: string) {
  const editores = new Set(posicoes.map((p) => nomeComparavel(p.editor)).filter(Boolean));
  return { posicoes: posicoes.length, editores: editores.size, demandas: posicoes.reduce((n, p) => n + p.demandas.length, 0), avisos: posicoes.reduce((n, p) => n + p.avisos.length, 0) + (recado.trim() ? 1 : 0) };
}

/** A conferência do que está na tela, com as dispensadas separadas. */
export function conferenciaDaTela(dados: DiaDaEscala, posicoes: readonly PosicaoDaEscala[]) {
  const c = conferirODia({ dia: dados.dia, posicoes: semLinhaVazia(posicoes), editores: dados.editores, turnos: dados.turnos });
  const certa = (p: Pendencia) => dados.dispensadas.includes(p.chave);
  return { paraOlhar: c.paraOlhar.filter((p) => !certa(p)), soParaSaber: c.soParaSaber.filter((p) => !certa(p)), conferidas: [...c.paraOlhar, ...c.soParaSaber].filter(certa) };
}

interface PropsDoConferir {
  dados: DiaDaEscala;
  posicoes: readonly PosicaoDaEscala[];
  recado: string;
  hoje: string;
  publicando: boolean;
  erro: string;
  voltar: () => void;
  corrigir: (alvo: AlvoDaPendencia) => void;
  marcar: (chave: string, certo: boolean) => void;
  publicar: () => void;
}

/** Conferir antes de publicar: o placar, as pendências em dois grupos (e as conferidas) e o botão de publicar. */
export function ConferirODia({ dados, posicoes, recado, hoje, publicando, erro, voltar, corrigir, marcar, publicar }: PropsDoConferir) {
  const c = conferenciaDaTela(dados, posicoes);
  const n = placar(semLinhaVazia(posicoes), recado);
  const nome = dados.dia === diaVizinho(hoje, 1) ? 'amanhã' : dados.dia === hoje ? 'hoje' : diaMes(dados.dia);
  const item = (p: Pendencia, grupo: 'olhar' | 'saber' | 'conferida') => (
    <li key={p.chave} className={`conf-prob ${grupo}`} data-chave={p.chave}>
      <span className="conf-prob-tipo">{p.tipo}</span>
      <strong className={p.alvo.campo === 'demanda' ? 'mono' : ''}>{p.titulo}</strong>
      <span className="conf-prob-det">{p.detalhe}</span>
      <span className="conf-prob-acoes">
        <button type="button" className="botao" onClick={() => corrigir(p.alvo)}>
          Corrigir
        </button>
        {grupo === 'conferida' ? (
          <button type="button" className="botao-texto" onClick={() => marcar(p.chave, false)}>
            reabrir
          </button>
        ) : (
          <button type="button" className="botao-texto" onClick={() => marcar(p.chave, true)}>
            está certo
          </button>
        )}
      </span>
    </li>
  );
  return (
    <div className="conferir">
      <p className="conf-voltar">
        <button type="button" className="voltar-cad" onClick={voltar}>
          ← Voltar para a pauta
        </button>
      </p>
      <div className="pauta-cabeca">
        <div>
          <h1>Conferir antes de publicar</h1>
          <p className="pauta-sub">{diaPorExtenso(dados.dia)}</p>
        </div>
      </div>
      <div className="conf-placar">
        <span><b>{n.posicoes}</b>{n.posicoes === 1 ? 'posição' : 'posições'}</span>
        <span><b>{n.editores}</b>{n.editores === 1 ? 'editor' : 'editores'}</span>
        <span><b>{n.demandas}</b>{n.demandas === 1 ? 'demanda' : 'demandas'}</span>
        {n.avisos > 0 && <span><b>{n.avisos}</b>{n.avisos === 1 ? 'aviso' : 'avisos'}</span>}
      </div>
      <div className="conf-corpo">
        <section className="conf-lista" aria-label="Pendências">
          <h2 className="conf-rotulo">Para olhar · {c.paraOlhar.length}</h2>
          {c.paraOlhar.length ? <ul>{c.paraOlhar.map((p) => item(p, 'olhar'))}</ul> : <p className="conf-nada">nada para olhar!</p>}
          {c.soParaSaber.length > 0 && (
            <>
              <h2 className="conf-rotulo">Só para saber · {c.soParaSaber.length}</h2>
              <ul>{c.soParaSaber.map((p) => item(p, 'saber'))}</ul>
            </>
          )}
          {c.conferidas.length > 0 && (
            <>
              <h2 className="conf-rotulo">Conferidas · {c.conferidas.length}</h2>
              <ul>{c.conferidas.map((p) => item(p, 'conferida'))}</ul>
            </>
          )}
        </section>
        <aside className="conf-lado">
          <div className="conf-publicar">
            <span className={`conf-pend${c.paraOlhar.length ? '' : ' ok'}`}>{c.paraOlhar.length ? `${quantas(c.paraOlhar.length, 'item', 'itens')} para olhar; dá para publicar assim mesmo` : 'tudo conferido'}</span>
            <button type="button" className="botao primario" disabled={publicando || !n.posicoes} onClick={publicar}>
              {publicando ? 'Publicando…' : `${dados.publicacao ? 'Publicar de novo' : 'Publicar'} a pauta de ${nome}`}
            </button>
            {erro && (
              <p className="conf-erro" role="alert">
                {erro}
              </p>
            )}
            <p>{dados.noTeable?.ligada ? 'Os editores veem na Pauta da edição, e o dia vai para o Teable. Dá para mudar depois e publicar de novo.' : 'Os editores veem na Pauta da edição, junto com o que vem do Teable. Dá para mudar depois e publicar de novo.'}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

interface PropsDaPublicada {
  dados: DiaDaEscala;
  posicoes: readonly PosicaoDaEscala[];
  recado: string;
  voltar: () => void;
  desfazer: () => void;
  irPara: (dia: string) => void;
}

/** Depois de publicar: o carimbo, o resumo do que foi publicado, o Desfazer e a pauta do dia por turno. */
export function DiaPublicado({ dados, posicoes, recado, voltar, desfazer, irPara }: PropsDaPublicada) {
  const ps = semLinhaVazia(posicoes);
  const n = placar(ps, recado);
  const semEditor = ps.filter((p) => !p.editor.trim()).reduce((k, p) => k + p.demandas.length, 0);
  const pub = dados.publicacao;
  const proximo = diaVizinho(dados.dia, 1);
  return (
    <div className="publicada">
      <div className="pub-cabeca">
        <span className="pub-carimbo">publicada!</span>
        <h1>A pauta de {diaPorExtenso(dados.dia)} está no ar</h1>
        {pub && <p className="pauta-sub">às {hora(pub.em)} · os editores já veem na Pauta da edição</p>}
        <NoTeable dados={dados} />
      </div>
      <div className="pub-cartoes">
        <div><b>{n.demandas}</b>{n.demandas === 1 ? 'demanda publicada' : 'demandas publicadas'}, {semEditor ? `${semEditor} ainda sem editor` : 'todas com editor'}</div>
        <div><b>{n.posicoes}</b>{n.posicoes === 1 ? 'posição' : 'posições'}, com {quantas(n.editores, 'editor', 'editores')}</div>
        <div><b>{pub?.pendencias ?? 0}</b>{pub?.pendencias === 1 ? 'pendência ficou' : 'pendências ficaram'} para olhar</div>
      </div>
      <div className="pub-acoes">
        <button type="button" className="botao" onClick={voltar}>
          Voltar a mexer
        </button>
        <button type="button" className="botao" onClick={desfazer}>
          Desfazer
        </button>
        <button type="button" className="botao primario" onClick={() => irPara(proximo)}>
          Montar {diaPorExtenso(proximo).split(',')[0]}, {diaMes(proximo)} →
        </button>
      </div>
      {recado.trim() && (
        <div className="pauta-balao-aviso pub-recado" role="note" aria-label="Recado do dia">
          <span className="pauta-balao-titulo">recado do dia</span>
          <span className="pauta-aviso-texto">{recado.trim()}</span>
        </div>
      )}
      <div className="pub-grade">
        {dados.turnos.map((t) => {
          const doTurno = ps.filter((p) => p.turno === t.id);
          return (
            <section key={t.id} className="pub-turno" aria-label={t.nome}>
              <h2>{t.nome}</h2>
              {doTurno.length ? (
                doTurno.map((p) => (
                  <div key={p.id} className="pub-pos">
                    <strong>{p.editor.trim() || 'sem editor'}</strong> <span className="pauta-turno">{horarioNoPadrao(p.horario)}</span>
                    {p.avisos.length > 0 && (
                      <ul className="pub-avisos" aria-label={`Avisos para ${p.editor.trim() || 'sem editor'}`}>
                        {p.avisos.map((a) => (
                          <li key={a.id}>
                            <span aria-hidden="true">⚑</span> {a.texto}
                          </li>
                        ))}
                      </ul>
                    )}
                    <ul className="pub-itens">
                      {p.demandas.map((d) => {
                        const l = lerDemanda(d.texto, dados.dia);
                        return l.tipo === 'claquete' ? (
                          <li key={d.id} className="pub-item pub-claquete">
                            {/* o código no fim do nome, uma vez só, se a pessoa liga (#152) */}
                            <NomeComVersoes nome={l.padrao} versoes={l.versoes} de="da claquete" />
                          </li>
                        ) : (
                          <li key={d.id} className="pub-item pub-tarefa">
                            {d.texto}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="pub-ninguem">ninguém</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Na tela de montar: a publicação que vale, o Desfazer da última e o histórico das publicações. */
export function FaixaDaPublicacao({ dados, desfazer }: { dados: DiaDaEscala; desfazer: () => void }) {
  const pub = dados.publicacao;
  if (!dados.historico.length) return null;
  const linha = (h: PublicacaoDoDia) => `${quando(h.em)}${h.por ? ` por ${h.por}` : ''} · ${quantas(h.pendencias, 'pendência ficou', 'pendências ficaram')}`;
  return (
    <div className={`pub-faixa ${dados.estado}`} role="status">
      <span className="pub-faixa-texto">
        {pub ? (
          <>
            <b>{dados.estado === 'alterado' ? 'Alterada depois de publicar' : 'Publicada'}</b> · {linha(pub)}
            {dados.estado === 'alterado' && ' · publique de novo para a equipe ver'}
          </>
        ) : (
          <>
            <b>Publicação desfeita</b> · a equipe vê só a pauta do Teable
          </>
        )}
      </span>
      <NoTeable dados={dados} />
      {pub && (
        <button type="button" className="botao-texto" onClick={desfazer}>
          Desfazer a publicação
        </button>
      )}
      <details className="pub-historico">
        <summary>Histórico · {dados.historico.length}</summary>
        <ol>
          {dados.historico.map((h) => (
            <li key={h.em} className={h.desfeitaEm ? 'desfeita' : ''}>
              {linha(h)}
              {h.desfeitaEm && ` · desfeita ${quando(h.desfeitaEm)}`}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
