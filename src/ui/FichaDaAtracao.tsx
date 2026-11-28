import { useState } from 'react';
import type { AcervoDaFicha, ArteDaFicha } from '../dados/armazenamento';
import { SUBTIPOS_ARTE } from '../modelo/tipos';
import { Icone } from './icones';
import { ImportarNoComputador } from './ImportarAcervo';
import { chaveDeBusca } from './util';
import { NadaNaBusca } from './pecas';

/* A ficha da atração nos Cadastros: o acervo dela (as artes prontas), só para consultar. No computador, a seção Acervo
   fica no painel da direita e "Ver as N" troca a lista da esquerda pelo acervo; no celular, a ficha ocupa a tela. */


/** A cor de cada tipo na barra e na legenda; o tipo sem cor própria fica neutro e o "sem tipo", apagado. */
const COR: Record<string, string> = {
  RDP: 'var(--tinta)',
  CRT: 'var(--ultra)',
  LETT: 'var(--edicao)',
  FOTO: 'var(--producao)',
  ASSINA: 'var(--sonoplastia)',
  MOLDURA: 'var(--locutor)',
};
const corDoTipo = (tipo: string) => (tipo ? (COR[tipo] ?? 'var(--tinta3)') : 'var(--regua-forte)');
const nomeDoTipo = (tipo: string) => tipo || 'sem tipo';
/** A miniatura do tipo (a mesma da lista de artes da revisão), pela sigla ou pelo nome; sem tipo, tracejada. */
const miniDoTipo = (tipo: string) =>
  tipo ? SUBTIPOS_ARTE.find((x) => x.sigla === tipo.toUpperCase() || chaveDeBusca(x.nome) === chaveDeBusca(tipo))?.id : 'vazio';

/** Quantas linhas a lista mostra de uma vez: o resto aparece pela busca ou pelo filtro. */
const MAXIMO = 300;

/** O total e a divisão por tipo: a barra e a legenda, com o "sem tipo" em destaque. */
export function TiposDoAcervo({ acervo }: { acervo: AcervoDaFicha }) {
  return (
    <>
      <div className="barra-tipos" role="img" aria-label={acervo.porTipo.map((t) => `${nomeDoTipo(t.tipo)}: ${t.n}`).join(', ')}>
        {acervo.porTipo.map((t) => (
          <i key={t.tipo} style={{ flex: t.n, background: corDoTipo(t.tipo) }} />
        ))}
      </div>
      <div className="legenda-tipos">
        {acervo.porTipo.map((t) => (
          <span key={t.tipo} className={t.tipo ? '' : 'sem'}>
            <i style={{ background: corDoTipo(t.tipo) }} />
            {nomeDoTipo(t.tipo)}
            <b>{t.n}</b>
          </span>
        ))}
      </div>
    </>
  );
}

/** As linhas do acervo (a miniatura, a arte e o tipo), até o máximo. */
function LinhasDoAcervo({ artes, vazio }: { artes: ArteDaFicha[]; vazio: React.ReactNode }) {
  if (!artes.length) return typeof vazio === 'string' ? <p className="cad-vazio">{vazio}</p> : vazio;
  return (
    <>
      {artes.slice(0, MAXIMO).map((a) => (
        <div key={a.id} className="arte-acervo">
          <span className="mini" data-subtipo={miniDoTipo(a.tipo)} />
          <span className="t">{a.arte}</span>
          <span className={`s ${a.tipo ? '' : 'falta'}`}>{nomeDoTipo(a.tipo)}</span>
        </div>
      ))}
      {artes.length > MAXIMO && <p className="cad-vazio">E mais {artes.length - MAXIMO}: busque para achar.</p>}
    </>
  );
}

const filtrar = (artes: ArteDaFicha[], busca: string, tipo: string | null) => {
  const termo = chaveDeBusca(busca);
  return artes.filter((a) => (tipo === null || a.tipo === tipo) && (!termo || chaveDeBusca(a.arte).includes(termo)));
};

/** "Ver as N": o acervo da atração no lugar da lista de atrações, com a busca e o filtro por tipo. */
export function ListaDoAcervo({ nome, acervo, voltar }: { nome: string; acervo: AcervoDaFicha | null; voltar: () => void }) {
  const [busca, setBusca] = useState('');
  // null: todos os tipos; '' é o "sem tipo"
  const [tipo, setTipo] = useState<string | null>(null);
  const lista = acervo ? filtrar(acervo.artes, busca, tipo) : [];
  return (
    <section className="lista-cad lista-acervo" aria-label={`Acervo de ${nome}`}>
      <div className="lista-topo">
        <span className="trilha-cad">
          <button type="button" className="botao-texto" onClick={voltar}>Atrações</button>
          <Icone nome="direita" tam={13} />
          <b>{nome}</b> · acervo
        </span>
        <label className="cad-busca">
          <Icone nome="lupa" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no acervo" autoFocus />
        </label>
      </div>
      {!acervo && <p className="cad-vazio">Lendo o acervo…</p>}
      {acervo && (
        <>
          <div className="filtro-tipos cats" role="group" aria-label="Filtrar por tipo">
            <button type="button" aria-pressed={tipo === null} onClick={() => setTipo(null)}>Todos · {acervo.total}</button>
            {acervo.porTipo.map((t) => (
              <button key={t.tipo} type="button" className={t.tipo ? '' : 'sem'} aria-pressed={tipo === t.tipo} onClick={() => setTipo(tipo === t.tipo ? null : t.tipo)}>
                {nomeDoTipo(t.tipo)} · {t.n}
              </button>
            ))}
          </div>
          <LinhasDoAcervo artes={lista} vazio={busca.trim() ? <NadaNaBusca termo={busca} className="cad-nada" /> : 'Nenhuma arte deste tipo.'} />
        </>
      )}
    </section>
  );
}

/** O que a ficha diz da atração que não guarda arte própria. */
const SEM_ACERVO_PROPRIO = {
  filme: 'Sessão de filme: as artes prontas ficam no acervo de cada filme.',
  sem: 'Sem acervo: nenhuma arte fica guardada.',
} as const;

/** Enquanto o acervo não está à vista: a falha, a leitura, o servidor sem o Teable ou a atração sem acervo próprio. */
function AvisoDoAcervo({ acervo, falha }: { acervo: AcervoDaFicha | null; falha: string }) {
  if (falha) return <p className="cad-falha">{falha}</p>;
  if (!acervo) return <p className="nota-acervo">Lendo o acervo…</p>;
  if (!acervo.ligado) return <p className="nota-acervo">O acervo vem do Teable, e este servidor ainda não está ligado a ele.</p>;
  if (acervo.acervo !== 'proprio') return <p className="nota-acervo">{SEM_ACERVO_PROPRIO[acervo.acervo]}</p>;
  return null;
}

/** A seção Acervo da ficha (computador): o total, a barra por tipo e "Ver as N". */
export function SecaoAcervo({ acervo, falha, ver }: { acervo: AcervoDaFicha | null; falha: string; ver: () => void }) {
  return (
    <div className="secao-acervo">
      <div className="secao-acervo-tit">
        <span className="rot">Acervo</span>
        {acervo?.acervo === 'proprio' && acervo.total > 0 && (
          <button type="button" className="botao-texto" onClick={ver}>
            Ver as {acervo.total}
          </button>
        )}
      </div>
      <AvisoDoAcervo acervo={acervo} falha={falha} />
      {acervo?.ligado && acervo.acervo === 'proprio' && (
        <>
          <div className="total-acervo">
            {acervo.total}
            <small>{acervo.total === 1 ? 'arte pronta' : 'artes prontas'}</small>
          </div>
          {acervo.total > 0 ? <TiposDoAcervo acervo={acervo} /> : <p className="nota-acervo">Nenhuma arte no acervo ainda.</p>}
        </>
      )}
    </div>
  );
}

/** A ficha no celular: só consulta (o total, a divisão por tipo e a busca "tem essa arte?" com a lista). */
export function FichaNoCelular({ nome, acervo, falha, voltar }: { nome: string; acervo: AcervoDaFicha | null; falha: string; voltar: () => void }) {
  const [busca, setBusca] = useState('');
  const proprio = acervo?.ligado && acervo.acervo === 'proprio';
  return (
    <div className="ficha-celular">
      <p className="trilha-cad">
        <button type="button" className="botao-texto" onClick={voltar}>Atrações</button>
        <Icone nome="direita" tam={13} />
      </p>
      <h1>{nome}</h1>
      <AvisoDoAcervo acervo={acervo} falha={falha} />
      {proprio && (
        <>
          <div className="total-acervo">
            {acervo.total}
            <small>{acervo.total === 1 ? 'arte no acervo' : 'artes no acervo'}</small>
          </div>
          {acervo.total > 0 && (
            <>
              <TiposDoAcervo acervo={acervo} />
              <label className="cad-busca">
                <Icone nome="lupa" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Tem essa arte?" enterKeyHint="search" />
              </label>
              <section className="lista-cad" aria-label={`Acervo de ${nome}`}>
                <LinhasDoAcervo artes={filtrar(acervo.artes, busca, null)} vazio={<NadaNaBusca termo={busca} onde="no acervo" className="cad-nada" />} />
              </section>
            </>
          )}
          <ImportarNoComputador />
        </>
      )}
    </div>
  );
}
