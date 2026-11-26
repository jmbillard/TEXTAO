import { useCallback, useEffect, useRef, useState } from 'react';
import { abrirPrevia, listarPrevias, type PaginaDaPrevia, type PreviaNaLista } from '../dados/armazenamento';
import { corDe } from '../dados/colaboracao';
import {
  andamentoDaPrevia,
  paginasNaSubida,
  resumoDaSubida,
  subidaTerminada,
  type EstadoNaSubida,
  type PassoNoNavegador,
} from '../filmes/andamento';
import { LISTA_MS, Presentes, quandoSome, taoVendo } from './Filmes';
import { Icone } from './icones';

/* A entrada da aba Filmes no celular (até 600px, #80): as prévias empilhadas, cada uma com o andamento, e o
   "Subir prévia", que abre o seletor de PDF. A subida é a mesma do computador (a impressão do arquivo, uma página por
   vez, e o mesmo PDF de novo só sobe o que falta); aqui ela aparece na ficha da prévia, página por página, de
   "preparando" a "lida", com o aviso de quando já dá para fechar a aba. Tocar numa prévia abre a revisão. */

/** De quanto em quanto tempo a ficha da prévia que está sendo lida pergunta de novo pelas páginas. */
const PAGINAS_MS = 2500;

/** A subida desta tela: o nome do PDF, a prévia (depois que o servidor a cria ou acha) e o passo de cada página. */
interface Subida {
  nome: string;
  id?: string;
  passos: Partial<Record<number, PassoNoNavegador>>;
}

/** O quanto a miniatura da página enche em cada estado: no navegador ela vai enchendo; no servidor, cheia. */
const CHEIO: Record<EstadoNaSubida, number> = { falta: 0, esperando: 0, preparando: 0.35, subindo: 0.7, fila: 1, lendo: 1, lida: 1, erro: 1 };

const semPdf = (nome: string) => nome.replace(/\.pdf$/i, '');
const diaEMes = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
// ainda há leitura acontecendo no servidor: a ficha acompanha
const lendoNoServidor = (paginas: PaginaDaPrevia[]) => paginas.some((p) => p.estado === 'fila' || p.estado === 'lendo');

export function EntradaDoCelular({ abrir, avisar }: { abrir: (id: string) => void; avisar: (t: string) => void }) {
  const [previas, setPrevias] = useState<PreviaNaLista[] | null>(null);
  // as páginas de cada prévia (o andamento da ficha), abertas uma vez e de novo enquanto a leitura anda
  const [paginas, setPaginas] = useState<Record<string, PaginaDaPrevia[]>>({});
  const [subida, setSubida] = useState<Subida | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const listar = useCallback(() => listarPrevias().then(setPrevias), []);
  useEffect(() => {
    listar().catch((e: Error) => (setPrevias([]), avisar(e.message)));
    // quem está em cada prévia e os dias que faltam: a lista pergunta de novo de tempos em tempos, como no computador
    const t = setInterval(() => void listar().catch(() => {}), LISTA_MS);
    return () => clearInterval(t);
  }, [listar, avisar]);

  // uma abertura por prévia de cada vez; `depois` pede uma nova depois da que está em curso (que pode ter saído antes
  // da última página chegar ao servidor e voltar sem ela)
  const emCurso = useRef(new Map<string, Promise<void>>());
  const recarregar = useCallback((id: string, depois = false) => {
    const antes = emCurso.current.get(id);
    if (antes && !depois) return antes;
    const agora: Promise<void> = (antes ?? Promise.resolve())
      .then(() => abrirPrevia(id))
      .then(
        (p) => setPaginas((ps) => ({ ...ps, [id]: p.paginas })),
        () => {}, // a ficha fica sem o andamento; a próxima volta tenta de novo
      )
      .finally(() => {
        if (emCurso.current.get(id) === agora) emCurso.current.delete(id);
      });
    emCurso.current.set(id, agora);
    return agora;
  }, []);
  // a prévia que apareceu na lista: as páginas dela, uma vez
  useEffect(() => {
    for (const p of previas ?? []) if (!(p.id in paginas)) void recarregar(p.id);
  }, [previas, paginas, recarregar]);
  // a prévia que está sendo subida ou lida: de novo a cada pouco, até a leitura terminar
  const agora = useRef({ paginas, subida });
  agora.current = { paginas, subida };
  useEffect(() => {
    const t = setInterval(() => {
      const { paginas: ps, subida: s } = agora.current;
      for (const [id, pgs] of Object.entries(ps)) if (lendoNoServidor(pgs) || s?.id === id) void recarregar(id);
    }, PAGINAS_MS);
    return () => clearInterval(t);
  }, [recarregar]);

  const subir = async (arquivo?: File) => {
    if (!arquivo || subida) return;
    if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== 'application/pdf') return avisar('A prévia é um PDF.');
    let id: string | undefined;
    setSubida({ nome: arquivo.name, passos: {} });
    try {
      const { subirPrevia } = await import('../filmes/preparar');
      await subirPrevia(arquivo, undefined, (passo) => {
        if (passo.tipo === 'criada') {
          id = passo.id;
          setSubida((s) => s && { ...s, id: passo.id });
          void recarregar(passo.id);
          void listar().catch(() => {});
        } else setSubida((s) => s && { ...s, passos: { ...s.passos, [passo.numero]: passo.tipo } });
      });
    } catch (e) {
      avisar(`Não deu para subir a prévia: ${e instanceof Error ? e.message : e}`);
    }
    // o que chegou ao servidor segue lá; o que não chegou fica esperando o mesmo PDF de novo
    if (id) await recarregar(id, true);
    setSubida(null);
  };

  // a prévia sendo subida vai para o topo (a nova, que ainda não está na lista, também)
  const lista = previas ?? [];
  const daSubida = subida?.id ? lista.find((p) => p.id === subida.id) : undefined;
  const fichas = daSubida ? [daSubida, ...lista.filter((p) => p !== daSubida)] : lista;

  return (
    <main className="filmes-celular">
      <h1>Filmes</h1>
      <button className="botao primario subir-previa" onClick={() => entrada.current?.click()} disabled={!!subida}>
        <Icone nome="subir" tam={18} traco={2.2} />
        Subir prévia
      </button>
      <input
        ref={entrada}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(e) => {
          void subir(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className="previas-celular">
        {subida && !daSubida && (
          <div className="previa-celular subindo">
            <b>{semPdf(subida.nome)}</b>
            <span className="subida-estado">Abrindo o PDF…</span>
          </div>
        )}
        {fichas.map((p) => (
          <FichaDaPrevia
            key={p.id}
            previa={p}
            paginas={paginas[p.id]}
            passos={subida?.id === p.id ? subida.passos : null}
            abrir={() => abrir(p.id)}
          />
        ))}
      </div>
    </main>
  );
}

/**
 * A ficha de uma prévia. Lida (ou com erro), ela mostra o andamento: as páginas lidas, os prontos, os com pergunta,
 * os que estão no Trello e quando some a toda enviada. Enquanto sobe ou é lida, mostra cada página no estado dela.
 */
function FichaDaPrevia({
  previa: p,
  paginas,
  passos,
  abrir,
}: {
  previa: PreviaNaLista;
  paginas?: PaginaDaPrevia[];
  /** o passo de cada página, quando é esta tela que está subindo esta prévia */
  passos: Subida['passos'] | null;
  abrir: () => void;
}) {
  const gente = !!p.pessoas?.length && (
    <span className="gente" style={{ '--cor': corDe(p.pessoas[0].email) } as React.CSSProperties}>
      <Presentes pessoas={p.pessoas} />
      <span className="rubrica agora">{taoVendo(p.pessoas)}</span>
    </span>
  );
  if (paginas && (passos || !subidaTerminada(paginas))) {
    const ps = paginasNaSubida(paginas, passos);
    const r = resumoDaSubida(ps);
    // a que esta tela está subindo ainda não abre; a que o servidor está lendo (ou espera o resto) abre como qualquer outra
    const abre = !passos;
    return (
      <div
        className={`previa-celular subindo ${abre ? 'abre' : ''}`}
        {...(abre
          ? { role: 'button', tabIndex: 0, onClick: abrir, onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && abrir() }
          : {})}
        aria-label={abre ? `Abrir ${semPdf(p.nome)}` : undefined}
      >
        <b>{semPdf(p.nome)}</b>
        <span className="subida-estado" aria-live="polite">
          {r.texto}
          {r.podeFechar && <em>pode fechar a aba</em>}
        </span>
        <ol className="paginas-subida">
          {ps.map((g) => (
            <li key={g.numero} data-pagina={g.util} data-estado={g.estado}>
              <span className="n">pág. {g.util}</span>
              <span className={`mini-pag ${g.estado}`} style={{ '--cheio': CHEIO[g.estado] } as React.CSSProperties} />
              <span className={`est ${g.estado}`}>{g.texto}</span>
            </li>
          ))}
        </ol>
        {gente}
      </div>
    );
  }
  const a = paginas && andamentoDaPrevia(paginas);
  return (
    <button className="previa-celular" onClick={abrir}>
      <b>{semPdf(p.nome)}</b>
      <span className="linha">
        {p.paginas} {p.paginas === 1 ? 'página' : 'páginas'} · subida {p.por ? `por ${p.por} ` : ''}em {diaEMes(p.criada)}
      </span>
      {a && (
        <span className="andamento">
          <span>
            {a.lidas}/{a.total} páginas lidas
          </span>
          {(a.prontos > 0 || a.pergunta > 0) && (
            <span className="ok">
              {a.prontos} {a.prontos === 1 ? 'pronto' : 'prontos'}
            </span>
          )}
          {a.pergunta > 0 && <span className="pede">{a.pergunta} com pergunta</span>}
          {a.trello > 0 && <span>{a.trello} no Trello</span>}
        </span>
      )}
      {typeof p.diasParaApagar === 'number' && <span className="some">toda enviada, some {quandoSome(p.diasParaApagar)}</span>}
      {gente}
    </button>
  );
}
