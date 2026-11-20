import { useCallback, useEffect, useMemo, useState } from 'react';
import { armazenamento, consultarProducao, ligarAoCardExistente, pdfDaProducao, pdfDoRoteiro } from '../dados/armazenamento';
import { diferencasDeArtes, diferencasDeTexto, semelhanca, type ArteComparada } from '../modelo/diferencas';
import { exportar } from '../modelo/exportar';
import type { ProducaoCompleta, Roteiro } from '../modelo/tipos';
import { Icone } from './icones';
import { Marca } from './pecas';
import { dataCurtaComDia, plural } from './util';
import { VisorPdf } from './VisorPdf';

interface Props {
  id: string;
  voltar: () => void;
  /** Depois de "é outro" ou "é v2": segue para a revisão de sempre. */
  revisar: (id: string) => void;
  avisar: (texto: string) => void;
}

const diaDe = (iso: string | null) => (iso ? dataCurtaComDia(new Date(iso).toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' })) : '');

/** O roteiro que chegou ao lado do que já está na produção da arte, com as diferenças marcadas. A decisão vem antes da revisão. */
export function Comparar({ id, voltar, revisar, avisar }: Props) {
  const [roteiro, setRoteiro] = useState<Roteiro | null | undefined>(undefined);
  const [producao, setProducao] = useState<ProducaoCompleta | null | undefined>(undefined);
  const [decidindo, setDecidindo] = useState(false);

  useEffect(() => {
    let vivo = true;
    void armazenamento.ler(id).then(async (r) => {
      if (!vivo) return;
      setRoteiro(r ?? null);
      const p = r ? await consultarProducao(r.meta.claquete) : null;
      if (vivo) setProducao(p);
    }, () => vivo && setRoteiro(null));
    return () => {
      vivo = false;
    };
  }, [id]);

  const comparacao = useMemo(() => {
    if (!roteiro || !producao) return null;
    const s = exportar(roteiro);
    const texto = diferencasDeTexto(producao.texto, s.texto.completo);
    const artes = diferencasDeArtes(producao.listaDeArtes, s.artes.map((a) => a.texto));
    const novas = artes.novas.filter((a) => a.tipo === 'entrou').length;
    const sairam = artes.antigas.filter((a) => a.tipo === 'saiu').length;
    const igual = semelhanca(texto);
    return { texto, artes, novas, sairam, igual, mesmo: igual === 1 && !novas && !sairam };
  }, [roteiro, producao]);

  // as duas folhas: o PDF que está no card e o do roteiro novo, como vai para o Trello
  const claquete = roteiro?.meta.claquete ?? '';
  const pdfAntigo = useCallback(() => pdfDaProducao(claquete), [claquete]);
  const pdfNovo = useCallback(() => (roteiro ? pdfDoRoteiro(roteiro) : Promise.resolve(null)), [roteiro?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // o card que o roteiro aponta (guardado na chegada) vale mesmo se o Teable não responder agora
  const np = producao ?? roteiro?.meta.naProducao ?? null;

  const decidir = async (resposta: 'v2' | 'mesmo' | 'outro') => {
    if (!roteiro || !np || decidindo) return;
    setDecidindo(true);
    const meta = { ...roteiro.meta, naProducao: undefined };
    if (resposta === 'v2') meta.v2De = { card: np.card, url: np.url, registro: np.registro };
    if (resposta === 'outro') meta.outroRoteiro = true;
    try {
      await armazenamento.salvar({ ...roteiro, meta }, resposta === 'v2' ? 'é v2 de um card que já estava na produção' : resposta === 'outro' ? 'é outro roteiro, não o da produção' : undefined);
      if (resposta === 'mesmo') {
        await ligarAoCardExistente(roteiro.id, np.card);
        avisar('É o mesmo: ficou ligado ao card que já estava no Trello.');
        return voltar();
      }
      avisar(resposta === 'v2' ? 'Versão nova: ao mandar, o card antigo recebe as artes novas e este roteiro.' : 'Outro roteiro: vai como card novo.');
      revisar(roteiro.id);
    } catch {
      avisar('Não consegui guardar a resposta.');
      setDecidindo(false);
    }
  };

  return (
    <div className="pagina comparar">
      <header className="cad-topo">
        <button className="voltar-cad" onClick={voltar}>
          <Icone nome="voltar" tam={16} /> Fila
        </button>
        <Marca />
        <span />
      </header>
      <main className="comparar-corpo">
        {roteiro === null && <p className="cad-falha">Esse roteiro não está mais na fila.</p>}
        {roteiro && (
          <>
            <div className="comparar-cabeca">
            <div>
            <h1>É o mesmo roteiro?</h1>
            </div>
            <div className="comparar-decisao" role="group" aria-label="Decisão">
              <button className={`botao ${comparacao?.mesmo ? 'primario' : ''}`} disabled={decidindo || !np} onClick={() => void decidir('mesmo')} title="Não manda nada: liga ao card que já existe e sai da revisão">
                É o mesmo
              </button>
              <button className="botao" disabled={decidindo || !np} onClick={() => void decidir('outro')} title="Segue para a revisão e vira um card novo">
                É outro
              </button>
              <button className={`botao ${comparacao?.mesmo ? '' : 'primario'}`} disabled={decidindo || !np} onClick={() => void decidir('v2')} title={comparacao?.novas ? `Segue para a revisão; o card ganha ${plural(comparacao.novas, 'arte nova', 'artes novas')} e este roteiro` : 'Segue para a revisão; o card ganha este roteiro anexado'}>
                É v2
              </button>
            </div>
            </div>

            <div className="comparar-grade">
              <Lado
                titulo={
                  np ? (
                    <a className="card-existente" href={np.url} target="_blank" rel="noreferrer">
                      <Icone nome="quadro" tam={15} traco={2.2} />
                      <b>{np.claquete}</b>
                      {np.entrada && <small>{diaDe(np.entrada)}</small>}
                    </a>
                  ) : (
                    'No Trello'
                  )
                }
                rotulo="no Trello"
                artes={comparacao?.artes.antigas}
                folha={roteiro && <VisorPdf carregar={pdfAntigo} rotulo="Roteiro no Trello" reserva={producao?.texto ? <div className="comparar-texto">{producao.texto}</div> : undefined} />}
              />
              <Lado
                titulo={
                  <span className="card-existente novo">
                    <Icone nome="arquivo" tam={15} />
                    <b>{roteiro.meta.claquete}</b>
                    <small>chegou {diaDe(roteiro.criadoEm)}</small>
                  </span>
                }
                rotulo="chegou agora"
                artes={comparacao?.artes.novas ?? exportar(roteiro).artes.map((a) => ({ texto: a.texto, tipo: 'igual' as const }))}
                folha={<VisorPdf carregar={pdfNovo} rotulo="Roteiro novo" reserva={<div className="comparar-texto">{exportar(roteiro).texto.completo}</div>} />}
              />
            </div>

          </>
        )}
      </main>
      {roteiro && (
        <footer className="estatisticas" aria-label="Comparação">
          {comparacao ? (
            <>
              <span><b>{Math.round(comparacao.igual * 100)}%</b> do texto igual</span>
              <span><b>{comparacao.novas}</b> {comparacao.novas === 1 ? 'arte nova' : 'artes novas'}</span>
              <span><b>{comparacao.sairam}</b> {comparacao.sairam === 1 ? 'arte saiu' : 'artes saíram'}</span>
              {comparacao.mesmo && <span className="parece">parece o mesmo</span>}
            </>
          ) : (
            <span>{producao === undefined ? 'buscando o que já está na produção da arte…' : 'não consegui ler o que está na produção da arte'}</span>
          )}
        </footer>
      )}
    </div>
  );
}

function Lado({ titulo, rotulo, artes, folha }: { titulo: React.ReactNode; rotulo: string; artes?: ArteComparada[]; folha: React.ReactNode }) {
  return (
    <section className="comparar-lado" aria-label={rotulo}>
      <span className="comparar-rotulo">{rotulo}</span>
      <div className="comparar-titulo">{titulo}</div>
      {/* sempre presente (mesmo vazia): as duas colunas se alinham por linha, e as folhas começam na mesma altura */}
      {(
        <ol className={`comparar-artes ${artes?.length ? '' : 'vazia'}`}>
          {(artes ?? []).map((a, i) => (
            <li key={i} className={a.tipo} title={a.tipo === 'entrou' ? 'Arte nova' : a.tipo === 'saiu' ? 'Saiu no roteiro novo' : undefined}>
              {a.tipo === 'entrou' && <i className="asterisco" aria-hidden="true">*</i>}
              {a.tipo === 'saiu' ? (
                <span className="riscado-mao">
                  {a.texto}
                  <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M1 6.5 C 18 4, 40 7.5, 62 5 S 88 3.5, 99 5.5" /></svg>
                </span>
              ) : (
                a.texto
              )}
            </li>
          ))}
        </ol>
      )}
      {folha}
    </section>
  );
}
