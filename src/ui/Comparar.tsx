import { useEffect, useMemo, useState } from 'react';
import { armazenamento, consultarProducao, ligarAoCardExistente } from '../dados/armazenamento';
import { diferencasDeArtes, diferencasDeTexto, semelhanca, type ArteComparada, type Trecho } from '../modelo/diferencas';
import { exportar } from '../modelo/exportar';
import type { ProducaoCompleta, Roteiro } from '../modelo/tipos';
import { Icone } from './icones';
import { Marca } from './pecas';
import { dataCurtaComDia, plural } from './util';

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
            <h1>É o mesmo roteiro?</h1>
            <p className="comparar-resumo">
              {comparacao ? (
                <>
                  <b>{Math.round(comparacao.igual * 100)}%</b> do texto igual
                  {' · '}
                  {comparacao.novas ? <span className="entrou">{plural(comparacao.novas, 'arte nova', 'artes novas')}</span> : 'nenhuma arte nova'}
                  {comparacao.sairam > 0 && <> · <span className="saiu">{plural(comparacao.sairam, 'arte saiu', 'artes saíram')}</span></>}
                  {comparacao.mesmo && <span className="parece">parece o mesmo</span>}
                </>
              ) : producao === undefined ? (
                'Buscando o que já está na produção da arte…'
              ) : (
                'Não consegui ler o que está na produção da arte agora. Dá para decidir pelo card.'
              )}
            </p>

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
                texto={comparacao?.texto.filter((t) => t.tipo !== 'entrou').map((t) => ({ ...t, texto: t.antigo ?? t.texto }))}
                vazio={producao === null ? 'O texto de lá não veio.' : undefined}
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
                texto={comparacao?.texto.filter((t) => t.tipo !== 'saiu') ?? [{ tipo: 'igual', texto: exportar(roteiro).texto.completo }]}
              />
            </div>

            <div className="comparar-decisao" role="group" aria-label="Decisão">
              <button className={`decisao ${comparacao?.mesmo ? 'primaria' : ''}`} disabled={decidindo || !np} onClick={() => void decidir('mesmo')}>
                <strong>É o mesmo</strong>
                <small>não manda nada e sai da revisão</small>
              </button>
              <button className="decisao" disabled={decidindo || !np} onClick={() => void decidir('outro')}>
                <strong>É outro</strong>
                <small>vira um card novo</small>
              </button>
              <button className={`decisao ${comparacao?.mesmo ? '' : 'primaria'}`} disabled={decidindo || !np} onClick={() => void decidir('v2')}>
                <strong>É v2</strong>
                <small>{comparacao?.novas ? `o card ganha ${plural(comparacao.novas, 'arte nova', 'artes novas')} e este roteiro` : 'o card ganha este roteiro anexado'}</small>
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Lado({ titulo, rotulo, artes, texto, vazio }: { titulo: React.ReactNode; rotulo: string; artes?: ArteComparada[]; texto?: Trecho[]; vazio?: string }) {
  return (
    <section className="comparar-lado" aria-label={rotulo}>
      <span className="comparar-rotulo">{rotulo}</span>
      <div className="comparar-titulo">{titulo}</div>
      {artes && (
        <ol className="comparar-artes">
          {artes.map((a, i) => (
            <li key={i} className={a.tipo}>
              {a.texto}
              {a.tipo !== 'igual' && <small>{a.tipo === 'entrou' ? 'nova' : 'saiu'}</small>}
            </li>
          ))}
        </ol>
      )}
      <div className="comparar-texto">
        {vazio ? <p className="suave">{vazio}</p> : texto ? texto.map((t, i) => (t.tipo === 'igual' ? <span key={i}>{t.texto}</span> : <mark key={i} className={t.tipo}>{t.texto}</mark>)) : <p className="suave">…</p>}
      </div>
    </section>
  );
}
