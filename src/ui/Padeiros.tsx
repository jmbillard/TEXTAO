import { useEffect, useState } from 'react';
import { lerPadeiros, ligarPadeiro, revogarPadeiro, type DesignerDoPadeiro, type EstadoDaChave, type Padeiro } from '../dados/armazenamento';
import { Icone } from './icones';
import './padeiros.css';
import { NadaNaBusca, NumeroCirculado } from './pecas';
import { instanteDaAgenda } from './util';

/* Aba Padeiros dos Cadastros (#137), só para administradores: os Padeiros que pediram a chave do Padeiro (um por
   usuário e por computador), com a sigla, o designer ligado e o último aviso. O pendente se liga a um designer
   cadastrado (a sigla sugere qual); o ligado troca de designer ou é revogado. A revogada não volta: o Padeiro pede
   outra chave, que chega pendente. O Padeiro ligado que pede outra chave (o mesmo usuário no mesmo computador) vira um
   pedido novo, logo acima da ligada: aprovar troca a chave (a de antes cai), recusar mantém a de antes. A chave nunca
   vem ao navegador. */

const ROTULOS: Record<EstadoDaChave, string> = { pendente: 'pendente', ligada: 'ligada', revogada: 'revogada' };

/** "sex 27/11 23h35", no padrão da agenda (#171) */
const quando = (iso: string | null) => (iso ? instanteDaAgenda(iso) : '');

/** Os Padeiros: lidos quando a pessoa é administradora (o número de pendentes vai na aba mesmo com ela fechada). */
export function usePadeiros(pode: boolean) {
  const [lista, setLista] = useState<Padeiro[] | null>(null);
  const [designers, setDesigners] = useState<DesignerDoPadeiro[]>([]);
  const [falha, setFalha] = useState('');
  const ler = () =>
    lerPadeiros().then(
      (r) => {
        setLista(r.padeiros);
        setDesigners(r.designers);
        setFalha('');
      },
      (e: Error) => setFalha(e.message),
    );
  useEffect(() => {
    if (pode) void ler();
  }, [pode]); // eslint-disable-line react-hooks/exhaustive-deps
  /** A ação, e a lista de novo (o que mudou volta do servidor, já na ordem dele). */
  const fazer = async (acao: () => Promise<unknown>) => {
    try {
      await acao();
      setFalha('');
    } catch (e) {
      setFalha(e instanceof Error ? e.message : String(e));
    }
    await ler();
  };
  return {
    lista,
    designers,
    falha,
    pendentes: lista?.filter((p) => p.estado === 'pendente').length ?? 0,
    ligar: (id: string, designer: string) => fazer(() => ligarPadeiro(id, designer)),
    revogar: (id: string) => fazer(() => revogarPadeiro(id)),
  };
}

type PropsDaLista = ReturnType<typeof usePadeiros> & { busca: string };

export function ListaDePadeiros({ lista, designers, falha, ligar, revogar, busca }: PropsDaLista) {
  const termo = busca.trim().toLowerCase();
  const casa = (p: Padeiro) => !termo || [p.usuario, p.computador, p.sigla, p.designer?.nome ?? ''].some((t) => t.toLowerCase().includes(termo));
  const vistos = (lista ?? []).filter(casa);
  return (
    <>
      {falha && <p className="cad-falha">{falha}</p>}
      {!lista && !falha && <p className="cad-vazio">Lendo os Padeiros…</p>}
      {lista && !lista.length && <p className="cad-vazio">Nenhum Padeiro pediu a chave ainda. Ele pede sozinho, na primeira vez que abre com o endereço do PROMeiro.</p>}
      {lista && !!lista.length && !vistos.length && <NadaNaBusca termo={busca} className="cad-nada" />}
      {lista && !!lista.length && !designers.length && (
        <p className="cad-falha">Nenhum designer ativo na tabela designers do Teable (a da Configuração · Pessoas): sem ele, não há a quem ligar a chave.</p>
      )}
      {vistos.map((p) => (
        <LinhaDoPadeiro key={p.id} p={p} antes={p.substitui ? (lista ?? []).find((x) => x.id === p.substitui) : undefined} designers={designers} ligar={(d) => ligar(p.id, d)} revogar={() => revogar(p.id)} />
      ))}
    </>
  );
}

function LinhaDoPadeiro({ p, antes, designers, ligar, revogar }: { p: Padeiro; antes?: Padeiro; designers: DesignerDoPadeiro[]; ligar: (designer: string) => Promise<void>; revogar: () => Promise<void> }) {
  const inicial = p.designer?.registro ?? p.sugestao?.registro ?? '';
  const [escolhido, setEscolhido] = useState(inicial);
  const [confirmando, setConfirmando] = useState(false);
  const [indo, setIndo] = useState(false);
  useEffect(() => setEscolhido(inicial), [inicial]);
  const com = (f: () => Promise<void>) => async () => {
    setIndo(true);
    await f();
    setIndo(false);
    setConfirmando(false);
  };
  const mudou = !!escolhido && escolhido !== (p.designer?.registro ?? '');
  // o designer ligado que saiu da tabela (ou ficou inativo) continua na escolha, para a linha não mentir
  const opcoes = p.designer && !designers.some((d) => d.registro === p.designer!.registro) ? [p.designer, ...designers] : designers;
  return (
    <div className={`item-cad item-pad pad-${p.estado}${p.pedidoNovo ? ' pad-novo' : ''}`} data-padeiro={p.id}>
      <div className="nome">
        <Icone nome="chave" tam={15} />
        <span className="usuario-pad">{p.usuario}</span>
        <span className="computador-pad">em {p.computador}</span>
        <span className={`estado-pad ${p.estado}`}>{ROTULOS[p.estado]}</span>
        {p.pedidoNovo && <span className="novo-pad">pedido novo do mesmo computador</span>}
      </div>
      <div className="lado-cad aviso-pad">{p.ultimoAviso ? `último aviso ${quando(p.ultimoAviso)}` : 'nenhum aviso ainda'}</div>
      <div className="detalhe-pad">
        <span>
          sigla <b className="sigla-pad">{p.sigla || '—'}</b>
        </span>
        {p.sistema && <span>{p.sistema}</span>}
        <span>pediu a chave {quando(p.criadoEm)}</span>
        {p.estado !== 'pendente' && p.mudadoPor && (
          <span>
            {p.estado === 'ligada' ? 'ligada' : 'revogada'} por {p.mudadoPor} {quando(p.mudadoEm)}
          </span>
        )}
      </div>
      {p.pedidoNovo && p.estado === 'pendente' && antes && (
        <p className="troca-pad">
          Aprovar troca a chave: a de agora{antes.designer ? `, ligada a ${antes.designer.nome},` : ''} deixa de valer. Recusar mantém a de agora.
        </p>
      )}
      {p.estado === 'revogada' ? (
        <div className="acoes-pad">
          <span className="designer-pad">{p.designer ? `era de ${p.designer.nome}` : 'não chegou a ser ligada'}</span>
          <span className="dica-pad">Para voltar, o Padeiro pede outra chave (chega pendente).</span>
        </div>
      ) : (
        <div className="acoes-pad">
          <label className="escolha-pad">
            <span>Designer</span>
            <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} disabled={indo} aria-label={`Designer de ${p.usuario} em ${p.computador}`}>
              {!escolhido && <option value="">Escolha…</option>}
              {opcoes.map((d) => (
                <option key={d.registro} value={d.registro}>
                  {d.nome}
                </option>
              ))}
            </select>
          </label>
          {p.estado === 'pendente' && p.sugestao && escolhido === p.sugestao.registro && <span className="sugestao-pad">{p.pedidoNovo ? 'o de agora' : 'pela sigla'}</span>}
          <button type="button" className="botao primario pequeno-pad" disabled={!mudou || indo} onClick={com(() => ligar(escolhido))}>
            {p.pedidoNovo ? 'Aprovar' : p.estado === 'pendente' ? 'Ligar' : 'Trocar'}
          </button>
          {p.estado === 'ligada' &&
            (confirmando ? (
              <span className="confirmar-pad" role="group" aria-label="Confirmar a revogação">
                <button type="button" className="botao perigo-pad pequeno-pad" disabled={indo} onClick={com(revogar)}>
                  Revogar a chave
                </button>
                <button type="button" className="botao-texto" onClick={() => setConfirmando(false)}>
                  cancelar
                </button>
              </span>
            ) : (
              <button type="button" className="botao-texto revogar-pad" onClick={() => setConfirmando(true)}>
                Revogar
              </button>
            ))}
          {p.estado === 'pendente' && (
            <button type="button" className="botao-texto revogar-pad" disabled={indo} onClick={com(revogar)}>
              Recusar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** O painel da direita: o que é a chave do Padeiro e o resumo dos estados. */
export function PainelDosPadeiros({ lista }: { lista: Padeiro[] | null }) {
  const n = (e: EstadoDaChave) => lista?.filter((p) => p.estado === e).length ?? 0;
  return (
    <aside className="form-cad painel-pad" aria-label="Sobre a chave do Padeiro">
      <h2>
        <span className="bolha">
          <Icone nome="chave" tam={18} />
        </span>
        Chave do Padeiro
      </h2>
      <p className="dica">
        Cada Padeiro (um usuário num computador) pede a chave sozinho, com a sigla do designer. Ela chega <b>pendente</b> e só passa a avisar o PROMeiro depois de <b>ligada</b> a um designer cadastrado. Revogada, não volta: o Padeiro pede outra.
      </p>
      {lista && (
        <ul className="contagem-pad">
          <li>
            {/* os pendentes são a tarefa de quem administra: o número circulado (#171) */}
            {n('pendente') ? <NumeroCirculado className="pad-pendentes">{n('pendente')}</NumeroCirculado> : <b>0</b>} {n('pendente') === 1 ? 'pendente' : 'pendentes'}
          </li>
          <li>
            <b>{n('ligada')}</b> {n('ligada') === 1 ? 'ligada' : 'ligadas'}
          </li>
          <li>
            <b>{n('revogada')}</b> {n('revogada') === 1 ? 'revogada' : 'revogadas'}
          </li>
        </ul>
      )}
      <p className="dica">O designer vem da tabela designers do Teable (a mesma da Configuração · Pessoas). A chave nunca aparece aqui: o PROMeiro só guarda o hash dela.</p>
    </aside>
  );
}
