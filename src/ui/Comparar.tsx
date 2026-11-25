import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { armazenamento, consultarProducao, ligarAoCardExistente, pdfDaProducao, pdfDoRoteiro, roteiroDa, versaoNova } from '../dados/armazenamento';
import { casoDaLeitura, LinkQuebrado, type CasoQuebrado } from './LinkQuebrado';
import { diferencasDeArtes, diferencasDeTexto, mesmaPessoa, semelhanca, type ArteComparada } from '../modelo/diferencas';
import { exportar, pendencias } from '../modelo/exportar';
import type { ProducaoCompleta, Roteiro } from '../modelo/tipos';
import { Icone } from './icones';
import { useCamadaDeRiscos } from './riscos';
import { dataCurtaComDia, plural } from './util';
import { VisorPdf } from './VisorPdf';
import { ehDocx, VisorOriginal } from './VisorOriginal';

interface Props {
  id: string;
  voltar: () => void;
  /** Depois da decisão (menos "Ignorar"): segue para a revisão de sempre do roteiro que ficou. */
  revisar: (id: string) => void;
  avisar: (texto: string) => void;
  /** O link quebrado com a lápide: a fila abre buscando a claquete. */
  buscar?: (termo: string) => void;
}

/* O lado de lá da comparação: o que já está na produção da arte (a claquete já tem card no Trello) ou, quando o
   roteiro é a versão nova de outro que ainda está na fila, a versão anterior. */
type Resposta = 'v2' | 'mesmo' | 'outro' | 'substituir' | 'manter';
type Opcao = { id: Resposta; nome: string; dica: string };
const OPCOES_PRODUCAO: Opcao[] = [
  { id: 'v2', nome: 'Atualizar o card', dica: 'Ao mandar, o card que já existe ganha as artes novas e este roteiro' },
  { id: 'outro', nome: 'Novo card', dica: 'Ao mandar, vira um card novo' },
  { id: 'mesmo', nome: 'Ignorar', dica: 'Não manda nada: liga ao card que já existe e volta para a fila' },
];
const OPCOES_FILA: Opcao[] = [
  { id: 'manter', nome: 'Manter as duas', dica: 'As duas versões ficam na fila' },
  { id: 'substituir', nome: 'Substituir a anterior', dica: 'Fica a nova, com os tipos de arte, o editor e as marcas da anterior' },
];

/** O que a comparação precisa do lado de lá, venha da produção da arte ou da versão anterior. */
type LadoDeLa = { texto: string; artes: string[]; redator?: string };
const ladoDoRoteiro = (r: Roteiro): LadoDeLa => {
  const s = exportar(r);
  return { texto: s.texto.completo, artes: s.artes.map((a) => a.texto), redator: r.meta.redator };
};

/** O aviso depois de "Substituir a anterior", na comparação e no aviso da ficha (no celular). */
export const avisoDaSubstituicao = ({ herdadas, cardHerdado }: { herdadas: number; cardHerdado: boolean }) =>
  `Versão anterior substituída.${herdadas ? ` ${plural(herdadas, 'tipo de arte foi mantido', 'tipos de arte foram mantidos')}.` : ''}${cardHerdado ? ' O card no Trello continua o da versão anterior.' : ''}`;

const diaDe = (iso: string | null) => (iso ? dataCurtaComDia(new Date(iso).toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' })) : '');

/** O roteiro que chegou ao lado do que já está na produção da arte, ou da versão anterior que está na fila, com as
 *  diferenças marcadas. A decisão vem antes da revisão. */
export function Comparar({ id, voltar, revisar, avisar, buscar }: Props) {
  const [roteiro, setRoteiro] = useState<Roteiro | null | undefined>(undefined);
  // o link não abriu: por quê (apagado, sem permissão, não existe, a rede)
  const [falha, setFalha] = useState<CasoQuebrado | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [producao, setProducao] = useState<ProducaoCompleta | null | undefined>(undefined);
  const [anterior, setAnterior] = useState<Roteiro | null | undefined>(undefined);
  const [decidindo, setDecidindo] = useState(false);
  const [escolha, setEscolha] = useState<Resposta | null>(null);

  // por cima da fila: a página de trás não rola, e Esc fecha
  useEffect(() => {
    const raiz = document.documentElement;
    const antes = raiz.style.overflow;
    raiz.style.overflow = 'hidden';
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && voltar();
    window.addEventListener('keydown', tecla);
    return () => {
      raiz.style.overflow = antes;
      window.removeEventListener('keydown', tecla);
    };
  }, [voltar]);

  useEffect(() => {
    let vivo = true;
    void armazenamento.ler(id).then(async (l) => {
      if (!vivo) return;
      const r = roteiroDa(l);
      setFalha(l.estado === 'ok' ? null : casoDaLeitura(l));
      setRoteiro(r ?? null);
      if (r?.meta.substitui) {
        const a = roteiroDa(await armazenamento.ler(r.meta.substitui));
        if (vivo) setAnterior(a ?? null);
        return;
      }
      const p = r ? await consultarProducao(r.meta.claquete) : null;
      if (vivo) setProducao(p);
    });
    return () => {
      vivo = false;
    };
  }, [id, tentativa]);

  const daFila = !!roteiro?.meta.substitui;
  const ladoDeLa = useMemo<LadoDeLa | null>(
    () => (daFila ? (anterior ? ladoDoRoteiro(anterior) : null) : producao ? { texto: producao.texto, artes: producao.listaDeArtes, redator: producao.redator } : null),
    [daFila, anterior, producao],
  );

  const comparacao = useMemo(() => {
    if (!roteiro || !ladoDeLa) return null;
    const s = exportar(roteiro);
    const texto = diferencasDeTexto(ladoDeLa.texto, s.texto.completo);
    const artes = diferencasDeArtes(ladoDeLa.artes, s.artes.map((a) => a.texto));
    const novas = artes.novas.filter((a) => a.tipo === 'entrou').length;
    const sairam = artes.antigas.filter((a) => a.tipo === 'saiu').length;
    const igual = semelhanca(texto);
    const outroRedator = !mesmaPessoa(ladoDeLa.redator, roteiro.meta.redator);
    return { texto, artes, novas, sairam, igual, outroRedator, mesmo: igual === 1 && !novas && !sairam };
  }, [roteiro, ladoDeLa]);

  // as duas folhas: o PDF que está no card (ou o da versão anterior) e o do roteiro novo, como vai para o Trello
  const claquete = roteiro?.meta.claquete ?? '';
  const pdfAntigo = useCallback(() => (daFila ? (anterior ? pdfDoRoteiro(anterior) : Promise.resolve(null)) : pdfDaProducao(claquete)), [daFila, anterior?.id, claquete]); // eslint-disable-line react-hooks/exhaustive-deps
  const pdfNovo = useCallback(() => (roteiro ? pdfDoRoteiro(roteiro) : Promise.resolve(null)), [roteiro?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // o card que o roteiro aponta (guardado na chegada) vale mesmo se o Teable não responder agora
  const np = producao ?? roteiro?.meta.naProducao ?? null;

  // sem escolha da pessoa: substituir a versão anterior; atualizar o card, ou ignorar quando os dois são iguais
  const opcoes = daFila ? OPCOES_FILA : OPCOES_PRODUCAO;
  const opcao: Resposta = escolha ?? (daFila ? 'substituir' : comparacao?.mesmo ? 'mesmo' : 'v2');

  // versão nova da fila: as duas saídas do aviso da ficha, e depois a revisão da que ficou
  const decidirNaFila = async (resposta: Resposta) => {
    if (!roteiro || decidindo) return;
    setDecidindo(true);
    try {
      if (resposta === 'substituir') {
        const feito = await versaoNova.substituir(roteiro.id);
        // a nova saiu da fila enquanto a pessoa decidia: não há o que revisar
        if (!feito) return voltar();
        avisar(avisoDaSubstituicao(feito));
      } else {
        if (!(await versaoNova.manter(roteiro.id))) return voltar();
        avisar('As duas versões ficam na fila.');
      }
      revisar(roteiro.id);
    } catch {
      avisar(resposta === 'substituir' ? 'Não consegui substituir a versão anterior.' : 'Não consegui guardar a resposta.');
      setDecidindo(false);
    }
  };

  const decidir = async (resposta: Resposta) => {
    if (daFila) return decidirNaFila(resposta);
    if (!roteiro || !np || decidindo) return;
    setDecidindo(true);
    const meta = { ...roteiro.meta, naProducao: undefined };
    if (resposta === 'v2') meta.v2De = { card: np.card, url: np.url, registro: np.registro };
    if (resposta === 'outro') meta.outroRoteiro = true;
    // v2 e card novo ficam marcados como pendência, como as outras
    meta.revisar = pendencias(exportar({ ...roteiro, meta }));
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
    <div className="comparar lightbox" role="dialog" aria-modal="true" aria-label={daFila ? 'Comparar com a versão anterior da fila' : 'Comparar com o que já está no Trello'}>
      <header className="cad-topo">
        <button className="voltar-cad" onClick={voltar}>
          <Icone nome="voltar" tam={16} /> Fila
        </button>
        <span />
        <span />
      </header>
      <main className="comparar-corpo">
        {roteiro === null && falha && <LinkQuebrado caso={falha} voltar={voltar} buscar={buscar} abrir={revisar} tentar={() => setTentativa((n) => n + 1)} />}
        {roteiro && (
          <>
            <div className="comparar-cabeca">
            <div>
            <h1>{daFila ? 'Versão nova do roteiro' : 'É o mesmo roteiro?'}</h1>
            </div>
            <div className="comparar-decisao">
              {/* o seletor muda o que o botão faz: a revisão segue como se a claquete não fosse repetida */}
              <div className="segmento" role="radiogroup" aria-label={daFila ? 'O que fazer com a versão anterior' : 'O que fazer com o card'}>
                {opcoes.map((o) => (
                  <button key={o.id} role="radio" aria-checked={opcao === o.id} title={o.dica} onClick={() => setEscolha(o.id)}>
                    {o.nome}
                  </button>
                ))}
              </div>
              <button className="botao primario" disabled={decidindo || (!daFila && !np)} onClick={() => void decidir(opcao)}>
                {opcao === 'mesmo' ? 'Voltar para a fila' : 'Revisar'}
              </button>
            </div>
            </div>

            <div className="comparar-grade">
              {daFila ? (
                <Lado
                  titulo={
                    <span className="card-existente">
                      <Icone nome="arquivo" tam={15} />
                      <b>{anterior?.meta.claquete || 'Versão anterior'}</b>
                      {anterior && <small>chegou {diaDe(anterior.criadoEm)}</small>}
                    </span>
                  }
                  rotulo="versão anterior"
                  gente={anterior && <Gente redator={anterior.meta.redator} />}
                  artes={comparacao?.artes.antigas}
                  folha={anterior && <FolhaDoRoteiro r={anterior} pdf={pdfAntigo} rotulo="Versão anterior" anotacao="anterior" />}
                />
              ) : (
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
                gente={producao && <Gente redator={producao.redator} />}
                artes={comparacao?.artes.antigas}
                folha={roteiro && <VisorPdf carregar={pdfAntigo} rotulo="Roteiro no Trello" anotacao="no Trello" reserva={producao?.texto ? <div className="comparar-texto">{producao.texto}</div> : undefined} />}
              />
              )}
              <Lado
                titulo={
                  <span className="card-existente novo">
                    <Icone nome="arquivo" tam={15} />
                    <b>{roteiro.meta.claquete}</b>
                    <small>chegou {diaDe(roteiro.criadoEm)}</small>
                  </span>
                }
                rotulo="chegou agora"
                gente={<Gente redator={roteiro.meta.redator} destacar={!!comparacao?.outroRedator} />}
                artes={comparacao?.artes.novas ?? exportar(roteiro).artes.map((a) => ({ texto: a.texto, tipo: 'igual' as const }))}
                folha={<FolhaDoRoteiro r={roteiro} pdf={pdfNovo} rotulo="Roteiro novo" anotacao="novo" lado="direita" />}
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
              {comparacao.mesmo && <span className="parece">parece o mesmo</span>}
            </>
          ) : (
            <span>
              {daFila
                ? anterior === undefined ? 'abrindo a versão anterior…' : 'a versão anterior já saiu da fila'
                : producao === undefined ? 'buscando o que já está na produção da arte…' : 'não consegui ler o que está na produção da arte'}
            </span>
          )}
        </footer>
      )}
    </div>
  );
}

/** A folha de um roteiro da fila: o Word abre aqui mesmo, como o Word mostra (sem converter no servidor); o resto, no PDF
 *  como vai para o Trello. Sem os dois, o texto. */
function FolhaDoRoteiro({ r, pdf, rotulo, anotacao, lado }: { r: Roteiro; pdf: () => Promise<ArrayBuffer | null>; rotulo: string; anotacao: string; lado?: 'direita' }) {
  const reserva = <div className="comparar-texto">{exportar(r).texto.completo}</div>;
  return ehDocx(r.original?.nome) ? (
    <VisorOriginal id={r.id} nome={r.original?.nome} artes={[]} anotacao={anotacao} lado={lado} circular={!!lado} reserva={reserva} />
  ) : (
    <VisorPdf carregar={pdf} rotulo={rotulo} anotacao={anotacao} lado={lado} circular={!!lado} reserva={reserva} />
  );
}

/** Um risco à mão por cima: o que saiu (ou foi trocado) no roteiro novo, e a arte "já existe" na lista. O texto fica
 *  em linha e o risco atravessa cada linha no meio das letras (`riscos.ts`); com `desde` (o instante da marca), as
 *  linhas se escrevem uma depois da outra. */
export function Riscado({ children, semente = 0, desde }: { children: React.ReactNode; semente?: number; desde?: number }) {
  const texto = useRef<HTMLSpanElement>(null);
  const camada = useRef<SVGSVGElement>(null);
  useCamadaDeRiscos(camada, () => (texto.current ? [{ elementos: [texto.current], semente, desde }] : []), `${semente}|${desde ?? ''}|${typeof children === 'string' ? children : ''}`);
  return (
    <span className="riscado-mao">
      <span ref={texto}>{children}</span>
      <svg ref={camada} className="camada-riscos" aria-hidden="true" />
    </span>
  );
}

/** O redator de cada lado; quando é outra pessoa, o novo ganha destaque. */
function Gente({ redator, destacar }: { redator?: string; destacar?: boolean }) {
  return (
    <p className="comparar-gente">
      <span>redator: {redator ? <span className={destacar ? 'trocado' : ''}>{redator}</span> : <span className="suave">—</span>}</span>
    </p>
  );
}

function Lado({ titulo, gente, rotulo, artes, folha }: { titulo: React.ReactNode; gente?: React.ReactNode; rotulo: string; artes?: ArteComparada[]; folha: React.ReactNode }) {
  const mudou = (artes ?? []).map((a, i) => ({ ...a, n: i + 1 })).filter((a) => a.tipo !== 'igual');
  return (
    <section className="comparar-lado" aria-label={rotulo}>
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
