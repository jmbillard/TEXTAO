import { useCallback, useEffect, useMemo, useState } from 'react';
import { armazenamento, consultarProducao, ligarAoCardExistente, pdfDaProducao, pdfDoRoteiro } from '../dados/armazenamento';
import { diferencasDeArtes, diferencasDeTexto, mesmaPessoa, semelhanca, type ArteComparada } from '../modelo/diferencas';
import { exportar } from '../modelo/exportar';
import type { ProducaoCompleta, Roteiro } from '../modelo/tipos';
import { Icone } from './icones';
import { Marca } from './pecas';
import { dataCurtaComDia } from './util';
import { VisorPdf } from './VisorPdf';

interface Props {
  id: string;
  voltar: () => void;
  /** Depois de "é outro" ou "é v2": segue para a revisão de sempre. */
  revisar: (id: string) => void;
  avisar: (texto: string) => void;
}

type Resposta = 'v2' | 'mesmo' | 'outro';
const OPCOES: { id: Resposta; nome: string; dica: string }[] = [
  { id: 'v2', nome: 'Atualizar o card', dica: 'Ao mandar, o card que já existe ganha as artes novas e este roteiro' },
  { id: 'outro', nome: 'Novo card', dica: 'Ao mandar, vira um card novo' },
  { id: 'mesmo', nome: 'Ignorar', dica: 'Não manda nada: liga ao card que já existe e volta para a fila' },
];

const diaDe = (iso: string | null) => (iso ? dataCurtaComDia(new Date(iso).toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' })) : '');

/** O roteiro que chegou ao lado do que já está na produção da arte, com as diferenças marcadas. A decisão vem antes da revisão. */
export function Comparar({ id, voltar, revisar, avisar }: Props) {
  const [roteiro, setRoteiro] = useState<Roteiro | null | undefined>(undefined);
  const [producao, setProducao] = useState<ProducaoCompleta | null | undefined>(undefined);
  const [decidindo, setDecidindo] = useState(false);
  const [escolha, setEscolha] = useState<Resposta | null>(null);

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
    const outroRedator = !mesmaPessoa(producao.redator, roteiro.meta.redator);
    const outroEditor = !mesmaPessoa(producao.editor, roteiro.meta.editor);
    return { texto, artes, novas, sairam, igual, outroRedator, outroEditor, mesmo: igual === 1 && !novas && !sairam };
  }, [roteiro, producao]);

  // as duas folhas: o PDF que está no card e o do roteiro novo, como vai para o Trello
  const claquete = roteiro?.meta.claquete ?? '';
  const pdfAntigo = useCallback(() => pdfDaProducao(claquete), [claquete]);
  const pdfNovo = useCallback(() => (roteiro ? pdfDoRoteiro(roteiro) : Promise.resolve(null)), [roteiro?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // o card que o roteiro aponta (guardado na chegada) vale mesmo se o Teable não responder agora
  const np = producao ?? roteiro?.meta.naProducao ?? null;

  // sem escolha da pessoa: atualizar o card, ou ignorar quando os dois são iguais
  const opcao: Resposta = escolha ?? (comparacao?.mesmo ? 'mesmo' : 'v2');

  const decidir = async (resposta: Resposta) => {
    if (!roteiro || !np || decidindo) return;
    setDecidindo(true);
    const meta = { ...roteiro.meta, naProducao: undefined };
    if (resposta === 'v2') meta.v2De = { card: np.card, url: np.url, registro: np.registro };
    if (resposta === 'outro') meta.outroRoteiro = true;
    try {
      await armazenamento.salvar({ ...roteiro, meta }, resposta === 'v2' ? 'é v2 de um card que já estava na produção' : resposta === 'outro' ? 'é outro roteiro, não o da produção' : undefined);
      if (resposta === 'mesmo') {
        await ligarAoCardExistente(roteiro.id, np.card);
        avisar('Ignorado: ficou ligado ao card que já estava no Trello.');
        return voltar();
      }
      avisar(resposta === 'v2' ? 'Ao mandar, o card que já existe recebe as artes novas e este roteiro.' : 'Vai como um card novo.');
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
            <div className="comparar-decisao">
              {/* o seletor muda o que o botão faz: a revisão segue como se a claquete não fosse repetida */}
              <div className="segmento" role="radiogroup" aria-label="O que fazer com o card">
                {OPCOES.map((o) => (
                  <button key={o.id} role="radio" aria-checked={opcao === o.id} title={o.dica} onClick={() => setEscolha(o.id)}>
                    {o.nome}
                  </button>
                ))}
              </div>
              <button className="botao primario" disabled={decidindo || !np} onClick={() => void decidir(opcao)}>
                {opcao === 'mesmo' ? 'Voltar para a fila' : 'Revisar'}
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
                gente={producao && <Gente redator={producao.redator} editor={producao.editor} riscar={{ redator: !!comparacao?.outroRedator, editor: !!comparacao?.outroEditor }} />}
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
                gente={<Gente redator={roteiro.meta.redator} editor={roteiro.meta.editor} destacar={{ redator: !!comparacao?.outroRedator, editor: !!comparacao?.outroEditor }} />}
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
              {comparacao.outroRedator && <span><b>outro</b> redator</span>}
              {comparacao.outroEditor && <span><b>outra</b> edição</span>}
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

/** Um risco à mão por cima: o que saiu (ou foi trocado) no roteiro novo. */
function Riscado({ children }: { children: React.ReactNode }) {
  return (
    <span className="riscado-mao">
      {children}
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M1 6.5 C 18 4, 40 7.5, 62 5 S 88 3.5, 99 5.5" /></svg>
    </span>
  );
}

/** Redator e edição de cada lado; quem foi trocado aparece riscado no antigo e marcado no novo. */
function Gente({ redator, editor, riscar, destacar }: { redator?: string; editor?: string; riscar?: { redator: boolean; editor: boolean }; destacar?: { redator: boolean; editor: boolean } }) {
  const nome = (n: string | undefined, r?: boolean, d?: boolean) =>
    !n ? <span className="suave">—</span> : r ? <Riscado>{n}</Riscado> : <span className={d ? 'trocado' : ''}>{n}</span>;
  return (
    <p className="comparar-gente">
      <span>redator: {nome(redator, riscar?.redator, destacar?.redator)}</span>
      <span>edição: {nome(editor, riscar?.editor, destacar?.editor)}</span>
    </p>
  );
}

function Lado({ titulo, gente, rotulo, artes, folha }: { titulo: React.ReactNode; gente?: React.ReactNode; rotulo: string; artes?: ArteComparada[]; folha: React.ReactNode }) {
  const mudou = (artes ?? []).map((a, i) => ({ ...a, n: i + 1 })).filter((a) => a.tipo !== 'igual');
  return (
    <section className="comparar-lado" aria-label={rotulo}>
      <span className="comparar-rotulo">{rotulo}</span>
      <div className="comparar-titulo">
        {titulo}
        {gente}
      </div>
      {/* só o que mudou, com o número que a arte tem no roteiro; a lista existe mesmo vazia, para as colunas
          se alinharem por linha e as folhas começarem na mesma altura */}
      {(
        <ol className={`comparar-artes ${mudou.length ? '' : 'vazia'}`}>
          {mudou.map((a) => (
            <li key={a.n} data-n={a.n} className={a.tipo} title={a.tipo === 'entrou' ? 'Arte nova' : a.tipo === 'saiu' ? 'Saiu no roteiro novo' : undefined}>
              {a.tipo === 'saiu' ? <Riscado>{a.texto}</Riscado> : a.texto}
            </li>
          ))}
        </ol>
      )}
      {folha}
    </section>
  );
}
