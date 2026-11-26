import { useCallback, useEffect, useState } from 'react';
import { lerAndamentoDoProjeto, type AndamentoDoProjeto } from '../dados/armazenamento';
import { tituloCurto, type Etapa, type Frente, type TicketDoAndamento } from '../modelo/andamento';
import { Icone } from './icones';
import { Marca } from './pecas';
import { useTelaDeCelular } from './faixa';
import './configuracao.css';
import './andamento.css';

/* O Andamento do projeto (#92), só para administradores (menu do perfil, perto da Configuração): a trilha das etapas
   do ADR 0006 com onde estamos, uma linha por frente (spec) com a barra de tickets feitos / total e o que vem agora, e
   os tickets de cada frente com a situação e o link para a issue. Lido do GitHub pelo servidor, guardado alguns
   minutos ("lido há N min", "Ler de novo"); sem token ou com o GitHub fora, diz isso e mostra a última leitura.
   Só consulta, no computador e no celular. */

interface Props {
  voltar: () => void;
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** "agora há pouco", "há 1 min", "há 3 h", "em 12/11/26 09:40". */
function lidoHa(iso: string, agora = Date.now()) {
  const min = Math.floor((agora - Date.parse(iso)) / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  return `em ${quando(iso)}`;
}

/** Onde estamos na trilha: entre a quase pronta e a próxima. */
function ondeEstamos(etapas: Etapa[]) {
  const quase = etapas.find((e) => e.situacao === 'quase pronta');
  const prox = etapas.find((e) => e.situacao === 'próxima');
  if (quase && prox) return `entre a etapa ${quase.ordem} (${quase.etapa}, quase pronta) e a ${prox.ordem} (${prox.etapa}, a próxima)`;
  if (prox) return `a caminho da etapa ${prox.ordem} (${prox.etapa})`;
  return '';
}

const Link = ({ url, children }: { url: string; children: string }) =>
  url.startsWith('https://') ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <>{children}</>
  );

export function Andamento({ voltar }: Props) {
  const celular = useTelaDeCelular();
  const [dados, setDados] = useState<AndamentoDoProjeto | null>(null);
  const [falha, setFalha] = useState('');
  const [lendo, setLendo] = useState(false);
  // o "lido há N min" anda sozinho
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const carregar = useCallback((deNovo = false) => {
    setFalha('');
    setLendo(true);
    lerAndamentoDoProjeto(deNovo)
      .then((d) => {
        setDados(d);
        setAgora(Date.now());
      })
      .catch((e) => setFalha(e instanceof Error ? e.message : String(e)))
      .finally(() => setLendo(false));
  }, []);
  useEffect(() => carregar(), [carregar]);

  const a = dados?.andamento ?? null;
  const onde = dados ? ondeEstamos(dados.etapas) : '';

  return (
    <div className={`pagina configuracao andamento ${celular ? 'no-celular' : ''}`}>
      <header className="cad-topo">
        <button className="voltar-cad" onClick={voltar}>
          <Icone nome="voltar" tam={16} /> Fila
        </button>
        <Marca />
        <span />
      </header>
      <main className="cfg">
        <div className="cfg-cabeca">
          <h1>Andamento</h1>
          <span className="cfg-so-admin">
            <Icone nome="cadeado" tam={13} /> administradores
          </span>
        </div>
        {falha ? (
          <p className="cfg-falha" role="alert">
            {falha}{' '}
            <button className="botao-texto" onClick={() => carregar()}>
              Tentar de novo
            </button>
          </p>
        ) : !dados ? (
          <p className="cfg-lendo">Lendo o GitHub…</p>
        ) : (
          <>
            <div className="and-lido">
              <span>{dados.lidoEm ? <>Lido do GitHub {lidoHa(dados.lidoEm, agora)}</> : 'Nenhuma leitura do GitHub ainda'}</span>
              {!dados.falta.length && (
                <button type="button" className="botao and-ler" onClick={() => carregar(true)} disabled={lendo}>
                  <Icone nome="historico" tam={13} /> {lendo ? 'Lendo…' : 'Ler de novo'}
                </button>
              )}
            </div>
            {dados.falta.length > 0 && (
              <p className="and-aviso" role="status">
                <Icone nome="cadeado" tam={14} />
                <span>
                  Para ler ao vivo, falta no Portainer: {dados.falta.map((n, i) => (
                    <span key={n}>
                      {i > 0 && ' e '}
                      <code>{n}</code>
                    </span>
                  ))}
                  {dados.falta.includes('GITHUB_TOKEN') && ' (um token fine-grained do GitHub, só leitura de Issues e Contents do repositório)'}
                  {dados.falta.includes('GITHUB_REPO') && ' (o repositório, dono/nome)'}.{' '}
                  {a ? 'Até lá, vale a última leitura guardada.' : 'Ainda não há nenhuma leitura guardada.'}
                </span>
              </p>
            )}
            {dados.foraDoAr && (
              <p className="and-aviso fora" role="status">
                <Icone nome="atencao" tam={14} traco={2.4} />
                <span>
                  O GitHub não responde desde {quando(dados.foraDoAr.desde)} ({dados.foraDoAr.motivo}). {a ? 'Vale a última leitura guardada.' : 'Ainda não há nenhuma leitura guardada.'}
                </span>
              </p>
            )}
            {a && (
              <p className="and-resumo">
                <b>{a.resumo.feitos}</b> de <b>{a.resumo.total}</b> tickets das frentes estão feitos.{onde && <> Na meta de longo prazo, estamos {onde}.</>}
              </p>
            )}
            <section className="cfg-secao and-secao" aria-labelledby="and-meta">
              <div className="cfg-secao-topo">
                <h2 id="and-meta">Meta de longo prazo</h2>
              </div>
              <p className="and-linha">O PROMeiro vira a ferramenta de gestão da arte, no lugar do Trello, do Teable e do n8n, por etapas e sem dia de virada (ADR 0006).</p>
              <Trilha etapas={dados.etapas} />
            </section>
            {a && (
              <>
                <section className="cfg-secao and-secao" aria-labelledby="and-frentes">
                  <div className="cfg-secao-topo">
                    <h2 id="and-frentes">Frentes</h2>
                  </div>
                  <p className="and-linha">Tickets feitos de cada spec. Feito é fechado no GitHub ou já pronto no código (um commit cita o ticket).</p>
                  <ul className="and-frentes">
                    {a.frentes.map((f) => (
                      <LinhaDaFrente key={f.spec} f={f} />
                    ))}
                  </ul>
                </section>
                <section className="cfg-secao and-secao" aria-labelledby="and-tickets">
                  <div className="cfg-secao-topo">
                    <h2 id="and-tickets">Tickets por frente</h2>
                  </div>
                  <div className="and-listas">
                    {a.frentes.map((f) => (
                      <details key={f.spec} open={f.situacao === 'em andamento'}>
                        <summary>
                          {f.nome} <small>· spec #{f.spec} · {f.feitos} de {f.total}</small>
                        </summary>
                        <Tickets tickets={f.tickets} />
                      </details>
                    ))}
                    {a.avulsos.length > 0 && (
                      <details open>
                        <summary>
                          Fora das specs <small>· {a.avulsos.length}</small>
                        </summary>
                        <Tickets tickets={a.avulsos} />
                      </details>
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Trilha({ etapas }: { etapas: Etapa[] }) {
  return (
    <ol className="and-trilha" aria-label="Etapas da meta de longo prazo">
      {etapas.map((e) => (
        <li key={e.ordem} className="and-etapa" data-sit={e.situacao} aria-current={e.situacao === 'próxima' ? 'step' : undefined}>
          <span className="and-ponto" aria-hidden="true" />
          <small>{e.situacao === 'depois' ? 'Depois' : `Etapa ${e.ordem}`}</small>
          <strong>{e.etapa}</strong>
          <span className="and-etapa-resumo">{e.resumo}</span>
          <span className="and-selo">{e.situacao}</span>
          {e.nota && <span className="and-etapa-resumo and-nota">{e.nota}</span>}
        </li>
      ))}
    </ol>
  );
}

function LinhaDaFrente({ f }: { f: Frente }) {
  const pct = f.total ? Math.round((f.feitos / f.total) * 100) : 0;
  const proximo = f.proximo;
  return (
    <li className="and-frente" data-sit={f.situacao}>
      <div className="and-frente-topo">
        <span className="and-frente-nome">
          {f.nome} <Link url={f.url}>{`#${f.spec}`}</Link>
        </span>
        <span className="and-conta">
          <b>{f.feitos}</b> de {f.total} feitos
        </span>
      </div>
      <div className="and-barra" role="img" aria-label={`${f.nome}: ${f.feitos} de ${f.total} tickets feitos`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="and-agora">
        {f.situacao === 'concluída' ? (
          f.specFechada ? 'Concluída; spec fechada.' : 'Todos os tickets feitos.'
        ) : !proximo ? (
          'Sem tickets ainda.'
        ) : (
          <>
            {f.situacao === 'planejada' ? 'Planejada; começa por ' : 'Próximo: '}
            <Link url={proximo.url}>{`#${proximo.numero}`}</Link> {tituloCurto(proximo.titulo)}
          </>
        )}
      </div>
    </li>
  );
}

function Tickets({ tickets }: { tickets: TicketDoAndamento[] }) {
  if (!tickets.length) return <p className="and-linha and-vazio">Sem tickets ainda.</p>;
  return (
    <table className="and-tabela">
      <thead>
        <tr>
          <th>#</th>
          <th>Ticket</th>
          <th>Situação</th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((t) => (
          <tr key={t.numero} data-numero={t.numero}>
            <td className="and-num">
              <Link url={t.url}>{`#${t.numero}`}</Link>
            </td>
            <td>{tituloCurto(t.titulo)}</td>
            <td>
              <span className="and-sit" data-sit={t.situacao}>
                {t.situacao}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
