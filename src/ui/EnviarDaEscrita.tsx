import { useEffect, useMemo, useRef, useState } from 'react';
import { armazenamento, atracaoNoServidor, lerEnviosDoEscrito, type EnvioDoEscrito, type EnvioFeito, type EnviosDoEscrito } from '../dados/armazenamento';
import { andamentoDaArte, artesParaAFila, avisosDoEnvio, propostaDaClaquete, roteiroDoEnvio, type ClaqueteConferida } from '../modelo/enviar';
import { exportar, travamTrello } from '../modelo/exportar';
import { diferencasDeTexto, type PedacoDaFolha } from '../modelo/diferencas';
import { versoesDoRoteiro } from '../modelo/versoesDoRoteiro';
import { editorDaPauta, programasConhecidos } from '../modelo/vocabularios';
import { letraEVersaoDoRoteiro, marcaDaLetraEVersao, proximaLetraEVersao } from '../modelo/letraEVersao';
import type { Roteiro } from '../modelo/tipos';
import { CardAberto, FecharOCardAberto, useFecharCardAberto } from './CardAberto';
import { FolhaComDiferencas, PerguntaDaLiberacao } from './Comparar';
import { BolinhaDeEstado, Vazio } from './pecas';
import { Icone } from './icones';
import { Vagas } from './vagas';
import { atalho, dataCurtaComDia, haQuantoTempo, plural } from './util';
import './enviar.css';

/* O Enviar da folha de escrita (#194, spec #186). O botão Enviar (e o Ctrl+Enter) abre o painel no card aberto (a peça
   `CardAberto`, que cresce do botão): a claquete proposta (a atração da lista, a data e as versões lidas nas artes),
   que o redator confere ou corrige, com os avisos de "não bate" da fila; as pendências (os comentários abertos e o que
   segura o envio automático); e os destinos (a fila da arte e a Pauta da edição). O reenvio pergunta "já foi liberada
   para exibição?" (a `PerguntaDaLiberacao` da fila) e vira a V2 ou a letra B.

   Ao lado da folha, o andamento da arte (entrada, produzindo, entregue, pela Produção do último envio) e o histórico
   dos envios: cada um abre o texto como foi, com o que mudou desde o anterior (a folha da comparação). */

const hojeIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const letraEVersaoEscrita = (l: { letra: string; versao: number }) => `${l.letra} V${l.versao}`;

interface Props {
  /** o botão Enviar: o painel cresce dele e volta para ele */
  origem: HTMLElement | null;
  /** o roteiro como está na folha agora (o texto vivo e a meta) */
  escrito: Roteiro;
  /** o último envio, ou null no primeiro */
  ultimo: EnvioDoEscrito | null;
  /** quantos comentários estão abertos no roteiro (#192) */
  comentariosAbertos: number;
  enviar: (conferida: ClaqueteConferida, opcoes: { motivo: string; liberada?: boolean }) => Promise<EnvioFeito>;
  aoEnviar: (feito: EnvioFeito) => void;
  fechar: () => void;
}

export function PainelDoEnviar(props: Props) {
  return (
    <CardAberto origem={props.origem} titulo="enviar-titulo" fechar={props.fechar}>
      <ConteudoDoEnviar {...props} />
    </CardAberto>
  );
}

function ConteudoDoEnviar({ escrito, ultimo, comentariosAbertos, enviar, aoEnviar }: Props) {
  const fechar = useFecharCardAberto();
  const inicial = useMemo(() => propostaDaClaquete({ meta: escrito.meta, doc: escrito.doc }), [escrito]);
  const [programa, setPrograma] = useState(inicial.programa);
  const [data, setData] = useState(inicial.dataExibicao);
  const [claquete, setClaquete] = useState(inicial.claquete);
  // a claquete corrigida à mão não é refeita quando a atração ou a data mudam
  const aMao = useRef(false);
  const [motivo, setMotivo] = useState('');
  const [perguntando, setPerguntando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [recusa, setRecusa] = useState('');

  // sem a atração na lista do navegador, o servidor procura nas keys do Teable, pelo título
  useEffect(() => {
    if (inicial.programa || armazenamento.tipo !== 'servidor' || !escrito.meta.titulo.trim()) return;
    let vivo = true;
    void atracaoNoServidor(escrito.meta.titulo).then((nome) => {
      if (!vivo || !nome || aMao.current) return;
      const p = propostaDaClaquete({ meta: escrito.meta, doc: escrito.doc, atracaoDoServidor: nome });
      setPrograma(p.programa);
      setClaquete(p.claquete);
    });
    return () => {
      vivo = false;
    };
  }, [inicial, escrito]);

  const refazer = (mudanca: { programa?: string; dataExibicao?: string }) => {
    const p = propostaDaClaquete({ meta: escrito.meta, doc: escrito.doc, programa: mudanca.programa ?? programa, dataExibicao: mudanca.dataExibicao ?? data });
    if (!aMao.current) setClaquete(p.claquete);
  };
  const artes = useMemo(() => artesParaAFila(escrito.doc), [escrito.doc]);
  const versoes = useMemo(() => versoesDoRoteiro(artes, claquete, hojeIso()), [artes, claquete]);
  const avisos = avisosDoEnvio({ claquete, programa, dataExibicao: data, versoes });
  const trava = avisos.some((a) => a.trava);
  const tipoPrograma = programasConhecidos().find((p) => p.nome === programa)?.tipo;
  const editor = escrito.meta.editor || editorDaPauta(claquete);
  const conferida: ClaqueteConferida = { claquete, programa, dataExibicao: data, ...(tipoPrograma ? { tipoPrograma } : {}), ...(editor ? { editor } : {}) };
  // o que a fila vai ver: as pendências do roteiro como entra nela; as que seguram o envio automático "travam"
  const previa = useMemo(() => roteiroDoEnvio(escrito, conferida, 'previa'), [escrito, claquete, programa, data, editor]); // eslint-disable-line react-hooks/exhaustive-deps
  const travam = travamTrello(previa.meta.revisar);
  const nArtes = exportar(previa).artes.length;
  const de = ultimo ? { letra: ultimo.letra, versao: ultimo.versao } : null;

  const mandar = async (liberada?: boolean) => {
    setEnviando(true);
    setRecusa('');
    try {
      const feito = await enviar(conferida, { motivo, ...(ultimo ? { liberada: !!liberada } : {}) });
      aoEnviar(feito);
      fechar();
    } catch (e) {
      setRecusa(e instanceof Error ? e.message : 'Não consegui enviar o roteiro.');
      setPerguntando(false);
    } finally {
      setEnviando(false);
    }
  };
  const pedirEnvio = () => {
    if (trava || enviando) return;
    if (ultimo) setPerguntando(true);
    else void mandar();
  };

  return (
    <div className="enviar" onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && (e.preventDefault(), pedirEnvio())}>
      <header className="enviar-cabeca">
        <div>
          <p className="enviar-sobre">{ultimo ? `Reenviar · o último foi ${letraEVersaoEscrita(de!)}` : 'Enviar · o primeiro envio'}</p>
          <h2 id="enviar-titulo">{escrito.meta.titulo.trim() || 'Sem título'}</h2>
        </div>
        <FecharOCardAberto />
      </header>

      <section className="enviar-bloco" aria-labelledby="enviar-claquete">
        <h3 id="enviar-claquete">A claquete</h3>
        <p className="enviar-dica">Proposta pela atração da lista, pela data e pelas versões que as artes dizem. Confira ou corrija.</p>
        <div className="enviar-campos">
          <label className="enviar-campo enviar-campo-largo">
            <span>Claquete</span>
            <input
              className="enviar-claquete"
              value={claquete}
              spellCheck={false}
              autoFocus
              onChange={(e) => {
                aMao.current = true;
                setClaquete(e.target.value);
              }}
            />
          </label>
          <label className="enviar-campo">
            <span>Atração</span>
            <input
              list="enviar-atracoes"
              value={programa}
              placeholder="da lista de atrações"
              onChange={(e) => {
                setPrograma(e.target.value);
                refazer({ programa: e.target.value });
              }}
            />
            <datalist id="enviar-atracoes">
              {programasConhecidos().map((p) => (
                <option key={p.nome} value={p.nome} />
              ))}
            </datalist>
          </label>
          <label className="enviar-campo">
            <span>Exibição</span>
            <input
              type="date"
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                refazer({ dataExibicao: e.target.value });
              }}
            />
          </label>
        </div>
        <p className="enviar-versoes" aria-label="As versões lidas nas artes">
          <span className="rotulo">versões nas artes</span>
          {versoes.length ? versoes.map((v) => <span key={v.codigo} className={`enviar-versao${v.aConferir ? ' a-conferir' : ''}`} title={v.aConferir ? 'O dia sozinho: a conferir' : undefined}><b>{v.codigo}</b> {v.rotulo}</span>) : <Vazio como="span" pequeno>nenhuma</Vazio>}
        </p>
        {avisos.length > 0 && (
          <ul className="enviar-avisos" aria-label="O que não bate">
            {avisos.map((a) => (
              <li key={a.id} className={a.trava ? 'trava' : ''}>
                <Icone nome="atencao" tam={13} traco={2.4} /> {a.texto}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="enviar-bloco" aria-labelledby="enviar-pendencias">
        <h3 id="enviar-pendencias">Pendências</h3>
        <ul className="enviar-lista">
          <li>
            <BolinhaDeEstado estado={comentariosAbertos ? 'produzindo' : 'ok'} />
            {comentariosAbertos ? `${plural(comentariosAbertos, 'comentário aberto', 'comentários abertos')} no roteiro` : 'Nenhum comentário aberto'}
          </li>
          {travam.length ? (
            travam.map((t) => (
              <li key={t}>
                <BolinhaDeEstado estado="produzindo" /> {t} <small>segura o envio sozinho ao Trello: a arte revisa antes</small>
              </li>
            ))
          ) : (
            <li>
              <BolinhaDeEstado estado="ok" /> Nada segura a fila: {plural(nArtes, 'arte marcada', 'artes marcadas')}
            </li>
          )}
        </ul>
      </section>

      <section className="enviar-bloco" aria-labelledby="enviar-destinos">
        <h3 id="enviar-destinos">Vai para</h3>
        <ul className="enviar-destinos">
          <li>
            <Icone nome="lista" tam={15} traco={2} />
            <span>
              <b>A fila da arte</b> <small>{ultimo ? 'no lugar do envio anterior, com o card dele' : 'a revisão de sempre, marcado “escrito no PROMeiro”'}</small>
            </span>
          </li>
          <li>
            <Icone nome="calendario" tam={15} traco={2} />
            <span>
              <b>A Pauta da edição</b> <small>{editor ? `com ${editor}` : 'a claquete ainda não está na pauta'}{data ? ` · ${dataCurtaComDia(data)}` : ''}</small>
            </span>
          </li>
        </ul>
        <label className="enviar-campo enviar-motivo">
          <span>O que vai neste envio (opcional)</span>
          <input value={motivo} maxLength={160} placeholder={ultimo ? 'a cartela nova, o trecho do final…' : 'a primeira versão'} onChange={(e) => setMotivo(e.target.value)} />
        </label>
      </section>

      <footer className="enviar-pe">
        {recusa && (
          <p className="enviar-recusa" role="alert">
            {recusa}
          </p>
        )}
        {perguntando && de ? (
          <PerguntaDaLiberacao anterior={{ letra: de.letra, versao: de.versao }} ocupado={enviando} responder={(liberada) => void mandar(liberada)} cancelar={() => setPerguntando(false)} />
        ) : (
          <>
            <span className="enviar-marca">{de ? `a nova fica ${letraEVersaoEscrita(proximaLetraEVersao(de, false))} ou ${proximaLetraEVersao(de, true).letra}` : 'entra como a A V1'}</span>
            <button type="button" className="botao primario" disabled={trava || enviando} onClick={pedirEnvio} title={`Enviar (${atalho('Mod-Enter')})`}>
              {enviando ? 'Enviando…' : ultimo ? 'Enviar a versão nova' : 'Enviar para a fila'}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

/* ---------- ao lado da folha: o andamento e o histórico ---------- */

/** O andamento da arte e os envios, ao lado da folha do roteiro enviado. `vez` muda a cada Enviar (lê de novo). */
export function EnviosDaEscrita({ id, vez, aoLer }: { id: string; vez: number; aoLer?: (e: EnviosDoEscrito) => void }) {
  const [lidos, setLidos] = useState<EnviosDoEscrito | null>(null);
  const [aberto, setAberto] = useState<{ envio: EnvioDoEscrito; origem: HTMLElement } | null>(null);
  const aviso = useRef(aoLer);
  aviso.current = aoLer;
  useEffect(() => {
    if (armazenamento.tipo !== 'servidor') return;
    let vivo = true;
    const ler = () =>
      void lerEnviosDoEscrito(id).then(
        (e) => {
          if (!vivo) return;
          setLidos(e);
          aviso.current?.(e);
        },
        () => {},
      );
    ler();
    // o andamento da arte muda sozinho (a Produção): lê de novo a cada minuto, com a aba à vista
    const t = setInterval(() => document.visibilityState === 'visible' && ler(), 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [id, vez]);
  if (!lidos?.envios.length) return null;
  const andamento = lidos.fila?.andamento ?? andamentoDaArte(null);
  const anterior = (e: EnvioDoEscrito) => lidos.envios[lidos.envios.indexOf(e) + 1] ?? null;
  return (
    <>
      <section className="cartao andamento-da-arte" aria-label="O andamento da arte">
        <div className="cab-artes">
          <b>Na arte</b>
          <span className="rotulo">{lidos.fila ? lidos.fila.claquete : 'saiu da fila'}</span>
        </div>
        <ol className="passos-da-arte">
          {andamento.map((p) => (
            <li key={p.id} data-situacao={p.situacao} aria-current={p.situacao === 'agora' ? 'step' : undefined}>
              <BolinhaDeEstado estado={p.situacao === 'depois' ? 'card' : p.id} tam="ficha" />
              <span className="passo-nome">{p.nome}</span>
              {p.quando && <small>{haQuantoTempo(p.quando)}</small>}
            </li>
          ))}
        </ol>
        <p className="suave pequeno andamento-nota">
          {lidos.fila?.designers.length ? `com ${lidos.fila.designers.join(', ')}` : andamento.every((p) => p.situacao === 'depois') ? 'na fila, esperando a revisão da arte' : 'sem designer ainda'}
          {lidos.fila?.trello?.url && (
            <>
              {' · '}
              <a href={lidos.fila.trello.url} target="_blank" rel="noreferrer">
                o card
              </a>
            </>
          )}
        </p>
      </section>
      <section className="cartao envios-da-escrita" aria-label="Os envios">
        <div className="cab-artes">
          <b>
            <i>{lidos.envios.length}</i> {lidos.envios.length === 1 ? 'envio' : 'envios'}
          </b>
          <span className="rotulo">o que mudou em cada um</span>
        </div>
        <ol className="lista-de-envios">
          <Vagas itens={lidos.envios} chave={(e) => String(e.n)} como="li">
            {(e) => (
              <button type="button" className="envio-linha" onClick={(ev) => setAberto({ envio: e, origem: ev.currentTarget })}>
                <span className="envio-marca">{marcaDaLetraEVersao(letraEVersaoDoRoteiro({ letra: e.letra, versao: e.versao })) || 'V1'}</span>
                <span className="txt">
                  <b>{e.motivo || (anterior(e) ? 'versão nova' : 'primeiro envio')}</b>
                  <span>
                    {e.por.nome} · {haQuantoTempo(e.em)}
                  </span>
                </span>
              </button>
            )}
          </Vagas>
        </ol>
      </section>
      {aberto && <EnvioAberto id={id} envio={aberto.envio} anterior={anterior(aberto.envio)} origem={aberto.origem} fechar={() => setAberto(null)} />}
    </>
  );
}

/** Um envio aberto: o texto como foi, com o que entrou e o que saiu desde o envio anterior. */
function EnvioAberto({ id, envio, anterior, origem, fechar }: { id: string; envio: EnvioDoEscrito; anterior: EnvioDoEscrito | null; origem: HTMLElement; fechar: () => void }) {
  const [pedacos, setPedacos] = useState<PedacoDaFolha[] | null>(null);
  useEffect(() => {
    let vivo = true;
    const texto = (n: number) => armazenamento.lerVersao(id, n).then((v) => exportar({ id, meta: v.meta, doc: v.doc, revisao: 1, criadoEm: '', atualizadoEm: '' }).texto.completo);
    void Promise.all([texto(envio.n), anterior ? texto(anterior.n) : Promise.resolve(null)]).then(
      ([agora, antes]) => vivo && setPedacos(antes === null ? [{ tipo: 'igual', texto: agora, marcado: false }] : diferencasDeTexto(antes, agora).map((t) => ({ tipo: t.tipo, texto: t.texto, marcado: t.tipo !== 'igual' }))),
      () => vivo && setPedacos([]),
    );
    return () => {
      vivo = false;
    };
  }, [id, envio, anterior]);
  const marca = (e: EnvioDoEscrito) => marcaDaLetraEVersao(letraEVersaoDoRoteiro(e)) || 'V1';
  const mudou = pedacos?.filter((p) => p.marcado).length ?? 0;
  return (
    <CardAberto origem={origem} titulo="envio-aberto-titulo" fechar={fechar}>
      <div className="envio-aberto">
        <header className="enviar-cabeca">
          <div>
            <p className="enviar-sobre">
              {marca(envio)} · {envio.por.nome} · {haQuantoTempo(envio.em)}
            </p>
            <h2 id="envio-aberto-titulo">{envio.claquete}</h2>
            {envio.motivo && <p className="enviar-dica">{envio.motivo}</p>}
          </div>
          <FecharOCardAberto />
        </header>
        {pedacos === null ? (
          <p className="suave">Abrindo o envio…</p>
        ) : (
          <FolhaComDiferencas pedacos={pedacos} rotulo={`O texto do envio ${marca(envio)}`} anotacao={anterior ? (mudou ? `o que mudou desde a ${marca(anterior)}` : `igual à ${marca(anterior)}`) : 'o primeiro envio'} />
        )}
      </div>
    </CardAberto>
  );
}
