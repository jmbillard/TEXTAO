import { useEffect, useRef, type ReactNode } from 'react';
import { escolhaLembradaDaPauta, lembrarNaPauta } from '../dados/armazenamento';
import { ROTULO_DA_ETAPA, codigoDasVersoes, diaEmSaoPaulo, lerVersoes, resumoDaProducao, type FiltroDaPauta, type LeituraDaPauta, type LinhaDaPauta, type ProducaoNaPauta } from '../modelo/pauta';
import { LER_ANDAMENTO_MS } from './fila';
import { Icone } from './icones';
import { MarcaTexto, tracoDe } from './pecas';
import { apelidoDaProducao, useApelidos } from '../dados/apelidos';
import { CodigoDasVersoes } from './CodigoDasVersoes';

/* As peças da Pauta da edição que a Semana (#94) e o Dia (#97) usam igual: as datas escritas, as versões da chamada
   como o código no padrão (#95), a claquete com a produção da arte (#96), o item da pauta (claquete ou tarefa), a ficha da
   claquete e, do #99, o filtro pessoal, o aviso da cópia de reserva, o resumo do administrador e a releitura. */

export const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const partes = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return { dia: d.getUTCDate(), mes: d.getUTCMonth(), semana: d.getUTCDay() };
};

/** As versões da chamada só como o código no padrão ("(AH)"), numa etiqueta; o que ele quer dizer e a grafia da
    claquete ficam na dica. O código desconhecido aparece cru. */
export function Versoes({ linha }: { linha: LinhaDaPauta }) {
  if (!linha.versoes.length) return null;
  const original = linha.texto.slice(linha.semVersao.length).trim();
  return (
    <span className="pauta-versoes">
      <CodigoDasVersoes versoes={linha.versoes} de={`da claquete ${original}`} />
    </span>
  );
}

/** A linha com o apelido do roteiro (#120) das Produções dela no lugar do texto, e as versões lidas dele: só para
    mostrar. A chave e as Produções achadas por ela ficam as da claquete da pauta; a original fica em `original`. */
function comApelidoNaPauta(l: LinhaDaPauta): LinhaDaPauta & { original?: string } {
  const apelido = l.tipo === 'claquete' ? (l.producoes ?? []).map((p) => apelidoDaProducao(p.id)).find(Boolean) : '';
  return apelido ? { ...l, texto: apelido, ...lerVersoes(apelido, l.dia), original: l.texto } : l;
}

/** "1 editor", "3 editores". */
export const contagem = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

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
export function TextoDaClaquete({ linha }: { linha: LinhaDaPauta & { original?: string } }) {
  const alta = !!resumoDaProducao(linha.producoes)?.alta;
  // com o apelido do roteiro (#120), a claquete da pauta aparece ao passar o mouse
  const texto = <span className="pauta-texto" title={linha.original ? `Claquete: ${linha.original}` : undefined}>{linha.semVersao}</span>;
  return alta ? <MarcaTexto traco={tracoDe(linha.chave ?? linha.id)}>{texto}</MarcaTexto> : texto;
}

/** Um item da pauta: a claquete (que abre a ficha), com as versões e a produção da arte; ou a tarefa, com outro visual.
    O `pe` vem no fim do card, fora do botão da claquete (na Semana com um dia por coluna, o editor e os avisos). */
export function ItemDaPauta({ linha, abrir, pe }: { linha: LinhaDaPauta; abrir: (l: LinhaDaPauta) => void; pe?: ReactNode }) {
  useApelidos();
  const l = comApelidoNaPauta(linha);
  return (
    <li className={`pauta-item pauta-${l.tipo}`} data-tipo={l.tipo} data-etapa={l.tipo === 'claquete' ? (resumoDaProducao(l.producoes)?.etapa ?? 'sem-card') : undefined}>
      {l.tipo === 'claquete' ? (
        <button type="button" className="pauta-claquete-botao" aria-haspopup="dialog" onClick={() => abrir(linha)}>
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
      {pe}
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
export function FichaDaClaquete({ linha: daPauta, linhas: todas, hoje, fechar }: { linha: LinhaDaPauta; linhas: readonly LinhaDaPauta[]; hoje: string; fechar: () => void }) {
  useApelidos();
  const linha = comApelidoNaPauta(daPauta);
  const linhas = todas.filter((l) => l.tipo === 'claquete' && (l.id === linha.id || (!!linha.chave && l.chave === linha.chave))).map(comApelidoNaPauta);
  const producoes = [...new Map(linhas.flatMap((l) => l.producoes ?? []).map((p) => [p.id, p])).values()].sort((a, b) => a.praca.localeCompare(b.praca));
  // um código por claquete: as linhas com o mesmo código no padrão contam uma vez
  const versoes = [...new Map(linhas.filter((l) => l.versoes.length).map((l) => [codigoDasVersoes(l.versoes), l])).values()];
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
            Versões na pauta:{' '}
            {versoes.map((l) => (
              <Versoes key={l.id} linha={l} />
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

/** Onde a entrada da pauta (no topo do PROMeiro) leva: a visão que a pessoa escolheu por último (#98), hoje. O endereço
    continua valendo como está: #/pauta é sempre a Semana, para o link mandado a um colega abrir igual. */
export const entradaDaPauta = (): EnderecoDaPauta => (escolhaLembradaDaPauta().visao === 'dia' ? { dia: '' } : {});

/** A Semana e o Dia (#97): a troca da visão, no topo das duas. A troca é a escolha da pessoa: o PROMeiro lembra (#98). */
export function VisaoDaPauta({ visao, semana, dia }: { visao: 'semana' | 'dia'; semana: () => void; dia: () => void }) {
  const escolher = (v: 'semana' | 'dia', ir: () => void) => {
    void lembrarNaPauta('visao', v);
    ir();
  };
  return (
    <div className="segmento pauta-visao" role="radiogroup" aria-label="Visão da pauta">
      <button type="button" role="radio" aria-checked={visao === 'semana'} onClick={() => escolher('semana', semana)}>
        Semana
      </button>
      <button type="button" role="radio" aria-checked={visao === 'dia'} onClick={() => escolher('dia', dia)}>
        Dia
      </button>
    </div>
  );
}

/* ---------- os filtros pessoais, a cópia de reserva, o resumo do administrador e a releitura (#99) ---------- */

/** "14:20" hoje; "14:20 de 26/11" em outro dia (em São Paulo). */
export function horaEscrita(iso: string) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dia = diaEmSaoPaulo(d);
  return dia === diaEmSaoPaulo() ? hora : `${hora} de ${Number(dia.slice(8))}/${dia.slice(5, 7)}`;
}

/** "Todas", "Só as minhas" (quem tem o cadastro de editor ligado ao e-mail) e "Com arte minha" (quem é designer). Só
    aparece para quem tem pelo menos um dos dois. */
export function FiltroDaPautaTela({ voce, filtro, mudar }: { voce: LeituraDaPauta['voce'] | undefined; filtro: FiltroDaPauta | null; mudar: (f: FiltroDaPauta | null) => void }) {
  const opcoes: { id: FiltroDaPauta | null; nome: string; dica: string }[] = [
    { id: null, nome: 'Todas', dica: 'A pauta inteira' },
    ...(voce?.editor ? [{ id: 'minhas' as const, nome: 'Só as minhas', dica: `Só as linhas de ${voce.editor}` }] : []),
    ...(voce?.designer ? [{ id: 'arte' as const, nome: 'Com arte minha', dica: `Só as claquetes em que ${voce.designer} está na produção da arte` }] : []),
  ];
  if (opcoes.length < 2) return null;
  return (
    <div className="segmento pauta-filtro" role="radiogroup" aria-label="Filtro da pauta">
      {opcoes.map((o) => (
        <button key={o.id ?? 'todas'} type="button" role="radio" aria-checked={filtro === o.id} title={o.dica} onClick={() => mudar(o.id)}>
          {o.nome}
        </button>
      ))}
    </div>
  );
}

/** O aviso da cópia de reserva (o banco do Teable não respondeu) e, para o administrador, o resumo discreto. */
export function SobreALeitura({ leitura }: { leitura: (LeituraDaPauta & { alteradoEm: string | null }) | null }) {
  if (!leitura) return null;
  const r = leitura.resumo;
  return (
    <>
      {leitura.origem === 'copia' && leitura.copiaEm && (
        <p className="pauta-copia" role="status">
          O banco do Teable não respondeu: esta é a cópia da pauta das {horaEscrita(leitura.copiaEm)}. A página tenta de novo a cada minuto.
        </p>
      )}
      {r && (
        <p className="pauta-resumo" aria-label="Resumo do administrador">
          <span className={r.semEditor ? 'pauta-resumo-conta falta' : 'pauta-resumo-conta'}>{contagem(r.semEditor, 'linha sem editor', 'linhas sem editor')}</span>
          <span className={r.semCard ? 'pauta-resumo-conta falta' : 'pauta-resumo-conta'}>{contagem(r.semCard, 'claquete sem card', 'claquetes sem card')}</span>
          <span>{r.alteradoEm ? `pauta alterada às ${horaEscrita(r.alteradoEm)}` : 'sem alteração registrada'}</span>
        </p>
      )}
    </>
  );
}

/** Relê a pauta a cada minuto com a aba à vista (a cadência da agenda), e de novo quando a aba volta à vista ou ganha
    o foco. */
export function useReleitura(reler: () => void) {
  useEffect(() => {
    const deNovo = () => {
      if (document.visibilityState === 'visible') reler();
    };
    const t = setInterval(deNovo, LER_ANDAMENTO_MS);
    document.addEventListener('visibilitychange', deNovo);
    window.addEventListener('focus', deNovo);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', deNovo);
      window.removeEventListener('focus', deNovo);
    };
  }, [reler]);
}
