import { colunasDoDia, contaDoEditor, ehDaPessoa, recadoDoDia, type LeituraDaPauta, type LinhaDaPauta } from '../modelo/pauta';
import { ForaNaPautaTela } from './ForaNaPauta';
import { BalaoDeInfo } from './BalaoDeInfo';
import { Avisos, DIAS_DA_SEMANA, ItemDaPauta, MESES, partes, relativoA, turnoEscrito, type AbrirClaquete } from './pecasDaPauta';
import { NumeroCirculado, Vazio } from './pecas';

/* A mesa do dia da Pauta da edição (#162, o mock-up aprovado): o recado do dia e, no alto, o "Minha pauta" de quem é
   editor (o turno, os avisos ⚑ e a contagem do dia), com o que sobrou sem editor e quem está fora ao lado. Quem não é
   editor vê só o que sobrou e quem está fora; o que sobrou, só a coordenação e os editores (#172). As folhas andam junto com a troca de dia ou de semana (`desliza`). */

/** "hoje, 27 de novembro", "28 de novembro". */
function diaDaFolha(hoje: string, dia: string) {
  const p = partes(dia);
  const rel = relativoA(hoje, dia);
  return `${rel ? `${rel}, ` : `${DIAS_DA_SEMANA[p.semana]}, `}${p.dia} de ${MESES[p.mes]}`;
}

/** O recado do dia (#125), da coordenação: o aviso sem editor. */
export function RecadoDoDia({ linhas, dia, hoje }: { linhas: readonly LinhaDaPauta[]; dia: string; hoje: string }) {
  const recado = recadoDoDia(linhas, dia);
  if (!recado.length) return null;
  const rel = relativoA(hoje, dia);
  const p = partes(dia);
  return (
    <aside className="pauta-recado desliza" aria-label="Recado do dia">
      <span className="rotulo">Recado do dia · {rel || `${p.dia}/${p.mes + 1}`}</span>
      {recado.map((r) => (
        <p key={r.id}>{r.texto}</p>
      ))}
      <span className="pauta-recado-assina">da coordenação</span>
    </aside>
  );
}

/** A contagem do dia: "N de M" com a arte entregue, o número virando quando muda, e uma bolinha por claquete. */
export function ContaDoDia({ itens, rotulo = true, sua = false }: { itens: readonly LinhaDaPauta[]; rotulo?: boolean; sua?: boolean }) {
  const c = contaDoEditor(itens);
  return (
    <div className="pauta-conta" aria-live="polite" aria-label={`${c.feitas} de ${c.total} com a arte entregue`}>
      <div className="pauta-conta-num">
        <span className="pauta-conta-vira" key={c.feitas}>
          {/* na Minha pauta, o número da sua tarefa vem circulado à caneta (#171) */}
          {sua ? <NumeroCirculado>{c.feitas}</NumeroCirculado> : c.feitas}
        </span>{' '}
        <em>de {c.total}</em>
      </div>
      {rotulo && <span className="pauta-conta-rot">com a arte entregue</span>}
      {c.total > 0 && (
        <div className="pauta-conta-bolinhas" aria-hidden="true">
          {c.bolinhas.map((sim, i) => (
            <i key={i} className={sim ? 'sim' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Uma lista de cards da pauta, com a cascata na entrada; vazia, a anotação à mão. */
export function ListaDaPauta({ itens, abrir, vazio, compacta = false, comProducao = true }: { itens: readonly LinhaDaPauta[]; abrir: AbrirClaquete; vazio?: string; compacta?: boolean; comProducao?: boolean }) {
  if (!itens.length) return vazio ? <Vazio className="pauta-nada">{vazio}</Vazio> : null;
  return (
    <ul className={`pauta-lista${compacta ? ' compacta' : ''}`}>
      {itens.map((l, i) => (
        <ItemDaPauta key={l.id} linha={l} abrir={abrir} compacta={compacta} comProducao={comProducao} i={i} />
      ))}
    </ul>
  );
}

/**
 * A mesa do dia.
 * @param linhas as linhas da pauta do dia (as de outros dias ficam de fora)
 * @param voce o editor ligado ao e-mail da pessoa (null: ela não é editora)
 */
export function MesaDaPauta({ linhas, dia, hoje, voce, fora, abrir, comSobra = true }: { linhas: readonly LinhaDaPauta[]; dia: string; hoje: string; voce: string | null | undefined; fora: LeituraDaPauta['fora']; abrir: AbrirClaquete; comSobra?: boolean }) {
  const doDia = linhas.filter((l) => l.dia === dia);
  const colunas = colunasDoDia(doDia);
  const sobrou = colunas.find((c) => !c.editor)?.itens ?? [];
  const lateral = (
    <div className={`pauta-lateral${comSobra ? '' : ' so-fora'}`}>
      {/* o que sobrou, só para a coordenação e os editores (#172, veOQueSobrou) */}
      {comSobra && (
        <section className="pauta-folha pauta-sobrou desliza" aria-label="Sobrou, sem editor">
          <div className="pauta-folha-topo">
            <span className="rotulo">
              Sobrou · sem editor <span className="pauta-qtd">{sobrou.length}</span>
            </span>
          </div>
          <ListaDaPauta itens={sobrou} abrir={abrir} vazio="nada sobrando" />
        </section>
      )}
      <ForaNaPautaTela fora={fora} dia={dia} />
    </div>
  );
  if (!voce) return <div className="pauta-mesa so-lateral">{lateral}</div>;
  const minha = colunas.find((c) => ehDaPessoa(c.editor, voce));
  const estaFora = (fora ?? []).some((f) => f.dia === dia && ehDaPessoa(f.editor, voce));
  return (
    <div className="pauta-mesa">
      <section className="pauta-folha pauta-minha desliza" aria-label="Minha pauta">
        <div className="pauta-minha-topo">
          <div className="pauta-minha-quem">
            <span className="rotulo">Minha pauta · {diaDaFolha(hoje, dia)}</span>
            <h2>{minha?.editor ?? voce}</h2>
            <div className="pauta-minha-meta">
              {estaFora ? <span>fora</span> : !minha ? <span>sem pauta neste dia</span> : <span>{turnoEscrito(minha.turno) || 'sem horário'}</span>}
              {minha && minha.avisos.length > 0 && <Avisos avisos={minha.avisos} rotulo={`você, ${diaDaFolha(hoje, dia)}`} />}
              {/* a info que não é de claquete fica na posição (#172) */}
              {minha && minha.infos.length > 0 && <BalaoDeInfo textos={minha.infos} rotulo={`você, ${diaDaFolha(hoje, dia)}`} />}
            </div>
          </div>
          {minha && <ContaDoDia itens={minha.itens} sua />}
        </div>
        {estaFora ? <Vazio className="pauta-nada">você está fora neste dia</Vazio> : minha ? <ListaDaPauta itens={minha.itens} abrir={abrir} vazio="nada na sua fila" /> : <Vazio className="pauta-nada">você não está na pauta deste dia</Vazio>}
      </section>
      {lateral}
    </div>
  );
}
