import { useEffect, useRef, useState } from 'react';
import {
  armazenamento,
  atualizarVocabulario,
  cadastrar,
  darKey,
  lerCadastros,
  removerCadastro,
  zerarAcervo,
  type AtracaoCadastro,
  type Cadastros as DadosCadastros,
  type CampoCaminho,
  type EditorCadastro,
  type KeyCadastro,
  type RedatorCadastro,
  type TipoCadastro,
  designorarKey,
  ignorarKey,
  lerSemCadastro,
  type KeySemCadastro,
} from '../dados/armazenamento';
import { exportar, pendencias } from '../modelo/exportar';
import { chaveDaClaquete, semAcento } from '../modelo/vocabularios';
import { Icone } from './icones';
import { Marca } from './pecas';
import { plural } from './util';

/* Cadastros: o que o PROMeiro usa para reconhecer cada roteiro. Tudo vai direto para o Teable
   (e redator/editor novo também para o Trello). O que está sendo cadastrado aparece na lista como
   uma folha de rascunho, solta por cima, que assenta no lugar quando é salva. */

const ICONE_SEM = 'M4 7h11l5 5-5 5H4z M9 12h.01';

const ICONES = {
  atracoes: 'M4 7h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M8.5 3l3.5 4 3.5-4',
  redatores: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  editores:
    'M20.2 6L3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z M6.2 5.3l3.1 3.9 M12.4 3.4l3.1 4 M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
} as const;
const NOMES: Record<TipoCadastro, string> = { atracoes: 'Atrações', redatores: 'Redatores', editores: 'Editores' };
const RABISCO = 'M2 9 C 30 3, 70 4, 98 6 C 70 8, 40 10, 14 12';

function Desenho({ d, tam = 18 }: { d: string; tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Key como a pauta e o n8n escrevem: maiúsculas, sem acento. */
export const comoKey = (s: string) =>
  semAcento(s)
    .toUpperCase()
    .replace(/&/g, 'E')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const MINUSCULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'na', 'no', 'nas', 'nos', 'e', 'a', 'o', 'em', 'com']);
/** Claquete que veio do nome do arquivo está toda em maiúsculas: o nome da atração sai em caixa de título. */
const caixaDeTitulo = (s: string) =>
  s === s.toUpperCase()
    ? s.toLowerCase().replace(/\p{L}+/gu, (p, i: number) => (i > 0 && MINUSCULAS.has(p) ? p : p[0].toUpperCase() + p.slice(1)))
    : s;

/** "Festa na Praça 19/11 Rede" → "Festa na Praça": o que vem antes da data. */
export const atracaoDaClaquete = (claquete: string) =>
  caixaDeTitulo(claquete
    .replace(/^\s*rio\s+/i, '')
    .split(/\s*\(|\s+\d{1,2}\s*\/\s*\d{1,2}|\s+\d{1,2}[_ ]\d{1,2}\b/)[0]
    .replace(/\s+(sp|rede|g5|rj)$/i, '')
    .trim());

/** Prévia do caminho: as fórmulas do Teable com os campos trocados pelo que está digitado. */
export function previaDoCaminho(formula: string, valores: Record<string, string>) {
  if (!formula) return '';
  return formula
    .split('&')
    .map((p) => p.trim())
    .map((p) => {
      const aspas = /^"(.*)"$/s.exec(p);
      if (aspas) return aspas[1].replace(/\\\\/g, '\\');
      const campo = /^\{(.+)\}$/.exec(p);
      if (campo) return valores[campo[1]] || '…';
      return '…';
    })
    .join('');
}

/* ---------- pedaços ---------- */

function Abas({ aba, mudar, totais, sem }: { aba: TipoCadastro; mudar: (a: TipoCadastro) => void; totais: Record<TipoCadastro, number>; sem: { ativa: boolean; total: number; abrir: () => void } }) {
  return (
    <div className="abas-cad" role="tablist" aria-label="Cadastros">
      {(Object.keys(NOMES) as TipoCadastro[]).map((a) => (
        <button key={a} role="tab" aria-selected={aba === a && !sem.ativa} title={aba === a && !sem.ativa ? undefined : NOMES[a]} onClick={() => mudar(a)}>
          <Desenho d={ICONES[a]} />
          {aba === a && !sem.ativa ? (
            <span className="rot">
              {NOMES[a]} <b>{totais[a]}</b>
              <svg className="sub" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
                <path key={a} pathLength={1} d={RABISCO} />
              </svg>
            </span>
          ) : (
            <sup>{totais[a]}</sup>
          )}
        </button>
      ))}
      {/* as keys que aparecem nas claquetes e nenhuma atração reconhece */}
      <button role="tab" aria-selected={sem.ativa} title={sem.ativa ? undefined : 'Sem cadastro'} onClick={sem.abrir}>
        <Desenho d={ICONE_SEM} />
        {sem.ativa ? (
          <span className="rot">
            Sem cadastro <b>{sem.total}</b>
            <svg className="sub" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
              <path pathLength={1} d={RABISCO} />
            </svg>
          </span>
        ) : (
          <sup>{sem.total}</sup>
        )}
      </button>
    </div>
  );
}

/** "Ligar a…": a busca nas atrações, com "+ Nova atração" sempre no fim. */
function MenuLigar({ atracoes, ligar, nova, fechar }: { atracoes: string[]; ligar: (nome: string) => void; nova: () => void; fechar: () => void }) {
  const [busca, setBusca] = useState('');
  const [marcado, setMarcado] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const t = semAcento(busca.trim());
  const achadas = atracoes.filter((a) => !t || semAcento(a).includes(t)).slice(0, 8);
  const total = achadas.length + 1; // + Nova atração
  useEffect(() => {
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && fechar();
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [fechar]);
  useEffect(() => setMarcado(0), [busca]);
  const escolher = (k: number) => (k < achadas.length ? ligar(achadas[k]) : nova());
  return (
    <div className="escolha-nome-menu menu-ligar" ref={caixa}>
      <input
        autoFocus
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar atração"
        aria-label="Buscar atração"
        onKeyDown={(e) => {
          if (e.key === 'Escape') fechar();
          else if (e.key === 'ArrowDown') (e.preventDefault(), setMarcado((m) => Math.min(total - 1, m + 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setMarcado((m) => Math.max(0, m - 1)));
          else if (e.key === 'Enter') (e.preventDefault(), escolher(marcado));
        }}
      />
      <ul role="listbox">
        {achadas.map((a, k) => (
          <li key={a} role="option" aria-selected={k === marcado} className={k === marcado ? 'marcado' : ''} onMouseEnter={() => setMarcado(k)} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(k)}>
            {a}
          </li>
        ))}
        {!achadas.length && <li className="vazio-ligar">Nenhuma com “{busca}”</li>}
        <li role="option" aria-selected={marcado === achadas.length} className={`nova-ligar ${marcado === achadas.length ? 'marcado' : ''}`} onMouseEnter={() => setMarcado(achadas.length)} onMouseDown={(e) => e.preventDefault()} onClick={nova}>
          + Nova atração
        </li>
      </ul>
    </div>
  );
}

/** Uma key sem cadastro: quantos roteiros, as claquetes de exemplo, a atração parecida, ligar, nova e ignorar. */
function LinhaSemCadastro({ k, atracoes, ligar, nova, ignorar }: { k: KeySemCadastro; atracoes: string[]; ligar: (nome: string) => void; nova: () => void; ignorar: () => void }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="item-cad sem-cad">
      <div className="nome">
        <span className="key grande">{k.key}</span>
        <span className="qtd">{plural(k.roteiros, 'roteiro', 'roteiros')}</span>
      </div>
      <div className="lado-cad">
        {k.sugestao && (
          <button type="button" className="ligar-sug" title={`Pôr a key ${k.key} em ${k.sugestao}`} onClick={() => ligar(k.sugestao)}>
            {k.sugestao}?
          </button>
        )}
        <span className="ligar-a">
          <button type="button" className="botao-texto" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>Ligar a…</button>
          {menu && <MenuLigar atracoes={atracoes} ligar={(n) => (setMenu(false), ligar(n))} nova={() => (setMenu(false), nova())} fechar={() => setMenu(false)} />}
        </span>
      </div>
      <div className="exemplos">{k.exemplos.map((e) => <span key={e}>{e}</span>)}</div>
      <button type="button" className="ignorar-key" title="Ignorar: não é atração" aria-label={`Ignorar ${k.key}`} onClick={ignorar}>
        <Icone nome="fechar" tam={11} traco={2.4} />
      </button>
    </div>
  );
}

function Chips({ itens, mudar, rotulo, placeholder }: { itens: string[]; mudar: (k: string[]) => void; rotulo: string; placeholder: string }) {
  const [texto, setTexto] = useState('');
  const confirmar = () => {
    const k = comoKey(texto);
    if (k && !itens.includes(k)) mudar([...itens, k]);
    setTexto('');
  };
  return (
    <div className="entrada-cad chips" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
      {itens.map((k) => (
        <span key={k} className="key">
          {k}
          <button type="button" aria-label={`Tirar ${k}`} onClick={() => mudar(itens.filter((x) => x !== k))}>
            <Icone nome="fechar" tam={10} traco={2.6} />
          </button>
        </span>
      ))}
      <input
        aria-label={rotulo}
        value={texto}
        placeholder={itens.length ? '' : placeholder}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            confirmar();
          } else if (e.key === 'Backspace' && !texto && itens.length) mudar(itens.slice(0, -1));
        }}
        onBlur={confirmar}
      />
    </div>
  );
}

/** "+ key" que vira um campo ali mesmo, na linha. */
function NovaKey({ salvar }: { salvar: (k: string) => Promise<boolean> }) {
  const [aberta, setAberta] = useState(false);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const enviando = useRef(false);
  if (!aberta)
    return (
      <button type="button" className="key nova" onClick={() => setAberta(true)}>
        <Icone nome="mais" tam={11} traco={2.4} /> key
      </button>
    );
  const enviar = async () => {
    if (enviando.current) return;
    const k = comoKey(texto);
    if (!k) return setAberta(false);
    enviando.current = true;
    setSalvando(true);
    if (await salvar(k)) {
      setTexto('');
      setAberta(false);
    }
    setSalvando(false);
    enviando.current = false;
  };
  return (
    <input
      className="key editando"
      autoFocus
      disabled={salvando}
      value={texto}
      aria-label="Key nova"
      placeholder="NOVA KEY"
      onChange={(e) => setTexto(e.target.value.toUpperCase())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void enviar();
        if (e.key === 'Escape') setAberta(false);
      }}
      onBlur={() => (texto.trim() ? void enviar() : setAberta(false))}
      size={Math.max(8, texto.length + 1)}
    />
  );
}

function ChipKey({ k, recem, remover }: { k: KeyCadastro; recem: boolean; remover?: () => void }) {
  return (
    <span className={`key ${recem ? 'recem' : ''}`}>
      {k.key}
      {remover && (
        <button type="button" className="tirar-key" aria-label={`Remover a key ${k.key}`} title="Remover a key" onClick={remover}>
          <Icone nome="fechar" tam={10} traco={2.6} />
        </button>
      )}
    </span>
  );
}

/** Lixeira com confirmação na própria linha. */
function Remover({ pode, nome, remover }: { pode: boolean; nome: string; remover: () => Promise<void> }) {
  const [conferindo, setConferindo] = useState(false);
  if (!pode)
    return (
      <span className="lixo-cad travado" title="Só administradores removem">
        <Icone nome="lixo" />
      </span>
    );
  if (conferindo)
    return (
      <span className="remover-conferir">
        Remover {nome}?
        <button type="button" className="botao-texto" onClick={() => setConferindo(false)}>Não</button>
        <button type="button" className="botao-texto perigo" onClick={() => void remover()}>Remover</button>
      </span>
    );
  return (
    <button type="button" className="lixo-cad" aria-label={`Remover ${nome}`} title="Remover (o nome continua no Trello, nos cards antigos)" onClick={() => setConferindo(true)}>
      <Icone nome="lixo" />
    </button>
  );
}

/** Pacote gráfico novo: as artes da atração no acervo deixam de valer (só administradores). */
function NovoPacote({ nome, avisar }: { nome: string; avisar: (t: string) => void }) {
  const [conferindo, setConferindo] = useState(false);
  const [indo, setIndo] = useState(false);
  if (conferindo)
    return (
      <span className="remover-conferir">
        Pacote gráfico novo? As artes de {nome} deixam de valer.
        <button type="button" className="botao-texto" onClick={() => setConferindo(false)}>Não</button>
        <button
          type="button"
          className="botao-texto perigo"
          disabled={indo}
          onClick={async () => {
            setIndo(true);
            try {
              const r = await zerarAcervo(nome);
              avisar(r.zeradas ? `${nome}: ${plural(r.zeradas, 'arte deixou', 'artes deixaram')} de valer. As próximas entram como novas.` : `${nome} não tinha artes no acervo.`);
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'Não consegui trocar o pacote.');
            }
            setIndo(false);
            setConferindo(false);
          }}
        >
          Trocar
        </button>
      </span>
    );
  return (
    <button type="button" className="botao-texto pacote-cad" title="Pacote gráfico novo: as artes da atração no acervo deixam de valer" onClick={() => setConferindo(true)}>
      novo pacote
    </button>
  );
}

/** A folha de rascunho: o que está no formulário, solto por cima da lista. */
function Rascunho({ nome, categoria, keys, assentando }: { nome: string; categoria?: string; keys: string[]; assentando: boolean }) {
  return (
    <div className={`folha-rascunho ${assentando ? 'assentando' : ''}`}>
      <div className="item-cad rascunho" aria-live="polite">
        <div className="nome">
          <span className="digitando">
            {nome || ' '}
            <svg className="ibeam-cad" viewBox="0 0 12 28" aria-hidden="true">
              <path d="M2 2 Q6 2 6 6 V22 Q6 26 2 26 M10 2 Q6 2 6 6 M10 26 Q6 26 6 22 M3.5 14 H8.5" />
            </svg>
          </span>
          {categoria && <span className="cat">{categoria}</span>}
        </div>
        <div className="keys">
          {keys.map((k) => (
            <span key={k} className="key">{k}</span>
          ))}
        </div>
        <svg className="seta-form" viewBox="0 0 54 26" aria-hidden="true">
          <path pathLength={1} d="M3 19 C 14 23, 30 22, 46 10 M 38 8.5 L 47 9.5 L 44.5 18" />
        </svg>
        <span className="nota">ainda não salvo</span>
      </div>
    </div>
  );
}

/* ---------- tela ---------- */

interface Props {
  voltar: () => void;
  avisar: (t: string) => void;
  /** Abre já numa aba e, para atração, com o formulário preenchido a partir da claquete. */
  inicio?: { aba?: TipoCadastro; claquete?: string };
}

export function Cadastros({ voltar, avisar, inicio }: Props) {
  const [dados, setDados] = useState<DadosCadastros | null>(null);
  const [falha, setFalha] = useState('');
  const [aba, setAba] = useState<TipoCadastro>(inicio?.aba ?? 'atracoes');
  const [busca, setBusca] = useState('');
  const [recem, setRecem] = useState<string[]>([]);
  const [assentando, setAssentando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // a aba "Sem cadastro": as keys das claquetes que nenhuma atração reconhece (o formulário da direita é o de atração)
  const [semCad, setSemCad] = useState(false);
  const [sem, setSem] = useState<KeySemCadastro[] | null>(null);
  const [ignoradas, setIgnoradas] = useState<string[]>([]);
  const nomeAtr = useRef<HTMLInputElement>(null);
  const carregarSem = () => lerSemCadastro().then(setSem, () => setSem([]));
  useEffect(() => {
    void carregarSem();
  }, []);

  // formulários, um por aba
  const daClaquete = inicio?.claquete ? atracaoDaClaquete(inicio.claquete) : '';
  const [atr, setAtr] = useState({ nome: daClaquete, keys: daClaquete ? [comoKey(daClaquete)] : [], categoria: '', campos: {} as Record<string, string> });
  const [red, setRed] = useState({ nome: '', user: '' });
  const [edi, setEdi] = useState({ nome: '', keys: [] as string[] });

  const carregar = (renovar = false) =>
    lerCadastros(renovar).then(
      (d) => {
        setDados(d);
        setFalha('');
      },
      (e: Error) => setFalha(e.message),
    );
  useEffect(() => {
    void carregar();
  }, []);

  const marcarRecem = (ids: string[]) => {
    setRecem(ids);
    setTimeout(() => setRecem([]), 2400);
  };

  /** Atração nova: os roteiros da fila que estavam sem atração e começam com uma das keys passam a ter. */
  const reconhecerNaFila = async (nome: string, keys: string[]) => {
    let n = 0;
    try {
      await atualizarVocabulario();
      for (const r of await armazenamento.listar()) {
        if (r.meta.programa || !r.podeEditar) continue;
        const k = chaveDaClaquete(r.meta.claquete ?? '');
        if (!keys.some((key) => k === key || k.startsWith(key + ' '))) continue;
        const completo = await armazenamento.ler(r.id);
        if (!completo) continue;
        const novo = { ...completo, meta: { ...completo.meta, programa: nome } };
        novo.meta.revisar = pendencias(exportar(novo));
        await armazenamento.salvar(novo);
        n++;
      }
    } catch {
      /* reconhecer é um bônus: o cadastro já foi feito */
    }
    return n;
  };

  /** Salva o formulário da aba: a folha assenta, a lista recarrega e o item novo pisca. */
  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      let msg = '';
      let id = '';
      let depois: (() => Promise<void>) | null = null;
      if (aba === 'atracoes') {
        const r = await cadastrar<{ id: string; nome: string; keys: string[] }>('atracoes', atr);
        id = r.id;
        msg = `${r.nome} cadastrada.`;
        // reconhecer os roteiros da fila leva um tempo: acontece depois que a folha assenta
        depois = async () => {
          const n = await reconhecerNaFila(r.nome, r.keys);
          if (n) avisar(`${r.nome}: ${plural(n, 'roteiro reconhecido', 'roteiros reconhecidos')} na fila.`);
        };
      } else if (aba === 'redatores') {
        const r = await cadastrar<{ id: string; nome: string; trello: boolean }>('redatores', red);
        id = r.id;
        msg = `${r.nome} cadastrado${r.trello ? ', também no Trello' : ''}.`;
      } else {
        const r = await cadastrar<{ id: string; nome: string; trello: boolean }>('editores', edi);
        id = r.id;
        msg = `${r.nome} cadastrado${r.trello ? ', também no Trello' : ''}.`;
      }
      setAssentando(true);
      await new Promise((ok) => setTimeout(ok, 520));
      await carregar(true);
      setAssentando(false);
      if (aba === 'atracoes') setAtr({ nome: '', keys: [], categoria: '', campos: {} });
      else if (aba === 'redatores') setRed({ nome: '', user: '' });
      else setEdi({ nome: '', keys: [] });
      marcarRecem([id]);
      avisar(msg);
      void depois?.();
      void carregarSem();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui cadastrar.');
    }
    setSalvando(false);
  };

  const novaKey = (tipo: 'atracoes' | 'editores', id: string) => async (key: string) => {
    try {
      const k = await darKey(tipo, id, key);
      await carregar(true);
      marcarRecem([k.id]);
      if (tipo === 'atracoes') {
        const a = dados?.atracoes.find((x) => x.id === id);
        if (a) {
          const n = await reconhecerNaFila(a.nome, [k.key]);
          if (n) avisar(`${plural(n, 'roteiro reconhecido', 'roteiros reconhecidos')} na fila.`);
        }
      }
      return true;
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui gravar a key.');
      return false;
    }
  };
  /** Liga a key a uma atração que já existe (pelo nome) e tira a linha da lista. */
  const ligarKey = async (key: string, nome: string) => {
    const a = dados?.atracoes.find((x) => x.nome === nome);
    if (!a) return avisar(`${nome} não está nos cadastros.`);
    if (await novaKey('atracoes', a.id)(key)) {
      setSem((l) => l?.filter((x) => x.key !== key) ?? l);
      avisar(`${key} agora é de ${a.nome}.`);
    }
  };
  /** "+ Nova": o formulário da direita começa com a key. */
  const novaComKey = (key: string) => {
    setAtr({ nome: '', keys: [comoKey(key)], categoria: '', campos: {} });
    setTimeout(() => nomeAtr.current?.focus(), 0);
  };
  /** Ignorar: a linha vira "ignorada · desfazer" por alguns segundos e some. */
  const ignorar = async (key: string) => {
    try {
      await ignorarKey(key);
      setIgnoradas((l) => [...l, key]);
      setTimeout(() => {
        setIgnoradas((l) => l.filter((x) => x !== key));
        setSem((l) => l?.filter((x) => x.key !== key) ?? l);
      }, 6000);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui ignorar.');
    }
  };
  const desfazerIgnorar = async (key: string) => {
    await designorarKey(key).catch(() => {});
    setIgnoradas((l) => l.filter((x) => x !== key));
  };

  const remover = (tipo: TipoCadastro, id: string, keyId?: string) => async () => {
    try {
      await removerCadastro(tipo, id, keyId);
      await carregar(true);
      avisar(keyId ? 'Key removida.' : 'Removido. No Trello, o nome continua nos cards antigos.');
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui remover.');
    }
  };

  // lista da aba, filtrada pela busca
  const termo = semAcento(busca.trim());
  const casa = (...partes: string[]) => !termo || semAcento(partes.join(' ')).includes(termo);
  const totais = { atracoes: dados?.atracoes.length ?? 0, redatores: dados?.redatores.length ?? 0, editores: dados?.editores.length ?? 0 };
  const pode = !!dados?.podeApagar;

  // o rascunho entra na ordem alfabética
  const rascunho =
    aba === 'atracoes' ? (atr.nome || atr.keys.length ? { nome: atr.nome, categoria: atr.categoria, keys: atr.keys } : null)
    : aba === 'redatores' ? (red.nome || red.user ? { nome: red.nome, keys: red.user ? [red.user] : [] } : null)
    : edi.nome || edi.keys.length ? { nome: edi.nome, keys: edi.keys } : null;
  const comRascunho = <T extends { nome: string }>(lista: T[], render: (x: T) => React.ReactNode) => {
    const itens = lista.map((x) => ({ nome: x.nome, no: render(x) }));
    if (rascunho) {
      const pos = itens.findIndex((x) => x.nome.localeCompare(rascunho.nome || '￿', 'pt-BR') > 0);
      const folha = { nome: '', no: <Rascunho key="rascunho" nome={rascunho.nome} categoria={'categoria' in rascunho ? rascunho.categoria : undefined} keys={rascunho.keys} assentando={assentando} /> };
      itens.splice(pos < 0 ? itens.length : pos, 0, folha);
    }
    return itens.map((x) => x.no);
  };

  const listaAtracoes = (dados?.atracoes ?? []).filter((a) => casa(a.nome, a.categoria, ...a.keys.map((k) => k.key)));
  const listaRedatores = (dados?.redatores ?? []).filter((r) => casa(r.nome, r.user));
  const listaEditores = (dados?.editores ?? []).filter((e) => casa(e.nome, ...e.keys.map((k) => k.key)));
  const itemAtracao = (a: AtracaoCadastro) => (
    <div key={a.id} className={`item-cad ${recem.includes(a.id) ? 'chegou' : ''}`}>
      <div className="nome">
        {a.nome} {a.categoria && <span className="cat">{a.categoria}</span>}
      </div>
      <div className="lado-cad">
        {pode && <NovoPacote nome={a.nome} avisar={avisar} />}
        <Remover pode={pode} nome={a.nome} remover={remover('atracoes', a.id)} />
      </div>
      <div className="keys">
        {a.keys.map((k) => (
          <ChipKey key={k.id} k={k} recem={recem.includes(k.id) || recem.includes(a.id)} remover={pode ? remover('atracoes', a.id, k.id) : undefined} />
        ))}
        <NovaKey salvar={novaKey('atracoes', a.id)} />
      </div>
    </div>
  );
  const itemRedator = (r: RedatorCadastro) => (
    <div key={r.id} className={`item-cad ${recem.includes(r.id) ? 'chegou' : ''}`}>
      <div className="nome">{r.nome}</div>
      <div className="lado-cad">
        {r.trello && <span className="no-trello"><Icone nome="quadro" tam={14} /> no Trello</span>}
        <Remover pode={pode} nome={r.nome} remover={remover('redatores', r.id)} />
      </div>
      <div className="keys">{r.user && <span className={`key login ${recem.includes(r.id) ? 'recem' : ''}`}>{r.user}</span>}</div>
    </div>
  );
  const itemEditor = (e: EditorCadastro) => (
    <div key={e.id} className={`item-cad ${recem.includes(e.id) ? 'chegou' : ''}`}>
      <div className="nome">{e.nome}</div>
      <div className="lado-cad">
        {e.trello && <span className="no-trello"><Icone nome="quadro" tam={14} /> no Trello</span>}
        <Remover pode={pode} nome={e.nome} remover={remover('editores', e.id)} />
      </div>
      <div className="keys">
        {e.keys.map((k) => (
          <ChipKey key={k.id} k={k} recem={recem.includes(k.id) || recem.includes(e.id)} remover={pode ? remover('editores', e.id, k.id) : undefined} />
        ))}
        <NovaKey salvar={novaKey('editores', e.id)} />
      </div>
    </div>
  );

  const limpar = () => (aba === 'atracoes' ? setAtr({ nome: '', keys: [], categoria: '', campos: {} }) : aba === 'redatores' ? setRed({ nome: '', user: '' }) : setEdi({ nome: '', keys: [] }));
  const xLimpar = rascunho && (
    <button type="button" className="limpar-campo" title="Limpar" aria-label="Limpar o formulário" onClick={(e) => { e.preventDefault(); limpar(); }}>
      <Icone nome="fechar" tam={14} />
    </button>
  );
  const valoresCaminho = { ...atr.campos, atracao: atr.nome, categoria: atr.categoria };
  const prontoParaSalvar =
    aba === 'atracoes' ? !!atr.nome.trim() && atr.keys.length > 0 : aba === 'redatores' ? !!red.nome.trim() : !!edi.nome.trim();

  return (
    <div className="pagina cadastros">
      <header className="cad-topo">
        <button className="voltar-cad" onClick={voltar}>
          <Icone nome="voltar" tam={16} /> Fila
        </button>
        <Marca />
        <span />
      </header>
      <main className="cad">
        <h1>Cadastros</h1>
        <p className="sub">O que o PROMeiro usa para reconhecer cada roteiro. Tudo aqui vai direto para o Teable e para o Trello.</p>

        {falha && <p className="cad-falha">{falha}</p>}
        {dados && !dados.ligado && (
          <p className="cad-falha">Os cadastros vêm do Teable, e este servidor ainda não está ligado a ele (TEABLE_URL, TEABLE_TOKEN e as tabelas).</p>
        )}

        <div className="cad-grade">
          <section className="lista-cad" aria-label={semCad ? 'Sem cadastro' : NOMES[aba]}>
            <div className="lista-topo">
              <Abas
                aba={aba}
                mudar={(a) => { setAba(a); setSemCad(false); setBusca(''); }}
                totais={totais}
                sem={{ ativa: semCad, total: sem?.length ?? 0, abrir: () => { setAba('atracoes'); setSemCad(true); setBusca(''); } }}
              />
              <label className="cad-busca">
                <Icone nome="lupa" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={semCad ? 'Buscar key ou claquete' : aba === 'atracoes' ? 'Buscar atração ou key' : aba === 'redatores' ? 'Buscar redator ou login' : 'Buscar editor ou key'} />
              </label>
            </div>
            {!dados && !falha && <p className="cad-vazio">Carregando…</p>}
            {semCad && dados && sem && (() => {
              const lista = sem.filter((k) => casa(k.key, ...k.exemplos));
              const nomes = dados.atracoes.map((x) => x.nome).sort((x, y) => x.localeCompare(y, 'pt-BR'));
              if (!sem.length) return <p className="cad-vazio">Toda claquete dos últimos 90 dias tem atração.</p>;
              if (!lista.length) return <p className="cad-vazio">Nada com “{busca}”.</p>;
              return lista.map((k) =>
                ignoradas.includes(k.key) ? (
                  <div key={k.key} className="item-cad sem-cad ignorada">
                    <span><span className="key grande">{k.key}</span> ignorada</span>
                    <button type="button" className="botao-texto" onClick={() => void desfazerIgnorar(k.key)}>Desfazer</button>
                  </div>
                ) : (
                  <LinhaSemCadastro key={k.key} k={k} atracoes={nomes} ligar={(n) => void ligarKey(k.key, n)} nova={() => novaComKey(k.key)} ignorar={() => void ignorar(k.key)} />
                ),
              );
            })()}
            {semCad && !sem && <p className="cad-vazio">Procurando nas claquetes…</p>}
            {!semCad && dados && aba === 'atracoes' && comRascunho(listaAtracoes, itemAtracao)}
            {!semCad && dados && aba === 'redatores' && comRascunho(listaRedatores, itemRedator)}
            {!semCad && dados && aba === 'editores' && comRascunho(listaEditores, itemEditor)}
            {!semCad && dados && termo && !rascunho && !(aba === 'atracoes' ? listaAtracoes : aba === 'redatores' ? listaRedatores : listaEditores).length && (
              <p className="cad-vazio">Nada com “{busca}”.</p>
            )}
          </section>

          <aside className="form-cad">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void salvar();
              }}
            >
              <h2>
                <span className="bolha"><Desenho d={ICONES[aba]} /></span>
                {aba === 'atracoes' ? 'Nova atração' : aba === 'redatores' ? 'Novo redator' : 'Novo editor'}
              </h2>
              {aba === 'atracoes' && (
                <>
                  <p className="dica">
                    {inicio?.claquete && daClaquete && atr.nome === daClaquete ? (
                      <>Veio de <b>{inicio.claquete}</b>, que ninguém reconheceu.</>
                    ) : (
                      'Entra na lista que reconhece as claquetes.'
                    )}
                  </p>
                  <label className="campo-cad">
                    <span>Nome</span>
                    <span className="com-limpar"><input ref={nomeAtr} className="entrada-cad" value={atr.nome} onChange={(e) => setAtr({ ...atr, nome: e.target.value })} placeholder="Como a atração se chama" autoFocus />{xLimpar}</span>
                  </label>
                  <div className="campo-cad">
                    <span>Keys</span>
                    <Chips itens={atr.keys} mudar={(keys) => setAtr({ ...atr, keys })} rotulo="Keys" placeholder="Como começa a claquete" />
                    <small>
                      Como a atração começa na claquete.{' '}
                      {inicio?.claquete && atr.keys[0] && chaveDaClaquete(inicio.claquete).startsWith(atr.keys[0]) && (
                        <>
                          <mark>{atr.keys[0]}</mark>
                          {chaveDaClaquete(inicio.claquete).slice(atr.keys[0].length)}
                        </>
                      )}
                    </small>
                  </div>
                  {!!dados?.categorias.length && (
                    <div className="campo-cad">
                      <span>Categoria</span>
                      <div className="cats" role="radiogroup" aria-label="Categoria">
                        {dados.categorias.map((c) => (
                          <button key={c} type="button" role="radio" aria-checked={atr.categoria === c} onClick={() => setAtr({ ...atr, categoria: atr.categoria === c ? '' : c })}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!dados?.camposCaminho.length && (
                    <div className="caminhos-cad">
                      <div className="titulo">Caminhos</div>
                      {dados.camposCaminho.map((c: CampoCaminho) => (
                        <label key={c.nome} className="campo-cad">
                          <span>{c.nome.replace(/_/g, ' ')}</span>
                          {c.opcoes?.length ? (
                            <div className="cats">
                              {c.opcoes.map((o) => (
                                <button key={o} type="button" aria-pressed={atr.campos[c.nome] === o} onClick={() => setAtr({ ...atr, campos: { ...atr.campos, [c.nome]: atr.campos[c.nome] === o ? '' : o } })}>
                                  {o}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <input className="entrada-cad" value={atr.campos[c.nome] ?? ''} onChange={(e) => setAtr({ ...atr, campos: { ...atr.campos, [c.nome]: e.target.value } })} />
                          )}
                        </label>
                      ))}
                      {Object.entries(dados.formulas).filter(([, f]) => f).map(([nome, f]) => (
                        <div key={nome} className="previa-caminho">
                          <b>{nome.replace(/_win$/, '').replace(/_/g, ' ')}</b> {previaDoCaminho(f, valoresCaminho)}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {aba === 'redatores' && (
                <>
                  <p className="dica">Entra na lista do campo REDATOR do Trello e no Teable.</p>
                  <label className="campo-cad">
                    <span>Nome no card</span>
                    <span className="com-limpar"><input className="entrada-cad" value={red.nome} onChange={(e) => setRed({ ...red, nome: e.target.value })} placeholder="Como aparece no Trello" autoFocus />{xLimpar}</span>
                  </label>
                  <label className="campo-cad">
                    <span>Login ou autor do Word</span>
                    <input className="entrada-cad" value={red.user} onChange={(e) => setRed({ ...red, user: e.target.value })} placeholder="ex.: gpires" />
                    <small>O autor gravado no .docx, ou o começo do e-mail. É por ele que o PROMeiro reconhece quem escreveu.</small>
                  </label>
                </>
              )}
              {aba === 'editores' && (
                <>
                  <p className="dica">Entra na lista do campo EDITOR do Trello e no Teable.</p>
                  <label className="campo-cad">
                    <span>Nome no card</span>
                    <span className="com-limpar"><input className="entrada-cad" value={edi.nome} onChange={(e) => setEdi({ ...edi, nome: e.target.value })} placeholder="Como aparece no Trello" autoFocus />{xLimpar}</span>
                  </label>
                  <div className="campo-cad">
                    <span>Keys da pauta</span>
                    <Chips itens={edi.keys} mudar={(keys) => setEdi({ ...edi, keys })} rotulo="Keys da pauta" placeholder="Como aparece na pauta" />
                    <small>Como o nome aparece na planilha da pauta da edição.</small>
                  </div>
                </>
              )}
              <p className="efeito">
                {aba === 'atracoes'
                  ? 'Cria a atração e as keys no Teable. Os roteiros da fila que começam com essas keys são reconhecidos na hora.'
                  : 'Remover tira do PROMeiro e do Teable; no Trello o nome continua, para os cards antigos.'}
                {!pode && <> <b>Só administradores removem.</b></>}
              </p>
              <div className="acoes">
                <button className="botao primario" disabled={!prontoParaSalvar || salvando || !dados?.ligado}>
                  <Icone nome="mais" tam={15} traco={2.2} /> {salvando ? 'Cadastrando…' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      </main>
    </div>
  );
}

