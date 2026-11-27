import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { iniciais } from '../dados/colaboracao';
import { colunasDoDia, diasDaSemana, ehDaPessoa, noArAgora, segundaDaSemana, type ColunaDoDia, type LinhaDaPauta } from '../modelo/pauta';
import { BalaoDeInfo } from './BalaoDeInfo';
import { ContaDoDia, ListaDaPauta } from './MesaDaPauta';
import { Avisos, DIAS_DA_SEMANA, partes, turnoEscrito, type AbrirClaquete } from './pecasDaPauta';

/* O Dia da Pauta da edição (#97, no desenho do #162): a fita com os dias da semana e, embaixo, cada editor numa
   coluna. A coluna de quem vê vem primeiro ("você"), depois a do que sobrou sem editor ("quem puder") e então a equipe,
   na ordem de início do turno daquele dia. No topo da coluna, o nome, o turno com a contagem "N de M" e, quando o turno
   está no ar, "no ar agora" à mão; os avisos ficam no ⚑. No celular e no tablet, as colunas rolam para o lado. */

/** A fita dos dias da semana (só no Dia): a aba do dia aberto, a bolinha laranja em hoje. */
export function FitaDosDias({ dia, hoje, ir }: { dia: string; hoje: string; ir: (d: string) => void }) {
  const fita = useRef<HTMLElement>(null);
  const dias = diasDaSemana(segundaDaSemana(dia, hoje));
  // a aba do dia aberto à vista (no celular, a fita rola para o lado)
  useLayoutEffect(() => {
    const f = fita.current;
    const atual = f?.querySelector<HTMLElement>('[aria-current="true"]');
    if (f && atual && f.scrollWidth > f.clientWidth) f.scrollLeft = Math.max(0, atual.offsetLeft - f.offsetLeft - 60);
  }, [dia]);
  return (
    <nav className="pauta-fita" aria-label="Dias da semana" ref={fita}>
      {dias.map((d) => {
        const p = partes(d);
        return (
          <button key={d} type="button" className={d === hoje ? 'hoje' : ''} aria-current={d === dia} data-dia={d} onClick={() => d !== dia && ir(d)}>
            <span className="pauta-fita-pinta" aria-hidden="true" />
            {DIAS_DA_SEMANA[p.semana]} <span className="pauta-fita-num">{`${String(p.dia).padStart(2, '0')}/${String(p.mes + 1).padStart(2, '0')}`}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Coluna({ c, dia, agora, voce, abrir, i }: { c: ColunaDoDia; dia: string; agora: number; voce: string | null | undefined; abrir: AbrirClaquete; i: number }) {
  const sobra = !c.editor;
  // o que sobrou não tem turno: "no ar agora" é só de quem edita
  const noAr = !sobra && noArAgora(dia, c.turno, agora);
  const eu = ehDaPessoa(c.editor, voce);
  const nome = c.editor || 'Sobrou · sem editor';
  return (
    <section className={`pauta-coluna desliza${eu ? ' eu' : ''}${sobra ? ' sobra sem-editor' : ''}${noAr ? ' no-ar' : ''}`} data-editor={c.editor} aria-label={c.editor || 'sem editor'} style={{ '--i': i } as CSSProperties}>
      <header className="pauta-coluna-topo">
        <span className="pauta-coluna-nome">
          <span className="pauta-avatar" aria-hidden="true">
            {c.editor ? iniciais(c.editor) : '–'}
          </span>
          <span className="pauta-nome">{nome}</span>
          {eu && <span className="pauta-mao">você</span>}
        </span>
        <span className="pauta-coluna-linha">
          <span className="pauta-turno">{sobra ? 'quem puder' : turnoEscrito(c.turno) || 'sem horário'}</span>
          {sobra ? <span className="pauta-coluna-conta">{c.itens.length}</span> : <ContaDoDia itens={c.itens} rotulo={false} />}
        </span>
        {(noAr || c.avisos.length > 0 || (!sobra && c.infos.length > 0)) && (
          <span className="pauta-coluna-linha">
            {noAr ? <span className="pauta-no-ar">no ar agora</span> : <span />}
            <span className="pauta-coluna-recados">
              {c.avisos.length > 0 && <Avisos avisos={c.avisos} rotulo={c.editor || 'sem editor'} />}
              {/* a info que não é de claquete fica na posição (#172) */}
              {!sobra && c.infos.length > 0 && <BalaoDeInfo textos={c.infos} rotulo={c.editor} />}
            </span>
          </span>
        )}
      </header>
      <div className="pauta-coluna-corpo">
        <ListaDaPauta itens={c.itens} abrir={abrir} vazio={sobra ? 'nada sobrando' : 'fila vazia'} />
      </div>
    </section>
  );
}

/**
 * As colunas do Dia: você, o que sobrou e a equipe.
 * @param linhas as linhas da semana (ficam as do dia)
 */
export function ColunasDoDia({ linhas, dia, voce, abrir, comSobra = true }: { linhas: readonly LinhaDaPauta[]; dia: string; voce: string | null | undefined; abrir: AbrirClaquete; comSobra?: boolean }) {
  const [agora, setAgora] = useState(() => Date.now());
  // o "agora" anda: o "no ar agora" a cada minuto
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(relogio);
  }, []);
  const faixa = useRef<HTMLDivElement>(null);
  const doDia = linhas.filter((l) => l.dia === dia);
  // o recado do dia (o aviso sem editor) não é da coluna do que sobrou: vai no alto, no recado
  const todas = colunasDoDia(doDia).map((c) => (c.editor ? c : { ...c, avisos: [], infos: [] }));
  const eu = todas.filter((c) => ehDaPessoa(c.editor, voce));
  const sobra = todas.find((c) => !c.editor) ?? { editor: '', turno: null, itens: [], infos: [], avisos: [] };
  // o que sobrou, só para a coordenação e os editores (#172, veOQueSobrou)
  const colunas = [...eu, ...(comSobra ? [sobra] : []), ...todas.filter((c) => c.editor && !ehDaPessoa(c.editor, voce))];
  const temPauta = doDia.some((l) => l.tipo !== 'aviso');

  // a faixa mais larga que a tela (celular, tablet): começa em você ou, sem você, no turno que está no ar
  useLayoutEffect(() => {
    const f = faixa.current;
    if (!f || f.scrollWidth <= f.clientWidth) return;
    const alvo = f.querySelector<HTMLElement>('.pauta-coluna.eu') ?? f.querySelector<HTMLElement>('.pauta-coluna.no-ar');
    f.scrollLeft = alvo ? f.scrollLeft + alvo.getBoundingClientRect().left - f.getBoundingClientRect().left - 8 : 0;
    // só quando chega o dia: o relógio não puxa a faixa de volta
  }, [dia, temPauta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!temPauta) return <p className="pauta-vazia desliza">Nada na pauta deste dia.</p>;
  return (
    <div className="pauta-faixa" ref={faixa}>
      <div className="pauta-colunas">
        {colunas.map((c, i) => (
          <Coluna key={c.editor || '(sem editor)'} c={c} dia={dia} agora={agora} voce={voce} abrir={abrir} i={i} />
        ))}
      </div>
    </div>
  );
}
