import { useCallback, useEffect, useState } from 'react';
import { cadastrarIlha, juntarIlhas, lerIlhas, mudarIlha, removerIlha, type CadastroDasIlhas, type IlhaNova } from '../dados/armazenamento';
import { TIPOS_DE_ILHA, emOrdem, ilhasRepetidas, rotuloDaIlha, type Ilha } from '../modelo/ilhas';
import { nomeComparavel } from '../modelo/ligarPeloNome';
import { Icone } from './icones';
import { NadaNaBusca } from './pecas';

/* A aba Ilhas dos Cadastros (#124): as salas de edição, com tipo, número e nome opcional, para a coordenação escolher
   a ilha da posição numa lista. Ficam no SQLite do PROMeiro (não vão ao Teable nem ao Trello). Todos veem; a
   coordenação e os administradores cadastram e mudam (clicar na linha abre a ilha no formulário); só administradores
   removem. "AVID 46", "ILHA 46" e só "46" são a mesma sala (#165): a repetida é recusada, e as repetidas de antes da
   regra aparecem no alto da lista para um administrador juntar, depois de conferir quantas posições passam. */

/** O caminho do ícone da aba (uma tela com o pé). */
export const ICONE_DAS_ILHAS = 'M3 5h18v11H3z M8 20h8 M12 16v4';

const VAZIA: IlhaNova = { tipo: 'AVID', numero: '', nome: '' };

/** O estado da aba: a lista, quem pode o quê, o formulário (nova ou a que está sendo mudada) e as ações. */
export function useIlhas(aberta: boolean, avisar: (t: string) => void) {
  const [dados, setDados] = useState<CadastroDasIlhas | null>(null);
  const [falha, setFalha] = useState('');
  const [form, setForm] = useState<IlhaNova>(VAZIA);
  const [mudando, setMudando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [recem, setRecem] = useState('');
  const carregar = useCallback(
    () =>
      lerIlhas().then(
        (d) => (setDados(d), setFalha('')),
        (e) => setFalha(e instanceof Error ? e.message : String(e)),
      ),
    [],
  );
  useEffect(() => {
    if (aberta) void carregar();
  }, [aberta, carregar]);

  const abrir = (i: Ilha | null) => {
    setMudando(i?.id ?? null);
    setForm(i ? { tipo: i.tipo, numero: i.numero, nome: i.nome } : VAZIA);
  };
  const salvar = async () => {
    setSalvando(true);
    try {
      const i = mudando ? await mudarIlha(mudando, form) : await cadastrarIlha(form);
      setRecem(i.id);
      avisar(mudando ? `${rotuloDaIlha(i)} mudada.` : `${rotuloDaIlha(i)} cadastrada.`);
      abrir(null);
      await carregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };
  const remover = async (i: Ilha) => {
    try {
      await removerIlha(i.id);
      if (mudando === i.id) abrir(null);
      avisar(`${rotuloDaIlha(i)} removida. As posições que já tinham a ilha continuam com ela.`);
      await carregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e));
    }
  };
  /** Junta as repetidas na que fica (#165), depois da conferência na tela. */
  const juntar = async (fica: Ilha, sai: readonly Ilha[]) => {
    try {
      let posicoes = 0;
      for (const i of sai) posicoes += (await juntarIlhas(fica.id, i.id)).posicoes;
      if (mudando && sai.some((i) => i.id === mudando)) abrir(null);
      setRecem(fica.id);
      avisar(`${sai.map(rotuloDaIlha).join(' e ')} juntada na ${rotuloDaIlha(fica)}${posicoes ? ` (${posicoes === 1 ? '1 posição passou' : `${posicoes} posições passaram`})` : ''}.`);
      await carregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e));
    }
  };
  return { dados, falha, form, setForm, mudando, abrir, salvar, salvando, remover, juntar, recem };
}
type EstadoDasIlhas = ReturnType<typeof useIlhas>;

const posicoesDe = (n: number) => (n === 1 ? '1 posição' : `${n} posições`);

/**
 * As repetidas de antes da regra (#165): as que são a mesma sala, para juntar. Nada muda sem a conferência: o
 * administrador escolhe a que fica, lê quantas posições passam e só então junta.
 */
function IlhasRepetidas({ estado }: { estado: EstadoDasIlhas }) {
  const { dados, juntar } = estado;
  const [conferindo, setConferindo] = useState<{ sala: string; fica: string } | null>(null);
  const grupos = ilhasRepetidas(dados?.ilhas ?? []);
  if (!dados || !grupos.length) return null;
  const usos = (i: Ilha) => dados.usos?.[i.id] ?? 0;
  return (
    <div className="ilhas-repetidas">
      {grupos.map((g) => {
        const chave = g.map((i) => i.id).join('+');
        const fica = conferindo?.sala === chave ? g.find((i) => i.id === conferindo.fica) : undefined;
        const saem = fica ? g.filter((i) => i !== fica) : [];
        const passam = saem.reduce((n, i) => n + usos(i), 0);
        return (
          <div key={chave} className="ilha-repetida" role="group" aria-label={`${g.map(rotuloDaIlha).join(' e ')}: a mesma sala`}>
            <p>
              <span className="etiqueta-repetida">mesma sala</span> {g.map((i, k) => <span key={i.id}>{k ? (k === g.length - 1 ? ' e ' : ', ') : ''}<b>{rotuloDaIlha(i)}</b> ({posicoesDe(usos(i))})</span>)} são a mesma sala.
            </p>
            {!dados.podeRemover ? (
              <small>Um administrador junta as duas.</small>
            ) : fica ? (
              <>
                <small>
                  {passam ? `${posicoesDe(passam)} da ${saem.map(rotuloDaIlha).join(' e ')} ${passam === 1 ? 'passa' : 'passam'} para a ${rotuloDaIlha(fica)}` : `Nenhuma posição está na ${saem.map(rotuloDaIlha).join(' e ')}`}, e a {saem.map(rotuloDaIlha).join(' e ')} sai do cadastro. Os dias publicados continuam publicados.
                </small>
                <div className="acoes">
                  <button type="button" className="botao" onClick={() => setConferindo(null)}>
                    Cancelar
                  </button>
                  <button type="button" className="botao primario" onClick={() => (setConferindo(null), void juntar(fica, saem))}>
                    Juntar na {rotuloDaIlha(fica)}
                  </button>
                </div>
              </>
            ) : (
              <div className="acoes">
                {g.map((i) => (
                  <button key={i.id} type="button" className="botao" onClick={() => setConferindo({ sala: chave, fica: i.id })}>
                    Ficar com a {rotuloDaIlha(i)}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A lista das ilhas, filtrada pela busca (o rótulo, o número ou o nome). */
export function ListaDasIlhas({ estado, busca }: { estado: EstadoDasIlhas; busca: string }) {
  const { dados, falha, mudando, abrir, remover, recem } = estado;
  if (falha) return <p className="cad-falha">{falha}</p>;
  if (!dados) return <p className="cad-vazio">Carregando…</p>;
  const q = nomeComparavel(busca);
  const lista = emOrdem(dados.ilhas).filter((i) => !q || [rotuloDaIlha(i), i.nome].some((x) => nomeComparavel(x).includes(q)));
  if (!dados.ilhas.length) return <p className="cad-vazio">Nenhuma ilha cadastrada ainda.{dados.podeCadastrar ? ' Comece pelo formulário ao lado.' : ''}</p>;
  if (!lista.length) return <NadaNaBusca termo={busca} className="cad-nada" />;
  return (
    <>
      {!q && <IlhasRepetidas estado={estado} />}
      {lista.map((i) => (
        <div key={i.id} className={`item-cad item-ilha ${recem === i.id ? 'chegou' : ''} ${mudando === i.id ? 'aberta' : ''}`}>
          <div className="nome">
            {dados.podeCadastrar ? (
              <button type="button" className="botao-texto ilha-abrir" title="Mudar esta ilha" onClick={() => abrir(i)}>
                {rotuloDaIlha(i)}
              </button>
            ) : (
              rotuloDaIlha(i)
            )}
            {i.nome && <span className="ilha-nome"> {i.nome}</span>}
          </div>
          <div className="lado-cad">
            {dados.podeRemover ? (
              <button type="button" className="lixo-cad" aria-label={`Remover ${rotuloDaIlha(i)}`} title="Remover (as posições que já tinham a ilha continuam com ela)" onClick={() => void remover(i)}>
                <Icone nome="lixo" />
              </button>
            ) : (
              <span className="lixo-cad travado" title="Só administradores removem">
                <Icone nome="lixo" />
              </span>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

/** O formulário da direita: a ilha nova, ou a que está sendo mudada. */
export function FormDaIlha({ estado, desenho }: { estado: EstadoDasIlhas; desenho: React.ReactNode }) {
  const { dados, form, setForm, mudando, abrir, salvar, salvando } = estado;
  const pode = !!dados?.podeCadastrar;
  const tipos = [...new Set([...TIPOS_DE_ILHA, ...(dados?.ilhas ?? []).map((i) => i.tipo)])];
  const pronto = pode && !!form.tipo.trim() && /^\d/.test(form.numero.trim());
  return (
    <aside className="form-cad form-ilha">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pronto) void salvar();
        }}
      >
        <h2>
          <span className="bolha">{desenho}</span>
          {mudando ? 'Mudar a ilha' : 'Nova ilha'}
        </h2>
        <p className="dica">A sala de edição. A coordenação escolhe a ilha de cada posição numa lista, ao montar a pauta.</p>
        <div className="campo-cad">
          <span>Tipo</span>
          <div className="cats" role="radiogroup" aria-label="Tipo">
            {tipos.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={form.tipo === t} disabled={!pode} onClick={() => setForm({ ...form, tipo: t })}>
                {t}
              </button>
            ))}
          </div>
          <input className="entrada-cad" aria-label="Outro tipo" value={tipos.includes(form.tipo) ? '' : form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value.toUpperCase() })} placeholder="outro tipo" disabled={!pode} />
          <small>AVID 46, ILHA 46 e só 46 são a mesma sala: cadastre uma vez só.</small>
        </div>
        <label className="campo-cad">
          <span>Número</span>
          <input className="entrada-cad" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="ex.: 12" inputMode="numeric" disabled={!pode} autoFocus />
        </label>
        <label className="campo-cad">
          <span>Nome</span>
          <input className="entrada-cad" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="opcional" disabled={!pode} />
        </label>
        <p className="efeito">
          Fica no PROMeiro, não vai ao Teable nem ao Trello.
          {!pode ? <> <b>Só a coordenação e os administradores cadastram.</b></> : !dados?.podeRemover && <> <b>Só administradores removem.</b></>}
        </p>
        <div className="acoes">
          {mudando && (
            <button type="button" className="botao" onClick={() => abrir(null)}>
              Cancelar
            </button>
          )}
          <button className="botao primario" disabled={!pronto || salvando}>
            <Icone nome={mudando ? 'certo' : 'mais'} tam={15} traco={2.2} /> {salvando ? 'Gravando…' : mudando ? 'Gravar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </aside>
  );
}
