import { useEffect, useRef } from 'react';
import { ROTULO_DA_ETAPA, resumoDaProducao, type LinhaDaPauta, type ProducaoNaPauta } from '../modelo/pauta';
import { Icone } from './icones';
import { MarcaTexto, tracoDe } from './pecas';

/* As peças da Pauta da edição que a Semana (#94) e o Dia (#97) usam igual: as datas escritas, as versões da chamada
   como etiquetas (#95), a claquete com a produção da arte (#96), o item da pauta (claquete ou tarefa) e a ficha da
   claquete. */

export const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const partes = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return { dia: d.getUTCDate(), mes: d.getUTCMonth(), semana: d.getUTCDay() };
};

/** As versões da chamada como etiquetas ("amanhã", "nesta sex"), cada uma com o código pequeno ao lado; o código
    desconhecido aparece cru. */
export function Versoes({ linha }: { linha: LinhaDaPauta }) {
  if (!linha.versoes.length) return null;
  const original = linha.texto.slice(linha.semVersao.length).trim();
  return (
    <span className="pauta-versoes" title={`versões da chamada: ${original}`}>
      {linha.versoes.map((v, i) =>
        v.conhecida ? (
          <span key={i} className="pauta-versao">
            {v.rotulo}
            <small>{v.codigo}</small>
          </span>
        ) : (
          <span key={i} className="pauta-versao desconhecida" title={`código ${v.codigo}: o PROMeiro não conhece`}>
            {v.codigo}
          </span>
        ),
      )}
    </span>
  );
}

/** "2 artes", "1 arte"; sem a lista, nada. */
export const artesEscritas = (n: number | null) => (n === null ? '' : `${n} ${n === 1 ? 'arte' : 'artes'}`);

/** O que o PROMeiro sabe da produção da arte da claquete (#96): a etapa, as artes, os designers e a praça; ou "sem card". */
export function ProducaoDaClaquete({ linha }: { linha: LinhaDaPauta }) {
  const r = resumoDaProducao(linha.producoes);
  if (!r) return <span className="pauta-producao sem-card">sem card</span>;
  const partes = [artesEscritas(r.artes), r.designers.join(', '), r.pracas.join(' · ')].filter(Boolean);
  return (
    <span className="pauta-producao" data-etapa={r.etapa}>
      <span className="pauta-etapa">{ROTULO_DA_ETAPA[r.etapa]}</span>
      {partes.map((p, i) => (
        <span key={i}> · {p}</span>
      ))}
    </span>
  );
}

/** O texto da claquete, com o marca-texto da prioridade ALTA da produção da arte (como na agenda). */
export function TextoDaClaquete({ linha }: { linha: LinhaDaPauta }) {
  const alta = !!resumoDaProducao(linha.producoes)?.alta;
  const texto = <span className="pauta-texto">{linha.semVersao}</span>;
  return alta ? <MarcaTexto traco={tracoDe(linha.chave ?? linha.id)}>{texto}</MarcaTexto> : texto;
}

/** Um item da pauta: a claquete (que abre a ficha), com as versões e a produção da arte; ou a tarefa, com outro visual. */
export function ItemDaPauta({ linha: l, abrir }: { linha: LinhaDaPauta; abrir: (l: LinhaDaPauta) => void }) {
  return (
    <li className={`pauta-item pauta-${l.tipo}`} data-tipo={l.tipo} data-etapa={l.tipo === 'claquete' ? (resumoDaProducao(l.producoes)?.etapa ?? 'sem-card') : undefined}>
      {l.tipo === 'claquete' ? (
        <button type="button" className="pauta-claquete-botao" aria-haspopup="dialog" onClick={() => abrir(l)}>
          <TextoDaClaquete linha={l} />
          <Versoes linha={l} />
          <ProducaoDaClaquete linha={l} />
        </button>
      ) : (
        <>
          <span className="pauta-texto">{l.semVersao}</span>
          <Versoes linha={l} />
        </>
      )}
    </li>
  );
}

/** "qua, 25/11". */
export function diaEscrito(iso: string) {
  const p = partes(iso);
  return `${DIAS_DA_SEMANA[p.semana]}, ${String(p.dia).padStart(2, '0')}/${String(p.mes + 1).padStart(2, '0')}`;
}
/** "24/11 21:46", no fuso de São Paulo. */
const instanteEscrito = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const vizinho = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * A ficha da claquete (#96), por cima da Semana ou do Dia (#97): as linhas da mesma atração com versões diferentes
 * juntas (a mesma chave), os dias em que ela aparece na pauta lida (a semana ou o dia) e a produção da arte de cada praça.
 */
export function FichaDaClaquete({ linha, linhas: todas, hoje, fechar }: { linha: LinhaDaPauta; linhas: readonly LinhaDaPauta[]; hoje: string; fechar: () => void }) {
  const linhas = todas.filter((l) => l.tipo === 'claquete' && (l.id === linha.id || (!!linha.chave && l.chave === linha.chave)));
  const producoes = [...new Map(linhas.flatMap((l) => l.producoes ?? []).map((p) => [p.id, p])).values()].sort((a, b) => a.praca.localeCompare(b.praca));
  const versoes = [...new Map(linhas.flatMap((l) => l.versoes).map((v) => [`${v.codigo.toUpperCase()}|${v.rotulo}`, v])).values()];
  const resumo = resumoDaProducao(producoes);
  const corpo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    corpo.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [fechar]);
  const relativo = (d: string) => (d === hoje ? 'hoje' : d === vizinho(hoje, -1) ? 'ontem' : d === vizinho(hoje, 1) ? 'amanhã' : '');
  const titulo = <span>{linha.semVersao}</span>;
  return (
    <div className="pauta-veu" onClick={fechar}>
      <div className="pauta-ficha" role="dialog" aria-modal="true" aria-labelledby="pauta-ficha-titulo" tabIndex={-1} ref={corpo} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="botao-texto pauta-ficha-voltar" onClick={fechar}>
          <Icone nome="voltar" tam={14} /> Pauta da edição
        </button>
        <h2 id="pauta-ficha-titulo">{resumo?.alta ? <MarcaTexto traco={tracoDe(linha.chave ?? linha.id)}>{titulo}</MarcaTexto> : titulo}</h2>
        {versoes.length > 0 && (
          <p className="pauta-ficha-versoes">
            {versoes.length} {versoes.length === 1 ? 'versão' : 'versões'} na pauta:{' '}
            {versoes.map((v, i) => (
              <span key={i} className={`pauta-versao${v.conhecida ? '' : ' desconhecida'}`}>
                {v.conhecida ? v.rotulo : v.codigo}
                {v.conhecida && <small>{v.codigo}</small>}
              </span>
            ))}
          </p>
        )}
        <p className="pauta-producao" data-etapa={resumo?.etapa ?? 'sem-card'}>
          {resumo ? <span className="pauta-etapa">{ROTULO_DA_ETAPA[resumo.etapa]}</span> : 'sem card na produção da arte'}
        </p>

        <h3>Na pauta</h3>
        <table className="pauta-ficha-tabela">
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Versão</th>
              <th scope="col">Turno</th>
              <th scope="col">Editor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className={l.dia === hoje ? 'hoje' : ''}>
                <td>
                  {diaEscrito(l.dia)} {relativo(l.dia) && <span className="pauta-dia-rel">{relativo(l.dia)}</span>}
                </td>
                <td>{l.versoes.length ? <Versoes linha={l} /> : '—'}</td>
                <td className="pauta-turno">{l.turno ? `${l.turno.inicio}${l.turno.fim ? `–${l.turno.fim}` : ''}` : '—'}</td>
                <td>{l.editor || <em>sem editor</em>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Produção da arte</h3>
        {producoes.length ? (
          <table className="pauta-ficha-tabela">
            <thead>
              <tr>
                <th scope="col">Praça</th>
                <th scope="col">Etapa</th>
                <th scope="col">Artes</th>
                <th scope="col">Designer</th>
              </tr>
            </thead>
            <tbody>
              {producoes.map((p: ProducaoNaPauta) => (
                <tr key={p.id} data-praca={p.praca}>
                  <td className="pauta-ficha-praca">{p.praca || '—'}</td>
                  <td>
                    <span className="pauta-producao" data-etapa={p.etapa}>
                      <span className="pauta-etapa">{ROTULO_DA_ETAPA[p.etapa]}</span>
                    </span>
                    {p.etapa === 'entregue' && p.entregaEm && <small className="pauta-ficha-quando">{instanteEscrito(p.entregaEm)}</small>}
                    {p.alta && <small className="pauta-ficha-quando">prioridade ALTA</small>}
                  </td>
                  <td>{p.artes ?? '—'}</td>
                  <td>{p.designers.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="pauta-ficha-sem-card">Nenhuma Produção achada pela claquete: sem card.</p>
        )}
      </div>
    </div>
  );
}

/** O endereço da Pauta: a Semana (a segunda-feira; sem ela, a de hoje) ou, com `dia`, o Dia ('' é hoje). */
export interface EnderecoDaPauta {
  semana?: string;
  dia?: string;
}

/** O endereço da pauta no hash: #/pauta, #/pauta/semana/AAAA-MM-DD, #/pauta/dia e #/pauta/dia/AAAA-MM-DD; null fora dela. */
export function enderecoDaPauta(hash: string): EnderecoDaPauta | null {
  const d = /^#\/pauta\/dia(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/.exec(hash);
  if (d) return { dia: d[1] ?? '' };
  const s = /^#\/pauta(?:\/semana\/(\d{4}-\d{2}-\d{2}))?\/?$/.exec(hash);
  return s ? { semana: s[1] } : null;
}
export const hashDaPauta = (e: EnderecoDaPauta) => (e.dia !== undefined ? `#/pauta/dia${e.dia ? `/${e.dia}` : ''}` : `#/pauta${e.semana ? `/semana/${e.semana}` : ''}`);

/** A Semana e o Dia (#97): a troca da visão, no topo das duas. */
export function VisaoDaPauta({ visao, semana, dia }: { visao: 'semana' | 'dia'; semana: () => void; dia: () => void }) {
  return (
    <div className="segmento pauta-visao" role="radiogroup" aria-label="Visão da pauta">
      <button type="button" role="radio" aria-checked={visao === 'semana'} onClick={semana}>
        Semana
      </button>
      <button type="button" role="radio" aria-checked={visao === 'dia'} onClick={dia}>
        Dia
      </button>
    </div>
  );
}
